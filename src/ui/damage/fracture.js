/**
 * Procedural glass fractures for the panel. Pure geometry, no DOM: everything here runs in
 * Node for the tests.
 *
 * Each structure point a mech loses adds one fracture. A fracture is an impact on the bezel
 * with a spider-web of short spokes and rings, a few faceted glass shards around it, and main
 * cracks that run inward and branch. Fractures are seeded from the mech's uuid and their
 * index, so a mech always shows the same damage (across reloads and re-renders), and
 * different mechs crack differently.
 *
 * Impacts sit on the panel's edges and the cracks stop short of its middle, where the big
 * readouts are. Timings (delay/dur, in ms) drive the "crack racing across the glass" reveal.
 */

/** FNV-1a: string -> 32-bit seed. */
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Mulberry32: small, fast, good enough for visuals. Returns () => [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Where each successive fracture lands: which edge, and where along it (0-1). They
 * alternate sides and spread down the panel so damage reads as accumulating, not stacking.
 */
export const IMPACT_SLOTS = [
  { side: "right", at: 0.3 },
  { side: "left", at: 0.62 },
  { side: "right", at: 0.84 },
  { side: "left", at: 0.2 },
  { side: "bottom", at: 0.55 },
  { side: "top", at: 0.35 },
];

const INWARD = { right: Math.PI, left: 0, bottom: -Math.PI / 2, top: Math.PI / 2 };

/** Crack propagation speed (px per ms). Real glass is far faster; this is for the eye. */
const SPEED = 0.38;
/** How far from the far edge a crack may reach, as a fraction of the panel width. */
const REACH = 0.58;

const lerp = (a, b, t) => a + (b - a) * t;
const round1 = n => Math.round(n * 10) / 10;

function polylineLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return len;
}

/**
 * @param {string} seed    The mech (uuid)
 * @param {number} index   0-based: the n-th structure point lost
 * @param {number} W       Panel width (CSS px)
 * @param {number} H       Panel height (CSS px)
 */
