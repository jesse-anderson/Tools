// Seeded band over the per-paper fits. Draws are spread evenly over every
// pairing of a washout paper with a loading paper, so each pairing has exactly
// equal weight. A draw samples the half-life, refits the loading paper's slope
// at it, and keeps both papers as tags so each edge can name them.

import { createSeededRandom } from '../supplement_common/seeded-random.js';
import {
    buildSchedule, unitCurve, fitSlope, kdFromHalfLife, sampleHalfLife, responseFactor,
    responseCv, percentileSorted, carnosineGrams, triangular
} from './beta-alanine-engine.js';

// Rounded up to a whole number of draws per pairing.
export const DEFAULT_DRAWS = 2000;
export const DEFAULT_SEED = 20261114;
// An edge is the draws within this share of all draws either side of its percentile.
export const EDGE_WINDOW = 0.025;
// Papers making up less than this share of an edge are not named.
export const NAME_SHARE_MIN = 0.2;

/** Fit points grouped by paper, role fit only. */
export function loadingPapers(observations) {
    const byPaper = new Map();
    for (const o of observations) {
        if (o.role !== 'fit') continue;
        if (!byPaper.has(o.sourceId)) byPaper.set(o.sourceId, []);
        byPaper.get(o.sourceId).push({ schedule: o.schedule, day: o.day, rise: o.rise });
    }
    return [...byPaper.entries()].map(([sourceId, points]) => ({ sourceId, points }));
}

/**
 * Run the band. options: phases, washoutDays, observations, washouts,
 * draws, seed, individual (bool), muscle { centerKg, uncertainty }, wetToDry,
 * target (mmol/kg dm rise for days-to-target), normalVariation (mmol/kg dm).
 */
export function runBand(options) {
    const loading = options.loadingPapers || loadingPapers(options.observations);
    const washouts = options.washouts;
    const pairs = [];
    for (const w of washouts) for (const l of loading) pairs.push([w, l]);
    const perPair = Math.ceil(Math.max(50, Math.floor(options.draws || DEFAULT_DRAWS)) / pairs.length);
    const draws = perPair * pairs.length;
    // One stream per layer, so switching a layer on or off leaves the others' draws alone.
    const seed = options.seed ?? DEFAULT_SEED;
    const rngHalfLife = createSeededRandom(seed);
    const rngFactor = createSeededRandom((seed ^ 0x9e3779b9) >>> 0);
    const rngMuscle = createSeededRandom((seed ^ 0x85ebca6b) >>> 0);
    const { schedule, supplementDays } = buildSchedule(options.phases);
    const lastDay = Math.max(1, Math.round(supplementDays + Math.max(0, options.washoutDays || 0)));
    const cv = options.individual ? responseCv() : 0;
    const values = new Float64Array(draws * (lastDay + 1));
    const tags = [];
    const stopDay = Math.round(supplementDays);

    for (let i = 0; i < draws; i++) {
        const [w, l] = pairs[i % pairs.length];
        const halfLife = sampleHalfLife(w, rngHalfLife);
        const kd = kdFromHalfLife(halfLife);
        const slope = fitSlope(l.points, kd);
        const factor = cv > 0 ? responseFactor(cv, rngFactor) : 1;
        const muscleKg = options.muscle
            ? triangular(rngMuscle, options.muscle.centerKg * (1 - options.muscle.uncertainty), options.muscle.centerKg, options.muscle.centerKg * (1 + options.muscle.uncertainty))
            : 0;
        const curve = unitCurve(schedule, kd, lastDay);
        const scale = slope * factor;
        const row = i * (lastDay + 1);
        for (let d = 0; d <= lastDay; d++) values[row + d] = curve[d] * scale;
        tags.push({ washout: w.sourceId, loading: l.sourceId, halfLife, slope, factor, muscleKg });
    }

    const p10 = new Float64Array(lastDay + 1);
    const p50 = new Float64Array(lastDay + 1);
    const p90 = new Float64Array(lastDay + 1);
    const column = new Float64Array(draws);
    for (let d = 0; d <= lastDay; d++) {
        for (let i = 0; i < draws; i++) column[i] = values[i * (lastDay + 1) + d];
        const sorted = Float64Array.from(column).sort();
        p10[d] = percentileSorted(sorted, 0.1);
        p50[d] = percentileSorted(sorted, 0.5);
        p90[d] = percentileSorted(sorted, 0.9);
    }

    const band = { draws, lastDay, stopDay, supplementDays, values, tags, p10, p50, p90, individual: Boolean(options.individual) };
    band.summary = summarize(band, options);
    return band;
}

