// The calculation for the process flow mapper. Pure, no imports, no DOM.
//
// Steps are the states of an absorbing Markov chain and an exit's share is a
// transition probability. The expected number of passes through each step is
// the solution of (I - Q^T) v = w, where w is the share of work entering at
// each start. A step with no exit is an end, and its v is the share of work
// that finishes there.
//
// Work done at the same time comes in as blocks (see flow-parallel.js). Every
// branch of a block carries all of the work, so the step where they meet
// counts each arrival as one part in as many as there are branches. A block
// takes as long as its slowest branch does on average, and the steps on the
// others have slack.

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
 * input: { count, links: [{ source, target, share, rework, handoff, wait? }],
 *          touch: [hours], wait: [hours], starts: [index], entry?: [share],
 *          blocks?: from findBlocks, blocked?: [index] of splits that are no block }
 *
 * Returns { ok: false, code, nodes } when no figure can be given, otherwise
 * { ok: true, passes, touch, touchPath, wait, lead, efficiency, yield,
 *   leadNoRework, reworkCost, handoffsPerUnit, stepsPerUnit,
 *   ends: [{ index, share }], traversals: [per link],
 *   perStep: [{ passes, touch, wait, lead, share, critical, slack }],
 *   blocks: [{ split, join, spans: [hours], longest }] }.
 * touch is all the work done; touchPath and wait are along the longest path,
 * and add up to lead. With no work done at the same time the two are equal.
 */
