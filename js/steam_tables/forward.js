import { bracketRows, bracketSorted, lerp } from './interpolate.js';
import { interpolateSaturation } from './tables.js';
import { DOME_EPS_C, PHASE_LABELS, RESULT_PROPS } from './constants.js';
import {
    allowedPhasesForTarget,
    clamp,
    clampWarnings,
    classifyBlockPhase,
    mix,
    phaseRowsForTarget,
    phaseRowsForProperty,
    pressureBlocksForBracket,
    rowsForUniqueTemperatures,
    saturationTrace,
    uniqueMessages
} from './solver-utils.js';

export function saturationByT(T) {
    const sat = interpolateSaturation(this.tables.satT, T);
    const values = {
        T: sat.values.T,
        P: sat.values.P,
        vf: sat.values.vf,
        vg: sat.values.vg,
        uf: sat.values.uf,
        ug: sat.values.ug,
        ufg: sat.values.ufg,
        hf: sat.values.hf,
        hg: sat.values.hg,
        hfg: sat.values.hfg,
        sf: sat.values.sf,
        sg: sat.values.sg,
        sfg: sat.values.sfg
    };
    return {
        kind: 'saturation',
        mode: 'satT',
        phase: 'saturation',
        values,
        warnings: clampWarnings(sat, 'T'),
        trace: saturationTrace('Saturation by T', 'T', sat)
    };
}

export function saturationByP(P) {
    const sat = interpolateSaturation(this.tables.satP, P);
    const values = {
        P: sat.values.P,
        T: sat.values.T,
        vf: sat.values.vf,
        vg: sat.values.vg,
        uf: sat.values.uf,
        ug: sat.values.ug,
        ufg: sat.values.ufg,
        hf: sat.values.hf,
        hg: sat.values.hg,
        hfg: sat.values.hfg,
        sf: sat.values.sf,
        sg: sat.values.sg,
        sfg: sat.values.sfg
    };
    return {
        kind: 'saturation',
        mode: 'satP',
        phase: 'saturation',
        values,
        warnings: clampWarnings(sat, 'P'),
        trace: saturationTrace('Saturation by P', 'P', sat)
    };
}

export function mixtureByT(T, x) {
    return this.mixture(interpolateSaturation(this.tables.satT, T), x, 'T');
}

export function mixtureByP(P, x) {
    return this.mixture(interpolateSaturation(this.tables.satP, P), x, 'P');
}

export function mixture(sat, x, axis) {
    const quality = clamp(x, 0, 1);
    const values = {
        T: sat.values.T,
        P: sat.values.P,
        x: quality.value,
        v: mix(sat.values.vf, sat.values.vg, quality.value),
        u: mix(sat.values.uf, sat.values.ug, quality.value),
        h: mix(sat.values.hf, sat.values.hg, quality.value),
        s: mix(sat.values.sf, sat.values.sg, quality.value)
    };
    values.rho = densityFromSpecificVolume(values.v);
    const warnings = clampWarnings(sat, axis);
    if (quality.clamped) {
        warnings.push(`Quality x was clamped from ${x} to ${quality.value}.`);
    }
    return {
        kind: 'mixture',
        phase: 'two-phase',
        values,
        warnings,
        trace: {
            type: 'mixture',
            title: `Two-phase mixture by ${axis}`,
            axis,
            x: quality.value,
            saturation: saturationTrace(`Saturation by ${axis}`, axis, sat)
        }
    };
}

export function statePT(P, T, options = {}) {
    return this.evaluatePT(P, T, options);
}

