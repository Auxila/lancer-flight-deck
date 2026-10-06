/**
 * Procedural damage geometry for the manufacturer damage styles. Pure, no DOM: everything here runs in
 * Node for the tests. (GMS's cracked glass lives in fracture.js.)
 *
 * Every style places the n-th structure point lost at the same kind of site as the glass does: on the
 * panel's edges, alternating sides and spreading down (IMPACT_SLOTS), seeded from the mech's uuid and
 * the index, so a mech always shows the same damage and different mechs break differently. Each style
 * keeps clear of the middle of the panel, where the big readouts are.
 */
import { IMPACT_SLOTS, hashSeed, mulberry32 } from "./fracture.js";

const INWARD = { right: Math.PI, left: 0, bottom: -Math.PI / 2, top: Math.PI / 2 };
const round1 = n => Math.round(n * 10) / 10;
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * A seeded random source for one piece of damage, and where it lands.
 * @returns {{rng: () => number, r: (a: number, b: number) => number, site: {x: number, y: number, side: string, inward: number}, severity: number}}
 */
export function damageSite(seed, kind, index, W, H) {
  const rng = mulberry32(hashSeed(`${seed}#${kind}#${index}`));
  const r = (a, b) => lerp(a, b, rng());
  const slot = IMPACT_SLOTS[index % IMPACT_SLOTS.length];
  const lap = Math.floor(index / IMPACT_SLOTS.length);
  const along = Math.min(0.92, Math.max(0.08, slot.at + r(-0.06, 0.06) + lap * 0.11));
  const inset = r(1, 3);
  const x = slot.side === "right" ? W - inset : slot.side === "left" ? inset : along * W;
  const y = slot.side === "bottom" ? H - inset : slot.side === "top" ? inset : along * H;
  return { rng, r, site: { x: round1(x), y: round1(y), side: slot.side, inward: INWARD[slot.side] }, severity: 1 + Math.min(index, 4) * 0.15 };
}

/** The far limit a crack from this side may reach, as a test on a point. */
function reachTest(side, W, H, reach) {
  return ([x, y]) => {
    if (x < 1 || x > W - 1 || y < 1 || y > H - 1) return false;
    if (side === "right") return x >= W * (1 - reach);
    if (side === "left") return x <= W * reach;
    if (side === "bottom") return y >= H * (1 - reach * 0.6);
    return y <= H * reach * 0.6;
  };
}

function polylineLength(points) {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return len;
}

/** A polyline as a smooth SVG path: quadratic curves through the midpoints. */
export function smoothPath(points) {
  if (points.length < 3) return points.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ");
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const mx = round1((x + points[i + 1][0]) / 2);
    const my = round1((y + points[i + 1][1]) / 2);
    d += ` Q${x} ${y} ${mx} ${my}`;
  }
  const last = points[points.length - 1];
  return `${d} L${last[0]} ${last[1]}`;
}

/** A small irregular blob (a chip, a spall) around a point. */
function blob(rng, cx, cy, count, rMin, rMax, phase = 0) {
  const pts = [];
  for (let k = 0; k < count; k++) {
    const a = phase + (k / count) * Math.PI * 2 + (rng() - 0.5) * 0.5;
    const rr = lerp(rMin, rMax, rng());
    pts.push([round1(cx + Math.cos(a) * rr), round1(cy + Math.sin(a) * rr)]);
  }
  return pts;
}

/* -------------------------------------------- */
/*  IPS-N: hull breaches                        */
/* -------------------------------------------- */

/**
 * A shell through the hull plating: a jagged hole with metal petals torn outward, scorching, rivets
 * popped out of the seam beside it, and the damage control patch that ends up bolted over it.
 */
export function generateBreach(seed, index, W, H) {
  const { rng, r, site: edge, severity } = damageSite(seed, "breach", index, W, H);
  // A shell hole is centred a few pixels inboard, so it reads as a hole in the plating, not a nick in the edge
  const step = r(3.5, 5.5);
  const site = { ...edge, x: round1(edge.x + Math.cos(edge.inward) * step), y: round1(edge.y + Math.sin(edge.inward) * step) };
  const n = 10 + Math.floor(rng() * 4);
  const R = r(6, 8.5) * Math.sqrt(severity);
  const hole = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r(-0.15, 0.15);
    const rr = R * (k % 2 ? r(0.55, 0.75) : r(0.9, 1.1));
    hole.push([round1(site.x + Math.cos(a) * rr), round1(site.y + Math.sin(a) * rr)]);
  }
  const petals = [];
  for (let k = 0; k < n; k += 2) {
    if (rng() < 0.25) continue;
    const a = (k / n) * Math.PI * 2;
    const tip = [round1(site.x + Math.cos(a) * R * r(1.5, 2.1)), round1(site.y + Math.sin(a) * R * r(1.5, 2.1))];
    petals.push([hole[k], tip, hole[(k + 1) % n]]);
  }
  // Popped rivets: holes along the seam that runs past the breach (along the edge)
  const along = site.side === "left" || site.side === "right" ? [0, 1] : [1, 0];
  const inward = [Math.cos(site.inward), Math.sin(site.inward)];
  const rivets = [];
  const rivetCount = 3 + Math.floor(rng() * 3);
  for (let k = 0; k < rivetCount; k++) {
    const t = (k % 2 ? 1 : -1) * r(R * 1.9, R * 3.4);
    const d = r(4, 7);
    rivets.push([round1(site.x + along[0] * t + inward[0] * d), round1(site.y + along[1] * t + inward[1] * d)]);
  }
  const patch = {
    x: round1(site.x + inward[0] * 2.5),
    y: round1(site.y + inward[1] * 2.5),
    w: round1(r(22, 27)),
    h: round1(r(14, 17)),
    angle: round1(r(-13, 13)),
  };
  // Water finds its way out under the breach
  const drip = site.side === "top" ? null : { x: round1(site.x + inward[0] * R * 0.9), y: round1(site.y + R * 0.9), len: round1(r(26, 64)) };
  return { index, side: site.side, impact: [site.x, site.y], inward: site.inward, radius: round1(R), hole, petals, rivets, patch, drip, scorch: round1(r(20, 28) * Math.sqrt(severity)) };
}

