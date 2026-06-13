// Background Tab - Origin, Accomplishment, Goal, Languages, Notes

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

        // Notes textarea
        document.getElementById('character-notes').addEventListener('input', (e) => {
            State.setNotes(e.target.value);
        });

        this.render();
    },

    render() {
        this.populateSelects();
        this.renderDetails();
        this.renderLanguages();
        this.renderNotes();
        this.renderBonusDisplay();
    },

    populateSelects() {
        const backgrounds = DataLoader.getBackgrounds();
        const character = State.getCharacter();

        // Repair any existing selections that are missing bonusType
        this.repairMissingBonusTypes(character, backgrounds);

        // Populate origin select
        const originSelect = document.getElementById('origin-select');
        const origins = backgrounds.origins || [];
        originSelect.innerHTML = '<option value="">Select an Origin...</option>';
        for (const origin of origins) {
            const selected = character.background.origin?.id === origin.id ? 'selected' : '';
            originSelect.innerHTML += `<option value="${origin.id}" ${selected}>${origin.name} - ${origin.bonus || ''}</option>`;
        }

        // Populate accomplishment select
        const accomplishmentSelect = document.getElementById('accomplishment-select');
        const accomplishments = backgrounds.accomplishments || [];
        accomplishmentSelect.innerHTML = '<option value="">Select an Accomplishment...</option>';
        for (const acc of accomplishments) {
            const selected = character.background.accomplishment?.id === acc.id ? 'selected' : '';
            accomplishmentSelect.innerHTML += `<option value="${acc.id}" ${selected}>${acc.name} - ${acc.bonus || ''}</option>`;
        }

        // Populate goal select
        const goalSelect = document.getElementById('goal-select');
        const goals = backgrounds.goals || [];
        goalSelect.innerHTML = '<option value="">Select a Goal...</option>';
        for (const goal of goals) {
            const selected = character.background.goal?.id === goal.id ? 'selected' : '';
            goalSelect.innerHTML += `<option value="${goal.id}" ${selected}>${goal.name} - ${goal.bonus || ''}</option>`;
        }
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

        if (!character.background.bonusUsed) {
            bonusDisplay.classList.add('hidden');
            return;
        }

        let bonusText = '';
        const type = character.background.bonusUsed;

        if (type === 'origin' && character.background.origin?.id) {
            const origin = (backgrounds.origins || []).find(o => o.id === character.background.origin.id);
            if (origin) {
                bonusText = `${origin.name}: ${origin.bonusDescription || origin.bonus || ''}`;
            }
        } else if (type === 'accomplishment' && character.background.accomplishment?.id) {
            const acc = (backgrounds.accomplishments || []).find(a => a.id === character.background.accomplishment.id);
            if (acc) {
                bonusText = `${acc.name}: ${acc.bonusDescription || acc.bonus || ''}`;
            }
        } else if (type === 'goal' && character.background.goal?.id) {
            const goal = (backgrounds.goals || []).find(g => g.id === character.background.goal.id);
            if (goal) {
                bonusText = `${goal.name}: ${goal.bonusDescription || goal.bonus || ''}`;
            }
        }

        if (bonusText) {
            bonusDisplay.innerHTML = `<strong>Selected Bonus:</strong> ${bonusText}`;
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
                    <span class="language-remove" data-lang="${escaped}" style="cursor: pointer; margin-left: 5px;">&times;</span>
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

    renderNotes() {
        const character = State.getCharacter();
        document.getElementById('character-notes').value = character.notes || '';
    },

    refresh() {
        this.render();
    },

    // Repair any background selections that are missing bonusType
    repairMissingBonusTypes(character, backgrounds) {
        // Check origin
        if (character.background.origin?.id && !character.background.origin.bonusType) {
            const origin = (backgrounds.origins || []).find(o => o.id === character.background.origin.id);
            if (origin?.bonusType) {
                character.background.origin.bonusType = origin.bonusType;
            }
        }

        // Check accomplishment
        if (character.background.accomplishment?.id && !character.background.accomplishment.bonusType) {
            const accomplishment = (backgrounds.accomplishments || []).find(a => a.id === character.background.accomplishment.id);
            if (accomplishment?.bonusType) {
                character.background.accomplishment.bonusType = accomplishment.bonusType;
            }
        }

        // Check goal
        if (character.background.goal?.id && !character.background.goal.bonusType) {
            const goal = (backgrounds.goals || []).find(g => g.id === character.background.goal.id);
            if (goal?.bonusType) {
                character.background.goal.bonusType = goal.bonusType;
            }
        }
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
