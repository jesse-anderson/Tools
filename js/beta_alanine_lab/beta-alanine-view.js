// Rendering for everything but the chart. Text goes in through textContent and
// links through the source table, never through innerHTML.

import { SOURCES, CLAIMS, WASHOUT_RATES, LOADING_OBSERVATIONS, WET_TO_DRY, SOLUBILITY } from './beta-alanine-data.js';
import {
    fitSlope, kdFromHalfLife, unitRise, tinglingBand, lowerTinglingSplit, BETA_ALANINE_G_PER_MOL,
    FITTED_DOSE_MIN, FITTED_DOSE_MAX, TINGLING_LIKELY_MG_PER_KG, MAX_SERVINGS,
    CARNOSINE_G_PER_MOL, steadyTurnover, maintenanceDose, waterForGrams, percentileSorted, sampledHalfLifeRange, carnosineGrams
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
    if (evidence.phase === 'none') {
        node.appendChild(h('p', {}, [h('strong', { text: 'Nothing taken yet.' })]));
    } else if (evidence.covered) {
        node.appendChild(h('p', {}, [h('strong', { text: 'Measured this far: ' }), ...linkList(evidence.sourceIds), '.']));
    } else if (!evidence.sourceIds.length) {
        node.appendChild(h('p', {}, [h('strong', { text: 'No study measured a comparable dose at this point in a protocol.' })]));
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

// Blancquaert 2018: low doses in vegetarian women, the second low-dose study.
function vegetarianLowDose() {
    return [` In vegetarian women, 0.8 g/day raised carnosine ${Math.round(CLAIMS.low_dose_08.value * 100)}% in 3 months, and 0.4 g/day then kept it above baseline (`,
        sourceLink('blancquaert2018'), ').'];
}

// The model figure only inside the fitted doses; outside them it says it has none.
function maintenanceCard(m, bodyMassKg) {
    const title = 'Daily dose to hold that level';
    const cite = [' (', sourceLink('stegen2014'), ')'];
    if (m.p50 < FITTED_DOSE_MIN || m.p50 > FITTED_DOSE_MAX) {
        const side = m.p50 < FITTED_DOSE_MIN ? `below ${FITTED_DOSE_MIN}` : `above ${FITTED_DOSE_MAX}`;
        return h('div', { class: 'card card-refused' }, [h('h3', { text: title }), h('p', { class: 'value', text: 'No estimate' }),
            h('p', { class: 'range', text: `The model's figure is ${side} g/day, outside the doses it was fitted to (${FITTED_DOSE_MIN} to ${FITTED_DOSE_MAX}), so it is not shown.` }),
            h('p', { class: 'sub' }, [measuredMaintenance(bodyMassKg), ...cite, ...vegetarianLowDose()])]);
    }
    const edge = m.p10 < FITTED_DOSE_MIN ? ` Its lower edge is below the lowest dose fitted, ${FITTED_DOSE_MIN} g/day.` : '';
    return card(title, `${fmt(m.p50, 1)} g/day`, `10th to 90th: ${fmt(m.p10, 1)} to ${fmt(m.p90, 1)} g/day`,
        [`On the model this depends on the washout rate alone, not on how strongly you respond, so the band comes from the washout studies.${edge} The model holds low doses less well than the two studies of them found. ${measuredMaintenance(bodyMassKg)}`, ...cite, ...vegetarianLowDose()]);
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
        const share = summary.targetReachedShare;
        const [value, range] = reachText(summary.daysToTarget, (d) => fmt(d, 0), 'days', 'not reached while dosing',
            `${fmt(share * 100, 0)}% of draws reach it while dosing`, share);
        node.appendChild(card(`Days to a rise of ${fmt(target, 1)}`, value, range));
    }
    const nShare = summary.normalReachedShare;
    const [nValue, nRange] = reachText(summary.daysToNormal, (d) => fmt(d / 7, 1), 'weeks', `not within the ${fmt(washoutDays / 7, 0)} weeks shown`,
        `${fmt(nShare * 100, 0)}% of draws get there within the ${fmt(washoutDays / 7, 0)} weeks shown`, nShare);
    node.appendChild(card('Back within normal variation after stopping', nValue, nRange,
        ['Normal month-to-month variation is 4.1 mmol/kg dm (', sourceLink('rezende2020'), ').']));
    if (summary.gramsGainAtStop && muscle) {
        const g = summary.gramsGainAtStop;
        const base = carnosineGrams(baseline, muscle.centerKg, WET_TO_DRY);
        const incorporated = incorporatedPercent(r.p50, muscle.centerKg, totalGrams);
        node.appendChild(card('Carnosine in muscle, estimated', `+${fmt(g.p50, 1)} g`,
            `10th to 90th: ${fmt(g.p10, 1)} to ${fmt(g.p90, 1)} g, on about ${fmt(base, 0)} g at baseline in ${fmt(muscle.centerKg, 1)} kg of skeletal muscle`,
            [`About ${fmt(incorporated, 1)}% of the beta-alanine taken ends up in carnosine on the middle line; studies report about 3% (`, sourceLink('stegen2013'), ') and 4.4% (', sourceLink('yamaguchi2021'), ').']));
    }
}

/**
 * Headline and range line for a time-to-reach card. A null percentile fell
 * among the draws that never get there, so it is named as not reached.
 */
export function reachText(r, num, unit, missed, shareText, share) {
    const miss = missed.charAt(0).toUpperCase() + missed.slice(1);
    const u = (v) => `${num(v)} ${unit}`;
    if (!r || r.p10 === null) return [miss, share > 0 ? `Fewer than 1 in 10 draws get there; ${shareText}.` : 'No draw gets there.'];
    const tail = share < 1 ? `; ${shareText}` : '';
    if (r.p50 === null) return [miss, `10th: ${u(r.p10)}; middle and 90th: ${missed}${tail}`];
    if (r.p90 === null) return [u(r.p50), `10th: ${u(r.p10)}; 90th: ${missed}${tail}`];
    return [u(r.p50), `10th to 90th: ${num(r.p10)} to ${u(r.p90)}${tail}`];
}

/** Percent of the beta-alanine taken that a rise holds as carnosine, one beta-alanine per carnosine. */
export function incorporatedPercent(rise, muscleKg, totalGrams) {
    if (!(totalGrams > 0)) return NaN;
    return ((rise * (muscleKg / WET_TO_DRY)) / ((totalGrams / BETA_ALANINE_G_PER_MOL) * 1000)) * 100;
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
            h('td', {}, evidenceCell(r.evidence))
        ]));
    }
    table.appendChild(body);
}

