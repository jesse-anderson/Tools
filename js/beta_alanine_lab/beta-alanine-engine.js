// Beta-Alanine Lab engine. Pure, no imports, no DOM.
// Model (Spelnikov and Harris 2019), rise above baseline R in mmol/kg dry muscle:
//   dR/dt = slope * D(t) - kd * R
// D is the daily dose in g/day. Between dose changes the solution is exact:
//   R(t) = D*s/kd + (R0 - D*s/kd) * exp(-kd * dt)

export const CARNOSINE_G_PER_MOL = 226.23;
export const BETA_ALANINE_G_PER_MOL = 89.09;
export const MAX_PHASES = 4;

// Studied range of the fitted loading data, g/day and days.
export const FITTED_DOSE_MIN = 1.6;
export const FITTED_DOSE_MAX = 6.4;
export const LONGEST_STUDY_DAYS = 168;
export const HIGHEST_STUDIED_DOSE = 12;

// A study counts as comparable when its dose is within this factor of the protocol's.
export const COMPARABLE_DOSE_FACTOR = 1.5;

export function kdFromHalfLife(days) {
    return Math.LN2 / days;
}

/**
 * Phases [{ doseGPerDay, days }] in order, to a schedule of [start, end, dose]
 * segments in days. Zero-dose phases leave a gap, which the model treats as washout.
 */
export function buildSchedule(phases) {
    const schedule = [];
    let t = 0;
    for (const phase of phases) {
        const days = Math.max(0, Number(phase.days) || 0);
        const dose = Math.max(0, Number(phase.doseGPerDay) || 0);
        if (days > 0 && dose > 0) schedule.push([t, t + days, dose]);
        t += days;
    }
    return { schedule, supplementDays: t };
}

/** Rise at `day` for slope 1. Matches unit_rise in scripts/build-beta-alanine-fits.py. */
export function unitRise(schedule, day, kd) {
    let r = 0;
    let t = 0;
    for (const [a, b, dose] of schedule) {
        if (a > t) {
            const end = Math.min(a, day);
            r *= Math.exp(-kd * (end - t));
            t = end;
        }
        if (t >= day) return r;
        const end = Math.min(b, day);
        const eq = dose / kd;
        r = eq + (r - eq) * Math.exp(-kd * (end - Math.max(a, t)));
        t = end;
        if (t >= day) return r;
    }
    return r * Math.exp(-kd * (day - t));
}

/** Rise for slope 1 on every whole day 0..lastDay, stepped exactly. */
export function unitCurve(schedule, kd, lastDay) {
    const out = new Float64Array(lastDay + 1);
    const decayDay = Math.exp(-kd);
    let r = 0;
    for (let day = 1; day <= lastDay; day++) {
        const dose = doseOnInterval(schedule, day - 1);
        if (dose === null) {
            // A segment boundary falls inside this day; fall back to the general solver.
            r = unitRise(schedule, day, kd);
        } else if (dose > 0) {
            const eq = dose / kd;
            r = eq + (r - eq) * decayDay;
        } else {
            r *= decayDay;
        }
        out[day] = r;
    }
    return out;
}

// Dose in effect for the whole of [t, t + 1], 0 for none, null if it changes inside.
function doseOnInterval(schedule, t) {
    for (const [a, b, dose] of schedule) {
        if (t >= a && t + 1 <= b) return dose;
        if (t < b && t + 1 > a) return null;
    }
    return 0;
}

/** Least-squares slope for a fixed kd; closed form because R is linear in the slope. */
export function fitSlope(points, kd) {
    let num = 0;
    let den = 0;
    for (const p of points) {
        const g = unitRise(p.schedule, p.day, kd);
        num += p.rise * g;
        den += g * g;
    }
    return den > 0 ? num / den : 0;
}

