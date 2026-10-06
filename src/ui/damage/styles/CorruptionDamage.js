import { generateCorruption } from "../geometry.js";
import { hashSeed, mulberry32 } from "../fracture.js";
import { damageClock as clock } from "../clock.js";
import { DamageStyle, STAGGER_MS, rand } from "./DamageStyle.js";

const FORM_MS = 1400;
const MEND_MS = 900;
/** Per stress level: watchers open in the static, pixel-melt streaks, subliminal whispers. */
const WATCHERS = [0, 3, 8, 16];
const MELT = [0, 4, 12, 24];
const WHISPERS = [0, 2, 4, 7];
/** What surfaces in the noise: never data, only the machine talking through it. */
const PHRASES = ["I SEE YOU", "THE DOOR IS OPEN", "YOU WERE ALWAYS HERE", "DISBELIEVE", "LET IT IN", "NOTHING IS LOST", "IT DREAMS IN YOU", "∴ RUN ANYWAY", "WE REMEMBER YOU", "OPEN YOUR EYES"];
/** The great eye at the last point: an almond, a striated iris, a pupil; the iris tracks the pointer. */
const BIG_EYE = `<svg viewBox="0 0 200 120" aria-hidden="true" focusable="false">
  <path class="lfd-cor-lid" d="M4 60Q100 -18 196 60Q100 138 4 60Z"/>
  <g class="lfd-cor-iris">
    <circle class="lfd-cor-iris-ring" cx="100" cy="60" r="27"/>
    <g class="lfd-cor-striae">${Array.from({ length: 24 }, (_, k) => {
      const a = (k / 24) * Math.PI * 2;
      return `<line x1="${(100 + Math.cos(a) * 12).toFixed(1)}" y1="${(60 + Math.sin(a) * 12).toFixed(1)}" x2="${(100 + Math.cos(a) * 25).toFixed(1)}" y2="${(60 + Math.sin(a) * 25).toFixed(1)}"/>`;
    }).join("")}</g>
    <circle class="lfd-cor-pupil" cx="100" cy="60" r="10"/>
  </g>
</svg>`;

/**
 * HORUS: the readout corrupts.
 *
 * - Structure: each point lost is a fault. The plates tear sideways in a datamosh, the open eyes blink,
 *   and a FAULT stamp flashes where it hit; a bad sector prints in against the edge, a glitch band torn
 *   across the readout beside it, pixel-sort smears dragging out of it, an error code and clusters of dead
 *   pixels around it, flickering and jittering now and then. And
 *   the print slips further out of register with every point lost (the green ghost of every edge moves
 *   further off; styles/themes/horus.css). Repairs defragment the blocks away.
 * - Stress: the machine wakes. As stress runs low something on the other side of the readout notices
 *   you, and every eye follows the pointer (src/ui/HorusEyes.js):
 *   - first, static over the readout, a few watchers opening in the margins, a plate slipping out of
 *     register now and then, the
 *     odd pixel running, and a phrase surfacing in the noise;
 *   - then more watchers, a roll bar, the slips a little more often, pixels melting down the
 *     readout, the great eye stirring in the static, and the cockpit's own labels hijacked ("link
 *     nominal" becomes "it hears you"; styles/themes/horus.css);
 *   - at the last point, eyes everywhere and staring (they stop blinking, and stop looking away), heavy
 *     melt, the section titles rewriting themselves, and once in a while a great eye opening in the
 *     static to watch the pointer.
 *   Each hit jams the feed: the plates stutter down a line at a time, every eye snaps wide and turns to
 *   look, a phrase flashes, the pixels run, and hex garbage scrolls up the edge.
 */
export class CorruptionDamage extends DamageStyle {
  static id = "corruption";

  constructor(layer) {
    super(layer);
    this.static = div("lfd-cor-static");
    this.roll = div("lfd-cor-roll");
    this.bigeye = div("lfd-cor-bigeye");
    this.bigeye.innerHTML = BIG_EYE;
    this.blocks = div("lfd-cor-blocks");
    this.melt = div("lfd-cor-melt");
    this.watchers = div("lfd-cor-watchers");
    this.whispers = div("lfd-cor-whispers");
    this.fx = div("lfd-cor-fx");
    this.host.append(this.static, this.roll, this.bigeye, this.blocks, this.melt, this.watchers, this.whispers, this.fx);
    this.horrorKey = "";
    this.faults = [];
    this.forming = new Map();
    this.busy = false;
    this.mendTimer = null;
  }

  reset() {
    clearTimeout(this.mendTimer);
    this.busy = false;
    this.forming.clear();
  }

  draw(count) {
    this.#render(count);
  }

