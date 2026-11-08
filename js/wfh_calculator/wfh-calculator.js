// Work From Home Calculator page: binds inputs to one scenario object,
// recalculates on every change, and keeps scenarios in this browser.

import * as Engine from './wfh-engine.js';
import { SOURCES, CONTEXT, EXAMPLES, blankScenario, blankLeg } from './wfh-data.js';
import { renderResults, money } from './wfh-results.js';
import { svgString, svgToPngBlob } from './wfh-chart.js';
import { renderInfoTip, wireInfoTips } from './wfh-info.js';
import { RPP_PLACES, RPP_YEAR } from './wfh-rpp-data.js';

const STORE_KEY = 'wfhCalculator.v1';
const MAX_SAVED = 10;
const $ = (id) => document.getElementById(id);

let state = blankScenario();
let lastResult = null;
let chartSvg = null;

window.WfhCalculator = { ...Engine, SOURCES, EXAMPLES, blankScenario, getState: () => state, getResult: () => lastResult };

// ---------- paths ----------
function getPath(obj, path) {
    return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i += 1) o = o[keys[i]];
    o[keys[keys.length - 1]] = value;
}
function fullPath(input) {
    const job = input.closest('[data-job]');
    return job ? `jobs.${job.dataset.job}.${input.dataset.bind}` : input.dataset.bind;
}
function readInput(input) {
    if (input.type === 'checkbox') return input.checked;
    if (input.type === 'number') return input.value === '' ? '' : parseFloat(input.value);
    return input.value;
}
function writeInput(input, value) {
    if (input.type === 'checkbox') input.checked = value === true;
    else if (input.type === 'radio') input.checked = input.value === value;
    else input.value = value ?? '';
}

// ---------- storage ----------
function loadStore() {
    try {
        const raw = localStorage.getItem(STORE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? { current: parsed.current || null, saved: parsed.saved || {} } : { current: null, saved: {} };
    } catch {
        return { current: null, saved: {} };
    }
}
function saveStore(store) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* storage unavailable */ }
}
let saveTimer = 0;
function saveCurrent() {
    clearTimeout(saveTimer);
    const store = loadStore();
    store.current = state;
    saveStore(store);
}
function autosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCurrent, 400);
}
// A change made just before the tab closes would otherwise miss the debounce.
window.addEventListener('pagehide', saveCurrent);

// ---------- building the form ----------
function buildJobs() {
    const container = $('jobsContainer');
    container.textContent = '';
    const tpl = $('jobTemplate');
    const count = state.compare ? 2 : 1;
    for (let i = 0; i < count; i += 1) {
        const node = tpl.content.firstElementChild.cloneNode(true);
        node.dataset.job = String(i);
        node.querySelectorAll('[data-bind]').forEach((input) => {
            const id = `job${i}-${input.dataset.bind.replace(/\./g, '-')}${input.type === 'radio' ? '-' + input.value : ''}`;
            input.id = id;
            if (input.type === 'radio') input.name = `job${i}-${input.dataset.bind}`;
        });
        node.querySelectorAll('label[data-for]').forEach((label) => {
            label.htmlFor = `job${i}-${label.dataset.for}`;
        });
        node.querySelectorAll('.info-tip[data-info]').forEach((t) => renderInfoTip(t, `job${i}`));
        node.querySelectorAll('[role="radiogroup"][data-label]').forEach((g) => g.setAttribute('aria-label', g.dataset.label));
        node.querySelectorAll('.hint').forEach((h, k) => {
            h.id = `job${i}-hint${k}`;
            const group = h.closest('.input-group');
            const input = group && group.querySelector('input');
            if (input) input.setAttribute('aria-describedby', h.id);
        });
        const place = node.querySelector('[data-place]');
        place.id = `job${i}-place`;
        node.querySelector('[data-place-label]').htmlFor = place.id;
        place.addEventListener('input', () => {
            const match = PLACE_BY_LABEL.get(place.value.trim().toLowerCase());
            state.jobs[i].placeFips = match ? match.fips : '';
            recalc();
        });
        container.appendChild(node);
        renderLegs(node, i, 'tripIn');
        renderLegs(node, i, 'tripHome');
    }
}

