import { bindControls } from "./pid-controls.js";
import { exportCsv, exportJson } from "./pid-export.js";
import {
    renderBodeMagnitudeChart,
    renderBodePhaseChart,
    renderOutputChart,
    renderProcessChart
} from "./pid-charts.js";
import {
    getExercise,
    listExercises
} from "./pid-exercises.js";
import { lookupGlossary } from "./pid-glossary.js";
import {
    classifyRegime,
    getProcessPreset,
    getScenarioPreset,
    getTuningRule
} from "./pid-presets.js";
import { createDefaultConfig, mergePatch } from "./pid-state.js";
import { getWasmVersion, runSimulation } from "./pid-wasm-loader.js";
import { validateConfig } from "./pid-validation.js";

const config = createDefaultConfig();
let currentResult = null;
let runTimer = null;
let renderTimer = null;
let requestId = 0;
let lastTuningReadout = null;
let activeProcessPreset = "educational-fopdt";
let activeExercise = null;
let activeExerciseStep = 0;

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
    elements.status = document.getElementById("statusBanner");
    elements.actionWarning = document.getElementById("actionWarning");
    elements.tuningReadout = document.getElementById("tuningReadout");
    elements.trackingTimeField = document.getElementById("trackingTimeField");
    elements.pvChart = document.getElementById("pvChart");
    elements.outputChart = document.getElementById("outputChart");
    elements.bodeMagnitudeChart = document.getElementById("bodeMagnitudeChart");
    elements.bodePhaseChart = document.getElementById("bodePhaseChart");
    elements.buildMetadata = document.getElementById("buildMetadata");
    elements.exportJson = document.getElementById("exportJsonBtn");
    elements.exportCsv = document.getElementById("exportCsvBtn");
    elements.narrativeHeading = document.getElementById("narrativeHeading");
    elements.narrativeInterpretation = document.getElementById("narrativeInterpretation");
    elements.narrativeDynamics = document.getElementById("narrativeDynamics");
    elements.narrativeLookFor = document.getElementById("narrativeLookFor");
    elements.narrativeRecommendation = document.getElementById("narrativeRecommendation");
    elements.narrativeCautions = document.getElementById("narrativeCautions");
    elements.regimeBanner = document.getElementById("regimeBanner");
    elements.regimeDynamics = document.getElementById("regimeDynamics");
    elements.regimeRobustness = document.getElementById("regimeRobustness");
    elements.regimeRecommendation = document.getElementById("regimeRecommendation");
    elements.pvChartHeader = document.getElementById("pvChartHeader");
    elements.outputChartHeader = document.getElementById("outputChartHeader");
    elements.pvLegendItem = document.getElementById("pvLegendItem");
    elements.outputLegendItem = document.getElementById("outputLegendItem");
    elements.tuningButtons = Array.from(document.querySelectorAll("[data-tuning-rule]"));
    elements.exerciseGrid = document.getElementById("exerciseGrid");
    elements.exerciseActive = document.getElementById("exerciseActive");
    elements.exerciseStepIndex = document.getElementById("exerciseStepIndex");
    elements.exerciseStepHeading = document.getElementById("exerciseStepHeading");
    elements.exerciseStepDetail = document.getElementById("exerciseStepDetail");
    elements.exercisePrevBtn = document.getElementById("exercisePrevBtn");
    elements.exerciseNextBtn = document.getElementById("exerciseNextBtn");
    elements.exerciseApplyBtn = document.getElementById("exerciseApplyBtn");
    elements.exerciseCancelBtn = document.getElementById("exerciseCancelBtn");
    elements.exerciseConclusion = document.getElementById("exerciseConclusion");
    elements.exerciseApplyHint = document.getElementById("exerciseApplyHint");
    elements.glossaryPanel = document.getElementById("glossaryPanel");
    elements.glossaryTitle = document.getElementById("glossaryTitle");
    elements.glossaryBody = document.getElementById("glossaryBody");
    elements.glossaryCloseBtn = document.getElementById("glossaryCloseBtn");
    elements.expandAllBtn = document.getElementById("expandAllBtn");
    elements.collapseAllBtn = document.getElementById("collapseAllBtn");
    elements.resetLayoutBtn = document.getElementById("resetLayoutBtn");

    renderNarrativeForPreset(activeProcessPreset);
    renderExerciseList();
    wireGlossary();
    wireFoldToolbar();

    bindControls(
        document,
        config,
        (event) => {
            if (event.kind !== "preset" && event.kind !== "tuning-rule"
                && event.kind !== "process-preset" && event.kind !== "scenario-preset") {
                lastTuningReadout = null;
                hideTuningReadout();
            }
            if (event.kind === "process-preset") {
                activeProcessPreset = event.preset;
                renderNarrativeForPreset(activeProcessPreset);
                // Keep the Reset-tuning button pointed at the new plant.
                const resetBtn = document.getElementById("resetTuningBtn");
                if (resetBtn) {
                    resetBtn.dataset.activePreset = activeProcessPreset;
                    const recId = getProcessPreset(activeProcessPreset)?.narrative?.recommendedTuningIds?.[0];
                    const rule = recId ? getTuningRule(recId) : null;
                    resetBtn.textContent = rule
                        ? `Reset tuning (${rule.label})`
                        : "Reset tuning to recommended";
                }
                // A process preset is a clean-slate switch in terms of the
                // plant model. If a guided exercise was in progress, abandon
                // it so its step panel doesn't show stale text against the
                // new plant.
                if (activeExercise) {
                    exitExercise();
                }
            }
            updateDerivedDisplays();
            refreshTuningPreviews();
            scheduleSimulation();
        },
        (event) => {
            if (event.kind === "tuning") {
                lastTuningReadout = `${event.label}: ${event.detail}`;
                showTuningReadout(lastTuningReadout);
                setStatus("loading", `${event.label} tuning applied. Recomputing simulation...`);
            } else if (event.kind === "tuning-error") {
                showTuningReadout(`${event.label}: ${event.detail}`, true);
                setStatus("error", `${event.label} tuning failed: ${event.detail}`);
            } else if (event.kind === "process") {
                lastTuningReadout = null;
                hideTuningReadout();
                const tuningSuffix = event.appliedRule
                    ? ` ${event.appliedRule} auto-applied for this plant.`
                    : "";
                setStatus("loading", `${event.label} process loaded.${tuningSuffix} Recomputing simulation...`);
            } else if (event.kind === "scenario") {
                setStatus("loading", `${event.label} scenario loaded. Recomputing simulation...`);
            }
        }
    );

    refreshTuningPreviews();

    if (elements.exercisePrevBtn) {
        elements.exercisePrevBtn.addEventListener("click", () => advanceExercise(-1));
    }
    if (elements.exerciseNextBtn) {
        elements.exerciseNextBtn.addEventListener("click", () => advanceExercise(1));
    }
    if (elements.exerciseApplyBtn) {
        elements.exerciseApplyBtn.addEventListener("click", () => applyCurrentStep());
    }
    if (elements.exerciseCancelBtn) {
        elements.exerciseCancelBtn.addEventListener("click", () => exitExercise());
    }

    elements.exportJson.addEventListener("click", () => {
        if (currentResult) {
            exportJson(currentResult);
        }
    });

    elements.exportCsv.addEventListener("click", () => {
        if (currentResult) {
            exportCsv(currentResult);
        }
    });

    window.addEventListener("resize", () => {
        window.clearTimeout(renderTimer);
        renderTimer = window.setTimeout(() => renderCharts(), 120);
    });

    updateDerivedDisplays();
    loadBuildMetadata();
    runSimulationNow("Default simulation ready.");
});

