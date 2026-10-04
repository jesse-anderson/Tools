// SVG renderer for the Sankey diagram builder.
//
// Every color is a literal presentation attribute, never a CSS variable or a
// style attribute. That is what lets the same element be serialized to a file
// and what keeps it legal under a style-src with no unsafe-inline.

import { ribbonPath, centerPath, centerPoints, linkBand, linkLabelPoint, formatValue, formatPercent } from './sankey-engine.js';
import { balanceSummary } from './sankey-model.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FONT = "'Space Grotesk', system-ui, 'Segoe UI', Arial, sans-serif";

// Categorical slots in a fixed order, validated on each surface for
// color-vision separation between neighbors. Three light slots sit under 3:1
// on white, which is why every node carries a text label.
export const PALETTES = Object.freeze({
    light: Object.freeze({
        name: 'light',
        surface: '#ffffff',
        ink: '#0f172a',
        inkSecondary: '#475569',
        neutral: '#94a3b8',
        missing: '#d03b3b',
        series: Object.freeze(['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'])
    }),
    dark: Object.freeze({
        name: 'dark',
        surface: '#18181b',
        ink: '#fafafa',
        inkSecondary: '#a1a1aa',
        neutral: '#71717a',
        missing: '#e66767',
        series: Object.freeze(['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'])
    })
});

// How far a node's grab area reaches past it, vertically and to each side.
const HIT_REACH = 14;
const HIT_SIDE = 8;

// How many lines past its own node a crowded label may be lifted or dropped.
const LABEL_LIFT = 4;
// Clear space kept beside a label, in px.
const LABEL_GAP = 6;
// A traced band thinner than this is drawn as a dashed line instead.
const BAND_MIN_PX = 1;
// Distance between the marks along a traced stream, and half a mark's size, in px.
const MARK_SPACING = 44;
const MARK_RADIUS = 4.5;
// Where along the spacing each stream starts, so neighbors sit half a step apart.
const MARK_PHASES = [0, 0.5, 0.25, 0.75];

const polygon = (points) => `M${points.map(([x, y]) => `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`).join('L')}Z`;
const ring = (x, y, count, radius, turn = -90, inner = radius) => polygon(Array.from({ length: count }, (_, i) => {
    const a = ((turn + (360 / count) * i) * Math.PI) / 180;
    const r = i % 2 ? inner : radius;
    return [x + r * Math.cos(a), y + r * Math.sin(a)];
}));

// One shape per traced node, in the order the trace lines are typed. Shape is
// what identifies a stream: the palette repeats and does not survive greyscale.
export const TRACE_SHAPES = Object.freeze([
    { id: 'circle', plural: 'circles', path: (x, y, r) => ring(x, y, 24, r * 0.9) },
    { id: 'triangle', plural: 'triangles', path: (x, y, r) => ring(x, y + r * 0.15, 3, r * 1.15) },
    { id: 'square', plural: 'squares', path: (x, y, r) => ring(x, y, 4, r * 1.15, -45) },
    { id: 'star', plural: 'stars', path: (x, y, r) => ring(x, y, 10, r * 1.25, -90, r * 0.52) },
    { id: 'diamond', plural: 'diamonds', path: (x, y, r) => ring(x, y, 4, r * 1.15) },
    { id: 'cross', plural: 'crosses', path: (x, y, r) => {
        const a = r * 0.36;
        return polygon([[-a, -r], [a, -r], [a, -a], [r, -a], [r, a], [a, a], [a, r], [-a, r], [-a, a], [-r, a], [-r, -a], [-a, -a]]
            .map(([dx, dy]) => [x + dx, y + dy]));
    } },
    { id: 'wedge', plural: 'downward triangles', path: (x, y, r) => ring(x, y - r * 0.15, 3, r * 1.15, 90) },
    { id: 'hexagon', plural: 'hexagons', path: (x, y, r) => ring(x, y, 6, r, 0) }
]);

/** Path for the mark of the n-th traced node, centered on x, y. */
export function traceMarkPath(n, x, y, radius = MARK_RADIUS) {
    return TRACE_SHAPES[n % TRACE_SHAPES.length].path(x, y, radius);
}

