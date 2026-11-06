// Pure geometry, axis labels, scale text and layout checks for the graph paper
// generator. No DOM access: every function takes plain values and returns plain
// values, so specs can call it through window.GraphPaperEngine.

export const INCH_TO_PT = 72;
const SQRT_THREE = Math.sqrt(3);

export const PAPER_SIZES = {
    letter: { width: 8.5 * INCH_TO_PT, height: 11 * INCH_TO_PT, label: 'Letter', shortLabel: '8.5 x 11 in' },
    legal: { width: 8.5 * INCH_TO_PT, height: 14 * INCH_TO_PT, label: 'Legal', shortLabel: '8.5 x 14 in' },
    a4: { width: 595.276, height: 841.89, label: 'A4', shortLabel: '210 x 297 mm' }
};

export const PALETTES = {
    graphite: {
        minor: [0.72, 0.72, 0.76],
        major: [0.46, 0.47, 0.52],
        axis: [0.14, 0.15, 0.18],
        dot: [0.26, 0.28, 0.32],
        border: [0.2, 0.22, 0.26]
    },
    engineerBlue: {
        minor: [0.74, 0.84, 0.97],
        major: [0.41, 0.62, 0.93],
        axis: [0.14, 0.33, 0.65],
        dot: [0.2, 0.44, 0.82],
        border: [0.19, 0.39, 0.73]
    },
    forest: {
        minor: [0.8, 0.89, 0.82],
        major: [0.42, 0.65, 0.47],
        axis: [0.16, 0.39, 0.21],
        dot: [0.18, 0.48, 0.26],
        border: [0.16, 0.39, 0.21]
    },
    amber: {
        minor: [0.94, 0.87, 0.72],
        major: [0.88, 0.63, 0.18],
        axis: [0.56, 0.34, 0.03],
        dot: [0.72, 0.45, 0.06],
        border: [0.56, 0.34, 0.03]
    }
};

export const TEMPLATE_META = {
    cartesian: {
        label: 'Cartesian grid',
        description: 'Full-page cartesian grid with heavier major guides every fifth interval.'
    },
    cornerAxes: {
        label: 'First-quadrant XY grid',
        description: 'Grid paper with heavier left and bottom axes plus major tick marks for first-quadrant plotting.'
    },
    centerAxes: {
        label: 'Centered XY grid',
        description: 'Four-quadrant grid with centered axes aligned to the nearest grid intersection.'
    },
    dotGrid: {
        label: 'Dot grid',
        description: 'Plain dot paper using a uniform point lattice across the printable area.'
    },
    boxedDots: {
        label: 'Boxed dot grid',
        description: 'Dot paper with a bounding box around the printable field.'
    },
    isometricDots: {
        label: 'Isometric dot grid',
        description: 'Triangular point lattice for isometric sketching and quick layout work.'
    }
};

export const DEFAULT_STATE = Object.freeze({
    template: 'cartesian',
    paperSize: 'letter',
    orientation: 'portrait',
    palette: 'engineerBlue',
    minorSpacingIn: 0.2,
    majorEvery: 5,
    marginIn: 0.4,
    dotRadiusPt: 1.2,
    useCustomColors: false,
    minorRed: 189,
    minorGreen: 214,
    minorBlue: 247,
    majorRed: 105,
    majorGreen: 158,
    majorBlue: 237,
    accentRed: 36,
    accentGreen: 84,
    accentBlue: 166,
    minorOpacity: 0.6,
    majorOpacity: 0.85,
    headerText: '',
    headerAlign: 'center',
    footerText: '',
    footerAlign: 'center',
    includeScaleNote: false,
    scaleValue: 1,
    scaleUnit: 'in',
    xMin: 0,
    xMax: 10,
    yMin: 0,
    yMax: 10
});

// Inches per unit, for turning a drawing scale into a ratio.
export const UNIT_TO_IN = { in: 1, ft: 12, yd: 36, mm: 1 / 25.4, cm: 1 / 2.54, m: 1 / 0.0254 };

// The PDF uses the standard Courier and Helvetica-Bold fonts, and the preview
// asks for the same faces, so widths here hold for both. Widths are the AFM
// values per 1000 em for codes 32-126 under WinAnsiEncoding.
const COURIER_ADVANCE = 0.6;
const COURIER_CAP_HEIGHT = 0.562;
const HELVETICA_BOLD_CAP_HEIGHT = 0.718;
const HELVETICA_BOLD_WIDTHS = [
    278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
    975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
    333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
    611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584
];

const LABEL_SIZE = 8;
const LABEL_GAP = 3;
const HEADER_SIZE = 11;
const FOOTER_SIZE = 10;
const SCALE_NOTE_SIZE = 9;
const TEXT_LINE_HEIGHT = 12;
const MAX_TICK_LENGTH = 8;

