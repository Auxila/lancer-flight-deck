import { MODULE_ID, SETTINGS, TEMPLATE_ROOT, THEME_FLAG } from "../constants.js";
import { getSetting, setSetting } from "../settings.js";
import { getThemes, mechThemeId, resolveTheme } from "../themes/registry.js";
import { keyHints } from "./keyHints.js";

const MENU_ID = `${MODULE_ID}-themes`;
/** Space between the badge and the menu, and the menu and the screen edges (CSS px). */
const GAP = 4;

/**
 * The cockpit theme picker, opened from the manufacturer badge in the panel header.
 *
 * A popover beside the panel, like the HUD menus, so the scrolling panel can't clip it and the battle
 * damage layer can't draw over it. "Match frame" comes first (the theme the frame's manufacturer maps
 * to), then every registered theme, each option drawn in its own colours. Hovering or focusing one
 * previews it on the whole cockpit, its own layout included; choosing it plays that theme's chime and
 * sets it on the mech itself (an actor flag), so every player who has the mech in their panel sees the
 * same cockpit; with no mech linked, or with "Show each mech's own theme" off, it sets the player's own
 * default instead (see #target). Arrow keys move, Enter or Space chooses, Escape closes and returns to
 * the badge.
 */
export class ThemeMenu {
  /** @param {import("../core/FlightDeckManager.js").FlightDeckManager} manager */
  constructor(manager) {
    this.manager = manager;
  }

  /** @type {HTMLElement|null} */
  element = null;

