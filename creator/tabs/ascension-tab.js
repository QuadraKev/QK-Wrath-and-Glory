// Ascension Tab - Slot-based ascension management

const AscensionTab = {
    init() {
        this.render();
    },

    render() {
        const container = document.getElementById('ascension-content');
        const character = State.getCharacter();
        const startingTier = character.tier || 1;
        const archetypeTier = State.getArchetypeTier();

        // Build list of ascension slots
        const slots = [];

        // Creation ascension slot: if archetype tier < starting tier
        if (archetypeTier < startingTier) {
            slots.push({
                targetTier: startingTier,
                label: `Creation Ascension (to Tier ${startingTier})`,
                isCreation: true
            });
        }

        // Experience ascension slots: tiers above starting tier, up to 5
        for (let t = startingTier + 1; t <= 5; t++) {
            slots.push({
                targetTier: t,
                label: `Ascension to Tier ${t}`,
                isCreation: false
            });
        }

        // Tier 5 starting campaign: no slots available
        if (slots.length === 0) {
            container.innerHTML = '<p class="text-muted">No ascension slots available. Your character is already at the maximum tier (Tier 5).</p>';
            return;
        }

        // Show effective tier summary
        const effectiveTier = State.getEffectiveTier();
        let html = `<div class="ascension-summary">
            <span class="ascension-tier-info">Starting Tier: <strong>${startingTier}</strong></span>
            <span class="ascension-tier-info">Effective Tier: <strong>${effectiveTier}</strong></span>
        </div>`;

        // Render each slot
        for (const slot of slots) {
            html += this.renderSlot(slot, character);
        }

        container.innerHTML = html;
        this.bindEvents(container);
    },

    // Render a single ascension slot
    renderSlot(slot, character) {
        const ascensions = character.ascensions || [];
        const current = ascensions.find(a => a.targetTier === slot.targetTier);
        const currentType = current?.type || 'none';

        let html = `<div class="ascension-slot" data-target-tier="${slot.targetTier}">
            <h3 class="ascension-slot-title">${slot.label}</h3>
            <div class="ascension-type-selector">
                <label class="ascension-radio-label">
                    <input type="radio" name="ascension-type-${slot.targetTier}" value="none" ${currentType === 'none' ? 'checked' : ''}>
                    <span>None</span>
                </label>
                <label class="ascension-radio-label">
                    <input type="radio" name="ascension-type-${slot.targetTier}" value="package" ${currentType === 'package' ? 'checked' : ''}>
                    <span>Ascension Package</span>
                </label>
                <label class="ascension-radio-label">
                    <input type="radio" name="ascension-type-${slot.targetTier}" value="archetype" ${currentType === 'archetype' ? 'checked' : ''}>
                    <span>Archetype Ascension</span>
                </label>
            </div>`;

        if (currentType === 'package') {
            html += this.renderPackageSelector(slot, current, character);
        } else if (currentType === 'archetype') {
            html += this.renderArchetypeSelector(slot, current, character);
        }

        html += `</div>`;
        return html;
    },

    // Render package selection UI for a slot
    renderPackageSelector(slot, current, character) {
        const packages = DataLoader.getAscensionPackages();
        const selectedId = current?.packageId || null;

        let html = '<div class="ascension-options">';

        // Get character info for fundamental compatibility filtering
        const charSpeciesName = (DataLoader.getSpecies(character.species?.id)?.name || '').toLowerCase();
        const charKeywords = State.getKeywords();

        for (const pkg of packages) {
            if (!State.isSourceEnabled(pkg.source)) continue;

            // Hide packages with fundamentally incompatible species/keyword prerequisites
            const prereqs = pkg.prerequisites;
            if (prereqs) {
                // Species prerequisite — character can never change species
                if (prereqs.species && prereqs.species.length > 0) {
                    if (!charSpeciesName || !prereqs.species.some(s => s.toLowerCase() === charSpeciesName)) continue;
                }
                // Keyword prerequisite — faction keywords are innate and can't be gained
                if (prereqs.keywords && prereqs.keywords.length > 0) {
                    const hasAny = prereqs.keywords.some(k => charKeywords.includes(k));
                    if (!hasAny) continue;
                }
            }

            const isSelected = pkg.id === selectedId;
            const xpCost = pkg.costMultiplier ? pkg.costMultiplier * slot.targetTier : parseInt(pkg.cost) || 0;

            // Check prerequisites
            const prereqResult = this.checkPackagePrereqs(pkg, character);
            const prereqClass = prereqResult.met ? '' : ' ascension-prereq-unmet';

            // Check affordability (a currently-selected package can always be toggled off)
            const canAfford = isSelected || XPCalculator.canAfford(character, xpCost);
            const affordClass = canAfford ? '' : ' ascension-unaffordable';

            const card = `
                <div class="card ascension-card${isSelected ? ' selected' : ''}${prereqClass}${affordClass}" data-type="package" data-id="${pkg.id}" data-target-tier="${slot.targetTier}" data-prereqs-met="${prereqResult.met}" data-can-afford="${canAfford}">
                    <div class="card-header">
                        <span class="card-title">${pkg.name}</span>
                        <span class="card-xp">${xpCost} XP</span>
                    </div>
                    ${pkg.influenceModifier ? `<div class="ascension-influence">Influence: ${pkg.influenceModifier > 0 ? '+' : ''}${pkg.influenceModifier}</div>` : ''}
                    ${prereqResult.text ? `<div class="ascension-prereqs${prereqResult.met ? '' : ' unmet'}">${prereqResult.text}</div>` : ''}
                    ${!canAfford ? `<div class="ascension-unaffordable-note">Not enough XP (${xpCost} XP)</div>` : ''}
                    <div class="card-description">${pkg.description || ''}</div>
                    ${pkg.benefits && pkg.benefits.length > 0 ? `
                        <div class="ascension-benefits">
                            <strong>Benefits:</strong>
                            <ul>${pkg.benefits.map(b => `<li>${b}</li>`).join('')}</ul>
                        </div>
                    ` : ''}
                    ${pkg.keywordsGained && pkg.keywordsGained.length > 0 ? `
                        <div class="ascension-keywords">Keywords Gained: ${pkg.keywordsGained.join(', ')}</div>
                    ` : ''}
                    <div class="source-ref">${DataLoader.formatSourcePage(pkg)}</div>
                </div>
            `;

            html += card;

            // Show choice UI if this package is selected and requires a choice
            if (isSelected && pkg.requiresChoice) {
                html += this.renderPackageChoiceUI(pkg, slot, current);
            }

            // Show keyword choice UI if this package is selected and has keyword choices
            if (isSelected && pkg.keywordChoices) {
                html += this.renderKeywordChoiceUI(pkg, slot, current);
            }
        }

        html += '</div>';
        return html;
    },

    // Render choice UI for a package that requires a choice (e.g., Demanding Patron)
    renderPackageChoiceUI(pkg, slot, current) {
        if (!pkg.choiceOptions) return '';

        const choices = current?.choices || {};
        const currentChoice = choices[pkg.choiceType] || null;

        let html = `<div class="ascension-choice-ui" data-target-tier="${slot.targetTier}" data-choice-type="${pkg.choiceType}">`;
        html += `<div class="ascension-choice-label">Choose a benefit:</div>`;
        html += `<div class="ascension-choice-options">`;

        for (const option of pkg.choiceOptions) {
            const isChecked = currentChoice === option.value;
            html += `
                <label class="ascension-choice-radio">
                    <input type="radio" name="ascension-choice-${slot.targetTier}" value="${option.value}" ${isChecked ? 'checked' : ''}>
                    <span>${option.label}</span>
                </label>
            `;
        }

        html += `</div></div>`;
        return html;
    },

    // Render keyword choice UI for a package with keywordChoices
    renderKeywordChoiceUI(pkg, slot, current) {
        if (!pkg.keywordChoices || pkg.keywordChoices.length === 0) return '';

        const choices = current?.choices || {};
        let html = '';

        for (const kc of pkg.keywordChoices) {
            const currentValue = choices[kc.placeholder] || '';
            const category = DataLoader.getKeywordCategory(kc.category);

            html += `<div class="ascension-keyword-choice" data-target-tier="${slot.targetTier}" data-placeholder="${kc.placeholder}">`;
            html += `<div class="ascension-choice-label">${kc.label}:</div>`;

            if (category && category.options.length > 0) {
                // Dropdown with predefined options + optional custom
                const isCustom = currentValue && !category.options.some(o => o.value === currentValue);
                html += `<select class="keyword-choice-select">`;
                html += `<option value="">-- Select --</option>`;
                for (const opt of category.options) {
                    const selected = currentValue === opt.value ? ' selected' : '';
                    const bonusText = opt.bonus ? ` (${opt.bonus})` : '';
                    html += `<option value="${opt.value}"${selected}>${opt.label}${bonusText}</option>`;
                }
                if (category.allowCustom) {
                    html += `<option value="__custom__"${isCustom ? ' selected' : ''}>${category.customLabel || 'Other'}...</option>`;
                }
                html += `</select>`;
                // Custom text input (shown when "Other" is selected)
                if (category.allowCustom) {
                    const customDisplay = isCustom ? 'block' : 'none';
                    html += `<input type="text" class="keyword-choice-custom" placeholder="Enter keyword (e.g., ORDO SICARIUS)" value="${isCustom ? currentValue : ''}" style="display: ${customDisplay}; margin-top: 8px;">`;
                }
            } else {
                // Pure text input (for [ANY])
                html += `<input type="text" class="keyword-choice-text" placeholder="Enter keyword (e.g., DEATH GUARD)" value="${currentValue}">`;
            }

            // Extra keywords (e.g., Demanding Patron: GM may assign more than one)
            if (kc.allowMultiple) {
                for (const key of this.getExtraKeywordKeys(choices, kc.placeholder)) {
                    html += `
                        <div class="ascension-keyword-extra" data-key="${key}">
                            <input type="text" class="keyword-extra-input" placeholder="Enter keyword (e.g., ROGUE TRADER)" value="${choices[key] || ''}">
                            <button class="btn-remove ascension-keyword-remove">Remove</button>
                        </div>
                    `;
                }
                html += `<button class="btn-small ascension-keyword-add" data-placeholder="${kc.placeholder}">+ Add Keyword</button>`;
            }

            html += `</div>`;
        }

        return html;
    },

    // Extra keyword choice keys for a placeholder ("[ANY]2", "[ANY]3", ...), in numeric order
    getExtraKeywordKeys(choices, placeholder) {
        return Object.keys(choices)
            .filter(k => k.startsWith(placeholder) && /^\d+$/.test(k.slice(placeholder.length)))
            .sort((a, b) => parseInt(a.slice(placeholder.length)) - parseInt(b.slice(placeholder.length)));
    },

    // Render archetype selection UI for a slot
    renderArchetypeSelector(slot, current, character) {
        const allArchetypes = DataLoader.getAllArchetypes();
        const selectedId = current?.archetypeId || null;

        // Get archetypes at the target tier from compatible factions
        const characterKeywords = State.getKeywords();
        const archetype = DataLoader.getArchetype(character.archetype?.id);
        const characterFaction = archetype?.faction || null;

        // Filter: must be at target tier, from enabled sources, matching species
        const charSpeciesId = character.species?.id || null;
        const eligible = allArchetypes.filter(a => {
            if (a.tier !== slot.targetTier) return false;
            if (!State.isSourceEnabled(a.source)) return false;
            // Check species compatibility — always enforce when archetype has species restrictions
            if (Array.isArray(a.species) && a.species.length > 0) {
                if (!charSpeciesId || !a.species.includes(charSpeciesId)) return false;
            }
            return true;
        });

        if (eligible.length === 0) {
            return '<div class="ascension-options"><p class="text-muted">No eligible archetypes found at this tier for your species. Archetype Ascension requires a higher-tier archetype compatible with your species.</p></div>';
        }

        // Group by faction
        const factionGroups = {};
        for (const a of eligible) {
            const faction = a.faction || 'Other';
            if (!factionGroups[faction]) factionGroups[faction] = [];
            factionGroups[faction].push(a);
        }

        // Sort factions, putting character's faction first
        const sortedFactions = Object.keys(factionGroups).sort((a, b) => {
            if (a === characterFaction) return -1;
            if (b === characterFaction) return 1;
            return a.localeCompare(b);
        });

        let html = '<div class="ascension-options">';
        html += '<p class="ascension-note">Archetype Ascension: You gain the archetype\'s abilities, wargear options, and influence modifier, but NOT attribute or skill bonuses. Requires Rank 3+. No XP cost.</p>';

        const rankMet = (character.rank || 1) >= 3;
        if (!rankMet) {
            html += '<p class="ascension-prereqs unmet">Requires Rank 3 or higher</p>';
        }

        for (const faction of sortedFactions) {
            const archetypes = factionGroups[faction];
            const isSameFaction = faction === characterFaction;

            html += `<h4 class="ascension-faction-header${isSameFaction ? ' same-faction' : ''}">${faction}${isSameFaction ? ' (Your Faction)' : ''}</h4>`;

            for (const a of archetypes) {
                const isSelected = a.id === selectedId;

                const abilities = a.abilities || [];

                // Check stat prerequisites (archetype's attributeBonus/skillBonus as prereqs)
                const statPrereqs = this.checkArchetypeAscensionPrereqs(a, character);
                const allMet = rankMet && statPrereqs.met;

                let abilitiesHtml = '';
                if (abilities.length > 0) {
                    abilitiesHtml = `<div class="ascension-abilities-list"><strong>Abilities:</strong>`;
                    for (const ab of abilities) {
                        abilitiesHtml += `<div class="ascension-ability-item"><span class="ascension-ability-name">${ab.name}:</span> ${ab.description || ''}</div>`;
                    }
                    abilitiesHtml += `</div>`;
                }

                const card = `
                    <div class="card ascension-card${isSelected ? ' selected' : ''}${!allMet ? ' ascension-prereq-unmet' : ''}" data-type="archetype" data-id="${a.id}" data-target-tier="${slot.targetTier}" data-prereqs-met="${allMet}">
                        <div class="card-header">
                            <span class="card-title">${a.name}</span>
                            <span class="card-xp">0 XP</span>
                        </div>
                        <div class="ascension-archetype-info">
                            <span>Tier ${a.tier} ${a.faction}</span>
                            ${a.influenceModifier ? ` | <span>Influence: ${a.influenceModifier > 0 ? '+' : ''}${a.influenceModifier}</span>` : ''}
                        </div>
                        ${statPrereqs.text ? `<div class="ascension-prereqs${statPrereqs.met ? '' : ' unmet'}">${statPrereqs.text}</div>` : ''}
                        <div class="card-description">${a.description || ''}</div>
                        ${abilitiesHtml}
                        <div class="source-ref">${DataLoader.formatSourcePage(a)}</div>
                    </div>
                `;

                html += card;
            }
        }

        html += '</div>';
        return html;
    },

    // Check package prerequisites against character
    checkPackagePrereqs(pkg, character) {
        const prereqs = pkg.prerequisites;
        if (!prereqs || Object.keys(prereqs).length === 0) {
            return { met: true, text: '' };
        }

        const parts = [];
        let allMet = true;

        // Attribute prerequisites
        if (prereqs.attributes) {
            for (const [attr, val] of Object.entries(prereqs.attributes)) {
                const current = character.attributes?.[attr] || 1;
                const met = current >= val;
                if (!met) allMet = false;
                const attrName = DerivedStats.formatAttributeName(attr);
                parts.push(`${attrName} ${val}${met ? '' : ` (have ${current})`}`);
            }
        }

        // Skill prerequisites
        if (prereqs.skills) {
            if (prereqs.skillRequirement) {
                // Custom skill requirement text (e.g., "Ballistic Skill 5 or Weapon Skill 5")
                parts.push(prereqs.skillRequirement);
                // Check if at least one skill meets the requirement for OR-style
                if (prereqs.skillRequirement.includes(' or ')) {
                    const anyMet = Object.entries(prereqs.skills).some(([skill, val]) => {
                        const skillKey = skill.replace(/_/g, '').replace(/\s+/g, '');
                        const current = this.getSkillValue(character, skill);
                        return current >= val;
                    });
                    if (!anyMet) allMet = false;
                } else {
                    for (const [skill, val] of Object.entries(prereqs.skills)) {
                        const current = this.getSkillValue(character, skill);
                        if (current < val) allMet = false;
                    }
                }
            } else {
                for (const [skill, val] of Object.entries(prereqs.skills)) {
                    const current = this.getSkillValue(character, skill);
                    const met = current >= val;
                    if (!met) allMet = false;
                    const skillName = this.formatSkillKey(skill);
                    parts.push(`${skillName} ${val}${met ? '' : ` (have ${current})`}`);
                }
            }
        }

        // Keyword prerequisites
        if (prereqs.keywords && prereqs.keywords.length > 0) {
            const charKeywords = State.getKeywords();
            if (prereqs.keywordRequirement) {
                parts.push(prereqs.keywordRequirement);
                // OR logic
                const anyMet = prereqs.keywords.some(k => charKeywords.includes(k));
                if (!anyMet) allMet = false;
            } else {
                // AND logic - need all
                for (const kw of prereqs.keywords) {
                    const met = charKeywords.includes(kw);
                    if (!met) allMet = false;
                    parts.push(`${kw}${met ? '' : ' (missing)'}`);
                }
            }
        }

        // Tier prerequisites
        if (prereqs.tier) {
            const effectiveTier = State.getEffectiveTier();
            const met = effectiveTier >= prereqs.tier;
            if (!met) allMet = false;
            parts.push(`Tier ${prereqs.tier}+${met ? '' : ` (current: ${effectiveTier})`}`);
        }

        // Species prerequisites
        if (prereqs.species && prereqs.species.length > 0) {
            const species = DataLoader.getSpecies(character.species?.id);
            const speciesName = species?.name || '';
            const met = prereqs.species.some(s => s.toLowerCase() === speciesName.toLowerCase());
            if (!met) allMet = false;
            parts.push(`Species: ${prereqs.species.join(' or ')}${met ? '' : ' (not matched)'}`);
        }

        // Story prerequisites
        if (prereqs.story) {
            parts.push(prereqs.story);
        }

        // Other prerequisites
        if (prereqs.other) {
            parts.push(prereqs.other);
        }

        return {
            met: allMet,
            text: parts.length > 0 ? `Prerequisites: ${parts.join(', ')}` : ''
        };
    },

    // Check archetype ascension stat prerequisites
    // The archetype's attributeBonus and skillBonus represent the minimum stats needed
    checkArchetypeAscensionPrereqs(archetype, character) {
        const parts = [];
        let allMet = true;

        // Attribute prerequisites from archetype's attributeBonus
        if (archetype.attributeBonus) {
            for (const [attr, val] of Object.entries(archetype.attributeBonus)) {
                const current = character.attributes?.[attr] || 1;
                const met = current >= val;
                if (!met) allMet = false;
                const attrName = DerivedStats.formatAttributeName(attr);
                parts.push(`<span class="${met ? '' : 'ascension-stat-unmet'}">${attrName} ${val}${met ? '' : ` (have ${current})`}</span>`);
            }
        }

        // Skill prerequisites from archetype's skillBonus
        if (archetype.skillBonus) {
            for (const [skill, val] of Object.entries(archetype.skillBonus)) {
                const current = character.skills?.[skill] || 0;
                const met = current >= val;
                if (!met) allMet = false;
                const skillName = DerivedStats.formatSkillName(skill);
                parts.push(`<span class="${met ? '' : 'ascension-stat-unmet'}">${skillName} ${val}${met ? '' : ` (have ${current})`}</span>`);
            }
        }

        return {
            met: allMet,
            text: parts.length > 0 ? `Stat Prerequisites: ${parts.join(', ')}` : ''
        };
    },

    // Get skill value from character, handling snake_case skill keys from data
    getSkillValue(character, skillKey) {
        // Convert snake_case to camelCase
        const camelKey = skillKey.replace(/_([a-z])/g, (m, c) => c.toUpperCase());
        return character.skills?.[camelKey] || 0;
    },

    // Format snake_case skill key for display
    formatSkillKey(skillKey) {
        return skillKey
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    },

    // Bind click events for cards and radio buttons
    bindEvents(container) {
        // Radio button type selectors
        container.querySelectorAll('input[type="radio"][name^="ascension-type-"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const targetTier = parseInt(e.target.name.replace('ascension-type-', ''));
                const type = e.target.value;

                if (type === 'none') {
                    State.setAscension(targetTier, null);
                } else if (type === 'package') {
                    // Set type but no selection yet
                    State.setAscension(targetTier, { type: 'package', packageId: null, archetypeId: null });
                } else if (type === 'archetype') {
                    State.setAscension(targetTier, { type: 'archetype', packageId: null, archetypeId: null });
                }
                this.render();
            });
        });

        // Card clicks for selecting specific package/archetype
        container.querySelectorAll('.ascension-card').forEach(card => {
            card.addEventListener('click', () => {
                const type = card.dataset.type;
                const id = card.dataset.id;
                const targetTier = parseInt(card.dataset.targetTier);

                if (type === 'package') {
                    // Toggle: if already selected, deselect (keep type as package but clear selection)
                    const current = (State.getCharacter().ascensions || []).find(a => a.targetTier === targetTier);
                    if (current?.packageId === id) {
                        State.setAscension(targetTier, { type: 'package', packageId: null, archetypeId: null });
                    } else {
                        // Block selection if prerequisites aren't met
                        if (card.dataset.prereqsMet === 'false') return;
                        // Block selection if the character can't afford it
                        if (card.dataset.canAfford === 'false') return;
                        State.setAscension(targetTier, { type: 'package', packageId: id, archetypeId: null });
                    }
                } else if (type === 'archetype') {
                    const current = (State.getCharacter().ascensions || []).find(a => a.targetTier === targetTier);
                    if (current?.archetypeId === id) {
                        State.setAscension(targetTier, { type: 'archetype', packageId: null, archetypeId: null });
                    } else {
                        // Block selection if prerequisites aren't met
                        if (card.dataset.prereqsMet === 'false') return;
                        State.setAscension(targetTier, { type: 'archetype', packageId: null, archetypeId: id });
                    }
                }
                this.render();
            });
        });

        // Package choice radio buttons (e.g., Demanding Patron)
        container.querySelectorAll('.ascension-choice-ui input[type="radio"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const choiceUI = e.target.closest('.ascension-choice-ui');
                const targetTier = parseInt(choiceUI.dataset.targetTier);
                const choiceType = choiceUI.dataset.choiceType;
                const value = e.target.value;
                State.setAscensionChoice(targetTier, choiceType, value);
            });
        });

        // Keyword choice dropdowns
        container.querySelectorAll('.keyword-choice-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const choiceDiv = e.target.closest('.ascension-keyword-choice');
                const targetTier = parseInt(choiceDiv.dataset.targetTier);
                const placeholder = choiceDiv.dataset.placeholder;
                const value = e.target.value;
                const customInput = choiceDiv.querySelector('.keyword-choice-custom');

                if (value === '__custom__') {
                    if (customInput) customInput.style.display = 'block';
                    State.setAscensionChoice(targetTier, placeholder, '');
                } else {
                    if (customInput) {
                        customInput.style.display = 'none';
                        customInput.value = '';
                    }
                    State.setAscensionChoice(targetTier, placeholder, value);
                }
            });
        });

        // Keyword choice custom text inputs
        container.querySelectorAll('.keyword-choice-custom, .keyword-choice-text').forEach(input => {
            input.addEventListener('input', (e) => {
                const choiceDiv = e.target.closest('.ascension-keyword-choice');
                const targetTier = parseInt(choiceDiv.dataset.targetTier);
                const placeholder = choiceDiv.dataset.placeholder;
                State.setAscensionChoice(targetTier, placeholder, e.target.value.toUpperCase());
            });
        });

        // Extra keyword text inputs (allowMultiple keyword choices)
        container.querySelectorAll('.ascension-keyword-extra .keyword-extra-input').forEach(input => {
            input.addEventListener('input', (e) => {
                const row = e.target.closest('.ascension-keyword-extra');
                const choiceDiv = row.closest('.ascension-keyword-choice');
                const targetTier = parseInt(choiceDiv.dataset.targetTier);
                State.setAscensionChoice(targetTier, row.dataset.key, e.target.value.toUpperCase());
            });
        });

        // Add extra keyword buttons
        container.querySelectorAll('.ascension-keyword-add').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const choiceDiv = e.target.closest('.ascension-keyword-choice');
                const targetTier = parseInt(choiceDiv.dataset.targetTier);
                const placeholder = btn.dataset.placeholder;
                const current = (State.getCharacter().ascensions || []).find(a => a.targetTier === targetTier);
                const existing = this.getExtraKeywordKeys(current?.choices || {}, placeholder);
                const nextIndex = existing.length > 0
                    ? parseInt(existing[existing.length - 1].slice(placeholder.length)) + 1
                    : 2;
                State.setAscensionChoice(targetTier, `${placeholder}${nextIndex}`, '');
                this.render();
            });
        });

        // Remove extra keyword buttons
        container.querySelectorAll('.ascension-keyword-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const row = e.target.closest('.ascension-keyword-extra');
                const choiceDiv = row.closest('.ascension-keyword-choice');
                const targetTier = parseInt(choiceDiv.dataset.targetTier);
                State.removeAscensionChoice(targetTier, row.dataset.key);
                this.render();
            });
        });
    },

    refresh() {
        this.render();
    }
};
