// Material library for the beam deflection tool.
//
// This list is deliberately not shared with
// js/linear_thermal_expansion/linear-thermal-expansion.js. Extracting a shared
// module would mean editing an Active, tested tool at the same time as landing a
// new one, and dropping or mistyping an entry during that move is a real risk.
// The cost of the decision is two lists that can drift; a later consolidation
// pass is separate work with its own review. The same note lives in the thermal
// tool's header.
//
// The list is also not a copy of the thermal tool's 51 entries. Several of those
// are not beam materials in any realistic sense, and its six wood rows are split
// parallel/perpendicular to grain because that is what matters for thermal
// expansion. Bending needs modulus of elasticity along the grain, which is a
// different property with a different split (species and grade). So this is a
// purpose-built structural list rather than a filtered thermal one.
//
// Strict SI, like everything the engine touches: E and strength in pascals,
// density in kg/m^3. The familiar unit is in a trailing comment on each value.
//
// A row carries `reviewed: false` until it has been checked against a source
// that was actually opened, and the tool shows that state instead of hiding it.
// "Standard published figure" is not "verified", and an unchecked material
// property is how a plausible answer turns out to be a wrong one.
//
// All 28 rows were checked in September 2026 against the sources now cited, and
// `source` names the document that was read, not the one it would be nice to
// have read. The archive that was checked against lives in
// data/beam_deflection_materials/: a manifest with a SHA-256 per document, the
// extracted NDS Table 4A rows, and verified_values.csv pairing every stored
// value with the value as printed in its source. Run
// `node scripts/check-beam-material-sources.mjs` to re-prove the agreement; it
// exits non-zero if this file drifts from those sources.
//
// Seven rows moved as a result of that review:
//   304 stainless   215 -> 205 MPa, the A240 minimum; 316 already carried the
//                   minimum, so the category had been mixing two bases
//   6061-T6         276 -> 241 MPa, and 6063-T5 145 -> 110 MPa: both shipped
//                   typical values while citing the Aluminum Design Manual,
//                   which tabulates specified minimums
//   Nylon 6/6       2.8 GPa / 60 MPa -> 3.1 GPa / 82 MPa, a matched dry-as-
//                   moulded pair; the old numbers straddled dry and conditioned
//   Soda-lime glass 70 -> 71.7 GPa, 40 -> 41 MPa, 2500 -> 2530 kg/m^3
//   Alumina 99.5%   350 -> 300 MPa, the 4-point flexural value
//   Gray iron       modulus range narrowed to Class 30 rather than all classes
// Everything else held, including all five wood rows, which were read out of
// NDS Table 4A directly and cross-checked against the AWC errata. Their stored
// SI values were tightened from three significant figures to six, because the
// printed value is in psi and the SI here is derived: rounding 1500 psi to
// 10.3 MPa put 0.4 percent of error into the data that is not in the source.
//
// strength.kind matters and the schema must not assume yield is universal:
//   'yield'   ductile metals and most thermoplastics; utilization against Fy
//   'rupture' brittle materials, and wood, which fail by fracture with far wider
//             scatter than a metal's yield; reported with a brittle caveat and
//             no ductile utilization bar
//   'none'    no meaningful single strength for this tool; the stress check is
//             skipped and the reason is shown

export const MATERIAL_CATEGORIES = ['Steel', 'Aluminium', 'Other metals', 'Plastics', 'Wood', 'Brittle', 'Gated'];

// Warning text attached by category instead of repeated per row.
export const CATEGORY_WARNINGS = {
    'Plastics': {
        id: 'creep',
        severity: 'warn',
        text: 'A single elastic modulus describes short-term loading only. Under sustained load a polymer beam keeps deflecting for the life of the load, so the number here is a lower bound on real deflection, potentially by a large factor.',
    },
    'Wood': {
        id: 'wood-duration',
        severity: 'warn',
        text: 'Wood properties depend on species, grade, moisture, and how long the load is applied. The modulus used is bending MOE along the grain. Size, repetitive-member, wet-service, and load-duration adjustment factors are not applied.',
    },
    'Brittle': {
        id: 'brittle',
        severity: 'warn',
        text: 'This material fails by fracture with no ductile warning beforehand, and its rupture strength scatters widely with surface condition. Treat the stress check as indicative only.',
    },
};