function evidenceCell(evidence) {
    if (evidence.phase === 'none') return ['Nothing taken yet'];
    if (evidence.covered) return linkList(evidence.sourceIds);
    return evidence.sourceIds.length ? ['Beyond the studies; rests on ', ...linkList(evidence.sourceIds)] : ['No study at a comparable dose'];
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
        sourceLink(c.sourceId), '). A 2019 meta-analysis of 101 human studies agrees: tingling was the only reported side effect, at 8.9 times the odds of placebo, and a small rise in the liver enzyme ALT stayed well inside the normal range (',
        sourceLink(CLAIMS.side_effects_meta.sourceId), '). This tool makes no other safety claim.');
}

export function renderFoodNote(node) {
    clear(node);
    node.append('With food: plain beta-alanine taken 10 minutes after a small breakfast (bread, hazelnut spread and milk) gave a blood curve like sustained release, and tingling on only 7 of 60 doses of 1.6 g, 20 mg/kg, or 0.8 g plus 10 mg/kg (',
        sourceLink('stautemas2019'), '). Most studies fitted here dosed with meals, and one found a larger rise with meals than between them (',
        sourceLink('stegen2013'), '). Insulin is unlikely to be why: raising it did not increase how much beta-alanine muscle took up (',
        sourceLink('goncalves2020'), '). Uptake into muscle cells reaches half its maximum at about ',
        `${CLAIMS.uptake_km.value} micromolar in chick muscle cells (`, sourceLink('bakardjiev1994'), `), and plain beta-alanine peaks at ${CLAIMS.plasma_peak_40.value} micromolar after 40 mg/kg (`,
        sourceLink('harris2006'), '). At the same 6 g/day for 28 days, sustained-release tablets raised carnosine 50.1% and rapid-release tablets 37.9%, a gap that was not significant (',
        sourceLink('varanoske2019'), '), so whether a flatter blood curve stores more per gram is not settled. Sipping it in water through the day has not been studied. It would spread the dose the way sustained release does, and over weeks sustained release and plain beta-alanine raised carnosine equally (',
        sourceLink('stegen2013'), ').');
}

