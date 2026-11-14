// Tests for the issue #28 follow-ups: keyboard access to the clickable chips and terms on the
// bestiary Vehicles and Threats cards, and the source map that DataLoader now owns.
// Run: node scripts/test-chip-keyboard.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const readSource = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// A stand-in for the browser document. It records the listeners that a script adds to it.
const fakeDocument = {
    listeners: [],
    addEventListener(type, handler) { this.listeners.push({ type, handler }); },
    getElementById() { return null; },
    querySelectorAll() { return []; }
};

const quietConsole = { log() {}, warn() {}, error: console.error };
const bestiary = { console: quietConsole, document: fakeDocument, CSS: { escape: (s) => s } };
vm.createContext(bestiary);
const load = (rel) => vm.runInContext(readSource(rel), bestiary, { filename: rel });
const get = (name) => vm.runInContext(name, bestiary);
load('bestiary/js/data-loader.js');
load('bestiary/tabs/settings-tab.js');
load('bestiary/js/glossary.js');
load('bestiary/tabs/threats-tab.js');
load('bestiary/tabs/vehicles-tab.js');
const DataLoader = get('DataLoader');
const SettingsTab = get('SettingsTab');
const Glossary = get('Glossary');
const ThreatsTab = get('ThreatsTab');
const VehiclesTab = get('VehiclesTab');

// Every opening <span> tag in the HTML that has the class or attribute in the pattern
const spanTags = (html, pattern) => (html.match(/<span [^>]*>/g) || []).filter(tag => pattern.test(tag));
const isKeyboardButton = (tag) => tag.includes('tabindex="0"') && tag.includes('role="button"');

