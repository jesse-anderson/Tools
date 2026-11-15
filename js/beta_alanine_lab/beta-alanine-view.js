// Rendering for everything but the chart. Text goes in through textContent and
// links through the source table, never through innerHTML.

import { SOURCES, CLAIMS, WASHOUT_RATES, LOADING_OBSERVATIONS, WET_TO_DRY } from './beta-alanine-data.js';
import {
    fitSlope, kdFromHalfLife, unitRise, tinglingBand, lowerTinglingSplit, BETA_ALANINE_G_PER_MOL,
    FITTED_DOSE_MIN, FITTED_DOSE_MAX, TINGLING_LIKELY_MG_PER_KG, MAX_SERVINGS
} from './beta-alanine-engine.js';
import { loadingPapers, NAME_SHARE_MIN, EDGE_WINDOW, DEFAULT_DRAWS } from './beta-alanine-monte-carlo.js';

export function h(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v === true ? '' : String(v));
    }
    for (const c of [].concat(children)) {
        if (c === null || c === undefined || c === false) continue;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
}

export function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
    return node;
}

/** "Baguet et al. 2009" from the manifest label. */
export function shortName(sourceId) {
    const s = SOURCES[sourceId];
    return s ? s.label.split(',')[0] : sourceId;
}

export function sourceLink(sourceId) {
    const s = SOURCES[sourceId];
    if (!s || !s.url) return h('span', { text: shortName(sourceId) });
    return h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: shortName(sourceId) });
}

/** "A, B and C" with each one a link. */
export function linkList(sourceIds) {
    const parts = [];
    sourceIds.forEach((id, i) => {
        if (i > 0) parts.push(i === sourceIds.length - 1 ? ' and ' : ', ');
        parts.push(sourceLink(id));
    });
    return parts;
}

export const fmt = (v, digits = 1) => (Number.isFinite(v) ? v.toFixed(digits) : 'n/a');
const TIER_NAMES = { 'budget powder': 'Budget powder', 'carnosyn powder': 'CarnoSyn powder', 'sustained-release tablets': 'Sustained-release tablets (CarnoSyn SR)' };
const money = (v) => (v < 10 ? `$${v.toFixed(2)}` : `$${v.toFixed(0)}`);

/** Shares as "Baguet et al. 2009 (53%), ..." with links; small shares left out. */
function sharePhrase(shares) {
    const named = shares.filter((s) => s.share >= NAME_SHARE_MIN);
    const out = [];
    named.forEach((s, i) => {
        if (i > 0) out.push(', ');
        out.push(sourceLink(s.sourceId), ` ${Math.round(s.share * 100)}%`);
    });
    if (!named.length) out.push('no single paper (each under 20%)');
    return out;
}

/** Tooltip body for one day. */
export function renderTip(node, { day, value, low, high, evidence, unit, individual }) {
    clear(node);
    node.appendChild(h('p', {}, [h('strong', { text: `Week ${fmt(day / 7, 1)} (day ${day})` }),
        `: middle ${fmt(value.p50)} ${unit}, 10th to 90th percentile ${fmt(value.p10)} to ${fmt(value.p90)}.`]));
    for (const [label, edge] of [['Low edge', low], ['High edge', high]]) {
        const parts = [h('strong', { text: `${label}: ` }), 'washout from ', ...sharePhrase(edge.washout), '; loading from ', ...sharePhrase(edge.loading), '.'];
        if (individual && edge.medianResponseFactor !== null) {
            parts.push(` Person-to-person factor in these draws about ${fmt(edge.medianResponseFactor, 2)} (`, sourceLink('rezende2020'), ').');
        }
        node.appendChild(h('p', {}, parts));
    }
    if (evidence.covered) {
        node.appendChild(h('p', {}, [h('strong', { text: 'Measured this far: ' }), ...linkList(evidence.sourceIds), '.']));
    } else {
        const what = evidence.phase === 'loading' ? 'No study at a comparable dose ran this long' : 'No washout study followed people this long';
        node.appendChild(h('p', {}, [h('strong', { text: `${what}. ` }), 'This stretch rests on ', ...linkList(evidence.sourceIds), ', the longest one.']));
    }
}

