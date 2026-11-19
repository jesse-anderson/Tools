// Beta-Alanine Lab controller: state, inputs, storage and wiring.

import * as Engine from './beta-alanine-engine.js';
import { runBand, attributeEdge, paperMedian, loadingPapers, doseForGoal, personCv, RESPONSE_PROTOCOL, DEFAULT_SEED } from './beta-alanine-monte-carlo.js';
import { SOURCES, CLAIMS, LOADING_OBSERVATIONS, WASHOUT_RATES, PRICE_TIERS, WET_TO_DRY, SOLUBILITY } from './beta-alanine-data.js';
import { PROTOCOL_PRESETS, BASELINE_PRESETS } from './beta-alanine-presets.js';
import { drawChart } from './beta-alanine-chart.js';
import { literatureAnchors } from './beta-alanine-anchors.js';
import {
    h, clear, fmt, sourceLink, linkList, renderTip, renderFlags, renderCards, renderEdgeTable,
    renderServings, renderSafety, renderCosts, renderAudit, renderSources, renderGoal, computeChecks,
    renderFoodNote, renderFate, renderMixNote, turnoverFigures
} from './beta-alanine-view.js';
import { estimateSkeletalMuscleMass } from '../supplement_common/body-composition.js';
import { createProjectStore, cleanTextState } from '../diagram_common/projects.js';

const LAST_KEY = 'toolsHub.betaAlanine.last';
const LB_PER_KG = 2.20462;
const NORMAL_VARIATION = CLAIMS.placebo_variation.value;
const LOADING = loadingPapers(LOADING_OBSERVATIONS);

const store = createProjectStore({
    storageKey: 'toolsHub.betaAlanine.protocols',
    fileFormat: 'tools-hub-beta-alanine-protocol',
    label: 'Beta-Alanine Lab',
    maxProjects: 20,
    cleanState: cleanTextState,
    hasContent: (s) => Boolean(s) && typeof s === 'object' && typeof s.fields === 'object'
});

const $ = (id) => document.getElementById(id);
let state = defaultState();
let band = null;
let chartScale = null;
let tipDay = null;
let pending = 0;
let goal = null;

function defaultState() {
    return fromPreset('reference', {
        massValue: 70, massUnit: 'kg', bodyFat: 20, muscleMass: '', baselinePreset: 'pooled', baselineValue: 22.9,
        targetRise: 10, individual: false, view: 'rise', ownPrice: '', ownGrams: '', paperLines: [], goalRise: 10, goalWeeks: 4
    });
}

function fromPreset(id, base) {
    const preset = PROTOCOL_PRESETS.find((p) => p.id === id) || PROTOCOL_PRESETS[0];
    return {
        ...base,
        presetId: preset.id,
        phases: preset.phases.map((p) => ({
            doseGPerDay: p.doseGPerDay, servings: p.servings, form: p.form,
            value: p.days % 7 === 0 ? p.days / 7 : p.days, unit: p.days % 7 === 0 ? 'weeks' : 'days'
        })),
        washoutWeeks: preset.washoutDays / 7
    };
}

// ---- State to engine inputs -------------------------------------------------

const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && String(v).trim() !== '' ? n : fallback;
};

// Field limits, the same as the inputs' min and max. A value outside them is used
// at the limit and named in the flags, never changed in silence.
const LIMITS = {
    dose: [0, 40], servings: [1, Engine.MAX_SERVINGS], length: [0, 520], washout: [0, 52], target: [0, 60],
    massKg: [20, 300], bodyFat: [3, 60], muscle: [0, 80], baseline: [1, 60], goalRise: [0, 60], goalWeeks: [1, 24]
};
let rangeNotes = new Map();

const trim = (v) => String(Number(v.toFixed(2)));

function bounded(key, value, fallback, [lo, hi], label, unit) {
    const n = num(value, fallback);
    const c = Math.min(hi, Math.max(lo, n));
    if (c !== n) rangeNotes.set(key, `${label} of ${trim(n)} ${unit} is outside the ${trim(lo)} to ${trim(hi)} ${unit} this page accepts, so ${trim(c)} ${unit} is used.`);
    return c;
}

function massLimits() {
    const f = state.massUnit === 'lb' ? LB_PER_KG : 1;
    return LIMITS.massKg.map((v) => Number((v * f).toFixed(1)));
}

