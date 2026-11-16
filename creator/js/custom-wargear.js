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

    // --- State ---

    // Optional callback set by the wargear tab to re-render after save
    onSaved: null,

    // The open form, in the shape of emptyForm, or null
    form: null,

    // ratedTraits per kind, computed one time per open of the modal (it reads every book record)
    _rated: null,

    // --- Lifecycle ---

    // Open the builder. null = create; the wargear index of a custom entry = edit, prefilled.
    // The edit keeps the id of the entry too, because the list can change while the form is open.
    open(wargearIndex = null) {
        this.buildModal();
        this._rated = null;
        const entry = wargearIndex !== null ? State.getCharacter().wargear[wargearIndex] : null;
        this.form = entry && entry.custom
            ? { ...this.formFromRecord(entry.custom), editIndex: wargearIndex, editId: entry.id }
            : this.emptyForm();
        this.render();
        document.getElementById('custom-item-modal').classList.remove('hidden');
        document.getElementById('custom-item-name').focus();
    },

    close() {
        const modal = document.getElementById('custom-item-modal');
        if (modal) modal.classList.add('hidden');
    },

    // Build the modal shell and bind its listeners one time, then reuse it
    buildModal() {
        if (document.getElementById('custom-item-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'custom-item-modal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <h3 id="custom-item-title">Create Custom Wargear</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body" id="custom-item-body"></div>
                <div class="modal-footer">
                    <button class="btn-secondary" id="custom-item-cancel">Cancel</button>
                    <button class="btn-primary" id="custom-item-save">Add Wargear</button>
                </div>
            </div>
        `;

        // Modal containers must live inside #app for the stacking context
        (document.getElementById('app') || document.body).appendChild(modal);

        modal.querySelector('.modal-close').addEventListener('click', () => this.close());
        // Close on the backdrop only when the press also started there, so that a text selection
        // that starts in a field and ends outside the modal box does not close the form.
        let pressOnBackdrop = false;
        modal.addEventListener('mousedown', (e) => {
            pressOnBackdrop = e.target === modal;
        });
        modal.addEventListener('click', (e) => {
            if (e.target === modal && pressOnBackdrop) this.close();
        });
        document.getElementById('custom-item-cancel').addEventListener('click', () => this.close());
        document.getElementById('custom-item-save').addEventListener('click', () => this.save());
        this.bind();
    },

    // --- Rendering ---

    // Replace the body content (the body element stays, so its listeners stay bound one time)
    render() {
        const editing = this.form.editIndex !== null;
        document.getElementById('custom-item-title').textContent = editing ? 'Edit Custom Wargear' : 'Create Custom Wargear';
        document.getElementById('custom-item-save').textContent = editing ? 'Save Changes' : 'Add Wargear';

        const body = document.getElementById('custom-item-body');
        const active = document.activeElement;
        const focus = active && body.contains(active) ? this._focusSelectors(active.dataset) : [];
        const scrollTop = body.scrollTop;
        body.innerHTML = this.bodyHtml(this.form);
        body.scrollTop = scrollTop;
        const control = focus.map(selector => body.querySelector(selector)).find(el => el);
        if (control) control.focus();
        this.refresh();
    },

    // The form body for the selected kind and weapon type. No DOM: tests call it directly.
    bodyHtml(form) {
        const kind = form.kind;
        const melee = form.weaponType !== 'ranged';
        const kindOptions = [['weapon', 'Weapon'], ['armor', 'Armor'], ['augmetic', 'Augmetic'], ['other', 'Other']];
        const rarityOptions = [['', '-'], ...this.RARITIES.map(r => [r, r])];

        let stats = '';
        if (kind === 'weapon') {
            stats = `
                <div class="custom-item-grid">
                    ${this._inputHtml(form, 'damage', melee ? 'Damage: S +' : 'Damage', { limit: this.LIMITS.damage })}
                    ${this._inputHtml(form, 'ed', 'ED', { limit: this.LIMITS.ed })}
                    ${this._inputHtml(form, 'ap', 'AP', { limit: this.LIMITS.ap, placeholder: 'e.g. -2' })}
                    ${melee
                        ? this._inputHtml(form, 'reach', 'Range (m)', { limit: this.LIMITS.reach, placeholder: 'Optional' })
                        : this._inputHtml(form, 'salvo', 'Salvo', { limit: this.LIMITS.salvo })}
                </div>
                ${melee ? '' : `
                <div class="form-group">
                    <label>Range (m)</label>
                    <div class="custom-item-grid">
                        ${this._inputHtml(form, 'rangeShort', 'Short', { limit: this.LIMITS.range, error: false })}
                        ${this._inputHtml(form, 'rangeMedium', 'Medium', { limit: this.LIMITS.range, error: false })}
                        ${this._inputHtml(form, 'rangeLong', 'Long', { limit: this.LIMITS.range, error: false })}
                    </div>
                    ${this._errorHtml('range')}
                </div>`}
                ${this._traitsHtml(form)}
            `;
        } else if (kind === 'armor') {
            stats = `
                <div class="custom-item-grid">${this._inputHtml(form, 'ar', 'AR', { limit: this.LIMITS.ar })}</div>
                ${this._traitsHtml(form)}
            `;
        } else if (kind === 'augmetic') {
            stats = `
                <div class="form-group">
                    <label for="custom-item-effect">Effect</label>
                    <textarea id="custom-item-effect" data-field="effect" rows="2">${this.escapeHtml(form.effect)}</textarea>
                    ${this._errorHtml('effect')}
                </div>
                ${this._bonusesHtml(form)}
            `;
        }

        return `
            <div class="custom-item-grid">
                ${this._selectHtml(form, 'kind', 'Kind', kindOptions, form.editIndex !== null)}
                ${kind === 'weapon' ? this._selectHtml(form, 'weaponType', 'Type', [['melee', 'Melee'], ['ranged', 'Ranged']]) : ''}
            </div>
            ${this._inputHtml(form, 'name', 'Name')}
            ${stats}
            ${kind === 'other' ? '' : this._keywordsHtml(form)}
            <div class="form-group">
                <label for="custom-item-description">Description</label>
                <textarea id="custom-item-description" data-field="description" rows="3">${this.escapeHtml(form.description)}</textarea>
                ${this._errorHtml('description')}
            </div>
            <div class="custom-item-grid">
                ${this._inputHtml(form, 'value', 'Value', { limit: this.LIMITS.value, placeholder: 'Optional' })}
                ${this._selectHtml(form, 'rarity', 'Rarity', rarityOptions)}
            </div>
            <div class="relic-summary-block">
                <div class="relic-summary-label">Preview</div>
                <div id="custom-item-preview" class="relic-summary-stat"></div>
            </div>
        `;
    },

    // Validation messages, the Save state and the preview, with no re-render of the inputs
    refresh() {
        const errors = this.validateForm(this.form);
        const valid = Object.keys(errors).length === 0;
        document.querySelectorAll('#custom-item-body [data-error-for]').forEach(span => {
            span.textContent = errors[span.dataset.errorFor] || '';
        });
        document.getElementById('custom-item-save').disabled = !valid;
        // buildRecord assumes a valid form
        document.getElementById('custom-item-preview').textContent = valid ? this.formatStatLine(this.buildRecord(this.form)) : '';
    },

    _errorHtml(field) {
        return `<span class="custom-item-error" data-error-for="${field}"></span>`;
    },

    // A text input bound to form[key]. A number field (options.limit, its LIMITS range) is a text box,
    // so validateForm sees the typed text.
    _inputHtml(form, key, label, options = {}) {
        const numeric = options.limit ? this._inputModeAttr(options.limit) : '';
        const placeholder = options.placeholder ? ` placeholder="${this.escapeAttr(options.placeholder)}"` : '';
        return `
            <div class="form-group">
                <label for="custom-item-${key}">${label}</label>
                <input type="text" id="custom-item-${key}" class="search-input" data-field="${key}"${numeric}${placeholder} value="${this.escapeAttr(form[key])}">
                ${options.error === false ? '' : this._errorHtml(key)}
            </div>`;
    },

    // The inputmode of a number field. A range with a negative value gets none, because some phone
    // keypads for inputmode="numeric" have no minus key.
    _inputModeAttr(limit) {
        return limit.min >= 0 ? ' inputmode="numeric"' : '';
    },

    // A select bound to form[key]; options is a list of [value, label]
    _selectHtml(form, key, label, options, disabled = false) {
        const items = options.map(([value, text]) =>
            `<option value="${this.escapeAttr(value)}"${form[key] === value ? ' selected' : ''}>${this.escapeHtml(text)}</option>`).join('');
        return `
            <div class="form-group">
                <label for="custom-item-${key}">${label}</label>
                <select id="custom-item-${key}" data-field="${key}"${disabled ? ' disabled' : ''}>${items}</select>
                ${this._errorHtml(key)}
            </div>`;
    },

    // Removable chips; each chip is a button, so the keyboard can reach it
    _chipsHtml(list, action, emptyText) {
        if (!list.length) return `<div class="custom-item-chips"><span class="text-muted">${emptyText}</span></div>`;
        const chips = list.map((text, i) => `
            <button type="button" class="custom-item-chip" data-action="${action}" data-index="${i}" aria-label="Remove ${this.escapeAttr(text)}">
                ${this.escapeHtml(text)}<span class="custom-item-chip-remove" aria-hidden="true">&times;</span>
            </button>`).join('');
        return `<div class="custom-item-chips">${chips}</div>`;
    },

    // An empty span for the message of a refused add; refresh does not clear it
    _addErrorHtml(action) {
        return `<span class="custom-item-error" data-add-error="${action}"></span>`;
    },

    _traitsHtml(form) {
        const names = this.traitNames(form.kind);
        const rated = this._ratedFor(form.kind).includes(form.traitPick);
        const options = names.map(name =>
            `<option value="${this.escapeAttr(name)}"${form.traitPick === name ? ' selected' : ''}>${this.escapeHtml(name)}</option>`).join('');
        const picker = names.length ? `
            <div class="custom-item-add">
                <select data-field="traitPick" aria-label="Trait from the list"><option value="">Select a trait</option>${options}</select>
                ${rated ? `<input type="text" class="search-input custom-item-rating" data-field="traitRating" placeholder="Rating" aria-label="Rating" value="${this.escapeAttr(form.traitRating)}">` : ''}
                <button type="button" class="btn-small" data-action="add-list-trait">Add</button>
            </div>
            ${this._addErrorHtml('add-list-trait')}` : '';
        return `
            <div class="relic-option-group">
                <h4>Traits</h4>
                ${this._chipsHtml(form.kind === 'armor' ? form.armorTraits : form.weaponTraits, 'remove-trait', 'No traits')}
                ${picker}
                <div class="custom-item-add">
                    <input type="text" class="search-input" data-field="typedTrait" placeholder="Custom trait, e.g. Xenos Venom (2)" aria-label="Custom trait" value="${this.escapeAttr(form.typedTrait)}">
                    <button type="button" class="btn-small" data-action="add-typed-trait">Add</button>
                </div>
                ${this._addErrorHtml('add-typed-trait')}
                ${this._errorHtml('traits')}
            </div>`;
    },

    _keywordsHtml(form) {
        return `
            <div class="relic-option-group">
                <h4>Keywords</h4>
                ${this._chipsHtml(form.keywords, 'remove-keyword', 'No keywords')}
                <div class="custom-item-add">
                    <input type="text" class="search-input" data-field="keywordInput" placeholder="Keyword, e.g. IMPERIUM" aria-label="Keyword" value="${this.escapeAttr(form.keywordInput)}">
                    <button type="button" class="btn-small" data-action="add-keyword">Add</button>
                </div>
                ${this._addErrorHtml('add-keyword')}
                ${this._errorHtml('keywords')}
            </div>`;
    },

    // Bonus rows: a stat select, a Number / Rank / Double Rank select, and a value box in Number mode
    _bonusesHtml(form) {
        const rows = form.bonuses.map((row, i) => {
            const mode = row.value === 'rank' || row.value === 'doubleRank' ? row.value : 'number';
            const keys = this.availableBonusKeys(form, i).map(key =>
                `<option value="${key}"${row.key === key ? ' selected' : ''}>${this.BONUS_LABELS[key]}</option>`).join('');
            const modes = [['number', 'Number'], ['rank', 'Rank'], ['doubleRank', 'Double Rank']].map(([value, text]) =>
                `<option value="${value}"${mode === value ? ' selected' : ''}>${text}</option>`).join('');
            return `
                <div class="custom-item-bonus-row">
                    <select data-bonus-index="${i}" data-bonus-part="key" aria-label="Stat"><option value="">Select a stat</option>${keys}</select>
                    <select data-bonus-index="${i}" data-bonus-part="mode" aria-label="Bonus type">${modes}</select>
                    ${mode === 'number' ? `<input type="text" class="search-input"${this._inputModeAttr(this.LIMITS.bonus)} data-bonus-index="${i}" data-bonus-part="value" aria-label="Bonus value" value="${this.escapeAttr(row.value)}">` : ''}
                    <button type="button" class="btn-small" data-action="remove-bonus" data-index="${i}" aria-label="Remove bonus">&times;</button>
                </div>`;
        }).join('');
        return `
            <div class="relic-option-group">
                <h4>Bonuses</h4>
                ${rows}
                <button type="button" class="btn-small" data-action="add-bonus">Add bonus</button>
                ${this._addErrorHtml('add-bonus')}
                ${this._errorHtml('bonuses')}
            </div>`;
    },

    _ratedFor(kind) {
        if (!this._rated) this._rated = {};
        if (!this._rated[kind]) this._rated[kind] = this.ratedTraits(kind);
        return this._rated[kind];
    },

    // Selectors, in order, for the control that gets the focus after a render: the same control,
    // then a control of the same group that stays when the first one goes away (the rating box
    // after its add, the last chip or bonus row after its removal). d is the dataset of the control.
    _focusSelectors(d) {
        const fallback = {
            traitRating: '[data-field="traitPick"]',
            'remove-trait': '[data-field="typedTrait"]',
            'remove-keyword': '[data-field="keywordInput"]',
            'remove-bonus': '[data-action="add-bonus"]'
        };
        let selector = null;
        if (d.field) selector = `[data-field="${d.field}"]`;
        else if (d.bonusPart) selector = `[data-bonus-index="${d.bonusIndex}"][data-bonus-part="${d.bonusPart}"]`;
        else if (d.action) selector = d.index !== undefined ? `[data-action="${d.action}"][data-index="${d.index}"]` : `[data-action="${d.action}"]`;
        return [selector, fallback[d.field || d.action]].filter(s => s);
    },

    // --- Event handlers ---

    // Delegated listeners on the body, bound one time; they read this.form at event time.
    // Typing calls refresh only, so the field keeps the focus and the caret.
    bind() {
        const body = document.getElementById('custom-item-body');
        const renderFields = ['kind', 'weaponType', 'traitPick'];
        const enterActions = { traitRating: 'add-list-trait', typedTrait: 'add-typed-trait', keywordInput: 'add-keyword' };

        body.addEventListener('input', (e) => {
            const el = e.target;
            if (el.dataset.bonusPart === 'value') {
                this.form.bonuses[Number(el.dataset.bonusIndex)].value = el.value;
                this.refresh();
            } else if (el.dataset.field && el.tagName !== 'SELECT') {
                this.form[el.dataset.field] = el.value;
                this.refresh();
            }
        });
        body.addEventListener('change', (e) => {
            const el = e.target;
            if (el.tagName !== 'SELECT') return;
            const part = el.dataset.bonusPart;
            if (part === 'key') {
                this.form.bonuses[Number(el.dataset.bonusIndex)].key = el.value;
                this.render();
            } else if (part === 'mode') {
                this.form.bonuses[Number(el.dataset.bonusIndex)].value = el.value === 'number' ? '1' : el.value;
                this.render();
            } else if (el.dataset.field) {
                this.form[el.dataset.field] = el.value;
                if (renderFields.includes(el.dataset.field)) this.render();
                else this.refresh();
            }
        });
        body.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (button) this.runAction(button.dataset.action, Number(button.dataset.index));
        });
        // Enter in an add box acts as its Add button and does not submit or close
        body.addEventListener('keydown', (e) => {
            const action = e.key === 'Enter' && enterActions[e.target.dataset.field];
            if (!action) return;
            e.preventDefault();
            this.runAction(action);
        });
    },

    // A refused add shows its message next to its box; any other action re-renders the body
    runAction(action, index) {
        const f = this.form;
        let message = null;
        if (action === 'add-list-trait') {
            message = this.addListTrait(f, f.traitPick, this._ratedFor(f.kind).includes(f.traitPick) ? f.traitRating : '');
            if (!message) {
                f.traitPick = '';
                f.traitRating = '';
            }
        } else if (action === 'add-typed-trait') {
            message = this.addTypedTrait(f, f.typedTrait);
            if (!message) f.typedTrait = '';
        } else if (action === 'add-keyword') {
            message = this.addKeyword(f, f.keywordInput);
            if (!message) f.keywordInput = '';
        } else if (action === 'add-bonus') {
            message = this.addBonusRow(f);
        } else if (action === 'remove-trait') {
            this.removeTrait(f, index);
        } else if (action === 'remove-keyword') {
            this.removeKeyword(f, index);
        } else if (action === 'remove-bonus') {
            this.removeBonusRow(f, index);
        } else {
            return;
        }
        if (message) {
            const span = document.querySelector(`#custom-item-body [data-add-error="${action}"]`);
            if (span) span.textContent = message;
        } else {
            this.render();
        }
    },

    // A refused edit (updateCustomItem returns false) keeps the modal open and does not call onSaved.
    // An edit finds its entry by id at its current index. If the entry is gone, Save closes and saves nothing.
    save() {
        const f = this.form;
        if (Object.keys(this.validateForm(f)).length) return;
        const record = this.buildRecord(f);
        if (f.editIndex !== null) {
            const index = State.getCharacter().wargear.findIndex(w => w && w.id === f.editId);
            if (index !== -1 && !State.updateCustomItem(index, record)) return;
        } else {
            State.addCustomItem(record);
        }
        this.close();
        if (this.onSaved) this.onSaved();
    },

    // --- Form operations (no DOM) ---
    // An add refuses bad input with a message and changes nothing, so that Save (through
    // _cleanRecord) never changes or drops a chip that the player sees. null = added.

    // A trait from the glossary list of the kind, with an optional rating: "Name (rating)" or "Name"
    addListTrait(form, name, rating) {
        const L = this.LIMITS;
        if (!this.traitNames(form.kind).includes(name)) return 'Select a trait from the list.';
        const text = String(rating || '').trim();
        if (text.length > L.traitRating) return `Use a rating of ${L.traitRating} characters or fewer.`;
        return this._pushTrait(form, text ? `${name} (${text})` : name);
    },

    // A typed trait; a name part that matches a list name takes the list spelling
    addTypedTrait(form, text) {
        const L = this.LIMITS;
        const trimmed = String(text || '').trim();
        if (trimmed.length < 1 || trimmed.length > L.typedTrait) return `Enter a trait of 1 to ${L.typedTrait} characters.`;
        return this._pushTrait(form, this.normalizeTrait(trimmed, form.kind));
    },

    _pushTrait(form, trait) {
        const L = this.LIMITS;
        const list = form.kind === 'armor' ? form.armorTraits : form.weaponTraits;
        if (trait.length > L.typedTrait) return `Use a trait of ${L.typedTrait} characters or fewer.`;
        // A stored chip can be unnormalized (saved while the glossary was not loaded)
        if (list.some(t => this.normalizeTrait(t, form.kind) === trait)) return 'That trait is already on the item.';
        if (list.length >= L.traits) return `Use ${L.traits} traits or fewer.`;
        list.push(trait);
        return null;
    },

    removeTrait(form, index) {
        (form.kind === 'armor' ? form.armorTraits : form.weaponTraits).splice(index, 1);
    },

    // Trimmed and upper-cased; the length limit applies to the upper-case form
    addKeyword(form, text) {
        const L = this.LIMITS;
        const keyword = String(text || '').trim().toUpperCase();
        if (keyword.length < 1 || keyword.length > L.keyword) return `Enter a keyword of 1 to ${L.keyword} characters.`;
        if (form.keywords.includes(keyword)) return 'That keyword is already on the item.';
        if (form.keywords.length >= L.keywords) return `Use ${L.keywords} keywords or fewer.`;
        form.keywords.push(keyword);
        return null;
    },

    removeKeyword(form, index) {
        form.keywords.splice(index, 1);
    },

    // The keys that the row can use: BONUS_KEYS minus the keys of the other rows
    availableBonusKeys(form, rowIndex) {
        const used = form.bonuses.filter((row, i) => i !== rowIndex).map(row => row.key);
        return this.BONUS_KEYS.filter(key => !used.includes(key));
    },

    addBonusRow(form) {
        if (form.bonuses.length >= this.LIMITS.bonusRows) return `Use ${this.LIMITS.bonusRows} bonuses or fewer.`;
        form.bonuses.push({ key: '', value: '1' });
        return null;
    },

    removeBonusRow(form, index) {
        form.bonuses.splice(index, 1);
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
                parts.push(r ? `Range ${r.short ?? '-'}/${r.medium ?? '-'}/${r.long ?? '-'}m` : 'Range -', `Salvo ${record.salvo}`);
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
    },

    // Escape player text for HTML text and for a quoted attribute.
    escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    // The five-character escape is safe in an attribute. The name matches ImprovisedBuilder.
    escapeAttr(text) {
        return this.escapeHtml(text);
    }
};
