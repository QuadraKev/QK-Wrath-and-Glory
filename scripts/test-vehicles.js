// Tests for the Vehicles data (issue #28): data/vehicles.json and the vehicleTraits and
// vehicleRules sections of data/glossary.json. This file reads JSON only, so it needs no vm
// sandbox; a later test of app code can add one in the pattern of test-followers.js.
// Run: node scripts/test-vehicles.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

let failures = 0;
function check(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function finish() {
    console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
}
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// --- the data file exists; without it the run stops here ---
const hasFile = fs.existsSync(path.join(ROOT, 'data/vehicles.json'));
check('data/vehicles.json exists', hasFile, true);
if (!hasFile) finish();

const vehicles = readJson('data/vehicles.json');
const weapons = readJson('data/weapons.json');
const equipment = readJson('data/equipment.json');
const glossary = readJson('data/glossary.json');
const vehicleTraits = glossary.vehicleTraits || {};
const vehicleRules = glossary.vehicleRules || {};
const byId = new Map(vehicles.map(v => [v.id, v]));
const weaponsOf = v => (Array.isArray(v.weapons) ? v.weapons : []);
const wargearOf = v => (Array.isArray(v.wargear) ? v.wargear : []);

// Spec Appendix A in book order: [id, name, faction, variantOf, page].
const EXPECTED = [
    ['achilles_ridgerunner', 'Achilles Ridgerunner', 'Imperial', null, 64],
    ['avachrus_ridgerunner', 'Avachrus Ridgerunner', 'Imperial', null, 64],
    ['dirtcycle', 'Dirtcycle', 'Imperial', null, 65],
    ['goliath_truck', 'Goliath Truck', 'Imperial', null, 65],
    ['goliath_rockgrinder', 'Goliath Rockgrinder', 'Imperial', null, 65],
    ['tauros', 'Tauros', 'Imperial', null, 66],
    ['tauros_venator', 'Tauros Venator', 'Imperial', null, 66],
    ['wolfquad', 'Wolfquad', 'Imperial', null, 66],
    ['castigator', 'Castigator', 'Adepta Sororitas', null, 67],
    ['exorcist', 'Exorcist', 'Adepta Sororitas', null, 67],
    ['immolator', 'Immolator', 'Adepta Sororitas', null, 68],
    ['repressor', 'Repressor', 'Adepta Sororitas', null, 68],
    ['adepta_sororitas_rhino', 'Adepta Sororitas Rhino', 'Adepta Sororitas', null, 68],
    ['assault_bike', 'Assault Bike', 'Adeptus Astartes', null, 69],
    ['attack_bike', 'Attack Bike', 'Adeptus Astartes', 'assault_bike', 69],
    ['scout_bike', 'Scout Bike', 'Adeptus Astartes', 'assault_bike', 69],
    ['land_raider', 'Land Raider', 'Adeptus Astartes', null, 70],
    ['land_raider_crusader', 'Crusader', 'Adeptus Astartes', 'land_raider', 70],
    ['land_raider_redeemer', 'Redeemer', 'Adeptus Astartes', 'land_raider', 70],
    ['land_speeder', 'Land Speeder', 'Adeptus Astartes', null, 71],
    ['land_speeder_tornado', 'Land Speeder Tornado', 'Adeptus Astartes', 'land_speeder', 71],
    ['land_speeder_typhoon', 'Land Speeder Typhoon', 'Adeptus Astartes', 'land_speeder', 71],
    ['land_speeder_storm', 'Land Speeder Storm', 'Adeptus Astartes', null, 72],
    ['rhino', 'Rhino', 'Adeptus Astartes', null, 72],
    ['razorback', 'Razorback', 'Adeptus Astartes', null, 73],
    ['predator_annihilator', 'Predator Annihilator', 'Adeptus Astartes', null, 74],
    ['predator_destructor', 'Predator Destructor', 'Adeptus Astartes', null, 74],
    ['vindicator', 'Vindicator', 'Adeptus Astartes', null, 75],
    ['whirlwind', 'Whirlwind', 'Adeptus Astartes', null, 75],
    ['gladiator', 'Gladiator', 'Adeptus Astartes', null, 76],
    ['gladiator_reaper', 'Gladiator Reaper', 'Adeptus Astartes', 'gladiator', 76],
    ['gladiator_valiant', 'Gladiator Valiant', 'Adeptus Astartes', 'gladiator', 76],
    ['impulsor', 'Impulsor', 'Adeptus Astartes', null, 77],
    ['invader_atv', 'Invader ATV', 'Adeptus Astartes', null, 77],
    ['repulsor', 'Repulsor', 'Adeptus Astartes', null, 78],
    ['repulsor_executioner', 'Repulsor Executioner', 'Adeptus Astartes', 'repulsor', 78],
    ['archaeopter_fusilave', 'Archaeopter Fusilave', 'Adeptus Mechanicus', null, 79],
    ['archaeopter_stratoraptor', 'Archaeopter Stratoraptor', 'Adeptus Mechanicus', null, 79],
    ['archaeopter_transvector', 'Archaeopter Transvector', 'Adeptus Mechanicus', null, 79],
    ['onager_dunecrawler', 'Onager Dunecrawler', 'Adeptus Mechanicus', null, 80],
    ['skorpius_disintegrator', 'Skorpius Disintegrator', 'Adeptus Mechanicus', null, 80],
    ['skorpius_dunerider', 'Skorpius Dunerider', 'Adeptus Mechanicus', null, 81],
    ['ironstrider_ballistarius', 'Ironstrider Ballistarius', 'Adeptus Mechanicus', null, 81],
    ['sydonian_dragoon', 'Sydonian Dragoon', 'Adeptus Mechanicus', null, 81],
    ['aquila_lander', 'Aquila Lander', 'Aeronautica Imperialis', null, 82],
    ['arvus_lighter', 'Arvus Lighter', 'Aeronautica Imperialis', null, 82],
    ['vulture_gunship', 'Vulture Gunship', 'Aeronautica Imperialis', null, 82],
    ['valkyrie', 'Valkyrie', 'Aeronautica Imperialis', null, 84],
    ['chimera', 'Chimera', 'Astra Militarum', null, 84],
    ['hellhound', 'Hellhound', 'Astra Militarum', null, 85],
    ['devil_dog', 'Devil Dog', 'Astra Militarum', null, 85],
    ['bane_wolf', 'Bane Wolf', 'Astra Militarum', null, 85],
    ['basilisk', 'Basilisk', 'Astra Militarum', null, 86],
    ['deathstrike', 'Deathstrike', 'Astra Militarum', null, 86],
    ['hydra', 'Hydra', 'Astra Militarum', null, 86],
    ['manticore', 'Manticore', 'Astra Militarum', null, 87],
    ['wyvern', 'Wyvern', 'Astra Militarum', null, 87],
    ['leman_russ', 'Leman Russ', 'Astra Militarum', null, 87],
    ['leman_russ_demolisher', 'Demolisher', 'Astra Militarum', 'leman_russ', 88],
    ['leman_russ_punisher', 'Punisher', 'Astra Militarum', 'leman_russ', 88],
    ['leman_russ_eradicator', 'Eradicator', 'Astra Militarum', 'leman_russ', 88],
    ['leman_russ_vanquisher', 'Vanquisher', 'Astra Militarum', 'leman_russ', 88],
    ['scout_sentinel', 'Scout Sentinel', 'Astra Militarum', null, 89],
    ['armoured_sentinel', 'Armoured Sentinel', 'Astra Militarum', null, 89],
    ['taurox', 'Taurox', 'Astra Militarum', null, 91],
    ['taurox_prime', 'Taurox Prime', 'Astra Militarum', null, 91],
    ['aeldari_jetbike', 'Aeldari Jetbike', 'Aeldari', null, 92],
    ['falcon', 'Falcon', 'Aeldari', null, 93],
    ['fire_prism', 'Fire Prism', 'Aeldari', 'falcon', 93],
    ['falcon_firestorm', 'Firestorm', 'Aeldari', 'falcon', 93],
    ['night_spinner', 'Night Spinner', 'Aeldari', 'falcon', 93],
    ['wave_serpent', 'Wave Serpent', 'Aeldari', 'falcon', 94],
    ['hemlock_wraithfighter', 'Hemlock Wraithfighter', 'Aeldari', null, 94],
    ['nightshade_interceptor', 'Nightshade Interceptor', 'Aeldari', null, 95],
    ['vyper', 'Vyper', 'Aeldari', null, 95],
    ['war_walker', 'War Walker', 'Aeldari', null, 96],
    ['chaos_rhino', 'Chaos Rhino', 'Chaos Space Marines', null, 97],
    ['chaos_predator', 'Chaos Predator', 'Chaos Space Marines', null, 98],
    ['chaos_vindicator', 'Chaos Vindicator', 'Chaos Space Marines', null, 98],
    ['chaos_land_raider', 'Chaos Land Raider', 'Chaos Space Marines', null, 98],
    ['raider', 'Raider', 'Drukhari', null, 99],
    ['ravager', 'Ravager', 'Drukhari', null, 99],
    ['reaver_jetbike', 'Reaver Jetbike', 'Drukhari', null, 100],
    ['venom', 'Venom', 'Drukhari', null, 100],
    ['catacomb_command_barge', 'Catacomb Command Barge', 'Necron', null, 101],
    ['doom_scythe', 'Doom Scythe', 'Necron', null, 101],
    ['doomsday_ark', 'Doomsday Ark', 'Necron', null, 102],
    ['ghost_ark', 'Ghost Ark', 'Necron', null, 102],
    ['tomb_blade', 'Tomb Blade', 'Necron', null, 103],
    ['triarch_stalker', 'Triarch Stalker', 'Necron', null, 103],
    ['warbike', 'Warbike', 'Ork', null, 104],
    ['boomdakka_snazzwagon', 'Boomdakka Snazzwagon', 'Ork', null, 104],
    ['deffkilla_wartrike', 'Deffkilla Wartrike', 'Ork', null, 105],
    ['kustom_boosta_blasta', 'Kustom Boosta Blasta', 'Ork', null, 105],
    ['megatrakk_scrapjet', 'Megatrakk Scrapjet', 'Ork', null, 106],
    ['shokkjump_dragsta', 'Shokkjump Dragsta', 'Ork', null, 106],
    ['trukk', 'Trukk', 'Ork', null, 107],
    ['rukkatrukk_squigbuggy', 'Rukkatrukk Squigbuggy', 'Ork', null, 107],
    ['wazbom_blastajet', 'Wazbom Blastajet', 'Ork', null, 108],
    ['battlewagon', 'Battlewagon', 'Ork', null, 108],
    ['bonebreaka', 'Bonebreaka', 'Ork', null, 109],
    ['gunwagon', 'Gunwagon', 'Ork', null, 109],
    ['kill_rig', 'Kill Rig', 'Ork', null, 109],
    ['deffkopta', 'Deffkopta', 'Ork', null, 110],
    ['dakkajet', 'Dakkajet', 'Ork', null, 111],
    ['blitza_bommer', 'Blitza-Bommer', 'Ork', null, 111],
    ['burna_bommer', 'Burna-Bommer', 'Ork', 'blitza_bommer', 111]
];

const FIELDS = ['id', 'name', 'faction', 'variantOf', 'description', 'options', 'value', 'rarity',
    'speed', 'manoeuvre', 'resilience', 'wounds', 'size', 'keywords', 'crew', 'traits',
    'weapons', 'wargear', 'sidebar', 'source', 'page'];
const FACTION_COUNTS = {
    'Imperial': 8, 'Adepta Sororitas': 5, 'Adeptus Mechanicus': 8, 'Aeronautica Imperialis': 4,
    'Adeptus Astartes': 23, 'Astra Militarum': 18, 'Aeldari': 10, 'Drukhari': 4, 'Necron': 6,
    'Chaos Space Marines': 4, 'Ork': 17
};
const FACTIONS = Object.keys(FACTION_COUNTS);
const SIZES = ['Medium', 'Large', 'Huge', 'Gargantuan'];
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique'];

const isText = x => typeof x === 'string' && x.length > 0;
const isTextOrNull = x => x === null || isText(x);
const isInt = x => Number.isInteger(x);
const sameKeys = (o, keys) => !!o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).join(',') === keys.join(',');
// A weapon item is { text, weaponId, count }, then twin when the line is Twin, then profileIds
// when the weapon exists only as profile records (spec §2.1, §2.2).
const WEAPON_KEY_ORDERS = [['text', 'weaponId', 'count'], ['text', 'weaponId', 'count', 'twin'],
    ['text', 'weaponId', 'count', 'profileIds'], ['text', 'weaponId', 'count', 'twin', 'profileIds']];
