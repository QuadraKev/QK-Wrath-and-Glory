// Main Application Controller

const App = {
    // Current active main tab (builder, character-sheet, glossary)
    currentTab: 'builder',

    // Current active builder section
    currentSection: 'setting',

    // Ordered list of builder sections for prev/next navigation
    SECTION_ORDER: ['setting', 'species', 'archetype', 'stats', 'talents', 'wargear', 'powers', 'background', 'injuries', 'ascension'],

    // Initialize the application
    async init() {
        console.log('Initializing Wrath & Glory Character Creator...');

        // Load game data
        const gameData = await DataLoader.loadAll();
        console.log('Game data loaded:', Object.keys(gameData));

        // Initialize state
        State.init(gameData);

        // Initialize glossary system
        await Glossary.init();
        console.log('Glossary initialized.');

        // Add state change listener
        State.addListener((changeType, data, character) => {
            this.onStateChange(changeType, data, character);
        });

        // Initialize UI components
        this.initTabNavigation();
        this.initSidebar();
        this.initHeaderButtons();
        this.initSectionNav();

        // Initialize tab modules
        SettingTab.init();
        SpeciesTab.init();
        ArchetypeTab.init();
        AscensionTab.init();
        StatsTab.init();
        TalentsTab.init();
        WargearTab.init();
        PowersTab.init();
        BackgroundTab.init();
        InjuriesTab.init();
        CharacterSheetTab.init();
        GlossaryTab.init();
        ReferencesTab.init();
        SettingsTab.init();

        // Check for auto-saved state
        this.checkAutoSave();

        // Register close request handler for unsaved changes prompt
        window.api.onRequestClose(async () => {
            if (!State.isDirty) {
                window.api.confirmClose();
                return;
            }

            const response = await window.api.showUnsavedDialog();
            if (response === 0) {
                // Save
                const result = await CharacterIO.save();
                if (result.success) {
                    window.api.confirmClose();
                }
                // If save failed or was cancelled, stay open
            } else if (response === 1) {
                // Don't Save
                window.api.confirmClose();
            }
            // response === 2 (Cancel) - do nothing, window stays open
        });

        // Update initial display
        this.updateXPDisplay();
        this.updateSidebar();
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

        if (section === 'glossary' && id) {
            this.switchTab('glossary');
            GlossaryTab.navigateToEntry(id);
        }
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

    // Initialize sidebar click handlers (for builder sections)
    initSidebar() {
        const sidebarItems = document.querySelectorAll('.sidebar-item');
        sidebarItems.forEach(item => {
            item.addEventListener('click', () => {
                const section = item.dataset.section;
                if (section) {
                    this.switchSection(section);
                }
            });
        });
    },

    // Initialize header buttons
    initHeaderButtons() {
        // New character button
        document.getElementById('btn-new').addEventListener('click', async () => {
            const confirmed = await window.api.showConfirm(
                'Create a new character? Unsaved changes will be lost.',
                'New Character'
            );
            if (confirmed) {
                State.newCharacter();
                this.switchTab('builder');
                this.switchSection('setting');
            }
        });

        // Save button
        document.getElementById('btn-save').addEventListener('click', async () => {
            const result = await CharacterIO.save();
            if (result.success) {
                await window.api.showMessage('Character saved successfully!', 'Save Complete');
            } else if (result.error !== 'Save cancelled.') {
                await window.api.showMessage('Error saving character: ' + result.error, 'Save Error', 'error');
            }
        });

        // Load button - directly opens file dialog
        document.getElementById('btn-load').addEventListener('click', async () => {
            const result = await CharacterIO.load();
            if (result.success) {
                this.switchTab('builder');
                this.switchSection('setting');
                await window.api.showMessage('Character loaded successfully!', 'Load Complete');
            } else if (result.error !== 'Load cancelled.') {
                await window.api.showMessage('Error loading character: ' + result.error, 'Load Error', 'error');
            }
        });
    },

    // Initialize section prev/next navigation
    initSectionNav() {
        document.getElementById('btn-prev-section').addEventListener('click', () => {
            this.navigatePrevious();
        });
        document.getElementById('btn-next-section').addEventListener('click', () => {
            this.navigateNext();
        });
        document.getElementById('btn-prev-section-top').addEventListener('click', () => {
            this.navigatePrevious();
        });
        document.getElementById('btn-next-section-top').addEventListener('click', () => {
            this.navigateNext();
        });
    },

    // Navigate to the previous builder section
    navigatePrevious() {
        const idx = this.SECTION_ORDER.indexOf(this.currentSection);
        if (idx > 0) {
            this.switchSection(this.SECTION_ORDER[idx - 1]);
        }
    },

    // Navigate to the next builder section
    navigateNext() {
        const idx = this.SECTION_ORDER.indexOf(this.currentSection);
        if (idx < this.SECTION_ORDER.length - 1) {
            this.switchSection(this.SECTION_ORDER[idx + 1]);
        }
    },

    // Update prev/next button disabled states
    updateSectionNavButtons() {
        const idx = this.SECTION_ORDER.indexOf(this.currentSection);
        const isFirst = idx <= 0;
        const isLast = idx >= this.SECTION_ORDER.length - 1;

        const prevBtn = document.getElementById('btn-prev-section');
        const nextBtn = document.getElementById('btn-next-section');
        const prevBtnTop = document.getElementById('btn-prev-section-top');
        const nextBtnTop = document.getElementById('btn-next-section-top');

        if (prevBtn) prevBtn.disabled = isFirst;
        if (nextBtn) nextBtn.disabled = isLast;
        if (prevBtnTop) prevBtnTop.disabled = isFirst;
        if (nextBtnTop) nextBtnTop.disabled = isLast;
    },

    // Switch to a different main tab
    switchTab(tabName) {
        this.currentTab = tabName;

        // Update tab button states
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Update tab content visibility
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `tab-${tabName}`);
        });

        // Close sidebar when switching away from builder
        if (tabName !== 'builder') {
            document.body.classList.remove('sidebar-open');
        }

        // Hide the hamburger on tabs that have no sidebar to toggle
        this.updateHamburgerVisibility(tabName);

        // Trigger tab-specific refresh
        if (tabName === 'character-sheet') {
            CharacterSheetTab.refresh();
        } else if (tabName === 'glossary') {
            GlossaryTab.refresh();
        } else if (tabName === 'references') {
            ReferencesTab.refresh();
        } else if (tabName === 'settings') {
            SettingsTab.refresh();
        } else if (tabName === 'builder') {
            // Refresh the current builder section
            this.refreshCurrentSection();
        }
    },

    // Tabs whose content has no sidebar, so the header hamburger is a dead control
    TABS_WITHOUT_SIDEBAR: ['character-sheet', 'glossary', 'references', 'settings'],

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

    // Switch to a different builder section
    switchSection(sectionName) {
        this.currentSection = sectionName;

        // Make sure we're on the builder tab
        if (this.currentTab !== 'builder') {
            this.switchTab('builder');
        }

        // Update sidebar item states
        document.querySelectorAll('.sidebar-item').forEach(item => {
            item.classList.toggle('active', item.dataset.section === sectionName);
        });

        // Update section visibility
        document.querySelectorAll('.builder-section').forEach(section => {
            section.classList.toggle('active', section.id === `section-${sectionName}`);
        });

        // Update prev/next buttons
        this.updateSectionNavButtons();

        // Trigger section-specific refresh
        this.refreshCurrentSection();
    },

    // Refresh the current builder section
    refreshCurrentSection() {
        switch (this.currentSection) {
            case 'setting':
                SettingTab.refresh();
                break;
            case 'species':
                SpeciesTab.refresh();
                break;
            case 'archetype':
                ArchetypeTab.refresh();
                break;
            case 'ascension':
                AscensionTab.refresh();
                break;
            case 'stats':
                StatsTab.refresh();
                break;
            case 'talents':
                TalentsTab.refresh();
                break;
            case 'wargear':
                WargearTab.refresh();
                break;
            case 'powers':
                PowersTab.refresh();
                break;
            case 'background':
                BackgroundTab.refresh();
                break;
            case 'injuries':
                InjuriesTab.refresh();
                break;
        }
    },

    // Handle state changes
    onStateChange(changeType, data, character) {
        // Always update XP display and sidebar
        this.updateXPDisplay();
        this.updateSidebar();

        // Update keywords in footer
        this.updateKeywords();

        // Refresh current section if relevant
        if (changeType === 'reset' || changeType === 'load') {
            this.refreshCurrentSection();
        }

        // Refresh species tab when sub-options change
        if (changeType === 'speciesSubOption' && this.currentSection === 'species') {
            SpeciesTab.refresh();
        }
    },

    // Update XP display
    updateXPDisplay() {
        const character = State.getCharacter();
        const total = XPCalculator.getTotalXP(character.tier, character.additionalXp, character);
        const spent = XPCalculator.calculateSpentXP(character);
        const remaining = total - spent;

        const xpText = `${spent} / ${total} XP`;
        const effectiveTier = State.getEffectiveTier();
        const startingTier = character.tier;
        const tierText = `Tier ${effectiveTier} Campaign`;

        // Update all XP displays
        document.getElementById('xp-display').textContent = xpText;
        document.getElementById('footer-xp').textContent = xpText;
        document.getElementById('campaign-display').textContent = tierText;
        document.getElementById('sidebar-setting-xp').textContent = xpText;
    },

    // Update sidebar
    updateSidebar() {
        const character = State.getCharacter();
        const breakdown = XPCalculator.getXPBreakdown(character);

        // Species
        const species = DataLoader.getSpecies(character.species?.id);
        let speciesDisplayName = species?.name || '-';

        // Add Chapter/Path to species display name
        if (species?.subOptions && character.species?.subOptions) {
            const subOptionsConfig = Array.isArray(species.subOptions) ? species.subOptions : [species.subOptions];
            const subOptionNames = [];

            for (const config of subOptionsConfig) {
                // Only show chapter-type or single-select options in sidebar
                if (!config.countByTier) {
                    const selected = character.species.subOptions.find(opt => opt.type === config.type);
                    if (selected) {
                        const option = config.options?.find(o => o.id === selected.optionId);
                        if (option) {
                            subOptionNames.push(option.name);
                        }
                    }
                }
            }

            if (subOptionNames.length > 0) {
                speciesDisplayName = `${species.name} (${subOptionNames.join(', ')})`;
            }
        }

        document.getElementById('sidebar-species-name').textContent = speciesDisplayName;
        document.getElementById('sidebar-species-xp').textContent = `${breakdown.species} XP`;

        // Archetype
        const archetype = DataLoader.getArchetype(character.archetype?.id);
        let archetypeName = archetype?.name || '-';
        if (character.archetype?.id === 'custom') {
            archetypeName = character.customArchetype?.name || 'Custom Archetype';
        }
        document.getElementById('sidebar-archetype-name').textContent = archetypeName;
        document.getElementById('sidebar-archetype-xp').textContent = `${breakdown.archetype} XP`;

        // Ascension
        const ascensionCount = (character.ascensions || []).length;
        const ascensionCountEl = document.getElementById('sidebar-ascension-count');
        if (ascensionCountEl) {
            ascensionCountEl.textContent = ascensionCount > 0 ? `${ascensionCount} Ascension${ascensionCount > 1 ? 's' : ''}` : '';
        }
        document.getElementById('sidebar-ascension-xp').textContent = `${breakdown.ascension} XP`;

        // Stats
        const statsXP = breakdown.attributes + breakdown.skills;
        document.getElementById('sidebar-stats-xp').textContent = `${statsXP} XP`;

        // Talents
        const talentCount = character.talents?.length || 0;
        document.getElementById('sidebar-talents-count').textContent = `${talentCount} Talents learned`;
        document.getElementById('sidebar-talents-xp').textContent = `${breakdown.talents} XP`;

        // Powers
        const powerCount = character.psychicPowers?.length || 0;
        document.getElementById('sidebar-powers-count').textContent = `${powerCount} Powers learned`;
        document.getElementById('sidebar-powers-xp').textContent = `${breakdown.powers} XP`;

        // Faction
        const factionName = character.archetype?.id === 'custom' ? 'Custom' : (archetype?.faction || '-');
        document.getElementById('sidebar-faction').textContent = factionName;
    },

    // Update keywords display
    updateKeywords() {
        const keywords = State.getKeywords();
        const keywordText = keywords.length > 0 ? keywords.join(' • ') : '';
        document.getElementById('footer-keywords').textContent = keywordText;
    },

    // ===== Auto-Save Restore =====

    // Check for auto-saved state on startup and auto-load it
    checkAutoSave() {
        const saved = State.getAutoSave();
        if (!saved) return;

        if (saved.enabledSources) {
            State.setEnabledSources(saved.enabledSources);
        }
        if (saved.character) {
            State.loadCharacter(saved.character);
        }

        SettingTab.refresh();
        SettingsTab.refresh();
        this.switchTab('builder');
        this.switchSection('setting');
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
