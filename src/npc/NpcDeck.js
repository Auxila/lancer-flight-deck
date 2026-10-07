import { MODULE_ID, SCALE_MAX, SCALE_MIN, SETTINGS, TEMPLATE_ROOT } from "../constants.js";
import { setStatus } from "../core/ConditionControl.js";
import { getSetting, reduceMotion, setSetting } from "../settings.js";
import { resolveTheme } from "../themes/registry.js";
import { DeckFrame } from "../ui/DeckFrame.js";
import { HoverCards } from "../ui/HoverCards.js";
import { LookHere } from "./LookHere.js";
import { conditionCard } from "../core/ConditionInfo.js";
import { keyHints } from "../ui/keyHints.js";
import { QUICK_CONDITIONS, featureTip, isGenericArt, isNpc, isVideoArt, readChecks, readFeatures, readInitiative, readRow, readStats, rosterTokens, viewedScene } from "./NpcRoster.js";
import { conditionLook } from "../ui/components/MasterCautionGrid.js";
import { CHECKS } from "../ui/components/HullReadout.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Token fields a move writes. An update touching only these needs no redraw. */
const MOVEMENT_KEYS = new Set(["_id", "x", "y", "elevation", "rotation", "sort", "_movementHistory", "_regions"]);

export const NPC_DECK_ID = `${MODULE_ID}-npc`;
/** How long a row flashes after taking damage. */
const HIT_MS = { hp: 900, structure: 1400 };

/**
 * The NPC Deck: a GM's board for every NPC in the fight.
 *
 * - An initiative strip across the top: everyone in the combat, players and NPCs, as
 *   portraits grouped into acting / still to act / done (LANCER's popcorn initiative).
 *   Hovering a portrait drops a big animated "look here" marker on that token; clicking
 *   selects the token as if clicked on the map; double-click looks at it; right-click starts
 *   its turn.
 * - One slim row per NPC, in turn order: health and heat bars, structure and stress pips when
 *   it has more than one, conditions, LANCER activations, and which players are targeting it.
 * - One row at a time opens up with the NPC's stats, quick HP / heat steppers, condition
 *   toggles, Activate / End turn, and its features as buttons that run LANCER's own flows,
 *   each with its full text on hover. The open row follows the turn, and follows the GM's
 *   selection: select an NPC on the map and its row opens (even one outside the combat).
 *
 * Movable and resizable like the Flight Deck (DeckFrame). GM only.
 */
export class NpcDeck extends HandlebarsApplicationMixin(ApplicationV2) {
  static #instance = null;

