(function () {
    const GraphCompare = window.ScientificGraphCompare;
    const { constants, state, dom, uiState, helpers, series, tools, measure } = GraphCompare;
    const { clearNode } = helpers;
    const { getSeriesIds, getTreatmentIds, getSeriesLabel, getSeriesUnit, defaultSeriesLabel } = series;
    const { makeTool, toolEquals, toolKey, getMarkMeta } = tools;
    const { isSegmentMode, currentCanvas, currentViewport, imageToScreen, formatMeasurementValue, comparisonLabel, getResults, anyMeasurementPlaced } = measure;

    function setCanvasSize() {
        const bounds = dom.canvasWrap.getBoundingClientRect();
        const width = Math.max(320, Math.floor(bounds.width));
        const height = Math.max(420, Math.floor(bounds.height));
        if (dom.mainCanvas.width !== width || dom.mainCanvas.height !== height) {
            dom.mainCanvas.width = width;
            dom.mainCanvas.height = height;
            return true;
        }
        return false;
    }

    function queueUiMode(mode) {
        if (mode === "full") {
            uiState.pendingUiMode = "full";
            return;
        }
        if (mode === "results" && uiState.pendingUiMode !== "full") {
            uiState.pendingUiMode = "results";
        }
    }

    function requestRender(syncUiMode = "") {
        queueUiMode(syncUiMode);
        if (uiState.needsRender) return;
        uiState.needsRender = true;
        requestAnimationFrame(() => {
            uiState.needsRender = false;
            if (uiState.pendingUiMode) {
                const mode = uiState.pendingUiMode;
                uiState.pendingUiMode = "";
                updateUi(mode);
            }
            render();
        });
    }

    function getResultsSnapshot(forceRefresh = false) {
        if (forceRefresh || !uiState.latestResults) {
            uiState.latestResults = getResults();
        }
        return uiState.latestResults;
    }

    function getDisplayCanvas(image, viewport) {
        if (!image || !viewport) return null;
        const drawWidth = Math.max(1, Math.round(viewport.drawWidth));
        const drawHeight = Math.max(1, Math.round(viewport.drawHeight));
        if (drawWidth === image.width && drawHeight === image.height) {
            return { image, drawWidth, drawHeight };
        }

        const cache = uiState.displayCache;
        if (
            cache.sourceCanvas !== image ||
            cache.drawWidth !== drawWidth ||
            cache.drawHeight !== drawHeight ||
            !cache.canvas
        ) {
            const scaledCanvas = document.createElement("canvas");
            scaledCanvas.width = drawWidth;
            scaledCanvas.height = drawHeight;
            const scaledCtx = scaledCanvas.getContext("2d");
            scaledCtx.imageSmoothingEnabled = true;
            scaledCtx.imageSmoothingQuality = "high";
            scaledCtx.drawImage(image, 0, 0, drawWidth, drawHeight);
            cache.sourceCanvas = image;
            cache.drawWidth = drawWidth;
            cache.drawHeight = drawHeight;
            cache.canvas = scaledCanvas;
        }

        return { image: cache.canvas, drawWidth, drawHeight };
    }

    function getSeriesConfigFocusState() {
        const active = document.activeElement;
        if (!active || !dom.seriesConfigList.contains(active)) return null;
        if (!(active instanceof HTMLInputElement)) return null;
        const seriesId = active.dataset.seriesId;
        const field = active.dataset.field;
        if (!seriesId || !field) return null;
        return {
            seriesId,
            field,
            selectionStart: active.selectionStart,
            selectionEnd: active.selectionEnd
        };
    }

    function resultsStructureKey() {
        return JSON.stringify({
            mode: dom.measurementMode.value,
            order: state.seriesOrder,
            labels: state.seriesOrder.map((id) => getSeriesLabel(id)),
            units: state.seriesOrder.map((id) => getSeriesUnit(id))
        });
    }

    function ensureResultsPanelStructure() {
        const key = resultsStructureKey();
        if (uiState.resultsStructureKey === key) return;
        uiState.resultsStructureKey = key;
        uiState.resultsRows = Object.create(null);
        clearNode(dom.resultsDynamic);

        const pxSuffix = isSegmentMode() ? "segment height" : "height";
        const valueSuffix = isSegmentMode() ? "segment value" : "value";

        const addRow = (rowKey, label) => {
            const labelNode = document.createElement("div");
            labelNode.textContent = label;
            const valueNode = document.createElement("div");
            valueNode.className = "val";
            dom.resultsDynamic.appendChild(labelNode);
            dom.resultsDynamic.appendChild(valueNode);
            uiState.resultsRows[rowKey] = { labelNode, valueNode };
        };

        state.seriesOrder.forEach((id) => {
            addRow(`raw:${id}`, `${getSeriesLabel(id)} ${pxSuffix} (px)`);
        });

        state.seriesOrder.forEach((id) => {
            const unit = getSeriesUnit(id);
            addRow(`value:${id}`, `${getSeriesLabel(id)} ${valueSuffix}${unit ? ` (${unit})` : ""}`);
        });

        getTreatmentIds().forEach((id) => {
            addRow(`compare:${id}`, comparisonLabel(id, "control"));
        });
    }

    function topButtonsKey(hasSource) {
        return JSON.stringify({
            hasSource,
            active: toolKey(state.activeTool),
            mode: dom.measurementMode.value,
            labels: getSeriesIds().map((id) => getSeriesLabel(id))
        });
    }

    function segmentButtonsKey(hasSource) {
        return JSON.stringify({
            hasSource,
            active: toolKey(state.activeTool),
            mode: dom.measurementMode.value,
            labels: getSeriesIds().map((id) => getSeriesLabel(id))
        });
    }

    function configKey() {
        return JSON.stringify({
            order: state.seriesOrder,
            separate: dom.useSeparateUnits.checked,
            labels: getSeriesIds().map((id) => getSeriesLabel(id)),
            units: getSeriesIds().map((id) => state.seriesMeta[id] && state.seriesMeta[id].unit ? state.seriesMeta[id].unit : "")
        });
    }

    function renderSeriesButtons(hasSource) {
        const key = topButtonsKey(hasSource);
        if (uiState.topButtonsKey === key) return;
        uiState.topButtonsKey = key;
        clearNode(dom.seriesTopButtons);
        getSeriesIds().forEach((id) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "tool-btn";
            if (toolEquals(state.activeTool, makeTool("series-top", id))) button.classList.add("primary");
            button.disabled = !hasSource;
            button.dataset.kind = "series-top";
            button.dataset.seriesId = id;
            button.textContent = isSegmentMode() ? `Set ${getSeriesLabel(id)} Top` : `Set ${getSeriesLabel(id)}`;
            dom.seriesTopButtons.appendChild(button);
        });
    }

    function renderSegmentButtons(hasSource) {
        const segmentMode = isSegmentMode();
        dom.segmentButtons.hidden = !segmentMode;
        dom.segmentButtons.style.display = segmentMode ? "flex" : "none";
        const key = segmentButtonsKey(hasSource);
        if (!segmentMode) {
            if (uiState.segmentButtonsKey !== "") {
                clearNode(dom.segmentButtons);
                uiState.segmentButtonsKey = "";
            }
            return;
        }
        if (uiState.segmentButtonsKey === key) return;
        uiState.segmentButtonsKey = key;
        clearNode(dom.segmentButtons);
        getSeriesIds().forEach((id) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "tool-btn";
            if (toolEquals(state.activeTool, makeTool("series-bottom", id))) button.classList.add("primary");
            button.disabled = !hasSource;
            button.dataset.kind = "series-bottom";
            button.dataset.seriesId = id;
            button.textContent = `Set ${getSeriesLabel(id)} Bottom`;
            dom.segmentButtons.appendChild(button);
        });
    }

    function renderSeriesConfigList() {
        const key = configKey();
        if (uiState.configKey === key) return;
        uiState.configKey = key;
        const focusState = getSeriesConfigFocusState();
        clearNode(dom.seriesConfigList);
        getSeriesIds().forEach((id) => {
            const row = document.createElement("div");
            row.className = "row";

            const labelLine = document.createElement("div");
            labelLine.className = "input-line";
            const labelTitle = document.createElement("label");
            labelTitle.textContent = `${defaultSeriesLabel(id)} Label`;
            const labelInput = document.createElement("input");
            labelInput.type = "text";
            labelInput.value = getSeriesLabel(id);
            labelInput.placeholder = defaultSeriesLabel(id);
            labelInput.dataset.seriesId = id;
            labelInput.dataset.field = "label";
            labelLine.appendChild(labelTitle);
            labelLine.appendChild(labelInput);
            row.appendChild(labelLine);

            if (dom.useSeparateUnits.checked) {
                const unitLine = document.createElement("div");
                unitLine.className = "input-line";
                const unitTitle = document.createElement("label");
                unitTitle.textContent = `${defaultSeriesLabel(id)} Unit`;
                const unitInput = document.createElement("input");
                unitInput.type = "text";
                unitInput.value = state.seriesMeta[id] && state.seriesMeta[id].unit ? state.seriesMeta[id].unit : "";
                unitInput.placeholder = "%, mmol, g, etc.";
                unitInput.dataset.seriesId = id;
                unitInput.dataset.field = "unit";
                unitLine.appendChild(unitTitle);
                unitLine.appendChild(unitInput);
                row.appendChild(unitLine);
            }

            dom.seriesConfigList.appendChild(row);
        });

        if (focusState) {
            const selector = `input[data-series-id="${focusState.seriesId}"][data-field="${focusState.field}"]`;
            const input = dom.seriesConfigList.querySelector(selector);
            if (input) {
                input.focus({ preventScroll: true });
                if (typeof focusState.selectionStart === "number" && typeof focusState.selectionEnd === "number") {
                    try {
                        input.setSelectionRange(focusState.selectionStart, focusState.selectionEnd);
                    } catch (error) {}
                }
            }
        }
    }

    function hasMeasuredSeries(results) {
        return getSeriesIds().some((id) => Number.isFinite(results.raw[id]));
    }

    function updateRawRow(id, results) {
        const rawRow = uiState.resultsRows[`raw:${id}`];
        if (rawRow) rawRow.valueNode.textContent = helpers.fmtFloat(results.raw[id]);
    }

    function updateValueRow(id, results) {
        const valueRow = uiState.resultsRows[`value:${id}`];
        if (valueRow) valueRow.valueNode.textContent = formatMeasurementValue(results.calibrated[id], id);
    }

    function updateComparisonRow(id, results) {
        const compareRow = uiState.resultsRows[`compare:${id}`];
        if (compareRow) compareRow.valueNode.textContent = helpers.fmtPercent(results.comparisonsVsControl[id]);
    }

    function updateAllResultsRows(results) {
        state.seriesOrder.forEach((id) => {
            updateRawRow(id, results);
            updateValueRow(id, results);
        });
        getTreatmentIds().forEach((id) => updateComparisonRow(id, results));
    }

    function updatePartialResultsRows(results, tool) {
        if (!tool || !tool.kind) {
            updateAllResultsRows(results);
            return;
        }

        if (tool.kind === "axis") {
            state.seriesOrder.forEach((id) => updateValueRow(id, results));
            return;
        }

        if (tool.kind === "baseline") {
            if (isSegmentMode()) {
                state.seriesOrder.forEach((id) => updateValueRow(id, results));
                return;
            }
            updateAllResultsRows(results);
            return;
        }

        const id = tool.seriesId;
        if (!id) {
            updateAllResultsRows(results);
            return;
        }

        updateRawRow(id, results);
        updateValueRow(id, results);
        if (id === "control") {
            getTreatmentIds().forEach((seriesId) => updateComparisonRow(seriesId, results));
        } else {
            updateComparisonRow(id, results);
        }
    }

    function syncResultsUi(results, mode = "full") {
        dom.kvAxisMode.textContent = results.axisMode;
        if (mode !== "results" || !state.drag.tool || !uiState.resultsStructureKey) {
            ensureResultsPanelStructure();
            updateAllResultsRows(results);
        } else {
            updatePartialResultsRows(results, state.drag.tool);
        }
        dom.btnExportCsv.disabled = !hasMeasuredSeries(results);
        dom.btnCopyResults.disabled = !hasMeasuredSeries(results);
    }

    function updateUi(mode = "full") {
        const results = getResultsSnapshot(true);
        if (mode === "results") {
            syncResultsUi(results);
            return;
        }

        const image = currentCanvas();
        const hasSource = !!state.source.canvas;
        const hasPdfSource = state.source.type === "pdf" && !!state.pdf.doc;

        dom.kvSource.textContent = state.source.filename ? `${state.source.type}: ${state.source.filename}` : "--";
        dom.kvSize.textContent = image ? `${image.width.toLocaleString()} x ${image.height.toLocaleString()}` : "--";
        dom.kvRoi.textContent = state.working.label;
        dom.kvActiveTool.textContent = tools.toolLabel(state.activeTool);
        dom.badgeMode.textContent = tools.toolLabel(state.activeTool);

        renderSeriesButtons(hasSource);
        renderSegmentButtons(hasSource);
        renderSeriesConfigList();
        syncResultsUi(results, mode);

        dom.separateUnitsHint.hidden = !dom.useSeparateUnits.checked;
        dom.pdfControls.hidden = !state.pdf.doc;
        dom.canvasWrap.classList.toggle("pdf-mode", hasPdfSource);
        if (dom.pdfPageMeta) {
            dom.pdfPageMeta.textContent = state.pdf.doc ? `${dom.pdfPage.value || "1"} / ${state.pdf.doc.numPages}` : "1 / 1";
        }
        if (dom.btnPdfPrev) dom.btnPdfPrev.disabled = !state.pdf.doc || Number(dom.pdfPage.value || "1") <= 1;
        if (dom.btnPdfNext) dom.btnPdfNext.disabled = !state.pdf.doc || Number(dom.pdfPage.value || "1") >= state.pdf.doc.numPages;
        dom.btnSelectRoi.disabled = !hasSource;
        dom.btnResetRoi.disabled = !hasSource;
        dom.btnSetBaseline.disabled = !hasSource;
        dom.btnSetAxis.disabled = !hasSource;
        dom.btnSetBaseline.classList.toggle("primary", toolEquals(state.activeTool, makeTool("baseline")));
        dom.btnSetAxis.classList.toggle("primary", toolEquals(state.activeTool, makeTool("axis")));
        dom.btnSelectRoi.classList.toggle("primary", toolEquals(state.activeTool, makeTool("roi")));
        dom.btnClearMarks.disabled = !hasSource || !anyMeasurementPlaced();
        dom.btnSaveAnnotated.disabled = !hasSource;
        dom.btnSaveExample.disabled = !hasSource;
        dom.btnRemoveTreatment.disabled = getTreatmentIds().length <= constants.MIN_TREATMENT_COUNT;

        dom.actionHint.textContent = toolEquals(state.activeTool, makeTool("roi"))
            ? "Drag a rectangle on the image. Mouse up crops the working view immediately."
            : isSegmentMode()
                ? "Segment mode: set baseline and axis only if you want calibration, then place top and bottom markers for each series. Existing markers can be dragged directly."
                : "Typical order: upload image, optionally select ROI, set the baseline line and its value, optionally set one different axis tick for scaling, then set control and the treatment markers. Existing markers can be dragged directly.";
    }

    function drawGuideLine(targetCtx, viewport, point, color) {
        if (!point) return;
        const image = currentCanvas();
        if (!image) return;
        const left = imageToScreen({ x: 0, y: point.y }, viewport);
        const right = imageToScreen({ x: image.width, y: point.y }, viewport);
        targetCtx.save();
        targetCtx.strokeStyle = color;
        targetCtx.lineWidth = 1.5;
        targetCtx.setLineDash([8, 6]);
        targetCtx.beginPath();
        targetCtx.moveTo(left.x, left.y);
        targetCtx.lineTo(right.x, right.y);
        targetCtx.stroke();
        targetCtx.restore();
    }

    function drawVerticalMeasure(targetCtx, viewport, id) {
        const topPoint = state.seriesPoints[id] ? state.seriesPoints[id].top : null;
        const bottomPoint = measure.measurementBottomPoint(id);
        if (!topPoint || !bottomPoint) return;
        const meta = getMarkMeta(makeTool("series-top", id));
        const top = imageToScreen(topPoint, viewport);
        const base = isSegmentMode()
            ? imageToScreen(bottomPoint, viewport)
            : imageToScreen({ x: topPoint.x, y: bottomPoint.y }, viewport);
        targetCtx.save();
        targetCtx.strokeStyle = meta.color;
        targetCtx.lineWidth = 2;
        targetCtx.setLineDash([6, 4]);
        targetCtx.beginPath();
        targetCtx.moveTo(top.x, top.y);
        targetCtx.lineTo(base.x, base.y);
        targetCtx.stroke();
        targetCtx.restore();
    }

    function drawMarker(targetCtx, viewport, tool, point, radius = null, showLabel = true) {
        if (!point) return;
        const meta = getMarkMeta(tool);
        const screen = imageToScreen(point, viewport);
        const r = radius || Math.max(5, Math.min(10, viewport.scale * 0.5));
        targetCtx.save();
        targetCtx.beginPath();
        targetCtx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
        targetCtx.fillStyle = meta.color;
        targetCtx.fill();
        targetCtx.lineWidth = Math.max(2, r * 0.35);
        targetCtx.strokeStyle = "rgba(255,255,255,0.95)";
        targetCtx.stroke();
        if (showLabel) {
            targetCtx.font = `${Math.max(12, r * 1.7)}px 'JetBrains Mono', monospace`;
            targetCtx.fillStyle = "rgba(255,255,255,0.95)";
            targetCtx.shadowColor = "rgba(0,0,0,0.65)";
            targetCtx.shadowBlur = 6;
            targetCtx.fillText(meta.short, screen.x + r + 6, screen.y - r - 4);
        }
        targetCtx.restore();
    }

    function drawRoiDraft(targetCtx, viewport) {
        if (!state.roiDraft) return;
        const start = imageToScreen(state.roiDraft.start, viewport);
        const end = imageToScreen(state.roiDraft.end, viewport);
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);
        targetCtx.save();
        targetCtx.fillStyle = "rgba(59,130,246,0.12)";
        targetCtx.strokeStyle = "rgba(59,130,246,0.95)";
        targetCtx.lineWidth = 2;
        targetCtx.setLineDash([8, 6]);
        targetCtx.fillRect(x, y, w, h);
        targetCtx.strokeRect(x, y, w, h);
        targetCtx.restore();
    }

    function buildOverlayLines(results) {
        const lines = [];
        const anyMeasured = hasMeasuredSeries(results);
        if (dom.overlayShowBaselineValue.checked && Number.isFinite(results.baselineValue) && (state.points.baseline || anyMeasured)) {
            lines.push(`Baseline value: ${helpers.formatValue(results.baselineValue)}`);
        }
        if (dom.overlayShowAxisTickValue.checked && Number.isFinite(results.axisTickValue) && state.points.axis) {
            lines.push(`Axis tick value: ${helpers.formatValue(results.axisTickValue)}`);
        }
        if (dom.overlayShowRawPx.checked) {
            getSeriesIds().forEach((id) => {
                if (Number.isFinite(results.raw[id])) {
                    lines.push(`${getSeriesLabel(id)} px: ${helpers.fmtFloat(results.raw[id])}`);
                }
            });
        }
        if (dom.overlayShowValues.checked) {
            getSeriesIds().forEach((id) => {
                if (Number.isFinite(results.calibrated[id])) {
                    lines.push(`${getSeriesLabel(id)} value: ${formatMeasurementValue(results.calibrated[id], id)}`);
                }
            });
        }
        if (dom.overlayShowVsControl.checked) {
            getTreatmentIds().forEach((id) => {
                if (Number.isFinite(results.comparisonsVsControl[id])) {
                    lines.push(`${comparisonLabel(id, "control")}: ${helpers.fmtPercent(results.comparisonsVsControl[id])}`);
                }
            });
        }
        return lines;
    }

    function getOverlayBoxWidth(targetCtx, fontSize, lines, padding) {
        const charKey = `${fontSize}`;
        if (uiState.overlayCharWidthKey !== charKey) {
            targetCtx.save();
            targetCtx.font = `${fontSize}px 'JetBrains Mono', monospace`;
            uiState.overlayCharWidth = targetCtx.measureText("0").width;
            uiState.overlayCharWidthKey = charKey;
            targetCtx.restore();
        }
        const maxLen = lines.reduce((max, line) => Math.max(max, line.length), 0);
        return Math.ceil(maxLen * uiState.overlayCharWidth) + padding * 2;
    }

    function drawOverlayBox(targetCtx, viewport, resultsOverride = null) {
        const results = resultsOverride || getResultsSnapshot();
        const lines = buildOverlayLines(results);
        if (!lines.length) return;
        targetCtx.save();
        const fontSize = Math.max(12, viewport.scale * 0.36);
        targetCtx.font = `${fontSize}px 'JetBrains Mono', monospace`;
        const padding = 12;
        const lineHeight = Math.max(16, viewport.scale * 0.6);
        const width = getOverlayBoxWidth(targetCtx, fontSize, lines, padding);
        const height = lines.length * lineHeight + padding * 2;
        const x = Math.max(12, targetCtx.canvas.width - width - 12);
        const y = 12;
        targetCtx.fillStyle = "rgba(15,23,42,0.86)";
        targetCtx.fillRect(x, y, width, height);
        targetCtx.strokeStyle = "rgba(148,163,184,0.25)";
        targetCtx.strokeRect(x, y, width, height);
        targetCtx.fillStyle = "rgba(255,255,255,0.96)";
        lines.forEach((line, index) => {
            targetCtx.fillText(line, x + padding, y + padding + (index + 1) * lineHeight - 4);
        });
        targetCtx.restore();
    }

    function legendEntries() {
        const entries = [{ label: "Tick", color: constants.FIXED_MARK_META.axis.color }];
        getTreatmentIds().forEach((id) => {
            entries.push({ label: getSeriesLabel(id), color: getMarkMeta(makeTool("series-top", id)).color });
        });
        entries.push({ label: getSeriesLabel("control"), color: getMarkMeta(makeTool("series-top", "control")).color });
        entries.push({ label: constants.FIXED_MARK_META.baseline.label, color: constants.FIXED_MARK_META.baseline.color });
        return entries;
    }

    function drawLegendBox(targetCtx, viewport) {
        const fontSize = Math.max(12, viewport.scale * 0.34);
        const padding = 12;
        const rowHeight = Math.max(18, viewport.scale * 0.62);
        const swatchSize = Math.max(10, viewport.scale * 0.3);
        const gap = 10;
        const entries = legendEntries();
        const cacheKey = JSON.stringify({
            fontSize,
            labels: entries.map((entry) => entry.label)
        });
        if (uiState.legendMetricsKey !== cacheKey) {
            targetCtx.save();
            targetCtx.font = `${fontSize}px 'JetBrains Mono', monospace`;
            uiState.legendMetrics = {
                width: Math.max(...entries.map((entry) => targetCtx.measureText(entry.label).width)) + padding * 2 + swatchSize + gap
            };
            uiState.legendMetricsKey = cacheKey;
            targetCtx.restore();
        }
        targetCtx.save();
        targetCtx.font = `${fontSize}px 'JetBrains Mono', monospace`;
        const width = uiState.legendMetrics ? uiState.legendMetrics.width : (padding * 2 + swatchSize + gap);
        const height = entries.length * rowHeight + padding * 2;
        const x = Math.max(12, targetCtx.canvas.width - width - 12);
        const y = Math.max(12, targetCtx.canvas.height - height - 12);
        targetCtx.fillStyle = "rgba(15,23,42,0.86)";
        targetCtx.fillRect(x, y, width, height);
        targetCtx.strokeStyle = "rgba(148,163,184,0.25)";
        targetCtx.strokeRect(x, y, width, height);
        entries.forEach((entry, index) => {
            const rowY = y + padding + index * rowHeight + rowHeight * 0.5;
            targetCtx.fillStyle = entry.color;
            targetCtx.fillRect(x + padding, rowY - swatchSize * 0.5, swatchSize, swatchSize);
            targetCtx.strokeStyle = "rgba(255,255,255,0.92)";
            targetCtx.lineWidth = 1;
            targetCtx.strokeRect(x + padding, rowY - swatchSize * 0.5, swatchSize, swatchSize);
            targetCtx.fillStyle = "rgba(255,255,255,0.96)";
            targetCtx.fillText(entry.label, x + padding + swatchSize + gap, rowY + fontSize * 0.35 - 2);
        });
        targetCtx.restore();
    }

    function renderEmptyState() {
        dom.ctx.save();
        dom.ctx.fillStyle = "rgba(255,255,255,0.92)";
        dom.ctx.font = "600 20px 'Space Grotesk', sans-serif";
        dom.ctx.fillText("Upload an image or PDF to begin.", 26, 60);
        dom.ctx.fillStyle = "rgba(255,255,255,0.70)";
        dom.ctx.font = "14px 'JetBrains Mono', monospace";
        dom.ctx.fillText("Then set the baseline line/value, optional axis tick, control, and treatment markers.", 26, 92);
        dom.ctx.restore();
    }

    function render() {
        dom.ctx.clearRect(0, 0, dom.mainCanvas.width, dom.mainCanvas.height);
        const image = currentCanvas();
        if (!image) {
            renderEmptyState();
            return;
        }
        const viewport = currentViewport();
        const display = getDisplayCanvas(image, viewport);
        dom.ctx.imageSmoothingEnabled = true;
        dom.ctx.imageSmoothingQuality = "high";
        dom.ctx.drawImage(display.image, viewport.offsetX, viewport.offsetY, display.drawWidth, display.drawHeight);
        if (state.points.baseline) drawGuideLine(dom.ctx, viewport, state.points.baseline, "rgba(245,158,11,0.88)");
        if (state.points.axis) drawGuideLine(dom.ctx, viewport, state.points.axis, "rgba(253,224,71,0.82)");
        getSeriesIds().forEach((id) => drawVerticalMeasure(dom.ctx, viewport, id));
        drawMarker(dom.ctx, viewport, makeTool("baseline"), state.points.baseline);
        drawMarker(dom.ctx, viewport, makeTool("axis"), state.points.axis);
        getSeriesIds().forEach((id) => {
            drawMarker(dom.ctx, viewport, makeTool("series-top", id), state.seriesPoints[id].top);
            if (isSegmentMode()) {
                drawMarker(dom.ctx, viewport, makeTool("series-bottom", id), state.seriesPoints[id].bottom);
            }
        });
        drawRoiDraft(dom.ctx, viewport);
        drawOverlayBox(dom.ctx, viewport);
        drawLegendBox(dom.ctx, viewport);
    }

    GraphCompare.ui = {
        setCanvasSize,
        requestRender,
        updateUi,
        render,
        drawGuideLine,
        drawVerticalMeasure,
        drawMarker,
        drawOverlayBox,
        drawLegendBox,
        renderSeriesButtons,
        renderSegmentButtons,
        renderSeriesConfigList,
        buildOverlayLines
    };

    setCanvasSize();
    if (window.ResizeObserver) {
        uiState.resizeObserver = new ResizeObserver(() => {
            if (setCanvasSize()) requestRender();
        });
        uiState.resizeObserver.observe(dom.canvasWrap);
    } else {
        window.addEventListener("resize", () => {
            if (setCanvasSize()) requestRender();
        });
    }
})();
