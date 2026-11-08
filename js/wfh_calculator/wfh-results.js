// Draws the results panel from a calculate() result. Text goes in through
// textContent only, since job names and line labels are user text.

import { CATEGORIES, HOURS_CATEGORIES, round } from './wfh-engine.js';
import { buildChart, resolveColors } from './wfh-chart.js';

const $ = (id) => document.getElementById(id);

export function money(v, cur = '$', dp = 0) {
    if (v === null || v === undefined || !Number.isFinite(v)) return '-';
    const abs = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    return `${v < -0.0000001 && Math.abs(v) >= 0.5 * 10 ** -dp ? '-' : ''}${cur}${abs}`;
}
const hrs = (h) => `${round(h, 0).toLocaleString('en-US')} h`;
const daysLabel = (d) => (Number.isInteger(d) ? String(d) : String(round(d, 2)));

function node(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
}

function tile(label, value, sub) {
    const t = node('div', 'tile');
    t.append(node('span', 'tile-label', label), node('span', 'tile-value', value));
    if (sub) t.appendChild(node('span', 'tile-sub', sub));
    return t;
}

function timeOn(state) {
    return state.person.timeValueMode !== 'none';
}

function renderTiles(state, r, cur) {
    const box = $('tiles');
    box.textContent = '';
    const ev = r.single;
    const p = ev.policy;
    const withTime = timeOn(state);
    box.appendChild(tile('One office day costs', money(ev.officeDayCost.money, cur, 2),
        withTime ? `plus ${money(ev.officeDayCost.time, cur, 2)} of your time` : 'time not valued'));
    box.appendChild(tile(`A year at ${daysLabel(ev.policyDays)} office days a week`, money(p.money, cur),
        withTime ? `${money(p.total, cur)} with time` : `${hrs(p.hours)} commuting`));
    box.appendChild(tile('Saved against full office', money(p.savingMoneyVsFull, cur),
        withTime ? `${money(p.savingVsFull, cur)} with time` : ''));
    const pct = p.equivalentRaisePct;
    box.appendChild(tile('Equivalent pre-tax raise', money(withTime ? p.equivalentRaise : p.equivalentRaiseMoney, cur),
        pct !== null && withTime ? `${round(pct, 1)}% of pay; what a full-office job would have to add` : 'what a full-office job would have to add'));
    box.appendChild(tile('Commuting a year', hrs(p.hours), `${hrs(r.hours.regained)} fewer than full office`));
    if (ev.rates) {
        box.appendChild(tile('Pay per hour worked', money(ev.rates.pure, cur, 2),
            `${money(ev.rates.withCommute, cur, 2)} counting commute time as work`));
    }
}

