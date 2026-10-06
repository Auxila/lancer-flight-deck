/** Still pointer time after which the eyes stop following and go back to glancing about on their own. */
const IDLE_MS = 4000;
/** How far (CSS px) an iris can travel inside its eye: wide, and only a little up and down. */
const REACH_X = 4.5;
const REACH_Y = 2.6;
/** Pointer distance (screen px) at which an eye looks fully aside; nearer, it turns proportionally less. */
const FULL_AT = 160;
/**
 * Every eye on a HORUS cockpit: the structure eyes, the watchers that open in the static as stress runs
 * low, and the great eye at the last point (src/ui/damage/styles/CorruptionDamage.js).
 */
const EYES = ".lfd-horus-structure .lfd-pip.is-intact, .lfd-cor-watcher, .lfd-cor-bigeye";

/**
 * HORUS's eyes follow the pointer. A passive pointermove listener records where the pointer is; one
 * animation frame per move turns each eye's iris toward it (CSS variables --lx/--ly on the eye, eased by
 * a short transition; each kind of eye scales them to its own size). The eyes are found afresh each
 * frame, so watchers that open later join in. While they follow, the root carries `lfd-horus-tracking`,
 * which stops the structure eyes' idle glance; a few still seconds later they look about on their own
 * again. At the last stress point they don't: they keep staring where the pointer last was. Closed eyes
 * (lost structure) don't move. Reduced motion: no following (checked each frame, since the setting can
 * change without a render).
 */
export class HorusEyes {
  /** @type {HTMLElement|null} */
  #root = null;
  #listening = false;
  #frame = 0;
  #idle = 0;
  #x = 0;
  #y = 0;

  #onMove = event => {
    this.#x = event.clientX;
    this.#y = event.clientY;
    if (!this.#frame) this.#frame = requestAnimationFrame(() => this.#aim());
  };

  #onLeave = () => this.#rest();

  /** After every render, while HORUS is on screen. */
  mount(root) {
    if (this.#root && this.#root !== root) this.unmount();
    this.#root = root;
    if (root.classList.contains("lfd-reduce-motion")) this.#rest({ force: true });
    // Eyes that open while the others are watching (a render, a new watcher) turn to look at once
    if (root.classList.contains("lfd-horus-tracking") && !this.#frame) this.#frame = requestAnimationFrame(() => this.#aim());
    if (this.#listening) return;
    document.addEventListener("pointermove", this.#onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", this.#onLeave);
    this.#listening = true;
  }

  unmount() {
    if (this.#listening) {
      document.removeEventListener("pointermove", this.#onMove);
      document.documentElement.removeEventListener("pointerleave", this.#onLeave);
      this.#listening = false;
    }
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#rest({ force: true });
    this.#root = null;
  }

  #aim() {
    this.#frame = 0;
    const root = this.#root;
    if (!root?.isConnected) return this.unmount();
    // Reduced motion can switch on without a render: the eyes stay front until it's off again
    if (root.classList.contains("lfd-reduce-motion")) return this.#rest({ force: true });
    let looking = false;
    for (const eye of root.querySelectorAll(EYES)) {
      const r = eye.getBoundingClientRect();
      if (!r.width) continue; // collapsed, scrolled away, or not open yet
      const dx = this.#x - (r.left + r.width / 2);
      const dy = this.#y - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, d / FULL_AT);
      eye.style.setProperty("--lx", `${((dx / d) * reach * REACH_X).toFixed(2)}px`);
      eye.style.setProperty("--ly", `${((dy / d) * reach * REACH_Y).toFixed(2)}px`);
      looking = true;
    }
    if (!looking) return;
    root.classList.add("lfd-horus-tracking");
    clearTimeout(this.#idle);
    this.#idle = setTimeout(() => this.#rest(), IDLE_MS);
  }

  /** Eyes front, and back to glancing about; at the last stress point they keep staring instead. */
  #rest({ force = false } = {}) {
    clearTimeout(this.#idle);
    this.#idle = 0;
    const root = this.#root;
    if (!root) return;
    if (!force && root.classList.contains("lfd-stress-3")) return;
    root.classList.remove("lfd-horus-tracking");
    for (const eye of root.querySelectorAll(EYES)) {
      eye.style.removeProperty("--lx");
      eye.style.removeProperty("--ly");
    }
  }
}
