// Character Check - repairs the type of each known field of a loaded character
// (spec docs/superpowers/specs/2026-11-15-character-load-check-design.md, §4.1, §5 and §6).
// A value of the wrong type gets the repair value of its row, and its path goes into the returned list.
// The check never changes a value that some app version can write (R1), and it keeps each unknown key (R6).
// It reads no data file, so node tests can load this file alone in a vm sandbox.

const CharacterCheck = {
    // The talents whose choice is a discipline name (the same list as State.getUnlockedDisciplines)
    DISCIPLINE_CHOICE_TALENTS: ['warped_mind', 'tormented_manifestation_aoa'],

    // Type tests (spec §4.1 rule 8: a numeric string is a wrong type, and Infinity is not finite)
    _is: {
        string: v => typeof v === 'string',
        stringOrNull: v => v === null || typeof v === 'string',
        integer: v => Number.isInteger(v),
        integerOrNull: v => v === null || Number.isInteger(v),
        number: v => typeof v === 'number' && Number.isFinite(v),
        numberOrNull: v => v === null || (typeof v === 'number' && Number.isFinite(v)),
        boolean: v => typeof v === 'boolean'
    },

    isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    },

    // Changes character in place. defaults is a fresh State.createNewCharacter() object.
    // Returns the repaired paths: the rows of spec §5, then the lists of spec §6.1, each in table order.
    // A path uses the index of the entry in the loaded file, also after an entry before it was dropped.
    repair(character, defaults) {
        const is = this._is;
        const paths = [];
        const c = character;

        // §5.1 top-level scalars (rows 1-12). The repair value is the default.
        const scalars = [
            ['name', is.string], ['setting', is.string], ['notes', is.string],
            ['tier', is.integer], ['rank', is.integerOrNull], ['additionalXp', is.integerOrNull], ['corruption', is.integerOrNull],
            ['currentWounds', is.numberOrNull], ['currentShock', is.numberOrNull], ['currentWealth', is.numberOrNull],
            ['currentWrath', is.numberOrNull], ['currentFaith', is.numberOrNull]
        ];
        for (const [key, test] of scalars) this._key(c, key, test, defaults[key], key, paths);

        // §5.2 rows 13-21
        const species = this._object(c, 'species', defaults.species, 'species', paths);
        this._key(species, 'id', is.stringOrNull, null, 'species.id', paths);
        this._key(species, 'xpCost', is.number, 0, 'species.xpCost', paths);
        const archetype = this._object(c, 'archetype', defaults.archetype, 'archetype', paths);
        this._key(archetype, 'id', is.stringOrNull, null, 'archetype.id', paths);
        this._key(archetype, 'xpCost', is.number, 0, 'archetype.xpCost', paths);
        const custom = this._object(c, 'customArchetype', defaults.customArchetype, 'customArchetype', paths);
        this._key(custom, 'name', is.string, '', 'customArchetype.name', paths);
        this._key(custom, 'abilityArchetypeId', is.stringOrNull, null, 'customArchetype.abilityArchetypeId', paths);

        // Row 22: optional, so an absent key stays absent
        if (this._has(c, 'archetypeKeywordChoices')) {
            const choices = this._object(c, 'archetypeKeywordChoices', {}, 'archetypeKeywordChoices', paths);
            this._stringValues(choices, 'archetypeKeywordChoices', paths);
        }

        // Rows 23-26a
        this._numberMap(c, 'attributes', defaults.attributes, paths);
        this._numberMap(c, 'skills', defaults.skills, paths);

        // Rows 27-30
        const background = this._object(c, 'background', defaults.background, 'background', paths);
        const entries = ['origin', 'accomplishment', 'goal'];
        const isEntry = v => v === null || (this.isPlainObject(v) && typeof v.id === 'string');
        for (const key of entries) this._key(background, key, isEntry, null, `background.${key}`, paths);
        for (const key of entries) {
            if (background[key] !== null) this._key(background[key], 'bonusType', is.stringOrNull, null, `background.${key}.bonusType`, paths, true);
        }
        this._key(background, 'bonusUsed', is.stringOrNull, null, 'background.bonusUsed', paths);

        // §6.1 lists (rows 31-46)
        const isString = is.string;
        this._list(species, 'subOptions', [], 'species.subOptions', paths,
            e => this.isPlainObject(e) && typeof e.type === 'string' && typeof e.optionId === 'string');
        this._list(custom, 'keywords', [], 'customArchetype.keywords', paths, isString);
        this._list(custom, 'wargear', [], 'customArchetype.wargear', paths, isString);
        this._list(c, 'ascensions', defaults.ascensions, 'ascensions', paths, (e, p) => this._ascension(e, p, paths));
        this._list(c, 'talents', defaults.talents, 'talents', paths, (e, p) => this._talent(e, p, paths));
        this._wargear(c, defaults.wargear, paths);
        this._list(c, 'psychicPowers', defaults.psychicPowers, 'psychicPowers', paths, isString);
        this._list(c, 'freePowers', defaults.freePowers, 'freePowers', paths, isString);
        this._list(c, 'unlockedDisciplines', defaults.unlockedDisciplines, 'unlockedDisciplines', paths, isString);
        this._list(c, 'memorableInjuries', defaults.memorableInjuries, 'memorableInjuries', paths, (e, p) => {
            if (!this._hasStringId(e)) return false;
            this._key(e, 'escalated', is.boolean, false, `${p}.escalated`, paths);
            return true;
        });
        this._list(c, 'traumaticInjuries', defaults.traumaticInjuries, 'traumaticInjuries', paths, (e, p) => {
            if (!this._hasStringId(e)) return false;
            this._key(e, 'side', is.stringOrNull, null, `${p}.side`, paths);
            this._key(e, 'reconstructed', is.boolean, false, `${p}.reconstructed`, paths, true);
            return true;
        });
        this._list(c, 'mutations', defaults.mutations, 'mutations', paths, (e, p) => {
            if (!this._hasStringId(e)) return false;
            this._key(e, 'subChoice', is.stringOrNull, null, `${p}.subChoice`, paths);
            return true;
        });
        this._list(c, 'followers', defaults.followers, 'followers', paths, (e, p) => this._follower(e, p, paths));
        this._list(c, 'languages', defaults.languages, 'languages', paths, isString);
        this._list(c, 'freeLanguages', defaults.freeLanguages, 'freeLanguages', paths, isString);
        this._list(c, 'customKeywords', [], 'customKeywords', paths, isString, true);

        return paths;
    },

    // Spec §6.2. Returns false to drop the entry.
    _ascension(entry, path, paths) {
        const is = this._is;
        if (!this.isPlainObject(entry) || !Number.isInteger(entry.targetTier)) return false;
        this._key(entry, 'type', is.string, '', `${path}.type`, paths);
        this._key(entry, 'packageId', is.stringOrNull, null, `${path}.packageId`, paths);
        this._key(entry, 'archetypeId', is.stringOrNull, null, `${path}.archetypeId`, paths);
        if (this._has(entry, 'choices')) {
            if (!this.isPlainObject(entry.choices)) {
                delete entry.choices;
                paths.push(`${path}.choices`);
            } else {
                this._stringValues(entry.choices, `${path}.choices`, paths);
            }
        }
        return true;
    },

    // Spec §6.3. Returns false to drop the entry.
    _talent(entry, path, paths) {
        if (typeof entry === 'string') return true;
        if (!this._hasStringId(entry)) return false;
        const choiceTest = this.DISCIPLINE_CHOICE_TALENTS.includes(entry.id)
            ? this._is.stringOrNull
            : v => this._is.stringOrNull(v) || this._is.number(v);
        this._key(entry, 'choice', choiceTest, null, `${path}.choice`, paths, true);
        this._key(entry, 'ascensionGranted', this._is.boolean, false, `${path}.ascensionGranted`, paths, true);
        return true;
    },

    // Spec §6.4. Talent choices store wargear indices, so no entry is dropped and the order stays.
    // entry.custom is not checked here: the custom wargear repair of State.loadCharacter owns it.
    _wargear(c, defaultList, paths) {
        const is = this._is;
        if (!Array.isArray(c.wargear)) {
            c.wargear = defaultList;
            paths.push('wargear');
            return;
        }
        c.wargear.forEach((entry, index) => {
            const path = `wargear[${index}]`;
            if (!this.isPlainObject(entry)) {
                c.wargear[index] = { id: typeof entry === 'string' ? entry : '', isStarting: false };
                paths.push(path);
                return;
            }
            this._key(entry, 'id', is.string, '', `${path}.id`, paths);
            this._key(entry, 'isStarting', is.boolean, false, `${path}.isStarting`, paths, true);
            this._key(entry, 'equipped', is.boolean, false, `${path}.equipped`, paths, true);
            this._list(entry, 'upgrades', [], `${path}.upgrades`, paths, is.string, true);
            if (this._has(entry, 'relic')) {
                if (!this.isPlainObject(entry.relic)) {
                    delete entry.relic;
                    paths.push(`${path}.relic`);
                } else {
                    const relic = entry.relic, p = `${path}.relic`;
                    this._key(relic, 'name', is.string, '', `${p}.name`, paths);
                    for (const key of ['form', 'originalOwner', 'anointment', 'power']) this._key(relic, key, is.stringOrNull, null, `${p}.${key}`, paths);
                    this._list(relic, 'oddities', [], `${p}.oddities`, paths, is.string);
                    if (this._has(relic, 'powerChoice') && typeof relic.powerChoice !== 'string') {
                        delete relic.powerChoice;
                        paths.push(`${p}.powerChoice`);
                    }
                }
            }
            if (this._has(entry, 'improvised')) {
                if (!this.isPlainObject(entry.improvised)) {
                    delete entry.improvised;
                    paths.push(`${path}.improvised`);
                } else {
                    const improvised = entry.improvised, p = `${path}.improvised`;
                    this._key(improvised, 'name', is.string, '', `${p}.name`, paths);
                    this._key(improvised, 'details', is.string, '', `${p}.details`, paths);
                    this._key(improvised, 'halfTime', is.integer, 0, `${p}.halfTime`, paths);
                    for (const key of ['damageRank', 'removeUnwieldy', 'doubleRange']) this._key(improvised, key, is.boolean, false, `${p}.${key}`, paths);
                    this._list(improvised, 'traits', [], `${p}.traits`, paths, is.string);
                }
            }
        });
    },

    // Spec §6.5. Returns false to drop the entry.
    _follower(entry, path, paths) {
        const is = this._is;
        if (!this._hasStringId(entry)) return false;
        this._key(entry, 'threatId', is.string, '', `${path}.threatId`, paths);
        this._key(entry, 'name', is.string, '', `${path}.name`, paths);
        this._key(entry, 'notes', is.string, '', `${path}.notes`, paths);
        this._key(entry, 'kind', is.string, 'individual', `${path}.kind`, paths);
        this._key(entry, 'count', is.numberOrNull, 1, `${path}.count`, paths);
        this._key(entry, 'livingCount', is.numberOrNull, 1, `${path}.livingCount`, paths);
        this._key(entry, 'mobCount', is.numberOrNull, null, `${path}.mobCount`, paths, true);
        this._key(entry, 'mobLivingCount', is.numberOrNull, null, `${path}.mobLivingCount`, paths, true);
        this._key(entry, 'useAlternativeStats', is.boolean, false, `${path}.useAlternativeStats`, paths);
        this._key(entry, 'currentWounds', is.numberOrNull, null, `${path}.currentWounds`, paths);
        this._key(entry, 'currentShock', is.numberOrNull, null, `${path}.currentShock`, paths);
        return true;
    },

    // Rows 23-26a: a known key is an integer, else its default. An unknown key stays,
    // and its value is a finite number or null, else null (R10).
    _numberMap(c, key, defaultMap, paths) {
        const map = this._object(c, key, defaultMap, key, paths);
        for (const name of Object.keys(defaultMap)) this._key(map, name, this._is.integer, defaultMap[name], `${key}.${name}`, paths);
        for (const name of Object.keys(map)) {
            if (!this._has(defaultMap, name)) this._key(map, name, this._is.numberOrNull, null, `${key}.${name}`, paths);
        }
    },

    // Gives obj[key] the value when it has the wrong type. An absent key also gets the value,
    // except an optional key, which stays absent (spec §4.1 rules 3-5).
    _key(obj, key, test, value, path, paths, optional) {
        if (this._has(obj, key) ? test(obj[key]) : optional) return;
        obj[key] = value;
        paths.push(path);
    },

    // Makes obj[key] a plain object and returns it. Another value becomes value.
    _object(obj, key, value, path, paths) {
        this._key(obj, key, v => this.isPlainObject(v), value, path, paths);
        return obj[key];
    },

    // Makes obj[key] an array. Another value becomes value. Drops each entry for which keep returns false,
    // and keeps the order of the other entries. An optional key that is absent stays absent.
    _list(obj, key, value, path, paths, keep, optional) {
        if (this._has(obj, key) && Array.isArray(obj[key])) {
            const list = obj[key];
            let next = 0;
            for (let i = 0; i < list.length; i++) {
                if (keep(list[i], `${path}[${i}]`)) list[next++] = list[i];
                else paths.push(`${path}[${i}]`);
            }
            list.length = next;
            return;
        }
        this._key(obj, key, () => false, value, path, paths, optional);
    },

    // Each value of obj that is not a string becomes ''.
    _stringValues(obj, path, paths) {
        for (const key of Object.keys(obj)) this._key(obj, key, this._is.string, '', `${path}.${key}`, paths);
    },

    _hasStringId(entry) {
        return this.isPlainObject(entry) && typeof entry.id === 'string';
    },

    _has(obj, key) {
        return Object.prototype.hasOwnProperty.call(obj, key);
    }
};
