// Inherent and installed characteristic, and valve authority.
//
// Pure, synchronous, no DOM. This is the part of the tool that talks to
// pid-playground: low valve authority is one of the most common reasons a loop
// tunes acceptably at one operating point and hunts at another, and neither
// tool can currently show it.
//
// It is also the part with the weakest claim on reality, and the tool says so.
// C(h) is an idealisation. Real trim is manufactured to a tolerance on it, and
// the quick-opening form especially varies enough between manufacturers that it
// serves as a teaching curve and should not be read as a prediction.

export const CHARACTERISTICS = Object.freeze(['linear', 'equal-percentage', 'quick-opening']);

/** Typical rangeability of equal-percentage trim. Style dependent in reality. */
export const DEFAULT_RANGEABILITY = 50;

/**
 * Inherent characteristic: the coefficient at fractional travel h, in isolation
 * from any system.
 *
 * Note what happens at h = 0. Linear and quick-opening close to zero, but equal
 * percentage lands on C_rated / R, which is not a rounding artefact: it is the
 * DEFINITION of rangeability, the ratio of maximum to minimum controllable
 * flow. A trim that reached zero would have infinite rangeability.
 */
export function inherentCoefficient(characteristic, h, Crated, R = DEFAULT_RANGEABILITY) {
    if (!Number.isFinite(h) || h < 0 || h > 1) return null;
    switch (characteristic) {
        case 'linear':
            return Crated * h;
        case 'equal-percentage':
            return Crated * R ** (h - 1);
        case 'quick-opening':
            return Crated * Math.sqrt(h);
        default:
            return null;
    }
}

/**
 * Travel that yields a given coefficient. The inverse of the above.
 *
 * Used to answer the question the sizing result raises immediately: where on its
 * stroke will this valve actually sit? Below about 10% or above 90% the trim is
 * outside its useful range and control quality falls off, which is a warning the
 * coefficient alone cannot give.
 */
export function travelForCoefficient(characteristic, C, Crated, R = DEFAULT_RANGEABILITY) {
    if (!(C > 0) || !(Crated > 0)) return null;
    const ratio = C / Crated;
    switch (characteristic) {
        case 'linear':
            return ratio;
        case 'equal-percentage':
            return 1 + Math.log(ratio) / Math.log(R);
        case 'quick-opening':
            return ratio * ratio;
        default:
            return null;
    }
}

/**
 * The installed characteristic, and the authority that shapes it.
 *
 * The system model is a constant total pressure `dPTotal` shared between the
 * valve and everything else, with the rest of the system behaving turbulently so
 * its loss goes as the square of flow:
 *
 *     dP_system = Ksys * q^2
 *     dP_valve  = SG * q^2 / (N1 * C(h))^2
 *     dPTotal   = dP_valve + dP_system
 *
 * which rearranges to
 *
 *     q(h) = sqrt( dPTotal / ( SG / (N1 C(h))^2 + Ksys ) )
 *
 * The caller supplies `dPValveOpen`, the differential across the valve at full
 * open, because that is a number an engineer actually has. Authority then falls
 * out as a computed result instead of an assumption:
 *
 *     Nv = dPValveOpen / dPTotal
 *
 * The degenerate case is the honest check on all of it. With Nv = 1 the valve
 * takes the whole drop, Ksys is zero, and the installed curve collapses onto the
 * inherent one scaled by the flow. That is the same shape of degenerate test as
 * Fp = 1 when d = D1 = D2, and the spec asserts it.
 */
export function installedCharacteristic({
    characteristic,
    Crated,
    R = DEFAULT_RANGEABILITY,
    dPTotal,
    dPValveOpen,
    relativeDensity = 1,
    N1,
    points = 21,
}) {
    if (!(Crated > 0) || !(dPTotal > 0) || !(dPValveOpen > 0)) return null;
    if (dPValveOpen > dPTotal) return null;
    if (!(N1 > 0) || !(relativeDensity > 0)) return null;

    const authority = dPValveOpen / dPTotal;
    const qOpen = N1 * Crated * Math.sqrt(dPValveOpen / relativeDensity);
    // Ksys from the full-open operating point. At authority 1 this is exactly
    // zero, which is what makes the degenerate case exact instead of merely
    // close.
    const Ksys = (dPTotal - dPValveOpen) / (qOpen * qOpen);

    const inherent = [];
    const installed = [];
    for (let i = 0; i < points; i++) {
        const h = i / (points - 1);
        const C = inherentCoefficient(characteristic, h, Crated, R);
        inherent.push([h, C]);
        if (C <= 0) {
            installed.push([h, 0]);
            continue;
        }
        const valveTerm = relativeDensity / ((N1 * C) ** 2);
        installed.push([h, Math.sqrt(dPTotal / (valveTerm + Ksys))]);
    }

    // Normalised so the two curves can share an axis: inherent as a fraction of
    // rated coefficient, installed as a fraction of the flow at full open.
    const qMax = installed[installed.length - 1][1];
    return {
        authority,
        Ksys,
        qOpen,
        qMax,
        inherent,
        installed,
        inherentNormalised: inherent.map(([h, C]) => [h, C / Crated]),
        installedNormalised: installed.map(([h, q]) => [h, qMax > 0 ? q / qMax : 0]),
        // Distortion is what the plot exists to show, so it is also a number:
        // how far the installed curve departs from the inherent one, at worst,
        // once both are normalised. An authority of 1 gives exactly zero.
        maxDistortion: inherent.reduce((worst, [h, C], i) => {
            const a = C / Crated;
            const b = qMax > 0 ? installed[i][1] / qMax : 0;
            return Math.max(worst, Math.abs(a - b));
        }, 0),
    };
}

