// Text in, drawable model out. Pure, no DOM: parse, build, balance, lay out.

import { parseFlows } from './sankey-parse.js';
import { buildGraph, computeBalance, computeLayout, formatValue, formatPercent } from './sankey-engine.js';
import { traceFlows } from './sankey-trace.js';

export const TITLE_HEIGHT = 30;
export const FOOTNOTE_HEIGHT = 22;

/**
 * settings: { title, tolerance, width, height, nodeWidth, nodePadding, align, order }.
 * positions overrides the positions parsed from the text, which is how a drag
 * in progress previews without rewriting the text on every pointer move.
 * Returns { ok, errors, warnings, parsed, graph, balance, layout, traces }. On a
 * blocking error graph, balance and layout are null and nothing is drawn.
 */
export function buildModel(text, settings = {}, positions = null) {
    const parsed = parseFlows(text);
    const errors = [...parsed.errors];
    const warnings = [...parsed.warnings];

    if (errors.length === 0 && parsed.flows.length === 0) {
        errors.push({ line: null, code: 'NO_FLOWS', message: 'Enter at least one flow, for example "Feed [100] Product"' });
    }
    if (errors.length) return { ok: false, errors, warnings, parsed, graph: null, balance: null, layout: null, traces: [] };

    const graph = buildGraph(parsed.flows);
    warnings.push(...graph.warnings);

    const balance = computeBalance(graph, { tolerance: settings.tolerance });
    if (balance.totalIn === 0) {
        warnings.push({
            line: null,
            code: 'NO_INPUT',
            message: 'Every node has something entering it, so the system has no input and nothing to take a share of'
        });
    }

    const traced = traceFlows(graph, parsed.traces);
    warnings.push(...traced.warnings);

    const pins = positions || parsed.positions;
    const base = { ...settings, titleHeight: settings.title ? TITLE_HEIGHT : 0, footnoteHeight: 0 };
    let layout = computeLayout(graph, balance, base, pins, parsed.columns);
    // The not-to-scale footnote needs room, which is only known after a first pass.
    if (layout.hairlines.length || layout.widened.length || layout.widthMode !== 'scale' || traced.traces.length) {
        layout = computeLayout(graph, balance, { ...base, footnoteHeight: FOOTNOTE_HEIGHT }, pins, parsed.columns);
    }
    if (layout.widthMode !== 'scale') {
        const how = layout.widthMode === 'equal'
            ? 'Every flow is drawn the same width, so widths show what connects to what and say nothing about amounts'
            : 'Widths follow the square root of each amount, so large flows are understated and widths do not add up';
        warnings.push({ line: null, code: 'NOT_TO_SCALE', message: `${how}. Read amounts from the labels and tables. Set "Flow widths" to "To scale" for a true-scale diagram` });
    }
    if (layout.widened.length) {
        const px = String(Math.round(layout.minLinkWidth * 10) / 10);
        warnings.push({
            line: null,
            code: 'WIDENED',
            message: `${layout.widened.length} of ${graph.links.length} flow(s) are drawn at the ${px} px minimum, wider than their true scale, so widths no longer compare or add up exactly. Set "Thinnest flow" to 0 for a true-scale diagram`
        });
    }
    for (const d of layout.displaced) {
        warnings.push({
            line: null,
            code: 'COLUMN_DISPLACED',
            message: `"${graph.nodes[d.index].name}" is set to column ${d.wanted}, but something that feeds it is in that column or further right, so it is drawn in column ${d.used}`
        });
    }
    if (layout.hairlines.length) {
        const names = layout.hairlines.slice(0, 4)
            .map((i) => `${graph.nodes[graph.links[i].source].name} to ${graph.nodes[graph.links[i].target].name}`);
        const more = layout.hairlines.length > 4 ? ` and ${layout.hairlines.length - 4} more` : '';
        warnings.push({
            line: null,
            code: 'HAIRLINE',
            message: `${layout.hairlines.length} flow(s) are under 1 px at this size and are drawn as dashed lines, not to scale: ${names.join('; ')}${more}`
        });
    }

    return { ok: true, errors, warnings, parsed, graph, balance, layout, traces: traced.traces };
}

/**
 * One or two sentences on whether the balance closes, for the status line and
 * the SVG description. The tolerance is always named, because it is the only
 * thing standing between "closes" and "does not".
 */
export function balanceSummary(balance, unit = '', decimals = 'auto') {
    const u = unit ? ` ${unit}` : '';
    const tol = formatPercent(balance.tolerance);
    const totals = `Inputs ${formatValue(balance.totalIn, decimals)}${u}, outputs ${formatValue(balance.totalOut, decimals)}${u}`;

    if (balance.balanced) {
        const leaned = balance.tolerated.length + (balance.closesExactly ? 0 : 1);
        if (leaned === 0) return `${totals}. The balance closes exactly (tolerance ${tol}).`;
        // Passing only because the tolerance allows it is worth saying out loud.
        const worst = balance.tolerated.reduce((m, n) => Math.max(m, Math.abs(n.relative)), 0);
        const overall = balance.closesExactly ? 0 : Math.abs(balance.residual) / Math.max(balance.totalIn, balance.totalOut);
        return `${totals}. The balance closes only within the ${tol} tolerance: the largest gap is ${formatPercent(Math.max(worst, overall))}.`;
    }

    const count = balance.unbalanced.length;
    const nodesPart = count === 1 ? '1 node does not balance' : `${count} nodes do not balance`;
    if (balance.totalIn === 0 && balance.totalOut === 0) {
        // A closed loop has no boundary to compare, only nodes.
        return `No system input or output: every flow is part of a loop. ${nodesPart[0].toUpperCase()}${nodesPart.slice(1)} at a ${tol} tolerance.`;
    }
    if (balance.closes) {
        // Offsetting errors: the totals agree while individual nodes do not.
        return `${totals}. The totals agree, but ${nodesPart} at a ${tol} tolerance, so errors inside the system are cancelling out.`;
    }
    const gap = formatValue(Math.abs(balance.residual), decimals);
    const direction = balance.residual > 0 ? 'more enters than leaves' : 'more leaves than enters';
    const nodes = count ? `, and ${nodesPart}` : '';
    return `${totals}. ${gap}${u} ${direction} (${formatPercent(Math.abs(balance.residual) / Math.max(balance.totalIn, balance.totalOut))})${nodes} at a ${tol} tolerance.`;
}
