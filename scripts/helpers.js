/**
 * A recursive version of the core `getProperty` helper
 * @param {object} object - The object to traverse
 * @param {string} key - An object property with notation a.b.*.c where * is a wildcard
 * @param {number} [l=0] - The initial level of recursion
 * @return {*[] | *} The value of the found property
 */
export function recursiveGetProperty(object, key, l = 0) {
    const target = getProperty(object, key.split(".*.")[l]);
    const nextTarget = getProperty(object, key.split(".*.")[l + 1]);
    const descend = () => { l++; return target.map(t => recursiveGetProperty(t, key, l)); }
    return Array.isArray(target) && target && nextTarget ? descend() : target;
}

/** A wrapper around the `recursiveGetProperty` helper above which always gives a single value
 * @param {object} object - The object to traverse
 * @param {string} key - An object property with notation a.b.*.c where * is a wildcard
 * @return {*} A single concatenated value of the found properties
 */
export function recursiveGetPropertyConcat(object, key) {
    const target = recursiveGetProperty(object, key);
    return Array.isArray(target) ? target.sort().deepFlatten().join("") : target;
}

/** Get display name of a given group
 * @param {Combatant[]} group - The group for which to return a name
 * @return {string} Concatenated display name for this group 
 */
export function getDisplayName(group) {
    /**
     * Names in the current group
     * @type {string[]}
     */
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