export function renderFlags(node, flags) {
    clear(node);
    for (const f of flags) {
        const cite = f.sourceIds && f.sourceIds.length ? [' (', ...linkList(f.sourceIds), ')'] : [];
        node.appendChild(h('p', { class: 'flag' }, [f.text, ...cite]));
    }
}

function card(title, value, range, sub) {
    return h('div', { class: 'card' }, [h('h3', { text: title }), h('p', { class: 'value', text: value }),
        range ? h('p', { class: 'range', text: range }) : null, sub ? h('p', { class: 'sub' }, [].concat(sub)) : null]);
}

// What the one maintenance study measured, shown beside or instead of the model.
function measuredMaintenance(bodyMassKg) {
    const pct = (id) => `${Math.round(CLAIMS[id].value * 100)}%`;
    const perKg = CLAIMS.maintenance_mg_per_kg.value;
    const atYou = bodyMassKg > 0 ? ` (${fmt((perKg * bodyMassKg) / 1000, 2)} g/day at your body mass)` : '';
    return `Measured after 46 days at 3.2 g/day: six weeks at 1.2 g/day kept ${pct('maintenance_keep_12')} of the gain, 0.8 g/day ${pct('maintenance_keep_08')} and 0.4 g/day ${pct('maintenance_keep_04')}; the authors suggest about ${perKg} mg/kg a day${atYou}.`;
}

// The model figure only inside the fitted doses; outside them it says it has none.
function maintenanceCard(m, bodyMassKg) {
    const title = 'Daily dose to hold that level';
    const cite = [' (', sourceLink('stegen2014'), ')'];
    if (m.p50 < FITTED_DOSE_MIN || m.p50 > FITTED_DOSE_MAX) {
        const side = m.p50 < FITTED_DOSE_MIN ? `below ${FITTED_DOSE_MIN}` : `above ${FITTED_DOSE_MAX}`;
        return h('div', { class: 'card card-refused' }, [h('h3', { text: title }), h('p', { class: 'value', text: 'No estimate' }),
            h('p', { class: 'range', text: `The model's figure is ${side} g/day, outside the doses it was fitted to (${FITTED_DOSE_MIN} to ${FITTED_DOSE_MAX}), so it is not shown.` }),
            h('p', { class: 'sub' }, [measuredMaintenance(bodyMassKg), ...cite])]);
    }
    const edge = m.p10 < FITTED_DOSE_MIN ? ` Its lower edge is below the lowest dose fitted, ${FITTED_DOSE_MIN} g/day.` : '';
    return card(title, `${fmt(m.p50, 1)} g/day`, `10th to 90th: ${fmt(m.p10, 1)} to ${fmt(m.p90, 1)} g/day`,
        [`On the model this depends on the washout rate alone, not on how strongly you respond, so the band comes from the washout studies.${edge} The model holds low doses less well than the one study of them found. ${measuredMaintenance(bodyMassKg)}`, ...cite]);
}

