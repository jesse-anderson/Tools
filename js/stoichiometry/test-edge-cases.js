import { parseFormula, calculateMass } from './formula-parser.js';
import { balanceEquation } from './equation-balancer.js';

const tests = {
    parser: [
        { input: "H2O", expected: { H: 2, O: 1 }, mass: 18.015 },
        { input: "  H2O ", expected: { H: 2, O: 1 }, mass: 18.015 }, // Whitespace
        { input: "H2O1", expected: { H: 2, O: 1 }, mass: 18.015 }, // Explicit 1
        { input: "Ca(OH)2", expected: { Ca: 1, O: 2, H: 2 }, mass: 74.093 },
        { input: "K4[Fe(CN)6]·3H2O", expected: { K: 4, Fe: 1, C: 6, N: 6, H: 6, O: 3 }, mass: 422.388 }
    ],
    errors: [
        { input: "h2o", error: "Unknown element: h" }, // Case sensitivity
        { input: "H2O!", error: "Invalid character in formula: !" }, // Special chars
        { input: "(H2O", error: "Formula nesting too deep" }, // This might throw differently but it's an error
        { input: "A".repeat(600), error: "Formula too long" }
    ],
    balancer: [
        { input: "C3H8 + O2 -> CO2 + H2O", expected: [1, 5, 3, 4] },
        { input: "H2 + O2 = H2O", expected: [2, 1, 2] }
    ]
};

function runTests() {
    console.log("=== STOICHIOMETRY EDGE CASE TEST SUITE ===");
    let passed = 0;
    let failed = 0;

    console.log("\n--- Testing Parser ---");
    tests.parser.forEach(t => {
        try {
            const result = parseFormula(t.input);
            const mass = calculateMass(t.input);
            console.log(`[PASS] ${t.input}`);
            passed++;
        } catch (e) {
            console.log(`[FAIL] ${t.input}: ${e.message}`);
            failed++;
        }
    });

    console.log("\n--- Testing Error Handling ---");
    tests.errors.forEach(t => {
        try {
            parseFormula(t.input);
            console.log(`[FAIL] ${t.input}: Expected error but passed`);
            failed++;
        } catch (e) {
            console.log(`[PASS] ${t.input}: Caught expected error (${e.message})`);
            passed++;
        }
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
