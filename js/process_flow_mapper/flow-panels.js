// Result panels for the process flow mapper: the headline figures, the
// "where the time goes" bars and the tables. Builds DOM, holds no state.

import { headline, formatDuration, formatPercent, formatPasses, autoUnit } from './flow-model.js';

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

/**
 * A table as CSV text: quoted where a cell holds a comma, a quote or a line
 * break. A cell starting = + - or @ is a typed name a spreadsheet would run as
 * a formula, so it gets a leading apostrophe and stays text.
 */
export function tableToCsv(table) {
    const defuse = (text) => (/^[=+\-@\t\r]/.test(text) ? `'${text}` : text);
    const quote = (text) => (/[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
    return [...table.rows].map((row) => [...row.cells].map((c) => quote(defuse(c.textContent.trim()))).join(',')).join('\r\n');
}

/**
 * The steps that take the most lead time, largest first, each bar split into
 * waiting and working. Widths are SVG attributes: a style attribute is not
 * allowed under this page's CSP. onPick(stepIndex) is called on click.
 */
export function fillBars(container, model, onPick) {
    const { result, graph, unit } = model;
    // Ranked by what each step adds to lead time. A step on a faster branch
    // adds nothing, so it is left to the steps table, which shows its slack.
    const rows = result.ok
        ? result.perStep.map((s, i) => {
            const counted = s.share * result.lead;
            return { ...s, index: i, counted, touch: Math.min(s.touch, counted), wait: Math.max(0, counted - s.touch) };
        }).filter((s) => s.critical && s.counted > 0).sort((a, b) => (b.counted - a.counted) || (a.index - b.index)).slice(0, BAR_COUNT)
        : [];
    const top = rows.length ? rows[0].counted : 0;
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

/**
 * How lead time is spread: three figures, a small histogram and what they
 * rest on, with the histogram also as a table for anyone not reading the
 * bars. parts is { stats, chart, note, table, tableBox }. Returns false when
 * the model has no spread to show.
 */
export function fillSpread(parts, model) {
    const { spread, graph, unit } = model;
    parts.stats.replaceChildren();
    parts.chart.replaceChildren();
    parts.note.textContent = '';
    parts.tableBox.hidden = true;
    parts.table.tHead.replaceChildren();
    parts.table.tBodies[0].replaceChildren();
    if (!spread) {
        // A big map is walked off the page's thread, and the card fills when it is done.
        if (model.spreadPending) parts.note.textContent = 'Working out how lead time is spread…';
        return Boolean(model.spreadPending);
    }
    const dur = (h) => formatDuration(h, graph.calendar, unit);
    if (!spread.varies) {
        parts.note.textContent = `Every unit of work takes ${dur(spread.p50)}: nothing branches and no time is given as a range, so there is no spread to show. Write a time as a range, such as "wait 1-3 d", to see one.`;
        return true;
    }
    // The three side by side in one unit, the one that suits the smallest, so they compare at a glance.
    const smallest = [spread.p50, spread.p80, spread.p95].find((v) => v > 0) || 0;
    const same = unit === 'auto' ? autoUnit(smallest, graph.calendar) : unit;
    for (const [key, label, value, hint] of [
        ['p50', 'Half finish within', spread.p50, 'the typical unit of work'],
        ['p80', '8 in 10 within', spread.p80, 'a figure to quote'],
        ['p95', '19 in 20 within', spread.p95, 'the slow ones']
    ]) {
        const card = node('div', 'stat');
        card.setAttribute('data-stat', key);
        card.append(node('dt', 'stat-label', label), node('dd', 'stat-value', formatDuration(value, graph.calendar, same)), node('dd', 'stat-hint', hint));
        parts.stats.appendChild(card);
    }

    if (spread.histogram) {
        const { from, to, counts } = spread.histogram;
        const top = Math.max(...counts);
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'spread-bars');
        svg.setAttribute('viewBox', `0 0 ${counts.length * 10} 40`);
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', `Histogram of lead time from ${dur(from)} to ${dur(to)}. The last bar holds everything slower.`);
        counts.forEach((count, i) => {
            const rect = document.createElementNS(SVG_NS, 'rect');
            const h = top > 0 ? (count / top) * 40 : 0;
            rect.setAttribute('class', 'spread-bar');
            rect.setAttribute('x', String(i * 10 + 1));
            rect.setAttribute('y', String(40 - h));
            rect.setAttribute('width', '8');
            rect.setAttribute('height', String(h));
            rect.setAttribute('data-count', String(count));
            svg.appendChild(rect);
        });
        const axis = node('div', 'spread-axis');
        axis.append(node('span', '', dur(from)), node('span', '', `${dur(to)} and over`));
        parts.chart.append(svg, axis);

        // The same bars as rows, in the unit of the figures above.
        const width = (to - from) / counts.length;
        const at = (h) => formatDuration(h, graph.calendar, same);
        fillTable(parts.table, [
            { label: 'Lead time', value: (r) => (r.last ? `${at(r.low)} and over` : `${at(r.low)} to ${at(r.low + width)}`) },
            { label: 'Units', num: true, value: (r) => r.count.toLocaleString('en-US') },
            { label: 'Share', num: true, value: (r) => formatPercent(r.count / spread.units) }
        ], counts.map((count, i) => ({ low: from + i * width, count, last: i === counts.length - 1 })));
        parts.tableBox.hidden = false;
    }

    const basis = spread.ranges
        ? 'A time given as a range is drawn from that range; a time given as one number stays fixed.'
        : 'Every time here is one fixed number, so this is the spread that branching and rework cause on their own. Write a time as a range, such as "wait 1-3 d", to include how much it varies.';
    const cut = spread.cut
        ? ` The map loops so much that the run was stopped early, so these figures rest on fewer units and could be out by about ${dur(2 * spread.error)} either way on the average.`
        : '';
    parts.note.textContent = `From ${spread.units.toLocaleString('en-US')} simulated units of work, seed ${spread.seed}. The average is ${dur(spread.mean)}. ${basis}${cut}`;
    return true;
}

/** Fill a table from column definitions: { label, num?, head?, value(row) }. The row header is the column marked head, or the first. */
export function fillTable(table, columns, rows) {
    const headAt = Math.max(0, columns.findIndex((c) => c.head));
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
            const cell = node(i === headAt ? 'th' : 'td', col.num ? 'num' : '', col.value(row));
            if (i === headAt) cell.scope = 'row';
            tr.appendChild(cell);
        });
        return tr;
    }));
}

