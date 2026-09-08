// DOM controller for the control valve sizing tool.
//
// This is the only module here that touches the DOM or the window, which is
// what lets scripts/check-valve-coefficient-sources.mjs import the engine and
// the style library under Node without a window to touch.

import * as engine from './valve-engine.js';
import * as regimes from './regimes.js';
import * as units from './units.js';
import { VALVE_STYLES, STYLES_BY_ID, isRatedAtFullOpen } from './valve-styles.js';
import * as fluids from './fluids.js';
import * as characteristics from './characteristics.js';

const el = (id) => document.getElementById(id);
const num = (id) => {
    const raw = el(id).value.trim();
    if (raw === '') return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : NaN;
};

let system = 'si';

/** Read the form and convert everything to the engine's internal unit set. */
function readInputs() {
    const service = el('service').value;
    const direction = el('direction').value;
    const basis = el('pressureBasis').value;
    const P = (id) => {
        const v = num(id);
        if (v === null || Number.isNaN(v)) return v;
        const internal = units.toInternal('pressure', system, v);
        // Gauge is converted here and nowhere else. The engine only ever
        // receives absolute, so it has no way to be handed the wrong basis.
        return basis === 'gauge' ? units.gaugeToAbsolute(internal) : internal;
    };
    const input = {
        service,
        P1: P('p1'),
        P2: P('p2'),
        FL: num('fl'),
        xT: num('xt'),
        d: units.toInternal('diameter', system, num('d')),
        D1: units.toInternal('diameter', system, num('d1')),
        D2: units.toInternal('diameter', system, num('d2')),
    };
    if (direction === 'rate') input.C = num('cInstalled');

    if (service === 'liquid') {
        if (direction === 'size') input.q = units.toInternal('volumeFlow', system, num('q'));
        input.relativeDensity = num('relativeDensity');
        // Vapour and critical pressure are absolute by nature, so a gauge entry
        // is not converted twice: both are read as absolute regardless of the
        // basis selector.
        const pv = num('pv');
        input.Pv = pv === null ? null : units.toInternal('pressure', system, pv);
        const pc = num('pc');
        input.Pc = pc === null ? null : units.toInternal('pressure', system, pc);
    } else {
        input.gamma = num('gamma');
        if (el('gasBasis').value === 'mass') {
            if (direction === 'size') input.w = units.toInternal('massFlow', system, num('w'));
            input.rho1 = units.toInternal('density', system, num('rho1'));
        } else {
            // The standard-volumetric path, which is what N9 exists for. Its
            // reference state is pinned in the engine and stated on the page,
            // because the handbook prints a different constant for a 0 C basis
            // and the two differ by 6.1%.
            if (direction === 'size') input.q = units.toInternal('volumeFlow', system, num('qGas'));
            input.MW = num('mw');
            input.T1 = units.toInternal('temperature', system, num('t1'));
            input.Z = num('z');
        }
    }
    // The installed characteristic is optional. Everything about it stays
    // undefined unless the user supplied a system, so the engine reports it as
    // not computed instead of inventing a plausible authority.
    const kind = el('characteristic').value;
    if (kind) {
        input.characteristic = kind;
        input.Crated = num('crated');
        input.dPTotal = units.toInternal('pressure', system, num('dpTotal'));
        input.dPValveOpen = units.toInternal('pressure', system, num('dpValveOpen'));
    }
    const style = STYLES_BY_ID[el('style').value];
    if (style) {
        input.sigmaIncipient = style.sigmaIncipient;
        input.coefficientsReviewed = style.reviewed;
    }
    return input;
}

// An em dash, written as a character instead of an entity, because every value
// is written with textContent. The panel used to assign through innerHTML for
// the sole purpose of rendering this one glyph.
const DASH = '—';

const fmt = (v, digits = 3) => (v === null || v === undefined || !Number.isFinite(v)
    ? DASH
    : (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0)
        ? v.toExponential(digits)
        : v.toFixed(digits)));

