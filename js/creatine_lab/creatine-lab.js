import {
    BODY_COMPOSITION_PRESETS,
    DEFAULT_MODEL_INPUTS,
    DIETARY_INPUTS_G_PER_DAY,
    LITERATURE_ENDOGENOUS_G_PER_DAY,
    PRESET_INPUTS,
    runCreatineModel
} from "./creatine-model.js";
import { evaluateCreatineChecks } from "./creatine-validation.js";
import { getAuditRows, CREATINE_REFERENCES } from "./creatine-source-map.js";
import { EQUATION_SPECS, getEquationSources, runAllEquationTests, runEquationTest } from "./creatine-math.js";

const dom = {};
const INPUT_DEBOUNCE_MS = 350;
const EXPORT_SVG_WIDTH = 3200;
const EXPORT_SVG_HEIGHT = 1244;
const SETTINGS_STORAGE_KEY = "creatine-lab:settings:v1";
const SETTINGS_SCHEMA_VERSION = 1;
let pendingRecomputeId = null;
let pendingPersistId = null;
let chartOverlayReturnFocus = null;
let mathModalReturnFocus = null;
let mathModalRendered = false;
let chartInfoReturnFocus = null;
let settingsStatusResetId = null;

const CHART_INFO = Object.freeze({
    storage: {
        title: "Dissolved Loss Over Storage",
        plots: "Percentage of dissolved creatine converted to creatinine over the selected storage time. The curve is 1 - exp(-k * t), where k is a first-order rate constant adjusted from a pH anchor by temperature.",
        watchOuts: "Dry-powder storage shows 0% loss because the model treats aqueous degradation only. Very low pH curves outside the supported anchor range are clamped rather than extrapolated.",
        anchorGroups: [
            { label: "Anchored by", keys: ["jager2011", "fdaGras931", "uzzan2009"] }
        ]
    },
    accumulation: {
        title: "Estimated Saturation And Dose Pressure",
        plots: "The center line is max(true pool fill, dose pressure). Below 100% it reads as actual saturation: current pool divided by pool cap. Above 100% it represents dose pressure: the supplement amount that exceeds steady-state need on a pool already at cap. That surplus is not stored; the right-axis waste-pressure line quantifies it.",
        watchOuts: "Reading the line as pure saturation overstates pool fill when the curve sits above ~95%. Use the hover tooltip to see the actual saturation percent and the pressure component separately. Post-load washout in this model is slower than literature suggests (modeled t-half ~41 days; Vandenberghe 1997 observed return-to-baseline within about 4 weeks).",
        anchorGroups: [
            { label: "Center curve", keys: ["hultman1996", "cooper2012", "ncbiCreatine", "persky2001", "persky2003", "schedel1999", "vandenberghe1997"] },
            { label: "Pool-size baseline (body-composition mode)", keys: ["clark2014", "sagayama2023", "pagano2024"] },
            { label: "Responder spread (Monte Carlo band)", keys: ["harris1992", "greenhaff1994"] }
        ]
    },
    creatinine: {
        title: "Daily Creatinine Production",
        plots: "Current pool size times the turnover fraction times the creatine-to-creatinine mass conversion. Turnover fraction is fixed at 1.7% per day from population averages; the creatine-to-creatinine ratio is the molecular-weight conversion from Walker 1979.",
        watchOuts: "Individual turnover varies and is not personalized. Modeled urinary output is steady-state by construction; transient deviations (fever, intense exercise, renal changes) are out of scope. Raising turnover narrows the post-load washout gap but inflates baseline creatinine output.",
        anchorGroups: [
            { label: "Anchored by", keys: ["walker1979", "ncbiCreatine", "cooper2012"] }
        ]
    },
    fate: {
        title: "Fate Of Supplemental Dose",
        plots: "Of today's active supplemental dose: retained (added to the muscle pool) versus excreted unchanged in urine. The split comes from the Michaelis-Menten transporter term Vmax * gap^n * active / (Km + active), where gap = max((cap - pool) / (cap - baseline), 0).",
        watchOuts: "Excreted unchanged on this plot is transporter-limited; it is NOT the same as waste pressure on the Saturation chart, which is pool-cap-limited overflow. Both rise during loading but for different reasons: the gap^n attenuator drops first because the supplementation gap shrinks, then the cap clamp activates when the pool nears saturation.",
        anchorGroups: [
            { label: "Saturable transport / clinical PK reviews", keys: ["persky2001", "persky2003"] },
            { label: "Acute serum creatine PK", keys: ["schedel1999"] },
            { label: "Day-by-day retention shape", keys: ["hultman1996"] },
            { label: "Responder spread (Monte Carlo band)", keys: ["harris1992", "greenhaff1994"] }
        ]
    },
    cumulative: {
        title: "Cumulative Dose Vs Retained",
        plots: "Running totals of supplemental monohydrate dosed and active creatine retained, with a right-axis lifetime retention efficiency = cumulativeRetained / cumulativeActiveSupplement.",
        watchOuts: "Efficiency drops as the pool fills. Early-loading efficiency is much higher than maintenance-phase efficiency, so the lifetime number under-represents the absorptive value of the first few days. The model does not credit any extra-muscular benefit (brain, kidney, off-target uptake) when efficiency drops.",
        anchorGroups: [
            { label: "Pool size and retention", keys: ["cooper2012", "hultman1996", "persky2001", "persky2003"] },
            { label: "Pool-size baseline (body-composition mode)", keys: ["clark2014", "sagayama2023", "pagano2024"] },
            { label: "Responder spread (Monte Carlo band)", keys: ["harris1992", "greenhaff1994"] }
        ]
    }
});

const INPUT_HELP_TEXT = Object.freeze({
    doseG: "Grams of creatine monohydrate powder added. Active creatine equivalent is calculated separately.",
    volumeValue: "Water volume used for the solubility estimate. The adjacent unit selector changes the volume unit.",
    temperatureValue: "Water temperature used for the equilibrium solubility estimate. Warmer water dissolves more creatine.",
    consumeFullSuspension: "Controls interpretation of undissolved powder. It does not hide grit or make suspended powder unavailable.",
    storageMode: "Choose whether creatine is already mixed, added after storage, or kept dry. Degradation only applies to mixed liquid.",
    storageTimeValue: "How long the selected storage scenario runs. The adjacent selector switches between hours and days.",
    storageTemperatureValue: "Temperature used for the storage-loss estimate. It can differ from the initial mixing temperature.",
    phPreset: "Approximate liquid acidity for the storage model. Acidic liquids can degrade dissolved creatine faster.",
    customPh: "Manual pH used when Custom pH is selected. The model is limited to the supported pH range.",
    protocolPreset: "Supplement schedule used for the body-pool curve. It does not change the separate brain reference result.",
    loadingDays: "Number of days the loading dose is used before switching to maintenance or stopping.",
    maintenanceDoseG: "Daily creatine monohydrate dose after the loading phase, or the daily dose for no-loading protocols.",
    customLoadingDoseG: "Daily loading dose used only when Custom loading protocol is selected.",
    simulationDays: "Number of days shown in the accumulation curve and threshold table.",
    bodyPoolBasis: "Choose whether the baseline pool comes from body-composition inputs or a manual baseline value.",
    bodyCompositionPreset: "Picks a literature population centerline for body composition. 'General adult' uses Cooper / ISSN review values (FFM-to-SMM 0.45, 4.6 g/kg muscle Cr, ~120-140 g pool for a 70 kg male). 'Athletic young male' uses D3-creatine values from Clark 2014 / Sagayama 2023 (FFM-to-SMM 0.53, 5.0 g/kg, ~150-175 g pool). 'Custom' leaves the underlying fields untouched.",
    baselinePoolG: "Manual starting total body creatine pool in grams. Used only in manual baseline mode.",
    bodyMassKg: "Body mass used with body fat to estimate fat-free mass when direct FFM or SMM is not supplied.",
    bodyFatPercent: "Used to estimate fat-free mass from body mass. Fat mass is not treated as a creatine-pool driver.",
    fatFreeMassKg: "Optional direct fat-free mass override. If entered, it replaces body mass and body fat for SMM estimation.",
    skeletalMuscleMassKg: "Optional direct skeletal muscle mass override. This is preferred over body-fat and FFM estimates.",
    dietaryPattern: "Dietary part of the diet + endogenous baseline context. It is not added again above the selected baseline pool.",
    brainMassKg: "Brain mass used to scale the regional MRS total-creatine estimate into grams.",
    brainCreatineMm: "Baseline brain total-creatine concentration used for the separate brain estimate.",
    ffmToSmmFraction: "Fraction used to estimate skeletal muscle mass from fat-free mass when direct SMM is not supplied.",
    muscleCreatineGPerKg: "Creatine content per kg wet skeletal muscle used to estimate the baseline body pool.",
    skeletalMuscleCreatineShare: "Assumed share of total body creatine held in skeletal muscle.",
    endogenousGPerDay: "Daily creatine made by the body. It is shown as context and is not added again above baseline.",
    turnoverPercentPerDay: "Daily fraction of the body pool lost to creatinine turnover.",
    baselineSaturationPercent: "Starting saturation used to convert the baseline pool into a modeled upper pool.",
    retentionMax: "Upper bound for how much active supplemental creatine can be retained early in loading.",
    q10: "Temperature multiplier for storage degradation. This is an adjustable approximation, not a fitted personal value.",
    monteCarloDraws: "Number of seeded uncertainty draws used for the 10-90% envelope.",
    brainResponseLowPercent: "Low end of the 20 g/day for 4 weeks brain tCr reference band.",
    brainResponseTypicalPercent: "Center value for the 20 g/day for 4 weeks brain tCr reference band.",
    brainResponseHighPercent: "High end of the 20 g/day for 4 weeks brain tCr reference band.",
    calibrateBackground: "When on, the model pins endogenous synthesis so that diet + synthesis equals baseline turnover and the entered baseline stays put without supplementation. When off, the literature endogenous value is used and the pool drifts toward diet + synthesis divided by turnover.",
    muscleUptakeMaxGPerDay: "Vmax of the daily muscle uptake curve in grams of active creatine. Defaults to 8 g/day, tuned to Hultman 1996 day-1 retention on 20 g/day loading (~5-6 g retained).",
    muscleUptakeKmActiveG: "Km of the daily uptake curve in grams of active creatine. Represents the competition between muscle transporter uptake and renal clearance of unabsorbed plasma creatine. Lower values make a higher fraction of small doses get retained.",
    poolGapHillExponent: "Hill exponent on the supplementation-gap term. Larger values make retention drop more sharply as the pool approaches the modeled cap; the Hultman 6-day loading time-course is approximately Hill ~1 to 1.5."
});

