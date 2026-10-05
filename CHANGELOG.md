# Changelog

## 0.6.4

- NPC Deck: hovering an NPC's row puts the same animated "look here" marker on its token as hovering its initiative portrait.
- Cold boot: the COMBAT MODE / ENGAGED finish holds a second longer before the doors open, with a light running along the bar, the stamp pulsing and the brackets breathing (about three seconds in all).

**Visual polish**
- Hover cards: the body text of condition, system, weapon and NPC feature cards no longer sits flush against the card's edge.
- The structure / stress odds card, the HULL / AGI / SYS / ENG check card and the NPC Deck's initiative portrait cards now use the cockpit card style like every other card. The odds card is titled (NEXT STRUCTURE CHECK, 3D6 · LOWEST DIE) and sets the failed-check odds apart from the alternative-structure note.
- After docking to the other side, condition, odds and check cards open away from the new edge straight away.
- HUD menus: section headers (BASIC, TECH SYSTEMS, SYSTEMS & GEAR...) are brighter, readouts are uppercase like the rest of the instruments (WALK, NONE), and footers light each key: **HOVER** detail, **CLICK** execute, **ESC** close. Same in the NPC Deck footer.
- NPC Deck: the header's count reads "12 NPCs to act", so it isn't mistaken for the initiative strip's count of every side.
- A condition card's hint no longer repeats its name ("Click: toggle on Kitbash").
- HUD menus are smoked glass in the panel's plate tone instead of half-transparent, so they stay dark and legible over light maps; entries sit in them as recessed wells like the panel's buttons.
- Short screens: the panel's header stays pinned while the plates scroll under it, and a fade with a chevron on the bottom edge shows there's more below.
- Condition tiles that are off read more clearly (still unlit: no fill, border or glow).

**Token Action HUD**
- While the panel is open on your mech, Token Action HUD's bar (which sits behind a left-docked panel and showed through it) is hidden. Collapsing or hiding the panel brings it back. Visual only: nothing of Token Action HUD's changes. Client setting **Hide Token Action HUD while open**, on by default, shown when Token Action HUD is active.

## 0.6.3

**Cold boot, rebuilt**
- A two-second boot every time the panel opens or expands from its collapsed tab: CRT power-on, a fast terminal log pouring down the panel (generated from the mech: weapons, systems, reactor, structure, pilot), a hard cut, then an Armored Core-style MAIN SYSTEM / COMBAT MODE / ENGAGED finish before the overlay splits open and the plates power on.
- Synthesized sound on the same timeline. Skippable with a click; a still title card with reduced motion; collapsing mid-boot ends it cleanly.

## 0.6.2

Fixes from a bug hunt (with Gemini reviewing alongside):

- **NPC Deck HP and heat:** steps that take several NPCs to 0 HP (or over their heat cap) at once no longer lose structure or overheat checks. LANCER keeps one such prompt open at a time and cancels the older one, so the checks now open one after another, with a notice naming the NPC whose check is next. Quick repeated clicks on one NPC all count, and the batch bar's × deselects only the NPCs it lists.
- **Weapon picker:** switching to another mech mid-action starts its weapon action fresh (it used to inherit the first mech's attacks and spend nothing). A Barrage that can't make a second attack moves on after the first, a **Done** button ends the action once anything has fired, and a weapon that can't fire (destroyed, unloaded, out of uses) is barred with the reason.
- **Damage after a hit:** opens only where LANCER's card offers ROLL DAMAGE (a tech attack only if it's an invade), and never waits on a prompt that's no longer on screen.
- Tags read from both a weapon's profiles and its base, once each; notices use token names (Squad 2, not its base actor's name).

## 0.6.1

**Damage after a hit**
- When an attack you make hits or crits, LANCER's damage roll prompt opens by itself, every target pre-set to Crit, Hit or Miss. Area attacks open one prompt; a Barrage's prompts queue so none is lost. Per-player setting, on by default.

**Fixes**
- Weapon tags are read from the weapon's profiles (where LANCER keeps them): an unloaded Loading weapon now shows as Unloaded in the weapon picker, and Limited uses and Heat (Self) on weapons show correctly.

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
