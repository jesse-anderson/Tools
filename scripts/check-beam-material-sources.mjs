// Ground-truth check for the beam deflection material library.
//
//   node scripts/check-beam-material-sources.mjs
//
// SOURCE_VALUES below is transcribed from the archived source documents in
// data/beam_deflection_materials/sources/, in the unit each document prints.
// This script converts them into SI and asserts js/beam_deflection/materials.js
// agrees, then writes the comparison out as verified_values.csv.
//
// The sign-off is reproducible this way instead of being a claim. The PDFs
// are not committed (see data/.gitignore), so if they are ever lost, this file
// plus the CSV still record what each document said and where it said it.
//
// Exits non-zero on any disagreement.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATERIALS_BY_ID } from '../js/beam_deflection/materials.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'data/beam_deflection_materials');

// Exact by definition, so the conversion adds no error of its own.
const PSI = 6894.757293168361;
const KSI = PSI * 1000;
const MPA = 1e6;
const GPA = 1e9;

// [material id, property, value as printed, unit as printed, factor to SI,
//  source id, locator within that source, optional relative tolerance]
//
// Where a standard is dual-designated the metric designation is used, because
// that is what the document specifies rather than something derived from it.
// ASTM A36/A36M reads "36 ksi [250 MPa]": 250 is a designated value, not a
// rounded conversion of 36 ksi, which would be 248.2. Using the imperial number
// and converting would manufacture a 0.7% disagreement that is not real.
const SOURCE_VALUES = [
    ['steel-a36', 'strength', 250, 'MPa', MPA, 'astm_a36', 'Specified minimum yield, 36 ksi [250 MPa]'],
    ['steel-a36', 'E', 200, 'GPa', GPA, 'aisc_spec', 'E for structural steel, 29,000 ksi [200 GPa]'],
    ['steel-a992', 'strength', 345, 'MPa', MPA, 'astm_a992', 'Specified minimum yield, 50 ksi [345 MPa]'],
    ['steel-a500b-round', 'strength', 290, 'MPa', MPA, 'sti_a500', 'Grade B round, 42 ksi [290 MPa]'],
    ['steel-a500c-shaped', 'strength', 345, 'MPa', MPA, 'sti_a500', 'Grade C shaped, 50 ksi [345 MPa]'],
    ['stainless-304', 'strength', 205, 'MPa', MPA, 'astm_a240', 'Type 304 minimum yield, 30 ksi [205 MPa]'],
    ['stainless-316', 'strength', 205, 'MPa', MPA, 'astm_a240', 'Type 316 minimum yield, 30 ksi [205 MPa]'],
    // The Aluminum Design Manual is US-only, so these two are genuine
    // conversions rounded to three figures: 35 ksi is 241.3 MPa, 16 ksi is
    // 110.3 MPa. The looser tolerance covers that rounding.
    ['alu-6061-t6', 'strength', 35, 'ksi', KSI, 'adm_a34', '6061-T6 minimum Fty', 2e-3],
    ['alu-6063-t5', 'strength', 16, 'ksi', KSI, 'adm_a34', '6063-T5 minimum Fty, to 0.5 in', 3e-3],

    // CoorsTek Advanced Alumina brochure, AD-995 column.
    ['alumina-99', 'strength', 300, 'MPa', MPA, 'coorstek_alumina', '4-PT Flexural Strength (MOR) 20 C, AD-995'],
    ['alumina-99', 'E', 370, 'GPa', GPA, 'coorstek_alumina', 'Elastic Modulus 20 C, AD-995'],
    ['alumina-99', 'rho', 3900, 'kg/m^3', 1, 'coorstek_alumina', 'Density 3.90 g/cm3, AD-995'],

    // DuPont Zytel 101L datasheet, ISO 527-1/-2, dry / conditioned pair.
    ['nylon-66', 'strength', 82, 'MPa', MPA, 'dupont_zytel101l', 'Yield stress 82 / 55 MPa, dry value'],
    ['nylon-66', 'E', 3100, 'MPa', MPA, 'dupont_zytel101l', 'Tensile Modulus 3100 / 1400 MPa, dry value'],

    // National Glass Association FM05-12.
    ['glass-soda-lime', 'strength', 41, 'MPa', MPA, 'nga_fm05_12', 'Typical mean MOR, annealed, 6000 psi'],
    ['glass-soda-lime', 'E', 71.7, 'GPa', GPA, 'nga_fm05_12', "Modulus of Elasticity (Young's) 10.4e6 psi"],
    ['glass-soda-lime', 'rho', 2530, 'kg/m^3', 1, 'nga_fm05_12', 'Density 158 lb/ft3'],

    // NDS Supplement Table 4A, read out of the archived reproduction and
    // recorded in nds_table_4a_extract.csv.
    ['wood-dfl-ss', 'strength', 1500, 'psi', PSI, 'nds_table_4a', 'Douglas Fir-Larch, Select Structural, Fb'],
    ['wood-dfl-ss', 'E', 1.9e6, 'psi', PSI, 'nds_table_4a', 'Douglas Fir-Larch, Select Structural, E'],
    ['wood-dfl-no2', 'strength', 900, 'psi', PSI, 'nds_table_4a', 'Douglas Fir-Larch, No. 2, Fb'],
    ['wood-dfl-no2', 'E', 1.6e6, 'psi', PSI, 'nds_table_4a', 'Douglas Fir-Larch, No. 2, E'],
    ['wood-hf-no2', 'strength', 850, 'psi', PSI, 'nds_table_4a', 'Hem-Fir, No.2, Fb'],
    ['wood-hf-no2', 'E', 1.3e6, 'psi', PSI, 'nds_table_4a', 'Hem-Fir, No.2, E'],
    ['wood-spf-no2', 'strength', 875, 'psi', PSI, 'nds_table_4a', 'Spruce-Pine-Fir, No. 1/No. 2, Fb'],
    ['wood-spf-no2', 'E', 1.4e6, 'psi', PSI, 'nds_table_4a', 'Spruce-Pine-Fir, No. 1/No. 2, E'],
    ['wood-glulam-24f', 'strength', 2400, 'psi', PSI, 'apa_glulam', '24F-V4 Fbx+'],
    ['wood-glulam-24f', 'E', 1.8e6, 'psi', PSI, 'apa_glulam', '24F-V4 Ex'],
];

