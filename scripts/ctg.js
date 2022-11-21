import { recursiveGetPropertyConcat, getDisplayName, resizePopout } from "./helpers.js";
import ModeConfig from "./modeConfig.js";
import registerKeybindings from "./keybindings.js";
import registerSettings from "./settings.js";

export default class Ctg {
	constructor() {
		Hooks.on("init", () => {
			// Initialize keybindings
			registerKeybindings();
			// Register settings
			registerSettings();
		});

		// Patch for v9 users to avoid stacked tabs foundryvtt/foundryvtt#7420
		Hooks.on("renderSidebarTab", () => ui.sidebar.activateTab(ui.sidebar.activeTab));

		// Register for DevMode
		Hooks.once("devModeReady", ({ registerPackageDebugFlag }) => {
			registerPackageDebugFlag(Ctg.ID);
		});

		Hooks.on("ready", () => {
			// Console art
			console.log(
				`%c${game.i18n.localize("ctg.welcome.name")}`,
				"font-size: 48px; font-family: 'Signika'; text-shadow: 0 0 10px rgb(255, 100, 0)",
				`\n${game.i18n.localize("ctg.welcome.author")}`,
				`\n\n${game.i18n.localize("ctg.welcome.support")}: https://patreon.com/arcanistzed`,
				`\n${game.i18n.localize("ctg.welcome.site")} https://arcanist.me/`
			);

			// Initialize API
			game.modules.get(Ctg.ID).api = mergeObject(Ctg, {
				recursiveGetPropertyAsString: recursiveGetPropertyConcat,
				getDisplayName,
				resizePopout,
				ModeConfig,
			});

			// Update stored version
			game.settings.set(Ctg.ID, "version", game.modules.get(Ctg.ID).data.version);

			// Re-render Combat Tracker when mobs update
			if (game.modules.get("mob-attack-tool")?.active) {
				Hooks.on("matMobUpdate", () => {
					// FIXME: a re-render is needed, but is not being included to avoid a MAT incompatibility
					// Stendarpaval/mob-attack-tool#40
					if (!game.settings.get("mob-attack-tool", "autoSaveCTGgroups")) ui.combat?.render(true);
				});
			}

			// Manage rolling group initiative if GM
			if (game.user?.isGM) {
				this.rollGroupInitiative();
			} else {
				// Hide keybindings for everyone else
				const style = document.createElement("style");
				style.innerHTML = `
                #keybindings .ctg {
                    display: none;
                }`;
				document.head.appendChild(style);
			}

			Hooks.on("renderCombatTracker", async (app, [html], data) => {
				// Exit if there is no combat
				if (!data.combat) return;

				// Manage and create modes if GM
				if (game.user?.isGM) {
					await Ctg.manageModes();
					this.createModes(html, app.popOut);
				}
				// Create groups
				this.manageGroups(game.settings.get(Ctg.ID, "mode"), app.popOut);

				// Checked mode
				if (game.settings.get(Ctg.ID, "mode") === "checked") {
					// Create checkboxes nest to each combatant
					html.querySelectorAll(".combatant").forEach(el => {
						const input = document.createElement("input");
						input.type = "checkbox";
						input.classList.add("ctg");
						el.prepend(input);
						// Get initial state
						input.checked = game.combat.combatants.get(el.dataset.combatantId).getFlag(Ctg.ID, "checked");
					});

					// Update combatant flags when a checkbox is clicked
					html.addEventListener("click", ({ target }) => {
						if (!target.matches("input[type='checkbox'].ctg")) return;
						const id = target.closest(".combatant").dataset.combatantId;
						if (game.user.isGM) game.combat.combatants.get(id).setFlag(Ctg.ID, "checked", target.checked);
						// Proxy to GM
						else game.socket.emit("module.ctg", { id, checked: target.checked });
					});
				}

				// For debugging: expand all groups and show turn order
				if (game.modules.get("_dev-mode")?.api?.getPackageDebugValue(Ctg.ID)) {
					html.querySelectorAll("details.ctg-toggle").forEach(el => (el.open = true));
					html.querySelectorAll("li.combatant").forEach(el =>
						el.append(game.combat.turns.findIndex(t => t.id === el.dataset.combatantId))
					);
					ui.sidebar.activateTab("combat");
				}
			});

			// Re-render the combat tracker in case the initial render was missed
			ui.combat.render(true);

			// Manage proxied changes
			if (game.user?.isGM) {
				game.socket.on("module.ctg", ({ id, checked }) => {
					// If the logged in user is the active GM with the lowest user id
					const isResponsibleGM = game.users
						.filter(user => user.isGM && user.active)
						.some(other => other.id <= game.user.id);
					console.log(isResponsibleGM, id, checked);
					if (!isResponsibleGM) return;
					game.combat.combatants.get(id).setFlag(Ctg.ID, "checked", checked);
				});
			}
		});

		// Run group skipping code
		this.groupSkipping();

		// Group selection
		this.groupSelection();
	}