export function evaluatePT(P, T, options = {}) {
    const pClamp = clamp(P, this.tables.pressures[0], this.tables.pressures[this.tables.pressures.length - 1]);
    const PUsed = pClamp.value;
    const classification = this.classifyPT(PUsed, T, options.phaseHint);

    if (classification.phase === 'on-dome' && !options.phaseHint) {
        return this.onDomeResult(PUsed, T, classification);
    }

    const pBracket = bracketSorted(this.tables.pressures, PUsed);
    const blocks = pressureBlocksForBracket(this.tables, pBracket, PUsed);

    const stateTemperature = this.commonStateTemperature(blocks, T, classification.phase, options.phaseHint);
    const TUsed = stateTemperature.value;
    const values = { P: PUsed, T: TUsed };
    const propTraces = {};
    const warnings = [];
    if (pClamp.clamped) {
        warnings.push(`Pressure was clamped from ${P} MPa to ${PUsed} MPa.`);
    }
    if (stateTemperature.unavailable) {
        warnings.push(stateTemperature.message);
        for (const prop of RESULT_PROPS) {
            values[prop] = null;
        }
        values.rho = null;
        return {
            kind: 'single',
            phase: classification.phase,
            phaseLabel: PHASE_LABELS[classification.phase] || classification.phase,
            values,
            warnings: uniqueMessages(warnings),
            trace: {
                type: 'pt',
                title: 'Single-phase P,T lookup',
                P: PUsed,
                T: TUsed,
                pBracket,
                propTraces,
                classification
            }
        };
    }
    if (stateTemperature.clamped) {
        warnings.push(`Temperature was clamped from ${T} deg C to ${TUsed} deg C for the common ${classification.phase} table domain.`);
    }

    let mixedPhase = false;
    for (const prop of RESULT_PROPS) {
        const perBlock = blocks.map((block) => this.interpolateBlockProperty(block, TUsed, prop, classification.phase, options.phaseHint));
        if (perBlock.some((item) => item.unavailable)) {
            values[prop] = null;
            warnings.push(`Table gap: ${prop} is unavailable for the requested bracket.`);
            propTraces[prop] = { unavailable: true, prop, perBlock };
            continue;
        }
        perBlock.forEach((item) => {
            if (item.warning) {
                warnings.push(item.warning);
            }
        });
        mixedPhase = mixedPhase || new Set(perBlock.map((item) => item.phase)).size > 1;
        values[prop] = perBlock.length === 1
            ? perBlock[0].value
            : lerp(PUsed, perBlock[0].P, perBlock[0].value, perBlock[1].P, perBlock[1].value);
        propTraces[prop] = { prop, value: values[prop], perBlock };
    }
    values.rho = densityFromSpecificVolume(values.v);

    if (mixedPhase || classification.nearBoundary) {
        warnings.push('Near phase boundary: bracketing rows include mixed phase labels.');
    }

    return {
        kind: 'single',
        phase: classification.phase,
        phaseLabel: PHASE_LABELS[classification.phase] || classification.phase,
        values,
        warnings: uniqueMessages(warnings),
        trace: {
            type: 'pt',
            title: 'Single-phase P,T lookup',
            P: PUsed,
            T: TUsed,
            pBracket,
            propTraces,
            classification
        }
    };
}

function densityFromSpecificVolume(v) {
    return Number.isFinite(v) && v !== 0 ? 1 / v : null;
}

export function classifyPT(P, T, phaseHint = null) {
    const pCrit = this.tables.pCrit;
    const tCrit = this.tables.tCrit;

    if (P <= pCrit) {
        const sat = interpolateSaturation(this.tables.satP, P);
        const tsat = sat.values.T;
        if (Math.abs(T - tsat) <= DOME_EPS_C) {
            if (phaseHint === 'liquid') {
                return { phase: 'liquid', tsat, nearBoundary: true };
            }
            if (phaseHint === 'vapor') {
                return { phase: 'vapor', tsat, nearBoundary: true };
            }
            return { phase: 'on-dome', tsat, nearBoundary: true, sat };
        }
        if (T < tsat) {
            return { phase: 'liquid', tsat };
        }
        return { phase: 'vapor', tsat };
    }

    if (P > pCrit && T < tCrit) {
        return { phase: 'liquid' };
    }
    if (P > pCrit && T > tCrit) {
        return { phase: 'supercritical fluid' };
    }
    return { phase: phaseHint === 'liquid' ? 'liquid' : 'supercritical fluid', nearBoundary: true };
}

export function onDomeResult(P, T, classification) {
    const sat = classification.sat || interpolateSaturation(this.tables.satP, P);
    return {
        kind: 'on-dome',
        phase: 'on-dome',
        values: {
            P,
            T: sat.values.T,
            vf: sat.values.vf,
            vg: sat.values.vg,
            uf: sat.values.uf,
            ug: sat.values.ug,
            hf: sat.values.hf,
            hg: sat.values.hg,
            sf: sat.values.sf,
            sg: sat.values.sg
        },
        warnings: ['P and T lie on the saturation curve. Specify quality x to resolve the state.'],
        trace: saturationTrace('On saturation dome', 'P', sat)
    };
}

