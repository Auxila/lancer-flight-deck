import { MODULE_ID, SETTINGS } from "../constants.js";

/**
 * After an attack of yours hits or crits, open LANCER's damage roll prompt by itself: the same prompt
 * the attack card's ROLL DAMAGE button opens, built from the same attack data on the card. The button
 * stays on the card for re-rolls. Per player (client setting), so a GM can leave it off for NPCs.
 */
export function registerAutoDamage() {
  Hooks.on("createChatMessage", message => {
    if (!message.author?.isSelf || !game.settings.get(MODULE_ID, SETTINGS.AUTO_DAMAGE)) return;
    const attack = message.flags?.lancer?.attackData;
    if (!attack?.targets?.some(t => t.hit || t.crit)) return;
    // One prompt at a time: LANCER cancels an open damage prompt when another opens, so a Barrage's
    // second hit waits until the first damage is rolled (or cancelled) instead of discarding it.
    queue = queue.then(() => rollDamage(attack)).catch(err => console.error("Flight Deck | Could not open the damage roll", err));
  });
}

/** Damage prompts waiting their turn; each one resolves when it's rolled or cancelled. */
let queue = Promise.resolve();

/** LANCER's ROLL DAMAGE button (rollDamageCallback), started from the attack data instead of a click. */
async function rollDamage(attack) {
  const attacker = await fromUuid(attack.attackerUuid);
  if (!attacker?.isOwner) return;
  const item = attack.attackerItemUuid ? await fromUuid(attack.attackerItemUuid) : null;
  if (item && item.parent !== attacker) return;
  const hits = [];
  for (const t of attack.targets) {
    const token = fromUuidSync(t.uuid)?.object;
    if (!token) continue;
    // The card stores a consumed Lock On as setConditions.lockon === false
    const usedLockOn = t.setConditions?.lockon === false || t.setConditions?.lockOn === false;
    hits.push({ target: token, total: t.total, usedLockOn, hit: t.hit, crit: t.crit });
  }
  if (!hits.some(h => h.hit || h.crit)) return;
  const DamageRollFlow = game.lancer?.flows?.get("DamageRollFlow");
  if (!DamageRollFlow) return;
  await new DamageRollFlow(item ? item.uuid : attack.attackerUuid, {
    title: `${item?.name || attacker.name} DAMAGE`,
    configurable: true,
    invade: attack.invade,
    hit_results: hits,
    has_normal_hit: hits.some(h => h.hit && !h.crit),
    has_crit_hit: hits.some(h => h.crit),
    // An invade's 2 heat, as the button adds it
    damage: attack.invade ? [{ type: "Heat", val: "2" }] : [],
    bonus_damage: [],
  }).begin();
}
