// Wargear Tab - Equipment management with improved UI

const WargearTab = {
    currentCategory: 'all',
    searchQuery: '',
    selectedWargearIndex: null, // For upgrade management

    init() {
        // Initialize the upgrade modal
        this.initUpgradeModal();
        RelicWizard.onSaved = () => this.render();
        ImprovisedBuilder.onSaved = () => this.render();
        CustomWargear.onSaved = () => this.render();
        this.render();
    },

    // Initialize the weapon upgrade modal
    initUpgradeModal() {
        if (!document.getElementById('upgrade-modal')) {
            const modal = document.createElement('div');
            modal.id = 'upgrade-modal';
            modal.className = 'modal hidden';
            modal.innerHTML = `
                <div class="modal-content modal-large">
                    <div class="modal-header">
                        <h3 id="upgrade-modal-title">Manage Weapon Upgrades</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div id="upgrade-modal-content"></div>
                    </div>
                    <div class="modal-footer">
                        <button id="btn-close-upgrades" class="btn-primary">Done</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            modal.querySelector('.modal-close').addEventListener('click', () => this.hideUpgradeModal());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.hideUpgradeModal();
            });
            document.getElementById('btn-close-upgrades').addEventListener('click', () => this.hideUpgradeModal());
        }
    },

    render() {
        this.renderCurrentWargear();
        this.renderWargearBrowser();
    },

    // Render currently owned wargear
    renderCurrentWargear() {
        const container = document.getElementById('current-wargear');
        const character = State.getCharacter();

        document.getElementById('wargear-count').textContent = character.wargear.length;

        if (character.wargear.length === 0) {
            container.innerHTML = '<p class="text-muted">No wargear equipped.</p>';
            return;
        }

        // Group wargear by type
        const grouped = {
            weapons: [],
            armor: [],
            augmetics: [],
            equipment: [],
            unknown: []
        };

        for (let i = 0; i < character.wargear.length; i++) {
            const item = character.wargear[i];
            const wargear = DataLoader.getWargearItem(item.id);
            if (!wargear) {
                // The data has no item with this id. Show the entry, so the player can remove it.
                grouped.unknown.push({ id: item.id, wargearIndex: i, isStarting: item.isStarting });
                continue;
            }

            const entry = { ...wargear, wargearIndex: i, isStarting: item.isStarting, upgrades: item.upgrades || [], relic: item.relic, improvised: item.improvised, custom: item.custom };

            if (DataLoader.getWeapon(item.id)) {
                grouped.weapons.push(entry);
            } else if (DataLoader.getArmor(item.id)) {
                grouped.armor.push(entry);
            } else {
                const equip = DataLoader.getEquipment(item.id);
                if (equip && equip.category === 'augmetic') {
                    grouped.augmetics.push(entry);
                } else {
                    grouped.equipment.push(entry);
                }
            }
        }

        let html = '';

        // Weapons
        if (grouped.weapons.length > 0) {
            html += '<div class="wargear-group"><h4>Weapons</h4>';
            html += grouped.weapons.map(w => this.renderOwnedWeapon(w)).join('');
            html += '</div>';
        }

        // Armor
        if (grouped.armor.length > 0) {
            html += '<div class="wargear-group"><h4>Armor</h4>';
            html += grouped.armor.map(a => this.renderOwnedItem(a, 'armor')).join('');
            html += '</div>';
        }

        // Augmetics
        if (grouped.augmetics.length > 0) {
            html += '<div class="wargear-group"><h4>Augmetics</h4>';
            html += grouped.augmetics.map(a => this.renderOwnedItem(a, 'augmetic')).join('');
            html += '</div>';
        }

        // Equipment
        if (grouped.equipment.length > 0) {
            html += '<div class="wargear-group"><h4>Equipment</h4>';
            html += grouped.equipment.map(e => this.renderOwnedItem(e, 'equipment')).join('');
            html += '</div>';
        }

        // Unknown (the id is not in the data)
        if (grouped.unknown.length > 0) {
            html += '<div class="wargear-group"><h4>Unknown</h4>';
            html += grouped.unknown.map(u => this.renderUnknownWargear(u)).join('');
            html += '</div>';
        }

        container.innerHTML = html;

        // Bind event handlers
        container.querySelectorAll('.btn-remove-wargear').forEach(btn => {
            btn.addEventListener('click', async () => {
                const wargearIndex = parseInt(btn.dataset.index, 10);
                const wargearEntry = State.getCharacter().wargear[wargearIndex];
                const item = wargearEntry ? DataLoader.getWargearItem(wargearEntry.id) : null;
                const name = wargearEntry?.relic?.name || wargearEntry?.improvised?.name || (item ? item.name : (wargearEntry ? `Unknown wargear (${wargearEntry.id})` : 'this item'));
                const confirmed = await window.api.showConfirm(`Remove ${name}?`);
                if (!confirmed) return;
                State.removeWargearByIndex(wargearIndex);
                this.render();
            });
        });

        container.querySelectorAll('.btn-manage-upgrades').forEach(btn => {
            btn.addEventListener('click', () => {
                this.showUpgradeModal(parseInt(btn.dataset.index, 10));
            });
        });

        container.querySelectorAll('.btn-edit-relic').forEach(btn => {
            btn.addEventListener('click', () => {
                RelicWizard.open(parseInt(btn.dataset.index, 10));
            });
        });

        container.querySelectorAll('.btn-edit-improvised').forEach(btn => {
            btn.addEventListener('click', () => {
                ImprovisedBuilder.open(parseInt(btn.dataset.index, 10));
            });
        });

        container.querySelectorAll('.btn-edit-custom').forEach(btn => {
            btn.addEventListener('click', () => {
                CustomWargear.open(parseInt(btn.dataset.index, 10));
            });
        });
    },

    // Render an owned weapon with upgrade info
    renderOwnedWeapon(weapon) {
        const upgradeNames = weapon.upgrades.map(id => {
            const upgrade = DataLoader.getWeaponUpgrade(id);
            return upgrade ? this.escapeHtml(upgrade.name) : `<span class="unknown-entry-text">${this.escapeHtml(`Unknown upgrade (${id})`)}</span>`;
        });

        const upgradeText = upgradeNames.length > 0
            ? `<div class="wargear-upgrades">Upgrades: ${upgradeNames.join(', ')}</div>`
            : '';

        const typeLabel = weapon.type === 'melee' ? 'Melee' : 'Ranged';
        const startingBadge = weapon.isStarting ? '<span class="badge-starting">Starting</span>' : '';

        const relicHtml = this.renderRelicInfo(weapon.relic, weapon.name)
            || this.renderImprovisedInfo(weapon.improvised, weapon.name, typeLabel)
            || this.renderCustomInfo(weapon.custom);
        const editClass = weapon.relic ? 'btn-edit-relic' : (weapon.custom ? 'btn-edit-custom' : 'btn-edit-improvised');

        return `
            <div class="wargear-item wargear-item-owned">
                <div class="wargear-info">
                    <div class="wargear-name">${relicHtml ? relicHtml.nameLine : this.escapeHtml(weapon.name)} ${startingBadge}</div>
                    <div class="wargear-type">${relicHtml ? relicHtml.typeLine : `${typeLabel} Weapon${weapon.category ? ' • ' + this.escapeHtml(weapon.category) : ''}`}</div>
                    ${relicHtml ? relicHtml.detailLine : ''}
                    ${upgradeText}
                </div>
                <div class="wargear-actions">
                    ${relicHtml ? `<button class="btn-small ${editClass}" data-index="${weapon.wargearIndex}">Edit</button>` : ''}
                    <button class="btn-small btn-manage-upgrades" data-index="${weapon.wargearIndex}">Upgrades</button>
                    <button class="btn-small btn-remove-wargear" data-index="${weapon.wargearIndex}">Remove</button>
                </div>
            </div>
        `;
    },

    // Render an owned entry whose id is not in the data. It has the Remove control only.
    renderUnknownWargear(entry) {
        const startingBadge = entry.isStarting ? '<span class="badge-starting">Starting</span>' : '';

        return `
            <div class="wargear-item wargear-item-owned">
                <div class="wargear-info">
                    <div class="wargear-name unknown-entry-text">Unknown wargear (${this.escapeHtml(String(entry.id))}) ${startingBadge}</div>
                    <div class="wargear-type">Not in the game data</div>
                </div>
                <div class="wargear-actions">
                    <button class="btn-small btn-remove-wargear" data-index="${this.escapeHtml(String(entry.wargearIndex))}">Remove</button>
                </div>
            </div>
        `;
    },

    // Render an owned non-weapon item
    renderOwnedItem(item, type) {
        const startingBadge = item.isStarting ? '<span class="badge-starting">Starting</span>' : '';
        const typeLabel = type === 'armor' ? 'Armor' : (item.category || 'Equipment');

        const relicHtml = this.renderRelicInfo(item.relic, item.name) || this.renderCustomInfo(item.custom);
        const editClass = item.custom ? 'btn-edit-custom' : 'btn-edit-relic';

        return `
            <div class="wargear-item wargear-item-owned">
                <div class="wargear-info">
                    <div class="wargear-name">${relicHtml ? relicHtml.nameLine : this.escapeHtml(item.name)} ${startingBadge}</div>
                    <div class="wargear-type">${relicHtml ? relicHtml.typeLine : this.escapeHtml(typeLabel)}</div>
                    ${relicHtml ? relicHtml.detailLine : ''}
                </div>
                <div class="wargear-actions">
                    ${relicHtml ? `<button class="btn-small ${editClass}" data-index="${item.wargearIndex}">Edit</button>` : ''}
                    <button class="btn-small btn-remove-wargear" data-index="${item.wargearIndex}">Remove</button>
                </div>
            </div>
        `;
    },

    // Build the name/type/detail line HTML for a relic entry, or null if not a relic
    renderRelicInfo(relic, baseItemName) {
        if (!relic) return null;

        const parts = this.getRelicDisplayParts(relic);
        const choiceText = relic.powerChoice ? ` (${this.escapeHtml(relic.powerChoice)})` : '';
        const oddityText = parts.oddityNames.length ? ` • Oddities: ${this.escapeHtml(parts.oddityNames.join(', '))}` : '';

        return {
            nameLine: `${this.escapeHtml(relic.name)} <span class="badge-relic">Holy Relic</span>`,
            typeLine: `Holy Relic (${this.escapeHtml(parts.formName)}) • ${this.escapeHtml(baseItemName)}`,
            detailLine: `<div class="wargear-relic-detail text-muted">Origin: ${this.escapeHtml(parts.ownerName)}, ${this.escapeHtml(parts.anointmentName)} • Power: ${this.escapeHtml(parts.powerName)}${choiceText}${oddityText}</div>`
        };
    },

    // Build the name/type/detail line HTML for an improvised weapon entry, or null if not improvised
    renderImprovisedInfo(improvised, baseItemName, typeLabel) {
        if (!improvised) return null;

        const details = improvised.details
            ? `<div class="wargear-relic-detail text-muted">${this.escapeHtml(improvised.details)}</div>`
            : '';

        return {
            nameLine: `${this.escapeHtml(improvised.name)} <span class="badge-relic">Improvised</span>`,
            typeLine: `${typeLabel} Weapon • ${this.escapeHtml(baseItemName)}`,
            detailLine: `<div class="wargear-relic-detail text-muted">${this.escapeHtml(ImprovisedBuilder.summary(improvised))}</div>${details}`
        };
    },

    // Build the name/type/detail line HTML for a custom item entry, or null if not custom.
    // formatStatLine returns raw player text, so it is escaped here.
    renderCustomInfo(custom) {
        if (!custom) return null;

        const stats = CustomWargear.formatStatLine(custom);

        return {
            nameLine: `${this.escapeHtml(custom.name)} <span class="badge-relic">Custom</span>`,
            typeLine: this.escapeHtml(CustomWargear.typeLabel(custom)),
            detailLine: stats ? `<div class="wargear-relic-detail text-muted">${this.escapeHtml(stats)}</div>` : ''
        };
    },

    // Resolve a relic's id fields to display names via DataLoader.getHolyRelics(),
    // falling back to the raw id if the lookup misses (e.g. data not yet loaded).
    getRelicDisplayParts(relic) {
        const relics = DataLoader.getHolyRelics();
        if (!relics) {
            return {
                formName: relic.form,
                ownerName: relic.originalOwner,
                anointmentName: relic.anointment,
                powerName: relic.power,
                oddityNames: relic.oddities || []
            };
        }

        const form = relics.forms[relic.form];
        const owner = relics.origins.originalOwner.entries.find(e => e.id === relic.originalOwner);
        const anointment = relics.origins.anointment.entries.find(e => e.id === relic.anointment);

        let power = null;
        for (const table of Object.values(relics.powers)) {
            power = table.entries.find(e => e.id === relic.power);
            if (power) break;
        }

        const oddityNames = (relic.oddities || []).map(id => {
            const oddity = relics.oddities.entries.find(e => e.id === id);
            return oddity ? oddity.name : id;
        });

        return {
            formName: form ? form.name : relic.form,
            ownerName: owner ? owner.name : relic.originalOwner,
            anointmentName: anointment ? anointment.name : relic.anointment,
            powerName: power ? power.name : relic.power,
            oddityNames
        };
    },

    // Render the wargear browser with categories
    renderWargearBrowser() {
        const container = document.getElementById('additional-wargear');
        const character = State.getCharacter();
        const archetype = DataLoader.getArchetype(character.archetype?.id);

        // Always show starting wargear button when archetype has starting wargear
        let startingGearHtml = '';

        if (archetype && archetype.startingWargear && archetype.startingWargear.length > 0) {
            startingGearHtml = `
                <div class="starting-wargear-notice">
                    <h4>Starting Wargear</h4>
                    <p>Your archetype (${archetype.name}) provides starting wargear:</p>
                    <ul>
                        ${archetype.startingWargear.map(entry => {
                            const id = typeof entry === 'string' ? entry : entry.id;
                            const qty = typeof entry === 'object' ? (entry.qty || 1) : 1;
                            const item = DataLoader.getWargearItem(id);
                            const name = item?.name || id;
                            return `<li>${qty > 1 ? qty + 'x ' : ''}${name}</li>`;
                        }).join('')}
                    </ul>
                    <button class="btn-primary" id="btn-add-starting">Add Starting Wargear</button>
                </div>
            `;
        }

        // Build ascension wargear sections for archetype ascensions
        let ascensionGearHtml = '';
        const character2 = State.getCharacter();
        for (const asc of character2.ascensions || []) {
            if (asc.type === 'archetype' && asc.archetypeId) {
                const ascArchetype = DataLoader.getArchetype(asc.archetypeId);
                if (ascArchetype?.startingWargear && ascArchetype.startingWargear.length > 0) {
                    ascensionGearHtml += `
                        <div class="starting-wargear-notice">
                            <h4>Ascension Wargear (${ascArchetype.name})</h4>
                            <p>Your archetype ascension to ${ascArchetype.name} provides wargear:</p>
                            <ul>
                                ${ascArchetype.startingWargear.map(entry => {
                                    const id = typeof entry === 'string' ? entry : entry.id;
                                    const qty = typeof entry === 'object' ? (entry.qty || 1) : 1;
                                    const item = DataLoader.getWargearItem(id);
                                    const name = item?.name || id;
                                    return `<li>${qty > 1 ? qty + 'x ' : ''}${name}</li>`;
                                }).join('')}
                            </ul>
                            <button class="btn-primary btn-add-ascension-wargear" data-archetype-id="${ascArchetype.id}">Add ${ascArchetype.name} Wargear</button>
                        </div>
                    `;
                }
            }
        }

        // Holy Relic entry card (Redacted Records II)
        const holyRelicCtaHtml = State.isSourceEnabled('redacted2') ? `
            <div class="holy-relic-cta">
                <div class="holy-relic-cta-text">
                    <h4>Holy Relic</h4>
                    <p>Sanctify a piece of wargear using the Relic creation rules from Redacted Records II (pp. 12–19): choose a Form, a base item, Origins, a Power, and Oddities.</p>
                </div>
                <button class="btn-primary" id="btn-build-relic">Build a Holy Relic</button>
            </div>
        ` : '';

        // Improvised Weaponry entry card (Redacted Records I), only for characters with the talent
        const improvisedCtaHtml = State.hasTalent('improvised_weaponry') ? `
            <div class="holy-relic-cta">
                <div class="holy-relic-cta-text">
                    <h4>Improvised Weapon</h4>
                    <p>Fashion a crude weapon with the Improvised Weaponry talent from Redacted Records I (pp. 65–66): choose a profile, then spend Shifts on its options.</p>
                </div>
                <button class="btn-primary" id="btn-build-improvised">Build an Improvised Weapon</button>
            </div>
        ` : '';

        // Custom Wargear entry card (issue #33): always shown, it needs no source book and no talent
        const customCtaHtml = `
            <div class="holy-relic-cta">
                <div class="holy-relic-cta-text">
                    <h4>Custom Wargear</h4>
                    <p>Make your own weapon, armor, augmetic or other item, with its own stats, traits and keywords.</p>
                </div>
                <button class="btn-primary" id="btn-build-custom">Create Custom Wargear</button>
            </div>
        `;

        container.innerHTML = `
            ${startingGearHtml}
            ${ascensionGearHtml}
            ${holyRelicCtaHtml}
            ${improvisedCtaHtml}
            ${customCtaHtml}
            <div class="wargear-browser">
                <div class="wargear-browser-controls">
                    <input type="text" id="wargear-search" class="search-input" placeholder="Search wargear..." value="${this.escapeHtml(this.searchQuery)}">
                    <div class="wargear-category-tabs">
                        <button class="wargear-tab-btn ${this.currentCategory === 'all' ? 'active' : ''}" data-category="all">All</button>
                        <button class="wargear-tab-btn ${this.currentCategory === 'melee' ? 'active' : ''}" data-category="melee">Melee</button>
                        <button class="wargear-tab-btn ${this.currentCategory === 'ranged' ? 'active' : ''}" data-category="ranged">Ranged</button>
                        <button class="wargear-tab-btn ${this.currentCategory === 'grenades' ? 'active' : ''}" data-category="grenades">Grenades & Missiles</button>
                        <button class="wargear-tab-btn ${this.currentCategory === 'armor' ? 'active' : ''}" data-category="armor">Armor</button>
                        <button class="wargear-tab-btn ${this.currentCategory === 'augmetics' ? 'active' : ''}" data-category="augmetics">Augmetics</button>
                        <button class="wargear-tab-btn ${this.currentCategory === 'equipment' ? 'active' : ''}" data-category="equipment">Equipment</button>
                    </div>
                </div>
                <div id="wargear-browser-list" class="wargear-browser-list">
                    ${this.renderBrowserItems()}
                </div>
            </div>
        `;

        // Bind events
        if (document.getElementById('btn-build-relic')) {
            document.getElementById('btn-build-relic').addEventListener('click', () => {
                RelicWizard.open();
            });
        }

        if (document.getElementById('btn-build-improvised')) {
            document.getElementById('btn-build-improvised').addEventListener('click', () => {
                ImprovisedBuilder.open();
            });
        }

        if (document.getElementById('btn-build-custom')) {
            document.getElementById('btn-build-custom').addEventListener('click', () => {
                CustomWargear.open();
            });
        }

        if (document.getElementById('btn-add-starting')) {
            document.getElementById('btn-add-starting').addEventListener('click', () => {
                this.addStartingWargear(archetype.startingWargear);
                this.render();
            });
        }

        // Ascension wargear buttons
        container.querySelectorAll('.btn-add-ascension-wargear').forEach(btn => {
            btn.addEventListener('click', () => {
                const ascArchetypeId = btn.dataset.archetypeId;
                const ascArchetype = DataLoader.getArchetype(ascArchetypeId);
                if (ascArchetype?.startingWargear) {
                    this.addStartingWargear(ascArchetype.startingWargear);
                    this.render();
                }
            });
        });

        document.getElementById('wargear-search').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            document.getElementById('wargear-browser-list').innerHTML = this.renderBrowserItems();
            this.bindBrowserItemEvents();
        });

        container.querySelectorAll('.wargear-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.wargear-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentCategory = btn.dataset.category;
                document.getElementById('wargear-browser-list').innerHTML = this.renderBrowserItems();
                this.bindBrowserItemEvents();
            });
        });

        this.bindBrowserItemEvents();
    },

    // Add the starting wargear of a list (strings and { id, qty } objects) once.
    // An id that the data does not have is skipped. The wanted count of an id is its quantity over the whole list.
    // The starting entries that the list already has count against it, less the ones that the kept custom archetype record lists.
    addStartingWargear(entries) {
        const wanted = new Map();
        for (const entry of entries) {
            if (typeof entry === 'string') {
                wanted.set(entry, (wanted.get(entry) || 0) + 1);
            } else if (entry && typeof entry === 'object' && entry.id) {
                wanted.set(entry.id, (wanted.get(entry.id) || 0) + (entry.qty || 1));
            }
        }
        const character = State.getCharacter();
        const record = Array.isArray(character.customArchetype?.wargear) ? character.customArchetype.wargear : [];
        for (const [id, qty] of wanted) {
            if (!DataLoader.getWargearItem(id)) continue;
            const present = character.wargear.filter(w => w.id === id && w.isStarting === true && !w.relic && !w.improvised && !w.custom).length;
            const listed = record.filter(r => r === id).length;
            const add = Math.max(0, qty - Math.max(0, present - listed));
            for (let i = 0; i < add; i++) {
                State.addWargear(id, true);
            }
        }
    },

    // Render browser items based on current category and search
    renderBrowserItems() {
        const weapons = DataLoader.getAllWeapons() || [];
        const armor = DataLoader.getAllArmor() || [];
        const equipment = DataLoader.getAllEquipment() || [];
        const character = State.getCharacter();

        // Count how many of each item is owned
        const ownedCounts = {};
        for (const item of character.wargear) {
            ownedCounts[item.id] = (ownedCounts[item.id] || 0) + 1;
        }

        // Filter by enabled sources first
        const filterBySource = (items) => items.filter(item => State.isSourceEnabled(item.source));

        // Filter by search
        const filterBySearch = (items) => {
            if (!this.searchQuery) return items;
            return items.filter(item => {
                const searchable = `${item.name} ${item.category || ''} ${(item.traits || []).join(' ')} ${(item.keywords || []).join(' ')}`.toLowerCase();
                return searchable.includes(this.searchQuery);
            });
        };

        let html = '';

        // Render Melee Weapons (the improvised_ base records are only built through the Improvised Weaponry builder)
        if (this.currentCategory === 'all' || this.currentCategory === 'melee') {
            const meleeWeapons = filterBySearch(filterBySource(weapons.filter(w => w.type === 'melee' && !w.id.startsWith('improvised_'))));
            if (meleeWeapons.length > 0) {
                html += this.renderMeleeWeaponsCards(meleeWeapons, ownedCounts);
            }
        }

        // Render Ranged Weapons
        if (this.currentCategory === 'all' || this.currentCategory === 'ranged') {
            const rangedWeapons = filterBySearch(filterBySource(weapons.filter(w => w.type === 'ranged' && !w.id.startsWith('improvised_'))));
            if (rangedWeapons.length > 0) {
                html += this.renderRangedWeaponsCards(rangedWeapons, ownedCounts);
            }
        }

        // Render Grenades & Missiles
        if (this.currentCategory === 'grenades') {
            const grenadeCategories = ['Grenade', 'Missile', 'Explosive'];
            const grenadeWeapons = filterBySearch(filterBySource(weapons.filter(w => {
                if (w.category && grenadeCategories.includes(w.category)) return true;
                const kws = (w.keywords || []).map(k => k.toUpperCase());
                return kws.includes('GRENADE') || kws.includes('MISSILE');
            })));
            if (grenadeWeapons.length > 0) {
                html += this.renderRangedWeaponsCards(grenadeWeapons, ownedCounts, 'Grenades & Missiles');
            }
        }

        // Render Armor
        if (this.currentCategory === 'all' || this.currentCategory === 'armor') {
            const armorItems = filterBySearch(filterBySource(armor));
            if (armorItems.length > 0) {
                html += this.renderArmorCards(armorItems, ownedCounts);
            }
        }

        // Render Augmetics
        if (this.currentCategory === 'all' || this.currentCategory === 'augmetics') {
            const augmeticItems = filterBySearch(filterBySource(equipment.filter(e => e.category === 'augmetic')));
            if (augmeticItems.length > 0) {
                html += this.renderEquipmentCards(augmeticItems, ownedCounts, 'Augmetics');
            }
        }

        // Render Equipment
        if (this.currentCategory === 'all' || this.currentCategory === 'equipment') {
            const equipmentItems = filterBySearch(filterBySource(equipment.filter(e => e.category !== 'augmetic')));
            if (equipmentItems.length > 0) {
                html += this.renderEquipmentCards(equipmentItems, ownedCounts, 'Equipment');
            }
        }

        if (html === '') {
            return '<p class="text-muted">No items found.</p>';
        }

        return html;
    },

    // Render melee weapons cards
    renderMeleeWeaponsCards(weapons, ownedCounts) {
        weapons.sort((a, b) => a.name.localeCompare(b.name));

        const cards = weapons.map(w => {
            const ownedCount = ownedCounts[w.id] || 0;
            const damage = this.formatMeleeDamage(w);
            const reach = w.reach || '-';
            const rarityClass = this.getRarityClass(w.rarity);
            const reqDN = DataLoader.requisitionDN(w);
            const ownedBadge = ownedCount > 0 ? `<span class="owned-count">${ownedCount}</span>` : '';
            const traits = (w.traits || []);
            const keywords = (w.keywords || []);

            const traitsHtml = traits.length > 0
                ? `<div class="wargear-card-traits">${traits.join(', ')}</div>`
                : '';

            const keywordsHtml = keywords.length > 0
                ? `<div class="wargear-card-keywords">${keywords.map(k => `<span class="wargear-card-keyword">${k}</span>`).join('')}</div>`
                : '';

            return `
                <div class="wargear-card">
                    <div class="wargear-card-header">
                        <div>
                            <span class="wargear-card-name">${w.name}</span>
                            <span class="wargear-card-type">Melee${w.category ? ' • ' + w.category : ''}</span>
                        </div>
                        <div class="wargear-card-actions">
                            <span class="wargear-card-meta">Value: ${w.value ?? '-'} • <span class="${rarityClass}">${DataLoader.formatRarity(w.rarity || 'Common')}</span>${reqDN != null ? ` • DN ${reqDN}` : ''}</span>
                            ${ownedBadge}
                            <button class="btn-small btn-add-wargear" data-id="${w.id}">Add</button>
                        </div>
                    </div>
                    <div class="wargear-card-stats">
                        <div><span class="wargear-card-stat-label">Damage</span><span>${damage}</span></div>
                        <div><span class="wargear-card-stat-label">ED</span><span>${w.ed || 0}</span></div>
                        <div><span class="wargear-card-stat-label">AP</span><span>${w.ap != null ? w.ap : '-'}</span></div>
                        <div><span class="wargear-card-stat-label">Reach</span><span>${reach}</span></div>
                    </div>
                    ${traitsHtml}
                    ${keywordsHtml}
                    <div class="source-ref">${DataLoader.formatSourcePage(w)}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="wargear-table-section">
                <h4>Melee Weapons</h4>
                ${cards}
            </div>
        `;
    },

    // Render ranged weapons cards
    renderRangedWeaponsCards(weapons, ownedCounts, sectionTitle = 'Ranged Weapons') {
        weapons.sort((a, b) => a.name.localeCompare(b.name));

        const cards = weapons.map(w => {
            const ownedCount = ownedCounts[w.id] || 0;
            // The data holds a range as text for some weapons (grenades, thrown weapons) and as short/medium/long for the others.
            const range = typeof w.range === 'string' ? this.escapeHtml(w.range)
                : w.range ? `${w.range.short}/${w.range.medium}/${w.range.long}` : '-';
            const rarityClass = this.getRarityClass(w.rarity);
            const reqDN = DataLoader.requisitionDN(w);
            const ownedBadge = ownedCount > 0 ? `<span class="owned-count">${ownedCount}</span>` : '';
            const traits = (w.traits || []);
            const keywords = (w.keywords || []);

            const traitsHtml = traits.length > 0
                ? `<div class="wargear-card-traits">${traits.join(', ')}</div>`
                : '';

            const keywordsHtml = keywords.length > 0
                ? `<div class="wargear-card-keywords">${keywords.map(k => `<span class="wargear-card-keyword">${k}</span>`).join('')}</div>`
                : '';

            return `
                <div class="wargear-card">
                    <div class="wargear-card-header">
                        <div>
                            <span class="wargear-card-name">${w.name}</span>
                            <span class="wargear-card-type">Ranged${w.category ? ' • ' + w.category : ''}</span>
                        </div>
                        <div class="wargear-card-actions">
                            <span class="wargear-card-meta">Value: ${w.value ?? '-'} • <span class="${rarityClass}">${DataLoader.formatRarity(w.rarity || 'Common')}</span>${reqDN != null ? ` • DN ${reqDN}` : ''}</span>
                            ${ownedBadge}
                            <button class="btn-small btn-add-wargear" data-id="${w.id}">Add</button>
                        </div>
                    </div>
                    <div class="wargear-card-stats">
                        <div><span class="wargear-card-stat-label">Damage</span><span>${w.damage?.base || 0}</span></div>
                        <div><span class="wargear-card-stat-label">ED</span><span>${w.ed || 0}</span></div>
                        <div><span class="wargear-card-stat-label">AP</span><span>${w.ap != null ? w.ap : '-'}</span></div>
                        <div><span class="wargear-card-stat-label">Range</span><span>${range}</span></div>
                        <div><span class="wargear-card-stat-label">Salvo</span><span>${w.salvo || '-'}</span></div>
                    </div>
                    ${traitsHtml}
                    ${keywordsHtml}
                    <div class="source-ref">${DataLoader.formatSourcePage(w)}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="wargear-table-section">
                <h4>${sectionTitle}</h4>
                ${cards}
            </div>
        `;
    },

    // Render armor cards
    renderArmorCards(armorItems, ownedCounts) {
        armorItems.sort((a, b) => a.name.localeCompare(b.name));

        const cards = armorItems.map(a => {
            const ownedCount = ownedCounts[a.id] || 0;
            const rarityClass = this.getRarityClass(a.rarity);
            const reqDN = DataLoader.requisitionDN(a);
            const ownedBadge = ownedCount > 0 ? `<span class="owned-count">${ownedCount}</span>` : '';
            const traits = (a.traits || []);
            const keywords = (a.keywords || []);

            const traitsHtml = traits.length > 0
                ? `<div class="wargear-card-traits">${traits.join(', ')}</div>`
                : '';

            const keywordsHtml = keywords.length > 0
                ? `<div class="wargear-card-keywords">${keywords.map(k => `<span class="wargear-card-keyword">${k}</span>`).join('')}</div>`
                : '';

            return `
                <div class="wargear-card">
                    <div class="wargear-card-header">
                        <div>
                            <span class="wargear-card-name">${a.name}</span>
                            <span class="wargear-card-type">Armor</span>
                        </div>
                        <div class="wargear-card-actions">
                            <span class="wargear-card-meta">Value: ${a.value ?? '-'} • <span class="${rarityClass}">${DataLoader.formatRarity(a.rarity || 'Common')}</span>${reqDN != null ? ` • DN ${reqDN}` : ''}</span>
                            ${ownedBadge}
                            <button class="btn-small btn-add-wargear" data-id="${a.id}">Add</button>
                        </div>
                    </div>
                    <div class="wargear-card-stats">
                        <div><span class="wargear-card-stat-label">AR</span><span>${a.ar || 0}</span></div>
                    </div>
                    ${traitsHtml}
                    ${keywordsHtml}
                    <div class="source-ref">${DataLoader.formatSourcePage(a)}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="wargear-table-section">
                <h4>Armor</h4>
                ${cards}
            </div>
        `;
    },

    // Render equipment cards
    renderEquipmentCards(equipmentItems, ownedCounts, sectionTitle = 'Equipment') {
        equipmentItems.sort((a, b) => a.name.localeCompare(b.name));

        const cards = equipmentItems.map(e => {
            const ownedCount = ownedCounts[e.id] || 0;
            const effect = e.effect || e.description || '';
            const rarityClass = this.getRarityClass(e.rarity);
            const reqDN = DataLoader.requisitionDN(e);
            const ownedBadge = ownedCount > 0 ? `<span class="owned-count">${ownedCount}</span>` : '';
            const keywords = (e.keywords || []);

            const effectHtml = effect
                ? `<div class="wargear-card-effect">${effect}</div>`
                : '';

            const keywordsHtml = keywords.length > 0
                ? `<div class="wargear-card-keywords">${keywords.map(k => `<span class="wargear-card-keyword">${k}</span>`).join('')}</div>`
                : '';

            return `
                <div class="wargear-card">
                    <div class="wargear-card-header">
                        <div>
                            <span class="wargear-card-name">${e.name}</span>
                            <span class="wargear-card-type">${e.category || 'Equipment'}</span>
                        </div>
                        <div class="wargear-card-actions">
                            <span class="wargear-card-meta">Value: ${e.value ?? '-'} • <span class="${rarityClass}">${DataLoader.formatRarity(e.rarity || 'Common')}</span>${reqDN != null ? ` • DN ${reqDN}` : ''}</span>
                            ${ownedBadge}
                            <button class="btn-small btn-add-wargear" data-id="${e.id}">Add</button>
                        </div>
                    </div>
                    ${effectHtml}
                    ${keywordsHtml}
                    <div class="source-ref">${DataLoader.formatSourcePage(e)}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="wargear-table-section">
                <h4>${sectionTitle}</h4>
                ${cards}
            </div>
        `;
    },

    // Format melee damage like the book: (S) +X
    formatMeleeDamage(weapon) {
        const base = weapon.damage?.base || 0;
        const bonus = weapon.damage?.bonus || 0;
        const total = base + bonus;

        if (weapon.damage?.attribute === 'strength') {
            return `(S) +${total}`;
        }
        return `${total}`;
    },

    // Get CSS class for rarity
    getRarityClass(rarity) {
        if (!rarity) return 'rarity-common';
        return 'rarity-' + rarity.toLowerCase().replace(' ', '-');
    },

    // Bind events to browser items
    bindBrowserItemEvents() {
        const container = document.getElementById('wargear-browser-list');
        if (!container) return;

        container.querySelectorAll('.btn-add-wargear').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                State.addWargear(btn.dataset.id, false);
                this.render();
            });
        });

        // Enhance card text with glossary tooltips
        if (typeof Glossary !== 'undefined' && Glossary.enhanceElement) {
            container.querySelectorAll('.wargear-card-traits, .wargear-card-effect').forEach(el => {
                Glossary.enhanceElement(el);
            });
        }
    },

    // Show the upgrade modal for a weapon
    showUpgradeModal(wargearIndex) {
        this.selectedWargearIndex = wargearIndex;
        const character = State.getCharacter();
        const item = character.wargear[wargearIndex];
        const weapon = DataLoader.getWeapon(item.id);

        if (!weapon) return;

        const currentUpgrades = item.upgrades || [];
        const validUpgrades = DataLoader.getValidUpgradesForWeapon(weapon, currentUpgrades);

        const modal = document.getElementById('upgrade-modal');
        const title = document.getElementById('upgrade-modal-title');
        const content = document.getElementById('upgrade-modal-content');

        title.textContent = `Upgrades: ${weapon.name}`;

        // Count non-distinction upgrades
        const upgradeCount = currentUpgrades.filter(id => {
            const upgrade = DataLoader.getWeaponUpgrade(id);
            return upgrade && !upgrade.doesNotCountTowardLimit;
        }).length;

        let html = `
            <div class="upgrade-info">
                <p>Upgrades: ${upgradeCount}/3 (Distinction doesn't count toward limit)</p>
                <p class="text-muted">A weapon may have only one upgrade of each type.</p>
            </div>
        `;

        // Current upgrades
        if (currentUpgrades.length > 0) {
            html += '<div class="upgrade-section"><h4>Current Upgrades</h4>';
            html += '<div class="upgrade-list">';
            for (const upgradeId of currentUpgrades) {
                const upgrade = DataLoader.getWeaponUpgrade(upgradeId);
                if (!upgrade) {
                    // The data has no upgrade with this id. Show it, so the player can remove it.
                    html += `
                    <div class="upgrade-item upgrade-owned">
                        <div class="upgrade-info">
                            <span class="upgrade-name unknown-entry-text">Unknown upgrade (${this.escapeHtml(String(upgradeId))})</span>
                        </div>
                        <button class="btn-small btn-remove-upgrade" data-id="${this.escapeHtml(String(upgradeId))}">Remove</button>
                    </div>
                `;
                    continue;
                }

                html += `
                    <div class="upgrade-item upgrade-owned">
                        <div class="upgrade-info">
                            <span class="upgrade-name">${upgrade.name}</span>
                            <span class="upgrade-type">${upgrade.type}</span>
                        </div>
                        <div class="upgrade-effect">${upgrade.effect}</div>
                        <button class="btn-small btn-remove-upgrade" data-id="${upgrade.id}">Remove</button>
                    </div>
                `;
            }
            html += '</div></div>';
        }

        // Available upgrades
        html += '<div class="upgrade-section"><h4>Available Upgrades</h4>';
        if (validUpgrades.length === 0) {
            html += '<p class="text-muted">No more upgrades available for this weapon.</p>';
        } else {
            html += '<div class="upgrade-list">';
            for (const upgrade of validUpgrades) {
                const upgDN = DataLoader.requisitionDN(upgrade);
                html += `
                    <div class="upgrade-item">
                        <div class="upgrade-header">
                            <span class="upgrade-name">${upgrade.name}</span>
                            <span class="upgrade-type">${upgrade.type}</span>
                            <span class="upgrade-rarity">${DataLoader.formatRarity(upgrade.rarity)}</span>
                        </div>
                        <div class="upgrade-effect">${upgrade.effect}</div>
                        <div class="upgrade-meta">
                            <span>Value: ${upgrade.value}${upgDN != null ? ` • DN ${upgDN}` : ''}</span>
                        </div>
                        <button class="btn-small btn-add-upgrade" data-id="${upgrade.id}">Add Upgrade</button>
                    </div>
                `;
            }
            html += '</div>';
        }
        html += '</div>';

        content.innerHTML = html;

        // Enhance upgrade effects with glossary tooltips
        if (typeof Glossary !== 'undefined' && Glossary.enhanceElement) {
            content.querySelectorAll('.upgrade-effect').forEach(el => {
                Glossary.enhanceElement(el);
            });
        }

        // Bind events
        content.querySelectorAll('.btn-add-upgrade').forEach(btn => {
            btn.addEventListener('click', () => {
                State.addWeaponUpgrade(this.selectedWargearIndex, btn.dataset.id);
                this.showUpgradeModal(this.selectedWargearIndex); // Refresh modal
                this.renderCurrentWargear(); // Update main display
            });
        });

        content.querySelectorAll('.btn-remove-upgrade').forEach(btn => {
            btn.addEventListener('click', () => {
                State.removeWeaponUpgrade(this.selectedWargearIndex, btn.dataset.id);
                this.showUpgradeModal(this.selectedWargearIndex); // Refresh modal
                this.renderCurrentWargear(); // Update main display
            });
        });

        modal.classList.remove('hidden');
    },

    // Hide the upgrade modal
    hideUpgradeModal() {
        const modal = document.getElementById('upgrade-modal');
        modal.classList.add('hidden');
        this.selectedWargearIndex = null;
    },

    refresh() {
        this.render();
    },

    // Helper: Escape HTML for safe insertion
    escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
};
