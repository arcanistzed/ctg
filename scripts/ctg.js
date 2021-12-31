import registerKeybindings from "./keybindings.js";
import registerSettings from "./settings.js";

export default class Ctg {
    constructor() {
        Hooks.on("init", () => {
            registerKeybindings();
            registerSettings();
        });

        Hooks.on("ready", () => {
            // Initialize API
            game.modules.get("ctg").api = Ctg;

            // Console art
            console.log(
                `%c${game.i18n.localize("ctg.welcome.name")}`,
                "font-size: 48px; font-family: 'Signika'; text-shadow: 0 0 10px rgb(255, 100, 0)",
                `\n${game.i18n.localize("ctg.welcome.author")}`,
                `\n\n${game.i18n.localize("ctg.welcome.support")}: https://patreon.com/arcanistzed`,
                `\n${game.i18n.localize("ctg.welcome.site")} https://arcanist.me/`
            );

            // Localize modes
            Ctg.MODES = [
                [game.i18n.localize("ctg.modes.none"), ""],
                [game.i18n.localize("ctg.modes.initiative"), "initiative"],
                [game.i18n.localize("ctg.modes.name"), "name"],
                [game.i18n.localize("ctg.modes.selection"), "data.flags.ctg.group"],
                [game.i18n.localize("ctg.modes.players"), "players"],
                [game.i18n.localize("ctg.modes.actor"), "data.actorId"]
            ];

            // Re-render Combat Tracker when mobs update not from autosave (FIXME: a re-render is needed, but is not being included to avoid a MAT bug. See https://github.com/Stendarpaval/mob-attack-tool/issues/40)
            if (game.modules.get("mob-attack-tool")?.active && !game.settings.get("mob-attack-tool", "autoSaveCTGgroups")) Hooks.on("matMobUpdate", () => ui.combat?.render(true));

            // Run group skipping code
            this.groupSkipping();

            // Manage rolling initiative for the whole group at once if GM
            if (game.user?.isGM) this.rollGroupInitiative();

            // Group selection
            this.groupSelection();

            Hooks.on("renderCombatTracker", (app, html, data) => {
                // Exit if there is no combat
                if (!data.combat) return;

                // Create modes if GM
                if (game.user?.isGM) this.createModes(html[0], app.popOut);
                // Create groups
                this.manageGroups(game.settings.get(Ctg.ID, "mode"), app.popOut);

                // Add listener to the mode containers to update settings when changing modes
                if (game.user?.isGM) document.querySelectorAll("#ctg-modeContainer").forEach(el => el.addEventListener("click", event => {
                    const mode = event.target?.id?.replace("ctg-mode-radio-", "").replace("-popOut", "");
                    if (Ctg.MODES.map(m => m[0]).includes(mode)) game.settings.set(Ctg.ID, "mode", mode);
                }));
            });
        });
    };

    /** The module's ID */
    static ID = "ctg";

    /** Grouping Modes
     * The first item is the name and the second is the path
     * @type {string[][]}
     * @property {string} name - The name of the mode
     * @property {string} path - The path to the mode relative to the {@link CombatantData}
     */
    static MODES = [];

    /** Whether the user is currently selecting groups */
    static selectGroups = false;

    /** Whether the user is currently holding down the Group Initiative rolling keybind */
    static groupInitiativeKeybind = false;

