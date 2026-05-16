import { PHASE_LABELS } from './constants.js';
import { RESULT_ROWS } from './modes.js';
import {
    formatNumber,
    formatProperty,
    inputUnitLabel,
    propertyFromSI,
    unitLabel
} from './units.js';

export function buildStatePayload({ modeKey, mode, activeValues, result, units }) {
    if (!result || !activeValues) {
        return null;
    }

    return {
        generatedAt: new Date().toISOString(),
        lookupMode: {
            key: modeKey,
            label: mode.label
        },
        units,
        inputs: mode.fields.map((field) => inputPayloadRow(field, activeValues[field.id], units)),
        result: {
            kind: result.kind || 'lookup',
            phase: result.phase || '',
            phaseLabel: result.phase ? PHASE_LABELS[result.phase] || result.phase : '',
            rows: buildResultRows(result, units),
            warnings: result.warnings || []
        }
    };
}

export async function copyText(text, button) {
    if (typeof Clipboard !== 'undefined') {
        return Clipboard.copy(text, button);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
    }
    return false;
}

export function downloadStatePayload(payload, format) {
    const timestamp = payload.generatedAt.replace(/[:.]/g, '-');
    const isCsv = format === 'csv';
    const filename = `steam-table-state-${timestamp}.${isCsv ? 'csv' : 'json'}`;
    const body = isCsv ? payloadToCsv(payload) : `${JSON.stringify(payload, null, 2)}\n`;
    downloadText(filename, isCsv ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8', body);
    return filename;
}

export function payloadToText(payload) {
    const lines = [
        'Steam Tables Lookup',
        `Generated at: ${payload.generatedAt}`,
        `Mode: ${payload.lookupMode.label}`,
        `Units: ${payload.units.system.toUpperCase()} / ${payload.units.pressure}`,
        payload.result.phaseLabel ? `Phase: ${payload.result.phaseLabel}` : '',
        '',
        'Inputs:'
    ].filter((line) => line !== '');

    for (const input of payload.inputs) {
        lines.push(`${input.label}: ${formatNumber(input.value, 8)}${input.unit ? ` ${input.unit}` : ''}`);
    }

    lines.push('', 'Results:');
    for (const row of payload.result.rows) {
        lines.push(`${row.label}: ${row.display}`);
    }

    if (payload.result.warnings.length) {
        lines.push('', 'Warnings:');
        payload.result.warnings.forEach((warning) => lines.push(`- ${warning}`));
    }

    return `${lines.join('\n')}\n`;
}

function inputPayloadRow(field, siValue, units) {
    const displayValue = field.kind === 'x' ? siValue : propertyFromSI(field.kind, siValue, units);
    return {
        id: field.id,
        label: field.label,
        kind: field.kind,
        value: displayValue,
        unit: inputUnitLabel(field.kind, units),
        siValue
    };
}

function buildResultRows(result, units) {
    const values = result.values || {};
    const rows = result.kind === 'saturation' ? RESULT_ROWS.saturation : RESULT_ROWS.state;
    return rows
        .filter(([key]) => values[key] !== undefined && values[key] !== null)
        .map(([key, label, kind]) => {
            const siValue = values[key];
            return {
                key,
                label,
                kind,
                value: kind === 'x' ? siValue : propertyFromSI(kind, siValue, units),
                unit: unitLabel(kind, units),
                siValue,
                display: formatValue(kind, siValue, units)
            };
        });
}

function payloadToCsv(payload) {
    const rows = [
        ['Steam Tables Lookup'],
        ['Generated at', payload.generatedAt],
        ['Lookup mode', payload.lookupMode.label],
        ['Unit system', payload.units.system],
        ['Pressure unit', payload.units.pressure],
        ['Phase', payload.result.phaseLabel],
        [],
        ['Inputs'],
        ['Input', 'Value', 'Unit', 'SI value']
    ];

    for (const input of payload.inputs) {
        rows.push([input.label, formatNumber(input.value, 12), input.unit, formatNumber(input.siValue, 12)]);
    }

    rows.push([], ['Results'], ['Property', 'Value', 'Unit', 'SI value']);
    for (const row of payload.result.rows) {
        rows.push([row.label, formatNumber(row.value, 12), row.unit, formatNumber(row.siValue, 12)]);
    }

    if (payload.result.warnings.length) {
        rows.push([], ['Warnings']);
        payload.result.warnings.forEach((warning) => rows.push([warning]));
    }

    return `${rows.map(csvRow).join('\n')}\n`;
}

function csvRow(row) {
    return row.map((value) => {
        const text = String(value ?? '');
        if (/[",\n\r]/.test(text)) {
            return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
    }).join(',');
}

function downloadText(filename, mimeType, body) {
    const blob = new Blob([body], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatValue(kind, value, units) {
    if (kind === 'x') {
        return formatNumber(value, 7);
    }
    return formatProperty(kind, value, units);
}
