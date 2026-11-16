// Bestiary Check - repairs the type of each known field of a loaded encounter, custom threat or player file
// (spec docs/superpowers/specs/2026-11-15-bug-pass-bestiary-design.md, §4.3 to §4.6 and §6.2).
// A value of the wrong type gets the repair value of its row, and its path goes into the returned list.
// The check never changes a value that the app can write, except the exceptions E1 and E4 of spec §4.8.
// E1 clamps a player count outside 1-10. E4 repairs the null values that the C6 defect wrote.
// The check keeps each unknown key.
// It reads no data file, so node tests can load this file in a vm sandbox.

const BestiaryCheck = {
    // Limits of the number inputs (spec §6.3). A test compares them with the min / max of the inputs.
    PLAYER_COUNT_MIN: 1,
    PLAYER_COUNT_MAX: 10,
    TIER_MIN: 1,
    TIER_MAX: 5,
    ADD_COUNT_MAX: 20,
    INITIATIVE_MAX: 99,

    isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    },

    // Changes a plain-object encounter in place (spec §4.4). Returns the repaired paths in table order.
    // A path uses the index of the entry in the loaded list, also after an entry before it was dropped.
    repairEncounter(data) {
        const is = this._is;
        const paths = [];

        const settings = this._object(data, 'settings', { tier: 1, playerCount: 4, name: 'Unnamed Encounter', round: 1 }, 'settings', paths);
        this._key(settings, 'tier', is.integer, 1, 'settings.tier', paths);
        this._key(settings, 'playerCount', is.integer, 4, 'settings.playerCount', paths);
        this._clampPlayerCount(settings, 'settings.playerCount', paths);
        this._key(settings, 'name', is.string, 'Unnamed Encounter', 'settings.name', paths);
        this._key(settings, 'round', is.integer, 1, 'settings.round', paths, true);

        // The mobs come first, so that a member of a dropped mob becomes a free row (E3).
        // Their paths go after the paths of the individuals, in table order.
        const mobPaths = [];
        this._list(data, 'mobs', [], 'mobs', mobPaths, (e, p) => {
            if (!this._hasStringKeys(e, ['id', 'threatId'])) return false;
            this._key(e, 'name', is.string, 'Mob', `${p}.name`, mobPaths);
            this._key(e, 'initiative', is.numberOrNull, null, `${p}.initiative`, mobPaths, true);
            this._key(e, 'notes', is.string, '', `${p}.notes`, mobPaths, true);
            return true;
        });
        const mobIds = new Set(data.mobs.map(m => m.id));

        this._list(data, 'individuals', [], 'individuals', paths, (e, p) => {
            if (!this._hasStringKeys(e, ['id', 'threatId'])) return false;
            this._key(e, 'bonus', v => v === 'none' || v === 'elite' || v === 'adversary', 'none', `${p}.bonus`, paths);
            this._key(e, 'currentWounds', is.number, 0, `${p}.currentWounds`, paths);
            this._key(e, 'currentShock', is.number, 0, `${p}.currentShock`, paths);
            this._key(e, 'maxWounds', is.numberOrNull, null, `${p}.maxWounds`, paths);
            this._key(e, 'maxShock', is.numberOrNull, null, `${p}.maxShock`, paths);
            this._key(e, 'mobId', v => v === null || (typeof v === 'string' && mobIds.has(v)), null, `${p}.mobId`, paths);
            this._key(e, 'initiative', is.numberOrNull, null, `${p}.initiative`, paths, true);
            this._key(e, 'notes', is.string, '', `${p}.notes`, paths, true);
            this._key(e, 'additionalWeaponId', is.stringOrNull, null, `${p}.additionalWeaponId`, paths, true);
            this._key(e, 'personalRuin', is.number, 0, `${p}.personalRuin`, paths, true);
            return true;
        });
        paths.push(...mobPaths);

        this._list(data, 'playerCharacters', [], 'playerCharacters', paths, (e, p) => {
            if (!this._hasStringKeys(e, ['id'])) return false;
            this._key(e, 'name', is.string, 'Player', `${p}.name`, paths);
            this._key(e, 'initiative', is.numberOrNull, null, `${p}.initiative`, paths, true);
            this._key(e, 'notes', is.string, '', `${p}.notes`, paths, true);
            return true;
        });

        this._list(data, 'vehicles', [], 'vehicles', paths, (e, p) => {
            if (!this._hasStringKeys(e, ['id', 'vehicleId'])) return false;
            this._key(e, 'wounds', is.number, 0, `${p}.wounds`, paths);
            this._key(e, 'initiative', is.numberOrNull, null, `${p}.initiative`, paths, true);
            return true;
        }, true);

        // encounterOrder is an array or null
        if (data.encounterOrder !== null) {
            this._list(data, 'encounterOrder', null, 'encounterOrder', paths, e => this._hasStringKeys(e, ['type', 'id']), true);
        }

        paths.push(...this.repairCustomThreatList(data, 'customThreats', 'customThreats'));
        return paths;
    },

    // Makes owner[key] an array (an absent key stays absent). Drops each entry that is not a plain object,
    // whose id is not a custom_ id (C11), or whose id came before in the list. Repairs each kept entry.
    repairCustomThreatList(owner, key, prefix) {
        const paths = [];
        const seen = new Set();
        this._list(owner, key, [], prefix, paths, (e, p) => {
            if (!this._hasStringKeys(e, ['id']) || !e.id.startsWith('custom_') || seen.has(e.id)) return false;
            seen.add(e.id);
            paths.push(...this.repairThreat(e, p));
            return true;
        }, true);
        return paths;
    },

    // Changes a plain-object threat in place (spec §4.5). It does not read or change id.
    // Each path starts with prefix; with prefix '' the paths have no prefix.
    repairThreat(threat, prefix) {
        const is = this._is;
        const paths = [];
        const t = threat;
        const at = key => (prefix ? `${prefix}.${key}` : key);

        this._key(t, 'name', is.string, '', at('name'), paths);
        this._key(t, 'source', is.string, 'Custom', at('source'), paths, true);
        this._key(t, 'size', is.string, 'Average', at('size'), paths, true);
        for (const key of ['quote', 'attribution', 'description', 'defenceNote', 'speedNote', 'determination', 'skills', 'threatOptions', 'biomorphs']) {
            this._key(t, key, is.string, '', at(key), paths, true);
        }
        this._key(t, 'page', is.numberOrNull, null, at('page'), paths, true);

        if (this._has(t, 'tierThreat')) {
            const tiers = this._object(t, 'tierThreat', { '1': 'T', '2': 'T', '3': '-', '4': '-', '5': '-' }, at('tierThreat'), paths);
            for (const key of Object.keys(tiers)) this._key(tiers, key, is.string, '-', at(`tierThreat.${key}`), paths);
        }

        this._list(t, 'keywords', [], at('keywords'), paths, is.string, true);

        if (this._has(t, 'attributes')) {
            const attributes = this._object(t, 'attributes', { S: 1, T: 1, A: 1, I: 1, Wil: 1, Int: 1, Fel: 1 }, at('attributes'), paths);
            for (const key of ['S', 'T', 'A', 'I', 'Wil', 'Int', 'Fel']) this._key(attributes, key, is.number, 1, at(`attributes.${key}`), paths, true);
        }

        if (this._has(t, 'resilience')) {
            const resilience = this._object(t, 'resilience', { value: 1, note: '' }, at('resilience'), paths);
            this._key(resilience, 'value', is.number, 1, at('resilience.value'), paths, true);
            this._key(resilience, 'note', is.string, '', at('resilience.note'), paths, true);
        }

        this._key(t, 'defence', is.number, 1, at('defence'), paths, true);
        this._key(t, 'wounds', is.number, 1, at('wounds'), paths, true);
        this._key(t, 'speed', is.number, 6, at('speed'), paths, true);
        this._key(t, 'shock', is.numberOrString, 1, at('shock'), paths, true);
        this._key(t, 'conviction', is.numberOrString, 0, at('conviction'), paths, true);
        this._key(t, 'resolve', is.numberOrString, 0, at('resolve'), paths, true);

        this._list(t, 'abilities', [], at('abilities'), paths, (e, p) => {
            if (!this.isPlainObject(e)) return false;
            this._key(e, 'type', is.string, 'ABILITY', `${p}.type`, paths);
            this._key(e, 'name', is.string, '', `${p}.name`, paths);
            for (const key of ['stats', 'description', 'weaponId']) this._key(e, key, is.string, '', `${p}.${key}`, paths, true);
            return true;
        }, true);

        const nameAndDescription = (e, p) => {
            if (!this.isPlainObject(e)) return false;
            this._key(e, 'name', is.string, '', `${p}.name`, paths);
            this._key(e, 'description', is.string, '', `${p}.description`, paths);
            return true;
        };
        this._list(t, 'bonuses', [], at('bonuses'), paths, nameAndDescription, true);

        // mobOptions and mobAbilities are a string or a list of plain objects
        for (const key of ['mobOptions', 'mobAbilities']) {
            if (typeof t[key] !== 'string') this._list(t, key, '', at(key), paths, nameAndDescription, true);
        }

        return paths;
    },

    // Changes a plain-object .players file in place (spec §4.6, players file table).
    repairPlayers(data) {
        const is = this._is;
        const paths = [];
        if (this._has(data, 'playerCount')) {
            if (!Number.isInteger(data.playerCount)) {
                // Delete the key, so the current count stays
                delete data.playerCount;
                paths.push('playerCount');
            } else {
                this._clampPlayerCount(data, 'playerCount', paths);
            }
        }
        this._list(data, 'players', [], 'players', paths, (e, p) => {
            if (!this.isPlainObject(e)) return false;
            this._key(e, 'name', is.string, 'Player', `${p}.name`, paths);
            this._key(e, 'notes', is.string, '', `${p}.notes`, paths, true);
            return true;
        }, true);
        return paths;
    },

    // Spec §6.2. Returns the integer of input.value, or null when it is not an integer
    // inside the declared min / max. An absent or empty min / max sets no limit.
    readIntegerInput(input) {
        const text = String(input.value).trim();
        if (!/^-?\d+$/.test(text)) return null;
        const value = parseInt(text, 10);
        if (!Number.isSafeInteger(value)) return null;
        const { min, max } = input;
        if (min !== undefined && min !== '' && value < Number(min)) return null;
        if (max !== undefined && max !== '' && value > Number(max)) return null;
        return value;
    },

    // True when the two records, without id, give the same JSON with sorted keys at each level.
    sameThreatData(a, b) {
        const canon = (value) => {
            if (Array.isArray(value)) return value.map(canon);
            if (this.isPlainObject(value)) {
                // No prototype, so an own __proto__ key stays a data key
                const out = Object.create(null);
                for (const key of Object.keys(value).sort()) out[key] = canon(value[key]);
                return out;
            }
            return value;
        };
        const withoutId = (record) => {
            const copy = { ...record };
            delete copy.id;
            return JSON.stringify(canon(copy));
        };
        return withoutId(a) === withoutId(b);
    },

    // Type tests (spec §4.3 rule 6: a numeric string is a wrong type, and Infinity is not finite)
    _is: {
        string: v => typeof v === 'string',
        stringOrNull: v => v === null || typeof v === 'string',
        integer: v => Number.isInteger(v),
        number: v => typeof v === 'number' && Number.isFinite(v),
        numberOrNull: v => v === null || (typeof v === 'number' && Number.isFinite(v)),
        numberOrString: v => typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v))
    },

    // E1: an integer player count outside the limits becomes the nearest limit.
    _clampPlayerCount(obj, path, paths) {
        const count = Math.min(this.PLAYER_COUNT_MAX, Math.max(this.PLAYER_COUNT_MIN, obj.playerCount));
        if (count === obj.playerCount) return;
        obj.playerCount = count;
        paths.push(path);
    },

    // Gives obj[key] the value when it has the wrong type. An absent key also gets the value,
    // except an optional key, which stays absent (spec §4.3 rules 1-3).
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

    // True when entry is a plain object and each of the keys holds a string
    _hasStringKeys(entry, keys) {
        return this.isPlainObject(entry) && keys.every(key => typeof entry[key] === 'string');
    },

    _has(obj, key) {
        return Object.prototype.hasOwnProperty.call(obj, key);
    }
};
