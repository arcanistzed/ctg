# Combat Tracker Groups

![Version](https://img.shields.io/github/v/tag/arcanistzed/ctg?label=Version&style=flat-square&color=2577a1) ![Latest Release Download Count](https://img.shields.io/github/downloads/arcanistzed/ctg/latest/module.zip?label=Downloads&style=flat-square&color=9b43a8) ![Supported Foundry Versions](https://img.shields.io/endpoint?url=https://foundryshields.com/version?url=https://raw.githubusercontent.com/arcanistzed/ctg/main/module.json&style=flat-square&color=ff6400) [![Discord Server](https://img.shields.io/badge/-Discord-%232c2f33?style=flat-square&logo=discord)](https://discord.gg/AAkZWWqVav) [![Patreon](https://img.shields.io/badge/-Patreon-%23141518?style=flat-square&logo=patreon)](https://www.patreon.com/bePatron?u=15896855)

Group combatants in the Combat Tracker and roll for group initiative.

<https://user-images.githubusercontent.com/82790112/133531295-f31f0fd0-09aa-48fb-b01e-68cd827ca233.mp4>

## Installation

In the setup screen, use the URL `https://github.com/arcanistzed/ctg/releases/latest/download/module.json` to install the module.

## Usage

After creating a new combat, the combatants in the Combat Tracker will be instantly grouped and put into toggles. The toggles will open when they contain the current combatant unless this is disabled in settings.

### Rolling Group Initiative

This module also allows for an easy way to roll group initiative.
If you hold the `Control` or `Shift` key while rolling the initiative of any of the combatants from the tracker, it will automatically give all of the combatants in the same group the initiative value rolled.
If you use the "Roll All" button, all groups will be rolled for.
If you use the "Roll NPCs" button, all groups with only NPCs will be rolled for.

*Please note that this doesn't work in "None" mode and you **must** roll from the tracker for this to work.*

### Group Skipping

The Group Skipping feature skips over the rest of combatants in the current group when advancing the turn tracker. It's recommended to use this with Combatant Sorting enabled.

### Combatant Sorting

When enabled, CTG attempts to sort combatants by their group which is the optimal order for group skipping. It compares numbers numerically (e.g. in Initiative mode), strings alphabetically (e.g. in Name mode), and the rest by ID (e.g. in Selection mode).

### Grouping modes

The way that the groups are created depends on the selected mode which you can change near the top of the Combat Tracker by clicking on one of the boxes. Here's how each mode works:

#### None

This doesn't apply any groupings.

#### Initiative

*Hidden for the [Simultaneous Combat System](https://foundryvtt.com/packages/scs)*

This is the default mode. Combatants are grouped by their initiative value.

#### Name

Combatants are alphabetically grouped by their name.

#### Selection

Combatants are grouped by a custom selection. You can decide this by using the tool in the Token Scene controls toolbar:

![controls](https://i.imgur.com/3jtS1UI.png)

Once toggled on, whenever you select any tokens in the scene, they'll be added to the same group. It's recommended to toggle this control off after you are satisfied with the groups you've created.

<https://user-images.githubusercontent.com/82790112/133531297-d55892c0-41b3-4117-9f85-be0b2750c32a.mp4>

#### Players

Combatants are grouped by the players that have `Owner` permission for the associated Actor. If multiple players have ownership over an Actor, the associated combatant(s) will be grouped together with any other combatant which the same exact players have ownership over.

#### Actor

Group combatants by their associated Actor which allows you to group together Combatants which are from the same Actor, but have different names (such as when using [Token Mold](https://foundryvtt.com/packages/token-mold)).

#### Mob

*Requires [Mob Attack Tool](https://foundryvtt.com/packages/mob-attack-tool))*

This mode is only shown when Group combatants by MAT's saved mobs.

#### Lancer

*Requires [Lancer Initiative](https://foundryvtt.com/packages/lancer-initiative)*

Group combatants by their [Lancer Initiative](https://foundryvtt.com/packages/lancer-initiative) activations value.

## Module integration

### [Simultaneous Combat System](https://foundryvtt.com/packages/scs)

The "Initiative" mode is hidden when the Simultaneous Combat System module is enabled.

### [Mob Attack Tool](https://foundryvtt.com/packages/mob-attack-tool)

When enabled, a new "Mob" mode is added allowing you to group combatants by their MAT mob.

There is also a button beside each group allowing you to save it as a MAT mob.

### [Combat Utility Belt](https://foundryvtt.com/packages/combat-utility-belt)

When the "Hide Actor Names" functionality of CUB is enabled, the group names reflect the replacement names.

### [Lancer Initiative](https://foundryvtt.com/packages/lancer-initiative)

When enabled, there is a mode which allows you to group combatants by their Lancer Initiative activations value.

When Lancer Initiative's initiative rolling button setting is enabled, you can use it's small d20 icon to roll group initiative as normal.

## API

The module provides various hooks and methods which other developers can use to integrate with the module:

### Hooks

#### `ctgModeUpdate`

Fires whenever the mode is updated with the only argument as the new mode.

#### `ctgGroupUpdate`

Fires whenever the groups are updated with the following arguments: the new groups, the current mode, and whether this update is being done with a popOut Combat Tracker.

#### `ctgSelection`

This fires immediately after a new group is created by selection. The only argument is the array of new Combatant ID & CTG Group ID pairs.

#### `ctgRollAll` / `ctgRollNPC` / `ctgRoll`

These hooks fire whenever group initiative is rolled. The first two are associated with the "Roll All" and "Roll NPCs" header buttons, while the third hook is called when the group initiative roll is triggered for only one group.

The arguments for these hooks are: an array with the Combatant IDs and the new initiative values, the Roll Object, and the IDs of the Combatant(s) who triggered the roll (this is only used for the `ctgRoll` hook).

### Variables & Methods

Among others, these are some useful methods that can be found under `game.modules.get("ctg").api`:

#### `MODES`

An array of grouping modes which are used by the module. You can push or remove items from this in order to create custom or different modes. All items must be arrays and must only have two elements: the name of the mode and followed by the "path" to this data relative to the Combatant.

Ex: You could use this code in order to create a mode called "NPC", allowing Combatants to be grouped by whether ot not they are NPCs:

```js
game.modules.get("ctg").api.MODES.push(["NPC", "isNPC"]);
```

If you think you have a good idea for a grouping mode, feel free to suggest it and it could be added to the module for everyone!

#### `getDisplayName`

This method generates the name which is displayed for a given group (an array of Combatants).

#### `groupInitiativeKeybind`

This boolean tracks whether or not the user is currently holding down the group initiative rolling keybind (the default for that is `SHIFT` or `CONTROL`).

#### `groups`

This method returns the current sorted array of groups (which are arrays of Combatants). You must pass a valid mode when calling this and the groups will be created based on it's path.

#### `selectGroups`

This boolean tracks whether or not to allow groups to be created for the "selection" mode.

## License

Copyright © 2021 arcanist

This package is under an [MIT license](LICENSE) and the [Foundry Virtual Tabletop Limited License Agreement for module development](https://foundryvtt.com/article/license/).

See the [Notice](./NOTICE.md) for attribution details.

## Bugs

You can submit bugs via [Github Issues](https://github.com/arcanistzed/ctg/issues/new/choose) or on [my Discord server](https://discord.gg/AAkZWWqVav).

### Known Issues

- Not currently compatible with the old Group Initiative module or MAT's option which enables that
- Sorting doesn't work with Mob mode
- Lancer Initiative's context menu shows up on the group toggles

## Contact me

Come hang out on my [my Discord server](https://discord.gg/AAkZWWqVav) or [click here to send me an email](mailto:arcanistzed@gmail.com?subject=Combat%20Tracker%20Groups%20module).
