import { test } from "node:test";
import assert from "node:assert/strict";
import { damageLevels, generateFracture, generateFractures, hashSeed, pathData } from "../src/ui/damage/fracture.js";

const W = 338;
const H = 760;

test("fractures are deterministic per mech and index", () => {
  const a = generateFracture("Actor.abc", 1, W, H);
  const b = generateFracture("Actor.abc", 1, W, H);
  assert.deepEqual(a, b);
  const other = generateFracture("Actor.xyz", 1, W, H);
  assert.notDeepEqual(a.cracks, other.cracks);
  assert.notEqual(hashSeed("a"), hashSeed("b"));
});

test("every point stays on the glass, and cracks stop short of the far side", () => {
  for (const seed of ["Actor.one", "Actor.two", "Actor.three", "Actor.four"]) {
    for (const f of generateFractures(seed, 6, W, H)) {
      for (const c of f.cracks) {
        for (const [x, y] of c.points) {
          assert.ok(x >= 0 && x <= W && y >= 0 && y <= H, `${seed}#${f.index} point ${x},${y} off the glass`);
          if (f.side === "right") assert.ok(x >= W * 0.4, `right-side crack reached x=${x}`);
          if (f.side === "left") assert.ok(x <= W * 0.6, `left-side crack reached x=${x}`);
        }
      }
    }
  }
});

test("each fracture has a web, main cracks and vents for steam", () => {
  const f = generateFracture("Actor.web", 0, W, H);
  assert.ok(f.spokes.length >= 6);
  assert.equal(f.rings.length, 2);
  assert.ok(f.cracks.filter(c => c.depth === 0).length >= 2);
  assert.ok(f.vents.length > 0);
  for (const c of f.cracks) assert.ok(c.dur > 0 && c.delay >= 0 && c.length > 0);
  assert.ok(f.duration >= Math.max(...f.cracks.map(c => c.delay + c.dur)));
});

test("successive fractures land in different places", () => {
  const [a, b, c] = generateFractures("Actor.spread", 3, W, H);
  assert.notEqual(a.side, b.side);
  assert.ok(Math.abs(a.impact[1] - c.impact[1]) > H * 0.25);
});

test("path data is a polyline", () => {
  assert.equal(pathData([[1, 2], [3, 4.5]]), "M1 2 L3 4.5");
});

test("damage levels: fractures from structure, colour drain from stress, steam needs both", () => {
  const lv = (s, st) => damageLevels({ structure: { value: s, max: 4 }, stress: { value: st, max: 4 } });
  assert.deepEqual(lv(4, 4), { fractures: 0, stressLost: 0, stressLevel: 0, steam: 0 });
  assert.equal(lv(3, 4).fractures, 1);
  assert.equal(lv(4, 3).stressLevel, 1);
  assert.equal(lv(4, 2).stressLevel, 2);
  assert.equal(lv(4, 1).stressLevel, 3);
  // Low stress alone doesn't steam: there are no cracks to vent through
  assert.equal(lv(4, 1).steam, 0);
  // Cracked and low stress: steam, more of it as either track gets worse
  assert.equal(lv(3, 2).steam, 1);
  assert.equal(lv(3, 1).steam, 2);
  assert.equal(lv(1, 1).steam, 3);
  // Cracked but stress fine: no steam
  assert.equal(lv(2, 4).steam, 0);
});