const LEG_FIELDS = {
    car_fuel: ['distance', 'efficiency', 'fuelPrice', 'riders'],
    car_wear: ['distance', 'efficiency', 'fuelPrice', 'wearRate', 'riders'],
    car_rate: ['distance', 'ratePerDistance', 'riders'],
    ev: ['distance', 'efficiency', 'energyPrice', 'wearRate', 'riders'],
    transit: ['distance', 'fare'],
    rideshare: ['distance', 'fare', 'surgePct', 'tipPct'],
    active: ['distance', 'costPerTrip'],
};

function fieldLabel(key, mode) {
    const us = state.units !== 'metric';
    const d = us ? 'miles' : 'km';
    const c = state.currency || '$';
    switch (key) {
        case 'distance': return mode === 'transit' || mode === 'rideshare' ? `Distance, ${d} (for the speed check)` : `Distance, ${d}`;
        case 'efficiency': return mode === 'ev' ? (us ? 'Miles per kWh' : 'kWh per 100 km') : (us ? 'Miles per gallon' : 'Liters per 100 km');
        case 'fuelPrice': return us ? `Fuel, ${c} per gallon` : `Fuel, ${c} per liter`;
        case 'energyPrice': return `Electricity, ${c} per kWh`;
        case 'wearRate': return `Wear, ${c} per ${us ? 'mile' : 'km'}`;
        case 'ratePerDistance': return `All-in, ${c} per ${us ? 'mile' : 'km'}`;
        case 'riders': return 'People sharing the car';
        case 'fare': return mode === 'rideshare' ? 'Fare' : 'Fare per ride';
        case 'surgePct': return 'Surge allowance (%)';
        case 'tipPct': return 'Tip (%)';
        case 'costPerTrip': return 'Cost per trip (share, wear)';
        default: return key;
    }
}

// Source buttons offered beside a leg field. Per-mile figures convert for metric.
function fieldSources(key, mode) {
    if (key === 'ratePerDistance') return ['irsJan2026', 'irsJul2026', 'aaaAllIn15k'];
    if (key === 'wearRate' && mode !== 'ev') return ['aaaWear'];
    if (key === 'fuelPrice') return ['aaaGas'];
    if (key === 'energyPrice') return ['aaaKwh'];
    return [];
}
function sourceValue(id) {
    const s = SOURCES[id];
    if (state.units !== 'metric') return s.value;
    if (id === 'aaaGas') return Engine.round(s.value / Engine.GALLON_L, 4);
    if (id === 'aaaKwh' || id === 'censusCommute') return s.value;
    return Engine.round(s.value / Engine.MILE_KM, 4);
}

function renderLegs(jobNode, jobIndex, tripKey) {
    const wrap = jobNode.querySelector(`[data-trip="${tripKey}"] .legs`);
    wrap.textContent = '';
    const legs = state.jobs[jobIndex][tripKey].legs;
    legs.forEach((leg, li) => {
        const row = document.createElement('fieldset');
        row.className = 'leg';
        const legend = document.createElement('legend');
        legend.textContent = `Leg ${li + 1}`;
        row.appendChild(legend);
        const base = `job${jobIndex}-${tripKey}-leg${li}`;

        const modeGroup = document.createElement('div');
        modeGroup.className = 'input-group';
        const modeLabel = document.createElement('label');
        modeLabel.htmlFor = `${base}-mode`;
        modeLabel.textContent = 'Mode';
        const select = document.createElement('select');
        select.id = `${base}-mode`;
        for (const [value, text] of Object.entries(Engine.LEG_MODES)) {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = text;
            select.appendChild(opt);
        }
        select.value = leg.mode;
        select.addEventListener('change', () => {
            leg.mode = select.value;
            renderLegs(jobNode, jobIndex, tripKey);
            recalc();
        });
        modeGroup.append(modeLabel, select);
        row.appendChild(modeGroup);

        const grid = document.createElement('div');
        grid.className = 'field-grid';
        for (const key of LEG_FIELDS[leg.mode]) {
            const g = document.createElement('div');
            g.className = 'input-group';
            const label = document.createElement('label');
            label.htmlFor = `${base}-${key}`;
            label.textContent = fieldLabel(key, leg.mode);
            const input = document.createElement('input');
            input.type = 'number';
            input.id = `${base}-${key}`;
            input.min = '0';
            input.step = 'any';
            input.inputMode = 'decimal';
            input.value = leg[key] ?? '';
            input.addEventListener('input', () => {
                leg[key] = input.value === '' ? '' : parseFloat(input.value);
                recalc();
            });
            g.append(label, input);
            for (const sid of fieldSources(key, leg.mode)) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'link-btn';
                b.textContent = SOURCES[sid].label;
                b.title = SOURCES[sid].cite;
                b.addEventListener('click', () => {
                    leg[key] = sourceValue(sid);
                    input.value = leg[key];
                    showNote(`${SOURCES[sid].cite}${state.units === 'metric' && sid !== 'aaaKwh' ? ' Converted to metric.' : ''}`);
                    recalc();
                });
                g.appendChild(b);
            }
            grid.appendChild(g);
        }
        row.appendChild(grid);
        if (legs.length > 1) {
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'tool-btn small';
            rm.textContent = `Remove leg ${li + 1}`;
            rm.addEventListener('click', () => {
                legs.splice(li, 1);
                renderLegs(jobNode, jobIndex, tripKey);
                recalc();
            });
            row.appendChild(rm);
        }
        wrap.appendChild(row);
    });
}

