// Tests for the Vehicles UI (issue #28): the Rules Reference categories and popup types in both
// apps, the bestiary data loader's vehicle accessors, and the pure helpers of the Vehicles tab.
// Run: node scripts/test-vehicles-tab.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readSource = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const glossary = readJson('data/glossary.json');

// A stand-in for the browser document. Elements keep their innerHTML, and
// insertAdjacentHTML calls are recorded, so a test can read what a tab rendered.
const fakeDocument = {
    elements: {},
    inserted: [],
    getElementById(id) {
        if (!this.elements[id]) {
            this.elements[id] = {
                innerHTML: '', value: '', scrollTop: 0, clientHeight: 0, scrollHeight: 0,
                addEventListener() {}, removeEventListener() {}
            };
        }
        return this.elements[id];
    },
    querySelector(selector) {
        return { insertAdjacentHTML: (position, html) => fakeDocument.inserted.push({ selector, html }) };
    },
    querySelectorAll() {
        return [];
    }
};

// The bestiary scripts share one context, as the page's <script> tags share one window.
const quietConsole = { log() {}, warn() {}, error: console.error };
const bestiary = { console: quietConsole, document: fakeDocument, CSS: { escape: (s) => s } };
vm.createContext(bestiary);
const load = (rel) => vm.runInContext(readSource(rel), bestiary, { filename: rel });
const get = (name) => vm.runInContext(name, bestiary);
load('bestiary/js/data-loader.js');
load('bestiary/tabs/settings-tab.js');
load('bestiary/js/glossary.js');
load('bestiary/tabs/glossary-tab.js');
const DataLoader = get('DataLoader');
const SettingsTab = get('SettingsTab');
const Glossary = get('Glossary');
const GlossaryTab = get('GlossaryTab');
DataLoader.cache['glossary.json'] = glossary;
Glossary.data = glossary;

