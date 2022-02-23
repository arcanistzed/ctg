import Ctg from "./ctg.js";

export default class ModeConfig extends FormApplication {
    /** @inheritdoc */
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: "ctg-modeConfig",
            title: game.i18n.localize("ctg.modeConfig.title"),
            template: "modules/ctg/templates/modeConfig.hbs",
            classes: ["ctg", "sheet", "modeConfig"],
            closeOnSubmit: false,
            submitOnClose: true,
        });
    }

    /** @inheritdoc */
    getData() {
        return {
            modes: Ctg.MODES,
        }
    }

    /** @inheritdoc */
    activateListeners(html) {
        super.activateListeners(html);
        html[0].querySelector(".create").addEventListener("click", this._create.bind(this));
        html[0].querySelectorAll(".delete").forEach(el => el.addEventListener("click", this._delete.bind(this)));
        html[0].querySelector(".reset").addEventListener("click", this._reset.bind(this));
    }

    _create(_event) {
        const i = parseInt(document.querySelector("#ctg-modeConfig .mode:last-child").dataset.index) + 1;

        const modeRow = document.createElement("li");
        modeRow.classList.add("mode", "flexrow");
        modeRow.dataset.index = i;

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.classList.add("mode-name");
        nameInput.name = `modes.${i}.0`;

        const pathInput = document.createElement("input");
        pathInput.type = "text";
        pathInput.classList.add("mode-path");
        pathInput.name = `modes.${i}.1`;

        const deleteButton = document.createElement("a");
        deleteButton.title = "Delete Mode";
        deleteButton.innerHTML = `<i class="fas fa-trash fa-fw"></i>`;
        deleteButton.addEventListener("click", this._delete.bind(this));

        modeRow.append(nameInput, pathInput, deleteButton);
        document.querySelector("#ctg-modeConfig ol").append(modeRow);

        // Adjust the app size
        this.setPosition({ height: "auto" });
    }

    _delete(event) {
        // Remove the current mode row
        event.currentTarget.closest(".mode").remove();

        // Adjust the app size
        this.setPosition({ height: "auto" });
    }

    _reset(_event) {
        // Re-render to discard changes and adjust the app size
        this.render(true, { height: "auto" });
    }

    /** @inheritdoc */
    async _updateObject(_event, formData) {
        console.log(formData);
        // Update the Modes with the form data
        const modes = Object.values(expandObject(formData)).map(o => Object.values(o).map(o => Object.values(o)))[0]
        await game.settings.set(Ctg.ID, "modes", modes); // FIXME should be extra once awaiting async setter is working
        console.log(modes);

        // Re-render the combat tracker and this app
        ui.combat?.render(true);
        this.render(true, { height: "auto" });
    }
}
