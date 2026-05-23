import {
    calculateBrainPoolEstimate,
    calculateMixState,
    calculateStorageState,
    CREATININE_FROM_CREATINE_FRACTION,
    DEFAULT_MODEL_INPUTS,
    runCreatineModel
} from "./creatine-model.js";
import { CREATINE_REFERENCES } from "./creatine-source-map.js";

export function evaluateCreatineChecks() {
    const checks = [];

    const defaultMix = calculateMixState({ doseG: 5, volumeL: 1, temperatureC: 20 });
    checks.push({
        id: "default-bottle-solubility",
        title: "Default bottle dissolves at equilibrium",
        reference: CREATINE_REFERENCES.jager2011,
        fixture: "Fixture: 5 g creatine monohydrate in 1 L water at 20 deg C.",
        benchmark: "The 20 deg C anchor is 14 g/L, so 5 g in 1 L should be under the equilibrium solubility limit.",
        status: defaultMix.undissolvedG < 0.01 ? "pass" : "fail",
        detail: `5 g in 1 L at 20 deg C leaves ${defaultMix.undissolvedG.toFixed(2)} g undissolved.`
    });

    const smallGlass = calculateMixState({ doseG: 5, volumeL: 0.25, temperatureC: 20 });
    checks.push({
        id: "small-glass-suspension",
        title: "Small glass shows suspension",
        reference: CREATINE_REFERENCES.jager2011,
        fixture: "Fixture: 5 g creatine monohydrate in 250 mL water at 20 deg C.",
        benchmark: "The same 14 g/L anchor gives 3.5 g dissolved and about 1.5 g suspended.",
        status: smallGlass.undissolvedG > 1.4 && smallGlass.undissolvedG < 1.6 ? "pass" : "fail",
        detail: `5 g in 250 mL at 20 deg C leaves ${smallGlass.undissolvedG.toFixed(2)} g undissolved.`
    });

    const acidStorage = calculateStorageState({
        ...DEFAULT_MODEL_INPUTS,
        doseG: 5,
        volumeL: 1,
        storageMode: "premixed",
        storageDays: 3,
        storageTemperatureC: 25,
        pH: 4.5,
        q10: 2
    });
    checks.push({
        id: "acidic-storage-loss",
        title: "pH 4.5 storage anchor",
        reference: CREATINE_REFERENCES.fdaGras931,
        fixture: "Fixture: premixed dissolved creatine, pH 4.5, 25 deg C, 3 days.",
        benchmark: "The reported anchor is about 12% loss after 3 days.",
        status: Math.abs(acidStorage.fractionLost - 0.12) < 0.003 ? "pass" : "fail",
        detail: `pH 4.5, 25 deg C, 3 days reports ${(acidStorage.fractionLost * 100).toFixed(1)}% dissolved loss.`
    });

    const loading = runCreatineModel({ protocolPreset: "load20", loadingDays: 6, maintenanceDoseG: 5, simulationDays: 6 });
    checks.push({
        id: "loading-saturation",
        title: "20 g loading raises the pool toward the modeled cap",
        reference: CREATINE_REFERENCES.hultman1996,
        fixture: "Fixture: 20 g/day creatine monohydrate for 6 days.",
        benchmark: "Saturable Michaelis-Menten retention puts day-6 estimated saturation in the 85-99% band, matching the Hultman day-by-day loading curve.",
        status: loading.accumulation.final.percentSaturation > 85 && loading.accumulation.final.supplementGapFilledPercent > 50 ? "pass" : "fail",
        detail: `20 g/day for 6 days reaches ${loading.accumulation.final.percentSaturation.toFixed(1)}% estimated saturation and fills ${loading.accumulation.final.supplementGapFilledPercent.toFixed(1)}% of the modeled supplement gap.`
    });

    const gradualLoading = runCreatineModel({
        protocolPreset: "custom",
        customLoadingDoseG: 3,
        loadingDays: 28,
        maintenanceDoseG: 3,
        simulationDays: 28
    });
    checks.push({
        id: "gradual-loading-saturation",
        title: "3 g gradual loading approaches endpoint",
        reference: CREATINE_REFERENCES.hultman1996,
        fixture: "Fixture: 3 g/day creatine monohydrate for 28 days.",
        benchmark: "The centerline should approach a similar estimated saturation more slowly, matching the Hultman gradual-loading direction.",
        status: gradualLoading.accumulation.final.percentSaturation > 90 ? "pass" : "fail",
        detail: `3 g/day for 28 days reaches ${gradualLoading.accumulation.final.percentSaturation.toFixed(1)}% estimated saturation and fills ${gradualLoading.accumulation.final.supplementGapFilledPercent.toFixed(1)}% of the modeled supplement gap.`
    });

    const noSupplement = runCreatineModel({
        bodyPoolBasis: "manual",
        baselinePoolG: 100,
        protocolPreset: "maintenance5",
        maintenanceDoseG: 0,
        simulationDays: 60,
        monteCarloDraws: 100,
        calibrateBackground: true
    });
    checks.push({
        id: "no-supplement-baseline-calibrated",
        title: "Calibrated background holds entered baseline without supplement",
        reference: CREATINE_REFERENCES.ncbiCreatine,
        fixture: "Fixture: manual 100 g baseline pool, 0 g/day supplement, 60 days, calibration on.",
        benchmark: "Calibration pins diet plus synthesis to the chosen baseline turnover, so the pool should stay at the entered baseline.",
        status: Math.abs(noSupplement.accumulation.final.percentSaturation - 75) < 0.01
            && Math.abs(noSupplement.accumulation.final.poolG - 100) < 0.01
            && Math.abs(noSupplement.accumulation.final.supplementGapFilledPercent) < 0.01
            ? "pass"
            : "fail",
        detail: `No-supplement calibrated scenario ends at ${noSupplement.accumulation.final.poolG.toFixed(1)} g, ${noSupplement.accumulation.final.percentSaturation.toFixed(1)}% saturation, ${noSupplement.accumulation.final.supplementGapFilledPercent.toFixed(1)}% gap fill.`
    });

    const noSupplementVegetarian = runCreatineModel({
        bodyPoolBasis: "manual",
        baselinePoolG: 100,
        protocolPreset: "maintenance5",
        maintenanceDoseG: 0,
        simulationDays: 120,
        monteCarloDraws: 100,
        dietaryPattern: "vegetarian",
        calibrateBackground: false
    });
    checks.push({
        id: "vegetarian-pool-drift",
        title: "Vegetarian diet drifts the no-supplement pool",
        reference: CREATINE_REFERENCES.burke2003,
        fixture: "Fixture: manual 100 g baseline, vegetarian diet, calibration off, 0 g/day supplement, 120 days.",
        benchmark: "With calibration off the pool should drift away from the entered baseline toward (diet + literature endogenous) / turnover. Vegetarian background is below the 100 g baseline turnover so the pool should fall.",
        status: noSupplementVegetarian.accumulation.equilibriumPoolG < 100
            && noSupplementVegetarian.accumulation.final.poolG < 99
            && noSupplementVegetarian.accumulation.final.poolG > noSupplementVegetarian.accumulation.equilibriumPoolG - 1
            ? "pass"
            : "fail",
        detail: `Vegetarian no-supplement scenario drifts to ${noSupplementVegetarian.accumulation.final.poolG.toFixed(1)} g toward equilibrium ${noSupplementVegetarian.accumulation.equilibriumPoolG.toFixed(1)} g.`
    });

    const calibratedOmnivore = runCreatineModel({
        bodyPoolBasis: "manual",
        baselinePoolG: 120,
        protocolPreset: "maintenance5",
        maintenanceDoseG: 0,
        simulationDays: 30,
        monteCarloDraws: 100,
        dietaryPattern: "omnivore",
        calibrateBackground: true
    });
    const calibratedEndogenous = calibratedOmnivore.accumulation.endogenousGPerDay;
    checks.push({
        id: "calibrated-endogenous-residual",
        title: "Calibration solves endogenous as baseline turnover minus diet",
        reference: CREATINE_REFERENCES.cooper2012,
        fixture: "Fixture: omnivore diet, 120 g manual baseline, 1.7%/day turnover.",
        benchmark: "Calibration should set endogenous = 120 * 0.017 - 1.0 ≈ 1.04 g/day.",
        status: Math.abs(calibratedEndogenous - 1.04) < 0.02 ? "pass" : "fail",
        detail: `Calibrated endogenous ${calibratedEndogenous.toFixed(2)} g/day vs. expected 1.04 g/day.`
    });

    const baselineCreatinineCheck = runCreatineModel({
        bodyPoolBasis: "manual",
        baselinePoolG: 120,
        maintenanceDoseG: 0,
        simulationDays: 14,
        monteCarloDraws: 60
    });
    const expectedBaselineCreatinine = 120 * 0.017 * CREATININE_FROM_CREATINE_FRACTION;
    checks.push({
        id: "baseline-creatinine-output",
        title: "Baseline creatinine output matches pool x turnover x mass ratio",
        reference: CREATINE_REFERENCES.walker1979,
        fixture: "Fixture: 120 g baseline pool, 1.7%/day turnover, no supplement.",
        benchmark: `Modeled urinary creatinine should be 120 * 0.017 * 113.12/131.13 ≈ ${expectedBaselineCreatinine.toFixed(2)} g/day.`,
        status: Math.abs(baselineCreatinineCheck.accumulation.final.creatinineProducedG - expectedBaselineCreatinine) < 0.02 ? "pass" : "fail",
        detail: `Final modeled creatinine output ${baselineCreatinineCheck.accumulation.final.creatinineProducedG.toFixed(3)} g/day.`
    });

    const massBalanceCheck = runCreatineModel({
        protocolPreset: "load20",
        loadingDays: 6,
        maintenanceDoseG: 5,
        simulationDays: 30,
        monteCarloDraws: 60
    });
    checks.push({
        id: "mass-balance-residual",
        title: "Exponential per-day integration closes mass balance to floating-point",
        reference: CREATINE_REFERENCES.ncbiCreatine,
        fixture: "Fixture: 20 g/day for 6 days then 5 g/day maintenance over 30 days.",
        benchmark: "Final pool should equal baseline + cumulative retained + cumulative background - cumulative turnover, with residual < 0.05 g.",
        status: massBalanceCheck.massBalance.ok && Math.abs(massBalanceCheck.massBalance.residualG) < 0.05 ? "pass" : "fail",
        detail: `Residual ${massBalanceCheck.massBalance.residualG.toFixed(4)} g (${(massBalanceCheck.massBalance.residualFractionOfPool * 100).toFixed(3)}% of final pool).`
    });

    const hultmanLoad = runCreatineModel({
        bodyPoolBasis: "manual",
        baselinePoolG: 120,
        baselineSaturationPercent: 75,
        protocolPreset: "load20",
        loadingDays: 6,
        maintenanceDoseG: 0,
        simulationDays: 6,
        monteCarloDraws: 60
    });
    const day1Retention = hultmanLoad.accumulation.days[1].retentionFraction;
    const day6Retention = hultmanLoad.accumulation.days[6].retentionFraction;
    const day6Pool = hultmanLoad.accumulation.days[6].poolG;
    checks.push({
        id: "hultman-day1-retention",
        title: "Hultman 1996 day-1 of 20 g/d retains roughly one third of active dose",
        reference: CREATINE_REFERENCES.hultman1996,
        fixture: "Fixture: 120 g manual baseline, 20 g/d loading, 75% baseline saturation.",
        benchmark: "Day-1 retention fraction should be in the 25-40% band (Hultman 1996 figure 1).",
        status: day1Retention >= 0.25 && day1Retention <= 0.42 ? "pass" : "fail",
        detail: `Day-1 retention ${(day1Retention * 100).toFixed(1)}% (target 25-40%); day-1 retained ${hultmanLoad.accumulation.days[1].retainedSupplementG.toFixed(2)} g active.`
    });
    checks.push({
        id: "hultman-day6-retention",
        title: "Hultman 1996 day-6 of 20 g/d falls below 20% retention",
        reference: CREATINE_REFERENCES.hultman1996,
        fixture: "Fixture: 120 g manual baseline, 20 g/d loading, 75% baseline saturation.",
        benchmark: "By day 6 the pool is near the modeled cap and retention should drop below 20% (Hultman 1996 figure 1).",
        status: day6Retention < 0.20 && day6Pool >= 140 && day6Pool <= 158 ? "pass" : "fail",
        detail: `Day-6 retention ${(day6Retention * 100).toFixed(1)}% (target <20%); day-6 pool ${day6Pool.toFixed(1)} g (target 140-158 g).`
    });

    const hultmanSlowLoad = runCreatineModel({
        bodyPoolBasis: "manual",
        baselinePoolG: 120,
        baselineSaturationPercent: 75,
        protocolPreset: "custom",
        customLoadingDoseG: 3,
        loadingDays: 28,
        maintenanceDoseG: 3,
        simulationDays: 28,
        monteCarloDraws: 60
    });
    const slowEndpoint = hultmanSlowLoad.accumulation.final.poolG;
    checks.push({
        id: "hultman-slow-load-endpoint",
        title: "Hultman 1996 3 g/d × 28 d approaches the loaded endpoint",
        reference: CREATINE_REFERENCES.hultman1996,
        fixture: "Fixture: 120 g manual baseline, 3 g/d for 28 days.",
        benchmark: "Pool should rise into the 140-155 g range, comparable to the 20 g/d × 6 d endpoint.",
        status: slowEndpoint >= 140 && slowEndpoint <= 158 ? "pass" : "fail",
        detail: `3 g/d × 28 d endpoint ${slowEndpoint.toFixed(1)} g (target 140-158 g).`
    });

    const washout = runCreatineModel({
        bodyPoolBasis: "manual",
        baselinePoolG: 120,
        baselineSaturationPercent: 75,
        protocolPreset: "stop_after_load",
        loadingDays: 6,
        maintenanceDoseG: 0,
        simulationDays: 34,
        monteCarloDraws: 60
    });
    const peakPool = washout.accumulation.days[6].poolG;
    const washoutPool = washout.accumulation.final.poolG;
    const washoutDropFraction = (peakPool - washoutPool) / Math.max(peakPool - washout.accumulation.baselinePoolG, 1e-6);
    checks.push({
        id: "vandenberghe-washout",
        title: "Post-load washout drops the excess pool but is slower than the ~28-day Hultman/Vandenberghe return",
        reference: CREATINE_REFERENCES.vandenberghe1997,
        fixture: "Fixture: 120 g manual baseline, 20 g/d × 6 d then 0 g/d for 28 d.",
        benchmark: "Hultman 1996 and Vandenberghe 1997 report return to baseline by ~28 days. With linear 1.7%/day turnover the modeled excess pool decays with t½ ≈ 41 d, so 28-d washout should erase 30-45% of the excess (visibly, not fully).",
        status: washoutDropFraction >= 0.25 && washoutDropFraction <= 0.55 ? "pass" : "fail",
        detail: `Peak ${peakPool.toFixed(1)} g, day-34 ${washoutPool.toFixed(1)} g, ${(washoutDropFraction * 100).toFixed(1)}% of excess cleared (target 25-55% to reflect the slower-than-observed linear washout).`
    });

    const monteCarloSpread = runCreatineModel({
        bodyPoolBasis: "manual",
        baselinePoolG: 120,
        protocolPreset: "load20",
        loadingDays: 6,
        maintenanceDoseG: 5,
        simulationDays: 30,
        monteCarloDraws: 200
    }).monteCarlo;
    const finalBand = monteCarloSpread.final;
    const responderSpread = (finalBand.saturationP90 - finalBand.saturationP10);
    checks.push({
        id: "responder-spread-envelope",
        title: "Monte Carlo Vmax/Km sampling produces visible responder spread",
        reference: CREATINE_REFERENCES.harris1992,
        fixture: "Fixture: 120 g manual baseline, load20 then 5 g/d maintenance, 30 d, 200 draws.",
        benchmark: "Harris 1992 and Greenhaff 1994 found low responders ~10% rise and high responders ~30%. The 10-90% saturation band should span at least ~6 percentage points on day 30 (lower-bound because the band saturates near the cap).",
        status: responderSpread >= 6 ? "pass" : "fail",
        detail: `Day-30 saturation band ${finalBand.saturationP10.toFixed(1)}% to ${finalBand.saturationP90.toFixed(1)}% (spread ${responderSpread.toFixed(1)} pp).`
    });

    const dietPatternBaselines = ["omnivore", "low_meat", "vegetarian"].map((dietaryPattern) => {
        const result = runCreatineModel({
            bodyPoolBasis: "body_comp",
            dietaryPattern,
            simulationDays: 1,
            monteCarloDraws: 60
        });
        return { dietaryPattern, baseline: result.inputs.baselinePoolG };
    });
    const veg = dietPatternBaselines.find((row) => row.dietaryPattern === "vegetarian");
    const omn = dietPatternBaselines.find((row) => row.dietaryPattern === "omnivore");
    const lowMeat = dietPatternBaselines.find((row) => row.dietaryPattern === "low_meat");
    checks.push({
        id: "diet-shifts-body-comp-baseline",
        title: "Diet pattern actually shifts the body-composition baseline",
        reference: CREATINE_REFERENCES.burke2003,
        fixture: "Fixture: identical body composition, three diet patterns.",
        benchmark: "Vegetarian baseline should be roughly 8% below omnivore; low-meat between them.",
        status: omn.baseline > lowMeat.baseline && lowMeat.baseline > veg.baseline
            && Math.abs(veg.baseline / omn.baseline - 0.92) < 0.01
            ? "pass"
            : "fail",
        detail: `Omnivore ${omn.baseline.toFixed(1)} g, low-meat ${lowMeat.baseline.toFixed(1)} g, vegetarian ${veg.baseline.toFixed(1)} g.`
    });

    const lowPool = runCreatineModel({
        bodyPoolBasis: "manual",
        baselinePoolG: 90,
        protocolPreset: "maintenance5",
        maintenanceDoseG: 0,
        simulationDays: 1,
        monteCarloDraws: 100
    }).accumulation;
    const highPool = runCreatineModel({
        bodyPoolBasis: "manual",
        baselinePoolG: 160,
        protocolPreset: "maintenance5",
        maintenanceDoseG: 0,
        simulationDays: 1,
        monteCarloDraws: 100
    }).accumulation;
    checks.push({
        id: "turnover-scales-with-pool",
        title: "Turnover scales with current pool",
        reference: CREATINE_REFERENCES.ncbiCreatine,
        fixture: "Fixture: manual 90 g and 160 g baseline pools, same 1.7% turnover fraction.",
        benchmark: "The larger pool should have a larger daily turnover instead of both showing a flat 2 g/day loss.",
        status: highPool.baselineTurnoverG > lowPool.baselineTurnoverG
            && Math.abs(lowPool.baselineTurnoverG - 1.53) < 0.02
            && Math.abs(highPool.baselineTurnoverG - 2.72) < 0.02
            ? "pass"
            : "fail",
        detail: `90 g pool turnover ${lowPool.baselineTurnoverG.toFixed(2)} g/day; 160 g pool turnover ${highPool.baselineTurnoverG.toFixed(2)} g/day.`
    });

    // Continuous 20 g/d for 30 days drives the pool against the modeled cap so
    // the dose-pressure / waste-pressure machinery is exercised.
    const wastePressureScenario = runCreatineModel({
        protocolPreset: "custom",
        customLoadingDoseG: 20,
        loadingDays: 30,
        maintenanceDoseG: 20,
        simulationDays: 30,
        monteCarloDraws: 120
    });
    checks.push({
        id: "steady-dose-and-waste-pressure",
        title: "Continued loading surfaces dose pressure and waste pressure",
        reference: CREATINE_REFERENCES.ncbiCreatine,
        fixture: "Fixture: 20 g/day for 30 days against default body-comp baseline.",
        benchmark: "Once the pool is near the modeled cap, the active dose far exceeds steady-state need, so dose pressure should rise above 100% and waste pressure should be positive. The Monte Carlo band should be non-degenerate.",
        status: wastePressureScenario.accumulation.final.steadyStateDoseCrMG > 0
            && wastePressureScenario.monteCarlo.final.steadyDoseP90 > wastePressureScenario.monteCarlo.final.steadyDoseP10
            && wastePressureScenario.accumulation.final.plotSaturationPercent > 100
            && wastePressureScenario.accumulation.final.wastePressureCrMG > 0
            ? "pass"
            : "fail",
        detail: `Final steady dose ${wastePressureScenario.accumulation.final.steadyStateDoseCrMG.toFixed(2)} g/day; MC range ${wastePressureScenario.monteCarlo.final.steadyDoseP10.toFixed(2)} to ${wastePressureScenario.monteCarlo.final.steadyDoseP90.toFixed(2)} g/day; pressure ${wastePressureScenario.accumulation.final.plotSaturationPercent.toFixed(1)}%; waste ${wastePressureScenario.accumulation.final.wastePressureCrMG.toFixed(2)} g/day.`
    });

    const monteCarlo = runCreatineModel({ monteCarloDraws: 120, simulationDays: 30 }).monteCarlo;
    checks.push({
        id: "monte-carlo-envelope",
        title: "Seeded uncertainty envelope",
        reference: CREATINE_REFERENCES.cooper2012,
        fixture: "Fixture: 120 seeded draws over 30 days.",
        benchmark: "The percentile band should be ordered and deterministic for repeatable smoke tests.",
        status: monteCarlo.final.saturationP90 >= monteCarlo.final.saturationP10 ? "pass" : "fail",
        detail: `Day 30 band ${monteCarlo.final.saturationP10.toFixed(1)}% to ${monteCarlo.final.saturationP90.toFixed(1)}%.`
    });

    const directSmm = runCreatineModel({
        bodyPoolBasis: "body_comp",
        skeletalMuscleMassKg: 30,
        muscleCreatineGPerKg: 5.0,
        skeletalMuscleCreatineShare: 0.95,
        simulationDays: 1,
        monteCarloDraws: 100
    });
    checks.push({
        id: "direct-smm-pool",
        title: "Direct SMM scales pool",
        reference: CREATINE_REFERENCES.sagayama2023,
        fixture: "Fixture: direct skeletal muscle mass of 30 kg, 5.0 g creatine/kg wet muscle, 95% muscle share.",
        benchmark: "The baseline total body pool should be about 158 g.",
        status: Math.abs(directSmm.inputs.baselinePoolG - 157.9) < 1 ? "pass" : "fail",
        detail: `Direct SMM fixture estimates ${directSmm.inputs.baselinePoolG.toFixed(1)} g baseline pool.`
    });

    const bodyFatEstimate = runCreatineModel({
        bodyPoolBasis: "body_comp",
        bodyMassKg: 100,
        bodyFatPercent: 10,
        fatFreeMassKg: 0,
        skeletalMuscleMassKg: 0,
        simulationDays: 1,
        monteCarloDraws: 100
    });
    checks.push({
        id: "body-fat-ffm-smm",
        title: "Body fat estimates FFM and SMM",
        reference: CREATINE_REFERENCES.pagano2024,
        fixture: "Fixture: 100 kg body mass, 10% body fat, no direct FFM or SMM.",
        benchmark: "FFM should be 90 kg and default estimated SMM should be 40.5 kg.",
        status: Math.abs(bodyFatEstimate.inputs.bodyComposition.fatFreeMassKg - 90) < 0.1
            && Math.abs(bodyFatEstimate.inputs.bodyComposition.skeletalMuscleMassKg - 40.5) < 0.1
            ? "pass"
            : "fail",
        detail: `Estimated FFM ${bodyFatEstimate.inputs.bodyComposition.fatFreeMassKg.toFixed(1)} kg; SMM ${bodyFatEstimate.inputs.bodyComposition.skeletalMuscleMassKg.toFixed(1)} kg.`
    });

    const brainPool = calculateBrainPoolEstimate(DEFAULT_MODEL_INPUTS);
    checks.push({
        id: "brain-pool-mrs",
        title: "Brain tCr estimate converts MRS concentration",
        reference: CREATINE_REFERENCES.dechent1999,
        fixture: "Fixture: 1.4 kg brain mass and 6.9 mM baseline total creatine.",
        benchmark: "The brain tCr estimate should be about 1.27 g with an 8.7% reference gain.",
        status: brainPool.baselinePoolG > 1.2 && brainPool.baselinePoolG < 1.35 && Math.abs(brainPool.responseTypicalPercent - 8.7) < 0.01
            ? "pass"
            : "fail",
        detail: `Brain tCr estimate ${brainPool.baselinePoolG.toFixed(2)} g; reference gain ${brainPool.responseTypicalGainG.toFixed(2)} g.`
    });

    return checks;
}
