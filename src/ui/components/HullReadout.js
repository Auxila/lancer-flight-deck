/** HP, overshield, armor and the defensive stat strip. */
export function buildHull(t, { editable = false } = {}) {
  const { value, max } = t.hp;
  const pct = max > 0 ? clampPct((value / max) * 100) : 0;
  const osPct = max > 0 ? clampPct((t.overshield / max) * 100) : 0;
  const signed = n => (n >= 0 ? `+${n}` : `${n}`);
  return {
    hp: { value, max, pct, low: max > 0 && value * 4 <= max, negative: value < 0 },
    editable,
    overshield: t.overshield,
    osPct,
    armor: t.armor,
    burn: t.burn,
    stats: [
      { key: "LFD.Stat.Evasion", value: t.stats.evasion },
      { key: "LFD.Stat.EDef", value: t.stats.edef },
      { key: "LFD.Stat.Speed", value: t.stats.speed },
      { key: "LFD.Stat.Sensors", value: t.stats.sensors },
      { key: "LFD.Stat.Save", value: t.stats.save },
      { key: "LFD.Stat.Tech", value: signed(t.stats.tech) },
    ],
    checks: CHECKS.map(({ id, key }) => {
      const bonus = t.checks?.[id] ?? 0;
      return { id, key, bonus: signed(bonus), formula: `1d20${bonus ? signed(bonus) : ""}` };
    }),
  };
}

/** LANCER's four mech checks, in the book's HASE order. `id` is the system field (system.hull...). */
export const CHECKS = [
  { id: "hull", key: "Hull" },
  { id: "agi", key: "Agility" },
  { id: "sys", key: "Systems" },
  { id: "eng", key: "Engineering" },
];

function clampPct(n) {
  return Math.round(Math.min(100, Math.max(0, n)) * 10) / 10;
}
