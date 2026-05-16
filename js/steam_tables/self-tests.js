import { lerp } from './interpolate.js';
import { runUnitRoundTripTests } from './units.js';

export async function runInternalTests() {
    const tests = [];
    tests.push(rowCountTest('saturated_by_T row count', 'data/steam_tables/saturated_by_T.csv', 375, this.tables.satT.rows.length));
    tests.push(rowCountTest('saturated_by_P row count', 'data/steam_tables/saturated_by_P.csv', 277, this.tables.satP.rows.length));
    tests.push(rowCountTest('combined table row count', 'data/steam_tables/compressed_and_superheated.csv', 9527, this.tables.combinedRows.length));
    tests.push(rowCountTest('combined table incomplete row count', 'data/steam_tables/compressed_and_superheated.csv', 3, this.tables.incompleteRows.length));
    tests.push({
        name: 'saturation tables have no incomplete rows',
        pass: this.tables.saturationIncompleteRows.length === 0,
        expected: 0,
        actual: this.tables.saturationIncompleteRows.length
    });
    tests.push(...this.criticalPointTests());

    tests.push(...this.saturationExactTests());
    tests.push(...this.saturationMidpointTests());
    tests.push(...this.forwardExactTests());
    tests.push(...this.forwardInvariantTests());
    tests.push(...this.derivedDensityTests());
    tests.push(...this.tableGapTests());
    tests.push(...this.reverseRoundTripTests());
    tests.push(...this.reverseTwoPhaseTests());
    tests.push(...runUnitRoundTripTests());

    return {
        passed: tests.filter((test) => test.pass).length,
        failed: tests.filter((test) => !test.pass).length,
        tests
    };
}

function rowCountTest(name, filePath, expected, actual) {
    const pass = actual === expected;
    return {
        name,
        pass,
        expected,
        actual,
        details: pass
            ? `matched ${filePath}`
            : `expected ${expected}, actual ${actual} in ${filePath}; if the vendored CSV was intentionally refreshed, review parser assumptions and update the expected count.`
    };
}

export function saturationExactTests() {
    const checks = [];
    for (const row of sampleRows(this.tables.satT.rows, 8)) {
        const result = this.saturationByT(row.T);
        checks.push(compareProps(`sat by T exact row ${row.rowNumber}`, result.values, row, ['P', 'vf', 'vg', 'hf', 'hg', 'sf', 'sg']));
    }
    for (const row of sampleRows(this.tables.satP.rows, 8)) {
        const result = this.saturationByP(row.P);
        checks.push(compareProps(`sat by P exact row ${row.rowNumber}`, result.values, row, ['T', 'vf', 'vg', 'hf', 'hg', 'sf', 'sg']));
    }
    return checks;
}

export function saturationMidpointTests() {
    const tests = [];
    const pairs = [
        [this.tables.satT.rows[50], this.tables.satT.rows[51], 'T', 'h_f', 'hf'],
        [this.tables.satT.rows[120], this.tables.satT.rows[121], 'T', 's_g', 'sg'],
        [this.tables.satP.rows[40], this.tables.satP.rows[41], 'P', 'h_g', 'hg'],
        [this.tables.satP.rows[180], this.tables.satP.rows[181], 'P', 'v_f', 'vf']
    ];
    for (const [a, b, axis, label, key] of pairs) {
        const x = (a[axis] + b[axis]) / 2;
        const expected = lerp(x, a[axis], a[key], b[axis], b[key]);
        const result = axis === 'T' ? this.saturationByT(x) : this.saturationByP(x);
        tests.push(singleCompare(`midpoint ${axis} ${label}`, expected, result.values[key]));
    }
    return tests;
}

export function forwardExactTests() {
    const rows = this.tables.combinedRows.filter((row) => !row.incomplete && !row.phase.startsWith('saturated'));
    return sampleRows(rows, 12).map((row) => {
        const hint = row.phase === 'liquid' ? 'liquid' : row.phase === 'vapor' ? 'vapor' : 'supercritical fluid';
        const result = this.evaluatePT(row.P, row.T, { phaseHint: hint });
        return compareProps(`P,T exact combined row ${row.rowNumber}`, result.values, row, ['v', 'u', 'h', 's']);
    });
}

