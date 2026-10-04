/**
 * Token Magic FX presets for conditions whose look must follow the token art itself
 * (fire inside the silhouette, smoke on the outline, electricity across the body).
 *
 * Every filterId starts with "lfd-" so Flight Deck only ever adds or removes its own filters
 * and never touches Lancer QoL's or a GM's hand-made ones.
 */
export const ART_FX_PREFIX = "lfd-";

/** Exposed: the mech glows red-hot and burns; the silhouette stays readable. */
const exposed = [
  {
    filterType: "adjustment",
    filterId: "lfd-exposed-heat",
    saturation: 1.15,
    brightness: 1.05,
    contrast: 1.1,
    gamma: 1,
    red: 1.55,
    green: 0.45,
    blue: 0.3,
    alpha: 1,
    animated: {
      brightness: { active: true, loopDuration: 1400, animType: "syncCosOscillation", val1: 0.95, val2: 1.2 },
    },
  },
  {
    filterType: "fire",
    filterId: "lfd-exposed-fire",
    // White uses the shader's own flame palette; the red adjustment below it makes it red-hot
    intensity: 2.6,
    color: 0xffffff,
    amplitude: 1.6,
    time: 0,
    blend: 2,
    fireBlend: 1,
    animated: {
      time: { active: true, speed: -0.0026, animType: "move" },
      intensity: { active: true, loopDuration: 3000, val1: 2, val2: 3.2, animType: "syncCosOscillation" },
    },
  },
  {
    filterType: "glow",
    filterId: "lfd-exposed-glow",
    outerStrength: 3,
    innerStrength: 0,
    color: 0xff2a00,
    quality: 0.5,
    padding: 12,
    animated: {
      outerStrength: { active: true, loopDuration: 1400, animType: "syncCosOscillation", val1: 2, val2: 5 },
    },
  },
];

/** Shredded: armor plating stripped away; a constant white smoke billows along the outline. */
const shredded = [
  {
    // xglow aura type 2 without discard: smoke on the contour, art left fully visible
    filterType: "xglow",
    filterId: "lfd-shredded-smoke",
    auraType: 2,
    color: 0xe4e8ee,
    thickness: 7,
    scale: 2.2,
    time: 0,
    auraIntensity: 1.1,
    subAuraIntensity: 0.5,
    threshold: 0.3,
    discard: false,
    animated: {
      time: { active: true, speed: 0.0011, animType: "move" },
      thickness: { active: true, loopDuration: 4600, animType: "cosOscillation", val1: 5, val2: 9.5 },
    },
  },
];

/**
 * Jammed: strong electricity crawling over the whole frame. Blend 2 is "screen": the bolts add
 * light and the art stays visible (blend 1 is multiply and turns the mech black).
 * Note: TMFX compiles `intensity` into the shader as a constant, so it cannot be animated.
 */
const jammed = [
  {
    filterType: "electric",
    filterId: "lfd-jammed-arcs",
    color: 0xe8f4ff,
    time: 0,
    blend: 2,
    intensity: 6,
    animated: { time: { active: true, speed: 0.0024, animType: "move" } },
  },
  {
    filterType: "glow",
    filterId: "lfd-jammed-glow",
    outerStrength: 2,
    innerStrength: 0,
    color: 0x7fc8ff,
    quality: 0.5,
    padding: 10,
    animated: {
      outerStrength: { active: true, loopDuration: 900, animType: "syncCosOscillation", val1: 1, val2: 3.5 },
    },
  },
];

/**
 * Impaired: degraded systems, clearly weaker than Jammed. Every ~3 s a surge of amber sparks
 * crawls over the frame and fades away, with a rim flare and a brief chromatic glitch, then a
 * quiet pause. All three layers share one rhythm (0.9 s surge + 2.1 s pause) so they stay in
 * step: TMFX holds each value at its loop-start during `pauseBetweenDuration`.
 *
 * The bolts fade by colour: under screen blend a black bolt is invisible, so oscillating the
 * bolt colour black -> amber -> black makes the sparks surge in and out smoothly.
 */
const SURGE = { loopDuration: 900, pauseBetweenDuration: 2100 };
const impaired = [
  {
    filterType: "electric",
    filterId: "lfd-impaired-arcs",
    color: 0x000000,
    time: 0,
    blend: 2,
    intensity: 2,
    animated: {
      time: { active: true, speed: 0.0011, animType: "move" },
      color: { active: true, animType: "colorOscillation", val1: 0x000000, val2: 0xffc24a, ...SURGE },
    },
  },
  {
    filterType: "glow",
    filterId: "lfd-impaired-glow",
    outerStrength: 0,
    innerStrength: 0,
    color: 0xffa62b,
    quality: 0.5,
    padding: 10,
    animated: { outerStrength: { active: true, animType: "cosOscillation", val1: 0, val2: 2.6, ...SURGE } },
  },
  {
    filterType: "rgbSplit",
    filterId: "lfd-impaired-glitch",
    redX: 0,
    redY: 0,
    greenX: 0,
    greenY: 0,
    blueX: 0,
    blueY: 0,
    animated: {
      redX: { active: true, animType: "cosOscillation", val1: 0, val2: -3, ...SURGE },
      blueX: { active: true, animType: "cosOscillation", val1: 0, val2: 3, ...SURGE },
    },
  },
];

/** Condition id -> preset. */
export const ART_FX = Object.freeze({
  exposed,
  shredded,
  jammed,
  impaired,
});

/** Every filterId Flight Deck may own, for cleanup. */
export const ART_FX_IDS = Object.freeze(
  Object.fromEntries(Object.entries(ART_FX).map(([id, preset]) => [id, preset.map(f => f.filterId)]))
);
