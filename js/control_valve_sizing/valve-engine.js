// Control valve sizing engine, ISA-75.01.01 / IEC 60534-2-1 procedure.
//
// Pure and synchronous. No DOM, no network, no imports from units.js. The
// window handle lives in the DOM controller, not here, so that
// scripts/check-valve-coefficient-sources.mjs can import the sibling modules
// under Node without a window to touch.
//
// Internal unit set. Nothing else ever enters this file:
//
//   C          flow coefficient as Cv
//   pressure   kPa absolute
//   q          m3/h for liquid, and m3/h at standard conditions for gas
//   w          kg/h
//   density    kg/m3
//   nu         m2/s
//   d, D       mm
//   T          K
//   MW         kg/kmol
//
// Standard conditions for gas volumetric flow are pinned at 101.325 kPa and
// 15 C, because N9 is defined against a reference state and the handbook prints
// a different value for a 0 C basis. See N9 below.
//
// The internal coefficient is Cv. The SOW originally specified Kv. The only
// obtainable source prints its equation constants for Cv, and the giveaway is
// N1 itself: the handbook's m3/h-and-bar row reads 0.865, which is precisely the
// Kv = 0.865 Cv factor showing through. With Kv that row would read 1.0. Working
// in Kv would therefore mean deriving every constant from a printed Cv one, and
// a derived constant cannot be checked against the page it came from. Cv keeps
// every value transcribable. Kv is a display conversion in units.js.
//
// Source: Fisher / Emerson, Control Valve Handbook, 5th edition,
// D101881X012/Sept19, section 5.7 "Equation Constants". Archived with a SHA-256
// in data/control_valve_coefficients/download_manifest.csv.

import { assess, REGIMES } from './regimes.js';
import {
    installedCharacteristic, travelForCoefficient, characteristicAdvisories,
    characteristicSystemError,
} from './characteristics.js';

// Transcribed verbatim from the handbook's section 5.7 table, metric rows, Cv.
// The US customary value from the same row is carried alongside so that the
// consistency check in the spec has something to check against: converting one
// row into the other's units must reproduce it, which is a real test of the
// transcription instead of a restatement of it.
export const N = Object.freeze({
    // q m3/h, P kPa. US row: 1.00 with gpm and psia.
    N1: 0.0865,
    // d mm. US row: 890 with inch. 890 / 25.4^4 = 0.0021383.
    N2: 0.00214,
    // d mm. US row: 1000 with inch. 1000 / 25.4^4 = 0.0024025.
    N5: 0.00241,
    // w kg/h, P kPa, rho kg/m3. US row: 63.3 with lb/h, psia, lbm/ft3.
    N6: 2.73,
    // w kg/h, P kPa, T K. US row: 19.3 with lb/h, psia, deg R.
    N8: 0.948,
    // q m3/h at 15 C, P kPa, T K.
    //
    // N9 is published against three separate reference states, all at a
    // 101.3 kPa pressure base, and they are not unit conversions of each other:
    //
    //     21.2   m3/h, kPa   normal conditions,   TN = 0 C
    //     22.5   m3/h, kPa   standard conditions, TS = 15 C   <- this engine
    //     7320   scfh, psia  standard conditions, TS = 60 F
    //
    // 0 C against 15 C is a 6.1% difference, and that is why the state is pinned
    // and displayed instead of assumed. Converting the 60 F row into these
    // units gives 22.41, not 22.5: 0.19% of that is the genuine 15 C against
    // 15.56 C shift and the rest is three-figure rounding in the printed table.
    // A test asserts they fail to reconcile, since expecting otherwise would
    // assert something untrue about the source.
    N9: 22.5,
    // N4 belongs to the Reynolds number expression. The Masoneilan handbook
    // publishes it as 76000 for m3/h, mm and centistokes (17300 for gpm, inch),
    // so unlike the first pass the value is now in hand and archived.
    //
    // It stays null anyway, because N4 is necessary for the valve Reynolds
    // number and insufficient for FR. The factor itself comes off a curve, or
    // an iteration, given only in clause 8.2 and figure 3 of the standard, and
    // the copy obtained is a scan whose equations did not survive text
    // extraction well enough to transcribe safely. Reconstructing them from
    // memory is exactly the beam tool's 1/185 error with less excuse, so the
    // tool keeps saying turbulence was not verified. See the README for what
    // closing this needs.
    N4: null,
});

