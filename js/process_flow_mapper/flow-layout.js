// Swimlane layout for the process flow mapper. Pure: text is measured by a
// function passed in, so there is no DOM here.
//
// A column per rank, a row band per lane, a vertical band per phase. Every
// step box is the same size. Connectors come from flow-route.js as gutters and
// tracks, and are turned into points here.

import { routeLinks } from './flow-route.js';

export const LAYOUT_DEFAULTS = Object.freeze({
    fontSize: 12,
    margin: 16,
    titleHeight: 0,
    summaryHeight: 0,
    footnoteHeight: 0,
    infoLines: 0,
    wrapWidth: 132,
    maxNameLines: 3,
    minBoxWidth: 112,
    boxPadX: 12,
    boxPadY: 9,
    gutterX: 22,
    gutterY: 22,
    trackGap: 9,
    phaseHeader: 26,
    laneHeaderMin: 84,
    laneHeaderMax: 150
});

// A decision is six-sided: its left and right ends come to a point this far in.
export const DECISION_CUT = 16;
// How far off the centre line a rework connector enters, as a share of the box height.
const REWORK_ENTRY = 0.25;
const LABEL_PAD = 7;
const PHASE_RULE_INSET = 6;

const estimate = (text, size) => text.length * size * 0.6;

/** Where the left outline of a step is at height y: boxes are flat, the other shapes are not. */
export function leftEdge(step, y) {
    const half = (step.y1 - step.y0) / 2;
    const dy = Math.min(half, Math.abs(y - (step.y0 + half)));
    if (step.kind === 'decision') return step.x0 + Math.min(DECISION_CUT, half) * (dy / half);
    if (step.kind === 'terminator') return step.x0 + half - Math.sqrt(Math.max(0, half * half - dy * dy));
    return step.x0;
}

