
/** Get display name of a given group
 * @param {Combatant[]} group - The group for which to return a name
 * @return {string} Concatenated display name for this group 
 */
export function getDisplayName(group) {
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
};