	/** The module's ID */
	static ID = "ctg";

	/** DevMode logging helper
	 * @param {boolean} force - Whether to force logging
	 * @param {*} args - Arguments to log
	 */
	static log(force, ...args) {
		const shouldLog = force || game.modules.get("_dev-mode")?.api?.getPackageDebugValue(Ctg.ID);
		if (shouldLog) {
			console.log(game.i18n.localize("ctg.ID"), "|", ...args);
		}
	}

	/** Grouping Modes
	 * The first item is the name and the second is the path
	 * @type {string[][]}
	 * @property {string} name - The name of the mode
	 * @property {string} path - The path to the mode relative to the {@link CombatantData}
	 */
	static get MODES() {
		return game.settings.get(Ctg.ID, "modes");
	}
	static set MODES(value) {
		game.settings.set(Ctg.ID, "modes", value);
	}
	/** Update the grouping modes asynchronously
	 * @see MODES
	 * @param {string[][]} value - An array of modes
	 * @returns {Promise<string[][]>} The new modes
	 */
	static async setMODES(value) {
		return game.settings.set(Ctg.ID, "modes", value);
	}

	/** Whether the user is currently holding down the Group Initiative rolling keybind
	 * @type {boolean}
	 */
	static groupInitiativeKeybind = false;

	/** Create Groups of Combatants
	 * @param {string} mode - The current mode
	 * @returns {Combatant[][]} An array of groups
	 */
	static groups(mode) {
		/** @type {Combatant[][]} */
		let groups;

		// Exit if invalid mode
		if (!Ctg.MODES.map(m => m[0]).includes(mode)) {
			ui.notifications.error(
				`${game.i18n.localize("ctg.ID")} | ${game.i18n.format("ctg.notifications.invalidMode", { mode })}`
			);
			return;
		}

		// Special behavior for creating groups in Mob mode
		if (mode === "mob") {
			if (!game.modules.get("mob-attack-tool")?.active) {
				ui.notifications.warn(
					`${game.i18n.localize("ctg.ID")} | ${game.i18n.localize("ctg.notifications.mobModeRequiresMAT")}`
				);
				return;
			}

			const sortByTurns = (a, b) => game.combat?.turns.indexOf(a) - game.combat?.turns.indexOf(b);
			const alreadyInMob = [];

			// Get groups from MAT mobs
			groups = Object.values(game.settings.get("mob-attack-tool", "hiddenMobList"))
				.map(mob =>
					mob.selectedTokenIds
						.filter(id => {
							// Don't add a combatant to more than one group
							const already = alreadyInMob.includes(id);
							if (already) {
								console.warn(
									`${game.i18n.localize("ctg.ID")} | ${game.i18n.format(
										"ctg.notifications.alreadyInMob",
										{ id }
									)}`
								);
							}
							alreadyInMob.push(id);
							return !already;
						})
						.map(id => canvas.scene?.tokens.get(id)?.combatant)
				) // Get combatants
				.map(arr => arr.sort(sortByTurns).filter(x => x)); // Sort combatants within each group and filter out tokens without combatants
		} else {
			// Get the path for this mode
			const path = Ctg.MODES.find(m => m[0] === mode).slice(-1)[0];

			// Reduce combat turns into an array of groups by matching a given property path
			groups = Object.values(
				game.combat?.turns.reduce((accumulator, current) => {
					const value = recursiveGetPropertyConcat(current, path);

					// Conditions for not grouping:
					if (
						current.visible &&
						value &&
						!(game.settings.get(Ctg.ID, "noGroupHidden") && current.hidden) &&
						!(game.settings.get(Ctg.ID, "noGroupPCs") && current.hasPlayerOwner)
					) {
						// Group by the property
						accumulator[value] = [...(accumulator[value] || []), current];
					}
					return accumulator;
				}, {})
			).reverse();
		}

		groups = groups
			.map(group => group.sort(this.sortCombatants)) // Sort each group
			.sort((a, b) => this.sortCombatants(a[0], b[0])); // Sort by the first combatant
		game.combat.turns.sort(this.sortCombatants);

		Ctg.log(false, "Groups have been recalculated:", groups);
		return groups;
	}

