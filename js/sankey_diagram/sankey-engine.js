// Graph, balance and layout for the Sankey diagram builder. Pure, no DOM.
//
// One scale (ky, pixels per unit of flow) is shared by every node and link, so
// a width on the diagram always means the same quantity.

export const DEFAULTS = Object.freeze({
    width: 960,
    height: 540,
    nodeWidth: 16,
    nodePadding: 18,
    align: 'justify',
    iterations: 32,
    margin: 16,
    titleHeight: 0,
    footnoteHeight: 0,
    tolerance: 0.005
});

export const LIMITS = Object.freeze({
    width: [320, 2400],
    height: [200, 1800],
    nodeWidth: [4, 60],
    nodePadding: [2, 80],
    tolerance: [0, 0.25]
});

// Below this drawn width a ribbon is not visibly a ribbon, so it is flagged.
export const HAIRLINE_PX = 1;

// Recycle streams loop under the diagram. Turn radius, the straight run out of
// a node, the clearance under the lowest node, and the gap between lanes.
const RECYCLE = Object.freeze({ radius: 8, run: 4, clearance: 22, laneGap: 4, maxBandShare: 0.35, maxInsetShare: 0.2 });

/**
 * Build nodes and links from parsed flows. Repeated source/target pairs are
 * summed and reported. A flow that closes a loop is kept and marked as a
 * recycle: the line that closes the loop is the one drawn as the return, so
 * typing order decides which stream that is.
 */
export function buildGraph(flows) {
    const warnings = [];
    const nodes = [];
    const byName = new Map();
    const links = [];
    const byPair = new Map();
    const forward = [];

    const nodeFor = (name) => {
        if (!byName.has(name)) {
            byName.set(name, nodes.length);
            nodes.push({ index: nodes.length, name, inLinks: [], outLinks: [], inflow: 0, outflow: 0 });
            forward.push([]);
        }
        return byName.get(name);
    };

    // Whether `to` can be reached from `from` along the forward links so far.
    const reaches = (from, to) => {
        const seen = new Set([from]);
        const stack = [from];
        while (stack.length) {
            const n = stack.pop();
            if (n === to) return true;
            for (const t of forward[n]) {
                if (!seen.has(t)) { seen.add(t); stack.push(t); }
            }
        }
        return false;
    };

    for (const flow of flows) {
        const source = nodeFor(flow.source);
        const target = nodeFor(flow.target);
        const key = `${source}>${target}`;
        if (byPair.has(key)) {
            const link = links[byPair.get(key)];
            link.value += flow.value;
            link.lines.push(flow.line);
            continue;
        }
        const recycle = reaches(target, source);
        if (!recycle) forward[source].push(target);
        byPair.set(key, links.length);
        links.push({ index: links.length, source, target, value: flow.value, lines: [flow.line], recycle });
    }

    for (const link of links) {
        nodes[link.source].outLinks.push(link.index);
        nodes[link.target].inLinks.push(link.index);
        nodes[link.source].outflow += link.value;
        nodes[link.target].inflow += link.value;
        const pair = `${nodes[link.source].name} to ${nodes[link.target].name}`;
        if (link.lines.length > 1) {
            warnings.push({
                line: link.lines[link.lines.length - 1],
                code: 'DUPLICATE_SUMMED',
                message: `${pair} appears on lines ${link.lines.join(', ')} and was summed to one flow`
            });
        }
        if (link.recycle) {
            warnings.push({
                line: link.lines[0],
                code: 'RECYCLE',
                message: `${pair} closes a loop, so it is drawn as a recycle stream under the diagram. Move the line earlier to make a different flow the return`
            });
        }
    }

    return { ok: true, nodes, links, errors: [], warnings };
}

const withinTolerance = (a, b, tolerance) => {
    const scale = Math.max(Math.abs(a), Math.abs(b));
    // The 1e-9 floor absorbs float noise such as 0.1 + 0.2 at zero tolerance.
    return Math.abs(a - b) <= Math.max(tolerance, 1e-9) * scale;
};

/**
 * Mass balance. A node with nothing entering is a system input, a node with
 * nothing leaving is a system output, and every other node should pass on
 * what it receives. residual is inflow minus outflow. Recycle streams count
 * like any other flow.
 */
