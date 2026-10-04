import { GMSTheme } from "./GMSTheme.js";

/** Registered themes, by id. GMS is the fallback and must always exist. */
const THEMES = new Map([[GMSTheme.id, GMSTheme]]);
const FALLBACK = GMSTheme;

/**
 * Register an additional manufacturer theme (later phases, or other modules).
 * @param {typeof import("./BaseTheme.js").BaseTheme} theme
 */
export function registerTheme(theme) {
  if (!theme?.id) throw new Error("Flight Deck | A theme needs a static id");
  THEMES.set(theme.id, theme);
}

export function getThemes() {
  return [...THEMES.values()];
}

/** Choices for the theme setting: "auto" plus every registered theme. */
export function themeChoices() {
  const choices = { auto: "LFD.Settings.Theme.Auto" };
  for (const theme of THEMES.values()) choices[theme.id] = theme.label;
  return choices;
}

/**
 * Pick the theme for a frame manufacturer, honouring a player's override.
 * @param {string|null} manufacturer  e.g. "GMS", "IPS-N", "SSC", "HORUS", "HA"
 * @param {string} override           "auto" or a theme id
 */
export function resolveTheme(manufacturer, override = "auto") {
  if (override && override !== "auto" && THEMES.has(override)) return THEMES.get(override);
  const code = String(manufacturer ?? "").toUpperCase();
  for (const theme of THEMES.values()) {
    if (theme.manufacturers.includes(code)) return theme;
  }
  return FALLBACK;
}
