// Tracing for the Sankey diagram builder. Pure, no DOM.
//
// A flow list holds totals between neighbors. Where streams meet at a node
// and leave by more than one way, which stream took which way is not in the
// list, so nothing here estimates it. A trace follows only what the list
// settles, and ends at the first node where it does not.
//
// The list settles a node's exits in four ways: everything in the node came
// through the traced node; a flow is written with its source, as in
// `Applied [12 from Referral] Screen`; only one way out is left unspoken for,
// which then takes whatever of the stream has not been stated; or what is left
// of the stream is exactly what is left unspoken for, so it is all of it.

import { formatValue } from './sankey-engine.js';

const PIVOT = 1e-12;
const EPS = 1e-9;
// Strictly more, beyond float noise. No balance tolerance: a trace is exact or absent.
const more = (a, b) => a - b > EPS * Math.max(Math.abs(a), Math.abs(b));

// Solve A x = b in place by elimination with partial pivoting. A row whose
// pivot vanishes is left at zero.
function solveLinear(A, b) {
    const n = b.length;
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
        }
        if (Math.abs(A[pivot][col]) < PIVOT) continue;
        [A[col], A[pivot]] = [A[pivot], A[col]];
        [b[col], b[pivot]] = [b[pivot], b[col]];
        for (let row = col + 1; row < n; row++) {
            const f = A[row][col] / A[col][col];
            if (f === 0) continue;
            for (let k = col; k < n; k++) A[row][k] -= f * A[col][k];
            b[row] -= f * b[col];
        }
    }
    const x = new Array(n).fill(0);
    for (let row = n - 1; row >= 0; row--) {
        if (Math.abs(A[row][row]) < PIVOT) continue;
        let sum = b[row];
        for (let k = row + 1; k < n; k++) sum -= A[row][k] * x[k];
        x[row] = sum / A[row][row];
    }
    return x;
}

const statedFor = (link, name) => (link.stated && link.stated[name]) || 0;
const statedTotal = (link) => (link.stated ? Object.values(link.stated).reduce((s, v) => s + v, 0) : 0);

/**
 * Follow each named node downstream as far as the list settles it.
 *
 * Returns { traces, warnings }. Each trace is
 * { node, name, origin, shares, ends, stoppedAt }: shares[i] is the fraction of
 * link i that came through the node, ends lists where the amount stops
 * ({ node, name, kind, amount }) and sums to origin, and stoppedAt lists the
 * nodes past which the list does not say where the stream went.
 * kind is output, missing (lost at a node whose outflow falls short),
 * unstated (reached a node and the list does not say which way it left),
 * traced (handed to another traced node) or returned (back by a recycle).
 *
 * What reaches another traced node is that node's from there on.
 */
