import { parseFormula, calculateMass } from './formula-parser.js';

function assertApprox(actual, expected, tolerance = 0.01) {
    if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`Assertion failed: expected ~${expected}, got ${actual}`);
    }
}

function assertDeepEqual(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Assertion failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

console.log("Testing parseFormula...");
assertDeepEqual(parseFormula("H2O"), { H: 2, O: 1 });
assertDeepEqual(parseFormula("CO2"), { C: 1, O: 2 });
assertDeepEqual(parseFormula("Ca(OH)2"), { Ca: 1, O: 2, H: 2 });
assertDeepEqual(parseFormula("K4[Fe(CN)6]"), { K: 4, Fe: 1, C: 6, N: 6 });
assertDeepEqual(parseFormula("CuSO4·5H2O"), { Cu: 1, S: 1, O: 9, H: 10 });
assertDeepEqual(parseFormula("K4[Fe(CN)6]*3H2O"), { K: 4, Fe: 1, C: 6, N: 6, H: 6, O: 3 });

console.log("Testing calculateMass...");
assertApprox(calculateMass("H2O"), 18.015);
assertApprox(calculateMass("C6H12O6"), 180.156);
assertApprox(calculateMass("Ca(OH)2"), 74.093);
assertApprox(calculateMass("K4[Fe(CN)6]·3H2O"), 422.388);

console.log("All parsing tests passed!");
