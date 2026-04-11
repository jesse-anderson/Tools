import { SPECIES_ORDER, SPECIES_PRESETS, STARTER_PRESETS } from "./yogurt-presets.js";
import {
    buildStorageBackboneSeries,
    evaluateStorageCfuRetention,
    evaluateStorageBackboneDelta,
    evaluateTextureProxy,
    getIncubationResidualSummary,
    interpolateIncubationBackbone
} from "./yogurt-fit-data.js";

const MILK_DENSITY_G_PER_ML = 1.03;
const STARTER_DENSITY_G_PER_ML = 1.03;
export const ASSUMED_YOGURT_DENSITY_G_PER_ML = MILK_DENSITY_G_PER_ML;

export const PH_MODEL_COEFFICIENTS = Object.freeze({
    referenceTargetPh: 4.6,
    standardInitialPh: 6.65,
    hydrolyzedInitialPh: 6.58,
    temperatureRate: Object.freeze({
        base: 0.78,
        amplitude: 0.28,
        referenceC: 42,
        sigmaC: 4.4,
        min: 0.68,
        max: 1.06
    }),
    temperatureLag: Object.freeze({
        slopeHrPerC: 0.18,
        referenceC: 42,
        minHr: -0.85,
        maxHr: 2.4
    }),
    temperatureTerminal: Object.freeze({
        slopePhPerC: 0.014,
        referenceC: 42,
        minPh: -0.08,
        maxPh: 0.2
    }),
    hydrolyzedSubstrate: Object.freeze({
        terminalShiftPh: 0.05,
        rateBonusPhPerHr: 0.025,
        lagShiftHr: -0.1
    }),
    inoculumLift: Object.freeze({
        centerLog10: 5.35,
        spanLog10: 2.1,
        min: -0.28,
        max: 0.32,
        terminalWeight: -0.05,
        rateWeight: 0.035,
        lagWeightHr: -0.35
    }),
    terminalPhClamp: Object.freeze({
        min: 4.05,
        headroomBelowInitial: 0.03
    }),
    amplitudeMin: 0.08,
    maxAcidificationRateClamp: Object.freeze({
        min: 0.01,
        max: 1.2
    }),
    lagClampHr: Object.freeze({
        min: 0.15,
        max: 8
    })
});

export const STORAGE_PHASE_COEFFICIENTS = Object.freeze({
    dayClampMax: 50,
    endpointCarryover: Object.freeze({
        initialResidualWeight: 1,
        residualWeightAfterTransition: 0.35,
        transitionDays: 14
    }),
    fermentationEligibility: Object.freeze({
        fullyAcidifiedPh: 5,
        upperAcidifiedPh: 5.25,
        viableLog10Floor: 5.5,
        viableLog10Span: 1.5
    })
});

const DEFAULT_INTERNAL_MODEL_ADJUSTMENTS = Object.freeze({
    reserveBias: 0
});

const UNCERTAINTY_SCENARIOS = {
    low: {
        starterFactor: 0.45,
        muFactor: 0.94,
        lMaxOffset: -0.22,
        reserveBias: -0.08
    },
    high: {
        starterFactor: 1.65,
        muFactor: 1.05,
        lMaxOffset: 0.18,
        reserveBias: 0.08
    }
};

const SUBSTRATE_PRESETS = {
    standardMilk: {
        key: "standardMilk",
        label: "Standard milk",
        reserveMultiplier: 0.92,
        speciesBoost: { st: 1, lb: 1 },
        speciesHeadroomLog: { st: 0, lb: 0 }
    },
    lactoseHydrolyzed: {
        key: "lactoseHydrolyzed",
        label: "Lactose-hydrolyzed milk",
        reserveMultiplier: 1.16,
        speciesBoost: { st: 1.01, lb: 1.12 },
        speciesHeadroomLog: { st: 0.04, lb: 0.18 }
    }
};

const PH_REFERENCE_TARGET = PH_MODEL_COEFFICIENTS.referenceTargetPh;