/**
 * Turnover at a steady level and what a dose adds, on the model's own arithmetic:
 * loss kd x B x dry muscle per washout study; extra synthesis slope x D x dry muscle
 * and the oral-equivalent supply kd x B / slope per washout and loading pairing.
 */
export function turnoverFigures({ baseline, muscleKg, doseGPerDay }) {
    const dryKg = muscleKg / WET_TO_DRY;
    const kds = WASHOUT_RATES.map((w) => kdFromHalfLife(w.central));
    const loss = kds.map((kd) => steadyTurnover(baseline, dryKg, kd)).sort((a, b) => a - b);
    const extra = [];
    const multiple = [];
    const supply = [];
    for (const kd of kds) for (const p of loadingPapers(LOADING_OBSERVATIONS)) {
        const slope = fitSlope(p.points, kd);
        extra.push(slope * doseGPerDay * dryKg);
        multiple.push(1 + (slope * doseGPerDay) / (kd * baseline));
        supply.push(maintenanceDose(baseline, slope, kd));
    }
    const mid = (v) => percentileSorted([...v].sort((a, b) => a - b), 0.5);
    const band = (v) => { const sorted = [...v].sort((a, b) => a - b); return { p10: percentileSorted(sorted, 0.1), p50: percentileSorted(sorted, 0.5), p90: percentileSorted(sorted, 0.9) }; };
    const toG = (mmol, gPerMol) => (mmol * gPerMol) / 1000;
    return {
        carnosineGPerDay: { low: toG(loss[0], CARNOSINE_G_PER_MOL), high: toG(loss[loss.length - 1], CARNOSINE_G_PER_MOL) },
        betaAlanineGPerDay: { low: toG(loss[0], BETA_ALANINE_G_PER_MOL), high: toG(loss[loss.length - 1], BETA_ALANINE_G_PER_MOL) },
        extraBetaAlanineGPerDay: toG(mid(extra), BETA_ALANINE_G_PER_MOL),
        multiple: mid(multiple),
        supply: band(supply)
    };
}

/** Least water per serving at 20 and 25 C, from the measured solubility. */
export function renderMixNote(node, phases) {
    clear(node);
    const serving = Math.max(0, ...phases.map((p) => (p.servings > 0 ? p.doseGPerDay / p.servings : 0)));
    const lead = serving > 0
        ? `Mixing: the largest serving here, ${fmt(serving, 2)} g, dissolves in at least ${fmt(waterForGrams(serving, 20, SOLUBILITY), 1)} g of water at 20 C and ${fmt(waterForGrams(serving, 25, SOLUBILITY), 1)} g at 25 C. `
        : 'Mixing: ';
    node.append(lead, 'Solubility was measured from 20 to 50 C and rises with temperature (', sourceLink('romero2013'),
        '). With sugar, beta-alanine browns; in boiling tests the first browning steps were negligible at pH 3.5 and rose with pH (', sourceLink('hayashi1986'),
        '). No study gives a rate at room temperature, so the page gives none.');
}

