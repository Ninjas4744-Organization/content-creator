// SCORM 1.2 lifecycle and compact, Performance-scoped learning state.
(() => {
  "use strict";
  function findAPI(start) {
    const seen = new Set();
    function parents(win) {
      for (let depth = 0; win && depth < 20 && !seen.has(win); depth++) {
        seen.add(win);
        try {
          if (typeof win.API?.LMSInitialize === "function") return win.API;
          if (win.parent === win) break;
          win = win.parent;
        } catch { break; }
      }
      return null;
    }
    const api = parents(start);
    if (api) return api;
    try { return parents(start.opener); } catch { return null; }
  }
  function timespan(seconds) {
    const centiseconds = Math.min(3599999999, Math.max(0, Math.floor(seconds * 100)));
    const pad = (n, width = 2) => String(n).padStart(width, "0");
    return `${pad(Math.floor(centiseconds / 360000), 4)}:${pad(Math.floor(centiseconds / 6000) % 60)}:${pad(Math.floor(centiseconds / 100) % 60)}.${pad(centiseconds % 100)}`;
  }
  class Session {
    constructor(config, api, clock = () => performance.now()) {
      this.config = config; this.api = api; this.clock = clock; this.started = clock();
      this.location = 0; this.visited = Array(config.slides).fill(false);
      this.watched = Array(config.bins).fill(false); this.answers = config.questions.map(() => -1);
      this.result = null; this.finished = false; this.readOnly = false; this.lastVideo = null;
      this.passScore = config.passScore;
      if (!api || api.LMSInitialize("") !== "true") throw new Error("לא נמצא חיבור פעיל למערכת הלמידה. פתחו את השיעור מתוך המטלה במערכת הלמידה.");
      this.readOnly = ["review", "browse"].includes(api.LMSGetValue("cmi.core.lesson_mode"));
      const status = api.LMSGetValue("cmi.core.lesson_status");
      const terminal = ["passed", "failed", "completed"].includes(status);
      this.restore(api.LMSGetValue("cmi.suspend_data"));
      if (terminal) {
        this.result = [Number(api.LMSGetValue("cmi.core.score.raw")) || 0, status];
        this.readOnly = true;
      } else if (this.result) {
        // An interrupted final report resumes with the same fixed result for retry.
        this.pending = true;
      }
      const mastery = api.LMSGetValue("cmi.student_data.mastery_score");
      if (mastery !== "" && Number.isFinite(Number(mastery)) && Number(mastery) >= 0 && Number(mastery) <= 100) this.passScore = Number(mastery) / 100;
    }
    restore(raw) {
      try {
        const state = JSON.parse(raw), c = this.config;
        if (!Array.isArray(state) || state.length !== 7 || state[0] !== 1 || state[1] !== c.key) return;
        const [, , location, visited, watched, answers, result] = state;
        const bits = (value, length) => typeof value === "string" && value.length === length && /^[01]*$/.test(value);
        if (!Number.isFinite(location) || location < 0 || location > (c.mode === "video" ? c.duration + 0.001 : c.slides - 1)
          || (c.mode === "slides" && !Number.isInteger(location)) || !bits(visited, c.slides) || !bits(watched, c.bins)
          || !Array.isArray(answers) || answers.length !== c.questions.length
          || answers.some((a, i) => !Number.isInteger(a) || a < -1 || a >= c.questions[i].options.length)
          || (result !== null && (!Array.isArray(result) || result.length !== 2 || !Number.isFinite(result[0]) || result[0] < 0 || result[0] > 100 || !["passed", "failed"].includes(result[1])))) return;
        this.location = c.mode === "video" ? Math.min(location, c.duration) : location; this.visited = [...visited].map(b => b === "1");
        this.watched = [...watched].map(b => b === "1"); this.answers = answers; this.result = result;
      } catch { /* Empty, damaged or older lesson state starts fresh. */ }
    }
    encode() {
      const value = JSON.stringify([1, this.config.key, Math.round(this.location * 1000) / 1000,
        this.visited.map(Number).join(""), this.watched.map(Number).join(""), this.answers, this.result]);
      if (value.length > 4096) throw new Error("מצב השיעור גדול מדי לשמירה. יש לפצל את ההדרכה.");
      return value;
    }
    progress() {
      const values = this.config.mode === "video" ? this.watched : this.visited;
      return values.filter(Boolean).length / values.length;
    }
    ready() {
      return this.progress() + 1e-9 >= (this.config.mode === "video" ? this.config.coverage : 1)
        && this.answers.every(a => a >= 0);
    }
    event(event) {
      if (this.result || this.readOnly || this.finished) return;
      const c = this.config;
      if (c.mode === "slides" && event.event === "slide" && Number.isInteger(event.index) && event.index >= 0 && event.index < c.slides) {
        this.location = event.index; this.visited[event.index] = true;
      } else if (c.mode === "video" && event.event === "video" && Number.isFinite(event.position)
        && event.position >= 0 && event.position <= c.duration + 0.5 && [0.75, 1, 1.25, 1.5, 2].includes(event.rate)
        && typeof event.playing === "boolean") {
        const now = this.clock(), previous = this.lastVideo;
        const position = Math.min(c.duration, event.position);
        if (previous && previous.playing && !previous.seeking && !event.seeking) {
          const delta = position - previous.position;
          const allowed = (now - previous.now) / 1000 * Math.max(previous.rate, event.rate) + 0.3;
          if (delta > 0 && delta <= allowed) {
            // A fixed bitmap bounds suspend_data and prevents credit for repeat viewing.
            for (let i = 0; i < c.bins; i++) {
              const midpoint = (i + 0.5) * c.duration / c.bins;
              if (midpoint >= previous.position && midpoint < position) this.watched[i] = true;
            }
          }
        }
        this.location = position; this.lastVideo = { ...event, position, now };
      }
    }
    answer(index, value) {
      if (this.result || this.finished || this.readOnly) return;
      if (Number.isInteger(index) && this.config.questions[index] && Number.isInteger(value)
        && value >= 0 && value < this.config.questions[index].options.length) this.answers[index] = value;
    }
    set(name, value) {
      if (this.api.LMSSetValue(name, String(value)) !== "true") throw new Error("מערכת הלמידה לא קיבלה את הדיווח. נסו לשמור שוב.");
    }
    save() {
      if (this.finished || this.readOnly) return;
      this.set("cmi.suspend_data", this.encode());
      this.set("cmi.core.lesson_location", this.location);
      this.set("cmi.core.session_time", timespan((this.clock() - this.started) / 1000));
      this.set("cmi.core.exit", this.result ? "" : "suspend");
      if (this.result) {
        this.config.questions.forEach((q, i) => {
          const prefix = `cmi.interactions.${i}`;
          this.set(`${prefix}.id`, `q${i + 1}`);
          this.set(`${prefix}.type`, "choice");
          this.set(`${prefix}.correct_responses.0.pattern`, q.correct.toString(36));
          this.set(`${prefix}.student_response`, this.answers[i].toString(36));
          this.set(`${prefix}.result`, this.answers[i] === q.correct ? "correct" : "wrong");
          this.set(`${prefix}.weighting`, 1);
        });
        this.set("cmi.core.score.min", 0); this.set("cmi.core.score.max", 100);
        this.set("cmi.core.score.raw", this.result[0]);
      }
      this.set("cmi.core.lesson_status", this.result ? this.result[1] : "incomplete");
      if (this.api.LMSCommit("") !== "true") throw new Error("השמירה במערכת הלמידה לא הצליחה. נסו שוב לפני סגירת השיעור.");
    }
    finish() {
      if (this.finished) return;
      if (!this.readOnly) this.save();
      if (this.api.LMSFinish("") !== "true") throw new Error("סיום הדיווח לא הצליח. נסו שוב.");
      this.finished = true;
    }
    submit() {
      if (this.finished || this.readOnly) return;
      if (!this.result) {
        if (!this.ready()) throw new Error("יש להשלים את הצפייה ולענות על כל השאלות לפני ההגשה.");
        const questions = this.config.questions;
        const fraction = questions.length ? questions.filter((q, i) => this.answers[i] === q.correct).length / questions.length : 1;
        this.result = [Math.round(fraction * 10000) / 100, fraction >= this.passScore ? "passed" : "failed"];
      }
      this.finish();
    }
  }
  globalThis.DavinciScorm = { findAPI, Session, timespan };
})();