export const MATERIALS = [
    // --- Steel -------------------------------------------------------------
    {
        id: 'steel-a36',
        cat: 'Steel',
        name: 'Structural steel, ASTM A36',
        E: 200e9,               // 200 GPa / 29,000 ksi
        E_range: [199e9, 200e9],
        strength: { kind: 'yield', value: 250e6 },  // 36 ksi
        rho: 7850,
        source: 'ASTM A36/A36M specified minimum yield (36 ksi); E = 29,000 ksi per the AISC Specification.',
        notes: 'The default mild structural steel. E is taken as 29,000 ksi throughout AISC.',
        reviewed: true,
    },
    {
        id: 'steel-a992',
        cat: 'Steel',
        name: 'Structural steel, ASTM A992 (W-shapes)',
        E: 200e9,
        E_range: null,
        strength: { kind: 'yield', value: 345e6 },  // 50 ksi
        rho: 7850,
        source: 'ASTM A992/A992M specified minimum yield (50 ksi); E = 29,000 ksi per the AISC Specification.',
        notes: 'The standard grade for rolled wide-flange shapes in current US practice.',
        reviewed: true,
    },
    {
        id: 'steel-a500b-round',
        cat: 'Steel',
        name: 'HSS round, ASTM A500 Grade B',
        E: 200e9,
        E_range: null,
        strength: { kind: 'yield', value: 290e6 },  // 42 ksi
        rho: 7850,
        source: 'ASTM A500/A500M Grade B, round product (42 ksi); cross-checked against Steel Tube Institute and Atlas Tube summaries.',
        notes: 'Round HSS. Shaped (square and rectangular) A500 Grade B is a higher 46 ksi.',
        reviewed: true,
    },
    {
        id: 'steel-a500c-shaped',
        cat: 'Steel',
        name: 'HSS square/rectangular, ASTM A500 Grade C',
        E: 200e9,
        E_range: null,
        strength: { kind: 'yield', value: 345e6 },  // 50 ksi
        rho: 7850,
        source: 'ASTM A500/A500M Grade C, shaped product (50 ksi); cross-checked against Steel Tube Institute and Atlas Tube summaries.',
        notes: 'Shaped HSS, Grade C. Design wall thickness is normally taken as 0.93 of nominal.',
        reviewed: true,
    },
    {
        id: 'steel-1018-cd',
        cat: 'Steel',
        name: 'Mild steel, AISI 1018 cold drawn',
        E: 205e9,
        E_range: [200e9, 205e9],
        strength: { kind: 'yield', value: 370e6 },
        rho: 7870,
        source: 'MatWeb/ASM datasheet for AISI 1018 cold drawn; cross-checked against Xometry and MakeItFrom property summaries.',
        notes: 'Cold drawn bar stock, yield 370 MPa (about 54 ksi). Hot rolled 1018 yields far lower, near 220 MPa. Published modulus is quoted as both 200 and 205 GPa; the difference is inside normal scatter and does not change a deflection.',
        reviewed: true,
    },
    {
        id: 'stainless-304',
        cat: 'Steel',
        name: 'Stainless steel, 304 annealed',
        E: 193e9,
        E_range: null,
        strength: { kind: 'yield', value: 205e6 },
        rho: 8000,
        source: 'ASTM A240/A240M specified minimum yield for Type 304 (30 ksi).',
        notes: 'A240 specified minimum for the annealed condition. Typical annealed material tests higher, near 215 MPa, and work hardening raises it much further, but the specified minimum is what a design checks against.',
        reviewed: true,
    },
    {
        id: 'stainless-316',
        cat: 'Steel',
        name: 'Stainless steel, 316 annealed',
        E: 193e9,
        E_range: null,
        strength: { kind: 'yield', value: 205e6 },
        rho: 8000,
        source: 'ASTM A240/A240M specified minimum yield for Type 316 (30 ksi).',
        notes: 'A240 specifies the same 205 MPa minimum for 304 and 316; they differ in corrosion resistance, not in specified strength. Typical annealed 316 tests well above this.',
        reviewed: true,
    },

    // --- Aluminium ---------------------------------------------------------
    {
        id: 'alu-6061-t6',
        cat: 'Aluminium',
        name: 'Aluminium 6061-T6',
        E: 68.9e9,              // 10,000 ksi
        E_range: null,
        strength: { kind: 'yield', value: 241e6 },  // 35 ksi
        rho: 2700,
        source: 'Aluminum Association, Aluminum Design Manual Table A.3.4; ASTM B209/B308 minimum Fty for 6061-T6.',
        notes: 'The general-purpose structural alloy. 241 MPa is the specified minimum (35 ksi); the 276 MPa (40 ksi) figure that property tables report is a typical value, not a design value. Welding drops the strength in the heat-affected zone.',
        reviewed: true,
    },
    {
        id: 'alu-6063-t5',
        cat: 'Aluminium',
        name: 'Aluminium 6063-T5',
        E: 68.9e9,
        E_range: null,
        strength: { kind: 'yield', value: 110e6 },  // 16 ksi
        rho: 2700,
        source: 'Aluminum Association, Aluminum Design Manual Table A.3.4; minimum Fty for 6063-T5 extrusions to 0.5 in.',
        notes: 'Common extrusion alloy, including 80/20-style framing. 110 MPa is the specified minimum (16 ksi); typical material tests near 145 MPa. Much weaker than 6061-T6, and the minimum drops again above 0.5 in wall.',
        reviewed: true,
    },
    {
        id: 'alu-2024-t3',
        cat: 'Aluminium',
        name: 'Aluminium 2024-T3',
        E: 73.1e9,
        E_range: null,
        strength: { kind: 'yield', value: 345e6 },
        rho: 2780,
        source: 'ASTM B209 / AMS-QQ-A-250 for 2024-T3 sheet; published Fty 50 ksi.',
        notes: 'Aerospace alloy, sheet in the T3 temper. Poor corrosion resistance bare, so usually clad, and the cladding lowers the effective strength of thin sheet.',
        reviewed: true,
    },

    // --- Other metals ------------------------------------------------------
    {
        id: 'titanium-6al4v',
        cat: 'Other metals',
        name: 'Titanium Ti-6Al-4V (Grade 5)',
        E: 113.8e9,
        E_range: null,
        strength: { kind: 'yield', value: 880e6 },
        rho: 4430,
        source: 'ATI 6-4 and Professional Plastics Ti-6Al-4V Grade 5 annealed datasheets; ASTM B348 grade definition.',
        notes: 'Annealed. High strength for its density, but only about half the stiffness of steel, so a titanium beam deflects nearly twice as far as a steel one of the same section.',
        reviewed: true,
    },
    {
        id: 'cast-iron-gray-30',
        cat: 'Other metals',
        name: 'Gray cast iron, ASTM A48 Class 30',
        E: 100e9,
        E_range: [90e9, 113e9],
        // Brittle in tension: it fractures rather than yields, so the relevant
        // number is a tensile rupture strength, not a yield strength.
        strength: { kind: 'rupture', value: 207e6 },  // 30 ksi minimum tensile
        rho: 7150,
        source: 'ASTM A48/A48M Class 30 minimum tensile strength (30 ksi); Class 30 modulus range per MakeItFrom and Penticton Foundry data sheets.',
        notes: 'Gray iron does not obey Hooke law cleanly, so its modulus is a secant value taken at 25 percent of tensile strength and is quoted as a range, 90 to 113 GPa for Class 30. Much stronger in compression than in tension.',
        reviewed: true,
    },

    // --- Plastics ----------------------------------------------------------
    {
        id: 'abs',
        cat: 'Plastics',
        name: 'ABS',
        E: 2.3e9,
        E_range: [1.8e9, 2.9e9],
        strength: { kind: 'yield', value: 40e6 },
        rho: 1040,
        source: 'Published thermoplastic property tables (engineeringtoolbox.com thermoplastics table; kunststoff-profi modulus and strength tables), unfilled injection-moulding grade.',
        notes: 'Injection moulded, generic grade. Printed parts are weaker and anisotropic.',
        reviewed: true,
    },
    {
        id: 'pla',
        cat: 'Plastics',
        name: 'PLA',
        E: 3.5e9,
        E_range: [3.0e9, 4.0e9],
        strength: { kind: 'yield', value: 50e6 },
        rho: 1240,
        source: 'Representative bulk unoriented PLA, from published thermoplastic property tables.',
        notes: 'Deliberately not the NatureWorks 4043D datasheet: that sheet reports 3.86 GPa and 110 to 145 MPa for biaxially oriented 25 micron film, which does not describe a solid beam. Printed parts are anisotropic and layer adhesion governs, so treat this as an upper bound on a printed beam.',
        reviewed: true,
    },
    {
        id: 'petg',
        cat: 'Plastics',
        name: 'PETG',
        E: 2.1e9,
        E_range: null,
        strength: { kind: 'yield', value: 50e6 },
        rho: 1270,
        source: 'Published thermoplastic property tables for unfilled PETG copolyester.',
        notes: 'Tougher and less brittle than PLA, and noticeably less stiff.',
        reviewed: true,
    },
    {
        id: 'nylon-66',
        cat: 'Plastics',
        name: 'Nylon 6/6 (dry)',
        E: 3.1e9,
        E_range: [1.4e9, 3.1e9],
        strength: { kind: 'yield', value: 82e6 },
        rho: 1140,
        source: 'DuPont Zytel 101/FG101L NC010 datasheet, ISO 527-2, dry as moulded.',
        notes: 'Dry as moulded is 3.1 GPa and 82 MPa. Conditioned to 50 percent RH the same resin falls to 1.4 GPa and 55 MPa, so a nylon beam in ordinary indoor air deflects more than twice what this row predicts. The range spans both states.',
        reviewed: true,
    },
    {
        id: 'polycarbonate',
        cat: 'Plastics',
        name: 'Polycarbonate',
        E: 2.3e9,
        E_range: null,
        strength: { kind: 'yield', value: 62e6 },
        rho: 1200,
        source: 'Published thermoplastic property tables for unfilled bisphenol-A polycarbonate.',
        notes: 'Ductile and impact tolerant, unlike acrylic.',
        reviewed: true,
    },
    {
        id: 'acrylic-pmma',
        cat: 'Plastics',
        name: 'Acrylic (PMMA)',
        E: 3.2e9,
        E_range: null,
        // Brittle: acrylic fractures without a yield plateau.
        strength: { kind: 'rupture', value: 70e6 },
        rho: 1180,
        source: 'Published thermoplastic property tables for cast and extruded PMMA.',
        notes: 'Brittle. Notch sensitive, and crazes under sustained stress.',
        reviewed: true,
    },
    {
        id: 'hdpe',
        cat: 'Plastics',
        name: 'HDPE',
        E: 1.0e9,
        E_range: [0.8e9, 1.6e9],
        strength: { kind: 'yield', value: 26e6 },
        rho: 960,
        source: 'Published thermoplastic property tables for unfilled high-density polyethylene.',
        notes: 'Very low stiffness and pronounced creep. A loaded HDPE beam keeps moving.',
        reviewed: true,
    },
    {
        id: 'acetal-pom',
        cat: 'Plastics',
        name: 'Acetal (POM)',
        E: 2.8e9,
        E_range: null,
        strength: { kind: 'yield', value: 65e6 },
        rho: 1410,
        source: 'Published thermoplastic property tables for unfilled acetal homopolymer and copolymer.',
        notes: 'Stiff and dimensionally stable for a thermoplastic.',
        reviewed: true,
    },

    // --- Wood --------------------------------------------------------------
    // Grade-level rather than species-level, because a span table keys on
    // species-group plus grade, not on species alone. Values are NDS reference
    // design values, which already include their own reductions, so the safety
    // factor should be left at 1.0 for these rows.
    {
        id: 'wood-dfl-ss',
        cat: 'Wood',
        name: 'Douglas Fir-Larch, Select Structural',
        E: 13.1000e9,           // 1,900,000 psi
        E_range: null,
        strength: { kind: 'rupture', value: 10.3421e6 },  // Fb 1500 psi
        rho: 530,
        source: 'NDS Supplement, Design Values for Wood Construction, Table 4A (2018 ed.).',
        notes: 'Fb is a reference bending design value, already reduced. Leave the safety factor at 1.0 and apply NDS adjustment factors separately.',
        reviewed: true,
    },
    {
        id: 'wood-dfl-no2',
        cat: 'Wood',
        name: 'Douglas Fir-Larch, No. 2',
        E: 11.0316e9,           // 1,600,000 psi
        E_range: null,
        strength: { kind: 'rupture', value: 6.20528e6 },  // Fb 900 psi
        rho: 530,
        source: 'NDS Supplement, Design Values for Wood Construction, Table 4A (2018 ed.).',
        notes: 'The common framing grade. Fb is a reference design value; see the Select Structural note.',
        reviewed: true,
    },
    {
        id: 'wood-hf-no2',
        cat: 'Wood',
        name: 'Hem-Fir, No. 2',
        E: 8.96318e9,           // 1,300,000 psi
        E_range: null,
        strength: { kind: 'rupture', value: 5.86054e6 },  // Fb 850 psi
        rho: 450,
        source: 'NDS Supplement, Design Values for Wood Construction, Table 4A (2018 ed.).',
        notes: 'Fb is a reference design value; see the Select Structural note.',
        reviewed: true,
    },
    {
        id: 'wood-spf-no2',
        cat: 'Wood',
        name: 'Spruce-Pine-Fir, No. 1/No. 2',
        E: 9.65266e9,           // 1,400,000 psi
        E_range: null,
        strength: { kind: 'rupture', value: 6.03291e6 },  // Fb 875 psi
        rho: 420,
        source: 'NDS Supplement, Design Values for Wood Construction, Table 4A (2018 ed.).',
        notes: 'Table 4A lists this species group as a combined No. 1/No. 2 grade, so there is no separate No. 2 row to look up. Spruce-Pine-Fir (South) is a different group with lower values, Fb 775 psi and E 1,100,000 psi. Fb is a reference design value; see the Select Structural note.',
        reviewed: true,
    },
    {
        id: 'wood-glulam-24f',
        cat: 'Wood',
        name: 'Glulam, 24F-V4',
        E: 12.4106e9,           // 1,800,000 psi
        E_range: null,
        strength: { kind: 'rupture', value: 16.5474e6 },  // Fb 2400 psi
        rho: 530,
        source: 'NDS Supplement, Table 5A (2018 ed.); APA Glulam Design Tables, Fbx+ 2400 psi and Ex 1.8e6 psi for 24F-V4.',
        notes: 'Values are for the stressed-tension-lamination direction of a simple-span bending member.',
        reviewed: true,
    },

    // --- Brittle -----------------------------------------------------------
    {
        id: 'glass-soda-lime',
        cat: 'Brittle',
        name: 'Soda-lime glass',
        E: 71.7e9,
        E_range: null,
        strength: { kind: 'rupture', value: 41e6 },
        rho: 2530,
        source: 'National Glass Association FM05-12 (2023), Physical and Mechanical Properties of Typical Soda Lime Float Glass.',
        notes: 'The 41 MPa is the mean modulus of rupture for annealed glass, which is a 50 percent probability of breakage: half of all panes fail at or below it. The same source gives 19 MPa as the design stress for a 0.8 percent probability of breakage, so a utilization anywhere near 100 percent here is already far past a defensible design. Heat-strengthened and fully tempered glass reach 83 and 165 MPa.',
        reviewed: true,
    },
    {
        id: 'alumina-99',
        cat: 'Brittle',
        name: 'Alumina, 99.5%',
        E: 370e9,
        E_range: null,
        strength: { kind: 'rupture', value: 300e6 },
        rho: 3900,
        source: 'CoorsTek AD-995 datasheet (nominal 99.5 percent alumina), 4-point flexural strength at 20 C.',
        notes: 'Flexural strength by 4-point bend, the conservative and more commonly tabulated of the two tests; 3-point values for the same material run near 380 MPa. Stiffer than steel and entirely brittle.',
        reviewed: true,
    },

    // --- Gated -------------------------------------------------------------
    {
        id: 'concrete-plain',
        cat: 'Gated',
        name: 'Concrete (plain)',
        E: 25e9,
        E_range: null,
        strength: { kind: 'none', value: null },
        rho: 2400,
        gated: true,
        gateReason: 'Plain concrete has negligible tensile capacity, so a concrete beam is a reinforced-section problem: the steel carries the tension and the section is analysed cracked, with a transformed or strain-compatibility method. That is a different calculation from the homogeneous elastic one this tool performs, and running it here would return a confident number that means nothing. Use a reinforced-concrete design tool.',
        source: 'ACI 318, Building Code Requirements for Structural Concrete.',
        notes: 'Listed so the gate is visible rather than the material simply being absent. The 25 GPa is the ACI 318 secant modulus 57000*sqrt(f_c) at f_c = 4000 psi, which gives 3605 ksi or 24.9 GPa; it is shown for reference only, since the stress check is skipped.',
        reviewed: true,
    },
];

export const MATERIALS_BY_ID = Object.fromEntries(MATERIALS.map((m) => [m.id, m]));

/** Materials grouped for an optgroup-style selector, in category order. */
export function materialsByCategory() {
    return MATERIAL_CATEGORIES
        .map((cat) => ({ cat, items: MATERIALS.filter((m) => m.cat === cat) }))
        .filter((g) => g.items.length > 0);
}

/** How many rows still await manual sign-off against their cited source. */
export function unreviewedCount() {
    return MATERIALS.filter((m) => !m.reviewed).length;
}