export function computeBalance(graph, options = {}) {
    const tolerance = clamp(numberOr(options.tolerance, DEFAULTS.tolerance), LIMITS.tolerance);
    let totalIn = 0;
    let totalOut = 0;
    let internalResidual = 0;

    const nodes = graph.nodes.map((node) => {
        const role = node.inLinks.length === 0 ? 'input' : (node.outLinks.length === 0 ? 'output' : 'internal');
        let residual = 0;
        let balanced = true;
        let exact = true;
        if (role === 'input') totalIn += node.outflow;
        if (role === 'output') totalOut += node.inflow;
        if (role === 'internal') {
            residual = node.inflow - node.outflow;
            balanced = withinTolerance(node.inflow, node.outflow, tolerance);
            exact = withinTolerance(node.inflow, node.outflow, 0);
            internalResidual += residual;
        }
        const through = Math.max(node.inflow, node.outflow);
        return {
            index: node.index,
            name: node.name,
            role,
            inflow: node.inflow,
            outflow: node.outflow,
            residual,
            relative: through > 0 ? residual / through : 0,
            balanced,
            // Balanced only because the tolerance allows it: worth saying so.
            tolerated: balanced && !exact
        };
    });

    const unbalanced = nodes.filter((n) => !n.balanced);
    const closes = withinTolerance(totalIn, totalOut, tolerance);
    return {
        tolerance,
        nodes,
        totalIn,
        totalOut,
        residual: totalIn - totalOut,
        // Equal to residual by construction; kept separate so a test can prove it.
        internalResidual,
        closure: totalIn > 0 ? totalOut / totalIn : 0,
        closes,
        closesExactly: withinTolerance(totalIn, totalOut, 0),
        unbalanced,
        tolerated: nodes.filter((n) => n.tolerated),
        balanced: closes && unbalanced.length === 0
    };
}

function numberOr(value, fallback) {
    const n = Number(value);
    return value === null || value === undefined || value === '' || !Number.isFinite(n) ? fallback : n;
}

function clamp(value, [lo, hi]) {
    return Math.min(hi, Math.max(lo, value));
}

/** Coerce layout options, clamping each to its limit. */
export function resolveOptions(options = {}) {
    return {
        width: clamp(numberOr(options.width, DEFAULTS.width), LIMITS.width),
        height: clamp(numberOr(options.height, DEFAULTS.height), LIMITS.height),
        nodeWidth: clamp(numberOr(options.nodeWidth, DEFAULTS.nodeWidth), LIMITS.nodeWidth),
        nodePadding: clamp(numberOr(options.nodePadding, DEFAULTS.nodePadding), LIMITS.nodePadding),
        align: options.align === 'left' ? 'left' : 'justify',
        iterations: Math.round(clamp(numberOr(options.iterations, DEFAULTS.iterations), [0, 200])),
        margin: clamp(numberOr(options.margin, DEFAULTS.margin), [0, 200]),
        titleHeight: clamp(numberOr(options.titleHeight, DEFAULTS.titleHeight), [0, 200]),
        footnoteHeight: clamp(numberOr(options.footnoteHeight, DEFAULTS.footnoteHeight), [0, 200])
    };
}

/** Column of each node: the longest path from any input, along forward links only. */
export function assignLayers(graph, align = 'justify') {
    const { nodes, links } = graph;
    const layer = new Array(nodes.length).fill(0);
    const pending = nodes.map((n) => n.inLinks.filter((li) => !links[li].recycle).length);
    const queue = nodes.filter((n) => pending[n.index] === 0).map((n) => n.index);

    for (let q = 0; q < queue.length; q++) {
        const n = queue[q];
        for (const li of nodes[n].outLinks) {
            if (links[li].recycle) continue;
            const t = links[li].target;
            layer[t] = Math.max(layer[t], layer[n] + 1);
            if (--pending[t] === 0) queue.push(t);
        }
    }

    const maxLayer = Math.max(0, ...layer);
    if (align === 'justify') {
        for (const node of nodes) {
            if (node.outLinks.length === 0) layer[node.index] = maxLayer;
        }
    }
    return { layer, maxLayer };
}

const ORDER_SWEEPS = 6;

/**
 * Order each column to cut ribbon crossings: barycentre sweeps left to right
 * and back, keeping the order with the least crossed flow. measure holds each
 * item's place down its column as a 0 to 1 fraction; a moved node's is fixed.
 */
