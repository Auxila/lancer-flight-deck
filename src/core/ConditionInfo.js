/**
 * What each condition does, as a hover card. The rules text is our own short summary (LANCER's
 * status effects only carry a name and an icon), shared by the panel tiles and the NPC Deck.
 */

/** Status and tile ids that mean the same condition. */
const ALIASES = { slow: "slowed", reactor_meltdown: "meltdown" };

const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** The condition key for a status or tile id, or null if we have no description for it. */
export function conditionKey(id) {
  const key = ALIASES[id] ?? id;
  return game.i18n.has(`LFD.Conditions.${key}.Text`) ? key : null;
}

/** A condition's rule as one line ("Prone: attacks against it gain..."), or null if we have none. */
export function conditionLine(id) {
  const key = conditionKey(id);
  if (!key) return null;
  const i18n = game.i18n;
  return `<p><strong>${esc(i18n.localize(`LFD.Conditions.${key}.Name`))}:</strong> ${i18n.localize(`LFD.Conditions.${key}.Text`)}</p>`;
}

/** Plain-text description, for aria labels. */
export function conditionText(id) {
  const key = conditionKey(id);
  return key ? new DOMParser().parseFromString(game.i18n.localize(`LFD.Conditions.${key}.Text`), "text/html").body.textContent : "";
}

/**
 * The hover card for a condition.
 * @param {string} id                     Status or tile id
 * @param {object} [options]
 * @param {string} [options.title]        Heading (defaults to the condition's name)
 * @param {string|null} [options.detail]  A value shown beside the heading, such as "T-2" or "3"
 * @param {string|null} [options.hint]    What a click does here
 * @param {string[]} [options.also]        Further conditions described on the same card
 * @returns {string|null}                 HTML, or null when there's nothing to say
 */
export function conditionCard(id, { title, detail = null, hint = null, also = [] } = {}) {
  const i18n = game.i18n;
  const key = conditionKey(id);
  if (!key && !hint) return null;
  const parts = [];
  const heading = title ?? (key ? i18n.localize(`LFD.Conditions.${key}.Name`) : "");
  if (heading) parts.push(`<header><strong>${esc(heading)}</strong>${detail ? `<span>${esc(detail)}</span>` : ""}</header>`);
  if (key) {
    parts.push(`<p>${i18n.localize(`LFD.Conditions.${key}.Text`)}</p>`);
    // Rules that change with the LANCER Alternative Structure tables
    const alt = `LFD.Conditions.${key}.Alt`;
    if (game.modules.get("lancer-alt-structure")?.active && i18n.has(alt)) parts.push(`<p class="lfd-tip-note">${i18n.localize(alt)}</p>`);
    const ends = `LFD.Conditions.${key}.Ends`;
    if (i18n.has(ends)) parts.push(`<p class="lfd-tip-ends">${i18n.localize(ends)}</p>`);
  }
  for (const line of also.map(conditionLine).filter(Boolean)) parts.push(line);
  if (hint) parts.push(`<footer>${esc(hint)}</footer>`);
  return `<div class="lfd-tip lfd-tip-condition">${parts.join("")}</div>`;
}