export function runYogurtEstimate(rawInput, internalAdjustments = DEFAULT_INTERNAL_MODEL_ADJUSTMENTS) {
    const warnings = [];
    const modelAdjustments = normalizeInternalModelAdjustments(internalAdjustments);

    const milkG = toMilkGrams(rawInput.milkAmount, rawInput.milkUnit);
    const starterG = toStarterGrams(rawInput.starterAmount, rawInput.starterUnit);
    const extraMassG = clampNonNegative(rawInput.extraMassG);
    const batchMassG = milkG + starterG + extraMassG;
    const incubationHours = clampNonNegative(rawInput.incubationHours);
    const storageDays = clampNonNegative(rawInput.storageDays);
    const temperatureC = Number(rawInput.temperatureC);
    const starterPreset = STARTER_PRESETS[rawInput.starterMode] || STARTER_PRESETS.storeYogurt;
    const starterCfuBySpecies = buildStarterCfuBySpecies(rawInput, starterPreset);
    const cocultureProfile = buildCocultureProfile(starterCfuBySpecies);
    const speciesConfig = buildSpeciesConfig(rawInput, cocultureProfile);
    const substrateConfig = buildSubstrateConfig(rawInput, milkG, extraMassG, cocultureProfile, modelAdjustments.reserveBias);
    const phConfig = buildPhConfig(temperatureC, cocultureProfile, substrateConfig, starterG, batchMassG, starterCfuBySpecies);

    if (!Number.isFinite(batchMassG) || batchMassG <= 0) {
        throw new Error("Batch mass must be greater than zero.");
    }
    if (!Number.isFinite(temperatureC)) {
        throw new Error("Temperature must be a valid number.");
    }

    if (milkG <= 0) warnings.push("Milk amount should be greater than zero.");
    if (starterG <= 0) warnings.push("Starter amount should be greater than zero.");
    if (incubationHours > 24) warnings.push("Incubation time is quite long for yogurt; endpoint estimates become less reliable.");
    if (storageDays > 0) {
        warnings.push("Storage/post-acidification mode applies a hybrid absolute/delta refrigerated pH layer and a separate literature-anchored CFU retention layer near 4 C. The pH layer is suppressed when the incubation endpoint is not a viable acidified yogurt state. It is not a user-specific fridge temperature model.");
    }
    if (storageDays > 50) {
        warnings.push("Storage day input extends beyond the current published storage range. Storage pH and CFU retention are being clamped to the latest available day.");
    }
    if (substrateConfig.key === "lactoseHydrolyzed") {
        warnings.push("Lactose-hydrolyzed mode is still a proxy based on literature directionality, not a full carbohydrate mass balance.");
    }
    if (phConfig.literatureBackbone.isClampedLow || phConfig.literatureBackbone.isClampedHigh) {
        warnings.push("Starter ratio is outside the direct published incubation-fit range (about 1:2 to 100:1 St:Lb). pH kinetics are being edge-clamped to the nearest literature anchor.");
    }
    if (cocultureProfile.extremeRatio) {
        warnings.push("Starter split is highly skewed; classical coculture estimates become less reliable at extreme ratios.");
    }
    if (temperatureC >= 50) {
        warnings.push("Thermal kill safeguard is active. Above about 50 C, these starter cultures should be treated as heat-injured rather than actively fermenting.");
    }
    if (temperatureC >= 72) {
        warnings.push("This temperature is in milk heat-treatment territory. Final viable counts should collapse rather than resemble yogurt fermentation.");
    }

    const series = buildTimeSeries({
        durationHr: incubationHours,
        temperatureC,
        batchMassG,
        starterG,
        starterCfuBySpecies,
        speciesConfig,
        substrateConfig,
        phConfig
    });

    const firstPoint = series[0];
    const lastPoint = series[series.length - 1];
    const speciesResults = SPECIES_ORDER.map((speciesKey) => {
        const config = speciesConfig[speciesKey];
        const initialCfuPerG = firstPoint.species[speciesKey];
        const finalCfuPerG = lastPoint.species[speciesKey];
        return {
            key: speciesKey,
            label: SPECIES_PRESETS[speciesKey].label,
            color: SPECIES_PRESETS[speciesKey].color,
            initialCfuPerG,
            finalCfuPerG,
            finalLog10: safeLog10(finalCfuPerG),
            config
        };
    });

    const initialTotal = firstPoint.totalCfuPerG;
    const finalTotal = lastPoint.totalCfuPerG;
    const finalPh = lastPoint.modeledPh;
    const finalIncubationSpecies = Object.fromEntries(
        SPECIES_ORDER.map((speciesKey) => [speciesKey, lastPoint.species[speciesKey]])
    );
    const timeToPh46Hr = findTimeToPh(series, PH_REFERENCE_TARGET);
    const storagePhase = buildStoragePhase({
        storageDays,
        finalPh,
        ratioStToLb: cocultureProfile.ratioStToLb,
        finalSpecies: finalIncubationSpecies
    });
    const textureProxy = evaluateTextureProxy({
        finalPh,
        storageFinalPh: storagePhase.finalPh,
        storageDeltaPh: storagePhase.deltaPh,
        storageDays,
        incubationHours,
        timeToPh46Hr,
        milkG,
        extraMassG,
        ratioStToLb: cocultureProfile.ratioStToLb
    });
    const dominantSpecies = speciesResults.reduce(
        (best, item) => (item.finalCfuPerG > best.finalCfuPerG ? item : best),
        speciesResults[0]
    );
    const storedSpeciesResults = SPECIES_ORDER.map((speciesKey) => {
        const species = storagePhase.finalSpecies?.[speciesKey] ?? finalIncubationSpecies[speciesKey] ?? 0;
        return {
            key: speciesKey,
            label: SPECIES_PRESETS[speciesKey].label,
            color: SPECIES_PRESETS[speciesKey].color,
            finalCfuPerG: species,
            finalLog10: safeLog10(species)
        };
    });
    const storedTotal = storagePhase.finalTotalCfuPerG ?? finalTotal;
    const storedTotalLog10 = safeLog10(storedTotal);
    const storageLogDelta = storedTotalLog10 - safeLog10(finalTotal);
    const displayedDominantSpecies = storedSpeciesResults.reduce(
        (best, item) => (item.finalCfuPerG > best.finalCfuPerG ? item : best),
        storedSpeciesResults[0]
    );

    speciesResults.forEach((item) => {
        if (temperatureC < item.config.validTempMinC || temperatureC > item.config.validTempMaxC) {
            warnings.push(`${item.label} is being evaluated outside its supported temperature band (${item.config.validTempMinC} to ${item.config.validTempMaxC} C).`);
        }
    });

    const starterTotalCfuPerG = sum(Object.values(starterCfuBySpecies));
    if (starterTotalCfuPerG < 1e4 || starterTotalCfuPerG > 1e12) {
        warnings.push("Starter CFU/g is outside a typical yogurt-culture range.");
    }
    if (initialTotal < 1) {
        warnings.push("Initial inoculum is below 1 CFU/g. Check starter concentration and units.");
    }
    if (incubationHours >= 6 && finalPh > 4.8) {
        warnings.push("Modeled endpoint pH stays above 4.8; the batch may be under-acidified for finished yogurt.");
    }
    if (finalPh < 4) {
        warnings.push("Modeled endpoint pH falls below 4.0; this implies an aggressively acidified yogurt and lower late-stage viability.");
    }

    return {
        batchMassG,
        milkG,
        starterG,
        extraMassG,
        incubationHours,
        temperatureC,
        starterMode: starterPreset.key,
        starterPresetLabel: starterPreset.label,
        starterSplit: cocultureProfile.split,
        ratioProfile: cocultureProfile,
        substrateMode: substrateConfig.key,
        substrateLabel: substrateConfig.label,
        starterCfuBySpecies,
        initialTotal,
        finalTotal,
        initialTotalLog10: safeLog10(initialTotal),
        finalTotalLog10: safeLog10(finalTotal),
        initialPh: firstPoint.modeledPh,
        finalPh,
        storageDays,
        storedTotal,
        storedTotalLog10,
        storageLogDelta,
        storageFinalPh: storagePhase.finalPh,
        storageDeltaPh: storagePhase.deltaPh,
        storageSeries: storagePhase.series,
        textureProxy,
        storedSpeciesResults: storedSpeciesResults.map((item) => ({
            ...item,
            endpointShare: storedTotal > 0 ? item.finalCfuPerG / storedTotal : 0
        })),
        phReferenceTarget: PH_REFERENCE_TARGET,
        timeToPh46Hr,
        dominantSpecies,
        displayedDominantSpecies,
        speciesResults: speciesResults.map((item) => ({
            ...item,
            endpointShare: finalTotal > 0 ? item.finalCfuPerG / finalTotal : 0
        })),
        series,
        warnings: dedupeWarnings(warnings),
        assumptions: {
            milkDensityGPerML: MILK_DENSITY_G_PER_ML,
            starterDensityGPerML: STARTER_DENSITY_G_PER_ML,
            substrateMode: substrateConfig.label,
            cocultureProfile,
            pHModel: {
                modelName: "Modified Gompertz",
                initialPh: phConfig.initialPh,
                terminalPh: phConfig.terminalPh,
                amplitude: phConfig.amplitude,
                lagHr: phConfig.lagHr,
                maxAcidificationRate: phConfig.maxAcidificationRate,
                referenceTargetPh: PH_REFERENCE_TARGET,
                derivation: {
                    split: phConfig.split,
                    ratioLog: phConfig.ratioLog,
                    ratioStToLb: phConfig.ratioStToLb,
                    substrateMode: phConfig.substrateMode,
                    temperatureRateFactor: phConfig.temperatureRateFactor,
                    temperatureLagOffsetHr: phConfig.temperatureLagOffsetHr,
                    temperatureTerminalShift: phConfig.temperatureTerminalShift,
                    initialTotalCfuPerG: phConfig.initialTotalCfuPerG,
                    inoculumLift: phConfig.inoculumLift,
                    thermalFactor: phConfig.thermalFactor,
                    hydroShift: phConfig.hydroShift,
                    hydroRateBonus: phConfig.hydroRateBonus,
                    hydroLagShift: phConfig.hydroLagShift,
                    unconstrainedTerminalPh: phConfig.unconstrainedTerminalPh,
                    literatureBackbone: phConfig.literatureBackbone,
                    fitResiduals: phConfig.fitResiduals
                }
            },
            storageModel: {
                enabled: storageDays > 0,
                storageDays,
                finalPh,
                finalTotal,
                storedTotal,
                storageLogDelta,
                storageFinalPh: storagePhase.finalPh,
                deltaPh: storagePhase.deltaPh,
                backbone: storagePhase.backbone,
                finalSpecies: storagePhase.finalSpecies,
                cfuModel: storagePhase.cfuModel
            },
            textureModel: textureProxy
                ? {
                    modelName: textureProxy.modelName,
                    setScore: textureProxy.setScore,
                    setClass: textureProxy.setClass,
                    firmnessG: textureProxy.firmnessG,
                    firmnessRangeG: textureProxy.firmnessRangeG,
                    spontaneousWheySeparationPercent: textureProxy.spontaneousWheySeparationPercent,
                    wheySeparationRangePercent: textureProxy.wheySeparationRangePercent,
                    syneresisRisk: textureProxy.syneresisRisk,
                    yieldStressPa: textureProxy.yieldStressPa,
                    yieldStressRangePa: textureProxy.yieldStressRangePa,
                    drivers: textureProxy.drivers,
                    sources: textureProxy.sources,
                    scopeNote: textureProxy.scopeNote
                }
                : null
            }
    };
}

