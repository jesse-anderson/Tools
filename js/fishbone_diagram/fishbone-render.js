// SVG for a laid-out board. Every color is a literal attribute, so the SVG on
// screen is the export once the live layers (focus stops, selection) are left
// out. Status is never shown by color alone: each has its own line style,
// text style and mark, and the "colors off" palette keeps all of them.

import { BIN_ID, STATUS_LABELS, ancestors, liveChildren } from './fishbone-ops.js';
import { wrapText } from './fishbone-layout.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const FONT = "'Space Grotesk', system-ui, 'Segoe UI', Arial, sans-serif";

export const PALETTES = Object.freeze({
    light: Object.freeze({
        bg: '#ffffff', ink: '#1f2937', muted: '#4b5563', line: '#374151', bone: '#1f2937', spine: '#111827',
        accent: '#6d28d9', ruled: '#9ca3af', labelFill: '#f3f0ff', labelStroke: '#6d28d9', labelText: '#1f2937',
        headFill: '#6d28d9', headText: '#ffffff', binFill: '#f9fafb', binStroke: '#6b7280'
    }),
    dark: Object.freeze({
        bg: '#0f172a', ink: '#e5e7eb', muted: '#b6bfcc', line: '#cbd5e1', bone: '#e5e7eb', spine: '#f3f4f6',
        accent: '#c4b5fd', ruled: '#64748b', labelFill: '#1e1b4b', labelStroke: '#a78bfa', labelText: '#ede9fe',
        headFill: '#4c1d95', headText: '#ffffff', binFill: '#111c33', binStroke: '#94a3b8'
    })
});

/** The same palette with every hue replaced by ink, for colors off and black and white print. */
export function monochrome(p) {
    return { ...p, accent: p.ink, ruled: p.line, labelFill: p.bg, labelStroke: p.ink, labelText: p.ink, headFill: p.bg, headText: p.ink, binFill: p.bg, binStroke: p.ink };
}

function make(doc, tag, attrs = {}, text = null) {
    const el = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
    }
    if (text !== null) el.textContent = text;
    return el;
}

/** The accessible name of a cause: "Machines, Hot runner nozzle 3 partly blocked, verified". */
export function causeLabel(board, id) {
    const node = board.nodes[id];
    const chain = ancestors(board, id);
    const top = chain.length ? chain[chain.length - 1] : node;
    const parts = [top.kind === 'unsorted' ? 'Unsorted' : (top.text || 'blank category')];
    if (node !== top) parts.push(node.text || 'blank');
    if (node.kind === 'cause') parts.push(STATUS_LABELS[node.status]);
    if (node.proposal) parts.push(`proposed ${STATUS_LABELS[node.proposal.status]}`);
    if (node.lock !== 'none') parts.push(node.lock === 'branch' ? 'branch locked' : 'locked');
    if (node.owner) parts.push(`owner ${node.owner}`);
    return parts.join(', ');
}