const isWeaponItem = w => WEAPON_KEY_ORDERS.some(keys => sameKeys(w, keys))
    && isText(w.text) && isTextOrNull(w.weaponId) && isInt(w.count) && w.count >= 1;
const isWargearItem = g => sameKeys(g, ['text', 'equipmentId']) && isText(g.text) && isTextOrNull(g.equipmentId);
const FIELD_TYPES = {
    id: x => isText(x) && /^[a-z0-9]+(_[a-z0-9]+)*$/.test(x),
    name: isText,
    faction: x => FACTIONS.includes(x),
    variantOf: isTextOrNull,
    description: isTextOrNull,
    options: isTextOrNull,
    value: isInt,
    rarity: x => RARITIES.includes(x),
    speed: isInt,
    manoeuvre: isInt,
    resilience: isInt,
    wounds: isInt,
    size: x => SIZES.includes(x),
    keywords: x => Array.isArray(x) && x.every(k => isText(k) && k === k.toUpperCase()),
    crew: isText,
    traits: x => Array.isArray(x) && x.every(isText),
    weapons: x => Array.isArray(x) && x.every(isWeaponItem),
    wargear: x => Array.isArray(x) && x.every(isWargearItem),
    sidebar: x => x === null || (sameKeys(x, ['title', 'text']) && isText(x.title) && isText(x.text)),
    source: x => x === 'church',
    page: x => isInt(x) && x >= 64 && x <= 111
};