export function measureText(text, size, font) {
    if (font === 'bold') {
        let units = 0;
        for (let index = 0; index < text.length; index += 1) {
            const code = text.charCodeAt(index);
            units += code >= 32 && code <= 126 ? HELVETICA_BOLD_WIDTHS[code - 32] : 556;
        }
        return (units / 1000) * size;
    }
    return text.length * COURIER_ADVANCE * size;
}

export function capHeight(size, font) {
    return size * (font === 'bold' ? HELVETICA_BOLD_CAP_HEIGHT : COURIER_CAP_HEIGHT);
}

export function isGridTemplate(template) {
    return template === 'cartesian' || template === 'cornerAxes' || template === 'centerAxes';
}

export function isDotTemplate(template) {
    return template === 'dotGrid' || template === 'boxedDots' || template === 'isometricDots';
}

export function isAxisTemplate(template) {
    return template === 'cornerAxes' || template === 'centerAxes';
}

export function isOrthogonalTemplate(template) {
    return template !== 'isometricDots' && Boolean(TEMPLATE_META[template]);
}

// One normalizer for form values, saved templates and imported files.
export function normalizeState(raw) {
    const merged = { ...DEFAULT_STATE, ...(raw && typeof raw === 'object' ? raw : {}) };
    const num = (key) => parseNumber(merged[key], DEFAULT_STATE[key]);
    const channel = (key) => clampInt(num(key), 0, 255);

    return normalizeStateForTemplate({
        template: TEMPLATE_META[merged.template] ? merged.template : DEFAULT_STATE.template,
        paperSize: PAPER_SIZES[merged.paperSize] ? merged.paperSize : DEFAULT_STATE.paperSize,
        orientation: merged.orientation === 'landscape' ? 'landscape' : 'portrait',
        palette: PALETTES[merged.palette] ? merged.palette : DEFAULT_STATE.palette,
        minorSpacingIn: clamp(num('minorSpacingIn'), 0.1, 1),
        majorEvery: clampInt(num('majorEvery'), 2, 10),
        marginIn: clamp(num('marginIn'), 0.2, 1.5),
        dotRadiusPt: clamp(num('dotRadiusPt'), 0.5, 4),
        useCustomColors: parseBoolean(merged.useCustomColors, DEFAULT_STATE.useCustomColors),
        minorRed: channel('minorRed'),
        minorGreen: channel('minorGreen'),
        minorBlue: channel('minorBlue'),
        majorRed: channel('majorRed'),
        majorGreen: channel('majorGreen'),
        majorBlue: channel('majorBlue'),
        accentRed: channel('accentRed'),
        accentGreen: channel('accentGreen'),
        accentBlue: channel('accentBlue'),
        minorOpacity: clamp(num('minorOpacity'), 0.05, 1),
        majorOpacity: clamp(num('majorOpacity'), 0.05, 1),
        headerText: normalizeMultilineText(String(merged.headerText ?? ''), 2),
        headerAlign: normalizeTextAlign(merged.headerAlign),
        footerText: normalizeMultilineText(String(merged.footerText ?? ''), 2),
        footerAlign: normalizeTextAlign(merged.footerAlign),
        includeScaleNote: parseBoolean(merged.includeScaleNote, DEFAULT_STATE.includeScaleNote),
        scaleValue: clamp(num('scaleValue'), 0.001, 1e9),
        scaleUnit: UNIT_TO_IN[merged.scaleUnit] ? merged.scaleUnit : DEFAULT_STATE.scaleUnit,
        xMin: num('xMin'),
        xMax: num('xMax'),
        yMin: num('yMin'),
        yMax: num('yMax')
    });
}

// Centered axes are symmetric about zero; other templates get min < max.
function normalizeStateForTemplate(state) {
    const normalized = { ...state };

    if (normalized.template === 'centerAxes') {
        const xExtent = Math.max(Math.abs(normalized.xMin), Math.abs(normalized.xMax));
        const yExtent = Math.max(Math.abs(normalized.yMin), Math.abs(normalized.yMax));
        normalized.xMin = -(xExtent > 0 ? xExtent : DEFAULT_STATE.xMax);
        normalized.xMax = xExtent > 0 ? xExtent : DEFAULT_STATE.xMax;
        normalized.yMin = -(yExtent > 0 ? yExtent : DEFAULT_STATE.yMax);
        normalized.yMax = yExtent > 0 ? yExtent : DEFAULT_STATE.yMax;
    } else {
        const xRange = normalizeAxisRange(normalized.xMin, normalized.xMax, DEFAULT_STATE.xMin, DEFAULT_STATE.xMax);
        const yRange = normalizeAxisRange(normalized.yMin, normalized.yMax, DEFAULT_STATE.yMin, DEFAULT_STATE.yMax);
        normalized.xMin = xRange.min;
        normalized.xMax = xRange.max;
        normalized.yMin = yRange.min;
        normalized.yMax = yRange.max;
    }

    return normalized;
}

