// Ellis-Roberts seed viability equation. Pure module, no imports.
//   v = Ki - p / sigma
//   log10(sigma) = KE - CW * log10(m) - CH * t - CQ * t^2
// v and Ki in NED, p and sigma in days, m in % of fresh weight, t in deg C.

export const DAYS_PER_YEAR = 365.25;

// Published probits are NED + 5. The offset cancels in every time difference.
export const PROBIT_OFFSET = 5;

// Fitted from -13 to 90 C (Dickie et al. 1990). The compendium and Hay print
// values at -20 C, the coldest any archived source evaluates.
export const VIABILITY_LIMITS = Object.freeze({
    temperatureFittedMinC: -13,
    temperatureFloorC: -20,
    temperatureMaxC: 90,
    // The low-moisture limit sits between 2 and 6% depending on oil content.
    lowLimitBandPct: Object.freeze({ min: 2, max: 6 }),
    // The upper limit sits between 15 and 28%, at about 90% RH.
    highLimitBandPct: Object.freeze({ min: 15, max: 28 }),
    // A germination test cannot tell 100% from 99.9%, and 100% has no probit.
    initialViabilityMaxPct: 99.9
});

// Moisture limits the 1996 compendium states for named species (section 3.3).
// The lower limits were measured in hermetic storage at 65 C.
export const SPECIES_MOISTURE_LIMITS = Object.freeze({
    "Pisum sativum": Object.freeze({ lowerPct: 6 }),
    "Vigna radiata": Object.freeze({ lowerPct: 6 }),
    "Oryza sativa": Object.freeze({ lowerPct: 4.5 }),
    "Eragrostis tef": Object.freeze({ lowerPct: 4.5, upperPct: 24 }),
    "Helianthus annuus": Object.freeze({ lowerPct: 2 }),
    "Lactuca sativa": Object.freeze({ upperPct: 15 }),
    "Allium cepa": Object.freeze({ upperPct: 18 }),
    "Ulmus carpinifolia": Object.freeze({ upperPct: 22 }),
    "Guizotia abyssinica": Object.freeze({ upperPct: 22 })
});

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

// ---------------------------------------------------------------------------
// Normal distribution
// ---------------------------------------------------------------------------

const SQRT_2PI = Math.sqrt(2 * Math.PI);

function normalPdf(z) {
    return Math.exp(-0.5 * z * z) / SQRT_2PI;
}

// The series loses the tail to cancellation, so past TAIL_SWITCH the upper
// tail comes from a continued fraction.
const TAIL_SWITCH = 3;

function upperTail(z) {
    let fraction = z;
    for (let k = 200; k >= 1; k -= 1) fraction = z + k / fraction;
    return normalPdf(z) / fraction;
}

/** Standard normal CDF. Series near the center, continued fraction in the tails. */
export function normalCdf(z) {
    if (!isNumber(z)) return NaN;
    if (z > TAIL_SWITCH) return 1 - upperTail(z);
    if (z < -TAIL_SWITCH) return upperTail(-z);
    // Phi(z) = 1/2 + phi(z) * (z + z^3/3 + z^5/(3*5) + ...)
    let term = z;
    let sum = z;
    for (let k = 1; k < 200; k += 1) {
        term *= (z * z) / (2 * k + 1);
        sum += term;
        if (Math.abs(term) < 1e-17 * Math.abs(sum)) break;
    }
    return 0.5 + normalPdf(z) * sum;
}

// Acklam's rational approximation, relative error about 1e-9 before refinement.
const ACKLAM_A = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
const ACKLAM_B = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
const ACKLAM_C = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
const ACKLAM_D = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
    3.754408661907416e+00];

/** Inverse standard normal CDF, refined against normalCdf by Newton steps. */
export function inverseNormalCdf(p) {
    if (!isNumber(p) || p <= 0 || p >= 1) return NaN;
    const a = ACKLAM_A, b = ACKLAM_B, c = ACKLAM_C, d = ACKLAM_D;
    let z;
    if (p < 0.02425) {
        const q = Math.sqrt(-2 * Math.log(p));
        z = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
            / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p > 1 - 0.02425) {
        const q = Math.sqrt(-2 * Math.log(1 - p));
        z = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5])
            / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else {
        const q = p - 0.5;
        const r = q * q;
        z = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
            / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    // Newton steps make the round trip through normalCdf exact.
    for (let i = 0; i < 3; i += 1) {
        const error = normalCdf(z) - p;
        const density = normalPdf(z);
        if (density === 0) break;
        z -= error / density;
    }
    return z;
}

