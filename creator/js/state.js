// State Manager - Manages character state and updates

const State = {
    // Current character state
    character: null,

    // Game data reference
    gameData: null,

    // Enabled source books
    enabledSources: ['core', 'fspg', 'redacted1', 'redacted2', 'church', 'voa', 'aeldari', 'apocrypha', 'dh', 'shotguns'],

    // House rule: ignore prerequisites/requirements when selecting content
    ignorePrerequisites: false,

    // Event listeners for state changes
    listeners: [],

    // Dirty state tracking - true when character has unsaved changes
    isDirty: false,

    // Auto-save support
    _autoSaveTimer: null,
    _AUTO_SAVE_KEY: 'wng-creator-autosave',

    // Initialize state with default character
    init(gameData) {
        this.gameData = gameData;
        this.character = this.createNewCharacter();
    },

    // Create a new blank character
    createNewCharacter() {
        return {
            name: '',
            tier: 1,
            rank: 1,
            additionalXp: 0,
            setting: '',

            species: {
                id: null,
                xpCost: 0,
                subOptions: []  // Array of { type, optionId } for selected sub-options
            },

            archetype: {
                id: null,
                xpCost: 0
            },

            customArchetype: {
                name: '',
                abilityArchetypeId: null,
                keywords: [],
                wargear: []
            },

            ascensions: [],
            // Each entry: { targetTier: N, type: 'package'|'archetype', packageId: 'id'|null, archetypeId: 'id'|null }

            attributes: {
                strength: 1,
                toughness: 1,
                agility: 1,
                initiative: 1,
                willpower: 1,
                intellect: 1,
                fellowship: 1
            },

            skills: {
                athletics: 0,
                awareness: 0,
                ballisticSkill: 0,
                cunning: 0,
                deception: 0,
                insight: 0,
                intimidation: 0,
                investigation: 0,
                leadership: 0,
                medicae: 0,
                persuasion: 0,
                pilot: 0,
                psychicMastery: 0,
                scholar: 0,
                stealth: 0,
                survival: 0,
                tech: 0,
                weaponSkill: 0
            },

            talents: [],
            wargear: [],
            psychicPowers: [],
            freePowers: [],
            unlockedDisciplines: [],

            background: {
                origin: null,
                accomplishment: null,
                goal: null,
                bonusUsed: null
            },

            memorableInjuries: [],   // [{ id, escalated }]
            traumaticInjuries: [],   // [{ id, side }]  (side: "left"/"right"/null)
            mutations: [],           // [{ id, subChoice }]  (subChoice: sub-option id or null)

            languages: ['low_gothic'],
            freeLanguages: [],
            notes: '',
            corruption: 0,

            // Session tracking (current values that change during play)
            currentWounds: null,  // null means full (equal to max)
            currentShock: null,   // null means full (equal to max)
            currentWealth: null,  // null means equal to base wealth
            currentWrath: null,   // null means default (2)
            currentFaith: null    // null means equal to max faith
        };
    },

    // Mark state as clean (no unsaved changes)
    markClean() {
        this.isDirty = false;
    },

    // Reset character to new
    newCharacter() {
        this.character = this.createNewCharacter();
        this.notifyListeners('reset');
        this.isDirty = false;
        this.clearAutoSave();
    },

    // Load a character from data
    loadCharacter(data) {
        const newChar = this.createNewCharacter();
        this.character = { ...newChar, ...data };

        // Ensure species subOptions is properly initialized
        if (this.character.species && !this.character.species.subOptions) {
            this.character.species.subOptions = [];
        }

        // Migrate old ascensionPackages array to new ascensions format
        if (this.character.ascensionPackages && !this.character.ascensions) {
            const startingTier = this.character.tier || 1;
            this.character.ascensions = this.character.ascensionPackages.map((packageId, index) => ({
                targetTier: startingTier + index + 1,
                type: 'package',
                packageId: packageId,
                archetypeId: null
            }));
        }
        if (this.character.ascensionPackages) {
            delete this.character.ascensionPackages;
        }
        if (!this.character.ascensions) {
            this.character.ascensions = [];
        }

        this.notifyListeners('load');
        this.isDirty = false;
    },

    // Get current character
    getCharacter() {
        return this.character;
    },

    // Update character name
    setName(name) {
        this.character.name = name;
        this.notifyListeners('name');
    },

    // Update tier
    setTier(tier) {
        const oldTier = this.character.tier;
        this.character.tier = parseInt(tier) || 1;
        this.notifyListeners('tier');

        // If Kroot and tier increased, notify that more mutations may be available
        if (this.character.species?.id === 'kroot' && this.character.tier > oldTier) {
            this.notifyListeners('krootMutationsAvailable');
        }
    },

    // Update rank
    setRank(rank) {
        this.character.rank = parseInt(rank) || 1;
        this.notifyListeners('rank');
    },

    // Update additional XP
    setAdditionalXP(xp) {
        this.character.additionalXp = parseInt(xp) || 0;
        this.notifyListeners('xp');
    },

    // Update setting description
    setSetting(setting) {
        this.character.setting = setting;
        this.notifyListeners('setting');
    },

    // Set species
    setSpecies(speciesId) {
        const species = DataLoader.getSpecies(speciesId);
        if (species) {
            this.character.species = {
                id: speciesId,
                xpCost: species.cost || 0,
                subOptions: []  // Clear sub-options when species changes
            };

            // Apply species base attributes
            if (species.baseAttributes) {
                for (const [attr, value] of Object.entries(species.baseAttributes)) {
                    this.character.attributes[attr] = Math.max(this.character.attributes[attr], value);
                }
            }

            // Always clear archetype when species changes (user must re-select)
            if (this.character.archetype.id) {
                this.clearArchetype();
            }
        } else {
            this.character.species = { id: null, xpCost: 0, subOptions: [] };
        }

        this.notifyListeners('species');
    },

    // Set a species sub-option (chapter, path, mutation, etc.)
    setSpeciesSubOption(type, optionId) {
        if (!this.character.species.subOptions) {
            this.character.species.subOptions = [];
        }

        // For mutation type, we allow multiple selections
        const species = DataLoader.getSpecies(this.character.species.id);
        const subOptionsConfig = this.getSubOptionsConfig(species);
        const config = Array.isArray(subOptionsConfig)
            ? subOptionsConfig.find(c => c.type === type)
            : (subOptionsConfig?.type === type ? subOptionsConfig : null);

        if (config?.countByTier) {
            // Multi-select type (like mutations) - add if not already present
            const existing = this.character.species.subOptions.find(
                opt => opt.type === type && opt.optionId === optionId
            );
            if (!existing) {
                this.character.species.subOptions.push({ type, optionId });
            }
        } else {
            // Single-select type - replace any existing option of this type
            const existingIndex = this.character.species.subOptions.findIndex(opt => opt.type === type);
            if (existingIndex >= 0) {
                this.character.species.subOptions[existingIndex] = { type, optionId };
            } else {
                this.character.species.subOptions.push({ type, optionId });
            }
        }

        this.notifyListeners('speciesSubOption', { type, optionId });
    },

    // Remove a species sub-option
    removeSpeciesSubOption(type, optionId) {
        if (!this.character.species.subOptions) return;

        const index = this.character.species.subOptions.findIndex(
            opt => opt.type === type && opt.optionId === optionId
        );
        if (index >= 0) {
            this.character.species.subOptions.splice(index, 1);
            this.notifyListeners('speciesSubOption', { type, optionId, removed: true });
        }
    },

    // Get all selected sub-options for the current species
    getSpeciesSubOptions() {
        return this.character.species?.subOptions || [];
    },

    // Get selected sub-option(s) for a specific type
    getSpeciesSubOptionsByType(type) {
        return (this.character.species?.subOptions || []).filter(opt => opt.type === type);
    },

    // Helper to get sub-options config from species (handles both single object and array format)
    getSubOptionsConfig(species) {
        if (!species?.subOptions) return null;
        return species.subOptions;
    },

    // Check how many mutations a Kroot can have based on tier
    getKrootMutationCount() {
        return this.character.tier || 1;
    },

    // Check if more Kroot mutations are available
    canAddMoreKrootMutations() {
        if (this.character.species?.id !== 'kroot') return false;
        const currentMutations = this.getSpeciesSubOptionsByType('mutation');
        return currentMutations.length < this.getKrootMutationCount();
    },

    // Set a sub-faction keyword choice for an archetype bracket keyword (e.g. "[FORGE WORLD]" -> "MARS")
    setArchetypeKeywordChoice(placeholder, value) {
        if (!this.character.archetypeKeywordChoices) this.character.archetypeKeywordChoices = {};
        this.character.archetypeKeywordChoices[placeholder] = value;
        this.notifyListeners('archetypeKeywords');
    },

    // Set archetype
    setArchetype(archetypeId) {
        const archetype = DataLoader.getArchetype(archetypeId);
        if (archetype) {
            this.character.archetype = {
                id: archetypeId,
                xpCost: archetype.cost || 0
            };

            // Reset sub-faction keyword picks from any previous archetype
            this.character.archetypeKeywordChoices = {};

            // Apply archetype attribute bonuses
            if (archetype.attributeBonus) {
                for (const [attr, value] of Object.entries(archetype.attributeBonus)) {
                    this.character.attributes[attr] = Math.max(this.character.attributes[attr], value);
                }
            }

            // Apply archetype skill bonuses
            if (archetype.skillBonus) {
                for (const [skill, value] of Object.entries(archetype.skillBonus)) {
                    this.character.skills[skill] = Math.max(this.character.skills[skill], value);
                }
            }

            // Wargear is managed via the Wargear tab "Add Starting Wargear" button.
            // We do NOT clear or set wargear here to avoid losing manually added items.

            // Set up psyker starting powers if archetype has psykerConfig
            if (archetype.psykerConfig) {
                this.character.freePowers = [];
                this.character.unlockedDisciplines = [];
                this.character.psychicPowers = [];

                // Auto-add granted powers (e.g. Smite)
                for (const powerId of archetype.psykerConfig.grantedPowers || []) {
                    if (!this.character.psychicPowers.includes(powerId)) {
                        this.character.psychicPowers.push(powerId);
                    }
                    if (!this.character.freePowers.includes(powerId)) {
                        this.character.freePowers.push(powerId);
                    }
                }
            }

        } else {
            this.clearArchetype();
        }

        this.notifyListeners('archetype');
    },

    // Clear archetype selection
    clearArchetype() {
        this.character.archetype = { id: null, xpCost: 0 };
        this.character.customArchetype = { name: '', abilityArchetypeId: null, keywords: [], wargear: [] };
        this.character.freePowers = [];
        this.character.unlockedDisciplines = [];
        this.character.psychicPowers = [];
        this.resetStats();
    },

    // Check if character is using custom archetype
    isCustomArchetype() {
        return this.character.archetype?.id === 'custom';
    },

    // Wargear budget by tier for custom archetype
    WARGEAR_BUDGET: {
        1: { totalValue: 15, maxValue: 7, maxRarity: 'Uncommon' },
        2: { totalValue: 20, maxValue: 9, maxRarity: 'Rare' },
        3: { totalValue: 25, maxValue: 10, maxRarity: 'Very Rare' },
        4: { totalValue: 30, maxValue: null, maxRarity: 'Very Rare' },
        5: { totalValue: 35, maxValue: null, maxRarity: null }
    },

    RARITY_ORDER: ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique'],

    // Set custom archetype mode
    setCustomArchetype() {
        this.character.archetype = { id: 'custom', xpCost: 0 };
        this.character.customArchetype = { name: '', abilityArchetypeId: null, keywords: [], wargear: [] };
        this.character.wargear = [];
        this.resetStats();
        this.notifyListeners('archetype');
    },

    // Set custom archetype name
    setCustomArchetypeName(name) {
        this.character.customArchetype.name = name;
        this.notifyListeners('customArchetype');
    },

    // Set custom archetype ability (archetypeId whose ability is purchased, or null)
    setCustomArchetypeAbility(archetypeId) {
        this.character.customArchetype.abilityArchetypeId = archetypeId || null;

        // Set up psyker starting powers if the ability archetype has psykerConfig
        const abilityArchetype = archetypeId ? DataLoader.getArchetype(archetypeId) : null;
        if (abilityArchetype?.psykerConfig) {
            this.character.freePowers = [];
            this.character.unlockedDisciplines = [];
            this.character.psychicPowers = [];

            // Auto-add granted powers (e.g. Smite)
            for (const powerId of abilityArchetype.psykerConfig.grantedPowers || []) {
                if (!this.character.psychicPowers.includes(powerId)) {
                    this.character.psychicPowers.push(powerId);
                }
                if (!this.character.freePowers.includes(powerId)) {
                    this.character.freePowers.push(powerId);
                }
            }
        } else {
            // Clear psyker state when switching away from a psyker ability
            this.character.freePowers = [];
            this.character.unlockedDisciplines = [];
            this.character.psychicPowers = [];
        }

        this.notifyListeners('customArchetype');
    },

    // Add a custom keyword
    addCustomKeyword(keyword) {
        const upper = keyword.toUpperCase().trim();
        if (upper && !this.character.customArchetype.keywords.includes(upper)) {
            this.character.customArchetype.keywords.push(upper);
            this.notifyListeners('customArchetype');
        }
    },

    // Remove a custom keyword
    removeCustomKeyword(keyword) {
        const index = this.character.customArchetype.keywords.indexOf(keyword);
        if (index !== -1) {
            this.character.customArchetype.keywords.splice(index, 1);
            this.notifyListeners('customArchetype');
        }
    },

    // Get wargear budget for current tier
    getWargearBudget() {
        return this.WARGEAR_BUDGET[this.character.tier] || this.WARGEAR_BUDGET[1];
    },

    // Get total value of custom starting wargear
    getWargearBudgetUsed() {
        let total = 0;
        for (const itemId of this.character.customArchetype.wargear) {
            const item = DataLoader.getWargearItem(itemId);
            if (item) total += item.value || 0;
        }
        return total;
    },

    // Check if a wargear item is within budget constraints
    canAddCustomWargear(itemId) {
        const item = DataLoader.getWargearItem(itemId);
        if (!item) return false;

        const budget = this.getWargearBudget();
        const used = this.getWargearBudgetUsed();
        const itemValue = item.value || 0;

        // Check total value
        if (used + itemValue > budget.totalValue) return false;

        // Check max value per item
        if (budget.maxValue !== null && itemValue > budget.maxValue) return false;

        // Check rarity
        if (budget.maxRarity !== null) {
            const itemRarityIndex = this.RARITY_ORDER.indexOf(item.rarity || 'Common');
            const maxRarityIndex = this.RARITY_ORDER.indexOf(budget.maxRarity);
            if (itemRarityIndex > maxRarityIndex) return false;
        }

        return true;
    },

    // Add custom starting wargear
    addCustomStartingWargear(itemId) {
        if (this.canAddCustomWargear(itemId)) {
            this.character.customArchetype.wargear.push(itemId);
            // Also add to main wargear list as starting gear
            this.character.wargear.push({ id: itemId, isStarting: true });
            this.notifyListeners('customArchetype');
            this.notifyListeners('wargear', itemId);
        }
    },

    // Remove custom starting wargear
    removeCustomStartingWargear(index) {
        if (index >= 0 && index < this.character.customArchetype.wargear.length) {
            const itemId = this.character.customArchetype.wargear[index];
            this.character.customArchetype.wargear.splice(index, 1);
            // Also remove from main wargear list (find the matching starting item)
            const wargearIndex = this.character.wargear.findIndex(w => w.id === itemId && w.isStarting);
            if (wargearIndex !== -1) {
                this.character.wargear.splice(wargearIndex, 1);
            }
            this.notifyListeners('customArchetype');
            this.notifyListeners('wargear', itemId);
        }
    },

    // Reset attributes and skills to species baseline
    resetStats() {
        const species = DataLoader.getSpecies(this.character.species?.id);
        const archetype = DataLoader.getArchetype(this.character.archetype?.id);

        // Reset attributes
        for (const attr of Object.keys(this.character.attributes)) {
            let value = 1;
            if (species?.baseAttributes?.[attr]) {
                value = Math.max(value, species.baseAttributes[attr]);
            }
            if (archetype?.attributeBonus?.[attr]) {
                value = Math.max(value, archetype.attributeBonus[attr]);
            }
            this.character.attributes[attr] = value;
        }

        // Reset skills
        for (const skill of Object.keys(this.character.skills)) {
            let value = 0;
            if (archetype?.skillBonus?.[skill]) {
                value = Math.max(value, archetype.skillBonus[skill]);
            }
            this.character.skills[skill] = value;
        }

        this.notifyListeners('stats');
    },

    // Increase an attribute
    increaseAttribute(attr) {
        const species = DataLoader.getSpecies(this.character.species?.id);
        const max = species?.attributeMaximums?.[attr] || 8;
        const current = this.character.attributes[attr] || 1;

        if (current < max) {
            const cost = XPCalculator.getNextAttributeCost(current);
            if (cost !== null && XPCalculator.canAfford(this.character, cost)) {
                this.character.attributes[attr] = current + 1;
                this.notifyListeners('attribute', attr);
                return true;
            }
        }
        return false;
    },

    // Decrease an attribute
    decreaseAttribute(attr) {
        const species = DataLoader.getSpecies(this.character.species?.id);
        const archetype = DataLoader.getArchetype(this.character.archetype?.id);

        // Calculate minimum (species base or archetype bonus, whichever is higher)
        let min = 1;
        if (species?.baseAttributes?.[attr]) {
            min = Math.max(min, species.baseAttributes[attr]);
        }
        if (archetype?.attributeBonus?.[attr]) {
            min = Math.max(min, archetype.attributeBonus[attr]);
        }

        const current = this.character.attributes[attr] || 1;
        if (current > min) {
            this.character.attributes[attr] = current - 1;
            this.notifyListeners('attribute', attr);
            return true;
        }
        return false;
    },

    // Increase a skill
    increaseSkill(skill) {
        const current = this.character.skills[skill] || 0;
        const max = 8;

        if (current < max) {
            const cost = XPCalculator.getNextSkillCost(current);
            if (cost !== null && XPCalculator.canAfford(this.character, cost)) {
                this.character.skills[skill] = current + 1;
                this.notifyListeners('skill', skill);
                return true;
            }
        }
        return false;
    },

    // Decrease a skill
    decreaseSkill(skill) {
        const archetype = DataLoader.getArchetype(this.character.archetype?.id);
        const min = archetype?.skillBonus?.[skill] || 0;
        const current = this.character.skills[skill] || 0;

        if (current > min) {
            this.character.skills[skill] = current - 1;
            this.notifyListeners('skill', skill);
            return true;
        }
        return false;
    },

    // Add a talent (with optional choice for talents that require it)
    addTalent(talentId, choice = null) {
        const talent = DataLoader.getTalent(talentId);
        if (!talent) return false;

        // Check if already has this talent (skip check for repeatable talents)
        if (!talent.repeatable) {
            const hasTalent = this.character.talents.some(t =>
                (typeof t === 'string' ? t : t.id) === talentId
            );
            if (hasTalent) return false;
        }

        if (XPCalculator.canAfford(this.character, talent.cost || 0)) {
            // Store as object if choice provided, otherwise just the ID
            if (choice !== null) {
                this.character.talents.push({ id: talentId, choice: choice });
            } else {
                this.character.talents.push(talentId);
            }
            this.notifyListeners('talent', talentId);
            return true;
        }
        return false;
    },

    // Remove a talent (by index for repeatable talents, or first match by ID)
    removeTalent(talentId, index = -1) {
        if (index === -1) {
            index = this.character.talents.findIndex(t =>
                (typeof t === 'string' ? t : t.id) === talentId
            );
        }
        if (index !== -1 && index < this.character.talents.length) {
            this.character.talents.splice(index, 1);
            this.notifyListeners('talent', talentId);
            return true;
        }
        return false;
    },

    // Get talent entry (returns { id, choice } or { id } for string entries)
    getTalentEntry(talentId) {
        const entry = this.character.talents.find(t =>
            (typeof t === 'string' ? t : t.id) === talentId
        );
        if (!entry) return null;
        return typeof entry === 'string' ? { id: entry } : entry;
    },

    // Check if character has a specific talent
    hasTalent(talentId) {
        return this.character.talents.some(t =>
            (typeof t === 'string' ? t : t.id) === talentId
        );
    },

    // Add a psychic power
    addPower(powerId) {
        if (!this.character.psychicPowers.includes(powerId)) {
            const power = DataLoader.getPsychicPower(powerId);
            if (power && XPCalculator.canAfford(this.character, XPCalculator.getEffectivePowerCost(power, this.character))) {
                this.character.psychicPowers.push(powerId);
                this.notifyListeners('power', powerId);
                return true;
            }
        }
        return false;
    },

    // Remove a psychic power
    removePower(powerId) {
        const index = this.character.psychicPowers.indexOf(powerId);
        if (index !== -1) {
            this.character.psychicPowers.splice(index, 1);
            // Also remove from freePowers if present
            const freeIndex = (this.character.freePowers || []).indexOf(powerId);
            if (freeIndex !== -1) {
                this.character.freePowers.splice(freeIndex, 1);
            }
            this.notifyListeners('power', powerId);
            return true;
        }
        return false;
    },

    // Add wargear (each item is a separate entry, no qty - call multiple times for multiples)
    addWargear(itemId, isStarting = false) {
        this.character.wargear.push({ id: itemId, isStarting: isStarting });
        this.notifyListeners('wargear', itemId);
    },

    // Remove wargear by ID (first match)
    removeWargear(itemId) {
        const index = this.character.wargear.findIndex(w => w.id === itemId);
        if (index !== -1) {
            this.character.wargear.splice(index, 1);
            this.notifyListeners('wargear', itemId);
            return true;
        }
        return false;
    },

    // Remove wargear by index (for handling multiple copies of same item)
    removeWargearByIndex(wargearIndex) {
        if (wargearIndex >= 0 && wargearIndex < this.character.wargear.length) {
            const item = this.character.wargear[wargearIndex];
            this.character.wargear.splice(wargearIndex, 1);
            this.notifyListeners('wargear', item.id);
            return true;
        }
        return false;
    },

    // Toggle weapon equipped status (for Simultaneous Strike tracking)
    // Uses array index for unique identification when same weapon appears multiple times
    toggleWeaponEquipped(wargearIndex) {
        if (wargearIndex >= 0 && wargearIndex < this.character.wargear.length) {
            const item = this.character.wargear[wargearIndex];
            item.equipped = !item.equipped;
            this.notifyListeners('wargear', wargearIndex);
            return item.equipped;
        }
        return false;
    },

    // Get equipped weapons with their indices
    getEquippedWeapons() {
        const equipped = [];
        for (let i = 0; i < (this.character.wargear || []).length; i++) {
            const item = this.character.wargear[i];
            if (item.equipped) {
                const weapon = DataLoader.getWeapon(item.id);
                if (weapon) {
                    equipped.push({ ...weapon, wargearIndex: i });
                }
            }
        }
        return equipped;
    },

    // Check if weapon at index is equipped
    isWeaponEquipped(wargearIndex) {
        if (wargearIndex >= 0 && wargearIndex < this.character.wargear.length) {
            return this.character.wargear[wargearIndex].equipped || false;
        }
        return false;
    },

    // Add an upgrade to a weapon at the specified wargear index
    addWeaponUpgrade(wargearIndex, upgradeId) {
        if (wargearIndex >= 0 && wargearIndex < this.character.wargear.length) {
            const item = this.character.wargear[wargearIndex];
            const weapon = DataLoader.getWeapon(item.id);

            // Only weapons can have upgrades
            if (!weapon) return false;

            // Initialize upgrades array if needed
            if (!item.upgrades) {
                item.upgrades = [];
            }

            // Check if upgrade is valid
            const validUpgrades = DataLoader.getValidUpgradesForWeapon(weapon, item.upgrades);
            const isValid = validUpgrades.some(u => u.id === upgradeId);

            if (isValid && !item.upgrades.includes(upgradeId)) {
                item.upgrades.push(upgradeId);
                this.notifyListeners('wargear', wargearIndex);
                return true;
            }
        }
        return false;
    },

    // Remove an upgrade from a weapon at the specified wargear index
    removeWeaponUpgrade(wargearIndex, upgradeId) {
        if (wargearIndex >= 0 && wargearIndex < this.character.wargear.length) {
            const item = this.character.wargear[wargearIndex];
            if (item.upgrades) {
                const idx = item.upgrades.indexOf(upgradeId);
                if (idx !== -1) {
                    item.upgrades.splice(idx, 1);
                    this.notifyListeners('wargear', wargearIndex);
                    return true;
                }
            }
        }
        return false;
    },

    // Get upgrades for a weapon at the specified wargear index
    getWeaponUpgrades(wargearIndex) {
        if (wargearIndex >= 0 && wargearIndex < this.character.wargear.length) {
            return this.character.wargear[wargearIndex].upgrades || [];
        }
        return [];
    },

    // Set background option
    setBackground(type, backgroundId, bonusType = null) {
        this.character.background[type] = backgroundId ? { id: backgroundId, bonusType: bonusType } : null;
        this.notifyListeners('background', type);
    },

    // Use background bonus
    useBackgroundBonus(type) {
        this.character.background.bonusUsed = type;
        this.notifyListeners('background', 'bonus');
    },

    // Add language (costs 1 XP each beyond Low Gothic, unless free)
    addLanguage(language, isFree = false) {
        if (!this.character.languages.includes(language)) {
            if (!isFree && !XPCalculator.canAfford(this.character, 1)) {
                return false;
            }
            this.character.languages.push(language);
            if (isFree) {
                if (!this.character.freeLanguages) this.character.freeLanguages = [];
                this.character.freeLanguages.push(language);
            }
            this.notifyListeners('language', language);
            return true;
        }
        return false;
    },

    // Remove language
    removeLanguage(language) {
        if (language !== 'low_gothic') { // Can't remove Low Gothic
            const index = this.character.languages.indexOf(language);
            if (index !== -1) {
                this.character.languages.splice(index, 1);
                // Also remove from freeLanguages if present
                const freeIndex = (this.character.freeLanguages || []).indexOf(language);
                if (freeIndex !== -1) {
                    this.character.freeLanguages.splice(freeIndex, 1);
                }
                this.notifyListeners('language', language);
            }
        }
    },

    // Set notes
    setNotes(notes) {
        this.character.notes = notes;
        this.notifyListeners('notes');
    },

    // === INJURIES & CORRUPTION ===

    // Add a memorable injury
    addMemorableInjury(injuryId) {
        if (!this.character.memorableInjuries) this.character.memorableInjuries = [];
        this.character.memorableInjuries.push({ id: injuryId, escalated: false });
        this.notifyListeners('injuries');
    },

    // Remove a memorable injury by index
    removeMemorableInjury(index) {
        if (!this.character.memorableInjuries) return;
        if (index >= 0 && index < this.character.memorableInjuries.length) {
            this.character.memorableInjuries.splice(index, 1);
            this.notifyListeners('injuries');
        }
    },

    // Toggle escalation on a memorable injury
    escalateMemorableInjury(index) {
        if (!this.character.memorableInjuries) return;
        if (index >= 0 && index < this.character.memorableInjuries.length) {
            this.character.memorableInjuries[index].escalated = !this.character.memorableInjuries[index].escalated;
            this.notifyListeners('injuries');
        }
    },

    // Add a traumatic injury
    addTraumaticInjury(injuryId, side = null) {
        if (!this.character.traumaticInjuries) this.character.traumaticInjuries = [];
        this.character.traumaticInjuries.push({ id: injuryId, side: side });
        this.notifyListeners('injuries');
    },

    // Remove a traumatic injury by index
    removeTraumaticInjury(index) {
        if (!this.character.traumaticInjuries) return;
        if (index >= 0 && index < this.character.traumaticInjuries.length) {
            this.character.traumaticInjuries.splice(index, 1);
            this.notifyListeners('injuries');
        }
    },

    // Toggle reconstruction on a traumatic injury
    toggleTraumaticReconstruction(index) {
        if (!this.character.traumaticInjuries) return;
        if (index >= 0 && index < this.character.traumaticInjuries.length) {
            this.character.traumaticInjuries[index].reconstructed = !this.character.traumaticInjuries[index].reconstructed;
            this.notifyListeners('injuries');
        }
    },

    // Set corruption points
    setCorruptionPoints(value) {
        this.character.corruption = Math.max(0, parseInt(value) || 0);
        this.notifyListeners('injuries');
    },

    // Add a mutation
    addMutation(mutationId, subChoice = null) {
        if (!this.character.mutations) this.character.mutations = [];
        this.character.mutations.push({ id: mutationId, subChoice: subChoice });
        this.notifyListeners('injuries');
    },

    // Remove a mutation by index
    removeMutation(index) {
        if (!this.character.mutations) return;
        if (index >= 0 && index < this.character.mutations.length) {
            this.character.mutations.splice(index, 1);
            this.notifyListeners('injuries');
        }
    },

    // === SESSION TRACKING (Current Wounds, Shock, Wealth) ===
    // Note: Wounds and Shock count UP from 0 (tracking damage taken)

    // Get current wounds (null means 0, tracks damage taken)
    getCurrentWounds() {
        return this.character.currentWounds || 0;
    },

    // Set current wounds (capped at max)
    setCurrentWounds(value) {
        const max = DerivedStats.calculateMaxWounds(this.character);
        this.character.currentWounds = Math.max(0, Math.min(value, max));
        if (this.character.currentWounds === 0) {
            this.character.currentWounds = null; // Store as null when 0
        }
        this.notifyListeners('currentWounds');
    },

    // Modify current wounds by delta (positive = take damage, negative = heal)
    modifyCurrentWounds(delta) {
        const current = this.getCurrentWounds();
        this.setCurrentWounds(current + delta);
    },

    // Get current shock (null means 0, tracks shock taken)
    getCurrentShock() {
        return this.character.currentShock || 0;
    },

    // Set current shock (capped at max)
    setCurrentShock(value) {
        const max = DerivedStats.calculateMaxShock(this.character);
        this.character.currentShock = Math.max(0, Math.min(value, max));
        if (this.character.currentShock === 0) {
            this.character.currentShock = null; // Store as null when 0
        }
        this.notifyListeners('currentShock');
    },

    // Modify current shock by delta (positive = take shock, negative = recover)
    modifyCurrentShock(delta) {
        const current = this.getCurrentShock();
        this.setCurrentShock(current + delta);
    },

    // Get current wealth (null means equal to base)
    getCurrentWealth() {
        const base = DerivedStats.calculateWealth(this.character);
        if (this.character.currentWealth === null) {
            return base;
        }
        return this.character.currentWealth;
    },

    // Set current wealth
    setCurrentWealth(value) {
        const base = DerivedStats.calculateWealth(this.character);
        if (value === base) {
            this.character.currentWealth = null;
        } else {
            this.character.currentWealth = Math.max(0, value);
        }
        this.notifyListeners('currentWealth');
    },

    // Modify current wealth by delta (positive = gain, negative = spend)
    modifyCurrentWealth(delta) {
        const current = this.getCurrentWealth();
        this.setCurrentWealth(current + delta);
    },

    // Reset session values (wounds/shock to 0, wealth to base)
    resetSessionValues() {
        this.character.currentWounds = null;
        this.character.currentShock = null;
        this.character.currentWealth = null;
        this.character.currentWrath = null;
        this.character.currentFaith = null;
        this.notifyListeners('sessionReset');
    },

    // === WRATH AND FAITH TRACKING ===

    // Get max Faith from talents (count talents with "You gain +1 Faith." in description)
    getMaxFaith() {
        let faith = 0;
        for (const talentEntry of this.character.talents) {
            const talentId = typeof talentEntry === 'string' ? talentEntry : talentEntry.id;
            const talent = DataLoader.getTalent(talentId);
            if (talent && talent.effect && talent.effect.includes('You gain +1 Faith.')) {
                faith += 1;
            }
        }
        return faith;
    },

    // Get current Wrath (null means default of 2)
    getCurrentWrath() {
        if (this.character.currentWrath === null) {
            return 2; // Default Wrath is 2
        }
        return this.character.currentWrath;
    },

    // Set current Wrath (no upper limit, minimum 0)
    setCurrentWrath(value) {
        const newValue = Math.max(0, value);
        if (newValue === 2) {
            this.character.currentWrath = null; // Store as null when at default
        } else {
            this.character.currentWrath = newValue;
        }
        this.notifyListeners('currentWrath');
    },

    // Modify current Wrath by delta
    modifyCurrentWrath(delta) {
        const current = this.getCurrentWrath();
        this.setCurrentWrath(current + delta);
    },

    // Get current Faith (null means equal to max)
    getCurrentFaith() {
        const max = this.getMaxFaith();
        if (this.character.currentFaith === null) {
            return max; // Default to max faith
        }
        return this.character.currentFaith;
    },

    // Set current Faith (capped at max, minimum 0)
    setCurrentFaith(value) {
        const max = this.getMaxFaith();
        const newValue = Math.max(0, Math.min(value, max));
        if (newValue === max) {
            this.character.currentFaith = null; // Store as null when at max
        } else {
            this.character.currentFaith = newValue;
        }
        this.notifyListeners('currentFaith');
    },

    // Modify current Faith by delta
    modifyCurrentFaith(delta) {
        const current = this.getCurrentFaith();
        this.setCurrentFaith(current + delta);
    },

    // Reset Wrath and Faith to session defaults (Wrath=2, Faith=max)
    resetWrathAndFaith() {
        this.character.currentWrath = null;
        this.character.currentFaith = null;
        this.notifyListeners('wrathFaithReset');
    },

    // Set or clear an ascension for a specific target tier
    // data = { type: 'package'|'archetype', packageId, archetypeId, choices } or null to clear
    setAscension(targetTier, data) {
        if (!this.character.ascensions) this.character.ascensions = [];

        // Get old entry to clean up its effects
        const oldEntry = this.character.ascensions.find(a => a.targetTier === targetTier);
        if (oldEntry) {
            this._removeAscensionEffects(oldEntry);
        }

        // Remove any existing entry for this target tier
        this.character.ascensions = this.character.ascensions.filter(a => a.targetTier !== targetTier);

        if (data) {
            const entry = {
                targetTier: targetTier,
                type: data.type,
                packageId: data.packageId || null,
                archetypeId: data.archetypeId || null
            };
            // Preserve choices if provided
            if (data.choices) {
                entry.choices = data.choices;
            }
            this.character.ascensions.push(entry);
            // Sort by targetTier for consistency
            this.character.ascensions.sort((a, b) => a.targetTier - b.targetTier);

            // Apply effects from the new package
            this._applyAscensionEffects(entry);
        }

        this.notifyListeners('ascension', targetTier);
    },

    // Apply mechanical effects from an ascension package
    _applyAscensionEffects(entry) {
        if (entry.type !== 'package' || !entry.packageId) return;
        const pkg = DataLoader.getAscensionPackages().find(p => p.id === entry.packageId);
        if (!pkg) return;

        // Auto-grant talents
        if (pkg.talentsGranted) {
            for (const talentId of pkg.talentsGranted) {
                // Add as ascension-granted (won't cost XP, can't be manually removed)
                const hasTalent = this.character.talents.some(t =>
                    (typeof t === 'string' ? t : t.id) === talentId
                );
                if (!hasTalent) {
                    this.character.talents.push({ id: talentId, ascensionGranted: true });
                }
            }
        }

        // Auto-grant psychic powers
        if (pkg.psykerConfig?.grantedPowers) {
            for (const powerId of pkg.psykerConfig.grantedPowers) {
                if (!this.character.psychicPowers.includes(powerId)) {
                    this.character.psychicPowers.push(powerId);
                }
                if (!this.character.freePowers) this.character.freePowers = [];
                if (!this.character.freePowers.includes(powerId)) {
                    this.character.freePowers.push(powerId);
                }
            }
        }

        // Auto-grant specific powers (e.g., Lost Upon The Seer Path)
        if (pkg.powersGranted) {
            for (const powerId of pkg.powersGranted) {
                if (!this.character.psychicPowers.includes(powerId)) {
                    this.character.psychicPowers.push(powerId);
                }
                if (!this.character.freePowers) this.character.freePowers = [];
                if (!this.character.freePowers.includes(powerId)) {
                    this.character.freePowers.push(powerId);
                }
            }
        }

        // Auto-unlock disciplines
        if (pkg.disciplinesUnlocked) {
            if (!this.character.unlockedDisciplines) this.character.unlockedDisciplines = [];
            for (const d of pkg.disciplinesUnlocked) {
                if (!this.character.unlockedDisciplines.includes(d)) {
                    this.character.unlockedDisciplines.push(d);
                }
            }
        }
    },

    // Remove mechanical effects from an ascension package
    _removeAscensionEffects(entry) {
        if (entry.type !== 'package' || !entry.packageId) return;
        const pkg = DataLoader.getAscensionPackages().find(p => p.id === entry.packageId);
        if (!pkg) return;

        // Remove ascension-granted talents
        if (pkg.talentsGranted) {
            for (const talentId of pkg.talentsGranted) {
                const idx = this.character.talents.findIndex(t =>
                    typeof t === 'object' && t.id === talentId && t.ascensionGranted
                );
                if (idx !== -1) {
                    this.character.talents.splice(idx, 1);
                }
            }
        }

        // Remove auto-granted psychic powers
        const powersToRemove = [
            ...(pkg.psykerConfig?.grantedPowers || []),
            ...(pkg.powersGranted || [])
        ];
        for (const powerId of powersToRemove) {
            const powerIdx = this.character.psychicPowers.indexOf(powerId);
            if (powerIdx !== -1) {
                this.character.psychicPowers.splice(powerIdx, 1);
            }
            const freeIdx = (this.character.freePowers || []).indexOf(powerId);
            if (freeIdx !== -1) {
                this.character.freePowers.splice(freeIdx, 1);
            }
        }

        // Remove auto-unlocked disciplines
        if (pkg.disciplinesUnlocked) {
            for (const d of pkg.disciplinesUnlocked) {
                const idx = (this.character.unlockedDisciplines || []).indexOf(d);
                if (idx !== -1) {
                    this.character.unlockedDisciplines.splice(idx, 1);
                }
            }
        }

        // Remove discipline choices associated with this package's psykerConfig
        if (pkg.psykerConfig?.disciplineChoices) {
            // We can't know which specific discipline was chosen for this package,
            // so we leave user-chosen disciplines intact. They'll be cleaned up
            // by getRemainingDisciplineChoices() returning negative count.
        }
    },

    // Set a choice for an ascension package (e.g., Demanding Patron benefit)
    setAscensionChoice(targetTier, choiceKey, choiceValue) {
        const entry = (this.character.ascensions || []).find(a => a.targetTier === targetTier);
        if (!entry) return;
        if (!entry.choices) entry.choices = {};
        entry.choices[choiceKey] = choiceValue;
        this.notifyListeners('ascension', targetTier);
    },

    // Remove a choice from an ascension package (e.g., an extra Demanding Patron keyword)
    removeAscensionChoice(targetTier, choiceKey) {
        const entry = (this.character.ascensions || []).find(a => a.targetTier === targetTier);
        if (!entry?.choices) return;
        delete entry.choices[choiceKey];
        this.notifyListeners('ascension', targetTier);
    },

    // Get the effective tier (starting tier + number of non-creation ascensions)
    // Creation ascension = slot where targetTier <= starting tier
    getEffectiveTier() {
        const startingTier = this.character.tier || 1;
        const ascensions = this.character.ascensions || [];
        const earnedAscensions = ascensions.filter(a => a.targetTier > startingTier).length;
        return Math.min(5, startingTier + earnedAscensions);
    },

    // Get the archetype's tier (for determining creation ascension availability)
    getArchetypeTier() {
        const archetype = DataLoader.getArchetype(this.character.archetype?.id);
        if (this.character.archetype?.id === 'custom') return this.character.tier || 1;
        return archetype?.tier || this.character.tier || 1;
    },

    // Set enabled sources
    setEnabledSources(sources) {
        this.enabledSources = sources;
        this.notifyListeners('sources');
    },

    // Check if source is enabled
    isSourceEnabled(source) {
        return this.enabledSources.includes(source);
    },

    // Set the ignore-prerequisites house rule
    setIgnorePrerequisites(enabled) {
        this.ignorePrerequisites = !!enabled;
        this.notifyListeners('houseRules');
    },

    // Register a listener for state changes
    addListener(callback) {
        this.listeners.push(callback);
    },

    // Remove a listener
    removeListener(callback) {
        const index = this.listeners.indexOf(callback);
        if (index !== -1) {
            this.listeners.splice(index, 1);
        }
    },

    // Notify all listeners of a change
    notifyListeners(changeType, data = null) {
        if (changeType !== 'reset' && changeType !== 'load') {
            this.isDirty = true;
            this._scheduleAutoSave();
        }
        for (const listener of this.listeners) {
            listener(changeType, data, this.character);
        }
    },

    // ===== Auto-Save =====

    // Schedule an auto-save after a 2-second debounce
    _scheduleAutoSave() {
        clearTimeout(this._autoSaveTimer);
        this._autoSaveTimer = setTimeout(() => this._performAutoSave(), 2000);
    },

    // Perform the auto-save to localStorage
    _performAutoSave() {
        // Skip if character is essentially empty
        if (!this.character.name && !this.character.species.id && !this.character.archetype.id) {
            return;
        }
        try {
            const data = {
                character: this.character,
                enabledSources: this.enabledSources,
                ignorePrerequisites: this.ignorePrerequisites,
                timestamp: Date.now()
            };
            localStorage.setItem(this._AUTO_SAVE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('Auto-save failed:', e);
        }
    },

    // Check if an auto-save exists
    hasAutoSave() {
        return localStorage.getItem(this._AUTO_SAVE_KEY) !== null;
    },

    // Get the auto-saved data
    getAutoSave() {
        try {
            const raw = localStorage.getItem(this._AUTO_SAVE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.warn('Failed to read auto-save:', e);
            return null;
        }
    },

    // Clear the auto-save
    clearAutoSave() {
        localStorage.removeItem(this._AUTO_SAVE_KEY);
    },

    // Get character keywords
    getKeywords() {
        return PrerequisiteChecker.getCharacterKeywords(this.character);
    },

    // Check if character is a psyker
    isPsyker() {
        return this.getKeywords().includes('PSYKER');
    },

    // Universal Psyker Abilities - auto-granted to all PSYKER characters, not purchasable
    UNIVERSAL_ABILITY_IDS: ['psyniscience', 'deny_the_witch'],

    // Get the effective psykerConfig for the character.
    // For standard archetypes, returns the archetype's psykerConfig.
    // For custom archetypes, returns the ability archetype's psykerConfig (if any).
    // Also merges in ascension package psyker configs (e.g., Psychic Revelations).
    getPsykerConfig() {
        const archetype = DataLoader.getArchetype(this.character.archetype?.id);
        let base = null;
        if (archetype?.psykerConfig) {
            base = archetype.psykerConfig;
        } else if (this.character.archetype?.id === 'custom' && this.character.customArchetype?.abilityArchetypeId) {
            const abilityArchetype = DataLoader.getArchetype(this.character.customArchetype.abilityArchetypeId);
            if (abilityArchetype?.psykerConfig) base = abilityArchetype.psykerConfig;
        }

        // Check ascension packages for psyker configs
        const ascensionConfigs = [];
        for (const asc of this.character.ascensions || []) {
            if (asc.type === 'package' && asc.packageId) {
                const pkg = DataLoader.getAscensionPackages().find(p => p.id === asc.packageId);
                if (pkg?.psykerConfig) {
                    ascensionConfigs.push(pkg.psykerConfig);
                }
            }
        }

        if (ascensionConfigs.length === 0) return base;

        // Merge base config with ascension configs
        const merged = {
            grantedPowers: [...(base?.grantedPowers || [])],
            freePowerChoices: [...(base?.freePowerChoices || [])],
            unlockedDisciplines: [...(base?.unlockedDisciplines || [])],
            disciplineChoices: base?.disciplineChoices || 0
        };

        for (const cfg of ascensionConfigs) {
            for (const p of cfg.grantedPowers || []) {
                if (!merged.grantedPowers.includes(p)) merged.grantedPowers.push(p);
            }
            for (const fpc of cfg.freePowerChoices || []) {
                merged.freePowerChoices.push(fpc);
            }
            for (const d of cfg.unlockedDisciplines || []) {
                if (!merged.unlockedDisciplines.includes(d)) merged.unlockedDisciplines.push(d);
            }
            merged.disciplineChoices += cfg.disciplineChoices || 0;
        }

        return merged;
    },

    // Get list of unlocked disciplines for the current psyker archetype
    getUnlockedDisciplines() {
        const base = ['Minor', 'Universal'];
        const psykerConfig = this.getPsykerConfig();
        if (psykerConfig) {
            for (const d of psykerConfig.unlockedDisciplines || []) {
                if (!base.includes(d)) base.push(d);
            }
        }
        for (const d of this.character.unlockedDisciplines || []) {
            if (!base.includes(d)) base.push(d);
        }
        // Include disciplines unlocked by ascension packages
        for (const asc of this.character.ascensions || []) {
            if (asc.type === 'package' && asc.packageId) {
                const pkg = DataLoader.getAscensionPackages().find(p => p.id === asc.packageId);
                if (pkg?.disciplinesUnlocked) {
                    for (const d of pkg.disciplinesUnlocked) {
                        if (!base.includes(d)) base.push(d);
                    }
                }
            }
        }
        // Include disciplines unlocked by talents (Warped Mind, Tormented Manifestation)
        const DISCIPLINE_UNLOCK_TALENTS = ['warped_mind', 'tormented_manifestation_aoa'];
        for (const talentEntry of this.character.talents || []) {
            if (typeof talentEntry === 'object' && DISCIPLINE_UNLOCK_TALENTS.includes(talentEntry.id) && talentEntry.choice) {
                if (!base.includes(talentEntry.choice)) {
                    base.push(talentEntry.choice);
                }
            }
        }
        return base;
    },

    // Add a user-chosen discipline unlock
    addDisciplineChoice(discipline) {
        if (!this.character.unlockedDisciplines) {
            this.character.unlockedDisciplines = [];
        }
        if (!this.character.unlockedDisciplines.includes(discipline)) {
            this.character.unlockedDisciplines.push(discipline);
            this.notifyListeners('discipline', discipline);
        }
    },

    // Remove a user-chosen discipline unlock
    removeDisciplineChoice(discipline) {
        if (!this.character.unlockedDisciplines) return;
        const index = this.character.unlockedDisciplines.indexOf(discipline);
        if (index !== -1) {
            this.character.unlockedDisciplines.splice(index, 1);
            this.notifyListeners('discipline', discipline);
        }
    },

    // Get remaining discipline choices (how many more the user can unlock)
    getRemainingDisciplineChoices() {
        const psykerConfig = this.getPsykerConfig();
        if (!psykerConfig) return 0;
        const allowed = psykerConfig.disciplineChoices || 0;
        const used = (this.character.unlockedDisciplines || []).length;
        return Math.max(0, allowed - used);
    },

    // Add a free power pick (archetype-granted free choice)
    addFreePowerPick(powerId) {
        if (!this.character.psychicPowers.includes(powerId)) {
            this.character.psychicPowers.push(powerId);
        }
        if (!this.character.freePowers) {
            this.character.freePowers = [];
        }
        if (!this.character.freePowers.includes(powerId)) {
            this.character.freePowers.push(powerId);
        }
        this.notifyListeners('power', powerId);
    },

    // Get free power choice status: for each freePowerChoices entry, how many picks remain
    getFreePowerChoiceStatus() {
        const psykerConfig = this.getPsykerConfig();
        if (!psykerConfig) return [];

        const grantedPowers = psykerConfig.grantedPowers || [];
        const freePowers = this.character.freePowers || [];

        return (psykerConfig.freePowerChoices || []).map(entry => {
            // Count how many freePowers are from the allowed disciplines (excluding grantedPowers)
            const picked = freePowers.filter(pid => {
                if (grantedPowers.includes(pid)) return false;
                const power = DataLoader.getPsychicPower(pid);
                if (!power) return false;
                return entry.disciplines.some(d => d.toLowerCase() === power.discipline.toLowerCase());
            });
            return {
                disciplines: entry.disciplines,
                count: entry.count,
                picked: picked.length,
                remaining: Math.max(0, entry.count - picked.length)
            };
        });
    }
};