// --- shape: 107 entries, unique ids, the 21 fields in spec order with the right types ---
check('107 entries', vehicles.length, 107);
check('ids are unique', new Set(vehicles.map(v => v.id)).size, vehicles.length);
check('every entry has the 21 fields in spec order', vehicles.filter(v => !sameKeys(v, FIELDS)).map(v => v.id), []);
check('every field has the right type',
    vehicles.flatMap(v => FIELDS.filter(f => !FIELD_TYPES[f](v[f])).map(f => `${v.id}.${f}`)), []);
check('twin, where present, is true',
    vehicles.flatMap(v => weaponsOf(v).filter(w => 'twin' in w && w.twin !== true).map(w => `${v.id}: ${w.text}`)), []);

// --- Appendix A: ids, names, factions, families, pages, book order ---
check('the ids are the 107 ids of Appendix A', vehicles.map(v => v.id).sort(), EXPECTED.map(e => e[0]).sort());
check('name, faction, variantOf and page match Appendix A',
    EXPECTED.filter(([id, name, faction, variantOf, page]) => {
        const v = byId.get(id);
        return !v || v.name !== name || v.faction !== faction || v.variantOf !== variantOf || v.page !== page;
    }).map(e => e[0]), []);
check('entries are in book order (pages never go down)',
    vehicles.slice(1).filter((v, i) => v.page < vehicles[i].page).map(v => v.id), []);
