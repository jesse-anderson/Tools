export const ACTIVE_CREATINE_FRACTION = 0.879;
export const CREATINE_MOLAR_MASS_G_PER_MOL = 131.13;
export const CREATININE_FROM_CREATINE_FRACTION = 113.12 / 131.13;

// Direct neutral-water solubility values reported by Jager et al. 2011.
// No extrapolation beyond Jager's measured anchors: temperatures below 4 deg C
// or above 60 deg C clamp to the nearest anchor and surface a clamp warning.
export const SOLUBILITY_ANCHORS = [
    { temperatureC: 4, solubilityGPerL: 6 },
    { temperatureC: 20, solubilityGPerL: 14 },
    { temperatureC: 50, solubilityGPerL: 34 },
    { temperatureC: 60, solubilityGPerL: 45 }
];

export const REPORTED_PH_DEGRADATION_ANCHORS = [
    { pH: 3.5, fractionLost3Day: 0.21, confidence: "reported" },
    { pH: 4.5, fractionLost3Day: 0.12, confidence: "reported" },
    { pH: 5.5, fractionLost3Day: 0.04, confidence: "reported" }
];

const NEUTRAL_QUALITATIVE_LOSS_3_DAY = 0.002;
const QUALITATIVE_PH_DEGRADATION_POINTS = [
    { pH: 5.5, fractionLost3Day: 0.04 },
    { pH: 6.5, fractionLost3Day: 0.005 },
    { pH: 7.5, fractionLost3Day: NEUTRAL_QUALITATIVE_LOSS_3_DAY }
];
const BASELINE_SATURATION_LOW = 0.60;
const BASELINE_SATURATION_HIGH = 0.80;

export const DIETARY_INPUTS_G_PER_DAY = {
    omnivore: 1.0,
    low_meat: 0.25,
    vegetarian: 0.0
};

// Literature-supported endogenous synthesis centerlines vary by diet because
// guanidinoacetate methyltransferase activity is partly substrate-regulated.
// Vegetarian/vegan studies report ~1.1-1.7 g/d, omnivores ~0.9-1.1 g/d.
export const LITERATURE_ENDOGENOUS_G_PER_DAY = {
    omnivore: 1.0,
    low_meat: 1.1,
    vegetarian: 1.4
};

// Diet-pattern adjustment applied to muscle creatine concentration when
// computing the body-composition baseline. Vegetarians have lower muscle
// total creatine on average (Burke 2003, Lukaszuk 2005, Solis 2017).
export const DIETARY_MUSCLE_CREATINE_FACTOR = {
    omnivore: 1.0,
    low_meat: 0.97,
    vegetarian: 0.92
};

export const BODY_COMPOSITION_DEFAULTS = Object.freeze({
    bodyFatPercent: 20,
    fatFreeMassKg: 0,
    skeletalMuscleMassKg: 0,
    ffmToSmmFraction: 0.45,
    muscleCreatineGPerKg: 4.6,
    muscleCreatineGPerKgLow: 3.8,
    muscleCreatineGPerKgHigh: 5.4,
    skeletalMuscleCreatineShare: 0.95,
    skeletalMuscleCreatineShareLow: 0.90,
    skeletalMuscleCreatineShareHigh: 0.98
});

// Two literature population centerlines are commonly cited and they bracket a
// non-trivial pool-size difference. Defaults sit on the "general adult" side
// (Cooper 2012 / ISSN 2017 review baselines). The "athletic" preset switches
// FFM-to-SMM and muscle Cr concentration to the D3-creatine athletic-young-male
// cohort (Clark 2014, Sagayama 2023).
export const BODY_COMPOSITION_PRESETS = Object.freeze({
    general_adult: {
        ffmToSmmFraction: 0.45,
        muscleCreatineGPerKg: 4.6,
        sourceKeys: ["cooper2012", "issn2017"]
    },
    athletic_young_male: {
        // Sagayama 2023 measured SMM/FFM ~0.53 in active young males; their
        // creatine-pool/SMM fit landed at 5.0 g/kg.
        ffmToSmmFraction: 0.53,
        muscleCreatineGPerKg: 5.0,
        sourceKeys: ["clark2014", "sagayama2023"]
    }
});

export const BRAIN_POOL_DEFAULTS = Object.freeze({
    brainMassKg: 1.4,
    brainCreatineMm: 6.9,
    brainResponseLowPercent: 3.5,
    brainResponseTypicalPercent: 8.7,
    // Dechent 1999 intersubject whole-brain response range was 3.5-13.3%.
    // The 14.6% value sometimes cited is the THALAMUS regional response
    // averaged across subjects, not an individual's whole-brain response.
    // Shown separately as a regional reference in the UI.
    brainResponseHighPercent: 13.3,
    brainResponseRegionalPeakPercent: 14.6
});

export const DEFAULT_MODEL_INPUTS = Object.freeze({
    doseG: 5,
    volumeValue: 1,
    volumeUnit: "L",
    temperatureValue: 20,
    temperatureUnit: "C",
    consumeFullSuspension: true,
    storageMode: "premixed",
    storageTimeValue: 8,
    storageTimeUnit: "hours",
    storageTemperatureValue: 4,
    storageTemperatureUnit: "C",
    phPreset: "neutral",
    customPh: 7,
    // Q10 = 2.5 sits between an engineering conservative-low default (2.0)
    // and Uzzan 2009's measured Ea ~20 kcal/mol (implies Q10 ~3.1 between
    // 20-30 deg C in glycerol/buffer). Anchor at pH 5.5 / 25 deg C is
    // unchanged; this controls how loss scales off the 25 deg C anchor.
    q10: 2.5,
    bodyMassKg: 70,
    bodyFatPercent: BODY_COMPOSITION_DEFAULTS.bodyFatPercent,
    fatFreeMassKg: BODY_COMPOSITION_DEFAULTS.fatFreeMassKg,
    skeletalMuscleMassKg: BODY_COMPOSITION_DEFAULTS.skeletalMuscleMassKg,
    bodyPoolBasis: "body_comp",
    baselinePoolG: 120,
    ffmToSmmFraction: BODY_COMPOSITION_DEFAULTS.ffmToSmmFraction,
    muscleCreatineGPerKg: BODY_COMPOSITION_DEFAULTS.muscleCreatineGPerKg,
    skeletalMuscleCreatineShare: BODY_COMPOSITION_DEFAULTS.skeletalMuscleCreatineShare,
    brainMassKg: BRAIN_POOL_DEFAULTS.brainMassKg,
    brainCreatineMm: BRAIN_POOL_DEFAULTS.brainCreatineMm,
    brainResponseLowPercent: BRAIN_POOL_DEFAULTS.brainResponseLowPercent,
    brainResponseTypicalPercent: BRAIN_POOL_DEFAULTS.brainResponseTypicalPercent,
    brainResponseHighPercent: BRAIN_POOL_DEFAULTS.brainResponseHighPercent,
    dietaryPattern: "omnivore",
    endogenousGPerDay: 1.0,
    calibrateBackground: true,
    turnoverFractionPerDay: 0.017,
    bodyCompositionPreset: "general_adult",
    protocolPreset: "maintenance5",
    customLoadingDoseG: 10,
    loadingDays: 6,
    maintenanceDoseG: 5,
    simulationDays: 60,
    baselineSaturationFraction: 0.75,
    // Retention parameters re-anchored to Hultman 1996 cumulative 6-day data.
    // Hultman group 1: 20 g/d x 6 d, 74 kg males, ~17% of ingested dose retained.
    //
    // muscleUptakeMaxGPerDay (Vmax): max active uptake per day at empty pool
    //   gap. At Vmax = 8 and the default dose, day-1 retention = Vmax x
    //   17.58/(Km+17.58) = 8 x 0.745 = 5.96 g, matching Hultman day-1 ~5-6 g.
    // muscleUptakeKmActiveG (Km): active dose at which retention is half of
    //   Vmax. Tuned to reflect renal-clearance vs transporter-uptake balance
    //   (Persky reviews; Schedel acute serum Cr peak at ~2.5 h).
    // poolGapHillExponent (Hill): sharpness of retention drop-off as pool
    //   approaches cap. At Hill = 2.0 the cumulative 6-day retention is
    //   17.7% of CrM ingested, matching Hultman's measured 17%.
    muscleUptakeMaxGPerDay: 8.0,
    muscleUptakeKmActiveG: 6.0,
    poolGapHillExponent: 2.0,
    // Legacy fields retained for backward compatibility with old saved settings.
    // If present in incoming settings, normalizeInputs maps them onto the new
    // muscleUptakeMaxGPerDay / muscleUptakeKmActiveG / poolGapHillExponent.
    retentionMax: 0.60,
    retentionShape: 0.35,
    doseRetentionHalfActiveG: 20,
    monteCarloDraws: 500,
    monteCarloSeed: 42019
});

