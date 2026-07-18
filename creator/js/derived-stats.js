// Derived Stats Calculator - Calculates all derived character stats

const DerivedStats = {
    // Get background bonus for a specific stat type
    getBackgroundBonus(character, statType) {
        let bonus = 0;
        const background = character.background;

        if (background?.origin?.bonusType === statType) bonus += 1;
        if (background?.accomplishment?.bonusType === statType) bonus += 1;
        if (background?.goal?.bonusType === statType) bonus += 1;

        return bonus;
    },

    // Get species sub-option bonus for a specific stat
    getSpeciesSubOptionBonus(character, bonusKey) {
        const species = DataLoader.getSpecies(character.species?.id);
        if (!species?.subOptions || !character.species?.subOptions) return 0;

        const rank = character.rank || 1;
        let bonus = 0;

        const subOptionsConfig = Array.isArray(species.subOptions) ? species.subOptions : [species.subOptions];

        for (const config of subOptionsConfig) {
            for (const selectedOpt of character.species.subOptions || []) {
                if (selectedOpt.type === config.type) {
                    const option = config.options?.find(o => o.id === selectedOpt.optionId);
                    if (option?.bonuses) {
                        const bonusValue = option.bonuses[bonusKey];
                        if (bonusValue === 'rank') {
                            bonus += rank;
                        } else if (bonusValue === 'doubleRank') {
                            bonus += rank * 2;
                        } else if (typeof bonusValue === 'number') {
                            bonus += bonusValue;
                        }
                    }
                }
            }
        }

        return bonus;
    },

    // Get species sub-option skill bonus
    getSpeciesSubOptionSkillBonus(character, skillKey) {
        const species = DataLoader.getSpecies(character.species?.id);
        if (!species?.subOptions || !character.species?.subOptions) return 0;

        const rank = character.rank || 1;
        let bonus = 0;

        const subOptionsConfig = Array.isArray(species.subOptions) ? species.subOptions : [species.subOptions];

        for (const config of subOptionsConfig) {
            for (const selectedOpt of character.species.subOptions || []) {
                if (selectedOpt.type === config.type) {
                    const option = config.options?.find(o => o.id === selectedOpt.optionId);
                    if (option?.bonuses?.skills?.[skillKey]) {
                        const bonusValue = option.bonuses.skills[skillKey];
                        if (bonusValue === 'rank') {
                            bonus += rank;
                        } else if (bonusValue === 'doubleRank') {
                            bonus += rank * 2;
                        } else if (typeof bonusValue === 'number') {
                            bonus += bonusValue;
                        }
                    }
                }
            }
        }

        return bonus;
    },

    // Get all mutation bonuses grouped by key
    getMutationBonuses(character) {
        const bonuses = {};
        const data = DataLoader.getInjuriesCorruptionData();
        for (const entry of character.mutations || []) {
            const mutation = data?.mutations?.find(m => m.id === entry.id);
            if (!mutation) continue;
            let activeBonuses = mutation.bonuses;
            // If mutation has sub-choices, use the sub-choice bonuses
            if (entry.subChoice && mutation.subChoices) {
                const sub = mutation.subChoices.find(s => s.id === entry.subChoice);
                if (sub?.bonuses) activeBonuses = sub.bonuses;
                else activeBonuses = null;
            }
            if (!activeBonuses) continue;
            for (const [key, value] of Object.entries(activeBonuses)) {
                if (!bonuses[key]) bonuses[key] = [];
                const sourceName = entry.subChoice && mutation.subChoices
                    ? `${mutation.name} (${mutation.subChoices.find(s => s.id === entry.subChoice)?.name || entry.subChoice})`
                    : mutation.name;
                bonuses[key].push({ value, source: sourceName });
            }
        }
        return bonuses;
    },

    // Sum all mutation bonuses for a given key
    getMutationBonusTotal(character, bonusKey) {
        const bonuses = this.getMutationBonuses(character);
        if (!bonuses[bonusKey]) return 0;
        return bonuses[bonusKey].reduce((sum, b) => sum + b.value, 0);
    },

    // Linked attributes for each skill
    SKILL_ATTRIBUTES: {
        athletics: 'strength',
        awareness: 'intellect',
        ballisticSkill: 'agility',
        cunning: 'fellowship',
        deception: 'fellowship',
        insight: 'fellowship',
        intimidation: 'willpower',
        investigation: 'intellect',
        leadership: 'willpower',
        medicae: 'intellect',
        persuasion: 'fellowship',
        pilot: 'agility',
        psychicMastery: 'willpower',
        scholar: 'intellect',
        stealth: 'agility',
        survival: 'willpower',
        tech: 'intellect',
        weaponSkill: 'initiative'
    },

    // Get linked attribute for a skill
    getLinkedAttribute(skillName) {
        return this.SKILL_ATTRIBUTES[skillName] || null;
    },

    // Get effective attribute value (base + equipment bonuses + mutation bonuses)
    getEffectiveAttribute(character, attr) {
        const base = character.attributes?.[attr] || 1;
        return base + this.getEquipmentBonusTotal(character, attr) + this.getMutationBonusTotal(character, attr);
    },

    // Helper to check if character has a talent
    hasTalent(character, talentId) {
        return (character.talents || []).some(t =>
            (typeof t === 'string' ? t : t.id) === talentId
        );
    },

    // Get talent bonus for a specific trait (handles Uncanny talent)
    getTalentTraitBonus(character, traitName) {
        const rank = character.rank || 1;
        let bonus = 0;

        // Uncanny [Trait]: Increase one trait by +Rank (repeatable, one instance per trait)
        for (const entry of character.talents || []) {
            if (typeof entry === 'object' && entry.id === 'uncanny' && entry.choice === traitName) {
                bonus += rank;
            }
        }

        return bonus;
    },

    // Resolve a data-driven bonus value ('rank' | 'doubleRank' | number)
    getBonusValue(value, rank) {
        if (value === 'rank') return rank;
        if (value === 'doubleRank') return rank * 2;
        return typeof value === 'number' ? value : 0;
    },

    // Sum a stat bonus from archetype ability `bonuses` across every route that
    // grants abilities: the primary archetype (or a custom archetype's purchased
    // ability) and any archetype ascensions
    getArchetypeAbilityBonusTotal(character, bonusKey) {
        const rank = character.rank || 1;
        const archetypes = [];
        if (character.archetype?.id === 'custom' && character.customArchetype?.abilityArchetypeId) {
            archetypes.push(DataLoader.getArchetype(character.customArchetype.abilityArchetypeId));
        } else if (character.archetype?.id) {
            archetypes.push(DataLoader.getArchetype(character.archetype.id));
        }
        for (const asc of character.ascensions || []) {
            if (asc.type === 'archetype' && asc.archetypeId) {
                archetypes.push(DataLoader.getArchetype(asc.archetypeId));
            }
        }
        let bonus = 0;
        for (const arch of archetypes) {
            for (const ability of arch?.abilities || []) {
                if (ability.bonuses?.[bonusKey] !== undefined) {
                    bonus += this.getBonusValue(ability.bonuses[bonusKey], rank);
                }
            }
        }
        return bonus;
    },

    // Sum a stat bonus from species ability `bonuses`
    getSpeciesAbilityBonusTotal(character, bonusKey) {
        const rank = character.rank || 1;
        const species = DataLoader.getSpecies(character.species?.id);
        let bonus = 0;
        for (const ability of species?.abilities || []) {
            if (ability.bonuses?.[bonusKey] !== undefined) {
                bonus += this.getBonusValue(ability.bonuses[bonusKey], rank);
            }
        }
        return bonus;
    },

    // Sum a stat bonus from talent `bonuses` (each owned instance counts)
    getTalentDataBonusTotal(character, bonusKey) {
        const rank = character.rank || 1;
        let bonus = 0;
        for (const entry of character.talents || []) {
            const talent = DataLoader.getTalent(typeof entry === 'string' ? entry : entry.id);
            if (talent?.bonuses?.[bonusKey] !== undefined) {
                bonus += this.getBonusValue(talent.bonuses[bonusKey], rank);
            }
        }
        return bonus;
    },

    // Combined archetype-ability + species-ability + talent data bonus for a stat
    getAbilityBonusTotal(character, bonusKey) {
        return this.getArchetypeAbilityBonusTotal(character, bonusKey)
            + this.getSpeciesAbilityBonusTotal(character, bonusKey)
            + this.getTalentDataBonusTotal(character, bonusKey);
    },

    // Calculate Defence (Initiative - 1 + Shield AR + Equipment Bonuses + Talent Bonuses + Mutation Bonuses)
    calculateDefence(character, armorBreakdown = null) {
        if (!armorBreakdown) armorBreakdown = this.getArmorBreakdown(character);
        const base = Math.max(0, this.getEffectiveAttribute(character, 'initiative') - 1);
        const shieldAR = armorBreakdown.shieldAR;
        const equipBonus = this.getEquipmentBonusTotal(character, 'defence');
        const talentBonus = this.getTalentTraitBonus(character, 'Defence');
        const mutationBonus = this.getMutationBonusTotal(character, 'defence');
        return base + shieldAR + equipBonus + talentBonus + mutationBonus;
    },

    // Calculate Resilience (Toughness + 1 + Best Armor AR + Shield AR + Equipment Bonuses + Species Sub-Option Bonus + Talent Bonuses)
    calculateResilience(character, armorRatingOrBreakdown = 0) {
        let bestArmorAR, shieldAR;
        if (typeof armorRatingOrBreakdown === 'object' && armorRatingOrBreakdown !== null) {
            bestArmorAR = armorRatingOrBreakdown.bestArmorAR;
            shieldAR = armorRatingOrBreakdown.shieldAR;
        } else {
            // Legacy compat: if a number is passed, use it as bestArmorAR with no shield
            bestArmorAR = armorRatingOrBreakdown;
            shieldAR = 0;
        }
        const base = this.getEffectiveAttribute(character, 'toughness') + 1 + bestArmorAR + shieldAR;
        const subOptionBonus = this.getSpeciesSubOptionBonus(character, 'resilience');
        const equipBonus = this.getEquipmentBonusTotal(character, 'resilience');
        const talentBonus = this.getTalentTraitBonus(character, 'Resilience');
        const mutationBonus = this.getMutationBonusTotal(character, 'resilience');
        const abilityBonus = this.getAbilityBonusTotal(character, 'resilience');
        return base + subOptionBonus + equipBonus + talentBonus + mutationBonus + abilityBonus;
    },

    // Calculate Determination (equal to Toughness + background bonus + Talent Bonuses)
    calculateDetermination(character) {
        const base = this.getEffectiveAttribute(character, 'toughness');
        const backgroundBonus = this.getBackgroundBonus(character, 'determination');
        const talentBonus = this.getTalentTraitBonus(character, 'Determination');
        const abilityBonus = this.getAbilityBonusTotal(character, 'determination');
        return base + backgroundBonus + talentBonus + abilityBonus;
    },

    // Calculate Max Wounds (Tier x 2 + Toughness + Species Bonus + Background Bonus + Talent Bonuses)
    calculateMaxWounds(character) {
        const tier = State.getEffectiveTier ? State.getEffectiveTier() : (character.tier || 1);
        const rank = character.rank || 1;
        const toughness = this.getEffectiveAttribute(character, 'toughness');
        const species = DataLoader.getSpecies(character.species?.id);
        const speciesBonus = species?.woundBonus || 0;
        const backgroundBonus = this.getBackgroundBonus(character, 'maxWounds');

        // Talent bonuses
        let talentBonus = this.getTalentTraitBonus(character, 'Wounds');

        // Feel No Pain: +Rank to Wounds
        if (this.hasTalent(character, 'feel_no_pain')) {
            talentBonus += rank;
        }

        const mutationBonus = this.getMutationBonusTotal(character, 'maxWounds');
        const abilityBonus = this.getAbilityBonusTotal(character, 'maxWounds');
        return (tier * 2) + toughness + speciesBonus + backgroundBonus + talentBonus + mutationBonus + abilityBonus;
    },

    // Calculate Max Shock (Willpower + Tier + Background Bonus + Species Sub-Option Bonus + Talent Bonuses)
    calculateMaxShock(character) {
        let tier = State.getEffectiveTier ? State.getEffectiveTier() : (character.tier || 1);
        const willpower = this.getEffectiveAttribute(character, 'willpower');
        const backgroundBonus = this.getBackgroundBonus(character, 'maxShock');
        const subOptionBonus = this.getSpeciesSubOptionBonus(character, 'maxShock');
        const talentBonus = this.getTalentTraitBonus(character, 'Shock');

        // Lobotomised Efficiency: No longer add Tier to Max Shock
        if (this.hasTalent(character, 'lobotomised_efficiency')) {
            tier = 0;
        }

        const mutationBonus = this.getMutationBonusTotal(character, 'maxShock');
        const abilityBonus = this.getAbilityBonusTotal(character, 'maxShock');
        return willpower + tier + backgroundBonus + subOptionBonus + talentBonus + mutationBonus + abilityBonus;
    },

    // Get Speed from species + Equipment Bonuses + Talent Bonuses
    calculateSpeed(character) {
        const species = DataLoader.getSpecies(character.species?.id);
        const base = species?.speed || 6;
        const equipBonus = this.getEquipmentBonusTotal(character, 'speed');
        const talentBonus = this.getTalentTraitBonus(character, 'Speed');
        const mutationBonus = this.getMutationBonusTotal(character, 'speed');
        const abilityBonus = this.getAbilityBonusTotal(character, 'speed');
        return base + equipBonus + talentBonus + mutationBonus + abilityBonus;
    },

    // Calculate Conviction (equal to Willpower + Background Bonus + Talent Bonuses)
    calculateConviction(character) {
        const rank = character.rank || 1;
        const base = this.getEffectiveAttribute(character, 'willpower');
        const backgroundBonus = this.getBackgroundBonus(character, 'conviction');
        let talentBonus = this.getTalentTraitBonus(character, 'Conviction');

        // Lobotomised Efficiency: +Double Rank to Conviction
        if (this.hasTalent(character, 'lobotomised_efficiency')) {
            talentBonus += rank * 2;
        }

        const abilityBonus = this.getAbilityBonusTotal(character, 'conviction');
        return base + backgroundBonus + talentBonus + abilityBonus;
    },

    // Calculate Resolve (Willpower - 1 + Background Bonus + Talent Bonuses + Mutation Bonuses)
    calculateResolve(character) {
        const rank = character.rank || 1;
        const base = Math.max(0, this.getEffectiveAttribute(character, 'willpower') - 1);
        const backgroundBonus = this.getBackgroundBonus(character, 'resolve');
        let talentBonus = this.getTalentTraitBonus(character, 'Resolve');

        // Lobotomised Efficiency: +Double Rank to Resolve
        if (this.hasTalent(character, 'lobotomised_efficiency')) {
            talentBonus += rank * 2;
        }

        const mutationBonus = this.getMutationBonusTotal(character, 'resolve');
        const abilityBonus = this.getAbilityBonusTotal(character, 'resolve');
        return base + backgroundBonus + talentBonus + mutationBonus + abilityBonus;
    },

    // Calculate Passive Awareness (ceiling of (Intellect + Awareness) / 2 + Talent Bonuses)
    calculatePassiveAwareness(character) {
        const rank = character.rank || 1;
        const intellect = this.getEffectiveAttribute(character, 'intellect');
        const awareness = character.skills?.awareness || 0;
        const base = Math.ceil((intellect + awareness) / 2);
        let talentBonus = 0;

        // Ever Vigilant: +Double Rank to Passive Awareness
        if (this.hasTalent(character, 'ever_vigilant')) {
            talentBonus += rank * 2;
        }

        const mutationBonus = this.getMutationBonusTotal(character, 'passiveAwareness');
        return base + talentBonus + mutationBonus;
    },

    // Calculate Influence (Fellowship - 1 + Archetype Bonus + Background Bonus + Ascension Bonuses)
    calculateInfluence(character) {
        const fellowship = this.getEffectiveAttribute(character, 'fellowship');
        const archetype = DataLoader.getArchetype(character.archetype?.id);
        const archetypeBonus = archetype?.influenceModifier || 0;
        const backgroundBonus = this.getBackgroundBonus(character, 'influence');

        // Sum influence modifiers from ascension packages and archetype ascensions
        let ascensionBonus = 0;
        for (const asc of character.ascensions || []) {
            if (asc.type === 'package' && asc.packageId) {
                const pkg = DataLoader.getAscensionPackages().find(p => p.id === asc.packageId);
                if (pkg) {
                    // Bonuses printed as "+N per Tier Ascended" scale with the tiers gained by this ascension
                    const tiersAscended = this.getTiersAscended(character, asc);
                    ascensionBonus += (pkg.influenceModifier || 0) * (pkg.influencePerTierAscended ? tiersAscended : 1);

                    // Demanding Patron: +2 Influence per Tier Ascended if "influence" choice is selected
                    if (asc.packageId === 'demanding_patron' && asc.choices?.patronBenefit === 'influence') {
                        ascensionBonus += 2 * tiersAscended;
                    }
                }
            }
            if (asc.type === 'archetype' && asc.archetypeId) {
                const arch = DataLoader.getArchetype(asc.archetypeId);
                if (arch) ascensionBonus += arch.influenceModifier || 0;
            }
        }

        return Math.max(0, fellowship - 1 + archetypeBonus + backgroundBonus + ascensionBonus);
    },

    // Tiers gained by a single ascension: experience ascensions are one tier each;
    // a creation ascension spans the archetype's tier up to the campaign's starting tier
    getTiersAscended(character, asc) {
        const startingTier = character.tier || 1;
        if (asc.targetTier > startingTier) return 1;
        const archetypeTier = State.getArchetypeTier ? State.getArchetypeTier() : startingTier;
        return Math.max(1, startingTier - archetypeTier);
    },

    // Calculate Wealth (equal to Effective Tier + Background Bonus)
    calculateWealth(character) {
        const base = State.getEffectiveTier ? State.getEffectiveTier() : (character.tier || 1);
        const backgroundBonus = this.getBackgroundBonus(character, 'wealth');
        return base + backgroundBonus;
    },

    // Get Corruption (tracked value, starts at 0)
    getCorruption(character) {
        return character.corruption || 0;
    },

    // Calculate skill total (Skill Rating + Linked Attribute + Species Sub-Option Bonus)
    calculateSkillTotal(character, skillName) {
        const skillRating = character.skills?.[skillName] || 0;
        const linkedAttr = this.SKILL_ATTRIBUTES[skillName];
        const attrValue = this.getEffectiveAttribute(character, linkedAttr);
        const subOptionBonus = this.getSpeciesSubOptionSkillBonus(character, skillName);
        return skillRating + attrValue + subOptionBonus;
    },

    // Get skill bonus info for display (shows if there's a species sub-option bonus)
    getSkillBonusInfo(character, skillName) {
        const subOptionBonus = this.getSpeciesSubOptionSkillBonus(character, skillName);
        if (subOptionBonus > 0) {
            return { bonus: subOptionBonus, source: 'Path' };
        }
        return null;
    },

    // Get all derived stats as an object
    getAllDerivedStats(character, armorRatingOrBreakdown = 0) {
        // Accept either a number (legacy) or armor breakdown object
        const armorBreakdown = (typeof armorRatingOrBreakdown === 'object' && armorRatingOrBreakdown !== null)
            ? armorRatingOrBreakdown
            : { bestArmorAR: armorRatingOrBreakdown, bestArmorName: null, shieldAR: 0, shieldName: null };

        return {
            defence: this.calculateDefence(character, armorBreakdown),
            resilience: this.calculateResilience(character, armorBreakdown),
            determination: this.calculateDetermination(character),
            maxWounds: this.calculateMaxWounds(character),
            maxShock: this.calculateMaxShock(character),
            speed: this.calculateSpeed(character),
            conviction: this.calculateConviction(character),
            resolve: this.calculateResolve(character),
            passiveAwareness: this.calculatePassiveAwareness(character),
            influence: this.calculateInfluence(character),
            wealth: this.calculateWealth(character),
            corruption: this.getCorruption(character)
        };
    },

    // Calculate weapon damage
    calculateWeaponDamage(weapon, character) {
        if (!weapon) return null;

        let damage = weapon.damage?.base || 0;

        // Add bonus
        damage += weapon.damage?.bonus || 0;

        // Add attribute bonus (usually Strength for melee)
        if (weapon.damage?.attribute) {
            damage += this.getEffectiveAttribute(character, weapon.damage.attribute);
        }

        // Check for talent bonuses to ED
        let ed = weapon.ed || 0;
        for (const talentId of character.talents || []) {
            const talent = DataLoader.getTalent(talentId);
            if (talent?.edBonus) {
                // Check if talent applies to this weapon
                if (this.talentAppliesToWeapon(talent, weapon)) {
                    ed += talent.edBonus;
                }
            }
        }

        return {
            damage: damage,
            ed: ed,
            ap: weapon.ap || 0,
            display: `${damage} + ${ed} ED`,
            displayWithAP: weapon.ap != null && weapon.ap !== 0 ? `${damage} + ${ed} ED, AP ${weapon.ap}` : `${damage} + ${ed} ED`
        };
    },

    // Check if a talent's bonus applies to a weapon
    talentAppliesToWeapon(talent, weapon) {
        if (!talent.appliesTo) return false;

        // Check weapon type
        if (talent.appliesTo.weaponType && talent.appliesTo.weaponType !== weapon.type) {
            return false;
        }

        // Check weapon traits
        if (talent.appliesTo.traits) {
            const weaponTraits = weapon.traits || [];
            const hasRequiredTrait = talent.appliesTo.traits.some(t =>
                weaponTraits.some(wt => wt.toLowerCase().includes(t.toLowerCase()))
            );
            if (!hasRequiredTrait) return false;
        }

        // Check weapon keywords
        if (talent.appliesTo.keywords) {
            const weaponKeywords = weapon.keywords || [];
            const hasRequiredKeyword = talent.appliesTo.keywords.some(k =>
                weaponKeywords.includes(k)
            );
            if (!hasRequiredKeyword) return false;
        }

        return true;
    },

    // Get armor breakdown: best non-shield AR and best shield AR (no stacking)
    getArmorBreakdown(character) {
        let bestArmorAR = 0;
        let bestArmorName = null;
        let shieldAR = 0;
        let shieldName = null;

        for (const item of character.wargear || []) {
            const armor = DataLoader.getArmor(item.id);
            if (!armor) continue;

            const ar = armor.ar || 0;
            const traits = armor.traits || [];
            const isShield = traits.some(t => t === 'Shield');

            if (isShield) {
                if (ar > shieldAR) {
                    shieldAR = ar;
                    shieldName = armor.name;
                }
            } else {
                if (ar > bestArmorAR) {
                    bestArmorAR = ar;
                    bestArmorName = armor.name;
                }
            }
        }

        return { bestArmorAR, bestArmorName, shieldAR, shieldName };
    },

    // Compat wrapper: returns best non-shield AR only
    getTotalArmorRating(character) {
        return this.getArmorBreakdown(character).bestArmorAR;
    },

    // Get all equipment bonuses grouped by key
    getEquipmentBonuses(character) {
        const bonuses = {};

        for (const item of character.wargear || []) {
            const equip = DataLoader.getEquipment(item.id);
            if (!equip?.bonuses) continue;

            for (const [key, value] of Object.entries(equip.bonuses)) {
                if (!bonuses[key]) bonuses[key] = [];
                bonuses[key].push({ value, source: equip.name });
            }
        }

        return bonuses;
    },

    // Sum all equipment bonuses for a given key
    getEquipmentBonusTotal(character, bonusKey) {
        const bonuses = this.getEquipmentBonuses(character);
        if (!bonuses[bonusKey]) return 0;
        return bonuses[bonusKey].reduce((sum, b) => sum + b.value, 0);
    },

    // Get Resilience breakdown for tooltip
    getResilienceBreakdown(character) {
        const armorBreakdown = this.getArmorBreakdown(character);
        const tou = this.getEffectiveAttribute(character, 'toughness');
        const subOptionBonus = this.getSpeciesSubOptionBonus(character, 'resilience');
        const equipBonus = this.getEquipmentBonusTotal(character, 'resilience');
        const talentBonus = this.getTalentTraitBonus(character, 'Resilience');
        const mutationBonuses = this.getMutationBonuses(character)['resilience'] || [];

        const parts = [];
        parts.push({ label: `Base (TOU+1)`, value: tou + 1 });
        if (armorBreakdown.bestArmorAR > 0) {
            parts.push({ label: armorBreakdown.bestArmorName || 'Armor', value: armorBreakdown.bestArmorAR });
        }
        if (armorBreakdown.shieldAR > 0) {
            parts.push({ label: armorBreakdown.shieldName || 'Shield', value: armorBreakdown.shieldAR });
        }
        if (subOptionBonus > 0) {
            parts.push({ label: 'Path', value: subOptionBonus });
        }
        if (equipBonus !== 0) {
            parts.push({ label: 'Equipment', value: equipBonus });
        }
        if (talentBonus !== 0) {
            parts.push({ label: 'Talent', value: talentBonus });
        }
        for (const mb of mutationBonuses) {
            parts.push({ label: mb.source, value: mb.value });
        }

        const total = this.calculateResilience(character, armorBreakdown);
        return { value: total, breakdown: parts };
    },

    // Get Defence breakdown for tooltip
    getDefenceBreakdown(character) {
        const armorBreakdown = this.getArmorBreakdown(character);
        const ini = this.getEffectiveAttribute(character, 'initiative');
        const equipBonus = this.getEquipmentBonusTotal(character, 'defence');
        const talentBonus = this.getTalentTraitBonus(character, 'Defence');
        const mutationBonuses = this.getMutationBonuses(character)['defence'] || [];

        const parts = [];
        parts.push({ label: `Base (INI-1)`, value: Math.max(0, ini - 1) });
        if (armorBreakdown.shieldAR > 0) {
            parts.push({ label: armorBreakdown.shieldName || 'Shield', value: armorBreakdown.shieldAR });
        }
        if (equipBonus !== 0) {
            parts.push({ label: 'Equipment', value: equipBonus });
        }
        if (talentBonus !== 0) {
            parts.push({ label: 'Talent', value: talentBonus });
        }
        for (const mb of mutationBonuses) {
            parts.push({ label: mb.source, value: mb.value });
        }

        const total = this.calculateDefence(character, armorBreakdown);
        return { value: total, breakdown: parts };
    },

    // Format attribute name for display
    formatAttributeName(attrKey) {
        const names = {
            strength: 'Strength',
            toughness: 'Toughness',
            agility: 'Agility',
            initiative: 'Initiative',
            willpower: 'Willpower',
            intellect: 'Intellect',
            fellowship: 'Fellowship'
        };
        return names[attrKey] || attrKey;
    },

    // Format skill name for display
    formatSkillName(skillKey) {
        const names = {
            athletics: 'Athletics',
            awareness: 'Awareness',
            ballisticSkill: 'Ballistic Skill',
            cunning: 'Cunning',
            deception: 'Deception',
            insight: 'Insight',
            intimidation: 'Intimidation',
            investigation: 'Investigation',
            leadership: 'Leadership',
            medicae: 'Medicae',
            persuasion: 'Persuasion',
            pilot: 'Pilot',
            psychicMastery: 'Psychic Mastery',
            scholar: 'Scholar',
            stealth: 'Stealth',
            survival: 'Survival',
            tech: 'Tech',
            weaponSkill: 'Weapon Skill'
        };
        return names[skillKey] || skillKey;
    },

    // Get abbreviated attribute name
    getAttributeAbbrev(attrKey) {
        const abbrevs = {
            strength: 'Str',
            toughness: 'Tou',
            agility: 'Agi',
            initiative: 'Ini',
            willpower: 'Wil',
            intellect: 'Int',
            fellowship: 'Fel'
        };
        return abbrevs[attrKey] || attrKey.substring(0, 3);
    }
};
