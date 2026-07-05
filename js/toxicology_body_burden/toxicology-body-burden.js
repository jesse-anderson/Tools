// DOM controller for the Toxicology Body Burden tool.
//
// This module owns all DOM wiring (event listeners, rendering, the calculation
// ledger) and delegates every numeric step to the pure engine in
// tox-burden-engine.js. The engine is re-exposed on window.ToxBurden so the
// Playwright spec can drive the math directly without scraping the DOM.

import {
    SPECIES_DB,
    computeBodyBurden,
    normalizeToMgL,
    computeKinetics,
    computeVd,
    unitLabel,
} from './tox-burden-engine.js';

let currentMode = 'modeA';

// Friendly number formatting, deferring to the shared helper when present.
function fmt(num) {
    if (num === null || num === undefined || Number.isNaN(num)) return '---';
    if (!Number.isFinite(num)) return num > 0 ? '∞' : '-∞';
    const nf = window.ToolsHub && window.ToolsHub.NumberFormat;
    return nf ? nf.format(num) : String(num);
}

function $(id) {
    return document.getElementById(id);
}

document.addEventListener('DOMContentLoaded', () => {
    populateSpecies();
    populateRefTable();
    wireEvents();

    // Initialize the weight field to the default for the currently selected species.
    handleSpeciesChange();

    calculate();
});

function populateSpecies() {
    const sel = $('species');
    if (!sel) return;
    sel.innerHTML = SPECIES_DB.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

function populateRefTable() {
    const tbody = $('refTableBody');
    if (!tbody) return;

    const rows = SPECIES_DB.map(s => {
        const bvVal = Number(s.bv).toFixed(0);
        const bvTxt = (s.bv_range && String(s.bv_range).trim().length)
            ? `${bvVal} ${s.bv_range}`
            : bvVal;

        const tbwPct = Number.isFinite(s.tbw) ? (s.tbw * 100) : NaN;
        let tbwTxt = '-';
        if (Number.isFinite(tbwPct)) {
            const tbwVal = tbwPct.toFixed(0);
            tbwTxt = (s.tbw_note && String(s.tbw_note).trim().length)
                ? `${tbwVal}% ${s.tbw_note}`
                : `${tbwVal}%`;
        }

        return `<tr><td>${s.name}</td><td>${bvTxt}</td><td>${tbwTxt}</td></tr>`;
    });

    tbody.innerHTML = rows.join('');
}

function wireEvents() {
    // Live recalculation on any numeric / select input.
    ['conc', 'concUnit', 'mw', 'weight', 'loss', 'time', 'halflife', 'clearTargetPct', 'vdCoeff']
        .forEach(id => {
            const el = $(id);
            if (!el) return;
            const evt = (el.tagName === 'SELECT') ? 'change' : 'input';
            el.addEventListener(evt, calculate);
        });

    const species = $('species');
    if (species) species.addEventListener('change', handleSpeciesChange);

    // Vd mode radios (labels wrap the hidden radios, so a click checks them).
    document.querySelectorAll('input[name="mode"]').forEach(radio => {
        radio.addEventListener('change', () => setMode(radio.value));
    });

    const kinetic = $('kineticToggle');
    if (kinetic) kinetic.addEventListener('change', toggleKinetics);

    // Preset coefficient chips.
    document.querySelectorAll('[data-coeff]').forEach(chip => {
        const apply = () => setCoeff(parseFloat(chip.dataset.coeff));
        chip.addEventListener('click', apply);
        chip.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); apply(); }
        });
    });

    // Collapsible methodology dropdown(s).
    document.querySelectorAll('[data-dropdown-target]').forEach(header => {
        const toggle = () => toggleDropdown(header);
        header.addEventListener('click', toggle);
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });
    });
}

function handleSpeciesChange() {
    const id = $('species').value;
    const data = SPECIES_DB.find(s => s.id === id);
    if (data) $('weight').value = data.weight;
    calculate();
}