function scheduleSimulation() {
    window.clearTimeout(runTimer);
    setStatus("loading", "Inputs changed. Recomputing simulation...");
    runTimer = window.setTimeout(() => runSimulationNow("Simulation updated."), 90);
}

async function runSimulationNow(message) {
    const validation = validateConfig(config);
    if (!validation.ok) {
        currentResult = null;
        setStatus("error", validation.errors.join(" "));
        return;
    }

    const id = ++requestId;
    setStatus("loading", "Running WASM simulation...");

    try {
        const result = await runSimulation(config);
        if (id !== requestId) {
            return;
        }
        currentResult = result;
        renderMetrics(result.metrics);
        renderMargins(result.frequency_response.margins);
        renderRegime(result.frequency_response.margins);
        renderCharts();
        setStatus("ready", message);
        elements.exportJson.disabled = false;
        elements.exportCsv.disabled = false;
        window.pidPlayground = {
            getConfig: () => JSON.parse(JSON.stringify(config)),
            getResult: () => currentResult
        };
    } catch (error) {
        currentResult = null;
        elements.exportJson.disabled = true;
        elements.exportCsv.disabled = true;
        setStatus("error", `WASM load or simulation failed: ${error.message}`);
    }
}

function renderCharts() {
    if (!currentResult) {
        return;
    }
    const axes = currentAxisMetadata();
    renderProcessChart(elements.pvChart, currentResult, axes);
    renderOutputChart(elements.outputChart, currentResult, axes);
    if (elements.bodeMagnitudeChart) {
        renderBodeMagnitudeChart(elements.bodeMagnitudeChart, currentResult, {
            tau: config.model.tau,
            deadTime: config.model.dead_time
        });
    }
    if (elements.bodePhaseChart) {
        renderBodePhaseChart(elements.bodePhaseChart, currentResult, {
            tau: config.model.tau,
            deadTime: config.model.dead_time
        });
    }
}

