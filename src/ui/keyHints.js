/**
 * A footer hint line ("Hover: detail · Click: execute · Esc: close") split into key/action pairs, so a
 * template can set each key apart. At footer size a "▸" or "·" between words reads as one run.
 * @param {string} text   Localized hint line: pairs joined by " · ", each "Key: action"
 * @returns {{key: string, action: string}[]}
 */
export function keyHints(text) {
  return String(text ?? "")
    .split(" · ")
    .filter(Boolean)
    .map(part => {
      const at = part.indexOf(": ");
      return at < 0 ? { key: "", action: part } : { key: part.slice(0, at), action: part.slice(at + 2) };
    });
}
