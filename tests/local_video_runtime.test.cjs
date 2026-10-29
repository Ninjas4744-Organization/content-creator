const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const markup = fs.readFileSync(process.argv[2], 'utf8');
const source = markup.match(/<script>([\s\S]*)<\/script>/)[1];
const listeners = {};
const clip = {readyState: 4, currentTime: 7, paused: true, plays: 0,
  pause() { this.paused = true; },
  play() { this.paused = false; this.plays++; return Promise.resolve(); }};
const play = {hidden: false, closest() { return {querySelector() { return clip; }}; }};
const makeSlide = (hasVideo) => ({classList: {toggle() {}, remove() {}}, setAttribute() {},
  querySelectorAll(selector) {
    if (selector === 'video') return hasVideo ? [clip] : [];
    if (selector === '.youtube-play,.local-play') return hasVideo ? [play] : [];
    return [];
  }});
const slides = [makeSlide(true), makeSlide(false)];
const controls = Object.fromEntries(['#stage','#count','#notes','#next','#prev','#noteButton','#full'].map(id => [id,{style:{}}]));
const document = {hidden:false, documentElement:{},
  querySelector(selector) { return controls[selector]; },
  querySelectorAll(selector) {
    if (selector === '.slide') return slides;
    if (selector === '.local-play') return [play];
    if (selector === '.local-video') return [clip];
    return [];
  }, addEventListener(name, handler) { listeners[name] = handler; }};
const context = vm.createContext({document,location:{hash:'1'},innerWidth:1280,innerHeight:720,
  addEventListener(name,handler) { listeners[name] = handler; }});
vm.runInContext(source,context);
assert.equal(clip.plays,0,'Entering a slide must not autoplay with sound');
play.onclick();
assert.equal(clip.paused,false);
assert.equal(play.hidden,true);
context.show(1);
assert.equal(clip.paused,true,'Leaving the video slide must stop sound');
assert.equal(clip.currentTime,0,'Returning should offer the whole story again');
assert.equal(play.hidden,false);
context.show(0);
assert.equal(clip.plays,1,'Returning must wait for another deliberate play');
listeners.keydown({target:{tagName:'VIDEO'},key:'ArrowLeft'});
assert.equal(context.location.hash,'1','Video arrow keys must remain available for seeking');
play.onclick();document.hidden=true;listeners.visibilitychange();
assert.equal(clip.paused,true,'A hidden browser tab must pause the story');
console.log('Embedded video playback lifecycle OK');