const RESULT_HELP_TEXT = Object.freeze({
    mixDissolvedValue: "Estimated grams dissolved at equilibrium for the selected dose, volume, and temperature.",
    mixUndissolvedValue: "Estimated grams remaining as suspended or gritty powder at equilibrium.",
    mixSolubilityValue: "Temperature-only water solubility limit used by the model.",
    mixWaterNeededValue: "Estimated water volume needed for the full dose to dissolve at the selected temperature.",
    storageRemainingValue: "Total creatine monohydrate estimated to remain after the selected storage scenario.",
    storageLossPercentValue: "Percent of the dissolved fraction estimated to degrade during storage.",
    storageCreatinineValue: "Estimated creatinine formed from degraded dissolved creatine, using molar-mass conversion.",
    bodyFinalPoolValue: "Modeled total body creatine pool at the final simulation day.",
    bodySaturationValue: "Final modeled saturation relative to the baseline-derived upper pool.",
    wastePressureValue: "Estimated creatine monohydrate above the modeled steady-state need for the current pool. It is likely waste pressure, not extra stored creatine.",
    bodyCompositionValue: "Estimated skeletal muscle mass used to derive the body-pool baseline.",
    bodyPoolBasisValue: "Selected starting body-pool estimate and rough uncertainty range.",
    brainPoolValue: "Brain total-creatine estimate scaled from regional MRS concentration and brain mass. The mM-to-grams conversion carries ~±20% interpretation drift depending on whether the MRS mM is reported per liter brain tissue, per liter brain water, or treated as 1 kg ≈ 1 L. The brain pool is informational only and does not feed the skeletal-muscle body mass balance.",
    brainResponseValue: "Reference brain tCr gain from a Dechent 1999 20 g/day for 4 weeks study. Whole-brain response band is 3.5–13.3% (Dechent intersubject range). The 14.6% thalamus regional peak is shown separately as a regional reference, not as part of the whole-brain band. Band is not protocol-driven.",
    monteCarloBandValue: "10th to 90th percentile uncertainty band from seeded model draws.",
    steadyDoseValue: "Additional creatine monohydrate dose, on top of diet plus endogenous synthesis, needed to hold the current modeled pool against daily turnover.",
    creatinineOutputValue: "Modeled urinary creatinine output: current pool times the turnover fraction times the creatinine/creatine mass ratio. Tracks total daily creatine usage.",
    retentionEfficiencyValue: "Fraction of cumulative active supplemental creatine retained in the pool over the simulation. Drops as the pool approaches saturation.",
    equilibriumPoolValue: "Pool the model would settle to if you held this diet and synthesis indefinitely without supplementation: (diet + endogenous) divided by turnover fraction.",
    massBalanceValue: "Residual between the simulated final pool and the closed-form mass balance (initial pool + retained + background - turnover). Should be very small; large values signal numerical drift."
});

const inputIds = [
    "doseG", "volumeValue", "volumeUnit", "temperatureValue", "temperatureUnit", "consumeFullSuspension",
    "storageMode", "storageTimeValue", "storageTimeUnit", "storageTemperatureValue", "storageTemperatureUnit",
    "phPreset", "customPh", "q10", "bodyMassKg", "bodyFatPercent", "fatFreeMassKg", "skeletalMuscleMassKg",
    "bodyPoolBasis", "bodyCompositionPreset", "baselinePoolG", "ffmToSmmFraction", "muscleCreatineGPerKg", "skeletalMuscleCreatineShare",
    "brainMassKg", "brainCreatineMm", "brainResponseLowPercent", "brainResponseTypicalPercent",
    "brainResponseHighPercent", "dietaryPattern", "endogenousGPerDay", "calibrateBackground", "turnoverPercentPerDay",
    "protocolPreset", "customLoadingDoseG", "loadingDays", "maintenanceDoseG", "simulationDays",
    "baselineSaturationPercent", "muscleUptakeMaxGPerDay", "muscleUptakeKmActiveG", "poolGapHillExponent",
    "monteCarloDraws"
];

document.addEventListener("DOMContentLoaded", () => {
    cacheDom();
    addHelpTooltips();
    bindEvents();
    applyInputs(DEFAULT_MODEL_INPUTS);
    const restored = restoreSettingsFromStorage();
    updateAdvancedVisibility();
    recompute();
    renderValidationChecks();
    renderSourceAudit();
    if (restored) {
        setSettingsStatus("Restored your saved settings from this browser.", "success");
    }
});

function cacheDom() {
    const ids = [
        ...inputIds,
        "statusLine", "customPhLine", "customProtocolLines", "manualBaselineLine", "mixDissolvedValue", "mixDissolvedMeta",
        "mixUndissolvedValue", "mixUndissolvedMeta", "mixSolubilityValue", "mixSolubilityMeta",
        "mixWaterNeededValue", "mixWaterNeededMeta", "storageRemainingValue", "storageRemainingMeta",
        "storageLossPercentValue", "storageLossPercentMeta", "storageCreatinineValue", "storageCreatinineMeta",
        "bodyFinalPoolValue", "bodyFinalPoolMeta", "bodySaturationValue", "bodySaturationMeta", "wastePressureValue", "wastePressureMeta",
        "bodyCompositionValue", "bodyCompositionMeta", "bodyPoolBasisValue", "bodyPoolBasisMeta",
        "brainPoolValue", "brainPoolMeta", "brainResponseValue", "brainResponseMeta", "monteCarloBandValue",
        "monteCarloBandMeta", "steadyDoseValue", "steadyDoseMeta",
        "creatinineOutputValue", "creatinineOutputMeta",
        "retentionEfficiencyValue", "retentionEfficiencyMeta",
        "equilibriumPoolValue", "equilibriumPoolMeta",
        "massBalanceValue", "massBalanceMeta",
        "warningList", "thresholdBody", "validationBody", "storageLossChart",
        "storageLossChartSummary", "accumulationChart", "chartSummary", "expandStorageChartBtn", "expandChartBtn",
        "exportStoragePlotBtn", "exportPlotBtn",
        "creatinineChart", "creatinineChartSummary", "expandCreatinineChartBtn", "exportCreatininePlotBtn",
        "fateChart", "fateChartSummary", "expandFateChartBtn", "exportFatePlotBtn",
        "cumulativeChart", "cumulativeChartSummary", "expandCumulativeChartBtn", "exportCumulativePlotBtn",
        "chartOverlay", "chartOverlayTitle", "chartOverlaySummary", "chartOverlayBody", "chartOverlayClose",
        "sourceModelNote", "sourceAuditBody",
        "saveSettingsBtn", "loadSettingsBtn", "loadSettingsInput", "settingsStatus",
        "showMathBtn", "mathModal", "mathModalTitle", "mathModalSummary",
        "mathModalBody", "mathModalClose", "mathModalRunAll", "mathModalStatus",
        "chartInfoModal", "chartInfoModalTitle", "chartInfoModalBody", "chartInfoModalClose"
    ];

    ids.forEach((id) => {
        dom[id] = document.getElementById(id);
    });
}

function bindEvents() {
    inputIds.forEach((id) => {
        const element = dom[id];
        if (!element) return;
        element.addEventListener("focus", closeHelpTooltips);
        element.addEventListener("input", handleInput);
        element.addEventListener("change", handleInput);
    });

    // Body-composition population preset: when the user picks a named
    // population, sync the underlying FFM-to-SMM and muscle Cr inputs so
    // the advanced fields reflect the preset. Manual edits afterwards
    // implicitly switch the user into "custom" semantics; the preset key
    // stays selected until the user changes it.
    dom.bodyCompositionPreset?.addEventListener("change", () => {
        const key = dom.bodyCompositionPreset.value;
        const preset = BODY_COMPOSITION_PRESETS[key];
        if (preset) {
            dom.ffmToSmmFraction.value = preset.ffmToSmmFraction;
            dom.muscleCreatineGPerKg.value = preset.muscleCreatineGPerKg;
            recomputeNow();
        }
    });

    document.querySelectorAll("[data-tab-target]").forEach((button) => {
        button.addEventListener("click", () => activateTab(button.dataset.tabTarget));
    });

    document.querySelectorAll("[data-preset]").forEach((button) => {
        button.addEventListener("click", () => {
            applyInputs(PRESET_INPUTS[button.dataset.preset] || DEFAULT_MODEL_INPUTS);
            updateAdvancedVisibility();
            recomputeNow();
            setStatus(`Loaded ${button.textContent.trim()} preset.`);
        });
    });

    document.getElementById("resetBtn")?.addEventListener("click", () => {
        applyInputs(DEFAULT_MODEL_INPUTS);
        updateAdvancedVisibility();
        recomputeNow();
        clearSettingsFromStorage();
        setStatus("Reset to default bottle scenario.");
        setSettingsStatus("Reset cleared saved settings. Future edits will auto-save again.", "");
    });

    dom.saveSettingsBtn?.addEventListener("click", saveSettingsToFile);
    dom.loadSettingsBtn?.addEventListener("click", () => dom.loadSettingsInput?.click());
    dom.loadSettingsInput?.addEventListener("change", handleSettingsFile);

    dom.exportStoragePlotBtn?.addEventListener("click", exportStorageLossPlot);
    dom.exportPlotBtn?.addEventListener("click", exportAccumulationPlot);
    dom.exportCreatininePlotBtn?.addEventListener("click", exportCreatininePlot);
    dom.exportFatePlotBtn?.addEventListener("click", exportFatePlot);
    dom.exportCumulativePlotBtn?.addEventListener("click", exportCumulativePlot);
    dom.expandStorageChartBtn?.addEventListener("click", openStorageChartOverlay);
    dom.expandChartBtn?.addEventListener("click", openAccumulationChartOverlay);
    dom.expandCreatinineChartBtn?.addEventListener("click", openCreatinineChartOverlay);
    dom.expandFateChartBtn?.addEventListener("click", openFateChartOverlay);
    dom.expandCumulativeChartBtn?.addEventListener("click", openCumulativeChartOverlay);
    dom.chartOverlayClose?.addEventListener("click", closeChartOverlay);
    dom.chartOverlay?.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-chart-overlay-close]")) closeChartOverlay();
    });

    dom.showMathBtn?.addEventListener("click", openMathModal);
    dom.mathModalClose?.addEventListener("click", closeMathModal);
    dom.mathModalRunAll?.addEventListener("click", runAllMathTests);
    dom.mathModal?.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-math-modal-close]")) closeMathModal();
        const runButton = target?.closest("[data-math-run]");
        if (runButton) {
            runSingleMathTest(runButton.getAttribute("data-math-run"));
        }
    });

    document.addEventListener("click", (event) => {
        const chip = event.target instanceof Element ? event.target.closest(".help-chip") : null;
        if (chip) {
            event.preventDefault();
            event.stopPropagation();
            const isOpen = chip.dataset.pinned === "true";
            closeHelpTooltips();
            if (!isOpen) {
                chip.dataset.pinned = "true";
                chip.setAttribute("aria-expanded", "true");
            }
            return;
        }
        closeHelpTooltips();
    });

    document.querySelectorAll("[data-chart-info]").forEach((button) => {
        button.addEventListener("click", () => openChartInfoModal(button.getAttribute("data-chart-info"), button));
    });
    dom.chartInfoModalClose?.addEventListener("click", closeChartInfoModal);
    dom.chartInfoModal?.addEventListener("click", (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest("[data-chart-info-close]")) closeChartInfoModal();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        if (dom.chartInfoModal && !dom.chartInfoModal.hidden) {
            closeChartInfoModal();
            return;
        }
        if (dom.mathModal && !dom.mathModal.hidden) {
            closeMathModal();
            return;
        }
        if (dom.chartOverlay && !dom.chartOverlay.hidden) {
            closeChartOverlay();
            return;
        }
        closeHelpTooltips();
    });
}

function addHelpTooltips() {
    Object.entries(INPUT_HELP_TEXT).forEach(([id, text]) => {
        const element = dom[id] || document.getElementById(id);
        const container = element?.closest(".input-line, .check-line");
        if (!container) return;
        const label = Array.from(container.children).find((child) => child.tagName === "SPAN");
        if (!label || label.querySelector(".help-chip")) return;
        label.classList.add("label-with-help");
        appendHelp(label, `help-${id}`, text);
    });

    Object.entries(RESULT_HELP_TEXT).forEach(([id, text]) => {
        const element = dom[id] || document.getElementById(id);
        const label = element?.closest(".result-card")?.querySelector(".result-label");
        if (!label || label.querySelector(".help-chip")) return;
        label.classList.add("result-label-with-help");
        appendHelp(label, `help-${id}`, text);
    });
}

