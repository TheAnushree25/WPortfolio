/**
 * The stepped clock, for scripts/work/screens.mjs (a shot with `clock: 'stepped'`).
 *
 * Injected before any of the page's own scripts, it replaces the page's clock with one the
 * capture moves: Date.now, performance.now, timers and animation frames, CSS animations, and
 * <video> playback (turned into one seek per clip frame). Time moves only on
 * `window.__clock.step(ms)`, so every frame may take as long as this machine needs to draw it
 * and the page still sees an even 30 frames a second: a WebGL film never drops its quality for
 * a slow frame, and the capture can rest the graphics chip between frames.
 *
 * It also reports a high-end graphics chip, so a page that picks its quality from the chip's
 * name renders its best, whatever this machine has. (After The Last Tempo's own recorder,
 * tools/capture/shim.js in its repository.)
 */
(() => {
  const real = {
    setTimeout: window.setTimeout.bind(window),
    dateNow: Date.now.bind(Date),
  };
  const epoch = real.dateNow();
  let now = 0;

  Date.now = () => epoch + now;
  performance.now = () => now;

  /* Timers. */
  let nextId = 1;
  const timers = new Map();
  const addTimer = (fn, ms, args, every) => {
    const id = nextId++;
    timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, args, every });
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => addTimer(fn, ms, args, 0);
  window.setInterval = (fn, ms, ...args) => addTimer(fn, ms, args, Math.max(1, Number(ms) || 1));
  window.clearTimeout = (id) => {
    timers.delete(id);
  };
  window.clearInterval = window.clearTimeout;

  /* Animation frames. */
  const frames = new Map();
  window.requestAnimationFrame = (callback) => {
    const id = nextId++;
    frames.set(id, callback);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    frames.delete(id);
  };

  /* Video: playback becomes explicit seeks, one per clip frame. */
  const CLIP_FPS = 30;
  const media = HTMLMediaElement.prototype;
  const realPlay = media.play;
  const realPause = media.pause;
  const pausedProp = Object.getOwnPropertyDescriptor(media, 'paused');
  const videos = new Set();
  media.play = function play() {
    if (!(this instanceof HTMLVideoElement)) return realPlay.call(this);
    this.__playing = true;
    videos.add(this);
    return Promise.resolve();
  };
  media.pause = function pause() {
    if (!(this instanceof HTMLVideoElement)) return realPause.call(this);
    this.__playing = false;
    videos.add(this);
  };
  Object.defineProperty(media, 'paused', {
    configurable: true,
    get() {
      return this instanceof HTMLVideoElement ? !this.__playing : pausedProp.get.call(this);
    },
  });
  // Without this callback three.js refreshes a video texture on every render, which is what's wanted.
  delete HTMLVideoElement.prototype.requestVideoFrameCallback;

  const seekTo = (video, time) =>
    new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        video.removeEventListener('seeked', finish);
        resolve();
      };
      video.addEventListener('seeked', finish);
      video.currentTime = time;
      real.setTimeout(finish, 4000);
    });

  async function advanceVideos(dt) {
    for (const video of [...videos]) {
      if (!video.src && !video.currentSrc) {
        videos.delete(video);
        continue;
      }
      if (video.__playing && video.duration) {
        // Pick up a jump the page made itself, such as restarting a clip or ending a scrub.
        if (video.__vt === undefined || Math.abs(video.currentTime - video.__lastSet) > 0.002) video.__vt = video.currentTime;
        video.__vt += dt / 1000;
        if (video.__vt >= video.duration) video.__vt = video.loop ? video.__vt - video.duration : video.duration - 0.001;
        const frame = Math.min(Math.floor(video.__vt * CLIP_FPS), Math.floor(video.duration * CLIP_FPS) - 1);
        if (frame !== video.__frame) {
          video.__frame = frame;
          const target = (frame + 0.5) / CLIP_FPS;
          await seekTo(video, target);
          video.__lastSet = target;
        }
      }
      // The page may have asked for a seek of its own (a scrub): don't draw until it has landed.
      for (let guard = 0; video.seeking && guard < 400; guard++) await new Promise((resolve) => real.setTimeout(resolve, 5));
    }
  }

  /* CSS transitions and animations follow the same clock. */
  function syncCss() {
    for (const animation of document.getAnimations()) {
      if (animation.__start === undefined) {
        animation.__start = now;
        animation.pause();
      }
      const t = now - animation.__start;
      const end = animation.effect ? animation.effect.getComputedTiming().endTime : Infinity;
      if (end !== Infinity && t >= end) animation.finish();
      else animation.currentTime = t;
    }
  }

  const realTick = () => new Promise((resolve) => real.setTimeout(resolve, 0));

  window.__clock = {
    get now() {
      return now;
    },
    /** Moves the page on by `dt` milliseconds: its clips, its timers, one animation frame, its CSS. */
    async step(dt) {
      now += dt;
      await advanceVideos(dt);
      // Timers due by now, earliest first. A timer may add another that is also due.
      for (let guard = 0; guard < 2000; guard++) {
        let first = null;
        let firstId = null;
        for (const [id, timer] of timers) if (timer.at <= now && (!first || timer.at < first.at)) [first, firstId] = [timer, id];
        if (!first) break;
        if (first.every) first.at += first.every;
        else timers.delete(firstId);
        try {
          first.fn(...first.args);
        } catch (error) {
          console.error('[stepped clock timer]', error);
        }
      }
      const due = [...frames.values()];
      frames.clear();
      for (const callback of due) {
        try {
          callback(now);
        } catch (error) {
          console.error('[stepped clock frame]', error);
        }
      }
      // Let React and any promises settle, then bring CSS to the same instant.
      await realTick();
      await realTick();
      syncCss();
      return now;
    },
  };

  /* Report a high-end graphics chip, so the page picks its best quality. */
  const wrap = (Context) => {
    if (!Context) return;
    const getParameter = Context.prototype.getParameter;
    Context.prototype.getParameter = function (parameter) {
      const info = this.getExtension('WEBGL_debug_renderer_info');
      if (info && parameter === info.UNMASKED_RENDERER_WEBGL) return 'NVIDIA GeForce RTX (capture)';
      return getParameter.call(this, parameter);
    };
  };
  wrap(window.WebGLRenderingContext);
  wrap(window.WebGL2RenderingContext);
})();
