// DOM controller for the beam deflection tool.
//
// This module owns every piece of DOM wiring. Unit conversion is delegated to
// units.js but still happens only here, at the boundary: the engine is strict SI
// and knows nothing about the page. Mixed units are the classic way a beam
// calculator returns a confident answer that is wrong by orders of magnitude, so
// keeping every conversion in one layer is the mitigation.
//
// The engine is re-exposed on window.BeamDeflection so the Playwright spec can
// drive the math directly instead of scraping rendered text.

import {
    solve,
    closedForm,
    stressCheck,
    deflectionRatio,
    selfWeightUDL,
    sampleCurve,
    normalizeOffCenter,
    SUPPORTS,
    LOAD_TYPES,
    STANDARD_POINT_RATIO,
    DEFLECTION_LIMITS,
    PROPPED_UDL_COEFF,
    PROPPED_UDL_X_RATIO,
    PROPPED_CENTER_COEFF,
    PROPPED_CENTER_X_RATIO,
    G,
} from './beam-engine.js';
import { SECTIONS, sectionProperties } from './sections.js';
import { beamDiagram, SUPPORT_LABELS, SUPPORT_SUBLABELS } from './diagrams.js';
import {
    MATERIALS,
    MATERIALS_BY_ID,
    CATEGORY_WARNINGS,
    materialsByCategory,
    unreviewedCount,
} from './materials.js';
import { UNITS, UNIT_SYSTEMS, toSI, fromSI, unitLabel } from './units.js';
import { verifyAll, verifyCase, feSolveBeam, DEFAULT_ELEMENTS, TOLERANCE } from './fe-verify.js';
import { PRESETS, PRESETS_BY_ID } from './presets.js';

const state = {
    support: 'simple',
    loadType: 'point-standard',
    sectionType: 'rect',
    materialId: 'steel-a36',
    units: 'si',
    limitId: 'L360',
    selfWeight: false,
    loadEntry: 'force',
};

const el = (id) => document.getElementById(id);
const U = () => state.units;