// What the diagram says about anything on it that is not drawn to scale.
function footnoteText(layout, traces = [], style = 'both') {
    const parts = [];
    if (traces.length) {
        const marked = style !== 'band';
        const one = (t, i) => (marked ? `${t.name} (${TRACE_SHAPES[i % TRACE_SHAPES.length].plural})` : t.name);
        const names = traces.length <= 3 ? traces.map(one).join(', ') : (marked ? 'the node carrying the same mark' : 'the traced nodes');
        parts.push(style === 'line'
            ? `Marked lines run through each flow that carries something from ${names}.`
            : `Solid bands are the part of each flow that came through ${names}.`);
        if (traces.some((t) => t.stoppedAt.length)) parts.push('A trace ends where the flow list does not say which way it went.');
    }
    if (layout.widthMode === 'equal') parts.push('Every flow is drawn the same width. Widths are not amounts.');
    if (layout.widthMode === 'root') parts.push('Widths follow the square root of each amount. They are not to scale.');
    if (layout.hairlines.length) parts.push('Dashed lines are flows under 1 px wide at this size. They are not to scale.');
    if (layout.widened.length) {
        const px = String(Math.round(layout.minLinkWidth * 10) / 10);
        parts.push(`Flows under ${px} px are drawn ${px} px wide, not to scale.`);
    }
    return parts.join(' ');
}

const ROLE_SLOT = { input: 0, internal: 1, output: 2 };

export const VIEW_DEFAULTS = Object.freeze({
    title: '',
    unit: '',
    decimals: 'auto',
    showValues: true,
    showPercent: false,
    showLinkValues: false,
    showMissing: true,
    nodeColor: 'node',
    linkColor: 'source',
    linkOpacity: 0.45,
    // How a traced stream is drawn: band, line, or both.
    traceStyle: 'both',
    background: true,
    fontSize: 12,
    // On the page nodes can be focused and moved. An exported file gets none of that.
    interactive: false
});

/** Color of each node: an explicit override, else its palette slot. */
export function nodeColors(model, palette, mode = 'node') {
    return model.graph.nodes.map((node) => {
        const override = model.parsed.colors[node.name];
        if (override) return override;
        if (mode === 'role') return palette.series[ROLE_SLOT[model.balance.nodes[node.index].role]];
        // Slot follows first appearance, so adding a flow never repaints a node.
        return palette.series[node.index % palette.series.length];
    });
}

function make(doc, tag, attrs = {}, text) {
    const el = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value !== null && value !== undefined) el.setAttribute(key, String(value));
    }
    if (text !== undefined) el.textContent = text;
    return el;
}

function halo(palette) {
    return { stroke: palette.surface, 'stroke-width': 3, 'stroke-linejoin': 'round', 'paint-order': 'stroke' };
}

/**
 * Build the diagram. model comes from buildModel and must be ok. Returns a
 * detached <svg> sized in user units, so the caller decides how it scales.
 */
