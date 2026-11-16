// Browser proof for the bug pass of the bestiary app (headless Chromium, Playwright).
// It has three modes:
//   node scripts/browser-bestiary.js                   run the scenarios (one for each finding)
//   node scripts/browser-bestiary.js --only NAME       run the scenarios whose name starts with NAME
//   node scripts/browser-bestiary.js --snapshot FILE   write the DOM of each shipped threat to FILE
//   node scripts/browser-bestiary.js --compare FILE    compare the DOM of each shipped threat with FILE
// Run it with:
//   PROOF_TMP=<scratch folder> PW=<folder of the playwright package> node scripts/browser-bestiary.js <mode>
// PW is the folder that holds the playwright package. Playwright is not a dependency of the repo.
// PROOF_TMP is a scratch folder for the fixture files. It has no fallback.
// PORT is the port of the static server of the script. The default is 8172. The script refuses 8137.
// The script is not a test-*.js script, because it needs Playwright and a browser.

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || '8172';
const BASE = `http://127.0.0.1:${PORT}/bestiary/`;
const KEY_ENC = 'wng-bestiary-autosave';
const KEY_BLD = 'wng-bestiary-builder-autosave';

let failures = 0;
let cur = null; // the counters of the scenario that runs now

function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    if (cur) { cur.total++; if (!ok) cur.failed++; }
    const show = (v) => { const s = JSON.stringify(v); return s === undefined ? 'undefined' : (s.length > 700 ? s.slice(0, 700) + '...' : s); };
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${show(expected)}, got ${show(actual)}`);
}

function fail(message) {
    failures++;
    if (cur) { cur.total++; cur.failed++; }
    console.log(`FAIL  ${message}`);
}

if (Number(PORT) === 8137) {
    console.log('FAIL  port 8137 is the port of the owner. Use another port.');
    process.exit(1);
}
if (!Number.isInteger(Number(PORT)) || Number(PORT) < 1 || Number(PORT) > 65535) {
    console.log(`FAIL  PORT is not a port number: ${PORT}`);
    process.exit(1);
}
if (!process.env.PROOF_TMP) {
    console.log('FAIL  PROOF_TMP is not set');
    process.exit(1);
}
if (!process.env.PW) {
    console.log('FAIL  PW is not set');
    process.exit(1);
}
const { chromium } = require(process.env.PW + '/index.js');

// ===== Static server =====

const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

function startServer() {
    const server = http.createServer((req, res) => {
        let rel = decodeURIComponent(req.url.split('?')[0]);
        if (rel.endsWith('/')) rel += 'index.html';
        const file = path.normalize(path.join(ROOT, rel));
        if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
        fs.readFile(file, (err, data) => {
            if (err) { res.writeHead(404); res.end('not found'); return; }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
            res.end(data);
        });
    });
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(Number(PORT), '127.0.0.1', () => resolve(server));
    });
}

// ===== Hostile text =====

function P(f) {
    return `${f}" data-pwn="${f}"></textarea><img src=x data-pwnimg="${f}" onerror="(window.__hits=window.__hits||[]).push('${f}')">`;
}

// Reads the hits of one step. The list of script hits is cleared after the read, so that a later step starts with none (TB10-5).
async function hits(page) {
    return page.evaluate(() => {
        const js = [...new Set(window.__hits || [])];
        window.__hits = [];
        return {
            js,
            attr: [...new Set([...document.querySelectorAll('[data-pwn]')].map(e => e.getAttribute('data-pwn')))],
            img: [...new Set([...document.querySelectorAll('[data-pwnimg]')].map(e => e.getAttribute('data-pwnimg')))]
        };
    });
}

async function pickFile(page, selector, filePath) {
    const [fc] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 8000 }),
        page.click(selector)
    ]);
    await fc.setFiles(filePath);
    await page.waitForTimeout(400);
}

function hostileThreat(prefix, id) {
    const p = (f) => P(prefix + f);
    return {
        id,
        name: p('name'), source: p('source'), quote: p('quote'), attribution: p('attribution'),
        description: 'Shock ' + p('description'),
        defenceNote: p('defenceNote'), speedNote: p('speedNote'), determination: p('determination'), size: p('size'),
        skills: 'Default 4, ' + p('skills') + ' 5',
        mobOptions: p('mobOptions'), threatOptions: p('threatOptions'), biomorphs: p('biomorphs'),
        page: p('page'),
        tierThreat: { '1': 'T', '2': p('tier2'), '3': '-', '4': '-', '5': '-' },
        keywords: [p('kw'), 'ORK'],
        attributes: { S: p('attrS'), T: 3, A: 3, I: 3, Wil: 3, Int: 3, Fel: 3 },
        resilience: { value: p('resval'), note: p('resnote') },
        defence: p('defence'), wounds: 5, shock: p('shock'), conviction: p('conviction'), resolve: p('resolve'), speed: p('speed'),
        abilities: [
            { type: 'ACTION', name: p('abname'), description: 'Shock ' + p('abdesc'), stats: p('abstats') },
            { type: p('abtype'), name: 'X', description: 'y' }
        ],
        bonuses: [{ name: p('boname'), description: p('bodesc') }],
        mobAbilities: [{ name: p('mobabname'), description: p('mobabdesc') }]
    };
}

const mkInd = (id, threatId, o = {}) => Object.assign({
    id, threatId, bonus: 'none', currentWounds: 0, currentShock: 0, maxWounds: 5, maxShock: 4,
    mobId: null, initiative: null, notes: '', additionalWeaponId: null, personalRuin: 0
}, o);

const mkEnc = (o = {}) => Object.assign({
    version: 1, settings: { tier: 1, playerCount: 4, name: 'Unnamed Encounter', round: 1 },
    individuals: [], mobs: [], playerCharacters: [], vehicles: [], encounterOrder: null, customThreats: []
}, o);

function buildFixtures() {
    const hostileId = 'custom_' + P('E_tid');
    const hostileCustom = hostileThreat('E_', hostileId);
    const hostileEncounter = {
        version: 1,
        settings: { tier: 1, playerCount: 2, name: P('E_sname'), round: 1 },
        individuals: [
            mkInd(P('E_i1'), hostileId, { bonus: P('E_bonus'), notes: P('E_inotes'), additionalWeaponId: P('E_wpn') }),
            mkInd(P('E_i2'), hostileId, { mobId: P('E_m1') }),
            mkInd(P('E_i3'), hostileId, { mobId: P('E_m1') })
        ],
        mobs: [{ id: P('E_m1'), threatId: hostileId, name: P('E_mname'), initiative: null, notes: P('E_mnotes') }],
        playerCharacters: [{ id: P('E_p1'), name: P('E_pcname'), initiative: 5, notes: P('E_pcnotes') }],
        vehicles: [{ id: P('E_v1'), vehicleId: 'chimera', wounds: 0, initiative: null }],
        encounterOrder: null,
        customThreats: [hostileCustom]
    };
    return {
        hostileId,
        hostileCustom,
        encounter: hostileEncounter,
        threat: hostileThreat('T_', P('T_id')),
        players: { version: 1, playerCount: 3, players: [{ name: P('L_name'), notes: P('L_notes') }] }
    };
}

// ===== Browser helpers =====

let browser = null;
let tmpDir = null;
let sessions = [];
const hostile = buildFixtures();

function writeFixture(name, obj) {
    const file = path.join(tmpDir, name);
    fs.writeFileSync(file, JSON.stringify(obj));
    return file;
}

// A session is a context with one page, a list of page errors and a list of console.warn texts.
async function newSession(opts = {}) {
    const mobile = !!opts.mobile;
    const context = opts.context || await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1400, height: 900 } });
    context.setDefaultTimeout(8000);
    const page = await context.newPage();
    const session = { context, page, errors: [], warns: [], dialogs: 0, close: () => context.close() };
    page.on('dialog', d => { session.dialogs++; d.accept(); });
    const errors = session.errors;
    const warns = session.warns;
    page.on('pageerror', e => errors.push(String(e.message).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'warning') warns.push(m.text()); });
    if (!opts.context) sessions.push(session);
    return session;
}

// The start. At most 60 s: a stored count of 300000 blocks the page for about 35 s at the base tree.
async function waitStart(page, soft) {
    try {
        await page.waitForFunction(() => document.querySelectorAll('#threat-list .threat-list-item').length > 800, null, { timeout: 60000 });
        return true;
    } catch (e) {
        if (!soft) throw e;
        return false;
    }
}

async function open(page, soft) {
    await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
    return waitStart(page, soft);
}

async function reload(page, soft) {
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    return waitStart(page, soft);
}

