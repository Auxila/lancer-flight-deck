/**
 * The cold boot's terminal stream: dense, mech-specific log lines that pour down the panel before the
 * finish. Pure (no Foundry), so it can be tested in Node; randomness comes from a seeded generator.
 */
import { mulberry32 } from "../damage/fracture.js";

/** Characters per line: a full row of the panel in the stream's monospace. */
export const WIDTH = 46;

/**
 * "LABEL ........ STATUS", padded to the stream's width.
 * @param {string} label
 * @param {string} status
 */
export function leader(label, status, width = WIDTH) {
  const room = width - status.length - 1;
  // Long labels give way to an ellipsis, keeping at least two leader dots
  const text = label.length > room - 3 ? `${label.slice(0, room - 4)}…` : label;
  return `${text} ${".".repeat(Math.max(2, room - text.length - 1))} ${status}`;
}

/**
 * @typedef {object} BootData
 * @property {string} mech           Mech name
 * @property {string} frame          Frame name
 * @property {string} manufacturer   Manufacturer code, e.g. "GMS"
 * @property {string} pilot          Callsign
 * @property {Array<{mount: string, name: string}>} weapons
 * @property {string[]} systems
 * @property {{hp: number[], heat: number[], structure: number[], stress: number[]}} tracks  [value, max]
 * @property {{evasion: number, edef: number, sensors: number, speed: number}} stats
 * @property {boolean} danger        In the Danger Zone
 * @property {string[]} [flavour]    The theme's own boot lines (manufacturer firmware, etc.)
 * @property {{caption: string, title: string, stamp: string}} [boot]  i18n keys for the theme's finish card
 */

/**
 * The stream, top to bottom. Kinds: "hex" (memory dump), "dim" (routine), "ok" / "accent" / "warn"
 * (status in that colour).
 * @param {BootData} d
 * @param {number} seed
 * @returns {Array<{text: string, kind: string}>}
 */
export function bootStream(d, seed = 1) {
  const rand = mulberry32(seed >>> 0);
  const pick = list => list[Math.floor(rand() * list.length)];
  const hex = (n, len = 2) => Math.floor(rand() * n).toString(16).toUpperCase().padStart(len, "0");
  const up = s => String(s ?? "").toUpperCase();
  let addr = 0x0f00 + Math.floor(rand() * 0x0800);
  const dump = () => {
    addr += 0x10;
    return { text: `0x${addr.toString(16).toUpperCase().padStart(4, "0")}  ${Array.from({ length: 8 }, () => hex(256)).join(" ")}`, kind: "hex" };
  };
  const line = (tag, label, status, kind = "ok") => ({ text: leader(`${tag}  ${label}`, status), kind });

  const [hp, hpMax] = d.tracks.hp;
  const [heat, heatMax] = d.tracks.heat;
  const [st, stMax] = d.tracks.structure;
  const [sr, srMax] = d.tracks.stress;
  const health = st >= stMax && sr >= srMax ? "GREEN" : st <= 1 || sr <= 1 ? "RED" : "AMBER";

  const checks = [
    ...(d.flavour ?? []).map(f => ({ text: up(f), kind: "accent" })),
    line("POST", "CORE BUS", "OK"),
    line("POST", `MEMORY ${pick(["2048", "4096", "8192"])}K`, "OK"),
    line("POST", "GYRO CLUSTER", "OK"),
    line("POST", "SERVO ARRAY", "OK"),
    line("POST", "COOLANT LOOP", "OK"),
    ...d.weapons.map((w, i) => line("WPN", `M${i + 1} ${up(w.mount)} // ${up(w.name)}`, "ARMED")),
    ...d.systems.map(s => line("SYS", up(s), "ONLINE")),
    line("RCT", `CAP ${heatMax} // HEAT ${heat}`, d.danger ? "DANGER" : "NOMINAL", d.danger ? "warn" : "ok"),
    line("STR", `STRUCTURE ${st}/${stMax} // STRESS ${sr}/${srMax}`, health, health === "GREEN" ? "ok" : "warn"),
    line("HUL", `HP ${hp}/${hpMax}`, "SEALED"),
    line("DEF", `EVA ${d.stats.evasion} // E-DEF ${d.stats.edef}`, "SET"),
    line("SNS", `RANGE ${d.stats.sensors} // SWEEP`, "CLEAR"),
    line("MOV", `SPEED ${d.stats.speed} // GAIT`, "TRIM"),
    line("NHP", "COGNITIVE SANDBOX", "SEALED"),
    line("LNK", "OMNINET RELAY", "SYNC"),
    line("LNK", `PILOT ${up(d.pilot)} // NEURAL`, "LINKED", "accent"),
    line("SYS", `${up(d.manufacturer)} ${up(d.frame)} // ${up(d.mech)}`, "READY", "accent"),
  ];
  // One or two routine warnings, compensated: a live machine, not a perfect one
  const warnings = ["ACTUATOR 3 DRIFT", "COOLANT PRESSURE LOW", "SENSOR GHOST 0.2°", "SERVO LAG 4MS"];
  for (let i = 0, n = 1 + Math.floor(rand() * 2); i < n; i++) {
    checks.splice(1 + Math.floor(rand() * (checks.length - 1)), 0, line("WRN", pick(warnings), "COMP", "warn"));
  }
  // Interleave memory dumps between the checks: roughly two in five lines are hex
  const out = [];
  for (const c of checks) {
    while (rand() < 0.42) out.push(dump());
    out.push(c);
  }
  while (out.length < 48) out.push(rand() < 0.75 ? dump() : line("CHK", `SECTOR ${hex(4096, 3)}`, "OK", "dim"));
  return out;
}