/* -------------------------------------------- */
/*  SSC: kintsugi seams                         */
/* -------------------------------------------- */

/** Speeds (px per ms) of the white hairline racing out, and the gold flowing in behind it. */
export const SEAM_CRACK_SPEED = 0.9;
export const SEAM_GOLD_SPEED = 0.3;
/** How long after the hairline the gold starts to flow. */
export const SEAM_GOLD_LAG = 240;

/**
 * A break in the lacquer, mended in gold: one long, flowing seam from the edge (far smoother than glass)
 * with a branch or two, and a few chips filled solid with gold along it.
 */
export function generateSeam(seed, index, W, H) {
  const { rng, r, site, severity } = damageSite(seed, "seam", index, W, H);
  const ok = reachTest(site.side, W, H, 0.55);
  const span = site.side === "left" || site.side === "right" ? W : H;
  const seams = [];
  const walk = (start, angle, length, depth, delay) => {
    const points = [start.map(round1)];
    let a = angle;
    let [x, y] = start;
    let travelled = 0;
    const branches = [];
    while (travelled < length) {
      const step = r(9, 16);
      a += r(-0.3, 0.3) + (angle - a) * 0.12;
      const nx = x + Math.cos(a) * step;
      const ny = y + Math.sin(a) * step;
      if (!ok([nx, ny])) break;
      x = nx;
      y = ny;
      travelled += step;
      points.push([round1(x), round1(y)]);
      if (depth === 0 && points.length > 3 && branches.length < 2 && rng() < 0.16) branches.push({ at: [x, y], a, travelled });
    }
    if (points.length < 3) return;
    const len = polylineLength(points);
    seams.push({ d: smoothPath(points), points, length: round1(len), depth, delay: Math.round(delay), width: depth ? 0.8 : 1.25 });
    for (const b of branches) {
      walk(b.at, b.a + (rng() < 0.5 ? -1 : 1) * r(0.5, 0.95), Math.max(18, (length - b.travelled) * r(0.35, 0.6)), 1, delay + b.travelled / SEAM_CRACK_SPEED);
    }
  };
  walk([site.x, site.y], site.inward + r(-0.35, 0.35), span * r(0.3, 0.48) * severity, 0, 0);
  if (rng() < 0.55) walk([site.x, site.y], site.inward + (rng() < 0.5 ? -1 : 1) * r(0.6, 1.0), span * r(0.14, 0.24), 1, 40);
  // Chips: a missing flake of lacquer, filled solid with gold
  const chips = [];
  const main = seams.find(s => s.depth === 0);
  if (main) {
    const count = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < count; k++) {
      const p = main.points[Math.min(main.points.length - 1, 1 + Math.floor(rng() * (main.points.length - 1)))];
      chips.push(blob(rng, p[0], p[1], 5, 1.4, 3.1, rng() * 6));
    }
  }
  const crackDone = Math.max(0, ...seams.map(s => s.delay + s.length / SEAM_CRACK_SPEED));
  const goldDone = Math.max(0, ...seams.map(s => SEAM_GOLD_LAG + s.delay + s.length / SEAM_GOLD_SPEED));
  return { index, side: site.side, impact: [site.x, site.y], inward: site.inward, seams, chips, duration: Math.round(Math.max(crackDone, goldDone)) };
}

/* -------------------------------------------- */
/*  HORUS: corrupted blocks                     */
/* -------------------------------------------- */

/**
 * A region of the readout gone bad: a block of noise against the edge, pixel-sort smears dragging out
 * of it, an error code, and dead pixels around it.
 */