export function renderSankey(doc, model, viewOptions = {}, palette = PALETTES.light) {
    const view = { ...VIEW_DEFAULTS, ...viewOptions };
    const { graph, balance, layout, parsed } = model;
    const traces = model.traces || [];
    const { width, height, margin } = layout.options;
    const unit = view.unit ? ` ${view.unit}` : '';
    const colors = nodeColors(model, palette, view.nodeColor);
    const fmt = (v) => `${formatValue(v, view.decimals)}${unit}`;
    const share = (v) => (balance.totalIn > 0 ? formatPercent(v / balance.totalIn) : 'n/a');

    // No xmlns attribute here: XMLSerializer declares the namespace itself.
    // A group, not an image, on the page: an image role would hide the nodes
    // that can be focused and moved.
    const svg = make(doc, 'svg', {
        viewBox: `0 0 ${width} ${height}`,
        width,
        height,
        role: view.interactive ? 'group' : 'img',
        'aria-labelledby': 'sankeySvgTitle sankeySvgDesc',
        'font-family': FONT,
        'font-size': view.fontSize
    });
    svg.appendChild(make(doc, 'title', { id: 'sankeySvgTitle' }, view.title || 'Sankey diagram'));
    const recycleNote = layout.recycles.length
        ? ` ${layout.recycles.length} recycle ${layout.recycles.length === 1 ? 'stream loops' : 'streams loop'} under the diagram.`
        : '';
    svg.appendChild(make(doc, 'desc', { id: 'sankeySvgDesc' },
        `${graph.nodes.length} nodes and ${graph.links.length} flows.${recycleNote} ${balanceSummary(balance, view.unit, view.decimals)}`));

    const defs = make(doc, 'defs');
    const hatch = make(doc, 'pattern', {
        id: 'sankeyHatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'
    });
    hatch.appendChild(make(doc, 'rect', { width: 6, height: 6, fill: palette.surface }));
    hatch.appendChild(make(doc, 'rect', { width: 2.5, height: 6, fill: palette.missing }));
    defs.appendChild(hatch);
    svg.appendChild(defs);

    if (view.background) {
        svg.appendChild(make(doc, 'rect', { class: 'sankey-bg', width, height, fill: palette.surface }));
    }

    if (view.title) {
        svg.appendChild(make(doc, 'text', {
            class: 'sankey-title', x: margin, y: margin + 16, 'font-size': 16, 'font-weight': 700, fill: palette.ink
        }, view.title));
    }

    // Links first, so nodes and labels paint over them.
    const linkGroup = make(doc, 'g', { class: 'sankey-links' });
    for (const link of layout.links) {
        const source = graph.nodes[link.source];
        const target = graph.nodes[link.target];
        let paint = palette.neutral;
        if (view.linkColor === 'source') paint = colors[link.source];
        if (view.linkColor === 'target') paint = colors[link.target];
        if (view.linkColor === 'gradient') {
            const id = `sankeyGrad${link.index}`;
            const grad = make(doc, 'linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: link.x0, x2: link.x1, y1: 0, y2: 0 });
            grad.appendChild(make(doc, 'stop', { offset: '0', 'stop-color': colors[link.source] }));
            grad.appendChild(make(doc, 'stop', { offset: '1', 'stop-color': colors[link.target] }));
            defs.appendChild(grad);
            paint = `url(#${id})`;
        }

        const kind = link.recycle ? ' sankey-recycle' : '';
        const path = link.hairline
            ? make(doc, 'path', {
                class: `sankey-link sankey-hairline${kind}`, d: centerPath(link), fill: 'none',
                stroke: paint, 'stroke-width': 1, 'stroke-dasharray': '4 3', 'data-link': link.index
            })
            : make(doc, 'path', {
                class: `sankey-link${kind}`, d: ribbonPath(link), fill: paint,
                'fill-opacity': view.linkOpacity, 'data-link': link.index
            });
        let scale = link.hairline ? ', drawn as a dashed line, not to scale' : '';
        if (link.widened && !link.hairline) scale = ', widened to the minimum width, not to scale';
        else if (layout.widthMode !== 'scale' && !link.hairline) scale = ', width not to scale';
        const recycle = link.recycle ? ' (recycle)' : '';
        path.appendChild(make(doc, 'title', {}, `${source.name} to ${target.name}${recycle}: ${fmt(link.value)} (${share(link.value)} of input)${scale}`));
        linkGroup.appendChild(path);
    }
    svg.appendChild(linkGroup);

    // Traced bands sit inside their ribbon, stacked from its upper edge, each
    // as wide as the share of that flow that came through the traced node.
    if (traces.length) {
        const bandGroup = make(doc, 'g', { class: 'sankey-traces' });
        const marks = [];
        for (const link of layout.links) {
            let from = 0;
            for (const trace of traces) {
                const part = trace.shares[link.index];
                if (!(part > 1e-9)) continue;
                const to = Math.min(1, from + part);
                const band = linkBand(link, from, to);
                from = to;
                const paint = colors[trace.node];
                const order = traces.indexOf(trace);
                const thin = link.hairline || band.width < BAND_MIN_PX;
                const said = `${graph.nodes[link.source].name} to ${graph.nodes[link.target].name}: ${fmt(link.value * part)} of ${fmt(link.value)} came through ${trace.name} (${formatPercent(part)})`;
                let el;
                if (thin) {
                    el = make(doc, 'path', {
                        class: 'sankey-trace sankey-trace-thin', d: centerPath(band), fill: 'none', stroke: paint,
                        'stroke-width': 1.5, 'stroke-dasharray': '4 3', 'data-link': link.index, 'data-trace': trace.node
                    });
                } else if (view.traceStyle === 'line') {
                    el = make(doc, 'path', {
                        class: 'sankey-trace sankey-trace-line', d: centerPath(band), fill: 'none', stroke: paint,
                        'stroke-width': 2, 'data-link': link.index, 'data-trace': trace.node
                    });
                } else {
                    el = make(doc, 'path', {
                        class: 'sankey-trace', d: ribbonPath(band), fill: paint, 'fill-opacity': 0.92,
                        'data-link': link.index, 'data-trace': trace.node
                    });
                }
                el.appendChild(make(doc, 'title', {}, said));
                bandGroup.appendChild(el);
                if (view.traceStyle === 'band') continue;
                // The stream's own shape, repeated along the middle of its band.
                for (const at of centerPoints(band, MARK_SPACING, MARK_PHASES[order % MARK_PHASES.length])) {
                    marks.push(make(doc, 'path', {
                        class: 'sankey-trace-mark', d: traceMarkPath(order, at.x, at.y), fill: palette.surface,
                        stroke: palette.ink, 'stroke-width': 1.1, 'stroke-linejoin': 'round', 'pointer-events': 'none',
                        'data-link': link.index, 'data-trace': trace.node, 'data-shape': TRACE_SHAPES[order % TRACE_SHAPES.length].id
                    }));
                }
            }
        }
        // Marks go on after every band, so a neighboring band never covers one.
        bandGroup.append(...marks);
        svg.appendChild(bandGroup);
    }

    if (view.showMissing && layout.stubs.length) {
        const stubGroup = make(doc, 'g', { class: 'sankey-stubs' });
        const gap = layout.maxLayer > 0 ? (layout.bounds.right - layout.bounds.left) / layout.maxLayer : 60;
        const length = Math.max(10, Math.min(30, gap / 4));
        for (const stub of layout.stubs) {
            const node = graph.nodes[stub.node];
            const x = stub.side === 'out' ? stub.x : stub.x - length;
            const rect = make(doc, 'rect', {
                class: 'sankey-stub', x, y: stub.y0, width: length, height: Math.max(1, stub.y1 - stub.y0),
                fill: 'url(#sankeyHatch)', stroke: palette.missing, 'stroke-width': 1, 'data-node': stub.node, 'data-side': stub.side
            });
            const what = stub.side === 'out' ? 'entered and is not accounted for leaving' : 'leaves and is not accounted for entering';
            rect.appendChild(make(doc, 'title', {}, `${node.name}: ${fmt(stub.value)} ${what}`));
            stubGroup.appendChild(rect);
        }
        svg.appendChild(stubGroup);
    }

    const nodeGroup = make(doc, 'g', { class: 'sankey-nodes' });
    for (const node of layout.nodes) {
        const b = balance.nodes[node.index];
        const detail = b.role === 'internal'
            ? `in ${fmt(b.inflow)}, out ${fmt(b.outflow)}`
            : `${b.role} ${fmt(node.value)}`;
        const rect = make(doc, 'rect', {
            class: 'sankey-node', x: node.x0, y: node.y0, width: node.x1 - node.x0, height: Math.max(1, node.height),
            rx: 2, fill: colors[node.index], 'data-node': node.index,
            tabindex: view.interactive ? 0 : null,
            role: view.interactive ? 'img' : null,
            'aria-label': view.interactive
                ? `${node.name}: ${detail}${traces.some((t) => t.node === node.index) ? ', traced' : ''}. Drag, or use the arrow keys, to move it${node.pinned ? '. Delete returns it to its automatic place' : ''}. T traces where it goes`
                : null
        });
        rect.appendChild(make(doc, 'title', {}, `${node.name}: ${detail}`));
        if (view.interactive) {
            // Invisible grab area: half the column padding above and below, so
            // neighbors in a column never claim each other's pointer.
            const reach = Math.min(HIT_REACH, layout.padding / 2);
            nodeGroup.appendChild(make(doc, 'rect', {
                class: 'sankey-node-hit', x: node.x0 - HIT_SIDE, y: node.y0 - reach,
                width: node.x1 - node.x0 + 2 * HIT_SIDE, height: Math.max(1, node.height) + 2 * reach,
                fill: '#000000', 'fill-opacity': 0, 'pointer-events': 'all', 'data-node': node.index
            }));
        }
        nodeGroup.appendChild(rect);
        // A traced node wears its mark, which is the key to the marks on the flows.
        const order = traces.findIndex((t) => t.node === node.index);
        if (order >= 0 && view.traceStyle !== 'band') {
            nodeGroup.appendChild(make(doc, 'path', {
                class: 'sankey-node-mark', d: traceMarkPath(order, (node.x0 + node.x1) / 2, (node.y0 + node.y1) / 2, MARK_RADIUS + 1),
                fill: palette.surface, stroke: palette.ink, 'stroke-width': 1.1, 'stroke-linejoin': 'round', 'pointer-events': 'none',
                'data-node': node.index, 'data-shape': TRACE_SHAPES[order % TRACE_SHAPES.length].id
            }));
        }
    }
    svg.appendChild(nodeGroup);

    if (view.showLinkValues) {
        const linkLabels = make(doc, 'g', { class: 'sankey-link-labels' });
        for (const link of layout.links) {
            // A value printed on a ribbon thinner than the text only adds clutter.
            if (link.width < view.fontSize) continue;
            const at = linkLabelPoint(link);
            linkLabels.appendChild(make(doc, 'text', {
                x: at.x, y: at.y + (view.fontSize - 2) * 0.35,
                'text-anchor': 'middle', 'font-size': view.fontSize - 2, fill: palette.ink, ...halo(palette)
            }, fmt(link.value)));
        }
        svg.appendChild(linkLabels);
    }

    const labelGroup = make(doc, 'g', { class: 'sankey-labels' });
    const lineHeight = Math.round(view.fontSize * 1.25);
    // Text is measured on a canvas where there is one, and estimated where there is not.
    let ruler = null;
    try { ruler = doc.createElement('canvas').getContext('2d'); } catch (e) { ruler = null; }
    const textWidth = (text, size, weight = 400) => {
        if (!ruler) return text.length * size * 0.6;
        ruler.font = `${weight} ${size}px ${FONT}`;
        return ruler.measureText(text).width;
    };
    // What a label must keep off: every node, the title, the footnote, and each label once placed.
    const labelTop = view.title ? margin + 22 : 2;
    const footnote = footnoteText(layout, traces, view.traceStyle);
    const obstacles = layout.nodes.map((n) => ({ x0: n.x0, x1: n.x1, y0: n.y0, y1: Math.max(n.y1, n.y0 + 1), owner: n.index }));
    if (footnote) {
        obstacles.push({
            x0: margin, x1: margin + textWidth(footnote, view.fontSize - 1),
            y0: height - margin - view.fontSize, y1: height, owner: -1
        });
    }
    // Shortest nodes first: they have the least room to dodge, so they get first pick.
    const labelOrder = [...layout.nodes].sort((a, b) => (a.height - b.height) || (a.index - b.index));
    for (const node of labelOrder) {
        const b = balance.nodes[node.index];
        const extras = [];
        if (view.showValues) extras.push(fmt(node.value));
        if (view.showPercent) extras.push(share(node.value));
        const extraText = view.showValues && view.showPercent ? `${extras[0]} (${extras[1]})` : (extras[0] || '');
        // Labels go to the right of their node, where the next column's ribbons
        // start, and flip left only when they would run off the edge. Flipping
        // at the midline instead makes the two middle columns write over each other.
        const estimate = textWidth(node.name, view.fontSize, 600)
            + (extraText ? 6 + textWidth(extraText, view.fontSize) : 0) + LABEL_GAP;
        const preferRight = node.x1 + 6 + estimate <= width - 2;
        const lines = [];
        if (view.showMissing && !b.balanced) {
            lines.push({ text: `${b.residual > 0 ? 'Missing outflow' : 'Missing inflow'} ${fmt(Math.abs(b.residual))}`, weight: 600, fill: palette.ink });
        }
        if (parsed.notes[node.name]) {
            lines.push({ text: parsed.notes[node.name], style: 'italic', fill: palette.inkSecondary });
        }

        // A label that would sit on another label, a node, the title or the
        // footnote looks for the nearest clear place: along its own node, then
        // on the node's other side, then a few lines above or below it, where
        // a leader ties it back. Widths are estimated, which is enough to dodge.
        const blockWidth = Math.max(estimate, ...lines.map((l) => textWidth(l.text, view.fontSize - 1, l.weight || 400) + LABEL_GAP));
        const blockHeight = (lines.length + 1) * lineHeight;
        const anchor = (right) => (right ? node.x1 + 6 : node.x0 - 6);
        const boxAt = (right, baseline) => ({
            x0: right ? anchor(right) : anchor(right) - blockWidth, x1: right ? anchor(right) + blockWidth : anchor(right),
            y0: baseline - view.fontSize, y1: baseline - view.fontSize + blockHeight
        });
        const clear = (box) => box.y0 >= labelTop && box.y1 <= height - 2
            && obstacles.every((p) => p.owner === node.index || box.x1 < p.x0 || box.x0 > p.x1 || box.y1 < p.y0 || box.y0 > p.y1);
        const fits = (right) => (right ? node.x1 + 6 + blockWidth <= width - 2 : node.x0 - 6 - blockWidth >= 2);
        const centered = (node.y0 + node.y1) / 2 - (lines.length * lineHeight) / 2 + view.fontSize * 0.35;
        const room = Math.floor(Math.max(0, node.height - blockHeight) / 2 / lineHeight);
        const sides = [preferRight, !preferRight].filter((right) => right === preferRight || fits(right));
        const tries = [];
        for (const right of sides) {
            tries.push([right, 0]);
            for (let k = 1; k <= room; k++) tries.push([right, -k], [right, k]);
        }
        for (const right of sides) {
            for (let k = room + 1; k <= room + LABEL_LIFT; k++) tries.push([right, -k], [right, k]);
        }
        const [onRight, shift] = tries.find(([right, k]) => clear(boxAt(right, centered + k * lineHeight))) || [preferRight, 0];
        const x = anchor(onRight);
        const first = centered + shift * lineHeight;
        obstacles.push({ ...boxAt(onRight, first), owner: -1 });

        if (Math.abs(shift) > room) {
            labelGroup.appendChild(make(doc, 'line', {
                class: 'sankey-leader', x1: onRight ? node.x1 : node.x0, y1: (node.y0 + node.y1) / 2,
                x2: x, y2: first - view.fontSize * 0.35, stroke: palette.inkSecondary, 'stroke-width': 1
            }));
        }

        const text = make(doc, 'text', {
            class: 'sankey-label', x, y: first, 'text-anchor': onRight ? 'start' : 'end', fill: palette.ink,
            'data-node': node.index, ...halo(palette)
        });
        text.appendChild(make(doc, 'tspan', { 'font-weight': 600 }, node.name));
        if (extraText) {
            text.appendChild(make(doc, 'tspan', { dx: 6, fill: palette.inkSecondary }, extraText));
        }
        lines.forEach((line) => {
            text.appendChild(make(doc, 'tspan', {
                class: 'sankey-label-extra', x, dy: lineHeight, fill: line.fill,
                'font-weight': line.weight || null, 'font-style': line.style || null, 'font-size': view.fontSize - 1
            }, line.text));
        });
        labelGroup.appendChild(text);
    }
    svg.appendChild(labelGroup);

    if (footnote) {
        svg.appendChild(make(doc, 'text', {
            class: 'sankey-footnote', x: margin, y: height - margin, 'font-size': view.fontSize - 1, fill: palette.inkSecondary
        }, footnote));
    }

    return svg;
}