function normalizeAxisRange(minValue, maxValue, fallbackMin, fallbackMax) {
    let min = Number.isFinite(minValue) ? minValue : fallbackMin;
    let max = Number.isFinite(maxValue) ? maxValue : fallbackMax;
    if (min === max) {
        max = min + 1;
    }
    if (min > max) {
        [min, max] = [max, min];
    }
    return { min, max };
}

export function getPageDimensions(sizeKey, orientation) {
    const size = PAPER_SIZES[sizeKey] || PAPER_SIZES.letter;
    return orientation === 'landscape'
        ? { width: size.height, height: size.width }
        : { width: size.width, height: size.height };
}

// Smallest of 1, 2, 2.5 or 5 times a power of ten that is at least `raw`.
export function niceStep(raw) {
    if (!(raw > 0) || !Number.isFinite(raw)) {
        return 1;
    }
    const base = 10 ** Math.floor(Math.log10(raw));
    for (const multiple of [1, 2, 2.5, 5, 10]) {
        const step = cleanNumber(multiple * base);
        if (step >= raw * (1 - 1e-9)) {
            return step;
        }
    }
    return cleanNumber(10 * base);
}

// Labeled ticks for one axis. `intervals` is the minor count along the axis.
// Corner axes start at `min` and step up; centered axes step out from zero.
// The step is rounded up, so the last label can run past `max`.
export function buildAxisTicks({ min, max, intervals, majorEvery, centered }) {
    if (centered) {
        const half = Math.floor(intervals / 2);
        const perSide = Math.floor(half / majorEvery);
        if (perSide < 1) {
            return { step: null, ticks: [{ index: half, value: 0 }] };
        }
        const step = niceStep(Math.max(Math.abs(min), Math.abs(max)) / perSide);
        const ticks = [];
        for (let k = -perSide; k <= perSide; k += 1) {
            ticks.push({ index: half + (k * majorEvery), value: cleanNumber(k * step) });
        }
        return { step, ticks };
    }

    const majors = Math.floor(intervals / majorEvery);
    if (majors < 1) {
        return { step: null, ticks: [{ index: 0, value: cleanNumber(min) }] };
    }
    const step = niceStep((max - min) / majors);
    const ticks = [];
    for (let k = 0; k <= majors; k += 1) {
        ticks.push({ index: k * majorEvery, value: cleanNumber(min + (k * step)) });
    }
    return { step, ticks };
}

export function buildScene(state) {
    const page = getPageDimensions(state.paperSize, state.orientation);
    const marginPt = state.marginIn * INCH_TO_PT;
    const spacingPt = state.minorSpacingIn * INCH_TO_PT;
    const inner = {
        x: marginPt,
        y: marginPt,
        width: Math.max(0, page.width - (marginPt * 2)),
        height: Math.max(0, page.height - (marginPt * 2))
    };
    inner.right = inner.x + inner.width;
    inner.bottom = inner.y + inner.height;

    const scene = {
        page,
        inner,
        palette: getActivePalette(state),
        state,
        spacingPt,
        grid: null,
        axes: null,
        primitives: [],
        overlay: [],
        warnings: [],
        metrics: {
            printableWidthIn: inner.width / INCH_TO_PT,
            printableHeightIn: inner.height / INCH_TO_PT,
            countText: '--',
            countLabel: '--'
        }
    };

    addPreviewGuides(scene);

    if (inner.width <= 0 || inner.height <= 0) {
        return scene;
    }

    switch (state.template) {
        case 'cornerAxes':
            scene.grid = buildOrthogonalField(inner, spacingPt, {
                mode: 'cornerBottomLeft',
                columnMultiple: state.majorEvery,
                rowMultiple: state.majorEvery
            });
            addCartesianGrid(scene);
            addCornerAxes(scene);
            break;
        case 'centerAxes':
            scene.grid = buildOrthogonalField(inner, spacingPt, {
                mode: 'center',
                evenColumns: true,
                evenRows: true,
                columnMultiple: state.majorEvery * 2,
                rowMultiple: state.majorEvery * 2
            });
            addCartesianGrid(scene);
            addCenteredAxes(scene);
            break;
        case 'dotGrid':
        case 'boxedDots':
            scene.grid = buildOrthogonalField(inner, spacingPt, { mode: 'center' });
            addDotGrid(scene, state.template === 'boxedDots');
            break;
        case 'isometricDots':
            scene.grid = buildIsometricField(inner, spacingPt);
            addIsometricDots(scene);
            break;
        default:
            scene.grid = buildOrthogonalField(inner, spacingPt, {
                mode: 'center',
                columnMultiple: state.majorEvery,
                rowMultiple: state.majorEvery
            });
            addCartesianGrid(scene);
            break;
    }

    if (isDotTemplate(state.template) && state.dotRadiusPt * 2 >= spacingPt) {
        scene.warnings.push('Dots touch or overlap at this spacing; reduce the dot radius or widen the spacing.');
    }

    addPageAnnotations(scene);
    return scene;
}

