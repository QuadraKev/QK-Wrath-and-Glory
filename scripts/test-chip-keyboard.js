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

// A stand-in for the browser document. It records the listeners that a script adds to it,
// and it finds the stand-in popups that a test puts in `popups` by their id.
const fakeDocument = {
    listeners: [],
    popups: {},
    addEventListener(type, handler) { this.listeners.push({ type, handler }); },
    getElementById(id) { return this.popups[id] || null; },
    querySelectorAll() { return []; }
};

const quietConsole = { log() {}, warn() {}, error: console.error };
const bestiary = { console: quietConsole, document: fakeDocument, CSS: { escape: (s) => s }, setTimeout, clearTimeout };
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
// Element.matches for a selector of the form tag[role="value"], from the element's tag name and
// role. Any other selector form stops the test, so a changed selector cannot pass by accident.
function matchesTagAndRole(tagName, role, selector) {
    const parts = selector.match(/^([a-z]+)\[role="([^"]+)"\]$/);
    if (!parts) throw new Error(`the stand-in cannot match the selector ${selector}`);
    return tagName.toLowerCase() === parts[1] && role === parts[2];
}
function fakeChip(tagName, role) {
    return {
        clicks: 0,
        click() { this.clicks++; },
        matches(selector) { return matchesTagAndRole(tagName, role, selector); }
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
        Glossary.data = DataLoader.cache['glossary.json'];
        const threat = { ...DataLoader.getAllThreats().find(t => (t.keywords || []).length > 1), keywords: ['IMPERIUM', 'NOT A KEYWORD'] };
        const card = ThreatsTab.renderThreatCard(threat);
        const keywordTags = spanTags(card, /class="threat-keyword"/);
        check('the threat card has its keyword chips', keywordTags.length, 2);
        check('a threat keyword chip with an entry is a keyboard button',
            [isKeyboardButton(keywordTags[0]), keywordTags[0].includes('data-popup-type="keyword" data-popup-key="imperium"')], [true, true]);
        check('a threat keyword chip without an entry is a plain chip',
            card.includes('<span class="threat-keyword">NOT A KEYWORD</span>'), true);

        // Render the card into a stand-in container, then activate its keyword chips
        const chipFromSpan = ([, tag, text]) => ({
            listeners: [],
            textContent: text,
            dataset: {
                popupType: (tag.match(/data-popup-type="([^"]+)"/) || [])[1],
                popupKey: (tag.match(/data-popup-key="([^"]+)"/) || [])[1]
            },
            addEventListener(type, handler) { this.listeners.push({ type, handler }); },
            matches(selector) { return matchesTagAndRole('SPAN', (tag.match(/role="([^"]+)"/) || [])[1], selector); },
            click() {
                const event = { target: this, stopped: false, stopPropagation() { this.stopped = true; } };
                this.listeners.filter(l => l.type === 'click').forEach(l => l.handler(event));
                this.lastClick = event;
            }
        });
        let chips = [];
        const container = {
            set innerHTML(html) {
                chips = [...html.matchAll(/(<span class="threat-keyword"[^>]*>)([^<]*)<\/span>/g)].map(chipFromSpan);
            },
            querySelectorAll(selector) {
                if (!selector.startsWith('.threat-keyword')) return [];
                return selector.includes('[data-popup-key]') ? chips.filter(c => c.dataset.popupKey) : chips;
            },
            querySelector() { return null; }
        };
        const realThreat = DataLoader.getThreat;
        DataLoader.getThreat = () => threat;
        ThreatsTab.renderThreatDetail('any', container);
        DataLoader.getThreat = realThreat;
        check('the linked threat keyword chip has a click listener', chips[0].listeners.filter(l => l.type === 'click').length, 1);
        check('the plain threat keyword chip has no listener', chips[1].listeners.length, 0);

        const shown = [];
        const realShowPopup = Glossary.showPopup;
        Glossary.showPopup = (definitions, anchorElement, termKey) => shown.push({ definitions, anchorElement, termKey });
        const activate = (key) => {
            Glossary._pinned = false;
            shown.length = 0;
            const event = keyEvent(key, chips[0]);
            let error = null;
            try {
                if (key === 'click') chips[0].click(); else Glossary.handleActivationKey(event);
            } catch (e) {
                error = e.message;
            }
            const popup = shown[0];
            return {
                error,
                popups: shown.length,
                definitionIsList: !!popup && Array.isArray(popup.definitions),
                typeAndKey: popup && Array.isArray(popup.definitions) ? [popup.definitions[0].type, popup.definitions[0].key] : null,
                termKey: popup && popup.termKey,
                anchorIsChip: !!popup && popup.anchorElement === chips[0],
                pinned: Glossary._pinned,
                stopped: !!chips[0].lastClick && chips[0].lastClick.stopped
            };
        };
        const expected = {
            error: null, popups: 1, definitionIsList: true, typeAndKey: ['keyword', 'imperium'],
            termKey: 'keyword-imperium', anchorIsChip: true, pinned: true, stopped: true
        };
        check('a click on a threat keyword chip opens the pinned keyword popup through showEntryPopup', activate('click'), expected);
        check('Enter on a threat keyword chip opens the same popup', activate('Enter'), expected);
        check('Space on a threat keyword chip opens the same popup', activate(' '), expected);
        Glossary.showPopup = realShowPopup;
        Glossary._pinned = false;

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
            const enterChip = fakeChip('SPAN', 'button');
            const enter = keyEvent('Enter', enterChip);
            Glossary.handleActivationKey(enter);
            check('Enter on a chip clicks it once', enterChip.clicks, 1);

            const spaceChip = fakeChip('SPAN', 'button');
            const space = keyEvent(' ', spaceChip);
            Glossary.handleActivationKey(space);
            check('Space on a chip clicks it once', spaceChip.clicks, 1);
            check('Space on a chip calls preventDefault, so the page does not scroll', space.defaultPrevented, true);

            const otherChip = fakeChip('SPAN', 'button');
            const other = keyEvent('a', otherChip);
            Glossary.handleActivationKey(other);
            check('another key does not click the chip', [otherChip.clicks, other.defaultPrevented], [0, false]);

            const plainSpan = fakeChip('SPAN', undefined);
            const plainEnter = keyEvent('Enter', plainSpan);
            Glossary.handleActivationKey(plainEnter);
            check('Enter on a span without the role does nothing', [plainSpan.clicks, plainEnter.defaultPrevented], [0, false]);

            // A native button clicks itself on Enter; the handler must not click it a second time
            const nativeButton = fakeChip('BUTTON', undefined);
            const buttonEnter = keyEvent('Enter', nativeButton);
            Glossary.handleActivationKey(buttonEnter);
            check('Enter on a <button> element does nothing', [nativeButton.clicks, buttonEnter.defaultPrevented], [0, false]);
        }

        // The glossary-term path: a term with the real attachHandlers listeners, then Enter
        {
            Glossary.data = DataLoader.cache['glossary.json'];
            const [keyA, keyB] = Object.keys(Glossary.data.conditions);
            const fakeTerm = (key) => ({
                listeners: [],
                dataset: { termKey: key, termType: 'condition' },
                addEventListener(type, handler) { this.listeners.push({ type, handler }); },
                matches(selector) { return matchesTagAndRole('SPAN', 'button', selector); },
                click() {
                    const event = { target: this, stopPropagation() {} };
                    this.listeners.filter(l => l.type === 'click').forEach(l => l.handler(event));
                }
            });
            const termA = fakeTerm(keyA);
            const termB = fakeTerm(keyB);
            Glossary.attachHandlers({ querySelectorAll: (selector) => (selector === '.glossary-term' ? [termA, termB] : []) });

            // A stand-in popup: the stack and the document hold it as showPopup does
            let popupCount = 0;
            const realShowPopup = Glossary.showPopup;
            Glossary.showPopup = (definitions, anchorElement, termKey) => {
                const id = `fake-popup-${popupCount++}`;
                fakeDocument.popups[id] = { dataset: { glossaryKey: termKey }, remove() { delete fakeDocument.popups[id]; } };
                Glossary.popupStack.push(id);
            };
            const reset = () => {
                Glossary.closeAllPopups();
                fakeDocument.popups = {};
            };
            // A hover popup: what the mouseenter timer of a term opens, not pinned
            const openHoverPopup = (term) => Glossary.handleTermClick({ target: term, stopPropagation() {} });
            const openKeys = () => Glossary.popupStack.map(id => fakeDocument.popups[id] && fakeDocument.popups[id].dataset.glossaryKey);

            reset();
            Glossary.handleActivationKey(keyEvent('Enter', termA));
            check('(a) Enter on a term with no popup open opens its pinned popup', [openKeys(), Glossary._pinned], [[keyA], true]);

            reset();
            openHoverPopup(termA);
            const hoverId = Glossary.popupStack[0];
            Glossary.handleActivationKey(keyEvent('Enter', termA));
            check('(b) Enter on a term with its own hover popup open pins that popup',
                [Glossary.popupStack, openKeys(), Glossary._pinned], [[hoverId], [keyA], true]);

            reset();
            openHoverPopup(termB);
            Glossary.handleActivationKey(keyEvent('Enter', termA));
            check('(c) Enter on a term with the hover popup of a different term open opens the focused term',
                [openKeys(), Glossary._pinned], [[keyA], true]);

            reset();
            Glossary.showPopup = realShowPopup;
        }

        // The document keydown listener of the popup engine routes the key into the click
        fakeDocument.listeners = [];
        await Glossary.init();
        const keydown = fakeDocument.listeners.filter(l => l.type === 'keydown');
        check('the popup engine adds one keydown listener', keydown.length, 1);
        const routedChip = fakeChip('SPAN', 'button');
        keydown[0].handler(keyEvent('Enter', routedChip));
        check('the keydown listener clicks a chip on Enter', routedChip.clicks, 1);
        let closed = 0;
        const realClose = Glossary.closeTopPopup;
        Glossary.closeTopPopup = () => closed++;
        keydown[0].handler(keyEvent('Escape', fakeChip('SPAN', 'button')));
        Glossary.closeTopPopup = realClose;
        check('Escape still closes the top popup', closed, 1);
    }

    // --- (4) The source map lives in DataLoader ---
    {
        check('DataLoader has the public source map', typeof DataLoader.glossaryIdToNormalized, 'object');
        check('SettingsTab no longer has the private source map', SettingsTab._glossaryIdToNormalized, undefined);
        check('the source map keeps its keys in order', Object.keys(DataLoader.glossaryIdToNormalized || {}),
            ['core', 'church', 'aeldari', 'fspg', 'voa', 'redacted1', 'redacted2', 'shotguns', 'dh', 'lex', 'apocrypha']);
        // The sources that getAllSources returned before the change. New source books can add to the list.
        const sources = DataLoader.getAllSources();
        check('getAllSources lists each source once', new Set(sources).size, sources.length);
        check('getAllSources still lists every source it gave before the change',
            ['Apocrypha', 'Church of Steel', 'Core Rules', 'Lex Imperialis', 'Redacted Records I', 'Redacted Records II',
                'Threat Assessment: Daemons & Heretics', 'Threat Assessment: Xenos', 'Vow of Absolution'].filter(s => !sources.includes(s)), []);
        check('isSourceEnabled maps a short id through the map', (() => {
            SettingsTab.excludedSources.add('Church of Steel');
            const result = SettingsTab.isSourceEnabled('church');
            SettingsTab.excludedSources.clear();
            return result;
        })(), false);
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
