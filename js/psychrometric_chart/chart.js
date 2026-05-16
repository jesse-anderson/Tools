(function () {
    'use strict';

    // ========================================
    // CANVAS & CHART RENDERING
    // ========================================
    const CHART = {
        canvas: null,
        ctx: null,
        chartArea: null,
        theme: {},
        hover: null,               // { x, y, Tdb, W } in CSS pixels & SI
        view: null,                // null = use CONFIG.viewPresets.full; else {Tdbmin,Tdbmax,Wmin,Wmax}
        currentPreset: 'full',     // 'comfort' | 'hvac' | 'full' | 'custom'
        lastNamedPreset: 'full',   // last preset selected via button, used by Reset View
        _drawScheduled: false,
        _pendingPointer: null,     // queued drag pointer event awaiting rAF
        _themeObserver: null,

        // ---- View / zoom-pan helpers ----
        getView() {
            return this.view || CONFIG.viewPresets.full;
        },

        setPreset(name) {
            if (!CONFIG.viewPresets[name]) return;
            this.view = { ...CONFIG.viewPresets[name] };
            this.currentPreset = name;
            this.lastNamedPreset = name;
            this._notifyPresetChange();
            this.draw();
        },

        resetView() {
            this.setPreset('full');
        },

        _setCustomView(v) {
            // Clamp to absolute bounds
            const minSpan = { T: 5, W: 2 };
            const maxSpan = { T: 200, W: 80 };
            const Tspan = v.Tdbmax - v.Tdbmin;
            const Wspan = v.Wmax - v.Wmin;
            if (Tspan < minSpan.T || Tspan > maxSpan.T) return false;
            if (Wspan < minSpan.W || Wspan > maxSpan.W) return false;
            this.view = v;
            this.currentPreset = 'custom';
            this._notifyPresetChange();
            return true;
        },

        _notifyPresetChange() {
            document.querySelectorAll('.view-preset-toggle button').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.preset === this.currentPreset);
            });
        },

        init() {
            this.canvas = document.getElementById('psychoCanvas');
            this.ctx = this.canvas.getContext('2d');
            this.canvas.title = 'Click/drag: set state. Shift+drag: pan. Wheel: zoom.';
            this.refreshTheme();
            this.resize();
            this.initInteraction();
            this.initViewControls();
            this.observeTheme();
            window.addEventListener('resize', () => {
                this.resize();
                this.draw();
            });
        },

        initViewControls() {
            // Default to Full so existing state is preserved
            this.setPreset('full');
            document.querySelectorAll('.view-preset-toggle button').forEach(btn => {
                btn.addEventListener('click', () => this.setPreset(btn.dataset.preset));
            });
            const resetBtn = document.getElementById('resetViewBtn');
            if (resetBtn) {
                resetBtn.addEventListener('click', () => this.setPreset(this.lastNamedPreset));
            }
        },

        refreshTheme() {
            const cs = getComputedStyle(document.documentElement);
            const read = (name) => cs.getPropertyValue(name).trim();
            this.theme = {
                bg: read('--bg-primary'),
                textPrimary: read('--text-primary'),
                textSecondary: read('--text-secondary'),
                textMuted: read('--text-muted'),
                border: read('--border-color'),
                cardBg: read('--bg-card'),
                wetBulb: read('--text-secondary')  // theme-aware, replaces hard-coded #64748b
            };
        },

        observeTheme() {
            if (this._themeObserver) return;
            this._themeObserver = new MutationObserver(() => {
                this.refreshTheme();
                this.draw();
            });
            this._themeObserver.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['data-theme']
            });
        },

        resize() {
            const container = this.canvas.parentElement;
            const dpr = window.devicePixelRatio || 1;
            const rect = container.getBoundingClientRect();

            this.canvas.width = rect.width * dpr;
            this.canvas.height = rect.height * dpr;
            this.canvas.style.width = rect.width + 'px';
            this.canvas.style.height = rect.height + 'px';

            this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            const padding = { top: 52, right: 64, bottom: 70, left: 96 };
            this.chartArea = {
                x: padding.left,
                y: padding.top,
                width: rect.width - padding.left - padding.right,
                height: rect.height - padding.top - padding.bottom
            };
        },

        scheduleDraw() {
            if (this._drawScheduled) return;
            this._drawScheduled = true;
            requestAnimationFrame(() => {
                this._drawScheduled = false;
                if (this._pendingPointer) {
                    const ev = this._pendingPointer;
                    this._pendingPointer = null;
                    this._applyPointerToState(ev);
                } else {
                    this.draw();
                }
            });
        },

        // Convert Tdb to canvas x coordinate (uses current view, not CONFIG)
        TdbToX(Tdb) {
            const v = this.getView();
            const ratio = (Tdb - v.Tdbmin) / (v.Tdbmax - v.Tdbmin);
            return this.chartArea.x + ratio * this.chartArea.width;
        },

        xToTdb(x) {
            const v = this.getView();
            const ratio = (x - this.chartArea.x) / this.chartArea.width;
            return v.Tdbmin + ratio * (v.Tdbmax - v.Tdbmin);
        },

        // W in g/kg
        WToY(W) {
            const v = this.getView();
            const ratio = (W - v.Wmin) / (v.Wmax - v.Wmin);
            return this.chartArea.y + this.chartArea.height - ratio * this.chartArea.height;
        },

        yToW(y) {
            const v = this.getView();
            const ratio = (this.chartArea.y + this.chartArea.height - y) / this.chartArea.height;
            return v.Wmin + ratio * (v.Wmax - v.Wmin);
        },

        initInteraction() {
            let mode = null;        // 'state' | 'pan' | null
            let panStart = null;

            this.canvas.addEventListener('pointerdown', (event) => {
                if (!this.isInChartArea(event)) return;

                if (event.shiftKey || event.button === 1) {
                    mode = 'pan';
                    const pt = this.pointerToChartPoint(event);
                    panStart = { x: pt.x, y: pt.y, view: { ...this.getView() } };
                } else {
                    mode = 'state';
                    this._pendingPointer = event;
                    this.scheduleDraw();
                }
                this.canvas.setPointerCapture(event.pointerId);
                event.preventDefault();
            });

            this.canvas.addEventListener('pointermove', (event) => {
                if (mode === 'state') {
                    this._pendingPointer = event;
                    this.scheduleDraw();
                    return;
                }
                if (mode === 'pan' && panStart) {
                    this._applyPan(event, panStart);
                    return;
                }
                this.updateHover(event);
            });

            this.canvas.addEventListener('pointerleave', () => {
                if (this.hover) {
                    this.hover = null;
                    this.scheduleDraw();
                }
            });

            const stopDragging = (event) => {
                mode = null;
                panStart = null;
                if (this.canvas.hasPointerCapture(event.pointerId)) {
                    this.canvas.releasePointerCapture(event.pointerId);
                }
            };

            this.canvas.addEventListener('pointerup', stopDragging);
            this.canvas.addEventListener('pointercancel', stopDragging);

            // Wheel zoom centered on cursor
            this.canvas.addEventListener('wheel', (event) => {
                if (!this.isInChartArea(event)) return;
                event.preventDefault();
                this._applyZoom(event);
            }, { passive: false });
        },

        _applyPan(event, panStart) {
            const cur = this.pointerToChartPoint(event);
            const dx = cur.x - panStart.x;
            const dy = cur.y - panStart.y;
            const v = panStart.view;
            const tPerPx = (v.Tdbmax - v.Tdbmin) / this.chartArea.width;
            const wPerPx = (v.Wmax - v.Wmin) / this.chartArea.height;
            // Dragging right (+dx) should pan the view left (show more of the left side)
            const newView = {
                Tdbmin: v.Tdbmin - dx * tPerPx,
                Tdbmax: v.Tdbmax - dx * tPerPx,
                Wmin:   v.Wmin   + dy * wPerPx,
                Wmax:   v.Wmax   + dy * wPerPx
            };
            if (this._setCustomView(newView)) this.scheduleDraw();
        },

        _applyZoom(event) {
            const pt = this.pointerToChartPoint(event);
            const v = this.getView();
            const tdbCursor = this.xToTdb(pt.x);
            const wCursor = this.yToW(pt.y);
            const factor = event.deltaY > 0 ? 1.15 : 1 / 1.15;
            const newTspan = (v.Tdbmax - v.Tdbmin) * factor;
            const newWspan = (v.Wmax - v.Wmin) * factor;
            // Keep (tdbCursor, wCursor) at same screen position
            const tdbRatio = (tdbCursor - v.Tdbmin) / (v.Tdbmax - v.Tdbmin);
            const wRatio = (wCursor - v.Wmin) / (v.Wmax - v.Wmin);
            const newView = {
                Tdbmin: tdbCursor - tdbRatio * newTspan,
                Tdbmax: tdbCursor + (1 - tdbRatio) * newTspan,
                Wmin:   wCursor - wRatio * newWspan,
                Wmax:   wCursor + (1 - wRatio) * newWspan
            };
            if (this._setCustomView(newView)) this.scheduleDraw();
        },

        updateHover(event) {
            if (!this.isInChartArea(event)) {
                if (this.hover) {
                    this.hover = null;
                    this.scheduleDraw();
                }
                return;
            }
            const raw = this.pointerToChartPoint(event);
            const Tdb = this.xToTdb(raw.x);
            const W_gkg = this.yToW(raw.y);
            this.hover = { x: raw.x, y: raw.y, Tdb, W: W_gkg / 1000 };
            this.scheduleDraw();
        },

        pointerToChartPoint(event) {
            const rect = this.canvas.getBoundingClientRect();
            return {
                x: event.clientX - rect.left,
                y: event.clientY - rect.top
            };
        },

        isInChartArea(event) {
            const point = this.pointerToChartPoint(event);
            const area = this.chartArea;

            return point.x >= area.x &&
                point.x <= area.x + area.width &&
                point.y >= area.y &&
                point.y <= area.y + area.height;
        },

        _applyPointerToState(event) {
            if (typeof setCurrentStateFromTdbW !== 'function') return;

            if (event.preventDefault) event.preventDefault();
            const raw = this.pointerToChartPoint(event);
            const area = this.chartArea;
            const x = Math.max(area.x, Math.min(area.x + area.width, raw.x));
            const y = Math.max(area.y, Math.min(area.y + area.height, raw.y));
            const Tdb = this.xToTdb(x);
            const Pa = getInputPressureKPa();
            let Wsat = PSY.W_from_Pw(PSY.Pws(Tdb), Pa) * 1000;
            if (!isFinite(Wsat) || Wsat <= 0) Wsat = CONFIG.W.max;
            const WChart = this.yToW(y);
            const W = Math.max(0, Math.min(CONFIG.W.max, Wsat, WChart));

            // Also update hover so the readout follows the drag without a stale value
            this.hover = { x, y, Tdb, W: W / 1000 };

            setCurrentStateFromTdbW(Tdb, W / 1000);
        },

        draw() {
            const ctx = this.ctx;

            // Clear canvas (use device-pixel size to clear physical buffer regardless of dpr transform)
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.fillStyle = this.theme.bg;
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            ctx.restore();

            // Grid first, lowest visual weight
            if (document.getElementById('toggleGrid').checked) {
                this.drawGrid();
            }

            // Clip curves and overlays to the chart area so zoom-in doesn't bleed
            ctx.save();
            const a = this.chartArea;
            ctx.beginPath();
            ctx.rect(a.x, a.y, a.width, a.height);
            ctx.clip();

            if (document.getElementById('toggleRH').checked) {
                this.drawRHLines();
            }
            if (document.getElementById('toggleEnthalpy').checked) {
                this.drawEnthalpyLines();
            }
            if (document.getElementById('toggleVolume').checked) {
                this.drawVolumeLines();
            }
            if (document.getElementById('toggleWetBulb') && document.getElementById('toggleWetBulb').checked) {
                this.drawWetBulbLines();
            }
            const comfortToggle = document.getElementById('toggleComfort');
            if (comfortToggle && comfortToggle.checked) {
                this.drawComfortZone();
            }
            if (document.getElementById('toggleSaturation').checked) {
                this.drawSaturation();
            }
            if (typeof PROCESS !== 'undefined') {
                PROCESS.draw(ctx, this);
            }
            if (currentState) {
                this.drawStatePoint();
            }
            ctx.restore();

            this.drawAxes();

            if (this.hover) {
                this.drawHoverOverlay();
            }
        },

        drawGrid() {
            const ctx = this.ctx;
            const v = this.getView();

            const Tstep = this._niceStep(v.Tdbmax - v.Tdbmin);
            const Wstep = this._niceStep(v.Wmax - v.Wmin);

            // Minor lines first (lower opacity) at 1/5 the major step
            ctx.save();
            ctx.strokeStyle = CONFIG.colors.grid;
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = 1;
            const Tminor = Tstep / 5;
            const Wminor = Wstep / 5;
            const TminorStart = Math.ceil(v.Tdbmin / Tminor) * Tminor;
            const WminorStart = Math.ceil(v.Wmin / Wminor) * Wminor;
            for (let T = TminorStart; T <= v.Tdbmax + 1e-6; T += Tminor) {
                const x = this.TdbToX(T);
                ctx.beginPath();
                ctx.moveTo(x, this.chartArea.y);
                ctx.lineTo(x, this.chartArea.y + this.chartArea.height);
                ctx.stroke();
            }
            for (let W = WminorStart; W <= v.Wmax + 1e-6; W += Wminor) {
                const y = this.WToY(W);
                ctx.beginPath();
                ctx.moveTo(this.chartArea.x, y);
                ctx.lineTo(this.chartArea.x + this.chartArea.width, y);
                ctx.stroke();
            }
            ctx.restore();

            // Major lines
            ctx.strokeStyle = CONFIG.colors.grid;
            ctx.lineWidth = 1;
            const Tstart = Math.ceil(v.Tdbmin / Tstep) * Tstep;
            const Wstart = Math.ceil(v.Wmin / Wstep) * Wstep;
            for (let T = Tstart; T <= v.Tdbmax + 1e-6; T += Tstep) {
                const x = this.TdbToX(T);
                ctx.beginPath();
                ctx.moveTo(x, this.chartArea.y);
                ctx.lineTo(x, this.chartArea.y + this.chartArea.height);
                ctx.stroke();
            }
            for (let W = Wstart; W <= v.Wmax + 1e-6; W += Wstep) {
                const y = this.WToY(W);
                ctx.beginPath();
                ctx.moveTo(this.chartArea.x, y);
                ctx.lineTo(this.chartArea.x + this.chartArea.width, y);
                ctx.stroke();
            }
        },

        // Pick a "nice" tick step (1, 2, 2.5, 5, 10 * 10^n) given the range.
        _niceStep(range, target = 8) {
            const raw = range / target;
            const exp = Math.pow(10, Math.floor(Math.log10(raw)));
            const norm = raw / exp;
            let step;
            if (norm < 1.5) step = 1;
            else if (norm < 3) step = 2;
            else if (norm < 7) step = 5;
            else step = 10;
            return step * exp;
        },

        drawSaturation() {
            const ctx = this.ctx;
            const Pa = getInputPressureKPa();

            ctx.strokeStyle = CONFIG.colors.saturation;
            ctx.lineWidth = 3;
            ctx.beginPath();

            // Light tint above saturation curve (impossible region)
            const upperPath = new Path2D();
            upperPath.moveTo(this.chartArea.x, this.chartArea.y);

            let started = false;
            let lastInRange = null;
            for (let T = CONFIG.Tdb.min; T <= CONFIG.Tdb.max; T += 0.5) {
                const Pws = PSY.Pws(T);
                const W = PSY.W_from_Pw(Pws, Pa) * 1000;
                if (!isFinite(W) || W < 0) continue;

                if (W <= CONFIG.W.max) {
                    const x = this.TdbToX(T);
                    const y = this.WToY(W);
                    if (!started) {
                        ctx.moveTo(x, y);
                        upperPath.lineTo(x, y);
                        started = true;
                    } else {
                        ctx.lineTo(x, y);
                        upperPath.lineTo(x, y);
                    }
                    lastInRange = { T, x, y };
                }
            }
            ctx.stroke();

            // Close the impossible-region polygon along the top edge
            if (lastInRange) {
                upperPath.lineTo(lastInRange.x, this.chartArea.y);
                upperPath.closePath();
                ctx.save();
                ctx.fillStyle = CONFIG.colors.saturation;
                ctx.globalAlpha = 0.06;
                ctx.fill(upperPath);
                ctx.restore();
            }

            // Label sits on the curve where it exits the chart
            const labelPos = this._saturationLabelAnchor(Pa);
            if (labelPos) {
                ctx.save();
                ctx.fillStyle = CONFIG.colors.saturation;
                ctx.font = 'bold 11px JetBrains Mono';
                ctx.textAlign = labelPos.align;
                ctx.textBaseline = 'middle';
                ctx.fillText('100% RH', labelPos.x, labelPos.y);
                ctx.restore();
            }
        },

        // Find where the saturation curve exits the chart (top or right) for label placement
        _saturationLabelAnchor(Pa) {
            const maxT = CONFIG.Tdb.max;
            const Pws_right = PSY.Pws(maxT);
            const W_right = PSY.W_from_Pw(Pws_right, Pa) * 1000;
            if (isFinite(W_right) && W_right > 0 && W_right <= CONFIG.W.max) {
                // Curve exits the right edge; label there
                return {
                    x: this.TdbToX(maxT) - 8,
                    y: this.WToY(W_right) - 10,
                    align: 'right'
                };
            }
            // Curve exits the top; find the Tdb where W = W.max
            for (let T = CONFIG.Tdb.min; T <= CONFIG.Tdb.max; T += 0.5) {
                const W = PSY.W_from_Pw(PSY.Pws(T), Pa) * 1000;
                if (isFinite(W) && W >= CONFIG.W.max) {
                    return {
                        x: this.TdbToX(T) + 6,
                        y: this.WToY(CONFIG.W.max) + 14,
                        align: 'left'
                    };
                }
            }
            return null;
        },

        drawRHLines() {
            const ctx = this.ctx;
            const Pa = getInputPressureKPa();

            const RHValues = [10, 20, 30, 40, 50, 60, 70, 80, 90];
            const labels = [];

            ctx.strokeStyle = CONFIG.colors.rhLine;
            ctx.lineWidth = 1.5;

            RHValues.forEach(RH => {
                ctx.beginPath();
                let started = false;
                let lastPt = null;     // last in-range (T, W) - where to anchor the label
                let exitedTop = false;

                for (let T = CONFIG.Tdb.min; T <= CONFIG.Tdb.max; T += 0.5) {
                    const Pws = PSY.Pws(T);
                    const Pw = (RH / 100) * Pws;
                    const W = PSY.W_from_Pw(Pw, Pa) * 1000;
                    if (!isFinite(W)) continue;

                    if (W >= 0 && W <= CONFIG.W.max) {
                        const x = this.TdbToX(T);
                        const y = this.WToY(W);
                        if (!started) {
                            ctx.moveTo(x, y);
                            started = true;
                        } else {
                            ctx.lineTo(x, y);
                        }
                        lastPt = { T, W, x, y };
                    } else if (W > CONFIG.W.max) {
                        exitedTop = true;
                        break;
                    }
                }
                ctx.stroke();

                if (lastPt) {
                    // Place label slightly inside chart at exit; offset upward along the curve
                    const align = exitedTop ? 'center' : 'right';
                    const lx = exitedTop ? lastPt.x : this.TdbToX(CONFIG.Tdb.max) - 6;
                    const ly = exitedTop ? this.chartArea.y + 12 : lastPt.y - 4;
                    labels.push({ text: RH + '%', x: lx, y: ly, align });
                }
            });

            // Draw labels after lines so they sit on top
            ctx.save();
            ctx.fillStyle = CONFIG.colors.rhLine;
            ctx.font = '10px JetBrains Mono';
            ctx.textBaseline = 'middle';
            labels.forEach(l => {
                ctx.textAlign = l.align;
                ctx.fillText(l.text, l.x, l.y);
            });
            ctx.restore();
        },

        drawEnthalpyLines() {
            const ctx = this.ctx;

            // kJ/kg
            const hValues = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140];
            const labels = [];

            ctx.strokeStyle = CONFIG.colors.enthalpy;
            ctx.setLineDash([6, 4]);
            ctx.lineWidth = 1.25;

            hValues.forEach(h => {
                ctx.beginPath();
                let started = false;
                let firstPt = null;
                let lastPt = null;

                for (let T = CONFIG.Tdb.min; T <= CONFIG.Tdb.max; T += 1) {
                    // h = 1.006*T + W*(2501 + 1.86*T) -> W
                    const W = (h - 1.006 * T) / (2501.0 + 1.86 * T) * 1000;
                    if (W >= 0 && W <= CONFIG.W.max) {
                        const x = this.TdbToX(T);
                        const y = this.WToY(W);
                        if (!started) {
                            ctx.moveTo(x, y);
                            started = true;
                            firstPt = { x, y };
                        } else {
                            ctx.lineTo(x, y);
                        }
                        lastPt = { x, y };
                    }
                }
                ctx.stroke();

                // Enthalpy lines slope upward-left. Place label near top-left end (firstPt) when high-h lines exit top; otherwise near bottom-right (lastPt).
                if (firstPt && lastPt) {
                    const anchor = firstPt.y < lastPt.y ? firstPt : lastPt;
                    const align = anchor === firstPt ? 'left' : 'right';
                    labels.push({
                        text: h + ' kJ/kg',
                        x: anchor.x + (align === 'left' ? 4 : -4),
                        y: anchor.y - 4,
                        align
                    });
                }
            });

            ctx.setLineDash([]);

            ctx.save();
            ctx.fillStyle = CONFIG.colors.enthalpy;
            ctx.font = '9px JetBrains Mono';
            ctx.textBaseline = 'alphabetic';
            labels.forEach(l => {
                ctx.textAlign = l.align;
                ctx.fillText(l.text, l.x, l.y);
            });
            ctx.restore();
        },

        drawVolumeLines() {
            const ctx = this.ctx;
            const Pa = getInputPressureKPa();
            const Pa_Pa = Pa * 1000;
            const MW_FACTOR = 1.607858;

            const vValues = [0.78, 0.80, 0.82, 0.84, 0.86, 0.88, 0.90, 0.92, 0.94, 0.96];
            const labels = [];

            ctx.strokeStyle = CONFIG.colors.volume;
            ctx.setLineDash([1, 4]);   // dotted vs enthalpy's dashed
            ctx.lineWidth = 1.25;

            vValues.forEach(v => {
                ctx.beginPath();
                let started = false;
                let firstPt = null;
                let lastPt = null;

                for (let T = CONFIG.Tdb.min; T <= CONFIG.Tdb.max; T += 1) {
                    const T_K = PSY.CtoK(T);
                    const W = (v * Pa_Pa / (287.042 * T_K) - 1) / MW_FACTOR * 1000;

                    if (W >= 0 && W <= CONFIG.W.max) {
                        const x = this.TdbToX(T);
                        const y = this.WToY(W);
                        if (!started) {
                            ctx.moveTo(x, y);
                            started = true;
                            firstPt = { x, y };
                        } else {
                            ctx.lineTo(x, y);
                        }
                        lastPt = { x, y };
                    }
                }
                ctx.stroke();

                // Volume lines slope upward-right; label at right-most in-range point
                if (lastPt) {
                    labels.push({
                        text: v.toFixed(2),
                        x: lastPt.x - 4,
                        y: lastPt.y - 4,
                        align: 'right'
                    });
                }
            });

            ctx.setLineDash([]);

            ctx.save();
            ctx.fillStyle = CONFIG.colors.volume;
            ctx.font = '9px JetBrains Mono';
            ctx.textBaseline = 'alphabetic';
            labels.forEach(l => {
                ctx.textAlign = l.align;
                ctx.fillText(l.text, l.x, l.y);
            });
            // One-time unit hint at top-right of the family
            if (labels.length) {
                const top = labels.reduce((a, b) => a.y < b.y ? a : b);
                ctx.fillText('m³/kg', top.x, top.y - 11);
            }
            ctx.restore();
        },

        drawWetBulbLines() {
            const ctx = this.ctx;
            const Pa = getInputPressureKPa();
            const Pa_Pa = Pa * 1000;

            const TwbValues = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
            const labels = [];

            ctx.strokeStyle = this.theme.wetBulb || '#64748b';
            ctx.setLineDash([4, 3]);
            ctx.lineWidth = 1;

            TwbValues.forEach(Twb => {
                if (Twb < CONFIG.Tdb.min) return;

                // Constant-Twb line: starts at saturation curve (Tdb = Twb), sweeps right.
                // Forward solve: for each Tdb >= Twb, W = GetHumRatioFromTWetBulb(Tdb, Twb, Pa).
                const startT = Math.max(Twb, CONFIG.Tdb.min);
                if (startT > CONFIG.Tdb.max) return;

                ctx.beginPath();
                let started = false;
                let firstPt = null;
                let lastPt = null;

                for (let T = startT; T <= CONFIG.Tdb.max; T += 1) {
                    let W;
                    try {
                        W = psychrolib.GetHumRatioFromTWetBulb(T, Twb, Pa_Pa);
                    } catch (_) {
                        continue;
                    }
                    if (!isFinite(W) || W < 0) continue;

                    const W_gkg = W * 1000;
                    if (W_gkg > CONFIG.W.max + 1) continue;

                    const x = this.TdbToX(T);
                    const y = this.WToY(Math.min(W_gkg, CONFIG.W.max));
                    if (!started) {
                        ctx.moveTo(x, y);
                        started = true;
                        firstPt = { x, y };
                    } else {
                        ctx.lineTo(x, y);
                    }
                    lastPt = { x, y };
                }
                ctx.stroke();

                // Label at the saturation end (firstPt), slight upper-left offset
                if (firstPt) {
                    labels.push({
                        text: Twb + '°',
                        x: firstPt.x - 4,
                        y: firstPt.y - 4,
                        align: 'right'
                    });
                }
            });

            ctx.setLineDash([]);

            ctx.save();
            ctx.fillStyle = this.theme.wetBulb || '#64748b';
            ctx.font = '9px JetBrains Mono';
            ctx.textBaseline = 'alphabetic';
            labels.forEach(l => {
                ctx.textAlign = l.align;
                ctx.fillText(l.text, l.x, l.y);
            });
            ctx.restore();
        },

        // ASHRAE Standard 55 simplified comfort polygons.
        // Vertices are (Tdb °C, W g/kg). These are conventional approximations
        // of the PMV -0.5..+0.5 envelope for sedentary activity (1.0-1.1 met,
        // light air movement). Real PMV depends on operative temperature,
        // clothing, and air velocity - use only as a visual reference.
        _comfortPolygons() {
            return {
                winter: [   // 1.0 clo
                    [20.0, 4.5], [23.5, 4.5], [24.5, 8.5],
                    [21.5, 11.0], [19.5, 9.0]
                ],
                summer: [   // 0.5 clo
                    [23.0, 4.5], [27.0, 4.5], [27.0, 9.5],
                    [25.0, 12.0], [22.5, 11.0]
                ]
            };
        },

        drawComfortZone() {
            const ctx = this.ctx;
            const polys = this._comfortPolygons();
            const drawPoly = (verts, fill, stroke, label) => {
                ctx.beginPath();
                verts.forEach(([T, W], i) => {
                    const x = this.TdbToX(T);
                    const y = this.WToY(W);
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.closePath();
                ctx.fillStyle = fill;
                ctx.fill();
                ctx.strokeStyle = stroke;
                ctx.lineWidth = 1.25;
                ctx.stroke();
                // Centroid label
                const cx = verts.reduce((s, [T]) => s + this.TdbToX(T), 0) / verts.length;
                const cy = verts.reduce((s, [, W]) => s + this.WToY(W), 0) / verts.length;
                ctx.fillStyle = stroke;
                ctx.font = 'bold 10px JetBrains Mono';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, cx, cy);
            };

            ctx.save();
            ctx.globalAlpha = 0.85;
            drawPoly(polys.winter, 'rgba(99, 102, 241, 0.15)', 'rgba(99, 102, 241, 0.85)', 'Winter');
            drawPoly(polys.summer, 'rgba(34, 197, 94, 0.13)', 'rgba(34, 197, 94, 0.85)', 'Summer');
            ctx.restore();
        },

        drawStatePoint() {
            const ctx = this.ctx;

            // Validate currentState before drawing
            if (!currentState ||
                !isFinite(currentState.Tdb) ||
                !isFinite(currentState.W) ||
                currentState.Tdb < CONFIG.Tdb.min - 10 ||
                currentState.Tdb > CONFIG.Tdb.max + 10 ||
                currentState.W < 0 ||
                currentState.W > CONFIG.W.max / 1000 + 0.01) {
                // Invalid state - skip drawing the point
                return;
            }

            const x = this.TdbToX(currentState.Tdb);
            const y = this.WToY(currentState.W * 1000);

            // Draw guide lines if enabled
            if (document.getElementById('toggleGuides').checked) {
                ctx.strokeStyle = CONFIG.colors.guide;
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);

                // Vertical line to Tdb axis
                ctx.beginPath();
                ctx.moveTo(x, this.chartArea.y);
                ctx.lineTo(x, this.chartArea.y + this.chartArea.height);
                ctx.stroke();

                // Horizontal line to W axis
                ctx.beginPath();
                ctx.moveTo(this.chartArea.x, y);
                ctx.lineTo(this.chartArea.x + this.chartArea.width, y);
                ctx.stroke();

                ctx.setLineDash([]);
            }

            // Draw point
            ctx.fillStyle = CONFIG.colors.point;
            ctx.beginPath();
            ctx.arc(x, y, 7, 0, Math.PI * 2);
            ctx.fill();

            // Draw theme-aware border
            ctx.strokeStyle = this.theme.bg || '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Label with background pill
            const labelT = units === 'ip'
                ? `${PSY.CtoF(currentState.Tdb).toFixed(1)} °F`
                : `${currentState.Tdb.toFixed(1)} °C`;
            const labelW = units === 'ip'
                ? `${currentState.W.toFixed(4)} lb/lb`
                : `${(currentState.W * 1000).toFixed(1)} g/kg`;
            const label = `${labelT}, ${labelW}`;
            this._drawLabelPill(label, x + 10, y - 14, {
                fg: this.theme.textPrimary,
                bg: this.theme.cardBg,
                border: CONFIG.colors.point
            });
        },

        _drawLabelPill(text, x, y, { fg, bg, border }) {
            const ctx = this.ctx;
            ctx.save();
            ctx.font = 'bold 11px JetBrains Mono';
            const metrics = ctx.measureText(text);
            const padX = 6;
            const padY = 4;
            const w = metrics.width + padX * 2;
            const h = 16;

            // Clamp so label doesn't escape chart area
            const area = this.chartArea;
            let rx = x;
            let ry = y - h + padY;
            if (rx + w > area.x + area.width) rx = area.x + area.width - w;
            if (rx < area.x) rx = area.x;
            if (ry < area.y) ry = area.y + 2;

            ctx.fillStyle = bg || '#fff';
            ctx.strokeStyle = border || fg;
            ctx.lineWidth = 1;
            const r = 4;
            ctx.beginPath();
            ctx.moveTo(rx + r, ry);
            ctx.lineTo(rx + w - r, ry);
            ctx.quadraticCurveTo(rx + w, ry, rx + w, ry + r);
            ctx.lineTo(rx + w, ry + h - r);
            ctx.quadraticCurveTo(rx + w, ry + h, rx + w - r, ry + h);
            ctx.lineTo(rx + r, ry + h);
            ctx.quadraticCurveTo(rx, ry + h, rx, ry + h - r);
            ctx.lineTo(rx, ry + r);
            ctx.quadraticCurveTo(rx, ry, rx + r, ry);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = fg || '#000';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.fillText(text, rx + padX, ry + h / 2);
            ctx.restore();
        },

        drawHoverOverlay() {
            const ctx = this.ctx;
            const area = this.chartArea;
            const { x, y, Tdb, W } = this.hover;
            const Pa = getInputPressureKPa();
            const Pa_Pa = Pa * 1000;

            // Saturation guard: only compute RH/Twb if state is physical at this point
            let Pws, Pw, RH, h, Twb;
            let supersat = false;
            try {
                Pws = PSY.Pws(Tdb);
                const Wsat = PSY.W_from_Pw(Pws, Pa);
                if (isFinite(Wsat) && Wsat > 0 && W > Wsat * 1.0001) supersat = true;
                Pw = PSY.Pw_from_W(W, Pa);
                RH = isFinite(Pws) ? Math.min(100, Math.max(0, 100 * Pw / Pws)) : NaN;
                h = PSY.h(Tdb, W);
                if (!supersat) {
                    Twb = psychrolib.GetTWetBulbFromHumRatio(Tdb, W, Pa_Pa);
                }
            } catch (_) {
                supersat = true;
            }

            // Crosshair
            ctx.save();
            ctx.strokeStyle = this.theme.textMuted || '#888';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.moveTo(area.x, y);
            ctx.lineTo(area.x + area.width, y);
            ctx.moveTo(x, area.y);
            ctx.lineTo(x, area.y + area.height);
            ctx.stroke();
            ctx.setLineDash([]);

            // Small dot at cursor
            ctx.fillStyle = this.theme.textPrimary || '#000';
            ctx.beginPath();
            ctx.arc(x, y, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Readout box - top-right corner of chart
            const isIP = units === 'ip';
            const lines = [];
            const tempFmt = (T) => isIP ? `${PSY.CtoF(T).toFixed(1)} °F` : `${T.toFixed(1)} °C`;
            const wFmt = (Wkg) => isIP ? `${Wkg.toFixed(5)} lb/lb` : `${(Wkg * 1000).toFixed(2)} g/kg`;
            const hFmt = (hKj) => isIP ? `${PSY.kJkgToBtulb(hKj).toFixed(2)} Btu/lb` : `${hKj.toFixed(2)} kJ/kg`;

            lines.push(`Tdb  ${tempFmt(Tdb)}`);
            lines.push(`W    ${wFmt(W)}`);
            if (supersat) {
                lines.push(`Supersaturated`);
            } else {
                lines.push(`RH   ${isFinite(RH) ? RH.toFixed(1) + ' %' : '-'}`);
                lines.push(`h    ${isFinite(h) ? hFmt(h) : '-'}`);
                lines.push(`Twb  ${isFinite(Twb) ? tempFmt(Twb) : '-'}`);
            }

            this._drawReadout(lines);
        },

        _drawReadout(lines) {
            const ctx = this.ctx;
            const area = this.chartArea;
            ctx.save();
            ctx.font = '11px JetBrains Mono';
            const padX = 10;
            const padY = 8;
            const lh = 15;
            const widths = lines.map(s => ctx.measureText(s).width);
            const w = Math.max(...widths) + padX * 2;
            const h = lines.length * lh + padY * 2;
            const rx = area.x + area.width - w - 8;
            const ry = area.y + 8;

            ctx.fillStyle = this.theme.cardBg || 'rgba(255,255,255,0.95)';
            ctx.globalAlpha = 0.95;
            ctx.strokeStyle = this.theme.border || '#ccc';
            ctx.lineWidth = 1;
            const r = 6;
            ctx.beginPath();
            ctx.moveTo(rx + r, ry);
            ctx.lineTo(rx + w - r, ry);
            ctx.quadraticCurveTo(rx + w, ry, rx + w, ry + r);
            ctx.lineTo(rx + w, ry + h - r);
            ctx.quadraticCurveTo(rx + w, ry + h, rx + w - r, ry + h);
            ctx.lineTo(rx + r, ry + h);
            ctx.quadraticCurveTo(rx, ry + h, rx, ry + h - r);
            ctx.lineTo(rx, ry + r);
            ctx.quadraticCurveTo(rx, ry, rx + r, ry);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.globalAlpha = 1;

            ctx.fillStyle = this.theme.textPrimary || '#000';
            ctx.textBaseline = 'top';
            ctx.textAlign = 'left';
            lines.forEach((s, i) => {
                ctx.fillText(s, rx + padX, ry + padY + i * lh);
            });
            ctx.restore();
        },

        drawAxes() {
            const ctx = this.ctx;
            const { x, y, width, height } = this.chartArea;
            const isIP = units === 'ip';

            ctx.fillStyle = this.theme.textSecondary;
            ctx.font = '12px JetBrains Mono';
            ctx.strokeStyle = this.theme.border;
            ctx.lineWidth = 2;

            // X axis
            ctx.beginPath();
            ctx.moveTo(x, y + height);
            ctx.lineTo(x + width, y + height);
            ctx.stroke();

            // Y axis
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + height);
            ctx.stroke();

            // X axis labels: step matches grid major step (2x grid for label cadence)
            ctx.textAlign = 'center';
            ctx.font = '12px JetBrains Mono';
            const v = this.getView();
            const Tlabelstep = this._niceStep(v.Tdbmax - v.Tdbmin, 6);
            const Tstart = Math.ceil(v.Tdbmin / Tlabelstep) * Tlabelstep;
            for (let T = Tstart; T <= v.Tdbmax + 1e-6; T += Tlabelstep) {
                const xPos = this.TdbToX(T);
                const labelValue = isIP ? Math.round(PSY.CtoF(T)) : Number.isInteger(T) ? T : T.toFixed(1);
                const labelUnit = isIP ? ' °F' : ' °C';
                ctx.fillText(labelValue + labelUnit, xPos, y + height + 20);
            }

            // X axis title
            ctx.font = 'bold 13px JetBrains Mono';
            const xTitle = isIP ? 'Dry Bulb Temperature (°F)' : 'Dry Bulb Temperature (°C)';
            ctx.fillText(xTitle, x + width / 2, y + height + 45);

            // Y axis labels
            ctx.textAlign = 'right';
            ctx.font = '12px JetBrains Mono';
            const Wlabelstep = this._niceStep(v.Wmax - v.Wmin, 6);
            const Wstart = Math.ceil(v.Wmin / Wlabelstep) * Wlabelstep;
            for (let W = Wstart; W <= v.Wmax + 1e-6; W += Wlabelstep) {
                const yPos = this.WToY(W);
                const labelValue = isIP
                    ? (W / 1000).toFixed(3)
                    : (Number.isInteger(W) ? W : W.toFixed(1));
                const labelUnit = isIP ? ' lb/lb' : ' g/kg';
                ctx.fillText(labelValue + labelUnit, x - 10, yPos + 4);
            }

            // Y axis title
            const yTitle = isIP ? 'Humidity Ratio (lb/lb dry air)' : 'Humidity Ratio (g/kg dry air)';
            ctx.save();
            ctx.translate(x - 70, y + height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 13px JetBrains Mono';
            ctx.fillText(yTitle, 0, 0);
            ctx.restore();
        }
    };

    // Exports
    window.CHART = CHART;
    (window.Psy = window.Psy || {}).chart = CHART;
})();

