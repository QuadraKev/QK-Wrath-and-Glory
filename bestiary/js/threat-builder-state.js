// Threat Builder State - State management for the Threat Builder

const ThreatBuilderState = {
    // Ability type constants (ordered for display)
    ABILITY_TYPES: [
        'BATTLECRY', 'ACTION', 'RUIN', 'WRATH', 'COMPLICATION',
        'REACTION', 'DETERMINATION', 'ANNIHILATION', 'TRAIT', 'PASSIVE', 'MOB', 'ABILITY'
    ],

    // Canonical skill names (excludes Default and Awareness which are fixed fields)
    SKILL_NAMES: [
        'Athletics', 'Ballistic Skill', 'Cunning', 'Deception', 'Insight',
        'Intimidation', 'Investigation', 'Leadership', 'Medicae', 'Persuasion',
        'Pilot', 'Psychic Mastery', 'Scholar', 'Stealth', 'Survival', 'Tech',
        'Weapon Skill'
    ],

    // The current threat being edited
    threat: null,

    // Indexes built lazily from all threats
    _abilityIndex: null, // Map<type, Array<{ability, threatName, threatId}>>
    _bonusIndex: null,   // Array<{bonus, threatName, threatId}>

    // Track unsaved state
    _isDirty: false,

    // Auto-save support
    _autoSaveTimer: null,
    _AUTO_SAVE_KEY: 'wng-bestiary-builder-autosave',

    // Snapshot of the last-injected threat data (without id) for change detection
    _lastInjectedSnapshot: null,

    // Initialize with an empty threat
    init() {
        this.clear();
    },

    // Build indexes from all threats (lazy, called once on first use)
    buildIndex() {
        if (this._abilityIndex) return;

        this._abilityIndex = new Map();
        this._bonusIndex = [];

        // Initialize ability type buckets
        this.ABILITY_TYPES.forEach(type => {
            this._abilityIndex.set(type, []);
        });

        const threats = DataLoader.getAllThreats();

        // Track seen abilities/bonuses for deduplication (keyed by name+type+description)
        // Value is the index entry object so we can update threatName to (Multiple)
        const seenAbilities = new Map();
        const seenBonuses = new Map();

        threats.forEach(threat => {
            // Index abilities
            if (threat.abilities) {
                threat.abilities.forEach(ability => {
                    const type = ability.type || 'ABILITY';
                    if (!this._abilityIndex.has(type)) {
                        this._abilityIndex.set(type, []);
                    }

                    // Deduplicate Champion into a single generic entry
                    if (ability.name === 'Champion') {
                        if (!seenAbilities.has('Champion||')) {
                            const entry = {
                                ability: {
                                    type: ability.type,
                                    name: 'Champion',
                                    description: 'This Threat may use Ruin Actions and has X personal Ruin.'
                                },
                                threatName: '(Multiple)',
                                threatId: null
                            };
                            seenAbilities.set('Champion||', entry);
                            this._abilityIndex.get(type).push(entry);
                        }
                        return;
                    }

                    // Deduplicate identical abilities (same name + type + description)
                    const abilityKey = ability.name + '|' + type + '|' + (ability.description || '');
                    const existing = seenAbilities.get(abilityKey);
                    if (existing) {
                        existing.threatName = '(Multiple)';
                        existing.threatId = null;
                        return;
                    }

                    const entry = {
                        ability: ability,
                        threatName: threat.name,
                        threatId: threat.id
                    };
                    seenAbilities.set(abilityKey, entry);
                    this._abilityIndex.get(type).push(entry);
                });
            }

            // Index bonuses (deduplicate identical ones)
            if (threat.bonuses) {
                threat.bonuses.forEach(bonus => {
                    // Deduplicate Champion bonus into a single generic entry
                    if (bonus.name === 'Champion' || bonus.name === 'CHAMPION') {
                        const champKey = bonus.name + '||';
                        if (!seenBonuses.has(champKey)) {
                            const entry = {
                                bonus: {
                                    name: bonus.name,
                                    description: 'This Threat may use Ruin Actions and has X personal Ruin.'
                                },
                                threatName: '(Multiple)',
                                threatId: null
                            };
                            seenBonuses.set(champKey, entry);
                            this._bonusIndex.push(entry);
                        }
                        return;
                    }

                    const bonusKey = bonus.name + '|' + (bonus.description || '');
                    const existing = seenBonuses.get(bonusKey);
                    if (existing) {
                        existing.threatName = '(Multiple)';
                        existing.threatId = null;
                        return;
                    }

                    const entry = {
                        bonus: bonus,
                        threatName: threat.name,
                        threatId: threat.id
                    };
                    seenBonuses.set(bonusKey, entry);
                    this._bonusIndex.push(entry);
                });
            }
        });
    },

    // Get abilities by type from the index
    getAbilitiesByType(type) {
        this.buildIndex();
        return this._abilityIndex.get(type) || [];
    },

    // Get all indexed bonuses
    getAllBonuses() {
        this.buildIndex();
        return this._bonusIndex;
    },

    // Load a threat as template (deep copy)
    loadTemplate(threatId) {
        const threat = DataLoader.getThreat(threatId);
        if (!threat) return;

        this.threat = JSON.parse(JSON.stringify(threat));
        // Give it a new custom ID
        this.threat.id = this._generateId();
        this._resolveWeaponIds();
        this._parseSkillsString(this.threat.skills);
        this._markDirty();
        this._lastInjectedSnapshot = null;
    },

    // Update a field by dot-path (e.g., 'attributes.S', 'name')
    updateField(path, value) {
        const parts = path.split('.');
        let obj = this.threat;
        for (let i = 0; i < parts.length - 1; i++) {
            if (!obj[parts[i]]) obj[parts[i]] = {};
            obj = obj[parts[i]];
        }
        obj[parts[parts.length - 1]] = value;
        this._markDirty();
    },

    // Add an ability (deep copy)
    addAbility(ability) {
        if (!this.threat.abilities) this.threat.abilities = [];
        this.threat.abilities.push(JSON.parse(JSON.stringify(ability)));
        this._markDirty();
    },

    // Remove ability by index
    removeAbility(index) {
        if (this.threat.abilities && index >= 0 && index < this.threat.abilities.length) {
            this.threat.abilities.splice(index, 1);
            this._markDirty();
        }
    },

    // Update a field on an ability
    updateAbility(index, field, value) {
        if (this.threat.abilities && this.threat.abilities[index]) {
            this.threat.abilities[index][field] = value;
            this._markDirty();
        }
    },

    // Reorder ability (move from one index to another)
    reorderAbility(fromIndex, toIndex) {
        if (!this.threat.abilities) return;
        const abilities = this.threat.abilities;
        if (fromIndex < 0 || fromIndex >= abilities.length) return;
        if (toIndex < 0 || toIndex >= abilities.length) return;
        const [moved] = abilities.splice(fromIndex, 1);
        abilities.splice(toIndex, 0, moved);
        this._markDirty();
    },

    // Add a bonus (deep copy)
    addBonus(bonus) {
        if (!this.threat.bonuses) this.threat.bonuses = [];
        this.threat.bonuses.push(JSON.parse(JSON.stringify(bonus)));
        this._markDirty();
    },

    // Remove bonus by index
    removeBonus(index) {
        if (this.threat.bonuses && index >= 0 && index < this.threat.bonuses.length) {
            this.threat.bonuses.splice(index, 1);
            this._markDirty();
        }
    },

    // Update a field on a bonus
    updateBonus(index, field, value) {
        if (this.threat.bonuses && this.threat.bonuses[index]) {
            this.threat.bonuses[index][field] = value;
            this._markDirty();
        }
    },

    // Add a keyword
    addKeyword(keyword) {
        if (!this.threat.keywords) this.threat.keywords = [];
        if (keyword && keyword.trim()) {
            this.threat.keywords.push(keyword.trim().toUpperCase());
            this._markDirty();
        }
    },

    // Remove keyword by index
    removeKeyword(index) {
        if (this.threat.keywords && index >= 0 && index < this.threat.keywords.length) {
            this.threat.keywords.splice(index, 1);
            this._markDirty();
        }
    },

    // Get a clean threat object for preview/save/injection
    getThreatData() {
        this._serializeSkills();
        const data = JSON.parse(JSON.stringify(this.threat));
        // Remove parsedSkills from the exported data (internal only)
        delete data.parsedSkills;
        return data;
    },

    // Check if builder has unsaved work
    hasUnsavedChanges() {
        return this._isDirty;
    },

    // Check if builder is empty (nothing meaningful entered)
    isEmpty() {
        if (!this.threat) return true;
        return !this.threat.name && (!this.threat.abilities || this.threat.abilities.length === 0);
    },

    // Reset to empty threat
    clear() {
        this.threat = {
            id: this._generateId(),
            name: '',
            source: 'Custom',
            quote: '',
            attribution: '',
            description: '',
            tierThreat: { '1': 'T', '2': 'T', '3': '-', '4': '-', '5': '-' },
            keywords: [],
            attributes: { S: 1, T: 1, A: 1, I: 1, Wil: 1, Int: 1, Fel: 1 },
            resilience: { value: 1, note: '' },
            defence: 1,
            defenceNote: '',
            wounds: 1,
            shock: 1,
            skills: '',
            parsedSkills: { default: 0, awareness: 0, passiveAwareness: 0, entries: [] },
            abilities: [],
            bonuses: [],
            determination: '',
            conviction: 0,
            resolve: 0,
            speed: 6,
            speedNote: '',
            size: 'Average',
            mobOptions: '',
            mobAbilities: ''
        };
        this._isDirty = false;
        this._lastInjectedSnapshot = null;
    },

    // Save the current threat to a .threat file
    async saveThreatToFile() {
        const data = this.getThreatData();
        const suggestedName = (data.name || 'custom-threat').replace(/[^a-zA-Z0-9_-]/g, '-');
        const result = await window.api.saveThreatFile(data, suggestedName);
        if (result.success) {
            this._isDirty = false;
        }
        return result;
    },

    // Load a .threat file into the builder
    async loadThreatFromFile() {
        const result = await window.api.loadThreatFile();
        if (result.success && result.data) {
            this.threat = result.data;
            // Ensure it has a valid ID
            if (!this.threat.id || !this.threat.id.startsWith('custom_')) {
                this.threat.id = this._generateId();
            }
            this._resolveWeaponIds();
            this._parseSkillsString(this.threat.skills);
            this._markDirty();
        }
        return result;
    },

    // Check if injecting would cause a name collision in the encounter
    // (same name already exists with different stats)
    wouldCauseNameCollision() {
        const data = this.getThreatData();
        if (!data.name) return false;

        const snapshot = JSON.stringify({ ...data, id: null });
        // No collision if nothing was injected before, or data hasn't changed
        if (!this._lastInjectedSnapshot || snapshot === this._lastInjectedSnapshot) {
            return false;
        }

        // Check if any individual in the encounter references a threat with the same name
        for (const ind of EncounterState.individuals) {
            const threat = DataLoader.getThreat(ind.threatId);
            if (threat && threat.name === data.name) {
                return true;
            }
        }
        return false;
    },

    // Inject/update the current threat in DataLoader cache and add to the encounter
    injectIntoEncounter(count = 1, newName = null) {
        const data = this.getThreatData();
        if (!data.name && !newName) {
            return { success: false, error: 'Threat must have a name' };
        }

        // Apply name override if provided (from rename modal)
        if (newName) {
            data.name = newName;
            this.threat.name = newName;
        }

        // Compare current data (minus id) against the last-injected snapshot.
        // If the threat has changed, assign a new ID so previous copies keep their stats.
        const snapshot = JSON.stringify({ ...data, id: null });
        if (this._lastInjectedSnapshot && snapshot !== this._lastInjectedSnapshot) {
            const newId = this._generateId();
            this.threat.id = newId;
            data.id = newId;
        }
        this._lastInjectedSnapshot = snapshot;

        DataLoader.injectThreat(data);
        App.updateThreatCount();
        // Add individuals to the encounter
        const ids = EncounterState.addIndividual(data.id, count, false);
        return { success: true, name: data.name, addedToEncounter: ids.length > 0, count: ids.length };
    },

    // ===== Skills Parsing & Serialization =====

    // Known variant normalizations
    _SKILL_VARIANTS: {
        'Intimidate': 'Intimidation',
        'Investigate': 'Investigation'
    },

    // Parse a skills string like "Default 4, Awareness 5 (Passive 3), Weapon Skill 8"
    _parseSkillsString(str) {
        const parsed = { default: 0, awareness: 0, passiveAwareness: 0, entries: [] };
        if (!str || !str.trim()) {
            this.threat.parsedSkills = parsed;
            return;
        }

        const segments = str.split(/,\s*/);
        const regex = /^(.+?)\s+(\d+)(?:\s*\(Passive\s+(\d+)\))?$/i;

        for (const seg of segments) {
            const match = seg.trim().match(regex);
            if (!match) continue;

            let name = match[1].trim();
            const value = parseInt(match[2]);
            const passive = match[3] ? parseInt(match[3]) : 0;

            // Normalize variants
            if (this._SKILL_VARIANTS[name]) {
                name = this._SKILL_VARIANTS[name];
            }

            if (name.toLowerCase() === 'default') {
                parsed.default = value;
            } else if (name.toLowerCase() === 'awareness') {
                parsed.awareness = value;
                parsed.passiveAwareness = passive;
            } else {
                parsed.entries.push({ name, value });
            }
        }

        this.threat.parsedSkills = parsed;
    },

    // Serialize parsedSkills back to the skills string
    _serializeSkills() {
        const ps = this.threat.parsedSkills;
        if (!ps) return;

        const parts = [];
        parts.push(`Default ${ps.default}`);

        if (ps.awareness > 0) {
            let awarenessStr = `Awareness ${ps.awareness}`;
            if (ps.passiveAwareness > 0) {
                awarenessStr += ` (Passive ${ps.passiveAwareness})`;
            }
            parts.push(awarenessStr);
        }

        for (const entry of ps.entries) {
            if (entry.name) {
                parts.push(`${entry.name} ${entry.value}`);
            }
        }

        this.threat.skills = parts.join(', ');
    },

    // ===== Skills Mutation Methods =====

    updateDefaultSkill(value) {
        this.threat.parsedSkills.default = parseInt(value) || 0;
        this._markDirty();
    },

    updateAwarenessSkill(value) {
        this.threat.parsedSkills.awareness = parseInt(value) || 0;
        this._markDirty();
    },

    updatePassiveAwareness(value) {
        this.threat.parsedSkills.passiveAwareness = parseInt(value) || 0;
        this._markDirty();
    },

    addSkillEntry(name, value) {
        if (!this.threat.parsedSkills.entries) this.threat.parsedSkills.entries = [];
        this.threat.parsedSkills.entries.push({ name: name || '', value: parseInt(value) || 0 });
        this._markDirty();
    },

    removeSkillEntry(index) {
        if (this.threat.parsedSkills.entries && index >= 0 && index < this.threat.parsedSkills.entries.length) {
            this.threat.parsedSkills.entries.splice(index, 1);
            this._markDirty();
        }
    },

    updateSkillEntry(index, name, value) {
        if (this.threat.parsedSkills.entries && this.threat.parsedSkills.entries[index]) {
            this.threat.parsedSkills.entries[index].name = name;
            this.threat.parsedSkills.entries[index].value = parseInt(value) || 0;
            this._markDirty();
        }
    },

    // Mark as dirty and schedule auto-save
    _markDirty() {
        this._isDirty = true;
        this._scheduleAutoSave();
    },

    // ===== Auto-Save =====

    // Schedule an auto-save after a 2-second debounce
    _scheduleAutoSave() {
        clearTimeout(this._autoSaveTimer);
        this._autoSaveTimer = setTimeout(() => this._performAutoSave(), 2000);
    },

    // Perform the auto-save to localStorage
    _performAutoSave() {
        if (this.isEmpty()) return;
        try {
            const data = {
                threat: this.getThreatData(),
                timestamp: Date.now()
            };
            localStorage.setItem(this._AUTO_SAVE_KEY, JSON.stringify(data));
        } catch (e) {
            console.warn('Builder auto-save failed:', e);
        }
    },

    // Get the auto-saved data
    getAutoSave() {
        try {
            const raw = localStorage.getItem(this._AUTO_SAVE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.warn('Failed to read builder auto-save:', e);
            return null;
        }
    },

    // Clear the auto-save
    clearAutoSave() {
        localStorage.removeItem(this._AUTO_SAVE_KEY);
    },

    // Load threat data from auto-save
    loadFromAutoSave(threatData) {
        this.threat = threatData;
        // Ensure it has a valid custom ID
        if (!this.threat.id || !this.threat.id.startsWith('custom_')) {
            this.threat.id = this._generateId();
        }
        this._resolveWeaponIds();
        this._parseSkillsString(this.threat.skills);
        this._isDirty = true;
        this._lastInjectedSnapshot = null;
    },

    // Remove weaponId references from abilities (stats text is already populated)
    _resolveWeaponIds() {
        if (!this.threat || !this.threat.abilities) return;
        this.threat.abilities.forEach(ability => {
            if (ability.weaponId) {
                delete ability.weaponId;
            }
        });
    },

    // Generate a unique custom threat ID
    _generateId() {
        return 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }
};
