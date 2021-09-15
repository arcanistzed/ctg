export default class Ctg {
    constructor() {
        Hooks.on("ready", () => {
            game.settings.register(Ctg.ID, "mode", {
                scope: "world",
                config: false,
                type: String,
                default: () => game.i18n.localize("ctg.modes.initiative"),
                onChange: mode => this.manageGroups(mode),
            });

            // Localize modes
            Ctg.MODES = [
                [game.i18n.localize("ctg.modes.none"), ""],
                [game.i18n.localize("ctg.modes.initiative"), "initiative"],
                [game.i18n.localize("ctg.modes.name"), "name"],
                [game.i18n.localize("ctg.modes.selection"), "data.flags.ctg.group"],
                [game.i18n.localize("ctg.modes.players"), "players"]
            ];

            Hooks.on("renderCombatTracker", (app, html, options) => {
                // Exit if there is no combat
                if (!options.combat) return;

                // Create modes if GM
                if (game.user.isGM) this.createModes(html[0], app.popOut);
                // Create groups
                this.manageGroups(game.settings.get(Ctg.ID, "mode"), app.popOut);

                // Add listener to the mode containers to update settings when changing modes
                if (game.user.isGM) document.querySelectorAll("#ctg-modeContainer")
                    .forEach(() => addEventListener('click', event => {
                        const mode = event.target.id?.replace("ctg-mode-radio-", "").replace("-popOut", "");
                        if (Ctg.MODES.map(m => m[0]).includes(mode))
                            game.settings.set(Ctg.ID, "mode", mode);
                    }));

                // Manage rolling initiative for the whole group at once
                this.rollGroupInitiative();
            });
        });

        // Manage group selection
        Hooks.on("getSceneControlButtons", controls => {
            // Add a scene control under the tokens menu if GM
            if (game.user.isGM) controls.find(c => c.name == "token").tools.push({
                name: "groups",
                title: "ctg.selectControl",
                icon: "fas fa-users",
                toggle: true,
                active: Ctg.selectGroups || false,
                onClick: toggled => Ctg.selectGroups = toggled,
            });
        });

        this.groupSelected();
    };

    /** The module's ID */
    static ID = "ctg";

    /** Grouping Modes
     * The first item is the name and the second is the path
     */
    static MODES = [
        ["initiative"],
        ["name"],
        ["selection", "data.flags.ctg.group"]
    ];

    /** Whether the user is currently selecting groups */
    static selectGroups = false;

    /**
     * Create Combat Tracker modes
     * @param {HTMLElement} html - The Combat Tracker's HTML
     * @param {Boolean} popOut - Whether this Combat Tracker is popped out
     */
    createModes(html, popOut) {
        /** Suffix for pop out */
        const popOutSuffix = popOut ? "-popOut" : "";

        /** Create container for mode selection boxes */
        const container = document.createElement("ul"); container.id = "ctg-modeContainer";
        html.querySelector("#combat > #combat-round").after(container);

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
     * @param {String} mode - The mode that is currently enabled @see {@link modes}
     * @param {Boolean} popOut - Whether this Combat Tracker is popped out
     */
    manageGroups(mode, popOut) {
        /** Suffix for pop out */
        const popOutSuffix = popOut ? "-popOut" : "";

        // Remove any existing groups
        document.querySelectorAll("details.ctg-toggle > li.combatant").forEach(combatant => document.querySelector("#combat-tracker").append(combatant));
        document.querySelectorAll("details.ctg-toggle").forEach(toggle => toggle.remove());

        // Show current mode if GM and mode is defined
        if (game.user.isGM && mode) document.querySelectorAll("#ctg-mode-radio-" + mode + ",#ctg-mode-radio-" + mode + popOutSuffix).forEach(e => e.checked = true);

        if (mode !== "none") {
            // Get groups
            const groups = Ctg.groups(mode);
            // Go through each of the groups
            groups.forEach(group => {
                /** Toggle which contains combatants */
                const toggle = document.createElement("details"); toggle.classList.add("ctg-toggle");

                /** Names in the current group */
                let names = [];

                // Go through each of the combatants  
                group.forEach((combatant, i, arr) => {
                    /** The DOM element of this combatant */
                    const element = document.querySelector(`[data-combatant-id="${combatant.id}"]`);

                    // Add the name of the current combatant to the names if it's not already there
                    if (!names.includes(combatant.name)) names.push(combatant.name);

                    // If it's the last entry
                    if (i === arr.length - 1) {
                        // Add the toggle here
                        element.before(toggle);

                        // Create a label for the toggle
                        const labelBox = document.createElement("summary"); labelBox.classList.add("ctg-labelBox");
                        const labelFlex = document.createElement("div"); labelFlex.classList.add("ctg-labelFlex");
                        const labelName = document.createElement("div"); labelName.classList.add("ctg-labelName");
                        const labelCount = document.createElement("div"); labelCount.classList.add("ctg-labelCount");
                        const labelValue = document.createElement("div"); labelValue.classList.add("ctg-labelValue");

                        // Add the group name to the label
                        labelName.innerText = names.length < 3 ? names.join(" and ") : names.join(", ");
                        // Add the value to the label if not in name mode
                        if (mode === "initiative") labelValue.innerText = getProperty(combatant, Ctg.MODES.find(m => m[0] === mode).at(-1));
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
                        // Insert the value into the label flex
                        labelFlex.append(labelValue);
                    };

                    // Move the element into the toggle
                    toggle.append(element);
                });
            });

            // Get the current toggle
            const currentToggle = document.querySelector(`[data-combatant-id="${game.combat.current.combatantId}"]`)?.parentElement
            // If a the combatant could be found in the DOM
            if (currentToggle) {
                // Open the toggle for the current combatant
                currentToggle.open = true;
                // Darken the current toggle's label box
                currentToggle.querySelector(".ctg-labelBox").style.filter = "brightness(0.5)";
            };
        };
    };

    /** Group Combatants
     * @static
     * @param {String} mode - The current mode
     * @return {Array} An array of groupings  
     * @memberof Ctg
     */
    static groups(mode) {
        // Get the path for this mode
        const path = Ctg.MODES.find(m => m[0] === mode).at(-1);
        return Object.values(game.combat.turns.reduce((accumulator, current) => {
            accumulator[getProperty(current, path)] = [...accumulator[getProperty(current, path)] || [], current];
            return accumulator;
        }, {}));
    };

    /** Manage grouping of selected tokens */
    groupSelected() {
        // Whenever the controlled token changes
        Hooks.on("controlToken", (_token, controlled) => {
            // Generate a unique ID
            const uid = randomID(16);

            // If controlling more than one token, a new token is being controlled, and the user is in select groups mode
            if (canvas.tokens.controlled.length > 1 && controlled && Ctg.selectGroups) {

                // Add the same flag to each combatant in batch
                let updates = [];
                canvas.tokens.controlled.forEach(token => {
                    updates.push({
                        _id: token.combatant.id,
                        ["flags.ctg.group"]: uid
                    });
                });
                game.combat.updateEmbeddedDocuments("Combatant", updates);
            };
        });
    };

    /** Manage rolling for group initiative for all of the combatants in the group
     * @memberof Ctg
     */
    rollGroupInitiative() {
        // Listen for if any of the roll initiative buttons are clicked
        document.querySelectorAll(".combatant-control.roll").forEach(el => el.onpointerdown = ev => {
            console.log(ev, ev.button, ev.ctrlKey, ev.shiftKey)
            if (ev.ctrlKey || ev.shiftKey) {

                // Get the ID of the combatant
                const id = ev.currentTarget.closest(".combatant").dataset.combatantId;

                // The next time the combatant is updated
                Hooks.once("updateCombatant", async (_app, change) => {
                    // If this was a change to their initiative
                    if (change.initiative) {
                        let updates = [];

                        // Go through the list of the groups
                        Ctg.groups(game.settings.get(Ctg.ID, "mode")).forEach(group => {
                            // Go through each group that contains this combatant
                            if (group.some(combatant => combatant.id === id)) group.forEach(combatant => {
                                // Give all of the combatants in this group the new initiative value
                                updates.push({
                                    _id: combatant.id,
                                    initiative: change.initiative
                                });
                            });
                        });

                        // Update the combatants
                        await game.combat.updateEmbeddedDocuments("Combatant", updates);
                    };
                });
            };
        });
    };
};

globalThis.Ctg = Ctg;

new Ctg;
