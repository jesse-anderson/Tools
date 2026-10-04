// Mermaid text for a process, so the map can go into a document that renders
// it. Pure. Mermaid lays the chart out itself, so lanes become subgraphs and
// the picture will not match the one drawn here.

import { formatDuration } from './flow-model.js';

// Mermaid reads these inside a quoted label as markup or as the end of it.
const safe = (text) => text.replace(/#/g, '#35;').replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');

/** A model as a Mermaid flowchart. The model must be ok. */
export function toMermaid(model, title = '') {
    const { graph, unit, labels } = model;
    const dur = (h) => formatDuration(h, graph.calendar, unit);
    const out = [];
    if (title) out.push(`%% ${title.replace(/\s+/g, ' ')}`);
    out.push(`flowchart ${model.layout.direction === 'down' ? 'TB' : 'LR'}`);

    for (const lane of graph.lanes) {
        const members = graph.nodes.filter((n) => n.lane === lane.index);
        if (!members.length) continue;
        out.push(`    subgraph lane${lane.index}["${safe(lane.name)}"]`);
        for (const n of members) {
            const times = [n.touch > 0 ? dur(n.touch) : '', n.wait > 0 ? `wait ${dur(n.wait)}` : ''].filter(Boolean).join(' + ');
            const name = n.kind === 'terminator' ? n.name.slice(1, -1).trim() : n.name;
            const text = `"${safe(name)}${times ? `<br/>${safe(times)}` : ''}"`;
            const shape = { terminator: `([${text}])`, decision: `{{${text}}}`, task: `[${text}]` }[n.kind];
            out.push(`        s${n.index}${shape}`);
        }
        out.push('    end');
    }

    // Dotted is rework, thick is an exit taken together with its neighbors.
    for (const link of graph.links) {
        const arrow = link.rework ? '-.->' : (link.parallel ? '==>' : '-->');
        const label = labels[link.index] ? `|"${safe(labels[link.index])}"|` : '';
        out.push(`    s${link.source} ${arrow}${label} s${link.target}`);
    }
    return `${out.join('\n')}\n`;
}
