export const FIGURE_RECTIFIER_TOOL = Object.freeze({
  name: "figure-rectifier",
  version: "0.1.0"
});

export const TOOL = FIGURE_RECTIFIER_TOOL;

export function createInitialState() {
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

export function resetStateInPlace(target) {
  Object.assign(target, createInitialState());
  return target;
}