function addPreviewGuides(scene) {
    scene.overlay.push({
        type: 'rect',
        x: 0.5,
        y: 0.5,
        width: scene.page.width - 1,
        height: scene.page.height - 1,
        className: 'preview-outline'
    });
    scene.overlay.push({
        type: 'rect',
        x: scene.inner.x,
        y: scene.inner.y,
        width: scene.inner.width,
        height: scene.inner.height,
        className: 'preview-margin-guide'
    });
}

function addCartesianGrid(scene) {
    const { grid, inner, palette, state } = scene;
    const spacing = scene.spacingPt;

    for (let index = 0; index <= grid.columns; index += 1) {
        const x = grid.x + (index * spacing);
        const isMajor = grid.axisColumn == null
            ? index % state.majorEvery === 0
            : Math.abs(index - grid.axisColumn) % state.majorEvery === 0;
        addLine(scene, x, inner.y, x, inner.bottom, isMajor ? palette.major : palette.minor, isMajor ? 0.9 : 0.35);
    }

    for (let index = 0; index <= grid.rows; index += 1) {
        const y = grid.y + (index * spacing);
        let isMajor;
        if (grid.axisRow != null) {
            isMajor = Math.abs(index - grid.axisRow) % state.majorEvery === 0;
        } else if (state.template === 'cornerAxes') {
            isMajor = (grid.rows - index) % state.majorEvery === 0;
        } else {
            isMajor = index % state.majorEvery === 0;
        }
        addLine(scene, inner.x, y, inner.right, y, isMajor ? palette.major : palette.minor, isMajor ? 0.9 : 0.35);
    }

    scene.metrics.countText = `${grid.columns + 1} cols x ${grid.rows + 1} rows`;
    scene.metrics.countLabel = `${grid.columns + 1} by ${grid.rows + 1} grid intersections`;
}

function tickLengthFor(spacing) {
    return Math.min(MAX_TICK_LENGTH, spacing * 0.35);
}

function addCornerAxes(scene) {
    const { grid, inner, palette, state } = scene;
    const spacing = scene.spacingPt;
    const tick = tickLengthFor(spacing);
    const origin = { x: grid.x, y: grid.bottom };

    addLine(scene, inner.x, origin.y, inner.right, origin.y, palette.axis, 1.7);
    addLine(scene, origin.x, inner.y, origin.x, inner.bottom, palette.axis, 1.7);

    const xAxis = buildAxisTicks({ min: state.xMin, max: state.xMax, intervals: grid.columns, majorEvery: state.majorEvery });
    const yAxis = buildAxisTicks({ min: state.yMin, max: state.yMax, intervals: grid.rows, majorEvery: state.majorEvery });
    const xTicks = xAxis.ticks.map((t) => ({ value: t.value, x: grid.x + (t.index * spacing), y: origin.y }));
    const yTicks = yAxis.ticks.map((t) => ({ value: t.value, x: origin.x, y: grid.bottom - (t.index * spacing) }));

    xTicks.forEach((t) => addLine(scene, t.x, origin.y, t.x, origin.y - tick, palette.axis, 1.1));
    yTicks.forEach((t) => addLine(scene, origin.x, t.y, origin.x + tick, t.y, palette.axis, 1.1));

    if (xAxis.step == null || yAxis.step == null) {
        scene.warnings.push('Too few intervals for a labeled major tick on one axis; reduce the spacing or "Major every".');
    }

    scene.axes = { origin, tickLength: tick, x: { step: xAxis.step, ticks: xTicks }, y: { step: yAxis.step, ticks: yTicks }, labels: [] };
    placeAxisLabels(scene, { inward: true });
}