const goTab = (page, t) => page.evaluate((t) => document.querySelector(`.tab-btn[data-tab="${t}"]`).click(), t);
const clickSel = (page, sel, nth = 0) => page.evaluate(([s, n]) => {
    const el = document.querySelectorAll(s)[n];
    if (!el) return false;
    el.click();
    return true;
}, [sel, nth]);
const fillTab = async (page, sel, val) => { await page.fill(sel, val); await page.press(sel, 'Tab'); };
const ls = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const lsSet = (page, key, val) => page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, val]);
const wait = (page, ms) => page.waitForTimeout(ms);

// Click the Threats tab row of a threat. Find it by the id, or by the start of its name.
const clickThreatRowById = (page, id) => page.evaluate((id) => {
    const row = [...document.querySelectorAll('#threat-list .threat-list-item')].find(r => r.dataset.threatId === id);
    if (!row) return false;
    row.click();
    return true;
}, id);
const clickThreatRowByName = (page, start) => page.evaluate((start) => {
    const el = [...document.querySelectorAll('#threat-list .threat-list-name')].find(n => n.textContent.startsWith(start));
    if (!el) return false;
    el.closest('.threat-list-item').click();
    return true;
}, start);

const stateOf = (page) => page.evaluate(() => ({
    ind: EncounterState.individuals.length,
    mobs: EncounterState.mobs.length,
    pc: EncounterState.playerCharacters.map(p => p.name),
    settings: EncounterState.settings,
    builder: ThreatBuilderState.threat
}));

async function addThreat(page, id, qty = 1) {
    await page.evaluate(([id, q]) => EncounterState.addIndividual(id, q), [id, qty]);
}

// ===== Fold and snapshot =====

const FOLD_SRC = "(s) => s.replace(/\\s+/g, ' ').replace(/> </g, '><').trim()";

const B6_IDS = ['necron_warrior', 'triarch_praetorian', 'canoptek_wraith', 'lokhust_destroyer', 'fire_warrior',
    'sniper_drone', 'gun_drone', 'kroot_hounds', 'xv25_stealth_battlesuit_shasui', 'pathfinder', 'kroot_carnivore'];

async function buildMap() {
    const session = await newSession();
    const page = session.page;
    await open(page);
    const entries = {};
    Object.assign(entries, await page.evaluate((foldSrc) => {
        const fold = eval(foldSrc);
        const out = {};
        let div = document.createElement('div');
        div.innerHTML = ThreatBuilderTab.renderAbilityPickerItems('ALL', '');
        out['picker:ability'] = fold(div.innerHTML);
        div = document.createElement('div');
        div.innerHTML = ThreatBuilderTab.renderBonusPickerItems('');
        out['picker:bonus'] = fold(div.innerHTML);
        ThreatsTab.renderThreatList();
        out['list'] = fold(document.getElementById('threat-list').innerHTML);
        return out;
    }, FOLD_SRC));
    const ids = (await page.evaluate(() => DataLoader.getAllThreats().map(t => t.id))).sort();
    for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        Object.assign(entries, await page.evaluate(([foldSrc, chunk]) => {
            const fold = eval(foldSrc);
            const out = {};
            for (const id of chunk) {
                ThreatsTab.renderThreatDetail(id);
                out['card:' + id] = fold(document.getElementById('threat-detail').innerHTML);
                const div = document.createElement('div');
                div.innerHTML = EncounterTab.renderThreatCardMini(DataLoader.getThreat(id));
                Glossary.enhanceDescriptions(div);
                out['mini:' + id] = fold(div.innerHTML);
                ThreatBuilderState.loadTemplate(id);
                ThreatBuilderTab.renderPreview();
                out['preview:' + id] = fold(document.getElementById('builder-preview-content').innerHTML);
                out['copy:' + id] = ThreatsTab.buildThreatCopyText(DataLoader.getThreat(id));
            }
            return out;
        }, [FOLD_SRC, chunk]));
    }
    check('dom: the page has no page error', session.errors, []);
    await session.close();
    return entries;
}

async function runSnapshot(file) {
    const entries = await buildMap();
    fs.writeFileSync(file, JSON.stringify({ version: 1, entries }));
    console.log(`Snapshot written: ${Object.keys(entries).length} entries`);
}

// A B6 key may change only in its list blocks (spec section 9). The rest of the key must be the same, character for character.
// A list block is the section of the card ("Mob Abilities" or "Mob Options") or the section of the mini card.
function divEnd(html, start) {
    const re = /<div\b|<\/div>/g;
    re.lastIndex = start;
    let depth = 0;
    let m;
    while ((m = re.exec(html))) {
        if (m[0] === '</div>') { depth--; if (depth === 0) return re.lastIndex; } else depth++;
    }
    return -1;
}

const LIST_STARTS = [
    { kind: 'card', re: /<div class="bonuses-section"><div class="bonuses-header">(Mob Abilities|Mob Options)<\/div>/g },
    { kind: 'mini', re: /<div class="mini-section"><(?:span|div) class="mini-section-label">(Mob Abilities|Mob Options):?<\/(?:span|div)>/g }
];

// The list blocks of a string, in order, and the string without them.
function splitLists(html) {
    const blocks = [];
    for (const { kind, re } of LIST_STARTS) {
        re.lastIndex = 0;
        let m;
        while ((m = re.exec(html))) {
            const end = divEnd(html, m.index);
            if (end < 0) continue;
            blocks.push({ kind, label: m[1], start: m.index, end, text: html.slice(m.index, end) });
            re.lastIndex = end;
        }
    }
    blocks.sort((a, b) => a.start - b.start);
    let rest = '';
    let pos = 0;
    blocks.forEach(b => { rest += html.slice(pos, b.start); pos = b.end; });
    return { blocks, rest: rest + html.slice(pos) };
}

// The count of entries that a new block holds, or -1 when the block is not the list form of spec section 9.
function listEntries(block) {
    const t = block.text;
    if (t.includes('[object Object]')) return -1;
    if (block.kind === 'card') {
        // The header, then one bonus-item for each entry. An item holds a name and a description and no div.
        let pos = t.indexOf('</div>') + '</div>'.length;
        let n = 0;
        while (t.startsWith('<div class="bonus-item">', pos)) {
            const end = divEnd(t, pos);
            const item = t.slice(pos, end);
            if (end < 0 || item.indexOf('<div', 5) >= 0 || !item.includes('class="bonus-name"') || !item.includes('class="bonus-description"')) return -1;
            pos = end;
            n++;
        }
        return t.slice(pos) === '</div>' ? n : -1;
    }
    // The mini card: the label, then a mini-abilities div that holds one ability-mini for each entry.
    const open = '<div class="mini-abilities">';
    let pos = t.indexOf(open);
    if (pos < 0) return -1;
    const container = divEnd(t, pos);
    pos += open.length;
    let n = 0;
    while (t.startsWith('<div class="ability-mini">', pos)) {
        const end = divEnd(t, pos);
        const item = t.slice(pos, end);
        if (end < 0 || !item.includes('class="ability-name-mini"')) return -1;
        pos = end;
        n++;
    }
    return container === t.length - '</div>'.length && pos === container - '</div>'.length ? n : -1;
}

// The problem of a B6 key, or null. The key may differ from the baseline only in its list blocks.
function listProblem(base, now) {
    const a = splitLists(base);
    const b = splitLists(now);
    if (a.blocks.length === 0) return 'the baseline has no list block';
    if (a.blocks.length !== b.blocks.length) return `${a.blocks.length} list blocks in the baseline, ${b.blocks.length} now`;
    for (let i = 0; i < a.blocks.length; i++) {
        const was = a.blocks[i];
        const is = b.blocks[i];
        const wanted = was.text.split('[object Object]').length - 1;
        if (was.kind !== is.kind || was.label !== is.label) return `list block ${i + 1} is ${is.kind} ${is.label}, not ${was.kind} ${was.label}`;
        if (listEntries(is) !== wanted) return `list block ${i + 1} (${is.label}) is not a list of ${wanted} entries in the form of spec section 9`;
    }
    if (a.rest !== b.rest) return 'the markup outside the list blocks differs: ' + around(a.rest, b.rest);
    return null;
}

function around(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    const from = Math.max(0, i - 80);
    return `baseline [${a.slice(from, i + 80)}] now [${b.slice(from, i + 80)}]`;
}

