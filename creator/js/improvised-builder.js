// Improvised Builder - Improvised Weaponry crafting form (Redacted Records I, pp. 65-66)
// Builds a base-weapon wargear entry with an improvised overlay via State.addImprovisedWargear /
// State.updateImprovisedWargear. resolve(), shiftCount() and craftingTime() touch no DOM, so
// node tests can load this file in a vm sandbox.

const ImprovisedBuilder = {
    // --- Constants ---
    BASE_IDS: ['improvised_melee_weapon', 'improvised_simple_firearm'],
    // Book order for the "Add one of the following Traits" Shift option
    TRAITS: ['Inflict (On Fire)', 'Inflict (Poisoned 3)', 'Inflict (Restrained)', 'Parry', 'Pistol', 'Silent'],
    UNWIELDY: 'Unwieldy (2)',
    BASE_SECONDS: 480, // "By default this takes 8 minutes."

    // Optional callback set by the wargear tab to re-render after save
    onSaved: null,

    form: null,

    // --- Lifecycle / entry point ---

    // Open the builder. null = create; a wargear index = edit prefilled from that entry.
    open(wargearIndex = null) {
        this.buildModal();
        const base = DataLoader.getWeapon(this.BASE_IDS[0]);
        this.form = {
            editIndex: null,
            baseId: this.BASE_IDS[0],
            name: base ? base.name : '',
            details: '',
            halfTime: 0,
            damageRank: false,
            removeUnwieldy: false,
            traits: [],
            doubleRange: false
        };

        if (wargearIndex !== null) {
            const entry = State.getCharacter().wargear[wargearIndex];
            if (entry && entry.improvised) {
                const imp = entry.improvised;
                Object.assign(this.form, {
                    editIndex: wargearIndex,
                    baseId: entry.id,
                    name: imp.name || '',
                    details: imp.details || '',
                    halfTime: imp.halfTime || 0,
                    damageRank: !!imp.damageRank,
                    removeUnwieldy: !!imp.removeUnwieldy,
                    traits: Array.isArray(imp.traits) ? imp.traits.slice() : [],
                    doubleRange: !!imp.doubleRange
                });
            }
        }

        this.render();
        document.getElementById('improvised-builder-modal').classList.remove('hidden');
    },

    close() {
        const modal = document.getElementById('improvised-builder-modal');
        if (modal) modal.classList.add('hidden');
    },

    // Build the modal shell once, then reuse it
    buildModal() {
        if (document.getElementById('improvised-builder-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'improvised-builder-modal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-content modal-large">
                <div class="modal-header">
                    <h3 id="improvised-builder-title">Build an Improvised Weapon</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body" id="improvised-builder-body"></div>
                <div class="modal-footer">
                    <button class="btn-secondary" id="improvised-builder-cancel">Cancel</button>
                    <button class="btn-primary" id="improvised-builder-save">Add Weapon</button>
                </div>
            </div>
        `;

        // Modal containers must live inside #app for the stacking context
        (document.getElementById('app') || document.body).appendChild(modal);

        modal.querySelector('.modal-close').addEventListener('click', () => this.close());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.close();
        });
        document.getElementById('improvised-builder-cancel').addEventListener('click', () => this.close());
        document.getElementById('improvised-builder-save').addEventListener('click', () => this.save());
    },

    // --- Rendering ---

    render() {
        const f = this.form;
        document.getElementById('improvised-builder-title').textContent =
            f.editIndex !== null ? 'Edit Improvised Weapon' : 'Build an Improvised Weapon';
        document.getElementById('improvised-builder-save').textContent =
            f.editIndex !== null ? 'Save Changes' : 'Add Weapon';

        const body = document.getElementById('improvised-builder-body');
        const scrollTop = body.scrollTop;
        body.innerHTML = this.renderForm();
        body.scrollTop = scrollTop;
        this.bind();
        this.updatePreview();
    },

    renderForm() {
        const f = this.form;
        const isFirearm = f.baseId === 'improvised_simple_firearm';
        const rank = State.getCharacter().rank || 1;

        const profileCards = this.BASE_IDS.map(id => {
            const w = DataLoader.getWeapon(id);
            if (!w) return '';
            const selected = f.baseId === id;
            return `
                <label class="relic-option-card${selected ? ' selected' : ''}">
                    <div class="relic-oddity-header">
                        <input type="radio" name="improvised-profile" value="${id}" ${selected ? 'checked' : ''}>
                        <span class="relic-option-name">${w.name}</span>
                    </div>
                    <div class="relic-option-meta">${this.formatStatLine(w)}</div>
                </label>
            `;
        }).join('');

        const check = (key, label, disabled = false) => `
            <label class="relic-option-card${f[key] ? ' selected' : ''}${disabled ? ' disabled' : ''}">
                <div class="relic-oddity-header">
                    <input type="checkbox" data-option="${key}" ${f[key] ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
                    <span class="relic-option-name">${label}</span>
                </div>
            </label>
        `;

        const traitCards = this.TRAITS.map(t => {
            const checked = f.traits.includes(t);
            return `
                <label class="relic-option-card${checked ? ' selected' : ''}">
                    <div class="relic-oddity-header">
                        <input type="checkbox" data-trait="${t}" ${checked ? 'checked' : ''}>
                        <span class="relic-option-name">${t}</span>
                    </div>
                </label>
            `;
        }).join('');

        return `
            <div class="relic-option-group">
                <h4>Profile</h4>
                <div class="relic-option-cards">${profileCards}</div>
            </div>
            <div class="form-group">
                <label for="improvised-name-input">Weapon Name</label>
                <input type="text" id="improvised-name-input" class="search-input" style="max-width:100%;"
                    value="${this.escapeAttr(f.name)}">
            </div>
            <div class="form-group">
                <label for="improvised-details-input">Details</label>
                <textarea id="improvised-details-input" rows="3"
                    placeholder="Describe the weapon you craft...">${this.escapeHtml(f.details)}</textarea>
                <span class="form-hint">Players should provide details about the weapon they craft, which may affect its Keywords.</span>
            </div>
            <div class="relic-option-group">
                <h4>Shifts (each option costs one Shift)</h4>
                <div class="relic-option-cards">
                    <div class="relic-option-card improvised-counter-card">
                        <span class="relic-option-name">Half the crafting time</span>
                        <div class="improvised-counter">
                            <button class="btn-small" type="button" id="improvised-half-minus" ${f.halfTime === 0 ? 'disabled' : ''}>&minus;</button>
                            <span class="improvised-counter-value">${f.halfTime}</span>
                            <button class="btn-small" type="button" id="improvised-half-plus">+</button>
                            <span class="relic-option-meta">${this.craftingTime(f.halfTime)}</span>
                        </div>
                    </div>
                    ${check('damageRank', `Increase the weapon Damage by +Rank (+${rank})`)}
                    ${check('removeUnwieldy', 'Remove the Unwieldy Trait')}
                    ${check('doubleRange', 'Double all weapon Ranges (Simple Firearm only)', !isFirearm)}
                </div>
            </div>
            <div class="relic-option-group">
                <h4>Add Traits</h4>
                <div class="relic-option-cards improvised-trait-cards">${traitCards}</div>
            </div>
            <div class="relic-summary-block">
                <div class="relic-summary-label">Preview</div>
                <div id="improvised-preview"></div>
            </div>
        `;
    },

    // Refresh the preview and the Save button without re-rendering the inputs
    updatePreview() {
        const f = this.form;
        const weapon = this.resolve({ id: f.baseId, improvised: this.buildOverlay() },
            DataLoader.getWeapon(f.baseId), State.getCharacter().rank || 1);
        const preview = document.getElementById('improvised-preview');
        if (preview) {
            preview.innerHTML = (weapon ? this.profileTableHtml([weapon]) : '') +
                `<div class="relic-option-meta improvised-preview-meta">Shifts spent: ${this.shiftCount(f)} &bull; Crafting time: ${this.craftingTime(f.halfTime)}</div>`;
        }
        document.getElementById('improvised-builder-save').disabled = f.name.trim() === '';
    },

    // --- Event binding ---

    bind() {
        const body = document.getElementById('improvised-builder-body');
        const f = this.form;

        body.querySelectorAll('input[name="improvised-profile"]').forEach(radio => {
            radio.addEventListener('change', () => this.selectProfile(radio.value));
        });
        document.getElementById('improvised-name-input').addEventListener('input', (e) => {
            f.name = e.target.value;
            this.updatePreview();
        });
        document.getElementById('improvised-details-input').addEventListener('input', (e) => {
            f.details = e.target.value;
        });
        document.getElementById('improvised-half-minus').addEventListener('click', () => {
            if (f.halfTime > 0) f.halfTime--;
            this.render();
        });
        document.getElementById('improvised-half-plus').addEventListener('click', () => {
            f.halfTime++;
            this.render();
        });
        body.querySelectorAll('input[data-option]').forEach(cb => {
            cb.addEventListener('change', () => {
                f[cb.dataset.option] = cb.checked;
                this.render();
            });
        });
        body.querySelectorAll('input[data-trait]').forEach(cb => {
            cb.addEventListener('change', () => {
                const t = cb.dataset.trait;
                f.traits = cb.checked ? f.traits.concat(t) : f.traits.filter(x => x !== t);
                this.render();
            });
        });
    },

    // Changing profile keeps a custom name, follows the default name, and clears
    // Double Ranges when the new profile is melee
    selectProfile(baseId) {
        const f = this.form;
        const oldBase = DataLoader.getWeapon(f.baseId);
        const newBase = DataLoader.getWeapon(baseId);
        if (newBase && (f.name.trim() === '' || (oldBase && f.name === oldBase.name))) {
            f.name = newBase.name;
        }
        f.baseId = baseId;
        if (baseId !== 'improvised_simple_firearm') f.doubleRange = false;
        this.render();
    },

    // --- Save ---

    buildOverlay() {
        const f = this.form;
        return {
            name: f.name.trim(),
            details: f.details.trim(),
            halfTime: f.halfTime,
            damageRank: f.damageRank,
            removeUnwieldy: f.removeUnwieldy,
            traits: this.TRAITS.filter(t => f.traits.includes(t)),
            doubleRange: f.baseId === 'improvised_simple_firearm' && f.doubleRange
        };
    },

    save() {
        const f = this.form;
        if (f.name.trim() === '') return;
        const entry = { id: f.baseId, improvised: this.buildOverlay() };
        if (f.editIndex !== null) {
            State.updateImprovisedWargear(f.editIndex, entry);
        } else {
            State.addImprovisedWargear(entry);
        }
        this.close();
        if (this.onSaved) this.onSaved();
    },

    // --- Pure helpers (no DOM) ---

    // Copy of the base record with the wargear entry's improvised overlay applied.
    // rank is the character's current Rank, passed in so a Rank change updates the weapon.
    // name stays the base record's name so talents that match weapon names do not see the
    // player's name; display sites print improvised.name.
    resolve(entry, baseWeapon, rank) {
        if (!baseWeapon) return null;
        const weapon = {
            ...baseWeapon,
            damage: { ...(baseWeapon.damage || {}) },
            traits: (baseWeapon.traits || []).slice()
        };
        if (baseWeapon.range && typeof baseWeapon.range === 'object') weapon.range = { ...baseWeapon.range };

        const imp = entry && entry.improvised;
        if (!imp) return weapon;

        weapon.baseName = baseWeapon.name;
        weapon.improvised = imp;
        if (imp.damageRank) weapon.damage.bonus = (weapon.damage.bonus || 0) + (rank || 1);
        if (imp.removeUnwieldy) weapon.traits = weapon.traits.filter(t => t !== this.UNWIELDY);
        const chosen = imp.traits || [];
        for (const t of this.TRAITS) {
            if (chosen.includes(t) && !weapon.traits.includes(t)) weapon.traits.push(t);
        }
        if (imp.doubleRange && weapon.type === 'ranged' && weapon.range && typeof weapon.range === 'object') {
            weapon.range = { short: weapon.range.short * 2, medium: weapon.range.medium * 2, long: weapon.range.long * 2 };
        }
        return weapon;
    },

    // Name shown for an improvised weapon: the base name alone when the custom name is empty or
    // the same as the base name, else "custom (base)".
    displayName(improvisedName, baseName) {
        const custom = (improvisedName || '').trim();
        return !custom || custom === baseName ? baseName : `${custom} (${baseName})`;
    },

    // Total Shifts spent: one per halving, one per flag, one per added Trait
    shiftCount(imp) {
        if (!imp) return 0;
        return (imp.halfTime || 0) + (imp.damageRank ? 1 : 0) + (imp.removeUnwieldy ? 1 : 0) +
            (imp.traits || []).length + (imp.doubleRange ? 1 : 0);
    },

    // Crafting time after halving the 8-minute default n times
    craftingTime(halfTime) {
        const secs = this.BASE_SECONDS / Math.pow(2, halfTime || 0);
        return secs >= 60 ? `${secs / 60} min` : `${+secs.toFixed(2)} sec`;
    },

    // Plain-text options line for the wargear card and the text exports
    summary(imp) {
        if (!imp) return '';
        const parts = [`Shifts: ${this.shiftCount(imp)}`, `Crafting time: ${this.craftingTime(imp.halfTime)}`];
        if (imp.damageRank) parts.push('Damage +Rank');
        if (imp.removeUnwieldy) parts.push('Unwieldy removed');
        const traits = this.TRAITS.filter(t => (imp.traits || []).includes(t));
        if (traits.length) parts.push(`Traits: ${traits.join(', ')}`);
        if (imp.doubleRange) parts.push('Ranges doubled');
        return parts.join(' • ');
    },

    formatDamage(w) {
        const total = (w.damage?.base || 0) + (w.damage?.bonus || 0);
        return w.damage?.attribute === 'strength' ? `(S) +${total}` : `${total}`;
    },

    formatRange(w) {
        return w.range && typeof w.range === 'object' ? `${w.range.short}/${w.range.medium}/${w.range.long}` : '-';
    },

    formatStatLine(w) {
        const range = w.type === 'ranged' ? ` • Range ${this.formatRange(w)}` : '';
        return `Damage ${this.formatDamage(w)} • ED ${w.ed}${range} • ${(w.traits || []).join(', ') || '-'}`;
    },

    // Stat table for weapon profiles (the talent's profile table and the builder preview).
    // A resolved improvised weapon shows its custom name, or the base name while that is blank.
    profileTableHtml(weapons) {
        const rows = weapons.map(w => `
            <tr>
                <td>${this.escapeHtml(w.improvised?.name || w.name)}</td>
                <td>${this.formatDamage(w)}</td>
                <td>${w.ed}</td>
                <td>${w.ap || '-'}</td>
                <td>${this.formatRange(w)}</td>
                <td>${w.salvo ?? '-'}</td>
                <td>${(w.traits || []).join(', ') || '-'}</td>
            </tr>
        `).join('');
        return `<div class="glossary-table-scroll"><table class="glossary-table">
            <thead><tr><th>Name</th><th>Damage</th><th>ED</th><th>AP</th><th>Range</th><th>Salvo</th><th>Traits</th></tr></thead>
            <tbody>${rows}</tbody>
        </table></div>`;
    },

    // The profile table for a talent that names weapon records in `profiles`, or ''
    talentProfilesHtml(talent) {
        const weapons = (talent.profiles || []).map(id => DataLoader.getWeapon(id)).filter(w => w);
        return weapons.length ? this.profileTableHtml(weapons) : '';
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