function addCenteredAxes(scene) {
    const { grid, inner, palette, state } = scene;
    const spacing = scene.spacingPt;
    const tick = tickLengthFor(spacing);
    const origin = { x: grid.x + (grid.axisColumn * spacing), y: grid.y + (grid.axisRow * spacing) };

    addLine(scene, origin.x, inner.y, origin.x, inner.bottom, palette.axis, 1.6);
    addLine(scene, inner.x, origin.y, inner.right, origin.y, palette.axis, 1.6);

    const xAxis = buildAxisTicks({ min: state.xMin, max: state.xMax, intervals: grid.columns, majorEvery: state.majorEvery, centered: true });
    const yAxis = buildAxisTicks({ min: state.yMin, max: state.yMax, intervals: grid.rows, majorEvery: state.majorEvery, centered: true });
    const xTicks = xAxis.ticks.map((t) => ({ value: t.value, x: grid.x + (t.index * spacing), y: origin.y }));
    // Row index counts down the page, so positive values sit above the axis.
    const yTicks = yAxis.ticks.map((t) => ({ value: t.value, x: origin.x, y: origin.y - ((t.index - grid.axisRow) * spacing) }));

    xTicks.forEach((t) => {
        if (t.value !== 0) addLine(scene, t.x, origin.y - tick, t.x, origin.y + tick, palette.axis, 1);
    });
    yTicks.forEach((t) => {
        if (t.value !== 0) addLine(scene, origin.x - tick, t.y, origin.x + tick, t.y, palette.axis, 1);
    });

    if (xAxis.step == null || yAxis.step == null) {
        scene.warnings.push('Too few intervals for a labeled major tick on one axis; reduce the spacing or "Major every".');
    }

    scene.axes = { origin, tickLength: tick, x: { step: xAxis.step, ticks: xTicks }, y: { step: yAxis.step, ticks: yTicks }, labels: [] };
    placeAxisLabels(scene, { inward: false });
}

// X labels hang below the axis, Y labels sit left of it, each centered on its
// tick. When both axes read zero at the origin they share one "0" placed just
// below-left of the corner. `inward` means ticks point into the grid.
function placeAxisLabels(scene, { inward }) {
    const { axes, page, palette } = scene;
    const { origin, tickLength } = axes;
    const size = LABEL_SIZE;
    const cap = capHeight(size, 'mono');
    const clearance = inward ? LABEL_GAP : tickLength + 2;
    const xStep = axes.x.step || 1;
    const yStep = axes.y.step || 1;
    const xFirst = axes.x.ticks.find((t) => nearlyEqual(t.x, origin.x));
    const yFirst = axes.y.ticks.find((t) => nearlyEqual(t.y, origin.y));
    const sharedZero = Boolean(xFirst && yFirst && xFirst.value === 0 && yFirst.value === 0);

    const yTexts = axes.y.ticks
        .filter((t) => !(sharedZero && t === yFirst))
        .map((t) => ({ tick: t, text: formatTickValue(t.value, yStep) }));
    const widest = yTexts.reduce((max, item) => Math.max(max, measureText(item.text, size, 'mono')), 0);
    const yOutside = origin.x - clearance - widest >= 2;

    let xBaseline = origin.y + clearance + cap;
    const xOutside = xBaseline + 2 <= page.height;
    if (!xOutside) {
        xBaseline = origin.y - tickLength - 2;
    }

    axes.x.ticks.forEach((t) => {
        if (sharedZero && t === xFirst) return;
        const text = formatTickValue(t.value, xStep);
        const width = measureText(text, size, 'mono');
        const x = clamp(t.x, (width / 2) + 1, page.width - (width / 2) - 1);
        pushLabel(scene, { axis: 'x', value: t.value, text, x, y: xBaseline, anchor: 'middle' });
    });

    yTexts.forEach(({ tick, text }) => {
        const x = yOutside ? origin.x - clearance : origin.x + tickLength + 2;
        pushLabel(scene, { axis: 'y', value: tick.value, text, x, y: tick.y + (cap / 2), anchor: yOutside ? 'end' : 'start' });
    });

    if (sharedZero) {
        pushLabel(scene, { axis: 'origin', value: 0, text: '0', x: origin.x - LABEL_GAP, y: origin.y + LABEL_GAP + cap, anchor: 'end' });
    }

    scene.reservedBottom = xOutside && inward ? xBaseline : null;

    // A white patch behind each label keeps gridlines from striking through it.
    function pushLabel(target, label) {
        const width = measureText(label.text, size, 'mono');
        const left = label.anchor === 'middle' ? label.x - (width / 2) : label.anchor === 'end' ? label.x - width : label.x;
        target.axes.labels.push(label);
        target.primitives.push({
            type: 'fill',
            x: left - 1,
            y: label.y - cap - 1.5,
            width: width + 2,
            height: cap + 3,
            color: [1, 1, 1],
            opacity: 1
        });
        addText(target, label.x, label.y, label.text, size, palette.text, label.anchor, 'mono');
    }
}

