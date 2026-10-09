/**
 * Exact odds for LANCER structure and overheat checks, and for Overcharge heat.
 *
 * A check rolls one d6 per point of structure (or stress) damage marked, including the
 * point just taken, and keeps the lowest (the system's `Nd6kl1`). Multiple 1s are a
 * Crushing Hit / Irreversible Meltdown.
 *
 * Pure functions with no Foundry dependencies, so they can be tested in Node.
 */

/**
 * Outcome bands for an N-dice check.
 * @param {number} n  Number of d6 rolled (1 or more)
 */
export function checkBands(n) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`checkBands needs n >= 1, got ${n}`);
  const pNoOne = (5 / 6) ** n;
  const exactlyOne = n * (1 / 6) * (5 / 6) ** (n - 1);
  const high = (2 / 6) ** n; // every die 5-6
  return {
    high, // 5-6: Glancing Blow / Emergency Shunt
    mid: pNoOne - high, // 2-4: System Trauma / Destabilized Power Plant
    one: exactlyOne, // single 1: Direct Hit / Meltdown
    multi: 1 - pNoOne - exactlyOne, // multiple 1s: Crushing Hit / Irreversible Meltdown
  };
}

/**
 * What the NEXT structure check looks like, given the mech's current structure.
 * @param {{value:number, max:number}} structure
 * @param {{rules?: "core"|"alt"}} [options]  "alt": the tables of the LANCER Alternative Structure module
 */
export function nextStructureCheck({ value, max }, { rules = "core" } = {}) {
  if (!(max > 0) || value <= 0) return { state: "destroyed" };
  if (value === 1) return { state: "lethal", destroy: 1, destroyCertain: true };
  const remaining = value - 1;
  const dice = max - remaining;
  const b = checkBands(dice);
  if (rules === "alt") {
    // Same dice, gentler table: a Direct Hit never destroys (a HULL check at 2 or 1 remaining),
    // and a Crushing Hit is a HULL check that destroys only on a failure.
    return {
      state: "check",
      dice,
      remaining,
      rules,
      bands: [
        { key: "glancing", p: b.high, kind: "ok" },
        { key: "trauma", p: b.mid, kind: "caution" },
        { key: "direct", p: b.one, kind: "warning", check: remaining <= 2 },
        { key: "crushing", p: b.multi, kind: "warning", check: true },
      ],
      destroy: 0,
      destroyOnFailedCheck: b.multi,
    };
  }
  // Direct Hit: 3+ remaining stuns, 2 remaining means a HULL check, 1 or less destroys.
  const directLethal = remaining <= 1;
  const directCheck = remaining === 2;
  const destroy = b.multi + (directLethal ? b.one : 0);
  return {
    state: "check",
    dice,
    remaining,
    bands: [
      { key: "glancing", p: b.high, kind: "ok" },
      { key: "trauma", p: b.mid, kind: "caution" },
      { key: "direct", p: b.one, kind: directLethal ? "lethal" : "warning", check: directCheck },
      { key: "crushing", p: b.multi, kind: "lethal" },
    ],
    destroy,
    // Extra risk that hinges on a HULL check (only when 2 structure remain after the hit)
    destroyOnFailedCheck: directCheck ? b.one : 0,
  };
}

/**
 * What the NEXT overheat (stress) check looks like, given the mech's current stress.
 * @param {{value:number, max:number}} stress
 * @param {{rules?: "core"|"alt"}} [options]  "alt": the tables of the LANCER Alternative Structure module
 */
export function nextOverheatCheck({ value, max }, { rules = "core" } = {}) {
  if (!(max > 0) || value <= 0) return { state: "destroyed" };
  // Losing the last point of stress ends the mech (the system's noStressRemaining step).
  if (value === 1) return { state: "lethal", destroy: 1, destroyCertain: true };
  const remaining = value - 1;
  const dice = max - remaining;
  const b = checkBands(dice);
  if (rules === "alt") {
    // Every 1 is an ENGINEERING check; a meltdown only follows a failure (after 1d3 turns at 2 or 1
    // remaining), and a Critical Reactor Failure's meltdown can be stopped by Stabilize or a check.
    return {
      state: "check",
      dice,
      remaining,
      rules,
      bands: [
        { key: "shunt", p: b.high, kind: "ok" },
        { key: "powerFail", p: b.mid, kind: "caution" },
        { key: "meltdown", p: b.one, kind: "warning", check: true },
        { key: "criticalFail", p: b.multi, kind: "warning", check: true },
      ],
      destroy: 0,
      destroyOnFailedCheck: (remaining <= 2 ? b.one : 0) + b.multi,
    };
  }
  // Meltdown: 3+ remaining is Exposed, 2 means an ENGINEERING check, 1 is a meltdown next turn.
  const meltdownLethal = remaining <= 1;
  const meltdownCheck = remaining === 2;
  return {
    state: "check",
    dice,
    remaining,
    bands: [
      { key: "shunt", p: b.high, kind: "ok" },
      { key: "destabilized", p: b.mid, kind: "caution" },
      { key: "meltdown", p: b.one, kind: meltdownLethal ? "lethal" : "warning", check: meltdownCheck },
      { key: "irreversible", p: b.multi, kind: "lethal" },
    ],
    destroy: b.multi + (meltdownLethal ? b.one : 0),
    destroyOnFailedCheck: meltdownCheck ? b.one : 0,
  };
}