function appendHelp(target, tooltipId, text) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "help-chip";
    chip.setAttribute("aria-describedby", tooltipId);
    chip.setAttribute("aria-expanded", "false");
    chip.setAttribute("aria-label", `${target.textContent.trim()} help`);
    chip.textContent = "i";
    chip.addEventListener("mouseenter", () => {
        if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
        if (chip.dataset.pinned === "true") return;
        closeHelpTooltips();
        chip.setAttribute("aria-expanded", "true");
    });
    chip.addEventListener("mouseleave", () => {
        if (chip.dataset.pinned === "true") return;
        chip.setAttribute("aria-expanded", "false");
    });

    const tooltip = document.createElement("span");
    tooltip.id = tooltipId;
    tooltip.className = "help-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = text;

    target.append(" ", chip, tooltip);
}

function closeHelpTooltips() {
    document.querySelectorAll(".help-chip").forEach((chip) => {
        delete chip.dataset.pinned;
        chip.setAttribute("aria-expanded", "false");
    });
}

function handleInput(event) {
    if (event && event.target && event.target.id === "dietaryPattern") {
        syncEndogenousToDietaryPattern(event.target.value);
    }
    updateAdvancedVisibility();
    scheduleRecompute();
}

function syncEndogenousToDietaryPattern(pattern) {
    const literatureValue = LITERATURE_ENDOGENOUS_G_PER_DAY[pattern];
    if (literatureValue == null) return;
    const knownLiteratureValues = Object.values(LITERATURE_ENDOGENOUS_G_PER_DAY);
    const currentValue = Number(dom.endogenousGPerDay?.value);
    // Only auto-update if the user hasn't manually overridden to a value that
    // isn't itself one of the diet-pattern literature defaults. Lets the user
    // type a custom number and keep it across diet changes.
    if (!Number.isFinite(currentValue) || knownLiteratureValues.some((value) => Math.abs(value - currentValue) < 1e-6)) {
        dom.endogenousGPerDay.value = String(literatureValue);
    }
}

function scheduleRecompute() {
    window.clearTimeout(pendingRecomputeId);
    setStatus("Updating...");
    pendingRecomputeId = window.setTimeout(() => {
        pendingRecomputeId = null;
        recompute();
    }, INPUT_DEBOUNCE_MS);
}

function recomputeNow() {
    window.clearTimeout(pendingRecomputeId);
    pendingRecomputeId = null;
    recompute();
}

function activateTab(target) {
    document.querySelectorAll("[data-tab-target]").forEach((button) => {
        const active = button.dataset.tabTarget === target;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });

    document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.tabPanel !== target;
    });
}

function applyInputs(values) {
    Object.entries(values).forEach(([key, value]) => {
        const element = dom[key] || document.getElementById(key);
        if (!element) return;
        if (element.type === "checkbox") {
            element.checked = Boolean(value);
        } else if (key === "turnoverFractionPerDay") {
            dom.turnoverPercentPerDay.value = String((Number(value) || DEFAULT_MODEL_INPUTS.turnoverFractionPerDay) * 100);
        } else if (key === "baselineSaturationFraction") {
            dom.baselineSaturationPercent.value = String((Number(value) || DEFAULT_MODEL_INPUTS.baselineSaturationFraction) * 100);
        } else {
            element.value = String(value);
        }
    });

    if (values.turnoverFractionPerDay != null && dom.turnoverPercentPerDay) {
        dom.turnoverPercentPerDay.value = String((Number(values.turnoverFractionPerDay) * 100).toFixed(2));
    }
    if (values.baselineSaturationFraction != null && dom.baselineSaturationPercent) {
        dom.baselineSaturationPercent.value = String((Number(values.baselineSaturationFraction) * 100).toFixed(0));
    }
}

function readInputs() {
    return {
        doseG: dom.doseG.value,
        volumeValue: dom.volumeValue.value,
        volumeUnit: dom.volumeUnit.value,
        temperatureValue: dom.temperatureValue.value,
        temperatureUnit: dom.temperatureUnit.value,
        consumeFullSuspension: dom.consumeFullSuspension.checked,
        storageMode: dom.storageMode.value,
        storageTimeValue: dom.storageTimeValue.value,
        storageTimeUnit: dom.storageTimeUnit.value,
        storageTemperatureValue: dom.storageTemperatureValue.value,
        storageTemperatureUnit: dom.storageTemperatureUnit.value,
        phPreset: dom.phPreset.value,
        customPh: dom.customPh.value,
        q10: dom.q10.value,
        bodyMassKg: dom.bodyMassKg.value,
        bodyFatPercent: dom.bodyFatPercent.value,
        fatFreeMassKg: dom.fatFreeMassKg.value,
        skeletalMuscleMassKg: dom.skeletalMuscleMassKg.value,
        bodyPoolBasis: dom.bodyPoolBasis.value,
        bodyCompositionPreset: dom.bodyCompositionPreset.value,
        baselinePoolG: dom.baselinePoolG.value,
        ffmToSmmFraction: dom.ffmToSmmFraction.value,
        muscleCreatineGPerKg: dom.muscleCreatineGPerKg.value,
        skeletalMuscleCreatineShare: dom.skeletalMuscleCreatineShare.value,
        brainMassKg: dom.brainMassKg.value,
        brainCreatineMm: dom.brainCreatineMm.value,
        brainResponseLowPercent: dom.brainResponseLowPercent.value,
        brainResponseTypicalPercent: dom.brainResponseTypicalPercent.value,
        brainResponseHighPercent: dom.brainResponseHighPercent.value,
        dietaryPattern: dom.dietaryPattern.value,
        endogenousGPerDay: dom.endogenousGPerDay.value,
        calibrateBackground: dom.calibrateBackground.checked,
        turnoverFractionPerDay: Number(dom.turnoverPercentPerDay.value) / 100,
        protocolPreset: dom.protocolPreset.value,
        customLoadingDoseG: dom.customLoadingDoseG.value,
        loadingDays: dom.loadingDays.value,
        maintenanceDoseG: dom.maintenanceDoseG.value,
        simulationDays: dom.simulationDays.value,
        baselineSaturationPercent: dom.baselineSaturationPercent.value,
        muscleUptakeMaxGPerDay: dom.muscleUptakeMaxGPerDay.value,
        muscleUptakeKmActiveG: dom.muscleUptakeKmActiveG.value,
        poolGapHillExponent: dom.poolGapHillExponent.value,
        monteCarloDraws: dom.monteCarloDraws.value
    };
}

function updateAdvancedVisibility() {
    dom.customPhLine.hidden = dom.phPreset.value !== "custom";
    dom.customProtocolLines.hidden = dom.protocolPreset.value !== "custom";
    dom.manualBaselineLine.hidden = dom.bodyPoolBasis.value !== "manual";
}

function recompute() {
    try {
        const result = runCreatineModel(readInputs());
        render(result);
        setStatus("Estimate updated.");
        schedulePersist();
    } catch (error) {
        setStatus(error.message || "Could not compute estimate.", "error");
    }
}

function render(result) {
    renderMix(result);
    renderStorage(result);
    renderAccumulation(result);
    renderBodyCompartments(result);
    renderWarnings(result.warnings);
    renderStorageLossChart(result);
    renderAccumulationChart(result);
    renderCreatinineChart(result);
    renderFateChart(result);
    renderCumulativeChart(result);
}

function renderMix({ mix, inputs }) {
    dom.mixDissolvedValue.textContent = `${formatG(mix.dissolvedG)} g`;
    dom.mixDissolvedMeta.textContent = `${formatPercent(mix.percentDissolved)} of dose, ${formatG(mix.activeDissolvedG)} g active equivalent`;
    dom.mixUndissolvedValue.textContent = `${formatG(mix.undissolvedG)} g`;
    dom.mixUndissolvedMeta.textContent = mix.undissolvedG > 0
        ? "Suspended/gritty if the whole bottle is consumed."
        : "No suspended powder predicted at this temperature and volume.";
    dom.mixSolubilityValue.textContent = `${formatG(mix.solubilityGPerL)} g/L`;
    dom.mixSolubilityMeta.textContent = `at ${formatG(inputs.temperatureC)} deg C; pH not adjusted`;
    dom.mixWaterNeededValue.textContent = `${formatVolumeL(mix.waterNeededL)}`;
    dom.mixWaterNeededMeta.textContent = "estimated minimum water for full equilibrium dissolution";
}

function renderStorage({ storage, inputs }) {
    dom.storageRemainingValue.textContent = `${formatG(storage.totalRemainingG)} g`;
    dom.storageRemainingMeta.textContent = storage.degradationNote;
    dom.storageLossPercentValue.textContent = `${formatPercent(storage.fractionLost * 100)}`;
    dom.storageLossPercentMeta.textContent = storage.degradationApplies
        ? `${storage.confidence}; pH ${formatG(inputs.pH)}, ${formatG(inputs.storageTemperatureC)} deg C`
        : storage.confidence;
    dom.storageCreatinineValue.textContent = `${formatG(storage.creatinineProxyG)} g`;
    dom.storageCreatinineMeta.textContent = `${formatG(storage.activeEquivalentLostG)} g active creatine equivalent lost`;
}

