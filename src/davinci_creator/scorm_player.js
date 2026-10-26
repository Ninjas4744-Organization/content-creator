(() => {
  "use strict";
  const config = JSON.parse(document.querySelector("#scorm-config").textContent);
  const frame = document.querySelector("#lesson"), submit = document.querySelector("#submit");
  const video = document.querySelector("#lessonVideo");
  const save = document.querySelector("#save"), feedback = document.querySelector("#feedback");
  const connection = document.querySelector("#connection");
  let session, connected = false;
  function error(reason) {
    connection.dataset.error = "true";
    connection.textContent = reason.message || String(reason);
  }
  function saved() {
    connection.dataset.error = "false";
    connection.textContent = "ההתקדמות הועברה למערכת הלמידה.";
  }
  try {
    session = new DavinciScorm.Session(config, DavinciScorm.findAPI(window));
    connected = true;
  } catch (reason) { error(reason); }
  let mediaReady = false, restoreLocation = session?.location ?? 0;
  const pass = Math.round((session?.passScore ?? config.passScore) * 100);
  document.querySelector("#requirements").textContent =
    (config.mode === "video" ? `יש לצפות ב־${Math.round(config.coverage * 100)}% מהסרטון.` : "יש לעבור בכל השקפים.")
    + (config.questions.length ? ` ענו על כל השאלות. ציון המעבר: ${pass}. ההגשה סופית לביצוע זה.` : " לאחר הצפייה, הגישו אישור סיום.");
  function render() {
    const fraction = session?.progress() || 0;
    document.querySelector("#progress").value = fraction;
    document.querySelector("#progressText").textContent = `התקדמות בצפייה: ${Math.floor(fraction * 100)}%`;
    submit.disabled = !connected || session.finished || session.readOnly || !(session.result || session.ready());
    submit.textContent = session?.result && !session.finished && !session.readOnly ? "ניסיון נוסף לשליחת התוצאה" : "הגשת התוצאה וסיום";
    save.disabled = !connected || session.finished || session.readOnly || Boolean(session.result);
    document.querySelectorAll("#questions input").forEach(input => { input.disabled = !connected || Boolean(session.result) || session.readOnly; });
    if (session?.readOnly) connection.textContent = "מצב צפייה בלבד · תוצאות הביצוע אינן משתנות.";
    if (session?.result && (session.finished || session.readOnly)) {
      const [score, status] = session.result;
      document.querySelector("#result").textContent = `ציון: ${score} · ${status === "failed" ? "לא הושג ציון המעבר" : "השיעור הושלם בהצלחה"}`;
    }
  }
  function persist() {
    if (!session || session.finished || session.readOnly || session.result) return;
    try { session.save(); saved(); } catch (reason) { error(reason); }
  }
  config.questions.forEach((q, index) => {
    const field = document.createElement("fieldset"), legend = document.createElement("legend");
    legend.textContent = `${index + 1}. ${q.question}`; field.append(legend);
    q.options.forEach((option, value) => {
      const label = document.createElement("label"), input = document.createElement("input"), text = document.createElement("span");
      input.type = "radio"; input.name = `q${index}`; input.value = String(value);
      input.checked = session?.answers[index] === value; text.textContent = option;
      input.addEventListener("change", () => { session?.answer(index, value); persist(); render(); });
      label.append(input, text); field.append(label);
    });
    document.querySelector("#questions").append(field);
  });
  function restoreFrame() {
    if (!session || !frame) return;
    mediaReady = false;
    frame.contentWindow?.postMessage({ type: "davinci-restore", position: restoreLocation, index: restoreLocation }, location.origin);
  }
  frame?.addEventListener("load", restoreFrame);
  window.addEventListener("message", event => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin) return;
    if (event.data?.type === "davinci-restored") { mediaReady = true; return; }
    if (!mediaReady || event.data?.type !== "davinci-learning") return;
    session?.event(event.data); restoreLocation = session?.location ?? restoreLocation; render();
  });
  if (video) {
    const chapter = document.querySelector("#chapter");
    config.chapters.forEach((entry, index) => {
      const option = document.createElement("option");
      option.value = String(index); option.textContent = entry.title; chapter.append(option);
    });
    const report = () => {
      session?.event({ event: "video", position: video.currentTime, rate: video.playbackRate,
        playing: !video.paused && !video.ended, seeking: video.seeking });
      const index = config.chapters.findLastIndex(entry => entry.start <= video.currentTime + 0.02);
      if (index >= 0) chapter.value = String(index);
      render();
    };
    const restore = () => { video.currentTime = Math.min(video.duration || 0, restoreLocation); report(); };
    video.addEventListener("loadedmetadata", restore, { once: true });
    if (video.readyState >= 1) restore();
    for (const event of ["timeupdate", "play", "pause", "seeking", "seeked", "ended", "ratechange"]) video.addEventListener(event, report);
    chapter.addEventListener("change", () => { video.currentTime = config.chapters[Number(chapter.value)].start; });
    document.querySelector("#speed").addEventListener("change", event => { video.playbackRate = Number(event.target.value); });
  }
  document.querySelector("#assessment").addEventListener("submit", event => {
    event.preventDefault();
    if (!session || submit.disabled) return;
    try {
      session.submit();
      feedback.textContent = "הדיווח הועבר לנגן של מערכת הלמידה. אפשר לחזור לקורס.";
      saved();
      const explanations = document.querySelector("#explanations"); explanations.replaceChildren();
      config.questions.forEach((q, i) => {
        const p = document.createElement("p"); p.className = "result-detail";
        p.textContent = `${i + 1}. ${session.answers[i] === q.correct ? "תשובה נכונה." : "התשובה הנכונה: " + q.options[q.correct] + "."} ${q.explanation || ""}`;
        explanations.append(p);
      });
    } catch (reason) { error(reason); feedback.textContent = "התוצאה נקבעה. נסו לשלוח אותה שוב."; }
    render();
  });
  save.addEventListener("click", persist);
  setInterval(persist, 10000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") persist(); });
  window.addEventListener("pagehide", event => {
    if (event.persisted || !session) return;
    try { session.finish(); } catch (reason) { error(reason); }
  });
  if (session) { persist(); restoreFrame(); }
  render();
})();