function rows(container, pairs) {
    container.replaceChildren();
    for (const [label, value] of pairs) {
        const row = document.createElement('div');
        row.className = 'result-row';
        const l = document.createElement('span');
        l.className = 'result-label';
        l.textContent = label;
        const v = document.createElement('span');
        v.className = 'result-value';
        v.textContent = value;
        row.append(l, v);
        container.append(row);
    }
}

// Severity is carried by the word and by the shape of the icon, never by the
// tint alone.
// WCAG 1.4.1 is the formal reason; the practical one is that this badge is the
// tool's most important output and roughly one man in twelve cannot reliably
// separate the red tint from the amber one.
const REGIME_ICON = { error: '✖', warn: '▲', info: '●' };

function renderRegime(regime) {
    const severity = regimes.REGIME_SEVERITY[regime] || 'info';
    el('regimeBadge').dataset.severity = severity;
    el('regimeWord').textContent = regime || DASH;
    el('regimeIcon').textContent = REGIME_ICON[severity];
}

function renderAdvisories(list) {
    const box = el('advisories');
    box.replaceChildren();
    for (const wrn of list) {
        const item = document.createElement('div');
        item.className = 'advisory';
        item.dataset.severity = wrn.severity;
        item.dataset.code = wrn.code;
        const icon = document.createElement('span');
        icon.className = 'advisory-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = REGIME_ICON[wrn.severity];
        const text = document.createElement('span');
        text.textContent = wrn.message;
        item.append(icon, text);
        box.append(item);
    }
}

/**
 * The single line a screen reader hears.
 *
 * The results panel is not itself a live region: it rebuilds on every keystroke
 * and would be re-read whole. The refusal text used to be the only live element,
 * and it is emptied on success, so a correct answer announced nothing.
 */
function announce(text) {
    el('resultSummary').textContent = text;
}

function showRefusal(result) {
    el('cvValue').textContent = DASH;
    el('kvValue').textContent = '';
    // A refusal still shows a regime where one is determinable. An error with no
    // regime beside it reads as the tool breaking, rather than as the service
    // being one these equations do not describe.
    renderRegime(result.regime);
    el('resultStatus').textContent = result.error;
    el('resultStatus').dataset.state = 'error';
    announce(`Not sized. ${result.error}`);
    renderAdvisories([]);
    for (const id of ['regimeDetail', 'cavitationDetail', 'coefficientDetail', 'characteristicDetail']) {
        el(id).replaceChildren();
    }
    renderCharacteristicChart(null);
}

/** What the choke check is waiting on, worded from the engine's own list. */
function chokeRowValue(result) {
    if (result.dPChoked !== null && Number.isFinite(result.dPChoked)) return null;
    const missing = result.missingChokeInputs || [];
    if (missing.length === 0) return 'not computed';
    return `not computed, no ${missing.join(' and no ')}`;
}

