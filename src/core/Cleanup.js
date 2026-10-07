import { MODULE_ID, SETTINGS } from "../constants.js";
import { ART_FX_PREFIX } from "../fx/presets.js";

/**
 * What Flight Deck leaves in a world, and a way to take it out, before uninstalling for instance.
 *
 *  - Token Magic FX filters on token art (ids starting "lfd-": Exposed fire, Shredded smoke, Jammed and
 *    Impaired electricity). They're saved on the token, so they would outlive the module.
 *  - Its own flags on actors: the record of which reactions were used this round, and a mech's cockpit
 *    theme (picked from the badge).
 *
 * Everything else Flight Deck does is ordinary game state made through LANCER (conditions, HP, heat,
 * the action tracker, a meltdown countdown, deployable tokens), and stays. The world setting
 * "Condition effects on token art" is turned off too, or the filters would come straight back.
 */

const raw = (doc, path) => foundry.utils.getProperty(doc, path);

/** Find everything Flight Deck stored, on every scene and actor (GM only). */
export function scanWorld() {
  const tokens = [];
  const actors = new Map();
  for (const scene of game.scenes ?? []) {
    for (const doc of scene.tokens) {
      const filters = raw(doc, "flags.tokenmagic.filters") ?? [];
      const ids = [...new Set(filters.map(f => f?.tmFilters?.tmFilterId).filter(id => typeof id === "string" && id.startsWith(ART_FX_PREFIX)))];
      if (ids.length) tokens.push({ doc, ids });
      // An unlinked token's actor keeps its own flags in the token's delta
      if (!doc.actorLink && hasOwnFlags(raw(doc, "delta.flags")) && doc.actor) actors.set(doc.actor.uuid, doc.actor);
    }
  }
  for (const actor of game.actors ?? []) if (hasOwnFlags(actor.flags)) actors.set(actor.uuid, actor);
  return { tokens, actors: [...actors.values()] };
}

function hasOwnFlags(flags) {
  const own = flags?.[MODULE_ID];
  return !!own && typeof own === "object" && Object.keys(own).length > 0;
}

/**
 * Remove what scanWorld found. Filters on the scene in view go through Token Magic (so the art updates
 * at once); on other scenes, or without Token Magic, only Flight Deck's entries are taken out of the
 * token's saved filter list.
 * @returns {Promise<{filters: number, actors: number}>}
 */
export async function removeFlightDeckData(found = scanWorld()) {
  if (!game.user.isGM) throw new Error("Only a GM can remove Flight Deck data");
  const tmfx = game.modules.get("tokenmagic")?.active && typeof globalThis.TokenMagic !== "undefined";
  let filters = 0;
  for (const { doc, ids } of found.tokens) {
    const live = tmfx && doc.object && doc.parent === canvas?.scene;
    if (live) {
      for (const id of ids) await globalThis.TokenMagic.deleteFilters(doc.object, id);
    } else {
      const kept = (raw(doc, "flags.tokenmagic.filters") ?? []).filter(f => !ids.includes(f?.tmFilters?.tmFilterId));
      await doc.update({ "flags.tokenmagic.filters": kept });
    }
    filters += ids.length;
  }
  for (const actor of found.actors) {
    for (const key of Object.keys(actor.flags?.[MODULE_ID] ?? {})) await actor.unsetFlag(MODULE_ID, key);
  }
  // Last, so the art writer doesn't race the removal above (turning it off removes filters too)
  if (game.settings.get(MODULE_ID, SETTINGS.ART_FX_WORLD)) await game.settings.set(MODULE_ID, SETTINGS.ART_FX_WORLD, false);
  return { filters, actors: found.actors.length };
}

/** Scan, show what was found, and remove it on confirmation. */
export async function runCleanup() {
  const i18n = game.i18n;
  if (!game.user.isGM) return ui.notifications.warn(i18n.localize("LFD.Cleanup.GmOnly"));
  const found = scanWorld();
  const filterCount = found.tokens.reduce((n, t) => n + t.ids.length, 0);
  if (!filterCount && !found.actors.length) return ui.notifications.info(i18n.localize("LFD.Cleanup.Nothing"));
  const esc = foundry.utils.escapeHTML;
  const list = names => (names.length > 8 ? `${names.slice(0, 8).map(esc).join(", ")}…` : names.map(esc).join(", "));
  const content =
    `<p>${esc(i18n.localize("LFD.Cleanup.Intro"))}</p><ul>` +
    (filterCount ? `<li>${esc(i18n.format("LFD.Cleanup.Filters", { n: filterCount, tokens: found.tokens.length }))} <em>${list(found.tokens.map(t => t.doc.name))}</em></li>` : "") +
    (found.actors.length ? `<li>${esc(i18n.format("LFD.Cleanup.Actors", { n: found.actors.length }))} <em>${list(found.actors.map(a => a.name))}</em></li>` : "") +
    `</ul><p>${esc(i18n.localize("LFD.Cleanup.Keeps"))}</p>`;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "LFD.Cleanup.Title", icon: "fa-solid fa-broom" },
    content,
    yes: { label: "LFD.Cleanup.Confirm", icon: "fa-solid fa-broom" },
    no: { label: "LFD.Cleanup.Cancel" },
    rejectClose: false,
  });
  if (!ok) return;
  const done = await removeFlightDeckData(found);
  ui.notifications.info(i18n.format("LFD.Cleanup.Done", done));
}

/** Configure Settings button: it opens the confirmation instead of a window of its own. */
export class CleanupMenu extends foundry.applications.api.ApplicationV2 {
  async render() {
    await runCleanup();
    return this;
  }
}
