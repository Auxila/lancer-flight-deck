# Changelog

## 0.8.8

- **Evasion and E-Defense say how often they turn an attack away.** Their hover cards gain a small table headed in plain words ("Chance a typical NPC attack misses"), with a worked example under it in the dice players know ("Tier 1, in the open: hits on 9+ on the d20 (60%), misses 40%"), so it can't be read as the chance to hit. It gives the chance a typical NPC attack misses at Tier 1, 2 and 3 (the +1, +2 and +3 most NPC weapons and tech attacks carry; some hit harder). Evasion's also shows soft and hard cover against ranged attacks. A **Now** row appears when something on the mech changes the odds: Prone and Lock On (+1 Accuracy), Invisible (half of all attacks miss outright), Stunned or Shut Down (Evasion capped at 5), Hidden (can't be targeted) and, for E-Defense, Shut Down (immune to tech attacks). Exact odds, not an estimate of the dice; each point of the stat is another 5%. It goes by tier, never by the NPCs on the map, so it gives away nothing a Scan would.
- E-Defense's card now lists Prone, Invisible and Hidden among the conditions that change it: they affect tech attacks too.
- Unit tests, 103: the miss chance against brute force for every defense, bonus and up to three Accuracy or Difficulty dice; the cards' rows and the now row. Smoke test: Evasion and E-Defense carry the table.

## 0.8.7

- **A gear in the panel header** opens Foundry's settings straight on Flight Deck's tab: every setting a player has (size, opacity, sound, motion, battle damage, the boot sequence and the rest), each with its explanation. Before, they were three clicks and a scroll away. It sits with the header's other buttons, beside mute, in every cockpit theme.
- Smoke test, 45 steps: the gear opens the settings on Flight Deck's tab.

## 0.8.6

**For players**
- **A one-page intro** (`docs/PLAYER-INTRO.md`, in the package next to the GM brief): turning the panel on and off, reading it, acting from it, and what to do if it misbehaves.

**From a sweep of how Flight Deck works alongside other modules** (an A/B run with Flight Deck on and off: no errors caused in any module)
- **Jammed defers to Lancer QoL by default:** the world setting *Jammed effect* now defaults to QoL's own effect whenever QoL draws its condition effects; Flight Deck draws its Jammed only where QoL isn't. Choosing Flight Deck's still replaces QoL's where both would stack. Worlds that picked Flight Deck's keep it.
- **Docked panels stop above Foundry's player list:** on a laptop-height screen (1366x768) the cockpit ran over the player list in the bottom-left corner. Foundry's list overflows its own box, which the panel measured; both the cockpit and the NPC Deck now measure the list itself.

## 0.8.5

**Reserves on the NPC Deck**
- NPC tokens placed hidden on the scene, standing and not in the fight, fold into **Reserves · n** under the turn order (not counted in the header). Their rows are dashed, with an eye-slash.
- **Deploy** on a reserve reveals its token, adds it to the combat and shows its place in the tracker in one click; it joins To act with this round's activations. The batch bar's button reads **Deploy N** when any of the selection is hidden.
- **Reveal** for an NPC in the fight that players can't see (a hidden token or tracker entry): an eye-slash button by its name, and **Reveal** in its open row, unhide both together. Foundry keeps the two apart, so revealing only the token used to leave the NPC missing from the players' tracker.
- GM brief: a row for what players can see of an NPC (Deploy and Reveal only ever reveal).
- Smoke test, 44 steps: a hidden NPC in Reserves, Deploy, and Reveal.

## 0.8.4

**Fixes, from a full scan of the module**
- **Raw key names on the panels:** since 0.8.1, the drag hint, the pin button and the "Dock here" label showed as `LFD.Move.Hint`, `LFD.Move.Dock` and `LFD.Move.DockHere` on the NPC Deck and the cockpit panel's header. The movement warning's strings had replaced them; both sets are back.
- **Undo is once per turn, Elites included:** after an Elite ended its last turn, Undo could be pressed twice, handing back an activation it never spent. Now it can't undo the same turn twice; once the unit takes another turn, that one can be undone.
- **The meltdown countdown doesn't tick on a step back:** LANCER's previous turn and previous round (the NPC Deck's Undo and Prev) no longer count as a turn ending. And when Undo takes back a turn that has already ended, a tick that turn's end made is put back, so taking the turn again doesn't tick it twice.
- **Reactions and Boost follow the fight you're in:** with an earlier encounter still running (last session's, left started on another scene, with the same mechs in it), a reaction taken in the new fight was filed against the old one's round, so it stayed "used" for the rest of the new fight; a Boost's allowance had the same mix-up off your own turn. Both now go by the encounter the mech is acting in, else the active one on its scene, else the one the tracker shows.
- **A destroyed NPC isn't offered back into the fight:** once Lancer QoL takes a wreck out of the combat (its own setting), the deck no longer shows it **Add to combat**, on its row or through the batch bar.
- **Twins by number everywhere on the deck:** Undo's and Activate's hover text and Next round's question name a unit the way its row and portrait do ("Undo Conscript 1's activation", "Gilt, Conscript 1, Conscript 2 still to act"), not just "Conscript".
- **One part failing no longer stops the rest:** each part (the cockpit, the NPC Deck, token effects, Lock On requests, movement, auto-damage, the meltdown countdown) starts on its own. If one fails, the others still run, and GMs get one notice naming what's off.

**Tests**
- Unit tests, 97: every text key the code and templates use exists in `en.json`, every key prefix completed at runtime has keys under it, and `en.json` names no key twice in one object (the cause of the missing strings above). Undo for Elites; the meltdown countdown's step back and restored tick; which encounter a mech's reactions and Boost belong to.
- Smoke test: Foundry deprecation warnings that come from Flight Deck's code now fail the step they happen in (there are none today), so a Foundry update can't creep up on it.
- Checked across all 1,976 items in the world's compendiums (every weapon, system, frame and NPC feature, LCP content included) and every actor in the test world: the panel's and the deck's readers threw nothing.

**The round's controls, along the bottom of the NPC Deck** (while a combat runs)
- **Prev** · **Undo** · **Next round** · **End**, pinned to the bottom edge, clear of the resize grip; End in red, last.
- **Undo** takes back the turn in progress (LANCER's previous turn: the activation comes back and nobody acts), or right after a turn ends, gives that unit its activation back so it returns to To act. Once per turn; the hover names whose.
- **Next round** any time: with anyone still to act it asks first and names them. **Prev** asks first (everyone's activations come back and that round starts over). **End** is Foundry's own End Encounter, with its question. Off buttons stay put, dashed and dim, saying why.
- GM brief: the table covers the strip, and "what it never does" now says the round and the encounter change only after the GM confirms.

**NPC Deck**
- **Destroyed NPCs have no turns:** once an NPC is destroyed (out of structure, or flagged), its activations disappear from its row and its initiative portrait, it no longer counts as still to act (header, Next round's question), it doesn't hold up the round's end, and a right-click on its portrait doesn't start a turn. LANCER's own count is left alone.
- Smoke test, 43 steps: Undo both ways (and only once), Next and Prev ask, End asks and No keeps the encounter.

## 0.8.3

**The NPC Deck runs the whole round**
- **Activate** and **End activation** on the open row, beside Sheet: big, lit buttons that take the NPC's turn and finish it. The one that doesn't apply stays put, dashed and dim, its hover saying why; Activate warns when it would end someone else's turn. End activation pulses gently while the NPC acts (still under Reduce motion).
- **Add to combat:** an NPC outside the fight gets it in its row, in place of Activate / End activation; with several selected, the batch bar's **Add N to combat** adds the ones not in it. They join To act with this round's activations.
- **Next round:** once nobody is acting and nobody standing has an activation left, a bar under the header says the round is complete and offers LANCER's Next round.
- A click on a row's **HP bar** (or its condition badges) opens and closes it, like its name line.
- Clicking an NPC token that's already selected opens its row again (after the turn had moved the deck to another).
- The batch bar names twins by their numbers ("Test Hostile 1, Test Hostile 2").
- **GM brief:** its table of everything Flight Deck can change now covers the NPC Deck's turns and activations, Add to combat and Next round, and the GM's condition tiles; and it says what the deck never does to a combat.
- Smoke test, 42 steps: the turn pair, the HP click, Add to combat (row and batch), the click on a selected NPC, and Next round.

## 0.8.2

**The NPC Deck, laid out for running a turn**
- The roster runs in the order a GM chooses who goes next: **Acting**, **To act**, **Done this round**, then **Destroyed** folded into one line (click to show). Out of combat, one list with the destroyed still folded.
- **▶ on every NPC that can still act** starts its turn from the list; the acting NPC's row has **End turn**. Choosing the next NPC is one click.
- HP gets the full width; heat shows once there is some (the open row always has it), and activation pips only for NPCs with more than one.
- The open row leads with the NPC's features, attacks showing their numbers on the button (`+1 · Thr 1 · 5 Kin`); defenses go on one line; the condition tiles are bigger and bolder: two rows of named tiles, a lit one glowing in its annunciator colour under a lamp bar.
- A destroyed NPC's open row greys only its header, so its controls (and lit conditions) stay readable.
- The initiative strip is one row: done units shrink, a big fight scrolls sideways (mouse wheel too, the edge fading while there's more), labels keep what tells them apart ("Gladi… A"), and tokens that share a name carry the same number on the strip and the roster.
- Counts say what they count: the header is NPCs still to act this round (standing, out of combat), the strip's summary is all sides. Selected NPCs are marked in the roster. The always-on help footer moved behind a **?** in the header.
- Smoke test, 38 steps: ▶ and End turn move an NPC through the sections.

## 0.8.1

Ready for the table trial.

- **Battle damage setting** (per player): Animated, Still or Off. Still keeps the damage with nothing moving and no kick on a structure hit (Reduce motion gives the same), and HORUS's stress-horror eyes stop following while the cockpit's own eyes still do. Off is a clean panel; turned back on, the damage draws as it stands without replaying.
- **The MOVE light after a Boost** reads what's left over the turn's real allowance (10/10 at Speed 5), not over Speed (10/5). Boost records the allowance for its own combat round, so it lapses on its own; Reset and a right-click refresh of the light clear it. The Speed card says "Boost included".
- **Whose turn it is, with more than one encounter:** the panel's activation light is lit while it's the mech's turn in any started encounter, whichever one the player's combat tracker shows. The NPC Deck runs the scene's active encounter (the one Foundry's tracker opens on, and the one a new encounter becomes), else the one the tracker shows, else the latest started; its Activate, End turn and initiative right-click act on that same encounter.
- **Checked:** the Structure / Overheat notice reads LANCER's `automationOptions.structure`, which gates both checks (LANCER's `triggerStrussFlow` starts both only while it's on); no change.
- **Smoke test, 37 steps:** nine more, for the features since 0.8.0: whose turn it is with two encounters (panel and NPC Deck), drag movement with undo and Reset (the ruler's history cleared), Boost and the allowance, Reliable misses opening the damage roll (and plain misses not), the NPC Deck's Invisible right-click, keyboard focus in HUD menus, stat cards, and the battle damage setting.

## 0.8.0

Manufacturer themes: IPS-N, SSC, HORUS and HA each get their own cockpit, layout and battle damage; GMS stays the baseline (and the fallback for LCP makers).

**Theme picker**
- Click the maker's badge at the top left of the panel to choose the cockpit theme: **Match frame** (the default) or any theme by name, each option drawn in its own colours. Hover or arrow onto one to preview it on the whole cockpit, layout included; Enter or a click chooses it (with that theme's chime), Escape closes and returns to the badge.
- **Each mech keeps its own theme:** the choice is saved on the mech (an actor flag), so every player who has it in their panel sees the same cockpit, and selecting another mech switches to that mech's theme. Anyone who owns the mech can change it; the picker's header says who it's for. Mechs without a pick use each player's **Default cockpit theme** (the old Cockpit theme setting, unchanged); turning off the new **Show each mech's own theme** shows every mech in your default, and the badge then sets that instead.

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

**HORUS: a leaked readout**
- Its own header, hull and integrity, and HORUS print on everything else: 1-bit black and bone, all monospace, lowercase except the alarms (condition tiles still shout), plates printed a pixel out of register in HORUS green, dithered blanks. Selections are reverse video, so HORUS green stays out of anything that looks like a lamp and mint still only means ready.
- **Header:** the HORUS sigil opens the picker (the signal slips when you reach for it; reverse video while its menu is open); over the name a hashed handle (74C8:2EF5; cosmetic, the same for a mech every session); the name tears for a moment now and then; the frame as the UIB's *pattern group*. The comms line is a prompt with a cursor.
- **Hull:** sections are prompts (`$ hull`); HP prints cell by cell, one per hit point, over a dithered blank; armor as solid blocks; tags and checks in brackets.
- **Reactor:** heat cells are a memory dump, numbered in hex. The Overcharge ladder is a checklist: `[x]` spent, `[>]` next in reverse video, `[ ]` to come.
- **Integrity:** watched. Structure is a row of eyes that follow your pointer (and glance about on their own once it rests), shutting in red as boxes are lost; stress is a row of the sigil's rings that break. The next check hangs under each line as a tree branch: the roll, the odds bar, what's at stake.
- Push-buttons are executables (`./overcharge`, `./stabilize`) that go reverse video under the pointer; lamps are square pixels. HUD glyphs are kite-cut like the sigil's point, the NPC Deck's portraits square, and both print out of register. Cold boot: the sigil prints in dither, line by line, behind *every door, open*, UNSEALED, RUN ANYWAY.
- HORUS frames (Goblin, Hydra, Lich...) now match HORUS instead of GMS.

**HA: imperial brutalism**
- Its own header and integrity, and the Armory's finish on everything else: poured-concrete slabs (a fine aggregate grain, one corner sheared off, a violet insignia triangle in the other), poster capitals (Franklin Gothic on Windows), Roman numerals on the sections (I HULL, II REACTOR HEAT, III INTEGRITY).
- **Header:** the Armory's banner hangs from a violet rail with its mark, opens the picker and stirs as you reach for it; over the name, the battlegroup the mech was raised with, named the way the Armory names them (*2nd Capitol Peak, Planetwatch*; cosmetic, the same for a mech every session).
- **Hull and reactor:** HP is a sheared slab; heat runs in hexagonal cells, the Danger Zone hatched. The Overcharge ladder, HA's own discipline, climbs as a stair: each rung a step higher, the next one lit violet, the climbed ones struck.
- **Integrity:** two banners of rank insignia, chevrons for structure and bars for stress, white while they hold and struck in red once lost; the count and the next check stand beside each.
- Lamps are the mark's triangle; push-buttons are slabs on a violet sill. HUD glyphs and NPC Deck portraits are cut as heraldic shields. Cold boot: the Bruise (a world's heraldry turning violet on annexation) spreads from the centre behind the mark, *Superior by design*, ASCENDANT, FOR THE PURVIEW.

All four of the Big Four now have their own cockpit; LCP manufacturers keep GMS.

**Battle damage, by maker**
- Each cockpit now takes structure and stress damage its own way; GMS keeps its cracked glass and steam.
- **IPS-N, hull breach and battle lanterns:** a shell punches through the plating (petals torn outward and white-hot, the plating buckled into dents, a seam torn open inboard, rivets popping out, sea spray), the panel rolls like a struck ship, and damage control bolts a hazard-taped patch over it a second later, welding each bolt; the patch stays, dripping. Stress brings a red rotating beacon and red emergency light; each hit is a pressure wave through the bulkheads.
- **SSC, kintsugi and the glamour failing:** a white hairline races in and molten gold flows in behind it and sets, gold leaf drifting down as the movement skips a beat; the gold seams stay, a glint running along them. Stress fails the glamour: the projected veneer drops out in tiles to the bare grey chassis (flickering, then staying out and spreading, strobing off entirely at the last point), and the pilot sees double, a ghost of the cockpit drifting off-register and swimming, with a heartbeat at the edges; each hit snaps the sync (the ghost jerks wide, a dropout wave sweeps across, the heartbeat spikes).
- **HORUS, corruption and interference:** a hard datamosh tear, a FAULT stamp, and a bad sector printed against the edge with its error code, a glitch band torn across the readout, pixel-sort smears and dead-pixel clusters; the print slips further out of register with every point lost. Stress wakes the machine: eyes open in the static and follow the pointer (more each level, staring and unblinking at the last point), a plate slips out of register now and then, pixels melt down the readout, phrases surface in the noise, the labels are hijacked for a moment (*it hears you*, *$ nothing is lost*), and at the last point a great eye opens to watch you once in a while; each hit jams the feed, every eye snaps wide and turns to look, and a phrase flashes. Numbers are never touched.
- **HA, spalled concrete and heat soak:** a heavy thud and a violet energy flash, a chunk out of the slab with the bent rebar showing, crazing, scorch and a dust stain, stepped cracks, dust and debris. Stress soaks the slabs with heat from the edges in, violet to orange, with rising haze and burning insignia; each hit vents plasma from the bottom corners.
- Repairs undo each in kind (welded smooth, polished away, defragmented, poured full of resin). Switching theme while damaged redraws the same damage in the new style without replaying it; reduced motion shows it all, still. Steam's hiss only plays where there's glass.

**Fixes**
- NPC Deck: a right-click on the **Hidden** tile toggles **Invisible**, on an NPC's row and on the batch bar, as on the panel's annunciator. The tile lights for either, reads Hidden, Invisible or Hid + Invis, and Invisible no longer shows again as a separate chip.
- **Dragging a mech is movement.** Moving the panel's mech on the map (a drag, or the arrow keys) spends LANCER's movement (the MOVE count) by what Foundry measured for the path, difficult terrain included; Ctrl+Z gives it back; displacement, scripts, pastes and config edits are free; moving past what's left tells the mover once. Boost now adds Speed to what's left. The MOVE menu's Reset also clears Foundry's movement history for the token, so the ruler's distance moved resets with the count. Follows *HUD menus spend actions*; one client writes (whoever moved it).
- Roll damage after a hit now also opens on a miss with a **Reliable** weapon, whose Reliable damage still lands (LANCER rolls it for the missed targets). It reads Reliable the way LANCER's damage flow does: the mech weapon's active profile, an NPC weapon's tier. Other misses still open nothing.
- **Stat cards:** hover or Tab to Evasion, E-Defense, Speed, Sensors, Save Target or Tech Attack for what it does in play, how the number is made up (frame, plus Agility, Systems or Grit by the core rules, plus anything from gear and talents, always adding up to LANCER's number), the standard move left this turn, and any condition on the mech that changes it (Prone on Evasion and Speed, Impaired on Save and Tech Attack...). In every maker's skin.
- Keyboard: a HUD menu opened from its shortcut, or with Enter on its button, takes focus, so the arrow keys work at once; Escape (or the shortcut again) puts focus back on the button, and focus stays on the same entry when the menu redraws (an action spent, a use gone). Mouse clicks leave focus where it was.
- NPC Deck: a Structure or Overheat check that breaks partway in LANCER no longer holds every later NPC edit until a reload; the next check goes ahead (and the console says why). A prompt the GM is still answering is never cut short.
- NPC Deck: Reduce motion now covers the deck (the acting glow, damage flashes and kicks) and its "look here" marker, which holds still but keeps following the token, and follows the setting at once rather than only the system's preference.
- A quick double-click on the maker's badge could leave a second, orphaned theme picker on screen; now it opens and closes like a single toggle.
- Closing the panel mid-boot stops the boot there instead of leaving its timers running.
- Smoke test: a step with nothing to test in the world (no NPC token, no systems, Token Action HUD not installed) is reported as skipped, not passed.
- Removed two unused animations and an unused string; the GM brief and README no longer name old versions, and the brief lists who writes Token Magic filters with no GM online and the new per-mech theme note.

**Under the hood**
- Theme colours are tokens all the way down (wells, edges, unlit lamps), so every surface follows the maker.
- Battle damage is split into the DamageLayer (when: it diffs the mech's tracks, so reloads and switches draw quietly) and a damage style per maker (what: `BaseTheme.damage`, `src/ui/damage/styles/`), with the new geometry seeded per mech like the glass (`geometry.js`, `tests/damage.test.js`). The smoke run counts damage marks whatever the style.
- Themes can bring their own templates per part, finish-card text, a header serial and live behaviour (`mount`/`unmount`, started after each render while the theme is on screen: HORUS's eyes, `src/ui/HorusEyes.js`); `tests/themes.test.js` checks the maker mapping, the override, and that a theme's templates keep every hook of the parts they replace. `npm run smoke` gains a picker step.

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
