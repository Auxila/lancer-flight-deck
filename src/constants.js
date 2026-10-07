export const MODULE_ID = "lancer-flight-deck";
export const PANEL_ID = "lancer-flight-deck";
export const TEMPLATE_ROOT = `modules/${MODULE_ID}/templates`;

/** Client and world setting keys. */
export const SETTINGS = Object.freeze({
  ENABLED: "enabled",
  COLLAPSED: "collapsed",
  DOCK_SIDE: "dockSide",
  OPACITY: "opacity",
  THEME: "theme",
  MECH_THEMES: "mechThemes",
  AUDIO: "audioEnabled",
  VOLUME: "volume",
  DANGER_HUM: "dangerHum",
  BOOT: "bootSequence",
  REDUCE_MOTION: "reduceMotion",
  BATTLE_DAMAGE: "battleDamage",
  PROMPTED: "prompted",
  OFFER: "offerToPlayers",
  SCALE: "scale",
  MODE: "mode",
  POSITION: "position",
  PLAYER_LOCK_ON: "playerLockOn",
  TOKEN_FX: "tokenEffects",
  TOKEN_FX_OPACITY: "tokenEffectsOpacity",
  ART_FX_WORLD: "artEffects",
  JAMMED_SOURCE: "jammedEffectSource",
  SPEND_ACTIONS: "spendActions",
  AUTO_DAMAGE: "autoDamage",
  HIDE_TAH: "hideTokenActionHud",
  MELTDOWN_TICK: "meltdownTick",
  NPC_DECK: "npcDeck",
  NPC_DECK_SIDE: "npcDeckSide",
  NPC_DECK_COLLAPSED: "npcDeckCollapsed",
  NPC_DECK_SCALE: "npcDeckScale",
  NPC_DECK_MODE: "npcDeckMode",
  NPC_DECK_POSITION: "npcDeckPosition",
});

/** Actor flag: the turn's movement allowance after a Boost ({key, value}: key = the combat round it belongs to). */
export const MOVE_FLAG = "moveAllowance";

/** Actor flag: the mech's own cockpit theme ("auto" or a theme id), picked by its owner, seen by everyone. */
export const THEME_FLAG = "theme";

/** v13 user query the GM answers when a player applies a condition to a token they don't own. */
export const QUERY_APPLY = `${MODULE_ID}.applyCondition`;

/** How long a new caution/warning blinks before it fades to steady (ms). Mirrors the CSS. */
export const ALERT_MS = 10000;

/** Panel size limits (uniform scale). */
export const SCALE_MIN = 0.7;
export const SCALE_MAX = 1.6;

/**
 * Status effect ids as registered by the LANCER system (src/module/status-icons.ts).
 * Note that Slowed is "slow", not "slowed".
 */
export const STATUS = Object.freeze({
  EXPOSED: "exposed",
  SHREDDED: "shredded",
  STUNNED: "stunned",
  LOCK_ON: "lockon",
  JAMMED: "jammed",
  IMPAIRED: "impaired",
  SLOWED: "slow",
  IMMOBILIZED: "immobilized",
  ENGAGED: "engaged",
  PRONE: "prone",
  HIDDEN: "hidden",
  INVISIBLE: "invisible",
  SHUT_DOWN: "shutdown",
  DANGER_ZONE: "dangerzone",
  MELTDOWN: "reactor_meltdown",
  DESTROYED: "destroyed",
});

/** The overcharge ladder the system uses when nothing modifies it. */
export const DEFAULT_OVERCHARGE_SEQUENCE = "+1,+1d3,+1d6,+1d6+4";
