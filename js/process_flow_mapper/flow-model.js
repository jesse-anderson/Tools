// Text in, solved and drawable model out. Pure: parse, build, solve, lay out.

import { parseFlow } from './flow-parse.js';
import { buildGraph, toHours } from './flow-graph.js';
import { solveFlow } from './flow-solve.js';
import { simulate, quantile, histogram, SIM_DEFAULTS } from './flow-simulate.js';
import { computeLayout } from './flow-layout.js';

export const TITLE_HEIGHT = 30;
export const SUMMARY_HEIGHT = 20;
export const FOOTNOTE_HEIGHT = 22;
export const DISPLAY_UNITS = Object.freeze(['auto', 'min', 'h', 'd', 'wk']);
// A lane this busy has little slack left for uneven arrivals.
export const BUSY_FROM = 0.85;
export const DIRECTIONS = Object.freeze(['across', 'down']);
// Visits the simulation may spend, so a map with heavy rework walks fewer units.
const SIM_VISIT_BUDGET = 2000000;
const SIM_MIN_UNITS = 2000;
const SUMMARY_GAP = '  \u00b7  ';
// Room kept beside the small print for the tint legend.
const LEGEND_ROOM = 230;

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
    NEVER_ENDS: 'No figures: some work can never finish',
    PARALLEL: 'No figures: work done at the same time does not come back together'
};

/** What the small print under the map says, built here so the layout can leave room for it. */
export function footnoteText(model) {
    const { graph } = model;
    const { hoursPerDay, daysPerWeek } = graph.calendar;
    const parts = [`Averages per unit of work. A day is ${hoursPerDay} h, a week ${daysPerWeek} d.`];
    if (graph.counts.rework) parts.push('Dashed connectors are rework.');
    if (graph.parallel.blocks.length) parts.push('+ is work done at the same time.');
    if (graph.nodes.some((n) => n.touchSpread || n.waitSpread) || graph.links.some((l) => l.waitSpread)) parts.push('~ is the average of a range.');
    return parts.join(' ');
}

/** How lead time is spread, from a seeded simulation of the same map. Null when there is nothing to spread. */
function leadSpread(graph, result, seed) {
    const { nodes, links } = graph;
    const wanted = Math.floor(SIM_VISIT_BUDGET / Math.max(1, result.stepsPerUnit));
    const sim = simulate({
        count: nodes.length,
        links: links.map((l) => ({ source: l.source, target: l.target, share: l.share, wait: l.wait, waitSpread: l.waitSpread })),
        touch: nodes.map((n) => n.touch),
        wait: nodes.map((n) => n.wait),
        touchSpread: nodes.map((n) => n.touchSpread),
        waitSpread: nodes.map((n) => n.waitSpread),
        starts: graph.starts,
        blocks: graph.parallel.blocks
    }, { units: Math.min(SIM_DEFAULTS.units, Math.max(SIM_MIN_UNITS, wanted)), seed });
    if (!sim.ok) return null;
    let squares = 0;
    for (const t of sim.lead) squares += (t - sim.mean) ** 2;
    return {
        units: sim.units,
        seed: sim.seed,
        cut: sim.cut,
        mean: sim.mean,
        // How far the simulated average can be from the true one by chance alone.
        error: Math.sqrt(squares / sim.units / sim.units),
        min: sim.min,
        max: sim.max,
        p50: quantile(sim.lead, 0.5),
        p80: quantile(sim.lead, 0.8),
        p95: quantile(sim.lead, 0.95),
        varies: sim.max > sim.min,
        ranges: nodes.some((n) => n.touchSpread || n.waitSpread) || links.some((l) => l.waitSpread),
        histogram: histogram(sim.lead),
        ends: sim.ends.map((e) => ({ index: e.index, share: e.count / sim.units, p50: quantile(e.lead, 0.5), p90: quantile(e.lead, 0.9) }))
    };
}