/** Percent viability to NED. 50% is 0, 84.1% is 1, 97.7% is 2. */
export function nedFromPercent(percent) {
    return inverseNormalCdf(percent / 100);
}

export function percentFromNed(ned) {
    return 100 * normalCdf(ned);
}

// ---------------------------------------------------------------------------
// The equation
// ---------------------------------------------------------------------------

function isCompleteSet(constants) {
    return Boolean(constants)
        && isNumber(constants.KE) && isNumber(constants.CW)
        && isNumber(constants.CH) && isNumber(constants.CQ);
}

/**
 * sigma in days as published, with no limits applied. The literature anchors
 * are checked against this; user-facing numbers go through predictDetermination.
 */
export function sigmaDays(constants, moisturePct, temperatureC) {
    if (!isCompleteSet(constants)) return NaN;
    if (!isNumber(moisturePct) || moisturePct <= 0 || !isNumber(temperatureC)) return NaN;
    const exponent = constants.KE
        - constants.CW * Math.log10(moisturePct)
        - constants.CH * temperatureC
        - constants.CQ * temperatureC * temperatureC;
    return Math.pow(10, exponent);
}

/**
 * Peak of the temperature quadratic, -CH / (2 CQ). Below it the equation
 * predicts cooling shortens life. Five published sets peak above -25 C.
 */
export function turningPointC(constants) {
    if (!isCompleteSet(constants) || constants.CQ <= 0) return -Infinity;
    return -constants.CH / (2 * constants.CQ);
}

/** Percent viability after `days`, from sigma and the initial NED. */
export function viabilityAfterDays(sigma, initialNed, days) {
    if (!isNumber(sigma) || sigma <= 0 || !isNumber(initialNed) || !isNumber(days)) return NaN;
    return percentFromNed(initialNed - Math.max(days, 0) / sigma);
}

