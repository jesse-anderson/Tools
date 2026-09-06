// Pure math for the beam deflection tool.
//
// Nothing here touches the DOM. Every function takes and returns strict SI:
// newtons, metres, pascals, metres^4. All unit conversion happens in the
// controller at the DOM boundary. Mixed units are the classic way a beam
// calculator returns a confident answer that is wrong by three orders of
// magnitude, so the rule is absolute: no other unit enters this file.
//
// Conventions, binding on everything below:
//   x     is measured from the left end of the beam as drawn. Where a built-in
//         end exists it is drawn on the left, so x also runs from the fixed end.
//   a     is the load position, measured the same way.
//   delta is downward-positive and is surfaced as a positive magnitude.
//   M     is sagging-positive, so a hogging end moment is negative. The
//         governing relation used throughout is EI * delta'' = -M(x).
//
// Euler-Bernoulli only. Shear deformation is neglected, which under-predicts
// deflection for deep short beams; see the slenderness warning in solve().

export const G = 9.80665;

export const SUPPORTS = ['cantilever', 'simple', 'fixed-fixed', 'propped'];

// What each support is called, left to right, in the results. One table rather
// than a string literal at each site: the tabulated solvers and the partial-load
// solver both report reactions, and they used to name the propped cantilever's
// two ends differently depending on which load type happened to be selected.
export const REACTION_LABELS = {
    'cantilever': ['Fixed end'],
    'simple': ['Left pin', 'Right roller'],
    'fixed-fixed': ['Left fixed end', 'Right fixed end'],
    'propped': ['Fixed end', 'Prop (pin)'],
};
export const LOAD_TYPES = ['point-standard', 'point-at', 'udl', 'udl-partial'];

// Where the standard point load sits, as a fraction of span, per support case.
// On a cantilever the canonical case is a load at the free end, not at midspan.
export const STANDARD_POINT_RATIO = {
    'cantilever': 1,
    'simple': 0.5,
    'fixed-fixed': 0.5,
    'propped': 0.5,
};

// Propped cantilever under UDL. The widely reproduced rounding for this case is
// wL^4 / (185 EI); it under-predicts deflection by 0.198%, in the
// non-conservative direction, and must not appear here. Integrating
// EI * delta'' = -M(x) with R_fixed = 5wL/8 and M_fixed = wL^2/8 gives
//   EI * delta = w[(L^2/16)x^2 - (5L/48)x^3 + x^4/24]
// whose stationary point is the root of 8x^2 - 15Lx + 6L^2 = 0. Both constants
// below follow from that root and are computed rather than transcribed.
export const PROPPED_UDL_X_RATIO = (15 - Math.sqrt(33)) / 16;
export const PROPPED_UDL_COEFF = (() => {
    const r = PROPPED_UDL_X_RATIO;
    return (r * r) / 16 - (5 * r * r * r) / 48 + (r * r * r * r) / 24;
})();

// Propped cantilever, point load at midspan. The maximum sits in the segment
// between the load and the prop, at L(1 - 1/sqrt(5)) from the fixed end. Tables
// quoting 0.4472L are measuring from the pinned end instead.
export const PROPPED_CENTER_X_RATIO = 1 - 1 / Math.sqrt(5);
export const PROPPED_CENTER_COEFF = 1 / (48 * Math.sqrt(5));

// Deflection limits. The IBC-derived ratios only mean something for building
// members, so each carries what it is actually for.
export const DEFLECTION_LIMITS = [
    { id: 'L360', ratio: 360, label: 'L/360', use: 'Floor, live load, plastered ceiling' },
    { id: 'L240', ratio: 240, label: 'L/240', use: 'Floor, total load' },
    { id: 'L180', ratio: 180, label: 'L/180', use: 'Roof, no ceiling below' },
    { id: 'custom', ratio: null, label: 'Custom', use: 'Machine parts, brackets, anything that is not a building' },
];

const err = (message) => ({ ok: false, error: message });

function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
}

// Macaulay bracket: zero below a, (x - a) at or above it.
function mac(x, a) {
    return x > a ? x - a : 0;
}