/** Every table under the map. A model with no figures empties the ones that need them. */
export function fillTables(tables, model) {
    const { result, graph, totals, unit, spread, sipoc } = model;
    const dur = (h) => formatDuration(h, graph.calendar, unit);
    const lane = (i) => graph.lanes[i].name;

    // What each phase takes in and hands on, and who from and to.
    const list = (items) => items.join(', ');
    fillTable(tables.sipoc, [
        { label: 'Suppliers', value: (r) => list(r.suppliers) },
        { label: 'Inputs', value: (r) => list(r.inputs) },
        { label: 'Process', head: true, value: (r) => r.name },
        { label: 'Outputs', value: (r) => list(r.outputs) },
        { label: 'Customers', value: (r) => list(r.customers) }
    ], sipoc || []);

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

    // How long the work that ends at each place took, from the simulation.
    const simulated = new Map(spread && spread.varies ? spread.ends.map((e) => [e.index, e]) : []);
    const endCols = [
        { label: 'Ends at', value: (r) => graph.nodes[r.index].name },
        { label: 'Share of work', num: true, value: (r) => formatPercent(r.share) },
        { label: 'Lane', value: (r) => lane(graph.nodes[r.index].lane) }
    ];
    if (simulated.size) {
        endCols.push(
            { label: 'Half within', num: true, value: (r) => (simulated.has(r.index) ? dur(simulated.get(r.index).p50) : '') },
            { label: '9 in 10 within', num: true, value: (r) => (simulated.has(r.index) ? dur(simulated.get(r.index).p90) : '') }
        );
    }
    fillTable(tables.ends, endCols, result.ok ? [...result.ends].sort((a, b) => b.share - a.share).map((e) => ({
        ...e, className: graph.nodes[e.index].kind === 'terminator' ? '' : 'flagged'
    })) : []);

    fillTable(tables.steps, [
        { label: 'Step', value: (r) => r.name },
        { label: 'Lane', value: (r) => lane(r.lane) },
        { label: 'Passes', num: true, value: (r) => (result.ok ? formatPasses(result.perStep[r.index].passes) : '') },
        { label: 'Touch', num: true, value: (r) => (result.ok ? dur(result.perStep[r.index].touch) : dur(r.touch)) },
        { label: 'Wait', num: true, value: (r) => (result.ok ? dur(result.perStep[r.index].wait) : dur(r.wait)) },
        { label: 'Share of lead', num: true, value: (r) => (result.ok ? formatPercent(result.perStep[r.index].share) : '') },
        ...(result.ok && result.blocks.length
            ? [{ label: 'Slack', num: true, value: (r) => (result.perStep[r.index].critical ? '' : dur(result.perStep[r.index].slack)) }]
            : [])
    ], graph.nodes);

    fillTable(tables.exits, [
        { label: 'From', value: (r) => graph.nodes[r.source].name },
        { label: 'To', value: (r) => graph.nodes[r.target].name },
        { label: 'Label', value: (r) => r.label },
        { label: 'Share', num: true, value: (r) => (r.parallel ? 'all' : formatPercent(r.share)) },
        { label: 'Wait on the way', num: true, value: (r) => (r.wait > 0 ? dur(r.wait) : '') },
        { label: 'Per unit', num: true, value: (r) => (result.ok ? formatPasses(result.traversals[r.index]) : '') },
        { label: 'Kind', value: (r) => [r.rework ? 'rework' : '', r.parallel ? 'at the same time' : '', r.handoff ? 'handoff' : ''].filter(Boolean).join(', ') }
    ], graph.links.map((l) => ({ ...l, className: l.rework ? 'flagged' : '' })));
}