function enginePhases() {
    return state.phases.map((p, i) => {
        const name = `Phase ${i + 1}`;
        const unit = p.unit === 'weeks' ? 'weeks' : 'days';
        const exact = bounded(`length${i}`, p.value, 0, LIMITS.length, `${name} length`, unit) * (unit === 'weeks' ? 7 : 1);
        const days = Math.round(exact);
        // The model runs whole days; say so when the length was not one.
        if (Math.abs(exact - days) > 1e-9) rangeNotes.set(`days${i}`, `${name} length is ${trim(exact)} days; the model runs whole days, so ${days} days are used.`);
        return {
            doseGPerDay: bounded(`dose${i}`, p.doseGPerDay, 0, LIMITS.dose, `${name} dose`, 'g/day'),
            servings: Math.round(bounded(`servings${i}`, p.servings, 1, LIMITS.servings, `${name} servings`, 'a day')),
            form: p.form === 'sustained' ? 'sustained' : 'plain',
            days
        };
    });
}

function washoutWeeks() {
    return bounded('washout', state.washoutWeeks, 16, LIMITS.washout, 'Washout', 'weeks');
}

function targetRise() {
    return bounded('target', state.targetRise, 0, LIMITS.target, 'Target rise', 'mmol/kg dm');
}

function bodyMassKg() {
    const v = bounded('mass', state.massValue, state.massUnit === 'lb' ? 70 * LB_PER_KG : 70, massLimits(), 'Body mass', state.massUnit);
    return state.massUnit === 'lb' ? v / LB_PER_KG : v;
}

function baseline() {
    return bounded('baseline', state.baselineValue, 22.9, LIMITS.baseline, 'Baseline', 'mmol/kg dm');
}

function muscle() {
    const direct = num(state.muscleMass, 0) > 0 ? bounded('muscle', state.muscleMass, 0, LIMITS.muscle, 'Skeletal muscle', 'kg') : 0;
    const bodyFat = bounded('bodyFat', state.bodyFat, 20, LIMITS.bodyFat, 'Body fat', '%');
    const est = estimateSkeletalMuscleMass({ bodyMassKg: bodyMassKg(), bodyFatPercent: bodyFat, skeletalMuscleMassKg: direct });
    return { centerKg: est.skeletalMuscleMassKg, uncertainty: direct > 0 ? 0.05 : 0.12, source: est.skeletalMuscleMassSource };
}

const VIEWS = {
    rise: { unit: 'mmol/kg dm', title: 'Rise, mmol/kg dry muscle', caption: 'Rise above baseline, mmol/kg dry muscle.', to: (r) => r },
    percent: { unit: '% of baseline', title: 'Rise, % of baseline', caption: 'Rise as a percent of the baseline set under Person.', to: (r) => (r / baseline()) * 100 },
    total: { unit: 'mmol/kg dm', title: 'Total carnosine, mmol/kg dry muscle', caption: 'Baseline plus the rise, mmol/kg dry muscle.', to: (r) => baseline() + r }
};

// ---- Inputs -----------------------------------------------------------------

function buildPresetSelect() {
    const sel = $('protocolPreset');
    clear(sel);
    for (const p of PROTOCOL_PRESETS) sel.appendChild(h('option', { value: p.id, text: p.label }));
    sel.appendChild(h('option', { value: 'custom', text: 'Custom' }));
    const b = $('baselinePreset');
    clear(b);
    for (const p of BASELINE_PRESETS) b.appendChild(h('option', { value: p.id, text: `${p.label} (${p.value})` }));
    b.appendChild(h('option', { value: 'custom', text: 'Custom' }));
}

function renderPresetReport() {
    const node = clear($('presetReport'));
    const preset = PROTOCOL_PRESETS.find((p) => p.id === state.presetId);
    if (!preset) {
        node.appendChild(h('p', { text: 'Custom protocol.' }));
        return;
    }
    if (preset.reported) {
        const r = preset.reported;
        node.appendChild(h('p', {}, ['As reported by ', ...linkList(preset.sourceIds), ':']));
        const dl = h('dl');
        for (const [k, v] of [['Servings', r.servings], ['Per serving', r.perServing], ['Time between doses', r.interval], ['Form', r.form], ['Meals', r.meals]]) {
            dl.appendChild(h('dt', { text: k }));
            dl.appendChild(h('dd', { text: v }));
        }
        node.appendChild(dl);
    } else {
        node.appendChild(h('p', {}, ['Source: ', ...linkList(preset.sourceIds), '.']));
    }
    if (preset.note) node.appendChild(h('p', { text: preset.note }));
}

