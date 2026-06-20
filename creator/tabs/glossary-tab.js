// Glossary Tab - Browse and search game terms

const GlossaryTab = {
    searchQuery: '',
    currentCategory: 'all',
    allEntries: [],
    expandedEntries: new Set(),
    _searchTimer: null,
    _entryMap: new Map(),
    _orderedEntries: [],
    _renderedCount: 0,
    _scrollHandler: null,
    _isGrouped: false,

    init() {
        // Search input with 200ms debounce
        document.getElementById('glossary-search').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => this.renderEntries(), 200);
        });

        // Category filter buttons
        document.querySelectorAll('.glossary-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.glossary-filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentCategory = btn.dataset.category;
                this.renderEntries();
            });
        });

        // Event delegation on container (set up once)
        const container = document.getElementById('glossary-content');
        container.addEventListener('click', (e) => {
            const copyBtn = e.target.closest('.btn-copy');
            if (copyBtn) {
                e.stopPropagation();
                const name = copyBtn.dataset.copyName;
                const desc = copyBtn.dataset.copyDesc;
                navigator.clipboard.writeText(`${name}: ${desc}`).then(() => {
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
                });
                return;
            }
            const header = e.target.closest('.glossary-entry-header');
            if (header) {
                const entry = header.closest('.glossary-entry');
                this._toggleEntry(entry.dataset.entryId, entry);
            }
        });

        // Load entries from glossary data
        this.loadEntries();
    },

    // Load all entries from the Glossary module
    loadEntries() {
        this.allEntries = [];

        if (!Glossary.data) {
            console.warn('Glossary data not loaded');
            return;
        }

        // Category display names and order
        const categories = [
            { key: 'characterTerms', name: 'Character Term', pluralName: 'Character Terms' },
            { key: 'conditions', name: 'Condition', pluralName: 'Conditions' },
            { key: 'combatTerms', name: 'Combat Rule', pluralName: 'Combat Rules and Terms' },
            { key: 'terms', name: 'Game Rule', pluralName: 'Game Rules and Terms' },
            { key: 'weaponTraits', name: 'Weapon Trait', pluralName: 'Weapon Traits' },
            { key: 'armorTraits', name: 'Armor Trait', pluralName: 'Armor Traits' },
            { key: 'keywords', name: 'Keyword', pluralName: 'Keywords' }
        ];

        for (const cat of categories) {
            const categoryData = Glossary.data[cat.key];
            if (categoryData) {
                for (const [id, entry] of Object.entries(categoryData)) {
                    this.allEntries.push({
                        id: id,
                        name: entry.name,
                        description: entry.description,
                        source: entry.source || null,
                        page: entry.page != null ? entry.page : null,
                        category: cat.key,
                        categoryName: cat.name,
                        categoryPluralName: cat.pluralName
                    });
                }
            }
        }

        // Sort alphabetically
        this.allEntries.sort((a, b) => a.name.localeCompare(b.name));

        this.renderEntries();
    },

    // Filter entries based on search, category, and source
    getFilteredEntries() {
        return this.allEntries.filter(entry => {
            // Category filter
            if (this.currentCategory !== 'all' && entry.category !== this.currentCategory) {
                return false;
            }

            // Source filter — entries with a source must pass; entries without source always pass
            if (entry.source && !State.isSourceEnabled(entry.source)) {
                return false;
            }

            // Search filter
            if (this.searchQuery) {
                const searchable = `${entry.name} ${entry.description}`.toLowerCase();
                if (!searchable.includes(this.searchQuery)) {
                    return false;
                }
            }

            return true;
        });
    },

    // Render the glossary entries
    renderEntries() {
        const container = document.getElementById('glossary-content');
        const entries = this.getFilteredEntries();

        if (entries.length === 0) {
            container.innerHTML = `
                <div class="glossary-empty">
                    <p>No entries found${this.searchQuery ? ` for "${this.escapeHtml(this.searchQuery)}"` : ''}.</p>
                </div>
            `;
            this._cleanupScroll();
            return;
        }

        // Build entry map and ordered entries
        this._entryMap = new Map();
        this._orderedEntries = [];
        this._isGrouped = this.currentCategory === 'all';

        if (this._isGrouped) {
            const grouped = this.groupByCategory(entries);
            // Render group skeleton (headers only)
            container.innerHTML = grouped.map(group => `
                <div class="glossary-group" data-group-category="${group.category}">
                    <h3 class="glossary-group-title">${group.categoryPluralName}</h3>
                    <div class="glossary-entries"></div>
                </div>
            `).join('');

            for (const group of grouped) {
                for (const entry of group.entries) {
                    this._entryMap.set(entry.id, entry);
                    this._orderedEntries.push(entry);
                }
            }
        } else {
            container.innerHTML = '<div class="glossary-entries"></div>';
            for (const entry of entries) {
                this._entryMap.set(entry.id, entry);
                this._orderedEntries.push(entry);
            }
        }

        // Progressive rendering
        this._renderedCount = 0;
        this._renderNextBatch();
        this._setupScroll();
    },

    // Group entries by category
    groupByCategory(entries) {
        const groups = new Map();
        const categoryOrder = ['characterTerms', 'conditions', 'combatTerms', 'terms', 'weaponTraits', 'armorTraits', 'keywords'];

        for (const entry of entries) {
            if (!groups.has(entry.category)) {
                groups.set(entry.category, {
                    category: entry.category,
                    categoryPluralName: entry.categoryPluralName,
                    entries: []
                });
            }
            groups.get(entry.category).entries.push(entry);
        }

        // Sort groups by predefined order
        return categoryOrder
            .filter(cat => groups.has(cat))
            .map(cat => groups.get(cat));
    },

    _renderNextBatch() {
        if (this._renderedCount >= this._orderedEntries.length) return;

        const batch = this._orderedEntries.slice(this._renderedCount, this._renderedCount + 100);
        if (batch.length === 0) return;

        if (this._isGrouped) {
            const byCategory = new Map();
            for (const entry of batch) {
                if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
                byCategory.get(entry.category).push(entry);
            }
            for (const [category, catEntries] of byCategory) {
                const groupEl = document.querySelector(`.glossary-group[data-group-category="${category}"] .glossary-entries`);
                if (groupEl) {
                    groupEl.insertAdjacentHTML('beforeend', catEntries.map(e => this.renderEntry(e)).join(''));
                }
            }
        } else {
            const entriesEl = document.querySelector('#glossary-content .glossary-entries');
            if (entriesEl) {
                entriesEl.insertAdjacentHTML('beforeend', batch.map(e => this.renderEntry(e)).join(''));
            }
        }

        // Re-rendered expanded entries are inlined raw (no click fired), so
        // enhance them now to keep their glossary links after a re-render (#8).
        for (const entry of batch) {
            if (this.expandedEntries.has(entry.id)) {
                const body = document.querySelector(`#glossary-content .glossary-entry[data-entry-id="${CSS.escape(entry.id)}"] .glossary-entry-body`);
                this._enhanceBody(body);
            }
        }

        this._renderedCount += batch.length;
    },

    _renderAllBatches() {
        while (this._renderedCount < this._orderedEntries.length) {
            this._renderNextBatch();
        }
    },

    _setupScroll() {
        this._cleanupScroll();
        const scrollEl = document.getElementById('tab-glossary');
        if (!scrollEl) return;
        this._scrollHandler = () => {
            if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 500) {
                this._renderNextBatch();
            }
        };
        scrollEl.addEventListener('scroll', this._scrollHandler, { passive: true });
    },

    _cleanupScroll() {
        if (this._scrollHandler) {
            const scrollEl = document.getElementById('tab-glossary');
            if (scrollEl) scrollEl.removeEventListener('scroll', this._scrollHandler);
            this._scrollHandler = null;
        }
    },

    // Render a single entry
    renderEntry(entry) {
        const isExpanded = this.expandedEntries.has(entry.id);
        return `
            <div class="glossary-entry ${isExpanded ? 'expanded' : ''}" data-entry-id="${entry.id}">
                <div class="glossary-entry-header">
                    <span class="glossary-entry-expand">&#9654;</span>
                    <span class="glossary-entry-name">${entry.name}</span>
                    <span class="glossary-entry-category">${entry.categoryName}</span>
                </div>
                <div class="glossary-entry-body ${isExpanded ? '' : 'hidden'}"${isExpanded ? '' : ' data-deferred'}>
                    ${isExpanded ? this._renderBodyContent(entry) : ''}
                </div>
            </div>
        `;
    },

    _renderBodyContent(entry) {
        const sourceRef = DataLoader.formatSourcePage(entry);
        const sourceRefHtml = sourceRef ? `<div class="source-ref">${sourceRef}</div>` : '';
        return `
                    <div class="glossary-entry-description">${entry.description}</div>
                    ${sourceRefHtml}
                    <button class="btn-copy" data-copy-name="${this.escapeAttr(entry.name)}" data-copy-desc="${this.escapeAttr(this.stripHtml(entry.description))}">Copy</button>
        `;
    },

    _toggleEntry(entryId, entryElement) {
        const body = entryElement.querySelector('.glossary-entry-body');

        if (this.expandedEntries.has(entryId)) {
            this.expandedEntries.delete(entryId);
            entryElement.classList.remove('expanded');
            body.classList.add('hidden');

            // Clear URL hash
            history.replaceState(null, '', location.pathname + location.search);
        } else {
            this.expandedEntries.add(entryId);
            entryElement.classList.add('expanded');
            body.classList.remove('hidden');

            // Materialize deferred body content
            if (body.hasAttribute('data-deferred')) {
                const data = this._entryMap.get(entryId);
                if (data) body.innerHTML = this._renderBodyContent(data);
                body.removeAttribute('data-deferred');
            }

            // Enhance glossary terms on demand
            this._enhanceBody(body);

            // Update URL hash
            history.replaceState(null, '', '#glossary/' + entryId);
        }
    },

    // Wrap the description in clickable glossary terms. Idempotent via the
    // description's data-enhanced flag. Called on expand (click) and after a
    // re-render that inlines an already-expanded body (filter/search change),
    // which would otherwise leave the text raw with no clickable links (#8).
    _enhanceBody(body) {
        if (!body) return;
        const desc = body.querySelector('.glossary-entry-description');
        if (desc && !desc.dataset.enhanced) {
            if (typeof Glossary !== 'undefined' && Glossary.enhanceElement) {
                Glossary.enhanceElement(desc);
            }
            desc.dataset.enhanced = 'true';
        }
    },

    // Navigate to a specific entry by ID (for deep linking)
    navigateToEntry(entryId) {
        // Reset filters so the entry is visible
        this.currentCategory = 'all';
        this.searchQuery = '';
        document.getElementById('glossary-search').value = '';
        document.querySelectorAll('.glossary-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === 'all');
        });

        // Re-render and force all batches so the entry is in the DOM
        this.renderEntries();
        this._renderAllBatches();

        // Find the target entry element
        const entryEl = document.querySelector(`.glossary-entry[data-entry-id="${entryId}"]`);
        if (!entryEl) return;

        // Expand it
        this.expandedEntries.add(entryId);
        entryEl.classList.add('expanded');
        const body = entryEl.querySelector('.glossary-entry-body');
        body.classList.remove('hidden');

        // Materialize deferred body
        if (body.hasAttribute('data-deferred')) {
            const data = this._entryMap.get(entryId);
            if (data) body.innerHTML = this._renderBodyContent(data);
            body.removeAttribute('data-deferred');
        }

        // Enhance glossary terms
        const desc = body.querySelector('.glossary-entry-description');
        if (desc && !desc.dataset.enhanced) {
            if (typeof Glossary !== 'undefined' && Glossary.enhanceElement) {
                Glossary.enhanceElement(desc);
            }
            desc.dataset.enhanced = 'true';
        }

        // Scroll into view
        entryEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Highlight briefly
        entryEl.classList.add('glossary-entry-highlight');
        setTimeout(() => entryEl.classList.remove('glossary-entry-highlight'), 2000);
    },

    // Helper: Strip HTML tags from text
    stripHtml(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    },

    // Helper: Escape text for use in HTML attributes
    escapeAttr(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    // Refresh the tab
    refresh() {
        // Reload entries in case glossary data changed
        if (this.allEntries.length === 0) {
            this.loadEntries();
        } else {
            this.renderEntries();
        }
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};