// Validates the inputs every case shares. Returns null when they are usable.
function checkCommon({ L, E, I }) {
    if (!isFiniteNumber(L) || L <= 0) return err('Span L must be a positive number.');
    if (!isFiniteNumber(E) || E <= 0) return err('Elastic modulus E must be a positive number.');
    if (!isFiniteNumber(I) || I <= 0) return err('Second moment of area I must be positive. A non-positive I means the section geometry is invalid.');
    return null;
}

// ---------------------------------------------------------------------------
// Tabulated closed forms.
//
// These are the standard cases. The general off-center solvers below never call
// them, so the spec can drive both paths and check that the general form
// collapses onto the tabulated one. Sharing a helper would defeat the point.
// ---------------------------------------------------------------------------

export const closedForm = {
    cantileverTipPoint: (P, L, E, I) => (P * L ** 3) / (3 * E * I),
    cantileverUDL: (w, L, E, I) => (w * L ** 4) / (8 * E * I),
    simpleCenterPoint: (P, L, E, I) => (P * L ** 3) / (48 * E * I),
    simpleUDL: (w, L, E, I) => (5 * w * L ** 4) / (384 * E * I),
    fixedCenterPoint: (P, L, E, I) => (P * L ** 3) / (192 * E * I),
    fixedUDL: (w, L, E, I) => (w * L ** 4) / (384 * E * I),
    proppedCenterPoint: (P, L, E, I) => (PROPPED_CENTER_COEFF * P * L ** 3) / (E * I),
    proppedUDL: (w, L, E, I) => (PROPPED_UDL_COEFF * w * L ** 4) / (E * I),
};

// ---------------------------------------------------------------------------
// Off-center normalization.
//
// The simply supported and fixed-fixed off-center forms are only valid with the
// load in the right half of the span (a >= b). Applying them below midspan
// under-predicts deflection by up to 8% and puts the reported location on the
// wrong side of the beam, with no visible symptom. Normalize, solve, then
// mirror the location back.
// ---------------------------------------------------------------------------

export function normalizeOffCenter(a, L) {
    if (a < L / 2) return { a: L - a, b: a, mirrored: true };
    return { a, b: L - a, mirrored: false };
}

// ---------------------------------------------------------------------------
// Per-case solvers. Each returns deflection and moment as functions of x, the
// exact maximum and its location, and the support reactions.
// ---------------------------------------------------------------------------

function solveCantilever({ loadType, P, w, a, L, E, I }) {
    const EI = E * I;
    if (loadType === 'udl') {
        const deflectionAt = (x) => (w * x * x * (x * x - 4 * L * x + 6 * L * L)) / (24 * EI);
        return {
            deflectionAt,
            momentAt: (x) => -(w * (L - x) ** 2) / 2,
            deltaMax: closedForm.cantileverUDL(w, L, E, I),
            xMax: L,
            xMaxLabel: 'free end',
            momentCandidates: [0],
            reactions: [
                { at: 0, label: REACTION_LABELS.cantilever[0], force: w * L, moment: -(w * L * L) / 2 },
            ],
        };
    }
    // Point load at a. Beyond the load the beam is straight, so the free end is
    // always the maximum.
    const deflectionAt = (x) => (x <= a
        ? (P * x * x * (3 * a - x)) / (6 * EI)
        : (P * a * a * (3 * x - a)) / (6 * EI));
    return {
        deflectionAt,
        momentAt: (x) => (x <= a ? -P * (a - x) : 0),
        deltaMax: (P * a * a * (3 * L - a)) / (6 * EI),
        xMax: L,
        xMaxLabel: 'free end',
        deltaAtLoad: (P * a ** 3) / (3 * EI),
        momentCandidates: [0],
        reactions: [
            { at: 0, label: REACTION_LABELS.cantilever[0], force: P, moment: -P * a },
        ],
    };
}