function orderColumns(columns, ups, downs, measure) {
    const place = (column) => {
        const total = column.reduce((s, n) => s + n.value, 0) || 1;
        let run = 0;
        for (const item of column) {
            measure[item.index] = (run + item.value / 2) / total;
            run += item.value;
        }
    };
    const sortBy = (column, neighbours) => {
        const key = new Map();
        column.forEach((item, rank) => {
            let weight = 0;
            let sum = 0;
            for (const e of neighbours[item.index]) { sum += measure[e.to] * e.value; weight += e.value; }
            key.set(item, [weight > 0 ? sum / weight : measure[item.index], rank]);
        });
        column.sort((a, b) => (key.get(a)[0] - key.get(b)[0]) || (key.get(a)[1] - key.get(b)[1]));
        place(column);
    };
    // Flow crossed between neighbouring columns, counting the smaller of each pair.
    const crossed = () => {
        let total = 0;
        for (let c = 1; c < columns.length; c++) {
            const inColumn = new Set(columns[c - 1].map((n) => n.index));
            const edges = [];
            for (const item of columns[c]) {
                for (const e of ups[item.index]) {
                    if (inColumn.has(e.to)) edges.push([measure[e.to], measure[item.index], e.value]);
                }
            }
            for (let i = 1; i < edges.length; i++) {
                for (let j = 0; j < i; j++) {
                    if ((edges[i][0] - edges[j][0]) * (edges[i][1] - edges[j][1]) < 0) total += Math.min(edges[i][2], edges[j][2]);
                }
            }
        }
        return total;
    };

    columns.forEach(place);
    let best = columns.map((c) => [...c]);
    let bestScore = crossed();
    const keep = () => {
        const score = crossed();
        if (score < bestScore) { bestScore = score; best = columns.map((c) => [...c]); }
    };
    for (let sweep = 0; sweep < ORDER_SWEEPS && bestScore > 0; sweep++) {
        for (let c = 1; c < columns.length; c++) sortBy(columns[c], ups);
        keep();
        for (let c = columns.length - 2; c >= 0; c--) sortBy(columns[c], downs);
        keep();
    }
    best.forEach((order, c) => { columns[c].splice(0, columns[c].length, ...order); });
}

// Keeps a column in its given order: the order is decided once, up front.
function resolveCollisions(column, pad, top, bottom) {
    let y = top;
    for (const node of column) {
        if (node.y0 < y) node.y0 = y;
        y = node.y0 + node.height + pad;
    }
    // Anything pushed past the bottom edge is walked back up.
    let limit = bottom;
    for (let i = column.length - 1; i >= 0; i--) {
        const node = column[i];
        if (node.y0 + node.height > limit) node.y0 = limit - node.height;
        limit = node.y0 - pad;
    }
}

/**
 * Lay the graph out. positions maps a node name to { x, y } percentages set by
 * dragging; a positioned node is placed there and left alone by the solver.
 * Returns node rectangles, link ribbons, recycle loops and, for every internal
 * node that does not balance, the stub that shows the missing flow.
 */