// Formats a number for display: fixed decimals for ordinary magnitudes, and
// scientific notation once the value stops being readable either way.
function fmt(value, decimals = 3) {
    if (value === null || value === undefined || !Number.isFinite(value)) return '--';
    const abs = Math.abs(value);
    if (abs === 0) return '0';
    if (abs < 1e-4 || abs >= 1e7) return value.toExponential(3);
    const fixed = value.toFixed(decimals);
    // Trailing zeros go only from the fractional part. Stripping them from a
    // whole number turns 360 into 36, which is not a rounding difference, it is
    // a different number.
    if (!fixed.includes('.')) return fixed;
    return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

function readNumber(id) {
    const node = el(id);
    if (!node) return NaN;
    const raw = node.value.trim();
    if (raw === '') return NaN;
    return Number(raw);
}

const currentMaterial = () => MATERIALS_BY_ID[state.materialId] || null;

// Both distributed cases carry w in force per unit length, so magnitude units,
// labels and the self-weight rules key off this instead of testing for 'udl'.
const isDistributed = () => state.loadType === 'udl' || state.loadType === 'udl-partial';

// The quantity the magnitude field is currently expressed in. Mass entry is a
// display convenience: it converts through standard gravity in units.js, and
// the engine still receives newtons.
function magnitudeQuantity() {
    const mass = state.loadEntry === 'mass';
    if (isDistributed()) return mass ? 'distMass' : 'distLoad';
    return mass ? 'pointMass' : 'pointLoad';
}

// ---------------------------------------------------------------------------
// Support case selector. Real radio inputs inside labels, so keyboard and
// screen-reader operation come for free rather than being retrofitted.
// ---------------------------------------------------------------------------

function buildSupportCards() {
    const host = el('supportCards');
    host.replaceChildren();
    for (const support of SUPPORTS) {
        const label = document.createElement('label');
        label.className = 'support-card';
        label.dataset.support = support;

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'support';
        input.value = support;
        input.checked = support === state.support;
        input.addEventListener('change', () => {
            state.support = support;
            syncSupportSelection();
            clearActivePreset();
            recompute();
        });

        const figure = document.createElement('div');
        figure.className = 'support-figure';
        // The diagram sits inside the radio's own label, and its aria-label
        // repeats what the card's text already says. One announcement of the
        // case is enough, so the drawing is decorative here. The SVG keeps its
        // title and role for anywhere it stands alone.
        figure.setAttribute('aria-hidden', 'true');

        const name = document.createElement('div');
        name.className = 'support-name';
        name.textContent = SUPPORT_LABELS[support];

        const sub = document.createElement('div');
        sub.className = 'support-sub';
        sub.textContent = SUPPORT_SUBLABELS[support];

        const value = document.createElement('div');
        value.className = 'support-value';
        value.dataset.supportValue = support;

        label.append(input, figure, name, sub, value);
        host.append(label);
    }
}

function syncSupportSelection() {
    for (const card of document.querySelectorAll('.support-card')) {
        card.classList.toggle('selected', card.dataset.support === state.support);
        card.querySelector('input').checked = card.dataset.support === state.support;
    }
}

function redrawDiagrams(aFrac, cFrac) {
    for (const card of document.querySelectorAll('.support-card')) {
        const figure = card.querySelector('.support-figure');
        figure.innerHTML = beamDiagram(card.dataset.support, state.loadType, aFrac, cFrac);
    }
}

// ---------------------------------------------------------------------------
// Worked examples
//
// A preset overwrites the whole form, including the unit system, so it is
// written in one direction only: state first, then the controls that are
// rebuilt from state, then the raw field values. Touching any input afterwards
// clears the active mark, because the form no longer matches the example.
// ---------------------------------------------------------------------------

let activePreset = null;

function buildPresets() {
    const host = el('presets');
    host.replaceChildren();
    for (const preset of PRESETS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'preset-btn';
        btn.dataset.preset = preset.id;
        btn.setAttribute('aria-pressed', 'false');

        const name = document.createElement('span');
        name.className = 'preset-name';
        name.textContent = preset.name;

        const summary = document.createElement('span');
        summary.className = 'preset-summary';
        summary.textContent = preset.summary;

        btn.append(name, summary);
        btn.addEventListener('click', () => applyPreset(preset.id));
        host.append(btn);
    }
}

function syncPresetButtons() {
    for (const btn of document.querySelectorAll('[data-preset]')) {
        btn.setAttribute('aria-pressed', String(btn.dataset.preset === activePreset));
    }
    const note = el('presetNote');
    const preset = activePreset ? PRESETS_BY_ID[activePreset] : null;
    note.textContent = preset ? preset.teaches : '';
}

function applyPreset(id) {
    const preset = PRESETS_BY_ID[id];
    if (!preset) return;

    state.units = preset.units;
    el('unitSystem').value = preset.units;
    Object.assign(state, preset.state);

    el('loadType').value = state.loadType;
    el('sectionType').value = state.sectionType;
    el('material').value = state.materialId;
    el('limitSelect').value = state.limitId;
    el('selfWeight').checked = state.selfWeight;

    syncSupportSelection();
    buildSectionFields();
    applyMaterialToInputs();
    syncUnitLabels();
    syncLimitInputs();

    for (const [key, value] of Object.entries(preset.section)) {
        const input = el(`sec-${key}`);
        if (input) input.value = String(value);
    }
    for (const [id_, value] of Object.entries(preset.fields)) {
        const input = el(id_);
        if (input) input.value = String(value);
    }

    activePreset = preset.id;
    syncPresetButtons();
    recompute();
}

function clearActivePreset() {
    if (activePreset === null) return;
    activePreset = null;
    syncPresetButtons();
}

// ---------------------------------------------------------------------------
// Material selector
// ---------------------------------------------------------------------------

function buildMaterialSelect() {
    const select = el('material');
    select.replaceChildren();
    for (const group of materialsByCategory()) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = group.cat;
        for (const m of group.items) {
            const option = document.createElement('option');
            option.value = m.id;
            option.textContent = m.name;
            optgroup.append(option);
        }
        select.append(optgroup);
    }
    select.value = state.materialId;
}

// Pushes the selected material's modulus into the editable override field.
function applyMaterialToInputs() {
    const m = currentMaterial();
    if (!m) return;
    el('modulus').value = Number(fromSI(m.E, 'modulus', U()).toPrecision(6));
}

function renderMaterialFacts() {
    const host = el('materialFacts');
    host.replaceChildren();
    const m = currentMaterial();
    if (!m) return;

    const strengthLabel = {
        yield: 'Yield strength',
        rupture: 'Modulus of rupture',
        none: 'Strength',
    }[m.strength.kind];

    host.append(row(
        strengthLabel,
        m.strength.value === null
            ? 'not defined for this material'
            : `${fmt(fromSI(m.strength.value, 'strength', U()), 1)} ${unitLabel('strength', U())}`,
    ));
    host.append(row('Density', `${fmt(fromSI(m.rho, 'density', U()), 0)} ${unitLabel('density', U())}`));
    if (m.E_range) {
        host.append(row(
            'Published E range',
            `${fmt(fromSI(m.E_range[0], 'modulus', U()), 1)} to ${fmt(fromSI(m.E_range[1], 'modulus', U()), 1)} ${unitLabel('modulus', U())}`,
        ));
    }

    const src = document.createElement('p');
    src.className = 'material-source';
    src.textContent = `Source: ${m.source}`;
    host.append(src);

    if (m.notes) {
        const note = document.createElement('p');
        note.className = 'material-source';
        note.textContent = m.notes;
        host.append(note);
    }
    if (!m.reviewed) {
        const gate = document.createElement('p');
        gate.className = 'material-unreviewed';
        gate.textContent = 'This value has not been signed off against its source yet. Treat it as provisional.';
        host.append(gate);
    }
}

