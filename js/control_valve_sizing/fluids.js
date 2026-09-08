// Fluid properties.
//
// Bounded on purpose. The moment a sizing tool promises properties for
// arbitrary fluids it has signed up for a thermodynamic property package, which
// is the reasoning that kept VLE out of scope in the first place. So: water
// saturation is vendored and verified, gas constants come from a cited table,
// and everything else is a user-entered vapour pressure.
//
// Water saturation is vendored here instead of imported, for a structural
// reason. js/steam_tables/ has the verified data, but
// saturationByT is a `this`-bound method over tables that tables.js fetches at
// runtime from data/steam_tables/*.csv. Importing it would make this engine
// asynchronous and would force the strict CSP of control-valve-sizing.html open
// to connect-src, which is exactly why steam-tables.html runs default-src 'self'
// while this page runs default-src 'none'.
//
// The duplication is therefore deliberate, and verified instead of silent: a
// test reads data/steam_tables/saturated_by_T.csv and asserts every
// knot below still agrees with it. Note for whoever maintains that test that the
// CSV carries a UTF-8 BOM, six metadata rows ahead of its header, temperature in
// C and pressure in MPa, while this table is in K and kPa. An agreement test
// that skips the wrong number of header rows, or compares MPa against kPa,
// passes while comparing nothing.
//
// Source of the vendored rows:
//   data/steam_tables/saturated_by_T.csv
//   Copyright 2023 University of Colorado Boulder, author Neil Hendren,
//   released under an MIT-form grant whose condition is that the notice travels
//   with copies. Vendoring rows here is a copy, so the notice travels.

/**
 * Saturation pressure of water. Knots every 5 C from the triple point to 200 C.
 *
 * Why log space, and why the choice was measured before it was made.
 * Clausius-Clapeyron makes ln(P)
 * nearly linear in temperature, so interpolating the logarithm is far more
 * accurate than interpolating the pressure. Checked against every 1 C row of the
 * source CSV over 0 to 200 C, the worst relative error is:
 *
 *     step    linear in P    linear in ln P
 *      2 C       0.23%          0.033%
 *      5 C       1.38%          0.17%
 *     10 C       5.46%          0.70%
 *
 * A factor of eight at every step size. 5 C knots in log space give 0.17% worst
 * case, which lands at 3 C where the absolute error is 0.0013 kPa, and which is
 * far inside the uncertainty of anything this value will meet downstream: a
 * typical FL is good to about 0.05 and it enters the choke criterion squared.
 */
export const WATER_PSAT_KPA = Object.freeze([
    // T_K, Psat_kPa. 41 knots, 273.16 to 473.15 K.
    [273.16, 0.6117],
    [278.15, 0.8726],
    [283.15, 1.2282],
    [288.15, 1.7058],
    [293.15, 2.3393],
    [298.15, 3.1699],
    [303.15, 4.247],
    [308.15, 5.629],
    [313.15, 7.3849],
    [318.15, 9.595],
    [323.15, 12.352],
    [328.15, 15.762],
    [333.15, 19.946],
    [338.15, 25.042],
    [343.15, 31.201],
    [348.15, 38.595],
    [353.15, 47.414],
    [358.15, 57.867],
    [363.15, 70.182],
    [368.15, 84.608],
    [373.15, 101.42],
    [378.15, 120.9],
    [383.15, 143.38],
    [388.15, 169.18],
    [393.15, 198.67],
    [398.15, 232.24],
    [403.15, 270.28],
    [408.15, 313.23],
    [413.15, 361.54],
    [418.15, 415.68],
    [423.15, 476.16],
    [428.15, 543.5],
    [433.15, 618.23],
    [438.15, 700.93],
    [443.15, 792.19],
    [448.15, 892.6],
    [453.15, 1002.8],
    [458.15, 1123.5],
    [463.15, 1255.2],
    [468.15, 1398.8],
    [473.15, 1554.9],
]);

export const WATER_RANGE_K = Object.freeze({
    min: WATER_PSAT_KPA[0][0],
    max: WATER_PSAT_KPA[WATER_PSAT_KPA.length - 1][0],
});

/**
 * Water saturation pressure in kPa absolute, or null outside the tabulated
 * range.
 *
 * Null, never an extrapolation. Extrapolating a saturation curve is a
 * silent error: it stays smooth and entirely plausible while diverging quickly,
 * and the caller has no way to notice. A null makes the caller report that the
 * check did not run, which is the posture the whole tool is built on.
 */
