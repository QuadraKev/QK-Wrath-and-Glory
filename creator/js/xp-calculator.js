// XP Calculator - Handles all XP cost calculations

const XPCalculator = {
    // Attribute XP costs (cumulative cost to reach that rating)
    ATTRIBUTE_COSTS: {
        1: 0,
        2: 4,
        3: 10,
        4: 20,
        5: 35,
        6: 55,
        7: 80,
        8: 110,
        9: 145,
        10: 185,
        11: 230,
        12: 280
    },

    // Skill XP costs (cumulative cost to reach that rating)
    SKILL_COSTS: {
        0: 0,
        1: 2,
        2: 6,
        3: 12,
        4: 20,
        5: 30,
        6: 42,
        7: 56,
        8: 72
    },

    // Starting XP by tier
    TIER_STARTING_XP: {
        1: 100,
        2: 200,
        3: 300,
        4: 400,
        5: 500
    },

    // Calculate total available XP
    getTotalXP(tier, additionalXP = 0, character = null) {
        let total = (this.TIER_STARTING_XP[tier] || 100) + additionalXP;

        // Custom archetype bonus XP: Tier x 10
        if (character?.archetype?.id === 'custom') {
            total += (character.tier || 1) * 10;
        }

        return total;
    },

    // Get cost to increase attribute from current to target
    getAttributeIncreaseCost(current, target) {
        if (target <= current) return 0;
        return this.ATTRIBUTE_COSTS[target] - this.ATTRIBUTE_COSTS[current];
    },

    // Get cost to increase skill from current to target
    getSkillIncreaseCost(current, target) {
        if (target <= current) return 0;
        return this.SKILL_COSTS[target] - this.SKILL_COSTS[current];
    },

    // Get the cost of next attribute increase
    getNextAttributeCost(current) {
        if (current >= 12) return null;
        return this.ATTRIBUTE_COSTS[current + 1] - this.ATTRIBUTE_COSTS[current];
    },

    // Get the cost of next skill increase
    getNextSkillCost(current) {
        if (current >= 8) return null;
        return this.SKILL_COSTS[current + 1] - this.SKILL_COSTS[current];
    },

    // The known stat names, in the order of State.createNewCharacter()
    ATTRIBUTE_KEYS: ['strength', 'toughness', 'agility', 'initiative', 'willpower', 'intellect', 'fellowship'],
    SKILL_KEYS: [
        'athletics', 'awareness', 'ballisticSkill', 'cunning', 'deception', 'insight',
        'intimidation', 'investigation', 'leadership', 'medicae', 'persuasion', 'pilot',
        'psychicMastery', 'scholar', 'stealth', 'survival', 'tech', 'weaponSkill'
    ],

    // The free value of each known stat from the species and the archetype.
    // An archetype skill bonus under a key that is not a skill name ("any skill")
    // goes to the skill that archetypeSkillChoices names for that key.
    getBaseline(character) {
        const speciesBase = DataLoader.getSpecies(character.species?.id)?.baseAttributes || {};
        const archetype = DataLoader.getArchetype(character.archetype?.id);
        const attrBonus = archetype?.attributeBonus || {};
        const skillBonus = archetype?.skillBonus || {};
        const choices = character.archetypeSkillChoices;
        const hasChoices = !!choices && typeof choices === 'object' && !Array.isArray(choices);

        const attributes = {};
        for (const attr of this.ATTRIBUTE_KEYS) {
            attributes[attr] = Math.max(1, speciesBase[attr] || 1, attrBonus[attr] || 1);
        }

        const skills = {};
        for (const skill of this.SKILL_KEYS) {
            skills[skill] = Math.max(0, skillBonus[skill] || 0);
        }
        if (hasChoices) {
            for (const [key, bonus] of Object.entries(skillBonus)) {
                if (this.SKILL_KEYS.includes(key)) continue;
                const chosen = choices[key];
                if (this.SKILL_KEYS.includes(chosen)) {
                    skills[chosen] = Math.max(skills[chosen], bonus);
                }
            }
        }

        return { attributes, skills };
    },

    // Calculate XP spent on attributes beyond the baseline
    calculateAttributeXP(character, archetype) {
        let xp = 0;
        const baseline = this.getBaseline(character).attributes;

        for (const attr of this.ATTRIBUTE_KEYS) {
            const value = character.attributes?.[attr];
            if (!Number.isFinite(value)) continue;
            // A value above the table costs as the table edge
            const capped = Math.min(value, 12);

            if (capped > baseline[attr]) {
                xp += this.getAttributeIncreaseCost(baseline[attr], capped);
            }
        }

        return xp;
    },

    // Calculate XP spent on skills beyond the baseline
    calculateSkillXP(character, archetype) {
        let xp = 0;
        const baseline = this.getBaseline(character).skills;

        for (const skill of this.SKILL_KEYS) {
            const value = character.skills?.[skill];
            if (!Number.isFinite(value)) continue;
            // A value above the table costs as the table edge
            const capped = Math.min(value, 8);

            if (capped > baseline[skill]) {
                xp += this.getSkillIncreaseCost(baseline[skill], capped);
            }
        }

        return xp;
    },

    // Calculate total XP spent on talents
    calculateTalentXP(character) {
        let xp = 0;
        for (const talentEntry of character.talents || []) {
            // Skip ascension-granted talents (they don't cost XP)
            if (typeof talentEntry === 'object' && talentEntry.ascensionGranted) continue;
            // Handle both string (old format) and object (new format) entries
            const talentId = typeof talentEntry === 'string' ? talentEntry : talentEntry.id;
            const talent = DataLoader.getTalent(talentId);
            if (talent) {
                xp += talent.cost || 0;
            }
        }
        return xp;
    },

    // Calculate total XP spent on psychic powers
    calculatePowerXP(character) {
        let xp = 0;
        for (const powerId of character.psychicPowers || []) {
            // Skip cost for archetype-granted free powers
            if ((character.freePowers || []).includes(powerId)) continue;
            const power = DataLoader.getPsychicPower(powerId);
            if (power) {
                xp += this.getEffectivePowerCost(power, character);
            }
        }
        return xp;
    },

    // The psychic discipline discounted by the Tormented Manifestation talent (or null)
    getDiscountedDiscipline(character) {
        const entry = (character.talents || []).find(t => typeof t === 'object' && t.id === 'tormented_manifestation_aoa');
        return entry?.choice || null;
    },

    // A single power's effective cost, applying Tormented Manifestation's half-cost (rounded up)
    getEffectivePowerCost(power, character) {
        const base = power?.cost || 0;
        const discounted = this.getDiscountedDiscipline(character);
        if (discounted && power?.discipline === discounted) {
            return Math.ceil(base / 2);
        }
        return base;
    },

    // Calculate XP spent on languages (1 XP each beyond free Low Gothic and free languages)
    calculateLanguageXP(character) {
        const totalLanguages = (character.languages || []).length;
        const freeLanguages = (character.freeLanguages || []).length;
        return Math.max(0, totalLanguages - 1 - freeLanguages);
    },

    // Calculate total spent XP
    calculateSpentXP(character) {
        const species = DataLoader.getSpecies(character.species?.id);
        const archetype = DataLoader.getArchetype(character.archetype?.id);

        let spent = 0;

        // Species cost
        if (species) {
            spent += species.cost || 0;
        }

        // Archetype cost
        if (archetype) {
            spent += archetype.cost || 0;
        }

        // Custom archetype ability cost
        if (character.archetype?.id === 'custom' && character.customArchetype?.abilityArchetypeId) {
            const abilityArchetype = DataLoader.getArchetype(character.customArchetype.abilityArchetypeId);
            if (abilityArchetype) {
                spent += (abilityArchetype.tier || 1) * 10;
            }
        }

        // Ascension packages
        for (const asc of character.ascensions || []) {
            if (asc.type === 'package' && asc.packageId) {
                const pkg = DataLoader.getAscensionPackages().find(p => p.id === asc.packageId);
                if (pkg) {
                    spent += pkg.costMultiplier ? pkg.costMultiplier * asc.targetTier : parseInt(pkg.cost) || 0;
                }
            }
            // Archetype ascension has no direct XP cost
        }

        // Attributes beyond baseline
        spent += this.calculateAttributeXP(character, archetype);

        // Skills beyond baseline
        spent += this.calculateSkillXP(character, archetype);

        // Talents
        spent += this.calculateTalentXP(character);

        // Psychic powers
        spent += this.calculatePowerXP(character);

        // Languages
        spent += this.calculateLanguageXP(character);

        return spent;
    },

    // Calculate remaining XP
    calculateRemainingXP(character) {
        const total = this.getTotalXP(character.tier, character.additionalXp, character);
        const spent = this.calculateSpentXP(character);
        return total - spent;
    },

    // Get XP breakdown by category
    getXPBreakdown(character) {
        const species = DataLoader.getSpecies(character.species?.id);
        const archetype = DataLoader.getArchetype(character.archetype?.id);

        // Custom archetype ability cost
        let customAbilityCost = 0;
        if (character.archetype?.id === 'custom' && character.customArchetype?.abilityArchetypeId) {
            const abilityArchetype = DataLoader.getArchetype(character.customArchetype.abilityArchetypeId);
            if (abilityArchetype) {
                customAbilityCost = (abilityArchetype.tier || 1) * 10;
            }
        }

        return {
            species: species?.cost || 0,
            archetype: (archetype?.cost || 0) + customAbilityCost,
            ascension: (character.ascensions || []).reduce((sum, asc) => {
                if (asc.type === 'package' && asc.packageId) {
                    const pkg = DataLoader.getAscensionPackages().find(p => p.id === asc.packageId);
                    if (pkg) return sum + (pkg.costMultiplier ? pkg.costMultiplier * asc.targetTier : parseInt(pkg.cost) || 0);
                }
                return sum;
            }, 0),
            attributes: this.calculateAttributeXP(character, archetype),
            skills: this.calculateSkillXP(character, archetype),
            talents: this.calculateTalentXP(character),
            powers: this.calculatePowerXP(character),
            languages: this.calculateLanguageXP(character)
        };
    },

    // Check if character can afford an XP cost
    canAfford(character, cost) {
        return this.calculateRemainingXP(character) >= cost;
    }
};
