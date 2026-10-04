import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkBands,
  diceDistribution,
  formatPct,
  nextOverchargeCost,
  nextOverheatCheck,
  nextStructureCheck,
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
