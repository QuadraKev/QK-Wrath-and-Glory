// Threats Tab - Displays threat list and detail view

const ThreatsTab = {
    selectedThreatId: null,
    _searchTimer: null,
    filters: {
        search: '',
        selectedTier: 'all',
        threatLevel: 'all',                        // single-selection: 'all', 'T', 'E', or 'A'
        factions: new Set()                        // inclusive: empty = show all
    },

    init() {
        // Initialize search
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', (e) => {
            this.filters.search = e.target.value;
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => this.renderThreatList(), 300);
        });

        // Initialize tier filter dropdown
        const tierFilter = document.getElementById('tier-filter');
        tierFilter.addEventListener('change', (e) => {
            this.filters.selectedTier = e.target.value;
            this.renderThreatList();
        });

        // Initialize clear filters button
        document.getElementById('btn-clear-filters').addEventListener('click', () => {
            this.clearFilters();
        });

        // Populate filter button groups
        this.populateThreatLevelFilters();
        this.populateFactionFilters();

        // Render initial threat list
        this.renderThreatList();
    },

    refresh() {
        this.renderThreatList();
        if (this.selectedThreatId) {
            this.renderThreatDetail(this.selectedThreatId);
        }
    },

    // Threat Level: single-selection radio-style with "All" button.
    populateThreatLevelFilters() {
        const container = document.getElementById('threat-level-filters');
        const levels = [
            { key: 'all', label: 'All' },
            { key: 'T', label: 'Troops' },
            { key: 'E', label: 'Elites' },
            { key: 'A', label: 'Adversaries' }
        ];

        container.innerHTML = levels.map(l =>
            `<button class="filter-btn ${this.filters.threatLevel === l.key ? 'active' : ''}" data-level="${l.key}">${l.label}</button>`
        ).join('');

        container.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.filters.threatLevel = btn.dataset.level;
                container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.renderThreatList();
            });
        });
    },

    // Faction: inclusive filter with "All" button. Empty set = show all.
    populateFactionFilters() {
        const factions = DataLoader.getAllFactions();
        const container = document.getElementById('faction-filters');

        container.innerHTML = `<button class="filter-btn ${this.filters.factions.size === 0 ? 'active' : ''}" data-faction="all">All</button>` +
            factions.map(faction =>
                `<button class="filter-btn ${this.filters.factions.has(faction) ? 'active' : ''}" data-faction="${faction}">${faction}</button>`
            ).join('');

        container.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const faction = btn.dataset.faction;
                if (faction === 'all') {
                    this.filters.factions.clear();
                } else {
                    if (this.filters.factions.has(faction)) {
                        this.filters.factions.delete(faction);
                    } else {
                        this.filters.factions.add(faction);
                    }
                }
                this._updateFactionButtonStates(container);
                this.renderThreatList();
            });
        });
    },

    _updateFactionButtonStates(container) {
        const allBtn = container.querySelector('[data-faction="all"]');
        const isAll = this.filters.factions.size === 0;
        allBtn.classList.toggle('active', isAll);
        container.querySelectorAll('.filter-btn:not([data-faction="all"])').forEach(btn => {
            btn.classList.toggle('active', this.filters.factions.has(btn.dataset.faction));
        });
    },

    clearFilters() {
        this.filters.search = '';
        this.filters.selectedTier = 'all';
        this.filters.threatLevel = 'all';
        this.filters.factions.clear();
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = '';
        const tierFilter = document.getElementById('tier-filter');
        if (tierFilter) tierFilter.value = 'all';
        this.populateThreatLevelFilters();
        this.populateFactionFilters();
        this.renderThreatList();
    },

    renderThreatList() {
        let threats = DataLoader.filterThreats({
            search: this.filters.search,
            selectedTier: this.filters.selectedTier !== 'all' ? this.filters.selectedTier : null,
            threatLevels: this.filters.threatLevel !== 'all' ? [this.filters.threatLevel] : null,
            factions: this.filters.factions.size > 0 ? [...this.filters.factions] : null,
            excludedSources: SettingsTab.excludedSources.size > 0 ? [...SettingsTab.excludedSources] : null
        });

        // Sort threats alphabetically by name
        threats = threats.sort((a, b) => a.name.localeCompare(b.name));

        // Update threat count display
        const totalCount = DataLoader.getAllThreats().length;
        const filteredCount = threats.length;
        const countEl = document.getElementById('threat-count');
        if (filteredCount === totalCount) {
            countEl.textContent = `${totalCount} Threats`;
        } else {
            countEl.textContent = `${filteredCount} of ${totalCount} Threats`;
        }

        const container = document.getElementById('threat-list');

        if (threats.length === 0) {
            container.innerHTML = `
                <div class="threat-list-empty">
                    <p>No threats match your filters</p>
                </div>
            `;
            return;
        }

        container.innerHTML = threats.map(threat => {
            const tierBadges = this.renderTierBadges(threat.tierThreat, this.filters.selectedTier);
            const keywords = threat.keywords || [];

            return `
                <div class="threat-list-item ${this.selectedThreatId === threat.id ? 'selected' : ''}"
                     data-threat-id="${threat.id}">
                    <div class="threat-list-header">
                        <span class="threat-list-name">${threat.name}</span>
                        <div class="threat-list-level">${tierBadges}</div>
                    </div>
                    <div class="threat-list-keywords">
                        ${keywords.map(kw => `<span class="threat-list-keyword">${kw}</span>`).join('')}
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers
        container.querySelectorAll('.threat-list-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectThreat(item.dataset.threatId);
            });
        });
    },

    renderTierBadges(tierThreat, selectedTier = 'all') {
        if (!tierThreat) return '';

        if (selectedTier && selectedTier !== 'all') {
            // Show only the selected tier's threat level
            const level = tierThreat[selectedTier];
            if (level) {
                return `<span class="threat-tier-badge">${level}</span>`;
            }
            return '';
        }

        // Show unique threat levels across all tiers
        const levels = new Set(Object.values(tierThreat));
        return Array.from(levels).map(level =>
            `<span class="threat-tier-badge">${level}</span>`
        ).join('');
    },

    selectThreat(threatId) {
        this.selectedThreatId = threatId;

        // Update URL hash without triggering hashchange
        history.replaceState(null, '', '#threats/' + threatId);

        // Update list selection
        document.querySelectorAll('.threat-list-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.threatId === threatId);
        });

        // Scroll selected item into view in the list
        const selectedItem = document.querySelector('.threat-list-item.selected');
        if (selectedItem) {
            selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // Render detail — use bottom sheet on mobile
        if (window.innerWidth <= 768) {
            BottomSheet.open(
                div => this.renderThreatDetail(threatId, div),
                () => {
                    this.selectedThreatId = null;
                    document.querySelectorAll('.threat-list-item.selected')
                        .forEach(el => el.classList.remove('selected'));
                    history.replaceState(null, '', ' ');
                }
            );
        } else {
            this.renderThreatDetail(threatId);
        }
    },

    renderThreatDetail(threatId, container = null) {
        const threat = DataLoader.getThreat(threatId);
        const el = container || document.getElementById('threat-detail');
        if (!el) return;

        if (!threat) {
            el.innerHTML = `
                <div class="threat-detail-placeholder">
                    <p>Threat not found</p>
                </div>
            `;
            return;
        }

        el.innerHTML = this.renderThreatCard(threat);

        // Enhance glossary terms
        Glossary.enhanceDescriptions(el);

        // Attach keyword click handlers
        el.querySelectorAll('.threat-keyword').forEach(kw => {
            kw.addEventListener('click', (e) => {
                const keyword = e.target.textContent;
                this.showKeywordPopup(keyword, e.target);
            });
        });

        // Attach add to encounter handlers
        this.bindAddToEncounterEvents(el, threatId);

        // Attach copy handler
        const copyBtn = el.querySelector('#btn-copy-threat');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const text = this.buildThreatCopyText(threat);
                navigator.clipboard.writeText(text).then(() => {
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
                });
            });
        }

        // Attach customize handler
        const customizeBtn = el.querySelector('#btn-customize-threat');
        if (customizeBtn) {
            customizeBtn.addEventListener('click', () => {
                this.customizeThreat(threatId);
            });
        }
    },

    bindAddToEncounterEvents(container, threatId) {
        const addBtn = container.querySelector('#threat-add-to-encounter-btn');
        const quantityInput = container.querySelector('#threat-add-quantity');
        const mobCheckbox = container.querySelector('#threat-add-as-mob');
        const mobLabel = container.querySelector('#threat-mob-label');

        if (!addBtn) return;

        const threat = DataLoader.getThreat(threatId);
        const canEverBeMob = EncounterState.canEverBeMob(threat);

        // Update mob checkbox visibility based on whether threat can ever be a mob and quantity
        const updateMobVisibility = () => {
            const quantity = parseInt(quantityInput.value) || 1;
            if (canEverBeMob && quantity > 1) {
                mobLabel.classList.remove('hidden');
            } else {
                mobLabel.classList.add('hidden');
                mobCheckbox.checked = false;
            }
        };

        quantityInput.addEventListener('input', updateMobVisibility);
        updateMobVisibility();

        // Add to encounter button
        addBtn.addEventListener('click', () => {
            const quantity = parseInt(quantityInput.value) || 1;
            const asMob = mobCheckbox.checked && canEverBeMob && quantity > 1;

            const ids = EncounterState.addIndividual(threatId, quantity, asMob);

            if (ids.length > 0) {
                // Show confirmation
                const mobText = asMob ? ' as a mob' : '';
                this.showAddedNotification(`Added ${quantity}x ${threat.name}${mobText} to encounter`);

                // Reset quantity
                quantityInput.value = '1';
                mobCheckbox.checked = false;
                updateMobVisibility();
            }
        });
    },

    showAddedNotification(message) {
        // Remove any existing notification
        const existing = document.querySelector('.add-notification');
        if (existing) existing.remove();

        // Create notification
        const notification = document.createElement('div');
        notification.className = 'add-notification';
        notification.textContent = message;
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => notification.classList.add('show'), 10);

        // Remove after 2 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    },

    customizeThreat(threatId) {
        if (!ThreatBuilderState.isEmpty()) {
            if (!confirm('The Threat Builder already has content. Sending this threat to the builder will replace it. Continue?')) {
                return;
            }
        }
        ThreatBuilderState.loadTemplate(threatId);
        App.switchTab('builder');
        ThreatBuilderTab.refresh();
    },

    renderThreatCard(threat) {
        // Build tier/threat table
        const tierThreatTable = this.renderTierThreatTable(threat.tierThreat);

        // Build keywords row
        const keywordsHtml = (threat.keywords || []).map(kw =>
            `<span class="threat-keyword">${kw}</span>`
        ).join('');

        // Build attributes table
        const attributesTable = this.renderAttributesTable(threat.attributes);

        // Build resilience row
        const resilienceHtml = this.renderResilienceRow(threat);

        // Build combat stats table
        const combatStatsTable = this.renderCombatStatsTable(threat);

        // Build skills row
        const skillsHtml = this.renderSkillsRow(threat.skills);

        // Build abilities section
        const abilitiesHtml = this.renderAbilities(threat.abilities);

        // Build bonuses section
        const bonusesHtml = this.renderBonuses(threat.bonuses);

        // Build determination row
        const determinationHtml = this.renderDeterminationRow(threat.determination);

        // Build bottom stats table
        const bottomStatsTable = this.renderBottomStatsTable(threat);

        // Build add to encounter controls (for header)
        const addToEncounterHtml = this.renderAddToEncounterHeader(threat);

        return `
            <div class="threat-card">
                <div class="threat-card-header">
                    <div class="threat-card-header-top">
                        <h2 class="threat-card-title">${threat.name}</h2>
                        <div class="threat-card-header-actions">
                            <button class="btn-copy" id="btn-copy-threat">Copy</button>
                            <button class="btn-copy" id="btn-customize-threat">Customize</button>
                            ${addToEncounterHtml}
                        </div>
                    </div>
                    ${threat.quote ? `
                        <p class="threat-card-quote">${threat.quote}</p>
                        ${threat.attribution ? `<p class="threat-card-attribution">—${threat.attribution}</p>` : ''}
                    ` : ''}
                    ${threat.source ? `<span class="threat-card-source">${DataLoader.formatSourcePage(threat)}</span>` : ''}
                </div>
                <div class="threat-card-body">
                    ${threat.description ? `
                        <div class="threat-card-description">
                            ${threat.description}
                        </div>
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

    renderAddToEncounterHeader(threat) {
        return `
            <div class="add-to-encounter-header-controls">
                <div class="add-to-encounter-row">
                    <input type="number" id="threat-add-quantity" class="header-quantity" value="1" min="1" max="20" title="Quantity">
                    <button id="threat-add-to-encounter-btn" class="header-add-btn" data-threat-id="${threat.id}">
                        + Add
                    </button>
                </div>
                <label class="header-mob-checkbox hidden" id="threat-mob-label">
                    <input type="checkbox" id="threat-add-as-mob">
                    <span>Add as Mob</span>
                </label>
            </div>
        `;
    },

    renderTierThreatTable(tierThreat) {
        if (!tierThreat) return '';

        const tiers = Object.keys(tierThreat).sort((a, b) => parseInt(a) - parseInt(b));

        return `
            <table class="threat-stat-table tier-threat-table">
                <thead>
                    <tr>
                        <th>Tier</th>
                        ${tiers.map(t => `<th>${t}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Threat</td>
                        ${tiers.map(t => `<td class="stat-value">${tierThreat[t]}</td>`).join('')}
                    </tr>
                </tbody>
            </table>
        `;
    },

    renderAttributesTable(attributes) {
        if (!attributes) return '';

        const attrOrder = ['S', 'T', 'A', 'I', 'Wil', 'Int', 'Fel'];
        const attrNames = {
            'S': 'STR', 'T': 'TOU', 'A': 'AGI', 'I': 'INI',
            'Wil': 'WIL', 'Int': 'INT', 'Fel': 'FEL'
        };

        return `
            <table class="threat-stat-table attributes-table">
                <thead>
                    <tr>
                        ${attrOrder.map(attr => `<th>${attrNames[attr]}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        ${attrOrder.map(attr => `<td class="stat-value">${attributes[attr] || '-'}</td>`).join('')}
                    </tr>
                </tbody>
            </table>
        `;
    },

    renderResilienceRow(threat) {
        const resilience = threat.resilience || {};
        const value = resilience.value ?? '-';
        const note = resilience.note || '';

        return `
            <div class="resilience-row">
                <span class="resilience-label">Resilience</span><br>
                <span class="resilience-value">${value}</span>
                ${note ? `<span class="resilience-note" data-glossary-enhance> (${note})</span>` : ''}
            </div>
        `;
    },

    renderCombatStatsTable(threat) {
        return `
            <table class="threat-stat-table combat-stats-table">
                <thead>
                    <tr>
                        <th>Defence</th>
                        <th>Wounds</th>
                        <th>Shock</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="stat-value">${threat.defence || '-'}</td>
                        <td class="stat-value">${threat.wounds || '-'}</td>
                        <td class="stat-value">${threat.shock || '-'}</td>
                    </tr>
                </tbody>
            </table>
        `;
    },

    renderSkillsRow(skills) {
        if (!skills) return '';

        return `
            <div class="skills-row">
                <span class="skills-label">SKILLS:</span>
                <span class="skills-value" data-glossary-enhance>${skills}</span>
            </div>
        `;
    },

    renderAbilities(abilities) {
        if (!abilities || abilities.length === 0) return '<p class="text-muted">No abilities</p>';

        return abilities.map(ability => {
            let statsHtml = '';
            let descHtml = '';

            if (ability.type === 'ACTION' && ability.weaponId) {
                const weapon = DataLoader.getThreatWeapon(ability.weaponId);
                if (weapon) {
                    statsHtml = this.formatWeaponStats(weapon);
                } else if (ability.stats) {
                    statsHtml = ` | ${ability.stats}`;
                }
            } else if (ability.stats) {
                statsHtml = ` | ${ability.stats}`;
            }

            if (ability.description) {
                descHtml = `<div class="ability-description" data-glossary-enhance>${ability.description}</div>`;
            }

            return `
                <div class="ability-item">
                    <div>
                        <span class="ability-type">${ability.type}:</span>
                        <span class="ability-name" data-glossary-enhance>${ability.name}</span>
                        ${statsHtml ? `<span class="ability-stats" data-glossary-enhance>${statsHtml}</span>` : ''}
                    </div>
                    ${descHtml}
                </div>
            `;
        }).join('');
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

    renderBonuses(bonuses) {
        if (!bonuses || bonuses.length === 0) return '';

        const bonusItems = bonuses.map(bonus => `
            <div class="bonus-item">
                <span class="bonus-name" data-glossary-enhance>${bonus.name}:</span>
                <span class="bonus-description" data-glossary-enhance>${bonus.description}</span>
            </div>
        `).join('');

        return `
            <div class="bonuses-section">
                <div class="bonuses-header">Bonuses</div>
                ${bonusItems}
            </div>
        `;
    },

    renderDeterminationRow(determination) {
        if (!determination) return '';

        return `
            <div class="determination-row">
                <span class="determination-label">DETERMINATION:</span>
                <span class="determination-value" data-glossary-enhance>${determination}</span>
            </div>
        `;
    },

    renderBottomStatsTable(threat) {
        return `
            <table class="threat-stat-table bottom-stats-table">
                <thead>
                    <tr>
                        <th>Conviction</th>
                        <th>Resolve</th>
                        <th>Speed</th>
                        <th>Size</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="stat-value">${threat.conviction ?? '-'}</td>
                        <td class="stat-value">${threat.resolve ?? '-'}</td>
                        <td class="stat-value">${threat.speed || '-'}</td>
                        <td class="stat-value">${threat.size || '-'}</td>
                    </tr>
                </tbody>
            </table>
        `;
    },

    buildThreatCopyText(threat) {
        const lines = [];

        // Name
        lines.push(threat.name);

        // Source + Keywords
        const parts = [];
        if (threat.source) parts.push(DataLoader.normalizeSource(threat.source));
        if (threat.keywords && threat.keywords.length > 0) {
            parts.push('Keywords: ' + threat.keywords.join(', '));
        }
        if (parts.length > 0) lines.push(parts.join(' | '));

        // Tier/Threat
        if (threat.tierThreat) {
            const tierLabels = { 'T': 'Troop', 'E': 'Elite', 'A': 'Adversary', 'MC': 'Mob/Crew', '-': '-' };
            const tiers = Object.keys(threat.tierThreat).sort((a, b) => parseInt(a) - parseInt(b));
            const tierParts = tiers.map(t => `Tier ${t}: ${tierLabels[threat.tierThreat[t]] || threat.tierThreat[t]}`);
            lines.push(tierParts.join(' | '));
        }

        // Attributes
        if (threat.attributes) {
            lines.push('');
            lines.push('ATTRIBUTES');
            const attrOrder = ['S', 'T', 'A', 'I', 'Wil', 'Int', 'Fel'];
            const attrParts = attrOrder.map(a => `${a}: ${threat.attributes[a] || '-'}`);
            lines.push(attrParts.join(' | '));
        }

        // Defence, Resilience, Wounds, Shock
        lines.push('');
        const resValue = threat.resilience?.value || '-';
        const resNote = threat.resilience?.note ? ` (${threat.resilience.note})` : '';
        const combatParts = [
            `Defence: ${threat.defence || '-'}`,
            `Resilience: ${resValue}${resNote}`,
            `Wounds: ${threat.wounds || '-'}`,
            `Shock: ${threat.shock || '-'}`
        ];
        lines.push(combatParts.join(' | '));

        // Speed, Size, Conviction, Resolve
        const speedNote = threat.speedNote ? ` (${threat.speedNote})` : '';
        const bottomParts = [
            `Speed: ${threat.speed || '-'}${speedNote}`,
            `Size: ${threat.size || '-'}`,
            `Conviction: ${threat.conviction ?? '-'}`,
            `Resolve: ${threat.resolve ?? '-'}`
        ];
        lines.push(bottomParts.join(' | '));

        // Skills
        if (threat.skills) {
            lines.push('');
            lines.push('SKILLS');
            lines.push(threat.skills);
        }

        // Abilities
        if (threat.abilities && threat.abilities.length > 0) {
            lines.push('');
            lines.push('ABILITIES');
            threat.abilities.forEach(ability => {
                let line = `${ability.type}: ${ability.name}`;
                if (ability.type === 'ACTION' && ability.weaponId) {
                    const weapon = DataLoader.getThreatWeapon(ability.weaponId);
                    if (weapon) {
                        line += ` ${this.formatWeaponStats(weapon)}`;
                    } else if (ability.stats) {
                        line += `, ${ability.stats}`;
                    }
                } else if (ability.stats) {
                    line += `, ${ability.stats}`;
                }
                lines.push(line);
                if (ability.description) {
                    const div = document.createElement('div');
                    div.innerHTML = ability.description;
                    const plainDesc = div.textContent || div.innerText || '';
                    lines.push(`  ${plainDesc}`);
                }
            });
        }

        // Bonuses
        if (threat.bonuses && threat.bonuses.length > 0) {
            lines.push('');
            lines.push('BONUSES');
            threat.bonuses.forEach(bonus => {
                const div = document.createElement('div');
                div.innerHTML = bonus.description;
                const plainDesc = div.textContent || div.innerText || '';
                lines.push(`${bonus.name}: ${plainDesc}`);
            });
        }

        // Determination
        if (threat.determination) {
            lines.push('');
            lines.push(`DETERMINATION: ${threat.determination}`);
        }

        return lines.join('\n');
    },

    showKeywordPopup(keyword, anchorElement) {
        // Try to find the keyword in the glossary
        const glossaryData = DataLoader.getGlossary();
        if (glossaryData && glossaryData.keywords) {
            const keywordKey = keyword.toLowerCase().replace(/\s+/g, '_');
            const keywordData = Object.values(glossaryData.keywords).find(
                k => k.name.toLowerCase() === keyword.toLowerCase()
            );

            if (keywordData) {
                Glossary.showPopup(keywordData, anchorElement, 'keyword');
            }
        }
    }
};
