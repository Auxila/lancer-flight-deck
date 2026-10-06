import { GMSTheme } from "./GMSTheme.js";
import { IPSNTheme } from "./IPSNTheme.js";
import { SSCTheme } from "./SSCTheme.js";

/**
 * Registered themes, by id: GMS (the fallback, which must always exist), then each core maker as it's
 * finished. HORUS and HA have first-pass foundations alongside (HORUSTheme.js, HATheme.js and their
 * styles/themes/*.css) and are registered, and added to module.json's styles, when they're done.
 */
const THEMES = new Map([GMSTheme, IPSNTheme, SSCTheme].map(theme => [theme.id, theme]));
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
 * Pick the theme for a frame manufacturer, honouring a player's override. Makers without a theme yet
 * (third-party LCPs: BDF, MPAL, Iridia...) use GMS.
 * @param {string|null} manufacturer  e.g. "GMS", "IPS-N", "SSC", "HORUS", "HA"
 * @param {string} override           "auto" or a theme id
 */
export function resolveTheme(manufacturer, override = "auto") {
  if (override && override !== "auto" && THEMES.has(override)) return THEMES.get(override);
  const code = String(manufacturer ?? "").trim().toUpperCase();
  for (const theme of THEMES.values()) {
    if (theme.manufacturers.includes(code)) return theme;
  }
  return FALLBACK;
}
