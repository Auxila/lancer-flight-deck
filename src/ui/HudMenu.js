import { MODULE_ID, TEMPLATE_ROOT } from "../constants.js";
import { buildMenu } from "../actions/menus.js";
import { usedReactions } from "../actions/runner.js";
import { HoverCards } from "./HoverCards.js";

const HUD_ID = `${MODULE_ID}-hud`;
/** Space between the panel and the HUD, and the HUD and the screen edges (CSS px). */
const GAP = 6;
/** How long a tile reads SENT after it fires. */
const SENT_MS = 1100;

/**
 * The translucent HUD menus beside the panel's bottom plate: action menus (Invade, Move,
 * Quick, Full, Reaction, Frame), the weapon picker under Skirmish / Barrage / Overwatch,
 * and SYSTEMS AVAILABLE. One is open at a time.
 *
 * It's a sibling of the panel rather than a child, because the panel scrolls (and so clips
 * anything that pokes out). It copies the panel's zoom, theme and motion settings instead.
 *
 * Hover or focus an entry for its full text (shown at once, not after Foundry's half-second
 * tooltip delay, and held for as long as the pointer stays); click to run it. Arrow keys move between entries, Escape closes.
 */
export class HudMenu {
  /** @param {import("../core/FlightDeckManager.js").FlightDeckManager} manager */
  constructor(manager) {
    this.manager = manager;
  }

