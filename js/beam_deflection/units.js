// Unit conversion for the beam deflection tool.
//
// This module is the whole boundary layer. The engine is strict SI and never
// sees anything else; the controller converts inputs on the way in and outputs
// on the way out, in one place, here. Mixed units are the classic way a beam
// calculator returns an answer that is wrong by three orders of magnitude while
// looking entirely plausible, so the conversion lives somewhere it can be tested
// on its own instead of being scattered through the DOM code.
//
// Every factor below converts one display unit into its SI counterpart, so the
// direction is always `si = display * factor` and `display = si / factor`.

// Exact by definition, so no rounding creeps into a round trip.
const FT_TO_M = 0.3048;
const IN_TO_M = 0.0254;
const LBF_TO_N = 4.4482216152605;
const KSI_TO_PA = 6.894757293168361e6;
const LB_FT3_TO_KG_M3 = 16.018463373960142;

export const UNIT_SYSTEMS = ['si', 'us'];

// Per quantity: the factor into SI, and the label to render.
//
// E is given in ksi rather than Msi on purpose. It keeps modulus and strength in
// the same unit, so a utilization ratio can be eyeballed without a mental shift.
export const UNITS = {
    si: {
        id: 'si',
        label: 'SI (metric)',
        span: { factor: 1, label: 'm' },
        deflection: { factor: 1e-3, label: 'mm' },
        sectionDim: { factor: 1e-3, label: 'mm' },
        pointLoad: { factor: 1e3, label: 'kN' },
        distLoad: { factor: 1e3, label: 'kN/m' },
        modulus: { factor: 1e9, label: 'GPa' },
        strength: { factor: 1e6, label: 'MPa' },
        stress: { factor: 1e6, label: 'MPa' },
        moment: { factor: 1e3, label: 'kN·m' },
        reaction: { factor: 1e3, label: 'kN' },
        secondMoment: { factor: 1e-12, label: 'mm⁴' },
        sectionModulus: { factor: 1e-9, label: 'mm³' },
        area: { factor: 1e-6, label: 'mm²' },
        density: { factor: 1, label: 'kg/m³' },
    },
    us: {
        id: 'us',
        label: 'US customary',
        span: { factor: FT_TO_M, label: 'ft' },
        deflection: { factor: IN_TO_M, label: 'in' },
        sectionDim: { factor: IN_TO_M, label: 'in' },
        pointLoad: { factor: LBF_TO_N, label: 'lbf' },
        distLoad: { factor: LBF_TO_N / FT_TO_M, label: 'lbf/ft' },
        modulus: { factor: KSI_TO_PA, label: 'ksi' },
        strength: { factor: KSI_TO_PA, label: 'ksi' },
        stress: { factor: KSI_TO_PA, label: 'ksi' },
        moment: { factor: LBF_TO_N * FT_TO_M, label: 'lbf·ft' },
        reaction: { factor: LBF_TO_N, label: 'lbf' },
        secondMoment: { factor: IN_TO_M ** 4, label: 'in⁴' },
        sectionModulus: { factor: IN_TO_M ** 3, label: 'in³' },
        area: { factor: IN_TO_M ** 2, label: 'in²' },
        density: { factor: LB_FT3_TO_KG_M3, label: 'lb/ft³' },
    },
};

function unitFor(system, quantity) {
    const table = UNITS[system];
    if (!table) throw new Error(`Unknown unit system: ${system}`);
    const unit = table[quantity];
    if (!unit) throw new Error(`Unknown quantity: ${quantity}`);
    return unit;
}

/** Display value to SI. */
export function toSI(value, quantity, system) {
    if (!Number.isFinite(value)) return NaN;
    return value * unitFor(system, quantity).factor;
}

/** SI to display value. */
export function fromSI(value, quantity, system) {
    if (!Number.isFinite(value)) return NaN;
    return value / unitFor(system, quantity).factor;
}

/** Display label for a quantity in a system, e.g. 'mm' or 'in'. */
export function unitLabel(quantity, system) {
    return unitFor(system, quantity).label;
}
