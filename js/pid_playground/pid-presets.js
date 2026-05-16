// Three preset families.
//
// PROCESS_PRESETS load a complete process-model + scenario "narrative" so the
// numbers on screen correspond to a realistic loop (fast flow, jacketed tank,
// heat exchanger, composition).
//
// SCENARIO_PRESETS layer a specific demonstration (clean step, load
// disturbance, saturation/windup, noisy derivative, negative step) on top of
// whatever process is currently selected.
//
// TUNING_RULES are open-loop reaction-curve / IMC-style correlations applied
// to the *currently configured* FOPDT model. They compute parallel-form
// gains from the process gain K, time constant tau, and dead time theta, and
// then patch only the controller.

export const PROCESS_PRESETS = {
    "educational-fopdt": {
        label: "Educational FOPDT",
        patch: {
            model: { pv0: 0, pv_baseline: 0, process_gain: 1, tau: 10, dead_time: 1 },
            // Every process preset declares a COMPLETE controller block so that
            // anti_windup, derivative_on, tracking_time, etc. cannot be silently
            // inherited from a previously selected scenario (e.g. Saturation/Windup
            // sets anti_windup="off", which would carry over to a different plant).
            controller: {
                kp: 2,
                ki: 0.2,
                kd: 0,
                bias: 0,
                output_min: -100,
                output_max: 100,
                anti_windup: "conditional",
                tracking_time: 1,
                derivative_on: "measurement",
                derivative_filter_time: 0.6
            },
            // Scenario block is also complete so disturbance / noise / step state
            // is deterministic regardless of what preset was active before.
            scenario: {
                initial_setpoint: 0,
                final_setpoint: 10,
                step_time: 5,
                horizon: 100,
                dt: 0.05,
                controller_sample_time: 0.1,
                settling_tolerance_percent: 2,
                disturbance_start: 45,
                disturbance_magnitude: 0,
                disturbance_duration: null,
                noise_amplitude: 0,
                noise_seed: 12345
            }
        },
        narrative: {
            units: {
                pv: "",
                output: "",
                pvAxis: "Process variable",
                outputAxis: "Controller output / load",
                pvLegend: "PV",
                outputLegend: "Output"
            },
            interpretation: "Normalized reference plant with dimensionless PV and output. K = 1, tau = 10 s, theta = 1 s.",
            dominantDynamics: "First-order lag dominates with light dead time (theta/tau = 0.10).",
            lookFor: "PV slews to setpoint with a small overshoot. Bode magnitude rolls off at -20 dB/decade past 1/tau = 0.1 rad/s.",
            recommendedTuning: "Any rule works. AMIGO PID is auto-applied as a robust default.",
            recommendedTuningIds: ["amigo-pid"],
            cautions: "Do not over-interpret the numbers; this is normalized."
        }
    },
    "fast-flow": {
        label: "Fast Flow Loop",
        patch: {
            // Steady-state self-consistency: pv0 = pv_baseline + K * bias = 0 + 1.0 * 50 = 50.
            // Physically: K = 1 gpm per % valve, valve at 50 % gives 50 gpm with the valve
            // sized so 100 % gives ~100 gpm. Controller gains are tuned modestly so the
            // default load lands at a stable PM > 60 deg.
            model: { pv0: 50, pv_baseline: 0, process_gain: 1.0, tau: 4, dead_time: 0.5 },
            controller: {
                kp: 1.2,
                ki: 0.25,
                kd: 0,
                bias: 50,
                output_min: 0,
                output_max: 100,
                anti_windup: "conditional",
                tracking_time: 1,
                derivative_on: "measurement",
                derivative_filter_time: 0.4
            },
            scenario: {
                initial_setpoint: 50,
                final_setpoint: 70,
                step_time: 5,
                horizon: 60,
                dt: 0.02,
                controller_sample_time: 0.1,
                settling_tolerance_percent: 2,
                disturbance_start: 45,
                disturbance_magnitude: 0,
                disturbance_duration: null,
                noise_amplitude: 0,
                noise_seed: 12345
            }
        },
        narrative: {
            units: {
                pv: "gpm",
                output: "% valve",
                pvAxis: "Flow rate, gpm",
                outputAxis: "Valve position, %",
                pvLegend: "Flow",
                outputLegend: "Valve"
            },
            interpretation: "Water through a pipe with a control valve and downstream flow meter. PV is measured flow (gpm); u is valve stem position (0-100 %).",
            dominantDynamics: "Almost pure first-order. theta/tau = 0.125, dead time is small.",
            lookFor: "Phase stays near -90 deg through the gain crossover. Try AMIGO PI manually - it produces a very short Ti (~0.33 s) versus the 0.1 s controller sample, so the discrete loop oscillates even though the continuous PM looks fine. That mismatch is a real lesson.",
            recommendedTuning: "Lambda PI (lambda = tau) is auto-applied for a stable default. AMIGO PI is theoretically robust on the continuous loop but its Ti is too short for the 0.1 s sample time in this preset.",
            recommendedTuningIds: ["lambda-pi", "amigo-pi"],
            cautions: "Valve cannot go negative; output limits are 0 to 100 %."
        }
    },
    "tank-temperature": {
        label: "Jacketed Tank Temperature",
        patch: {
            // Steady-state: pv0 = pv_baseline + K * bias = 7 + 0.6 * 30 = 25 deg C.
            // Physical reading: jacket valve closed -> tank cools toward ambient ~7 deg C;
            // with valve at 30 %, tank holds at 25 deg C. Maximum capacity at u=100 %
            // is 7 + 60 = 67 deg C, so the SP=60 step is achievable with valve ~88 %.
            // AMIGO PI is the recommended first tuning; defaults below are intentionally
            // conservative so the preset settles cleanly out of the box.
            model: { pv0: 25, pv_baseline: 7, process_gain: 0.6, tau: 180, dead_time: 25 },
            controller: {
                kp: 1.8,
                ki: 0.015,
                kd: 0,
                bias: 30,
                output_min: 0,
                output_max: 100,
                anti_windup: "conditional",
                tracking_time: 30,
                derivative_on: "measurement",
                derivative_filter_time: 8
            },
            scenario: {
                initial_setpoint: 25,
                final_setpoint: 60,
                step_time: 30,
                horizon: 1200,
                dt: 0.5,
                controller_sample_time: 1.0,
                settling_tolerance_percent: 2,
                disturbance_start: 800,
                disturbance_magnitude: 0,
                disturbance_duration: null,
                noise_amplitude: 0,
                noise_seed: 12345
            }
        },
        narrative: {
            units: {
                pv: "deg C",
                output: "% heater",
                pvAxis: "Tank temperature, deg C",
                outputAxis: "Heater valve position, %",
                pvLegend: "Temp",
                outputLegend: "Heater"
            },
            interpretation: "Stirred tank with a hot-water jacket. PV is tank temperature (deg C); u is jacket valve position (0-100 %). Heat losses to ambient are unmodeled here but real, which is why Ki must be nonzero in practice.",
            dominantDynamics: "tau ~ 3 min dominates, but theta/tau = 0.14 still matters.",
            lookFor: "Crossover frequency below 0.1 rad/s (period > 60 s). Z-N PID overshoots and rings; bad practice on a real tank because the heater fouls under thermal cycling.",
            recommendedTuning: "Lambda PI (lambda = tau) is auto-applied for a clean monotonic approach. AMIGO PI is a more aggressive compromise.",
            recommendedTuningIds: ["lambda-pi", "amigo-pi"],
            cautions: "Long horizon: simulation runs out to 1200 s."
        }
    },
    "heat-exchanger": {
        label: "Heat Exchanger (reverse-acting)",
        patch: {
            // Steady-state: pv0 = pv_baseline + K * bias = 104 + (-0.8) * 30 = 80 deg C.
            // Physical reading: with the cold-side valve closed (u=0), the hot side
            // drives the outlet to ~104 deg C. Opening the valve admits more cold
            // fluid and pulls outlet temperature down: K < 0. At u=100 %, PV = 24 deg C.
            // Kp is intentionally negative because the plant gain is negative; if
            // you flip Kp positive the direction-warning banner lights up.
            model: { pv0: 80, pv_baseline: 104, process_gain: -0.8, tau: 45, dead_time: 8 },
            controller: {
                kp: -1.4,
                ki: -0.04,
                kd: 0,
                bias: 30,
                output_min: 0,
                output_max: 100,
                anti_windup: "conditional",
                tracking_time: 10,
                derivative_on: "measurement",
                derivative_filter_time: 2
            },
            scenario: {
                initial_setpoint: 80,
                final_setpoint: 70,
                step_time: 20,
                horizon: 400,
                dt: 0.1,
                controller_sample_time: 0.5,
                settling_tolerance_percent: 2,
                disturbance_start: 300,
                disturbance_magnitude: 0,
                disturbance_duration: null,
                noise_amplitude: 0,
                noise_seed: 12345
            }
        },
        narrative: {
            units: {
                pv: "deg C",
                output: "% valve",
                pvAxis: "Cold-side outlet temperature, deg C",
                outputAxis: "Cold-side flow valve position, %",
                pvLegend: "Outlet",
                outputLegend: "Cold valve"
            },
            interpretation: "Shell-and-tube heat exchanger. Opening the cold-side valve admits more cold fluid and lowers outlet temperature, so plant gain K is negative. The controller must be reverse-acting too (Kp negative).",
            dominantDynamics: "Moderate lag (tau = 45 s) with theta/tau = 0.18. Reverse-acting.",
            lookFor: "The direction-warning banner appears the instant sign(Kp) and sign(K) disagree. With matching signs the loop behaves like any other FOPDT.",
            recommendedTuning: "AMIGO PI is auto-applied. Because K is negative the rule produces negative Kp and Ki - exactly what a reverse-acting loop needs.",
            recommendedTuningIds: ["amigo-pi", "lambda-pi"],
            cautions: "Sign mismatch is the single most common operator mistake on a new loop."
        }
    },
    "composition-loop": {
        label: "Composition Loop",
        patch: {
            // Steady-state: pv0 = pv_baseline + K * bias = 0.30 + 0.005 * 20 = 0.40 mol frac.
            // Physical reading: 1 % of reflux valve moves composition by 0.005 (about
            // half a mol-percent) - typical for an analyzer-paced overhead loop.
            // At u=100 % the column saturates at 0.30 + 0.50 = 0.80 mol frac, so the
            // SP step 0.40 -> 0.50 sits comfortably mid-range. Theta/tau = 0.5, so a
            // dead-time-aware rule (Cohen-Coon, AMIGO, Lambda) is recommended.
            model: { pv0: 0.40, pv_baseline: 0.30, process_gain: 0.005, tau: 120, dead_time: 60 },
            // Lambda PI with lambda = tau: Kc = tau / (K * (lambda + theta))
            //   = 120 / (0.005 * 180) = 133. Ti = tau = 120 s, Ki = Kc/Ti = 1.11.
            // This is the rule the narrative explicitly recommends for the
            // dead-time-dominated regime and converges cleanly within the 1500 s
            // horizon (closed-loop time constant ~ tau + theta = 180 s).
            controller: {
                kp: 133,
                ki: 1.11,
                kd: 0,
                bias: 20,
                output_min: 0,
                output_max: 100,
                anti_windup: "conditional",
                tracking_time: 120,
                derivative_on: "measurement",
                derivative_filter_time: 6
            },
            scenario: {
                initial_setpoint: 0.40,
                final_setpoint: 0.50,
                step_time: 30,
                horizon: 1500,
                dt: 0.5,
                controller_sample_time: 2.0,
                settling_tolerance_percent: 2,
                disturbance_start: 1000,
                disturbance_magnitude: 0,
                disturbance_duration: null,
                noise_amplitude: 0,
                noise_seed: 12345
            }
        },
        narrative: {
            units: {
                pv: "mol frac",
                output: "% reflux",
                pvAxis: "Product composition, mol fraction",
                outputAxis: "Reflux valve position, %",
                pvLegend: "Composition",
                outputLegend: "Reflux"
            },
            interpretation: "Distillation overhead composition under reflux control, measured by an online analyzer. PV is analyzer reading (mol fraction); u is reflux valve position (0-100 %). The analyzer cycle dominates the dead time.",
            dominantDynamics: "Dead-time dominated: theta/tau = 0.5. The controller is fundamentally limited by what it cannot see during the 60-second analyzer cycle.",
            lookFor: "Phase drops below -180 deg at moderate frequencies because of exp(-theta s). Gain margin matters a lot here. Z-N rings or oscillates.",
            recommendedTuning: "Lambda PI with lambda = tau is auto-applied. Cohen-Coon PID is acceptable too. This is the canonical case for a Smith predictor.",
            recommendedTuningIds: ["lambda-pi", "cc-pid", "amigo-pi"],
            cautions: "Long horizon (1500 s) and slow controller sample (2.0 s). Be patient."
        }
    }
};

