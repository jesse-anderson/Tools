(function () {
    const GraphCompare = window.ScientificGraphCompare = window.ScientificGraphCompare || {};

    GraphCompare.constants = Object.freeze({
        PDFJS_LOCAL_URL: "../vendor/pdfjs/pdf.min.js",
        PDFJS_LOCAL_MODULE_URL: "../vendor/pdfjs/pdf.min.mjs",
        PDFJS_CDN_MODULE_URL: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs",
        PDFJS_WORKER_CDN: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs",
        PDF_RENDER_SCALE_MAX: 16,
        PDF_RENDER_PIXEL_MAX: 64_000_000,
        IMAGE_FILE_BYTE_MAX: 25 * 1024 * 1024,
        PDF_FILE_BYTE_MAX: 50 * 1024 * 1024,
        IMAGE_PIXEL_MAX: 25_000_000,
        EXAMPLE_IMAGE_URL: "../img/scientific_graph_digitizer/graph-compare-example.jpeg",
        EXAMPLE_IMAGE_NAME: "graph-compare-example.jpeg",
        EXAMPLE_PRESET_STORAGE_KEY: "scientific_graph_compare.example_preset.v2",
        MIN_TREATMENT_COUNT: 2,
        MIN_TRACE_SERIES_COUNT: 1,
        TOOL_META: Object.freeze({ name: "scientific-graph-compare", version: "0.4.0" }),
        FIXED_MARK_META: Object.freeze({
            baseline: { label: "Baseline", short: "Base", color: "#f59e0b" },
            axis: { label: "Axis Tick", short: "Tick", color: "#fde047" },
            xOrigin: { label: "X Origin", short: "X0", color: "#c084fc" },
            xTick: { label: "X Tick", short: "XT", color: "#f9a8d4" }
        }),
        TOP_COLORS: Object.freeze(["#38bdf8", "#34d399", "#f472b6", "#fb923c", "#a78bfa", "#22d3ee", "#f87171", "#84cc16", "#2dd4bf", "#eab308"]),
        BOTTOM_COLORS: Object.freeze(["#0ea5e9", "#10b981", "#ec4899", "#f97316", "#8b5cf6", "#06b6d4", "#ef4444", "#65a30d", "#14b8a6", "#ca8a04"]),
        DEFAULT_EXAMPLE_PRESET: Object.freeze({
            filename: "graph-compare-example.jpeg",
            workingLabel: "Full image",
            measurementMode: "baseline",
            baselineValue: 0,
            axisTickValue: 100,
            yScaleMode: "linear",
            unitLabel: "%",
            useSeparateUnits: false,
            xScaleMode: "linear",
            seriesOrder: ["control", "a", "b"],
            seriesMeta: {
                control: { label: "Control", unit: "" },
                a: { label: "A", unit: "" },
                b: { label: "B", unit: "" }
            },
            points: {
                baseline: { x: 400.36307236819613, y: 1254.3185110947757 },
                axis: { x: 420.0567266351545, y: 336.8627802809166 }
            },
            seriesPoints: {
                control: { top: { x: 1555.1272469485093, y: 686.33563920236 }, bottom: null },
                a: { top: { x: 459.4440351690714, y: 675.5936637227331 }, bottom: null },
                b: { top: { x: 796.0263041490017, y: 757.9489342754205 }, bottom: null }
            }
        })
    });

    GraphCompare.state = {
        source: { canvas: null, filename: null, type: null, width: 0, height: 0 },
        working: { canvas: null, label: "Full image" },
        pdf: { doc: null },
        workflowMode: "compare",
        points: { baseline: null, axis: null, xOrigin: null, xTick: null },
        seriesOrder: ["control", "a", "b"],
        seriesMeta: {
            control: { label: "Control", unit: "" },
            a: { label: "A", unit: "" },
            b: { label: "B", unit: "" }
        },
        seriesPoints: {
            control: { top: null, bottom: null },
            a: { top: null, bottom: null },
            b: { top: null, bottom: null }
        },
        traceOrder: ["trace-a"],
        traceMeta: {
            "trace-a": { label: "Series A" }
        },
        tracePoints: {
            "trace-a": []
        },
        activeTool: null,
        roiDraft: null,
        pointer: { inside: false, x: 0, y: 0 },
        drag: { tool: null, pointerId: null }
    };

    GraphCompare.dom = {
        fileImage: document.getElementById("fileImage"),
        filePdf: document.getElementById("filePdf"),
        pdfControls: document.getElementById("pdfControls"),
        pdfPage: document.getElementById("pdfPage"),
        pdfPageMeta: document.getElementById("pdfPageMeta"),
        pdfScale: document.getElementById("pdfScale"),
        workflowMode: document.getElementById("workflowMode"),
        workflowHint: document.getElementById("workflowHint"),
        capturePanelHeading: document.getElementById("capturePanelHeading"),
        btnPdfPrev: document.getElementById("btnPdfPrev"),
        btnPdfNext: document.getElementById("btnPdfNext"),
        btnLoadExample: document.getElementById("btnLoadExample"),
        btnSaveExample: document.getElementById("btnSaveExample"),
        btnSelectRoi: document.getElementById("btnSelectRoi"),
        btnResetRoi: document.getElementById("btnResetRoi"),
        measurementMode: document.getElementById("measurementMode"),
        baselineValue: document.getElementById("baselineValue"),
        axisValue: document.getElementById("axisValue"),
        yScaleMode: document.getElementById("yScaleMode"),
        btnSetBaseline: document.getElementById("btnSetBaseline"),
        btnSetAxis: document.getElementById("btnSetAxis"),
        seriesTopButtons: document.getElementById("seriesTopButtons"),
        segmentButtons: document.getElementById("segmentButtons"),
        btnClearMarks: document.getElementById("btnClearMarks"),
        btnAddTreatment: document.getElementById("btnAddTreatment"),
        btnRemoveTreatment: document.getElementById("btnRemoveTreatment"),
        seriesConfigList: document.getElementById("seriesConfigList"),
        unitLabel: document.getElementById("unitLabel"),
        useSeparateUnits: document.getElementById("useSeparateUnits"),
        separateUnitsHint: document.getElementById("separateUnitsHint"),
        overlayShowBaselineValue: document.getElementById("overlayShowBaselineValue"),
        overlayShowAxisTickValue: document.getElementById("overlayShowAxisTickValue"),
        overlayShowXAxisTickValue: document.getElementById("overlayShowXAxisTickValue"),
        overlayShowRawPx: document.getElementById("overlayShowRawPx"),
        overlayShowValues: document.getElementById("overlayShowValues"),
        overlayShowVsControl: document.getElementById("overlayShowVsControl"),
        overlayShowSeriesCounts: document.getElementById("overlayShowSeriesCounts"),
        exportShowResults: document.getElementById("exportShowResults"),
        exportShowLegend: document.getElementById("exportShowLegend"),
        exportShowGuides: document.getElementById("exportShowGuides"),
        exportShowMeasures: document.getElementById("exportShowMeasures"),
        exportShowMarkerLabels: document.getElementById("exportShowMarkerLabels"),
        btnCopyResults: document.getElementById("btnCopyResults"),
        btnResetSavedExample: document.getElementById("btnResetSavedExample"),
        seriesPanel: document.getElementById("seriesPanel"),
        xAxisLabel: document.getElementById("xAxisLabel"),
        yAxisLabel: document.getElementById("yAxisLabel"),
        xOriginValue: document.getElementById("xOriginValue"),
        xTickValue: document.getElementById("xTickValue"),
        xScaleMode: document.getElementById("xScaleMode"),
        btnSetXOrigin: document.getElementById("btnSetXOrigin"),
        btnSetXTick: document.getElementById("btnSetXTick"),
        traceSeriesButtons: document.getElementById("traceSeriesButtons"),
        btnAddTraceSeries: document.getElementById("btnAddTraceSeries"),
        btnRemoveTraceSeries: document.getElementById("btnRemoveTraceSeries"),
        btnFinishSeries: document.getElementById("btnFinishSeries"),
        btnUndoTracePoint: document.getElementById("btnUndoTracePoint"),
        traceSeriesConfigList: document.getElementById("traceSeriesConfigList"),
        seriesActionHint: document.getElementById("seriesActionHint"),
        kvActiveSeries: document.getElementById("kvActiveSeries"),
        kvXAxisMode: document.getElementById("kvXAxisMode"),
        kvSource: document.getElementById("kvSource"),
        kvSize: document.getElementById("kvSize"),
        kvRoi: document.getElementById("kvRoi"),
        kvActiveTool: document.getElementById("kvActiveTool"),
        kvCursor: document.getElementById("kvCursor"),
        kvAxisMode: document.getElementById("kvAxisMode"),
        compareResultsHeader: document.getElementById("compareResultsHeader"),
        resultsDynamic: document.getElementById("resultsDynamic"),
        seriesResultsHeader: document.getElementById("seriesResultsHeader"),
        kvSeriesYAxisMode: document.getElementById("kvSeriesYAxisMode"),
        kvSeriesHeaderXAxisMode: document.getElementById("kvSeriesHeaderXAxisMode"),
        seriesResultsDynamic: document.getElementById("seriesResultsDynamic"),
        btnSaveAnnotated: document.getElementById("btnSaveAnnotated"),
        btnExportCsv: document.getElementById("btnExportCsv"),
        badgeMode: document.getElementById("badgeMode"),
        badgeShortcut: document.getElementById("badgeShortcut"),
        badgeWorkflow: document.getElementById("badgeWorkflow"),
        actionHint: document.getElementById("actionHint"),
        canvasWrap: document.getElementById("canvasWrap"),
        mainCanvas: document.getElementById("mainCanvas"),
        ctx: document.getElementById("mainCanvas").getContext("2d")
    };

    GraphCompare.uiState = {
        needsRender: false,
        pendingUiMode: "",
        topButtonsKey: "",
        segmentButtonsKey: "",
        configKey: "",
        traceButtonsKey: "",
        traceConfigKey: "",
        resultsStructureKey: "",
        resultsRows: Object.create(null),
        latestResults: null,
        overlayCharWidthKey: "",
        overlayCharWidth: 0,
        legendMetricsKey: "",
        legendMetrics: null,
        displayCache: {
            sourceCanvas: null,
            drawWidth: 0,
            drawHeight: 0,
            canvas: null
        },
        resizeObserver: null
    };

    const { constants, state, dom } = GraphCompare;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function fmtFloat(value, digits = 3) {
        return Number.isFinite(value) ? Number(value).toFixed(digits) : "NA";
    }

    function fmtPercent(value) {
        return Number.isFinite(value) ? `${Number(value).toFixed(2)}%` : "NA";
    }

    function formatValue(value) {
        if (!Number.isFinite(value)) return "NA";
        const abs = Math.abs(value);
        if ((abs >= 1000000 || (abs > 0 && abs < 0.001))) return Number(value).toExponential(4);
        return Number(value).toFixed(4);
    }

    function parseNumericInput(input) {
        const raw = input && typeof input.value === "string" ? input.value.trim() : "";
        if (raw === "") return null;
        const normalized = raw
            .replace(/,/g, "")
            .replace(/\s+/g, "")
            .replace(/\u00d7/g, "x");
        const powerMatch = normalized.match(/^10\^([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/i);
        const coefficientPowerMatch = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:x|\*)10\^([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/i);
        const value = powerMatch
            ? Math.pow(10, Number(powerMatch[1]))
            : (coefficientPowerMatch
                ? Number(coefficientPowerMatch[1]) * Math.pow(10, Number(coefficientPowerMatch[2]))
                : Number(normalized));
        return Number.isFinite(value) ? value : null;
    }

    function axisScaleMode(input) {
        return input && input.value === "log10" ? "log10" : "linear";
    }

    function axisScaleLabel(scaleMode) {
        return scaleMode === "log10" ? "Log10" : "Linear";
    }

    function valuesValidForScale(firstValue, secondValue, scaleMode) {
        if (!Number.isFinite(firstValue) || !Number.isFinite(secondValue)) return false;
        return scaleMode !== "log10" || (firstValue > 0 && secondValue > 0);
    }

    function mapAxisValue(fraction, firstValue, secondValue, scaleMode) {
        if (!Number.isFinite(fraction) || !valuesValidForScale(firstValue, secondValue, scaleMode)) return null;
        if (scaleMode === "log10") {
            const firstLog = Math.log10(firstValue);
            const secondLog = Math.log10(secondValue);
            return Math.pow(10, firstLog + fraction * (secondLog - firstLog));
        }
        return firstValue + fraction * (secondValue - firstValue);
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function cleanLabel(value, fallback) {
        const normalized = typeof value === "string" ? value.trim() : "";
        return normalized || fallback;
    }

    function clonePoint(point) {
        return point && Number.isFinite(point.x) && Number.isFinite(point.y) ? { x: point.x, y: point.y } : null;
    }

    function sanitizePoint(point, width, height) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
        return {
            x: clamp(point.x, 0, Math.max(0, width - 1)),
            y: clamp(point.y, 0, Math.max(0, height - 1))
        };
    }

    function clearNode(node) {
        while (node.firstChild) node.removeChild(node.firstChild);
    }

    function appendKvRow(container, label, value) {
        const labelNode = document.createElement("div");
        labelNode.textContent = label;
        const valueNode = document.createElement("div");
        valueNode.className = "val";
        valueNode.textContent = value;
        container.appendChild(labelNode);
        container.appendChild(valueNode);
    }

    function indexToLetters(index) {
        let value = index;
        let output = "";
        do {
            output = String.fromCharCode(97 + (value % 26)) + output;
            value = Math.floor(value / 26) - 1;
        } while (value >= 0);
        return output;
    }

    function defaultSeriesLabel(id) {
        return id === "control" ? "Control" : id.toUpperCase();
    }

    function traceIdAt(index) {
        return `trace-${indexToLetters(index)}`;
    }

    function defaultTraceLabel(id) {
        const suffix = typeof id === "string" && id.startsWith("trace-") ? id.slice(6) : id;
        return `Series ${String(suffix || "A").toUpperCase()}`;
    }

    function normalizeSeriesOrder(order, minTreatments = constants.MIN_TREATMENT_COUNT) {
        const normalized = ["control"];
        const seen = new Set(["control"]);
        if (Array.isArray(order)) {
            order.forEach((entry) => {
                const id = typeof entry === "string" ? entry.trim().toLowerCase() : "";
                if (!id || seen.has(id) || id === "control") return;
                seen.add(id);
                normalized.push(id);
            });
        }
        while (normalized.length < minTreatments + 1) {
            const id = indexToLetters(normalized.length - 1);
            if (!seen.has(id)) {
                seen.add(id);
                normalized.push(id);
            }
        }
        return normalized;
    }

    function createSeriesMeta(order, source) {
        const meta = {};
        order.forEach((id) => {
            meta[id] = {
                label: cleanLabel(source && source[id] && source[id].label, defaultSeriesLabel(id)),
                unit: cleanLabel(source && source[id] && source[id].unit, "")
            };
        });
        return meta;
    }

    function createSeriesPoints(order, source) {
        const points = {};
        order.forEach((id) => {
            const entry = source && source[id];
            points[id] = {
                top: clonePoint(entry && entry.top),
                bottom: clonePoint(entry && entry.bottom)
            };
        });
        return points;
    }

    function normalizeTraceOrder(order, minTraceSeries = constants.MIN_TRACE_SERIES_COUNT) {
        const normalized = [];
        const seen = new Set();
        if (Array.isArray(order)) {
            order.forEach((entry) => {
                const id = typeof entry === "string" ? entry.trim().toLowerCase() : "";
                if (!id || seen.has(id)) return;
                seen.add(id);
                normalized.push(id);
            });
        }
        while (normalized.length < minTraceSeries) {
            const id = traceIdAt(normalized.length);
            if (!seen.has(id)) {
                seen.add(id);
                normalized.push(id);
            }
        }
        return normalized;
    }

    function createTraceMeta(order, source) {
        const meta = {};
        order.forEach((id) => {
            meta[id] = {
                label: cleanLabel(source && source[id] && source[id].label, defaultTraceLabel(id))
            };
        });
        return meta;
    }

    function createTracePoints(order, source) {
        const points = {};
        order.forEach((id) => {
            const entries = source && source[id];
            points[id] = Array.isArray(entries)
                ? entries.map((point) => clonePoint(point)).filter(Boolean)
                : [];
        });
        return points;
    }

    function getSeriesIds() {
        return [...state.seriesOrder];
    }

    function getTreatmentIds() {
        return state.seriesOrder.filter((id) => id !== "control");
    }

    function nextSeriesId(id) {
        const index = state.seriesOrder.indexOf(id);
        if (index < 0 || index >= state.seriesOrder.length - 1) return null;
        return state.seriesOrder[index + 1];
    }

    function getSeriesLabel(id) {
        return cleanLabel(state.seriesMeta[id] && state.seriesMeta[id].label, defaultSeriesLabel(id));
    }

    function getCommonUnit() {
        return cleanLabel(dom.unitLabel.value, "");
    }

    function getSeriesUnit(id) {
        if (dom.useSeparateUnits.checked) {
            return cleanLabel(state.seriesMeta[id] && state.seriesMeta[id].unit, "");
        }
        return getCommonUnit();
    }

    function getTraceIds() {
        return [...state.traceOrder];
    }

    function getTraceLabel(id) {
        return cleanLabel(state.traceMeta[id] && state.traceMeta[id].label, defaultTraceLabel(id));
    }

    function nextTraceId() {
        return traceIdAt(state.traceOrder.length);
    }

    function shortSeriesLabel(id, suffix = "") {
        const label = getSeriesLabel(id);
        const trimmed = label.length > 4 ? label.slice(0, 4) : label;
        return `${trimmed}${suffix}`;
    }

    function seriesColorIndex(id) {
        return Math.max(0, state.seriesOrder.indexOf(id));
    }

    function setSeriesState(order, metaSource, pointSource) {
        const normalizedOrder = normalizeSeriesOrder(order);
        state.seriesOrder = normalizedOrder;
        state.seriesMeta = createSeriesMeta(normalizedOrder, metaSource);
        state.seriesPoints = createSeriesPoints(normalizedOrder, pointSource);
        if (state.activeTool && state.activeTool.seriesId && (state.activeTool.kind === "series-top" || state.activeTool.kind === "series-bottom") && !state.seriesOrder.includes(state.activeTool.seriesId)) {
            state.activeTool = null;
        }
    }

    function setTraceState(order, metaSource, pointSource) {
        const normalizedOrder = normalizeTraceOrder(order);
        state.traceOrder = normalizedOrder;
        state.traceMeta = createTraceMeta(normalizedOrder, metaSource);
        state.tracePoints = createTracePoints(normalizedOrder, pointSource);
        if (state.activeTool && state.activeTool.seriesId && (state.activeTool.kind === "trace-series" || state.activeTool.kind === "trace-point") && !state.traceOrder.includes(state.activeTool.seriesId)) {
            state.activeTool = null;
        }
    }

    function appendTracePoint(id, point) {
        if (!id || !state.tracePoints[id]) return;
        state.tracePoints[id].push(clonePoint(point));
    }

    function removeLastTracePoint(id) {
        if (!id || !state.tracePoints[id] || !state.tracePoints[id].length) return;
        state.tracePoints[id].pop();
    }

    function isSeriesWorkflowMode() {
        return state.workflowMode === "series";
    }

    function makeTool(kind, seriesId = null, pointIndex = null) {
        return kind ? { kind, seriesId: seriesId || null, pointIndex: Number.isInteger(pointIndex) ? pointIndex : null } : null;
    }

    function toolKey(tool) {
        return tool ? `${tool.kind}:${tool.seriesId || ""}:${Number.isInteger(tool.pointIndex) ? tool.pointIndex : ""}` : "";
    }

    function toolEquals(left, right) {
        return toolKey(left) === toolKey(right);
    }

    function isSeriesTopTool(tool) {
        return !!tool && tool.kind === "series-top";
    }

    function isSeriesBottomTool(tool) {
        return !!tool && tool.kind === "series-bottom";
    }

    function isTraceSeriesTool(tool) {
        return !!tool && tool.kind === "trace-series";
    }

    function isTracePointTool(tool) {
        return !!tool && tool.kind === "trace-point";
    }

    function seriesIdFromTool(tool) {
        return tool && tool.seriesId ? tool.seriesId : null;
    }

    function isSegmentMode() {
        return dom.measurementMode.value === "segment";
    }

    function getMarkMeta(tool) {
        if (!tool) return { label: "", short: "", color: "#94a3b8" };
        if (tool.kind === "baseline" || tool.kind === "axis" || tool.kind === "xOrigin" || tool.kind === "xTick") return constants.FIXED_MARK_META[tool.kind];
        if (tool.kind === "trace-point" || tool.kind === "trace-series") {
            const id = tool.seriesId;
            const colorIndex = Math.max(0, state.traceOrder.indexOf(id));
            const label = getTraceLabel(id);
            return {
                label,
                short: label.length > 6 ? label.slice(0, 6) : label,
                color: constants.TOP_COLORS[colorIndex % constants.TOP_COLORS.length]
            };
        }
        const id = tool.seriesId;
        if (!id) return { label: tool.kind, short: tool.kind, color: "#94a3b8" };
        const colorIndex = seriesColorIndex(id);
        const bottom = isSeriesBottomTool(tool);
        return {
            label: bottom ? `${getSeriesLabel(id)} Bottom` : getSeriesLabel(id),
            short: bottom ? shortSeriesLabel(id, "-") : shortSeriesLabel(id),
            color: (bottom ? constants.BOTTOM_COLORS : constants.TOP_COLORS)[colorIndex % constants.TOP_COLORS.length]
        };
    }

    function toolLabel(tool) {
        if (!tool) return "View";
        if (tool.kind === "roi") return "Select ROI";
        if (tool.kind === "baseline") return "Set Baseline Line";
        if (tool.kind === "axis") return "Set Axis Tick";
        if (tool.kind === "xOrigin") return "Set X Origin";
        if (tool.kind === "xTick") return "Set X Tick";
        if (tool.kind === "trace-series") return `Capture ${getTraceLabel(tool.seriesId)}`;
        if (tool.kind === "trace-point") return `Move ${getTraceLabel(tool.seriesId)} Point`;
        if (isSeriesBottomTool(tool)) return `Set ${getSeriesLabel(tool.seriesId)} Bottom`;
        if (isSeriesTopTool(tool)) return isSegmentMode() ? `Set ${getSeriesLabel(tool.seriesId)} Top` : `Set ${getSeriesLabel(tool.seriesId)}`;
        return "View";
    }

    function getPointByTool(tool) {
        if (!tool) return null;
        if (tool.kind === "baseline" || tool.kind === "axis" || tool.kind === "xOrigin" || tool.kind === "xTick") return state.points[tool.kind];
        if (isTracePointTool(tool)) {
            const points = tool.seriesId && state.tracePoints[tool.seriesId];
            return points && Number.isInteger(tool.pointIndex) ? points[tool.pointIndex] || null : null;
        }
        const id = tool.seriesId;
        if (!id || !state.seriesPoints[id]) return null;
        return isSeriesBottomTool(tool) ? state.seriesPoints[id].bottom : state.seriesPoints[id].top;
    }

    function setPointByTool(tool, point) {
        const nextPoint = point ? { x: point.x, y: point.y } : null;
        if (!tool) return;
        if (tool.kind === "baseline" || tool.kind === "axis" || tool.kind === "xOrigin" || tool.kind === "xTick") {
            state.points[tool.kind] = nextPoint;
            return;
        }
        if (isTracePointTool(tool)) {
            const points = tool.seriesId && state.tracePoints[tool.seriesId];
            if (!points || !Number.isInteger(tool.pointIndex) || tool.pointIndex < 0 || tool.pointIndex >= points.length) return;
            points[tool.pointIndex] = nextPoint;
            return;
        }
        const id = tool.seriesId;
        if (!id || !state.seriesPoints[id]) return;
        if (isSeriesBottomTool(tool)) {
            state.seriesPoints[id].bottom = nextPoint;
        } else {
            state.seriesPoints[id].top = nextPoint;
        }
    }

    function interactivePointTools() {
        const activeTools = [makeTool("baseline"), makeTool("axis"), makeTool("xOrigin"), makeTool("xTick")];
        if (isSeriesWorkflowMode()) {
            getTraceIds().forEach((id) => {
                (state.tracePoints[id] || []).forEach((point, index) => {
                    if (point) activeTools.push(makeTool("trace-point", id, index));
                });
            });
            return activeTools;
        }
        getSeriesIds().forEach((id) => {
            activeTools.push(makeTool("series-top", id));
            if (isSegmentMode()) activeTools.push(makeTool("series-bottom", id));
        });
        return activeTools;
    }

    function currentCanvas() {
        return state.working.canvas || state.source.canvas;
    }

    function currentViewport() {
        const image = currentCanvas();
        if (!image) return null;
        const pad = 20;
        const availableWidth = Math.max(40, dom.mainCanvas.width - pad * 2);
        const availableHeight = Math.max(40, dom.mainCanvas.height - pad * 2);
        const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        const offsetX = (dom.mainCanvas.width - drawWidth) / 2;
        const offsetY = (dom.mainCanvas.height - drawHeight) / 2;
        return { scale, drawWidth, drawHeight, offsetX, offsetY };
    }

    function imageToScreen(point, viewport) {
        return {
            x: viewport.offsetX + point.x * viewport.scale,
            y: viewport.offsetY + point.y * viewport.scale
        };
    }

    function screenToImage(point, viewport) {
        const image = currentCanvas();
        if (!viewport || !image) return null;
        const x = (point.x - viewport.offsetX) / viewport.scale;
        const y = (point.y - viewport.offsetY) / viewport.scale;
        if (x < 0 || y < 0 || x > image.width || y > image.height) return null;
        return {
            x: clamp(x, 0, image.width - 1),
            y: clamp(y, 0, image.height - 1)
        };
    }

    function screenToImageClamped(point, viewport) {
        const image = currentCanvas();
        if (!viewport || !image) return null;
        const x = (point.x - viewport.offsetX) / viewport.scale;
        const y = (point.y - viewport.offsetY) / viewport.scale;
        return {
            x: clamp(x, 0, image.width - 1),
            y: clamp(y, 0, image.height - 1)
        };
    }

    function normalizeRect(rect) {
        const x1 = Math.min(rect.x1, rect.x2);
        const y1 = Math.min(rect.y1, rect.y2);
        const x2 = Math.max(rect.x1, rect.x2);
        const y2 = Math.max(rect.y1, rect.y2);
        return {
            x: Math.round(x1),
            y: Math.round(y1),
            w: Math.max(1, Math.round(x2 - x1)),
            h: Math.max(1, Math.round(y2 - y1))
        };
    }

    function hitTestTool(screenPoint, viewport) {
        if (!viewport) return null;
        let bestKind = null;
        let bestSeriesId = null;
        let bestPointIndex = null;
        let bestDistance = Number.POSITIVE_INFINITY;
        const hitRadius = 14;
        const hitRadiusSq = hitRadius * hitRadius;

        const testPoint = (kind, seriesId, pointIndex, point) => {
            if (!point) return;
            const screen = imageToScreen(point, viewport);
            const dx = screen.x - screenPoint.x;
            const dy = screen.y - screenPoint.y;
            const distanceSq = dx * dx + dy * dy;
            if (distanceSq <= hitRadiusSq && distanceSq < bestDistance) {
                bestKind = kind;
                bestSeriesId = seriesId;
                bestPointIndex = pointIndex;
                bestDistance = distanceSq;
            }
        };

        testPoint("baseline", null, null, state.points.baseline);
        testPoint("axis", null, null, state.points.axis);
        if (isSeriesWorkflowMode()) {
            testPoint("xOrigin", null, null, state.points.xOrigin);
            testPoint("xTick", null, null, state.points.xTick);
            state.traceOrder.forEach((id) => {
                (state.tracePoints[id] || []).forEach((point, index) => {
                    testPoint("trace-point", id, index, point);
                });
            });
            return bestKind ? makeTool(bestKind, bestSeriesId, bestPointIndex) : null;
        }
        state.seriesOrder.forEach((id) => {
            const seriesPoints = state.seriesPoints[id];
            if (!seriesPoints) return;
            testPoint("series-top", id, null, seriesPoints.top);
            if (isSegmentMode()) testPoint("series-bottom", id, null, seriesPoints.bottom);
        });

        return bestKind ? makeTool(bestKind, bestSeriesId, bestPointIndex) : null;
    }

    function measurementBottomPoint(id) {
        if (isSegmentMode()) return state.seriesPoints[id] ? state.seriesPoints[id].bottom : null;
        return state.points.baseline;
    }

    function rawMeasurementValue(id) {
        const topPoint = state.seriesPoints[id] ? state.seriesPoints[id].top : null;
        const bottomPoint = measurementBottomPoint(id);
        if (!topPoint || !bottomPoint) return null;
        return bottomPoint.y - topPoint.y;
    }

    function deltaPercent(value, reference) {
        if (!Number.isFinite(value) || !Number.isFinite(reference) || reference === 0) return null;
        return ((value - reference) / reference) * 100;
    }

    function formatMeasurementValue(value, id) {
        if (!Number.isFinite(value)) return "NA";
        const unit = getSeriesUnit(id);
        return unit ? `${formatValue(value)} ${unit}` : formatValue(value);
    }

    function comparisonLabel(id, referenceId = "control") {
        return `${getSeriesLabel(id)} vs ${getSeriesLabel(referenceId)}`;
    }

    function computeYAxisCalibration() {
        const baselineLine = state.points.baseline;
        const axisLine = state.points.axis;
        const baselineNumericValue = parseNumericInput(dom.baselineValue);
        const tickValue = parseNumericInput(dom.axisValue);
        const scaleMode = axisScaleMode(dom.yScaleMode);
        const scaleLabel = axisScaleLabel(scaleMode);
        const validBaselineValue = Number.isFinite(baselineNumericValue);
        const validTickValue = Number.isFinite(tickValue);
        const validScaleValues = valuesValidForScale(baselineNumericValue, tickValue, scaleMode);
        const hasDistinctTickValue = validScaleValues && Math.abs(tickValue - baselineNumericValue) > 1e-9;
        let spanPx = null;
        let valueSpan = null;
        let axisMode = isSegmentMode() && !isSeriesWorkflowMode()
            ? "Segment only"
            : (validBaselineValue ? `${scaleLabel} baseline ${formatValue(baselineNumericValue)} only` : "Baseline value required");

        if (validBaselineValue && validTickValue && scaleMode === "log10" && !validScaleValues) {
            axisMode = "Log10 Y requires positive baseline and tick values, e.g. 1 and 1E5";
        } else if (baselineLine && axisLine && hasDistinctTickValue) {
            const tickSpan = baselineLine.y - axisLine.y;
            if (Math.abs(tickSpan) > 1e-6) {
                spanPx = tickSpan;
                valueSpan = tickValue - baselineNumericValue;
                axisMode = isSegmentMode() && !isSeriesWorkflowMode()
                    ? `${scaleLabel} segment scale ${formatValue(baselineNumericValue)} -> ${formatValue(tickValue)}`
                    : `${scaleLabel} baseline ${formatValue(baselineNumericValue)} -> tick ${formatValue(tickValue)}`;
            } else {
                axisMode = "Axis tick overlaps baseline";
            }
        } else if (baselineLine && axisLine && validBaselineValue && validTickValue && !hasDistinctTickValue) {
            axisMode = "Axis tick matches baseline value";
        }

        return {
            baselineLine,
            axisLine,
            baselineValue: baselineNumericValue,
            axisTickValue: tickValue,
            scaleMode,
            spanPx,
            valueSpan,
            axisMode,
            canCalibrate: Number.isFinite(spanPx) && Number.isFinite(valueSpan)
        };
    }

    function computeXAxisCalibration() {
        const xOriginPoint = state.points.xOrigin;
        const xTickPoint = state.points.xTick;
        const originValue = parseNumericInput(dom.xOriginValue);
        const tickValue = parseNumericInput(dom.xTickValue);
        const scaleMode = axisScaleMode(dom.xScaleMode);
        const scaleLabel = axisScaleLabel(scaleMode);
        const validOriginValue = Number.isFinite(originValue);
        const validTickValue = Number.isFinite(tickValue);
        const validScaleValues = valuesValidForScale(originValue, tickValue, scaleMode);
        const hasDistinctTickValue = validScaleValues && Math.abs(tickValue - originValue) > 1e-9;
        let spanPx = null;
        let valueSpan = null;
        let axisMode = validOriginValue ? `${scaleLabel} origin ${formatValue(originValue)} only` : "X origin value required";

        if (validOriginValue && validTickValue && scaleMode === "log10" && !validScaleValues) {
            axisMode = "Log10 X requires positive origin and tick values, e.g. 1 and 1E5";
        } else if (xOriginPoint && xTickPoint && hasDistinctTickValue) {
            const tickSpan = xTickPoint.x - xOriginPoint.x;
            if (Math.abs(tickSpan) > 1e-6) {
                spanPx = tickSpan;
                valueSpan = tickValue - originValue;
                axisMode = `${scaleLabel} origin ${formatValue(originValue)} -> tick ${formatValue(tickValue)}`;
            } else {
                axisMode = "X tick overlaps origin";
            }
        } else if (xOriginPoint && xTickPoint && validOriginValue && validTickValue && !hasDistinctTickValue) {
            axisMode = "X tick matches origin value";
        }

        return {
            xOriginPoint,
            xTickPoint,
            xOriginValue: originValue,
            xTickValue: tickValue,
            scaleMode,
            spanPx,
            valueSpan,
            axisMode,
            canCalibrate: Number.isFinite(spanPx) && Number.isFinite(valueSpan)
        };
    }

    function calibrateYForPoint(point, calibration) {
        if (!point || !calibration.canCalibrate) return null;
        const fraction = (calibration.baselineLine.y - point.y) / calibration.spanPx;
        return mapAxisValue(fraction, calibration.baselineValue, calibration.axisTickValue, calibration.scaleMode);
    }

    function calibrateXForPoint(point, calibration) {
        if (!point || !calibration.canCalibrate) return null;
        const fraction = (point.x - calibration.xOriginPoint.x) / calibration.spanPx;
        return mapAxisValue(fraction, calibration.xOriginValue, calibration.xTickValue, calibration.scaleMode);
    }

    function formatCursorReadout(point) {
        if (!point) return "--";

        const parts = [];
        const xCalibration = computeXAxisCalibration();
        const yCalibration = computeYAxisCalibration();
        const xValue = calibrateXForPoint(point, xCalibration);
        const yValue = calibrateYForPoint(point, yCalibration);
        const xLabel = cleanLabel(dom.xAxisLabel.value, "X");
        const yLabel = isSeriesWorkflowMode() ? cleanLabel(dom.yAxisLabel.value, "Y") : "Y";

        if (Number.isFinite(xValue)) {
            parts.push(`${xLabel}=${formatValue(xValue)}`);
        }

        if (Number.isFinite(yValue)) {
            const unit = !isSeriesWorkflowMode() ? cleanLabel(dom.unitLabel.value, "") : "";
            parts.push(unit ? `${yLabel}=${formatValue(yValue)} ${unit}` : `${yLabel}=${formatValue(yValue)}`);
        }

        parts.push(`X px=${fmtFloat(point.x, 2)}`);
        parts.push(`Y px=${fmtFloat(point.y, 2)}`);
        return parts.join(" | ");
    }

    function getResults() {
        const raw = {};
        const calibrated = {};
        const comparisonsVsControl = {};
        const xCalibration = computeXAxisCalibration();
        getSeriesIds().forEach((id) => {
            raw[id] = rawMeasurementValue(id);
            calibrated[id] = null;
        });

        const calibration = computeYAxisCalibration();

        getSeriesIds().forEach((id) => {
            if (calibration.canCalibrate && Number.isFinite(raw[id])) {
                const topPoint = state.seriesPoints[id] ? state.seriesPoints[id].top : null;
                if (isSegmentMode() && calibration.scaleMode === "log10") {
                    calibrated[id] = null;
                } else if (isSegmentMode()) {
                    calibrated[id] = (raw[id] / calibration.spanPx) * calibration.valueSpan;
                } else {
                    calibrated[id] = calibrateYForPoint(topPoint, calibration);
                }
            }
        });

        getTreatmentIds().forEach((id) => {
            comparisonsVsControl[id] = deltaPercent(raw[id], raw.control);
        });

        return {
            workflowMode: "compare",
            measurementMode: dom.measurementMode.value,
            axisMode: isSegmentMode() && calibration.scaleMode === "log10"
                ? `${calibration.axisMode}; segment heights disabled on log scale`
                : calibration.axisMode,
            xAxisMode: xCalibration.axisMode,
            baselineValue: calibration.baselineValue,
            axisTickValue: calibration.axisTickValue,
            xOriginValue: xCalibration.xOriginValue,
            xTickValue: xCalibration.xTickValue,
            yScaleMode: calibration.scaleMode,
            xScaleMode: xCalibration.scaleMode,
            xAxisLabel: cleanLabel(dom.xAxisLabel.value, "X"),
            raw,
            calibrated,
            comparisonsVsControl
        };
    }

    function getTraceResults() {
        const yCalibration = computeYAxisCalibration();
        const xCalibration = computeXAxisCalibration();
        const traces = {};
        let totalPointCount = 0;

        getTraceIds().forEach((id) => {
            const points = (state.tracePoints[id] || []).map((point, index) => ({
                index,
                xPx: point.x,
                yPx: point.y,
                xValue: calibrateXForPoint(point, xCalibration),
                yValue: calibrateYForPoint(point, yCalibration)
            }));
            totalPointCount += points.length;
            const finiteXPx = points.map((entry) => entry.xPx).filter(Number.isFinite);
            const finiteYPx = points.map((entry) => entry.yPx).filter(Number.isFinite);
            const finiteX = points.map((entry) => entry.xValue).filter(Number.isFinite);
            const finiteY = points.map((entry) => entry.yValue).filter(Number.isFinite);
            traces[id] = {
                label: getTraceLabel(id),
                count: points.length,
                points,
                xPxMin: finiteXPx.length ? Math.min(...finiteXPx) : null,
                xPxMax: finiteXPx.length ? Math.max(...finiteXPx) : null,
                yPxMin: finiteYPx.length ? Math.min(...finiteYPx) : null,
                yPxMax: finiteYPx.length ? Math.max(...finiteYPx) : null,
                xMin: finiteX.length ? Math.min(...finiteX) : null,
                xMax: finiteX.length ? Math.max(...finiteX) : null,
                yMin: finiteY.length ? Math.min(...finiteY) : null,
                yMax: finiteY.length ? Math.max(...finiteY) : null
            };
        });

        return {
            workflowMode: "series",
            yAxisMode: yCalibration.axisMode,
            xAxisMode: xCalibration.axisMode,
            baselineValue: yCalibration.baselineValue,
            axisTickValue: yCalibration.axisTickValue,
            xOriginValue: xCalibration.xOriginValue,
            xTickValue: xCalibration.xTickValue,
            yScaleMode: yCalibration.scaleMode,
            xScaleMode: xCalibration.scaleMode,
            xAxisLabel: cleanLabel(dom.xAxisLabel.value, "X"),
            yAxisLabel: cleanLabel(dom.yAxisLabel.value, "Y"),
            traces,
            totalPointCount
        };
    }

    function currentResults() {
        return isSeriesWorkflowMode() ? getTraceResults() : getResults();
    }

    function anyMeasurementPlaced() {
        if (state.points.baseline || state.points.axis || state.points.xOrigin || state.points.xTick) return true;
        if (getTraceIds().some((id) => state.tracePoints[id] && state.tracePoints[id].length)) return true;
        return getSeriesIds().some((id) => state.seriesPoints[id].top || state.seriesPoints[id].bottom);
    }

    function clearMarks() {
        state.points.baseline = null;
        state.points.axis = null;
        state.points.xOrigin = null;
        state.points.xTick = null;
        getSeriesIds().forEach((id) => {
            state.seriesPoints[id].top = null;
            state.seriesPoints[id].bottom = null;
        });
        getTraceIds().forEach((id) => {
            state.tracePoints[id] = [];
        });
    }

    function setActiveTool(tool) {
        state.activeTool = tool;
        if (!tool || tool.kind !== "roi") {
            state.roiDraft = null;
        }
        if (GraphCompare.ui && GraphCompare.ui.updateUi) GraphCompare.ui.updateUi();
        if (GraphCompare.ui && GraphCompare.ui.requestRender) GraphCompare.ui.requestRender();
    }

    function cloneCanvas(sourceCanvas) {
        const canvas = document.createElement("canvas");
        canvas.width = sourceCanvas.width;
        canvas.height = sourceCanvas.height;
        canvas.getContext("2d").drawImage(sourceCanvas, 0, 0);
        return canvas;
    }

    function createCanvasFromBitmap(bitmap) {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext("2d").drawImage(bitmap, 0, 0);
        return canvas;
    }

    function cropCanvas(sourceCanvas, rect) {
        const canvas = document.createElement("canvas");
        canvas.width = rect.w;
        canvas.height = rect.h;
        canvas.getContext("2d").drawImage(sourceCanvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
        return canvas;
    }

    function setSourceCanvas(canvas, filename, type) {
        state.source.canvas = canvas;
        state.source.filename = filename || "figure";
        state.source.type = type || "image";
        state.source.width = canvas.width;
        state.source.height = canvas.height;
        state.working.canvas = canvas;
        state.working.label = "Full image";
        if (state.source.type !== "pdf") {
            state.pdf.doc = null;
        }
        clearMarks();
        setActiveTool(null);
    }

    function resetWorkingToSource() {
        if (!state.source.canvas) return;
        state.working.canvas = state.source.canvas;
        state.working.label = "Full image";
        clearMarks();
        setActiveTool(null);
    }

    function canvasEventPoint(event) {
        if (Number.isFinite(event.offsetX) && Number.isFinite(event.offsetY)) {
            return { x: event.offsetX, y: event.offsetY };
        }
        const bounds = dom.mainCanvas.getBoundingClientRect();
        return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    }

    GraphCompare.helpers = {
        clamp,
        fmtFloat,
        fmtPercent,
        formatValue,
        parseNumericInput,
        nowIso,
        cleanLabel,
        clonePoint,
        sanitizePoint,
        clearNode,
        appendKvRow,
        cloneCanvas,
        createCanvasFromBitmap,
        cropCanvas,
        normalizeRect,
        deltaPercent,
        canvasEventPoint
    };
    GraphCompare.series = {
        indexToLetters,
        defaultSeriesLabel,
        normalizeSeriesOrder,
        createSeriesMeta,
        createSeriesPoints,
        setSeriesState,
        normalizeTraceOrder,
        createTraceMeta,
        createTracePoints,
        setTraceState,
        getTraceIds,
        getTraceLabel,
        nextTraceId,
        defaultTraceLabel,
        appendTracePoint,
        removeLastTracePoint,
        getSeriesIds,
        getTreatmentIds,
        nextSeriesId,
        getSeriesLabel,
        getCommonUnit,
        getSeriesUnit,
        shortSeriesLabel,
        seriesColorIndex
    };
    GraphCompare.tools = {
        makeTool,
        toolKey,
        toolEquals,
        isSeriesTopTool,
        isSeriesBottomTool,
        isTraceSeriesTool,
        isTracePointTool,
        seriesIdFromTool,
        getMarkMeta,
        toolLabel,
        getPointByTool,
        setPointByTool,
        interactivePointTools,
        hitTestTool
    };
    GraphCompare.measure = {
        isSegmentMode,
        isSeriesWorkflowMode,
        currentCanvas,
        currentViewport,
        imageToScreen,
        screenToImage,
        screenToImageClamped,
        measurementBottomPoint,
        rawMeasurementValue,
        formatMeasurementValue,
        comparisonLabel,
        computeYAxisCalibration,
        computeXAxisCalibration,
        calibrateXForPoint,
        calibrateYForPoint,
        formatCursorReadout,
        getResults,
        getTraceResults,
        currentResults,
        anyMeasurementPlaced
    };
    GraphCompare.stateOps = {
        clearMarks,
        setActiveTool,
        setSourceCanvas,
        resetWorkingToSource
    };
})();