export function computeLayout(graph, balance, options = {}, positions = {}) {
    const opt = resolveOptions(options);
    const { layer, maxLayer } = assignLayers(graph, opt.align);

    const left = opt.margin;
    const right = opt.width - opt.margin;
    const top = opt.margin + opt.titleHeight;
    const bottom = opt.height - opt.margin - opt.footnoteHeight;
    const innerH = Math.max(1, bottom - top);

    const nodes = graph.nodes.map((n) => ({
        index: n.index,
        name: n.name,
        layer: layer[n.index],
        value: Math.max(n.inflow, n.outflow),
        inflow: n.inflow,
        outflow: n.outflow,
        role: balance ? balance.nodes[n.index].role : null,
        pinned: Object.prototype.hasOwnProperty.call(positions, n.name),
        x0: 0, x1: 0, y0: 0, y1: 0, height: 0
    }));

    const columns = Array.from({ length: maxLayer + 1 }, () => []);
    for (const node of nodes) columns[node.layer].push(node);

    // A flow that skips columns takes a slot in each one it passes, so nodes
    // stack beside it instead of under it. Slots count in the column budget.
    const items = [...nodes];
    const ups = nodes.map(() => []);
    const downs = nodes.map(() => []);
    const waypoints = graph.links.map(() => []);
    for (const l of graph.links) {
        if (l.recycle) continue;
        let previous = nodes[l.source];
        const chain = [];
        for (let c = layer[l.source] + 1; c < layer[l.target]; c++) {
            const slot = { index: items.length, layer: c, value: l.value, pinned: false, x0: 0, x1: 0, y0: 0, y1: 0, height: 0 };
            items.push(slot);
            ups.push([]);
            downs.push([]);
            columns[c].push(slot);
            waypoints[l.index].push(slot);
            chain.push(slot);
        }
        for (const next of [...chain, nodes[l.target]]) {
            downs[previous.index].push({ to: next.index, value: l.value });
            ups[next.index].push({ to: previous.index, value: l.value });
            previous = next;
        }
    }

    // Vertical scale. Recycle lanes sit under the nodes and are on the same
    // scale, so their total thickness comes out of every column's budget.
    const back = graph.links.filter((l) => l.recycle);
    const backValue = back.reduce((s, l) => s + l.value, 0);
    let laneGap = RECYCLE.laneGap;
    let fixedBand = back.length ? RECYCLE.clearance + laneGap * (back.length - 1) : 0;
    if (fixedBand > innerH * RECYCLE.maxBandShare) {
        laneGap = back.length > 1 ? Math.max(0, (innerH * RECYCLE.maxBandShare - RECYCLE.clearance) / (back.length - 1)) : 0;
        fixedBand = Math.min(innerH * RECYCLE.maxBandShare, RECYCLE.clearance + laneGap * (back.length - 1));
    }

    const maxCount = Math.max(1, ...columns.map((c) => c.length));
    const pad = maxCount > 1 ? Math.min(opt.nodePadding, (innerH * 0.5) / (maxCount - 1)) : opt.nodePadding;
    let ky = Infinity;
    for (const column of columns) {
        const sum = column.reduce((s, n) => s + n.value, 0);
        if (sum > 0) ky = Math.min(ky, (innerH - (column.length - 1) * pad - fixedBand) / (sum + backValue));
    }
    if (!Number.isFinite(ky) || ky < 0) ky = 0;
    const nodeBottom = bottom - fixedBand - backValue * ky;

    // Horizontal extent. A recycle into the first column or out of the last
    // needs room outside it for its vertical leg.
    const recycleSum = (node, list) => graph.nodes[node.index][list]
        .reduce((s, li) => s + (graph.links[li].recycle ? graph.links[li].value : 0), 0);
    const inset = (column, list) => {
        const widest = Math.max(0, ...column.map((n) => recycleSum(n, list)));
        const want = widest > 0 ? RECYCLE.run + RECYCLE.radius + widest * ky : 0;
        return Math.min(want, (right - left) * RECYCLE.maxInsetShare);
    };
    const insetLeft = inset(columns[0], 'inLinks');
    const insetRight = inset(columns[maxLayer], 'outLinks');
    const step = maxLayer > 0 ? (right - insetRight - left - insetLeft - opt.nodeWidth) / maxLayer : 0;

    const area = { top, bottom: nodeBottom, xMin: left, xMax: right - opt.nodeWidth };
    const measure = items.map(() => 0.5);
    for (const node of items) {
        node.height = node.value * ky;
        node.x0 = left + insetLeft + node.layer * step;
        if (node.pinned) {
            const p = positions[node.name];
            node.x0 = area.xMin + (area.xMax - area.xMin) * clamp(p.x, [0, 100]) / 100;
            node.y0 = area.top + Math.max(0, area.bottom - area.top - node.height) * clamp(p.y, [0, 100]) / 100;
            measure[node.index] = clamp(p.y, [0, 100]) / 100;
        }
        node.x1 = node.x0 + opt.nodeWidth;
    }

    // Only free nodes and slots are ordered, stacked, relaxed and kept apart.
    const free = columns.map((c) => c.filter((n) => !n.pinned));
    orderColumns(free, ups, downs, measure);
    for (const column of free) {
        const total = column.reduce((s, n) => s + n.height, 0) + Math.max(0, column.length - 1) * pad;
        let y = top + (nodeBottom - top - total) / 2;
        for (const node of column) {
            node.y0 = y;
            y += node.height + pad;
        }
    }

    const centre = (node) => node.y0 + node.height / 2;
    const pull = (node, neighbours, alpha) => {
        let weight = 0;
        let sum = 0;
        for (const e of neighbours[node.index]) {
            sum += centre(items[e.to]) * e.value;
            weight += e.value;
        }
        if (weight > 0) node.y0 += (sum / weight - centre(node)) * alpha;
    };

    for (let i = 0; i < opt.iterations; i++) {
        const alpha = Math.pow(0.99, i);
        for (let c = maxLayer - 1; c >= 0; c--) {
            for (const node of free[c]) pull(node, downs, alpha);
            resolveCollisions(free[c], pad, top, nodeBottom);
        }
        for (let c = 1; c <= maxLayer; c++) {
            for (const node of free[c]) pull(node, ups, alpha);
            resolveCollisions(free[c], pad, top, nodeBottom);
        }
    }
    for (const column of free) resolveCollisions(column, pad, top, nodeBottom);
    for (const node of items) node.y1 = node.y0 + node.height;

    const links = graph.links.map((l) => {
        const x0 = nodes[l.source].x1;
        const x1 = nodes[l.target].x0;
        // A moved end can leave a slot behind it. Only slots still on the way are drawn through.
        const via = [];
        let reach = x0;
        for (const slot of waypoints[l.index]) {
            if (slot.x0 > reach && slot.x1 < x1) {
                via.push({ x0: slot.x0, x1: slot.x1, y0: slot.y0, y1: slot.y1 });
                reach = slot.x1;
            }
        }
        return {
            index: l.index,
            source: l.source,
            target: l.target,
            value: l.value,
            width: l.value * ky,
            hairline: l.value * ky < HAIRLINE_PX,
            recycle: l.recycle,
            x0,
            x1,
            sy0: 0, sy1: 0, ty0: 0, ty1: 0,
            waypoints: via,
            loop: null
        };
    });

    // Forward ribbons leave and arrive in the vertical order of whatever they
    // reach next. Recycles stack beneath them, longest loop outermost, so
    // loops from one node nest instead of crossing.
    for (const node of nodes) {
        const g = graph.nodes[node.index];
        const far = (li, end) => {
            const slots = waypoints[li];
            if (!slots.length) return nodes[links[li][end]];
            return end === 'target' ? slots[0] : slots[slots.length - 1];
        };
        const byFarCentre = (end) => (a, b) => (centre(far(a, end)) - centre(far(b, end))) || (a - b);

        const out = g.outLinks.filter((li) => !links[li].recycle).sort(byFarCentre('target'));
        const outBack = g.outLinks.filter((li) => links[li].recycle)
            .sort((a, b) => (nodes[links[a].target].layer - nodes[links[b].target].layer) || (a - b));
        let y = node.y0;
        for (const li of [...out, ...outBack]) { links[li].sy0 = y; y += links[li].width; links[li].sy1 = y; }
        const outBottom = y;

        const inn = g.inLinks.filter((li) => !links[li].recycle).sort(byFarCentre('source'));
        const innBack = g.inLinks.filter((li) => links[li].recycle)
            .sort((a, b) => (nodes[links[b].source].layer - nodes[links[a].source].layer) || (a - b));
        y = node.y0;
        for (const li of [...inn, ...innBack]) { links[li].ty0 = y; y += links[li].width; links[li].ty1 = y; }
        const inBottom = y;

        for (const li of outBack) links[li].loop = { ...(links[li].loop || {}), sourceBottom: outBottom };
        for (const li of innBack) links[li].loop = { ...(links[li].loop || {}), targetBottom: inBottom };
    }

    // One lane per recycle under the nodes, shortest loop nearest them.
    const laneOrder = links.filter((l) => l.recycle).sort((a, b) =>
        ((nodes[a.source].layer - nodes[a.target].layer) - (nodes[b.source].layer - nodes[b.target].layer))
        || (nodes[b.target].layer - nodes[a.target].layer)
        || (a.index - b.index));
    let laneTop = nodeBottom + RECYCLE.clearance;
    for (const link of laneOrder) {
        link.loop.laneTop = laneTop;
        link.loop.laneBottom = laneTop + link.width;
        laneTop = link.loop.laneBottom + laneGap;
    }

    // The side of an unbalanced node that carries less flow leaves a gap at the
    // bottom. That gap is the missing flow, and it is drawn rather than hidden.
    const stubs = [];
    if (balance) {
        for (const b of balance.unbalanced) {
            const node = nodes[b.index];
            const side = b.residual > 0 ? 'out' : 'in';
            const covered = (side === 'out' ? node.outflow : node.inflow) * ky;
            stubs.push({
                node: b.index,
                side,
                value: Math.abs(b.residual),
                x: side === 'out' ? node.x1 : node.x0,
                y0: node.y0 + covered,
                y1: node.y0 + node.height
            });
        }
    }

    return {
        options: opt,
        ky,
        padding: pad,
        bounds: { left, right, top, bottom },
        area,
        maxLayer,
        nodes,
        links,
        stubs,
        hairlines: links.filter((l) => l.hairline).map((l) => l.index),
        recycles: laneOrder.map((l) => l.index)
    };
}

