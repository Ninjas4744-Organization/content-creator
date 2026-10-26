// SCORM 1.2 lifecycle tests using an independent protocol fixture.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { test } = require("node:test");
const context = vm.createContext({ performance });
vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/davinci_creator/scorm_runtime.js"), "utf8"), context);
const { Session, findAPI } = context.DavinciScorm;
const config = { key: "lesson-v1", mode: "slides", slides: 3, bins: 512, duration: 100, passScore: .8, coverage: .9,
  questions: [{ options: ["A", "B"], correct: 1 }] };

function fixture(options = {}) {
  let now = 0;
  const values = { "cmi.core.lesson_mode": "normal", "cmi.core.lesson_status": "not attempted", ...options.values };
  const calls = [];
  let failCommit = false, failFinish = false, failWrite = false;
  const api = {
    LMSInitialize: () => "true", LMSGetValue: name => values[name] ?? "",
    LMSSetValue(name, value) { calls.push([name, value]); if (failWrite) return "false"; values[name] = value; return "true"; },
    LMSCommit() { calls.push(["commit"]); return failCommit ? "false" : "true"; },
    LMSFinish() { calls.push(["finish"]); return failFinish ? "false" : "true"; },
  };
  const session = new Session({ ...config, ...options.config }, api, () => now);
  return { session, values, calls, api, tick: seconds => { now += seconds * 1000; },
    failure: (commit, finish = false, write = false) => { failCommit = commit; failFinish = finish; failWrite = write; } };
}
function visit(session) { for (let i = 0; i < 3; i++) session.event({ event: "slide", index: i }); }

test("completion requires viewing and answers, reports a fixed pass once", () => {
  const f = fixture();
  assert.throws(() => f.session.submit());
  visit(f.session); assert.equal(f.session.ready(), false);
  f.session.answer(0, 1); f.tick(65.2); f.session.submit(); f.session.submit(); f.session.finish();
  assert.equal(f.values["cmi.core.lesson_status"], "passed");
  assert.equal(f.values["cmi.core.score.raw"], "100");
  assert.equal(f.values["cmi.core.session_time"], "0000:01:05.20");
  assert.equal(f.values["cmi.interactions.0.student_response"], "1");
  assert.equal(f.values["cmi.interactions.0.result"], "correct");
  assert.equal(f.calls.filter(c => c[0] === "finish").length, 1);
  assert.equal(f.calls.at(-1)[0], "finish");
});
test("wrong answers report failed and cannot be changed after a commit failure", () => {
  const f = fixture(); visit(f.session); f.session.answer(0, 0); f.failure(true);
  assert.throws(() => f.session.submit());
  assert.equal(f.session.finished, false); assert.equal(f.calls.some(c => c[0] === "finish"), false);
  f.session.answer(0, 1); f.failure(false); f.session.submit();
  assert.equal(f.values["cmi.core.lesson_status"], "failed");
  assert.equal(f.values["cmi.core.score.raw"], "0");
  assert.equal(f.values["cmi.interactions.0.result"], "wrong");
});
test("suspend resumes location, visited slides and answers; a new Performance starts empty", () => {
  const f = fixture(); f.session.event({ event: "slide", index: 2 }); f.session.answer(0, 1); f.session.finish();
  assert.equal(f.values["cmi.core.exit"], "suspend");
  assert.equal(f.values["cmi.core.lesson_status"], "incomplete");
  const resumed = fixture({ values: f.values });
  assert.equal(resumed.session.location, 2); assert.equal(resumed.session.answers[0], 1);
  assert.equal(resumed.session.progress(), 1 / 3);
  const fresh = fixture(); assert.equal(fresh.session.progress(), 0); assert.equal(fresh.session.answers[0], -1);
  const changed = fixture({ values: f.values, config: { key: "updated-content" } });
  assert.equal(changed.session.progress(), 0);
  const corrupt = fixture({ values: { "cmi.suspend_data": '[1,"lesson-v1",0,"111","bad",[],null]' } });
  assert.equal(corrupt.session.progress(), 0);
});
test("review and terminal relaunch preserve the result without writes", () => {
  for (const values of [{ "cmi.core.lesson_mode": "review" }, { "cmi.core.lesson_status": "failed", "cmi.core.score.raw": "50" }]) {
    const f = fixture({ values }); visit(f.session); f.session.answer(0, 1); f.session.save(); f.session.submit();
    assert.equal(f.calls.length, 0);
  }
});
test("video seeks do not count, repeat viewing is not duplicated, real playback resumes", () => {
  const f = fixture({ config: { mode: "video", questions: [] } });
  const video = (position, playing = true, seeking = false) => f.session.event({ event: "video", position, rate: 1, playing, seeking });
  video(0); f.tick(.1); video(99); assert.equal(f.session.progress(), 0);
  video(0, true, true); video(0);
  for (let i = 1; i <= 50; i++) { f.tick(1); video(i); }
  const progress = f.session.progress(); assert.ok(progress >= .49 && progress <= .51);
  video(0, true, true); video(0);
  for (let i = 1; i <= 50; i++) { f.tick(1); video(i); }
  assert.equal(f.session.progress(), progress);
  f.session.save(); assert.ok(f.values["cmi.suspend_data"].length < 4096);
  const resumed = fixture({ config: { mode: "video", questions: [] }, values: f.values });
  assert.equal(resumed.session.progress(), progress);
  for (let i = 51; i <= 91; i++) { f.tick(1); video(i); }
  assert.equal(f.session.ready(), true); f.session.submit();
  assert.equal(f.values["cmi.core.lesson_status"], "passed");
});
test("save/finish errors are surfaced, and the platform mastery score is used", () => {
  const f = fixture({ values: { "cmi.student_data.mastery_score": "0" } });
  assert.equal(f.session.passScore, 0); f.failure(false, false, true); assert.throws(() => f.session.save());
  f.failure(false, true); visit(f.session); f.session.answer(0, 0); assert.throws(() => f.session.submit());
  f.failure(false); f.session.submit(); assert.equal(f.values["cmi.core.lesson_status"], "passed");
});
test("resume at the video end tolerates millisecond serialization rounding", () => {
  const options = { mode: "video", duration: 175.89999999999998, questions: [] };
  const f = fixture({ config: options });
  f.session.location = options.duration;
  f.session.watched.fill(true);
  f.session.save();
  const resumed = fixture({ config: options, values: f.values });
  assert.equal(resumed.session.progress(), 1);
  assert.equal(resumed.session.location, options.duration);
  assert.equal(resumed.session.ready(), true);
});
test("API discovery handles parents, popup launches and inaccessible frames", () => {
  const f = fixture(), root = { API: f.api }; root.parent = root;
  assert.equal(findAPI({ parent: root }), f.api);
  const popup = { opener: root }; popup.parent = popup; assert.equal(findAPI(popup), f.api);
  assert.equal(findAPI({ get API() { throw new Error("cross-origin"); } }), null);
  assert.throws(() => new Session(config, null));
});