export function forwardInvariantTests() {
    const cases = [
        { name: 'subcritical vapor common T invariant', P: 0.101325, T: 200, phaseHint: 'vapor' },
        { name: 'compressed liquid common T invariant', P: 1, T: 50, phaseHint: 'liquid' },
        { name: 'supercritical common T invariant', P: 25, T: 500, phaseHint: 'supercritical fluid' },
        { name: 'above-critical high-pressure liquid routing', P: 25, T: 200, phaseHint: 'liquid', expectedPhase: 'liquid' },
        { name: 'subcritical above-critical-temperature vapor routing', P: 1, T: 400, phaseHint: 'vapor', expectedPhase: 'vapor' }
    ];

    return cases.map((item) => {
        const result = this.evaluatePT(item.P, item.T, { phaseHint: item.phaseHint });
        const traces = Object.values(result.trace.propTraces || {}).flatMap((trace) => trace.perBlock || []);
        const sameT = traces.every((trace) => Math.abs(trace.T - result.values.T) <= 1e-10);
        const phaseOk = item.expectedPhase ? result.phase === item.expectedPhase : true;
        return {
            name: item.name,
            pass: sameT && phaseOk,
            details: sameT && phaseOk ? 'matched' : `phase=${result.phase}, result T=${result.values.T}, trace Ts=${traces.map((trace) => trace.T).join(', ')}`
        };
    });
}

export function reverseRoundTripTests() {
    const tests = [];
    const states = [
        this.evaluatePT(1, 50, { phaseHint: 'liquid' }),
        this.evaluatePT(0.1, 180, { phaseHint: 'vapor' }),
        this.evaluatePT(25, 500, { phaseHint: 'supercritical fluid' }),
        this.mixtureByP(0.5, 0.35)
    ];

    for (const state of states) {
        if (!state.values || state.phase === 'on-dome') {
            continue;
        }
        for (const prop of ['h', 's', 'v', 'u']) {
            if (!Number.isFinite(state.values[prop])) {
                continue;
            }
            const pReverse = this.reverse('P', prop, state.values.P, state.values[prop]);
            tests.push(reverseCompare(`reverse P,${prop} round trip phase ${state.phase}`, state.values, pReverse, 'T'));
            const tReverse = this.reverse('T', prop, state.values.T, state.values[prop]);
            tests.push(reverseCompareWithSaturationBounds(`reverse T,${prop} round trip phase ${state.phase}`, state.values, state.phase, tReverse, prop));
        }
    }

    return tests;
}

export function reverseTwoPhaseTests() {
    const tests = [];
    const T = 200;
    const sat = this.saturationByT(T);
    const targetH = (sat.values.hf + sat.values.hg) / 2;
    const result = this.reverse('T', 'h', T, targetH);
    tests.push({
        name: 'reverse T,h in saturation bounds returns direct two-phase result',
        pass: result.phase === 'two-phase' && result.trace?.type === 'reverse-two-phase' && result.candidates.length === 1,
        details: result.phase === 'two-phase' ? 'matched' : `phase=${result.phase}, trace=${result.trace?.type}`
    });
    const targetU = (sat.values.uf + sat.values.ug) / 2;
    const uResult = this.reverse('T', 'u', T, targetU);
    tests.push({
        name: 'reverse T,u in saturation bounds returns direct two-phase result',
        pass: uResult.phase === 'two-phase'
            && uResult.trace?.type === 'reverse-two-phase'
            && Math.abs(uResult.values.u - targetU) <= Math.max(1e-7, Math.abs(targetU) * 1e-7),
        details: uResult.phase === 'two-phase' ? 'matched' : `phase=${uResult.phase}, trace=${uResult.trace?.type}`
    });
    return tests;
}

export function derivedDensityTests() {
    const states = [
        { name: 'single-phase derived rho equals inverse v', result: this.evaluatePT(0.101325, 200, { phaseHint: 'vapor' }) },
        { name: 'compressed-liquid derived rho equals inverse v', result: this.evaluatePT(1, 50, { phaseHint: 'liquid' }) },
        { name: 'two-phase derived rho equals inverse v', result: this.mixtureByP(0.101325, 0.5) }
    ];

    return states.map(({ name, result }) => {
        const expected = 1 / result.values.v;
        const tolerance = Math.max(1e-10, Math.abs(expected) * 1e-10);
        return {
            name,
            pass: Number.isFinite(result.values.rho) && Math.abs(result.values.rho - expected) <= tolerance,
            expected,
            actual: result.values.rho,
            tolerance
        };
    });
}