export function buildCsv(estimate) {
    const scopeNote = "Exploratory estimate only; not food safety advice; no warranty or liability; verify independently.";
    const lines = [
        ["phase", "time_hr", "storage_day", "total_cfu_per_g", "total_log10_cfu_per_g", "st_cfu_per_g", "lb_cfu_per_g", "modeled_ph", "substrate_remaining_pct", "driver_multiplier_pct", "acidification_progress_pct", "storage_delta_ph", "storage_reference_delta_ph", "st_storage_delta_log10", "lb_storage_delta_log10", "model_scope_note"]
    ];

    estimate.series.forEach((point) => {
        lines.push([
            "incubation",
            point.timeHr.toFixed(3),
            "",
            point.totalCfuPerG.toFixed(6),
            point.totalLog10.toFixed(6),
            point.species.st.toFixed(6),
            point.species.lb.toFixed(6),
            point.modeledPh.toFixed(4),
            point.substrateRemainingPct.toFixed(3),
            (point.driverMultiplier * 100).toFixed(3),
            point.acidificationProgressPct.toFixed(3),
            "",
            "",
            "",
            "",
            scopeNote
        ]);
    });

    if (Array.isArray(estimate.storageSeries) && estimate.storageSeries.length > 0) {
        estimate.storageSeries.forEach((point) => {
            lines.push([
                "storage",
                "",
                point.storageDay.toFixed(3),
                point.totalCfuPerG.toFixed(6),
                point.totalLog10.toFixed(6),
                point.species.st.toFixed(6),
                point.species.lb.toFixed(6),
                point.modeledPh.toFixed(4),
                "",
                "",
                "",
                Number.isFinite(point.deltaPh) ? point.deltaPh.toFixed(6) : "",
                Number.isFinite(point.referenceDeltaPh) ? point.referenceDeltaPh.toFixed(6) : "",
                Number.isFinite(point.retention?.st?.deltaLog10) ? point.retention.st.deltaLog10.toFixed(6) : "",
                Number.isFinite(point.retention?.lb?.deltaLog10) ? point.retention.lb.deltaLog10.toFixed(6) : "",
                scopeNote
            ]);
        });
    }

    return lines.map((row) => row.join(",")).join("\r\n");
}

