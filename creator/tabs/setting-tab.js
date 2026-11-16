// Setting Tab - Character name, tier, rank, and campaign settings

const SettingTab = {
    init() {
        // Character name input
        document.getElementById('character-name').addEventListener('input', (e) => {
            State.setName(e.target.value);
        });

        // A number field commits on change, not on every keystroke, so a legal value is never
        // refused half-way (the 1 of 12). A refused entry keeps the stored value and the input
        // shows it again. An entry that the browser cannot read as a number has the value ''.
        // The setters refuse it, because no field of the creator treats an empty box as clear.
        const commit = (setter) => (e) => {
            if (!setter(e.target.value)) this.refresh();
        };

        // Additional XP input
        document.getElementById('additional-xp').addEventListener('change', commit(v => State.setAdditionalXP(v)));

        // Rank input
        document.getElementById('character-rank').addEventListener('change', commit(v => State.setRank(v)));

        // Tier select
        document.getElementById('tier-select').addEventListener('change', commit(v => State.setTier(v)));

        // Setting description
        document.getElementById('setting-desc').addEventListener('input', (e) => {
            State.setSetting(e.target.value);
        });
    },

    refresh() {
        const character = State.getCharacter();

        // Update form values
        document.getElementById('character-name').value = character.name || '';
        document.getElementById('additional-xp').value = character.additionalXp || 0;
        document.getElementById('character-rank').value = character.rank || 1;
        document.getElementById('tier-select').value = character.tier || 1;
        document.getElementById('setting-desc').value = character.setting || '';
    }
};
