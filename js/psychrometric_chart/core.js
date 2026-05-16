    /* ========================================
       PSYCHROMETRIC CALCULATOR
       ASHRAE Fundamentals Handbook (2017/2021)
       Chapter 1: Psychrometrics
       ========================================
       Wrapped in an IIFE: symbols are kept private to this file; cross-file
       collaborators access them through window.Psy (see end of file) and through
       bare-identifier compatibility shims for `units`, `inputMode`, and
       `currentState`. */
(function () {
    'use strict';

    // ========================================
    // CONFIGURATION
    // ========================================
    const CONFIG = {
        // Chart data sweep range (SI units: °C, g/kg). These are the bounds at which
        // saturation / RH / enthalpy / volume / wet-bulb lines are computed. The
        // visible window is controlled separately via CHART.view (see chart.js).
        Tdb: { min: -10, max: 60 },
        W: { min: 0, max: 35 },
        viewPresets: {
            comfort: { Tdbmin: 15, Tdbmax: 32, Wmin: 0, Wmax: 22 },
            hvac:    { Tdbmin: 0,  Tdbmax: 45, Wmin: 0, Wmax: 28 },
            full:    { Tdbmin: -10, Tdbmax: 60, Wmin: 0, Wmax: 35 }
        },
        pressure: {
            min: 50,      // kPa
            max: 150,     // kPa
            seaLevel: 101.325
        },
        solver: {
            dewPoint: 1e-4,         // K tolerance
            wetBulb: 1e-6,          // kJ/kg enthalpy tolerance
            maxIterations: 100
        },
        // Slack (°C) allowed before flagging a physical-constraint violation.
        // Accounts for solver round-off when Tdp/Twb are derived from PsychroLib.
        physicalSlackC: 0.5,
        colors: {
            saturation: '#f59e0b',
            rhLine: 'rgba(6, 182, 212, 0.5)',
            enthalpy: 'rgba(34, 197, 94, 0.6)',
            volume: 'rgba(139, 92, 246, 0.5)',
            point: '#ef4444',
            grid: 'rgba(91, 99, 115, 0.3)',
            guide: 'rgba(245, 158, 11, 0.5)'
        }
    };

    // Mutable application state. All cross-file reads/writes go through this
    // object via window-property accessors below, so existing bare-identifier
    // code (`units === 'ip'`, `currentState = result`, etc.) keeps working.
    const STATE = { units: 'si', inputMode: 'tdb_rh', currentState: null };

    const defineSharedAccessor = (key) => {
        Object.defineProperty(window, key, {
            configurable: true,
            get: () => STATE[key],
            set: (v) => { STATE[key] = v; }
        });
    };
    defineSharedAccessor('units');
    defineSharedAccessor('inputMode');
    defineSharedAccessor('currentState');

    // ========================================
    // PSYCHROLIB WRAPPER
    // Uses PsychroLib (v2.5.0) for all ASHRAE calculations
    // https://github.com/psychrometrics/psychrolib
    // ========================================

    // Initialize PsychroLib with SI units (all calculations internal SI)
    const psychrolib = new Psychrometrics();
    psychrolib.SetUnitSystem(psychrolib.SI);

    // ASHRAE constants (for display/formula purposes, calculations use PsychroLib)
    const ASHRAE = {
        MW_ratio: 0.621945,
        R: { air: 0.2871, vapor: 0.4615 },
        cp: { air: 1.006, vapor: 1.86, water: 4.186 },
        h_fg_0: 2501
    };

    // ========================================
    // VALIDATION REFERENCE DATA
    // ========================================
    // Reference values computed using PsychroLib v2.5.0
    // PsychroLib is the canonical implementation of ASHRAE Fundamentals equations
    const REFERENCE_DATA = [
        {
            name: 'Tdb + RH: Comfort Room Conditions',
            mode: 'tdb_rh',
            input: { Tdb: 25, RH: 50, Pa: 101.325 },
            expected: { Twb: 17.89, Tdp: 13.86, RH: 50.00, W: 9.881, h: 50.32, v: 0.858 },
            tolerance: { Twb: 0.01, Tdp: 0.01, RH: 0.01, W: 0.01, h: 0.1, v: 0.001 }
        },
        {
            name: 'Tdb + RH: Warm & Humid',
            mode: 'tdb_rh',
            input: { Tdb: 30, RH: 70, Pa: 101.325 },
            expected: { Twb: 25.50, Tdp: 23.93, RH: 70.00, W: 18.795, h: 78.24, v: 0.885 },
            tolerance: { Twb: 0.01, Tdp: 0.01, RH: 0.01, W: 0.01, h: 0.1, v: 0.001 }
        },
        {
            name: 'Tdb + RH: Cool & Dry',
            mode: 'tdb_rh',
            input: { Tdb: 20, RH: 30, Pa: 101.325 },
            expected: { Twb: 10.85, Tdp: 1.91, RH: 30.00, W: 4.337, h: 31.13, v: 0.836 },
            tolerance: { Twb: 0.01, Tdp: 0.01, RH: 0.01, W: 0.01, h: 0.1, v: 0.001 }
        },
        {
            name: 'Tdb + Twb: Comfort Room Conditions',
            mode: 'tdb_twb',
            input: { Tdb: 25, Twb: 17.889432, Pa: 101.325 },
            expected: { Twb: 17.89, Tdp: 13.86, RH: 50.00, W: 9.881, h: 50.32, v: 0.858 },
            tolerance: { Twb: 0.01, Tdp: 0.01, RH: 0.05, W: 0.01, h: 0.1, v: 0.001 }
        },
        {
            name: 'Tdb + Tdp: Comfort Room Conditions',
            mode: 'tdb_tdp',
            input: { Tdb: 25, Tdp: 13.863973, Pa: 101.325 },
            expected: { Twb: 17.89, Tdp: 13.86, RH: 50.00, W: 9.881, h: 50.32, v: 0.858 },
            tolerance: { Twb: 0.01, Tdp: 0.01, RH: 0.05, W: 0.01, h: 0.1, v: 0.001 }
        },
        {
            name: 'Tdb + W: Comfort Room Conditions',
            mode: 'tdb_w',
            input: { Tdb: 25, W: 0.009881044, Pa: 101.325 },
            expected: { Twb: 17.89, Tdp: 13.86, RH: 50.00, W: 9.881, h: 50.32, v: 0.858 },
            tolerance: { Twb: 0.01, Tdp: 0.01, RH: 0.05, W: 0.01, h: 0.1, v: 0.001 }
        }
    ];

    // ========================================
    // PSYCHROLIB-BASED PSYCHROMETRIC FUNCTIONS
    // All calculations use PsychroLib (v2.5.0)
    // https://github.com/psychrometrics/psychrolib
    // ========================================
    const PSY = {
        // ========== Unit Conversion Functions ==========
        // These are kept as-is since they're simple conversions

        // Convert between Celsius and Kelvin
        CtoK(C) { return C + 273.15; },
        KtoC(K) { return K - 273.15; },

        // Convert between Celsius and Fahrenheit
        CtoF(C) { return C * 9/5 + 32; },
        FtoC(F) { return (F - 32) * 5/9; },

        // Convert kPa to psi (and vice versa)
        kPaToPsi(kPa) { return kPa * 0.145038; },
        psiTokPa(psi) { return psi / 0.145038; },

        // Convert g/kg to kg/kg (and vice versa)
        gkgToKgkg(gkg) { return gkg / 1000; },
        kgkgToGkg(kgkg) { return kgkg * 1000; },

        // Convert kJ/kg to Btu/lb (and vice versa)
        kJkgToBtulb(kJkg) { return kJkg * 0.429923; },
        BtulbTokJkg(Btulb) { return Btulb / 0.429923; },

        // Convert m³/kg to ft³/lb (and vice versa)
        m3kgToFt3lb(m3kg) { return m3kg * 16.0185; },
        ft3lbTom3kg(ft3lb) { return ft3lb / 16.0185; },

        // Convert altitude between meters and feet
        mToFt(m) { return m * 3.28084; },
        ftToM(ft) { return ft / 3.28084; },

        pressureFromAltitudeM(altitudeM) {
            const pressurePa = psychrolib.GetStandardAtmPressure(altitudeM);
            return pressurePa / 1000;
        },

        Tdb_from_h_W(h, W) {
            return psychrolib.GetTDryBulbFromEnthalpyAndHumRatio(h * 1000, W);
        },

        // ========== PsychroLib Wrapper Functions ==========
        // PsychroLib uses Pa for pressure and J/kg for enthalpy (SI mode)
        // Our interface uses kPa for pressure and kJ/kg for enthalpy
        // These wrappers handle the unit conversions transparently

        /**
         * Calculate saturation vapor pressure using PsychroLib
         * @param {number} T_C - Temperature in Celsius
         * @returns {number} Pws in kPa
         */
        Pws(T_C) {
            // PsychroLib GetSatVapPres returns Pa in SI mode
            const Pws_Pa = psychrolib.GetSatVapPres(T_C);
            return Pws_Pa / 1000; // Convert Pa to kPa
        },

        /**
         * Calculate humidity ratio from vapor pressure using PsychroLib
         * @param {number} Pw - Partial vapor pressure (kPa)
         * @param {number} Pa - Atmospheric pressure (kPa)
         * @returns {number} W in kg/kg
         */
        W_from_Pw(Pw, Pa) {
            // Convert kPa to Pa for PsychroLib
            const Pw_Pa = Pw * 1000;
            const Pa_Pa = Pa * 1000;
            return psychrolib.GetHumRatioFromVapPres(Pw_Pa, Pa_Pa);
        },

        /**
         * Calculate vapor pressure from humidity ratio using PsychroLib
         * @param {number} W - Humidity ratio (kg/kg)
         * @param {number} Pa - Atmospheric pressure (kPa)
         * @returns {number} Pw in kPa
         */
        Pw_from_W(W, Pa) {
            const Pa_Pa = Pa * 1000;
            const Pw_Pa = psychrolib.GetVapPresFromHumRatio(W, Pa_Pa);
            return Pw_Pa / 1000; // Convert Pa to kPa
        },

        /**
         * Calculate relative humidity from vapor pressure using PsychroLib
         * @param {number} Pw - Partial vapor pressure (kPa)
         * @param {number} T_C - Dry bulb temperature (°C)
         * @returns {number} RH in %
         */
        RH_from_Pw(Pw, T_C) {
            const Pw_Pa = Pw * 1000;
            // PsychroLib returns RH as 0-1, convert to 0-100
            return psychrolib.GetRelHumFromVapPres(T_C, Pw_Pa) * 100;
        },

        /**
         * Calculate specific enthalpy using PsychroLib
         * @param {number} T_C - Dry bulb temperature (°C)
         * @param {number} W - Humidity ratio (kg/kg)
         * @returns {number} h in kJ/kg_da
         */
        h(T_C, W) {
            // PsychroLib returns J/kg, convert to kJ/kg
            const h_Jpkg = psychrolib.GetMoistAirEnthalpy(T_C, W);
            return h_Jpkg / 1000;
        },

        /**
         * Calculate specific volume using PsychroLib
         * @param {number} T_C - Dry bulb temperature (°C)
         * @param {number} W - Humidity ratio (kg/kg)
         * @param {number} Pa - Atmospheric pressure (kPa)
         * @returns {number} v in m³/kg_da
         */
        v(T_C, W, Pa) {
            if (Pa <= 0) Pa = 101.325;
            const Pa_Pa = Pa * 1000;
            return psychrolib.GetMoistAirVolume(T_C, W, Pa_Pa);
        },

        /**
         * Calculate air density using PsychroLib
         * @param {number} T_C - Dry bulb temperature (°C)
         * @param {number} W - Humidity ratio (kg/kg)
         * @param {number} Pa - Atmospheric pressure (kPa)
         * @returns {number} rho in kg/m³
         */
        rho(T_C, W, Pa) {
            if (Pa <= 0) Pa = 101.325;
            const Pa_Pa = Pa * 1000;
            return psychrolib.GetMoistAirDensity(T_C, W, Pa_Pa);
        },

        /**
         * Calculate wet bulb temperature from dry bulb and humidity ratio.
         * PsychroLib solves the ASHRAE wet-bulb humidity-ratio relationship
         * directly; matching saturated-air enthalpy alone is not equivalent.
         * @param {number} Tdb - Dry bulb temperature (°C)
         * @param {number} W - Humidity ratio (kg/kg)
         * @param {number} Pa - Atmospheric pressure (kPa)
         * @returns {object} { Twb, iterations, log, converged, warning }
         */
        Twb_from_TdbW(Tdb, W, Pa) {
            const Pa_Pa = Pa * 1000;
            const Twb = psychrolib.GetTWetBulbFromHumRatio(Tdb, W, Pa_Pa);
            return {
                Twb,
                iterations: 0,
                log: [],
                converged: true
            };
        },

        /**
         * Main solver: calculate all properties from Tdb and RH
         * Uses PsychroLib's CalcPsychrometricsFromRelHum function
         * Returns: [HumRatio, TWetBulb, TDewPoint, VapPres, MoistAirEnthalpy, MoistAirVolume, DegreeOfSaturation]
         * @param {number} Tdb - Dry bulb temperature (°C)
         * @param {number} RH - Relative humidity (%)
         * @param {number} Pa - Atmospheric pressure (kPa)
         * @returns {object} All psychrometric properties
         */
        solve_Tdb_RH(Tdb, RH, Pa) {
            const Pa_Pa = Pa * 1000;
            const RH_fraction = RH / 100;

            // Use PsychroLib's comprehensive calculation function
            // Returns: [HumRatio, TWetBulb, TDewPoint, VapPres, MoistAirEnthalpy, MoistAirVolume, DegreeOfSaturation]
            const [W, Twb, Tdp, Pw_Pa, h_Jpkg, v, mu] =
                psychrolib.CalcPsychrometricsFromRelHum(Tdb, RH_fraction, Pa_Pa);

            // Convert units back to our interface
            const Pws_Pa = psychrolib.GetSatVapPres(Tdb);
            const Pws = Pws_Pa / 1000;
            const Pw = Pw_Pa / 1000;
            const h = h_Jpkg / 1000;

            // Calculate density
            const rho = this.rho(Tdb, W, Pa);

            // Validate state
            const stateWarning = this.validateState(Tdb, Twb, Tdp, RH, Pa);

            return {
                Tdb,
                Twb,
                Tdp,
                RH,
                W,
                h,
                v,
                rho,
                Pws,
                Pw,
                mu,
                iterations: 0,  // PsychroLib handles iteration internally
                Twb_log: [],
                Twb_converged: true,
                valid: true,
                warning: stateWarning
            };
        },

        /**
         * Main solver: calculate all properties from Tdb and Twb
         * Uses PsychroLib's CalcPsychrometricsFromTWetBulb function
         * @param {number} Tdb - Dry bulb temperature (°C)
         * @param {number} Twb - Wet bulb temperature (°C)
         * @param {number} Pa - Atmospheric pressure (kPa)
         * @returns {object} All psychrometric properties
         */
        solve_Tdb_Twb(Tdb, Twb, Pa) {
            const Pa_Pa = Pa * 1000;

            // Use PsychroLib's comprehensive calculation function
            const [W, Tdp, RH, Pw_Pa, h_Jpkg, v, mu] =
                psychrolib.CalcPsychrometricsFromTWetBulb(Tdb, Twb, Pa_Pa);

            // Convert units back to our interface
            const Pws_Pa = psychrolib.GetSatVapPres(Tdb);
            const Pws = Pws_Pa / 1000;
            const Pw = Pw_Pa / 1000;
            const h = h_Jpkg / 1000;
            const RH_pct = RH * 100;

            // Calculate density
            const rho = this.rho(Tdb, W, Pa);

            return {
                Tdb,
                Twb,
                Tdp,
                RH: RH_pct,
                W,
                h,
                v,
                rho,
                Pws,
                Pw,
                mu,
                iterations: 0,
                valid: true,
                warning: this.validateState(Tdb, Twb, Tdp, RH_pct, Pa)
            };
        },

        /**
         * Main solver: calculate all properties from Tdb and Tdp
         * Uses PsychroLib's CalcPsychrometricsFromTDewPoint function
         * @param {number} Tdb - Dry bulb temperature (°C)
         * @param {number} Tdp - Dew point temperature (°C)
         * @param {number} Pa - Atmospheric pressure (kPa)
         * @returns {object} All psychrometric properties
         */
        solve_Tdb_Tdp(Tdb, Tdp, Pa) {
            const Pa_Pa = Pa * 1000;

            // Use PsychroLib's comprehensive calculation function
            const [W, Twb, RH, Pw_Pa, h_Jpkg, v, mu] =
                psychrolib.CalcPsychrometricsFromTDewPoint(Tdb, Tdp, Pa_Pa);

            // Convert units back to our interface
            const Pws_Pa = psychrolib.GetSatVapPres(Tdb);
            const Pws = Pws_Pa / 1000;
            const Pw = Pw_Pa / 1000;
            const h = h_Jpkg / 1000;
            const RH_pct = RH * 100;

            // Calculate density
            const rho = this.rho(Tdb, W, Pa);

            // Validate state
            const stateWarning = this.validateState(Tdb, Twb, Tdp, RH_pct, Pa);

            return {
                Tdb,
                Twb,
                Tdp,
                RH: RH_pct,
                W,
                h,
                v,
                rho,
                Pws,
                Pw,
                mu,
                iterations: 0,
                Twb_log: [],
                Twb_converged: true,
                valid: true,
                warning: stateWarning
            };
        },

        /**
         * Main solver: calculate all properties from Tdb and W
         * @param {number} Tdb - Dry bulb temperature (°C)
         * @param {number} W - Humidity ratio (kg/kg)
         * @param {number} Pa - Atmospheric pressure (kPa)
         * @returns {object} All psychrometric properties
         */
        solve_Tdb_W(Tdb, W, Pa) {
            const Pa_Pa = Pa * 1000;

            // Calculate Pw from W
            const Pw_Pa = psychrolib.GetVapPresFromHumRatio(W, Pa_Pa);
            const Pws_Pa = psychrolib.GetSatVapPres(Tdb);

            // Calculate RH
            const RH_fraction = psychrolib.GetRelHumFromVapPres(Tdb, Pw_Pa);
            const RH = RH_fraction * 100;

            // Calculate Tdp
            const Tdp = psychrolib.GetTDewPointFromVapPres(Tdb, Pw_Pa);

            // Calculate enthalpy
            const h_Jpkg = psychrolib.GetMoistAirEnthalpy(Tdb, W);
            const h = h_Jpkg / 1000;

            // Calculate wet bulb
            const Twb_result = this.Twb_from_TdbW(Tdb, W, Pa);

            // Calculate specific volume
            const v = psychrolib.GetMoistAirVolume(Tdb, W, Pa_Pa);

            // Calculate density
            const rho = psychrolib.GetMoistAirDensity(Tdb, W, Pa_Pa);

            // Calculate degree of saturation
            const Ws = psychrolib.GetSatHumRatio(Tdb, Pa_Pa);
            const mu = psychrolib.GetDegreeOfSaturation(Tdb, W, Pa_Pa);

            // Convert pressures to kPa
            const Pws = Pws_Pa / 1000;
            const Pw = Pw_Pa / 1000;

            // Validate state
            const stateWarning = this.validateState(Tdb, Twb_result.Twb, Tdp, RH, Pa);
            const allWarnings = [Twb_result.warning, stateWarning].filter(w => w).join('; ') || null;

            return {
                Tdb,
                Twb: Twb_result.Twb,
                Tdp,
                RH,
                W,
                h,
                v,
                rho,
                Pws,
                Pw,
                mu,
                iterations: Twb_result.iterations,
                Twb_log: Twb_result.log,
                Twb_converged: Twb_result.converged,
                valid: true,
                warning: allWarnings
            };
        },

        /**
         * Validate psychrometric state
         */
        validateState(Tdb, Twb, Tdp, RH, Pa = 101.325) {
            const warnings = [];

            // Temperature validation
            if (Tdb < -60 || Tdb > 60) {
                warnings.push('Tdb outside valid range (-60 to 60°C)');
            }

            if (RH > 100.1) {
                warnings.push('RH > 100%: Supersaturated conditions (fog possible)');
            }

            if (RH < 0) {
                warnings.push('RH < 0%: Physically impossible state');
            }

            const slack = CONFIG.physicalSlackC;
            if (Tdp > Tdb + slack) {
                warnings.push('Tdp > Tdb: Physically impossible state');
            }

            if (Twb > Tdb + slack) {
                warnings.push('Twb > Tdb: Physically impossible state');
            }

            if (Tdp > Twb + slack) {
                warnings.push('Tdp > Twb: Physically impossible state');
            }

            // Pressure validation
            if (Pa < 50) {
                warnings.push('Pressure < 50 kPa: Outside typical atmospheric range (high altitude > 5000m)');
            } else if (Pa > 150) {
                warnings.push('Pressure > 150 kPa: Outside typical atmospheric range (below 3000m depth)');
            }

            return warnings.length > 0 ? warnings.join('; ') : null;
        }
    };

    function getInputPressureKPa() {
        const rawPressure = parseFloat(document.getElementById('inputPressure').value);
        if (!isFinite(rawPressure)) return CONFIG.pressure.seaLevel;
        return units === 'ip' ? PSY.psiTokPa(rawPressure) : rawPressure;
    }

    function getInputAltitudeM() {
        const input = document.getElementById('inputAltitude');
        if (!input) return 0;

        const rawAltitude = parseFloat(input.value);
        if (!isFinite(rawAltitude)) return 0;

        return units === 'ip' ? PSY.ftToM(rawAltitude) : rawAltitude;
    }

    function formatPressureForCurrentUnits(pressureKPa) {
        if (units === 'ip') {
            return {
                value: PSY.kPaToPsi(pressureKPa).toFixed(3),
                unit: 'psi'
            };
        }

        return {
            value: pressureKPa.toFixed(3),
            unit: 'kPa'
        };
    }

    function updateAltitudePressureHint() {
        const hint = document.getElementById('altitudePressureHint');
        if (!hint) return;

        const pressureKPa = PSY.pressureFromAltitudeM(getInputAltitudeM());
        if (!isFinite(pressureKPa)) {
            hint.textContent = 'Standard pressure at altitude: enter an altitude';
            return;
        }

        const pressure = formatPressureForCurrentUnits(pressureKPa);
        hint.textContent = `Standard pressure at altitude: ${pressure.value} ${pressure.unit}`;
    }

    function applyAltitudePressure() {
        const inputPressure = document.getElementById('inputPressure');
        if (!inputPressure) return;

        const pressureKPa = PSY.pressureFromAltitudeM(getInputAltitudeM());
        if (!isFinite(pressureKPa)) return;

        inputPressure.value = formatPressureForCurrentUnits(pressureKPa).value;
        updateAltitudePressureHint();
        calculate();
    }

    function getWetBulbSolverLabel(state) {
        return state.iterations > 0 ? `${state.iterations} iterations` : 'PsychroLib internal';
    }

    // ========================================
    // EXPORTS: one organized namespace + flat globals for back-compat
    // ========================================
    const Psy = (window.Psy = window.Psy || {});
    Psy.state = STATE;
    Psy.config = CONFIG;
    Psy.ashrae = ASHRAE;
    Psy.referenceData = REFERENCE_DATA;
    Psy.psychrolib = psychrolib;
    Psy.PSY = PSY;
    Psy.getInputPressureKPa = getInputPressureKPa;
    Psy.getInputAltitudeM = getInputAltitudeM;
    Psy.formatPressureForCurrentUnits = formatPressureForCurrentUnits;
    Psy.updateAltitudePressureHint = updateAltitudePressureHint;
    Psy.applyAltitudePressure = applyAltitudePressure;
    Psy.getWetBulbSolverLabel = getWetBulbSolverLabel;

    // Back-compat: tests, other psychrometric_chart files, and inline-callable
    // helpers still reference these as bare globals.
    window.CONFIG = CONFIG;
    window.ASHRAE = ASHRAE;
    window.REFERENCE_DATA = REFERENCE_DATA;
    window.psychrolib = psychrolib;
    window.PSY = PSY;
    window.getInputPressureKPa = getInputPressureKPa;
    window.getInputAltitudeM = getInputAltitudeM;
    window.formatPressureForCurrentUnits = formatPressureForCurrentUnits;
    window.updateAltitudePressureHint = updateAltitudePressureHint;
    window.applyAltitudePressure = applyAltitudePressure;
    window.getWetBulbSolverLabel = getWetBulbSolverLabel;
})();