function renderAccumulation({ accumulation, monteCarlo, massBalance }) {
    const turnoverFraction = accumulation.baselinePoolG > 0
        ? accumulation.baselineTurnoverG / accumulation.baselinePoolG
        : 0;
    const currentTurnoverG = accumulation.final.poolG * turnoverFraction;
    const endogenousLabel = accumulation.calibrateBackground
        ? `endogenous calibrated to ${formatG(accumulation.endogenousGPerDay)} g/day`
        : `endogenous ${formatG(accumulation.endogenousGPerDay)} g/day (literature)`;
    const backgroundContext = `diet ${formatG(accumulation.dietaryGPerDay)} g/day + ${endogenousLabel}; background total ${formatG(accumulation.backgroundInputGPerDay)} g/day`;

    dom.bodyFinalPoolValue.textContent = `${formatG(accumulation.final.poolG)} g`;
    dom.bodyFinalPoolMeta.textContent = `cap ${formatG(accumulation.poolCapG)} g from baseline ${formatG(accumulation.baselinePoolG)} g at ${formatPercent(accumulation.baselineSaturationFraction * 100)} baseline saturation`;
    dom.bodySaturationValue.textContent = `${formatPercent(accumulation.final.percentSaturation)}`;
    dom.bodySaturationMeta.textContent = `day ${accumulation.final.day}, supplement gap filled ${formatPercent(accumulation.final.supplementGapFilledPercent)}, retained supplement ${formatG(accumulation.final.retainedSupplementG)} g; turnover ${formatG(accumulation.baselineTurnoverG)} g/day baseline, ${formatG(currentTurnoverG)} g/day current; ${backgroundContext}`;
    dom.wastePressureValue.textContent = `${formatG(accumulation.final.wastePressureCrMG)} g/day`;
    dom.wastePressureMeta.textContent = `10-90% range ${formatG(monteCarlo.final.wastePressureP10)} to ${formatG(monteCarlo.final.wastePressureP90)} g/day; likely not stored beyond the modeled cap`;
    dom.monteCarloBandValue.textContent = `${formatPercent(monteCarlo.final.saturationP10)} to ${formatPercent(monteCarlo.final.saturationP90)}`;
    dom.monteCarloBandMeta.textContent = `10-90% estimated saturation envelope, median ${formatPercent(monteCarlo.final.saturationMedian)}, ${monteCarlo.drawCount} seeded draws`;
    dom.steadyDoseValue.textContent = `${formatG(monteCarlo.final.steadyDoseP10)} to ${formatG(monteCarlo.final.steadyDoseP90)} g/day`;
    dom.steadyDoseMeta.textContent = `centerline ${formatG(accumulation.final.steadyStateDoseCrMG)} g/day extra supplement to hold day ${accumulation.final.day} pool; ${backgroundContext}`;
    dom.creatinineOutputValue.textContent = `${formatG(accumulation.final.creatinineProducedG)} g/day`;
    dom.creatinineOutputMeta.textContent = `MC band ${formatG(monteCarlo.final.creatinineP10)} to ${formatG(monteCarlo.final.creatinineP90)} g/day; baseline ${formatG(accumulation.baselineCreatinineGPerDay)} g/day from a ${formatG(accumulation.baselinePoolG)} g baseline pool`;
    dom.retentionEfficiencyValue.textContent = `${formatPercent(accumulation.final.retentionEfficiency * 100)}`;
    dom.retentionEfficiencyMeta.textContent = `${formatG(accumulation.final.cumulativeRetainedG)} g retained of ${formatG(accumulation.final.cumulativeActiveSupplementG)} g active supplemental creatine over ${accumulation.final.day} days`;
    dom.equilibriumPoolValue.textContent = `${formatG(accumulation.equilibriumPoolG)} g`;
    dom.equilibriumPoolMeta.textContent = accumulation.calibrateBackground
        ? `Equal to baseline by calibration; pool would drift to ${formatG(accumulation.literatureEndogenousGPerDay + accumulation.dietaryGPerDay)} g/day / turnover = ${formatG((accumulation.literatureEndogenousGPerDay + accumulation.dietaryGPerDay) / Math.max(turnoverFraction, 1e-9))} g if calibration were off`
        : `Attractor for no-supplement pool given diet + literature endogenous synthesis`;
    if (massBalance) {
        dom.massBalanceValue.textContent = `${formatG(massBalance.residualG)} g`;
        dom.massBalanceMeta.textContent = `${formatPercent(massBalance.residualFractionOfPool * 100)} of final pool; supplemented in ${formatG(massBalance.totalRetainedG)} g, background in ${formatG(massBalance.totalBackgroundG)} g, turnover out ${formatG(massBalance.totalTurnoverG)} g over ${accumulation.final.day} days`;
    }

    const rows = [90, 95, 99].map((threshold) => {
        const center = accumulation.thresholds[threshold];
        const band = monteCarlo.thresholds[threshold];
        return `
            <tr>
                <td>${threshold}%</td>
                <td>${formatDay(center)}</td>
                <td>${formatDay(band.p10)} to ${formatDay(band.p90)}</td>
                <td>${formatPercent((band.reachedFraction || 0) * 100)}</td>
            </tr>
        `;
    }).join("");
    dom.thresholdBody.innerHTML = rows;
}

function renderBodyCompartments({ inputs }) {
    const composition = inputs.bodyComposition;
    const brain = inputs.brain;
    const basisLabel = inputs.bodyPoolBasis === "body_comp" ? "Body comp" : "Manual";

    dom.bodyCompositionValue.textContent = `${formatG(composition.skeletalMuscleMassKg)} kg`;
    dom.bodyCompositionMeta.textContent = `${formatG(composition.fatFreeMassKg)} kg FFM, ${formatG(composition.muscleCreatinePoolG)} g muscle creatine pool; rough estimate unless direct SMM is supplied`;
    dom.bodyPoolBasisValue.textContent = `${formatG(inputs.baselinePoolG)} g`;
    dom.bodyPoolBasisMeta.textContent = inputs.bodyPoolBasis === "body_comp"
        ? `${basisLabel}; rough pool range ${formatG(composition.totalPoolLowG)} to ${formatG(composition.totalPoolHighG)} g, cap range ${formatG(composition.saturationCapLowG)} to ${formatG(composition.saturationCapHighG)} g`
        : `${basisLabel}; rough body-comp comparison ${formatG(composition.totalPoolLowG)} to ${formatG(composition.totalPoolHighG)} g`;
    dom.brainPoolValue.textContent = `${formatG(brain.baselinePoolG)} g`;
    dom.brainPoolMeta.textContent = `${formatG(brain.brainCreatineMm)} mM MRS estimate scaled to ${formatG(brain.brainMassKg)} kg brain mass (1 kg ≈ 1 L assumption; ~±20% MRS interpretation drift)`;
    dom.brainResponseValue.textContent = `${formatG(brain.responseTypicalGainG)} g`;
    dom.brainResponseMeta.textContent = `20 g/day for 4 weeks whole-brain band: ${formatPercent(brain.responseLowPercent)} to ${formatPercent(brain.responseHighPercent)} (Dechent intersubject range; 14.6% thalamus regional peak shown separately as a regional reference, not part of this band); does not change when protocol changes`;
}

function renderWarnings(warnings) {
    dom.warningList.innerHTML = warnings.length
        ? warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")
        : "<li>No model warnings for the current scenario.</li>";
}

