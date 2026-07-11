// Relic Wizard - Eight-step Holy Relic creation flow (Redacted Records II)
// Builds a base-item wargear entry with a relic overlay via State.addRelicWargear /
// State.updateRelicWargear. Works standalone: call RelicWizard.open() from the console.

const RelicWizard = {
    // --- Constants ---
    ATTRIBUTES: ['Strength', 'Toughness', 'Agility', 'Initiative', 'Willpower', 'Intellect', 'Fellowship'],
    SKILLS: ['Athletics', 'Awareness', 'Ballistic Skill', 'Cunning', 'Deception', 'Insight',
             'Intimidation', 'Investigation', 'Leadership', 'Medicae', 'Persuasion', 'Pilot',
             'Psychic Mastery', 'Scholar', 'Stealth', 'Survival', 'Tech', 'Weapon Skill'],

    STEPS: [
        { title: 'Name' },
        { title: 'Relic Form' },
        { title: 'Base Item' },
        { title: 'Original Owner' },
        { title: 'Anointment' },
        { title: 'Relic Power' },
        { title: 'Oddities' },
        { title: 'Summary' }
    ],

    // Form ids grouped for the Relic Form step
    FORM_GROUPS: [
        { heading: 'Weapons', ids: ['mundane_melee_weapon', 'chain_weapon', 'power_weapon', 'force_weapon',
            'exotic_melee_weapon', 'projectile_weapon', 'las_weapon', 'flame_weapon', 'plasma_weapon',
            'melta_weapon', 'bolt_weapon', 'grenade_or_missile_weapon'] },
        { heading: 'Armour', ids: ['mundane_armour_or_clothing', 'powered_armour', 'power_field'] },
        { heading: 'Other', ids: ['augmetic', 'common_tool_or_equipment', 'uncommon_tool_or_equipment', 'rare_tool_or_equipment'] }
    ],

    // Optional callback set by the wargear tab (Task 3) to re-render after save
    onSaved: null,

    wizard: null,
    _searchTimer: null,

    // --- Lifecycle / entry point ---

    // Open the wizard. null = create; a wargear index = edit prefilled from that entry.
    open(wargearIndex = null) {
        this.buildModal();
        this.wizard = {
            editIndex: null,
            step: 0,
            name: '',
            formId: null,
            baseItemId: null,
            originalOwner: null,
            anointment: null,
            power: null,
            powerChoice: null,
            oddities: [],
            baseSearch: '',
            rollMessage: ''
        };

        if (wargearIndex !== null) {
            const entry = State.getCharacter().wargear[wargearIndex];
            if (entry && entry.relic) {
                const relic = entry.relic;
                this.wizard.editIndex = wargearIndex;
                this.wizard.name = relic.name || '';
                this.wizard.formId = relic.form || null;
                this.wizard.baseItemId = entry.id || null;
                this.wizard.originalOwner = relic.originalOwner || null;
                this.wizard.anointment = relic.anointment || null;
                this.wizard.power = relic.power || null;
                this.wizard.powerChoice = relic.powerChoice || null;
                this.wizard.oddities = Array.isArray(relic.oddities) ? relic.oddities.slice() : [];
            }
        }

        this.render();
        document.getElementById('relic-wizard-modal').classList.remove('hidden');
    },

    close() {
        const modal = document.getElementById('relic-wizard-modal');
        if (modal) modal.classList.add('hidden');
    },

    // Build the modal shell once, then reuse it
    buildModal() {
        if (document.getElementById('relic-wizard-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'relic-wizard-modal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <h3 id="relic-wizard-title">Create Holy Relic</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="relic-wizard-progress" id="relic-wizard-progress"></div>
                <div class="modal-body" id="relic-wizard-body"></div>
                <div class="modal-footer">
                    <button class="btn-secondary" id="relic-wizard-cancel">Cancel</button>
                    <button class="btn-secondary" id="relic-wizard-back">Back</button>
                    <button class="btn-primary" id="relic-wizard-next">Next</button>
                </div>
            </div>
        `;

        // Modal containers must live inside #app for the stacking context
        (document.getElementById('app') || document.body).appendChild(modal);

        modal.querySelector('.modal-close').addEventListener('click', () => this.close());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.close();
        });
        document.getElementById('relic-wizard-cancel').addEventListener('click', () => this.close());
        document.getElementById('relic-wizard-back').addEventListener('click', () => this.goBack());
        document.getElementById('relic-wizard-next').addEventListener('click', () => {
            if (this.wizard.step === this.STEPS.length - 1) {
                this.finish();
            } else {
                this.goNext();
            }
        });
    },

    // --- Navigation ---

    goNext() {
        if (!this.isStepValid(this.wizard.step)) return;
        this.wizard.step++;
        this.wizard.rollMessage = '';
        this.render();
    },

    goBack() {
        if (this.wizard.step === 0) return;
        this.wizard.step--;
        this.wizard.rollMessage = '';
        this.render();
    },

    // --- Rendering ---

    render() {
        const w = this.wizard;
        document.getElementById('relic-wizard-title').textContent =
            w.editIndex !== null ? 'Edit Holy Relic' : 'Create Holy Relic';

        document.getElementById('relic-wizard-progress').innerHTML =
            `<span class="relic-wizard-step-num">Step ${w.step + 1} of ${this.STEPS.length}</span>` +
            `<span class="relic-wizard-step-title">${this.STEPS[w.step].title}</span>`;

        const body = document.getElementById('relic-wizard-body');
        body.innerHTML = this.renderStep(w.step);
        this.bindStep(w.step);
        this.updateNav();
        this.enhanceGlossary(body);
    },

    renderStep(step) {
        switch (step) {
            case 0: return this.renderNameStep();
            case 1: return this.renderFormStep();
            case 2: return this.renderBaseItemStep();
            case 3: return this.renderOwnerStep();
            case 4: return this.renderAnointmentStep();
            case 5: return this.renderPowerStep();
            case 6: return this.renderOdditiesStep();
            case 7: return this.renderSummaryStep();
            default: return '';
        }
    },

    updateNav() {
        const back = document.getElementById('relic-wizard-back');
        const next = document.getElementById('relic-wizard-next');
        const last = this.wizard.step === this.STEPS.length - 1;

        back.style.display = this.wizard.step > 0 ? '' : 'none';
        next.textContent = last ? (this.wizard.editIndex !== null ? 'Save Changes' : 'Add Relic') : 'Next';
        next.disabled = !this.isStepValid(this.wizard.step);
    },

    // Step 0 - Name
    renderNameStep() {
        return `
            <div class="form-group">
                <label for="relic-name-input">Relic Name</label>
                <input type="text" id="relic-name-input" class="search-input" style="max-width:100%;"
                    placeholder="Name your relic..." value="${this.escapeAttr(this.wizard.name)}">
                <span class="form-hint">Give your Holy Relic a name.</span>
            </div>
        `;
    },

    // Step 1 - Relic Form
    renderFormStep() {
        const forms = DataLoader.getHolyRelics().forms;
        let html = `<p class="section-desc">Choose the form your Relic takes. The number shown is how many eligible base items are available for that form.</p>`;

        html += this.FORM_GROUPS.map(group => {
            const cards = group.ids.map(id => {
                const count = this.getBaseItemsForForm(id).length;
                const selected = this.wizard.formId === id ? ' selected' : '';
                const disabled = count === 0 ? ' disabled' : '';
                return `
                    <div class="relic-option-card relic-form-card${selected}${disabled}" data-form="${id}"${count === 0 ? ' aria-disabled="true"' : ''}>
                        <div class="relic-option-name">${forms[id].name}</div>
                        <div class="relic-option-meta">${count} item${count === 1 ? '' : 's'}</div>
                    </div>
                `;
            }).join('');
            return `<div class="relic-option-group"><h4>${group.heading}</h4><div class="relic-option-cards">${cards}</div></div>`;
        }).join('');

        html += this.renderRollRow('relic-roll-form', 'Roll 2d6');
        return html;
    },

    // Step 2 - Base Item
    renderBaseItemStep() {
        return `
            <div class="form-group">
                <input type="text" id="relic-baseitem-search" class="search-input" style="max-width:100%;"
                    placeholder="Search base items..." value="${this.escapeAttr(this.wizard.baseSearch)}">
            </div>
            <div id="relic-baseitem-list" class="relic-option-cards relic-baseitem-list">
                ${this.renderBaseItemRows()}
            </div>
        `;
    },

    renderBaseItemRows() {
        let items = this.getBaseItemsForForm(this.wizard.formId).slice();

        // When editing, always keep the current base item selectable
        if (this.wizard.editIndex !== null && this.wizard.baseItemId &&
            !items.some(i => i.id === this.wizard.baseItemId)) {
            const current = DataLoader.getWargearItem(this.wizard.baseItemId);
            if (current) items.unshift(current);
        }

        const q = (this.wizard.baseSearch || '').toLowerCase();
        if (q) {
            items = items.filter(i =>
                (`${i.name} ${i.category || ''}`).toLowerCase().includes(q));
        }

        items.sort((a, b) => a.name.localeCompare(b.name));

        if (items.length === 0) {
            return '<p class="text-muted">No eligible base items found.</p>';
        }

        return items.map(item => {
            const selected = this.wizard.baseItemId === item.id ? ' selected' : '';
            const rarity = item.rarity || 'Common';
            const category = item.category || '-';
            return `
                <div class="relic-option-card relic-baseitem-card${selected}" data-id="${item.id}">
                    <div class="relic-baseitem-main">
                        <span class="relic-option-name">${item.name}</span>
                        <span class="relic-option-meta">${category} &bull; ${rarity}</span>
                    </div>
                    <div class="relic-baseitem-stat">${this.formatBaseItemStat(item)}</div>
                </div>
            `;
        }).join('');
    },

    // Step 3 - Original Owner
    renderOwnerStep() {
        const data = DataLoader.getHolyRelics().origins.originalOwner;
        return this.renderEntryCards(data.entries, this.wizard.originalOwner, 'owner') +
            this.renderRollRow('relic-roll-owner', 'Roll 1d6');
    },

    // Step 4 - Anointment
    renderAnointmentStep() {
        const data = DataLoader.getHolyRelics().origins.anointment;
        return this.renderEntryCards(data.entries, this.wizard.anointment, 'anointment') +
            this.renderRollRow('relic-roll-anointment', 'Roll 1d6');
    },

    // Step 5 - Relic Power
    renderPowerStep() {
        const relics = DataLoader.getHolyRelics();
        const table = relics.powers[relics.forms[this.wizard.formId].powersTable];
        let html = `<h4 class="relic-powers-heading">${table.name}</h4>`;

        // Sacred Shells note for grenade/missile ammunition relics
        if (this.wizard.formId === 'grenade_or_missile_weapon' && relics.sacredShells) {
            html += `<div class="relic-info-note"><strong>Sacred Shells:</strong> ${relics.sacredShells}</div>`;
        }

        html += this.renderEntryCards(table.entries, this.wizard.power, 'power');
        html += this.renderRollRow('relic-roll-power', 'Roll 1d6');

        const power = this.getSelectedPower();
        if (power && power.choice) {
            html += this.renderChoicePicker(power.choice);
        }
        return html;
    },

    renderChoicePicker(choiceType) {
        const relics = DataLoader.getHolyRelics();
        let html = '<div class="relic-choice-picker">';

        if (choiceType === 'enemyKeyword') {
            html += '<h4>Choose an Enemy Keyword</h4>';
            const chips = relics.enemyKeywords.entries.map(e => {
                const selected = this.wizard.powerChoice === e.keyword ? ' selected' : '';
                return `<div class="relic-option-card relic-choice-chip${selected}" data-keyword="${e.keyword}">${e.keyword}</div>`;
            }).join('');
            html += `<div class="relic-option-cards relic-choice-chips">${chips}</div>`;
            html += this.renderRollRow('relic-roll-keyword', 'Roll 4d6');
        } else if (choiceType === 'attributeOrSkill') {
            const attrs = this.ATTRIBUTES.filter(a => a !== 'Strength');
            html += '<h4>Choose an Attribute or Skill (besides Strength)</h4>';
            html += `<select id="relic-choice-select" class="search-input" style="max-width:100%;">
                <option value="">Select...</option>
                <optgroup label="Attributes">${attrs.map(a => this.opt(a)).join('')}</optgroup>
                <optgroup label="Skills">${this.SKILLS.map(s => this.opt(s)).join('')}</optgroup>
            </select>`;
        } else if (choiceType === 'skill') {
            html += '<h4>Choose a Skill</h4>';
            html += `<select id="relic-choice-select" class="search-input" style="max-width:100%;">
                <option value="">Select...</option>
                ${this.SKILLS.map(s => this.opt(s)).join('')}
            </select>`;
        } else if (choiceType === 'condition') {
            const conditions = Object.values(DataLoader.cache['glossary.json']?.conditions || {}).map(c => c.name);
            html += '<h4>Choose a Condition</h4>';
            html += `<select id="relic-choice-select" class="search-input" style="max-width:100%;">
                <option value="">Select...</option>
                ${conditions.map(c => this.opt(c)).join('')}
            </select>`;
        }

        html += '</div>';
        return html;
    },

    opt(value) {
        const selected = this.wizard.powerChoice === value ? ' selected' : '';
        return `<option value="${this.escapeAttr(value)}"${selected}>${this.escapeHtml(value)}</option>`;
    },

    // Step 6 - Oddities
    renderOdditiesStep() {
        const data = DataLoader.getHolyRelics().oddities;
        let html = `<p class="section-desc">Choose any number of Oddities (or none).</p>`;
        html += '<div class="relic-option-cards">';
        html += data.entries.map(e => {
            const checked = this.wizard.oddities.includes(e.id);
            return `
                <label class="relic-option-card relic-oddity-card${checked ? ' selected' : ''}" data-id="${e.id}">
                    <div class="relic-oddity-header">
                        <input type="checkbox" data-id="${e.id}" ${checked ? 'checked' : ''}>
                        <span class="relic-option-name">${e.name}</span>
                    </div>
                    <div class="relic-rule-text">${e.description}</div>
                </label>
            `;
        }).join('');
        html += '</div>';
        html += this.renderRollRow('relic-roll-oddity', 'Roll 1d6');
        return html;
    },

    // Step 7 - Summary
    renderSummaryStep() {
        const w = this.wizard;
        const relics = DataLoader.getHolyRelics();
        const forms = relics.forms;
        const item = DataLoader.getWargearItem(w.baseItemId);
        const owner = relics.origins.originalOwner.entries.find(e => e.id === w.originalOwner);
        const anoint = relics.origins.anointment.entries.find(e => e.id === w.anointment);
        const power = this.getSelectedPower();

        const block = (label, valueHtml) =>
            `<div class="relic-summary-block"><div class="relic-summary-label">${label}</div><div class="relic-summary-value">${valueHtml}</div></div>`;

        let html = '<div class="relic-summary">';
        html += block('Name', this.escapeHtml(w.name));
        html += block('Form', forms[w.formId] ? forms[w.formId].name : '-');
        html += block('Base Item', item
            ? `${item.name} <span class="relic-summary-stat">${this.formatBaseItemStat(item)}</span>`
            : '-');
        if (owner) html += block('Original Owner', `<strong>${owner.name}</strong><div class="relic-rule-text">${owner.description}</div>`);
        if (anoint) html += block('Anointment', `<strong>${anoint.name}</strong><div class="relic-rule-text">${anoint.description}</div>`);
        if (power) {
            const choiceHtml = (power.choice && w.powerChoice)
                ? ` <span class="badge-relic">${this.escapeHtml(w.powerChoice)}</span>` : '';
            html += block('Relic Power', `<strong>${power.name}</strong>${choiceHtml}<div class="relic-rule-text">${power.description}</div>`);
        }
        if (w.oddities.length > 0) {
            const list = w.oddities.map(id => {
                const o = relics.oddities.entries.find(e => e.id === id);
                return o ? `<strong>${o.name}</strong><div class="relic-rule-text">${o.description}</div>` : '';
            }).join('');
            html += block('Oddities', list);
        } else {
            html += block('Oddities', '<span class="text-muted">None</span>');
        }
        html += '</div>';
        return html;
    },

    // --- Shared render helpers ---

    // Render a set of selectable option cards (name + verbatim description)
    renderEntryCards(entries, selectedId, kind) {
        const cards = entries.map(e => {
            const selected = selectedId === e.id ? ' selected' : '';
            return `
                <div class="relic-option-card${selected}" data-kind="${kind}" data-id="${e.id}">
                    <div class="relic-option-name">${e.name}</div>
                    <div class="relic-rule-text">${e.description}</div>
                </div>
            `;
        }).join('');
        return `<div class="relic-option-cards">${cards}</div>`;
    },

    renderRollRow(buttonId, label) {
        const msg = this.wizard.rollMessage
            ? `<span class="relic-roll-result">${this.escapeHtml(this.wizard.rollMessage)}</span>` : '';
        return `<div class="relic-roll-row"><button class="btn-small" id="${buttonId}" type="button">${label}</button>${msg}</div>`;
    },

    // --- Event binding per step ---

    bindStep(step) {
        const body = document.getElementById('relic-wizard-body');

        if (step === 0) {
            const input = document.getElementById('relic-name-input');
            input.addEventListener('input', (e) => {
                this.wizard.name = e.target.value;
                this.updateNav();
            });
            return;
        }

        if (step === 1) {
            body.querySelectorAll('.relic-form-card').forEach(card => {
                if (card.classList.contains('disabled')) return;
                card.addEventListener('click', () => this.selectForm(card.dataset.form));
            });
            document.getElementById('relic-roll-form').addEventListener('click', () => {
                const { col, row, formId } = this.rollForm();
                this.wizard.rollMessage = `Rolled ${col}, ${row} → ${DataLoader.getHolyRelics().forms[formId].name}`;
                this.selectForm(formId, true);
            });
            return;
        }

        if (step === 2) {
            const search = document.getElementById('relic-baseitem-search');
            search.addEventListener('input', (e) => {
                this.wizard.baseSearch = e.target.value;
                clearTimeout(this._searchTimer);
                this._searchTimer = setTimeout(() => {
                    const list = document.getElementById('relic-baseitem-list');
                    list.innerHTML = this.renderBaseItemRows();
                    this.bindBaseItemRows();
                }, 250);
            });
            this.bindBaseItemRows();
            return;
        }

        if (step === 3) {
            this.bindEntryCards('owner', (id) => { this.wizard.originalOwner = id; });
            document.getElementById('relic-roll-owner').addEventListener('click', () => {
                const entries = DataLoader.getHolyRelics().origins.originalOwner.entries;
                this.rollEntry(entries, (e) => { this.wizard.originalOwner = e.id; });
            });
            return;
        }

        if (step === 4) {
            this.bindEntryCards('anointment', (id) => { this.wizard.anointment = id; });
            document.getElementById('relic-roll-anointment').addEventListener('click', () => {
                const entries = DataLoader.getHolyRelics().origins.anointment.entries;
                this.rollEntry(entries, (e) => { this.wizard.anointment = e.id; });
            });
            return;
        }

        if (step === 5) {
            const relics = DataLoader.getHolyRelics();
            const table = relics.powers[relics.forms[this.wizard.formId].powersTable];
            this.bindEntryCards('power', (id) => this.selectPower(id));
            document.getElementById('relic-roll-power').addEventListener('click', () => {
                this.rollEntry(table.entries, (e) => this.selectPower(e.id));
            });

            // Dependent choice picker bindings
            const chips = body.querySelectorAll('.relic-choice-chip');
            chips.forEach(chip => {
                chip.addEventListener('click', () => {
                    this.wizard.powerChoice = chip.dataset.keyword;
                    this.render();
                });
            });
            const keywordRoll = document.getElementById('relic-roll-keyword');
            if (keywordRoll) {
                keywordRoll.addEventListener('click', () => {
                    const sum = this.roll4d6();
                    const entry = relics.enemyKeywords.entries.find(k => k.roll === sum);
                    if (entry) {
                        this.wizard.powerChoice = entry.keyword;
                        this.wizard.rollMessage = `Rolled ${sum} → ${entry.keyword}`;
                    } else {
                        this.wizard.rollMessage = `Rolled ${sum}`;
                    }
                    this.render();
                });
            }
            const select = document.getElementById('relic-choice-select');
            if (select) {
                select.addEventListener('change', (e) => {
                    this.wizard.powerChoice = e.target.value || null;
                    this.updateNav();
                });
            }
            return;
        }

        if (step === 6) {
            body.querySelectorAll('.relic-oddity-card input[type="checkbox"]').forEach(cb => {
                cb.addEventListener('change', () => this.toggleOddity(cb.dataset.id));
            });
            document.getElementById('relic-roll-oddity').addEventListener('click', () => {
                const roll = this.rollD6();
                const entry = DataLoader.getHolyRelics().oddities.entries.find(e => e.roll === roll);
                if (entry && !this.wizard.oddities.includes(entry.id)) {
                    this.wizard.oddities.push(entry.id);
                }
                this.wizard.rollMessage = entry ? `Rolled ${roll} → ${entry.name}` : `Rolled ${roll}`;
                this.render();
            });
            return;
        }
    },

    bindEntryCards(kind, setter) {
        const body = document.getElementById('relic-wizard-body');
        body.querySelectorAll(`.relic-option-card[data-kind="${kind}"]`).forEach(card => {
            card.addEventListener('click', () => {
                setter(card.dataset.id);
                this.render();
            });
        });
    },

    bindBaseItemRows() {
        const list = document.getElementById('relic-baseitem-list');
        if (!list) return;
        list.querySelectorAll('.relic-baseitem-card').forEach(card => {
            card.addEventListener('click', () => {
                this.wizard.baseItemId = card.dataset.id;
                list.querySelectorAll('.relic-baseitem-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.updateNav();
            });
        });
    },

    // --- Selection handlers ---

    // Changing form clears the base item, power, and power choice
    selectForm(formId, keepRollMessage = false) {
        if (this.wizard.formId !== formId) {
            this.wizard.formId = formId;
            this.wizard.baseItemId = null;
            this.wizard.baseSearch = '';
            this.wizard.power = null;
            this.wizard.powerChoice = null;
        }
        if (!keepRollMessage) this.wizard.rollMessage = '';
        this.render();
    },

    // Changing power clears the dependent power choice
    selectPower(powerId) {
        if (this.wizard.power !== powerId) {
            this.wizard.power = powerId;
            this.wizard.powerChoice = null;
        }
        this.render();
    },

    toggleOddity(id) {
        const idx = this.wizard.oddities.indexOf(id);
        if (idx === -1) {
            this.wizard.oddities.push(id);
        } else {
            this.wizard.oddities.splice(idx, 1);
        }
        this.render();
    },

    // Roll a 1d6 and apply the matching table entry
    rollEntry(entries, apply) {
        const roll = this.rollD6();
        const entry = entries.find(e => e.roll === roll);
        if (entry) apply(entry);
        this.wizard.rollMessage = entry ? `Rolled ${roll} → ${entry.name}` : `Rolled ${roll}`;
        this.render();
    },

    // --- Validation ---

    isStepValid(step) {
        const w = this.wizard;
        switch (step) {
            case 0: return w.name.trim() !== '';
            case 1: return w.formId !== null;
            case 2: return w.baseItemId !== null;
            case 3: return w.originalOwner !== null;
            case 4: return w.anointment !== null;
            case 5: {
                if (w.power === null) return false;
                const power = this.getSelectedPower();
                if (power && power.choice) return !!w.powerChoice;
                return true;
            }
            case 6: return true;
            case 7: return true;
            default: return false;
        }
    },

    // --- Finish ---

    finish() {
        const w = this.wizard;
        const power = this.getSelectedPower();

        const relic = {
            name: w.name.trim(),
            form: w.formId,
            originalOwner: w.originalOwner,
            anointment: w.anointment,
            power: w.power,
            oddities: w.oddities.slice()
        };
        // powerChoice is present only when the selected power declares a choice
        if (power && power.choice && w.powerChoice) {
            relic.powerChoice = w.powerChoice;
        }

        if (w.editIndex !== null) {
            State.updateRelicWargear(w.editIndex, w.baseItemId, relic);
        } else {
            State.addRelicWargear(w.baseItemId, relic);
        }

        this.close();
        if (this.onSaved) this.onSaved();
    },

    // --- Base-item filtering (authoritative logic) ---

    // Strip the dataset's " Weapons"/" Weapon" category-suffix variants: "Chain Weapons" -> "Chain"
    normalizeCategory(cat) {
        return (cat || '').replace(/ Weapons?$/, '');
    },

    // Universal eligibility: no Unique rarity, no vehicle categories, source enabled
    isEligible(item) {
        if (item.rarity === 'Unique') return false;
        if ((item.category || '').startsWith('Vehicle')) return false;
        return State.isSourceEnabled(item.source);
    },

    meleeByCategory(pred) {
        return (DataLoader.getAllWeapons() || []).filter(w =>
            w.type === 'melee' && this.isEligible(w) && pred(this.normalizeCategory(w.category)));
    },

    rangedByCategory(pred) {
        return (DataLoader.getAllWeapons() || []).filter(w =>
            w.type === 'ranged' && this.isEligible(w) && pred(this.normalizeCategory(w.category)));
    },

    toolsByRarity(rarity) {
        const excluded = ['augmetic', 'clothing', 'vehicle wargear', 'relic', 'ritual'];
        return (DataLoader.getAllEquipment() || []).filter(e =>
            this.isEligible(e) && !excluded.includes(e.category) && e.rarity === rarity);
    },

    hasPoweredTrait(a) {
        return (a.traits || []).some(t => /^Powered/.test(t));
    },

    // Returns the eligible base items for a form id
    getBaseItemsForForm(formId) {
        const MELEE_CORE = ['Low-Tech', 'Chain', 'Power', 'Force'];
        switch (formId) {
            case 'augmetic':
                return (DataLoader.getAllEquipment() || []).filter(e => this.isEligible(e) && e.category === 'augmetic');
            case 'common_tool_or_equipment':   return this.toolsByRarity('Common');
            case 'uncommon_tool_or_equipment': return this.toolsByRarity('Uncommon');
            case 'rare_tool_or_equipment':     return this.toolsByRarity('Rare');
            case 'mundane_melee_weapon': return this.meleeByCategory(c => c === 'Low-Tech');
            case 'chain_weapon':  return this.meleeByCategory(c => c === 'Chain');
            case 'power_weapon':  return this.meleeByCategory(c => c === 'Power');
            case 'force_weapon':  return this.meleeByCategory(c => c === 'Force');
            case 'exotic_melee_weapon': return this.meleeByCategory(c => !MELEE_CORE.includes(c));
            case 'projectile_weapon': return this.rangedByCategory(c => c === 'Solid Projectile');
            case 'las_weapon':    return this.rangedByCategory(c => c === 'Las');
            case 'flame_weapon':  return this.rangedByCategory(c => c === 'Flame');
            case 'plasma_weapon': return this.rangedByCategory(c => c === 'Plasma');
            case 'melta_weapon':  return this.rangedByCategory(c => c === 'Melta');
            case 'bolt_weapon':   return this.rangedByCategory(c => c === 'Bolt');
            case 'grenade_or_missile_weapon': {
                const cats = ['Grenade', 'Missile', 'Explosive'];
                return (DataLoader.getAllWeapons() || []).filter(w => {
                    if (!this.isEligible(w)) return false;
                    if (w.category && cats.includes(w.category)) return true;
                    const kws = (w.keywords || []).map(k => k.toUpperCase());
                    return kws.includes('GRENADE') || kws.includes('MISSILE');
                });
            }
            case 'mundane_armour_or_clothing': {
                const armor = (DataLoader.getAllArmor() || []).filter(a =>
                    this.isEligible(a) && !this.hasPoweredTrait(a) && !a.invulnerable);
                const clothing = (DataLoader.getAllEquipment() || []).filter(e =>
                    this.isEligible(e) && e.category === 'clothing');
                return armor.concat(clothing);
            }
            case 'powered_armour':
                return (DataLoader.getAllArmor() || []).filter(a => this.isEligible(a) && this.hasPoweredTrait(a));
            case 'power_field':
                return (DataLoader.getAllArmor() || []).filter(a => this.isEligible(a) && a.invulnerable === true);
            default:
                return [];
        }
    },

    // --- Dice helpers ---

    rollD6() { return Math.floor(Math.random() * 6) + 1; },
    // Form: first d6 = column, second d6 = row on the 6x6 table
    rollForm() {
        const col = this.rollD6(), row = this.rollD6();
        return { col, row, formId: DataLoader.getHolyRelics().formTable.rows[row - 1][col - 1] };
    },
    roll4d6() { return this.rollD6() + this.rollD6() + this.rollD6() + this.rollD6(); },

    // --- Misc helpers ---

    getSelectedPower() {
        if (!this.wizard || !this.wizard.formId || !this.wizard.power) return null;
        const relics = DataLoader.getHolyRelics();
        const table = relics.powers[relics.forms[this.wizard.formId].powersTable];
        return table.entries.find(e => e.id === this.wizard.power) || null;
    },

    // Key stat line for a base item, by item kind
    formatBaseItemStat(item) {
        if (DataLoader.getWeapon(item.id)) {
            if (item.type === 'melee') {
                return `Dmg ${this.formatMeleeDamage(item)}`;
            }
            const range = this.formatRange(item.range);
            return `Dmg ${item.damage?.base != null ? item.damage.base : '-'}${range ? ' &bull; ' + range : ''}`;
        }
        if (DataLoader.getArmor(item.id)) {
            if (item.ar != null) return `AR ${item.ar}`;
            if (item.invulnerable) return 'Invulnerable';
            return '-';
        }
        const effect = item.effect || item.description || '';
        return effect.length > 80 ? this.escapeHtml(effect.slice(0, 80)) + '…' : this.escapeHtml(effect);
    },

    formatMeleeDamage(weapon) {
        const base = weapon.damage?.base || 0;
        const bonus = weapon.damage?.bonus || 0;
        const total = base + bonus;
        if (weapon.damage?.attribute === 'strength') {
            return `(S) +${total}`;
        }
        return `${total}`;
    },

    formatRange(range) {
        if (!range) return '';
        if (typeof range === 'object') return `${range.short}/${range.medium}/${range.long}`;
        return String(range);
    },

    enhanceGlossary(container) {
        if (typeof Glossary !== 'undefined' && Glossary.enhanceElement) {
            container.querySelectorAll('.relic-rule-text, .relic-info-note').forEach(el => {
                Glossary.enhanceElement(el);
            });
        }
    },

    // Escape HTML for safe insertion of user-entered text
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Escape user-entered text for a double-quoted HTML attribute (escapeHtml + quotes)
    escapeAttr(text) {
        return this.escapeHtml(text).replace(/"/g, '&quot;');
    }
};