  #onOutside = event => {
    if (this.element?.contains(event.target) || event.target.closest?.("#lancer-flight-deck .lfd-badge")) return;
    this.close();
  };

  #onResize = () => this.position();

  /** Counts opens and closes: an open still rendering when another open or a close comes in is dropped. */
  #ticket = 0;
  #opening = false;

  get isOpen() {
    return !!this.element;
  }

  toggle() {
    // A second click while the first is still opening closes it, as it would once open
    if (this.isOpen || this.#opening) this.close({ focus: true });
    else this.open();
  }

  async open() {
    if (!this.manager.panel?.element || this.manager.collapsed) return;
    this.close();
    const ticket = ++this.#ticket;
    this.#opening = true;
    let html;
    try {
      html = await foundry.applications.handlebars.renderTemplate(`${TEMPLATE_ROOT}/panel/theme-menu.hbs`, this.#view());
    } finally {
      if (ticket === this.#ticket) this.#opening = false;
    }
    if (ticket !== this.#ticket || !this.manager.panel?.element) return;
    const el = document.createElement("section");
    el.id = MENU_ID;
    el.className = `lfd-theme-menu lfd-themed ${this.manager.shownTheme.cssClass}`;
    el.setAttribute("role", "menu");
    el.setAttribute("aria-label", game.i18n.localize("LFD.ThemeMenu.Title"));
    el.innerHTML = html;
    el.classList.toggle("lfd-reduce-motion", !!this.manager.panel.element.classList.contains("lfd-reduce-motion"));
    el.addEventListener("click", event => {
      const option = event.target.closest("[data-theme]");
      if (option) this.#choose(option.dataset.theme);
    });
    // Preview what's under the pointer, or focused from the keyboard; leaving puts the cockpit back
    el.addEventListener("pointerover", event => {
      const option = event.target.closest("[data-theme]");
      if (option) this.#preview(option.dataset.theme);
    });
    el.addEventListener("pointerleave", () => this.#preview(null));
    el.addEventListener("focusin", event => {
      const option = event.target.closest("[data-theme]");
      if (option) this.#preview(option.dataset.theme);
    });
    el.addEventListener("keydown", event => this.#onKey(event));
    (document.getElementById("interface") ?? document.body).append(el);
    this.element = el;
    document.addEventListener("pointerdown", this.#onOutside, true);
    window.addEventListener("resize", this.#onResize);
    this.position();
    this.#badge()?.setAttribute("aria-expanded", "true");
    (el.querySelector('[aria-checked="true"]') ?? el.querySelector("[data-theme]"))?.focus();
  }

  close({ focus = false } = {}) {
    this.#ticket++;
    this.#opening = false;
    if (!this.element) return;
    this.element.remove();
    this.element = null;
    document.removeEventListener("pointerdown", this.#onOutside, true);
    window.removeEventListener("resize", this.#onResize);
    this.manager.previewTheme(null);
    const badge = this.#badge();
    badge?.setAttribute("aria-expanded", "false");
    if (focus) badge?.focus();
  }

  /** Under the badge, at the panel's zoom; kept on screen. */
  position() {
    const el = this.element;
    const panel = this.manager.panel?.element;
    const badge = this.#badge()?.getBoundingClientRect();
    if (!el || !panel || !badge?.width) return this.close();
    const zoom = panel.getBoundingClientRect().width / panel.offsetWidth || 1;
    el.style.zoom = String(zoom);
    const width = el.offsetWidth * zoom;
    const height = el.offsetHeight * zoom;
    const gap = GAP * zoom;
    const left = Math.max(gap, Math.min(badge.left, window.innerWidth - width - gap));
    // Below the badge if it fits, else above it
    const below = badge.bottom + gap;
    const top = below + height <= window.innerHeight - gap ? below : Math.max(gap, badge.top - gap - height);
    el.style.left = `${Math.round(left / zoom)}px`;
    el.style.top = `${Math.round(top / zoom)}px`;
  }

  /**
   * The theme's skin follows a preview too: the menu, the panel, the HUD. A previewed layout re-renders
   * the header, so the new badge is marked open and the menu re-anchors to it.
   */
  syncTheme() {
    const el = this.element;
    if (!el) return;
    for (const cls of [...el.classList]) if (cls.startsWith("lfd-theme-") && cls !== "lfd-theme-menu") el.classList.remove(cls);
    el.classList.add(this.manager.shownTheme.cssClass);
    this.#badge()?.setAttribute("aria-expanded", "true");
    this.position();
  }

  #badge() {
    return this.manager.panel?.element?.querySelector(".lfd-badge") ?? null;
  }

  /**
   * Who a choice is for: the linked mech's own theme (the panel only links mechs the player owns), unless
   * this player shows their own default everywhere; with no mech linked, the player's own default (the
   * Default cockpit theme setting).
   * @returns {{scope: "mech"|"default", actor: Actor|null, current: string}}
   */
  #target() {
    const actor = this.manager.actor;
    if (actor?.isOwner && getSetting(SETTINGS.MECH_THEMES)) {
      return { scope: "mech", actor, current: this.manager.themeChoice(actor) };
    }
    return { scope: "default", actor: null, current: getSetting(SETTINGS.THEME) };
  }

  #themeFor(id) {
    if (id === "auto") return resolveTheme(this.manager.telemetry?.manufacturer ?? null);
    return getThemes().find(theme => theme.id === id) ?? null;
  }

  #preview(id) {
    this.manager.previewTheme(id ? this.#themeFor(id) : null);
  }

  async #choose(id) {
    const target = this.#target();
    const theme = this.#themeFor(id);
    // A mech without its own pick takes one even if it matches what's on screen: everyone else sees it too
    const same = target.scope === "mech" ? mechThemeId(target.actor) === id : target.current === id;
    if (same) {
      this.close({ focus: true });
    } else {
      // The new theme re-renders the panel (a new badge); focus that one once it's drawn
      const rendered = new Promise(resolve => {
        const hook = Hooks.once("renderFlightDeckPanel", () => resolve());
        setTimeout(() => {
          Hooks.off("renderFlightDeckPanel", hook);
          resolve();
        }, 1500);
      });
      // Save first, while the preview holds the new look, so the cockpit never flashes back
      if (target.scope === "mech") {
        await target.actor.setFlag(MODULE_ID, THEME_FLAG, id);
        // Re-theme now, as the setting's onChange does, rather than on the debounced update signal
        this.manager.relink();
      } else await setSetting(SETTINGS.THEME, id);
      this.close();
      await rendered;
      this.#badge()?.focus();
    }
    if (theme) this.manager.synth.play("chime", { freqs: theme.audio.chime });
  }

  #onKey(event) {
    const options = [...(this.element?.querySelectorAll("[data-theme]") ?? [])];
    const at = options.indexOf(document.activeElement);
    const move = to => {
      event.preventDefault();
      options[(to + options.length) % options.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        return move(at + 1);
      case "ArrowUp":
        return move(at - 1);
      case "Home":
        return move(0);
      case "End":
        return move(options.length - 1);
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        return this.close({ focus: true });
      case "Tab":
        return this.close();
    }
  }

  #view() {
    const i18n = game.i18n;
    const target = this.#target();
    const setting = target.current;
    const themes = getThemes();
    const known = setting === "auto" || themes.some(theme => theme.id === setting);
    const t = this.manager.telemetry;
    const name = t?.name ?? target.actor?.name ?? "";
    const matched = resolveTheme(t?.manufacturer ?? null);
    const frame = t?.frame?.name;
    const option = (id, theme, label, detail) => ({
      id,
      label,
      detail,
      badge: theme.badge,
      themeClass: theme.cssClass,
      checked: id === setting || (id === "auto" && !known),
    });
    return {
      title: i18n.localize("LFD.ThemeMenu.Title"),
      scope: target.scope === "mech" ? i18n.format("LFD.ThemeMenu.ScopeMech", { name }) : i18n.localize("LFD.ThemeMenu.ScopeDefault"),
      options: [
        option(
          "auto",
          matched,
          i18n.localize("LFD.ThemeMenu.Auto"),
          frame ? i18n.format("LFD.ThemeMenu.AutoDetail", { frame, badge: matched.badge }) : i18n.format("LFD.ThemeMenu.AutoNone", { badge: matched.badge })
        ),
        ...themes.map(theme => option(theme.id, theme, i18n.localize(theme.label), theme.tagline ? i18n.localize(theme.tagline) : "")),
      ],
      footer: keyHints(i18n.localize("LFD.ThemeMenu.Footer")),
    };
  }
}
