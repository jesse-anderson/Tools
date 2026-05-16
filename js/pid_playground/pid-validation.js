import { ANTI_WINDUP_MODES, DERIVATIVE_SOURCES, SCHEMA_VERSION } from "./pid-state.js";

const MAX_POINTS = 50000;

export function validateConfig(config) {
    const errors = [];
    const { model, controller, scenario } = config;
    const numericFields = [
        ["Initial PV", model.pv0],
        ["PV baseline", model.pv_baseline],
        ["Process gain", model.process_gain],
        ["Time constant", model.tau],
        ["Dead time", model.dead_time],
        ["Kp", controller.kp],
        ["Ki", controller.ki],
        ["Kd", controller.kd],
        ["Bias", controller.bias],
        ["Output min", controller.output_min],
        ["Output max", controller.output_max],
        ["Tracking time", controller.tracking_time],
        ["Derivative filter time", controller.derivative_filter_time],
        ["Initial setpoint", scenario.initial_setpoint],
        ["Final setpoint", scenario.final_setpoint],
        ["Step time", scenario.step_time],
        ["Disturbance start", scenario.disturbance_start],
        ["Disturbance magnitude", scenario.disturbance_magnitude],
        ["Noise amplitude", scenario.noise_amplitude],
        ["Horizon", scenario.horizon],
        ["Integration step", scenario.dt],
        ["Controller sample time", scenario.controller_sample_time],
        ["Settling tolerance percent", scenario.settling_tolerance_percent]
    ];

    if (scenario.disturbance_duration !== null && scenario.disturbance_duration !== undefined) {
        numericFields.push(["Disturbance duration", scenario.disturbance_duration]);
    }

    numericFields.forEach(([label, value]) => {
        if (!isFiniteNumber(value)) {
            errors.push(`${label} must be a finite number.`);
        }
    });

    if (config.schema_version !== SCHEMA_VERSION) {
        errors.push(`Schema version must be ${SCHEMA_VERSION}.`);
    }
    if (config.model_type !== "fopdt") {
        errors.push("Only the FOPDT model is supported.");
    }
    if (!ANTI_WINDUP_MODES.includes(controller.anti_windup)) {
        errors.push(`Anti-windup must be one of: ${ANTI_WINDUP_MODES.join(", ")}.`);
    }
    if (!DERIVATIVE_SOURCES.includes(controller.derivative_on)) {
        errors.push(`Derivative source must be one of: ${DERIVATIVE_SOURCES.join(", ")}.`);
    }
    if (!Number.isInteger(scenario.noise_seed) || scenario.noise_seed < 0 || scenario.noise_seed > 0xFFFFFFFF) {
        errors.push("Noise seed must be an integer from 0 to 4294967295.");
    }
    if (!isPositive(model.tau)) {
        errors.push("Time constant must be positive.");
    }
    if (!isFiniteNumber(model.dead_time) || model.dead_time < 0) {
        errors.push("Dead time must be non-negative.");
    }
    if (!isPositive(scenario.dt)) {
        errors.push("Integration step must be positive.");
    }
    if (!isPositive(scenario.controller_sample_time)) {
        errors.push("Controller sample time must be positive.");
    }
    if (isPositive(scenario.dt) && isPositive(scenario.controller_sample_time) && scenario.controller_sample_time + 1e-12 < scenario.dt) {
        errors.push("Controller sample time must be at least the integration step.");
    }
    if (!isPositive(scenario.horizon) || scenario.horizon <= scenario.dt) {
        errors.push("Simulation horizon must be greater than the integration step.");
    }
    if (scenario.step_time < 0 || scenario.step_time > scenario.horizon) {
        errors.push("Setpoint step time must fall inside the simulation horizon.");
    }
    if (controller.output_min >= controller.output_max) {
        errors.push("Output min must be less than output max.");
    }
    if (!isFiniteNumber(controller.derivative_filter_time) || controller.derivative_filter_time < 0) {
        errors.push("Derivative filter time must be non-negative.");
    }
    if (!isPositive(controller.tracking_time)) {
        errors.push("Tracking time must be positive.");
    }
    if (!isFiniteNumber(scenario.noise_amplitude) || scenario.noise_amplitude < 0) {
        errors.push("Noise amplitude must be non-negative.");
    }
    if (!isPositive(scenario.settling_tolerance_percent)) {
        errors.push("Settling tolerance percent must be positive.");
    }

    const pointCount = Math.round(scenario.horizon / scenario.dt) + 1;
    if (pointCount > MAX_POINTS) {
        errors.push(`Simulation would generate ${pointCount} points; limit is ${MAX_POINTS}.`);
    }

    return {
        ok: errors.length === 0,
        errors
    };
}

function isPositive(value) {
    return isFiniteNumber(value) && value > 0;
}

function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
}