function addDotGrid(scene, boxed) {
    const { grid, palette, state } = scene;
    const spacing = scene.spacingPt;

    for (let row = 0; row <= grid.rows; row += 1) {
        const y = grid.y + (row * spacing);
        for (let col = 0; col <= grid.columns; col += 1) {
            addDot(scene, grid.x + (col * spacing), y, state.dotRadiusPt, palette.dot);
        }
    }

    if (boxed) {
        addRect(scene, grid.x, grid.y, grid.width, grid.height, palette.border, 1.2);
    }

    scene.metrics.countText = `${grid.columns + 1} cols x ${grid.rows + 1} rows`;
    scene.metrics.countLabel = `${((grid.columns + 1) * (grid.rows + 1)).toLocaleString('en-US')} dots`;
}

function addIsometricDots(scene) {
    const { grid, palette, state } = scene;
    const spacing = scene.spacingPt;
    let count = 0;
    let maxCols = 0;

    for (let row = 0; row <= grid.rows; row += 1) {
        const y = grid.y + (row * grid.rowStep);
        // Odd rows are offset half a step and carry one dot fewer.
        const offset = row % 2 === 0 ? 0 : spacing / 2;
        const cols = row % 2 === 0 ? grid.columns + 1 : grid.columns;
        for (let col = 0; col < cols; col += 1) {
            addDot(scene, grid.x + offset + (col * spacing), y, state.dotRadiusPt, palette.dot);
        }
        count += cols;
        maxCols = Math.max(maxCols, cols);
    }

    scene.metrics.countText = `${maxCols} cols x ${grid.rows + 1} rows`;
    scene.metrics.countLabel = `${count.toLocaleString('en-US')} dots`;
}

// Header lines are centered in the top margin, footer lines and the scale note
// in the space below the grid (or below the axis labels). Text that does not
// fit is still drawn, and a warning says which margin is too small.
function addPageAnnotations(scene) {
    const { page, inner, palette, state } = scene;
    const headerLines = state.headerText.split('\n').filter(Boolean);
    const footerLines = state.footerText.split('\n').filter(Boolean);
    const scaleNote = state.includeScaleNote ? buildScaleNoteText(state) : '';

    if (headerLines.length > 0) {
        const lines = headerLines.map((text, index) => ({
            text,
            size: HEADER_SIZE,
            font: index === 0 ? 'bold' : 'mono',
            x: alignedX(page, inner, state.headerAlign),
            anchor: anchorForAlign(state.headerAlign)
        }));
        const fits = layoutTextBlock(lines, 0, inner.y);
        lines.forEach((line) => addText(scene, line.x, line.y, line.text, line.size, palette.text, line.anchor, line.font));
        if (!fits) {
            scene.warnings.push('Header text needs a larger margin to clear the grid.');
        }
    }

    const footer = footerLines.map((text) => ({
        text,
        size: FOOTER_SIZE,
        font: 'mono',
        x: alignedX(page, inner, state.footerAlign),
        anchor: anchorForAlign(state.footerAlign)
    }));
    if (scaleNote) {
        footer.push({ text: scaleNote, size: SCALE_NOTE_SIZE, font: 'mono', x: inner.x, anchor: 'start' });
    }
    if (footer.length > 0) {
        const top = scene.reservedBottom != null ? scene.reservedBottom + 3 : inner.bottom;
        const fits = layoutTextBlock(footer, top, page.height);
        footer.forEach((line) => addText(scene, line.x, line.y, line.text, line.size, palette.text, line.anchor, line.font));
        if (!fits) {
            scene.warnings.push(scene.reservedBottom != null
                ? 'Footer text needs a larger margin to clear the axis labels.'
                : 'Footer text needs a larger margin to clear the grid.');
        }
    }
}

// Sets each line's baseline so the block is centered between top and bottom.
// Returns false when the block is taller than the band.
function layoutTextBlock(lines, top, bottom) {
    const firstCap = capHeight(lines[0].size, lines[0].font);
    const descent = lines[lines.length - 1].size * 0.2;
    const blockHeight = firstCap + ((lines.length - 1) * TEXT_LINE_HEIGHT) + descent;
    const room = bottom - top;
    const firstBaseline = top + Math.max(1, (room - blockHeight) / 2) + firstCap;
    lines.forEach((line, index) => {
        line.y = firstBaseline + (index * TEXT_LINE_HEIGHT);
    });
    return blockHeight + 2 <= room;
}

function addLine(scene, x1, y1, x2, y2, color, width) {
    scene.primitives.push({ type: 'line', x1, y1, x2, y2, color: color.rgb, opacity: color.opacity, width });
}