export function generateCorruption(seed, index, W, H) {
  const { rng, r, site } = damageSite(seed, "corrupt", index, W, H);
  const vertical = site.side === "left" || site.side === "right";
  // On the side edges a bad sector is a thin upright strip (its code runs vertically), so it stays on
  // the bezel and clear of the labels; on the top and bottom, a low bar
  const w = round1(vertical ? r(9, 11) : r(46, 80));
  const h = round1(vertical ? r(40, 58) : r(10, 15));
  let x = site.side === "right" ? W - w : site.side === "left" ? 0 : site.x - w / 2;
  let y = site.side === "bottom" ? H - h : site.side === "top" ? 0 : site.y - h / 2;
  x = round1(Math.max(0, Math.min(W - w, x)));
  y = round1(Math.max(0, Math.min(H - h, y)));
  const smears = [];
  const smearCount = 3 + Math.floor(rng() * 4);
  for (let k = 0; k < smearCount; k++) {
    smears.push({ at: round1(r(0.08, 0.92) * (vertical ? h : w)), len: round1(r(10, vertical ? W * 0.32 : 26)), thick: rng() < 0.3 ? 2 : 1 });
  }
  const dead = [];
  for (let k = 0; k < 4 + Math.floor(rng() * 5); k++) {
    const px = x + w / 2 + Math.cos(site.inward + r(-1.2, 1.2)) * r(w * 0.6, w * 1.4);
    const py = y + h / 2 + Math.sin(site.inward + r(-1.2, 1.2)) * r(h * 0.6, h * 2.2) + (vertical ? r(-h, h) : 0);
    if (px > 0 && px < W && py > 0 && py < H) dead.push([round1(px), round1(py)]);
  }
  const code = Math.floor(rng() * 256).toString(16).toUpperCase().padStart(2, "0");
  return { index, side: site.side, impact: [site.x, site.y], inward: site.inward, x, y, w, h, smears, dead, code };
}

/* -------------------------------------------- */
/*  HA: spalled concrete                        */
/* -------------------------------------------- */

/**
 * A hit on poured concrete: a chunk bitten out of the slab's edge with the rebar showing, and blocky,
 * straight-run cracks that turn in hard steps (concrete doesn't web like glass).
 */
export function generateSpall(seed, index, W, H) {
  const { rng, r, site: edge, severity } = damageSite(seed, "spall", index, W, H);
  // The bite is centred just inboard, so it reads as a chunk out of the slab
  const step = r(2.5, 4);
  const site = { ...edge, x: round1(edge.x + Math.cos(edge.inward) * step), y: round1(edge.y + Math.sin(edge.inward) * step) };
  const R = r(6.5, 10) * Math.sqrt(severity);
  const bite = blob(rng, site.x, site.y, 8, R * 0.7, R * 1.15, rng());
  const inward = [Math.cos(site.inward), Math.sin(site.inward)];
  const along = site.side === "left" || site.side === "right" ? [0, 1] : [1, 0];
  const rebar = [R * 0.35, R * 0.7].map(depth => {
    const cx = site.x + inward[0] * depth;
    const cy = site.y + inward[1] * depth;
    const half = R * 1.05;
    return [[round1(cx - along[0] * half), round1(cy - along[1] * half)], [round1(cx + along[0] * half), round1(cy + along[1] * half)]];
  });
  const ok = reachTest(site.side, W, H, 0.45);
  const span = site.side === "left" || site.side === "right" ? W : H;
  const cracks = [];
  const walk = (start, angle, length, depth, delay) => {
    const points = [start.map(round1)];
    let a = angle;
    let [x, y] = start;
    let travelled = 0;
    const branches = [];
    while (travelled < length) {
      const step = r(8, 17);
      // Hard turns, in steps, pulled back toward the heading
      const turn = rng();
      if (turn < 0.22) a -= r(0.4, 0.7);
      else if (turn > 0.78) a += r(0.4, 0.7);
      a += (angle - a) * 0.3;
      const nx = x + Math.cos(a) * step;
      const ny = y + Math.sin(a) * step;
      if (!ok([nx, ny])) break;
      x = nx;
      y = ny;
      travelled += step;
      points.push([round1(x), round1(y)]);
      if (depth === 0 && points.length > 2 && rng() < 0.18) branches.push({ at: [x, y], a, travelled });
    }
    if (points.length < 2) return;
    const len = polylineLength(points);
    cracks.push({ points, length: round1(len), depth, delay: Math.round(delay), dur: Math.round(Math.max(40, len / 0.55)), width: depth ? 0.8 : 1.15 });
    for (const b of branches.slice(0, 2)) walk(b.at, b.a + (rng() < 0.5 ? -1 : 1) * r(0.7, 1.3), r(10, 26), 1, delay + b.travelled / 0.55);
  };
  const count = 2 + (rng() < 0.5 ? 1 : 0);
  for (let k = 0; k < count; k++) {
    const a = site.inward + (k - (count - 1) / 2) * r(0.45, 0.75);
    walk([site.x + Math.cos(a) * R * 0.8, site.y + Math.sin(a) * R * 0.8], a, span * r(0.16, 0.3) * severity, 0, 30 + k * 40);
  }
  return {
    index,
    side: site.side,
    impact: [site.x, site.y],
    inward: site.inward,
    radius: round1(R),
    bite,
    rebar,
    cracks,
    duration: Math.max(0, ...cracks.map(c => c.delay + c.dur)),
  };
}