/** Percent position for a node whose top-left corner is at (x0, y0). */
export function positionFromPoint(layout, nodeIndex, x0, y0) {
    const { area } = layout;
    const node = layout.nodes[nodeIndex];
    const spanX = area.xMax - area.xMin;
    const spanY = area.bottom - area.top - node.height;
    const pct = (v) => Math.round(clamp(v, [0, 1]) * 1000) / 10;
    return {
        x: spanX > 0 ? pct((x0 - area.xMin) / spanX) : 0,
        y: spanY > 0 ? pct((y0 - area.top) / spanY) : 0
    };
}

const r2 = (v) => Math.round(v * 100) / 100;

// Corner points of a recycle loop. It leaves the source to the right, turns
// down, runs left along its lane, turns up and enters the target from the left.
// Every turn is a pair of concentric arcs, so the width never changes.
function loopGeometry(link) {
    const { radius: r, run: e } = RECYCLE;
    const { sourceBottom: S, targetBottom: T, laneTop: L0, laneBottom: L1 } = link.loop;
    const w = link.width;
    const xs = link.x0;
    const xt = link.x1;
    const riS = S + r - link.sy1;
    const riT = T + r - link.ty1;
    return {
        r, w, xs, xt, S, T, L0, L1, riS, riT,
        roS: riS + w,
        roT: riT + w,
        xa: xs + e,
        xb: xt - e,
        legOutInner: xs + e + riS,
        legOutOuter: xs + e + riS + w,
        legInInner: xt - e - riT,
        legInOuter: xt - e - riT - w
    };
}