	/** Sort the combatants
	 * @param {Combatant} a
	 * @param {Combatant} b
	 * @returns {1 | -1} 1 if a should go before b, -1 if b should go before a
	 */
	static sortCombatants(a, b) {
		// Sort by the current mode's path
		if (game.settings.get(Ctg.ID, "sortCombatants")) {
			// Get the path for the current mode
			const path = Ctg.MODES.find(m => m[0] === game.settings.get(Ctg.ID, "mode")).slice(-1)[0];

			// Get the values for the two combatants
			let ia = recursiveGetPropertyConcat(a, path);
			let ib = recursiveGetPropertyConcat(b, path);

			if (typeof ia === "boolean" && typeof ib === "boolean") {
				return ia ? 1 : -1;
			} else if (Number.isNumeric(ia) && Number.isNumeric(ib)) {
				const ci = ib - ia;
				if (ci !== 0) return ci;
			} else if (typeof ia === "object" && typeof ib === "object") {
				// Get the first item if it's an array
				ia = Array.isArray(ia) ? ia[0] : ia;
				ib = Array.isArray(ib) ? ib[0] : ib;
				return ia?.id > ib?.id ? 1 : -1;
			} else if (typeof ia === "string" && typeof ib === "string") {
				if (/[A-Za-z0-9]{16}/.test(ia) && /[A-Za-z0-9]{16}/.test(ib)) {
					// Sort by initiative if they are IDs
					const ci = b?.initiative - a?.initiative;
					if (ci !== 0) return ci;
				} else {
					// Otherwise, sort alphabetically
					return ia.localeCompare(ib);
				}
			}
			// Fallback to comparing the IDs
			return a?.id > b?.id ? 1 : -1;
		} else {
			// If disabled, sort by the default order
			return game.combat?._sortCombatants(a, b);
		}
	}

	/** Manage available modes and switch away from invalid ones
	 * @param {boolean} reset - Whether to reset the modes to default
	 */
	static async manageModes(reset = false) {
		if (!game.user.isGM) return;

		// Get current modes
		let modes = Ctg.MODES;

		// Reset to default
		if (reset) modes = game.settings.settings.get(`${Ctg.ID}.modes`).default;

		// Add integrations
		if (game.modules.get("mob-attack-tool")?.active && !modes.find(m => m[0] === "mob")) modes.push(["mob", ""]);
		if (game.modules.get("lancer-initiative")?.active && !modes.find(m => m[0] === "lancer")) {
			modes.push(["lancer", "activations.value"]);
		}
		if (game.modules.get("scs")?.active) modes.findSplice(m => m[0] === "initiative");

		// Change mode if saved one no longer exists
		if (!modes.find(m => m[0] === game.settings.get(Ctg.ID, "mode"))) game.settings?.set(Ctg.ID, "mode", "none");

		// Update modes
		await Ctg.setMODES(modes);
	}

