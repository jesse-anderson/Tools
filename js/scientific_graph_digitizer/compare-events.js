(function () {
    const GraphCompare = window.ScientificGraphCompare;
    const { constants, state, dom, helpers, series, tools, measure, stateOps, ui, io } = GraphCompare;
    const { clamp, normalizeRect, cropCanvas, canvasEventPoint } = helpers;
    const { getTreatmentIds, nextSeriesId, getTraceIds, getTraceLabel, nextTraceId, appendTracePoint, removeLastTracePoint, setTraceState } = series;
    const { makeTool, toolEquals, isSeriesTopTool, isSeriesBottomTool, isTraceSeriesTool, hitTestTool, setPointByTool } = tools;
    const { currentCanvas, currentViewport, screenToImage, screenToImageClamped, isSegmentMode, isSeriesWorkflowMode } = measure;

    function nextToolAfterPlacement(tool) {
        if (!tool) return null;
        if (tool.kind === "xOrigin" || tool.kind === "xTick") return null;
        if (tool.kind === "trace-series") return tool;
        if (tool.kind === "baseline") return isSeriesWorkflowMode() ? null : makeTool("series-top", "control");
        if (tool.kind === "axis") return null;
        const id = tool.seriesId;
        if (!id) return null;
        if (isSeriesTopTool(tool)) {
            if (isSegmentMode()) return makeTool("series-bottom", id);
            const nextId = nextSeriesId(id);
            return nextId ? makeTool("series-top", nextId) : null;
        }
        if (isSeriesBottomTool(tool)) {
            const nextId = nextSeriesId(id);
            return nextId ? makeTool("series-top", nextId) : null;
        }
        return null;
    }

    function placePoint(tool, point) {
        if (tool && tool.kind === "trace-series") {
            appendTracePoint(tool.seriesId, point);
            ui.requestRender("full");
            return;
        }
        setPointByTool(tool, point);
        stateOps.setActiveTool(nextToolAfterPlacement(tool));
    }

    async function renderSelectedPdfPage() {
        if (!state.pdf.doc) return;
        const pageNumber = clamp(parseInt(dom.pdfPage.value || "1", 10) || 1, 1, state.pdf.doc.numPages);
        const scale = clamp(parseFloat(dom.pdfScale.value || "4") || 4, 1, 10);
        dom.pdfPage.value = String(pageNumber);
        dom.pdfScale.value = String(scale);
        dom.pdfControls.hidden = false;
        ui.updateUi("full");
        await io.renderPdfPage(pageNumber, scale);
    }

    function handlePointerMove(event) {
        const viewport = currentViewport();
        const point = canvasEventPoint(event);
        const imagePoint = screenToImage(point, viewport);
        const clampedImagePoint = screenToImageClamped(point, viewport);
        if (state.drag.tool && clampedImagePoint) {
            setPointByTool(state.drag.tool, clampedImagePoint);
            state.pointer.inside = true;
            state.pointer.x = clampedImagePoint.x;
            state.pointer.y = clampedImagePoint.y;
            dom.kvCursor.textContent = `${helpers.fmtFloat(clampedImagePoint.x, 2)}, ${helpers.fmtFloat(clampedImagePoint.y, 2)}`;
            dom.mainCanvas.style.cursor = "grabbing";
            ui.requestRender("results");
            return;
        }
        if (imagePoint) {
            state.pointer.inside = true;
            state.pointer.x = imagePoint.x;
            state.pointer.y = imagePoint.y;
            dom.kvCursor.textContent = `${helpers.fmtFloat(imagePoint.x, 2)}, ${helpers.fmtFloat(imagePoint.y, 2)}`;
        } else {
            state.pointer.inside = false;
            dom.kvCursor.textContent = "--";
        }
        if (toolEquals(state.activeTool, makeTool("roi")) && state.roiDraft && imagePoint) {
            state.roiDraft.end = imagePoint;
            ui.requestRender();
        }
        const hitTool = hitTestTool(point, viewport);
        dom.mainCanvas.style.cursor = hitTool ? "grab" : "crosshair";
    }

    function handlePointerDown(event) {
        if (event.button !== 0) return;
        const image = currentCanvas();
        if (!image) return;
        const viewport = currentViewport();
        const screenPoint = canvasEventPoint(event);
        const hitTool = hitTestTool(screenPoint, viewport);
        if (hitTool) {
            state.drag.tool = hitTool;
            state.drag.pointerId = event.pointerId;
            try { dom.mainCanvas.setPointerCapture(event.pointerId); } catch (error) {}
            dom.mainCanvas.style.cursor = "grabbing";
            return;
        }
        const imagePoint = screenToImage(screenPoint, viewport);
        if (!imagePoint) return;
        if (toolEquals(state.activeTool, makeTool("roi"))) {
            state.roiDraft = { start: imagePoint, end: imagePoint };
            try { dom.mainCanvas.setPointerCapture(event.pointerId); } catch (error) {}
            ui.requestRender();
            return;
        }
        if (state.activeTool && !toolEquals(state.activeTool, makeTool("roi"))) {
            placePoint(state.activeTool, imagePoint);
        }
    }

    function handlePointerUp(event) {
        if (state.drag.tool) {
            state.drag.tool = null;
            state.drag.pointerId = null;
            try { dom.mainCanvas.releasePointerCapture(event.pointerId); } catch (error) {}
            dom.mainCanvas.style.cursor = "crosshair";
            ui.requestRender("results");
            return;
        }
        if (!toolEquals(state.activeTool, makeTool("roi")) || !state.roiDraft || !state.working.canvas) return;
        const rect = normalizeRect({
            x1: state.roiDraft.start.x,
            y1: state.roiDraft.start.y,
            x2: state.roiDraft.end.x,
            y2: state.roiDraft.end.y
        });
        if (rect.w >= 8 && rect.h >= 8) {
            state.working.canvas = cropCanvas(state.working.canvas, rect);
            state.working.label = `${rect.w.toLocaleString()} x ${rect.h.toLocaleString()} crop`;
            stateOps.clearMarks();
        }
        state.roiDraft = null;
        try { dom.mainCanvas.releasePointerCapture(event.pointerId); } catch (error) {}
        stateOps.setActiveTool(null);
    }

    function addTreatment() {
        const nextId = series.indexToLetters(getTreatmentIds().length);
        series.setSeriesState([...state.seriesOrder, nextId], state.seriesMeta, state.seriesPoints);
        ui.requestRender("full");
    }

    function removeLastTreatment() {
        const treatments = getTreatmentIds();
        if (treatments.length <= constants.MIN_TREATMENT_COUNT) return;
        const removedId = treatments[treatments.length - 1];
        series.setSeriesState(state.seriesOrder.filter((id) => id !== removedId), state.seriesMeta, state.seriesPoints);
        ui.requestRender("full");
    }

    function addTraceSeries() {
        const nextId = nextTraceId();
        setTraceState([...state.traceOrder, nextId], state.traceMeta, state.tracePoints);
        ui.requestRender("full");
    }

    function removeLastTraceSeries() {
        const traceIds = getTraceIds();
        if (traceIds.length <= constants.MIN_TRACE_SERIES_COUNT) return;
        const removedId = traceIds[traceIds.length - 1];
        setTraceState(state.traceOrder.filter((id) => id !== removedId), state.traceMeta, state.tracePoints);
        ui.requestRender("full");
    }

    function finishActiveTraceSeries() {
        if (state.activeTool && state.activeTool.kind === "trace-series") {
            stateOps.setActiveTool(null);
        }
    }

    function undoLastActiveTracePoint() {
        if (!state.activeTool || state.activeTool.kind !== "trace-series") return;
        removeLastTracePoint(state.activeTool.seriesId);
        ui.requestRender("full");
    }

    function bindSeriesButtonDelegates() {
        dom.seriesTopButtons.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-kind][data-series-id]");
            if (!button) return;
            const tool = makeTool(button.dataset.kind, button.dataset.seriesId);
            stateOps.setActiveTool(toolEquals(state.activeTool, tool) ? null : tool);
        });

        dom.segmentButtons.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-kind][data-series-id]");
            if (!button) return;
            const tool = makeTool(button.dataset.kind, button.dataset.seriesId);
            stateOps.setActiveTool(toolEquals(state.activeTool, tool) ? null : tool);
        });

        dom.traceSeriesButtons.addEventListener("click", (event) => {
            const button = event.target.closest("button[data-kind][data-series-id]");
            if (!button) return;
            const tool = makeTool(button.dataset.kind, button.dataset.seriesId);
            stateOps.setActiveTool(toolEquals(state.activeTool, tool) ? null : tool);
        });
    }

    function bindConfigInputs() {
        dom.seriesConfigList.addEventListener("input", (event) => {
            const input = event.target.closest("input[data-series-id][data-field]");
            if (!input) return;
            const id = input.dataset.seriesId;
            const field = input.dataset.field;
            if (!state.seriesMeta[id]) return;
            state.seriesMeta[id][field] = input.value;
            ui.requestRender("full");
        });

        dom.traceSeriesConfigList.addEventListener("input", (event) => {
            const input = event.target.closest("input[data-series-id][data-field][data-trace-config='true']");
            if (!input) return;
            const id = input.dataset.seriesId;
            const field = input.dataset.field;
            if (!state.traceMeta[id]) return;
            state.traceMeta[id][field] = input.value;
            ui.requestRender("full");
        });
    }

    function bindInputEvents() {
        dom.fileImage.addEventListener("change", async (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            await io.loadImageFile(file);
            dom.fileImage.value = "";
        });

        dom.btnLoadExample.addEventListener("click", async () => {
            try {
                await io.loadSavedOrDefaultExample();
            } catch (error) {
                alert("Example image could not be loaded from the repo path.");
            }
        });

        dom.btnSaveExample.addEventListener("click", async () => {
            if (!currentCanvas()) {
                alert("Load an image first, then place any example marks you want to reuse.");
                return;
            }
            if (!await io.saveExamplePreset()) {
                alert("Current example could not be saved in browser storage.");
                return;
            }
            alert("Current view and marks saved. Future Load Example clicks will restore this state.");
        });

        dom.filePdf.addEventListener("change", async (event) => {
            const file = event.target.files && event.target.files[0];
            if (!file) return;
            const ok = await io.loadPdfJsIfNeeded();
            if (!ok) {
                alert("PDF.js could not be loaded. Vendor pdf.js locally or allow CDN access.");
                dom.filePdf.value = "";
                return;
            }
            const bytes = await file.arrayBuffer();
            state.source.filename = file.name;
            state.source.type = "pdf";
            state.pdf.doc = await window.pdfjsLib.getDocument({ data: bytes }).promise;
            dom.pdfPage.max = String(state.pdf.doc.numPages);
            dom.pdfPage.value = "1";
            dom.pdfControls.hidden = false;
            ui.updateUi("full");
            await renderSelectedPdfPage();
            dom.filePdf.value = "";
        });

        dom.btnPdfPrev.addEventListener("click", async () => {
            if (!state.pdf.doc) return;
            dom.pdfPage.value = String(clamp((parseInt(dom.pdfPage.value || "1", 10) || 1) - 1, 1, state.pdf.doc.numPages));
            await renderSelectedPdfPage();
        });

        dom.btnPdfNext.addEventListener("click", async () => {
            if (!state.pdf.doc) return;
            dom.pdfPage.value = String(clamp((parseInt(dom.pdfPage.value || "1", 10) || 1) + 1, 1, state.pdf.doc.numPages));
            await renderSelectedPdfPage();
        });

        dom.pdfPage.addEventListener("change", async () => {
            await renderSelectedPdfPage();
        });

        dom.pdfScale.addEventListener("change", async () => {
            await renderSelectedPdfPage();
        });

        [dom.pdfPage, dom.pdfScale].forEach((input) => {
            input.addEventListener("keydown", async (event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                await renderSelectedPdfPage();
            });
        });
    }

    function bindControlEvents() {
        dom.btnSelectRoi.addEventListener("click", () => {
            if (!state.source.canvas) return;
            const roiTool = makeTool("roi");
            stateOps.setActiveTool(toolEquals(state.activeTool, roiTool) ? null : roiTool);
        });
        dom.btnResetRoi.addEventListener("click", () => stateOps.resetWorkingToSource());
        dom.btnSetBaseline.addEventListener("click", () => {
            const tool = makeTool("baseline");
            stateOps.setActiveTool(toolEquals(state.activeTool, tool) ? null : tool);
        });
        dom.btnSetAxis.addEventListener("click", () => {
            const tool = makeTool("axis");
            stateOps.setActiveTool(toolEquals(state.activeTool, tool) ? null : tool);
        });
        dom.btnSetXOrigin.addEventListener("click", () => {
            const tool = makeTool("xOrigin");
            stateOps.setActiveTool(toolEquals(state.activeTool, tool) ? null : tool);
        });
        dom.btnSetXTick.addEventListener("click", () => {
            const tool = makeTool("xTick");
            stateOps.setActiveTool(toolEquals(state.activeTool, tool) ? null : tool);
        });
        dom.btnClearMarks.addEventListener("click", () => {
            stateOps.clearMarks();
            stateOps.setActiveTool(null);
        });
        dom.btnAddTreatment.addEventListener("click", addTreatment);
        dom.btnRemoveTreatment.addEventListener("click", removeLastTreatment);
        dom.btnAddTraceSeries.addEventListener("click", addTraceSeries);
        dom.btnRemoveTraceSeries.addEventListener("click", removeLastTraceSeries);
        dom.btnFinishSeries.addEventListener("click", finishActiveTraceSeries);
        dom.btnUndoTracePoint.addEventListener("click", undoLastActiveTracePoint);
        dom.btnSaveAnnotated.addEventListener("click", async () => { await io.saveAnnotatedPng(); });
        dom.btnExportCsv.addEventListener("click", () => io.exportCsv());
        dom.btnCopyResults.addEventListener("click", async () => {
            const ok = await io.copyResults();
            if (!ok) alert("Results could not be copied to the clipboard.");
        });
        dom.btnResetSavedExample.addEventListener("click", () => {
            try {
                localStorage.removeItem(constants.EXAMPLE_PRESET_STORAGE_KEY);
                alert("Saved example cleared. Load Example will now fall back to the bundled example.");
            } catch (error) {
                alert("Saved example could not be cleared.");
            }
        });
    }

    function bindCanvasEvents() {
        dom.mainCanvas.addEventListener("pointermove", handlePointerMove);
        dom.mainCanvas.addEventListener("pointerdown", handlePointerDown);
        dom.mainCanvas.addEventListener("pointerup", handlePointerUp);
        dom.mainCanvas.addEventListener("contextmenu", (event) => {
            if (state.activeTool && state.activeTool.kind === "trace-series") {
                event.preventDefault();
                finishActiveTraceSeries();
            }
        });
        dom.mainCanvas.addEventListener("pointercancel", (event) => {
            state.drag.tool = null;
            state.drag.pointerId = null;
            state.roiDraft = null;
            try { dom.mainCanvas.releasePointerCapture(event.pointerId); } catch (error) {}
            dom.mainCanvas.style.cursor = "crosshair";
            ui.requestRender("results");
        });
        dom.mainCanvas.addEventListener("pointerleave", () => {
            state.pointer.inside = false;
            dom.kvCursor.textContent = "--";
            if (!state.drag.tool) {
                dom.mainCanvas.style.cursor = "crosshair";
            }
            if (state.roiDraft) ui.requestRender();
        });
    }

    function bindMiscEvents() {
        dom.workflowMode.addEventListener("change", () => {
            state.workflowMode = dom.workflowMode.value === "series" ? "series" : "compare";
            if (!isSeriesWorkflowMode() && (isTraceSeriesTool(state.activeTool) || (state.activeTool && (state.activeTool.kind === "xOrigin" || state.activeTool.kind === "xTick" || state.activeTool.kind === "trace-point")))) {
                stateOps.setActiveTool(null);
                return;
            }
            if (isSeriesWorkflowMode() && (isSeriesBottomTool(state.activeTool) || isSeriesTopTool(state.activeTool))) {
                stateOps.setActiveTool(null);
                return;
            }
            ui.requestRender("full");
        });

        dom.measurementMode.addEventListener("change", () => {
            if (!isSegmentMode() && isSeriesBottomTool(state.activeTool)) {
                stateOps.setActiveTool(null);
                return;
            }
            ui.requestRender("full");
        });

        [dom.baselineValue, dom.axisValue, dom.unitLabel, dom.xAxisLabel, dom.yAxisLabel, dom.xOriginValue, dom.xTickValue].forEach((input) => {
            input.addEventListener("input", () => {
                ui.requestRender("full");
            });
        });

        dom.useSeparateUnits.addEventListener("change", () => {
            ui.requestRender("full");
        });

        [dom.overlayShowBaselineValue, dom.overlayShowAxisTickValue, dom.overlayShowXAxisTickValue, dom.overlayShowRawPx, dom.overlayShowValues, dom.overlayShowVsControl, dom.overlayShowSeriesCounts].forEach((input) => {
            input.addEventListener("change", () => ui.requestRender());
        });

        window.addEventListener("resize", () => ui.requestRender());
        window.addEventListener("keydown", (event) => {
            const activeElement = document.activeElement;
            const isTypingTarget = activeElement && (
                activeElement.tagName === "INPUT" ||
                activeElement.tagName === "TEXTAREA" ||
                activeElement.tagName === "SELECT" ||
                activeElement.isContentEditable
            );
            if (isTypingTarget) return;
            const key = event.key.toLowerCase();
            if (key === "escape") return stateOps.setActiveTool(null);
            if (key === "r") { event.preventDefault(); return stateOps.setActiveTool(makeTool("roi")); }
            if (key === "z") { event.preventDefault(); return stateOps.setActiveTool(makeTool("baseline")); }
            if (key === "t") { event.preventDefault(); return stateOps.setActiveTool(makeTool("axis")); }
            if (key === "o" && isSeriesWorkflowMode()) { event.preventDefault(); return stateOps.setActiveTool(makeTool("xOrigin")); }
            if (key === "k" && isSeriesWorkflowMode()) { event.preventDefault(); return stateOps.setActiveTool(makeTool("xTick")); }
            if (isSeriesWorkflowMode() && /^[1-9]$/.test(key)) {
                const index = Number(key) - 1;
                const traceIds = getTraceIds();
                if (traceIds[index]) {
                    event.preventDefault();
                    return stateOps.setActiveTool(makeTool("trace-series", traceIds[index]));
                }
            }
            if (!isSeriesWorkflowMode() && key === "c") { event.preventDefault(); return stateOps.setActiveTool(makeTool("series-top", "control")); }
            if (!isSeriesWorkflowMode() && key === "a" && getTreatmentIds()[0]) { event.preventDefault(); return stateOps.setActiveTool(makeTool("series-top", getTreatmentIds()[0])); }
            if (!isSeriesWorkflowMode() && key === "b" && getTreatmentIds()[1]) { event.preventDefault(); return stateOps.setActiveTool(makeTool("series-top", getTreatmentIds()[1])); }
            if (isSeriesWorkflowMode() && key === "backspace" && state.activeTool && state.activeTool.kind === "trace-series") {
                event.preventDefault();
                return undoLastActiveTracePoint();
            }
            if (key === "x") {
                event.preventDefault();
                stateOps.clearMarks();
                stateOps.setActiveTool(null);
            }
        });
    }

    bindInputEvents();
    bindControlEvents();
    bindSeriesButtonDelegates();
    bindConfigInputs();
    bindCanvasEvents();
    bindMiscEvents();
    ui.updateUi();
    ui.requestRender();
})();
