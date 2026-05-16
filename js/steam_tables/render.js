import { formatNumber, formatProperty, propertyDeltaFromSI, propertyFromSI, unitLabel } from './units.js';
import { PHASE_LABELS } from './lookups.js';
import { escapeHtml, phaseClass } from './html.js';

const SAT_RESULT_ROWS = [
    ['T', 'Temperature', 'T'],
    ['P', 'Pressure', 'P'],
    ['vf', 'Specific volume liquid', 'v'],
    ['vg', 'Specific volume vapor', 'v'],
    ['uf', 'Internal energy liquid', 'u'],
    ['ug', 'Internal energy vapor', 'u'],
    ['ufg', 'Internal energy vaporization', 'u'],
    ['hf', 'Enthalpy liquid', 'h'],
    ['hg', 'Enthalpy vapor', 'h'],
    ['hfg', 'Enthalpy vaporization', 'h'],
    ['sf', 'Entropy liquid', 's'],
    ['sg', 'Entropy vapor', 's'],
    ['sfg', 'Entropy vaporization', 's']
];

const STATE_RESULT_ROWS = [
    ['T', 'Temperature', 'T'],
    ['P', 'Pressure', 'P'],
    ['x', 'Quality', 'x'],
    ['v', 'Specific volume', 'v'],
    ['rho', 'Density', 'rho'],
    ['u', 'Internal energy', 'u'],
    ['h', 'Enthalpy', 'h'],
    ['s', 'Entropy', 's']
];

const PROP_LABELS = {
    T: 'T',
    P: 'P',
    v: 'v',
    rho: 'rho',
    u: 'u',
    h: 'h',
    s: 's'
};

export function renderResult(container, result, units) {
    if (!result) {
        container.innerHTML = '<div class="empty-state">Load tables and enter a state to compute properties.</div>';
        return;
    }

    const rows = result.kind === 'saturation' ? SAT_RESULT_ROWS : STATE_RESULT_ROWS;
    const values = result.values || {};
    const phase = result.phase ? `<span class="phase-chip ${phaseClass(result.phase)}">${escapeHtml(PHASE_LABELS[result.phase] || result.phase)}</span>` : '';
    const warnings = renderWarnings(result.warnings || [], units);
    const candidates = result.candidates && result.candidates.length > 1 ? renderCandidates(result.candidates, units) : '';

    container.innerHTML = `
        <div class="result-header">
            <div>
                <div class="result-kicker">${escapeHtml(result.kind || 'lookup')}</div>
                <h3>Computed State</h3>
            </div>
            ${phase}
        </div>
        ${warnings}
        <div class="property-grid">
            ${rows
                .filter(([key]) => values[key] !== undefined && values[key] !== null)
                .map(([key, label, kind]) => renderProperty(label, kind, values[key], units))
                .join('')}
        </div>
        ${candidates}
    `;
}

function renderProperty(label, kind, value, units) {
    const display = kind === 'x'
        ? formatNumber(value, 7)
        : formatProperty(kind, value, units);
    return `
        <div class="property-row">
            <div>
                <div class="property-label">${escapeHtml(label)}</div>
                <div class="property-unit">${escapeHtml(unitLabel(kind, units))}</div>
            </div>
            <button class="property-value" type="button" data-copy-value="${escapeHtml(display)}" title="Copy value">${escapeHtml(display)}</button>
        </div>
    `;
}

function renderWarnings(warnings, units) {
    if (!warnings.length) {
        return '';
    }
    return `<div class="warning-list">${warnings.map((warning) => `<div class="warning-item">${escapeHtml(formatWarning(warning, units))}</div>`).join('')}</div>`;
}