  static get instance() {
    return (this.#instance ??= new NpcDeck());
  }

  static DEFAULT_OPTIONS = {
    id: NPC_DECK_ID,
    tag: "aside",
    classes: ["lfd-npc-deck", "lfd-themed"],
    window: { frame: false, positioned: false },
    actions: {
      toggleRow: NpcDeck.#onToggleRow,
      select: NpcDeck.#onSelect,
      sheet: NpcDeck.#onSheet,
      adjust: NpcDeck.#onAdjust,
      feature: { handler: NpcDeck.#onFeature, buttons: [0, 2] },
      condition: NpcDeck.#onCondition,
      rollCheck: NpcDeck.#onRollCheck,
      batchAdjust: NpcDeck.#onBatchAdjust,
      batchCondition: NpcDeck.#onBatchCondition,
      batchRelease: NpcDeck.#onBatchRelease,
      activate: NpcDeck.#onActivate,
      endTurn: NpcDeck.#onEndTurn,
      recharge: NpcDeck.#onRecharge,
      collapse: NpcDeck.#onCollapse,
      initSelect: { handler: NpcDeck.#onInitSelect, buttons: [0, 2] },
      dock: NpcDeck.#onDock,
    },
  };

  static PARTS = { deck: { template: `${TEMPLATE_ROOT}/npc/deck.hbs` } };

  /* -------------------------------------------- */
  /*  Setup                                       */
  /* -------------------------------------------- */

  /** init hook: settings, the toolbar toggle and the keybinding. */
  static init() {
    const client = (key, data) => game.settings.register(MODULE_ID, key, { scope: "client", config: true, ...data });
    const hidden = (key, data) => game.settings.register(MODULE_ID, key, { scope: "client", config: false, ...data });
    const relayout = () => NpcDeck.instance.rendered && NpcDeck.instance.frame.apply();
    client(SETTINGS.NPC_DECK, {
      name: "LFD.Settings.NpcDeck.Name",
      hint: "LFD.Settings.NpcDeck.Hint",
      type: Boolean,
      default: true,
      onChange: value => {
        if (value) NpcDeck.instance.open();
        else NpcDeck.instance.close({ animate: false });
        ui.controls?.render?.(); // keep the toolbar toggle in step
      },
    });
    client(SETTINGS.NPC_DECK_SIDE, {
      name: "LFD.Settings.NpcDeckSide.Name",
      hint: "LFD.Settings.NpcDeckSide.Hint",
      type: String,
      choices: { right: "LFD.Settings.DockSide.Right", left: "LFD.Settings.DockSide.Left" },
      default: "right",
      onChange: relayout,
    });
    client(SETTINGS.NPC_DECK_SCALE, {
      name: "LFD.Settings.NpcDeckScale.Name",
      hint: "LFD.Settings.NpcDeckScale.Hint",
      type: Number,
      range: { min: SCALE_MIN, max: SCALE_MAX, step: 0.05 },
      default: 1,
      onChange: relayout,
    });
    hidden(SETTINGS.NPC_DECK_MODE, { type: String, default: "docked", onChange: relayout });
    hidden(SETTINGS.NPC_DECK_POSITION, { type: Object, default: { left: 120, top: 80 }, onChange: relayout });
    hidden(SETTINGS.NPC_DECK_COLLAPSED, {
      type: Boolean,
      default: false,
      onChange: () => NpcDeck.instance.rendered && NpcDeck.instance.render({ parts: ["deck"] }),
    });

    // A toggle in the token controls, so GMs find it without knowing the shortcut
    Hooks.on("getSceneControlButtons", controls => {
      const tokens = controls?.tokens;
      if (!tokens?.tools || !game.user?.isGM) return;
      tokens.tools["lfd-npc-deck"] = {
        name: "lfd-npc-deck",
        title: "LFD.Npc.ToolTitle",
        icon: "fa-solid fa-chess-board",
        order: Object.keys(tokens.tools).length,
        toggle: true,
        active: !!getSetting(SETTINGS.NPC_DECK),
        visible: true,
        onChange: (event, active) => {
          if (active !== !!getSetting(SETTINGS.NPC_DECK)) setSetting(SETTINGS.NPC_DECK, active);
        },
      };
    });
    game.keybindings.register(MODULE_ID, "npcDeck", {
      name: "LFD.Keybinding.NpcDeck.Name",
      hint: "LFD.Keybinding.NpcDeck.Hint",
      editable: [{ key: "KeyN", modifiers: ["Alt"] }],
      restricted: true,
      onDown: () => {
        if (!getSetting(SETTINGS.NPC_DECK)) setSetting(SETTINGS.NPC_DECK, true);
        else setSetting(SETTINGS.NPC_DECK_COLLAPSED, !getSetting(SETTINGS.NPC_DECK_COLLAPSED));
        return true;
      },
    });
  }

  /** ready hook: GMs get the deck. */
  static ready() {
    if (!game.user.isGM) {
      // Client settings show for everyone by default; players have no deck to configure
      for (const key of [SETTINGS.NPC_DECK, SETTINGS.NPC_DECK_SIDE, SETTINGS.NPC_DECK_SCALE]) {
        const setting = game.settings.settings.get(`${MODULE_ID}.${key}`);
        if (setting) setting.config = false;
      }
      return;
    }
    NpcDeck.instance.#watch();
    if (getSetting(SETTINGS.NPC_DECK)) NpcDeck.instance.open();
  }

  /** Placement: docked or floating, dragged and resized like the Flight Deck. */
  frame = new DeckFrame(this, {
    keys: { mode: SETTINGS.NPC_DECK_MODE, position: SETTINGS.NPC_DECK_POSITION, scale: SETTINGS.NPC_DECK_SCALE, side: SETTINGS.NPC_DECK_SIDE },
    dock: (element, side) => NpcDeck.#dockInto(element, side),
    handle: ".lfd-npc-head",
  });

  /** Token id of the open row. Follows the turn and the GM's selection; a click overrides both. */
  #expanded = null;
  #turnKey = null;
  /** A row to bring into view after the next render (a token was just selected on the map). */
  #reveal = null;
  /** Last HP / structure per token, to flash rows that take damage. */
  #last = new Map();
  /** Token id -> { cls, until } for rows flashing after a hit. */
  #hits = new Map();
  #queued = false;
  #hooked = false;
  /** Last pointer position over the deck, to keep "look here" on the right portrait across redraws. */
  #pointer = null;

  cards = new HoverCards({
    selector: "[data-feature]",
    html: el => {
      const actor = viewedScene()?.tokens.get(el.closest("[data-token]")?.dataset.token)?.actor;
      const item = actor?.items.get(el.dataset.feature);
      return item ? featureTip(item, actor) : null;
    },
    cssClass: () => `lfd-hud-tip lfd-themed ${this.#theme().cssClass}`,
    direction: () => {
      const { LEFT, RIGHT } = game.tooltip.constructor.TOOLTIP_DIRECTIONS;
      // Open away from the screen edge the deck sits on
      const box = this.element?.getBoundingClientRect();
      return box && box.left + box.width / 2 < window.innerWidth / 2 ? RIGHT : LEFT;
    },
  });

  #theme() {
    return resolveTheme(null, getSetting(SETTINGS.THEME));
  }

  async open() {
    if (!game.user.isGM) return;
    await this.render({ force: true });
  }

  /** Redraw soon, once, however many documents changed together. */
  queue() {
    if (this.#queued || !this.rendered) return;
    this.#queued = true;
    setTimeout(() => {
      this.#queued = false;
      if (this.rendered) this.render({ parts: ["deck"] });
    }, 50);
  }

  /** Everything that can change what the deck shows. */
  #watch() {
    if (this.#hooked) return;
    this.#hooked = true;
    const npcActor = doc => (isNpc(doc) ? doc : isNpc(doc?.parent) ? doc.parent : isNpc(doc?.actor) ? doc.actor : null);
    const ifNpc = doc => npcActor(doc) && this.queue();
    for (const hook of ["updateActor", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "createItem", "updateItem", "deleteItem"]) {
      Hooks.on(hook, ifNpc);
    }
    for (const hook of ["createToken", "deleteToken", "createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant", "targetToken"]) {
      Hooks.on(hook, () => this.queue());
    }
    // Reduce motion changed: the deck and its map marker follow at once
    Hooks.on("clientSettingChanged", key => {
      if (key !== `${MODULE_ID}.${SETTINGS.REDUCE_MOTION}`) return;
      this.element?.classList.toggle("lfd-reduce-motion", reduceMotion());
      LookHere.setStill(reduceMotion());
    });
    // A token that only moved (anyone's, every step in combat) changes nothing the deck shows
    Hooks.on("updateToken", (doc, changes) => {
      if (!Object.keys(changes ?? {}).every(key => MOVEMENT_KEYS.has(key))) this.queue();
    });
    // The GM selects an NPC on the map: its row opens and comes into view
    Hooks.on("controlToken", (token, controlled) => {
      if (controlled && isNpc(token?.actor)) {
        this.#expanded = token.id;
        this.#reveal = token.id;
      }
      this.queue();
    });
    Hooks.on("canvasReady", () => this.queue());
    Hooks.on("canvasTearDown", () => LookHere.hide());
    // The GM's own Cockpit theme also dresses the deck
    Hooks.on("clientSettingChanged", key => key === `${MODULE_ID}.${SETTINGS.THEME}` && this.queue());
    window.addEventListener("resize", foundry.utils.debounce(() => this.rendered && this.frame.apply(), 80));
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** @override */
  async _prepareContext() {
    const { tokens, combat } = rosterTokens();
    // Open whoever's turn it is when the turn moves
    const turnKey = combat ? `${combat.id}:${combat.round}:${combat.combatant?.id}` : null;
    if (turnKey !== this.#turnKey) {
      this.#turnKey = turnKey;
      const current = combat?.combatant;
      if (current?.token && isNpc(current.actor)) this.#expanded = current.token.id;
    }
    // A selected NPC that isn't in the fight still gets its row, at the top
    let outsider = null;
    if (this.#expanded && !tokens.some(t => t.id === this.#expanded)) {
      const doc = viewedScene()?.tokens.get(this.#expanded);
      if (doc && isNpc(doc.actor)) {
        outsider = doc;
        tokens.unshift(doc);
      } else this.#expanded = null;
    }

    const now = Date.now();
    const rows = tokens.map(token => {
      const row = readRow(token, { combat, expanded: this.#expanded });
      row.outside = token === outsider && !!combat;
      this.#noteDamage(token, now);
      const hit = this.#hits.get(token.id);
      row.hit = hit && hit.until > now ? hit.cls : null;
      if (row.expanded) {
        const actor = token.actor;
        row.stats = readStats(actor);
        row.checks = readChecks(actor);
        row.features = readFeatures(actor);
        row.anyUncharged = row.features.some(g => g.items.some(f => f.state === "uncharged"));
        row.quick = QUICK_CONDITIONS.map(id => {
          const cfg = CONFIG.statusEffects.find(s => s.id === id);
          if (!cfg) return null;
          const label = game.i18n.localize(cfg.name ?? id);
          const on = !!actor.statuses?.has(id);
          const hint = game.i18n.localize(on ? "LFD.Npc.CondRemove" : "LFD.Npc.CondApply");
          return { id, label, ...conditionLook(id, label), img: cfg.img, on, tip: conditionCard(id, { title: label, hint }) };
        }).filter(Boolean);
        // The open row's tiles light its quick conditions; its chips keep only the rest
        row.conditions = row.conditions.filter(c => !QUICK_CONDITIONS.includes(c.id));
        row.hasChips = row.conditions.length > 0 || row.burn > 0 || row.overshield > 0;
        row.inCombat = !!combat && !!row.combatantId;
      }
      return row;
    });
    // The fallen sink to the bottom; everyone else keeps turn order (an outsider stays on top)
    rows.sort((a, b) => Number(b.outside) - Number(a.outside) || Number(a.destroyed) - Number(b.destroyed));
    const counted = rows.filter(r => !r.outside);
    const initiative = readInitiative(combat);
    if (initiative && initiative.firstDone >= 0) initiative.entries[initiative.firstDone].divider = true;
    if (initiative) await this.#stillFrames(initiative.entries);
    // NPCs only; the initiative strip below counts every side
    const toAct = combat ? counted.filter(r => r.canAct).length : 0;
    return {
      batch: NpcDeck.#batchView(),
      tipClass: `lfd-hud-tip lfd-themed ${this.#theme().cssClass}`,
      footer: keyHints(game.i18n.localize("LFD.Npc.Footer")),
      collapsed: !!getSetting(SETTINGS.NPC_DECK_COLLAPSED),
      floating: this.frame.floating,
      rows,
      empty: !rows.length,
      initiative,
      header: {
        mode: combat ? "combat" : "scene",
        round: combat?.round ?? null,
        alive: counted.filter(r => !r.destroyed).length,
        total: counted.length,
        toAct: toAct ? game.i18n.format(toAct === 1 ? "LFD.Npc.ToActOne" : "LFD.Npc.ToAct", { n: toAct }) : null,
      },
    };
  }

  /**
   * Video token art can't sit in an <img>: swap in a still frame from it (made once per video,
   * like Foundry's own combat tracker does). If that fails, fall back to the actor's portrait.
   */
  async #stillFrames(entries) {
    await Promise.all(
      entries
        .filter(e => e.video)
        .map(async e => {
          const src = e.img;
          let still = NpcDeck.#thumbs.get(src);
          if (still === undefined) {
            try {
              still = await game.video.createThumbnail(src, { width: 96, height: 96 });
            } catch (err) {
              console.warn("Flight Deck | No still frame for", src, err);
              still = null;
            }
            NpcDeck.#thumbs.set(src, still);
          }
          const fallback = game.combat?.combatants.get(e.id)?.actor?.img;
          e.img = still ?? (fallback && !isVideoArt(fallback) ? fallback : "icons/svg/mystery-man.svg");
          e.generic = !still && isGenericArt(e.img);
          e.video = false;
        })
    );
  }

  /** Video src -> still-frame data URL (or null when it couldn't be made). */
  static #thumbs = new Map();

  /** Flash a row when its NPC loses HP (and harder when it loses structure). */
  #noteDamage(token, now) {
    const actor = token.actor;
    const hp = Number(actor.system?.hp?.value) || 0;
    const structure = Number(actor.system?.structure?.value) || 0;
    const prev = this.#last.get(token.id);
    if (prev) {
      if (structure < prev.structure) this.#hits.set(token.id, { cls: "is-structure-hit", until: now + HIT_MS.structure });
      else if (hp < prev.hp) this.#hits.set(token.id, { cls: "is-hit", until: now + HIT_MS.hp });
    }
    this.#last.set(token.id, { hp, structure });
  }

  /** @override Docked into Foundry's UI columns, or floating. */
  _insertElement(element) {
    const existing = document.getElementById(element.id);
    if (existing) existing.replaceWith(element);
    else this.frame.insert(element);
  }

  /** Docked: beside the Flight Deck if it shares the side, else at the top of the column. */
  static #dockInto(element, side) {
    const flightDeck = document.getElementById(MODULE_ID);
    if (side === "left") {
      const host = document.getElementById("ui-left");
      const after = flightDeck?.parentElement === host ? flightDeck : document.getElementById("ui-left-column-1");
      if (after?.parentElement === host) return after.after(element);
      if (host) return host.prepend(element);
    } else {
      const column = document.getElementById("ui-right-column-1");
      if (column) {
        if (flightDeck?.parentElement === column) return flightDeck.after(element);
        return column.prepend(element);
      }
    }
    document.body.append(element);
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;
    if (!el.dataset.wired) this.#wire();
    for (const cls of [...el.classList]) if (cls.startsWith("lfd-theme-")) el.classList.remove(cls);
    el.classList.add(this.#theme().cssClass);
    el.classList.toggle("is-collapsed", !!getSetting(SETTINGS.NPC_DECK_COLLAPSED));
    el.classList.toggle("lfd-reduce-motion", reduceMotion());
    this.frame.apply();
    this.cards.restore();
    this.#restoreLook();
    if (this.#reveal) {
      el.querySelector(`.lfd-npc-row[data-token="${this.#reveal}"]`)?.scrollIntoView({ block: "nearest" });
      this.#reveal = null;
    }
    // End damage flashes on time even if nothing else redraws the deck
    for (const [id, hit] of this.#hits) {
      const left = hit.until - Date.now();
      if (left <= 0) this.#hits.delete(id);
      else setTimeout(() => this.element?.querySelector(`[data-token="${id}"]`)?.classList.remove(hit.cls), left);
    }
  }

  /** @override */
  _onClose(options) {
    super._onClose(options);
    this.cards.detach();
    LookHere.hide();
  }

  /** Delegated listeners on the root (it survives part re-renders). */
  #wire() {
    const root = this.element;
    root.dataset.wired = "1";
    this.cards.attach(root);
    root.addEventListener(
      "pointerenter",
      event => {
        const el = event.target;
        // Initiative portrait: "look here" on the map
        if (el.matches?.(".lfd-init-portrait")) return this.#look(el);
        // NPC row: "look here" on its token, and light it like Foundry's own hover
        if (el.matches?.(".lfd-npc-row")) this.#look(el);
        if (el.matches?.("[data-token]")) this.#hoverToken(el.dataset.token, true, event);
      },
      true
    );
    root.addEventListener(
      "pointerleave",
      event => {
        const el = event.target;
        if (el.matches?.(".lfd-init-portrait")) return LookHere.hide();
        if (el.matches?.(".lfd-npc-row")) LookHere.hide();
        if (el.matches?.("[data-token]")) this.#hoverToken(el.dataset.token, false, event);
        if (el === root) {
          this.#pointer = null;
          LookHere.hide();
        }
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
    root.addEventListener("dblclick", event => {
      // Row name: open the sheet. Initiative portrait: look at the token.
      const name = event.target.closest("[data-action='select']");
      if (name) return NpcDeck.#tokenDoc(name)?.actor?.sheet?.render(true);
      const portrait = event.target.closest(".lfd-init-portrait");
      const token = portrait && canvas.tokens?.get(portrait.closest("[data-init-token]")?.dataset.initToken);
      if (token) canvas.animatePan({ x: token.center.x, y: token.center.y, duration: 300 });
    });
  }

  /** "Look here" on the token an initiative portrait or an NPC row stands for. */
  #look(el) {
    const id = el.matches(".lfd-init-portrait") ? el.closest("[data-init-token]")?.dataset.initToken : el.dataset.token;
    const token = id ? canvas.tokens?.get(id) : null;
    if (token && !LookHere.isOn(token)) LookHere.show(token);
  }

  /** After a redraw: keep the marker on the portrait or row still under the pointer, or take it down. */
  #restoreLook() {
    const hit = this.#pointer && document.elementFromPoint(this.#pointer.x, this.#pointer.y)?.closest?.(".lfd-init-portrait, .lfd-npc-row");
    if (hit && this.element?.contains(hit)) this.#look(hit);
    else LookHere.hide();
  }

  #hoverToken(tokenId, on, event) {
    const token = canvas.tokens?.get(tokenId);
    if (!token) return;
    try {
      if (on) token._onHoverIn(event, { hoverOutOthers: true });
      else token._onHoverOut(event);
    } catch {
      /* hover highlighting is a nicety */
    }
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  static #tokenDoc(target) {
    const id = target.closest("[data-token]")?.dataset.token;
    return id ? viewedScene()?.tokens.get(id) : null;
  }

  static #onToggleRow(event, target) {
    if (event.target.closest("button:not([data-action='toggleRow']), input, [data-action='select']")) return;
    const id = target.closest("[data-token]")?.dataset.token;
    this.#expanded = this.#expanded === id ? null : id;
    this.render({ parts: ["deck"] });
  }

  /** Select the token and look at it; Shift adds it to the selection. */
  static #onSelect(event, target) {
    const token = NpcDeck.#tokenDoc(target)?.object;
    if (!token) return;
    token.control({ releaseOthers: !event.shiftKey });
    if (!event.shiftKey) canvas.animatePan({ x: token.center.x, y: token.center.y, duration: 250 });
  }

  /**
   * Initiative portrait. Click: select the token, exactly as clicking it on the map would
   * (Shift adds to the selection). Right-click: start that combatant's turn.
   */
  static async #onInitSelect(event, target) {
    const unit = target.closest("[data-combatant]");
    const secondary = event.button === 2 || event.type === "contextmenu";
    if (secondary) {
      event.preventDefault();
      const combatant = game.combat?.combatants.get(unit?.dataset.combatant);
      if (!combatant) return;
      if (game.combat.combatant?.id === combatant.id) return;
      if ((combatant.activations?.value ?? 0) <= 0) {
        ui.notifications.info(game.i18n.format("LFD.Npc.Init.NoActivations", { name: combatant.name }));
        return;
      }
      return game.combat.activateCombatant?.(combatant.id);
    }
    const token = canvas.tokens?.get(unit?.dataset.initToken);
    if (!token) return;
    token.control({ releaseOthers: !event.shiftKey });
  }

