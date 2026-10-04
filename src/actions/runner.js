import { STATUS } from "../constants.js";
import { setStatus, startMeltdown } from "../core/ConditionControl.js";
import { ATTACK_TITLES, textId } from "./basic.js";
import { systemChatCard, textWithActions } from "./chatCards.js";

/**
 * Runs HUD entries through LANCER's own flows, so every card, roll, heat cost, Limited use and
 * Loading check is the system's. Resolves true when the action actually happened (a cancelled
 * attack HUD resolves false), which is what decides whether an action slot gets spent.
 */

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

function flowClass(name) {
  const cls = game.lancer?.flows?.get(name);
  if (!cls) throw new Error(`LANCER flow "${name}" is not available`);
  return cls;
}

/**
 * Start a LANCER flow and report whether it ran to the end.
 * @param {boolean} [withOptions]  Pass the flow's own data as step options too. Actor-only
 *   attack flows read their title from the step options and fall back to "BASIC ATTACK" /
 *   "TECH ATTACK" otherwise.
 */
async function runFlow(name, doc, data, withOptions = false) {
  const Flow = flowClass(name);
  const flow = new Flow(doc, data);
  const ok = withOptions ? await flow.begin(flow.state.data) : await flow.begin();
  return ok !== false;
}

/** Flow step: mark the attack as a tech attack against E-Defense. */
const MARK_TECH_STEP = "lancer-flight-deck.markTechAttack";

function markTechAttack(state) {
  const weapon = state.data?.acc_diff?.weapon;
  if (weapon) {
    weapon.tech = true;
    weapon.smart = true;
  }
  if (state.data) state.data.is_smart = true;
  return true;
}

/**
 * LANCER only treats an actor-level attack as a tech attack (against E-Defense) when it is
 * titled exactly "TECH ATTACK". A basic invade has its own title, so run it through a
 * TechAttackFlow with one extra step that marks it. The class keeps LANCER's name, so the
 * system's and other modules' flow hooks (lancer.preFlow.TechAttackFlow, ...) still fire,
 * and nothing about LANCER's own TechAttackFlow changes.
 */
function basicInvadeFlow() {
  const Base = flowClass("TechAttackFlow");
  const registry = game.lancer.flowSteps;
  if (!registry.has(MARK_TECH_STEP)) registry.set(MARK_TECH_STEP, markTechAttack);
  const steps = [...Base.steps];
  const at = steps.indexOf("initTechAttackData");
  steps.splice(at < 0 ? 0 : at + 1, 0, MARK_TECH_STEP);
  return class TechAttackFlow extends Base {
    static steps = steps;
  };
}

/** Post a basic action's card (LANCER's generic text card). */
function basicCard(actor, def, extraHtml = "") {
  const text = textId(def);
  return runFlow("SimpleTextFlow", actor, {
    title: game.i18n.localize(`LFD.Basic.${text}.Name`).toUpperCase(),
    description: `<p>${esc(game.i18n.localize(`LFD.Basic.${text}.Text`))}</p>${extraHtml}`,
    tags: [],
  });
}

function targetActors(targets) {
  const seen = new Map();
  for (const token of targets) if (token.actor && !seen.has(token.actor.uuid)) seen.set(token.actor.uuid, token.actor);
  return [...seen.values()];
}

/**
 * @param {object} entry  From buildMenu's entries map
 * @param {{actor: Actor, targets: Token[], token: TokenDocument|null}} ctx
 * @returns {Promise<boolean>}
 */
