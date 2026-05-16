// Glossary entries keyed by lowercased symbol or term. The side-panel resolves
// a clicked term to one of these entries and displays the physical
// explanation, typical ranges, and the simulator-specific source. Keep
// entries short and prefer concrete units; this is a side-channel, not a
// textbook.

export const GLOSSARY = {
    "pm": {
        title: "Phase margin (PM)",
        body: "How many additional degrees of phase lag the loop can tolerate before instability. Computed at omega_gc where |L(jw)| = 1. Robust loops sit above 60 deg; typical industrial tuning lives between 30 and 60 deg; below 30 deg the loop will oscillate at any unmodeled lag."
    },
    "phase margin": { alias: "pm" },
    "gm": {
        title: "Gain margin (GM)",
        body: "How many dB the loop gain can rise before instability. Measured at the first phase crossover of -180 deg. Robust loops carry > 12 dB (factor of 4); industrial tuning sits at 6-12 dB. Real plants drift over time and gain margin is the budget for that drift."
    },
    "gain margin": { alias: "gm" },
    "ms": {
        title: "Sensitivity peak Ms",
        body: "Max |S(jw)| where S = 1 / (1 + L). Robustness shorthand. Ms < 1.4 is conservative and slow; 1.4-2.0 is typical industrial; above 2.0 the loop reacts badly to model error or disturbance bursts."
    },
    "sensitivity peak": { alias: "ms" },
    "wgc": {
        title: "Gain crossover (omega_gc)",
        body: "The frequency at which |L(jw)| = 1. Closed-loop bandwidth roughly tracks omega_gc; for the FOPDT plus PID combinations in this tool, the dominant time constant of the closed loop is about 1/omega_gc."
    },
    "wpc": {
        title: "Phase crossover (omega_pc)",
        body: "The first frequency at which the unwrapped phase of L(jw) crosses -180 deg. Gain margin is measured here."
    },
    "k": {
        title: "Process gain K",
        body: "Steady-state DC gain of the plant. Units are (PV per output): for the Jacketed Tank, K is deg C of tank temperature delivered per percent of heater valve position. Negative K is a reverse-acting plant (e.g., a heat exchanger cold-side valve)."
    },
    "process gain": { alias: "k" },
    "tau": {
        title: "Time constant tau",
        body: "First-order lag time in seconds. After one tau the open-loop response covers ~63 % of its eventual move; after 4-5 tau it is essentially complete. For the Jacketed Tank tau ~ 3 min; for the Fast Flow loop tau ~ 4 s."
    },
    "theta": {
        title: "Dead time theta",
        body: "Pure transport / measurement delay in seconds. The plant does not respond at all to a fresh output change until theta seconds have passed. theta / tau is the dominant predictor of how hard a loop is to tune; > 0.5 means a Smith predictor pays off."
    },
    "dead time": { alias: "theta" },
    "kp": {
        title: "Proportional gain Kp",
        body: "Parallel-form P contribution: u = ... + Kp * (SP - measurement). Doubling Kp doubles the corrective push at every instant. Too large gives overshoot and oscillation; too small leaves a steady-state offset (without an integrator)."
    },
    "ki": {
        title: "Integral gain Ki",
        body: "Parallel-form I contribution: I += Ki * error * Ts. Any nonzero average error is integrated until the actuator drives it to zero. Equivalent ideal-form Ti = Kp / Ki."
    },
    "kd": {
        title: "Derivative gain Kd",
        body: "Parallel-form D contribution. Derivative-on-measurement (the default) uses dPV/dt and avoids reacting to setpoint steps. Derivative-on-error uses d(error)/dt and produces the classic 'derivative kick'. Equivalent ideal-form Td = Kd / Kp."
    },
    "tf": {
        title: "Derivative filter time Tf",
        body: "First-order low-pass on the derivative branch. Continuous pole 1/Tf, discrete pole alpha = exp(-Ts/Tf). Tf = 0 disables filtering. On noisy measurements Tf is what protects the actuator from chatter."
    },
    "iae": {
        title: "Integral of absolute error (IAE)",
        body: "Sum of |SP - PV| dt over the simulation horizon. A direction-blind energy measure of how far off the loop ran. Lower is better."
    },
    "ise": {
        title: "Integral of squared error (ISE)",
        body: "Sum of (SP - PV)^2 dt. Penalizes large excursions more heavily than IAE. Useful when you care more about peak deviation than total deviation."
    },
    "itae": {
        title: "Integral of time-weighted absolute error (ITAE)",
        body: "Sum of t * |SP - PV| dt, weighted from the step time forward. Penalizes lingering error and is forgiving of large initial transients. Often the best single metric for closed-loop comparisons."
    },
    "anti-windup": {
        title: "Anti-windup",
        body: "Strategies for keeping the integrator from accumulating during saturation. 'Off' is for demonstration only - never deploy. 'Conditional' freezes the integrator when the proposed update would push the saturated actuator deeper. 'Back-calculation' adds (u_clamped - u_raw) * Ts / Tt every tick, dragging the integrator back at a rate set by tracking time Tt."
    },
    "tt": {
        title: "Tracking time Tt",
        body: "Time constant for the back-calculation anti-windup term. Smaller Tt drags the integrator back faster but interacts with the derivative branch. Rules of thumb: Tt = sqrt(Ti * Td) for PID, Tt = Ti for PI."
    },
    "tracking time": { alias: "tt" },
    "saturation": {
        title: "Saturation",
        body: "The fraction of simulation samples for which the actuator command was at output_min or output_max. While saturated, the controller has lost authority - it cannot push harder."
    },
    "settling time": {
        title: "Settling time",
        body: "Time after the setpoint step at which PV remains inside the tolerance band for the rest of the horizon. The band defaults to 2 % of the step magnitude; common alternatives are 1 % or 5 %."
    },
    "overshoot": {
        title: "Overshoot",
        body: "Maximum excursion past the final setpoint, expressed as a percent of the step magnitude. Direction-aware; positive and negative setpoint steps both produce non-negative overshoot."
    },
    "rise time": {
        title: "Rise time (10-90)",
        body: "Time from 10 % to 90 % of the requested step, measured on the PV trajectory after the setpoint step."
    }
};

export function lookupGlossary(termOrKey) {
    if (!termOrKey) {
        return null;
    }
    const key = String(termOrKey).trim().toLowerCase();
    let entry = GLOSSARY[key];
    if (!entry) {
        // Allow ASCII-style mappings (e.g., "omega" -> "wgc")
        return null;
    }
    while (entry && entry.alias) {
        entry = GLOSSARY[entry.alias];
    }
    return entry || null;
}
