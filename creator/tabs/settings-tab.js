// Settings Tab - Source book filtering

const SettingsTab = {
    // Source button definitions (order matches display)
    sourceButtons: [
        { id: 'core', label: 'Wrath & Glory Core Rules', alwaysOn: true },
        { id: 'fspg', label: 'Forsaken System Player\'s Guide' },
        { id: 'redacted1', label: 'Redacted Records I' },
        { id: 'redacted2', label: 'Redacted Records II' },
        { id: 'church', label: 'Church of Steel' },
        { id: 'voa', label: 'Vow of Absolution' },
        { id: 'aeldari', label: 'Aeldari: Inheritance of Embers' },
        { id: 'dh', label: 'Threat Assessment: Daemons & Heretics' },
        { id: 'shotguns', label: 'Departmento Munitorum Shotguns' },
        { id: 'apocrypha', label: 'An Abundance of Apocrypha (Homebrew)' }
    ],

    init() {
        const container = document.getElementById('source-filter-buttons');
        if (!container) return;

        // Build "All" button + individual source buttons
        let html = '<button class="filter-btn active" data-source="all">All</button>';
        for (const src of this.sourceButtons) {
            html += `<button class="filter-btn active" data-source="${src.id}">${src.label}</button>`;
        }
        container.innerHTML = html;

        // Bind click handlers
        container.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const source = btn.dataset.source;
                if (source === 'all') {
                    this._toggleAll();
                } else if (source === 'core') {
                    // Core is always on — do nothing
                    return;
                } else {
                    this._toggleSource(source);
                }
                this._updateButtonStates();
                this._applyToState();
            });
        });
    },

    _toggleAll() {
        // If all are enabled, disable all non-core. Otherwise enable all.
        const allEnabled = this.sourceButtons.every(s => s.alwaysOn || State.isSourceEnabled(s.id));
        if (allEnabled) {
            // Disable everything except core
            const sources = ['core'];
            State.setEnabledSources(sources);
        } else {
            // Enable everything
            const sources = this.sourceButtons.map(s => s.id);
            State.setEnabledSources(sources);
        }
    },

    _toggleSource(sourceId) {
        const sources = [...State.enabledSources];
        const idx = sources.indexOf(sourceId);
        if (idx >= 0) {
            sources.splice(idx, 1);
        } else {
            sources.push(sourceId);
        }
        State.setEnabledSources(sources);
    },

    _applyToState() {
        // State already updated by _toggleAll/_toggleSource — just trigger a re-render
        // The state change listener in app.js handles refreshing other tabs
    },

    _updateButtonStates() {
        const container = document.getElementById('source-filter-buttons');
        if (!container) return;

        const allEnabled = this.sourceButtons.every(s => s.alwaysOn || State.isSourceEnabled(s.id));
        const allBtn = container.querySelector('[data-source="all"]');
        if (allBtn) allBtn.classList.toggle('active', allEnabled);

        container.querySelectorAll('.filter-btn:not([data-source="all"])').forEach(btn => {
            const source = btn.dataset.source;
            if (source === 'core') {
                btn.classList.add('active');
            } else {
                btn.classList.toggle('active', State.isSourceEnabled(source));
            }
        });
    },

    refresh() {
        this._updateButtonStates();
    }
};