function renderPhases() {
    const list = clear($('phaseList'));
    state.phases.forEach((p, i) => {
        const id = (name) => `phase${i}${name}`;
        const field = (label, input) => h('div', { class: 'input-group' }, [h('label', { for: input.id, text: label }), input]);
        const dose = h('input', { id: id('Dose'), type: 'number', min: 0, max: 40, step: 'any', inputmode: 'decimal', value: p.doseGPerDay });
        const servings = h('input', { id: id('Servings'), type: 'number', min: 1, max: Engine.MAX_SERVINGS, step: 1, inputmode: 'numeric', value: p.servings });
        const form = h('select', { id: id('Form') }, [h('option', { value: 'plain', text: 'Plain' }), h('option', { value: 'sustained', text: 'Sustained release' })]);
        form.value = p.form;
        const value = h('input', { id: id('Length'), type: 'number', min: 0, max: 520, step: 'any', inputmode: 'decimal', value: p.value });
        const unit = h('select', { id: id('Unit') }, [h('option', { value: 'weeks', text: 'weeks' }), h('option', { value: 'days', text: 'days' })]);
        unit.value = p.unit;
        const bind = (input, key) => input.addEventListener('input', () => { state.phases[i][key] = input.value; markCustom(); schedule(); });
        bind(dose, 'doseGPerDay'); bind(servings, 'servings'); bind(value, 'value');
        form.addEventListener('change', () => { state.phases[i].form = form.value; markCustom(); schedule(); });
        unit.addEventListener('change', () => { state.phases[i].unit = unit.value; markCustom(); schedule(); });
        const children = [field('g/day', dose), field('Servings a day', servings), field('Form', form), field('Length', value), field('Unit', unit)];
        const remove = state.phases.length > 1
            ? h('button', { type: 'button', class: 'tool-btn small remove', text: `Remove phase ${i + 1}` })
            : null;
        if (remove) remove.addEventListener('click', () => { state.phases.splice(i, 1); markCustom(); renderPhases(); schedule(); });
        list.appendChild(h('fieldset', { class: 'phase' }, [h('legend', { text: `Phase ${i + 1}` }), h('div', { class: 'phase-grid' }, children), remove]));
    });
    $('addPhase').disabled = state.phases.length >= Engine.MAX_PHASES;
}

function markCustom() {
    state.presetId = 'custom';
    $('protocolPreset').value = 'custom';
    renderPresetReport();
}

function syncInputs() {
    $('protocolPreset').value = PROTOCOL_PRESETS.some((p) => p.id === state.presetId) ? state.presetId : 'custom';
    $('washoutWeeks').value = state.washoutWeeks;
    $('targetRise').value = state.targetRise;
    $('bodyMass').value = state.massValue;
    $('massUnit').value = state.massUnit;
    setMassLimits();
    $('bodyFat').value = state.bodyFat;
    $('muscleMass').value = state.muscleMass;
    $('baselinePreset').value = BASELINE_PRESETS.some((p) => p.id === state.baselinePreset) ? state.baselinePreset : 'custom';
    $('baselineValue').value = state.baselineValue;
    $('individualSwitch').checked = Boolean(state.individual);
    $('chartView').value = VIEWS[state.view] ? state.view : 'rise';
    $('ownPrice').value = state.ownPrice;
    $('ownGrams').value = state.ownGrams;
    $('goalRise').value = state.goalRise;
    $('goalWeeks').value = state.goalWeeks;
    renderPresetReport();
    renderPhases();
    renderBaselineNote();
}

function setMassLimits() {
    const [lo, hi] = massLimits();
    $('bodyMass').min = lo;
    $('bodyMass').max = hi;
}

function renderBaselineNote() {
    const node = clear($('baselineNote'));
    const preset = BASELINE_PRESETS.find((p) => p.id === state.baselinePreset);
    if (!preset) {
        node.append('Your own baseline.');
        return;
    }
    const c = CLAIMS[preset.claimId];
    node.append(preset.note, ' (', sourceLink(c.sourceId), ')');
}

