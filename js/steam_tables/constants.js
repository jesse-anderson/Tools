export const DOME_EPS_C = 0.01;
export const VALUE_TOLERANCE = 1e-8;
export const LOW_CONFIDENCE_TEMPERATURE_C = 5;
export const LOW_CONFIDENCE_PRESSURE_MPA = 0.05;

export const RESULT_PROPS = ['v', 'u', 'h', 's'];

export const PHASE_LABELS = {
    saturation: 'Saturation',
    liquid: 'Compressed Liquid',
    'saturated liquid': 'Saturated Liquid',
    'saturated vapor': 'Saturated Vapor',
    vapor: 'Superheated Vapor',
    'supercritical fluid': 'Supercritical Fluid',
    'two-phase': 'Two-Phase',
    'on-dome': 'On Saturation Dome',
    unavailable: 'Unavailable'
};