function solveSimple({ loadType, P, w, a, L, E, I }) {
    const EI = E * I;
    if (loadType === 'udl') {
        const deflectionAt = (x) => (w * x * (L ** 3 - 2 * L * x * x + x ** 3)) / (24 * EI);
        return {
            deflectionAt,
            momentAt: (x) => (w * L * x) / 2 - (w * x * x) / 2,
            deltaMax: closedForm.simpleUDL(w, L, E, I),
            xMax: L / 2,
            xMaxLabel: 'midspan',
            momentCandidates: [L / 2],
            reactions: [
                { at: 0, label: REACTION_LABELS.simple[0], force: (w * L) / 2, moment: 0 },
                { at: L, label: REACTION_LABELS.simple[1], force: (w * L) / 2, moment: 0 },
            ],
        };
    }
    const { a: an, b: bn, mirrored } = normalizeOffCenter(a, L);
    const RA = (P * bn) / L;
    const C1 = (P * bn * (L * L - bn * bn)) / (6 * L);
    // Curve in normalized coordinates; reflected on the way out when mirrored.
    const curveN = (x) => (-(RA * x ** 3) / 6 + (P * mac(x, an) ** 3) / 6 + C1 * x) / EI;
    const deflectionAt = (x) => curveN(mirrored ? L - x : x);
    const xMaxN = Math.sqrt((L * L - bn * bn) / 3);
    return {
        deflectionAt,
        momentAt: (x) => {
            const xn = mirrored ? L - x : x;
            return RA * xn - P * mac(xn, an);
        },
        deltaMax: (P * bn * (L * L - bn * bn) ** 1.5) / (9 * Math.sqrt(3) * L * EI),
        xMax: mirrored ? L - xMaxN : xMaxN,
        xMaxLabel: 'maximum',
        deltaAtLoad: curveN(an),
        momentCandidates: [a],
        reactions: [
            { at: 0, label: REACTION_LABELS.simple[0], force: (P * (L - a)) / L, moment: 0 },
            { at: L, label: REACTION_LABELS.simple[1], force: (P * a) / L, moment: 0 },
        ],
    };
}

function solveFixedFixed({ loadType, P, w, a, L, E, I }) {
    const EI = E * I;
    if (loadType === 'udl') {
        const MA = (w * L * L) / 12;
        const R = (w * L) / 2;
        const deflectionAt = (x) => ((MA * x * x) / 2 - (R * x ** 3) / 6 + (w * x ** 4) / 24) / EI;
        return {
            deflectionAt,
            momentAt: (x) => R * x - MA - (w * x * x) / 2,
            deltaMax: closedForm.fixedUDL(w, L, E, I),
            xMax: L / 2,
            xMaxLabel: 'midspan',
            momentCandidates: [0, L / 2, L],
            // Both ends hog under a downward load, so both reaction moments
            // are negative in the sagging-positive convention. Reporting the
            // right end as +MA renders it as "sagging", which it is not.
            reactions: [
                { at: 0, label: REACTION_LABELS['fixed-fixed'][0], force: R, moment: -MA },
                { at: L, label: REACTION_LABELS['fixed-fixed'][1], force: R, moment: -MA },
            ],
        };
    }
    const { a: an, b: bn, mirrored } = normalizeOffCenter(a, L);
    const MA = (P * an * bn * bn) / (L * L);
    const MB = (P * an * an * bn) / (L * L);
    const RA = (P * bn * bn * (L + 2 * an)) / L ** 3;
    const curveN = (x) => ((MA * x * x) / 2 - (RA * x ** 3) / 6 + (P * mac(x, an) ** 3) / 6) / EI;
    const deflectionAt = (x) => curveN(mirrored ? L - x : x);
    const xMaxN = (2 * an * L) / (3 * an + bn);
    return {
        deflectionAt,
        momentAt: (x) => {
            const xn = mirrored ? L - x : x;
            return RA * xn - MA - P * mac(xn, an);
        },
        deltaMax: (2 * P * an ** 3 * bn * bn) / (3 * EI * (3 * an + bn) ** 2),
        xMax: mirrored ? L - xMaxN : xMaxN,
        xMaxLabel: 'maximum',
        deltaAtLoad: (P * an ** 3 * bn ** 3) / (3 * EI * L ** 3),
        momentCandidates: [0, a, L],
        // Reactions are reported in the beam's own left-to-right order, so the
        // normalized pair swaps back when the load was mirrored.
        reactions: mirrored
            ? [
                { at: 0, label: REACTION_LABELS['fixed-fixed'][0], force: P - RA, moment: -MB },
                { at: L, label: REACTION_LABELS['fixed-fixed'][1], force: RA, moment: -MA },
            ]
            : [
                { at: 0, label: REACTION_LABELS['fixed-fixed'][0], force: RA, moment: -MA },
                { at: L, label: REACTION_LABELS['fixed-fixed'][1], force: P - RA, moment: -MB },
            ],
    };
}

