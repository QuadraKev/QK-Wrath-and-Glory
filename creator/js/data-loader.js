// Data Loader - Loads game data from JSON files

const DataLoader = {
    // Cache for loaded data
    cache: {},

    // Load a single data file
    async loadFile(filename) {
        if (this.cache[filename]) {
            console.log(`[DataLoader] Cache hit for ${filename}`);
            return this.cache[filename];
        }

        try {
            console.log(`[DataLoader] Loading ${filename}...`);
            const data = await window.api.loadGameData(filename);
            if (data) {
                this.cache[filename] = data;
                console.log(`[DataLoader] Loaded ${filename}:`, Array.isArray(data) ? `${data.length} items` : 'object');
            } else {
                console.warn(`[DataLoader] No data returned for ${filename}`);
            }
            return data;
        } catch (error) {
            console.error(`[DataLoader] Failed to load ${filename}:`, error);
            return null;
        }
    },

    // Load all game data files
    async loadAll() {
        console.log('[DataLoader] Starting to load all game data...');

        const files = [
            'species.json',
            'archetypes.json',
            'talents.json',
            'weapons.json',
            'armor.json',
            'equipment.json',
            'psychic-powers.json',
            'ascension-packages.json',
            'backgrounds.json',
            'weapon-upgrades.json',
            'injuries-corruption.json',
            'keyword-categories.json',
            'holy-relics.json'
        ];

        const results = await Promise.all(files.map(f => this.loadFile(f)));

        const gameData = {
            species: results[0] || [],
            archetypes: results[1] || [],
            talents: results[2] || [],
            weapons: results[3] || [],
            armor: results[4] || [],
            equipment: results[5] || [],
            psychicPowers: results[6] || [],
            ascensionPackages: results[7] || [],
            backgrounds: results[8] || {},
            weaponUpgrades: results[9] || [],
            injuriesCorruption: results[10] || {},
            keywordCategories: results[11] || {},
            holyRelics: results[12] || null
        };

        console.log('[DataLoader] All data loaded. Summary:', {
            species: gameData.species.length,
            archetypes: gameData.archetypes.length,
            talents: gameData.talents.length,
            weapons: gameData.weapons.length,
            armor: gameData.armor.length,
            equipment: gameData.equipment.length,
            psychicPowers: gameData.psychicPowers.length,
            ascensionPackages: gameData.ascensionPackages.length,
            backgrounds: Object.keys(gameData.backgrounds).length + ' categories'
        });

        return gameData;
    },

    // Get species by ID
    getSpecies(id) {
        const species = this.cache['species.json'] || [];
        return species.find(s => s.id === id);
    },

    // Get archetype by ID
    getArchetype(id) {
        const archetypes = this.cache['archetypes.json'] || [];
        return archetypes.find(a => a.id === id);
    },

    // Get talent by ID
    getTalent(id) {
        const talents = this.cache['talents.json'] || [];
        return talents.find(t => t.id === id);
    },

    // Get weapon by ID
    getWeapon(id) {
        const weapons = this.cache['weapons.json'] || [];
        return weapons.find(w => w.id === id);
    },

    // Get armor by ID
    getArmor(id) {
        const armor = this.cache['armor.json'] || [];
        return armor.find(a => a.id === id);
    },

    // Get equipment by ID
    getEquipment(id) {
        const equipment = this.cache['equipment.json'] || [];
        return equipment.find(e => e.id === id);
    },

    // Get psychic power by ID
    getPsychicPower(id) {
        const powers = this.cache['psychic-powers.json'] || [];
        return powers.find(p => p.id === id);
    },

    // Get wargear item by ID (searches all wargear types)
    getWargearItem(id) {
        return this.getWeapon(id) || this.getArmor(id) || this.getEquipment(id);
    },

    // Get the Holy Relic creation tables (Redacted Records II)
    getHolyRelics() {
        return this.cache['holy-relics.json'] || null;
    },

    // Filter archetypes by species and tier
    filterArchetypes(speciesId, tier, enabledSources) {
        const archetypes = this.cache['archetypes.json'] || [];
        return archetypes.filter(a => {
            // Check species compatibility
            if (a.species && a.species.length > 0 && !a.species.includes(speciesId)) {
                return false;
            }
            // Check tier
            if (a.tier > tier) {
                return false;
            }
            // Check source
            if (enabledSources && !enabledSources.includes(a.source)) {
                return false;
            }
            return true;
        });
    },

    // Filter talents by prerequisites met
    filterTalents(character, enabledSources) {
        const talents = this.cache['talents.json'] || [];
        return talents.filter(t => {
            if (enabledSources && !enabledSources.includes(t.source)) {
                return false;
            }
            return true;
        });
    },

    // Get all species
    getAllSpecies() {
        return this.cache['species.json'] || [];
    },

    // Get species sub-option by type and id
    getSpeciesSubOption(speciesId, type, optionId) {
        const species = this.getSpecies(speciesId);
        if (!species?.subOptions) return null;

        const configs = Array.isArray(species.subOptions) ? species.subOptions : [species.subOptions];
        for (const config of configs) {
            if (config.type === type) {
                return config.options?.find(o => o.id === optionId) || null;
            }
        }
        return null;
    },

    // Get all archetypes
    getAllArchetypes() {
        return this.cache['archetypes.json'] || [];
    },

    // Get all talents
    getAllTalents() {
        return this.cache['talents.json'] || [];
    },

    // Get all psychic powers
    getAllPsychicPowers() {
        return this.cache['psychic-powers.json'] || [];
    },

    // Get all weapons
    getAllWeapons() {
        return this.cache['weapons.json'] || [];
    },

    // Get all armor
    getAllArmor() {
        return this.cache['armor.json'] || [];
    },

    // Get all equipment
    getAllEquipment() {
        return this.cache['equipment.json'] || [];
    },

    // Get backgrounds
    getBackgrounds() {
        return this.cache['backgrounds.json'] || {};
    },

    // Get ascension packages
    getAscensionPackages() {
        return this.cache['ascension-packages.json'] || [];
    },

    // Get keyword categories
    getKeywordCategories() {
        return this.cache['keyword-categories.json'] || {};
    },

    // Get a single keyword category by key
    getKeywordCategory(categoryKey) {
        const categories = this.getKeywordCategories();
        return categories[categoryKey] || null;
    },

    // Get all weapon upgrades
    getAllWeaponUpgrades() {
        return this.cache['weapon-upgrades.json'] || [];
    },

    // Get weapon upgrade by ID
    getWeaponUpgrade(id) {
        const upgrades = this.cache['weapon-upgrades.json'] || [];
        return upgrades.find(u => u.id === id);
    },

    // Get injuries & corruption data
    getInjuriesCorruptionData() {
        return this.cache['injuries-corruption.json'] || {};
    },

    // Get memorable injuries list
    getMemorableInjuries() {
        const data = this.getInjuriesCorruptionData();
        return data.memorableInjuries || [];
    },

    // Get traumatic injuries list
    getTraumaticInjuries() {
        const data = this.getInjuriesCorruptionData();
        return data.traumaticInjuries || [];
    },

    // Get corruption table
    getCorruptionTable() {
        const data = this.getInjuriesCorruptionData();
        return data.corruptionTable || [];
    },

    // Get all mutations
    getMutations() {
        const data = this.getInjuriesCorruptionData();
        return data.mutations || [];
    },

    // Get mutation by ID
    getMutation(id) {
        return this.getMutations().find(m => m.id === id);
    },

    // Source display name mapping
    sourceDisplayNames: {
        'core': 'Core Rulebook',
        'church': 'Church of Steel',
        'aeldari': 'Aeldari Inheritance of Embers',
        'fspg': "Forsaken System Player's Guide",
        'voa': 'Vow of Absolution',
        'redacted1': 'Redacted Records I',
        'redacted2': 'Redacted Records II',
        'shotguns': 'Departmento Munitorum Shotguns',
        'dh': 'Threat Assessment: Daemons & Heretics',
        'apocrypha': 'An Abundance of Apocrypha'
    },

    // Get display name for a source ID
    getSourceDisplayName(source) {
        return this.sourceDisplayNames[source] || source || '';
    },

    // Format source + page for display (e.g. "Core Rulebook, p. 217")
    formatSourcePage(item) {
        if (!item || !item.source) return '';
        const name = this.getSourceDisplayName(item.source);
        if (item.page != null) {
            return `${name}, p. ${item.page}`;
        }
        return name;
    },

    // Get valid upgrades for a specific weapon
    getValidUpgradesForWeapon(weapon, currentUpgrades = []) {
        const allUpgrades = this.getAllWeaponUpgrades();
        const currentTypes = currentUpgrades
            .map(id => this.getWeaponUpgrade(id))
            .filter(u => u && !u.doesNotCountTowardLimit)
            .map(u => u.type);

        // Count non-distinction upgrades
        const upgradeCount = currentUpgrades.filter(id => {
            const upgrade = this.getWeaponUpgrade(id);
            return upgrade && !upgrade.doesNotCountTowardLimit;
        }).length;

        return allUpgrades.filter(upgrade => {
            // Already have this upgrade
            if (currentUpgrades.includes(upgrade.id)) return false;

            // Check max 3 upgrades (excluding Distinction)
            if (upgradeCount >= 3 && !upgrade.doesNotCountTowardLimit) return false;

            // Check one per type (excluding cosmetic type)
            if (upgrade.type !== 'cosmetic' && currentTypes.includes(upgrade.type)) return false;

            // Check weapon type restrictions
            const restrictions = upgrade.restrictions || {};

            if (restrictions.weaponType) {
                if (restrictions.weaponType === 'ranged' && weapon.type === 'melee') return false;
                if (restrictions.weaponType === 'melee' && weapon.type === 'ranged') return false;
            }

            // Check excluded traits
            if (restrictions.excludeTraits) {
                for (const trait of restrictions.excludeTraits) {
                    if (weapon.traits?.includes(trait)) return false;
                }
            }

            // Check required keywords
            if (restrictions.requireKeywords) {
                const hasKeyword = restrictions.requireKeywords.some(kw =>
                    weapon.keywords?.includes(kw)
                );
                if (!hasKeyword) return false;
            }

            // Check pistol/one-handed melee restrictions
            if (restrictions.requireOneOf) {
                const isPistol = weapon.traits?.includes('Pistol');
                const isOneHandedMelee = weapon.type === 'melee' && !weapon.traits?.includes('Two-Handed');

                if (restrictions.requireOneOf.includes('pistol') && isPistol) return true;
                if (restrictions.requireOneOf.includes('one_handed_melee') && isOneHandedMelee) return true;
                return false;
            }

            return true;
        });
    }
};