export function buildUncertaintyBands(rawInput, likelyEstimate = null) {
    const likely = likelyEstimate || runYogurtEstimate(rawInput);
    const lowScenario = runUncertaintyScenarioEstimate(rawInput, UNCERTAINTY_SCENARIOS.low);
    const highScenario = runUncertaintyScenarioEstimate(rawInput, UNCERTAINTY_SCENARIOS.high);
    const fitResiduals = getIncubationResidualSummary().inRange;
    const finalPhResidualLow = clamp(likely.finalPh - fitResiduals.rmse, 3.4, 7);
    const finalPhResidualHigh = clamp(likely.finalPh + fitResiduals.rmse, 3.4, 7);

    return {
        note: `CFU low/high remain deterministic scenario bounds from starter viability, growth kinetics, plateau, and substrate-access assumptions. Final pH low/high now use the in-range pooled pointwise incubation-fit RMSE (${fitResiduals.rmse.toFixed(2)} pH units), not a confidence interval.`,
        initialTotal: summarizeBand(lowScenario.initialTotal, likely.initialTotal, highScenario.initialTotal),
        finalTotal: summarizeBand(lowScenario.finalTotal, likely.finalTotal, highScenario.finalTotal),
        finalPh: summarizeBand(finalPhResidualLow, likely.finalPh, finalPhResidualHigh),
        species: SPECIES_ORDER.map((speciesKey) => {
            const likelySpecies = likely.speciesResults.find((item) => item.key === speciesKey);
            const lowSpecies = lowScenario.speciesResults.find((item) => item.key === speciesKey);
            const highSpecies = highScenario.speciesResults.find((item) => item.key === speciesKey);
            return {
                key: speciesKey,
                label: likelySpecies?.label || speciesKey,
                likely: likelySpecies?.finalCfuPerG ?? 0,
                initialLikely: likelySpecies?.initialCfuPerG ?? 0,
                finalBand: summarizeBand(
                    lowSpecies?.finalCfuPerG ?? 0,
                    likelySpecies?.finalCfuPerG ?? 0,
                    highSpecies?.finalCfuPerG ?? 0
                )
            };
        })
    };
}

export function findTimeToPh(series, targetPh) {
    if (!Array.isArray(series) || !Number.isFinite(targetPh)) return null;

    for (let index = 0; index < series.length; index += 1) {
        const point = series[index];
        if (!Number.isFinite(point?.modeledPh) || point.modeledPh > targetPh) {
            continue;
        }
        if (index === 0) {
            return point.timeHr;
        }

        const previous = series[index - 1];
        const phSpan = previous.modeledPh - point.modeledPh;
        if (!Number.isFinite(phSpan) || Math.abs(phSpan) < 1e-9) {
            return point.timeHr;
        }
        const ratio = clamp01((previous.modeledPh - targetPh) / phSpan);
        return previous.timeHr + (point.timeHr - previous.timeHr) * ratio;
    }

    return null;
}

function buildTimeSeries({ durationHr, temperatureC, batchMassG, starterG, starterCfuBySpecies, speciesConfig, substrateConfig, phConfig }) {
    const timeStepHr = 0.25;
    const steps = Math.max(4, Math.min(288, Math.ceil(durationHr / timeStepHr) || 4));
    const data = [];
    const initialSpecies = {};
    const previousSpecies = {};
    const initialLogs = {};
    let totalDemandUsed = 0;

    SPECIES_ORDER.forEach((speciesKey) => {
        const initialCfuPerG = (starterG * starterCfuBySpecies[speciesKey]) / batchMassG;
        initialSpecies[speciesKey] = initialCfuPerG;
        previousSpecies[speciesKey] = initialCfuPerG;
        initialLogs[speciesKey] = safeLog10(initialCfuPerG);
    });

    const demandCapacity = Math.max(0.5, SPECIES_ORDER.reduce((sum, speciesKey) => {
        const config = speciesConfig[speciesKey];
        const amplitude = Math.max(0, config.lMax - initialLogs[speciesKey]);
        return sum + amplitude * (config.substrateDemandWeight ?? 1);
    }, 0) * substrateConfig.reserveMultiplier);

    for (let index = 0; index <= steps; index += 1) {
        const timeHr = durationHr <= 0 ? 0 : Math.min(durationHr, index * timeStepHr);
        const substrateRemainingFraction = index === 0
            ? 1
            : clamp01(1 - (totalDemandUsed / demandCapacity));
        const driverMultiplier = computeSubstrateDriverMultiplier(substrateRemainingFraction);
        const species = {};
        let demandIncrement = 0;
        const modeledPh = computeModeledPhAtTime(timeHr, phConfig);

        SPECIES_ORDER.forEach((speciesKey) => {
            const config = speciesConfig[speciesKey];
            const intrinsicCfuPerG = computeIntrinsicCfuPerG(initialSpecies[speciesKey], timeHr, temperatureC, config);

            if (index === 0) {
                species[speciesKey] = intrinsicCfuPerG;
                return;
            }

            const previousLog = safeLog10(previousSpecies[speciesKey]);
            const intrinsicLog = safeLog10(intrinsicCfuPerG);
            const potentialDelta = Math.max(0, intrinsicLog - previousLog);
            const speciesBoost = substrateConfig.speciesBoost[speciesKey] ?? 1;
            const headroomLog = substrateConfig.speciesHeadroomLog[speciesKey] ?? 0;
            const pHGrowthFactor = computePhGrowthFactor(modeledPh, config);
            const realizedLog = Math.min(
                intrinsicLog + headroomLog,
                previousLog + potentialDelta * driverMultiplier * speciesBoost * pHGrowthFactor
            );

            species[speciesKey] = Math.pow(10, realizedLog);
            const realizedDelta = Math.max(0, realizedLog - previousLog);
            demandIncrement += realizedDelta * (config.substrateDemandWeight ?? 1);
        });

        if (index > 0) {
            totalDemandUsed += demandIncrement;
            SPECIES_ORDER.forEach((speciesKey) => {
                previousSpecies[speciesKey] = species[speciesKey];
            });
        }

        const totalCfuPerG = sum(Object.values(species));
        const acidificationProgress = computeAcidificationProgressForPh(modeledPh, phConfig);
        data.push({
            timeHr,
            species,
            totalCfuPerG,
            totalLog10: safeLog10(totalCfuPerG),
            modeledPh,
            substrateRemainingFraction,
            substrateRemainingPct: substrateRemainingFraction * 100,
            driverMultiplier,
            acidificationProgress,
            acidificationProgressPct: acidificationProgress * 100
        });
    }

    return data;
}