// Standard reference state for N9, stated so the UI can display it.
export const STANDARD_CONDITIONS = Object.freeze({ P_kPa: 101.325, T_K: 288.15 });

// Refusal codes are stable identifiers. Messages get reworded; codes do not, so
// tests assert the code and users read the message.
export const CODES = Object.freeze({
    REVERSE_DIFFERENTIAL: 'REVERSE_DIFFERENTIAL',
    NON_POSITIVE_INLET: 'NON_POSITIVE_INLET',
    VAPOUR_ABOVE_INLET: 'VAPOUR_ABOVE_INLET',
    NON_POSITIVE_PROPERTY: 'NON_POSITIVE_PROPERTY',
    FLASHING: 'FLASHING',
    BAD_GEOMETRY: 'BAD_GEOMETRY',
    BAD_INPUT: 'BAD_INPUT',
    NOT_CONVERGED: 'NOT_CONVERGED',
    // No NO_REYNOLDS_FACTOR code. FR being unavailable is a disclosure on a
    // successful result, not a refusal, so it lives in the advisories as
    // NO_REYNOLDS_CHECK. A refusal code nothing can return reads as a branch
    // somebody forgot to write.
    FL_OUT_OF_RANGE: 'FL_OUT_OF_RANGE',
    XT_OUT_OF_RANGE: 'XT_OUT_OF_RANGE',
    GAMMA_OUT_OF_RANGE: 'GAMMA_OUT_OF_RANGE',
});

// Coefficient bounds. An unbounded coefficient is the worst defect this tool
// can carry.
//
// FL and xT do not merely scale the answer. They are the entire choking and
// cavitation apparatus: FL sets the choke differential through FLP^2 and the
// vena contracta pressure through P1 - dP/FL^2, and xT sets the terminal
// pressure drop ratio. Accepting a value outside their definition therefore does
// not produce a visibly wrong number. It produces an ordinary one with the
// safety checks quietly switched off.
//
// Measured before these bounds existed: at P1 1000, P2 700, Pv 640 kPa an
// FL of 0.9 reports "cavitating" and an FL of 1.5 reports "turbulent", with a
// clean page and an identical coefficient. An xT at or above 1/Fgamma puts the
// choke point beyond absolute zero at the outlet, so x >= Fgamma xTP can never
// fire and the gas choke check is dead for every differential.
//
//   FL   (0, 1]   the recovery factor is a fraction of the ideal drop, so 1 is
//                 the no-recovery limit and nothing exceeds it.
//   xT   (0, 1)   x itself is dP/P1 and cannot reach 1, so a terminal ratio at
//                 or above 1 describes a valve that never chokes.
//   k    (1, 2]   Cp/Cv exceeds 1 for every gas and reaches 5/3 for a monatomic
//                 one; the handbook's own table tops out at argon's 1.67.
export const LIMITS = Object.freeze({
    FL: { min: 0, max: 1, maxInclusive: true },
    xT: { min: 0, max: 1, maxInclusive: false },
    gamma: { min: 1, max: 2, maxInclusive: true },
});

// The iteration budget is 200, where the SOW first said 20.
//
// The liquid sizing fixed point is C = K sqrt(1 + a C^2), where K is the
// no-fittings coefficient and a = (sum_K / N2) / d^4. Differentiating at the
// fixed point and substituting the solution gives a contraction factor of
// exactly
//
//     |g'(C*)| = a C*^2 / (1 + a C*^2) = 1 - Fp^2
//
// so convergence is linear at a rate the geometry sets, and the passes needed to
// reach a relative tolerance are ln(tol) / ln(1 - Fp^2). At Fp 0.95 that is 10
// passes; at 0.79, a perfectly ordinary reducer installation, it is 23; at 0.5
// it is 80. A budget of 20 therefore covered only Fp above about 0.86 and
// declared a routine installation non-convergent, which is how this was found.
//
// 200 covers Fp down to roughly 0.33. Below that the valve is drastically
// undersized against its pipe, and non-convergence is a real signal instead of
// a budget artefact. Each pass is a handful of floating point operations, so the
// larger budget costs nothing measurable.
//
// The same expression also shows the iteration converges exactly when a solution
// exists: a K^2 < 1 is both the condition for a positive root and the condition
// for |g'| < 1.
const MAX_ITERATIONS = 200;
const REL_TOLERANCE = 1e-10;