function renderLines(containerId, list, fields, labelPrefix) {
    const wrap = $(containerId);
    wrap.textContent = '';
    list.forEach((line, i) => {
        const row = document.createElement('div');
        row.className = 'line-row';
        for (const f of fields) {
            const id = `${containerId}-${i}-${f.key}`;
            const label = document.createElement('label');
            label.htmlFor = id;
            label.textContent = f.label;
            let input;
            if (f.options) {
                input = document.createElement('select');
                for (const [v, t] of f.options) {
                    const o = document.createElement('option');
                    o.value = v;
                    o.textContent = t;
                    input.appendChild(o);
                }
                input.value = line[f.key];
            } else {
                input = document.createElement('input');
                input.type = f.type;
                if (f.type === 'number') { input.min = '0'; input.step = 'any'; input.inputMode = 'decimal'; }
                if (f.type === 'text') input.maxLength = 60;
                input.value = line[f.key] ?? '';
            }
            input.id = id;
            input.addEventListener(f.options ? 'change' : 'input', () => {
                line[f.key] = f.type === 'number' ? (input.value === '' ? '' : parseFloat(input.value)) : input.value;
                recalc();
            });
            const cell = document.createElement('div');
            cell.className = 'input-group';
            cell.append(label, input);
            row.appendChild(cell);
        }
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'tool-btn small';
        rm.textContent = 'Remove';
        rm.setAttribute('aria-label', `Remove ${labelPrefix} ${i + 1}`);
        rm.addEventListener('click', () => {
            list.splice(i, 1);
            renderAllLines();
            recalc();
        });
        row.appendChild(rm);
        wrap.appendChild(row);
    });
}

function renderAllLines() {
    renderLines('careLines', state.person.careLines, [
        { key: 'label', label: 'What', type: 'text' },
        { key: 'perOfficeDay', label: 'Per office day', type: 'number' },
    ], 'care cost');
    renderLines('customLines', state.person.customLines, [
        { key: 'label', label: 'What', type: 'text' },
        { key: 'amount', label: 'Amount', type: 'number' },
        { key: 'per', label: 'Per', options: [['officeDay', 'Office day'], ['homeDay', 'Home day'], ['year', 'Year']] },
    ], 'line');
}

// Places for the cost-of-living field, labeled as the datalist shows them.
function placeLabel(p) {
    return p.kind === 'state' ? `${p.name}, statewide average` : p.name;
}
const PLACE_BY_LABEL = new Map(RPP_PLACES.map(([fips, name, kind, all, housing]) => {
    const p = { fips, name, kind, all, housing };
    return [placeLabel(p).toLowerCase(), p];
}));
const PLACE_BY_FIPS = new Map([...PLACE_BY_LABEL.values()].map((p) => [p.fips, p]));

function fillPlaceList() {
    const list = $('rppPlaces');
    for (const p of PLACE_BY_LABEL.values()) {
        const o = document.createElement('option');
        o.value = placeLabel(p);
        list.appendChild(o);
    }
}

