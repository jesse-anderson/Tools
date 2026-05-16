(function () {
    'use strict';

    // ========================================
    // DEFAULT INPUT VALUES (single source of truth)
    // ========================================
    // 25°C Tdb / 101.325 kPa Pa / 0 m altitude as the SI reference.
    // IP values are exact conversions of the SI numbers, rounded to display precision.
    const DEFAULTS = {
        si: { Tdb: 25, pressure: 101.325, altitude: 0,
              rh: 50, twb: 18, tdp: 14, w: 10, twbPlaceholder: '18', tdpPlaceholder: '14', wPlaceholder: '10' },
        ip: { Tdb: 77, pressure: 14.696, altitude: 0,
              rh: 50, twb: 65.3, tdp: 56.97, w: 0.01, twbPlaceholder: '65', tdpPlaceholder: '57', wPlaceholder: '0.01' }
    };

    // Apply DEFAULTS to inputs for the current units + mode.
    function applyDefaultsToInputs() {
        const d = DEFAULTS[units];
        const inputTdb = document.getElementById('inputTdb');
        const input2 = document.getElementById('input2');
        const inputPressure = document.getElementById('inputPressure');
        const inputAltitude = document.getElementById('inputAltitude');

        inputTdb.value = d.Tdb;
        inputPressure.value = d.pressure;
        if (inputAltitude) inputAltitude.value = d.altitude;

        switch (inputMode) {
            case 'tdb_rh':  input2.value = d.rh;  break;
            case 'tdb_twb': input2.value = d.twb; break;
            case 'tdb_tdp': input2.value = d.tdp; break;
            case 'tdb_w':   input2.value = d.w;   break;
        }
    }

    // ========================================
    // UI UPDATE FUNCTIONS
    // ========================================
    function updateDisplay(state) {
        const isIP = units === 'ip';

        // Update calculation detail unit labels (these are separate elements not affected by innerHTML updates)
        const calcUnits = {
            calcUnitPressure: isIP ? 'psi' : 'kPa',
            calcUnitPws: isIP ? 'psi' : 'kPa',
            calcUnitPw: isIP ? 'psi' : 'kPa',
            calcUnitW: isIP ? 'lb/lb' : 'kg/kg',
            calcUnitTdp: isIP ? '°F' : '°C',
            calcUnitH: isIP ? 'Btu/lb' : 'kJ/kg',
            calcUnitTwb: isIP ? '°F' : '°C',
            calcUnitV: isIP ? 'ft³/lb' : 'm³/kg',
            calcUnitRho: isIP ? 'lb/ft³' : 'kg/m³'
        };

        for (const [id, value] of Object.entries(calcUnits)) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        }

        const pressureEl = document.getElementById('pressureUnitDisplay');
        if (pressureEl) pressureEl.textContent = isIP ? 'psi' : 'kPa';

        // Format values based on unit system
        const formatValue = (value, siUnit) => {
            if (siUnit === 'temp') {
                return isIP ? PSY.CtoF(value).toFixed(2) : value.toFixed(2);
            } else if (siUnit === 'pressure') {
                return isIP ? PSY.kPaToPsi(value).toFixed(4) : value.toFixed(3);
            } else if (siUnit === 'W') {
                // Humidity ratio
                if (isIP) {
                    // Convert kg/kg to lb/lb (same numeric value, just different unit label)
                    return value.toFixed(6);
                } else {
                    return (value * 1000).toFixed(2); // g/kg
                }
            } else if (siUnit === 'h') {
                return isIP ? PSY.kJkgToBtulb(value).toFixed(2) : value.toFixed(2);
            } else if (siUnit === 'v') {
                return isIP ? PSY.m3kgToFt3lb(value).toFixed(3) : value.toFixed(3);
            } else if (siUnit === 'rho') {
                if (isIP) {
                    // kg/m³ to lb/ft³: 1 kg/m³ = 0.06243 lb/ft³
                    return (value * 0.06243).toFixed(4);
                }
                return value.toFixed(3);
            }
            return value;
        };

        // Update current state values (innerHTML updates include the unit labels)
        document.getElementById('valTdb').innerHTML = formatValue(state.Tdb, 'temp') + ' <span class="value-sub">' + (isIP ? '°F' : '°C') + '</span>';
        document.getElementById('valTwb').innerHTML = formatValue(state.Twb, 'temp') + ' <span class="value-sub">' + (isIP ? '°F' : '°C') + '</span>';
        document.getElementById('valTdp').innerHTML = formatValue(state.Tdp, 'temp') + ' <span class="value-sub">' + (isIP ? '°F' : '°C') + '</span>';
        document.getElementById('valRH').textContent = state.RH.toFixed(1) + ' %';
        document.getElementById('valW').innerHTML = formatValue(state.W, 'W') + ' <span class="value-sub">' + (isIP ? 'lb/lb' : 'g/kg') + '</span>';
        document.getElementById('valH').innerHTML = formatValue(state.h, 'h') + ' <span class="value-sub">' + (isIP ? 'Btu/lb' : 'kJ/kg') + '</span>';
        document.getElementById('valV').innerHTML = formatValue(state.v, 'v') + ' <span class="value-sub">' + (isIP ? 'ft³/lb' : 'm³/kg') + '</span>';
        document.getElementById('valPws').innerHTML = formatValue(state.Pws, 'pressure') + ' <span class="value-sub muted">' + (isIP ? 'psi' : 'kPa') + '</span>';
        document.getElementById('valPw').innerHTML = formatValue(state.Pw, 'pressure') + ' <span class="value-sub muted">' + (isIP ? 'psi' : 'kPa') + '</span>';

        // Update calculation details
        const Pa = getInputPressureKPa();
        document.getElementById('calcTdb').textContent = formatValue(state.Tdb, 'temp') + ' ' + (isIP ? '°F' : '°C');
        document.getElementById('calcInput2').textContent = getInput2Label() + ': ' + getInput2Value();
        document.getElementById('calcPressure').innerHTML = formatValue(Pa, 'pressure') + ' <span class="calc-small">' + (isIP ? 'psi' : 'kPa') + '</span>';

        document.getElementById('calcPws').innerHTML = formatValue(state.Pws, 'pressure') + ' <span class="calc-small">' + (isIP ? 'psi' : 'kPa') + '</span>';
        document.getElementById('calcPw').innerHTML = formatValue(state.Pw, 'pressure') + ' <span class="calc-small">' + (isIP ? 'psi' : 'kPa') + '</span>';
        document.getElementById('calcW').innerHTML = state.W.toFixed(6) + ' <span class="calc-small">' + (isIP ? 'lb/lb' : 'kg/kg') + '</span>';
        document.getElementById('calcTdp').textContent = formatValue(state.Tdp, 'temp') + ' ' + (isIP ? '°F' : '°C');
        document.getElementById('calcH').innerHTML = formatValue(state.h, 'h') + ' <span class="calc-small">' + (isIP ? 'Btu/lb' : 'kJ/kg') + '</span>';
        document.getElementById('calcTwb').textContent = formatValue(state.Twb, 'temp') + ' ' + (isIP ? '°F' : '°C');
        document.getElementById('calcV').innerHTML = formatValue(state.v, 'v') + ' <span class="calc-small">' + (isIP ? 'ft³/lb' : 'm³/kg') + '</span>';
        document.getElementById('calcRho').innerHTML = formatValue(state.rho, 'rho') + ' <span class="calc-small">' + (isIP ? 'lb/ft³' : 'kg/m³') + '</span>';
        document.getElementById('calcMu').textContent = state.mu.toFixed(3);
        document.getElementById('calcIterations').textContent = getWetBulbSolverLabel(state);

        // Update validation checks (slack matches core.js validateState)
        const slack = CONFIG.physicalSlackC;
        const check1 = state.Tdp <= state.Twb + slack && state.Twb <= state.Tdb + slack;
        const check2 = state.RH >= 0 && state.RH <= 100.1;
        const check3 = Pa >= CONFIG.pressure.min && Pa <= CONFIG.pressure.max;

        document.getElementById('calcCheck1').textContent = check1 ? 'Pass' : 'Fail';
        document.getElementById('calcCheck1').className = 'calc-value ' + (check1 ? 'calc-success' : '');
        document.getElementById('calcCheck2').textContent = check2 ? 'Pass' : 'Fail';
        document.getElementById('calcCheck2').className = 'calc-value ' + (check2 ? 'calc-success' : '');
        document.getElementById('calcCheck3').textContent = check3 ? 'Pass' : 'Fail';
        document.getElementById('calcCheck3').className = 'calc-value ' + (check3 ? 'calc-success' : '');

        // Update status
        const statusBadge = document.getElementById('statusBadge');
        const statusDot = document.getElementById('statusDot');
        const stateLabel = document.getElementById('stateLabel');

        if (state.RH >= 99.5) {
            statusBadge.textContent = 'Saturated';
            statusBadge.className = 'status-badge warn';
            statusDot.className = 'status-dot warn';
            stateLabel.textContent = 'Saturated (RH ~ 100%)';
        } else {
            statusBadge.textContent = 'Unsaturated';
            statusBadge.className = 'status-badge ok';
            statusDot.className = 'status-dot';
            stateLabel.textContent = `Unsaturated (${state.RH.toFixed(1)}% RH)`;
        }

        // Update warning if present
        const warningSection = document.getElementById('calcWarningSection');
        const warning = document.getElementById('calcWarning');
        if (state.warning) {
            warningSection.style.display = 'block';
            warning.textContent = state.warning;
        } else {
            warningSection.style.display = 'none';
        }

        // Update step-by-step content
        updateStepsContent(state);
    }

    function formatTemp(T) {
        if (units === 'ip') {
            return PSY.CtoF(T).toFixed(2) + ' °F';
        }
        return T.toFixed(2) + ' °C';
    }

    function getInput2Label() {
        const labels = {
            'tdb_rh': 'RH',
            'tdb_twb': 'Twb',
            'tdb_tdp': 'Tdp',
            'tdb_w': 'W'
        };
        return labels[inputMode];
    }

    function getInput2Value() {
        const input2 = document.getElementById('input2');
        const val = parseFloat(input2.value) || 0;
        switch(inputMode) {
            case 'tdb_rh':
                return input2.value + ' %';
            case 'tdb_twb':
                return formatTemp(val);
            case 'tdb_tdp':
                return formatTemp(val);
            case 'tdb_w':
                return input2.value + (units === 'ip' ? ' lb/lb' : ' g/kg');
        }
    }

    function updateStepsContent(state) {
        const container = document.getElementById('stepsContent');
        const Pa = getInputPressureKPa();

        // Build step content based on current input mode
        let step2Content = '';
        let step1Content = '';

        if (inputMode === 'tdb_rh') {
            // Mode: Tdb + RH
            step1Content = `
                <div class="step-group">
                    <div class="step-group-title">Step 1: Calculate Saturation Pressure</div>
                    <div class="step-item">
                        <span class="step-num">1.1</span>
                        <div class="step-content">
                            <div class="step-desc">Convert dry bulb to Kelvin</div>
                            <div class="step-math">T(K) = ${state.Tdb}°C + 273.15 = ${PSY.CtoK(state.Tdb).toFixed(2)} K</div>
                        </div>
                    </div>
                    <div class="step-item">
                        <span class="step-num">1.2</span>
                        <div class="step-content">
                            <div class="step-desc">Apply ASHRAE Eq. 6 (water above 0°C): ln(Pws) = C1/T + C2 + C3*T + C4*T^2 + C5*T^3 + C6*ln(T)</div>
                            <div class="step-math">Pws(Tdb) = ${state.Pws.toFixed(3)} kPa</div>
                        </div>
                    </div>
                </div>
            `;
            step2Content = `
                <div class="step-group">
                    <div class="step-group-title">Step 2: Calculate Vapor Pressure & Humidity Ratio</div>
                    <div class="step-item">
                        <span class="step-num">2.1</span>
                        <div class="step-content">
                            <div class="step-desc">Calculate partial vapor pressure</div>
                            <div class="step-math">Pw = RH/100 × Pws = ${(state.RH/100).toFixed(4)} × ${state.Pws.toFixed(3)} = ${state.Pw.toFixed(3)} kPa</div>
                        </div>
                    </div>
                    <div class="step-item highlight">
                        <span class="step-num">2.2</span>
                        <div class="step-content">
                            <div class="step-desc">Calculate humidity ratio: W = 0.621945 × Pw / (Pa - Pw)</div>
                            <div class="step-math">W = 0.621945 × ${state.Pw.toFixed(3)} / (${Pa.toFixed(3)} - ${state.Pw.toFixed(3)}) = ${(state.W * 1000).toFixed(3)} g/kg</div>
                        </div>
                    </div>
                </div>
            `;
        } else if (inputMode === 'tdb_twb') {
            // Mode: Tdb + Twb
            step1Content = `
                <div class="step-group">
                    <div class="step-group-title">Step 1: Calculate Saturation at Wet Bulb</div>
                    <div class="step-item">
                        <span class="step-num">1.1</span>
                        <div class="step-content">
                            <div class="step-desc">Convert wet bulb to Kelvin</div>
                            <div class="step-math">Twb(K) = ${state.Twb}°C + 273.15 = ${PSY.CtoK(state.Twb).toFixed(2)} K</div>
                        </div>
                    </div>
                    <div class="step-item">
                        <span class="step-num">1.2</span>
                        <div class="step-content">
                            <div class="step-desc">Apply ASHRAE Eq. 5 at Twb</div>
                            <div class="step-math">Pws(Twb) = ${PSY.Pws(state.Twb).toFixed(3)} kPa</div>
                        </div>
                    </div>
                </div>
            `;
            step2Content = `
                <div class="step-group">
                    <div class="step-group-title">Step 2: Wet-Bulb Relation & Humidity Ratio</div>
                    <div class="step-item">
                        <span class="step-num">2.1</span>
                        <div class="step-content">
                            <div class="step-desc">Calculate saturation humidity ratio at Twb</div>
                            <div class="step-math">Ws(Twb) = ${PSY.W_from_Pw(PSY.Pws(state.Twb), Pa).toFixed(6)} kg/kg</div>
                        </div>
                    </div>
                    <div class="step-item highlight">
                        <span class="step-num">2.2</span>
                        <div class="step-content">
                            <div class="step-desc">Solve ASHRAE wet-bulb humidity-ratio equation at Tdb</div>
                            <div class="step-math">GetHumRatioFromTWetBulb(Tdb, Twb, Pa) = ${(state.W * 1000).toFixed(3)} g/kg</div>
                        </div>
                    </div>
                </div>
            `;
        } else if (inputMode === 'tdb_tdp') {
            // Mode: Tdb + Tdp
            step1Content = `
                <div class="step-group">
                    <div class="step-group-title">Step 1: Calculate Saturation Pressure</div>
                    <div class="step-item">
                        <span class="step-num">1.1</span>
                        <div class="step-content">
                            <div class="step-desc">Calculate Pws at dew point (Tdp, RH = 100%)</div>
                            <div class="step-math">Pws(Tdp) = ${PSY.Pws(state.Tdp).toFixed(3)} kPa = Pw</div>
                        </div>
                    </div>
                    <div class="step-item">
                        <span class="step-num">1.2</span>
                        <div class="step-content">
                            <div class="step-desc">Calculate Pws at dry bulb temperature</div>
                            <div class="step-math">Pws(Tdb) = ${state.Pws.toFixed(3)} kPa</div>
                        </div>
                    </div>
                </div>
            `;
            step2Content = `
                <div class="step-group">
                    <div class="step-group-title">Step 2: Calculate Humidity Ratio & RH</div>
                    <div class="step-item">
                        <span class="step-num">2.1</span>
                        <div class="step-content">
                            <div class="step-desc">Calculate humidity ratio from Pw (at Tdp)</div>
                            <div class="step-math">W = 0.621945 × ${state.Pw.toFixed(3)} / (${Pa.toFixed(3)} - ${state.Pw.toFixed(3)}) = ${(state.W * 1000).toFixed(3)} g/kg</div>
                        </div>
                    </div>
                    <div class="step-item highlight">
                        <span class="step-num">2.2</span>
                        <div class="step-content">
                            <div class="step-desc">Calculate relative humidity</div>
                            <div class="step-math">RH = 100 × Pw / Pws(Tdb) = 100 × ${state.Pw.toFixed(3)} / ${state.Pws.toFixed(3)} = ${state.RH.toFixed(1)}%</div>
                        </div>
                    </div>
                </div>
            `;
        } else if (inputMode === 'tdb_w') {
            // Mode: Tdb + W
            step1Content = `
                <div class="step-group">
                    <div class="step-group-title">Step 1: Calculate Saturation Pressure</div>
                    <div class="step-item">
                        <span class="step-num">1.1</span>
                        <div class="step-content">
                            <div class="step-desc">Convert dry bulb to Kelvin</div>
                            <div class="step-math">T(K) = ${state.Tdb}°C + 273.15 = ${PSY.CtoK(state.Tdb).toFixed(2)} K</div>
                        </div>
                    </div>
                    <div class="step-item">
                        <span class="step-num">1.2</span>
                        <div class="step-content">
                            <div class="step-desc">Apply ASHRAE Eq. 6 (water above 0°C): ln(Pws) = C1/T + C2 + C3*T + C4*T^2 + C5*T^3 + C6*ln(T)</div>
                            <div class="step-math">Pws(Tdb) = ${state.Pws.toFixed(3)} kPa</div>
                        </div>
                    </div>
                </div>
            `;
            step2Content = `
                <div class="step-group">
                    <div class="step-group-title">Step 2: Calculate Vapor Pressure & RH</div>
                    <div class="step-item">
                        <span class="step-num">2.1</span>
                        <div class="step-content">
                            <div class="step-desc">Calculate partial vapor pressure from W: Pw = W*Pa / (0.621945 + W)</div>
                            <div class="step-math">Pw = ${state.W.toFixed(6)} × ${Pa.toFixed(3)} / (0.621945 + ${state.W.toFixed(6)}) = ${state.Pw.toFixed(3)} kPa</div>
                        </div>
                    </div>
                    <div class="step-item highlight">
                        <span class="step-num">2.2</span>
                        <div class="step-content">
                            <div class="step-desc">Calculate relative humidity</div>
                            <div class="step-math">RH = 100 × Pw / Pws(Tdb) = 100 × ${state.Pw.toFixed(3)} / ${state.Pws.toFixed(3)} = ${state.RH.toFixed(1)}%</div>
                        </div>
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="steps-container">
                ${step1Content}

                ${step2Content}

                <div class="step-group">
                    <div class="step-group-title">Step 3: Calculate Dew Point</div>
                    <div class="step-item">
                        <span class="step-num">3.1</span>
                        <div class="step-content">
                            <div class="step-desc">Invert ASHRAE Eq. 5 using Newton-Raphson</div>
                            <div class="step-math">Tdp = ${state.Tdp.toFixed(2)}°C (found by Pws(Tdp) = Pw = ${state.Pw.toFixed(3)} kPa)</div>
                        </div>
                    </div>
                </div>

                <div class="step-group">
                    <div class="step-group-title">Step 4: Calculate Enthalpy</div>
                    <div class="step-item highlight">
                        <span class="step-num">4.1</span>
                        <div class="step-content">
                            <div class="step-desc">Apply ASHRAE Eq. 30: h = 1.006 × Tdb + W × (2501 + 1.86 × Tdb)</div>
                            <div class="step-math">h = 1.006 × ${state.Tdb.toFixed(2)} + ${state.W.toFixed(6)} × (2501 + 1.86 × ${state.Tdb.toFixed(2)}) = ${state.h.toFixed(2)} kJ/kg</div>
                        </div>
                    </div>
                </div>

                <div class="step-group">
                    <div class="step-group-title">Step 5: Calculate Wet Bulb (PsychroLib)</div>
                    <div class="step-item">
                        <span class="step-num">5.1</span>
                        <div class="step-content">
                            <div class="step-desc">Solve ASHRAE wet-bulb humidity-ratio relation using dry bulb, W, and pressure</div>
                            <div class="step-math">GetTWetBulbFromHumRatio(Tdb=${state.Tdb.toFixed(2)}°C, W=${state.W.toFixed(6)} kg/kg, Pa=${Pa.toFixed(3)} kPa)</div>
                        </div>
                    </div>
                    <div class="step-item result">
                        <span class="step-num">5.2</span>
                        <div class="step-content">
                            <div class="step-desc">${getWetBulbSolverLabel(state)}</div>
                            <div class="step-math">Twb = ${state.Twb.toFixed(2)}°C</div>
                        </div>
                    </div>
                </div>

                <div class="step-group">
                    <div class="step-group-title">Step 6: Calculate Specific Volume</div>
                    <div class="step-item">
                        <span class="step-num">6.1</span>
                        <div class="step-content">
                            <div class="step-desc">Apply: v = Ra × T(K) × (1 + 1.6078 × W) / Pa</div>
                            <div class="step-math">v = 0.2871 × ${PSY.CtoK(state.Tdb).toFixed(2)} × (1 + 1.6078 × ${state.W.toFixed(5)}) / ${Pa.toFixed(3)} = ${state.v.toFixed(3)} m³/kg</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // ========================================
    // CALCULATION FUNCTION
    // ========================================
    function calculate() {
        let Tdb = parseFloat(document.getElementById('inputTdb').value);
        let input2 = parseFloat(document.getElementById('input2').value);
        let Pa = parseFloat(document.getElementById('inputPressure').value);

        if (isNaN(Tdb) || isNaN(input2) || isNaN(Pa)) {
            return;
        }

        // Input validation ranges (SI units for internal validation)
        const VALID_RANGES = {
            Tdb: { min: -60, max: 60 },      // °C - ASHRAE Eq. 5/6 valid range
            Pa: { min: 50, max: 150 },      // kPa - typical atmospheric range
            RH: { min: 0, max: 99.9 },      // % - capped at 99.9% for numerical stability
            Twb: { min: -60, max: 60 },     // °C
            Tdp: { min: -60, max: 60 },     // °C
            W: { min: 0, max: 0.05 }        // kg/kg (0 to 50 g/kg)
        };

        // Clear previous error
        const errorEl = document.getElementById('calculationError');
        if (errorEl) errorEl.remove();

        // Convert from IP to SI if needed
        let Tdb_SI = Tdb;
        let input2_SI = input2;
        let Pa_SI = Pa;

        if (units === 'ip') {
            Tdb_SI = PSY.FtoC(Tdb);  // °F to °C
            Pa_SI = PSY.psiTokPa(Pa);  // psi to kPa
            // input2 depends on the mode
            if (inputMode === 'tdb_twb' || inputMode === 'tdb_tdp') {
                input2_SI = PSY.FtoC(input2);  // °F to °C
            }
            // For tdb_rh (RH) and tdb_w (W), no conversion needed
        }

        // Validate temperature range
        if (Tdb_SI < VALID_RANGES.Tdb.min || Tdb_SI > VALID_RANGES.Tdb.max) {
            showCalculationError(`Temperature out of range (${VALID_RANGES.Tdb.min} to ${VALID_RANGES.Tdb.max}°C). Enter a value within this range.`);
            return;
        }

        // Validate pressure range
        if (Pa_SI < VALID_RANGES.Pa.min || Pa_SI > VALID_RANGES.Pa.max) {
            showCalculationError(`Pressure out of range (${VALID_RANGES.Pa.min} to ${VALID_RANGES.Pa.max} kPa). Enter a value within typical atmospheric range.`);
            return;
        }

        // Mode-specific validation
        if (inputMode === 'tdb_rh') {
            if (input2 < VALID_RANGES.RH.min || input2 > VALID_RANGES.RH.max) {
                showCalculationError(`Relative humidity must be between ${VALID_RANGES.RH.min}% and ${VALID_RANGES.RH.max}% (capped for numerical stability).`);
                return;
            }
        } else if (inputMode === 'tdb_twb') {
            if (input2_SI < VALID_RANGES.Twb.min || input2_SI > VALID_RANGES.Twb.max) {
                showCalculationError(`Wet bulb temperature out of range (${VALID_RANGES.Twb.min} to ${VALID_RANGES.Twb.max}°C).`);
                return;
            }
            // Check physical constraint: Twb cannot exceed Tdb
            if (input2_SI > Tdb_SI + 0.5) {
                showCalculationError(`Wet bulb temperature (${input2_SI.toFixed(1)}°C) cannot exceed dry bulb temperature (${Tdb_SI.toFixed(1)}°C).`);
                return;
            }
        } else if (inputMode === 'tdb_tdp') {
            if (input2_SI < VALID_RANGES.Tdp.min || input2_SI > VALID_RANGES.Tdp.max) {
                showCalculationError(`Dew point temperature out of range (${VALID_RANGES.Tdp.min} to ${VALID_RANGES.Tdp.max}°C).`);
                return;
            }
            // Check physical constraint: Tdp cannot exceed Tdb
            if (input2_SI > Tdb_SI + 0.5) {
                showCalculationError(`Dew point temperature (${input2_SI.toFixed(1)}°C) cannot exceed dry bulb temperature (${Tdb_SI.toFixed(1)}°C).`);
                return;
            }
        } else if (inputMode === 'tdb_w') {
            const W_SI = units === 'ip' ? input2 : input2 / 1000;
            if (W_SI < VALID_RANGES.W.min || W_SI > VALID_RANGES.W.max) {
                const maxDisplay = units === 'ip' ? VALID_RANGES.W.max : VALID_RANGES.W.max * 1000;
                const unitDisplay = units === 'ip' ? 'lb/lb' : 'g/kg';
                showCalculationError(`Humidity ratio out of range (0 to ${maxDisplay} ${unitDisplay}).`);
                return;
            }
        }

        // Proceed with calculation using validated SI values
        let result;
        switch(inputMode) {
            case 'tdb_rh':
                result = PSY.solve_Tdb_RH(Tdb_SI, input2, Pa_SI);
                break;
            case 'tdb_twb':
                result = PSY.solve_Tdb_Twb(Tdb_SI, input2_SI, Pa_SI);
                break;
            case 'tdb_tdp':
                result = PSY.solve_Tdb_Tdp(Tdb_SI, input2_SI, Pa_SI);
                break;
            case 'tdb_w':
                // In SI mode, input is g/kg (divide by 1000 for kg/kg)
                // In IP mode, input is lb/lb (already in correct form, same as kg/kg numerically)
                const W_input = units === 'ip' ? input2 : input2 / 1000;
                result = PSY.solve_Tdb_W(Tdb_SI, W_input, Pa_SI);
                break;
        }

        currentState = result;
        updateDisplay(result);
        if (typeof PROCESS !== 'undefined') {
            PROCESS.refresh();
        }
        CHART.draw();
    }

    // Helper function to show calculation error
    function showCalculationError(message) {
        // Remove existing error if any
        const existingError = document.getElementById('calculationError');
        if (existingError) existingError.remove();

        // Create error element
        const errorEl = document.createElement('div');
        errorEl.id = 'calculationError';
        errorEl.className = 'calculation-error';
        errorEl.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 14c-3.3 0-6-2.7-6-6s2.7-6 6-6 6 2.7 6 6-2.7 6-6 6zm.5-9h-1v4h1V5zm0 5h-1v1h1v-1z"/>
            </svg>
            <span>${message}</span>
        `;

        // Insert error above the controls/results panel (second panel, not chart)
        const panels = document.querySelectorAll('.panel');
        const controlsPanel = panels.length > 1 ? panels[1] : panels[0];
        const controlsHeader = controlsPanel ? controlsPanel.querySelector('.panel-header') : null;
        if (controlsHeader && controlsPanel) {
            controlsPanel.insertBefore(errorEl, controlsHeader);
        }
    }

    // ========================================
    // EVENT HANDLERS
    // ========================================
    function initEventListeners() {
        // Calculate button
        document.getElementById('calculateBtn').addEventListener('click', calculate);

        // Chart toolbar buttons (previously inline onclick=)
        const bind = (id, fn) => {
            const el = document.getElementById(id);
            if (el && typeof fn === 'function') el.addEventListener('click', fn);
        };
        bind('exportPngBtn', typeof exportPng === 'function' ? exportPng : null);
        bind('exportResultsBtn', typeof exportResults === 'function' ? exportResults : null);
        bind('showCalcTrailBtn', typeof showCalculationTrail === 'function' ? showCalculationTrail : null);
        bind('validateBtn', typeof validateCalculator === 'function' ? validateCalculator : null);

        // Altitude helper
        const inputAltitude = document.getElementById('inputAltitude');
        document.getElementById('applyAltitudeBtn').addEventListener('click', applyAltitudePressure);
        if (inputAltitude) {
            inputAltitude.addEventListener('input', updateAltitudePressureHint);
            inputAltitude.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    applyAltitudePressure();
                }
            });
        }

        // Reset button: restores all inputs to current-unit defaults for the active mode
        document.getElementById('resetInputBtn').addEventListener('click', () => {
            applyDefaultsToInputs();
            updateAltitudePressureHint();
            calculate();
        });

        // Input mode toggle
        document.querySelectorAll('.mode-toggle button').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mode-toggle button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                inputMode = btn.dataset.mode;

                // Update input 2 label and placeholder
                const label = document.getElementById('labelInput2');
                const input2 = document.getElementById('input2');
                const isIP = units === 'ip';
                const d = DEFAULTS[units];

                switch(inputMode) {
                    case 'tdb_rh':
                        label.textContent = 'Relative Humidity (%)';
                        input2.placeholder = '50';
                        input2.value = d.rh;
                        break;
                    case 'tdb_twb':
                        label.textContent = 'Wet Bulb (' + (isIP ? '°F' : '°C') + ')';
                        input2.placeholder = d.twbPlaceholder;
                        input2.value = d.twb;
                        break;
                    case 'tdb_tdp':
                        label.textContent = 'Dew Point (' + (isIP ? '°F' : '°C') + ')';
                        input2.placeholder = d.tdpPlaceholder;
                        input2.value = d.tdp;
                        break;
                    case 'tdb_w':
                        label.textContent = 'Humidity Ratio (' + (isIP ? 'lb/lb' : 'g/kg') + ')';
                        input2.placeholder = d.wPlaceholder;
                        input2.value = d.w;
                        break;
                }

                calculate();
            });
        });

        // Unit toggle
        document.querySelectorAll('.unit-toggle button').forEach(btn => {
            btn.addEventListener('click', () => {
                const newUnit = btn.dataset.unit;
                const oldUnit = units;
                const isIP = newUnit === 'ip';

                document.querySelectorAll('.unit-toggle button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                units = newUnit;

                // Update input labels
                document.getElementById('labelUnitTdb').textContent = isIP ? '°F' : '°C';
                document.getElementById('labelUnitPressure').textContent = isIP ? 'psi' : 'kPa';
                const altitudeLabel = document.getElementById('labelUnitAltitude');
                if (altitudeLabel) altitudeLabel.textContent = isIP ? 'ft' : 'm';

                // Update input2 label based on current mode
                const labelInput2 = document.getElementById('labelInput2');
                if (inputMode === 'tdb_twb') {
                    labelInput2.textContent = 'Wet Bulb (' + (isIP ? '°F' : '°C') + ')';
                } else if (inputMode === 'tdb_tdp') {
                    labelInput2.textContent = 'Dew Point (' + (isIP ? '°F' : '°C') + ')';
                } else if (inputMode === 'tdb_w') {
                    labelInput2.textContent = 'Humidity Ratio (' + (isIP ? 'lb/lb' : 'g/kg') + ')';
                }

                // Convert input values when switching units
                const inputTdb = document.getElementById('inputTdb');
                const input2 = document.getElementById('input2');
                const inputPressure = document.getElementById('inputPressure');
                const inputAltitude = document.getElementById('inputAltitude');

                if (oldUnit === 'si' && newUnit === 'ip') {
                    // SI to IP: convert current values
                    inputTdb.value = PSY.CtoF(parseFloat(inputTdb.value)).toFixed(1);
                    inputPressure.value = PSY.kPaToPsi(parseFloat(inputPressure.value)).toFixed(3);
                    if (inputAltitude && isFinite(parseFloat(inputAltitude.value))) {
                        inputAltitude.value = PSY.mToFt(parseFloat(inputAltitude.value)).toFixed(0);
                    }

                    // input2 depends on mode
                    if (inputMode === 'tdb_twb' || inputMode === 'tdb_tdp') {
                        input2.value = PSY.CtoF(parseFloat(input2.value)).toFixed(1);
                    } else if (inputMode === 'tdb_w') {
                        // g/kg to lb/lb
                        input2.value = (parseFloat(input2.value) / 1000).toFixed(5);
                        input2.placeholder = '0.01';
                    }
                    // RH doesn't need conversion

                } else if (oldUnit === 'ip' && newUnit === 'si') {
                    // IP to SI: convert current values
                    inputTdb.value = PSY.FtoC(parseFloat(inputTdb.value)).toFixed(1);
                    inputPressure.value = PSY.psiTokPa(parseFloat(inputPressure.value)).toFixed(3);
                    if (inputAltitude && isFinite(parseFloat(inputAltitude.value))) {
                        inputAltitude.value = PSY.ftToM(parseFloat(inputAltitude.value)).toFixed(0);
                    }

                    // input2 depends on mode
                    if (inputMode === 'tdb_twb' || inputMode === 'tdb_tdp') {
                        input2.value = PSY.FtoC(parseFloat(input2.value)).toFixed(1);
                    } else if (inputMode === 'tdb_w') {
                        // lb/lb to g/kg
                        input2.value = (parseFloat(input2.value) * 1000).toFixed(1);
                        input2.placeholder = '10';
                    }
                    // RH doesn't need conversion
                }

                updateAltitudePressureHint();
                calculate();
            });
        });

        // Chart overlay toggles
        ['toggleSaturation', 'toggleRH', 'toggleWetBulb', 'toggleEnthalpy', 'toggleVolume', 'toggleGrid', 'toggleGuides', 'toggleComfort'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => CHART.draw());
        });

        // Calculation details foldable
        document.getElementById('calcFoldableBtn').addEventListener('click', function() {
            this.classList.toggle('active');
            document.getElementById('calcFoldableContent').classList.toggle('active');
        });

        // Steps foldable
        document.getElementById('stepsBtn').addEventListener('click', function() {
            this.classList.toggle('active');
            document.getElementById('stepsContent').classList.toggle('active');
        });

        // Info buttons - modal
        document.querySelectorAll('.info-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                showModal(btn.dataset.modal);
            });
        });

        // Modal close
        document.getElementById('modalClose').addEventListener('click', closeModal);
        document.getElementById('modalOverlay').addEventListener('click', (e) => {
            if (e.target.id === 'modalOverlay') closeModal();
        });

        // Enter key to calculate
        document.querySelectorAll('input').forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') calculate();
            });
        });

        updateAltitudePressureHint();
    }

    // Exports
    window.calculate = calculate;
    window.initEventListeners = initEventListeners;
    window.updateDisplay = updateDisplay;
    window.showCalculationError = showCalculationError;
    const Psy = (window.Psy = window.Psy || {});
    Psy.calculate = calculate;
    Psy.initEventListeners = initEventListeners;
    Psy.defaults = DEFAULTS;
})();