function solvePropped({ loadType, P, w, a, L, E, I }) {
    const EI = E * I;
    if (loadType === 'udl') {
        const RA = (5 * w * L) / 8;
        const MA = (w * L * L) / 8;
        const deflectionAt = (x) => (w * ((L * L * x * x) / 16 - (5 * L * x ** 3) / 48 + x ** 4 / 24)) / EI;
        return {
            deflectionAt,
            momentAt: (x) => RA * x - MA - (w * x * x) / 2,
            deltaMax: closedForm.proppedUDL(w, L, E, I),
            xMax: PROPPED_UDL_X_RATIO * L,
            xMaxLabel: 'maximum',
            // Zero shear, and so the peak sagging moment, sits at 5L/8.
            momentCandidates: [0, (5 * L) / 8],
            reactions: [
                { at: 0, label: REACTION_LABELS.propped[0], force: RA, moment: -MA },
                { at: L, label: REACTION_LABELS.propped[1], force: (3 * w * L) / 8, moment: 0 },
            ],
        };
    }
    // Point load at a. No normalization: the case is not symmetric, so the
    // curve below is valid across the whole span as written.
    //
    // Rp follows from compatibility (tip deflection of the released cantilever
    // set to zero). The curve is the released cantilever under P minus the same
    // cantilever under Rp at its tip.
    const Rp = (P * a * a * (3 * L - a)) / (2 * L ** 3);
    const RA = P - Rp;
    // Moments about the fixed end: MA + Rp*L - P*a = 0. Taken from equilibrium
    // rather than transcribed, since published two-branch tables for this case
    // are the most error-prone rows in any beam table. The equivalent closed
    // form, useful as a check, is MA = P*b*(L^2 - b^2)/(2L^2).
    const MA = P * a - Rp * L;
    const deflectionAt = (x) => (x <= a
        ? (P * x * x * (3 * a - x) - Rp * x * x * (3 * L - x)) / (6 * EI)
        : (P * a * a * (3 * x - a) - Rp * x * x * (3 * L - x)) / (6 * EI));
    // delta'(x) up to a positive factor. The left branch drops a factor of x,
    // whose root at the built-in end is the trivial one.
    const slopeSign = (x) => (x <= a
        ? P * (2 * a - x) - Rp * (2 * L - x)
        : P * a * a - Rp * x * (2 * L - x));
    const xMax = bisect(slopeSign, 0, L);
    return {
        deflectionAt,
        momentAt: (x) => RA * x - MA - P * mac(x, a),
        deltaMax: deflectionAt(xMax),
        xMax,
        xMaxLabel: 'maximum',
        deltaAtLoad: deflectionAt(a),
        momentCandidates: [0, a],
        reactions: [
            { at: 0, label: REACTION_LABELS.propped[0], force: RA, moment: -MA },
            { at: L, label: REACTION_LABELS.propped[1], force: Rp, moment: 0 },
        ],
    };
}

// Largest magnitude of f on [lo, hi]: a dense scan to bracket the peak, then
// ternary refinement inside the bracketing interval. Root-finding on the slope
// is not usable for the partial-load cases, because a fixed-fixed beam has zero
// slope at both ends and a bracketed search settles on one of them, where the
// deflection is zero.
function argMaxAbs(f, lo, hi, coarse = 400) {
    let bestX = lo;
    let bestV = Math.abs(f(lo));
    for (let i = 1; i <= coarse; i += 1) {
        const x = lo + ((hi - lo) * i) / coarse;
        const v = Math.abs(f(x));
        if (v > bestV) {
            bestV = v;
            bestX = x;
        }
    }
    const h = (hi - lo) / coarse;
    let a = Math.max(lo, bestX - h);
    let b = Math.min(hi, bestX + h);
    for (let i = 0; i < 100; i += 1) {
        const m1 = a + (b - a) / 3;
        const m2 = b - (b - a) / 3;
        if (Math.abs(f(m1)) < Math.abs(f(m2))) a = m1;
        else b = m2;
    }
    return (a + b) / 2;
}

