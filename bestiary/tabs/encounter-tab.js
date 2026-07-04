// Encounter Tab - Encounter Builder UI

const EncounterTab = {
    selectedId: null,
    selectionType: null, // 'individual' or 'mob'
    multiSelectedIds: new Set(), // For multi-selection

    init() {
        // Initialize the tab
        this.bindEvents();
        this.render();
    },

    refresh() {
        this.render();
    },

    clearMultiSelection() {
        this.multiSelectedIds.clear();
    },

    bindEvents() {
        // Settings events
        document.getElementById('encounter-tier').addEventListener('change', (e) => {
            EncounterState.updateSettings({ tier: parseInt(e.target.value) });
            this.render();
        });

        document.getElementById('encounter-players').addEventListener('change', (e) => {
            EncounterState.updateSettings({ playerCount: parseInt(e.target.value) });
            this.renderPlayerCharacterInputs();
            this.renderEncounterList();
        });

        document.getElementById('encounter-name').addEventListener('input', (e) => {
            EncounterState.updateSettings({ name: e.target.value });
            const sidebar = document.getElementById('encounter-name-sidebar');
            if (sidebar) sidebar.value = e.target.value;
        });

        document.getElementById('encounter-name-sidebar')?.addEventListener('input', (e) => {
            EncounterState.updateSettings({ name: e.target.value });
            const main = document.getElementById('encounter-name');
            if (main) main.value = e.target.value;
        });

        // Sidebar action buttons
        document.getElementById('btn-save-encounter-sidebar')?.addEventListener('click', () => this.handleSave());
        document.getElementById('btn-load-encounter-sidebar')?.addEventListener('click', () => this.handleLoad());
        document.getElementById('btn-import-threat-sidebar')?.addEventListener('click', () => this.handleImportThreat());
        document.getElementById('btn-clear-encounter-sidebar')?.addEventListener('click', () => this.handleClear());

        // Save/Load events
        document.getElementById('btn-save-encounter').addEventListener('click', () => {
            this.handleSave();
        });

        document.getElementById('btn-load-encounter').addEventListener('click', () => {
            this.handleLoad();
        });

        document.getElementById('btn-clear-encounter').addEventListener('click', () => {
            this.handleClear();
        });

        document.getElementById('btn-import-threat').addEventListener('click', () => {
            this.handleImportThreat();
        });

        document.getElementById('btn-sort-initiative').addEventListener('click', () => {
            this.handleSortByInitiative();
        });

        document.getElementById('btn-save-players').addEventListener('click', () => {
            this.handleSavePlayers();
        });

        document.getElementById('btn-load-players').addEventListener('click', () => {
            this.handleLoadPlayers();
        });

        // Round tracker
        document.getElementById('btn-round-minus').addEventListener('click', () => {
            EncounterState.decrementRound();
            this.renderRoundDisplay();
        });

        document.getElementById('btn-round-plus').addEventListener('click', () => {
            EncounterState.incrementRound();
            this.renderRoundDisplay();
        });
    },

    render() {
        this.renderSettings();
        this.renderPlayerCharacterInputs();
        this.renderEncounterList();
        this.renderDetail();
    },

    // ===== Settings Section =====

    renderSettings() {
        document.getElementById('encounter-tier').value = EncounterState.settings.tier;
        document.getElementById('encounter-players').value = EncounterState.settings.playerCount;
        document.getElementById('encounter-name').value = EncounterState.settings.name;
        const sidebarName = document.getElementById('encounter-name-sidebar');
        if (sidebarName) sidebarName.value = EncounterState.settings.name;
        this.renderRoundDisplay();
    },

    renderRoundDisplay() {
        document.getElementById('round-display').textContent = EncounterState.settings.round;
    },

    // ===== Player Character Inputs =====

    renderPlayerCharacterInputs() {
        const container = document.getElementById('player-character-inputs');
        const playerCount = EncounterState.settings.playerCount;

        // Build input rows - show existing PCs first, then empty slots for remaining
        let html = '';
        for (let i = 0; i < playerCount; i++) {
            const pc = EncounterState.playerCharacters[i];
            if (pc) {
                html += `
                    <div class="player-character-row" data-index="${i}" data-id="${pc.id}">
                        <input type="text" class="pc-name-input" value="${this.escapeHtml(pc.name)}"
                               data-index="${i}" data-id="${pc.id}" placeholder="Player ${i + 1}">
                        <input type="number" class="pc-initiative-input" value="${pc.initiative ?? ''}"
                               data-index="${i}" data-id="${pc.id}" placeholder="Init" min="0" max="99">
                        <button class="pc-remove-btn" data-id="${pc.id}" title="Remove">&times;</button>
                    </div>
                `;
            } else {
                html += `
                    <div class="player-character-row" data-index="${i}">
                        <input type="text" class="pc-name-input" value=""
                               data-index="${i}" placeholder="Player ${i + 1}">
                        <input type="number" class="pc-initiative-input" value=""
                               data-index="${i}" placeholder="Init" min="0" max="99">
                        <button class="pc-remove-btn pc-remove-blank" data-index="${i}" title="Remove">&times;</button>
                    </div>
                `;
            }
        }
        container.innerHTML = html;

        // Remove excess player characters if player count was reduced
        while (EncounterState.playerCharacters.length > playerCount) {
            const lastPc = EncounterState.playerCharacters[EncounterState.playerCharacters.length - 1];
            EncounterState.removePlayerCharacter(lastPc.id);
        }

        // Bind events
        container.querySelectorAll('.pc-name-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                const existingId = e.target.dataset.id;
                const newName = e.target.value.trim();

                if (existingId) {
                    // Update existing player character
                    if (newName) {
                        EncounterState.updatePlayerCharacterName(existingId, newName);
                    }
                } else if (newName) {
                    // Create new player character at this index
                    const newId = EncounterState.addPlayerCharacter(newName);
                    // Re-render to update the data-id attribute
                    this.renderPlayerCharacterInputs();
                }
                this.renderEncounterList();
                if (this.selectedId && this.selectionType === 'player') {
                    this.renderDetail();
                }
            });
        });

        container.querySelectorAll('.pc-initiative-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const existingId = e.target.dataset.id;
                const index = parseInt(e.target.dataset.index);

                if (existingId) {
                    EncounterState.setPlayerCharacterInitiative(existingId, e.target.value);
                } else if (e.target.value !== '') {
                    // Create player character if setting initiative on empty slot
                    const nameInput = container.querySelector(`.pc-name-input[data-index="${index}"]`);
                    const name = nameInput?.value.trim() || `Player ${index + 1}`;
                    const newId = EncounterState.addPlayerCharacter(name);
                    EncounterState.setPlayerCharacterInitiative(newId, e.target.value);
                    this.renderPlayerCharacterInputs();
                }
                this.renderEncounterList();
            });
        });

        container.querySelectorAll('.pc-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                if (id) {
                    EncounterState.removePlayerCharacter(id);
                }
                const newCount = EncounterState.settings.playerCount - 1;
                EncounterState.updateSettings({ playerCount: Math.max(1, newCount) });
                document.getElementById('encounter-players').value = EncounterState.settings.playerCount;
                this.renderPlayerCharacterInputs();
                this.renderEncounterList();
            });
        });
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // ===== Encounter List =====

    renderEncounterList() {
        const container = document.getElementById('encounter-list');
        const items = EncounterState.getEncounterListItems();

        if (items.length === 0) {
            container.innerHTML = `
                <div class="encounter-list-empty">
                    <p>No threats in encounter</p>
                    <p class="text-muted">Add threats from the Threats tab</p>
                </div>
            `;
            this.renderSelectionToolbar();
            return;
        }

        container.innerHTML = items.map(item => this.renderEncounterItem(item)).join('');

        // Render selection toolbar
        this.renderSelectionToolbar();

        // Bind click handlers
        container.querySelectorAll('.encounter-item').forEach(el => {
            el.addEventListener('click', (e) => {
                const id = el.dataset.id;
                const type = el.dataset.type;

                // Check if Ctrl/Cmd key is held for multi-select
                if (e.ctrlKey || e.metaKey) {
                    this.toggleMultiSelect(id, type);
                } else {
                    this.selectItem(id, type);
                }
            });
        });

        // Bind checkbox handlers for multi-select
        container.querySelectorAll('.multi-select-checkbox').forEach(checkbox => {
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            checkbox.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                const type = e.target.dataset.type;
                if (e.target.checked) {
                    this.multiSelectedIds.add(id);
                } else {
                    this.multiSelectedIds.delete(id);
                }
                this.renderSelectionToolbar();
            });
        });

        // Bind initiative input handlers
        container.querySelectorAll('.initiative-input').forEach(input => {
            input.addEventListener('click', (e) => e.stopPropagation());
            input.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                const type = e.target.dataset.type;
                if (type === 'individual') {
                    EncounterState.setInitiative(id, e.target.value);
                } else if (type === 'mob') {
                    EncounterState.setMobInitiative(id, e.target.value);
                } else if (type === 'player') {
                    EncounterState.setPlayerCharacterInitiative(id, e.target.value);
                    // Also update the sidebar input
                    this.renderPlayerCharacterInputs();
                }
                this.renderEncounterList();
            });
        });

        // Bind wound/shock buttons
        container.querySelectorAll('.wound-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const delta = parseInt(btn.dataset.delta);
                EncounterState.updateWounds(id, delta);
                this.renderEncounterList();
                if (this.selectedId === id) {
                    this.renderDetail();
                }
            });
        });

        container.querySelectorAll('.shock-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const delta = parseInt(btn.dataset.delta);
                EncounterState.updateShock(id, delta);
                this.renderEncounterList();
                if (this.selectedId === id) {
                    this.renderDetail();
                }
            });
        });

        container.querySelectorAll('.ruin-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const delta = parseInt(btn.dataset.delta);
                EncounterState.updatePersonalRuin(id, delta);
                this.renderEncounterList();
                if (this.selectedId === id) {
                    this.renderDetail();
                }
            });
        });

        // Bind duplicate buttons
        container.querySelectorAll('.duplicate-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const type = btn.dataset.type;
                this.handleDuplicate(id, type);
            });
        });

        // Bind delete buttons
        container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const type = btn.dataset.type;
                this.handleDelete(id, type);
            });
        });

        // Bind bonus select handlers
        container.querySelectorAll('.bonus-select').forEach(select => {
            select.addEventListener('click', (e) => e.stopPropagation());
            select.addEventListener('change', (e) => {
                const id = e.target.dataset.id;
                const bonus = e.target.value;
                EncounterState.updateBonus(id, bonus);
                this.renderEncounterList();
                if (this.selectedId === id) {
                    this.renderDetail();
                }
            });
        });

        // Bind drag-and-drop handlers for reordering
        this.bindDragDropHandlers(container);
    },

    // Track dragging state
    dragState: {
        dragging: false,
        element: null,
        placeholder: null,
        itemId: null,
        itemType: null,
        startY: 0,
        currentY: 0,
        offsetY: 0
    },

    bindDragDropHandlers(container) {
        const items = container.querySelectorAll('.encounter-item');

        items.forEach(el => {
            const handle = el.querySelector('.drag-handle');
            if (handle) {
                handle.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    this.startDrag(e.clientY, e.clientX, el, container);
                });
                handle.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    const t = e.touches[0];
                    this.startDrag(t.clientY, t.clientX, el, container);
                }, { passive: false });
            }

            // Disable native drag since we're using custom implementation
            el.setAttribute('draggable', 'false');
        });
    },

    startDrag(clientY, clientX, element, container) {
        const rect = element.getBoundingClientRect();

        // Create a clone for dragging
        const clone = element.cloneNode(true);
        clone.classList.add('drag-clone');
        clone.style.width = rect.width + 'px';
        clone.style.position = 'fixed';
        clone.style.left = rect.left + 'px';
        clone.style.top = rect.top + 'px';
        clone.style.zIndex = '1000';
        clone.style.pointerEvents = 'none';
        document.body.appendChild(clone);

        // Create placeholder
        const placeholder = document.createElement('div');
        placeholder.className = 'drag-placeholder';
        placeholder.style.height = rect.height + 'px';
        element.parentNode.insertBefore(placeholder, element);

        // Hide original element
        element.classList.add('drag-original-hidden');

        // Set up drag state
        this.dragState = {
            dragging: true,
            element: element,
            clone: clone,
            placeholder: placeholder,
            container: container,
            itemId: element.dataset.id,
            itemType: element.dataset.type,
            startY: clientY,
            offsetY: clientY - rect.top,
            elementHeight: rect.height + 8 // Include gap
        };

        // Bind move and end handlers (mouse + touch)
        document.addEventListener('mousemove', this.handleDragMove);
        document.addEventListener('mouseup', this.handleDragEnd);
        document.addEventListener('touchmove', this.handleDragMove, { passive: false });
        document.addEventListener('touchend', this.handleDragEnd);
    },

    handleDragMove: function(e) {
        const tab = EncounterTab;
        if (!tab.dragState.dragging) return;
        if (e.cancelable) e.preventDefault();

        const { clone, placeholder, container, offsetY } = tab.dragState;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        // Move the clone
        clone.style.top = (clientY - offsetY) + 'px';

        // Get all non-hidden items
        const items = Array.from(container.querySelectorAll('.encounter-item:not(.drag-original-hidden)'));

        // Find where to insert placeholder based on pointer position
        let newIndex = items.length;
        for (let i = 0; i < items.length; i++) {
            const itemRect = items[i].getBoundingClientRect();
            const itemMiddle = itemRect.top + itemRect.height / 2;

            if (clientY < itemMiddle) {
                newIndex = Array.from(container.children).indexOf(items[i]);
                break;
            }
        }

        // Move placeholder if needed
        const currentPlaceholderIndex = Array.from(container.children).indexOf(placeholder);
        if (newIndex !== currentPlaceholderIndex) {
            if (newIndex >= container.children.length) {
                container.appendChild(placeholder);
            } else {
                container.insertBefore(placeholder, container.children[newIndex]);
            }
        }
    },

    handleDragEnd: function(e) {
        const tab = EncounterTab;
        if (!tab.dragState.dragging) return;

        const { element, clone, placeholder, container, itemId, itemType } = tab.dragState;

        // Get final position
        const placeholderIndex = Array.from(container.children).indexOf(placeholder);

        // Clean up
        clone.remove();
        placeholder.remove();
        element.classList.remove('drag-original-hidden');

        // Remove event listeners
        document.removeEventListener('mousemove', tab.handleDragMove);
        document.removeEventListener('mouseup', tab.handleDragEnd);
        document.removeEventListener('touchmove', tab.handleDragMove);
        document.removeEventListener('touchend', tab.handleDragEnd);

        // Reset drag state
        tab.dragState.dragging = false;

        // Update the order in state
        EncounterState.moveItemInOrder(itemType, itemId, placeholderIndex);

        // Re-render
        tab.renderEncounterList();
    },

    renderEncounterItem(item) {
        if (item.type === 'individual') {
            return this.renderIndividualItem(item);
        } else if (item.type === 'mob') {
            return this.renderMobItem(item);
        } else if (item.type === 'player') {
            return this.renderPlayerItem(item);
        }
        return '';
    },

    renderPlayerItem(item) {
        const pc = item.data;
        const isSelected = this.selectedId === item.id && this.selectionType === 'player';

        return `
            <div class="encounter-item player-item ${isSelected ? 'selected' : ''}"
                 data-id="${item.id}" data-type="player" draggable="true">
                <div class="encounter-item-header">
                    <span class="drag-handle" title="Drag to reorder">&#x2630;</span>
                    <input type="number" class="initiative-input" value="${item.initiative ?? ''}"
                           data-id="${item.id}" data-type="player" placeholder="Init"
                           min="0" max="99">
                    <span class="encounter-item-name">${this.escapeHtml(pc.name)}</span>
                    <span class="player-badge">PC</span>
                </div>
            </div>
        `;
    },

    renderIndividualItem(item) {
        const individual = item.data;
        const threat = DataLoader.getThreat(individual.threatId);
        const isSelected = this.selectedId === item.id && this.selectionType === 'individual';
        const isMultiSelected = this.multiSelectedIds.has(item.id);
        const deadClass = item.isDead ? 'dead' : '';

        const woundPercent = individual.maxWounds > 0 ? (individual.currentWounds / individual.maxWounds) * 100 : 0;
        const shockPercent = individual.maxShock > 0 ? (individual.currentShock / individual.maxShock) * 100 : 0;

        // Show checkbox for individuals not in a mob
        const showCheckbox = !individual.mobId;
        const bonus = individual.bonus || 'none';

        return `
            <div class="encounter-item ${isSelected ? 'selected' : ''} ${isMultiSelected ? 'multi-selected' : ''} ${deadClass}"
                 data-id="${item.id}" data-type="individual" data-threat-id="${individual.threatId}" draggable="true">
                <div class="encounter-item-header">
                    <span class="drag-handle" title="Drag to reorder">&#x2630;</span>
                    ${showCheckbox ? `
                        <input type="checkbox" class="multi-select-checkbox"
                               data-id="${item.id}" data-type="individual"
                               ${isMultiSelected ? 'checked' : ''}>
                    ` : ''}
                    <input type="number" class="initiative-input" value="${item.initiative ?? ''}"
                           data-id="${item.id}" data-type="individual" placeholder="Init"
                           min="0" max="99">
                    <span class="encounter-item-name">${this.escapeHtml(item.name)}</span>
                    <select class="bonus-select bonus-${bonus}" data-id="${item.id}">
                        <option value="none" ${bonus === 'none' ? 'selected' : ''}>No Bonus</option>
                        <option value="elite" ${bonus === 'elite' ? 'selected' : ''}>Elite</option>
                        <option value="adversary" ${bonus === 'adversary' ? 'selected' : ''}>Adversary</option>
                    </select>
                </div>
                <div class="encounter-item-stats">
                    <div class="stat-tracker wounds-tracker">
                        <span class="stat-label">W:</span>
                        <button class="wound-btn" data-id="${item.id}" data-delta="-1">-</button>
                        <span class="stat-value">${individual.currentWounds}/${individual.maxWounds}</span>
                        <button class="wound-btn" data-id="${item.id}" data-delta="1">+</button>
                        <div class="stat-bar">
                            <div class="stat-bar-fill wounds-bar" style="width: ${woundPercent}%"></div>
                        </div>
                    </div>
                    <div class="stat-tracker shock-tracker">
                        <span class="stat-label">S:</span>
                        <button class="shock-btn" data-id="${item.id}" data-delta="-1">-</button>
                        <span class="stat-value">${individual.maxShock > 0 ? `${individual.currentShock}/${individual.maxShock}` : '-'}</span>
                        <button class="shock-btn" data-id="${item.id}" data-delta="1">+</button>
                        <div class="stat-bar">
                            <div class="stat-bar-fill shock-bar" style="width: ${shockPercent}%"></div>
                        </div>
                    </div>
                    ${EncounterState.threatHasChampion(threat) ? `
                    <div class="stat-tracker ruin-tracker">
                        <span class="stat-label ruin-label">R:</span>
                        <button class="ruin-btn" data-id="${item.id}" data-delta="-1">-</button>
                        <span class="stat-value">${individual.personalRuin || 0}</span>
                        <button class="ruin-btn" data-id="${item.id}" data-delta="1">+</button>
                    </div>
                    ` : ''}
                </div>
                <div class="encounter-item-actions">
                    <button class="duplicate-btn" data-id="${item.id}" data-type="individual" title="Duplicate">
                        <span>+</span>
                    </button>
                    <button class="delete-btn" data-id="${item.id}" data-type="individual" title="Remove">
                        <span>&times;</span>
                    </button>
                </div>
            </div>
        `;
    },

    renderMobItem(item) {
        const mob = item.data;
        const bonus = EncounterState.getMobAttackBonus(item.id);
        const isSelected = this.selectedId === item.id && this.selectionType === 'mob';
        const deadClass = item.isDead ? 'dead' : '';

        return `
            <div class="encounter-item mob-item ${isSelected ? 'selected' : ''} ${deadClass}"
                 data-id="${item.id}" data-type="mob" draggable="true">
                <div class="encounter-item-header">
                    <span class="drag-handle" title="Drag to reorder">&#x2630;</span>
                    <input type="number" class="initiative-input" value="${item.initiative ?? ''}"
                           data-id="${item.id}" data-type="mob" placeholder="Init"
                           min="0" max="99">
                    <span class="encounter-item-name">${this.escapeHtml(mob.name)}</span>
                    <span class="mob-badge">MOB</span>
                </div>
                <div class="mob-info">
                    <span class="mob-count">${bonus.count} members (${item.livingCount} alive)</span>
                    <span class="mob-bonus">+${bonus.bonus} dice (max ${bonus.max})</span>
                </div>
                <div class="encounter-item-actions">
                    <button class="duplicate-btn" data-id="${item.id}" data-type="mob" title="Duplicate Mob">
                        <span>+</span>
                    </button>
                    <button class="delete-btn" data-id="${item.id}" data-type="mob" title="Remove Mob">
                        <span>&times;</span>
                    </button>
                </div>
            </div>
        `;
    },

    selectItem(id, type) {
        this.selectedId = id;
        this.selectionType = type;
        // Do NOT clear multi-selection here: focusing a unit to view its detail
        // must not wipe an in-progress mob selection (the checkbox set).
        this.renderEncounterList();

        if (window.innerWidth <= 768) {
            BottomSheet.open(
                div => this._renderDetailContent(div),
                () => {
                    this.selectedId = null;
                    this.selectionType = null;
                    this.renderEncounterList();
                }
            );
        } else {
            this.renderDetail();
        }
    },

    // Render detail content into any container (used by both desktop detail panel and mobile bottom sheet)
    _renderDetailContent(container) {
        if (!this.selectedId) return;
        if (this.selectionType === 'individual') {
            this.renderIndividualDetail(container);
        } else if (this.selectionType === 'mob') {
            this.renderMobDetail(container);
        } else if (this.selectionType === 'player') {
            this.renderPlayerDetail(container);
        }
    },

    toggleMultiSelect(id, type) {
        // Only allow multi-select for standalone individuals
        if (type !== 'individual') return;

        const individual = EncounterState.getIndividual(id);
        if (!individual || individual.mobId) return;

        if (this.multiSelectedIds.has(id)) {
            this.multiSelectedIds.delete(id);
        } else {
            this.multiSelectedIds.add(id);
        }

        // Clear single selection when multi-selecting
        if (this.multiSelectedIds.size > 0) {
            this.selectedId = null;
            this.selectionType = null;
        }

        this.renderEncounterList();
        this.renderDetail();
    },

    renderSelectionToolbar() {
        let toolbar = document.getElementById('selection-toolbar');

        // Create toolbar if it doesn't exist
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.id = 'selection-toolbar';
            toolbar.className = 'selection-toolbar';
            const listContainer = document.querySelector('.encounter-list-container');
            if (listContainer) {
                listContainer.insertBefore(toolbar, listContainer.firstChild);
            }
        }

        const count = this.multiSelectedIds.size;

        if (count < 1) {
            toolbar.classList.add('hidden');
            return;
        }

        // Check if all selected are same threat type (required for mob)
        const selectedIndividuals = Array.from(this.multiSelectedIds)
            .map(id => EncounterState.getIndividual(id))
            .filter(i => i !== undefined);

        const threatIds = new Set(selectedIndividuals.map(i => i.threatId));
        const canFormMob = count >= 2 && threatIds.size === 1 && selectedIndividuals.every(i => !i.mobId);

        toolbar.classList.remove('hidden');
        toolbar.innerHTML = `
            <div class="toolbar-info">
                <span>${count} threat${count !== 1 ? 's' : ''} selected</span>
                ${count >= 2 && threatIds.size > 1 ? '<span class="toolbar-warning">(different types - cannot form mob)</span>' : ''}
            </div>
            <div class="toolbar-actions">
                <button class="btn-primary toolbar-btn" id="btn-form-mob" ${canFormMob ? '' : 'disabled'}>
                    Form Mob
                </button>
                <button class="btn-danger toolbar-btn" id="btn-delete-selected">
                    Delete Selected
                </button>
                <button class="btn-secondary toolbar-btn" id="btn-clear-selection">
                    Clear
                </button>
            </div>
        `;

        // Bind events
        document.getElementById('btn-form-mob')?.addEventListener('click', () => {
            this.handleFormMob();
        });

        document.getElementById('btn-delete-selected')?.addEventListener('click', () => {
            this.handleBulkDelete();
        });

        document.getElementById('btn-clear-selection')?.addEventListener('click', () => {
            this.clearMultiSelection();
            this.renderEncounterList();
        });
    },

    handleBulkDelete() {
        if (this.multiSelectedIds.size === 0) return;

        const ids = Array.from(this.multiSelectedIds);
        ids.forEach(id => {
            EncounterState.removeIndividual(id);
        });

        if (this.selectedId && this.multiSelectedIds.has(this.selectedId)) {
            this.selectedId = null;
            this.selectionType = null;
        }
        this.clearMultiSelection();
        this.renderEncounterList();
        this.renderDetail();
        this.showNotification(`Deleted ${ids.length} threat${ids.length !== 1 ? 's' : ''}`);
    },

    handleFormMob() {
        if (this.multiSelectedIds.size < 2) return;

        const ids = Array.from(this.multiSelectedIds);
        const firstIndividual = EncounterState.getIndividual(ids[0]);
        if (!firstIndividual) return;

        const threatId = firstIndividual.threatId;

        // Create the mob
        const mobId = EncounterState.createMob(threatId, ids);

        if (mobId) {
            this.clearMultiSelection();
            this.selectItem(mobId, 'mob');
            this.showNotification('Mob formed!');
        }
    },

    // ===== Detail Panel =====

    renderDetail() {
        // On mobile, update the bottom sheet if it's open; otherwise use the desktop panel
        if (window.innerWidth <= 768) {
            if (BottomSheet.isOpen() && this.selectedId) {
                BottomSheet.updateContent(div => this._renderDetailContent(div));
            }
            return;
        }

        const container = document.getElementById('encounter-detail');

        if (!this.selectedId) {
            container.innerHTML = `
                <div class="encounter-detail-placeholder">
                    <p>Select an entry to view details</p>
                </div>
            `;
            return;
        }

        this._renderDetailContent(container);
    },

    renderPlayerDetail(container) {
        const pc = EncounterState.getPlayerCharacter(this.selectedId);
        if (!pc) {
            container.innerHTML = '<p>Player not found</p>';
            return;
        }

        container.innerHTML = `
            <div class="encounter-detail-content">
                <div class="detail-header">
                    <h3>${this.escapeHtml(pc.name)}</h3>
                    <span class="player-badge">PLAYER CHARACTER</span>
                </div>

                <div class="player-detail-initiative">
                    <label class="filter-label">Initiative</label>
                    <input type="number" id="player-detail-initiative" class="search-input"
                           value="${pc.initiative ?? ''}" placeholder="Initiative" min="0" max="99">
                </div>

                <div class="notes-section">
                    <label class="notes-label">Notes</label>
                    <textarea id="player-notes" class="notes-textarea" placeholder="Add notes...">${pc.notes || ''}</textarea>
                </div>
            </div>
        `;

        // Bind events
        document.getElementById('player-detail-initiative')?.addEventListener('change', (e) => {
            EncounterState.setPlayerCharacterInitiative(this.selectedId, e.target.value);
            this.renderPlayerCharacterInputs();
            this.renderEncounterList();
        });

        document.getElementById('player-notes')?.addEventListener('input', (e) => {
            EncounterState.updatePlayerCharacterNotes(this.selectedId, e.target.value);
        });
    },

    renderIndividualDetail(container) {
        const individual = EncounterState.getIndividual(this.selectedId);
        if (!individual) {
            container.innerHTML = '<p>Entry not found</p>';
            return;
        }

        const threat = DataLoader.getThreat(individual.threatId);
        if (!threat) {
            container.innerHTML = '<p>Threat data not found</p>';
            return;
        }

        const isDead = EncounterState.isIndividualDead(this.selectedId);

        container.innerHTML = `
            <div class="encounter-detail-content">
                <div class="detail-header">
                    <h3>${threat.name}</h3>
                    ${individual.bonus !== 'none' ? `<span class="bonus-badge bonus-${individual.bonus}">${individual.bonus === 'elite' ? 'ELITE' : 'ADVERSARY'}</span>` : ''}
                    ${isDead ? '<span class="status-badge dead-badge">DEAD</span>' : ''}
                </div>

                <div class="wound-shock-trackers">
                    <div class="large-tracker wounds-large">
                        <div class="tracker-label">Wounds</div>
                        <div class="tracker-controls">
                            <button class="tracker-btn" id="detail-wound-minus">-</button>
                            <span class="tracker-value">${individual.currentWounds} / ${individual.maxWounds}</span>
                            <button class="tracker-btn" id="detail-wound-plus">+</button>
                        </div>
                        <div class="tracker-bar">
                            <div class="tracker-bar-fill wounds-bar" style="width: ${individual.maxWounds > 0 ? (individual.currentWounds / individual.maxWounds) * 100 : 0}%"></div>
                        </div>
                    </div>
                    <div class="large-tracker shock-large">
                        <div class="tracker-label">Shock</div>
                        <div class="tracker-controls">
                            <button class="tracker-btn" id="detail-shock-minus">-</button>
                            <span class="tracker-value">${individual.maxShock > 0 ? `${individual.currentShock} / ${individual.maxShock}` : '-'}</span>
                            <button class="tracker-btn" id="detail-shock-plus">+</button>
                        </div>
                        <div class="tracker-bar">
                            <div class="tracker-bar-fill shock-bar" style="width: ${individual.maxShock > 0 ? (individual.currentShock / individual.maxShock) * 100 : 0}%"></div>
                        </div>
                    </div>
                    ${EncounterState.threatHasChampion(threat) ? `
                    <div class="large-tracker ruin-large">
                        <div class="tracker-label ruin-label">Personal Ruin</div>
                        <div class="tracker-controls">
                            <button class="tracker-btn" id="detail-ruin-minus">-</button>
                            <span class="tracker-value">${individual.personalRuin || 0}</span>
                            <button class="tracker-btn" id="detail-ruin-plus">+</button>
                        </div>
                    </div>
                    ` : ''}
                </div>

                ${individual.mobId ? `
                    <div class="mob-membership">
                        <span>Part of: ${EncounterState.getMob(individual.mobId)?.name || 'Unknown Mob'}</span>
                        <button class="btn-secondary" id="btn-remove-from-mob">Remove from Mob</button>
                    </div>
                ` : ''}

                <div class="notes-section">
                    <label class="notes-label">Notes</label>
                    <textarea id="individual-notes" class="notes-textarea" placeholder="Add notes...">${individual.notes || ''}</textarea>
                </div>

                <div class="detail-actions">
                    <button class="btn-secondary" id="btn-duplicate-individual">Duplicate</button>
                    <button class="btn-danger" id="btn-remove-individual">Remove</button>
                </div>

                <div class="threat-card-mini">
                    ${this.renderThreatCardMini(threat, individual.additionalWeaponId || null, true)}
                </div>
            </div>
        `;

        // Bind events
        this.bindDetailEvents();
        this.bindAdditionalWeaponEvents(container);
        Glossary.enhanceDescriptions(container);
    },

    renderMobDetail(container) {
        const mob = EncounterState.getMob(this.selectedId);
        if (!mob) {
            container.innerHTML = '<p>Mob not found</p>';
            return;
        }

        const threat = DataLoader.getThreat(mob.threatId);
        const members = EncounterState.getMobMembers(this.selectedId);
        const bonus = EncounterState.getMobAttackBonus(this.selectedId);
        const compatible = EncounterState.getCompatibleIndividualsForMob(mob.threatId);

        container.innerHTML = `
            <div class="encounter-detail-content">
                <div class="detail-header">
                    <h3>${mob.name}</h3>
                    <span class="mob-badge">MOB</span>
                </div>

                <div class="mob-stats">
                    <div class="mob-stat">
                        <span class="mob-stat-label">Members</span>
                        <span class="mob-stat-value">${bonus.count} alive / ${members.length} total</span>
                    </div>
                    <div class="mob-stat">
                        <span class="mob-stat-label">Attack Bonus</span>
                        <span class="mob-stat-value">+${bonus.bonus} dice (max ${bonus.max})</span>
                    </div>
                </div>

                <p class="mob-death-note">Troops are considered dead when they exceed max Shock. Elites and Adversaries are Exhausted at max Shock.</p>

                <div class="mob-members-section">
                    <div class="mob-members-header">Members</div>
                    <div class="mob-members-list">
                        ${members.map(m => this.renderMobMemberItem(m, threat)).join('')}
                    </div>
                </div>

                ${compatible.length > 0 ? `
                    <div class="add-to-mob-section">
                        <div class="add-to-mob-header">Add Troops to Mob</div>
                        <div class="compatible-list">
                            ${compatible.map(c => `
                                <label class="compatible-item">
                                    <input type="checkbox" class="compatible-checkbox" data-id="${c.id}">
                                    <span>${threat.name} (W: ${c.currentWounds}/${c.maxWounds})</span>
                                </label>
                            `).join('')}
                        </div>
                        <button class="btn-secondary" id="btn-add-to-mob">Add Selected</button>
                    </div>
                ` : ''}

                <div class="split-mob-section">
                    <div class="split-mob-header">Split Mob</div>
                    <div class="split-controls">
                        <input type="number" id="split-count" class="split-input" placeholder="# to split" min="1" max="${bonus.count - 1}">
                        <button class="btn-secondary" id="btn-split-mob">Split</button>
                        <button class="btn-secondary" id="btn-disband-mob">Disband</button>
                    </div>
                </div>

                <div class="notes-section">
                    <label class="notes-label">Notes</label>
                    <textarea id="mob-notes" class="notes-textarea" placeholder="Add notes...">${mob.notes || ''}</textarea>
                </div>

                <div class="detail-actions">
                    <button class="btn-secondary" id="btn-duplicate-mob">Duplicate</button>
                    <button class="btn-danger" id="btn-remove-mob">Remove Mob</button>
                </div>

                ${threat ? `
                    <div class="threat-card-mini">
                        ${this.renderThreatCardMini(threat)}
                    </div>
                ` : ''}
            </div>
        `;

        // Bind events
        this.bindMobDetailEvents();
        Glossary.enhanceDescriptions(container);
    },

    renderMobMemberItem(individual, threat) {
        const isDead = EncounterState.isIndividualDead(individual.id);
        const isDeadFromWounds = individual.currentWounds >= individual.maxWounds;
        const isDeadFromShock = individual.currentShock >= individual.maxShock;

        return `
            <div class="mob-member ${isDead ? 'dead' : ''}" data-id="${individual.id}">
                <div class="member-top-row">
                    <span class="member-name">${threat?.name || 'Unknown'}</span>
                    ${isDead ? `
                        <button class="member-revive-btn" data-id="${individual.id}" title="Revive">Revive</button>
                    ` : `
                        <button class="member-kill-btn" data-id="${individual.id}" title="Mark as Dead">Kill</button>
                    `}
                    <button class="member-remove-btn" data-id="${individual.id}" title="Remove from mob">×</button>
                </div>
                <div class="member-trackers">
                    <div class="member-tracker ${isDeadFromWounds ? 'tracker-death' : ''}">
                        <span class="tracker-label-mini">W</span>
                        <button class="member-stat-btn" data-id="${individual.id}" data-stat="wounds" data-delta="-1" ${isDead ? 'disabled' : ''}>-</button>
                        <span class="tracker-value-mini">${individual.currentWounds}/${individual.maxWounds}</span>
                        <button class="member-stat-btn" data-id="${individual.id}" data-stat="wounds" data-delta="1" ${isDead ? 'disabled' : ''}>+</button>
                    </div>
                    <div class="member-tracker ${isDeadFromShock ? 'tracker-death' : ''}">
                        <span class="tracker-label-mini">S</span>
                        <button class="member-stat-btn" data-id="${individual.id}" data-stat="shock" data-delta="-1" ${isDead ? 'disabled' : ''}>-</button>
                        <span class="tracker-value-mini">${individual.currentShock}/${individual.maxShock}</span>
                        <button class="member-stat-btn" data-id="${individual.id}" data-stat="shock" data-delta="1" ${isDead ? 'disabled' : ''}>+</button>
                    </div>
                </div>
            </div>
        `;
    },

    renderThreatCardMini(threat, additionalWeaponId = null, showAdditionalWeapon = false) {
        // Full threat card for the detail panel
        const keywordsHtml = (threat.keywords || []).map(kw =>
            `<span class="threat-keyword-mini">${kw}</span>`
        ).join('');

        // Render bonuses
        const bonusesHtml = (threat.bonuses || []).map(bonus => `
            <div class="ability-mini">
                <span class="ability-type-mini">BONUS:</span>
                <span class="ability-name-mini" data-glossary-enhance>${bonus.name}</span>
                ${bonus.description ? `<div class="ability-desc-mini" data-glossary-enhance>${bonus.description}</div>` : ''}
            </div>
        `).join('');

        // Render abilities
        const abilitiesHtml = (threat.abilities || []).map(ability => {
            let statsHtml = '';

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

            return `
                <div class="ability-mini">
                    <span class="ability-type-mini">${ability.type}:</span>
                    <span class="ability-name-mini" data-glossary-enhance>${ability.name}</span>
                    ${statsHtml ? `<span class="ability-stats-mini" data-glossary-enhance>${statsHtml}</span>` : ''}
                    ${ability.description ? `<div class="ability-desc-mini" data-glossary-enhance>${ability.description}</div>` : ''}
                </div>
            `;
        }).join('');

        // Format attributes
        const attrs = threat.attributes || {};
        const attributesHtml = `
            <div class="mini-attributes">
                <span class="mini-attr"><b>Str:</b> ${attrs.S ?? '-'}</span>
                <span class="mini-attr"><b>Tou:</b> ${attrs.T ?? '-'}</span>
                <span class="mini-attr"><b>Agi:</b> ${attrs.A ?? '-'}</span>
                <span class="mini-attr"><b>Ini:</b> ${attrs.I ?? '-'}</span>
                <span class="mini-attr"><b>Wil:</b> ${attrs.Wil ?? '-'}</span>
                <span class="mini-attr"><b>Int:</b> ${attrs.Int ?? '-'}</span>
                <span class="mini-attr"><b>Fel:</b> ${attrs.Fel ?? '-'}</span>
            </div>
        `;

        // Format resilience with note
        const resilienceText = threat.resilience?.value || '-';
        const resilienceNote = threat.resilience?.note ? ` (${threat.resilience.note})` : '';

        // Format defence with note
        const defenceText = threat.defence || '-';
        const defenceNote = threat.defenceNote ? ` (${threat.defenceNote})` : '';

        // Format speed with note
        const speedText = threat.speed || '-';
        const speedNote = threat.speedNote ? ` (${threat.speedNote})` : '';

        return `
            <div class="mini-card">
                <div class="mini-card-header">Threat Stats</div>
                <div class="mini-card-body">
                    <div class="mini-keywords">
                        ${keywordsHtml}
                    </div>

                    ${attributesHtml}

                    <div class="mini-stats-grid">
                        <div class="mini-stat-box">
                            <span class="stat-box-label">Defence</span>
                            <span class="stat-box-value">${defenceText}${defenceNote}</span>
                        </div>
                        <div class="mini-stat-box">
                            <span class="stat-box-label">Resilience</span>
                            <span class="stat-box-value">${resilienceText}${resilienceNote}</span>
                        </div>
                        <div class="mini-stat-box">
                            <span class="stat-box-label">Wounds</span>
                            <span class="stat-box-value">${threat.wounds || '-'}</span>
                        </div>
                        <div class="mini-stat-box">
                            <span class="stat-box-label">Shock</span>
                            <span class="stat-box-value">${threat.shock || '-'}</span>
                        </div>
                        <div class="mini-stat-box">
                            <span class="stat-box-label">Speed</span>
                            <span class="stat-box-value">${speedText}${speedNote}</span>
                        </div>
                        <div class="mini-stat-box">
                            <span class="stat-box-label">Size</span>
                            <span class="stat-box-value">${threat.size || '-'}</span>
                        </div>
                        <div class="mini-stat-box">
                            <span class="stat-box-label">Conviction</span>
                            <span class="stat-box-value">${threat.conviction ?? '-'}</span>
                        </div>
                        <div class="mini-stat-box">
                            <span class="stat-box-label">Resolve</span>
                            <span class="stat-box-value">${threat.resolve ?? '-'}</span>
                        </div>
                    </div>

                    ${threat.skills ? `
                        <div class="mini-section">
                            <span class="mini-section-label">Skills:</span>
                            <span class="mini-section-value" data-glossary-enhance>${threat.skills}</span>
                        </div>
                    ` : ''}

                    ${bonusesHtml ? `
                        <div class="mini-section">
                            <div class="mini-section-label">Bonuses</div>
                            <div class="mini-abilities">${bonusesHtml}</div>
                        </div>
                    ` : ''}

                    <div class="mini-section">
                        <div class="mini-section-label">Abilities</div>
                        <div class="mini-abilities">${abilitiesHtml}</div>
                    </div>

                    ${showAdditionalWeapon ? this.renderAdditionalWeaponSection(additionalWeaponId) : ''}

                    ${threat.determination ? `
                        <div class="mini-section">
                            <span class="mini-section-label">Determination:</span>
                            <span class="mini-section-value" data-glossary-enhance>${threat.determination}</span>
                        </div>
                    ` : ''}

                    ${threat.mobOptions ? `
                        <div class="mini-section">
                            <span class="mini-section-label">Mob Options:</span>
                            <span class="mini-section-value" data-glossary-enhance>${threat.mobOptions}</span>
                        </div>
                    ` : ''}

                    ${threat.mobAbilities ? `
                        <div class="mini-section">
                            <span class="mini-section-label">Mob Abilities:</span>
                            <span class="mini-section-value" data-glossary-enhance>${threat.mobAbilities}</span>
                        </div>
                    ` : ''}

                    ${threat.threatOptions ? `
                        <div class="mini-section">
                            <span class="mini-section-label">Threat Options:</span>
                            <span class="mini-section-value" data-glossary-enhance>${threat.threatOptions}</span>
                        </div>
                    ` : ''}

                    ${threat.biomorphs ? `
                        <div class="mini-section">
                            <span class="mini-section-label">Biomorphs:</span>
                            <span class="mini-section-value" data-glossary-enhance>${threat.biomorphs}</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    },

    formatWeaponStats(weapon) {
        // Combine damage + ED into one part, then separate AP/range/salvo with /
        let damagePart = '';
        if (weapon.damage !== undefined) damagePart = `${weapon.damage}`;
        if (weapon.ed !== undefined) damagePart += ` +${weapon.ed} ED`;
        damagePart = damagePart.trim();

        const parts = [];
        if (damagePart) parts.push(damagePart);
        if (weapon.ap !== undefined && weapon.ap !== 0) parts.push(`AP ${weapon.ap}`);
        if (weapon.range) parts.push(`Range ${weapon.range}`);
        if (weapon.salvo) parts.push(`Salvo ${weapon.salvo}`);

        let result = parts.join(' / ');
        if (weapon.traits && weapon.traits.length > 0) {
            result += ` [${weapon.traits.join(', ')}]`;
        }
        return result;
    },

    renderAdditionalWeaponSection(currentCompositeId) {
        let contentHtml = '';
        if (currentCompositeId) {
            const weapon = DataLoader.resolveWeaponOverride(currentCompositeId);
            if (weapon) {
                // Build structured stats display
                let damagePart = '';
                if (weapon.damage !== undefined) damagePart = `${weapon.damage}`;
                if (weapon.ed !== undefined) damagePart += ` +${weapon.ed} ED`;
                damagePart = damagePart.trim();

                const statItems = [];
                if (damagePart) statItems.push(`<span class="addwpn-stat"><span class="addwpn-stat-label">Damage</span> ${damagePart}</span>`);
                if (weapon.ap !== undefined && weapon.ap !== 0) statItems.push(`<span class="addwpn-stat"><span class="addwpn-stat-label">AP</span> ${weapon.ap}</span>`);
                if (weapon.range) statItems.push(`<span class="addwpn-stat"><span class="addwpn-stat-label">Range</span> ${weapon.range}</span>`);
                if (weapon.salvo) statItems.push(`<span class="addwpn-stat"><span class="addwpn-stat-label">Salvo</span> ${weapon.salvo}</span>`);

                const traitsHtml = (weapon.traits && weapon.traits.length > 0)
                    ? `<div class="addwpn-traits" data-glossary-enhance>${weapon.traits.join(', ')}</div>`
                    : '';

                contentHtml = `
                    <div class="additional-weapon-info">
                        <div class="additional-weapon-name">${this.escapeHtml(weapon.name)}</div>
                        <div class="addwpn-stats-row">${statItems.join('<span class="addwpn-divider">/</span>')}</div>
                        ${traitsHtml}
                    </div>
                    <div class="additional-weapon-actions">
                        <button class="btn-secondary btn-change-weapon">Change</button>
                        <button class="btn-danger btn-remove-weapon">Remove</button>
                    </div>
                `;
            } else {
                contentHtml = `
                    <div class="additional-weapon-info">
                        <div class="additional-weapon-name" style="color: var(--text-muted)">Unknown weapon</div>
                    </div>
                    <div class="additional-weapon-actions">
                        <button class="btn-secondary btn-change-weapon">Change</button>
                        <button class="btn-danger btn-remove-weapon">Remove</button>
                    </div>
                `;
            }
        } else {
            contentHtml = `
                <button class="btn-secondary btn-select-weapon">Select Weapon</button>
            `;
        }

        return `
            <div class="additional-weapon-section">
                <div class="additional-weapon-label">Additional Weapon</div>
                ${contentHtml}
            </div>
        `;
    },

    bindDetailEvents() {
        const id = this.selectedId;

        // Wound buttons
        document.getElementById('detail-wound-minus')?.addEventListener('click', () => {
            EncounterState.updateWounds(id, -1);
            this.renderEncounterList();
            this.renderDetail();
        });

        document.getElementById('detail-wound-plus')?.addEventListener('click', () => {
            EncounterState.updateWounds(id, 1);
            this.renderEncounterList();
            this.renderDetail();
        });

        // Shock buttons
        document.getElementById('detail-shock-minus')?.addEventListener('click', () => {
            EncounterState.updateShock(id, -1);
            this.renderEncounterList();
            this.renderDetail();
        });

        document.getElementById('detail-shock-plus')?.addEventListener('click', () => {
            EncounterState.updateShock(id, 1);
            this.renderEncounterList();
            this.renderDetail();
        });

        // Personal Ruin buttons
        document.getElementById('detail-ruin-minus')?.addEventListener('click', () => {
            EncounterState.updatePersonalRuin(id, -1);
            this.renderEncounterList();
            this.renderDetail();
        });

        document.getElementById('detail-ruin-plus')?.addEventListener('click', () => {
            EncounterState.updatePersonalRuin(id, 1);
            this.renderEncounterList();
            this.renderDetail();
        });

        // Notes
        document.getElementById('individual-notes')?.addEventListener('input', (e) => {
            EncounterState.updateIndividualNotes(id, e.target.value);
        });

        // Remove from mob
        document.getElementById('btn-remove-from-mob')?.addEventListener('click', () => {
            EncounterState.removeFromMob(id);
            this.renderEncounterList();
            this.renderDetail();
        });

        // Duplicate
        document.getElementById('btn-duplicate-individual')?.addEventListener('click', () => {
            const newId = EncounterState.duplicateIndividual(id);
            if (newId) {
                this.selectItem(newId, 'individual');
            }
        });

        // Remove
        document.getElementById('btn-remove-individual')?.addEventListener('click', () => {
            EncounterState.removeIndividual(id);
            this.selectedId = null;
            this.selectionType = null;
            this.renderEncounterList();
            this.renderDetail();
        });
    },

    bindAdditionalWeaponEvents(container) {
        const selectBtn = container.querySelector('.btn-select-weapon');
        const changeBtn = container.querySelector('.btn-change-weapon');
        const removeBtn = container.querySelector('.btn-remove-weapon');

        if (selectBtn) {
            selectBtn.addEventListener('click', () => {
                this.openWeaponPickerModal();
            });
        }
        if (changeBtn) {
            changeBtn.addEventListener('click', () => {
                this.openWeaponPickerModal();
            });
        }
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                EncounterState.setAdditionalWeapon(this.selectedId, null);
                this.renderDetail();
            });
        }
    },

    // ===== Weapon Picker Modal =====

    openWeaponPickerModal() {
        // Remove any existing modal
        const existing = document.querySelector('.weapon-picker-modal');
        if (existing) existing.remove();

        this._weaponPickerFilters = { search: '', type: 'all', faction: 'all' };

        const factions = ['All', 'Imperium', 'Aeldari', 'Ork', 'Drukhari', 'Necron', 'Chaos', "T'au"];

        const modal = document.createElement('div');
        modal.className = 'weapon-picker-modal';
        modal.innerHTML = `
            <div class="weapon-picker-content">
                <div class="weapon-picker-header">
                    <h3>Select Weapon</h3>
                    <button class="weapon-picker-close">&times;</button>
                </div>
                <div class="weapon-picker-controls">
                    <input type="text" class="weapon-picker-search" placeholder="Search weapons...">
                    <div class="weapon-picker-filter-row">
                        <span class="weapon-picker-filter-label">Type</span>
                        <div class="weapon-picker-filter-group" id="weapon-type-filters">
                            <button class="weapon-picker-filter-btn active" data-type="all">All</button>
                            <button class="weapon-picker-filter-btn" data-type="melee">Melee</button>
                            <button class="weapon-picker-filter-btn" data-type="ranged">Ranged</button>
                            <button class="weapon-picker-filter-btn" data-type="grenade">Grenades & Missiles</button>
                        </div>
                    </div>
                    <div class="weapon-picker-filter-row">
                        <span class="weapon-picker-filter-label">Faction</span>
                        <div class="weapon-picker-filter-group" id="weapon-faction-filters">
                            ${factions.map(f => `<button class="weapon-picker-filter-btn${f === 'All' ? ' active' : ''}" data-faction="${f === 'All' ? 'all' : f}">${this.escapeHtml(f)}</button>`).join('')}
                        </div>
                    </div>
                </div>
                <div class="weapon-picker-list" id="weapon-picker-list">
                </div>
                <div class="weapon-picker-footer">
                    <span class="weapon-picker-count" id="weapon-picker-count"></span>
                </div>
            </div>
        `;

        // Insert inside #app for proper stacking context
        document.getElementById('app').appendChild(modal);
        this.renderWeaponPickerList();
        this.bindWeaponPickerEvents(modal);
        modal.querySelector('.weapon-picker-search').focus();
    },

    closeWeaponPickerModal() {
        const modal = document.querySelector('.weapon-picker-modal');
        if (modal) modal.remove();
        if (this._weaponPickerEscHandler) {
            document.removeEventListener('keydown', this._weaponPickerEscHandler);
            this._weaponPickerEscHandler = null;
        }
    },

    renderWeaponPickerList() {
        const listEl = document.getElementById('weapon-picker-list');
        const countEl = document.getElementById('weapon-picker-count');
        if (!listEl) return;

        const weapons = DataLoader.getFilteredWeapons(this._weaponPickerFilters);
        countEl.textContent = `${weapons.length} weapon${weapons.length !== 1 ? 's' : ''}`;

        if (weapons.length === 0) {
            listEl.innerHTML = '<div class="weapon-picker-empty">No weapons match your filters</div>';
            return;
        }

        listEl.innerHTML = weapons.map(w => this.renderWeaponPickerCard(w)).join('');
    },

    renderWeaponPickerCard(weapon) {
        // Type description
        const typeStr = weapon.category
            ? `${weapon.type === 'melee' ? 'Melee' : 'Ranged'} — ${weapon.category}`
            : (weapon.type === 'melee' ? 'Melee' : 'Ranged');

        // Build stats line — combine damage + ED into one part
        const statParts = [];
        const dmg = weapon.damage || {};
        let damagePart = '';
        if (weapon.type === 'melee' && dmg.attribute) {
            const attrInitial = dmg.attribute.charAt(0).toUpperCase();
            const base = (dmg.base || 0) + (dmg.bonus || 0);
            damagePart = `${attrInitial}+${base}`;
        } else {
            const flat = (dmg.base || 0) + (dmg.bonus || 0);
            damagePart = `${flat}`;
        }
        damagePart += ` +${weapon.ed ?? 0} ED`;
        statParts.push(damagePart);
        if (weapon.ap && weapon.ap !== 0) statParts.push(`AP ${weapon.ap}`);
        if (weapon.range && typeof weapon.range === 'object') {
            statParts.push(`Range ${weapon.range.short}/${weapon.range.medium}/${weapon.range.long}`);
        } else if (weapon.range) {
            statParts.push(`Range ${weapon.range}`);
        }
        if (weapon.salvo != null) statParts.push(`Salvo ${weapon.salvo}`);

        // Traits
        const traitsHtml = (weapon.traits && weapon.traits.length > 0)
            ? `<div class="wpcard-traits">${weapon.traits.join(', ')}</div>`
            : '';

        // Keywords
        const keywordsHtml = (weapon.keywords && weapon.keywords.length > 0)
            ? `<div class="wpcard-keywords">${weapon.keywords.map(k => `<span class="wpcard-keyword">${this.escapeHtml(k)}</span>`).join('')}</div>`
            : '';

        // Launcher indicator
        const isLauncher = DataLoader.isLauncherWeapon(weapon);
        const launcherHtml = isLauncher
            ? `<div class="wpcard-launcher-hint">Select to choose ammo type &rarr;</div>`
            : '';

        return `
            <div class="weapon-picker-card${isLauncher ? ' wpcard-launcher' : ''}" data-weapon-id="${weapon.id}">
                <div class="wpcard-header">
                    <span class="wpcard-name">${this.escapeHtml(weapon.name)}</span>
                    <span class="wpcard-type">${this.escapeHtml(typeStr)}</span>
                </div>
                <div class="wpcard-stats">${statParts.join(' / ')}</div>
                ${traitsHtml}
                ${keywordsHtml}
                ${launcherHtml}
            </div>
        `;
    },

    bindWeaponPickerEvents(modal) {
        const tab = this;

        // Close button
        modal.querySelector('.weapon-picker-close').addEventListener('click', () => {
            tab.closeWeaponPickerModal();
        });

        // Backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                tab.closeWeaponPickerModal();
            }
        });

        // Escape key
        this._weaponPickerEscHandler = (e) => {
            if (e.key === 'Escape') {
                tab.closeWeaponPickerModal();
            }
        };
        document.addEventListener('keydown', this._weaponPickerEscHandler);

        // Search input with debounce
        let searchTimer = null;
        modal.querySelector('.weapon-picker-search').addEventListener('input', (e) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                tab._weaponPickerFilters.search = e.target.value;
                tab.renderWeaponPickerList();
            }, 200);
        });

        // Type filter buttons
        document.getElementById('weapon-type-filters').addEventListener('click', (e) => {
            const btn = e.target.closest('.weapon-picker-filter-btn');
            if (!btn) return;
            document.querySelectorAll('#weapon-type-filters .weapon-picker-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tab._weaponPickerFilters.type = btn.dataset.type;
            tab.renderWeaponPickerList();
        });

        // Faction filter buttons
        document.getElementById('weapon-faction-filters').addEventListener('click', (e) => {
            const btn = e.target.closest('.weapon-picker-filter-btn');
            if (!btn) return;
            document.querySelectorAll('#weapon-faction-filters .weapon-picker-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            tab._weaponPickerFilters.faction = btn.dataset.faction;
            tab.renderWeaponPickerList();
        });

        // Card click — event delegation on the list
        document.getElementById('weapon-picker-list').addEventListener('click', (e) => {
            const card = e.target.closest('.weapon-picker-card');
            if (!card) return;
            const weaponId = card.dataset.weaponId;

            // Check if this is a launcher weapon that needs ammo selection
            const weapon = DataLoader.getWeapon(weaponId);
            if (weapon && DataLoader.isLauncherWeapon(weapon)) {
                tab.showAmmoSelection(weaponId);
                return;
            }

            EncounterState.setAdditionalWeapon(tab.selectedId, weaponId);
            tab.closeWeaponPickerModal();
            tab.renderDetail();
        });
    },

    // Show ammo selection sub-step for launcher weapons
    showAmmoSelection(launcherId) {
        const launcher = DataLoader.getWeapon(launcherId);
        if (!launcher) return;

        this._ammoSearchFilter = '';

        const content = document.querySelector('.weapon-picker-content');
        if (!content) return;

        // Replace modal content with ammo selection
        content.innerHTML = `
            <div class="weapon-picker-header">
                <h3>Select Ammo for ${this.escapeHtml(launcher.name)}</h3>
                <button class="weapon-picker-close">&times;</button>
            </div>
            <div class="weapon-picker-controls">
                <button class="btn-secondary ammo-back-btn" style="margin-bottom: 8px; font-size: 11px;">&larr; Back to weapons</button>
                <input type="text" class="weapon-picker-search ammo-search" placeholder="Search ammo...">
                <div class="ammo-skip-row">
                    <span class="ammo-skip-text">Or use the launcher without specific ammo:</span>
                    <button class="btn-secondary ammo-skip-btn">Use without ammo</button>
                </div>
            </div>
            <div class="weapon-picker-list" id="ammo-picker-list">
            </div>
            <div class="weapon-picker-footer">
                <span class="weapon-picker-count" id="ammo-picker-count"></span>
            </div>
        `;

        this.renderAmmoList(launcherId);
        this.bindAmmoSelectionEvents(content, launcherId);
        content.querySelector('.ammo-search').focus();
    },

    renderAmmoList(launcherId) {
        const listEl = document.getElementById('ammo-picker-list');
        const countEl = document.getElementById('ammo-picker-count');
        if (!listEl) return;

        const launcher = DataLoader.getWeapon(launcherId);
        const ammo = DataLoader.getAvailableAmmo({ search: this._ammoSearchFilter, launcherType: launcher?.category });
        countEl.textContent = `${ammo.length} ammo type${ammo.length !== 1 ? 's' : ''}`;

        if (ammo.length === 0) {
            listEl.innerHTML = '<div class="weapon-picker-empty">No ammo types match your search</div>';
            return;
        }

        listEl.innerHTML = ammo.map(w => this.renderWeaponPickerCard(w)).join('');
    },

    bindAmmoSelectionEvents(content, launcherId) {
        const tab = this;

        // Close button
        content.querySelector('.weapon-picker-close').addEventListener('click', () => {
            tab.closeWeaponPickerModal();
        });

        // Back button
        content.querySelector('.ammo-back-btn').addEventListener('click', () => {
            tab.closeWeaponPickerModal();
            tab.openWeaponPickerModal();
        });

        // Skip button — use launcher without ammo
        content.querySelector('.ammo-skip-btn').addEventListener('click', () => {
            EncounterState.setAdditionalWeapon(tab.selectedId, launcherId);
            tab.closeWeaponPickerModal();
            tab.renderDetail();
        });

        // Ammo search with debounce
        let searchTimer = null;
        content.querySelector('.ammo-search').addEventListener('input', (e) => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                tab._ammoSearchFilter = e.target.value;
                tab.renderAmmoList(launcherId);
            }, 200);
        });

        // Ammo card click
        document.getElementById('ammo-picker-list').addEventListener('click', (e) => {
            const card = e.target.closest('.weapon-picker-card');
            if (!card) return;
            const ammoId = card.dataset.weaponId;
            const compositeId = `${launcherId}+${ammoId}`;
            EncounterState.setAdditionalWeapon(tab.selectedId, compositeId);
            tab.closeWeaponPickerModal();
            tab.renderDetail();
        });
    },

    bindMobDetailEvents() {
        const mobId = this.selectedId;

        // Member stat buttons (wounds and shock)
        document.querySelectorAll('.member-stat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const stat = btn.dataset.stat;
                const delta = parseInt(btn.dataset.delta);
                if (stat === 'wounds') {
                    EncounterState.updateWounds(id, delta);
                } else if (stat === 'shock') {
                    EncounterState.updateShock(id, delta);
                }
                this.renderEncounterList();
                this.renderDetail();
            });
        });

        // Member kill buttons
        document.querySelectorAll('.member-kill-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                EncounterState.markAsDead(id);
                this.renderEncounterList();
                this.renderDetail();
            });
        });

        // Member revive buttons
        document.querySelectorAll('.member-revive-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                EncounterState.reviveIndividual(id);
                this.renderEncounterList();
                this.renderDetail();
            });
        });

        // Member remove buttons
        document.querySelectorAll('.member-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                EncounterState.removeFromMob(id);
                this.renderEncounterList();
                this.renderDetail();
            });
        });

        // Add to mob
        document.getElementById('btn-add-to-mob')?.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('.compatible-checkbox:checked');
            const ids = Array.from(checkboxes).map(cb => cb.dataset.id);
            if (ids.length > 0) {
                EncounterState.addToMob(mobId, ids);
                this.renderEncounterList();
                this.renderDetail();
            }
        });

        // Split mob - splits off N members into a new mob
        document.getElementById('btn-split-mob')?.addEventListener('click', () => {
            const input = document.getElementById('split-count');
            const splitCount = parseInt(input.value);
            const living = EncounterState.getMobLivingMembers(mobId).length;

            if (isNaN(splitCount) || splitCount < 1 || splitCount >= living) {
                return; // Invalid split count
            }

            // Split off the specified number into a new mob
            const newMobId = EncounterState.splitOffFromMob(mobId, splitCount);

            if (newMobId) {
                // Select the new mob
                this.selectItem(newMobId, 'mob');
            } else {
                this.renderEncounterList();
                this.renderDetail();
            }
        });

        document.getElementById('btn-disband-mob')?.addEventListener('click', () => {
            EncounterState.disbandMob(mobId);
            this.selectedId = null;
            this.selectionType = null;
            this.renderEncounterList();
            this.renderDetail();
        });

        // Notes
        document.getElementById('mob-notes')?.addEventListener('input', (e) => {
            EncounterState.updateMobNotes(mobId, e.target.value);
        });

        // Duplicate mob
        document.getElementById('btn-duplicate-mob')?.addEventListener('click', () => {
            const newMobId = EncounterState.duplicateMob(mobId);
            if (newMobId) {
                this.selectItem(newMobId, 'mob');
            }
        });

        // Remove mob
        document.getElementById('btn-remove-mob')?.addEventListener('click', () => {
            EncounterState.removeMob(mobId);
            this.selectedId = null;
            this.selectionType = null;
            this.renderEncounterList();
            this.renderDetail();
        });
    },

    // ===== Event Handlers =====

    handleDelete(id, type) {
        if (type === 'individual') {
            EncounterState.removeIndividual(id);
        } else if (type === 'mob') {
            EncounterState.removeMob(id);
        }
        if (this.selectedId === id) {
            this.selectedId = null;
            this.selectionType = null;
        }
        this.multiSelectedIds.delete(id);
        this.renderEncounterList();
        this.renderDetail();
    },

    handleDuplicate(id, type) {
        if (type === 'individual') {
            const newId = EncounterState.duplicateIndividual(id);
            if (newId) {
                this.selectItem(newId, 'individual');
            }
        } else if (type === 'mob') {
            const newMobId = EncounterState.duplicateMob(id);
            if (newMobId) {
                this.selectItem(newMobId, 'mob');
            }
        }
        this.renderEncounterList();
    },

    async handleSave() {
        const result = await EncounterState.saveEncounterToFile();

        if (result.success) {
            this.showNotification(`Encounter saved to file!`);
            this.renderSettings(); // Update name field with filename
        } else if (result.error) {
            this.showNotification(`Error saving: ${result.error}`);
        }
        // If canceled, do nothing
    },

    async handleLoad() {
        const result = await EncounterState.loadEncounterFromFile();

        if (result.success) {
            this.selectedId = null;
            this.selectionType = null;
            this.render();
            this.showNotification(`Encounter "${result.fileName}" loaded!`);
        } else if (result.error) {
            this.showNotification(`Error loading: ${result.error}`);
        }
        // If canceled, do nothing
    },

    showNotification(message) {
        // Remove any existing notification
        const existing = document.querySelector('.encounter-notification');
        if (existing) existing.remove();

        // Create notification
        const notification = document.createElement('div');
        notification.className = 'encounter-notification';
        notification.textContent = message;
        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => notification.classList.add('show'), 10);

        // Remove after 2 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 2000);
    },

    handleClear() {
        if (confirm('Clear current encounter? This cannot be undone.')) {
            EncounterState.clearEncounter();
            this.selectedId = null;
            this.selectionType = null;
            this.render();
        }
    },

    handleSortByInitiative() {
        EncounterState.clearEncounterOrder();
        this.renderEncounterList();
        this.showNotification('Sorted by initiative');
    },

    async handleImportThreat() {
        const result = await window.api.loadThreatFile();
        if (!result.success) {
            if (result.error && result.error !== 'Cancelled') {
                this.showNotification('Error: ' + result.error);
            }
            return;
        }

        const threat = result.data;
        if (!threat) {
            this.showNotification('Error: Invalid threat file');
            return;
        }

        // Ensure valid custom ID
        if (!threat.id || !threat.id.startsWith('custom_')) {
            threat.id = 'custom_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        }

        // Inject into DataLoader and add to encounter
        DataLoader.injectThreat(threat);
        App.updateThreatCount();
        EncounterState.addIndividual(threat.id, 1, false);

        this.render();
        this.showNotification(`"${threat.name || 'Unnamed Threat'}" imported to encounter!`);
    },

    async handleSavePlayers() {
        const playerData = {
            version: 1,
            playerCount: EncounterState.settings.playerCount,
            players: EncounterState.playerCharacters.map(pc => ({
                name: pc.name,
                notes: pc.notes || ''
            }))
        };

        const result = await window.api.savePlayersFile(playerData);

        if (result.success) {
            this.showNotification('Player list saved!');
        } else if (result.error) {
            this.showNotification(`Error saving: ${result.error}`);
        }
    },

    async handleLoadPlayers() {
        const result = await window.api.loadPlayersFile();

        if (result.success && result.data) {
            const data = result.data;

            // Update player count
            if (data.playerCount) {
                EncounterState.updateSettings({ playerCount: data.playerCount });
                document.getElementById('encounter-players').value = data.playerCount;
            }

            // Clear existing player characters
            EncounterState.playerCharacters = [];

            // Add loaded players
            if (data.players && Array.isArray(data.players)) {
                data.players.forEach(p => {
                    const id = EncounterState.addPlayerCharacter(p.name || 'Player');
                    if (id && p.notes) {
                        EncounterState.updatePlayerCharacterNotes(id, p.notes);
                    }
                });
            }

            this.renderPlayerCharacterInputs();
            this.renderEncounterList();
            this.showNotification(`Loaded ${data.players?.length || 0} players`);
        } else if (result.error) {
            this.showNotification(`Error loading: ${result.error}`);
        }
    }
};