export async function runEntry(entry, { actor, targets, token }) {
  const def = entry.def;
  if (def?.singleTarget && targets.length !== 1) {
    return warn(targets.length ? "LFD.Hud.OneTarget" : "LFD.Hud.NeedsTarget");
  }
  switch (entry.type) {
    case "chat":
      return basicCard(actor, def);

    case "basicAttack":
      return runFlow("BasicAttackFlow", actor, { title: ATTACK_TITLES[def.id] }, true);

    case "invade": {
      const Flow = basicInvadeFlow();
      const flow = new Flow(actor, {
        title: ATTACK_TITLES.fragment,
        invade: true,
        attack_type: "Tech",
        effect: `<p>${esc(game.i18n.localize("LFD.Basic.fragment.Text"))}</p>`,
      });
      return (await flow.begin(flow.state.data)) !== false;
    }

    case "lockon": {
      const actors = targetActors(targets);
      if (!actors.length) return warn("LFD.Hud.NeedsTarget");
      const { applied } = await setStatus(actors, STATUS.LOCK_ON, true);
      if (!applied) return false;
      const names = actors.map(a => esc(a.name)).join(", ");
      return basicCard(actor, def, `<p><b>${esc(game.i18n.localize("LFD.Hud.Readout.Target"))}:</b> ${names}</p>`);
    }

    case "scan": {
      const target = targets[0];
      if (!target) return warn("LFD.Hud.NeedsTarget");
      return (await actor.beginScanFlow(target)) !== false;
    }

    case "selfStatus": {
      const { applied } = await setStatus([actor], def.status, def.active);
      if (!applied) return false;
      return basicCard(actor, def);
    }

    case "meltdown": {
      if (!(await startMeltdown(actor))) return false;
      return basicCard(actor, def);
    }

    case "stabilize":
      return (await actor.beginStabilizeFlow()) !== false;

    case "overcharge":
      return (await actor.beginOverchargeFlow()) !== false;

    case "core": {
      const frame = actor.system?.loadout?.frame?.value;
      if (!frame) return warn("LFD.Error.NoFrame");
      const before = Number(actor.system.core_energy) || 0;
      await frame.beginCoreActiveFlow("system.core_system");
      // The flow doesn't report back; it spent the core power if it went through
      return (Number(actor.system.core_energy) || 0) < before;
    }

    case "frameText":
      return runFlow("SimpleTextFlow", entry.item, {
        title: entry.title,
        description: textWithActions(entry.description, entry.actions, entry.title),
      });

    case "activation":
      return runFlow("ActivationFlow", entry.item, { action_path: entry.path });

    case "techAction": {
      // What ActivationFlow does for tech actions, but awaited, so we know whether it went through
      const { item, action } = entry;
      const gearTags = item.type === "mech_system" || item.type === "npc_feature" ? item.system.tags : [];
      return runFlow("TechAttackFlow", item, {
        title: action.name,
        invade: action.activation === "Invade",
        attack_type: "Tech",
        action,
        effect: action.detail,
        tags: gearTags,
      });
    }

    case "weapon":
      return runFlow("WeaponAttackFlow", entry.weapon, {});

    case "system":
      // The full text, as information: posting it never spends a use or applies heat
      if (!entry.item) return false;
      return runFlow("SimpleHTMLFlow", entry.item, { html: await systemChatCard(entry.item) });

    case "moveMode":
      if (!token?.isOwner) return warn("LFD.Hud.NoToken");
      await token.update({ movementAction: entry.mode });
      return true;

    case "resetMove":
      await actor.update({ "system.action_tracker.move": Number(actor.system?.speed) || 0 });
      return true;
  }
  console.warn("Flight Deck | Unknown HUD entry", entry);
  return false;
}

function warn(key) {
  ui.notifications.warn(game.i18n.localize(key));
  return false;
}

/* -------------------------------------------- */
/*  Action economy                              */
/* -------------------------------------------- */

/* -------------------------------------------- */
/*  Reactions: each one once per round          */
/* -------------------------------------------- */

const REACTIONS_FLAG = "usedReactions";

/** The started combat this actor is fighting in, if any. */
function activeCombatOf(actor) {
  return game.combats.find(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid || cb.actorId === actor.id)) ?? null;
}

/**
 * HUD entry keys of the reactions this actor already took this round. LANCER's tracker only
 * knows "a reaction is available this turn"; the rules also allow each reaction once per round.
 * Stored on the actor with the combat and round it belongs to, so it lapses by itself.
 * @returns {Set<string>}
 */
export function usedReactions(actor) {
  const combat = actor && activeCombatOf(actor);
  const record = actor?.getFlag?.("lancer-flight-deck", REACTIONS_FLAG);
  if (!combat || !record || record.combat !== combat.id || record.round !== combat.round) return new Set();
  return new Set(record.keys ?? []);
}

/** Note that a reaction was taken this round. */
export async function recordReaction(actor, key) {
  const combat = activeCombatOf(actor);
  if (!combat || !actor.isOwner) return;
  const keys = [...usedReactions(actor), key];
  await actor.setFlag("lancer-flight-deck", REACTIONS_FLAG, { combat: combat.id, round: combat.round, keys: [...new Set(keys)] });
}

/** True if the actor is a combatant in a combat that has started. */
export function inActiveCombat(actor) {
  if (!actor) return false;
  return game.combats.some(c => c.started && c.combatants.some(cb => cb.actor?.uuid === actor.uuid || cb.actorId === actor.id));
}

/**
 * Tracker changes, with LANCER's own rules (apps/action/actor-actions.ts `modAction`):
 * a quick action uses up the full action first; a full action uses both.
 * @param {"quick"|"full"|"reaction"|"protocol"} kind
 * @param {boolean} spend  false refreshes the slot
 */
export function trackerChange(tracker, kind, spend, speed = 0) {
  const a = { ...tracker };
  switch (kind) {
    case "quick":
      if (spend) a.full ? (a.full = false) : (a.quick = false);
      else a.quick = true;
      break;
    case "full":
      a.full = !spend;
      a.quick = !spend;
      break;
    case "reaction":
      a.reaction = !spend;
      break;
    case "protocol":
      a.protocol = !spend;
      break;
    case "move":
      a.move = spend ? 0 : speed;
      break;
    default:
      return null;
  }
  return a;
}