export const PRESET_INPUTS = Object.freeze({
    defaultBottle: {
        doseG: 5,
        volumeValue: 1,
        volumeUnit: "L",
        temperatureValue: 20,
        temperatureUnit: "C",
        storageMode: "premixed",
        storageTemperatureValue: 20,
        storageTemperatureUnit: "C"
    },
    fridgeAddLater: {
        doseG: 5,
        volumeValue: 1,
        volumeUnit: "L",
        temperatureValue: 4,
        temperatureUnit: "C",
        storageMode: "add_later",
        storageTimeValue: 8,
        storageTimeUnit: "hours",
        storageTemperatureValue: 4,
        storageTemperatureUnit: "C"
    },
    smallGlass: {
        doseG: 5,
        volumeValue: 250,
        volumeUnit: "mL",
        temperatureValue: 20,
        temperatureUnit: "C",
        storageMode: "premixed",
        storageTemperatureValue: 20,
        storageTemperatureUnit: "C"
    },
    warmDissolve: {
        doseG: 5,
        volumeValue: 250,
        volumeUnit: "mL",
        temperatureValue: 50,
        temperatureUnit: "C",
        storageMode: "premixed",
        storageTemperatureValue: 50,
        storageTemperatureUnit: "C"
    }
});

export function runCreatineModel(rawInputs = {}) {
    const inputs = normalizeInputs(rawInputs);
    const mix = calculateMixState({
        doseG: inputs.doseG,
        volumeL: inputs.volumeL,
        temperatureC: inputs.temperatureC
    });
    const storage = calculateStorageState(inputs);
    const accumulation = simulateAccumulation(inputs);
    const monteCarlo = simulateMonteCarloEnvelope(inputs);
    const massBalance = checkMassBalance(accumulation);

    return {
        inputs,
        mix,
        storage,
        accumulation,
        monteCarlo,
        massBalance,
        warnings: buildWarnings(inputs, mix, storage, accumulation)
    };
}

// In-line numerical mass-balance check. Used by the validation panel and
// available on every model run so callers can flag drift between the discrete
// simulation and the continuous balance equation.
export function checkMassBalance(accumulation) {
    if (!accumulation?.days?.length) {
        return { residualG: 0, residualFractionOfPool: 0, ok: true };
    }
    const first = accumulation.days[0];
    const last = accumulation.days[accumulation.days.length - 1];
    // Inputs: retained supplemental + background. Outputs: turnover-to-creatinine.
    // Retained already nets out saturation overflow (overflow stays out of the pool),
    // so the cumulative figures should close exactly modulo float rounding.
    const effectiveBackgroundG = last.cumulativeBackgroundG - (last.cumulativeOverflowFromBackgroundG || 0);
    const totalIn = last.cumulativeRetainedG + effectiveBackgroundG;
    const totalOut = last.cumulativeCreatinineG / CREATININE_FROM_CREATINE_FRACTION;
    const expectedPoolG = first.poolG + totalIn - totalOut;
    const residualG = last.poolG - expectedPoolG;
    const referencePoolG = Math.max(last.poolG, 1);
    return {
        totalRetainedG: last.cumulativeRetainedG,
        totalBackgroundG: last.cumulativeBackgroundG,
        effectiveBackgroundG,
        totalTurnoverG: totalOut,
        totalOverflowG: last.cumulativeOverflowG,
        totalOverflowFromBackgroundG: last.cumulativeOverflowFromBackgroundG || 0,
        expectedFinalPoolG: expectedPoolG,
        actualFinalPoolG: last.poolG,
        residualG,
        residualFractionOfPool: residualG / referencePoolG,
        ok: Math.abs(residualG / referencePoolG) < 0.02
    };
}

export function normalizeInputs(rawInputs = {}) {
    const merged = { ...DEFAULT_MODEL_INPUTS, ...rawInputs };
    // Apply body-composition population preset if the user picked one and
    // didn't explicitly override the underlying fields. "custom" leaves the
    // raw inputs untouched.
    const presetKey = String(merged.bodyCompositionPreset || "general_adult");
    const preset = BODY_COMPOSITION_PRESETS[presetKey];
    if (preset && presetKey !== "custom") {
        if (rawInputs.ffmToSmmFraction === undefined) {
            merged.ffmToSmmFraction = preset.ffmToSmmFraction;
        }
        if (rawInputs.muscleCreatineGPerKg === undefined) {
            merged.muscleCreatineGPerKg = preset.muscleCreatineGPerKg;
        }
    }
    const volumeL = convertVolumeToL(numberOrDefault(merged.volumeValue, DEFAULT_MODEL_INPUTS.volumeValue), merged.volumeUnit);
    const temperatureC = convertTemperatureToC(numberOrDefault(merged.temperatureValue, DEFAULT_MODEL_INPUTS.temperatureValue), merged.temperatureUnit);
    const storageTemperatureC = convertTemperatureToC(numberOrDefault(merged.storageTemperatureValue, DEFAULT_MODEL_INPUTS.storageTemperatureValue), merged.storageTemperatureUnit);
    const storageDays = convertTimeToDays(numberOrDefault(merged.storageTimeValue, DEFAULT_MODEL_INPUTS.storageTimeValue), merged.storageTimeUnit);
    const pH = resolvePh(merged.phPreset, merged.customPh);
    const turnoverFraction = normalizeFraction(merged.turnoverFractionPerDay, DEFAULT_MODEL_INPUTS.turnoverFractionPerDay);
    const bodyPoolBasis = ["body_comp", "manual"].includes(String(merged.bodyPoolBasis)) ? String(merged.bodyPoolBasis) : DEFAULT_MODEL_INPUTS.bodyPoolBasis;

    const normalized = {
        doseG: positiveNumber(merged.doseG, DEFAULT_MODEL_INPUTS.doseG),
        volumeValue: positiveNumber(merged.volumeValue, DEFAULT_MODEL_INPUTS.volumeValue),
        volumeUnit: String(merged.volumeUnit || DEFAULT_MODEL_INPUTS.volumeUnit),
        volumeL,
        temperatureValue: numberOrDefault(merged.temperatureValue, DEFAULT_MODEL_INPUTS.temperatureValue),
        temperatureUnit: String(merged.temperatureUnit || DEFAULT_MODEL_INPUTS.temperatureUnit),
        temperatureC,
        consumeFullSuspension: Boolean(merged.consumeFullSuspension),
        storageMode: String(merged.storageMode || DEFAULT_MODEL_INPUTS.storageMode),
        storageTimeValue: positiveNumber(merged.storageTimeValue, DEFAULT_MODEL_INPUTS.storageTimeValue),
        storageTimeUnit: String(merged.storageTimeUnit || DEFAULT_MODEL_INPUTS.storageTimeUnit),
        storageDays,
        storageTemperatureValue: numberOrDefault(merged.storageTemperatureValue, DEFAULT_MODEL_INPUTS.storageTemperatureValue),
        storageTemperatureUnit: String(merged.storageTemperatureUnit || DEFAULT_MODEL_INPUTS.storageTemperatureUnit),
        storageTemperatureC,
        phPreset: String(merged.phPreset || DEFAULT_MODEL_INPUTS.phPreset),
        pH,
        customPh: numberOrDefault(merged.customPh, DEFAULT_MODEL_INPUTS.customPh),
        q10: positiveNumber(merged.q10, DEFAULT_MODEL_INPUTS.q10),
        bodyMassKg: positiveNumber(merged.bodyMassKg, DEFAULT_MODEL_INPUTS.bodyMassKg),
        bodyFatPercent: clamp(numberOrDefault(merged.bodyFatPercent, DEFAULT_MODEL_INPUTS.bodyFatPercent), 3, 60),
        fatFreeMassKg: nonNegativeNumber(merged.fatFreeMassKg, DEFAULT_MODEL_INPUTS.fatFreeMassKg),
        skeletalMuscleMassKg: nonNegativeNumber(merged.skeletalMuscleMassKg, DEFAULT_MODEL_INPUTS.skeletalMuscleMassKg),
        bodyPoolBasis,
        bodyCompositionPreset: presetKey,
        manualBaselinePoolG: positiveNumber(merged.baselinePoolG, DEFAULT_MODEL_INPUTS.baselinePoolG),
        baselinePoolG: positiveNumber(merged.baselinePoolG, DEFAULT_MODEL_INPUTS.baselinePoolG),
        ffmToSmmFraction: clamp(normalizeFraction(merged.ffmToSmmFraction, DEFAULT_MODEL_INPUTS.ffmToSmmFraction), 0.25, 0.65),
        muscleCreatineGPerKg: clamp(numberOrDefault(merged.muscleCreatineGPerKg, DEFAULT_MODEL_INPUTS.muscleCreatineGPerKg), 3, 7),
        skeletalMuscleCreatineShare: clamp(normalizeFraction(merged.skeletalMuscleCreatineShare, DEFAULT_MODEL_INPUTS.skeletalMuscleCreatineShare), 0.75, 0.99),
        brainMassKg: clamp(numberOrDefault(merged.brainMassKg, DEFAULT_MODEL_INPUTS.brainMassKg), 0.8, 2.2),
        brainCreatineMm: clamp(numberOrDefault(merged.brainCreatineMm, DEFAULT_MODEL_INPUTS.brainCreatineMm), 3, 12),
        brainResponseLowPercent: clamp(numberOrDefault(merged.brainResponseLowPercent, DEFAULT_MODEL_INPUTS.brainResponseLowPercent), 0, 50),
        brainResponseTypicalPercent: clamp(numberOrDefault(merged.brainResponseTypicalPercent, DEFAULT_MODEL_INPUTS.brainResponseTypicalPercent), 0, 50),
        brainResponseHighPercent: clamp(numberOrDefault(merged.brainResponseHighPercent, DEFAULT_MODEL_INPUTS.brainResponseHighPercent), 0, 50),
        dietaryPattern: String(merged.dietaryPattern || DEFAULT_MODEL_INPUTS.dietaryPattern),
        endogenousGPerDay: nonNegativeNumber(merged.endogenousGPerDay, DEFAULT_MODEL_INPUTS.endogenousGPerDay),
        calibrateBackground: merged.calibrateBackground !== false,
        turnoverFractionPerDay: turnoverFraction,
        protocolPreset: String(merged.protocolPreset || DEFAULT_MODEL_INPUTS.protocolPreset),
        customLoadingDoseG: nonNegativeNumber(merged.customLoadingDoseG, DEFAULT_MODEL_INPUTS.customLoadingDoseG),
        loadingDays: Math.max(0, Math.round(numberOrDefault(merged.loadingDays, DEFAULT_MODEL_INPUTS.loadingDays))),
        maintenanceDoseG: nonNegativeNumber(merged.maintenanceDoseG, DEFAULT_MODEL_INPUTS.maintenanceDoseG),
        simulationDays: clamp(Math.round(numberOrDefault(merged.simulationDays, DEFAULT_MODEL_INPUTS.simulationDays)), 1, 365),
        baselineSaturationFraction: clamp(normalizeFraction(merged.baselineSaturationPercent ?? merged.baselineSaturationFraction, DEFAULT_MODEL_INPUTS.baselineSaturationFraction), 0.50, 0.95),
        retentionMax: clamp(numberOrDefault(merged.retentionMax, DEFAULT_MODEL_INPUTS.retentionMax), 0, 1),
        retentionShape: clamp(numberOrDefault(merged.retentionShape, DEFAULT_MODEL_INPUTS.retentionShape), 0.25, 3),
        doseRetentionHalfActiveG: positiveNumber(merged.doseRetentionHalfActiveG, DEFAULT_MODEL_INPUTS.doseRetentionHalfActiveG),
        muscleUptakeMaxGPerDay: clamp(numberOrDefault(merged.muscleUptakeMaxGPerDay, DEFAULT_MODEL_INPUTS.muscleUptakeMaxGPerDay), 1, 20),
        muscleUptakeKmActiveG: clamp(numberOrDefault(merged.muscleUptakeKmActiveG, DEFAULT_MODEL_INPUTS.muscleUptakeKmActiveG), 0.5, 30),
        poolGapHillExponent: clamp(numberOrDefault(merged.poolGapHillExponent, DEFAULT_MODEL_INPUTS.poolGapHillExponent), 0.5, 3),
        monteCarloDraws: clamp(Math.round(numberOrDefault(merged.monteCarloDraws, DEFAULT_MODEL_INPUTS.monteCarloDraws)), 100, 2000),
        monteCarloSeed: Math.round(numberOrDefault(merged.monteCarloSeed, DEFAULT_MODEL_INPUTS.monteCarloSeed))
    };

    normalized.bodyComposition = calculateBodyCompositionEstimate(normalized);
    if (normalized.bodyPoolBasis === "body_comp") {
        normalized.baselinePoolG = normalized.bodyComposition.totalPoolG;
    }
    normalized.bodyComposition.selectedBaselinePoolG = normalized.baselinePoolG;
    normalized.brain = calculateBrainPoolEstimate(normalized);

    return normalized;
}