export function waterSaturationPressure(T_K) {
    if (!Number.isFinite(T_K)) return null;
    if (T_K < WATER_RANGE_K.min || T_K > WATER_RANGE_K.max) return null;
    const t = WATER_PSAT_KPA;
    let lo = 0;
    let hi = t.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (t[mid][0] <= T_K) lo = mid; else hi = mid;
    }
    if (T_K === t[lo][0]) return t[lo][1];
    const f = (T_K - t[lo][0]) / (t[hi][0] - t[lo][0]);
    return Math.exp(Math.log(t[lo][1]) + f * (Math.log(t[hi][1]) - Math.log(t[lo][1])));
}

/** Thermodynamic critical point of water, for the FF term. */
export const WATER_CRITICAL = Object.freeze({ P_kPa: 22064, T_K: 647.096 });

// Specific heat ratios transcribed from the Fisher Control Valve Handbook 5th
// edition, section 13.4 "Specific Heat Ratio (k)", printed page 237.
//
// Methane is worth flagging. That table prints 1.26, while the figure most often
// quoted from memory or a general reference is about 1.32 near ambient. The row
// below carries what the CITED source prints, because reviewed here means
// "matches its source" and not "is the best value available anywhere". Anyone
// doing real work on methane should enter their own figure at their own
// conditions, which every field in this tool allows.
const HANDBOOK = 'Fisher Control Valve Handbook 5th ed., section 13.4, p237';

export const GASES = Object.freeze([
    { id: 'air', name: 'Air', formula: null, MW: 28.97, gamma: 1.40, source: HANDBOOK, reviewed: true },
    { id: 'nitrogen', name: 'Nitrogen', formula: { N: 2 }, MW: 28.014, gamma: 1.40, source: HANDBOOK, reviewed: true },
    { id: 'oxygen', name: 'Oxygen', formula: { O: 2 }, MW: 31.998, gamma: 1.40, source: HANDBOOK, reviewed: true },
    { id: 'carbon-dioxide', name: 'Carbon dioxide', formula: { C: 1, O: 2 }, MW: 44.009, gamma: 1.29, source: HANDBOOK, reviewed: true },
    { id: 'carbon-monoxide', name: 'Carbon monoxide', formula: { C: 1, O: 1 }, MW: 28.010, gamma: 1.40, source: HANDBOOK, reviewed: true },
    { id: 'hydrogen', name: 'Hydrogen', formula: { H: 2 }, MW: 2.016, gamma: 1.40, source: HANDBOOK, reviewed: true },
    { id: 'helium', name: 'Helium', formula: { He: 1 }, MW: 4.003, gamma: 1.66, source: HANDBOOK, reviewed: true },
    { id: 'argon', name: 'Argon', formula: { Ar: 1 }, MW: 39.948, gamma: 1.67, source: HANDBOOK, reviewed: true },
    { id: 'methane', name: 'Methane', formula: { C: 1, H: 4 }, MW: 16.043, gamma: 1.26, source: HANDBOOK, reviewed: true },
    { id: 'steam', name: 'Steam', formula: { H: 2, O: 1 }, MW: 18.015, gamma: 1.33, source: HANDBOOK, reviewed: true },
]);

export const GASES_BY_ID = Object.freeze(Object.fromEntries(GASES.map((g) => [g.id, g])));

/**
 * Standard atomic weights, so molecular weight can be CHECKED against the
 * formula instead of trusted.
 *
 * This is the one quantity in the entire tool that admits a first-principles
 * cross-check. The sizing equations are empirical correlations with nothing
 * underneath them to recompute, and the valve coefficients are flow-test
 * measurements that only a flow loop could confirm. A molecular weight is just a
 * sum, so the spec sums it, and a transcription slip in the MW column cannot
 * survive. It is a small thing to be able to prove, which is why it is
 * worth proving.
 *
 * Air has formula null because it is a mixture and not a compound, so 28.97 is an
 * effective value and there is no sum to check it against.
 */
export const ATOMIC_WEIGHTS = Object.freeze({
    H: 1.008, He: 4.0026, C: 12.011, N: 14.007, O: 15.999, Ar: 39.948,
});

export function molecularWeightFromFormula(formula) {
    if (!formula) return null;
    let sum = 0;
    for (const [element, count] of Object.entries(formula)) {
        const w = ATOMIC_WEIGHTS[element];
        if (w === undefined) return null;
        sum += w * count;
    }
    return sum;
}

/** What the tool tells the user about every liquid that is not water. */
export const LIQUID_NOTE = 'Only water carries a built-in vapour pressure curve. For anything else, enter Pv at the inlet temperature. Leave it blank and the choking, cavitation and flashing checks are reported as not run rather than assumed to pass. Culture media is close enough to water for screening purposes.';
