// Pure computation engine for the Toxicology Body Burden tool.
//
// Nothing in this file touches the DOM. Every function takes plain numbers and
// returns plain objects so the math can be tested directly (see
// tests/smoke/toxicology-body-burden.spec.cjs) and reasoned about in isolation.
//
// The model: estimate an apparent amount in the body ("body burden") from a
// measured concentration and an apparent volume of distribution (Vd), with an
// optional first-order elimination back-calculation to an earlier concentration.

import { SPECIES_DB } from './species-data.js';

export { SPECIES_DB };

// Concentration unit -> multiplier that converts an input value into mg/L.
export const MASS_UNIT_TO_MG_L_FACTOR = {
    g_l:   1000,
    g_dl:  10000,
    mg_l:  1,
    mg_dl: 10,
    ug_ml: 1,
    ug_l:  1 / 1000,
    ng_ml: 1 / 1000,
    ng_l:  1 / 1000000,
    pg_ml: 1 / 1000000,
};

// Molar unit -> multiplier that converts an input value into mol/L.
export const MOLAR_UNIT_TO_MOL_L_FACTOR = {
    mol:  1,
    mmol: 1e-3,
    umol: 1e-6,
    nmol: 1e-9,
    pmol: 1e-12,
};

// Human-readable form of a unit key, e.g. 'mg_dl' -> 'mg/dL', 'umol' -> 'umol/L'.
export function unitLabel(unit) {
    if (unit in MOLAR_UNIT_TO_MOL_L_FACTOR) return `${unit}/L`;
    const parts = String(unit).split('_');
    if (parts.length === 2) {
        const num = parts[0];
        const den = parts[1] === 'l' ? 'L' : (parts[1] === 'dl' ? 'dL' : (parts[1] === 'ml' ? 'mL' : parts[1]));
        return `${num}/${den}`;
    }
    return unit;
}

// Convert a raw concentration to mg/L.
// Returns { ok, mgL, isMolar, molPerL?, factor?, error? }.
export function normalizeToMgL(rawConc, unit, mw) {
    if (!Number.isFinite(rawConc)) {
        return { ok: false, error: 'Concentration must be a finite number.' };
    }

    if (unit in MOLAR_UNIT_TO_MOL_L_FACTOR) {
        if (!Number.isFinite(mw) || mw <= 0) {
            return { ok: false, error: 'Molecular Weight (g/mol) must be > 0 for molar units.' };
        }
        const molPerL = rawConc * MOLAR_UNIT_TO_MOL_L_FACTOR[unit];
        const mgL = molPerL * mw * 1000;
        return { ok: true, mgL, isMolar: true, molPerL };
    }

    if (unit in MASS_UNIT_TO_MG_L_FACTOR) {
        const factor = MASS_UNIT_TO_MG_L_FACTOR[unit];
        return { ok: true, mgL: rawConc * factor, isMolar: false, factor };
    }

    return { ok: false, error: 'Unknown concentration unit.' };
}

// First-order elimination back-calculation and clearance heuristics.
// Given a measured Ct (mg/L) at time t, estimate C0 and time-to-threshold.
// Returns { ok, k, factor, C0, t97, t99, error? }.
export function computeKinetics(Ct, timeHr, halfLifeHr, targetPct) {
    if (!Number.isFinite(timeHr) || timeHr < 0) {
        return { ok: false, error: 'Time elapsed must be >= 0.' };
    }
    if (!Number.isFinite(halfLifeHr) || halfLifeHr <= 0) {
        return { ok: false, error: 'Half-life must be > 0.' };
    }

    const k = Math.LN2 / halfLifeHr;      // ln(2) / t1/2, 1/hr
    const factor = Math.exp(k * timeHr);  // e^(+k t)
    if (!Number.isFinite(factor) || factor <= 0) {
        return { ok: false, error: 'Kinetic back-calc overflow/underflow (inputs out of numeric range).' };
    }

    const C0 = Ct * factor;
    const t97 = 5.0 * halfLifeHr;         // ~97% eliminated (remaining = 0.5^5 = 3.125%)

    if (!Number.isFinite(targetPct) || targetPct < 0) {
        return { ok: false, error: 'Clearance target must be >= 0% remaining.' };
    }

    // fraction_remaining = e^(-k t) = (1/2)^(t / t1/2)
    // => t = t1/2 * log2(1 / fraction_remaining)
    const targetFrac = targetPct / 100.0;
    let t99;
    if (targetFrac === 0) {
        t99 = Infinity;                   // exactly 0 remaining is asymptotic
    } else if (targetFrac >= 1) {
        t99 = 0;
    } else {
        t99 = halfLifeHr * (Math.log(1 / targetFrac) / Math.LN2);
    }

    return { ok: true, k, factor, C0, t97, t99 };
}

