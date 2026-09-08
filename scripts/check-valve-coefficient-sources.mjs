// Ground-truth check for the control valve coefficient and fluid libraries.
//
//   node scripts/check-valve-coefficient-sources.mjs
//
// SOURCE_VALUES below is transcribed from the archived source in
// data/control_valve_coefficients/sources/, in the form that document prints.
// This script asserts js/control_valve_sizing/valve-styles.js and fluids.js
// agree with it, then writes the comparison out as verified_values.csv.
//
// The sign-off is reproducible this way instead of being a claim. The PDF is not
// committed (see data/.gitignore), so if it is ever lost, this file plus the CSV
// still record what the document said and where it said it.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. It proves provenance: that the value
// in the row is the value the cited page prints. It does NOT prove accuracy.
// FL, xT and Fd are flow-test measurements per trim, per flow direction, to
// IEC 60534-2-3, and these are style typicals; a real FL can sit 0.05 to 0.10
// away and it enters the choke criterion squared. Ground truth for a control
// valve is a flow loop. This script is a transcription check, which is the only
// kind of check the available sources admit.
//
// Exits non-zero on any disagreement.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STYLES_BY_ID, VALVE_STYLES } from '../js/control_valve_sizing/valve-styles.js';
import { GASES_BY_ID, GASES, molecularWeightFromFormula } from '../js/control_valve_sizing/fluids.js';
import { N } from '../js/control_valve_sizing/valve-engine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'data/control_valve_coefficients');

const SOURCE = 'fisher_cvh_5ed';

// [library, id, property, value as printed, locator within the source]
const SOURCE_VALUES = [
    // Section 5.10.1, single-ported globe-style bodies, printed page 109.
    ['style', 'globe-cage-linear-1', 'FL', 0.84, '5.10.1 NPS 1 cage-guided linear'],
    ['style', 'globe-cage-linear-1', 'xT', 0.64, '5.10.1 NPS 1 cage-guided linear'],
    ['style', 'globe-cage-linear-1', 'Fd', 0.34, '5.10.1 NPS 1 cage-guided linear'],
    ['style', 'globe-cage-eqpct-1', 'FL', 0.88, '5.10.1 NPS 1 cage-guided equal-percentage'],
    ['style', 'globe-cage-eqpct-1', 'xT', 0.67, '5.10.1 NPS 1 cage-guided equal-percentage'],
    ['style', 'globe-cage-linear-2', 'FL', 0.77, '5.10.1 NPS 2 cage-guided linear'],
    ['style', 'globe-cage-linear-2', 'xT', 0.64, '5.10.1 NPS 2 cage-guided linear'],
    ['style', 'globe-cage-eqpct-2', 'FL', 0.85, '5.10.1 NPS 2 cage-guided equal-percentage'],
    ['style', 'globe-cage-eqpct-2', 'xT', 0.69, '5.10.1 NPS 2 cage-guided equal-percentage'],
    ['style', 'globe-cage-linear-3', 'FL', 0.82, '5.10.1 NPS 3 cage-guided linear'],
    ['style', 'globe-cage-linear-3', 'xT', 0.62, '5.10.1 NPS 3 cage-guided linear'],
    ['style', 'globe-cage-eqpct-3', 'xT', 0.68, '5.10.1 NPS 3 cage-guided equal-percentage'],
    // The row the steam worked example in 5.9.5 uses, so it is pinned twice
    // over: once here against the table and once in the spec against the example.
    ['style', 'globe-cage-linear-4', 'Cv', 236, '5.10.1 NPS 4 cage-guided linear'],
    ['style', 'globe-cage-linear-4', 'FL', 0.82, '5.10.1 NPS 4 cage-guided linear'],
    ['style', 'globe-cage-linear-4', 'xT', 0.69, '5.10.1 NPS 4 cage-guided linear'],
    ['style', 'globe-post-eqpct-0p5', 'FL', 0.90, '5.10.1 NPS 1/2 post-guided equal-percentage'],
    ['style', 'globe-post-eqpct-0p75', 'Fd', 0.61, '5.10.1 NPS 3/4 post-guided equal-percentage'],

    // Section 5.10.2, rotary valves, printed page 110.
    ['style', 'ball-vnotch-1-60', 'Cv', 15.6, '5.10.2 NPS 1 V-notch ball, 60 degrees'],
    ['style', 'ball-vnotch-1-60', 'FL', 0.86, '5.10.2 NPS 1 V-notch ball, 60 degrees'],
    ['style', 'ball-vnotch-1-90', 'xT', 0.42, '5.10.2 NPS 1 V-notch ball, 90 degrees'],
    ['style', 'ball-vnotch-3-90', 'Cv', 321, '5.10.2 NPS 3 V-notch ball, 90 degrees'],
    ['style', 'ball-vnotch-4-90', 'FL', 0.62, '5.10.2 NPS 4 V-notch ball, 90 degrees'],
    ['style', 'butterfly-hp-3-60', 'FL', 0.81, '5.10.2 NPS 3 high-performance butterfly, 60 degrees'],
    ['style', 'butterfly-hp-3-90', 'FL', 0.64, '5.10.2 NPS 3 high-performance butterfly, 90 degrees'],
    ['style', 'butterfly-hp-4-90', 'FL', 0.53, '5.10.2 NPS 4 high-performance butterfly, 90 degrees'],
    ['style', 'butterfly-hp-4-90', 'xT', 0.19, '5.10.2 NPS 4 high-performance butterfly, 90 degrees'],
    ['style', 'butterfly-hp-8-90', 'FL', 0.48, '5.10.2 NPS 8 high-performance butterfly, 90 degrees'],

    // Section 13.4, specific heat ratio, printed page 237.
    ['gas', 'air', 'gamma', 1.40, '13.4 Air'],
    ['gas', 'nitrogen', 'gamma', 1.40, '13.4 Nitrogen'],
    ['gas', 'oxygen', 'gamma', 1.40, '13.4 Oxygen'],
    ['gas', 'carbon-dioxide', 'gamma', 1.29, '13.4 Carbon Dioxide'],
    ['gas', 'carbon-monoxide', 'gamma', 1.40, '13.4 Carbon Monoxide'],
    ['gas', 'hydrogen', 'gamma', 1.40, '13.4 Hydrogen'],
    ['gas', 'helium', 'gamma', 1.66, '13.4 Helium'],
    ['gas', 'argon', 'gamma', 1.67, '13.4 Argon'],
    // Prints 1.26, where the figure usually quoted from memory is about 1.32.
    ['gas', 'methane', 'gamma', 1.26, '13.4 Methane'],
    ['gas', 'steam', 'gamma', 1.33, '13.4 Steam'],
];

