// Generates the materials review table from js/beam_deflection/materials.js so
// the document cannot drift from the shipped data. Rerun after editing the list.
//
//   node scripts/gen-beam-materials-review.mjs
import { MATERIALS, MATERIAL_CATEGORIES } from '../js/beam_deflection/materials.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/SOW/BEAM_DEFLECTION_MATERIALS_REVIEW.md');

const gpa = (v) => (v / 1e9).toFixed(v / 1e9 >= 100 ? 0 : 1);
const mpa = (v) => (v === null ? '--' : (v / 1e6).toFixed(v / 1e6 >= 100 ? 0 : 1));

const lines = [];
lines.push('# Beam Deflection: materials review table');
lines.push('');
lines.push('Generated from `js/beam_deflection/materials.js` by');
lines.push('`scripts/gen-beam-materials-review.mjs`. Regenerate instead of editing by');
lines.push('hand, or the two will drift.');
lines.push('');
lines.push('This is the SOW section 11 Phase 0 gate. A row is signed off only when someone');
lines.push('has opened the cited source and confirmed the numbers. The tool surfaces the');
lines.push('outstanding count in the UI instead of hiding it, so an unreviewed list shows');
lines.push('up as a provisional badge on every material.');
lines.push('');
lines.push('The September 2026 pass read every row against the source now cited in it, and');
lines.push('the `source` field names the document that was actually read, not the');
lines.push('one it would be nice to have read. Where only a secondary summary was');
lines.push('available, the source says so.');
lines.push('');
lines.push('**strength.kind** is `yield` for ductile metals and most thermoplastics,');
lines.push('`rupture` for brittle materials and for wood (which fails by fracture and');
lines.push('whose NDS values are already-reduced design values, so leave the safety factor');
lines.push('at 1), and `none` where no single number is worth comparing a bending stress');
lines.push('against.');
lines.push('');

for (const cat of MATERIAL_CATEGORIES) {
  const rows = MATERIALS.filter((m) => m.cat === cat);
  if (!rows.length) continue;
  lines.push(`## ${cat}`);
  lines.push('');
  lines.push('| id | name | E (GPa) | E range | kind | strength (MPa) | rho (kg/m^3) | source | reviewed |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const m of rows) {
    const range = m.E_range ? `${gpa(m.E_range[0])} to ${gpa(m.E_range[1])}` : '--';
    lines.push([
      '', `\`${m.id}\``, m.name, gpa(m.E), range, m.strength.kind,
      mpa(m.strength.value), m.rho, m.source, m.reviewed ? 'yes' : '[ ]', '',
    ].join(' | ').trim());
  }
  lines.push('');
  for (const m of rows) {
    if (m.notes) lines.push(`- \`${m.id}\`: ${m.notes}`);
    if (m.gated) lines.push(`- \`${m.id}\`: **gated** in the tool. ${m.gateReason}`);
  }
  lines.push('');
}