function formatWarning(warning, units) {
    const number = '([-+0-9.eE]+)';
    const pressureClamp = warning.match(/^Pressure was clamped from ([-+0-9.eE]+) MPa to ([-+0-9.eE]+) MPa\.$/);
    if (pressureClamp) {
        return `Pressure was clamped from ${formatProperty('P', Number(pressureClamp[1]), units)} to ${formatProperty('P', Number(pressureClamp[2]), units)}.`;
    }

    const temperatureClamp = warning.match(/^Temperature was clamped from ([-+0-9.eE]+) deg C to ([-+0-9.eE]+) deg C(.*)$/);
    if (temperatureClamp) {
        return `Temperature was clamped from ${formatProperty('T', Number(temperatureClamp[1]), units)} to ${formatProperty('T', Number(temperatureClamp[2]), units)}${temperatureClamp[3]}`;
    }

    const saturationClamp = warning.match(/^(T|P) was clamped from ([-+0-9.eE]+) to ([-+0-9.eE]+)\.$/);
    if (saturationClamp) {
        return `${saturationClamp[1]} was clamped from ${formatProperty(saturationClamp[1], Number(saturationClamp[2]), units)} to ${formatProperty(saturationClamp[1], Number(saturationClamp[3]), units)}.`;
    }

    return warning
        .replace(new RegExp(`more than ${number} deg C uncertainty`, 'g'), (_, value) => `more than ${formatDelta('T', Number(value), units)} uncertainty`)
        .replace(new RegExp(`more than ${number} MPa uncertainty`, 'g'), (_, value) => `more than ${formatDelta('P', Number(value), units)} uncertainty`)
        .replace(new RegExp(`${number}\\.\\.${number} deg C`, 'g'), (_, low, high) => `${formatProperty('T', Number(low), units)}..${formatProperty('T', Number(high), units)}`)
        .replace(new RegExp(`T=${number} deg C`, 'g'), (_, value) => `T=${formatProperty('T', Number(value), units)}`)
        .replace(new RegExp(`P=${number} MPa`, 'g'), (_, value) => `P=${formatProperty('P', Number(value), units)}`);
}

function formatDelta(kind, value, units) {
    return `${formatNumber(propertyDeltaFromSI(kind, value, units), 7)} ${unitLabel(kind, units)}`;
}

