// Worked examples for the beam deflection tool.
//
// Each preset is a complete, self-consistent beam that someone might actually
// build, not a set of round numbers chosen to make the arithmetic tidy. The
// point of each one is in `teaches`: a preset that only demonstrates that the
// tool runs is not worth a click.
//
// Values are quoted in the preset's own unit system, and the controller sets
// that system before writing any field. Quoting everything in SI and converting
// on apply would put a second conversion path next to the one in units.js, and
// two conversion paths are how a beam calculator ends up disagreeing with itself.
//
// `fields` keys are element ids; `section` keys are the field keys declared by
// the matching entry in SECTIONS.

export const PRESETS = [
    {
        id: 'joist-2x10',
        name: 'Floor joist',
        summary: '2x10 Douglas fir at 16 in centres, 12 ft span',
        teaches: 'The deflection limit is what governs a floor, not the stress. This joist runs at about three quarters of its bending capacity while sitting comfortably inside L/360. Span tables are written around deflection for that reason.',
        units: 'us',
        state: {
            support: 'simple',
            loadType: 'udl',
            sectionType: 'rect',
            materialId: 'wood-dfl-no2',
            limitId: 'L360',
            selfWeight: true,
        },
        fields: { span: 12, loadMagnitude: 67, safetyFactor: 1 },
        section: { b: 1.5, h: 9.25 },
    },
    {
        id: 'shelf-bracket',
        name: 'Steel shelf bracket',
        summary: '40 mm square tube, 400 mm cantilever, 1.5 kN at the tip',
        teaches: 'A cantilever carries its whole moment at the wall, so the fixed end is where it fails. The standard L/360 floor limit is meaningless for a bracket, which is what the custom ratio is for.',
        units: 'si',
        state: {
            support: 'cantilever',
            loadType: 'point-standard',
            sectionType: 'tubeRect',
            materialId: 'steel-a36',
            limitId: 'custom',
            selfWeight: false,
        },
        fields: { span: 0.4, loadMagnitude: 1.5, safetyFactor: 1, customLimit: 200 },
        section: { b: 40, h: 40, t: 3 },
    },
    {
        id: 'off-centre-rail',
        name: 'Off-centre load',
        summary: 'Aluminium tube, 1 m span, 500 N a quarter of the way along',
        teaches: 'The maximum deflection is not under the load and not at midspan; it sits between them. This is the case a table lookup gets wrong, because the tabulated formula assumes the load is on the longer side of the span.',
        units: 'si',
        state: {
            support: 'simple',
            loadType: 'point-at',
            sectionType: 'tubeRect',
            materialId: 'alu-6063-t5',
            limitId: 'L240',
            selfWeight: false,
        },
        fields: { span: 1, loadMagnitude: 0.5, loadPos: 0.25, safetyFactor: 1 },
        section: { b: 40, h: 40, t: 3 },
    },
    {
        id: 'partial-load',
        name: 'Load over part of the span',
        summary: '100 x 200 x 6 mm steel tube, 4 m span, 10 kN/m over 1.5 m',
        teaches: 'The load covers 1.5 m starting 0.5 m in, and the maximum deflection sits neither at midspan nor under the middle of the load. Spreading a load over part of a beam is not the same problem as putting all of it at the load centroid, and it is not the same as loading the whole span either.',
        units: 'si',
        state: {
            support: 'simple',
            loadType: 'udl-partial',
            sectionType: 'tubeRect',
            materialId: 'steel-a36',
            limitId: 'L240',
            selfWeight: false,
        },
        fields: { span: 4, loadMagnitude: 10, loadPos: 0.5, loadLength: 1.5, safetyFactor: 1 },
        section: { b: 100, h: 200, t: 6 },
    },
    {
        id: 'printed-bracket',
        name: 'Printed PLA bracket',
        summary: '20 x 6 mm bar, 80 mm arm, 20 N load',
        teaches: 'The stress check passes easily and the part is still useless: it moves millimetres on an 80 mm arm. Stiffness and strength are different problems, and for plastics the creep warning means the number here is a lower bound that grows under sustained load.',
        units: 'si',
        state: {
            support: 'cantilever',
            loadType: 'point-standard',
            sectionType: 'rect',
            materialId: 'pla',
            limitId: 'custom',
            selfWeight: false,
        },
        fields: { span: 0.08, loadMagnitude: 0.02, safetyFactor: 1, customLimit: 100 },
        section: { b: 20, h: 6 },
    },
    {
        id: 'glass-shelf',
        name: 'Glass shelf',
        summary: '250 x 8 mm annealed glass, 800 mm span, 1.6 kPa',
        teaches: 'A brittle material gets no ductile utilization bar, because there is no yield plateau to use one against. Read the utilization carefully: the 41 MPa it is measured against is a mean rupture strength, meaning half of all panes break at or below it.',
        units: 'si',
        state: {
            support: 'simple',
            loadType: 'udl',
            sectionType: 'rect',
            materialId: 'glass-soda-lime',
            limitId: 'L240',
            selfWeight: false,
        },
        fields: { span: 0.8, loadMagnitude: 0.4, safetyFactor: 1 },
        section: { b: 250, h: 8 },
    },
    {
        id: 'fixed-vs-simple',
        name: 'Fixed vs simply supported',
        summary: '50 x 100 mm steel bar, 3 m span, 5 kN/m',
        teaches: 'Both ends are supported in both cases, and the deflections differ by a factor of five. Compare the four cards: whether the ends are pinned or built in matters more than almost anything else you can change about this beam.',
        units: 'si',
        state: {
            support: 'simple',
            loadType: 'udl',
            sectionType: 'rect',
            materialId: 'steel-a36',
            limitId: 'L360',
            selfWeight: false,
        },
        fields: { span: 3, loadMagnitude: 5, safetyFactor: 1 },
        section: { b: 50, h: 100 },
    },
];

export const PRESETS_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