function render() {
    const input = readInputs();
    const direction = el('direction').value;
    const result = direction === 'rate' ? engine.rate(input) : engine.size(input);
    if (!result.ok) {
        showRefusal(result);
        return result;
    }
    el('resultStatus').textContent = '';
    el('resultStatus').dataset.state = 'ok';

    const P = (v) => `${fmt(units.fromInternal('pressure', system, v), 1)} ${units.unitLabel('pressure', system)}`;

    // In rate mode the headline is the flow the valve passes, not a coefficient
    // the user already has. Everything below it is unchanged, because the regime
    // matters exactly as much either way.
    let headline;
    if (direction === 'rate') {
        // Mass on the gas mass basis, volumetric everywhere else, which is
        // exactly the pair of forms the engine was already able to return and
        // the page had no way to ask for.
        const byMass = result.service === 'gas' && el('gasBasis').value === 'mass';
        const quantity = byMass ? 'massFlow' : 'volumeFlow';
        const shown = units.fromInternal(quantity, system, byMass ? result.w : result.q);
        el('cvLabel').textContent = byMass ? 'Achievable mass flow' : 'Achievable flow';
        el('cvValue').textContent = fmt(shown, 2);
        el('kvValue').textContent = `${units.unitLabel(quantity, system)}, at the installed Cv ${fmt(result.C, 2)}`;
        headline = `${fmt(shown, 2)} ${units.unitLabel(quantity, system)}`;
    } else {
        el('cvLabel').textContent = 'Required flow coefficient';
        el('cvValue').textContent = fmt(result.C, 2);
        el('kvValue').textContent = `Kv ${fmt(units.cvToKv(result.C), 2)} · the Cv to Kv relation is empirical, not a unit identity`;
        headline = `Cv ${fmt(result.C, 2)}`;
    }
    renderRegime(result.regime);
    renderAdvisories(result.warnings);

    const worst = result.warnings.some((x) => x.severity === 'error') ? 'error'
        : result.warnings.some((x) => x.severity === 'warn') ? 'warning' : 'note';
    announce(`${headline}. Regime ${result.regime}. ${result.warnings.length} ${worst}${result.warnings.length === 1 ? '' : 's'}.`);

    rows(el('regimeDetail'), [
        ['Differential supplied', P(result.dPSupplied)],
        ['Differential used for sizing', P(result.dPUsed)],
        ['Choke point', chokeRowValue(result) ?? P(result.dPChoked)],
        ['Piping geometry factor Fp', fmt(result.Fp, 4)],
        ['Expansion factor Y', result.Y === null ? 'liquid service' : fmt(result.Y, 4)],
        ['Reynolds factor FR', 'not computed'],
        ['Iterations to converge', String(result.iterations)],
    ]);

    rows(el('cavitationDetail'), [
        ['Cavitation index sigma', result.sigma === null ? 'not run, no vapour pressure' : fmt(result.sigma, 3)],
        ['Definition', '(P1 - Pv) / (P1 - P2), ISA-RP75.23. Lower is more severe.'],
        ['Vena contracta pressure', result.Pvc === null ? DASH : P(result.Pvc)],
        ['Published incipient limit', 'none available for this style'],
    ]);

    renderCharacteristic(result);

    const style = STYLES_BY_ID[el('style').value];
    rows(el('coefficientDetail'), [
        ['FL used', fmt(input.FL, 3)],
        ['xT used', fmt(input.xT, 3)],
        ['Source', style ? style.source : 'user entered'],
        ['Review status', style ? (style.reviewed ? 'checked against its cited source' : 'not signed off') : 'user entered'],
    ]);
    return result;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const svg = (name, attrs) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    return node;
};

// Chart geometry, in the coordinate space the viewBox declares. Fixed viewBox
// plus preserveAspectRatio means the plot scales with its container instead of
// needing a responsive redraw, which is the same approach the beam diagrams take.
const CHART = { x0: 40, y0: 164, x1: 304, y1: 20 };