export function interpolateBlockProperty(block, T, prop, targetPhase, phaseHint = null) {
    const allowed = allowedPhasesForTarget(targetPhase, phaseHint);
    const rawRows = rowsForUniqueTemperatures(phaseRowsForTarget(block, targetPhase, phaseHint));
    const rawBracket = rawRows.length ? bracketRows(rawRows, T, 'T') : null;
    if (rawBracket && (rawBracket.lowRow.incomplete || rawBracket.highRow.incomplete)) {
        return {
            unavailable: true,
            P: block.P,
            prop,
            phase: targetPhase,
            allowedPhases: allowed,
            bracketRows: [rawBracket.lowRow, rawBracket.highRow],
            reason: `T=${T} deg C crosses incomplete ${targetPhase} rows at P=${block.P} MPa`
        };
    }

    const rows = phaseRowsForProperty(block, prop, targetPhase, phaseHint);
    if (!rows.length) {
        return { unavailable: true, P: block.P, prop, phase: targetPhase, reason: 'no complete rows for phase' };
    }

    const uniqueRows = rowsForUniqueTemperatures(rows);
    const minT = uniqueRows[0].T;
    const maxT = uniqueRows[uniqueRows.length - 1].T;
    if (T < minT || T > maxT) {
        return {
            unavailable: true,
            P: block.P,
            prop,
            phase: targetPhase,
            reason: `T=${T} deg C outside ${targetPhase} block extent ${minT}..${maxT} deg C`
        };
    }

    const bracket = bracketRows(uniqueRows, T, 'T');
    const value = bracket.lowIndex === bracket.highIndex
        ? bracket.lowRow[prop]
        : lerp(T, bracket.low, bracket.lowRow[prop], bracket.high, bracket.highRow[prop]);

    return {
        P: block.P,
        T,
        requestedT: T,
        value,
        prop,
        phase: classifyBlockPhase(block.P, T, this.tables, targetPhase, phaseHint),
        allowedPhases: allowed,
        bracketRows: [bracket.lowRow, bracket.highRow],
        clamped: null,
        warning: null
    };
}

export function commonStateTemperature(blocks, requestedT, targetPhase, phaseHint = null) {
    let minT = -Infinity;
    let maxT = Infinity;

    for (const block of blocks) {
        const rawRows = rowsForUniqueTemperatures(phaseRowsForTarget(block, targetPhase, phaseHint));
        if (!rawRows.length) {
            return {
                value: requestedT,
                unavailable: true,
                message: `Table gap: no ${targetPhase} rows exist at P=${block.P} MPa.`
            };
        }
        const rawMinT = rawRows[0].T;
        const rawMaxT = rawRows[rawRows.length - 1].T;
        const insideRawDomain = requestedT >= rawMinT && requestedT <= rawMaxT;
        const rawBracket = insideRawDomain ? bracketRows(rawRows, requestedT, 'T') : null;
        if (rawBracket && (rawBracket.lowRow.incomplete || rawBracket.highRow.incomplete)) {
            return {
                value: requestedT,
                unavailable: true,
                message: `Table gap: requested T=${requestedT} deg C crosses incomplete ${targetPhase} rows at P=${block.P} MPa.`
            };
        }

        for (const prop of RESULT_PROPS) {
            const rows = phaseRowsForProperty(block, prop, targetPhase, phaseHint);
            if (!rows.length) {
                return {
                    value: requestedT,
                    unavailable: true,
                    message: `Table gap: no complete ${prop} rows for ${targetPhase} at P=${block.P} MPa.`
                };
            }
            const uniqueRows = rowsForUniqueTemperatures(rows);
            if (insideRawDomain && (requestedT < uniqueRows[0].T || requestedT > uniqueRows[uniqueRows.length - 1].T)) {
                return {
                    value: requestedT,
                    unavailable: true,
                    message: `Table gap: requested T=${requestedT} deg C is inside the ${targetPhase} table at P=${block.P} MPa but outside complete ${prop} rows.`
                };
            }
            minT = Math.max(minT, uniqueRows[0].T);
            maxT = Math.min(maxT, uniqueRows[uniqueRows.length - 1].T);
        }
    }

    if (minT > maxT) {
        return {
            value: requestedT,
            unavailable: true,
            message: `Table gap: no common ${targetPhase} temperature domain exists across the bracketing pressure blocks.`
        };
    }

    const clamped = clamp(requestedT, minT, maxT);
    return {
        value: clamped.value,
        clamped: clamped.clamped,
        unavailable: false,
        minT,
        maxT
    };
}