// Spec §2.2: a variant whose printed title is one word takes the family prefix; any other
// entry (a multi-word variant title, an Archaeopter's stored name) is the snake_case of its name.
const snake = s => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const idByRule = v => (v.variantOf !== null && /^[A-Za-z]+$/.test(v.name) ? `${v.variantOf}_${snake(v.name)}` : snake(v.name));
check('every id follows the spec §2.2 id rule', vehicles.filter(v => isText(v.name) && v.id !== idByRule(v)).map(v => v.id), []);
const valkyrieAt = vehicles.findIndex(v => v.id === 'valkyrie');
const chimeraAt = vehicles.findIndex(v => v.id === 'chimera');
check('the Valkyrie comes before the Chimera on p. 84', valkyrieAt >= 0 && chimeraAt >= 0 && valkyrieAt < chimeraAt, true);

// --- factions and sizes ---
const factionCounts = {};
for (const v of vehicles) factionCounts[v.faction] = (factionCounts[v.faction] || 0) + 1;
check('per-faction counts match Appendix A',
    Object.fromEntries(FACTIONS.map(f => [f, factionCounts[f] || 0])), FACTION_COUNTS);
check('every faction is one of the 11 fixed strings',
    [...new Set(vehicles.map(v => v.faction))].filter(f => !FACTIONS.includes(f)), []);
check('size is Medium, Large, Huge or Gargantuan',
    vehicles.filter(v => !SIZES.includes(v.size)).map(v => `${v.id}: ${v.size}`), []);

// --- references resolve ---
const weaponIds = new Set(weapons.map(w => w.id));
const equipmentIds = new Set(equipment.map(e => e.id));
check('every non-null weaponId resolves to a weapons.json record',
    vehicles.flatMap(v => weaponsOf(v).filter(w => w.weaponId !== null && !weaponIds.has(w.weaponId)).map(w => `${v.id}: ${w.weaponId}`)), []);
check('every non-null equipmentId resolves to an equipment.json record',
    vehicles.flatMap(v => wargearOf(v).filter(g => g.equipmentId !== null && !equipmentIds.has(g.equipmentId)).map(g => `${v.id}: ${g.equipmentId}`)), []);
check('every profileIds array has two or more ids that all resolve, beside a null weaponId',
    vehicles.flatMap(v => weaponsOf(v).filter(w => 'profileIds' in w && !(Array.isArray(w.profileIds) && w.profileIds.length >= 2
        && w.profileIds.every(id => weaponIds.has(id)) && w.weaponId === null)).map(w => `${v.id}: ${w.text}`)), []);
check('every variantOf names a same-faction entry whose variantOf is null',
    vehicles.filter(v => v.variantOf !== null).filter(v => {
        const parent = byId.get(v.variantOf);
        return !parent || parent.faction !== v.faction || parent.variantOf !== null;
    }).map(v => v.id), []);

// --- family values: the three overrides, inheritance, options on the parent ---
check('Land Speeder Tornado value is 12 (family prose override)', byId.get('land_speeder_tornado')?.value, 12);
check('Land Speeder Typhoon value is 12 (family prose override)', byId.get('land_speeder_typhoon')?.value, 12);
check('Leman Russ Vanquisher rarity is Rare (family prose override)', byId.get('leman_russ_vanquisher')?.rarity, 'Rare');
const OVERRIDDEN = { land_speeder_tornado: 'value', land_speeder_typhoon: 'value', leman_russ_vanquisher: 'rarity' };
check('a variant copies its family Value and Rarity, except the three overrides',
    vehicles.filter(v => v.variantOf !== null && byId.has(v.variantOf)).flatMap(v => ['value', 'rarity']
        .filter(f => OVERRIDDEN[v.id] !== f && v[f] !== byId.get(v.variantOf)[f])
        .map(f => `${v.id}.${f}`)), []);
