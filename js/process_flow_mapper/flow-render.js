// Swimlane SVG renderer for the process flow mapper.
//
// Every colour is a literal presentation attribute, never a CSS variable or a
// style attribute, so the element on the page is the file that is exported and
// it stays legal under a style-src with no unsafe-inline.

import { summaryLine, summarySentence, footnoteText, formatPercent, formatPasses, formatDuration } from './flow-model.js';
import { DECISION_CUT } from './flow-layout.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FONT = "'Space Grotesk', system-ui, 'Segoe UI', Arial, sans-serif";

export const PALETTES = Object.freeze({
    light: Object.freeze({
        name: 'light',
        surface: '#ffffff',
        band: '#f1f5f9',
        box: '#ffffff',
        ink: '#0f172a',
        inkSecondary: '#475569',
        line: '#475569',
        rule: '#cbd5e1',
        heat: '#ea580c',
        heatMax: 0.55,
        rework: '#b45309',
        series: Object.freeze(['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'])
    }),
    dark: Object.freeze({
        name: 'dark',
        surface: '#18181b',
        band: '#202024',
        box: '#27272a',
        ink: '#fafafa',
        inkSecondary: '#a1a1aa',
        line: '#a1a1aa',
        rule: '#3f3f46',
        heat: '#ea580c',
        heatMax: 0.5,
        rework: '#f59e0b',
        series: Object.freeze(['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'])
    })
});

// What the tint on a step can show.
export const TINTS = Object.freeze({
    lead: 'Share of lead time',
    wait: 'Waiting',
    touch: 'Touch time',
    passes: 'Passes',
    none: 'No tint'
});

export const VIEW_DEFAULTS = Object.freeze({
    title: '',
    tint: 'lead',
    showBadges: true,
    background: true,
    interactive: false,
    // The step that is the map's tab stop; the first in reading order when unset.
    focusStep: null
});

const LEGEND_STEPS = 5;
const BADGE_FROM = 1.005;