function wireInputs() {
    $('protocolPreset').addEventListener('change', (e) => {
        if (e.target.value === 'custom') { state.presetId = 'custom'; renderPresetReport(); return; }
        state = fromPreset(e.target.value, state);
        syncInputs();
        schedule();
    });
    $('addPhase').addEventListener('click', () => {
        if (state.phases.length >= Engine.MAX_PHASES) return;
        const last = state.phases[state.phases.length - 1];
        state.phases.push({ ...last, value: 4, unit: 'weeks' });
        markCustom();
        renderPhases();
        schedule();
    });
    const bindValue = (id, key, after) => $(id).addEventListener('input', (e) => { state[key] = e.target.value; if (after) after(); schedule(); });
    // The washout shown is not part of a study's dosing, so a preset stays a preset.
    bindValue('washoutWeeks', 'washoutWeeks');
    bindValue('targetRise', 'targetRise');
    bindValue('bodyFat', 'bodyFat');
    bindValue('muscleMass', 'muscleMass');
    bindValue('ownPrice', 'ownPrice');
    bindValue('ownGrams', 'ownGrams');
    bindValue('goalRise', 'goalRise');
    bindValue('goalWeeks', 'goalWeeks');
    $('useGoalDose').addEventListener('click', useGoalDose);
    $('bodyMass').addEventListener('input', (e) => { state.massValue = e.target.value; schedule(); });
    $('massUnit').addEventListener('change', (e) => {
        const kg = bodyMassKg();
        state.massUnit = e.target.value;
        state.massValue = Number((state.massUnit === 'lb' ? kg * LB_PER_KG : kg).toFixed(1));
        $('bodyMass').value = state.massValue;
        setMassLimits();
        schedule();
    });
    $('baselinePreset').addEventListener('change', (e) => {
        state.baselinePreset = e.target.value;
        const preset = BASELINE_PRESETS.find((p) => p.id === state.baselinePreset);
        if (preset) { state.baselineValue = preset.value; $('baselineValue').value = preset.value; }
        renderBaselineNote();
        schedule();
    });
    $('baselineValue').addEventListener('input', (e) => {
        state.baselineValue = e.target.value;
        state.baselinePreset = 'custom';
        $('baselinePreset').value = 'custom';
        renderBaselineNote();
        schedule();
    });
    $('individualSwitch').addEventListener('change', (e) => { state.individual = e.target.checked; schedule(); });
    $('chartView').addEventListener('change', (e) => { state.view = e.target.value; render(); persistLast(); });
}

// ---- Compute and render -----------------------------------------------------

function schedule() {
    clearTimeout(pending);
    pending = setTimeout(() => { compute(); render(); persistLast(); }, 60);
}

function compute() {
    rangeNotes = new Map();
    const phases = enginePhases();
    band = runBand({
        phases,
        washoutDays: Math.round(washoutWeeks() * 7),
        observations: LOADING_OBSERVATIONS,
        loadingPapers: LOADING,
        washouts: WASHOUT_RATES,
        seed: DEFAULT_SEED,
        individual: Boolean(state.individual),
        target: targetRise(),
        normalVariation: NORMAL_VARIATION,
        muscle: muscle(),
        wetToDry: WET_TO_DRY
    });
    band.phases = phases;
    const goalRise = bounded('goalRise', state.goalRise, 0, LIMITS.goalRise, 'Goal rise', 'mmol/kg dm');
    const goalWeeks = Math.round(bounded('goalWeeks', state.goalWeeks, 4, LIMITS.goalWeeks, 'Goal week', 'weeks'));
    const result = doseForGoal({ goal: goalRise, days: goalWeeks * 7, loadingPapers: LOADING, washouts: WASHOUT_RATES,
        seed: DEFAULT_SEED, individual: Boolean(state.individual) });
    goal = { rise: goalRise, weeks: goalWeeks, result,
        horizon: result ? Engine.evidenceHorizon([{ doseGPerDay: result.p50, days: goalWeeks * 7 }], LOADING_OBSERVATIONS, WASHOUT_RATES) : null };
    band.horizon = Engine.evidenceHorizon(phases, LOADING_OBSERVATIONS, WASHOUT_RATES);
    window.BetaAlanine.lastBand = band;
}

function paperLineModels() {
    const lines = [];
    LOADING.forEach((p, i) => {
        if (state.paperLines.includes(`loading:${p.sourceId}`)) {
            lines.push({ values: paperMedian(band, 'loading', p.sourceId), className: `paper-${(i % 6) + 1}`, dashed: false });
        }
    });
    WASHOUT_RATES.forEach((w, i) => {
        if (state.paperLines.includes(`washout:${w.sourceId}`)) {
            lines.push({ values: paperMedian(band, 'washout', w.sourceId), className: `paper-${(i % 6) + 1}`, dashed: true });
        }
    });
    return lines.filter((l) => l.values);
}