/** One SIPOC row per phase: who supplies what, and what goes to whom. Null when no in or out line is given. */
function sipocRows(parsed, graph) {
    if (!parsed.sipoc.length) return null;
    const unique = (list) => [...new Set(list.filter(Boolean))];
    return graph.phases.map((p) => {
        const of = (kind) => parsed.sipoc.filter((e) => Math.max(0, e.phase) === p.index && e.kind === kind);
        return {
            index: p.index,
            name: p.name || 'Whole process',
            steps: p.steps,
            suppliers: unique(of('in').map((e) => e.party)),
            inputs: unique(of('in').map((e) => e.item)),
            outputs: unique(of('out').map((e) => e.item)),
            customers: unique(of('out').map((e) => e.party))
        };
    }).filter((row) => row.steps > 0 || row.inputs.length || row.outputs.length);
}

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
    if (errors.length) return { ok: false, errors, warnings, parsed, graph: null, result: null, totals: null, layout: null, spread: null, sipoc: null };

    const graph = buildGraph(parsed, settings);
    warnings.push(...graph.warnings);
    const { calendar, nodes, links } = graph;

    const result = solveFlow({
        count: nodes.length,
        links: links.map((l) => ({ source: l.source, target: l.target, share: l.share, rework: l.rework, handoff: l.handoff, parallel: l.parallel, wait: l.wait })),
        touch: nodes.map((n) => n.touch),
        wait: nodes.map((n) => n.wait),
        starts: graph.starts,
        blocks: graph.parallel.blocks,
        blocked: graph.parallel.problems.map((p) => p.split)
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
            // A time given as a range is shown as its average, marked as one.
            if (n.touch > 0) parts.push(`${n.touchSpread ? '~' : ''}${dur(n.touch)}`);
            if (n.wait > 0) parts.push(`wait ${n.waitSpread ? '~' : ''}${dur(n.wait)}`);
            if (parts.length) lines.push(parts.join(' + '));
        }
        if (result.ok && n.outLinks.length === 0 && n.inLinks.length > 0) {
            lines.push(`${formatPercent(result.perStep[i].passes)} end here`);
        } else if (result.ok && !result.perStep[i].critical) {
            // On a branch that is not the slowest: time here does not add to lead time.
            lines.push(`${dur(result.perStep[i].slack)} slack`);
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
            return {
                index: item.index, name: item.name, steps: members.length,
                touch: add('touch'), wait: add('wait'), lead: add('lead'),
                // Only time on the longest path counts towards lead time.
                share: add('share')
            };
        });
        let perWeek = null;
        if (parsed.arrivals) {
            perWeek = parsed.arrivals.count * calendar.hoursPerDay * calendar.daysPerWeek / toHours({ value: 1, unit: parsed.arrivals.per }, calendar);
        }
        // Capacity. Staff is people on duty during working hours, and the share
        // of their time this process gets. A lane can carry what its hours
        // allow, and the process can carry what its tightest lane can.
        const weekHours = calendar.hoursPerDay * calendar.daysPerWeek;
        const lanes = group('lane', graph.lanes).map((l) => {
            const staff = parsed.staff[l.name] || null;
            const available = staff ? staff.people * staff.share * weekHours : null;
            const loadPerWeek = perWeek === null ? null : perWeek * l.touch;
            return {
                ...l,
                handoffsIn: graph.lanes[l.index].handoffsIn,
                handoffsOut: graph.lanes[l.index].handoffsOut,
                // Hours of work landing on the lane each week.
                loadPerWeek,
                staff,
                available,
                canCarry: available !== null && l.touch > 0 ? available / l.touch : null,
                busy: available !== null && loadPerWeek !== null ? loadPerWeek / available : null
            };
        });
        const staffed = lanes.filter((l) => l.canCarry !== null);
        const limit = staffed.length ? staffed.reduce((m, l) => (l.canCarry < m.canCarry ? l : m)) : null;
        const unstaffed = lanes.filter((l) => l.touch > 0 && l.staff === null).map((l) => l.name);
        totals = {
            lanes,
            phases: group('phase', graph.phases),
            arrivalsPerWeek: perWeek,
            capacity: limit ? { perWeek: limit.canCarry, lane: limit.index, busy: limit.busy, unstaffed } : null
        };

        const hours = (h) => `${sig(h)} h`;
        for (const l of lanes) {
            if (l.busy === null) continue;
            if (l.busy > 1 + 1e-9) {
                warnings.push({
                    line: l.staff.line,
                    code: 'OVERLOADED',
                    message: `${l.name} cannot keep up: ${hours(l.loadPerWeek)} of work arrives each week and ${hours(l.available)} is available. Work will pile up there without limit, so the lead time shown is too low`
                });
            } else if (l.busy >= BUSY_FROM) {
                warnings.push({
                    line: l.staff.line,
                    code: 'BUSY',
                    message: `${l.name} is ${formatPercent(l.busy)} busy. Past about ${formatPercent(BUSY_FROM)} a queue grows quickly whenever work arrives unevenly, so its real wait is likely longer than the one entered`
                });
            }
        }
        if (limit && unstaffed.length) {
            warnings.push({
                line: null,
                code: 'STAFF_PARTIAL',
                message: `No staff is given for ${unstaffed.join(', ')}, so capacity is the tightest of the lanes that have it and may be lower`
            });
        }
    }

    // What is printed on each exit. A lone exit with no label says nothing.
    // A plus marks an exit taken together with its neighbours.
    const labels = links.map((l) => {
        if (settings.showShares === false) return '';
        const lone = nodes[l.source].outLinks.length === 1;
        const share = l.parallel || (lone && !l.label) ? '' : formatPercent(l.share);
        const text = [l.parallel ? '+' : '', l.label, share].filter(Boolean).join(' ');
        if (!(l.wait > 0)) return text;
        const wait = `${l.waitSpread ? '~' : ''}${dur(l.wait)}`;
        return text ? `${text} \u00b7 ${wait}` : `wait ${wait}`;
    });

    let spread = null;
    if (result.ok && timed && result.lead > 0) {
        spread = leadSpread(graph, result, Number.isFinite(settings.seed) ? settings.seed : SIM_DEFAULTS.seed);
        // The slowest of several branches takes longer on average than the slowest average.
        if (spread && graph.parallel.blocks.length && spread.mean - result.lead > Math.max(0.01 * result.lead, 3 * spread.error)) {
            warnings.push({
                line: null,
                code: 'PARALLEL_AVERAGE',
                message: `Branches done at the same time vary, and waiting for whichever is slowest takes longer than the slowest does on average. Simulation puts the lead time at ${dur(spread.mean)}, against the ${dur(result.lead)} shown`
            });
        }
    }

    const sipoc = sipocRows(parsed, graph);
    if (sipoc) {
        const gaps = sipoc.filter((row) => row.steps > 0 && (!row.inputs.length || !row.outputs.length)).map((row) => row.name);
        if (gaps.length) warnings.push({ line: null, code: 'SIPOC_GAP', message: `The SIPOC table has no inputs or no outputs for: ${gaps.join(', ')}` });
    }

    const partial = { ok: true, parsed, graph, result, totals, timed, unit };
    const hasFootnote = result.ok && timed;
    const infoLines = Math.max(0, ...info.map((l) => l.length));
    const width = measure || ((t, size) => t.length * size * 0.6);
    const fontSize = Number.isFinite(settings.fontSize) ? Math.min(20, Math.max(9, settings.fontSize)) : 12;
    // The lines above and below the map must fit however narrow the map is.
    const minWidth = Math.max(
        settings.title ? width(settings.title, 16, 700) : 0,
        result.ok && timed ? width(summaryLine(partial), fontSize - 1, 400) : 0,
        hasFootnote ? width(footnoteText(partial), fontSize - 1, 400) + LEGEND_ROOM : 0
    );
    const layout = computeLayout(graph, {
        fontSize: settings.fontSize,
        titleHeight: settings.title ? TITLE_HEIGHT : 0,
        summaryHeight: result.ok && timed ? SUMMARY_HEIGHT : 0,
        footnoteHeight: hasFootnote ? FOOTNOTE_HEIGHT : 0,
        infoLines,
        laneInfoLines: totals && totals.lanes.some((l) => l.busy !== null) ? 1 : 0,
        phaseInfoLines: result.ok && result.lead > 0 ? 1 : 0,
        minWidth,
        direction: settings.direction
    }, measure, labels);
    layout.steps.forEach((s, i) => { s.info = info[i]; });

    return { ...partial, errors, warnings, layout, spread, sipoc, labels };
}