function setMode(mode) {
    currentMode = mode;
    ['modeA', 'modeB', 'modeC'].forEach(m => {
        $('card-' + m).classList.toggle('active', m === mode);
    });
    $('customVd').classList.toggle('visible', mode === 'modeC');
    calculate();
}

function toggleKinetics() {
    const isActive = $('kineticToggle').checked;
    $('kineticInputs').classList.toggle('visible', isActive);
    calculate();
}

function toggleDropdown(header) {
    const content = $(header.dataset.dropdownTarget);
    if (!content) return;
    const icon = header.querySelector('.dropdown-icon');
    const isOpen = content.classList.toggle('open');
    header.setAttribute('aria-expanded', String(isOpen));
    if (icon) icon.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
}

function setCoeff(val) {
    if (!Number.isFinite(val)) return;
    $('vdCoeff').value = val;
    calculate();
}

// Reset every result field to a neutral zero/placeholder state.
function renderNeutral(message) {
    $('ledgerText').textContent = message;
    $('resCt').textContent = '0';
    $('resC0').textContent = '---';
    $('resVd').textContent = '0';
    $('resAt').textContent = '0';
    $('resA0').textContent = '---';
    $('resTotal').textContent = '0';
    $('resABasis').textContent = '(At)';
    $('resT99').textContent = '---';
    $('resT97').textContent = '---';
}

function renderError(message) {
    $('ledgerText').textContent = message;
    ['resCt', 'resC0', 'resVd', 'resAt', 'resA0', 'resTotal', 'resT99', 'resT97']
        .forEach(id => { $(id).textContent = '---'; });
    $('resABasis').textContent = '';
}

function calculate() {
    const input = readInputs();
    const result = computeBodyBurden(input);

    if (!result.ok) {
        if (result.pending) {
            renderNeutral('Waiting for valid input...');
        } else {
            renderError('Error: ' + result.error);
        }
        return;
    }

    renderResult(result, input);
}

function readInputs() {
    const kineticsEnabled = $('kineticToggle').checked;
    return {
        rawConc: parseFloat($('conc').value),
        unit: $('concUnit').value,
        mw: parseFloat($('mw').value),
        speciesId: $('species').value,
        weight: parseFloat($('weight').value),
        loss: parseFloat($('loss').value) || 0,
        mode: currentMode,
        vdCoeff: parseFloat($('vdCoeff').value),
        kinetics: {
            enabled: kineticsEnabled,
            time: parseFloat($('time').value),
            halflife: parseFloat($('halflife').value),
            targetPct: parseFloat($('clearTargetPct').value ?? '0'),
        },
    };
}

function renderResult(r, input) {
    $('resCt').textContent = fmt(r.Ct);
    $('resC0').textContent = r.kineticsEnabled ? fmt(r.C0) : '---';
    $('resVd').textContent = fmt(r.Vd);
    $('resAt').textContent = fmt(r.At);
    $('resA0').textContent = r.kineticsEnabled ? fmt(r.A0) : '---';
    $('resTotal').textContent = fmt(r.Astar);
    $('resABasis').textContent = r.kineticsEnabled ? '(A0)' : '(At)';

    $('labelClearPct').textContent = input.kinetics.targetPct;
    $('resT99').textContent = r.kineticsEnabled ? fmt(r.t99) : '---';
    $('resT97').textContent = r.kineticsEnabled ? fmt(r.t97) : '---';

    $('ledgerText').innerHTML = buildLedger(r, input).join('');
}