function currentAxisMetadata() {
    const preset = getProcessPreset(activeProcessPreset);
    const units = preset?.narrative?.units || {};
    return {
        pvAxis: units.pvAxis || "Process variable",
        outputAxis: units.outputAxis || "Controller output / load",
        pvLegend: units.pvLegend || "PV",
        outputLegend: units.outputLegend || "Output",
        pvUnit: units.pv || "",
        outputUnit: units.output || ""
    };
}

function renderNarrativeForPreset(presetId) {
    const preset = getProcessPreset(presetId);
    if (!preset || !preset.narrative) {
        return;
    }
    const narrative = preset.narrative;
    setText("narrativeHeading", preset.label);
    setText("narrativeInterpretation", narrative.interpretation || "");
    setText("narrativeDynamics", narrative.dominantDynamics || "");
    setText("narrativeLookFor", narrative.lookFor || "");
    setText("narrativeRecommendation", narrative.recommendedTuning || "");
    setText("narrativeCautions", narrative.cautions || "");
    const axes = currentAxisMetadata();
    if (elements.pvLegendItem) {
        elements.pvLegendItem.textContent = axes.pvLegend;
    }
    if (elements.outputLegendItem) {
        elements.outputLegendItem.textContent = axes.outputLegend;
    }
    highlightRecommendedTuning(narrative.recommendedTuningIds || []);
}

function highlightRecommendedTuning(recommendedIds) {
    if (!elements.tuningButtons) {
        return;
    }
    const set = new Set(recommendedIds);
    elements.tuningButtons.forEach((button) => {
        if (set.has(button.dataset.tuningRule)) {
            button.classList.add("recommended");
            if (button.dataset.tuningRule === recommendedIds[0]) {
                button.classList.add("recommended-primary");
            } else {
                button.classList.remove("recommended-primary");
            }
        } else {
            button.classList.remove("recommended");
            button.classList.remove("recommended-primary");
        }
    });
}

function renderRegime(margins) {
    if (!elements.regimeBanner) {
        return;
    }
    const regime = classifyRegime(config, margins);
    elements.regimeBanner.hidden = false;
    setText("regimeDynamics", `${capitalize(regime.dynamics)} (theta/tau = ${regime.thetaOverTau.toFixed(2)})`);
    setText("regimeRobustness", regime.robustnessHint);
    setText("regimeRecommendation", `Recommended: ${regime.recommendation}`);
}

