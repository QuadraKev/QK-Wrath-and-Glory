// Tests for vehicles in the Encounter Builder (issue #28): the EncounterState vehicle functions,
// the list rows they feed, and persistence through autosave, saved files and older saves.
// Run: node scripts/test-encounter-vehicles.js

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

// encounter-state.js schedules an autosave with setTimeout on every change and writes it to
// localStorage, so the context stubs both. No-op timers leave no debounce timer alive.
const store = {};
const sandbox = {
    console: { log() {}, warn() {}, error: console.error },
    localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; }
    },
    setTimeout: () => 0,
    clearTimeout: () => {}
};
vm.createContext(sandbox);
const load = (rel) => vm.runInContext(readSource(rel), sandbox, { filename: rel });
load('bestiary/js/data-loader.js');
load('bestiary/tabs/settings-tab.js');
load('bestiary/js/encounter-state.js');
const DataLoader = vm.runInContext('DataLoader', sandbox);
const EncounterState = vm.runInContext('EncounterState', sandbox);
DataLoader.cache['vehicles.json'] = readJson('data/vehicles.json');
DataLoader.cache['threats.json'] = readJson('data/threats.json');

async function main() {
    // --- EncounterState: vehicle lifecycle and persistence (Task 2.3) ---
    {
        const chimera = DataLoader.getVehicle('chimera');
        const max = chimera.wounds;
        check('the test vehicle has a whole-number Max Wounds', Number.isInteger(max) && max > 0, true);

        // Add and remove
        EncounterState.clearEncounter();
        check('a fresh encounter is empty', EncounterState.isEmpty(), true);
        const vid = EncounterState.addVehicle('chimera');
        check('addVehicle returns the new entry id', typeof vid, 'string');
        check('an entry holds exactly id, vehicleId, wounds and initiative',
            plain(EncounterState.getVehicle(vid)), { id: vid, vehicleId: 'chimera', wounds: 0, initiative: null });
        check('an encounter with only a vehicle is not empty', EncounterState.isEmpty(), false);
        check('addVehicle marks the encounter unsaved', EncounterState.hasUnsavedChanges(), true);
        check('addVehicle refuses an unknown vehicle id', EncounterState.addVehicle('no_such_vehicle'), null);
        check('a refused add stores nothing', EncounterState.vehicles.length, 1);
        const second = EncounterState.addVehicle('chimera');
        check('a second add gets its own id', second === vid, false);
        EncounterState.removeVehicle(second);
        check('removeVehicle removes only that entry', EncounterState.vehicles.map(v => v.id), [vid]);
        check('getVehicle returns undefined for an unknown entry', EncounterState.getVehicle('no-such-entry'), undefined);

        // Wounds: floor 0, ceiling Max Wounds + 1
        EncounterState.updateVehicleWounds(vid, -1);
        check('damage taken stops at 0', EncounterState.getVehicle(vid).wounds, 0);
        EncounterState.updateVehicleWounds(vid, max);
        check('damage equal to Max Wounds does not destroy the vehicle', EncounterState.isVehicleDestroyed(vid), false);
        EncounterState.updateVehicleWounds(vid, 1);
        check('damage above Max Wounds destroys the vehicle', EncounterState.isVehicleDestroyed(vid), true);
        EncounterState.updateVehicleWounds(vid, 5);
        check('damage stops at Max Wounds + 1', EncounterState.getVehicle(vid).wounds, max + 1);
        const destroyedRow = EncounterState.getEncounterListItems().find(item => item.id === vid);
        check('a destroyed vehicle row is marked dead', destroyedRow.isDead, true);
        check('the row carries Max Wounds', destroyedRow.maxWounds, max);
        EncounterState.updateVehicleWounds(vid, -1);
        check('one point of repair restores the vehicle', EncounterState.isVehicleDestroyed(vid), false);
        EncounterState.updateVehicleWounds('no-such-entry', 1);
        check('a wound change on an unknown entry changes nothing', EncounterState.vehicles.length, 1);

        // Initiative
        EncounterState.setVehicleInitiative(vid, '12');
        check('setVehicleInitiative stores a number', EncounterState.getVehicle(vid).initiative, 12);
        EncounterState.setVehicleInitiative(vid, '');
        check('an empty initiative clears to null', EncounterState.getVehicle(vid).initiative, null);

        // Tier and player count recalculate threats only
        const before = plain(EncounterState.getVehicle(vid));
        EncounterState.updateSettings({ tier: 4, playerCount: 6 });
        check('a tier or player count change leaves a vehicle as it was', plain(EncounterState.getVehicle(vid)), before);

        // List rows: name, sort by initiative, custom order
        EncounterState.addIndividual(DataLoader.getAllThreats()[0].id, 1, false);
        const individualId = EncounterState.individuals[0].id;
        const pcId = EncounterState.addPlayerCharacter('Ana');
        EncounterState.setInitiative(individualId, 5);
        EncounterState.setPlayerCharacterInitiative(pcId, 7);
        EncounterState.setVehicleInitiative(vid, 9);
        let rows = EncounterState.getEncounterListItems();
        check('the vehicle row uses the display name', rows.find(r => r.type === 'vehicle').name, DataLoader.getVehicleDisplayName(chimera));
        check('a vehicle sorts by initiative with the other rows', rows.map(r => r.type), ['vehicle', 'player', 'individual']);
        EncounterState.moveItemInOrder('vehicle', vid, 3);
        rows = EncounterState.getEncounterListItems();
        check('moveItemInOrder moves a vehicle in the custom order', rows.map(r => r.type), ['player', 'individual', 'vehicle']);
        const crusaderId = EncounterState.addVehicle('land_raider_crusader');
        check('a variant row shows its family',
            EncounterState.getEncounterListItems().find(r => r.id === crusaderId).name, 'Crusader (Land Raider)');
        EncounterState.removeVehicle(crusaderId);

        // Save data
        const data = EncounterState.getEncounterData();
        check('saved data keeps version 1', data.version, 1);
        check('saved data writes the vehicles array', plain(data.vehicles), plain(EncounterState.vehicles));
        const saved = plain(data);
        EncounterState.clearEncounter();
        check('clearEncounter empties the vehicles', EncounterState.vehicles.length, 0);
        EncounterState.loadFromData(saved);
        check('loadFromData restores the vehicles', plain(EncounterState.vehicles), saved.vehicles);
        const older = plain(saved);
        delete older.vehicles;
        EncounterState.loadFromData(older);
        check('a save without vehicles loads an empty array', plain(EncounterState.vehicles), []);

        // Load Encounter reads files through loadEncounterFromFile, not loadFromData
        sandbox.window = { api: { loadEncounterFile: async () => ({ success: true, fileName: 'Convoy', data: plain(saved) }) } };
        await EncounterState.loadEncounterFromFile();
        check('a saved file restores the vehicles', plain(EncounterState.vehicles), saved.vehicles);
        sandbox.window = { api: { loadEncounterFile: async () => ({ success: true, fileName: 'Old', data: plain(older) }) } };
        await EncounterState.loadEncounterFromFile();
        check('an older saved file loads an empty vehicles array', plain(EncounterState.vehicles), []);

        // Autosave
        EncounterState.clearEncounter();
        const autoId = EncounterState.addVehicle('chimera');
        EncounterState._performAutoSave();
        check('autosave writes the vehicles', EncounterState.getAutoSave().encounter.vehicles.map(v => v.id), [autoId]);
        EncounterState.clearEncounter();
        check('clearEncounter removes the autosave', EncounterState.getAutoSave(), null);

        // An entry whose vehicle id no longer resolves is kept
        EncounterState.loadFromData({ vehicles: [{ id: 'v-old', vehicleId: 'retired_vehicle', wounds: 3, initiative: 4 }] });
        const unknownRow = EncounterState.getEncounterListItems()[0];
        check('an unknown vehicle row says Unknown vehicle', unknownRow.name, 'Unknown vehicle');
        check('an unknown vehicle is never destroyed', unknownRow.isDead, false);
        check('an unknown vehicle row has no Max Wounds', unknownRow.maxWounds, null);
        EncounterState.updateVehicleWounds('v-old', 1);
        check('an unknown vehicle still tracks damage, with no ceiling', EncounterState.getVehicle('v-old').wounds, 4);
        check('an unknown vehicle survives a save', plain(EncounterState.getEncounterData().vehicles),
            [{ id: 'v-old', vehicleId: 'retired_vehicle', wounds: 4, initiative: 4 }]);
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