export function solveFlow(input) {
    const { count, links, touch, wait, starts } = input;
    const blocks = input.blocks || [];
    const fail = (code, nodes = []) => ({ ok: false, code, nodes });
    if (!starts.length) return fail('NO_START');
    if (input.blocked && input.blocked.length) return fail('PARALLEL', input.blocked);

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

    const share = links.map((l) => l.share);
    const onWay = links.map((l) => l.wait || 0);
    // Where branches meet, each arrival is one part of the work coming back together.
    const joinWeight = links.map(() => 1);
    for (const block of blocks) {
        for (const branch of block.branches) {
            for (const i of branch.links) {
                if (i !== branch.link && links[i].target === block.join) joinWeight[i] /= block.branches.length;
            }
        }
    }
    const flows = (indices, shares, weight) => indices.map((i) => ({ source: links[i].source, target: links[i].target, share: shares[i] * weight[i] }));

    // Steps no start leads to carry no work, and a loop among them must not spoil the solve.
    const live = links.map((_, i) => i).filter((i) => reached.has(links[i].source));
    const passes = expectedPasses(count, flows(live, share, joinWeight), entry);
    if (!passes || passes.some((v) => !Number.isFinite(v))) return fail('NEVER_ENDS');

    // First-pass yield: the work that reaches an end having taken no rework
    // exit. A block is clean only when every branch is, so the chance is the
    // product over its branches, worked out for inner blocks first.
    const forward = live.filter((i) => !links[i].rework);
    const cleanWeight = links.map(() => 1);
    for (const block of blocks) {
        const chance = block.branches.map((branch) => {
            const inside = new Set(branch.nodes);
            const own = forward.filter((i) => inside.has(links[i].source));
            const start = new Array(count).fill(0);
            start[branch.head] = 1;
            const v = expectedPasses(count, flows(own, share, cleanWeight), start);
            if (!v) return 0;
            return own.reduce((s, i) => s + (links[i].target === block.join ? v[links[i].source] * share[i] * cleanWeight[i] : 0), 0);
        });
        block.branches.forEach((branch, k) => {
            const others = chance.reduce((s, q, m) => (m === k ? s : s * q), 1);
            for (const i of branch.links) {
                if (i !== branch.link && links[i].target === block.join) cleanWeight[i] *= others / block.branches.length;
            }
        });
    }
    const clean = expectedPasses(count, flows(forward, share, cleanWeight), entry);
    const firstPass = endNodes.reduce((s, i) => s + clean[i], 0);

    // Time along the longest path. Inside a block only the slowest branch
    // counts, and every step on another branch has the difference as slack.
    const pathTimes = (v, shares) => {
        const stepTime = v.map((p, i) => p * (touch[i] + wait[i]));
        const linkTime = links.map((l, i) => v[l.source] * shares[i] * onWay[i]);
        const stepOn = new Array(count).fill(true);
        const linkOn = links.map(() => true);
        const slack = new Array(count).fill(0);
        const spans = [];
        for (const block of blocks) {
            const entries = v[block.split];
            if (!(entries > 0)) continue;
            const span = block.branches.map((branch) => (
                branch.nodes.reduce((s, n) => s + (stepOn[n] ? stepTime[n] : 0), 0)
                + branch.links.reduce((s, i) => s + (linkOn[i] ? linkTime[i] : 0), 0)
            ) / entries);
            const longest = span.indexOf(Math.max(...span));
            block.branches.forEach((branch, k) => {
                if (k === longest) return;
                for (const n of branch.nodes) { stepOn[n] = false; slack[n] += span[longest] - span[k]; }
                for (const i of branch.links) linkOn[i] = false;
            });
            spans.push({ split: block.split, join: block.join, spans: span, longest });
        }
        const lead = stepTime.reduce((s, t, i) => s + (stepOn[i] ? t : 0), 0) + linkTime.reduce((s, t, i) => s + (linkOn[i] ? t : 0), 0);
        return { lead, stepOn, linkOn, linkTime, slack, spans };
    };

    // The same process had no rework ever been needed: the forward exits of
    // each step scaled back up to all of the work leaving it. An exit that
    // leads only to rework, such as one to a step whose way on is the return,
    // is left out with the rework, or the work sent there would just vanish.
    const cleanly = reachableFrom(count, forward.map((i) => links[i]), endNodes, true);
    const kept = forward.filter((i) => links[i].parallel || cleanly.has(links[i].target));
    const forwardOut = new Array(count).fill(0);
    for (const i of kept) if (!links[i].parallel) forwardOut[links[i].source] += share[i];
    const keptSet = new Set(kept);
    const idealShare = links.map((l, i) => {
        if (!keptSet.has(i)) return 0;
        if (l.parallel) return 1;
        return forwardOut[l.source] > 0 ? share[i] / forwardOut[l.source] : 0;
    });
    const ideal = expectedPasses(count, flows(kept, idealShare, joinWeight), entry);
    const leadNoRework = pathTimes(ideal, idealShare).lead;

    const path = pathTimes(passes, share);
    const { lead } = path;
    const touchTotal = passes.reduce((s, p, i) => s + p * touch[i], 0);
    const touchPath = passes.reduce((s, p, i) => s + (path.stepOn[i] ? p * touch[i] : 0), 0);

    // A wait on the way to a step is counted with that step.
    const arriving = new Array(count).fill(0);
    const arrivingOn = new Array(count).fill(0);
    links.forEach((l, i) => {
        arriving[l.target] += path.linkTime[i];
        if (path.linkOn[i]) arrivingOn[l.target] += path.linkTime[i];
    });

    const traversals = links.map((l, i) => passes[l.source] * share[i]);
    return {
        ok: true,
        passes,
        touch: touchTotal,
        touchPath,
        wait: lead - touchPath,
        lead,
        efficiency: lead > 0 ? touchPath / lead : null,
        yield: Math.min(1, Math.max(0, firstPass)),
        leadNoRework,
        reworkCost: Math.max(0, lead - leadNoRework),
        handoffsPerUnit: links.reduce((s, l, i) => s + (l.handoff ? traversals[i] : 0), 0),
        // Ends are where work stops, not steps it passes through.
        stepsPerUnit: passes.reduce((s, p, i) => s + (outCount[i] > 0 ? p : 0), 0),
        ends: endNodes.map((i) => ({ index: i, share: passes[i] })),
        perStep: passes.map((p, i) => {
            const t = p * touch[i];
            const w = p * wait[i] + arriving[i];
            const counted = (path.stepOn[i] ? p * (touch[i] + wait[i]) : 0) + arrivingOn[i];
            return { passes: p, touch: t, wait: w, lead: t + w, share: lead > 0 ? counted / lead : 0, critical: path.stepOn[i], slack: path.slack[i] };
        }),
        blocks: path.spans,
        traversals
    };
}