function buildStoragePhase({ storageDays, finalPh, ratioStToLb, finalSpecies }) {
    const clampedDays = clampNonNegative(storageDays);
    const startingSpecies = cloneSpeciesMap(finalSpecies);
    const startingTotal = sum(Object.values(startingSpecies));
    if (!(clampedDays > 0) || !Number.isFinite(finalPh)) {
        return {
            finalPh,
            deltaPh: 0,
            series: [],
            backbone: null,
            finalSpecies: startingSpecies,
            finalTotalCfuPerG: startingTotal,
            cfuModel: null
        };
    }

    const backbone = evaluateStorageBackboneDelta(ratioStToLb, clampedDays);
    const backboneSeries = buildStorageBackboneSeries(ratioStToLb, clampedDays);
    const series = [];
    const fermentationEligibility = computeStorageFermentationEligibility(finalPh, startingTotal);

    backboneSeries.forEach((point) => {
        const endpointCarryover = computeStorageEndpointCarryover(point.storageDay);
        const deltaBasedPh = finalPh + point.deltaPh;
        const referenceBasedPh = Number.isFinite(point.referencePh) && Number.isFinite(point.referenceInitialPh)
            ? point.referencePh + (finalPh - point.referenceInitialPh) * endpointCarryover
            : deltaBasedPh;
        const eligibleReferencePh = finalPh + (referenceBasedPh - finalPh) * fermentationEligibility;
        const modeledPh = clamp(eligibleReferencePh, 3.4, finalPh + 0.05);
        const actualDeltaPh = modeledPh - finalPh;
        const retention = {};
        const species = {};
        SPECIES_ORDER.forEach((speciesKey) => {
            const startingCfu = Math.max(0, startingSpecies?.[speciesKey] ?? 0);
            const speciesRetention = evaluateStorageCfuRetention(speciesKey, point.storageDay, {
                finalPh,
                modeledPh,
                deltaPh: actualDeltaPh,
                ratioStToLb
            });
            retention[speciesKey] = speciesRetention;
            species[speciesKey] = startingCfu > 0
                ? Math.pow(10, Math.max(-300, safeLog10(startingCfu) + speciesRetention.deltaLog10))
                : 0;
        });
        const totalCfuPerG = sum(Object.values(species));
        series.push({
            storageDay: point.storageDay,
            modeledPh,
            deltaPh: actualDeltaPh,
            referenceDeltaPh: point.deltaPh,
            referencePh: point.referencePh,
            referenceInitialPh: point.referenceInitialPh,
            deltaBasedPh,
            endpointCarryover,
            fermentationEligibility,
            species,
            retention,
            totalCfuPerG,
            totalLog10: safeLog10(totalCfuPerG)
        });
    });
    const finalSeriesPoint = series[series.length - 1];

    return {
        finalPh: finalSeriesPoint?.modeledPh ?? finalPh,
        deltaPh: finalSeriesPoint?.deltaPh ?? 0,
        series,
        backbone,
        finalSpecies: cloneSpeciesMap(finalSeriesPoint?.species ?? startingSpecies),
        finalTotalCfuPerG: finalSeriesPoint?.totalCfuPerG ?? startingTotal,
        cfuModel: {
            type: "literature-anchored empirical refrigerated CFU retention",
            temperatureReferenceC: 4,
            finalRetention: finalSeriesPoint?.retention ?? null,
            sources: finalSeriesPoint?.retention?.st?.sources ?? []
        }
    };
}

function computeStorageEndpointCarryover(storageDay) {
    const coefficients = STORAGE_PHASE_COEFFICIENTS.endpointCarryover;
    const day = clamp(Number.isFinite(storageDay) ? storageDay : 0, 0, STORAGE_PHASE_COEFFICIENTS.dayClampMax);
    return lerp(
        coefficients.initialResidualWeight,
        coefficients.residualWeightAfterTransition,
        clamp01(day / coefficients.transitionDays)
    );
}

function computeStorageFermentationEligibility(finalPh, finalTotalCfuPerG) {
    const coefficients = STORAGE_PHASE_COEFFICIENTS.fermentationEligibility;
    const pHCompletion = finalPh <= coefficients.fullyAcidifiedPh
        ? 1
        : clamp01((coefficients.upperAcidifiedPh - finalPh) / (coefficients.upperAcidifiedPh - coefficients.fullyAcidifiedPh));
    const viableCompletion = clamp01((safeLog10(finalTotalCfuPerG) - coefficients.viableLog10Floor) / coefficients.viableLog10Span);
    return Math.min(pHCompletion, viableCompletion);
}

function buildStarterCfuBySpecies(rawInput, starterPreset) {
    if (starterPreset.mode === "species") {
        return {
            st: clampNonNegative(rawInput.starterCfuSt),
            lb: clampNonNegative(rawInput.starterCfuLb)
        };
    }

    const totalStarterCfu = clampNonNegative(rawInput.starterCfuTotal || starterPreset.starterCfuPerG);
    const split = normalizeSplit({
        st: parseFlexibleNumber(rawInput.splitStPercent) / 100,
        lb: parseFlexibleNumber(rawInput.splitLbPercent) / 100
    });

    return {
        st: totalStarterCfu * split.st,
        lb: totalStarterCfu * split.lb
    };
}

function buildSpeciesConfig(rawInput, cocultureProfile) {
    const stBaseLmax = clampRange(rawInput.stLmax, 3, 12, SPECIES_PRESETS.st.lMax);
    const lbBaseLmax = clampRange(rawInput.lbLmax, 3, 12, SPECIES_PRESETS.lb.lMax);
    return {
        st: {
            ...SPECIES_PRESETS.st,
            lagHr: clampNonNegative(rawInput.stLagHr ?? SPECIES_PRESETS.st.lagHr),
            muOpt: clampRange(rawInput.stMuOpt, 0, 3, SPECIES_PRESETS.st.muOpt) * cocultureProfile.st.rateFactor,
            lMax: clamp(stBaseLmax + cocultureProfile.st.headroomLog, 3, 12.25),
            optimumC: clampRange(rawInput.stOptimumC, 20, 60, SPECIES_PRESETS.st.optimumC),
            substrateDemandWeight: 1 * cocultureProfile.st.demandFactor
        },
        lb: {
            ...SPECIES_PRESETS.lb,
            lagHr: clampNonNegative(rawInput.lbLagHr ?? SPECIES_PRESETS.lb.lagHr),
            muOpt: clampRange(rawInput.lbMuOpt, 0, 3, SPECIES_PRESETS.lb.muOpt) * cocultureProfile.lb.rateFactor,
            lMax: clamp(lbBaseLmax + cocultureProfile.lb.headroomLog, 3, 12.25),
            optimumC: clampRange(rawInput.lbOptimumC, 20, 60, SPECIES_PRESETS.lb.optimumC),
            substrateDemandWeight: 1.05 * cocultureProfile.lb.demandFactor
        }
    };
}

