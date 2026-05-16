import { getPath, mergePatch, setPath } from "./pid-state.js";
import {
    getProcessPreset,
    getScenarioPreset,
    getTuningRule
} from "./pid-presets.js";

export function bindControls(root, config, onChange, onPresetApplied) {
    const boundInputs = Array.from(root.querySelectorAll("[data-bind]"));
    const processButtons = Array.from(root.querySelectorAll("[data-process-preset]"));
    const scenarioButtons = Array.from(root.querySelectorAll("[data-scenario-preset]"));
    const tuningButtons = Array.from(root.querySelectorAll("[data-tuning-rule]"));

    function syncAll() {
        boundInputs.forEach((input) => writeInput(input, getPath(config, input.dataset.bind)));
    }

    function syncPath(path) {
        boundInputs
            .filter((input) => input.dataset.bind === path)
            .forEach((input) => writeInput(input, getPath(config, path)));
    }

    boundInputs.forEach((input) => {
        const eventName = input.tagName === "SELECT"
            ? "change"
            : input.type === "range" || input.type === "checkbox"
                ? "input"
                : "change";
        input.addEventListener(eventName, () => {
            const value = readInput(input);
            if (value === null) {
                return;
            }
            setPath(config, input.dataset.bind, value);
            syncPath(input.dataset.bind);
            onChange({ kind: "input", path: input.dataset.bind });
        });

        if (input.type === "number") {
            input.addEventListener("input", () => {
                const value = readInput(input);
                if (value === null) {
                    return;
                }
                setPath(config, input.dataset.bind, value);
                syncPath(input.dataset.bind);
                onChange({ kind: "input", path: input.dataset.bind });
            });
        }
    });

    processButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const preset = getProcessPreset(button.dataset.processPreset);
            if (!preset) {
                return;
            }
            // Loading a Process Narrative changes the plant, scenario, and
            // plant-specific controller framing (output limits, bias, Tf), but
            // it does NOT auto-tune Kp/Ki/Kd. Tuning is the user's job. Use
            // the "Reset tuning" button if you want the recommended rule
            // applied for the current plant.
            if (!window.confirm(`Load the "${preset.label}" plant?\n\nThis changes the plant model, scenario, and plant-specific framing (output limits, bias, derivative filter). Your current Kp / Ki / Kd will be kept - tune them yourself, or use "Reset tuning" to apply the recommended rule for this plant.`)) {
                return;
            }
            const patch = scopedPlantPatch(preset.patch);
            mergePatch(config, patch);
            syncAll();
            onPresetApplied({
                kind: "process",
                label: preset.label,
                recommendedTuningIds: preset.narrative?.recommendedTuningIds || []
            });
            onChange({ kind: "process-preset", preset: button.dataset.processPreset });
        });
    });

    // "Reset tuning" button: applies the first recommended tuning rule to
    // the *current* plant. This is the only path that auto-tunes from a
    // process preset; selecting a preset itself no longer changes Kp/Ki/Kd.
    const resetTuningButton = root.querySelector("[data-reset-tuning]");
    if (resetTuningButton) {
        resetTuningButton.addEventListener("click", () => {
            const presetId = resetTuningButton.dataset.activePreset || "educational-fopdt";
            const preset = getProcessPreset(presetId);
            const recommendedId = preset?.narrative?.recommendedTuningIds?.[0];
            const rule = recommendedId ? getTuningRule(recommendedId) : null;
            if (!rule) {
                onPresetApplied({
                    kind: "tuning-error",
                    label: "Reset tuning",
                    detail: "No recommended rule defined for this plant."
                });
                return;
            }
            try {
                const result = rule.compute(config);
                if (!Number.isFinite(result.kp) || !Number.isFinite(result.ki) || !Number.isFinite(result.kd)) {
                    onPresetApplied({
                        kind: "tuning-error",
                        label: "Reset tuning",
                        detail: `${rule.label} gives a singular tuning for this plant.`
                    });
                    return;
                }
                mergePatch(config, {
                    controller: {
                        kp: round(result.kp, 6),
                        ki: round(result.ki, 6),
                        kd: round(result.kd, 6)
                    }
                });
                syncAll();
                onPresetApplied({
                    kind: "tuning",
                    label: `Reset tuning (${rule.label})`,
                    detail: formatTuningDetail(result)
                });
                onChange({ kind: "tuning-rule", rule: recommendedId });
            } catch (error) {
                onPresetApplied({
                    kind: "tuning-error",
                    label: "Reset tuning",
                    detail: String(error.message || error)
                });
            }
        });
    }

    scenarioButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const preset = getScenarioPreset(button.dataset.scenarioPreset);
            if (!preset) {
                return;
            }
            mergePatch(config, preset.patch);
            syncAll();
            onPresetApplied({ kind: "scenario", label: preset.label });
            onChange({ kind: "scenario-preset", preset: button.dataset.scenarioPreset });
        });
    });

    tuningButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const rule = getTuningRule(button.dataset.tuningRule);
            if (!rule) {
                return;
            }
            const result = rule.compute(config);
            if (!Number.isFinite(result.kp) || !Number.isFinite(result.ki) || !Number.isFinite(result.kd)) {
                onPresetApplied({
                    kind: "tuning-error",
                    label: rule.label,
                    detail: "Process model gives a singular tuning (check dead time, tau, gain)."
                });
                return;
            }
            mergePatch(config, {
                controller: {
                    kp: round(result.kp, 6),
                    ki: round(result.ki, 6),
                    kd: round(result.kd, 6)
                }
            });
            syncAll();
            onPresetApplied({
                kind: "tuning",
                label: rule.label,
                detail: formatTuningDetail(result)
            });
            onChange({ kind: "tuning-rule", rule: button.dataset.tuningRule });
        });
    });

    syncAll();

    return { syncAll, syncPath };
}