  strike(from, to) {
    const now = clock.now();
    if (!this.reduce) for (let i = from; i < to; i++) this.forming.set(i, now + (i - from) * STAGGER_MS);
    this.#render(to);
    if (this.reduce) return;
    for (let i = from; i < to; i++) this.after(() => this.#impact(this.faults[i]), (i - from) * STAGGER_MS);
  }

  mend(keep, had) {
    clearTimeout(this.mendTimer);
    if (this.reduce) return this.#render(keep);
    for (let i = keep; i < had; i++) {
      this.forming.delete(i);
      for (const node of this.blocks.querySelectorAll(`[data-index="${i}"]`)) node.classList.add("is-mending");
    }
    this.busy = true;
    this.mendTimer = this.after(() => {
      this.busy = false;
      this.#render(this.levels?.fractures ?? keep);
    }, MEND_MS);
  }

  /** The feed jams: the plates stutter down, the eyes blink, garbage scrolls up the edge. */
  stressHit(levels) {
    this.pulse(this.root, "is-jam", 700);
    this.pulse(this.host, "is-burst", 650);
    // Every eye snaps wide and turns to look
    this.pulse(this.root, "is-startle", 1500);
    // A phrase surfaces, and the pixels run
    const phrase = this.spot(this.fx, "lfd-cor-flash", this.W / 2, this.H * rand(0.25, 0.7), {}, 700);
    phrase.textContent = PHRASES[Math.floor(Math.random() * PHRASES.length)];
    for (let i = 0; i < 12; i++) {
      this.spot(this.fx, "lfd-cor-drip", rand(6, this.W - 6), rand(this.H * 0.05, this.H * 0.8), {
        "--len": `${rand(30, 120)}px`,
        "--d": `${Math.round(rand(0, 300))}ms`,
      }, 1600);
    }
    const lines = [];
    for (let i = 0; i < 16; i++) {
      lines.push(Array.from({ length: 4 }, () => Math.floor(Math.random() * 65536).toString(16).toUpperCase().padStart(4, "0")).join(" "));
    }
    const left = levels.stressLevel % 2 ? 3 : this.W - 3;
    const col = this.spot(this.fx, "lfd-cor-hex", left, this.H, { "--side": levels.stressLevel % 2 ? "0%" : "-100%" }, 1500);
    col.textContent = lines.join("\n");
  }

  sync(levels) {
    this.#syncHorror(levels?.stressLevel ?? 0);
  }

  destroy() {
    clearTimeout(this.mendTimer);
    super.destroy();
  }

  /**
   * The watchers, the melt and the whispers for this stress level: seeded per mech, so they open in the
   * same places every time, and the ones from a lower level stay where they were.
   */
  #syncHorror(level) {
    const { W, H } = this;
    const key = `${this.seed}|${level}|${Math.round(W)}x${Math.round(H)}`;
    if (key === this.horrorKey) return;
    this.horrorKey = key;
    this.watchers.replaceChildren();
    this.melt.replaceChildren();
    this.whispers.replaceChildren();
    if (!level || !this.seed || !W || !H) return;
    const seeded = (kind, k) => {
      const rng = mulberry32(hashSeed(`${this.seed}#${kind}#${k}`));
      return (a, b) => a + (b - a) * rng();
    };
    // Watchers: the first ones in the margins; at the last point, deep in the static too
    for (let k = 0; k < WATCHERS[level]; k++) {
      const r = seeded("watch", k);
      const deep = k >= 8;
      const eye = document.createElement("i");
      eye.className = `lfd-cor-watcher${deep ? " is-deep" : ""}`;
      const x = deep ? r(0.12, 0.84) * W : k % 2 ? W - r(2, 9) - 18 : r(1, 8);
      eye.style.left = `${x}px`;
      eye.style.top = `${r(0.04, 0.95) * H}px`;
      eye.style.setProperty("--k", String(k));
      eye.style.setProperty("--blink", `${r(3.5, 9).toFixed(2)}s`);
      eye.style.setProperty("--d", `${(-r(0, 9)).toFixed(2)}s`);
      eye.style.setProperty("--open", `${Math.round(r(0, 900))}ms`);
      this.watchers.append(eye);
    }
    // The melt: pixels running down from the readout
    for (let k = 0; k < MELT[level]; k++) {
      const r = seeded("melt", k);
      const drip = document.createElement("i");
      drip.style.left = `${r(0.03, 0.97) * W}px`;
      drip.style.top = `${r(0.02, 0.85) * H}px`;
      drip.style.setProperty("--len", `${r(24, 110).toFixed(0)}px`);
      drip.style.setProperty("--dur", `${r(2.6, 6.5).toFixed(2)}s`);
      drip.style.setProperty("--d", `${(-r(0, 6)).toFixed(2)}s`);
      if (r(0, 1) < 0.35) drip.classList.add("is-green");
      this.melt.append(drip);
    }
    // Whispers: a phrase surfacing in the noise for a frame or two
    for (let k = 0; k < WHISPERS[level]; k++) {
      const r = seeded("whisper", k);
      const b = document.createElement("b");
      b.textContent = PHRASES[Math.floor(r(0, PHRASES.length - 0.001))];
      b.style.left = `${r(0.1, 0.62) * W}px`;
      b.style.top = `${r(0.06, 0.92) * H}px`;
      b.style.setProperty("--dur", `${r(7, 15).toFixed(2)}s`);
      b.style.setProperty("--d", `${(-r(0, 14)).toFixed(2)}s`);
      b.style.setProperty("--tilt", `${r(-4, 4).toFixed(1)}deg`);
      this.whispers.append(b);
    }
  }