function addRect(scene, x, y, width, height, color, strokeWidth) {
    scene.primitives.push({ type: 'rect', x, y, width, height, color: color.rgb, opacity: color.opacity, strokeWidth });
}

function addDot(scene, cx, cy, radius, color) {
    scene.primitives.push({ type: 'circle', cx, cy, radius, color: color.rgb, opacity: color.opacity });
}

// y is the text baseline in page coordinates (y down).
function addText(scene, x, y, text, size, color, anchor, font) {
    scene.primitives.push({
        type: 'text',
        x,
        y,
        text,
        size,
        font: font === 'bold' ? 'bold' : 'mono',
        color: color.rgb,
        opacity: color.opacity,
        anchor: anchor || 'start'
    });
}

function buildOrthogonalField(inner, spacing, options) {
    const columns = fitGridCount(Math.max(1, Math.floor((inner.width / spacing) + 1e-9)), {
        multiple: options.columnMultiple || 1,
        even: options.evenColumns
    });
    const rows = fitGridCount(Math.max(1, Math.floor((inner.height / spacing) + 1e-9)), {
        multiple: options.rowMultiple || 1,
        even: options.evenRows
    });
    const width = columns * spacing;
    const height = rows * spacing;
    let x = inner.x;
    let y = inner.y;

    if (options.mode === 'center') {
        x = inner.x + ((inner.width - width) / 2);
        y = inner.y + ((inner.height - height) / 2);
    } else if (options.mode === 'cornerBottomLeft') {
        y = inner.bottom - height;
    }

    return {
        x,
        y,
        width,
        height,
        right: x + width,
        bottom: y + height,
        columns,
        rows,
        axisColumn: options.evenColumns ? columns / 2 : null,
        axisRow: options.evenRows ? rows / 2 : null
    };
}

function buildIsometricField(inner, spacing) {
    const rowStep = spacing * (SQRT_THREE / 2);
    const columns = Math.max(1, Math.floor((inner.width / spacing) + 1e-9));
    const rows = Math.max(1, Math.floor((inner.height / rowStep) + 1e-9));
    const width = columns * spacing;
    const height = rows * rowStep;
    const x = inner.x + ((inner.width - width) / 2);
    const y = inner.y + ((inner.height - height) / 2);
    return { x, y, width, height, right: x + width, bottom: y + height, columns, rows, rowStep };
}

// Largest count not above `available` that is a multiple of `multiple` (and
// even when asked), falling back to `available` when the multiple will not fit.
export function fitGridCount(available, options) {
    const multiple = Math.max(1, options.multiple || 1);
    let count = available >= multiple ? Math.floor(available / multiple) * multiple : available;
    if (options.even && count % 2 !== 0 && count > 1) {
        count -= 1;
    }
    return Math.max(1, count);
}

export function getActivePalette(state) {
    const base = PALETTES[state.palette] || PALETTES.engineerBlue;
    const minorRgb = state.useCustomColors ? rgb255(state.minorRed, state.minorGreen, state.minorBlue) : base.minor;
    const majorRgb = state.useCustomColors ? rgb255(state.majorRed, state.majorGreen, state.majorBlue) : base.major;
    const accentRgb = state.useCustomColors ? rgb255(state.accentRed, state.accentGreen, state.accentBlue) : base.axis;

    return {
        minor: { rgb: minorRgb, opacity: state.minorOpacity },
        major: { rgb: majorRgb, opacity: state.majorOpacity },
        axis: { rgb: accentRgb, opacity: 1 },
        dot: { rgb: state.useCustomColors ? majorRgb : base.dot, opacity: state.majorOpacity },
        border: { rgb: state.useCustomColors ? accentRgb : base.border, opacity: 1 },
        text: { rgb: accentRgb, opacity: 1 }
    };
}

// Without a drawing scale the card reports the printed pitch, so it follows
// the spacing. With one, it reports the real size per interval and the ratio
// that implies at 100% print.
export function buildScaleSummary(state) {
    const label = isDotTemplate(state.template) ? '1 dot interval' : '1 interval';
    const pitchIn = state.minorSpacingIn;
    const pitchText = `${formatPlain(pitchIn, 4)} in (${formatPlain(pitchIn * 25.4, 3)} mm)`;

    if (!state.includeScaleNote) {
        return {
            primary: `${label} = ${formatPlain(pitchIn, 4)} in`,
            detail: `${label} = ${pitchText} on paper at 100% print. No drawing scale set.`,
            ratio: 1,
            ratioText: '1:1'
        };
    }

    const valueText = formatPlain(state.scaleValue, 6);
    const ratio = (state.scaleValue * UNIT_TO_IN[state.scaleUnit]) / pitchIn;
    const ratioText = formatRatio(ratio);
    let detail = `${label} = ${valueText} ${state.scaleUnit}, drawn ${pitchText}, scale ${ratioText} at 100% print`;
    if (isOrthogonalTemplate(state.template)) {
        const areaLabel = isDotTemplate(state.template) ? '1 dot box' : '1 box';
        detail += `; ${areaLabel} = ${formatPlain(state.scaleValue * state.scaleValue, 6)} ${state.scaleUnit}^2`;
    }
    return { primary: `${label} = ${valueText} ${state.scaleUnit} (${ratioText})`, detail, ratio, ratioText };
}

