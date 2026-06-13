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
                this.termMap.set(value.name.toLowerCase(), { type: 'condition', key, ...value });
                // Also add variations
                this.addTermVariations(value.name, { type: 'condition', key, ...value });
            }
        }

        // Add terms
        if (this.data.terms) {
            for (const [key, value] of Object.entries(this.data.terms)) {
                this.termMap.set(value.name.toLowerCase(), { type: 'term', key, ...value });
                this.addTermVariations(value.name, { type: 'term', key, ...value });
            }
        }

        // Add combat terms
        if (this.data.combatTerms) {
            for (const [key, value] of Object.entries(this.data.combatTerms)) {
                this.termMap.set(value.name.toLowerCase(), { type: 'combatTerm', key, ...value });
                this.addTermVariations(value.name, { type: 'combatTerm', key, ...value });
            }
        }

        // Add weapon traits
        if (this.data.weaponTraits) {
            for (const [key, value] of Object.entries(this.data.weaponTraits)) {
                this.termMap.set(value.name.toLowerCase(), { type: 'weaponTrait', key, ...value });
                this.addTermVariations(value.name, { type: 'weaponTrait', key, ...value });
            }
        }

        // Add armor traits
        if (this.data.armorTraits) {
            for (const [key, value] of Object.entries(this.data.armorTraits)) {
                this.termMap.set(value.name.toLowerCase(), { type: 'armorTrait', key, ...value });
                this.addTermVariations(value.name, { type: 'armorTrait', key, ...value });
            }
        }

        // Add character terms (attributes, skills, derived stats)
        if (this.data.characterTerms) {
            for (const [key, value] of Object.entries(this.data.characterTerms)) {
                this.termMap.set(value.name.toLowerCase(), { type: 'characterTerm', key, ...value });
                this.addTermVariations(value.name, { type: 'characterTerm', key, ...value });
            }
        }

        // Add keywords (these often appear in ALL CAPS)
        // We store them with a special prefix so we can match ALL CAPS text to keywords
        if (this.data.keywords) {
            for (const [key, value] of Object.entries(this.data.keywords)) {
                // Store with lowercase for normal matching
                this.termMap.set(value.name.toLowerCase(), { type: 'keyword', key, ...value });
                // Also store with special uppercase key for ALL CAPS matching
                this.termMap.set('__KEYWORD__' + value.name.toUpperCase(), { type: 'keyword', key, ...value });
                this.addTermVariations(value.name, { type: 'keyword', key, ...value });
            }
        }
    },

    addTermVariations(name, data) {
        const lowerName = name.toLowerCase();

        // Skip variations for terms that would create overly common word matches
        const skipVariations = ['powered', 'spread'];

        if (skipVariations.includes(lowerName)) {
            // Only add parenthetical variations, not suffix-stripping
            if (lowerName.includes('(')) {
                this.termMap.set(lowerName.split('(')[0].trim(), data);
            }
            return;
        }

        // Add common variations
        // "Frenzied" -> "Frenzied", "Frenzy"
        if (lowerName.endsWith('ed') && lowerName.length > 4) {
            const base = lowerName.slice(0, -2);
            // Only add if the base is at least 4 characters to avoid overly short matches
            if (base.length >= 4) {
                this.termMap.set(base, data);
            }
        }
        // "Bleeding" -> "Bleed"
        if (lowerName.endsWith('ing') && lowerName.length > 5) {
            const base = lowerName.slice(0, -3);
            if (base.length >= 4) {
                this.termMap.set(base, data);
            }
        }
        // Handle parenthetical notations like "Rapid Fire (1)"
        if (lowerName.includes('(')) {
            this.termMap.set(lowerName.split('(')[0].trim(), data);
        }
    },

    // Process text and return HTML with clickable terms
    processText(text) {
        if (!this.data || !text) return text;

        // Sort terms by length (longest first) to avoid partial matches
        // Filter out __KEYWORD__ prefixed entries as they're handled specially
        const sortedTerms = Array.from(this.termMap.keys())
            .filter(term => !term.startsWith('__KEYWORD__'))
            .sort((a, b) => b.length - a.length);

        // Create a regex pattern for all terms (case insensitive, word boundaries)
        // We need to escape special regex characters
        const escapedTerms = sortedTerms.map(term =>
            term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        );

        // Process text, replacing terms with clickable spans
        let result = text;
        const replacements = [];

        for (const term of sortedTerms) {
            let termData = this.termMap.get(term);
            // Create regex that matches the term as a whole word (with optional trailing punctuation)
            const regex = new RegExp(`\\b(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\b`, 'gi');

            result = result.replace(regex, (match) => {
                // Check if the matched text is ALL CAPS - if so, prefer keyword entry
                let useTermData = termData;
                if (match === match.toUpperCase() && match.length > 1) {
                    const keywordKey = '__KEYWORD__' + match.toUpperCase();
                    const keywordData = this.termMap.get(keywordKey);
                    if (keywordData) {
                        useTermData = keywordData;
                    }
                }

                // Check if this match is already inside a glossary-term span
                // We'll use a placeholder to avoid double-processing
                const placeholder = `__GLOSSARY_${this.popupIdCounter++}__`;
                replacements.push({
                    placeholder,
                    html: `<span class="glossary-term" data-term-key="${useTermData.key}" data-term-type="${useTermData.type}">${match}</span>`
                });
                return placeholder;
            });
        }

        // Replace placeholders with actual HTML
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

        let termData = null;
        if (type === 'condition' && this.data.conditions[key]) {
            termData = this.data.conditions[key];
        } else if (type === 'term' && this.data.terms[key]) {
            termData = this.data.terms[key];
        } else if (type === 'weaponTrait' && this.data.weaponTraits[key]) {
            termData = this.data.weaponTraits[key];
        } else if (type === 'armorTrait' && this.data.armorTraits[key]) {
            termData = this.data.armorTraits[key];
        } else if (type === 'keyword' && this.data.keywords[key]) {
            termData = this.data.keywords[key];
        } else if (type === 'characterTerm' && this.data.characterTerms[key]) {
            termData = this.data.characterTerms[key];
        } else if (type === 'combatTerm' && this.data.combatTerms[key]) {
            termData = this.data.combatTerms[key];
        }

        if (termData) {
            this.showPopup(termData, termElement, type, key);
        }
    },

    showPopup(termData, anchorElement, type, termKey) {
        const popupId = `glossary-popup-${this.popupIdCounter++}`;

        // Get type label
        let typeLabel = 'Term';
        if (type === 'condition') typeLabel = 'Condition';
        else if (type === 'weaponTrait') typeLabel = 'Weapon Trait';
        else if (type === 'armorTrait') typeLabel = 'Armor Trait';
        else if (type === 'keyword') typeLabel = 'Keyword';
        else if (type === 'characterTerm') typeLabel = 'Character Term';
        else if (type === 'combatTerm') typeLabel = 'Combat Rule';

        // Process description to make nested terms clickable
        const processedDescription = this.processText(termData.description);

        // Format source + page reference
        const sourceRef = typeof DataLoader !== 'undefined' ? DataLoader.formatSourcePage(termData) : '';
        const sourceRefHtml = sourceRef ? `<div class="source-ref">${sourceRef}</div>` : '';

        // Create popup element
        const popup = document.createElement('div');
        popup.className = 'glossary-popup';
        popup.id = popupId;
        popup.dataset.glossaryKey = termKey || '';
        popup.innerHTML = `
            <div class="glossary-popup-header">
                <span class="glossary-popup-type">${typeLabel}</span>
                <span class="glossary-popup-title">${termData.name}</span>
                <button class="glossary-popup-close" title="Close">&times;</button>
            </div>
            <div class="glossary-popup-content">
                ${processedDescription}
                ${sourceRefHtml}
            </div>
        `;

        // Add close button handler
        popup.querySelector('.glossary-popup-close').addEventListener('click', (e) => {
            e.stopPropagation();
            this.closePopup(popupId);
        });

        // Prevent popup clicks from closing it
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

        // Add to document
        document.body.appendChild(popup);

        // Position popup near the anchor element
        this.positionPopup(popup, anchorElement);

        // Attach handlers for nested terms
        this.attachHandlers(popup);

        // Track popup
        this.popupStack.push(popupId);

        // Add stacking offset for nested popups
        if (this.popupStack.length > 1) {
            const offset = (this.popupStack.length - 1) * 20;
            popup.style.transform = `translate(${offset}px, ${offset}px)`;
        }
    },

    positionPopup(popup, anchorElement) {
        const rect = anchorElement.getBoundingClientRect();
        const popupRect = popup.getBoundingClientRect();

        // Default position: below and slightly to the right of the anchor
        let left = rect.left + 10;
        let top = rect.bottom + 5;

        // Adjust if popup would go off screen
        if (left + popupRect.width > window.innerWidth - 20) {
            left = window.innerWidth - popupRect.width - 20;
        }
        if (left < 20) {
            left = 20;
        }

        if (top + popupRect.height > window.innerHeight - 20) {
            // Position above the anchor instead
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

        // Get current HTML and process it
        const originalHTML = element.innerHTML;
        const processedHTML = this.processText(originalHTML);

        // Only update if there were changes
        if (processedHTML !== originalHTML) {
            element.innerHTML = processedHTML;
            this.attachHandlers(element);
        }
    },

    // Process all description/effect fields in a container
    enhanceDescriptions(container) {
        // Find elements that might contain descriptions
        const selectors = [
            '.talent-desc',
            '.power-effect',
            '.ability-description',
            '.archetype-ability',
            '.species-ability',
            '.selected-talent-desc',
            '.wargear-description',
            '[data-glossary-enhance]'
        ];

        for (const selector of selectors) {
            const elements = container.querySelectorAll(selector);
            elements.forEach(el => this.enhanceElement(el));
        }
    }
};

// Add to DataLoader to load glossary
if (typeof DataLoader !== 'undefined') {
    DataLoader.loadGlossary = async function() {
        if (!this.cache['glossary.json']) {
            try {
                const data = await window.api.loadGameData('glossary.json');
                this.cache['glossary.json'] = data;
            } catch (error) {
                console.error('Failed to load glossary:', error);
                return null;
            }
        }
        return this.cache['glossary.json'];
    };
}