function renderCandidates(candidates, units) {
    return `
        <div class="candidate-list">
            <h4>Candidate States</h4>
            ${candidates.map((candidate, index) => {
                const state = candidate.state;
                const solvedKind = candidate.axis === 'P' ? 'P' : 'T';
                const solved = candidate.axis === 'P'
                    ? formatProperty('P', candidate.solvedValue, units)
                    : formatProperty('T', candidate.solvedValue, units);
                return `
                    <div class="candidate-row">
                        <span class="candidate-index">${index + 1}</span>
                        <span>${escapeHtml(solvedKind)} = ${escapeHtml(solved)}</span>
                        <span>${escapeHtml(PHASE_LABELS[state.phase] || state.phase)}</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

export function renderTrace(container, result, units) {
    if (!result || !result.trace) {
        container.innerHTML = '<div class="empty-state">Interpolation details will appear after a lookup.</div>';
        return;
    }

    const trace = result.trace;
    if (trace.type === 'saturation') {
        container.innerHTML = renderSaturationTrace(trace, units);
        return;
    }
    if (trace.type === 'mixture') {
        container.innerHTML = `
            <h3>${escapeHtml(trace.title)}</h3>
            <p class="trace-note">Quality blend at x = ${formatNumber(trace.x, 7)} after saturation interpolation.</p>
            ${renderQualityBlendFormulas(trace, units)}
            ${renderSaturationTrace(trace.saturation, units)}
        `;
        return;
    }
    if (trace.type === 'pt') {
        container.innerHTML = renderPtTrace(trace, units);
        return;
    }
    if (trace.type === 'reverse-two-phase') {
        container.innerHTML = `
            <h3>Reverse two-phase bounds</h3>
            <p class="trace-note">The target property fell between saturated liquid and saturated vapor bounds.</p>
            ${renderReverseQualityFormula(trace, units)}
            ${renderSaturationTrace(trace.saturation, units)}
        `;
        return;
    }
    if (trace.type === 'reverse') {
        container.innerHTML = renderReverseTrace(trace, units);
        return;
    }

    container.innerHTML = '<div class="empty-state">No interpolation trace is available for this result.</div>';
}

function renderSaturationTrace(trace, units) {
    const rows = trace.rows || [];
    const formulaKey = trace.axis === 'T' ? 'P' : 'T';
    return `
        <h3>${escapeHtml(trace.title || 'Saturation interpolation')}</h3>
        <p class="trace-note">${escapeHtml(trace.axis)} requested ${formatNumber(trace.requested, 8)}, used ${formatNumber(trace.used, 8)}.</p>
        ${renderLinearFormula({
            title: `${formulaKey} interpolation`,
            solveKind: formulaKey,
            xKind: trace.axis,
            x: trace.used,
            x1: rows[0]?.[trace.axis],
            y1: rows[0]?.[formulaKey],
            x2: rows[1]?.[trace.axis],
            y2: rows[1]?.[formulaKey],
            y: trace.values?.[formulaKey]
        }, units)}
        ${renderRowsTable(rows, ['rowNumber', 'T', 'P', 'vf', 'vg', 'hf', 'hg', 'sf', 'sg'])}
    `;
}

function renderPtTrace(trace, units) {
    const propTrace = trace.propTraces?.h || trace.propTraces?.u || trace.propTraces?.v || trace.propTraces?.s || trace.propTraces?.rho;
    const blocks = propTrace?.perBlock || [];
    const prop = propTrace?.prop || 'h';
    return `
        <h3>Ragged P,T interpolation</h3>
        <p class="trace-note">Temperature is interpolated inside each pressure block, then the intermediate values are blended across pressure.</p>
        <div class="trace-block-grid">
            ${blocks.map((block) => `
                <div class="trace-block">
                    <h4>P = ${formatProperty('P', block.P, units)}</h4>
                    <p>${escapeHtml(block.phase || '')}${block.clamped ? ' (clamped)' : ''}</p>
                    ${renderBlockTemperatureFormula(block, prop, units)}
                    ${renderRowsTable(block.bracketRows || [], ['rowNumber', 'P', 'T', 'phase', 'v', 'u', 'h', 's'])}
                </div>
            `).join('')}
        </div>
        ${renderPressureBlendFormula(propTrace, trace.P, units)}
        <p class="trace-note">Displayed rows are the ${escapeHtml(PROP_LABELS[prop] || prop)} trace; other properties use the same phase-aware table path unless a gap warning is shown.</p>
    `;
}

function renderReverseTrace(trace, units) {
    if (!trace.candidates.length) {
        return `
            <h3>Reverse lookup scan</h3>
            <p class="trace-note">No bracket was found for the requested property.</p>
        `;
    }

    return `
        <h3>Reverse lookup scan</h3>
        <p class="trace-note">The solver scanned adjacent brackets over the unknown axis and used the forward evaluator for each bracket endpoint.</p>
        <div class="candidate-list">
            ${trace.candidates.map((candidate, index) => {
                const b = candidate.bracket;
                if (!b) {
                    const solvedKind = candidate.axis === 'P' ? 'P' : 'T';
                    const solved = candidate.axis === 'P'
                        ? formatProperty('P', candidate.solvedValue, units)
                        : formatProperty('T', candidate.solvedValue, units);
                    return `
                        <div class="candidate-row">
                            <span class="candidate-index">${index + 1}</span>
                            <span>${escapeHtml(solvedKind)} = ${escapeHtml(solved)}</span>
                            <span>${escapeHtml(PHASE_LABELS[candidate.state?.phase] || candidate.state?.phase || 'candidate')}</span>
                        </div>
                    `;
                }
                const xUnit = candidate.axis === 'P' ? unitLabel('P', units) : unitLabel('T', units);
                const x1 = candidate.axis === 'P' ? propertyFromSI('P', b.x1, units) : propertyFromSI('T', b.x1, units);
                const x2 = candidate.axis === 'P' ? propertyFromSI('P', b.x2, units) : propertyFromSI('T', b.x2, units);
                return `
                    <div class="candidate-row">
                        <span class="candidate-index">${index + 1}</span>
                        <span>${formatNumber(x1, 7)} ${escapeHtml(xUnit)} to ${formatNumber(x2, 7)} ${escapeHtml(xUnit)}</span>
                        <span>${escapeHtml(b.phase1)} -> ${escapeHtml(b.phase2)}</span>
                    </div>
                    ${renderInverseFormula(trace.prop, candidate, units)}
                `;
            }).join('')}
        </div>
    `;
}

function renderQualityBlendFormulas(trace, units) {
    const values = trace.saturation?.values || {};
    const formulas = ['v', 'u', 'h', 's']
        .filter((prop) => Number.isFinite(values[`${prop}f`]) && Number.isFinite(values[`${prop}g`]))
        .map((prop) => {
            const f = values[`${prop}f`];
            const g = values[`${prop}g`];
            const y = f + trace.x * (g - f);
            return `${PROP_LABELS[prop]} = ${formatProperty(prop, f, units)} + ${formatNumber(trace.x, 7)} * (${formatProperty(prop, g, units)} - ${formatProperty(prop, f, units)}) = ${formatProperty(prop, y, units)}`;
        });
    if (!formulas.length) {
        return '';
    }
    return `<div class="trace-note">${formulas.map((formula) => `<div>${escapeHtml(formula)}</div>`).join('')}</div>`;
}

function renderReverseQualityFormula(trace, units) {
    if (!Number.isFinite(trace.f) || !Number.isFinite(trace.g) || !Number.isFinite(trace.targetValue)) {
        return '';
    }
    const prop = trace.prop;
    const text = `x = (${formatProperty(prop, trace.targetValue, units)} - ${formatProperty(prop, trace.f, units)}) / (${formatProperty(prop, trace.g, units)} - ${formatProperty(prop, trace.f, units)}) = ${formatNumber(trace.x, 7)}`;
    return `<p class="trace-note">${escapeHtml(text)}</p>`;
}

function renderBlockTemperatureFormula(block, prop, units) {
    const rows = block.bracketRows || [];
    return renderLinearFormula({
        title: `${PROP_LABELS[prop] || prop} at P=${formatProperty('P', block.P, units)}`,
        solveKind: prop,
        xKind: 'T',
        x: block.T,
        x1: rows[0]?.T,
        y1: rows[0]?.[prop],
        x2: rows[1]?.T,
        y2: rows[1]?.[prop],
        y: block.value
    }, units);
}

function renderPressureBlendFormula(propTrace, P, units) {
    const blocks = propTrace?.perBlock || [];
    if (blocks.length !== 2 || !Number.isFinite(propTrace.value)) {
        return '';
    }
    return renderLinearFormula({
        title: `Final ${PROP_LABELS[propTrace.prop] || propTrace.prop} pressure blend`,
        solveKind: propTrace.prop,
        xKind: 'P',
        x: P,
        x1: blocks[0].P,
        y1: blocks[0].value,
        x2: blocks[1].P,
        y2: blocks[1].value,
        y: propTrace.value
    }, units);
}

function renderInverseFormula(prop, candidate, units) {
    const b = candidate.bracket;
    if (!b) {
        return '';
    }
    const axisKind = candidate.axis;
    const solved = candidate.solvedValue;
    const text = `${axisKind} = ${formatProperty(axisKind, b.x1, units)} + (${formatProperty(axisKind, b.x2, units)} - ${formatProperty(axisKind, b.x1, units)}) * (${formatProperty(prop, candidate.state.values[prop], units)} - ${formatProperty(prop, b.y1, units)}) / (${formatProperty(prop, b.y2, units)} - ${formatProperty(prop, b.y1, units)}) = ${formatProperty(axisKind, solved, units)}`;
    return `<p class="trace-note">${escapeHtml(text)}</p>`;
}

function renderLinearFormula({ title, solveKind, xKind, x, x1, y1, x2, y2, y }, units) {
    if (![x1, y1, x2, y2, y].every(Number.isFinite)) {
        return '';
    }
    const xText = Number.isFinite(x) ? formatProperty(xKind, x, units) : `${formatProperty(xKind, x1, units)}..${formatProperty(xKind, x2, units)}`;
    if (Math.abs(x2 - x1) <= Math.max(1e-12, Math.abs(x1) * 1e-12, Math.abs(x2) * 1e-12)) {
        const direct = `${title}: ${PROP_LABELS[solveKind] || solveKind}(${xText}) = ${formatProperty(solveKind, y, units)} from the exact table row.`;
        return `<p class="trace-note">${escapeHtml(direct)}</p>`;
    }
    const text = `${title}: ${PROP_LABELS[solveKind] || solveKind}(${xText}) = ${formatProperty(solveKind, y1, units)} + (${formatProperty(solveKind, y2, units)} - ${formatProperty(solveKind, y1, units)}) * (${xText} - ${formatProperty(xKind, x1, units)}) / (${formatProperty(xKind, x2, units)} - ${formatProperty(xKind, x1, units)}) = ${formatProperty(solveKind, y, units)}`;
    return `<p class="trace-note">${escapeHtml(text)}</p>`;
}

function renderRowsTable(rows, columns) {
    if (!rows.length) {
        return '<div class="empty-state compact">No rows available.</div>';
    }

    return `
        <div class="trace-table-wrap">
            <table class="trace-table">
                <thead>
                    <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
                </thead>
                <tbody>
                    ${rows.map((row) => `
                        <tr>
                            ${columns.map((column) => `<td>${escapeHtml(formatCell(row[column]))}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

export function renderTests(container, report) {
    if (!report) {
        container.innerHTML = '<div class="empty-state">Run tests to compare interpolation paths against the vendored CSV rows.</div>';
        return;
    }

    const statusClass = report.failed ? 'fail' : 'pass';
    container.innerHTML = `
        <div class="test-summary ${statusClass}">
            <strong>${report.passed} passed</strong>
            <span>${report.failed} failed</span>
        </div>
        <div class="test-list">
            ${report.tests.map((test) => `
                <details class="test-row ${test.pass ? 'pass' : 'fail'}">
                    <summary>
                        <span>${test.pass ? 'PASS' : 'FAIL'}</span>
                        <strong>${escapeHtml(test.name)}</strong>
                    </summary>
                    <p class="test-description">${escapeHtml(describeTest(test.name))}</p>
                    <p class="test-detail">${escapeHtml(test.details || detailText(test))}</p>
                </details>
            `).join('')}
        </div>
    `;
}

function describeTest(name) {
    if (name.includes('row count')) {
        return 'Confirms the parser loaded the expected number of data rows from the vendored CSV file.';
    }
    if (name.includes('incomplete row count')) {
        return 'Confirms known source-table gaps are detected and tracked instead of being used silently.';
    }
    if (name.includes('saturation tables have no incomplete rows')) {
        return 'Checks that the dedicated saturation tables are complete before they are used for saturation and quality calculations.';
    }
    if (name.includes('critical row check')) {
        return 'Verifies the last saturation-table row matches the pinned critical pressure and temperature constants.';
    }
    if (name.startsWith('sat by T exact row')) {
        return 'Looks up an exact saturated-by-temperature CSV row and confirms the output reproduces the source values.';
    }
    if (name.startsWith('sat by P exact row')) {
        return 'Looks up an exact saturated-by-pressure CSV row and confirms the output reproduces the source values.';
    }
    if (name.startsWith('midpoint')) {
        return 'Checks one-dimensional interpolation halfway between two neighboring saturation rows.';
    }
    if (name.startsWith('P,T exact combined row')) {
        return 'Looks up an exact compressed/superheated/supercritical table row and confirms every property matches the CSV.';
    }
    if (name.includes('common T invariant')) {
        return 'Checks that ragged pressure-block interpolation evaluates every property at the same effective temperature.';
    }
    if (name.includes('derived rho equals inverse v')) {
        return 'Confirms density is derived from specific volume after interpolation so rho and v remain internally consistent.';
    }
    if (name.includes('routing')) {
        return 'Checks phase classification around critical and subcritical boundaries.';
    }
    if (name.includes('reverse P,')) {
        return 'Runs a fixed-pressure reverse lookup and confirms it recovers the original temperature candidate.';
    }
    if (name.includes('reverse T,')) {
        return 'Runs a fixed-temperature reverse lookup and confirms it recovers the expected pressure or saturation-bound state.';
    }
    if (name.includes('saturation bounds')) {
        return 'Confirms reverse lookups inside saturated-liquid/vapor bounds return a two-phase quality result directly.';
    }
    if (name.includes('table gap')) {
        return 'Confirms an incomplete source row reports a visible table-gap result instead of clamping to a different state.';
    }
    if (name.includes('outside raw table extent')) {
        return 'Confirms requests outside the raw table extent clamp to the common complete temperature domain with an explicit warning.';
    }
    if (name.includes('exact pressure block')) {
        return 'Confirms an exact pressure-block lookup does not borrow rows from a neighboring pressure block.';
    }
    if (name.includes('pressure property display')) {
        return 'Checks pressure unit conversion from internal MPa into the selected display unit.';
    }
    if (name.includes('unit round trip')) {
        return 'Converts a representative value to US customary units and back to SI to catch unit-conversion drift.';
    }
    return 'Checks one internal consistency rule for the steam-table parser, interpolator, reverse solver, or unit converter.';
}

function detailText(test) {
    if (test.pass) {
        return 'matched';
    }
    return `expected ${test.expected}, actual ${test.actual}`;
}

function formatCell(value) {
    if (typeof value === 'number') {
        return formatNumber(value, 8);
    }
    return value ?? '';
}