const unreviewed = MATERIALS.filter((m) => !m.reviewed).length;
lines.push('---');
lines.push('');
lines.push(`**Status: ${MATERIALS.length - unreviewed} of ${MATERIALS.length} rows reviewed.**`);
lines.push('');
lines.push('To take a row back to provisional, set `reviewed: false` on it in');
lines.push('`materials.js` and regenerate. The count in the tool follows automatically.');
lines.push('');
lines.push('## What the September 2026 pass changed');
lines.push('');
lines.push('Seven rows moved. Five of the seven were a single failure mode: a *typical*');
lines.push('measured property shipped under a citation to a standard that publishes');
lines.push('*specified minimums*. Typical values are the larger number, so every one of');
lines.push('them overstated capacity.');
lines.push('');
lines.push('| row | was | now | why |');
lines.push('|---|---|---|---|');
lines.push('| `stainless-304` | 215 MPa | 205 MPa | A240 minimum. `stainless-316` already carried the minimum, so the category had been silently mixing two bases. |');
lines.push('| `alu-6061-t6` | 276 MPa | 241 MPa | 35 ksi is the Aluminum Design Manual minimum; 40 ksi is the typical value that property tables report. |');
lines.push('| `alu-6063-t5` | 145 MPa | 110 MPa | Same problem, and a wider gap: the minimum is 16 ksi against a 21 ksi typical. |');
lines.push('| `nylon-66` | 2.8 GPa / 60 MPa | 3.1 GPa / 82 MPa | The old pair straddled two conditions: a dry-ish modulus with a conditioned-ish strength. Both are now Zytel 101 dry as moulded. |');
lines.push('| `glass-soda-lime` | 70 GPa / 40 MPa / 2500 | 71.7 GPa / 41 MPa / 2530 | Replaced estimates with the National Glass Association tabulated values. |');
lines.push('| `alumina-99` | 350 MPa | 300 MPa | 350 sat between the 3-point and 4-point flexural figures. 300 is the 4-point value CoorsTek publishes for AD-995. |');
lines.push('| `cast-iron-gray-30` | E 66 to 110 GPa | E 90 to 113 GPa | The old range spanned every gray iron class, not Class 30. |');
lines.push('');
lines.push('Two rows kept their numbers but had their citation corrected, which matters as');
lines.push('much, because the citation is what the next reviewer will check against:');
lines.push('');
lines.push('- `pla` cited the NatureWorks 4043D datasheet. That sheet reports 3.86 GPa and');
lines.push('  110 to 145 MPa for biaxially oriented 25 micron film, which has nothing to do');
lines.push('  with a solid beam. The row now says so explicitly.');
lines.push('- Six plastics cited the ASM Engineered Materials Handbook, which was not the');
lines.push('  document consulted. They now cite the published property tables that were.');
lines.push('');
lines.push('## What held');
lines.push('');
lines.push('- **All five wood rows.** Fb and E were read straight out of NDS Table 4A and');
lines.push('  every value matched: DF-L Select Structural 1500 psi / 1,900,000 psi, DF-L');
lines.push('  No. 2 900 / 1,600,000, Hem-Fir No. 2 850 / 1,300,000, SPF 875 / 1,400,000,');
lines.push('  glulam 24F-V4 2400 psi / 1,800,000 psi. The AWC errata to the 2018 Supplement');
lines.push('  was checked and touches none of these species (it adds Norway Spruce rows).');
lines.push('  One naming fix: Table 4A has no standalone No. 2 row for Spruce-Pine-Fir, it');
lines.push('  lists a combined No. 1/No. 2 grade, so the row is renamed to match the table');
lines.push('  a user would look it up in.');
lines.push('- **Both A500 rows**, which were the most likely place to find a flattened');
lines.push('  round-versus-shaped yield. Grade B round 42 ksi and Grade C shaped 50 ksi are');
lines.push('  both correct.');
lines.push('- A36, A992, 1018 CD, 316, 2024-T3, Ti-6Al-4V, gray iron tensile strength, and');
lines.push('  the remaining plastics.');
lines.push('');
lines.push('## Worth knowing when reading a result');
lines.push('');
lines.push('- **Glass.** The 41 MPa is a *mean* modulus of rupture, meaning a 50 percent');
lines.push('  probability of breakage. The same NGA sheet gives 19 MPa as the design stress');
lines.push('  for a 0.8 percent probability. A glass beam at 100 percent utilization');
lines.push('  against 41 MPa is not marginal, it is a coin flip.');
lines.push('- **Nylon.** Conditioned to 50 percent RH, Zytel 101 falls to 1.4 GPa and');
lines.push('  55 MPa. A nylon beam in ordinary indoor air deflects more than twice what');
lines.push('  the dry row predicts, so the row carries a range spanning both states.');
lines.push('- **Wood.** These are reference design values that already include their own');
lines.push('  reductions, so the safety factor belongs at 1.0 and the NDS adjustment');
lines.push('  factors are applied separately. The tool does not apply them.');
lines.push('');

fs.writeFileSync(out, `${lines.join('\n')}\n`);
console.log(`wrote review table: ${MATERIALS.length} rows, ${unreviewed} unreviewed`);
