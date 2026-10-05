import { formatPct } from "../../core/Odds.js";

/** Structure and stress pips, each with the odds of its next check. */
export function buildIntegrity(t) {
  return {
    tracks: [track("structure", t.structure), track("stress", t.stress)],
  };
}

function track(kind, { value, max, next }) {
  const i18n = game.i18n;
  const isStructure = kind === "structure";
  const view = {
    kind,
    label: isStructure ? "LFD.Integrity.Structure" : "LFD.Integrity.Stress",
    value,
    max,
    pips: Array.from({ length: Math.max(0, max) }, (_, i) => ({ intact: i < value })),
    state: next.state,
  };

  if (next.state === "destroyed") {
    view.headline = i18n.localize(isStructure ? "LFD.Integrity.FrameLost" : "LFD.Integrity.ReactorLost");
    return view;
  }
  if (next.state === "lethal") {
    view.headline = i18n.localize(isStructure ? "LFD.Integrity.NextHitLethal" : "LFD.Integrity.NextOverheatLethal");
    view.destroyPct = "100%";
    view.tooltip =
      `<div class="lfd-tip"><header><strong>${i18n.localize(view.label)}</strong></header>` +
      `<p>${i18n.localize(isStructure ? "LFD.Integrity.LethalTipStructure" : "LFD.Integrity.LethalTipStress")}</p></div>`;
    return view;
  }

  const segments = next.bands.map(b => ({
    key: b.key,
    kind: b.kind,
    label: i18n.localize(`LFD.Bands.${b.key}`),
    pct: formatPct(b.p),
    width: (b.p * 100).toFixed(2),
    check: !!b.check,
  }));
  view.dice = `${next.dice}d6`;
  view.altRules = next.rules === "alt";
  view.destroyPct = formatPct(next.destroy);
  // Nothing destroys outright, but a failed check can: say so rather than "Loss 0%"
  view.lossOnCheck = !(next.destroy > 0) && next.destroyOnFailedCheck > 0;
  view.loss = view.lossOnCheck
    ? i18n.format("LFD.Integrity.LossOnCheck", {
        pct: formatPct(next.destroyOnFailedCheck),
        stat: i18n.localize(isStructure ? "LFD.Check.Hull.Short" : "LFD.Check.Engineering.Short"),
      })
    : i18n.format("LFD.Integrity.Loss", { pct: view.destroyPct });
  view.segments = segments;
  view.checkNote =
    next.destroyOnFailedCheck > 0
      ? i18n.format("LFD.Integrity.CheckNote", {
          pct: formatPct(next.destroyOnFailedCheck),
          stat: i18n.localize(isStructure ? "LFD.Stat.Hull" : "LFD.Stat.Engineering"),
        })
      : null;
  const rows = segments
    .map(s => `<div class="lfd-tip-row lfd-k-${s.kind}"><span>${s.label}</span><b>${s.pct}</b></div>`)
    .join("");
  const title = i18n.localize(isStructure ? "LFD.Integrity.StructureCheck" : "LFD.Integrity.StressCheck");
  // Several dice only once more than one box is marked; then the lowest decides
  const dice = next.dice > 1 ? i18n.format("LFD.Integrity.TipDiceLowest", { dice: view.dice }) : view.dice;
  view.tooltip =
    `<div class="lfd-tip lfd-tip-odds"><header><strong>${title}</strong><span>${dice}</span></header>` +
    `<div class="lfd-tip-rows">${rows}</div>` +
    (view.checkNote ? `<p class="lfd-tip-note">${view.checkNote}</p>` : "") +
    (view.altRules ? `<p class="lfd-tip-aside">${i18n.localize("LFD.Integrity.AltRulesTip")}</p>` : "") +
    `</div>`;
  return view;
}
