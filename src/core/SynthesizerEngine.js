/**
 * Zero-asset cockpit audio. Every cue is synthesized with the Web Audio API on Foundry's
 * interface AudioContext, so the "Interface" volume slider governs it, and it only plays
 * on this client.
 *
 * Discord discipline:
 *  - cues are short and event-driven; nothing drones at full level
 *  - each cue has a cooldown, so bursts of updates never stack sounds
 *  - a limiter sits on the bus, so overlapping cues never clip
 *  - cues are dropped (not queued) while the browser's audio lock is closed
 */
const COOLDOWN_MS = {
  spool: 4000,
  geiger: 2600,
  chime: 1200,
  klaxon: 6000,
  thud: 500,
  boot: 2500,
  core: 2000,
  hud: 120,
  crack: 500,
  hiss: 2200,
  datalink: 400,
};

export class SynthesizerEngine {
  #enabled = true;
  #volume = 0.6;
  /** @type {AudioContext|null} */
  #ctx = null;
  /** @type {GainNode|null} */
  #bus = null;
  /** @type {DynamicsCompressorNode|null} */
  #limiter = null;
  /** @type {AudioBuffer|null} */
  #noise = null;
  #lastPlayed = new Map();
  #voices = new Set();

  constructor({ enabled = true, volume = 0.6 } = {}) {
    this.#enabled = !!enabled;
    this.#volume = clamp01(volume);
  }

  get enabled() {
    return this.#enabled;
  }

  setEnabled(enabled) {
    this.#enabled = !!enabled;
    if (!this.#enabled) this.stopAll();
  }

  setVolume(volume) {
    this.#volume = clamp01(volume);
    if (this.#bus && this.#ctx) this.#bus.gain.setTargetAtTime(this.#volume, this.#ctx.currentTime, 0.05);
  }

  /**
   * Play a named cue.
   * @param {"spool"|"geiger"|"chime"|"klaxon"|"thud"|"boot"|"core"} cue
   * @param {object} [opts]
   */
  async play(cue, opts = {}) {
    if (!this.#enabled || !(cue in COOLDOWN_MS)) return false;
    const now = performance.now();
    if (now - (this.#lastPlayed.get(cue) ?? -Infinity) < COOLDOWN_MS[cue]) return false;
    const ctx = await this.#context();
    if (!ctx) return false;
    this.#lastPlayed.set(cue, now);
    try {
      switch (cue) {
        case "spool": this.#spool(ctx, opts); break;
        case "geiger": this.#geiger(ctx); break;
        case "chime": this.#chime(ctx, opts.freqs ?? [800, 600]); break;
        case "klaxon": this.#klaxon(ctx, opts.freqs ?? [520, 740]); break;
        case "thud": this.#thud(ctx); break;
        case "boot": this.#boot(ctx, opts.freqs ?? [660, 880, 1320]); break;
        case "core": this.#core(ctx); break;
        case "hud": this.#hud(ctx, opts.freq ?? 1760); break;
        case "crack": this.#crack(ctx); break;
        case "hiss": this.#hiss(ctx); break;
        case "datalink": this.#datalink(ctx); break;
      }
      return true;
    } catch (err) {
      console.warn("Flight Deck | Audio cue failed", cue, err);
      return false;
    }
  }

  /** Fade out and stop everything currently sounding. */
  stopAll() {
    const ctx = this.#ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const voice of this.#voices) {
      voice.out.gain.cancelScheduledValues(t);
      voice.out.gain.setTargetAtTime(0, t, 0.015);
      for (const src of voice.sources) {
        try {
          src.stop(t + 0.08);
        } catch {
          /* already stopped */
        }
      }
    }
  }

  destroy() {
    this.stopAll();
    try {
      this.#bus?.disconnect();
      this.#limiter?.disconnect();
    } catch {
      /* ignore */
    }
    this.#ctx = this.#bus = this.#limiter = this.#noise = null;
  }

  /* -------------------------------------------- */
  /*  Graph                                       */
  /* -------------------------------------------- */

  async #context() {
    const audio = game.audio;
    // Never queue cues behind the autoplay lock: a late alarm is worse than none.
    if (!audio || audio.locked) return null;
    const ctx = audio.interface;
    if (!ctx) return null;
    if (ctx !== this.#ctx) this.#build(ctx);
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        return null;
      }
    }
    return ctx.state === "running" ? ctx : null;
  }

  #build(ctx) {
    this.#ctx = ctx;
    this.#limiter = ctx.createDynamicsCompressor();
    this.#limiter.threshold.value = -10;
    this.#limiter.knee.value = 6;
    this.#limiter.ratio.value = 12;
    this.#limiter.attack.value = 0.002;
    this.#limiter.release.value = 0.15;
    this.#bus = ctx.createGain();
    this.#bus.gain.value = this.#volume;
    this.#bus.connect(this.#limiter);
    // Foundry attaches its master interface gain as ctx.gainNode
    this.#limiter.connect(ctx.gainNode ?? ctx.destination);
    this.#noise = null;
  }

  /** Register a voice so it can be faded on stop and fully disconnected when it ends. */
  #voice(ctx, { sources, nodes = [], out }) {
    const voice = { sources, nodes, out };
    this.#voices.add(voice);
    let live = sources.length;
    const done = () => {
      if (--live > 0) return;
      for (const node of [...sources, ...nodes, out]) {
        try {
          node.disconnect();
        } catch {
          /* ignore */
        }
      }
      this.#voices.delete(voice);
    };
    for (const src of sources) src.addEventListener("ended", done, { once: true });
    out.connect(this.#bus);
    return voice;
  }

  #osc(ctx, type, freq) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    return osc;
  }

