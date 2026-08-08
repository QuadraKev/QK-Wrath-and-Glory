// Threat statblock card. Ported from bestiary/tabs/threats-tab.js so the creator can show
// follower statblocks. The bestiary keeps its own copy; this is a parallel copy in the same
// spirit as references-tab.js and glossary-tab.js. Keep the two in step when either changes.

const ThreatCard = {
    render(threat) {
        // Build tier/threat table
        const tierThreatTable = this.renderTierThreatTable(threat.tierThreat);

        // Build keywords row
        const keywordsHtml = (threat.keywords || []).map(kw =>
            `<span class="threat-keyword">${kw}</span>`
        ).join('');

        // Build attributes table
        const attributesTable = this.renderAttributesTable(threat.attributes);

        // Build resilience row
        const resilienceHtml = this.renderResilienceRow(threat);

        // Build combat stats table
        const combatStatsTable = this.renderCombatStatsTable(threat);

        // Build skills row
        const skillsHtml = this.renderSkillsRow(threat.skills);

        // Build abilities section
        const abilitiesHtml = this.renderAbilities(threat.abilities);

        // Build bonuses section
        const bonusesHtml = this.renderBonuses(threat.bonuses);

        // Build determination row
        const determinationHtml = this.renderDeterminationRow(threat.determination);

        // Build bottom stats table
        const bottomStatsTable = this.renderBottomStatsTable(threat);

        // Build optional text sections (threat options, mob rules, biomorphs)
        const threatOptionsHtml = this.renderTextSection('Threat Options', threat.threatOptions);
        const mobOptionsHtml = this.renderTextSection('Mob Options', threat.mobOptions);
        const mobAbilitiesHtml = this.renderTextSection('Mob Abilities', threat.mobAbilities);
        const biomorphsHtml = this.renderTextSection('Biomorphs', threat.biomorphs);

        return `
            <div class="threat-card">
                <div class="threat-card-header">
                    <div class="threat-card-header-top">
                        <h2 class="threat-card-title">${threat.name}</h2>
                    </div>
                    ${threat.quote ? `
                        <p class="threat-card-quote">${threat.quote}</p>
                        ${threat.attribution ? `<p class="threat-card-attribution">—${threat.attribution}</p>` : ''}
                    ` : ''}
                    ${threat.source ? `<span class="threat-card-source">${DataLoader.formatSourcePage(threat)}</span>` : ''}
                </div>
                <div class="threat-card-body">
                    ${threat.description ? `
                        <div class="threat-card-description">
                            ${threat.description}
                        </div>
                    ` : ''}

                    <div class="threat-stats-section">
                        ${tierThreatTable}

                        <div class="threat-keywords-row">
                            <span class="threat-keywords-label">KEYWORDS:</span>
                            ${keywordsHtml}
                        </div>

                        ${attributesTable}

                        ${resilienceHtml}

                        ${combatStatsTable}

                        ${skillsHtml}

                        <div class="abilities-section">
                            <div class="abilities-header">Abilities</div>
                            ${abilitiesHtml}
                        </div>

                        ${bonusesHtml}

                        ${determinationHtml}

                        ${bottomStatsTable}

                        ${threatOptionsHtml}

                        ${mobOptionsHtml}

                        ${mobAbilitiesHtml}

                        ${biomorphsHtml}
                    </div>
                </div>
            </div>
        `;
    },

    renderTierThreatTable(tierThreat) {
        if (!tierThreat) return '';

        const tiers = Object.keys(tierThreat).sort((a, b) => parseInt(a) - parseInt(b));

        return `
            <table class="threat-stat-table tier-threat-table">
                <thead>
                    <tr>
                        <th>Tier</th>
                        ${tiers.map(t => `<th>${t}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Threat</td>
                        ${tiers.map(t => `<td class="stat-value">${tierThreat[t]}</td>`).join('')}
                    </tr>
                </tbody>
            </table>
        `;
    },

    renderAttributesTable(attributes) {
        if (!attributes) return '';

        const attrOrder = ['S', 'T', 'A', 'I', 'Wil', 'Int', 'Fel'];
        const attrNames = {
            'S': 'STR', 'T': 'TOU', 'A': 'AGI', 'I': 'INI',
            'Wil': 'WIL', 'Int': 'INT', 'Fel': 'FEL'
        };

        return `
            <table class="threat-stat-table attributes-table">
                <thead>
                    <tr>
                        ${attrOrder.map(attr => `<th>${attrNames[attr]}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        ${attrOrder.map(attr => `<td class="stat-value">${attributes[attr] || '-'}</td>`).join('')}
                    </tr>
                </tbody>
            </table>
        `;
    },

    renderResilienceRow(threat) {
        const resilience = threat.resilience || {};
        const value = resilience.value ?? '-';
        const note = resilience.note || '';

        return `
            <div class="resilience-row">
                <span class="resilience-label">Resilience</span><br>
                <span class="resilience-value">${value}</span>
                ${note ? `<span class="resilience-note" data-glossary-enhance> (${note})</span>` : ''}
            </div>
        `;
    },

    renderCombatStatsTable(threat) {
        return `
            <table class="threat-stat-table combat-stats-table">
                <thead>
                    <tr>
                        <th>Defence</th>
                        <th>Wounds</th>
                        <th>Shock</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="stat-value">${threat.defence || '-'}</td>
                        <td class="stat-value">${threat.wounds || '-'}</td>
                        <td class="stat-value">${threat.shock || '-'}</td>
                    </tr>
                </tbody>
            </table>
        `;
    },

    renderSkillsRow(skills) {
        if (!skills) return '';

        return `
            <div class="skills-row">
                <span class="skills-label">SKILLS:</span>
                <span class="skills-value" data-glossary-enhance>${skills}</span>
            </div>
        `;
    },

    renderAbilities(abilities) {
        if (!abilities || abilities.length === 0) return '<p class="text-muted">No abilities</p>';

        return abilities.map(ability => {
            let statsHtml = '';
            let descHtml = '';

            if (ability.type === 'ACTION' && ability.weaponId) {
                const weapon = DataLoader.getThreatWeapon(ability.weaponId);
                if (weapon) {
                    statsHtml = this.formatWeaponStats(weapon);
                } else if (ability.stats) {
                    statsHtml = ` | ${ability.stats}`;
                }
            } else if (ability.stats) {
                statsHtml = ` | ${ability.stats}`;
            }

            if (ability.description) {
                descHtml = `<div class="ability-description" data-glossary-enhance>${ability.description}</div>`;
            }

            return `
                <div class="ability-item">
                    <div>
                        <span class="ability-type">${ability.type}:</span>
                        <span class="ability-name" data-glossary-enhance>${ability.name}</span>
                        ${statsHtml ? `<span class="ability-stats" data-glossary-enhance>${statsHtml}</span>` : ''}
                    </div>
                    ${descHtml}
                </div>
            `;
        }).join('');
    },

    formatWeaponStats(weapon) {
        const parts = [];
        if (weapon.damage !== undefined) parts.push(`${weapon.damage}`);
        if (weapon.ed !== undefined) parts.push(`+${weapon.ed} ED`);
        if (weapon.ap !== undefined && weapon.ap !== 0) parts.push(`AP ${weapon.ap}`);
        if (weapon.range) parts.push(`Range ${weapon.range}`);
        if (weapon.salvo) parts.push(`Salvo ${weapon.salvo}`);

        let result = parts.join(' / ');
        if (weapon.traits && weapon.traits.length > 0) {
            result += ` [${weapon.traits.join(', ')}]`;
        }
        return result;
    },

    renderBonuses(bonuses) {
        if (!bonuses || bonuses.length === 0) return '';

        const bonusItems = bonuses.map(bonus => `
            <div class="bonus-item">
                <span class="bonus-name" data-glossary-enhance>${bonus.name}:</span>
                <span class="bonus-description" data-glossary-enhance>${bonus.description}</span>
            </div>
        `).join('');

        return `
            <div class="bonuses-section">
                <div class="bonuses-header">Bonuses</div>
                ${bonusItems}
            </div>
        `;
    },

    renderDeterminationRow(determination) {
        if (!determination) return '';

        return `
            <div class="determination-row">
                <span class="determination-label">DETERMINATION:</span>
                <span class="determination-value" data-glossary-enhance>${determination}</span>
            </div>
        `;
    },

    // Optional multi-line text sections (Threat Options, Mob Options, Mob Abilities, Biomorphs)
    renderTextSection(label, text) {
        if (!text) return '';

        return `
            <div class="bonuses-section">
                <div class="bonuses-header">${label}</div>
                <div class="threat-text-section" data-glossary-enhance>${text}</div>
            </div>
        `;
    },

    renderBottomStatsTable(threat) {
        return `
            <table class="threat-stat-table bottom-stats-table">
                <thead>
                    <tr>
                        <th>Conviction</th>
                        <th>Resolve</th>
                        <th>Speed</th>
                        <th>Size</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="stat-value">${threat.conviction ?? '-'}</td>
                        <td class="stat-value">${threat.resolve ?? '-'}</td>
                        <td class="stat-value">${threat.speed || '-'}</td>
                        <td class="stat-value">${threat.size || '-'}</td>
                    </tr>
                </tbody>
            </table>
        `;
    }
};