/** Blend two #rrggbb colours: t = 0 is a, t = 1 is b. */
export function mix(a, b, t) {
    const part = (hex, i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16);
    const out = [0, 1, 2].map((i) => Math.round(part(a, i) + (part(b, i) - part(a, i)) * t));
    return `#${out.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** How strongly each step is tinted, 0 to 1, for a tint mode. */
export function tintLevels(model, mode) {
    const { result, graph } = model;
    if (!result.ok || mode === 'none') return graph.nodes.map(() => 0);
    const raw = result.perStep.map((s, i) => {
        if (graph.nodes[i].outLinks.length === 0) return 0;
        if (mode === 'passes') return Math.max(0, s.passes - 1);
        // Share of lead time is what a step adds to it, so a step on a faster branch stays pale.
        if (mode === 'lead') return s.share || 0;
        return s[mode] || 0;
    });
    const top = Math.max(...raw);
    return raw.map((v) => (top > 0 ? v / top : 0));
}

/** Step indices in reading order: along the flow, then across the lanes. */
export function stepOrder(layout) {
    const down = layout.direction === 'down';
    return [...layout.steps]
        .sort((a, b) => (down ? (a.y0 - b.y0) || (a.x0 - b.x0) : (a.x0 - b.x0) || (a.y0 - b.y0)) || (a.index - b.index))
        .map((s) => s.index);
}

function make(doc, tag, attrs = {}, text) {
    const el = doc.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value !== null && value !== undefined) el.setAttribute(key, String(value));
    }
    if (text !== undefined) el.textContent = text;
    return el;
}

const r2 = (v) => Math.round(v * 100) / 100;

function halo(palette) {
    return { stroke: palette.surface, 'stroke-width': 3, 'stroke-linejoin': 'round', 'paint-order': 'stroke' };
}

/** Outline of a step: a box, a rounded terminator, or a six-sided decision. */
function stepShape(doc, step, attrs) {
    const { x0, x1, y0, y1 } = step;
    const h = y1 - y0;
    if (step.kind === 'decision') {
        // Six sides, not four: a true diamond leaves no room for the text.
        const c = Math.min(DECISION_CUT, h / 2);
        const points = [[x0, y0 + h / 2], [x0 + c, y0], [x1 - c, y0], [x1, y0 + h / 2], [x1 - c, y1], [x0 + c, y1]];
        return make(doc, 'polygon', { ...attrs, points: points.map((p) => `${r2(p[0])},${r2(p[1])}`).join(' ') });
    }
    return make(doc, 'rect', {
        ...attrs, x: r2(x0), y: r2(y0), width: r2(x1 - x0), height: r2(h), rx: step.kind === 'terminator' ? r2(h / 2) : 6
    });
}

/**
 * Build the diagram. model comes from buildModel and must be ok. measure is
 * (text, size, weight) => px. Returns a detached <svg> at its natural size.
 */
export function renderFlow(doc, model, viewOptions = {}, palette = PALETTES.light, measure = (t, s) => t.length * s * 0.6) {
    const view = { ...VIEW_DEFAULTS, ...viewOptions };
    const { graph, layout, result, parsed, totals } = model;
    const { width, height, area, lineHeight } = layout;
    const fontSize = layout.options.fontSize;
    const margin = layout.options.margin;
    const small = fontSize - 1;
    const tint = Object.prototype.hasOwnProperty.call(TINTS, view.tint) ? view.tint : 'lead';
    const levels = tintLevels(model, tint);
    const down = layout.direction === 'down';
    const laneKeys = down ? 'left or right' : 'up or down';

    const svg = make(doc, 'svg', {
        viewBox: `0 0 ${r2(width)} ${r2(height)}`,
        width: r2(width),
        height: r2(height),
        role: view.interactive ? 'group' : 'img',
        'aria-labelledby': 'flowSvgTitle flowSvgDesc',
        'font-family': FONT,
        'font-size': fontSize
    });
    svg.appendChild(make(doc, 'title', { id: 'flowSvgTitle' }, view.title || 'Process flow'));
    svg.appendChild(make(doc, 'desc', { id: 'flowSvgDesc' },
        `${graph.nodes.length} steps in ${graph.lanes.length} lanes, ${graph.links.length} connectors. ${summarySentence(model)}`));

    const defs = make(doc, 'defs');
    for (const [id, fill] of [['flowArrow', palette.line], ['flowArrowRework', palette.rework]]) {
        const marker = make(doc, 'marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
        marker.appendChild(make(doc, 'path', { d: 'M0,0L10,5L0,10z', fill }));
        defs.appendChild(marker);
    }
    svg.appendChild(defs);

    if (view.background) svg.appendChild(make(doc, 'rect', { class: 'flow-bg', width: r2(width), height: r2(height), fill: palette.surface }));

    if (view.title) {
        svg.appendChild(make(doc, 'text', { class: 'flow-title', x: margin, y: margin + 16, 'font-size': 16, 'font-weight': 700, fill: palette.ink }, view.title));
    }
    if (layout.options.summaryHeight) {
        svg.appendChild(make(doc, 'text', {
            class: 'flow-summary', x: margin, y: margin + layout.options.titleHeight + 13, 'font-size': small, fill: palette.ink
        }, summaryLine(model)));
    }

    // Lanes: a band each, with the name in a header cell on the left, or along
    // the top when lanes run down the page.
    const laneGroup = make(doc, 'g', { class: 'flow-lanes' });
    for (const lane of layout.lanes) {
        const color = parsed.colors[lane.name] || palette.series[lane.index % palette.series.length];
        const laneWidth = lane.x1 - lane.x0;
        const laneHeight = lane.y1 - lane.y0;
        laneGroup.appendChild(make(doc, 'rect', {
            class: 'flow-lane', x: r2(lane.x0), y: r2(lane.y0), width: r2(laneWidth), height: r2(laneHeight),
            fill: lane.index % 2 ? palette.surface : palette.band, stroke: palette.rule, 'stroke-width': 1, 'data-lane': lane.index
        }));
        laneGroup.appendChild(make(doc, 'rect', { x: r2(lane.x0), y: r2(lane.y0), width: down ? r2(laneWidth) : 5, height: down ? 5 : r2(laneHeight), fill: color }));
        const labelX = down ? r2((lane.x0 + lane.x1) / 2) : r2(lane.x0 + 12);
        const text = make(doc, 'text', {
            class: 'flow-lane-label', x: labelX, 'text-anchor': down ? 'middle' : null, 'font-weight': 600, fill: palette.ink, 'data-lane': lane.index,
            tabindex: view.interactive ? 0 : null,
            role: view.interactive ? 'img' : null,
            'aria-label': view.interactive ? `${lane.name} lane. Drag, or hold Alt and press the ${laneKeys} arrow, to move it` : null
        });
        // How busy the lane is, when staff and arrivals are both given.
        const busy = totals ? totals.lanes[lane.index].busy : null;
        const rows = lane.lines.length + (busy === null ? 0 : 1);
        const firstY = down
            ? lane.y0 + 9 + fontSize
            : (lane.y0 + lane.y1) / 2 - ((rows - 1) * lineHeight) / 2 + fontSize * 0.35;
        lane.lines.forEach((line, i) => text.appendChild(make(doc, 'tspan', { x: labelX, y: r2(firstY + i * lineHeight) }, line)));
        if (busy !== null) {
            text.appendChild(make(doc, 'tspan', {
                class: 'flow-lane-busy', x: labelX, y: r2(firstY + lane.lines.length * lineHeight),
                'font-weight': busy > 1 ? 700 : 400, 'font-size': small, fill: busy > 1 ? palette.rework : palette.inkSecondary
            }, busy > 1 ? `${formatPercent(busy)}, over` : `${formatPercent(busy)} busy`));
        }
        laneGroup.appendChild(text);
    }
    // The edge of the header cells.
    laneGroup.appendChild(make(doc, 'line', down
        ? { x1: r2(area.left), x2: r2(area.right), y1: r2(area.top), y2: r2(area.top), stroke: palette.rule, 'stroke-width': 1 }
        : { x1: area.left, x2: area.left, y1: r2(area.top), y2: r2(area.bottom), stroke: palette.rule, 'stroke-width': 1 }));
    svg.appendChild(laneGroup);

    // Phases: a name beside each run of steps, and a rule between runs.
    if (layout.phases.length) {
        const phaseGroup = make(doc, 'g', { class: 'flow-phases' });
        layout.phases.forEach((phase, i) => {
            const total = totals ? totals.phases[phase.index] : null;
            const share = total && result.lead > 0 ? formatPercent(total.share) : '';
            const rule = { stroke: palette.inkSecondary, 'stroke-width': 1, 'stroke-dasharray': '6 4' };
            if (down) {
                const text = make(doc, 'text', { class: 'flow-phase-label', x: r2(phase.x0), 'font-weight': 600, fill: palette.ink, 'data-phase': phase.index });
                const firstY = phase.y0 + 8 + fontSize;
                phase.lines.forEach((line, k) => text.appendChild(make(doc, 'tspan', { x: r2(phase.x0), y: r2(firstY + k * lineHeight) }, line)));
                if (share) {
                    text.appendChild(make(doc, 'tspan', {
                        x: r2(phase.x0), y: r2(firstY + phase.lines.length * lineHeight), 'font-weight': 400, 'font-size': small
                    }, share));
                }
                phaseGroup.appendChild(text);
                if (i > 0) phaseGroup.appendChild(make(doc, 'line', { ...rule, x1: r2(phase.x0), x2: r2(area.right), y1: r2(phase.y0), y2: r2(phase.y0) }));
                return;
            }
            phaseGroup.appendChild(make(doc, 'text', {
                class: 'flow-phase-label', x: r2((phase.x0 + phase.x1) / 2), y: r2(area.top - 9), 'text-anchor': 'middle',
                'font-weight': 600, fill: palette.ink, 'data-phase': phase.index
            }, `${phase.name}${share ? `  \u00b7  ${share}` : ''}`));
            if (i > 0) {
                phaseGroup.appendChild(make(doc, 'line', {
                    ...rule, x1: r2(phase.x0), x2: r2(phase.x0), y1: r2(area.top - layout.options.phaseHeader + 4), y2: r2(area.bottom)
                }));
            }
        });
        svg.appendChild(phaseGroup);
    }

    // Connectors under the steps, so an arrowhead meets a box edge cleanly.
    const linkGroup = make(doc, 'g', { class: 'flow-links' });
    for (const c of layout.connectors) {
        const link = graph.links[c.index];
        const d = c.points.map((p, i) => `${i ? 'L' : 'M'}${r2(p[0])},${r2(p[1])}`).join('');
        const path = make(doc, 'path', {
            class: `flow-link${c.rework ? ' flow-rework' : ''}`, d, fill: 'none',
            stroke: c.rework ? palette.rework : palette.line, 'stroke-width': c.rework ? 1.75 : 1.5, 'stroke-linejoin': 'round',
            'stroke-dasharray': c.rework ? '6 3' : null,
            'marker-end': `url(#${c.rework ? 'flowArrowRework' : 'flowArrow'})`, 'data-link': c.index
        });
        const label = link.label ? ` (${link.label})` : '';
        const traffic = result.ok ? `, taken ${formatPasses(result.traversals[c.index])} per unit of work` : '';
        const taken = link.parallel ? 'taken together with the other exits of this step' : `${formatPercent(link.share)} of what leaves`;
        const onWay = link.wait > 0 ? `, ${formatDuration(link.wait, graph.calendar, model.unit)} on the way` : '';
        path.appendChild(make(doc, 'title', {},
            `${graph.nodes[c.source].name} to ${graph.nodes[c.target].name}${label}: ${taken}${onWay}${c.rework ? ', rework' : ''}${traffic}`));
        linkGroup.appendChild(path);
    }
    svg.appendChild(linkGroup);

    // One step is a tab stop and the arrow keys move between them, so a long map is not a long run of tab presses.
    const order = stepOrder(layout);
    const stop = order.includes(view.focusStep) ? view.focusStep : order[0];
    const stepGroup = make(doc, 'g', { class: 'flow-steps' });
    for (const step of layout.steps) {
        const node = graph.nodes[step.index];
        const per = result.ok ? result.perStep[step.index] : null;
        const level = levels[step.index];
        const g = make(doc, 'g', {
            class: 'flow-step', 'data-node': step.index,
            tabindex: view.interactive ? (step.index === stop ? 0 : -1) : null,
            role: view.interactive ? 'img' : null,
            'aria-label': view.interactive
                ? `${step.name}, ${graph.lanes[step.lane].name}. ${step.info.join('. ')}${step.info.length ? '. ' : ''}Arrow keys go to the next or previous step. Drag, or hold Alt and press the ${laneKeys} arrow, to move it to another lane`
                : null
        });
        const note = parsed.notes[step.name] ? `. ${parsed.notes[step.name]}` : '';
        const passed = per && node.outLinks.length ? `, passed ${formatPasses(per.passes)}` : '';
        g.appendChild(make(doc, 'title', {}, `${step.name} (${graph.lanes[step.lane].name})${step.info.length ? `: ${step.info.join(', ')}` : ''}${passed}${note}`));
        g.appendChild(stepShape(doc, step, {
            class: 'flow-step-shape', fill: mix(palette.box, palette.heat, level * palette.heatMax),
            stroke: node.reachable ? palette.inkSecondary : palette.rework, 'stroke-width': 1.25,
            'stroke-dasharray': node.reachable ? null : '4 3'
        }));

        const lines = [...step.lines.map((t) => ({ t, weight: 600, size: fontSize })), ...step.info.map((t) => ({ t, weight: 400, size: small }))];
        const cx = (step.x0 + step.x1) / 2;
        const firstY = (step.y0 + step.y1) / 2 - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35;
        const text = make(doc, 'text', { class: 'flow-step-label', 'text-anchor': 'middle', fill: palette.ink });
        lines.forEach((line, i) => text.appendChild(make(doc, 'tspan', {
            x: r2(cx), y: r2(firstY + i * lineHeight), 'font-weight': line.weight, 'font-size': line.size
        }, line.t)));
        g.appendChild(text);

        // Passed more than once: say how many times, on the corner.
        if (view.showBadges && per && node.outLinks.length && per.passes > BADGE_FROM) {
            const label = formatPasses(per.passes);
            const w = measure(label, small, 700) + 12;
            g.appendChild(make(doc, 'rect', { class: 'flow-badge', x: r2(step.x1 - w + 6), y: r2(step.y0 - 9), width: r2(w), height: 18, rx: 9, fill: palette.ink }));
            g.appendChild(make(doc, 'text', {
                x: r2(step.x1 - w / 2 + 6), y: r2(step.y0 + 4), 'text-anchor': 'middle', 'font-size': small, 'font-weight': 700, fill: palette.surface
            }, label));
        }
        stepGroup.appendChild(g);
    }
    svg.appendChild(stepGroup);

    // Exit labels sit in room the layout kept for them, beside their own line.
    const labelGroup = make(doc, 'g', { class: 'flow-link-labels' });
    for (const c of layout.connectors) {
        if (!c.labelAt) continue;
        labelGroup.appendChild(make(doc, 'text', {
            class: 'flow-link-label', x: r2(c.labelAt.x), y: r2(c.labelAt.y), 'text-anchor': c.labelAt.anchor === 'end' ? 'end' : null, 'font-size': small,
            fill: c.rework ? palette.rework : palette.ink, 'font-weight': c.rework ? 600 : 400, 'data-link': c.index, ...halo(palette)
        }, c.label));
    }
    svg.appendChild(labelGroup);

    if (layout.options.footnoteHeight) {
        const y = height - margin;
        svg.appendChild(make(doc, 'text', { class: 'flow-footnote', x: margin, y: r2(y), 'font-size': small, fill: palette.inkSecondary }, footnoteText(model)));
        if (tint !== 'none' && levels.some((v) => v > 0)) {
            const legend = make(doc, 'g', { class: 'flow-legend' });
            const sw = 14;
            const x1 = width - margin;
            const high = 'more';
            const hw = measure(high, small, 400);
            legend.appendChild(make(doc, 'text', { x: r2(x1), y: r2(y), 'text-anchor': 'end', 'font-size': small, fill: palette.inkSecondary }, high));
            for (let i = 0; i < LEGEND_STEPS; i++) {
                const t = (LEGEND_STEPS - 1 - i) / (LEGEND_STEPS - 1);
                legend.appendChild(make(doc, 'rect', {
                    x: r2(x1 - hw - 6 - (i + 1) * sw), y: r2(y - 10), width: sw, height: 12,
                    fill: mix(palette.box, palette.heat, t * palette.heatMax), stroke: palette.inkSecondary, 'stroke-width': 0.5
                }));
            }
            legend.appendChild(make(doc, 'text', {
                x: r2(x1 - hw - 12 - LEGEND_STEPS * sw), y: r2(y), 'text-anchor': 'end', 'font-size': small, fill: palette.inkSecondary
            }, `${TINTS[tint]}: less`));
            svg.appendChild(legend);
        }
    }

    return svg;
}
