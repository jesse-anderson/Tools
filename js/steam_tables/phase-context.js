import { DOME_EPS_C, PHASE_LABELS } from './constants.js';
import {
    formatNumber,
    formatProperty,
    propertyDeltaFromSI,
    unitLabel
} from './units.js';
import { escapeHtml, phaseClass } from './html.js';

export function renderPhaseContextPanel(container, result, units, engine) {
    if (!container) {
        return;
    }
    if (!result || !result.values || !engine?.tables) {
        container.innerHTML = '<div class="empty-state">Compute a state to see its phase region and saturation distance.</div>';
        return;
    }

    const values = result.values;
    const P = values.P;
    const T = values.T;
    const pCrit = engine.tables.pCrit;
    const tCrit = engine.tables.tCrit;
    const phase = result.phase || 'unavailable';
    const phaseLabel = PHASE_LABELS[phase] || result.phaseLabel || phase;
    const sat = saturationContext(P, T, engine, units);

    container.innerHTML = `
        <div class="phase-context">
            <div class="phase-context-header">
                <span class="phase-chip ${phaseClass(phase)}">${escapeHtml(phaseLabel)}</span>
                <span>${escapeHtml(regionMessage(phase, sat))}</span>
            </div>
            <div class="context-grid">
                ${contextRow('Pressure', Number.isFinite(P) ? formatProperty('P', P, units) : '--')}
                ${contextRow('Temperature', Number.isFinite(T) ? formatProperty('T', T, units) : '--')}
                ${Number.isFinite(values.x) ? contextRow('Quality', formatNumber(values.x, 7)) : ''}
                ${sat.rows}
            </div>
            <div class="context-meters">
                ${criticalMeter('P / Pcrit', P, pCrit)}
                ${criticalMeter('T / Tcrit', T, tCrit)}
            </div>
            <p class="trace-note">Critical point reference: ${escapeHtml(formatProperty('P', pCrit, units))}, ${escapeHtml(formatProperty('T', tCrit, units))}.</p>
        </div>
    `;
}

function saturationContext(P, T, engine, units) {
    if (!Number.isFinite(P) || P > engine.tables.pCrit) {
        return {
            rows: '<div class="context-row"><span>Saturation reference</span><strong>Above critical pressure</strong></div>',
            distance: null
        };
    }

    const sat = engine.saturationByP(P);
    const tsat = sat.values.T;
    const delta = Number.isFinite(T) ? T - tsat : null;
    const distance = Number.isFinite(delta)
        ? `${signedNumber(propertyDeltaFromSI('T', delta, units))} ${unitLabel('T', units)}`
        : '--';
    const label = Number.isFinite(delta) && Math.abs(delta) <= DOME_EPS_C
        ? 'On saturation curve'
        : delta < 0
            ? 'Subcooled below Tsat'
            : 'Superheated above Tsat';

    return {
        rows: `
            ${contextRow('Tsat at P', formatProperty('T', tsat, units))}
            ${contextRow('T - Tsat', distance)}
        `,
        distance: label
    };
}

function regionMessage(phase, sat) {
    if (phase === 'two-phase' || phase === 'saturation' || phase === 'on-dome') {
        return 'Saturation-region state';
    }
    if (sat.distance) {
        return sat.distance;
    }
    if (phase === 'supercritical fluid') {
        return 'Above the critical region';
    }
    return 'Single-phase table region';
}

function contextRow(label, value) {
    return `
        <div class="context-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `;
}

function criticalMeter(label, value, criticalValue) {
    if (!Number.isFinite(value) || !Number.isFinite(criticalValue) || criticalValue <= 0) {
        return '';
    }
    const ratio = value / criticalValue;
    const percent = Math.max(0, Math.min(100, ratio * 100));
    const percentText = Number(percent.toFixed(4)).toString();
    return `
        <div class="context-meter">
            <div>
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(formatNumber(ratio, 5))}</strong>
            </div>
            <meter class="context-meter-bar" min="0" max="100" value="${percentText}" aria-label="${escapeHtml(label)}"></meter>
        </div>
    `;
}

function signedNumber(value) {
    const text = formatNumber(value, 7);
    if (value > 0) {
        return `+${text}`;
    }
    return text;
}