async function runCompare(file) {
    const base = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (base.version !== 1) { fail(`dom: the baseline has version ${base.version}`); return; }
    const now = await buildMap();
    const missing = Object.keys(base.entries).filter(k => !(k in now));
    check('dom: each baseline key is present', missing.slice(0, 10), []);
    const allowed = new Set();
    B6_IDS.forEach(id => { allowed.add('card:' + id); allowed.add('mini:' + id); });
    const differ = Object.keys(base.entries).filter(k => k in now && base.entries[k] !== now[k]);
    const extra = Object.keys(now).filter(k => !(k in base.entries));
    const unexpected = differ.filter(k => !allowed.has(k)).concat(extra);
    check('dom: no unexpected difference', unexpected.length, 0);
    const problems = [];
    differ.filter(k => allowed.has(k) && k in now).forEach(k => {
        const problem = listProblem(base.entries[k], now[k]);
        if (problem !== null) problems.push(`${k}: ${problem}`);
    });
    check('dom: a B6 key differs from the baseline only in its list blocks', problems.slice(0, 10), []);
    console.log(`        keys that differ and are allowed (B6): ${differ.filter(k => allowed.has(k)).length}`);
}

// ===== Scenarios =====

const scenarios = [];
const scenario = (name, fn) => scenarios.push({ name, fn });

// A hostile step passes when it runs no script and adds no test element or test attribute.
// The step waits until each test image has failed to load, so that no late onerror handler reports in the next step.
async function hostileStep(page, label, kind) {
    await wait(page, 300);
    await page.waitForFunction(() => [...document.querySelectorAll('img[data-pwnimg]')].every(img => img.complete));
    await wait(page, 100);
    const h = await hits(page);
    check(`hostile ${kind} ${label}: no script, no injected element, no attribute break`, { js: h.js, attr: h.attr, img: h.img }, { js: [], attr: [], img: [] });
}

const ROW_TYPES = ['individual', 'mob', 'player', 'vehicle'];

// Hover a glossary term and click it. A missing term is a failure: the custom text must reach the glossary popup.
async function hoverTerm(page, sel, label) {
    const term = page.locator(sel).first();
    const found = await term.count() > 0;
    check(`hostile desktop: a glossary term is in ${label}`, found, true);
    if (found) {
        await term.hover();
        await wait(page, 400);
        await term.click({ timeout: 3000 }).catch(() => {});
    }
}

async function rowTypeCounts(page) {
    return page.evaluate(() => {
        const out = { individual: 0, mob: 0, player: 0, vehicle: 0 };
        document.querySelectorAll('#encounter-list .encounter-item[data-type]').forEach(el => { if (el.dataset.type in out) out[el.dataset.type]++; });
        return out;
    });
}

// C1: hostile text in each encounter, threat, player and builder file, on a desktop screen.
scenario('hostile-desktop', async () => {
    const s = await newSession();
    const page = s.page;
    const files = {
        enc: writeFixture('hostile.encounter', hostile.encounter),
        thr: writeFixture('hostile.threat', hostile.threat),
        pl: writeFixture('hostile.players', hostile.players)
    };
    await open(page);
    const step = (label) => hostileStep(page, label, 'desktop');

    await goTab(page, 'encounter');
    await pickFile(page, '#btn-load-encounter', files.enc);
    await step('load encounter');
    check('hostile desktop: the four row types are drawn after the load', await rowTypeCounts(page), { individual: 1, mob: 1, player: 1, vehicle: 1 });

    for (const type of ROW_TYPES) {
        await clickSel(page, `#encounter-list .encounter-item[data-type="${type}"]`);
        await wait(page, 200);
        await step(`select ${type}`);
    }

    await clickSel(page, '#encounter-list .encounter-item[data-type="individual"]');
    await wait(page, 200);
    await hoverTerm(page, '#encounter-detail .ability-desc-mini .glossary-term', 'the encounter detail');
    await step('glossary hover and click in the encounter detail');

    // The detail of a mob member shows the line "Part of: <mob name>".
    const mobName = hostile.encounter.mobs[0].name;
    await page.evaluate((id) => EncounterTab.selectItem(id, 'individual'), hostile.encounter.individuals[1].id);
    await wait(page, 200);
    await step('detail of a mob member');
    check('hostile desktop: the detail of a mob member shows the mob name', await page.evaluate(() => {
        const el = document.querySelector('#encounter-detail .mob-membership span');
        return el ? el.textContent : null;
    }), 'Part of: ' + mobName);

    await goTab(page, 'threats');
    await step('threats tab');
    const rowFound = await clickThreatRowByName(page, 'E_name');
    await wait(page, 300);
    await step('threat card');
    check('hostile desktop: the hostile threat card is drawn', { rowFound, cards: await page.locator('#threat-detail .threat-card').count() }, { rowFound: true, cards: 1 });

    await hoverTerm(page, '#threat-detail .ability-description .glossary-term', 'the threat card');
    await step('glossary hover and click');

    await page.evaluate((id) => { ThreatsTab.buildThreatCopyText(DataLoader.getThreat(id)); }, hostile.hostileId);
    await step('copy text');

    await clickSel(page, '#btn-customize-threat');
    await wait(page, 500);
    await step('customize');
    check('hostile desktop customize: the builder holds the hostile threat', await page.evaluate(() => {
        const el = document.querySelector('#builder-editor-sections [data-field="name"]');
        return el ? el.value.startsWith('E_name') : null;
    }), true);

    // A picker row shows the hostile threat when its threat column starts with the hostile name.
    const pickerRows = () => page.evaluate(() => [...document.querySelectorAll('.ability-picker-item-threat')].filter(e => e.textContent.startsWith('E_name')).length > 0);
    await clickSel(page, '#btn-browse-abilities');
    await wait(page, 300);
    await step('browse abilities');
    check('hostile desktop browse abilities: the hostile threat is in the picker', await pickerRows(), true);
    await clickSel(page, '.ability-picker-close');
    await clickSel(page, '#btn-browse-bonuses');
    await wait(page, 300);
    await step('browse bonuses');
    check('hostile desktop browse bonuses: the hostile threat is in the picker', await pickerRows(), true);
    await clickSel(page, '.ability-picker-close');

    await page.evaluate(() => ThreatBuilderTab.renderTemplateDropdown('E_', 'sidebar'));
    await step('template search');
    check('hostile desktop template search: the hostile threat is in the list', await page.evaluate(() =>
        [...document.querySelectorAll('#builder-template-dropdown-sidebar .builder-dropdown-item')].some(e => e.textContent.startsWith('E_name'))), true);

    await page.evaluate(() => ThreatBuilderTab.showInjectModal(ThreatBuilderState.threat.name, 2));
    await step('rename modal');
    check('hostile desktop rename modal: the modal holds the hostile name', await page.evaluate(() => {
        const input = document.getElementById('inject-modal-name');
        const warning = document.querySelector('.inject-modal-warning');
        return { input: input ? input.value.startsWith('E_name') : null, warning: warning ? warning.textContent.includes('E_name') : null };
    }), { input: true, warning: true });
    await clickSel(page, '.inject-modal-close');

    await goTab(page, 'builder');
    await pickFile(page, '#btn-builder-load', files.thr);
    await step('load threat in the builder');

    await goTab(page, 'encounter');
    await pickFile(page, '#btn-import-threat', files.thr);
    await step('import threat');

    await pickFile(page, '#btn-load-players', files.pl);
    await step('load players');

    await wait(page, 2500);
    await reload(page);
    await step('reload');
    await goTab(page, 'encounter');
    check('hostile desktop: the four row types are drawn after the reload', await rowTypeCounts(page), { individual: 2, mob: 1, player: 1, vehicle: 1 });
    for (const type of ROW_TYPES) {
        await clickSel(page, `#encounter-list .encounter-item[data-type="${type}"]`);
        await wait(page, 200);
        await step(`select ${type} after the reload`);
    }

    check('hostile desktop: no page error', s.errors, []);

    const before = await page.evaluate(() => EncounterState.individuals.length);
    const clicked = await page.evaluate((id) => {
        const btn = [...document.querySelectorAll('#encounter-list .delete-btn')].find(b => b.dataset.type === 'individual' && b.dataset.id === id);
        if (!btn) return false;
        btn.click();
        return true;
    }, hostile.encounter.individuals[0].id);
    const after = await page.evaluate(() => EncounterState.individuals.length);
    check('hostile desktop: the free individual can be removed by its button', { clicked, change: after - before }, { clicked: true, change: -1 });
});

