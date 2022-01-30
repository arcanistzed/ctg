import Ctg from "./ctg.js";

export default function registerKeybindings() {
    game.keybindings.register(Ctg.ID, "rollGroupInitiative", {
        name: game.i18n.localize("ctg.settings.rollGroupInitiative.name"),
        hint: game.i18n.localize("ctg.settings.rollGroupInitiative.hint"),
        uneditable: [
            { key: "ShiftLeft" },
            { key: "ShiftRight" },
            { key: "ControlLeft" },
            { key: "ControlRight" }
        ],
        onDown: () => Ctg.groupInitiativeKeybind = true,
        onUp: () => Ctg.groupInitiativeKeybind = false,
    });
}