function buildSubstrateConfig(rawInput, milkG, extraMassG, cocultureProfile, reserveBias = 0) {
    const preset = SUBSTRATE_PRESETS[rawInput.substrateMode] || SUBSTRATE_PRESETS.standardMilk;
    const solidsBoost = Math.min(0.22, clampNonNegative(extraMassG) / Math.max(milkG, 1));
    return {
        ...preset,
        reserveMultiplier: Math.max(0.2, (preset.reserveMultiplier + solidsBoost + reserveBias) * cocultureProfile.reserveFactor)
    };
}

function buildPhConfig(temperatureC, cocultureProfile, substrateConfig, starterG, batchMassG, starterCfuBySpecies) {
    const coefficients = PH_MODEL_COEFFICIENTS;
    const hydrolyzedCoefficients = coefficients.hydrolyzedSubstrate;
    const inoculumCoefficients = coefficients.inoculumLift;
    const temperatureRateCoefficients = coefficients.temperatureRate;
    const temperatureLagCoefficients = coefficients.temperatureLag;
    const temperatureTerminalCoefficients = coefficients.temperatureTerminal;
    const terminalClamp = coefficients.terminalPhClamp;
    const maxRateClamp = coefficients.maxAcidificationRateClamp;
    const lagClamp = coefficients.lagClampHr;
    const literatureBackbone = interpolateIncubationBackbone(cocultureProfile.ratioStToLb);
    const temperatureRateFactor = clamp(
        temperatureRateCoefficients.base
        + temperatureRateCoefficients.amplitude * gaussian(temperatureC, temperatureRateCoefficients.referenceC, temperatureRateCoefficients.sigmaC),
        temperatureRateCoefficients.min,
        temperatureRateCoefficients.max
    );
    const temperatureLagOffsetHr = clamp(
        temperatureLagCoefficients.slopeHrPerC * (temperatureLagCoefficients.referenceC - temperatureC),
        temperatureLagCoefficients.minHr,
        temperatureLagCoefficients.maxHr
    );
    const temperatureTerminalShift = clamp(
        temperatureTerminalCoefficients.slopePhPerC * (temperatureTerminalCoefficients.referenceC - temperatureC),
        temperatureTerminalCoefficients.minPh,
        temperatureTerminalCoefficients.maxPh
    );
    const hydroShift = substrateConfig.key === "lactoseHydrolyzed" ? hydrolyzedCoefficients.terminalShiftPh : 0;
    const hydroRateBonus = substrateConfig.key === "lactoseHydrolyzed" ? hydrolyzedCoefficients.rateBonusPhPerHr : 0;
    const hydroLagShift = substrateConfig.key === "lactoseHydrolyzed" ? hydrolyzedCoefficients.lagShiftHr : 0;
    const initialPh = substrateConfig.key === "lactoseHydrolyzed" ? coefficients.hydrolyzedInitialPh : coefficients.standardInitialPh;
    const initialTotalCfuPerG = (starterG * sum(Object.values(starterCfuBySpecies))) / Math.max(batchMassG, 1e-9);
    const inoculumLift = clamp(
        (safeLog10(initialTotalCfuPerG) - inoculumCoefficients.centerLog10) / inoculumCoefficients.spanLog10,
        inoculumCoefficients.min,
        inoculumCoefficients.max
    );
    const thermalFactor = computeFermentationThermalFactor(temperatureC);
    const fitResiduals = getIncubationResidualSummary();

    const unconstrainedTerminalPh = clamp(
        literatureBackbone.terminalPh42C
        + temperatureTerminalShift
        + inoculumCoefficients.terminalWeight * inoculumLift
        - hydroShift,
        terminalClamp.min,
        initialPh - terminalClamp.headroomBelowInitial
    );
    const terminalPh = clamp(
        initialPh - (initialPh - unconstrainedTerminalPh) * thermalFactor,
        terminalClamp.min,
        initialPh - terminalClamp.headroomBelowInitial
    );
    const amplitude = Math.max(coefficients.amplitudeMin, initialPh - terminalPh);
    const maxAcidificationRate = clamp(
        (
            literatureBackbone.maxAcidificationRate42C * temperatureRateFactor
            + inoculumCoefficients.rateWeight * inoculumLift
            + hydroRateBonus
        ) * thermalFactor,
        maxRateClamp.min,
        maxRateClamp.max
    );
    const lagHr = clamp(
        literatureBackbone.lagHr42C
        + temperatureLagOffsetHr
        + inoculumCoefficients.lagWeightHr * inoculumLift
        + hydroLagShift,
        lagClamp.min,
        lagClamp.max
    );

    return {
        initialPh,
        terminalPh,
        amplitude,
        maxAcidificationRate,
        lagHr,
        thermalFactor,
        temperatureRateFactor,
        temperatureLagOffsetHr,
        temperatureTerminalShift,
        initialTotalCfuPerG,
        inoculumLift,
        hydroShift,
        hydroRateBonus,
        hydroLagShift,
        unconstrainedTerminalPh,
        split: cocultureProfile.split,
        ratioLog: cocultureProfile.ratioLog,
        ratioStToLb: cocultureProfile.ratioStToLb,
        substrateMode: substrateConfig.key,
        literatureBackbone,
        fitResiduals
    };
}

