import { bracketSorted, containsValue, inverseLerp, uniqueSorted } from './interpolate.js';
import { interpolateSaturation, propertyPairForTarget } from './tables.js';
import {
    LOW_CONFIDENCE_PRESSURE_MPA,
    LOW_CONFIDENCE_TEMPERATURE_C,
    VALUE_TOLERANCE
} from './constants.js';
import {
    clamp,
    dedupeSolved,
    isAllowedPhase,
    mix,
    normalizeScanPhase,
    phaseHintForP,
    phaseHintForT,
    pressureBlocksForBracket,
    saturationTrace,
    sensitivity,
    uniqueMessages
} from './solver-utils.js';

export function reverse(axis, prop, fixedValue, targetValue) {
    if (axis === 'P') {
        return this.reverseAtP(prop, fixedValue, targetValue);
    }
    return this.reverseAtT(prop, fixedValue, targetValue);
}

export function reverseAtP(prop, P, targetValue) {
    const warnings = [];
    const candidates = [];
    const pClamp = clamp(P, this.tables.pressures[0], this.tables.pressures[this.tables.pressures.length - 1]);
    const PUsed = pClamp.value;
    if (pClamp.clamped) {
        warnings.push(`Pressure was clamped from ${P} MPa to ${PUsed} MPa.`);
    }

    const phasePlan = this.reversePhasePlanAtP(prop, PUsed, targetValue);
    if (phasePlan.twoPhase) {
        return phasePlan.result;
    }
    warnings.push(...phasePlan.warnings);

    const grid = this.temperatureGridForP(PUsed, phasePlan.phaseHints);
    const solved = this.scanAxis(grid, (T) => {
        const phaseHint = phaseHintForT(PUsed, T, this.tables, phasePlan.phaseHints);
        return this.evaluatePT(PUsed, T, { phaseHint });
    }, prop, targetValue, phasePlan.phaseHints);

    for (const item of solved) {
        const state = this.evaluatePT(PUsed, item.x, { phaseHint: item.phaseHint });
        candidates.push({
            axis: 'T',
            solvedValue: item.x,
            state,
            bracket: item.bracket,
            sensitivity: prop === 'v' ? sensitivity('T', item.bracket.x1, item.bracket.y1, item.bracket.x2, item.bracket.y2, targetValue) : null
        });
    }

    return this.reverseResult('P', prop, PUsed, targetValue, candidates, warnings);
}

export function reverseAtT(prop, T, targetValue) {
    const warnings = [];
    const tClamp = clamp(T, this.globalMinT(), this.globalMaxT());
    const TUsed = tClamp.value;
    if (tClamp.clamped) {
        warnings.push(`Temperature was clamped from ${T} deg C to ${TUsed} deg C.`);
    }

    const phasePlan = this.reversePhasePlanAtT(prop, TUsed, targetValue);
    if (phasePlan.twoPhase) {
        return phasePlan.result;
    }
    warnings.push(...phasePlan.warnings);

    const grid = this.pressureGridForT(TUsed);
    const solved = this.scanAxis(grid, (P) => {
        const phaseHint = phaseHintForP(TUsed, P, this.tables, phasePlan.phaseHints);
        return this.evaluatePT(P, TUsed, { phaseHint });
    }, prop, targetValue, phasePlan.phaseHints);

    const candidates = [...(phasePlan.seedCandidates || [])];
    candidates.push(...solved.map((item) => {
        const state = this.evaluatePT(item.x, TUsed, { phaseHint: item.phaseHint });
        return {
            axis: 'P',
            solvedValue: item.x,
            state,
            bracket: item.bracket,
            sensitivity: prop === 'v' ? sensitivity('P', item.bracket.x1, item.bracket.y1, item.bracket.x2, item.bracket.y2, targetValue) : null
        };
    }));

    return this.reverseResult('T', prop, TUsed, targetValue, candidates, warnings);
}

export function reversePhasePlanAtP(prop, P, targetValue) {
    if (P <= this.tables.pCrit) {
        const sat = interpolateSaturation(this.tables.satP, P);
        const [fKey, gKey] = propertyPairForTarget(prop);
        const f = sat.values[fKey];
        const g = sat.values[gKey];
        const tol = Math.max(VALUE_TOLERANCE, Math.abs(g - f) * 1e-10);
        if (targetValue >= f - tol && targetValue <= g + tol) {
            return { twoPhase: true, result: this.twoPhaseReverseResult('P', prop, P, targetValue, sat, f, g) };
        }
        return {
            twoPhase: false,
            phaseHints: targetValue < f ? ['liquid'] : ['vapor'],
            warnings: []
        };
    }

    return { twoPhase: false, phaseHints: ['liquid', 'supercritical fluid'], warnings: [] };
}

export function reversePhasePlanAtT(prop, T, targetValue) {
    if (T <= this.tables.tCrit) {
        const sat = interpolateSaturation(this.tables.satT, T);
        const [fKey, gKey] = propertyPairForTarget(prop);
        const f = sat.values[fKey];
        const g = sat.values[gKey];
        const tol = Math.max(VALUE_TOLERANCE, Math.abs(g - f) * 1e-10);
        if (targetValue >= f - tol && targetValue <= g + tol) {
            const twoPhase = this.twoPhaseReverseResult('T', prop, T, targetValue, sat, f, g);
            return { twoPhase: true, result: twoPhase };
        }
        return {
            twoPhase: false,
            phaseHints: targetValue < f ? ['liquid'] : ['vapor'],
            warnings: []
        };
    }

    return { twoPhase: false, phaseHints: ['vapor', 'supercritical fluid'], warnings: [] };
}

