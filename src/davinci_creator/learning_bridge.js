// Progress only. The host verifies the frame, and the LTI service calculates results.
(() => {
  if (window.parent === window) return;
  const send = (detail) => window.parent.postMessage({ type: "davinci-learning", ...detail }, location.origin);
  const video = document.querySelector("video");
  let reportCurrent;
  window.addEventListener("message", (event) => {
    if (event.source === window.parent && event.origin === location.origin && event.data?.type === "davinci-progress-request") reportCurrent?.();
  });
  if (video) {
    let last = -Infinity;
    const report = (force = false) => {
      if (!Number.isFinite(video.duration)) return;
      if (!force && performance.now() - last < 4000) return;
      last = performance.now();
      send({ event: "video", position: video.currentTime, rate: video.playbackRate, playing: !video.paused && !video.ended });
    };
    video.addEventListener("timeupdate", () => report());
    reportCurrent = () => report(true);
    for (const event of ["loadedmetadata", "play", "pause", "seeking", "seeked", "ended", "ratechange"]) {
      video.addEventListener(event, () => report(true));
    }
  } else {
    const slides = [...document.querySelectorAll(".slide")];
    if (!slides.length) return;
    let last = -1;
    const report = () => {
      const index = slides.findIndex((slide) => slide.classList.contains("active"));
      if (index >= 0 && index !== last) { last = index; send({ event: "slide", index }); }
    };
    new MutationObserver(report).observe(document.querySelector("#stage"), { subtree: true, attributes: true, attributeFilter: ["class"] });
    reportCurrent = () => { last = -1; report(); };
    report();
  }
})();
