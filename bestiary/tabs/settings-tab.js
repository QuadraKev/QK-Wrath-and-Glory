// Settings Tab - Source book filtering

const SettingsTab = {
    excludedSources: new Set(),
    _STORAGE_KEY: 'wng-bestiary-excluded-sources',

    init() {
        // Restore from localStorage
        this._restoreFromStorage();

        const container = document.getElementById('source-filter-buttons');
        if (!container) return;

        this._populateButtons(container);
    },

    _populateButtons(container) {
        const sources = DataLoader.getAllSources();

        container.innerHTML = `<button class="filter-btn ${this.excludedSources.size === 0 ? 'active' : ''}" data-source="all">All</button>` +
            sources.map(source =>
                `<button class="filter-btn ${!this.excludedSources.has(source) ? 'active' : ''}" data-source="${source}">${source}</button>`
            ).join('');

        container.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const source = btn.dataset.source;
                if (source === 'all') {
                    this.excludedSources.clear();
                } else {
                    if (this.excludedSources.has(source)) {
                        this.excludedSources.delete(source);
                    } else {
                        this.excludedSources.add(source);
                    }
                }
                this._updateButtonStates(container);
                this._saveToStorage();
            });
        });
    },

    _updateButtonStates(container) {
        if (!container) container = document.getElementById('source-filter-buttons');
        if (!container) return;

        const allBtn = container.querySelector('[data-source="all"]');
        const isAll = this.excludedSources.size === 0;
        if (allBtn) allBtn.classList.toggle('active', isAll);

        container.querySelectorAll('.filter-btn:not([data-source="all"])').forEach(btn => {
            btn.classList.toggle('active', !this.excludedSources.has(btn.dataset.source));
        });
    },

    // Map lowercase glossary source IDs to the normalized source names used by getAllSources().
    // sourceDisplayNames maps "core" → "Core Rulebook" but threat sources use "Core Rules" —
    // so we need this separate mapping for glossary source filtering.
    _glossaryIdToNormalized: {
        'core': 'Core Rules',
        'church': 'Church of Steel',
        'aeldari': 'Aeldari Inheritance of Embers',
        'fspg': "Forsaken System Player's Guide",
        'voa': 'Vow of Absolution',
        'redacted1': 'Redacted Records I',
        'redacted2': 'Redacted Records II',
        'shotguns': 'Departmento Munitorum Shotguns',
        'dh': 'Threat Assessment: Daemons & Heretics',
        'apocrypha': 'Apocrypha'
    },

    // Check if a source is enabled. Handles both normalized threat source names
    // (e.g. "Core Rules", "Apocrypha") and lowercase glossary IDs (e.g. "core", "apocrypha").
    isSourceEnabled(source) {
        if (!source) return true;

        // If it's a lowercase glossary ID, map it to the normalized threat source name
        const mapped = this._glossaryIdToNormalized[source];
        if (mapped) {
            return !this.excludedSources.has(mapped);
        }

        // Otherwise treat it as a threat source name and normalize
        const normalized = DataLoader.normalizeSource(source);
        return !this.excludedSources.has(normalized);
    },

    _saveToStorage() {
        try {
            localStorage.setItem(this._STORAGE_KEY, JSON.stringify([...this.excludedSources]));
        } catch (e) {
            // Ignore storage errors
        }
    },

    _restoreFromStorage() {
        try {
            const saved = localStorage.getItem(this._STORAGE_KEY);
            if (saved) {
                const arr = JSON.parse(saved);
                this.excludedSources = new Set(arr);
            }
        } catch (e) {
            // Ignore storage errors
        }
    },

    refresh() {
        this._updateButtonStates();
    }
};
