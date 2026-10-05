import { MODULE_ID, SETTINGS } from "../constants.js";
import { OVERLAYS } from "./overlays.js";
import { ART_FX, ART_FX_IDS, ART_FX_PREFIX } from "./presets.js";

/** Lancer QoL's filterId for its Jammed effect. */
const QOL_JAMMED = "jammed";

/**
 * Condition effects on tokens, in three layers:
 *
 *  1. Art effects (Exposed fire, Shredded smoke, Jammed and Impaired electricity) are Token
 *     Magic FX filters on the token art, so they follow its silhouette. They are stored on the
 *     token, so exactly ONE client writes them: the active GM, or with no GM online, the first
 *     active owner. That client reconciles the token's "lfd-" filters against its statuses.
 *  2. Overlays (web, chains, reticle, sparks...) are drawn locally on every client from the
 *     token's statuses. Nothing is stored, so they need no permissions and never go stale.
 *  3. Prone tips the token art 90 degrees, also locally.
 *
 * Lancer QoL already draws an electricity effect for Jammed; when its condition effects are on,
 * Flight Deck leaves Jammed to it rather than stacking two.
 */
export class TokenEffects {
  static #instance;

  static get instance() {
    return (this.#instance ??= new TokenEffects());
  }

  /** @type {Map<Token, TokenRig>} */
  #rigs = new Map();
  #time = 0;
  #ticking = false;
  #queued = new Map();
  #flushScheduled = false;
  /** Serialises Token Magic writes per token, so rapid toggles can't race. */
  #artChains = new Map();

  init() {
    Hooks.on("canvasReady", () => this.#syncAll({ intro: false, reconcile: true }));
    Hooks.on("canvasTearDown", () => this.#clear());
    Hooks.on("drawToken", token => this.#queue(token, { intro: false, reconcile: false }));
    Hooks.on("refreshToken", (token, flags) => this.#onRefresh(token, flags));
    Hooks.on("destroyToken", token => this.#drop(token));
    // Document hooks fire even when this window isn't rendering (a GM's background tab), so
    // the art-effect writer still reconciles; refreshToken.redrawEffects covers rendering.
    const fromActor = actor => {
      if (!actor || !canvas?.ready) return;
      for (const token of actor.getActiveTokens()) this.#queue(token, { intro: true, reconcile: true });
    };
    const fromEffect = effect => {
      const parent = effect?.parent;
      fromActor(parent?.documentName === "Actor" ? parent : parent?.parent);
    };
    Hooks.on("createActiveEffect", fromEffect);
    Hooks.on("updateActiveEffect", fromEffect);
    Hooks.on("deleteActiveEffect", fromEffect);
    Hooks.on("updateActor", actor => fromActor(actor));
    Hooks.on("updateToken", (doc, changes) => {
      if (!doc.object) return;
      // Lancer QoL wrecks and repairs tokens by flag: effects come off the wreck and back after a repair
      if (foundry.utils.hasProperty(changes, "flags.csm-lancer-qol.isDead")) return this.#queue(doc.object, { intro: false, reconcile: true });
      // QoL adds its Jammed filter on the applying client, possibly after we reconciled; catch it
      if (!foundry.utils.hasProperty(changes, "flags.tokenmagic")) return;
      // globalThis: with Token Magic FX absent, a bare `TokenMagic` is a ReferenceError (?. doesn't help)
      if (doc.actor?.statuses?.has("jammed") && globalThis.TokenMagic?.hasFilterId?.(doc.object, QOL_JAMMED)) {
        this.#queue(doc.object, { intro: false, reconcile: true });
      }
    });
  }

  get enabled() {
    return !!game.settings.get(MODULE_ID, SETTINGS.TOKEN_FX);
  }

  get opacity() {
    return Number(game.settings.get(MODULE_ID, SETTINGS.TOKEN_FX_OPACITY)) || 0.9;
  }

  get reduceMotion() {
    const mode = game.settings.get(MODULE_ID, SETTINGS.REDUCE_MOTION);
    return mode === "on" || (mode === "auto" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  /** Read-only snapshot for debugging: per-token overlay ids and prone state. */
  debugState() {
    return {
      time: this.#time,
      ticking: this.#ticking,
      rigs: [...this.#rigs].map(([token, rig]) => ({
        token: token.name,
        items: [...rig.items.keys()],
        prone: { ...rig.prone },
        baseAngle: rig.baseAngle,
      })),
    };
  }

  /** Settings changed: rebuild everything (and let the writer reconcile art effects). */
  refreshAll() {
    for (const rig of this.#rigs.values()) rig.destroy();
    this.#rigs.clear();
    this.#syncAll({ intro: false, reconcile: true });
  }

  /* -------------------------------------------- */
  /*  Scheduling                                  */
  /* -------------------------------------------- */

  #queue(token, { intro, reconcile }) {
    if (!token || token.isPreview) return;
    const prev = this.#queued.get(token);
    this.#queued.set(token, { intro: intro || !!prev?.intro, reconcile: reconcile || !!prev?.reconcile });
    if (this.#flushScheduled) return;
    this.#flushScheduled = true;
    // A microtask, not requestAnimationFrame: rAF stalls in hidden windows
    queueMicrotask(() => {
      this.#flushScheduled = false;
      const batch = [...this.#queued];
      this.#queued.clear();
      // The canvas is tearing down or still drawing; canvasReady re-syncs every token
      if (!canvas?.ready) return;
      for (const [token, opts] of batch) this.#sync(token, opts);
    });
  }

  #syncAll(opts) {
    if (!canvas?.ready) return;
    for (const token of canvas.tokens.placeables) this.#queue(token, opts);
  }

  #onRefresh(token, flags) {
    // Foundry flags redrawEffects on every client whenever the token's actor or its effects
    // change (TokenDocument#_onRelatedUpdate). That is our signal for status changes.
    if (flags.redrawEffects) this.#queue(token, { intro: true, reconcile: true });
    const rig = this.#rigs.get(token);
    if (!rig) return;
    if (flags.refreshRotation) rig.captureBaseAngle();
    rig.applyProne();
    if (flags.refreshSize || flags.refreshShape) this.#queue(token, { intro: false, reconcile: false });
  }

  #drop(token) {
    this.#rigs.get(token)?.destroy();
    this.#rigs.delete(token);
  }

  #clear() {
    this.#queued.clear();
    for (const rig of this.#rigs.values()) rig.destroy();
    this.#rigs.clear();
    this.#stopTicker();
  }

  /* -------------------------------------------- */
  /*  Sync                                        */
  /* -------------------------------------------- */

  #sync(token, { intro, reconcile }) {
    if (token.destroyed || !token.actor) return this.#drop(token);
    const actor = token.actor;
    const statuses = actor.statuses ?? new Set();
    const wrecked = isWrecked(token);

    // Local overlays and prone
    if (this.enabled && !wrecked) {
      const wanted = new Map();
      for (const def of OVERLAYS) if (def.active(actor)) wanted.set(def.id, def.key?.(actor) ?? "");
      const prone = statuses.has("prone");
      let rig = this.#rigs.get(token);
      if (!rig && (wanted.size || prone)) {
        rig = new TokenRig(token);
        this.#rigs.set(token, rig);
      }
      rig?.sync(wanted, prone, { intro: intro && !this.reduceMotion, opacity: this.opacity, time: this.#time });
      if (rig && rig.isEmpty) this.#drop(token);
    } else this.#drop(token);
    this.#updateTicker();

    // Stored art effects: only the designated writer touches them
    if (reconcile && this.#isArtWriter(actor)) this.#reconcileArt(token, wrecked);
  }

  /* -------------------------------------------- */
  /*  Animation                                   */
  /* -------------------------------------------- */

  #updateTicker() {
    const needed = !this.reduceMotion && [...this.#rigs.values()].some(r => r.animated);
    if (needed && !this.#ticking) {
      canvas.app.ticker.add(this.#tick, this, PIXI.UPDATE_PRIORITY.LOW);
      this.#ticking = true;
    } else if (!needed) this.#stopTicker();
    // Reduced motion: draw one static frame
    if (this.reduceMotion) for (const rig of this.#rigs.values()) rig.animate(this.#time, true);
  }

  #stopTicker() {
    if (!this.#ticking) return;
    canvas.app?.ticker.remove(this.#tick, this);
    this.#ticking = false;
  }

  #tick() {
    this.#time += canvas.app.ticker.deltaMS / 1000;
    for (const [token, rig] of this.#rigs) {
      if (token.destroyed) {
        this.#rigs.delete(token);
        continue;
      }
      if (token.visible) rig.animate(this.#time, false);
      if (rig.isEmpty) this.#drop(token);
    }
    if (!this.#rigs.size) this.#stopTicker();
  }

  /* -------------------------------------------- */
  /*  Art effects (Token Magic FX)                */
  /* -------------------------------------------- */

  /** One writer per token: the active GM, or with no GM online, the first active owner. */
  #isArtWriter(actor) {
    if (!game.modules.get("tokenmagic")?.active || typeof TokenMagic === "undefined") return false;
    if (!game.settings.get(MODULE_ID, SETTINGS.ART_FX_WORLD) && !game.user.isGM) return false;
    const gm = game.users.activeGM;
    if (gm) return gm.isSelf;
    const owner = game.users
      .filter(u => u.active && actor.testUserPermission(u, "OWNER"))
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    return !!owner?.isSelf;
  }

  /** Whether Lancer QoL is active and drawing its condition effects. */
  #qolEffectsOn() {
    if (!game.modules.get("csm-lancer-qol")?.active) return false;
    try {
      return !!game.settings.get("csm-lancer-qol", "enableConditionEffects");
    } catch {
      return false;
    }
  }

  /** Jammed is drawn by QoL only when the world chose it; otherwise Flight Deck draws it. */
  #qolDrawsJammed() {
    return this.#qolEffectsOn() && game.settings.get(MODULE_ID, SETTINGS.JAMMED_SOURCE) === "qol";
  }

  #reconcileArt(token, wrecked) {
    const chain = (this.#artChains.get(token.id) ?? Promise.resolve()).then(() => this.#applyArt(token, wrecked));
    this.#artChains.set(token.id, chain.catch(err => console.warn("Flight Deck | Token Magic update failed", err)));
  }

  async #applyArt(token, wrecked) {
    if (token.destroyed || !token.actor) return;
    const statuses = token.actor.statuses ?? new Set();
    const enabled = game.settings.get(MODULE_ID, SETTINGS.ART_FX_WORLD);
    const status = { exposed: "exposed", shredded: "shredded", jammed: "jammed", impaired: "impaired" };
    for (const [effect, preset] of Object.entries(ART_FX)) {
      let want = enabled && !wrecked && statuses.has(status[effect]);
      if (effect === "jammed" && this.#qolDrawsJammed()) want = false;
      const ids = ART_FX_IDS[effect];
      const present = ids.filter(id => TokenMagic.hasFilterId(token, id));
      if (want && present.length !== ids.length) await token.TMFXaddUpdateFilters(foundry.utils.deepClone(preset));
      else if (!want) for (const id of present) await token.TMFXdeleteFilters(id);
      // QoL's Jammed multiplies the art to near-black; when Flight Deck draws Jammed, retire it
      if (effect === "jammed" && want && TokenMagic.hasFilterId(token, QOL_JAMMED)) await token.TMFXdeleteFilters(QOL_JAMMED);
    }
    // Sweep orphans (e.g. a preset renamed in a later version)
    const known = new Set(Object.values(ART_FX_IDS).flat());
    const filters = token.document.getFlag("tokenmagic", "filters") ?? [];
    for (const f of filters) {
      const id = f?.tmFilters?.tmFilterId;
      if (id?.startsWith(ART_FX_PREFIX) && !known.has(id)) await token.TMFXdeleteFilters(id);
    }
  }
}

/**
 * Per-token container for local overlays, plus the prone rotation of the token's art.
 */
/**
 * Wrecked or destroyed: the remains get no condition effects. That's LANCER's destroyed status, Foundry's
 * defeated, a mech or NPC at 0 structure, or a Lancer QoL wreck (flagged; read raw, as getFlag throws
 * for a module that isn't active).
 */
function isWrecked(token) {
  const actor = token.actor;
  const statuses = actor?.statuses ?? new Set();
  if (statuses.has("destroyed") || statuses.has(CONFIG.specialStatusEffects.DEFEATED)) return true;
  if (foundry.utils.getProperty(token.document, "flags.csm-lancer-qol.isDead")) return true;
  const structure = actor?.system?.structure;
  return (actor?.type === "mech" || actor?.type === "npc") && Number(structure?.max) > 0 && Number(structure?.value) <= 0;
}

class TokenRig {
  constructor(token) {
    this.token = token;
    this.root = new PIXI.Container();
    this.root.name = "lfd-condition-overlays";
    this.root.zIndex = -2; // above the art (which lives in the primary group), under bars and icons
    this.root.eventMode = "none";
    this.root.interactiveChildren = false;
    token.addChild(this.root);
    /** @type {Map<string, {def: object, key: string, fx: {root: PIXI.Container, animate: Function}, holder: PIXI.Container, born: number, dying: number|null}>} */
    this.items = new Map();
    this.sizeKey = "";
    this.prone = { want: false, angle: 0, from: 0, start: 0 };
    this.baseAngle = token.document.lockRotation ? 0 : token.document.rotation;
    this.opacity = 0.9;
    this.now = 0;
  }

  get isEmpty() {
    return this.items.size === 0 && !this.prone.want && this.prone.angle === 0;
  }

  get animated() {
    return this.items.size > 0 || this.prone.angle !== (this.prone.want ? 90 : 0);
  }

  captureBaseAngle() {
    // Foundry just set mesh.angle from the document; remember it before adding our offset
    if (this.token.mesh) this.baseAngle = this.token.mesh.angle;
  }

  applyProne() {
    const mesh = this.token.mesh;
    if (mesh && !mesh.destroyed && this.prone.angle) mesh.angle = this.baseAngle + this.prone.angle;
  }

  sync(wanted, prone, { intro, opacity, time }) {
    this.opacity = opacity;
    this.now = time;
    const geo = this.#geometry();
    const sizeKey = `${geo.w}x${geo.h}x${geo.u}`;
    if (sizeKey !== this.sizeKey) {
      // Token resized: rebuild everything at the new size without intros
      for (const item of this.items.values()) item.holder.destroy({ children: true });
      this.items.clear();
      this.sizeKey = sizeKey;
      intro = false;
    }

    for (const [id, item] of this.items) if (!wanted.has(id) && item.dying === null) item.dying = time;

    const actor = this.token.actor;
    OVERLAYS.forEach((def, order) => {
      if (!wanted.has(def.id)) return;
      const key = wanted.get(def.id);
      const existing = this.items.get(def.id);
      if (existing && existing.dying === null && existing.key === key) return;
      if (existing) existing.holder.destroy({ children: true });
      const fx = def.build(geo, actor);
      // The holder's alpha is ours (fades, opacity); the overlay animates its own root freely
      const holder = new PIXI.Container();
      holder.zIndex = order;
      holder.addChild(fx.root);
      this.root.addChild(holder);
      this.items.set(def.id, { def, key, fx, holder, born: intro ? time : time - 10, dying: null });
    });
    this.root.sortableChildren = true;

    // Prone: tip over (or stand back up) with a short fall
    if (prone !== this.prone.want) {
      if (prone) this.captureBaseAngle();
      this.prone = { want: prone, angle: this.prone.angle, from: this.prone.angle, start: intro ? time : time - 10 };
    }
    this.animate(time, !intro);
  }

  animate(time, settle) {
    this.now = time;
    for (const [id, item] of this.items) {
      const age = time - item.born;
      const fadeIn = settle ? 1 : Math.min(1, age / 0.3);
      let fadeOut = 1;
      if (item.dying !== null) {
        fadeOut = settle ? 0 : 1 - Math.min(1, (time - item.dying) / 0.25);
        if (fadeOut <= 0) {
          item.holder.destroy({ children: true });
          this.items.delete(id);
          continue;
        }
      }
      item.fx.animate(settle ? 2 : age);
      item.holder.alpha = fadeIn * fadeOut * this.opacity;
    }

    // Prone rotation: ease to 90 degrees (or back to 0) over 0.45 s
    const target = this.prone.want ? 90 : 0;
    if (this.prone.angle !== target) {
      const p = settle ? 1 : Math.min(1, (time - this.prone.start) / 0.45);
      const eased = this.prone.want ? 1 - (1 - p) ** 3 : p * p;
      this.prone.angle = this.prone.from + (target - this.prone.from) * eased;
      if (p >= 1) this.prone.angle = target;
      const mesh = this.token.mesh;
      if (mesh && !mesh.destroyed) mesh.angle = this.baseAngle + this.prone.angle;
    }
  }

  #geometry() {
    const w = this.token.w;
    const h = this.token.h;
    const grid = canvas.dimensions?.size ?? 100;
    return { w, h, cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2, r: Math.max(w, h) / 2, u: Math.max(1.25, grid / 55) };
  }

  destroy() {
    // Stand the art back up before letting go
    const mesh = this.token.mesh;
    if (mesh && !mesh.destroyed && this.prone.angle) mesh.angle = this.baseAngle;
    if (!this.root.destroyed) this.root.destroy({ children: true });
    this.items.clear();
  }
}