export function calculateMixState({ doseG, volumeL, temperatureC }) {
    const solubility = getSolubilityGPerL(temperatureC);
    const maxDissolvedG = solubility.solubilityGPerL * volumeL;
    const dissolvedG = Math.min(doseG, maxDissolvedG);
    const undissolvedG = Math.max(doseG - dissolvedG, 0);
    const percentDissolved = doseG > 0 ? (dissolvedG / doseG) * 100 : 100;
    const waterNeededL = solubility.solubilityGPerL > 0 ? doseG / solubility.solubilityGPerL : Infinity;

    return {
        temperatureC,
        solubilityGPerL: solubility.solubilityGPerL,
        isTemperatureClamped: solubility.clamped,
        temperatureUsedC: solubility.temperatureUsedC,
        maxDissolvedG,
        dissolvedG,
        undissolvedG,
        percentDissolved,
        waterNeededL,
        activeDoseG: doseG * ACTIVE_CREATINE_FRACTION,
        activeDissolvedG: dissolvedG * ACTIVE_CREATINE_FRACTION,
        activeUndissolvedG: undissolvedG * ACTIVE_CREATINE_FRACTION
    };
}

export function calculateBodyCompositionEstimate(params = {}) {
    const bodyMassKg = positiveNumber(params.bodyMassKg, DEFAULT_MODEL_INPUTS.bodyMassKg);
    const bodyFatPercent = clamp(numberOrDefault(params.bodyFatPercent, DEFAULT_MODEL_INPUTS.bodyFatPercent), 3, 60);
    const directFatFreeMassKg = nonNegativeNumber(params.fatFreeMassKg, BODY_COMPOSITION_DEFAULTS.fatFreeMassKg);
    const directSkeletalMuscleMassKg = nonNegativeNumber(params.skeletalMuscleMassKg, BODY_COMPOSITION_DEFAULTS.skeletalMuscleMassKg);
    const ffmToSmmFraction = clamp(normalizeFraction(params.ffmToSmmFraction, BODY_COMPOSITION_DEFAULTS.ffmToSmmFraction), 0.25, 0.65);
    const muscleCreatineGPerKgRaw = clamp(numberOrDefault(params.muscleCreatineGPerKg, BODY_COMPOSITION_DEFAULTS.muscleCreatineGPerKg), 3, 7);
    const dietaryPattern = String(params.dietaryPattern || "omnivore");
    const dietaryMuscleFactor = DIETARY_MUSCLE_CREATINE_FACTOR[dietaryPattern] ?? 1.0;
    const muscleCreatineGPerKg = muscleCreatineGPerKgRaw * dietaryMuscleFactor;
    const skeletalMuscleCreatineShare = clamp(normalizeFraction(params.skeletalMuscleCreatineShare, BODY_COMPOSITION_DEFAULTS.skeletalMuscleCreatineShare), 0.75, 0.99);
    const baselineSaturationFraction = clamp(normalizeFraction(params.baselineSaturationFraction, DEFAULT_MODEL_INPUTS.baselineSaturationFraction), 0.50, 0.95);

    const estimatedFatFreeMassKg = bodyMassKg * (1 - bodyFatPercent / 100);
    const fatFreeMassKg = directFatFreeMassKg > 0 ? directFatFreeMassKg : estimatedFatFreeMassKg;
    const estimatedSkeletalMuscleMassKg = fatFreeMassKg * ffmToSmmFraction;
    const skeletalMuscleMassKg = directSkeletalMuscleMassKg > 0 ? directSkeletalMuscleMassKg : estimatedSkeletalMuscleMassKg;
    const muscleCreatinePoolG = skeletalMuscleMassKg * muscleCreatineGPerKg;
    const totalPoolG = muscleCreatinePoolG / skeletalMuscleCreatineShare;
    const nonMusclePoolG = Math.max(totalPoolG - muscleCreatinePoolG, 0);
    const lowGPerKg = Math.min(BODY_COMPOSITION_DEFAULTS.muscleCreatineGPerKgLow, muscleCreatineGPerKg);
    const highGPerKg = Math.max(BODY_COMPOSITION_DEFAULTS.muscleCreatineGPerKgHigh, muscleCreatineGPerKg);
    const lowerTotalShare = Math.min(0.99, Math.max(BODY_COMPOSITION_DEFAULTS.skeletalMuscleCreatineShareHigh, skeletalMuscleCreatineShare));
    const upperTotalShare = Math.max(0.75, Math.min(BODY_COMPOSITION_DEFAULTS.skeletalMuscleCreatineShareLow, skeletalMuscleCreatineShare));
    const totalPoolLowG = (skeletalMuscleMassKg * lowGPerKg) / lowerTotalShare;
    const totalPoolHighG = (skeletalMuscleMassKg * highGPerKg) / upperTotalShare;
    const capLowSaturation = Math.max(BASELINE_SATURATION_HIGH, baselineSaturationFraction);
    const capHighSaturation = Math.min(BASELINE_SATURATION_LOW, baselineSaturationFraction);

    return {
        bodyMassKg,
        bodyFatPercent,
        estimatedFatFreeMassKg,
        fatFreeMassKg,
        fatFreeMassSource: directFatFreeMassKg > 0 ? "direct" : "body-fat estimate",
        estimatedSkeletalMuscleMassKg,
        skeletalMuscleMassKg,
        skeletalMuscleMassSource: directSkeletalMuscleMassKg > 0
            ? "direct"
            : directFatFreeMassKg > 0
                ? "direct FFM estimate"
                : "body-fat/FFM estimate",
        ffmToSmmFraction,
        muscleCreatineGPerKgRaw,
        muscleCreatineGPerKg,
        dietaryPattern,
        dietaryMuscleFactor,
        skeletalMuscleCreatineShare,
        muscleCreatinePoolG,
        nonMusclePoolG,
        totalPoolG,
        totalPoolLowG,
        totalPoolHighG,
        baselineSaturationFraction,
        baselineSaturationLowFraction: BASELINE_SATURATION_LOW,
        baselineSaturationHighFraction: BASELINE_SATURATION_HIGH,
        saturationCapG: totalPoolG / baselineSaturationFraction,
        saturationCapLowG: totalPoolLowG / capLowSaturation,
        saturationCapHighG: totalPoolHighG / capHighSaturation
    };
}

