/**
 * The damage effects' clock. Normally real time; `setScale(0.1)` plays the effects (timers,
 * steam) at a tenth of the speed for inspecting or recording them. CSS keeps pace if the
 * browser's animation rate is slowed to match (DevTools > Animations, or CDP
 * Animation.setPlaybackRate).
 *
 * game.modules.get("lancer-flight-deck").api.damageClock.setScale(0.1)
 */
let scale = 1;
let realBase = 0;
let virtualBase = 0;

export const damageClock = {
  get scale() {
    return scale;
  },

  setScale(next) {
    const s = Number(next);
    if (!(s > 0)) return;
    virtualBase = this.now();
    realBase = performance.now();
    scale = s;
  },

  /** Effect time in ms (advances at `scale` times real time). */
  now() {
    return virtualBase + (performance.now() - realBase) * scale;
  },

  /** setTimeout, in effect time. */
  after(fn, ms = 0) {
    return setTimeout(fn, Math.max(0, ms) / scale);
  },
};
