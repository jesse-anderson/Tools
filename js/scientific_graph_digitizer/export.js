export function computeFullResExportData(context) {
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

export function buildExportJson(context) {
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

export async function exportPngAndJson(context) {
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
