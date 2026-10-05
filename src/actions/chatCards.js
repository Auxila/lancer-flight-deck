/**
 * Complete chat cards for gear that LANCER's own cards cut short.
 *
 * LANCER's system card prints only a system's `effect` and tags, yet many systems keep their
 * rules in their actions (Neurospike's invade options, for one) or describe deployables.
 * Its sheet "send to chat" view starts collapsed and folds triggered actions away. These
 * cards print every rule, always expanded, in LANCER's own chat styling (card, headers,
 * overlines, tag chips), so they sit naturally next to the system's cards. Flavor text stays out.
 *
 * They are informational: posting a system never spends a Limited use or applies heat.
 * Using gear is what the action menus are for.
 */

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));
const loc = key => game.i18n.localize(key);
const fmt = (key, data) => game.i18n.format(key, data);

/** LANCER fills empty descriptions with this placeholder. */
const NO_DESCRIPTION = /^\s*(<p>)?\s*no description\.?\s*(<\/p>)?\s*$/i;

let tagTemplate = null;
/** LANCER's own tag chips (its `tag-list` Handlebars helper). */
function tagChips(tags) {
  if (!tags?.length || !Handlebars.helpers["tag-list"]) return "";
  tagTemplate ??= Handlebars.compile('{{{tag-list "tags"}}}');
  try {
    return tagTemplate({ tags });
  } catch (err) {
    console.warn("Flight Deck | Could not render tags", err);
    return "";
  }
}

function frequencyText(frequency) {
  const text = frequency ? String(frequency) : "";
  return text && text !== "Unlimited" && text !== "[object Object]" ? text : null;
}

/**
 * Every action spelled out: name, activation, heat, frequency, and its init / trigger /
 * effect text, never collapsed.
 * @param {object[]} actions   LANCER ActionData
 * @param {string} fallbackName  For actions named just "Action"
 */
export function actionBlocks(actions, fallbackName = "") {
  return (actions ?? [])
    .map(action => {
      const name = /^\s*(action|activate|activation|use)?\s*$/i.test(action.name ?? "") ? fallbackName : action.name;
      const meta = [
        action.activation,
        Number(action.heat_cost) > 0 ? fmt("LFD.Systems.Heat", { n: action.heat_cost }) : null,
        frequencyText(action.frequency),
      ].filter(Boolean);
      const blocks = [
        `<div class="lancer-mini-header lfd-chat-action-head"><span>${esc(name)}</span>${meta.length ? `<span>${esc(meta.join(" · "))}</span>` : ""}</div>`,
      ];
      if (action.init) blocks.push(`<div class="overline">${esc(loc("LFD.Chat.Init"))}</div><div class="effect-text">${action.init}</div>`);
      if (action.trigger) {
        blocks.push(`<div class="overline">${esc(loc("LFD.Chat.Trigger"))}</div><div class="effect-text">${action.trigger}</div>`);
        blocks.push(`<div class="overline">${esc(loc("LFD.Chat.Effect"))}</div>`);
      }
      if (action.detail) blocks.push(`<div class="effect-text">${action.detail}</div>`);
      return `<div class="lfd-chat-action">${blocks.join("")}</div>`;
    })
    .join("");
}

/** A deployable the gear creates (drone, turret, mine...), from the world or the compendium. */
async function deployableBlock(lid) {
  let doc = null;
  try {
    doc = await game.lancer?.fromLid?.(lid);
  } catch {
    doc = null;
  }
  if (!doc) return "";
  const s = doc.system ?? {};
  const stats = [
    s.size ? fmt("LFD.Chat.Size", { n: s.size }) : null,
    s.hp?.max ? `HP ${s.hp.max}` : null,
    s.evasion ? `EVA ${s.evasion}` : null,
    s.edef ? `E-DEF ${s.edef}` : null,
    s.armor ? `ARMOR ${s.armor}` : null,
  ].filter(Boolean);
  const meta = [s.activation ? fmt("LFD.Chat.Deploy", { activation: s.activation }) : null, ...stats];
  return `<div class="lfd-chat-deployable">
    <div class="lancer-mini-header lfd-chat-action-head"><span>${esc(doc.name)}</span><span>${esc(loc("LFD.Chat.Deployable"))}</span></div>
    ${meta.length ? `<div class="lfd-chat-meta">${meta.map(m => `<span>${esc(m)}</span>`).join("")}</div>` : ""}
    ${s.detail ? `<div class="effect-text">${s.detail}</div>` : ""}
    ${actionBlocks(s.actions, doc.name)}
  </div>`;
}

/**
 * A mech system's full text, for chat.
 * @param {Item} item  A mech_system
 * @returns {Promise<string>} HTML
 */
export async function systemChatCard(item) {
  const s = item.system ?? {};
  const tags = (s.tags ?? []).filter(t => t && !t.hidden);
  const limited = tags.find(t => t.lid === "tg_limited");
  const uses = limited ? { value: Number(s.uses?.value) || 0, max: Number(s.uses?.max) || Number(limited.val) || 0 } : null;
  const state = s.destroyed ? "destroyed" : s.cascading ? "cascading" : uses && uses.value <= 0 ? "spent" : null;

  const meta = [
    s.type || loc("LFD.Systems.System"),
    s.sp ? fmt("LFD.Systems.SP", { sp: s.sp }) : null,
    uses ? fmt("LFD.Systems.Uses", { uses: `${uses.value}/${uses.max}` }) : null,
  ].filter(Boolean);

  const body = [`<div class="lfd-chat-meta">${meta.map(m => `<span>${esc(m)}</span>`).join("")}</div>`];
  if (state) body.push(`<div class="lfd-chat-state">${esc(loc(`LFD.Systems.State.${state}`))}</div>`);
  if (s.effect) body.push(`<div class="effect-text">${s.effect}</div>`);
  // The description is flavor text, left out; unless a system keeps all its rules there (as the hover card does)
  else if (!s.actions?.length && s.description && !NO_DESCRIPTION.test(s.description)) body.push(`<div class="effect-text">${s.description}</div>`);
  body.push(actionBlocks(s.actions, item.name));
  for (const lid of s.deployables ?? []) body.push(await deployableBlock(lid));
  body.push(tagChips(tags));

  return `<div class="card clipped-bot lfd-chat-card" style="margin: 0px;">
  <div class="lancer-header lancer-system">// ${esc(item.name.toUpperCase())} //</div>
  <div class="lfd-chat-body">${body.join("")}</div>
</div>`;
}

/** Description plus any actions, for frame traits and the core passive. */
export function textWithActions(description, actions, fallbackName) {
  return `${description ?? ""}${actionBlocks(actions, fallbackName)}`;
}
