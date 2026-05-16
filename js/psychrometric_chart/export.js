(function () {
    'use strict';

    function exportPng() {
        const link = document.createElement('a');
        link.download = 'psychrometric-chart.png';
        link.href = composeExportImage();
        link.click();
    }

    // Build an off-screen PNG with title strip, chart, current-state readout,
    // and legend swatches. Falls back to the bare canvas if anything fails.
    function composeExportImage() {
        try {
            const src = CHART.canvas;
            const dpr = window.devicePixelRatio || 1;
            const chartW = src.width;
            const chartH = src.height;

            const headerH = Math.round(56 * dpr);
            const footerH = Math.round(60 * dpr);

            const out = document.createElement('canvas');
            out.width = chartW;
            out.height = chartH + headerH + footerH;
            const ctx = out.getContext('2d');

            // Background matches the chart canvas background
            const bg = (CHART.theme && CHART.theme.bg) || '#0a0e14';
            const fg = (CHART.theme && CHART.theme.textPrimary) || '#e6edf3';
            const fgDim = (CHART.theme && CHART.theme.textSecondary) || '#8b949e';
            const border = (CHART.theme && CHART.theme.border) || '#2d3748';
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, out.width, out.height);

            // ---- Header: title + timestamp ----
            ctx.fillStyle = fg;
            ctx.textBaseline = 'middle';
            ctx.font = `bold ${Math.round(16 * dpr)}px "Space Grotesk", "JetBrains Mono", sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillText('Psychrometric Chart', 20 * dpr, headerH / 2 - 8 * dpr);

            ctx.fillStyle = fgDim;
            ctx.font = `${Math.round(11 * dpr)}px "JetBrains Mono", monospace`;
            const ts = new Date().toLocaleString();
            ctx.fillText(`Generated ${ts}   |   ASHRAE 2017/2021`, 20 * dpr, headerH / 2 + 10 * dpr);

            // Current state on the right of header (if available)
            if (typeof currentState !== 'undefined' && currentState) {
                const isIP = units === 'ip';
                const t = (T) => isIP ? `${PSY.CtoF(T).toFixed(1)} °F` : `${T.toFixed(1)} °C`;
                const w = (W) => isIP ? `${W.toFixed(5)} lb/lb` : `${(W * 1000).toFixed(2)} g/kg`;
                const h = (H) => isIP ? `${PSY.kJkgToBtulb(H).toFixed(2)} Btu/lb` : `${H.toFixed(2)} kJ/kg`;
                const Pa = (typeof getInputPressureKPa === 'function') ? getInputPressureKPa() : 101.325;
                const summary = [
                    `Tdb ${t(currentState.Tdb)}`,
                    `RH ${currentState.RH.toFixed(1)}%`,
                    `W ${w(currentState.W)}`,
                    `h ${h(currentState.h)}`,
                    `Twb ${t(currentState.Twb)}`,
                    `P ${isIP ? PSY.kPaToPsi(Pa).toFixed(3) + ' psi' : Pa.toFixed(3) + ' kPa'}`
                ].join('   ');
                ctx.textAlign = 'right';
                ctx.fillStyle = fg;
                ctx.font = `${Math.round(11 * dpr)}px "JetBrains Mono", monospace`;
                ctx.fillText(summary, out.width - 20 * dpr, headerH / 2);
            }

            // Separator below header
            ctx.strokeStyle = border;
            ctx.lineWidth = 1 * dpr;
            ctx.beginPath();
            ctx.moveTo(0, headerH);
            ctx.lineTo(out.width, headerH);
            ctx.stroke();

            // ---- Chart bitmap ----
            ctx.drawImage(src, 0, headerH);

            // Separator above footer
            ctx.beginPath();
            ctx.moveTo(0, headerH + chartH);
            ctx.lineTo(out.width, headerH + chartH);
            ctx.stroke();

            // ---- Footer: legend strip ----
            const legendY = headerH + chartH + footerH / 2;
            const items = [
                { type: 'line', stroke: '#f59e0b', width: 3, label: 'Saturation (100% RH)' },
                { type: 'line', stroke: 'rgba(6, 182, 212, 0.85)', width: 1.5, label: 'Constant RH' },
                { type: 'line', stroke: 'rgba(34, 197, 94, 0.85)', width: 1.25, dash: [6, 4], label: 'Enthalpy' },
                { type: 'line', stroke: 'rgba(139, 92, 246, 0.75)', width: 1.25, dash: [1, 4], label: 'Volume' },
                { type: 'line', stroke: fgDim, width: 1, dash: [4, 3], label: 'Wet Bulb' },
                { type: 'dot',  fill: '#ef4444', label: 'Current State' }
            ];
            ctx.font = `${Math.round(10 * dpr)}px "JetBrains Mono", monospace`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';

            const padX = 20 * dpr;
            const swatchW = 22 * dpr;
            const swatchGap = 6 * dpr;
            const itemGap = 16 * dpr;
            let x = padX;
            items.forEach(item => {
                if (item.type === 'line') {
                    ctx.save();
                    ctx.strokeStyle = item.stroke;
                    ctx.lineWidth = item.width * dpr;
                    if (item.dash) ctx.setLineDash(item.dash.map(d => d * dpr));
                    ctx.beginPath();
                    ctx.moveTo(x, legendY);
                    ctx.lineTo(x + swatchW, legendY);
                    ctx.stroke();
                    ctx.restore();
                } else {
                    ctx.save();
                    ctx.fillStyle = item.fill;
                    ctx.beginPath();
                    ctx.arc(x + swatchW / 2, legendY, 4 * dpr, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
                ctx.fillStyle = fg;
                const labelX = x + swatchW + swatchGap;
                ctx.fillText(item.label, labelX, legendY);
                x = labelX + ctx.measureText(item.label).width + itemGap;
            });

            return out.toDataURL('image/png');
        } catch (e) {
            // Defensive fallback
            return CHART.canvas.toDataURL('image/png');
        }
    }

    // ========================================
    // RESULTS EXPORT FUNCTION
    // ========================================
    function exportResults() {
        if (!currentState) {
            alert('No calculation results to export. Please perform a calculation first.');
            return;
        }

        const isIP = units === 'ip';
        const timestamp = new Date().toISOString();
        const dateStr = new Date().toLocaleString();

        // Get input values
        const inputTdb = parseFloat(document.getElementById('inputTdb').value);
        const input2 = parseFloat(document.getElementById('input2').value);
        const inputPa = parseFloat(document.getElementById('inputPressure').value);
        const inputAltitude = parseFloat(document.getElementById('inputAltitude').value);
        const altitudeM = getInputAltitudeM();
        const standardPressureKPa = PSY.pressureFromAltitudeM(altitudeM);
        const standardPressureDisplay = isIP ? PSY.kPaToPsi(standardPressureKPa) : standardPressureKPa;
        const pressureDeltaDisplay = inputPa - standardPressureDisplay;
        const resultUnits = {
            temp: isIP ? '°F' : '°C',
            pressure: isIP ? 'psi' : 'kPa',
            altitude: isIP ? 'ft' : 'm',
            W: isIP ? 'lb/lb' : 'g/kg',
            h: isIP ? 'Btu/lb' : 'kJ/kg',
            v: isIP ? 'ft³/lb' : 'm³/kg',
            rho: isIP ? 'lb/ft³' : 'kg/m³'
        };
        const resultValues = {
            Tdb: isIP ? PSY.CtoF(currentState.Tdb) : currentState.Tdb,
            Twb: isIP ? PSY.CtoF(currentState.Twb) : currentState.Twb,
            Tdp: isIP ? PSY.CtoF(currentState.Tdp) : currentState.Tdp,
            W: isIP ? currentState.W : currentState.W * 1000,
            h: isIP ? PSY.kJkgToBtulb(currentState.h) : currentState.h,
            v: isIP ? PSY.m3kgToFt3lb(currentState.v) : currentState.v,
            rho: isIP ? currentState.rho * 0.06243 : currentState.rho,
            Pws: isIP ? PSY.kPaToPsi(currentState.Pws) : currentState.Pws,
            Pw: isIP ? PSY.kPaToPsi(currentState.Pw) : currentState.Pw
        };

        // Build CSV content
        let csv = 'Psychrometric Calculator Results\n';
        csv += `Generated: ${dateStr}\n`;
        csv += `Tool: Psychrometric Calculator v1.0.0\n`;
        csv += `Equations: ASHRAE 2017/2021 Fundamentals\n`;
        csv += '\n';

        // Input section
        csv += '=== INPUT PARAMETERS ===\n';
        csv += `Input Mode,${inputMode}\n`;
        csv += `Dry Bulb Temperature,${inputTdb.toFixed(4)} ${resultUnits.temp}\n`;
        if (inputMode === 'tdb_rh') csv += `Relative Humidity,${currentState.RH.toFixed(2)} %\n`;
        else if (inputMode === 'tdb_twb') csv += `Wet Bulb Temperature,${input2.toFixed(4)} ${resultUnits.temp}\n`;
        else if (inputMode === 'tdb_tdp') csv += `Dew Point Temperature,${input2.toFixed(4)} ${resultUnits.temp}\n`;
        else if (inputMode === 'tdb_w') csv += `Humidity Ratio,${input2.toFixed(6)} ${resultUnits.W}\n`;
        csv += `Atmospheric Pressure,${inputPa.toFixed(3)} ${resultUnits.pressure}\n`;
        csv += `Altitude Helper Input,${isFinite(inputAltitude) ? inputAltitude.toFixed(2) : 'N/A'} ${resultUnits.altitude}\n`;
        csv += `Standard Pressure From Altitude,${standardPressureDisplay.toFixed(3)} ${resultUnits.pressure}\n`;
        csv += `Pressure Difference From Standard Altitude,${pressureDeltaDisplay.toFixed(3)} ${resultUnits.pressure}\n`;
        csv += `Pressure Source,Calculation uses the atmospheric pressure field; Use Altitude copies standard pressure into that field.\n`;
        csv += '\n';

        // Results section
        csv += '=== CALCULATED PROPERTIES ===\n';
        csv += `Property,Value,Unit (${isIP ? 'IP' : 'SI'})\n`;
        csv += `Dry Bulb Temperature,${resultValues.Tdb.toFixed(4)},${resultUnits.temp}\n`;
        csv += `Wet Bulb Temperature,${resultValues.Twb.toFixed(4)},${resultUnits.temp}\n`;
        csv += `Dew Point Temperature,${resultValues.Tdp.toFixed(4)},${resultUnits.temp}\n`;
        csv += `Relative Humidity,${currentState.RH.toFixed(2)},%\n`;
        csv += `Humidity Ratio,${resultValues.W.toFixed(isIP ? 6 : 4)},${resultUnits.W}\n`;
        csv += `Humidity Ratio (kg/kg),${currentState.W.toFixed(6)},kg/kg\n`;
        csv += `Specific Enthalpy,${resultValues.h.toFixed(3)},${resultUnits.h}\n`;
        csv += `Specific Volume,${resultValues.v.toFixed(4)},${resultUnits.v}\n`;
        csv += `Air Density,${resultValues.rho.toFixed(4)},${resultUnits.rho}\n`;
        csv += `Saturation Vapor Pressure,${resultValues.Pws.toFixed(4)},${resultUnits.pressure}\n`;
        csv += `Partial Vapor Pressure,${resultValues.Pw.toFixed(4)},${resultUnits.pressure}\n`;
        csv += `Degree of Saturation,${(currentState.mu * 100).toFixed(2)},%\n`;
        csv += '\n';

        if (typeof PROCESS !== 'undefined') {
            const processCsv = PROCESS.toCsv();
            if (processCsv) {
                csv += processCsv + '\n\n';
            }
        }

        // Solver info
        csv += '=== SOLVER INFORMATION ===\n';
        csv += `Wet Bulb Solver,${getWetBulbSolverLabel(currentState)}\n`;
        csv += `Wet Bulb Converged,${currentState.Twb_converged !== undefined ? currentState.Twb_converged : 'N/A'}\n`;
        if (currentState.warning) csv += `Warning,${currentState.warning}\n`;
        csv += '\n';

        csv += '=== DISCLAIMER ===\n';
        csv += 'These results are for engineering and educational use only.\n';
        csv += 'Verify critical calculations against ASHRAE Handbook charts or tables.\n';
        csv += 'This tool is provided "AS IS" without warranty of any kind.\n';

        // Download CSV
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const TdbStr = resultValues.Tdb.toFixed(0).replace('.', '-');
        link.download = `psychrometric-results_${TdbStr}_${isIP ? 'IP' : 'SI'}_${timestamp.slice(0,10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    // ========================================
    // CALCULATION TRAIL VISUALIZER
    // ========================================
    function showCalculationTrail() {
        if (!currentState) {
            alert('No calculation results to display. Please perform a calculation first.');
            return;
        }

        const isIP = units === 'ip';
        const Pa = getInputPressureKPa();

        // Generate calculation trail HTML
        const trailHTML = generateCalculationTrail(currentState, Pa, inputMode, isIP);

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'calcTrailModal';
        modal.className = 'validation-modal';
        modal.innerHTML = `
            <div class="validation-content" style="max-width: 900px;">
                <div class="validation-header">
                    <h2>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-primary)" stroke-width="2">
                            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
                            <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
                            <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
                        </svg>
                        Calculation Trail
                    </h2>
                    <button class="validation-close" onclick="document.getElementById('calcTrailModal').remove()">-</button>
                </div>
                <p class="validation-summary" style="display: flex; justify-content: space-between; align-items: center;">
                    <span>Step-by-step calculation audit for verification</span>
                    <button class="trail-copy-btn" onclick="copyCalculationTrail()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        Copy Trail
                    </button>
                </p>
                <div class="validation-results" id="trailContent">
                    ${trailHTML}
                </div>
                <div class="validation-footer">
                    <button class="validation-btn" onclick="document.getElementById('calcTrailModal').remove()">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.classList.add('active');
    }

    function generateCalculationTrail(state, Pa, mode, isIP) {
        const T_K = PSY.CtoK(state.Tdb);

        let html = `
            <div class="calc-trail-section">
                <h4>1. SATURATION PRESSURE AT DRY BULB</h4>
                <div class="calc-step">
                    <div class="step-formula">ln(Pws) = C/T + D + E*T + F*T^2 + G*T^3 + H*ln(T)</div>
                    <div class="step-inputs">T = ${state.Tdb}°C = ${T_K.toFixed(2)} K</div>
                    <div class="step-calc">
                        <div class="step-row">
                            <span class="step-label">Coefficients (${state.Tdb >= 0 ? 'water (Eq. 5)' : 'ice (Eq. 6)'}):</span>
                            <span class="step-value">C=${-5800.2206}, D=${state.Tdb >= 0 ? '1.3914993' : '6.3925247'}, ...</span>
                        </div>
                        <div class="step-row">
                            <span class="step-label">Pws(Tdb):</span>
                            <span class="step-result">${state.Pws.toFixed(4)} kPa</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="calc-trail-section">
                <h4>2. VAPOR PRESSURE & HUMIDITY RATIO</h4>
                <div class="calc-step">
                    ${mode === 'tdb_rh' ? `
                    <div class="step-row">
                        <span class="step-formula">Pw = RH/100 × Pws</span>
                    </div>
                    <div class="step-calc">
                        <div class="step-row">
                            <span class="step-input">RH = ${state.RH.toFixed(1)}%</span>
                            <span class="step-input">Pws = ${state.Pws.toFixed(4)} kPa</span>
                        </div>
                        <div class="step-row">
                            <span class="step-label">Pw = ${(state.RH/100).toFixed(4)} × ${state.Pws.toFixed(4)} =</span>
                            <span class="step-result">${state.Pw.toFixed(4)} kPa</span>
                        </div>
                    </div>
                    ` : mode === 'tdb_w' ? `
                    <div class="step-row">
                        <span class="step-formula">Pw = W × Pa / (0.621945 + W)</span>
                    </div>
                    <div class="step-calc">
                        <div class="step-row">
                            <span class="step-input">W = ${(state.W * 1000).toFixed(2)} g/kg = ${state.W.toFixed(6)} kg/kg</span>
                            <span class="step-input">Pa = ${Pa.toFixed(3)} kPa</span>
                        </div>
                        <div class="step-row">
                            <span class="step-label">Pw = ${state.W.toFixed(6)} × ${Pa.toFixed(3)} / (0.621945 + ${state.W.toFixed(6)}) =</span>
                            <span class="step-result">${state.Pw.toFixed(4)} kPa</span>
                        </div>
                    </div>
                    ` : mode === 'tdb_tdp' ? `
                    <div class="step-row">
                        <span class="step-formula">Pw = Pws(Tdp) [at dew point, RH = 100%]</span>
                    </div>
                    <div class="step-calc">
                        <div class="step-row">
                            <span class="step-input">Tdp = ${state.Tdp.toFixed(2)}°C</span>
                        </div>
                        <div class="step-row">
                            <span class="step-label">Pws(${state.Tdp.toFixed(1)}°C) = Pw =</span>
                            <span class="step-result">${state.Pw.toFixed(4)} kPa</span>
                        </div>
                    </div>
                    ` : `
                    <div class="step-row">
                        <span class="step-formula">ASHRAE wet-bulb relation: find W</span>
                    </div>
                    <div class="step-calc">
                        <div class="step-row">
                            <span class="step-input">Twb = ${state.Twb.toFixed(2)}°C (saturated)</span>
                        </div>
                        <div class="step-row">
                            <span class="step-label">W from wet-bulb relation:</span>
                            <span class="step-result">${(state.W * 1000).toFixed(2)} g/kg</span>
                        </div>
                    </div>
                    `}
                </div>
                <div class="calc-step">
                    <div class="step-row">
                        <span class="step-formula">W = 0.621945 × Pw / (Pa - Pw)</span>
                    </div>
                    <div class="step-calc">
                        <div class="step-row">
                            <span class="step-input">Pw = ${state.Pw.toFixed(4)} kPa</span>
                            <span class="step-input">Pa = ${Pa.toFixed(3)} kPa</span>
                        </div>
                        <div class="step-row">
                            <span class="step-label">W = 0.621945 × ${state.Pw.toFixed(4)} / (${Pa.toFixed(3)} - ${state.Pw.toFixed(4)}) =</span>
                            <span class="step-result">${state.W.toFixed(6)} kg/kg = ${(state.W * 1000).toFixed(2)} g/kg</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="calc-trail-section">
                <h4>3. RELATIVE HUMIDITY</h4>
                <div class="calc-step">
                    <div class="step-row">
                        <span class="step-formula">RH = 100 × Pw / Pws</span>
                    </div>
                    <div class="step-calc">
                        <div class="step-row">
                            <span class="step-input">Pw = ${state.Pw.toFixed(4)} kPa</span>
                            <span class="step-input">Pws = ${state.Pws.toFixed(4)} kPa</span>
                        </div>
                        <div class="step-row">
                            <span class="step-label">RH = 100 × ${state.Pw.toFixed(4)} / ${state.Pws.toFixed(4)} =</span>
                            <span class="step-result">${state.RH.toFixed(2)}%</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="calc-trail-section">
                <h4>4. SPECIFIC ENTHALPY (ASHRAE Eq. 30)</h4>
                <div class="calc-step">
                    <div class="step-row">
                        <span class="step-formula">h = 1.006 × Tdb + W × (2501 + 1.86 × Tdb)</span>
                    </div>
                    <div class="step-calc">
                        <div class="step-row">
                            <span class="step-input">Tdb = ${state.Tdb}°C</span>
                            <span class="step-input">W = ${state.W.toFixed(6)} kg/kg</span>
                        </div>
                        <div class="step-row">
                            <span class="step-label">Sensible: 1.006 × ${state.Tdb} = ${(1.006 * state.Tdb).toFixed(2)} kJ/kg</span>
                        </div>
                        <div class="step-row">
                            <span class="step-label">Latent term: ${state.W.toFixed(6)} × (2501 + 1.86 × ${state.Tdb}) = ${(state.W * (2501 + 1.86 * state.Tdb)).toFixed(2)} kJ/kg</span>
                        </div>
                        <div class="step-row">
                            <span class="step-label">h = ${(1.006 * state.Tdb).toFixed(2)} + ${(state.W * (2501 + 1.86 * state.Tdb)).toFixed(2)} =</span>
                            <span class="step-result">${state.h.toFixed(2)} kJ/kg ${isIP ? `(${(state.h * 0.429923).toFixed(2)} Btu/lb)` : ''}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="calc-trail-section">
                <h4>5. SPECIFIC VOLUME (Ideal Gas Law)</h4>
                <div class="calc-step">
                    <div class="step-row">
                        <span class="step-formula">v = Ra × T(K) × (1 + 1.6078 × W) / Pa</span>
                    </div>
                    <div class="step-calc">
                        <div class="step-row">
                            <span class="step-input">Ra = 0.2871 kJ/(kg·K)</span>
                            <span class="step-input">T(K) = ${T_K.toFixed(2)} K</span>
                            <span class="step-input">W = ${state.W.toFixed(6)}</span>
                            <span class="step-input">Pa = ${Pa.toFixed(3)} kPa</span>
                        </div>
                        <div class="step-row">
                            <span class="step-label">T(K) × (1 + 1.6078 × W) = ${T_K.toFixed(2)} × ${(1 + 1.6078 * state.W).toFixed(6)} = ${(T_K * (1 + 1.6078 * state.W)).toFixed(2)}</span>
                        </div>
                        <div class="step-row">
                            <span class="step-label">v = 0.2871 × ${(T_K * (1 + 1.6078 * state.W)).toFixed(2)} / ${Pa.toFixed(3)} =</span>
                            <span class="step-result">${state.v.toFixed(4)} m³/kg ${isIP ? `(${(state.v * 16.0185).toFixed(4)} ft³/lb)` : ''}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="calc-trail-section">
                <h4>6. AIR DENSITY</h4>
                <div class="calc-step">
                    <div class="step-row">
                        <span class="step-formula">rho = 1/v</span>
                    </div>
                    <div class="step-calc">
                        <div class="step-row">
                            <span class="step-label">rho = 1 / ${state.v.toFixed(4)} =</span>
                            <span class="step-result">${state.rho.toFixed(4)} kg/m³</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="calc-trail-section">
                <h4>7. DEW POINT TEMPERATURE (Newton-Raphson)</h4>
                <div class="calc-step">
                    <div class="step-row">
                        <span class="step-formula">Solve: Pws(Tdp) = Pw</span>
                    </div>
                    <div class="step-calc">
                        <div class="step-row">
                            <span class="step-input">Target Pw = ${state.Pw.toFixed(4)} kPa</span>
                        </div>
                        <div class="step-row">
                            <span class="step-label">Iterative inversion using Newton-Raphson method</span>
                        </div>
                        <div class="step-row">
                            <span class="step-result">Tdp = ${state.Tdp.toFixed(2)}°C ${isIP ? `(${PSY.CtoF(state.Tdp).toFixed(2)}°F)` : ''}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="calc-trail-section">
                <h4>8. WET BULB TEMPERATURE (PsychroLib)</h4>
                <div class="calc-step">
                    <div class="step-row">
                        <span class="step-formula">Solve: GetTWetBulbFromHumRatio(Tdb, W, Pa)</span>
                    </div>
                    <div class="step-calc">
                        <div class="step-row">
                            <span class="step-input">Target W = ${state.W.toFixed(6)} kg/kg</span>
                            <span class="step-input">Pa = ${Pa.toFixed(3)} kPa</span>
                        </div>
                        <div class="step-row">
                            <span class="step-label">PsychroLib brackets Tdp ≤ Twb ≤ Tdb and solves the ASHRAE wet-bulb humidity-ratio equation.</span>
                        </div>
                        <div class="step-row">
                            <span class="step-result">Twb = ${state.Twb.toFixed(2)}°C (${getWetBulbSolverLabel(state)})</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="calc-trail-section">
                <h4>9. DEGREE OF SATURATION</h4>
                <div class="calc-step">
                    <div class="step-row">
                        <span class="step-formula">mu = W / Ws</span>
                    </div>
                    <div class="step-calc">
                        <div class="step-row">
                            <span class="step-input">W = ${(state.W * 1000).toFixed(2)} g/kg</span>
                            <span class="step-input">Ws = ${(state.Pws * 0.621945 / (Pa - state.Pws) * 1000).toFixed(2)} g/kg</span>
                        </div>
                        <div class="step-row">
                            <span class="step-label">mu = ${(state.W * 1000).toFixed(2)} / ${(state.Pws * 0.621945 / (Pa - state.Pws) * 1000).toFixed(2)} =</span>
                            <span class="step-result">${(state.mu * 100).toFixed(2)}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        return html;
    }

    function copyCalculationTrail() {
        const trailContent = document.getElementById('trailContent');
        if (!trailContent) return;

        // Get text content
        const text = trailContent.innerText;

        // Copy to clipboard
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.querySelector('.trail-copy-btn');
            if (btn) {
                const originalText = btn.innerHTML;
                btn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-success)" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                    Copied!
                `;
                setTimeout(() => btn.innerHTML = originalText, 2000);
            }
        }).catch(err => {
            alert('Failed to copy: ' + err);
        });
    }

    // Exports
    window.exportPng = exportPng;
    window.exportResults = exportResults;
    window.showCalculationTrail = showCalculationTrail;
    window.copyCalculationTrail = copyCalculationTrail;
    const Psy = (window.Psy = window.Psy || {});
    Psy.exportPng = exportPng;
    Psy.exportResults = exportResults;
    Psy.showCalculationTrail = showCalculationTrail;
})();