  #gain(ctx, value = 0) {
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
  }

  #filter(ctx, type, freq, q = 0.7) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  #noiseBuffer(ctx) {
    if (this.#noise && this.#noise.sampleRate === ctx.sampleRate) return this.#noise;
    const length = Math.floor(ctx.sampleRate * 0.25);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return (this.#noise = buffer);
  }

  /* -------------------------------------------- */
  /*  Cues                                        */
  /* -------------------------------------------- */

  /** Danger Zone: a 1.8 s turbine spool-up, then an optional near-silent hum that fades away. */
  #spool(ctx, { hum = true } = {}) {
    const t = ctx.currentTime + 0.02;
    const end = t + 1.8;

    const saw = this.#osc(ctx, "sawtooth", 55);
    saw.frequency.setValueAtTime(55, t);
    saw.frequency.exponentialRampToValueAtTime(330, end);
    const sine = this.#osc(ctx, "sine", 110);
    sine.frequency.setValueAtTime(110, t);
    sine.frequency.exponentialRampToValueAtTime(660, end);
    const sawLevel = this.#gain(ctx, 0.55);

    const lp = this.#filter(ctx, "lowpass", 180, 7);
    lp.frequency.setValueAtTime(180, t);
    lp.frequency.exponentialRampToValueAtTime(2600, end);

    const out = this.#gain(ctx, 0);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.2, t + 0.18);
    out.gain.linearRampToValueAtTime(0.28, t + 1.55);
    out.gain.exponentialRampToValueAtTime(0.0008, t + 2.1);

    saw.connect(sawLevel).connect(lp);
    sine.connect(lp);
    lp.connect(out);
    saw.start(t);
    sine.start(t);
    saw.stop(t + 2.15);
    sine.stop(t + 2.15);
    this.#voice(ctx, { sources: [saw, sine], nodes: [sawLevel, lp], out });

    if (!hum) return;
    // Afterglow: a low hum just above silence that fades out over ~12 s, never a drone.
    const h1 = this.#osc(ctx, "sine", 46);
    const h2 = this.#osc(ctx, "sine", 92);
    const h3 = this.#osc(ctx, "triangle", 184); // makes the hum perceptible on small speakers
    const h3Level = this.#gain(ctx, 0.18);
    const humOut = this.#gain(ctx, 0);
    humOut.gain.setValueAtTime(0, t + 1.5);
    humOut.gain.linearRampToValueAtTime(0.05, t + 2.0);
    humOut.gain.linearRampToValueAtTime(0, t + 14);
    h1.connect(humOut);
    h2.connect(humOut);
    h3.connect(h3Level).connect(humOut);
    for (const o of [h1, h2, h3]) {
      o.start(t + 1.5);
      o.stop(t + 14.1);
    }
    this.#voice(ctx, { sources: [h1, h2, h3], nodes: [h3Level], out: humOut });
  }

  /** Stress hit: 2.5 s of aperiodic detector clicks, rendered into one buffer. */
  #geiger(ctx) {
    const duration = 2.5;
    const rate = ctx.sampleRate;
    const length = Math.ceil(duration * rate);
    const buffer = ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    const clickLength = Math.max(8, Math.floor(rate * 0.0016));
    let time = 0.02;
    while (time < duration - 0.02) {
      const start = Math.floor(time * rate);
      const amp = 0.45 + Math.random() * 0.5;
      for (let i = 0; i < clickLength && start + i < length; i++) {
        data[start + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / (clickLength * 0.25));
      }
      // Poisson arrivals whose rate decays: a burst, then a thinning trickle
      const clicksPerSecond = 26 * Math.exp(-time / 1.1) + 5;
      time += -Math.log(1 - Math.random()) / clicksPerSecond;
    }

    const t = ctx.currentTime + 0.02;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const hp = this.#filter(ctx, "highpass", 1800, 0.8);
    const out = this.#gain(ctx, 0.5);
    out.gain.setValueAtTime(0.5, t + duration - 0.3);
    out.gain.linearRampToValueAtTime(0, t + duration);
    src.connect(hp).connect(out);
    src.start(t);
    src.stop(t + duration + 0.02);
    this.#voice(ctx, { sources: [src], nodes: [hp], out });
  }

  /** Master caution: a crisp two-tone chime (800 Hz then 600 Hz by default). */
  #chime(ctx, [first, second]) {
    const t = ctx.currentTime + 0.02;
    const tone = (freq, at) => {
      const fundamental = this.#osc(ctx, "sine", freq);
      const overtone = this.#osc(ctx, "sine", freq * 2);
      const overLevel = this.#gain(ctx, 0.22);
      const out = this.#gain(ctx, 0);
      out.gain.setValueAtTime(0, at);
      out.gain.linearRampToValueAtTime(0.32, at + 0.006);
      out.gain.exponentialRampToValueAtTime(0.001, at + 0.3);
      fundamental.connect(out);
      overtone.connect(overLevel).connect(out);
      fundamental.start(at);
      overtone.start(at);
      fundamental.stop(at + 0.32);
      overtone.stop(at + 0.32);
      this.#voice(ctx, { sources: [fundamental, overtone], nodes: [overLevel], out });
    };
    tone(first, t);
    tone(second, t + 0.17);
  }

  /** Meltdown: one klaxon cycle (six alternating half-periods, ~1.4 s), then silence. */
  #klaxon(ctx, [low, high]) {
    const t = ctx.currentTime + 0.02;
    const step = 0.24;
    const steps = 6;
    const osc = this.#osc(ctx, "square", low);
    const lp = this.#filter(ctx, "lowpass", 1800, 0.9);
    const out = this.#gain(ctx, 0);
    for (let i = 0; i < steps; i++) {
      const at = t + i * step;
      osc.frequency.setValueAtTime(i % 2 ? high : low, at);
      out.gain.setValueAtTime(0, at);
      out.gain.linearRampToValueAtTime(0.13, at + 0.012);
      out.gain.setValueAtTime(0.13, at + step - 0.02);
      out.gain.linearRampToValueAtTime(0, at + step - 0.004);
    }
    osc.connect(lp).connect(out);
    osc.start(t);
    osc.stop(t + steps * step + 0.02);
    this.#voice(ctx, { sources: [osc], nodes: [lp], out });
  }

  /** Structure hit: a heavy low impact. */
  #thud(ctx) {
    const t = ctx.currentTime + 0.02;
    const body = this.#osc(ctx, "sine", 150);
    body.frequency.setValueAtTime(150, t);
    body.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const bodyOut = this.#gain(ctx, 0);
    bodyOut.gain.setValueAtTime(0, t);
    bodyOut.gain.linearRampToValueAtTime(0.55, t + 0.008);
    bodyOut.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    body.connect(bodyOut);
    body.start(t);
    body.stop(t + 0.47);
    this.#voice(ctx, { sources: [body], out: bodyOut });

    const grit = ctx.createBufferSource();
    grit.buffer = this.#noiseBuffer(ctx);
    const lp = this.#filter(ctx, "lowpass", 700, 0.7);
    const gritOut = this.#gain(ctx, 0);
    gritOut.gain.setValueAtTime(0.3, t);
    gritOut.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    grit.connect(lp).connect(gritOut);
    grit.start(t);
    grit.stop(t + 0.16);
    this.#voice(ctx, { sources: [grit], nodes: [lp], out: gritOut });
  }

  /** Cold boot: a relay tick and three rising blips. */
  #boot(ctx, freqs) {
    const t = ctx.currentTime + 0.02;
    const tick = ctx.createBufferSource();
    tick.buffer = this.#noiseBuffer(ctx);
    const hp = this.#filter(ctx, "highpass", 2500, 0.7);
    const tickOut = this.#gain(ctx, 0);
    tickOut.gain.setValueAtTime(0.25, t);
    tickOut.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    tick.connect(hp).connect(tickOut);
    tick.start(t);
    tick.stop(t + 0.02);
    this.#voice(ctx, { sources: [tick], nodes: [hp], out: tickOut });

    freqs.forEach((freq, i) => {
      const at = t + 0.12 + i * 0.09;
      const blip = this.#osc(ctx, "sine", freq);
      const out = this.#gain(ctx, 0);
      out.gain.setValueAtTime(0, at);
      out.gain.linearRampToValueAtTime(0.16, at + 0.006);
      out.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
      blip.connect(out);
      blip.start(at);
      blip.stop(at + 0.08);
      this.#voice(ctx, { sources: [blip], out });
    });
  }

  /** Structure lost: glass giving way, a burst of sharp ticks that dies off over ~0.25 s. */
  #crack(ctx) {
    const t = ctx.currentTime + 0.012;
    const src = ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(ctx);
    const bp = this.#filter(ctx, "bandpass", 3400, 1.1);
    const hp = this.#filter(ctx, "highpass", 1400, 0.7);
    const out = this.#gain(ctx, 0);
    // Irregular ticks, closer together at first, like a crack running
    let at = t;
    for (let i = 0; i < 9; i++) {
      const level = 0.34 * Math.pow(0.78, i) * (0.6 + Math.random() * 0.4);
      out.gain.setValueAtTime(level, at);
      out.gain.exponentialRampToValueAtTime(0.002, at + 0.006 + Math.random() * 0.006);
      at += 0.008 + i * 0.006 + Math.random() * 0.01;
    }
    out.gain.setValueAtTime(0, at + 0.01);
    src.connect(bp).connect(hp).connect(out);
    src.start(t);
    src.stop(at + 0.03);
    this.#voice(ctx, { sources: [src], nodes: [bp, hp], out });
  }

  /** Steam venting through the cracks: a soft hiss, quickly in and slowly out. */
  #hiss(ctx) {
    const t = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = this.#noiseBuffer(ctx);
    src.loop = true;
    const hp = this.#filter(ctx, "highpass", 3600, 0.5);
    const lp = this.#filter(ctx, "lowpass", 9000, 0.5);
    const out = this.#gain(ctx, 0);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.075, t + 0.06);
    out.gain.exponentialRampToValueAtTime(0.03, t + 0.4);
    out.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    src.connect(hp).connect(lp).connect(out);
    src.start(t);
    src.stop(t + 1.15);
    this.#voice(ctx, { sources: [src], nodes: [hp, lp], out });
  }

  /** HUD menu: a relay tick and one soft blip, quieter than any alert. */
  #hud(ctx, freq) {
    const t = ctx.currentTime + 0.01;
    const tick = ctx.createBufferSource();
    tick.buffer = this.#noiseBuffer(ctx);
    const hp = this.#filter(ctx, "highpass", 3200, 0.7);
    const tickOut = this.#gain(ctx, 0);
    tickOut.gain.setValueAtTime(0.12, t);
    tickOut.gain.exponentialRampToValueAtTime(0.001, t + 0.008);
    tick.connect(hp).connect(tickOut);
    tick.start(t);
    tick.stop(t + 0.015);
    this.#voice(ctx, { sources: [tick], nodes: [hp], out: tickOut });

    const blip = this.#osc(ctx, "sine", freq);
    const out = this.#gain(ctx, 0);
    out.gain.setValueAtTime(0, t + 0.02);
    out.gain.linearRampToValueAtTime(0.07, t + 0.026);
    out.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
    blip.connect(out);
    blip.start(t + 0.02);
    blip.stop(t + 0.085);
    this.#voice(ctx, { sources: [blip], out });
  }

  /** INVADE menu: three quick, filtered data chirps. */
  #datalink(ctx) {
    const t = ctx.currentTime + 0.01;
    [2350, 1570, 3130].forEach((freq, i) => {
      const at = t + i * 0.045;
      const chirp = this.#osc(ctx, "square", freq);
      const lp = this.#filter(ctx, "lowpass", 4200, 0.9);
      const out = this.#gain(ctx, 0);
      out.gain.setValueAtTime(0, at);
      out.gain.linearRampToValueAtTime(0.035, at + 0.004);
      out.gain.exponentialRampToValueAtTime(0.001, at + 0.035);
      chirp.connect(lp).connect(out);
      chirp.start(at);
      chirp.stop(at + 0.04);
      this.#voice(ctx, { sources: [chirp], nodes: [lp], out });
    });
  }

  /** Core power: a short rising sweep. */
  #core(ctx) {
    const t = ctx.currentTime + 0.02;
    const a = this.#osc(ctx, "sine", 220);
    const b = this.#osc(ctx, "triangle", 223);
    a.frequency.setValueAtTime(220, t);
    a.frequency.exponentialRampToValueAtTime(880, t + 0.5);
    b.frequency.setValueAtTime(223, t);
    b.frequency.exponentialRampToValueAtTime(884, t + 0.5);
    const out = this.#gain(ctx, 0);
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.15, t + 0.05);
    out.gain.setValueAtTime(0.15, t + 0.45);
    out.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    a.connect(out);
    b.connect(out);
    a.start(t);
    b.start(t);
    a.stop(t + 0.77);
    b.stop(t + 0.77);
    this.#voice(ctx, { sources: [a, b], out });
  }
}

function clamp01(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.6;
}
