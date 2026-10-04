// Monte Carlo band for the viability equation. It samples what the user cannot
// know exactly: storage moisture, temperature and the lot's true germination.
// The RNG and percentile are copied from js/creatine_lab/creatine-model.js.

import { DAYS_PER_YEAR, nedFromPercent, normalCdf, predictDetermination } from "./seed-viability-engine.js";

export const MONTE_CARLO_LIMITS = Object.freeze({
    drawsMin: 100,
    drawsMax: 2000,
    drawsDefault: 500,
    seedDefault: 20261003
});

export const PERCENTILES = Object.freeze({ low: 0.10, mid: 0.50, high: 0.90 });

const isNumber = (value) => typeof value === "number" && Number.isFinite(value);

/** xorshift32 (Marsaglia 2003). Deterministic for a given seed. */
export function createSeededRandom(seed) {
    let state = Math.abs(Math.floor(seed)) >>> 0;
    if (state === 0) state = 2463534242;
    return () => {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 4294967296;
    };
}

/** Linear interpolation between order statistics. */
export function percentile(values, p) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    return percentileSorted(sorted, p);
}

function percentileSorted(sorted, p) {
    const index = (sorted.length - 1) * p;
    const low = Math.floor(index);
    const high = Math.ceil(index);
    if (low === high) return sorted[low];
    return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

export function uniform(rng, low, high) {
    return low + (high - low) * rng();
}

// Box-Muller. The first uniform is kept off zero so the log stays finite.
function standardNormal(rng) {
    const u = 1 - rng();
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Gamma(shape, 1) by Marsaglia and Tsang 2000. */
export function sampleGamma(rng, shape) {
    if (shape < 1) return sampleGamma(rng, shape + 1) * Math.pow(1 - rng(), 1 / shape);
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
        const x = standardNormal(rng);
        const v = Math.pow(1 + c * x, 3);
        if (v <= 0) continue;
        const u = 1 - rng();
        if (u < 1 - 0.0331 * x ** 4) return d * v;
        if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
}

export function sampleBeta(rng, a, b) {
    const x = sampleGamma(rng, a);
    const y = sampleGamma(rng, b);
    return x / (x + y);
}

/**
 * The lot's true germination given a test of n seeds that showed observedPct.
 * Jeffreys posterior, Beta(k + 1/2, n - k + 1/2), returned in percent.
 */
export function germinationPosterior(rng, observedPct, testSeeds) {
    const k = Math.round((observedPct / 100) * testSeeds);
    return 100 * sampleBeta(rng, k + 0.5, testSeeds - k + 0.5);
}

function summarize(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return {
        p10: percentileSorted(sorted, PERCENTILES.low),
        median: percentileSorted(sorted, PERCENTILES.mid),
        p90: percentileSorted(sorted, PERCENTILES.high)
    };
}

/** Draws of the user's inputs, shared by every determination. */
export function drawInputs({ moisturePct, moistureSpreadPct = 0, temperatureC, temperatureSpreadC = 0,
    initialViabilityPct, testSeeds = null, draws, seed }) {
    const rng = createSeededRandom(seed);
    const useTest = isNumber(testSeeds) && testSeeds >= 1;
    const out = [];
    for (let i = 0; i < draws; i += 1) {
        out.push({
            moisturePct: Math.max(0.1, uniform(rng, moisturePct - moistureSpreadPct, moisturePct + moistureSpreadPct)),
            temperatureC: uniform(rng, temperatureC - temperatureSpreadC, temperatureC + temperatureSpreadC),
            initialViabilityPct: useTest ? germinationPosterior(rng, initialViabilityPct, Math.round(testSeeds)) : initialViabilityPct
        });
    }
    return out;
}

/**
 * Run every determination of a species over the same draws. Each gets its own
 * P10, median and P90; nothing is pooled across determinations.
 */
export function runViabilityMonteCarlo(record, options = {}) {
    const {
        moisturePct, moistureSpreadPct = 0, temperatureC, temperatureSpreadC = 0,
        initialViabilityPct, testSeeds = null, targetViabilityPct,
        draws = MONTE_CARLO_LIMITS.drawsDefault, seed = MONTE_CARLO_LIMITS.seedDefault,
        curvePoints = 60, minHorizonDays = 0
    } = options;

    if (!record || !record.constants || !record.constants.length) return { ok: false, reason: "no-constants" };
    if (![moisturePct, temperatureC, initialViabilityPct, targetViabilityPct].every(isNumber)) {
        return { ok: false, reason: "inputs" };
    }

    const count = Math.round(Math.min(Math.max(isNumber(draws) ? draws : MONTE_CARLO_LIMITS.drawsDefault,
        MONTE_CARLO_LIMITS.drawsMin), MONTE_CARLO_LIMITS.drawsMax));
    const inputs = drawInputs({
        moisturePct, moistureSpreadPct: Math.max(0, moistureSpreadPct || 0),
        temperatureC, temperatureSpreadC: Math.max(0, temperatureSpreadC || 0),
        initialViabilityPct, testSeeds, draws: count, seed: isNumber(seed) ? seed : MONTE_CARLO_LIMITS.seedDefault
    });

    const determinations = record.constants.map((constants) => {
        const runs = [];
        const reasons = new Map();
        for (const draw of inputs) {
            const result = predictDetermination(constants, {
                scientificName: record.scientificName, ...draw, targetViabilityPct
            });
            if (result.ok) runs.push(result);
            else reasons.set(result.reason, (reasons.get(result.reason) || 0) + 1);
        }
        return {
            sourceKey: constants.sourceKey || null,
            constants,
            usable: runs.length,
            refused: count - runs.length,
            refusedReasons: [...reasons.entries()].map(([reason, n]) => ({ reason, count: n })),
            runs
        };
    });

    const usable = determinations.filter((entry) => entry.usable > 0);
    if (!usable.length) return { ok: false, reason: "refused", draws: count, determinations };

    // The band is taken on the probit scale and mapped through the normal CDF,
    // which is monotone, so each percentile is one evaluation of the CDF.
    // Out to where the median draw reaches 1% germination; the slowest draws run off the right edge.
    const horizon = Math.max(isNumber(minHorizonDays) ? minHorizonDays : 0,
        ...usable.map((entry) => percentile(entry.runs.map((run) =>
            Math.max(run.initialNed - nedFromPercent(1), 1) * run.sigmaDays), PERCENTILES.mid)));

    for (const entry of usable) {
        entry.daysToTarget = summarize(entry.runs.map((run) => run.daysToTarget));
        entry.daysToHalf = summarize(entry.runs.map((run) => run.daysToHalf));
        entry.band = [];
        for (let i = 0; i < curvePoints; i += 1) {
            const days = (horizon * i) / (curvePoints - 1);
            const neds = entry.runs.map((run) => run.initialNed - days / run.sigmaDays);
            const s = summarize(neds);
            entry.band.push({ days, p10: 100 * normalCdf(s.p10), median: 100 * normalCdf(s.median), p90: 100 * normalCdf(s.p90) });
        }
        entry.flags = [...new Set(entry.runs.flatMap((run) => run.flags.map((item) => item.code)))];
        delete entry.runs;
    }

    const span = (pick) => ({ low: Math.min(...usable.map(pick)), high: Math.max(...usable.map(pick)) });
    const refusedDraws = Math.max(...determinations.map((entry) => entry.refused));
    return {
        ok: true,
        draws: count,
        seed: isNumber(seed) ? seed : MONTE_CARLO_LIMITS.seedDefault,
        horizonDays: horizon,
        determinations,
        usableCount: usable.length,
        // Lowest P10 to highest P90 across determinations.
        daysToTarget: { low: span((entry) => entry.daysToTarget.p10).low, high: span((entry) => entry.daysToTarget.p90).high },
        medianDaysToTarget: span((entry) => entry.daysToTarget.median),
        refusedDraws,
        horizonYears: horizon / DAYS_PER_YEAR
    };
}