  /** @type {HTMLElement|null} */
  element = null;
  /** @type {{menu: string, sub?: {type: string, mode: string, fired?: number}}|null} */
  view = null;
  /** Which side of the panel it opened on. It flips left when there's no room on the right. */
  side = "right";
  #key = null;
  /** @type {Map<string, object>} */
  #entries = new Map();
  /** Full-text hover cards on the entries. */
  #cards = new HoverCards({
    selector: "[data-entry]",
    html: el => this.#entries.get(el.dataset.entry)?.tip?.() ?? null,
    cssClass: () => `lfd-hud-tip lfd-themed ${this.manager.theme.cssClass}`,
    direction: () => {
      const { LEFT, RIGHT } = game.tooltip.constructor.TOOLTIP_DIRECTIONS;
      return this.side === "left" ? LEFT : RIGHT;
    },
  });
  /** Entries whose flow is still running (shown pulsing, ignore repeat clicks). */
  #busy = new Set();
  /** Entry key -> time its SENT flash ends (survives the re-renders the action itself causes). */
  #sent = new Map();
  #renderQueued = false;

  get isOpen() {
    return !!this.element;
  }

  /** The menu id currently shown, or null. */
  get menu() {
    return this.view?.menu ?? null;
  }

  async toggle(menu) {
    if (this.menu === menu && !this.view?.sub) return this.close();
    return this.open(menu);
  }

  async open(menu) {
    if (!this.manager.panel?.element || !this.manager.actor) return;
    this.view = { menu };
    if (!this.element) this.#create();
    this.manager.synth.play(menu === "invade" ? "datalink" : "hud");
    this.element.dataset.menu = menu;
    this.sync();
    await this.render({ force: true, animate: true });
    this.manager.refresh(); // the opener shows its open state
  }

  close({ focusOpener = false } = {}) {
    if (!this.element) return;
    const opener = this.#opener();
    this.#cards.detach();
    this.element.remove();
    this.element = null;
    this.view = null;
    this.#key = null;
    this.#entries.clear();
    if (!this.manager.panel) return;
    // Deferred: close can be called mid-render of the panel
    setTimeout(() => {
      this.manager.refresh().then(() => {
        if (focusOpener) this.#openerFor(opener)?.focus();
      });
    }, 0);
  }

  #create() {
    const el = document.createElement("section");
    el.id = HUD_ID;
    el.className = "lfd-hud lfd-themed";
    el.setAttribute("role", "dialog");
    el.addEventListener("click", event => this.#onClick(event));
    el.addEventListener("contextmenu", event => event.preventDefault());
    this.#cards.attach(el);
    el.addEventListener("keydown", event => this.#onKey(event));
    (document.getElementById("interface") ?? document.body).append(el);
    this.element = el;
  }

  /** Redraw if anything shown changed (economy, uses, targets, another mech selected). */
  async render({ force = false, animate = false } = {}) {
    const el = this.element;
    if (!el || !this.view) return;
    const actor = this.manager.actor;
    const t = this.manager.telemetry;
    if (!actor || !t) return this.close();
    const ctx = this.#context();
    const { vm, entries } = buildMenu(this.view, ctx);
    const key = JSON.stringify(vm);
    if (!force && key === this.#key) return this.position();
    this.#key = key;
    this.#entries = entries;
    const html = await foundry.applications.handlebars.renderTemplate(`${TEMPLATE_ROOT}/hud/menu.hbs`, vm);
    if (this.element !== el) return; // closed while rendering
    el.innerHTML = html;
    el.setAttribute("aria-label", vm.title);
    el.classList.toggle("is-entering", animate);
    if (animate) setTimeout(() => el.classList.remove("is-entering"), 700);
    const now = Date.now();
    for (const [sentKey, until] of this.#sent) {
      if (until <= now) this.#sent.delete(sentKey);
      else el.querySelector(`[data-entry="${CSS.escape(sentKey)}"]`)?.classList.add("is-sent");
    }
    this.position();
    this.#cards.restore();
  }

  /** Coalesce bursts of refreshes (several documents updating at once). */
  queueRender() {
    if (this.#renderQueued || !this.element) return;
    this.#renderQueued = true;
    setTimeout(() => {
      this.#renderQueued = false;
      this.render();
    }, 0);
  }

  #context() {
    const actor = this.manager.actor;
    return {
      actor,
      t: this.manager.telemetry,
      token: this.#token(actor),
      targets: [...(game.user.targets ?? [])],
      inCombat: this.manager.inCombat(actor),
      usedReactions: usedReactions(actor),
      busy: this.#busy,
    };
  }

  /** The mech's token on this scene: a controlled one first. */
  #token(actor) {
    if (!canvas?.ready || !actor) return null;
    const tokens = actor.getActiveTokens(false, true);
    return tokens.find(t => t.object?.controlled) ?? tokens[0] ?? null;
  }

  /** Mirror the panel's theme and motion classes. */
  sync() {
    const el = this.element;
    if (!el) return;
    for (const cls of [...el.classList]) if (cls.startsWith("lfd-theme-")) el.classList.remove(cls);
    el.classList.add(this.manager.theme.cssClass);
    el.classList.toggle("lfd-reduce-motion", !!this.manager.panel?.element?.classList.contains("lfd-reduce-motion"));
  }

  /**
   * Sit beside the panel, bottom-aligned with its actions plate; flip to the other side
   * when there's no room (e.g. docked beside the sidebar). A tick on the HUD's edge points
   * at whatever opened it.
   */
  position() {
    const el = this.element;
    const panel = this.manager.panel?.element;
    if (!el || !panel) return;
    const box = panel.getBoundingClientRect();
    el.hidden = !box.width;
    if (!box.width) return;
    const zoom = box.width / panel.offsetWidth || 1; // UI scale and panel size combined
    el.style.zoom = String(zoom);
    el.style.setProperty("--lfd-hud-max", `${Math.floor((window.innerHeight - 2 * GAP * zoom) / zoom)}px`);
    const anchor = panel.querySelector(".lfd-actions")?.getBoundingClientRect();
    // The panel scrolls: never align to the part of the plate that's scrolled out of view
    const bottom = Math.min(anchor?.height ? anchor.bottom : box.bottom, box.bottom);
    const width = el.offsetWidth * zoom;
    const height = el.offsetHeight * zoom;
    const gap = GAP * zoom;
    const sidebar = document.getElementById("sidebar")?.getBoundingClientRect();
    const limit = sidebar?.width && sidebar.left >= box.right ? sidebar.left : window.innerWidth;
    let side = "right";
    let left = box.right + gap;
    if (left + width > limit - gap && box.left - gap - width >= gap) {
      side = "left";
      left = box.left - gap - width;
    }
    const top = Math.max(gap, Math.min(bottom - height, window.innerHeight - height - gap));
    this.side = side;
    el.classList.toggle("is-left", side === "left");
    el.style.left = `${Math.round(left / zoom)}px`;
    el.style.top = `${Math.round(top / zoom)}px`;
    // Point at the opener
    const opener = this.#opener()?.getBoundingClientRect();
    if (opener?.height) {
      const y = (opener.top + opener.height / 2 - top) / zoom;
      el.style.setProperty("--lfd-hud-tick", `${Math.round(Math.max(10, Math.min(el.offsetHeight - 10, y)))}px`);
    }
    // The panel side shows which way the HUD opened (chevrons, light notches)
    panel.classList.toggle("lfd-hud-left", side === "left");
  }

  #opener() {
    const panel = this.manager.panel?.element;
    if (!panel || !this.view) return null;
    return this.#openerFor(this.view.menu);
  }

  #openerFor(menu) {
    const panel = this.manager.panel?.element;
    if (!panel || !menu) return null;
    if (menu === "systems") return panel.querySelector('[data-action="toggleSystems"]');
    return panel.querySelector(`[data-action="menu"][data-menu="${menu}"]`);
  }

  /* -------------------------------------------- */
  /*  Interaction                                 */
  /* -------------------------------------------- */

  async #onClick(event) {
    const control = event.target.closest("[data-hud]");
    if (control?.dataset.hud === "close") return this.close({ focusOpener: true });
    if (control?.dataset.hud === "back") return this.#back();
    const button = event.target.closest("[data-entry]");
    if (!button) return;
    const entry = this.#entries.get(button.dataset.entry);
    if (!entry || this.#busy.has(entry.key)) return;

    // Navigation entries change the view without running anything
    if (entry.type === "view") {
      this.view = { menu: entry.def.view };
      this.element.dataset.menu = this.view.menu;
      await this.render({ force: true, animate: true });
      return this.manager.refresh();
    }
    if (entry.type === "weapons") {
      this.view = { menu: this.view.menu, sub: { type: "weapons", mode: entry.def.id, fired: 0 } };
      return this.render({ force: true, animate: true });
    }

    this.#busy.add(entry.key);
    button.classList.add("is-busy");
    let ok = false;
    try {
      ok = await this.manager.useEntry(entry, this.#context(), this.#spendFor(entry));
    } finally {
      this.#busy.delete(entry.key);
    }
    if (ok) this.#sent.set(entry.key, Date.now() + SENT_MS);
    if (ok && entry.type === "weapon") this.#afterWeapon();
    await this.render({ force: true });
    if (ok) setTimeout(() => this.#clearSent(entry.key), SENT_MS);
  }

  /**
   * The slot an entry spends. A Barrage spends the full action on its first attack only;
   * the second attack of the same Barrage is free.
   */
  #spendFor(entry) {
    if (entry.type === "weapon" && entry.mode === "barrage" && (this.view?.sub?.fired ?? 0) >= 1) return null;
    return entry.spend ?? null;
  }

  /** Skirmish and Overwatch are one attack; a Barrage is two. Then back to the menu. */
  #afterWeapon() {
    const sub = this.view?.sub;
    if (!sub) return;
    sub.fired = (sub.fired ?? 0) + 1;
    if (sub.mode !== "barrage" || sub.fired >= 2) this.view = { menu: this.view.menu };
  }

  async #back() {
    if (!this.view?.sub) return this.close({ focusOpener: true });
    this.view = { menu: this.view.menu };
    await this.render({ force: true, animate: true });
    this.element?.querySelector("[data-entry]")?.focus();
  }

  #onKey(event) {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (this.view?.sub) this.#back();
      else this.close({ focusOpener: true });
      return;
    }
    if (event.key === "Backspace" && this.view?.sub) {
      event.preventDefault();
      event.stopPropagation();
      return this.#back();
    }
    const rows = [...this.element.querySelectorAll("[data-entry]")];
    const at = rows.indexOf(document.activeElement);
    let next = null;
    switch (event.key) {
      case "ArrowDown":
      case "ArrowRight":
        next = rows[(at + 1 + rows.length) % rows.length];
        break;
      case "ArrowUp":
      case "ArrowLeft":
        next = rows[(at - 1 + rows.length) % rows.length];
        break;
      case "Home":
        next = rows[0];
        break;
      case "End":
        next = rows.at(-1);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    next?.focus();
  }

  /** End an entry's SENT flash (the label comes from the template's data-sent). */
  #clearSent(key) {
    this.#sent.delete(key);
    this.element?.querySelector(`[data-entry="${CSS.escape(key)}"]`)?.classList.remove("is-sent");
  }
}
