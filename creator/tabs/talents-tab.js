// Talents Tab - Talent browser and management

const TalentsTab = {
    searchQuery: '',
    showOnlyFulfilled: false,
    currentPage: 1,
    itemsPerPage: 10,
    pendingTalent: null, // For talents requiring choices

    init() {
        // Search input
        document.getElementById('talent-search').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.currentPage = 1;
            this.renderTable();
        });

        // Filter checkbox
        document.getElementById('filter-prerequisites').addEventListener('change', (e) => {
            this.showOnlyFulfilled = e.target.checked;
            this.currentPage = 1;
            this.renderTable();
        });

        // Initialize choice modal
        this.initChoiceModal();

        this.render();
    },

    // Initialize the talent choice modal
    initChoiceModal() {
        // Create modal if it doesn't exist
        if (!document.getElementById('talent-choice-modal')) {
            const modal = document.createElement('div');
            modal.id = 'talent-choice-modal';
            modal.className = 'modal hidden';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="talent-choice-title">Select Option</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p id="talent-choice-description"></p>
                        <div id="talent-choice-options"></div>
                        <div id="talent-choice-freeform" class="hidden">
                            <input type="text" id="talent-choice-input" placeholder="Enter your choice...">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="btn-cancel-choice" class="btn-secondary">Cancel</button>
                        <button id="btn-confirm-choice" class="btn-primary">Confirm</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Event listeners
            modal.querySelector('.modal-close').addEventListener('click', () => this.hideChoiceModal());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.hideChoiceModal();
            });
            document.getElementById('btn-cancel-choice').addEventListener('click', () => this.hideChoiceModal());
            document.getElementById('btn-confirm-choice').addEventListener('click', () => this.confirmChoice());
        }
    },

    // Show the choice modal for a talent
    showChoiceModal(talent) {
        this.pendingTalent = talent;
        const modal = document.getElementById('talent-choice-modal');
        const title = document.getElementById('talent-choice-title');
        const description = document.getElementById('talent-choice-description');
        const optionsContainer = document.getElementById('talent-choice-options');
        const freeformContainer = document.getElementById('talent-choice-freeform');
        const freeformInput = document.getElementById('talent-choice-input');

        title.textContent = talent.name;
        description.textContent = talent.choiceDescription || 'Select an option:';

        // Clear previous options
        optionsContainer.innerHTML = '';
        freeformInput.value = '';

        // Get dynamic options based on choice type
        const options = this.getChoiceOptions(talent);

        if (this.usesFreeformInput(talent)) {
            // Freeform text input
            optionsContainer.classList.add('hidden');
            freeformContainer.classList.remove('hidden');
            freeformInput.placeholder = talent.choiceLabel || 'Enter your choice...';
        } else if (options && options.length > 0) {
            // Predefined or dynamic options
            optionsContainer.classList.remove('hidden');
            freeformContainer.classList.add('hidden');

            for (const option of options) {
                const btn = document.createElement('button');
                btn.className = 'choice-option-btn';
                // Handle both simple string options and object options with label/value
                const isObject = typeof option === 'object' && option !== null;
                btn.textContent = isObject ? option.label : option;
                btn.dataset.value = isObject ? option.value : option;
                btn.addEventListener('click', () => {
                    // Remove selected class from all
                    optionsContainer.querySelectorAll('.choice-option-btn').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                });
                optionsContainer.appendChild(btn);
            }
        } else {
            // No options available - show message
            optionsContainer.classList.remove('hidden');
            freeformContainer.classList.add('hidden');
            optionsContainer.innerHTML = '<p class="text-muted">No options available. You may need to have the required items first.</p>';
        }

        modal.classList.remove('hidden');
    },

    // Choice types answered with the freeform text input rather than option buttons
    usesFreeformInput(talent) {
        return ['freeform', 'keyword', 'augmetics'].includes(talent.choiceType);
    },

    // Get choice options based on talent type and character state
    getChoiceOptions(talent) {
        const character = State.getCharacter();

        // If talent has predefined options, use those
        if (talent.choiceOptions && talent.choiceOptions.length > 0) {
            return talent.choiceOptions;
        }

        // Generate dynamic options based on choice type
        switch (talent.choiceType) {
            case 'weapon_owned':
                // Get weapons the character currently owns with their wargear index
                const weapons = [];
                const weaponCounts = {};
                for (let i = 0; i < (character.wargear || []).length; i++) {
                    const item = character.wargear[i];
                    const weapon = DataLoader.getWeapon(item.id);
                    if (weapon) {
                        // Track count for duplicate weapon names
                        weaponCounts[weapon.name] = (weaponCounts[weapon.name] || 0) + 1;
                        const count = weaponCounts[weapon.name];
                        // Include instance number if there are duplicates
                        const label = count > 1 || (character.wargear.filter(w => DataLoader.getWeapon(w.id)?.name === weapon.name).length > 1)
                            ? `${weapon.name} (#${count})`
                            : weapon.name;
                        weapons.push({ label, value: i }); // value is wargear index
                    }
                }
                return weapons;

            case 'skill_any':
                // All skills that meet the prerequisite (usually 4+)
                const skillNames = {
                    athletics: 'Athletics',
                    awareness: 'Awareness',
                    ballisticSkill: 'Ballistic Skill',
                    cunning: 'Cunning',
                    deception: 'Deception',
                    insight: 'Insight',
                    intimidation: 'Intimidation',
                    investigation: 'Investigation',
                    leadership: 'Leadership',
                    medicae: 'Medicae',
                    persuasion: 'Persuasion',
                    pilot: 'Pilot',
                    psychicMastery: 'Psychic Mastery',
                    scholar: 'Scholar',
                    stealth: 'Stealth',
                    survival: 'Survival',
                    tech: 'Tech',
                    weaponSkill: 'Weapon Skill'
                };
                const qualifyingSkills = [];
                for (const [key, name] of Object.entries(skillNames)) {
                    const rating = character.skills?.[key] || 0;
                    if (rating >= 4) {
                        qualifyingSkills.push(name);
                    }
                }
                return qualifyingSkills;

            case 'discipline':
                // Get psychic disciplines the character has powers in
                const disciplines = new Map();
                for (const powerId of character.psychicPowers || []) {
                    const power = DataLoader.getPsychicPower(powerId);
                    if (power && power.discipline) {
                        const count = disciplines.get(power.discipline) || 0;
                        disciplines.set(power.discipline, count + 1);
                    }
                }
                // Only return disciplines with 2+ powers
                const validDisciplines = [];
                for (const [disc, count] of disciplines) {
                    if (count >= 2) {
                        validDisciplines.push(disc);
                    }
                }
                return validDisciplines;

            case 'discipline_unlock':
                // Get all psychic disciplines NOT already unlocked by the character
                const allDisciplines = DataLoader.getAllPsychicPowers()
                    .map(p => p.discipline)
                    .filter((d, i, arr) => d && arr.indexOf(d) === i) // unique
                    .sort();
                const unlockedDisciplines = State.getUnlockedDisciplines();
                return allDisciplines.filter(d => !unlockedDisciplines.includes(d));

            case 'augmetics':
                // Return placeholder - user should type freeform
                return null; // Will fall through to freeform

            default:
                return null;
        }
    },

    // Hide the choice modal
    hideChoiceModal() {
        const modal = document.getElementById('talent-choice-modal');
        modal.classList.add('hidden');
        this.pendingTalent = null;
    },

    // Confirm the selected choice
    confirmChoice() {
        if (!this.pendingTalent) return;

        let choice = null;

        if (this.usesFreeformInput(this.pendingTalent)) {
            choice = document.getElementById('talent-choice-input').value.trim();
            if (!choice) {
                alert('Please enter a choice.');
                return;
            }
        } else {
            const selectedBtn = document.querySelector('#talent-choice-options .choice-option-btn.selected');
            if (!selectedBtn) {
                alert('Please select an option.');
                return;
            }
            // Use dataset.value if available (for object options like weapon_owned), otherwise use textContent
            choice = selectedBtn.dataset.value !== undefined ? selectedBtn.dataset.value : selectedBtn.textContent;
        }

        // Repeatable talents must take a different choice each time
        if (this.pendingTalent.repeatable && State.hasTalentChoice(this.pendingTalent.id, choice)) {
            alert('You already have this talent with that choice.');
            return;
        }

        // Add the talent with the choice
        if (State.addTalent(this.pendingTalent.id, choice)) {
            this.hideChoiceModal();
            this.render();
        }
    },

    render() {
        this.renderSelected();
        this.renderTable();
    },

    renderSelected() {
        const container = document.getElementById('selected-talents');
        const character = State.getCharacter();

        if (character.talents.length === 0) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = '';

        for (let talentIdx = 0; talentIdx < character.talents.length; talentIdx++) {
            const talentEntry = character.talents[talentIdx];
            // Handle both old format (string) and new format (object)
            const talentId = typeof talentEntry === 'string' ? talentEntry : talentEntry.id;
            const talentChoice = typeof talentEntry === 'object' ? talentEntry.choice : null;
            const isAscensionGranted = typeof talentEntry === 'object' && talentEntry.ascensionGranted;

            const talent = DataLoader.getTalent(talentId);
            if (!talent) continue;

            // Build display name with choice if applicable
            let displayName = talent.name;
            if (talentChoice !== null && talentChoice !== undefined) {
                // For weapon_owned choices, convert wargear index to weapon name
                let choiceDisplay = talentChoice;
                if (talent.choiceType === 'weapon_owned') {
                    const wargearIndex = parseInt(talentChoice, 10);
                    if (!isNaN(wargearIndex) && character.wargear[wargearIndex]) {
                        const weapon = DataLoader.getWeapon(character.wargear[wargearIndex].id);
                        if (weapon) {
                            choiceDisplay = weapon.name;
                        }
                    }
                }

                // Replace [Any], [Skill], [Trait], etc. with the actual choice
                displayName = displayName.replace(/\[.*?\]/, `(${choiceDisplay})`);
                if (displayName === talent.name) {
                    // If no placeholder found, append the choice
                    displayName = `${talent.name} (${choiceDisplay})`;
                }
            }

            // Build flavor text (displayed under effect, escaped to prevent glossary enhancement)
            const flavorHtml = talent.flavor
                ? `<div class="selected-talent-flavor">${talent.flavor}</div>`
                : '';

            // Ascension-granted badge and remove button
            const grantedBadge = isAscensionGranted ? '<span class="badge-starting">Ascension</span>' : '';
            const removeBtn = isAscensionGranted
                ? ''
                : `<button class="btn-remove" data-id="${talentId}">REMOVE</button>`;

            const item = document.createElement('div');
            item.className = 'selected-talent';
            item.innerHTML = `
                <div class="selected-talent-header">
                    <span class="selected-talent-name">${displayName} ${grantedBadge}</span>
                    ${removeBtn}
                </div>
                <div class="selected-talent-effect">${talent.effect || ''}</div>
                ${flavorHtml}
                <div class="source-ref">${DataLoader.formatSourcePage(talent)}</div>
            `;

            if (!isAscensionGranted) {
                item.querySelector('.btn-remove').addEventListener('click', async () => {
                    const talentData = DataLoader.getTalent(talentId);
                    const name = talentData ? talentData.name : talentId;
                    const confirmed = await window.api.showConfirm(`Remove talent ${name}?`);
                    if (!confirmed) return;
                    State.removeTalent(talentId, talentIdx);
                    this.render();
                });
            }

            // Enhance effect text with glossary terms (not flavor text)
            Glossary.enhanceElement(item.querySelector('.selected-talent-effect'));

            container.appendChild(item);
        }
    },

    renderTable() {
        const container = document.getElementById('talents-table');
        const character = State.getCharacter();
        const allTalents = DataLoader.getAllTalents();

        if (!allTalents || allTalents.length === 0) {
            container.innerHTML = '<p class="text-muted" style="padding: 20px;">No talent data loaded.</p>';
            return;
        }

        // Filter talents
        const talents = allTalents.filter(t => {
            // Check source
            if (!State.isSourceEnabled(t.source)) return false;

            // Check if already owned (handle both string and object formats)
            // Allow repeatable talents to appear even if already owned
            if (!t.repeatable) {
                const hasTalent = character.talents.some(entry =>
                    (typeof entry === 'string' ? entry : entry.id) === t.id
                );
                if (hasTalent) return false;
            }

            // Check search query
            if (this.searchQuery) {
                const searchable = `${t.name} ${t.effect}`.toLowerCase();
                if (!searchable.includes(this.searchQuery)) return false;
            }

            // Check prerequisites filter
            if (this.showOnlyFulfilled) {
                const check = PrerequisiteChecker.checkTalentPrerequisites(t, character);
                if (!check.met) return false;
            }

            return true;
        });

        // Sort by name
        talents.sort((a, b) => a.name.localeCompare(b.name));

        // Pagination
        const totalPages = Math.ceil(talents.length / this.itemsPerPage);
        const start = (this.currentPage - 1) * this.itemsPerPage;
        const pageItems = talents.slice(start, start + this.itemsPerPage);

        container.innerHTML = `
            <div class="talents-table-header">
                <span></span>
                <span>Name</span>
                <span>Cost</span>
                <span>Prerequisites</span>
                <span>Buy</span>
            </div>
        `;

        for (const talent of pageItems) {
            const prereqCheck = PrerequisiteChecker.checkTalentPrerequisites(talent, character);
            const canAfford = XPCalculator.canAfford(character, talent.cost || 0);
            const canAdd = prereqCheck.met && canAfford;

            // Show indicator for talents that can be taken multiple times
            const repeatableMark = talent.repeatable ? ' *' : '';

            // Create a wrapper for the row and its expandable description
            const rowWrapper = document.createElement('div');
            rowWrapper.className = 'talent-row-wrapper';

            const row = document.createElement('div');
            row.className = 'talent-row';
            row.innerHTML = `
                <span class="talent-expand">&#9654;</span>
                <span class="talent-name">${talent.name}${repeatableMark}</span>
                <span class="talent-cost">${talent.cost || 0}</span>
                <span class="talent-prereq ${prereqCheck.met ? '' : 'unmet'}">
                    ${PrerequisiteChecker.formatPrerequisites(talent)}
                </span>
                <button class="btn-add" data-id="${talent.id}" ${!canAdd ? 'disabled' : ''}>ADD</button>
            `;

            // Create the expandable description row with effect and flavor text
            const flavorHtml = talent.flavor
                ? `<div class="talent-desc-flavor">${talent.flavor}</div>`
                : '';

            const descRow = document.createElement('div');
            descRow.className = 'talent-desc-row hidden';
            descRow.innerHTML = `
                <div class="talent-desc-effect">${talent.effect || 'No description available.'}</div>
                ${flavorHtml}
                <div class="source-ref">${DataLoader.formatSourcePage(talent)}</div>
                <div class="talent-desc-actions">
                    <span class="talent-prereq ${prereqCheck.met ? '' : 'unmet'}">${PrerequisiteChecker.formatPrerequisites(talent)}</span>
                    <button class="btn-add" data-id="${talent.id}" ${!canAdd ? 'disabled' : ''}>ADD</button>
                </div>
            `;

            // Add click handler for expand/collapse
            const expandBtn = row.querySelector('.talent-expand');
            expandBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = !descRow.classList.contains('hidden');
                descRow.classList.toggle('hidden');
                expandBtn.innerHTML = isExpanded ? '&#9654;' : '&#9660;'; // Right arrow when collapsed, down when expanded
                row.classList.toggle('expanded', !isExpanded);
            });

            // Also allow clicking the row itself to expand (except the button)
            row.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON') {
                    expandBtn.click();
                }
            });

            // Bind the ADD button in both the row (desktop) and the expanded
            // detail row (mobile, where the row's prereq/ADD columns are hidden).
            [row, descRow].forEach(el => {
                const addBtn = el.querySelector('.btn-add');
                if (!addBtn) return;
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // Check if talent requires a choice
                    if (talent.requiresChoice) {
                        this.showChoiceModal(talent);
                    } else {
                        if (State.addTalent(talent.id)) {
                            this.render();
                        }
                    }
                });
            });

            // Enhance effect text with glossary terms (not flavor text)
            Glossary.enhanceElement(descRow.querySelector('.talent-desc-effect'));

            rowWrapper.appendChild(row);
            rowWrapper.appendChild(descRow);
            container.appendChild(rowWrapper);
        }

        // Legend for the repeatable marker
        const legend = document.createElement('div');
        legend.className = 'talent-legend text-muted';
        legend.textContent = '* Can be taken multiple times';
        container.appendChild(legend);

        // Pagination controls
        this.renderPagination(totalPages);
    },

    renderPagination(totalPages) {
        const container = document.getElementById('talents-pagination');

        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = '';

        // Previous button
        if (this.currentPage > 1) {
            const prevBtn = document.createElement('button');
            prevBtn.className = 'page-btn';
            prevBtn.textContent = '<';
            prevBtn.addEventListener('click', () => {
                this.currentPage--;
                this.renderTable();
            });
            container.appendChild(prevBtn);
        }

        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            if (i <= 3 || i > totalPages - 2 || Math.abs(i - this.currentPage) <= 1) {
                const pageBtn = document.createElement('button');
                pageBtn.className = `page-btn ${i === this.currentPage ? 'active' : ''}`;
                pageBtn.textContent = i;
                pageBtn.addEventListener('click', () => {
                    this.currentPage = i;
                    this.renderTable();
                });
                container.appendChild(pageBtn);
            } else if (i === 4 && this.currentPage > 5) {
                const ellipsis = document.createElement('span');
                ellipsis.textContent = '...';
                ellipsis.style.padding = '6px';
                container.appendChild(ellipsis);
            } else if (i === totalPages - 2 && this.currentPage < totalPages - 4) {
                const ellipsis = document.createElement('span');
                ellipsis.textContent = '...';
                ellipsis.style.padding = '6px';
                container.appendChild(ellipsis);
            }
        }

        // Next button
        if (this.currentPage < totalPages) {
            const nextBtn = document.createElement('button');
            nextBtn.className = 'page-btn';
            nextBtn.textContent = '>';
            nextBtn.addEventListener('click', () => {
                this.currentPage++;
                this.renderTable();
            });
            container.appendChild(nextBtn);
        }
    },

    refresh() {
        this.render();
    }
};
