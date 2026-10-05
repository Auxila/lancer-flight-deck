import { PANEL_ID, TEMPLATE_ROOT } from "../constants.js";
import { DamageLayer } from "./damage/DamageLayer.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Template parts, in display order. Each re-renders independently. */
export const PART_IDS = ["header", "hull", "heat", "integrity", "caution", "actions"];

/** Pointer travel (px) before a press on the header becomes a drag. */
const DRAG_THRESHOLD = 5;
/** How close (px) to a screen edge a drop must be to dock there. */
const SNAP_DISTANCE = 64;

/**
 * The instrument panel. A frameless ApplicationV2 that either docks inside Foundry's own UI
 * columns (#ui-left / #ui-right, so it never covers the hotbar) or floats freely.
 *
 * - Drag the header to move it; drop near a screen edge to dock there.
 * - Drag the corner grip to resize (uniform scale, so instruments stay in proportion).
 */
export class FlightDeckPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @param {import("../core/FlightDeckManager.js").FlightDeckManager} manager */
  constructor(manager, options = {}) {
    super(options);
    this.manager = manager;
    /** Cracked glass, warning lights and steam for structure and stress damage. */
    this.damage = new DamageLayer(this);
  }

  static DEFAULT_OPTIONS = {
    id: PANEL_ID,
    tag: "aside",
    classes: ["lfd-panel", "lfd-themed"],
    window: { frame: false, positioned: false },
    actions: {
      toggleCollapse: FlightDeckPanel.#onToggleCollapse,
      toggleMute: FlightDeckPanel.#onToggleMute,
      hidePanel: FlightDeckPanel.#onHidePanel,
      rollCheck: FlightDeckPanel.#onRollCheck,
      overcharge: FlightDeckPanel.#onOvercharge,
      stabilize: FlightDeckPanel.#onStabilize,
      corePower: FlightDeckPanel.#onCorePower,
      openSheet: FlightDeckPanel.#onOpenSheet,
      skipBoot: FlightDeckPanel.#onSkipBoot,
      adjust: FlightDeckPanel.#onAdjust,
      // Left- and right-click: AppV2 routes contextmenu events to actions for listed buttons
      tile: { handler: FlightDeckPanel.#onTile, buttons: [0, 2] },
      dock: FlightDeckPanel.#onDock,
      // Action bus lights: left-click opens the HUD menu, right-click toggles the slot
      menu: { handler: FlightDeckPanel.#onMenu, buttons: [0, 2] },
      toggleSystems: FlightDeckPanel.#onToggleSystems,
    },
  };

  static PARTS = Object.fromEntries(PART_IDS.map(id => [id, { template: `${TEMPLATE_ROOT}/panel/${id}.hbs` }]));

  /** Foundry UI a docked panel must never cover: hotbar, players list, floating chat input. */
  static OBSTACLES = ["hotbar", "players", "chat-message"];

  /** Set when a drag ends, so the click that follows it doesn't also fire. */
  #suppressClick = false;
  #listening = false;

  /** @override */
  async _prepareContext(_options) {
    return this.manager.buildContext();
  }

  /** @override Theme overrides can swap individual part templates. */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const overrides = this.manager.theme?.templates ?? {};
    for (const [id, template] of Object.entries(overrides)) if (parts[id]) parts[id].template = template;
    return parts;
  }

  /** @override Dock into Foundry's UI columns (or float) instead of appending to the body. */
  _insertElement(element) {
    const existing = document.getElementById(element.id);
    if (existing) existing.replaceWith(element);
    else if (this.manager.floating) FlightDeckPanel.float(element);
    else FlightDeckPanel.dock(element, this.manager.dockSide);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this.damage.attach(this.element);
    this.#ensureResizeGrip();
    if (!this.#listening) this.#attachListeners();
    this.manager.applyAppearance();
    this.fitHeight();
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    this.damage.destroy();
  }

  /* -------------------------------------------- */
  /*  Placement                                   */
  /* -------------------------------------------- */

  /**
   * Docked: place the panel next to the scene controls (left), or at the top of the
   * notifications column beside the sidebar (right). Falls back to the body.
   */
  static dock(element, side) {
    element.classList.toggle("lfd-dock-left", side !== "right");
    element.classList.toggle("lfd-dock-right", side === "right");
    if (side === "right") {
      const column = document.getElementById("ui-right-column-1");
      if (column) return column.prepend(element);
      const host = document.getElementById("ui-right");
      if (host) return host.prepend(element);
    } else {
      const host = document.getElementById("ui-left");
      const firstColumn = document.getElementById("ui-left-column-1");
      if (host && firstColumn?.parentElement === host) return firstColumn.after(element);
      if (host) return host.prepend(element);
    }
    document.body.append(element);
  }

  /** Floating: a fixed-position layer over the canvas, under Foundry's windows. */
  static float(element) {
    element.classList.remove("lfd-dock-left", "lfd-dock-right");
    (document.getElementById("interface") ?? document.body).append(element);
  }

  /** Place a zoomed, fixed-position element so its top-left lands on these screen pixels. */
  static setScreenPosition(element, left, top, zoom = parseFloat(element.style.zoom) || 1) {
    element.style.left = `${Math.round(left / zoom)}px`;
    element.style.top = `${Math.round(top / zoom)}px`;
  }

  /**
   * Cap the panel's height so it scrolls instead of running off screen. Docked, it also
   * stays clear of Foundry's own controls below its footprint.
   */
  fitHeight() {
    const el = this.element;
    if (!el) return;
    if (el.classList.contains("is-collapsed")) {
      el.style.maxHeight = "";
      return;
    }
    const box = el.getBoundingClientRect();
    // A hidden or zero-size window has no layout to fit against; wait for the next resize
    if (!box.width || !window.innerHeight) return;
    const scale = box.width / el.offsetWidth || 1; // UI scale and panel zoom combined
    let limit = window.innerHeight - 8;
    if (!this.manager.floating) {
      for (const id of FlightDeckPanel.OBSTACLES) {
        const r = document.getElementById(id)?.getBoundingClientRect();
        if (!r?.width || !r.height) continue;
        if (r.left < box.right && r.right > box.left && r.top > box.top) limit = Math.min(limit, r.top - 8);
      }
    }
    el.style.maxHeight = `${Math.max(160, Math.floor((limit - box.top) / scale))}px`;
    this.manager.hud.position();
  }

  /* -------------------------------------------- */
  /*  Listeners                                   */
  /* -------------------------------------------- */

  /** Delegated listeners on the root, which survives part re-renders. */
  #attachListeners() {
    const root = this.element;
    this.#listening = true;

    // Value editors: Enter / blur commits, Escape reverts, focus selects for quick typing
    root.addEventListener("change", event => {
      const input = event.target.closest("input[data-resource]");
      if (!input) return;
      if (!this.manager.setResource(input.dataset.resource, input.value)) {
        input.value = input.defaultValue;
        ui.notifications.warn(game.i18n.localize("LFD.Edit.Invalid"));
      }
    });
    root.addEventListener("keydown", event => {
      const input = event.target.closest("input[data-resource]");
      if (!input) return;
      if (event.key === "Enter") input.blur();
      else if (event.key === "Escape") {
        input.value = input.defaultValue;
        input.blur();
      }
      event.stopPropagation(); // keep Foundry's keybindings out of the field
    });
    root.addEventListener("focusin", event => event.target.closest("input[data-resource]")?.select());
    root.addEventListener("focusout", event => {
      if (event.target.closest("input[data-resource]")) setTimeout(() => this.manager.flushDeferred(), 0);
    });

    // Moving: press on the header (not a control) and drag
    root.addEventListener("pointerdown", event => this.#onHeaderPointerDown(event));
    // The HUD follows the actions plate when the panel scrolls
    root.addEventListener(
      "scroll",
      () => {
        this.manager.hud.position();
        this.damage.layout();
      },
      { passive: true }
    );
    // Swallow the click that ends a drag, before AppV2's action handler sees it
    root.addEventListener(
      "click",
      event => {
        if (!this.#suppressClick) return;
        this.#suppressClick = false;
        event.preventDefault();
        event.stopImmediatePropagation();
      },
      true
    );
  }

  #onHeaderPointerDown(event) {
    if (event.button !== 0) return;
    const handle = event.target.closest(".lfd-header-main, .lfd-tab");
    if (!handle) return;
    // Buttons inside the header keep their own behaviour; the collapsed tab is both
    if (event.target.closest("button:not(.lfd-tab), input, a")) return;

    const el = this.element;
    const start = { x: event.clientX, y: event.clientY };
    const rect = el.getBoundingClientRect();
    const offset = { x: start.x - rect.left, y: start.y - rect.top };
    let dragging = false;
    let zones = null;

    const move = ev => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        dragging = true;
        handle.setPointerCapture?.(ev.pointerId);
        el.classList.add("is-dragging");
        // Leaving the dock: float in place, at the same visual position and size
        if (!this.manager.floating) {
          FlightDeckPanel.float(el);
          el.classList.add("lfd-floating");
          el.classList.remove("lfd-docked", "lfd-dock-left", "lfd-dock-right");
          el.style.zoom = String(this.manager.scale * this.manager.uiScale);
        }
        zones = FlightDeckPanel.#showDockZones();
      }
      FlightDeckPanel.setScreenPosition(el, ev.clientX - offset.x, ev.clientY - offset.y);
      this.manager.hud.position();
      const side = FlightDeckPanel.#snapSide(ev.clientX);
      zones?.left.classList.toggle("is-active", side === "left");
      zones?.right.classList.toggle("is-active", side === "right");
    };

    const up = async ev => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!dragging) return;
      this.#suppressClick = true;
      setTimeout(() => (this.#suppressClick = false), 0);
      el.classList.remove("is-dragging");
      zones?.left.remove();
      zones?.right.remove();
      const side = FlightDeckPanel.#snapSide(ev.clientX);
      if (side) await this.manager.dock(side);
      else await this.manager.float({ left: ev.clientX - offset.x, top: ev.clientY - offset.y });
      this.fitHeight();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  /** Which dock a drop at this x would snap to, if any. */
  static #snapSide(x) {
    const leftEdge = document.getElementById("ui-left-column-1")?.getBoundingClientRect().right ?? 0;
    const sidebar = document.getElementById("sidebar")?.getBoundingClientRect();
    const rightEdge = sidebar?.width ? sidebar.left : window.innerWidth;
    if (x <= leftEdge + SNAP_DISTANCE) return "left";
    if (x >= rightEdge - SNAP_DISTANCE) return "right";
    return null;
  }

  /** Translucent targets on both edges while dragging. */
  static #showDockZones() {
    const make = side => {
      const zone = document.createElement("div");
      zone.className = `lfd-dock-zone lfd-dock-zone-${side}`;
      zone.textContent = game.i18n.localize("LFD.Move.DockHere");
      document.body.append(zone);
      return zone;
    };
    return { left: make("left"), right: make("right") };
  }

  /* -------------------------------------------- */
  /*  Resizing                                    */
  /* -------------------------------------------- */

  /** A focusable corner grip, sticky to the panel's bottom edge. */
  #ensureResizeGrip() {
    const root = this.element;
    let grip = root.querySelector(":scope > .lfd-resize");
    if (!grip) {
      grip = document.createElement("div");
      grip.className = "lfd-resize";
      grip.tabIndex = 0;
      grip.setAttribute("role", "slider");
      grip.setAttribute("aria-label", game.i18n.localize("LFD.Resize.Label"));
      grip.setAttribute("aria-valuemin", "70");
      grip.setAttribute("aria-valuemax", "160");
      grip.dataset.tooltip = "LFD.Resize.Hint";
      grip.addEventListener("pointerdown", event => this.#onResizePointerDown(event));
      grip.addEventListener("dblclick", () => this.manager.setScale(1));
      grip.addEventListener("keydown", event => this.#onResizeKey(event));
    }
    root.append(grip); // keep it last so it sits on top of the final plate
    grip.setAttribute("aria-valuenow", String(Math.round(this.manager.scale * 100)));
  }

  #onResizePointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const grip = event.currentTarget;
    grip.setPointerCapture?.(event.pointerId);
    const el = this.element;
    const startScale = this.manager.scale;
    const startWidth = el.getBoundingClientRect().width;
    const startX = event.clientX;
    // Docked right, the grip sits bottom-left and the panel grows leftwards
    const dir = el.classList.contains("lfd-dock-right") ? -1 : 1;
    let scale = startScale;
    el.classList.add("is-resizing");

    const move = ev => {
      const width = Math.max(40, startWidth + dir * (ev.clientX - startX));
      scale = this.manager.previewScale(startScale * (width / startWidth));
      grip.setAttribute("aria-valuenow", String(Math.round(scale * 100)));
    };
    const up = async () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      el.classList.remove("is-resizing");
      await this.manager.setScale(scale);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  }

  #onResizeKey(event) {
    const step = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05 }[event.key];
    if (step !== undefined) this.manager.setScale(this.manager.scale + step);
    else if (event.key === "Home") this.manager.setScale(1);
    else return;
    event.preventDefault();
    event.stopPropagation();
  }

  /* -------------------------------------------- */
  /*  Cockpit effects                             */
  /* -------------------------------------------- */

  /** Show an optimistic value in an editor while its update is in flight. */
  showPendingValue(key, value) {
    const input = this.element?.querySelector(`input[data-resource="${key}"]`);
    if (input && document.activeElement !== input) input.value = String(value);
    input?.closest(".lfd-editor")?.classList.add("is-pending");
  }

  /**
   * Briefly flag a section (adds a class for `ms` milliseconds).
   * @param {string|null} selector  null targets the panel itself
   * @param {string} cls
   */
  pulse(selector, cls, ms = 1800) {
    const el = selector ? this.element?.querySelector(selector) : this.element;
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  }

  /** Skippable cold-boot overlay: typed lines, then it clears itself. */
  playBoot(lines, { badge = "", duration = 2200 } = {}) {
    const root = this.element;
    if (!root) return;
    root.querySelector(".lfd-boot")?.remove();
    const overlay = document.createElement("div");
    overlay.className = "lfd-boot";
    overlay.dataset.action = "skipBoot";
    overlay.setAttribute("role", "status");
    const step = Math.max(120, Math.floor((duration - 500) / Math.max(1, lines.length)));
    overlay.innerHTML =
      `<div class="lfd-boot-badge">${foundry.utils.escapeHTML(badge)}</div>` +
      lines
        .map(
          (line, i) =>
            `<div class="lfd-boot-line" style="animation-delay:${i * step}ms">${foundry.utils.escapeHTML(line)}</div>`
        )
        .join("") +
      `<div class="lfd-boot-skip">${game.i18n.localize("LFD.Boot.Skip")}</div>`;
    root.append(overlay);
    this._bootTimer = setTimeout(() => this.endBoot(), duration);
  }

  endBoot() {
    clearTimeout(this._bootTimer);
    const overlay = this.element?.querySelector(".lfd-boot");
    if (!overlay) return;
    overlay.classList.add("is-ending");
    setTimeout(() => overlay.remove(), 220);
  }

  /** Full-width flash banner (e.g. CORE ONLINE). */
  flashBanner(text, kind = "core", ms = 1600) {
    const root = this.element;
    if (!root) return;
    root.querySelector(".lfd-banner")?.remove();
    const banner = document.createElement("div");
    banner.className = `lfd-banner lfd-banner-${kind}`;
    banner.textContent = text;
    root.append(banner);
    setTimeout(() => banner.remove(), ms);
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #onToggleCollapse() {
    this.manager.toggleCollapsed();
  }

  static #onToggleMute() {
    this.manager.toggleMute();
  }

  static #onHidePanel() {
    this.manager.hide();
  }

  static #onRollCheck(_event, target) {
    this.manager.rollCheck(target.dataset.check);
  }

  static #onAdjust(_event, target) {
    this.manager.adjustResource(target.dataset.resource, Number(target.dataset.delta));
  }

  /** Left-click: primary action. Right-click: secondary (−1, Invisible, meltdown tick). */
  static #onTile(event, target) {
    const secondary = event.button === 2 || event.type === "contextmenu";
    if (secondary) event.preventDefault();
    this.manager.clickTile(target.dataset.tile, { secondary, clear: !secondary && event.shiftKey });
  }

  static #onDock() {
    this.manager.dock();
  }

  /** Left-click: open the light's HUD menu. Right-click: mark the slot spent / available. */
  static #onMenu(event, target) {
    const secondary = event.button === 2 || event.type === "contextmenu";
    if (secondary) {
      event.preventDefault();
      this.manager.toggleSlot(target.dataset.menu);
    } else this.manager.toggleMenu(target.dataset.menu);
  }

  static #onToggleSystems() {
    this.manager.toggleSystems();
  }

  static async #onOvercharge() {
    const actor = this.manager.ownedActor();
    if (!actor) return;
    try {
      await actor.beginOverchargeFlow();
    } catch (err) {
      FlightDeckPanel.#fail("LFD.Error.Overcharge", err);
    }
  }

  static async #onStabilize() {
    const actor = this.manager.ownedActor();
    if (!actor) return;
    try {
      await actor.beginStabilizeFlow();
    } catch (err) {
      FlightDeckPanel.#fail("LFD.Error.Stabilize", err);
    }
  }

  static async #onCorePower() {
    const actor = this.manager.ownedActor();
    const frame = actor?.system?.loadout?.frame?.value;
    if (!frame) return ui.notifications.warn(game.i18n.localize("LFD.Error.NoFrame"));
    try {
      await frame.beginCoreActiveFlow("system.core_system");
    } catch (err) {
      FlightDeckPanel.#fail("LFD.Error.Core", err);
    }
  }

  static #onOpenSheet() {
    this.manager.actor?.sheet?.render(true);
  }

  static #onSkipBoot() {
    this.endBoot();
  }

  static #fail(key, err) {
    console.error("Flight Deck |", err);
    ui.notifications.error(game.i18n.localize(key));
  }
}
