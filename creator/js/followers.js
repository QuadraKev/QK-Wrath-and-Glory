// Followers - pure rule helpers for the Followers feature.
// No DOM access, so scripts/test-followers.js can exercise this in plain Node.

const Followers = {
    // Threat statblocks key attributes as S/T/A/I/Wil/Int/Fel; the character uses full names.
    THREAT_ATTR_MAP: {
        S: 'strength',
        T: 'toughness',
        A: 'agility',
        I: 'initiative',
        Wil: 'willpower',
        Int: 'intellect',
        Fel: 'fellowship'
    },

    // Mob attack bonus. Mirrors getMobAttackBonus() in bestiary/js/encounter-state.js:458.
    // The Math.max(0, ...) matters: without it a mob of 0 living members returns -1.
    mobAttackBonus(livingCount) {
        const n = Number(livingCount) || 0;
        return Math.max(0, Math.min(n - 1, Math.floor(n / 2)));
    },

    // Alternative stats: Attributes and Skills equal 1 + Double Rank, and neither can be
    // higher than the character's own value. Granted by Devotees (core p132), Companion and
    // Companion (Elite) (apocrypha p234), and Familiar (apocrypha p236).
    alternativeStatValue(rank, characterValue) {
        const base = 1 + 2 * (Number(rank) || 1);
        if (characterValue === null || characterValue === undefined) return base;
        return Math.min(base, characterValue);
    },

    // A blank follower entry.
    create(threatId) {
        return {
            id: 'flw_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            threatId: threatId,
            name: '',
            kind: 'individual',
            count: 1,
            livingCount: 1,
            // Remembers a mob's count/livingCount across a mob -> individual -> mob round
            // trip (State.updateFollower). Null until the follower has been a mob at least once.
            mobCount: null,
            mobLivingCount: null,
            useAlternativeStats: false,
            currentWounds: null,
            currentShock: null,
            notes: ''
        };
    }
};