function renderStorageLossChart({ storage, inputs }) {
    const svg = dom.storageLossChart;
    const width = 720;
    const height = 280;
    const pad = { left: 58, right: 18, top: 20, bottom: 38 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const maxDays = Math.max(inputs.storageDays, inputs.storageDays <= 0 ? 1 / 24 : inputs.storageDays);
    const samples = 80;
    const points = Array.from({ length: samples + 1 }, (_, index) => {
        const day = (maxDays * index) / samples;
        const lossPercent = storage.degradationApplies
            ? (1 - Math.exp(-storage.kPerDayAdjusted * day)) * 100
            : 0;
        return { day, lossPercent };
    });
    const maxLoss = Math.max(storage.fractionLost * 100, ...points.map((point) => point.lossPercent));
    const yMax = Math.min(100, Math.max(5, Math.ceil(maxLoss / 5) * 5));
    const x = (day) => pad.left + (day / maxDays) * plotW;
    const y = (percent) => pad.top + (1 - clamp(percent, 0, yMax) / yMax) * plotH;
    const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(point.day).toFixed(2)} ${y(point.lossPercent).toFixed(2)}`).join(" ");
    const midTick = yMax / 2;

    svg.innerHTML = `
        <rect x="0" y="0" width="${width}" height="${height}" class="chart-bg"></rect>
        <line x1="${pad.left}" y1="${y(yMax)}" x2="${width - pad.right}" y2="${y(yMax)}" class="chart-grid"></line>
        <line x1="${pad.left}" y1="${y(midTick)}" x2="${width - pad.right}" y2="${y(midTick)}" class="chart-grid"></line>
        <line x1="${pad.left}" y1="${y(0)}" x2="${width - pad.right}" y2="${y(0)}" class="chart-grid"></line>
        <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="chart-axis"></line>
        <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="chart-axis"></line>
        <path d="${linePath}" class="chart-loss-line"></path>
        <text x="8" y="${y(yMax) + 4}" class="chart-label">${formatPercent(yMax)}</text>
        <text x="16" y="${y(midTick) + 4}" class="chart-label">${formatPercent(midTick)}</text>
        <text x="${pad.left}" y="${height - 10}" class="chart-label">${formatElapsed(0, maxDays)}</text>
        <text x="${width - pad.right - 72}" y="${height - 10}" class="chart-label">${formatElapsed(maxDays, maxDays)}</text>
        ${renderHoverMarkup("loss")}
    `;

    dom.storageLossChartSummary.textContent = storage.degradationApplies
        ? `Dissolved loss reaches ${formatPercent(storage.fractionLost * 100)} by ${formatElapsed(inputs.storageDays, maxDays)}.`
        : `${storage.degradationNote} Dissolved loss stays at 0%.`;

    attachChartHover(svg, points.map((point) => ({
        x: x(point.day),
        y: y(point.lossPercent),
        lines: [
            `${formatElapsed(point.day, maxDays)}: ${formatPercent(point.lossPercent)} loss`,
            storage.degradationApplies ? `pH ${formatG(inputs.pH)}, ${formatG(inputs.storageTemperatureC)} deg C` : "No storage degradation"
        ]
    })), { width, height, pad });
}

function renderAccumulationChart({ accumulation, monteCarlo }) {
    const svg = dom.accumulationChart;
    const width = 720;
    const height = 280;
    const pad = { left: 54, right: 70, top: 20, bottom: 38 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const maxDay = accumulation.days[accumulation.days.length - 1].day || 1;
    const maxPressure = Math.max(
        100,
        ...accumulation.days.map((day) => day.plotSaturationPercent),
        ...monteCarlo.days.map((day) => day.saturationPressureP90)
    );
    const yMax = Math.max(100, Math.ceil(maxPressure / 10) * 10);
    const maxSteadyDose = Math.max(
        1,
        ...accumulation.days.map((day) => day.steadyStateDoseCrMG),
        ...monteCarlo.days.map((day) => day.steadyDoseP90),
        ...accumulation.days.map((day) => day.wastePressureCrMG),
        ...monteCarlo.days.map((day) => day.wastePressureP90)
    );
    const doseMax = Math.max(1, Math.ceil(maxSteadyDose * 2) / 2);

    const x = (day) => pad.left + (day / maxDay) * plotW;
    const y = (percent) => pad.top + (1 - clamp(percent, 0, yMax) / yMax) * plotH;
    const doseY = (dose) => pad.top + (1 - clamp(dose, 0, doseMax) / doseMax) * plotH;
    const centerPath = accumulation.days.map((day, index) => `${index === 0 ? "M" : "L"} ${x(day.day).toFixed(2)} ${y(day.plotSaturationPercent).toFixed(2)}`).join(" ");
    const upper = monteCarlo.days.map((day) => `${x(day.day).toFixed(2)} ${y(day.saturationPressureP90).toFixed(2)}`);
    const lower = [...monteCarlo.days].reverse().map((day) => `${x(day.day).toFixed(2)} ${y(day.saturationPressureP10).toFixed(2)}`);
    const bandPath = `M ${upper.join(" L ")} L ${lower.join(" L ")} Z`;
    const steadyPath = accumulation.days.map((day, index) => `${index === 0 ? "M" : "L"} ${x(day.day).toFixed(2)} ${doseY(day.steadyStateDoseCrMG).toFixed(2)}`).join(" ");
    const steadyUpper = monteCarlo.days.map((day) => `${x(day.day).toFixed(2)} ${doseY(day.steadyDoseP90).toFixed(2)}`);
    const steadyLower = [...monteCarlo.days].reverse().map((day) => `${x(day.day).toFixed(2)} ${doseY(day.steadyDoseP10).toFixed(2)}`);
    const steadyBandPath = `M ${steadyUpper.join(" L ")} L ${steadyLower.join(" L ")} Z`;
    const wastePath = accumulation.days.map((day, index) => `${index === 0 ? "M" : "L"} ${x(day.day).toFixed(2)} ${doseY(day.wastePressureCrMG).toFixed(2)}`).join(" ");
    const wasteZone = yMax > 100
        ? `<rect x="${pad.left}" y="${pad.top}" width="${plotW}" height="${Math.max(0, y(100) - pad.top)}" class="chart-waste-zone"></rect>`
        : "";
    const topPercentLabel = yMax > 100
        ? `<text x="10" y="${y(yMax) + 4}" class="chart-label">${formatPercent(yMax)}</text>`
        : "";

    svg.innerHTML = `
        <rect x="0" y="0" width="${width}" height="${height}" class="chart-bg"></rect>
        ${wasteZone}
        <line x1="${pad.left}" y1="${y(yMax)}" x2="${width - pad.right}" y2="${y(yMax)}" class="chart-grid"></line>
        <line x1="${pad.left}" y1="${y(100)}" x2="${width - pad.right}" y2="${y(100)}" class="chart-grid chart-cap-line"></line>
        <line x1="${pad.left}" y1="${y(75)}" x2="${width - pad.right}" y2="${y(75)}" class="chart-grid"></line>
        <line x1="${pad.left}" y1="${y(50)}" x2="${width - pad.right}" y2="${y(50)}" class="chart-grid"></line>
        <line x1="${width - pad.right}" y1="${pad.top}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="chart-axis chart-steady-axis"></line>
        <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="chart-axis"></line>
        <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="chart-axis"></line>
        <path d="${bandPath}" class="chart-band"></path>
        <path d="${steadyBandPath}" class="chart-steady-band"></path>
        <path d="${centerPath}" class="chart-line"></path>
        <path d="${steadyPath}" class="chart-steady-line"></path>
        <path d="${wastePath}" class="chart-waste-line"></path>
        ${topPercentLabel}
        <text x="10" y="${y(100) + 4}" class="chart-label">100%</text>
        <text x="16" y="${y(50) + 4}" class="chart-label">50%</text>
        <text x="${width - pad.right + 8}" y="${doseY(doseMax) + 4}" class="chart-label chart-steady-label">${formatG(doseMax)} g/d</text>
        <text x="${width - pad.right + 8}" y="${doseY(0) + 4}" class="chart-label chart-steady-label">0 g/d</text>
        <text x="${pad.left}" y="${pad.top - 7}" class="chart-axis-title">Left axis: saturation / dose pressure (%)</text>
        <text x="${width - pad.right - 158}" y="${pad.top - 7}" class="chart-axis-title chart-right-axis-title">Right axis: g/day</text>
        <text x="${pad.left + 10}" y="${pad.top + 16}" class="chart-legend saturation">saturation / dose pressure</text>
        <text x="${pad.left + 10}" y="${pad.top + 33}" class="chart-legend steady">steady dose</text>
        <text x="${pad.left + 10}" y="${pad.top + 50}" class="chart-legend waste">waste pressure</text>
        <text x="${pad.left}" y="${height - 10}" class="chart-label">day 0</text>
        <text x="${width - pad.right - 54}" y="${height - 10}" class="chart-label">day ${maxDay}</text>
        ${renderHoverMarkup("", 4)}
    `;
    dom.chartSummary.textContent = `Left axis shows saturation and dose pressure; right axis shows g/day steady dose and waste pressure. Above 100% is dose pressure, not extra stored creatine.`;

    attachChartHover(svg, accumulation.days.map((day) => {
        const band = monteCarlo.days[day.day] || monteCarlo.final;
        return {
            x: x(day.day),
            y: y(day.plotSaturationPercent),
            pointClass: day.plotSaturationPercent > 100 ? "waste" : "",
            lines: [
                `Day ${day.day}: ${formatPercent(day.percentSaturation)} saturation`,
                `Pressure ${formatPercent(day.plotSaturationPercent)}; band ${formatPercent(band.saturationPressureP10)}-${formatPercent(band.saturationPressureP90)}`,
                `Steady ${formatG(day.steadyStateDoseCrMG)} g/d; band ${formatG(band.steadyDoseP10)}-${formatG(band.steadyDoseP90)}`,
                `Waste ${formatG(day.wastePressureCrMG)} g/d; band ${formatG(band.wastePressureP10)}-${formatG(band.wastePressureP90)}`
            ]
        };
    }), { width, height, pad });
}

function renderCreatinineChart({ accumulation, monteCarlo }) {
    const svg = dom.creatinineChart;
    if (!svg) return;
    const width = 720;
    const height = 280;
    const pad = { left: 64, right: 24, top: 28, bottom: 38 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const days = accumulation.days;
    const mcDays = monteCarlo.days;
    const maxDay = Math.max(1, days[days.length - 1].day);
    const upperBoundCandidates = [
        ...days.map((day) => day.creatinineProducedG),
        ...mcDays.map((day) => day.creatinineP90 ?? 0),
        accumulation.baselineCreatinineGPerDay
    ];
    const maxValue = Math.max(0.001, ...upperBoundCandidates);
    const yMax = Math.ceil(maxValue * 1.15 * 10) / 10;
    const x = (day) => pad.left + (day / maxDay) * plotW;
    const y = (value) => pad.top + (1 - clamp(value, 0, yMax) / yMax) * plotH;

    const centerPath = days
        .map((day, index) => `${index === 0 ? "M" : "L"} ${x(day.day).toFixed(2)} ${y(day.creatinineProducedG).toFixed(2)}`)
        .join(" ");
    const upper = mcDays.map((day) => `${x(day.day).toFixed(2)} ${y(day.creatinineP90 ?? 0).toFixed(2)}`);
    const lower = [...mcDays].reverse().map((day) => `${x(day.day).toFixed(2)} ${y(day.creatinineP10 ?? 0).toFixed(2)}`);
    const bandPath = `M ${upper.join(" L ")} L ${lower.join(" L ")} Z`;

    const ticks = niceTicks(0, yMax, 4);
    const gridMarkup = ticks
        .map((tick) => `<line x1="${pad.left}" y1="${y(tick)}" x2="${width - pad.right}" y2="${y(tick)}" class="chart-grid"></line>`)
        .join("");
    const labelMarkup = ticks
        .map((tick) => `<text x="10" y="${y(tick) + 4}" class="chart-label">${formatG(tick)}</text>`)
        .join("");

    svg.innerHTML = `
        <rect x="0" y="0" width="${width}" height="${height}" class="chart-bg"></rect>
        ${gridMarkup}
        <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="chart-axis"></line>
        <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="chart-axis"></line>
        <path d="${bandPath}" class="chart-creatinine-band"></path>
        <line x1="${pad.left}" y1="${y(accumulation.baselineCreatinineGPerDay)}" x2="${width - pad.right}" y2="${y(accumulation.baselineCreatinineGPerDay)}" class="chart-grid chart-baseline-line"></line>
        <path d="${centerPath}" class="chart-creatinine-line"></path>
        ${labelMarkup}
        <text x="${pad.left}" y="${pad.top - 9}" class="chart-axis-title">Left axis: creatinine g/day</text>
        <text x="${pad.left + 10}" y="${pad.top + 16}" class="chart-legend creatinine">creatinine production</text>
        <text x="${pad.left + 10}" y="${pad.top + 33}" class="chart-legend baseline">baseline creatinine ${formatG(accumulation.baselineCreatinineGPerDay)} g/day</text>
        <text x="${pad.left}" y="${height - 10}" class="chart-label">day 0</text>
        <text x="${width - pad.right - 54}" y="${height - 10}" class="chart-label">day ${maxDay}</text>
        ${renderHoverMarkup("creatinine", 3)}
    `;
    dom.creatinineChartSummary.textContent = `Modeled urinary creatinine output rises with pool size and peaks at day ${accumulation.final.day}: ${formatG(accumulation.final.creatinineProducedG)} g/day (MC ${formatG(monteCarlo.final.creatinineP10)} to ${formatG(monteCarlo.final.creatinineP90)} g/day).`;

    attachChartHover(svg, days.map((day) => {
        const band = mcDays[day.day] || monteCarlo.final;
        return {
            x: x(day.day),
            y: y(day.creatinineProducedG),
            pointClass: "creatinine",
            lines: [
                `Day ${day.day}: ${formatG(day.creatinineProducedG)} g/day creatinine`,
                `Pool ${formatG(day.poolG)} g; total turnover ${formatG(day.dailyLossG)} g/day creatine`,
                `MC band ${formatG(band.creatinineP10)}-${formatG(band.creatinineP90)} g/day`
            ]
        };
    }), { width, height, pad });
}

function renderFateChart({ accumulation, monteCarlo }) {
    const svg = dom.fateChart;
    if (!svg) return;
    const width = 720;
    const height = 280;
    const pad = { left: 64, right: 24, top: 28, bottom: 38 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const days = accumulation.days;
    const mcDays = monteCarlo.days;
    const maxDay = Math.max(1, days[days.length - 1].day);
    const maxValue = Math.max(
        0.5,
        ...days.map((day) => (day.retainedSupplementG + day.excretedSupplementG))
    );
    const yMax = Math.ceil(maxValue * 1.15 * 10) / 10;
    const x = (day) => pad.left + (day / maxDay) * plotW;
    const y = (value) => pad.top + (1 - clamp(value, 0, yMax) / yMax) * plotH;

    const retainedTop = days.map((day) => `${x(day.day).toFixed(2)} ${y(day.retainedSupplementG).toFixed(2)}`);
    const retainedBottom = [...days].reverse().map((day) => `${x(day.day).toFixed(2)} ${y(0).toFixed(2)}`);
    const retainedPath = `M ${retainedTop.join(" L ")} L ${retainedBottom.join(" L ")} Z`;
    const totalTop = days.map((day) => `${x(day.day).toFixed(2)} ${y(day.retainedSupplementG + day.excretedSupplementG).toFixed(2)}`);
    const totalBottom = [...days].reverse().map((day) => `${x(day.day).toFixed(2)} ${y(day.retainedSupplementG).toFixed(2)}`);
    const excretedPath = `M ${totalTop.join(" L ")} L ${totalBottom.join(" L ")} Z`;
    const totalLine = days
        .map((day, index) => `${index === 0 ? "M" : "L"} ${x(day.day).toFixed(2)} ${y(day.retainedSupplementG + day.excretedSupplementG).toFixed(2)}`)
        .join(" ");
    const retainedLine = days
        .map((day, index) => `${index === 0 ? "M" : "L"} ${x(day.day).toFixed(2)} ${y(day.retainedSupplementG).toFixed(2)}`)
        .join(" ");

    const ticks = niceTicks(0, yMax, 4);
    const gridMarkup = ticks
        .map((tick) => `<line x1="${pad.left}" y1="${y(tick)}" x2="${width - pad.right}" y2="${y(tick)}" class="chart-grid"></line>`)
        .join("");
    const labelMarkup = ticks
        .map((tick) => `<text x="10" y="${y(tick) + 4}" class="chart-label">${formatG(tick)}</text>`)
        .join("");

    svg.innerHTML = `
        <rect x="0" y="0" width="${width}" height="${height}" class="chart-bg"></rect>
        ${gridMarkup}
        <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="chart-axis"></line>
        <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="chart-axis"></line>
        <path d="${excretedPath}" class="chart-excreted-area"></path>
        <path d="${retainedPath}" class="chart-retained-area"></path>
        <path d="${totalLine}" class="chart-active-dose-line"></path>
        <path d="${retainedLine}" class="chart-retained-line"></path>
        ${labelMarkup}
        <text x="${pad.left}" y="${pad.top - 9}" class="chart-axis-title">Left axis: g/day active creatine</text>
        <text x="${pad.left + 10}" y="${pad.top + 16}" class="chart-legend retained">retained (added to pool)</text>
        <text x="${pad.left + 10}" y="${pad.top + 33}" class="chart-legend excreted">excreted unchanged in urine</text>
        <text x="${pad.left + 10}" y="${pad.top + 50}" class="chart-legend active-dose">total active supplemental dose</text>
        <text x="${pad.left}" y="${height - 10}" class="chart-label">day 0</text>
        <text x="${width - pad.right - 54}" y="${height - 10}" class="chart-label">day ${maxDay}</text>
        ${renderHoverMarkup("retained", 3)}
    `;
    const finalRetained = accumulation.final.retainedSupplementG;
    const finalExcreted = accumulation.final.excretedSupplementG;
    const finalActive = finalRetained + finalExcreted;
    dom.fateChartSummary.textContent = finalActive > 0
        ? `Day ${accumulation.final.day}: ${formatG(finalRetained)} g retained, ${formatG(finalExcreted)} g excreted unchanged (${formatPercent((finalRetained / finalActive) * 100)} retention).`
        : `No supplemental dose in this scenario; all daily change comes from diet and synthesis vs turnover.`;

    attachChartHover(svg, days.map((day) => {
        const band = mcDays[day.day] || monteCarlo.final;
        const total = day.retainedSupplementG + day.excretedSupplementG;
        return {
            x: x(day.day),
            y: y(day.retainedSupplementG + day.excretedSupplementG),
            pointClass: "retained",
            lines: [
                `Day ${day.day}: ${formatG(day.retainedSupplementG)} g retained / ${formatG(day.excretedSupplementG)} g excreted`,
                `Active dose ${formatG(total)} g/day; retention ${formatPercent(total > 0 ? (day.retainedSupplementG / total) * 100 : 0)}`,
                `MC retained ${formatG(band.retainedP10)}-${formatG(band.retainedP90)} g/day`
            ]
        };
    }), { width, height, pad });
}

function renderCumulativeChart({ accumulation, monteCarlo }) {
    const svg = dom.cumulativeChart;
    if (!svg) return;
    const width = 720;
    const height = 280;
    const pad = { left: 70, right: 70, top: 28, bottom: 38 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const days = accumulation.days;
    const mcDays = monteCarlo.days;
    const maxDay = Math.max(1, days[days.length - 1].day);
    const cumulativeDoses = days.map((day) => day.cumulativeDoseCrMG);
    const cumulativeRetained = days.map((day) => day.cumulativeRetainedG);
    const massMax = Math.max(0.5, ...cumulativeDoses);
    const massYMax = Math.ceil(massMax * 1.1);
    const yMass = (value) => pad.top + (1 - clamp(value, 0, massYMax) / massYMax) * plotH;
    const efficiencies = days.map((day) => day.retentionEfficiency * 100);
    const effMax = Math.max(10, ...efficiencies);
    const effYMax = Math.min(100, Math.ceil(effMax / 10) * 10);
    const yEff = (value) => pad.top + (1 - clamp(value, 0, effYMax) / effYMax) * plotH;
    const x = (day) => pad.left + (day / maxDay) * plotW;

    const dosePath = days
        .map((day, index) => `${index === 0 ? "M" : "L"} ${x(day.day).toFixed(2)} ${yMass(day.cumulativeDoseCrMG).toFixed(2)}`)
        .join(" ");
    const retainedPath = days
        .map((day, index) => `${index === 0 ? "M" : "L"} ${x(day.day).toFixed(2)} ${yMass(day.cumulativeRetainedG).toFixed(2)}`)
        .join(" ");
    const effPath = days
        .map((day, index) => `${index === 0 ? "M" : "L"} ${x(day.day).toFixed(2)} ${yEff(day.retentionEfficiency * 100).toFixed(2)}`)
        .join(" ");

    const massTicks = niceTicks(0, massYMax, 4);
    const massLabelMarkup = massTicks
        .map((tick) => `<text x="10" y="${yMass(tick) + 4}" class="chart-label">${formatG(tick)}</text>`)
        .join("");
    const massGridMarkup = massTicks
        .map((tick) => `<line x1="${pad.left}" y1="${yMass(tick)}" x2="${width - pad.right}" y2="${yMass(tick)}" class="chart-grid"></line>`)
        .join("");
    const effTicks = niceTicks(0, effYMax, 4);
    const effLabelMarkup = effTicks
        .map((tick) => `<text x="${width - pad.right + 8}" y="${yEff(tick) + 4}" class="chart-label chart-efficiency-label">${formatG(tick)}%</text>`)
        .join("");

    svg.innerHTML = `
        <rect x="0" y="0" width="${width}" height="${height}" class="chart-bg"></rect>
        ${massGridMarkup}
        <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" class="chart-axis"></line>
        <line x1="${width - pad.right}" y1="${pad.top}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="chart-axis chart-steady-axis"></line>
        <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" class="chart-axis"></line>
        <path d="${dosePath}" class="chart-cumulative-dose-line"></path>
        <path d="${retainedPath}" class="chart-cumulative-retained-line"></path>
        <path d="${effPath}" class="chart-efficiency-line"></path>
        ${massLabelMarkup}
        ${effLabelMarkup}
        <text x="${pad.left}" y="${pad.top - 9}" class="chart-axis-title">Left axis: cumulative grams</text>
        <text x="${width - pad.right - 174}" y="${pad.top - 9}" class="chart-axis-title chart-right-axis-title">Right axis: retention efficiency %</text>
        <text x="${pad.left + 10}" y="${pad.top + 16}" class="chart-legend cumulative-dose">cumulative supplement dose</text>
        <text x="${pad.left + 10}" y="${pad.top + 33}" class="chart-legend cumulative-retained">cumulative retained active</text>
        <text x="${pad.left + 10}" y="${pad.top + 50}" class="chart-legend efficiency">retention efficiency</text>
        <text x="${pad.left}" y="${height - 10}" class="chart-label">day 0</text>
        <text x="${width - pad.right - 54}" y="${height - 10}" class="chart-label">day ${maxDay}</text>
        ${renderHoverMarkup("efficiency", 3)}
    `;
    dom.cumulativeChartSummary.textContent = accumulation.final.cumulativeDoseCrMG > 0
        ? `Over ${accumulation.final.day} days: ${formatG(accumulation.final.cumulativeDoseCrMG)} g monohydrate dosed, ${formatG(accumulation.final.cumulativeRetainedG)} g active retained (lifetime efficiency ${formatPercent(accumulation.final.retentionEfficiency * 100)}).`
        : `No supplemental dose in this scenario.`;

    attachChartHover(svg, days.map((day) => {
        const band = mcDays[day.day] || monteCarlo.final;
        return {
            x: x(day.day),
            y: yEff(day.retentionEfficiency * 100),
            pointClass: "efficiency",
            lines: [
                `Day ${day.day}: ${formatPercent(day.retentionEfficiency * 100)} cumulative retention`,
                `Cumulative dose ${formatG(day.cumulativeDoseCrMG)} g; retained ${formatG(day.cumulativeRetainedG)} g`,
                `MC retained band ${formatG(band.cumulativeRetainedP10)}-${formatG(band.cumulativeRetainedP90)} g`
            ]
        };
    }), { width, height, pad });
}

function niceTicks(min, max, count) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        return [min, max].filter((value) => Number.isFinite(value));
    }
    const ticks = [];
    for (let i = 0; i <= count; i += 1) {
        ticks.push(min + ((max - min) * i) / count);
    }
    return ticks;
}

function renderHoverMarkup(pointClass = "", lineCount = 2) {
    const textRows = Array.from({ length: lineCount }, (_, index) => (
        `<text class="chart-tooltip-text" data-line="${index}"></text>`
    )).join("");
    return `
        <g class="chart-hover" style="display: none;">
            <line class="chart-hover-line"></line>
            <circle class="chart-hover-point ${pointClass}" r="5"></circle>
            <rect class="chart-tooltip-bg" width="360" height="${20 + lineCount * 17}"></rect>
            ${textRows}
        </g>
    `;
}

function attachChartHover(svg, points, { width, height, pad }) {
    const previousMove = svg.__chartPointerMove;
    const previousLeave = svg.__chartPointerLeave;
    if (previousMove) svg.removeEventListener("pointermove", previousMove);
    if (previousLeave) svg.removeEventListener("pointerleave", previousLeave);

    const hover = svg.querySelector(".chart-hover");
    if (!hover || !points.length) return;

    const line = hover.querySelector(".chart-hover-line");
    const point = hover.querySelector(".chart-hover-point");
    const rect = hover.querySelector(".chart-tooltip-bg");
    const textLines = hover.querySelectorAll(".chart-tooltip-text");
    const basePointClass = point.getAttribute("class") || "chart-hover-point";
    const tooltipWidth = 360;
    const tooltipHeight = 20 + textLines.length * 17;

    const moveHandler = (event) => {
        const bounds = svg.getBoundingClientRect();
        const svgX = ((event.clientX - bounds.left) / bounds.width) * width;
        const nearest = points.reduce((best, candidate) => (
            Math.abs(candidate.x - svgX) < Math.abs(best.x - svgX) ? candidate : best
        ), points[0]);
        const tooltipX = clamp(nearest.x + 12, 8, width - tooltipWidth - 8);
        const tooltipY = clamp(nearest.y - tooltipHeight - 12, 8, height - tooltipHeight - 8);

        hover.style.display = "block";
        line.setAttribute("x1", nearest.x.toFixed(2));
        line.setAttribute("x2", nearest.x.toFixed(2));
        line.setAttribute("y1", String(pad.top));
        line.setAttribute("y2", String(height - pad.bottom));
        point.setAttribute("cx", nearest.x.toFixed(2));
        point.setAttribute("cy", nearest.y.toFixed(2));
        point.setAttribute("class", nearest.pointClass ? `${basePointClass} ${nearest.pointClass}` : basePointClass);
        rect.setAttribute("x", tooltipX.toFixed(2));
        rect.setAttribute("y", tooltipY.toFixed(2));
        rect.setAttribute("width", String(tooltipWidth));
        rect.setAttribute("height", String(tooltipHeight));
        textLines.forEach((text, index) => {
            text.textContent = nearest.lines[index] || "";
            text.setAttribute("x", (tooltipX + 10).toFixed(2));
            text.setAttribute("y", (tooltipY + 19 + index * 17).toFixed(2));
        });
    };

    const leaveHandler = () => {
        hover.style.display = "none";
    };

    svg.__chartPointerMove = moveHandler;
    svg.__chartPointerLeave = leaveHandler;
    svg.addEventListener("pointermove", moveHandler);
    svg.addEventListener("pointerleave", leaveHandler);
}

function openAccumulationChartOverlay() {
    if (pendingRecomputeId !== null) {
        recomputeNow();
    }
    openChartOverlay({
        chart: dom.accumulationChart,
        title: document.getElementById("chart-title")?.textContent || "Estimated Saturation And Dose Pressure",
        summary: dom.chartSummary?.textContent || "Expanded chart view.",
        label: "Expanded Creatine Lab saturation and dose pressure chart"
    });
}

function openStorageChartOverlay() {
    if (pendingRecomputeId !== null) {
        recomputeNow();
    }
    openChartOverlay({
        chart: dom.storageLossChart,
        title: document.getElementById("storage-chart-title")?.textContent || "Dissolved Loss Over Storage",
        summary: dom.storageLossChartSummary?.textContent || "Expanded chart view.",
        label: "Expanded Creatine Lab dissolved storage-loss chart"
    });
}

function openCreatinineChartOverlay() {
    if (pendingRecomputeId !== null) recomputeNow();
    openChartOverlay({
        chart: dom.creatinineChart,
        title: document.getElementById("creatinine-chart-title")?.textContent || "Daily Creatinine Production",
        summary: dom.creatinineChartSummary?.textContent || "Expanded chart view.",
        label: "Expanded Creatine Lab daily creatinine production chart"
    });
}

function openFateChartOverlay() {
    if (pendingRecomputeId !== null) recomputeNow();
    openChartOverlay({
        chart: dom.fateChart,
        title: document.getElementById("fate-chart-title")?.textContent || "Fate Of Supplemental Dose",
        summary: dom.fateChartSummary?.textContent || "Expanded chart view.",
        label: "Expanded Creatine Lab fate-of-dose chart"
    });
}

function openCumulativeChartOverlay() {
    if (pendingRecomputeId !== null) recomputeNow();
    openChartOverlay({
        chart: dom.cumulativeChart,
        title: document.getElementById("cumulative-chart-title")?.textContent || "Cumulative Dose Vs Retained",
        summary: dom.cumulativeChartSummary?.textContent || "Expanded chart view.",
        label: "Expanded Creatine Lab cumulative dose versus retained chart"
    });
}

function openChartOverlay({ chart, title, summary, label }) {
    if (!chart || !dom.chartOverlay || !dom.chartOverlayBody) return;
    closeHelpTooltips();
    chartOverlayReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dom.chartOverlayTitle.textContent = title;
    dom.chartOverlaySummary.textContent = summary;
    dom.chartOverlayBody.replaceChildren(cloneChartForOverlay(chart, label));
    setAppBackgroundInert(true);
    dom.chartOverlay.hidden = false;
    document.body.classList.add("chart-overlay-open");
    dom.chartOverlayClose?.focus();
}

function closeChartOverlay() {
    if (!dom.chartOverlay || dom.chartOverlay.hidden) return;
    dom.chartOverlay.hidden = true;
    dom.chartOverlayBody?.replaceChildren();
    setAppBackgroundInert(false);
    document.body.classList.remove("chart-overlay-open");
    chartOverlayReturnFocus?.focus?.();
    chartOverlayReturnFocus = null;
}

function openMathModal() {
    if (!dom.mathModal || !dom.mathModalBody) return;
    if (!mathModalRendered) {
        renderMathModal();
        mathModalRendered = true;
    }
    closeHelpTooltips();
    mathModalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAppBackgroundInert(true);
    dom.mathModal.hidden = false;
    document.body.classList.add("chart-overlay-open");
    setMathStatus("Press a \"Run test\" button to exercise that equation, or \"Run all tests\" to evaluate every equation against its anchor.", "");
    dom.mathModalClose?.focus();
}

function closeMathModal() {
    if (!dom.mathModal || dom.mathModal.hidden) return;
    dom.mathModal.hidden = true;
    setAppBackgroundInert(false);
    document.body.classList.remove("chart-overlay-open");
    mathModalReturnFocus?.focus?.();
    mathModalReturnFocus = null;
}

function setAppBackgroundInert(inert) {
    document.querySelectorAll(".container > header, .container > main, .container > footer").forEach((el) => {
        if (inert) {
            el.setAttribute("inert", "");
            el.setAttribute("aria-hidden", "true");
        } else {
            el.removeAttribute("inert");
            el.removeAttribute("aria-hidden");
        }
    });
}

function openChartInfoModal(chartId, trigger) {
    const info = CHART_INFO[chartId];
    if (!info || !dom.chartInfoModal || !dom.chartInfoModalBody) return;
    let sectionIdSeq = 0;
    renderChartInfo(info, () => `chartInfoSection_${++sectionIdSeq}`);
    closeHelpTooltips();
    chartInfoReturnFocus = trigger instanceof HTMLElement
        ? trigger
        : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setAppBackgroundInert(true);
    dom.chartInfoModal.hidden = false;
    document.body.classList.add("chart-overlay-open");
    dom.chartInfoModalClose?.focus();
}

function closeChartInfoModal() {
    if (!dom.chartInfoModal || dom.chartInfoModal.hidden) return;
    dom.chartInfoModal.hidden = true;
    setAppBackgroundInert(false);
    document.body.classList.remove("chart-overlay-open");
    chartInfoReturnFocus?.focus?.();
    chartInfoReturnFocus = null;
}

function renderChartInfo(info, nextId) {
    if (dom.chartInfoModalTitle) {
        dom.chartInfoModalTitle.textContent = info.title;
    }
    const body = dom.chartInfoModalBody;
    body.replaceChildren();

    const sections = [
        { heading: "What it plots", text: info.plots },
        { heading: "Watch-outs", text: info.watchOuts }
    ];
    sections.forEach((section) => {
        const wrapper = document.createElement("section");
        wrapper.className = "chart-info-section";
        const headingId = nextId();
        wrapper.setAttribute("aria-labelledby", headingId);
        const h3 = document.createElement("h3");
        h3.id = headingId;
        h3.textContent = section.heading;
        wrapper.appendChild(h3);
        const p = document.createElement("p");
        p.textContent = section.text;
        wrapper.appendChild(p);
        body.appendChild(wrapper);
    });

    const groups = info.anchorGroups || [];
    groups.forEach((group) => {
        const refs = (group.keys || []).map((key) => CREATINE_REFERENCES[key]).filter(Boolean);
        if (refs.length === 0) return;
        const refSection = document.createElement("section");
        refSection.className = "chart-info-section";
        const headingId = nextId();
        refSection.setAttribute("aria-labelledby", headingId);
        const refHeading = document.createElement("h3");
        refHeading.id = headingId;
        refHeading.textContent = group.label;
        refSection.appendChild(refHeading);
        const list = document.createElement("div");
        list.className = "chart-info-anchors";
        refs.forEach((ref) => {
            const link = document.createElement("a");
            link.href = ref.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = ref.label;
            list.appendChild(link);
        });
        refSection.appendChild(list);
        body.appendChild(refSection);
    });
}

function renderMathModal() {
    if (!dom.mathModalBody) return;
    const html = EQUATION_SPECS.map((spec) => {
        const sourcesHtml = getEquationSources(spec)
            .map((source) => `<a href="${escapeHtml(source.url || "#")}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>`)
            .join(", ") || "<span>(no external source)</span>";
        return `
            <article class="math-card" data-math-card="${escapeHtml(spec.id)}">
                <h3>${escapeHtml(spec.title)}</h3>
                <button type="button" class="tool-btn secondary math-card-run" data-math-run="${escapeHtml(spec.id)}">Run test</button>
                <div class="math-card-body">
                    <pre class="math-card-equation">${escapeHtml(spec.equation)}</pre>
                    <p>${escapeHtml(spec.rationale)}</p>
                    <div class="math-card-meta">
                        <span><strong>Implementation:</strong> ${escapeHtml(spec.implementation)}</span>
                    </div>
                    <div class="math-card-meta">
                        <span><strong>Fixture:</strong> ${escapeHtml(spec.fixture)}</span>
                    </div>
                    <div class="math-card-meta">
                        <span><strong>Expected:</strong> ${escapeHtml(spec.expected)}</span>
                    </div>
                    <div class="math-card-meta math-card-sources">
                        <span><strong>Source:</strong></span>
                        <span>${sourcesHtml}</span>
                    </div>
                    <div class="math-card-result" data-math-result="${escapeHtml(spec.id)}" aria-live="polite"></div>
                </div>
            </article>
        `;
    }).join("");
    dom.mathModalBody.innerHTML = html;
}

