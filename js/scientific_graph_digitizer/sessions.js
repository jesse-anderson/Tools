export const SESSION_SCHEMA = "scientific-graph-digitizer-session";
export const SESSION_VERSION = 1;
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

export function buildSessionPayload(context) {
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

export function parseSessionPayload(raw) {
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
