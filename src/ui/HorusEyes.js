/** Still pointer time after which the eyes stop following and go back to glancing about on their own. */
const IDLE_MS = 4000;
/** How far (CSS px) an iris can travel inside its eye: wide, and only a little up and down. */
const REACH_X = 4.5;
const REACH_Y = 2.6;
/** Pointer distance (screen px) at which an eye looks fully aside; nearer, it turns proportionally less. */
const FULL_AT = 160;

/**
 * HORUS's structure eyes follow the pointer. A passive pointermove listener records where the pointer
 * is; one animation frame per move turns each open eye's iris toward it (CSS variables --lx/--ly on the
 * eye, eased by a short transition). While it follows, the root carries `lfd-horus-tracking`, which
 * stops the idle glance animation; a few still seconds later the class drops and the eyes look about on
 * their own again. Closed eyes (lost structure) don't move. Reduced motion: no following.
 */
export class HorusEyes {
  /** @type {HTMLElement|null} */
  #root = null;
  /** @type {HTMLElement[]} */
  #eyes = [];
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

  /** After every render: pick up the eyes that are open now (the parts are fresh elements). */
  mount(root) {
    if (this.#root && this.#root !== root) this.unmount();
    const reduce = root.classList.contains("lfd-reduce-motion");
    this.#eyes = reduce ? [] : [...root.querySelectorAll(".lfd-horus-structure .lfd-pip.is-intact")];
    if (!this.#eyes.length) return this.unmount();
    this.#root = root;
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
    this.#rest();
    this.#root = null;
    this.#eyes = [];
  }

  #aim() {
    this.#frame = 0;
    if (!this.#root?.isConnected) return this.unmount();
    let looking = false;
    for (const eye of this.#eyes) {
      const r = eye.getBoundingClientRect();
      if (!r.width) continue; // collapsed or scrolled away
      const dx = this.#x - (r.left + r.width / 2);
      const dy = this.#y - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, d / FULL_AT);
      eye.style.setProperty("--lx", `${((dx / d) * reach * REACH_X).toFixed(2)}px`);
      eye.style.setProperty("--ly", `${((dy / d) * reach * REACH_Y).toFixed(2)}px`);
      looking = true;
    }
    if (!looking) return;
    this.#root.classList.add("lfd-horus-tracking");
    clearTimeout(this.#idle);
    this.#idle = setTimeout(() => this.#rest(), IDLE_MS);
  }

  /** Eyes front, and back to glancing about. */
  #rest() {
    clearTimeout(this.#idle);
    this.#idle = 0;
    this.#root?.classList.remove("lfd-horus-tracking");
    for (const eye of this.#eyes) {
      eye.style.removeProperty("--lx");
      eye.style.removeProperty("--ly");
    }
  }
}