check('a variant has no options (they live on the family parent)',
    vehicles.filter(v => v.variantOf !== null && v.options !== null).map(v => v.id), []);
check('every family parent has a description for its variants to fall back on',
    [...new Set(vehicles.filter(v => v.variantOf !== null).map(v => v.variantOf))].filter(id => !isText(byId.get(id)?.description)), []);

const archaeopters = ['archaeopter_fusilave', 'archaeopter_stratoraptor', 'archaeopter_transvector'].map(id => byId.get(id)).filter(Boolean);
check('the three Archaeopter entries are top-level', archaeopters.map(a => a.variantOf), [null, null, null]);
check('the Archaeopters share the family Value, Rarity and options',
    new Set(archaeopters.map(a => JSON.stringify([a.value, a.rarity, a.options]))).size, 1);
check('the Archaeopters carry a description', archaeopters.filter(a => isText(a.description)).length, 3);
check('each Archaeopter description opens with the same family paragraph',
    new Set(archaeopters.map(a => String(a.description).split('\n\n')[0])).size, 1);

// --- printed keywords and the sidebar ---
const chaosEntries = vehicles.filter(v => v.faction === 'Chaos Space Marines');
check('the Chaos entries keep the [LEGION] and [MARK OF CHAOS] placeholders',
    chaosEntries.filter(v => (v.keywords || []).includes('[LEGION]') && (v.keywords || []).includes('[MARK OF CHAOS]')).length, 4);
check('six entries keep the printed TRANSPORTER keyword',
    vehicles.filter(v => (v.keywords || []).includes('TRANSPORTER')).length, 6);
check('the Shokkjump Dragsta carries the Shokk Tunnel sidebar', byId.get('shokkjump_dragsta')?.sidebar?.title, 'Shokk Tunnel');

// --- weapon lines: count and twin follow the printed text (spec §2.2) ---
const leadingCount = text => (/^(\d+) /.test(text) ? Number(text.match(/^(\d+) /)[1]) : 1);
check('count is the leading quantity of the line, else 1',
    vehicles.flatMap(v => weaponsOf(v).filter(w => w.count !== leadingCount(w.text)).map(w => `${v.id}: ${w.text} (count ${w.count})`)), []);
check('twin is set exactly when Twin follows the optional quantity',
    vehicles.flatMap(v => weaponsOf(v).filter(w => ('twin' in w) !== /^(\d+ )?Twin /.test(w.text)).map(w => `${v.id}: ${w.text}`)), []);

// --- no AI-generated text anywhere in the new data ---
function allStrings(x, out = []) {
    if (typeof x === 'string') out.push(x);
    else if (Array.isArray(x)) x.forEach(y => allStrings(y, out));
    else if (x && typeof x === 'object') Object.values(x).forEach(y => allStrings(y, out));
    return out;
}
check('no string in the new data contains [AI-Generated]',
    [...allStrings(vehicles), ...allStrings(vehicleTraits), ...allStrings(vehicleRules)].filter(s => s.includes('[AI-Generated]')).length, 0);

// --- glossary sections (spec §3, Appendix B) ---
const TRAITS = [['all_terrain', 'All-Terrain'], ['amphibious', 'Amphibious'], ['bike', 'Bike'], ['flyer', 'Flyer'],
    ['gun_ports', 'Gun Ports'], ['gyro_stabilised', 'Gyro-Stabilised'], ['hover', 'Hover'], ['open_topped', 'Open Topped'],
    ['reliable', 'Reliable'], ['sealed', 'Sealed'], ['turbo_boost', 'Turbo Boost (X)'], ['walker', 'Walker']];
check('vehicleTraits has exactly the 12 trait keys', Object.keys(vehicleTraits).sort(), TRAITS.map(t => t[0]));
check('vehicleTraits names match the book', TRAITS.map(([k]) => vehicleTraits[k]?.name), TRAITS.map(t => t[1]));
check('vehicleTraits pages are 62 or 63',
    Object.entries(vehicleTraits).filter(([, t]) => t.page !== 62 && t.page !== 63).map(([k]) => k), []);