export function generateFracture(seed, index, W, H) {
  const rng = mulberry32(hashSeed(`${seed}#fracture#${index}`));
  const r = (a, b) => lerp(a, b, rng());
  const slot = IMPACT_SLOTS[index % IMPACT_SLOTS.length];
  const lap = Math.floor(index / IMPACT_SLOTS.length);
  const severity = 1 + Math.min(index, 4) * 0.16;
  const inward = INWARD[slot.side];
  const along = Math.min(0.94, Math.max(0.06, slot.at + r(-0.07, 0.07) + lap * 0.11));
  const inset = r(2, 5);
  const impact =
    slot.side === "right"
      ? [W - inset, along * H]
      : slot.side === "left"
        ? [inset, along * H]
        : slot.side === "bottom"
          ? [along * W, H - inset]
          : [along * W, inset];

  // Keep everything inside the glass, and away from the far side of the panel
  const minX = 1;
  const maxX = W - 1;
  const minY = 1;
  const maxY = H - 1;
  const inBounds = ([x, y]) => x >= minX && x <= maxX && y >= minY && y <= maxY;
  const withinReach = ([x, y]) => {
    if (slot.side === "right") return x >= W * (1 - REACH);
    if (slot.side === "left") return x <= W * REACH;
    if (slot.side === "bottom") return y >= H * (1 - REACH * 0.6);
    return y <= H * REACH * 0.6;
  };

  // Spider web: spokes fanning into the glass, joined by two jittered rings
  const spokeCount = 6 + Math.floor(rng() * 3);
  const fan = Math.PI * 0.62;
  const spokes = [];
  for (let k = 0; k < spokeCount; k++) {
    const angle = inward - fan + (2 * fan * k) / (spokeCount - 1) + r(-0.12, 0.12);
    const length = r(9, 17) * Math.sqrt(severity);
    spokes.push({ angle, length, end: [impact[0] + Math.cos(angle) * length, impact[1] + Math.sin(angle) * length] });
  }
  const ring = scale =>
    spokes.map(s => {
      const rr = s.length * scale * r(0.82, 1.15);
      return [round1(impact[0] + Math.cos(s.angle) * rr), round1(impact[1] + Math.sin(s.angle) * rr)];
    });
  const rings = [ring(0.42), ring(0.78)];

  // Facets: alternating wedges of the web catch the light slightly differently
  const facets = [];
  for (let k = 0; k < spokeCount - 1; k++) {
    if (rng() < 0.55) continue;
    facets.push({
      points: [impact.map(round1), rings[1][k], rings[1][k + 1]],
      tint: round1(r(0.025, 0.06) * 1000) / 1000,
    });
  }

  // Main cracks start where a spoke ends and wander inward
  const cracks = [];
  const vents = [];
  const webDur = 90;
  const walk = (start, angle, length, depth, delay, width) => {
    const points = [start.map(round1)];
    const heading = angle;
    let a = angle;
    let travelled = 0;
    let [x, y] = start;
    const branchPlan = [];
    while (travelled < length) {
      const step = r(7, 15);
      // Wander, but keep pulling back toward the original heading
      a += r(-0.42, 0.42) + (heading - a) * 0.22;
      const nx = x + Math.cos(a) * step;
      const ny = y + Math.sin(a) * step;
      if (!inBounds([nx, ny]) || !withinReach([nx, ny])) break;
      x = nx;
      y = ny;
      travelled += step;
      points.push([round1(x), round1(y)]);
      if (points.length > 2 && depth < 2 && rng() < (depth === 0 ? 0.2 : 0.09)) {
        branchPlan.push({ at: [x, y], angle: a + (rng() < 0.5 ? -1 : 1) * r(0.45, 1.0), travelled });
      }
    }
    if (points.length < 2) return;
    const total = polylineLength(points);
    const dur = Math.max(40, total / SPEED);
    cracks.push({ points, length: round1(total), depth, width, delay: Math.round(delay), dur: Math.round(dur) });
    for (let i = 1; i < points.length; i += 2) vents.push(points[i]);
    for (const b of branchPlan) {
      const remaining = Math.max(16, (length - b.travelled) * r(0.3, 0.6));
      walk(b.at, b.angle, remaining, depth + 1, delay + b.travelled / SPEED, width * 0.72);
    }
  };

  const mainCount = 2 + (rng() < 0.5 ? 1 : 0) + (index >= 2 ? 1 : 0);
  // Main cracks leave from the inner spokes (the outer ones run along the bezel)
  const inner = spokes.map((s, k) => k).slice(1, -1);
  for (let i = inner.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [inner[i], inner[j]] = [inner[j], inner[i]];
  }
  const span = slot.side === "left" || slot.side === "right" ? W : H;
  for (let m = 0; m < mainCount; m++) {
    const spoke = spokes[inner[m % inner.length]];
    const length = span * r(0.24, 0.46) * severity;
    walk(spoke.end, spoke.angle + r(-0.2, 0.2), length, 0, webDur * 0.6, round1(r(0.85, 1.15)));
  }

  // Stuck pixels near the impact: the display behind the glass took the hit too
  const PIXEL_COLORS = ["0 255 230", "255 60 200", "255 255 255", "120 255 120", "255 210 90"];
  const pixels = [];
  const pixelCount = 5 + Math.floor(rng() * 6);
  for (let i = 0; i < pixelCount; i++) {
    const a = inward + r(-1.3, 1.3);
    const d = r(6, 30);
    const p = [impact[0] + Math.cos(a) * d, impact[1] + Math.sin(a) * d];
    if (!inBounds(p)) continue;
    pixels.push({ x: round1(p[0]), y: round1(p[1]), size: rng() < 0.25 ? 2 : 1.2, color: PIXEL_COLORS[Math.floor(rng() * PIXEL_COLORS.length)] });
  }

  // How far the furthest crack reaches from the impact (for the fade-to-tips mask)
  let reach = 20;
  for (const c of cracks) for (const [x, y] of c.points) reach = Math.max(reach, Math.hypot(x - impact[0], y - impact[1]));

  return {
    index,
    side: slot.side,
    reach: round1(reach),
    pixels,
    impact: impact.map(round1),
    inward,
    spokes: spokes.map(s => ({ points: [impact.map(round1), s.end.map(round1)], angle: s.angle })),
    rings,
    facets,
    cracks,
    vents,
    webDur,
    // When the whole fracture has finished forming
    duration: Math.max(webDur, ...cracks.map(c => c.delay + c.dur)),
  };
}

/** All fractures for a mech that has lost `count` structure. */
export function generateFractures(seed, count, W, H) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(generateFracture(seed, i, W, H));
  return out;
}

/** SVG path data for a polyline. */
export function pathData(points) {
  return points.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
}

/**
 * Damage levels from the mech's tracks. Structure lost draws fractures; stress lost drains
 * colour and lights the warning LEDs; steam needs both cracks and low stress.
 * @param {{structure: {value: number, max: number}, stress: {value: number, max: number}}} t
 */
export function damageLevels({ structure, stress }) {
  const sMax = Math.max(0, structure?.max ?? 0);
  const fractures = Math.max(0, Math.min(sMax, sMax - (structure?.value ?? sMax)));
  const stMax = Math.max(0, stress?.max ?? 0);
  const stressLost = Math.max(0, Math.min(stMax, stMax - (stress?.value ?? stMax)));
  const stressLeft = stMax - stressLost;
  let stressLevel = 0;
  if (stressLost > 0) stressLevel = 1;
  if (stMax > 0 && stressLeft / stMax <= 0.5) stressLevel = 2;
  if (stMax > 0 && stressLeft <= 1 && stressLost > 0) stressLevel = 3;
  let steam = 0;
  if (fractures > 0 && stressLevel >= 2) {
    steam = stressLevel === 3 ? 2 : 1;
    if (sMax - fractures <= 1) steam += 1;
  }
  return { fractures, stressLost, stressLevel, steam: Math.min(3, steam) };
}