function render() {
    if (!band) return;
    // Read before the flags are drawn, so a limit note on the baseline is among them.
    const base = baseline();
    const view = VIEWS[state.view] || VIEWS.rise;
    const phases = band.phases;
    const baseNote = view === VIEWS.rise ? '' : ` The band is the rise only: baseline itself differs between people by SD ${CLAIMS.baseline_sd.value} mmol/kg dm (Rezende 2020), which this view does not show.`;
    $('chartCaption').textContent = `${view.caption} Band: 10th to 90th percentile of ${band.draws} draws, ${band.individual ? 'papers and person-to-person variation' : 'disagreement between papers only'}.${baseNote}`;
    const markers = [];
    let t = 0;
    phases.forEach((p, i) => {
        if (i > 0) markers.push({ startDay: t, label: `Phase ${i + 1}` });
        t += p.days;
    });
    markers.push({ startDay: band.stopDay, label: 'Stop' });
    chartScale = drawChart($('chart'), {
        band, view: state.view, toView: view.to, normal: NORMAL_VARIATION, horizon: band.horizon,
        phases: markers, paperLines: paperLineModels(), yTitle: view.title, points: studyPoints()
    });
    renderLegend();
    renderFlags($('flags'), [...rangeNotes.values()].map((text) => ({ text, sourceIds: [] }))
        .concat(Engine.studiedRangeFlags(phases), horizonFlags()));
    renderCards($('cards'), {
        summary: band.summary, baseline: base, totalGrams: Engine.totalGrams(phases), target: targetRise(),
        washoutDays: band.lastDay - band.stopDay, muscle: muscle(), stopWeeks: band.stopDay / 7, bodyMassKg: bodyMassKg()
    });
    renderEdgeTable($('edgeTable'), edgeRows(view), view.unit);
    renderServings($('servingTable'), phases, bodyMassKg());
    renderFate($('fate'), { summary: band.summary, muscle: muscle(), totalGrams: Engine.totalGrams(phases), anchors, baseline: base,
        doseGPerDay: Math.max(0, ...phases.map((p) => p.doseGPerDay)) });
    renderMixNote($('mixNote'), phases);
    renderCostCards();
    renderGoal($('goalResult'), { ...goal, observations: LOADING_OBSERVATIONS });
    $('useGoalDose').disabled = !Engine.goalDoseUsable(goal.result);
    if (tipDay !== null) showTip(tipDay);
}

// The preset's own measured means, drawn in the rise and total views only: they
// are rises over each study's own baseline, so a percent of yours would mislead.
// A point is drawn only when the protocol on screen gave the same dose on every
// day up to that measurement.
function studyPoints() {
    const preset = PROTOCOL_PRESETS.find((p) => p.id === state.presetId);
    if (!preset || !preset.reported || state.view === 'percent') return [];
    const { schedule } = Engine.buildSchedule(band.phases);
    const doseAt = (sch, t) => (sch.find(([a, b]) => t >= a && t < b) || [0, 0, 0])[2];
    return LOADING_OBSERVATIONS
        .filter((o) => preset.sourceIds.includes(o.sourceId))
        .filter((o) => Array.from({ length: Math.ceil(o.day) }, (_, d) => d + 0.5)
            .every((t) => Math.abs(doseAt(o.schedule, t) - doseAt(schedule, t)) < 1e-9))
        .map((o) => ({ day: o.day, rise: o.rise, label: `${o.arm}, day ${o.day}: measured ${o.rise} mmol/kg dm (${o.method})` }));
}

function horizonFlags() {
    const hz = band.horizon;
    const flags = [];
    if (hz.dose === 0) return [{ text: 'No beta-alanine is taken in this protocol, so there is nothing to show.', sourceIds: [] }];
    const several = hz.runs.length > 1;
    for (const run of hz.runs) {
        if (run.coveredUntil >= run.end) continue;
        const longest = run.studies[0];
        const what = several ? `Dosing at ${fmt(run.dose, 1)} g/day` : 'Dosing';
        let text;
        if (longest) {
            text = `${what} runs past week ${fmt(run.coveredUntil / 7, 1)}, the longest study at a comparable dose. The shaded part of the band rests on that one study.`;
        } else if (run.before > 0) {
            text = `No study measured ${fmt(run.dose, 1)} g/day straight after ${fmt(run.before, 1)} g/day, so weeks ${fmt(run.start / 7, 1)} to ${fmt(run.end / 7, 1)} are shaded.`;
        } else {
            text = several
                ? `No study used a daily dose comparable to ${fmt(run.dose, 1)} g/day, so weeks ${fmt(run.start / 7, 1)} to ${fmt(run.end / 7, 1)} are shaded.`
                : 'No study used a comparable daily dose, so the whole dosing period is shaded.';
        }
        flags.push({ text, sourceIds: longest ? [longest.sourceId] : [] });
    }
    const followup = hz.washoutStudies[0];
    for (const [a, b] of hz.restGaps) {
        flags.push({ text: `This break runs past week ${fmt(a / 7, 1)}, longer after the last dose than any washout study followed people, so weeks ${fmt(a / 7, 1)} to ${fmt(b / 7, 1)} are shaded.`,
            sourceIds: followup ? [followup.sourceId] : [] });
    }
    return flags;
}

