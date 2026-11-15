// SVG chart for the carnosine band. Drawn with DOM calls and classes only, so
// it runs under a strict CSP. The tooltip is built from text nodes and links.

const NS = 'http://www.w3.org/2000/svg';
// Drawn at the container's own width so text stays at its stated size on a phone.
let W = 900;
let H = 380;
const M = { left: 58, right: 18, top: 18, bottom: 44 };

function el(name, attrs = {}, parent = null) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    if (parent) parent.appendChild(node);
    return node;
}

function niceStep(span, target) {
    const raw = span / Math.max(1, target);
    const mag = 10 ** Math.floor(Math.log10(raw));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag;
    return 10 * mag;
}

/**
 * Draw the chart. model: { band, view, toView(rise), normal (rise), horizon,
 * phases [{ startDay, label }], paperLines [{ values, className, dashed }] }.
 * Returns the scale so the controller can map a pointer to a day.
 */
export function drawChart(svg, model) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const width = svg.parentElement ? svg.parentElement.clientWidth : 0;
    W = Math.round(Math.max(300, Math.min(1100, width || 900)));
    H = W < 600 ? 300 : 380;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const { band, toView, horizon } = model;
    const last = band.lastDay;
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;
    const lines = model.paperLines || [];

    let yMax = toView(model.normal);
    for (let d = 0; d <= last; d++) yMax = Math.max(yMax, toView(band.p90[d]));
    for (const line of lines) for (let d = 0; d <= last; d++) yMax = Math.max(yMax, toView(line.values[d]));
    const yMin = 0;
    const yStep = niceStep(yMax - yMin, W < 600 ? 4 : 5);
    yMax = Math.ceil((yMax * 1.05) / yStep) * yStep || yStep;

    const x = (day) => M.left + (day / last) * plotW;
    const y = (v) => M.top + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

    const defs = el('defs', {}, svg);
    const pattern = el('pattern', { id: 'baHatch', width: 8, height: 8, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 8, class: 'hatch-line' }, pattern);

    // Grid and axes.
    const grid = el('g', { class: 'grid' }, svg);
    const axis = el('g', { class: 'axis' }, svg);
    for (let v = yMin; v <= yMax + 1e-9; v += yStep) {
        el('line', { x1: M.left, x2: W - M.right, y1: y(v), y2: y(v) }, grid);
        const t = el('text', { x: M.left - 8, y: y(v) + 4, 'text-anchor': 'end' }, axis);
        t.textContent = Number(v.toFixed(2)).toString();
    }
    const weeks = last / 7;
    const perTick = W < 600 ? 8 : 16;
    const wStep = [1, 2, 4, 8, 13, 26].find((step) => weeks / step <= perTick) || 52;
    for (let w = 0; w * 7 <= last; w += wStep) {
        el('line', { x1: x(w * 7), x2: x(w * 7), y1: M.top + plotH, y2: M.top + plotH + 5 }, axis);
        const t = el('text', { x: x(w * 7), y: M.top + plotH + 18, 'text-anchor': 'middle' }, axis);
        t.textContent = String(w);
    }
    const xt = el('text', { x: M.left + plotW / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis-title' }, svg);
    xt.textContent = 'Weeks from the first dose';
    const yt = el('text', { x: 14, y: M.top + plotH / 2, 'text-anchor': 'middle', class: 'axis-title', transform: `rotate(-90 14 ${M.top + plotH / 2})` }, svg);
    yt.textContent = model.yTitle || '';

    // Normal month-to-month variation, around baseline.
    const stripLow = model.view === 'total' ? toView(-model.normal) : yMin;
    el('rect', { class: 'normal-strip', x: M.left, width: plotW, y: y(toView(model.normal)), height: Math.max(0, y(stripLow) - y(toView(model.normal))) }, svg);

    // Uncovered stretches: hatched background, lighter band.
    const uncovered = [];
    if (horizon.loadingCoveredUntil < horizon.supplementDays) uncovered.push([horizon.loadingCoveredUntil, horizon.supplementDays]);
    if (horizon.washoutCoveredUntil < last) uncovered.push([Math.max(horizon.washoutCoveredUntil, horizon.supplementDays), last]);
    for (const [a, b] of uncovered) {
        el('rect', { class: 'beyond', x: x(a), width: Math.max(0, x(b) - x(a)), y: M.top, height: plotH, fill: 'url(#baHatch)', 'fill-opacity': 0.35 }, svg);
    }
    const isUncovered = (d) => uncovered.some(([a, b]) => d > a && d <= b);

    // Band in runs of covered and uncovered days; day k belongs to the interval (k-1, k].
    const runs = [];
    for (let k = 1; k <= last; k++) {
        const shaded = isUncovered(k);
        const run = runs[runs.length - 1];
        if (run && run.shaded === shaded) run.to = k;
        else runs.push({ from: k - 1, to: k, shaded });
    }
    const pt = (k, series) => `${x(k).toFixed(1)},${y(toView(series[k])).toFixed(1)}`;
    for (const run of runs) {
        const days = Array.from({ length: run.to - run.from + 1 }, (_, i) => run.from + i);
        const outline = days.map((k) => pt(k, band.p90)).concat(days.slice().reverse().map((k) => pt(k, band.p10)));
        el('polygon', { class: run.shaded ? 'band band-shaded' : 'band', points: outline.join(' ') }, svg);
        el('polyline', { class: run.shaded ? 'median median-shaded' : 'median', points: days.map((k) => pt(k, band.p50)).join(' ') }, svg);
    }

    for (const line of lines) {
        el('polyline', {
            class: `paper-line ${line.className}`,
            'stroke-dasharray': line.dashed ? '5 3' : 'none',
            points: Array.from({ length: last + 1 }, (_, d) => `${x(d).toFixed(1)},${y(toView(line.values[d])).toFixed(1)}`).join(' ')
        }, svg);
    }

    // Labels need about 64 units of room; a crowded boundary keeps its line only.
    let lastLabelX = -Infinity;
    for (const p of model.phases) {
        if (p.startDay <= 0 || p.startDay >= last) continue;
        el('line', { class: 'phase-line', x1: x(p.startDay), x2: x(p.startDay), y1: M.top, y2: M.top + plotH }, svg);
        const next = model.phases.find((q) => q.startDay > p.startDay);
        const room = (next ? x(next.startDay) : W - M.right) - x(p.startDay);
        if (x(p.startDay) - lastLabelX < 64 || (room < 64 && p.label !== 'Stop')) continue;
        const t = el('text', { class: 'phase-label', x: x(p.startDay) + 4, y: M.top + 12 }, svg);
        t.textContent = p.label;
        lastLabelX = x(p.startDay);
    }

    for (const pt of model.points || []) {
        if (pt.day < 0 || pt.day > last) continue;
        const c = el('circle', { class: 'obs-point', cx: x(pt.day), cy: y(toView(pt.rise)), r: 5 }, svg);
        const title = el('title', {}, c);
        title.textContent = pt.label;
    }

    const cursor = el('line', { class: 'cursor', x1: 0, x2: 0, y1: M.top, y2: M.top + plotH, visibility: 'hidden' }, svg);
    return {
        dayAt(clientX) {
            const box = svg.getBoundingClientRect();
            const vx = ((clientX - box.left) / box.width) * W;
            return Math.max(0, Math.min(last, Math.round(((vx - M.left) / plotW) * last)));
        },
        showCursor(day) {
            cursor.setAttribute('x1', x(day));
            cursor.setAttribute('x2', x(day));
            cursor.setAttribute('visibility', 'visible');
        },
        hideCursor() {
            cursor.setAttribute('visibility', 'hidden');
        },
        // Fraction across the plot, for placing the tooltip.
        fractionAt(day) {
            return x(day) / W;
        }
    };
}
