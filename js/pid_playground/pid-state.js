export const SCHEMA_VERSION = 2;

export const ANTI_WINDUP_MODES = ["off", "conditional", "back_calculation"];
export const DERIVATIVE_SOURCES = ["measurement", "error"];

export const DEFAULT_CONFIG = {
    schema_version: SCHEMA_VERSION,
    model_type: "fopdt",
    model: {
        pv0: 0,
        pv_baseline: 0,
        process_gain: 1,
        tau: 10,
        dead_time: 1
    },
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
    scenario: {
        initial_setpoint: 0,
        final_setpoint: 10,
        step_time: 5,
        disturbance_start: 45,
        disturbance_magnitude: 0,
        disturbance_duration: null,
        noise_amplitude: 0,
        noise_seed: 12345,
        horizon: 100,
        dt: 0.05,
        controller_sample_time: 0.1,
        settling_tolerance_percent: 2
    }
};

export function createDefaultConfig() {
    return deepClone(DEFAULT_CONFIG);
}

export function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
}

export function mergePatch(target, patch) {
    Object.entries(patch).forEach(([key, value]) => {
        if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object") {
            mergePatch(target[key], value);
        } else {
            target[key] = deepClone(value);
        }
    });
    return target;
}

export function getPath(object, path) {
    return path.split(".").reduce((cursor, segment) => cursor?.[segment], object);
}

export function setPath(object, path, value) {
    const segments = path.split(".");
    const last = segments.pop();
    let cursor = object;
    segments.forEach((segment) => {
        if (!cursor[segment] || typeof cursor[segment] !== "object") {
            cursor[segment] = {};
        }
        cursor = cursor[segment];
    });
    cursor[last] = value;
}
