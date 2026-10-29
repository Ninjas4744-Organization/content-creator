// Progress and resume events for the embedded SCORM slide player.
(() => {
  if (window.parent === window) return;
  const send = (detail) => window.parent.postMessage({ type: "davinci-learning", ...detail }, location.origin);
  const video = document.querySelector("video");
  let reportCurrent;
  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    if (event.data?.type === "davinci-progress-request") reportCurrent?.();
    if (event.data?.type === "davinci-restore" && window.DAVINCI_MANAGED_PROGRESS) {
      if (video && Number.isFinite(event.data.position) && event.data.position >= 0) {
        const restore = () => {
          video.currentTime = Math.min(video.duration || 0, event.data.position);
          window.parent.postMessage({ type: "davinci-restored" }, location.origin);
          reportCurrent?.();
        };
        if (video.readyState >= 1) restore();
        else video.addEventListener("loadedmetadata", restore, { once: true });
      } else if (!video && Number.isInteger(event.data.index)) {
        window.show?.(event.data.index);
        window.parent.postMessage({ type: "davinci-restored" }, location.origin);
        reportCurrent?.();
      }
    }
  });
  if (video) {
    let last = -Infinity;
    const report = (force = false) => {
      if (!Number.isFinite(video.duration)) return;
      if (!force && performance.now() - last < 4000) return;
      last = performance.now();
      send({ event: "video", position: video.currentTime, rate: video.playbackRate, playing: !video.paused && !video.ended, seeking: video.seeking });
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
