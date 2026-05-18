export const ACTIVE_CREATINE_FRACTION = 0.879;
export const CREATINE_MOLAR_MASS_G_PER_MOL = 131.13;
export const CREATININE_FROM_CREATINE_FRACTION = 113.12 / 131.13;

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

export const BRAIN_POOL_DEFAULTS = Object.freeze({
    brainMassKg: 1.4,
    brainCreatineMm: 6.9,
    brainResponseLowPercent: 3.0,
    brainResponseTypicalPercent: 8.7,
    brainResponseHighPercent: 14.6
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
    q10: 2,
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
    turnoverFractionPerDay: 0.017,
    protocolPreset: "maintenance5",
    customLoadingDoseG: 10,
    loadingDays: 6,
    maintenanceDoseG: 5,
    simulationDays: 60,
    baselineSaturationFraction: 0.75,
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

    return {
        inputs,
        mix,
        storage,
        accumulation,
        monteCarlo,
        warnings: buildWarnings(inputs, mix, storage, accumulation)
    };
}

export function normalizeInputs(rawInputs = {}) {
    const merged = { ...DEFAULT_MODEL_INPUTS, ...rawInputs };
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
    const muscleCreatineGPerKg = clamp(numberOrDefault(params.muscleCreatineGPerKg, BODY_COMPOSITION_DEFAULTS.muscleCreatineGPerKg), 3, 7);
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
        muscleCreatineGPerKg,
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
    const dietaryGPerDay = params.dietaryGPerDay ?? DIETARY_INPUTS_G_PER_DAY[params.dietaryPattern] ?? DIETARY_INPUTS_G_PER_DAY.omnivore;
    const baselineTurnoverG = baselinePoolG * params.turnoverFractionPerDay;
    const backgroundInputGPerDay = params.endogenousGPerDay + dietaryGPerDay;
    let currentPoolG = baselinePoolG;
    const initialSteadyState = calculateSteadyStateDose({
        poolG: currentPoolG,
        baselineTurnoverG,
        turnoverFractionPerDay: params.turnoverFractionPerDay
    });
    const days = [{
        day: 0,
        doseCrMG: 0,
        retainedSupplementG: 0,
        backgroundInputGPerDay,
        baselineTurnoverG,
        excessTurnoverG: 0,
        dailyLossG: currentPoolG * params.turnoverFractionPerDay,
        steadyStateActiveG: initialSteadyState.steadyStateActiveG,
        steadyStateDoseCrMG: initialSteadyState.steadyStateDoseCrMG,
        excessDoseCrMG: 0,
        wastePressureCrMG: 0,
        poolG: currentPoolG,
        percentSaturation: (currentPoolG / poolCapG) * 100,
        plotSaturationPercent: (currentPoolG / poolCapG) * 100,
        supplementGapFilledPercent: 0
    }];

    for (let day = 1; day <= params.simulationDays; day += 1) {
        const previousPoolG = currentPoolG;
        const previousSteadyState = calculateSteadyStateDose({
            poolG: previousPoolG,
            baselineTurnoverG,
            turnoverFractionPerDay: params.turnoverFractionPerDay
        });
        const doseCrMG = getProtocolDoseForDay(params, day);
        const activeSupplementG = doseCrMG * ACTIVE_CREATINE_FRACTION;
        const gapG = Math.max(poolCapG - previousPoolG, 0);
        const normalizedGap = clamp(gapG / capGapG, 0, 1);
        const doseRetentionScale = params.doseRetentionHalfActiveG / (params.doseRetentionHalfActiveG + activeSupplementG);
        const retentionFraction = clamp(
            params.retentionMax * Math.pow(normalizedGap, params.retentionShape) * doseRetentionScale,
            0,
            1
        );
        const retainedSupplementG = activeSupplementG * retentionFraction;
        const dailyLossG = previousPoolG * params.turnoverFractionPerDay;
        const excessTurnoverG = Math.max(dailyLossG - baselineTurnoverG, 0);
        const excessAboveSteadyActiveG = Math.max(activeSupplementG - previousSteadyState.steadyStateActiveG, 0);
        const saturationPressurePercent = ((previousPoolG + excessAboveSteadyActiveG) / poolCapG) * 100;
        const wastePressureActiveG = Math.max(previousPoolG + excessAboveSteadyActiveG - poolCapG, 0);
        const nextPoolG = clamp(
            previousPoolG + retainedSupplementG - excessTurnoverG,
            baselinePoolG,
            poolCapG
        );
        currentPoolG = nextPoolG;
        const steadyState = calculateSteadyStateDose({
            poolG: currentPoolG,
            baselineTurnoverG,
            turnoverFractionPerDay: params.turnoverFractionPerDay
        });
        const percentSaturation = clamp((currentPoolG / poolCapG) * 100, 0, 100);

        days.push({
            day,
            doseCrMG,
            retainedSupplementG,
            backgroundInputGPerDay,
            baselineTurnoverG,
            excessTurnoverG,
            dailyLossG,
            steadyStateActiveG: steadyState.steadyStateActiveG,
            steadyStateDoseCrMG: steadyState.steadyStateDoseCrMG,
            excessDoseCrMG: Math.max(doseCrMG - previousSteadyState.steadyStateDoseCrMG, 0),
            wastePressureCrMG: wastePressureActiveG / ACTIVE_CREATINE_FRACTION,
            poolG: currentPoolG,
            percentSaturation,
            plotSaturationPercent: Math.max(percentSaturation, saturationPressurePercent),
            supplementGapFilledPercent: clamp(((currentPoolG - baselinePoolG) / capGapG) * 100, 0, 100)
        });
    }

    const thresholds = buildThresholdSummary(days, [90, 95, 99]);

    return {
        baselinePoolG,
        poolCapG,
        baselineSaturationFraction,
        dietaryGPerDay,
        backgroundInputGPerDay,
        baselineTurnoverG,
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
        const sampled = {
            baselinePoolG: sampleBaselinePoolG(inputs, rng),
            baselineSaturationFraction: triangular(rng, BASELINE_SATURATION_LOW, inputs.baselineSaturationFraction, BASELINE_SATURATION_HIGH),
            turnoverFractionPerDay: triangular(rng, Math.max(0.005, inputs.turnoverFractionPerDay - 0.003), inputs.turnoverFractionPerDay, inputs.turnoverFractionPerDay + 0.003),
            endogenousGPerDay: triangular(rng, Math.max(0, inputs.endogenousGPerDay - 0.3), inputs.endogenousGPerDay, inputs.endogenousGPerDay + 0.3),
            retentionMax: triangular(rng, Math.max(0.05, inputs.retentionMax - 0.08), inputs.retentionMax, Math.min(0.95, inputs.retentionMax + 0.08))
        };

        const dietaryCenter = DIETARY_INPUTS_G_PER_DAY[inputs.dietaryPattern] ?? DIETARY_INPUTS_G_PER_DAY.omnivore;
        sampled.dietaryGPerDay = triangular(rng, Math.max(0, dietaryCenter - 0.5), dietaryCenter, dietaryCenter + 0.5);
        simulations.push(simulateAccumulation(inputs, sampled));
    }

    const daySummaries = [];
    for (let day = 0; day <= inputs.simulationDays; day += 1) {
        const pools = simulations.map((simulation) => simulation.days[day].poolG);
        const saturations = simulations.map((simulation) => simulation.days[day].percentSaturation);
        const saturationPressures = simulations.map((simulation) => simulation.days[day].plotSaturationPercent);
        const steadyDoses = simulations.map((simulation) => simulation.days[day].steadyStateDoseCrMG);
        const wastePressures = simulations.map((simulation) => simulation.days[day].wastePressureCrMG);
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
            wastePressureP90: percentile(wastePressures, 0.90)
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

function calculateSteadyStateDose({ poolG, baselineTurnoverG, turnoverFractionPerDay }) {
    const currentTurnoverG = poolG * turnoverFractionPerDay;
    const steadyStateActiveG = Math.max(currentTurnoverG - baselineTurnoverG, 0);
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
    const confidence = hasReportedPhSupport && Math.abs(temperatureC - 25) < 0.001
        ? "anchored/interpolated"
        : hasReportedPhSupport
            ? "temperature extrapolated from reported pH anchors"
            : "qualitative pH extrapolation";

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
    warnings.push("The baseline already includes regular diet and creatine made by the body; those inputs are not added again as extra loading.");
    warnings.push(`Baseline body-pool saturation is modeled at ${formatFixed(inputs.baselineSaturationFraction * 100, 1)}% with a 60-80% literature-informed uncertainty range.`);
    warnings.push("Brain tCr is estimated from a regional MRS study and scaled to brain mass. It is not a measured whole-brain value.");
    warnings.push("Brain tCr reference gain uses a 20 g/day for 4 weeks study and does not change when you edit the protocol.");
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
        const muscleCreatineMin = Math.min(BODY_COMPOSITION_DEFAULTS.muscleCreatineGPerKgLow, inputs.muscleCreatineGPerKg);
        const muscleCreatineMax = Math.max(BODY_COMPOSITION_DEFAULTS.muscleCreatineGPerKgHigh, inputs.muscleCreatineGPerKg);
        const muscleShareMin = Math.min(BODY_COMPOSITION_DEFAULTS.skeletalMuscleCreatineShareLow, inputs.skeletalMuscleCreatineShare);
        const muscleShareMax = Math.max(BODY_COMPOSITION_DEFAULTS.skeletalMuscleCreatineShareHigh, inputs.skeletalMuscleCreatineShare);
        const sampledMuscleCreatine = triangular(
            rng,
            muscleCreatineMin,
            inputs.muscleCreatineGPerKg,
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
    let state = Math.abs(Math.floor(seed)) || 1;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function formatFixed(value, decimals) {
    return Number.isFinite(value) ? value.toFixed(decimals) : "n/a";
}
