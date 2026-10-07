import { GMSTheme } from "./GMSTheme.js";
import { IPSNTheme } from "./IPSNTheme.js";
import { SSCTheme } from "./SSCTheme.js";
import { HORUSTheme } from "./HORUSTheme.js";
import { HATheme } from "./HATheme.js";
import { MODULE_ID, THEME_FLAG } from "../constants.js";

/**
 * Registered themes, by id: GMS (the fallback, which must always exist), then the Big Four: IPS-N, SSC,
 * HORUS and HA. Makers without a theme (LCP manufacturers) use GMS.
 */
const THEMES = new Map([GMSTheme, IPSNTheme, SSCTheme, HORUSTheme, HATheme].map(theme => [theme.id, theme]));
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
 * A mech's own theme, picked by its owner and kept on the actor, so every player who views the mech sees
 * the same cockpit: "auto" (match its frame) or a registered theme id. Null when nobody has picked one,
 * or the pick is a theme that's no longer registered. Read raw (an unlinked token's delta is merged in).
 * @param {Actor|null} actor
 * @returns {string|null}
 */
export function mechThemeId(actor) {
  const id = actor?.flags?.[MODULE_ID]?.[THEME_FLAG];
  return id === "auto" || THEMES.has(id) ? id : null;
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
