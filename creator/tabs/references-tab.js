// References Tab - Browse and search game options (talents, weapons, armor, etc.)

const ReferencesTab = {
    searchQuery: '',
    currentCategory: 'all',
    allEntries: [],
    expandedEntries: new Set(),
    _searchTimer: null,
    _entryMap: new Map(),
    _orderedEntries: [],
    _renderedCount: 0,
    _scrollHandler: null,
    _isGrouped: false,

    CATEGORIES: [
        { key: 'talents', name: 'Talent', pluralName: 'Talents' },
        { key: 'weapons', name: 'Weapon', pluralName: 'Weapons' },
        { key: 'grenades', name: 'Grenade/Missile', pluralName: 'Grenades & Missiles' },
        { key: 'armor', name: 'Armor', pluralName: 'Armor' },
        { key: 'augmetics', name: 'Augmetic', pluralName: 'Augmetics' },
        { key: 'equipment', name: 'Equipment', pluralName: 'Equipment' },
        { key: 'psychicPowers', name: 'Psychic Power', pluralName: 'Psychic Powers' },
        { key: 'weaponUpgrades', name: 'Weapon Upgrade', pluralName: 'Weapon Upgrades' },
        { key: 'ascensionPackages', name: 'Ascension Package', pluralName: 'Ascension Packages' },
        { key: 'archetypes', name: 'Archetype', pluralName: 'Archetypes' },
        { key: 'archetypeAbilities', name: 'Archetype Ability', pluralName: 'Archetype Abilities' },
        { key: 'speciesAbilities', name: 'Species Ability', pluralName: 'Species Abilities' },
        { key: 'mutations', name: 'Mutation', pluralName: 'Mutations' }
    ],

    init() {
        // Search with 200ms debounce
        document.getElementById('references-search').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => this.renderEntries(), 200);
        });

        document.querySelectorAll('.references-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.references-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentCategory = btn.dataset.category;
                this.renderEntries();
            });
        });

        // Event delegation on container (set up once)
        const container = document.getElementById('references-content');
        container.addEventListener('click', (e) => {
            const copyBtn = e.target.closest('.btn-copy');
            if (copyBtn) {
                e.stopPropagation();
                const name = copyBtn.dataset.copyName;
                const desc = copyBtn.dataset.copyDesc;
                navigator.clipboard.writeText(`${name}: ${desc}`).then(() => {
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
                });
                return;
            }
            const header = e.target.closest('.glossary-entry-header');
            if (header) {
                const entry = header.closest('.glossary-entry');
                this._toggleEntry(entry.dataset.entryId, entry);
            }
        });

        this.loadEntries();
    },

    loadEntries() {
        this.allEntries = [];

        // Talents
        for (const t of DataLoader.getAllTalents()) {
            this.allEntries.push({
                ...t, category: 'talents', categoryName: 'Talent', categoryPluralName: 'Talents',
                briefInfo: `${t.cost} XP`,
                searchText: `${t.name} ${t.effect || ''} ${t.flavor || ''}`.toLowerCase()
            });
        }

        // Weapons (separate grenades & missiles into their own category)
        const grenadeCategories = ['Grenade', 'Missile', 'Explosive'];
        for (const w of DataLoader.getAllWeapons()) {
            const typeLabel = w.type === 'melee' ? 'Melee' : 'Ranged';
            const kws = (w.keywords || []).map(k => k.toUpperCase());
            const isGrenade = (w.category && grenadeCategories.includes(w.category)) || kws.includes('GRENADE') || kws.includes('MISSILE');
            this.allEntries.push({
                ...w,
                category: isGrenade ? 'grenades' : 'weapons',
                categoryName: isGrenade ? 'Grenade/Missile' : 'Weapon',
                categoryPluralName: isGrenade ? 'Grenades & Missiles' : 'Weapons',
                briefInfo: typeLabel,
                searchText: `${w.name} ${w.description || ''} ${(w.traits || []).join(' ')} ${(w.keywords || []).join(' ')}`.toLowerCase()
            });
        }

        // Armor
        for (const a of DataLoader.getAllArmor()) {
            this.allEntries.push({
                ...a, category: 'armor', categoryName: 'Armor', categoryPluralName: 'Armor',
                briefInfo: `AR ${a.ar}`,
                searchText: `${a.name} ${a.description || ''} ${(a.traits || []).join(' ')} ${(a.keywords || []).join(' ')}`.toLowerCase()
            });
        }

        // Augmetics & Equipment
        for (const e of DataLoader.getAllEquipment()) {
            if (e.category === 'augmetic') {
                this.allEntries.push({
                    ...e, category: 'augmetics', categoryName: 'Augmetic', categoryPluralName: 'Augmetics',
                    briefInfo: 'Augmetic',
                    searchText: `${e.name} ${e.description || ''} ${e.effect || ''}`.toLowerCase()
                });
            } else {
                const catLabel = e.category ? e.category.charAt(0).toUpperCase() + e.category.slice(1) : '';
                this.allEntries.push({
                    ...e, category: 'equipment', categoryName: 'Equipment', categoryPluralName: 'Equipment',
                    briefInfo: catLabel,
                    searchText: `${e.name} ${e.description || ''} ${e.effect || ''}`.toLowerCase()
                });
            }
        }

        // Psychic Powers
        for (const p of DataLoader.getAllPsychicPowers()) {
            this.allEntries.push({
                ...p, category: 'psychicPowers', categoryName: 'Psychic Power', categoryPluralName: 'Psychic Powers',
                briefInfo: p.discipline || '',
                searchText: `${p.name} ${p.effect || ''} ${p.discipline || ''}`.toLowerCase()
            });
        }

        // Weapon Upgrades
        for (const u of DataLoader.getAllWeaponUpgrades()) {
            const typeLabel = u.type ? u.type.charAt(0).toUpperCase() + u.type.slice(1).replace(/_/g, ' ') : '';
            this.allEntries.push({
                ...u, category: 'weaponUpgrades', categoryName: 'Weapon Upgrade', categoryPluralName: 'Weapon Upgrades',
                briefInfo: typeLabel,
                searchText: `${u.name} ${u.description || ''} ${u.effect || ''}`.toLowerCase()
            });
        }

        // Ascension Packages
        for (const pkg of DataLoader.getAscensionPackages()) {
            this.allEntries.push({
                ...pkg, category: 'ascensionPackages', categoryName: 'Ascension Package', categoryPluralName: 'Ascension Packages',
                briefInfo: pkg.cost || '',
                searchText: `${pkg.name} ${pkg.description || ''} ${(pkg.benefits || []).join(' ')}`.toLowerCase()
            });
        }

        // Archetypes
        for (const arch of DataLoader.getAllArchetypes()) {
            this.allEntries.push({
                ...arch,
                category: 'archetypes',
                categoryName: 'Archetype',
                categoryPluralName: 'Archetypes',
                briefInfo: arch.faction ? `Tier ${arch.tier} · ${arch.faction}` : `Tier ${arch.tier}`,
                searchText: `${arch.name} ${arch.description || ''} ${arch.faction || ''} ${(arch.keywords || []).join(' ')} ${(arch.species || []).join(' ')}`.toLowerCase()
            });
        }

        // Archetype Abilities
        for (const arch of DataLoader.getAllArchetypes()) {
            if (arch.abilities) {
                for (const ability of arch.abilities) {
                    this.allEntries.push({
                        id: `${arch.id}_ability_${ability.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
                        name: ability.name,
                        description: ability.description,
                        source: arch.source,
                        page: arch.page,
                        parentName: arch.name,
                        category: 'archetypeAbilities',
                        categoryName: 'Archetype Ability',
                        categoryPluralName: 'Archetype Abilities',
                        briefInfo: `From: ${arch.name}`,
                        searchText: `${ability.name} ${ability.description || ''} ${arch.name}`.toLowerCase()
                    });
                }
            }
        }

        // Species Abilities — collect then deduplicate (same chapter/path abilities
        // appear under multiple species, e.g. Adeptus Astartes + Primaris Astartes)
        const speciesAbilityMap = new Map();

        for (const sp of DataLoader.getAllSpecies()) {
            // Direct species abilities
            if (sp.abilities) {
                for (const ability of sp.abilities) {
                    const text = ability.effect || ability.description || '';
                    const dedupKey = ability.name.toLowerCase() + '\n' + text.toLowerCase();

                    if (speciesAbilityMap.has(dedupKey)) {
                        const existing = speciesAbilityMap.get(dedupKey);
                        if (!existing._parents.includes(sp.name)) {
                            existing._parents.push(sp.name);
                        }
                    } else {
                        speciesAbilityMap.set(dedupKey, {
                            id: `${sp.id}_ability_${ability.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
                            name: ability.name,
                            description: text,
                            source: sp.source,
                            page: sp.page,
                            category: 'speciesAbilities',
                            categoryName: 'Species Ability',
                            categoryPluralName: 'Species Abilities',
                            _parents: [sp.name],
                            _subOptionName: null
                        });
                    }
                }
            }

            // Sub-option abilities (homeworld, chapter, sept, etc.)
            const subOptions = sp.subOptions;
            if (subOptions) {
                const configs = Array.isArray(subOptions) ? subOptions : [subOptions];
                for (const config of configs) {
                    if (config.options) {
                        for (const opt of config.options) {
                            if (opt.abilities) {
                                for (const ability of opt.abilities) {
                                    const text = ability.effect || ability.description || '';
                                    const dedupKey = ability.name.toLowerCase() + '\n' + text.toLowerCase();

                                    if (speciesAbilityMap.has(dedupKey)) {
                                        const existing = speciesAbilityMap.get(dedupKey);
                                        if (!existing._parents.includes(sp.name)) {
                                            existing._parents.push(sp.name);
                                        }
                                    } else {
                                        speciesAbilityMap.set(dedupKey, {
                                            id: `${sp.id}_${opt.id}_ability_${ability.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
                                            name: ability.name,
                                            description: text,
                                            source: sp.source,
                                            page: sp.page,
                                            category: 'speciesAbilities',
                                            categoryName: 'Species Ability',
                                            categoryPluralName: 'Species Abilities',
                                            _parents: [sp.name],
                                            _subOptionName: opt.name
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Finalize species abilities with merged parent names
        for (const entry of speciesAbilityMap.values()) {
            const parentList = entry._parents.join(', ');
            if (entry._subOptionName) {
                entry.parentName = `${entry._subOptionName} (${parentList})`;
                entry.briefInfo = `From: ${entry._subOptionName}`;
            } else {
                entry.parentName = parentList;
                entry.briefInfo = `From: ${parentList}`;
            }
            entry.searchText = `${entry.name} ${entry.description} ${entry.parentName}`.toLowerCase();
            delete entry._parents;
            delete entry._subOptionName;
            this.allEntries.push(entry);
        }

        // Mutations
        for (const m of DataLoader.getMutations()) {
            const sevLabel = m.severity ? m.severity.charAt(0).toUpperCase() + m.severity.slice(1) : '';
            this.allEntries.push({
                ...m, category: 'mutations', categoryName: 'Mutation', categoryPluralName: 'Mutations',
                source: m.source || 'core',
                briefInfo: sevLabel,
                searchText: `${m.name} ${m.description || ''} ${m.effect || ''}`.toLowerCase()
            });
        }

        // Sort alphabetically
        this.allEntries.sort((a, b) => a.name.localeCompare(b.name));

        this.renderEntries();
    },

    getFilteredEntries() {
        return this.allEntries.filter(entry => {
            if (this.currentCategory !== 'all' && entry.category !== this.currentCategory) return false;
            if (entry.source && !State.isSourceEnabled(entry.source)) return false;
            if (this.searchQuery && !entry.searchText.includes(this.searchQuery)) return false;
            return true;
        });
    },

    renderEntries() {
        const container = document.getElementById('references-content');
        const entries = this.getFilteredEntries();

        if (entries.length === 0) {
            container.innerHTML = `<div class="glossary-empty"><p>No entries found${this.searchQuery ? ` for "${this.escapeHtml(this.searchQuery)}"` : ''}.</p></div>`;
            this._cleanupScroll();
            return;
        }

        // Build entry map and ordered entries
        this._entryMap = new Map();
        this._orderedEntries = [];
        this._isGrouped = this.currentCategory === 'all';

        if (this._isGrouped) {
            const grouped = this.groupByCategory(entries);
            // Render group skeleton (headers only)
            container.innerHTML = grouped.map(group => `
                <div class="glossary-group" data-group-category="${group.category}">
                    <h3 class="glossary-group-title">${group.categoryPluralName} (${group.entries.length})</h3>
                    <div class="glossary-entries"></div>
                </div>
            `).join('');

            for (const group of grouped) {
                for (const entry of group.entries) {
                    this._entryMap.set(entry.id, entry);
                    this._orderedEntries.push(entry);
                }
            }
        } else {
            container.innerHTML = '<div class="glossary-entries"></div>';
            for (const entry of entries) {
                this._entryMap.set(entry.id, entry);
                this._orderedEntries.push(entry);
            }
        }

        // Progressive rendering
        this._renderedCount = 0;
        this._renderNextBatch();
        this._setupScroll();
    },

    groupByCategory(entries) {
        const groups = new Map();
        const categoryOrder = this.CATEGORIES.map(c => c.key);

        for (const entry of entries) {
            if (!groups.has(entry.category)) {
                groups.set(entry.category, {
                    category: entry.category,
                    categoryPluralName: entry.categoryPluralName,
                    entries: []
                });
            }
            groups.get(entry.category).entries.push(entry);
        }

        return categoryOrder.filter(cat => groups.has(cat)).map(cat => groups.get(cat));
    },

    _renderNextBatch() {
        if (this._renderedCount >= this._orderedEntries.length) return;

        const batch = this._orderedEntries.slice(this._renderedCount, this._renderedCount + 100);
        if (batch.length === 0) return;

        if (this._isGrouped) {
            const byCategory = new Map();
            for (const entry of batch) {
                if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
                byCategory.get(entry.category).push(entry);
            }
            for (const [category, catEntries] of byCategory) {
                const groupEl = document.querySelector(`.glossary-group[data-group-category="${category}"] .glossary-entries`);
                if (groupEl) {
                    groupEl.insertAdjacentHTML('beforeend', catEntries.map(e => this.renderEntry(e)).join(''));
                }
            }
        } else {
            const entriesEl = document.querySelector('#references-content .glossary-entries');
            if (entriesEl) {
                entriesEl.insertAdjacentHTML('beforeend', batch.map(e => this.renderEntry(e)).join(''));
            }
        }

        // Re-rendered expanded entries are inlined raw (no click fired), so their
        // glossary links would be missing after a filter/search re-render. Enhance
        // them now so the links survive the re-render (#8).
        for (const entry of batch) {
            if (this.expandedEntries.has(entry.id)) {
                const body = document.querySelector(`#references-content .glossary-entry[data-entry-id="${CSS.escape(entry.id)}"] .glossary-entry-body`);
                this._enhanceBody(body);
            }
        }

        this._renderedCount += batch.length;
    },

    _renderAllBatches() {
        while (this._renderedCount < this._orderedEntries.length) {
            this._renderNextBatch();
        }
    },

    _setupScroll() {
        this._cleanupScroll();
        const scrollEl = document.getElementById('tab-references');
        if (!scrollEl) return;
        this._scrollHandler = () => {
            if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 500) {
                this._renderNextBatch();
            }
        };
        scrollEl.addEventListener('scroll', this._scrollHandler, { passive: true });
    },

    _cleanupScroll() {
        if (this._scrollHandler) {
            const scrollEl = document.getElementById('tab-references');
            if (scrollEl) scrollEl.removeEventListener('scroll', this._scrollHandler);
            this._scrollHandler = null;
        }
    },

    renderEntry(entry) {
        const isExpanded = this.expandedEntries.has(entry.id);
        return `
            <div class="glossary-entry ${isExpanded ? 'expanded' : ''}" data-entry-id="${entry.id}">
                <div class="glossary-entry-header">
                    <span class="glossary-entry-expand">&#9654;</span>
                    <span class="glossary-entry-name">${this.escapeHtml(entry.name)}</span>
                    <span class="glossary-entry-brief">${this.escapeHtml(entry.briefInfo)}</span>
                    <span class="glossary-entry-category">${entry.categoryName}</span>
                </div>
                <div class="glossary-entry-body ${isExpanded ? '' : 'hidden'}"${isExpanded ? '' : ' data-deferred'}>
                    ${isExpanded ? this.renderBody(entry) : ''}
                </div>
            </div>
        `;
    },

    _toggleEntry(entryId, entryElement) {
        const body = entryElement.querySelector('.glossary-entry-body');

        if (this.expandedEntries.has(entryId)) {
            this.expandedEntries.delete(entryId);
            entryElement.classList.remove('expanded');
            body.classList.add('hidden');
            history.replaceState(null, '', location.pathname + location.search);
        } else {
            this.expandedEntries.add(entryId);
            entryElement.classList.add('expanded');
            body.classList.remove('hidden');

            // Materialize deferred body content
            if (body.hasAttribute('data-deferred')) {
                const data = this._entryMap.get(entryId);
                if (data) body.innerHTML = this.renderBody(data);
                body.removeAttribute('data-deferred');
            }

            // Enhance glossary terms on demand (stats + description, not copy button)
            this._enhanceBody(body);

            history.replaceState(null, '', '#references/' + entryId);
        }
    },

    // Wrap description/stat text in clickable glossary terms. Idempotent via the
    // body's data-enhanced flag. Called both on expand (click) and after a
    // re-render that inlines an already-expanded body (filter/search change),
    // which would otherwise leave the body raw with no clickable links (#8).
    _enhanceBody(body) {
        if (!body || body.dataset.enhanced) return;
        if (typeof Glossary !== 'undefined' && Glossary.enhanceElement) {
            body.querySelectorAll('.ref-stats, .glossary-entry-description').forEach(el => Glossary.enhanceElement(el));
        }
        body.dataset.enhanced = 'true';
    },

    renderBody(entry) {
        let html = '';

        switch (entry.category) {
            case 'talents':
                html += this.renderTalentBody(entry);
                break;
            case 'weapons':
            case 'grenades':
                html += this.renderWeaponBody(entry);
                break;
            case 'armor':
                html += this.renderArmorBody(entry);
                break;
            case 'augmetics':
                html += this.renderAugmeticBody(entry);
                break;
            case 'equipment':
                html += this.renderEquipmentBody(entry);
                break;
            case 'psychicPowers':
                html += this.renderPsychicPowerBody(entry);
                break;
            case 'weaponUpgrades':
                html += this.renderWeaponUpgradeBody(entry);
                break;
            case 'ascensionPackages':
                html += this.renderAscensionPackageBody(entry);
                break;
            case 'archetypes':
                html += this.renderArchetypeBody(entry);
                break;
            case 'archetypeAbilities':
            case 'speciesAbilities':
                html += this.renderAbilityBody(entry);
                break;
            case 'mutations':
                html += this.renderMutationBody(entry);
                break;
        }

        // Source reference
        const sourceRef = DataLoader.formatSourcePage(entry);
        if (sourceRef) {
            html += `<div class="source-ref">${sourceRef}</div>`;
        }

        // Copy button
        const plainText = this.stripHtml(entry.description || entry.effect || '');
        html += `<button class="btn-copy" data-copy-name="${this.escapeAttr(entry.name)}" data-copy-desc="${this.escapeAttr(plainText)}">Copy</button>`;

        return html;
    },

    // ---- Category-specific body renderers ----

    renderTalentBody(entry) {
        let html = '<div class="ref-stats">';
        html += `<div class="ref-stat"><span class="ref-label">Cost:</span> ${entry.cost} XP</div>`;
        if (entry.prerequisites && Object.keys(entry.prerequisites).length > 0) {
            html += `<div class="ref-stat"><span class="ref-label">Prerequisites:</span> ${this.formatPrerequisites(entry.prerequisites)}</div>`;
        }
        html += '</div>';
        if (entry.effect) {
            html += `<div class="glossary-entry-description">${entry.effect}</div>`;
        }
        if (entry.flavor) {
            html += `<div class="ref-flavor">${entry.flavor}</div>`;
        }
        return html;
    },

    renderWeaponBody(entry) {
        let html = '<div class="ref-stats">';

        // Damage
        const dmg = entry.damage;
        if (dmg) {
            const attrMap = { strength: 'S', toughness: 'T', agility: 'A', initiative: 'I', willpower: 'Wil', intellect: 'Int', fellowship: 'Fel' };
            const attrLabel = attrMap[dmg.attribute] || dmg.attribute || '';
            const bonusStr = dmg.bonus > 0 ? ` + ${dmg.bonus}` : dmg.bonus < 0 ? ` ${dmg.bonus}` : '';
            html += `<div class="ref-stat"><span class="ref-label">Damage:</span> ${dmg.base} + ${attrLabel}${bonusStr}</div>`;
        }

        html += `<div class="ref-stat"><span class="ref-label">ED:</span> ${entry.ed} &nbsp; <span class="ref-label">AP:</span> ${entry.ap}</div>`;

        if (entry.range != null) {
            if (typeof entry.range === 'object') {
                const s = entry.range.short != null ? `${entry.range.short}m` : '-';
                const m = entry.range.medium != null ? `${entry.range.medium}m` : '-';
                const l = entry.range.long != null ? `${entry.range.long}m` : '-';
                html += `<div class="ref-stat"><span class="ref-label">Range:</span> S: ${s} / M: ${m} / L: ${l}</div>`;
            } else {
                html += `<div class="ref-stat"><span class="ref-label">Range:</span> ${entry.range}</div>`;
            }
        }

        if (entry.traits && entry.traits.length > 0) {
            html += `<div class="ref-stat"><span class="ref-label">Traits:</span> ${entry.traits.join(', ')}</div>`;
        }
        if (entry.keywords && entry.keywords.length > 0) {
            html += `<div class="ref-stat"><span class="ref-label">Keywords:</span> ${entry.keywords.join(', ')}</div>`;
        }
        html += `<div class="ref-stat"><span class="ref-label">Value:</span> ${entry.value} &nbsp; <span class="ref-label">Rarity:</span> ${entry.rarity}</div>`;
        if (entry.special) {
            html += `<div class="ref-stat ref-weapon-special"><span class="ref-label">Special:</span> ${entry.special}</div>`;
        }
        html += '</div>';

        if (entry.description) {
            html += `<div class="glossary-entry-description">${entry.description}</div>`;
        }
        return html;
    },

    renderArmorBody(entry) {
        let html = '<div class="ref-stats">';
        html += `<div class="ref-stat"><span class="ref-label">Type:</span> ${entry.type ? entry.type.charAt(0).toUpperCase() + entry.type.slice(1) : ''}</div>`;
        html += `<div class="ref-stat"><span class="ref-label">AR:</span> ${entry.ar}</div>`;
        if (entry.traits && entry.traits.length > 0) {
            html += `<div class="ref-stat"><span class="ref-label">Traits:</span> ${entry.traits.join(', ')}</div>`;
        }
        if (entry.keywords && entry.keywords.length > 0) {
            html += `<div class="ref-stat"><span class="ref-label">Keywords:</span> ${entry.keywords.join(', ')}</div>`;
        }
        html += `<div class="ref-stat"><span class="ref-label">Value:</span> ${entry.value} &nbsp; <span class="ref-label">Rarity:</span> ${entry.rarity}</div>`;
        html += '</div>';
        if (entry.description) {
            html += `<div class="glossary-entry-description">${entry.description}</div>`;
        }
        return html;
    },

    renderEquipmentBody(entry) {
        let html = '<div class="ref-stats">';
        if (entry.effect) {
            html += `<div class="ref-stat"><span class="ref-label">Effect:</span> ${entry.effect}</div>`;
        }
        html += `<div class="ref-stat"><span class="ref-label">Value:</span> ${entry.value} &nbsp; <span class="ref-label">Rarity:</span> ${entry.rarity}</div>`;
        html += '</div>';
        if (entry.description) {
            html += `<div class="glossary-entry-description">${entry.description}</div>`;
        }
        return html;
    },

    renderAugmeticBody(entry) {
        let html = '<div class="ref-stats">';
        if (entry.effect) {
            html += `<div class="ref-stat"><span class="ref-label">Effect:</span> ${entry.effect}</div>`;
        }
        if (entry.bonuses) {
            const parts = Object.entries(entry.bonuses).map(([key, val]) => {
                const label = key.charAt(0).toUpperCase() + key.slice(1);
                return `${val > 0 ? '+' : ''}${val} ${label}`;
            });
            if (parts.length > 0) {
                html += `<div class="ref-stat"><span class="ref-label">Bonuses:</span> ${parts.join(', ')}</div>`;
            }
        }
        if (entry.keywords?.length > 0) {
            html += `<div class="ref-stat"><span class="ref-label">Keywords:</span> ${entry.keywords.join(', ')}</div>`;
        }
        html += `<div class="ref-stat"><span class="ref-label">Value:</span> ${entry.value} &nbsp; <span class="ref-label">Rarity:</span> ${entry.rarity}</div>`;
        html += '</div>';
        if (entry.description) {
            html += `<div class="glossary-entry-description">${entry.description}</div>`;
        }
        return html;
    },

    renderPsychicPowerBody(entry) {
        let html = '<div class="ref-stats">';
        html += `<div class="ref-stat"><span class="ref-label">Discipline:</span> ${entry.discipline}${entry.multiTarget ? ' <span class="multi-target-badge">Multi-Target</span>' : ''}</div>`;
        html += `<div class="ref-stat"><span class="ref-label">DN:</span> ${entry.dn} &nbsp; <span class="ref-label">Activation:</span> ${entry.activation}</div>`;
        html += `<div class="ref-stat"><span class="ref-label">Duration:</span> ${entry.duration} &nbsp; <span class="ref-label">Range:</span> ${entry.range}</div>`;
        html += `<div class="ref-stat"><span class="ref-label">Cost:</span> ${entry.cost} XP</div>`;
        html += '</div>';
        if (entry.effect) {
            html += `<div class="glossary-entry-description">${entry.effect}</div>`;
        }
        if (entry.potency) {
            html += `<div class="ref-stats" style="margin-top:8px"><div class="ref-stat"><span class="ref-label">Potency:</span> ${entry.potency}</div></div>`;
        }
        return html;
    },

    renderWeaponUpgradeBody(entry) {
        let html = '<div class="ref-stats">';
        if (entry.effect) {
            html += `<div class="ref-stat"><span class="ref-label">Effect:</span> ${entry.effect}</div>`;
        }
        if (entry.restrictions) {
            const parts = [];
            if (entry.restrictions.weaponType) parts.push(`Weapon type: ${entry.restrictions.weaponType}`);
            if (entry.restrictions.excludeTraits) parts.push(`Excludes traits: ${entry.restrictions.excludeTraits.join(', ')}`);
            if (entry.restrictions.requireKeywords) parts.push(`Requires keywords: ${entry.restrictions.requireKeywords.join(', ')}`);
            if (entry.restrictions.requireOneOf) parts.push(`Requires: ${entry.restrictions.requireOneOf.join(' or ')}`);
            if (parts.length > 0) {
                html += `<div class="ref-stat"><span class="ref-label">Restrictions:</span> ${parts.join('; ')}</div>`;
            }
        }
        html += `<div class="ref-stat"><span class="ref-label">Value:</span> ${entry.value} &nbsp; <span class="ref-label">Rarity:</span> ${entry.rarity}</div>`;
        html += '</div>';
        if (entry.description) {
            html += `<div class="glossary-entry-description">${entry.description}</div>`;
        }
        return html;
    },

    renderAscensionPackageBody(entry) {
        let html = '<div class="ref-stats">';
        html += `<div class="ref-stat"><span class="ref-label">Cost:</span> ${entry.cost}</div>`;
        if (entry.prerequisites && Object.keys(entry.prerequisites).length > 0) {
            html += `<div class="ref-stat"><span class="ref-label">Prerequisites:</span> ${this.formatPrerequisites(entry.prerequisites)}</div>`;
        }
        if (entry.benefits && entry.benefits.length > 0) {
            html += `<div class="ref-stat"><span class="ref-label">Benefits:</span> ${entry.benefits.join('; ')}</div>`;
        }
        if (entry.keywordsGained && entry.keywordsGained.length > 0) {
            html += `<div class="ref-stat"><span class="ref-label">Keywords Gained:</span> ${entry.keywordsGained.join(', ')}</div>`;
        }
        html += '</div>';
        if (entry.description) {
            html += `<div class="glossary-entry-description">${entry.description}</div>`;
        }
        return html;
    },

    renderArchetypeBody(entry) {
        let html = '<div class="ref-stats">';
        let tierLine = `<span class="ref-label">Tier:</span> ${entry.tier} &nbsp; <span class="ref-label">Cost:</span> ${entry.cost} XP`;
        if (entry.influenceModifier != null && entry.influenceModifier !== 0) {
            tierLine += ` &nbsp; <span class="ref-label">Influence:</span> ${entry.influenceModifier > 0 ? '+' : ''}${entry.influenceModifier}`;
        }
        html += `<div class="ref-stat">${tierLine}</div>`;
        if (entry.species && entry.species.length > 0) {
            const speciesList = entry.species.map(s => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(', ');
            html += `<div class="ref-stat"><span class="ref-label">Species:</span> ${speciesList}</div>`;
        }
        if (entry.faction) {
            html += `<div class="ref-stat"><span class="ref-label">Faction:</span> ${entry.faction}</div>`;
        }
        if (entry.keywords && entry.keywords.length > 0) {
            html += `<div class="ref-stat"><span class="ref-label">Keywords:</span> ${entry.keywords.join(', ')}</div>`;
        }
        if (entry.attributeBonus && Object.keys(entry.attributeBonus).length > 0) {
            const parts = Object.entries(entry.attributeBonus).map(([attr, val]) => `${attr.charAt(0).toUpperCase() + attr.slice(1)} +${val}`);
            html += `<div class="ref-stat"><span class="ref-label">Attribute Bonuses:</span> ${parts.join(', ')}</div>`;
        }
        if (entry.skillBonus && Object.keys(entry.skillBonus).length > 0) {
            const parts = Object.entries(entry.skillBonus).map(([skill, val]) => `${skill.charAt(0).toUpperCase() + skill.slice(1)} +${val}`);
            html += `<div class="ref-stat"><span class="ref-label">Skill Bonuses:</span> ${parts.join(', ')}</div>`;
        }
        if (entry.startingWargear && entry.startingWargear.length > 0) {
            // Wargear entries may be a plain id string or a { id, qty } object.
            const names = entry.startingWargear.map(w => {
                const id = (w && typeof w === 'object') ? w.id : w;
                const qty = (w && typeof w === 'object') ? w.qty : null;
                const item = DataLoader.getWargearItem(id);
                const name = item ? item.name : String(id).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                return (qty && qty > 1) ? `${name} (×${qty})` : name;
            });
            html += `<div class="ref-stat"><span class="ref-label">Starting Wargear:</span> ${names.join(', ')}</div>`;
        }
        html += '</div>';
        if (entry.description) {
            html += `<div class="glossary-entry-description">${entry.description}</div>`;
        }
        if (entry.abilities && entry.abilities.length > 0) {
            html += '<div class="ref-stats" style="margin-top:8px">';
            for (const ab of entry.abilities) {
                html += `<div class="ref-stat"><strong>${this.escapeHtml(ab.name)}:</strong> ${ab.description || ''}</div>`;
            }
            html += '</div>';
        }
        return html;
    },

    renderAbilityBody(entry) {
        let html = '';
        if (entry.parentName) {
            html += `<div class="ref-parent">From: ${this.escapeHtml(entry.parentName)}</div>`;
        }
        if (entry.description) {
            html += `<div class="glossary-entry-description">${entry.description}</div>`;
        }
        return html;
    },

    renderMutationBody(entry) {
        let html = '<div class="ref-stats">';
        if (entry.severity) {
            html += `<div class="ref-stat"><span class="ref-label">Severity:</span> ${entry.severity.charAt(0).toUpperCase() + entry.severity.slice(1)}</div>`;
        }
        if (entry.roll) {
            html += `<div class="ref-stat"><span class="ref-label">Roll:</span> ${entry.roll}</div>`;
        }
        html += '</div>';
        if (entry.description) {
            html += `<div class="glossary-entry-description">${entry.description}</div>`;
        }
        if (entry.effect) {
            html += `<div class="ref-stats" style="margin-top:8px"><div class="ref-stat"><span class="ref-label">Effect:</span> ${entry.effect}</div></div>`;
        }
        return html;
    },

    // ---- Helpers ----

    formatPrerequisites(prereqs) {
        const parts = [];
        if (prereqs.attributes) {
            for (const [attr, val] of Object.entries(prereqs.attributes)) {
                parts.push(`${attr.charAt(0).toUpperCase() + attr.slice(1)} ${val}`);
            }
        }
        if (prereqs.skills) {
            for (const [skill, val] of Object.entries(prereqs.skills)) {
                parts.push(`${skill.charAt(0).toUpperCase() + skill.slice(1)} ${val}`);
            }
        }
        if (prereqs.keywords) {
            parts.push(`Keywords: ${prereqs.keywords.join(', ')}`);
        }
        if (prereqs.species) {
            parts.push(`Species: ${prereqs.species.join(', ')}`);
        }
        if (prereqs.talents) {
            parts.push(`Talents: ${prereqs.talents.join(', ')}`);
        }
        if (prereqs.tier) {
            parts.push(`Tier ${prereqs.tier}+`);
        }
        if (prereqs.story) {
            parts.push(prereqs.story);
        }
        if (prereqs.other) {
            parts.push(prereqs.other);
        }
        return parts.join(', ') || 'None';
    },

    refresh() {
        if (this.allEntries.length === 0) {
            this.loadEntries();
        } else {
            this.renderEntries();
        }
    },

    stripHtml(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    },

    escapeAttr(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    escapeHtml(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};
