// Vehicles Tab - Church of Steel vehicle list and book-style detail card

const VehiclesTab = {
    selectedVehicleId: null,
    _searchTimer: null,
    filters: {
        search: '',
        faction: 'all'
    },

    init() {
        const searchInput = document.getElementById('vehicle-search-input');
        searchInput.addEventListener('input', (e) => {
            this.filters.search = e.target.value;
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => this.renderVehicleList(), 300);
        });

        const factionSelect = document.getElementById('vehicle-faction-filter');
        factionSelect.innerHTML = '<option value="all">All Factions</option>' +
            this.getFactions().map(faction => `<option value="${faction}">${faction}</option>`).join('');
        factionSelect.addEventListener('change', (e) => {
            this.filters.faction = e.target.value;
            this.renderVehicleList();
        });

        // One delegated listener serves every list item
        document.getElementById('vehicle-list').addEventListener('click', (e) => {
            const item = e.target.closest('.vehicle-list-item');
            if (item) this.selectVehicle(item.dataset.vehicleId);
        });

        this.renderVehicleList();
    },

    refresh() {
        this.renderVehicleList();
        if (this.selectedVehicleId) {
            this.renderVehicleDetail(this.selectedVehicleId);
        }
    },

    // ===== Rendering =====

    renderVehicleList() {
        const container = document.getElementById('vehicle-list');
        const vehicles = this.getFilteredVehicles();

        if (vehicles.length === 0) {
            container.innerHTML = `
                <div class="threat-list-empty">
                    <p>No vehicles match your filters</p>
                </div>
            `;
            return;
        }

        container.innerHTML = vehicles.map(vehicle => `
            <div class="vehicle-list-item ${this.selectedVehicleId === vehicle.id ? 'selected' : ''}"
                 data-vehicle-id="${vehicle.id}">
                <div class="vehicle-list-header">
                    <span class="vehicle-list-name">${DataLoader.getVehicleDisplayName(vehicle)}</span>
                    <span class="vehicle-list-value">${vehicle.value} / ${vehicle.rarity}</span>
                </div>
                <div class="vehicle-list-faction">${vehicle.faction}</div>
            </div>
        `).join('');
    },

    renderVehicleDetail(vehicleId, container = null) {
        const el = container || document.getElementById('vehicle-detail');
        if (!el) return;

        const vehicle = DataLoader.getVehicle(vehicleId);
        if (!vehicle) {
            el.innerHTML = `
                <div class="threat-detail-placeholder">
                    <p>Vehicle not found</p>
                </div>
            `;
            return;
        }

        el.innerHTML = this.renderVehicleCard(vehicle);
        this.bindCardPopups(el);

        el.querySelector('.vehicle-add-btn').addEventListener('click', () => {
            if (EncounterState.addVehicle(vehicle.id)) {
                ThreatsTab.showAddedNotification(`Added ${DataLoader.getVehicleDisplayName(vehicle)} to encounter`);
            }
        });

        // Select the family in place. A hash change would close the mobile sheet, and the sheet's
        // clean-up timer would then empty the reopened sheet.
        el.querySelector('.vehicle-variant-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.selectVehicle(e.currentTarget.dataset.vehicleId);
        });
    },

    renderVehicleCard(vehicle) {
        const family = vehicle.variantOf ? DataLoader.getVehicle(vehicle.variantOf) : null;
        const requisitionDN = DataLoader.requisitionDN(vehicle);

        return `
            <div class="threat-card vehicle-card">
                <div class="threat-card-header">
                    <div class="threat-card-header-top">
                        <h2 class="threat-card-title">${vehicle.name}</h2>
                        <div class="threat-card-header-actions">
                            <button class="header-add-btn vehicle-add-btn">Add to Encounter</button>
                        </div>
                    </div>
                    ${family ? `<a class="vehicle-link vehicle-variant-link" href="#vehicles/${family.id}" data-vehicle-id="${family.id}">Variant of ${family.name}</a>` : ''}
                    <div class="vehicle-card-meta">
                        <span class="vehicle-card-faction">${vehicle.faction}</span>
                        <span><span class="vehicle-meta-label">Value:</span> ${vehicle.value}</span>
                        <span><span class="vehicle-meta-label">Rarity:</span> ${DataLoader.formatRarity(vehicle.rarity)}</span>
                        ${requisitionDN != null ? `<span><span class="vehicle-meta-label">Requisition DN:</span> ${requisitionDN}</span>` : ''}
                    </div>
                    <span class="threat-card-source">${DataLoader.formatSourcePage(vehicle)}</span>
                </div>
                <div class="threat-card-body">
                    ${vehicle.description ? `<div class="threat-card-description">${vehicle.description}</div>` : ''}
                    ${this.renderVehicleStats(vehicle)}
                    ${vehicle.options ? this.renderTextBlock('Options', vehicle.options) : ''}
                    ${vehicle.sidebar ? this.renderSidebar(vehicle.sidebar) : ''}
                    ${this.renderFamilySection(vehicle, family)}
                </div>
            </div>
        `;
    },

    // Compressed card for the Encounter Builder's detail panel
    renderVehicleCardMini(vehicle) {
        return `
            <div class="mini-card">
                <div class="mini-card-header">Vehicle Stats</div>
                <div class="mini-card-body">
                    ${this.renderVehicleStats(vehicle)}
                </div>
            </div>
        `;
    },

    // Stat block shared by the full card and the compressed card
    renderVehicleStats(vehicle) {
        return `
            <div class="threat-stats-section vehicle-stats">
                ${this.renderStatStrip(vehicle)}
                ${this.renderChipRow('Keywords', this.renderKeywordChips(vehicle.keywords))}
                <div class="threat-keywords-row">
                    <span class="threat-keywords-label">Crew Complement:</span>
                    <span class="vehicle-crew">${vehicle.crew || '-'}</span>
                </div>
                ${this.renderChipRow('Traits', this.renderTraitChips(vehicle.traits))}
                ${this.renderWeaponsTable(vehicle.weapons)}
                ${this.renderWargearList(vehicle.wargear)}
            </div>
        `;
    },

    renderStatStrip(vehicle) {
        return `
            <table class="threat-stat-table vehicle-stat-strip">
                <thead>
                    <tr>
                        <th title="Speed">Spd</th>
                        <th title="Manoeuvre">Man</th>
                        <th title="Resilience">Res</th>
                        <th title="Wounds">W</th>
                        <th>Size</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="stat-value">${vehicle.speed}</td>
                        <td class="stat-value">${vehicle.manoeuvre}</td>
                        <td class="stat-value">${vehicle.resilience}</td>
                        <td class="stat-value">${vehicle.wounds}</td>
                        <td class="stat-value">${vehicle.size}</td>
                    </tr>
                </tbody>
            </table>
        `;
    },

    renderChipRow(label, chipsHtml) {
        return `
            <div class="threat-keywords-row">
                <span class="threat-keywords-label">${label}:</span>
                ${chipsHtml || '<span class="vehicle-none">-</span>'}
            </div>
        `;
    },

    // A keyword with a glossary entry opens it; a keyword without one is a plain chip
    renderKeywordChips(keywords) {
        return (keywords || []).map(keyword => {
            const key = this.findKeywordKey(keyword);
            return key
                ? `<span class="vehicle-chip vehicle-chip-keyword" data-popup-type="keyword" data-popup-key="${key}">${keyword}</span>`
                : `<span class="vehicle-chip vehicle-chip-keyword">${keyword}</span>`;
        }).join('');
    },

    // A trait keeps its printed value ("Turbo Boost (2)") and opens the base entry (turbo_boost)
    renderTraitChips(traits) {
        return (traits || []).map(trait => {
            const key = this.findTraitKey(trait);
            return key
                ? `<span class="vehicle-chip" data-popup-type="vehicleTrait" data-popup-key="${key}">${trait}</span>`
                : `<span class="vehicle-chip">${trait}</span>`;
        }).join('');
    },

    renderWeaponsTable(lines) {
        if (!lines || lines.length === 0) {
            return `
                <div class="bonuses-section">
                    <div class="bonuses-header">Weapons</div>
                    <div class="bonus-item vehicle-none">-</div>
                </div>
            `;
        }

        const rows = lines.flatMap(line => this.buildWeaponRows(line)).map(row => {
            if (!row.resolved) {
                return `<tr><td class="vehicle-weapon-name" colspan="7">${this.renderWeaponName(row)}</td></tr>`;
            }
            return `
                <tr>
                    <td class="vehicle-weapon-name">${this.renderWeaponName(row)}</td>
                    <td>${row.damage}</td>
                    <td>${row.ed}</td>
                    <td>${row.ap}</td>
                    <td>${row.rangeReach}</td>
                    <td>${row.salvo}</td>
                    <td class="vehicle-weapon-traits" data-glossary-enhance>${row.traits}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="bonuses-section">
                <div class="bonuses-header">Weapons</div>
                <div class="vehicle-table-scroll">
                    <table class="threat-stat-table vehicle-weapons-table">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Damage</th>
                                <th>ED</th>
                                <th>AP</th>
                                <th>Range/Reach</th>
                                <th>Salvo</th>
                                <th>Traits</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    },

    // The printed text, with its word "Twin" turned into a marker that opens the Twin Weapons rule
    renderWeaponName(row) {
        if (!row.twin) return row.text;
        const marker = '<span class="vehicle-twin-marker" data-popup-type="vehicleRule" data-popup-key="twin_weapons">Twin</span>';
        const marked = row.text.replace(/\bTwin\b/, marker);
        return marked === row.text ? `${row.text} ${marker}` : marked;
    },

    renderWargearList(items) {
        const rows = (items || []).map(item => {
            const row = this.buildWargearRow(item);
            return row.effect
                ? `<div class="bonus-item"><span class="bonus-name">${row.text}:</span> <span class="bonus-description" data-glossary-enhance>${row.effect}</span></div>`
                : `<div class="bonus-item"><span class="bonus-name">${row.text}</span></div>`;
        }).join('');

        return `
            <div class="bonuses-section">
                <div class="bonuses-header">Wargear</div>
                ${rows || '<div class="bonus-item vehicle-none">-</div>'}
            </div>
        `;
    },

    renderTextBlock(label, text) {
        return `
            <div class="bonuses-section">
                <div class="bonuses-header">${label}</div>
                <div class="threat-text-section">${text}</div>
            </div>
        `;
    },

    // A rule box printed inside the entry (Shokk Tunnel, p. 106)
    renderSidebar(sidebar) {
        return `
            <div class="vehicle-sidebar-box">
                <div class="vehicle-sidebar-title">${sidebar.title}</div>
                <div class="threat-text-section">${sidebar.text}</div>
            </div>
        `;
    },

    // A variant without its own paragraph or loadout shows the family's text under the family name
    renderFamilySection(vehicle, family) {
        if (!family) return '';
        const parts = [];
        if (vehicle.description == null && family.description) {
            parts.push(`<div class="threat-text-section">${family.description}</div>`);
        }
        if (vehicle.options == null && family.options) {
            parts.push(`<div class="threat-text-section">${family.options}</div>`);
        }
        if (parts.length === 0) return '';
        return `
            <div class="bonuses-section vehicle-family-section">
                <div class="bonuses-header">${family.name}</div>
                ${parts.join('')}
            </div>
        `;
    },

    // ===== Event Handlers =====

    selectVehicle(vehicleId) {
        this.selectedVehicleId = vehicleId;

        // Update the URL hash without a hashchange event
        history.replaceState(null, '', '#vehicles/' + vehicleId);

        document.querySelectorAll('.vehicle-list-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.vehicleId === vehicleId);
        });
        const selectedItem = document.querySelector('.vehicle-list-item.selected');
        if (selectedItem) {
            selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        // On mobile the detail opens in the shared bottom sheet
        if (window.innerWidth <= 768) {
            BottomSheet.open(
                div => this.renderVehicleDetail(vehicleId, div),
                () => {
                    this.selectedVehicleId = null;
                    document.querySelectorAll('.vehicle-list-item.selected')
                        .forEach(el => el.classList.remove('selected'));
                    history.replaceState(null, '', ' ');
                }
            );
        } else {
            this.renderVehicleDetail(vehicleId);
        }
    },

    // Chips open their glossary entry; weapon traits and wargear effects get inline links
    bindCardPopups(container) {
        container.querySelectorAll('[data-popup-type]').forEach(chip => {
            chip.addEventListener('click', (e) => {
                // The document click handler closes every popup, so the click stops here
                e.stopPropagation();
                Glossary.showEntryPopup(chip.dataset.popupType, chip.dataset.popupKey, chip);
            });
        });
        Glossary.enhanceDescriptions(container);
    },

    // ===== Helpers =====

    // The faction names in the data, sorted
    getFactions() {
        return [...new Set(DataLoader.getVehicles().map(v => v.faction))].sort();
    },

    // Vehicles that pass the source toggle, the faction select and the search, sorted by display name
    getFilteredVehicles() {
        const search = this.filters.search.trim().toLowerCase();
        return DataLoader.getVehicles()
            .filter(v => SettingsTab.isSourceEnabled(v.source))
            .filter(v => this.filters.faction === 'all' || v.faction === this.filters.faction)
            .filter(v => !search || this.matchesSearch(v, search))
            .sort((a, b) => DataLoader.getVehicleDisplayName(a).localeCompare(DataLoader.getVehicleDisplayName(b)));
    },

    // Search covers the display name (so a family name finds its variants), the description and the keywords
    matchesSearch(vehicle, search) {
        if (DataLoader.getVehicleDisplayName(vehicle).toLowerCase().includes(search)) return true;
        if (vehicle.description && vehicle.description.toLowerCase().includes(search)) return true;
        return (vehicle.keywords || []).some(keyword => keyword.toLowerCase().includes(search));
    },

    // The weapons-table rows of one printed line. A line with a record gives one row with the
    // printed text. A `profileIds` line gives one row per profile, named by the record. A line with
    // neither gives one row with the printed text alone (`resolved: false`).
    buildWeaponRows(line) {
        const twin = line.twin === true;
        if (Array.isArray(line.profileIds)) {
            const profiles = line.profileIds.map(id => DataLoader.getWeapon(id)).filter(Boolean);
            if (profiles.length > 0) {
                return profiles.map(weapon => this._weaponRow(weapon.name, twin, weapon));
            }
        }
        const weapon = line.weaponId ? DataLoader.getWeapon(line.weaponId) : null;
        return [this._weaponRow(line.text, twin, weapon)];
    },

    // One row. A melee record carries reach; a ranged record carries range.
    _weaponRow(text, twin, weapon) {
        const row = { text, twin, resolved: !!weapon };
        if (!weapon) return row;

        const dmg = weapon.damage || {};
        const flat = (dmg.base || 0) + (dmg.bonus || 0);
        const rangeReach = weapon.type === 'melee' ? weapon.reach : this.formatRange(weapon.range);
        return {
            ...row,
            damage: dmg.attribute ? `${dmg.attribute.charAt(0).toUpperCase()}+${flat}` : `${flat}`,
            ed: weapon.ed,
            ap: weapon.ap,
            rangeReach: rangeReach ?? '-',
            salvo: weapon.salvo ?? '-',
            traits: (weapon.traits || []).join(', ') || '-'
        };
    },

    formatRange(range) {
        if (range && typeof range === 'object') return `${range.short}/${range.medium}/${range.long}`;
        return range ?? null;
    },

    // One wargear line: the printed text, plus the record's effect text when the line resolves
    buildWargearRow(item) {
        const record = item.equipmentId ? DataLoader.getAllEquipment().find(e => e.id === item.equipmentId) : null;
        return { text: item.text, effect: record && record.effect ? record.effect : null };
    },

    // Glossary keyword key for a printed keyword (a name match in any case), or null
    findKeywordKey(keyword) {
        const keywords = DataLoader.getGlossary().keywords || {};
        const target = keyword.toLowerCase();
        const hit = Object.entries(keywords).find(([, entry]) => entry.name.toLowerCase() === target);
        return hit ? hit[0] : null;
    },

    // vehicleTraits key for a printed trait ("Turbo Boost (2)" -> "turbo_boost"), or null
    findTraitKey(trait) {
        const traits = DataLoader.getGlossary().vehicleTraits || {};
        const base = this._traitBase(trait);
        const hit = Object.entries(traits).find(([, entry]) => this._traitBase(entry.name) === base);
        return hit ? hit[0] : null;
    },

    // Drop a trailing value such as "(2)" or "(X)", fold case, and treat hyphens as spaces
    _traitBase(name) {
        return String(name).replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().replace(/[\s-]+/g, ' ').trim();
    }
};