export function calculateBrainPoolEstimate(params = {}) {
    const brainMassKg = clamp(numberOrDefault(params.brainMassKg, BRAIN_POOL_DEFAULTS.brainMassKg), 0.8, 2.2);
    const brainCreatineMm = clamp(numberOrDefault(params.brainCreatineMm, BRAIN_POOL_DEFAULTS.brainCreatineMm), 3, 12);
    const lowPercent = clamp(numberOrDefault(params.brainResponseLowPercent, BRAIN_POOL_DEFAULTS.brainResponseLowPercent), 0, 50);
    const typicalPercent = clamp(numberOrDefault(params.brainResponseTypicalPercent, BRAIN_POOL_DEFAULTS.brainResponseTypicalPercent), 0, 50);
    const highPercent = clamp(numberOrDefault(params.brainResponseHighPercent, BRAIN_POOL_DEFAULTS.brainResponseHighPercent), 0, 50);
    const baselinePoolG = brainCreatineMm * brainMassKg * (CREATINE_MOLAR_MASS_G_PER_MOL / 1000);

    return {
        brainMassKg,
        brainCreatineMm,
        baselinePoolG,
        responseLowPercent: lowPercent,
        responseTypicalPercent: typicalPercent,
        responseHighPercent: highPercent,
        responseLowGainG: baselinePoolG * (lowPercent / 100),
        responseTypicalGainG: baselinePoolG * (typicalPercent / 100),
        responseHighGainG: baselinePoolG * (highPercent / 100),
        responseLowPoolG: baselinePoolG * (1 + lowPercent / 100),
        responseTypicalPoolG: baselinePoolG * (1 + typicalPercent / 100),
        responseHighPoolG: baselinePoolG * (1 + highPercent / 100)
    };
}

export function calculateStorageState(inputs) {
    const mixAtStorageTemperature = calculateMixState({
        doseG: inputs.doseG,
        volumeL: inputs.volumeL,
        temperatureC: inputs.storageTemperatureC
    });

    if (inputs.storageMode === "dry_powder") {
        return {
            mode: inputs.storageMode,
            mixAtStorageTemperature,
            degradationApplies: false,
            degradationNote: "Dry powder mode: aqueous degradation is not applied.",
            pH: inputs.pH,
            kPerDay25C: 0,
            kPerDayAdjusted: 0,
            fractionLost: 0,
            dissolvedRemainingG: mixAtStorageTemperature.dissolvedG,
            undissolvedRemainingG: mixAtStorageTemperature.undissolvedG,
            totalRemainingG: inputs.doseG,
            activeEquivalentRemainingG: inputs.doseG * ACTIVE_CREATINE_FRACTION,
            activeEquivalentLostG: 0,
            creatinineProxyG: 0,
            confidence: "not aqueous"
        };
    }

    if (inputs.storageMode === "add_later") {
        return {
            mode: inputs.storageMode,
            mixAtStorageTemperature,
            degradationApplies: false,
            degradationNote: "Water stored first: no creatine is in solution until added.",
            pH: inputs.pH,
            kPerDay25C: 0,
            kPerDayAdjusted: 0,
            fractionLost: 0,
            dissolvedRemainingG: mixAtStorageTemperature.dissolvedG,
            undissolvedRemainingG: mixAtStorageTemperature.undissolvedG,
            totalRemainingG: inputs.doseG,
            activeEquivalentRemainingG: inputs.doseG * ACTIVE_CREATINE_FRACTION,
            activeEquivalentLostG: 0,
            creatinineProxyG: 0,
            confidence: "storage-before-mixing"
        };
    }

    const degradation = getDegradationRate(inputs.pH, inputs.storageTemperatureC, inputs.q10);
    const fractionLost = 1 - Math.exp(-degradation.kPerDayAdjusted * inputs.storageDays);
    const lostDissolvedG = mixAtStorageTemperature.dissolvedG * fractionLost;
    const dissolvedRemainingG = mixAtStorageTemperature.dissolvedG - lostDissolvedG;
    const totalRemainingG = dissolvedRemainingG + mixAtStorageTemperature.undissolvedG;
    const activeEquivalentLostG = lostDissolvedG * ACTIVE_CREATINE_FRACTION;

    return {
        mode: inputs.storageMode,
        mixAtStorageTemperature,
        degradationApplies: true,
        degradationNote: "Premixed solution/suspension: first-order degradation is applied to the dissolved fraction.",
        pH: inputs.pH,
        kPerDay25C: degradation.kPerDay25C,
        kPerDayAdjusted: degradation.kPerDayAdjusted,
        fractionLost,
        dissolvedRemainingG,
        undissolvedRemainingG: mixAtStorageTemperature.undissolvedG,
        totalRemainingG,
        activeEquivalentRemainingG: totalRemainingG * ACTIVE_CREATINE_FRACTION,
        activeEquivalentLostG,
        creatinineProxyG: activeEquivalentLostG * CREATININE_FROM_CREATINE_FRACTION,
        confidence: degradation.confidence
    };
}

