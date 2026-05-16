// Guided exercises. Each exercise is a list of "steps". A step describes what
// to set, what to do, and what to observe. The first step's "setup" patch is
// applied immediately when the exercise is started; other steps are shown in
// sequence as the user advances.
//
// The exercises do NOT mutate engine state directly; they emit configuration
// patches that the host wires through the existing mergePatch path so the
// observable behavior is identical to a user clicking the preset buttons.

export const EXERCISES = {
    "integrator-kills-offset": {
        title: "Exercise 1: The integrator kills offset",
        summary: "Watch how Ki removes steady-state error and what overshoot it costs.",
        steps: [
            {
                heading: "Step 1 - Baseline with Ki = 0",
                detail: "Run the Educational FOPDT plant with Ki = 0. The Final error metric (Metrics row) is the steady-state offset a P-only controller leaves behind - the controller cannot drive error to zero without an integrator.",
                processPreset: "educational-fopdt",
                patch: { controller: { kp: 2, ki: 0, kd: 0 } }
            },
            {
                heading: "Step 2 - Add a small integrator",
                detail: "Set Ki = 0.1. Final error should drop toward zero as the integrator accumulates and pushes the actuator to the right steady-state value.",
                patch: { controller: { ki: 0.1 } }
            },
            {
                heading: "Step 3 - Push the integrator",
                detail: "Set Ki = 0.5. Final error stays at zero but Overshoot and Ms (sensitivity peak) both rise - that is the cost of a faster integrator.",
                patch: { controller: { ki: 0.5 } }
            }
        ],
        conclusion: "The integrator is the only thing that drives steady-state error to zero, but it costs overshoot."
    },
    "derivative-kick": {
        title: "Exercise 2: The derivative kick",
        summary: "See why derivative-on-measurement is the industrial default.",
        steps: [
            {
                heading: "Step 1 - Derivative on error",
                detail: "Educational FOPDT, Kd = 5, derivative_on = error. Observe the actuator spike at the setpoint step.",
                processPreset: "educational-fopdt",
                patch: { controller: { kp: 1.5, ki: 0.1, kd: 5, derivative_filter_time: 0, derivative_on: "error" } }
            },
            {
                heading: "Step 2 - Derivative on measurement",
                detail: "Switch derivative_on = measurement. The spike should disappear.",
                patch: { controller: { derivative_on: "measurement" } }
            }
        ],
        conclusion: "Derivative-on-measurement is the industrial default; it avoids reacting violently to operator setpoint changes."
    },
    "windup": {
        title: "Exercise 3: Windup and anti-windup",
        summary: "Compare off, conditional, and back-calculation anti-windup under saturation.",
        steps: [
            {
                heading: "Step 1 - No anti-windup",
                detail: "Load the Saturation/Windup scenario. The actuator hits its limit; the integrator winds up; recovery overshoots wildly.",
                processPreset: "educational-fopdt",
                scenarioPreset: "saturation-windup",
                patch: { controller: { anti_windup: "off" } }
            },
            {
                heading: "Step 2 - Conditional clamping",
                detail: "Anti-windup = conditional. The integrator freezes when saturated. Compare IAE and recovery time.",
                patch: { controller: { anti_windup: "conditional" } }
            },
            {
                heading: "Step 3 - Back-calculation",
                detail: "Anti-windup = back_calculation with Tt = 2. The integrator is actively dragged back. IAE usually drops further.",
                patch: { controller: { anti_windup: "back_calculation", tracking_time: 2 } }
            }
        ],
        conclusion: "Anti-windup matters enormously when actuators saturate. IAE often drops 30-50 % between off and back-calculation."
    },
    "dead-time-penalty": {
        title: "Exercise 4: The dead-time penalty",
        summary: "See why dead time forces detuning, using a composition (theta/tau = 0.5) loop.",
        steps: [
            {
                heading: "Step 1 - Apply Z-N PID",
                detail: "Load the Composition preset, then click Z-N PID. Observe oscillation. Note Phase margin.",
                processPreset: "composition-loop",
                applyTuning: "zn-pid"
            },
            {
                heading: "Step 2 - Apply AMIGO PID",
                detail: "Click AMIGO PID. Phase margin should recover; oscillation should reduce.",
                applyTuning: "amigo-pid"
            },
            {
                heading: "Step 3 - Apply Lambda PI",
                detail: "Click Lambda PI. Response is conservative and monotonic.",
                applyTuning: "lambda-pi"
            }
        ],
        conclusion: "The further theta is from zero, the more conservative the tuning must be. This is the canonical case for a Smith predictor."
    },
    "reverse-action": {
        title: "Exercise 5: Reverse action",
        summary: "Verify that a negative-gain plant needs a negative Kp.",
        steps: [
            {
                heading: "Step 1 - Force positive Kp",
                detail: "Load the Heat Exchanger preset, then force Kp positive. The direction-warning banner appears; the loop runs away.",
                processPreset: "heat-exchanger",
                patch: { controller: { kp: 1.0, ki: 0.05, kd: 0 } }
            },
            {
                heading: "Step 2 - Negate Kp",
                detail: "Set Kp = -1.0. The warning clears; the loop stabilizes.",
                patch: { controller: { kp: -1.0 } }
            }
        ],
        conclusion: "Controller direction must match plant direction. This is the single most common operator mistake on a new loop."
    },
    "bode-to-time": {
        title: "Exercise 6: Bode to time response",
        summary: "Connect phase margin to the time-domain behavior.",
        steps: [
            {
                heading: "Step 1 - Comfortable PM",
                detail: "Educational FOPDT, AMIGO PID. Phase margin (PM) is in the Metrics row - it tells you how many extra degrees of phase lag the loop can absorb before going unstable. A robust loop sits above 60 deg.",
                processPreset: "educational-fopdt",
                applyTuning: "amigo-pid"
            },
            {
                heading: "Step 2 - PM near 45 deg",
                detail: "Multiply Kp by 1.6. PM should drop into the 30-50 deg band. Look for visible ringing in PV.",
                multiplyController: { kp: 1.6 }
            },
            {
                heading: "Step 3 - PM near 15 deg",
                detail: "Multiply Kp by 1.6 again. PM should drop below 30 deg. The loop now oscillates strongly. Compare PM and overshoot.",
                multiplyController: { kp: 1.6 }
            }
        ],
        conclusion: "Phase margin is a quantitative prediction of how the loop will look in the time domain."
    },
    "speed-vs-robustness": {
        title: "Exercise 7: Speed versus robustness",
        summary: "Use Lambda tuning on the jacketed tank to see the trade-off.",
        steps: [
            {
                heading: "Step 1 - Conservative Lambda PI",
                detail: "Load Jacketed Tank, apply Lambda PI. Note Rise time and Ms (sensitivity peak Ms = max |1/(1+L)|). Lower Ms means more robust to model error; industrial loops aim for Ms between 1.4 and 2.0.",
                processPreset: "tank-temperature",
                applyTuning: "lambda-pi"
            },
            {
                heading: "Step 2 - Double the gains",
                detail: "Literally double Kp and Ki from the previous step. Rise time should drop; Ms should climb.",
                multiplyController: { kp: 2, ki: 2 }
            },
            {
                heading: "Step 3 - Push too hard",
                detail: "Double again. Ms should pass 2.0 and the loop is fragile to disturbances.",
                multiplyController: { kp: 2, ki: 2 }
            }
        ],
        conclusion: "Speed and robustness are fundamentally in tension. Pick the operating point that matches the consequences of failure on the real plant."
    }
};

export function listExercises() {
    return Object.entries(EXERCISES).map(([id, ex]) => ({ id, title: ex.title, summary: ex.summary }));
}

export function getExercise(id) {
    return EXERCISES[id] || null;
}