	/** Create Combat Tracker modes
	 * @param {HTMLElement} html - The Combat Tracker's HTML
	 * @param {boolean} popOut - Whether this Combat Tracker is popped out
	 */
	createModes(html, popOut) {
		/** Suffix for pop out */
		const popOutSuffix = popOut ? "-popOut" : "";

		/** Create container for mode selection boxes */
		const container = document.createElement("ul");
		container.id = "ctg-modeContainer";
		const combatRoundContainer =
				 html.querySelector('.combat-sidebar .combat-tracker-header') // v10
			|| html.querySelector('#combat > #combat-round') // v9
		combatRoundContainer?.after(container);

		// For each mode that exists
		Ctg.MODES.forEach(mode => {
			// Add a box
			const modeBox = document.createElement("li");
			modeBox.id = "ctg-modeBox";
			container.append(modeBox);

			// Create a radio button
			const radio = document.createElement("input");
			radio.id = `ctg-mode-radio-${mode[0]}${popOutSuffix}`;
			radio.type = "radio";
			radio.name = `ctg-mode-radio${popOutSuffix}`;

			// Create a label for the radio button
			const label = document.createElement("label");
			label.id = "ctg-modeLabel";
			label.htmlFor = `ctg-mode-radio-${mode[0]}${popOutSuffix}`;
			label.title = game.i18n.format("ctg.titles.groupBy", { mode: mode[0].capitalize() });
			label.innerText = mode[0].capitalize();

			// Add the label and the radio button to the box
			modeBox.append(radio);
			modeBox.append(label);
		});

		// Update mode on click
		container.addEventListener("click", ({ target }) => {
			const mode = target?.id?.replace("ctg-mode-radio-", "").replace("-popOut", "");
			if (Ctg.MODES.map(m => m[0]).includes(mode)) game.settings.set(Ctg.ID, "mode", mode);
		});
	}

