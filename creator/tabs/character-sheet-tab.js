// Character Sheet Tab - Renders a comprehensive character summary

const CharacterSheetTab = {
    // Table-of-contents floating button + panel (created once in init)
    _tocFab: null,
    _tocPanel: null,
    _tocEscHandler: null,
    _tocDismissHandler: null,

    // Initialize the tab
    init() {
        // Print button
        document.getElementById('btn-print').addEventListener('click', () => {
            this.print();
        });

        // Copy Summary button
        document.getElementById('btn-copy-summary').addEventListener('click', (e) => {
            this.copySummary(e.target);
        });

        // Build the table-of-contents FAB + panel once, and keep its
        // visibility tied to whether the Character Sheet tab is active.
        this._ensureTocElements();
        this._observeTabVisibility();
    },

    // Refresh the character sheet
    refresh() {
        this.render();
    },

    // Render the full character sheet
    render() {
        const character = State.getCharacter();

        // Repair any background selections missing bonusType
        this.repairBackgroundBonusTypes(character);

        const species = DataLoader.getSpecies(character.species?.id);
        const archetype = DataLoader.getArchetype(character.archetype?.id);
        const keywords = State.getKeywords();
        const armorBreakdown = DerivedStats.getArmorBreakdown(character);
        const derivedStats = DerivedStats.getAllDerivedStats(character, armorBreakdown);
        const resilienceBreakdown = DerivedStats.getResilienceBreakdown(character);
        const defenceBreakdown = DerivedStats.getDefenceBreakdown(character);

        const container = document.getElementById('character-sheet-content');

        container.innerHTML = `
            ${this.renderHeader(character, species, archetype, keywords)}
            <div class="sheet-body">
                <div class="sheet-body-left">
                    <div class="sheet-columns">
                        <div class="sheet-column">
                            ${this.renderAttributes(character)}
                            ${this.renderTraits(derivedStats, { resilience: resilienceBreakdown, defence: defenceBreakdown })}
                        </div>
                        <div class="sheet-column">
                            ${this.renderSkills(character)}
                        </div>
                    </div>
                    ${this.renderPsychicPowers(character)}
                    ${this.renderSpeciesAbilities(character, species)}
                    ${this.renderArchetypeAbilities(archetype)}
                    ${this.renderAscensions(character)}
                    ${this.renderTalents(character)}
                    ${this.renderInjuriesCorruption(character)}
                    ${this.renderBackground(character)}
                    ${this.renderNotes(character)}
                </div>
                <div class="sheet-body-right">
                    ${this.renderWeapons(character)}
                    ${this.renderArmor(character)}
                    ${this.renderAugmetics(character)}
                    ${this.renderEquipment(character)}
                    ${this.renderHolyRelics(character)}
                </div>
            </div>
        `;

        // Apply glossary enhancement to the character sheet
        this.enhanceWithGlossary(container);

        // Bind weapon equip checkboxes
        this.bindWeaponEquipCheckboxes(container);

        // Bind glossary-style breakdown tooltips for stat cells and traits
        this.bindBreakdownTooltips(container);

        // Bind session tracking controls
        this.bindSessionTrackingControls(container);

        // Give each section a stable id and rebuild the jump-to-section list
        this._assignSectionIds(container);
        this._buildTocList();
    },

    // ===== Table of Contents (jump-to-section) =====

    // Create the floating button + panel once and append them to #app
    _ensureTocElements() {
        if (this._tocFab) return;

        const app = document.getElementById('app');
        if (!app) return;

        const fab = document.createElement('button');
        fab.className = 'sheet-toc-fab';
        fab.setAttribute('aria-label', 'Jump to section');
        fab.setAttribute('title', 'Jump to section');
        fab.innerHTML = '&#9776;';

        const panel = document.createElement('div');
        panel.className = 'sheet-toc-panel hidden';
        panel.innerHTML = `
            <div class="sheet-toc-header">Jump to Section</div>
            <ul class="sheet-toc-list"></ul>
        `;

        // Toggle the panel when the button is clicked
        fab.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleTocPanel();
        });

        // Jumping to a section hides the panel (event delegation)
        panel.querySelector('.sheet-toc-list').addEventListener('click', (e) => {
            const item = e.target.closest('.sheet-toc-item');
            if (!item) return;
            const target = document.getElementById(item.dataset.sectionId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            this._closeTocPanel();
        });

        app.appendChild(fab);
        app.appendChild(panel);
        this._tocFab = fab;
        this._tocPanel = panel;
    },

    // Show/hide the FAB based on whether the Character Sheet tab is active
    _observeTabVisibility() {
        const tab = document.getElementById('tab-character-sheet');
        if (!tab) return;

        const sync = () => {
            const active = tab.classList.contains('active');
            if (this._tocFab) this._tocFab.classList.toggle('hidden', !active);
            // Never leave the panel open when the tab is hidden
            if (!active) this._closeTocPanel();
        };

        new MutationObserver(sync).observe(tab, {
            attributes: true,
            attributeFilter: ['class']
        });
        sync();
    },

    // Slugify a section title for use as a stable element id
    _slugifySection(text) {
        return 'sheet-section-' + text
            .toLowerCase()
            .replace(/&/g, ' and ')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    },

    // Assign an id to each rendered section based on its title
    _assignSectionIds(container) {
        const used = new Set();
        container.querySelectorAll('.sheet-section').forEach(section => {
            const titleEl = section.querySelector('.sheet-section-title');
            if (!titleEl) return; // header block has no h2
            let id = this._slugifySection(titleEl.textContent);
            // Guard against duplicate slugs
            let unique = id;
            let n = 2;
            while (used.has(unique)) unique = `${id}-${n++}`;
            used.add(unique);
            section.id = unique;
        });
    },

    // Rebuild the TOC list from the currently rendered sections
    _buildTocList() {
        if (!this._tocPanel) return;
        const container = document.getElementById('character-sheet-content');
        if (!container) return;

        const list = this._tocPanel.querySelector('.sheet-toc-list');
        const items = [];
        container.querySelectorAll('.sheet-section').forEach(section => {
            const titleEl = section.querySelector('.sheet-section-title');
            if (!titleEl || !section.id) return;
            items.push(`<li class="sheet-toc-item" data-section-id="${section.id}">${this.escapeHtml(titleEl.textContent)}</li>`);
        });
        list.innerHTML = items.join('');
    },

    _toggleTocPanel() {
        if (!this._tocPanel) return;
        if (this._tocPanel.classList.contains('hidden')) {
            this._openTocPanel();
        } else {
            this._closeTocPanel();
        }
    },

    _openTocPanel() {
        if (!this._tocPanel) return;
        this._buildTocList();
        this._tocPanel.classList.remove('hidden');

        // Dismiss on outside click
        this._tocDismissHandler = (e) => {
            if (!this._tocPanel.contains(e.target) && e.target !== this._tocFab) {
                this._closeTocPanel();
            }
        };
        setTimeout(() => document.addEventListener('click', this._tocDismissHandler), 0);

        // Dismiss on Escape
        this._tocEscHandler = (e) => {
            if (e.key === 'Escape') this._closeTocPanel();
        };
        document.addEventListener('keydown', this._tocEscHandler);
    },

    _closeTocPanel() {
        if (this._tocPanel) this._tocPanel.classList.add('hidden');
        if (this._tocDismissHandler) {
            document.removeEventListener('click', this._tocDismissHandler);
            this._tocDismissHandler = null;
        }
        if (this._tocEscHandler) {
            document.removeEventListener('keydown', this._tocEscHandler);
            this._tocEscHandler = null;
        }
    },

    // Bind event handlers for session tracking (boxes and +/- buttons)
    bindSessionTrackingControls(container) {
        // Clickable boxes for wounds and shock
        container.querySelectorAll('.tracking-box').forEach(box => {
            box.addEventListener('click', () => {
                const type = box.dataset.type;
                const index = parseInt(box.dataset.index, 10);
                const isFilled = box.classList.contains('filled');

                // Clicking a filled box clears it and all after it
                // Clicking an empty box fills it and all before it
                if (type === 'wounds') {
                    if (isFilled) {
                        State.setCurrentWounds(index);
                    } else {
                        State.setCurrentWounds(index + 1);
                    }
                } else if (type === 'shock') {
                    if (isFilled) {
                        State.setCurrentShock(index);
                    } else {
                        State.setCurrentShock(index + 1);
                    }
                }

                this.render();
            });
        });

        // Plus/minus buttons for wealth, wrath, and faith
        container.querySelectorAll('.tracker-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                const isPlus = btn.classList.contains('tracker-plus');
                const delta = isPlus ? 1 : -1;

                if (type === 'wealth') {
                    State.modifyCurrentWealth(delta);
                } else if (type === 'wrath') {
                    State.modifyCurrentWrath(delta);
                } else if (type === 'faith') {
                    State.modifyCurrentFaith(delta);
                }

                this.render();
            });
        });
    },

    // Bind event handlers for weapon equip checkboxes
    bindWeaponEquipCheckboxes(container) {
        const checkboxes = container.querySelectorAll('.weapon-equip-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const wargearIndex = parseInt(e.target.dataset.wargearIndex, 10);
                State.toggleWeaponEquipped(wargearIndex);
                // Re-render to update damage calculations
                this.render();
            });
        });
    },

    // Enhance the character sheet with glossary functionality
    enhanceWithGlossary(container) {
        if (typeof Glossary !== 'undefined' && Glossary.data) {
            // Process trait cells
            const traitCells = container.querySelectorAll('.sheet-traits-cell');
            traitCells.forEach(cell => {
                Glossary.enhanceElement(cell);
            });

            // Process ability EFFECT text only (not flavor text or descriptions)
            const effectDescriptions = container.querySelectorAll('.sheet-ability-effect, .sheet-talent-effect, .sheet-power-desc');
            effectDescriptions.forEach(desc => {
                Glossary.enhanceElement(desc);
            });

            // Process keywords in header
            const headerKeywords = container.querySelectorAll('.sheet-keyword');
            headerKeywords.forEach(kw => {
                Glossary.enhanceElement(kw);
            });

            // Process mini keywords in tables and item details
            const miniKeywords = container.querySelectorAll('.sheet-mini-keyword');
            miniKeywords.forEach(kw => {
                Glossary.enhanceElement(kw);
            });

            // Process mutation effect text
            const mutationEffects = container.querySelectorAll('.sheet-mutation-effect');
            mutationEffects.forEach(eff => {
                Glossary.enhanceElement(eff);
            });

            // Process equipment effects only (not descriptions - those are flavor)
            const equipEffects = container.querySelectorAll('.sheet-equip-effect');
            equipEffects.forEach(eff => {
                Glossary.enhanceElement(eff);
            });

            // Weapon upgrade names are pre-wrapped as glossary terms — only attach handlers
            const upgradeCells = container.querySelectorAll('.sheet-weapon-upgrades');
            upgradeCells.forEach(cell => {
                Glossary.attachHandlers(cell);
            });

            // NOTE: .sheet-item-description is intentionally NOT processed - these are flavor text
        }
    },

    // Render the header section
    renderHeader(character, species, archetype, keywords) {
        const name = character.name || 'Unnamed Character';
        let speciesName = species?.name || '-';

        // Add chapter/path info to species name if applicable
        if (species?.subOptions && character.species?.subOptions) {
            const subOptionsConfig = Array.isArray(species.subOptions) ? species.subOptions : [species.subOptions];
            const subOptionNames = [];

            for (const config of subOptionsConfig) {
                // Only add chapter or single-select options to the header
                if (!config.countByTier) {
                    const selected = character.species.subOptions.find(opt => opt.type === config.type);
                    if (selected) {
                        const option = config.options?.find(o => o.id === selected.optionId);
                        if (option) {
                            subOptionNames.push(option.name);
                        }
                    }
                }
            }

            if (subOptionNames.length > 0) {
                speciesName = `${speciesName} (${subOptionNames.join(', ')})`;
            }
        }

        const archetypeName = character.archetype?.id === 'custom'
            ? (character.customArchetype?.name || 'Custom Archetype')
            : (archetype?.name || '-');
        const tier = character.tier || 1;
        const effectiveTier = State.getEffectiveTier();
        const rank = character.rank || 1;

        const keywordHtml = keywords.length > 0
            ? keywords.map(k => `<span class="sheet-keyword">${k}</span>`).join('')
            : '<span class="sheet-keyword">-</span>';

        const tierDisplay = `Tier ${effectiveTier}`;

        return `
            <div class="sheet-section sheet-header-section">
                <h1 class="sheet-character-name">${this.escapeHtml(name)}</h1>
                <div class="sheet-subtitle">
                    ${speciesName} &bull; ${archetypeName} &bull; ${tierDisplay} &bull; Rank ${rank}
                </div>
                <div class="sheet-keywords">
                    ${keywordHtml}
                </div>
            </div>
        `;
    },

    // Render traits (formerly derived stats) in compact 2-column grid
    renderTraits(stats, breakdowns = {}) {
        // Get current session values (wounds/shock count UP from 0)
        const currentWounds = State.getCurrentWounds();
        const currentShock = State.getCurrentShock();
        const currentWealth = State.getCurrentWealth();

        // Build tooltip text from breakdown
        const buildTooltip = (breakdown) => {
            if (!breakdown || !breakdown.breakdown) return '';
            const lines = breakdown.breakdown.map(p => {
                return `${p.label}: ${p.value}`;
            });
            lines.push(`Total: ${breakdown.value}`);
            return lines.join('\n');
        };

        // Static traits (non-editable)
        const staticTraits = [
            { name: 'Defence', value: stats.defence, key: 'defence' },
            { name: 'Resilience', value: stats.resilience, key: 'resilience' },
            { name: 'Determination', value: stats.determination },
            { name: 'Speed', value: stats.speed },
            { name: 'Conviction', value: stats.conviction },
            { name: 'Resolve', value: stats.resolve },
            { name: 'Pass. Aware.', value: stats.passiveAwareness },
            { name: 'Influence', value: stats.influence }
        ];

        const staticItems = staticTraits.map(stat => {
            const breakdown = stat.key ? breakdowns[stat.key] : null;
            const hasTip = breakdown && breakdown.breakdown && breakdown.breakdown.length > 1;
            const tooltipAttr = hasTip ? ` title="${this.escapeHtml(buildTooltip(breakdown))}"` : '';
            const tappableClass = hasTip ? ' sheet-trait-tappable' : '';

            return `
                <div class="sheet-compact-item${tappableClass}"${tooltipAttr}>
                    <span class="sheet-compact-name">${stat.name}</span>
                    <span class="sheet-compact-value">${stat.value}</span>
                </div>
            `;
        }).join('');

        // Generate wound boxes
        const woundBoxes = this.renderTrackingBoxes('wounds', currentWounds, stats.maxWounds);

        // Generate shock boxes
        const shockBoxes = this.renderTrackingBoxes('shock', currentShock, stats.maxShock);

        // Get Wrath and Faith values
        const currentWrath = State.getCurrentWrath();
        const currentFaith = State.getCurrentFaith();
        const maxFaith = State.getMaxFaith();

        // Wrath tracker (always shown)
        const wrathTracker = `
            <div class="tracker-column">
                <span class="tracker-label">Wrath</span>
                <div class="tracker-controls">
                    <button class="tracker-btn tracker-minus" data-type="wrath">−</button>
                    <span class="tracker-value">${currentWrath}</span>
                    <button class="tracker-btn tracker-plus" data-type="wrath">+</button>
                </div>
            </div>
        `;

        // Faith tracker (only shown if character has Faith)
        const faithTracker = maxFaith > 0 ? `
            <div class="tracker-column">
                <span class="tracker-label">Faith</span>
                <div class="tracker-controls">
                    <button class="tracker-btn tracker-minus" data-type="faith">−</button>
                    <span class="tracker-value">${currentFaith}</span>
                    <button class="tracker-btn tracker-plus" data-type="faith">+</button>
                </div>
            </div>
        ` : '';

        // Wealth tracker
        const wealthTracker = `
            <div class="tracker-column">
                <span class="tracker-label">Wealth</span>
                <div class="tracker-controls">
                    <button class="tracker-btn tracker-minus" data-type="wealth">−</button>
                    <span class="tracker-value">${currentWealth}</span>
                    <button class="tracker-btn tracker-plus" data-type="wealth">+</button>
                </div>
            </div>
        `;

        return `
            <div class="sheet-section sheet-derived-section">
                <h2 class="sheet-section-title">Traits</h2>
                <div class="sheet-compact-grid sheet-traits-grid">
                    ${staticItems}
                </div>
                <div class="sheet-tracking-section">
                    <div class="tracker-row">
                        <span class="tracker-label">Wounds</span>
                        <div class="tracking-boxes">${woundBoxes}</div>
                    </div>
                    <div class="tracker-row">
                        <span class="tracker-label">Shock</span>
                        <div class="tracking-boxes">${shockBoxes}</div>
                    </div>
                    <div class="tracker-row-horizontal">
                        ${wrathTracker}
                        ${faithTracker}
                        ${wealthTracker}
                    </div>
                </div>
            </div>
        `;
    },

    // Render clickable tracking boxes for wounds/shock
    renderTrackingBoxes(type, current, max) {
        let boxes = '';
        for (let i = 0; i < max; i++) {
            const filled = i < current ? 'filled' : '';
            boxes += `<span class="tracking-box ${filled}" data-type="${type}" data-index="${i}"></span>`;
        }
        return boxes;
    },

    // Render attributes in compact 2-column grid
    renderAttributes(character) {
        const equipBonuses = DerivedStats.getEquipmentBonuses(character);

        const attributes = [
            { key: 'strength', name: 'Strength', abbrev: 'STR' },
            { key: 'toughness', name: 'Toughness', abbrev: 'TOU' },
            { key: 'agility', name: 'Agility', abbrev: 'AGI' },
            { key: 'initiative', name: 'Initiative', abbrev: 'INI' },
            { key: 'willpower', name: 'Willpower', abbrev: 'WIL' },
            { key: 'intellect', name: 'Intellect', abbrev: 'INT' },
            { key: 'fellowship', name: 'Fellowship', abbrev: 'FEL' }
        ];

        const items = attributes.map(attr => {
            const baseValue = character.attributes?.[attr.key] || 1;
            const attrBonuses = equipBonuses[attr.key] || [];
            const equipTotal = attrBonuses.reduce((sum, b) => sum + b.value, 0);
            const effectiveValue = baseValue + equipTotal;

            // Build tooltip for attributes with equipment bonuses
            let tooltipAttr = '';
            let tappableClass = '';
            if (equipTotal !== 0) {
                const lines = [`Base: ${baseValue}`];
                for (const b of attrBonuses) {
                    lines.push(`${b.value > 0 ? '+' : ''}${b.value} ${b.source}`);
                }
                lines.push(`Total: ${effectiveValue}`);
                tappableClass = ' sheet-trait-tappable';
                tooltipAttr = ` title="${this.escapeHtml(lines.join('\n'))}"`;
            }

            return `
                <div class="sheet-compact-item${tappableClass}"${tooltipAttr}>
                    <span class="sheet-compact-name">${attr.name}</span>
                    <span class="sheet-compact-value">${effectiveValue}</span>
                    <span class="sheet-compact-abbrev">[${attr.abbrev}]</span>
                </div>
            `;
        }).join('');

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Attributes</h2>
                <div class="sheet-compact-grid sheet-attributes-grid">
                    ${items}
                </div>
            </div>
        `;
    },

    // Render skills
    renderSkills(character) {
        const skills = [
            { key: 'athletics', name: 'Athletics', attr: 'strength' },
            { key: 'awareness', name: 'Awareness', attr: 'intellect' },
            { key: 'ballisticSkill', name: 'Ballistic Skill', attr: 'agility' },
            { key: 'cunning', name: 'Cunning', attr: 'fellowship' },
            { key: 'deception', name: 'Deception', attr: 'fellowship' },
            { key: 'insight', name: 'Insight', attr: 'fellowship' },
            { key: 'intimidation', name: 'Intimidation', attr: 'willpower' },
            { key: 'investigation', name: 'Investigation', attr: 'intellect' },
            { key: 'leadership', name: 'Leadership', attr: 'willpower' },
            { key: 'medicae', name: 'Medicae', attr: 'intellect' },
            { key: 'persuasion', name: 'Persuasion', attr: 'fellowship' },
            { key: 'pilot', name: 'Pilot', attr: 'agility' },
            { key: 'psychicMastery', name: 'Psychic Mastery', attr: 'willpower' },
            { key: 'scholar', name: 'Scholar', attr: 'intellect' },
            { key: 'stealth', name: 'Stealth', attr: 'agility' },
            { key: 'survival', name: 'Survival', attr: 'willpower' },
            { key: 'tech', name: 'Tech', attr: 'intellect' },
            { key: 'weaponSkill', name: 'Weapon Skill', attr: 'initiative' }
        ];

        const attrAbbrevs = {
            strength: 'STR',
            toughness: 'TOU',
            agility: 'AGI',
            initiative: 'INI',
            willpower: 'WIL',
            intellect: 'INT',
            fellowship: 'FEL'
        };

        const rows = skills.map(skill => {
            const rating = character.skills?.[skill.key] || 0;
            const attrValue = DerivedStats.getEffectiveAttribute(character, skill.attr);
            const subOptionBonus = DerivedStats.getSpeciesSubOptionSkillBonus(character, skill.key);
            const total = rating + attrValue + subOptionBonus;
            const abbrev = attrAbbrevs[skill.attr];

            // Show bonus indicator if there's a species sub-option bonus
            const bonusIndicator = subOptionBonus > 0
                ? `<span class="sheet-skill-bonus" title="+${subOptionBonus} from Path">+${subOptionBonus}</span>`
                : '';

            return `
                <tr>
                    <td class="sheet-skill-name">${skill.name}</td>
                    <td class="sheet-skill-rating">${rating}</td>
                    <td class="sheet-skill-attr">${abbrev}</td>
                    <td class="sheet-skill-total">${total}${bonusIndicator}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Skills</h2>
                <table class="sheet-table sheet-skills-table">
                    <thead>
                        <tr>
                            <th>Skill</th>
                            <th>Rating</th>
                            <th>Attr</th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    },

    // Render weapons
    renderWeapons(character) {
        const weapons = [];
        const simultaneousStrike = this.getSimultaneousStrikeInfo(character);
        const equippedWeapons = State.getEquippedWeapons();

        for (let i = 0; i < (character.wargear || []).length; i++) {
            const item = character.wargear[i];
            const weapon = DataLoader.getWeapon(item.id);
            if (weapon) {
                const isEquipped = State.isWeaponEquipped(i);
                const upgrades = item.upgrades || [];
                const upgradeDetails = upgrades.map(id => DataLoader.getWeaponUpgrade(id)).filter(u => u);
                const damageInfo = this.calculateWeaponDamageDetailed(weapon, character, i, simultaneousStrike, equippedWeapons, upgradeDetails);
                const attackDice = this.calculateAttackDice(weapon, character, upgradeDetails);
                weapons.push({
                    ...weapon,
                    wargearIndex: i,
                    isEquipped: isEquipped,
                    calculatedDamage: damageInfo,
                    upgradeDetails: upgradeDetails,
                    attackDice: attackDice,
                    relic: item.relic
                });
            }
        }

        if (weapons.length === 0) {
            return `
                <div class="sheet-section">
                    <h2 class="sheet-section-title">Weapons</h2>
                    <p class="sheet-empty">No weapons equipped</p>
                </div>
            `;
        }

        // Check if Simultaneous Strike is active
        const hasSimultaneousStrike = simultaneousStrike !== null;
        const rows = weapons.map(weapon => {
            // Combine base traits with upgrade-added traits
            let allTraits = [...(weapon.traits || [])];
            for (const upgrade of weapon.upgradeDetails) {
                if (upgrade.addsTraits) {
                    allTraits = allTraits.concat(upgrade.addsTraits);
                }
                if (upgrade.removesTraits) {
                    allTraits = allTraits.filter(t => !upgrade.removesTraits.includes(t));
                }
            }
            // Filter out "Power Field" - it's a keyword, not a trait
            allTraits = allTraits.filter(t => t.toUpperCase() !== 'POWER FIELD');
            const traits = allTraits.length > 0
                ? `<span class="sheet-traits-cell">${allTraits.join(', ')}</span>`
                : '-';

            const range = weapon.type === 'ranged' && weapon.range
                ? (typeof weapon.range === 'string' ? weapon.range
                    : `${weapon.range.short ?? '-'}/${weapon.range.medium ?? '-'}/${weapon.range.long ?? '-'}m`)
                : '-';

            // Build upgrade names display (each name is a glossary term with a popout)
            const upgradeNames = weapon.upgradeDetails.map(u =>
                `<span class="glossary-term" data-term-key="${u.id}" data-term-type="weaponUpgrade">${u.name}</span>`
            ).join(', ');
            const upgradesDisplay = upgradeNames
                ? `<div class="sheet-weapon-upgrades">${upgradeNames}</div>`
                : '';

            // Only show equip checkbox for compatible weapons when Simultaneous Strike is active
            let equipCell = '';
            if (hasSimultaneousStrike) {
                const isCompatible = this.isWeaponCompatibleWithSimultaneousStrike(weapon, simultaneousStrike);
                if (isCompatible) {
                    const checked = weapon.isEquipped ? 'checked' : '';
                    equipCell = `<td class="sheet-weapon-equip" rowspan="2"><input type="checkbox" class="weapon-equip-checkbox" data-wargear-index="${weapon.wargearIndex}" ${checked}></td>`;
                } else {
                    equipCell = '<td class="sheet-weapon-equip" rowspan="2">-</td>';
                }
            }

            // Build tooltip-enabled cells for Dice, ED, and AP
            const diceTooltip = weapon.attackDice.tooltip ? ` title="${this.escapeHtml(weapon.attackDice.tooltip)}"` : '';
            const edTooltip = weapon.calculatedDamage.edTooltip ? ` title="${this.escapeHtml(weapon.calculatedDamage.edTooltip)}"` : '';
            const apTooltip = weapon.calculatedDamage.apTooltip ? ` title="${this.escapeHtml(weapon.calculatedDamage.apTooltip)}"` : '';
            const damageTooltip = weapon.calculatedDamage.damageTooltip ? ` title="${this.escapeHtml(weapon.calculatedDamage.damageTooltip)}"` : '';

            // Build description and keywords row
            const description = weapon.description || '';
            const keywords = weapon.keywords?.length > 0
                ? weapon.keywords.map(k => `<span class="sheet-mini-keyword">${k}</span>`).join(' ')
                : '';
            const hasDescOrKeywords = description || keywords;
            const colSpan = hasSimultaneousStrike ? 7 : 6;

            // Rarity display
            const rarityClass = this.getRarityClass(weapon.rarity);
            const rarityDisplay = weapon.rarity && weapon.rarity !== 'Common'
                ? `<span class="sheet-item-rarity ${rarityClass}">${weapon.rarity}</span>`
                : '';

            // Relic weapons display under their custom name with the base weapon in parentheses
            const displayName = weapon.relic
                ? `${this.escapeHtml(weapon.relic.name)} (${weapon.name})`
                : weapon.name;

            const descRow = hasDescOrKeywords ? `
                <tr class="sheet-weapon-desc-row">
                    <td colspan="${colSpan}">
                        <div class="sheet-item-details">
                            ${description ? `<span class="sheet-item-description">${description}</span>` : ''}
                            ${keywords ? `<span class="sheet-item-keywords">${keywords}</span>` : ''}
                        </div>
                    </td>
                </tr>
            ` : '';

            return `
                <tbody class="sheet-weapon-group">
                    <tr>
                        ${equipCell}
                        <td class="sheet-weapon-name" rowspan="2">${displayName}${rarityDisplay}${upgradesDisplay}<div class="source-ref">${DataLoader.formatSourcePage(weapon)}</div></td>
                        <td class="sheet-weapon-dice" rowspan="2"${diceTooltip}>${weapon.attackDice.display}</td>
                        <td class="sheet-weapon-damage" colspan="2"${damageTooltip}>${weapon.calculatedDamage.display}</td>
                        <td class="sheet-weapon-range" rowspan="2">${range}</td>
                        <td class="sheet-weapon-traits" rowspan="2">${traits}</td>
                    </tr>
                    <tr class="sheet-weapon-sub-row">
                        <td class="sheet-weapon-ap"${apTooltip}>${weapon.calculatedDamage.apDisplay} AP</td>
                        <td class="sheet-weapon-ed"${edTooltip}>${weapon.calculatedDamage.edDisplay} ED</td>
                    </tr>
                    ${descRow}
                </tbody>
            `;
        }).join('');

        const equipHeaderCell = hasSimultaneousStrike ? '<th rowspan="2" class="sheet-weapon-equip-header">In Hand</th>' : '';

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Weapons</h2>
                ${hasSimultaneousStrike ? '<p class="sheet-note">Check "In Hand" for weapons being dual-wielded with Simultaneous Strike</p>' : ''}
                <table class="sheet-table sheet-weapons-table">
                    <thead>
                        <tr>
                            ${equipHeaderCell}
                            <th rowspan="2">Name</th>
                            <th rowspan="2">Dice</th>
                            <th colspan="2">Damage</th>
                            <th rowspan="2">Range</th>
                            <th rowspan="2">Traits</th>
                        </tr>
                        <tr>
                            <th>AP</th>
                            <th>ED</th>
                        </tr>
                    </thead>
                    ${rows}
                </table>
            </div>
        `;
    },

    // Get Simultaneous Strike talent info if character has it
    getSimultaneousStrikeInfo(character) {
        const entry = State.getTalentEntry('simultaneous_strike');
        if (!entry || !entry.choice) return null;
        return {
            skill: entry.choice,
            isMelee: entry.choice === 'Weapon Skill',
            isPistol: entry.choice === 'Ballistic Skill'
        };
    },

    // Check if weapon is compatible with Simultaneous Strike
    isWeaponCompatibleWithSimultaneousStrike(weapon, ssInfo) {
        if (!ssInfo) return false;
        if (ssInfo.isMelee) {
            // One-handed melee weapons (type === 'melee' and not Two-Handed trait)
            return weapon.type === 'melee' && !weapon.traits?.includes('Two-Handed');
        } else if (ssInfo.isPistol) {
            // Pistols
            return weapon.traits?.includes('Pistol');
        }
        return false;
    },

    // Get Trademark Weapon info if character has it
    getTrademarkWeaponInfo(character) {
        const entry = State.getTalentEntry('trademark_weapon');
        if (!entry || entry.choice === undefined || entry.choice === null) return null;

        // Choice is now the wargear index
        const wargearIndex = parseInt(entry.choice, 10);
        if (isNaN(wargearIndex)) {
            // Legacy support: if choice is a weapon name (old format), return null
            // User will need to re-select the trademark weapon
            return null;
        }

        return {
            wargearIndex: wargearIndex,
            bonusED: (character.rank || 1) * 2 // Double Rank ED
        };
    },

    // Render armor with full details
    renderArmor(character) {
        const armors = [];

        for (const item of character.wargear || []) {
            const armor = DataLoader.getArmor(item.id);
            if (armor) {
                armors.push({ ...armor, relic: item.relic });
            }
        }

        if (armors.length === 0) {
            return `
                <div class="sheet-section">
                    <h2 class="sheet-section-title">Armor</h2>
                    <p class="sheet-empty">No armor equipped</p>
                </div>
            `;
        }

        const rows = armors.map(armor => {
            const traits = armor.traits?.length > 0
                ? `<span class="sheet-traits-cell">${armor.traits.join(', ')}</span>`
                : '-';

            // Rarity display
            const rarityClass = this.getRarityClass(armor.rarity);
            const rarityDisplay = armor.rarity && armor.rarity !== 'Common'
                ? `<span class="sheet-item-rarity ${rarityClass}">${armor.rarity}</span>`
                : '';

            // Relic armour displays under its custom name with the base item in parentheses
            const displayName = armor.relic
                ? `${this.escapeHtml(armor.relic.name)} (${armor.name})`
                : armor.name;

            // Build description and keywords row
            const description = armor.description || '';
            const keywords = armor.keywords?.length > 0
                ? armor.keywords.map(k => `<span class="sheet-mini-keyword">${k}</span>`).join(' ')
                : '';
            const hasDescOrKeywords = description || keywords;

            const descRow = hasDescOrKeywords ? `
                <tr class="sheet-armor-desc-row">
                    <td colspan="3">
                        <div class="sheet-item-details">
                            ${description ? `<span class="sheet-item-description">${description}</span>` : ''}
                            ${keywords ? `<span class="sheet-item-keywords">${keywords}</span>` : ''}
                        </div>
                    </td>
                </tr>
            ` : '';

            return `
                <tbody class="sheet-armor-group">
                    <tr>
                        <td class="sheet-armor-name">${displayName}${rarityDisplay}<div class="source-ref">${DataLoader.formatSourcePage(armor)}</div></td>
                        <td class="sheet-armor-ar">${armor.ar || 0}</td>
                        <td class="sheet-armor-traits">${traits}</td>
                    </tr>
                    ${descRow}
                </tbody>
            `;
        }).join('');

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Armor</h2>
                <table class="sheet-table sheet-armor-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>AR</th>
                            <th>Traits</th>
                        </tr>
                    </thead>
                    ${rows}
                </table>
            </div>
        `;
    },

    // Render augmetics section
    renderAugmetics(character) {
        const augmetics = [];

        for (const item of character.wargear || []) {
            if (DataLoader.getWeapon(item.id) || DataLoader.getArmor(item.id)) continue;
            const equip = DataLoader.getEquipment(item.id);
            if (equip && equip.category === 'augmetic') {
                augmetics.push({ ...equip, relic: item.relic });
            }
        }

        if (augmetics.length === 0) return '';

        const rows = augmetics.map(aug => {
            const rarityClass = this.getRarityClass(aug.rarity);
            const rarityDisplay = aug.rarity && aug.rarity !== 'Common'
                ? `<span class="sheet-item-rarity ${rarityClass}">${aug.rarity}</span>`
                : '';

            // Format bonuses as stat list
            const bonusParts = [];
            if (aug.bonuses) {
                for (const [key, val] of Object.entries(aug.bonuses)) {
                    const label = key.charAt(0).toUpperCase() + key.slice(1);
                    bonusParts.push(`${val > 0 ? '+' : ''}${val} ${label}`);
                }
            }
            const bonusText = bonusParts.length > 0 ? bonusParts.join(', ') : '';

            // Relic augmetics display under their custom name with the base item in parentheses
            const displayName = aug.relic
                ? `${this.escapeHtml(aug.relic.name)} (${aug.name})`
                : aug.name;

            const description = aug.description || '';
            const keywords = aug.keywords?.length > 0
                ? aug.keywords.map(k => `<span class="sheet-mini-keyword">${k}</span>`).join(' ')
                : '';
            const hasDescOrKeywords = description || keywords;

            const descRow = hasDescOrKeywords ? `
                <tr class="sheet-equip-desc-row">
                    <td colspan="3">
                        <div class="sheet-item-details">
                            ${description ? `<span class="sheet-item-description">${description}</span>` : ''}
                            ${keywords ? `<span class="sheet-item-keywords">${keywords}</span>` : ''}
                        </div>
                    </td>
                </tr>
            ` : '';

            return `
                <tbody class="sheet-equip-group">
                    <tr>
                        <td class="sheet-equip-name">${displayName}${rarityDisplay}<div class="source-ref">${DataLoader.formatSourcePage(aug)}</div></td>
                        <td class="sheet-equip-effect">${aug.effect || '-'}</td>
                        <td class="sheet-equip-bonuses">${bonusText}</td>
                    </tr>
                    ${descRow}
                </tbody>
            `;
        }).join('');

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Augmetics</h2>
                <table class="sheet-table sheet-equipment-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Effect</th>
                            <th>Bonuses</th>
                        </tr>
                    </thead>
                    ${rows}
                </table>
            </div>
        `;
    },

    // Render equipment with full details
    renderEquipment(character) {
        const equipment = [];

        for (const item of character.wargear || []) {
            // Skip if it's a weapon or armor
            if (DataLoader.getWeapon(item.id) || DataLoader.getArmor(item.id)) {
                continue;
            }
            const equip = DataLoader.getEquipment(item.id);
            if (equip && equip.category !== 'augmetic') {
                equipment.push({ ...equip, relic: item.relic });
            }
        }

        if (equipment.length === 0) {
            return '';
        }

        const rows = equipment.map(equip => {
            // Rarity display
            const rarityClass = this.getRarityClass(equip.rarity);
            const rarityDisplay = equip.rarity && equip.rarity !== 'Common'
                ? `<span class="sheet-item-rarity ${rarityClass}">${equip.rarity}</span>`
                : '';

            // Relic equipment displays under its custom name with the base item in parentheses
            const displayName = equip.relic
                ? `${this.escapeHtml(equip.relic.name)} (${equip.name})`
                : equip.name;

            // Build description and keywords row
            const description = equip.description || '';
            const keywords = equip.keywords?.length > 0
                ? equip.keywords.map(k => `<span class="sheet-mini-keyword">${k}</span>`).join(' ')
                : '';
            const hasDescOrKeywords = description || keywords;

            const descRow = hasDescOrKeywords ? `
                <tr class="sheet-equip-desc-row">
                    <td colspan="2">
                        <div class="sheet-item-details">
                            ${description ? `<span class="sheet-item-description">${description}</span>` : ''}
                            ${keywords ? `<span class="sheet-item-keywords">${keywords}</span>` : ''}
                        </div>
                    </td>
                </tr>
            ` : '';

            return `
                <tbody class="sheet-equip-group">
                    <tr>
                        <td class="sheet-equip-name">${displayName}${rarityDisplay}<div class="source-ref">${DataLoader.formatSourcePage(equip)}</div></td>
                        <td class="sheet-equip-effect">${equip.effect || '-'}</td>
                    </tr>
                    ${descRow}
                </tbody>
            `;
        }).join('');

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Equipment</h2>
                <table class="sheet-table sheet-equipment-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Effect</th>
                        </tr>
                    </thead>
                    ${rows}
                </table>
            </div>
        `;
    },

    // Render the Holy Relics detail block (only when the character owns relic wargear)
    renderHolyRelics(character) {
        const relicItems = (character.wargear || []).filter(item => item.relic);
        if (relicItems.length === 0) return '';

        const relicData = DataLoader.getHolyRelics();
        const sacredShells = relicData ? relicData.sacredShells : '';

        const relicsHtml = relicItems.map(item => {
            const relic = item.relic;
            const base = DataLoader.getWargearItem(item.id);
            const baseName = base ? base.name : item.id;
            const parts = this.getRelicDisplayParts(relic);
            const choiceText = relic.powerChoice ? ` (${this.escapeHtml(relic.powerChoice)})` : '';

            const oddityLines = parts.oddities.map(o =>
                `<div class="sheet-talent-effect"><strong>${this.escapeHtml(o.name)}:</strong> ${o.description}</div>`
            ).join('');

            const sacredShellsLine = (relic.form === 'grenade_or_missile_weapon' && sacredShells)
                ? `<div class="sheet-talent-effect"><strong>Sacred Shells:</strong> ${sacredShells}</div>`
                : '';

            return `
                <div class="sheet-talent">
                    <div class="sheet-talent-header">
                        <span class="sheet-talent-name">${this.escapeHtml(relic.name)} &mdash; Relic ${this.escapeHtml(parts.formName)} (${baseName})</span>
                    </div>
                    <div class="sheet-talent-content">
                        <div class="text-muted">Original Owner: ${this.escapeHtml(parts.ownerName)} &bull; Anointment: ${this.escapeHtml(parts.anointmentName)}</div>
                        <div class="sheet-talent-effect"><strong>${this.escapeHtml(parts.powerName)}${choiceText}:</strong> ${parts.powerDescription}</div>
                        ${oddityLines}
                        ${sacredShellsLine}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Holy Relics</h2>
                ${relicsHtml}
            </div>
        `;
    },

    // Resolve a relic's id fields to display names and verbatim descriptions via
    // DataLoader.getHolyRelics(), falling back to raw ids if the lookup misses.
    getRelicDisplayParts(relic) {
        const relics = DataLoader.getHolyRelics();
        if (!relics) {
            return {
                formName: relic.form,
                ownerName: relic.originalOwner,
                anointmentName: relic.anointment,
                powerName: relic.power,
                powerDescription: '',
                oddities: (relic.oddities || []).map(id => ({ name: id, description: '' }))
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

        const oddities = (relic.oddities || []).map(id => {
            const oddity = relics.oddities.entries.find(e => e.id === id);
            return oddity ? { name: oddity.name, description: oddity.description } : { name: id, description: '' };
        });

        return {
            formName: form ? form.name : relic.form,
            ownerName: owner ? owner.name : relic.originalOwner,
            anointmentName: anointment ? anointment.name : relic.anointment,
            powerName: power ? power.name : relic.power,
            powerDescription: power ? power.description : '',
            oddities
        };
    },

    // Render species abilities including sub-option abilities (chapter, path, mutations)
    renderSpeciesAbilities(character, species) {
        if (!species) return '';

        const allAbilities = [];

        // Add base species abilities
        if (species.abilities) {
            for (const ability of species.abilities) {
                allAbilities.push({
                    name: ability.name,
                    flavor: ability.flavor || null,
                    effect: ability.effect || ability.description,
                    source: species.name
                });
            }
        }

        // Add sub-option abilities (chapter abilities, path bonuses, mutations)
        if (species.subOptions && character.species?.subOptions) {
            const subOptionsConfig = Array.isArray(species.subOptions) ? species.subOptions : [species.subOptions];

            for (const config of subOptionsConfig) {
                const selected = character.species.subOptions.filter(opt => opt.type === config.type);

                for (const sel of selected) {
                    const option = config.options?.find(o => o.id === sel.optionId);
                    if (option) {
                        // Chapter-style abilities (array of abilities)
                        if (option.abilities) {
                            for (const ability of option.abilities) {
                                allAbilities.push({
                                    name: ability.name,
                                    flavor: ability.flavor || null,
                                    effect: ability.effect || ability.description,
                                    source: option.name
                                });
                            }
                        }
                        // Path/mutation style abilities (single effect)
                        else if (option.effect || option.description) {
                            allAbilities.push({
                                name: option.name,
                                flavor: null,
                                effect: option.effect || option.description,
                                source: config.label
                            });
                        }
                    }
                }
            }
        }

        if (allAbilities.length === 0) return '';

        const abilitiesHtml = allAbilities.map(ability => {
            // Flavor text should NOT have glossary terms (escaped), effect text SHOULD (not escaped)
            const flavorHtml = ability.flavor
                ? `<div class="sheet-ability-flavor">${this.escapeHtml(ability.flavor)}</div>`
                : '';
            // Effect text will be enhanced with glossary terms by enhanceWithGlossary
            const effectHtml = `<div class="sheet-ability-effect">${ability.effect}</div>`;
            const sourceHtml = ability.source !== species.name
                ? `<span class="sheet-ability-source">(${ability.source})</span>`
                : '';

            return `
                <div class="sheet-ability">
                    <div class="sheet-ability-header">
                        <span class="sheet-ability-name">${ability.name}</span>
                        ${sourceHtml}
                    </div>
                    <div class="sheet-ability-content">
                        ${effectHtml}
                        ${flavorHtml}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Species Abilities</h2>
                ${abilitiesHtml}
                <div class="source-ref">${DataLoader.formatSourcePage(species)}</div>
            </div>
        `;
    },

    // Render archetype abilities (including from archetype ascensions)
    renderArchetypeAbilities(archetype) {
        const character = State.getCharacter();

        // Collect all ability groups: { title, abilities[] }
        const abilityGroups = [];

        // Base archetype abilities
        if (character.archetype?.id === 'custom' && character.customArchetype?.abilityArchetypeId) {
            const abilityArchetype = DataLoader.getArchetype(character.customArchetype.abilityArchetypeId);
            if (abilityArchetype?.abilities) {
                abilityGroups.push({ source: null, archetype: abilityArchetype, abilities: abilityArchetype.abilities });
            }
        } else if (archetype?.abilities) {
            abilityGroups.push({ source: null, archetype: archetype, abilities: archetype.abilities });
        }

        // Archetype ascension abilities
        for (const asc of character.ascensions || []) {
            if (asc.type === 'archetype' && asc.archetypeId) {
                const ascArchetype = DataLoader.getArchetype(asc.archetypeId);
                if (ascArchetype?.abilities) {
                    abilityGroups.push({ source: ascArchetype.name, archetype: ascArchetype, abilities: ascArchetype.abilities });
                }
            }
        }

        if (abilityGroups.length === 0) {
            return '';
        }

        const allAbilitiesHtml = abilityGroups.map(group => {
            return group.abilities.map((ability, abilityIndex) => {
                const flavor = ability.flavor || null;
                const effect = ability.effect || ability.description;

                const flavorHtml = flavor
                    ? `<div class="sheet-ability-flavor">${this.escapeHtml(flavor)}</div>`
                    : '';
                const effectHtml = `<div class="sheet-ability-effect">${effect}</div>`;
                const sourceHtml = group.source
                    ? `<span class="sheet-ability-source">(from ${group.source} Ascension)</span>`
                    : '';
                const sourceRefHtml = group.archetype && abilityIndex === group.abilities.length - 1
                    ? `<div class="source-ref">${DataLoader.formatSourcePage(group.archetype)}</div>`
                    : '';

                return `
                    <div class="sheet-ability">
                        <div class="sheet-ability-header">
                            <span class="sheet-ability-name">${ability.name}</span>
                            ${sourceHtml}
                        </div>
                        <div class="sheet-ability-content">
                            ${effectHtml}
                            ${flavorHtml}
                            ${sourceRefHtml}
                        </div>
                    </div>
                `;
            }).join('');
        }).join('');

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Archetype Abilities</h2>
                ${allAbilitiesHtml}
            </div>
        `;
    },

    // Render ascension details
    renderAscensions(character) {
        const ascensions = character.ascensions || [];
        if (ascensions.length === 0) return '';

        const items = ascensions.map(asc => {
            let name = '';
            let details = '';

            if (asc.type === 'package' && asc.packageId) {
                const pkg = DataLoader.getAscensionPackages().find(p => p.id === asc.packageId);
                if (pkg) {
                    name = pkg.name;
                    const xpCost = pkg.costMultiplier ? pkg.costMultiplier * asc.targetTier : parseInt(pkg.cost) || 0;
                    details = `<span class="sheet-ascension-cost">${xpCost} XP</span>`;
                    // Show choice if applicable
                    if (asc.choices && pkg.choiceOptions) {
                        for (const [key, val] of Object.entries(asc.choices)) {
                            const option = pkg.choiceOptions.find(o => o.value === val);
                            if (option) {
                                details += `<div class="sheet-ascension-choice">Chosen: ${option.label}</div>`;
                            }
                        }
                    }
                    if (pkg.benefits && pkg.benefits.length > 0) {
                        details += `<ul class="sheet-ascension-benefits">${pkg.benefits.map(b => `<li>${b}</li>`).join('')}</ul>`;
                    }
                    if (pkg.keywordsGained && pkg.keywordsGained.length > 0) {
                        details += `<div class="sheet-ascension-keywords">Keywords: ${pkg.keywordsGained.join(', ')}</div>`;
                    }
                }
            } else if (asc.type === 'archetype' && asc.archetypeId) {
                const arch = DataLoader.getArchetype(asc.archetypeId);
                if (arch) {
                    name = `Archetype: ${arch.name}`;
                    details = `<span class="sheet-ascension-cost">0 XP</span>`;
                    if (arch.abilities && arch.abilities.length > 0) {
                        const abilityNames = arch.abilities.map(a => a.name).join(', ');
                        details += `<div>Abilities: ${abilityNames}</div>`;
                    }
                }
            }

            if (!name) return '';

            return `
                <div class="sheet-ascension-item">
                    <div class="sheet-ascension-header">
                        <span class="sheet-ascension-name">${name}</span>
                        <span class="sheet-ascension-tier">Tier ${asc.targetTier}</span>
                    </div>
                    <div class="sheet-ascension-details">${details}</div>
                </div>
            `;
        }).filter(Boolean).join('');

        if (!items) return '';

        const effectiveTier = State.getEffectiveTier();
        const startingTier = character.tier || 1;

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Ascension${effectiveTier > startingTier ? ` (Tier ${effectiveTier})` : ''}</h2>
                ${items}
            </div>
        `;
    },

    // Render talents
    renderTalents(character) {
        if (!character.talents || character.talents.length === 0) {
            return `
                <div class="sheet-section">
                    <h2 class="sheet-section-title">Talents</h2>
                    <p class="sheet-empty">No talents learned</p>
                </div>
            `;
        }

        const talents = character.talents.map(entry => {
            const talentId = typeof entry === 'string' ? entry : entry.id;
            const choice = typeof entry === 'object' ? entry.choice : null;
            const isAscensionGranted = typeof entry === 'object' && entry.ascensionGranted;
            const talent = DataLoader.getTalent(talentId);

            if (!talent) return '';

            // For weapon_owned choices, convert wargear index to weapon name
            let choiceDisplay = choice;
            if (choice !== null && choice !== undefined && talent.choiceType === 'weapon_owned') {
                const wargearIndex = parseInt(choice, 10);
                if (!isNaN(wargearIndex) && character.wargear[wargearIndex]) {
                    const weapon = DataLoader.getWeapon(character.wargear[wargearIndex].id);
                    if (weapon) {
                        choiceDisplay = weapon.name;
                    }
                }
            }

            const grantedLabel = isAscensionGranted ? ' <span class="sheet-talent-granted">(Ascension)</span>' : '';
            const nameWithChoice = choiceDisplay
                ? `${talent.name} (${choiceDisplay})`
                : talent.name;

            // Build effect description with choice highlighted
            let effectText = talent.effect || '-';
            if (choiceDisplay) {
                // Add a note about the chosen option at the start
                const choiceNote = `<strong class="sheet-talent-choice">Chosen: ${choiceDisplay}</strong>. `;
                effectText = choiceNote + effectText;
            }

            // Build flavor text (displayed under effect, escaped to prevent glossary enhancement)
            const flavorHtml = talent.flavor
                ? `<div class="sheet-talent-flavor">${this.escapeHtml(talent.flavor)}</div>`
                : '';

            return `
                <div class="sheet-talent">
                    <div class="sheet-talent-header">
                        <span class="sheet-talent-name">${nameWithChoice}${grantedLabel}</span>
                    </div>
                    <div class="sheet-talent-content">
                        <div class="sheet-talent-effect">${effectText}</div>
                        ${flavorHtml}
                        <div class="source-ref">${DataLoader.formatSourcePage(talent)}</div>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Talents</h2>
                ${talents}
            </div>
        `;
    },

    // Render psychic powers
    renderPsychicPowers(character) {
        if (!State.isPsyker()) {
            return '';
        }

        // Universal psyker abilities first
        const universalRows = State.UNIVERSAL_ABILITY_IDS.map(id => {
            const power = DataLoader.getPsychicPower(id);
            if (!power) return '';
            return `
                <tr>
                    <td class="sheet-power-name">${power.name}${power.multiTarget ? ' <span class="multi-target-badge">Multi-Target</span>' : ''}<div class="source-ref">${DataLoader.formatSourcePage(power)}</div></td>
                    <td class="sheet-power-dn">${power.dn || '-'}</td>
                    <td class="sheet-power-range">${power.range || '-'}</td>
                    <td class="sheet-power-desc">${power.effect || '-'}${power.potency ? `<div class="sheet-power-potency"><span class="sheet-power-potency-label">Potency:</span> ${power.potency}</div>` : ''}</td>
                </tr>
            `;
        }).join('');

        // Character's purchased/granted powers (skip universal IDs to prevent duplicates)
        const rows = (character.psychicPowers || []).filter(id => !State.UNIVERSAL_ABILITY_IDS.includes(id)).map(powerId => {
            const power = DataLoader.getPsychicPower(powerId);
            if (!power) return '';

            return `
                <tr>
                    <td class="sheet-power-name">${power.name}${power.multiTarget ? ' <span class="multi-target-badge">Multi-Target</span>' : ''}<div class="source-ref">${DataLoader.formatSourcePage(power)}</div></td>
                    <td class="sheet-power-dn">${power.dn || '-'}</td>
                    <td class="sheet-power-range">${power.range || '-'}</td>
                    <td class="sheet-power-desc">${power.effect || '-'}${power.potency ? `<div class="sheet-power-potency"><span class="sheet-power-potency-label">Potency:</span> ${power.potency}</div>` : ''}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Psychic Powers</h2>
                <table class="sheet-table sheet-powers-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>DN</th>
                            <th>Range</th>
                            <th>Effect</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${universalRows}${rows}
                    </tbody>
                </table>
            </div>
        `;
    },

    // Render injuries & corruption section
    renderInjuriesCorruption(character) {
        const data = DataLoader.getInjuriesCorruptionData();
        if (!data) return '';

        const memorableInjuries = character.memorableInjuries || [];
        const traumaticInjuries = character.traumaticInjuries || [];
        const corruption = character.corruption || 0;
        const mutations = character.mutations || [];

        // Hide section entirely if nothing to show
        if (memorableInjuries.length === 0 && traumaticInjuries.length === 0 && corruption === 0 && mutations.length === 0) {
            return '';
        }

        let sections = '';

        // Memorable Injuries
        if (memorableInjuries.length > 0) {
            const items = memorableInjuries.map(entry => {
                const inj = (data.memorableInjuries || []).find(i => i.id === entry.id);
                if (!inj) return '';
                const escalatedLabel = entry.escalated
                    ? ` <span class="sheet-injury-escalated">(${inj.escalation})</span>`
                    : '';
                const escalatedDesc = entry.escalated
                    ? `<div class="sheet-injury-desc">${inj.escalationDesc}</div>`
                    : '';
                return `
                    <div class="sheet-injury-item">
                        <span class="sheet-injury-name">${inj.name}${escalatedLabel}</span>
                        ${escalatedDesc}
                    </div>
                `;
            }).join('');

            sections += `
                <h3 class="sheet-subsection-title">Memorable Injuries</h3>
                ${items}
            `;
        }

        // Traumatic Injuries
        if (traumaticInjuries.length > 0) {
            const items = traumaticInjuries.map(entry => {
                const inj = (data.traumaticInjuries || []).find(i => i.id === entry.id);
                if (!inj) return '';
                const sideLabel = entry.side ? ` (${entry.side})` : '';
                return `
                    <div class="sheet-injury-item">
                        <span class="sheet-injury-name">${inj.name}${sideLabel}</span>
                        <div class="sheet-injury-desc">${inj.description}</div>
                    </div>
                `;
            }).join('');

            sections += `
                <h3 class="sheet-subsection-title">Traumatic Injuries</h3>
                ${items}
            `;
        }

        // Corruption
        if (corruption > 0) {
            const table = data.corruptionTable || [];
            const currentLevel = table.find(l => corruption >= l.min && (l.max === null || corruption <= l.max)) || table[0];
            const dnDisplay = currentLevel.dnModifier === null ? '-' : `+${currentLevel.dnModifier}`;

            sections += `
                <h3 class="sheet-subsection-title">Corruption</h3>
                <div class="sheet-corruption-summary">
                    <span>Level: <strong>${currentLevel.name}</strong></span>
                    <span>Points: <strong>${corruption}</strong></span>
                    <span>Test DN Modifier: <strong>${dnDisplay}</strong></span>
                </div>
            `;
        }

        // Mutations
        if (mutations.length > 0) {
            const allMutations = data.mutations || [];
            const items = mutations.map(entry => {
                const mutation = allMutations.find(m => m.id === entry.id);
                if (!mutation) return '';

                let subChoiceLabel = '';
                let effectText = mutation.effect;
                let activeBonuses = mutation.bonuses;

                if (entry.subChoice && mutation.subChoices) {
                    const sub = mutation.subChoices.find(s => s.id === entry.subChoice);
                    if (sub) {
                        subChoiceLabel = ` — ${sub.name}`;
                        effectText = sub.effect;
                        activeBonuses = sub.bonuses || null;
                    }
                }

                const severityClass = `sheet-mutation-severity-${mutation.severity}`;

                let bonusDisplay = '';
                if (activeBonuses) {
                    const bonusParts = Object.entries(activeBonuses).map(([key, val]) => {
                        const name = this.formatMutationBonusKey(key);
                        return `${val > 0 ? '+' : ''}${val} ${name}`;
                    });
                    bonusDisplay = `<div class="sheet-mutation-bonuses">${bonusParts.join(', ')}</div>`;
                }

                return `
                    <div class="sheet-mutation-item">
                        <div class="sheet-mutation-header">
                            <span class="sheet-mutation-name">${mutation.name}${subChoiceLabel}</span>
                            <span class="sheet-mutation-severity ${severityClass}">${mutation.severity}</span>
                        </div>
                        <div class="sheet-mutation-desc">${mutation.description}</div>
                        <div class="sheet-mutation-effect">${effectText}</div>
                        ${bonusDisplay}
                    </div>
                `;
            }).join('');

            sections += `
                <h3 class="sheet-subsection-title">Mutations</h3>
                ${items}
            `;
        }

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Injuries & Corruption</h2>
                ${sections}
            </div>
        `;
    },

    // Format mutation bonus key for display
    formatMutationBonusKey(key) {
        const map = {
            strength: 'Strength', toughness: 'Toughness', agility: 'Agility',
            initiative: 'Initiative', willpower: 'Willpower', intellect: 'Intellect',
            fellowship: 'Fellowship', resilience: 'Resilience', defence: 'Defence',
            maxWounds: 'Max Wounds', maxShock: 'Max Shock', speed: 'Speed',
            resolve: 'Resolve', passiveAwareness: 'Passive Awareness'
        };
        return map[key] || key;
    },

    // Render background
    renderBackground(character) {
        const backgrounds = DataLoader.getBackgrounds();
        const parts = [];

        if (character.background?.origin?.id) {
            const origin = backgrounds.origins?.find(o => o.id === character.background.origin.id);
            if (origin) {
                parts.push(`<strong>Origin:</strong> ${origin.name}`);
            }
        }

        if (character.background?.accomplishment?.id) {
            const accomplishment = backgrounds.accomplishments?.find(a => a.id === character.background.accomplishment.id);
            if (accomplishment) {
                parts.push(`<strong>Accomplishment:</strong> ${accomplishment.name}`);
            }
        }

        if (character.background?.goal?.id) {
            const goal = backgrounds.goals?.find(g => g.id === character.background.goal.id);
            if (goal) {
                parts.push(`<strong>Goal:</strong> ${goal.name}`);
            }
        }

        // Languages
        const languages = character.languages || ['low_gothic'];
        const langNames = languages.map(l => l.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()));
        parts.push(`<strong>Languages:</strong> ${langNames.join(', ')}`);

        if (parts.length === 1) { // Only languages
            return `
                <div class="sheet-section">
                    <h2 class="sheet-section-title">Background</h2>
                    <p class="sheet-background-item">${parts[0]}</p>
                </div>
            `;
        }

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Background</h2>
                <div class="sheet-background-content">
                    ${parts.map(p => `<p class="sheet-background-item">${p}</p>`).join('')}
                </div>
            </div>
        `;
    },

    // Render notes
    renderNotes(character) {
        if (!character.notes || character.notes.trim() === '') {
            return '';
        }

        return `
            <div class="sheet-section">
                <h2 class="sheet-section-title">Notes</h2>
                <div class="sheet-notes">${this.escapeHtml(character.notes)}</div>
            </div>
        `;
    },

    // Print the character sheet (with light theme for paper)
    print() {
        // Add light theme class for printer-friendly output
        document.body.classList.add('print-light-theme');

        // Use afterprint event to clean up
        const cleanup = () => {
            document.body.classList.remove('print-light-theme');
            window.removeEventListener('afterprint', cleanup);
        };
        window.addEventListener('afterprint', cleanup);

        window.print();
    },

    // Copy character summary as plain text to clipboard
    copySummary(btn) {
        const character = State.getCharacter();
        const species = DataLoader.getSpecies(character.species?.id);
        const archetype = DataLoader.getArchetype(character.archetype?.id);
        const keywords = State.getKeywords();
        const derivedStats = DerivedStats.getAllDerivedStats(character, DerivedStats.getArmorBreakdown(character));
        const lines = [];

        // Header
        const name = character.name || 'Unnamed Character';
        const speciesName = species?.name || '-';
        const archetypeName = character.archetype?.id === 'custom'
            ? (character.customArchetype?.name || 'Custom Archetype')
            : (archetype?.name || '-');
        const effectiveTierCopy = State.getEffectiveTier();
        const tierCopyDisplay = `Tier ${effectiveTierCopy}`;
        lines.push(name);
        lines.push(`${speciesName} | ${archetypeName} | ${tierCopyDisplay} | Rank ${character.rank || 1}`);
        if (keywords.length > 0) lines.push(`Keywords: ${keywords.join(', ')}`);
        lines.push('');

        // Attributes
        lines.push('ATTRIBUTES');
        const attrNames = { strength: 'STR', toughness: 'TOU', agility: 'AGI', initiative: 'INI', willpower: 'WIL', intellect: 'INT', fellowship: 'FEL' };
        const attrParts = Object.entries(attrNames).map(([key, abbr]) => `${abbr}: ${character.attributes[key]}`);
        lines.push(attrParts.join(' | '));
        lines.push('');

        // Traits
        lines.push('TRAITS');
        lines.push(`Defence: ${derivedStats.defence} | Resilience: ${derivedStats.resilience} | Determination: ${derivedStats.determination} | Speed: ${derivedStats.speed}`);
        lines.push(`Max Wounds: ${derivedStats.maxWounds} | Max Shock: ${derivedStats.maxShock} | Conviction: ${derivedStats.conviction} | Resolve: ${derivedStats.resolve}`);
        lines.push('');

        // Skills
        const skillNames = {
            athletics: 'Athletics', awareness: 'Awareness', ballisticSkill: 'Ballistic Skill',
            cunning: 'Cunning', deception: 'Deception', insight: 'Insight',
            intimidation: 'Intimidation', investigation: 'Investigation', leadership: 'Leadership',
            medicae: 'Medicae', persuasion: 'Persuasion', pilot: 'Pilot',
            psychicMastery: 'Psychic Mastery', scholar: 'Scholar', stealth: 'Stealth',
            survival: 'Survival', tech: 'Tech', weaponSkill: 'Weapon Skill'
        };
        lines.push('SKILLS');
        for (const [key, label] of Object.entries(skillNames)) {
            const rating = character.skills[key] || 0;
            if (rating > 0) lines.push(`  ${label}: ${rating}`);
        }
        lines.push('');

        // Talents
        if (character.talents?.length > 0) {
            lines.push('TALENTS');
            for (const entry of character.talents) {
                const talentId = typeof entry === 'string' ? entry : entry.id;
                const talent = DataLoader.getTalent(talentId);
                if (talent) lines.push(`  ${talent.name}`);
            }
            lines.push('');
        }

        // Wargear
        if (character.wargear?.length > 0) {
            lines.push('WARGEAR');
            for (const item of character.wargear) {
                const wargear = DataLoader.getWargearItem(item.id);
                if (!wargear) continue;
                if (item.relic) {
                    const parts = this.getRelicDisplayParts(item.relic);
                    const choiceText = item.relic.powerChoice ? ` (${item.relic.powerChoice})` : '';
                    const oddityNames = parts.oddities.map(o => o.name);
                    const oddityText = oddityNames.length ? oddityNames.join(', ') : 'none';
                    lines.push(`- ${item.relic.name} (Holy Relic — ${wargear.name})`);
                    lines.push(`    Power: ${parts.powerName}${choiceText}; Oddities: ${oddityText}`);
                } else {
                    lines.push(`  ${wargear.name}`);
                }
            }
            lines.push('');
        }

        // Psychic Powers
        if (State.isPsyker()) {
            lines.push('PSYCHIC POWERS');
            // Universal abilities
            for (const uaId of State.UNIVERSAL_ABILITY_IDS) {
                const power = DataLoader.getPsychicPower(uaId);
                if (power) lines.push(`  ${power.name} (DN ${power.dn || '-'}) [Universal]`);
            }
            // Character's powers (skip universal IDs to prevent duplicates)
            for (const powerId of (character.psychicPowers || [])) {
                if (State.UNIVERSAL_ABILITY_IDS.includes(powerId)) continue;
                const power = DataLoader.getPsychicPower(powerId);
                if (power) lines.push(`  ${power.name} (DN ${power.dn || '-'})`);
            }
            lines.push('');
        }

        const text = lines.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<span class="btn-icon">&#10003;</span> Copied!';
            setTimeout(() => { btn.innerHTML = originalText; }, 1500);
        });
    },

    // Helper: Calculate attack dice pool for a weapon
    calculateAttackDice(weapon, character, upgradeDetails = []) {
        // Determine skill and attribute based on weapon type
        let skillKey, skillName, attrKey, attrAbbrev;

        if (weapon.type === 'melee') {
            skillKey = 'weaponSkill';
            skillName = 'WS';
            attrKey = 'initiative';
            attrAbbrev = 'INI';
        } else {
            skillKey = 'ballisticSkill';
            skillName = 'BS';
            attrKey = 'agility';
            attrAbbrev = 'AGI';
        }

        const skillRating = character.skills?.[skillKey] || 0;
        const attrValue = DerivedStats.getEffectiveAttribute(character, attrKey);
        const basePool = skillRating + attrValue;

        // Collect bonus dice from upgrades
        let bonusDice = [];
        for (const upgrade of upgradeDetails) {
            if (upgrade.bonusDice) {
                bonusDice.push({ value: upgrade.bonusDice, source: upgrade.name });
            }
        }

        // TODO: Could add talent bonuses here (e.g., certain talents that grant bonus dice)

        // Calculate total
        const totalBonus = bonusDice.reduce((sum, b) => sum + b.value, 0);
        const totalPool = basePool + totalBonus;

        // Build tooltip showing breakdown
        let tooltip = `${skillName} ${skillRating} + ${attrAbbrev} ${attrValue} = ${basePool}`;
        if (bonusDice.length > 0) {
            const bonusStrings = bonusDice.map(b => `+${b.value} (${b.source})`);
            tooltip += `\n${bonusStrings.join('\n')}\nTotal: ${totalPool}`;
        }

        return {
            base: basePool,
            bonuses: bonusDice,
            total: totalPool,
            skill: skillName,
            attr: attrAbbrev,
            display: `${totalPool}`,
            tooltip: tooltip
        };
    },

    // Helper: Calculate weapon damage with detailed breakdown including talent bonuses and upgrades
    calculateWeaponDamageDetailed(weapon, character, wargearIndex = null, simultaneousStrike = null, equippedWeapons = [], upgradeDetails = []) {
        let baseDamage = (weapon.damage?.base || 0) + (weapon.damage?.bonus || 0);
        let ed = weapon.ed || 0;
        let ap = weapon.ap || 0;
        let edBonuses = [];
        let apBonuses = [];
        let damageBonuses = [];
        const rank = character.rank || 1;
        const weaponKeywords = weapon.keywords || [];
        const weaponTraits = weapon.traits || [];

        // Helper to check keywords (case-insensitive)
        const hasKeyword = (kw) => weaponKeywords.some(k => k.toUpperCase() === kw.toUpperCase());
        const hasTrait = (trait) => weaponTraits.some(t => t.toUpperCase().startsWith(trait.toUpperCase()));

        // Apply upgrade bonuses
        for (const upgrade of upgradeDetails) {
            if (upgrade.bonusDamage) {
                damageBonuses.push({ value: upgrade.bonusDamage, source: upgrade.name });
            }
            if (upgrade.bonusAP) {
                apBonuses.push({ value: upgrade.bonusAP, source: upgrade.name });
            }
            if (upgrade.bonusDice) {
                // Bonus dice affect attack tests, not damage directly - just note it
            }
            if (upgrade.bonusSalvo) {
                // Salvo is tracked separately
            }
        }

        // === DAMAGE TALENTS ===

        // Angel of Death: +Rank Damage for Chainswords, Chainaxes, Power Swords, Power Fists, Unarmed, Bolt weapons, ADEPTUS ASTARTES weapons
        if (State.hasTalent('angel_of_death')) {
            const angelWeapons = ['chainsword', 'chainaxe', 'power sword', 'power fist', 'unarmed'];
            const weaponNameLower = weapon.name.toLowerCase();
            const isAngelWeapon = angelWeapons.some(w => weaponNameLower.includes(w)) ||
                hasKeyword('BOLT') || hasKeyword('ADEPTUS ASTARTES');
            if (isAngelWeapon) {
                damageBonuses.push({ value: rank, source: 'Angel of Death' });
            }
        }

        // Emperor's Executioner: +Rank Damage with BOLT, FIRE, or MELTA weapons
        if (State.hasTalent('emperor_s_executioner')) {
            if (hasKeyword('BOLT') || hasKeyword('FIRE') || hasKeyword('MELTA')) {
                damageBonuses.push({ value: rank, source: "Emperor's Executioner" });
            }
        }

        // === ED TALENTS ===

        // Trademark Weapon: +Double Rank ED (applies to specific weapon instance by wargear index)
        const trademarkInfo = this.getTrademarkWeaponInfo(character);
        if (trademarkInfo && wargearIndex === trademarkInfo.wargearIndex) {
            edBonuses.push({ value: trademarkInfo.bonusED, source: 'Trademark Weapon' });
        }

        // Pyre Kindler: +Rank ED for weapons with Inflict (On Fire) trait
        if (State.hasTalent('pyre_kindler')) {
            if (hasTrait('Inflict') && weaponTraits.some(t => t.toLowerCase().includes('on fire') || t.toLowerCase().includes('fire'))) {
                edBonuses.push({ value: rank, source: 'Pyre Kindler' });
            }
        }

        // Promethium Proficiency: +Rank ED for weapons with Inflict (On Fire) trait
        if (State.hasTalent('promethium_proficiency')) {
            if (hasTrait('Inflict') && weaponTraits.some(t => t.toLowerCase().includes('on fire') || t.toLowerCase().includes('fire'))) {
                edBonuses.push({ value: rank, source: 'Promethium Prof.' });
            }
        }

        // Absolute Incineration: +Rank ED and AP for MELTA weapons (at Short Range)
        // Note: This shows the potential bonus; actual bonus only applies at Short Range
        if (State.hasTalent('absolute_incineration')) {
            if (hasTrait('Melta') || hasKeyword('MELTA')) {
                edBonuses.push({ value: rank, source: 'Abs. Incin. (Short)' });
                apBonuses.push({ value: rank, source: 'Abs. Incin. (Short)' });
            }
        }

        // === AP TALENTS ===

        // Honed to Lethality: +Rank AP for POWER FIELD weapons
        if (State.hasTalent('honed_to_lethality')) {
            if (hasKeyword('POWER FIELD') || hasKeyword('POWER_FIELD')) {
                apBonuses.push({ value: rank, source: 'Honed to Lethality' });
            }
        }

        // Blood Angels Assault Squad: +Rank AP on melee or Pistol weapons
        if (State.hasTalent('blood_angels_assault_squad_faith')) {
            if (weapon.type === 'melee' || hasTrait('Pistol')) {
                apBonuses.push({ value: rank, source: 'Assault Squad' });
            }
        }

        // Signature Saedath (Dark): +Rank AP on melee
        if (State.hasTalent('signature_saedath')) {
            const entry = State.getTalentEntry('signature_saedath');
            // Dark saedath gives AP bonus on melee
            if (entry && entry.choice === 'Dark' && weapon.type === 'melee') {
                apBonuses.push({ value: rank, source: 'Saedath (Dark)' });
            }
        }

        // Assault Doctrine: +Rank AP on melee or Pistol weapons
        if (State.hasTalent('assault_doctrine')) {
            if (weapon.type === 'melee' || hasTrait('Pistol')) {
                apBonuses.push({ value: rank, source: 'Assault Doctrine' });
            }
        }

        // Devastator Doctrine: +Rank AP on the chosen heavy weapon
        if (State.hasTalent('devastator_doctrine')) {
            const entry = State.getTalentEntry('devastator_doctrine');
            if (entry && entry.choice && weapon.name === entry.choice) {
                apBonuses.push({ value: rank, source: 'Devastator Doctrine' });
            }
        }

        // Disciple of the Holy Trinity: +Rank Damage with BOLT, FIRE, or MELTA weapons
        if (State.hasTalent('disciple_of_holy_trinity')) {
            if (hasKeyword('BOLT') || hasKeyword('FIRE') || hasKeyword('MELTA')) {
                damageBonuses.push({ value: rank, source: 'Holy Trinity' });
            }
        }

        // === SIMULTANEOUS STRIKE ===

        // Check for Simultaneous Strike bonus (only if this weapon is equipped and another compatible weapon is also equipped)
        if (simultaneousStrike && wargearIndex !== null && State.isWeaponEquipped(wargearIndex)) {
            const compatibleEquipped = equippedWeapons.filter(w =>
                this.isWeaponCompatibleWithSimultaneousStrike(w, simultaneousStrike)
            );

            if (compatibleEquipped.length >= 2) {
                // Find the "other" weapon (not this one)
                const otherWeapon = compatibleEquipped.find(w => w.wargearIndex !== wargearIndex);
                if (otherWeapon) {
                    // Add half of the other weapon's BASE damage only (rounded up) as ED
                    // Base damage is the fixed damage value, not including attribute bonuses
                    const otherBaseDamage = (otherWeapon.damage?.base || 0) + (otherWeapon.damage?.bonus || 0);
                    const ssBonus = Math.ceil(otherBaseDamage / 2);
                    if (ssBonus > 0) {
                        edBonuses.push({ value: ssBonus, source: 'Simul. Strike' });
                    }
                }
            }
        }

        // Calculate total damage bonus from talents and upgrades
        const totalDamageBonus = damageBonuses.reduce((sum, b) => sum + b.value, 0);

        // Calculate total ED
        const totalED = ed + edBonuses.reduce((sum, b) => sum + b.value, 0);

        // Calculate total AP (AP is negative, so bonuses make it more negative)
        const apBonus = apBonuses.reduce((sum, b) => sum + b.value, 0);
        const totalAP = ap - apBonus; // Subtract because AP bonuses increase penetration (more negative)

        // Build ED tooltip showing breakdown
        let edTooltip = `Base ED: ${ed}`;
        if (edBonuses.length > 0) {
            const bonusStrings = edBonuses.map(b => `+${b.value} (${b.source})`);
            edTooltip += `\n${bonusStrings.join('\n')}\nTotal: ${totalED}`;
        }

        // Build AP tooltip showing breakdown
        let apTooltip = `Base AP: ${ap}`;
        if (apBonuses.length > 0) {
            const bonusStrings = apBonuses.map(b => `-${b.value} (${b.source})`);
            apTooltip += `\n${bonusStrings.join('\n')}\nTotal: ${totalAP}`;
        }

        // Check if weapon adds attribute to damage (typically Strength for melee)
        if (weapon.damage?.attribute) {
            const attrValue = DerivedStats.getEffectiveAttribute(character, weapon.damage.attribute);
            const attrAbbrev = weapon.damage.attribute.substring(0, 3).toUpperCase();

            const totalDamage = baseDamage + attrValue + totalDamageBonus;
            let damageTooltip = `Base: ${baseDamage} + ${attrAbbrev}: ${attrValue}`;
            if (damageBonuses.length > 0) {
                const bonusStrings = damageBonuses.map(b => `+${b.value} (${b.source})`);
                damageTooltip += `\n${bonusStrings.join('\n')}`;
            }
            damageTooltip += `\nTotal: ${totalDamage}`;

            return {
                damage: totalDamage,
                ed: totalED,
                ap: totalAP,
                edDisplay: `${totalED}`,
                edTooltip: edTooltip,
                apDisplay: `${totalAP}`,
                apTooltip: apBonuses.length > 0 ? apTooltip : null,
                display: `${totalDamage}`,
                damageTooltip: damageTooltip
            };
        }

        const totalDamage = baseDamage + totalDamageBonus;
        let damageTooltip = null;
        if (damageBonuses.length > 0) {
            damageTooltip = `Base: ${baseDamage}`;
            const bonusStrings = damageBonuses.map(b => `+${b.value} (${b.source})`);
            damageTooltip += `\n${bonusStrings.join('\n')}`;
            damageTooltip += `\nTotal: ${totalDamage}`;
        }

        return {
            damage: totalDamage,
            ed: totalED,
            ap: totalAP,
            edDisplay: `${totalED}`,
            edTooltip: edTooltip,
            apDisplay: `${totalAP}`,
            apTooltip: apBonuses.length > 0 ? apTooltip : null,
            display: `${totalDamage}`,
            damageTooltip: damageTooltip
        };
    },

    // Timers for breakdown tooltip hover behavior
    _breakdownHoverTimer: null,
    _breakdownCloseTimer: null,

    // Bind glossary-style breakdown tooltips for stat cells and trait items
    bindBreakdownTooltips(container) {
        const elements = container.querySelectorAll(
            '.sheet-weapons-table td[title], .sheet-trait-tappable[title], .sheet-skill-bonus[title]'
        );

        elements.forEach(el => {
            // Click handler
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this._showBreakdownPopup(el);
            });

            // Hover handlers (desktop)
            el.addEventListener('mouseenter', () => {
                clearTimeout(this._breakdownCloseTimer);
                this._breakdownHoverTimer = setTimeout(() => {
                    // Only show on hover if no popup is already open
                    if (!document.querySelector('.breakdown-popup')) {
                        this._showBreakdownPopup(el);
                    }
                }, 300);
            });

            el.addEventListener('mouseleave', () => {
                clearTimeout(this._breakdownHoverTimer);
                this._breakdownCloseTimer = setTimeout(() => {
                    this._closeBreakdownPopup();
                }, 200);
            });
        });
    },

    // Show a glossary-style breakdown popup for an element
    _showBreakdownPopup(el) {
        // Close any existing breakdown popup and restore its element's title
        this._closeBreakdownPopup();

        const titleText = el.getAttribute('title');
        if (!titleText) return;

        // Store and remove title to suppress native tooltip
        el.dataset.breakdownTitle = titleText;
        el.removeAttribute('title');

        // Determine the popup header label
        const label = this._getBreakdownLabel(el);

        // Parse lines from title text
        const lines = titleText.split('\n');
        const lastLine = lines[lines.length - 1];
        const isTotal = lines.length > 1 && lastLine.toLowerCase().startsWith('total');

        let contentHtml = '';
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (i === lines.length - 1 && isTotal) {
                contentHtml += `<div class="breakdown-line breakdown-total">${this.escapeHtml(line)}</div>`;
            } else {
                contentHtml += `<div class="breakdown-line">${this.escapeHtml(line)}</div>`;
            }
        }

        // Build glossary-style popup
        const popup = document.createElement('div');
        popup.className = 'glossary-popup breakdown-popup';
        popup.innerHTML = `
            <div class="glossary-popup-header">
                <span class="glossary-popup-type">Breakdown</span>
                <span class="glossary-popup-title">${this.escapeHtml(label)}</span>
                <button class="glossary-popup-close" title="Close">&times;</button>
            </div>
            <div class="glossary-popup-content">
                ${contentHtml}
            </div>
        `;

        // Close button
        popup.querySelector('.glossary-popup-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this._closeBreakdownPopup();
        });

        // Prevent clicks inside popup from closing it
        popup.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Keep popup open while hovered
        popup.addEventListener('mouseenter', () => {
            clearTimeout(this._breakdownCloseTimer);
        });
        popup.addEventListener('mouseleave', () => {
            this._breakdownCloseTimer = setTimeout(() => {
                this._closeBreakdownPopup();
            }, 200);
        });

        document.body.appendChild(popup);

        // Position using Glossary helper
        Glossary.positionPopup(popup, el);

        // Dismiss on click outside
        const dismiss = (evt) => {
            if (!popup.contains(evt.target) && evt.target !== el && !el.contains(evt.target)) {
                this._closeBreakdownPopup();
            }
        };
        setTimeout(() => document.addEventListener('click', dismiss), 0);

        // Dismiss on Escape
        const escHandler = (evt) => {
            if (evt.key === 'Escape') {
                this._closeBreakdownPopup();
            }
        };
        document.addEventListener('keydown', escHandler);

        // Store references for cleanup
        this._breakdownDismiss = dismiss;
        this._breakdownEscHandler = escHandler;
    },

    // Close the breakdown popup and restore title attribute
    _closeBreakdownPopup() {
        clearTimeout(this._breakdownCloseTimer);
        if (this._breakdownDismiss) {
            document.removeEventListener('click', this._breakdownDismiss);
            this._breakdownDismiss = null;
        }
        if (this._breakdownEscHandler) {
            document.removeEventListener('keydown', this._breakdownEscHandler);
            this._breakdownEscHandler = null;
        }
        const popup = document.querySelector('.breakdown-popup');
        if (popup) {
            popup.remove();
        }
        // Restore title on the element that had it removed
        const el = document.querySelector('[data-breakdown-title]');
        if (el) {
            el.setAttribute('title', el.dataset.breakdownTitle);
            delete el.dataset.breakdownTitle;
        }
    },

    // Determine the header label for a breakdown popup based on element context
    _getBreakdownLabel(el) {
        if (el.classList.contains('sheet-weapon-dice')) return 'Attack Dice';
        if (el.classList.contains('sheet-weapon-damage')) return 'Damage';
        if (el.classList.contains('sheet-weapon-ap')) return 'AP';
        if (el.classList.contains('sheet-weapon-ed')) return 'ED';
        if (el.classList.contains('sheet-trait-tappable')) {
            const nameEl = el.querySelector('.sheet-compact-name');
            return nameEl ? nameEl.textContent : 'Trait';
        }
        if (el.classList.contains('sheet-skill-bonus')) {
            const row = el.closest('tr');
            if (row) {
                const nameEl = row.querySelector('.sheet-skill-name');
                return nameEl ? nameEl.textContent : 'Skill';
            }
        }
        return 'Breakdown';
    },

    // Helper: Get CSS class for rarity
    getRarityClass(rarity) {
        if (!rarity) return 'rarity-common';
        return 'rarity-' + rarity.toLowerCase().replace(' ', '-');
    },

    // Helper: Escape HTML
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Repair any background selections that are missing bonusType
    repairBackgroundBonusTypes(character) {
        const backgrounds = DataLoader.getBackgrounds();
        if (!backgrounds) return;

        // Check origin
        if (character.background?.origin?.id && !character.background.origin.bonusType) {
            const origin = (backgrounds.origins || []).find(o => o.id === character.background.origin.id);
            if (origin?.bonusType) {
                character.background.origin.bonusType = origin.bonusType;
            }
        }

        // Check accomplishment
        if (character.background?.accomplishment?.id && !character.background.accomplishment.bonusType) {
            const accomplishment = (backgrounds.accomplishments || []).find(a => a.id === character.background.accomplishment.id);
            if (accomplishment?.bonusType) {
                character.background.accomplishment.bonusType = accomplishment.bonusType;
            }
        }

        // Check goal
        if (character.background?.goal?.id && !character.background.goal.bonusType) {
            const goal = (backgrounds.goals || []).find(g => g.id === character.background.goal.id);
            if (goal?.bonusType) {
                character.background.goal.bonusType = goal.bonusType;
            }
        }
    }
};