// A key event with a target that records its clicks and the preventDefault calls
function keyEvent(key, target) {
    return { key, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
}
function fakeChip(isButton) {
    return {
        clicks: 0,
        click() { this.clicks++; },
        matches(selector) { return isButton && selector.includes('[role="button"]'); }
    };
}

async function main() {
    bestiary.window = { api: { loadGameData: async (filename) => readJson(`data/${filename}`) } };
    await DataLoader.loadAll();

    // --- (1) Vehicle chips and the Twin marker ---
    {
        const keywordChips = VehiclesTab.renderKeywordChips(['IMPERIUM', 'NOT A KEYWORD']);
        const linkedKeyword = spanTags(keywordChips, /data-popup-type="keyword"/);
        check('a linked keyword chip is a keyboard button', linkedKeyword.length === 1 && isKeyboardButton(linkedKeyword[0]), true);
        check('a keyword chip without an entry is not a keyboard button',
            keywordChips.includes('<span class="vehicle-chip vehicle-chip-keyword">NOT A KEYWORD</span>'), true);

        const traitChips = VehiclesTab.renderTraitChips(['Turbo Boost (2)', 'No Such Trait']);
        const linkedTrait = spanTags(traitChips, /data-popup-type="vehicleTrait"/);
        check('a linked trait chip is a keyboard button', linkedTrait.length === 1 && isKeyboardButton(linkedTrait[0]), true);
        check('a trait chip without an entry is not a keyboard button',
            traitChips.includes('<span class="vehicle-chip">No Such Trait</span>'), true);

        const marker = spanTags(VehiclesTab.renderWeaponName({ text: '2 Twin Lascannons', twin: true }), /vehicle-twin-marker/);
        check('the Twin marker is a keyboard button', marker.length === 1 && isKeyboardButton(marker[0]), true);

        // Every card: each chip with a popup is a button, each chip without one is not
        const vehicles = DataLoader.getVehicles();
        const cards = vehicles.map(v => VehiclesTab.renderVehicleCard(v)).join('');
        const popupTags = spanTags(cards, /data-popup-type=/);
        check('the cards have chips with a popup', popupTags.length > 0, true);
        check('every chip with a popup on every card is a keyboard button', popupTags.filter(t => !isKeyboardButton(t)), []);
        check('no chip without a popup is a keyboard button',
            spanTags(cards, /class="vehicle-chip/).filter(t => !/data-popup-type=/.test(t) && /tabindex|role=/.test(t)), []);
        check('the compressed Encounter Builder card gets the same chips',
            spanTags(VehiclesTab.renderVehicleCardMini(vehicles.find(v => v.traits.length > 0)), /data-popup-type=/).every(isKeyboardButton), true);
    }

    // --- (2) Threat card keywords and glossary terms ---
    {
        const threat = DataLoader.getAllThreats().find(t => (t.keywords || []).length > 1);
        const card = ThreatsTab.renderThreatCard(threat);
        const keywordTags = spanTags(card, /class="threat-keyword"/);
        check('the threat card has its keyword chips', keywordTags.length, threat.keywords.length);
        check('every threat keyword chip is a keyboard button', keywordTags.filter(t => !isKeyboardButton(t)), []);

        Glossary.data = DataLoader.cache['glossary.json'];
        Glossary.termMap = new Map();
        Glossary.buildTermMap();
        const conditionName = Object.values(Glossary.data.conditions)[0].name;
        const termTags = spanTags(Glossary.processText(`The target is ${conditionName} now.`), /class="glossary-term"/);
        check('a glossary term in card text is a keyboard button', termTags.length === 1 && isKeyboardButton(termTags[0]), true);
    }

    // --- (3) Enter and Space run the click; other keys do not ---
    {
        check('Glossary has a key handler for chips', typeof Glossary.handleActivationKey, 'function');
        if (typeof Glossary.handleActivationKey === 'function') {
            const enterChip = fakeChip(true);
            const enter = keyEvent('Enter', enterChip);
            Glossary.handleActivationKey(enter);
            check('Enter on a chip clicks it once', enterChip.clicks, 1);

            const spaceChip = fakeChip(true);
            const space = keyEvent(' ', spaceChip);
            Glossary.handleActivationKey(space);
            check('Space on a chip clicks it once', spaceChip.clicks, 1);
            check('Space on a chip calls preventDefault, so the page does not scroll', space.defaultPrevented, true);

            const otherChip = fakeChip(true);
            const other = keyEvent('a', otherChip);
            Glossary.handleActivationKey(other);
            check('another key does not click the chip', [otherChip.clicks, other.defaultPrevented], [0, false]);

            const plainSpan = fakeChip(false);
            const plainEnter = keyEvent('Enter', plainSpan);
            Glossary.handleActivationKey(plainEnter);
            check('Enter on an element that is not a chip does nothing', [plainSpan.clicks, plainEnter.defaultPrevented], [0, false]);
        }

        // The document keydown listener of the popup engine routes the key into the click
        fakeDocument.listeners = [];
        await Glossary.init();
        const keydown = fakeDocument.listeners.filter(l => l.type === 'keydown');
        check('the popup engine adds one keydown listener', keydown.length, 1);
        const routedChip = fakeChip(true);
        keydown[0].handler(keyEvent('Enter', routedChip));
        check('the keydown listener clicks a chip on Enter', routedChip.clicks, 1);
        let closed = 0;
        const realClose = Glossary.closeTopPopup;
        Glossary.closeTopPopup = () => closed++;
        keydown[0].handler(keyEvent('Escape', fakeChip(true)));
        Glossary.closeTopPopup = realClose;
        check('Escape still closes the top popup', closed, 1);
    }

    // --- (4) The source map lives in DataLoader ---
    {
        check('DataLoader has the public source map', typeof DataLoader.glossaryIdToNormalized, 'object');
        check('SettingsTab no longer has the private source map', SettingsTab._glossaryIdToNormalized, undefined);
        check('the source map keeps its keys in order', Object.keys(DataLoader.glossaryIdToNormalized || {}),
            ['core', 'church', 'aeldari', 'fspg', 'voa', 'redacted1', 'redacted2', 'shotguns', 'dh', 'lex', 'apocrypha']);
        // The list that getAllSources returned before the change
        check('getAllSources returns the same list as before', DataLoader.getAllSources(),
            ['Apocrypha', 'Church of Steel', 'Core Rules', 'Lex Imperialis', 'Redacted Records I', 'Redacted Records II',
                'Threat Assessment: Daemons & Heretics', 'Threat Assessment: Xenos', 'Vow of Absolution']);
        check('isSourceEnabled maps a short id through the map', (() => {
            SettingsTab.excludedSources.add('Church of Steel');
            const result = SettingsTab.isSourceEnabled('church');
            SettingsTab.excludedSources.clear();
            return result;
        })(), false);
        check('the Settings tab reads the map from DataLoader',
            /DataLoader\.glossaryIdToNormalized\[/.test(readSource('bestiary/tabs/settings-tab.js')), true);
        const html = readSource('bestiary/index.html');
        check('the page loads data-loader.js before settings-tab.js',
            html.indexOf('js/data-loader.js') !== -1 && html.indexOf('js/data-loader.js') < html.indexOf('tabs/settings-tab.js'), true);
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