function runSingleMathTest(id) {
    const result = runEquationTest(id);
    if (!result) return;
    displayMathResult(id, result);
    setMathStatus(
        result.pass
            ? `Test "${id}" passed. The live model matches the documented equation.`
            : `Test "${id}" failed. ${result.message || "Drift detected between displayed math and implementation."}`,
        result.pass ? "success" : "error"
    );
}

function runAllMathTests() {
    const results = runAllEquationTests();
    let passed = 0;
    results.forEach((entry) => {
        displayMathResult(entry.id, entry);
        if (entry.pass) passed += 1;
    });
    const total = results.length;
    const allPass = passed === total;
    setMathStatus(
        allPass
            ? `All ${total} equation tests passed. The displayed math matches the live model.`
            : `${passed} of ${total} equation tests passed. Inspect failing cards for details.`,
        allPass ? "success" : "error"
    );
}

function displayMathResult(id, result) {
    if (!dom.mathModalBody) return;
    const target = dom.mathModalBody.querySelector(`[data-math-result="${cssEscape(id)}"]`);
    if (!target) return;
    target.classList.remove("pass", "fail");
    target.classList.add("visible", result.pass ? "pass" : "fail");
    const expected = formatMathValue(result.expected, result.units);
    const actual = formatMathValue(result.actual, result.units);
    target.innerHTML = `
        <span class="math-card-result-status">${result.pass ? "PASS" : "FAIL"}</span>
        <div class="math-card-result-row"><span class="math-card-result-label">Expected:</span><span>${escapeHtml(expected)}</span></div>
        <div class="math-card-result-row"><span class="math-card-result-label">Actual:</span><span>${escapeHtml(actual)}</span></div>
        ${result.message ? `<div class="math-card-result-row"><span>${escapeHtml(result.message)}</span></div>` : ""}
    `;
}