    /** Create Groups of Combatants
     * @static
     * @param {string} mode - The current mode
     * @return {Combatant[][]} An array of groups
     */
    static groups(mode) {
        // Exit if invalid mode
        if (!Ctg.MODES.map(m => m[0]).includes(mode)) {
            ui.notifications.error(`${game.i18n.localize("ctg.ID")} | ${game.i18n.format("ctg.notifications.invalidMode", { mode })}`);
            return;
        };

        /** @type {Combatant[][]} */
        let groups;

        // Special behavior for creating groups in Mob mode
        if (mode === "mob") {
            const sortByTurns = (a, b) => game.combat?.turns.indexOf(a) - game.combat?.turns.indexOf(b);
            const alreadyInMob = [];

            // Get groups from MAT mobs
            groups = Object.values(game.settings.get("mob-attack-tool", "hiddenMobList"))
                .map(mob => mob.selectedTokenIds
                    .filter(id => {
                        // Don't add a combatant to more than one group
                        const already = alreadyInMob.includes(id);
                        if (already) ui.notifications.warn(`${game.i18n.localize("ctg.ID")} | ${game.i18n.format("ctg.notifications.alreadyInMob", { id })}`);
                        alreadyInMob.push(id);
                        return !already;
                    }).map(id => canvas.scene.tokens.get(id)?.combatant)) // Get combatants
                .map(arr => arr.sort(sortByTurns).filter(x => x)); // Sort combatants within each group and filter out tokens without combatants
        } else {
            // Get the path for this mode
            const path = Ctg.MODES.find(m => m[0] === mode).slice(-1)[0];

            // Setup turns the default way first to prepare
            game.combat.setupTurns();

            // Reduce combat turns into an array of groups by matching a given property path
            groups = Object.values(game.combat?.turns.reduce((accumulator, current) => {
                if (current.visible) accumulator[getProperty(current, path)] = [...accumulator[getProperty(current, path)] || [], current];
                return accumulator;
            }, {}));
        };

        // Sort each group
        groups.forEach(group => group.sort(this.sortCombatants));
        // If enabled, sort combatant turns
        if (game.settings.get(Ctg.ID, "sortCombatants")) game.combat.turns = game.combat.turns.sort(this.sortCombatants);

        return groups;
    };

    /** Sort the combatants */
    static sortCombatants(a, b) {
        // Sort by the current mode's path
        if (game.settings.get(Ctg.ID, "sortCombatants")) {
            // Get the path for the current mode
            const path = Ctg.MODES.find(m => m[0] === game.settings.get(Ctg.ID, "mode")).slice(-1)[0];

            // Get the values for the two combatants
            let ia = getProperty(a, path);
            let ib = getProperty(b, path);

            // If they are numbers, sort numerically
            if (Number.isNumeric(ia), Number.isNumeric(ib)) {
                const ci = ib - ia;
                if (ci !== 0) return ci;
                return a.id > b.id ? 1 : -1;
            } else if (typeof ia === "object" && typeof ib === "object") {
                // Get the first item if it's an array
                ia = Array.isArray(ia) ? ia[0] : ia;
                ib = Array.isArray(ib) ? ib[0] : ib;
                return ia?.id > ib?.id ? 1 : -1;
            } else if (typeof ia === "string" && typeof ib === "string") {
                // Otherwise, sort alphabetically
                return ia.localeCompare(ib);
            };
            // Fallback to comparing the IDs
            return a?.id > b?.id ? 1 : -1;
        } else { // If disabled, sort by position in the existing turn order
            // FIXME is minus or compare operator?
            return game.combat?.turns.indexOf(a) - game.combat?.turns.indexOf(b);
        };
    };

    /** Get display name of a given group
     * @static
     * @param {Combatant[]} group - The group for which to return a name
     * @return {String} Concatenated display name for this group 
     */
    static getDisplayName(group) {
        /** Names in the current group */
        let names = [];

        // Go through all of the combatants in the group
        group.forEach(combatant => {
            /** The DOM element of this combatant */
            const element = ui.combat.element[0].querySelector(`[data-combatant-id="${combatant?.id}"]`);

            /** The name of this combatant in the Tracker */
            const trackerName = element?.querySelector(".token-name > h4").textContent;

            // Add the name of the current combatant if it is not already
            if (!names.includes(combatant?.name)) names.push((
                // Compatibility with CUB Hide Actor Names: check whether the name is being hidden by CUB
                game.modules.get("combat-utility-belt")?.active && game.settings.get("combat-utility-belt", "enableHideNPCNames")
                && (
                    (game.settings.get("combat-utility-belt", "enableHideHostileNames") && trackerName === game.settings.get("combat-utility-belt", "hostileNameReplacement"))
                    || (game.settings.get("combat-utility-belt", "enableHideNeutralNames") && trackerName === game.settings.get("combat-utility-belt", "neutralNameReplacement"))
                    || (game.settings.get("combat-utility-belt", "enableHideFriendlyNames") && trackerName === game.settings.get("combat-utility-belt", "friendlyNameReplacement"))
                )
                // Add the name in the tracker instead if it has been hidden
            ) ? trackerName : combatant?.name);
        });

        // Return a string with the names
        return names.length < 3 ? names.join(" and ") : names.join(", ");
    }