export const SCENARIO_PRESETS = {
    "clean-step": {
        label: "Clean Step",
        patch: {
            scenario: {
                disturbance_magnitude: 0,
                disturbance_duration: null,
                noise_amplitude: 0
            }
        }
    },
    "load-disturbance": {
        label: "Load Disturbance",
        patch: {
            scenario: {
                disturbance_start: 45,
                disturbance_magnitude: -4,
                disturbance_duration: null,
                noise_amplitude: 0
            }
        }
    },
    "saturation-windup": {
        label: "Saturation / Windup",
        patch: {
            controller: {
                kp: 1.8,
                ki: 0.5,
                kd: 0,
                output_min: -15,
                output_max: 15,
                anti_windup: "off"
            },
            scenario: {
                final_setpoint: 12,
                horizon: 140,
                disturbance_magnitude: 0,
                noise_amplitude: 0
            }
        }
    },
    "noisy-derivative": {
        label: "Noisy Derivative",
        patch: {
            controller: {
                kp: 1.4,
                ki: 0.08,
                kd: 4,
                derivative_filter_time: 0.8,
                derivative_on: "measurement"
            },
            scenario: {
                noise_amplitude: 0.25,
                noise_seed: 67890,
                horizon: 60
            }
        }
    },
    "negative-step": {
        label: "Negative Step",
        patch: {
            model: { pv0: 10, pv_baseline: 10 },
            scenario: {
                initial_setpoint: 10,
                final_setpoint: 0,
                step_time: 5,
                horizon: 90,
                disturbance_magnitude: 0,
                noise_amplitude: 0
            }
        }
    }
};

