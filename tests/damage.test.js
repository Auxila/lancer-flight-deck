import { test } from "node:test";
import assert from "node:assert/strict";
import { damageSite, generateBreach, generateCorruption, generateSeam, generateSpall, smoothPath } from "../src/ui/damage/geometry.js";
import { DAMAGE_STYLES } from "../src/ui/damage/styles/index.js";
import { getThemes } from "../src/themes/registry.js";

const W = 338;
const H = 820;
const SEEDS = ["Actor.one", "Actor.two", "Actor.three", "Actor.four", "Actor.five"];
const GENERATORS = { breach: generateBreach, seam: generateSeam, corruption: generateCorruption, spall: generateSpall };

test("every theme names a damage style that exists; GMS keeps the glass", () => {
  for (const theme of getThemes()) assert.ok(DAMAGE_STYLES[theme.damage], `${theme.id}: ${theme.damage}`);
  assert.equal(getThemes().find(t => t.id === "gms").damage, "glass");
  const styles = new Set(getThemes().map(t => t.damage));
  assert.equal(styles.size, getThemes().length, "each maker breaks its own way");
});

test("damage is deterministic per mech and index, and differs between mechs", () => {
  for (const [name, gen] of Object.entries(GENERATORS)) {
    assert.deepEqual(gen("Actor.abc", 2, W, H), gen("Actor.abc", 2, W, H), name);
    assert.notDeepEqual(gen("Actor.abc", 2, W, H), gen("Actor.xyz", 2, W, H), name);
  }
});

test("successive points land on alternating edges, spreading down the panel", () => {
  const sides = [0, 1, 2, 3].map(i => damageSite("Actor.abc", "breach", i, W, H).site.side);
  assert.deepEqual(sides, ["right", "left", "right", "left"]);
  const ys = [0, 1, 2, 3].map(i => damageSite("Actor.abc", "breach", i, W, H).site.y);
  assert.ok(new Set(ys.map(y => Math.round(y / 50))).size >= 3, "not stacked in one place");
});

test("breaches sit on the edge: hole, petals, rivets and patch stay near it", () => {
  for (const seed of SEEDS) {
    for (let i = 0; i < 6; i++) {
      const b = generateBreach(seed, i, W, H);
      const [x, y] = b.impact;
      for (const [px, py] of [...b.hole, ...b.petals.flat(), ...b.rivets]) assert.ok(Math.hypot(px - x, py - y) < 62, `${seed}#${i} strays`);
      for (const [px, py] of b.tear) assert.ok(px >= 0 && px <= W && py >= 0 && py <= H && Math.hypot(px - x, py - y) < 90, `${seed}#${i} tear strays`);
      assert.equal(b.dents.length, 2);
      assert.ok(b.patch.w >= 28 && b.patch.w <= 34 && b.patch.h <= 22);
      // A few pixels inboard of the edge, never further
      if (b.side === "right") assert.ok(x > W - 11 && x < W - 5);
      if (b.side === "left") assert.ok(x < 11 && x > 5);
    }
  }
});

test("kintsugi seams and concrete cracks stay on the panel and stop short of the far side", () => {
  for (const seed of SEEDS) {
    for (let i = 0; i < 6; i++) {
      const seam = generateSeam(seed, i, W, H);
      for (const s of seam.seams) {
        for (const [x, y] of s.points) {
          assert.ok(x >= 0 && x <= W && y >= 0 && y <= H, `seam ${seed}#${i} off the panel`);
          if (seam.side === "right") assert.ok(x >= W * 0.45, `seam reached x=${x}`);
          if (seam.side === "left") assert.ok(x <= W * 0.55, `seam reached x=${x}`);
        }
        assert.match(s.d, /^M[\d.]+ [\d.]+/);
      }
      assert.ok(seam.seams.length >= 1 && seam.duration > 0);
      const spall = generateSpall(seed, i, W, H);
      for (const c of spall.cracks) {
        for (const [x, y] of c.points) {
          assert.ok(x >= 0 && x <= W && y >= 0 && y <= H, `spall ${seed}#${i} off the panel`);
          if (spall.side === "right") assert.ok(x >= W * 0.45 - spall.radius, `spall crack reached x=${x}`);
          if (spall.side === "left") assert.ok(x <= W * 0.55 + spall.radius, `spall crack reached x=${x}`);
        }
      }
      assert.equal(spall.rebar.length, 3);
      assert.ok(spall.crazing.length >= 9);
    }
  }
});

test("corrupted blocks fit on the panel against their edge, with an error code", () => {
  for (const seed of SEEDS) {
    for (let i = 0; i < 6; i++) {
      const c = generateCorruption(seed, i, W, H);
      assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= W + 0.01 && c.y + c.h <= H + 0.01, `${seed}#${i} block off the panel`);
      if (c.side === "right") assert.ok(c.x + c.w > W - 1);
      if (c.side === "left") assert.equal(c.x, 0);
      assert.match(c.code, /^[0-9A-F]{2}$/);
      assert.ok(c.smears.length >= 6);
      assert.ok(c.band.len > 0 && c.band.thick >= 4);
    }
  }
});

test("smoothPath curves through the midpoints and ends on the last point", () => {
  assert.equal(smoothPath([[0, 0], [10, 0], [20, 10]]), "M0 0 Q10 0 15 5 L20 10");
  assert.equal(smoothPath([[0, 0], [5, 5]]), "M0 0 L5 5");
});