// Equation constants, section 5.7, printed page 99. Metric rows, defined for Cv.
const N_VALUES = [
    ['N1', 0.0865, '5.7 q m3/h, P kPa'],
    ['N2', 0.00214, '5.7 d mm'],
    ['N5', 0.00241, '5.7 d mm'],
    ['N6', 2.73, '5.7 w kg/h, P kPa, rho kg/m3'],
    ['N8', 0.948, '5.7 w kg/h, P kPa, T K'],
    ['N9', 22.5, '5.7 q m3/h at 15 C standard, P kPa, T K'],
];

const failures = [];
const verified = [];

for (const [library, id, property, printed, locator] of SOURCE_VALUES) {
    const row = library === 'style' ? STYLES_BY_ID[id] : GASES_BY_ID[id];
    if (!row) {
        failures.push(`${library} "${id}" is not in the library, but ${locator} was transcribed for it`);
        continue;
    }
    const stored = row[property];
    if (stored !== printed) {
        failures.push(`${library} ${id}.${property}: library has ${stored}, ${locator} prints ${printed}`);
        continue;
    }
    verified.push({ library, id, property, printed, stored, locator, source: SOURCE });
}

for (const [name, printed, locator] of N_VALUES) {
    if (N[name] !== printed) {
        failures.push(`constant ${name}: engine has ${N[name]}, ${locator} prints ${printed}`);
        continue;
    }
    verified.push({ library: 'constant', id: name, property: 'value', printed, stored: N[name], locator, source: SOURCE });
}

// N4 is absent from the handbook because it does not cover the non-turbulent
// lane. Asserting its absence keeps the gap deliberate: if somebody later fills
// it in from memory or a web page, this fails and they have to say where it
// came from.
if (N.N4 !== null) {
    failures.push('constant N4 is set, but no obtained source publishes it. See data/control_valve_coefficients/README.md.');
}

// Every row must claim a source and a review status, whether or not it appears
// above. A row nobody transcribed is a row nobody checked.
for (const row of [...VALVE_STYLES, ...GASES]) {
    if (!row.source) failures.push(`row "${row.id}" carries no source`);
    if (row.reviewed !== true) failures.push(`row "${row.id}" is not marked reviewed`);
}
const covered = new Set(SOURCE_VALUES.map(([, id]) => id));
const uncovered = [...VALVE_STYLES, ...GASES].filter((r) => !covered.has(r.id)).map((r) => r.id);

// Molecular weights are the one quantity here with a first-principles check
// available, so it is taken. Everything else in this file is transcription.
for (const gas of GASES) {
    if (!gas.formula) continue;
    const computed = molecularWeightFromFormula(gas.formula);
    const drift = Math.abs(computed - gas.MW) / gas.MW;
    if (!(drift < 0.001)) {
        failures.push(`gas ${gas.id}.MW: library has ${gas.MW}, atomic weights sum to ${computed.toFixed(4)}`);
        continue;
    }
    verified.push({
        library: 'gas', id: gas.id, property: 'MW', printed: computed.toFixed(4),
        stored: gas.MW, locator: 'sum of standard atomic weights', source: 'first principles',
    });
}

const csv = ['library,id,property,source_value,stored_value,locator,source']
    .concat(verified.map((v) => [
        v.library, v.id, v.property, v.printed, v.stored, `"${v.locator}"`, v.source,
    ].join(',')));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'verified_values.csv'), `${csv.join('\n')}\n`, 'utf8');

console.log(`verified ${verified.length} values against ${SOURCE}`);
console.log(`wrote ${path.relative(root, path.join(outDir, 'verified_values.csv'))}`);
if (uncovered.length) {
    console.log(`\nrows present in the library with no transcribed spot check: ${uncovered.length}`);
    console.log(`  ${uncovered.join(', ')}`);
    console.log('  (they still carry a source and a review flag; this lists what a');
    console.log('   second reading of the printed tables should cover next)');
}
if (failures.length) {
    console.error(`\n${failures.length} DISAGREEMENT(S):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log('\nno disagreements');
