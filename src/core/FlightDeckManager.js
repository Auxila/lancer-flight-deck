import { ALERT_MS, MODULE_ID, SCALE_MAX, SCALE_MIN, SETTINGS, STATUS } from "../constants.js";
import { getSetting, registerSettings, setSetting } from "../settings.js";
import { resolveTheme } from "../themes/registry.js";
import { FlightDeckPanel, PART_IDS } from "../ui/FlightDeckPanel.js";
import { inActiveCombat, recordReaction, runEntry, trackerChange } from "../actions/runner.js";
import { mountedWeapons } from "../actions/catalog.js";
import { HudMenu } from "../ui/HudMenu.js";
import { buildActions } from "../ui/components/ActionBus.js";
import { systemsSummary } from "../ui/components/SystemsBay.js";
import { buildHeat } from "../ui/components/HeatReactorGauge.js";
import { CHECKS, buildHull } from "../ui/components/HullReadout.js";
import { buildIntegrity } from "../ui/components/IntegrityMatrix.js";
import { buildCaution, litTiles } from "../ui/components/MasterCautionGrid.js";
import { applyTile, targetsFor, tileActiveOn } from "./ConditionControl.js";
import { SynthesizerEngine } from "./SynthesizerEngine.js";
import { TelemetryAdapter } from "./TelemetryAdapter.js";

const OFFER_ID = "lancer-flight-deck-offer";

/**
 * Orchestrates the panel's lifecycle: which mech it shows, when it re-renders, and how
 * telemetry changes turn into cockpit events (audio cues, alarms, the boot sequence).
 */
export class FlightDeckManager {
  static #instance;

