import { MODULE_ID, SETTINGS } from "../constants.js";

/**
 * After an attack of yours deals damage, open LANCER's damage roll prompt by itself: the same prompt the
 * attack card's ROLL DAMAGE button opens, built from the same attack data on the card. That's a hit or a
 * crit, or a miss with a Reliable weapon, whose Reliable damage still lands (LANCER's damage flow rolls it
 * for the missed targets). The button stays on the card for re-rolls. Per player (client setting), so a GM
 * can leave it off for NPCs.
 */
export function registerAutoDamage() {
  Hooks.on("createChatMessage", message => {
    if (!message.author?.isSelf || !game.settings.get(MODULE_ID, SETTINGS.AUTO_DAMAGE)) return;
    const attack = message.flags?.lancer?.attackData;
    // Hits are known from the card; whether a miss still deals damage depends on the weapon (rollDamage)
    if (!attack?.targets?.length) return;
    // Only where LANCER's own card offers ROLL DAMAGE: every weapon attack, but a tech attack only if it's an invade
    if (!String(message.content ?? "").includes("lancer-damage-flow")) return;
    // One prompt at a time: LANCER cancels an open damage prompt when another opens, so a Barrage's
    // second hit waits until the first damage is rolled (or cancelled) instead of discarding it.
    queue = queue.then(() => untilDone(rollDamage(attack))).catch(err => console.error("Flight Deck | Could not open the damage roll", err));
  });
}

/** Damage prompts waiting their turn; each one resolves when it's rolled or cancelled. */
let queue = Promise.resolve();

/**
 * The prompt's flow, or the moment no damage prompt is on screen any more, whichever comes first: if a
 * prompt ever closes without settling its flow, the next one still opens.
 */
function untilDone(flow) {
  let timer = null;
  const gone = new Promise(resolve => {
    let misses = 0;
    timer = setInterval(() => {
      const open = [...document.querySelectorAll("#hudzone .component")].some(c => / DAMAGE -- /.test(c.textContent ?? ""));
      misses = open ? 0 : misses + 1;
      if (misses >= 3) resolve();
    }, 1000);
  });
  return Promise.race([flow, gone]).finally(() => clearInterval(timer));
}

/**
 * The weapon's Reliable value, read the way LANCER's damage flow reads it (setDamageTags): the tags of the
 * mech weapon's active profile, an NPC weapon feature's tags, a frame's core system tags, or the item's own;
 * valued at the NPC's tier (1 for everyone else). 0 when it isn't Reliable.
 */
export function reliableValue(item, actor) {
  if (!item) return 0;
  const sys = item.system ?? {};
  let tags;
  if (item.is_mech_weapon?.()) tags = sys.active_profile?.all_tags;
  else if (item.is_frame?.()) tags = sys.core_system?.tags;
  else if (item.is_talent?.()) tags = [];
  else if (item.is_npc_feature?.()) tags = sys.type === "Weapon" ? sys.tags : [];
  else tags = sys.tags;
  const tag = (tags ?? []).find(t => t?.is_reliable ?? t?.lid === "tg_reliable");
  if (!tag) return 0;
  const tier = (actor?.is_npc?.() && actor.system?.tier) || 1;
  return parseInt(tag.tierVal?.(tier) ?? tag.val ?? "0", 10) || 0;
}

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
  if (!hits.length) return;
  // All missed: only a Reliable weapon still deals damage. An invade's 2 heat needs a hit.
  if (!hits.some(h => h.hit || h.crit) && (attack.invade || reliableValue(item, attacker) <= 0)) return;
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