/**
 * Probability distribution of a simple dice formula such as "+1", "1d3", "+1d6+4" or "2d6-1".
 * Returns a Map of total -> probability, or null if the formula is not understood.
 * @param {string} formula
 */
export function diceDistribution(formula) {
  if (typeof formula !== "string") return null;
  const src = formula.replace(/\s+/g, "").toLowerCase();
  if (!src) return null;
  const terms = src.match(/[+-]?[^+-]+/g);
  if (!terms) return null;
  let dist = new Map([[0, 1]]);
  for (const raw of terms) {
    const sign = raw.startsWith("-") ? -1 : 1;
    const term = raw.replace(/^[+-]/, "");
    const dieMatch = term.match(/^(\d*)d(\d+)$/);
    if (dieMatch) {
      const count = dieMatch[1] === "" ? 1 : Number(dieMatch[1]);
      const faces = Number(dieMatch[2]);
      if (count < 1 || count > 20 || faces < 1 || faces > 100) return null;
      for (let i = 0; i < count; i++) dist = convolve(dist, faces, sign);
    } else if (/^\d+$/.test(term)) {
      const k = sign * Number(term);
      dist = new Map([...dist].map(([v, p]) => [v + k, p]));
    } else {
      return null;
    }
  }
  return dist;
}

function convolve(dist, faces, sign) {
  const out = new Map();
  for (const [v, p] of dist) {
    for (let f = 1; f <= faces; f++) {
      const t = v + sign * f;
      out.set(t, (out.get(t) ?? 0) + p / faces);
    }
  }
  return out;
}

/**
 * Odds for the next Overcharge, given current heat.
 * @param {{heat:number, cap:number, formula:string}} args
 */
export function overchargeOdds({ heat, cap, formula }) {
  const dist = diceDistribution(formula);
  if (!dist) return null;
  const totals = [...dist.keys()];
  const min = Math.min(...totals);
  const max = Math.max(...totals);
  let pOverCap = 0;
  if (cap > 0) for (const [v, p] of dist) if (heat + v > cap) pOverCap += p;
  return { min, max, heatMin: heat + min, heatMax: heat + max, pOverCap };
}

/**
 * The cost of the next Overcharge, from the actor's ladder and current level.
 * The system clamps the level to the last rung, so the last rung repeats.
 * @param {string} sequence  e.g. "+1,+1d3,+1d6,+1d6+4"
 * @param {number} level     system.overcharge
 */
export function nextOverchargeCost(sequence, level) {
  const rungs = String(sequence ?? "")
    .split(",")
    .map(s => s.trim())
    .filter(Boolean);
  if (!rungs.length) return { rungs, index: 0, cost: null };
  const index = Math.max(0, Math.min(Number(level) || 0, rungs.length - 1));
  return { rungs, index, cost: rungs[index] };
}

/**
 * The attack bonus most NPC weapons and tech attacks carry at Tier 1, 2 and 3. Of the core NPCs' attacks about
 * two in three follow it; the rest hit harder (+2 / +4 / +6).
 */
export const NPC_TIER_ATTACK = [1, 2, 3];

/**
 * The chance an attack misses: 1d20 + the attack bonus, plus the highest of the net Accuracy d6s (or minus the
 * highest of the net Difficulty d6s), hits on a total at or above the defense (Evasion; E-Defense for a tech
 * attack). Invisible's flat 50% miss comes first.
 * @param {number} defense
 * @param {number} bonus  The attack bonus
 * @param {{accuracy?: number, invisible?: boolean}} [mods]  accuracy: net Accuracy, negative for Difficulty
 */
export function missChance(defense, bonus, { accuracy = 0, invisible = false } = {}) {
  const d20AtLeast = need => Math.min(1, Math.max(0, (21 - need) / 20));
  const dice = Math.abs(Math.trunc(accuracy));
  let hit = 0;
  if (!dice) hit = d20AtLeast(defense - bonus);
  else {
    // The highest of n d6 is m with chance (m/6)^n - ((m-1)/6)^n
    const sign = Math.sign(accuracy);
    for (let m = 1; m <= 6; m++) hit += ((m / 6) ** dice - ((m - 1) / 6) ** dice) * d20AtLeast(defense - bonus - sign * m);
  }
  return 1 - (invisible ? hit / 2 : hit);
}

/** Format a probability for a gauge label: "<0.1%", "7.4%", "42.1%", "100%". */
export function formatPct(p) {
  if (!(p > 0)) return "0%";
  if (p >= 0.9995) return "100%";
  const pct = p * 100;
  if (pct < 0.1) return "<0.1%";
  return `${pct.toFixed(1)}%`;
}
