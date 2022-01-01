import Ctg from "./ctg.js";

export default function registerSettings() {
    game.settings.register(Ctg.ID, "mode", {
        scope: "world",
        config: false,
        type: String,
        default: "initiative",
        onChange: mode => {
            // Re-render the combat tracker
            ui.combat?.render(true);
            // Setup the turns again
            game.combat.setupTurns();
            // Call hook for mode update
            Hooks.call("ctgModeUpdate", mode);
        },
    });

    game.settings.register(Ctg.ID, "groupSkipping", {
        name: game.i18n.localize("ctg.settings.groupSkipping.name"),
        hint: game.i18n.localize("ctg.settings.groupSkipping.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true,
        onChange: () => {
            ui.combat?.render(true);
            game.combat?.update({ turn: 0 });
        }
    });

    game.settings.register(Ctg.ID, "openToggles", {
        name: game.i18n.localize("ctg.settings.openToggles.name"),
        hint: game.i18n.localize("ctg.settings.openToggles.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });

    game.settings.register(Ctg.ID, "sortCombatants", {
        name: game.i18n.localize("ctg.settings.sortCombatants.name"),
        hint: game.i18n.localize("ctg.settings.sortCombatants.hint"),
        scope: "world",
        config: true,
        type: Boolean,
        default: true
    });
};