export function renderCards(node, { summary, baseline, totalGrams, target, washoutDays, muscle, stopWeeks, bodyMassKg }) {
    clear(node);
    const r = summary.riseAtStop;
    node.appendChild(card(`Rise at the end of dosing (week ${fmt(stopWeeks, 1)})`, `${fmt(r.p50)} mmol/kg dm`,
        `10th to 90th: ${fmt(r.p10)} to ${fmt(r.p90)}; ${fmt((r.p50 / baseline) * 100, 0)}% of baseline (${fmt((r.p10 / baseline) * 100, 0)} to ${fmt((r.p90 / baseline) * 100, 0)}%)`));
    node.appendChild(card('Beta-alanine taken', `${fmt(totalGrams, 1)} g`, null,
        'The common reference protocol is 179.2 g (6.4 g/day for 4 weeks).'));
    const m = summary.maintenanceAtStop;
    if (m && r.p50 > 0) node.appendChild(maintenanceCard(m, bodyMassKg));
    if (target > 0) {
        const t = summary.daysToTarget;
        const share = summary.targetReachedShare;
        node.appendChild(card(`Days to a rise of ${fmt(target, 1)}`, t ? `${fmt(t.p50, 0)} days` : 'Not reached',
            t ? `10th to 90th: ${fmt(t.p10, 0)} to ${fmt(t.p90, 0)} days, among the ${fmt(share * 100, 0)}% of draws that reach it while dosing` : 'No draw reaches it while dosing.'));
    }
    const n = summary.daysToNormal;
    node.appendChild(card('Back within normal variation after stopping', n ? `${fmt(n.p50 / 7, 1)} weeks` : 'Not within the washout shown',
        n ? `10th to 90th: ${fmt(n.p10 / 7, 1)} to ${fmt(n.p90 / 7, 1)} weeks; ${fmt(summary.normalReachedShare * 100, 0)}% of draws get there within the ${fmt(washoutDays / 7, 0)} weeks shown` : null,
        ['Normal month-to-month variation is 4.1 mmol/kg dm (', sourceLink('rezende2020'), ').']));
    if (summary.gramsGainAtStop && muscle) {
        const g = summary.gramsGainAtStop;
        const base = (baseline * (muscle.centerKg / WET_TO_DRY) * 226.23) / 1000;
        const incorporated = totalGrams > 0 ? ((r.p50 * (muscle.centerKg / WET_TO_DRY)) / ((totalGrams / BETA_ALANINE_G_PER_MOL) * 1000)) * 100 : NaN;
        node.appendChild(card('Carnosine in muscle, estimated', `+${fmt(g.p50, 1)} g`,
            `10th to 90th: ${fmt(g.p10, 1)} to ${fmt(g.p90, 1)} g, on about ${fmt(base, 0)} g at baseline in ${fmt(muscle.centerKg, 1)} kg of skeletal muscle`,
            [`About ${fmt(incorporated, 1)}% of the beta-alanine taken ends up in carnosine on the middle line; studies report about 3% (`, sourceLink('stegen2013'), ') and 4.4% (', sourceLink('yamaguchi2021'), ').']));
    }
}

/** The dose-for-a-goal card: a figure only when its middle is inside the fitted doses. */
export function renderGoal(node, { rise, weeks, result, horizon, observations }) {
    clear(node);
    if (!result) {
        node.appendChild(card('Daily dose for a goal', 'No goal set', 'Enter a rise above 0.', null));
        return;
    }
    const title = `Daily dose for a rise of ${fmt(rise, 1)} by week ${weeks}`;
    if (result.p50 < FITTED_DOSE_MIN || result.p50 > FITTED_DOSE_MAX) {
        const above = result.p50 > FITTED_DOSE_MAX;
        node.appendChild(h('div', { class: 'card card-refused' }, [h('h3', { text: title }), h('p', { class: 'value', text: 'No estimate' }),
            h('p', { class: 'range', text: `It would take ${above ? 'more' : 'less'} than ${above ? FITTED_DOSE_MAX : FITTED_DOSE_MIN} g/day, outside the doses the model was fitted to (${FITTED_DOSE_MIN} to ${FITTED_DOSE_MAX}), so no figure is given.` }),
            h('p', { class: 'sub', text: above ? 'A later week or a smaller rise brings the dose into range.' : 'An earlier week or a larger rise brings the dose into range.' })]));
        return;
    }
    const notes = ['The rise is proportional to the dose on the model, so at the higher figure 9 in 10 draws reach the goal and at the lower 1 in 10.'];
    if (result.p90 > FITTED_DOSE_MAX) notes.push(` The higher figure is above the doses fitted, ${FITTED_DOSE_MAX} g/day.`);
    if (result.p10 < FITTED_DOSE_MIN) notes.push(` The lower figure is below the doses fitted, ${FITTED_DOSE_MIN} g/day.`);
    if (horizon && horizon.loadingCoveredUntil < horizon.supplementDays) {
        const longest = horizon.loadingStudies[0];
        notes.push(...(longest
            ? [` No study at a comparable dose ran ${weeks} weeks; the longest ran ${fmt(longest.days / 7, 0)} weeks (`, sourceLink(longest.sourceId), ').']
            : [' No study used a comparable dose.']));
    }
    // The one long study measured less than the model's middle line from week 8 on.
    const long = observations.filter((o) => o.sourceId === 'saunders2017' && o.day <= weeks * 7).sort((x, y) => y.day - x.day)[0];
    if (weeks >= 8 && long) {
        notes.push(` Over long runs the model rises faster than the one 24-week study measured: at 6.4 g/day its middle line gives +${fmt((FITTED_DOSE_MAX * rise) / result.p50, 1)} by week ${weeks}, where Saunders measured +${fmt(long.rise, 1)} by week ${fmt(long.day / 7, 0)} (`,
            sourceLink('saunders2017'), '). A long goal may need more than this.');
    }
    node.appendChild(card(title, `${fmt(result.p50, 1)} g/day`, `10th to 90th: ${fmt(result.p10, 1)} to ${fmt(result.p90, 1)} g/day`, notes));
}