// C1: hostile text on a phone screen, through the auto-save and the bottom sheet.
scenario('hostile-mobile', async () => {
    const s = await newSession({ mobile: true });
    const page = s.page;
    writeFixture('hostile.encounter', hostile.encounter);
    await open(page);
    const step = (label) => hostileStep(page, label, 'mobile');

    await lsSet(page, KEY_ENC, JSON.stringify({ encounter: hostile.encounter, customThreats: [hostile.hostileCustom], timestamp: 1 }));
    await reload(page);
    await step('restore');
    check('hostile mobile: the four row types are drawn after the restore', await rowTypeCounts(page), { individual: 1, mob: 1, player: 1, vehicle: 1 });

    for (const type of ROW_TYPES) {
        await clickSel(page, `#encounter-list .encounter-item[data-type="${type}"]`);
        await wait(page, 300);
        await step(`select ${type}`);
    }

    // switchTab closes the sheet and empties it 320 ms later. The row click must come after that.
    await page.evaluate(() => App.switchTab('threats'));
    await wait(page, 450);
    const rowFound = await clickThreatRowByName(page, 'E_name');
    await wait(page, 400);
    await step('threat card');
    check('hostile mobile: the hostile threat card opens in the sheet', { rowFound, cards: await page.locator('#bottom-sheet-content .threat-card').count() }, { rowFound: true, cards: 1 });

    await clickSel(page, '#bottom-sheet-content #btn-customize-threat');
    await wait(page, 500);
    await step('customize');
    check('hostile mobile customize: the builder holds the hostile threat', await page.evaluate(() => (ThreatBuilderState.threat.name || '').startsWith('E_name')), true);

    await clickSel(page, '#btn-builder-preview');
    await wait(page, 400);
    await step('preview');
    check('hostile mobile: the preview opens in the sheet with the hostile threat', await page.evaluate(() => {
        const title = document.querySelector('#bottom-sheet-content .threat-card-title');
        return { cards: document.querySelectorAll('#bottom-sheet-content .threat-card').length, hostile: title ? title.textContent.startsWith('E_name') : null };
    }), { cards: 1, hostile: true });

    check('hostile mobile: no page error', s.errors, []);
});

// C2: a player name with quotes.
scenario('c2', async () => {
    const s = await newSession();
    const page = s.page;
    await open(page);
    await goTab(page, 'encounter');
    const box = '.pc-name-input[data-index="0"]';
    await fillTab(page, box, 'Bob "Big" Smith');
    await page.evaluate(() => EncounterTab.render());
    check('c2: the name survives a redraw', await page.locator(box).inputValue(), 'Bob "Big" Smith');
    // A user appends text to the redrawn box. A cut box value then cuts the stored name.
    await page.locator(box).focus();
    await page.keyboard.press('End');
    await page.keyboard.type(' Jr');
    await page.keyboard.press('Tab');
    check('c2: an edit stores the full name', await page.evaluate(() => EncounterState.playerCharacters[0] && EncounterState.playerCharacters[0].name), 'Bob "Big" Smith Jr');
    await wait(page, 2500);
    await reload(page);
    check('c2: the name survives a reload', await page.locator(box).inputValue(), 'Bob "Big" Smith Jr');
});

// C3: notes with entity text and a leading line break.
scenario('c3', async () => {
    const s = await newSession();
    const page = s.page;
    await open(page);
    await goTab(page, 'encounter');
    await page.evaluate(() => {
        EncounterState.addIndividual('sly_marbo_aaa', 1);
        EncounterState.addIndividual('astra_militarum_trooper', 2, true);
    });
    await fillTab(page, '.pc-name-input[data-index="0"]', 'Pam');
    await page.evaluate(() => EncounterTab.render());

    const TYPED = '\nHP &lt;5 &amp; </textarea> x';
    const kinds = [
        { kind: 'individual', row: '#encounter-list .encounter-item[data-type="individual"]', box: '#individual-notes',
            stored: () => EncounterState.individuals.find(i => !i.mobId).notes },
        { kind: 'mob', row: '#encounter-list .encounter-item[data-type="mob"]', box: '#mob-notes',
            stored: () => EncounterState.mobs[0].notes },
        { kind: 'player', row: '#encounter-list .encounter-item[data-type="player"]', box: '#player-notes',
            stored: () => EncounterState.playerCharacters[0].notes }
    ];
    const after = {};
    for (const k of kinds) {
        await clickSel(page, k.row);
        await page.fill(k.box, TYPED);
        await clickSel(page, k.row);
        const shown = await page.locator(k.box).inputValue();
        check(`c3: ${k.kind} notes survive a redraw`, shown, TYPED);
        await page.locator(k.box).focus();
        await page.keyboard.press('Control+End');
        await page.keyboard.type('!');
        const stored = await page.evaluate(`(${k.stored.toString()})()`);
        check(`c3: ${k.kind} notes survive an edit`, stored, TYPED + '!');
        after[k.kind] = stored;
    }
    await wait(page, 2500);
    await reload(page);
    const reloaded = await page.evaluate(() => ({
        individual: (EncounterState.individuals.find(i => !i.mobId) || {}).notes,
        mob: (EncounterState.mobs[0] || {}).notes,
        player: (EncounterState.playerCharacters[0] || {}).notes
    }));
    check('c3: the notes survive a reload', reloaded, { individual: TYPED + '!', mob: TYPED + '!', player: TYPED + '!' });

    await goTab(page, 'builder');
    await page.fill('textarea[data-field="description"]', '\nfirst line');
    await page.evaluate(() => ThreatBuilderTab.renderEditor());
    check('c3: a builder description keeps its leading line break', await page.locator('textarea[data-field="description"]').inputValue(), '\nfirst line');
});

// C4: a loaded encounter file and an immediate reload.
scenario('c4', async () => {
    const s = await newSession();
    const page = s.page;
    await open(page);
    await addThreat(page, 'sly_marbo_aaa');
    await wait(page, 2500);
    const file = writeFixture('c4.encounter', mkEnc({
        settings: { tier: 2, playerCount: 3, name: 'B', round: 4 },
        playerCharacters: [{ id: 'p1', name: 'Bravo', initiative: null, notes: '' }]
    }));
    await goTab(page, 'encounter');
    await pickFile(page, '#btn-load-encounter', file);
    await reload(page);
    const got = await page.evaluate(() => ({
        ind: EncounterState.individuals.length,
        pc: EncounterState.playerCharacters.map(p => p.name),
        round: EncounterState.settings.round
    }));
    check('c4: a loaded file survives an immediate reload', got, { ind: 0, pc: ['Bravo'], round: 4 });
});

// C5: a removed last entry and a builder that is pristine again.
scenario('c5', async () => {
    const s = await newSession();
    const page = s.page;
    await open(page);
    await addThreat(page, 'sly_marbo_aaa');
    await goTab(page, 'encounter');
    await wait(page, 2500);
    const encWrote = await ls(page, KEY_ENC) !== null;
    const clicked = await clickSel(page, '#encounter-list .encounter-item .delete-btn');
    await reload(page);
    check('c5: a removed last threat stays removed', { clicked, ind: await page.evaluate(() => EncounterState.individuals.length) }, { clicked: true, ind: 0 });
    check('c5: the encounter key is gone', { wroteBefore: encWrote, key: await ls(page, KEY_ENC) }, { wroteBefore: true, key: null });

    await goTab(page, 'builder');
    await page.fill('[data-field="name"]', 'X');
    await wait(page, 2500);
    const bldWrote = await ls(page, KEY_BLD) !== null;
    await page.fill('[data-field="name"]', '');
    await reload(page);
    check('c5: a builder made pristine stays empty', await page.evaluate(() => ThreatBuilderState.threat.name), '');
    check('c5: the builder key is gone', { wroteBefore: bldWrote, key: await ls(page, KEY_BLD) }, { wroteBefore: true, key: null });
});

// CB1: a second tab that never wrote a key must not remove the key of the first tab.
scenario('twotabs', async () => {
    const a = await newSession();
    const b = await newSession({ context: a.context });
    await open(a.page);
    await open(b.page);
    await addThreat(a.page, 'sly_marbo_aaa');
    await goTab(a.page, 'builder');
    await a.page.fill('[data-field="name"]', 'A1');
    await wait(a.page, 2500);
    const keptEnc = await ls(a.page, KEY_ENC);
    const keptBld = await ls(a.page, KEY_BLD);
    const pb = b.page;
    await goTab(pb, 'encounter');
    await pb.selectOption('#encounter-tier', '2');
    await pb.click('#btn-round-plus');
    await pb.click('#btn-sort-initiative');
    await goTab(pb, 'builder');
    await pb.fill('[data-field="name"]', 'Z');
    await pb.fill('[data-field="name"]', '');
    await goTab(pb, 'encounter');
    await pb.click('#btn-clear-encounter');
    await goTab(pb, 'builder');
    await pb.click('#btn-builder-clear');
    await wait(pb, 2500);
    const nowEnc = await ls(pb, KEY_ENC);
    const nowBld = await ls(pb, KEY_BLD);
    // Tab B accepts two dialogs: the two Clear buttons. A page that never bound its Clear button accepts fewer.
    check('twotabs: the encounter key of tab A stays', { present: nowEnc !== null, same: nowEnc === keptEnc, aWrote: keptEnc !== null, dialogsOfB: b.dialogs }, { present: true, same: true, aWrote: true, dialogsOfB: 2 });
    check('twotabs: the builder key of tab A stays', { present: nowBld !== null, same: nowBld === keptBld, aWrote: keptBld !== null, dialogsOfB: b.dialogs }, { present: true, same: true, aWrote: true, dialogsOfB: 2 });
});