// Bracketed bisection for the single interior sign change of a slope function.
// Used only by the propped cantilever off-center case, where the location of the
// maximum has no reliable closed form.
function bisect(f, lo, hi, iterations = 200) {
    let a = lo + (hi - lo) * 1e-9;
    let b = hi;
    let fa = f(a);
    const fb = f(b);
    if (fa === 0) return a;
    if (fb === 0) return b;
    if (fa * fb > 0) {
        // No interior stationary point, so the larger endpoint value wins.
        return Math.abs(fa) > Math.abs(fb) ? lo : hi;
    }
    for (let i = 0; i < iterations; i += 1) {
        const m = (a + b) / 2;
        const fm = f(m);
        if (fm === 0) return m;
        if (fa * fm < 0) {
            b = m;
        } else {
            a = m;
            fa = fm;
        }
    }
    return (a + b) / 2;
}

// ---------------------------------------------------------------------------
// Partial distributed load: w over [a, b] with b = a + c, on a span L.
//
// All four support cases come out of one Macaulay skeleton, so there is no set
// of four separately transcribed formulas to get wrong. Writing the internal
// sagging moment as
//
//   M(x) = M0 + R0*x + q(x),   q(x) = -(w/2)<x-a>^2 + (w/2)<x-b>^2
//
// and integrating EI*delta'' = -M(x) twice gives
//
//   EI*delta' = -M0*x - R0*x^2/2 - Q1(x) + C1
//   EI*delta  = -M0*x^2/2 - R0*x^3/6 - Q2(x) + C1*x + C2
//
// with Q1 and Q2 the successive integrals of q. Only the boundary conditions
// differ between the cases, and each one fixes M0, R0, C1 and C2 from them.
// Setting a = 0 and c = L reproduces all four tabulated full-span forms, which
// the spec asserts rather than taking the derivation on trust.
// ---------------------------------------------------------------------------

function partialKernel(w, a, b) {
    return {
        q: (x) => -(w / 2) * mac(x, a) ** 2 + (w / 2) * mac(x, b) ** 2,
        Q1: (x) => -(w / 6) * mac(x, a) ** 3 + (w / 6) * mac(x, b) ** 3,
        Q2: (x) => -(w / 24) * mac(x, a) ** 4 + (w / 24) * mac(x, b) ** 4,
    };
}

// M0 is the reaction moment at the left end in the sagging-positive convention,
// so a built-in end comes out negative. R0 is the upward reaction there.
function partialConstants(support, { L, W, xbar, k }) {
    const Q1L = k.Q1(L);
    const Q2L = k.Q2(L);
    const qL = k.q(L);

    if (support === 'cantilever') {
        // Statics alone fixes both reactions, and the built-in end kills both
        // constants of integration.
        return { M0: -W * xbar, R0: W, C1: 0, C2: 0 };
    }
    if (support === 'simple') {
        // No end moments, so R0 follows from moments about the right support.
        const R0 = (W * (L - xbar)) / L;
        return { M0: 0, R0, C1: ((R0 * L ** 3) / 6 + Q2L) / L, C2: 0 };
    }
    if (support === 'fixed-fixed') {
        // delta(0) and delta'(0) kill the constants; delta(L) = delta'(L) = 0
        // then leaves a 2x2 in M0 and R0.
        const R0 = ((Q2L - (Q1L * L) / 2) * 12) / L ** 3;
        return { M0: (-Q1L - (R0 * L * L) / 2) / L, R0, C1: 0, C2: 0 };
    }
    // Propped cantilever: delta(L) = 0 pairs with M(L) = 0 at the pin.
    const R0 = (3 * (Q2L - (qL * L * L) / 2)) / L ** 3;
    return { M0: -R0 * L - qL, R0, C1: 0, C2: 0 };
}

