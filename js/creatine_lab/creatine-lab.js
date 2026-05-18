import { DEFAULT_MODEL_INPUTS, PRESET_INPUTS, runCreatineModel } from "./creatine-model.js";
import { evaluateCreatineChecks } from "./creatine-validation.js";
import { getAuditRows } from "./creatine-source-map.js";

const dom = {};
const INPUT_DEBOUNCE_MS = 350;
const EXPORT_SVG_WIDTH = 3200;
const EXPORT_SVG_HEIGHT = 1244;
let pendingRecomputeId = null;

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
    brainResponseHighPercent: "High end of the 20 g/day for 4 weeks brain tCr reference band."
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
    brainPoolValue: "Brain total-creatine estimate scaled from regional MRS concentration and brain mass.",
    brainResponseValue: "Reference brain tCr gain from a 20 g/day for 4 weeks study. It is not protocol-driven.",
    monteCarloBandValue: "10th to 90th percentile uncertainty band from seeded model draws.",
    steadyDoseValue: "Estimated creatine monohydrate dose needed to hold the current modeled pool, above the diet and endogenous baseline context."
});

const inputIds = [
    "doseG", "volumeValue", "volumeUnit", "temperatureValue", "temperatureUnit", "consumeFullSuspension",
    "storageMode", "storageTimeValue", "storageTimeUnit", "storageTemperatureValue", "storageTemperatureUnit",
    "phPreset", "customPh", "q10", "bodyMassKg", "bodyFatPercent", "fatFreeMassKg", "skeletalMuscleMassKg",
    "bodyPoolBasis", "baselinePoolG", "ffmToSmmFraction", "muscleCreatineGPerKg", "skeletalMuscleCreatineShare",
    "brainMassKg", "brainCreatineMm", "brainResponseLowPercent", "brainResponseTypicalPercent",
    "brainResponseHighPercent", "dietaryPattern", "endogenousGPerDay", "turnoverPercentPerDay",
    "protocolPreset", "customLoadingDoseG", "loadingDays", "maintenanceDoseG", "simulationDays",
    "baselineSaturationPercent", "retentionMax", "monteCarloDraws"
];

document.addEventListener("DOMContentLoaded", () => {
    cacheDom();
    addHelpTooltips();
    bindEvents();
    applyInputs(DEFAULT_MODEL_INPUTS);
    updateAdvancedVisibility();
    recompute();
    renderValidationChecks();
    renderSourceAudit();
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
        "monteCarloBandMeta", "steadyDoseValue", "steadyDoseMeta", "warningList", "thresholdBody", "validationBody", "storageLossChart",
        "storageLossChartSummary", "accumulationChart", "chartSummary", "exportPlotBtn", "sourceModelNote", "sourceAuditBody"
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
        setStatus("Reset to default bottle scenario.");
    });

    dom.exportPlotBtn?.addEventListener("click", exportAccumulationPlot);

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

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeHelpTooltips();
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

