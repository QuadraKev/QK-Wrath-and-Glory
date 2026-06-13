// Data Loader - Loads game data from JSON files

const DataLoader = {
    // Cache for loaded data
    cache: {},

    // Faction definitions - maps faction names to keywords that indicate membership
    factionKeywordMap: {
        'Adeptus Astartes': ['ADEPTUS ASTARTES', '[CHAPTER]'],
        'Adeptus Mechanicus': ['ADEPTUS MECHANICUS', '[FORGE WORLD]', 'QUESTOR MECHANICUS', 'LEGIO CYBERNETICA', 'SERBERYS', 'AVACHRUS FORGE WORLD'],
        'Aeldari': ['AELDARI', 'ASURYANI', '[CRAFTWORLD]', 'HARLEQUIN', '[MASQUE]', 'ANHRATHE', 'ASPECT WARRIOR', 'WRAITH CONSTRUCT'],
        'Chaos': ['CHAOS', 'DAEMON', '[MARK OF CHAOS]', '[LEGION]'],
        'Drukhari': ['DRUKHARI', '[KABAL]', '[COTERIE]', '[COVEN]', '[HAEMONCULUS COVEN]', '[WYCH CULT]', 'COURT OF THE ARCHON', 'PAIN ENGINE'],
        'Genestealer Cult': ['GENESTEALER CULT', 'GENESTEALER'],
        'Heretic': ['HERETIC'],
        'Imperium': ['IMPERIUM', 'IMPERIAL', 'MUTANT', 'SCUM', 'SERVITOR'],
        'Khorne': ['KHORNE'],
        'Kroot': ['KROOT'],
        'Necron': ['NECRON', '[DYNASTY]', 'CANOPTEK', 'CRYPTEK', 'DESTROYER', 'DESTROYER CULT', 'FLAYER', 'TRIARCH'],
        'Nurgle': ['NURGLE', 'MARK OF NURGLE'],
        'Ork': ['ORK', '[CLAN]', 'GROT', 'SQUIG'],
        'Primaris': ['PRIMARIS'],
        'Slaanesh': ['SLAANESH'],
        "T'au": ["T'AU", 'VESPID', 'DRONE'],
        'Tyranid': ['TYRANID'],
        'Tzeentch': ['TZEENTCH'],
        'Adeptus Custodes': ['ADEPTUS CUSTODES', '[SHIELD HOST]'],
        'Harlequin': ['HARLEQUIN', '[MASQUE]', '[SAEDATH]'],
        'Leagues of Votann': ['LEAGUES OF VOTANN', 'KIN', '[LEAGUE]']
    },

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
            'threats.json',
            'threat-weapons.json',
            'glossary.json',
            'talents.json',
            'weapons.json',
            'armor.json',
            'equipment.json',
            'psychic-powers.json',
            'weapon-upgrades.json',
            'ascension-packages.json',
            'archetypes.json',
            'species.json',
            'injuries-corruption.json'
        ];

        const results = await Promise.all(files.map(f => this.loadFile(f)));

        const gameData = {
            threats: results[0] || [],
            threatWeapons: results[1] || [],
            glossary: results[2] || {},
            talents: results[3] || [],
            weapons: results[4] || [],
            armor: results[5] || [],
            equipment: results[6] || [],
            psychicPowers: results[7] || [],
            weaponUpgrades: results[8] || [],
            ascensionPackages: results[9] || [],
            archetypes: results[10] || [],
            species: results[11] || [],
            injuriesCorruption: results[12] || {}
        };

        console.log('[DataLoader] All data loaded. Summary:', {
            threats: gameData.threats.length,
            threatWeapons: gameData.threatWeapons.length,
            talents: gameData.talents.length,
            weapons: gameData.weapons.length,
            armor: gameData.armor.length,
            equipment: gameData.equipment.length,
            psychicPowers: gameData.psychicPowers.length
        });

        return gameData;
    },

    // Get all threats
    getAllThreats() {
        return this.cache['threats.json'] || [];
    },

    // Get threat by ID
    getThreat(id) {
        const threats = this.getAllThreats();
        return threats.find(t => t.id === id);
    },

    // Get all threat weapons
    getAllThreatWeapons() {
        return this.cache['threat-weapons.json'] || [];
    },

    // Get threat weapon by ID
    getThreatWeapon(id) {
        const weapons = this.getAllThreatWeapons();
        return weapons.find(w => w.id === id);
    },

    // Get a single wargear weapon by ID
    getWeapon(id) {
        const weapons = this.getAllWeapons();
        return weapons.find(w => w.id === id);
    },

    // Convert a wargear weapon to threat-weapon-like display format
    normalizeWargearWeapon(weapon) {
        if (!weapon) return null;
        const dmg = weapon.damage || {};
        const flatDamage = (dmg.base || 0) + (dmg.bonus || 0);

        let rangeStr = '';
        if (weapon.range && typeof weapon.range === 'object') {
            rangeStr = `${weapon.range.short}/${weapon.range.medium}/${weapon.range.long}`;
        } else if (weapon.range) {
            rangeStr = String(weapon.range);
        }

        return {
            id: weapon.id,
            name: weapon.name,
            type: weapon.type,
            damage: flatDamage,
            ed: weapon.ed ?? 0,
            ap: weapon.ap ?? 0,
            range: rangeStr || undefined,
            salvo: weapon.salvo != null ? String(weapon.salvo) : undefined,
            traits: weapon.traits || []
        };
    },

    // Check if a weapon is a launcher that requires ammo selection
    isLauncherWeapon(weapon) {
        if (!weapon) return false;
        const name = (weapon.name || '').toLowerCase();
        const cat = weapon.category || '';
        return name.includes('launcher') && (cat === 'Grenade' || cat === 'Missile');
    },

    // Get available ammo (grenades/missiles) for the weapon picker, excluding launchers
    // filters.launcherType: 'Grenade' or 'Missile' to restrict ammo to matching type
    getAvailableAmmo(filters = {}) {
        const launcherType = filters.launcherType;
        let ammo = this.getAllWeapons().filter(w => {
            if (!w.category || w.category.startsWith('Vehicle')) return false;
            // Exclude launchers themselves
            if (this.isLauncherWeapon(w)) return false;
            const kws = (w.keywords || []).map(k => k.toUpperCase());
            if (launcherType === 'Grenade') {
                // Grenade launchers: show grenades/explosives only (by category, not keyword)
                return w.category === 'Grenade' || w.category === 'Explosive';
            } else if (launcherType === 'Missile') {
                // Missile launchers: show missiles only (by category, not keyword)
                return w.category === 'Missile';
            }
            // No launcher type specified: show all ammo types
            const grenadeCategories = ['Grenade', 'Missile', 'Explosive'];
            return grenadeCategories.includes(w.category) || kws.includes('GRENADE') || kws.includes('MISSILE');
        });

        // Filter by source book settings
        ammo = ammo.filter(w => SettingsTab.isSourceEnabled(w.source));

        // Text search
        if (filters.search) {
            const search = filters.search.toLowerCase();
            ammo = ammo.filter(w => w.name && w.name.toLowerCase().includes(search));
        }

        ammo.sort((a, b) => a.name.localeCompare(b.name));
        return ammo;
    },

    // Resolve a weapon override composite ID to a display-format weapon
    resolveWeaponOverride(compositeId) {
        if (!compositeId) return null;

        // Launcher+ammo composite format: "launcherId+ammoId"
        if (compositeId.includes('+')) {
            const [launcherId, ammoId] = compositeId.split('+', 2);
            const launcher = this.getWeapon(launcherId);
            const ammo = this.getWeapon(ammoId);
            if (launcher && ammo) {
                return this.normalizeLauncherWithAmmo(launcher, ammo);
            }
            // Fall back to just the launcher or ammo
            if (launcher) return this.normalizeWargearWeapon(launcher);
            if (ammo) return this.normalizeWargearWeapon(ammo);
            return null;
        }

        // Legacy format: "wargear:weaponId"
        if (compositeId.startsWith('wargear:')) {
            const realId = compositeId.slice(8);
            const weapon = this.getWeapon(realId);
            return weapon ? this.normalizeWargearWeapon(weapon) : null;
        }
        // New format: raw weapon ID — try wargear first, fall back to threat weapons
        const weapon = this.getWeapon(compositeId);
        if (weapon) return this.normalizeWargearWeapon(weapon);
        return this.getThreatWeapon(compositeId);
    },

    // Combine launcher and ammo into a display-format weapon
    normalizeLauncherWithAmmo(launcher, ammo) {
        const ammoDmg = ammo.damage || {};
        const flatDamage = (ammoDmg.base || 0) + (ammoDmg.bonus || 0);

        // Use launcher's range, ammo's damage/ED/AP
        let rangeStr = '';
        if (launcher.range && typeof launcher.range === 'object') {
            rangeStr = `${launcher.range.short}/${launcher.range.medium}/${launcher.range.long}`;
        } else if (launcher.range) {
            rangeStr = String(launcher.range);
        }

        // Combine traits from both launcher and ammo, deduplicating
        const traitSet = new Set([...(launcher.traits || []), ...(ammo.traits || [])]);

        return {
            id: `${launcher.id}+${ammo.id}`,
            name: `${launcher.name} (${ammo.name})`,
            type: launcher.type,
            damage: flatDamage,
            ed: ammo.ed ?? 0,
            ap: ammo.ap ?? 0,
            range: rangeStr || undefined,
            salvo: launcher.salvo != null ? String(launcher.salvo) : undefined,
            traits: [...traitSet]
        };
    },

    // Faction keyword map for weapon picker filtering
    weaponFactionKeywordMap: {
        'Imperium': ['IMPERIUM'],
        'Aeldari': ['AELDARI'],
        'Ork': ['ORK'],
        'Drukhari': ['DRUKHARI'],
        'Necron': ['NECRON'],
        'Chaos': ['CHAOS'],
        "T'au": ["T'AU EMPIRE", "T'AU"]
    },

    // Get filtered weapons for the weapon picker modal
    getFilteredWeapons(filters = {}) {
        let weapons = this.getAllWeapons().filter(w => !w.category || !w.category.startsWith('Vehicle'));

        // Exclude standalone missiles — they require a launcher and are only available as ammo
        weapons = weapons.filter(w => w.category !== 'Missile' || this.isLauncherWeapon(w));

        // Filter by source book settings
        weapons = weapons.filter(w => SettingsTab.isSourceEnabled(w.source));

        // Text search — match on name, category, traits, keywords
        if (filters.search) {
            const search = filters.search.toLowerCase();
            weapons = weapons.filter(w => {
                if (w.name && w.name.toLowerCase().includes(search)) return true;
                if (w.category && w.category.toLowerCase().includes(search)) return true;
                if (w.traits && w.traits.some(t => t.toLowerCase().includes(search))) return true;
                if (w.keywords && w.keywords.some(k => k.toLowerCase().includes(search))) return true;
                return false;
            });
        }

        // Type filter
        if (filters.type && filters.type !== 'all') {
            if (filters.type === 'grenade') {
                const grenadeCategories = ['Grenade', 'Missile', 'Explosive'];
                weapons = weapons.filter(w => {
                    if (w.category && grenadeCategories.includes(w.category)) return true;
                    const kws = (w.keywords || []).map(k => k.toUpperCase());
                    return kws.includes('GRENADE') || kws.includes('MISSILE');
                });
            } else {
                weapons = weapons.filter(w => w.type === filters.type);
            }
        }

        // Faction filter
        if (filters.faction && filters.faction !== 'all') {
            const factionKeywords = this.weaponFactionKeywordMap[filters.faction];
            if (factionKeywords) {
                weapons = weapons.filter(w =>
                    w.keywords && w.keywords.some(k =>
                        factionKeywords.some(fk => k.toUpperCase() === fk.toUpperCase())
                    )
                );
            }
        }

        // Sort alphabetically by name
        weapons.sort((a, b) => a.name.localeCompare(b.name));
        return weapons;
    },

    // Get glossary data
    getGlossary() {
        return this.cache['glossary.json'] || {};
    },

    // Load glossary (for Glossary.init compatibility)
    async loadGlossary() {
        if (!this.cache['glossary.json']) {
            await this.loadFile('glossary.json');
        }
        return this.cache['glossary.json'];
    },

    // Get all unique keywords from threats
    getAllKeywords() {
        const threats = this.getAllThreats();
        const keywordSet = new Set();

        threats.forEach(threat => {
            if (threat.keywords && Array.isArray(threat.keywords)) {
                threat.keywords.forEach(kw => keywordSet.add(kw));
            }
        });

        return Array.from(keywordSet).sort();
    },

    // Get all faction names (sorted)
    getAllFactions() {
        return Object.keys(this.factionKeywordMap).sort();
    },

    // Get factions for a specific threat based on its keywords
    getThreatFactions(threat) {
        if (!threat || !threat.keywords) return [];

        const factions = [];
        const threatKeywords = threat.keywords.map(kw => kw.toUpperCase());

        for (const [faction, factionKeywords] of Object.entries(this.factionKeywordMap)) {
            const hasFaction = factionKeywords.some(fkw =>
                threatKeywords.some(tkw => tkw === fkw.toUpperCase() || tkw.includes(fkw.toUpperCase()))
            );
            if (hasFaction) {
                factions.push(faction);
            }
        }

        return factions;
    },

    // Map lowercase source IDs (used in glossary) to display names
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

    // Get display name for a source (handles both lowercase IDs and full names)
    getSourceDisplayName(source) {
        return this.sourceDisplayNames[source] || source || '';
    },

    // Format source + page for display (e.g. "Core Rules, p. 327")
    // Uses the full individual book name, not the collapsed normalizeSource() name
    formatSourcePage(item) {
        if (!item || !item.source) return '';
        const name = this.getSourceDisplayName(item.source);
        if (item.page != null) {
            return `${name}, p. ${item.page}`;
        }
        return name;
    },

    // Get all talents
    getAllTalents() {
        return this.cache['talents.json'] || [];
    },

    // Get all weapons (player weapons)
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

    // Get all psychic powers
    getAllPsychicPowers() {
        return this.cache['psychic-powers.json'] || [];
    },

    // Get all weapon upgrades
    getAllWeaponUpgrades() {
        return this.cache['weapon-upgrades.json'] || [];
    },

    // Get ascension packages
    getAscensionPackages() {
        return this.cache['ascension-packages.json'] || [];
    },

    // Get all archetypes
    getAllArchetypes() {
        return this.cache['archetypes.json'] || [];
    },

    // Get all species
    getAllSpecies() {
        return this.cache['species.json'] || [];
    },

    // Get mutations
    getMutations() {
        const data = this.cache['injuries-corruption.json'] || {};
        return data.mutations || [];
    },

    // Normalize source name for display (combines all Apocrypha sources)
    normalizeSource(source) {
        if (source && source.toLowerCase().includes('apocrypha')) {
            return 'Apocrypha';
        }
        return source;
    },

    // Get all unique source values from threats (sorted), with Apocrypha sources combined
    getAllSources() {
        const threats = this.getAllThreats();
        const sourceSet = new Set();
        threats.forEach(threat => {
            if (threat.source) {
                sourceSet.add(this.normalizeSource(threat.source));
            }
        });
        return Array.from(sourceSet).sort();
    },

    // Inject a custom threat into the cache at runtime
    injectThreat(threat) {
        const threats = this.cache['threats.json'] || [];
        // Remove existing custom threat with same ID if re-injecting
        const idx = threats.findIndex(t => t.id === threat.id);
        if (idx !== -1) threats.splice(idx, 1);
        threats.push(threat);
        this.cache['threats.json'] = threats;
    },

    // Remove a threat from the cache by ID
    removeThreat(threatId) {
        const threats = this.cache['threats.json'] || [];
        this.cache['threats.json'] = threats.filter(t => t.id !== threatId);
    },

    // Filter threats by criteria
    filterThreats(criteria = {}) {
        let threats = this.getAllThreats();

        // Filter by search text
        if (criteria.search) {
            const searchLower = criteria.search.toLowerCase();
            threats = threats.filter(t =>
                t.name.toLowerCase().includes(searchLower) ||
                (t.description && t.description.toLowerCase().includes(searchLower))
            );
        }

        // Filter by tier and threat levels
        // MC (Monstrous Creature) is treated as equivalent to A (Adversary)
        if (criteria.threatLevels && criteria.threatLevels.length > 0) {
            const matchesLevel = (level) => {
                if (!level || level === '-') return false;
                const normalized = level === 'MC' ? 'A' : level;
                return criteria.threatLevels.includes(normalized);
            };
            threats = threats.filter(t => {
                if (!t.tierThreat) return false;

                if (criteria.selectedTier) {
                    // If a specific tier is selected, check only that tier's threat level
                    return matchesLevel(t.tierThreat[criteria.selectedTier]);
                } else {
                    // If no tier selected (all tiers), check if any tier matches
                    return Object.values(t.tierThreat).some(matchesLevel);
                }
            });
        }

        // Filter by keywords
        if (criteria.keywords && criteria.keywords.length > 0) {
            threats = threats.filter(t => {
                if (!t.keywords) return false;
                return criteria.keywords.some(kw => t.keywords.includes(kw));
            });
        }

        // Filter by factions
        if (criteria.factions && criteria.factions.length > 0) {
            threats = threats.filter(t => {
                const threatFactions = this.getThreatFactions(t);
                return criteria.factions.some(f => threatFactions.includes(f));
            });
        }

        // Filter by sources (inclusion - using normalized source names)
        if (criteria.sources && criteria.sources.length > 0) {
            threats = threats.filter(t => criteria.sources.includes(this.normalizeSource(t.source)));
        }

        // Filter by excluded sources (exclusion pattern - using normalized source names)
        if (criteria.excludedSources && criteria.excludedSources.length > 0) {
            threats = threats.filter(t => !criteria.excludedSources.includes(this.normalizeSource(t.source)));
        }

        return threats;
    }
};