// Replace the protocol with the goal dose for the goal's length, in plain
// servings each under the likely tingling band.
function useGoalDose() {
    // Settle a recompute still waiting on the debounce, so a quick click uses what was typed.
    clearTimeout(pending);
    compute();
    render();
    if (!goal || !Engine.goalDoseUsable(goal.result)) return;
    const dose = Math.round(goal.result.p50 * 10) / 10;
    state.phases = [{ doseGPerDay: dose, servings: Engine.servingsUnderLikely(dose, bodyMassKg()), form: 'plain', value: goal.weeks, unit: 'weeks' }];
    markCustom();
    renderPhases();
    schedule();
}

function edgeRows(view) {
    // One row per day; the end of dosing names its day even when a phase also ends there.
    const rows = new Map();
    let t = 0;
    band.phases.forEach((p, i) => {
        t += p.days;
        if (p.days > 0 && t < band.lastDay) rows.set(t, `End of phase ${i + 1}`);
    });
    if (band.supplementDays > 0) rows.set(band.stopDay, 'End of dosing');
    if (band.lastDay > band.stopDay) rows.set(band.lastDay, 'End of washout shown');
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([day, label]) => ({ label, day, ...dayDetail(day, view) }));
}

function dayDetail(day, view) {
    const to = view.to;
    return {
        value: { p10: to(band.p10[day]), p50: to(band.p50[day]), p90: to(band.p90[day]) },
        low: attributeEdge(band, day, 0.1),
        high: attributeEdge(band, day, 0.9),
        evidence: Engine.studiesCoveringDay(band.horizon, day)
    };
}

function renderLegend() {
    const node = clear($('legend'));
    const item = (children) => h('span', { class: 'legend-item' }, children);
    node.appendChild(h('span', { class: 'legend-group' }, [
        item([h('span', { class: 'swatch median-swatch' }), 'Middle (median)']),
        item([h('span', { class: 'swatch band-swatch' }), '10th to 90th percentile']),
        item([h('span', { class: 'swatch normal-swatch' }), 'Normal month-to-month variation (', sourceLink('rezende2020'), ')'])]));
    const group = (title, items, role) => {
        const g = h('span', { class: 'legend-group' }, [h('span', { class: 'legend-title', text: title })]);
        items.forEach((sourceId, i) => {
            const key = `${role}:${sourceId}`;
            const box = h('input', { type: 'checkbox', id: `line-${role}-${sourceId}` });
            box.checked = state.paperLines.includes(key);
            box.addEventListener('change', () => {
                state.paperLines = box.checked ? state.paperLines.concat(key) : state.paperLines.filter((k) => k !== key);
                render();
                persistLast();
            });
            g.appendChild(h('label', { for: box.id }, [box, h('span', { class: `swatch paper-${(i % 6) + 1}` }), sourceLink(sourceId)]));
        });
        return g;
    };
    const points = studyPoints();
    if (points.length) {
        const preset = PROTOCOL_PRESETS.find((p) => p.id === state.presetId);
        node.appendChild(h('span', { class: 'legend-group' }, [item([h('span', { class: 'swatch point-swatch' }), 'Measured means, ', ...linkList(preset.sourceIds)])]));
    }
    node.appendChild(group('Loading study lines:', LOADING.map((p) => p.sourceId), 'loading'));
    node.appendChild(group('Washout study lines (dashed):', WASHOUT_RATES.map((w) => w.sourceId), 'washout'));
}

function renderCostCards() {
    const tiers = {};
    for (const [name, rows] of Object.entries(PRICE_TIERS)) {
        const r = Engine.tierPerGram(rows);
        if (r) tiers[name] = r;
    }
    const price = num(state.ownPrice, 0);
    const grams = num(state.ownGrams, 0);
    renderCosts($('costCards'), {
        tiers, own: price > 0 && grams > 0 ? price / grams : null, phases: band.phases,
        totalGrams: Engine.totalGrams(band.phases), riseAtStop: band.summary.riseAtStop ? band.summary.riseAtStop.p50 : 0
    });
}

