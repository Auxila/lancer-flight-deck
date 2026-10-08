# Flight Deck: a brief for the GM

One page for the person deciding whether Flight Deck goes into the world: what it is, exactly what it can change, what it never does, and how to take it back out.

**Needs:** Foundry VTT v13 (verified 13.351) and the LANCER system 3.1 (verified 3.1.3). Token Magic FX is optional (silhouette effects only).

## What it is

- **For players, opt-in:** a cockpit panel for their own mech. It shows heat, the Overcharge ladder and structure/stress odds, plus condition tiles and HUD menus of every action their gear gives them. Nobody gets it unless they turn it on.
- **For the GM:** the NPC Deck, a board of every NPC in the fight to run the round from: initiative and turns, HP, conditions and features.
- **For everyone:** condition visuals drawn on tokens, such as Lock On brackets, Slowed webs and Immobile chains.

Every roll, attack, card, heat cost and Limited use goes through **LANCER's own flows**, exactly as from the character sheet. So LANCER's hooks still fire, and modules like Lancer Weapon FX react to it as usual.

## Everything it can change in your world

| Change | When | Written by | Controlled by |
|---|---|---|---|
| Conditions on actors | A player clicks a condition tile on their own mech or tokens they own; the GM clicks one on the NPC Deck (an NPC's row, or the batch bar for several selected NPCs) | That player / GM | — |
| Lock On on an enemy | A player Locks On a target they don't own | The **active GM's** client, on request | World: *Players can Lock On tokens they don't own* |
| HP, heat, Burn, Overshield | The panel's editors (owner), the NPC Deck's steppers (GM, one NPC or the batch bar) | Owner / GM | — |
| Whose turn it is, and activations (LANCER's popcorn initiative) | The NPC Deck's ▶, **Activate** and **End activation** (End turn), or a right-click on an initiative portrait. These are LANCER's own activate / end calls, as its combat tracker makes them. As in the tracker, activating an NPC while someone else acts ends that turn; the button's hover says whose | GM | — |
| Combatants in the encounter | The NPC Deck's **Add to combat** (an NPC's row, or the batch bar for several selected) adds NPC tokens to the encounter the deck runs, with this round's activations | GM | — |
| What players can see of an NPC: its token's and its tracker entry's visibility | The NPC Deck's **Deploy** (a reserve: an NPC token you placed hidden) unhides the token and adds it to the encounter, shown; **Reveal** (an NPC in the fight that players can't see) unhides its token and its tracker entry together. It only ever reveals; hiding stays yours | GM | — |
| The round | The NPC Deck's **Next round**: in the bar that appears once nobody is acting and nobody standing has an activation left, or from the strip along the bottom, which asks first (naming who's still to act) if anyone is. **Prev** goes back a round, after asking. Both are LANCER's own next / previous round, which give everyone their activations back. **Undo** gives back the turn in progress (LANCER's previous turn) or the activation that just ended | GM | — |
| The encounter itself | The strip's **End**: Foundry's own End Encounter, which asks first, then deletes the encounter | GM | — |
| LANCER's action tracker | An action from a HUD menu goes through; right-click on an action light; a mech's token dragged or arrow-keyed on the map (its movement; an undo gives it back) | Owner (the client of whoever moved the token) | World: *HUD menus spend actions* (in combat / always / never) |
| Foundry's movement history of a mech's token | The MOVE menu's Reset clears it, with the movement count | Owner | — |
| Reactor meltdown countdown (`system.meltdown_timer`) | Started from the Meltdown tile or Self-Destruct; ticks down at the end of that character's turn in combat | Owner starts it; the **active GM's** client ticks it | World: *Meltdown countdowns tick at turn end* |
| Token movement mode | The Movement menu | Owner | — |
| Deployable tokens (mines, drones, turrets) | **Deploy / Recall** from a HUD menu | Only users Foundry lets create and delete tokens (Assistant GM and up by default) | Foundry: User Permissions |
| Token Magic filters on token art (ids `lfd-…`) | A token gains Exposed, Shredded, Jammed or Impaired | Exactly one client: the **active GM's**, or with no GM online, the token's first active owner | World: *Condition effects on token art* |
| A note on actors: reactions used this round | A reaction is taken from a HUD menu | Owner | — |
| A note on actors: the turn's movement allowance after a Boost | Boost from a HUD menu (it lapses with the round; Reset or a refreshed MOVE light clears it) | Owner | World: *HUD menus spend actions* |
| A note on actors: the mech's cockpit theme | Picked from the panel's maker badge; everyone who has that mech in their panel sees it | Owner | Per player: *Show each mech's own theme* |

Also, after a hit, LANCER's own damage prompt can open by itself. That's the per-player setting *Roll damage after a hit*. Nothing is rolled until the player clicks Roll in LANCER's prompt.

## What it never does

- **It never bypasses permissions.** Players act only on what they own. Lock On on an enemy goes through you, and only while the world setting allows it. Placing tokens needs Foundry's token permissions.
- **It never changes another module's settings,** and it defers where another module owns a behaviour:
  - Lancer QoL's Danger Zone and wreck handling;
  - Lancer Alternative Structure's tables.

  Its Movement menu also offers *Auto*, which hands the movement mode back to Lancer Ruler Integration.

  **One exception:** with the world setting *Jammed effect* on "Flight Deck", it removes Lancer QoL's darkening Jammed filter from tokens where both would stack.
- **It never replaces sheets or rules.** Sheets open as you've configured them, including Lancer Alternative Sheets.
- **It never removes anyone from a combat, and it never ends an encounter or changes the round without the GM confirming.** The NPC Deck adds NPCs and takes and ends turns. Next round goes straight through only once everyone has acted. Skipping ahead, going back a round and ending the encounter each ask first.
- **It never calls outside services or loads outside assets.** All sound is synthesized in the browser.

Visual-only, per player: while a player's panel is open, it hides Token Action HUD's bar, which would otherwise sit behind the panel. Each player can turn that off.

## Turning it off, or removing it

- **One player, mid-session:** the eye-slash button in the panel header, or **Alt+C**. The gauge button in Token Controls brings it back.
- **The whole table:** untick Flight Deck in *Manage Modules*. Nothing in the world depends on it.
- **Before uninstalling:** go to *Configure Settings → Flight Deck → Remove Flight Deck data*. It's GM only and asks before acting.
  - It removes Flight Deck's Token Magic filters on every scene. These are the one thing that would otherwise outlive the module.
  - It removes its notes on actors.
  - It turns off *Condition effects on token art*.

  Conditions, HP, heat and all other game state stay. The same is available to macros: `game.modules.get("lancer-flight-deck").api.cleanup.run()`.

## Checked alongside

Tested in a world running these modules, and by reading their code:

| Module | Result |
|---|---|
| LANCER Alternative Structure | The odds use its tables (tagged ALT TABLE) |
| Lancer QoL | Danger Zone and wrecks are left to it |
| Token Action HUD | Works alongside |
| Lancer Weapon FX | Plays its animations for attacks made from the HUD, the same macros as from the sheet |
| Lancer Ruler Integration | The Movement menu offers *Auto* to hand the mode back to it |
| Enhanced Lancer Status Effects, Lancer Alternative Sheets, Bar Brawl, Token Variant Art | No overlap |

## A first session

1. Try it first in a copy of the world. The README's *Before your first session* takes ten minutes.
2. Let players opt in. Anyone unsure can leave it off; the panel is per player.
3. If anything misbehaves at the table, the player hides the panel and keeps playing from the sheet. Nothing is lost.
4. Afterwards, note anything that surprised you and pass it on: that list is what the next version fixes.