/**
 * The headline figures, as { key, label, value, hint, raw } in display order.
 * Capacity joins the five when staff is given. raw is the number behind the
 * text, for comparing two models.
 */
export function headline(model) {
    const { result, graph, unit, totals } = model;
    if (!result.ok) return [];
    const dur = (h) => formatDuration(h, graph.calendar, unit);
    const items = [
        { key: 'lead', label: 'Lead time', value: dur(result.lead), raw: result.lead, hint: 'start to finish, per unit of work' },
        { key: 'touch', label: 'Touch time', value: dur(result.touch), raw: result.touch, hint: result.touch > result.touchPath * (1 + 1e-9) ? 'all the work, on every branch' : 'someone is working on it' },
        { key: 'efficiency', label: 'Efficiency', value: result.efficiency === null ? 'n/a' : formatPercent(result.efficiency), raw: result.efficiency, hint: 'touch time as a share of lead time' },
        { key: 'yield', label: 'First-pass yield', value: formatPercent(result.yield), raw: result.yield, hint: 'finishes with no rework' },
        { key: 'handoffs', label: 'Handoffs', value: sig(result.handoffsPerUnit), raw: result.handoffsPerUnit, hint: 'lane to lane, per unit of work' }
    ];
    if (totals.capacity) {
        const c = totals.capacity;
        const busy = c.busy === null ? '' : `, ${formatPercent(c.busy)} busy`;
        items.push({
            key: 'capacity', label: 'Capacity', value: `${sig(c.perWeek)} / wk`, raw: c.perWeek,
            hint: `limited by ${graph.lanes[c.lane].name}${busy}`
        });
    }
    return items;
}