export function tableGapTests() {
    const tests = [];
    const gap = this.evaluatePT(700, 0, { phaseHint: 'liquid' });
    tests.push({
        name: 'incomplete combined-table row reports table gap without T clamp',
        pass: gap.values.T === 0
            && gap.values.h === null
            && gap.warnings.some((warning) => warning.includes('Table gap')),
        details: `T=${gap.values.T}, h=${gap.values.h}, warnings=${gap.warnings.join(' | ')}`
    });

    const row = this.tables.combinedRows.find((item) => item.P === 700 && item.T === 10 && item.phase === 'liquid');
    const exact = this.evaluatePT(700, 10, { phaseHint: 'liquid' });
    tests.push(compareProps('exact pressure block does not borrow neighboring block domain', exact.values, row, ['v', 'u', 'h', 's']));

    const outsideDomain = this.evaluatePT(0.101325, 10000, { phaseHint: 'vapor' });
    tests.push({
        name: 'outside raw table extent clamps to common complete T domain',
        pass: Number.isFinite(outsideDomain.values.T)
            && outsideDomain.values.T < 10000
            && outsideDomain.values.h !== null
            && outsideDomain.warnings.some((warning) => warning.includes('Temperature was clamped')),
        details: `T=${outsideDomain.values.T}, h=${outsideDomain.values.h}, warnings=${outsideDomain.warnings.join(' | ')}`
    });
    return tests;
}

export function criticalPointTests() {
    const checks = this.tables.criticalChecks;
    const tests = [];
    for (const [name, check] of [
        ['saturated_by_T critical row check', checks.saturatedByTLastRow],
        ['saturated_by_P critical row check', checks.saturatedByPLastRow]
    ]) {
        const pass = check.pressureDelta <= 1e-9
            && check.temperatureDelta <= 1e-9
            && Math.abs(check.hfg) <= 1e-8
            && check.volumeDelta <= 1e-8;
        tests.push({
            name,
            pass,
            details: pass ? 'matched pinned critical constants and zero f/g deltas' : JSON.stringify(check)
        });
    }
    return tests;
}

function compareProps(name, actual, expected, props) {
    const failures = [];
    for (const prop of props) {
        const tolerance = Math.max(1e-7, Math.abs(expected[prop]) * 1e-7);
        if (Math.abs(actual[prop] - expected[prop]) > tolerance) {
            failures.push(`${prop}: expected ${expected[prop]}, got ${actual[prop]}`);
        }
    }
    return {
        name,
        pass: failures.length === 0,
        details: failures.join('; ') || 'matched'
    };
}

function singleCompare(name, expected, actual) {
    const tolerance = Math.max(1e-8, Math.abs(expected) * 1e-8);
    return {
        name,
        pass: Math.abs(expected - actual) <= tolerance,
        expected,
        actual,
        tolerance
    };
}

function reverseCompare(name, expectedValues, result, solvedAxis) {
    if (!result.candidates.length) {
        return { name, pass: false, details: 'no reverse candidates returned' };
    }
    const expected = solvedAxis === 'T' ? expectedValues.T : expectedValues.P;
    const tolerance = Math.max(1e-4, Math.abs(expected) * 1e-4);
    const match = result.candidates.some((candidate) => Math.abs(candidate.solvedValue - expected) <= tolerance);
    return {
        name,
        pass: match,
        expected,
        actual: result.candidates.map((candidate) => candidate.solvedValue).join(', ')
    };
}

function reverseCompareWithSaturationBounds(name, expectedValues, expectedPhase, result, prop) {
    if (expectedPhase === 'liquid' && result.phase === 'two-phase') {
        const tTolerance = Math.max(1e-8, Math.abs(expectedValues.T) * 1e-8);
        const tolerance = Math.max(1e-7, Math.abs(expectedValues[prop]) * 1e-7);
        const targetMatched = Number.isFinite(expectedValues[prop])
            && Number.isFinite(result.values[prop])
            && Math.abs(result.values[prop] - expectedValues[prop]) <= tolerance;
        return {
            name,
            pass: Math.abs(result.values.T - expectedValues.T) <= tTolerance
                && result.values.x >= 0
                && result.values.x <= 1
                && targetMatched,
            details: 'classified through fixed-T saturation bounds'
        };
    }
    return reverseCompare(name, expectedValues, result, 'P');
}

function sampleRows(rows, count) {
    if (rows.length <= count) {
        return rows;
    }
    const result = [];
    for (let i = 0; i < count; i++) {
        const index = Math.floor(i * (rows.length - 1) / (count - 1));
        result.push(rows[index]);
    }
    return result;
}
