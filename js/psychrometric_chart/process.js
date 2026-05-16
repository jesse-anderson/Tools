(function () {
    'use strict';

    // ========================================
    // PROCESS STATES & HVAC PROCESS HELPERS
    // ========================================
    const PROCESS = {
        states: { A: null, B: null },
        lastResult: null,
        lastProcessType: null,

        init() {
            document.getElementById('saveStateABtn').addEventListener('click', () => this.saveState('A'));
            document.getElementById('saveStateBBtn').addEventListener('click', () => this.saveState('B'));
            document.getElementById('clearProcessStatesBtn').addEventListener('click', () => this.clearStates());
            document.getElementById('processType').addEventListener('change', () => this.updateProcessInputs());
            document.getElementById('applyProcessBtn').addEventListener('click', () => this.applyProcess(false));
            document.getElementById('applyProcessSaveBBtn').addEventListener('click', () => this.applyProcess(true));

            this.updateProcessInputs();
            this.refresh();
        },

        cloneState(label, state = currentState) {
            if (!state) return null;

            return {
                label,
                Tdb: state.Tdb,
                Twb: state.Twb,
                Tdp: state.Tdp,
                RH: state.RH,
                W: state.W,
                h: state.h,
                v: state.v,
                rho: state.rho,
                Pws: state.Pws,
                Pw: state.Pw,
                mu: state.mu,
                Pa: getInputPressureKPa(),
                savedAt: new Date().toISOString()
            };
        },

        saveState(label) {
            const state = this.cloneState(label);
            if (!state) return;

            this.states[label] = state;
            this.refresh();
            CHART.draw();
        },

        clearStates() {
            this.states.A = null;
            this.states.B = null;
            this.lastResult = null;
            this.refresh();
            CHART.draw();
        },

        refresh() {
            this.updateStateSummaries();
            this.updateProcessInputs();
        },

        updateStateSummaries() {
            const summaryA = document.getElementById('processStateASummary');
            const summaryB = document.getElementById('processStateBSummary');
            const delta = document.getElementById('processDeltaSummary');

            if (summaryA) summaryA.innerHTML = this.states.A ? this.formatState(this.states.A) : 'Not set';
            if (summaryB) summaryB.innerHTML = this.states.B ? this.formatState(this.states.B) : 'Not set';
            if (delta) delta.innerHTML = this.states.A && this.states.B
                ? this.formatDelta(this.states.A, this.states.B)
                : 'Save A and B to compare states.';
        },

        formatTemp(value) {
            return units === 'ip' ? `${PSY.CtoF(value).toFixed(1)} F` : `${value.toFixed(1)} C`;
        },

        formatW(value) {
            return units === 'ip' ? `${value.toFixed(5)} lb/lb` : `${(value * 1000).toFixed(2)} g/kg`;
        },

        formatH(value) {
            return units === 'ip' ? `${PSY.kJkgToBtulb(value).toFixed(2)} Btu/lb` : `${value.toFixed(2)} kJ/kg`;
        },

        formatState(state) {
            return [
                `<strong>Tdb</strong> ${this.formatTemp(state.Tdb)}`,
                `<strong>W</strong> ${this.formatW(state.W)}`,
                `<strong>RH</strong> ${state.RH.toFixed(1)}%`,
                `<strong>h</strong> ${this.formatH(state.h)}`
            ].join('<br>');
        },

        formatDelta(a, b) {
            const deltaT = b.Tdb - a.Tdb;
            const deltaW = b.W - a.W;
            const deltaH = b.h - a.h;
            const deltaRH = b.RH - a.RH;

            return [
                `<strong>Delta Tdb</strong> ${this.formatSignedTemp(deltaT)}`,
                `<strong>Delta W</strong> ${this.formatSignedW(deltaW)}`,
                `<strong>Delta h</strong> ${this.formatSignedH(deltaH)}`,
                `<strong>Delta RH</strong> ${deltaRH >= 0 ? '+' : ''}${deltaRH.toFixed(1)}%`
            ].join('<br>');
        },

        formatSignedTemp(valueC) {
            const value = units === 'ip' ? valueC * 9 / 5 : valueC;
            const unit = units === 'ip' ? 'F' : 'C';
            return `${value >= 0 ? '+' : ''}${value.toFixed(1)} ${unit}`;
        },

        formatSignedW(value) {
            const display = units === 'ip' ? value : value * 1000;
            const unit = units === 'ip' ? 'lb/lb' : 'g/kg';
            return `${display >= 0 ? '+' : ''}${display.toFixed(units === 'ip' ? 5 : 2)} ${unit}`;
        },

        formatSignedH(value) {
            const display = units === 'ip' ? PSY.kJkgToBtulb(value) : value;
            const unit = units === 'ip' ? 'Btu/lb' : 'kJ/kg';
            return `${display >= 0 ? '+' : ''}${display.toFixed(2)} ${unit}`;
        },

        updateProcessInputs() {
            const type = document.getElementById('processType').value;
            const typeChanged = this.lastProcessType !== type;
            const field2 = document.getElementById('processField2');
            const label1 = document.getElementById('processLabel1');
            const label2 = document.getElementById('processLabel2');
            const input1 = document.getElementById('processInput1');
            const input2 = document.getElementById('processInput2');
            const tempUnit = units === 'ip' ? 'F' : 'C';
            const wUnit = units === 'ip' ? 'lb/lb' : 'g/kg';

            field2.hidden = true;

            if (type === 'sensible') {
                label1.textContent = `Delta T (${tempUnit})`;
                input1.step = '0.1';
                if (typeChanged || !input1.value) input1.value = units === 'ip' ? '10' : '5';
            } else if (type === 'humidify') {
                label1.textContent = `Delta W (${wUnit})`;
                input1.step = units === 'ip' ? '0.0001' : '0.1';
                if (typeChanged || !input1.value) input1.value = units === 'ip' ? '0.002' : '2';
            } else if (type === 'cool_dehum') {
                label1.textContent = `Leaving Tdb (${tempUnit})`;
                label2.textContent = 'Leaving RH (%)';
                field2.hidden = false;
                input1.step = '0.1';
                input2.step = '0.1';
                if (typeChanged || !input1.value) input1.value = units === 'ip' ? '55' : '13';
                if (typeChanged || !input2.value) input2.value = '90';
            } else if (type === 'mix') {
                label1.textContent = 'State A Fraction (%)';
                input1.step = '1';
                if (typeChanged || !input1.value) input1.value = '50';
            } else if (type === 'coil') {
                label1.textContent = `Apparatus Dew Point (${tempUnit})`;
                label2.textContent = 'Bypass Factor';
                field2.hidden = false;
                input1.step = '0.1';
                input2.step = '0.01';
                if (typeChanged || !input1.value) input1.value = units === 'ip' ? '50' : '10';
                if (typeChanged || !input2.value) input2.value = '0.10';
            }

            this.lastProcessType = type;
        },

        applyProcess(saveB) {
            const result = this.calculateProcess();
            if (!result) return;

            this.lastResult = result;
            setCurrentStateFromTdbW(result.state.Tdb, result.state.W);
            this.showProcessResult(result);

            if (saveB) {
                this.states.B = this.cloneState('B', result.state);
                this.refresh();
                CHART.draw();
            }
        },

        calculateProcess() {
            if (!currentState) {
                this.showProcessWarning('Calculate a current state first.');
                return null;
            }

            const type = document.getElementById('processType').value;
            const value1 = parseFloat(document.getElementById('processInput1').value);
            const value2 = parseFloat(document.getElementById('processInput2').value);
            const Pa = getInputPressureKPa();
            let state;
            let label;

            try {
                if (type === 'sensible') {
                    const deltaC = units === 'ip' ? value1 * 5 / 9 : value1;
                    state = PSY.solve_Tdb_W(currentState.Tdb + deltaC, currentState.W, Pa);
                    label = value1 >= 0 ? 'Sensible heating' : 'Sensible cooling';
                } else if (type === 'humidify') {
                    const deltaW = units === 'ip' ? value1 : value1 / 1000;
                    state = PSY.solve_Tdb_W(currentState.Tdb, Math.max(0, currentState.W + deltaW), Pa);
                    label = value1 >= 0 ? 'Humidification' : 'Dehumidification';
                } else if (type === 'cool_dehum') {
                    const targetTdb = units === 'ip' ? PSY.FtoC(value1) : value1;
                    const targetRH = Math.max(0, Math.min(100, value2));
                    state = PSY.solve_Tdb_RH(targetTdb, targetRH, Pa);
                    label = 'Cooling/dehumidification target';
                } else if (type === 'mix') {
                    state = this.calculateMixedAir(Pa, value1);
                    label = 'Mixed air from State A/B';
                } else if (type === 'coil') {
                    state = this.calculateCoilLeaving(Pa, value1, value2);
                    label = 'Coil leaving estimate';
                }
            } catch (error) {
                this.showProcessWarning(error.message);
                return null;
            }

            if (!state || !isFinite(state.Tdb) || !isFinite(state.W)) {
                this.showProcessWarning('Process result is outside the solver range.');
                return null;
            }

            return {
                type,
                label,
                entering: this.cloneState('Entering', currentState),
                state
            };
        },

        calculateMixedAir(Pa, fractionA) {
            if (!this.states.A || !this.states.B) {
                throw new Error('Save State A and State B before mixing air streams.');
            }

            const fA = Math.max(0, Math.min(1, fractionA / 100));
            const fB = 1 - fA;
            const W = fA * this.states.A.W + fB * this.states.B.W;
            const h = fA * this.states.A.h + fB * this.states.B.h;
            const Tdb = PSY.Tdb_from_h_W(h, W);

            return PSY.solve_Tdb_W(Tdb, W, Pa);
        },

        calculateCoilLeaving(Pa, adpInput, bypassFactorInput) {
            const adpTdb = units === 'ip' ? PSY.FtoC(adpInput) : adpInput;
            const bypassFactor = Math.max(0, Math.min(1, bypassFactorInput));
            const adpState = PSY.solve_Tdb_RH(adpTdb, 100, Pa);
            const W = bypassFactor * currentState.W + (1 - bypassFactor) * adpState.W;
            const h = bypassFactor * currentState.h + (1 - bypassFactor) * adpState.h;
            const Tdb = PSY.Tdb_from_h_W(h, W);

            return PSY.solve_Tdb_W(Tdb, W, Pa);
        },

        showProcessResult(result) {
            const output = document.getElementById('processOutput');
            const entering = result.entering;
            const leaving = result.state;

            output.classList.remove('warn');
            output.innerHTML = [
                `<strong>${result.label}</strong>`,
                `Leaving: ${this.formatTemp(leaving.Tdb)}, ${this.formatW(leaving.W)}, RH ${leaving.RH.toFixed(1)}%, h ${this.formatH(leaving.h)}`,
                `Change: ${this.formatSignedTemp(leaving.Tdb - entering.Tdb)}, ${this.formatSignedW(leaving.W - entering.W)}, ${this.formatSignedH(leaving.h - entering.h)}`
            ].join('<br>');
        },

        showProcessWarning(message) {
            const output = document.getElementById('processOutput');
            output.classList.add('warn');
            output.textContent = message;
        },

        draw(ctx, chart) {
            const a = this.states.A;
            const b = this.states.B;
            if (!a || !b) return;

            const ax = chart.TdbToX(a.Tdb);
            const ay = chart.WToY(a.W * 1000);
            const bx = chart.TdbToX(b.Tdb);
            const by = chart.WToY(b.W * 1000);

            ctx.save();
            ctx.strokeStyle = '#14b8a6';
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 5]);
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
            ctx.setLineDash([]);

            this.drawProcessEndpoint(ctx, ax, ay, 'A', '#38bdf8');
            this.drawProcessEndpoint(ctx, bx, by, 'B', '#22c55e');
            ctx.restore();
        },

        drawProcessEndpoint(ctx, x, y, label, color) {
            ctx.fillStyle = color;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px JetBrains Mono';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x, y);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
        },

        toCsv() {
            const rows = [];

            if (this.states.A || this.states.B) {
                rows.push('');
                rows.push('=== PROCESS STATES ===');
                rows.push('State,Tdb C,W kg/kg,RH %,h kJ/kg,Twb C,Tdp C,Pressure kPa');

                for (const label of ['A', 'B']) {
                    const state = this.states[label];
                    if (!state) continue;
                    rows.push([
                        label,
                        state.Tdb.toFixed(4),
                        state.W.toFixed(6),
                        state.RH.toFixed(2),
                        state.h.toFixed(4),
                        state.Twb.toFixed(4),
                        state.Tdp.toFixed(4),
                        state.Pa.toFixed(3)
                    ].join(','));
                }
            }

            if (this.states.A && this.states.B) {
                rows.push('');
                rows.push('=== PROCESS DELTAS ===');
                rows.push('Delta Tdb C,Delta W kg/kg,Delta RH %,Delta h kJ/kg');
                rows.push([
                    (this.states.B.Tdb - this.states.A.Tdb).toFixed(4),
                    (this.states.B.W - this.states.A.W).toFixed(6),
                    (this.states.B.RH - this.states.A.RH).toFixed(2),
                    (this.states.B.h - this.states.A.h).toFixed(4)
                ].join(','));
            }

            return rows.join('\n');
        }
    };

    function setCurrentStateFromTdbW(TdbC, W) {
        const inputTdb = document.getElementById('inputTdb');
        const input2 = document.getElementById('input2');
        const labelInput2 = document.getElementById('labelInput2');

        inputMode = 'tdb_w';
        document.querySelectorAll('.mode-toggle button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === 'tdb_w');
        });

        labelInput2.textContent = 'Humidity Ratio (' + (units === 'ip' ? 'lb/lb' : 'g/kg') + ')';
        input2.placeholder = units === 'ip' ? '0.01' : '10';
        inputTdb.value = units === 'ip' ? PSY.CtoF(TdbC).toFixed(1) : TdbC.toFixed(1);
        input2.value = units === 'ip' ? W.toFixed(6) : (W * 1000).toFixed(3);
        calculate();
    }

    // Exports
    window.PROCESS = PROCESS;
    window.setCurrentStateFromTdbW = setCurrentStateFromTdbW;
    const Psy = (window.Psy = window.Psy || {});
    Psy.process = PROCESS;
    Psy.setCurrentStateFromTdbW = setCurrentStateFromTdbW;
})();
