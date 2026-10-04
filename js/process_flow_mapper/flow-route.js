// Connector routing for the process flow mapper. Pure, no DOM.
//
// Steps sit in a grid of cells. Right of every column is a vertical gutter and
// above every row a horizontal one, and a connector travels only in gutters,
// so it can never pass under a step. This file decides, in grid terms, which
// gutters each connector uses and which track it gets inside them. Turning
// that into pixels is the layout's job.
//
// Three shapes:
//   straight  same row, nothing between: one horizontal line.
//   direct    next column, another row: out, along the gutter, in.
//   general   everything else, rework included: out, along the column gutter
//             to a row gutter, along that, along the target's column gutter, in.
//
// A vertical gutter has three zones, left to right: tracks of general
// connectors leaving the column, direct tracks, tracks of general connectors
// arriving at the next column. That order is what keeps a stub leaving one
// step from lying on a stub entering the step beside it.

/** Give each closed interval the lowest track on which it overlaps nothing. */
export function assignTracks(intervals) {
    const order = intervals.map((_, i) => i).sort((a, b) => (intervals[a][0] - intervals[b][0]) || (a - b));
    const ends = [];
    const track = new Array(intervals.length).fill(0);
    for (const i of order) {
        let t = ends.findIndex((end) => end < intervals[i][0]);
        if (t < 0) { t = ends.length; ends.push(-Infinity); }
        ends[t] = intervals[i][1];
        track[i] = t;
    }
    return { track, count: ends.length };
}

// Grid positions on one axis: a row or column center is odd, a gutter even.
const center = (i) => 2 * i + 1;
const gutterAbove = (row) => 2 * row;
const gutterRight = (col) => 2 * col + 2;

/**
 * steps: [{ col, row }], links: [{ source, target, rework }].
 * Returns { routes, vertical, horizontal }.
 * routes[i] is { kind, gutter?, track?, hGutter?, hTrack?, depGutter?,
 * depTrack?, arrGutter?, arrTrack? }. vertical[c + 1] holds the track counts
 * { dep, direct, arr } of the gutter right of column c (c = -1 is left of the
 * first column). horizontal[g] is the track count of the gutter above row g.
 */
export function routeLinks(steps, links, cols, rows) {
    const occupied = new Set(steps.map((s) => `${s.row},${s.col}`));
    const routes = links.map((link) => {
        const s = steps[link.source];
        const t = steps[link.target];
        if (s.row === t.row && t.col > s.col && !link.rework) {
            let clear = true;
            for (let c = s.col + 1; c < t.col; c++) if (occupied.has(`${s.row},${c}`)) clear = false;
            if (clear) return { kind: 'straight' };
        }
        if (t.col === s.col + 1 && s.row !== t.row) return { kind: 'direct', gutter: s.col };
        return { kind: 'general' };
    });

    // Direct connectors in one gutter need an order: L goes left of M when M
    // arrives at the row L leaves from. A cycle has no such order, so one of
    // its members is routed the long way instead.
    for (let c = -1; c < cols; c++) {
        let direct = links.map((_, i) => i).filter((i) => routes[i].kind === 'direct' && routes[i].gutter === c);
        for (;;) {
            const before = new Map(direct.map((i) => [i, 0]));
            const after = new Map(direct.map((i) => [i, []]));
            for (const l of direct) {
                for (const m of direct) {
                    if (l !== m && steps[links[m].target].row === steps[links[l].source].row) {
                        after.get(l).push(m);
                        before.set(m, before.get(m) + 1);
                    }
                }
            }
            const order = [];
            const ready = direct.filter((i) => before.get(i) === 0);
            while (ready.length) {
                const i = ready.shift();
                order.push(i);
                for (const m of after.get(i)) {
                    before.set(m, before.get(m) - 1);
                    if (before.get(m) === 0) ready.push(m);
                }
            }
            if (order.length === direct.length) {
                order.forEach((i, track) => { routes[i].track = track; });
                break;
            }
            const stuck = direct.filter((i) => !order.includes(i));
            routes[stuck[0]] = { kind: 'general' };
            direct = direct.filter((i) => i !== stuck[0]);
        }
    }

    // General connectors: pick the row gutter beside the target row.
    const general = [];
    links.forEach((link, i) => {
        if (routes[i].kind !== 'general') return;
        const s = steps[link.source];
        const t = steps[link.target];
        let g;
        if (t.row > s.row) g = t.row;
        else if (t.row < s.row) g = t.row + 1;
        else g = link.rework ? s.row + 1 : s.row;
        Object.assign(routes[i], { hGutter: g, depGutter: s.col, arrGutter: t.col - 1 });
        general.push(i);
    });

    const span = (a, b) => [Math.min(a, b), Math.max(a, b)];
    const group = (keyOf, intervalOf, assign) => {
        const groups = new Map();
        for (const i of general) {
            const key = keyOf(i);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(i);
        }
        const counts = new Map();
        for (const [key, members] of groups) {
            const { track, count } = assignTracks(members.map(intervalOf));
            members.forEach((i, k) => assign(i, track[k]));
            counts.set(key, count);
        }
        return counts;
    };

    const dep = group(
        (i) => routes[i].depGutter,
        (i) => span(center(steps[links[i].source].row), gutterAbove(routes[i].hGutter)),
        (i, t) => { routes[i].depTrack = t; }
    );
    const arr = group(
        (i) => routes[i].arrGutter,
        (i) => span(gutterAbove(routes[i].hGutter), center(steps[links[i].target].row)),
        (i, t) => { routes[i].arrTrack = t; }
    );
    const hor = group(
        (i) => routes[i].hGutter,
        (i) => span(gutterRight(routes[i].depGutter), gutterRight(routes[i].arrGutter)),
        (i, t) => { routes[i].hTrack = t; }
    );

    const vertical = [];
    for (let c = -1; c < cols; c++) {
        const direct = routes.filter((r) => r.kind === 'direct' && r.gutter === c).length;
        vertical.push({ dep: dep.get(c) || 0, direct, arr: arr.get(c) || 0 });
    }
    const horizontal = [];
    for (let g = 0; g <= rows; g++) horizontal.push(hor.get(g) || 0);

    return { routes, vertical, horizontal };
}