const err = (code, error, regime = null) => ({ ok: false, code, error, regime });
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Liquid critical pressure ratio factor.
 *
 * Bounded on both sides. It reaches 0.96 as Pv approaches zero, and the lower
 * bound matters because Pv/Pc above 1 is not physical but is reachable by a
 * typo, and an unbounded sqrt would return NaN two steps later where nothing
 * names the cause.
 */
export function liquidCriticalPressureRatio(Pv, Pc) {
    const ratio = Pv / Pc;
    if (!(ratio >= 0)) return null;
    return 0.96 - 0.28 * Math.sqrt(Math.min(ratio, 1));
}

/**
 * Fitting loss coefficients for a concentric reducer and expander pair.
 *
 * sum_K drives Fp; Ki is the inlet group alone and drives FLP and xTP, because
 * both describe what the inlet fitting does to pressure recovery inside the
 * valve. Substituting sum_K for Ki is a plausible misreading that returns a
 * wrong but entirely reasonable-looking number, so the two are computed
 * separately here and the spec asserts they differ.
 */
export function fittingCoefficients(d, D1, D2) {
    const r1 = (d * d) / (D1 * D1);
    const r2 = (d * d) / (D2 * D2);
    const K1 = 0.5 * (1 - r1) ** 2;
    const K2 = 1.0 * (1 - r2) ** 2;
    const KB1 = 1 - (d / D1) ** 4;
    const KB2 = 1 - (d / D2) ** 4;
    return { K1, K2, KB1, KB2, sumK: K1 + K2 + KB1 - KB2, Ki: K1 + KB1 };
}

/** Piping geometry factor. Depends on C, which is what makes sizing iterative. */
export function pipingGeometryFactor(C, d, k) {
    return 1 / Math.sqrt(1 + (k.sumK / N.N2) * (C / (d * d)) ** 2);
}

/** Recovery factor corrected for the inlet fitting. */
export function correctedRecoveryFactor(FL, C, d, k) {
    return FL / Math.sqrt(1 + ((FL * FL) / N.N2) * k.Ki * (C / (d * d)) ** 2);
}

/** Terminal pressure drop ratio corrected for the inlet fitting. */
export function correctedTerminalRatio(xT, Fp, C, d, k) {
    return (xT / (Fp * Fp)) / (1 + ((xT * k.Ki) / N.N5) * (C / (d * d)) ** 2);
}

/**
 * Fitting geometry, or the degenerate identity when nothing is attached.
 *
 * Returns Fp = 1, FLP = FL, xTP = xT when d equals both pipe bores, which is
 * the same shape of degenerate case as a zero-bore tube equalling a solid round
 * in the beam tool, and is tested the same way.
 */
function geometry(input, C) {
    const { d, D1, D2, FL, xT } = input;
    const hasFittings = isNum(d) && isNum(D1) && isNum(D2) && (D1 !== d || D2 !== d);
    if (!hasFittings) return { Fp: 1, FLP: FL, xTP: xT, k: null };
    const k = fittingCoefficients(d, D1, D2);
    const Fp = pipingGeometryFactor(C, d, k);
    return {
        Fp,
        FLP: correctedRecoveryFactor(FL, C, d, k),
        xTP: correctedTerminalRatio(xT, Fp, C, d, k),
        k,
    };
}

/**
 * Shared domain guards.
 *
 * These run before anything is computed, on both solve directions. An
 * out-of-domain input that produces a plausible number is the failure this tool
 * exists to prevent, and the beam tool shipped exactly that defect for a while:
 * an upward load returned a negative deflection which then passed its own limit
 * check. So the refusal is the first thing in the pipeline, not a check bolted
 * onto the answer.
 */
