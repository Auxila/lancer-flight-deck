# Changelog

## Unreleased (0.8: manufacturer themes)

**Theme picker**
- Click the maker's badge at the top left of the panel to choose the cockpit theme: **Match frame** (the default) or any theme by name, each option drawn in its own colours. Hover or arrow onto one to preview it on the whole cockpit, layout included; Enter or a click chooses it (with that theme's chime), Escape closes and returns to the badge. It's the same per-player setting as Configure Settings → Cockpit theme.

**IPS-N: a ship's bridge**
- Its own layout for the header, hull, reactor and integrity, and IPS-N hardware on everything else: DIN signage type (Bahnschrift on Windows, DIN on macOS, Signika elsewhere), riveted plating with rounded hatch corners, signal flags on the section titles, round bridge push-buttons and port-light lamps.
- **Nameboard:** the Northstar rose opens the picker and turns as you reach for it; over the mech's name, IPS-N and a Trunk Security style hull number (cosmetic, the same for a mech every session); under it, the frame as a class (GOBLIN-CLASS).
- **Hull:** HP is hull plating marked at every hit point, heavier every fifth; armor shows as plates.
- **Reactor:** each heat cell carries its number; the Danger Zone threshold is a load line with its Plimsoll mark (in the legend too). The Overcharge ladder is an engine order telegraph: the next cost lit, passed orders dimmed, the pointer swinging over when you Overcharge.
- **Damage control:** structure and stress side by side. Structure is the hull in profile, cut into watertight compartments that flood when lost; stress is a row of reactor valve wheels that blow. Odds and the next check under each; ALT TABLE once in the title.
- HUD menus (round glyphs, radiused glass), hover cards, the NPC Deck (porthole portraits) and the collapsed tab (the rose on top) follow. Cold boot: a sonar sweep behind *Your friend in an unfriendly sea*, BATTLE STATIONS, ALL HANDS.
- Warning, caution and Heat colours are the same as GMS's, and every number, control and alert is where it always is.

**SSC: an atelier chronometer**
- Its own header, hull, reactor and integrity, and an atelier finish on everything else: black lacquer engraved with guilloché in a double gold hairline frame, serif small caps (Sitka on Windows, Didot or Baskerville on macOS) over light watch numerals, cabochon lamps, engraved plaques for buttons.
- **Maker's label:** the SSC seal opens the picker and blooms as you reach for it; over the name, Smith-Shimano and a commission number (Nº 4277; cosmetic, the same for a mech every session); the name in its owner's own case, the frame in italics.
- **Hull:** HP is a wingspan, spreading from the body out to both tips and folding back in as it falls; armor as set stones; the stats in light numerals between hairlines.
- **Reactor:** a calibrated scale with a hand at the current heat, the Danger Zone engraved over its stretch with numerals at the threshold and the cap. The Overcharge ladder is a row of jewels on a fine chain: the next cost lit, spent ones clouded.
- **Integrity:** two sunburst sub-dials, structure and stress. Each box is an applied index, gold while it holds and hollow red once lost; the count in the centre, the odds below.
- HUD glyphs and NPC Deck portraits are gem-cut octagons; hover cards and the picker follow. The UI gold is a pale champagne, kept to hairlines and type, so amber still means a lit caution. Cold boot: two guilloché rosettes turning against each other behind *You only need one*, FULL SYNC, BESPOKE.

**Under the hood**
- Theme colours are tokens all the way down (wells, edges, unlit lamps), so every surface follows the maker.
- Themes can bring their own templates per part, finish-card text and a header serial; `tests/themes.test.js` checks the maker mapping, the override, and that a theme's templates keep every hook of the parts they replace. `npm run smoke` gains a picker step.
- HORUS and HA have first-pass palettes in the repo, unregistered until they're finished.

## 0.7.0

**Ready for the table**
- **GM brief** (`docs/GM-BRIEF.md`): one page for the GM: everything Flight Deck can change in a world, who writes it and which setting controls it, what it never does, how to remove it, and what it's been checked alongside.
- **Remove Flight Deck data** (Configure Settings, GM only): finds Flight Deck's Token Magic filters on every scene and its notes on actors, lists them, and removes them on confirmation, then turns off *Condition effects on token art* so the filters don't come back. Game state stays. Also `api.cleanup.run()` for macros.
- **Meltdown countdowns tick at turn end:** in combat, a reactor meltdown countdown goes down by one at the end of that mech's or NPC's turn, when LANCER runs its own end-of-turn automation. The active GM's client does it, so it's counted once. At T-0 a chat card tells the table, and the owner's panel flashes REACTOR CRITICAL with the klaxon. World setting, on by default; the tile's right-click still ticks by hand.
- **Lancer Ruler Integration:** the MOVE menu gains **Auto**, which unpins the movement mode so Ruler Integration chooses it again (walk, fly, crawl while Prone, ignore-terrain). Picking a mode used to pin it silently.