export function renderEdgeTable(table, rows, unit) {
    clear(table);
    table.appendChild(h('caption', { class: 'visually-hidden', text: 'Band and the papers behind each edge at key days' }));
    table.appendChild(h('thead', {}, h('tr', {}, ['Point', `10th (${unit})`, 'Low edge papers', 'Middle', `90th (${unit})`, 'High edge papers', 'Measured that far by']
        .map((t) => h('th', { scope: 'col', text: t })))));
    const body = h('tbody');
    for (const r of rows) {
        body.appendChild(h('tr', {}, [
            h('th', { scope: 'row', text: `${r.label} (week ${fmt(r.day / 7, 1)})` }),
            h('td', { class: 'num', text: fmt(r.value.p10) }),
            h('td', {}, [...edgeCell(r.low)]),
            h('td', { class: 'num', text: fmt(r.value.p50) }),
            h('td', { class: 'num', text: fmt(r.value.p90) }),
            h('td', {}, [...edgeCell(r.high)]),
            h('td', {}, r.evidence.covered ? linkList(r.evidence.sourceIds) : ['Beyond the studies; rests on ', ...linkList(r.evidence.sourceIds)])
        ]));
    }
    table.appendChild(body);
}

function edgeCell(edge) {
    return ['Washout: ', ...sharePhrase(edge.washout), '. Loading: ', ...sharePhrase(edge.loading), '.'];
}

export function renderServings(table, phases, bodyMassKg) {
    clear(table);
    table.appendChild(h('caption', { class: 'visually-hidden', text: 'Servings and tingling by phase' }));
    table.appendChild(h('thead', {}, h('tr', {}, ['Phase', 'g/day', 'Servings', 'g per serving', 'mg/kg per serving', 'Form', 'Tingling', 'Why']
        .map((t) => h('th', { scope: 'col', text: t })))));
    const body = h('tbody');
    phases.forEach((p, i) => {
        const per = p.servings > 0 ? p.doseGPerDay / p.servings : 0;
        const band = tinglingBand({ gramsPerServing: per, bodyMassKg, form: p.form });
        body.appendChild(h('tr', {}, [
            h('th', { scope: 'row', text: `Phase ${i + 1}` }),
            h('td', { class: 'num', text: fmt(p.doseGPerDay, 2) }),
            h('td', { class: 'num', text: String(p.servings) }),
            h('td', { class: 'num', text: fmt(per, 2) }),
            h('td', { class: 'num', text: fmt(band.mgPerKg, 1) }),
            h('td', { text: p.form === 'sustained' ? 'Sustained release' : 'Plain' }),
            h('td', {}, h('span', { class: `band-tag ${band.level}`, text: band.label })),
            h('td', {}, [band.reason ? h('p', {}, [band.reason, ' (', ...linkList(band.sourceIds), ')']) : null, splitHint(p, bodyMassKg)])
        ]));
    });
    table.appendChild(body);
}

// What would bring a plain phase under the likely band, within the servings field's limit.
function splitHint(phase, bodyMassKg) {
    const s = lowerTinglingSplit({ ...phase, bodyMassKg });
    if (!s) return null;
    const parts = [];
    if (s.servings <= MAX_SERVINGS) parts.push(`${s.servings} plain servings of ${fmt(s.gramsPerServing, 2)} g (${fmt(s.mgPerKg, 1)} mg/kg each, under ${TINGLING_LIKELY_MG_PER_KG})`);
    if (s.srServings <= MAX_SERVINGS) parts.push(`${s.srServings} sustained-release servings of ${fmt(phase.doseGPerDay / s.srServings, 2)} g, the size that matched placebo`);
    if (!parts.length) return null;
    return h('p', { class: 'split-hint' }, [`For less tingling at the same daily dose: ${parts.join(', or ')} (`,
        ...linkList(s.srServings <= MAX_SERVINGS ? ['harris2006', 'decombaz2012'] : ['harris2006']), ').']);
}