async function main() {
    // --- Rules Reference and popup types (Task 2.1) ---
    {
        const traitKeys = Object.keys(glossary.vehicleTraits || {});
        const ruleKeys = Object.keys(glossary.vehicleRules || {});
        check('Part 1 data: glossary has the 12 vehicle traits', traitKeys.length, 12);
        check('Part 1 data: glossary has at least 40 vehicle rules', ruleKeys.length >= 40, true);

        // The engine resolves the two new popup types by key
        const turbo = Glossary.getEntry('vehicleTrait', 'turbo_boost');
        check('getEntry resolves a vehicle trait', !!turbo && turbo.name.startsWith('Turbo Boost'), true);
        check('getEntry resolves the Twin Weapons rule', !!Glossary.getEntry('vehicleRule', 'twin_weapons'), true);
        check('getEntry resolves the Vehicle Damage rule', !!Glossary.getEntry('vehicleRule', 'vehicle_damage'), true);
        check('getEntry returns null for an unknown vehicle trait', Glossary.getEntry('vehicleTrait', 'no_such_trait'), null);
        check('getTypeLabel names the vehicle trait type', Glossary.getTypeLabel('vehicleTrait'), 'Vehicle Trait');
        check('getTypeLabel names the vehicle rule type', Glossary.getTypeLabel('vehicleRule'), 'Vehicle Rule');

        // Spec section 3: the new sections never become inline links
        Glossary.termMap = new Map();
        Glossary.buildTermMap();
        const linkedTypes = new Set();
        for (const list of Glossary.termMap.values()) list.forEach(entry => linkedTypes.add(entry.type));
        check('buildTermMap registers no vehicle trait', linkedTypes.has('vehicleTrait'), false);
        check('buildTermMap registers no vehicle rule', linkedTypes.has('vehicleRule'), false);
        check('buildTermMap still registers conditions and keywords', linkedTypes.has('condition') && linkedTypes.has('keyword'), true);

        // showEntryPopup gives showPopup an ARRAY with one tagged definition
        const shown = [];
        const realShowPopup = Glossary.showPopup;
        Glossary.showPopup = (definitions, anchorElement, termKey) => shown.push({ definitions, termKey });
        check('showEntryPopup opens a known entry', Glossary.showEntryPopup('vehicleTrait', 'turbo_boost', {}), true);
        check('showEntryPopup passes one definition with its type and key',
            shown.length === 1 && Array.isArray(shown[0].definitions)
                ? [shown[0].definitions.length, shown[0].definitions[0].type, shown[0].definitions[0].key, shown[0].termKey]
                : null,
            [1, 'vehicleTrait', 'turbo_boost', 'vehicleTrait-turbo_boost']);
        check('showEntryPopup keeps the entry name for the title', shown[0] && shown[0].definitions[0].name, turbo && turbo.name);
        check('showEntryPopup pins the popup', Glossary._pinned, true);
        check('showEntryPopup refuses an unknown key', Glossary.showEntryPopup('vehicleRule', 'no_such_rule', {}), false);
        check('a refused key opens no popup', shown.length, 1);
        Glossary.showPopup = realShowPopup;
        Glossary._pinned = false;

        // Bestiary Rules Reference: labels, the All list, deep-link ids, the source toggle
        check('bestiary label for vehicle traits', GlossaryTab.getCategoryLabel('vehicleTraits'), 'Vehicle Traits');
        check('bestiary label for vehicle rules', GlossaryTab.getCategoryLabel('vehicleRules'), 'Vehicle Rules');
        GlossaryTab.currentCategory = 'all';
        GlossaryTab.searchText = '';
        GlossaryTab.renderGlossary();
        const skeleton = fakeDocument.getElementById('glossary-content').innerHTML;
        check('All shows a Vehicle Traits group', skeleton.includes('data-group-category="vehicleTraits"'), true);
        check('All shows a Vehicle Rules group', skeleton.includes('data-group-category="vehicleRules"'), true);
        check('a vehicle rule has the deep-link id vehicleRules-<key>', GlossaryTab._entryMap.has('vehicleRules-vehicle_damage'), true);
        check('a vehicle trait has the deep-link id vehicleTraits-<key>', GlossaryTab._entryMap.has('vehicleTraits-turbo_boost'), true);
        GlossaryTab.currentCategory = 'vehicleTraits';
        GlossaryTab.renderGlossary();
        check('the Vehicle Traits filter shows the 12 traits', GlossaryTab._orderedEntries.length, 12);
        GlossaryTab.currentCategory = 'all';
        SettingsTab.excludedSources.add('Church of Steel');
        GlossaryTab.renderGlossary();
        check('Church of Steel off hides the vehicle rules', GlossaryTab._entryMap.has('vehicleRules-vehicle_damage'), false);
        SettingsTab.excludedSources.clear();

        // Creator Rules Reference: its own context, with stub Glossary and State objects
        const creator = { console: quietConsole, Glossary: { data: glossary }, State: { isSourceEnabled: () => true } };
        vm.createContext(creator);
        vm.runInContext(readSource('creator/tabs/glossary-tab.js'), creator, { filename: 'creator/tabs/glossary-tab.js' });
        const CreatorGlossaryTab = vm.runInContext('GlossaryTab', creator);
        CreatorGlossaryTab.renderEntries = () => {};
        CreatorGlossaryTab.loadEntries();
        const entries = CreatorGlossaryTab.allEntries;
        const traits = entries.filter(e => e.category === 'vehicleTraits');
        const rules = entries.filter(e => e.category === 'vehicleRules');
        check('creator vehicle trait ids are vehicleTraits-<key>',
            traits.map(e => e.id).sort(), traitKeys.map(k => `vehicleTraits-${k}`).sort());
        check('creator vehicle rule ids are vehicleRules-<key>',
            rules.map(e => e.id).sort(), ruleKeys.map(k => `vehicleRules-${k}`).sort());
        check('creator names a vehicle rule entry',
            rules.length > 0 ? [rules[0].categoryName, rules[0].categoryPluralName] : null, ['Vehicle Rule', 'Vehicle Rules']);
        const olderIds = new Set(entries.filter(e => e.category !== 'vehicleTraits' && e.category !== 'vehicleRules').map(e => e.id));
        check('no vehicle entry id repeats an older entry id', [...traits, ...rules].filter(e => olderIds.has(e.id)).map(e => e.id), []);
        check('the FLYER keyword keeps its own id', entries.filter(e => e.id === 'flyer').map(e => e.category), ['keywords']);
        check('creator groups end with the two vehicle sections',
            CreatorGlossaryTab.groupByCategory(entries).map(g => g.category).slice(-2), ['vehicleTraits', 'vehicleRules']);
        CreatorGlossaryTab.currentCategory = 'vehicleRules';
        const filtered = CreatorGlossaryTab.getFilteredEntries();
        check('the creator Vehicle Rules filter shows every rule and nothing else',
            [filtered.length, filtered.every(e => e.category === 'vehicleRules')], [ruleKeys.length, true]);
    }

    // --- end of checks ---
}

main().then(() => {
    console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
}, (error) => {
    console.error(error);
    process.exit(1);
});