export function traceFlows(graph, names) {
    const warnings = [];
    const byName = new Map(graph.nodes.map((n) => [n.name, n.index]));
    const wanted = [];
    for (const name of names) {
        if (!byName.has(name)) continue;
        const index = byName.get(name);
        if (graph.nodes[index].outflow === 0) {
            warnings.push({ line: null, code: 'TRACE_NOTHING', message: `"${name}" is set to be traced, but nothing leaves it, so there is nothing to follow` });
            continue;
        }
        if (!wanted.includes(index)) wanted.push(index);
    }
    const traced = new Set(wanted);
    const stopped = new Map();

    // drawn is false for a source that is only named on flows: its amounts are
    // still checked, because other traces are worked out from them.
    const follow = (origin, drawn) => {
        const name = graph.nodes[origin].name;

        // Nodes the stream can reach without passing through a traced node.
        const reach = [];
        const slot = new Map();
        const stack = [origin];
        const seen = new Set([origin]);
        while (stack.length) {
            const n = stack.pop();
            for (const li of graph.nodes[n].outLinks) {
                const t = graph.links[li].target;
                if (seen.has(t) || traced.has(t)) continue;
                seen.add(t);
                slot.set(t, reach.length);
                reach.push(t);
                stack.push(t);
            }
        }

        // Nodes that hold anything which did not come through the traced node:
        // those that give out more than they take in, other traced nodes, and
        // everything downstream of either.
        const mixed = new Set();
        const spread = [];
        for (const node of graph.nodes) {
            if (node.index === origin) continue;
            if (more(node.outflow, node.inflow) || traced.has(node.index)) { mixed.add(node.index); spread.push(node.index); }
        }
        while (spread.length) {
            const n = spread.pop();
            for (const li of graph.nodes[n].outLinks) {
                const t = graph.links[li].target;
                if (t === origin || mixed.has(t)) continue;
                mixed.add(t);
                spread.push(t);
            }
        }

        // How each reached node passes the stream on.
        const plan = new Map();
        for (const n of reach) {
            const node = graph.nodes[n];
            if (node.outLinks.length === 0) { plan.set(n, { kind: 'output' }); continue; }
            const leaks = more(node.inflow, node.outflow);
            if (!mixed.has(n)) { plan.set(n, { kind: 'whole', leaks }); continue; }
            const said = node.outLinks.reduce((sum, li) => sum + statedFor(graph.links[li], name), 0);
            // Ways out that the list has not fully assigned to a source.
            const open = node.outLinks.filter((li) => more(graph.links[li].value, statedTotal(graph.links[li])));
            const ways = open.length + (leaks ? 1 : 0);
            // What is left unspoken for at this node, across every way out.
            const unspoken = open.reduce((sum, li) => sum + graph.links[li].value - statedTotal(graph.links[li]), 0)
                + (leaks ? node.inflow - node.outflow : 0);
            plan.set(n, { kind: 'split', said, leaks, unspoken, rest: ways === 1 ? (leaks ? 'leak' : open[0]) : null, fills: false });
        }

        // Amount of the stream in a link is fixed + follows * (amount at its source).
        const size = reach.length;
        let fixed;
        let follows;
        let solved;
        const at = (n) => (slot.has(n) ? solved[slot.get(n)] : 0);
        // Nodes where the list stops saying, and nodes downstream of what they
        // leave unsaid, where the amount of the stream arriving is not known.
        const stops = new Set();
        const unknown = new Set();
        const small = EPS * graph.nodes[origin].outflow;
        const solve = () => {
            fixed = new Array(graph.links.length).fill(0);
            follows = new Array(graph.links.length).fill(0);
            graph.links.forEach((link, li) => {
                if (link.source === origin) { fixed[li] = link.value; return; }
                const p = plan.get(link.source);
                if (!p || p.kind === 'output') return;
                if (p.kind === 'whole') { fixed[li] = link.value; return; }
                fixed[li] = statedFor(link, name);
                // With the amount arriving unknown, only what is written is drawn.
                if (unknown.has(link.source)) return;
                if (p.fills) fixed[li] += link.value - statedTotal(link);
                else if (p.rest === li) { fixed[li] -= p.said; follows[li] = 1; }
            });
            const A = reach.map((_, row) => { const r = new Array(size).fill(0); r[row] = 1; return r; });
            const b = new Array(size).fill(0);
            reach.forEach((n, row) => {
                for (const li of graph.nodes[n].inLinks) {
                    b[row] += fixed[li];
                    const src = graph.links[li].source;
                    if (follows[li] && slot.has(src)) A[row][slot.get(src)] -= 1;
                }
            });
            solved = solveLinear(A, b);
        };
        // Settling one node can settle the next, so this repeats until nothing changes.
        for (let pass = 0; pass <= size; pass++) {
            solve();
            let changed = false;
            for (const n of reach) {
                const p = plan.get(n);
                if (p.kind !== 'split' || p.rest !== null || p.fills) continue;
                const rest = at(n) - p.said;
                if (rest > EPS * graph.nodes[origin].outflow && !more(rest, p.unspoken) && !more(p.unspoken, rest)) {
                    p.fills = true;
                    changed = true;
                }
            }
            if (!changed) break;
        }
        for (const n of reach) {
            const p = plan.get(n);
            if (p.kind === 'split' && p.rest === null && !p.fills && at(n) - p.said > small) stops.add(n);
        }
        // A part amount drawn past a stop would understate the stream, so
        // everything fed by an exit the list leaves unsaid is unknown too.
        const cloud = [...stops];
        while (cloud.length) {
            const n = cloud.pop();
            for (const li of graph.nodes[n].outLinks) {
                const link = graph.links[li];
                if (!more(link.value, statedTotal(link))) continue;
                if (!slot.has(link.target) || unknown.has(link.target)) continue;
                unknown.add(link.target);
                cloud.push(link.target);
            }
        }
        if (unknown.size) solve();

        const carried = graph.links.map((link, li) => fixed[li] + follows[li] * at(link.source));
        const shares = graph.links.map((link, li) => Math.min(1, Math.max(0, carried[li] / link.value)));
        const arriving = (n) => graph.nodes[n].inLinks.reduce((sum, li) => sum + shares[li] * graph.links[li].value, 0);

        const ends = [];
        const push = (n, kind, amount) => {
            if (amount > small) ends.push({ node: n, name: graph.nodes[n].name, kind, amount });
        };
        for (const n of reach) {
            const node = graph.nodes[n];
            const p = plan.get(n);
            const here = at(n);
            if (p.kind === 'output') { push(n, 'output', here); continue; }
            if (p.kind === 'whole') { if (p.leaks) push(n, 'missing', node.inflow - node.outflow); continue; }
            if (unknown.has(n)) continue;
            if (more(p.said, here)) {
                warnings.push({
                    line: null,
                    code: 'TRACE_OVERSTATED',
                    message: `The list has ${formatValue(p.said)} from "${name}" leaving "${node.name}", but only ${formatValue(Math.max(0, here))} of it gets there`
                });
                continue;
            }
            if (p.fills) { if (p.leaks) push(n, 'missing', node.inflow - node.outflow); continue; }
            if (p.rest === 'leak') push(n, 'missing', here - p.said);
        }
        graph.links.forEach((link, li) => {
            if (!more(carried[li], link.value)) return;
            warnings.push({
                line: null,
                code: 'TRACE_OVERFULL',
                message: `${graph.nodes[link.source].name} to ${graph.nodes[link.target].name} would have to carry ${formatValue(carried[li])} from "${name}", more than the ${formatValue(link.value)} it holds, so the amounts stated around "${graph.nodes[link.source].name}" do not agree`
            });
        });
        for (const other of wanted) {
            if (other !== origin) push(other, 'traced', arriving(other));
        }
        push(origin, 'returned', arriving(origin));
        // Whatever was not followed to an end stopped where the list stopped saying.
        const stoppedAt = [...stops];
        const left = graph.nodes[origin].outflow - ends.reduce((sum, e) => sum + e.amount, 0);
        if (stoppedAt.length && left > small) {
            ends.push({ node: stoppedAt[0], name: stoppedAt.map((n) => graph.nodes[n].name).join(', '), kind: 'unstated', amount: left });
        }
        for (const n of drawn ? stoppedAt : []) {
            if (!stopped.has(n)) stopped.set(n, []);
            stopped.get(n).push(name);
        }
        graph.links.forEach((link) => {
            const said = statedFor(link, name);
            if (!(said > 0) || link.source === origin || slot.has(link.source)) return;
            warnings.push({
                line: null,
                code: 'TRACE_OVERSTATED',
                message: `${graph.nodes[link.source].name} to ${graph.nodes[link.target].name} is written as carrying ${formatValue(said)} from "${name}", but nothing from "${name}" reaches "${graph.nodes[link.source].name}"`
            });
        });
        ends.sort((p, q) => q.amount - p.amount || p.node - q.node);

        return { node: origin, name, origin: graph.nodes[origin].outflow, shares, ends, stoppedAt };
    };

    const traces = wanted.map((origin) => follow(origin, true));
    const named = new Set(graph.links.flatMap((link) => (link.stated ? Object.keys(link.stated) : [])));
    for (const name of named) {
        const origin = byName.get(name);
        if (origin !== undefined && !traced.has(origin) && graph.nodes[origin].outflow > 0) follow(origin, false);
    }

    for (const [n, who] of stopped) {
        const node = graph.nodes[n];
        const list = who.map((w) => `"${w}"`).join(', ');
        const example = `${node.name} [amount from ${who[0]}] ${graph.nodes[graph.links[node.outLinks[0]].target].name}`;
        // Say what it is about this node that leaves the way on unsettled.
        const others = [...new Set(node.inLinks.map((li) => graph.nodes[graph.links[li].source].name))].filter((f) => !who.includes(f));
        let why = `Several streams meet at "${node.name}"`;
        if (others.length) {
            const shown = others.slice(0, 3).map((f) => `"${f}"`).join(', ');
            why = `"${node.name}" is also fed by ${shown}${others.length > 3 ? ` and ${others.length - 3} more` : ''}`;
        } else if (more(node.outflow, node.inflow)) {
            why = `"${node.name}" gives out more than it takes in (${formatValue(node.outflow)} against ${formatValue(node.inflow)}), so part of what leaves it is from a source the list does not show`;
        }
        warnings.push({
            line: null,
            code: 'TRACE_UNSTATED',
            message: `${list} ${who.length === 1 ? 'is' : 'are'} not followed past "${node.name}". ${why}, and the list does not say which way each part leaves, so nothing is drawn rather than guessed. To follow ${who.length === 1 ? 'it' : 'them'}, write the flows out of "${node.name}" with their source, for example "${example}"`
        });
    }
    for (const t of traces) {
        for (const end of t.ends) {
            if (end.kind !== 'traced') continue;
            warnings.push({
                line: null,
                code: 'TRACE_HANDED_ON',
                message: `"${t.name}" feeds "${end.name}", and both are traced. What reaches "${end.name}" is shown as its own from there on`
            });
        }
    }

    return { traces, warnings };
}