export function twoPhaseReverseResult(axis, prop, fixedValue, targetValue, sat, f, g) {
    const x = Math.min(1, Math.max(0, (targetValue - f) / (g - f)));
    const values = {
        P: sat.values.P,
        T: sat.values.T,
        x,
        v: mix(sat.values.vf, sat.values.vg, x),
        u: mix(sat.values.uf, sat.values.ug, x),
        h: mix(sat.values.hf, sat.values.hg, x),
        s: mix(sat.values.sf, sat.values.sg, x)
    };
    values.rho = Number.isFinite(values.v) && values.v !== 0 ? 1 / values.v : null;
    return {
        kind: 'reverse',
        axis,
        prop,
        fixedValue,
        targetValue,
        phase: 'two-phase',
        values,
        candidates: [{ axis: axis === 'P' ? 'T' : 'P', solvedValue: axis === 'P' ? values.T : values.P, state: { kind: 'mixture', phase: 'two-phase', values, warnings: [] } }],
        warnings: [],
        trace: {
            type: 'reverse-two-phase',
            axis,
            prop,
            targetValue,
            f,
            g,
            x,
            saturation: saturationTrace(`Reverse ${axis},${prop} saturation bounds`, axis, sat)
        }
    };
}

export function scanAxis(grid, evaluate, prop, targetValue, phaseHints) {
    const solved = [];
    const points = grid.map((x) => {
        const state = evaluate(x);
        const value = state.values ? state.values[prop] : null;
        const phase = state.phase;
        return { x, state, value, phase };
    }).filter((point) => point.value !== null && point.value !== undefined && Number.isFinite(point.value));

    for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        if (!isAllowedPhase(a.phase, phaseHints) || !isAllowedPhase(b.phase, phaseHints)) {
            continue;
        }
        if (!containsValue(targetValue, a.value, b.value, Math.max(1e-8, Math.abs(targetValue) * 1e-8))) {
            continue;
        }
        const x = inverseLerp(targetValue, a.x, a.value, b.x, b.value);
        const phaseHint = a.phase === b.phase ? a.phase : phaseHints[0];
        solved.push({
            x,
            phaseHint,
            bracket: {
                x1: a.x,
                y1: a.value,
                phase1: a.phase,
                x2: b.x,
                y2: b.value,
                phase2: b.phase
            }
        });
    }

    return dedupeSolved(solved);
}

export function reverseResult(axis, prop, fixedValue, targetValue, candidates, warnings) {
    const notices = [...warnings];
    const lowConfidenceTemperature = candidates.filter((candidate) => candidate.sensitivity?.axis === 'T' && candidate.sensitivity.axisUncertainty > LOW_CONFIDENCE_TEMPERATURE_C);
    const lowConfidencePressure = candidates.filter((candidate) => candidate.sensitivity?.axis === 'P' && candidate.sensitivity.axisUncertainty > LOW_CONFIDENCE_PRESSURE_MPA);
    if (lowConfidenceTemperature.length) {
        notices.push(`Low-confidence v inversion: compressed-liquid sensitivity maps small v differences to more than ${LOW_CONFIDENCE_TEMPERATURE_C} deg C uncertainty.`);
    }
    if (lowConfidencePressure.length) {
        notices.push(`Low-confidence v inversion: compressed-liquid sensitivity maps small v differences to more than ${LOW_CONFIDENCE_PRESSURE_MPA} MPa uncertainty.`);
    }
    if (candidates.length > 1) {
        notices.push('Multiple valid candidates were found; review the candidate list rather than treating the first as unique.');
    }
    if (!candidates.length) {
        notices.push('No valid bracket was found for this reverse lookup inside the combined table domain.');
    }

    const primary = candidates[0]?.state || null;
    return {
        kind: 'reverse',
        axis,
        prop,
        fixedValue,
        targetValue,
        phase: primary?.phase || 'unavailable',
        values: primary?.values || {},
        candidates,
        warnings: uniqueMessages(notices),
        trace: {
            type: 'reverse',
            axis,
            prop,
            fixedValue,
            targetValue,
            candidates
        }
    };
}

export function temperatureGridForP(P, phaseHints) {
    const pBracket = bracketSorted(this.tables.pressures, P);
    const blocks = pressureBlocksForBracket(this.tables, pBracket, P);
    const values = [];
    for (const block of blocks) {
        for (const row of block.rows) {
            if (!row.incomplete && isAllowedPhase(normalizeScanPhase(row.phase), phaseHints)) {
                values.push(row.T);
            }
        }
    }
    return uniqueSorted(values);
}

export function pressureGridForT(T) {
    return this.tables.blocks
        .filter((block) => {
            if (block.completeMinT === null || block.completeMaxT === null) {
                return false;
            }
            return T >= block.completeMinT && T <= block.completeMaxT;
        })
        .map((block) => block.P);
}

export function globalMinT() {
    return this.tables.globalMinT;
}

export function globalMaxT() {
    return this.tables.globalMaxT;
}