function renderComparison(state, r, cur) {
    const box = $('comparison');
    box.textContent = '';
    const c = r.comparison;
    box.hidden = !c;
    if (!c) return;
    const names = [state.jobs[0].name || 'Job A', state.jobs[1].name || 'Job B'];
    const withTime = timeOn(state);
    box.appendChild(node('h3', null, 'Two jobs'));
    const table = node('table', 'compare-table');
    const head = node('tr');
    head.append(node('th', null, ''), node('th', 'num', names[0]), node('th', 'num', names[1]), node('th', 'num', `${names[1]} minus ${names[0]}`));
    head.querySelectorAll('th').forEach((th) => th.setAttribute('scope', 'col'));
    const thead = node('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    const tbody = node('tbody');
    const row = (label, a, b, d, strong) => {
        const tr = node('tr', strong ? 'strong' : '');
        const th = node('th', null, label);
        th.setAttribute('scope', 'row');
        tr.append(th, node('td', 'num', a), node('td', 'num', b), node('td', 'num', d));
        tbody.appendChild(tr);
    };
    const oa = Number(state.jobs[0].otherPayNet) || 0;
    const ob = Number(state.jobs[1].otherPayNet) || 0;
    row('Office days per week', daysLabel(c.a.policyDays), daysLabel(c.b.policyDays), '');
    row('Pay before tax', money(c.a.pay.annual, cur), money(c.b.pay.annual, cur), money(c.payGap, cur));
    row('Tax on the next dollar', `${round(c.a.pay.marginalRate * 100, 2)}%`, `${round(c.b.pay.marginalRate * 100, 2)}%`, '');
    if (c.exactTax) {
        row('Take-home pay', money(c.a.pay.net, cur), money(c.b.pay.net, cur), money(c.payGapNet, cur));
    } else {
        row(`Pay gap kept after tax (${round(c.gapRate * 100, 1)}%)`, '', '', money(c.payGapNet, cur));
    }
    if (oa || ob) row('Other pay after tax', money(oa, cur), money(ob, cur), money(c.otherGap, cur));
    row('What working costs (money)', money(c.a.policy.money, cur), money(c.b.policy.money, cur), money(-c.costGap, cur));
    row('Better or worse off, money only', '', '', money(c.differenceMoney, cur), !withTime);
    if (withTime) {
        row('Commute time at your rate', money(c.a.policy.time, cur), money(c.b.policy.time, cur), money(-c.timeGap, cur));
        row('Better or worse off, counting time', '', '', money(c.difference, cur), true);
    }
    row('Commuting hours a year', hrs(c.a.policy.hours), hrs(c.b.policy.hours), hrs(c.differenceHours));
    row('Days off a year', String(Number(state.jobs[0].daysOff) || 0), String(Number(state.jobs[1].daysOff) || 0), '');
    const ra = c.a.rates;
    const rb = c.b.rates;
    if (ra && rb) {
        row('Pay per hour worked', money(ra.pure, cur, 2), money(rb.pure, cur, 2), money(rb.pure - ra.pure, cur, 2));
        row('Pay per hour, counting commute as work', money(ra.withCommute, cur, 2), money(rb.withCommute, cur, 2), money(rb.withCommute - ra.withCommute, cur, 2));
        if (ra.takeHomeWithCommute !== null && rb.takeHomeWithCommute !== null) {
            row('Take-home per hour, after commute costs and time', money(ra.takeHomeWithCommute, cur, 2), money(rb.takeHomeWithCommute, cur, 2), money(rb.takeHomeWithCommute - ra.takeHomeWithCommute, cur, 2));
        }
    }
    table.appendChild(tbody);
    const scroll = node('div', 'table-scroll');
    scroll.appendChild(table);
    box.appendChild(scroll);
    let taxNote;
    if (c.exactTax) {
        taxNote = `Each salary is taxed with the 2026 federal brackets, payroll tax and its state rate, so ${round(c.gapRate * 100, 2)}% of the gap goes to tax.`;
        if (c.thresholds.length) taxNote += ` Between the two salaries pay crosses ${listJoin(c.thresholds.map((t) => `${t.label} (${money(t.wage, cur)} of pay)`))}, so the gap is taxed at more than one rate.`;
    } else {
        taxNote = 'Only the difference in pay is taxed here, at the typed marginal rate of the higher-paid job. Choose 2026 US brackets for both jobs to tax each salary in full.';
    }
    box.appendChild(node('p', 'helper-text', `${taxNote} Costs are subtracted, so a positive figure favors ${names[1]}.`));
    if (ra && rb) box.appendChild(node('p', 'helper-text', 'Pay per hour worked spreads pay over the hours you actually work, so more days off raise it. Counting commute adds each job\'s commute and getting-ready time to those hours. The take-home rate also takes off tax and the money each job costs to get to.'));

    const diff = withTime ? c.difference : c.differenceMoney;
    const better = diff > 0.5 ? names[1] : diff < -0.5 ? names[0] : null;
    const verdict = node('p', 'verdict');
    verdict.textContent = better
        ? `${better} leaves you ${money(Math.abs(diff), cur)} a year better off${withTime ? ', counting commute time' : ''}.`
        : 'The two come out about even.';
    box.appendChild(verdict);
    const be = withTime ? c.breakEven : c.breakEvenMoney;
    const p = node('p', 'helper-text');
    p.textContent = be
        ? `${names[1]} breaks even with ${names[0]} at ${money(be.annual, cur)} a year (${money(be.hourly, cur, 2)} an hour), all else held the same.${withTime && state.person.timeValueMode !== 'custom' ? ' Time is valued at each job\'s own pay, so the break-even moves the rate with it.' : ''}`
        : 'No break-even salary found for these inputs.';
    box.appendChild(p);
    renderCostOfLiving(box, c.costOfLiving, names, cur);
}

function listJoin(items) {
    if (items.length < 2) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

// Job B's money position restated in Job A's prices.
function renderCostOfLiving(box, col, names, cur) {
    if (!col) return;
    const h = node('h4', 'col-heading', 'Cost of living');
    box.appendChild(h);
    if (col.incomplete) {
        box.appendChild(node('p', 'helper-text', `Choose where you would live for ${col.placeA ? names[1] : names[0]} too, under "Where you would live" in that job, to compare prices.`));
        return;
    }
    if (col.needsBrackets) {
        box.appendChild(node('p', 'helper-text', 'The cost-of-living line needs take-home pay, so choose 2026 US brackets for both jobs.'));
        return;
    }
    const pctAbove = (x) => `${round(Math.abs(x - 100), 1)}% ${x >= 100 ? 'above' : 'below'} the US average`;
    const lines = [
        `Prices: ${col.placeA.name} ${round(col.placeA.all, 1)} (${pctAbove(col.placeA.all)}), ${col.placeB.name} ${round(col.placeB.all, 1)} (${pctAbove(col.placeB.all)}).`,
        `Left after tax and working costs: ${names[0]} ${money(col.keptA, cur)}; ${names[1]} ${money(col.keptB, cur)}, worth ${money(col.keptBInA, cur)} at ${names[0]}'s prices.`,
    ];
    lines.forEach((t) => box.appendChild(node('p', 'helper-text', t)));
    const better = col.difference > 0.5 ? names[1] : col.difference < -0.5 ? names[0] : null;
    const v = node('p', 'verdict');
    v.textContent = better
        ? `Adjusted for prices, ${better} leaves you ${money(Math.abs(col.difference), cur)} a year better off, money only.`
        : 'Adjusted for prices, the two come out about even, money only.';
    box.appendChild(v);
    box.appendChild(node('p', 'helper-text', 'BEA Regional Price Parities for 2024, released February 2026, the latest published. Only the ratio between the two places is used, so inflation since then does not change it. The index prices typical spending including rent; it does not know about a mortgage you already have, and money you save rather than spend goes no further in a cheaper place, so a high saver should read the gap as an upper bound.'));
}

function renderChart(state, r, cur) {
    const wrap = $('chartWrap');
    wrap.textContent = '';
    const withTime = timeOn(state);
    const colors = resolveColors(wrap);
    let bars;
    let heading;
    if (r.comparison) {
        const c = r.comparison;
        const names = [state.jobs[0].name || 'Job A', state.jobs[1].name || 'Job B'];
        bars = [c.a, c.b].map((j, i) => barFor(j.policy, names[i], `${daysLabel(j.policyDays)} days a week`, false, withTime, cur));
        heading = 'Yearly cost of working, each job at its own policy';
        $('chartNote').textContent = 'Costs only: pay is in the table above.';
    } else {
        const ev = r.single;
        const pd = ev.policyDays;
        const rows = [...ev.patterns];
        if (!rows.some((p) => Math.abs(p.daysPerWeek - pd) < 1e-9)) rows.push(ev.policy);
        rows.sort((x, y) => y.daysPerWeek - x.daysPerWeek);
        bars = rows.map((p) => {
            const mine = Math.abs(p.daysPerWeek - pd) < 1e-9;
            const sub = mine ? 'your policy' : (p.daysPerWeek === 0 ? 'fully remote' : '');
            return barFor(p, `${daysLabel(p.daysPerWeek)} days`, sub, mine, withTime, cur);
        });
        heading = 'Yearly cost by office days per week';
        $('chartNote').textContent = withTime ? 'Each bar is a year of working days. Time value is the top segment.' : 'Each bar is a year of working days, money only.';
    }
    $('chartHeading').textContent = heading;
    const { svg, groups } = buildChart({ bars, colors, format: (v) => money(v, cur), includeTime: withTime, title: heading });
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    wrap.appendChild(svg);
    wireTooltip(groups, bars, cur, withTime);

    const legend = $('legend');
    legend.textContent = '';
    CATEGORIES.forEach((c, i) => {
        if (c.key === 'time' && !withTime) return;
        const item = node('span', 'legend-item');
        const sw = node('span', 'swatch');
        sw.style.setProperty('--swatch', colors.series[i]);
        item.append(sw, document.createTextNode(c.label));
        legend.appendChild(item);
    });

    // Export copy at a fixed size so files open at a sensible scale.
    const exportSvg = svg.cloneNode(true);
    exportSvg.setAttribute('width', '640');
    exportSvg.setAttribute('height', '330');
    return exportSvg;
}

function barFor(p, label, sublabel, highlight, withTime, cur) {
    const parts = {};
    for (const c of CATEGORIES) parts[c.key] = p[c.key];
    const total = withTime ? p.total : p.money;
    const aria = `${label}${sublabel ? ', ' + sublabel : ''}: ${money(total, cur)} a year. ` + CATEGORIES
        .filter((c) => withTime || c.key !== 'time')
        .map((c) => `${c.label} ${money(p[c.key], cur)}`).join(', ') + '.';
    return { label, sublabel, parts, total, highlight, aria, p };
}

function wireTooltip(groups, bars, cur, withTime) {
    const tip = $('chartTooltip');
    const show = (i, evt) => {
        const b = bars[i];
        tip.textContent = '';
        tip.appendChild(node('strong', null, `${b.label}${b.sublabel ? ' (' + b.sublabel + ')' : ''}: ${money(b.total, cur)}`));
        for (const c of CATEGORIES) {
            if (c.key === 'time' && !withTime) continue;
            if (Math.abs(b.p[c.key]) < 0.005) continue;
            tip.appendChild(node('span', null, `${c.label}: ${money(b.p[c.key], cur)}`));
        }
        tip.appendChild(node('span', null, `${round(b.p.officeDays, 0)} office days, ${hrs(b.p.hours)} commuting`));
        tip.hidden = false;
        const card = tip.parentElement.getBoundingClientRect();
        const r = (evt && evt.clientX !== undefined) ? { x: evt.clientX, y: evt.clientY } : (() => {
            const g = groups[i].getBoundingClientRect();
            return { x: g.left + g.width / 2, y: g.top + 20 };
        })();
        const x = Math.min(Math.max(8, r.x - card.left + 12), card.width - tip.offsetWidth - 8);
        tip.style.left = `${x}px`;
        tip.style.top = `${r.y - card.top + 12}px`;
    };
    const hide = () => { tip.hidden = true; };
    groups.forEach((g, i) => {
        g.addEventListener('mousemove', (e) => show(i, e));
        g.addEventListener('mouseleave', hide);
        g.addEventListener('focus', () => show(i));
        g.addEventListener('blur', hide);
    });
}

function renderTable(state, r, cur) {
    const table = $('patternTable');
    table.textContent = '';
    const card = table.closest('.table-card');
    let sel = $('tableJob');
    if (r.comparison) {
        if (!sel) {
            const label = node('label', 'inline-label', 'Patterns for ');
            label.htmlFor = 'tableJob';
            sel = node('select');
            sel.id = 'tableJob';
            sel.addEventListener('change', () => document.dispatchEvent(new Event('wfh-table-job')));
            const holder = node('div', 'table-job');
            holder.append(label, sel);
            card.insertBefore(holder, card.querySelector('.table-scroll'));
        }
        const keep = sel.value || '0';
        sel.textContent = '';
        [state.jobs[0].name || 'Job A', state.jobs[1].name || 'Job B'].forEach((n, i) => {
            const o = node('option', null, n);
            o.value = String(i);
            sel.appendChild(o);
        });
        sel.value = keep;
    } else if (sel) {
        sel.closest('.table-job').remove();
        sel = null;
    }
    const ev = r.comparison ? (sel && sel.value === '1' ? r.comparison.b : r.comparison.a) : r.single;
    const withTime = timeOn(state);
    const cols = [
        ['Office days a week', (p) => daysLabel(p.daysPerWeek)],
        ...CATEGORIES.filter((c) => c.key !== 'time').map((c) => [c.label, (p) => money(p[c.key], cur)]),
        ['Money total', (p) => money(p.money, cur)],
        ...(withTime ? [['Time value', (p) => money(p.time, cur)], ['Total with time', (p) => money(p.total, cur)]] : []),
        ['Commute hours', (p) => hrs(p.hours)],
        ['Saved vs full office', (p) => money(withTime ? p.savingVsFull : p.savingMoneyVsFull, cur)],
        ['Equivalent raise', (p) => money(withTime ? p.equivalentRaise : p.equivalentRaiseMoney, cur)],
    ];
    const thead = node('thead');
    const hr = node('tr');
    cols.forEach(([h], i) => {
        const th = node('th', i ? 'num' : '', h);
        th.setAttribute('scope', 'col');
        hr.appendChild(th);
    });
    thead.appendChild(hr);
    const tbody = node('tbody');
    const rows = [...ev.patterns];
    if (!ev.patterns.some((p) => Math.abs(p.daysPerWeek - ev.policyDays) < 1e-9)) rows.push(ev.policy);
    rows.sort((a, b) => b.daysPerWeek - a.daysPerWeek);
    for (const p of rows) {
        const tr = node('tr', Math.abs(p.daysPerWeek - ev.policyDays) < 1e-9 ? 'policy-row' : '');
        cols.forEach(([, f], i) => {
            const cell = node(i ? 'td' : 'th', i ? 'num' : '', f(p));
            if (!i) {
                cell.setAttribute('scope', 'row');
                if (tr.className) cell.appendChild(node('span', 'tag', 'policy'));
            }
            tr.appendChild(cell);
        });
        tbody.appendChild(tr);
    }
    table.append(thead, tbody);

    const notes = [];
    if (ev.transitBreakEven !== null) notes.push(`The monthly transit pass pays off at ${round(ev.transitBreakEven, 2)} or more office days a week${ev.transitBreakEven > ev.calendar.workDaysPerWeek ? ', which is never at your schedule' : ''}.`);
    if (ev.parkingBreakEven !== null) notes.push(`The parking permit pays off at ${round(ev.parkingBreakEven, 2)} or more office days a week${ev.parkingBreakEven > ev.calendar.workDaysPerWeek ? ', which is never at your schedule' : ''}.`);
    if (ev.policy.pretaxSaving > 0) notes.push(`Paying pre-tax saves ${money(ev.policy.pretaxSaving, cur)} a year at your policy.`);
    $('breakEvenNote').textContent = notes.join(' ');
}

function renderHours(state, r, cur) {
    $('hoursHeading').textContent = r.comparison ? `Hours, ${state.jobs[0].name || 'Job A'}` : 'Hours';
    const box = $('hoursBody');
    box.textContent = '';
    const h = r.hours;
    const p = node('p', 'helper-text');
    p.textContent = `Full office: ${hrs(h.fullOffice)} a year commuting and getting ready. At your policy: ${hrs(h.policy)}. Regained: ${hrs(h.regained)}, about ${round(h.regained / 8, 0)} eight-hour days.`;
    box.appendChild(p);
    const split = h.split;
    const any = HOURS_CATEGORIES.some((c) => split[c.key] > 0);
    if (!any) {
        box.appendChild(node('p', 'helper-text', 'Fill in "Where regained hours would go" under Time to see them split.'));
        return;
    }
    const table = node('table', 'hours-table');
    const tbody = node('tbody');
    for (const c of HOURS_CATEGORIES) {
        if (!(split[c.key] > 0)) continue;
        const tr = node('tr');
        const th = node('th', null, c.label);
        th.setAttribute('scope', 'row');
        tr.append(th, node('td', 'num', hrs(split[c.key])), node('td', 'num', `${round(split[c.key] / 52, 1)} h a week`));
        tbody.appendChild(tr);
    }
    if (split.unassigned > 0.5) {
        const tr = node('tr');
        const th = node('th', null, 'Not assigned');
        th.setAttribute('scope', 'row');
        tr.append(th, node('td', 'num', hrs(split.unassigned)), node('td', 'num', ''));
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    const scroll = node('div', 'table-scroll');
    scroll.appendChild(table);
    box.appendChild(scroll);
    if (split.familyValue > 0) {
        box.appendChild(node('p', 'helper-text', `At your own rate, the family time is worth ${money(split.familyValue, cur)} a year to you. This is not in any total.`));
    }
}

function renderSubtotals(state, r, cur) {
    // The shared sections apply to both jobs; with two, show each job's figure.
    const jobs = r.comparison ? [r.comparison.a.policy, r.comparison.b.policy] : [r.single.policy];
    const fmt = (key, p) => (key === 'time' ? (timeOn(state) ? money(p.time, cur) : hrs(p.hours)) : money(p[key], cur));
    const set = (key) => document.querySelectorAll(`[data-subtotal="${key}"]`).forEach((e) => {
        e.textContent = jobs.length > 1 ? `A ${fmt(key, jobs[0])} · B ${fmt(key, jobs[1])}` : `${fmt(key, jobs[0])} / yr`;
    });
    ['time', 'care', 'home', 'fixed'].forEach(set);
    document.querySelectorAll('[data-job]').forEach((n) => {
        const ev = r.comparison ? (n.dataset.job === '1' ? r.comparison.b : r.comparison.a) : r.single;
        const s = n.querySelector('[data-subtotal="commute"]');
        if (s) s.textContent = `${money(ev.policy.commute, cur)} / yr travel`;
    });
}

function renderTimeHint(state, r, cur) {
    const pay = r.single.pay;
    const mode = state.person.timeValueMode;
    const rates = { net: pay.hourlyNet, dot: pay.hourly / 2, gross: pay.hourly };
    const hint = $('timeValueHint');
    if (rates[mode] !== undefined) hint.textContent = pay.hourly > 0 ? `That is ${money(rates[mode], cur, 2)} an hour${state.compare ? ' for the first job' : ''}.` : 'Enter pay to see the rate.';
    else if (mode === 'custom') hint.textContent = 'Your own rate, the same for both jobs.';
    else hint.textContent = 'Hours are reported; no dollars are put on them.';
}

function renderContext(ctx) {
    const list = $('contextList');
    if (list.childElementCount) return;
    const items = [
        'Career effects: promotion, pay growth and being seen. Not modeled; no single figure applies to one person.',
        'Productivity, health, isolation and mentoring, which matter and have no agreed price.',
        ctx.valuation,
        ctx.grooming,
        'Moving farther out for cheaper housing, which changes every other number here.',
        ctx.tax,
        ctx.benefit,
    ];
    for (const t of items) list.appendChild(node('li', null, t));
}

// Maps an engine field path (person.x or jobs.N.x) to its input.
function fieldFor(path) {
    if (!path) return null;
    const m = /^jobs\.(\d+)\.(.+)$/.exec(path);
    if (m) return document.querySelector(`[data-job="${m[1]}"] [data-bind="${m[2]}"]`);
    return document.querySelector(`[data-bind="${path}"]`);
}

export function renderResults(state, r, { CONTEXT }) {
    const cur = state.currency || '$';
    renderContext(CONTEXT);
    // Live regions are rewritten only when their text changes, or a screen
    // reader would announce the same warning on every keystroke.
    const errorText = (r.errors || []).map((e) => e.text);
    const warnText = (r.warnings || []).map((w) => w.text);
    const errors = $('errors');
    if (errors.dataset.text !== errorText.join('|')) {
        errors.dataset.text = errorText.join('|');
        errors.textContent = '';
        for (const t of errorText) errors.appendChild(node('p', 'error', t));
    }
    const warnings = $('warnings');
    if (warnings.dataset.text !== warnText.join('|')) {
        warnings.dataset.text = warnText.join('|');
        warnings.textContent = '';
        for (const t of warnText) warnings.appendChild(node('li', null, t));
    }
    document.querySelectorAll('[aria-invalid="true"]').forEach((e) => e.removeAttribute('aria-invalid'));
    for (const e of r.errors || []) {
        const field = fieldFor(e.field);
        if (field) field.setAttribute('aria-invalid', 'true');
    }
    if (!r.ok) {
        $('resultsBody').hidden = true;
        return null;
    }
    $('resultsBody').hidden = false;
    // The tiles describe one job; with two, the comparison table replaces them.
    $('tiles').hidden = Boolean(r.comparison);
    $('resultsSubtitle').textContent = r.comparison ? 'Yearly, each job at the office days it asks for.' : 'Yearly, at the office days your job asks for.';
    renderTiles(state, r, cur);
    renderComparison(state, r, cur);
    const svg = renderChart(state, r, cur);
    renderTable(state, r, cur);
    renderHours(state, r, cur);
    renderSubtotals(state, r, cur);
    renderTimeHint(state, r, cur);
    return svg;
}
