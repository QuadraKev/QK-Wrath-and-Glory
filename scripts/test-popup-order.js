// Issue #33: a popup with more than one definition puts the definition of the clicked kind first.
// An all-caps keyword (GRAV in a keyword list) opens with the Keyword, and a mixed-case trait
// (Grav in a trait cell) opens with the Weapon Trait. The other definitions keep their order.
// The test loads each real engine with the real data, links the text through the real
// processText, and opens the popup through the real click and hover handlers. A stand-in
// showPopup records the definitions that the popup gets.
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

// Link the text, find the span of the word, attach the real handlers to a stand-in element,
// and fire the event. The result is the type label of each definition, in popup order.
function openPopup(Glossary, text, word, eventType) {
    const html = Glossary.processText(text);
    const tag = [...html.matchAll(/(<span class="glossary-term"[^>]*>)([^<]*)<\/span>/g)]
        .find(([, , inner]) => inner === word);
    if (!tag) return `no glossary term for "${word}" in ${html}`;
    const element = {
        listeners: [],
        dataset: {
            termKey: (tag[1].match(/data-term-key="([^"]+)"/) || [])[1],
            termType: (tag[1].match(/data-term-type="([^"]+)"/) || [])[1]
        },
        addEventListener(type, handler) { this.listeners.push({ type, handler }); }
    };
    Glossary.attachHandlers({ querySelectorAll: () => [element] });

    let labels = null;
    Glossary.showPopup = function (definitions) {
        labels = definitions.map(def => this.getTypeLabel(def.type));
    };
    Glossary.popupStack = [];
    Glossary._pinned = false;
    const event = { target: element, stopPropagation() {} };
    element.listeners.filter(l => l.type === eventType).forEach(l => l.handler(event));
    Glossary._pinned = false;
    return labels;
}

async function main() {
    for (const app of ['creator', 'bestiary']) {
        const Glossary = await loadEngine(app);
        for (const eventType of ['click', 'mouseenter']) {
            const how = eventType === 'click' ? 'click' : 'hover';
            const run = (text, word) => openPopup(Glossary, text, word, eventType);

            check(`${app} ${how}: the GRAV keyword opens with the Keyword`,
                run('IMPERIUM, GRAV', 'GRAV'), ['Keyword', 'Weapon Trait']);
            check(`${app} ${how}: the TESLA keyword opens with the Keyword`,
                run('NECRONS, TESLA', 'TESLA'), ['Keyword', 'Weapon Trait']);
            check(`${app} ${how}: the Grav trait opens with the Weapon Trait`,
                run('Grav, Heavy (4)', 'Grav'), ['Weapon Trait', 'Keyword']);
            check(`${app} ${how}: the Tesla trait opens with the Weapon Trait`,
                run('Tesla, Rapid Fire (2)', 'Tesla'), ['Weapon Trait', 'Keyword']);

            for (const [keyword, trait] of [['ARC', 'Arc'], ['MELTA', 'Melta'], ['RAD', 'Rad']]) {
                check(`${app} ${how}: the ${keyword} keyword opens with the Keyword`,
                    run(`IMPERIUM, ${keyword}`, keyword), ['Keyword', 'Weapon Trait']);
                check(`${app} ${how}: the ${trait} trait opens with the Weapon Trait`,
                    run(`${trait} (2), Heavy (4)`, trait), ['Weapon Trait', 'Keyword']);
            }

            check(`${app} ${how}: a term with one definition opens with that definition only`,
                run('Brutal, Heavy (4)', 'Brutal'), ['Weapon Trait']);
        }
    }

    console.log(failures === 0 ? '\nAll popup order checks passed.' : `\n${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
