export const COMPARE_AB_MARK_ORDER = Object.freeze(["baseline", "control", "a", "b"]);

export const COMPARE_AB_MARK_META = Object.freeze({
  baseline: Object.freeze({ key: "baseline", label: "Baseline", shortLabel: "Base", color: "#f59e0b" }),
  control: Object.freeze({ key: "control", label: "Control", shortLabel: "Ctrl", color: "#38bdf8" }),
  a: Object.freeze({ key: "a", label: "A", shortLabel: "A", color: "#34d399" }),
  b: Object.freeze({ key: "b", label: "B", shortLabel: "B", color: "#f472b6" })
});

export function createCompareABState() {
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

export function clearCompareABMarks(state) {
  state.activeMark = "baseline";
  for (const key of COMPARE_AB_MARK_ORDER) {
    state.marks[key] = null;
  }
  return state;
}

export function setCompareABActiveMark(state, key) {
  state.activeMark = COMPARE_AB_MARK_META[key] ? key : null;
  return state.activeMark;
}

export function countCompareABMarks(state) {
  let count = 0;
  for (const key of COMPARE_AB_MARK_ORDER) {
    const point = state.marks[key];
    if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
      count += 1;
    }
  }
  return count;
}

export function nextCompareABMark(state, fromKey = null) {
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

export function setCompareABMark(state, key, point) {
  if (!COMPARE_AB_MARK_META[key]) {
    return { nextKey: state.activeMark, point: null };
  }

  state.marks[key] = { x: point.x, y: point.y };
  const nextKey = nextCompareABMark(state, key);
  state.activeMark = nextKey;
  return { nextKey, point: state.marks[key] };
}

export function compareABReady(state) {
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

export function computeCompareABResults(state, options = {}) {
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

export function buildCompareABCsv(result) {
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
