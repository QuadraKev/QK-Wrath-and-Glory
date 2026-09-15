// Notes Tab - Free-form notes kept with the character

const NotesTab = {
    init() {
        // Notes textarea
        document.getElementById('character-notes').addEventListener('input', (e) => {
            State.setNotes(e.target.value);
        });
    },

    refresh() {
        const character = State.getCharacter();

        document.getElementById('character-notes').value = character.notes || '';
    }
};
