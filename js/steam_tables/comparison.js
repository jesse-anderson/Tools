import { COMPARISON_ROWS } from './modes.js';
import {
    formatNumber,
    formatProperty,
    propertyDeltaFromSI,
    propertyFromSI,
    unitLabel
} from './units.js';
import { escapeHtml, phaseClass } from './html.js';

export function makePinnedState(slot, payload, result) {
    return {
        slot,
        generatedAt: payload.generatedAt,
        lookupMode: payload.lookupMode,
        result: {
            kind: payload.result.kind,
            phase: payload.result.phase,
            phaseLabel: payload.result.phaseLabel,
            values: { ...(result.values || {}) }
        },
        inputs: payload.inputs
    };
}

export function renderComparisonPanel(container, pinnedStateA, pinnedStateB, units) {
    if (!container) {
        return;
    }

    if (!pinnedStateA && !pinnedStateB) {
        container.innerHTML = '<div class="empty-state">Pin State A and State B to compare property deltas.</div>';
        return;
    }

    container.innerHTML = `
        <div class="comparison-pins">
            ${renderPinnedCard('A', pinnedStateA, units)}
            ${renderPinnedCard('B', pinnedStateB, units)}
        </div>
        ${pinnedStateA && pinnedStateB ? renderComparisonTable(pinnedStateA, pinnedStateB, units) : '<div class="empty-state compact">Pin the second state to show deltas.</div>'}
    `;
}

function renderPinnedCard(slot, pin, units) {
    if (!pin) {
        return `
            <div class="comparison-card empty">
                <strong>State ${slot}</strong>
                <span>Not pinned</span>
            </div>
        `;
    }

    const values = pin.result.values || {};
    const summaryRows = ['P', 'T', 'x', 'h', 's']
        .filter((key) => Number.isFinite(values[key]))
        .map((key) => `<span>${escapeHtml(key)} ${escapeHtml(formatValue(key, values[key], units))}</span>`)
        .join('');
    const inputRows = pin.inputs
        .map((input) => `<span>${escapeHtml(input.label)}: ${escapeHtml(formatInput(input, units))}</span>`)
        .join('');
    const phase = pin.result.phase
        ? `<span class="phase-chip ${phaseClass(pin.result.phase)}">${escapeHtml(pin.result.phaseLabel)}</span>`
        : '';

    return `
        <div class="comparison-card">
            <div class="comparison-card-header">
                <strong>State ${slot}</strong>
                ${phase}
            </div>
            <span>${escapeHtml(pin.lookupMode.label)}</span>
            <div class="comparison-inputs">${inputRows}</div>
            <div class="comparison-mini">${summaryRows || '<span>No comparable properties</span>'}</div>
        </div>
    `;
}

function renderComparisonTable(pinA, pinB, units) {
    const valuesA = pinA.result.values || {};
    const valuesB = pinB.result.values || {};
    const rows = COMPARISON_ROWS.filter(([key]) => Number.isFinite(valuesA[key]) && Number.isFinite(valuesB[key]));

    if (!rows.length) {
        return '<div class="empty-state compact">The pinned states do not share numeric state properties.</div>';
    }

    return `
        <div class="trace-table-wrap comparison-table-wrap">
            <table class="trace-table comparison-table">
                <thead>
                    <tr>
                        <th>Property</th>
                        <th>State A</th>
                        <th>State B</th>
                        <th>Delta B - A</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(([key, label, kind]) => `
                        <tr>
                            <td>${escapeHtml(label)}</td>
                            <td>${escapeHtml(formatValue(kind, valuesA[key], units))}</td>
                            <td>${escapeHtml(formatValue(kind, valuesB[key], units))}</td>
                            <td>${escapeHtml(formatDelta(kind, valuesB[key] - valuesA[key], units))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function formatValue(kind, value, units) {
    if (kind === 'x') {
        return formatNumber(value, 7);
    }
    return formatProperty(kind, value, units);
}

function formatInput(input, units) {
    if (input.kind === 'x') {
        return formatNumber(input.siValue, 7);
    }
    const value = propertyFromSI(input.kind, input.siValue, units);
    return `${formatNumber(value, 7)} ${unitLabel(input.kind, units)}`;
}

function formatDelta(kind, value, units) {
    if (kind === 'x') {
        return signedNumber(value);
    }
    return `${signedNumber(propertyDeltaFromSI(kind, value, units))} ${unitLabel(kind, units)}`;
}

function signedNumber(value) {
    const text = formatNumber(value, 7);
    if (value > 0) {
        return `+${text}`;
    }
    return text;
}
