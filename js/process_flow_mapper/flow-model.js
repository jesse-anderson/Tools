// Text in, solved and drawable model out. Pure: parse, build, solve, lay out.

import { parseFlow } from './flow-parse.js';
import { buildGraph, toHours } from './flow-graph.js';
import { solveFlow } from './flow-solve.js';
import { computeLayout } from './flow-layout.js';

export const TITLE_HEIGHT = 30;
export const SUMMARY_HEIGHT = 20;
export const FOOTNOTE_HEIGHT = 22;
export const DISPLAY_UNITS = Object.freeze(['auto', 'min', 'h', 'd', 'wk']);

const sig = (value, digits = 3) => value.toLocaleString('en-US', { maximumSignificantDigits: digits });

/** A duration in hours as text, on the working calendar. 'auto' picks the unit that reads best. */
export function formatDuration(hours, calendar, unit = 'auto') {
    if (!Number.isFinite(hours)) return 'n/a';
    if (hours === 0) return '0';
    const day = calendar.hoursPerDay;
    const week = day * calendar.daysPerWeek;
    let u = unit;
    if (u === 'auto') {
        if (hours < 1 / 60) u = 's';
        else if (hours < 1) u = 'min';
        else if (hours < day) u = 'h';
        else if (hours < 4 * week) u = 'd';
        else u = 'wk';
    }
    const per = { s: 1 / 3600, min: 1 / 60, h: 1, d: day, wk: week }[u];
    return `${sig(hours / per)} ${u}`;
}

export function formatPercent(fraction) {
    if (!Number.isFinite(fraction)) return 'n/a';
    const pct = fraction * 100;
    if (pct !== 0 && Math.abs(pct) < 0.1) return '<0.1%';
    return `${pct.toLocaleString('en-US', { maximumFractionDigits: Math.abs(pct) < 10 ? 1 : 0 })}%`;
}

export const formatPasses = (passes) => `x${sig(passes)}`;

const WITHHELD = {
    NO_START: 'No figures: every step has something leading into it, so there is nowhere for work to begin',
    NO_END: 'No figures: no start leads to an end, so the work never finishes',
    NEVER_ENDS: 'No figures: some work can never finish'
};

/**
 * settings: { title, hoursPerDay, daysPerWeek, unit, fontSize, showShares }.
 * measure is (text, size, weight) => px, passed through to the layout.
 * Returns { ok, errors, warnings, parsed, graph, result, totals, layout }.
 * result.ok is false when the map is drawn and no figure can be given.
 */
