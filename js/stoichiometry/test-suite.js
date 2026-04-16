import { parseFormula, calculateMass } from './formula-parser.js';
import { balanceEquation } from './equation-balancer.js';

const tests = {
    parser: [
        { input: "H2O", expected: { H: 2, O: 1 }, mass: 18.015 },
        { input: "C6H12O6", expected: { C: 6, H: 12, O: 6 }, mass: 180.156 },
        { input: "Ca(OH)2", expected: { Ca: 1, O: 2, H: 2 }, mass: 74.093 },
        { input: "K4[Fe(CN)6]·3H2O", expected: { K: 4, Fe: 1, C: 6, N: 6, H: 6, O: 3 }, mass: 422.388 },
        { input: "Na+(aq)", expected: { Na: 1 }, mass: 22.990 },
        { input: "SO4^2-", expected: { S: 1, O: 4 }, mass: 96.06 },
        { input: "CuSO4*5H2O", expected: { Cu: 1, S: 1, O: 9, H: 10 }, mass: 249.68 }
    ],
    balancer: [
        { input: "C3H8 + O2 -> CO2 + H2O", expected: [1, 5, 3, 4] },
        { input: "KMnO4 + HCl -> KCl + MnCl2 + H2O + Cl2", expected: [2, 16, 2, 2, 8, 5] },
        { input: "FeS2 + O2 -> Fe2O3 + SO2", expected: [4, 11, 2, 8] },
        { input: "Al + HCl -> AlCl3 + H2", expected: [2, 6, 2, 3] },
        { input: "CO2 + H2O -> C6H12O6 + O2", expected: [6, 6, 1, 6] }
    ]
};

function runTests() {
    console.log("=== STOICHIOMETRY CORE TEST SUITE ===");
    let passed = 0;
    let failed = 0;

    console.log("\n--- Testing Parser ---");
    tests.parser.forEach(t => {
        try {
            const result = parseFormula(t.input);
            const mass = calculateMass(t.input);
            
            const atomMatch = JSON.stringify(result) === JSON.stringify(t.expected);
            const massMatch = Math.abs(mass - t.mass) < 0.1;

            if (atomMatch && massMatch) {
                console.log(`[PASS] ${t.input}`);
                passed++;
            } else {
                console.log(`[FAIL] ${t.input}: Expected ${JSON.stringify(t.expected)} @ ~${t.mass}, got ${JSON.stringify(result)} @ ${mass}`);
                failed++;
            }
        } catch (e) {
            console.log(`[ERR]  ${t.input}: ${e.message}`);
            failed++;
        }
    });

    console.log("\n--- Testing Balancer ---");
    tests.balancer.forEach(t => {
        try {
            const result = balanceEquation(t.input);
            const coefMatch = JSON.stringify(result.coefficients) === JSON.stringify(t.expected);

            if (coefMatch) {
                console.log(`[PASS] ${t.input}`);
                passed++;
            } else {
                console.log(`[FAIL] ${t.input}: Expected ${t.expected}, got ${result.coefficients}`);
                failed++;
            }
        } catch (e) {
            console.log(`[ERR]  ${t.input}: ${e.message}`);
            failed++;
        }
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