  static #onSheet(event, target) {
    NpcDeck.#tokenDoc(target)?.actor?.sheet?.render(true);
  }

  static async #onAdjust(event, target) {
    const actor = NpcDeck.#tokenDoc(target)?.actor;
    if (actor) await NpcDeck.#adjust(actor, target.dataset.resource, Number(target.dataset.delta) || 0);
  }

  /**
   * HP or heat by a step. One NPC's steps run in order, so quick clicks each count (they read the value
   * the previous step wrote instead of the same stale one).
   */
  static #adjust(actor, key, delta) {
    const prev = NpcDeck.#steps.get(actor.uuid) ?? Promise.resolve();
    const step = prev.then(() => NpcDeck.#adjustNow(actor, key, delta));
    const tail = step.catch(err => console.error("Flight Deck |", err));
    NpcDeck.#steps.set(actor.uuid, tail);
    tail.then(() => NpcDeck.#steps.get(actor.uuid) === tail && NpcDeck.#steps.delete(actor.uuid));
    return step;
  }

  /** Actor uuid -> its last queued step. */
  static #steps = new Map();

  /** LANCER's own update hook starts Structure / Overheat when warranted. */
  static async #adjustNow(actor, key, delta) {
    const path = key === "heat" ? "system.heat.value" : "system.hp.value";
    const current = Number(foundry.utils.getProperty(actor, path)) || 0;
    const max = Number(foundry.utils.getProperty(actor, key === "heat" ? "system.heat.max" : "system.hp.max")) || 0;
    // HP may go below 0 (LANCER carries it into the next structure); heat can exceed the cap
    const next = key === "heat" ? Math.max(0, current + delta) : Math.min(max, current + delta);
    if (next === current) return;
    const s = actor.system ?? {};
    const prompts = key === "heat" ? next > max && Number(s.stress?.value) > 0 : next <= 0 && Number(s.structure?.value) > 0;
    if (!prompts) return actor.update({ [path]: next });
    // LANCER keeps one Structure (or Overheat) prompt open at a time and cancels the older one when
    // another opens, so steps that start one wait their turn: the next NPC's check opens after this one's.
    const run = () => NpcDeck.#settle(actor, () => actor.update({ [path]: next }));
    // Say why the row hasn't changed yet
    if (NpcDeck.#waiting++ > 0) {
      const kind = game.i18n.localize(key === "heat" ? "LFD.Npc.CheckOverheat" : "LFD.Npc.CheckStructure");
      ui.notifications.info(game.i18n.format("LFD.Npc.CheckQueued", { name: actor.token?.name ?? actor.name, kind }));
    }
    const turn = NpcDeck.#checks.then(run).finally(() => NpcDeck.#waiting--);
    NpcDeck.#checks = turn.catch(err => console.error("Flight Deck |", err));
    return turn;
  }

  /** Steps that start a Structure or Overheat check, one after another. */
  static #checks = Promise.resolve();
  static #waiting = 0;

  /**
   * Run an update; if it starts LANCER's Structure or Overheat check for this actor, wait until that's
   * rolled or cancelled. LANCER reports both (postFlow), but not a flow that throws partway. It starts the
   * check without awaiting it, so that error surfaces as an unhandled rejection: one from LANCER's own code
   * lets the queue go on, so a broken check never holds every later NPC edit until a reload. There's no
   * timeout: a GM may sit on a prompt, and the next check opening would cancel it.
   */
  static async #settle(actor, update) {
    const started = new Set();
    const finished = new Set();
    let done = null;
    const mine = flow => flow?.state?.actor?.uuid === actor.uuid;
    const hooks = [];
    for (const name of ["StructureFlow", "OverheatFlow"]) {
      hooks.push([`lancer.preFlow.${name}`, Hooks.on(`lancer.preFlow.${name}`, flow => mine(flow) && started.add(flow))]);
      hooks.push([`lancer.postFlow.${name}`, Hooks.on(`lancer.postFlow.${name}`, flow => {
        if (!mine(flow)) return;
        finished.add(flow);
        if ([...started].every(f => finished.has(f))) done?.();
      })]);
    }
    // Listening from before the update: a check can fail before the update call returns
    let failed = false;
    const onError = event => {
      if (!started.size || !/\/systems\/lancer\//.test(String(event.reason?.stack ?? ""))) return;
      console.warn(`Flight Deck | ${actor.name}: LANCER's check failed; the next one can go ahead`);
      failed = true;
      done?.();
    };
    window.addEventListener("unhandledrejection", onError);
    try {
      await update();
      // LANCER starts the check from its own updateActor hook, which has run by now
      if (!failed && [...started].some(f => !finished.has(f))) await new Promise(resolve => (done = resolve));
    } finally {
      window.removeEventListener("unhandledrejection", onError);
      for (const [name, id] of hooks) Hooks.off(name, id);
    }
  }

  /* -------------------------------------------- */
  /*  Batch: several NPC tokens selected on the map */
  /* -------------------------------------------- */

  /** The NPC tokens selected on the map, when there are two or more. */
  static #batchTokens() {
    const picked = (canvas?.tokens?.controlled ?? []).filter(t => isNpc(t.actor));
    return picked.length >= 2 ? picked : [];
  }

  static #batchView() {
    const picked = NpcDeck.#batchTokens();
    if (!picked.length) return null;
    const i18n = game.i18n;
    const n = picked.length;
    return {
      count: n,
      names: picked.map(t => t.name).join(", "),
      heat: picked.some(t => Number(t.actor.system?.heat?.max) > 0),
      quick: QUICK_CONDITIONS.map(id => {
        const cfg = CONFIG.statusEffects.find(s => s.id === id);
        if (!cfg) return null;
        const label = i18n.localize(cfg.name ?? id);
        const have = picked.filter(t => t.actor.statuses?.has(id)).length;
        const state = have === 0 ? "none" : have === n ? "all" : "some";
        const hint = i18n.format(state === "all" ? "LFD.Npc.Batch.Remove" : "LFD.Npc.Batch.Apply", { n, have });
        return { id, label, ...conditionLook(id, label), img: cfg.img, state, tip: conditionCard(id, { title: label, detail: `${have}/${n}`, hint }) };
      }).filter(Boolean),
    };
  }

  /** The selected NPCs' actors, each once (two tokens of one linked actor are one NPC). */
  static #batchActors() {
    return [...new Map(NpcDeck.#batchTokens().map(t => [t.actor.uuid, t.actor])).values()];
  }

  static async #onBatchAdjust(event, target) {
    const key = target.dataset.resource;
    const delta = Number(target.dataset.delta) || 0;
    // All at once: plain steps land now, steps that start a Structure / Overheat check queue in order
    await Promise.all(NpcDeck.#batchActors().map(actor => NpcDeck.#adjust(actor, key, delta)));
  }

  /** All of them have it: remove it from all. Otherwise: give it to the ones without it. */
  static async #onBatchCondition(event, target) {
    const id = target.dataset.cond;
    const actors = NpcDeck.#batchActors();
    if (!id || !actors.length) return;
    const all = actors.every(a => a.statuses?.has(id));
    await setStatus(all ? actors : actors.filter(a => !a.statuses?.has(id)), id, !all);
  }

  /** Deselect the NPCs the bar lists; anything else selected (a mech) stays selected. */
  static #onBatchRelease() {
    for (const t of NpcDeck.#batchTokens()) t.release();
  }

  /** Use a feature with LANCER's own flows. Right-click posts its text instead. */
  static async #onFeature(event, target) {
    const actor = NpcDeck.#tokenDoc(target)?.actor;
    const item = actor?.items.get(target.dataset.feature);
    if (!item) return;
    const secondary = event.button === 2 || event.type === "contextmenu";
    if (secondary) event.preventDefault();
    try {
      if (secondary) return await game.lancer.beginItemChatFlow(item, {});
      const s = item.system ?? {};
      if (s.type === "Weapon") return await item.beginWeaponAttackFlow();
      if (s.type === "Tech" && s.tech_attack) return await item.beginTechAttackFlow();
      return await item.beginSystemFlow();
    } catch (err) {
      console.error("Flight Deck |", err);
      ui.notifications.error(game.i18n.localize("LFD.Error.Action"));
    }
  }

  static async #onCondition(event, target) {
    const actor = NpcDeck.#tokenDoc(target)?.actor;
    const id = target.dataset.cond;
    if (!actor || !id) return;
    await setStatus([actor], id, !actor.statuses?.has(id));
  }

  /** HULL / AGI / SYS / ENG: LANCER's own check for this NPC, exactly as from its sheet. */
  static async #onRollCheck(event, target) {
    const actor = NpcDeck.#tokenDoc(target)?.actor;
    const id = target.dataset.check;
    if (!actor || !CHECKS.some(c => c.id === id)) return;
    try {
      await actor.beginStatFlow(`system.${id}`);
    } catch (err) {
      console.error("Flight Deck |", err);
      ui.notifications.error(game.i18n.localize("LFD.Error.Action"));
    }
  }

  /** LANCER's popcorn initiative: start this NPC's turn. */
  static async #onActivate(event, target) {
    const id = target.dataset.combatant;
    if (id) await game.combat?.activateCombatant?.(id);
  }

  static async #onEndTurn(event, target) {
    const id = target.dataset.combatant;
    if (id) await game.combat?.deactivateCombatant?.(id);
  }

  static async #onRecharge(event, target) {
    const actor = NpcDeck.#tokenDoc(target)?.actor;
    if (actor) await actor.beginRechargeFlow();
  }

  static #onCollapse() {
    setSetting(SETTINGS.NPC_DECK_COLLAPSED, !getSetting(SETTINGS.NPC_DECK_COLLAPSED));
  }

  /** Floating: the pin docks it again. */
  static #onDock() {
    this.frame.dock();
  }
}