// CB3: a file of the wrong kind in each load button.
scenario('gates', async () => {
    const s = await newSession();
    const page = s.page;
    const files = {
        enc: writeFixture('hostile.encounter', hostile.encounter),
        thr: writeFixture('hostile.threat', hostile.threat),
        pl: writeFixture('hostile.players', hostile.players)
    };
    await open(page);
    await addThreat(page, 'sly_marbo_aaa');
    // One player, so that a lost player shows in the Load Players gate.
    await page.evaluate(() => { EncounterState.addPlayerCharacter('Gus'); EncounterTab.renderPlayerCharacterInputs(); });
    await goTab(page, 'builder');
    await page.fill('[data-field="name"]', 'G');
    await wait(page, 2500);

    const snap = async () => ({ state: JSON.stringify(await stateOf(page)), enc: await ls(page, KEY_ENC), bld: await ls(page, KEY_BLD) });
    const note = (cls) => page.evaluate((c) => { const n = document.querySelector(c); return n ? n.textContent : null; }, cls);
    const gate = async (name, tab, button, file, noteCls, expectedNote) => {
        const before = await snap();
        await goTab(page, tab);
        await pickFile(page, button, file);
        const text = await note(noteCls);
        await wait(page, 2500);
        const now = await snap();
        check(name, { armed: before.enc !== null && before.bld !== null, note: text, stateSame: now.state === before.state, encSame: now.enc === before.enc, bldSame: now.bld === before.bld },
            { armed: true, note: expectedNote, stateSame: true, encSame: true, bldSame: true });
    };
    await gate('gates: a threat file in Load Encounter shows the error and changes nothing', 'encounter', '#btn-load-encounter', files.thr, '.encounter-notification', 'Error loading: Invalid encounter file');
    await gate('gates: a players file in Load Encounter shows the error and changes nothing', 'encounter', '#btn-load-encounter', files.pl, '.encounter-notification', 'Error loading: Invalid encounter file');
    await gate('gates: an encounter file in Load Players shows the error and changes nothing', 'encounter', '#btn-load-players', files.enc, '.encounter-notification', 'Error loading: Invalid player file');
    await gate('gates: an encounter file in the builder Load shows the error and changes nothing', 'builder', '#btn-builder-load', files.enc, '.builder-notification', 'Error: Invalid threat file');
});

// CB7, P15: a name with an ampersand, quotes and angle brackets, in each view.
scenario('names', async () => {
    const s = await newSession();
    const page = s.page;
    const NAME = 'A & "B" <C>';
    const MOB = 'A & "B" <C> Mob';
    const custom = {
        id: 'custom_names', name: NAME,
        abilities: [{ type: 'ACTION', name: 'Names hit', description: 'd' }],
        tierThreat: { '1': 'T', '2': 'T', '3': '-', '4': '-', '5': '-' }, wounds: 3
    };
    const file = writeFixture('names.encounter', mkEnc({
        individuals: [
            mkInd('n1', 'custom_names', { maxWounds: 3, maxShock: 0 }),
            mkInd('n2', 'custom_names', { maxWounds: 3, maxShock: 0, mobId: 'nm1' }),
            mkInd('n3', 'custom_names', { maxWounds: 3, maxShock: 0, mobId: 'nm1' })
        ],
        mobs: [{ id: 'nm1', threatId: 'custom_names', name: MOB, initiative: null, notes: '' }],
        customThreats: [custom]
    }));
    await open(page);
    await goTab(page, 'encounter');
    await pickFile(page, '#btn-load-encounter', file);
    check('names: the custom threat and its entries are loaded', await page.evaluate(() => ({
        threat: !!DataLoader.getThreat('custom_names'), ind: EncounterState.individuals.length, mobs: EncounterState.mobs.length
    })), { threat: true, ind: 3, mobs: 1 });

    const text = (sel) => page.evaluate((s) => { const el = document.querySelector(s); return el ? el.textContent : null; }, sel);
    const value = (sel) => page.evaluate((s) => { const el = document.querySelector(s); return el ? el.value : null; }, sel);

    check('names: the individual row reads back as typed', await text('#encounter-list .encounter-item[data-type="individual"] .encounter-item-name'), NAME);
    check('names: the mob row reads back as typed', await text('#encounter-list .encounter-item[data-type="mob"] .encounter-item-name'), MOB);
    await clickSel(page, '#encounter-list .encounter-item[data-type="individual"]');
    check('names: the individual detail reads back as typed', await text('#encounter-detail h3'), NAME);
    await clickSel(page, '#encounter-list .encounter-item[data-type="mob"]');
    check('names: the mob detail reads back as typed', await text('#encounter-detail h3'), MOB);
    check('names: the member reads back as typed', await text('#encounter-detail .member-name'), NAME);

    await goTab(page, 'threats');
    check('names: the list name reads back as typed', await page.evaluate(() => {
        const row = [...document.querySelectorAll('#threat-list .threat-list-item')].find(r => r.dataset.threatId === 'custom_names');
        return row ? row.querySelector('.threat-list-name').textContent : null;
    }), NAME);
    await clickThreatRowById(page, 'custom_names');
    check('names: the card title reads back as typed', await text('#threat-detail .threat-card-title'), NAME);

    await clickSel(page, '#btn-customize-threat');
    await wait(page, 500);
    check('names: the builder name input reads back as typed', await value('[data-field="name"]'), NAME);
    check('names: the preview title reads back as typed', await text('#builder-preview-content .threat-card-title'), NAME);

    await page.evaluate((n) => ThreatBuilderTab.renderTemplateDropdown(n, 'sidebar'), NAME);
    check('names: the template search item reads back as typed', await page.evaluate(() => {
        const item = document.querySelector('#builder-template-dropdown-sidebar .builder-dropdown-item');
        return item && item.firstChild ? item.firstChild.textContent.trim() : null;
    }), NAME);

    await page.evaluate(() => { ThreatBuilderState._abilityIndex = null; ThreatBuilderState._bonusIndex = null; });
    await clickSel(page, '#btn-browse-abilities');
    await page.fill('.ability-picker-search', 'Names hit');
    check('names: the ability picker threat reads back as typed', await page.evaluate(() => {
        const item = [...document.querySelectorAll('.ability-picker-item')].find(i => i.querySelector('.ability-picker-item-name').textContent === 'Names hit');
        return item ? item.querySelector('.ability-picker-item-threat').textContent : null;
    }), NAME);
    await clickSel(page, '.ability-picker-close');

    await page.evaluate(() => ThreatBuilderTab.showInjectModal(ThreatBuilderState.threat.name, 1));
    check('names: the rename modal input reads back as typed', await value('#inject-modal-name'), NAME);
});

// C6: an empty Players box and a count of 0.
scenario('c6', async () => {
    const s = await newSession();
    const page = s.page;
    await open(page);
    await addThreat(page, 'sly_marbo_aaa');
    await goTab(page, 'encounter');
    await page.selectOption('#encounter-list .bonus-select', 'adversary');
    await fillTab(page, '#encounter-players', '');
    check('c6: an empty Players box keeps the count', await page.evaluate(() => ({
        count: EncounterState.settings.playerCount, box: document.getElementById('encounter-players').value
    })), { count: 4, box: '4' });
    const wounds = await page.evaluate(() => DataLoader.getThreat('sly_marbo_aaa').wounds);
    check('c6: max wounds stay finite', await page.evaluate(() => EncounterState.individuals[0].maxWounds), wounds + 4 + 1);
    // The player rows can be missing at the base tree (no rows for a count of NaN), so the state API adds the players.
    await page.evaluate(() => {
        EncounterState.addPlayerCharacter('Ann');
        EncounterState.addPlayerCharacter('Ben');
        EncounterTab.renderPlayerCharacterInputs();
    });
    await fillTab(page, '#encounter-players', '0');
    check('c6: Players 0 keeps both players', await page.evaluate(() => EncounterState.playerCharacters.map(p => p.name)), ['Ann', 'Ben']);
});