function loopRibbonPath(link) {
    const g = loopGeometry(link);
    const arc = (radius, sweep, x, y) => `A${r2(radius)},${r2(radius)} 0 0 ${sweep} ${r2(x)},${r2(y)}`;
    const L = (x, y) => `L${r2(x)},${r2(y)}`;
    return `M${r2(g.xs)},${r2(link.sy0)}`
        + L(g.xa, link.sy0)
        + arc(g.roS, 1, g.legOutOuter, g.S + g.r)
        + L(g.legOutOuter, g.L0 - g.r)
        + arc(g.r + g.w, 1, g.legOutInner - g.r, g.L1)
        + L(g.legInInner + g.r, g.L1)
        + arc(g.r + g.w, 1, g.legInOuter, g.L0 - g.r)
        + L(g.legInOuter, g.T + g.r)
        + arc(g.roT, 1, g.xb, link.ty0)
        + L(g.xt, link.ty0)
        + L(g.xt, link.ty1)
        + L(g.xb, link.ty1)
        + arc(g.riT, 0, g.legInInner, g.T + g.r)
        + L(g.legInInner, g.L0 - g.r)
        + arc(g.r, 0, g.legInInner + g.r, g.L0)
        + L(g.legOutInner - g.r, g.L0)
        + arc(g.r, 0, g.legOutInner, g.L0 - g.r)
        + L(g.legOutInner, g.S + g.r)
        + arc(g.riS, 0, g.xa, link.sy1)
        + L(g.xs, link.sy1)
        + 'Z';
}