const pct = (x) => `${Engine.round(x * 100, 2)}%`;

// The rate each job's pay is taxed at, and what its place costs.
function renderJobReadouts() {
    const cur = state.currency || '$';
    document.querySelectorAll('[data-job]').forEach((node) => {
        const job = state.jobs[Number(node.dataset.job)];
        const pay = Engine.payFigures(job, state.person);
        const out = node.querySelector('[data-tax-readout]');
        let text;
        if (!(pay.annual > 0)) text = 'Enter pay to see the rate.';
        else if (pay.exactTax) {
            const r = pay.rateParts;
            text = `On the next dollar: ${pct(r.federal)} federal + ${pct(r.payroll)} payroll + ${pct(r.state)} state = ${pct(pay.marginalRate)}. Take-home from this job about ${money(pay.net, cur)} a year (${pct(pay.tax / pay.annual)} of pay).`;
        } else text = 'This rate is applied to each change in pay, such as a raise or the gap between two offers, never to the whole salary.';
        if (out.textContent !== text) out.textContent = text;

        const input = node.querySelector('[data-place]');
        const hint = node.querySelector('[data-place-hint]');
        const place = PLACE_BY_FIPS.get(job.placeFips);
        let h = 'Pick a metro area or a state from the list. Prices come from BEA Regional Price Parities.';
        if (place) {
            const diff = place.all - 100;
            h = `Prices ${Math.abs(diff).toFixed(1)}% ${diff >= 0 ? 'above' : 'below'} the US average in ${RPP_YEAR}${place.housing ? `; rent index ${place.housing.toFixed(1)}` : ''} (BEA, US = 100).`;
        } else if (input.value.trim()) h = 'No match. Pick a name from the list.';
        if (hint.textContent !== h) hint.textContent = h;
    });
}

// Push the whole state into the form.
function fillForm() {
    buildJobs();
    document.querySelectorAll('[data-bind]').forEach((input) => writeInput(input, getPath(state, fullPath(input))));
    document.querySelectorAll('[data-job]').forEach((node) => {
        const place = PLACE_BY_FIPS.get(state.jobs[Number(node.dataset.job)].placeFips);
        node.querySelector('[data-place]').value = place ? placeLabel(place) : '';
    });
    document.querySelectorAll('input[name="units"]').forEach((r) => { r.checked = r.value === state.units; });
    renderAllLines();
    syncVisibility();
}

function syncVisibility() {
    document.querySelectorAll('[data-job]').forEach((node) => {
        const job = state.jobs[Number(node.dataset.job)];
        node.querySelectorAll('[data-show="salary"]').forEach((e) => { e.hidden = job.payMode !== 'salary'; });
        node.querySelectorAll('[data-show="hourly"]').forEach((e) => { e.hidden = job.payMode !== 'hourly'; });
        node.querySelectorAll('[data-show="week"]').forEach((e) => { e.hidden = job.policyMode !== 'week'; });
        node.querySelectorAll('[data-show="month"]').forEach((e) => { e.hidden = job.policyMode !== 'month'; });
        node.querySelectorAll('[data-show="brackets"]').forEach((e) => { e.hidden = job.taxMode !== 'brackets'; });
        node.querySelectorAll('[data-show="flat"]').forEach((e) => { e.hidden = job.taxMode !== 'flat'; });
        node.querySelector('[data-trip="tripHome"]').hidden = job.sameTripHome === true;
        node.querySelectorAll('.compare-only').forEach((e) => { e.hidden = !state.compare; });
        node.querySelector('.job-name-group').hidden = !state.compare;
        node.querySelector('.job-title').textContent = state.compare ? (job.name || `Job ${node.dataset.job === '0' ? 'A' : 'B'}`) : 'Your job';
    });
    $('customRateGroup').hidden = state.person.timeValueMode !== 'custom';
}

function showNote(text) {
    $('exampleNote').textContent = text;
}

// ---------- recalculation ----------
let pending = 0;
function recalc() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
        syncVisibility();
        lastResult = Engine.calculate(state);
        renderJobReadouts();
        chartSvg = renderResults(state, lastResult, { CONTEXT });
        autosave();
    });
}

