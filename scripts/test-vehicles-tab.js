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

    // --- Data loader: vehicles.json and its accessors (Task 2.2) ---
    {
        bestiary.window = { api: { loadGameData: async (filename) => readJson(`data/${filename}`) } };
        const gameData = await DataLoader.loadAll();
        const fileVehicles = readJson('data/vehicles.json');
        check('loadAll maps vehicles.json to gameData.vehicles', gameData.vehicles.length, fileVehicles.length);
        check('the vehicles keep the file order', gameData.vehicles[0].id, fileVehicles[0].id);
        check('the injuries file keeps its slot', Array.isArray(gameData.injuriesCorruption.mutations), true);
        check('getVehicles returns the 107 cached vehicles', DataLoader.getVehicles().length, 107);
        check('getVehicle finds the Chimera', DataLoader.getVehicle('chimera').name, 'Chimera');
        check('getVehicle returns undefined for an unknown id', DataLoader.getVehicle('no_such_vehicle'), undefined);

        const crusader = DataLoader.getVehicle('land_raider_crusader');
        check('a variant shows its family in the display name', DataLoader.getVehicleDisplayName(crusader), 'Crusader (Land Raider)');
        check('a top-level vehicle shows its own name', DataLoader.getVehicleDisplayName(DataLoader.getVehicle('chimera')), 'Chimera');
        check('an Archaeopter block is top-level and keeps its stored name',
            DataLoader.getVehicleDisplayName(DataLoader.getVehicle('archaeopter_fusilave')), 'Archaeopter Fusilave');
        check('a variant whose name contains the family name shows the name alone',
            DataLoader.getVehicleDisplayName(DataLoader.getVehicle('land_speeder_tornado')), 'Land Speeder Tornado');
        check('a variant whose name lacks the family name shows the family',
            DataLoader.getVehicleDisplayName(DataLoader.getVehicle('attack_bike')), 'Attack Bike (Assault Bike)');
        const wrongNames = DataLoader.getVehicles()
            .filter(v => v.variantOf)
            .filter(v => {
                const familyName = DataLoader.getVehicle(v.variantOf).name;
                const expected = v.name.includes(familyName) ? v.name : `${v.name} (${familyName})`;
                return DataLoader.getVehicleDisplayName(v) !== expected;
            })
            .map(v => v.id);
        check('every variant follows the display-name rule', wrongNames, []);
        check('a variant with a missing family falls back to its own name',
            DataLoader.getVehicleDisplayName({ name: 'Crusader', variantOf: 'no_such_family' }), 'Crusader');
        check('a missing vehicle has an empty display name', DataLoader.getVehicleDisplayName(undefined), '');

        const sources = DataLoader.getAllSources();
        check('getAllSources lists Church of Steel once', sources.filter(s => s === 'Church of Steel').length, 1);
        check('getAllSources never lists the short id', sources.includes('church'), false);
        const allThreats = DataLoader.cache['threats.json'];
        DataLoader.cache['threats.json'] = allThreats.filter(t => t.source !== 'Church of Steel');
        check('the Church of Steel button stays without the Church of Steel threat',
            DataLoader.getAllSources().includes('Church of Steel'), true);
        DataLoader.cache['threats.json'] = allThreats;
    }

    // --- Vehicles tab: wiring and pure helpers (Task 2.4) ---
    {
        const html = readSource('bestiary/index.html');
        check('the tab bar has a Vehicles button', html.includes('<button class="tab-btn" data-tab="vehicles">VEHICLES</button>'), true);
        check('the page has the Vehicles tab container', html.includes('<div id="tab-vehicles" class="tab-content">'), true);
        check('the page loads the Vehicles tab script', /<script src="tabs\/vehicles-tab\.js\?v=\d+"><\/script>/.test(html), true);
        check('every ?v= in the bestiary page has one number', new Set([...html.matchAll(/\?v=(\d+)/g)].map(m => m[1])).size, 1);

        load('bestiary/tabs/vehicles-tab.js');
        const VehiclesTab = get('VehiclesTab');
        const vehicles = DataLoader.getVehicles();
        const byId = (id) => DataLoader.getVehicle(id);
        check('the data loader has the vehicles cached', vehicles.length, 107);

        // Filters: faction list, sort order, faction, search, source toggle
        check('the faction select lists the 11 factions, sorted', VehiclesTab.getFactions(),
            ['Adepta Sororitas', 'Adeptus Astartes', 'Adeptus Mechanicus', 'Aeldari', 'Aeronautica Imperialis',
                'Astra Militarum', 'Chaos Space Marines', 'Drukhari', 'Imperial', 'Necron', 'Ork']);
        VehiclesTab.filters = { search: '', faction: 'all' };
        const listed = VehiclesTab.getFilteredVehicles();
        check('with no filter the list holds all 107 vehicles', listed.length, 107);
        const listedNames = listed.map(v => DataLoader.getVehicleDisplayName(v));
        check('the list is sorted by display name', listedNames, [...listedNames].sort((a, b) => a.localeCompare(b)));
        VehiclesTab.filters.faction = 'Ork';
        const orks = VehiclesTab.getFilteredVehicles();
        check('the faction select keeps only that faction',
            [orks.length, orks.every(v => v.faction === 'Ork')], [vehicles.filter(v => v.faction === 'Ork').length, true]);
        VehiclesTab.filters.faction = 'all';
        VehiclesTab.filters.search = 'land raider';
        check('search finds a variant by its family name', VehiclesTab.getFilteredVehicles().some(v => v.id === 'land_raider_crusader'), true);
        const keyword = vehicles.find(v => v.keywords.length > 0).keywords[0];
        VehiclesTab.filters.search = keyword.toLowerCase();
        const keywordHits = new Set(VehiclesTab.getFilteredVehicles().map(v => v.id));
        check(`search matches keywords (${keyword})`, vehicles.filter(v => v.keywords.includes(keyword)).every(v => keywordHits.has(v.id)), true);
        const described = vehicles.find(v => v.description && v.description.length > 40);
        VehiclesTab.filters.search = described.description.slice(10, 30).toUpperCase();
        check('search matches description text in any case', VehiclesTab.getFilteredVehicles().some(v => v.id === described.id), true);
        VehiclesTab.filters.search = '   ';
        check('a blank search keeps every vehicle', VehiclesTab.getFilteredVehicles().length, 107);
        VehiclesTab.filters.search = '';
        SettingsTab.excludedSources.add('Church of Steel');
        check('Church of Steel off hides every vehicle', VehiclesTab.getFilteredVehicles().length, 0);
        SettingsTab.excludedSources.clear();

        // Chip keys: a trait drops its value; a keyword matches by name
        check('a trait with a value opens the base trait', VehiclesTab.findTraitKey('Turbo Boost (2)'), 'turbo_boost');
        check('trait matching ignores case and hyphens',
            [VehiclesTab.findTraitKey('open-topped') !== null, VehiclesTab.findTraitKey('open-topped') === VehiclesTab.findTraitKey('Open Topped')],
            [true, true]);
        check('every vehicleTraits name maps back to its own key',
            Object.entries(glossary.vehicleTraits).filter(([key, entry]) => VehiclesTab.findTraitKey(entry.name) !== key).map(([key]) => key), []);
        check('every printed vehicle trait opens a vehicleTraits entry',
            [...new Set(vehicles.flatMap(v => v.traits))].filter(t => !VehiclesTab.findTraitKey(t)), []);
        check('an unknown trait has no key', VehiclesTab.findTraitKey('No Such Trait'), null);
        check('a keyword resolves to its glossary key by name', VehiclesTab.findKeywordKey('[LEGION]'), 'legion');
        check('a keyword without an entry has no key', VehiclesTab.findKeywordKey('NOT A KEYWORD'), null);
        const chips = VehiclesTab.renderKeywordChips(['IMPERIUM', 'NOT A KEYWORD']);
        check('a linked keyword chip carries the keyword popup type', chips.includes('data-popup-type="keyword" data-popup-key="imperium"'), true);
        check('a keyword without an entry is a plain chip', chips.includes('<span class="vehicle-chip vehicle-chip-keyword">NOT A KEYWORD</span>'), true);

        // Weapons table rows from the resolved weapons.json records
        check('a ranged row takes its profile from the record',
            plain(VehiclesTab.buildWeaponRows({ text: 'Lascannon', weaponId: 'lascannon', count: 1 })),
            [{ text: 'Lascannon', twin: false, resolved: true, damage: '18', ed: 3, ap: -3, rangeReach: '24/48/72', salvo: 1, traits: 'Heavy (8), Reliable' }]);
        const [klaw] = VehiclesTab.buildWeaponRows({ text: "Grabbin' Klaw", weaponId: 'cos_grabbin_klaw', count: 1 });
        check('a melee row shows its reach and no salvo', [klaw.damage, klaw.rangeReach, klaw.salvo], ['14', 5, '-']);
        check('a melee record without reach shows a dash',
            VehiclesTab.buildWeaponRows({ text: 'Sentinel Chainsaw', weaponId: 'cos_sentinel_chainsaw', count: 1 })[0].rangeReach, '-');
        const [twinRow] = VehiclesTab.buildWeaponRows({ text: '2 Twin Lascannons', weaponId: 'lascannon', count: 2, twin: true });
        check('a Twin line keeps its printed text and its flag', [twinRow.text, twinRow.twin, twinRow.damage], ['2 Twin Lascannons', true, '18']);
        const prismIds = ['cos_prism_cannon_dispersed', 'cos_prism_cannon_focussed', 'cos_prism_cannon_lance'];
        const prismRows = VehiclesTab.buildWeaponRows({ text: 'Prism Cannon', weaponId: null, count: 1, profileIds: prismIds });
        check('a profileIds line gives one row per profile, named by the record',
            prismRows.map(r => [r.text, r.resolved]), prismIds.map(id => [DataLoader.getWeapon(id).name, true]));
        check('a profile row takes the numbers of its own record',
            [prismRows[1].ed, prismRows[1].ap], [DataLoader.getWeapon(prismIds[1]).ed, DataLoader.getWeapon(prismIds[1]).ap]);
        check('a profileIds line with no known id shows the printed text alone',
            plain(VehiclesTab.buildWeaponRows({ text: 'Prism Cannon', weaponId: null, count: 1, profileIds: ['no_such_a', 'no_such_b'] })),
            [{ text: 'Prism Cannon', twin: false, resolved: false }]);
        check('the word Twin becomes the marker', VehiclesTab.renderWeaponName(twinRow),
            '2 <span class="vehicle-twin-marker" data-popup-type="vehicleRule" data-popup-key="twin_weapons">Twin</span> Lascannons');
        check('a Twin line without the word still gets the marker', VehiclesTab.renderWeaponName({ text: 'Paired guns', twin: true }),
            'Paired guns <span class="vehicle-twin-marker" data-popup-type="vehicleRule" data-popup-key="twin_weapons">Twin</span>');
        check('a plain line keeps its text', VehiclesTab.renderWeaponName({ text: 'Heavy Bolter', twin: false }), 'Heavy Bolter');
        check('an unresolved line shows the printed text alone',
            plain(VehiclesTab.buildWeaponRows({ text: 'Mystery Gun', weaponId: null, count: 1 })), [{ text: 'Mystery Gun', twin: false, resolved: false }]);
        check('a stale weapon id counts as unresolved',
            VehiclesTab.buildWeaponRows({ text: 'Old Gun', weaponId: 'no_such_weapon', count: 1 })[0].resolved, false);
        check('an empty weapons box shows a dash and no table',
            [VehiclesTab.renderWeaponsTable([]).includes('<table'), VehiclesTab.renderWeaponsTable([]).includes('-')], [false, true]);

        // Wargear lines
        const smoke = DataLoader.getAllEquipment().find(e => e.id === 'cos_smoke_launcher');
        check('a resolved wargear line shows the record effect',
            plain(VehiclesTab.buildWargearRow({ text: 'Smoke Launchers', equipmentId: 'cos_smoke_launcher' })), { text: 'Smoke Launchers', effect: smoke.effect });
        check('an unresolved wargear line shows the printed text alone',
            plain(VehiclesTab.buildWargearRow({ text: 'Dozer Blade', equipmentId: null })), { text: 'Dozer Blade', effect: null });

        // The card holds every element of spec section 4
        const chimera = byId('chimera');
        const card = VehiclesTab.renderVehicleCard(chimera);
        check('the card names the vehicle and its faction', card.includes('>Chimera</h2>') && card.includes(chimera.faction), true);
        check('the card shows Value and Rarity',
            card.includes(`Value:</span> ${chimera.value}`) && card.includes(DataLoader.formatRarity(chimera.rarity)), true);
        check('the card shows the source and page', card.includes(DataLoader.formatSourcePage(chimera)), true);
        check('the card has the stat strip', ['>Spd<', '>Man<', '>Res<', '>W<', '>Size<'].every(s => card.includes(s)), true);
        check('the card shows the crew complement', card.includes('Crew Complement:') && card.includes(chimera.crew), true);
        const rowCount = (v) => v.weapons.reduce((n, w) => n + (Array.isArray(w.profileIds) ? w.profileIds.length : 1), 0);
        check('every card has one row per weapon line or profile', vehicles.filter(v =>
            (VehiclesTab.renderVehicleCard(v).match(/class="vehicle-weapon-name"/g) || []).length !== rowCount(v)).map(v => v.id), []);
        const profileVehicle = vehicles.find(v => v.weapons.some(w => Array.isArray(w.profileIds)));
        check('Part 1 data: a vehicle has a profileIds line', !!profileVehicle, true);
        check('a card with a profileIds line names each profile', !!profileVehicle && profileVehicle.weapons
            .filter(w => Array.isArray(w.profileIds))
            .every(w => w.profileIds.every(id => VehiclesTab.renderVehicleCard(profileVehicle).includes(DataLoader.getWeapon(id).name))), true);
        check('the card has an Add to Encounter button', card.includes('vehicle-add-btn') && card.includes('Add to Encounter'), true);
        check('a top-level card has no variant link', card.includes('vehicle-variant-link'), false);
        const missingProse = vehicles.filter(v => {
            const c = VehiclesTab.renderVehicleCard(v);
            return (v.description && !c.includes(v.description)) || (v.options && !c.includes(v.options));
        }).map(v => v.id);
        check('every card shows its own description and options', missingProse, []);
        const crusaderCard = VehiclesTab.renderVehicleCard(byId('land_raider_crusader'));
        check('a variant card links to its family',
            crusaderCard.includes('data-vehicle-id="land_raider"') && crusaderCard.includes('Variant of Land Raider'), true);
        const missingFamilyText = vehicles.filter(v => v.variantOf).filter(v => {
            const family = byId(v.variantOf);
            const c = VehiclesTab.renderVehicleCard(v);
            return (v.description == null && family.description && !c.includes(family.description)) ||
                (v.options == null && family.options && !c.includes(family.options));
        }).map(v => v.id);
        check('every variant card shows the family text it lacks', missingFamilyText, []);
        const withSidebar = vehicles.filter(v => v.sidebar);
        check('the sidebar box shows its title and text', withSidebar.length > 0 && withSidebar.every(v => {
            const c = VehiclesTab.renderVehicleCard(v);
            return c.includes(v.sidebar.title) && c.includes(v.sidebar.text);
        }), true);
        const twinVehicle = vehicles.find(v => v.weapons.some(w => w.twin));
        check('a card with a Twin line has the Twin marker', VehiclesTab.renderVehicleCard(twinVehicle).includes('data-popup-key="twin_weapons"'), true);
        const traitVehicle = vehicles.find(v => v.traits.length > 0);
        check('trait chips carry the vehicleTrait popup type', VehiclesTab.renderVehicleCard(traitVehicle).includes('data-popup-type="vehicleTrait"'), true);

        // The compressed card for the Encounter Builder
        const mini = VehiclesTab.renderVehicleCardMini(chimera);
        check('the compressed card keeps the stat block',
            ['Vehicle Stats', 'vehicle-stat-strip', 'Weapons', 'Wargear', 'Crew Complement'].every(s => mini.includes(s)), true);
        check('the compressed card leaves out the Add button', mini.includes('vehicle-add-btn'), false);
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
