(function (global) {
  "use strict";

  // ----- state.js -----
  const FIGURE_RECTIFIER_TOOL = Object.freeze({
    name: "figure-rectifier",
    version: "0.1.0"
  });
  
  const TOOL = FIGURE_RECTIFIER_TOOL;
  
  function createInitialState() {
    return {
      source: {
        type: null,
        filename: null,
        origW: 0,
        origH: 0,
        bitmap: null,
        restoredFromSession: false
      },
  
      cropOriginal: null,
      rotationDeg: 0,
  
      preWarp: {
        fullW: 0,
        fullH: 0,
        workScale: 1.0,
        canvas: null,
        ctx: null
      },
  
      warp: {
        quad: null,
        dstW: 0,
        dstH: 0,
        H: null,
        Hinv: null
      },
  
      rectified: {
        canvas: null,
        ctx: null
      },
  
      calibration: {
        enabled: false,
        xScale: "linear",
        yScale: "linear",
        invertY: true,
        x1: null,
        x2: null,
        y1: null,
        y2: null
      },
  
      ui: {
        mode: "crop",
        stage: "empty",
        workingNote: "",
        pointer: { x: 0, y: 0 },
        hasPointer: false,
        activeHandle: null
      },
  
      view: {
        scale: 1,
        tx: 0,
        ty: 0
      },
  
      drag: {
        active: false,
        kind: null,
        start: { sx: 0, sy: 0 },
        last: { sx: 0, sy: 0 },
        startRect: null,
        startPoint: null,
        which: null
      },
  
      cropBoxStage: null,
      cropAspect: null
    };
  }
  
  function resetStateInPlace(target) {
    Object.assign(target, createInitialState());
    return target;
  }
  

  // ----- calibration.js -----
  function parseNumeric(str) {
    const normalized = String(str)
      .trim()
      .replace(/,/g, "")
      .replace(/\s+/g, "")
      .replace(/\u00d7/g, "x");
    if (normalized === "") return null;
    const powerMatch = normalized.match(/^10\^([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/i);
    const coefficientPowerMatch = normalized.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:x|\*)10\^([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/i);
    const value = powerMatch
      ? Math.pow(10, Number(powerMatch[1]))
      : (coefficientPowerMatch
          ? Number(coefficientPowerMatch[1]) * Math.pow(10, Number(coefficientPowerMatch[2]))
          : Number(normalized));
    return Number.isFinite(value) ? value : null;
  }
  
  function mapAxisLinear(px, p1, v1, p2, v2) {
    if (p2 === p1) return null;
    return v1 + ((px - p1) * (v2 - v1)) / (p2 - p1);
  }
  
  function mapAxisLog10(px, p1, v1, p2, v2) {
    if (v1 <= 0 || v2 <= 0) return null;
    const u1 = Math.log10(v1);
    const u2 = Math.log10(v2);
    const u = mapAxisLinear(px, p1, u1, p2, u2);
    if (u === null) return null;
    return Math.pow(10, u);
  }
  
  function calibrationReady(state) {
    const calibration = state.calibration;
    return !!(
      calibration.enabled &&
      calibration.x1 &&
      calibration.x2 &&
      calibration.y1 &&
      calibration.y2 &&
      isFinite(calibration.x1.v) &&
      isFinite(calibration.x2.v) &&
      isFinite(calibration.y1.v) &&
      isFinite(calibration.y2.v)
    );
  }
  
  function cursorToData(state, px, py) {
    if (!calibrationReady(state) || !state.rectified.canvas) return null;
  
    const calibration = state.calibration;
  
    let xValue = null;
    if (calibration.xScale === "linear") {
      xValue = mapAxisLinear(px, calibration.x1.px, calibration.x1.v, calibration.x2.px, calibration.x2.v);
    } else {
      xValue = mapAxisLog10(px, calibration.x1.px, calibration.x1.v, calibration.x2.px, calibration.x2.v);
    }
  
    const canvasHeight = state.rectified.canvas.height;
    let pyUse = py;
    let y1Point = calibration.y1.py;
    let y2Point = calibration.y2.py;
  
    if (calibration.invertY) {
      pyUse = (canvasHeight - 1) - py;
      y1Point = (canvasHeight - 1) - calibration.y1.py;
      y2Point = (canvasHeight - 1) - calibration.y2.py;
    }
  
    let yValue = null;
    if (calibration.yScale === "linear") {
      yValue = mapAxisLinear(pyUse, y1Point, calibration.y1.v, y2Point, calibration.y2.v);
    } else {
      yValue = mapAxisLog10(pyUse, y1Point, calibration.y1.v, y2Point, calibration.y2.v);
    }
  
    if (xValue === null || yValue === null) return null;
    return { x: xValue, y: yValue };
  }
  

  // ----- export.js -----
  function computeFullResExportData(context) {
    const {
      state,
      getCropOriginalOrFull,
      computeRotatedBounds,
      warpCanvas,
      documentRef,
      alertFn
    } = context;
  
    if (
      typeof getCropOriginalOrFull !== "function" ||
      typeof computeRotatedBounds !== "function" ||
      typeof warpCanvas !== "function" ||
      !documentRef
    ) {
      return null;
    }
  
    const crop = getCropOriginalOrFull();
    if (!crop || !state?.source?.bitmap || !state?.preWarp?.canvas) {
      return null;
    }
  
    const rotationDeg = state.rotationDeg || 0;
    const rotatedBounds = computeRotatedBounds(crop.w, crop.h, rotationDeg);
  
    const preCanvas = documentRef.createElement("canvas");
    preCanvas.width = rotatedBounds.w;
    preCanvas.height = rotatedBounds.h;
    const preContext = preCanvas.getContext("2d", { willReadFrequently: true });
  
    const tempCanvas = documentRef.createElement("canvas");
    tempCanvas.width = crop.w;
    tempCanvas.height = crop.h;
    const tempContext = tempCanvas.getContext("2d");
    tempContext.imageSmoothingEnabled = true;
    tempContext.imageSmoothingQuality = "high";
    tempContext.drawImage(state.source.bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
  
    preContext.clearRect(0, 0, preCanvas.width, preCanvas.height);
    preContext.imageSmoothingEnabled = true;
    preContext.imageSmoothingQuality = "high";
    preContext.save();
    preContext.translate(preCanvas.width / 2, preCanvas.height / 2);
    preContext.rotate((rotationDeg * Math.PI) / 180);
    preContext.translate(-tempCanvas.width / 2, -tempCanvas.height / 2);
    preContext.drawImage(tempCanvas, 0, 0);
    preContext.restore();
  
    if (!state.warp.quad) {
      if (typeof alertFn === "function") {
        alertFn("No warp quad defined. Initialize corners in Warp mode first.");
      }
      return null;
    }
  
    const sx = preCanvas.width / state.preWarp.canvas.width;
    const sy = preCanvas.height / state.preWarp.canvas.height;
    const quadFull = state.warp.quad.map((point) => ({ x: point.x * sx, y: point.y * sy }));
  
    const averageScale = (sx + sy) / 2;
    const dstWidthFull = Math.max(8, Math.round(state.warp.dstW * averageScale));
    const dstHeightFull = Math.max(8, Math.round(state.warp.dstH * averageScale));
  
    const fullResult = warpCanvas(preCanvas, quadFull, dstWidthFull, dstHeightFull);
    if (!fullResult) {
      if (typeof alertFn === "function") {
        alertFn("Full-res warp failed. Adjust corners and try again.");
      }
      return null;
    }
  
    return {
      fullResult,
      quadFull,
      dstWidthFull,
      dstHeightFull
    };
  }
  
  function applyFullResExportData(jsonObject, state, fullResExportData) {
    if (!jsonObject || !fullResExportData) {
      return jsonObject;
    }
  
    const { fullResult, quadFull, dstWidthFull, dstHeightFull } = fullResExportData;
  
    jsonObject.warp = {
      srcQuad: quadFull,
      dstRect: { w: dstWidthFull, h: dstHeightFull },
      H: fullResult.H,
      Hinv: fullResult.Hinv
    };
  
    if (jsonObject.calibration && state.rectified.canvas && fullResult.canvas) {
      const rx = fullResult.canvas.width / state.rectified.canvas.width;
      const ry = fullResult.canvas.height / state.rectified.canvas.height;
  
      if (jsonObject.calibration.x) {
        jsonObject.calibration.x.p1.px *= rx;
        jsonObject.calibration.x.p1.py *= ry;
        jsonObject.calibration.x.p2.px *= rx;
        jsonObject.calibration.x.p2.py *= ry;
      }
      if (jsonObject.calibration.y) {
        jsonObject.calibration.y.p1.px *= rx;
        jsonObject.calibration.y.p1.py *= ry;
        jsonObject.calibration.y.p2.px *= rx;
        jsonObject.calibration.y.p2.py *= ry;
      }
    }
  
    jsonObject.notes.exportedAtFullResolution = true;
    return jsonObject;
  }
  
  function buildExportFilename(stem, suffix) {
    return `${stem}${suffix}`;
  }
  
  function buildExportJson(context) {
    const {
      state,
      tool,
      getCropOriginalOrFull,
      nowIso,
      deepCopy,
      fullRes = false,
      computeRotatedBounds = null,
      warpCanvas = null,
      documentRef = null,
      alertFn = null,
      fullResExportData = null
    } = context;
  
    const crop = getCropOriginalOrFull();
    const rotationDeg = state.rotationDeg || 0;
  
    const json = {
      tool: { name: tool.name, version: tool.version },
      createdAt: nowIso(),
      source: {
        type: state.source.type,
        filename: state.source.filename || null,
        original: { w: state.source.origW, h: state.source.origH }
      },
      crop: crop ? { ...crop } : null,
      rotation: { degrees: rotationDeg },
      warp: null,
      calibration: null,
      notes: {
        preWarpWorkingScale: state.preWarp.workScale,
        exportedAtFullResolution: false
      }
    };
  
    if (state.warp.quad && state.warp.dstW && state.warp.dstH) {
      json.warp = {
        srcQuad: deepCopy(state.warp.quad),
        dstRect: { w: state.warp.dstW, h: state.warp.dstH },
        H: state.warp.H,
        Hinv: state.warp.Hinv
      };
    }
  
    if (state.calibration.enabled) {
      const calibration = state.calibration;
      json.calibration = {
        x: calibration.x1 && calibration.x2 ? {
          p1: { px: calibration.x1.px, py: calibration.x1.py, v: calibration.x1.v },
          p2: { px: calibration.x2.px, py: calibration.x2.py, v: calibration.x2.v },
          scale: calibration.xScale
        } : null,
        y: calibration.y1 && calibration.y2 ? {
          p1: { px: calibration.y1.px, py: calibration.y1.py, v: calibration.y1.v },
          p2: { px: calibration.y2.px, py: calibration.y2.py, v: calibration.y2.v },
          scale: calibration.yScale,
          invertY: calibration.invertY
        } : null
      };
    }
  
    if (fullRes) {
      const resolvedFullResExportData = fullResExportData || computeFullResExportData({
        state,
        getCropOriginalOrFull,
        computeRotatedBounds,
        warpCanvas,
        documentRef,
        alertFn
      });
  
      if (!resolvedFullResExportData) {
        return null;
      }
  
      applyFullResExportData(json, state, resolvedFullResExportData);
    }
  
    return json;
  }
  
  async function exportPngAndJson(context) {
    const {
      bundle = false,
      state,
      tool,
      fullResExportChecked,
      getCropOriginalOrFull,
      nowIso,
      deepCopy,
      canvasToBlob,
      downloadBlob,
      blobToDataUrl,
      computeRotatedBounds,
      warpCanvas,
      documentRef,
      alertFn,
      augmentJson,
      filenameStem = "figure_rectified"
    } = context;
  
    if (!state.rectified.canvas) return;
  
    const doFullResExport = !!fullResExportChecked;
  
    if (!doFullResExport) {
      const pngBlob = await canvasToBlob(state.rectified.canvas, "image/png");
      const jsonObject = buildExportJson({
        state,
        tool,
        getCropOriginalOrFull,
        nowIso,
        deepCopy,
        fullRes: false
      });
      const finalJsonObject = typeof augmentJson === "function"
        ? augmentJson(jsonObject, { fullRes: false, fullResExportData: null })
        : jsonObject;
      const jsonBlob = new Blob([JSON.stringify(finalJsonObject, null, 2)], { type: "application/json" });
  
      if (!bundle) {
        downloadBlob(buildExportFilename(filenameStem, ".png"), pngBlob);
        downloadBlob(buildExportFilename(filenameStem, "_transform.json"), jsonBlob);
        return;
      }
  
      const dataUrl = await blobToDataUrl(pngBlob);
      const bundleObject = { ...finalJsonObject, rectifiedPngBase64: dataUrl };
      const bundleBlob = new Blob([JSON.stringify(bundleObject, null, 2)], { type: "application/json" });
      downloadBlob(buildExportFilename(filenameStem, "_bundle.json"), bundleBlob);
      return;
    }
  
    const fullResExportData = computeFullResExportData({
      state,
      getCropOriginalOrFull,
      computeRotatedBounds,
      warpCanvas,
      documentRef,
      alertFn
    });
    if (!fullResExportData) {
      return;
    }
  
    const pngBlob = await canvasToBlob(fullResExportData.fullResult.canvas, "image/png");
    const jsonObject = buildExportJson({
      state,
      tool,
      getCropOriginalOrFull,
      nowIso,
      deepCopy,
      fullRes: true,
      fullResExportData
    });
  
    const finalJsonObject = typeof augmentJson === "function"
      ? augmentJson(jsonObject, { fullRes: true, fullResExportData })
      : jsonObject;
    const jsonBlob = new Blob([JSON.stringify(finalJsonObject, null, 2)], { type: "application/json" });
  
    if (!bundle) {
      downloadBlob(buildExportFilename(filenameStem, ".png"), pngBlob);
      downloadBlob(buildExportFilename(filenameStem, "_transform.json"), jsonBlob);
      return;
    }
  
    const dataUrl = await blobToDataUrl(pngBlob);
    const bundleObject = { ...finalJsonObject, rectifiedPngBase64: dataUrl };
    const bundleBlob = new Blob([JSON.stringify(bundleObject, null, 2)], { type: "application/json" });
    downloadBlob(buildExportFilename(filenameStem, "_bundle.json"), bundleBlob);
  }
  

  // ----- sessions.js -----
  const SESSION_SCHEMA = "scientific-graph-digitizer-session";
  const SESSION_VERSION = 1;
  const VALID_MARKS = new Set(["baseline", "control", "a", "b"]);
  const VALID_WORKFLOWS = new Set(["compare_ab", "grouped_bars", "stacked_bars"]);
  
  function clonePoint(point) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return { x: point.x, y: point.y };
  }
  
  function cloneCalibrationAnchor(anchor) {
    if (!anchor) return null;
    if (!Number.isFinite(anchor.px) || !Number.isFinite(anchor.py) || !Number.isFinite(anchor.v)) return null;
    return { px: anchor.px, py: anchor.py, v: anchor.v };
  }
  
  function normalizeLabel(label, fallback) {
    const normalized = String(label || "").trim();
    return normalized || fallback;
  }
  
  function cloneListPointEntries(entries, prefix, fallbackCount = 3) {
    const source = Array.isArray(entries) && entries.length > 0 ? entries : Array.from({ length: fallbackCount }, () => ({}));
    return source.slice(0, 8).map((entry, index) => ({
      key: typeof entry?.key === "string" && entry.key ? entry.key : `${prefix}_${index + 1}`,
      label: normalizeLabel(entry?.label, `${prefix === "bar" ? "Bar" : "Segment"} ${index + 1}`),
      point: clonePoint(entry?.point)
    }));
  }
  
  function cloneCompareMeasurement(measurement) {
    const marks = measurement?.marks || {};
    return {
      workflow: "compare_ab",
      mode: "compare_ab",
      activeMark: VALID_MARKS.has(measurement?.activeMark) ? measurement.activeMark : null,
      marks: {
        baseline: clonePoint(marks.baseline),
        control: clonePoint(marks.control),
        a: clonePoint(marks.a),
        b: clonePoint(marks.b)
      }
    };
  }
  
  function cloneGroupedMeasurement(measurement) {
    const bars = cloneListPointEntries(measurement?.bars, "bar");
    const validKeys = new Set(bars.map((entry) => entry.key));
    const activeTarget = measurement?.activeTarget;
  
    return {
      workflow: "grouped_bars",
      mode: "grouped_bars",
      baseline: clonePoint(measurement?.baseline),
      activeTarget: activeTarget === "baseline" || validKeys.has(activeTarget) ? activeTarget : "baseline",
      referenceKey: validKeys.has(measurement?.referenceKey) ? measurement.referenceKey : (bars[0]?.key || null),
      bars
    };
  }
  
  function cloneStackedMeasurement(measurement) {
    const segments = cloneListPointEntries(measurement?.segments, "segment");
    const validKeys = new Set(segments.map((entry) => entry.key));
    const activeTarget = measurement?.activeTarget;
  
    return {
      workflow: "stacked_bars",
      mode: "stacked_bars",
      baseline: clonePoint(measurement?.baseline),
      activeTarget: activeTarget === "baseline" || validKeys.has(activeTarget) ? activeTarget : "baseline",
      segments
    };
  }
  
  function cloneMeasurement(measurement) {
    const workflow = VALID_WORKFLOWS.has(measurement?.workflow)
      ? measurement.workflow
      : (VALID_WORKFLOWS.has(measurement?.mode) ? measurement.mode : "compare_ab");
  
    if (workflow === "grouped_bars") {
      return cloneGroupedMeasurement(measurement);
    }
  
    if (workflow === "stacked_bars") {
      return cloneStackedMeasurement(measurement);
    }
  
    return cloneCompareMeasurement(measurement);
  }
  
  function buildSessionPayload(context) {
    const {
      tool,
      nowIso,
      source,
      pipeline,
      measurement,
      ui
    } = context;
  
    return {
      schema: SESSION_SCHEMA,
      version: SESSION_VERSION,
      savedAt: nowIso(),
      tool: {
        name: tool.name,
        version: tool.version
      },
      source: {
        type: source.type || null,
        filename: source.filename || null,
        original: {
          w: source.original?.w || 0,
          h: source.original?.h || 0
        },
        imageDataUrl: source.imageDataUrl || null
      },
      pipeline: {
        cropOriginal: pipeline.cropOriginal || null,
        cropBoxStage: pipeline.cropBoxStage || null,
        rotationDeg: Number.isFinite(pipeline.rotationDeg) ? pipeline.rotationDeg : 0,
        warp: {
          quad: pipeline.warp?.quad || null,
          dstW: pipeline.warp?.dstW || 0,
          dstH: pipeline.warp?.dstH || 0
        },
        calibration: {
          enabled: !!pipeline.calibration?.enabled,
          xScale: pipeline.calibration?.xScale || "linear",
          yScale: pipeline.calibration?.yScale || "linear",
          invertY: pipeline.calibration?.invertY !== false,
          x1: cloneCalibrationAnchor(pipeline.calibration?.x1),
          x2: cloneCalibrationAnchor(pipeline.calibration?.x2),
          y1: cloneCalibrationAnchor(pipeline.calibration?.y1),
          y2: cloneCalibrationAnchor(pipeline.calibration?.y2)
        }
      },
      measurement: cloneMeasurement(measurement),
      ui: {
        mode: ui.mode || "crop",
        showGrid: !!ui.showGrid,
        showPip: !!ui.showPip,
        fullResExport: !!ui.fullResExport
      },
      view: {
        scale: Number.isFinite(ui.view?.scale) ? ui.view.scale : 1,
        tx: Number.isFinite(ui.view?.tx) ? ui.view.tx : 0,
        ty: Number.isFinite(ui.view?.ty) ? ui.view.ty : 0
      }
    };
  }
  
  function parseSessionPayload(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Session file is not a valid object.");
    }
  
    if (raw.schema !== SESSION_SCHEMA) {
      throw new Error("Session schema is not supported.");
    }
  
    if (raw.version !== SESSION_VERSION) {
      throw new Error(`Session version ${raw.version} is not supported.`);
    }
  
    return {
      schema: raw.schema,
      version: raw.version,
      savedAt: raw.savedAt || null,
      tool: {
        name: raw.tool?.name || null,
        version: raw.tool?.version || null
      },
      source: {
        type: raw.source?.type || null,
        filename: raw.source?.filename || null,
        original: {
          w: raw.source?.original?.w || 0,
          h: raw.source?.original?.h || 0
        },
        imageDataUrl: raw.source?.imageDataUrl || null
      },
      pipeline: {
        cropOriginal: raw.pipeline?.cropOriginal || null,
        cropBoxStage: raw.pipeline?.cropBoxStage || null,
        rotationDeg: Number.isFinite(raw.pipeline?.rotationDeg) ? raw.pipeline.rotationDeg : 0,
        warp: {
          quad: raw.pipeline?.warp?.quad || null,
          dstW: raw.pipeline?.warp?.dstW || 0,
          dstH: raw.pipeline?.warp?.dstH || 0
        },
        calibration: {
          enabled: !!raw.pipeline?.calibration?.enabled,
          xScale: raw.pipeline?.calibration?.xScale || "linear",
          yScale: raw.pipeline?.calibration?.yScale || "linear",
          invertY: raw.pipeline?.calibration?.invertY !== false,
          x1: cloneCalibrationAnchor(raw.pipeline?.calibration?.x1),
          x2: cloneCalibrationAnchor(raw.pipeline?.calibration?.x2),
          y1: cloneCalibrationAnchor(raw.pipeline?.calibration?.y1),
          y2: cloneCalibrationAnchor(raw.pipeline?.calibration?.y2)
        }
      },
      measurement: cloneMeasurement(raw.measurement),
      ui: {
        mode: raw.ui?.mode || "crop",
        showGrid: !!raw.ui?.showGrid,
        showPip: !!raw.ui?.showPip,
        fullResExport: !!raw.ui?.fullResExport
      },
      view: {
        scale: Number.isFinite(raw.view?.scale) ? raw.view.scale : 1,
        tx: Number.isFinite(raw.view?.tx) ? raw.view.tx : 0,
        ty: Number.isFinite(raw.view?.ty) ? raw.view.ty : 0
      }
    };
  }
  

  // ----- measure-compare.js -----
  const COMPARE_AB_MARK_ORDER = Object.freeze(["baseline", "control", "a", "b"]);
  
  const COMPARE_AB_MARK_META = Object.freeze({
    baseline: Object.freeze({ key: "baseline", label: "Baseline", shortLabel: "Base", color: "#f59e0b" }),
    control: Object.freeze({ key: "control", label: "Control", shortLabel: "Ctrl", color: "#38bdf8" }),
    a: Object.freeze({ key: "a", label: "A", shortLabel: "A", color: "#34d399" }),
    b: Object.freeze({ key: "b", label: "B", shortLabel: "B", color: "#f472b6" })
  });
  
  function createCompareABState() {
    return {
      mode: "compare_ab",
      activeMark: "baseline",
      marks: {
        baseline: null,
        control: null,
        a: null,
        b: null
      }
    };
  }
  
  function clearCompareABMarks(state) {
    state.activeMark = "baseline";
    for (const key of COMPARE_AB_MARK_ORDER) {
      state.marks[key] = null;
    }
    return state;
  }
  
  function setCompareABActiveMark(state, key) {
    state.activeMark = COMPARE_AB_MARK_META[key] ? key : null;
    return state.activeMark;
  }
  
  function countCompareABMarks(state) {
    let count = 0;
    for (const key of COMPARE_AB_MARK_ORDER) {
      const point = state.marks[key];
      if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
        count += 1;
      }
    }
    return count;
  }
  
  function nextCompareABMark(state, fromKey = null) {
    const startIndex = fromKey ? COMPARE_AB_MARK_ORDER.indexOf(fromKey) : -1;
    for (let i = startIndex + 1; i < COMPARE_AB_MARK_ORDER.length; i += 1) {
      const key = COMPARE_AB_MARK_ORDER[i];
      if (!state.marks[key]) return key;
    }
    for (const key of COMPARE_AB_MARK_ORDER) {
      if (!state.marks[key]) return key;
    }
    return null;
  }
  
  function setCompareABMark(state, key, point) {
    if (!COMPARE_AB_MARK_META[key]) {
      return { nextKey: state.activeMark, point: null };
    }
  
    state.marks[key] = { x: point.x, y: point.y };
    const nextKey = nextCompareABMark(state, key);
    state.activeMark = nextKey;
    return { nextKey, point: state.marks[key] };
  }
  
  function compareABReady(state) {
    return COMPARE_AB_MARK_ORDER.every((key) => {
      const point = state.marks[key];
      return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
    });
  }
  
  function deltaPercent(value, reference) {
    if (!Number.isFinite(value) || !Number.isFinite(reference) || reference === 0) return null;
    return ((value - reference) / reference) * 100;
  }
  
  function calibrationHeight(dataAt, baseline, mark) {
    if (typeof dataAt !== "function") return null;
    const baselineData = dataAt(baseline.x, baseline.y);
    const markData = dataAt(mark.x, mark.y);
    if (!baselineData || !markData) return null;
    if (!Number.isFinite(baselineData.y) || !Number.isFinite(markData.y)) return null;
  
    return {
      baselineY: baselineData.y,
      topY: markData.y,
      height: markData.y - baselineData.y
    };
  }
  
  function computeCompareABResults(state, options = {}) {
    if (!compareABReady(state)) return null;
  
    const { dataAt = null } = options;
    const { baseline, control, a, b } = state.marks;
  
    const rawPx = {
      controlHeightPx: baseline.y - control.y,
      aHeightPx: baseline.y - a.y,
      bHeightPx: baseline.y - b.y
    };
  
    const calibrated = {
      control: calibrationHeight(dataAt, baseline, control),
      a: calibrationHeight(dataAt, baseline, a),
      b: calibrationHeight(dataAt, baseline, b)
    };
  
    const calibratedReady = !!(calibrated.control && calibrated.a && calibrated.b);
  
    return {
      mode: "compare_ab",
      marks: {
        baseline: { ...baseline },
        control: { ...control },
        a: { ...a },
        b: { ...b }
      },
      rawPx,
      calibrated: calibratedReady ? calibrated : null,
      comparisons: {
        aVsControlPct: deltaPercent(rawPx.aHeightPx, rawPx.controlHeightPx),
        bVsControlPct: deltaPercent(rawPx.bHeightPx, rawPx.controlHeightPx),
        aVsBPct: deltaPercent(rawPx.aHeightPx, rawPx.bHeightPx),
        calibratedAVsControlPct: calibratedReady ? deltaPercent(calibrated.a.height, calibrated.control.height) : null,
        calibratedBVsControlPct: calibratedReady ? deltaPercent(calibrated.b.height, calibrated.control.height) : null
      }
    };
  }
  
  function csvEscape(value) {
    const stringValue = value == null ? "" : String(value);
    if (!/[",\n]/.test(stringValue)) return stringValue;
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  
  function numericOrBlank(value, digits = 6) {
    return Number.isFinite(value) ? Number(value).toFixed(digits) : "";
  }
  
  function buildCompareABCsv(result) {
    if (!result) return "";
  
    const headers = [
      "baseline_x_px",
      "baseline_y_px",
      "control_x_px",
      "control_y_px",
      "a_x_px",
      "a_y_px",
      "b_x_px",
      "b_y_px",
      "control_height_px",
      "a_height_px",
      "b_height_px",
      "a_vs_control_pct",
      "b_vs_control_pct",
      "control_height_calibrated",
      "a_height_calibrated",
      "b_height_calibrated",
      "a_vs_control_calibrated_pct",
      "b_vs_control_calibrated_pct"
    ];
  
    const row = [
      result.marks.baseline.x,
      result.marks.baseline.y,
      result.marks.control.x,
      result.marks.control.y,
      result.marks.a.x,
      result.marks.a.y,
      result.marks.b.x,
      result.marks.b.y,
      numericOrBlank(result.rawPx.controlHeightPx),
      numericOrBlank(result.rawPx.aHeightPx),
      numericOrBlank(result.rawPx.bHeightPx),
      numericOrBlank(result.comparisons.aVsControlPct),
      numericOrBlank(result.comparisons.bVsControlPct),
      numericOrBlank(result.calibrated?.control?.height),
      numericOrBlank(result.calibrated?.a?.height),
      numericOrBlank(result.calibrated?.b?.height),
      numericOrBlank(result.comparisons.calibratedAVsControlPct),
      numericOrBlank(result.comparisons.calibratedBVsControlPct)
    ];
  
    return `${headers.map(csvEscape).join(",")}\n${row.map(csvEscape).join(",")}\n`;
  }
  

  // ----- measure-bars.js -----
  function clampCount(count, min = 1, max = 8) {
    const normalized = Number.parseInt(count, 10);
    if (!Number.isFinite(normalized)) return min;
    return Math.max(min, Math.min(max, normalized));
  }
  
  function buildBar(index, previous = null) {
    return {
      key: `bar_${index + 1}`,
      label: previous?.label || `Bar ${index + 1}`,
      point: previous?.point ? { x: previous.point.x, y: previous.point.y } : null
    };
  }
  
  function buildSegment(index, previous = null) {
    return {
      key: `segment_${index + 1}`,
      label: previous?.label || `Segment ${index + 1}`,
      point: previous?.point ? { x: previous.point.x, y: previous.point.y } : null
    };
  }
  
  function deltaPercent(value, reference) {
    if (!Number.isFinite(value) || !Number.isFinite(reference) || reference === 0) return null;
    return ((value - reference) / reference) * 100;
  }
  
  function calibratedHeight(dataAt, lowerPoint, upperPoint) {
    if (typeof dataAt !== "function") return null;
    const lowerData = dataAt(lowerPoint.x, lowerPoint.y);
    const upperData = dataAt(upperPoint.x, upperPoint.y);
    if (!lowerData || !upperData) return null;
    if (!Number.isFinite(lowerData.y) || !Number.isFinite(upperData.y)) return null;
  
    return {
      lowerY: lowerData.y,
      upperY: upperData.y,
      height: upperData.y - lowerData.y
    };
  }
  
  function csvEscape(value) {
    const stringValue = value == null ? "" : String(value);
    if (!/[",\n]/.test(stringValue)) return stringValue;
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  
  function numericOrBlank(value, digits = 6) {
    return Number.isFinite(value) ? Number(value).toFixed(digits) : "";
  }
  
  function createGroupedBarsState(count = 3) {
    const safeCount = clampCount(count);
    const bars = Array.from({ length: safeCount }, (_, index) => buildBar(index));
    return {
      mode: "grouped_bars",
      baseline: null,
      bars,
      activeTarget: "baseline",
      referenceKey: bars[0]?.key || null
    };
  }
  
  function setGroupedBarCount(state, count) {
    const safeCount = clampCount(count);
    const nextBars = Array.from({ length: safeCount }, (_, index) => buildBar(index, state.bars[index]));
    state.bars = nextBars;
  
    if (!nextBars.some((bar) => bar.key === state.referenceKey)) {
      state.referenceKey = nextBars[0]?.key || null;
    }
  
    if (state.activeTarget !== "baseline" && !nextBars.some((bar) => bar.key === state.activeTarget)) {
      state.activeTarget = nextGroupedBarsTarget(state);
    }
  
    return state.bars.length;
  }
  
  function setGroupedBarLabel(state, key, label) {
    const bar = state.bars.find((entry) => entry.key === key);
    if (!bar) return;
    const normalized = String(label || "").trim();
    const index = state.bars.indexOf(bar);
    bar.label = normalized || `Bar ${index + 1}`;
  }
  
  function setGroupedBarsReference(state, key) {
    if (state.bars.some((entry) => entry.key === key)) {
      state.referenceKey = key;
    }
  }
  
  function clearGroupedBars(state) {
    state.baseline = null;
    state.activeTarget = "baseline";
    state.bars = state.bars.map((entry, index) => buildBar(index, { ...entry, point: null }));
  }
  
  function setGroupedBarsActiveTarget(state, target) {
    if (target === "baseline" || state.bars.some((entry) => entry.key === target)) {
      state.activeTarget = target;
    }
    return state.activeTarget;
  }
  
  function nextGroupedBarsTarget(state, fromTarget = null) {
    if (!state.baseline) return "baseline";
  
    const targets = ["baseline", ...state.bars.map((entry) => entry.key)];
    const startIndex = fromTarget ? targets.indexOf(fromTarget) : -1;
  
    for (let i = startIndex + 1; i < targets.length; i += 1) {
      const target = targets[i];
      if (target === "baseline") {
        if (!state.baseline) return "baseline";
        continue;
      }
      const bar = state.bars.find((entry) => entry.key === target);
      if (bar && !bar.point) return bar.key;
    }
  
    for (const bar of state.bars) {
      if (!bar.point) return bar.key;
    }
  
    return null;
  }
  
  function setGroupedBarsMark(state, target, point) {
    if (target === "baseline") {
      state.baseline = { x: point.x, y: point.y };
      state.activeTarget = nextGroupedBarsTarget(state, target);
      return { nextTarget: state.activeTarget };
    }
  
    const bar = state.bars.find((entry) => entry.key === target);
    if (!bar) return { nextTarget: state.activeTarget };
  
    bar.point = { x: point.x, y: point.y };
    state.activeTarget = nextGroupedBarsTarget(state, target);
    return { nextTarget: state.activeTarget };
  }
  
  function groupedBarsReady(state) {
    return !!state.baseline && state.bars.length > 0 && state.bars.every((entry) => !!entry.point);
  }
  
  function countGroupedBarsPlaced(state) {
    const baselineCount = state.baseline ? 1 : 0;
    const barCount = state.bars.filter((entry) => !!entry.point).length;
    return baselineCount + barCount;
  }
  
  function groupedBarsTargetCount(state) {
    return 1 + state.bars.length;
  }
  
  function computeGroupedBarsResults(state, options = {}) {
    if (!groupedBarsReady(state)) return null;
  
    const { dataAt = null } = options;
    const referenceBar = state.bars.find((entry) => entry.key === state.referenceKey) || state.bars[0];
    const baseline = state.baseline;
  
    const bars = state.bars.map((entry) => {
      const rawHeightPx = baseline.y - entry.point.y;
      const calibrated = calibratedHeight(dataAt, baseline, entry.point);
      return {
        key: entry.key,
        label: entry.label,
        point: { ...entry.point },
        rawHeightPx,
        calibratedHeight: calibrated ? calibrated.height : null,
        calibrated
      };
    });
  
    const reference = bars.find((entry) => entry.key === referenceBar.key) || bars[0];
    for (const entry of bars) {
      entry.vsReferencePct = deltaPercent(entry.rawHeightPx, reference.rawHeightPx);
      entry.calibratedVsReferencePct = deltaPercent(entry.calibratedHeight, reference.calibratedHeight);
    }
  
    return {
      mode: "grouped_bars",
      baseline: { ...baseline },
      referenceKey: reference.key,
      bars
    };
  }
  
  function buildGroupedBarsCsv(result) {
    if (!result) return "";
  
    const headers = [
      "key",
      "label",
      "x_px",
      "y_px",
      "height_px",
      "height_calibrated",
      "vs_reference_pct",
      "vs_reference_calibrated_pct"
    ];
  
    const rows = result.bars.map((entry) => [
      entry.key,
      entry.label,
      entry.point.x,
      entry.point.y,
      numericOrBlank(entry.rawHeightPx),
      numericOrBlank(entry.calibratedHeight),
      numericOrBlank(entry.vsReferencePct),
      numericOrBlank(entry.calibratedVsReferencePct)
    ]);
  
    return [
      headers.map(csvEscape).join(","),
      ...rows.map((row) => row.map(csvEscape).join(","))
    ].join("\n") + "\n";
  }
  
  function createStackedBarsState(count = 3) {
    const safeCount = clampCount(count);
    const segments = Array.from({ length: safeCount }, (_, index) => buildSegment(index));
    return {
      mode: "stacked_bars",
      baseline: null,
      segments,
      activeTarget: "baseline"
    };
  }
  
  function setStackedSegmentCount(state, count) {
    const safeCount = clampCount(count);
    const nextSegments = Array.from({ length: safeCount }, (_, index) => buildSegment(index, state.segments[index]));
    state.segments = nextSegments;
  
    if (state.activeTarget !== "baseline" && !nextSegments.some((entry) => entry.key === state.activeTarget)) {
      state.activeTarget = nextStackedBarsTarget(state);
    }
  
    return state.segments.length;
  }
  
  function setStackedSegmentLabel(state, key, label) {
    const segment = state.segments.find((entry) => entry.key === key);
    if (!segment) return;
    const normalized = String(label || "").trim();
    const index = state.segments.indexOf(segment);
    segment.label = normalized || `Segment ${index + 1}`;
  }
  
  function clearStackedBars(state) {
    state.baseline = null;
    state.activeTarget = "baseline";
    state.segments = state.segments.map((entry, index) => buildSegment(index, { ...entry, point: null }));
  }
  
  function setStackedBarsActiveTarget(state, target) {
    if (target === "baseline" || state.segments.some((entry) => entry.key === target)) {
      state.activeTarget = target;
    }
    return state.activeTarget;
  }
  
  function nextStackedBarsTarget(state, fromTarget = null) {
    if (!state.baseline) return "baseline";
  
    const targets = ["baseline", ...state.segments.map((entry) => entry.key)];
    const startIndex = fromTarget ? targets.indexOf(fromTarget) : -1;
  
    for (let i = startIndex + 1; i < targets.length; i += 1) {
      const target = targets[i];
      if (target === "baseline") {
        if (!state.baseline) return "baseline";
        continue;
      }
      const segment = state.segments.find((entry) => entry.key === target);
      if (segment && !segment.point) return segment.key;
    }
  
    for (const segment of state.segments) {
      if (!segment.point) return segment.key;
    }
  
    return null;
  }
  
  function setStackedBarsMark(state, target, point) {
    if (target === "baseline") {
      state.baseline = { x: point.x, y: point.y };
      state.activeTarget = nextStackedBarsTarget(state, target);
      return { nextTarget: state.activeTarget };
    }
  
    const segment = state.segments.find((entry) => entry.key === target);
    if (!segment) return { nextTarget: state.activeTarget };
  
    segment.point = { x: point.x, y: point.y };
    state.activeTarget = nextStackedBarsTarget(state, target);
    return { nextTarget: state.activeTarget };
  }
  
  function stackedBarsReady(state) {
    return !!state.baseline && state.segments.length > 0 && state.segments.every((entry) => !!entry.point);
  }
  
  function countStackedBarsPlaced(state) {
    const baselineCount = state.baseline ? 1 : 0;
    const segmentCount = state.segments.filter((entry) => !!entry.point).length;
    return baselineCount + segmentCount;
  }
  
  function stackedBarsTargetCount(state) {
    return 1 + state.segments.length;
  }
  
  function computeStackedBarsResults(state, options = {}) {
    if (!stackedBarsReady(state)) return null;
  
    const { dataAt = null } = options;
    const baseline = state.baseline;
    const segments = [];
  
    for (let index = 0; index < state.segments.length; index += 1) {
      const current = state.segments[index];
      const lowerPoint = index === 0 ? baseline : state.segments[index - 1].point;
      const rawHeightPx = lowerPoint.y - current.point.y;
      const calibrated = calibratedHeight(dataAt, lowerPoint, current.point);
  
      segments.push({
        key: current.key,
        label: current.label,
        point: { ...current.point },
        rawHeightPx,
        calibratedHeight: calibrated ? calibrated.height : null,
        calibrated
      });
    }
  
    const totalHeightPx = baseline.y - state.segments[state.segments.length - 1].point.y;
    const totalCalibratedHeight = segments.every((entry) => Number.isFinite(entry.calibratedHeight))
      ? segments.reduce((sum, entry) => sum + entry.calibratedHeight, 0)
      : null;
  
    for (const entry of segments) {
      entry.percentOfTotalPx = totalHeightPx !== 0 ? (entry.rawHeightPx / totalHeightPx) * 100 : null;
      entry.percentOfTotalCalibrated = Number.isFinite(totalCalibratedHeight) && totalCalibratedHeight !== 0
        ? (entry.calibratedHeight / totalCalibratedHeight) * 100
        : null;
    }
  
    return {
      mode: "stacked_bars",
      baseline: { ...baseline },
      totalHeightPx,
      totalCalibratedHeight,
      segments
    };
  }
  
  function buildStackedBarsCsv(result) {
    if (!result) return "";
  
    const headers = [
      "key",
      "label",
      "x_px",
      "y_px",
      "segment_height_px",
      "segment_height_calibrated",
      "segment_pct_of_total_px",
      "segment_pct_of_total_calibrated",
      "total_height_px",
      "total_height_calibrated"
    ];
  
    const rows = result.segments.map((entry) => [
      entry.key,
      entry.label,
      entry.point.x,
      entry.point.y,
      numericOrBlank(entry.rawHeightPx),
      numericOrBlank(entry.calibratedHeight),
      numericOrBlank(entry.percentOfTotalPx),
      numericOrBlank(entry.percentOfTotalCalibrated),
      numericOrBlank(result.totalHeightPx),
      numericOrBlank(result.totalCalibratedHeight)
    ]);
  
    return [
      headers.map(csvEscape).join(","),
      ...rows.map((row) => row.map(csvEscape).join(","))
    ].join("\n") + "\n";
  }
  

  global.ScientificGraphDigitizerCore = Object.freeze({
    FIGURE_RECTIFIER_TOOL: FIGURE_RECTIFIER_TOOL,
    TOOL: TOOL,
    createInitialState: createInitialState,
    resetStateInPlace: resetStateInPlace,
    parseNumeric: parseNumeric,
    mapAxisLinear: mapAxisLinear,
    mapAxisLog10: mapAxisLog10,
    calibrationReady: calibrationReady,
    cursorToData: cursorToData,
    computeFullResExportData: computeFullResExportData,
    buildExportJson: buildExportJson,
    exportPngAndJson: exportPngAndJson,
    SESSION_SCHEMA: SESSION_SCHEMA,
    SESSION_VERSION: SESSION_VERSION,
    buildSessionPayload: buildSessionPayload,
    parseSessionPayload: parseSessionPayload,
    COMPARE_AB_MARK_ORDER: COMPARE_AB_MARK_ORDER,
    COMPARE_AB_MARK_META: COMPARE_AB_MARK_META,
    buildCompareABCsv: buildCompareABCsv,
    clearCompareABMarks: clearCompareABMarks,
    compareABReady: compareABReady,
    computeCompareABResults: computeCompareABResults,
    countCompareABMarks: countCompareABMarks,
    createCompareABState: createCompareABState,
    nextCompareABMark: nextCompareABMark,
    setCompareABActiveMark: setCompareABActiveMark,
    setCompareABMark: setCompareABMark,
    buildGroupedBarsCsv: buildGroupedBarsCsv,
    buildStackedBarsCsv: buildStackedBarsCsv,
    clearGroupedBars: clearGroupedBars,
    clearStackedBars: clearStackedBars,
    computeGroupedBarsResults: computeGroupedBarsResults,
    computeStackedBarsResults: computeStackedBarsResults,
    countGroupedBarsPlaced: countGroupedBarsPlaced,
    countStackedBarsPlaced: countStackedBarsPlaced,
    createGroupedBarsState: createGroupedBarsState,
    createStackedBarsState: createStackedBarsState,
    groupedBarsReady: groupedBarsReady,
    groupedBarsTargetCount: groupedBarsTargetCount,
    nextGroupedBarsTarget: nextGroupedBarsTarget,
    nextStackedBarsTarget: nextStackedBarsTarget,
    setGroupedBarCount: setGroupedBarCount,
    setGroupedBarLabel: setGroupedBarLabel,
    setGroupedBarsActiveTarget: setGroupedBarsActiveTarget,
    setGroupedBarsMark: setGroupedBarsMark,
    setGroupedBarsReference: setGroupedBarsReference,
    setStackedBarsActiveTarget: setStackedBarsActiveTarget,
    setStackedBarsMark: setStackedBarsMark,
    setStackedSegmentCount: setStackedSegmentCount,
    setStackedSegmentLabel: setStackedSegmentLabel,
    stackedBarsReady: stackedBarsReady,
    stackedBarsTargetCount: stackedBarsTargetCount
  });
})(typeof window !== "undefined" ? window : globalThis);