**Checked alongside the rest of the stack:** Lancer Weapon FX (the same animation macro for HUD and sheet attacks, from its own log), Enhanced Lancer Status Effects, Lancer Alternative Sheets, Bar Brawl, Token Variant Art. Notes in the README's Compatibility section.

**LANCER contract checks** in `npm run smoke`: every LANCER flow and helper Flight Deck calls, the step the basic-invade workaround hooks onto, the mech's data paths, the condition ids the tiles toggle, the NPC Deck's combat and feature calls; and live, Grapple's attack prompt carries its own title and a basic invade reaches LANCER as a tech attack (both cancelled). After a LANCER or Foundry update, a failure names the assumption that broke.

## 0.6.9

**Performance** (from a profiling pass: idle cost, redraw timings, a leak check)
- NPC Deck: a token that only moved (anyone's, every step in combat) no longer redraws the whole deck; about 14 ms of the GM's time saved per move. Any other token change still redraws it.
- The INVADE button's scan line moves by transform instead of `top`, so the open panel no longer forces a layout and repaint every frame; the panel's idle cost is now within noise of having it off.
- The acting initiative portrait's glow was a filter cut away by the portrait's hex clip: repainted every frame, never visible. It's now a soft halo behind the hex that breathes on opacity, so it shows, and costs no repaints.

## 0.6.8

**Every action your gear gives you**
- Systems tagged "Quick Action", "Full Action", "Protocol", "Reaction" and so on, with no action of their own (Electrolasso, Pordego Shield, Shell Shield, Lightning Field Generator... 23 in the core and LCP data), now sit in that HUD menu. Using one runs LANCER's own system use: destroyed and Limited checks, Heat (Self), a use spent, its card.
- Deployables: each mine, drone or turret your gear deploys gets a **Deploy** entry at its own deploy cost, right after the gear's actions (Smoke Charges: Smoke Grenade, then Deploy Smoke Mine; 144 deployables in the data). It's paid through LANCER's system use, posts the system card titled for what was deployed with the deployable's rules, and places your copy of the deployable beside your mech to drag into position. **Recall** and **Redeploy** appear while it's on the scene and the deployable has them. Token placing and removal follow the world's permissions (Assistant GM and up by default); players get the card and a notice that the GM places it.
- SYSTEMS AVAILABLE shows a tagged system's activation (QUICK) instead of its type.
- Unit tests for the gear catalog (`tests/catalog.test.js`).

## 0.6.7

- System chat cards (SYSTEMS AVAILABLE → click) leave out the flavor text: rules, actions, deployables and tags only. A system whose only rules text is its description still shows it, as the hover card does.

## 0.6.6

**Protocols & reactions**
- The REACT light opens **Protocols & reactions**: every protocol your frame, systems and talents give you on top (marked PROTOCOL READY or USED), then Brace and Overwatch, then every reaction from your gear, traits and talents (marked REACTION READY or USED). Protocols left the Frame & core menu.
- The light keeps its lamp for the reaction and gains a PROTO line that lights while the protocol is still available. Right-click marks the reaction spent or available, Shift+right-click the protocol.

## 0.6.5

**NPC Deck**
- The open row (selecting an NPC's token opens it) shows its conditions as a grid of labelled tiles, lit in the panel's annunciator colours when on: red for Stunned, Exposed and Shredded; amber for Lock On, Jammed, Impaired, Slowed, Immobile and Prone; green for Hidden. They sit right under the stats instead of below the features, and a click still toggles one.
- **HULL / AGI / SYS / ENG** keys under the open row's stats, colour-coded like the panel's: hover for the check's card, click to roll it through LANCER for that NPC.
- Every row's active conditions are badges with their names in the same colours, not bare icons. On the open row, the badges list only what the tiles don't cover.
- The batch bar's condition buttons are the same labelled tiles, half-lit when only some of the selection have it.

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
