// Followers Tab - pick threats from the bestiary dataset as companions or mobs

const FollowersTab = {
    // keyword is free text, not a fixed choice: the dataset has 215 distinct keywords, which
    // is far too many for a dropdown.
    _filters: { search: '', role: 'all', size: 'all', keyword: '' },
    _loading: false,

    // No threat fetch here. threats.json is 2.64 MB, so it loads the first time the
    // section is opened, not at startup.
    init() {
        this.updateSidebarCount(State.getCharacter());
    },

    refresh() {
        this.render();
    },

    // The section is the only place that triggers the threat fetch.
    async render() {
        const container = document.getElementById('section-followers');
        if (!container) return;

        if (!DataLoader.areThreatsLoaded()) {
            if (!this._loading) {
                this._loading = true;
                container.innerHTML = '<h2>Followers</h2><p class="section-desc">Loading threat data…</p>';
                await DataLoader.ensureThreatsLoaded();
                this._loading = false;
            } else {
                return;
            }
        }

        const character = State.getCharacter();
        container.innerHTML = `
            <h2>Followers</h2>
            <p class="section-desc">Companions, minions and mobs. Followers cost no XP; the Talents that grant them do. Pick any Threat — the list is not restricted.</p>
            ${this.renderRoster(character)}
            ${this.renderPicker(character)}
        `;
        this.bindEvents();
        this.updateSidebarCount(character);
    },

    updateSidebarCount(character) {
        const el = document.getElementById('sidebar-followers-count');
        if (!el) return;
        const n = (character.followers || []).length;
        el.textContent = n ? `${n} follower${n === 1 ? '' : 's'}` : '';
    },

    renderRoster(character) {
        const followers = character.followers || [];
        if (followers.length === 0) {
            return '<p class="section-desc"><em>No followers yet. Choose a Threat below.</em></p>';
        }
        return `<div class="followers-roster">${followers.map(f => this.renderRosterItem(f, character)).join('')}</div>`;
    },

    renderRosterItem(follower, character) {
        const threat = DataLoader.getThreat(follower.threatId);
        const threatName = threat ? threat.name : follower.threatId;
        const isMob = follower.kind === 'mob';
        const bonus = isMob ? Followers.mobAttackBonus(follower.livingCount) : 0;
        return `
            <div class="follower-item" data-follower-id="${follower.id}">
                <div class="follower-item-header">
                    <input type="text" class="follower-name" value="${this.escapeHtml(follower.name)}"
                           placeholder="${this.escapeHtml(threatName)}" data-field="name">
                    <span class="follower-threat-name">${this.escapeHtml(threatName)}</span>
                    <button class="btn-remove follower-remove" title="Remove follower">&times;</button>
                </div>
                <div class="follower-item-controls">
                    <label><input type="radio" name="kind-${follower.id}" value="individual" data-field="kind" ${!isMob ? 'checked' : ''}> Individual</label>
                    <label><input type="radio" name="kind-${follower.id}" value="mob" data-field="kind" ${isMob ? 'checked' : ''}> Mob</label>
                    ${isMob ? `
                        <label>Members <input type="number" class="follower-count" min="1" value="${follower.count}" data-field="count"></label>
                        <label>Living <input type="number" class="follower-living" min="0" max="${follower.count}" value="${follower.livingCount}" data-field="livingCount"></label>
                        <span class="follower-mob-bonus">Mob attack bonus: +${bonus}</span>
                    ` : ''}
                </div>
                <div class="follower-item-controls">
                    <label title="Attributes and Skills become 1 + Double Rank, and neither can exceed your own. Granted by Devotees (core p132), Companion and Companion (Elite) (apocrypha p234), and Familiar (apocrypha p236). Animal Companion and the Arbites Cyber Mastiff use the printed statblock instead.">
                        <input type="checkbox" data-field="useAlternativeStats" ${follower.useAlternativeStats ? 'checked' : ''}>
                        Alternative stats (1 + Double Rank)
                    </label>
                </div>
                <textarea class="follower-notes" placeholder="Notes" data-field="notes">${this.escapeHtml(follower.notes)}</textarea>
            </div>
        `;
    },

    renderPicker(character) {
        const threats = this.filteredThreats(character);
        const rows = threats.slice(0, 200).map(t => `
            <div class="follower-pick-row">
                <span class="follower-pick-name">${this.escapeHtml(t.name)}</span>
                <span class="follower-pick-meta">${this.roleAtTier(t, character.tier)} &middot; ${this.escapeHtml(t.size || '-')}</span>
                <button class="btn-add follower-add" data-threat-id="${t.id}">Add</button>
            </div>
        `).join('');
        const truncated = threats.length > 200
            ? `<p class="section-desc"><em>Showing the first 200 of ${threats.length} matches. Narrow the search to see more.</em></p>`
            : '';
        return `
            <h3>Add a Follower</h3>
            <div class="follower-filters">
                <input type="text" id="follower-search" placeholder="Search threats…" value="${this.escapeHtml(this._filters.search)}">
                <input type="text" id="follower-keyword" placeholder="Filter by keyword…" value="${this.escapeHtml(this._filters.keyword)}">
                <select id="follower-role">
                    <option value="all">Any role</option>
                    <option value="T">Troop at your Tier</option>
                    <option value="E">Elite at your Tier</option>
                    <option value="A">Adversary at your Tier</option>
                    <option value="MC">Monstrous Creature at your Tier</option>
                    <option value="M">Monster at your Tier</option>
                </select>
                <select id="follower-size">
                    <option value="all">Any size</option>
                    ${this.sizeOptions().map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
            </div>
            ${truncated}
            <div class="follower-pick-list">${rows || '<p class="section-desc"><em>No threats match.</em></p>'}</div>
        `;
    },

    // Role letter for the character's tier, from the threat's tierThreat table. A "-" means
    // the book gives the threat no role at that tier, which reads better spelled out.
    roleAtTier(threat, tier) {
        const key = String(tier || 1);
        const letter = threat.tierThreat && threat.tierThreat[key];
        return this.ROLE_LABELS[letter] || 'Not at this Tier';
    },

    ROLE_LABELS: { T: 'Troop', E: 'Elite', A: 'Adversary', MC: 'Monstrous Creature', M: 'Monster' },

    sizeOptions() {
        const sizes = new Set();
        for (const t of DataLoader.getAllThreats()) {
            if (t.size) sizes.add(t.size);
        }
        return [...sizes].sort();
    },

    filteredThreats(character) {
        const { search, role, size, keyword } = this._filters;
        const needle = search.trim().toLowerCase();
        // Substring, not equality: "cult" must find GENESTEALER CULT and CULT MECHANICUS.
        const keywordNeedle = keyword.trim().toLowerCase();
        const tierKey = String(character.tier || 1);
        return DataLoader.getAllThreats().filter(t => {
            if (needle && !t.name.toLowerCase().includes(needle)) return false;
            if (keywordNeedle && !(t.keywords || []).some(kw => kw.toLowerCase().includes(keywordNeedle))) return false;
            if (role !== 'all' && (!t.tierThreat || t.tierThreat[tierKey] !== role)) return false;
            if (size !== 'all' && t.size !== size) return false;
            return true;
        });
    },

    bindEvents() {
        const container = document.getElementById('section-followers');
        if (!container) return;

        const search = container.querySelector('#follower-search');
        if (search) {
            search.addEventListener('input', e => {
                this._filters.search = e.target.value;
                this.render();
                const again = document.getElementById('follower-search');
                if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
            });
        }

        const keyword = container.querySelector('#follower-keyword');
        if (keyword) {
            keyword.addEventListener('input', e => {
                this._filters.keyword = e.target.value;
                this.render();
                const again = document.getElementById('follower-keyword');
                if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
            });
        }

        const role = container.querySelector('#follower-role');
        if (role) {
            role.value = this._filters.role;
            role.addEventListener('change', e => { this._filters.role = e.target.value; this.render(); });
        }

        const size = container.querySelector('#follower-size');
        if (size) {
            size.value = this._filters.size;
            size.addEventListener('change', e => { this._filters.size = e.target.value; this.render(); });
        }

        container.querySelectorAll('.follower-add').forEach(btn => {
            btn.addEventListener('click', () => {
                State.addFollower(btn.dataset.threatId);
                this.render();
            });
        });

        container.querySelectorAll('.follower-item').forEach(item => {
            const id = item.dataset.followerId;

            item.querySelector('.follower-remove').addEventListener('click', () => {
                State.removeFollower(id);
                this.render();
            });

            item.querySelectorAll('[data-field]').forEach(input => {
                const field = input.dataset.field;
                // Number fields commit on change, not on every keystroke: they re-render the
                // section, which would destroy the field halfway through a two-digit entry.
                const evt = (input.type === 'text' || input.tagName === 'TEXTAREA') ? 'input' : 'change';
                input.addEventListener(evt, e => {
                    let value;
                    if (input.type === 'checkbox') value = e.target.checked;
                    else if (input.type === 'number') value = Number(e.target.value);
                    else value = e.target.value;
                    if (input.type === 'radio' && !e.target.checked) return;
                    this.applyFieldChange(id, field, value);
                    // Re-render for changes that alter the layout; leave text fields alone so
                    // the caret does not jump.
                    if (field === 'kind' || field === 'count' || field === 'livingCount') this.render();
                    else this.updateSidebarCount(State.getCharacter());
                });
            });
        });
    },

    applyFieldChange(id, field, value) {
        // A mob at full strength stays at full strength when it gains or loses members;
        // one that has already taken casualties keeps its living count.
        if (field === 'count') {
            const before = State.getFollower(id);
            const wasFull = before && before.livingCount >= before.count;
            State.updateFollower(id, { count: value, livingCount: wasFull ? value : before.livingCount });
            return;
        }
        State.updateFollower(id, { [field]: value });
    },

    // The quote escape is not decorative: this output goes into attribute values, and a
    // follower name is free text.
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML.replace(/"/g, '&quot;');
    }
};
