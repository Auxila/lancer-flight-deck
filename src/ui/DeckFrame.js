import { MODULE_ID } from "../constants.js";

/** Pointer travel (px) before a press on the handle becomes a drag. */
const DRAG_THRESHOLD = 5;
/** How close (px) to a screen edge a drop must be to dock there. */
const SNAP_DISTANCE = 64;
/** Foundry UI a docked deck must never cover. */
const OBSTACLES = ["hotbar", "players", "chat-message"];

const getSetting = key => game.settings.get(MODULE_ID, key);
const setSetting = (key, value) => game.settings.set(MODULE_ID, key, value);

/**
 * Placement for a frameless panel: docked inside Foundry's UI columns, or floating anywhere.
 *
 * - Drag the handle to float the panel; drop it near a screen edge (dashed targets appear)
 *   to dock it there again.
 * - Drag the corner grip to resize: a uniform scale, so everything stays in proportion.
 *   Double-click resets it; arrow keys adjust it while the grip has focus.
 * - Docked, it caps its height above the hotbar, players list and chat input, and scrolls.
 *
 * Positions and sizes are client settings, so each GM or player keeps their own layout.
 * CSS zoom scales `left` and `top` too, so positions are divided by the zoom to land on the
 * intended screen pixels. Docked panels inherit Foundry's UI scale from their column;
 * floating ones apply it themselves.
 */
export class DeckFrame {
  /**
   * @param {foundry.applications.api.ApplicationV2} app
   * @param {object} options
   * @param {{mode: string, position: string, scale: string, side: string}} options.keys  Setting keys
   * @param {(element: HTMLElement, side: string) => void} options.dock  Put the element in its dock
   * @param {string} options.handle    Selector for the drag handle
   * @param {string} [options.exclude] Controls inside the handle that keep their own clicks
   * @param {[number, number]} [options.scaleRange]
   * @param {string} [options.gripLabel]  Localization key for the grip
   */
  constructor(app, { keys, dock, handle, exclude = "button, input, a, select, img", scaleRange = [0.7, 1.6], gripLabel = "LFD.Resize.Label" }) {
    this.app = app;
    this.keys = keys;
    this.dockFn = dock;
    this.handle = handle;
    this.exclude = exclude;
    this.scaleRange = scaleRange;
    this.gripLabel = gripLabel;
  }

  /** Set when a drag ends, so the click that follows it doesn't also fire. */
  #suppressClick = false;
  #wiredTo = null;

  get element() {
    return this.app.element ?? null;
  }

  get floating() {
    return getSetting(this.keys.mode) === "floating";
  }

  get side() {
    return getSetting(this.keys.side) === "left" ? "left" : "right";
  }

  get scale() {
    const [min, max] = this.scaleRange;
    const s = Number(getSetting(this.keys.scale));
    return Number.isFinite(s) ? Math.min(max, Math.max(min, s)) : 1;
  }