    /** Manage available modes and switch away from invalid ones */
    manageModes() {
        if (game.modules.get("mob-attack-tool")?.active && !Ctg.MODES.find(m => m[0] === game.i18n.localize("ctg.modes.mob")))
            Ctg.MODES.push([game.i18n.localize("ctg.modes.mob"), ""]);
        if (game.modules.get("lancer-initiative")?.active && !Ctg.MODES.find(m => m[0] === game.i18n.localize("ctg.modes.lancer")))
            Ctg.MODES.push([game.i18n.localize("ctg.modes.lancer"), "activations.value"]);
        if (game.modules.get("scs")?.active)
            Ctg.MODES.findSplice(m => m[0] === "initiative");

        // Change mode if saved one no longer exists
        if (!Ctg.MODES.find(m => m[0] === game.settings.get(Ctg.ID, "mode")))
            game.settings?.set(Ctg.ID, "mode", "none");
    }

    /**
     * Create Combat Tracker modes
     * @param {HTMLElement} html - The Combat Tracker's HTML
     * @param {boolean} popOut - Whether this Combat Tracker is popped out
     */
    createModes(html, popOut) {
        /** Suffix for pop out */
        const popOutSuffix = popOut ? "-popOut" : "";

        /** Create container for mode selection boxes */
        const container = document.createElement("ul"); container.id = "ctg-modeContainer";
        html.querySelector("#combat > #combat-round")?.after(container);

        // For each mode that exists
        Ctg.MODES.forEach(mode => {
            // Add a box
            const modeBox = document.createElement("li"); modeBox.id = "ctg-modeBox";
            container.append(modeBox);

            // Create a radio button
            const radio = document.createElement("input");
            radio.id = "ctg-mode-radio-" + mode[0] + popOutSuffix;
            radio.type = "radio"; radio.name = "ctg-mode-radio" + popOutSuffix;

            // Create a label for the radio button
            const label = document.createElement("label"); label.id = "ctg-modeLabel";
            label.htmlFor = "ctg-mode-radio-" + mode[0] + popOutSuffix;
            label.title = "Group by " + mode[0].capitalize();
            label.innerText = mode[0].capitalize();

            // Add the label and the radio button to the box
            modeBox.append(radio);
            modeBox.append(label);
        });
    };

    /**
     * Manage and create Combat Tracker groups
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
        html?.querySelectorAll("details.ctg-toggle li.combatant").forEach(combatant => html.querySelector("#combat-tracker")?.append(combatant));
        html?.querySelectorAll("details.ctg-toggle").forEach(toggle => toggle.remove());

        // Show current mode if GM and mode is defined
        if (game.user?.isGM && mode) html?.querySelectorAll("#ctg-mode-radio-" + mode + ",#ctg-mode-radio-" + mode + popOutSuffix).forEach(e => e.checked = true);

        if (mode !== "none") {
            // Get groups
            const groups = Ctg.groups(mode);
            // Call group update hook
            Hooks.call("ctgGroupUpdate", groups, mode, popOut);

            // Go through each of the groups
            groups?.forEach((group, index) => {
                /** Toggle element */
                const toggle = document.createElement("details"); toggle.classList.add("ctg-toggle", "directory-item", "folder");

                /** A subdirectory in the toggle which contains Combatants */
                const subdirectory = document.createElement("ol"); subdirectory.classList.add("subdirectory");
                toggle.append(subdirectory);

