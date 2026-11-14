// Custom Wargear - the player's own weapon, armour, augmetic or Other item (issue #33).
// The item record lives on its wargear entry as entry.custom, with an id custom_<8 chars>.
// The pure helpers touch no DOM, so node tests can load this file in a vm sandbox.

const CustomWargear = {
    // --- Constants ---
    KINDS: ['weapon', 'armor', 'augmetic', 'other'],
    RARITIES: ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique'],
    // Only the keys that the equipment bonus path applies on the sheet (spec §3.5)
    BONUS_KEYS: ['strength', 'toughness', 'agility', 'initiative', 'willpower', 'intellect', 'fellowship', 'speed', 'defence', 'resilience'],
    BONUS_LABELS: {
        strength: 'Strength', toughness: 'Toughness', agility: 'Agility', initiative: 'Initiative', willpower: 'Willpower',
        intellect: 'Intellect', fellowship: 'Fellowship', speed: 'Speed', defence: 'Defence', resilience: 'Resilience'
    },
    // A number is a maximum length or count. An object is an integer range; its default is the
    // value that normalizeEntry writes when the stored value is not an integer.
    LIMITS: {
        name: 80,
        effect: 500,
        description: 2000,
        traits: 20,
        traitRating: 30,
        typedTrait: 60,
        keywords: 20,
        keyword: 40,
        bonusRows: 10,
        damage: { min: 0, max: 30, default: 0 },
        ed: { min: 0, max: 20, default: 0 },
        ap: { min: -10, max: 10, default: 0 },
        reach: { min: 1, max: 50 },
        range: { min: 1, max: 999 },
        salvo: { min: 0, max: 20, default: 1 },
        ar: { min: 0, max: 20, default: 0 },
        value: { min: 0, max: 30 },
        bonus: { min: -10, max: 10 }
    },

    // --- Pure helpers (no DOM) ---

    // Integers only: surrounding spaces and a leading + or - are accepted, nothing else.
    parseIntStrict(value) {
        const text = String(value).trim();
        return /^[+-]?\d+$/.test(text) ? parseInt(text, 10) : null;
    },

    newId(usedIds) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let id;
        do {
            id = 'custom_';
            for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
        } while (usedIds.has(id));
        return id;
    },

    // Numeric fields hold the typed text. The last four keys are UI-only.
    emptyForm() {
        return {
            editIndex: null,
            kind: 'weapon',
            weaponType: 'melee',
            name: '',
            damage: '0',
            ed: '0',
            ap: '0',
            reach: '',
            rangeShort: '',
            rangeMedium: '',
            rangeLong: '',
            salvo: '1',
            ar: '0',
            weaponTraits: [],
            armorTraits: [],
            effect: '',
            bonuses: [],
            keywords: [],
            description: '',
            value: '',
            rarity: '',
            traitPick: '',
            traitRating: '',
            typedTrait: '',
            keywordInput: ''
        };
    },

    traitNames(kind) {
        const glossary = DataLoader.cache['glossary.json'];
        const list = glossary && glossary[kind === 'armor' ? 'armorTraits' : 'weaponTraits'];
        if (!list) return [];
        return Object.values(list).map(t => t.name).sort((a, b) => a.localeCompare(b));
    },

    // The list names that book wargear writes with a rating, as "Name (anything)". Sorted.
    ratedTraits(kind) {
        const records = kind === 'armor' ? DataLoader.getAllArmor() : DataLoader.getAllWeapons();
        const written = [];
        for (const record of records) {
            for (const trait of Array.isArray(record.traits) ? record.traits : []) {
                if (typeof trait === 'string') written.push(trait);
            }
        }
        return this.traitNames(kind).filter(name => written.some(t => t.startsWith(`${name} (`) && t.endsWith(')')));
    },

    // Bonus entries in object order: +1 Strength, +Rank Resilience, +Double Rank Speed. '' when none.
    formatBonuses(bonuses) {
        return Object.entries(bonuses || {}).map(([key, value]) => {
            const label = this.BONUS_LABELS[key] || key;
            if (value === 'rank') return `+Rank ${label}`;
            if (value === 'doubleRank') return `+Double Rank ${label}`;
            return `${value > 0 ? '+' : ''}${value} ${label}`;
        }).join(', ');
    },

    typeLabel(record) {
        if (record.kind === 'weapon') return record.type === 'ranged' ? 'Ranged Weapon' : 'Melee Weapon';
        if (record.kind === 'armor') return 'Armor';
        return record.kind === 'augmetic' ? 'Augmetic' : 'Other';
    },

    // The stat line of a record in plain text, parts joined by " • ". '' for an Other item.
    formatStatLine(record) {
        const traits = (record.traits && record.traits.length) ? record.traits.join(', ') : '-';
        if (record.kind === 'weapon') {
            const ranged = record.type === 'ranged';
            const damage = ranged ? `Damage ${record.damage.base}` : `Damage (S) +${record.damage.base}`;
            const parts = [damage, `ED ${record.ed}`, `AP ${record.ap}`];
            if (ranged) {
                const r = record.range;
                parts.push(r ? `Range ${r.short}/${r.medium}/${r.long}m` : 'Range -', `Salvo ${record.salvo}`);
            } else if (record.reach !== undefined) {
                parts.push(`Range ${record.reach}m`);
            }
            parts.push(traits);
            return parts.join(' • ');
        }
        if (record.kind === 'armor') return `AR ${record.ar} • ${traits}`;
        if (record.kind === 'augmetic') {
            const parts = [];
            if (record.effect && record.effect.trim() !== '') parts.push(record.effect);
            const bonuses = this.formatBonuses(record.bonuses);
            if (bonuses) parts.push(`Bonuses: ${bonuses}`);
            return parts.join(' • ');
        }
        return '';
    },

    // The lines for copy as text and Markdown (spec §4.2).
    textLines(record) {
        const lines = [`- ${record.name} (Custom)`];
        const stats = this.formatStatLine(record);
        if (stats) lines.push(`    ${stats}`);
        if (record.keywords && record.keywords.length) lines.push(`    Keywords: ${record.keywords.join(', ')}`);
        if (record.description && record.description.trim() !== '') {
            for (const line of record.description.split(/\r?\n/)) lines.push(`    ${line}`);
        }
        return lines;
    },

    // A typed trait whose name part matches a list name (any case) takes the list spelling.
    normalizeTrait(text, kind) {
        const trimmed = String(text).trim();
        const paren = trimmed.indexOf('(');
        const namePart = (paren === -1 ? trimmed : trimmed.slice(0, paren)).trim().toLowerCase();
        const match = this.traitNames(kind).find(name => name.toLowerCase() === namePart);
        if (!match) return trimmed;
        return paren === -1 ? match : `${match} (${trimmed.slice(paren + 1)}`;
    },

    // The record of the selected kind and weapon type, with no id. The form must pass validateForm.
    // The form values go through _cleanRecord, the one owner of the record shape, which
    // normalizeEntry also uses. A blank optional field parses to no key there.
    buildRecord(form) {
        const bonuses = {};
        for (const row of form.bonuses) bonuses[row.key] = row.value;
        return this._cleanRecord({
            kind: form.kind,
            name: form.name,
            type: form.weaponType,
            description: form.description,
            damage: { base: form.damage },
            ed: form.ed,
            ap: form.ap,
            reach: form.reach,
            range: { short: form.rangeShort, medium: form.rangeMedium, long: form.rangeLong },
            salvo: form.salvo,
            ar: form.ar,
            traits: form.kind === 'armor' ? form.armorTraits : form.weaponTraits,
            effect: form.effect,
            bonuses,
            keywords: form.keywords,
            value: form.value,
            rarity: form.rarity
        });
    },

    // One short message per invalid field of the selected kind and type; {} when the form is valid.
    validateForm(form) {
        const L = this.LIMITS;
        const errors = {};
        const inRange = (text, limit) => {
            const n = this.parseIntStrict(text);
            return n !== null && n >= limit.min && n <= limit.max;
        };
        const numberMessage = limit => `Enter a whole number from ${limit.min} to ${limit.max}.`;
        const optionalMessage = limit => `Leave blank or enter a whole number from ${limit.min} to ${limit.max}.`;

        const name = form.name.trim();
        if (name.length < 1 || name.length > L.name) errors.name = `Enter a name of 1 to ${L.name} characters.`;

        if (form.kind === 'weapon') {
            for (const field of ['damage', 'ed', 'ap']) {
                if (!inRange(form[field], L[field])) errors[field] = numberMessage(L[field]);
            }
            if (form.weaponType === 'ranged') {
                const values = [form.rangeShort, form.rangeMedium, form.rangeLong];
                const ok = values.every(text => inRange(text, L.range));
                const [s, m, l] = values.map(text => this.parseIntStrict(text));
                if (!ok || s > m || m > l) {
                    errors.range = `Enter three whole numbers from ${L.range.min} to ${L.range.max}, with short ≤ medium ≤ long.`;
                }
                if (!inRange(form.salvo, L.salvo)) errors.salvo = numberMessage(L.salvo);
            } else if (form.reach.trim() !== '' && !inRange(form.reach, L.reach)) {
                errors.reach = optionalMessage(L.reach);
            }
        }
        if (form.kind === 'armor' && !inRange(form.ar, L.ar)) errors.ar = numberMessage(L.ar);

        if (form.kind === 'weapon' || form.kind === 'armor') {
            const traits = form.kind === 'weapon' ? form.weaponTraits : form.armorTraits;
            if (traits.length > L.traits) errors.traits = `Use ${L.traits} traits or fewer.`;
        }
        if (form.kind === 'augmetic') {
            if (form.effect.trim().length > L.effect) errors.effect = `Use ${L.effect} characters or fewer.`;
            const keys = form.bonuses.map(row => row.key);
            const badRow = form.bonuses.some(row => !this.BONUS_KEYS.includes(row.key) || this._bonusValue(row.value) === null);
            if (badRow || new Set(keys).size !== keys.length) {
                errors.bonuses = `Give each bonus a different stat and a value from ${L.bonus.min} to ${L.bonus.max} (not 0), Rank or Double Rank.`;
            }
        }
        if (form.kind !== 'other') {
            const badKeyword = form.keywords.some(k => k.trim().length < 1 || k.trim().length > L.keyword);
            if (form.keywords.length > L.keywords || badKeyword) {
                errors.keywords = `Use ${L.keywords} keywords or fewer, each of 1 to ${L.keyword} characters.`;
            }
        }
        if (form.description.trim().length > L.description) errors.description = `Use ${L.description} characters or fewer.`;
        if (form.value.trim() !== '' && !inRange(form.value, L.value)) errors.value = optionalMessage(L.value);
        if (form.rarity !== '' && !this.RARITIES.includes(form.rarity)) errors.rarity = 'Select a rarity from the list.';
        return errors;
    },

    // The inverse of buildRecord, for the Edit prefill. An absent key gives the emptyForm default.
    formFromRecord(record) {
        const form = this.emptyForm();
        const text = (value, fallback) => (value === undefined || value === null ? fallback : String(value));
        form.kind = record.kind;
        form.name = text(record.name, '');
        form.description = text(record.description, '');
        if (record.kind === 'weapon') {
            form.weaponType = record.type === 'ranged' ? 'ranged' : 'melee';
            form.damage = text(record.damage && record.damage.base, form.damage);
            form.ed = text(record.ed, form.ed);
            form.ap = text(record.ap, form.ap);
            form.reach = text(record.reach, '');
            if (record.range && typeof record.range === 'object') {
                form.rangeShort = text(record.range.short, '');
                form.rangeMedium = text(record.range.medium, '');
                form.rangeLong = text(record.range.long, '');
            }
            form.salvo = text(record.salvo, form.salvo);
            form.weaponTraits = (record.traits || []).slice();
        } else if (record.kind === 'armor') {
            form.ar = text(record.ar, form.ar);
            form.armorTraits = (record.traits || []).slice();
        } else if (record.kind === 'augmetic') {
            form.effect = text(record.effect, '');
            form.bonuses = Object.entries(record.bonuses || {}).map(([key, value]) => ({ key, value: String(value) }));
        }
        form.keywords = (record.keywords || []).slice();
        form.value = text(record.value, '');
        form.rarity = text(record.rarity, '');
        return form;
    },

    // Repairs a wargear entry in place (spec §2.8 rules 2-7) and adds its id to usedIds.
    // Returns true when anything changed. The caller logs the repair (rule 8).
    normalizeEntry(entry, usedIds) {
        const before = JSON.stringify(this._canon(entry));
        if (!this._isObject(entry.custom)) entry.custom = { kind: 'other', name: 'Unreadable custom item', description: '' };
        const custom = entry.custom;
        const clean = this._cleanRecord(custom);
        // Keep the same custom object, so a reference to it stays valid.
        for (const key of Object.keys(custom)) delete custom[key];
        Object.assign(custom, clean);

        if (typeof entry.id !== 'string' || !/^custom_[a-z0-9]+$/.test(entry.id) || usedIds.has(entry.id)) {
            entry.id = this.newId(usedIds);
        }
        custom.id = entry.id;
        usedIds.add(entry.id);

        delete entry.relic;
        delete entry.improvised;
        if (custom.kind !== 'weapon') {
            delete entry.upgrades;
            delete entry.equipped;
        }
        return JSON.stringify(this._canon(entry)) !== before;
    },

    // The record coerced to the types and limits of its kind (spec §2.8 rules 3-5), with no id.
    // The one owner of the record shape (spec §2.3): buildRecord and normalizeEntry both use it.
    _cleanRecord(custom) {
        const L = this.LIMITS;
        const str = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max).trim() : '');
        const int = (value, limit) => {
            const n = this.parseIntStrict(value);
            return n === null ? limit.default : Math.min(limit.max, Math.max(limit.min, n));
        };
        const optionalInt = (value, limit) => {
            const n = this.parseIntStrict(value);
            return n === null ? undefined : Math.min(limit.max, Math.max(limit.min, n));
        };
        const kind = this.KINDS.includes(custom.kind) ? custom.kind : 'other';
        const traits = () => {
            const out = [];
            for (const t of Array.isArray(custom.traits) ? custom.traits : []) {
                if (typeof t !== 'string') continue;
                const trait = this.normalizeTrait(t, kind).slice(0, L.typedTrait).trim();
                if (trait && !out.includes(trait)) out.push(trait);
            }
            return out.slice(0, L.traits);
        };
        const keywords = () => {
            const out = [];
            for (const k of Array.isArray(custom.keywords) ? custom.keywords : []) {
                if (typeof k !== 'string') continue;
                const keyword = k.trim().toUpperCase().slice(0, L.keyword).trim();
                if (keyword && !out.includes(keyword)) out.push(keyword);
            }
            return out.slice(0, L.keywords);
        };

        const record = { kind, name: str(custom.name, L.name) || 'Unnamed custom item' };
        const description = str(custom.description, L.description);
        if (kind === 'weapon') {
            const ranged = custom.type === 'ranged';
            record.type = ranged ? 'ranged' : 'melee';
            record.description = description;
            const base = this._isObject(custom.damage) ? custom.damage.base : undefined;
            record.damage = { base: int(base, L.damage), attribute: ranged ? null : 'strength', bonus: 0 };
            record.ed = int(custom.ed, L.ed);
            record.ap = int(custom.ap, L.ap);
            if (ranged) {
                const range = this._isObject(custom.range) ? custom.range : {};
                const parts = ['short', 'medium', 'long'].map(key => optionalInt(range[key], L.range));
                if (parts.every(n => n !== undefined)) record.range = { short: parts[0], medium: parts[1], long: parts[2] };
                record.salvo = int(custom.salvo, L.salvo);
            } else {
                const reach = optionalInt(custom.reach, L.reach);
                if (reach !== undefined) record.reach = reach;
            }
            record.traits = traits();
            record.keywords = keywords();
        } else if (kind === 'armor') {
            record.description = description;
            record.ar = int(custom.ar, L.ar);
            record.traits = traits();
            record.keywords = keywords();
        } else if (kind === 'augmetic') {
            record.category = 'augmetic';
            record.description = description;
            record.effect = str(custom.effect, L.effect);
            const bonuses = {};
            for (const [key, value] of Object.entries(this._isObject(custom.bonuses) ? custom.bonuses : {})) {
                const bonus = this._bonusValue(value);
                if (this.BONUS_KEYS.includes(key) && bonus !== null) bonuses[key] = bonus;
            }
            if (Object.keys(bonuses).length) record.bonuses = bonuses;
            record.keywords = keywords();
        } else {
            record.category = 'Other';
            record.description = description;
            record.effect = '';
            record.keywords = [];
        }
        const value = optionalInt(custom.value, L.value);
        if (value !== undefined) record.value = value;
        if (this.RARITIES.includes(custom.rarity)) record.rarity = custom.rarity;
        record.source = 'custom';
        return record;
    },

    _isObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    },

    // A bonus value: 'rank', 'doubleRank', or an integer from -10 to 10 that is not 0; else null.
    _bonusValue(value) {
        if (value === 'rank' || value === 'doubleRank') return value;
        const n = this.parseIntStrict(value);
        return n !== null && n !== 0 && n >= this.LIMITS.bonus.min && n <= this.LIMITS.bonus.max ? n : null;
    },

    // Deep copy with object keys sorted, so that key order alone is not a change.
    _canon(value) {
        if (Array.isArray(value)) return value.map(v => this._canon(v));
        if (value && typeof value === 'object') {
            const out = {};
            for (const key of Object.keys(value).sort()) out[key] = this._canon(value[key]);
            return out;
        }
        return value;
    }
};