// ---------------------------------------------------------------------------
// Section inputs, rebuilt when the section type or unit system changes.
// ---------------------------------------------------------------------------

function buildSectionFields(keepValues = false) {
    const host = el('sectionFields');
    const previous = {};
    if (keepValues) {
        for (const input of document.querySelectorAll('[data-section-field]')) {
            previous[input.dataset.sectionField] = input.value;
        }
    }
    host.replaceChildren();
    for (const field of SECTIONS[state.sectionType].fields) {
        const group = document.createElement('div');
        group.className = 'input-group';

        const inputId = `sec-${field.key}`;
        const label = document.createElement('label');
        label.setAttribute('for', inputId);
        label.textContent = `${field.label} (${unitLabel(field.quantity, U())})`;

        // `nominal` is quoted in display-SI units, so it goes through SI to reach
        // whatever the active system is.
        const nominalSI = toSI(field.nominal, field.quantity, 'si');
        const nominal = Number(fromSI(nominalSI, field.quantity, U()).toPrecision(6));

        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'main-input';
        input.id = inputId;
        input.dataset.sectionField = field.key;
        input.dataset.quantity = field.quantity;
        input.placeholder = String(nominal);
        input.value = keepValues && previous[field.key] !== undefined
            ? previous[field.key]
            : (field.optional ? '' : String(nominal));
        input.step = 'any';
        input.min = '0';
        input.addEventListener('input', () => {
            clearActivePreset();
            recompute();
        });

        group.append(label, input);
        host.append(group);
    }
}

// Reads the section inputs and converts them into the SI the engine expects.
function readSection() {
    const dims = {};
    for (const input of document.querySelectorAll('[data-section-field]')) {
        const raw = input.value.trim();
        if (raw === '') continue;
        const value = Number(raw);
        dims[input.dataset.sectionField] = Number.isFinite(value)
            ? toSI(value, input.dataset.quantity, U())
            : NaN;
    }
    return sectionProperties(state.sectionType, dims);
}

// ---------------------------------------------------------------------------
// Unit system. Switching converts every field so the physical beam is unchanged.
// ---------------------------------------------------------------------------

const CONVERTIBLE_FIELDS = [
    ['span', 'span'],
    ['modulus', 'modulus'],
    ['loadPos', 'span'],
    ['loadLength', 'span'],
];

function switchUnits(next) {
    if (!UNIT_SYSTEMS.includes(next) || next === state.units) return;
    const from = state.units;

    const carried = [...CONVERTIBLE_FIELDS, ['loadMagnitude', magnitudeQuantity()]]
        .map(([id, quantity]) => {
            const value = readNumber(id);
            return [id, Number.isFinite(value) ? toSI(value, quantity, from) : NaN, quantity];
        });
    const sectionCarried = [...document.querySelectorAll('[data-section-field]')].map((input) => {
        const value = Number(input.value.trim());
        return [input, input.value.trim() === '' || !Number.isFinite(value)
            ? null
            : toSI(value, input.dataset.quantity, from)];
    });

    state.units = next;

    for (const [id, si, quantity] of carried) {
        if (Number.isFinite(si)) el(id).value = Number(fromSI(si, quantity, next).toPrecision(6));
    }
    buildSectionFields(true);
    for (const [input, si] of sectionCarried) {
        const live = el(input.id);
        if (!live) continue;
        live.value = si === null ? '' : Number(fromSI(si, live.dataset.quantity, next).toPrecision(6));
    }
    syncUnitLabels();
    recompute();
}

function syncUnitLabels() {
    el('spanLabel').textContent = `Span L (${unitLabel('span', U())})`;
    el('modulusLabel').textContent = `Elastic modulus E (${unitLabel('modulus', U())})`;
    el('loadLengthLabel').textContent = `Loaded length c (${unitLabel('span', U())})`;
    syncLoadInputs();
}

// ---------------------------------------------------------------------------
// Load inputs
// ---------------------------------------------------------------------------

