import * as forward from './forward.js';
import * as reverse from './reverse.js';
import * as selfTests from './self-tests.js';
import { PHASE_LABELS } from './constants.js';
import { loadSteamTables } from './tables.js';

export async function createSteamEngine() {
    const tables = await loadSteamTables();
    return new SteamEngine(tables);
}

export class SteamEngine {
    constructor(tables) {
        this.tables = tables;
    }

    saturationByT(T) {
        return forward.saturationByT.call(this, T);
    }

    saturationByP(P) {
        return forward.saturationByP.call(this, P);
    }

    mixtureByT(T, x) {
        return forward.mixtureByT.call(this, T, x);
    }

    mixtureByP(P, x) {
        return forward.mixtureByP.call(this, P, x);
    }

    mixture(sat, x, axis) {
        return forward.mixture.call(this, sat, x, axis);
    }

    statePT(P, T, options = {}) {
        return forward.statePT.call(this, P, T, options);
    }

    reverse(axis, prop, fixedValue, targetValue) {
        return reverse.reverse.call(this, axis, prop, fixedValue, targetValue);
    }

    evaluatePT(P, T, options = {}) {
        return forward.evaluatePT.call(this, P, T, options);
    }

    classifyPT(P, T, phaseHint = null) {
        return forward.classifyPT.call(this, P, T, phaseHint);
    }

    onDomeResult(P, T, classification) {
        return forward.onDomeResult.call(this, P, T, classification);
    }

    interpolateBlockProperty(block, T, prop, targetPhase, phaseHint = null) {
        return forward.interpolateBlockProperty.call(this, block, T, prop, targetPhase, phaseHint);
    }

    commonStateTemperature(blocks, requestedT, targetPhase, phaseHint = null) {
        return forward.commonStateTemperature.call(this, blocks, requestedT, targetPhase, phaseHint);
    }

    reverseAtP(prop, P, targetValue) {
        return reverse.reverseAtP.call(this, prop, P, targetValue);
    }

    reverseAtT(prop, T, targetValue) {
        return reverse.reverseAtT.call(this, prop, T, targetValue);
    }

    reversePhasePlanAtP(prop, P, targetValue) {
        return reverse.reversePhasePlanAtP.call(this, prop, P, targetValue);
    }

    reversePhasePlanAtT(prop, T, targetValue) {
        return reverse.reversePhasePlanAtT.call(this, prop, T, targetValue);
    }

    twoPhaseReverseResult(axis, prop, fixedValue, targetValue, sat, f, g) {
        return reverse.twoPhaseReverseResult.call(this, axis, prop, fixedValue, targetValue, sat, f, g);
    }

    scanAxis(grid, evaluate, prop, targetValue, phaseHints) {
        return reverse.scanAxis.call(this, grid, evaluate, prop, targetValue, phaseHints);
    }

    reverseResult(axis, prop, fixedValue, targetValue, candidates, warnings) {
        return reverse.reverseResult.call(this, axis, prop, fixedValue, targetValue, candidates, warnings);
    }

    temperatureGridForP(P, phaseHints) {
        return reverse.temperatureGridForP.call(this, P, phaseHints);
    }

    pressureGridForT(T) {
        return reverse.pressureGridForT.call(this, T);
    }

    globalMinT() {
        return reverse.globalMinT.call(this);
    }

    globalMaxT() {
        return reverse.globalMaxT.call(this);
    }

    async runInternalTests() {
        return selfTests.runInternalTests.call(this);
    }

    saturationExactTests() {
        return selfTests.saturationExactTests.call(this);
    }

    saturationMidpointTests() {
        return selfTests.saturationMidpointTests.call(this);
    }

    forwardExactTests() {
        return selfTests.forwardExactTests.call(this);
    }

    forwardInvariantTests() {
        return selfTests.forwardInvariantTests.call(this);
    }

    derivedDensityTests() {
        return selfTests.derivedDensityTests.call(this);
    }

    reverseRoundTripTests() {
        return selfTests.reverseRoundTripTests.call(this);
    }

    reverseTwoPhaseTests() {
        return selfTests.reverseTwoPhaseTests.call(this);
    }

    tableGapTests() {
        return selfTests.tableGapTests.call(this);
    }

    criticalPointTests() {
        return selfTests.criticalPointTests.call(this);
    }
}

export { PHASE_LABELS };
