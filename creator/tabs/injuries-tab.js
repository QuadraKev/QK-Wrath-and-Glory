// Injuries & Corruption Tab - Memorable Injuries, Traumatic Injuries, Corruption, Mutations

const InjuriesTab = {
    init() {
        this.render();
    },

    refresh() {
        this.render();
    },

    render() {
        const container = document.getElementById('section-injuries');
        if (!container) return;

        const character = State.getCharacter();
        const data = DataLoader.getInjuriesCorruptionData();
        if (!data || !data.memorableInjuries) {
            container.innerHTML = '<h2>Injuries & Corruption</h2><p class="section-desc">Loading data...</p>';
            return;
        }

        container.innerHTML = `
            <h2>Injuries & Corruption</h2>

            ${this.renderMemorableInjuries(character, data)}
            ${this.renderTraumaticInjuries(character, data)}
            ${this.renderCorruption(character, data)}
            ${this.renderMutations(character, data)}
        `;

        this.bindEvents(character, data);
    },

    renderMemorableInjuries(character, data) {
        const injuries = character.memorableInjuries || [];
        const options = data.memorableInjuries.map(inj =>
            `<option value="${inj.id}">${inj.name} (${inj.roll})</option>`
        ).join('');

        const list = injuries.map((entry, index) => {
            const inj = data.memorableInjuries.find(i => i.id === entry.id);
            if (!inj) return '';
            const escalatedLabel = entry.escalated
                ? `<span class="injury-escalation-label">${inj.escalation}</span>`
                : '';
            return `
                <div class="injury-item">
                    <div class="injury-item-header">
                        <span class="injury-item-name">${inj.name}${escalatedLabel}</span>
                        <div class="injury-item-actions">
                            <label class="injury-escalate-label">
                                <input type="checkbox" class="memorable-escalate" data-index="${index}" ${entry.escalated ? 'checked' : ''}>
                                Escalated
                            </label>
                            <button class="btn-remove memorable-remove" data-index="${index}">Remove</button>
                        </div>
                    </div>
                    ${entry.escalated ? `<div class="injury-description">${inj.escalationDesc}</div>` : ''}
                </div>
            `;
        }).join('');

        return `
            <h3>Memorable Injuries</h3>
            <p class="section-desc">A permanent reminder of a battle in which you nearly died. Whenever you reveal your Memorable Injury, you gain +1 bonus die on Intimidation (Wil) Tests.</p>
            <div class="injury-add-row">
                <select id="memorable-injury-select">
                    <option value="">Select an injury...</option>
                    ${options}
                </select>
                <button class="btn-add-injury" id="btn-add-memorable">+ Add</button>
            </div>
            <div class="injuries-list" id="memorable-injuries-list">
                ${list || '<p class="injuries-empty">No memorable injuries</p>'}
            </div>
        `;
    },

    renderTraumaticInjuries(character, data) {
        const injuries = character.traumaticInjuries || [];
        const options = data.traumaticInjuries.map(inj =>
            `<option value="${inj.id}">${inj.name} (${inj.roll})</option>`
        ).join('');

        const list = injuries.map((entry, index) => {
            const inj = data.traumaticInjuries.find(i => i.id === entry.id);
            if (!inj) return '';
            const sideLabel = entry.side ? ` (${entry.side})` : '';
            return `
                <div class="injury-item">
                    <div class="injury-item-header">
                        <span class="injury-item-name">${inj.name}${sideLabel}</span>
                        <div class="injury-item-actions">
                            <label class="injury-escalate-label">
                                <input type="checkbox" class="traumatic-reconstructed" data-index="${index}" ${entry.reconstructed ? 'checked' : ''}>
                                Reconstructed
                            </label>
                            <button class="btn-remove traumatic-remove" data-index="${index}">Remove</button>
                        </div>
                    </div>
                    <div class="injury-description">${inj.description}</div>
                </div>
            `;
        }).join('');

        return `
            <h3>Traumatic Injuries</h3>
            <p class="section-desc">These horrific wounds are almost impossible to survive without immediate Medicae attention. You suffer a Traumatic Injury whenever you would take a Wound while Dying.</p>
            <div class="injury-add-row">
                <select id="traumatic-injury-select">
                    <option value="">Select an injury...</option>
                    ${options}
                </select>
                <select id="traumatic-injury-side">
                    <option value="">N/A</option>
                    <option value="Left">Left</option>
                    <option value="Right">Right</option>
                </select>
                <button class="btn-add-injury" id="btn-add-traumatic">+ Add</button>
            </div>
            <div class="injuries-list" id="traumatic-injuries-list">
                ${list || '<p class="injuries-empty">No traumatic injuries</p>'}
            </div>
        `;
    },

    renderCorruption(character, data) {
        const corruption = character.corruption || 0;
        const table = data.corruptionTable || [];
        const currentLevel = table.find(l => corruption >= l.min && (l.max === null || corruption <= l.max)) || table[0];

        const tableRows = table.map(level => {
            const isCurrent = level === currentLevel;
            const maxDisplay = level.max === null ? '+' : level.max;
            const dnDisplay = level.dnModifier === null ? '-' : `+${level.dnModifier}`;
            return `
                <tr class="${isCurrent ? 'corruption-current-row' : ''}">
                    <td>${level.level}</td>
                    <td>${level.name}</td>
                    <td>${level.min}-${maxDisplay}</td>
                    <td>${dnDisplay}</td>
                </tr>
            `;
        }).join('');

        const dnDisplay = currentLevel.dnModifier === null ? '-' : `+${currentLevel.dnModifier}`;

        return `
            <h3>Corruption</h3>
            <div class="form-group">
                <label for="corruption-points">Corruption Points</label>
                <input type="number" id="corruption-points" min="0" value="${corruption}">
            </div>
            <div class="corruption-summary">
                <span class="corruption-level-display">Current Level: <strong>${currentLevel.name}</strong></span>
                <span class="corruption-dn-display">Test DN Modifier: <strong>${dnDisplay}</strong></span>
            </div>
            <table class="corruption-table">
                <thead>
                    <tr>
                        <th>Level</th>
                        <th>Name</th>
                        <th>Points</th>
                        <th>DN Modifier</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        `;
    },

    renderMutations(character, data) {
        const mutations = character.mutations || [];
        const allMutations = data.mutations || [];

        // Group mutations by severity for the select
        const subtle = allMutations.filter(m => m.severity === 'subtle');
        const minor = allMutations.filter(m => m.severity === 'minor');
        const severe = allMutations.filter(m => m.severity === 'severe');

        const optionHtml = (arr) => arr.map(m =>
            `<option value="${m.id}">${m.name}</option>`
        ).join('');

        const list = mutations.map((entry, index) => {
            const mutation = allMutations.find(m => m.id === entry.id);
            if (!mutation) return '';

            const severityClass = `mutation-severity-${mutation.severity}`;
            let subChoiceLabel = '';
            let effectText = mutation.effect;

            if (entry.subChoice && mutation.subChoices) {
                const sub = mutation.subChoices.find(s => s.id === entry.subChoice);
                if (sub) {
                    subChoiceLabel = ` — ${sub.name}`;
                    effectText = sub.effect;
                }
            }

            // Show active bonuses
            let bonusDisplay = '';
            let activeBonuses = mutation.bonuses;
            if (entry.subChoice && mutation.subChoices) {
                const sub = mutation.subChoices.find(s => s.id === entry.subChoice);
                activeBonuses = sub?.bonuses || null;
            }
            if (activeBonuses) {
                const bonusParts = Object.entries(activeBonuses).map(([key, val]) => {
                    const name = this.formatBonusKey(key);
                    return `${val > 0 ? '+' : ''}${val} ${name}`;
                });
                bonusDisplay = `<div class="mutation-bonuses">${bonusParts.join(', ')}</div>`;
            }

            return `
                <div class="mutation-item">
                    <div class="mutation-item-header">
                        <span class="mutation-item-name">${mutation.name}${subChoiceLabel}</span>
                        <span class="mutation-severity ${severityClass}">${mutation.severity}</span>
                        <button class="btn-remove mutation-remove" data-index="${index}">Remove</button>
                    </div>
                    <div class="mutation-description">${mutation.description}</div>
                    <div class="mutation-effect">${effectText}</div>
                    ${bonusDisplay}
                </div>
            `;
        }).join('');

        return `
            <h3>Mutations</h3>
            <p class="section-desc">Whenever your Corruption Level increases you must make a Mutation Test. Mutations vary wildly from the fey to the grotesque, some debilitating and some useful.</p>
            <div class="injury-add-row">
                <select id="mutation-select">
                    <option value="">Select a mutation...</option>
                    <optgroup label="Subtle">
                        ${optionHtml(subtle)}
                    </optgroup>
                    <optgroup label="Minor">
                        ${optionHtml(minor)}
                    </optgroup>
                    <optgroup label="Severe">
                        ${optionHtml(severe)}
                    </optgroup>
                </select>
                <select id="mutation-subchoice" class="hidden">
                    <option value="">Select sub-choice...</option>
                </select>
                <button class="btn-add-injury" id="btn-add-mutation">+ Add</button>
            </div>
            <div class="mutations-list" id="mutations-list">
                ${list || '<p class="injuries-empty">No mutations</p>'}
            </div>
        `;
    },

    formatBonusKey(key) {
        const map = {
            strength: 'Strength', toughness: 'Toughness', agility: 'Agility',
            initiative: 'Initiative', willpower: 'Willpower', intellect: 'Intellect',
            fellowship: 'Fellowship', resilience: 'Resilience', defence: 'Defence',
            maxWounds: 'Max Wounds', maxShock: 'Max Shock', speed: 'Speed',
            resolve: 'Resolve', passiveAwareness: 'Passive Awareness'
        };
        return map[key] || key;
    },

    bindEvents(character, data) {
        // Memorable injury add
        const btnAddMemorable = document.getElementById('btn-add-memorable');
        if (btnAddMemorable) {
            btnAddMemorable.addEventListener('click', () => {
                const select = document.getElementById('memorable-injury-select');
                if (select.value) {
                    State.addMemorableInjury(select.value);
                    this.render();
                }
            });
        }

        // Memorable injury remove
        document.querySelectorAll('.memorable-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                State.removeMemorableInjury(parseInt(btn.dataset.index));
                this.render();
            });
        });

        // Memorable injury escalate
        document.querySelectorAll('.memorable-escalate').forEach(cb => {
            cb.addEventListener('change', () => {
                State.escalateMemorableInjury(parseInt(cb.dataset.index));
                this.render();
            });
        });

        // Traumatic injury add
        const btnAddTraumatic = document.getElementById('btn-add-traumatic');
        if (btnAddTraumatic) {
            btnAddTraumatic.addEventListener('click', () => {
                const select = document.getElementById('traumatic-injury-select');
                const sideSelect = document.getElementById('traumatic-injury-side');
                if (select.value) {
                    const side = sideSelect.value || null;
                    State.addTraumaticInjury(select.value, side);
                    this.render();
                }
            });
        }

        // Traumatic injury reconstructed
        document.querySelectorAll('.traumatic-reconstructed').forEach(cb => {
            cb.addEventListener('change', () => {
                State.toggleTraumaticReconstruction(parseInt(cb.dataset.index));
                this.render();
            });
        });

        // Traumatic injury remove
        document.querySelectorAll('.traumatic-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                State.removeTraumaticInjury(parseInt(btn.dataset.index));
                this.render();
            });
        });

        // Corruption points input
        const corruptionInput = document.getElementById('corruption-points');
        if (corruptionInput) {
            corruptionInput.addEventListener('change', (e) => {
                State.setCorruptionPoints(e.target.value);
                this.render();
            });
        }

        // Mutation select change - show sub-choices if needed
        const mutationSelect = document.getElementById('mutation-select');
        const subChoiceSelect = document.getElementById('mutation-subchoice');
        if (mutationSelect && subChoiceSelect) {
            mutationSelect.addEventListener('change', () => {
                const mutation = data.mutations.find(m => m.id === mutationSelect.value);
                if (mutation?.subChoices) {
                    subChoiceSelect.innerHTML = '<option value="">Select sub-choice...</option>' +
                        mutation.subChoices.map(sc => `<option value="${sc.id}">${sc.name}</option>`).join('');
                    subChoiceSelect.classList.remove('hidden');
                } else {
                    subChoiceSelect.classList.add('hidden');
                    subChoiceSelect.innerHTML = '<option value="">Select sub-choice...</option>';
                }
            });
        }

        // Mutation add
        const btnAddMutation = document.getElementById('btn-add-mutation');
        if (btnAddMutation) {
            btnAddMutation.addEventListener('click', () => {
                if (mutationSelect.value) {
                    const mutation = data.mutations.find(m => m.id === mutationSelect.value);
                    let subChoice = null;
                    if (mutation?.subChoices) {
                        subChoice = subChoiceSelect.value || null;
                    }
                    State.addMutation(mutationSelect.value, subChoice);
                    this.render();
                }
            });
        }

        // Mutation remove
        document.querySelectorAll('.mutation-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                State.removeMutation(parseInt(btn.dataset.index));
                this.render();
            });
        });
    }
};