function onFormInput(e) {
    const input = e.target;
    if (!input.dataset || !input.dataset.bind) return;
    const path = fullPath(input);
    if (input.type === 'radio' && !input.checked) return;
    const value = readInput(input);
    setPath(state, path, value);
    if (input.dataset.bind === 'compare') {
        fillForm();
    }
    recalc();
}

// ---------- scenario actions ----------
function setState(next, note = '') {
    state = Engine.sanitizeScenario(next, blankScenario());
    fillForm();
    showNote(note);
    recalc();
}

function refreshSaved() {
    const store = loadStore();
    const sel = $('savedSelect');
    sel.textContent = '';
    const names = Object.keys(store.saved);
    if (!names.length) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = 'Nothing saved yet';
        sel.appendChild(o);
    }
    for (const n of names) {
        const o = document.createElement('option');
        o.value = n;
        o.textContent = n;
        sel.appendChild(o);
    }
}

function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function wire() {
    const exSel = $('exampleSelect');
    for (const ex of EXAMPLES) {
        const o = document.createElement('option');
        o.value = ex.id;
        o.textContent = ex.title;
        exSel.appendChild(o);
    }
    $('loadExample').addEventListener('click', () => {
        const ex = EXAMPLES.find((x) => x.id === exSel.value);
        if (ex) setState(ex.build(), `Example loaded: ${ex.title}. ${ex.note}`);
    });

    document.querySelector('main').addEventListener('input', onFormInput);
    document.querySelector('main').addEventListener('change', (e) => {
        if (e.target.type === 'radio' || e.target.type === 'checkbox' || e.target.tagName === 'SELECT') onFormInput(e);
    });

    document.querySelectorAll('input[name="units"]').forEach((r) => r.addEventListener('change', () => {
        if (!r.checked) return;
        state = Engine.convertScenarioUnits(state, r.value);
        fillForm();
        showNote(r.value === 'metric' ? 'Distances, fuel economy and prices per distance converted to metric.' : 'Distances, fuel economy and prices per distance converted to US units.');
        recalc();
    }));

    $('jobsContainer').addEventListener('click', (e) => {
        const add = e.target.closest('[data-add-leg]');
        const jobNode = e.target.closest('[data-job]');
        if (add && jobNode) {
            const i = Number(jobNode.dataset.job);
            const legs = state.jobs[i][add.dataset.addLeg].legs;
            if (legs.length < 6) legs.push(blankLeg('transit'));
            renderLegs(jobNode, i, add.dataset.addLeg);
            recalc();
        }
        const src = e.target.closest('[data-source]');
        if (src && jobNode) {
            const i = Number(jobNode.dataset.job);
            const sid = src.dataset.source;
            setPath(state, `jobs.${i}.${src.dataset.target}`, SOURCES[sid].value);
            const input = jobNode.querySelector(`[data-bind="${src.dataset.target}"]`);
            if (input) input.value = SOURCES[sid].value;
            showNote(SOURCES[sid].cite);
            recalc();
        }
    });
    $('jobsContainer').addEventListener('mouseover', (e) => {
        const src = e.target.closest('[data-source]');
        if (src && !src.title) src.title = SOURCES[src.dataset.source].cite;
    });

    $('addCare').addEventListener('click', () => {
        if (state.person.careLines.length < 20) state.person.careLines.push({ label: '', perOfficeDay: '' });
        renderAllLines();
        recalc();
    });
    $('addCustom').addEventListener('click', () => {
        if (state.person.customLines.length < 20) state.person.customLines.push({ label: '', amount: '', per: 'officeDay' });
        renderAllLines();
        recalc();
    });

    // Energy helper: watts and hours to a daily cost.
    const ec = () => {
        const v = (id) => parseFloat($(id).value) || 0;
        const kwh = v('ecWatts') * v('ecHours') / 1000 + v('ecHvacKw') * v('ecHvacHours');
        const cost = kwh * v('ecPrice');
        $('ecResult').textContent = `${Engine.round(kwh, 2)} kWh a day, about ${money(cost, state.currency, 2)}.`;
        return cost;
    };
    ['ecWatts', 'ecHours', 'ecPrice', 'ecHvacKw', 'ecHvacHours'].forEach((id) => $(id).addEventListener('input', ec));
    $('ecApply').addEventListener('click', () => {
        state.person.homeEnergyPerDay = Engine.round(ec(), 2);
        $('homeEnergy').value = state.person.homeEnergyPerDay;
        recalc();
    });

    $('saveScenario').addEventListener('click', () => {
        $('saveRow').hidden = false;
        $('saveName').value = $('savedSelect').value || '';
        $('saveName').focus();
    });
    $('cancelSave').addEventListener('click', () => { $('saveRow').hidden = true; });
    $('confirmSave').addEventListener('click', () => {
        const name = $('saveName').value.trim().slice(0, 40);
        if (!name) { showNote('Give the scenario a name first.'); return; }
        const store = loadStore();
        if (!store.saved[name] && Object.keys(store.saved).length >= MAX_SAVED) {
            showNote(`Up to ${MAX_SAVED} scenarios can be saved. Delete one first.`);
            return;
        }
        store.saved[name] = state;
        saveStore(store);
        refreshSaved();
        $('savedSelect').value = name;
        $('saveRow').hidden = true;
        showNote(`Saved "${name}" in this browser.`);
    });
    $('openSaved').addEventListener('click', () => {
        const name = $('savedSelect').value;
        const store = loadStore();
        if (name && store.saved[name]) setState(store.saved[name], `Opened "${name}".`);
    });
    $('deleteSaved').addEventListener('click', () => {
        const name = $('savedSelect').value;
        const store = loadStore();
        if (!name || !store.saved[name]) return;
        delete store.saved[name];
        saveStore(store);
        refreshSaved();
        showNote(`Deleted "${name}".`);
    });
    $('resetScenario').addEventListener('click', () => setState(blankScenario(), 'All fields cleared.'));

    $('exportJson').addEventListener('click', () => {
        download('wfh-scenario.json', new Blob([JSON.stringify({ tool: 'wfh-calculator', ...state }, null, 2)], { type: 'application/json' }));
    });
    $('importJsonBtn').addEventListener('click', () => $('importJson').click());
    $('importJson').addEventListener('change', async () => {
        const file = $('importJson').files[0];
        $('importJson').value = '';
        if (!file) return;
        if (file.size > 200000) { showNote('That file is too large to be a scenario.'); return; }
        try {
            const parsed = JSON.parse(await file.text());
            setState(parsed, `Imported ${file.name}.`);
        } catch {
            showNote('That file is not a scenario this tool can read.');
        }
    });

    $('exportCsv').addEventListener('click', () => {
        if (!lastResult || !lastResult.ok) return;
        const ev = currentTableJob();
        download('wfh-patterns.csv', new Blob([Engine.patternsCsv(ev, state.currency)], { type: 'text/csv' }));
    });
    $('exportSvg').addEventListener('click', () => {
        if (chartSvg) download('wfh-chart.svg', new Blob([svgString(chartSvg)], { type: 'image/svg+xml' }));
    });
    $('exportPng').addEventListener('click', async () => {
        if (!chartSvg) return;
        try { download('wfh-chart.png', await svgToPngBlob(chartSvg, 2)); } catch (err) { showNote(err.message); }
    });
    $('printSummary').addEventListener('click', () => window.print());
    window.addEventListener('beforeprint', () => { $('notPriced').open = true; });
    $('disclaimerLink').addEventListener('click', () => { $('scopeDisclaimer').open = true; });
}

function currentTableJob() {
    const sel = document.getElementById('tableJob');
    if (lastResult.comparison && sel && sel.value === '1') return lastResult.comparison.b;
    return lastResult.comparison ? lastResult.comparison.a : lastResult.single;
}

function init() {
    fillPlaceList();
    wire();
    document.querySelectorAll('.input-panel > .input-group .info-tip[data-info]').forEach((t) => renderInfoTip(t, 'page'));
    wireInfoTips();
    refreshSaved();
    const store = loadStore();
    state = store.current ? Engine.sanitizeScenario(store.current, blankScenario()) : blankScenario();
    fillForm();
    recalc();
}

document.addEventListener('wfh-table-job', () => recalc());

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