// C7: a large Players count, a large quantity, a large inject count and a large stored count.
scenario('c7', async () => {
    const s = await newSession();
    const page = s.page;
    await open(page);
    await goTab(page, 'encounter');
    await fillTab(page, '#encounter-players', '20000');
    check('c7: Players 20000 is refused', await page.evaluate(() => ({
        count: EncounterState.settings.playerCount, rows: document.querySelectorAll('#player-character-inputs .player-character-row').length,
        box: document.getElementById('encounter-players').value
    })), { count: 4, rows: 4, box: '4' });

    await goTab(page, 'threats');
    const rowFound = await clickThreatRowById(page, 'sly_marbo_aaa');
    const countBefore = await page.evaluate(() => EncounterState.individuals.length);
    await page.fill('#threat-add-quantity', '20000');
    await page.click('#threat-add-to-encounter-btn');
    check('c7: quantity 20000 adds nothing', await page.evaluate(([n, found]) => ({
        rowFound: found, added: EncounterState.individuals.length - n, box: document.getElementById('threat-add-quantity').value
    }), [countBefore, rowFound]), { rowFound: true, added: 0, box: '1' });

    await goTab(page, 'builder');
    await page.fill('[data-field="name"]', 'Q');
    const before2 = await page.evaluate(() => EncounterState.individuals.length);
    await page.fill('#builder-inject-count', '25');
    await page.click('#btn-builder-inject');
    check('c7: inject count 25 adds nothing and the box shows 1', await page.evaluate((n) => ({
        added: EncounterState.individuals.length - n, box: document.getElementById('builder-inject-count').value
    }), before2), { added: 0, box: '1' });

    // A stored count of 300000 must not block the start.
    const s2 = await newSession();
    const p2 = s2.page;
    await open(p2);
    const store = {
        encounter: mkEnc({
            settings: { tier: 1, playerCount: 300000, name: 'Big', round: 1 },
            individuals: [mkInd('c7i1', 'sly_marbo_aaa', { maxWounds: 14, maxShock: 10 })]
        }),
        customThreats: [], timestamp: 1
    };
    await lsSet(p2, KEY_ENC, JSON.stringify(store));
    s2.warns.length = 0;
    const t0 = Date.now();
    await p2.reload({ waitUntil: 'load', timeout: 60000 });
    let shown = true;
    try { await p2.waitForSelector('#encounter-list .encounter-item', { timeout: 60000, state: 'attached' }); } catch (e) { shown = false; }
    const elapsed = Date.now() - t0;
    check('c7: a stored count of 300000 starts in under 5 s', { shown, under5s: elapsed < 5000 }, { shown: true, under5s: true });
    console.log(`        the start took ${elapsed} ms`);
    check('c7: the stored count loads as 10', await p2.evaluate(() => EncounterState.settings.playerCount), 10);
    check('c7: one warning names settings.playerCount', s2.warns.filter(w => w.includes('settings.playerCount')).length, 1);
});

// C8: Add to Encounter after a reload.
scenario('c8', async () => {
    const s = await newSession();
    const page = s.page;
    await open(page);
    await goTab(page, 'builder');
    await page.fill('[data-field="name"]', 'C8 Test');
    await page.fill('[data-field="wounds"]', '5');
    await page.click('#btn-builder-inject');
    await page.fill('[data-field="wounds"]', '12');
    await wait(page, 2500);
    await reload(page);
    await goTab(page, 'builder');
    await page.click('#btn-builder-inject');
    if (await page.locator('.inject-modal-overlay').count() > 0) await page.click('#inject-modal-add');
    const got = await page.evaluate(() => EncounterState.individuals.map(i => {
        const t = DataLoader.getThreat(i.threatId);
        return { w: t ? t.wounds : null, max: i.maxWounds, id: i.threatId };
    }));
    check('c8: each entry keeps its own wounds', got.map(g => [g.w, g.max]), [[5, 5], [12, 12]]);
    check('c8: the two entries have two threat ids', new Set(got.map(g => g.id)).size, 2);
});

// C9: stored auto-save data of the wrong shape.
scenario('c9', async () => {
    const valid = mkEnc({ individuals: [mkInd('c9i1', 'sly_marbo_aaa', { maxWounds: 14, maxShock: 10 })] });
    const cases = [
        { name: 'a', enc: JSON.stringify({ encounter: valid, customThreats: {}, timestamp: 1 }), bld: JSON.stringify({ threat: { name: 'Kept' } }) },
        { name: 'b', enc: JSON.stringify({ encounter: { individuals: {} }, timestamp: 1 }) },
        { name: 'c', bld: JSON.stringify({ threat: { id: 5, name: 'B5' } }) },
        { name: 'd', bld: JSON.stringify({ threat: { skills: 5, name: 'S5' } }) },
        { name: 'e', enc: '5' },
        { name: 'f', enc: '"x"' },
        { name: 'g', enc: '[]' }
    ];
    for (const c of cases) {
        const s = await newSession();
        const page = s.page;
        await open(page);
        if (c.enc !== undefined) await lsSet(page, KEY_ENC, c.enc);
        if (c.bld !== undefined) await lsSet(page, KEY_BLD, c.bld);
        s.errors.length = 0;
        s.warns.length = 0;
        await page.reload({ waitUntil: 'load', timeout: 60000 });
        await wait(page, 3000);
        check(`c9 ${c.name}: no page error`, s.errors, []);
        check(`c9 ${c.name}: the app starts`, await page.evaluate(() => document.querySelectorAll('#threat-list .threat-list-item').length > 800), true);
        if (c.name === 'a') {
            check('c9 a: the builder restore is not stopped', await page.evaluate(() => ThreatBuilderState.threat.name), 'Kept');
        }
        if (c.name === 'c') {
            check('c9 c: the builder threat loads with a custom id', await page.evaluate(() => ({
                name: ThreatBuilderState.threat.name, custom: typeof ThreatBuilderState.threat.id === 'string' && ThreatBuilderState.threat.id.startsWith('custom_')
            })), { name: 'B5', custom: true });
        }
        if (c.name === 'e' || c.name === 'f' || c.name === 'g') {
            check(`c9 ${c.name}: a warning says that the auto-save was not loaded`, s.warns.some(w => w.startsWith('The auto-save was not loaded')), true);
            check(`c9 ${c.name}: the stored string is unchanged`, await ls(page, KEY_ENC), c.enc);
        }
        await s.close();
    }
});

// C10: entries of an unknown threat id.
scenario('c10', async () => {
    const s = await newSession();
    const page = s.page;
    await open(page);
    const store = {
        encounter: mkEnc({
            individuals: [
                mkInd('c10i1', 'gone'),
                mkInd('c10i2', 'gone', { mobId: 'c10m1' }),
                mkInd('c10i3', 'gone', { mobId: 'c10m1' })
            ],
            mobs: [{ id: 'c10m1', threatId: 'gone', name: 'M', initiative: null, notes: '' }]
        }),
        customThreats: [], timestamp: 1
    };
    await lsSet(page, KEY_ENC, JSON.stringify(store));
    await reload(page, true);
    await wait(page, 500);
    const name = (type) => page.evaluate((t) => {
        const el = document.querySelector(`#encounter-list .encounter-item[data-type="${t}"] .encounter-item-name`);
        return el ? el.textContent : null;
    }, type);
    check('c10: the free row shows Unknown threat (gone)', await name('individual'), 'Unknown threat (gone)');
    check('c10: the mob row shows M — Unknown threat (gone)', await name('mob'), 'M — Unknown threat (gone)');
    s.errors.length = 0;
    const mobClicked = await clickSel(page, '#encounter-list .encounter-item[data-type="mob"]');
    await wait(page, 500);
    check('c10: selecting the mob gives no page error', { clicked: mobClicked, errors: s.errors }, { clicked: true, errors: [] });
    const delClicked = await clickSel(page, '#encounter-list .encounter-item[data-type="individual"] .delete-btn');
    check('c10: the unknown row can be removed', {
        clicked: delClicked, ids: await page.evaluate(() => EncounterState.individuals.map(i => i.id).sort())
    }, { clicked: true, ids: ['c10i2', 'c10i3'] });
});

// C11: a file that holds a threat with the id of a shipped threat.
scenario('c11', async () => {
    const s = await newSession();
    const page = s.page;
    const file = writeFixture('c11.encounter', mkEnc({
        individuals: [mkInd('c11i1', 'sly_marbo_aaa', { maxWounds: 14, maxShock: 10 })],
        customThreats: [{ id: 'sly_marbo_aaa', name: 'NOT MARBO' }]
    }));
    await open(page);
    const shipped = await page.evaluate(() => DataLoader.getThreat('sly_marbo_aaa').name);
    s.warns.length = 0;
    await goTab(page, 'encounter');
    await pickFile(page, '#btn-load-encounter', file);
    check('c11: the shipped threat keeps its name', await page.evaluate(() => DataLoader.getThreat('sly_marbo_aaa').name), shipped);
    check('c11: one warning names customThreats[0]', s.warns.filter(w => w.includes('customThreats[0]')).length, 1);
});