/** A status mark centered at (cx, cy). Outline only when it is a proposal. */
function mark(doc, status, cx, cy, color, outline) {
    const g = make(doc, 'g', { class: 'fb-mark', 'data-mark': status || 'none' });
    if (outline) g.appendChild(make(doc, 'circle', { cx, cy, r: 6.5, fill: 'none', stroke: color, 'stroke-width': 1, 'stroke-dasharray': '2 2' }));
    const w = outline ? 1.2 : 1.8;
    if (status === 'verified') {
        g.appendChild(make(doc, 'polyline', { points: `${cx - 4},${cy} ${cx - 1},${cy + 3.5} ${cx + 4.5},${cy - 4}`, fill: 'none', stroke: color, 'stroke-width': w + 0.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    } else if (status === 'ruledOut') {
        g.appendChild(make(doc, 'path', { d: `M${cx - 3.5} ${cy - 3.5}L${cx + 3.5} ${cy + 3.5}M${cx + 3.5} ${cy - 3.5}L${cx - 3.5} ${cy + 3.5}`, stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' }));
    } else if (status === 'suspected') {
        g.appendChild(make(doc, 'path', { d: `M${cx - 3} ${cy - 2.5}C${cx - 3} ${cy - 6.5} ${cx + 3.5} ${cy - 6.5} ${cx + 3.5} ${cy - 2.5}C${cx + 3.5} ${cy} ${cx} ${cy} ${cx} ${cy + 2}`, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round' }));
        g.appendChild(make(doc, 'circle', { cx, cy: cy + 4.6, r: outline ? 0.9 : 1.2, fill: color }));
    } else if (outline) {
        g.appendChild(make(doc, 'circle', { cx, cy, r: 1.5, fill: color }));
    }
    return g;
}

function padlock(doc, cx, cy, color, branch) {
    const g = make(doc, 'g', { class: 'fb-lock', 'data-lock': branch ? 'branch' : 'item' });
    g.appendChild(make(doc, 'path', { d: `M${cx - 2.5} ${cy - 1}V${cy - 3}A2.5 2.5 0 0 1 ${cx + 2.5} ${cy - 3}V${cy - 1}`, fill: 'none', stroke: color, 'stroke-width': 1.3 }));
    g.appendChild(make(doc, 'rect', { x: cx - 4, y: cy - 1, width: 8, height: 6, rx: 1, fill: branch ? color : 'none', stroke: color, 'stroke-width': 1.3 }));
    return g;
}

const LINE_STYLE = {
    '': (p) => ({ stroke: p.line, 'stroke-width': 1.2 }),
    suspected: (p) => ({ stroke: p.line, 'stroke-width': 1.2, 'stroke-dasharray': '5 3' }),
    verified: (p) => ({ stroke: p.accent, 'stroke-width': 3 }),
    ruledOut: (p) => ({ stroke: p.ruled, 'stroke-width': 1.2 })
};

function drawItem(doc, board, item, p, m, opts) {
    const node = board.nodes[item.nodeId];
    const status = node.status || '';
    const attrs = { class: 'fb-item', 'data-node-id': item.nodeId, 'data-status': status || 'none' };
    if (opts.interactive) {
        attrs.tabindex = item.nodeId === opts.focusId ? 0 : -1;
        attrs.role = 'treeitem';
        attrs['aria-label'] = causeLabel(board, item.nodeId);
        if (item.nodeId === opts.selectedId) attrs.class += ' is-selected';
    }
    const g = make(doc, 'g', attrs);
    const style = (LINE_STYLE[status] || LINE_STYLE[''])(p);
    if (opts.interactive) {
        const xs = item.lines.flatMap((l) => [l.x0, l.x1]);
        const ys = item.lines.flatMap((l) => [l.y0, l.y1]);
        g.appendChild(make(doc, 'rect', {
            class: 'fb-hit', x: Math.min(...xs) - 3, y: Math.min(...ys) - 2,
            width: Math.max(...xs) - Math.min(...xs) + 6, height: Math.max(...ys) - Math.min(...ys) + 5,
            rx: 3, fill: 'transparent'
        }));
    }
    if (item.connector) {
        const c = item.connector;
        g.appendChild(make(doc, 'line', { class: 'fb-connector', x1: c.x0, y1: c.y0, x2: c.x1, y2: c.y1, ...style, 'stroke-linecap': 'round' }));
    }
    if (item.underline) {
        const u = item.underline;
        g.appendChild(make(doc, 'line', { class: 'fb-underline', x1: u.x0, y1: u.y, x2: u.x1, y2: u.y, ...style, 'stroke-linecap': 'round' }));
    }
    const weight = status === 'verified' ? 700 : 400;
    const color = status === 'ruledOut' ? p.muted : p.ink;
    // Text sits tight against its own line: above it over the spine, below it under the spine.
    const baseline = item.side === 'below' ? 0.68 : 0.76;
    item.lines.forEach((line, i) => {
        g.appendChild(make(doc, 'text', {
            x: line.textX0, y: line.y0 + m.rowH * baseline, 'font-size': m.font, 'font-weight': weight, fill: color
        }, line.text));
        if (status === 'ruledOut' && line.text) {
            const y = line.y0 + m.rowH * (baseline - 0.25);
            g.appendChild(make(doc, 'line', { class: 'fb-strike', x1: line.textX0, y1: y, x2: line.x1, y2: y, stroke: p.muted, 'stroke-width': 1.2 }));
        }
        if (i === 0) {
            const cy = line.y0 + m.rowH / 2;
            let cx = line.x0 + m.markW / 2;
            g.appendChild(mark(doc, status, cx, cy, status === 'verified' ? p.accent : color, false));
            cx += m.markW / 2;
            if (node.lock !== 'none') {
                g.appendChild(padlock(doc, cx + m.lockW / 2, cy, p.ink, node.lock === 'branch'));
                cx += m.lockW;
            }
            if (node.proposal) g.appendChild(mark(doc, node.proposal.status, cx + m.markW / 2, cy, p.ink, true));
        }
    });
    for (const ev of item.evidence) {
        for (const line of ev.lines) {
            g.appendChild(make(doc, 'text', { class: 'fb-evidence', x: line.textX0, y: line.y0 + m.evRowH * 0.75, 'font-size': m.evFont, fill: p.muted }, line.text));
        }
    }
    return g;
}

/**
 * Build the SVG. opts: { palette, interactive, focusId, selectedId, header,
 * measure, title }. header is { title, tally, date } for exports, or null.
 */
export function renderBoard(doc, board, layout, opts = {}) {
    const p = opts.palette || PALETTES.light;
    const m = layout.metrics;
    let headerLines = [];
    let headerH = 0;
    if (opts.header) {
        const width = layout.width - 2 * m.margin;
        const tally = wrapText(opts.header.tally, width, opts.measure, 12);
        headerLines = [
            ...(opts.header.title ? [{ text: opts.header.title, size: 17, weight: 700, h: 24 }] : []),
            ...tally.map((t) => ({ text: t, size: 12, weight: 400, h: 17 })),
            ...(opts.header.date ? [{ text: opts.header.date, size: 11, weight: 400, h: 16 }] : [])
        ];
        headerH = headerLines.reduce((a, l) => a + l.h, 0) + m.margin / 2;
    }
    const width = layout.width;
    const height = layout.height + headerH;
    const svg = make(doc, 'svg', {
        xmlns: SVG_NS, viewBox: `0 0 ${width} ${height}`, width, height,
        'font-family': FONT, role: 'img', 'aria-label': opts.title || 'Fishbone diagram'
    });
    svg.appendChild(make(doc, 'title', {}, opts.title || 'Fishbone diagram'));
    svg.appendChild(make(doc, 'defs'));
    svg.appendChild(make(doc, 'rect', { class: 'fb-bg', x: 0, y: 0, width, height, fill: p.bg }));
    if (headerLines.length) {
        const hg = make(doc, 'g', { class: 'fb-header' });
        let y = m.margin;
        for (const l of headerLines) {
            y += l.h;
            hg.appendChild(make(doc, 'text', { x: m.margin, y: y - 5, 'font-size': l.size, 'font-weight': l.weight, fill: l.weight === 700 ? p.ink : p.muted }, l.text));
        }
        svg.appendChild(hg);
    }
    const root = make(doc, 'g', { class: 'fb-diagram', transform: headerH ? `translate(0 ${headerH})` : null });
    svg.appendChild(root);

    const { spine, head } = layout;
    const spineG = make(doc, 'g', { class: 'fb-spine' });
    spineG.appendChild(make(doc, 'line', { x1: spine.x0, y1: spine.y, x2: spine.x1 - 8, y2: spine.y, stroke: p.spine, 'stroke-width': 3, 'stroke-linecap': 'round' }));
    spineG.appendChild(make(doc, 'polygon', { points: `${spine.x1},${spine.y} ${spine.x1 - 11},${spine.y - 6} ${spine.x1 - 11},${spine.y + 6}`, fill: p.spine }));
    root.appendChild(spineG);

    const headG = make(doc, 'g', { class: 'fb-head' });
    headG.appendChild(make(doc, 'rect', { x: head.x0, y: head.y0, width: head.x1 - head.x0, height: head.y1 - head.y0, rx: 8, fill: p.headFill, stroke: p.headFill, 'stroke-width': 1.5 }));
    head.lines.forEach((line, i) => {
        headG.appendChild(make(doc, 'text', {
            x: (head.x0 + head.x1) / 2, y: head.y0 + m.headPad + i * m.headRowH + m.headRowH * 0.74,
            'text-anchor': 'middle', 'font-size': m.headFont, 'font-weight': m.headWeight, fill: p.headText
        }, line));
    });
    root.appendChild(headG);

    for (const bone of layout.bones) {
        const g = make(doc, 'g', { class: 'fb-bone', 'data-category-id': bone.categoryId });
        g.appendChild(make(doc, 'line', { x1: bone.x0, y1: bone.y0, x2: bone.x1, y2: bone.y1, stroke: p.bone, 'stroke-width': 2, 'stroke-linecap': 'round' }));
        const l = bone.label;
        const labelAttrs = { class: 'fb-label', 'data-node-id': bone.categoryId };
        if (opts.interactive) {
            labelAttrs.tabindex = bone.categoryId === opts.focusId ? 0 : -1;
            labelAttrs.role = 'treeitem';
            labelAttrs['aria-label'] = `Category ${board.nodes[bone.categoryId].text || 'blank'}`;
            if (bone.categoryId === opts.selectedId) labelAttrs.class += ' is-selected';
        }
        const lg = make(doc, 'g', labelAttrs);
        lg.appendChild(make(doc, 'rect', { class: 'fb-label-box', x: l.x0, y: l.y0, width: l.x1 - l.x0, height: l.y1 - l.y0, rx: 5, fill: p.labelFill, stroke: p.labelStroke, 'stroke-width': 1.5 }));
        l.lines.forEach((line, i) => {
            lg.appendChild(make(doc, 'text', {
                x: (l.x0 + l.x1) / 2, y: l.y0 + m.labelPadY + i * m.labelRowH + m.labelRowH * 0.74,
                'text-anchor': 'middle', 'font-size': m.labelFont, 'font-weight': m.labelWeight, fill: p.labelText
            }, line));
        });
        if (board.nodes[bone.categoryId].lock !== 'none') {
            lg.appendChild(padlock(doc, l.x1 - 2, l.y0 + 2, p.ink, board.nodes[bone.categoryId].lock === 'branch'));
        }
        g.appendChild(lg);
        if (bone.empty) {
            const e = bone.empty;
            g.appendChild(make(doc, 'text', { class: 'fb-empty', x: e.x0, y: e.y0 + m.rowH * 0.72, 'font-size': m.font, 'font-style': 'italic', fill: p.muted }, e.text));
        }
        root.appendChild(g);
    }

    if (layout.bin) {
        const b = layout.bin;
        const g = make(doc, 'g', { class: 'fb-bin', 'data-node-id': BIN_ID });
        g.appendChild(make(doc, 'rect', { x: b.x0, y: b.y0, width: b.x1 - b.x0, height: b.y1 - b.y0, rx: 6, fill: p.binFill, stroke: p.binStroke, 'stroke-width': 1.2, 'stroke-dasharray': '6 4' }));
        const count = liveChildren(board, BIN_ID).length;
        g.appendChild(make(doc, 'text', { x: b.x0 + m.binPad, y: b.y0 + 16, 'font-size': m.labelFont, 'font-weight': m.labelWeight, fill: p.ink }, `${b.title} (${count})`));
        if (!b.items.length) {
            g.appendChild(make(doc, 'text', { class: 'fb-empty', x: b.x0 + m.binPad, y: b.y0 + m.binTitleH + m.rowH * 0.72, 'font-size': m.font, 'font-style': 'italic', fill: p.muted }, m.emptyText));
        }
        root.appendChild(g);
    }

    const items = make(doc, 'g', { class: 'fb-items' });
    for (const item of layout.items) items.appendChild(drawItem(doc, board, item, p, m, opts));
    root.appendChild(items);
    return svg;
}