export function simulateAccumulation(inputs, overrides = {}) {
    const params = { ...inputs, ...overrides };
    const baselinePoolG = positiveNumber(params.baselinePoolG, DEFAULT_MODEL_INPUTS.baselinePoolG);
    const baselineSaturationFraction = clamp(normalizeFraction(params.baselineSaturationFraction, DEFAULT_MODEL_INPUTS.baselineSaturationFraction), 0.50, 0.95);
    const poolCapG = baselinePoolG / baselineSaturationFraction;
    const capGapG = Math.max(poolCapG - baselinePoolG, 1e-9);
    const turnoverFractionPerDay = params.turnoverFractionPerDay;

    const dietaryGPerDay = params.dietaryGPerDay ?? DIETARY_INPUTS_G_PER_DAY[params.dietaryPattern] ?? DIETARY_INPUTS_G_PER_DAY.omnivore;
    const baselineTurnoverG = baselinePoolG * turnoverFractionPerDay;
    const literatureEndogenousGPerDay = params.endogenousGPerDayOverride
        ?? params.endogenousGPerDay
        ?? LITERATURE_ENDOGENOUS_G_PER_DAY[params.dietaryPattern]
        ?? LITERATURE_ENDOGENOUS_G_PER_DAY.omnivore;
    const calibrateBackground = params.calibrateBackground !== false;
    // Calibration mode: pin background to baselineTurnover so the user-chosen
    // baseline IS the steady state. Endogenous synthesis is the residual the
    // diet does not cover. Reflects "what synthesis must equal for this person
    // to sit at this pool." Off → use literature endogenous and let the pool
    // drift toward background / turnover.
    const calibratedEndogenousGPerDay = Math.max(0, baselineTurnoverG - dietaryGPerDay);
    const endogenousGPerDay = calibrateBackground ? calibratedEndogenousGPerDay : literatureEndogenousGPerDay;
    const backgroundInputGPerDay = endogenousGPerDay + dietaryGPerDay;
    const equilibriumPoolG = turnoverFractionPerDay > 0
        ? backgroundInputGPerDay / turnoverFractionPerDay
        : baselinePoolG;
    const backgroundDeficitGPerDay = baselineTurnoverG - backgroundInputGPerDay;

    let currentPoolG = baselinePoolG;
    let cumulativeDoseCrMG = 0;
    let cumulativeActiveSupplementG = 0;
    let cumulativeRetainedG = 0;
    let cumulativeExcretedSupplementG = 0;
    let cumulativeCreatinineG = 0;
    let cumulativeBackgroundG = 0;
    let cumulativeOverflowG = 0;
    let cumulativeOverflowFromBackgroundG = 0;
    const initialSteadyState = calculateSteadyStateDose({
        poolG: currentPoolG,
        backgroundInputGPerDay,
        turnoverFractionPerDay
    });
    const baselineCreatinineGPerDay = baselineTurnoverG * CREATININE_FROM_CREATINE_FRACTION;
    const days = [{
        day: 0,
        doseCrMG: 0,
        activeSupplementG: 0,
        retainedSupplementG: 0,
        excretedSupplementG: 0,
        retentionFraction: 0,
        backgroundInputGPerDay,
        baselineTurnoverG,
        dailyLossG: currentPoolG * turnoverFractionPerDay,
        creatinineProducedG: currentPoolG * turnoverFractionPerDay * CREATININE_FROM_CREATINE_FRACTION,
        baselineCreatinineGPerDay,
        netPoolChangeG: 0,
        steadyStateActiveG: initialSteadyState.steadyStateActiveG,
        steadyStateDoseCrMG: initialSteadyState.steadyStateDoseCrMG,
        excessDoseCrMG: 0,
        wastePressureCrMG: 0,
        poolG: currentPoolG,
        equilibriumPoolG,
        percentSaturation: (currentPoolG / poolCapG) * 100,
        plotSaturationPercent: (currentPoolG / poolCapG) * 100,
        supplementGapFilledPercent: 0,
        cumulativeDoseCrMG: 0,
        cumulativeActiveSupplementG: 0,
        cumulativeRetainedG: 0,
        cumulativeExcretedSupplementG: 0,
        cumulativeCreatinineG: 0,
        cumulativeBackgroundG: 0,
        cumulativeOverflowG: 0,
        cumulativeOverflowFromBackgroundG: 0,
        retentionEfficiency: 0
    }];

    for (let day = 1; day <= params.simulationDays; day += 1) {
        const previousPoolG = currentPoolG;
        const previousSteadyState = calculateSteadyStateDose({
            poolG: previousPoolG,
            backgroundInputGPerDay,
            turnoverFractionPerDay
        });
        const doseCrMG = getProtocolDoseForDay(params, day);
        const activeSupplementG = doseCrMG * ACTIVE_CREATINE_FRACTION;

        // Saturable Michaelis-Menten muscle uptake with Hill-shaped pool-gap
        // attenuation. intendedRetainedG is the active creatine taken up by
        // muscle on this day before any pool-cap overflow is applied.
        // intendedRetainedG = Vmax × gapFraction^n × active / (Km + active)
        // Anchored to Hultman 1996: 20 g/d on empty pool retains ~5-6 g day 1
        // and falls below 1 g/d by day 6.
        const intendedRetainedG = computeMuscleUptakeG({
            previousPoolG,
            baselinePoolG,
            poolCapG,
            activeSupplementG,
            params
        });

        // Exponential per-day integration of the linear ODE
        // dPool/dt = inputRate − k × pool, with inputRate treated as constant.
        // Closed-form solution: next = prev × e^(−k) + (inputRate/k) × (1 − e^(−k)).
        // Mass balance closes by construction; cumulative turnover is derived
        // from the analytical pool change instead of forward-Euler pool×k.
        const inputRateGPerDay = intendedRetainedG + backgroundInputGPerDay;
        const decay = Math.exp(-turnoverFractionPerDay);
        const rawNextPoolG = turnoverFractionPerDay > 0
            ? previousPoolG * decay + (inputRateGPerDay / turnoverFractionPerDay) * (1 - decay)
            : previousPoolG + inputRateGPerDay;
        const nextPoolGUnclamped = rawNextPoolG;
        const nextPoolG = clamp(nextPoolGUnclamped, 0, poolCapG);
        // Daily turnover loss is whatever the closed-form integration removed
        // before any cap clamping.
        const dailyLossG = Math.max(previousPoolG + inputRateGPerDay - nextPoolGUnclamped, 0);
        const creatinineProducedG = dailyLossG * CREATININE_FROM_CREATINE_FRACTION;
        const overflowG = Math.max(nextPoolGUnclamped - poolCapG, 0);
        // Attribute saturation overflow first to the supplement (the "discretionary"
        // input), then to background only if the supplement allocation is exhausted.
        const overflowAttributedToSupplementG = Math.min(overflowG, intendedRetainedG);
        const overflowFromBackgroundG = Math.max(overflowG - overflowAttributedToSupplementG, 0);
        const retainedSupplementG = Math.max(intendedRetainedG - overflowAttributedToSupplementG, 0);
        const excretedSupplementG = Math.max(activeSupplementG - retainedSupplementG, 0);
        const retentionFraction = activeSupplementG > 0 ? retainedSupplementG / activeSupplementG : 0;
        const netPoolChangeG = nextPoolG - previousPoolG;

        // Dose pressure: extra dose pushing against an already-near-cap pool.
        // Above the steady-state need, the surplus has nowhere productive to go.
        const excessAboveSteadyActiveG = Math.max(activeSupplementG - previousSteadyState.steadyStateActiveG, 0);
        const saturationPressurePercent = ((previousPoolG + excessAboveSteadyActiveG) / poolCapG) * 100;
        const wastePressureActiveG = Math.max(
            previousPoolG + excessAboveSteadyActiveG - poolCapG,
            overflowG
        );

        currentPoolG = nextPoolG;
        cumulativeDoseCrMG += doseCrMG;
        cumulativeActiveSupplementG += activeSupplementG;
        cumulativeRetainedG += retainedSupplementG;
        cumulativeExcretedSupplementG += excretedSupplementG;
        cumulativeCreatinineG += creatinineProducedG;
        cumulativeBackgroundG += backgroundInputGPerDay;
        cumulativeOverflowG += overflowG;
        cumulativeOverflowFromBackgroundG += overflowFromBackgroundG;
        const steadyState = calculateSteadyStateDose({
            poolG: currentPoolG,
            backgroundInputGPerDay,
            turnoverFractionPerDay
        });
        const percentSaturation = clamp((currentPoolG / poolCapG) * 100, 0, 100);
        const retentionEfficiency = cumulativeActiveSupplementG > 0
            ? cumulativeRetainedG / cumulativeActiveSupplementG
            : 0;

        days.push({
            day,
            doseCrMG,
            activeSupplementG,
            retainedSupplementG,
            excretedSupplementG,
            retentionFraction,
            backgroundInputGPerDay,
            baselineTurnoverG,
            dailyLossG,
            creatinineProducedG,
            baselineCreatinineGPerDay,
            netPoolChangeG,
            steadyStateActiveG: steadyState.steadyStateActiveG,
            steadyStateDoseCrMG: steadyState.steadyStateDoseCrMG,
            excessDoseCrMG: Math.max(doseCrMG - previousSteadyState.steadyStateDoseCrMG, 0),
            wastePressureCrMG: wastePressureActiveG / ACTIVE_CREATINE_FRACTION,
            poolG: currentPoolG,
            equilibriumPoolG,
            percentSaturation,
            plotSaturationPercent: Math.max(percentSaturation, saturationPressurePercent),
            supplementGapFilledPercent: clamp(((currentPoolG - baselinePoolG) / capGapG) * 100, 0, 100),
            cumulativeDoseCrMG,
            cumulativeActiveSupplementG,
            cumulativeRetainedG,
            cumulativeExcretedSupplementG,
            cumulativeCreatinineG,
            cumulativeBackgroundG,
            cumulativeOverflowG,
            cumulativeOverflowFromBackgroundG,
            retentionEfficiency
        });
    }

    const thresholds = buildThresholdSummary(days, [90, 95, 99]);

    return {
        baselinePoolG,
        poolCapG,
        baselineSaturationFraction,
        dietaryGPerDay,
        endogenousGPerDay,
        literatureEndogenousGPerDay,
        calibratedEndogenousGPerDay,
        calibrateBackground,
        backgroundInputGPerDay,
        backgroundDeficitGPerDay,
        baselineTurnoverG,
        baselineCreatinineGPerDay,
        equilibriumPoolG,
        days,
        thresholds,
        final: days[days.length - 1]
    };
}

