/**
 * LANCER's basic actions, the ones every mech has regardless of loadout.
 *
 * Each entry says which HUD menu it lives in, its icon, which action-economy slot it costs,
 * and how it runs (`run`):
 *  - chat           post a card with the rules text (LANCER's SimpleTextFlow)
 *  - basicAttack    LANCER's basic attack flow, titled (Grapple, Ram, Improvised Attack)
 *  - weapons        open the weapon picker, then the weapon attack flow (Skirmish, Barrage, Overwatch)
 *  - invade         basic tech attack flagged as an Invade (Fragment Signal)
 *  - lockon         put Lock On on the targeted tokens, then post the card
 *  - scan           LANCER's Scan flow on the first targeted token
 *  - selfStatus     toggle a status on the panel's mech, then post the card (Hide, Shut Down, Boot Up)
 *  - meltdown       post the card and start the Reactor Meltdown countdown (Self-Destruct)
 *  - stabilize / overcharge   the system's own flows
 *  - view           switch the HUD to another menu (the Invade tile in Quick Tech)
 *
 * `singleTarget`: the rules aim it at one character (Lock On, Scan, a basic invade). With
 * several tokens targeted it warns and does nothing, rather than hitting all of them.
 *
 * Names and rules text are in lang/en.json under LFD.Basic.<id>, paraphrased and short.
 */
export const BASIC_ACTIONS = [
  // Quick
  { id: "skirmish", menu: "quick", section: "basic", icon: "cci cci-weapon", spend: "quick", run: "weapons" },
  { id: "boost", menu: "quick", section: "basic", icon: "fa-solid fa-forward-fast", spend: "quick", run: "chat", grantsMove: true },
  { id: "grapple", menu: "quick", section: "basic", icon: "fa-solid fa-hand-fist", spend: "quick", run: "basicAttack" },
  { id: "ram", menu: "quick", section: "basic", icon: "fa-solid fa-person-falling-burst", spend: "quick", run: "basicAttack" },
  { id: "hide", menu: "quick", section: "basic", icon: "cci cci-status-hidden", spend: "quick", run: "selfStatus", status: "hidden", active: true },
  { id: "search", menu: "quick", section: "basic", icon: "fa-solid fa-magnifying-glass", spend: "quick", run: "chat" },
  { id: "prepare", menu: "quick", section: "basic", icon: "fa-solid fa-hourglass-half", spend: "quick", run: "chat" },
  { id: "eject", menu: "quick", section: "basic", icon: "fa-solid fa-parachute-box", spend: "quick", run: "chat" },
  { id: "shutdown", menu: "quick", section: "basic", icon: "cci cci-status-shut-down", spend: "quick", run: "selfStatus", status: "shutdown", active: true },
  { id: "selfdestruct", menu: "quick", section: "basic", icon: "cci cci-reactor", spend: "quick", run: "meltdown" },
  // Quick tech
  { id: "bolster", menu: "quick", section: "tech", icon: "fa-solid fa-angles-up", spend: "quick", run: "chat" },
  { id: "lockon", menu: "quick", section: "tech", icon: "cci cci-condition-lock-on", spend: "quick", run: "lockon", needsTarget: true, singleTarget: true },
  { id: "scan", menu: "quick", section: "tech", icon: "cci cci-sensor", spend: "quick", run: "scan", needsTarget: true, singleTarget: true },
  { id: "invade", menu: "quick", section: "tech", icon: "fa-solid fa-terminal", spend: null, run: "view", view: "invade" },

  // Full
  { id: "barrage", menu: "full", section: "basic", icon: "cci cci-barrage", spend: "full", run: "weapons" },
  { id: "improvised", menu: "full", section: "basic", icon: "cci cci-melee", spend: "full", run: "basicAttack" },
  { id: "stabilize", menu: "full", section: "basic", icon: "cci cci-repair", spend: "full", run: "stabilize" },
  { id: "disengage", menu: "full", section: "basic", icon: "fa-solid fa-person-running", spend: "full", run: "chat" },
  { id: "bootup", menu: "full", section: "basic", icon: "fa-solid fa-power-off", spend: "full", run: "selfStatus", status: "shutdown", active: false },
  { id: "mount", menu: "full", section: "basic", icon: "fa-solid fa-right-to-bracket", spend: "full", run: "chat" },
  { id: "jockey", menu: "full", section: "basic", icon: "fa-solid fa-hand-back-fist", spend: "full", run: "chat" },
  { id: "fulltech", menu: "full", section: "tech", icon: "cci cci-tech-full", spend: "full", run: "chat" },

  // Reactions
  { id: "brace", menu: "reaction", section: "basic", icon: "fa-solid fa-shield-halved", spend: "reaction", run: "chat" },
  { id: "overwatch", menu: "reaction", section: "basic", icon: "cci cci-reticule", spend: "reaction", run: "weapons" },

  // Movement
  { id: "boostMove", menu: "move", section: "basic", icon: "fa-solid fa-forward-fast", spend: "quick", run: "chat", text: "boost", grantsMove: true },
  { id: "disengageMove", menu: "move", section: "basic", icon: "fa-solid fa-person-running", spend: "full", run: "chat", text: "disengage" },

  // Invade
  { id: "fragment", menu: "invade", section: "basic", icon: "fa-solid fa-wave-square", spend: "quick", run: "invade", needsTarget: true, singleTarget: true },

  // Frame: free actions
  { id: "overcharge", menu: "core", section: "free", icon: "cci cci-overcharge", spend: null, run: "overcharge" },
];

/** Basic actions whose card shares another action's name and text (Boost / Disengage in the Move menu). */
export const textId = def => def.text ?? def.id;

/** Titles LANCER's own attack and invade cards use. */
export const ATTACK_TITLES = {
  grapple: "GRAPPLE",
  ram: "RAM",
  improvised: "IMPROVISED ATTACK",
  fragment: "FRAGMENT SIGNAL", // the invade card adds "INVADE ::" itself
};
