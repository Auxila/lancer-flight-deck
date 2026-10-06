import { formatPct } from "../../core/Odds.js";

/** Segmented heat bar with the Danger Zone boundary and the Overcharge ladder. */
export function buildHeat(t, { editable = false } = {}) {
  const { value, max, dangerAt, inDanger, over } = t.heat;
  const oc = t.overcharge;
  const odds = oc.odds;
  const ocView = {
    cost: oc.cost ?? "—",
    rungs: oc.rungs.map((label, i) => ({ label, current: i === oc.index, spent: i < oc.index })),
    // Where the next Overcharge sits on the ladder (dial themes point at it)
    index: oc.index,
    count: oc.rungs.length,
    range: odds ? `${odds.heatMin}–${odds.heatMax}` : null,
    pOverCap: odds && max > 0 ? formatPct(odds.pOverCap) : null,
    risk: !odds || max <= 0 ? "none" : odds.pOverCap >= 0.5 ? "high" : odds.pOverCap > 0 ? "some" : "none",
  };

  if (!(max > 0)) return { hasCap: false, value, inDanger, oc: ocView, editable };

  // One segment per point of heat while that stays legible; a continuous bar beyond.
  const segmented = max <= 20;
  const segments = segmented
    ? Array.from({ length: max }, (_, i) => {
        const n = i + 1;
        return { n, filled: n <= value, danger: n >= dangerAt, boundary: n === dangerAt };
      })
    : [];
  return {
    hasCap: true,
    editable,
    value,
    max,
    dangerAt,
    inDanger,
    over,
    overBy: Math.max(0, value - max),
    segmented,
    segments,
    fillPct: Math.min(100, (value / max) * 100).toFixed(1),
    dangerPct: (((dangerAt - 1) / max) * 100).toFixed(1),
    oc: ocView,
  };
}