export function simulateMonteCarloEnvelope(inputs) {
    const drawCount = inputs.monteCarloDraws;
    const rng = createSeededRandom(inputs.monteCarloSeed);
    const simulations = [];

    for (let i = 0; i < drawCount; i += 1) {
        const dietaryCenter = DIETARY_INPUTS_G_PER_DAY[inputs.dietaryPattern] ?? DIETARY_INPUTS_G_PER_DAY.omnivore;
        const literatureEndogenousCenter = LITERATURE_ENDOGENOUS_G_PER_DAY[inputs.dietaryPattern] ?? LITERATURE_ENDOGENOUS_G_PER_DAY.omnivore;
        const dietaryGPerDay = triangular(rng, Math.max(0, dietaryCenter - 0.5), dietaryCenter, dietaryCenter + 0.5);
        const literatureEndogenousGPerDay = triangular(
            rng,
            Math.max(0, literatureEndogenousCenter - 0.3),
            literatureEndogenousCenter,
            literatureEndogenousCenter + 0.3
        );
        const sampled = {
            baselinePoolG: sampleBaselinePoolG(inputs, rng),
            baselineSaturationFraction: triangular(rng, BASELINE_SATURATION_LOW, inputs.baselineSaturationFraction, BASELINE_SATURATION_HIGH),
            turnoverFractionPerDay: triangular(rng, Math.max(0.005, inputs.turnoverFractionPerDay - 0.003), inputs.turnoverFractionPerDay, inputs.turnoverFractionPerDay + 0.003),
            // Responder/non-responder spread (Harris 1992, Greenhaff 1994):
            // low-responders gain ~10% pool, high-responders ~30%. Sample Vmax
            // ±40% and Km ±40% around the center to span that band visually.
            muscleUptakeMaxGPerDay: triangular(
                rng,
                Math.max(2, inputs.muscleUptakeMaxGPerDay * 0.60),
                inputs.muscleUptakeMaxGPerDay,
                inputs.muscleUptakeMaxGPerDay * 1.40
            ),
            muscleUptakeKmActiveG: triangular(
                rng,
                Math.max(1, inputs.muscleUptakeKmActiveG * 0.60),
                inputs.muscleUptakeKmActiveG,
                inputs.muscleUptakeKmActiveG * 1.60
            ),
            // Hill exponent is held at the configured value: it controls the
            // shape, not the magnitude, of saturation.
            dietaryGPerDay,
            // endogenousGPerDayOverride feeds simulateAccumulation. In calibration mode the
            // simulation still pins background to the sampled baseline turnover; the literature
            // value matters only when calibration is off.
            endogenousGPerDayOverride: literatureEndogenousGPerDay
        };

        simulations.push(simulateAccumulation(inputs, sampled));
    }

    const daySummaries = [];
    for (let day = 0; day <= inputs.simulationDays; day += 1) {
        const pools = simulations.map((simulation) => simulation.days[day].poolG);
        const saturations = simulations.map((simulation) => simulation.days[day].percentSaturation);
        const saturationPressures = simulations.map((simulation) => simulation.days[day].plotSaturationPercent);
        const steadyDoses = simulations.map((simulation) => simulation.days[day].steadyStateDoseCrMG);
        const wastePressures = simulations.map((simulation) => simulation.days[day].wastePressureCrMG);
        const dailyLosses = simulations.map((simulation) => simulation.days[day].dailyLossG);
        const creatinines = simulations.map((simulation) => simulation.days[day].creatinineProducedG);
        const retainedG = simulations.map((simulation) => simulation.days[day].retainedSupplementG);
        const excretedG = simulations.map((simulation) => simulation.days[day].excretedSupplementG);
        const cumulativeRetainedG = simulations.map((simulation) => simulation.days[day].cumulativeRetainedG);
        const cumulativeDoseG = simulations.map((simulation) => simulation.days[day].cumulativeDoseCrMG);
        const retentionEfficiencies = simulations.map((simulation) => simulation.days[day].retentionEfficiency);
        daySummaries.push({
            day,
            poolP10: percentile(pools, 0.10),
            poolMedian: percentile(pools, 0.50),
            poolP90: percentile(pools, 0.90),
            saturationP10: percentile(saturations, 0.10),
            saturationMedian: percentile(saturations, 0.50),
            saturationP90: percentile(saturations, 0.90),
            saturationPressureP10: percentile(saturationPressures, 0.10),
            saturationPressureMedian: percentile(saturationPressures, 0.50),
            saturationPressureP90: percentile(saturationPressures, 0.90),
            steadyDoseP10: percentile(steadyDoses, 0.10),
            steadyDoseMedian: percentile(steadyDoses, 0.50),
            steadyDoseP90: percentile(steadyDoses, 0.90),
            wastePressureP10: percentile(wastePressures, 0.10),
            wastePressureMedian: percentile(wastePressures, 0.50),
            wastePressureP90: percentile(wastePressures, 0.90),
            dailyLossP10: percentile(dailyLosses, 0.10),
            dailyLossMedian: percentile(dailyLosses, 0.50),
            dailyLossP90: percentile(dailyLosses, 0.90),
            creatinineP10: percentile(creatinines, 0.10),
            creatinineMedian: percentile(creatinines, 0.50),
            creatinineP90: percentile(creatinines, 0.90),
            retainedP10: percentile(retainedG, 0.10),
            retainedMedian: percentile(retainedG, 0.50),
            retainedP90: percentile(retainedG, 0.90),
            excretedP10: percentile(excretedG, 0.10),
            excretedMedian: percentile(excretedG, 0.50),
            excretedP90: percentile(excretedG, 0.90),
            cumulativeRetainedP10: percentile(cumulativeRetainedG, 0.10),
            cumulativeRetainedMedian: percentile(cumulativeRetainedG, 0.50),
            cumulativeRetainedP90: percentile(cumulativeRetainedG, 0.90),
            cumulativeDoseP10: percentile(cumulativeDoseG, 0.10),
            cumulativeDoseMedian: percentile(cumulativeDoseG, 0.50),
            cumulativeDoseP90: percentile(cumulativeDoseG, 0.90),
            retentionEfficiencyP10: percentile(retentionEfficiencies, 0.10),
            retentionEfficiencyMedian: percentile(retentionEfficiencies, 0.50),
            retentionEfficiencyP90: percentile(retentionEfficiencies, 0.90)
        });
    }

    const thresholdSummaries = {};
    [90, 95, 99].forEach((threshold) => {
        const reachedDays = simulations
            .map((simulation) => simulation.thresholds[threshold])
            .filter((day) => Number.isFinite(day));

        thresholdSummaries[threshold] = reachedDays.length
            ? {
                p10: percentile(reachedDays, 0.10),
                median: percentile(reachedDays, 0.50),
                p90: percentile(reachedDays, 0.90),
                reachedFraction: reachedDays.length / simulations.length
            }
            : { p10: null, median: null, p90: null, reachedFraction: 0 };
    });

    return {
        drawCount,
        days: daySummaries,
        thresholds: thresholdSummaries,
        final: daySummaries[daySummaries.length - 1]
    };
}

export function getProtocolDoseForDay(inputs, day) {
    if (inputs.protocolPreset === "load10") {
        return day <= inputs.loadingDays ? 10 : inputs.maintenanceDoseG;
    }
    if (inputs.protocolPreset === "load20") {
        return day <= inputs.loadingDays ? 20 : inputs.maintenanceDoseG;
    }
    if (inputs.protocolPreset === "custom") {
        return day <= inputs.loadingDays ? inputs.customLoadingDoseG : inputs.maintenanceDoseG;
    }
    if (inputs.protocolPreset === "stop_after_load") {
        return day <= inputs.loadingDays ? 20 : 0;
    }
    return inputs.maintenanceDoseG;
}