/**
 * Why a requested characteristic could not be built, or null if it can be.
 *
 * Separate from installedCharacteristic so the caller can tell "nobody asked"
 * apart from "you asked and the numbers contradict each other". Those used to
 * render identically, as a panel advising the user to enter the very figures
 * they had just entered.
 */
export function characteristicSystemError({ Crated, dPTotal, dPValveOpen }) {
    const bad = (message) => ({ code: 'SYSTEM_INCONSISTENT', severity: 'warn', message });
    if (!(Crated > 0)) {
        return bad('The installed characteristic needs the rated coefficient of the trim at full open. Without it there is no curve to place the operating point on.');
    }
    if (!(dPTotal > 0) || !(dPValveOpen > 0)) {
        return bad('The installed characteristic needs both the total available differential and the valve differential at full open. Both must be positive.');
    }
    if (dPValveOpen > dPTotal) {
        return bad(`The valve is stated to take ${dPValveOpen.toFixed(1)} kPa at full open out of a total of ${dPTotal.toFixed(1)} kPa, which leaves the rest of the system a negative loss. Valve authority cannot exceed 1: the valve cannot drop more than the system has.`);
    }
    return null;
}

/**
 * Advisories belonging to the characteristic, separate from the sizing ones.
 *
 * Authority below roughly 0.25 flattens an equal-percentage valve toward a
 * linear-then-saturating installed shape. That is the mechanism behind a loop
 * that tunes acceptably at low flow and oscillates near full open, and it is
 * invisible in the coefficient.
 *
 * Travel outside 0 to 1 is a different condition, and it used to be reported as a
 * percentage with the wrong advisory attached. A required coefficient above the
 * rated one gave "334% travel, leaving almost no capacity in reserve", when the
 * valve cannot pass the flow at any opening; below the rangeability limit an
 * equal-percentage trim gave "-28% travel", when the valve is simply shut. Those
 * are now their own codes and the near-the-end advisories only fire on a travel
 * that exists.
 */
export function characteristicAdvisories({ authority, travel, C, Crated, R = DEFAULT_RANGEABILITY }) {
    const out = [];
    if (Number.isFinite(authority) && authority < 0.25) {
        out.push({
            code: 'LOW_AUTHORITY',
            severity: 'warn',
            message: `Valve authority is ${authority.toFixed(2)}. Below about 0.25 the installed characteristic is significantly distorted from the inherent one, so the loop gain changes across the operating range and a single set of tuning constants will not hold.`,
        });
    }
    if (!Number.isFinite(travel)) return out;

    if (travel > 1) {
        out.push({
            code: 'TRIM_UNDERSIZED',
            severity: 'error',
            message: `The required coefficient of ${C.toFixed(2)} exceeds the rated ${Crated.toFixed(2)} of this trim, so there is no travel at which the valve passes this flow. It is not near full open, it is too small. Size up the trim or accept a larger differential.`,
        });
        return out;
    }
    if (travel < 0) {
        // Only reachable on equal percentage, where C(0) is Crated / R rather
        // than zero. That floor is the definition of rangeability, so falling
        // below it means the valve is shut, not that travel went negative.
        out.push({
            code: 'TRIM_BELOW_RANGEABILITY',
            severity: 'warn',
            message: `The required coefficient of ${C.toFixed(3)} is below ${(Crated / R).toFixed(3)}, the smallest this trim controls at a rangeability of ${R}. The valve is shut rather than throttling, so it will cycle between seated and its minimum controllable opening.`,
        });
        return out;
    }
    if (travel < 0.10) {
        out.push({
            code: 'TRAVEL_TOO_LOW',
            severity: 'warn',
            message: `The valve sits at ${(travel * 100).toFixed(0)}% travel at this condition. Below about 10% most trim is outside its useful range: seat load, clearance flow and hysteresis dominate, and control quality falls off sharply.`,
        });
    } else if (travel > 0.90) {
        out.push({
            code: 'TRAVEL_TOO_HIGH',
            severity: 'warn',
            message: `The valve sits at ${(travel * 100).toFixed(0)}% travel at this condition, leaving almost no capacity in reserve. A valve at full open has no upward controllability at all.`,
        });
    }
    return out;
}
