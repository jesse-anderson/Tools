// Boundary unit conversion. Nothing else.
//
// The engine works in one coherent internal set and never sees anything else,
// so this module is the only place a US customary value or a gauge pressure
// exists. valve-engine.js deliberately does not import from here, and the spec
// asserts that against the module source: if the engine cannot see the
// conversion layer it cannot branch on a unit system, which makes the property
// true by construction instead of by discipline.
//
// The N constants do not live here. They are fixed values belonging to the internal
// unit set, hard coded in the engine and commented with the row they came from.
// A user never selects them, so they are not a conversion.

// Exact by definition, so the conversion contributes no error of its own.
export const EXACT = Object.freeze({
    PSI_TO_KPA: 6.894757293168361,
    GPM_TO_M3H: 0.2271247,
    INCH_TO_MM: 25.4,
    LB_TO_KG: 0.45359237,
    LBFT3_TO_KGM3: 16.018463373960143,
    ATMOSPHERIC_KPA: 101.325,
});

/**
 * Cv to Kv, and back.
 *
 * This is not a unit identity, and the tool says so wherever it shows both.
 * Kv and Cv
 * are separately DEFINED by different reference tests: Kv in m3/h of water at
 * 5 to 40 C across 1 bar, Cv in gpm of water at 60 F across 1 psi. The 0.865 is
 * a rounded empirical relation between two definitions, not a conversion factor,
 * and that is why the engine works in Cv and this sits at the display edge
 * where its inexactness cannot propagate into anything.
 */
export const KV_PER_CV = 0.865;
export const cvToKv = (Cv) => Cv * KV_PER_CV;
export const kvToCv = (Kv) => Kv / KV_PER_CV;

/**
 * Gauge to absolute.
 *
 * A gauge value cannot be detected from the number alone: 101 kPa is a
 * perfectly valid absolute pressure and also the likeliest mis-entered gauge
 * one. So this is a declared conversion the user chooses, not a guess the tool
 * makes, and the engine only ever receives absolute.
 */
export const gaugeToAbsolute = (gauge, atmospheric = EXACT.ATMOSPHERIC_KPA) => gauge + atmospheric;
export const absoluteToGauge = (abs, atmospheric = EXACT.ATMOSPHERIC_KPA) => abs - atmospheric;

/**
 * Temperature is the one quantity carrying an offset instead of a factor, so it
 * does not fit the multiply-by-a-factor table and carries an explicit pair of
 * functions instead. The engine works in K.
 */
export const celsiusToKelvin = (c) => c + 273.15;
export const kelvinToCelsius = (k) => k - 273.15;
export const fahrenheitToKelvin = (f) => (f - 32) * (5 / 9) + 273.15;
export const kelvinToFahrenheit = (k) => (k - 273.15) * (9 / 5) + 32;
export const toKelvin = (system, value) => (system === 'us' ? fahrenheitToKelvin(value) : celsiusToKelvin(value));

// One row per quantity per unit system: multiply by `factor` to reach internal,
// or call `to` and `from` where the conversion has an offset.
const ROWS = {
    pressure: {
        si: { label: 'kPa', factor: 1 },
        us: { label: 'psi', factor: EXACT.PSI_TO_KPA },
    },
    volumeFlow: {
        si: { label: 'm3/h', factor: 1 },
        us: { label: 'gpm', factor: EXACT.GPM_TO_M3H },
    },
    massFlow: {
        si: { label: 'kg/h', factor: 1 },
        us: { label: 'lb/h', factor: EXACT.LB_TO_KG },
    },
    density: {
        si: { label: 'kg/m3', factor: 1 },
        us: { label: 'lb/ft3', factor: EXACT.LBFT3_TO_KGM3 },
    },
    diameter: {
        si: { label: 'mm', factor: 1 },
        us: { label: 'in', factor: EXACT.INCH_TO_MM },
    },
    temperature: {
        si: { label: 'C', to: celsiusToKelvin, from: kelvinToCelsius },
        us: { label: 'F', to: fahrenheitToKelvin, from: kelvinToFahrenheit },
    },
};

export const unitLabel = (quantity, system) => ROWS[quantity][system].label;

/** User value to internal. */
export function toInternal(quantity, system, value) {
    if (!Number.isFinite(value)) return value;
    const row = ROWS[quantity][system];
    return row.to ? row.to(value) : value * row.factor;
}

/** Internal value back to the user's system. */
export function fromInternal(quantity, system, value) {
    if (!Number.isFinite(value)) return value;
    const row = ROWS[quantity][system];
    return row.from ? row.from(value) : value / row.factor;
}

export const QUANTITIES = Object.freeze(Object.keys(ROWS));
