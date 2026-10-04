// Swimlane layout for the process flow mapper. Pure: text is measured by a
// function passed in, so there is no DOM here.
//
// A column per rank, a row band per lane, a vertical band per phase. Every
// step box is the same size. Connectors come from flow-route.js as gutters and
// tracks, and are turned into points here.
//
// Lanes can also run down the page, with the work flowing from top to bottom.
// The grid is the same one turned on its side, so everything below is worked
// out on two axes, along the flow (u) and across the lanes (v), and mapped to
// x and y at the end.

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
    laneHeaderMax: 150,
    phaseHeaderMax: 112,
    laneInfoLines: 0,
    phaseInfoLines: 0,
    minWidth: 0
});

// A decision is six-sided: its left and right ends come to a point this far in.
export const DECISION_CUT = 16;
// How far off the centre line a rework connector enters, as a share of the box height.
const REWORK_ENTRY = 0.25;
const LABEL_PAD = 7;
const PHASE_RULE_INSET = 6;
const DOWN_MIN_BOX = 150;

const estimate = (text, size) => text.length * size * 0.6;

/** Where the left outline of a step is at height y: boxes are flat, the other shapes are not. */
export function leftEdge(step, y) {
    const half = (step.y1 - step.y0) / 2;
    const dy = Math.min(half, Math.abs(y - (step.y0 + half)));
    if (step.kind === 'decision') return step.x0 + Math.min(DECISION_CUT, half) * (dy / half);
    if (step.kind === 'terminator') return step.x0 + half - Math.sqrt(Math.max(0, half * half - dy * dy));
    return step.x0;
}

/** Where the top outline of a step is at x, for work arriving from above. */
export function topEdge(step, x) {
    const halfWidth = (step.x1 - step.x0) / 2;
    const height = step.y1 - step.y0;
    const dx = Math.min(halfWidth, Math.abs(x - (step.x0 + halfWidth)));
    if (step.kind === 'decision') {
        const cut = Math.min(DECISION_CUT, height / 2);
        const into = dx - (halfWidth - cut);
        return into > 0 ? step.y0 + (height / 2) * (into / cut) : step.y0;
    }
    if (step.kind === 'terminator') {
        const r = Math.min(height / 2, halfWidth);
        const into = dx - (halfWidth - r);
        return into > 0 ? step.y0 + r - Math.sqrt(Math.max(0, r * r - into * into)) : step.y0;
    }
    return step.y0;
}

/**
 * Text cut to a width, ending in an ellipsis when anything was dropped. Parts
 * after a middle dot go first, then whole words, so a figure is never cut
 * part way through; only a single word too wide is cut by characters.
 */