function guard(input) {
    const { P1, P2, Pv, Pc, d, D1, D2, FL, xT, gamma } = input;
    // Coefficient bounds come first, ahead of even the pressures. A coefficient
    // outside its definition disables a safety check instead of breaking the
    // arithmetic, so it has to be caught by name where it cannot be mistaken for
    // a convergence problem. See LIMITS above for the measured failure.
    //
    // Each bound is scoped to the service that USES it. Both coefficients sit on
    // the form at once and the style library fills both, so an unscoped check
    // refused a liquid sizing over a terminal pressure drop ratio that liquid
    // service never reads. A false refusal is a smaller fault than a false
    // answer, but this tool is otherwise precise about what it can and cannot
    // say, and it should not make an exception for its own error messages.
    const liquid = input.service === 'liquid';
    for (const [name, value, limit, note] of [
        ['recovery factor FL', liquid ? FL : null, LIMITS.FL, 'FL is the fraction of the ideal pressure drop the valve actually recovers, so it cannot exceed 1. It sets the choke point and the vena contracta pressure, and a value outside its range silently disables both.'],
        ['terminal pressure drop ratio xT', liquid ? null : xT, LIMITS.xT, 'x is dP/P1 and cannot reach 1, so an xT at or above 1 describes a valve that never chokes at any differential.'],
        ['specific heat ratio', liquid ? null : gamma, LIMITS.gamma, 'Cp/Cv exceeds 1 for every gas and reaches 5/3 for a monatomic one.'],
    ]) {
        if (value === null || value === undefined) continue;
        const code = limit === LIMITS.FL ? CODES.FL_OUT_OF_RANGE
            : limit === LIMITS.xT ? CODES.XT_OUT_OF_RANGE : CODES.GAMMA_OUT_OF_RANGE;
        const upper = limit.maxInclusive ? value <= limit.max : value < limit.max;
        if (!isNum(value) || value <= limit.min || !upper) {
            const range = `above ${limit.min} and ${limit.maxInclusive ? 'at most' : 'below'} ${limit.max}`;
            return err(code, `The ${name} must be ${range}. ${note}`);
        }
    }
    if (!isNum(P1) || !isNum(P2)) return err(CODES.BAD_INPUT, 'Inlet and outlet pressure must both be numbers.');
    if (P1 <= 0) return err(CODES.NON_POSITIVE_INLET, 'Inlet pressure must be positive. Pressures here are absolute, and a non-positive value is almost always a gauge pressure entered where absolute was required.');
    if (P2 >= P1) return err(CODES.REVERSE_DIFFERENTIAL, 'Outlet pressure must be below inlet pressure. Zero or reverse differential is a domain error, not a small-flow case: the sizing equations divide by the differential and take its square root.');
    if (P2 <= 0) return err(CODES.NON_POSITIVE_INLET, 'Outlet pressure must be positive. Pressures here are absolute.');
    if (Pv !== null && Pv !== undefined) {
        if (!isNum(Pv) || Pv <= 0) return err(CODES.NON_POSITIVE_PROPERTY, 'Vapour pressure must be a positive absolute pressure, or omitted.');
        if (Pv > P1) return err(CODES.VAPOUR_ABOVE_INLET, 'Vapour pressure exceeds inlet pressure, so the liquid is already boiling at the stated inlet condition and there is no liquid service to size.');
    }
    if (Pc !== null && Pc !== undefined) {
        if (!isNum(Pc) || Pc <= 0) return err(CODES.NON_POSITIVE_PROPERTY, 'Critical pressure must be a positive absolute pressure, or omitted.');
    }
    for (const [name, v] of [['valve size d', d], ['upstream bore D1', D1], ['downstream bore D2', D2]]) {
        if (v === null || v === undefined) continue;
        if (!isNum(v) || v <= 0) return err(CODES.BAD_GEOMETRY, `The ${name} must be a positive number.`);
    }
    if (isNum(d) && isNum(D1) && d > D1) return err(CODES.BAD_GEOMETRY, 'Valve size exceeds the upstream pipe bore, which is not a reducer installation.');
    if (isNum(d) && isNum(D2) && d > D2) return err(CODES.BAD_GEOMETRY, 'Valve size exceeds the downstream pipe bore, which is not an expander installation.');
    return null;
}

