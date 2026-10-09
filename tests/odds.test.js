import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkBands,
  diceDistribution,
  formatPct,
  missChance,
  nextOverchargeCost,
  nextOverheatCheck,
  nextStructureCheck,
  NPC_TIER_ATTACK,
  overchargeOdds,
} from "../src/core/Odds.js";

/** Brute-force an N-dice check: lowest die counts, multiple 1s are their own band. */
function bruteBands(n) {
  const counts = { high: 0, mid: 0, one: 0, multi: 0 };
  const total = 6 ** n;
  for (let i = 0; i < total; i++) {
    const dice = [];
    for (let k = 0, v = i; k < n; k++, v = Math.floor(v / 6)) dice.push((v % 6) + 1);
    const ones = dice.filter(d => d === 1).length;
    if (ones > 1) counts.multi++;
    else if (ones === 1) counts.one++;
    else if (Math.min(...dice) <= 4) counts.mid++;
    else counts.high++;
  }
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v / total]));
}

test("checkBands matches brute force for 1-4 dice", () => {
  for (let n = 1; n <= 4; n++) {
    const exact = checkBands(n);
    const brute = bruteBands(n);
    for (const key of Object.keys(brute)) assert.ok(Math.abs(exact[key] - brute[key]) < 1e-12, `n=${n} ${key}`);
  }
});

test("third structure check: 34.7% Direct Hit, 7.4% Crushing Hit, 42.1% loss", () => {
  const next = nextStructureCheck({ value: 2, max: 4 });
  assert.equal(next.dice, 3);
  assert.equal(next.remaining, 1);
  const p = Object.fromEntries(next.bands.map(b => [b.key, b.p]));
  assert.equal(formatPct(p.direct), "34.7%");
  assert.equal(formatPct(p.crushing), "7.4%");
  assert.equal(formatPct(next.destroy), "42.1%");
});

test("second structure check: Direct Hit hinges on a HULL check", () => {
  const next = nextStructureCheck({ value: 3, max: 4 });
  assert.equal(next.dice, 2);
  assert.equal(formatPct(next.destroy), "2.8%");
  assert.equal(formatPct(next.destroyOnFailedCheck), "27.8%");
  assert.ok(next.bands.find(b => b.key === "direct").check);
});

test("one structure left: the next hit destroys without a roll", () => {
  assert.deepEqual(nextStructureCheck({ value: 1, max: 4 }), { state: "lethal", destroy: 1, destroyCertain: true });
  assert.equal(nextStructureCheck({ value: 0, max: 4 }).state, "destroyed");
});

test("overheat mirrors structure, with meltdown semantics", () => {
  const next = nextOverheatCheck({ value: 2, max: 4 });
  assert.equal(next.dice, 3);
  assert.deepEqual(
    next.bands.map(b => b.key),
    ["shunt", "destabilized", "meltdown", "irreversible"]
  );
  assert.equal(formatPct(next.destroy), "42.1%");
  assert.equal(nextOverheatCheck({ value: 1, max: 4 }).state, "lethal");
});

test("overcharge ladder clamps to the last rung", () => {
  const seq = "+1,+1d3,+1d6,+1d6+4";
  assert.equal(nextOverchargeCost(seq, 0).cost, "+1");
  assert.equal(nextOverchargeCost(seq, 1).cost, "+1d3");
  assert.equal(nextOverchargeCost(seq, 3).cost, "+1d6+4");
  assert.equal(nextOverchargeCost(seq, 9).cost, "+1d6+4");
  assert.equal(nextOverchargeCost("", 0).cost, null);
});

test("overcharge odds: chance of passing the Heat Cap", () => {
  assert.equal(overchargeOdds({ heat: 5, cap: 6, formula: "+1d3" }).pOverCap, 2 / 3);
  const big = overchargeOdds({ heat: 3, cap: 8, formula: "+1d6+4" });
  assert.equal(big.heatMin, 8);
  assert.equal(big.heatMax, 13);
  assert.ok(Math.abs(big.pOverCap - 5 / 6) < 1e-12);
  assert.equal(overchargeOdds({ heat: 0, cap: 6, formula: "+1" }).pOverCap, 0);
});

