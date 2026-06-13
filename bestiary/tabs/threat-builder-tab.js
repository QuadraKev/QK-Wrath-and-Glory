// Threat Builder Tab - UI module for creating/editing custom threats

const ThreatBuilderTab = {
    _previewTimer: null,
    _templateSearchTimer: null,
    _pickerSort: { field: null, asc: true }, // 'name' or 'threat'

    init() {
        this.bindEvents();
    },

    refresh() {
        this.renderEditor();
        this.renderPreview();
    },

    bindEvents() {
        // Template picker (desktop action bar — may not exist if removed from HTML)
        document.getElementById('builder-template-search')?.addEventListener('input', (e) => {
            clearTimeout(this._templateSearchTimer);
            this._templateSearchTimer = setTimeout(() => {
                this.renderTemplateDropdown(e.target.value);
            }, 200);
        });
        document.getElementById('builder-template-search')?.addEventListener('focus', (e) => {
            this.renderTemplateDropdown(e.target.value);
            document.getElementById('builder-template-dropdown')?.classList.remove('hidden');
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('builder-template-dropdown');
            const search = document.getElementById('builder-template-search');
            if (dropdown && !dropdown.contains(e.target) && e.target !== search) {
                dropdown.classList.add('hidden');
            }
            const dropdownSidebar = document.getElementById('builder-template-dropdown-sidebar');
            const searchSidebar = document.getElementById('builder-template-search-sidebar');
            if (dropdownSidebar && !dropdownSidebar.contains(e.target) && e.target !== searchSidebar) {
                dropdownSidebar.classList.add('hidden');
            }
        });

        // Action buttons
        document.getElementById('btn-builder-clear').addEventListener('click', () => {
            if (confirm('Clear all fields? This cannot be undone.')) {
                ThreatBuilderState.clear();
                ThreatBuilderState.clearAutoSave();
                this.refresh();
            }
        });

        document.getElementById('btn-builder-save').addEventListener('click', async () => {
            const result = await ThreatBuilderState.saveThreatToFile();
            if (result.success) {
                this.showNotification('Threat saved to file!');
            } else if (result.error) {
                this.showNotification('Error: ' + result.error);
            }
        });

        document.getElementById('btn-builder-load').addEventListener('click', async () => {
            const result = await ThreatBuilderState.loadThreatFromFile();
            if (result.success) {
                this.refresh();
                this.showNotification('Threat loaded from file!');
            } else if (result.error && result.error !== 'Cancelled') {
                this.showNotification('Error: ' + result.error);
            }
        });

        // Mobile sidebar: template search
        document.getElementById('builder-template-search-sidebar')?.addEventListener('input', (e) => {
            clearTimeout(this._templateSearchTimer);
            this._templateSearchTimer = setTimeout(() => {
                this.renderTemplateDropdown(e.target.value, 'sidebar');
            }, 200);
        });
        document.getElementById('builder-template-search-sidebar')?.addEventListener('focus', (e) => {
            this.renderTemplateDropdown(e.target.value, 'sidebar');
        });

        // Mobile sidebar: save/load/clear
        document.getElementById('btn-builder-save-sidebar')?.addEventListener('click', async () => {
            const result = await ThreatBuilderState.saveThreatToFile();
            if (result.success) this.showNotification('Threat saved to file!');
            else if (result.error) this.showNotification('Error: ' + result.error);
        });

        document.getElementById('btn-builder-load-sidebar')?.addEventListener('click', async () => {
            const result = await ThreatBuilderState.loadThreatFromFile();
            if (result.success) {
                this.refresh();
                this.showNotification('Threat loaded from file!');
            } else if (result.error && result.error !== 'Cancelled') {
                this.showNotification('Error: ' + result.error);
            }
        });

        document.getElementById('btn-builder-clear-sidebar')?.addEventListener('click', () => {
            if (confirm('Clear all fields? This cannot be undone.')) {
                ThreatBuilderState.clear();
                ThreatBuilderState.clearAutoSave();
                this.refresh();
            }
        });

        // Preview button (mobile) — slide up bottom sheet
        document.getElementById('btn-builder-preview')?.addEventListener('click', () => {
            const threatData = ThreatBuilderState.getThreatData();
            BottomSheet.open(div => {
                if (!threatData) {
                    div.innerHTML = '<div class="threat-detail-placeholder"><p>Edit threat details to see a preview</p></div>';
                    return;
                }
                const html = this.renderPreviewCard(threatData);
                div.innerHTML = `<div class="builder-preview-label">Preview</div>${html}`;
                Glossary.enhanceDescriptions(div);
            });
        });

        document.getElementById('btn-builder-inject').addEventListener('click', () => {
            const count = parseInt(document.getElementById('builder-inject-count').value) || 1;

            if (ThreatBuilderState.wouldCauseNameCollision()) {
                // Show rename modal for name collision
                this.showInjectModal(ThreatBuilderState.threat.name, count);
            } else {
                // Direct inject
                const result = ThreatBuilderState.injectIntoEncounter(count);
                if (result.success) {
                    const msg = result.count > 1
                        ? `${result.count}x "${result.name}" added to the encounter!`
                        : `"${result.name}" added to the encounter!`;
                    this.showNotification(msg);
                } else {
                    this.showNotification('Error: ' + result.error);
                }
            }
        });
    },

    // ===== Template Dropdown =====

    renderTemplateDropdown(search, variant = 'main') {
        const dropdownId = variant === 'sidebar' ? 'builder-template-dropdown-sidebar' : 'builder-template-dropdown';
        const dropdown = document.getElementById(dropdownId);
        const searchLower = (search || '').toLowerCase();

        const excludedSources = SettingsTab.excludedSources.size > 0 ? [...SettingsTab.excludedSources] : null;
        let filtered = DataLoader.filterThreats({ search: searchLower, excludedSources });
        filtered = filtered.sort((a, b) => a.name.localeCompare(b.name));

        if (filtered.length === 0) {
            dropdown.innerHTML = '<div class="builder-dropdown-empty">No matching threats</div>';
        } else {
            dropdown.innerHTML = filtered.map(t =>
                `<div class="builder-dropdown-item" data-id="${t.id}">${t.name} <span class="text-muted">(${DataLoader.normalizeSource(t.source)})</span></div>`
            ).join('');
        }

        dropdown.classList.remove('hidden');

        // Bind click handlers
        const searchInputId = variant === 'sidebar' ? 'builder-template-search-sidebar' : 'builder-template-search';
        dropdown.querySelectorAll('.builder-dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                ThreatBuilderState.loadTemplate(item.dataset.id);
                const searchEl = document.getElementById(searchInputId);
                if (searchEl) searchEl.value = '';
                dropdown.classList.add('hidden');
                this.refresh();
                // Close sidebar after picking a template on mobile
                if (variant === 'sidebar') document.body.classList.remove('sidebar-open');
            });
        });
    },

    // ===== Editor Rendering =====

    renderEditor() {
        const t = ThreatBuilderState.threat;
        if (!t) return;

        const editor = document.getElementById('builder-editor-sections');

        editor.innerHTML = `
            ${this.renderIdentitySection(t)}
            ${this.renderTierThreatSection(t)}
            ${this.renderKeywordsSection(t)}
            ${this.renderAttributesSection(t)}
            ${this.renderDefenceResilienceSection(t)}
            ${this.renderCombatStatsSection(t)}
            ${this.renderSkillsSection(t)}
            ${this.renderBonusesSection(t)}
            ${this.renderAbilitiesSection(t)}
            ${this.renderDeterminationSection(t)}
            ${this.renderBottomStatsSection(t)}
        `;

        this.bindEditorEvents();
    },

    renderIdentitySection(t) {
        return `
            <div class="builder-section">
                <div class="builder-section-header">Identity</div>
                <div class="builder-field-row">
                    <label>Name</label>
                    <input type="text" class="builder-input" data-field="name" value="${this.escapeAttr(t.name || '')}">
                </div>
                <div class="builder-field-row">
                    <label>Source</label>
                    <input type="text" class="builder-input" data-field="source" value="${this.escapeAttr(t.source || '')}">
                </div>
                <div class="builder-field-row">
                    <label>Quote</label>
                    <input type="text" class="builder-input" data-field="quote" value="${this.escapeAttr(t.quote || '')}">
                </div>
                <div class="builder-field-row">
                    <label>Attribution</label>
                    <input type="text" class="builder-input" data-field="attribution" value="${this.escapeAttr(t.attribution || '')}">
                </div>
                <div class="builder-field-row builder-field-row-full">
                    <label>Description</label>
                    <textarea class="builder-textarea" data-field="description" rows="3">${this.escapeHtml(t.description || '')}</textarea>
                </div>
            </div>
        `;
    },

    renderTierThreatSection(t) {
        const tt = t.tierThreat || {};
        const options = ['T', 'E', 'A', 'MC', '-'];
        const renderSelect = (tier) => {
            const val = tt[tier] || '-';
            return `
                <div class="builder-tier-select">
                    <label>Tier ${tier}</label>
                    <select class="builder-select" data-field="tierThreat.${tier}">
                        ${options.map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('')}
                    </select>
                </div>
            `;
        };

        return `
            <div class="builder-section">
                <div class="builder-section-header">Tier / Threat</div>
                <div class="builder-tier-row">
                    ${renderSelect('1')}${renderSelect('2')}${renderSelect('3')}${renderSelect('4')}${renderSelect('5')}
                </div>
            </div>
        `;
    },

    renderKeywordsSection(t) {
        const keywords = t.keywords || [];
        return `
            <div class="builder-section">
                <div class="builder-section-header">Keywords</div>
                <div class="builder-keywords">
                    ${keywords.map((kw, i) =>
                        `<span class="builder-keyword-tag">${this.escapeHtml(kw)}<button class="builder-keyword-remove" data-index="${i}">&times;</button></span>`
                    ).join('')}
                    <div class="builder-keyword-add">
                        <input type="text" class="builder-input builder-keyword-input" id="builder-keyword-input" placeholder="Add keyword...">
                        <button class="btn-builder-small" id="btn-add-keyword">+</button>
                    </div>
                </div>
            </div>
        `;
    },

    renderAttributesSection(t) {
        const attrs = t.attributes || {};
        const attrOrder = ['S', 'T', 'A', 'I', 'Wil', 'Int', 'Fel'];
        const attrNames = { 'S': 'STR', 'T': 'TOU', 'A': 'AGI', 'I': 'INI', 'Wil': 'WIL', 'Int': 'INT', 'Fel': 'FEL' };

        return `
            <div class="builder-section">
                <div class="builder-section-header">Attributes</div>
                <div class="builder-attributes-row">
                    ${attrOrder.map(attr => `
                        <div class="builder-attr">
                            <label>${attrNames[attr]}</label>
                            <input type="number" class="builder-input builder-attr-input" data-field="attributes.${attr}" value="${attrs[attr] ?? 1}" min="0">
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    renderDefenceResilienceSection(t) {
        const res = t.resilience || {};
        return `
            <div class="builder-section">
                <div class="builder-section-header">Defence & Resilience</div>
                <div class="builder-stats-row">
                    <div class="builder-stat-field">
                        <label>Defence</label>
                        <input type="number" class="builder-input" data-field="defence" value="${t.defence ?? 1}" min="0">
                    </div>
                    <div class="builder-stat-field">
                        <label>Defence Note</label>
                        <input type="text" class="builder-input" data-field="defenceNote" value="${this.escapeAttr(t.defenceNote || '')}">
                    </div>
                    <div class="builder-stat-field">
                        <label>Resilience</label>
                        <input type="number" class="builder-input" data-field="resilience.value" value="${res.value ?? 1}" min="0">
                    </div>
                    <div class="builder-stat-field">
                        <label>Resilience Note</label>
                        <input type="text" class="builder-input" data-field="resilience.note" value="${this.escapeAttr(res.note || '')}">
                    </div>
                </div>
            </div>
        `;
    },

    renderCombatStatsSection(t) {
        const shockValue = (t.shock === '-' || t.shock === 0) ? '-' : (t.shock ?? 1);
        return `
            <div class="builder-section">
                <div class="builder-section-header">Combat Stats</div>
                <div class="builder-stats-row">
                    <div class="builder-stat-field">
                        <label>Wounds</label>
                        <input type="number" class="builder-input" data-field="wounds" value="${t.wounds ?? 1}" min="1">
                    </div>
                    <div class="builder-stat-field">
                        <label>Shock (use - for none)</label>
                        <input type="text" class="builder-input" data-field="shock" value="${shockValue}">
                    </div>
                </div>
            </div>
        `;
    },

    renderSkillsSection(t) {
        const ps = t.parsedSkills || { default: 0, awareness: 0, passiveAwareness: 0, entries: [] };
        const entries = ps.entries || [];

        // Build dropdown options for each entry row, excluding already-used skills
        const usedSkills = new Set(entries.map(e => e.name));

        const renderEntryRow = (entry, index) => {
            const availableSkills = ThreatBuilderState.SKILL_NAMES.filter(
                s => s === entry.name || !usedSkills.has(s)
            );
            const options = availableSkills.map(s =>
                `<option value="${s}" ${s === entry.name ? 'selected' : ''}>${s}</option>`
            ).join('');
            return `
                <div class="builder-skill-entry" data-skill-index="${index}">
                    <select class="builder-select builder-skill-select" data-skill-index="${index}">${options}</select>
                    <input type="number" class="builder-input builder-skill-value" data-skill-index="${index}" value="${entry.value}" min="0">
                    <button class="btn-builder-mini builder-skill-remove" data-skill-index="${index}" title="Remove">&times;</button>
                </div>
            `;
        };

        return `
            <div class="builder-section">
                <div class="builder-section-header">Skills</div>
                <div class="builder-skills-fixed-row">
                    <div class="builder-stat-field">
                        <label>Default</label>
                        <input type="number" class="builder-input" data-skill="default" value="${ps.default}" min="0">
                    </div>
                    <div class="builder-stat-field">
                        <label>Awareness</label>
                        <input type="number" class="builder-input" data-skill="awareness" value="${ps.awareness}" min="0">
                    </div>
                    <div class="builder-stat-field">
                        <label>Passive Awareness</label>
                        <input type="number" class="builder-input" data-skill="passiveAwareness" value="${ps.passiveAwareness}" min="0">
                    </div>
                </div>
                <div class="builder-skills-entries">
                    ${entries.map((e, i) => renderEntryRow(e, i)).join('')}
                </div>
                <div class="builder-skills-add">
                    <button class="btn-builder-small" id="btn-add-skill">+ Add Skill</button>
                </div>
            </div>
        `;
    },

    renderAbilitiesSection(t) {
        const abilities = t.abilities || [];
        return `
            <div class="builder-section">
                <div class="builder-section-header">
                    Abilities
                    <button class="btn-builder-small" id="btn-add-ability">+ Add Ability</button>
                    <button class="btn-builder-small btn-builder-browse" id="btn-browse-abilities">Browse</button>
                </div>
                <div class="builder-abilities-list">
                    ${abilities.map((ab, i) => this.renderAbilityCard(ab, i, abilities.length)).join('')}
                    ${abilities.length === 0 ? '<div class="builder-empty-note">No abilities added</div>' : ''}
                </div>
            </div>
        `;
    },

    renderAbilityCard(ability, index, total) {
        const typeOptions = ThreatBuilderState.ABILITY_TYPES.map(type =>
            `<option value="${type}" ${ability.type === type ? 'selected' : ''}>${type}</option>`
        ).join('');

        return `
            <div class="builder-ability-card" data-index="${index}">
                <div class="builder-ability-controls">
                    <select class="builder-select builder-ability-type" data-index="${index}" data-afield="type">
                        ${typeOptions}
                    </select>
                    <div class="builder-ability-buttons">
                        <button class="btn-builder-mini builder-ability-up" data-index="${index}" ${index === 0 ? 'disabled' : ''} title="Move up">&uarr;</button>
                        <button class="btn-builder-mini builder-ability-down" data-index="${index}" ${index >= total - 1 ? 'disabled' : ''} title="Move down">&darr;</button>
                        <button class="btn-builder-mini builder-ability-remove" data-index="${index}" title="Remove">&times;</button>
                    </div>
                </div>
                <div class="builder-field-row">
                    <label>Name</label>
                    <input type="text" class="builder-input builder-ability-field" data-index="${index}" data-afield="name" value="${this.escapeAttr(ability.name || '')}">
                </div>
                <div class="builder-field-row builder-field-row-full">
                    <label>Description</label>
                    <textarea class="builder-textarea builder-ability-field" data-index="${index}" data-afield="description" rows="2">${this.escapeHtml(ability.description || '')}</textarea>
                </div>
                <div class="builder-field-row">
                    <label>Stats</label>
                    <input type="text" class="builder-input builder-ability-field" data-index="${index}" data-afield="stats" value="${this.escapeAttr(ability.stats || '')}" placeholder="Optional stats text">
                </div>
            </div>
        `;
    },

    renderBonusesSection(t) {
        const bonuses = t.bonuses || [];
        return `
            <div class="builder-section">
                <div class="builder-section-header">
                    Bonuses
                    <button class="btn-builder-small" id="btn-add-bonus">+ Add Bonus</button>
                    <button class="btn-builder-small btn-builder-browse" id="btn-browse-bonuses">Browse</button>
                </div>
                <div class="builder-bonuses-list">
                    ${bonuses.map((b, i) => this.renderBonusCard(b, i)).join('')}
                    ${bonuses.length === 0 ? '<div class="builder-empty-note">No bonuses added</div>' : ''}
                </div>
            </div>
        `;
    },

    renderBonusCard(bonus, index) {
        return `
            <div class="builder-bonus-card" data-index="${index}">
                <div class="builder-bonus-controls">
                    <button class="btn-builder-mini builder-bonus-remove" data-index="${index}" title="Remove">&times;</button>
                </div>
                <div class="builder-field-row">
                    <label>Name</label>
                    <input type="text" class="builder-input builder-bonus-field" data-index="${index}" data-bfield="name" value="${this.escapeAttr(bonus.name || '')}">
                </div>
                <div class="builder-field-row builder-field-row-full">
                    <label>Description</label>
                    <textarea class="builder-textarea builder-bonus-field" data-index="${index}" data-bfield="description" rows="2">${this.escapeHtml(bonus.description || '')}</textarea>
                </div>
            </div>
        `;
    },

    renderDeterminationSection(t) {
        return `
            <div class="builder-section">
                <div class="builder-section-header">Determination</div>
                <div class="builder-field-row builder-field-row-full">
                    <input type="text" class="builder-input" data-field="determination" value="${this.escapeAttr(t.determination || '')}" placeholder="e.g. 1d3+1 Shock">
                </div>
            </div>
        `;
    },

    renderBottomStatsSection(t) {
        const sizes = ['Tiny', 'Small', 'Average', 'Large', 'Huge', 'Gargantuan'];
        return `
            <div class="builder-section">
                <div class="builder-section-header">Additional Stats</div>
                <div class="builder-stats-row">
                    <div class="builder-stat-field">
                        <label>Conviction</label>
                        <input type="number" class="builder-input" data-field="conviction" value="${t.conviction ?? 0}" min="0">
                    </div>
                    <div class="builder-stat-field">
                        <label>Resolve</label>
                        <input type="number" class="builder-input" data-field="resolve" value="${t.resolve ?? 0}" min="0">
                    </div>
                    <div class="builder-stat-field">
                        <label>Speed</label>
                        <input type="number" class="builder-input" data-field="speed" value="${t.speed ?? 6}" min="0">
                    </div>
                    <div class="builder-stat-field">
                        <label>Speed Note</label>
                        <input type="text" class="builder-input" data-field="speedNote" value="${this.escapeAttr(t.speedNote || '')}" placeholder="e.g. Flight">
                    </div>
                    <div class="builder-stat-field">
                        <label>Size</label>
                        <select class="builder-select" data-field="size">
                            ${sizes.map(s => `<option value="${s}" ${t.size === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
        `;
    },

    // ===== Editor Event Binding =====

    bindEditorEvents() {
        const editor = document.getElementById('builder-editor-sections');

        // Generic field inputs (text, number, select)
        editor.querySelectorAll('[data-field]').forEach(el => {
            const event = (el.tagName === 'SELECT') ? 'change' : 'input';
            el.addEventListener(event, (e) => {
                const field = e.target.dataset.field;
                let value = e.target.value;

                // Handle numeric fields
                if (e.target.type === 'number') {
                    value = parseInt(value) || 0;
                }

                // Handle shock special case
                if (field === 'shock') {
                    value = value === '-' ? '-' : (parseInt(value) || 0);
                }

                ThreatBuilderState.updateField(field, value);
                this._debouncePreview();
            });
        });

        // Keyword add
        document.getElementById('btn-add-keyword')?.addEventListener('click', () => {
            const input = document.getElementById('builder-keyword-input');
            if (input.value.trim()) {
                ThreatBuilderState.addKeyword(input.value);
                this.refresh();
            }
        });

        // Keyword input - Enter key
        document.getElementById('builder-keyword-input')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const input = e.target;
                if (input.value.trim()) {
                    ThreatBuilderState.addKeyword(input.value);
                    this.refresh();
                }
            }
        });

        // Keyword remove
        editor.querySelectorAll('.builder-keyword-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                ThreatBuilderState.removeKeyword(parseInt(btn.dataset.index));
                this.refresh();
            });
        });

        // Add ability button
        document.getElementById('btn-add-ability')?.addEventListener('click', () => {
            ThreatBuilderState.addAbility({ type: 'ACTION', name: '', description: '', stats: '' });
            this.refresh();
        });

        // Browse abilities button
        document.getElementById('btn-browse-abilities')?.addEventListener('click', () => {
            this.openAbilityPicker();
        });

        // Ability field changes
        editor.querySelectorAll('.builder-ability-field, .builder-ability-type').forEach(el => {
            const event = (el.tagName === 'SELECT') ? 'change' : 'input';
            el.addEventListener(event, (e) => {
                const index = parseInt(e.target.dataset.index);
                const field = e.target.dataset.afield;
                ThreatBuilderState.updateAbility(index, field, e.target.value);
                this._debouncePreview();
            });
        });

        // Ability remove buttons
        editor.querySelectorAll('.builder-ability-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                ThreatBuilderState.removeAbility(parseInt(btn.dataset.index));
                this.refresh();
            });
        });

        // Ability up/down buttons
        editor.querySelectorAll('.builder-ability-up').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                ThreatBuilderState.reorderAbility(idx, idx - 1);
                this.refresh();
            });
        });

        editor.querySelectorAll('.builder-ability-down').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index);
                ThreatBuilderState.reorderAbility(idx, idx + 1);
                this.refresh();
            });
        });

        // Add bonus button
        document.getElementById('btn-add-bonus')?.addEventListener('click', () => {
            ThreatBuilderState.addBonus({ name: '', description: '' });
            this.refresh();
        });

        // Browse bonuses button
        document.getElementById('btn-browse-bonuses')?.addEventListener('click', () => {
            this.openBonusPicker();
        });

        // Bonus field changes
        editor.querySelectorAll('.builder-bonus-field').forEach(el => {
            const event = (el.tagName === 'SELECT') ? 'change' : 'input';
            el.addEventListener(event, (e) => {
                const index = parseInt(e.target.dataset.index);
                const field = e.target.dataset.bfield;
                ThreatBuilderState.updateBonus(index, field, e.target.value);
                this._debouncePreview();
            });
        });

        // Bonus remove buttons
        editor.querySelectorAll('.builder-bonus-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                ThreatBuilderState.removeBonus(parseInt(btn.dataset.index));
                this.refresh();
            });
        });

        // ===== Skills Section =====

        // Fixed skill fields (Default, Awareness, Passive Awareness)
        editor.querySelectorAll('[data-skill]').forEach(el => {
            el.addEventListener('input', (e) => {
                const skill = e.target.dataset.skill;
                const value = parseInt(e.target.value) || 0;
                if (skill === 'default') {
                    ThreatBuilderState.updateDefaultSkill(value);
                } else if (skill === 'awareness') {
                    ThreatBuilderState.updateAwarenessSkill(value);
                } else if (skill === 'passiveAwareness') {
                    ThreatBuilderState.updatePassiveAwareness(value);
                }
                this._debouncePreview();
            });
        });

        // Skill entry dropdown changes
        editor.querySelectorAll('.builder-skill-select').forEach(el => {
            el.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.skillIndex);
                const valueInput = editor.querySelector(`.builder-skill-value[data-skill-index="${index}"]`);
                const value = valueInput ? parseInt(valueInput.value) || 0 : 0;
                ThreatBuilderState.updateSkillEntry(index, e.target.value, value);
                this.refresh();
            });
        });

        // Skill entry value changes
        editor.querySelectorAll('.builder-skill-value').forEach(el => {
            el.addEventListener('input', (e) => {
                const index = parseInt(e.target.dataset.skillIndex);
                const selectEl = editor.querySelector(`.builder-skill-select[data-skill-index="${index}"]`);
                const name = selectEl ? selectEl.value : '';
                ThreatBuilderState.updateSkillEntry(index, name, parseInt(e.target.value) || 0);
                this._debouncePreview();
            });
        });

        // Add skill button
        document.getElementById('btn-add-skill')?.addEventListener('click', () => {
            // Pick the first unused skill
            const usedSkills = new Set((ThreatBuilderState.threat.parsedSkills.entries || []).map(e => e.name));
            const available = ThreatBuilderState.SKILL_NAMES.filter(s => !usedSkills.has(s));
            const name = available.length > 0 ? available[0] : '';
            ThreatBuilderState.addSkillEntry(name, 0);
            this.refresh();
        });

        // Remove skill entry buttons
        editor.querySelectorAll('.builder-skill-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                ThreatBuilderState.removeSkillEntry(parseInt(btn.dataset.skillIndex));
                this.refresh();
            });
        });
    },

    // ===== Preview =====

    _debouncePreview() {
        clearTimeout(this._previewTimer);
        this._previewTimer = setTimeout(() => this.renderPreview(), 300);
    },

    renderPreview() {
        const container = document.getElementById('builder-preview-content');
        if (!container) return;

        const threatData = ThreatBuilderState.getThreatData();

        if (!threatData.name && (!threatData.abilities || threatData.abilities.length === 0)) {
            container.innerHTML = `
                <div class="threat-detail-placeholder">
                    <p>Edit threat details to see a preview</p>
                </div>
            `;
            return;
        }

        // Reuse ThreatsTab.renderThreatCard for the preview, but without encounter controls
        const html = this.renderPreviewCard(threatData);
        container.innerHTML = html;

        // Enhance glossary terms
        Glossary.enhanceDescriptions(container);
    },

    renderPreviewCard(threat) {
        // Simplified version of ThreatsTab.renderThreatCard without encounter buttons
        const tierThreatTable = ThreatsTab.renderTierThreatTable(threat.tierThreat);
        const keywordsHtml = (threat.keywords || []).map(kw =>
            `<span class="threat-keyword">${kw}</span>`
        ).join('');
        const attributesTable = ThreatsTab.renderAttributesTable(threat.attributes);
        const resilienceHtml = ThreatsTab.renderResilienceRow(threat);
        const combatStatsTable = ThreatsTab.renderCombatStatsTable(threat);
        const skillsHtml = ThreatsTab.renderSkillsRow(threat.skills);
        const abilitiesHtml = ThreatsTab.renderAbilities(threat.abilities, null);
        const bonusesHtml = ThreatsTab.renderBonuses(threat.bonuses);
        const determinationHtml = ThreatsTab.renderDeterminationRow(threat.determination);
        const bottomStatsTable = ThreatsTab.renderBottomStatsTable(threat);

        return `
            <div class="threat-card">
                <div class="threat-card-header">
                    <h2 class="threat-card-title">${threat.name || '(Unnamed Threat)'}</h2>
                    ${threat.source ? `<span class="threat-card-source">${DataLoader.formatSourcePage(threat)}</span>` : ''}
                    ${threat.quote ? `
                        <p class="threat-card-quote">${threat.quote}</p>
                        ${threat.attribution ? `<p class="threat-card-attribution">&mdash;${threat.attribution}</p>` : ''}
                    ` : ''}
                </div>
                <div class="threat-card-body">
                    ${threat.description ? `
                        <div class="threat-card-description">${threat.description}</div>
                    ` : ''}
                    <div class="threat-stats-section">
                        ${tierThreatTable}
                        <div class="threat-keywords-row">
                            <span class="threat-keywords-label">KEYWORDS:</span>
                            ${keywordsHtml}
                        </div>
                        ${attributesTable}
                        ${resilienceHtml}
                        ${combatStatsTable}
                        ${skillsHtml}
                        <div class="abilities-section">
                            <div class="abilities-header">Abilities</div>
                            ${abilitiesHtml}
                        </div>
                        ${bonusesHtml}
                        ${determinationHtml}
                        ${bottomStatsTable}
                    </div>
                </div>
            </div>
        `;
    },

    // ===== Ability/Bonus Picker Modals =====

    openAbilityPicker() {
        this._openPicker('ability');
    },

    openBonusPicker() {
        this._openPicker('bonus');
    },

    _openPicker(mode) {
        // Remove any existing picker
        const existing = document.querySelector('.ability-picker-overlay');
        if (existing) existing.remove();

        // Reset sort state
        this._pickerSort = { field: null, asc: true };

        const overlay = document.createElement('div');
        overlay.className = 'ability-picker-overlay';

        if (mode === 'ability') {
            overlay.innerHTML = this.renderAbilityPickerContent();
        } else {
            overlay.innerHTML = this.renderBonusPickerContent();
        }

        document.body.appendChild(overlay);

        // Bind close button
        overlay.querySelector('.ability-picker-close').addEventListener('click', () => {
            overlay.remove();
        });

        // Click backdrop to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        // Bind search
        const searchInput = overlay.querySelector('.ability-picker-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                if (mode === 'ability') {
                    this.filterAbilityPicker(overlay, searchInput.value);
                } else {
                    this.filterBonusPicker(overlay, searchInput.value);
                }
            });
            searchInput.focus();
        }

        // Bind type filter tabs (ability mode only)
        if (mode === 'ability') {
            overlay.querySelectorAll('.ability-picker-type-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    overlay.querySelectorAll('.ability-picker-type-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.filterAbilityPicker(overlay, searchInput?.value || '');
                });
            });
        }

        // Bind column sort headers
        this._bindColumnSortHandlers(overlay, mode, searchInput);

        // Bind import buttons
        this.bindPickerImportButtons(overlay, mode);
    },

    renderAbilityPickerContent() {
        const types = ThreatBuilderState.ABILITY_TYPES;
        return `
            <div class="ability-picker-modal">
                <div class="ability-picker-header">
                    <h3>Browse Abilities</h3>
                    <button class="ability-picker-close">&times;</button>
                </div>
                <div class="ability-picker-filters">
                    <input type="text" class="ability-picker-search" placeholder="Search abilities...">
                    <div class="ability-picker-types">
                        <button class="ability-picker-type-btn active" data-type="ALL">ALL</button>
                        ${types.map(t => `<button class="ability-picker-type-btn" data-type="${t}">${t}</button>`).join('')}
                    </div>
                </div>
                <div class="ability-picker-columns">
                    <span class="picker-col-type">Type</span>
                    <span class="picker-col-name picker-col-sortable" data-sort="name">Name ${this._sortIndicator('name')}</span>
                    <span class="picker-col-threat picker-col-sortable" data-sort="threat">Threat ${this._sortIndicator('threat')}</span>
                </div>
                <div class="ability-picker-list">
                    ${this.renderAbilityPickerItems('ALL', '')}
                </div>
            </div>
        `;
    },

    renderAbilityPickerItems(typeFilter, searchFilter) {
        const searchLower = searchFilter.toLowerCase();
        let items = [];

        if (typeFilter === 'ALL') {
            ThreatBuilderState.ABILITY_TYPES.forEach(type => {
                items = items.concat(ThreatBuilderState.getAbilitiesByType(type));
            });
        } else {
            items = ThreatBuilderState.getAbilitiesByType(typeFilter);
        }

        if (searchLower) {
            items = items.filter(item =>
                item.ability.name.toLowerCase().includes(searchLower) ||
                (item.ability.description && item.ability.description.toLowerCase().includes(searchLower)) ||
                item.threatName.toLowerCase().includes(searchLower)
            );
        }

        // Apply sorting
        this._sortItems(items, 'ability');

        if (items.length === 0) {
            return '<div class="ability-picker-empty">No matching abilities found</div>';
        }

        const countHtml = `<div class="ability-picker-count">${items.length} abilities</div>`;

        return countHtml + items.map((item, i) => {
            // Build description, including weapon stats for ACTIONs
            let descText = '';
            if (item.ability.type === 'ACTION' && item.ability.weaponId) {
                const weapon = DataLoader.getThreatWeapon(item.ability.weaponId);
                if (weapon) {
                    descText = this.formatWeaponStats(weapon);
                    if (item.ability.description) {
                        descText += ' — ' + this.stripHtml(item.ability.description);
                    }
                } else if (item.ability.stats) {
                    descText = item.ability.stats;
                    if (item.ability.description) {
                        descText += ' — ' + this.stripHtml(item.ability.description);
                    }
                } else if (item.ability.description) {
                    descText = this.stripHtml(item.ability.description);
                }
            } else if (item.ability.stats) {
                descText = item.ability.stats;
                if (item.ability.description) {
                    descText += ' — ' + this.stripHtml(item.ability.description);
                }
            } else if (item.ability.description) {
                descText = this.stripHtml(item.ability.description);
            }

            return `
                <div class="ability-picker-item" data-picker-index="${i}">
                    <div class="ability-picker-item-header">
                        <span class="ability-picker-item-type">${item.ability.type}</span>
                        <span class="ability-picker-item-name">${item.ability.name}</span>
                        <span class="ability-picker-item-threat">${item.threatName}</span>
                        <button class="btn-builder-small ability-picker-import" data-type="${item.ability.type}" data-name="${this.escapeAttr(item.ability.name)}" data-desc="${this.escapeAttr(item.ability.description || '')}" data-stats="${this.escapeAttr(item.ability.stats || '')}">Import</button>
                    </div>
                    ${descText ? `<div class="ability-picker-item-desc">${this.truncate(descText, 150)}</div>` : ''}
                </div>
            `;
        }).join('');
    },

    filterAbilityPicker(overlay, searchText) {
        const activeType = overlay.querySelector('.ability-picker-type-btn.active')?.dataset.type || 'ALL';
        const list = overlay.querySelector('.ability-picker-list');
        list.innerHTML = this.renderAbilityPickerItems(activeType, searchText);
        this.bindPickerImportButtons(overlay, 'ability');
        this._updateColumnHeaders(overlay);
    },

    renderBonusPickerContent() {
        return `
            <div class="ability-picker-modal">
                <div class="ability-picker-header">
                    <h3>Browse Bonuses</h3>
                    <button class="ability-picker-close">&times;</button>
                </div>
                <div class="ability-picker-filters">
                    <input type="text" class="ability-picker-search" placeholder="Search bonuses...">
                </div>
                <div class="ability-picker-columns">
                    <span class="picker-col-name picker-col-sortable" data-sort="name">Name ${this._sortIndicator('name')}</span>
                    <span class="picker-col-threat picker-col-sortable" data-sort="threat">Threat ${this._sortIndicator('threat')}</span>
                </div>
                <div class="ability-picker-list">
                    ${this.renderBonusPickerItems('')}
                </div>
            </div>
        `;
    },

    renderBonusPickerItems(searchFilter) {
        const searchLower = searchFilter.toLowerCase();
        let items = ThreatBuilderState.getAllBonuses();

        if (searchLower) {
            items = items.filter(item =>
                item.bonus.name.toLowerCase().includes(searchLower) ||
                (item.bonus.description && item.bonus.description.toLowerCase().includes(searchLower)) ||
                item.threatName.toLowerCase().includes(searchLower)
            );
        }

        // Apply sorting
        this._sortItems(items, 'bonus');

        if (items.length === 0) {
            return '<div class="ability-picker-empty">No matching bonuses found</div>';
        }

        const countHtml = `<div class="ability-picker-count">${items.length} bonuses</div>`;

        return countHtml + items.map((item, i) => `
            <div class="ability-picker-item" data-picker-index="${i}">
                <div class="ability-picker-item-header">
                    <span class="ability-picker-item-type">BONUS</span>
                    <span class="ability-picker-item-name">${item.bonus.name}</span>
                    <span class="ability-picker-item-threat">${item.threatName}</span>
                    <button class="btn-builder-small ability-picker-import" data-bname="${this.escapeAttr(item.bonus.name)}" data-bdesc="${this.escapeAttr(item.bonus.description || '')}">Import</button>
                </div>
                ${item.bonus.description ? `<div class="ability-picker-item-desc">${this.truncate(this.stripHtml(item.bonus.description), 120)}</div>` : ''}
            </div>
        `).join('');
    },

    filterBonusPicker(overlay, searchText) {
        const list = overlay.querySelector('.ability-picker-list');
        list.innerHTML = this.renderBonusPickerItems(searchText);
        this.bindPickerImportButtons(overlay, 'bonus');
        this._updateColumnHeaders(overlay);
    },

    bindPickerImportButtons(overlay, mode) {
        overlay.querySelectorAll('.ability-picker-import').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (mode === 'ability') {
                    ThreatBuilderState.addAbility({
                        type: btn.dataset.type,
                        name: btn.dataset.name,
                        description: btn.dataset.desc,
                        stats: btn.dataset.stats
                    });
                } else {
                    ThreatBuilderState.addBonus({
                        name: btn.dataset.bname,
                        description: btn.dataset.bdesc
                    });
                }
                // Visual feedback
                btn.textContent = 'Imported!';
                btn.disabled = true;
                setTimeout(() => {
                    btn.textContent = 'Import';
                    btn.disabled = false;
                }, 1000);
                this.refresh();
            });
        });
    },

    // ===== Inject Modal (rename prompt) =====

    showInjectModal(defaultName, defaultCount) {
        // Remove any existing modal
        const existing = document.querySelector('.inject-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'inject-modal-overlay';
        overlay.innerHTML = `
            <div class="inject-modal">
                <div class="inject-modal-header">
                    <h3>Add to Encounter</h3>
                    <button class="inject-modal-close">&times;</button>
                </div>
                <div class="inject-modal-body">
                    <p class="inject-modal-warning">A threat named "${this.escapeHtml(defaultName)}" with different stats already exists in the encounter. Rename this variant to avoid confusion.</p>
                    <div class="inject-modal-field">
                        <label>Name</label>
                        <input type="text" id="inject-modal-name" class="builder-input" value="${this.escapeAttr(defaultName)}">
                    </div>
                    <div class="inject-modal-field">
                        <label>Count</label>
                        <input type="number" id="inject-modal-count" class="builder-input" value="${defaultCount}" min="1" max="20">
                    </div>
                </div>
                <div class="inject-modal-footer">
                    <button class="btn-action" id="inject-modal-cancel">Cancel</button>
                    <button class="btn-action btn-action-primary" id="inject-modal-add">Add</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Bind events
        overlay.querySelector('.inject-modal-close').addEventListener('click', () => overlay.remove());
        overlay.querySelector('#inject-modal-cancel').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });

        overlay.querySelector('#inject-modal-add').addEventListener('click', () => {
            const newName = document.getElementById('inject-modal-name').value.trim();
            const count = parseInt(document.getElementById('inject-modal-count').value) || 1;
            if (!newName) return;

            const result = ThreatBuilderState.injectIntoEncounter(count, newName);
            overlay.remove();

            if (result.success) {
                const msg = result.count > 1
                    ? `${result.count}x "${result.name}" added to the encounter!`
                    : `"${result.name}" added to the encounter!`;
                this.showNotification(msg);
                // Refresh editor to show updated name
                this.renderEditor();
                this.renderPreview();
            } else {
                this.showNotification('Error: ' + result.error);
            }
        });

        // Focus and select the name input
        const nameInput = document.getElementById('inject-modal-name');
        nameInput.focus();
        nameInput.select();
    },

    // ===== Notification =====

    showNotification(message) {
        const existing = document.querySelector('.builder-notification');
        if (existing) existing.remove();

        const notification = document.createElement('div');
        notification.className = 'builder-notification';
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    },

    // ===== Picker Sorting =====

    _sortItems(items, itemType) {
        const { field, asc } = this._pickerSort;
        if (!field) return;

        const dir = asc ? 1 : -1;
        items.sort((a, b) => {
            let aVal, bVal;
            if (field === 'name') {
                aVal = (itemType === 'ability' ? a.ability.name : a.bonus.name).toLowerCase();
                bVal = (itemType === 'ability' ? b.ability.name : b.bonus.name).toLowerCase();
            } else {
                aVal = a.threatName.toLowerCase();
                bVal = b.threatName.toLowerCase();
            }
            if (aVal < bVal) return -1 * dir;
            if (aVal > bVal) return 1 * dir;
            return 0;
        });
    },

    _sortIndicator(field) {
        if (this._pickerSort.field !== field) return '';
        return this._pickerSort.asc ? ' ▲' : ' ▼';
    },

    _bindColumnSortHandlers(overlay, mode, searchInput) {
        overlay.querySelectorAll('.picker-col-sortable').forEach(col => {
            col.addEventListener('click', () => {
                const sortField = col.dataset.sort;
                if (this._pickerSort.field === sortField) {
                    this._pickerSort.asc = !this._pickerSort.asc;
                } else {
                    this._pickerSort.field = sortField;
                    this._pickerSort.asc = true;
                }
                const search = searchInput?.value || '';
                if (mode === 'ability') {
                    this.filterAbilityPicker(overlay, search);
                } else {
                    this.filterBonusPicker(overlay, search);
                }
            });
        });
    },

    _updateColumnHeaders(overlay) {
        overlay.querySelectorAll('.picker-col-sortable').forEach(col => {
            const field = col.dataset.sort;
            const label = field === 'name' ? 'Name' : 'Threat';
            col.textContent = label + this._sortIndicator(field);
        });
    },

    formatWeaponStats(weapon) {
        const parts = [];
        if (weapon.damage !== undefined) parts.push(`${weapon.damage}`);
        if (weapon.ed !== undefined) parts.push(`+${weapon.ed} ED`);
        if (weapon.ap !== undefined && weapon.ap !== 0) parts.push(`AP ${weapon.ap}`);
        if (weapon.range) parts.push(`Range ${weapon.range}`);
        if (weapon.salvo) parts.push(`Salvo ${weapon.salvo}`);

        let result = parts.join(' / ');
        if (weapon.traits && weapon.traits.length > 0) {
            result += ` [${weapon.traits.join(', ')}]`;
        }
        return result;
    },

    // ===== Utilities =====

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    escapeAttr(text) {
        return String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    stripHtml(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    },

    truncate(text, maxLen) {
        if (text.length <= maxLen) return text;
        return text.substring(0, maxLen) + '...';
    }
};