// Volume of distribution for a given mode.
// Returns { ok, Vd, physV, error? }. Loss (L) is only applied to Modes A/B.
export function computeVd(mode, { weight, bv, tbw, loss = 0, vdCoeff }) {
    if (mode === 'modeA') {
        const physV = (weight * bv) / 1000;
        return { ok: true, Vd: Math.max(0, physV - loss), physV };
    }
    if (mode === 'modeB') {
        const physV = weight * tbw;
        return { ok: true, Vd: Math.max(0, physV - loss), physV };
    }
    if (mode === 'modeC') {
        if (!Number.isFinite(vdCoeff) || vdCoeff <= 0) {
            return { ok: false, error: 'Custom Vd coefficient (L/kg) must be > 0.' };
        }
        const Vd = weight * vdCoeff;
        return { ok: true, Vd, physV: Vd };
    }
    return { ok: false, error: 'Unknown Vd mode.' };
}

// Full pipeline: normalize -> optional kinetics -> Vd -> amounts.
//
// input = {
//   rawConc, unit, mw, speciesId, weight, loss,
//   mode ('modeA'|'modeB'|'modeC'), vdCoeff,
//   kinetics: { enabled, time, halflife, targetPct }
// }
//
// Returns a structured result. On missing-but-not-invalid input it returns
// { ok: false, pending: true } so a UI can show a neutral waiting state rather
// than an error. On invalid input it returns { ok: false, error }.
export function computeBodyBurden(input) {
    const {
        rawConc, unit, mw, speciesId, weight,
        loss = 0, mode, vdCoeff, kinetics,
    } = input;

    const species = SPECIES_DB.find(s => s.id === speciesId);

    if (!species || !Number.isFinite(rawConc) || !Number.isFinite(weight)) {
        return { ok: false, pending: true };
    }

    if (rawConc < 0) return { ok: false, error: 'Concentration must be non-negative.' };
    if (weight <= 0) return { ok: false, error: 'Weight must be > 0.' };
    if (!Number.isFinite(loss) || loss < 0) return { ok: false, error: 'Fluid loss must be >= 0.' };

    const norm = normalizeToMgL(rawConc, unit, mw);
    if (!norm.ok) return { ok: false, error: norm.error };
    const Ct = norm.mgL;

    const kineticsEnabled = !!(kinetics && kinetics.enabled);
    let kin = null;
    let C0 = Ct;
    if (kineticsEnabled) {
        kin = computeKinetics(Ct, kinetics.time, kinetics.halflife, kinetics.targetPct);
        if (!kin.ok) return { ok: false, error: kin.error };
        C0 = kin.C0;
    }

    const vd = computeVd(mode, {
        weight, bv: species.bv, tbw: species.tbw, loss, vdCoeff,
    });
    if (!vd.ok) return { ok: false, error: vd.error };
    const Vd = vd.Vd;

    const At = Ct * Vd;
    const A0 = C0 * Vd;
    const Astar = kineticsEnabled ? A0 : At;

    return {
        ok: true,
        kineticsEnabled,
        species,
        norm,
        Ct,
        C0: kineticsEnabled ? C0 : null,
        Vd,
        physV: vd.physV,
        At,
        A0: kineticsEnabled ? A0 : null,
        Astar,
        aBasis: kineticsEnabled ? 'A0' : 'At',
        k: kineticsEnabled ? kin.k : null,
        t97: kineticsEnabled ? kin.t97 : null,
        t99: kineticsEnabled ? kin.t99 : null,
    };
}