export const TUNING_RULES = {
    "zn-pi": {
        label: "Ziegler-Nichols PI",
        compute: tuningZieglerNicholsPI,
        kind: "pi"
    },
    "zn-pid": {
        label: "Ziegler-Nichols PID",
        compute: tuningZieglerNicholsPID,
        kind: "pid"
    },
    "cc-pi": {
        label: "Cohen-Coon PI",
        compute: tuningCohenCoonPI,
        kind: "pi"
    },
    "cc-pid": {
        label: "Cohen-Coon PID",
        compute: tuningCohenCoonPID,
        kind: "pid"
    },
    "amigo-pi": {
        label: "AMIGO PI",
        compute: tuningAmigoPI,
        kind: "pi"
    },
    "amigo-pid": {
        label: "AMIGO PID",
        compute: tuningAmigoPID,
        kind: "pid"
    },
    "lambda-pi": {
        label: "Lambda PI (lambda = tau)",
        compute: tuningLambdaPI,
        kind: "pi"
    }
};

function fopdtParameters(config) {
    const K = config.model.process_gain;
    const tau = config.model.tau;
    let theta = config.model.dead_time;
    if (theta < 1e-6) {
        theta = 1e-3;
    }
    return { K, tau, theta };
}

function gainsFromIdeal(Kc, Ti, Td) {
    return {
        kp: Kc,
        ki: Ti > 0 ? Kc / Ti : 0,
        kd: Td > 0 ? Kc * Td : 0,
        Ti,
        Td
    };
}

