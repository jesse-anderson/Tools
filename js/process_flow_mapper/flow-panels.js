// Result panels for the process flow mapper: the headline figures, the
// "where the time goes" bars and the tables. Builds DOM, holds no state.

import { headline, formatDuration, formatPercent, formatPasses } from './flow-model.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
export const BAR_COUNT = 10;

function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
}

/**
 * The headline figures in a row, each with what it means underneath. changes
 * is [{ key, text }] from headlineChanges: how a figure moved since the save.
 */
export function fillHeadline(container, model, changes = []) {
    const moved = new Map(changes.map((c) => [c.key, c.text]));
    container.replaceChildren(...headline(model).map((h) => {
        const card = node('div', 'stat');
        card.setAttribute('data-stat', h.key);
        card.append(node('dt', 'stat-label', h.label), node('dd', 'stat-value', h.value), node('dd', 'stat-hint', h.hint));
        if (moved.has(h.key)) card.append(node('dd', 'stat-change', moved.get(h.key)));
        return card;
    }));
}

/** A table as CSV text: quoted where a cell holds a comma, a quote or a line break. */
export function tableToCsv(table) {
    const quote = (text) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
    return [...table.rows].map((row) => [...row.cells].map((c) => quote(c.textContent.trim())).join(',')).join('\r\n');
}

/**
 * The steps that take the most lead time, largest first, each bar split into
 * waiting and working. Widths are SVG attributes: a style attribute is not
 * allowed under this page's CSP. onPick(stepIndex) is called on click.
 */
export function fillBars(container, model, onPick) {
    const { result, graph, unit } = model;
    const rows = result.ok
        ? result.perStep.map((s, i) => ({ ...s, index: i })).filter((s) => s.lead > 0).sort((a, b) => (b.lead - a.lead) || (a.index - b.index)).slice(0, BAR_COUNT)
        : [];
    const top = rows.length ? rows[0].lead : 0;
    const dur = (h) => formatDuration(h, graph.calendar, unit);

    container.replaceChildren(...rows.map((row) => {
        const step = graph.nodes[row.index];
        const item = node('li', 'bar-row');
        const button = node('button', 'bar-button');
        button.type = 'button';
        button.setAttribute('data-node', String(row.index));
        button.setAttribute('aria-pressed', 'false');
        button.setAttribute('aria-label',
            `${step.name}, ${graph.lanes[step.lane].name}: ${formatPercent(row.share)} of lead time, ${dur(row.wait)} waiting and ${dur(row.touch)} working. Show on the map`);

        const head = node('span', 'bar-head');
        head.append(node('span', 'bar-name', step.name), node('span', 'bar-share', formatPercent(row.share)));

        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'bar-track');
        svg.setAttribute('viewBox', '0 0 100 8');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('aria-hidden', 'true');
        const waitWidth = top > 0 ? (row.wait / top) * 100 : 0;
        const touchWidth = top > 0 ? (row.touch / top) * 100 : 0;
        for (const [cls, x, w] of [['bar-wait', 0, waitWidth], ['bar-touch', waitWidth, touchWidth]]) {
            const rect = document.createElementNS(SVG_NS, 'rect');
            rect.setAttribute('class', cls);
            rect.setAttribute('x', String(x));
            rect.setAttribute('y', '0');
            rect.setAttribute('width', String(Math.max(0, w)));
            rect.setAttribute('height', '8');
            svg.appendChild(rect);
        }

        const parts = [`${graph.lanes[step.lane].name}`, `${dur(row.wait)} waiting`, `${dur(row.touch)} working`];
        if (row.passes > 1.005) parts.push(`passed ${formatPasses(row.passes)}`);
        button.append(head, svg, node('span', 'bar-detail', parts.join('  ·  ')));
        button.addEventListener('click', () => onPick(row.index));
        item.appendChild(button);
        return item;
    }));
    return rows.length;
}

/** Fill a table from column definitions: { label, num?, value(row) }. The first column is the row header. */
export function fillTable(table, columns, rows) {
    const headRow = node('tr');
    for (const col of columns) {
        const th = node('th', col.num ? 'num' : '', col.label);
        th.scope = 'col';
        headRow.appendChild(th);
    }
    table.tHead.replaceChildren(headRow);
    table.tBodies[0].replaceChildren(...rows.map((row) => {
        const tr = node('tr', row.className || '');
        columns.forEach((col, i) => {
            const cell = node(i === 0 ? 'th' : 'td', col.num ? 'num' : '', col.value(row));
            if (i === 0) cell.scope = 'row';
            tr.appendChild(cell);
        });
        return tr;
    }));
}