function refreshTuningPreviews() {
    if (!elements.tuningButtons) {
        return;
    }
    elements.tuningButtons.forEach((button) => {
        const ruleId = button.dataset.tuningRule;
        if (!button.dataset.previewBase) {
            button.dataset.previewBase = button.title || button.textContent;
        }
        const preview = computeTuningPreview(ruleId);
        if (preview) {
            button.title = `${button.dataset.previewBase}\nFor this plant: ${preview}`;
        } else {
            button.title = button.dataset.previewBase;
        }
    });
}

function computeTuningPreview(ruleId) {
    const rule = getTuningRule(ruleId);
    if (!rule) {
        return null;
    }
    try {
        const result = rule.compute(config);
        if (!Number.isFinite(result.kp) || !Number.isFinite(result.ki) || !Number.isFinite(result.kd)) {
            return "Singular for this plant (check K, tau, theta).";
        }
        const parts = [
            `Kp = ${formatPreview(result.kp)}`,
            `Ki = ${formatPreview(result.ki)}`
        ];
        if (Math.abs(result.kd) > 1e-9) {
            parts.push(`Kd = ${formatPreview(result.kd)}`);
        }
        if (Number.isFinite(result.Ti) && result.Ti > 0) {
            parts.push(`Ti = ${formatPreview(result.Ti)} s`);
        }
        if (Number.isFinite(result.Td) && result.Td > 0) {
            parts.push(`Td = ${formatPreview(result.Td)} s`);
        }
        return parts.join(", ");
    } catch {
        return null;
    }
}

function formatPreview(value) {
    if (!Number.isFinite(value)) {
        return "n/a";
    }
    if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) {
        return value.toExponential(2);
    }
    return Number.parseFloat(value.toFixed(3)).toString();
}

