import { MODULE_ID, SCALE_MAX, SCALE_MIN, SETTINGS, STATUS, TEMPLATE_ROOT } from "../constants.js";
import { setStatus } from "../core/ConditionControl.js";
import { getSetting, reduceMotion, setSetting } from "../settings.js";
import { resolveTheme } from "../themes/registry.js";
import { DeckFrame } from "../ui/DeckFrame.js";
import { HoverCards } from "../ui/HoverCards.js";
import { LookHere } from "./LookHere.js";
import { conditionCard } from "../core/ConditionInfo.js";
import { untickMeltdown } from "../core/MeltdownClock.js";
import { keyHints } from "../ui/keyHints.js";
import { QUICK_CONDITIONS, deckCombat, duplicateNumbers, featureTip, npcDestroyed, outOfFight, reserveTokens, rosterSections, roundComplete, stillToAct, turnCommands, undoTarget, isGenericArt, isNpc, isVideoArt, readChecks, readFeatures, readInitiative, readRow, readStats, rosterTokens, viewedScene } from "./NpcRoster.js";
import { conditionLook } from "../ui/components/MasterCautionGrid.js";
import { CHECKS } from "../ui/components/HullReadout.js";

const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

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
/** Marks a canvas stage the deck already listens to for token clicks. */
const TOKEN_CLICKS = Symbol("lfd-npc-token-clicks");

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
      condition: { handler: NpcDeck.#onCondition, buttons: [0, 2] },
      rollCheck: NpcDeck.#onRollCheck,
      batchAdjust: NpcDeck.#onBatchAdjust,
      batchCondition: { handler: NpcDeck.#onBatchCondition, buttons: [0, 2] },
      batchRelease: NpcDeck.#onBatchRelease,
      activate: NpcDeck.#onActivate,
      endTurn: NpcDeck.#onEndTurn,
      addToCombat: NpcDeck.#onAddToCombat,
      batchAddToCombat: NpcDeck.#onBatchAddToCombat,
      nextRound: NpcDeck.#onNextRound,
      prevRound: NpcDeck.#onPrevRound,
      undoTurn: NpcDeck.#onUndoTurn,
      endEncounter: NpcDeck.#onEndEncounter,
      recharge: NpcDeck.#onRecharge,
      collapse: NpcDeck.#onCollapse,
      initSelect: { handler: NpcDeck.#onInitSelect, buttons: [0, 2] },
      dock: NpcDeck.#onDock,
      toggleSection: NpcDeck.#onToggleSection,
      deploy: NpcDeck.#onDeploy,
      reveal: NpcDeck.#onReveal,
      batchDeploy: NpcDeck.#onBatchDeploy,
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
    // A click on an NPC token that's already selected opens its row too
    Hooks.on("canvasReady", () => this.#watchTokenClicks());
    this.#watchTokenClicks();
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

  /**
   * Selecting an NPC opens its row (controlToken), but that hook only fires on a change: once the turn had
   * opened another row, a click on the NPC already selected did nothing. Foundry stops a token's click at
   * the token, so this listens on the way down (PIXI's capture phase), once per canvas stage.
   */
  #watchTokenClicks() {
    const stage = canvas?.stage;
    if (!stage || stage[TOKEN_CLICKS]) return;
    stage[TOKEN_CLICKS] = true;
    const Token = foundry.canvas.placeables.Token;
    stage.addEventListener("pointerdown", event => {
      if (event.button !== 0 || event.shiftKey || game.activeTool === "target" || !this.rendered) return;
      let obj = event.target;
      while (obj && !(obj instanceof Token)) obj = obj.parent;
      if (!obj?.controlled || !isNpc(obj.actor) || this.#expanded === obj.id) return;
      this.#expanded = obj.id;
      this.#reveal = obj.id;
      this.queue();
    }, { capture: true });
  }

  /** Foldable sections the GM has opened: Destroyed and Reserves fold into one line until opened. */
  #openSections = new Set();

  /** @override */
  async _prepareContext() {
    const { tokens, combat } = rosterTokens();
    const dups = duplicateNumbers(viewedScene()?.tokens.contents ?? []);
    // Open whoever's turn it is when the turn moves
    const turnKey = combat ? `${combat.id}:${combat.round}:${combat.combatant?.id}` : null;
    if (turnKey !== this.#turnKey) {
      this.#turnKey = turnKey;
      const current = combat?.combatant;
      if (current?.token && isNpc(current.actor)) this.#expanded = current.token.id;
    }
    // Reserves: hidden NPCs placed on the scene, not in the fight yet (they get their own section)
    const reserves = combat?.started ? reserveTokens(viewedScene()?.tokens.contents ?? [], combat) : [];
    const reserveIds = new Set(reserves.map(t => t.id));
    // A selected NPC that isn't in the fight still gets its row, at the top
    let outsider = null;
    if (this.#expanded && !tokens.some(t => t.id === this.#expanded) && !reserveIds.has(this.#expanded)) {
      const doc = viewedScene()?.tokens.get(this.#expanded);
      if (doc && isNpc(doc.actor)) {
        outsider = doc;
        tokens.unshift(doc);
      } else this.#expanded = null;
    }

    const now = Date.now();
    const rows = [...tokens, ...reserves].map(token => {
      const row = readRow(token, { combat, expanded: this.#expanded, dups });
      row.outside = token === outsider && !!combat;
      row.reserve = reserveIds.has(token.id);
      // In the fight but unseen by players: one click shows its token and its place in the tracker
      row.revealable = row.inCombat && (row.hidden || row.trackerHidden);
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
          if (id === STATUS.HIDDEN) return NpcDeck.#hiddenTile([actor]);
          const cfg = CONFIG.statusEffects.find(s => s.id === id);
          if (!cfg) return null;
          const label = game.i18n.localize(cfg.name ?? id);
          const on = !!actor.statuses?.has(id);
          const hint = game.i18n.localize(on ? "LFD.Npc.CondRemove" : "LFD.Npc.CondApply");
          return { id, label, ...conditionLook(id, label), img: cfg.img, on, tip: conditionCard(id, { title: label, hint }) };
        }).filter(Boolean);
        // The chips name what's on; the icon tiles below toggle it
        row.turn = NpcDeck.#turnView(row, combat);
      }
      return row;
    });
    // In turn order for choosing who goes next: acting, to act, done, then the destroyed (folded)
    const entries = rosterSections(rows, { combat: !!combat?.started, showFallen: this.#openSections.has("fallen"), showReserves: this.#openSections.has("reserves") });
    for (const e of entries) {
      if (e.section) e.section.label = game.i18n.format(`LFD.Npc.Section.${e.section.id}`, { n: e.section.count });
    }
    const counted = rows.filter(r => !r.outside && !r.reserve);
    const initiative = readInitiative(combat, { dups });
    if (initiative && initiative.firstDone >= 0) initiative.entries[initiative.firstDone].divider = true;
    if (initiative) await this.#stillFrames(initiative.entries);
    // The header counts NPCs; the initiative strip below counts every side, and says so
    const i18n = game.i18n;
    const alive = counted.filter(r => !r.destroyed).length;
    const toAct = combat ? counted.filter(r => r.canAct || r.isTurn).length : 0;
    const hints = keyHints(i18n.localize("LFD.Npc.Footer"));
    return {
      batch: NpcDeck.#batchView(),
      // Everyone has acted: the deck offers LANCER's next round
      roundEnd: roundComplete(combat)
        ? { done: i18n.format("LFD.Npc.RoundEnd.Done", { n: combat.round }), tip: i18n.format("LFD.Npc.RoundEnd.Tip", { n: combat.round + 1 }) }
        : null,
      // The round's controls along the bottom, while a combat runs
      controls: combat?.started ? NpcDeck.#controlsView(combat) : null,
      tipClass: `lfd-hud-tip lfd-themed ${this.#theme().cssClass}`,
      help: `<div class="lfd-tip"><header><strong>${foundry.utils.escapeHTML(i18n.localize("LFD.Npc.HelpTitle"))}</strong></header>${hints
        .map(h => `<p>${h.key ? `<b>${foundry.utils.escapeHTML(h.key)}:</b> ` : ""}${foundry.utils.escapeHTML(h.action)}</p>`)
        .join("")}</div>`,
      collapsed: !!getSetting(SETTINGS.NPC_DECK_COLLAPSED),
      floating: this.frame.floating,
      rows: entries,
      empty: !rows.length,
      initiative,
      header: combat
        ? { round: combat.round, big: toAct, of: alive, caption: i18n.localize("LFD.Npc.CountToAct"), aria: i18n.format("LFD.Npc.CountToActLabel", { n: toAct, alive }) }
        : { round: null, big: alive, of: counted.length, caption: i18n.localize("LFD.Npc.CountStanding"), aria: i18n.format("LFD.Npc.CountLabel", { alive, total: counted.length }) },
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
          const fallback = deckCombat()?.combatants.get(e.id)?.actor?.img;
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
    NpcDeck.#stripEdges(el.querySelector(".lfd-init-strip"));
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
    // The initiative strip is one row: the wheel scrolls it sideways, and its edge fades while there's more
    root.addEventListener(
      "wheel",
      event => {
        const strip = event.target.closest?.(".lfd-init-strip");
        if (!strip || strip.scrollWidth <= strip.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        event.preventDefault();
        strip.scrollLeft += event.deltaY;
      },
      { passive: false }
    );
    root.addEventListener("scroll", event => event.target.matches?.(".lfd-init-strip") && NpcDeck.#stripEdges(event.target), { capture: true, passive: true });
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
      const combat = deckCombat();
      const combatant = combat?.combatants.get(unit?.dataset.combatant);
      if (!combatant) return;
      if (combat.combatant?.id === combatant.id) return;
      if (outOfFight(combatant)) {
        ui.notifications.info(game.i18n.format("LFD.Npc.Init.OutOfFight", { name: combatant.name }));
        return;
      }
      if ((combatant.activations?.value ?? 0) <= 0) {
        ui.notifications.info(game.i18n.format("LFD.Npc.Init.NoActivations", { name: combatant.name }));
        return;
      }
      return combat.activateCombatant?.(combatant.id);
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
    // Twins by their numbers, as on their rows ("Test Hostile 1, Test Hostile 2")
    const dups = duplicateNumbers(viewedScene()?.tokens.contents ?? []);
    const names = list => list.map(t => (dups.has(t.id) ? `${t.name} ${dups.get(t.id)}` : t.name)).join(", ");
    // In a started combat: the selected NPCs that aren't in it yet, to add in one go
    const combat = deckCombat();
    // ...standing ones: a destroyed NPC isn't offered back into the fight. Any unseen by players (a hidden token,
    // or a hidden place in the tracker) makes it Deploy, which reveals them as they come in
    const unseen = t => t.document.hidden || combat?.getCombatantsByToken(t.document).some(c => c.hidden);
    const outside = combat ? picked.filter(t => !npcDestroyed(t.actor) && (!combat.getCombatantsByToken(t.document).length || unseen(t))) : [];
    const deploying = outside.some(unseen);
    return {
      count: n,
      names: names(picked),
      add: outside.length
        ? deploying
          ? { action: "batchDeploy", label: i18n.format("LFD.Npc.Batch.Deploy", { n: outside.length }), tip: i18n.format("LFD.Npc.Batch.DeployTip", { names: names(outside) }) }
          : { action: "batchAddToCombat", label: i18n.format("LFD.Npc.Batch.Add", { n: outside.length }), tip: i18n.format("LFD.Npc.Batch.AddTip", { names: names(outside) }) }
        : null,
      heat: picked.some(t => Number(t.actor.system?.heat?.max) > 0),
      quick: QUICK_CONDITIONS.map(id => {
        if (id === STATUS.HIDDEN) return NpcDeck.#hiddenTile(picked.map(t => t.actor), { batch: true });
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

  /**
   * The Hidden tile, as on the panel's annunciator: it stands for Hidden, Invisible or both. Click toggles
   * Hidden, right-click Invisible. Lit (or, for several NPCs, all / some) when either is on; its legend,
   * icon and card say which.
   * @param {Actor[]} actors      the open row's NPC, or every selected one
   * @param {{batch?: boolean}} [options]
   */
  static #hiddenTile(actors, { batch = false } = {}) {
    const i18n = game.i18n;
    const cfgOf = id => CONFIG.statusEffects.find(s => s.id === id);
    const hiddenCfg = cfgOf(STATUS.HIDDEN);
    if (!hiddenCfg) return null;
    const invisibleCfg = cfgOf(STATUS.INVISIBLE);
    const nameOf = (cfg, id) => i18n.localize(cfg?.name ?? id);
    const n = actors.length;
    const count = id => actors.filter(a => a.statuses?.has(id)).length;
    const hidden = count(STATUS.HIDDEN);
    const invisible = invisibleCfg ? count(STATUS.INVISIBLE) : 0;
    const either = actors.filter(a => a.statuses?.has(STATUS.HIDDEN) || a.statuses?.has(STATUS.INVISIBLE)).length;
    const onlyInvisible = !hidden && invisible > 0;
    const label = [hidden && nameOf(hiddenCfg, STATUS.HIDDEN), invisible && nameOf(invisibleCfg, STATUS.INVISIBLE)].filter(Boolean).join(" + ") || nameOf(hiddenCfg, STATUS.HIDDEN);
    const legend = hidden && invisible ? "LFD.Tile.HiddenInvisible" : onlyInvisible ? "LFD.Tile.Invisible" : "LFD.Tile.Hidden";
    const tile = {
      id: STATUS.HIDDEN,
      label,
      kind: conditionLook(STATUS.HIDDEN, label).kind,
      short: i18n.localize(legend),
      img: (onlyInvisible && invisibleCfg?.img) || hiddenCfg.img,
      tip: conditionCard(onlyInvisible ? STATUS.INVISIBLE : STATUS.HIDDEN, {
        title: label,
        detail: batch ? i18n.format("LFD.Npc.Batch.HiddenDetail", { n, hidden, invisible }) : null,
        hint: i18n.format(batch ? "LFD.Npc.Batch.HiddenHint" : "LFD.Npc.CondHiddenHint", { n }),
        also: hidden && invisible ? [STATUS.INVISIBLE] : [],
      }),
    };
    if (batch) tile.state = either === 0 ? "none" : either === n ? "all" : "some";
    else tile.on = either > 0;
    return tile;
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
    const id = NpcDeck.#conditionFor(event, target);
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
    const id = NpcDeck.#conditionFor(event, target);
    if (!actor || !id) return;
    await setStatus([actor], id, !actor.statuses?.has(id));
  }

  /**
   * The condition a tile click is for: the tile's own, or on a right-click on the Hidden tile, Invisible
   * (as on the panel). A right-click anywhere else does nothing, without the browser's menu.
   */
  static #conditionFor(event, target) {
    const id = target.dataset.cond;
    if (!(event.button === 2 || event.type === "contextmenu")) return id;
    event.preventDefault();
    return id === STATUS.HIDDEN ? STATUS.INVISIBLE : null;
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

  /** The strip fades at the right while more of it is out of sight. */
  static #stripEdges(strip) {
    if (!strip) return;
    const overflowing = strip.scrollWidth > strip.clientWidth + 1;
    strip.classList.toggle("is-overflowing", overflowing);
    strip.classList.toggle("is-at-end", overflowing && strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2);
  }

  /** Show or fold a foldable section (Destroyed, Reserves). */
  static #onToggleSection(event, target) {
    const id = target.dataset.section;
    if (!id) return;
    if (this.#openSections.has(id)) this.#openSections.delete(id);
    else this.#openSections.add(id);
    this.render({ parts: ["deck"] });
  }

  /** LANCER's popcorn initiative: start this NPC's turn. */
  /**
   * The open row's Activate / End activation pair: labels, hover text, and why one is off. The buttons
   * stay on screen when off (aria-disabled, so their hover text still explains) and clicks on them do nothing.
   */
  static #turnView(row, combat) {
    const acting = combat?.started && combat.combatant ? { id: combat.combatant.id, name: NpcDeck.#unitName(combat.combatant) } : null;
    const cmds = turnCommands(row, { started: !!combat?.started, acting });
    if (!cmds) return null;
    const i18n = game.i18n;
    if (cmds.deploy) return { deploy: { tip: i18n.localize("LFD.Npc.Turn.deploy") } };
    if (cmds.add) return { add: { tip: i18n.localize("LFD.Npc.Turn.add") } };
    const tip = (why, data) => i18n.format(`LFD.Npc.Turn.${why}`, data ?? {});
    return {
      combatantId: row.combatantId,
      activate: { on: cmds.activate.on, tip: tip(cmds.activate.why, { name: cmds.activate.name }) },
      end: { on: cmds.end.on, tip: tip(cmds.end.why, { n: cmds.end.more }) },
    };
  }

  /** Add NPC tokens to the deck's combat (those not in it yet). In a started combat LANCER gives them this round's activations. */
  static async #addToCombat(docs) {
    const combat = deckCombat();
    if (!combat) return;
    const data = docs
      .filter(d => d && !combat.getCombatantsByToken(d).length && !npcDestroyed(d.actor))
      .map(d => ({ tokenId: d.id, sceneId: d.parent.id, actorId: d.actorId, hidden: d.hidden }));
    if (data.length) await combat.createEmbeddedDocuments("Combatant", data);
  }

  /**
   * Into the fight and into view: unhide the tokens, add the ones not in the combat yet (with this round's
   * activations), and show their place in the tracker. Foundry keeps a token's and a combatant's visibility
   * apart; Deploy and Reveal set both, so players see the NPC on the map and in the tracker at once.
   * Destroyed NPCs stay out.
   */
  static async #bringIn(docs) {
    const combat = deckCombat();
    if (!combat) return;
    const list = docs.filter(d => d && isNpc(d.actor) && !npcDestroyed(d.actor));
    const byScene = new Map();
    for (const d of list.filter(d => d.hidden)) {
      if (!byScene.has(d.parent)) byScene.set(d.parent, []);
      byScene.get(d.parent).push({ _id: d.id, hidden: false });
    }
    for (const [scene, updates] of byScene) await scene.updateEmbeddedDocuments("Token", updates);
    const add = list.filter(d => !combat.getCombatantsByToken(d).length).map(d => ({ tokenId: d.id, sceneId: d.parent.id, actorId: d.actorId, hidden: false }));
    if (add.length) await combat.createEmbeddedDocuments("Combatant", add);
    const show = list.flatMap(d => combat.getCombatantsByToken(d)).filter(c => c.hidden).map(c => ({ _id: c.id, hidden: false }));
    if (show.length) await combat.updateEmbeddedDocuments("Combatant", show);
  }

  static async #onDeploy(event, target) {
    await NpcDeck.#bringIn([NpcDeck.#tokenDoc(target)]);
  }

  static async #onReveal(event, target) {
    await NpcDeck.#bringIn([NpcDeck.#tokenDoc(target)]);
  }

  static async #onBatchDeploy() {
    await NpcDeck.#bringIn(NpcDeck.#batchTokens().map(t => t.document));
  }

  static async #onAddToCombat(event, target) {
    await NpcDeck.#addToCombat([NpcDeck.#tokenDoc(target)]);
  }

  static async #onBatchAddToCombat() {
    await NpcDeck.#addToCombat(NpcDeck.#batchTokens().map(t => t.document));
  }

  /** Everyone has acted: LANCER's next round (it gives every combatant their activations back). */
  /** The bottom strip: Previous round, Undo, Next round, End, each with its hover (and why when off). */
  static #controlsView(combat) {
    const i18n = game.i18n;
    const undo = undoTarget(combat, { undone: NpcDeck.#undone });
    const left = stillToAct(combat);
    const next = combat.round + 1;
    return {
      prev: combat.round > 1
        ? { on: true, tip: i18n.format("LFD.Npc.Ctrl.PrevTip", { n: combat.round - 1 }) }
        : { on: false, tip: i18n.localize("LFD.Npc.Ctrl.PrevFirst") },
      undo: undo
        ? { on: true, tip: i18n.format(undo.kind === "acting" ? "LFD.Npc.Ctrl.UndoActing" : "LFD.Npc.Ctrl.UndoEnded", { name: NpcDeck.#unitName(combat.combatants.get(undo.id)) ?? undo.name }) }
        : { on: false, tip: i18n.localize("LFD.Npc.Ctrl.UndoNone") },
      next: {
        on: true,
        tip: left.length ? i18n.format("LFD.Npc.Ctrl.NextEarly", { n: next, count: left.length }) : i18n.format("LFD.Npc.RoundEnd.Tip", { n: next }),
      },
      end: { on: true, tip: i18n.localize("LFD.Npc.Ctrl.EndTip") },
    };
  }

  /** A short roll call for a confirmation: "Kitbash, Virtue, Squad 3 and 2 more". */
  /**
   * A combatant's name as the deck shows it: twins by their numbers ("Conscript 1"), the same as on their rows
   * and portraits, so a hover or a question never leaves the GM guessing which one.
   */
  static #unitName(combatant) {
    if (!combatant) return null;
    const n = combatant.tokenId ? duplicateNumbers(viewedScene()?.tokens.contents ?? []).get(combatant.tokenId) : null;
    return n ? `${combatant.name} ${n}` : combatant.name;
  }

  static #names(list) {
    const shown = list.slice(0, 3).map(c => NpcDeck.#unitName(c));
    const rest = list.length - shown.length;
    const names = shown.join(", ");
    return rest > 0 ? game.i18n.format("LFD.Npc.Ctrl.NamesMore", { names, n: rest }) : names;
  }

  static async #confirm(title, text) {
    return DialogV2.confirm({
      window: { title },
      content: `<p>${foundry.utils.escapeHTML(text)}</p>`,
      modal: true,
      rejectClose: false,
    });
  }

  /**
   * LANCER's next round. At the round's end straight away; with anyone still to act, after asking (and
   * naming them), as the tracker would let the GM skip ahead.
   */
  static async #onNextRound() {
    const combat = deckCombat();
    if (!combat?.started) return;
    const i18n = game.i18n;
    const left = stillToAct(combat);
    if (left.length && !roundComplete(combat)) {
      const ok = await NpcDeck.#confirm(
        i18n.localize("LFD.Npc.Ctrl.NextTitle"),
        i18n.format("LFD.Npc.Ctrl.NextConfirm", { names: NpcDeck.#names(left), n: combat.round + 1 }),
      );
      if (!ok) return;
    }
    await combat.nextRound();
  }

  /** LANCER's previous round, after asking: everyone's activations come back and that round starts over. */
  static async #onPrevRound(event, target) {
    if (target.getAttribute("aria-disabled") === "true") return;
    const combat = deckCombat();
    if (!combat?.started || combat.round <= 1) return;
    const i18n = game.i18n;
    const ok = await NpcDeck.#confirm(i18n.localize("LFD.Npc.Ctrl.PrevTitle"), i18n.format("LFD.Npc.Ctrl.PrevConfirm", { n: combat.round - 1 }));
    if (ok) await combat.previousRound();
  }

  /** Take back the turn in progress (LANCER's previous turn), or give back the activation that just ended. */
  /** The last Undo made here: once per turn (see undoTarget). */
  static #undone = null;

  static async #onUndoTurn(event, target) {
    if (target.getAttribute("aria-disabled") === "true") return;
    const combat = deckCombat();
    const undo = undoTarget(combat, { undone: NpcDeck.#undone });
    if (!undo) return;
    const combatant = combat.combatants.get(undo.id);
    if (undo.kind === "acting") await combat.previousTurn(); // a backward step: the meltdown countdown doesn't tick
    else {
      await combatant?.modifyCurrentActivations(1);
      // That turn's end ticked a meltdown countdown: it comes back, or the turn taken again would tick it twice
      await untickMeltdown(combat, undo.id);
    }
    NpcDeck.#undone = { combat: combat.id, round: combat.round, combatantId: undo.id, value: Number(combatant?.activations?.value) || 0 };
  }

  /** Foundry's own end of the encounter: it asks first. */
  static async #onEndEncounter() {
    await deckCombat()?.endCombat();
  }

  static async #onActivate(event, target) {
    if (target.getAttribute("aria-disabled") === "true") return;
    const id = target.dataset.combatant;
    if (id) await deckCombat()?.activateCombatant?.(id);
  }

  static async #onEndTurn(event, target) {
    if (target.getAttribute("aria-disabled") === "true") return;
    const id = target.dataset.combatant;
    if (id) await deckCombat()?.deactivateCombatant?.(id);
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