// Rebuild the human-readable calculation trace from the structured result.
function buildLedger(r, input) {
    const lines = [];
    const label = unitLabel(input.unit);

    let normText;
    if (r.norm.isMolar) {
        normText = `Ct_norm: ${input.rawConc} ${label} -> ${r.norm.molPerL.toExponential(3)} mol/L; `
            + `(${r.norm.molPerL.toExponential(3)} mol/L) x (${input.mw} g/mol) x (1000 mg/g) = ${r.Ct.toExponential(2)} mg/L`;
    } else if (r.norm.factor === 1) {
        normText = `Ct_norm: ${input.rawConc} ${label} = ${r.Ct.toExponential(2)} mg/L`;
    } else {
        normText = `Ct_norm: ${input.rawConc} ${label} x ${r.norm.factor} = ${r.Ct.toExponential(2)} mg/L`;
    }
    lines.push(ledgerLine('1. Norm:', normText));

    if (r.kineticsEnabled) {
        const kinText = `k = ln(2)/t1/2 = 0.693/${input.kinetics.halflife} = ${r.k.toFixed(6)} 1/hr; `
            + `C0 = Ct x e^(k x t) = ${r.Ct.toExponential(2)} x e^(${(r.k * input.kinetics.time).toFixed(4)}) = ${r.C0.toExponential(2)} mg/L`;
        lines.push(ledgerLine('2. Kinetic:', kinText));
    } else {
        lines.push(ledgerLine('2. Kinetic:', 'Disabled (Ct used directly).'));
    }

    let vText;
    if (input.mode === 'modeA') {
        vText = `Mode A (Blood): Vphys = (${input.weight} kg x ${r.species.bv} mL/kg)/1000 = ${r.physV.toFixed(3)} L; `
            + `Veff = max(0, Vphys - loss) = max(0, ${r.physV.toFixed(3)} - ${input.loss}); Vd = ${r.Vd.toFixed(3)} L`;
    } else if (input.mode === 'modeB') {
        vText = `Mode B (TBW): Vphys ~= ${input.weight} kg x ${r.species.tbw} L/kg = ${r.physV.toFixed(3)} L; `
            + `Veff = max(0, Vphys - loss) = max(0, ${r.physV.toFixed(3)} - ${input.loss}); Vd = ${r.Vd.toFixed(3)} L`;
    } else {
        vText = `Mode C (Custom): Vd = ${input.weight} kg x ${input.vdCoeff} L/kg = ${r.Vd.toFixed(3)} L (loss ignored)`;
    }
    lines.push(ledgerLine('3. Vol:', vText));

    lines.push(ledgerLine('4. Amount@t:',
        `At = Ct x Vd = ${r.Ct.toExponential(2)} mg/L x ${r.Vd.toFixed(3)} L = ${r.At.toExponential(2)} mg`));

    if (r.kineticsEnabled) {
        lines.push(ledgerLine('5. Amount@0:',
            `A0 = C0 x Vd = ${r.C0.toExponential(2)} mg/L x ${r.Vd.toFixed(3)} L = ${r.A0.toExponential(2)} mg`, true));

        const labelPct = input.kinetics.targetPct;
        const labelText = (labelPct === 0) ? '0% remaining (asymptotic)' : `${labelPct}% remaining`;
        const clearText = `5xt1/2 ~= ${r.t97.toFixed(2)} hr (~97% eliminated); `
            + (Number.isFinite(r.t99)
                ? `t(<=${labelText}) = t1/2 x log2(1/f) ~= ${r.t99.toFixed(2)} hr`
                : `t(<=${labelText}) = infinity (exponential decay never reaches exactly 0)`);
        lines.push(ledgerLine('6. Clearance:', clearText));
    } else {
        lines.push(ledgerLine('5. Body Burden:',
            `A* = At (kinetics disabled) = ${r.At.toExponential(2)} mg`, true));
    }

    return lines;
}

function ledgerLine(title, text, highlight = false) {
    const style = highlight ? ' style="color:var(--accent-engineering)"' : '';
    const t = document.createElement('span');
    t.textContent = text;
    return `<div class="ledger-line"${style}><strong>${title}</strong> ${t.outerHTML}</div>`;
}

// Expose the pure engine for tests and programmatic use.
window.ToxBurden = {
    SPECIES_DB,
    computeBodyBurden,
    normalizeToMgL,
    computeKinetics,
    computeVd,
    unitLabel,
    fmt,
};