function capitalize(text) {
    if (!text) {
        return text;
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function renderExerciseList() {
    if (!elements.exerciseGrid) {
        return;
    }
    const items = listExercises();
    elements.exerciseGrid.innerHTML = "";
    items.forEach((item) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "preset-btn";
        button.dataset.exercise = item.id;
        button.title = item.summary;
        button.textContent = item.title.replace(/^Exercise \d+: /, "Ex. ").trim();
        button.addEventListener("click", () => startExercise(item.id));
        elements.exerciseGrid.appendChild(button);
    });
}

function startExercise(id) {
    const exercise = getExercise(id);
    if (!exercise) {
        return;
    }
    // Selecting an exercise is a clean-slate entry point. Step 1 is the
    // exercise's starting state and is auto-applied so the user has a
    // known baseline. Later steps (2+) display their instructions and the
    // user is expected to try the change with the sliders themselves,
    // then click "Apply step values" if they want to see the canonical
    // answer.
    if (!window.confirm(`Start the "${exercise.title}" exercise?\n\nThis replaces your current controller, model, and scenario settings to set up the exercise. Next/Previous only navigate the steps - clicking those does NOT auto-apply the new gains.`)) {
        return;
    }
    activeExercise = exercise;
    activeExerciseStep = 0;
    elements.exerciseActive.hidden = false;
    elements.exerciseConclusion.hidden = true;
    showStepText();
    applyCurrentStep(); // baseline auto-apply for step 1
}

function exitExercise() {
    activeExercise = null;
    activeExerciseStep = 0;
    if (elements.exerciseActive) {
        elements.exerciseActive.hidden = true;
    }
    if (elements.exerciseConclusion) {
        elements.exerciseConclusion.hidden = true;
    }
}

function advanceExercise(delta) {
    if (!activeExercise) {
        return;
    }
    const nextIndex = activeExerciseStep + delta;
    if (nextIndex < 0) {
        return;
    }
    if (nextIndex >= activeExercise.steps.length) {
        showExerciseConclusion();
        return;
    }
    activeExerciseStep = nextIndex;
    // Navigation only: do NOT apply the step's gain changes. The user
    // reads the instructions and chooses to tune manually or click Apply.
    showStepText();
}

function showStepText() {
    if (!activeExercise) {
        return;
    }
    const step = activeExercise.steps[activeExerciseStep];
    if (!step) {
        return;
    }
    setText("exerciseStepIndex", `Step ${activeExerciseStep + 1} of ${activeExercise.steps.length}`);
    setText("exerciseStepHeading", step.heading || activeExercise.title);
    setText("exerciseStepDetail", step.detail || "");

    if (elements.exercisePrevBtn) {
        elements.exercisePrevBtn.disabled = activeExerciseStep === 0;
    }
    if (elements.exerciseNextBtn) {
        elements.exerciseNextBtn.textContent = activeExerciseStep + 1 >= activeExercise.steps.length
            ? "Finish"
            : "Next";
        elements.exerciseNextBtn.disabled = false;
    }
    if (elements.exerciseApplyBtn) {
        elements.exerciseApplyBtn.disabled = false;
    }
    elements.exerciseConclusion.hidden = true;
}

function applyCurrentStep() {
    if (!activeExercise) {
        return;
    }
    const step = activeExercise.steps[activeExerciseStep];
    if (!step) {
        return;
    }

    if (step.processPreset) {
        const preset = getProcessPreset(step.processPreset);
        if (preset) {
            mergePatch(config, preset.patch);
            activeProcessPreset = step.processPreset;
            renderNarrativeForPreset(activeProcessPreset);
            const resetBtn = document.getElementById("resetTuningBtn");
            if (resetBtn) {
                resetBtn.dataset.activePreset = activeProcessPreset;
            }
        }
    }
    if (step.scenarioPreset) {
        const preset = getScenarioPreset(step.scenarioPreset);
        if (preset) {
            mergePatch(config, preset.patch);
        }
    }
    if (step.applyTuning) {
        const rule = getTuningRule(step.applyTuning);
        if (rule) {
            const result = rule.compute(config);
            if (Number.isFinite(result.kp) && Number.isFinite(result.ki) && Number.isFinite(result.kd)) {
                mergePatch(config, {
                    controller: {
                        kp: round6(result.kp),
                        ki: round6(result.ki),
                        kd: round6(result.kd)
                    }
                });
            }
        }
    }
    if (step.multiplyController) {
        // Multiply the *current* controller fields by the given factors. Used
        // for "double the gains" style steps so you can see what 2x your
        // current value looks like even if you already nudged sliders.
        const next = {};
        Object.entries(step.multiplyController).forEach(([key, factor]) => {
            const current = config.controller[key];
            if (Number.isFinite(current) && Number.isFinite(factor)) {
                next[key] = round6(current * factor);
            }
        });
        if (Object.keys(next).length > 0) {
            mergePatch(config, { controller: next });
        }
    }
    if (step.patch) {
        mergePatch(config, step.patch);
    }

    syncInputsToConfig();
    refreshTuningPreviews();
    updateDerivedDisplays();
    scheduleSimulation();
}

function showExerciseConclusion() {
    if (!activeExercise) {
        return;
    }
    if (elements.exerciseConclusion) {
        elements.exerciseConclusion.hidden = false;
        elements.exerciseConclusion.textContent = activeExercise.conclusion || "Exercise complete.";
    }
    if (elements.exerciseNextBtn) {
        elements.exerciseNextBtn.textContent = "Done";
        elements.exerciseNextBtn.disabled = true;
    }
}

function syncInputsToConfig() {
    document.querySelectorAll("[data-bind]").forEach((input) => {
        const path = input.dataset.bind;
        const value = path.split(".").reduce((cursor, segment) => cursor?.[segment], config);
        if (value === undefined || value === null) {
            return;
        }
        if (input.tagName === "SELECT") {
            input.value = String(value);
            return;
        }
        if (typeof value === "number") {
            input.value = formatInputNumber(value);
        } else {
            input.value = String(value);
        }
    });
}

function formatInputNumber(value) {
    if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
        return value.toPrecision(6);
    }
    return Number.parseFloat(value.toFixed(6)).toString();
}