function solvePartialUDL({ support, w, a, c, L, E, I }) {
    const EI = E * I;
    const b = a + c;
    const W = w * c;
    const xbar = (a + b) / 2;
    const k = partialKernel(w, a, b);
    const { M0, R0, C1, C2 } = partialConstants(support, { L, W, xbar, k });

    const momentAt = (x) => M0 + R0 * x + k.q(x);
    const deflectionAt = (x) =>
        (-(M0 * x * x) / 2 - (R0 * x ** 3) / 6 - k.Q2(x) + C1 * x + C2) / EI;

    const xMax = argMaxAbs(deflectionAt, 0, L);

    // Moment extremes sit at the ends, at the edges of the loaded band, and
    // wherever shear crosses zero inside it.
    const momentCandidates = [0, L, a, b];
    const xShear = a + R0 / w;
    if (Number.isFinite(xShear) && xShear > a && xShear < b) momentCandidates.push(xShear);

    const labels = REACTION_LABELS[support];
    const reactions = support === 'cantilever'
        ? [{ at: 0, label: labels[0], force: W, moment: M0 }]
        : [
            { at: 0, label: labels[0], force: R0, moment: M0 },
            {
                at: L,
                label: labels[1],
                force: W - R0,
                moment: support === 'fixed-fixed' ? momentAt(L) : 0,
            },
        ];

    return {
        deflectionAt,
        momentAt,
        deltaMax: Math.abs(deflectionAt(xMax)),
        xMax,
        xMaxLabel: 'maximum',
        momentCandidates,
        reactions,
    };
}

const SOLVERS = {
    'cantilever': solveCantilever,
    'simple': solveSimple,
    'fixed-fixed': solveFixedFixed,
    'propped': solvePropped,
};

// A load sitting directly on a support carries no bending. Returning the
// zero-deflection limit with correct reactions beats returning NaN or refusing.
function degenerateResult(input, atSupport) {
    const { L, support, P } = input;
    const labels = REACTION_LABELS[support];
    const reactions = support === 'cantilever'
        ? [{ at: 0, label: labels[0], force: P, moment: 0 }]
        : [
            { at: 0, label: labels[0], force: atSupport === 0 ? P : 0, moment: 0 },
            { at: L, label: labels[1], force: atSupport === 0 ? 0 : P, moment: 0 },
        ];
    return {
        ok: true,
        degenerate: true,
        support,
        loadType: input.loadType,
        L,
        E: input.E,
        I: input.I,
        P,
        w: null,
        a: atSupport,
        deltaMax: 0,
        xMax: atSupport,
        xMaxLabel: 'no deflection',
        deltaMid: 0,
        deltaAtLoad: 0,
        MmaxAbs: 0,
        MmaxAt: atSupport,
        reactions,
        deflectionAt: () => 0,
        momentAt: () => 0,
        warnings: [{
            id: 'load-on-support',
            severity: 'info',
            text: 'The load sits directly on a support, so the beam carries no bending and the deflection is zero.',
        }],
    };
}

/**
 * Solve a single beam case. Strict SI in, strict SI out.
 *
 * @param {object} input
 * @param {string} input.support   one of SUPPORTS
 * @param {string} input.loadType  one of LOAD_TYPES
 * @param {number} input.L         span, m
 * @param {number} input.E         elastic modulus, Pa
 * @param {number} input.I         second moment of area, m^4
 * @param {number} [input.P]       point load, N (point cases)
 * @param {number} [input.w]       distributed load, N/m (udl case)
 * @param {number} [input.a]       load position from the left end, m (point-at)
 * @param {number} [input.depth]   section depth, m, for the slenderness guard
 * @returns {object} { ok: true, ... } or { ok: false, error }
 */
