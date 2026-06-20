// Glossary Tab - Displays searchable glossary of game terms

const GlossaryTab = {
    currentCategory: 'all',
    searchText: '',
    expandedEntries: new Set(),
    _searchTimer: null,
    _entryMap: new Map(),
    _orderedEntries: [],
    _renderedCount: 0,
    _scrollHandler: null,

    init() {
        // Initialize search (300ms debounce)
        const searchInput = document.getElementById('glossary-search');
        searchInput.addEventListener('input', (e) => {
            this.searchText = e.target.value.toLowerCase();
            clearTimeout(this._searchTimer);
            this._searchTimer = setTimeout(() => this.renderGlossary(), 300);
        });

        // Initialize category filters
        document.querySelectorAll('.glossary-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setCategory(btn.dataset.category);
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
                this.toggleEntry(entry.dataset.entryId, entry);
            }
        });

        // Render initial glossary
        this.renderGlossary();
    },

    refresh() {
        this.renderGlossary();
    },

    setCategory(category) {
        this.currentCategory = category;

        // Update button states
        document.querySelectorAll('.glossary-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });

        this.renderGlossary();
    },

    getCategoryLabel(category) {
        const labels = {
            'conditions': 'Conditions',
            'terms': 'Game Rules',
            'combatTerms': 'Combat Rules',
            'weaponTraits': 'Weapon Traits',
            'armorTraits': 'Armor Traits',
            'keywords': 'Keywords',
            'characterTerms': 'Character Terms'
        };
        return labels[category] || category;
    },

    renderGlossary() {
        const glossaryData = DataLoader.getGlossary();
        const container = document.getElementById('glossary-content');

        if (!glossaryData) {
            container.innerHTML = '<div class="glossary-empty">Loading glossary...</div>';
            return;
        }

        // Get categories to display
        const categories = this.currentCategory === 'all'
            ? ['characterTerms', 'conditions', 'combatTerms', 'terms', 'weaponTraits', 'armorTraits', 'keywords']
            : [this.currentCategory];

        // Build entry map and ordered entries
        this._entryMap = new Map();
        this._orderedEntries = [];
        const groups = [];

        for (const category of categories) {
            const categoryData = glossaryData[category];
            if (!categoryData) continue;

            // Get and filter entries
            let entries = Object.entries(categoryData).map(([key, value]) => ({
                key,
                ...value,
                category
            }));

            // Apply source filter
            entries = entries.filter(entry => {
                if (!entry.source) return true;
                return SettingsTab.isSourceEnabled(entry.source);
            });

            // Apply search filter
            if (this.searchText) {
                entries = entries.filter(entry =>
                    entry.name.toLowerCase().includes(this.searchText) ||
                    entry.description.toLowerCase().includes(this.searchText)
                );
            }

            if (entries.length === 0) continue;

            // Sort alphabetically
            entries.sort((a, b) => a.name.localeCompare(b.name));

            groups.push({ category, label: this.getCategoryLabel(category), count: entries.length });

            for (const entry of entries) {
                const entryId = `${entry.category}-${entry.key}`;
                this._entryMap.set(entryId, entry);
                this._orderedEntries.push(entry);
            }
        }

        if (this._orderedEntries.length === 0) {
            container.innerHTML = '<div class="glossary-empty">No entries found</div>';
            this._cleanupScroll();
            return;
        }

        // Render group skeleton (headers only, entries populated progressively)
        container.innerHTML = groups.map(g => `
            <div class="glossary-group" data-group-category="${g.category}">
                <h3 class="glossary-group-title">${g.label}</h3>
                <div class="glossary-entries"></div>
            </div>
        `).join('');

        // Progressive rendering
        this._renderedCount = 0;
        this._renderNextBatch();
        this._setupScroll();
    },

    _renderNextBatch() {
        if (this._renderedCount >= this._orderedEntries.length) return;

        const batch = this._orderedEntries.slice(this._renderedCount, this._renderedCount + 100);
        if (batch.length === 0) return;

        // Group batch entries by category for insertion into correct container
        const byCategory = new Map();
        for (const entry of batch) {
            if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
            byCategory.get(entry.category).push(entry);
        }

        for (const [category, entries] of byCategory) {
            const groupEl = document.querySelector(`.glossary-group[data-group-category="${category}"] .glossary-entries`);
            if (groupEl) {
                groupEl.insertAdjacentHTML('beforeend', entries.map(e => this.renderEntry(e)).join(''));
            }
        }

        // Re-rendered expanded entries are inlined raw (no click fired), so
        // enhance them now to keep their glossary links after a re-render (#8).
        for (const entry of batch) {
            const entryId = `${entry.category}-${entry.key}`;
            if (this.expandedEntries.has(entryId)) {
                const body = document.querySelector(`#glossary-content .glossary-entry[data-entry-id="${CSS.escape(entryId)}"] .glossary-entry-body`);
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

    renderEntry(entry) {
        const entryId = `${entry.category}-${entry.key}`;
        const isExpanded = this.expandedEntries.has(entryId);

        return `
            <div class="glossary-entry ${isExpanded ? 'expanded' : ''}" data-entry-id="${entryId}">
                <div class="glossary-entry-header">
                    <span class="glossary-entry-expand">▶</span>
                    <span class="glossary-entry-name">${entry.name}</span>
                    <span class="glossary-entry-category">${this.getCategoryLabel(entry.category)}</span>
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

    toggleEntry(entryId, entryElement) {
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

            // Update URL hash
            history.replaceState(null, '', '#glossary/' + entryId);

            // Enhance glossary terms on demand
            this._enhanceBody(body);
        }
    },

    // Wrap the description in clickable glossary terms. Idempotent via the
    // description's data-enhanced flag. Called on expand (click) and after a
    // re-render that inlines an already-expanded body (filter/search change),
    // which would otherwise leave the text raw with no clickable links (#8).
    _enhanceBody(body) {
        if (!body) return;
        const description = body.querySelector('.glossary-entry-description');
        if (description && !description.dataset.enhanced) {
            if (typeof Glossary !== 'undefined' && Glossary.enhanceElement) {
                Glossary.enhanceElement(description);
            }
            description.dataset.enhanced = 'true';
        }
    },

    // Navigate to a specific entry by ID (for deep linking)
    navigateToEntry(entryId) {
        // Reset filters so the entry is visible
        this.currentCategory = 'all';
        this.searchText = '';
        document.getElementById('glossary-search').value = '';
        document.querySelectorAll('.glossary-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === 'all');
        });

        // Re-render and force all batches so the entry is in the DOM
        this.renderGlossary();
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
        const description = body.querySelector('.glossary-entry-description');
        if (description && !description.dataset.enhanced) {
            Glossary.enhanceElement(description);
            description.dataset.enhanced = 'true';
        }

        // Scroll into view
        entryEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Highlight briefly
        entryEl.classList.add('glossary-entry-highlight');
        setTimeout(() => entryEl.classList.remove('glossary-entry-highlight'), 2000);
    },

    stripHtml(html) {
        const div = document.createElement('div');
        div.innerHTML = html;
        return div.textContent || div.innerText || '';
    },

    escapeAttr(text) {
        if (!text) return '';
        return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};
