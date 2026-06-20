// Glossary System - Clickable term definitions with nested popups

const Glossary = {
    data: null,
    popupStack: [],
    popupIdCounter: 0,
    _hoverTimer: null,
    _closeTimer: null,
    _pinned: false,

    async init() {
        // Load glossary data
        this.data = await DataLoader.loadGlossary();

        // Build term lookup map for faster searching
        this.termMap = new Map();
        this.buildTermMap();

        // Add global click handler to close popups when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.glossary-popup') && !e.target.closest('.glossary-term')) {
                this.closeAllPopups();
            }
        });

        // Add escape key handler
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeTopPopup();
            }
        });
    },

    buildTermMap() {
        if (!this.data) return;

        // Add conditions
        if (this.data.conditions) {
            for (const [key, value] of Object.entries(this.data.conditions)) {
                this.addTerm(value.name.toLowerCase(), { type: 'condition', key, ...value });
                this.addTermVariations(value.name, { type: 'condition', key, ...value });
            }
        }

        // Add terms
        if (this.data.terms) {
            for (const [key, value] of Object.entries(this.data.terms)) {
                this.addTerm(value.name.toLowerCase(), { type: 'term', key, ...value });
                this.addTermVariations(value.name, { type: 'term', key, ...value });
            }
        }

        // Add combat terms
        if (this.data.combatTerms) {
            for (const [key, value] of Object.entries(this.data.combatTerms)) {
                this.addTerm(value.name.toLowerCase(), { type: 'combatTerm', key, ...value });
                this.addTermVariations(value.name, { type: 'combatTerm', key, ...value });
            }
        }

        // Add weapon traits
        if (this.data.weaponTraits) {
            for (const [key, value] of Object.entries(this.data.weaponTraits)) {
                this.addTerm(value.name.toLowerCase(), { type: 'weaponTrait', key, ...value });
                this.addTermVariations(value.name, { type: 'weaponTrait', key, ...value });
            }
        }

        // Add armor traits
        if (this.data.armorTraits) {
            for (const [key, value] of Object.entries(this.data.armorTraits)) {
                this.addTerm(value.name.toLowerCase(), { type: 'armorTrait', key, ...value });
                this.addTermVariations(value.name, { type: 'armorTrait', key, ...value });
            }
        }

        // Add character terms (attributes, skills, derived stats)
        if (this.data.characterTerms) {
            for (const [key, value] of Object.entries(this.data.characterTerms)) {
                this.addTerm(value.name.toLowerCase(), { type: 'characterTerm', key, ...value });
                this.addTermVariations(value.name, { type: 'characterTerm', key, ...value });
            }
        }

        // Add keywords (these often appear in ALL CAPS)
        if (this.data.keywords) {
            for (const [key, value] of Object.entries(this.data.keywords)) {
                this.addTerm(value.name.toLowerCase(), { type: 'keyword', key, ...value });
                this.addTerm('__KEYWORD__' + value.name.toUpperCase(), { type: 'keyword', key, ...value });
                this.addTermVariations(value.name, { type: 'keyword', key, ...value });
            }
        }
    },

    // Append an entry to the list stored under a map key, preserving discovery
    // order. Each map key holds an ARRAY of entries so that a name shared by
    // multiple categories keeps every matching definition instead of having
    // later categories silently overwrite earlier ones.
    addTerm(mapKey, data) {
        let list = this.termMap.get(mapKey);
        if (!list) {
            list = [];
            this.termMap.set(mapKey, list);
        }
        list.push(data);
    },

    addTermVariations(name, data) {
        const lowerName = name.toLowerCase();

        const skipVariations = ['powered', 'spread'];

        if (skipVariations.includes(lowerName)) {
            if (lowerName.includes('(')) {
                this.addTerm(lowerName.split('(')[0].trim(), data);
            }
            return;
        }

        if (lowerName.endsWith('ed') && lowerName.length > 4) {
            const base = lowerName.slice(0, -2);
            if (base.length >= 4) {
                this.addTerm(base, data);
            }
        }
        if (lowerName.endsWith('ing') && lowerName.length > 5) {
            const base = lowerName.slice(0, -3);
            if (base.length >= 4) {
                this.addTerm(base, data);
            }
        }
        if (lowerName.includes('(')) {
            this.addTerm(lowerName.split('(')[0].trim(), data);
        }
    },

    // Process text and return HTML with clickable terms
    processText(text) {
        if (!this.data || !text) return text;

        // Skip if text already contains glossary markup or broken HTML patterns
        if (text.includes('data-term-type=') ||
            text.includes('class="glossary-term"') ||
            text.includes('data-term-key=')) {
            return text;
        }

        const sortedTerms = Array.from(this.termMap.keys())
            .filter(term => !term.startsWith('__KEYWORD__'))
            .sort((a, b) => b.length - a.length);

        let result = text;
        const replacements = [];

        for (const term of sortedTerms) {
            // Each map key holds an array of entries; use the first as the
            // representative for the span attributes. handleTermClick re-resolves
            // every matching definition by name when the term is clicked.
            let termData = this.termMap.get(term)[0];
            const regex = new RegExp(`\\b(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');

            result = result.replace(regex, (match) => {
                let useTermData = termData;
                if (match === match.toUpperCase() && match.length > 1) {
                    const keywordKey = '__KEYWORD__' + match.toUpperCase();
                    const keywordData = this.termMap.get(keywordKey);
                    if (keywordData) {
                        useTermData = keywordData[0];
                    }
                }

                const placeholder = `__GLOSSARY_${this.popupIdCounter++}__`;
                replacements.push({
                    placeholder,
                    html: `<span class="glossary-term" data-term-key="${useTermData.key}" data-term-type="${useTermData.type}">${match}</span>`
                });
                return placeholder;
            });
        }

        for (const { placeholder, html } of replacements) {
            result = result.replace(placeholder, html);
        }

        return result;
    },

    // Attach click and hover handlers to glossary terms in a container
    attachHandlers(container) {
        const terms = container.querySelectorAll('.glossary-term');
        terms.forEach(term => {
            // Click handler — pins the popup so it stays open
            term.addEventListener('click', (e) => {
                clearTimeout(this._hoverTimer);
                clearTimeout(this._closeTimer);
                // If hover popup is open, pin it instead of opening a new one
                if (this.popupStack.length > 0 && !this._pinned) {
                    this._pinned = true;
                    return;
                }
                this._pinned = true;
                this.handleTermClick(e);
            });

            // Hover handlers for desktop
            term.addEventListener('mouseenter', (e) => {
                clearTimeout(this._closeTimer);
                this._hoverTimer = setTimeout(() => {
                    // Only show hover popup if no popups are pinned or open
                    if (this.popupStack.length === 0 && !this._pinned) {
                        this.handleTermClick(e);
                    }
                }, 300);
            });

            term.addEventListener('mouseleave', () => {
                clearTimeout(this._hoverTimer);
                // Only auto-close if popup is not pinned
                if (!this._pinned) {
                    this._closeTimer = setTimeout(() => {
                        this.closeAllPopups();
                    }, 200);
                }
            });
        });
    },

    handleTermClick(e) {
        e.stopPropagation();

        const termElement = e.target;
        const key = termElement.dataset.termKey;
        const type = termElement.dataset.termType;

        // Prevent duplicate popup for the same term (iOS fires both mouseenter and click)
        const alreadyOpen = this.popupStack.some(popupId => {
            const p = document.getElementById(popupId);
            return p && p.dataset.glossaryKey === key;
        });
        if (alreadyOpen) return;

        // Resolve the clicked entry, then gather EVERY definition that shares
        // its name so the popup can stack them (e.g. a keyword + the species or
        // power of the same name). For a unique name this returns one entry.
        const clickedEntry = this.getEntry(type, key);
        if (!clickedEntry) return;

        const definitions = this.gatherDefinitionsByName(clickedEntry.name);
        if (definitions.length === 0) return;

        this.showPopup(definitions, termElement, key);
    },

    // Look up a single raw entry by its span type + data key.
    getEntry(type, key) {
        const typeToCategory = {
            condition: 'conditions',
            term: 'terms',
            combatTerm: 'combatTerms',
            weaponTrait: 'weaponTraits',
            armorTrait: 'armorTraits',
            characterTerm: 'characterTerms',
            psychicPower: 'psychicPowers',
            keyword: 'keywords'
        };
        const category = typeToCategory[type];
        const block = category && this.data[category];
        return block && block[key] ? block[key] : null;
    },

    // Human-readable label for a span/category type. Single source of truth for
    // both the single-definition header and the multi-definition subheaders.
    getTypeLabel(type) {
        if (type === 'condition') return 'Condition';
        if (type === 'weaponTrait') return 'Weapon Trait';
        if (type === 'armorTrait') return 'Armor Trait';
        if (type === 'keyword') return 'Keyword';
        if (type === 'characterTerm') return 'Character Term';
        if (type === 'combatTerm') return 'Combat Rule';
        if (type === 'psychicPower') return 'Psychic Power';
        if (type === 'weapon') return 'Weapon';
        if (type === 'armor') return 'Armor';
        if (type === 'talent') return 'Talent';
        if (type === 'equipment') return 'Equipment';
        if (type === 'archetype') return 'Archetype';
        if (type === 'species') return 'Species';
        return 'Term';
    },

    // Collect all entries whose name matches (case-insensitive) the given name.
    // Scans the glossary's own categories first, then the Compendium data files
    // (weapons/armor/talents/equipment/archetypes/species) via DataLoader, then
    // keywords last so a mixed-case definition wins the popup title over an
    // UPPERCASE keyword. psychicPowers and the Compendium categories are
    // deliberately NOT in buildTermMap (names like "Doom"/"Knife"/"Human"/"Fear"
    // would turn common words into false links); they only surface here when a
    // clicked glossary term shares their name (e.g. tapping the AELDARI keyword
    // also shows the Aeldari species, or the Telepathy keyword the full power).
    gatherDefinitionsByName(name) {
        const target = name.toLowerCase();
        const results = [];
        // type/key are set AFTER the spread so they win over any same-named
        // field on the source entry (e.g. a weapon/armor entry's own `type`).
        const pushMatch = (value, type, key) => {
            if (value && value.name && value.name.toLowerCase() === target) {
                results.push({ ...value, type, key });
            }
        };

        // 1. Glossary categories (keyed objects in this.data), keywords excepted.
        const glossaryCats = [
            ['conditions', 'condition'],
            ['terms', 'term'],
            ['combatTerms', 'combatTerm'],
            ['weaponTraits', 'weaponTrait'],
            ['armorTraits', 'armorTrait'],
            ['characterTerms', 'characterTerm'],
            ['psychicPowers', 'psychicPower']
        ];
        for (const [category, type] of glossaryCats) {
            const block = this.data[category];
            if (!block) continue;
            for (const [key, value] of Object.entries(block)) {
                pushMatch(value, type, key);
            }
        }

        // 2. Compendium data files (arrays via DataLoader). Lookup-only.
        if (typeof DataLoader !== 'undefined') {
            const compendium = [
                ['weapon', DataLoader.getAllWeapons],
                ['armor', DataLoader.getAllArmor],
                ['talent', DataLoader.getAllTalents],
                ['equipment', DataLoader.getAllEquipment],
                ['archetype', DataLoader.getAllArchetypes],
                ['species', DataLoader.getAllSpecies]
            ];
            for (const [type, getter] of compendium) {
                if (typeof getter !== 'function') continue;
                const list = getter.call(DataLoader) || [];
                for (const value of list) {
                    pushMatch(value, type, value && value.id);
                }
            }
        }

        // 3. Keywords last so an earlier mixed-case match wins the popup title.
        if (this.data.keywords) {
            for (const [key, value] of Object.entries(this.data.keywords)) {
                pushMatch(value, 'keyword', key);
            }
        }

        return results;
    },

    showPopup(definitions, anchorElement, termKey) {
        const popupId = `glossary-popup-${this.popupIdCounter++}`;

        // Title is shown once, from the first definition.
        const title = definitions[0].name;
        const multiple = definitions.length > 1;

        // Build the body: one section per definition. With a single definition
        // this collapses to the prior markup (no subheader, no divider).
        const sections = definitions.map((def, index) => {
            // Compendium entries (talents) use `effect`, not `description`.
            const processedDescription = this.processText(def.description || def.effect || '');

            const sourceRef = typeof DataLoader !== 'undefined' ? DataLoader.formatSourcePage(def) : '';
            const sourceRefHtml = sourceRef ? `<div class="source-ref">${sourceRef}</div>` : '';

            const subheaderHtml = multiple
                ? `<div class="glossary-popup-subheader"><span class="glossary-popup-type">${this.getTypeLabel(def.type)}</span></div>`
                : '';

            const dividerHtml = index > 0 ? '<hr>' : '';

            return `${dividerHtml}${subheaderHtml}${processedDescription}${sourceRefHtml}`;
        }).join('');

        const headerTypeHtml = multiple
            ? ''
            : `<span class="glossary-popup-type">${this.getTypeLabel(definitions[0].type)}</span>`;

        const popup = document.createElement('div');
        popup.className = 'glossary-popup';
        popup.id = popupId;
        popup.dataset.glossaryKey = termKey || '';
        popup.innerHTML = `
            <div class="glossary-popup-header">
                ${headerTypeHtml}
                <span class="glossary-popup-title">${title}</span>
                <button class="glossary-popup-close" title="Close">&times;</button>
            </div>
            <div class="glossary-popup-content">
                ${sections}
            </div>
        `;

        popup.querySelector('.glossary-popup-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closePopup(popupId);
        });

        popup.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Keep popup open while hovered
        popup.addEventListener('mouseenter', () => {
            clearTimeout(this._closeTimer);
        });
        popup.addEventListener('mouseleave', () => {
            // Only auto-close if popup is not pinned
            if (!this._pinned) {
                this._closeTimer = setTimeout(() => {
                    this.closeAllPopups();
                }, 200);
            }
        });

        document.body.appendChild(popup);

        this.positionPopup(popup, anchorElement);

        this.attachHandlers(popup);

        this.popupStack.push(popupId);

        if (this.popupStack.length > 1) {
            const offset = (this.popupStack.length - 1) * 20;
            popup.style.transform = `translate(${offset}px, ${offset}px)`;
        }
    },

    positionPopup(popup, anchorElement) {
        const rect = anchorElement.getBoundingClientRect();
        const popupRect = popup.getBoundingClientRect();

        let left = rect.left + 10;
        let top = rect.bottom + 5;

        if (left + popupRect.width > window.innerWidth - 20) {
            left = window.innerWidth - popupRect.width - 20;
        }
        if (left < 20) {
            left = 20;
        }

        if (top + popupRect.height > window.innerHeight - 20) {
            top = rect.top - popupRect.height - 5;
            if (top < 20) {
                top = 20;
            }
        }

        popup.style.left = `${left}px`;
        popup.style.top = `${top}px`;
    },

    closePopup(popupId) {
        const popup = document.getElementById(popupId);
        if (popup) {
            popup.remove();
            this.popupStack = this.popupStack.filter(id => id !== popupId);
        }
        if (this.popupStack.length === 0) this._pinned = false;
    },

    closeTopPopup() {
        if (this.popupStack.length > 0) {
            const topPopupId = this.popupStack.pop();
            const popup = document.getElementById(topPopupId);
            if (popup) {
                popup.remove();
            }
        }
        if (this.popupStack.length === 0) this._pinned = false;
    },

    closeAllPopups() {
        for (const popupId of this.popupStack) {
            const popup = document.getElementById(popupId);
            if (popup) {
                popup.remove();
            }
        }
        this.popupStack = [];
        this._pinned = false;
    },

    // Utility method to process and attach handlers to an element
    enhanceElement(element) {
        if (!element) return;

        // Skip if already enhanced (prevent double-processing)
        if (element.dataset.glossaryEnhanced === 'true') {
            return;
        }

        const originalHTML = element.innerHTML;

        // Skip if content already contains glossary spans (already processed)
        if (originalHTML.includes('class="glossary-term"') || originalHTML.includes('data-term-type=')) {
            element.dataset.glossaryEnhanced = 'true';
            this.attachHandlers(element);
            return;
        }

        const processedHTML = this.processText(originalHTML);

        if (processedHTML !== originalHTML) {
            element.innerHTML = processedHTML;
            this.attachHandlers(element);
        }

        // Mark as enhanced to prevent re-processing
        element.dataset.glossaryEnhanced = 'true';
    },

    // Process all description/effect fields in a container
    enhanceDescriptions(container) {
        const selectors = [
            '.ability-description',
            '[data-glossary-enhance]'
        ];

        for (const selector of selectors) {
            const elements = container.querySelectorAll(selector);
            elements.forEach(el => this.enhanceElement(el));
        }
    }
};