/** Where the beta-alanine taken goes, with the slowdown and taurine findings. */
export function renderFate(node, { summary, muscle, totalGrams, anchors, baseline, doseGPerDay }) {
    clear(node);
    const cards = h('div', { class: 'cards' });
    const urineLo = CLAIMS.urine_cc.value * 100;
    const urineHi = CLAIMS.urine_tt.value * 100;
    const rise = summary && summary.riseAtStop ? summary.riseAtStop.p50 : 0;
    const inc = incorporatedPercent(rise, muscle.centerKg, totalGrams);
    if (totalGrams > 0 && Number.isFinite(inc)) {
        const grams = (pct) => fmt((totalGrams * pct) / 100, 1);
        cards.appendChild(card('Stored as muscle carnosine', `${fmt(inc, 1)}%`, `about ${grams(inc)} g of the ${fmt(totalGrams, 1)} g taken, at the end of dosing`,
            ['On the middle line at your muscle mass. Studies report 3 to 6% (', sourceLink('blancquaert2016'), '), about 3% (', sourceLink('stegen2013'), ') and 4.4% (', sourceLink('yamaguchi2021'), '). Training raises it: ',
                `${fmt(CLAIMS.training_inactive.value * 100, 1)}% in men who stayed inactive against up to ${fmt(CLAIMS.training_trained.value * 100, 1)}% in men who trained (`, sourceLink('bex2015'),
                '), and trained muscles loaded about 1.6 to 1.8 times as much as untrained ones (', sourceLink('bex2014'), ').']));
        cards.appendChild(card('Lost in urine', `${fmt(urineLo, 1)} to ${fmt(urineHi, 1)}%`, `about ${grams(urineLo)} to ${grams(urineHi)} g`,
            ['Within 4 hours of 1.4 g: 1.8% with the common AGXT2 gene variant, 3.6% with the low-activity one (', sourceLink('stautemas2020'), ').']));
        cards.appendChild(card('Broken down', `about ${fmt(100 - inc - urineHi, 0)} to ${fmt(100 - inc - urineLo, 0)}%`, 'neither stored nor excreted',
            ['Turned into malonate semialdehyde, mainly in the liver and kidney, by the enzymes GABA-T and AGXT2, and burned for energy (', sourceLink('blancquaert2016'), ' and ', sourceLink('stautemas2020'), ').']));
    } else {
        cards.appendChild(card('Where it goes', 'No beta-alanine taken', null, null));
    }
    const t = baseline > 0 ? turnoverFigures({ baseline, muscleKg: muscle.centerKg, doseGPerDay: doseGPerDay || 0 }) : null;
    if (t) {
        const adds = doseGPerDay > 0
            ? ` At ${fmt(doseGPerDay, 1)} g/day the model adds about ${fmt(t.extraBetaAlanineGPerDay, 2)} g/day of beta-alanine into carnosine, about ${fmt(t.multiple, 1)} times the normal rate (middle of the pairings).`
            : '';
        cards.appendChild(card('Normal daily turnover', `${fmt(t.carnosineGPerDay.low, 2)} to ${fmt(t.carnosineGPerDay.high, 2)} g/day`,
            `of carnosine made and lost at your baseline; ${fmt(t.betaAlanineGPerDay.low, 2)} to ${fmt(t.betaAlanineGPerDay.high, 2)} g of beta-alanine built in`,
            ['At a steady level synthesis equals loss: the loss rate from each washout study times your baseline and muscle. The authors of a vegetarian-diet trial put it at about ',
                `${CLAIMS.turnover_blancquaert.value} g/day from the same washout data (`, sourceLink('blancquaert2018'), `).${adds}`]));
    }
    node.appendChild(cards);

    if (t) {
        node.appendChild(h('h3', { text: 'Where your baseline comes from' }));
        node.appendChild(h('p', {}, [`On the model's arithmetic, holding a baseline of ${fmt(baseline, 1)} mmol/kg dm takes the equivalent of ${fmt(t.supply.p50, 1)} g/day of beta-alanine taken by mouth (${fmt(t.supply.p10, 1)} to ${fmt(t.supply.p90, 1)}). Spelnikov and Harris estimated the body makes about ${CLAIMS.endogenous_spelnikov.value} g/day, the amount their model needs to hold a vegetarian level of 14 (`,
            sourceLink('spelnikov2019'), '). Both are model figures, not measurements, and beta-alanine made in the liver is not broken down on the way in as a swallowed dose is. It is made from uracil in the liver (',
            sourceLink('decombaz2012'), ') and, in mice at least, from aspartate by the enzyme GADL1 (', sourceLink('mahootchi2020'), '). Meat and fish add about 0.3 to 0.5 g/day (',
            ...linkList(['baguet2009', 'solis2015']), ') and a vegetarian diet none, yet 6 months of a vegetarian diet did not lower muscle carnosine (', sourceLink('blancquaert2018'), ').']));
    }

    node.appendChild(h('h3', { text: 'Breakdown is the bottleneck' }));
    node.appendChild(h('p', {}, ['In mice, blocking both enzymes tripled blood beta-alanine and raised carnosine in muscle and heart; blocking GABA-T alone did not (',
        sourceLink('blancquaert2016'), '). People whose AGXT2 gene variant makes a less active enzyme lost twice as much in urine but had the same muscle carnosine (',
        sourceLink('stautemas2020'), '), so either enzyme can cover for the other. In blood, beta-alanine has a half-life of about 45 to 70 minutes (',
        ...linkList(['stautemas2019', 'stautemas2020', 'desalazar2021']), '), which is why it is taken several times a day.']));

    const s24 = anchors && anchors.find((a) => a.id === 'saunders_wk24');
    node.appendChild(h('h3', { text: 'Uptake slows over months' }));
    node.appendChild(h('p', {}, ['In the only 24-week study the average rise was +11.37 mmol/kg dm at week 4 and +20.15 at week 24, and it grew most in the first 4 weeks. TauT, the transporter that carries beta-alanine into muscle, was turned down over the 24 weeks, which the authors suggest plays a part in how much builds up (',
        sourceLink('saunders2017'), '). That is a slowdown, not a proven ceiling: 5 of 15 people were at their highest at week 24, four of them still rising. It shows within weeks too: on 6 g/day carnosine rose ',
        `${Math.round((1 - CLAIMS.early_slowdown.value) * 100)}% less in days 12 to 23 than in days 0 to 12, and muscle histidine fell ${fmt(CLAIMS.histidine_drop.value * 100, 1)}% (`,
        sourceLink('blancquaert2017'), '), but a meta-analysis found no effect on muscle histidine (', sourceLink('dolan2019'),
        ') and adding histidine did not help, so histidine is probably not the cause (', sourceLink('perim2019'), '). This model has no slowdown',
        s24 ? `: at week 24 of 6.4 g/day its middle line is +${fmt(s24.model.p50, 1)} against the +${fmt(s24.measured, 2)} measured` : '',
        ', so past about week 8 read the middle line as an upper estimate. The literature anchors in the audit trail show the gap. In mice on beta-alanine in their water the same transporter went up instead, as did the breakdown enzyme GABA-T and carnosine synthase (',
        sourceLink('everaert2013'), '). No study has measured whether the body makes less of its own beta-alanine while supplementing. The liver enzyme that does the last step from uracil is shut off by beta-alanine in rats (',
        sourceLink('matthews1987'), `), but the human enzyme was not, even at ${CLAIMS.bup_human.value} mM (`, sourceLink('sakamoto2001'),
        `). Fasting blood beta-alanine rose rather than fell: from 2.6 to ${fmt(CLAIMS.fasting_plasma_6g.value, 1)} micromolar over 23 days of 6 g/day (`, sourceLink('blancquaert2017'),
        `) and ${Math.round(CLAIMS.fasting_plasma_32.value * 100)}% over 12 weeks of 3.2 g/day (`, sourceLink('debrandt2022'),
        `). Carnosine can also rise with none eaten: 12 weeks of interval training raised it from 15.8 to ${fmt(15.8 + CLAIMS.hiit_vegetarian.value, 1)} mmol/kg dm in vegetarian men, with the carnosine genes unchanged (`,
        sourceLink('painelli2018'), '). Where the extra beta-alanine came from was not measured.']));

    node.appendChild(h('h3', { text: 'Other places it acts' }));
    node.appendChild(h('p', {}, ['The tingling comes from MrgD, a receptor on nerve endings in the skin that responds to micromolar beta-alanine (', sourceLink('shinohara2004'),
        '). Injected into the skin of volunteers it caused itch with no wheal or flare, so histamine is not the route (', sourceLink('liu2012'),
        '). In the brain it acts at five receptor sites in animal and laboratory work (', sourceLink('tiedje2010'),
        '), but 6.4 g/day did not change brain carnosine or cognitive test results in people (', sourceLink('solis2015'), ').']));

    node.appendChild(h('h3', { text: 'Taurine' }));
    node.appendChild(h('p', {}, ['Beta-alanine shares TauT with taurine. Rodents lose muscle taurine on 3% beta-alanine in their water, 38 to 56 times the human dose. In people, 24 weeks at 6.4 g/day left muscle taurine unchanged (33.7 at the start, 35.4 at week 24, mmol/kg dm; ',
        sourceLink('saunders2020'), '), and a meta-analysis of 63 people found no effect (', sourceLink('dolan2019'), '). Mice on beta-alanine in their water lost 18% (', sourceLink('everaert2013'), ').']));
}

