import { DOME_EPS_C } from './constants.js';
import { interpolateSaturation } from './tables.js';

export function allowedPhasesForTarget(targetPhase, phaseHint) {
    const phase = phaseHint || targetPhase;
    if (phase === 'liquid') {
        return ['liquid', 'saturated liquid'];
    }
    if (phase === 'vapor') {
        return ['saturated vapor', 'vapor'];
    }
    if (phase === 'supercritical fluid') {
        return ['supercritical fluid', 'vapor'];
    }
    return [phase];
}

export function phaseRowsForProperty(block, prop, targetPhase, phaseHint) {
    const allowed = allowedPhasesForTarget(targetPhase, phaseHint);
    return block.rows.filter((row) => allowed.includes(row.phase) && !row.incomplete && row[prop] !== null);
}

export function phaseRowsForTarget(block, targetPhase, phaseHint) {
    const allowed = allowedPhasesForTarget(targetPhase, phaseHint);
    return block.rows.filter((row) => allowed.includes(row.phase));
}

export function pressureBlocksForBracket(tables, pBracket, P) {
    const blocks = [tables.blocks[pBracket.lowIndex]];
    const exactLow = Math.abs(P - pBracket.low) <= Math.max(1e-12, Math.abs(pBracket.low) * 1e-12);
    if (!exactLow && pBracket.highIndex !== pBracket.lowIndex) {
        blocks.push(tables.blocks[pBracket.highIndex]);
    }
    return blocks;
}

export function classifyBlockPhase(P, T, tables, targetPhase, phaseHint) {
    if (phaseHint === 'liquid') {
        return 'liquid';
    }
    if (phaseHint === 'vapor') {
        return 'vapor';
    }
    if (phaseHint === 'supercritical fluid') {
        return 'supercritical fluid';
    }

    if (P <= tables.pCrit) {
        const sat = interpolateSaturation(tables.satP, P);
        if (Math.abs(T - sat.values.T) <= DOME_EPS_C) {
            return targetPhase === 'liquid' ? 'liquid' : 'vapor';
        }
        return T < sat.values.T ? 'liquid' : 'vapor';
    }
    if (T < tables.tCrit) {
        return 'liquid';
    }
    return 'supercritical fluid';
}

export function phaseHintForT(P, T, tables, allowed) {
    if (allowed.length === 1) {
        return allowed[0];
    }
    if (P <= tables.pCrit) {
        const sat = interpolateSaturation(tables.satP, P);
        return T < sat.values.T ? 'liquid' : 'vapor';
    }
    return T < tables.tCrit ? 'liquid' : 'supercritical fluid';
}

export function phaseHintForP(T, P, tables, allowed) {
    if (allowed.length === 1) {
        return allowed[0];
    }
    if (T <= tables.tCrit && P <= tables.pCrit) {
        const sat = interpolateSaturation(tables.satT, T);
        return P > sat.values.P ? 'liquid' : 'vapor';
    }
    if (T > tables.tCrit && P <= tables.pCrit) {
        return 'vapor';
    }
    return T > tables.tCrit ? 'supercritical fluid' : 'liquid';
}

export function isAllowedPhase(phase, allowed) {
    return allowed.includes(normalizeScanPhase(phase));
}

export function normalizeScanPhase(phase) {
    if (phase === 'saturated liquid') return 'liquid';
    if (phase === 'saturated vapor') return 'vapor';
    return phase;
}

export function rowsForUniqueTemperatures(rows) {
    const map = new Map();
    for (const row of rows) {
        if (!map.has(row.T)) {
            map.set(row.T, row);
        }
    }
    return Array.from(map.values()).sort((a, b) => a.T - b.T);
}

export function clamp(value, min, max) {
    if (value < min) {
        return { value: min, clamped: 'low' };
    }
    if (value > max) {
        return { value: max, clamped: 'high' };
    }
    return { value, clamped: null };
}

export function clampWarnings(interpolation, axis) {
    if (!interpolation.clamped) {
        return [];
    }
    return [`${axis} was clamped from ${interpolation.requested} to ${interpolation.used}.`];
}

export function mix(f, g, x) {
    return f + x * (g - f);
}

export function saturationTrace(title, axis, sat) {
    return {
        type: 'saturation',
        title,
        axis,
        requested: sat.requested,
        used: sat.used,
        clamped: sat.clamped,
        values: sat.values,
        rows: sat.bracketRows
    };
}

export function uniqueMessages(messages) {
    return Array.from(new Set(messages.filter(Boolean)));
}

export function dedupeSolved(items) {
    const result = [];
    for (const item of items) {
        if (!result.some((existing) => {
            const tolerance = Math.max(1e-7, Math.abs(existing.x) * 1e-7, Math.abs(item.x) * 1e-7);
            return Math.abs(existing.x - item.x) <= tolerance;
        })) {
            result.push(item);
        }
    }
    return result;
}

export function sensitivity(axis, x1, y1, x2, y2, targetValue) {
    const slope = (y2 - y1) / (x2 - x1);
    if (Math.abs(slope) < 1e-14) {
        return { axis, axisUncertainty: Infinity, slope };
    }
    const epsilon = Math.max(Math.abs(targetValue) * 1e-6, 1e-9);
    return {
        axis,
        axisUncertainty: Math.abs(epsilon / slope),
        slope
    };
}
