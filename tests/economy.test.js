import { test } from "node:test";
import assert from "node:assert/strict";
import { trackerChange } from "../src/actions/runner.js";

const fresh = () => ({ protocol: true, move: 4, full: true, quick: true, reaction: true, free: true });

test("a quick action uses up the full action first, then the last quick", () => {
  const once = trackerChange(fresh(), "quick", true);
  assert.equal(once.full, false);
  assert.equal(once.quick, true);
  const twice = trackerChange(once, "quick", true);
  assert.equal(twice.full, false);
  assert.equal(twice.quick, false);
});

test("a full action spends both halves; refreshing restores both", () => {
  const spent = trackerChange(fresh(), "full", true);
  assert.deepEqual([spent.full, spent.quick], [false, false]);
  const back = trackerChange(spent, "full", false);
  assert.deepEqual([back.full, back.quick], [true, true]);
});

test("reaction, protocol and movement toggle independently", () => {
  const t = trackerChange(trackerChange(fresh(), "reaction", true), "protocol", true);
  assert.equal(t.reaction, false);
  assert.equal(t.protocol, false);
  assert.equal(t.quick, true);
  assert.equal(trackerChange(t, "move", true, 5).move, 0);
  assert.equal(trackerChange(t, "move", false, 5).move, 5);
});

test("free actions and unknown kinds change nothing", () => {
  assert.equal(trackerChange(fresh(), "free", true), null);
  assert.equal(trackerChange(fresh(), "nonsense", true), null);
});

test("the input tracker is never mutated", () => {
  const t = fresh();
  trackerChange(t, "full", true);
  assert.deepEqual(t, fresh());
});