// How far the stored value may sit from the source, as a fraction. Values are
// stored to about six significant figures, so this is generous; it exists to
// absorb rounding, not to hide a disagreement.
const TOLERANCE = 1e-4;

const read = (m, prop) => (prop === 'strength' ? m.strength.value : m[prop]);

const rows = [];
const failures = [];
for (const [id, prop, printed, unit, factor, sourceId, locator, tol] of SOURCE_VALUES) {
    const m = MATERIALS_BY_ID[id];
    if (!m) {
        failures.push(`${id}: no such material`);
        continue;
    }
    const expected = printed * factor;
    const stored = read(m, prop);
    const rel = Math.abs(stored - expected) / Math.abs(expected);
    const limit = tol ?? TOLERANCE;
    const ok = rel <= limit;
    if (!ok) {
        failures.push(`${id}.${prop}: stored ${stored} vs source ${expected} (${(rel * 100).toFixed(3)}% off, limit ${(limit * 100).toFixed(3)}%)`);
    }
    rows.push({
        material_id: id,
        property: prop,
        stored_si: stored,
        si_unit: prop === 'rho' ? 'kg/m^3' : 'Pa',
        source_value: printed,
        source_unit: unit,
        source_si: Number(expected.toPrecision(9)),
        rel_error: rel.toExponential(2),
        source_id: sourceId,
        locator,
        verdict: ok ? 'agrees' : 'MISMATCH',
    });
}

const header = Object.keys(rows[0]);
const csv = [header.join(',')]
    .concat(rows.map((r) => header
        .map((k) => (/[",]/.test(String(r[k])) ? `"${String(r[k]).replace(/"/g, '""')}"` : r[k]))
        .join(',')))
    .join('\n');
fs.writeFileSync(path.join(outDir, 'verified_values.csv'), `${csv}\n`);

console.log(`checked ${rows.length} values against their sources`);
if (failures.length) {
    console.error('\nDISAGREEMENTS:');
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
}
console.log('all values agree with the archived sources');
