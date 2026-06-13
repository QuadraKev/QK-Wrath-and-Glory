// Setting Tab - Character name, tier, rank, and campaign settings

const SettingTab = {
    init() {
        // Character name input
        document.getElementById('character-name').addEventListener('input', (e) => {
            State.setName(e.target.value);
        });

        // Additional XP input
        document.getElementById('additional-xp').addEventListener('change', (e) => {
            State.setAdditionalXP(e.target.value);
        });

        // Rank input
        document.getElementById('character-rank').addEventListener('change', (e) => {
            State.setRank(e.target.value);
        });

        // Tier select
        document.getElementById('tier-select').addEventListener('change', (e) => {
            State.setTier(e.target.value);
        });

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
