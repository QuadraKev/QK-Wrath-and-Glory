// Species Tab - Species selection

const SpeciesTab = {
    pendingSubOptions: null,  // Track pending sub-options to configure
    currentSubOptionIndex: 0, // For multi-step sub-option selection

    init() {
        this.initSubOptionModal();
        this.render();

        // Listen for tier changes to prompt for more Kroot mutations
        State.addListener((changeType) => {
            if (changeType === 'krootMutationsAvailable') {
                this.checkKrootMutations();
            }
        });
    },

    // Initialize the sub-option selection modal
    initSubOptionModal() {
        if (!document.getElementById('species-suboption-modal')) {
            const modal = document.createElement('div');
            modal.id = 'species-suboption-modal';
            modal.className = 'modal hidden';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="suboption-modal-title">Select Option</h3>
                        <button class="modal-close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <p id="suboption-modal-description"></p>
                        <div id="suboption-modal-options"></div>
                        <div id="suboption-selected-list" class="suboption-selected-list hidden">
                            <h4>Selected:</h4>
                            <div id="suboption-selected-items"></div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="btn-cancel-suboption" class="btn-secondary">Cancel</button>
                        <button id="btn-confirm-suboption" class="btn-primary">Confirm</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            // Event listeners
            modal.querySelector('.modal-close').addEventListener('click', () => this.hideSubOptionModal());
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.hideSubOptionModal();
            });
            document.getElementById('btn-cancel-suboption').addEventListener('click', () => this.hideSubOptionModal());
            document.getElementById('btn-confirm-suboption').addEventListener('click', () => this.confirmSubOption());
        }
    },

    render() {
        const container = document.getElementById('species-list');
        const species = DataLoader.getAllSpecies();
        const character = State.getCharacter();

        if (!species || species.length === 0) {
            container.innerHTML = '<p class="text-muted">No species data loaded.</p>';
            return;
        }

        container.innerHTML = '';

        for (const sp of species) {
            // Check if source is enabled
            if (!State.isSourceEnabled(sp.source)) continue;

            const isSelected = character.species?.id === sp.id;

            const card = document.createElement('div');
            card.className = `card ${isSelected ? 'selected' : ''}`;

            // Build sub-option display if selected and has sub-options
            let subOptionDisplay = '';
            let hasSubOptionsToShow = false;
            if (isSelected && sp.subOptions) {
                const selectedSubOptions = State.getSpeciesSubOptions();
                const subOptionsConfig = Array.isArray(sp.subOptions) ? sp.subOptions : [sp.subOptions];

                for (const config of subOptionsConfig) {
                    const selected = selectedSubOptions.filter(opt => opt.type === config.type);
                    if (selected.length > 0) {
                        hasSubOptionsToShow = true;
                        const names = selected.map(sel => {
                            const option = config.options?.find(o => o.id === sel.optionId);
                            return option?.name || sel.optionId;
                        });
                        subOptionDisplay += `<div class="card-suboption"><strong>${config.label}:</strong> ${names.join(', ')}</div>`;
                    } else if (config.required === false) {
                        hasSubOptionsToShow = true;
                        subOptionDisplay += `<div class="card-suboption"><strong>${config.label}:</strong> None</div>`;
                    }
                }

                if (hasSubOptionsToShow) {
                    subOptionDisplay += `<div class="card-suboption-change">Click to change ${subOptionsConfig.map(c => c.label.toLowerCase()).join('/')}</div>`;
                }
            }

            card.innerHTML = `
                <div class="card-header">
                    <span class="card-title">${sp.name}</span>
                    <span class="card-xp">${sp.cost} XP</span>
                </div>
                <div class="card-description">${sp.description || ''}</div>
                ${subOptionDisplay}
                <div class="card-meta">
                    <span>Speed: ${sp.speed || 6}</span>
                    <span class="card-source">${DataLoader.formatSourcePage(sp)}</span>
                </div>
            `;

            card.addEventListener('click', () => {
                const wasSelected = isSelected;

                // If clicking same species and it has sub-options, just show modal to change them
                if (wasSelected && sp.subOptions) {
                    this.showSubOptionModal(sp);
                    return;
                }

                State.setSpecies(sp.id);

                // Check if species has sub-options that need to be configured
                if (sp.subOptions) {
                    this.showSubOptionModal(sp);
                }

                this.render();
            });

            container.appendChild(card);
        }
    },

    // Show the sub-option modal for a species
    showSubOptionModal(species) {
        const subOptionsConfig = Array.isArray(species.subOptions) ? species.subOptions : [species.subOptions];
        this.pendingSubOptions = {
            species: species,
            configs: subOptionsConfig,
            currentIndex: 0
        };

        this.renderCurrentSubOption();
    },

    // Render the current sub-option selection
    renderCurrentSubOption() {
        if (!this.pendingSubOptions) return;

        const { species, configs, currentIndex } = this.pendingSubOptions;
        const config = configs[currentIndex];

        const modal = document.getElementById('species-suboption-modal');
        const title = document.getElementById('suboption-modal-title');
        const description = document.getElementById('suboption-modal-description');
        const optionsContainer = document.getElementById('suboption-modal-options');
        const selectedListContainer = document.getElementById('suboption-selected-list');
        const selectedItemsContainer = document.getElementById('suboption-selected-items');

        // Set title based on type
        if (config.countByTier) {
            const count = State.getKrootMutationCount();
            const currentSelected = State.getSpeciesSubOptionsByType(config.type).length;
            title.textContent = `Select ${config.label} (${currentSelected}/${count})`;
            description.textContent = `Choose ${count} ${config.label.toLowerCase()}(s) based on your Tier.`;
        } else {
            title.textContent = `Select ${config.label}`;
            const optionalNote = config.required === false ? ' (optional)' : '';
            description.textContent = (config.description || `Choose your ${config.label.toLowerCase()}.`) + optionalNote;
        }

        // Render options
        optionsContainer.innerHTML = '';
        for (const option of config.options || []) {
            const isSelected = State.getSpeciesSubOptionsByType(config.type)
                .some(sel => sel.optionId === option.id);

            const btn = document.createElement('button');
            btn.className = `choice-option-btn ${isSelected ? 'selected' : ''}`;

            // Build option display
            let optionHtml = `<strong>${option.name}</strong>`;

            // For options with abilities (chapters), show each ability with effect + flavor
            if (option.abilities && option.abilities.length > 0) {
                optionHtml += '<div class="choice-option-abilities-list">';
                for (const ability of option.abilities) {
                    optionHtml += `<div class="choice-ability-item">`;
                    optionHtml += `<span class="choice-ability-name">${ability.name}:</span>`;
                    if (ability.effect) {
                        optionHtml += `<span class="choice-ability-effect">${ability.effect}</span>`;
                    }
                    if (ability.flavor) {
                        optionHtml += `<div class="choice-ability-flavor">${ability.flavor}</div>`;
                    }
                    optionHtml += `</div>`;
                }
                optionHtml += '</div>';
            }
            // For options with just effect (paths, mutations, disciplines)
            else {
                const optionEffect = option.effect || option.description;
                if (optionEffect) {
                    optionHtml += `<div class="choice-option-desc">${optionEffect}</div>`;
                }
            }

            if (option.restricted) {
                optionHtml += `<div class="choice-option-restricted">* Requires GM permission</div>`;
            }

            btn.innerHTML = optionHtml;
            btn.dataset.optionId = option.id;

            btn.addEventListener('click', () => {
                if (config.countByTier) {
                    // Multi-select (mutations)
                    if (isSelected) {
                        State.removeSpeciesSubOption(config.type, option.id);
                    } else if (State.canAddMoreKrootMutations()) {
                        State.setSpeciesSubOption(config.type, option.id);
                    }
                    this.renderCurrentSubOption();
                } else {
                    // Single-select — allow deselect if not required
                    if (btn.classList.contains('selected') && config.required === false) {
                        btn.classList.remove('selected');
                    } else {
                        optionsContainer.querySelectorAll('.choice-option-btn').forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                    }
                }
            });

            optionsContainer.appendChild(btn);
        }

        // Enhance ability/effect text with glossary tooltips
        if (typeof Glossary !== 'undefined' && Glossary.enhanceElement) {
            optionsContainer.querySelectorAll('.choice-ability-effect, .choice-option-desc').forEach(el => {
                Glossary.enhanceElement(el);
            });
        }

        // Show selected items for multi-select
        if (config.countByTier) {
            const selected = State.getSpeciesSubOptionsByType(config.type);
            if (selected.length > 0) {
                selectedListContainer.classList.remove('hidden');
                selectedItemsContainer.innerHTML = selected.map(sel => {
                    const opt = config.options?.find(o => o.id === sel.optionId);
                    return `<span class="selected-chip">${opt?.name || sel.optionId}</span>`;
                }).join('');
            } else {
                selectedListContainer.classList.add('hidden');
            }
        } else {
            selectedListContainer.classList.add('hidden');
        }

        // Update confirm button text
        const confirmBtn = document.getElementById('btn-confirm-suboption');
        if (currentIndex < configs.length - 1) {
            confirmBtn.textContent = 'Next';
        } else {
            confirmBtn.textContent = 'Confirm';
        }

        modal.classList.remove('hidden');
    },

    // Hide the sub-option modal
    hideSubOptionModal() {
        const modal = document.getElementById('species-suboption-modal');
        modal.classList.add('hidden');
        this.pendingSubOptions = null;
    },

    // Confirm the current sub-option selection
    confirmSubOption() {
        if (!this.pendingSubOptions) return;

        const { configs, currentIndex } = this.pendingSubOptions;
        const config = configs[currentIndex];

        // Validate selection
        if (config.countByTier) {
            // For mutations, check if we have enough
            const count = State.getKrootMutationCount();
            const selected = State.getSpeciesSubOptionsByType(config.type);
            if (selected.length < count) {
                alert(`Please select ${count} ${config.label.toLowerCase()}(s).`);
                return;
            }
        } else {
            // For single-select, check if something is selected
            const selectedBtn = document.querySelector('#suboption-modal-options .choice-option-btn.selected');
            if (!selectedBtn) {
                if (config.required !== false) {
                    alert(`Please select a ${config.label.toLowerCase()}.`);
                    return;
                }
                // Optional sub-option — clear any existing selection
                const existing = State.getSpeciesSubOptionsByType(config.type);
                for (const sel of existing) {
                    State.removeSpeciesSubOption(config.type, sel.optionId);
                }
            } else {
                // Save the selection
                State.setSpeciesSubOption(config.type, selectedBtn.dataset.optionId);
            }
        }

        // Move to next sub-option or finish
        if (currentIndex < configs.length - 1) {
            this.pendingSubOptions.currentIndex++;
            this.renderCurrentSubOption();
        } else {
            this.hideSubOptionModal();
            this.render();
        }
    },

    // Check if Kroot needs more mutations (called when tier changes)
    checkKrootMutations() {
        const character = State.getCharacter();
        if (character.species?.id !== 'kroot') return;

        const species = DataLoader.getSpecies('kroot');
        if (!species?.subOptions) return;

        if (State.canAddMoreKrootMutations()) {
            // Show modal to select additional mutations
            this.showSubOptionModal(species);
        }
    },

    refresh() {
        this.render();
    }
};
