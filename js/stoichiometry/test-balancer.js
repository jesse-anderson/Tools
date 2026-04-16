import { balanceEquation } from './equation-balancer.js';

function assertDeepEqual(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Assertion failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

console.log("Testing balanceEquation...");

const t1 = balanceEquation("C3H8 + O2 = CO2 + H2O");
assertDeepEqual(t1.coefficients, [1, 5, 3, 4]);

const t2 = balanceEquation("N2 + H2 = NH3");
assertDeepEqual(t2.coefficients, [1, 3, 2]);

const t3 = balanceEquation("Al + HCl = AlCl3 + H2");
assertDeepEqual(t3.coefficients, [2, 6, 2, 3]);

const t4 = balanceEquation("KMnO4 + HCl = KCl + MnCl2 + H2O + Cl2");
assertDeepEqual(t4.coefficients, [2, 16, 2, 2, 8, 5]);

const t5 = balanceEquation("FeS2 + O2 = Fe2O3 + SO2");
assertDeepEqual(t5.coefficients, [4, 11, 2, 8]);

// Test error handling
try {
    balanceEquation("H2 + O2 = CO2");
    throw new Error("Should have thrown error for impossible reaction");
} catch (e) {
    if (!/present on only one side|not present on both sides/.test(e.message)) {
        throw e;
    }
}

try {
    balanceEquation("H2 + O2 = H2O2 + H2O");
    // Multiple free variables, wait, H2+O2 -> H2O2+H2O has O and H on both sides
    // If it throws or passes with some valid combo, that's fine.
} catch (e) {
    console.log("Expected complex reaction behaviour:", e.message);
}

console.log("All balancer tests passed!");