/**
 * Liquid choke point, as a differential pressure.
 *
 * The physical statement is that further pressure drop produces no further
 * flow. Everything downstream of this in the pipeline depends on the cap being
 * applied to dP before the flow equation sees it, and not to the answer
 * afterwards, which is what makes the flow curve go exactly flat instead of
 * nearly flat.
 */
function liquidChokePoint(input, Fp, FLP) {
    const { P1, Pv, Pc } = input;
    if (!isNum(Pv) || !isNum(Pc)) return null;
    const FF = liquidCriticalPressureRatio(Pv, Pc);
    if (FF === null) return null;
    return { FF, dPChoked: ((FLP / Fp) ** 2) * (P1 - FF * Pv) };
}

/**
 * Which inputs the liquid choke check is waiting on.
 *
 * FF needs BOTH the vapour pressure and the critical pressure, and only one of
 * them used to be reported. A service with Pv supplied and Pc blank sized 9%
 * smaller than the same service with both, said nothing about it, and labelled
 * the empty choke row "no vapour pressure" when the vapour pressure was the one
 * input present. The missing name is now carried on the result so the advisory
 * and the panel can both say the true thing.
 */
export function missingChokeInputs(input) {
    const missing = [];
    if (!isNum(input.Pv)) missing.push('vapour pressure');
    if (!isNum(input.Pc)) missing.push('critical pressure');
    return missing;
}

/**
 * One pass of the liquid sizing equation at a given assumed C.
 *
 * FR is absent, never 1: the Reynolds factor is unavailable (see N4) and
 * pretending it is unity would silently claim turbulent flow. The caller decides
 * whether that claim is safe and says so in the warnings.
 */
function liquidPass(input, C) {
    const { P1, P2, q, relativeDensity } = input;
    const g = geometry(input, C);
    const choke = liquidChokePoint(input, g.Fp, g.FLP);
    const dPSupplied = P1 - P2;
    const choked = choke !== null && dPSupplied >= choke.dPChoked;
    const dPUsed = choked ? choke.dPChoked : dPSupplied;
    const nextC = q / (N.N1 * g.Fp) * Math.sqrt(relativeDensity / dPUsed);
    return { ...g, choke, dPSupplied, dPUsed, choked, nextC };
}

/**
 * One pass of the compressible sizing equation at a given assumed C.
 *
 * Accepts either mass flow w or standard volumetric flow q. Both are
 * implemented because gas is quoted both ways in practice, and because they
 * describe the same physical stream, so agreeing on it is a free cross-check on
 * the property handling.
 */
function gasPass(input, C) {
    const { P1, P2, w, q, rho1, MW, T1, Z, gamma } = input;
    const g = geometry(input, C);
    const Fgamma = gamma / 1.40;
    const x = (P1 - P2) / P1;
    const xChoked = Fgamma * g.xTP;
    const choked = x >= xChoked;
    const xUsed = choked ? xChoked : x;
    // Y falls linearly to exactly 2/3 at the choke boundary and is held there
    // beyond it. Any other value at the boundary is an arithmetic error and it
    // is visible to the digit, and that is why the spec checks it exactly.
    const Y = 1 - xUsed / (3 * Fgamma * g.xTP);
    let nextC;
    if (isNum(w)) {
        nextC = w / (N.N6 * g.Fp * Y * Math.sqrt(xUsed * P1 * rho1));
    } else {
        nextC = q / (N.N9 * g.Fp * Y * P1) * Math.sqrt((MW * T1 * Z) / xUsed);
    }
    return { ...g, Fgamma, x, xChoked, xUsed, Y, choked, dPSupplied: P1 - P2, dPUsed: xUsed * P1, nextC };
}

