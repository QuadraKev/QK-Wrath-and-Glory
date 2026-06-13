// Archetype Tab - Archetype selection

const ArchetypeTab = {
    searchQuery: '',
    wargearSearchQuery: '',
    wargearCategory: 'all',

    init() {
        // Search input
        document.getElementById('archetype-search').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderList();
        });
    },

    render() {
        const character = State.getCharacter();

        // If custom archetype is selected, show custom config view
        if (character.archetype?.id === 'custom') {
            this.renderCustomConfig();
        } else if (character.archetype?.id) {
            // If standard archetype is selected, show detail view
            this.renderDetail();
        } else {
            // Show the list and hide the detail
            document.getElementById('archetype-list').classList.remove('hidden');
            document.getElementById('archetype-detail').classList.add('hidden');
            this.renderList();
        }
    },

    renderList() {
        const container = document.getElementById('archetype-list');
        const character = State.getCharacter();
        const allArchetypes = DataLoader.getAllArchetypes();

        if (!allArchetypes || allArchetypes.length === 0) {
            container.innerHTML = '<p class="text-muted">No archetype data loaded.</p>';
            return;
        }

        // Filter archetypes
        const archetypes = allArchetypes.filter(a => {
            // Check source
            if (!State.isSourceEnabled(a.source)) return false;

            // Check tier
            if (a.tier > character.tier) return false;

            // Check species compatibility
            if (a.species && a.species.length > 0) {
                if (!a.species.includes(character.species?.id)) return false;
            }

            // Check search query
            if (this.searchQuery) {
                const searchable = `${a.name} ${a.description} ${a.faction}`.toLowerCase();
                if (!searchable.includes(this.searchQuery)) return false;
            }

            return true;
        });

        // Group by faction
        const grouped = {};
        for (const a of archetypes) {
            const faction = a.faction || 'Other';
            if (!grouped[faction]) {
                grouped[faction] = [];
            }
            grouped[faction].push(a);
        }

        container.innerHTML = '';

        // Add Custom Archetype option at the top (always visible, not affected by search filtering faction groups)
        const showCustom = !this.searchQuery || 'custom archetype advanced'.includes(this.searchQuery);
        if (showCustom) {
            const customGroup = document.createElement('div');
            customGroup.className = 'archetype-group';

            const customItem = document.createElement('div');
            customItem.className = 'archetype-item custom-archetype-item';
            customItem.innerHTML = `
                <div class="archetype-info">
                    <div class="archetype-name">Custom Archetype</div>
                    <div class="archetype-desc">Advanced Character Creation (Core Rules p.38). Build without a standard archetype. Receive bonus XP of Tier x 10.</div>
                </div>
                <div class="archetype-stats">
                    <span class="archetype-xp">0 XP</span>
                    <span class="archetype-tier">+${(character.tier || 1) * 10} Bonus XP</span>
                    <span>&#10095;</span>
                </div>
            `;

            customItem.addEventListener('click', () => {
                State.setCustomArchetype();
                this.renderCustomConfig();
            });

            customGroup.appendChild(customItem);
            container.appendChild(customGroup);
        }

        // Sort factions alphabetically
        const sortedFactions = Object.keys(grouped).sort();

        for (const faction of sortedFactions) {
            const group = document.createElement('div');
            group.className = 'archetype-group';

            const title = document.createElement('div');
            title.className = 'archetype-group-title';
            title.textContent = faction;
            group.appendChild(title);

            for (const archetype of grouped[faction]) {
                const isSelected = character.archetype?.id === archetype.id;

                const item = document.createElement('div');
                item.className = `archetype-item ${isSelected ? 'selected' : ''}`;
                item.innerHTML = `
                    <div class="archetype-info">
                        <div class="archetype-name">
                            ${archetype.name}
                            <span class="card-source">${DataLoader.formatSourcePage(archetype)}</span>
                        </div>
                        <div class="archetype-desc">${archetype.description || ''}</div>
                    </div>
                    <div class="archetype-stats">
                        <span class="archetype-xp">${archetype.cost} XP</span>
                        <span class="archetype-tier">Tier ${archetype.tier}</span>
                        <span>&#10095;</span>
                    </div>
                `;

                item.addEventListener('click', () => {
                    State.setArchetype(archetype.id);
                    this.renderDetail();
                });

                group.appendChild(item);
            }

            container.appendChild(group);
        }

        if (sortedFactions.length === 0 && !showCustom) {
            container.innerHTML = '<p class="text-muted">No archetypes match your criteria. Try selecting a species or adjusting the tier.</p>';
        }
    },

    renderDetail() {
        const character = State.getCharacter();
        const archetype = DataLoader.getArchetype(character.archetype?.id);

        if (!archetype) {
            document.getElementById('archetype-detail').classList.add('hidden');
            document.getElementById('archetype-list').classList.remove('hidden');
            return;
        }

        const detail = document.getElementById('archetype-detail');
        document.getElementById('archetype-list').classList.add('hidden');

        const species = DataLoader.getSpecies(character.species?.id);

        // Calculate total XP cost (archetype + stats)
        let statsXP = 0;
        if (archetype.attributeBonus) {
            for (const [attr, val] of Object.entries(archetype.attributeBonus)) {
                statsXP += XPCalculator.ATTRIBUTE_COSTS[val] || 0;
            }
        }
        if (archetype.skillBonus) {
            for (const [skill, val] of Object.entries(archetype.skillBonus)) {
                statsXP += XPCalculator.SKILL_COSTS[val] || 0;
            }
        }

        detail.innerHTML = `
            <div class="detail-header">
                <div>
                    <h2 class="detail-title">${archetype.name}</h2>
                    <div class="detail-subtitle">${archetype.description || ''}</div>
                    <button class="btn-change" id="btn-change-archetype">CHANGE ARCHETYPE</button>
                </div>
            </div>

            <div class="detail-stats">
                <div class="detail-stat">
                    <span class="detail-stat-label">Tier:</span>
                    <span class="detail-stat-value">${archetype.tier}</span>
                </div>
                <div class="detail-stat">
                    <span class="detail-stat-label">Species:</span>
                    <span class="detail-stat-value">${species?.name || 'Any'}</span>
                </div>
                <div class="detail-stat">
                    <span class="detail-stat-label">XP Cost:</span>
                    <span class="detail-stat-value">${archetype.cost}, incl. Archetype (${archetype.cost} XP) and Stats (${statsXP} XP)</span>
                </div>
                <div class="detail-stat">
                    <span class="detail-stat-label">Attributes:</span>
                    <span class="detail-stat-value">${this.formatBonuses(archetype.attributeBonus, true)}</span>
                </div>
                <div class="detail-stat">
                    <span class="detail-stat-label">Skills:</span>
                    <span class="detail-stat-value">${this.formatBonuses(archetype.skillBonus, false)}</span>
                </div>
                <div class="detail-stat">
                    <span class="detail-stat-label">Influence Modifier:</span>
                    <span class="detail-stat-value">${archetype.influenceModifier > 0 ? '+' : ''}${archetype.influenceModifier || 0}</span>
                </div>
            </div>

            <div class="detail-keywords">
                ${(archetype.keywords || []).map(k => `<span class="keyword">${k}</span>`).join('')}
            </div>

            ${archetype.abilities && archetype.abilities.length > 0 ? `
                <div class="detail-section">
                    ${archetype.abilities.map(a => `
                        <div class="ability-item">
                            <div class="ability-name">${a.name}</div>
                            <div class="ability-desc">${a.description}</div>
                        </div>
                    `).join('')}
                </div>
            ` : ''}

            ${archetype.startingWargear && archetype.startingWargear.length > 0 ? `
                <div class="detail-section">
                    <div class="detail-section-title">Wargear</div>
                    <div class="ability-desc">${this.formatWargear(archetype.startingWargear)}</div>
                </div>
            ` : ''}

            <div class="info-box" style="margin-top: 15px; padding: 10px; background: var(--bg-tertiary); border-radius: var(--radius-sm); font-size: 13px; color: var(--text-secondary);">
                &#9432; You can add your (starting) equipment in the 6. Wargear section.
            </div>
        `;

        // Change archetype button
        document.getElementById('btn-change-archetype').addEventListener('click', () => {
            detail.classList.add('hidden');
            document.getElementById('archetype-list').classList.remove('hidden');
            this.renderList();
        });

        // Enhance ability descriptions with glossary terms
        detail.querySelectorAll('.ability-desc').forEach(el => {
            Glossary.enhanceElement(el);
        });

        detail.classList.remove('hidden');
    },

    // Render the custom archetype configuration view
    renderCustomConfig() {
        const character = State.getCharacter();
        const custom = character.customArchetype;
        const detail = document.getElementById('archetype-detail');
        const tier = character.tier || 1;
        const budget = State.getWargearBudget();
        const budgetUsed = State.getWargearBudgetUsed();

        document.getElementById('archetype-list').classList.add('hidden');

        // Build keywords display
        const keywordsHtml = custom.keywords.map((k, i) =>
            `<span class="custom-keyword-tag">${k}<button class="custom-keyword-remove" data-index="${i}">&times;</button></span>`
        ).join('');

        // Build ability selector
        const allArchetypes = DataLoader.getAllArchetypes();
        const abilityOptions = allArchetypes
            .filter(a => State.isSourceEnabled(a.source) && a.abilities && a.abilities.length > 0)
            .sort((a, b) => a.name.localeCompare(b.name));

        let selectedAbilityHtml = '';
        if (custom.abilityArchetypeId) {
            const abilityArchetype = DataLoader.getArchetype(custom.abilityArchetypeId);
            if (abilityArchetype?.abilities) {
                const cost = (abilityArchetype.tier || 1) * 10;
                selectedAbilityHtml = `
                    <div class="custom-ability-selected">
                        <div class="custom-ability-cost">Cost: ${cost} XP (Tier ${abilityArchetype.tier} ability)</div>
                        ${abilityArchetype.abilities.map(a => `
                            <div class="ability-item">
                                <div class="ability-name">${a.name}</div>
                                <div class="ability-desc">${a.effect || a.description}</div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        }

        // Build starting wargear list
        const startingWargearHtml = custom.wargear.map((itemId, i) => {
            const item = DataLoader.getWargearItem(itemId);
            return `
                <div class="custom-wargear-item">
                    <span>${item?.name || itemId} (Value: ${item?.value || 0})</span>
                    <button class="btn-small custom-wargear-remove" data-index="${i}">&times;</button>
                </div>
            `;
        }).join('');

        // Budget status
        const budgetClass = budgetUsed > budget.totalValue ? 'budget-over' : 'budget-ok';
        const maxValueText = budget.maxValue !== null ? `Max per item: ${budget.maxValue}` : 'No max per item';
        const maxRarityText = budget.maxRarity !== null ? `Max rarity: ${budget.maxRarity}` : 'No rarity limit';

        detail.innerHTML = `
            <div class="detail-header">
                <div>
                    <h2 class="detail-title">Custom Archetype</h2>
                    <div class="detail-subtitle">Advanced Character Creation (Tier ${tier}). Bonus XP: +${tier * 10}. No attribute or skill bonuses. Influence modifier: 0.</div>
                    <button class="btn-change" id="btn-change-archetype">CHANGE ARCHETYPE</button>
                </div>
            </div>

            <!-- Name -->
            <div class="custom-section">
                <div class="custom-section-title">Archetype Name</div>
                <input type="text" id="custom-archetype-name" class="custom-input" placeholder="Enter a name for your archetype" value="${this.escapeHtml(custom.name)}">
            </div>

            <!-- Keywords -->
            <div class="custom-section">
                <div class="custom-section-title">Keywords</div>
                <p class="custom-hint">Add keywords for your custom archetype. These will be added to your species keywords. Common keywords include faction names (IMPERIUM, AELDARI, CHAOS) and role descriptors.</p>
                <div class="custom-keyword-list">
                    ${keywordsHtml || '<span class="text-muted">No keywords added</span>'}
                </div>
                <div class="custom-keyword-add">
                    <input type="text" id="custom-keyword-input" class="custom-input" placeholder="Enter a keyword (e.g. IMPERIUM)">
                    <button class="btn-small" id="btn-add-keyword">Add</button>
                </div>
            </div>

            <!-- Archetype Ability -->
            <div class="custom-section">
                <div class="custom-section-title">Archetype Ability (Optional)</div>
                <p class="custom-hint">You may purchase any archetype ability. The cost is the ability's archetype Tier x 10 XP.</p>
                <select id="custom-ability-select">
                    <option value="">None (no ability)</option>
                    ${abilityOptions.map(a => {
                        const cost = (a.tier || 1) * 10;
                        const selected = custom.abilityArchetypeId === a.id ? 'selected' : '';
                        return `<option value="${a.id}" ${selected}>${a.name} - ${a.abilities[0]?.name || 'Ability'} (${cost} XP)</option>`;
                    }).join('')}
                </select>
                ${selectedAbilityHtml}
            </div>

            <!-- Starting Wargear -->
            <div class="custom-section">
                <div class="custom-section-title">Starting Wargear</div>
                <div class="custom-budget-info ${budgetClass}">
                    <span class="custom-budget-bar">Budget: ${budgetUsed} / ${budget.totalValue} Value</span>
                    <span class="custom-budget-details">${maxValueText} | ${maxRarityText}</span>
                </div>

                ${startingWargearHtml ? `
                    <div class="custom-wargear-list">${startingWargearHtml}</div>
                ` : ''}

                <div class="custom-wargear-browser">
                    <div class="wargear-browser-controls">
                        <input type="text" id="custom-wargear-search" class="search-input" placeholder="Search wargear..." value="${this.escapeHtml(this.wargearSearchQuery)}">
                        <div class="wargear-category-tabs">
                            <button class="wargear-tab-btn ${this.wargearCategory === 'all' ? 'active' : ''}" data-category="all">All</button>
                            <button class="wargear-tab-btn ${this.wargearCategory === 'melee' ? 'active' : ''}" data-category="melee">Melee</button>
                            <button class="wargear-tab-btn ${this.wargearCategory === 'ranged' ? 'active' : ''}" data-category="ranged">Ranged</button>
                            <button class="wargear-tab-btn ${this.wargearCategory === 'armor' ? 'active' : ''}" data-category="armor">Armor</button>
                            <button class="wargear-tab-btn ${this.wargearCategory === 'equipment' ? 'active' : ''}" data-category="equipment">Equipment</button>
                        </div>
                    </div>
                    <div id="custom-wargear-list" class="wargear-browser-list">
                        ${this.renderCustomWargearBrowser()}
                    </div>
                </div>
            </div>
        `;

        // Bind events
        this.bindCustomConfigEvents(detail);

        // Enhance ability descriptions with glossary terms
        detail.querySelectorAll('.ability-desc').forEach(el => {
            Glossary.enhanceElement(el);
        });

        detail.classList.remove('hidden');
    },

    // Bind all event handlers for the custom archetype config view
    bindCustomConfigEvents(detail) {
        // Change archetype button
        document.getElementById('btn-change-archetype').addEventListener('click', () => {
            detail.classList.add('hidden');
            document.getElementById('archetype-list').classList.remove('hidden');
            this.renderList();
        });

        // Archetype name input
        document.getElementById('custom-archetype-name').addEventListener('input', (e) => {
            State.setCustomArchetypeName(e.target.value);
        });

        // Add keyword
        const addKeyword = () => {
            const input = document.getElementById('custom-keyword-input');
            const keyword = input.value.trim();
            if (keyword) {
                State.addCustomKeyword(keyword);
                input.value = '';
                this.renderCustomConfig();
            }
        };

        document.getElementById('btn-add-keyword').addEventListener('click', addKeyword);
        document.getElementById('custom-keyword-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addKeyword();
        });

        // Remove keywords
        detail.querySelectorAll('.custom-keyword-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const character = State.getCharacter();
                const keyword = character.customArchetype.keywords[parseInt(btn.dataset.index, 10)];
                if (keyword) {
                    State.removeCustomKeyword(keyword);
                    this.renderCustomConfig();
                }
            });
        });

        // Ability select
        document.getElementById('custom-ability-select').addEventListener('change', (e) => {
            State.setCustomArchetypeAbility(e.target.value || null);
            this.renderCustomConfig();
        });

        // Wargear search
        document.getElementById('custom-wargear-search').addEventListener('input', (e) => {
            this.wargearSearchQuery = e.target.value.toLowerCase();
            document.getElementById('custom-wargear-list').innerHTML = this.renderCustomWargearBrowser();
            this.bindCustomWargearEvents();
        });

        // Wargear category tabs
        detail.querySelectorAll('.custom-wargear-browser .wargear-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                detail.querySelectorAll('.custom-wargear-browser .wargear-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.wargearCategory = btn.dataset.category;
                document.getElementById('custom-wargear-list').innerHTML = this.renderCustomWargearBrowser();
                this.bindCustomWargearEvents();
            });
        });

        // Remove wargear
        detail.querySelectorAll('.custom-wargear-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                State.removeCustomStartingWargear(parseInt(btn.dataset.index, 10));
                this.renderCustomConfig();
            });
        });

        // Bind wargear add buttons
        this.bindCustomWargearEvents();
    },

    // Bind events for wargear browser add buttons
    bindCustomWargearEvents() {
        const container = document.getElementById('custom-wargear-list');
        if (!container) return;

        container.querySelectorAll('.btn-add-custom-wargear').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                State.addCustomStartingWargear(btn.dataset.id);
                this.renderCustomConfig();
            });
        });
    },

    // Render the wargear browser for custom archetype starting gear
    renderCustomWargearBrowser() {
        const weapons = DataLoader.getAllWeapons() || [];
        const armor = DataLoader.getAllArmor() || [];
        const equipment = DataLoader.getAllEquipment() || [];
        const budget = State.getWargearBudget();

        const filterBySource = (items) => items.filter(item => State.isSourceEnabled(item.source));

        const filterBySearch = (items) => {
            if (!this.wargearSearchQuery) return items;
            return items.filter(item => {
                const searchable = `${item.name} ${item.category || ''} ${(item.traits || []).join(' ')} ${(item.keywords || []).join(' ')}`.toLowerCase();
                return searchable.includes(this.wargearSearchQuery);
            });
        };

        let html = '';

        if (this.wargearCategory === 'all' || this.wargearCategory === 'melee') {
            const melee = filterBySearch(filterBySource(weapons.filter(w => w.type === 'melee')));
            if (melee.length > 0) html += this.renderCustomWargearTable(melee, 'Melee Weapons', budget);
        }

        if (this.wargearCategory === 'all' || this.wargearCategory === 'ranged') {
            const ranged = filterBySearch(filterBySource(weapons.filter(w => w.type === 'ranged')));
            if (ranged.length > 0) html += this.renderCustomWargearTable(ranged, 'Ranged Weapons', budget);
        }

        if (this.wargearCategory === 'all' || this.wargearCategory === 'armor') {
            const armorItems = filterBySearch(filterBySource(armor));
            if (armorItems.length > 0) html += this.renderCustomWargearTable(armorItems, 'Armor', budget);
        }

        if (this.wargearCategory === 'all' || this.wargearCategory === 'equipment') {
            const equip = filterBySearch(filterBySource(equipment));
            if (equip.length > 0) html += this.renderCustomWargearTable(equip, 'Equipment', budget);
        }

        return html || '<p class="text-muted">No items found.</p>';
    },

    // Render a table of wargear items for the custom archetype browser
    renderCustomWargearTable(items, title, budget) {
        items.sort((a, b) => a.name.localeCompare(b.name));

        const rows = items.map(item => {
            const canAdd = State.canAddCustomWargear(item.id);
            const rarityClass = this.getRarityClass(item.rarity);
            const value = item.value || 0;

            // Determine why item can't be added
            let disabledReason = '';
            if (!canAdd) {
                const budgetUsed = State.getWargearBudgetUsed();
                if (budget.maxValue !== null && value > budget.maxValue) {
                    disabledReason = 'Exceeds max value';
                } else if (budgetUsed + value > budget.totalValue) {
                    disabledReason = 'Over budget';
                } else if (budget.maxRarity !== null) {
                    disabledReason = 'Rarity too high';
                }
            }

            return `
                <tr>
                    <td class="wargear-table-name">${item.name}</td>
                    <td class="wargear-table-center">${value}</td>
                    <td class="wargear-table-rarity ${rarityClass}">${item.rarity || 'Common'}</td>
                    <td class="wargear-table-action">
                        ${canAdd
                            ? `<button class="btn-small btn-add-custom-wargear" data-id="${item.id}">Add</button>`
                            : `<span class="text-muted" title="${disabledReason}">${disabledReason || 'N/A'}</span>`
                        }
                    </td>
                </tr>
            `;
        }).join('');

        return `
            <div class="wargear-table-section">
                <h4>${title}</h4>
                <div class="wargear-table-wrapper">
                    <table class="wargear-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Value</th>
                                <th>Rarity</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    },

    getRarityClass(rarity) {
        if (!rarity) return 'rarity-common';
        return 'rarity-' + rarity.toLowerCase().replace(/ /g, '-');
    },

    formatBonuses(bonuses, isAttribute) {
        if (!bonuses || Object.keys(bonuses).length === 0) {
            return '-';
        }

        const parts = [];
        for (const [key, value] of Object.entries(bonuses)) {
            const name = isAttribute
                ? DerivedStats.formatAttributeName(key)
                : DerivedStats.formatSkillName(key);
            parts.push(`${name} ${value}`);
        }

        return parts.join(', ');
    },

    formatWargear(wargearEntries) {
        const names = wargearEntries.map(entry => {
            // Handle both string IDs and object format { id: "...", qty: 3 }
            const id = typeof entry === 'string' ? entry : entry.id;
            const qty = typeof entry === 'object' && entry.qty > 1 ? entry.qty : null;
            const item = DataLoader.getWargearItem(id);
            const name = item?.name || id;
            return qty ? `${name} x${qty}` : name;
        });
        return names.join(', ');
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    refresh() {
        // Reset search query on refresh (e.g., when creating new character)
        this.searchQuery = '';
        this.wargearSearchQuery = '';
        this.wargearCategory = 'all';
        const searchInput = document.getElementById('archetype-search');
        if (searchInput) {
            searchInput.value = '';
        }
        this.render();
    }
};