// D1: a lower player count must keep each player.
scenario('d1', async () => {
    const s = await newSession();
    const page = s.page;
    await open(page);
    await goTab(page, 'encounter');
    for (let i = 0; i < 3; i++) await fillTab(page, `.pc-name-input[data-index="${i}"]`, 'Pl' + i);
    await fillTab(page, '#encounter-players', '2');
    const view = () => page.evaluate(() => ({
        rows: document.querySelectorAll('#player-character-inputs .player-character-row').length,
        extra: document.querySelectorAll('#player-character-inputs .player-character-row--extra').length,
        mark: [...document.querySelectorAll('#player-character-inputs .player-character-row')].filter(r => r.textContent.includes('Above player count')).length,
        players: EncounterState.playerCharacters.length,
        count: EncounterState.settings.playerCount
    }));
    const v = await view();
    check('d1: three rows stay', v.rows, 3);
    check('d1: one row has the mark Above player count', { extra: v.extra, mark: v.mark }, { extra: 1, mark: 1 });
    check('d1: three players stay stored', v.players, 3);
    const clicked = await clickSel(page, '#player-character-inputs .player-character-row--extra .pc-remove-btn');
    const w = await view();
    check('d1: the × of the marked row removes it and keeps the count 2', { clicked, players: w.players, count: w.count }, { clicked: true, players: 2, count: 2 });
});

// TB3-1: a player count above 10 with that number of players. The start and each load must keep every player.
// The count loads as 10. The players above it stay, with a mark, and the stored key keeps all of them.
scenario('players12', async () => {
    const names = Array.from({ length: 12 }, (_, i) => 'P' + (i + 1));
    const players = names.map((n, i) => ({ id: 'p12-' + i, name: n, initiative: null, notes: '' }));
    const encounter = (count) => mkEnc({ settings: { tier: 1, playerCount: count, name: 'Twelve', round: 1 }, playerCharacters: players });
    const WANT = { keyPlayers: 12, rows: 12, marked: ['P11', 'P12'], box: '10' };
    // The four results: the players in the stored key, the rows drawn, the rows with the mark, and the Players box.
    const read = (page) => page.evaluate((key) => {
        let keyPlayers = null;
        try { keyPlayers = JSON.parse(localStorage.getItem(key)).encounter.playerCharacters.length; } catch (e) { /* no key */ }
        const rows = [...document.querySelectorAll('#player-character-inputs .player-character-row')];
        const marked = rows.filter(r => r.classList.contains('player-character-row--extra')
            && r.querySelector('.pc-extra-mark') && r.querySelector('.pc-extra-mark').textContent === 'Above player count')
            .map(r => r.querySelector('.pc-name-input').value);
        return { keyPlayers, rows: rows.length, marked, box: document.getElementById('encounter-players').value };
    }, KEY_ENC);

    // 1. The start.
    let s = await newSession();
    await open(s.page);
    await lsSet(s.page, KEY_ENC, JSON.stringify({ encounter: encounter(12), customThreats: [], timestamp: 1 }));
    await reload(s.page);
    await wait(s.page, 3000);
    check('players12 start: the key, the rows, the marks and the box', await read(s.page), WANT);

    // 2. Load Encounter with a file of the same shape.
    s = await newSession();
    await open(s.page);
    await goTab(s.page, 'encounter');
    await pickFile(s.page, '#btn-load-encounter', writeFixture('players12.encounter', encounter(12)));
    await wait(s.page, 3000);
    check('players12 Load Encounter: the key, the rows, the marks and the box', await read(s.page), WANT);

    // 3. Load Players with a file of count 12 and 12 players.
    s = await newSession();
    await open(s.page);
    await goTab(s.page, 'encounter');
    await pickFile(s.page, '#btn-load-players', writeFixture('players12.players',
        { version: 1, playerCount: 12, players: names.map(n => ({ name: n, notes: '' })) }));
    await wait(s.page, 3000);
    check('players12 Load Players: the key, the rows, the marks and the box', await read(s.page), WANT);

    // 4. A stored count of 300000 with 12 players: a fast start, and the key keeps 12 players.
    s = await newSession();
    await open(s.page);
    await lsSet(s.page, KEY_ENC, JSON.stringify({ encounter: encounter(300000), customThreats: [], timestamp: 1 }));
    const t0 = Date.now();
    await s.page.reload({ waitUntil: 'load', timeout: 60000 });
    let shown = true;
    try { await s.page.waitForSelector('#encounter-list .encounter-item', { timeout: 60000, state: 'attached' }); } catch (e) { shown = false; }
    const elapsed = Date.now() - t0;
    await wait(s.page, 3000);
    const after = await read(s.page);
    check('players12 count 300000: a start under 2 s, and the key and the rows keep 12 players',
        { shown, under2s: elapsed < 2000, keyPlayers: after.keyPlayers, rows: after.rows, marked: after.marked }, { shown: true, under2s: true, keyPlayers: 12, rows: 12, marked: ['P11', 'P12'] });
    console.log(`        the start took ${elapsed} ms`);
});

// B6: mob ability lists and mob option lists on the card and on the mini card.
scenario('b6', async () => {
    const s = await newSession();
    const page = s.page;
    await open(page);
    // The count of list entries of each threat comes from the data: mobAbilities and mobOptions.
    const ENTRIES = { necron_warrior: 1, triarch_praetorian: 1, canoptek_wraith: 1, lokhust_destroyer: 1, fire_warrior: 4,
        sniper_drone: 1, gun_drone: 1, kroot_hounds: 1, xv25_stealth_battlesuit_shasui: 1, pathfinder: 1, kroot_carnivore: 1 };
    for (const id of B6_IDS) {
        const r = await page.evaluate((id) => {
            const t = DataLoader.getThreat(id);
            const names = [];
            ['mobAbilities', 'mobOptions'].forEach(k => { if (Array.isArray(t[k])) t[k].forEach(e => names.push(e.name)); });
            ThreatsTab.renderThreatDetail(id);
            const card = document.getElementById('threat-detail').textContent;
            const div = document.createElement('div');
            div.innerHTML = EncounterTab.renderThreatCardMini(t);
            const mini = div.textContent;
            const fold = (x) => x.replace(/\s+/g, ' ').trim();
            const texts = [];
            ['mobAbilities', 'mobOptions'].forEach(k => { if (Array.isArray(t[k])) t[k].forEach(e => texts.push(e.description)); });
            // An entry shows when its name and its description are both in the text.
            const view = (text) => ({
                entries: names.length,
                missing: names.filter(n => !text.includes(n)).concat(texts.filter(d => !fold(text).includes(fold(d)))),
                objectObject: text.includes('[object Object]')
            });
            return { card: view(card), mini: view(mini) };
        }, id);
        const want = { entries: ENTRIES[id], missing: [], objectObject: false };
        check(`b6 ${id}: the card shows each entry name and no [object Object]`, r.card, want);
        check(`b6 ${id}: the mini card shows each entry name and no [object Object]`, r.mini, want);
    }
});