export function solve(input) {
    const { support, loadType, L, E, I } = input;
    if (!SUPPORTS.includes(support)) return err(`Unknown support case: ${support}`);
    if (!LOAD_TYPES.includes(loadType)) return err(`Unknown load type: ${loadType}`);

    const bad = checkCommon(input);
    if (bad) return bad;

    const isPartial = loadType === 'udl-partial';
    const isPoint = loadType === 'point-standard' || loadType === 'point-at';
    if (isPoint && !isFiniteNumber(input.P)) return err('Point load P must be a number.');
    if (!isPoint && !isFiniteNumber(input.w)) return err('Distributed load w must be a number.');
    // Loads act downward by definition here, and the rest of the tool is built
    // on that: deflection is reported as a downward magnitude, the span-over-
    // deflection check divides by it, and the comparison bars scale against it.
    // An upward load ran all of that in reverse and produced a negative
    // deflection that still passed its limit check, so it is rejected instead.
    if (isPoint && input.P < 0) return err('Point load P must not be negative. Loads act downward, and an upward load is not modelled.');
    if (!isPoint && input.w < 0) return err('Distributed load w must not be negative. Loads act downward, and an upward load is not modelled.');
    if (isPartial) {
        if (!isFiniteNumber(input.a)) return err('Load start position must be a number.');
        if (!isFiniteNumber(input.c)) return err('Loaded length must be a number.');
        if (input.a < 0) return err('The loaded band must start at or after the left end.');
        if (input.c <= 0) return err('The loaded length must be greater than zero.');
        if (input.a + input.c > L * (1 + 1e-12)) {
            return err('The loaded band runs past the right end of the beam. Reduce the start position or the loaded length.');
        }
    }

    let a = null;
    if (isPoint) {
        a = loadType === 'point-standard'
            ? STANDARD_POINT_RATIO[support] * L
            : input.a;
        if (!isFiniteNumber(a)) return err('Load position a must be a number.');
        if (a < 0 || a > L) return err('Load position a must lie between 0 and the span L.');
        if (a === 0) return degenerateResult(input, 0);
        // A load at x = L is the standard tip case on a cantilever but sits on
        // the support in every other case.
        if (a === L && support !== 'cantilever') return degenerateResult(input, L);
    }

    const P = isPoint ? input.P : 0;
    const w = isPoint ? 0 : input.w;
    const solved = isPartial
        ? solvePartialUDL({ support, w, a: input.a, c: Math.min(input.c, L - input.a), L, E, I })
        : SOLVERS[support]({ loadType, P, w, a, L, E, I });

    const deltaMid = solved.deflectionAt(L / 2);
    let MmaxAbs = 0;
    let MmaxAt = 0;
    for (const x of solved.momentCandidates) {
        const M = solved.momentAt(x);
        if (Math.abs(M) > Math.abs(MmaxAbs)) {
            MmaxAbs = M;
            MmaxAt = x;
        }
    }

    const warnings = [];
    if (solved.deltaMax / L > 1 / 50) {
        warnings.push({
            id: 'large-deflection',
            severity: 'warn',
            text: `Deflection is ${((solved.deltaMax / L) * 100).toFixed(1)}% of the span. Small-deflection theory is being stretched well past where it holds.`,
        });
    }
    if (isFiniteNumber(input.depth) && input.depth > 0) {
        const ratio = L / input.depth;
        if (ratio < 10) {
            warnings.push({
                id: 'slenderness',
                severity: 'warn',
                text: `Span-to-depth ratio is ${ratio.toFixed(1)}. Euler-Bernoulli theory neglects shear deformation and under-predicts deflection for beams this deep relative to their span.`,
            });
        }
    } else {
        warnings.push({
            id: 'slenderness-unchecked',
            severity: 'info',
            text: 'Span-to-depth check not run: no section depth was given.',
        });
    }

    return {
        ok: true,
        degenerate: false,
        support,
        loadType,
        L,
        E,
        I,
        P: isPoint ? P : null,
        w: isPoint ? null : w,
        a,
        deltaMax: solved.deltaMax,
        xMax: solved.xMax,
        xMaxLabel: solved.xMaxLabel,
        deltaMid,
        deltaAtLoad: solved.deltaAtLoad ?? null,
        MmaxAbs,
        MmaxAt,
        reactions: solved.reactions,
        deflectionAt: solved.deflectionAt,
        momentAt: solved.momentAt,
        warnings,
    };
}