test("dice parser handles modifiers and rejects junk", () => {
  const d = diceDistribution("2d6-1");
  assert.equal(d.get(1), 1 / 36);
  assert.equal(d.get(11), 1 / 36);
  assert.ok(Math.abs([...d.values()].reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.equal(diceDistribution("1d6x"), null);
  assert.equal(diceDistribution(""), null);
});

test("formatPct edge cases", () => {
  assert.equal(formatPct(0), "0%");
  assert.equal(formatPct(1), "100%");
  assert.equal(formatPct(0.0004), "<0.1%");
  assert.equal(formatPct(0.4213), "42.1%");
});

/* LANCER Alternative Structure (module "lancer-alt-structure"): same dice, different outcomes */

test("alt structure: no roll destroys outright; a failed HULL check on a Crushing Hit does", () => {
  for (const [value, max] of [[4, 4], [3, 4], [2, 4]]) {
    const core = nextStructureCheck({ value, max });
    const alt = nextStructureCheck({ value, max }, { rules: "alt" });
    assert.equal(alt.dice, core.dice);
    assert.equal(alt.destroy, 0);
    const b = checkBands(alt.dice);
    assert.ok(Math.abs(alt.destroyOnFailedCheck - b.multi) < 1e-12);
    assert.deepEqual(alt.bands.map(x => x.key), ["glancing", "trauma", "direct", "crushing"]);
    assert.ok(Math.abs(alt.bands.reduce((s, x) => s + x.p, 0) - 1) < 1e-12);
    assert.ok(alt.bands.every(x => x.kind !== "lethal"));
    // A Direct Hit asks for a HULL check once 2 or fewer structure remain
    assert.equal(alt.bands[2].check, value - 1 <= 2);
  }
  // Losing the last point still ends the mech
  assert.equal(nextStructureCheck({ value: 1, max: 4 }, { rules: "alt" }).state, "lethal");
});

test("alt stress: meltdowns hinge on ENGINEERING checks; the last point still ends the mech", () => {
  const alt = nextOverheatCheck({ value: 3, max: 4 }, { rules: "alt" }); // 2 remain after the hit
  const b = checkBands(alt.dice);
  assert.equal(alt.destroy, 0);
  assert.ok(Math.abs(alt.destroyOnFailedCheck - (b.one + b.multi)) < 1e-12);
  assert.deepEqual(alt.bands.map(x => x.key), ["shunt", "powerFail", "meltdown", "criticalFail"]);
  const early = nextOverheatCheck({ value: 4, max: 4 }, { rules: "alt" }); // 3 remain: a 1 can't melt down
  assert.ok(Math.abs(early.destroyOnFailedCheck - checkBands(early.dice).multi) < 1e-12);
  assert.equal(nextOverheatCheck({ value: 1, max: 4 }, { rules: "alt" }).state, "lethal");
});

/* Evasion and E-Defense: the chance an attack misses */

/** Brute force: every d20 face and every Accuracy (or Difficulty) die. */
function bruteMiss(defense, bonus, accuracy) {
  const dice = Math.abs(accuracy);
  let hits = 0;
  let total = 0;
  for (let d20 = 1; d20 <= 20; d20++) {
    for (let i = 0; i < 6 ** dice; i++) {
      let high = 0;
      for (let k = 0, v = i; k < dice; k++, v = Math.floor(v / 6)) high = Math.max(high, (v % 6) + 1);
      total++;
      if (d20 + bonus + Math.sign(accuracy) * high >= defense) hits++;
    }
  }
  return 1 - hits / total;
}

test("missChance matches brute force for every defense, bonus and up to 3 Accuracy or Difficulty", () => {
  for (let defense = 0; defense <= 26; defense++) {
    for (let bonus = 0; bonus <= 6; bonus++) {
      for (let accuracy = -3; accuracy <= 3; accuracy++) {
        const got = missChance(defense, bonus, { accuracy });
        assert.ok(Math.abs(got - bruteMiss(defense, bonus, accuracy)) < 1e-12, `defense ${defense}, +${bonus}, accuracy ${accuracy}: ${got}`);
      }
    }
  }
});

test("missChance: a hit needs the defense or more; Invisible's 50% comes first; the typical tiers are +1/+2/+3", () => {
  assert.deepEqual(NPC_TIER_ATTACK, [1, 2, 3]);
  assert.ok(Math.abs(missChance(10, 1) - 0.4) < 1e-12, "Evasion 10 against +1: 9 or less on the d20 misses");
  assert.ok(Math.abs(missChance(10, 1, { invisible: true }) - 0.7) < 1e-12, "half of the 60% that would hit");
  assert.equal(missChance(1, 0), 0, "nothing misses a defense the lowest roll reaches");
  assert.equal(missChance(30, 3), 1, "nothing reaches it");
  assert.equal(missChance(10, 1, { accuracy: 1.7 }), missChance(10, 1, { accuracy: 1 }), "whole dice only");
});