export function buildScaleNoteText(state) {
    const summary = buildScaleSummary(state);
    const label = isDotTemplate(state.template) ? '1 dot interval' : '1 interval';
    let text = `Scale ${summary.ratioText}: ${label} = ${formatPlain(state.scaleValue, 6)} ${state.scaleUnit}`;
    if (isOrthogonalTemplate(state.template)) {
        const areaLabel = isDotTemplate(state.template) ? '1 dot box' : '1 box';
        text += `; ${areaLabel} = ${formatPlain(state.scaleValue * state.scaleValue, 6)} ${state.scaleUnit}^2`;
    }
    return `${text}. Print at 100%.`;
}

// "1:4" when one interval stands for more than its printed size, "4:1" when less.
export function formatRatio(ratio) {
    if (!(ratio > 0) || !Number.isFinite(ratio)) {
        return '--';
    }
    if (Math.abs(ratio - 1) < 1e-9) {
        return '1:1';
    }
    return ratio > 1 ? `1:${formatSignificant(ratio)}` : `${formatSignificant(1 / ratio)}:1`;
}

function formatSignificant(value) {
    return Number(value.toPrecision(4)).toString();
}

// Tick labels use the decimals of the step, so 2.5 steps print 7.5 rather than 8.
export function formatTickValue(value, step) {
    if (!Number.isFinite(value)) {
        return '--';
    }
    if (value === 0) {
        return '0';
    }
    const abs = Math.abs(value);
    if (abs >= 1e6 || abs < 1e-4) {
        const [mantissa, exponent] = value.toExponential(3).split('e');
        return `${trimTrailingZeros(mantissa)}e${exponent}`;
    }
    const decimals = Math.min(6, decimalPlaces(cleanNumber(Math.abs(step) || 1)));
    return trimTrailingZeros(value.toFixed(decimals));
}

function decimalPlaces(value) {
    const text = String(value);
    if (text.includes('e-')) {
        return Number(text.split('e-')[1]);
    }
    const dot = text.indexOf('.');
    return dot === -1 ? 0 : text.length - dot - 1;
}

export function formatPlain(value, maxDecimals) {
    if (!Number.isFinite(value)) {
        return '--';
    }
    return trimTrailingZeros(value.toFixed(maxDecimals));
}

export function formatFixed(value, decimals) {
    return trimTrailingZeros(value.toFixed(decimals));
}

function trimTrailingZeros(text) {
    return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

function cleanNumber(value) {
    const cleaned = Number(value.toPrecision(12));
    return cleaned === 0 ? 0 : cleaned;
}

function nearlyEqual(a, b) {
    return Math.abs(a - b) < 1e-6;
}

function alignedX(page, inner, align) {
    if (align === 'left') return inner.x;
    if (align === 'right') return inner.right;
    return page.width / 2;
}

function anchorForAlign(align) {
    if (align === 'left') return 'start';
    if (align === 'right') return 'end';
    return 'middle';
}

export function parseNumber(value, fallback) {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value, fallback) {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return fallback;
}

function normalizeTextAlign(value) {
    return value === 'left' || value === 'right' ? value : 'center';
}

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function clampInt(value, min, max) {
    return Math.round(clamp(value, min, max));
}

function rgb255(red, green, blue) {
    return [red / 255, green / 255, blue / 255];
}

export function normalizeMultilineText(value, maxLines) {
    return sanitizePdfCompatibleText(value)
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .slice(0, maxLines)
        .map((line) => line.trim())
        .filter((line, index, lines) => line.length > 0 || lines.slice(index + 1).some(Boolean))
        .join('\n');
}

// The PDF fonts carry printable ASCII only, so typographic characters are
// folded to ASCII and anything else is dropped.
export function sanitizePdfCompatibleText(value) {
    return value
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, '\'')
        .replace(/[–—]/g, '-')
        .replace(/…/g, '...')
        .replace(/ /g, ' ')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\x20-\x7E\n\r]/g, '');
}