function loopCentrePath(link) {
    const g = loopGeometry(link);
    const h = g.w / 2;
    const arc = (radius, x, y) => `A${r2(radius)},${r2(radius)} 0 0 1 ${r2(x)},${r2(y)}`;
    const L = (x, y) => `L${r2(x)},${r2(y)}`;
    return `M${r2(g.xs)},${r2(link.sy0 + h)}`
        + L(g.xa, link.sy0 + h)
        + arc(g.riS + h, g.legOutInner + h, g.S + g.r)
        + L(g.legOutInner + h, g.L0 - g.r)
        + arc(g.r + h, g.legOutInner - g.r, g.L0 + h)
        + L(g.legInInner + g.r, g.L0 + h)
        + arc(g.r + h, g.legInInner - h, g.L0 - g.r)
        + L(g.legInInner - h, g.T + g.r)
        + arc(g.riT + h, g.xb, link.ty0 + h)
        + L(g.xt, link.ty0 + h);
}

// The points a forward link passes: its source, each slot it is routed through, its target.
function stops(link) {
    return [
        { xIn: link.x0, xOut: link.x0, top: link.sy0, bottom: link.sy1 },
        ...(link.waypoints || []).map((w) => ({ xIn: w.x0, xOut: w.x1, top: w.y0, bottom: w.y1 })),
        { xIn: link.x1, xOut: link.x1, top: link.ty0, bottom: link.ty1 }
    ];
}

/** Closed ribbon for a link: exact width at each node, constant along a loop. */
export function ribbonPath(link) {
    if (link.recycle) return loopRibbonPath(link);
    const s = stops(link);
    const curve = (xa, ya, xb, yb) => {
        const xm = (xa + xb) / 2;
        return `C${r2(xm)},${r2(ya)} ${r2(xm)},${r2(yb)} ${r2(xb)},${r2(yb)}`;
    };
    const last = s.length - 1;
    let d = `M${r2(s[0].xOut)},${r2(s[0].top)}`;
    for (let i = 1; i <= last; i++) {
        d += curve(s[i - 1].xOut, s[i - 1].top, s[i].xIn, s[i].top);
        if (i < last) d += `L${r2(s[i].xOut)},${r2(s[i].top)}`;
    }
    d += `L${r2(s[last].xIn)},${r2(s[last].bottom)}`;
    for (let i = last; i >= 1; i--) {
        if (i < last) d += `L${r2(s[i].xIn)},${r2(s[i].bottom)}`;
        d += curve(s[i].xIn, s[i].bottom, s[i - 1].xOut, s[i - 1].bottom);
    }
    return `${d}Z`;
}

/** Centre line of a link, used for the not-to-scale hairline. */
export function centrePath(link) {
    if (link.recycle) return loopCentrePath(link);
    const s = stops(link);
    const mid = (stop) => (stop.top + stop.bottom) / 2;
    let d = `M${r2(s[0].xOut)},${r2(mid(s[0]))}`;
    for (let i = 1; i < s.length; i++) {
        const xm = (s[i - 1].xOut + s[i].xIn) / 2;
        d += `C${r2(xm)},${r2(mid(s[i - 1]))} ${r2(xm)},${r2(mid(s[i]))} ${r2(s[i].xIn)},${r2(mid(s[i]))}`;
        if (i < s.length - 1) d += `L${r2(s[i].xOut)},${r2(mid(s[i]))}`;
    }
    return d;
}

/** Where a value label sits on a link: mid-ribbon, or mid-lane for a loop. */
export function linkLabelPoint(link) {
    if (link.recycle) {
        const g = loopGeometry(link);
        return { x: (g.legOutInner + g.legInInner) / 2, y: (g.L0 + g.L1) / 2 };
    }
    const via = link.waypoints || [];
    if (via.length) {
        const slot = via[Math.floor(via.length / 2)];
        return { x: (slot.x0 + slot.x1) / 2, y: (slot.y0 + slot.y1) / 2 };
    }
    return { x: (link.x0 + link.x1) / 2, y: (link.sy0 + link.sy1 + link.ty0 + link.ty1) / 4 };
}

/** Format a quantity. 'auto' keeps six significant figures. */
export function formatValue(value, decimals = 'auto') {
    if (!Number.isFinite(value)) return 'n/a';
    if (decimals === 'auto') return value.toLocaleString('en-US', { maximumSignificantDigits: 6 });
    const d = Math.round(clamp(Number(decimals) || 0, [0, 6]));
    return value.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function formatPercent(fraction) {
    if (!Number.isFinite(fraction)) return 'n/a';
    const pct = fraction * 100;
    return `${pct.toLocaleString('en-US', { maximumFractionDigits: Math.abs(pct) < 10 ? 1 : 0 })}%`;
}