/** Days for viability to fall from the initial NED to a target NED. */
export function daysToNed(sigma, initialNed, targetNed) {
    if (!isNumber(sigma) || sigma <= 0 || !isNumber(initialNed) || !isNumber(targetNed)) return NaN;
    return Math.max(initialNed - targetNed, 0) * sigma;
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

function flag(code, message) {
    return { code, message };
}

function fmt(value, digits = 1) {
    return Number(value.toFixed(digits)).toString();
}

function parseRange(text) {
    const match = /^\s*([0-9.]+)\s*-\s*([0-9.]+)\s*$/.exec(String(text || ""));
    if (!match) return null;
    const low = Number(match[1]);
    const high = Number(match[2]);
    return isNumber(low) && isNumber(high) ? { low, high } : null;
}

function resolveTemperature(constants, temperatureC, flags) {
    const limits = VIABILITY_LIMITS;
    if (temperatureC > limits.temperatureMaxC) {
        return { ok: false, reason: `The equation has not been tested above ${limits.temperatureMaxC} °C.` };
    }
    const turn = turningPointC(constants);
    const coldest = Math.max(limits.temperatureFloorC, turn);
    let applied = temperatureC;
    if (temperatureC < coldest) {
        applied = coldest;
        flags.push(turn > limits.temperatureFloorC
            ? flag("turning-point", `This determination's temperature curve turns over at ${fmt(turn)} °C: `
                + "below that the fitted equation predicts colder storage shortens life, which is an artifact of the fit. "
                + `Held at ${fmt(turn)} °C.`)
            : flag("temperature-floor", `No archived source evaluates the equation below ${limits.temperatureFloorC} °C. `
                + `Held at ${limits.temperatureFloorC} °C.`));
    }
    if (applied < limits.temperatureFittedMinC) {
        flags.push(flag("cold-extrapolation", `The equation was fitted from ${limits.temperatureFittedMinC} to `
            + `${limits.temperatureMaxC} °C. ${fmt(applied)} °C is an extrapolation, though the compendium itself prints values at -20 °C.`));
    }
    return { ok: true, applied };
}

function resolveMoisture(constants, scientificName, moisturePct, flags) {
    const limits = VIABILITY_LIMITS;
    const known = SPECIES_MOISTURE_LIMITS[scientificName] || {};

    const upper = isNumber(known.upperPct) ? known.upperPct : limits.highLimitBandPct.max;
    if (moisturePct > upper) {
        return {
            ok: false,
            reason: isNumber(known.upperPct)
                ? `Above about ${fmt(known.upperPct)}% moisture the equation stops applying to this species.`
                : `Above ${limits.highLimitBandPct.max}% moisture the equation applies to no species.`
        };
    }
    if (!isNumber(known.upperPct) && moisturePct > limits.highLimitBandPct.min) {
        flags.push(flag("upper-limit-possible", `The equation's upper moisture limit lies between `
            + `${limits.highLimitBandPct.min} and ${limits.highLimitBandPct.max}% depending on the species and is not recorded for this one. `
            + "Seed this wet may already be past it."));
    }

    let applied = moisturePct;
    if (isNumber(known.lowerPct)) {
        if (moisturePct < known.lowerPct) {
            applied = known.lowerPct;
            flags.push(flag("low-moisture-plateau", `Drying below about ${fmt(known.lowerPct)}% gives this species no further gain `
                + `in hermetic storage, so the prediction is held at ${fmt(known.lowerPct)}%. That limit was measured at 65 °C and sits a little higher in the cold.`));
        }
    } else if (moisturePct < limits.lowLimitBandPct.min) {
        applied = limits.lowLimitBandPct.min;
        flags.push(flag("low-moisture-floor", `No species gains from drying below about ${limits.lowLimitBandPct.min}%. `
            + `Held at ${limits.lowLimitBandPct.min}%.`));
    } else if (moisturePct < limits.lowLimitBandPct.max) {
        flags.push(flag("low-limit-possible", `The low-moisture limit lies between ${limits.lowLimitBandPct.min} and `
            + `${limits.lowLimitBandPct.max}% depending on the species and is not recorded for this one. `
            + "If this seed is already below it, the figure here is too long."));
    }

    const tested = parseRange(constants.moistureRangeTestedPct);
    if (tested && (applied < tested.low || applied > tested.high)) {
        flags.push(flag("outside-tested-moisture", `These constants were fitted between ${fmt(tested.low)} and `
            + `${fmt(tested.high)}% moisture. ${fmt(applied)}% is outside that.`));
    }
    return { ok: true, applied };
}

function resolveInitial(initialViabilityPct, flags) {
    const max = VIABILITY_LIMITS.initialViabilityMaxPct;
    if (!isNumber(initialViabilityPct) || initialViabilityPct <= 0) {
        return { ok: false, reason: "Enter the lot's germination percentage at the start of storage." };
    }
    if (initialViabilityPct > 100) {
        return { ok: false, reason: "Germination cannot exceed 100%." };
    }
    let applied = initialViabilityPct;
    if (initialViabilityPct > max) {
        applied = max;
        flags.push(flag("initial-capped", `100% has no probit, and no germination test can tell it from ${max}%. Taken as ${max}%.`));
    }
    return { ok: true, applied };
}

// ---------------------------------------------------------------------------
// Prediction
// ---------------------------------------------------------------------------

/**
 * Run one parameter set at one storage condition. ok:false carries a reason;
 * an input held at a limit shows in `applied` and is explained in `flags`.
 */
export function predictDetermination(constants, {
    scientificName = "",
    moisturePct,
    temperatureC,
    initialViabilityPct,
    targetViabilityPct
} = {}) {
    if (!isCompleteSet(constants)) {
        return { ok: false, reason: "This determination does not carry all four constants." };
    }
    if (!isNumber(moisturePct) || moisturePct <= 0) {
        return { ok: false, reason: "Enter the seed moisture content." };
    }
    if (!isNumber(temperatureC)) {
        return { ok: false, reason: "Enter the storage temperature." };
    }
    if (!isNumber(targetViabilityPct) || targetViabilityPct <= 0 || targetViabilityPct >= 100) {
        return { ok: false, reason: "Enter a lowest acceptable germination between 0 and 100%." };
    }

    const flags = [];
    const initial = resolveInitial(initialViabilityPct, flags);
    if (!initial.ok) return { ok: false, reason: initial.reason };
    const temperature = resolveTemperature(constants, temperatureC, flags);
    if (!temperature.ok) return { ok: false, reason: temperature.reason };
    const moisture = resolveMoisture(constants, scientificName, moisturePct, flags);
    if (!moisture.ok) return { ok: false, reason: moisture.reason };

    const sigma = sigmaDays(constants, moisture.applied, temperature.applied);
    if (!isNumber(sigma) || sigma <= 0) {
        return { ok: false, reason: "The equation did not return a usable value for these inputs." };
    }

    const initialNed = nedFromPercent(initial.applied);
    const targetNed = nedFromPercent(targetViabilityPct);
    const alreadyBelowTarget = initial.applied <= targetViabilityPct;
    if (alreadyBelowTarget) {
        flags.push(flag("already-below-target", `The lot starts at ${fmt(initial.applied)}%, at or below the `
            + `${fmt(targetViabilityPct)}% you asked for, so it has no time left.`));
    }

    return {
        ok: true,
        constants,
        flags,
        applied: {
            moisturePct: moisture.applied,
            temperatureC: temperature.applied,
            initialViabilityPct: initial.applied,
            targetViabilityPct
        },
        sigmaDays: sigma,
        sigmaYears: sigma / DAYS_PER_YEAR,
        initialNed,
        initialProbit: initialNed + PROBIT_OFFSET,
        targetNed,
        daysToTarget: daysToNed(sigma, initialNed, targetNed),
        // Time to 50%. Zero when the lot starts at or below half.
        daysToHalf: daysToNed(sigma, initialNed, 0),
        alreadyBelowTarget
    };
}

/**
 * Run every determination a species carries, separately. They are never
 * averaged; where more than one survives the spread is reported as a range.
 */
export function predictSpecies(record, conditions = {}) {
    const sets = (record && record.constants) || [];
    const scientificName = record ? record.scientificName : "";
    const determinations = sets.map((constants) => ({
        sourceKey: constants.sourceKey || null,
        reference: constants.reference || "",
        constants,
        ...predictDetermination(constants, { ...conditions, scientificName })
    }));

    const usable = determinations.filter((entry) => entry.ok);
    if (!usable.length) {
        return {
            ok: false,
            determinations,
            reason: !sets.length
                ? "No published viability constants are held for this species."
                : determinations[0].reason
        };
    }

    const span = (pick) => ({
        low: Math.min(...usable.map(pick)),
        high: Math.max(...usable.map(pick))
    });
    const toTarget = span((entry) => entry.daysToTarget);
    const sigma = span((entry) => entry.sigmaDays);

    return {
        ok: true,
        determinations,
        usableCount: usable.length,
        daysToTarget: toTarget,
        daysToHalf: span((entry) => entry.daysToHalf),
        sigmaDays: sigma,
        // Taken on sigma so the ratio survives a lot with no time left.
        ratio: sigma.low > 0 ? sigma.high / sigma.low : null,
        applied: usable[0].applied
    };
}

/** Sample a survival curve as [{ days, percent }], by default out to 1% germination. */
export function sampleSurvivalCurve(prediction, { points = 60, horizonDays = null } = {}) {
    if (!prediction || !prediction.ok) return [];
    const count = Math.max(2, Math.floor(points));
    const horizon = isNumber(horizonDays) && horizonDays > 0
        ? horizonDays
        : defaultHorizonDays(prediction);
    const curve = [];
    for (let i = 0; i < count; i += 1) {
        const days = (horizon * i) / (count - 1);
        curve.push({ days, percent: viabilityAfterDays(prediction.sigmaDays, prediction.initialNed, days) });
    }
    return curve;
}

export function defaultHorizonDays(prediction) {
    if (!prediction || !prediction.ok) return NaN;
    const onePercentNed = nedFromPercent(1);
    return Math.max(prediction.initialNed - onePercentNed, 1) * prediction.sigmaDays;
}