  /** Foundry's UI scale; docked panels inherit it, floating ones apply it. */
  get uiScale() {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale"));
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  /* -------------------------------------------- */
  /*  Placement                                   */
  /* -------------------------------------------- */

  /** Where a freshly rendered element goes (ApplicationV2#_insertElement). */
  insert(element) {
    if (this.floating) DeckFrame.float(element);
    else this.dockFn(element, this.side);
  }

  static float(element) {
    element.classList.remove("lfd-dock-left", "lfd-dock-right");
    (document.getElementById("interface") ?? document.body).append(element);
  }

  /** Place a zoomed, fixed-position element so its top-left lands on these screen pixels. */
  static setScreenPosition(element, left, top, zoom = parseFloat(element.style.zoom) || 1) {
    element.style.left = `${Math.round(left / zoom)}px`;
    element.style.top = `${Math.round(top / zoom)}px`;
  }

  /** Classes, container, zoom and position, without re-rendering. Call after every render. */
  apply() {
    const el = this.element;
    if (!el) return;
    if (this.#wiredTo !== el) this.#wire(el);
    const floating = this.floating;
    const inInterface = el.parentElement?.id === "interface";
    if (floating && !inInterface) DeckFrame.float(el);
    else if (!floating && (inInterface || !el.isConnected || el.dataset.dockedSide !== this.side)) {
      this.dockFn(el, this.side);
    }
    el.dataset.dockedSide = floating ? "" : this.side;
    el.classList.toggle("lfd-floating", floating);
    el.classList.toggle("lfd-docked", !floating);
    el.classList.toggle("lfd-dock-left", !floating && this.side === "left");
    el.classList.toggle("lfd-dock-right", !floating && this.side === "right");
    const zoom = floating ? this.scale * this.uiScale : this.scale;
    el.style.zoom = String(zoom);
    if (floating) this.#placeFloating(el, zoom);
    else el.style.left = el.style.top = "";
    this.#ensureGrip(el);
    this.fitHeight();
  }

  /** Dock to a side (a drop on a screen edge). */
  async dock(side = this.side) {
    if (side !== this.side) await setSetting(this.keys.side, side);
    if (this.floating) await setSetting(this.keys.mode, "docked");
    const el = this.element;
    if (el) this.dockFn(el, side);
    this.apply();
  }

  /** Float at a viewport position (top-left corner, screen pixels). */
  async float(position) {
    await setSetting(this.keys.position, this.#clamp(position));
    if (!this.floating) await setSetting(this.keys.mode, "floating");
    this.apply();
  }

  /** Keep at least a grabbable strip on screen. */
  #clamp({ left, top } = {}) {
    const maxLeft = Math.max(0, window.innerWidth - 80);
    const maxTop = Math.max(0, window.innerHeight - 48);
    return {
      left: Math.round(Math.min(maxLeft, Math.max(0, Number(left) || 0))),
      top: Math.round(Math.min(maxTop, Math.max(0, Number(top) || 0))),
    };
  }

  #placeFloating(el, zoom) {
    const { left, top } = this.#clamp(getSetting(this.keys.position) ?? {});
    DeckFrame.setScreenPosition(el, left, top, zoom);
  }

  /** Cap the height so the panel scrolls instead of running off screen or over Foundry's controls. */
  fitHeight() {
    const el = this.element;
    if (!el?.isConnected) return;
    if (el.classList.contains("is-collapsed")) {
      el.style.maxHeight = "";
      return;
    }
    const box = el.getBoundingClientRect();
    if (!box.width || !window.innerHeight) return;
    const scale = box.width / el.offsetWidth || 1; // UI scale and panel zoom combined
    let limit = window.innerHeight - 8;
    if (!this.floating) {
      for (const id of OBSTACLES) {
        const r = document.getElementById(id)?.getBoundingClientRect();
        if (!r?.width || !r.height) continue;
        if (r.left < box.right && r.right > box.left && r.top > box.top) limit = Math.min(limit, r.top - 8);
      }
    }
    el.style.maxHeight = `${Math.max(120, Math.floor((limit - box.top) / scale))}px`;
  }

  /* -------------------------------------------- */
  /*  Moving                                      */
  /* -------------------------------------------- */

  #wire(el) {
    this.#wiredTo = el;
    el.addEventListener("pointerdown", event => this.#onPointerDown(event));
    // Swallow the click that ends a drag, before ApplicationV2's action handler sees it
    el.addEventListener(
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

  #onPointerDown(event) {
    if (event.button !== 0) return;
    const el = this.element;
    const handle = event.target.closest(this.handle);
    if (!handle || !el?.contains(handle)) return;
    if (event.target.closest(this.exclude)) return;

    const start = { x: event.clientX, y: event.clientY };
    const rect = el.getBoundingClientRect();
    const offset = { x: start.x - rect.left, y: start.y - rect.top };
    let dragging = false;
    let zones = null;

    const move = ev => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < DRAG_THRESHOLD) return;
        dragging = true;
        handle.setPointerCapture?.(ev.pointerId);
        el.classList.add("is-dragging");
        // Leaving the dock: float in place, at the same size
        if (!this.floating) {
          DeckFrame.float(el);
          el.classList.add("lfd-floating");
          el.classList.remove("lfd-docked", "lfd-dock-left", "lfd-dock-right");
          el.style.zoom = String(this.scale * this.uiScale);
        }
        zones = DeckFrame.#showDockZones();
      }
      DeckFrame.setScreenPosition(el, ev.clientX - offset.x, ev.clientY - offset.y);
      const side = DeckFrame.#snapSide(ev.clientX);
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
      const side = DeckFrame.#snapSide(ev.clientX);
      if (side) await this.dock(side);
      else await this.float({ left: ev.clientX - offset.x, top: ev.clientY - offset.y });
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

  /** A focusable corner grip, kept last so it sits on top, sticky to the bottom edge. */
  #ensureGrip(el) {
    let grip = el.querySelector(":scope > .lfd-resize");
    if (!grip) {
      grip = document.createElement("div");
      grip.className = "lfd-resize";
      grip.tabIndex = 0;
      grip.setAttribute("role", "slider");
      grip.setAttribute("aria-label", game.i18n.localize(this.gripLabel));
      grip.setAttribute("aria-valuemin", String(Math.round(this.scaleRange[0] * 100)));
      grip.setAttribute("aria-valuemax", String(Math.round(this.scaleRange[1] * 100)));
      grip.dataset.tooltip = "LFD.Resize.Hint";
      grip.addEventListener("pointerdown", event => this.#onResizePointerDown(event));
      grip.addEventListener("dblclick", () => this.setScale(1));
      grip.addEventListener("keydown", event => this.#onResizeKey(event));
    }
    el.append(grip);
    grip.setAttribute("aria-valuenow", String(Math.round(this.scale * 100)));
  }

  #onResizePointerDown(event) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const grip = event.currentTarget;
    grip.setPointerCapture?.(event.pointerId);
    const el = this.element;
    const startScale = this.scale;
    const startWidth = el.getBoundingClientRect().width;
    const startX = event.clientX;
    // Docked right, the grip sits bottom-left and the panel grows leftwards
    const dir = el.classList.contains("lfd-dock-right") ? -1 : 1;
    let scale = startScale;
    el.classList.add("is-resizing");
    const move = ev => {
      const width = Math.max(40, startWidth + dir * (ev.clientX - startX));
      scale = this.previewScale(startScale * (width / startWidth));
      grip.setAttribute("aria-valuenow", String(Math.round(scale * 100)));
    };
    const up = async () => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", up);
      grip.removeEventListener("pointercancel", up);
      el.classList.remove("is-resizing");
      await this.setScale(scale);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", up);
    grip.addEventListener("pointercancel", up);
  }

  #onResizeKey(event) {
    const step = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05 }[event.key];
    if (step !== undefined) this.setScale(this.scale + step);
    else if (event.key === "Home") this.setScale(1);
    else return;
    event.preventDefault();
    event.stopPropagation();
  }

  /** Live size while dragging the grip (saved on release). */
  previewScale(scale) {
    const el = this.element;
    const [min, max] = this.scaleRange;
    const s = Math.min(max, Math.max(min, scale));
    if (!el) return s;
    const zoom = this.floating ? s * this.uiScale : s;
    el.style.zoom = String(zoom);
    if (this.floating) this.#placeFloating(el, zoom); // keep the top-left corner anchored
    return s;
  }

  async setScale(scale) {
    const [min, max] = this.scaleRange;
    const s = Math.round(Math.min(max, Math.max(min, scale)) * 20) / 20;
    await setSetting(this.keys.scale, s);
    this.apply();
  }
}