/**
 * Fixed-point iteration on C.
 *
 * Fp depends on C, which is the unknown, so sizing with attached fittings is
 * genuinely iterative even in fully turbulent flow. This is the single most
 * commonly dropped part of the procedure, and dropping it shifts the answer a
 * few percent with no visible symptom. The spec asserts the converged answer
 * differs from a single pass so that a refactor which drops it fails loudly.
 */
function iterate(pass, input, seed) {
    let C = seed;
    let last = null;
    for (let i = 1; i <= MAX_ITERATIONS; i++) {
        last = pass(input, C);
        const next = last.nextC;
        if (!Number.isFinite(next) || next <= 0) {
            return { error: err(CODES.NOT_CONVERGED, 'The sizing iteration left the valid range. Check the flow, pressures and fluid properties.') };
        }
        if (Math.abs(next - C) <= REL_TOLERANCE * Math.abs(next)) {
            return { C: next, state: pass(input, next), iterations: i, converged: true };
        }
        C = next;
    }
    return { C, state: last, iterations: MAX_ITERATIONS, converged: false };
}

/**
 * Size a valve: given flow and conditions, find the required C.
 *
 * service is 'liquid' or 'gas'.
 */
export function size(input) {
    const bad = guard(input);
    if (bad) return bad;
    const service = input.service;
    if (service !== 'liquid' && service !== 'gas') {
        return err(CODES.BAD_INPUT, "Service must be 'liquid' or 'gas'.");
    }
    if (service === 'liquid') {
        if (!isNum(input.q) || input.q <= 0) return err(CODES.BAD_INPUT, 'Flow rate must be a positive number.');
        if (!isNum(input.relativeDensity) || input.relativeDensity <= 0) return err(CODES.BAD_INPUT, 'Relative density must be positive.');
        // Required, not defaulted. FL carries the whole choking and cavitation
        // apparatus, so a missing one used to reach the iteration as a zero and
        // surface as a convergence failure that named the flow and the
        // pressures. It is the recovery factor that is missing, and the refusal
        // now says so.
        if (!isNum(input.FL)) return err(CODES.FL_OUT_OF_RANGE, 'The liquid recovery factor FL is required. It sets the choke point and the vena contracta pressure, so without it neither the choking nor the cavitation check can run. Take it from the valve data sheet, or pick a style from the library.');
        if (isNum(input.Pv) && input.P2 < input.Pv) {
            return err(CODES.FLASHING, 'This service flashes: the outlet pressure is below the vapour pressure, so the fluid is two-phase downstream. The single-phase sizing equations do not apply and returning a coefficient for them would be a confident wrong answer.', REGIMES.FLASHING);
        }
    } else {
        if (!isNum(input.gamma)) return err(CODES.GAMMA_OUT_OF_RANGE, 'The specific heat ratio is required for compressible service. It sets Fgamma and therefore the terminal pressure drop ratio at which the flow chokes.');
        if (!isNum(input.xT)) return err(CODES.XT_OUT_OF_RANGE, 'The terminal pressure drop ratio xT is required for compressible service. It is the entire choking criterion, so without it the tool cannot tell a choked valve from an unchoked one. Take it from the valve data sheet, or pick a style from the library.');
        const byMass = isNum(input.w);
        if (!byMass && !isNum(input.q)) return err(CODES.BAD_INPUT, 'Gas service needs either a mass flow or a standard volumetric flow.');
        if (byMass && !(isNum(input.rho1) && input.rho1 > 0)) return err(CODES.BAD_INPUT, 'Mass flow sizing needs a positive inlet density.');
        if (!byMass && !(isNum(input.MW) && isNum(input.T1) && isNum(input.Z))) {
            return err(CODES.BAD_INPUT, 'Volumetric gas sizing needs molar mass, inlet temperature and compressibility.');
        }
    }
    const pass = service === 'liquid' ? liquidPass : gasPass;
    // Seed from a single pass with no fittings correction. Fp is at most 1, so
    // this seed is a lower bound on C and the iteration approaches from below.
    const seed = pass({ ...input, D1: input.d, D2: input.d }, 1).nextC;
    if (!Number.isFinite(seed) || seed <= 0) {
        return err(CODES.NOT_CONVERGED, 'The sizing equation did not produce a usable starting value. Check the flow, pressures and fluid properties.');
    }
    const run = iterate(pass, input, seed);
    if (run.error) return run.error;
    return assemble(input, run, service);
}