function formatMathValue(value, units = "") {
    if (value === null || value === undefined) return "n/a";
    if (typeof value === "number") {
        if (!Number.isFinite(value)) return "n/a";
        const abs = Math.abs(value);
        const formatted = abs === 0 || (abs >= 1e-3 && abs < 1e6) ? value.toFixed(4) : value.toExponential(3);
        return units ? `${formatted} ${units}` : formatted;
    }
    return String(value);
}

function setMathStatus(message, type = "") {
    if (!dom.mathModalStatus) return;
    dom.mathModalStatus.textContent = message;
    dom.mathModalStatus.className = `math-modal-status ${type}`.trim();
}

function cssEscape(value) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
        return CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function cloneChartForOverlay(svg, label) {
    const clone = svg.cloneNode(true);
    clone.removeAttribute("id");
    clone.classList.add("chart-overlay-chart");
    clone.setAttribute("aria-label", label || "Expanded Creatine Lab chart");
    clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
    clone.querySelectorAll(".chart-hover").forEach((hover) => hover.remove());
    return clone;
}

function exportAccumulationPlot() {
    exportChartSvg({
        chart: dom.accumulationChart,
        title: "Creatine Lab saturation and dose pressure plot",
        ariaLabel: "Exported Creatine Lab saturation and dose pressure plot",
        filename: "creatine-lab-saturation-dose-pressure.svg"
    });
}

function exportStorageLossPlot() {
    exportChartSvg({
        chart: dom.storageLossChart,
        title: "Creatine Lab dissolved loss over storage plot",
        ariaLabel: "Exported Creatine Lab dissolved storage loss plot",
        filename: "creatine-lab-dissolved-loss-over-storage.svg"
    });
}

function exportCreatininePlot() {
    exportChartSvg({
        chart: dom.creatinineChart,
        title: "Creatine Lab daily creatinine production plot",
        ariaLabel: "Exported Creatine Lab daily creatinine production plot",
        filename: "creatine-lab-creatinine-production.svg"
    });
}

function exportFatePlot() {
    exportChartSvg({
        chart: dom.fateChart,
        title: "Creatine Lab fate of supplemental dose plot",
        ariaLabel: "Exported Creatine Lab fate-of-dose plot",
        filename: "creatine-lab-fate-of-dose.svg"
    });
}

function exportCumulativePlot() {
    exportChartSvg({
        chart: dom.cumulativeChart,
        title: "Creatine Lab cumulative dose versus retained plot",
        ariaLabel: "Exported Creatine Lab cumulative dose versus retained plot",
        filename: "creatine-lab-cumulative-dose-vs-retained.svg"
    });
}