/** Break text into at most maxLines lines no wider than width, ending in an ellipsis when cut. */
export function wrapText(text, width, maxLines, measure, size, weight) {
    const fits = (s) => measure(s, size, weight) <= width;
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (let word of words) {
        // A single word wider than the box is broken by characters.
        while (!fits(word) && word.length > 1) {
            let cut = word.length - 1;
            while (cut > 1 && !fits(`${line ? `${line} ` : ''}${word.slice(0, cut)}`)) cut -= 1;
            if (line && cut <= 1) { lines.push(line); line = ''; continue; }
            lines.push(`${line ? `${line} ` : ''}${word.slice(0, cut)}`);
            line = '';
            word = word.slice(cut);
        }
        const joined = line ? `${line} ${word}` : word;
        if (fits(joined)) line = joined;
        else { lines.push(line); line = word; }
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && !fits(`${last}…`)) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last}…`;
    return kept;
}

/**
 * Column of each step: the longest path from a start along forward exits,
 * never left of the first column of its own phase. Phases therefore occupy
 * runs of columns in the order they were typed.
 */
export function assignRanks(graph) {
    const { nodes, links, phases } = graph;
    const rank = new Array(nodes.length).fill(0);
    const pending = nodes.map((n) => n.inLinks.filter((li) => !links[li].rework).length);
    const phaseStart = phases.map(() => 0);
    const phaseEnd = phases.map(() => 0);
    let nextStart = 0;

    // Forward exits never lead to an earlier phase, so phases can be laid one after another.
    for (const phase of phases) {
        phaseStart[phase.index] = nextStart;
        const queue = nodes.filter((n) => n.phase === phase.index && pending[n.index] === 0).map((n) => n.index);
        let last = nextStart;
        for (let q = 0; q < queue.length; q++) {
            const n = queue[q];
            rank[n] = Math.max(rank[n], nextStart);
            last = Math.max(last, rank[n]);
            for (const li of nodes[n].outLinks) {
                const link = links[li];
                if (link.rework) continue;
                rank[link.target] = Math.max(rank[link.target], rank[n] + 1);
                pending[link.target] -= 1;
                if (pending[link.target] === 0 && nodes[link.target].phase === phase.index) queue.push(link.target);
            }
        }
        const any = nodes.some((n) => n.phase === phase.index);
        phaseEnd[phase.index] = last;
        if (any) nextStart = last + 1;
    }
    return { rank, phaseStart, phaseEnd, cols: Math.max(1, ...rank.map((r) => r + 1)) };
}

/**
 * Lay the graph out. options are LAYOUT_DEFAULTS overrides; measure is
 * (text, size, weight) => width in px, estimated when not given. labels is the
 * text printed on each exit, in link order; blank means none.
 */
export function computeLayout(graph, options = {}, measure = estimate, labels = []) {
    const opt = { ...LAYOUT_DEFAULTS };
    for (const [key, value] of Object.entries(options)) {
        if (key in LAYOUT_DEFAULTS && Number.isFinite(value)) opt[key] = value;
    }
    opt.fontSize = Math.min(20, Math.max(9, opt.fontSize));
    // The box keeps its proportions when the text size changes.
    if (!Number.isFinite(options.wrapWidth)) opt.wrapWidth = opt.fontSize * 11;
    const { nodes, links, lanes, phases } = graph;
    const { rank, phaseStart, phaseEnd, cols } = assignRanks(graph);
    const lineHeight = Math.round(opt.fontSize * 1.25);

    // Rows. Two steps of one lane in one column stack, and the lane grows to hold them.
    const laneRows = lanes.map(() => 1);
    const slot = new Array(nodes.length).fill(0);
    const taken = new Map();
    for (const node of nodes) {
        const key = `${node.lane},${rank[node.index]}`;
        const k = taken.get(key) || 0;
        taken.set(key, k + 1);
        slot[node.index] = k;
        laneRows[node.lane] = Math.max(laneRows[node.lane], k + 1);
    }
    const laneStart = [];
    let rows = 0;
    for (const count of laneRows) { laneStart.push(rows); rows += count; }

    const steps = nodes.map((n) => ({
        index: n.index,
        name: n.name,
        kind: n.kind,
        lane: n.lane,
        phase: n.phase,
        col: rank[n.index],
        row: laneStart[n.lane] + slot[n.index],
        lines: wrapText(n.name, opt.wrapWidth, opt.maxNameLines, measure, opt.fontSize, 600),
        x0: 0, x1: 0, y0: 0, y1: 0
    }));

    const nameLines = Math.max(1, ...steps.map((s) => s.lines.length));
    const widest = Math.max(0, ...steps.flatMap((s) => s.lines.map((l) => measure(l, opt.fontSize, 600))));
    const boxWidth = Math.max(opt.minBoxWidth, Math.ceil(widest) + 2 * opt.boxPadX);
    const boxHeight = (nameLines + opt.infoLines) * lineHeight + 2 * opt.boxPadY;

    const { routes, vertical, horizontal } = routeLinks(steps, links, cols, rows);

    // Lane header column, as wide as the longest lane name allows.
    const laneLabels = lanes.map((l) => wrapText(l.name, opt.laneHeaderMax - 16, 3, measure, opt.fontSize, 600));
    const laneHeader = Math.min(opt.laneHeaderMax, Math.max(opt.laneHeaderMin,
        Math.ceil(Math.max(0, ...laneLabels.flatMap((ls) => ls.map((l) => measure(l, opt.fontSize, 600))))) + 16));

    const hasPhases = phases.length > 1 || (phases[0] && phases[0].name !== '');
    const left = opt.margin + laneHeader;
    const top = opt.margin + opt.titleHeight + opt.summaryHeight + (hasPhases ? opt.phaseHeader : 0);

    // An exit label sits beside its own line, just past the turn, in room kept
    // for it: a track is as wide as the label it carries. So a label never lies
    // on another line or on a step, and nothing has to be nudged afterwards.
    const labelSize = opt.fontSize - 1;
    const labelRoom = links.map((_, i) => (labels[i] ? Math.ceil(measure(labels[i], labelSize, 400)) + LABEL_PAD : 0));

    // Horizontal: gutter, column, gutter, column, ..., gutter. Inside a gutter,
    // left to right: tracks leaving, direct tracks, a slot for the labels of
    // straight connectors, tracks arriving.
    const vGutters = vertical.map((v, k) => {
        const c = k - 1;
        const room = { dep: new Array(v.dep).fill(0), direct: new Array(v.direct).fill(0), straight: 0 };
        routes.forEach((route, i) => {
            if (route.kind === 'general' && route.depGutter === c) room.dep[route.depTrack] = Math.max(room.dep[route.depTrack], labelRoom[i]);
            if (route.kind === 'direct' && route.gutter === c) room.direct[route.track] = Math.max(room.direct[route.track], labelRoom[i]);
            if (route.kind === 'straight' && steps[links[i].source].col === c) room.straight = Math.max(room.straight, labelRoom[i]);
        });
        return { ...v, room, x0: 0, width: 0, dep: [], direct: [], arr: [], slot: 0 };
    });
    const colX = [];
    let x = left;
    for (let c = -1; c < cols; c++) {
        const g = vGutters[c + 1];
        if (c >= 0) { colX.push(x); x += boxWidth; }
        g.x0 = x;
        let cursor = x + opt.gutterX / 2;
        for (const zone of ['dep', 'direct']) {
            for (const room of g.room[zone]) {
                g[zone].push(cursor + opt.trackGap / 2);
                cursor += opt.trackGap + room;
            }
        }
        g.slot = cursor;
        cursor += g.room.straight;
        for (let t = 0; t < vertical[c + 1].arr; t++) {
            g.arr.push(cursor + opt.trackGap / 2);
            cursor += opt.trackGap;
        }
        g.width = cursor + opt.gutterX / 2 - x;
        x += g.width;
    }
    const right = x;

    // Vertical: gutter, row, gutter, row, ..., gutter.
    const hGutters = horizontal.map((count) => ({ tracks: count, y0: 0, height: opt.gutterY + count * opt.trackGap }));
    const rowY = [];
    let y = top;
    for (let r = 0; r <= rows; r++) {
        hGutters[r].y0 = y;
        y += hGutters[r].height;
        if (r < rows) { rowY.push(y); y += boxHeight; }
    }
    const bottom = y;

    for (const step of steps) {
        step.x0 = colX[step.col];
        step.x1 = step.x0 + boxWidth;
        step.y0 = rowY[step.row];
        step.y1 = step.y0 + boxHeight;
    }

    const trackY = (g, t) => hGutters[g].y0 + opt.gutterY / 2 + t * opt.trackGap + opt.trackGap / 2;
    const mid = (s) => (s.y0 + s.y1) / 2;

    const connectors = links.map((link, i) => {
        const s = steps[link.source];
        const t = steps[link.target];
        const route = routes[i];
        const sy = mid(s);
        let ty = mid(t);
        let points;
        let labelAt = null;
        if (route.kind === 'straight') {
            points = [[s.x1, sy], [t.x0, ty]];
            labelAt = { x: vGutters[s.col + 1].slot + 2, y: sy - 5 };
        } else {
            let turns;
            if (route.kind === 'direct') {
                const tx = vGutters[route.gutter + 1].direct[route.track];
                turns = [[tx, sy], [tx, ty]];
            } else {
                const xd = vGutters[route.depGutter + 1].dep[route.depTrack];
                const xa = vGutters[route.arrGutter + 1].arr[route.arrTrack];
                const yh = trackY(route.hGutter, route.hTrack);
                // Rework comes in off the centre line, on the side it arrives from,
                // so its arrowhead does not sit on the one already there.
                if (link.rework) ty += Math.sign(yh - ty) * boxHeight * REWORK_ENTRY;
                turns = [[xd, sy], [xd, yh], [xa, yh], [xa, ty]];
            }
            points = [[s.x1, sy], ...turns, [leftEdge(t, ty), ty]];
            const heads = Math.sign(turns[1][1] - sy);
            labelAt = { x: turns[0][0] + 5, y: heads > 0 ? sy + lineHeight : sy - 6 };
        }
        return {
            index: i,
            source: link.source,
            target: link.target,
            kind: route.kind,
            rework: link.rework,
            points,
            label: labels[i] || '',
            labelAt: labels[i] ? labelAt : null
        };
    });

    const laneBands = lanes.map((lane, i) => {
        const first = laneStart[i];
        const last = first + laneRows[i];
        return {
            index: i,
            name: lane.name,
            lines: laneLabels[i],
            y0: hGutters[first].y0,
            y1: last === rows ? bottom : hGutters[last].y0
        };
    });

    const phaseBands = hasPhases
        ? phases.filter((p) => nodes.some((n) => n.phase === p.index)).map((p) => {
            const c0 = phaseStart[p.index];
            const c1 = phaseEnd[p.index];
            // A band is bounded just inside the gutter on each side, left of every
            // track, so the rule between phases never lies on a connector.
            const g0 = vGutters[c0];
            const g1 = vGutters[c1 + 1];
            return {
                index: p.index,
                name: p.name,
                x0: c0 === 0 ? left : g0.x0 + PHASE_RULE_INSET,
                x1: c1 === cols - 1 ? right : g1.x0 + PHASE_RULE_INSET
            };
        })
        : [];

    return {
        options: opt,
        width: right + opt.margin,
        height: bottom + opt.margin + opt.footnoteHeight,
        area: { left, right, top, bottom, headerLeft: opt.margin },
        lineHeight,
        boxWidth,
        boxHeight,
        cols,
        rows,
        steps,
        connectors,
        lanes: laneBands,
        phases: phaseBands,
        gutters: {
            vertical: vGutters.map((g) => ({ x0: g.x0, x1: g.x0 + g.width })),
            horizontal: hGutters.map((g) => ({ y0: g.y0, y1: g.y0 + g.height }))
        }
    };
}
