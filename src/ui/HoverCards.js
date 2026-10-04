/**
 * Rich hover cards on Foundry's own tooltip, for elements that carry their HTML in code
 * rather than in data-tooltip attributes (the HUD menus, the NPC Deck).
 *
 * Shown at once, not after Foundry's half-second delay, and held for as long as the pointer
 * rests on the element. Two details make that hold:
 *  - Entering an element fires pointerenter on each newly entered ancestor first, then on the
 *    element. Foundry's tooltip manager (listening on <body>, capture phase) reads an
 *    ancestor's pointerenter as "left the tooltipped element" and starts a half-second
 *    dismissal. Activating on the element's own pointerenter, the last of them, cancels it.
 *  - After a redraw the hovered element is a new node that a still pointer sends no events
 *    to (and `:hover` is stale until it moves), so `restore()` finds it by the last pointer
 *    position.
 * Leaving an element is left to Foundry, with its usual short grace. Middle-click pins a
 * card (Foundry's tooltip lock).
 */
export class HoverCards {
  /**
   * @param {object} options
   * @param {string} options.selector                     Elements that have cards
   * @param {(el: HTMLElement) => string|null} options.html  The card's HTML for an element
   * @param {() => string} [options.cssClass]               Classes for the tooltip
   * @param {() => string} [options.direction]              A TooltipManager direction
   */
  constructor({ selector, html, cssClass = () => "", direction = () => undefined }) {
    this.selector = selector;
    this.html = html;
    this.cssClass = cssClass;
    this.direction = direction;
  }

  /** @type {HTMLElement|null} */
  root = null;
  /** Last pointer position over the root (client px). */
  #pointer = null;

  /** Listen on a root element (call once per root). */
  attach(root) {
    this.root = root;
    // Capture phase: pointerenter doesn't bubble, and this runs after Foundry's own listener
    root.addEventListener(
      "pointerenter",
      event => {
        const el = event.target;
        if (!el?.matches?.(this.selector) || !root.contains(el)) return;
        this.#pointer = { x: event.clientX, y: event.clientY };
        this.show(el);
      },
      true
    );
    root.addEventListener(
      "pointermove",
      event => {
        this.#pointer = { x: event.clientX, y: event.clientY };
      },
      { passive: true }
    );
    root.addEventListener("pointerleave", event => {
      if (event.target !== root) return;
      this.#pointer = null;
      this.hide();
    });
    root.addEventListener("focusin", event => {
      const el = event.target.closest?.(this.selector);
      if (el && root.contains(el)) this.show(el);
    });
    root.addEventListener("focusout", event => {
      if (!root.contains(event.relatedTarget)) this.hide();
    });
  }

  /** Show the card for an element. Re-activating the card already up is seamless, and cancels
   *  a dismissal Foundry may have started when the pointer briefly left. */
  show(el) {
    const html = this.html(el);
    if (!html) return this.hide();
    game.tooltip.activate(el, { html, cssClass: this.cssClass(), direction: this.direction() });
  }

  /** After a redraw: put the card back on whatever is under the pointer (or focused). */
  restore() {
    const root = this.root;
    if (!root?.isConnected) return;
    let el = null;
    if (this.#pointer) {
      const hit = document.elementFromPoint(this.#pointer.x, this.#pointer.y)?.closest?.(this.selector);
      if (hit && root.contains(hit)) el = hit;
    }
    if (!el && root.contains(document.activeElement)) el = document.activeElement.closest?.(this.selector) ?? null;
    if (el) this.show(el);
    else this.hide();
  }

  /** Take down our card, and only ours: never a tooltip Foundry shows for something else. */
  hide() {
    const current = game.tooltip.element;
    if (!current) return;
    const ours = !current.isConnected || (current.matches?.(this.selector) && !!this.root?.contains(current));
    if (ours) game.tooltip.deactivate();
  }

  /** Forget the pointer (the root is going away). */
  detach() {
    this.hide();
    this.#pointer = null;
    this.root = null;
  }
}