/** Every table under the map. A model with no figures empties the ones that need them. */
export function fillTables(tables, model) {
    const { result, graph, totals, unit } = model;
    const dur = (h) => formatDuration(h, graph.calendar, unit);
    const lane = (i) => graph.lanes[i].name;

    const laneCols = [
        { label: 'Lane', value: (r) => r.name },
        { label: 'Steps', num: true, value: (r) => String(r.steps) },
        { label: 'Touch', num: true, value: (r) => dur(r.touch) },
        { label: 'Wait', num: true, value: (r) => dur(r.wait) },
        { label: 'Share of lead', num: true, value: (r) => formatPercent(r.share) },
        { label: 'Hands on', num: true, value: (r) => String(r.handoffsOut) },
        { label: 'Receives', num: true, value: (r) => String(r.handoffsIn) }
    ];
    const figure = (v) => v.toLocaleString('en-US', { maximumSignificantDigits: 3 });
    if (totals && totals.arrivalsPerWeek !== null) {
        laneCols.push({ label: 'Work per week', num: true, value: (r) => `${figure(r.loadPerWeek)} h` });
    }
    // Staffing columns appear once any lane has staff.
    if (totals && totals.lanes.some((l) => l.staff)) {
        laneCols.push(
            { label: 'Staff', num: true, value: (r) => (r.staff ? `${figure(r.staff.people)}${r.staff.share < 1 ? ` @ ${formatPercent(r.staff.share)}` : ''}` : '') },
            { label: 'Hours per week', num: true, value: (r) => (r.available === null ? '' : `${figure(r.available)} h`) },
            { label: 'Can carry', num: true, value: (r) => (r.canCarry === null ? '' : `${figure(r.canCarry)} / wk`) }
        );
        if (totals.arrivalsPerWeek !== null) {
            laneCols.push({ label: 'Busy', num: true, value: (r) => (r.busy === null ? '' : formatPercent(r.busy)) });
        }
    }
    const limit = totals && totals.capacity ? totals.capacity.lane : -1;
    fillTable(tables.lanes, laneCols, totals ? totals.lanes.map((l) => ({
        ...l, className: l.busy !== null && l.busy > 1 ? 'flagged' : (l.index === limit ? 'limit' : '')
    })) : []);

    // Who hands work to whom: rows hand on, columns receive.
    const matrix = graph.counts.handoffMatrix;
    fillTable(tables.handoffs, [
        { label: 'Hands on to', value: (r) => r.name },
        ...graph.lanes.map((to) => ({ label: to.name, num: true, value: (r) => (r.index === to.index ? '' : String(matrix[r.index][to.index] || '')) }))
    ], graph.counts.handoffs ? graph.lanes : []);

    fillTable(tables.phases, [
        { label: 'Phase', value: (r) => r.name || 'Whole process' },
        { label: 'Steps', num: true, value: (r) => String(r.steps) },
        { label: 'Touch', num: true, value: (r) => dur(r.touch) },
        { label: 'Wait', num: true, value: (r) => dur(r.wait) },
        { label: 'Share of lead', num: true, value: (r) => formatPercent(r.share) }
    ], totals ? totals.phases.filter((p) => p.steps > 0) : []);

    fillTable(tables.ends, [
        { label: 'Ends at', value: (r) => graph.nodes[r.index].name },
        { label: 'Share of work', num: true, value: (r) => formatPercent(r.share) },
        { label: 'Lane', value: (r) => lane(graph.nodes[r.index].lane) }
    ], result.ok ? [...result.ends].sort((a, b) => b.share - a.share).map((e) => ({
        ...e, className: graph.nodes[e.index].kind === 'terminator' ? '' : 'flagged'
    })) : []);

    fillTable(tables.steps, [
        { label: 'Step', value: (r) => r.name },
        { label: 'Lane', value: (r) => lane(r.lane) },
        { label: 'Passes', num: true, value: (r) => (result.ok ? formatPasses(result.perStep[r.index].passes) : '') },
        { label: 'Touch', num: true, value: (r) => (result.ok ? dur(result.perStep[r.index].touch) : dur(r.touch)) },
        { label: 'Wait', num: true, value: (r) => (result.ok ? dur(result.perStep[r.index].wait) : dur(r.wait)) },
        { label: 'Share of lead', num: true, value: (r) => (result.ok ? formatPercent(result.perStep[r.index].share) : '') }
    ], graph.nodes);

    fillTable(tables.exits, [
        { label: 'From', value: (r) => graph.nodes[r.source].name },
        { label: 'To', value: (r) => graph.nodes[r.target].name },
        { label: 'Label', value: (r) => r.label },
        { label: 'Share', num: true, value: (r) => formatPercent(r.share) },
        { label: 'Per unit', num: true, value: (r) => (result.ok ? formatPasses(result.traversals[r.index]) : '') },
        { label: 'Kind', value: (r) => [r.rework ? 'rework' : '', r.handoff ? 'handoff' : ''].filter(Boolean).join(', ') }
    ], graph.links.map((l) => ({ ...l, className: l.rework ? 'flagged' : '' })));
}