function assemble(input, run, service) {
    const s = run.state;
    const liquid = service === 'liquid';
    // regimes.js owns classification and the advisories. It is called here so
    // that every successful result carries a regime by construction: the
    // contract in the SOW says the field is never null, and the only way to
    // guarantee that is to make it impossible to build a result without it.
    return withCharacteristic(assess({
        ok: true,
        service,
        C: run.C,
        choked: s.choked,
        dPSupplied: s.dPSupplied,
        dPUsed: s.dPUsed,
        dPChoked: liquid ? (s.choke ? s.choke.dPChoked : null) : s.xChoked * input.P1,
        Fp: s.Fp,
        FLP: liquid ? s.FLP : null,
        xTP: liquid ? null : s.xTP,
        FF: liquid ? (s.choke ? s.choke.FF : null) : null,
        Fgamma: liquid ? null : s.Fgamma,
        Y: liquid ? null : s.Y,
        x: liquid ? null : s.x,
        xChoked: liquid ? null : s.xChoked,
        FR: null,
        Rev: null,
        sigma: null,
        Pvc: null,
        // Empty when the choke check ran. Otherwise the names of the inputs it
        // is waiting on, so nothing downstream has to guess which one was blank.
        missingChokeInputs: liquid ? missingChokeInputs(input) : [],
        iterations: run.iterations,
        converged: run.converged,
        characteristic: null,
        warnings: [],
    }, input), input);
}

/**
 * Attach the characteristic and its advisories, when the caller supplied enough
 * of a system to compute them.
 *
 * Null when they did not, never a default system. Inventing a plausible
 * authority would put a number on the page that describes no installation, and
 * the whole posture of this tool is that a check which did not run says so.
 */
function withCharacteristic(result, input) {
    if (!result.ok) return result;
    const { characteristic, Crated, R, dPTotal, dPValveOpen } = input;
    if (!characteristic) return result;

    // A characteristic the user ASKED for and did not get needs a reason. It
    // used to fall through to the same "not computed" panel as a characteristic
    // nobody requested, whose explanation was to choose a trim and enter the
    // system differentials, which is what the user had just done.
    const problem = characteristicSystemError({ Crated, dPTotal, dPValveOpen });
    if (problem) return { ...result, warnings: [...result.warnings, problem] };

    const curves = installedCharacteristic({
        characteristic, Crated, R, dPTotal, dPValveOpen,
        relativeDensity: input.relativeDensity ?? 1,
        N1: N.N1,
    });
    if (!curves) return result;
    const travel = travelForCoefficient(characteristic, result.C, Crated, R);
    return {
        ...result,
        characteristic: { ...curves, travel, kind: characteristic },
        warnings: [
            ...result.warnings,
            ...characteristicAdvisories({
                authority: curves.authority, travel, C: result.C, Crated, R,
            }),
            ...systemMismatchAdvisories(result, input),
        ],
    };
}

/**
 * Cross-check between the two descriptions of one installation.
 *
 * The sizing case gives the valve differential at the operating point as
 * P1 - P2. The characteristic block gives the system separately, as a total and
 * a full-open valve share. Nothing forces those to describe the same pipe, and
 * when they disagree the reported authority and the reported travel are talking
 * about different installations, which is worse than either being absent.
 *
 * Two disagreements are checkable without assuming which figure is right:
 * the valve alone cannot drop more than the whole system has available, and the
 * full-open drop is the smallest the valve ever sees, because system loss climbs
 * with flow. Anything else is a legitimate part-open operating point.
 */
