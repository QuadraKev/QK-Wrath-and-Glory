// Stats Tab - Attributes and Skills management

const StatsTab = {
    init() {
        // Reset stats button
        document.getElementById('btn-reset-stats').addEventListener('click', () => {
            if (confirm('Reset all stats to archetype baseline?')) {
                State.resetStats();
                this.render();
            }
        });

        this.bindXpTip();
        this.render();
    },

    render() {
        this.hideXpTip();
        this.renderAttributes();
        this.renderDerivedStats();
        this.renderSkills();
    },

    // Text for the hover tip on a +/- button: the XP change, or why the button is disabled
    xpTipText({ direction, value, min, max, nextCost, refund, canAfford }) {
        if (direction === '-') {
            return value > min ? `−${refund} XP` : 'Minimum rank';
        }
        if (value >= max || nextCost === null) return 'Maximum rank';
        return canAfford ? `+${nextCost} XP` : `Not enough XP (needs ${nextCost})`;
    },

    // One delegated hover handler per list, because the rows are rebuilt on every render
    bindXpTip() {
        if (this._xpTipBound) return;
        this._xpTipBound = true;
        for (const id of ['attributes-list', 'skills-list']) {
            const list = document.getElementById(id);
            list.addEventListener('mouseover', (e) => {
                const btn = e.target.closest('[data-xp-tip]');
                if (btn) this.showXpTip(btn);
            });
            list.addEventListener('mouseout', (e) => {
                if (e.target.closest('[data-xp-tip]')) this.hideXpTip();
            });
        }
    },

    showXpTip(btn) {
        this.hideXpTip();
        const tip = document.createElement('div');
        tip.className = 'xp-tip';
        tip.textContent = btn.dataset.xpTip;
        document.body.appendChild(tip);

        const rect = btn.getBoundingClientRect();
        const tipRect = tip.getBoundingClientRect();
        const left = rect.left + rect.width / 2 - tipRect.width / 2;
        let top = rect.top - tipRect.height - 6;
        if (top < 4) top = rect.bottom + 6;
        tip.style.left = `${Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4))}px`;
        tip.style.top = `${top}px`;
        this._xpTipEl = tip;
    },

    hideXpTip() {
        if (this._xpTipEl) {
            this._xpTipEl.remove();
            this._xpTipEl = null;
        }
    },

    renderAttributes() {
        const container = document.getElementById('attributes-list');
        const character = State.getCharacter();
        const species = DataLoader.getSpecies(character.species?.id);
        const archetype = DataLoader.getArchetype(character.archetype?.id);

        const attributes = [
            'strength', 'toughness', 'agility', 'initiative',
            'willpower', 'intellect', 'fellowship'
        ];

        container.innerHTML = '';

        for (const attr of attributes) {
            const value = character.attributes[attr] || 1;
            const max = species?.attributeMaximums?.[attr] || 8;

            // Calculate minimum (species base or archetype, whichever is higher)
            let min = 1;
            if (species?.baseAttributes?.[attr]) {
                min = Math.max(min, species.baseAttributes[attr]);
            }
            if (archetype?.attributeBonus?.[attr]) {
                min = Math.max(min, archetype.attributeBonus[attr]);
            }

            const nextCost = XPCalculator.getNextAttributeCost(value);
            const canIncrease = value < max && nextCost !== null && XPCalculator.canAfford(character, nextCost);
            const canDecrease = value > min;

            const refund = canDecrease ? XPCalculator.getAttributeIncreaseCost(value - 1, value) : 0;
            const decTip = this.xpTipText({ direction: '-', value, min, max, nextCost, refund, canAfford: canIncrease });
            const incTip = this.xpTipText({ direction: '+', value, min, max, nextCost, refund, canAfford: canIncrease });

            const row = document.createElement('div');
            row.className = 'stat-row';
            row.innerHTML = `
                <span class="stat-name">${DerivedStats.formatAttributeName(attr)}</span>
                <div class="stat-controls">
                    <button class="stat-btn btn-decrease" data-attr="${attr}" data-xp-tip="${decTip}" ${!canDecrease ? 'disabled' : ''}>-</button>
                    <span class="stat-value">${value}</span>
                    <button class="stat-btn btn-increase" data-attr="${attr}" data-xp-tip="${incTip}" ${!canIncrease ? 'disabled' : ''}>+</button>
                </div>
                <span class="stat-max">${max}</span>
            `;

            // Decrease button
            row.querySelector('.btn-decrease').addEventListener('click', () => {
                if (State.decreaseAttribute(attr)) {
                    this.render();
                }
            });

            // Increase button
            row.querySelector('.btn-increase').addEventListener('click', () => {
                if (State.increaseAttribute(attr)) {
                    this.render();
                }
            });

            container.appendChild(row);
        }
    },

    renderDerivedStats() {
        const container = document.getElementById('derived-stats');
        const character = State.getCharacter();
        const armorBreakdown = DerivedStats.getArmorBreakdown(character);
        const derived = DerivedStats.getAllDerivedStats(character, armorBreakdown);

        const stats = [
            { name: 'Defence', value: derived.defence },
            { name: 'Resilience', value: derived.resilience },
            { name: 'Determination', value: derived.determination },
            { name: 'Max Wounds', value: derived.maxWounds },
            { name: 'Max Shock', value: derived.maxShock },
            { name: 'Speed', value: derived.speed },
            { name: 'Conviction', value: derived.conviction },
            { name: 'Resolve', value: derived.resolve },
            { name: 'Influence', value: derived.influence },
            { name: 'Wealth', value: derived.wealth },
            { name: 'Corruption', value: derived.corruption },
            { name: 'Passive Awareness', value: derived.passiveAwareness }
        ];

        container.innerHTML = '';

        for (const stat of stats) {
            const row = document.createElement('div');
            row.className = 'derived-row';
            row.innerHTML = `
                <span class="derived-name">${stat.name}:</span>
                <span class="derived-value">${stat.value}</span>
            `;
            container.appendChild(row);
        }
    },

    renderSkills() {
        const container = document.getElementById('skills-list');
        const character = State.getCharacter();
        const archetype = DataLoader.getArchetype(character.archetype?.id);

        const skills = [
            'athletics', 'awareness', 'ballisticSkill', 'cunning',
            'deception', 'insight', 'intimidation', 'investigation',
            'leadership', 'medicae', 'persuasion', 'pilot',
            'psychicMastery', 'scholar', 'stealth', 'survival',
            'tech', 'weaponSkill'
        ];

        container.innerHTML = '';

        for (const skill of skills) {
            const value = character.skills[skill] || 0;
            const max = 8;
            const min = archetype?.skillBonus?.[skill] || 0;

            const linkedAttr = DerivedStats.getLinkedAttribute(skill);
            const attrValue = DerivedStats.getEffectiveAttribute(character, linkedAttr);
            const total = value + attrValue;

            const nextCost = XPCalculator.getNextSkillCost(value);
            const canIncrease = value < max && nextCost !== null && XPCalculator.canAfford(character, nextCost);
            const canDecrease = value > min;

            const refund = canDecrease ? XPCalculator.getSkillIncreaseCost(value - 1, value) : 0;
            const decTip = this.xpTipText({ direction: '-', value, min, max, nextCost, refund, canAfford: canIncrease });
            const incTip = this.xpTipText({ direction: '+', value, min, max, nextCost, refund, canAfford: canIncrease });

            const row = document.createElement('div');
            row.className = 'stat-row';
            row.innerHTML = `
                <span class="stat-name">
                    ${DerivedStats.formatSkillName(skill)}
                    <span class="stat-linked">(${DerivedStats.getAttributeAbbrev(linkedAttr)})</span>
                </span>
                <div class="stat-controls">
                    <button class="stat-btn btn-decrease" data-skill="${skill}" data-xp-tip="${decTip}" ${!canDecrease ? 'disabled' : ''}>-</button>
                    <span class="stat-value">${value}</span>
                    <button class="stat-btn btn-increase" data-skill="${skill}" data-xp-tip="${incTip}" ${!canIncrease ? 'disabled' : ''}>+</button>
                </div>
                <span class="stat-total">${total}</span>
            `;

            // Decrease button
            row.querySelector('.btn-decrease').addEventListener('click', () => {
                if (State.decreaseSkill(skill)) {
                    this.render();
                }
            });

            // Increase button
            row.querySelector('.btn-increase').addEventListener('click', () => {
                if (State.increaseSkill(skill)) {
                    this.render();
                }
            });

            container.appendChild(row);
        }
    },

    refresh() {
        this.render();
    }
};
