// Fishbone layout: the board and a measure function in, positions out. Pure,
// so the same tree always gives the same picture, and the spec can run it
// with a fixed-width measure.
//
// Each category is laid out once in two coordinates: d, the distance from
// the spine, and u, the offset from its bone along the horizontal. A row of
// text never crosses its bone because its right edge is set by the bone at
// the row's far edge. Above the spine y = spine - d, below y = spine + d, so
// the below side is the exact mirror and the text still reads top to bottom.

import { ROOT, BIN_ID, liveChildren, live } from './fishbone-ops.js';

export const METRICS = Object.freeze({
    font: 13, rowH: 18, weight: 400,
    labelFont: 14, labelRowH: 19, labelWeight: 600, labelPadX: 8, labelPadY: 5,
    headFont: 15, headRowH: 20, headWeight: 600, headPad: 12,
    evFont: 11, evRowH: 15,
    pad: 4, indent: 16, minLine: 30, markW: 16, lockW: 13, rowGap: 8,
    spineGap: 14, labelGap: 10, pairGap: 28, margin: 24, binGap: 28, binPad: 10, binTitleH: 22,
    emptyText: 'nothing listed'
});

/** Greedy word wrap. A word wider than the line is broken by characters. */
export function wrapText(text, maxWidth, measure, size, weight = 400) {
    const words = String(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [''];
    const lines = [];
    let current = '';
    const push = (word) => {
        if (measure(word, size, weight) <= maxWidth) return [word];
        const parts = [];
        let piece = '';
        for (const ch of word) {
            if (piece && measure(piece + ch, size, weight) > maxWidth) { parts.push(piece); piece = ch; }
            else piece += ch;
        }
        if (piece) parts.push(piece);
        return parts;
    };
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (measure(candidate, size, weight) <= maxWidth) { current = candidate; continue; }
        if (current) lines.push(current);
        const parts = push(word);
        current = parts.pop();
        lines.push(...parts);
    }
    if (current) lines.push(current);
    return lines;
}

const r2 = (v) => Math.round(v * 100) / 100;

/** Room left of a cause's first line for its status mark, lock and proposal. */
export function reserveFor(node, m = METRICS) {
    return m.markW + (node.lock !== 'none' ? m.lockW : 0) + (node.proposal ? m.markW : 0);
}

/** Rows for one category, in t (offset from the far end of its block). */
function blockFor(board, catId, ctx) {
    const { m, measure, wrapPx, showEvidence } = ctx;
    const rows = [];
    let t = 0;
    let wide = 0;
    const place = (id, depth) => {
        const node = board.nodes[id];
        const reserve = reserveFor(node, m);
        const lines = wrapText(node.text, Math.max(wrapPx - reserve, m.font * 4), measure, m.font, node.status === 'verified' ? 700 : m.weight);
        const widths = lines.map((l) => measure(l, m.font, node.status === 'verified' ? 700 : m.weight));
        const r = -(depth - 1) * m.indent;
        const row = { nodeId: id, depth, r, lines, widths, reserve, t0: t, evidence: [] };
        t += lines.length * m.rowH;
        const lineLen = Math.max(Math.max(...widths) + reserve + 2 * m.pad, m.minLine);
        row.lineLen = lineLen;
        wide = Math.max(wide, lineLen - r);
        widths.forEach((w, i) => { wide = Math.max(wide, m.pad + w + (i === 0 ? reserve : 0) - r); });
        if (showEvidence) {
            for (const ev of node.evidence) {
                const evLines = wrapText(ev.text, wrapPx, measure, m.evFont);
                const evWidths = evLines.map((l) => measure(l, m.evFont));
                row.evidence.push({ lines: evLines, widths: evWidths, t0: t });
                t += evLines.length * m.evRowH;
                evWidths.forEach((w) => { wide = Math.max(wide, m.pad + w + m.indent - r); });
            }
        }
        t += m.rowGap;
        rows.push(row);
        for (const kid of liveChildren(board, id)) place(kid, depth + 1);
    };
    const kids = liveChildren(board, catId);
    for (const kid of kids) place(kid, 1);
    let empty = null;
    if (!kids.length) {
        const w = measure(m.emptyText, m.font);
        empty = { t0: 0, width: w };
        t = m.rowH + m.rowGap;
        wide = Math.max(wide, w + 2 * m.pad);
    }
    const H = Math.max(t, 2 * m.rowH);
    return { rows, H, wide, empty };
}

