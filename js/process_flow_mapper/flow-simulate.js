// Seeded simulation for the process flow mapper. Pure, no imports, no DOM.
//
// The solve gives averages. This walks units of work through the same map one
// at a time, so it can say how lead time is spread: the median, and the time
// most units finish within. A time given as a range is drawn from it; a fixed
// time stays fixed, so with no ranges the spread is what branching and rework
// cause and nothing more.

export const SIM_DEFAULTS = Object.freeze({ units: 20000, seed: 1, maxVisits: 3000000, bins: 24 });

/** Small seeded generator, uniform on [0, 1). */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * One draw of a time. spread null is the fixed time. { low, high } is even
 * between the two. { low, mode, high } is a triangle peaking at mode.
 */
export function sampleTime(fixed, spread, rng) {
    if (!spread) return fixed;
    const { low, mode, high } = spread;
    const u = rng();
    if (!(high > low)) return low;
    if (mode === null) return low + u * (high - low);
    const cut = (mode - low) / (high - low);
    return u < cut
        ? low + Math.sqrt(u * (high - low) * (mode - low))
        : high - Math.sqrt((1 - u) * (high - low) * (high - mode));
}

/** The value a share p of a sorted list is at or below: the nearest rank, so it is always a value that occurred. */
export function quantile(sorted, p) {
    if (!sorted.length) return NaN;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

/**
 * input: { count, links: [{ source, target, share, wait?, waitSpread? }],
 *          touch, wait, touchSpread?, waitSpread?, starts, blocks? }
 * options: { units, seed, maxVisits }.
 *
 * Returns { ok, units, seed, cut, lead: sorted Float64Array, mean, min, max,
 *           ends: [{ index, count, lead: sorted Float64Array }] }.
 * cut is true when the visit budget ran out before every unit was walked.
 */
export function simulate(input, options = {}) {
    const { count, links, touch, wait, starts } = input;
    const units = Math.max(1, Math.floor(options.units || SIM_DEFAULTS.units));
    const seed = Number.isFinite(options.seed) ? Math.floor(options.seed) : SIM_DEFAULTS.seed;
    const maxVisits = options.maxVisits || SIM_DEFAULTS.maxVisits;
    const rng = mulberry32(seed);
    const touchSpread = input.touchSpread || [];
    const waitSpread = input.waitSpread || [];

    const out = Array.from({ length: count }, () => []);
    links.forEach((link, i) => out[link.source].push(i));
    const blockAt = new Map((input.blocks || []).map((b) => [b.split, b]));
    const onWay = (i) => sampleTime(links[i].wait || 0, links[i].waitSpread || null, rng);

    let visits = 0;
    let endedAt = -1;
    // Walk from a step until work ends or reaches stopAt. Returns the time taken, or -1 when cut short.
    const walk = (from, stopAt) => {
        let node = from;
        let t = 0;
        for (;;) {
            if (node === stopAt) return t;
            visits += 1;
            if (visits > maxVisits) return -1;
            t += sampleTime(touch[node], touchSpread[node] || null, rng) + sampleTime(wait[node], waitSpread[node] || null, rng);
            const exits = out[node];
            if (!exits.length) { endedAt = node; return t; }
            const block = blockAt.get(node);
            if (block) {
                // Every branch runs, and the work goes on when the slowest arrives.
                let slowest = 0;
                for (const branch of block.branches) {
                    const first = onWay(branch.link);
                    const rest = walk(branch.head, block.join);
                    if (rest < 0) return -1;
                    slowest = Math.max(slowest, first + rest);
                }
                t += slowest;
                node = block.join;
                continue;
            }
            let pick = exits[exits.length - 1];
            if (exits.length > 1) {
                let u = rng();
                for (const i of exits) {
                    u -= links[i].share;
                    if (u < 0) { pick = i; break; }
                }
            }
            t += onWay(pick);
            node = links[pick].target;
        }
    };

    const lead = new Float64Array(units);
    const byEnd = new Map();
    let done = 0;
    for (; done < units && starts.length; done++) {
        const start = starts.length === 1 ? starts[0] : starts[Math.floor(rng() * starts.length)];
        endedAt = -1;
        const t = walk(start, -1);
        if (t < 0) break;
        lead[done] = t;
        if (!byEnd.has(endedAt)) byEnd.set(endedAt, []);
        byEnd.get(endedAt).push(t);
    }
    if (done === 0) return { ok: false, units: 0, seed, cut: true, lead: new Float64Array(0), mean: NaN, min: NaN, max: NaN, ends: [] };

    const sorted = lead.slice(0, done).sort();
    let sum = 0;
    for (const t of sorted) sum += t;
    return {
        ok: true,
        units: done,
        seed,
        cut: done < units,
        lead: sorted,
        mean: sum / done,
        min: sorted[0],
        max: sorted[done - 1],
        ends: [...byEnd.entries()].sort((a, b) => a[0] - b[0]).map(([index, times]) => ({ index, count: times.length, lead: Float64Array.from(times).sort() }))
    };
}

/**
 * Counts for a histogram of sorted values from the lowest to the value 99 in
 * 100 are within, the last bin taking everything above. Returns
 * { from, to, counts }, or null when every value is the same.
 */
export function histogram(sorted, bins = SIM_DEFAULTS.bins) {
    if (!sorted.length) return null;
    const from = sorted[0];
    let to = quantile(sorted, 0.99);
    if (!(to > from)) to = sorted[sorted.length - 1];
    if (!(to > from)) return null;
    const counts = new Array(bins).fill(0);
    for (const v of sorted) counts[Math.min(bins - 1, Math.floor(((v - from) / (to - from)) * bins))] += 1;
    return { from, to, counts };
}
