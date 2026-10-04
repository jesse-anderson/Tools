// Tracing for the Sankey diagram builder. Pure, no DOM.
//
// A flow list says what passes between neighbours, not where a stream ends up
// once it has been mixed with others. Following a node downstream therefore
// takes one assumption: each node passes on its inputs in the proportions it
// received them. Where that assumption is used, the result says so.

const EPS = 1e-12;

// Solve A x = b in place by elimination with partial pivoting. A row whose
// pivot vanishes is left at zero.
function solveLinear(A, b) {
    const n = b.length;
    for (let col = 0; col < n; col++) {
        let pivot = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(A[row][col]) > Math.abs(A[pivot][col])) pivot = row;
        }
        if (Math.abs(A[pivot][col]) < EPS) continue;
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
        if (Math.abs(A[row][row]) < EPS) continue;
        let sum = b[row];
        for (let k = row + 1; k < n; k++) sum -= A[row][k] * x[k];
        x[row] = sum / A[row][row];
    }
    return x;
}

/**
 * Follow each named node downstream.
 *
 * The share of a node's contents that came through the traced node is
 * x = (what arrives carrying it) / max(inflow, outflow), so an unexplained
 * inflow dilutes it and an unexplained outflow takes its share away. What
 * reaches another traced node is counted as that node's from there on, which
 * keeps the shares in any one flow from adding to more than the flow.
 *
 * Returns { traces, warnings }. Each trace is
 * { node, name, origin, shares, ends, mixedAt }: shares[i] is the fraction of
 * link i that came through the node, ends lists where the amount leaves the
 * picture ({ node, name, kind, amount }) and sums to origin, and mixedAt lists
 * the nodes where the mixing assumption decided a split.
 * kind is output, missing (lost at a node whose outflow falls short),
 * traced (handed to another traced node) or returned (back by a recycle).
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

    const traces = wanted.map((origin) => {
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

        const size = reach.length;
        const A = reach.map(() => new Array(size).fill(0));
        const b = new Array(size).fill(0);
        reach.forEach((n, row) => {
            const node = graph.nodes[n];
            A[row][row] = Math.max(node.inflow, node.outflow);
            for (const li of node.inLinks) {
                const link = graph.links[li];
                if (link.source === origin) b[row] += link.value;
                else if (slot.has(link.source)) A[row][slot.get(link.source)] -= link.value;
            }
        });
        const solved = solveLinear(A, b);

        const x = new Array(graph.nodes.length).fill(0);
        x[origin] = 1;
        // Clamped: elimination can leave a share a few ulps outside 0 to 1.
        reach.forEach((n, row) => { x[n] = Math.min(1, Math.max(0, solved[row])); });

        const shares = graph.links.map((link) => x[link.source]);
        const arriving = (n) => graph.nodes[n].inLinks.reduce((sum, li) => sum + graph.links[li].value * shares[li], 0);

        const ends = [];
        const mixedAt = [];
        for (const n of reach) {
            const node = graph.nodes[n];
            const lost = x[n] * Math.max(0, node.inflow - node.outflow);
            if (lost > 0) ends.push({ node: n, name: node.name, kind: node.outflow === 0 ? 'output' : 'missing', amount: lost });
            // The assumption only decides anything where a mixture is split.
            const ways = node.outLinks.length + (node.inflow > node.outflow ? 1 : 0);
            if (x[n] > EPS && x[n] < 1 - 1e-9 && ways > 1) mixedAt.push(n);
        }
        for (const other of wanted) {
            if (other === origin) continue;
            const amount = arriving(other);
            if (amount > 0) ends.push({ node: other, name: graph.nodes[other].name, kind: 'traced', amount });
        }
        const back = arriving(origin);
        if (back > 0) ends.push({ node: origin, name: graph.nodes[origin].name, kind: 'returned', amount: back });
        ends.sort((p, q) => q.amount - p.amount || p.node - q.node);

        return { node: origin, name: graph.nodes[origin].name, origin: graph.nodes[origin].outflow, shares, ends, mixedAt };
    });

    const mixed = [...new Set(traces.flatMap((t) => t.mixedAt))].map((n) => graph.nodes[n].name);
    if (mixed.length) {
        const list = mixed.slice(0, 4).map((n) => `"${n}"`).join(', ');
        const more = mixed.length > 4 ? ` and ${mixed.length - 4} more` : '';
        warnings.push({
            line: null,
            code: 'TRACE_ASSUMES_MIXING',
            message: `The traced bands past ${list}${more} are an estimate. The flow list does not say which input went to which output there, so each output is taken to carry the inputs in the proportions they arrived`
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