// Saturable Michaelis-Menten muscle uptake of supplemental creatine.
//
// daily uptake (g active) = Vmax × gapFraction^n × active / (Km + active)
//
//   Vmax (muscleUptakeMaxGPerDay): empty-pool maximum daily active uptake.
//     Anchored to Hultman 1996 day-1 of 20 g/d (~5-6 g retained).
//   Km   (muscleUptakeKmActiveG):  active dose at which retention is half of
//     its empty-pool maximum. Reflects the competition between transporter
//     uptake (Persky/Brazeau 2001 PK review: SLC6A8 in muscle) and renal
//     clearance of unabsorbed plasma creatine (Schedel 1999 reports acute
//     serum Cr peak at ~2.5 h with a slow subsequent decline; the paper does
//     not compute a formal plasma t1/2, so Km here is an engineering fit).
//   n    (poolGapHillExponent):    sharpness of empirical retention drop-off
//     as muscle approaches the modeled cap. Tuned so cumulative 6-day
//     retention of a 20 g/d load is ~17% of CrM ingested (Hultman group 1).
//
// gapFraction = max((cap − pool) / (cap − baseline), 0). This expresses the
// supplementation gap (baseline → cap) rather than absolute muscle saturation,
// matching how loading curves are reported in the literature.
function computeMuscleUptakeG({ previousPoolG, baselinePoolG, poolCapG, activeSupplementG, params }) {
    if (activeSupplementG <= 0 || poolCapG <= baselinePoolG) return 0;
    const Vmax = positiveNumber(params.muscleUptakeMaxGPerDay, DEFAULT_MODEL_INPUTS.muscleUptakeMaxGPerDay);
    const Km = positiveNumber(params.muscleUptakeKmActiveG, DEFAULT_MODEL_INPUTS.muscleUptakeKmActiveG);
    const hill = positiveNumber(params.poolGapHillExponent, DEFAULT_MODEL_INPUTS.poolGapHillExponent);
    const gapFraction = clamp((poolCapG - previousPoolG) / (poolCapG - baselinePoolG), 0, 1);
    const gapTerm = Math.pow(gapFraction, hill);
    const doseTerm = activeSupplementG / (Km + activeSupplementG);
    const intendedG = Vmax * gapTerm * doseTerm;
    // Cap at the actual active dose: the muscle cannot retain more than what
    // arrived in plasma that day.
    return Math.min(intendedG, activeSupplementG);
}

function calculateSteadyStateDose({ poolG, backgroundInputGPerDay, turnoverFractionPerDay }) {
    // Mass balance at steady state: pool × turnover = background + activeSupplement.
    // Required active supplement = max(pool × turnover − background, 0).
    const currentTurnoverG = poolG * turnoverFractionPerDay;
    const steadyStateActiveG = Math.max(currentTurnoverG - backgroundInputGPerDay, 0);
    return {
        steadyStateActiveG,
        steadyStateDoseCrMG: steadyStateActiveG / ACTIVE_CREATINE_FRACTION
    };
}

export function getSolubilityGPerL(temperatureC) {
    const first = SOLUBILITY_ANCHORS[0];
    const last = SOLUBILITY_ANCHORS[SOLUBILITY_ANCHORS.length - 1];
    const temperatureUsedC = clamp(temperatureC, first.temperatureC, last.temperatureC);
    const clamped = temperatureUsedC !== temperatureC;

    for (let i = 0; i < SOLUBILITY_ANCHORS.length - 1; i += 1) {
        const low = SOLUBILITY_ANCHORS[i];
        const high = SOLUBILITY_ANCHORS[i + 1];
        if (temperatureUsedC >= low.temperatureC && temperatureUsedC <= high.temperatureC) {
            return {
                solubilityGPerL: interpolate(low.temperatureC, low.solubilityGPerL, high.temperatureC, high.solubilityGPerL, temperatureUsedC),
                temperatureUsedC,
                clamped
            };
        }
    }

    return {
        solubilityGPerL: last.solubilityGPerL,
        temperatureUsedC,
        clamped
    };
}

export function getDegradationRate(pH, temperatureC, q10 = 2) {
    const fractionLost3Day = interpolatePhLoss(pH);
    const kPerDay25C = -Math.log(Math.max(1e-9, 1 - fractionLost3Day)) / 3;
    const kPerDayAdjusted = kPerDay25C * Math.pow(q10, (temperatureC - 25) / 10);
    const hasReportedPhSupport = pH >= 3.5 && pH <= 5.5;
    const isNeutralRange = pH >= 6.5 && pH <= 7.5;
    let confidence;
    if (hasReportedPhSupport && Math.abs(temperatureC - 25) < 0.001) {
        confidence = "anchored/interpolated";
    } else if (hasReportedPhSupport) {
        confidence = "temperature extrapolated from reported pH anchors";
    } else if (isNeutralRange && Math.abs(temperatureC - 25) < 0.001) {
        confidence = "low-loss qualitative band for near-neutral pH";
    } else if (isNeutralRange) {
        confidence = "near-neutral qualitative band, temperature extrapolated";
    } else {
        confidence = "qualitative pH extrapolation";
    }

    return {
        fractionLost3Day,
        kPerDay25C,
        kPerDayAdjusted,
        confidence
    };
}

function interpolatePhLoss(pH) {
    const anchors = REPORTED_PH_DEGRADATION_ANCHORS;
    if (pH <= anchors[0].pH) return anchors[0].fractionLost3Day;

    for (let i = 0; i < anchors.length - 1; i += 1) {
        const low = anchors[i];
        const high = anchors[i + 1];
        if (pH >= low.pH && pH <= high.pH) {
            return interpolate(low.pH, low.fractionLost3Day, high.pH, high.fractionLost3Day, pH);
        }
    }

    if (pH >= QUALITATIVE_PH_DEGRADATION_POINTS[QUALITATIVE_PH_DEGRADATION_POINTS.length - 1].pH) {
        return NEUTRAL_QUALITATIVE_LOSS_3_DAY;
    }

    for (let i = 0; i < QUALITATIVE_PH_DEGRADATION_POINTS.length - 1; i += 1) {
        const low = QUALITATIVE_PH_DEGRADATION_POINTS[i];
        const high = QUALITATIVE_PH_DEGRADATION_POINTS[i + 1];
        if (pH >= low.pH && pH <= high.pH) {
            return interpolate(low.pH, low.fractionLost3Day, high.pH, high.fractionLost3Day, pH);
        }
    }

    return NEUTRAL_QUALITATIVE_LOSS_3_DAY;
}

function resolvePh(phPreset, customPh) {
    const preset = String(phPreset || "neutral");
    if (preset === "mild") return 5.5;
    if (preset === "acidic") return 4.5;
    if (preset === "very_acidic") return 3.5;
    if (preset === "custom") return clamp(numberOrDefault(customPh, 7), 3.5, 8);
    return 7.0;
}

function buildThresholdSummary(days, thresholds) {
    const summary = {};
    thresholds.forEach((threshold) => {
        const match = days.find((day) => day.percentSaturation >= threshold);
        summary[threshold] = match ? match.day : null;
    });
    return summary;
}