	/** Manage and create Combat Tracker groups
	 * @param {string} mode - The mode that is currently enabled @see {@link modes}
	 * @param {boolean} popOut - Whether this Combat Tracker is popped out
	 */
	manageGroups(mode, popOut) {
		// If trying to use the pop out, check if one actually exists first
		if (popOut && !document.querySelector("#combat-popout")) return;

		/** Suffix for pop out */
		const popOutSuffix = popOut ? "-popOut" : "";

		/** The current parent html element */
		const html = popOut ? document.querySelector("#combat-popout") : document.querySelector("#combat");

		// Remove any existing groups
		html?.querySelectorAll("details.ctg-toggle li.combatant").forEach(combatant =>
			html.querySelector("#combat-tracker")?.append(combatant)
		);
		html?.querySelectorAll("details.ctg-toggle").forEach(toggle => toggle.remove());

		// Show current mode if GM and mode is defined
		if (game.user?.isGM && mode) {
			html?.querySelectorAll(`#ctg-mode-radio-${mode},#ctg-mode-radio-${mode}${popOutSuffix}`).forEach(
				el => (el.checked = true)
			);
		}

		// Don't group if mode is None or if onlyShowGroupsForGM is enabled and this is not a GM
		if (!(mode === "none" || (game.settings.get(Ctg.ID, "onlyShowGroupsForGM") && !game.user?.isGM))) {
			// Get groups
			const groups = Ctg.groups(mode);
			// Call group update hook
			Hooks.call("ctgGroupUpdate", groups, mode, popOut);

			// Go through each of the groups
			groups?.forEach((group, index) => {
				/** Toggle element */
				const toggle = document.createElement("details");
				toggle.classList.add("ctg-toggle", "folder");

				/** A subdirectory in the toggle which contains Combatants */
				const subdirectory = document.createElement("ol");
				subdirectory.classList.add("subdirectory");
				toggle.append(subdirectory);

				// Go through each of the combatants
				group.forEach((combatant, i, arr) => {
					/** The DOM element of this combatant */
					const element = html.querySelector(`[data-combatant-id="${combatant.id}"]`);

					// If it's the last entry
					if (i === arr.length - 1) {
						// Add the toggle to the end
						html.querySelector("#combat-tracker").append(group.length > 1 ? toggle : element);

						// Create a label for the toggle
						const labelBox = document.createElement("summary");
						labelBox.classList.add("ctg-labelBox", "folder-header");

						const labelFlex = document.createElement("div");
						labelFlex.classList.add("ctg-labelFlex");

						const labelName = document.createElement("h3");
						labelName.classList.add("ctg-labelName", "noborder");

						const labelCount = document.createElement("div");
						labelCount.classList.add("ctg-labelCount");

						const labelValue = document.createElement("div");
						labelValue.classList.add("ctg-labelValue");

						// Add the group name to the label
						labelName.innerText = getDisplayName(group);

						// Get the value of this mode on the combatant
						const value = recursiveGetPropertyConcat(
							combatant,
							Ctg.MODES.find(m => m[0] === mode).slice(-1)[0]
						);
						if (
							value && // must exist
							value !== true && // must not be literally `true`
							!String(value).match(/[A-Za-z0-9]{16}/) && // must not be an ID
							!["name", "initiative"].includes(mode) // must not be in "Name" or "Initiative" mode
						) {
							// Add the value to the label
							labelValue.innerText = value;
						}

						// Add the count to the label
						labelCount.innerText = arr.length;

						// Insert the label box
						toggle.prepend(labelBox);
						// Insert the label flex into the label box
						labelBox.prepend(labelFlex);
						// Insert the name into the label flex
						labelFlex.prepend(labelName);
						// Insert the count into the label flex
						labelFlex.append(labelCount);
						// If there is a value label
						if (labelValue.innerText) {
							// If there is a toggle, insert the value into the label flex
							if (group.length > 1) labelFlex.append(labelValue);
							// If there is no toggle, add the value to the element itself
							else element.querySelector(".token-name").after(labelValue);
						}

						if (game.modules.get("mob-attack-tool")?.active) {
							/* global MobAttacks */

							// Create a button and it to the label flex
							const saveMob = document.createElement("div");
							saveMob.classList.add("ctg-saveMob");
							saveMob.innerHTML = "<i class='fas fa-save'></i>";
							saveMob.title = game.i18n.localize("ctg.titles.saveAsMob");
							labelFlex.append(saveMob);

							// Create a mob when the button is clicked
							/*
							FIXME: ask Lupusmalus for new parameter to not delete existing mobs, then use this instead:
							saveMob.addEventListener("click", () => MobAttacks.createSavedMobsFromCTGgroups([Ctg.groups(mode)[index]]));
							*/
							saveMob.addEventListener("click", event => {
								event.preventDefault();
								const actorList = [],
									numSelected = 1,
									selectedTokenIds = [];
								const mobName = `${game.settings.get("mob-attack-tool", "defaultMobPrefix")} ${
									Ctg.groups(mode)[index]?.[0]?.name
								}${game.settings.get("mob-attack-tool", "defaultMobSuffix")}`;
								for (const combatant of Ctg.groups(mode)[index]) {
									actorList.push(combatant?.actor);
									selectedTokenIds.push(combatant.data?.tokenId);
								}
								MobAttacks.saveMob(mobName, actorList, selectedTokenIds, numSelected, Ctg.ID);
							});
						}

						// Whenever toggled, resize the popout combat tracker window
						toggle.addEventListener("toggle", resizePopout);
					}

					// Move the element into the subdirectory if there is one
					if (group.length > 1) subdirectory.append(element);
				});
			});

			// Get the current toggle
			const currentToggle = html
				.querySelector(`[data-combatant-id="${game.combat.combatant?.id}"]`)
				?.closest("details");
			// If a the combatant could be found in the DOM
			if (currentToggle && currentToggle.querySelector(".ctg-labelBox")) {
				// Open the toggle for the current combatant if enabled
				if (game.settings.get(Ctg.ID, "openToggles")) currentToggle.open = true;
				currentToggle.classList.add("active");
				Ctg.log(false, currentToggle, game.combat.combatant?.id);
			}

			// Resize popout window
			resizePopout();
		}
	}