  /* -------------------------------------------- */

  #render(count) {
    const { W, H } = this;
    this.blocks.replaceChildren();
    if (!count || !W || !H || !this.seed) {
      this.faults = [];
      return;
    }
    this.faults = [];
    for (let i = 0; i < count; i++) this.faults.push(generateCorruption(this.seed, i, W, H));
    const now = clock.now();
    for (const f of this.faults) {
      const block = div("lfd-corrupt lfd-dmg-mark");
      block.dataset.index = String(f.index);
      block.dataset.side = f.side;
      Object.assign(block.style, { left: `${f.x}px`, top: `${f.y}px`, width: `${f.w}px`, height: `${f.h}px` });
      block.style.setProperty("--i", String(f.index));
      const startedAt = this.forming.get(f.index);
      if (startedAt !== undefined) {
        const elapsed = now - startedAt;
        if (elapsed < FORM_MS) {
          block.classList.add("is-forming");
          block.style.setProperty("--t0", `${Math.round(-elapsed)}ms`);
          this.after(() => {
            if (this.forming.get(f.index) !== startedAt) return;
            this.forming.delete(f.index);
            this.blocks.querySelector(`.lfd-corrupt[data-index="${f.index}"]`)?.classList.remove("is-forming");
          }, FORM_MS - elapsed);
        } else this.forming.delete(f.index);
      }
      const noise = document.createElement("i");
      noise.className = "lfd-corrupt-noise";
      const code = document.createElement("b");
      code.className = "lfd-corrupt-code";
      code.textContent = `ERR 0x${f.code}`;
      block.append(noise, code);
      // The glitch band, torn and shoved sideways
      const band = document.createElement("i");
      band.className = "lfd-corrupt-band";
      band.style.setProperty("--at", `${f.band.at}px`);
      band.style.setProperty("--thick", `${f.band.thick}px`);
      band.style.setProperty("--len", `${f.band.len}px`);
      block.append(band);
      for (const s of f.smears) {
        const smear = document.createElement("i");
        smear.className = "lfd-corrupt-smear";
        smear.style.setProperty("--at", `${s.at}px`);
        smear.style.setProperty("--len", `${s.len}px`);
        smear.style.setProperty("--thick", `${s.thick}px`);
        block.append(smear);
      }
      this.blocks.append(block);
      for (const [px, py] of f.dead) {
        const dead = div("lfd-corrupt-dead");
        dead.dataset.index = String(f.index);
        dead.style.left = `${px}px`;
        dead.style.top = `${py}px`;
        this.blocks.append(dead);
      }
    }
  }

  /** The fault: the plates tear, the eyes blink, and the stamp flashes where it hit. */
  #impact(f) {
    if (!f) return;
    this.pulse(this.root, "is-tear", 460);
    this.pulse(this.root, "is-blink", 360);
    const x = Math.max(40, Math.min(this.W - 40, f.x + f.w / 2));
    const y = Math.max(12, Math.min(this.H - 12, f.y + f.h / 2));
    const stamp = this.spot(this.fx, "lfd-cor-fault", x, y, {}, 900);
    stamp.textContent = `∴ FAULT 0x${f.code}`;
    for (let i = 0; i < 24; i++) {
      this.spot(this.fx, "lfd-cor-bit", f.x + rand(0, f.w), f.y + rand(0, f.h), {
        "--dx": `${Math.cos(f.inward) * rand(10, 60)}px`,
        "--dy": `${rand(-8, 8)}px`,
        "--d": `${Math.round(rand(0, 200))}ms`,
      }, 900);
    }
  }
}

function div(cls) {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}