/**
 * Lay out a board. Returns everything the renderer draws, in pixels:
 * { width, height, spine, head, bones, items, bin }.
 */
export function layoutBoard(board, { measure, showEvidence = false, metrics = METRICS } = {}) {
    const m = metrics;
    const settings = board.settings;
    const theta = (settings.angle * Math.PI) / 180;
    const cot = 1 / Math.tan(theta);
    const wrapPx = settings.wrap * m.font;
    const ctx = { m, measure, wrapPx, showEvidence };

    const categories = liveChildren(board, ROOT)
        .filter((id) => board.nodes[id].kind === 'category')
        .filter((id) => settings.showEmpty || liveChildren(board, id).length > 0);

    // Each band in d and u, before it is placed on the spine.
    const bands = categories.map((id, i) => {
        const block = blockFor(board, id, ctx);
        const labelLines = wrapText(board.nodes[id].text || '(blank)', wrapPx, measure, m.labelFont, m.labelWeight);
        const labelW = Math.max(...labelLines.map((l) => measure(l, m.labelFont, m.labelWeight))) + 2 * m.labelPadX;
        const labelH = labelLines.length * m.labelRowH + 2 * m.labelPadY;
        const boneD = m.spineGap + block.H + m.labelGap;
        // The band reaches past the text by one row's lean, so no row leaves it.
        const W = block.wide + m.rowH * cot + m.pad;
        const left = boneD * cot + Math.max(W, labelW / 2);
        const right = Math.max(0, labelW / 2 - boneD * cot);
        return { id, side: i % 2 === 0 ? 'above' : 'below', block, labelLines, labelW, labelH, boneD, W, left, right, reach: boneD + labelH };
    });

    const headLines = wrapText(board.effect || board.title || 'Problem', wrapPx, measure, m.headFont, m.headWeight);
    const headW = Math.max(...headLines.map((l) => measure(l, m.headFont, m.headWeight))) + 2 * m.headPad;
    const headH = headLines.length * m.headRowH + 2 * m.headPad;

    const reachAbove = Math.max(0, ...bands.filter((b) => b.side === 'above').map((b) => b.reach));
    const reachBelow = Math.max(0, ...bands.filter((b) => b.side === 'below').map((b) => b.reach));
    const spineY = m.margin + Math.max(reachAbove, headH / 2);

    // One slot per above and below pair, as wide as the wider band plus a gap.
    const slots = [];
    let cursor = m.margin + m.pairGap;
    for (let p = 0; p * 2 < bands.length; p++) {
        const pair = bands.slice(p * 2, p * 2 + 2);
        const left = Math.max(...pair.map((b) => b.left));
        const right = Math.max(...pair.map((b) => b.right));
        const boneX = cursor + left;
        slots.push({ x0: cursor, x1: boneX + right, boneX });
        for (const b of pair) b.boneX = boneX;
        cursor = boneX + right + m.pairGap;
    }
    const headX = bands.length ? cursor : m.margin + 120;

    const items = [];
    const bones = [];
    for (const b of bands) {
        const sign = b.side === 'above' ? -1 : 1;
        const Y = (d) => r2(spineY + sign * d);
        const xBone = (d) => b.boneX - d * cot;
        const dFar = m.spineGap + b.block.H;
        const top = (d0, d1) => Math.min(Y(d0), Y(d1));
        // Place a text block spanning [dNear, dNear + n * rowH], first line farthest above and nearest below.
        const textLines = (texts, widths, dNear, rowH, rightU, firstExtra) => texts.map((text, i) => {
            const k = sign < 0 ? texts.length - 1 - i : i;
            const lo = dNear + k * rowH;
            const hi = lo + rowH;
            const x1 = r2(xBone(hi) + rightU - m.pad);
            const extra = i === 0 ? firstExtra : 0;
            return { text, x0: r2(x1 - widths[i] - extra), x1, y0: top(lo, hi), y1: r2(top(lo, hi) + rowH), textX0: r2(x1 - widths[i]) };
        });

        const byId = new Map();
        for (const row of b.block.rows) {
            const n = row.lines.length;
            const dTextFar = dFar - row.t0;
            const dNear = dTextFar - n * m.rowH;
            const lines = textLines(row.lines, row.widths, dNear, m.rowH, row.r, row.reserve);
            const uy = Y(dNear);
            const underline = { x0: r2(xBone(dNear) + row.r - row.lineLen), x1: r2(xBone(dNear) + row.r), y: uy };
            let connector = null;
            if (row.depth > 1) {
                const parent = byId.get(board.nodes[row.nodeId].parentId);
                connector = { x0: underline.x1, y0: uy, x1: r2(xBone(parent.dNear) + row.r), y1: parent.underline.y };
            }
            const evidence = row.evidence.map((ev) => {
                const evNear = dFar - ev.t0 - ev.lines.length * m.evRowH;
                return { lines: textLines(ev.lines, ev.widths, evNear, m.evRowH, row.r - m.indent, 0) };
            });
            const item = {
                nodeId: row.nodeId, categoryId: b.id, side: b.side, depth: row.depth,
                lines, underline, connector, evidence, dNear, reserve: row.reserve
            };
            byId.set(row.nodeId, item);
            items.push(item);
        }
        const boneTop = { x: r2(xBone(b.boneD)), y: Y(b.boneD) };
        const labelY0 = top(b.boneD, b.boneD + b.labelH);
        const label = {
            lines: b.labelLines,
            x0: r2(boneTop.x - b.labelW / 2), x1: r2(boneTop.x + b.labelW / 2),
            y0: labelY0, y1: r2(labelY0 + b.labelH)
        };
        let empty = null;
        if (b.block.empty) {
            const dNear = dFar - m.rowH;
            const x1 = r2(xBone(dNear + m.rowH) - m.pad);
            empty = { text: m.emptyText, x0: r2(x1 - b.block.empty.width), x1, y0: top(dNear, dNear + m.rowH), y1: r2(top(dNear, dNear + m.rowH) + m.rowH) };
        }
        const band = [
            [b.boneX, spineY], [r2(b.boneX - b.W), spineY],
            [r2(xBone(b.boneD) - b.W), Y(b.boneD)], [boneTop.x, Y(b.boneD)]
        ];
        bones.push({
            categoryId: b.id, side: b.side, x0: b.boneX, y0: spineY, x1: boneTop.x, y1: boneTop.y,
            label, empty, band, height: b.reach
        });
    }

    const head = { x0: headX, x1: r2(headX + headW), y0: r2(spineY - headH / 2), y1: r2(spineY + headH / 2), lines: headLines };
    const spine = { x0: m.margin, x1: headX, y: spineY };
    let bottom = Math.max(spineY + reachBelow, head.y1);
    let right = head.x1;

    let bin = null;
    if (live(board, BIN_ID)) {
        const binItems = [];
        let y = bottom + m.binGap + m.binTitleH;
        const x0 = m.margin;
        let widest = measure('Unsorted', m.labelFont, m.labelWeight);
        const walk = (id, depth) => {
            const node = board.nodes[id];
            const reserve = reserveFor(node, m);
            const lines = wrapText(node.text, wrapPx, measure, m.font, node.status === 'verified' ? 700 : m.weight);
            const widths = lines.map((l) => measure(l, m.font, node.status === 'verified' ? 700 : m.weight));
            const left = x0 + m.binPad + (depth - 1) * m.indent;
            const boxLines = lines.map((text, i) => {
                const textX0 = r2(left + reserve);
                const line = { text, x0: r2(left), x1: r2(textX0 + widths[i]), y0: r2(y), y1: r2(y + m.rowH), textX0 };
                y += m.rowH;
                widest = Math.max(widest, line.x1 - x0);
                return line;
            });
            binItems.push({ nodeId: id, categoryId: BIN_ID, side: 'bin', depth, lines: boxLines, underline: null, connector: null, evidence: [], reserve, anchor: 'start' });
            y += m.rowGap;
            for (const kid of liveChildren(board, id)) walk(kid, depth + 1);
        };
        for (const kid of liveChildren(board, BIN_ID)) walk(kid, 1);
        if (!binItems.length) y += m.rowH;
        const y0 = bottom + m.binGap;
        bin = { x0, y0: r2(y0), x1: r2(x0 + widest + 2 * m.binPad), y1: r2(y + m.binPad), title: 'Unsorted', items: binItems };
        items.push(...binItems);
        bottom = bin.y1;
        right = Math.max(right, bin.x1);
    }

    return {
        width: Math.ceil(right + m.margin),
        height: Math.ceil(bottom + m.margin),
        spine, head, bones, items, bin, slots, metrics: m,
        heights: Object.fromEntries(bones.map((bone) => [bone.categoryId, bone.height]))
    };
}

/** A fixed-width measure for tests and for pages with no canvas. */
export const fixedMeasure = (text, size) => String(text).length * size * 0.6;