// [key, name, first page, last page, required]
const RULES = [
    ['benevolence_of_the_omnissiah', 'Benevolence of the Omnissiah', 29, 29, true],
    ['masters_of_machines', 'Masters of Machines', 29, 29, true],
    ['miraculum_mobili', 'Miraculum Mobili', 29, 29, true],
    ['bleeding_edge_technology', 'Bleeding-Edge Technology', 30, 30, true],
    ['wraithbone', 'Wraithbone', 30, 30, true],
    ['orks_build_tuff', 'Orks Build Tuff', 31, 31, true],
    ['green_wunz_only', 'Green Wunz Only', 31, 31, true],
    ['interacting_with_vehicles', 'Interacting with Vehicles', 44, 44, false],
    ['embarking', 'Embarking & Disembarking', 44, 44, true],
    ['actions_inside', 'Actions Inside a Vehicle', 44, 45, true],
    ['complications', 'Vehicle Complications', 44, 45, true],
    ['movement_on_a_vehicles_exterior', "Movement on a Vehicle's Exterior", 44, 44, true],
    ['vehicle_roles', 'Vehicle Roles', 45, 46, true],
    ['vehicle_actions', 'Vehicle Actions', 46, 46, false],
    ['drive', 'Drive', 46, 50, true],
    ['brace_for_impact', 'Brace for Impact', 46, 50, true],
    ['breakneck_speed', 'Breakneck Speed', 46, 50, true],
    ['xenos_tech', 'Xenos Tech', 47, 47, true],
    ['emergency_repair', 'Emergency Repair', 46, 50, true],
    ['evasive_manoeuvres', 'Evasive Manoeuvres', 46, 50, true],
    ['line_up_the_shot', 'Line Up the Shot', 46, 50, true],
    ['the_bigger_they_are', 'Optional Rule: The Bigger They Are…', 48, 48, true],
    ['open_fire', 'Open Fire', 46, 50, true],
    ['ram', 'Ram', 46, 50, true],
    ['reload', 'Reload', 46, 50, true],
    ['high_speed_tactics', 'High-Speed Tactics', 50, 50, true],
    ['attacking_from_a_vehicle', 'Attacking from a Vehicle', 51, 51, true],
    ['attacking_a_vehicles_occupants', "Attacking a Vehicle's Occupants", 51, 51, true],
    ['vehicle_defence', 'Vehicle Defence', 52, 52, true],
    ['damaged_vehicles', 'Damaged Vehicles', 52, 52, true],
    ['vehicles_and_conditions', 'Vehicles & Conditions', 53, 53, true],
    ['out_of_control', 'Out of Control', 53, 53, true],
    ['called_shots', 'Called Shots against Vehicles', 53, 54, true],
    ['vehicle_damage', 'Vehicle Damage', 54, 54, true],
    ['repairing_vehicles', 'Repairing Vehicles', 55, 55, true],
    ['vehicle_explosions', 'Vehicle Explosions', 55, 55, true],
    ['crash_and_burn', 'Optional Rule: Crash and Burn', 55, 55, true],
    ['built_to_last', 'Optional Rule: Built to Last', 55, 55, true],
    ['ammo', 'Vehicle Ammo', 60, 60, true],
    ['twin_weapons', 'Twin Weapons', 60, 60, true],
    ['vehicle_characteristics', 'Vehicle Characteristics', 62, 62, true]
];
const ruleKeys = Object.keys(vehicleRules);
check('Appendix B lists 39 required keys', RULES.filter(r => r[4]).length, 39);
check('vehicleRules has the 39 required keys', RULES.filter(r => r[4] && !ruleKeys.includes(r[0])).map(r => r[0]), []);
check('vehicleRules has at most 42 entries', ruleKeys.length <= 42, true);
check('every vehicleRules key is an Appendix B key', ruleKeys.filter(k => !RULES.some(r => r[0] === k)), []);
check('vehicleRules names match Appendix B',
    RULES.filter(([k, name]) => k in vehicleRules && vehicleRules[k].name !== name).map(r => r[0]), []);
check('vehicleRules pages fall in the Appendix B range',
    RULES.filter(([k, , lo, hi]) => k in vehicleRules && !(vehicleRules[k].page >= lo && vehicleRules[k].page <= hi)).map(r => r[0]), []);

const glossaryEntries = [
    ...Object.entries(vehicleTraits).map(([k, v]) => [`vehicleTraits.${k}`, v]),
    ...Object.entries(vehicleRules).map(([k, v]) => [`vehicleRules.${k}`, v])
];
check('every new glossary entry is { name, source, page, description } with source church',
    glossaryEntries.filter(([, v]) => !(sameKeys(v, ['name', 'source', 'page', 'description'])
        && isText(v.name) && v.source === 'church' && isInt(v.page) && isText(v.description))).map(([k]) => k), []);

