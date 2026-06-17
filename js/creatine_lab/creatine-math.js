// Equation registry for the Creatine Lab "Show the math" modal.
//
// Each entry documents one equation the model actually uses, the paper(s) that
// justify the functional form, and a "Run test" that exercises the LIVE model
// code on an anchored fixture. The test compares against an expected value
// drawn from the same literature anchor used by evaluateCreatineChecks(), so
// the modal cannot drift from what the simulator actually computes.

import {
    ACTIVE_CREATINE_FRACTION,
    CREATININE_FROM_CREATINE_FRACTION,
    DEFAULT_MODEL_INPUTS,
    calculateBodyCompositionEstimate,
    calculateMixState,
    calculateStorageState,
    getSolubilityGPerL,
    getDegradationRate,
    simulateAccumulation,
    runCreatineModel,
    normalizeInputs
} from "./creatine-model.js";
import { CREATINE_REFERENCES } from "./creatine-source-map.js";

const approxEqual = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

function makeResult({ pass, expected, actual, units = "", message = "" }) {
    return { pass, expected, actual, units, message };
}

export const EQUATION_SPECS = Object.freeze([
    {
        id: "active-creatine-fraction",
        title: "Active creatine fraction of monohydrate",
        equation: "active_g = monohydrate_g × 0.879",
        rationale: "Creatine monohydrate is 87.9% creatine by mass because of the bound water of crystallization (molar mass 149.15 g/mol vs. 131.13 g/mol for anhydrous creatine). Every dose-driven number in the pool and waste-pressure math runs through this constant.",
        sources: ["jager2011"],
        implementation: "creatine-model.js → ACTIVE_CREATINE_FRACTION (used by calculateMixState, simulateAccumulation, calculateSteadyStateDose).",
        fixture: "5 g of creatine monohydrate.",
        expected: "4.395 g active creatine equivalent.",
        run() {
            const mix = calculateMixState({ doseG: 5, volumeL: 1, temperatureC: 20 });
            const actual = mix.activeDoseG;
            const expected = 5 * ACTIVE_CREATINE_FRACTION;
            return makeResult({
                pass: approxEqual(actual, expected, 1e-9),
                expected,
                actual,
                units: "g active",
                message: `5 g monohydrate × 0.879 → ${actual.toFixed(4)} g active.`
            });
        }
    },
    {
        id: "solubility-interpolation",
        title: "Piecewise-linear water solubility interpolation",
        equation: "S(T) = S_low + (S_high − S_low) × (T − T_low) / (T_high − T_low)",
        rationale: "Solubility anchors are sparse measurements; between them the model assumes a linear ramp rather than a fitted polynomial. Jäger 2011 supplies the measured anchors at 4°C (6 g/L), 20°C (14 g/L), 50°C (34 g/L), and 60°C (45 g/L) in neutral water. Earlier versions extrapolated to 0°C and 80°C with engineering anchors (4.5 g/L and 71 g/L); those were removed in the May 2026 audit pass because (a) 0°C is at the freezing boundary and (b) no Jäger value is available above 60°C. Temperatures outside [4, 60] °C now clamp to the nearest anchor with a warning.",
        sources: ["jager2011"],
        implementation: "creatine-model.js → getSolubilityGPerL. Temperatures below 4°C clamp to 6 g/L; above 60°C clamp to 45 g/L.",
        fixture: "Read solubility at 20°C (anchor) and 35°C (interior).",
        expected: "20°C → 14 g/L exactly; 35°C → 24 g/L by linear interpolation between (20, 14) and (50, 34).",
        run() {
            const atAnchor = getSolubilityGPerL(20).solubilityGPerL;
            const interior = getSolubilityGPerL(35).solubilityGPerL;
            const interiorExpected = 14 + (34 - 14) * ((35 - 20) / (50 - 20));
            const pass = approxEqual(atAnchor, 14, 1e-9) && approxEqual(interior, interiorExpected, 1e-9);
            return makeResult({
                pass,
                expected: `${(14).toFixed(2)} g/L at 20°C, ${interiorExpected.toFixed(2)} g/L at 35°C`,
                actual: `${atAnchor.toFixed(2)} g/L at 20°C, ${interior.toFixed(2)} g/L at 35°C`,
                units: "g/L",
                message: `Anchor and interpolated values match the piecewise-linear table.`
            });
        }
    },
    {
        id: "first-order-degradation",
        title: "First-order beaker degradation + Q10 temperature scaling",
        equation: "fractionLost(t) = 1 − exp(−k(T) × t)        k(T) = k_25 × Q10^((T − 25)/10)        k_25 = −ln(1 − fractionLost_3day) / 3",
        rationale: "Uzzan et al. found dissolved creatine loss in acidic solution follows first-order kinetics until roughly the first half-life. k_25°C is back-solved from the FDA GRN 931 / Jäger anchor of 12% loss in 3 days at pH 4.5, 25°C. Q10 = 2.5 is a midpoint between an engineering conservative-low default (2.0) and Uzzan's measured Ea ~20 kcal/mol (implying Q10 ~3.1 between 20-30°C in their glycerol/buffer matrix). The 25°C anchor itself is unaffected by Q10; the multiplier only scales loss at off-anchor temperatures.",
        sources: ["fdaGras931", "uzzan2009", "jager2011"],
        implementation: "creatine-model.js → getDegradationRate (used by calculateStorageState).",
        fixture: "Premixed solution, pH 4.5, 25°C, 3 days.",
        expected: "About 12% dissolved creatine lost.",
        run() {
            const storage = calculateStorageState({
                ...DEFAULT_MODEL_INPUTS,
                doseG: 5,
                volumeL: 1,
                storageMode: "premixed",
                storageDays: 3,
                storageTemperatureC: 25,
                pH: 4.5,
                q10: 2
            });
            const actualPercent = storage.fractionLost * 100;
            return makeResult({
                pass: approxEqual(actualPercent, 12, 0.5),
                expected: "12.0%",
                actual: `${actualPercent.toFixed(2)}%`,
                units: "% loss",
                message: `pH 4.5, 25°C, 3 days → ${actualPercent.toFixed(2)}% dissolved-fraction loss.`
            });
        }
    },
    {
        id: "body-pool-baseline",
        title: "Body-composition baseline pool",
        equation:
            "pool_g = SMM_kg × (gPerKg × dietFactor) / muscleShare\n\n" +
            "Full chain when direct SMM is not supplied:\n" +
            "    FFM_kg     = bodyMass_kg × (1 − bodyFat_fraction)        (or use direct FFM)\n" +
            "    SMM_kg     = FFM_kg × ffmToSmmFraction                   (or use direct SMM)\n" +
            "    musclePool = SMM_kg × gPerKg × dietFactor\n" +
            "    pool_g     = musclePool / muscleShare",
        rationale: "D3-creatine dilution and CT-derived skeletal muscle work tie the total body pool to skeletal muscle mass. When SMM is not measured directly, the model walks the body-comp chain: body mass minus fat fraction gives FFM, FFM times an editable fraction gives SMM, SMM times creatine-per-kg gives the muscle pool, and dividing by Cooper's ~95% muscle share gives the whole-body pool. The dietary multiplier (0.92 vegetarian, 0.97 low-meat, 1.00 omnivore) reflects Burke 2003 and Lukaszuk 2002 showing lower resting muscle TCr in vegetarians.",
        sources: ["cooper2012", "clark2014", "sagayama2023", "pagano2024", "burke2003", "lukaszuk2002"],
        implementation: "creatine-model.js → calculateBodyCompositionEstimate.",
        fixture: "Direct SMM 30 kg, 5.0 g/kg, share 0.95, omnivore (factor 1.0).",
        expected: "30 × 5.0 / 0.95 ≈ 157.9 g.",
        run() {
            const composition = calculateBodyCompositionEstimate({
                bodyMassKg: 80,
                bodyFatPercent: 18,
                skeletalMuscleMassKg: 30,
                muscleCreatineGPerKg: 5.0,
                skeletalMuscleCreatineShare: 0.95,
                dietaryPattern: "omnivore"
            });
            const expected = (30 * 5.0) / 0.95;
            const actual = composition.totalPoolG;
            return makeResult({
                pass: approxEqual(actual, expected, 0.01),
                expected,
                actual,
                units: "g pool",
                message: `Body-comp baseline ${actual.toFixed(2)} g; closed-form ${expected.toFixed(2)} g.`
            });
        }
    },
    {
        id: "calibrated-endogenous",
        title: "Background-calibrated endogenous synthesis",
        equation: "endogenous_g_per_day = max(pool × k − dietary, 0)",
        rationale: "When calibration is on, the model solves for endogenous synthesis that lets the entered baseline pool sit at steady state. This is an engineering choice grounded in Cooper's diet (~1 g/day) and Brosnan's biosynthesis review: rather than guessing a personal synthesis rate, the tool back-solves the rate that keeps the observed personal baseline at equilibrium. The clamp at zero is a numerical guardrail; biologically, GAMT activity downregulates with high dietary intake but does not vanish, so a very-high-meat fixture that would imply negative synthesis is being reported as zero rather than as a true measurement.",
        sources: ["cooper2012", "brosnan2011", "ncbiCreatine"],
        implementation: "creatine-model.js → simulateAccumulation (calibrateBackground branch).",
        fixture: "Manual baseline 120 g, omnivore diet (1.0 g/day), 1.7%/day turnover, no supplement, calibration on.",
        expected: "endogenous = 120 × 0.017 − 1.0 ≈ 1.04 g/day.",
        run() {
            const result = runCreatineModel({
                bodyPoolBasis: "manual",
                baselinePoolG: 120,
                dietaryPattern: "omnivore",
                calibrateBackground: true,
                protocolPreset: "maintenance5",
                maintenanceDoseG: 0,
                simulationDays: 1,
                monteCarloDraws: 100
            });
            const actual = result.accumulation.endogenousGPerDay;
            const expected = 120 * 0.017 - 1.0;
            return makeResult({
                pass: approxEqual(actual, expected, 0.01),
                expected,
                actual,
                units: "g/day",
                message: `Calibrated endogenous ${actual.toFixed(3)} g/day; closed-form ${expected.toFixed(3)} g/day.`
            });
        }
    },
    {
        id: "muscle-uptake-mm-hill",
        title: "Michaelis-Menten muscle uptake with empirical gap-power attenuator",
        equation: "uptake_g_per_day = Vmax × gap^n × active / (Km + active)        gap = max((cap − pool)/(cap − baseline), 0)",
        rationale: "Two distinct factors multiplied together. The Michaelis-Menten dose term active/(Km + active) comes from saturable transport: SLC6A8 (CreaT) is a Na⁺/Cl⁻-dependent active transporter (Persky & Brazeau), and Schedel 1999 reports an acute serum Cr peak at ~2.5 h after 20 g ingestion followed by a slow decline (no formal plasma t½ is computed in the paper). So daily retention behaves as a saturable function of the day's active dose. The gap^n term is a separate empirical attenuator on the supplementation gap (cap − pool)/(cap − baseline). It is NOT a Hill cooperativity term. True Hill kinetics has the form [S]^n/(K^n + [S]^n) and applies to substrate concentration, not to a normalized pool deficit. The exponent n is named poolGapHillExponent for code-history reasons; mathematically it is a power-law gap multiplier tuned so cumulative 6-day retention of 20 g/d matches Hultman group-1's measured ~17% of CrM ingested. Harris 1992 and Greenhaff 1994 confirm wide responder spread on identical protocols.",
        sources: ["persky2001", "persky2003", "schedel1999", "hultman1996", "harris1992", "greenhaff1994"],
        implementation: "creatine-model.js → computeMuscleUptakeG (invoked inside simulateAccumulation).",
        fixture: "Manual 120 g baseline, 75% baseline saturation, 20 g/day for 6 days (Hultman 1996 figure 1).",
        expected: "Day-1 retention 25-40% of active dose; day-6 retention below 20%; day-6 pool 135-158 g.",
        run() {
            const result = runCreatineModel({
                bodyPoolBasis: "manual",
                baselinePoolG: 120,
                baselineSaturationPercent: 75,
                protocolPreset: "load20",
                loadingDays: 6,
                maintenanceDoseG: 0,
                simulationDays: 6,
                monteCarloDraws: 60
            });
            const day1 = result.accumulation.days[1];
            const day6 = result.accumulation.days[6];
            const day1Pct = day1.retentionFraction * 100;
            const day6Pct = day6.retentionFraction * 100;
            const pass = day1.retentionFraction >= 0.25 && day1.retentionFraction <= 0.42
                && day6.retentionFraction < 0.20
                && day6.poolG >= 135 && day6.poolG <= 158;
            return makeResult({
                pass,
                expected: "Day 1: 25-42% retention; Day 6: <20% retention, pool 135-158 g.",
                actual: `Day 1: ${day1Pct.toFixed(1)}% retention; Day 6: ${day6Pct.toFixed(1)}% retention, pool ${day6.poolG.toFixed(1)} g.`,
                units: "% / g",
                message: "Saturable M-M dose term × empirical gap-power attenuator reproduces Hultman day-by-day loading."
            });
        }
    },
    {
        id: "analytical-exponential",
        title: "Analytical exponential per-day pool update",
        equation: "pool(t+1) = pool(t) × exp(−k) + (R/k) × (1 − exp(−k))",
        rationale: "The body-pool ODE is dPool/dt = R − k × pool, with R = retained_supplement + (diet + endogenous). With R treated as constant over each day, the closed-form integration replaces forward-Euler step error with the exact analytical solution. This is what lets the mass-balance residual close to machine epsilon instead of drifting over long simulations.",
        sources: ["ncbiCreatine"],
        implementation: "creatine-model.js → simulateAccumulation (per-day update loop).",
        fixture: "Manual baseline 120 g, omnivore calibrated, 0 g/day supplement: input rate exactly cancels turnover, so the pool should sit at 120 g for 30 days.",
        expected: "Day 30 pool = 120 g (within 1e-6).",
        run() {
            const result = runCreatineModel({
                bodyPoolBasis: "manual",
                baselinePoolG: 120,
                dietaryPattern: "omnivore",
                calibrateBackground: true,
                protocolPreset: "maintenance5",
                maintenanceDoseG: 0,
                simulationDays: 30,
                monteCarloDraws: 60
            });
            const actual = result.accumulation.final.poolG;
            return makeResult({
                pass: approxEqual(actual, 120, 1e-6),
                expected: 120,
                actual,
                units: "g pool",
                message: `Day-30 pool ${actual.toFixed(8)} g vs analytical equilibrium 120 g.`
            });
        }
    },
    {
        id: "steady-state-dose",
        title: "Additional steady-state supplemental dose (full-retention lower bound)",
        equation: "doseMono_g_per_day = max(pool × k − (diet + endogenous), 0) / 0.879",
        rationale: "Algebraic rearrangement of the mass-balance ODE at dPool/dt = 0: any supplemental flux beyond what diet plus synthesis already supplies has to equal the daily turnover loss to hold the current pool. Division by 0.879 converts active-creatine grams into the monohydrate grams reported on supplement labels. IMPORTANT CAVEAT: this formula assumes 100% retention of the supplemental dose. The per-day simulator uses saturable Michaelis-Menten uptake that approaches zero retention as the pool approaches the cap, so the *effective* monohydrate dose required to hold a near-cap pool is higher than what this formula reports. Treat the displayed value as a lower bound; the M-M curve in the muscle-uptake card explains why real retention is incomplete.",
        sources: ["ncbiCreatine", "cooper2012"],
        implementation: "creatine-model.js → calculateSteadyStateDose (internal helper, surfaced per-day).",
        fixture: "Manual 140 g pool, omnivore calibrated background (diet 1.0 g/day, endogenous calibrated to 1.38 g/day → background 2.38 g/day equals 140 × 0.017).",
        expected: "Background already covers turnover, so additional steady-state dose = 0 g/day monohydrate.",
        run() {
            const result = runCreatineModel({
                bodyPoolBasis: "manual",
                baselinePoolG: 140,
                dietaryPattern: "omnivore",
                calibrateBackground: true,
                protocolPreset: "maintenance5",
                maintenanceDoseG: 0,
                simulationDays: 1,
                monteCarloDraws: 60
            });
            const actual = result.accumulation.final.steadyStateDoseCrMG;
            return makeResult({
                pass: approxEqual(actual, 0, 1e-6),
                expected: 0,
                actual,
                units: "g/day monohydrate",
                message: `At the calibrated equilibrium, no extra supplement is required. Computed ${actual.toExponential(2)} g/day.`
            });
        }
    },
    {
        id: "creatinine-production",
        title: "Daily urinary creatinine production",
        equation: "creatinine_g_per_day = pool × k × (113.12 / 131.13)",
        rationale: "Creatinine is the non-enzymatic dehydration product of creatine. Walker 1979 reviews the 1:1 molar conversion; Heymsfield 1983 uses 24-hour urinary creatinine as a proxy for skeletal muscle mass on the same proportionality. The mass ratio 113.12/131.13 ≈ 0.863 accounts for the lost water during cyclization.",
        sources: ["walker1979", "heymsfield1983", "ncbiCreatine"],
        implementation: "creatine-model.js → simulateAccumulation (creatinineProducedG = dailyLossG × CREATININE_FROM_CREATINE_FRACTION).",
        fixture: "Manual 120 g baseline pool, 1.7%/day turnover, no supplement.",
        expected: "120 × 0.017 × (113.12/131.13) ≈ 1.760 g/day.",
        run() {
            const result = runCreatineModel({
                bodyPoolBasis: "manual",
                baselinePoolG: 120,
                dietaryPattern: "omnivore",
                calibrateBackground: true,
                protocolPreset: "maintenance5",
                maintenanceDoseG: 0,
                simulationDays: 14,
                monteCarloDraws: 60
            });
            const expected = 120 * 0.017 * CREATININE_FROM_CREATINE_FRACTION;
            const actual = result.accumulation.final.creatinineProducedG;
            return makeResult({
                pass: approxEqual(actual, expected, 0.02),
                expected,
                actual,
                units: "g/day creatinine",
                message: `Modeled output ${actual.toFixed(3)} g/day vs closed-form ${expected.toFixed(3)} g/day.`
            });
        }
    },
    {
        id: "mass-balance-closure",
        title: "Mass-balance closure check",
        equation: "pool_final = pool_initial + Σ retained + Σ effectiveBackground − Σ turnover",
        rationale: "Not a modeled phenomenon, a conservation check. The exponential per-day integration must close the books: every gram of creatine that enters as supplement retention or as effective background (diet + endogenous, minus any saturation overflow attributed to background) must either still be in the pool or have left as turnover. Floating-point residual quantifies any numerical drift in the integrator.",
        sources: ["ncbiCreatine"],
        implementation: "creatine-model.js → checkMassBalance (run on every model output).",
        fixture: "20 g/day for 6 days then 5 g/day maintenance for 30 days total.",
        expected: "Residual < 0.05 g (well under 0.1% of final pool).",
        run() {
            const result = runCreatineModel({
                protocolPreset: "load20",
                loadingDays: 6,
                maintenanceDoseG: 5,
                simulationDays: 30,
                monteCarloDraws: 60
            });
            const balance = result.massBalance;
            const residualMag = Math.abs(balance.residualG);
            return makeResult({
                pass: balance.ok && residualMag < 0.05,
                expected: "< 0.05 g",
                actual: `${balance.residualG.toExponential(3)} g (${(balance.residualFractionOfPool * 100).toFixed(4)}% of final pool)`,
                units: "g residual",
                message: `In: ${balance.totalRetainedG.toFixed(2)} g retained + ${balance.effectiveBackgroundG.toFixed(2)} g background. Out: ${balance.totalTurnoverG.toFixed(2)} g turnover.`
            });
        }
    }
]);

export function getEquationSources(spec) {
    if (!spec) return [];
    return (spec.sources || [])
        .map((key) => ({ key, ...CREATINE_REFERENCES[key] }))
        .filter((entry) => entry && entry.label);
}

export function runEquationTest(id) {
    const spec = EQUATION_SPECS.find((entry) => entry.id === id);
    if (!spec) return null;
    try {
        return spec.run();
    } catch (error) {
        return makeResult({
            pass: false,
            expected: spec.expected,
            actual: "test threw",
            message: error?.message || String(error)
        });
    }
}

export function runAllEquationTests() {
    return EQUATION_SPECS.map((spec) => ({ id: spec.id, ...runEquationTest(spec.id) }));
}

// Export a few helpers for completeness. They keep the module self-contained
// in case it is imported standalone.
export { normalizeInputs, simulateAccumulation };