export function renderSafety(node) {
    clear(node);
    const c = CLAIMS.issn_safety;
    node.append('The ISSN position stand: supplementation "currently appears to be safe in healthy populations at recommended doses"; the only reported side effect is paresthesia (tingling). It also suggests servings of 1.6 g or less, or sustained release, to reduce it (',
        sourceLink(c.sourceId), '). This tool makes no other safety claim.');
}

export function renderCosts(node, { tiers, own, phases, totalGrams, riseAtStop }) {
    clear(node);
    const rows = Object.entries(tiers).map(([name, range]) => ({ name, low: range.low, high: range.high }));
    if (own) rows.unshift({ name: 'Your price', low: own, high: own, own: true });
    for (const r of rows) {
        const weekly = phases.map((p, i) => {
            const lo = p.doseGPerDay * 7 * r.low;
            const hi = p.doseGPerDay * 7 * r.high;
            return `phase ${i + 1} ${money(lo)}${r.own ? '' : ` to ${money(hi)}`} a week`;
        }).join('; ');
        const totalLo = totalGrams * r.low;
        const totalHi = totalGrams * r.high;
        const perRise = riseAtStop > 0 ? [totalLo / riseAtStop, totalHi / riseAtStop] : null;
        node.appendChild(card(TIER_NAMES[r.name] || r.name,
            r.own ? `${money(totalLo)} total` : `${money(totalLo)} to ${money(totalHi)}`,
            `${r.own ? `$${r.low.toFixed(3)}` : `$${r.low.toFixed(3)} to $${r.high.toFixed(3)}`} per gram; ${weekly}`,
            perRise ? `${r.own ? money(perRise[0]) : `${money(perRise[0])} to ${money(perRise[1])}`} per mmol/kg dm of rise at the end of dosing, on the middle line.` : null));
    }
}

/** Live checks behind the curve, recomputed from the data module. */
export function computeChecks() {
    const papers = loadingPapers(LOADING_OBSERVATIONS);
    const stell = papers.find((p) => p.sourceId === 'stellingwerff2012');
    const linPoints = [[1.6, 14], [1.6, 28], [1.6, 56], [3.2, 14], [3.2, 28]];
    const linear = WASHOUT_RATES.map((w) => {
        const kd = kdFromHalfLife(w.central);
        const s = fitSlope(stell.points, kd);
        let sxy = 0;
        let sxx = 0;
        for (const [dose, day] of linPoints) {
            const xg = dose * day;
            const span = dose === 1.6 ? 56 : 28;
            sxy += xg * s * unitRise([[0, span, dose]], day, kd);
            sxx += xg * xg;
        }
        return { washout: w.sourceId, per100: (sxy / sxx) * 100 };
    });
    const emax = WASHOUT_RATES.map((w) => ({ washout: w.sourceId, grams: 6.4 * w.central, low: 6.4 * w.low, high: 6.4 * w.high }));
    const observations = LOADING_OBSERVATIONS.filter((o) => o.role === 'check').map((o) => {
        const preds = [];
        for (const p of papers) for (const w of WASHOUT_RATES) {
            const kd = kdFromHalfLife(w.central);
            preds.push(fitSlope(p.points, kd) * unitRise(o.schedule, o.day, kd));
        }
        return { ...o, min: Math.min(...preds), max: Math.max(...preds) };
    });
    const fits = papers.map((p) => ({
        sourceId: p.sourceId,
        points: p.points.length,
        slopes: WASHOUT_RATES.map((w) => fitSlope(p.points, kdFromHalfLife(w.central)))
    }));
    return { linear, linearTarget: [1.83 * WET_TO_DRY, 2.01 * WET_TO_DRY, 2.19 * WET_TO_DRY], emax, observations, fits };
}