function renderCharacteristicChart(ch) {
    const chart = el('characteristicChart');
    // Keep the title and desc: they are the accessible name of the figure.
    for (const node of [...chart.childNodes]) {
        if (node.nodeName !== 'title' && node.nodeName !== 'desc') node.remove();
    }
    if (!ch) return;

    const px = (h) => CHART.x0 + h * (CHART.x1 - CHART.x0);
    const py = (v) => CHART.y0 + v * (CHART.y1 - CHART.y0);
    const path = (pts) => pts.map(([h, v]) => `${px(h).toFixed(2)},${py(v).toFixed(2)}`).join(' ');

    chart.append(svg('line', { x1: CHART.x0, y1: CHART.y0, x2: CHART.x1, y2: CHART.y0, class: 'chart-axis' }));
    chart.append(svg('line', { x1: CHART.x0, y1: CHART.y0, x2: CHART.x0, y2: CHART.y1, class: 'chart-axis' }));

    // The inherent curve is dashed and the installed one solid, so the two are
    // separable without relying on colour. Same reasoning as the regime badge.
    chart.append(svg('polyline', { points: path(ch.inherentNormalised), class: 'chart-line chart-inherent' }));
    chart.append(svg('polyline', { points: path(ch.installedNormalised), class: 'chart-line chart-installed' }));

    if (Number.isFinite(ch.travel) && ch.travel >= 0 && ch.travel <= 1) {
        chart.append(svg('line', {
            x1: px(ch.travel), y1: CHART.y0, x2: px(ch.travel), y2: CHART.y1, class: 'chart-travel',
        }));
    }

    for (const [x, y, text, cls] of [
        [(CHART.x0 + CHART.x1) / 2, 192, 'valve travel', 'chart-label'],
        [CHART.x0 - 6, CHART.y1 + 5, '1.0', 'chart-tick'],
        [CHART.x0 - 6, CHART.y0, '0', 'chart-tick'],
    ]) {
        const t = svg('text', { x, y, class: cls });
        t.textContent = text;
        chart.append(t);
    }
    const legend = svg('text', { x: CHART.x0 + 6, y: CHART.y1 + 2, class: 'chart-legend' });
    legend.textContent = 'dashed: inherent   solid: installed';
    chart.append(legend);
}

/**
 * Travel as a percentage, or a phrase when it is not on the stroke at all.
 *
 * Above 1 the valve cannot pass the flow and below 0 it is shut, and both used
 * to render as a percentage: "333.7 %" and "-28.1 %". Neither is a position.
 */
function travelText(ch) {
    if (!Number.isFinite(ch.travel)) return DASH;
    if (ch.travel > 1) return 'beyond full open, the trim is too small for this duty';
    if (ch.travel < 0) return 'below the controllable minimum, the valve is shut';
    return `${fmt(ch.travel * 100, 1)} %`;
}

function renderCharacteristic(result) {
    const ch = result.characteristic;
    if (!ch) {
        // Two different silences, and they used to read the same. If the user
        // asked for a characteristic the engine has already said why it could
        // not build one, so repeat that instead of telling them to enter what
        // they just entered.
        const refused = result.warnings.find((x) => x.code === 'SYSTEM_INCONSISTENT');
        rows(el('characteristicDetail'), [
            ['Installed characteristic', 'not computed'],
            ['Why', refused
                ? refused.message
                : 'Choose a trim characteristic and enter the system differentials. Nothing is assumed in their absence.'],
        ]);
        renderCharacteristicChart(null);
        return;
    }
    rows(el('characteristicDetail'), [
        ['Valve authority Nv', fmt(ch.authority, 3)],
        ['Travel at this condition', travelText(ch)],
        ['Worst distortion from inherent', fmt(ch.maxDistortion, 3)],
        ['Trim', ch.kind],
    ]);
    renderCharacteristicChart(ch);
}

function syncUnitLabels() {
    for (const node of document.querySelectorAll('[data-unit]')) {
        node.textContent = units.unitLabel(node.dataset.unit, system);
    }
    const { P_kPa, T_K } = engine.STANDARD_CONDITIONS;
    for (const node of document.querySelectorAll('[data-standard-conditions]')) {
        node.textContent = `At the standard reference state N9 is defined against: ${
            fmt(units.fromInternal('pressure', system, P_kPa), 3)} ${units.unitLabel('pressure', system)} absolute and ${
            fmt(units.fromInternal('temperature', system, T_K), 1)} ${units.unitLabel('temperature', system)}. `
            + 'The handbook prints a different constant for a 0 C basis and the two differ by 6.1%, so the state is pinned rather than assumed.';
    }
}