function buildCocultureProfile(starterCfuBySpecies) {
    const split = normalizeSplit(starterCfuBySpecies);
    const stFraction = split.st;
    const lbFraction = split.lb;
    const ratioStToLb = lbFraction > 0 ? stFraction / lbFraction : Infinity;
    const ratioLog = Math.log10((stFraction + 1e-9) / (lbFraction + 1e-9));
    const mutualBalance = Math.sqrt(clamp01(4 * stFraction * lbFraction));
    const stSupportPeak = gaussian(ratioLog, 0.75, 0.72);
    const lbSupportPeak = gaussian(ratioLog, 0.42, 0.58);
    const stPresence = smoothPresence(stFraction, 0.12, 0.7);
    const lbPresence = smoothPresence(lbFraction, 0.02, 0.22);

    const stRateFactor = clamp(0.95 + 0.15 * stSupportPeak * lbPresence, 0.9, 1.14);
    const lbRateFactor = clamp(0.88 + 0.28 * lbSupportPeak * stPresence, 0.82, 1.16);
    const reserveFactor = clamp(0.96 + 0.10 * mutualBalance + 0.08 * gaussian(ratioLog, 0.78, 0.82), 0.92, 1.14);

    return {
        split,
        ratioStToLb,
        ratioLog,
        extremeRatio: ratioStToLb > 100 || ratioStToLb < 0.1,
        st: {
            rateFactor: stRateFactor,
            headroomLog: Math.max(0, (stRateFactor - 1) * 0.6),
            demandFactor: clamp(1.02 - 0.05 * stSupportPeak, 0.92, 1.04)
        },
        lb: {
            rateFactor: lbRateFactor,
            headroomLog: Math.max(0, (lbRateFactor - 1) * 0.72),
            demandFactor: clamp(1.04 - 0.07 * lbSupportPeak, 0.92, 1.06)
        },
        reserveFactor
    };
}

function computeIntrinsicCfuPerG(initialCfuPerG, timeHr, temperatureC, config) {
    if (!Number.isFinite(initialCfuPerG) || initialCfuPerG <= 0) {
        return 0;
    }

    const l0 = safeLog10(initialCfuPerG);
    const amplitude = Math.max(0, config.lMax - l0);
    if (amplitude <= 0 || timeHr <= 0) {
        return initialCfuPerG;
    }

    const growthTempFactor = Math.max(0.05, Math.exp(-0.5 * Math.pow((temperatureC - config.optimumC) / config.sigmaC, 2)));
    const viabilityTempFactor = computeViabilityTempFactor(temperatureC, config);
    const thermalProfile = computeThermalProfile(timeHr, temperatureC, config);
    const effectiveAmplitude = Math.max(0, amplitude * viabilityTempFactor * thermalProfile.amplitudeFactor);
    if (effectiveAmplitude <= 0) {
        return initialCfuPerG * thermalProfile.survivalFraction;
    }

    const muEffective = config.muOpt * growthTempFactor * thermalProfile.growthFactor;
    const exponent = ((muEffective * Math.E) / effectiveAmplitude) * (config.lagHr - timeHr) + 1;
    const log10CfuPerG = l0 + effectiveAmplitude * Math.exp(-Math.exp(exponent));
    return Math.pow(10, log10CfuPerG) * thermalProfile.survivalFraction;
}

function computeViabilityTempFactor(temperatureC, config) {
    const rawFactor = Math.exp(-0.5 * Math.pow((temperatureC - config.viabilityOptimumC) / config.viabilitySigmaC, 2));
    return Math.max(config.viabilityFloor ?? 0.5, rawFactor);
}

function computePhGrowthFactor(modeledPh, config) {
    if (!Number.isFinite(modeledPh)) return 1;
    const softStart = config.phSoftStart ?? 5;
    const hardFloor = config.phHardFloor ?? 4.1;
    const minFactor = clamp(config.phMinFactor ?? 0.1, 0, 1);
    if (modeledPh >= softStart) return 1;
    if (modeledPh <= hardFloor) return minFactor;
    const normalized = clamp01((modeledPh - hardFloor) / Math.max(1e-9, softStart - hardFloor));
    return minFactor + (1 - minFactor) * Math.pow(normalized, 1.35);
}

function computeSubstrateDriverMultiplier(substrateRemainingFraction) {
    return 0.35 + 0.65 * Math.sqrt(clamp01(substrateRemainingFraction));
}

function computeAcidificationProgressForPh(modeledPh, phConfig) {
    const totalDrop = Math.max(1e-9, phConfig.initialPh - phConfig.terminalPh);
    return clamp01((phConfig.initialPh - modeledPh) / totalDrop);
}

function computeModeledPhAtTime(timeHr, phConfig) {
    if (timeHr <= 0) return phConfig.initialPh;
    const amplitude = Math.max(0.05, phConfig.amplitude);
    const growthWindow = ((phConfig.maxAcidificationRate * Math.E) / amplitude) * (phConfig.lagHr - timeHr) + 1;
    const drop = amplitude * Math.exp(-Math.exp(growthWindow));
    const modeledPh = phConfig.initialPh - drop;
    return clamp(modeledPh, phConfig.terminalPh, phConfig.initialPh);
}

function computeFermentationThermalFactor(temperatureC) {
    if (temperatureC <= 45) return 1;
    const factor = Math.exp(-0.5 * Math.pow((temperatureC - 45) / 5, 2));
    return clamp(factor, 0.02, 1);
}

function computeThermalProfile(timeHr, temperatureC, config) {
    const stressStartC = config.thermalStressStartC ?? config.validTempMaxC ?? 47;
    if (temperatureC <= stressStartC) {
        return {
            growthFactor: 1,
            amplitudeFactor: 1,
            survivalFraction: 1
        };
    }

    const overTempC = temperatureC - stressStartC;
    const growthFactor = Math.exp(-0.5 * Math.pow(overTempC / 2.4, 2));
    const amplitudeFactor = Math.exp(-0.5 * Math.pow(overTempC / 3.1, 2));
    const dRefMin = Math.max(0.02, config.thermalDRefMin ?? 5);
    const dRefC = config.thermalDRefC ?? (stressStartC + 12);
    const zC = Math.max(1, config.thermalZC ?? 6);
    const dMinutes = Math.max(0.001, dRefMin * Math.pow(10, (dRefC - temperatureC) / zC));
    const logReduction = (Math.max(0, timeHr) * 60) / dMinutes;
    const survivalFraction = Math.pow(10, -logReduction);

    return {
        growthFactor: Math.max(0, growthFactor),
        amplitudeFactor: Math.max(0, amplitudeFactor),
        survivalFraction: clamp(survivalFraction, 0, 1)
    };
}