function handleInput() {
    updateAdvancedVisibility();
    scheduleRecompute();
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
        turnoverFractionPerDay: Number(dom.turnoverPercentPerDay.value) / 100,
        protocolPreset: dom.protocolPreset.value,
        customLoadingDoseG: dom.customLoadingDoseG.value,
        loadingDays: dom.loadingDays.value,
        maintenanceDoseG: dom.maintenanceDoseG.value,
        simulationDays: dom.simulationDays.value,
        baselineSaturationPercent: dom.baselineSaturationPercent.value,
        retentionMax: dom.retentionMax.value,
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

function renderAccumulation({ accumulation, monteCarlo }) {
    const turnoverFraction = accumulation.baselinePoolG > 0
        ? accumulation.baselineTurnoverG / accumulation.baselinePoolG
        : 0;
    const currentTurnoverG = accumulation.final.poolG * turnoverFraction;
    dom.bodyFinalPoolValue.textContent = `${formatG(accumulation.final.poolG)} g`;
    dom.bodyFinalPoolMeta.textContent = `cap ${formatG(accumulation.poolCapG)} g from baseline ${formatG(accumulation.baselinePoolG)} g at ${formatPercent(accumulation.baselineSaturationFraction * 100)} baseline saturation`;
    dom.bodySaturationValue.textContent = `${formatPercent(accumulation.final.percentSaturation)}`;
    dom.bodySaturationMeta.textContent = `day ${accumulation.final.day}, supplement gap filled ${formatPercent(accumulation.final.supplementGapFilledPercent)}, retained supplement ${formatG(accumulation.final.retainedSupplementG)} g; turnover ${formatG(accumulation.baselineTurnoverG)} g/day baseline, ${formatG(currentTurnoverG)} g/day current; diet + endogenous context ${formatG(accumulation.backgroundInputGPerDay)} g/day`;
    dom.wastePressureValue.textContent = `${formatG(accumulation.final.wastePressureCrMG)} g/day`;
    dom.wastePressureMeta.textContent = `10-90% range ${formatG(monteCarlo.final.wastePressureP10)} to ${formatG(monteCarlo.final.wastePressureP90)} g/day; likely not stored beyond the modeled cap`;
    dom.monteCarloBandValue.textContent = `${formatPercent(monteCarlo.final.saturationP10)} to ${formatPercent(monteCarlo.final.saturationP90)}`;
    dom.monteCarloBandMeta.textContent = `10-90% estimated saturation envelope, median ${formatPercent(monteCarlo.final.saturationMedian)}, ${monteCarlo.drawCount} seeded draws`;
    dom.steadyDoseValue.textContent = `${formatG(monteCarlo.final.steadyDoseP10)} to ${formatG(monteCarlo.final.steadyDoseP90)} g/day`;
    dom.steadyDoseMeta.textContent = `centerline ${formatG(accumulation.final.steadyStateDoseCrMG)} g/day to hold day ${accumulation.final.day} pool; diet + endogenous context ${formatG(accumulation.backgroundInputGPerDay)} g/day`;

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
    dom.brainPoolMeta.textContent = `${formatG(brain.brainCreatineMm)} mM regional MRS estimate scaled to ${formatG(brain.brainMassKg)} kg brain mass`;
    dom.brainResponseValue.textContent = `${formatG(brain.responseTypicalGainG)} g`;
    dom.brainResponseMeta.textContent = `20 g/day for 4 weeks reference: ${formatPercent(brain.responseLowPercent)} to ${formatPercent(brain.responseHighPercent)}; does not change when protocol changes`;
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

function exportAccumulationPlot() {
    if (!dom.accumulationChart) return;

    const clone = dom.accumulationChart.cloneNode(true);
    clone.querySelectorAll(".chart-hover").forEach((hover) => hover.remove());
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(EXPORT_SVG_WIDTH));
    clone.setAttribute("height", String(EXPORT_SVG_HEIGHT));
    clone.setAttribute("role", "img");
    clone.setAttribute("aria-label", "Exported Creatine Lab saturation and dose pressure plot");

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = "Creatine Lab saturation and dose pressure plot";
    clone.insertBefore(title, clone.firstChild);

    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = getExportChartCss();
    clone.insertBefore(style, clone.children[1] || null);

    const svgText = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`;
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "creatine-lab-saturation-dose-pressure.svg";
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
        .chart-label { fill: var(--creatine-muted); font: 700 12px "JetBrains Mono", monospace; }
        .chart-steady-label, .chart-legend.steady { fill: var(--creatine-cyan); }
        .chart-legend { fill: var(--creatine-muted); font: 800 11px "JetBrains Mono", monospace; }
        .chart-legend.saturation { fill: var(--creatine-orange); }
        .chart-legend.waste { fill: var(--creatine-red); }
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
        red: read("--creatine-red", "#f87171")
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