// --- Review Focus 1 and 5: resolution picks the right record (spec §2.3) ---
// Normalised keys that the build's WEAPON_MAP or WARGEAR_MAP sends to another record on purpose,
// because the book profiles the printed item under another record (plan decision 4). The build
// report lists them under MAP OVERRIDES; Task 1.12 Step 4 adds each key here.
const TIER_OVERRIDES = [];
// Same normalisation as build-vehicles.js: §2.3 plus whitespace, apostrophes and the
// "(Vehicle)" / "(Weapon)" / "(Wargear)" disambiguator that some records carry.
function normalise(name) {
    return name.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim()
        .replace(/^\d+ /, '').replace(/^twin /, '')
        .replace(/ \((vehicle|weapon|wargear)\)$/, '').replace(/s$/, '');
}
const isChurchVehicleWeapon = w => w.source === 'church' && (w.category || '').startsWith('Vehicle - ');
const WEAPON_TIERS = [
    weapons.filter(isChurchVehicleWeapon),
    weapons.filter(w => w.source === 'core'),
    weapons.filter(w => !isChurchVehicleWeapon(w) && w.source !== 'core')
];
const vehicleWargear = equipment.filter(e => e.category === 'vehicle wargear');
const WARGEAR_TIERS = [
    vehicleWargear.filter(e => e.source === 'church'),
    vehicleWargear.filter(e => e.source === 'core'),
    vehicleWargear.filter(e => e.source !== 'church' && e.source !== 'core')
];
// The id the tiers give on their own, or null when they give none (then the manual map decides).
function tierId(text, tiers) {
    const key = normalise(text);
    for (const tier of tiers) {
        const hits = tier.filter(r => normalise(r.name) === key);
        if (hits.length === 1) return hits[0].id;
        if (hits.length > 1) return null;
    }
    return null;
}
const overridden = text => TIER_OVERRIDES.includes(normalise(text));
check('a line that a tier matches resolves to that record, not to a same-name record of another book',
    vehicles.flatMap(v => [
        ...weaponsOf(v).filter(w => { const id = tierId(w.text, WEAPON_TIERS); return !overridden(w.text) && id !== null && w.weaponId !== id; })
            .map(w => `${v.id}: ${w.text} -> ${w.weaponId}`),
        ...wargearOf(v).filter(g => { const id = tierId(g.text, WARGEAR_TIERS); return !overridden(g.text) && id !== null && g.equipmentId !== id; })
            .map(g => `${v.id}: ${g.text} -> ${g.equipmentId}`)
    ]), []);
// The same profile rule as build-vehicles.js: the line's normalised name, one space, and one
// bracketed label of letters, spaces and hyphens that is not a source or ammunition tag.
const PROFILE_LABEL = /^[a-z][a-z -]*$/;
const NOT_PROFILE_LABELS = ['ammo', 'abundance of apocrypha', 'adeptus arbites'];
function isProfileOf(recordKey, key) {
    if (!recordKey.startsWith(`${key} (`) || !recordKey.endsWith(')')) return false;
    const label = recordKey.slice(key.length + 2, -1);
    return PROFILE_LABEL.test(label) && !NOT_PROFILE_LABELS.includes(label);
}
// The profile ids the rule gives for a line, or null: no record may match the line by name.
function familyIds(text) {
    const key = normalise(text);
    if (WEAPON_TIERS.some(tier => tier.some(r => normalise(r.name) === key))) return null;
    for (const tier of WEAPON_TIERS) {
        const family = tier.filter(r => isProfileOf(normalise(r.name), key));
        if (family.length >= 2) return family.map(r => r.id);
    }
    return null;
}
check('a weapon that exists only as profile records carries all of them in profileIds, in file order',
    vehicles.flatMap(v => weaponsOf(v).filter(w => !overridden(w.text) && familyIds(w.text) !== null
        && JSON.stringify(familyIds(w.text)) !== JSON.stringify(w.profileIds || null)).map(w => `${v.id}: ${w.text}`)), []);
// True when a line's stored result differs from what the tier and profile rules alone give.
function differsFromRules(item, isWeapon) {
    const tid = tierId(item.text, isWeapon ? WEAPON_TIERS : WARGEAR_TIERS);
    if (tid !== null) return (isWeapon ? item.weaponId : item.equipmentId) !== tid;
    const family = isWeapon ? familyIds(item.text) : null;
    return family !== null && JSON.stringify(item.profileIds || null) !== JSON.stringify(family);
}
check('every TIER_OVERRIDES key names a line that the map sends away from the rules',
    TIER_OVERRIDES.filter(k => !vehicles.some(v => [...weaponsOf(v).map(w => [w, true]), ...wargearOf(v).map(g => [g, false])]
        .some(([item, isWeapon]) => normalise(item.text) === k && differsFromRules(item, isWeapon)))), []);

// --- Review Focus 3: every trait chip opens a vehicleTraits entry ---
// Part 2 uses the same key rule for the chips: drop the value, then snake_case.
const traitKey = t => t.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase().replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
check('traitKey maps printed forms to the keys',
    ['Turbo Boost (2)', 'Gyro-Stabilised', 'Open Topped', 'All-Terrain', 'Gun Ports'].map(traitKey),
    ['turbo_boost', 'gyro_stabilised', 'open_topped', 'all_terrain', 'gun_ports']);
