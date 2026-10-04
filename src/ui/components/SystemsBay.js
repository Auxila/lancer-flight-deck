/**
 * The mech's installed systems, in loadout order, for the SYSTEMS AVAILABLE flyout.
 *
 * Field paths come from the LANCER 3.1 data models: models/actors/mech.ts (loadout.systems
 * holds embedded refs, so each entry's `.value` is the Item), models/items/mech_system.ts,
 * models/bits/action.ts and models/bits/tag.ts.
 */

const LIMITED = "tg_limited";
/** Uses at or under this many show as pips; more show as a number. */
const MAX_PIPS = 6;

const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** @returns {Item[]} the installed mech_system items, skipping empty or broken refs */
export function installedSystems(actor) {
  const refs = actor?.system?.loadout?.systems ?? [];
  return refs.map(ref => ref?.value).filter(item => item?.type === "mech_system");
}

/** Limited uses, or null for unlimited systems. */
function usesOf(item) {
  const s = item.system ?? {};
  const limited = (s.tags ?? []).find(t => t?.lid === LIMITED);
  if (!limited) return null;
  return { value: num(s.uses?.value), max: num(s.uses?.max) || num(limited.val) };
}

/** ready | destroyed | cascading | spent */
function stateOf(item) {
  const s = item.system ?? {};
  if (s.destroyed) return "destroyed";
  if (s.cascading) return "cascading";
  const uses = usesOf(item);
  if (uses && uses.value <= 0) return "spent";
  return "ready";
}

/** Plain rows for the flyout template (and its change detection). */
export function readSystems(actor) {
  return installedSystems(actor).map(item => {
    const s = item.system ?? {};
    const state = stateOf(item);
    const uses = usesOf(item);
    const action = s.actions?.[0];
    let readout = null;
    if (state !== "ready") readout = game.i18n.localize(`LFD.Systems.State.${state}`);
    else if (!uses) readout = action?.activation || s.type || null;
    return {
      id: item.id,
      name: item.name,
      state,
      ready: state === "ready",
      readout,
      uses: uses ? `${uses.value}/${uses.max}` : null,
      pips:
        uses && state === "ready" && uses.max <= MAX_PIPS
          ? Array.from({ length: uses.max }, (_, i) => ({ on: i < uses.value }))
          : null,
    };
  });
}

/** Summary for the SYSTEMS AVAILABLE button. */
export function systemsSummary(actor) {
  const items = installedSystems(actor);
  return { total: items.length, ready: items.filter(item => stateOf(item) === "ready").length };
}

/**
 * The hover card: name, type and SP, state, tags, effect text and each action.
 * Effect and action text are the system's own HTML; Foundry's tooltip cleans the string.
 */
export function systemTip(item) {
  const i18n = game.i18n;
  const esc = foundry.utils.escapeHTML;
  const s = item.system ?? {};
  const state = stateOf(item);
  const uses = usesOf(item);

  const kind = [s.type || i18n.localize("LFD.Systems.System"), s.sp ? i18n.format("LFD.Systems.SP", { sp: s.sp }) : null]
    .filter(Boolean)
    .join(" · ");
  const tags = (s.tags ?? [])
    .filter(t => t && !t.hidden && t.name && !t.name.startsWith("Tag not found"))
    .map(t => esc(String(t.name).replace("{VAL}", t.val ?? "")));

  const out = [`<header><strong>${esc(item.name)}</strong><span>${esc(kind)}</span></header>`];
  if (state !== "ready") {
    out.push(`<p class="lfd-tip-state">${esc(i18n.localize(`LFD.Systems.State.${state}`))}</p>`);
  }
  if (tags.length || uses) {
    const usesText = uses ? `<b>${esc(i18n.format("LFD.Systems.Uses", { uses: `${uses.value}/${uses.max}` }))}</b>` : "";
    out.push(`<p class="lfd-tip-tags">${[usesText, ...tags].filter(Boolean).join(" · ")}</p>`);
  }
  if (s.effect) out.push(`<div class="lfd-tip-effect">${s.effect}</div>`);
  for (const action of s.actions ?? []) {
    const meta = [action.activation, action.heat_cost ? i18n.format("LFD.Systems.Heat", { n: action.heat_cost }) : null]
      .filter(Boolean)
      .map(esc)
      .join(" · ");
    out.push(
      `<div class="lfd-tip-action"><p class="lfd-tip-action-head"><b>${esc(action.name || "")}</b><span>${meta}</span></p>` +
        (action.trigger ? `<div><em>${esc(i18n.localize("LFD.Systems.Trigger"))}</em> ${action.trigger}</div>` : "") +
        (action.detail ? `<div>${action.detail}</div>` : "") +
        `</div>`
    );
  }
  // Deployables it creates (drones, turrets, mines...), by name
  const deployables = (s.deployables ?? [])
    .map(lid => {
      try {
        return game.lancer?.fromLidSync?.(lid)?.name ?? null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (deployables.length) {
    out.push(`<p class="lfd-tip-tags"><b>${esc(i18n.localize("LFD.Chat.Deployable"))}:</b> ${deployables.map(esc).join(", ")}</p>`);
  }
  // Some systems keep all their rules in the description
  if (!s.effect && !s.actions?.length && s.description) out.push(`<div class="lfd-tip-effect">${s.description}</div>`);
  out.push(`<footer>${esc(i18n.localize("LFD.Systems.ClickHint"))}</footer>`);
  return `<div class="lfd-tip">${out.join("")}</div>`;
}