	/** Manage skipping over groups */
	groupSkipping() {
		// Hook into the combat update to manage skipping
		Hooks.on("preUpdateCombat", async (document, change) => {
			// Get the groups
			const groups = Ctg.groups(game.settings.get(Ctg.ID, "mode"));

			if (
				game.user?.isGM && // If the user is a GM
				change.turn != null && // If there was a change of turn
				game.settings.get(Ctg.ID, "groupSkipping") && // If the user has the setting enabled
				game.settings.get(Ctg.ID, "mode") !== "none" && // If the mode is not "none"
				groups.length > 1 // If there is more than one group
			) {
				// Get the direction of the turn change which is different if the round has also changed
				const direction = change.round
					? change.round > document.current.round
						? 1
						: -1
					: change.turn > document.current.turn
					? 1
					: -1;

				// Get the turn of the first turn in each group
				const firstTurns = groups.map(group => document.turns.findIndex(c => c.id === group[0].id));

				// Get the index of the current first turn in the list of first turns
				// If this isn't a first turn, keep it undefined
				const indexOfCurrent =
					firstTurns.indexOf(document.turn) !== -1 ? firstTurns.indexOf(document.turn) : undefined;

				// Get turn of the next first turn after the current one
				const nextTurn = firstTurns?.[indexOfCurrent + direction] ?? firstTurns.at(direction === 1 ? 0 : -1); // Loop to the start or end of the list if necessary

				// Mutate the turn change to skip to the next turn
				change.turn = nextTurn;

				Ctg.log(
					false,
					`Group skipping...\nNext turn: ${nextTurn}\nFirst turns: ${firstTurns} currently at ${indexOfCurrent}\nDirection: ${
						direction === 1 ? "forward" : "backward"
					}\n`
				);
			}
		});
	}