check('every vehicle trait has a vehicleTraits entry',
    vehicles.flatMap(v => (Array.isArray(v.traits) ? v.traits : []).filter(t => !(traitKey(t) in vehicleTraits)).map(t => `${v.id}: ${t}`)), []);
// With only letters, spaces, hyphens and a bracketed value, a lookup by name gives the same entry as the key rule.
const TRAIT_FORM = /^[A-Za-z][A-Za-z -]*( \([^()]+\))?$/;
check('the trait form keeps a printed value and rejects stray punctuation',
    ['Turbo Boost (2)', 'Turbo Boost (X)', 'Gyro-Stabilised', 'Open Topped', 'Sealed.', 'Hover,'].map(t => TRAIT_FORM.test(t)),
    [true, true, true, true, false, false]);
check('every vehicle trait is letters, spaces and hyphens, with an optional value in brackets',
    vehicles.flatMap(v => (Array.isArray(v.traits) ? v.traits : []).filter(t => !TRAIT_FORM.test(t)).map(t => `${v.id}: ${t}`)), []);

// --- Review Focus 2: no PDF artifacts in the text ---
function textProblems(s, paragraphs) {
    const found = [];
    if (s !== s.trim()) found.push('space at an end');
    if (/ {2}/.test(s)) found.push('double space');
    if (/[‘’“”]/.test(s)) found.push('curly quote');
    if (/[­ﬀ-ﬆ]/.test(s)) found.push('soft hyphen or ligature');
    // A suspended hyphen before and/or/to/nor ("short- and long-range") is book text, not a split word.
    if (/[a-z]- (?!(?:and|or|to|nor) )[a-z]/.test(s)) found.push('broken hyphenation');
    if ((paragraphs ? s.replace(/\n\n(?=\S)/g, '') : s).includes('\n')) found.push('stray line break');
    return found;
}
const vehicleTexts = v => [
    ['name', v.name, false], ['description', v.description, true], ['options', v.options, true], ['crew', v.crew, false],
    ...(Array.isArray(v.keywords) ? v.keywords : []).map((k, i) => [`keywords[${i}]`, k, false]),
    ...(Array.isArray(v.traits) ? v.traits : []).map((t, i) => [`traits[${i}]`, t, false]),
    ...weaponsOf(v).map((w, i) => [`weapons[${i}]`, w.text, false]),
    ...wargearOf(v).map((g, i) => [`wargear[${i}]`, g.text, false]),
    ['sidebar.title', v.sidebar?.title, false], ['sidebar.text', v.sidebar?.text, true]
];
check('the hyphenation check keeps a suspended hyphen and flags a split word',
    ['short- and long-range', 'two- or three-man', 'ar- moured'].map(s => textProblems(s, false)),
    [[], [], ['broken hyphenation']]);
check('no PDF artifacts in the vehicle text (hyphenation, quotes, spaces, line breaks)',
    vehicles.flatMap(v => vehicleTexts(v).filter(([, s]) => typeof s === 'string')
        .flatMap(([f, s, para]) => textProblems(s, para).map(p => `${v.id}.${f}: ${p}`))), []);
// Review Focus 4: the vehicle card inserts this plain text into HTML, so a < or > would break the markup.
check('the vehicle text holds no < or >',
    vehicles.flatMap(v => vehicleTexts(v).filter(([, s]) => typeof s === 'string' && /[<>]/.test(s)).map(([f]) => `${v.id}.${f}`)), []);

// --- Review Focus 4: glossary descriptions are safe HTML in the glossary convention ---
const ALLOWED_TAG = /^<(br|strong|\/strong|em|\/em|caption|\/caption|tr|\/tr|th|\/th|td|\/td|\/table|\/div|table class='glossary-table'|div class='glossary-table-scroll')>$/;
function htmlProblems(s) {
    const found = [];
    if (/&(?!(amp|lt|gt|quot|#\d+);)/.test(s)) found.push('bare &');
    const open = [];
    for (const [tag] of s.matchAll(/<[^>]*>/g)) {
        if (!ALLOWED_TAG.test(tag)) { found.push(`tag ${tag}`); continue; }
        const name = tag.match(/^<\/?(\w+)/)[1];
        if (name === 'br') continue;
        if (tag[1] === '/') { if (open.pop() !== name) found.push(`unbalanced ${tag}`); } else open.push(name);
    }
    if (open.length) found.push(`unclosed ${open.join(', ')}`);
    if (/[<>]/.test(s.replace(/<[^>]*>/g, ''))) found.push('stray < or >');
    return found;
}
check('every new glossary name and description is clean, safe HTML',
    glossaryEntries.flatMap(([k, v]) => [
        ...(isText(v.name) ? textProblems(v.name, false) : []),
        ...(isText(v.description) ? [...htmlProblems(v.description), ...textProblems(v.description, false)] : [])
    ].map(p => `${k}: ${p}`)), []);

finish();