// C6, C7, P7: number boxes that get a value outside their range.
scenario('inputs', async () => {
    const s = await newSession();
    const page = s.page;
    await open(page);
    const builder = () => page.evaluate(() => ({
        S: ThreatBuilderState.threat.attributes.S, wounds: ThreatBuilderState.threat.wounds,
        def: ThreatBuilderState.threat.parsedSkills.default,
        entry: (ThreatBuilderState.threat.parsedSkills.entries[0] || {}).value
    }));
    await goTab(page, 'builder');
    const start = await builder();
    await page.fill('[data-field="attributes.S"]', '-5');
    check('inputs: S -5 is not stored', (await builder()).S, start.S);
    await page.press('[data-field="attributes.S"]', 'Tab');
    check('inputs: the box shows the stored S', await page.locator('[data-field="attributes.S"]').inputValue(), String((await builder()).S));
    await page.fill('[data-field="wounds"]', '0');
    check('inputs: wounds 0 is not stored', (await builder()).wounds, start.wounds);

    await page.fill('[data-skill="default"]', '-2');
    const d1 = (await builder()).def;
    await page.press('[data-skill="default"]', 'Tab');
    check('inputs: skill Default -2 is not stored', { stored: d1, box: await page.locator('[data-skill="default"]').inputValue() }, { stored: 0, box: '0' });
    await page.click('#btn-add-skill');
    await page.fill('.builder-skill-value[data-skill-index="0"]', '-1');
    const e1 = (await builder()).entry;
    await page.press('.builder-skill-value[data-skill-index="0"]', 'Tab');
    check('inputs: a skill entry value -1 is not stored', { stored: e1, box: await page.locator('.builder-skill-value[data-skill-index="0"]').inputValue() }, { stored: 0, box: '0' });

    await addThreat(page, 'sly_marbo_aaa');
    await goTab(page, 'encounter');
    const init = '#encounter-list .encounter-item[data-type="individual"] .initiative-input';
    const stored = () => page.evaluate(() => EncounterState.individuals[0].initiative);
    await fillTab(page, init, '12');
    await fillTab(page, init, '150');
    check('inputs: initiative 150 keeps 12', await stored(), 12);
    await fillTab(page, init, '');
    check('inputs: an empty initiative clears it', await stored(), null);

    await fillTab(page, '.pc-name-input[data-index="0"]', 'Pia');
    await fillTab(page, '.pc-initiative-input[data-index="0"]', '12');
    await fillTab(page, '.pc-initiative-input[data-index="0"]', '150');
    const pcView = () => page.evaluate(() => ({
        stored: EncounterState.playerCharacters[0] ? EncounterState.playerCharacters[0].initiative : null,
        box: (document.querySelector('.pc-initiative-input[data-index="0"]') || {}).value
    }));
    check('inputs: player row initiative 150 is refused', await pcView(), { stored: 12, box: '12' });
    await clickSel(page, '#encounter-list .encounter-item[data-type="player"]');
    await fillTab(page, '#player-detail-initiative', '150');
    check('inputs: player detail initiative 150 is refused', await page.evaluate(() => ({
        stored: EncounterState.playerCharacters[0].initiative, box: document.getElementById('player-detail-initiative').value
    })), { stored: 12, box: '12' });
});

// ===== Main =====

// TB10-1: a dragged entry lands where the placeholder shows, also below the last entry.
scenario('drag', async () => {
    const s = await newSession();
    const page = s.page;
    await open(page);
    await goTab(page, 'encounter');
    const setup = () => page.evaluate(() => {
        EncounterState.clearEncounter();
        const ids = ['sly_marbo_aaa', 'tactical_space_marine', 'astra_militarum_trooper'].map(t => EncounterState.addIndividual(t, 1)[0]);
        EncounterState.setEncounterOrder(ids.map(id => ({ type: 'individual', id })));
        EncounterTab.renderEncounterList();
        return ids;
    });
    const rowIds = () => page.evaluate(() => [...document.querySelectorAll('#encounter-list .encounter-item')].map(e => e.dataset.id));
    // The rows that the pointer can meet: the ones that are not hidden. The hidden original keeps its space.
    const liveRows = () => page.evaluate(() => [...document.querySelectorAll('#encounter-list .encounter-item:not(.drag-original-hidden)')]
        .map(e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; }));
    // Drag the handle of row `from` with real mouse moves. `before` is the index of the other row that
    // the entry goes before, or 'end' for a place below the last row.
    async function drag(from, before) {
        const pos = await page.evaluate((i) => {
            const h = document.querySelectorAll('#encounter-list .encounter-item')[i].querySelector('.drag-handle').getBoundingClientRect();
            return { x: h.x + h.width / 2, y: h.y + h.height / 2 };
        }, from);
        await page.mouse.move(pos.x, pos.y);
        await page.mouse.down();
        await page.mouse.move(pos.x, pos.y + 1);
        // The placeholder moves the rows, so the target is read again after each move.
        for (let k = 0; k < 4; k++) {
            const rows = await liveRows();
            const y = before === 'end' ? rows[rows.length - 1].bottom + 15 : rows[before].top + 2;
            await page.mouse.move(pos.x, y, { steps: 3 });
        }
        await page.mouse.up();
        await wait(page, 100);
    }
    const letters = (ids, now) => now.map(id => 'ABC'[ids.indexOf(id)]).join('');

    let ids = await setup();
    await drag(0, 'end');
    check('drag: A to the end gives B, C, A', letters(ids, await rowIds()), 'BCA');
    ids = await setup();
    await drag(2, 0);
    check('drag: C to the start gives C, A, B', letters(ids, await rowIds()), 'CAB');
    ids = await setup();
    await drag(0, 1);
    check('drag: A below B gives B, A, C', letters(ids, await rowIds()), 'BAC');
    ids = await setup();
    await drag(1, 0);
    check('drag: B above A gives B, A, C', letters(ids, await rowIds()), 'BAC');
    ids = await setup();
    await drag(1, 'end');
    check('drag: B to the end gives A, C, B', letters(ids, await rowIds()), 'ACB');
    ids = await setup();
    await drag(1, 1);
    check('drag: B released at its own place keeps A, B, C', letters(ids, await rowIds()), 'ABC');

    // The last order stays after a reload.
    ids = await setup();
    await drag(0, 'end');
    await wait(page, 2500);
    await reload(page);
    await goTab(page, 'encounter');
    check('drag: the order B, C, A stays after a reload', letters(ids, await rowIds()), 'BCA');
    check('drag: no page error', s.errors, []);
});

async function main() {
    const args = process.argv.slice(2);
    // A flag with no value, an empty value or a value that is another flag stops the run. An unset variable must not skip a mode.
    const FLAGS = ['--snapshot', '--compare', '--only'];
    const values = {};
    for (let i = 0; i < args.length; i++) {
        if (!FLAGS.includes(args[i])) { console.log(`FAIL  unknown argument: ${args[i]}`); process.exitCode = 1; return; }
        const value = args[i + 1];
        if (value === undefined || value === '' || value.startsWith('--')) { console.log(`FAIL  ${args[i]} needs a value`); process.exitCode = 1; return; }
        if (args[i] in values) { console.log(`FAIL  ${args[i]} is given two times`); process.exitCode = 1; return; }
        values[args[i]] = value;
        i++;
    }
    const snapshotFile = values['--snapshot'] || null;
    const compareFile = values['--compare'] || null;
    const only = values['--only'] || null;
    if ((snapshotFile || compareFile) && (snapshotFile && compareFile || only)) {
        console.log('FAIL  --snapshot, --compare and --only exclude each other');
        process.exitCode = 1;
        return;
    }
    if (only && !scenarios.some(sc => sc.name.startsWith(only))) {
        console.log(`FAIL  --only ${only} matches no scenario. The scenarios are: ${scenarios.map(sc => sc.name).join(', ')}`);
        process.exitCode = 1;
        return;
    }
    if (compareFile && !fs.existsSync(compareFile)) {
        console.log(`FAIL  the baseline file does not exist: ${compareFile}`);
        process.exitCode = 1;
        return;
    }

    fs.mkdirSync(process.env.PROOF_TMP, { recursive: true });
    let server = null;
    const cleanup = async () => {
        if (browser) await browser.close().catch(() => {});
        browser = null;
        if (server) {
            server.closeAllConnections();
            await new Promise(r => server.close(r));
            server = null;
        }
        if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = null;
    };
    // A stop signal still closes the browser and the server.
    for (const sig of ['SIGINT', 'SIGTERM']) {
        process.on(sig, () => { cleanup().finally(() => process.exit(1)); });
    }
    try {
        tmpDir = fs.mkdtempSync(path.join(process.env.PROOF_TMP, 'bestiary-proof-'));
        server = await startServer();
        // Playwright writes its profile and its files to the temporary folder. Point that folder to the fixture folder.
        process.env.TMPDIR = tmpDir;
        browser = await chromium.launch({ headless: true });
        if (snapshotFile) {
            await runSnapshot(snapshotFile);
        } else if (compareFile) {
            await runCompare(compareFile);
        } else {
            for (const sc of scenarios) {
                if (only && !sc.name.startsWith(only)) continue;
                cur = { name: sc.name, total: 0, failed: 0 };
                try {
                    await sc.fn();
                } catch (e) {
                    fail(`${sc.name}: threw ${String(e.message).split('\n')[0]}`);
                } finally {
                    for (const x of sessions) await x.close().catch(() => {});
                    sessions = [];
                }
                console.log(`SCENARIO ${sc.name}: ${cur.failed} of ${cur.total} checks failed`);
                cur = null;
            }
        }
        if (!snapshotFile) console.log(failures === 0 ? 'All checks passed' : `${failures} check(s) failed`);
    } finally {
        await cleanup();
    }
    process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => {
    console.log(`FAIL  the script stopped: ${String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')}`);
    process.exitCode = 1;
});