function clip(text, width, measure, size) {
    const fits = (s) => measure(s, size, 400) <= width;
    if (fits(text)) return text;
    const parts = text.split(' · ');
    while (parts.length > 1) {
        parts.pop();
        if (fits(`${parts.join(' · ')}…`)) return `${parts.join(' · ')}…`;
    }
    const words = parts[0].split(' ');
    while (words.length > 1) {
        words.pop();
        if (fits(`${words.join(' ')}…`)) return `${words.join(' ')}…`;
    }
    let cut = words[0];
    while (cut.length > 1 && measure(`${cut}…`, size, 400) > width) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
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
    // Lanes running down put exit labels over their own column, so the box is kept wide enough to hold one.
    const boxWidth = Math.max(options.direction === 'down' ? DOWN_MIN_BOX : opt.minBoxWidth, Math.ceil(widest) + 2 * opt.boxPadX);
    const boxHeight = (nameLines + opt.infoLines) * lineHeight + 2 * opt.boxPadY;

    const { routes, vertical, horizontal } = routeLinks(steps, links, cols, rows);

    const down = options.direction === 'down';
    // Box size along the flow and across the lanes.
    const along = down ? boxHeight : boxWidth;
    const across = down ? boxWidth : boxHeight;
    const hasPhases = phases.length > 1 || (phases[0] && phases[0].name !== '');
    const headTop = opt.margin + opt.titleHeight + opt.summaryHeight;

    // Lane names: a column on the left, or a row along the top when lanes run down.
    const laneWrap = down ? across + opt.gutterY - 16 : opt.laneHeaderMax - 16;
    const laneLabels = lanes.map((l) => wrapText(l.name, laneWrap, 3, measure, opt.fontSize, 600));
    const laneHeader = down
        ? (Math.max(1, ...laneLabels.map((ls) => ls.length)) + opt.laneInfoLines) * lineHeight + 16
        : Math.min(opt.laneHeaderMax, Math.max(opt.laneHeaderMin,
            Math.ceil(Math.max(0, ...laneLabels.flatMap((ls) => ls.map((l) => measure(l, opt.fontSize, 600))))) + 16));

    // Phase names: a row along the top, or a column on the left when lanes run down.
    const phaseLabels = phases.map((p) => (down ? wrapText(p.name, opt.phaseHeaderMax - 16, 3, measure, opt.fontSize, 600) : [p.name]));
    const phaseHeader = !hasPhases ? 0 : (down
        ? Math.min(opt.phaseHeaderMax, Math.max(56, Math.ceil(Math.max(0, ...phaseLabels.flatMap((ls) => ls.map((l) => measure(l, opt.fontSize, 600))))) + 16))
        : opt.phaseHeader);

    const flowStart = down ? headTop + laneHeader : opt.margin + laneHeader;
    const laneStartAt = down ? opt.margin + phaseHeader : headTop + phaseHeader;

    // An exit label sits beside its own line, just past the turn, in room kept
    // for it. Across, a track is as wide as the label it carries. Down, the
    // track is a horizontal line with the label above it, so the room is one
    // line high and the label is cut to stay over its own column.
    const labelSize = opt.fontSize - 1;
    const labelHeight = Math.round(labelSize * 1.3);
    const shown = links.map((_, i) => {
        if (!labels[i]) return '';
        return down ? clip(labels[i], across / 2 + opt.gutterY / 2 - LABEL_PAD, measure, labelSize) : labels[i];
    });
    const labelRoom = links.map((_, i) => {
        if (!shown[i]) return 0;
        return down ? labelHeight : Math.ceil(measure(shown[i], labelSize, 400)) + LABEL_PAD;
    });

    // Along the flow: gutter, column, gutter, column, ..., gutter. Inside a
    // gutter, in order: tracks leaving, direct tracks, a slot for the labels of
    // straight connectors, tracks arriving.
    const flowGutters = vertical.map((v, k) => {
        const c = k - 1;
        const room = { dep: new Array(v.dep).fill(0), direct: new Array(v.direct).fill(0), straight: 0 };
        routes.forEach((route, i) => {
            if (route.kind === 'general' && route.depGutter === c) room.dep[route.depTrack] = Math.max(room.dep[route.depTrack], labelRoom[i]);
            if (route.kind === 'direct' && route.gutter === c) room.direct[route.track] = Math.max(room.direct[route.track], labelRoom[i]);
            if (route.kind === 'straight' && steps[links[i].source].col === c) room.straight = Math.max(room.straight, labelRoom[i]);
        });
        return { ...v, room, u0: 0, size: 0, dep: [], direct: [], arr: [], slot: 0 };
    });
    const colU = [];
    let u = flowStart;
    for (let c = -1; c < cols; c++) {
        const g = flowGutters[c + 1];
        if (c >= 0) { colU.push(u); u += along; }
        g.u0 = u;
        let cursor = u + opt.gutterX / 2;
        for (const zone of ['dep', 'direct']) {
            for (const room of g.room[zone]) {
                // The label is past the line when lanes run across, and before it when they run down.
                if (down) cursor += room;
                g[zone].push(cursor + opt.trackGap / 2);
                cursor += opt.trackGap + (down ? 0 : room);
            }
        }
        g.slot = cursor;
        cursor += g.room.straight;
        for (let t = 0; t < vertical[c + 1].arr; t++) {
            g.arr.push(cursor + opt.trackGap / 2);
            cursor += opt.trackGap;
        }
        g.size = cursor + opt.gutterX / 2 - u;
        u += g.size;
    }
    const flowEnd = u;

    // Across the lanes: gutter, row, gutter, row, ..., gutter.
    const laneGutters = horizontal.map((count) => ({ tracks: count, v0: 0, size: opt.gutterY + count * opt.trackGap }));
    const rowV = [];
    let v = laneStartAt;
    for (let r = 0; r <= rows; r++) {
        laneGutters[r].v0 = v;
        v += laneGutters[r].size;
        if (r < rows) { rowV.push(v); v += across; }
    }
    const laneEnd = v;

    const point = (pu, pv) => (down ? [pv, pu] : [pu, pv]);
    for (const step of steps) {
        const [x0, y0] = point(colU[step.col], rowV[step.row]);
        step.x0 = x0;
        step.x1 = x0 + boxWidth;
        step.y0 = y0;
        step.y1 = y0 + boxHeight;
    }

    const trackV = (g, t) => laneGutters[g].v0 + opt.gutterY / 2 + t * opt.trackGap + opt.trackGap / 2;

    const connectors = links.map((link, i) => {
        const s = steps[link.source];
        const t = steps[link.target];
        const route = routes[i];
        const su = colU[s.col] + along;
        const sv = rowV[s.row] + across / 2;
        let tv = rowV[t.row] + across / 2;
        let turns = [];
        let labelAt = null;
        if (route.kind === 'straight') {
            const slot = flowGutters[s.col + 1].slot;
            labelAt = down ? { x: sv + 5, y: slot + labelHeight - 4 } : { x: slot + 2, y: sv - 5 };
        } else {
            if (route.kind === 'direct') {
                const tu = flowGutters[route.gutter + 1].direct[route.track];
                turns = [[tu, sv], [tu, tv]];
            } else {
                const ud = flowGutters[route.depGutter + 1].dep[route.depTrack];
                const ua = flowGutters[route.arrGutter + 1].arr[route.arrTrack];
                const vh = trackV(route.hGutter, route.hTrack);
                // Rework comes in off the centre line, on the side it arrives from,
                // so its arrowhead does not sit on the one already there.
                if (link.rework) tv += Math.sign(vh - tv) * across * REWORK_ENTRY;
                turns = [[ud, sv], [ud, vh], [ua, vh], [ua, tv]];
            }
            const heads = Math.sign(turns[1][1] - sv);
            labelAt = down
                ? { x: sv + 5 * heads, y: turns[0][0] - 4, anchor: heads > 0 ? 'start' : 'end' }
                : { x: turns[0][0] + 5, y: heads > 0 ? sv + lineHeight : sv - 6 };
        }
        const end = down ? [tv, topEdge(t, tv)] : [leftEdge(t, tv), tv];
        return {
            index: i,
            source: link.source,
            target: link.target,
            kind: route.kind,
            rework: link.rework,
            points: [point(su, sv), ...turns.map((q) => point(q[0], q[1])), end],
            label: shown[i],
            labelAt: shown[i] ? labelAt : null
        };
    });

    const laneBands = lanes.map((lane, i) => {
        const first = laneStart[i];
        const last = first + laneRows[i];
        const v0 = laneGutters[first].v0;
        const v1 = last === rows ? laneEnd : laneGutters[last].v0;
        return {
            index: i,
            name: lane.name,
            lines: laneLabels[i],
            x0: down ? v0 : opt.margin,
            x1: down ? v1 : flowEnd,
            y0: down ? headTop : v0,
            y1: down ? flowEnd : v1
        };
    });

    const phaseBands = hasPhases
        ? phases.filter((p) => nodes.some((n) => n.phase === p.index)).map((p) => {
            const c0 = phaseStart[p.index];
            const c1 = phaseEnd[p.index];
            // A band is bounded just inside the gutter on each side, before every
            // track, so the rule between phases never lies on a connector.
            const u0 = c0 === 0 ? flowStart : flowGutters[c0].u0 + PHASE_RULE_INSET;
            const u1 = c1 === cols - 1 ? flowEnd : flowGutters[c1 + 1].u0 + PHASE_RULE_INSET;
            return {
                index: p.index,
                name: p.name,
                lines: phaseLabels[p.index],
                x0: down ? opt.margin : u0,
                x1: down ? laneEnd : u1,
                y0: down ? u0 : headTop,
                y1: down ? u1 : laneEnd
            };
        })
        : [];

    const right = down ? laneEnd : flowEnd;
    const bottom = down ? flowEnd : laneEnd;
    const flowRanges = flowGutters.map((g) => [g.u0, g.u0 + g.size]);
    const laneRanges = laneGutters.map((g) => [g.v0, g.v0 + g.size]);
    return {
        options: opt,
        direction: down ? 'down' : 'across',
        // Never narrower than the lines of text above and below the map.
        width: Math.max(right + opt.margin, opt.minWidth + 2 * opt.margin),
        height: bottom + opt.margin + opt.footnoteHeight,
        area: {
            left: down ? laneStartAt : flowStart,
            right,
            top: down ? flowStart : laneStartAt,
            bottom,
            headerLeft: opt.margin,
            headerTop: headTop
        },
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
            vertical: (down ? laneRanges : flowRanges).map(([x0, x1]) => ({ x0, x1 })),
            horizontal: (down ? flowRanges : laneRanges).map(([y0, y1]) => ({ y0, y1 }))
        }
    };
}