function round6(value) {
    return Math.round(value * 1e6) / 1e6;
}

function wireGlossary() {
    if (!elements.glossaryPanel || !elements.glossaryCloseBtn) {
        return;
    }
    elements.glossaryCloseBtn.addEventListener("click", () => closeGlossary());
    document.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        const term = target.closest(".term[data-help]");
        if (!term) {
            return;
        }
        // Only hijack the click when the user double-taps via Shift+click or
        // when the term has data-glossary set explicitly. Otherwise leave the
        // tooltip behavior unchanged.
        if (!(event.shiftKey || term.dataset.glossary)) {
            return;
        }
        event.preventDefault();
        const key = term.dataset.glossary || term.textContent || "";
        openGlossary(key);
    });
}

function openGlossary(termKey) {
    const entry = lookupGlossary(termKey);
    if (!elements.glossaryPanel) {
        return;
    }
    elements.glossaryPanel.hidden = false;
    elements.glossaryPanel.classList.add("is-open");
    elements.glossaryPanel.setAttribute("aria-hidden", "false");
    if (entry) {
        elements.glossaryTitle.textContent = entry.title;
        elements.glossaryBody.textContent = entry.body;
    } else {
        elements.glossaryTitle.textContent = "Glossary";
        elements.glossaryBody.textContent = `No glossary entry for "${termKey}". Shift-click a term like PM, Ms, K, tau, or Kp to view its physical interpretation.`;
    }
}

function closeGlossary() {
    if (!elements.glossaryPanel) {
        return;
    }
    elements.glossaryPanel.classList.remove("is-open");
    elements.glossaryPanel.setAttribute("aria-hidden", "true");
    elements.glossaryPanel.hidden = true;
}

function wireFoldToolbar() {
    if (elements.expandAllBtn) {
        elements.expandAllBtn.addEventListener("click", () => setAllPanels("open"));
    }
    if (elements.collapseAllBtn) {
        elements.collapseAllBtn.addEventListener("click", () => setAllPanels("closed"));
    }
    if (elements.resetLayoutBtn) {
        elements.resetLayoutBtn.addEventListener("click", () => setAllPanels("default"));
    }
    // The Bode / PV / Output canvases are sized off their bounding rect, so a
    // canvas inside a closed <details> renders at zero dimensions. Re-render
    // when any plot panel opens.
    document.querySelectorAll("details.foldable").forEach((panel) => {
        panel.addEventListener("toggle", () => {
            if (panel.open && (panel.contains(elements.pvChart)
                || panel.contains(elements.outputChart)
                || panel.contains(elements.bodeMagnitudeChart)
                || panel.contains(elements.bodePhaseChart))) {
                window.requestAnimationFrame(() => renderCharts());
            }
        });
    });
}

function setAllPanels(mode) {
    document.querySelectorAll("details.foldable").forEach((panel) => {
        let target;
        if (mode === "open") {
            target = true;
        } else if (mode === "closed") {
            target = false;
        } else {
            target = panel.dataset.panelDefault !== "closed";
        }
        if (panel.open !== target) {
            panel.open = target;
        }
    });
    window.requestAnimationFrame(() => renderCharts());
}

