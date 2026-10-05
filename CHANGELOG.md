# Changelog

## 0.6.0

Rules: weapon mounts and running several NPCs at once.

**Weapon actions**
- The weapon picker follows LANCER's mount rules: Superheavy weapons only in a Barrage, where they take the whole action; an Auxiliary follow-up step after a Skirmish, Overwatch or Barrage, offering only the weapons the rules allow; follow-ups are free.

**NPC Deck**
- Batch bar: select two or more NPC tokens and step HP and heat, or apply and remove conditions, on all of them at once.

## 0.5.0

Safe for the table: easier to hide, checked against the usual LANCER modules, tested on small screens.

**Flight Deck**
- Mech check buttons under the stat strip: HULL, AGI, SYS and ENG, each in its own colour with its bonus. A click rolls the check through LANCER's own prompt and chat card; hovering shows the formula and what the check is for.
- A hide button in the panel header, next to mute, and a **Flight Deck** toggle in Token Controls to bring the panel back (Alt+C still works).
- The first-login offer closes itself if the panel is turned on another way.
- HUD menus stay clear of the hotbar, players list and chat input on small screens such as 1280x720; tall menus scroll.

**Compatibility**
- LANCER Alternative Structure: structure and stress odds follow its tables, tagged ALT TABLE.
- Lancer QoL: while its heat automation is on, the Danger Zone tile is display-only, since QoL sets and clears that status from heat.
- Notes for Lancer QoL, Token Action HUD and others in the README's Compatibility section; no conflicts with Alternative Sheets, Enhanced Status Effects, Weapon FX, Speed Provider or Ilysen's NPC rebake.

**Fixes**
- Overwatch fired from the weapon list now marks the reaction used for the round.
- The GM-side Lock On request only accepts visible tokens in play.
- Token effects skip updates while a scene is changing; damage effects stop once the panel closes.
- Wrecks stay clean: condition effects come off a token at 0 structure, destroyed, defeated, or wrecked by Lancer QoL, and Flight Deck no longer puts back the Token Magic filters QoL clears from a wreck.

**Development**
- `npm run smoke`: a live two-seat smoke test against a running world.

## 0.4.0

First public release. Foundry v13 (verified 13.351), LANCER 3.1+ (verified 3.1.3).

**Flight Deck (every player, opt-in)**
- Docked or floating cockpit panel: hull, armour and defences; reactor heat, Danger Zone and the next Overcharge; structure and stress with exact check odds.
- Condition tiles that apply conditions to your mech or Lock On to your target, with alerts that flash and fade after 10 seconds.
- HP and heat editors that hand off to LANCER's own Structure and Overheat flows.
- HUD menus beside the panel for INVADE, Move, Quick, Full, Reactions, Core and Systems Available, built from your gear and run through LANCER's flows. Hover cards stay up while the pointer is on them; systems post their full text to chat.
- Battle damage: cracks that spread on structure damage and stay, stress warning lights and lowered saturation, steam venting through the cracks when stress and structure run low. Text stays readable.
- Condition effects on tokens: drawn overlays for most conditions, and Token Magic FX effects for Exposed, Shredded, Jammed and Impaired when that module is active.
- Short synthesized audio cues (no sound files), per-player volume and mute.

**NPC Deck (GMs)**
- One compact row per NPC with HP, heat, features and quick conditions; follows the token you select.
- Initiative strip with token art showing who is acting, who is ready and who is done; hovering a portrait puts a "look here" marker on the map, clicking selects the token.
- Movable and resizable like the Flight Deck.

**Robustness**
- Works with every other module disabled, without Token Magic FX, in Firefox and Chromium, and with "Disable game canvas" on.