function tuningZieglerNicholsPI(config) {
    const { K, tau, theta } = fopdtParameters(config);
    const Kc = (0.9 * tau) / (K * theta);
    const Ti = theta / 0.3;
    return gainsFromIdeal(Kc, Ti, 0);
}

function tuningZieglerNicholsPID(config) {
    const { K, tau, theta } = fopdtParameters(config);
    const Kc = (1.2 * tau) / (K * theta);
    const Ti = 2 * theta;
    const Td = 0.5 * theta;
    return gainsFromIdeal(Kc, Ti, Td);
}

function tuningCohenCoonPI(config) {
    const { K, tau, theta } = fopdtParameters(config);
    const r = theta / tau;
    const Kc = (1 / K) * (tau / theta) * (0.9 + r / 12);
    const Ti = theta * (30 + 3 * r) / (9 + 20 * r);
    return gainsFromIdeal(Kc, Ti, 0);
}

function tuningCohenCoonPID(config) {
    const { K, tau, theta } = fopdtParameters(config);
    const r = theta / tau;
    const Kc = (1 / K) * (tau / theta) * (4 / 3 + r / 4);
    const Ti = theta * (32 + 6 * r) / (13 + 8 * r);
    const Td = (4 * theta) / (11 + 2 * r);
    return gainsFromIdeal(Kc, Ti, Td);
}