function toMilkGrams(value, unit) {
    const numeric = clampNonNegative(value);
    switch (unit) {
        case "g":
            return numeric;
        case "mL":
            return numeric * MILK_DENSITY_G_PER_ML;
        case "L":
            return numeric * 1000 * MILK_DENSITY_G_PER_ML;
        case "cup":
            return numeric * 236.588 * MILK_DENSITY_G_PER_ML;
        case "quart":
            return numeric * 946.353 * MILK_DENSITY_G_PER_ML;
        case "fl_oz":
        default:
            return numeric * 29.5735 * MILK_DENSITY_G_PER_ML;
    }
}

function toStarterGrams(value, unit) {
    const numeric = clampNonNegative(value);
    switch (unit) {
        case "g":
            return numeric;
        case "oz_wt":
            return numeric * 28.3495;
        case "tbsp":
            return numeric * 14.7868 * STARTER_DENSITY_G_PER_ML;
        case "tsp":
        default:
            return numeric * 4.92892 * STARTER_DENSITY_G_PER_ML;
    }
}

function normalizeSplit(split) {
    const st = Math.max(0, parseFlexibleNumber(split.st) || 0);
    const lb = Math.max(0, parseFlexibleNumber(split.lb) || 0);
    const total = st + lb;
    if (total <= 0) {
        return { st: 0.5, lb: 0.5 };
    }
    return { st: st / total, lb: lb / total };
}

function cloneSpeciesMap(speciesMap) {
    const clone = {};
    SPECIES_ORDER.forEach((speciesKey) => {
        clone[speciesKey] = Math.max(0, speciesMap?.[speciesKey] ?? 0);
    });
    return clone;
}

function safeLog10(value) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.log10(value);
}

function clampNonNegative(value) {
    const numeric = parseFlexibleNumber(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, numeric);
}

function clampRange(value, min, max, fallback) {
    const numeric = parseFlexibleNumber(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.min(max, Math.max(min, numeric));
}

function parseFlexibleNumber(value) {
    if (typeof value === "number") return value;
    const normalized = String(value ?? "")
        .trim()
        .replace(/,/g, "")
        .replace(/\s+/g, "")
        .replace(/\u00d7/g, "x");
    if (!normalized) return NaN;

    const powerMatch = normalized.match(/^10\^([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/i);
    if (powerMatch) {
        return Math.pow(10, Number(powerMatch[1]));
    }

    const coefficientPowerMatch = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:x|\*)10\^([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/i);
    if (coefficientPowerMatch) {
        return Number(coefficientPowerMatch[1]) * Math.pow(10, Number(coefficientPowerMatch[2]));
    }

    return Number(normalized);
}

function sum(values) {
    return values.reduce((total, value) => total + value, 0);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp01(value) {
    return Math.min(1, Math.max(0, value));
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function gaussian(value, mean, sigma) {
    const safeSigma = Math.max(0.05, sigma);
    return Math.exp(-0.5 * Math.pow((value - mean) / safeSigma, 2));
}

function smoothPresence(value, start, full) {
    if (value <= start) return 0;
    if (value >= full) return 1;
    return (value - start) / Math.max(1e-9, full - start);
}

function applyUncertaintyScenario(rawInput, scenario) {
    const adjusted = { ...rawInput };
    adjusted.stMuOpt = scaleInputValue(rawInput.stMuOpt, scenario.muFactor);
    adjusted.lbMuOpt = scaleInputValue(rawInput.lbMuOpt, scenario.muFactor);
    adjusted.stLmax = offsetInputValue(rawInput.stLmax, scenario.lMaxOffset);
    adjusted.lbLmax = offsetInputValue(rawInput.lbLmax, scenario.lMaxOffset);

    if ((rawInput.starterMode || STARTER_PRESETS.storeYogurt.key) === "manualSpecies") {
        adjusted.starterCfuSt = scaleScientificInput(rawInput.starterCfuSt, scenario.starterFactor);
        adjusted.starterCfuLb = scaleScientificInput(rawInput.starterCfuLb, scenario.starterFactor);
    } else {
        adjusted.starterCfuTotal = scaleScientificInput(rawInput.starterCfuTotal, scenario.starterFactor);
    }

    return {
        adjustedInput: adjusted,
        internalAdjustments: {
            reserveBias: scenario.reserveBias
        }
    };
}

function runUncertaintyScenarioEstimate(rawInput, scenario) {
    const { adjustedInput, internalAdjustments } = applyUncertaintyScenario(rawInput, scenario);
    return runYogurtEstimate(adjustedInput, internalAdjustments);
}

function scaleScientificInput(value, factor) {
    const numeric = clampNonNegative(value);
    return numeric > 0 ? String(numeric * factor) : String(value ?? "");
}

function scaleInputValue(value, factor) {
    const numeric = parseFlexibleNumber(value);
    return Number.isFinite(numeric) ? String(numeric * factor) : String(value ?? "");
}

function offsetInputValue(value, offset) {
    const numeric = parseFlexibleNumber(value);
    return Number.isFinite(numeric) ? String(numeric + offset) : String(value ?? "");
}

function summarizeBand(lowCandidate, likely, highCandidate) {
    const low = Math.min(lowCandidate, likely, highCandidate);
    const high = Math.max(lowCandidate, likely, highCandidate);
    return { low, likely, high };
}

function dedupeWarnings(warnings) {
    return Array.from(new Set((warnings || []).filter(Boolean)));
}

function normalizeInternalModelAdjustments(internalAdjustments) {
    return {
        reserveBias: Number.isFinite(internalAdjustments?.reserveBias)
            ? internalAdjustments.reserveBias
            : DEFAULT_INTERNAL_MODEL_ADJUSTMENTS.reserveBias
    };
}
