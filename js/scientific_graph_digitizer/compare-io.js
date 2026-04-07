(function () {
    const GraphCompare = window.ScientificGraphCompare;
    const { constants, state, dom, helpers, series, tools, measure, stateOps } = GraphCompare;
    const { clonePoint, sanitizePoint, nowIso, parseNumericInput, cloneCanvas, createCanvasFromBitmap } = helpers;
    const { createSeriesMeta, createSeriesPoints, normalizeSeriesOrder, getSeriesIds, getSeriesLabel, getSeriesUnit, getCommonUnit } = series;
    const { currentCanvas, isSegmentMode, getResults } = measure;

    function downloadBlob(filename, blob) {
        const anchor = document.createElement("a");
        const url = URL.createObjectURL(blob);
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    function canvasToBlob(canvas, type = "image/png", quality = 0.92) {
        return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
    }

    function normalizePreset(preset, canvas) {
        const width = canvas.width;
        const height = canvas.height;
        const legacyMeta = {
            control: { label: preset && preset.controlLabel, unit: preset && preset.controlUnit },
            a: { label: preset && preset.aLabel, unit: preset && preset.aUnit },
            b: { label: preset && preset.bLabel, unit: preset && preset.bUnit }
        };
        const order = normalizeSeriesOrder(Array.isArray(preset && preset.seriesOrder) ? preset.seriesOrder : ["control", "a", "b"]);
        const metaSource = Object.assign({}, legacyMeta, preset && preset.seriesMeta);
        const pointSource = {};
        order.forEach((id) => {
            pointSource[id] = {
                top: sanitizePoint(preset && preset.seriesPoints && preset.seriesPoints[id] && preset.seriesPoints[id].top, width, height),
                bottom: sanitizePoint(preset && preset.seriesPoints && preset.seriesPoints[id] && preset.seriesPoints[id].bottom, width, height)
            };
        });
        if (preset && preset.points) {
            if (pointSource.control && !pointSource.control.top && preset.points.control) pointSource.control.top = sanitizePoint(preset.points.control, width, height);
            if (pointSource.control && !pointSource.control.bottom && preset.points.controlBase) pointSource.control.bottom = sanitizePoint(preset.points.controlBase, width, height);
            if (pointSource.a && !pointSource.a.top && preset.points.a) pointSource.a.top = sanitizePoint(preset.points.a, width, height);
            if (pointSource.a && !pointSource.a.bottom && preset.points.aBase) pointSource.a.bottom = sanitizePoint(preset.points.aBase, width, height);
            if (pointSource.b && !pointSource.b.top && preset.points.b) pointSource.b.top = sanitizePoint(preset.points.b, width, height);
            if (pointSource.b && !pointSource.b.bottom && preset.points.bBase) pointSource.b.bottom = sanitizePoint(preset.points.bBase, width, height);
        }
        return {
            measurementMode: preset && preset.measurementMode === "segment" ? "segment" : "baseline",
            baselineValue: Number.isFinite(preset && preset.baselineValue) ? preset.baselineValue : 0,
            axisTickValue: Number.isFinite(preset && preset.axisTickValue) ? preset.axisTickValue : 100,
            unitLabel: typeof (preset && preset.unitLabel) === "string" ? preset.unitLabel : "",
            useSeparateUnits: !!(preset && preset.useSeparateUnits),
            workingLabel: typeof (preset && preset.workingLabel) === "string" && preset.workingLabel.trim() ? preset.workingLabel : "Full image",
            seriesOrder: order,
            seriesMeta: createSeriesMeta(order, metaSource),
            points: {
                baseline: sanitizePoint(preset && preset.points && preset.points.baseline, width, height),
                axis: sanitizePoint(preset && preset.points && preset.points.axis, width, height)
            },
            seriesPoints: createSeriesPoints(order, pointSource)
        };
    }

    function blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
            reader.onerror = () => reject(reader.error || new Error("Blob could not be converted to a data URL."));
            reader.readAsDataURL(blob);
        });
    }

    async function serializeExampleSource(image) {
        if (state.source.type === "image" && state.source.filename === constants.EXAMPLE_IMAGE_NAME) {
            return { kind: "bundled-example" };
        }
        const blob = await canvasToBlob(image, "image/jpeg", 0.9);
        const imageDataUrl = blob ? await blobToDataUrl(blob) : image.toDataURL("image/jpeg", 0.9);
        return {
            kind: "embedded",
            imageDataUrl
        };
    }

    async function collectExamplePreset() {
        const image = currentCanvas();
        if (!image) return null;
        return {
            source: await serializeExampleSource(image),
            filename: state.source.filename || constants.EXAMPLE_IMAGE_NAME,
            workingLabel: state.working.label,
            measurementMode: dom.measurementMode.value,
            baselineValue: parseNumericInput(dom.baselineValue),
            axisTickValue: parseNumericInput(dom.axisValue),
            unitLabel: dom.unitLabel.value,
            useSeparateUnits: dom.useSeparateUnits.checked,
            seriesOrder: [...state.seriesOrder],
            seriesMeta: createSeriesMeta(state.seriesOrder, state.seriesMeta),
            points: {
                baseline: clonePoint(state.points.baseline),
                axis: clonePoint(state.points.axis)
            },
            seriesPoints: createSeriesPoints(state.seriesOrder, state.seriesPoints),
            savedAt: nowIso()
        };
    }

    async function saveExamplePreset() {
        const preset = await collectExamplePreset();
        if (!preset) return false;
        try {
            localStorage.setItem(constants.EXAMPLE_PRESET_STORAGE_KEY, JSON.stringify(preset));
            return true;
        } catch (error) {
            return false;
        }
    }

    function readExamplePreset() {
        try {
            const raw = localStorage.getItem(constants.EXAMPLE_PRESET_STORAGE_KEY);
            if (!raw) return null;
            const preset = JSON.parse(raw);
            if (preset && preset.source && preset.source.kind === "bundled-example") return preset;
            if (preset && preset.source && preset.source.kind === "embedded" && typeof preset.source.imageDataUrl === "string") return preset;
            if (preset && typeof preset.imageDataUrl === "string") {
                preset.source = { kind: "embedded", imageDataUrl: preset.imageDataUrl };
                delete preset.imageDataUrl;
                return preset;
            }
            return null;
        } catch (error) {
            return null;
        }
    }

    function applyExamplePreset(preset, canvas) {
        const normalized = normalizePreset(preset, canvas);
        dom.measurementMode.value = normalized.measurementMode;
        dom.baselineValue.value = String(normalized.baselineValue);
        dom.axisValue.value = String(normalized.axisTickValue);
        dom.unitLabel.value = normalized.unitLabel;
        dom.useSeparateUnits.checked = normalized.useSeparateUnits;
        state.working.label = normalized.workingLabel;
        state.points.baseline = normalized.points.baseline;
        state.points.axis = normalized.points.axis;
        series.setSeriesState(normalized.seriesOrder, normalized.seriesMeta, normalized.seriesPoints);
        stateOps.setActiveTool(null);
    }

    function buildCsv() {
        const results = getResults();
        const image = currentCanvas();
        const rows = [
            ["field", "value"],
            ["tool_name", constants.TOOL_META.name],
            ["tool_version", constants.TOOL_META.version],
            ["exported_at", nowIso()],
            ["source_type", state.source.type || ""],
            ["source_filename", state.source.filename || ""],
            ["image_width_px", image ? image.width : ""],
            ["image_height_px", image ? image.height : ""],
            ["working_label", state.working.label],
            ["measurement_mode", dom.measurementMode.value],
            ["axis_mode", results.axisMode],
            ["series_order", state.seriesOrder.join("|")],
            ["shared_unit", getCommonUnit()],
            ["separate_units", dom.useSeparateUnits.checked ? "true" : "false"],
            ["baseline_value", Number.isFinite(results.baselineValue) ? results.baselineValue.toFixed(6) : ""],
            ["axis_tick_value", Number.isFinite(results.axisTickValue) ? results.axisTickValue.toFixed(6) : ""],
            ["baseline_x_px", state.points.baseline ? state.points.baseline.x.toFixed(4) : ""],
            ["baseline_y_px", state.points.baseline ? state.points.baseline.y.toFixed(4) : ""],
            ["axis_x_px", state.points.axis ? state.points.axis.x.toFixed(4) : ""],
            ["axis_y_px", state.points.axis ? state.points.axis.y.toFixed(4) : ""]
        ];

        getSeriesIds().forEach((id) => {
            const point = state.seriesPoints[id];
            rows.push([`${id}_label`, getSeriesLabel(id)]);
            rows.push([`${id}_unit`, getSeriesUnit(id)]);
            rows.push([`${id}_x_px`, point.top ? point.top.x.toFixed(4) : ""]);
            rows.push([`${id}_y_px`, point.top ? point.top.y.toFixed(4) : ""]);
            rows.push([`${id}_bottom_x_px`, point.bottom ? point.bottom.x.toFixed(4) : ""]);
            rows.push([`${id}_bottom_y_px`, point.bottom ? point.bottom.y.toFixed(4) : ""]);
            rows.push([`${id}_height_px`, Number.isFinite(results.raw[id]) ? results.raw[id].toFixed(6) : ""]);
            rows.push([`${id}_value`, Number.isFinite(results.calibrated[id]) ? results.calibrated[id].toFixed(6) : ""]);
            if (id !== "control") {
                rows.push([`${id}_vs_control_pct`, Number.isFinite(results.comparisonsVsControl[id]) ? results.comparisonsVsControl[id].toFixed(6) : ""]);
            }
        });

        const csvCell = (value) => {
            const stringValue = value == null ? "" : String(value);
            return /[",\n]/.test(stringValue) ? `"${stringValue.replace(/"/g, "\"\"")}"` : stringValue;
        };
        return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
    }

    async function copyResults() {
        const text = buildCsv();
        if (navigator.clipboard && navigator.clipboard.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch (error) {}
        }
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        textarea.remove();
        return ok;
    }

    async function saveAnnotatedPng() {
        const image = currentCanvas();
        if (!image) return;
        const results = getResults();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const exportCtx = canvas.getContext("2d");
        const viewport = { scale: 1, drawWidth: image.width, drawHeight: image.height, offsetX: 0, offsetY: 0 };
        exportCtx.drawImage(image, 0, 0);
        if (dom.exportShowGuides.checked && state.points.baseline) GraphCompare.ui.drawGuideLine(exportCtx, viewport, state.points.baseline, "rgba(245,158,11,0.88)");
        if (dom.exportShowGuides.checked && state.points.axis) GraphCompare.ui.drawGuideLine(exportCtx, viewport, state.points.axis, "rgba(253,224,71,0.82)");
        if (dom.exportShowMeasures.checked) {
            getSeriesIds().forEach((id) => GraphCompare.ui.drawVerticalMeasure(exportCtx, viewport, id));
        }
        GraphCompare.ui.drawMarker(exportCtx, viewport, tools.makeTool("baseline"), state.points.baseline, 8, dom.exportShowMarkerLabels.checked);
        GraphCompare.ui.drawMarker(exportCtx, viewport, tools.makeTool("axis"), state.points.axis, 8, dom.exportShowMarkerLabels.checked);
        getSeriesIds().forEach((id) => {
            GraphCompare.ui.drawMarker(exportCtx, viewport, tools.makeTool("series-top", id), state.seriesPoints[id].top, 8, dom.exportShowMarkerLabels.checked);
            if (isSegmentMode()) {
                GraphCompare.ui.drawMarker(exportCtx, viewport, tools.makeTool("series-bottom", id), state.seriesPoints[id].bottom, 8, dom.exportShowMarkerLabels.checked);
            }
        });
        if (dom.exportShowResults.checked) GraphCompare.ui.drawOverlayBox(exportCtx, viewport, results);
        if (dom.exportShowLegend.checked) GraphCompare.ui.drawLegendBox(exportCtx, viewport);
        const blob = await canvasToBlob(canvas, "image/png");
        const stem = (state.source.filename || "scientific_graph_compare").replace(/\.[^.]+$/, "");
        downloadBlob(`${stem}_annotated_compare.png`, blob);
    }

    function exportCsv() {
        const blob = new Blob([buildCsv()], { type: "text/csv;charset=utf-8" });
        const stem = (state.source.filename || "scientific_graph_compare").replace(/\.[^.]+$/, "");
        downloadBlob(`${stem}_compare.csv`, blob);
    }

    function loadPdfJsIfNeeded() {
        return new Promise((resolve) => {
            if (window.pdfjsLib && window.pdfjsLib.getDocument) {
                try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = constants.PDFJS_WORKER_CDN; } catch (error) {}
                resolve(true);
                return;
            }

            const tryLoadClassic = (src) => new Promise((innerResolve) => {
                const script = document.createElement("script");
                script.src = src;
                script.onload = () => innerResolve(true);
                script.onerror = () => innerResolve(false);
                document.head.appendChild(script);
            });

            const tryLoadModule = async (src) => {
                try {
                    const module = await import(src);
                    if (module && module.getDocument) {
                        window.pdfjsLib = module;
                        return true;
                    }
                } catch (error) {}
                return false;
            };

            (async () => {
                let ok = await tryLoadClassic(constants.PDFJS_LOCAL_URL);
                if (!ok) ok = await tryLoadModule(constants.PDFJS_LOCAL_MODULE_URL);
                if (!ok) ok = await tryLoadModule(constants.PDFJS_CDN_MODULE_URL);
                if (ok && window.pdfjsLib && window.pdfjsLib.getDocument) {
                    try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = constants.PDFJS_WORKER_CDN; } catch (error) {}
                    resolve(true);
                } else {
                    resolve(false);
                }
            })();
        });
    }

    async function loadImageFile(file) {
        const bitmap = await createImageBitmap(file);
        const canvas = createCanvasFromBitmap(bitmap);
        if (bitmap.close) {
            try { bitmap.close(); } catch (error) {}
        }
        stateOps.setSourceCanvas(canvas, file.name, "image");
        dom.pdfControls.hidden = true;
    }

    function loadImageUrl(url, filename) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
                const canvas = document.createElement("canvas");
                canvas.width = image.naturalWidth || image.width;
                canvas.height = image.naturalHeight || image.height;
                canvas.getContext("2d").drawImage(image, 0, 0);
                stateOps.setSourceCanvas(canvas, filename, "image");
                dom.pdfControls.hidden = true;
                resolve(canvas);
            };
            image.onerror = () => reject(new Error(`Could not load example image: ${url}`));
            image.src = url;
        });
    }

    async function renderPdfPage(pageNumber, scale) {
        if (!state.pdf.doc) return;
        const page = await state.pdf.doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const renderCtx = canvas.getContext("2d");
        await page.render({ canvasContext: renderCtx, viewport }).promise;
        stateOps.setSourceCanvas(canvas, state.source.filename || "document.pdf", "pdf");
        dom.pdfControls.hidden = false;
    }

    async function loadSavedOrDefaultExample() {
        const savedPreset = readExamplePreset();
        if (savedPreset) {
            if (savedPreset.source && savedPreset.source.kind === "bundled-example") {
                const canvas = await loadImageUrl(constants.EXAMPLE_IMAGE_URL, savedPreset.filename || constants.EXAMPLE_IMAGE_NAME);
                applyExamplePreset(savedPreset, canvas);
                return;
            }
            if (savedPreset.source && savedPreset.source.kind === "embedded" && typeof savedPreset.source.imageDataUrl === "string") {
                const canvas = await loadImageUrl(savedPreset.source.imageDataUrl, savedPreset.filename || constants.EXAMPLE_IMAGE_NAME);
                applyExamplePreset(savedPreset, canvas);
                return;
            }
        }
        const canvas = await loadImageUrl(constants.EXAMPLE_IMAGE_URL, constants.EXAMPLE_IMAGE_NAME);
        applyExamplePreset(constants.DEFAULT_EXAMPLE_PRESET, canvas);
    }

    GraphCompare.io = {
        downloadBlob,
        canvasToBlob,
        normalizePreset,
        collectExamplePreset,
        saveExamplePreset,
        readExamplePreset,
        applyExamplePreset,
        buildCsv,
        copyResults,
        saveAnnotatedPng,
        exportCsv,
        loadPdfJsIfNeeded,
        loadImageFile,
        loadImageUrl,
        renderPdfPage,
        loadSavedOrDefaultExample
    };
})();
