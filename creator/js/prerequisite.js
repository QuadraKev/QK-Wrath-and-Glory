// Prerequisite Checker - Validates talent and power prerequisites

const PrerequisiteChecker = {
    // Check if a character meets all prerequisites for a talent
    checkTalentPrerequisites(talent, character) {
        if (!talent.prerequisites) {
            return { met: true, reasons: [] };
        }

        const prereqs = talent.prerequisites;
        const reasons = [];

        // Check attribute requirements
        if (prereqs.attributes) {
            for (const [attr, required] of Object.entries(prereqs.attributes)) {
                const current = DerivedStats.getEffectiveAttribute(character, attr);
                if (current < required) {
                    reasons.push(`${DerivedStats.formatAttributeName(attr)} ${required}+`);
                }
            }
        }

        // Check skill requirements
        if (prereqs.skills) {
            for (const [skill, required] of Object.entries(prereqs.skills)) {
                const current = character.skills?.[skill] || 0;
                if (current < required) {
                    reasons.push(`${DerivedStats.formatSkillName(skill)} ${required}+`);
                }
            }
        }

        // Check keyword requirements
        if (prereqs.keywords && prereqs.keywords.length > 0) {
            const charKeywords = this.getCharacterKeywords(character);

            if (prereqs.keywordsAny) {
                // OR logic - character needs at least one of the keywords
                const hasAny = prereqs.keywords.some(keyword => charKeywords.includes(keyword));
                if (!hasAny) {
                    reasons.push(`Keyword: ${prereqs.keywords.join(' or ')}`);
                }
            } else {
                // AND logic - character needs all keywords
                for (const keyword of prereqs.keywords) {
                    if (!charKeywords.includes(keyword)) {
                        reasons.push(`Keyword: ${keyword}`);
                    }
                }
            }
        }

        // Check required talents
        if (prereqs.talents && prereqs.talents.length > 0) {
            const charTalents = character.talents || [];
            for (const talentId of prereqs.talents) {
                // Check both string and object formats
                const hasTalent = charTalents.some(t =>
                    (typeof t === 'string' ? t : t.id) === talentId
                );
                if (!hasTalent) {
                    const requiredTalent = DataLoader.getTalent(talentId);
                    const name = requiredTalent?.name || talentId;
                    reasons.push(`Talent: ${name}`);
                }
            }
        }

        // Check species requirement
        if (prereqs.species && prereqs.species.length > 0) {
            if (!prereqs.species.includes(character.species?.id)) {
                const speciesNames = prereqs.species.map(id => {
                    const s = DataLoader.getSpecies(id);
                    return s?.name || id;
                }).join(' or ');
                reasons.push(`Species: ${speciesNames}`);
            }
        }

        // Check tier requirement
        if (prereqs.tier && State.getEffectiveTier() < prereqs.tier) {
            reasons.push(`Tier ${prereqs.tier}+`);
        }

        // Check other requirements (free text)
        if (prereqs.other) {
            // These are displayed but not automatically validated
            // Could be things like "Must be a psyker" etc.
        }

        return {
            met: reasons.length === 0,
            reasons: reasons
        };
    },

    // Check if a character meets prerequisites for a psychic power
    checkPowerPrerequisites(power, character) {
        // First check if character has PSYKER keyword
        const keywords = this.getCharacterKeywords(character);
        if (!keywords.includes('PSYKER')) {
            return {
                met: false,
                reasons: ['Requires PSYKER keyword']
            };
        }

        const reasons = [];

        // Check discipline requirements
        if (power.discipline && power.discipline !== 'minor') {
            // Some disciplines may have requirements
            // For example, Maleficarum might require CHAOS keyword
            if (power.discipline === 'maleficarum' && !keywords.includes('CHAOS')) {
                // Allow for characters who have gone rogue
                if (!keywords.includes('HERETIC')) {
                    // This is optional - some campaigns allow any psyker to use Maleficarum
                }
            }
        }

        // Check psychic mastery requirement
        if (power.prerequisites?.psychicMastery) {
            const current = character.skills?.psychicMastery || 0;
            if (current < power.prerequisites.psychicMastery) {
                reasons.push(`Psychic Mastery ${power.prerequisites.psychicMastery}+`);
            }
        }

        // Check willpower requirement
        if (power.prerequisites?.willpower) {
            const current = DerivedStats.getEffectiveAttribute(character, 'willpower');
            if (current < power.prerequisites.willpower) {
                reasons.push(`Willpower ${power.prerequisites.willpower}+`);
            }
        }

        return {
            met: reasons.length === 0,
            reasons: reasons
        };
    },

    // Get all keywords for a character
    getCharacterKeywords(character) {
        const keywords = new Set();
        let hasChapterKeyword = false;

        // Species keywords
        const species = DataLoader.getSpecies(character.species?.id);
        if (species?.keywords) {
            species.keywords.forEach(k => keywords.add(k));
        }

        // Species sub-option keywords (e.g., Chapter keywords for Astartes)
        if (species?.subOptions && character.species?.subOptions) {
            const subOptionsConfig = Array.isArray(species.subOptions) ? species.subOptions : [species.subOptions];
            for (const config of subOptionsConfig) {
                if (config.addKeyword) {
                    for (const selectedOpt of character.species.subOptions) {
                        if (selectedOpt.type === config.type) {
                            const option = config.options?.find(o => o.id === selectedOpt.optionId);
                            if (option?.keyword) {
                                keywords.add(option.keyword);
                                // Track that we have an actual chapter keyword
                                if (config.type === 'chapter') {
                                    hasChapterKeyword = true;
                                }
                            }
                        }
                    }
                }
            }
        }

        // Archetype keywords
        const archetype = DataLoader.getArchetype(character.archetype?.id);
        if (archetype?.keywords) {
            archetype.keywords.forEach(k => keywords.add(k));
        }

        // Custom archetype: include ability archetype's keywords
        if (character.archetype?.id === 'custom' && character.customArchetype?.abilityArchetypeId) {
            const abilityArchetype = DataLoader.getArchetype(character.customArchetype.abilityArchetypeId);
            if (abilityArchetype?.keywords) {
                abilityArchetype.keywords.forEach(k => keywords.add(k));
            }
            if (abilityArchetype?.isPsyker) {
                keywords.add('PSYKER');
            }
        }

        // Check if character is a psyker (has Psychic Mastery skill > 0 or archetype grants it)
        if (character.skills?.psychicMastery > 0) {
            keywords.add('PSYKER');
        }
        if (archetype?.grantsPsyker) {
            keywords.add('PSYKER');
        }

        // Custom keywords added to character
        if (character.customKeywords) {
            character.customKeywords.forEach(k => keywords.add(k));
        }

        // Custom archetype keywords
        if (character.customArchetype?.keywords) {
            character.customArchetype.keywords.forEach(k => keywords.add(k));
        }

        // Ascension package keywords (e.g., PSYKER from Psychic Revelations)
        for (const asc of character.ascensions || []) {
            if (asc.type === 'package' && asc.packageId) {
                const pkg = DataLoader.getAscensionPackages().find(p => p.id === asc.packageId);
                if (pkg?.keywordsGranted) {
                    pkg.keywordsGranted.forEach(k => keywords.add(k));
                }
            }
        }

        // Ascension keyword choices (e.g., chosen [ORDO] or [ANY] values)
        for (const asc of character.ascensions || []) {
            if (asc.choices) {
                for (const [key, value] of Object.entries(asc.choices)) {
                    // Keyword choices use bracket-prefixed keys like "[ORDO]", "[ANY]"
                    if (key.startsWith('[') && value) {
                        keywords.add(value);
                    }
                }
            }
        }

        // Remove placeholder keywords if their actual value exists
        // [CHAPTER] is replaced by the actual chapter name
        if (hasChapterKeyword) {
            keywords.delete('[CHAPTER]');
        }

        return Array.from(keywords);
    },

    // Format prerequisites for display
    formatPrerequisites(talent) {
        if (!talent.prerequisites) {
            return '-';
        }

        const parts = [];
        const prereqs = talent.prerequisites;

        if (prereqs.attributes) {
            for (const [attr, val] of Object.entries(prereqs.attributes)) {
                parts.push(`${DerivedStats.formatAttributeName(attr)} ${val}+`);
            }
        }

        if (prereqs.skills) {
            for (const [skill, val] of Object.entries(prereqs.skills)) {
                parts.push(`${DerivedStats.formatSkillName(skill)} ${val}+`);
            }
        }

        if (prereqs.keywords) {
            if (prereqs.keywordsAny && prereqs.keywords.length > 1) {
                // Show as "X or Y or Z"
                parts.push(prereqs.keywords.join(' or '));
            } else {
                prereqs.keywords.forEach(k => parts.push(k));
            }
        }

        if (prereqs.talents) {
            prereqs.talents.forEach(t => {
                const talent = DataLoader.getTalent(t);
                parts.push(talent?.name || t);
            });
        }

        if (prereqs.species) {
            const names = prereqs.species.map(id => {
                const s = DataLoader.getSpecies(id);
                return s?.name || id;
            });
            parts.push(names.join('/'));
        }

        if (prereqs.other) {
            parts.push(prereqs.other);
        }

        return parts.length > 0 ? parts.join(', ') : '-';
    },

    // Check if character already has a talent
    hasTalent(character, talentId) {
        return (character.talents || []).some(t =>
            (typeof t === 'string' ? t : t.id) === talentId
        );
    },

    // Check if character already has a power
    hasPower(character, powerId) {
        return (character.psychicPowers || []).includes(powerId);
    },

    // Check if character can take a talent (meets prereqs and doesn't have it)
    canTakeTalent(talent, character) {
        if (this.hasTalent(character, talent.id)) {
            return { canTake: false, reason: 'Already learned' };
        }

        const prereqCheck = this.checkTalentPrerequisites(talent, character);
        if (!prereqCheck.met) {
            return { canTake: false, reason: prereqCheck.reasons.join(', ') };
        }

        // Check if can afford
        if (!XPCalculator.canAfford(character, talent.cost || 0)) {
            return { canTake: false, reason: 'Not enough XP' };
        }

        return { canTake: true, reason: null };
    },

    // Check if character can take a power
    canTakePower(power, character) {
        if (this.hasPower(character, power.id)) {
            return { canTake: false, reason: 'Already learned' };
        }

        const prereqCheck = this.checkPowerPrerequisites(power, character);
        if (!prereqCheck.met) {
            return { canTake: false, reason: prereqCheck.reasons.join(', ') };
        }

        // Check if can afford
        if (!XPCalculator.canAfford(character, power.cost || 0)) {
            return { canTake: false, reason: 'Not enough XP' };
        }

        return { canTake: true, reason: null };
    }
};