/** Sorted array, linear interpolation between ranks. */
export function percentileSorted(sorted, p) {
    if (!sorted.length) return NaN;
    const index = (sorted.length - 1) * p;
    const low = Math.floor(index);
    const high = Math.ceil(index);
    if (low === high) return sorted[low];
    return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

/** Standard normal from two uniforms (Box-Muller). */
export function normalDraw(rng) {
    let u = rng();
    while (u <= 1e-12) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/**
 * One half-life draw from a washout paper. lognormal treats low and high as a
 * 95% interval; uniform spans them; fixed returns the central value.
 */
export function sampleHalfLife(washout, rng) {
    if (washout.sampling === 'lognormal') {
        const sigma = (Math.log(washout.high) - Math.log(washout.low)) / (2 * 1.959964);
        return Math.exp(Math.log(washout.central) + sigma * normalDraw(rng));
    }
    if (washout.sampling === 'uniform') return washout.low + (washout.high - washout.low) * rng();
    return washout.central;
}

/** Lognormal factor with mean 1 and the given coefficient of variation. */
export function responseFactor(cv, rng) {
    const s2 = Math.log(1 + cv * cv);
    return Math.exp(-s2 / 2 + Math.sqrt(s2) * normalDraw(rng));
}

/** Rezende 2020 response SD 6.6 around a mean 4-week rise of 14.0 mmol/kg dm. */
export function responseCv(sd = 6.6, mean = 14.0) {
    return sd / mean;
}

/** Grams of carnosine in a muscle mass (wet kg) at a dry-muscle concentration. */
export function carnosineGrams(mmolPerKgDry, muscleWetKg, wetToDry) {
    return (mmolPerKgDry * (muscleWetKg / wetToDry) * CARNOSINE_G_PER_MOL) / 1000;
}

export function triangular(rng, min, mode, max) {
    if (max <= min) return mode;
    const u = rng();
    const c = (mode - min) / (max - min);
    if (u < c) return min + Math.sqrt(u * (max - min) * (mode - min));
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

/**
 * Tingling band for one serving. Plain bands are per kg (Harris 2006);
 * sustained release by grams per serving (Decombaz 2012, Church 2017).
 */
export function tinglingBand({ gramsPerServing, bodyMassKg, form }) {
    const grams = Math.max(0, Number(gramsPerServing) || 0);
    const mgPerKg = bodyMassKg > 0 ? (grams * 1000) / bodyMassKg : NaN;
    if (grams === 0) return { level: 'none', label: 'No dose', mgPerKg, sourceIds: [] };
    if (form === 'sustained') {
        if (grams <= 1.6) {
            return { level: 'sr-placebo', label: 'Not different from placebo at this size', mgPerKg,
                reason: 'A single 1.6 g sustained-release dose gave symptoms not different from placebo.', sourceIds: ['decombaz2012'] };
        }
        if (grams <= 4) {
            return { level: 'sr-tested', label: 'No difference between groups at up to 4 g', mgPerKg,
                reason: 'Three 4 g sustained-release servings a day for 14 days showed no difference in paresthesia between groups.', sourceIds: ['church2017'] };
        }
        return { level: 'untested', label: 'Above any sustained-release serving tested', mgPerKg,
            reason: 'The largest sustained-release serving studied was 4 g.', sourceIds: ['church2017'] };
    }
    if (mgPerKg < 10) {
        return { level: 'below-tested', label: 'Below the smallest dose tested', mgPerKg,
            reason: 'The smallest dose tested was 10 mg/kg, so this is untested rather than shown to be free of tingling.', sourceIds: ['harris2006'] };
    }
    if (mgPerKg < 20) {
        return { level: 'possible', label: 'Possible, usually mild', mgPerKg,
            reason: 'At 10 mg/kg, 2 of 4 people had mild symptoms; at a fixed 800 mg, about 1 in 4.', sourceIds: ['harris2006'] };
    }
    if (mgPerKg < 40) {
        return { level: 'likely', label: 'Likely', mgPerKg,
            reason: 'At 20 mg/kg symptoms were evident, though less intense than at 40 mg/kg.', sourceIds: ['harris2006'] };
    }
    return { level: 'strong', label: 'Likely and unpleasant', mgPerKg,
        reason: 'At 40 mg/kg, flushing symptoms came on quickly and were unpleasant.', sourceIds: ['harris2006'] };
}

/**
 * Daily dose that holds a rise steady: intake slope * D equals loss kd * R.
 * Since R is slope times the unit curve, this is kd times the unit curve, so
 * it depends on the washout rate and the schedule, not on the loading paper.
 */
export function maintenanceDose(rise, slope, kd) {
    return slope > 0 && rise > 0 ? (kd * rise) / slope : 0;
}

// Plain servings at or above this many mg/kg are where Harris 2006 called symptoms evident.
export const TINGLING_LIKELY_MG_PER_KG = 20;
export const SR_PLACEBO_GRAMS = 1.6;
// The servings field's limit.
export const MAX_SERVINGS = 24;

// Fewest servings putting each strictly under 20 mg/kg (exactly 20 is in the likely band).
function fewestServingsUnderLikely(dose, bodyMassKg) {
    return Math.floor((dose * 1000) / (TINGLING_LIKELY_MG_PER_KG * bodyMassKg)) + 1;
}

/**
 * For a plain phase in the likely or strong band: the fewest servings that put
 * each under 20 mg/kg, and the sustained-release servings of 1.6 g or less
 * (Decombaz 2012) for the same daily dose. Null when no change is needed.
 */
export function lowerTinglingSplit({ doseGPerDay, servings, form, bodyMassKg }) {
    const dose = Number(doseGPerDay) || 0;
    if (form === 'sustained' || dose <= 0 || !(bodyMassKg > 0)) return null;
    const perKg = (dose * 1000) / Math.max(1, servings) / bodyMassKg;
    if (perKg < TINGLING_LIKELY_MG_PER_KG) return null;
    const n = fewestServingsUnderLikely(dose, bodyMassKg);
    return {
        servings: n,
        gramsPerServing: dose / n,
        mgPerKg: (dose * 1000) / n / bodyMassKg,
        srServings: Math.ceil(dose / SR_PLACEBO_GRAMS - 1e-9)
    };
}

/** Plain servings a day that keep each one under the likely band, within the field's limit. */
export function servingsUnderLikely(doseGPerDay, bodyMassKg) {
    const dose = Number(doseGPerDay) || 0;
    if (dose <= 0 || !(bodyMassKg > 0)) return 1;
    return Math.min(MAX_SERVINGS, fewestServingsUnderLikely(dose, bodyMassKg));
}

/** A goal dose is given only when its middle figure is inside the fitted doses. */
export function goalDoseUsable(result) {
    return Boolean(result) && result.p50 >= FITTED_DOSE_MIN && result.p50 <= FITTED_DOSE_MAX;
}

/** Flags for a protocol that leaves what the fitted studies covered. */
export function studiedRangeFlags(phases) {
    const flags = [];
    let supplementDays = 0;
    for (const p of phases) {
        const dose = Number(p.doseGPerDay) || 0;
        if (dose > 0) supplementDays += Number(p.days) || 0;
        if (dose > HIGHEST_STUDIED_DOSE) {
            flags.push({ id: 'dose-above-any', text: `${fmt(dose)} g/day is above any dose studied (12 g/day, Church 2017).`, sourceIds: ['church2017'] });
        } else if (dose > FITTED_DOSE_MAX) {
            flags.push({ id: 'dose-above-fit', text: `${fmt(dose)} g/day is above the 6.4 g/day the fitted studies used. At 12 g/day the synthesis rate was less than double 6 g/day's, so the curve may run high.`, sourceIds: ['spelnikov2019', 'church2017'] });
        } else if (dose > 0 && dose < FITTED_DOSE_MIN) {
            flags.push({ id: 'dose-below-fit', text: `${fmt(dose)} g/day is below the 1.6 g/day lowest fitted dose. Stegen 2014 tested 0.4 to 1.2 g/day as maintenance, by a method the fits do not use.`, sourceIds: ['stellingwerff2012', 'stegen2014'] });
        }
    }
    if (supplementDays > LONGEST_STUDY_DAYS) {
        flags.push({ id: 'duration', text: `${Math.round(supplementDays / 7)} weeks of dosing is longer than the longest study (24 weeks, Saunders 2017).`, sourceIds: ['saunders2017'] });
    }
    const seen = new Set();
    return flags.filter((f) => (seen.has(f.id) ? false : seen.add(f.id)));
}

/**
 * How far the protocol is covered by measured data. Loading: the longest
 * observation at a comparable dose. Washout: the longest washout follow-up.
 * Returns days from the start of the protocol.
 */
export function evidenceHorizon(phases, observations, washouts) {
    const { supplementDays } = buildSchedule(phases);
    const doses = phases.filter((p) => Number(p.doseGPerDay) > 0 && Number(p.days) > 0).map((p) => Number(p.doseGPerDay));
    const dose = doses.length ? Math.max(...doses) : 0;
    const comparable = [];
    for (const o of observations) {
        const studyDose = Math.max(...o.schedule.map((s) => s[2]));
        if (dose > 0 && studyDose <= dose * COMPARABLE_DOSE_FACTOR && studyDose >= dose / COMPARABLE_DOSE_FACTOR) {
            const existing = comparable.find((c) => c.sourceId === o.sourceId);
            if (existing) existing.days = Math.max(existing.days, o.day);
            else comparable.push({ sourceId: o.sourceId, days: o.day, dose: studyDose });
        }
    }
    comparable.sort((a, b) => b.days - a.days);
    const loadingDays = comparable.length ? comparable[0].days : 0;
    const followups = washouts.filter((w) => w.observedDays > 0).map((w) => ({ sourceId: w.sourceId, days: w.observedDays }));
    followups.sort((a, b) => b.days - a.days);
    const washoutDays = followups.length ? followups[0].days : 0;
    return {
        dose,
        supplementDays,
        loadingCoveredUntil: Math.min(loadingDays, supplementDays),
        loadingStudies: comparable,
        washoutCoveredUntil: supplementDays + washoutDays,
        washoutStudies: followups
    };
}

/** Which studies hold up the curve on a given day, for the hover. */
export function studiesCoveringDay(horizon, day) {
    if (day <= horizon.supplementDays) {
        const covering = horizon.loadingStudies.filter((s) => s.days >= day).map((s) => s.sourceId);
        return { phase: 'loading', covered: covering.length > 0, sourceIds: covering.length ? covering : horizon.loadingStudies.slice(0, 1).map((s) => s.sourceId) };
    }
    const since = day - horizon.supplementDays;
    const covering = horizon.washoutStudies.filter((s) => s.days >= since).map((s) => s.sourceId);
    return { phase: 'washout', covered: covering.length > 0, sourceIds: covering.length ? covering : horizon.washoutStudies.slice(0, 1).map((s) => s.sourceId) };
}

/** USD per gram range for a price tier's rows. */
export function tierPerGram(rows) {
    const perGram = rows.filter((r) => r.grams > 0 && r.priceUsd > 0).map((r) => r.priceUsd / r.grams);
    if (!perGram.length) return null;
    return { low: Math.min(...perGram), high: Math.max(...perGram) };
}

/** Cost of each phase and the total, at one USD per gram figure. */
export function protocolCost(phases, usdPerGram) {
    const perPhase = phases.map((p) => {
        const dose = Math.max(0, Number(p.doseGPerDay) || 0);
        const days = Math.max(0, Number(p.days) || 0);
        return { perWeek: dose * 7 * usdPerGram, total: dose * days * usdPerGram, grams: dose * days };
    });
    return { perPhase, total: perPhase.reduce((s, p) => s + p.total, 0), grams: perPhase.reduce((s, p) => s + p.grams, 0) };
}

export function totalGrams(phases) {
    return phases.reduce((s, p) => s + Math.max(0, Number(p.doseGPerDay) || 0) * Math.max(0, Number(p.days) || 0), 0);
}

function fmt(value) {
    return Number(value.toFixed(2)).toString();
}