// ---- Tooltip ----------------------------------------------------------------

function showTip(day) {
    if (!band || !chartScale) return;
    tipDay = Math.max(0, Math.min(band.lastDay, day));
    const view = VIEWS[state.view] || VIEWS.rise;
    const tip = $('chartTip');
    renderTip(tip, { day: tipDay, ...dayDetail(tipDay, view), unit: view.unit, individual: band.individual });
    tip.hidden = false;
    chartScale.showCursor(tipDay);
    const frac = chartScale.fractionAt(tipDay);
    const wrap = $('chartWrap').getBoundingClientRect();
    const left = frac * wrap.width;
    tip.style.left = `${Math.max(0, Math.min(wrap.width - tip.offsetWidth, left > wrap.width / 2 ? left - tip.offsetWidth - 12 : left + 12))}px`;
    tip.style.top = '12px';
}

function hideTip() {
    tipDay = null;
    $('chartTip').hidden = true;
    if (chartScale) chartScale.hideCursor();
}

function wireChart() {
    const svg = $('chart');
    const wrap = $('chartWrap');
    svg.addEventListener('pointermove', (e) => { if (chartScale) showTip(chartScale.dayAt(e.clientX)); });
    svg.addEventListener('click', (e) => { if (chartScale) showTip(chartScale.dayAt(e.clientX)); });
    wrap.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hideTip(); });
    svg.addEventListener('focus', () => showTip(tipDay === null ? (band ? band.stopDay : 0) : tipDay));
    svg.addEventListener('keydown', (e) => {
        if (!band) return;
        const step = e.shiftKey ? 7 : 1;
        if (e.key === 'ArrowRight') { showTip((tipDay ?? 0) + step); e.preventDefault(); }
        else if (e.key === 'ArrowLeft') { showTip((tipDay ?? 0) - step); e.preventDefault(); }
        else if (e.key === 'Home') { showTip(0); e.preventDefault(); }
        else if (e.key === 'End') { showTip(band.lastDay); e.preventDefault(); }
        else if (e.key === 'Escape') { hideTip(); }
    });
    svg.addEventListener('blur', (e) => { if (!wrap.contains(e.relatedTarget)) hideTip(); });
    svg.setAttribute('aria-describedby', 'edgeFold');
    let lastWidth = wrap.clientWidth;
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (wrap.clientWidth !== lastWidth) { lastWidth = wrap.clientWidth; render(); }
        }, 120);
    });
}

// ---- Storage ----------------------------------------------------------------

const STATE_KEYS = ['presetId', 'washoutWeeks', 'targetRise', 'massValue', 'massUnit', 'bodyFat', 'muscleMass', 'baselinePreset',
    'baselineValue', 'individual', 'view', 'ownPrice', 'ownGrams', 'goalRise', 'goalWeeks'];

function toFields() {
    const fields = {};
    for (const k of STATE_KEYS) fields[k] = typeof state[k] === 'boolean' ? state[k] : String(state[k] ?? '');
    // Compact, so four phases fit the store's 200-character field limit: dose|servings|form|length|unit;...
    fields.phases = state.phases.map((p) => [p.doseGPerDay, p.servings, p.form === 'sustained' ? 's' : 'p', p.value, p.unit === 'days' ? 'd' : 'w']
        .map((v) => String(v).replace(/[|;]/g, '').slice(0, 8)).join('|')).join(';');
    fields.paperLines = state.paperLines.join(',').slice(0, 200);
    return fields;
}

/** Rebuild state from stored fields; anything unreadable keeps the default. */
function fromFields(fields) {
    const next = defaultState();
    if (!fields || typeof fields !== 'object') return next;
    for (const k of STATE_KEYS) {
        if (fields[k] === undefined) continue;
        next[k] = k === 'individual' ? fields[k] === true : String(fields[k]);
    }
    const phases = typeof fields.phases === 'string' && fields.phases ? fields.phases.split(';').map((part) => part.split('|')) : [];
    if (phases.length >= 1 && phases.length <= Engine.MAX_PHASES && phases.every((p) => p.length === 5)) {
        next.phases = phases.map(([dose, servings, form, value, unit]) => ({
            doseGPerDay: dose, servings, form: form === 's' ? 'sustained' : 'plain', value, unit: unit === 'd' ? 'days' : 'weeks'
        }));
    }
    next.paperLines = typeof fields.paperLines === 'string' && fields.paperLines ? fields.paperLines.split(',') : [];
    if (!VIEWS[next.view]) next.view = 'rise';
    if (next.massUnit !== 'lb') next.massUnit = 'kg';
    return next;
}

