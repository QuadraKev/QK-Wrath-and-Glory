// Issue #33: a popup with more than one definition puts the definition of the clicked kind first.
// An all-caps keyword (GRAV in a keyword list) opens with the Keyword, and a mixed-case trait
// (Grav in a trait cell) opens with the Weapon Trait. The other definitions keep their order.
// A mixed-case word with the type keyword ("Human" in prose) is not a click on a keyword, so its
// popup keeps the order of gatherDefinitionsByName.
// The test loads each real engine with the real data, links the text through the real
// processText, and opens the popup through the real click and hover handlers. A stand-in
// showPopup records the title and the type and name of each definition.
// Run: node scripts/test-popup-order.js

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

// Load the data loader and the engine of one app in one context, as the page does.
// The hover timer runs at once, so the hover handler opens its popup in the same call.
async function loadEngine(app) {
    const sandbox = {
        console: { log() {}, warn() {}, error: console.error },
        document: { addEventListener() {} },
        window: { api: { loadGameData: async (filename) => readJson(`data/${filename}`) } },
        setTimeout: (fn) => { fn(); return 0; },
        clearTimeout() {}
    };
    vm.createContext(sandbox);
    for (const rel of [`${app}/js/data-loader.js`, `${app}/js/glossary.js`]) {
        vm.runInContext(readSource(rel), sandbox, { filename: rel });
    }
    const DataLoader = vm.runInContext('DataLoader', sandbox);
    const Glossary = vm.runInContext('Glossary', sandbox);
    await DataLoader.loadAll();
    await Glossary.init();
    return Glossary;
}

// The popup as a list: the title first (the real showPopup takes it from the first
// definition), then "type name" for each definition in popup order.
const describe = (title, definitions) => [title, ...definitions.map(def => `${def.type} ${def.name}`)];

// Link the text, find the span of the word, attach the real handlers to a stand-in element,
// and fire the event. The result is the popup as describe() gives it.
function openPopup(Glossary, text, word, eventType) {
    const html = Glossary.processText(text);
    const tag = [...html.matchAll(/(<span class="glossary-term"[^>]*>)([^<]*)<\/span>/g)]
        .find(([, , inner]) => inner === word);
    if (!tag) return `no glossary term for "${word}" in ${html}`;
    const element = {
        listeners: [],
        textContent: tag[2],
        dataset: {
            termKey: (tag[1].match(/data-term-key="([^"]+)"/) || [])[1],
            termType: (tag[1].match(/data-term-type="([^"]+)"/) || [])[1]
        },
        addEventListener(type, handler) { this.listeners.push({ type, handler }); }
    };
    Glossary.attachHandlers({ querySelectorAll: () => [element] });

    let popup = null;
    Glossary.showPopup = (definitions) => {
        popup = describe(definitions[0].name, definitions);
    };
    Glossary.popupStack = [];
    Glossary._pinned = false;
    const event = { target: element, stopPropagation() {} };
    element.listeners.filter(l => l.type === eventType).forEach(l => l.handler(event));
    Glossary._pinned = false;
    return popup;
}

// The popup that main shows: the definitions in the order of gatherDefinitionsByName.
function mainOrder(Glossary, name) {
    const definitions = Glossary.gatherDefinitionsByName(name);
    return describe(definitions[0].name, definitions);
}

async function main() {
    for (const app of ['creator', 'bestiary']) {
        const Glossary = await loadEngine(app);
        for (const eventType of ['click', 'mouseenter']) {
            const how = eventType === 'click' ? 'click' : 'hover';
            const run = (text, word) => openPopup(Glossary, text, word, eventType);

            check(`${app} ${how}: the GRAV keyword opens with the Keyword`,
                run('IMPERIUM, GRAV', 'GRAV'), ['GRAV', 'keyword GRAV', 'weaponTrait Grav']);
            check(`${app} ${how}: the TESLA keyword opens with the Keyword`,
                run('NECRONS, TESLA', 'TESLA'), ['TESLA', 'keyword TESLA', 'weaponTrait Tesla']);
            check(`${app} ${how}: the Grav trait opens with the Weapon Trait`,
                run('Grav, Heavy (4)', 'Grav'), ['Grav', 'weaponTrait Grav', 'keyword GRAV']);
            check(`${app} ${how}: the Tesla trait opens with the Weapon Trait`,
                run('Tesla, Rapid Fire (2)', 'Tesla'), ['Tesla', 'weaponTrait Tesla', 'keyword TESLA']);

            for (const [keyword, trait] of [['ARC', 'Arc'], ['MELTA', 'Melta'], ['RAD', 'Rad']]) {
                check(`${app} ${how}: the ${keyword} keyword opens with the Keyword`,
                    run(`IMPERIUM, ${keyword}`, keyword), [keyword, `keyword ${keyword}`, `weaponTrait ${trait}`]);
                check(`${app} ${how}: the ${trait} trait opens with the Weapon Trait`,
                    run(`${trait} (2), Heavy (4)`, trait), [trait, `weaponTrait ${trait}`, `keyword ${keyword}`]);
            }

            check(`${app} ${how}: a term with one definition opens with that definition only`,
                run('Brutal, Heavy (4)', 'Brutal'), ['Brutal', 'weaponTrait Brutal']);

            // A mixed-case word gets the type keyword when the keyword is its only map entry.
            // It is not a click on a keyword, so the popup keeps the order that main shows.
            check(`${app} ${how}: a mixed-case Human in prose opens with the Species, as on main`,
                run('target a Human within 5m', 'Human'), ['Human', 'species Human', 'keyword HUMAN']);
            for (const name of ['Ork', 'Aeldari']) {
                check(`${app} ${how}: a mixed-case ${name} in prose opens as on main`,
                    run(`target an ${name} within 5m`, name), mainOrder(Glossary, name));
            }
            check(`${app} ${how}: the HUMAN keyword opens with the Keyword`,
                run('IMPERIUM, HUMAN', 'HUMAN'), ['HUMAN', 'keyword HUMAN', 'species Human']);

            // Fear has three definitions. Each form of the word links to the Condition.
            const fear = ['Fear', 'condition Fear', 'armorTrait Fear', 'talent Fear'];
            for (const word of ['Fear', 'FEAR', 'fear']) {
                check(`${app} ${how}: "${word}" opens with the Condition, then the others in order`,
                    run(`It causes ${word}.`, word), fear);
            }

            // Two opens in a row of the same term give the same popup.
            for (const [text, word] of [['IMPERIUM, GRAV', 'GRAV'], ['target a Human within 5m', 'Human']]) {
                check(`${app} ${how}: a second open of "${word}" gives the same popup`,
                    run(text, word), run(text, word));
            }
        }
    }

    // In the real data, the clicked kind of Fear is already first, so a swap of the first and the
    // clicked definition gives the same order as a move to the front. A test-only FEAR keyword puts
    // the clicked kind last of four definitions, where the two give different orders.
    for (const app of ['creator', 'bestiary']) {
        const Glossary = await loadEngine(app);
        Glossary.data.keywords.fear_test = { name: 'FEAR', description: 'A test-only keyword.' };
        Glossary.termMap = new Map();
        Glossary.buildTermMap();
        check(`${app}: a keyword last of four definitions moves to the front, the others keep their order`,
            openPopup(Glossary, 'IMPERIUM, FEAR', 'FEAR', 'click'),
            ['FEAR', 'keyword FEAR', 'condition Fear', 'armorTrait Fear', 'talent Fear']);
    }

    console.log(failures === 0 ? '\nAll popup order checks passed.' : `\n${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