export function buildModel(text, settings = {}, measure = undefined) {
    const parsed = parseFlow(text);
    const errors = [...parsed.errors];
    const warnings = [...parsed.warnings];
    if (errors.length === 0 && parsed.steps.length === 0) {
        errors.push({ line: null, code: 'NO_STEPS', message: 'Enter at least one step, for example "Sales: Take order -> Check stock"' });
    }
    if (errors.length) return { ok: false, errors, warnings, parsed, graph: null, result: null, totals: null, layout: null };

    const graph = buildGraph(parsed, settings);
    warnings.push(...graph.warnings);
    const { calendar, nodes, links } = graph;

    const result = solveFlow({
        count: nodes.length,
        links: links.map((l) => ({ source: l.source, target: l.target, share: l.share, rework: l.rework, handoff: l.handoff })),
        touch: nodes.map((n) => n.touch),
        wait: nodes.map((n) => n.wait),
        starts: graph.starts
    });
    if (!result.ok) {
        // NO_START and NO_END are already listed by the graph; this adds why no number follows.
        const names = result.nodes.slice(0, 4).map((i) => `"${nodes[i].name}"`).join(', ');
        const detail = result.code === 'NEVER_ENDS' && names
            ? `: once it reaches ${names} there is no way on to any end. Give the loop a way out`
            : '';
        warnings.unshift({ line: null, code: `WITHHELD_${result.code}`, message: `${WITHHELD[result.code]}${detail}` });
    }

    const timed = nodes.some((n) => n.timed);
    const unit = DISPLAY_UNITS.includes(settings.unit) ? settings.unit : 'auto';
    const dur = (h) => formatDuration(h, calendar, unit);

    // What is printed under each step name.
    const info = nodes.map((n, i) => {
        const lines = [];
        if (timed && n.outLinks.length + n.inLinks.length > 0) {
            const parts = [];
            if (n.touch > 0) parts.push(dur(n.touch));
            if (n.wait > 0) parts.push(`wait ${dur(n.wait)}`);
            if (parts.length) lines.push(parts.join(' + '));
        }
        if (result.ok && n.outLinks.length === 0 && n.inLinks.length > 0) {
            lines.push(`${formatPercent(result.perStep[i].passes)} end here`);
        } else if (result.ok && result.lead > 0 && result.perStep[i].lead > 0) {
            lines.push(`${formatPercent(result.perStep[i].share)} of lead time`);
        }
        return lines;
    });

    let totals = null;
    if (result.ok) {
        const group = (key, list) => list.map((item) => {
            const members = nodes.filter((n) => n[key] === item.index);
            const add = (field) => members.reduce((s, n) => s + result.perStep[n.index][field], 0);
            const lead = add('lead');
            return {
                index: item.index, name: item.name, steps: members.length,
                touch: add('touch'), wait: add('wait'), lead,
                share: result.lead > 0 ? lead / result.lead : 0
            };
        });
        let perWeek = null;
        if (parsed.arrivals) {
            const weekHours = calendar.hoursPerDay * calendar.daysPerWeek;
            perWeek = parsed.arrivals.count * weekHours / toHours({ value: 1, unit: parsed.arrivals.per }, calendar);
        }
        const lanes = group('lane', graph.lanes).map((l) => ({
            ...l,
            handoffsIn: graph.lanes[l.index].handoffsIn,
            handoffsOut: graph.lanes[l.index].handoffsOut,
            // Hours of work landing on the lane each week. Not a utilisation: headcount is not known here.
            loadPerWeek: perWeek === null ? null : perWeek * l.touch
        }));
        totals = { lanes, phases: group('phase', graph.phases), arrivalsPerWeek: perWeek };
    }

    // What is printed on each exit. A lone exit with no label says nothing.
    const labels = links.map((l) => {
        if (settings.showShares === false) return '';
        const lone = nodes[l.source].outLinks.length === 1;
        return [l.label, lone && !l.label ? '' : formatPercent(l.share)].filter(Boolean).join(' ');
    });

    const hasFootnote = result.ok && timed;
    const infoLines = Math.max(0, ...info.map((l) => l.length));
    const layout = computeLayout(graph, {
        fontSize: settings.fontSize,
        titleHeight: settings.title ? TITLE_HEIGHT : 0,
        summaryHeight: result.ok && timed ? SUMMARY_HEIGHT : 0,
        footnoteHeight: hasFootnote ? FOOTNOTE_HEIGHT : 0,
        infoLines
    }, measure, labels);
    layout.steps.forEach((s, i) => { s.info = info[i]; });

    return { ok: true, errors, warnings, parsed, graph, result, totals, layout, timed, unit };
}

/** The five headline figures, as { key, label, value, hint } in display order. */
export function headline(model) {
    const { result, graph, unit } = model;
    if (!result.ok) return [];
    const dur = (h) => formatDuration(h, graph.calendar, unit);
    return [
        { key: 'lead', label: 'Lead time', value: dur(result.lead), hint: 'start to finish, per unit of work' },
        { key: 'touch', label: 'Touch time', value: dur(result.touch), hint: 'someone is working on it' },
        { key: 'efficiency', label: 'Efficiency', value: result.efficiency === null ? 'n/a' : formatPercent(result.efficiency), hint: 'touch time as a share of lead time' },
        { key: 'yield', label: 'First-pass yield', value: formatPercent(result.yield), hint: 'finishes with no rework' },
        { key: 'handoffs', label: 'Handoffs', value: sig(result.handoffsPerUnit), hint: 'lane to lane, per unit of work' }
    ];
}

/** The result in one or two sentences, for the status line and the SVG description. */
export function summarySentence(model) {
    const { result, graph, unit, timed } = model;
    if (!result.ok) return WITHHELD[result.code];
    const dur = (h) => formatDuration(h, graph.calendar, unit);
    const calendar = `A day is ${sig(graph.calendar.hoursPerDay)} h and a week ${sig(graph.calendar.daysPerWeek)} d.`;
    const yieldPart = graph.counts.rework
        ? `${formatPercent(result.yield)} of work gets through with no rework`
        : 'Nothing is sent back for rework';
    if (!timed || result.lead === 0) {
        return `No times entered, so there is no lead time. ${yieldPart}, and a unit of work passes through ${sig(result.stepsPerUnit)} steps and ${sig(result.handoffsPerUnit)} handoffs on average.`;
    }
    const rework = result.reworkCost > 0 ? ` Rework adds ${dur(result.reworkCost)}.` : '';
    return `A unit of work takes ${dur(result.lead)} on average, of which ${dur(result.touch)} is work and ${dur(result.wait)} is waiting.${rework} ${yieldPart}. ${calendar}`;
}

/** The short line drawn under the title, so a pasted picture still carries its numbers. */
export function summaryLine(model) {
    return headline(model).map((h) => `${h.label} ${h.value}`).join('  ·  ');
}