	/** Manage rolling for group initiative for all of the combatants in the group  */
	rollGroupInitiative() {
		// Verify libWrapper is enabled
		if (!game.modules.get("lib-wrapper")?.active) {
			ui.notifications.warn(
				`${Ctg.ID} | ${game.i18n.format("ctg.notifications.libWrapperRequired", {
					feature: game.i18n.localize("ctg.settings.rollGroupInitiative.name"),
				})}`
			);
			return;
		}

		/* global libWrapper */

		// Check whether group initiative should be rolled
		const isRollForGroupInitiative = () =>
			// Don't roll in "none" mode
			game.settings.get(Ctg.ID, "mode") !== "none" &&
			// Allow always rolling group initiative
			(game.settings.get(Ctg.ID, "alwaysRollGroupInitiative") ||
				// By default, only roll if the keybinding is being held down
				Ctg.groupInitiativeKeybind);

		// Wrap initiative rolling methods
		libWrapper.register(Ctg.ID, "Combat.prototype.rollAll", groupInitiativeWrapper.bind(null, "rollAll"), "MIXED");
		libWrapper.register(Ctg.ID, "Combat.prototype.rollNPC", groupInitiativeWrapper.bind(null, "rollNPC"), "MIXED");
		libWrapper.register(
			Ctg.ID,
			"Combat.prototype.rollInitiative",
			groupInitiativeWrapper.bind(null, "roll"),
			"MIXED"
		);

		/** Wrapper for group initiative
		 * @param {string} context - The type of group initiative roll being made
		 * @param {Function} wrapped - The wrapped function
		 * @param {string[]} [ids=[""]] - An array containing the Combatant IDs passed to `rollInitiative`
		 */
		function groupInitiativeWrapper(context, wrapped, ids = [""]) {
			// Check if this is a roll for Group Initiative
			if (isRollForGroupInitiative()) {
				// Loop through the IDs in case there are multiple (should be unusual)
				ids.forEach(id => {
					// Go through all of the groups and count failures
					const failures = Ctg.groups(game.settings.get(Ctg.ID, "mode")).filter(async (group, index) => {
						// What happens depends on the context of this roll:
						if (
							context === "rollAll" || // Roll for every group
							(context === "rollNPC" && group.every(combatant => combatant.isNPC)) || // Roll only for groups which are all NPCs
							(context === "roll" && group.some(combatant => combatant.id === id)) // Roll for groups which contain the current combatant
						) {
							// Roll initiative for the first combatant in the group
							const message = await group[0].getInitiativeRoll().toMessage({
								flavor: `"${getDisplayName(group)}" group rolls for Initiative!`, // Announce to chat
								sound: index === 0 ? CONFIG.sounds.dice : null, // Only play a sound for the first group
							});

							// Update all of the combatants in this group with that roll total as their new initiative
							const updates = [];
							group.forEach(combatant =>
								updates.push({
									_id: combatant.id,
									initiative: message.roll.total,
								})
							);

							// Update the combatants
							await game.combat?.updateEmbeddedDocuments("Combatant", updates);

							// Log to console and call hook
							const who =
								context === "rollAll" ? " everyone in" : context === "rollNPC" ? " NPCs in" : "";
							Ctg.log(
								false,
								game.i18n.format("ctg.rollingGroupInitiative.success", {
									who,
									group: getDisplayName(group),
								})
							);
							Hooks.call(`ctg${context.capitalize()}`, updates, message.roll, id);
							return false;
						} else {
							Ctg.log(
								false,
								game.i18n.format("ctg.rollingGroupInitiative.failure", { group: getDisplayName(group) })
							);
							return true;
						}
					});

					if (failures.length > 0) {
						wrapped(ids);
					}
				});
			} else {
				wrapped(ids);
			}
		}

		// Disable MAT group initiative
		if (game.modules.get("mob-attack-tool")?.active) {
			function disableMATGroupInitiative() {
				if (game.settings.get("mob-attack-tool", "enableMobInitiative")) {
					ui.notifications.warn(
						`${Ctg.ID} | ${game.i18n.localize("ctg.notifications.disableMATGroupInitiative")}`
					);
					game.settings.set("mob-attack-tool", "enableMobInitiative", false);
				}
			}
			game.settings.settings.get("mob-attack-tool.enableMobInitiative").onChange = disableMATGroupInitiative;
			disableMATGroupInitiative();
		}
	}

	/** Manage grouping of selected tokens */
	groupSelection() {
		// Scene controls toggle button
		Hooks.on("getSceneControlButtons", controls => {
			// Add a scene control under the tokens menu if GM
			if (game.user?.isGM) {
				controls
					.find(c => c.name === "token")
					.tools.push({
						name: "groups",
						title: "ctg.selectControlTitle",
						icon: "fas fa-users",
						onClick: () => {
							// Activate the default selection tool instead
							ui.controls.control.activeTool = "select";
							ui.controls.render();

							// Generate a unique ID
							const uid = randomID(16);

							// Unset the flag if all controlled tokens have the same non-nullish value
							const values = new Set(
								canvas.tokens.controlled
									.filter(token => token.combatant)
									.map(token => token.combatant?.getFlag(Ctg.ID, "group") ?? null)
							);
							const unset = values.size === 1 && !values.has(null);

							// Update the flag on each combatant whose token is controlled
							const updates = [];
							canvas.tokens.controlled.forEach(token => {
								// Check if token is in combat and if the combatant is already in the updates list
								if (token.inCombat && !updates.some(u => u._id === token.combatant.id)) {
									updates.push({
										_id: token.combatant.id,
										[`flags.${Ctg.ID}.group`]: unset ? null : uid,
									});
								}
							});
							game.combat?.updateEmbeddedDocuments("Combatant", updates);

							// Call selection hook
							Hooks.call("ctgSelection", updates);

							ui.notifications.info(
								game.i18n.format("ctg.notifications.groupSelection", {
									action: unset
										? game.i18n.localize("ctg.actions.removed")
										: game.i18n.localize("ctg.actions.created"),
									count: updates.length,
								})
							);
						},
					});
			}
		});
	}
}

new Ctg();
