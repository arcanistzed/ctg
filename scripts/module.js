export default class Ctg {
    constructor() {
        Hooks.on("init", () => {
            game.settings.register(Ctg.ID, "mode", {
                scope: "world",
                config: false,
                type: String,
                default: "initiative",
                onChange: mode => this.createGroups(mode),
            });
        });

        Hooks.on("renderCombatTracker", (_app, html, options) => {
            // Exit if there is no combat
            if (!options.combat) return;

            // Create modes if GM
            if (game.user.isGM) this.createModes(html[0]);
            // Create groups
            this.createGroups(game.settings.get(Ctg.ID, "mode"));

            // Add a listener to the mode container if GM
            if (game.user.isGM) document.querySelector("#ctg-modeContainer").addEventListener('click', event => {
                const mode = event.target.id?.replace("ctg-mode-radio-", "");
                if (Ctg.MODES.includes(mode)) game.settings.set(Ctg.ID, "mode", mode);
            });
        });

    };

    /** The module's ID */
    static ID = "ctg";

    /** Grouping Modes */
    static MODES = ["initiative", "name"];

    /**
     * Create Combat Tracker modes
     * @param {HTMLElement} html - The Combat Tracker's HTML
     */
    createModes(html) {
        /** Create container for mode selection boxes */
        const container = document.createElement("ul"); container.id = "ctg-modeContainer";
        html.querySelector("#combat > #combat-round").after(container);

        // For each mode that exists
        Ctg.MODES.forEach(m => {
            // Add a box
            const modeBox = document.createElement("li"); modeBox.id = "ctg-modeBox";
            container.append(modeBox);

            // Create a radio button
            const radio = document.createElement("input"); radio.id = "ctg-mode-radio-" + m;
            radio.type = "radio"; radio.name = "ctg-mode-radio";

            // Create a label for the radio button
            const label = document.createElement("label"); label.id = "ctg-modeLabel";
            label.htmlFor = "ctg-mode-radio-" + m;
            label.title = "Group by " + m.capitalize();
            label.innerText = m.capitalize();

            // Add the label and the radio button to the box
            modeBox.append(radio);
            modeBox.append(label);
        });
    };

    /**
     * Create Combat Tracker groups
     * @param {String} mode - The mode that is currently enabled @see {@link modes}
     */
    createGroups(mode) {
        // Remove any existing groups
        document.querySelectorAll("details.ctg-toggle > li.combatant").forEach(combatant => document.querySelector("#combat-tracker").append(combatant));
        document.querySelectorAll("details.ctg-toggle").forEach(toggle => toggle.remove());

        // Show current mode if GM
        if (game.user.isGM) document.querySelector("#ctg-mode-radio-" + mode).checked = true;

        /** Group combatants into positions */
        const groups = Object.values(game.combat.turns.reduce((accumulator, currentValue) => {
            accumulator[currentValue[mode]] = [...accumulator[currentValue[mode]] || [], currentValue];
            return accumulator;
        }, {}));

        // Create groups
        // Go through each of the groups
        groups.forEach(group => {
            /** Toggle which contains combatants */
            const toggle = document.createElement("details"); toggle.classList.add("ctg-toggle");

            /** Name of the current group */
            let groupNames = [];

            // Go through each of the combatants at this position   
            group.forEach((combatant, i, arr) => {
                /** The DOM element of this combatant */
                const element = document.querySelector(`[data-combatant-id="${combatant.id}"]`);

                // Add the name of the current combatant to the group names if it's not already there
                if (!groupNames.includes(combatant.name)) groupNames.push(combatant.name);

                // If it's the first entry
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
                    labelName.innerText = groupNames.length < 3 ? groupNames.join(" and ") : groupNames.join(", ");
                    // Add the value to the label if not in name mode
                    if (mode !== "name") labelValue.innerText = combatant[mode];
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

new Ctg();
