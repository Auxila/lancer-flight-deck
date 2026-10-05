import { MODULE_ID, SCALE_MAX, SCALE_MIN, SETTINGS } from "./constants.js";
import { TokenEffects } from "./fx/TokenEffects.js";
import { themeChoices } from "./themes/registry.js";

/**
 * Register module settings. Everything a player tunes is client-scoped, so one
 * player's choices never change anyone else's screen.
 * @param {import("./core/FlightDeckManager.js").FlightDeckManager} manager
 */
export function registerSettings(manager) {
  const client = (key, data) => game.settings.register(MODULE_ID, key, { scope: "client", ...data });

  client(SETTINGS.ENABLED, {
    name: "LFD.Settings.Enabled.Name",
    hint: "LFD.Settings.Enabled.Hint",
    config: true,
    type: Boolean,
    default: false,
    onChange: value => manager.setEnabled(value),
  });

  client(SETTINGS.DOCK_SIDE, {
    name: "LFD.Settings.DockSide.Name",
    hint: "LFD.Settings.DockSide.Hint",
    config: true,
    type: String,
    choices: { left: "LFD.Settings.DockSide.Left", right: "LFD.Settings.DockSide.Right" },
    default: "left",
    onChange: () => manager.redock(),
  });

  client(SETTINGS.THEME, {
    name: "LFD.Settings.Theme.Name",
    hint: "LFD.Settings.Theme.Hint",
    config: true,
    type: String,
    choices: themeChoices(),
    default: "auto",
    onChange: () => manager.relink(),
  });

  client(SETTINGS.SCALE, {
    name: "LFD.Settings.Scale.Name",
    hint: "LFD.Settings.Scale.Hint",
    config: true,
    type: Number,
    range: { min: SCALE_MIN, max: SCALE_MAX, step: 0.05 },
    default: 1,
    onChange: () => manager.applyAppearance(),
  });

  client(SETTINGS.OPACITY, {
    name: "LFD.Settings.Opacity.Name",
    hint: "LFD.Settings.Opacity.Hint",
    config: true,
    type: Number,
    range: { min: 0.4, max: 1, step: 0.05 },
    default: 0.92,
    onChange: () => manager.applyAppearance(),
  });

  client(SETTINGS.REDUCE_MOTION, {
    name: "LFD.Settings.ReduceMotion.Name",
    hint: "LFD.Settings.ReduceMotion.Hint",
    config: true,
    type: String,
    choices: {
      auto: "LFD.Settings.ReduceMotion.Auto",
      on: "LFD.Settings.ReduceMotion.On",
      off: "LFD.Settings.ReduceMotion.Off",
    },
    default: "auto",
    onChange: () => manager.applyAppearance(),
  });

  client(SETTINGS.BOOT, {
    name: "LFD.Settings.Boot.Name",
    hint: "LFD.Settings.Boot.Hint",
    config: true,
    type: Boolean,
    default: true,
  });

  client(SETTINGS.AUDIO, {
    name: "LFD.Settings.Audio.Name",
    hint: "LFD.Settings.Audio.Hint",
    config: true,
    type: Boolean,
    default: true,
    onChange: value => manager.setAudioEnabled(value),
  });

  client(SETTINGS.VOLUME, {
    name: "LFD.Settings.Volume.Name",
    hint: "LFD.Settings.Volume.Hint",
    config: true,
    type: Number,
    range: { min: 0, max: 1, step: 0.05 },
    default: 0.6,
    onChange: value => manager.synth.setVolume(value),
  });

  client(SETTINGS.DANGER_HUM, {
    name: "LFD.Settings.DangerHum.Name",
    hint: "LFD.Settings.DangerHum.Hint",
    config: true,
    type: Boolean,
    default: true,
  });

  client(SETTINGS.TOKEN_FX, {
    name: "LFD.Settings.TokenFx.Name",
    hint: "LFD.Settings.TokenFx.Hint",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => TokenEffects.instance.refreshAll(),
  });

  client(SETTINGS.TOKEN_FX_OPACITY, {
    name: "LFD.Settings.TokenFxOpacity.Name",
    hint: "LFD.Settings.TokenFxOpacity.Hint",
    config: true,
    type: Number,
    range: { min: 0.3, max: 1, step: 0.05 },
    default: 0.9,
    onChange: () => TokenEffects.instance.refreshAll(),
  });

  // Hidden client state
  client(SETTINGS.COLLAPSED, {
    config: false,
    type: Boolean,
    default: false,
    onChange: collapsed => {
      // Collapsing mid-boot ends the boot; expanding plays it
      if (collapsed) manager.panel?.endBoot({ immediate: true });
      manager.applyAppearance();
      manager.panel?.fitHeight();
      if (!collapsed) manager.expanded();
    },
  });
  client(SETTINGS.PROMPTED, { config: false, type: Boolean, default: false });
  // "docked" or "floating"; floating keeps its viewport position
  client(SETTINGS.MODE, { config: false, type: String, default: "docked", onChange: () => manager.applyLayout() });
  client(SETTINGS.POSITION, { config: false, type: Object, default: { left: 120, top: 80 } });

  game.settings.register(MODULE_ID, SETTINGS.ART_FX_WORLD, {
    name: "LFD.Settings.ArtFx.Name",
    hint: "LFD.Settings.ArtFx.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => TokenEffects.instance.refreshAll(),
  });

  game.settings.register(MODULE_ID, SETTINGS.JAMMED_SOURCE, {
    name: "LFD.Settings.JammedSource.Name",
    hint: "LFD.Settings.JammedSource.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: { flightdeck: "LFD.Settings.JammedSource.FlightDeck", qol: "LFD.Settings.JammedSource.Qol" },
    default: "flightdeck",
    onChange: () => TokenEffects.instance.refreshAll(),
  });

  client(SETTINGS.AUTO_DAMAGE, {
    name: "LFD.Settings.AutoDamage.Name",
    hint: "LFD.Settings.AutoDamage.Hint",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTINGS.SPEND_ACTIONS, {
    name: "LFD.Settings.SpendActions.Name",
    hint: "LFD.Settings.SpendActions.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      combat: "LFD.Settings.SpendActions.Combat",
      always: "LFD.Settings.SpendActions.Always",
      never: "LFD.Settings.SpendActions.Never",
    },
    default: "combat",
  });

  game.settings.register(MODULE_ID, SETTINGS.PLAYER_LOCK_ON, {
    name: "LFD.Settings.PlayerLockOn.Name",
    hint: "LFD.Settings.PlayerLockOn.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTINGS.OFFER, {
    name: "LFD.Settings.Offer.Name",
    hint: "LFD.Settings.Offer.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
  });
}

export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

export function setSetting(key, value) {
  return game.settings.set(MODULE_ID, key, value);
}