function syncLoadInputs() {
    const isUDL = isDistributed();
    const isPartial = state.loadType === 'udl-partial';
    const isOffCenter = state.loadType === 'point-at';
    el('loadPosGroup').hidden = !isOffCenter && !isPartial;
    el('loadLengthGroup').hidden = !isPartial;
    el('loadPosLabel').textContent = isPartial
        ? `Load starts at a (${unitLabel('span', U())})`
        : `Load position a from the left end (${unitLabel('span', U())})`;
    const mass = state.loadEntry === 'mass';
    const q = magnitudeQuantity();
    el('loadMagnitudeLabel').textContent = isUDL
        ? `Distributed load ${mass ? 'mass' : 'w'} (${unitLabel(q, U())})`
        : `Point load ${mass ? 'mass' : 'P'} (${unitLabel(q, U())})`;
    const massNote = el('massNote');
    massNote.hidden = !mass;
    if (mass) {
        massNote.textContent = U() === 'si'
            ? `Converted to force at standard gravity, so 1 kg is ${G.toFixed(4)} N. The engine only ever sees force.`
            : 'Converted to force at standard gravity. A pound mass weighs a pound force, so the number does not change in US units.';
    }

    const standardNote = el('standardLoadNote');
    if (state.loadType === 'point-standard') {
        standardNote.hidden = false;
        standardNote.textContent = state.support === 'cantilever'
            ? 'Load sits at the free end, the standard cantilever case.'
            : 'Load sits at midspan.';
    } else if (isPartial) {
        standardNote.hidden = false;
        standardNote.textContent = 'The load covers only the length entered, starting from a. Set a to 0 and the length to the full span to get the ordinary uniformly distributed case.';
    } else {
        standardNote.hidden = true;
    }

    // Self-weight is a distributed load, so on a point-load case adding it would
    // make the problem a superposition of two load types. Superposition is out of
    // scope, so the option is disabled with the reason rather than hidden.
    const checkbox = el('selfWeight');
    const note = el('selfWeightNote');
    const section = readSection();
    const hasArea = section.ok && section.A !== null && section.A > 0;
    if (isPartial) {
        checkbox.disabled = true;
        checkbox.checked = false;
        state.selfWeight = false;
        note.textContent = 'Self-weight acts over the whole span while this load covers only part of it, so adding the two is a superposition of two different distributed loads. That is out of scope here, so add the self-weight into the applied load yourself if it matters.';
    } else if (!isUDL) {
        checkbox.disabled = true;
        checkbox.checked = false;
        state.selfWeight = false;
        note.textContent = 'Self-weight is a distributed load. Combining it with a point load needs superposition, which this tool does not do, so it is available on the full-span distributed case only.';
    } else if (!hasArea) {
        checkbox.disabled = true;
        checkbox.checked = false;
        state.selfWeight = false;
        note.textContent = 'Self-weight needs a cross-sectional area. The custom section does not supply one, so enter the weight in the distributed load instead.';
    } else {
        checkbox.disabled = false;
        note.textContent = 'Adds rho x A x g to the distributed load.';
    }
}