/** Span-over-deflection ratio and its pass/fail against a limit. */
export function deflectionRatio(deltaMax, L, limitRatio) {
    if (!isFiniteNumber(deltaMax) || !isFiniteNumber(L) || L <= 0) return null;
    const ratio = deltaMax > 0 ? L / deltaMax : Infinity;
    if (!isFiniteNumber(limitRatio) || limitRatio <= 0) return { ratio, limit: null, pass: null };
    return { ratio, limit: limitRatio, pass: ratio >= limitRatio };
}

/**
 * Bending stress check, sigma = |M_max| / S.
 *
 * The strength argument is the { kind, value } pair from the material row, and
 * the kind decides what the check even means. A yield strength is not universal:
 * brittle materials fracture instead, with far wider scatter, and some materials
 * have no single number worth comparing against at all. Assuming yield here
 * would produce a confident utilization percentage for a pane of glass.
 *
 * @param {object} args
 * @param {number} args.MmaxAbs        maximum bending moment, N*m, signed
 * @param {number} args.S              section modulus, m^3
 * @param {object} args.strength       { kind: 'yield'|'rupture'|'none', value }
 * @param {number} [args.safetyFactor] divides the strength; 1 reports raw utilization
 * @returns {object} { ok, sigma, ... } or { ok: false, error }
 */
export function stressCheck({ MmaxAbs, S, strength, safetyFactor = 1 }) {
    if (!isFiniteNumber(S) || S <= 0) return err('Section modulus S must be positive.');
    if (!isFiniteNumber(MmaxAbs)) return err('Maximum moment is not a number.');
    if (!isFiniteNumber(safetyFactor) || safetyFactor <= 0) return err('Safety factor must be positive.');

    const sigma = Math.abs(MmaxAbs) / S;
    const kind = strength && strength.kind ? strength.kind : 'none';

    if (kind === 'none' || !isFiniteNumber(strength.value) || strength.value <= 0) {
        return {
            ok: true,
            sigma,
            kind: 'none',
            skipped: true,
            reason: 'This material has no single strength value that a bending stress can usefully be compared against, so the stress check is not run. The bending stress itself is still reported.',
            allowable: null,
            utilization: null,
            pass: null,
        };
    }

    const allowable = strength.value / safetyFactor;
    const utilization = sigma / allowable;
    const pass = utilization <= 1;
    const result = {
        ok: true,
        sigma,
        kind,
        skipped: false,
        allowable,
        utilization,
        pass,
        // A ductile utilization bar is meaningful for a yield strength and
        // misleading for a rupture strength, so the caller is told which it has.
        showUtilizationBar: kind === 'yield',
        warnings: [],
    };

    if (!pass) {
        result.warnings.push(kind === 'yield'
            ? {
                id: 'yield-exceeded',
                severity: 'error',
                text: 'Bending stress reaches or exceeds the yield strength. Past yield the beam is no longer elastic, so every deflection number above is wrong, and not by a small margin.',
            }
            : {
                id: 'rupture-exceeded',
                severity: 'error',
                text: 'Bending stress reaches or exceeds the rupture strength. This material fractures rather than yielding, so the predicted failure is a break with no ductile warning beforehand.',
            });
    } else if (kind === 'rupture') {
        result.warnings.push({
            id: 'brittle-check',
            severity: 'warn',
            text: 'Checked against a rupture strength, not a yield strength. Brittle rupture scatters widely between samples, so passing here is a weaker statement than passing a ductile yield check.',
        });
    }
    return result;
}

/** Self-weight as a distributed load, w = rho * A * g. */
export function selfWeightUDL(rho, area) {
    if (!isFiniteNumber(rho) || rho <= 0) return 0;
    if (!isFiniteNumber(area) || area <= 0) return 0;
    return rho * area * G;
}

/** Samples the deflected shape for plotting. Returns downward-positive metres. */
export function sampleCurve(result, samples = 80) {
    if (!result || !result.ok) return [];
    const pts = [];
    for (let i = 0; i <= samples; i += 1) {
        const x = (result.L * i) / samples;
        pts.push({ x, y: result.deflectionAt(x) });
    }
    return pts;
}
