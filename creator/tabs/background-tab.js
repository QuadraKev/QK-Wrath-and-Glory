// Background Tab - Origin, Accomplishment, Goal, Languages

const BackgroundTab = {
    init() {
        // Origin select
        document.getElementById('origin-select').addEventListener('change', (e) => {
            const backgrounds = DataLoader.getBackgrounds();
            const origin = (backgrounds.origins || []).find(o => o.id === e.target.value);
            State.setBackground('origin', e.target.value, origin?.bonusType || null);
            this.render();
        });

        // Accomplishment select
        document.getElementById('accomplishment-select').addEventListener('change', (e) => {
            const backgrounds = DataLoader.getBackgrounds();
            const accomplishment = (backgrounds.accomplishments || []).find(a => a.id === e.target.value);
            State.setBackground('accomplishment', e.target.value, accomplishment?.bonusType || null);
            this.render();
        });

        // Goal select
        document.getElementById('goal-select').addEventListener('change', (e) => {
            const backgrounds = DataLoader.getBackgrounds();
            const goal = (backgrounds.goals || []).find(g => g.id === e.target.value);
            State.setBackground('goal', e.target.value, goal?.bonusType || null);
            this.render();
        });

        // Add language button
        document.getElementById('btn-add-language').addEventListener('click', () => {
            const input = document.getElementById('new-language');
            const freeToggle = document.getElementById('free-language-toggle');
            const language = input.value.trim();
            if (language) {
                State.addLanguage(language, freeToggle.checked);
                input.value = '';
                this.renderLanguages();
            }
        });

        // Language input enter key
        document.getElementById('new-language').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('btn-add-language').click();
            }
        });

        this.render();
    },

    render() {
        this.populateSelects();
        this.renderDetails();
        this.renderLanguages();
        this.renderBonusDisplay();
    },

    populateSelects() {
        const backgrounds = DataLoader.getBackgrounds();
        const character = State.getCharacter();

        // Populate origin select
        const originSelect = document.getElementById('origin-select');
        const origins = backgrounds.origins || [];
        originSelect.innerHTML = '<option value="">Select an Origin...</option>';
        this.addUnknownOption(originSelect, 'origin', character.background.origin?.id, origins);
        for (const origin of origins) {
            const selected = character.background.origin?.id === origin.id ? 'selected' : '';
            originSelect.innerHTML += `<option value="${origin.id}" ${selected}>${origin.name} - ${origin.bonus || ''}</option>`;
        }

        // Populate accomplishment select
        const accomplishmentSelect = document.getElementById('accomplishment-select');
        const accomplishments = backgrounds.accomplishments || [];
        accomplishmentSelect.innerHTML = '<option value="">Select an Accomplishment...</option>';
        this.addUnknownOption(accomplishmentSelect, 'accomplishment', character.background.accomplishment?.id, accomplishments);
        for (const acc of accomplishments) {
            const selected = character.background.accomplishment?.id === acc.id ? 'selected' : '';
            accomplishmentSelect.innerHTML += `<option value="${acc.id}" ${selected}>${acc.name} - ${acc.bonus || ''}</option>`;
        }

        // Populate goal select
        const goalSelect = document.getElementById('goal-select');
        const goals = backgrounds.goals || [];
        goalSelect.innerHTML = '<option value="">Select a Goal...</option>';
        this.addUnknownOption(goalSelect, 'goal', character.background.goal?.id, goals);
        for (const goal of goals) {
            const selected = character.background.goal?.id === goal.id ? 'selected' : '';
            goalSelect.innerHTML += `<option value="${goal.id}" ${selected}>${goal.name} - ${goal.bonus || ''}</option>`;
        }
    },

    // A stored id that the data does not have shows as a disabled, selected option. The player can pick another entry.
    addUnknownOption(select, kind, id, list) {
        if (!id || list.some(entry => entry.id === id)) return;
        const text = this.escapeHtml(`Unknown ${kind} (${id})`);
        select.innerHTML += `<option value="${this.escapeAttr(String(id))}" selected disabled>${text}</option>`;
    },

    renderDetails() {
        const backgrounds = DataLoader.getBackgrounds();
        const character = State.getCharacter();

        // Origin detail
        const originDetail = document.getElementById('origin-detail');
        if (character.background.origin?.id) {
            const origin = (backgrounds.origins || []).find(o => o.id === character.background.origin.id);
            if (origin) {
                originDetail.innerHTML = `
                    <p>${origin.description || ''}</p>
                    ${this.renderBonusButton('origin', origin)}
                `;
            } else {
                originDetail.innerHTML = '';
            }
        } else {
            originDetail.innerHTML = '';
        }

        // Accomplishment detail
        const accomplishmentDetail = document.getElementById('accomplishment-detail');
        if (character.background.accomplishment?.id) {
            const acc = (backgrounds.accomplishments || []).find(a => a.id === character.background.accomplishment.id);
            if (acc) {
                accomplishmentDetail.innerHTML = `
                    <p>${acc.description || ''}</p>
                    ${this.renderBonusButton('accomplishment', acc)}
                `;
            } else {
                accomplishmentDetail.innerHTML = '';
            }
        } else {
            accomplishmentDetail.innerHTML = '';
        }

        // Goal detail
        const goalDetail = document.getElementById('goal-detail');
        if (character.background.goal?.id) {
            const goal = (backgrounds.goals || []).find(g => g.id === character.background.goal.id);
            if (goal) {
                goalDetail.innerHTML = `
                    <p>${goal.description || ''}</p>
                    ${this.renderBonusButton('goal', goal)}
                `;
            } else {
                goalDetail.innerHTML = '';
            }
        } else {
            goalDetail.innerHTML = '';
        }

        // Enhance descriptions with glossary tooltips
        if (typeof Glossary !== 'undefined' && Glossary.enhanceElement) {
            [originDetail, accomplishmentDetail, goalDetail].forEach(el => {
                const desc = el.querySelector('p');
                if (desc) Glossary.enhanceElement(desc);
            });
        }

        // Attach event listeners for bonus buttons
        document.querySelectorAll('.btn-use-bonus').forEach(btn => {
            btn.addEventListener('click', () => {
                State.useBackgroundBonus(btn.dataset.type);
                this.render();
            });
        });
    },

    renderBonusButton(type, background) {
        const character = State.getCharacter();
        const isUsed = character.background.bonusUsed === type;

        if (isUsed) {
            return `<button class="btn-use-bonus" disabled>BONUS USED</button>`;
        }

        return `<button class="btn-use-bonus" data-type="${type}">USE THIS BONUS</button>`;
    },

    renderBonusDisplay() {
        const bonusDisplay = document.getElementById('background-bonus');
        const character = State.getCharacter();
        const backgrounds = DataLoader.getBackgrounds();
        const lists = { origin: backgrounds.origins, accomplishment: backgrounds.accomplishments, goal: backgrounds.goals };
        const labels = {
            determination: 'Determination', conviction: 'Conviction', influence: 'Influence', resolve: 'Resolve',
            maxShock: 'Max Shock', maxWounds: 'Max Wounds', wealth: 'Wealth'
        };

        let bonusText = '';
        const type = character.background.bonusUsed;
        const entry = lists[type] ? character.background[type] : null;

        if (entry?.id) {
            const record = (lists[type] || []).find(r => r.id === entry.id);
            if (record) {
                bonusText = `${this.escapeHtml(record.name)}: ${this.escapeHtml(record.bonusDescription || record.bonus || '')}`;
            } else {
                // An id that the data does not have: show it with the stored bonus that still applies.
                const applied = DerivedStats.getAppliedBackgroundBonus(character);
                if (applied) bonusText = `${this.escapeHtml(`Unknown ${type} (${entry.id})`)}: +1 ${this.escapeHtml(labels[applied])}`;
            }
        }

        if (bonusText) {
            bonusDisplay.innerHTML = `<strong>Selected Bonus:</strong> ${bonusText}`;
            bonusDisplay.classList.remove('hidden');
        } else if (['origin', 'accomplishment', 'goal'].some(key => character.background[key]?.id)) {
            // An entry is set but no bonus applies: tell the user to select one.
            bonusDisplay.innerHTML = 'Select one bonus with USE THIS BONUS. A character gets one Background bonus (Core Rulebook p.43).';
            bonusDisplay.classList.remove('hidden');
        } else {
            bonusDisplay.classList.add('hidden');
        }
    },

    renderLanguages() {
        const container = document.getElementById('languages-list');
        const character = State.getCharacter();

        container.innerHTML = '';

        const freeLanguages = character.freeLanguages || [];

        for (const language of character.languages) {
            const chip = document.createElement('span');
            chip.className = 'language-chip';

            if (language === 'low_gothic') {
                chip.textContent = 'Low Gothic';
            } else {
                const isFree = freeLanguages.includes(language);
                const costLabel = isFree ? '(Free)' : '(1 XP)';
                const escaped = this.escapeHtml(language);
                chip.innerHTML = `
                    ${escaped} <span class="language-xp-cost">${costLabel}</span>
                    <span class="language-remove" data-lang="${this.escapeAttr(language)}" style="cursor: pointer; margin-left: 5px;">&times;</span>
                `;

                const removeBtn = chip.querySelector('.language-remove');
                if (removeBtn) {
                    removeBtn.addEventListener('click', () => {
                        State.removeLanguage(language);
                        this.renderLanguages();
                    });
                }
            }

            container.appendChild(chip);
        }
    },

    refresh() {
        this.render();
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Escape for a value inside a double-quoted attribute. The DOM helper above leaves the quote raw.
    escapeAttr(text) {
        return this.escapeHtml(text).replace(/"/g, '&quot;');
    }
};
