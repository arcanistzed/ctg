# Changelog

## 0.4.2 - 15 Nov 2021

### Added

* New API docs! Read the [README docs](https://foundryvtt.com/packages/ctg) for details
* Added support for "Roll All" and "Roll NPC" buttons for rolling Group Initiative (now requires libWrapper)

### Fixed

* UI improvements
* Temporary "fix" for [MAT bug](https://github.com/Stendarpaval/mob-attack-tool/issues/46). The groups aren't instantly updated when Mobs are changed if Autosave CTG groups is enabled in MAT.
* Check if MAT is active before trying to get it's settings
* Verify if the mode is valid before grouping

## 0.3.1 - 8 Nov 2021

### Added

* [Mob Attack Tool (MAT)](https://foundryvtt.com/packages/mob-attack-tool) integration:
  * "Mob" mode for sorting by mobs
  * Button to save CTG groups as MAT mobs
* [Lancer Initiative](https://foundryvtt.com/packages/lancer-initiative) integration:
  * "Lancer" mode which sorts based on the activations value
  * Allow rolling group initiative via the small d20 icon when the initiative rolling setting in Lancer Initiative is enabled
* [Combat Utility Belt (CUB)](https://foundryvtt.com/packages/combat-utility-belt) "Hide Actor Names" compatibility for group names
* Hooks for mode update, group update, group selection, and group initiative rolling
* Group by Actor mode which allows you to group together Combatants which are from the same Actor, but have different names (such as when using [Token Mold](https://foundryvtt.com/packages/token-mold))
* Only show relevant modes depending on which modules are active:
  * Show "Mob" mode (see above) if MAT is enabled
  * Show "Lancer" mode (see above) if Lancer Initiative is enabled
  * Hides the "Initiative" mode if the [Simultaneous Combat System](https://foundryvtt.com/packages/scs) module is enabled
* Handle automatically changing the current mode to a valid one if the currently saved mode does not exist (such as when enabling or disabling a module with the mode relevancy feature described above)
* Allow creating selection groups with as little as just one token/combatant
* "Skip over Groups" functionality which makes Foundry skip over the rest of combatants in the group when advancing the turn tracker
* Automatically opening group toggles is now a configurable setting
* Improved the general UI, modeling it after the Core folder styling (the same CSS classes are used to increase compatibility with UI modules) and using v9's CSS variables

### Fixed

* Only group visible combatants

## 0.2.4 - 17 Sept 2021

Fixed an error on some browsers related to using the new `Array.prototype.at()`, replacing it with a polyfill

## 0.2.2 - 16 Sept 2021

* Fixed an error when selecting combatants which aren't in the combat
* Improved performance by updating each combatant less times during selection

## 0.2.1 - 16 Sept 2021

Fix invalid default mode setting

## 0.2.0 - 15 Sept 2021 - Early access

* Added "None", "Selection", and "Player" grouping modes
* New selection tool
* Better layout and styling
* Support for popped out combat trackers
* Localization support
* Various bug fixes

## 0.1.0 - 28 Aug 2021 - Initial Release
