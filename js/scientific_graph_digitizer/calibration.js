export function parseNumeric(str) {
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

export function mapAxisLinear(px, p1, v1, p2, v2) {
  if (p2 === p1) return null;
  return v1 + ((px - p1) * (v2 - v1)) / (p2 - p1);
}

export function mapAxisLog10(px, p1, v1, p2, v2) {
  if (v1 <= 0 || v2 <= 0) return null;
  const u1 = Math.log10(v1);
  const u2 = Math.log10(v2);
  const u = mapAxisLinear(px, p1, u1, p2, u2);
  if (u === null) return null;
  return Math.pow(10, u);
}

export function calibrationReady(state) {
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

export function cursorToData(state, px, py) {
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
