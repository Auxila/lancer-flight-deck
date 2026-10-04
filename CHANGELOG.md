# Changelog

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