function buildWarnings(inputs, mix, storage, accumulation) {
    const warnings = [];
    if (mix.isTemperatureClamped) {
        warnings.push(`Mix temperature was clamped to ${formatFixed(mix.temperatureUsedC, 1)} deg C for solubility interpolation.`);
    }
    if (storage.mixAtStorageTemperature.isTemperatureClamped) {
        warnings.push(`Storage temperature was clamped to ${formatFixed(storage.mixAtStorageTemperature.temperatureUsedC, 1)} deg C for solubility interpolation.`);
    }
    if (mix.undissolvedG > 0 && inputs.consumeFullSuspension) {
        warnings.push("Undissolved powder is shown as grit/suspension, not automatically wasted dose.");
    }
    if (storage.degradationApplies && storage.undissolvedRemainingG > 0) {
        warnings.push("Suspension storage uses a dissolved-fraction approximation; undissolved powder is not modeled with coupled dissolution/degradation.");
    }
    if (storage.degradationApplies && !storage.confidence.includes("anchored")) {
        warnings.push(`Storage degradation is ${storage.confidence}.`);
    }
    if (storage.degradationApplies && inputs.storageDays > 3) {
        warnings.push("Storage loss beyond the 3-day pH anchors is an extrapolated first-order estimate.");
    }
    if (storage.degradationApplies && Math.abs(inputs.pH - 7) > 0.25) {
        warnings.push("Solubility remains a temperature-only plain-water estimate. More acidic liquids can increase creatine solubility, but pH-adjusted dissolved mass is not modeled.");
    }
    if (storage.degradationApplies && inputs.pH <= 3.5) {
        warnings.push("pH 3.5 is the lowest reported loss anchor in this model; stronger acids are outside the degradation fit.");
    }
    if (inputs.storageMode === "add_later") {
        warnings.push("Fridge bottle/add-later mode stores water first, so no creatine degradation is applied before mixing.");
    }
    if (inputs.bodyPoolBasis === "body_comp" && inputs.skeletalMuscleMassKg <= 0) {
        warnings.push("Body-pool baseline uses an estimated skeletal muscle mass; direct skeletal muscle mass will narrow that assumption.");
        warnings.push("FFM-to-SMM and muscle creatine concentration vary by sex, age, diet, and training status; the body-composition baseline is a rough estimate.");
    }
    if (inputs.bodyPoolBasis === "manual") {
        warnings.push("Manual baseline pool overrides the body-composition estimate.");
    }
    if (accumulation?.days?.some((day) => day.plotSaturationPercent > 100.5)) {
        warnings.push("The accumulation chart can exceed 100% as dose pressure. Values above 100% flag likely waste, not extra creatine storage beyond the modeled pool cap.");
    }
    if (accumulation && inputs.calibrateBackground !== false) {
        warnings.push(`Endogenous synthesis is calibrated to ${formatFixed(accumulation.endogenousGPerDay, 2)} g/day so dietary intake plus synthesis equals baseline turnover (${formatFixed(accumulation.baselineTurnoverG, 2)} g/day). Toggle calibration off to use the literature ${formatFixed(accumulation.literatureEndogenousGPerDay, 2)} g/day value and let the pool drift toward ${formatFixed(accumulation.equilibriumPoolG, 1)} g.`);
    } else if (accumulation) {
        warnings.push(`Background calibration is off: diet + endogenous = ${formatFixed(accumulation.backgroundInputGPerDay, 2)} g/day implies an equilibrium pool of ${formatFixed(accumulation.equilibriumPoolG, 1)} g. The pool drifts toward that attractor when supplementation is below steady-state need.`);
    }
    if (accumulation && Math.abs(accumulation.backgroundDeficitGPerDay) > 0.05 && inputs.calibrateBackground === false) {
        warnings.push(`Diet + endogenous (${formatFixed(accumulation.backgroundInputGPerDay, 2)} g/day) does not match baseline turnover (${formatFixed(accumulation.baselineTurnoverG, 2)} g/day). The pool will trend away from the entered baseline. Pick a diet pattern, edit endogenous synthesis, or re-enable calibration.`);
    }
    warnings.push("The baseline already includes regular diet and creatine made by the body; supplementation flows on top of that background, not as a replacement.");
    warnings.push(`Baseline body-pool saturation is modeled at ${formatFixed(inputs.baselineSaturationFraction * 100, 1)}% with a 60-80% literature-informed uncertainty range.`);
    warnings.push("Brain tCr is estimated from a regional MRS study and scaled to brain mass. It is not a measured whole-brain value.");
    warnings.push("Brain tCr reference gain uses a 20 g/day for 4 weeks study and does not change when you edit the protocol.");
    warnings.push("Monte Carlo bands use a seeded xorshift32 RNG. They show visual uncertainty around input ranges and should not be cited as statistical inference.");
    if (inputs.protocolPreset === "stop_after_load" || inputs.maintenanceDoseG === 0) {
        warnings.push("Modeled post-load washout uses linear 1.7%/day turnover, giving an excess-pool half-life of about 41 days. Hultman 1996 and Vandenberghe 1997 observed return to baseline by roughly 28 days, so the model washes out more slowly than that data suggests. Raising turnoverFractionPerDay narrows the gap but inflates baseline creatinine output.");
    }
    warnings.push("Responder spread is irreducible: Harris 1992 and Greenhaff 1994 found per-person muscle TCr rise ranging from ~10% (low responders) to ~30% (high responders) on identical protocols. The Monte Carlo band samples that spread visually, but a single individual can still fall outside the envelope. Sex, age, fiber-type composition, training status, and insulin co-ingestion are not modeled.");
    warnings.push("Cross-study harmonization caveat: this tool stitches together Cooper's pool size, NCBI's turnover constant, Hultman's loading curve, Harris/Greenhaff's responder spread, Burke's vegetarian baseline, and Walker's creatinine ratio. Each anchor comes from a different cohort, decade, and measurement method, and they were never measured on the same individual. The Monte Carlo band is the model's way of absorbing that heterogeneity (sex, activity level, fiber type, training status, diet variability). It is an illustrative envelope around inputs we know vary, not a statistical prediction interval, and your personal trajectory can sit outside it.");
    return warnings;
}

function convertVolumeToL(value, unit) {
    const normalized = String(unit || "L");
    if (normalized === "mL") return value / 1000;
    if (normalized === "fl_oz") return value * 0.0295735295625;
    return value;
}

function convertTemperatureToC(value, unit) {
    return String(unit || "C") === "F" ? (value - 32) * (5 / 9) : value;
}

function convertTimeToDays(value, unit) {
    return String(unit || "hours") === "days" ? value : value / 24;
}

function normalizeFraction(value, fallback) {
    const numeric = numberOrDefault(value, fallback);
    return numeric > 1 ? numeric / 100 : numeric;
}

function positiveNumber(value, fallback) {
    return Math.max(numberOrDefault(value, fallback), 1e-9);
}

function nonNegativeNumber(value, fallback) {
    return Math.max(numberOrDefault(value, fallback), 0);
}

function numberOrDefault(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function interpolate(x1, y1, x2, y2, x) {
    if (x2 === x1) return y1;
    return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
}

function percentile(values, p) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (sorted.length - 1) * p;
    const low = Math.floor(index);
    const high = Math.ceil(index);
    if (low === high) return sorted[low];
    return interpolate(low, sorted[low], high, sorted[high], index);
}

function sampleBaselinePoolG(inputs, rng) {
    if (inputs.bodyPoolBasis === "body_comp" && inputs.bodyComposition) {
        const directSmm = inputs.skeletalMuscleMassKg > 0;
        const directFfm = inputs.fatFreeMassKg > 0;
        const smmUncertainty = directSmm ? 0.05 : directFfm ? 0.08 : 0.12;
        const centerSmm = inputs.bodyComposition.skeletalMuscleMassKg;
        const sampledSmm = triangular(
            rng,
            Math.max(5, centerSmm * (1 - smmUncertainty)),
            centerSmm,
            centerSmm * (1 + smmUncertainty)
        );
        const dietaryFactor = inputs.bodyComposition.dietaryMuscleFactor ?? 1.0;
        const muscleCreatineCenter = inputs.bodyComposition.muscleCreatineGPerKg;
        const muscleCreatineMin = Math.min(BODY_COMPOSITION_DEFAULTS.muscleCreatineGPerKgLow * dietaryFactor, muscleCreatineCenter);
        const muscleCreatineMax = Math.max(BODY_COMPOSITION_DEFAULTS.muscleCreatineGPerKgHigh * dietaryFactor, muscleCreatineCenter);
        const muscleShareMin = Math.min(BODY_COMPOSITION_DEFAULTS.skeletalMuscleCreatineShareLow, inputs.skeletalMuscleCreatineShare);
        const muscleShareMax = Math.max(BODY_COMPOSITION_DEFAULTS.skeletalMuscleCreatineShareHigh, inputs.skeletalMuscleCreatineShare);
        const sampledMuscleCreatine = triangular(
            rng,
            muscleCreatineMin,
            muscleCreatineCenter,
            muscleCreatineMax
        );
        const sampledMuscleShare = triangular(
            rng,
            muscleShareMin,
            inputs.skeletalMuscleCreatineShare,
            muscleShareMax
        );

        return (sampledSmm * sampledMuscleCreatine) / sampledMuscleShare;
    }

    const baselineMin = Math.max(60, inputs.baselinePoolG - 10);
    const baselineMax = inputs.baselinePoolG + 20;
    return triangular(rng, baselineMin, inputs.baselinePoolG, baselineMax);
}

function triangular(rng, min, mode, max) {
    if (max <= min) return mode;
    const u = rng();
    const c = (mode - min) / (max - min);
    if (u < c) {
        return min + Math.sqrt(u * (max - min) * (mode - min));
    }
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}

function createSeededRandom(seed) {
    // xorshift32: better distribution than the previous LCG for visual envelopes
    // while staying deterministic for the seeded smoke tests. Still not suitable
    // for statistical inference; see source-map note.
    let state = Math.abs(Math.floor(seed)) >>> 0;
    if (state === 0) state = 2463534242;
    return () => {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 4294967296;
    };
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function formatFixed(value, decimals) {
    return Number.isFinite(value) ? value.toFixed(decimals) : "n/a";
}
