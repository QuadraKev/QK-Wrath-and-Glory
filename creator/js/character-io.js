// Character I/O - Handles saving and loading character files

function _formatTimestamp() {
    const now = new Date();
    return now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + '-' +
        String(now.getMinutes()).padStart(2, '0') + '-' +
        String(now.getSeconds()).padStart(2, '0');
}

const CharacterIO = {
    // Track last used file path for quick save
    lastSavedPath: null,

    // Save current character - always prompts for file location
    async save() {
        const character = State.getCharacter();

        if (!character.name || character.name.trim() === '') {
            return { success: false, error: 'Please enter a character name before saving.' };
        }

        const defaultName = character.name || 'character';

        try {
            const dialogResult = await window.api.showSaveDialog(`${defaultName} ${_formatTimestamp()}.character`);

            if (!dialogResult.canceled && dialogResult.filePath) {
                const result = await window.api.exportCharacter(character, dialogResult.filePath);
                if (result.success) {
                    this.lastSavedPath = dialogResult.filePath;
                    State.markClean();
                    console.log(`Character saved to: ${dialogResult.filePath}`);
                }
                return result;
            }

            return { success: false, error: 'Save cancelled.' };
        } catch (error) {
            console.error('Save error:', error);
            return { success: false, error: error.message };
        }
    },

    // Load a character - always prompts for file location
    async load() {
        try {
            const dialogResult = await window.api.showOpenDialog();

            if (!dialogResult.canceled && dialogResult.filePaths && dialogResult.filePaths.length > 0) {
                const result = await window.api.importCharacter(dialogResult.filePaths[0]);

                if (result.success && result.character) {
                    State.loadCharacter(result.character);
                    this.lastSavedPath = dialogResult.filePaths[0];
                    console.log(`Character loaded from: ${dialogResult.filePaths[0]}`);
                    return { success: true };
                }

                return result;
            }

            return { success: false, error: 'Load cancelled.' };
        } catch (error) {
            console.error('Load error:', error);
            return { success: false, error: error.message };
        }
    },

    // Quick save to last used path (if available)
    async quickSave() {
        if (!this.lastSavedPath) {
            return this.save(); // Fall back to regular save with dialog
        }

        const character = State.getCharacter();

        if (!character.name || character.name.trim() === '') {
            return { success: false, error: 'Please enter a character name before saving.' };
        }

        try {
            const result = await window.api.exportCharacter(character, this.lastSavedPath);
            if (result.success) {
                State.markClean();
                console.log(`Character quick-saved to: ${this.lastSavedPath}`);
            }
            return result;
        } catch (error) {
            console.error('Quick save error:', error);
            return { success: false, error: error.message };
        }
    },

    // List all saved characters (legacy - kept for compatibility)
    async listCharacters() {
        try {
            return await window.api.listCharacters();
        } catch (error) {
            console.error('List characters error:', error);
            return [];
        }
    },

    // Delete a character (legacy - kept for compatibility)
    async deleteCharacter(characterName) {
        try {
            return await window.api.deleteCharacter(characterName);
        } catch (error) {
            console.error('Delete error:', error);
            return { success: false, error: error.message };
        }
    },

    // Export character to file (same as save now)
    async exportToFile() {
        return this.save();
    },

    // Import character from file (same as load now)
    async importFromFile() {
        return this.load();
    },

    // Get character summary for list display
    getCharacterSummary(character) {
        const species = DataLoader.getSpecies(character.species?.id);
        const archetype = DataLoader.getArchetype(character.archetype?.id);

        return {
            name: character.name || 'Unnamed',
            species: species?.name || '-',
            archetype: archetype?.name || '-',
            tier: character.tier || 1,
            rank: character.rank || 1,
            totalXP: XPCalculator.getTotalXP(character.tier, character.additionalXp, character),
            spentXP: XPCalculator.calculateSpentXP(character)
        };
    },

    // Validate character data structure
    validateCharacterData(data) {
        const errors = [];

        // Check required fields exist
        if (!data.tier || data.tier < 1 || data.tier > 5) {
            errors.push('Invalid tier');
        }

        if (!data.attributes || typeof data.attributes !== 'object') {
            errors.push('Missing attributes');
        }

        if (!data.skills || typeof data.skills !== 'object') {
            errors.push('Missing skills');
        }

        // Validate attribute values
        if (data.attributes) {
            for (const [attr, value] of Object.entries(data.attributes)) {
                if (typeof value !== 'number' || value < 1 || value > 12) {
                    errors.push(`Invalid ${attr} value`);
                }
            }
        }

        // Validate skill values
        if (data.skills) {
            for (const [skill, value] of Object.entries(data.skills)) {
                if (typeof value !== 'number' || value < 0 || value > 8) {
                    errors.push(`Invalid ${skill} value`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors: errors
        };
    },

    // Create a shareable character summary
    createCharacterSheet(character) {
        const species = DataLoader.getSpecies(character.species?.id);
        const archetype = DataLoader.getArchetype(character.archetype?.id);
        const armorBreakdown = DerivedStats.getArmorBreakdown(character);
        const derived = DerivedStats.getAllDerivedStats(character, armorBreakdown);

        let sheet = `# ${character.name || 'Unnamed Character'}\n\n`;
        sheet += `**Species:** ${species?.name || '-'}\n`;
        sheet += `**Archetype:** ${archetype?.name || '-'}\n`;
        sheet += `**Tier:** ${character.tier} | **Rank:** ${character.rank}\n`;
        sheet += `**Keywords:** ${PrerequisiteChecker.getCharacterKeywords(character).join(', ')}\n\n`;

        sheet += `## Attributes\n`;
        for (const [attr, value] of Object.entries(character.attributes)) {
            const effective = DerivedStats.getEffectiveAttribute(character, attr);
            const display = effective !== value ? `${effective} (base ${value})` : `${value}`;
            sheet += `- ${DerivedStats.formatAttributeName(attr)}: ${display}\n`;
        }

        sheet += `\n## Derived Stats\n`;
        sheet += `- Defence: ${derived.defence}\n`;
        sheet += `- Resilience: ${derived.resilience}\n`;
        sheet += `- Max Wounds: ${derived.maxWounds}\n`;
        sheet += `- Max Shock: ${derived.maxShock}\n`;
        sheet += `- Speed: ${derived.speed}\n`;
        sheet += `- Conviction: ${derived.conviction}\n`;
        sheet += `- Resolve: ${derived.resolve}\n`;

        sheet += `\n## Skills\n`;
        for (const [skill, value] of Object.entries(character.skills)) {
            if (value > 0) {
                const linkedAttr = DerivedStats.getLinkedAttribute(skill);
                const total = DerivedStats.calculateSkillTotal(character, skill);
                sheet += `- ${DerivedStats.formatSkillName(skill)}: ${value} (${DerivedStats.getAttributeAbbrev(linkedAttr)}) = ${total}\n`;
            }
        }

        if (character.talents.length > 0) {
            sheet += `\n## Talents\n`;
            for (const talentEntry of character.talents) {
                const id = typeof talentEntry === 'string' ? talentEntry : talentEntry.id;
                const talent = DataLoader.getTalent(id);
                sheet += `- ${talent?.name || id}\n`;
            }
        }

        if (character.wargear.length > 0) {
            sheet += `\n## Wargear\n`;
            for (const item of character.wargear) {
                const wargear = DataLoader.getWargearItem(item.id);
                const baseName = wargear?.name || item.id;
                if (item.relic) {
                    const parts = this._getRelicDisplayParts(item.relic);
                    const choiceText = item.relic.powerChoice ? ` (${item.relic.powerChoice})` : '';
                    const oddityText = parts.oddityNames.length ? parts.oddityNames.join(', ') : 'none';
                    sheet += `- ${item.relic.name} (Holy Relic — ${baseName})\n`;
                    sheet += `    Power: ${parts.powerName}${choiceText}; Oddities: ${oddityText}\n`;
                } else {
                    sheet += `- ${baseName}\n`;
                }
            }
        }

        if (character.psychicPowers.length > 0) {
            sheet += `\n## Psychic Powers\n`;
            for (const powerId of character.psychicPowers) {
                const power = DataLoader.getPsychicPower(powerId);
                sheet += `- ${power?.name || powerId}\n`;
            }
        }

        return sheet;
    },

    // Resolve a relic's id fields to display names via DataLoader.getHolyRelics(),
    // falling back to raw ids if the lookup misses (e.g. data not loaded).
    _getRelicDisplayParts(relic) {
        const relics = DataLoader.getHolyRelics();
        if (!relics) {
            return {
                powerName: relic.power,
                oddityNames: relic.oddities || []
            };
        }

        let power = null;
        for (const table of Object.values(relics.powers)) {
            power = table.entries.find(e => e.id === relic.power);
            if (power) break;
        }

        const oddityNames = (relic.oddities || []).map(id => {
            const oddity = relics.oddities.entries.find(e => e.id === id);
            return oddity ? oddity.name : id;
        });

        return {
            powerName: power ? power.name : relic.power,
            oddityNames
        };
    }
};