function syncLimitInputs() {
    el('customLimitGroup').hidden = state.limitId !== 'custom';
    const limit = DEFLECTION_LIMITS.find((l) => l.id === state.limitId);
    el('limitNote').textContent = limit ? limit.use : '';
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function showError(message) {
    const banner = el('errorBanner');
    banner.textContent = message;
    banner.hidden = false;
    el('results').hidden = true;
    // The banner is role="alert", so it speaks for itself. Clear the summary so
    // a stale result is not still being announced next to a live error.
    el('resultsStatus').textContent = '';
    // The per-case numbers on the selector cards belong to the beam that was
    // last valid. Leaving them up next to an error message reads as though the
    // rejected input still produced an answer, so they go too.
    for (const node of document.querySelectorAll('[data-support-value]')) {
        node.textContent = '';
    }
}

function clearError() {
    el('errorBanner').hidden = true;
    el('results').hidden = false;
}

// One spoken line per recompute. Marking the whole results panel as a live
// region would re-read every reaction and warning on each keystroke, which is
// unusable; this says the thing the user changed an input to find out.
function announceResult(result, ratio) {
    const parts = [
        `Maximum deflection ${fmt(fromSI(result.deltaMax, 'deflection', U()), 4)} ${unitLabel('deflection', U())}`,
        `at ${fmt(fromSI(result.xMax, 'span', U()), 3)} ${unitLabel('span', U())} from the left end`,
    ];
    if (ratio && Number.isFinite(ratio.ratio)) {
        parts.push(`span over deflection L / ${fmt(ratio.ratio, 0)}`);
        if (ratio.pass !== null) parts.push(ratio.pass ? 'within the limit' : 'over the limit');
    }
    el('resultsStatus').textContent = `${parts.join(', ')}.`;
}

function row(label, value, extra) {
    const div = document.createElement('div');
    div.className = 'result-row';
    const l = document.createElement('span');
    l.className = 'result-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'result-value';
    v.textContent = value;
    div.append(l, v);
    if (extra) {
        const e = document.createElement('span');
        e.className = 'result-note';
        e.textContent = extra;
        div.append(e);
    }
    return div;
}

function badge(text, kind) {
    const span = document.createElement('span');
    span.className = `badge badge-${kind}`;
    span.textContent = text;
    return span;
}

function warningNode(w) {
    const item = document.createElement('div');
    item.className = `warning warning-${w.severity}`;
    item.textContent = w.text;
    return item;
}

function renderSectionProps(section) {
    const host = el('sectionProps');
    host.replaceChildren();
    if (!section.ok) {
        host.append(row('Section', section.error));
        return;
    }
    if (section.A !== null) {
        host.append(row('Area A', `${fmt(fromSI(section.A, 'area', U()), 1)} ${unitLabel('area', U())}`));
    }
    host.append(row('Second moment I', `${fmt(fromSI(section.I, 'secondMoment', U()), 1)} ${unitLabel('secondMoment', U())}`));
    host.append(row('Extreme fibre c', `${fmt(fromSI(section.c, 'sectionDim', U()), 2)} ${unitLabel('sectionDim', U())}`));
    host.append(row('Section modulus S', `${fmt(fromSI(section.S, 'sectionModulus', U()), 1)} ${unitLabel('sectionModulus', U())}`));
}

// Which result sections the user has opened. The results panel is rebuilt from
// scratch on every keystroke, so without this a section would slam shut the
// moment anyone edited a field while reading it.
const openFolds = new Set();

// Everything past the deflection is folded away by default. The headline
// number is what most people opened the tool for; the moment, the stress and
// the comparison all matter, but burying the answer under them helps nobody.
function foldSection(titleText) {
    const details = document.createElement('details');
    details.className = 'result-box result-fold';
    details.open = openFolds.has(titleText);
    details.addEventListener('toggle', () => {
        if (details.open) openFolds.add(titleText);
        else openFolds.delete(titleText);
    });
    const summary = document.createElement('summary');
    summary.className = 'result-subtitle';
    summary.textContent = titleText;
    const body = document.createElement('div');
    body.className = 'result-fold-body';
    details.append(summary, body);
    return { details, body };
}

// Same load, same section, all four boundary conditions. This is the number the
// tool exists to make obvious: pinned-pinned and fixed-fixed are both "supported
// on both sides" and they are five times apart under a uniform load.
function renderComparison(baseInput, selected) {
    const { details, body: host } = foldSection('Same beam, other boundary conditions');

    const rows = [];
    for (const support of SUPPORTS) {
        const r = solve({ ...baseInput, support });
        if (r.ok) rows.push({ support, deltaMax: r.deltaMax });
    }
    const worst = Math.max(...rows.map((r) => r.deltaMax));
    for (const r of rows) {
        const line = document.createElement('div');
        line.className = 'compare-row';
        if (r.support === state.support) line.classList.add('current');

        const name = document.createElement('span');
        name.className = 'compare-name';
        name.textContent = SUPPORT_LABELS[r.support];

        const bar = document.createElement('span');
        bar.className = 'compare-bar';
        const fill = document.createElement('span');
        fill.className = 'compare-fill';
        // Width is the honest ratio, floored so a very stiff case stays visible
        // and capped so nothing can paint outside its own track.
        fill.style.width = `${Math.min(100, Math.max(2, (r.deltaMax / worst) * 100))}%`;
        bar.append(fill);

        const value = document.createElement('span');
        value.className = 'compare-value';
        value.textContent = `${fmt(fromSI(r.deltaMax, 'deflection', U()), 3)} ${unitLabel('deflection', U())}`;

        const ratio = document.createElement('span');
        ratio.className = 'compare-ratio';
        ratio.textContent = selected.deltaMax > 0
            ? `${fmt(r.deltaMax / selected.deltaMax, 2)}x`
            : '--';

        line.append(name, bar, value, ratio);
        host.append(line);
    }
    const note = document.createElement('p');
    note.className = 'result-note';
    note.textContent = 'Ratios are against the selected case. Both "supported on both sides" options are in this list.';
    host.append(note);
    return details;
}

function renderStress(result, section, material) {
    const { details, body: host } = foldSection('Bending stress');

    // Blank, zero and negative all mean the same thing here, which is that no
    // factor was given. Reading it once and coercing once keeps the number the
    // allowable is divided by identical to the number reported beside it: the
    // two used to be computed separately, so a negative entry divided by 1 and
    // then labelled itself "safety factor 0".
    const entered = readNumber('safetyFactor');
    const safetyFactor = Number.isFinite(entered) && entered > 0 ? entered : 1;
    const check = stressCheck({
        MmaxAbs: result.MmaxAbs,
        S: section.S,
        strength: material ? material.strength : { kind: 'none', value: null },
        safetyFactor,
    });
    if (!check.ok) {
        host.append(row('Stress', check.error));
        return { node: details, warnings: [] };
    }

    host.append(row(
        'Maximum bending stress',
        `${fmt(fromSI(check.sigma, 'stress', U()), 2)} ${unitLabel('stress', U())}`,
        'sigma = |M| / S at the extreme fibre',
    ));

    if (check.skipped) {
        const skip = document.createElement('p');
        skip.className = 'result-note';
        skip.textContent = check.reason;
        host.append(skip);
        return { node: details, warnings: [] };
    }

    host.append(row(
        check.kind === 'yield' ? 'Allowable (yield / SF)' : 'Allowable (rupture / SF)',
        `${fmt(fromSI(check.allowable, 'strength', U()), 2)} ${unitLabel('strength', U())}`,
        safetyFactor === 1 ? 'safety factor 1, so this is the raw strength' : `safety factor ${fmt(safetyFactor, 2)}`,
    ));

    const utilRow = row('Utilization', `${fmt(check.utilization * 100, 1)} %`);
    utilRow.append(badge(check.pass ? 'within' : 'over', check.pass ? 'pass' : 'fail'));
    host.append(utilRow);

    // A ductile utilization bar is meaningful against a yield strength and
    // misleading against a rupture strength, so brittle rows do not get one.
    if (check.showUtilizationBar) {
        const bar = document.createElement('div');
        bar.className = 'util-bar';
        const fill = document.createElement('div');
        fill.className = check.pass ? 'util-fill' : 'util-fill over';
        fill.style.width = `${Math.min(100, check.utilization * 100)}%`;
        bar.append(fill);
        host.append(bar);
    }
    return { node: details, warnings: check.warnings || [] };
}

function renderGate(material) {
    const host = el('results');
    host.replaceChildren();
    const box = document.createElement('div');
    box.className = 'gate-box';
    const title = document.createElement('strong');
    title.textContent = `${material.name} is not computed here.`;
    const body = document.createElement('p');
    body.textContent = material.gateReason;
    box.append(title, body);
    host.append(box);
}

function renderResults(result, section, material, baseInput) {
    const host = el('results');
    host.replaceChildren();

    const deflU = unitLabel('deflection', U());
    const deltaMaxDisp = fromSI(result.deltaMax, 'deflection', U());
    const deltaMidDisp = fromSI(result.deltaMid, 'deflection', U());

    const primary = document.createElement('div');
    primary.className = 'result-box primary';
    primary.append(row(
        'Maximum deflection',
        `${fmt(deltaMaxDisp, 4)} ${deflU}`,
        result.degenerate
            ? 'no bending'
            : `at x = ${fmt(fromSI(result.xMax, 'span', U()), 4)} ${unitLabel('span', U())} from the left end`,
    ));

    // Midspan is not always the worst case. Show it whenever the two differ by
    // more than a rounding threshold, labelled so they cannot be confused.
    const differs = Math.abs(deltaMaxDisp - deltaMidDisp) > Math.max(1e-6, Math.abs(deltaMaxDisp) * 1e-9);
    if (differs) {
        primary.append(row(
            'Deflection at midspan',
            `${fmt(deltaMidDisp, 4)} ${deflU}`,
            'not the maximum for this case',
        ));
    }

    const limit = DEFLECTION_LIMITS.find((l) => l.id === state.limitId);
    const limitRatio = state.limitId === 'custom' ? readNumber('customLimit') : limit.ratio;
    const ratio = deflectionRatio(result.deltaMax, result.L, limitRatio);
    if (ratio) {
        const ratioRow = row(
            'Span / deflection',
            Number.isFinite(ratio.ratio) ? `L / ${fmt(ratio.ratio, 0)}` : 'no deflection',
            ratio.limit ? `limit L / ${fmt(ratio.limit, 0)}: ${limit.use}` : 'no limit selected',
        );
        if (ratio.pass !== null) {
            ratioRow.append(badge(ratio.pass ? 'pass' : 'fail', ratio.pass ? 'pass' : 'fail'));
        }
        primary.append(ratioRow);
    }
    host.append(primary);
    announceResult(result, ratio);

    const { details: forcesFold, body: forces } = foldSection('Maximum bending moment and reactions');
    const hogging = result.MmaxAbs < 0;
    forces.append(row(
        'Maximum bending moment',
        `${fmt(fromSI(Math.abs(result.MmaxAbs), 'moment', U()), 4)} ${unitLabel('moment', U())}`,
        result.degenerate
            ? ''
            : `${hogging ? 'hogging' : 'sagging'}, at x = ${fmt(fromSI(result.MmaxAt, 'span', U()), 3)} ${unitLabel('span', U())}`,
    ));
    for (const r of result.reactions) {
        const parts = [`${fmt(fromSI(r.force, 'reaction', U()), 4)} ${unitLabel('reaction', U())}`];
        if (r.moment) {
            parts.push(`${fmt(fromSI(Math.abs(r.moment), 'moment', U()), 4)} ${unitLabel('moment', U())} ${r.moment < 0 ? 'hogging' : 'sagging'}`);
        }
        forces.append(row(r.label, parts.join('  |  ')));
    }
    host.append(forcesFold);

    const stress = renderStress(result, section, material);
    host.append(stress.node);

    host.append(renderComparison(baseInput, result));

    const warnings = [...result.warnings, ...stress.warnings];
    if (material && CATEGORY_WARNINGS[material.cat]) warnings.push(CATEGORY_WARNINGS[material.cat]);
    if (material && !material.reviewed) {
        warnings.push({
            id: 'material-unreviewed',
            severity: 'info',
            text: `Material properties are provisional: ${unreviewedCount()} of ${MATERIALS.length} rows in the library are still awaiting sign-off against their cited sources.`,
        });
    }
    if (warnings.length) {
        const warnBox = document.createElement('div');
        warnBox.className = 'warning-list';
        for (const w of warnings) warnBox.append(warningNode(w));
        host.append(warnBox);
    }

    const always = document.createElement('div');
    always.className = 'warning warning-always';
    always.textContent = 'Buckling and stability are never checked by this tool. A section can pass both the deflection and the stress check and still fail by buckling.';
    host.append(always);
}

// ---------------------------------------------------------------------------
// Independent verification, run from the sidebar button
// ---------------------------------------------------------------------------

function runVerification(currentInput) {
    const host = el('verifyOutput');
    host.replaceChildren();
    host.hidden = false;

    const sweep = verifyAll();
    const summary = document.createElement('div');
    summary.className = sweep.pass ? 'verify-result pass' : 'verify-result fail';
    summary.textContent = sweep.pass
        ? `All ${sweep.total} closed forms agree with the independent solve. Worst disagreement ${sweep.worstDeltaError.toExponential(2)} relative, against a ${TOLERANCE.delta.toExponential(0)} tolerance.`
        : `${sweep.failed.length} of ${sweep.total} cases disagree with the independent solve.`;
    host.append(summary);

    if (currentInput) {
        const single = verifyCase(currentInput);
        host.append(row(
            'This configuration',
            single.pass ? 'agrees' : 'disagrees',
            `closed form ${single.closedDelta.toExponential(6)} m against numerical ${single.numericDelta.toExponential(6)} m`,
        ));
    }

    const note = document.createElement('p');
    note.className = 'result-note';
    note.textContent = `${sweep.elements} Hermitian beam elements, banded solve. The check assembles and solves the beam numerically and shares no formula with the closed forms, so a mistyped coefficient fails here even when it is self-consistent. Both assume Euler-Bernoulli, so neither can see the neglect of shear deformation.`;
    host.append(note);

    if (!sweep.pass) {
        for (const f of sweep.failed.slice(0, 6)) {
            host.append(row(
                `${f.support} / ${f.loadType}`,
                `${(f.deltaError * 100).toFixed(4)} % off`,
                f.a === null || f.a === undefined ? '' : `a = ${fmt(f.a, 3)} m`,
            ));
        }
    }
}

// ---------------------------------------------------------------------------
// Main recompute path
// ---------------------------------------------------------------------------

let lastInput = null;

function recompute() {
    syncLoadInputs();
    syncLimitInputs();

    const L = toSI(readNumber('span'), 'span', U());
    const E = toSI(readNumber('modulus'), 'modulus', U());
    const aRaw = toSI(readNumber('loadPos'), 'span', U());
    const cRaw = toSI(readNumber('loadLength'), 'span', U());
    const magnitude = toSI(readNumber('loadMagnitude'), magnitudeQuantity(), U());

    const spanKnown = Number.isFinite(L) && L > 0;
    const aFrac = spanKnown && Number.isFinite(aRaw) ? aRaw / L : 0.5;
    const cFrac = spanKnown && Number.isFinite(cRaw) ? cRaw / L : 1;
    redrawDiagrams(aFrac, cFrac);

    const section = readSection();
    renderSectionProps(section);
    renderMaterialFacts();

    const material = currentMaterial();
    if (material && material.gated) {
        clearError();
        renderGate(material);
        lastInput = null;
        return null;
    }

    if (!Number.isFinite(L) || L <= 0) return showError('Enter a positive span.');
    if (!Number.isFinite(E) || E <= 0) return showError('Enter a positive elastic modulus.');
    if (!Number.isFinite(magnitude)) return showError('Enter a load magnitude.');
    // The engine rejects this too, but its message names P or w. This one names
    // whatever the field in front of the user currently says, which may be a
    // mass rather than a force.
    if (magnitude < 0) return showError('The load must not be negative. Loads act downward here, and an upward load is not modelled.');
    if (!section.ok) return showError(section.error);
    if (state.loadType === 'point-at') {
        if (!Number.isFinite(aRaw)) return showError('Enter a load position.');
        if (aRaw < 0 || aRaw > L) return showError('The load position must lie between 0 and the span.');
    }
    if (state.loadType === 'udl-partial') {
        if (!Number.isFinite(aRaw)) return showError('Enter where the load starts.');
        if (!Number.isFinite(cRaw)) return showError('Enter the loaded length.');
        if (aRaw < 0) return showError('The load cannot start before the left end of the beam.');
        if (cRaw <= 0) return showError('The loaded length must be greater than zero.');
        if (aRaw + cRaw > L * (1 + 1e-12)) {
            return showError('The loaded band runs past the right end of the beam. Reduce the start position or the loaded length.');
        }
    }

    let w = isDistributed() ? magnitude : 0;
    if (state.loadType === 'udl' && state.selfWeight && material && section.A) {
        w += selfWeightUDL(material.rho, section.A);
    }

    const input = {
        support: state.support,
        loadType: state.loadType,
        L,
        E,
        I: section.I,
        depth: section.depth,
    };
    if (isDistributed()) input.w = w;
    else input.P = magnitude;
    if (state.loadType === 'point-at') input.a = aRaw;
    if (state.loadType === 'udl-partial') {
        input.a = aRaw;
        input.c = cRaw;
    }

    const result = solve(input);
    if (!result.ok) return showError(result.error);

    clearError();
    renderResults(result, section, material, input);
    lastInput = input;

    // Per-card deflection for the current beam, so the selector itself carries
    // the comparison rather than only the results panel.
    for (const node of document.querySelectorAll('[data-support-value]')) {
        const r = solve({ ...input, support: node.dataset.supportValue });
        node.textContent = r.ok
            ? `${fmt(fromSI(r.deltaMax, 'deflection', U()), 3)} ${unitLabel('deflection', U())}`
            : '';
    }
    return result;
}

function init() {
    buildPresets();
    buildSupportCards();
    buildMaterialSelect();
    buildSectionFields();
    syncSupportSelection();
    applyMaterialToInputs();

    // The unit switch converts instead of replacing, so it leaves the physical
    // beam intact and the active example still matches.
    el('unitSystem').addEventListener('change', (e) => switchUnits(e.target.value));
    el('loadType').addEventListener('change', (e) => {
        state.loadType = e.target.value;
        clearActivePreset();
        recompute();
    });
    el('sectionType').addEventListener('change', (e) => {
        state.sectionType = e.target.value;
        buildSectionFields();
        clearActivePreset();
        recompute();
    });
    el('material').addEventListener('change', (e) => {
        state.materialId = e.target.value;
        applyMaterialToInputs();
        clearActivePreset();
        recompute();
    });
    el('limitSelect').addEventListener('change', (e) => {
        state.limitId = e.target.value;
        clearActivePreset();
        recompute();
    });
    // Switching between force and mass converts the field, so the beam on the
    // page does not change when the way of describing its load does.
    el('loadEntry').addEventListener('change', (e) => {
        const from = magnitudeQuantity();
        const value = readNumber('loadMagnitude');
        state.loadEntry = e.target.value;
        if (Number.isFinite(value)) {
            const si = toSI(value, from, U());
            el('loadMagnitude').value = Number(fromSI(si, magnitudeQuantity(), U()).toPrecision(6));
        }
        clearActivePreset();
        syncLoadInputs();
        recompute();
    });
    el('selfWeight').addEventListener('change', (e) => {
        state.selfWeight = e.target.checked;
        clearActivePreset();
        recompute();
    });
    for (const id of ['span', 'modulus', 'loadMagnitude', 'loadPos', 'loadLength', 'safetyFactor', 'customLimit']) {
        el(id).addEventListener('input', () => {
            clearActivePreset();
            recompute();
        });
    }
    el('verifyBtn').addEventListener('click', () => runVerification(lastInput));

    syncUnitLabels();
    recompute();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// Pure engine, exposed for the spec and for programmatic use.
window.BeamDeflection = {
    solve,
    closedForm,
    stressCheck,
    deflectionRatio,
    selfWeightUDL,
    sampleCurve,
    normalizeOffCenter,
    sectionProperties,
    toSI,
    fromSI,
    unitLabel,
    verifyAll,
    verifyCase,
    feSolveBeam,
    MATERIALS,
    MATERIALS_BY_ID,
    PRESETS,
    PRESETS_BY_ID,
    SECTIONS,
    UNITS,
    UNIT_SYSTEMS,
    SUPPORTS,
    LOAD_TYPES,
    STANDARD_POINT_RATIO,
    DEFLECTION_LIMITS,
    DEFAULT_ELEMENTS,
    TOLERANCE,
    PROPPED_UDL_COEFF,
    PROPPED_UDL_X_RATIO,
    PROPPED_CENTER_COEFF,
    PROPPED_CENTER_X_RATIO,
    G,
};