function persistLast() {
    try { localStorage.setItem(LAST_KEY, JSON.stringify(toFields())); } catch (e) { /* storage refused: next visit starts at the default */ }
}

function loadLast() {
    try {
        const text = localStorage.getItem(LAST_KEY);
        if (text) state = fromFields(JSON.parse(text));
    } catch (e) {
        state = defaultState();
    }
}

function storage() {
    try { return window.localStorage; } catch (e) { return null; }
}

function renderSaved(selectId) {
    const sel = clear($('savedList'));
    const s = storage();
    const { store: st } = s ? store.loadStore(s) : { store: store.emptyStore() };
    if (!st.projects.length) sel.appendChild(h('option', { value: '', text: 'Nothing saved yet' }));
    for (const p of st.projects) sel.appendChild(h('option', { value: p.id, text: p.name }));
    if (selectId) sel.value = selectId;
    $('openProtocol').disabled = !st.projects.length;
    $('deleteProtocol').disabled = !st.projects.length;
}

function wireSaved() {
    const status = (text) => { $('saveStatus').textContent = text; };
    $('saveProtocol').addEventListener('click', () => {
        const s = storage();
        if (!s) return status('This browser refused storage, so nothing can be saved here.');
        const { store: st } = store.loadStore(s);
        const name = store.uniqueName(st, store.cleanName($('saveName').value, store.nextName(st, 'Protocol')));
        const project = store.addProject(st, name, { text: '', fields: toFields() }, Date.now());
        if (!project) return status(`There are already ${store.MAX_PROJECTS} saved protocols. Delete one first.`);
        if (!store.persistStore(s, st)) return status('The browser refused to save. Storage may be full.');
        renderSaved(project.id);
        status(`Saved as "${name}".`);
    });
    $('openProtocol').addEventListener('click', () => {
        const s = storage();
        if (!s) return;
        const { store: st } = store.loadStore(s);
        const project = store.getProject(st, $('savedList').value);
        if (!project) return;
        state = fromFields(project.saved.fields);
        syncInputs();
        schedule();
        status(`Opened "${project.name}".`);
    });
    $('deleteProtocol').addEventListener('click', () => {
        const s = storage();
        if (!s) return;
        const { store: st } = store.loadStore(s);
        const project = store.getProject(st, $('savedList').value);
        if (!project) return;
        store.removeProject(st, project.id);
        store.persistStore(s, st);
        renderSaved();
        status(`Deleted "${project.name}".`);
    });
    $('resetAll').addEventListener('click', () => {
        state = defaultState();
        syncInputs();
        schedule();
        status('Back to the first-visit default.');
    });
}

// ---- Start ------------------------------------------------------------------

let anchors = [];

window.BetaAlanine = {
    ...Engine, runBand, attributeEdge, paperMedian, loadingPapers, doseForGoal, personCv, computeChecks, turnoverFigures,
    data: { SOURCES, CLAIMS, LOADING_OBSERVATIONS, WASHOUT_RATES, PRICE_TIERS, WET_TO_DRY, SOLUBILITY },
    presets: { PROTOCOL_PRESETS, BASELINE_PRESETS },
    getState: () => JSON.parse(JSON.stringify(state)),
    lastBand: null
};

// The person factor's CV and the 4-week band with it off and on, for the audit trail.
function personFigures() {
    // Keyed on LOADING, as compute() is, so the CV band runs once per page.
    const { mean, sd, cv } = personCv(LOADING, WASHOUT_RATES);
    const at = (individual) => {
        const b = runBand({ phases: [RESPONSE_PROTOCOL], washoutDays: 0, loadingPapers: LOADING, washouts: WASHOUT_RATES, individual });
        const d = RESPONSE_PROTOCOL.days;
        return { p10: b.p10[d], p50: b.p50[d], p90: b.p90[d] };
    };
    return { mean, sd, cv, off: at(false), on: at(true) };
}

function init() {
    buildPresetSelect();
    loadLast();
    syncInputs();
    wireInputs();
    wireChart();
    wireSaved();
    renderSaved();
    anchors = literatureAnchors({ observations: LOADING_OBSERVATIONS, washouts: WASHOUT_RATES, claims: CLAIMS });
    window.BetaAlanine.anchors = anchors;
    renderSafety($('safetySentence'));
    renderFoodNote($('foodNote'));
    renderAudit($('audit'), anchors, personFigures());
    renderSources($('sourceList'));
    compute();
    render();
    window.BetaAlanine.ready = true;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