export function renderAudit(node) {
    clear(node);
    const checks = computeChecks();
    const claim = (id) => CLAIMS[id];
    const cite = (id) => [' (', sourceLink(claim(id).sourceId), `, ${claim(id).location})`];
    const section = (title, children) => { node.appendChild(h('h3', { text: title })); for (const c of children) node.appendChild(c); };

    section('Model', [
        h('p', {}, [claim('model_form').claim, ...cite('model_form'), '. The tool solves it exactly between dose changes, on the rise above baseline.']),
        h('p', {}, ['The authors fitted one decay rate by assumption (half-life 52 days); this tool replaces it with four washout studies. ', claim('kf_reference').claim, ...cite('kf_reference'), '.']),
        h('p', {}, ['Biopsy studies (HPLC) are fitted in mmol/kg dry muscle as reported. Stellingwerff 2012 measured by MRS in wet weight, converted at x4.3 (Bergstrom 1962, as used by ', sourceLink('spelnikov2019'), '). The same factor turns dry into wet muscle for the grams estimate.'])
    ]);

    const fitTable = h('table', { class: 'data-table' });
    fitTable.appendChild(h('thead', {}, h('tr', {}, [h('th', { scope: 'col', text: 'Loading study' }), h('th', { scope: 'col', text: 'Points' }),
        ...WASHOUT_RATES.map((w) => h('th', { scope: 'col', class: 'num' }, ['Slope at ', sourceLink(w.sourceId), ` (${fmt(w.central, 1)} d)`]))])));
    const fb = h('tbody');
    for (const f of checks.fits) {
        fb.appendChild(h('tr', {}, [h('th', { scope: 'row' }, sourceLink(f.sourceId)), h('td', { class: 'num', text: String(f.points) }),
            ...f.slopes.map((s) => h('td', { class: 'num', text: s.toFixed(4) }))]));
    }
    fitTable.appendChild(fb);
    section('Per-paper fits', [
        h('p', { text: 'Synthesis slope in mmol/kg dm per day per g/day, refitted by least squares for each half-life a draw samples. Shown here at each washout study\'s central half-life. Long 6.4 g/day courses sit low and short or low-dose ones high; that spread is real disagreement between studies, and it is what the band shows.' }),
        h('div', { class: 'table-scroll' }, fitTable)
    ]);

    const wl = h('ul');
    for (const w of WASHOUT_RATES) {
        wl.appendChild(h('li', {}, [sourceLink(w.sourceId), `: half-life ${fmt(w.central, 1)} days (${fmt(w.low, 1)} to ${fmt(w.high, 1)}, sampled ${w.sampling}). ${w.basis}.`,
            w.observedDays ? ` Followed for ${fmt(w.observedDays / 7, 0)} weeks.` : ' Follow-up length not available.', w.note ? ` ${w.note}.` : '']));
    }
    section('Washout', [wl]);

    const [lo, mid, hi] = checks.linearTarget;
    const linItems = h('ul');
    for (const l of checks.linear) {
        linItems.appendChild(h('li', {}, [`With `, sourceLink(l.washout), `'s half-life: ${fmt(l.per100, 2)} mmol/kg dm per 100 g (${l.per100 >= lo && l.per100 <= hi ? 'inside' : 'outside'}).`]));
    }
    const eItems = h('ul');
    for (const e of checks.emax) {
        eItems.appendChild(h('li', {}, [sourceLink(e.washout), `: ${fmt(e.grams, 0)} g (its own range ${fmt(e.low, 0)} to ${fmt(e.high, 0)} g).`]));
    }
    const oItems = h('ul');
    for (const o of checks.observations) {
        oItems.appendChild(h('li', {}, [sourceLink(o.sourceId), `, ${o.arm}, day ${o.day}: measured ${fmt(o.rise, 1)}; the per-paper fits give ${fmt(o.min, 1)} to ${fmt(o.max, 1)}. ${o.note}`]));
    }
    section('Checks behind the curve', [
        h('p', {}, ['Linear in total dose: ', sourceLink('stellingwerff2012'), ` found the rise depended only on total grams within 1.6 to 3.2 g/day, 2.01 mmol/kg wet weight per 100 g (95% CI 1.83 to 2.19), which is ${fmt(mid, 2)} (${fmt(lo, 2)} to ${fmt(hi, 2)}) in dry muscle. Their own fit, regressed over their arms and weeks the same way:`]),
        linItems,
        h('p', {}, ['Saturating: ', sourceLink('rezende2020'), ' fitted an Emax model whose cumulative dose for half the maximum effect was 377 g (50% interval 210 to 494 g). In this model that dose at 6.4 g/day is 6.4 g times the half-life:']),
        eItems,
        h('p', { text: 'Yamaguchi\'s central value falls just below 210 g, but its own range spans the interval, so the band overlaps it. Rezende\'s Emax is in standardized units and is never converted to mmol/kg; this is a check of shape only.' }),
        h('p', { text: 'Measured points held out of the fits:' }),
        oItems
    ]);

    section('The band', [
        h('p', { text: `About ${DEFAULT_DRAWS} seeded draws (xorshift32, the generator shared with the Creatine Lab), spread evenly over the ${WASHOUT_RATES.length * loadingPapers(LOADING_OBSERVATIONS).length} pairings of a washout study with a loading study, so every pairing has equal weight, not weight by participants. Each draw samples that washout study's half-life and refits the loading study's slope at it. The chart shows the median and the 10th to 90th percentile of the draws on each day. An edge is the draws within ${EDGE_WINDOW * 100}% of all draws either side of its percentile; a paper under ${NAME_SHARE_MIN * 100}% of an edge is not named.` }),
        h('p', {}, ['Person-to-person variation, when switched on, multiplies each draw by a factor with mean 1 and a coefficient of variation of 0.47, from the response SD of 6.6 around a 4-week mean rise of 14.0 mmol/kg dm (', sourceLink('rezende2020'), '). The lognormal shape is an engineering assumption. It stretches a 4-week spread over the whole timeline and may count some cohort differences twice, which is why it is off by default. Because the factor\'s mean is 1, its median is about 0.9, so the middle line drops slightly when it is on.']),
        h('p', { text: 'Leave-one-paper-out test, from Phase 0: with each loading study held out in turn, 10 of its 17 points fell inside the band built from the rest, against about 14 expected. Nearly every miss was Saunders 2017: without it, the shorter studies predict a long-run rise about 50% above what Saunders measured. Long courses level off faster than the washout half-lives imply, and Saunders is the only study past 10 weeks. That is why the band is shaded past the longest comparable study rather than given another fitted parameter.' }),
        h('p', {}, ['Saunders also reported the maximum: ', claim('saunders_max').claim, ...cite('saunders_max'), '.'])
    ]);

    const claimIds = ['baseline_default', 'baseline_no_effect', 'women_vl', 'women_calf', 'vegetarian', 'age', 'placebo_variation', 'response_sd',
        'form_equivalent', 'meal_effect', 'incorporation', 'incorporation_yamaguchi', 'retention', 'tingle_40', 'tingle_20', 'tingle_10', 'tingle_800mg',
        'tingle_broth', 'plasma_peak', 'tingle_sr', 'tingle_800_common', 'tingle_12g_sr', 'issn_dose', 'issn_split', 'issn_safety', 'maintenance',
        'sex_absolute', 'kf_high_dose_sublinear', 'washout_baguet_split'];
    const cl = h('ul');
    for (const id of claimIds) {
        const c = claim(id);
        if (c) cl.appendChild(h('li', {}, [c.claim, ...cite(id), `. Used for: ${c.use}.`]));
    }
    section('Every other figure on the page', [cl,
        h('p', { text: 'Meals: one MRS study in one muscle found a larger rise with meals, and most fitted studies dosed with meals, so meals are a sentence rather than a setting. Form: chronic sustained release and plain were equally effective, so form changes only the tingling check.' }),
        h('p', { text: 'No older-adults baseline: Everaert 2011 reports a negative correlation with age but no figure for healthy adults. Use the baseline field for a value of your own.' })
    ]);
}

export function renderSources(node) {
    clear(node);
    for (const [id, s] of Object.entries(SOURCES)) {
        node.appendChild(h('li', {}, [s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.label }) : s.label,
            s.archived ? '' : ' (not archived; figures quoted by two archived papers)', ` [${id}]`]));
    }
}
