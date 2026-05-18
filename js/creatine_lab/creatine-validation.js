import {
    calculateBrainPoolEstimate,
    calculateMixState,
    calculateStorageState,
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
        title: "20 g loading raises pool",
        reference: CREATINE_REFERENCES.hultman1996,
        fixture: "Fixture: 20 g/day creatine monohydrate for 6 days.",
        benchmark: "The centerline should rapidly raise estimated saturation, matching the Hultman loading direction.",
        status: loading.accumulation.final.percentSaturation > 90 && loading.accumulation.final.supplementGapFilledPercent > 60 ? "pass" : "fail",
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
        monteCarloDraws: 100
    });
    checks.push({
        id: "no-supplement-baseline",
        title: "No supplement does not self-load",
        reference: CREATINE_REFERENCES.ncbiCreatine,
        fixture: "Fixture: manual 100 g baseline pool, 0 g/day supplement, 60 days.",
        benchmark: "The entered baseline already represents habitual diet/synthesis balance, so zero supplemental dose should remain at baseline saturation.",
        status: Math.abs(noSupplement.accumulation.final.percentSaturation - 75) < 0.01
            && Math.abs(noSupplement.accumulation.final.poolG - 100) < 0.01
            && Math.abs(noSupplement.accumulation.final.supplementGapFilledPercent) < 0.01
            ? "pass"
            : "fail",
        detail: `No-supplement scenario ends at ${noSupplement.accumulation.final.poolG.toFixed(1)} g, ${noSupplement.accumulation.final.percentSaturation.toFixed(1)}% estimated saturation, and ${noSupplement.accumulation.final.supplementGapFilledPercent.toFixed(1)}% supplement-gap fill.`
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

    const steadyDose = runCreatineModel({ monteCarloDraws: 120, simulationDays: 60 });
    checks.push({
        id: "steady-dose-and-waste-pressure",
        title: "Steady dose and waste pressure are exposed",
        reference: CREATINE_REFERENCES.ncbiCreatine,
        fixture: "Fixture: default 5 g/day protocol over 60 days.",
        benchmark: "The final day should expose a Monte Carlo steady-dose range and show dose pressure above 100% when the protocol exceeds modeled steady-state need near the cap.",
        status: steadyDose.accumulation.final.steadyStateDoseCrMG > 0
            && steadyDose.monteCarlo.final.steadyDoseP90 > steadyDose.monteCarlo.final.steadyDoseP10
            && steadyDose.accumulation.final.plotSaturationPercent > 100
            && steadyDose.accumulation.final.wastePressureCrMG > 0
            ? "pass"
            : "fail",
        detail: `Final steady dose ${steadyDose.accumulation.final.steadyStateDoseCrMG.toFixed(2)} g/day; range ${steadyDose.monteCarlo.final.steadyDoseP10.toFixed(2)} to ${steadyDose.monteCarlo.final.steadyDoseP90.toFixed(2)} g/day; pressure ${steadyDose.accumulation.final.plotSaturationPercent.toFixed(1)}%.`
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
