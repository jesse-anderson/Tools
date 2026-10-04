// The calculation for the process flow mapper. Pure, no imports, no DOM.
//
// Steps are the states of an absorbing Markov chain and an exit's share is a
// transition probability. The expected number of passes through each step is
// the solution of (I - Q^T) v = w, where w is the share of work entering at
// each start. A step with no exit is an end, and its v is the share of work
// that finishes there.
//
// Work done at the same time comes in as blocks (see flow-parallel.js). Every
// branch of a block carries all of the work and runs until it reaches the
// step where they meet or an end of its own; nothing is called back. Work
// goes past the meeting step only if every branch got there, so each arrival
// there is weighted by the chance the other branches arrive too, over the
// number of branches. A block takes as long as its slowest branch does on
// average, and the steps on the others have slack.

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
 *   perStep: [{ passes, touch, wait, lead, share, critical, slack, ends }],
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
    const isEnd = (n) => outCount[n] === 0;
    const flows = (indices, shares, weight) => indices.map((i) => ({ source: links[i].source, target: links[i].target, share: shares[i] * weight[i] }));

    /**
     * How the blocks put work back together, for one reading of the exits:
     * the links that may be taken and their shares. weight is per link, for
     * the arrivals where branches meet. endScale is per step: an end inside a
     * branch counts a unit only if no branch written before it stopped the
     * unit first, so a unit two branches both stop is counted once. Inner
     * blocks come first, so an outer branch sees them already weighted.
     */
    const blockWeights = (usable, shares) => {
        const weight = links.map(() => 1);
        const endScale = new Array(count).fill(1);
        const allowed = new Set(usable);
        for (const block of blocks) {
            const outcome = block.branches.map((branch) => {
                if (!allowed.has(branch.link)) return { reach: 0, stop: 0 };
                // A branch straight to the meeting step is a wait and always arrives.
                if (!branch.nodes.length) return { reach: 1, stop: 1 };
                const at = new Map(branch.nodes.map((n, k) => [n, k]));
                const own = usable.filter((i) => at.has(links[i].source));
                const A = branch.nodes.map((_, r) => branch.nodes.map((__, c) => (r === c ? 1 : 0)));
                for (const i of own) {
                    if (at.has(links[i].target)) A[at.get(links[i].target)][at.get(links[i].source)] -= shares[i] * weight[i];
                }
                const b = branch.nodes.map((n) => (n === branch.head ? 1 : 0));
                const v = solveLinear(A, b);
                if (!v) return { reach: 0, stop: 0 };
                const reach = own.reduce((t, i) => t + (links[i].target === block.join ? v[at.get(links[i].source)] * shares[i] * weight[i] : 0), 0);
                const ended = branch.nodes.reduce((t, n) => t + (isEnd(n) ? v[at.get(n)] * endScale[n] : 0), 0);
                return { reach, stop: reach + ended };
            });
            const K = block.branches.length;
            block.branches.forEach((branch, k) => {
                const others = outcome.reduce((t, o, j) => (j === k ? t : t * o.reach), 1);
                for (const i of branch.links) {
                    if (links[i].target === block.join) weight[i] *= others / K;
                }
                // Branches written before this one got to the meeting step; those after stopped somewhere.
                const first = outcome.reduce((t, o, j) => (j < k ? t * o.reach : j > k ? t * o.stop : t), 1);
                for (const n of branch.nodes) if (isEnd(n)) endScale[n] *= first;
            });
        }
        return { weight, endScale };
    };

    // Steps no start leads to carry no work, and a loop among them must not spoil the solve.
    const live = links.map((_, i) => i).filter((i) => reached.has(links[i].source));
    const actual = blockWeights(live, share);
    const passes = expectedPasses(count, flows(live, share, actual.weight), entry);
    if (!passes || passes.some((v) => !Number.isFinite(v))) return fail('NEVER_ENDS');

    // First-pass yield: the work that reaches an end having taken no rework
    // exit anywhere. Through a block that needs every branch clean, which is
    // the same weighting read with the rework exits cut.
    const forward = live.filter((i) => !links[i].rework);
    const cleanRead = blockWeights(forward, share);
    const clean = expectedPasses(count, flows(forward, share, cleanRead.weight), entry);
    const firstPass = endNodes.reduce((t, i) => t + clean[i] * cleanRead.endScale[i], 0);

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
    const idealRead = blockWeights(kept, idealShare);
    const ideal = expectedPasses(count, flows(kept, idealShare, idealRead.weight), entry);
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
        ends: endNodes.filter((i) => reached.has(i)).map((i) => ({ index: i, share: passes[i] * actual.endScale[i] })),
        perStep: passes.map((p, i) => {
            const t = p * touch[i];
            const w = p * wait[i] + arriving[i];
            const counted = (path.stepOn[i] ? p * (touch[i] + wait[i]) : 0) + arrivingOn[i];
            return {
                passes: p, touch: t, wait: w, lead: t + w, share: lead > 0 ? counted / lead : 0, critical: path.stepOn[i], slack: path.slack[i],
                // The share of work that finishes here, counted once however many branches stop it.
                ends: isEnd(i) ? p * actual.endScale[i] : 0
            };
        }),
        blocks: path.spans,
        traversals
    };
}
