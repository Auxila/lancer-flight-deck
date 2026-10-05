/**
 * LANCER's weapon-action rules for the HUD's weapon picker. Pure, so they can be tested in Node.
 *
 * Skirmish (and Overwatch, which triggers a skirmish): attack with one weapon, never a Superheavy one.
 *   Then you may also attack with a different Auxiliary weapon on the same mount.
 * Barrage: attack with two weapons, or with one Superheavy weapon.
 *   Then you may also attack with an Auxiliary weapon on each mount that was fired, as long as that
 *   Auxiliary weapon hasn't been fired yet this action.
 * Auxiliary follow-ups cost nothing more and deal no bonus damage.
 */

export const SUPERHEAVY = "Superheavy";
export const AUXILIARY = "Auxiliary";

/**
 * What each weapon may do next in this action.
 * @param {"skirmish"|"barrage"|"overwatch"} mode
 * @param {Array<{id: string, mount: number, size: string, ready?: boolean}>} weapons   Mounted weapons (mount = mount index;
 *   ready: false for a weapon that can't fire now, destroyed, unloaded or out of uses)
 * @param {Array<{id: string, mount: number, size: string, aux?: boolean}>} [fired]  Attacks made so far this action
 * @returns {{phase: "primary"|"aux"|"done", made: number, needed: number,
 *            options: Map<string, {allowed: boolean, reason: string|null, aux: boolean}>}}
 *   reason: "fired" | "notReady" | "superheavyBarrage" | "superheavyWhole" | "notAux" | "otherMount" | "auxUsed"
 */
export function planWeapons(mode, weapons, fired = []) {
  const barrage = mode === "barrage";
  const primaries = fired.filter(f => !f.aux);
  const follow = fired.filter(f => f.aux);
  const firedIds = new Set(fired.map(f => f.id));
  const superheavy = primaries.some(f => f.size === SUPERHEAVY);
  const needed = barrage ? (superheavy ? 1 : 2) : 1;
  // A Barrage whose second attack can't be made (nothing else ready to fire) moves on after the first
  const canStillFire = weapons.some(w => w.ready !== false && !firedIds.has(w.id) && w.size !== SUPERHEAVY);
  const primaryDone = primaries.length >= needed || (primaries.length > 0 && !canStillFire);
  const firedMounts = new Set(primaries.map(f => f.mount));
  const auxMounts = new Set(follow.map(f => f.mount));

  const options = new Map();
  for (const w of weapons) {
    let reason = null;
    if (firedIds.has(w.id)) reason = "fired";
    else if (w.ready === false) reason = "notReady";
    else if (!primaryDone) {
      if (w.size === SUPERHEAVY && !barrage) reason = "superheavyBarrage";
      else if (w.size === SUPERHEAVY && primaries.length > 0) reason = "superheavyWhole";
    } else if (w.size !== AUXILIARY) reason = "notAux";
    else if (!firedMounts.has(w.mount)) reason = "otherMount";
    // Skirmish: one follow-up in all. Barrage: one per mount that fired.
    else if (barrage ? auxMounts.has(w.mount) : follow.length > 0) reason = "auxUsed";
    options.set(w.id, { allowed: !reason, reason, aux: primaryDone });
  }
  const anyFollowUp = primaryDone && [...options.values()].some(o => o.allowed);
  return {
    phase: !primaryDone ? "primary" : anyFollowUp ? "aux" : "done",
    made: Math.min(primaries.length, needed),
    needed,
    options,
  };
}