function readInput(input) {
    if (input.type === "checkbox") {
        return input.checked;
    }
    if (input.tagName === "SELECT") {
        return input.value;
    }

    const value = Number.parseFloat(input.value);
    return Number.isFinite(value) ? value : null;
}

function writeInput(input, value) {
    if (input.type === "checkbox") {
        input.checked = Boolean(value);
        return;
    }
    if (input.tagName === "SELECT") {
        input.value = value === null || value === undefined ? "" : String(value);
        return;
    }

    if (typeof value === "number") {
        input.value = formatInputNumber(value);
    } else if (value === null || value === undefined) {
        input.value = "";
    } else {
        input.value = String(value);
    }
}

function formatInputNumber(value) {
    if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)) {
        return value.toPrecision(6);
    }
    return Number.parseFloat(value.toFixed(6)).toString();
}

function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

// Strip the controller gains (Kp / Ki / Kd) out of a process preset patch so
// loading a plant does not overwrite the user's tunings. Everything else
// (anti_windup, derivative_on, tracking_time, derivative_filter_time, output
// limits, bias) flows through, because those are framing choices that match
// the plant (e.g. heater valve at 0-100 %, not -100 to +100).
function scopedPlantPatch(patch) {
    const copy = JSON.parse(JSON.stringify(patch));
    if (copy.controller) {
        delete copy.controller.kp;
        delete copy.controller.ki;
        delete copy.controller.kd;
    }
    return copy;
}

function formatTuningDetail(result) {
    const parts = [
        `Kp=${formatGain(result.kp)}`,
        `Ki=${formatGain(result.ki)}`,
        `Kd=${formatGain(result.kd)}`
    ];
    if (Number.isFinite(result.Ti) && result.Ti > 0) {
        parts.push(`Ti=${formatGain(result.Ti)} s`);
    }
    if (Number.isFinite(result.Td) && result.Td > 0) {
        parts.push(`Td=${formatGain(result.Td)} s`);
    }
    return parts.join(", ");
}

function formatGain(value) {
    if (!Number.isFinite(value)) {
        return "n/a";
    }
    if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) {
        return value.toExponential(2);
    }
    return Number.parseFloat(value.toFixed(4)).toString();
}
