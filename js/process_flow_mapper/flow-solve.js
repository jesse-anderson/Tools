// The calculation for the process flow mapper. Pure, no imports, no DOM.
//
// Steps are the states of an absorbing Markov chain and an exit's share is a
// transition probability. The expected number of passes through each step is
// the solution of (I - Q^T) v = w, where w is the share of work entering at
// each start. A step with no exit is an end, and its v is the share of work
// that finishes there.

const PIVOT_EPS = 1e-10;

/** Solve A x = b by Gaussian elimination with partial pivoting. Null when singular. */
export function solveLinear(A, b) {
    const n = b.length;
    const M = A.map((row, i) => [...row, b[i]]);
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let r = col + 1; r < n; r++) {
            if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
        }
        if (Math.abs(M[pivot][col]) < PIVOT_EPS) return null;
        if (pivot !== col) [M[pivot], M[col]] = [M[col], M[pivot]];
        for (let r = col + 1; r < n; r++) {
            const f = M[r][col] / M[col][col];
            if (f === 0) continue;
            for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
        }
    }
    const x = new Array(n).fill(0);
    for (let r = n - 1; r >= 0; r--) {
        let sum = M[r][n];
        for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c];
        x[r] = sum / M[r][r];
    }
    return x;
}

/** Expected passes through every step for the given exits and entry shares. Null when singular. */
export function expectedPasses(count, links, entry) {
    const A = Array.from({ length: count }, (_, i) => {
        const row = new Array(count).fill(0);
        row[i] = 1;
        return row;
    });
    for (const link of links) A[link.target][link.source] -= link.share;
    return solveLinear(A, entry);
}

function reachableFrom(count, links, seeds, reverse = false) {
    const next = Array.from({ length: count }, () => []);
    for (const link of links) {
        if (!(link.share > 0)) continue;
        if (reverse) next[link.target].push(link.source); else next[link.source].push(link.target);
    }
    const seen = new Set(seeds);
    const stack = [...seeds];
    while (stack.length) {
        for (const n of next[stack.pop()]) {
            if (!seen.has(n)) { seen.add(n); stack.push(n); }
        }
    }
    return seen;
}

/**
 * Solve a process.
 *
 * input: { count, links: [{ source, target, share, rework, handoff }],
 *          touch: [hours], wait: [hours], starts: [index], entry?: [share] }
 *
 * Returns { ok: false, code, nodes } when no figure can be given, otherwise
 * { ok: true, passes, touch, wait, lead, efficiency, yield, leadNoRework,
 *   reworkCost, handoffsPerUnit, stepsPerUnit, ends: [{ index, share }],
 *   perStep: [{ passes, touch, wait, lead, share }], traversals: [per link] }.
 */
export function solveFlow(input) {
    const { count, links, touch, wait, starts } = input;
    const fail = (code, nodes = []) => ({ ok: false, code, nodes });
    if (!starts.length) return fail('NO_START');

    const outCount = new Array(count).fill(0);
    for (const link of links) outCount[link.source] += 1;
    const endNodes = [];
    for (let i = 0; i < count; i++) if (outCount[i] === 0) endNodes.push(i);

    const reached = reachableFrom(count, links, starts);
    const reachedEnds = endNodes.filter((i) => reached.has(i));
    if (!reachedEnds.length) return fail('NO_END');

    // Work that can reach a step with no way on to any end circulates for ever.
    const finishes = reachableFrom(count, links, reachedEnds, true);
    const trapped = [...reached].filter((i) => !finishes.has(i));
    if (trapped.length) return fail('NEVER_ENDS', trapped);

    const entry = new Array(count).fill(0);
    if (input.entry) {
        const total = starts.reduce((s, i) => s + input.entry[i], 0);
        for (const i of starts) entry[i] = total > 0 ? input.entry[i] / total : 1 / starts.length;
    } else {
        for (const i of starts) entry[i] = 1 / starts.length;
    }

    // Steps no start leads to carry no work, and a loop among them must not spoil the solve.
    const live = links.filter((l) => reached.has(l.source));
    const passes = expectedPasses(count, live, entry);
    if (!passes || passes.some((v) => !Number.isFinite(v))) return fail('NEVER_ENDS');

    // First-pass yield: the work that reaches an end having taken no rework exit.
    const forward = live.filter((l) => !l.rework);
    const clean = expectedPasses(count, forward, entry);
    const firstPass = endNodes.reduce((s, i) => s + clean[i], 0);

    // The same process had no rework exit ever been taken: the forward exits
    // of each step scaled back up to all of the work leaving it.
    const forwardOut = new Array(count).fill(0);
    for (const l of forward) forwardOut[l.source] += l.share;
    const rescaled = forward.map((l) => ({ ...l, share: forwardOut[l.source] > 0 ? l.share / forwardOut[l.source] : 0 }));
    const ideal = expectedPasses(count, rescaled, entry);

    const sum = (v, key) => v.reduce((s, p, i) => s + p * key[i], 0);
    const touchTotal = sum(passes, touch);
    const waitTotal = sum(passes, wait);
    const lead = touchTotal + waitTotal;
    const leadNoRework = sum(ideal, touch) + sum(ideal, wait);

    const traversals = links.map((l) => passes[l.source] * l.share);
    return {
        ok: true,
        passes,
        touch: touchTotal,
        wait: waitTotal,
        lead,
        efficiency: lead > 0 ? touchTotal / lead : null,
        yield: Math.min(1, Math.max(0, firstPass)),
        leadNoRework,
        reworkCost: Math.max(0, lead - leadNoRework),
        handoffsPerUnit: links.reduce((s, l, i) => s + (l.handoff ? traversals[i] : 0), 0),
        // Ends are where work stops, not steps it passes through.
        stepsPerUnit: passes.reduce((s, p, i) => s + (outCount[i] > 0 ? p : 0), 0),
        ends: endNodes.map((i) => ({ index: i, share: passes[i] })),
        perStep: passes.map((p, i) => {
            const t = p * touch[i];
            const w = p * wait[i];
            return { passes: p, touch: t, wait: w, lead: t + w, share: lead > 0 ? (t + w) / lead : 0 };
        }),
        traversals
    };
}