  static get instance() {
    return (this.#instance ??= new FlightDeckManager());
  }

  /** @type {FlightDeckPanel|null} */
  panel = null;
  /** @type {SynthesizerEngine} */
  synth = new SynthesizerEngine();
  /** The HUD menus beside the panel (actions, weapons, systems). */
  hud = new HudMenu(this);
  /** @type {TelemetryAdapter|null} */
  adapter = null;
  /** @type {Actor|null} */
  actor = null;
  /** Latest telemetry snapshot, or null in standby. */
  telemetry = null;
  theme = resolveTheme(null);

  /**
   * Newly lit tiles that are still flashing: id -> time lit. They fade on their own after ALERT_MS.
   */
  #pending = { caution: new Map(), warning: new Map() };
  #alertTimer = null;
  #lit = new Map();
  #partKeys = {};
  #booted = new Set();
  #queuedSignals = [];
  #flush = foundry.utils.debounce(() => this.#processSignals(), 40);
  /** @type {ResizeObserver|null} */
  #layoutObserver = null;
  #onLayoutChange = foundry.utils.debounce(() => {
    if (this.floating) this.applyAppearance();
    this.panel?.fitHeight();
  }, 60);
  /** Optimistic resource values while quick-adjust clicks are being coalesced. */
  #pendingResource = {};
  #flushResource = foundry.utils.debounce(() => this.#commitResources(), 220);
  /** Parts whose re-render waits until the user stops editing a field in them. */
  #deferredParts = new Set();

  /** Refit the panel when the window, hotbar or players list changes size. */
  #watchLayout() {
    window.removeEventListener("resize", this.#onLayoutChange);
    window.addEventListener("resize", this.#onLayoutChange);
    this.#layoutObserver?.disconnect();
    this.#layoutObserver = new ResizeObserver(this.#onLayoutChange);
    for (const id of FlightDeckPanel.OBSTACLES) {
      const el = document.getElementById(id);
      if (el) this.#layoutObserver.observe(el);
    }
  }

  /* -------------------------------------------- */
  /*  Lifecycle                                   */
  /* -------------------------------------------- */

  /** Called during the init hook. */
  init() {
    registerSettings(this);
    game.keybindings.register(MODULE_ID, "toggle", {
      name: "LFD.Keybinding.Toggle.Name",
      hint: "LFD.Keybinding.Toggle.Hint",
      editable: [{ key: "KeyC", modifiers: ["Alt"] }],
      onDown: () => {
        this.toggle();
        return true;
      },
      precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
    });
    // A toggle in the token controls: the one-click way back after hiding the panel
    Hooks.on("getSceneControlButtons", controls => {
      const tokens = controls?.tokens;
      if (!tokens?.tools) return;
      tokens.tools["lfd-flight-deck"] = {
        name: "lfd-flight-deck",
        title: "LFD.ToolTitle",
        icon: "fa-solid fa-gauge-high",
        order: Object.keys(tokens.tools).length,
        toggle: true,
        active: this.enabled,
        visible: true,
        onChange: (_event, active) => {
          if (active !== this.enabled) setSetting(SETTINGS.ENABLED, active);
        },
      };
    });
    // One unbound shortcut per HUD menu; players pick their own keys in Configure Controls
    for (const menu of ["invade", "move", "quick", "full", "reaction", "core", "systems"]) {
      game.keybindings.register(MODULE_ID, `menu-${menu}`, {
        name: `LFD.Keybinding.Menu.${menu}`,
        hint: "LFD.Keybinding.Menu.Hint",
        editable: [],
        onDown: () => {
          if (!this.panel || this.collapsed) return false;
          this.toggleMenu(menu);
          return true;
        },
        precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
      });
    }
  }

  /** Called during the ready hook. */
  async ready() {
    this.synth.setEnabled(getSetting(SETTINGS.AUDIO));
    this.synth.setVolume(getSetting(SETTINGS.VOLUME));
    this.adapter = new TelemetryAdapter(signal => this.#signal(signal));
    this.adapter.attach();
    if (this.enabled) await this.open();
    else this.#maybeOffer();
  }

  get enabled() {
    return !!getSetting(SETTINGS.ENABLED);
  }

  get collapsed() {
    return !!getSetting(SETTINGS.COLLAPSED);
  }

  get dockSide() {
    return getSetting(SETTINGS.DOCK_SIDE) === "right" ? "right" : "left";
  }

  /** True when the panel floats freely instead of docking into Foundry's UI columns. */
  get floating() {
    return getSetting(SETTINGS.MODE) === "floating";
  }

  get scale() {
    const s = Number(getSetting(SETTINGS.SCALE));
    return Number.isFinite(s) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, s)) : 1;
  }

  async setEnabled(enabled) {
    // Turned on some other way (Alt+C, settings, toolbar): the first-login offer has nothing left to ask
    if (enabled) foundry.applications.instances.get(OFFER_ID)?.close();
    if (enabled) await this.open();
    else await this.close();
    ui.controls?.render?.(); // keep the toolbar toggle in step
  }

  /** The header's hide button: off until the toolbar toggle or Alt+C brings it back. */
  async hide() {
    await setSetting(SETTINGS.ENABLED, false);
    ui.notifications.info(game.i18n.localize("LFD.Header.Hidden"));
  }

  /**
   * Roll a HASE check (Hull, Agility, Systems, Engineering) through LANCER's own stat flow,
   * exactly as the mech sheet does: accuracy/difficulty prompt, roll, chat card.
   * @param {string} id  "hull" | "agi" | "sys" | "eng"
   */
  async rollCheck(id) {
    if (!CHECKS.some(c => c.id === id)) return;
    const actor = this.ownedActor();
    if (!actor) return;
    this.synth.play("hud");
    try {
      await actor.beginStatFlow(`system.${id}`);
    } catch (err) {
      console.error("Flight Deck |", err);
      ui.notifications.error(game.i18n.localize("LFD.Error.Action"));
    }
  }

  async open() {
    this.panel ??= new FlightDeckPanel(this);
    this.#resolve();
    await this.panel.render({ force: true });
    this.#rememberPartKeys(this.buildContext());
    this.#watchLayout();
    this.#maybeBoot("open");
  }

  async close() {
    this.#layoutObserver?.disconnect();
    window.removeEventListener("resize", this.#onLayoutChange);
    this.synth.stopAll();
    const panel = this.panel;
    this.panel = null;
    this.hud.close();
    this.syncTokenActionHud();
    await panel?.close({ animate: false });
  }

  /**
   * Token Action HUD's bar sits behind the docked panel and shows through it. While the panel is open
   * on a mech, a class on <body> hides the bar; collapsing, hiding or closing the panel (or standby,
   * where TAH may be driving an NPC) brings it back. Nothing of Token Action HUD's is changed.
   */
  syncTokenActionHud() {
    const hide =
      !!this.panel?.element &&
      !this.collapsed &&
      !!this.telemetry &&
      !!getSetting(SETTINGS.HIDE_TAH) &&
      !!game.modules.get("token-action-hud-core")?.active;
    document.body.classList.toggle("lfd-hide-tah", hide);
  }

  /** Alt+C: turn the panel on if it is off, otherwise collapse/expand it. */
  async toggle() {
    if (!this.enabled) return setSetting(SETTINGS.ENABLED, true);
    return this.toggleCollapsed();
  }

  async toggleCollapsed() {
    // The setting's onChange re-applies appearance and refits
    await setSetting(SETTINGS.COLLAPSED, !this.collapsed);
  }

  async toggleMute() {
    await setSetting(SETTINGS.AUDIO, !getSetting(SETTINGS.AUDIO));
  }

  setAudioEnabled(enabled) {
    this.synth.setEnabled(enabled);
    this.refresh({ parts: ["header"] });
  }

  /** Re-read the mech and theme without firing events (e.g. after a theme setting change). */
  async relink() {
    if (!this.panel) return;
    this.#resolve();
    await this.refresh({ force: true });
  }

  redock() {
    if (!this.floating && this.panel?.element) FlightDeckPanel.dock(this.panel.element, this.dockSide);
    this.applyAppearance();
    this.panel?.fitHeight();
  }

  /** Re-place the panel after a docked/floating mode change. */
  applyLayout() {
    const el = this.panel?.element;
    if (!el) return;
    if (this.floating) FlightDeckPanel.float(el);
    else FlightDeckPanel.dock(el, this.dockSide);
    this.applyAppearance();
    this.panel.fitHeight();
    this.refresh(); // the header's dock button depends on the mode
  }

  /** Dock to a side (from the dock button or a drag dropped on a screen edge). */
  async dock(side = this.dockSide) {
    if (side !== this.dockSide) await setSetting(SETTINGS.DOCK_SIDE, side);
    if (this.floating) await setSetting(SETTINGS.MODE, "docked");
    else this.applyLayout();
  }

  /** Float at a viewport position (top-left corner, in screen pixels). */
  async float(position) {
    await setSetting(SETTINGS.POSITION, this.#clampPosition(position));
    if (!this.floating) await setSetting(SETTINGS.MODE, "floating");
    else this.applyAppearance();
  }

  /** Keep at least a grabbable strip of the panel on screen. */
  #clampPosition({ left, top }) {
    const maxLeft = Math.max(0, window.innerWidth - 80);
    const maxTop = Math.max(0, window.innerHeight - 48);
    return {
      left: Math.round(Math.min(maxLeft, Math.max(0, Number(left) || 0))),
      top: Math.round(Math.min(maxTop, Math.max(0, Number(top) || 0))),
    };
  }

  /** Foundry's UI scale; docked panels inherit it from their column, floating ones apply it. */
  get uiScale() {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale"));
    return Number.isFinite(v) && v > 0 ? v : 1;
  }

  /** Live size preview while dragging the resize grip (persisted on release). */
  previewScale(scale) {
    const el = this.panel?.element;
    if (!el) return 1;
    const s = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
    const zoom = this.floating ? s * this.uiScale : s;
    el.style.zoom = String(zoom);
    if (this.floating) this.#placeFloating(el, zoom); // keep the top-left corner anchored
    this.hud.position();
    return s;
  }

  /**
   * Position a floating panel at its saved screen position. CSS zoom also scales `left` and
   * `top`, so they are divided by the zoom to land on the intended screen pixels.
   */
  #placeFloating(el, zoom) {
    const { left, top } = this.#clampPosition(getSetting(SETTINGS.POSITION) ?? {});
    FlightDeckPanel.setScreenPosition(el, left, top, zoom);
  }

  async setScale(scale) {
    const s = Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale)) * 20) / 20;
    await setSetting(SETTINGS.SCALE, s);
    this.panel?.fitHeight();
  }

  /* -------------------------------------------- */
  /*  Editing                                     */
  /* -------------------------------------------- */

  /** Editable resources. HP may go negative: the system carries overflow into the next structure. */
  static RESOURCES = {
    hp: { path: "system.hp.value", min: t => -t.hp.max, max: t => t.hp.max, read: t => t.hp.value },
    heat: { path: "system.heat.value", min: () => 0, max: () => 999, read: t => t.heat.value },
  };

  /** Quick-adjust buttons: coalesce rapid clicks into one update, showing the value immediately. */
  adjustResource(key, delta) {
    const spec = FlightDeckManager.RESOURCES[key];
    const actor = this.ownedActor();
    if (!spec || !actor || !this.telemetry) return;
    const base = this.#pendingResource[key] ?? spec.read(this.telemetry);
    this.#setPending(key, base + delta);
  }

  /**
   * Typed entry: "7" sets 7, "+3" / "-4" adjust, "=-2" sets an absolute negative.
   * @returns {boolean} false if the text was not understood
   */
  setResource(key, raw) {
    const spec = FlightDeckManager.RESOURCES[key];
    const actor = this.ownedActor();
    if (!spec || !actor || !this.telemetry) return false;
    const text = String(raw ?? "").replace(/\s+/g, "").replace("−", "-");
    const m = text.match(/^(=)?([+-])?(\d+)$/);
    if (!m) return false;
    const n = Number(m[3]);
    const current = this.#pendingResource[key] ?? spec.read(this.telemetry);
    let value = n;
    if (m[1]) value = m[2] === "-" ? -n : n;
    else if (m[2] === "+") value = current + n;
    else if (m[2] === "-") value = current - n;
    this.#setPending(key, value);
    return true;
  }

  #setPending(key, value) {
    const spec = FlightDeckManager.RESOURCES[key];
    const t = this.telemetry;
    const clamped = Math.round(Math.min(spec.max(t), Math.max(spec.min(t), value)));
    this.#pendingResource[key] = clamped;
    this.panel?.showPendingValue(key, clamped);
    this.#flushResource();
  }

  async #commitResources() {
    const actor = this.actor;
    const pending = this.#pendingResource;
    this.#pendingResource = {};
    if (!actor?.isOwner || !this.telemetry) return;
    const update = {};
    for (const [key, value] of Object.entries(pending)) {
      const spec = FlightDeckManager.RESOURCES[key];
      if (spec && value !== spec.read(this.telemetry)) update[spec.path] = value;
    }
    // The system's own update hook starts the Structure / Overheat flows when warranted
    if (!foundry.utils.isEmpty(update)) {
      const t = this.telemetry;
      const structureCheck = "system.hp.value" in update && update["system.hp.value"] <= 0 && t.structure.value > 0;
      const stressCheck = "system.heat.value" in update && update["system.heat.value"] > t.heat.max && t.stress.value > 0;
      await actor.update(update);
      if (structureCheck || stressCheck) this.#explainCheckRouting(actor, structureCheck ? "Structure" : "Overheat");
    } else this.refresh({ parts: ["hull", "heat"] });
  }

  /**
   * LANCER sends the Structure / Overheat prompt to the mech's owning player when one is
   * online, and to GMs only otherwise. Say where it went, so a GM isn't left waiting for a
   * prompt that appeared on someone else's screen.
   */
  #explainCheckRouting(actor, kind) {
    const automation = game.settings.get(game.system.id, "automationOptions");
    if (automation && automation.structure === false) {
      ui.notifications.info(game.i18n.format("LFD.Check.AutomationOff", { kind }));
      return;
    }
    if (!game.user.isGM) return;
    const owners = game.users.players.filter(u => u.active && actor.testUserPermission(u, "OWNER"));
    if (owners.length) {
      ui.notifications.info(
        game.i18n.format("LFD.Check.SentToPlayer", { kind, players: owners.map(u => u.name).join(", "), name: actor.name })
      );
    }
  }

  /** Re-render parts that were held back while a field in them had focus. */
  flushDeferred() {
    if (!this.#deferredParts.size || !this.panel) return;
    const parts = [...this.#deferredParts];
    this.#deferredParts.clear();
    this.panel.render({ parts });
  }

  /* -------------------------------------------- */
  /*  HUD menus                                   */
  /* -------------------------------------------- */

  /** An action bus light: open (or close) its menu. */
  async toggleMenu(menu) {
    if (!this.actor) return;
    await this.hud.toggle(menu);
  }

  async toggleSystems() {
    await this.toggleMenu("systems");
  }

  /** Is this mech fighting in a combat that has started? */
  inCombat(actor = this.actor) {
    return inActiveCombat(actor);
  }

  /**
   * Run a HUD entry, then spend its action slot when it went through.
   * @param {object} entry   From the HUD's entries map
   * @param {object} ctx     The HUD's context (actor, token, targets)
   * @param {string|null} spend  Slot to spend (the HUD decides, e.g. a Barrage's second shot is free)
   * @returns {Promise<boolean>}
   */
  async useEntry(entry, ctx, spend) {
    const actor = this.ownedActor();
    if (!actor) return false;
    let ok = false;
    try {
      ok = await runEntry(entry, { ...ctx, actor });
    } catch (err) {
      console.error("Flight Deck |", err);
      ui.notifications.error(game.i18n.localize("LFD.Error.Action"));
      return false;
    }
    if (ok && spend) await this.#spend(actor, spend);
    if (ok && entry.spend === "reaction") await recordReaction(actor, entry.reactionKey ?? entry.key);
    return ok;
  }

  /** Spend a slot after an action, if the world wants menus to track the action economy. */
  async #spend(actor, kind) {
    const mode = game.settings.get(MODULE_ID, SETTINGS.SPEND_ACTIONS);
    if (mode === "never" || (mode === "combat" && !this.inCombat(actor))) return;
    const next = trackerChange(actor.system?.action_tracker ?? {}, kind, true, Number(actor.system?.speed) || 0);
    if (next) await actor.update({ "system.action_tracker": next });
  }

  /**
   * Right-click on a light: mark that slot spent, or available again when it's empty.
   * A quick action spends one of two; when both are gone, it refreshes both.
   */
  async toggleSlot(id) {
    const actor = this.ownedActor();
    const t = this.telemetry;
    if (!actor || !t) return;
    const a = t.actions;
    const has = { quick: a.full || a.quick, full: a.full, reaction: a.reaction, protocol: a.protocol, move: a.move > 0 }[id];
    if (has === undefined) return;
    const kind = id === "quick" && !has ? "full" : id; // refreshing quick brings back both halves
    const next = trackerChange(actor.system?.action_tracker ?? {}, kind, has, a.speed);
    if (next) await actor.update({ "system.action_tracker": next });
  }

  /** A click on an annunciator tile: apply its condition (Lock On: to targets; else: selection). */
  async clickTile(tileId, input) {
    await applyTile(tileId, input, this.actor);
  }

  /** Who tile clicks currently apply to. */
  #tileTargets() {
    return { conditions: targetsFor("conditions", this.actor), lockOn: targetsFor("lockon", this.actor) };
  }

  /** Retire alerts older than ALERT_MS, then wait for the next one to come due. */
  #scheduleAlertExpiry() {
    clearTimeout(this.#alertTimer);
    const now = Date.now();
    let expired = false;
    let next = Infinity;
    for (const map of [this.#pending.caution, this.#pending.warning]) {
      for (const [id, at] of map) {
        if (now - at >= ALERT_MS) {
          map.delete(id);
          expired = true;
        } else next = Math.min(next, at + ALERT_MS);
      }
    }
    if (expired) this.refresh({ parts: ["header", "caution"] });
    if (next < Infinity) this.#alertTimer = setTimeout(() => this.#scheduleAlertExpiry(), next - now + 30);
  }

  /** The tracked actor, only if this user may drive it. */
  ownedActor() {
    const actor = this.actor;
    if (!actor?.isOwner) {
      ui.notifications.warn(game.i18n.localize("LFD.Error.NotOwner"));
      return null;
    }
    return actor;
  }

  /* -------------------------------------------- */
  /*  Refresh pipeline                            */
  /* -------------------------------------------- */

  #signal(signal) {
    this.#queuedSignals.push(signal);
    this.#flush();
  }

  async #processSignals() {
    const signals = this.#queuedSignals.splice(0);
    if (!this.panel) return;
    const { switched, events } = this.#resolve();
    // Render first, so effects land on the fresh part elements rather than replaced ones
    await this.refresh({ force: switched });
    this.#fire(events);
    if (switched) this.#maybeBoot("link");
    for (const signal of signals) {
      if (signal.reason === "combatStart" && this.#inCombat(signal.combat)) this.#maybeBoot("combat");
    }
  }

  /**
   * Re-resolve the mech and read fresh telemetry.
   * @returns {{switched: boolean, events: string[]}}  events only for changes on the same mech
   */
  #resolve() {
    const actor = TelemetryAdapter.resolveActor();
    const switched = (actor?.uuid ?? null) !== (this.actor?.uuid ?? null);
    if (switched) {
      this.actor = actor;
      this.adapter?.track(actor);
      this.#pending.caution.clear();
      this.#pending.warning.clear();
      this.telemetry = null;
    }
    const prev = this.telemetry;
    const next = actor ? TelemetryAdapter.read(actor) : null;
    this.theme = resolveTheme(next?.manufacturer, getSetting(SETTINGS.THEME));

    // Annunciator: newly lit tiles flash; a fresh baseline never does.
    const lit = litTiles(next);
    if (prev && !switched) {
      for (const [id, kind] of lit) {
        if (this.#lit.has(id) || kind === "advisory") continue;
        this.#pending[kind === "warning" ? "warning" : "caution"].set(id, Date.now());
        this.#scheduleAlertExpiry();
      }
    }
    for (const id of [...this.#pending.caution.keys(), ...this.#pending.warning.keys()]) {
      if (!lit.has(id)) {
        this.#pending.caution.delete(id);
        this.#pending.warning.delete(id);
      }
    }
    this.#lit = lit;
    this.telemetry = next;
    const { conditions, lockOn } = this.#tileTargets();
    this.adapter?.watch([...conditions.actors, ...lockOn.actors]);
    return { switched, events: switched ? [] : TelemetryAdapter.diff(prev, next) };
  }

  /**
   * Re-render what changed. Resolves once the render is done.
   * @param {{force?: boolean, parts?: string[]}} [options]
   */
  async refresh({ force = false, parts } = {}) {
    if (!this.panel) return;
    const context = this.buildContext();
    if (force) {
      this.#rememberPartKeys(context);
      await this.panel.render({ force: !this.panel.rendered });
      this.hud.queueRender();
      return;
    }
    const changed = new Set(parts ?? []);
    for (const id of PART_IDS) {
      const key = this.#partKey(context, id);
      if (this.#partKeys[id] !== key) changed.add(id);
      this.#partKeys[id] = key;
    }
    // Never yank a field out from under someone typing in it
    const active = document.activeElement;
    if (active?.matches?.("input[data-resource]") && this.panel.element?.contains(active)) {
      const part = active.closest("[data-application-part]")?.dataset.applicationPart;
      if (part && changed.delete(part)) this.#deferredParts.add(part);
    }
    if (changed.size) await this.panel.render({ parts: [...changed] });
    else this.applyAppearance();
    this.hud.queueRender();
  }

  #rememberPartKeys(context) {
    for (const id of PART_IDS) this.#partKeys[id] = this.#partKey(context, id);
  }

  /** What a part renders from: its own data, plus the shared bits (hover cards open away from the dock). */
  #partKey(context, id) {
    return JSON.stringify(context[id] ?? null) + context.standby + context.themeId + context.tipDirection;
  }

  /** The full render context, shared by every template part. */
  buildContext() {
    const t = this.telemetry;
    const theme = this.theme;
    const base = {
      themeId: theme.id,
      // Hover cards (condition tiles) wear the cockpit theme and open away from the docked edge
      tipClass: `lfd-hud-tip lfd-themed ${theme.cssClass}`,
      tipDirection: this.floating ? null : this.dockSide === "right" ? "LEFT" : "RIGHT",
      standby: !t,
      header: {
        badge: theme.badge,
        muted: !getSetting(SETTINGS.AUDIO),
        collapsed: this.collapsed,
        floating: this.floating,
      },
    };
    if (!t) return base;

    const caution = buildCaution(t, this.#pending, this.#tileTargets(), tileActiveOn);
    const editable = !!this.actor?.isOwner;
    const combat = game.combat;
    const activeActor = combat?.started ? combat.combatant?.actor : null;
    Object.assign(base.header, {
      mechName: t.name,
      frameName: t.frame?.name ?? game.i18n.localize("LFD.Header.NoFrame"),
      callsign: t.callsign ?? t.pilotName ?? game.i18n.localize("LFD.Header.NoPilot"),
      jammed: !!t.flags[STATUS.JAMMED],
      alertWarning: caution.alertWarning,
      alertCaution: caution.alertCaution,
      warningDelay: caution.warningDelay,
      cautionDelay: caution.cautionDelay,
      activation: !!activeActor && activeActor.uuid === t.uuid,
      mini: {
        heat: t.heat.max > 0 ? `${t.heat.value}/${t.heat.max}` : `${t.heat.value}`,
        structure: `${t.structure.value}/${t.structure.max}`,
        danger: t.heat.inDanger,
      },
    });
    return {
      ...base,
      hull: buildHull(t, { editable }),
      heat: buildHeat(t, { editable }),
      integrity: buildIntegrity(t),
      caution,
      actions: buildActions(t, { systems: systemsSummary(this.actor), open: this.hud.menu, owner: editable }),
    };
  }

  /** Root classes and CSS variables that don't need a re-render. */
  applyAppearance() {
    const el = this.panel?.element;
    if (!el) return;
    const t = this.telemetry;
    for (const cls of [...el.classList]) if (cls.startsWith("lfd-theme-")) el.classList.remove(cls);
    el.classList.add(this.theme.cssClass);
    const motion = getSetting(SETTINGS.REDUCE_MOTION);
    const reduce = motion === "on" || (motion === "auto" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    el.classList.toggle("lfd-reduce-motion", !!reduce);
    el.classList.toggle("is-collapsed", this.collapsed);
    el.classList.toggle("is-standby", !t);
    el.classList.toggle("is-shutdown", !!t?.flags[STATUS.SHUT_DOWN]);
    el.classList.toggle("is-destroyed", !!t?.destroyed);
    el.classList.toggle("is-danger", !!t?.heat.inDanger);
    const floating = this.floating;
    el.classList.toggle("lfd-floating", floating);
    el.classList.toggle("lfd-docked", !floating);
    el.classList.toggle("lfd-dock-left", !floating && this.dockSide === "left");
    el.classList.toggle("lfd-dock-right", !floating && this.dockSide === "right");
    const zoom = floating ? this.scale * this.uiScale : this.scale;
    el.style.zoom = String(zoom);
    if (floating) this.#placeFloating(el, zoom);
    else el.style.left = el.style.top = "";
    this.panel.damage.update(t, { reduceMotion: !!reduce });
    el.style.setProperty("--lfd-opacity", String(getSetting(SETTINGS.OPACITY)));
    el.setAttribute("aria-label", game.i18n.localize("LFD.Title"));
    this.syncTokenActionHud();
    if (this.hud.isOpen) {
      if (this.collapsed || !t) this.hud.close();
      else {
        this.hud.sync();
        this.hud.position();
      }
    }
  }

  /* -------------------------------------------- */
  /*  Cockpit events                              */
  /* -------------------------------------------- */

  #fire(events) {
    if (!events.length) return;
    const has = e => events.includes(e);
    const audio = this.theme.audio;
    const panel = this.panel;

    if (has("meltdown") || has("meltdownZero")) this.synth.play("klaxon", { freqs: audio.klaxon });
    if (has("meltdownZero")) panel?.flashBanner(game.i18n.localize("LFD.Banner.ReactorCritical"), "lost", 2600);
    else if (has("lockOn") || has("exposed") || has("warning")) this.synth.play("chime", { freqs: audio.chime });

    if (has("dangerEnter")) {
      this.synth.play("spool", { hum: getSetting(SETTINGS.DANGER_HUM) });
      panel?.pulse(".lfd-heat", "is-spooling", 2000);
    }
    if (has("structureHit")) {
      this.synth.play("thud");
      this.synth.play("crack");
      panel?.pulse('[data-track="structure"]', "is-hit", 900);
      panel?.pulse(null, "is-shaken", 500);
    }
    if (has("stressHit")) {
      this.synth.play("geiger");
      // Steam through the cracks
      if (this.telemetry && this.telemetry.structure.value < this.telemetry.structure.max) this.synth.play("hiss");
      panel?.pulse('[data-track="stress"]', "is-hit", 2500);
    }
    if (has("overcharge")) panel?.pulse(".lfd-oc", "is-hit", 900);
    if (has("coreSpent")) {
      this.synth.play("core");
      panel?.flashBanner(game.i18n.localize("LFD.Banner.CoreOnline"), "core");
    }
    if (has("shutdown")) this.synth.stopAll();
    if (has("bootUp")) this.#maybeBoot("bootUp");
    if (has("destroyed")) panel?.flashBanner(game.i18n.localize("LFD.Banner.SignalLost"), "lost", 2600);
  }

  /** The panel was expanded from its collapsed tab: boot it. */
  expanded() {
    this.#maybeBoot("expand");
  }

  /**
   * Cold boot: every time the panel opens or expands, at combat start, and after a Shut Down ends.
   * Selecting another mech boots it once a session, so clicking between tokens doesn't replay it.
   */
  #maybeBoot(reason) {
    const t = this.telemetry;
    if (!t || !this.panel?.rendered || this.collapsed || !getSetting(SETTINGS.BOOT)) return;
    if (reason === "link" && this.#booted.has(t.uuid)) return;
    this.#booted.add(t.uuid);
    // A timer, not requestAnimationFrame: rAF stalls while the window is hidden or resizing
    setTimeout(() => {
      const reduce = !!this.panel?.element?.classList.contains("lfd-reduce-motion");
      this.panel?.playBoot(this.#bootData(t), { reduce });
      this.synth.play("boot", { freqs: this.theme.audio.boot, reduce });
    }, 0);
  }

  /** What the boot stream reads out: this mech's frame, loadout, tracks and pilot. */
  #bootData(t) {
    const actor = this.actor;
    return {
      mech: actor?.name ?? "",
      frame: t.frame?.name ?? "",
      manufacturer: this.theme.badge ?? t.manufacturer ?? "",
      pilot: t.callsign ?? t.pilotName ?? "",
      weapons: mountedWeapons(actor).map(w => ({ mount: w.mount ?? "", name: w.weapon.name })),
      systems: (actor?.items ?? []).filter(i => i.type === "mech_system").map(i => i.name),
      tracks: {
        hp: [t.hp.value, t.hp.max],
        heat: [t.heat.value, t.heat.max],
        structure: [t.structure.value, t.structure.max],
        stress: [t.stress.value, t.stress.max],
      },
      stats: { evasion: t.stats.evasion, edef: t.stats.edef, sensors: t.stats.sensors, speed: t.stats.speed },
      danger: !!t.heat.inDanger,
      flavour: this.theme.bootLines(t).slice(0, 2),
    };
  }

  #inCombat(combat) {
    const uuid = this.telemetry?.uuid;
    return !!uuid && !!combat?.combatants?.some(c => c.actor?.uuid === uuid);
  }

  /** One-time, per-player offer to turn the panel on. Players opt in; nobody is forced. */
  async #maybeOffer() {
    if (game.user.isGM || getSetting(SETTINGS.PROMPTED) || !game.settings.get(MODULE_ID, SETTINGS.OFFER)) return;
    if (!TelemetryAdapter.resolveActor()) return;
    await setSetting(SETTINGS.PROMPTED, true);
    const accept = await foundry.applications.api.DialogV2.confirm({
      id: OFFER_ID,
      window: { title: "LFD.Offer.Title", icon: "fa-solid fa-gauge-high" },
      content: `<p>${game.i18n.localize("LFD.Offer.Body")}</p>`,
      yes: { label: "LFD.Offer.Yes" },
      no: { label: "LFD.Offer.No" },
      rejectClose: false,
    });
    if (accept) await setSetting(SETTINGS.ENABLED, true);
  }
}
