// Work done at the same time, for the process flow mapper. Pure, no imports.
//
// A step whose exits are all taken at once is a split. Its branches have to
// meet again at one step, the join, which goes on only when every branch has
// arrived. Split, branches and join make a block. A branch has no way in or
// out except through the split and the join, so a block can be treated as one
// piece of the process: it takes as long as its slowest branch.

function reach(next, from, stop) {
    const seen = new Set();
    if (from === stop) return seen;
    seen.add(from);
    const stack = [from];
    while (stack.length) {
        for (const n of next[stack.pop()]) {
            if (n !== stop && !seen.has(n)) { seen.add(n); stack.push(n); }
        }
    }
    return seen;
}

/**
 * links: [{ source, target, parallel }].
 * Returns { blocks, problems }. A block is
 * { split, join, branches: [{ link, head, nodes: [index], links: [index] }], size },
 * smallest first, so a block inside another always comes before it. A branch's
 * links are the one that enters it and every one that leaves a step in it.
 * problems are { split, code } for a split whose branches cannot be a block.
 */
export function findBlocks(count, links) {
    const next = Array.from({ length: count }, () => []);
    const out = Array.from({ length: count }, () => []);
    links.forEach((link, i) => {
        next[link.source].push(link.target);
        out[link.source].push(i);
    });

    const blocks = [];
    const problems = [];
    for (let split = 0; split < count; split++) {
        const heads = out[split].filter((li) => links[li].parallel);
        if (heads.length < 2) continue;

        // The join is a step every branch reaches, with the branches sharing
        // nothing before it. Past that step they share it, so only one can fit.
        const everywhere = heads.map((li) => reach(next, links[li].target, -1));
        const candidates = [...everywhere[0]].filter((n) => n !== split && everywhere.every((set) => set.has(n)));
        let best = null;
        for (const join of candidates) {
            const sets = heads.map((li) => reach(next, links[li].target, join));
            if (sets.some((set) => set.size === 0 || set.has(split))) continue;
            const owner = new Map();
            let fits = true;
            sets.forEach((set, b) => {
                for (const n of set) {
                    // A step where work could end breaks the block.
                    if (out[n].length === 0) fits = false;
                    owner.set(n, b);
                }
            });
            // The only way into a branch is from the split, along that branch's
            // own exit. That also rules out a step two branches share.
            for (let li = 0; fits && li < links.length; li++) {
                const to = owner.get(links[li].target);
                if (to === undefined) continue;
                const from = owner.get(links[li].source);
                if (from !== to && li !== heads[to]) fits = false;
            }
            if (!fits) continue;
            best = { join, sets, size: sets.reduce((s, set) => s + set.size, 0) };
            break;
        }

        if (!best) {
            problems.push({ split, code: candidates.length ? 'PARALLEL_LEAKS' : 'PARALLEL_NO_JOIN' });
            continue;
        }
        blocks.push({
            split,
            join: best.join,
            size: best.size,
            branches: best.sets.map((set, b) => ({
                link: heads[b],
                head: links[heads[b]].target,
                nodes: [...set].sort((x, y) => x - y),
                links: [heads[b], ...[...set].flatMap((n) => out[n])].sort((x, y) => x - y)
            }))
        });
    }
    blocks.sort((a, b) => (a.size - b.size) || (a.split - b.split));
    return { blocks, problems };
}
