// Powers Tab - Psychic powers management

const PowersTab = {
    selectedDisciplines: new Set(),
    searchQuery: '',

    init() {
        this.render();
    },

    // Get disciplines available to the character (only unlocked ones), sorted with Minor/Universal first
    getDisciplines() {
        const allPowers = DataLoader.getAllPsychicPowers();
        const unlocked = State.getUnlockedDisciplines();
        const disciplineSet = new Set();
        for (const p of allPowers) {
            if (p.discipline && State.isSourceEnabled(p.source)) {
                // Only include disciplines the character has unlocked
                if (unlocked.some(d => d.toLowerCase() === p.discipline.toLowerCase())) {
                    disciplineSet.add(p.discipline);
                }
            }
        }

        const disciplines = Array.from(disciplineSet);

        // Sort alphabetically, but pin Minor and Universal to the front
        const pinned = ['Minor', 'Universal'];
        disciplines.sort((a, b) => {
            const aPin = pinned.indexOf(a);
            const bPin = pinned.indexOf(b);
            if (aPin !== -1 && bPin !== -1) return aPin - bPin;
            if (aPin !== -1) return -1;
            if (bPin !== -1) return 1;
            return a.localeCompare(b);
        });

        return disciplines;
    },

    render() {
        const character = State.getCharacter();

        // Check if character is a psyker
        if (!State.isPsyker()) {
            document.getElementById('section-powers').innerHTML = `
                <h2>Manage Powers</h2>
                <div class="info-box" style="padding: 20px; background: var(--bg-card); border-radius: var(--radius-md); text-align: center;">
                    <p style="font-size: 16px; margin-bottom: 10px;">Your character does not have psychic abilities.</p>
                    <p class="text-muted">To access psychic powers, your character needs the PSYKER keyword. This can be obtained through certain archetypes (like Sanctioned Psyker) or by purchasing the Psychic Mastery skill.</p>
                </div>
            `;
            return;
        }

        // Build discipline tabs dynamically from unlocked disciplines
        const disciplines = this.getDisciplines();

        // Clean up selectedDisciplines: remove any that are no longer available
        for (const d of this.selectedDisciplines) {
            if (!disciplines.some(disc => disc.toLowerCase() === d.toLowerCase())) {
                this.selectedDisciplines.delete(d);
            }
        }

        const allActive = this.selectedDisciplines.size === 0;
        const disciplineButtons = [
            `<button class="discipline-btn ${allActive ? 'active' : ''}" data-discipline="all">All</button>`
        ].concat(disciplines.map(d => {
            const key = d.toLowerCase();
            const isActive = this.selectedDisciplines.has(key);
            return `<button class="discipline-btn ${isActive ? 'active' : ''}" data-discipline="${key}">${d}</button>`;
        })).join('\n                ');

        // Build setup section HTML
        const setupHtml = this.renderSetupSection();

        // Restore full UI
        document.getElementById('section-powers').innerHTML = `
            <h2>Manage Powers</h2>

            ${setupHtml}

            <div id="selected-powers" class="selected-powers"></div>

            <div class="discipline-tabs">
                ${disciplineButtons}
            </div>

            <div class="powers-controls">
                <input type="text" id="power-search" placeholder="Search" value="${this.searchQuery}">
            </div>

            <div id="powers-table" class="powers-table"></div>
        `;

        // Attach discipline button listeners (multi-select toggle)
        document.querySelectorAll('.discipline-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.discipline;
                if (key === 'all') {
                    // Clear selection → show all
                    this.selectedDisciplines.clear();
                } else {
                    // Toggle this discipline
                    if (this.selectedDisciplines.has(key)) {
                        this.selectedDisciplines.delete(key);
                    } else {
                        this.selectedDisciplines.add(key);
                    }
                }
                // Update active classes
                document.querySelectorAll('.discipline-btn').forEach(b => {
                    if (b.dataset.discipline === 'all') {
                        b.classList.toggle('active', this.selectedDisciplines.size === 0);
                    } else {
                        b.classList.toggle('active', this.selectedDisciplines.has(b.dataset.discipline));
                    }
                });
                this.renderTable();
            });
        });

        document.getElementById('power-search').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.renderTable();
        });

        // Attach setup section event listeners
        this.attachSetupListeners();

        this.renderSelected();
        this.renderTable();
    },

    // Render the setup section for pending psyker choices (discipline unlocks + free power picks)
    renderSetupSection() {
        const psykerConfig = State.getPsykerConfig();
        if (!psykerConfig) return '';

        let html = '';

        // 1. Discipline unlock prompt
        const allowed = psykerConfig.disciplineChoices || 0;
        const remainingChoices = State.getRemainingDisciplineChoices();
        if (allowed > 0) {
            const chosenDisciplines = State.getCharacter().unlockedDisciplines || [];

            // Show chosen disciplines as removable chips
            const chosenHtml = chosenDisciplines.map(d =>
                `<span class="discipline-chosen-chip">${d} <span class="discipline-chosen-remove" data-discipline="${d}">&times;</span></span>`
            ).join(' ');

            // Show unlock buttons for remaining choices
            let buttonsHtml = '';
            if (remainingChoices > 0) {
                const allPowers = DataLoader.getAllPsychicPowers();
                const unlocked = State.getUnlockedDisciplines();
                const availableDisciplines = new Set();
                for (const p of allPowers) {
                    if (p.discipline && State.isSourceEnabled(p.source)) {
                        if (!unlocked.some(d => d.toLowerCase() === p.discipline.toLowerCase())) {
                            availableDisciplines.add(p.discipline);
                        }
                    }
                }

                buttonsHtml = Array.from(availableDisciplines).sort().map(d =>
                    `<button class="btn-discipline-unlock" data-discipline="${d}">${d}</button>`
                ).join(' ');
            }

            const promptText = remainingChoices > 0
                ? `Choose ${remainingChoices} discipline${remainingChoices > 1 ? 's' : ''} to unlock:`
                : 'Unlocked discipline:';

            html += `
                <div class="setup-section" style="padding: 15px; margin-bottom: 15px; background: var(--bg-card); border-radius: var(--radius-md); border: 2px solid var(--accent);">
                    <p style="margin-bottom: 10px;"><strong>${promptText}</strong></p>
                    ${chosenHtml ? `<div style="margin-bottom: 10px;">${chosenHtml}</div>` : ''}
                    ${buttonsHtml ? `<div class="discipline-unlock-buttons">${buttonsHtml}</div>` : ''}
                </div>
            `;
        }

        // 2. Free power pick prompts
        const choiceStatus = State.getFreePowerChoiceStatus();
        for (let i = 0; i < choiceStatus.length; i++) {
            const entry = choiceStatus[i];
            if (entry.remaining <= 0) continue;

            const disciplineLabel = entry.disciplines.join(', ');
            // Get available powers from those disciplines
            const allPowers = DataLoader.getAllPsychicPowers();
            const character = State.getCharacter();
            const grantedPowers = psykerConfig.grantedPowers || [];
            const availablePowers = allPowers.filter(p => {
                if (!State.isSourceEnabled(p.source)) return false;
                if (character.psychicPowers.includes(p.id)) return false;
                if (grantedPowers.includes(p.id)) return false;
                return entry.disciplines.some(d => d.toLowerCase() === p.discipline.toLowerCase());
            }).sort((a, b) => a.name.localeCompare(b.name));

            const showDiscipline = entry.disciplines.length > 1;
            const powerButtons = availablePowers.map(p =>
                `<button class="btn-free-power-pick" data-power-id="${p.id}" style="margin: 3px;">${p.name}${showDiscipline ? ' (' + p.discipline + ')' : ''}</button>`
            ).join('');

            html += `
                <div class="setup-section" style="padding: 15px; margin-bottom: 15px; background: var(--bg-card); border-radius: var(--radius-md); border: 2px solid var(--accent);">
                    <p style="margin-bottom: 10px;"><strong>Choose ${entry.remaining} free power${entry.remaining > 1 ? 's' : ''} from ${disciplineLabel}:</strong></p>
                    <div class="free-power-buttons" style="display: flex; flex-wrap: wrap; gap: 5px;">${powerButtons}</div>
                </div>
            `;
        }

        return html;
    },

    // Attach event listeners for setup section buttons
    attachSetupListeners() {
        document.querySelectorAll('.btn-discipline-unlock').forEach(btn => {
            btn.addEventListener('click', () => {
                State.addDisciplineChoice(btn.dataset.discipline);
                this.render();
            });
        });

        document.querySelectorAll('.discipline-chosen-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                State.removeDisciplineChoice(btn.dataset.discipline);
                this.render();
            });
        });

        document.querySelectorAll('.btn-free-power-pick').forEach(btn => {
            btn.addEventListener('click', () => {
                State.addFreePowerPick(btn.dataset.powerId);
                this.render();
            });
        });
    },

    renderSelected() {
        const container = document.getElementById('selected-powers');
        const character = State.getCharacter();
        const psykerConfig = State.getPsykerConfig();
        const grantedPowers = psykerConfig?.grantedPowers || [];

        if (!container) return;

        container.innerHTML = '';

        // Show universal psyker abilities first (always granted, not stored in character data)
        if (State.isPsyker()) {
            for (const uaId of State.UNIVERSAL_ABILITY_IDS) {
                const power = DataLoader.getPsychicPower(uaId);
                if (!power) continue;
                const chip = document.createElement('span');
                chip.className = 'power-chip';
                chip.innerHTML = `${power.name} <span class="power-free-label">(Universal)</span>`;
                container.appendChild(chip);
            }
        }

        for (const powerId of character.psychicPowers) {
            // Skip universal abilities (shown above)
            if (State.UNIVERSAL_ABILITY_IDS.includes(powerId)) continue;

            const power = DataLoader.getPsychicPower(powerId);
            if (!power) continue;

            const isFree = (character.freePowers || []).includes(powerId);
            const isGranted = grantedPowers.includes(powerId);
            const freeLabel = isFree ? ' <span class="power-free-label">(Free)</span>' : '';

            const chip = document.createElement('span');
            chip.className = 'power-chip';

            if (isGranted) {
                // Granted powers (e.g. Smite) cannot be removed
                chip.innerHTML = `${power.name}${freeLabel}`;
            } else {
                chip.innerHTML = `
                    ${power.name}${freeLabel}
                    <span class="power-chip-remove" data-id="${powerId}">&times;</span>
                `;

                chip.querySelector('.power-chip-remove').addEventListener('click', async () => {
                    const powerData = DataLoader.getPsychicPower(powerId);
                    const name = powerData ? powerData.name : powerId;
                    const confirmed = await window.api.showConfirm(`Remove power ${name}?`);
                    if (!confirmed) return;
                    State.removePower(powerId);
                    this.render();
                });
            }

            container.appendChild(chip);
        }
    },

    renderTable() {
        const container = document.getElementById('powers-table');
        const character = State.getCharacter();
        const allPowers = DataLoader.getAllPsychicPowers();
        const unlocked = State.getUnlockedDisciplines();

        if (!container) return;

        if (!allPowers || allPowers.length === 0) {
            container.innerHTML = '<p class="text-muted" style="padding: 20px;">No psychic power data loaded.</p>';
            return;
        }

        // Filter powers
        const powers = allPowers.filter(p => {
            // Exclude universal psyker abilities (auto-granted, not purchasable)
            if (State.UNIVERSAL_ABILITY_IDS.includes(p.id)) return false;

            // Check source
            if (!State.isSourceEnabled(p.source)) return false;

            // Check if already owned
            if (character.psychicPowers.includes(p.id)) return false;

            // Enforce discipline unlock: only show powers from unlocked disciplines
            if (!unlocked.some(d => d.toLowerCase() === p.discipline.toLowerCase())) return false;

            // Check discipline filter (multi-select)
            if (this.selectedDisciplines.size > 0) {
                if (!this.selectedDisciplines.has(p.discipline.toLowerCase())) return false;
            }

            // Check search query
            if (this.searchQuery) {
                const searchable = `${p.name} ${p.effect}`.toLowerCase();
                if (!searchable.includes(this.searchQuery)) return false;
            }

            return true;
        });

        // Sort by name
        powers.sort((a, b) => a.name.localeCompare(b.name));

        container.innerHTML = '';

        for (const power of powers) {
            const prereqCheck = PrerequisiteChecker.checkPowerPrerequisites(power, character);
            const canAfford = XPCalculator.canAfford(character, power.cost || 0);
            const canAdd = prereqCheck.met && canAfford;

            const card = document.createElement('div');
            card.className = 'power-card';

            const potencyHtml = power.potency
                ? `<div class="power-card-potency"><span class="power-card-section-label">Potency</span>${power.potency}</div>`
                : '';

            card.innerHTML = `
                <div class="power-card-header">
                    <div>
                        <span class="power-card-name">${power.name}</span>
                        <span class="power-card-discipline">${power.discipline}</span>
                    </div>
                    <div class="power-card-actions">
                        <span class="power-card-cost">${power.cost || 0} XP</span>
                        <button class="btn-add" data-id="${power.id}" ${!canAdd ? 'disabled' : ''}>ADD</button>
                    </div>
                </div>
                <div class="power-card-stats">
                    <div><span class="power-card-stat-label">DN</span><span>${power.dn || '-'}</span></div>
                    <div><span class="power-card-stat-label">Activation</span><span>${power.activation || '-'}</span></div>
                    <div><span class="power-card-stat-label">Duration</span><span>${power.duration || '-'}</span></div>
                    <div><span class="power-card-stat-label">Range</span><span>${power.range || '-'}</span></div>
                </div>
                <div class="power-card-effect">${power.effect || ''}</div>
                ${potencyHtml}
                <div class="source-ref">${DataLoader.formatSourcePage(power)}</div>
            `;

            card.querySelector('.btn-add').addEventListener('click', () => {
                if (State.addPower(power.id)) {
                    this.render();
                }
            });

            // Enhance power effects with glossary terms
            Glossary.enhanceElement(card.querySelector('.power-card-effect'));

            container.appendChild(card);
        }

        if (powers.length === 0) {
            container.innerHTML += '<p class="text-muted" style="padding: 20px;">No powers available in this discipline.</p>';
        }
    },

    formatDiscipline(discipline) {
        if (!discipline) return '';
        // Look up the original casing from the data
        const allPowers = DataLoader.getAllPsychicPowers();
        const match = allPowers.find(p => p.discipline && p.discipline.toLowerCase() === discipline.toLowerCase());
        return match ? match.discipline : discipline;
    },

    refresh() {
        this.render();
    }
};