function systemMismatchAdvisories(result, input) {
    const { dPTotal, dPValveOpen } = input;
    const dP = result.dPSupplied;
    const out = [];
    if (isNum(dP) && isNum(dPTotal) && dP > dPTotal * (1 + 1e-9)) {
        out.push({
            code: 'SYSTEM_MISMATCH',
            severity: 'warn',
            message: `The sizing case drops ${dP.toFixed(1)} kPa across the valve alone, which is more than the ${dPTotal.toFixed(1)} kPa the system has available in total. The authority and travel reported below therefore describe a different installation from the one sized above.`,
        });
    } else if (isNum(dP) && isNum(dPValveOpen) && dPValveOpen > dP * (1 + 1e-9)) {
        out.push({
            code: 'SYSTEM_MISMATCH',
            severity: 'warn',
            message: `The valve is stated to drop ${dPValveOpen.toFixed(1)} kPa at full open but only ${dP.toFixed(1)} kPa at the sizing point. Full open is the largest flow and so the largest system loss, which makes it the smallest differential the valve ever sees. One of the two figures is wrong.`,
        });
    }
    return out;
}

/**
 * Rate a valve: given an installed C, find the achievable flow.
 *
 * Less iterative than sizing, because C is known, so Fp is direct. The choke cap
 * still has to be applied first: a rating routine that inverts the non-choked
 * equation returns a flow the valve cannot pass, which is the same error as
 * sizing past the choke point but harder to notice because the number looks
 * ordinary.
 */
export function rate(input) {
    const bad = guard(input);
    if (bad) return bad;
    const { service, C } = input;
    if (!isNum(C) || C <= 0) return err(CODES.BAD_INPUT, 'Installed flow coefficient must be positive.');
    if (service === 'liquid') {
        if (!isNum(input.relativeDensity) || input.relativeDensity <= 0) return err(CODES.BAD_INPUT, 'Relative density must be positive.');
        if (!isNum(input.FL)) return err(CODES.FL_OUT_OF_RANGE, 'The liquid recovery factor FL is required. Rating a valve without it would return a flow that ignores the choke point entirely.');
        if (isNum(input.Pv) && input.P2 < input.Pv) {
            return err(CODES.FLASHING, 'This service flashes: the outlet pressure is below the vapour pressure. The single-phase equations do not describe it.', REGIMES.FLASHING);
        }
        const g = geometry(input, C);
        const choke = liquidChokePoint(input, g.Fp, g.FLP);
        const dPSupplied = input.P1 - input.P2;
        const choked = choke !== null && dPSupplied >= choke.dPChoked;
        const dPUsed = choked ? choke.dPChoked : dPSupplied;
        const q = N.N1 * g.Fp * C * Math.sqrt(dPUsed / input.relativeDensity);
        return {
            ...assemble(input, { C, state: { ...g, choke, dPSupplied, dPUsed, choked }, iterations: 1, converged: true }, 'liquid'),
            q,
        };
    }
    if (service === 'gas') {
        if (!isNum(input.gamma)) return err(CODES.GAMMA_OUT_OF_RANGE, 'The specific heat ratio is required for compressible service.');
        if (!isNum(input.xT)) return err(CODES.XT_OUT_OF_RANGE, 'The terminal pressure drop ratio xT is required for compressible service. Rating a valve without it would return a flow that ignores the choke point entirely.');
        const g = geometry(input, C);
        const Fgamma = input.gamma / 1.40;
        const x = (input.P1 - input.P2) / input.P1;
        const xChoked = Fgamma * g.xTP;
        const choked = x >= xChoked;
        const xUsed = choked ? xChoked : x;
        const Y = 1 - xUsed / (3 * Fgamma * g.xTP);
        const state = { ...g, Fgamma, x, xChoked, xUsed, Y, choked, dPSupplied: input.P1 - input.P2, dPUsed: xUsed * input.P1 };
        const out = assemble(input, { C, state, iterations: 1, converged: true }, 'gas');
        if (isNum(input.rho1)) out.w = N.N6 * g.Fp * Y * C * Math.sqrt(xUsed * input.P1 * input.rho1);
        if (isNum(input.MW) && isNum(input.T1) && isNum(input.Z)) {
            out.q = N.N9 * g.Fp * Y * C * input.P1 * Math.sqrt(xUsed / (input.MW * input.T1 * input.Z));
        }
        return out;
    }
    return err(CODES.BAD_INPUT, "Service must be 'liquid' or 'gas'.");
}

export const ITERATION = Object.freeze({ MAX_ITERATIONS, REL_TOLERANCE });
