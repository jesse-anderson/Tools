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

export function createGroupedBarsState(count = 3) {
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

export function setGroupedBarCount(state, count) {
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

export function setGroupedBarLabel(state, key, label) {
  const bar = state.bars.find((entry) => entry.key === key);
  if (!bar) return;
  const normalized = String(label || "").trim();
  const index = state.bars.indexOf(bar);
  bar.label = normalized || `Bar ${index + 1}`;
}

export function setGroupedBarsReference(state, key) {
  if (state.bars.some((entry) => entry.key === key)) {
    state.referenceKey = key;
  }
}

export function clearGroupedBars(state) {
  state.baseline = null;
  state.activeTarget = "baseline";
  state.bars = state.bars.map((entry, index) => buildBar(index, { ...entry, point: null }));
}

export function setGroupedBarsActiveTarget(state, target) {
  if (target === "baseline" || state.bars.some((entry) => entry.key === target)) {
    state.activeTarget = target;
  }
  return state.activeTarget;
}

export function nextGroupedBarsTarget(state, fromTarget = null) {
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

export function setGroupedBarsMark(state, target, point) {
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

export function groupedBarsReady(state) {
  return !!state.baseline && state.bars.length > 0 && state.bars.every((entry) => !!entry.point);
}

export function countGroupedBarsPlaced(state) {
  const baselineCount = state.baseline ? 1 : 0;
  const barCount = state.bars.filter((entry) => !!entry.point).length;
  return baselineCount + barCount;
}

export function groupedBarsTargetCount(state) {
  return 1 + state.bars.length;
}

export function computeGroupedBarsResults(state, options = {}) {
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

export function buildGroupedBarsCsv(result) {
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

export function createStackedBarsState(count = 3) {
  const safeCount = clampCount(count);
  const segments = Array.from({ length: safeCount }, (_, index) => buildSegment(index));
  return {
    mode: "stacked_bars",
    baseline: null,
    segments,
    activeTarget: "baseline"
  };
}

export function setStackedSegmentCount(state, count) {
  const safeCount = clampCount(count);
  const nextSegments = Array.from({ length: safeCount }, (_, index) => buildSegment(index, state.segments[index]));
  state.segments = nextSegments;

  if (state.activeTarget !== "baseline" && !nextSegments.some((entry) => entry.key === state.activeTarget)) {
    state.activeTarget = nextStackedBarsTarget(state);
  }

  return state.segments.length;
}

export function setStackedSegmentLabel(state, key, label) {
  const segment = state.segments.find((entry) => entry.key === key);
  if (!segment) return;
  const normalized = String(label || "").trim();
  const index = state.segments.indexOf(segment);
  segment.label = normalized || `Segment ${index + 1}`;
}

export function clearStackedBars(state) {
  state.baseline = null;
  state.activeTarget = "baseline";
  state.segments = state.segments.map((entry, index) => buildSegment(index, { ...entry, point: null }));
}

export function setStackedBarsActiveTarget(state, target) {
  if (target === "baseline" || state.segments.some((entry) => entry.key === target)) {
    state.activeTarget = target;
  }
  return state.activeTarget;
}

export function nextStackedBarsTarget(state, fromTarget = null) {
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

export function setStackedBarsMark(state, target, point) {
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

export function stackedBarsReady(state) {
  return !!state.baseline && state.segments.length > 0 && state.segments.every((entry) => !!entry.point);
}

export function countStackedBarsPlaced(state) {
  const baselineCount = state.baseline ? 1 : 0;
  const segmentCount = state.segments.filter((entry) => !!entry.point).length;
  return baselineCount + segmentCount;
}

export function stackedBarsTargetCount(state) {
  return 1 + state.segments.length;
}

export function computeStackedBarsResults(state, options = {}) {
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

export function buildStackedBarsCsv(result) {
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
