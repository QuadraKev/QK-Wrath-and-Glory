// Encounter State - State management for the Encounter Builder

const EncounterState = {
    // Encounter settings
    settings: {
        tier: 1,
        playerCount: 4,
        name: "Unnamed Encounter",
        round: 1
    },

    // Individual threat instances
    individuals: [],

    // Mob groupings
    mobs: [],

    // Player Characters for initiative tracking
    playerCharacters: [],

    // Manual ordering for encounter list (array of {type, id} objects)
    // When set, this overrides initiative-based sorting
    encounterOrder: null,

    // Track unsaved changes
    _isDirty: false,

    // Auto-save support
    _autoSaveTimer: null,
    _AUTO_SAVE_KEY: 'wng-bestiary-autosave',

    // Initialize the state
    init() {
        // Start with a clean, empty encounter
        this._isDirty = false;
    },

    // Mark encounter as having unsaved changes
    markDirty() {
        this._isDirty = true;
        this._scheduleAutoSave();
    },

    // Mark encounter as saved (no unsaved changes)
    markClean() {
        this._isDirty = false;
    },

    // Check if there are unsaved changes
    hasUnsavedChanges() {
        return this._isDirty;
    },

    // Check if encounter is empty (nothing to save)
    isEmpty() {
        return this.individuals.length === 0 && this.mobs.length === 0 && this.playerCharacters.length === 0;
    },

    // Generate a unique ID
    generateId() {
        return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    },

    // ===== Individual Management =====

    // Add threat(s) as individuals
    addIndividual(threatId, quantity = 1, asMob = false) {
        const threat = DataLoader.getThreat(threatId);
        if (!threat) return [];

        const newIndividuals = [];

        for (let i = 0; i < quantity; i++) {
            const individual = {
                id: this.generateId(),
                threatId: threatId,
                bonus: 'none', // 'none', 'elite', or 'adversary'
                currentWounds: 0,
                currentShock: 0,
                maxWounds: this.calculateMaxWounds(threat, 'none'),
                maxShock: this.calculateMaxShock(threat, 'none'),
                mobId: null,
                initiative: null,
                notes: "",
                additionalWeaponId: null,
                personalRuin: this.getChampionRuin(threat)
            };
            this.individuals.push(individual);
            newIndividuals.push(individual);
        }

        // If adding as mob with multiple individuals
        if (asMob && newIndividuals.length > 1) {
            const mobId = this.createMob(threatId, newIndividuals.map(i => i.id));
            return [mobId];
        }

        this.markDirty();
        return newIndividuals.map(i => i.id);
    },

    // Remove an individual
    removeIndividual(id) {
        const individual = this.individuals.find(i => i.id === id);
        if (individual && individual.mobId) {
            // Remove from mob first
            this.removeFromMob(id);
        }
        this.individuals = this.individuals.filter(i => i.id !== id);
        this.markDirty();
    },

    // Update wounds (delta can be positive or negative)
    updateWounds(id, delta) {
        const individual = this.individuals.find(i => i.id === id);
        if (individual) {
            individual.currentWounds = Math.max(0, Math.min(individual.maxWounds, individual.currentWounds + delta));
            this.markDirty();
        }
    },

    // Update shock (delta can be positive or negative)
    updateShock(id, delta) {
        const individual = this.individuals.find(i => i.id === id);
        if (individual) {
            individual.currentShock = Math.max(0, Math.min(individual.maxShock, individual.currentShock + delta));
            this.markDirty();
        }
    },

    // Set initiative for an individual
    setInitiative(id, value) {
        const individual = this.individuals.find(i => i.id === id);
        if (individual) {
            individual.initiative = value === '' || value === null ? null : parseInt(value);
            this.markDirty();
        }
    },

    // Set initiative for a mob
    setMobInitiative(mobId, value) {
        const mob = this.mobs.find(m => m.id === mobId);
        if (mob) {
            mob.initiative = value === '' || value === null ? null : parseInt(value);
            this.markDirty();
        }
    },

    // Duplicate an individual
    duplicateIndividual(id) {
        const original = this.individuals.find(i => i.id === id);
        if (!original) return null;

        const threat = DataLoader.getThreat(original.threatId);
        const duplicate = {
            ...original,
            id: this.generateId(),
            currentWounds: 0,
            currentShock: 0,
            maxWounds: threat ? this.calculateMaxWounds(threat, original.bonus) : original.maxWounds,
            maxShock: threat ? this.calculateMaxShock(threat, original.bonus) : original.maxShock,
            mobId: null,
            notes: "",
            additionalWeaponId: original.additionalWeaponId || null,
            personalRuin: threat ? this.getChampionRuin(threat) : 0
        };
        this.individuals.push(duplicate);
        this.markDirty();
        return duplicate.id;
    },

    // Update notes for an individual
    updateIndividualNotes(id, notes) {
        const individual = this.individuals.find(i => i.id === id);
        if (individual) {
            individual.notes = notes;
            this.markDirty();
        }
    },

    // Update bonus for an individual
    updateBonus(id, bonus) {
        const individual = this.individuals.find(i => i.id === id);
        if (individual) {
            individual.bonus = bonus;
            const threat = DataLoader.getThreat(individual.threatId);
            if (threat) {
                individual.maxWounds = this.calculateMaxWounds(threat, bonus);
                individual.maxShock = this.calculateMaxShock(threat, bonus);
                // Ensure current values don't exceed new max
                individual.currentWounds = Math.min(individual.currentWounds, individual.maxWounds);
                individual.currentShock = Math.min(individual.currentShock, individual.maxShock);
            }
            this.markDirty();
        }
    },

    // Update personal Ruin (no maximum; minimum 0)
    updatePersonalRuin(id, delta) {
        const individual = this.individuals.find(i => i.id === id);
        if (individual) {
            individual.personalRuin = Math.max(0, (individual.personalRuin || 0) + delta);
            this.markDirty();
        }
    },

    // Set an additional weapon for an individual
    setAdditionalWeapon(individualId, compositeId) {
        const individual = this.individuals.find(i => i.id === individualId);
        if (!individual) return;
        individual.additionalWeaponId = compositeId || null;
        this.markDirty();
    },

    // Get an individual by ID
    getIndividual(id) {
        return this.individuals.find(i => i.id === id);
    },

    // Check if individual is dead (wounds >= max only; shock does not auto-kill)
    isIndividualDead(id) {
        const individual = this.individuals.find(i => i.id === id);
        if (!individual) return false;
        return individual.currentWounds >= individual.maxWounds;
    },

    // Mark an individual as dead (set wounds to max)
    markAsDead(id) {
        const individual = this.individuals.find(i => i.id === id);
        if (individual) {
            individual.currentWounds = individual.maxWounds;
            this.markDirty();
        }
    },

    // Revive an individual (reset wounds and shock to 0)
    reviveIndividual(id) {
        const individual = this.individuals.find(i => i.id === id);
        if (individual) {
            individual.currentWounds = 0;
            individual.currentShock = 0;
            this.markDirty();
        }
    },

    // ===== Mob Management =====

    // Create a mob from individuals
    createMob(threatId, individualIds) {
        const threat = DataLoader.getThreat(threatId);
        if (!threat) return null;

        const mob = {
            id: this.generateId(),
            threatId: threatId,
            name: `${threat.name} Mob`,
            initiative: null,
            notes: ""
        };

        // Update individuals to reference this mob
        individualIds.forEach(id => {
            const individual = this.individuals.find(i => i.id === id);
            if (individual && individual.threatId === threatId) {
                individual.mobId = mob.id;
            }
        });

        this.mobs.push(mob);
        this.markDirty();
        return mob.id;
    },

    // Add existing individuals to a mob
    addToMob(mobId, individualIds) {
        const mob = this.mobs.find(m => m.id === mobId);
        if (!mob) return;

        individualIds.forEach(id => {
            const individual = this.individuals.find(i => i.id === id);
            if (individual && individual.threatId === mob.threatId && !individual.mobId) {
                individual.mobId = mobId;
            }
        });
        this.markDirty();
    },

    // Remove an individual from its mob
    removeFromMob(individualId) {
        const individual = this.individuals.find(i => i.id === individualId);
        if (individual && individual.mobId) {
            const mobId = individual.mobId;
            individual.mobId = null;

            // Check if mob is now empty and should be removed
            const remainingMembers = this.getMobMembers(mobId);
            if (remainingMembers.length === 0) {
                this.mobs = this.mobs.filter(m => m.id !== mobId);
            }
            this.markDirty();
        }
    },

    // Split a mob into smaller groups
    splitMob(mobId, groupSizes) {
        const mob = this.mobs.find(m => m.id === mobId);
        if (!mob) return [];

        const members = this.getMobMembers(mobId);
        const livingMembers = members.filter(m => !this.isIndividualDead(m.id));

        if (livingMembers.length === 0) return [];

        // Clear all members from current mob
        members.forEach(m => m.mobId = null);

        const newMobIds = [];
        let memberIndex = 0;

        groupSizes.forEach((size, groupIndex) => {
            if (size <= 0 || memberIndex >= livingMembers.length) return;

            const groupMembers = livingMembers.slice(memberIndex, memberIndex + size);
            memberIndex += size;

            if (groupMembers.length === 1) {
                // Single member becomes standalone individual
                return;
            }

            // Create new mob for this group
            const newMob = {
                id: this.generateId(),
                threatId: mob.threatId,
                name: `${mob.name} ${groupIndex + 1}`,
                initiative: mob.initiative,
                notes: ""
            };

            groupMembers.forEach(m => m.mobId = newMob.id);
            this.mobs.push(newMob);
            newMobIds.push(newMob.id);
        });

        // Remove the original mob
        this.mobs = this.mobs.filter(m => m.id !== mobId);
        this.markDirty();
        return newMobIds;
    },

    // Split off N members from a mob into a new mob
    splitOffFromMob(mobId, count) {
        const mob = this.mobs.find(m => m.id === mobId);
        if (!mob) return null;

        const livingMembers = this.getMobLivingMembers(mobId);

        // Need at least 2 living members and count must leave at least 1 in original
        if (livingMembers.length < 2 || count < 1 || count >= livingMembers.length) {
            return null;
        }

        // Take the first 'count' living members for the new mob
        const splitMembers = livingMembers.slice(0, count);

        // Create new mob for the split members
        const threat = DataLoader.getThreat(mob.threatId);
        const newMob = {
            id: this.generateId(),
            threatId: mob.threatId,
            name: `${threat?.name || 'Unknown'} Mob`,
            initiative: mob.initiative,
            notes: ""
        };

        // Update the split members to reference the new mob
        splitMembers.forEach(m => m.mobId = newMob.id);

        this.mobs.push(newMob);
        this.markDirty();
        return newMob.id;
    },

    // Duplicate a mob - creates a fresh copy with all living members at full health
    duplicateMob(mobId) {
        const mob = this.mobs.find(m => m.id === mobId);
        if (!mob) return null;

        const threat = DataLoader.getThreat(mob.threatId);
        const livingMembers = this.getMobLivingMembers(mobId);
        if (livingMembers.length === 0) return null;

        // Create fresh individual copies for each living member
        const newIndividualIds = [];
        livingMembers.forEach(original => {
            const individual = {
                id: this.generateId(),
                threatId: original.threatId,
                bonus: original.bonus,
                currentWounds: 0,
                currentShock: 0,
                maxWounds: original.maxWounds,
                maxShock: original.maxShock,
                mobId: null,
                initiative: null,
                notes: "",
                additionalWeaponId: null,
                personalRuin: threat ? this.getChampionRuin(threat) : 0
            };
            this.individuals.push(individual);
            newIndividualIds.push(individual.id);
        });

        // Create the new mob
        const newMob = {
            id: this.generateId(),
            threatId: mob.threatId,
            name: mob.name,
            initiative: null,
            notes: ""
        };

        // Link new individuals to the new mob
        newIndividualIds.forEach(id => {
            const individual = this.individuals.find(i => i.id === id);
            if (individual) individual.mobId = newMob.id;
        });

        this.mobs.push(newMob);
        this.markDirty();
        return newMob.id;
    },

    // Disband a mob - all members become standalone
    disbandMob(mobId) {
        const members = this.getMobMembers(mobId);
        members.forEach(m => m.mobId = null);
        this.mobs = this.mobs.filter(m => m.id !== mobId);
        this.markDirty();
    },

    // Get all members of a mob
    getMobMembers(mobId) {
        return this.individuals.filter(i => i.mobId === mobId);
    },

    // Get living members of a mob
    getMobLivingMembers(mobId) {
        return this.getMobMembers(mobId).filter(m => !this.isIndividualDead(m.id));
    },

    // Get a mob by ID
    getMob(mobId) {
        return this.mobs.find(m => m.id === mobId);
    },

    // Calculate mob attack bonus
    getMobAttackBonus(mobId) {
        const livingCount = this.getMobLivingMembers(mobId).length;
        const max = Math.floor(livingCount / 2);
        const bonus = Math.min(livingCount - 1, max);
        return { bonus: Math.max(0, bonus), max, count: livingCount };
    },

    // Update mob notes
    updateMobNotes(mobId, notes) {
        const mob = this.mobs.find(m => m.id === mobId);
        if (mob) {
            mob.notes = notes;
            this.markDirty();
        }
    },

    // Remove a mob and all its members
    removeMob(mobId) {
        const members = this.getMobMembers(mobId);
        members.forEach(m => {
            this.individuals = this.individuals.filter(i => i.id !== m.id);
        });
        this.mobs = this.mobs.filter(m => m.id !== mobId);
        this.markDirty();
    },

    // ===== Player Character Management =====

    // Add a player character
    addPlayerCharacter(name) {
        if (!name || !name.trim()) return null;

        const pc = {
            id: this.generateId(),
            name: name.trim(),
            initiative: null,
            notes: ""
        };
        this.playerCharacters.push(pc);
        this.markDirty();
        return pc.id;
    },

    // Add multiple player characters from a text input (newline or comma separated)
    addPlayerCharactersFromText(text) {
        if (!text || !text.trim()) return [];

        // Split by newlines or commas
        const names = text.split(/[\n,]+/)
            .map(n => n.trim())
            .filter(n => n.length > 0);

        const addedIds = [];
        names.forEach(name => {
            const id = this.addPlayerCharacter(name);
            if (id) addedIds.push(id);
        });

        return addedIds;
    },

    // Remove a player character
    removePlayerCharacter(id) {
        this.playerCharacters = this.playerCharacters.filter(pc => pc.id !== id);
        this.markDirty();
    },

    // Update player character name
    updatePlayerCharacterName(id, name) {
        const pc = this.playerCharacters.find(p => p.id === id);
        if (pc) {
            pc.name = name;
            this.markDirty();
        }
    },

    // Set initiative for a player character
    setPlayerCharacterInitiative(id, value) {
        const pc = this.playerCharacters.find(p => p.id === id);
        if (pc) {
            pc.initiative = value === '' || value === null ? null : parseInt(value);
            this.markDirty();
        }
    },

    // Update player character notes
    updatePlayerCharacterNotes(id, notes) {
        const pc = this.playerCharacters.find(p => p.id === id);
        if (pc) {
            pc.notes = notes;
            this.markDirty();
        }
    },

    // Get a player character by ID
    getPlayerCharacter(id) {
        return this.playerCharacters.find(p => p.id === id);
    },

    // ===== Manual Ordering =====

    // Set the manual order of encounter items
    setEncounterOrder(orderedItems) {
        this.encounterOrder = orderedItems.map(item => ({
            type: item.type,
            id: item.id
        }));
        this.markDirty();
    },

    // Clear manual order (revert to initiative-based sorting)
    clearEncounterOrder() {
        this.encounterOrder = null;
        this.markDirty();
    },

    // Move an item to a new position in the order
    moveItemInOrder(itemType, itemId, newIndex) {
        // First, ensure we have a current order to work with
        if (!this.encounterOrder) {
            // Initialize order from current initiative-sorted list
            const currentItems = this.getEncounterListItems();
            this.encounterOrder = currentItems.map(item => ({
                type: item.type,
                id: item.id
            }));
        }

        // Find and remove the item from its current position
        const currentIndex = this.encounterOrder.findIndex(
            item => item.type === itemType && item.id === itemId
        );

        let movedItem;
        if (currentIndex === -1) {
            // Item not in order yet (e.g., just removed from a mob)
            // Add it as a new entry
            movedItem = { type: itemType, id: itemId };
        } else {
            // Remove from current position
            [movedItem] = this.encounterOrder.splice(currentIndex, 1);
        }

        // Insert at new position
        const adjustedIndex = currentIndex !== -1 && newIndex > currentIndex ? newIndex - 1 : newIndex;
        this.encounterOrder.splice(Math.max(0, Math.min(adjustedIndex, this.encounterOrder.length)), 0, movedItem);

        this.markDirty();
    },

    // ===== Bonus Calculations =====

    // Calculate max wounds based on threat and bonus type
    calculateMaxWounds(threat, bonus) {
        const baseWounds = threat.wounds || 1;

        switch (bonus) {
            case 'none':
                return baseWounds;
            case 'elite':
                return baseWounds + this.settings.tier;
            case 'adversary':
                return baseWounds + this.settings.playerCount + this.settings.tier;
            default:
                return baseWounds;
        }
    },

    // Calculate max shock based on threat and bonus type
    calculateMaxShock(threat, bonus) {
        // Threats with '-' or 0 shock have no shock and should not be modified
        if (!threat.shock || typeof threat.shock !== 'number' || threat.shock <= 0) {
            return 0;
        }
        const baseShock = threat.shock;

        switch (bonus) {
            case 'none':
                return baseShock;
            case 'elite':
                return baseShock + this.settings.tier;
            case 'adversary':
                return baseShock + this.settings.playerCount + this.settings.tier;
            default:
                return baseShock;
        }
    },

    // Get bonus display info
    getBonusDisplay(bonus) {
        switch (bonus) {
            case 'elite':
                return { label: 'E', title: 'Elite Bonus', class: 'bonus-elite' };
            case 'adversary':
                return { label: 'A', title: 'Adversary Bonus', class: 'bonus-adversary' };
            default:
                return { label: '', title: 'No Bonus', class: 'bonus-none' };
        }
    },

    // Recalculate all max wounds/shock after settings change
    recalculateAllStats() {
        this.individuals.forEach(individual => {
            const threat = DataLoader.getThreat(individual.threatId);
            if (threat) {
                individual.maxWounds = this.calculateMaxWounds(threat, individual.bonus);
                individual.maxShock = this.calculateMaxShock(threat, individual.bonus);
                // Ensure current values don't exceed new max
                individual.currentWounds = Math.min(individual.currentWounds, individual.maxWounds);
                individual.currentShock = Math.min(individual.currentShock, individual.maxShock);
            }
        });
        this.markDirty();
    },

    // Update settings
    updateSettings(newSettings) {
        const tierChanged = newSettings.tier !== undefined && newSettings.tier !== this.settings.tier;
        const playerCountChanged = newSettings.playerCount !== undefined && newSettings.playerCount !== this.settings.playerCount;

        Object.assign(this.settings, newSettings);

        if (tierChanged || playerCountChanged) {
            this.recalculateAllStats();
        }
        this.markDirty();
    },

    // ===== Round Tracking =====

    incrementRound() {
        this.settings.round++;
        this.markDirty();
    },

    decrementRound() {
        if (this.settings.round > 1) {
            this.settings.round--;
            this.markDirty();
        }
    },

    // ===== Helpers =====

    // Get the initial personal Ruin amount from a threat's Champion bonus (0 if none)
    getChampionRuin(threat) {
        if (!threat || !threat.bonuses) return 0;
        const bonus = threat.bonuses.find(b => b.name === 'Champion');
        if (!bonus || !bonus.description) return 0;
        const match = bonus.description.match(/has (\d+) personal Ruin/);
        return match ? parseInt(match[1]) : 0;
    },

    // Check if a threat has the Champion bonus
    threatHasChampion(threat) {
        return !!(threat && threat.bonuses && threat.bonuses.some(b => b.name === 'Champion'));
    },

    // Check if a threat can be in a mob at current tier
    canBeMob(threat) {
        if (!threat || !threat.tierThreat) return false;
        const tierLevel = threat.tierThreat[this.settings.tier];
        return tierLevel === 'T';
    },

    // Check if a threat can ever be in a mob (is Troop at any tier)
    canEverBeMob(threat) {
        if (!threat || !threat.tierThreat) return false;
        return Object.values(threat.tierThreat).includes('T');
    },

    // Get compatible individuals that can join a mob (same threat, no current mob)
    getCompatibleIndividualsForMob(threatId) {
        return this.individuals.filter(i =>
            i.threatId === threatId &&
            !i.mobId &&
            !this.isIndividualDead(i.id)
        );
    },

    // Get all standalone individuals (not in a mob)
    getStandaloneIndividuals() {
        return this.individuals.filter(i => !i.mobId);
    },

    // Get encounter list items sorted by initiative or manual order
    getEncounterListItems() {
        const items = [];

        // Build a set of threat names that appear under multiple distinct threat IDs,
        // so we can annotate only when there's an actual name collision
        const nameToIds = new Map();
        this.individuals.forEach(ind => {
            const t = DataLoader.getThreat(ind.threatId);
            if (t) {
                if (!nameToIds.has(t.name)) nameToIds.set(t.name, new Set());
                nameToIds.get(t.name).add(ind.threatId);
            }
        });

        // Add standalone individuals
        this.getStandaloneIndividuals().forEach(individual => {
            const threat = DataLoader.getThreat(individual.threatId);
            let name = threat ? threat.name : 'Unknown';
            // Show source only when the same name maps to different threat IDs
            if (threat && nameToIds.get(threat.name)?.size > 1 && threat.source) {
                name += ` (${threat.source})`;
            }
            items.push({
                type: 'individual',
                id: individual.id,
                name: name,
                bonus: individual.bonus,
                initiative: individual.initiative,
                isDead: this.isIndividualDead(individual.id),
                data: individual
            });
        });

        // Add mobs
        this.mobs.forEach(mob => {
            const threat = DataLoader.getThreat(mob.threatId);
            const members = this.getMobMembers(mob.id);
            const livingCount = this.getMobLivingMembers(mob.id).length;
            items.push({
                type: 'mob',
                id: mob.id,
                name: mob.name,
                bonus: 'none', // Mobs don't have bonus
                initiative: mob.initiative,
                isDead: livingCount === 0,
                memberCount: members.length,
                livingCount: livingCount,
                data: mob
            });
        });

        // Add player characters
        this.playerCharacters.forEach(pc => {
            items.push({
                type: 'player',
                id: pc.id,
                name: pc.name,
                initiative: pc.initiative,
                isDead: false,
                data: pc
            });
        });

        // If we have a manual order, use it
        if (this.encounterOrder && this.encounterOrder.length > 0) {
            const orderedItems = [];
            const itemMap = new Map();

            // Create a map for quick lookup
            items.forEach(item => {
                itemMap.set(`${item.type}-${item.id}`, item);
            });

            // Add items in the stored order
            this.encounterOrder.forEach(orderEntry => {
                const key = `${orderEntry.type}-${orderEntry.id}`;
                const item = itemMap.get(key);
                if (item) {
                    orderedItems.push(item);
                    itemMap.delete(key);
                }
            });

            // Add any new items (not in the order yet) at the end, sorted by initiative
            const newItems = Array.from(itemMap.values());
            newItems.sort((a, b) => {
                if (a.initiative === null && b.initiative === null) return 0;
                if (a.initiative === null) return 1;
                if (b.initiative === null) return -1;
                return b.initiative - a.initiative;
            });
            orderedItems.push(...newItems);

            return orderedItems;
        }

        // Default: Sort by initiative (highest first, null at bottom)
        items.sort((a, b) => {
            if (a.initiative === null && b.initiative === null) return 0;
            if (a.initiative === null) return 1;
            if (b.initiative === null) return -1;
            return b.initiative - a.initiative;
        });

        return items;
    },

    // ===== Custom Threat Collection =====

    // Collect custom threat objects referenced by individuals in the encounter
    _collectCustomThreats() {
        const seen = new Set();
        const customThreats = [];
        this.individuals.forEach(ind => {
            if (ind.threatId && ind.threatId.startsWith('custom_') && !seen.has(ind.threatId)) {
                seen.add(ind.threatId);
                const threat = DataLoader.getThreat(ind.threatId);
                if (threat) {
                    customThreats.push(JSON.parse(JSON.stringify(threat)));
                }
            }
        });
        return customThreats;
    },

    // ===== File Persistence =====

    // Get encounter data for saving
    getEncounterData() {
        return {
            version: 1,
            settings: { ...this.settings },
            individuals: [...this.individuals],
            mobs: [...this.mobs],
            playerCharacters: [...this.playerCharacters],
            encounterOrder: this.encounterOrder ? [...this.encounterOrder] : null,
            customThreats: this._collectCustomThreats()
        };
    },

    // Save encounter to file
    async saveEncounterToFile() {
        const data = this.getEncounterData();
        const suggestedName = this.settings.name || 'encounter';
        const result = await window.api.saveEncounterFile(data, suggestedName);

        if (result.success) {
            this.settings.name = result.fileName;
            this.markClean();
        }

        return result;
    },

    // Load encounter from file
    async loadEncounterFromFile() {
        const result = await window.api.loadEncounterFile();

        if (result.success && result.data) {
            const parsed = result.data;
            // Re-inject custom threats before resolving encounter entries
            if (parsed.customThreats) {
                parsed.customThreats.forEach(t => DataLoader.injectThreat(t));
            }
            this.settings = parsed.settings || { tier: 1, playerCount: 4, name: result.fileName, round: 1 };
            this.settings.name = result.fileName; // Use filename as encounter name
            if (this.settings.round === undefined) this.settings.round = 1;
            this.individuals = parsed.individuals || [];
            this.mobs = parsed.mobs || [];
            this.playerCharacters = parsed.playerCharacters || [];
            this.encounterOrder = parsed.encounterOrder || null;
            this.markClean(); // Just loaded, so no unsaved changes
        }

        return result;
    },

    // Load encounter from data object (used by close dialog save and auto-save restore)
    loadFromData(data) {
        // Re-inject custom threats before resolving encounter entries
        if (data.customThreats) {
            data.customThreats.forEach(t => DataLoader.injectThreat(t));
        }
        this.settings = data.settings || { tier: 1, playerCount: 4, name: "Unnamed Encounter", round: 1 };
        if (this.settings.round === undefined) this.settings.round = 1;
        this.individuals = data.individuals || [];
        this.mobs = data.mobs || [];
        this.playerCharacters = data.playerCharacters || [];
        this.encounterOrder = data.encounterOrder || null;
    },

    // Clear the current encounter
    clearEncounter() {
        this.settings = { tier: 1, playerCount: 4, name: "Unnamed Encounter", round: 1 };
        this.individuals = [];
        this.mobs = [];
        this.playerCharacters = [];
        this.encounterOrder = null;
        this.markClean(); // Fresh encounter has no unsaved changes
        this.clearAutoSave();
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
                encounter: this.getEncounterData(),
                customThreats: this._collectCustomThreats(),
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
    }
};