// ---------------------------------------------------------------------------
// Unit system. Switching CONVERTS every field, so the physical service is
// unchanged.
//
// It used to only relabel them, which silently reinterpreted the numbers: the
// default form read Cv 33.37 in SI and Cv 2.89 in US customary with every field
// showing exactly what it showed before, because 1000 kPa had quietly become
// 1000 psi. Same approach as beam-deflection: carry each value through internal
// units and write it back at 6 significant figures.
//
// Gauge needs no special handling here. A gauge pressure is a difference from
// atmosphere, so it converts by the same factor as an absolute one, and the
// atmospheric offset is applied later in readInputs against whichever system is
// then current.
// ---------------------------------------------------------------------------
function switchUnits(next) {
    if (next === system) return;
    const carried = [...document.querySelectorAll('[data-quantity]')].map((node) => {
        const raw = node.value.trim();
        const value = Number(raw);
        return [node, raw === '' || !Number.isFinite(value)
            ? null
            : units.toInternal(node.dataset.quantity, system, value)];
    });
    system = next;
    for (const [node, internal] of carried) {
        if (internal === null) continue;
        node.value = String(Number(units.fromInternal(node.dataset.quantity, system, internal).toPrecision(6)));
    }
    syncUnitLabels();
    // The saturation lookup restates itself in the new units. Its own note
    // quotes a pressure, so leaving it alone would print the old unit beside a
    // converted number, which is the exact confusion this whole function exists
    // to remove.
    applyLiquidTemperature();
}

/**
 * Show only the rows that belong to the current mode.
 *
 * Four independent switches now decide visibility: service, solve direction, gas
 * flow basis and liquid fluid. One pass over declarative attributes replaces
 * four hand-written branches.
 */
function syncVisibleRows() {
    const state = {
        when: el('service').value,
        whenDirection: el('direction').value,
        whenGas: el('gasBasis').value,
        whenLiquid: el('liquidFluid').value || 'other',
    };
    for (const [attr, key] of [
        ['data-when', 'when'], ['data-when-direction', 'whenDirection'],
        ['data-when-gas', 'whenGas'], ['data-when-liquid', 'whenLiquid'],
    ]) {
        for (const node of document.querySelectorAll(`[${attr}]`)) {
            node.hidden = node.getAttribute(attr) !== state[key];
        }
    }
}