function renderMetrics(metrics) {
    setText("overshootMetric", `${formatNumber(metrics.overshoot_percent, 2)}%`);
    setText("riseTimeMetric", formatOptionalSeconds(metrics.rise_time));
    setText("settlingTimeMetric", formatOptionalSeconds(metrics.settling_time));
    setText("steadyStateErrorMetric", formatNumber(metrics.steady_state_error, 4));
    setText("iaeMetric", formatNumber(metrics.iae, 2));
    setText("iseMetric", formatNumber(metrics.ise, 2));
    setText("itaeMetric", formatNumber(metrics.itae, 2));
    setText("saturationMetric", `${formatNumber(metrics.saturation_percent, 2)}%`);
    setText("maxPvMetric", formatNumber(metrics.max_pv, 3));
    setText("minPvMetric", formatNumber(metrics.min_pv, 3));
    setText("maxOutputMetric", formatNumber(metrics.max_output, 3));
    setText("minOutputMetric", formatNumber(metrics.min_output, 3));
    setText("settledMetric", metrics.settled ? "yes" : "no");
    setText("finalPvMetric", formatNumber(metrics.final_pv, 3));
    setText("finalOutputMetric", formatNumber(metrics.final_output, 3));
}

function renderMargins(margins) {
    setText("phaseMarginMetric", formatOptionalUnits(margins.phase_margin_deg, "deg", 1));
    setText("gainMarginMetric", formatOptionalUnits(margins.gain_margin_db, "dB", 1));
    setText("sensitivityPeakMetric", formatNumber(margins.sensitivity_peak, 2));
    setText("gainCrossoverMetric", formatOptionalUnits(margins.gain_crossover_omega, "rad/s", 3));
}

function updateDerivedDisplays() {
    const { kp, ki, kd, anti_windup } = config.controller;
    const Ti = ki !== 0 ? kp / ki : null;
    const Td = kp !== 0 ? kd / kp : null;
    setText("kpReadout", formatReadout("Ti", Ti, "s"));
    setText("kiReadout", "");
    setText("kdReadout", formatReadout("Td", Td, "s"));

    if (elements.trackingTimeField) {
        elements.trackingTimeField.style.display = anti_windup === "back_calculation" ? "" : "none";
    }

    updateActionWarning();
}

function updateActionWarning() {
    const K = config.model.process_gain;
    const Kp = config.controller.kp;
    if (!Number.isFinite(K) || !Number.isFinite(Kp) || Math.abs(K) < 1e-12 || Math.abs(Kp) < 1e-12) {
        elements.actionWarning.hidden = true;
        return;
    }
    elements.actionWarning.hidden = Math.sign(K) === Math.sign(Kp);
}

function setStatus(kind, text) {
    elements.status.className = `status-banner ${kind}`;
    elements.status.textContent = text;
}

function showTuningReadout(text, isError = false) {
    elements.tuningReadout.hidden = false;
    elements.tuningReadout.textContent = text;
    elements.tuningReadout.classList.toggle("error", Boolean(isError));
}

function hideTuningReadout() {
    elements.tuningReadout.hidden = true;
    elements.tuningReadout.textContent = "";
    elements.tuningReadout.classList.remove("error");
}

async function loadBuildMetadata() {
    try {
        const [metadataResponse, wasmVersion] = await Promise.all([
            fetch("../js/pid_playground/pid-build.json", { cache: "no-store" }),
            getWasmVersion()
        ]);
        const metadata = metadataResponse.ok ? await metadataResponse.json() : null;
        const buildId = metadata?.build_id || "local-dev";
        elements.buildMetadata.textContent = `WASM package ${wasmVersion}; build ${buildId}; schema v2.`;
    } catch {
        elements.buildMetadata.textContent = "Build metadata unavailable; WASM package pending or running from source.";
    }
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
    }
}

function formatOptionalSeconds(value) {
    return value === null || value === undefined ? "--" : `${formatNumber(value, 2)} s`;
}

function formatOptionalUnits(value, unit, digits) {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return "--";
    }
    return `${formatNumber(value, digits)} ${unit}`;
}

function formatNumber(value, digits) {
    if (!Number.isFinite(value)) {
        return "--";
    }
    if (Math.abs(value) >= 10000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
        return value.toExponential(2);
    }
    return Number.parseFloat(value.toFixed(digits)).toString();
}

function formatReadout(label, value, unit) {
    if (value === null || !Number.isFinite(value) || value <= 0) {
        return "";
    }
    return `${label} = ${formatNumber(value, 3)} ${unit}`;
}