function exportChartSvg({ chart, title, ariaLabel, filename }) {
    if (!chart) return;
    if (pendingRecomputeId !== null) recomputeNow();

    const clone = chart.cloneNode(true);
    clone.querySelectorAll(".chart-hover").forEach((hover) => hover.remove());
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(EXPORT_SVG_WIDTH));
    clone.setAttribute("height", String(EXPORT_SVG_HEIGHT));
    clone.setAttribute("role", "img");
    clone.setAttribute("aria-label", ariaLabel);

    const titleElement = document.createElementNS("http://www.w3.org/2000/svg", "title");
    titleElement.textContent = title;
    clone.insertBefore(titleElement, clone.firstChild);

    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = getExportChartCss();
    clone.insertBefore(style, clone.children[1] || null);

    const svgText = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus("Exported scalable SVG plot.");
}

function getExportChartCss() {
    const theme = getActiveExportTheme();
    return `
        :root {
            --creatine-panel: ${theme.panel};
            --creatine-soft: ${theme.soft};
            --creatine-border: ${theme.border};
            --creatine-text: ${theme.text};
            --creatine-muted: ${theme.muted};
            --creatine-orange: ${theme.orange};
            --creatine-cyan: ${theme.cyan};
            --creatine-red: ${theme.red};
            --creatine-green: ${theme.green};
        }
        .chart-bg { fill: var(--creatine-soft); }
        .chart-grid { stroke: ${withAlpha(theme.muted, 0.24)}; stroke-width: 1; }
        .chart-cap-line { stroke: ${withAlpha(theme.red, 0.58)}; stroke-dasharray: 6 4; }
        .chart-axis { stroke: ${withAlpha(theme.muted, 0.6)}; stroke-width: 1.4; }
        .chart-waste-zone { fill: ${withAlpha(theme.red, 0.09)}; }
        .chart-band { fill: ${withAlpha(theme.cyan, 0.20)}; stroke: none; }
        .chart-steady-band { fill: ${withAlpha(theme.cyan, 0.12)}; stroke: none; }
        .chart-line { fill: none; stroke: var(--creatine-orange); stroke-width: 3; }
        .chart-steady-line { fill: none; stroke: var(--creatine-cyan); stroke-width: 2.4; stroke-dasharray: 7 5; }
        .chart-waste-line { fill: none; stroke: var(--creatine-red); stroke-width: 2.4; }
        .chart-loss-line { fill: none; stroke: var(--creatine-red); stroke-width: 3; }
        .chart-creatinine-line { fill: none; stroke: var(--creatine-orange); stroke-width: 2.6; }
        .chart-creatinine-band { fill: ${withAlpha(theme.orange, 0.18)}; stroke: none; }
        .chart-baseline-line { stroke: ${withAlpha(theme.cyan, 0.7)}; stroke-dasharray: 5 4; }
        .chart-retained-area { fill: ${withAlpha(theme.green, 0.32)}; stroke: none; }
        .chart-excreted-area { fill: ${withAlpha(theme.red, 0.22)}; stroke: none; }
        .chart-retained-line { fill: none; stroke: var(--creatine-green); stroke-width: 2.2; }
        .chart-active-dose-line { fill: none; stroke: var(--creatine-cyan); stroke-width: 1.6; stroke-dasharray: 4 4; }
        .chart-cumulative-dose-line { fill: none; stroke: var(--creatine-cyan); stroke-width: 2.6; }
        .chart-cumulative-retained-line { fill: none; stroke: var(--creatine-green); stroke-width: 2.6; }
        .chart-efficiency-line { fill: none; stroke: var(--creatine-orange); stroke-width: 2.2; stroke-dasharray: 6 4; }
        .chart-label { fill: var(--creatine-muted); font: 700 12px "JetBrains Mono", monospace; }
        .chart-steady-label, .chart-legend.steady { fill: var(--creatine-cyan); }
        .chart-efficiency-label, .chart-legend.efficiency { fill: var(--creatine-orange); }
        .chart-legend { fill: var(--creatine-muted); font: 800 11px "JetBrains Mono", monospace; }
        .chart-legend.saturation { fill: var(--creatine-orange); }
        .chart-legend.waste { fill: var(--creatine-red); }
        .chart-legend.creatinine { fill: var(--creatine-orange); }
        .chart-legend.baseline { fill: var(--creatine-cyan); }
        .chart-legend.retained, .chart-legend.cumulative-retained { fill: var(--creatine-green); }
        .chart-legend.excreted { fill: var(--creatine-red); }
        .chart-legend.cumulative-dose { fill: var(--creatine-cyan); }
        .chart-legend.active-dose { fill: var(--creatine-cyan); }
        .chart-axis-title { fill: var(--creatine-muted); font: 800 10px "JetBrains Mono", monospace; text-transform: uppercase; }
    `;
}

function getActiveExportTheme() {
    const styles = getComputedStyle(document.documentElement);
    const read = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
    return {
        panel: read("--creatine-panel", "#162127"),
        soft: read("--creatine-soft", "#1f2d34"),
        border: read("--creatine-border", "#34464c"),
        text: read("--creatine-text", "#eef6f1"),
        muted: read("--creatine-muted", "#9fb1aa"),
        orange: read("--creatine-orange", "#f59e0b"),
        cyan: read("--creatine-cyan", "#38bdf8"),
        red: read("--creatine-red", "#f87171"),
        green: read("--creatine-green", "#22c55e")
    };
}

function withAlpha(color, alpha) {
    const resolved = resolveCssColor(color);
    return `rgba(${resolved.r}, ${resolved.g}, ${resolved.b}, ${alpha})`;
}

function resolveCssColor(color) {
    const probe = document.createElement("span");
    probe.style.color = color;
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    const match = resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) return { r: 159, g: 177, b: 170 };
    return {
        r: Number(match[1]),
        g: Number(match[2]),
        b: Number(match[3])
    };
}

function renderValidationChecks() {
    const checks = evaluateCreatineChecks();
    dom.validationBody.innerHTML = checks.map((check) => `
        <tr>
            <td><span class="check-status ${check.status}">${check.status}</span></td>
            <td>
                <strong>${escapeHtml(check.title)}</strong>
                <span class="table-note-line">${renderReferenceLink(check.reference)}</span>
            </td>
            <td>
                <span>${escapeHtml(check.fixture || "")}</span>
                <span class="table-note-line">${escapeHtml(check.benchmark || "")}</span>
                <span class="table-note-line">${escapeHtml(check.detail)}</span>
            </td>
        </tr>
    `).join("");
}

function renderSourceAudit() {
    dom.sourceAuditBody.innerHTML = getAuditRows().map((row) => `
        <tr>
            <td>${escapeHtml(row.area)}</td>
            <td>
                <strong>${escapeHtml(row.claim)}</strong>
                <span class="table-note-line">${escapeHtml(row.implementation)}</span>
            </td>
            <td>
                <span>${escapeHtml(row.support)}</span>
                <span class="table-note-line">${row.sources.map(renderReferenceLink).join(", ")}</span>
            </td>
        </tr>
    `).join("");
}

function renderReferenceLink(reference) {
    if (!reference) return "";
    return `<a href="${escapeHtml(reference.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(reference.label)}</a>`;
}

function setStatus(message, type = "") {
    dom.statusLine.textContent = message;
    dom.statusLine.className = `status-line ${type}`.trim();
}

function formatG(value) {
    if (!Number.isFinite(value)) return "n/a";
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
}

function formatPercent(value) {
    if (!Number.isFinite(value)) return "n/a";
    return `${value.toFixed(1)}%`;
}

function formatVolumeL(value) {
    if (!Number.isFinite(value)) return "n/a";
    return value >= 1 ? `${value.toFixed(2)} L` : `${(value * 1000).toFixed(0)} mL`;
}

function formatDay(value) {
    return Number.isFinite(value) ? `day ${Math.round(value)}` : "not reached";
}

function formatElapsed(days, rangeDays = days) {
    if (!Number.isFinite(days)) return "n/a";
    if (rangeDays < 2) return `${(days * 24).toFixed(days * 24 >= 10 ? 0 : 1)} h`;
    return `${days.toFixed(days >= 10 ? 0 : 1)} d`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function schedulePersist() {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.clearTimeout(pendingPersistId);
    pendingPersistId = window.setTimeout(() => {
        pendingPersistId = null;
        persistSettingsToStorage();
    }, 200);
}

function buildSettingsPayload() {
    const snapshot = {};
    inputIds.forEach((id) => {
        const element = dom[id] || document.getElementById(id);
        if (!element) return;
        snapshot[id] = element.type === "checkbox" ? element.checked : element.value;
    });
    return {
        tool: "creatine-lab",
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
        inputs: snapshot
    };
}

function persistSettingsToStorage() {
    try {
        window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(buildSettingsPayload()));
    } catch (error) {
        setSettingsStatus("Could not save settings to this browser: " + (error?.message || "storage unavailable"), "error");
    }
}

function restoreSettingsFromStorage() {
    if (typeof window === "undefined" || !window.localStorage) return false;
    try {
        const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw) return false;
        const payload = JSON.parse(raw);
        if (!payload || payload.tool !== "creatine-lab" || payload.schemaVersion !== SETTINGS_SCHEMA_VERSION) return false;
        applySettingsSnapshot(payload.inputs || {});
        return true;
    } catch (error) {
        setSettingsStatus("Saved settings were unreadable and have been ignored.", "error");
        return false;
    }
}

function clearSettingsFromStorage() {
    try {
        window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
    } catch (_error) {
        // Storage may be disabled; safe to ignore.
    }
}

function applySettingsSnapshot(snapshot) {
    Object.entries(snapshot || {}).forEach(([id, value]) => {
        const element = dom[id] || document.getElementById(id);
        if (!element) return;
        if (element.type === "checkbox") {
            element.checked = Boolean(value);
        } else if (element.tagName === "SELECT") {
            element.value = String(value);
        } else {
            element.value = String(value);
        }
    });
}

function saveSettingsToFile() {
    try {
        if (pendingPersistId !== null) {
            window.clearTimeout(pendingPersistId);
            pendingPersistId = null;
        }
        persistSettingsToStorage();
        const payload = buildSettingsPayload();
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        link.href = url;
        link.download = `creatine-lab-settings-${stamp}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
        setSettingsStatus("Saved current settings to a JSON file.", "success");
    } catch (error) {
        setSettingsStatus("Could not save settings file: " + (error?.message || "unknown error"), "error");
    }
}

function handleSettingsFile(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const payload = JSON.parse(String(reader.result || ""));
            if (!payload || payload.tool !== "creatine-lab") {
                throw new Error("not a Creatine Lab settings file");
            }
            if (payload.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
                throw new Error(`unsupported schema version ${payload.schemaVersion}`);
            }
            applySettingsSnapshot(payload.inputs || {});
            updateAdvancedVisibility();
            recomputeNow();
            setSettingsStatus(`Loaded settings from ${file.name}.`, "success");
        } catch (error) {
            setSettingsStatus("Could not load settings file: " + (error?.message || "invalid JSON"), "error");
        } finally {
            input.value = "";
        }
    };
    reader.onerror = () => {
        setSettingsStatus("Could not read settings file.", "error");
        input.value = "";
    };
    reader.readAsText(file);
}

function setSettingsStatus(message, type = "") {
    if (!dom.settingsStatus) return;
    dom.settingsStatus.textContent = message;
    dom.settingsStatus.className = `settings-line ${type}`.trim();
    if (settingsStatusResetId) window.clearTimeout(settingsStatusResetId);
    if (type === "success" || type === "error") {
        settingsStatusResetId = window.setTimeout(() => {
            dom.settingsStatus.textContent = "Settings auto-save to this browser as you type.";
            dom.settingsStatus.className = "settings-line";
            settingsStatusResetId = null;
        }, 6000);
    }
}
