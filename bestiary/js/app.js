// ===== Bottom Sheet (shared mobile slide-up panel) =====

const BottomSheet = {
    _onCloseFn: null,
    _touchStartY: 0,
    _touchCurrentY: 0,

    isOpen() {
        return document.getElementById('bottom-sheet')?.classList.contains('open') || false;
    },

    open(renderFn, onCloseFn) {
        const sheet = document.getElementById('bottom-sheet');
        const content = document.getElementById('bottom-sheet-content');
        if (!sheet || !content) return;
        this._onCloseFn = onCloseFn || null;
        content.innerHTML = '';
        renderFn(content);
        sheet.classList.add('open');
    },

    close() {
        const sheet = document.getElementById('bottom-sheet');
        if (!sheet || !this.isOpen()) return;
        sheet.classList.remove('open');
        const fn = this._onCloseFn;
        this._onCloseFn = null;
        if (fn) fn();
        // Clear content after animation
        setTimeout(() => {
            const content = document.getElementById('bottom-sheet-content');
            if (content) content.innerHTML = '';
        }, 320);
    },

    updateContent(renderFn) {
        const content = document.getElementById('bottom-sheet-content');
        if (content && this.isOpen()) {
            content.innerHTML = '';
            renderFn(content);
        }
    },

    init() {
        document.getElementById('bottom-sheet-overlay')?.addEventListener('click', () => this.close());

        const handleRow = document.getElementById('bottom-sheet-handle-row');
        const panel = document.getElementById('bottom-sheet-panel');
        if (!handleRow || !panel) return;

        // Tap handle bar to close
        handleRow.addEventListener('click', () => this.close());

        // Swipe down on handle bar to dismiss
        handleRow.addEventListener('touchstart', (e) => {
            this._touchStartY = e.touches[0].clientY;
            this._touchCurrentY = e.touches[0].clientY;
        }, { passive: true });

        handleRow.addEventListener('touchmove', (e) => {
            this._touchCurrentY = e.touches[0].clientY;
            const deltaY = this._touchCurrentY - this._touchStartY;
            if (deltaY > 0) panel.style.transform = `translateY(${deltaY}px)`;
        }, { passive: true });

        handleRow.addEventListener('touchend', () => {
            panel.style.transform = '';
            if (this._touchCurrentY - this._touchStartY > 60) this.close();
            this._touchStartY = 0;
            this._touchCurrentY = 0;
        });
    }
};

// Main Application Controller

const App = {
    // Current active main tab
    currentTab: 'threats',

    // Initialize the application
    async init() {
        console.log('Initializing Wrath & Glory Bestiary...');

        // Load game data
        const gameData = await DataLoader.loadAll();
        console.log('Game data loaded:', Object.keys(gameData));

        // Initialize glossary system
        await Glossary.init();
        console.log('Glossary initialized.');

        // Initialize bottom sheet
        BottomSheet.init();

        // Initialize encounter state
        EncounterState.init();
        console.log('Encounter state initialized.');

        // Initialize threat builder state
        ThreatBuilderState.init();
        console.log('Threat builder state initialized.');

        // Set up close confirmation listener
        this.initCloseConfirmation();

        // Initialize UI components
        this.initTabNavigation();

        // Initialize tab modules
        SettingsTab.init();
        ThreatsTab.init();
        GlossaryTab.init();
        ReferencesTab.init();
        EncounterTab.init();
        ThreatBuilderTab.init();

        // Update threat count
        this.updateThreatCount();

        // Check for auto-saved state
        this.checkAutoSave();

        // Set initial hamburger visibility for whatever tab is active
        this.updateHamburgerVisibility(this.currentTab);

        // Handle deep link from URL hash
        this.handleDeepLink();
        window.addEventListener('hashchange', () => this.handleDeepLink());

        console.log('Application initialized.');
    },

    // Handle deep link navigation from URL hash
    handleDeepLink() {
        const hash = location.hash;
        if (!hash || hash.length < 2) return;

        const parts = hash.substring(1).split('/');
        const section = parts[0];
        const id = parts.slice(1).join('/');

        if (section === 'threats' && id) {
            this.switchTab('threats');
            ThreatsTab.selectThreat(id);
        } else if (section === 'glossary' && id) {
            this.switchTab('glossary');
            GlossaryTab.navigateToEntry(id);
        }
    },

    // Initialize close confirmation handler
    initCloseConfirmation() {
        window.api.onCheckUnsavedChanges(() => {
            const encounterUnsaved = EncounterState.hasUnsavedChanges() && !EncounterState.isEmpty();
            const builderUnsaved = ThreatBuilderState.hasUnsavedChanges() && !ThreatBuilderState.isEmpty();
            const hasChanges = encounterUnsaved || builderUnsaved;
            const encounterData = encounterUnsaved ? EncounterState.getEncounterData() : null;
            window.api.respondUnsavedChanges(hasChanges, encounterData);
        });
    },

    // Initialize top tab navigation
    initTabNavigation() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });
    },

    // Switch to a different main tab
    switchTab(tabName) {
        BottomSheet.close();
        this.currentTab = tabName;

        // Update tab button states
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content visibility
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabName}`);
        });

        // Hide the hamburger on tabs that have no sidebar to toggle
        this.updateHamburgerVisibility(tabName);

        // Trigger tab-specific refresh
        if (tabName === 'glossary') {
            GlossaryTab.refresh();
        } else if (tabName === 'threats') {
            ThreatsTab.refresh();
        } else if (tabName === 'builder') {
            ThreatBuilderTab.refresh();
        } else if (tabName === 'encounter') {
            EncounterTab.refresh();
        } else if (tabName === 'references') {
            ReferencesTab.refresh();
        } else if (tabName === 'settings') {
            SettingsTab.refresh();
        }
    },

    // Tabs whose content has no sidebar, so the header hamburger is a dead control
    TABS_WITHOUT_SIDEBAR: ['glossary', 'references', 'settings'],

    // Hide the hamburger on tabs with no sidebar; show it on tabs that have one
    updateHamburgerVisibility(tabName) {
        const hamburger = document.getElementById('hamburger-btn');
        if (!hamburger) return;
        const hide = this.TABS_WITHOUT_SIDEBAR.includes(tabName);
        hamburger.classList.toggle('hamburger-btn--hidden', hide);
        // Nothing to toggle here, so make sure no drawer is left open
        if (hide) {
            document.body.classList.remove('sidebar-open');
        }
    },

    // Update threat count display
    updateThreatCount() {
        const threats = DataLoader.getAllThreats();
        document.getElementById('threat-count').textContent = `${threats.length} Threats`;
    },

    // ===== Auto-Save Restore =====

    // Check for auto-saved state on startup and auto-load it
    checkAutoSave() {
        // Restore encounter auto-save (including any custom threats)
        const saved = EncounterState.getAutoSave();
        if (saved && saved.encounter) {
            // Inject top-level custom threats first (belt-and-suspenders with loadFromData)
            if (saved.customThreats) {
                saved.customThreats.forEach(t => DataLoader.injectThreat(t));
            }
            EncounterState.loadFromData(saved.encounter);
            this.updateThreatCount();
            this.switchTab('encounter');
            EncounterTab.refresh();
        }

        // Restore threat builder auto-save
        const builderSave = ThreatBuilderState.getAutoSave();
        if (builderSave && builderSave.threat) {
            ThreatBuilderState.loadFromAutoSave(builderSave.threat);
        }
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