function tuningAmigoPI(config) {
    const { K, tau, theta } = fopdtParameters(config);
    const numerator = tau * theta;
    const denominator = (tau + theta) ** 2;
    const Kc = (1 / K) * (0.15 + (0.35 - numerator / denominator) * (tau / theta));
    const Ti = (0.35 + (13 * tau * theta * theta) / (tau * tau + 12 * tau * theta + 7 * theta * theta)) * theta;
    return gainsFromIdeal(Kc, Ti, 0);
}

function tuningAmigoPID(config) {
    const { K, tau, theta } = fopdtParameters(config);
    const Kc = (1 / K) * (0.2 + (0.45 * tau) / theta);
    const Ti = ((0.4 * theta + 0.8 * tau) / (theta + 0.1 * tau)) * theta;
    const Td = (0.5 * tau * theta) / (0.3 * tau + theta);
    return gainsFromIdeal(Kc, Ti, Td);
}

function tuningLambdaPI(config) {
    const { K, tau, theta } = fopdtParameters(config);
    const lambda = tau;
    const Kc = tau / (K * (lambda + theta));
    const Ti = tau;
    return gainsFromIdeal(Kc, Ti, 0);
}

export function getProcessPreset(id) {
    return PROCESS_PRESETS[id] || null;
}

export function getScenarioPreset(id) {
    return SCENARIO_PRESETS[id] || null;
}

export function getTuningRule(id) {
    return TUNING_RULES[id] || null;
}

export function listTuningRules() {
    return Object.entries(TUNING_RULES).map(([id, rule]) => ({ id, label: rule.label, kind: rule.kind }));
}

// Heuristic regime classification used by the live regime banner. Based on
// theta/tau (lag-vs-deadtime balance), and on the margin / sensitivity-peak
// regimes documented in NARRATIVE.md.

export function classifyRegime(config, margins) {
    const tau = Math.max(1e-9, config.model.tau);
    const theta = Math.max(0, config.model.dead_time);
    const ratio = theta / tau;

    let dynamics = "first-order lag";
    let dynamicsHint = "First-order lag dominates";
    if (ratio < 0.1) {
        dynamics = "lag-dominated";
        dynamicsHint = "First-order lag dominates; dead time is negligible";
    } else if (ratio < 0.3) {
        dynamics = "balanced";
        dynamicsHint = "Lag dominates but dead time is non-trivial";
    } else if (ratio < 1.0) {
        dynamics = "dead-time-significant";
        dynamicsHint = "Dead time is a significant fraction of the lag";
    } else {
        dynamics = "dead-time-dominated";
        dynamicsHint = "Dead time exceeds the lag; this is the hardest regime";
    }

    let robustness = "unknown";
    let robustnessHint = "Run a simulation to evaluate robustness";
    if (margins) {
        const pm = margins.phase_margin_deg;
        const ms = margins.sensitivity_peak;
        if (Number.isFinite(pm)) {
            if (pm > 60) {
                robustness = "robust";
                robustnessHint = `PM = ${pm.toFixed(0)} deg (robust)`;
            } else if (pm > 30) {
                robustness = "typical";
                robustnessHint = `PM = ${pm.toFixed(0)} deg (typical industrial)`;
            } else if (pm > 0) {
                robustness = "fragile";
                robustnessHint = `PM = ${pm.toFixed(0)} deg (fragile)`;
            } else {
                robustness = "unstable";
                robustnessHint = "Loop is marginally stable or worse";
            }
        }
        if (Number.isFinite(ms)) {
            if (ms < 1.4) {
                robustnessHint += `, Ms = ${ms.toFixed(2)} (conservative)`;
            } else if (ms < 2.0) {
                robustnessHint += `, Ms = ${ms.toFixed(2)} (typical)`;
            } else {
                robustnessHint += `, Ms = ${ms.toFixed(2)} (fragile)`;
            }
        }
    }

    let recommendation = "AMIGO PID";
    if (dynamics === "dead-time-dominated") {
        recommendation = "Lambda PI or Cohen-Coon (dead-time dominated)";
    } else if (dynamics === "dead-time-significant") {
        recommendation = "AMIGO PID or Cohen-Coon PID";
    } else if (dynamics === "lag-dominated") {
        recommendation = "Z-N PI/PID is fine; AMIGO if you want robustness";
    } else {
        recommendation = "AMIGO PID";
    }

    return {
        dynamics,
        dynamicsHint,
        thetaOverTau: ratio,
        robustness,
        robustnessHint,
        recommendation
    };
}