/** Value of one draw on one day. */
export function drawValue(band, i, day) {
    return band.values[i * (band.lastDay + 1) + day];
}

function summarize(band, options) {
    const { draws, stopDay, lastDay } = band;
    const target = options.target > 0 ? options.target : null;
    const normal = options.normalVariation > 0 ? options.normalVariation : 0;
    const atStop = [];
    const toTarget = [];
    const toNormal = [];
    const grams = [];
    let neverTarget = 0;
    let neverNormal = 0;
    for (let i = 0; i < draws; i++) {
        const stopValue = drawValue(band, i, stopDay);
        atStop.push(stopValue);
        if (target !== null) {
            let hit = -1;
            for (let d = 0; d <= stopDay; d++) if (drawValue(band, i, d) >= target) { hit = d; break; }
            if (hit >= 0) toTarget.push(hit); else neverTarget++;
        }
        let back = -1;
        for (let d = stopDay; d <= lastDay; d++) if (drawValue(band, i, d) < normal) { back = d - stopDay; break; }
        if (back >= 0) toNormal.push(back); else neverNormal++;
        if (options.muscle && options.wetToDry) grams.push(carnosineGrams(stopValue, band.tags[i].muscleKg, options.wetToDry));
    }
    const range = (arr) => {
        if (!arr.length) return null;
        const s = Float64Array.from(arr).sort();
        return { p10: percentileSorted(s, 0.1), p50: percentileSorted(s, 0.5), p90: percentileSorted(s, 0.9) };
    };
    return {
        riseAtStop: range(atStop),
        daysToTarget: range(toTarget),
        targetReachedShare: target !== null ? (draws - neverTarget) / draws : null,
        daysToNormal: range(toNormal),
        normalReachedShare: (draws - neverNormal) / draws,
        gramsGainAtStop: range(grams)
    };
}

/**
 * What makes an edge on a day: the draws ranked within EDGE_WINDOW of the
 * percentile, as shares by washout paper and by loading paper.
 */
export function attributeEdge(band, day, percentile) {
    const d = Math.max(0, Math.min(band.lastDay, Math.round(day)));
    const order = Array.from({ length: band.draws }, (_, i) => i)
        .sort((a, b) => drawValue(band, a, d) - drawValue(band, b, d));
    const from = Math.max(0, Math.floor((percentile - EDGE_WINDOW) * (band.draws - 1)));
    const to = Math.min(band.draws - 1, Math.ceil((percentile + EDGE_WINDOW) * (band.draws - 1)));
    const picked = order.slice(from, to + 1);
    const share = (key) => {
        const counts = new Map();
        for (const i of picked) counts.set(band.tags[i][key], (counts.get(band.tags[i][key]) || 0) + 1);
        return [...counts.entries()]
            .map(([sourceId, n]) => ({ sourceId, share: n / picked.length }))
            .sort((a, b) => b.share - a.share);
    };
    const washout = share('washout');
    const loading = share('loading');
    let factor = null;
    if (band.individual) {
        const f = picked.map((i) => band.tags[i].factor).sort((a, b) => a - b);
        factor = f[Math.floor(f.length / 2)];
    }
    return {
        day: d,
        percentile,
        count: picked.length,
        washout,
        loading,
        named: {
            washout: washout.filter((s) => s.share >= NAME_SHARE_MIN),
            loading: loading.filter((s) => s.share >= NAME_SHARE_MIN)
        },
        medianResponseFactor: factor
    };
}

/** Median curve of the draws using one paper (either role), for the legend lines. */
export function paperMedian(band, key, sourceId) {
    const members = [];
    for (let i = 0; i < band.draws; i++) if (band.tags[i][key] === sourceId) members.push(i);
    if (!members.length) return null;
    const out = new Float64Array(band.lastDay + 1);
    const column = new Float64Array(members.length);
    for (let d = 0; d <= band.lastDay; d++) {
        members.forEach((i, k) => { column[k] = drawValue(band, i, d) / band.tags[i].factor; });
        out[d] = percentileSorted(Float64Array.from(column).sort(), 0.5);
    }
    return out;
}