function populateStyles() {
    const select = el('style');
    const custom = document.createElement('option');
    custom.value = '';
    custom.textContent = 'Custom (enter FL and xT below)';
    select.append(custom);
    for (const s of VALVE_STYLES) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.name}, NPS ${s.sizeNPS}, ${s.opening}`;
        select.append(opt);
    }
    select.value = '';
}

function applyStyle() {
    const style = STYLES_BY_ID[el('style').value];
    if (!style) {
        el('styleNote').textContent = 'Enter the recovery factor and terminal ratio from the manufacturer data sheet.';
        return;
    }
    el('fl').value = String(style.FL);
    el('xt').value = String(style.xT);
    const preamble = 'Typical values for the style, not for a specific valve. Use the manufacturer data sheet.';
    // The note used to announce a rated Cv and leave the characteristic block
    // holding whatever was there before. It now carries it, but only from the
    // rows where the quoted coefficient is the full-open one: a 60 degree rotary
    // Cv is about a third of the same valve at 90, and dropping it into a field
    // labelled "at full open" would distort every curve drawn from it.
    if (isRatedAtFullOpen(style)) {
        el('crated').value = String(style.Cv);
        el('styleNote').textContent = `${preamble} Rated Cv ${style.Cv} at ${style.opening}, carried into the characteristic block below.`;
    } else {
        el('styleNote').textContent = `${preamble} Cv ${style.Cv} is quoted at ${style.opening}, which is not full open, so it was not carried into the rated Cv below. Enter the full-open figure there yourself.`;
    }
}

/**
 * The gas library, which had no route to the page at all: gamma was typed by
 * hand and the molar mass column existed only in the spec.
 */
function populateGases() {
    const select = el('gasFluid');
    const custom = document.createElement('option');
    custom.value = '';
    custom.textContent = 'Custom (enter the properties below)';
    select.append(custom);
    for (const g of fluids.GASES) {
        const opt = document.createElement('option');
        opt.value = g.id;
        opt.textContent = g.name;
        select.append(opt);
    }
    select.value = 'air';
}

function applyGas() {
    const gas = fluids.GASES_BY_ID[el('gasFluid').value];
    if (!gas) {
        el('gasNote').textContent = 'Enter the specific heat ratio, and the molar mass if you are working in standard volumetric flow.';
        return;
    }
    el('gamma').value = String(gas.gamma);
    el('mw').value = String(gas.MW);
    el('gasNote').textContent = `Specific heat ratio ${gas.gamma} and molar mass ${gas.MW} kg/kmol, per ${gas.source}. Reviewed means the row matches its source, not that it is the best value at your conditions.`;
}

/**
 * Water vapour pressure from the vendored curve, which the page previously had
 * no way to reach: a water service still needed a hand-entered Pv.
 *
 * Outside the tabulated range the fields are left alone, never cleared and never
 * extrapolated, and the note says the lookup did not run. Silently blanking a
 * field the user typed would be worse than not filling it.
 */
function applyLiquidTemperature() {
    if (el('liquidFluid').value !== 'water') return;
    const T = units.toInternal('temperature', system, num('tLiquid'));
    const Psat = fluids.waterSaturationPressure(T);
    if (Psat === null) {
        el('tLiquidNote').textContent = `Outside the tabulated range of ${
            fmt(units.fromInternal('temperature', system, fluids.WATER_RANGE_K.min), 2)} to ${
            fmt(units.fromInternal('temperature', system, fluids.WATER_RANGE_K.max), 2)} ${
            units.unitLabel('temperature', system)}, so the vapour pressure below was left as you entered it rather than extrapolated.`;
        return;
    }
    el('pv').value = String(Number(units.fromInternal('pressure', system, Psat).toPrecision(6)));
    el('pc').value = String(Number(units.fromInternal('pressure', system, fluids.WATER_CRITICAL.P_kPa).toPrecision(6)));
    el('tLiquidNote').textContent = `Vapour pressure ${fmt(units.fromInternal('pressure', system, Psat), 3)} ${
        units.unitLabel('pressure', system)} from the vendored saturation table, interpolated in log P. Critical pressure is water's.`;
}

function init() {
    populateStyles();
    applyStyle();
    populateGases();
    applyGas();
    syncUnitLabels();
    syncVisibleRows();
    applyLiquidTemperature();

    // A select fires both input and change, so wiring a dedicated change
    // handler alongside a blanket input handler ran the whole solve twice on
    // every pick. Selects are therefore wired once, on change only, through one
    // table of what each needs to do before the render; text inputs keep the
    // per-keystroke input handler they need.
    //
    // switchUnits deliberately does not render. It is one entry in this table
    // like any other, and the single render below it happens after the fields
    // have been converted, never halfway through.
    const BEFORE_RENDER = {
        unitSystem: () => switchUnits(el('unitSystem').value),
        service: syncVisibleRows,
        direction: syncVisibleRows,
        gasBasis: syncVisibleRows,
        liquidFluid: () => { syncVisibleRows(); applyLiquidTemperature(); },
        style: applyStyle,
        gasFluid: applyGas,
    };
    for (const node of document.querySelectorAll('select')) {
        node.addEventListener('change', () => {
            (BEFORE_RENDER[node.id] || (() => {}))();
            render();
        });
    }
    for (const node of document.querySelectorAll('input')) {
        node.addEventListener('input', node.id === 'tLiquid'
            ? () => { applyLiquidTemperature(); render(); }
            : render);
    }
    render();
}

// The pure surface, exposed for the spec. Everything here is side-effect free
// and unit-agnostic: the spec drives the engine directly instead of scraping
// the DOM, which is the repo convention for a testable engine.
window.ControlValve = {
    ...engine,
    ...regimes,
    ...fluids,
    ...characteristics,
    units,
    VALVE_STYLES,
    STYLES_BY_ID,
    render,
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