const VERDICT_TEXT = { inside: 'Inside the band', 'model-above': 'Model above', 'model-below': 'Model below' };

function anchorTable(anchors) {
    const t = h('table', { class: 'data-table', id: 'anchorTable' });
    t.appendChild(h('thead', {}, h('tr', {}, ['Study', 'Protocol', 'Measured', 'Model, 10th / middle / 90th', 'Verdict']
        .map((x) => h('th', { scope: 'col', text: x })))));
    const body = h('tbody');
    for (const a of anchors) {
        const m = a.model;
        body.appendChild(h('tr', { 'data-anchor': a.id, 'data-verdict': a.verdict }, [
            h('th', { scope: 'row' }, linkList(a.sourceIds)),
            h('td', { text: a.title }),
            h('td', { text: a.measuredText }),
            h('td', { class: 'num', text: `${fmt(m.p10, a.digits || 1)} / ${fmt(m.p50, a.digits || 1)} / ${fmt(m.p90, a.digits || 1)} ${a.unit}` }),
            h('td', {}, [h('p', { text: VERDICT_TEXT[a.verdict] }), a.note ? h('p', { text: a.note }) : null])
        ]));
    }
    t.appendChild(body);
    return t;
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

/**
 * The person-to-person paragraph, from figures computed on Rezende's protocol:
 * { cv, mean, sd } of the paper-only draws, and the 4-week band off and on.
 */
function personParagraph({ cv, mean, sd, off, on }) {
    const total = CLAIMS.response_sd.value;
    const median = 1 / Math.sqrt(1 + cv * cv);
    const band = (b) => `${fmt(b.p50, 1)} (${fmt(b.p10, 1)} to ${fmt(b.p90, 1)})`;
    return h('p', {}, [`Person-to-person variation, when switched on, multiplies each draw by a lognormal factor with mean 1 and a coefficient of variation of ${fmt(cv, 2)}. The papers alone already spread the 4-week rise at 6.4 g/day (SD ${fmt(sd, 1)} around ${fmt(mean, 1)}), so the factor adds only what brings the total to the response SD of ${fmt(total, 1)} around a mean rise of 14.0 mmol/kg dm (`, sourceLink('rezende2020'),
        `), counting the spread between studies once. The lognormal shape is an engineering assumption. It stretches a 4-week spread over the whole timeline, which is why it is off by default. At 4 weeks it moves the middle and 10th to 90th from ${band(off)} to ${band(on)}. The middle falls by more than the factor's own median of ${fmt(median, 2)}: the paper draws sit in two clusters (Saunders and Hill low, the rest high), and the factor fills the gap between them.`]);
}

export function renderAudit(node, anchors = [], person = null) {
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
        const drawn = sampledHalfLifeRange(w);
        const sampled = drawn ? `, sampled lognormal around ${fmt(w.central, 1)}, which draws 95% between ${fmt(drawn.low, 1)} and ${fmt(drawn.high, 1)}` : `, sampled ${w.sampling}`;
        wl.appendChild(h('li', {}, [sourceLink(w.sourceId), `: half-life ${fmt(w.central, 1)} days (${fmt(w.low, 1)} to ${fmt(w.high, 1)}${sampled}). ${w.basis}.`,
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
        ...(person ? [personParagraph(person)] : []),
        h('p', { text: 'Leave-one-paper-out test, from Phase 0: with each loading study held out in turn, 10 of its 17 points fell inside the band built from the rest, against about 14 expected. Nearly every miss was Saunders 2017: without it, the shorter studies predict a long-run rise about 50% above what Saunders measured. Long courses level off faster than the washout half-lives imply, and Saunders is the only study past 10 weeks. That is why the band is shaded past the longest comparable study rather than given another fitted parameter.' }),
        h('p', {}, ['Saunders also reported the maximum: ', claim('saunders_max').claim, ...cite('saunders_max'), '.'])
    ]);

    section('Literature anchors', [
        h('p', { text: 'Published results the model is held against, each run on the study\'s own protocol. "Inside the band" means the measured value falls between the 10th and 90th percentiles. The spec fails if any verdict here changes, so a model change that moves one has to say so.' }),
        h('div', { class: 'table-scroll' }, anchorTable(anchors))
    ]);

    const claimIds = ['baseline_default', 'baseline_no_effect', 'women_vl', 'women_calf', 'vegetarian', 'age', 'placebo_variation', 'response_sd', 'baseline_sd',
        'form_equivalent', 'meal_effect', 'incorporation', 'incorporation_yamaguchi', 'retention', 'tingle_40', 'tingle_20', 'tingle_10', 'tingle_800mg',
        'tingle_broth', 'plasma_peak', 'tingle_sr', 'tingle_800_common', 'tingle_12g_sr', 'issn_dose', 'issn_split', 'issn_safety', 'maintenance',
        'sex_absolute', 'kf_high_dose_sublinear', 'washout_baguet_split', 'age_drop', 'elderly_rise', 'fate_transaminases', 'fate_incorporation',
        'fate_breakdown_product', 'urine_cc', 'urine_tt', 'agxt2_no_carnosine', 'plasma_half_life', 'plasma_half_life_14', 'plasma_half_life_sr8',
        'tau_t_down', 'saunders_still_rising', 'saunders_slowdown', 'taurine_24wk', 'taurine_meta', 'taurine_rodent', 'side_effects_meta',
        'breakfast_profile', 'body_mass_plasma', 'tingle_sr_5g', 'tingle_sr_8g', 'turnover_blancquaert', 'washout_rate_baguet', 'washout_3wk_baguet', 'washout_firstorder_baguet', 'endogenous_spelnikov',
        'endogenous_route_uracil', 'endogenous_route_gadl1', 'diet_baguet', 'diet_solis', 'diet_removal', 'low_dose_08', 'low_dose_04', 'genes_mice',
        'training_inactive', 'training_trained', 'trained_muscle', 'mrgd_receptor', 'itch_human', 'cns_sites', 'brain_carnosine', 'solubility_enthalpy', 'browning_ph',
        'early_slowdown', 'histidine_drop', 'histidine_not_limiting', 'fasting_plasma_6g', 'fasting_plasma_32', 'bup_human', 'bup_rat', 'insulin_no_uptake', 'uptake_km', 'plasma_peak_40', 'varanoske_sr', 'varanoske_rr', 'hiit_vegetarian', 'histidine_meta',
        'stell_wk8_hl_ta', 'stell_wk8_hl_ga', 'stell_wk8_ll_ta', 'stell_wk8_ll_ga'];
    const cl = h('ul');
    for (const id of claimIds) {
        const c = claim(id);
        if (c) cl.appendChild(h('li', {}, [c.claim, ...cite(id), `. Used for: ${c.use}.`]));
    }
    section('Every other figure on the page', [cl,
        h('p', { text: 'Meals: one MRS study in one muscle found a larger rise with meals, and most fitted studies dosed with meals, so meals are a sentence rather than a setting. Form: chronic sustained release and plain were equally effective, so form changes only the tingling check.' }),
        h('p', { text: 'Older adults: Baguet 2012 measured the calf by MRS, so the older-adult preset applies its percent drop to the thigh figure rather than using its values. Sipping through the day has no study, so it is a sentence with no figure.' })
    ]);
}

export function renderSources(node) {
    clear(node);
    for (const [id, s] of Object.entries(SOURCES)) {
        node.appendChild(h('li', {}, [s.url ? h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.label }) : s.label,
            s.archived ? '' : ' (not archived; figures quoted by two archived papers)', ` [${id}]`]));
    }
}