/**
 * How each headline figure moved against a baseline model, as
 * { key, text } for the ones that changed. Used for "since last save".
 */
export function headlineChanges(model, baseline) {
    if (!model.ok || !baseline || !baseline.ok || !model.result.ok || !baseline.result.ok) return [];
    // A different process is not a change to this one: most of the saved steps must still be here.
    const names = new Set(model.graph.nodes.map((n) => n.name));
    const kept = baseline.graph.nodes.filter((n) => names.has(n.name)).length;
    if (kept * 2 < baseline.graph.nodes.length) return [];
    const before = new Map(headline(baseline).map((h) => [h.key, h]));
    const changes = [];
    for (const now of headline(model)) {
        const was = before.get(now.key);
        if (!was) { changes.push({ key: now.key, text: 'new since last save' }); continue; }
        if (was.value === now.value || was.raw === null || now.raw === null) continue;
        changes.push({ key: now.key, text: `${now.raw > was.raw ? 'up' : 'down'} from ${was.value}` });
    }
    return changes;
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
    const c = model.totals.capacity;
    const capacity = c ? ` The process can carry about ${sig(c.perWeek)} a week, limited by ${graph.lanes[c.lane].name}.` : '';
    const split = graph.parallel.blocks.length > 0;
    const inAll = split && result.touch > result.touchPath * (1 + 1e-9) ? ` Work done at the same time brings the work to ${dur(result.touch)} in all.` : '';
    return `A unit of work takes ${dur(result.lead)} on average${split ? ' along its slowest path' : ''}, of which ${dur(result.touchPath)} is work and ${dur(result.wait)} is waiting.${inAll}${rework} ${yieldPart}.${capacity} ${calendar}`;
}

/** The short line drawn under the title, so a pasted picture still carries its numbers. */
export function summaryLine(model) {
    return headline(model).map((h) => `${h.label} ${h.value}`).join(SUMMARY_GAP);
}