                // Go through each of the combatants
                group.forEach((combatant, i, arr) => {
                    /** The DOM element of this combatant */
                    const element = html.querySelector(`[data-combatant-id="${combatant.id}"]`);

                    // If it's the last entry
                    if (i === arr.length - 1) {
                        // Add the toggle here
                        element.before(toggle);

                        // Create a label for the toggle
                        const labelBox = document.createElement("summary");
                        labelBox.classList.add("ctg-labelBox");
                        labelBox.classList.add("folder-header");

                        const labelFlex = document.createElement("div");
                        labelFlex.classList.add("ctg-labelFlex");

                        const labelName = document.createElement("h3");
                        labelName.classList.add("ctg-labelName");

                        const labelCount = document.createElement("div");
                        labelCount.classList.add("ctg-labelCount");

                        const labelValue = document.createElement("div");
                        labelValue.classList.add("ctg-labelValue");

                        // Add the group name to the label
                        labelName.innerText = Ctg.getDisplayName(group);

                        // Add the value to the label if not in name mode
                        if (mode === "initiative") labelValue.innerText = getProperty(combatant, Ctg.MODES.find(m => m[0] === mode).slice(-1)[0]);

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
                        // Insert the value into the label flex if there is one
                        if (labelValue.innerText) labelFlex.append(labelValue);

                        if (game.modules.get("mob-attack-tool")?.active) {
                            // Create a button and it to the label flex
                            const saveMob = document.createElement("div"); saveMob.classList.add("ctg-saveMob");
                            saveMob.innerHTML = "<i class='fas fa-save'></i>";
                            saveMob.title = "Save as MAT mob";
                            labelFlex.append(saveMob);

                            saveMob.addEventListener("click", async () => {
                                const groups = Ctg.groups(mode);
                                const actorList = groups[index].map(combatant => combatant.actor);
                                const selectedTokenIds = groups[index].map(combatant => combatant.token.id);
                                const numSelected = groups[index].length;

                                await MobAttacks.saveMob(labelName.innerText, actorList, selectedTokenIds, numSelected);
                            })
                        }
                    };

                    // Move the element into the subdirectory
                    subdirectory.append(element);
                });
            });

            // Get the current toggle
            const currentToggle = html.querySelector(`[data-combatant-id="${game.combat.combatant?.id}"]`)?.parentElement.parentElement;
            // If a the combatant could be found in the DOM
            if (currentToggle && currentToggle.querySelector(".ctg-labelBox")) {
                // Open the toggle for the current combatant if enabled
                if (game.settings.get(Ctg.ID, "openToggles")) currentToggle.open = true;
                currentToggle.classList.add("active");
            };
        };
    };

    /** Manage skipping over groups */
    groupSkipping() {
        // Hook into the combat update to manage skipping    
        Hooks.on("preUpdateCombat", async (document, change) => {
            if (
                (change.turn > document.current.turn  // If this update is for a forward change of turn
                    || (change.turn !== document.turns.length - 1 && document.current.turn === 0)) // Or if anywhere other than the end with a turn of 0
                && game.settings.get(Ctg.ID, "groupSkipping") // If the user has the setting enabled
                && game.settings.get(Ctg.ID, "mode") !== "none" // If the mode is not "none"
                && !change.groupSkipping // If this is not marked as an update from here
            ) {
                // Get the groups
                const groups = Ctg.groups(game.settings.get(Ctg.ID, "mode"));

                // Go through each group and skip to the beginning of the group after the one containing the current combatant
                for (const group of groups) {

                    // If the current combatant is the first in this group
                    if (group.findIndex(c => c.id === document.combatant?.id) === 0) {

                        // Go to the next round if at the end
                        if ((change.turn + group.length - 1) >= document.turns.length) {
                            document.nextRound();
                        };

                        // Mutate the turn change to skip to the start of the next group
                        change.turn = (change.turn + group.length - 1) % document.turns.length;

                        // Mark this as an update from here
                        change.groupSkipping = true;

                        break;
                    };
                };
            };
        });
    };

    /** Manage rolling for group initiative for all of the combatants in the group  */
    rollGroupInitiative() {
        // Verify libWrapper is enabled
        if (!game.modules.get("lib-wrapper")?.active) {
            ui.notifications.warn(`${Ctg.ID} | ${game.i18n.format("ctg.notifications.libWrapperRequired", { feature: game.i18n.localize("ctg.settings.rollGroupInitiative.name") })}`);
            return;
        };

        // FIXME: Temporary fix for Foundry VTT issue: https://gitlab.com/foundrynet/foundryvtt/-/issues/6404
        libWrapper.register("ctg", "KeyboardManager.prototype.hasFocus", () => document.querySelectorAll("input:focus, textarea:focus").length, "OVERRIDE");

        // Check whether group initiative should be rolled
        const isRollForGroupInitiative = () =>
            // Don't roll in "none" mode
            game.settings.get(Ctg.ID, "mode") !== "none"
            // Only Roll if the keybinding is being held down
            && (// Use keybinding in v9d2 and later
                Ctg.groupInitiativeKeybind
                // Otherwise, fallback to the old method
                ?? (game.keyboard._downKeys.has("Control") || game.keyboard._downKeys.has("Shift"))
            );

        // Wrap initiative rolling methods
        libWrapper.register(Ctg.ID, "Combat.prototype.rollAll", groupInitiativeWrapper.bind(null, "rollAll"), "MIXED");
        libWrapper.register(Ctg.ID, "Combat.prototype.rollNPC", groupInitiativeWrapper.bind(null, "rollNPC"), "MIXED");
        libWrapper.register(Ctg.ID, "Combat.prototype.rollInitiative", groupInitiativeWrapper.bind(null, "roll"), "MIXED");

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
                    // Go through all of the groups
                    Ctg.groups(game.settings.get(Ctg.ID, "mode")).forEach(async group => {
                        // What happens depends on the context of this roll:
                        if (context === "rollAll" // Roll for every group
                            || (context === "rollNPC" && group.every(combatant => combatant.isNPC)) // Roll only for groups which are all NPCs 
                            || (context === "roll" && group.some(combatant => combatant.id === id)) // Roll for groups which contain the current combatant
                        ) {
                            // Roll initiative for the first combatant in the group
                            const message = await group[0].getInitiativeRoll().toMessage({ flavor: `"${Ctg.getDisplayName(group)}" group rolls for Initiative!` });

                            // Update all of the combatants in this group with that roll total as their new initiative
                            const updates = [];
                            group.forEach(combatant => updates.push({
                                _id: combatant.id,
                                initiative: message.roll.total,
                            }));

                            // Update the combatants
                            await game.combat?.updateEmbeddedDocuments("Combatant", updates);

                            // Log to console and call hook
                            const who = context === "rollAll" ? " everyone in" : context === "rollNPC" ? " NPCs in" : "";
                            console.log(`${game.i18n.localize("ctg.ID")} | ${game.i18n.format("ctg.rollingGroupInitiative.success", { who: who, group: Ctg.getDisplayName(group) })}`);
                            Hooks.call(`ctg${context.capitalize()}`, updates, message.roll, id);
                        } else {
                            console.log(`${game.i18n.localize("ctg.ID")} | ${game.i18n.format("ctg.rollingGroupInitiative.failure", { group: Ctg.getDisplayName(group) })}`);
                        };
                    });
                });
            } else { wrapped(ids); };
        };
    };

    /** Manage grouping of selected tokens */
    groupSelection() {
        // Scene controls toggle button
        Hooks.on("getSceneControlButtons", controls => {
            // Add a scene control under the tokens menu if GM
            if (game.user?.isGM) controls.find(c => c.name == "token").tools.push({
                name: "groups",
                title: "ctg.selectControl",
                icon: "fas fa-users",
                toggle: true,
                active: Ctg.selectGroups ?? false,
                onClick: toggled => Ctg.selectGroups = toggled,
            });
        });

        // Do grouping whenever the controlled token changes
        Hooks.on("controlToken", (_token, controlled) => {
            // Generate a unique ID
            const uid = randomID(16);

            // If controlling at least one token, a new token is being controlled, and the user is in select groups mode
            if (canvas.tokens.controlled.length > 0 && controlled && Ctg.selectGroups) {
                // Add the same flag to each combatant in batch
                const updates = [];
                canvas.tokens.controlled.forEach(token => {
                    // Check if token is in combat and if the combatant is already in the updates list
                    if (token.inCombat && !updates.some(u => u._id === token.combatant.id)) updates.push({
                        _id: token.combatant.id,
                        ["flags.ctg.group"]: uid
                    });
                });
                game.combat?.updateEmbeddedDocuments("Combatant", updates);

                // Call selection hook
                Hooks.call("ctgSelection", updates);
            };
        });
    };
};

new Ctg();
