import { escapeHtml, phaseClass } from './html.js';
import { interpolateSaturation } from './tables.js';
import {
    formatNumber,
    propertyFromSI,
    unitLabel
} from './units.js';

const WIDTH = 420;
const TS_HEIGHT = 280;
const HS_HEIGHT = 280;
const PV_HEIGHT = 250;
const PT_HEIGHT = 230;
const TS_MARGIN = { top: 18, right: 14, bottom: 46, left: 58 };
const HS_MARGIN = { top: 18, right: 14, bottom: 46, left: 58 };
const PV_MARGIN = { top: 18, right: 14, bottom: 46, left: 62 };
const PT_MARGIN = { top: 18, right: 14, bottom: 46, left: 62 };
const REPRESENTATIVE_PRESSURES_MPA = [0.1, 1, 10, 25];
// The combined table runs to 2000 deg C and 1000 MPa. Uncapped, isobar tails
// and isotherm liquid branches stretch the chart domains so far that the
// saturation dome collapses into a corner. These caps keep the textbook
// framing; markers can still extend the domain when a state needs it.
const CHART_MAX_ISOBAR_T_C = 800;
const CHART_MAX_ISOTHERM_P_MPA = 100;
// Representative isotherms for the P-v diagram. Subcritical curves get a
// horizontal segment inside the dome at P = Psat(T); the critical isotherm
// passes through CP with a horizontal tangent there (rendered dashed); a
// single supercritical isotherm shows the smooth supercritical curve.
const REPRESENTATIVE_ISOTHERMS_C = [
    { T: 50, kind: 'sub' },
    { T: 100, kind: 'sub' },
    { T: 200, kind: 'sub' },
    { T: 300, kind: 'sub' },
    { T: 373.946, kind: 'crit' },
    { T: 500, kind: 'super' }
];

const DEFAULT_OVERLAYS = {
    dome: true,
    isobars: true,
    isobarCount: 4,
    markers: true,
    qualityLines: true,
    isotherms: true,
    critPoint: true,
    triplePoint: true,
    grid: true,
    phaseLabels: true
};

export function renderChartsPanel(container, engine, currentResult, pinnedStateA, pinnedStateB, units, overlays) {
    if (!container) {
        return;
    }

    if (!engine?.tables?.satT?.rows?.length) {
        container.innerHTML = '<div class="empty-state">Load tables and compute a state to draw charts.</div>';
        return;
    }

    const opts = { ...DEFAULT_OVERLAYS, ...(overlays || {}) };
    const satRows = engine.tables.satT.rows.filter((row) => !row.incomplete && Number.isFinite(row.T) && Number.isFinite(row.P));
    const allIsobars = representativeIsobars(engine.tables.blocks || []);
    const isobars = opts.isobars ? allIsobars.slice(0, opts.isobarCount) : [];
    const markers = opts.markers ? collectMarkers(currentResult, pinnedStateA, pinnedStateB) : [];
    // Phase-region tinting needs CP even when the CP glyph is toggled off.
    const cpForRegions = pickCriticalPoint(satRows, engine);
    const cp = opts.critPoint ? cpForRegions : null;
    const tp = opts.triplePoint ? pickTriplePoint(satRows) : null;

    // Boundary curves for the phase-region tints: the P = Pc isobar splits
    // superheated vapor from supercritical fluid on T-s / h-s, and the T = Tc
    // isotherm splits compressed liquid from supercritical fluid on P-v.
    if (opts.phaseLabels) {
        opts.regionCp = cpForRegions;
        opts.critIsobarPoints = criticalIsobarPoints(engine, CHART_MAX_ISOBAR_T_C);
        // Only the P >= Pc portion of the critical isotherm is a region
        // boundary; its subcritical vapor tail runs down the dome and would
        // drag the polygon with it.
        opts.critIsothermPoints = (representativeIsotherms(engine.tables.blocks || [], engine.tables.satT, engine.tables.tCrit)
            .find((curve) => curve.kind === 'crit')?.points || [])
            .filter((point) => Number.isFinite(point.P) && point.P >= (engine.tables.pCrit || 0));
    }

    container.innerHTML = `
        ${renderOverlayControls(opts)}
        <div class="chart-stack">
            ${renderTemperatureEntropyChart(satRows, isobars, markers, engine, units, opts, cp, tp)}
            ${renderMollierChart(satRows, isobars, markers, units, opts, cp, tp)}
            ${renderPressureVolumeChart(satRows, markers, units, opts, cp, tp, engine)}
            ${renderPressureTemperatureChart(satRows, markers, units, opts, cp, tp)}
        </div>
        <div class="chart-stack-footnote" role="note">
            Charts cover liquid, vapor, and supercritical regions from the loaded IAPWS-IF97 tables. Isobars are drawn to ${CHART_MAX_ISOBAR_T_C} deg C and isotherms to ${CHART_MAX_ISOTHERM_P_MPA} MPa to keep the dome readable. Region tints follow the saturation curves, the P = Pc isobar, and the T = Tc isotherm from the tables; on the h-s chart the supercritical boundary below h_crit is approximate. The solid phase, fusion line, and sublimation line are not included; the gray band on the P-T chart marks where solid would live but cannot be evaluated.
        </div>
    `;
}

const QUALITY_LEVELS = [0.1, 0.25, 0.5, 0.75, 0.9];

function buildQualityCurves(satRows, yKey, units) {
    // Each curve traces constant x across temperature rows.
    // At row of fixed T: s(x) = sf + x*(sg - sf); h(x) = hf + x*(hg - hf).
    const rows = satRows.filter((row) => Number.isFinite(row.sf) && Number.isFinite(row.sg));
    return QUALITY_LEVELS.map((q) => {
        const raw = rows.map((row) => {
            const sVal = row.sf + q * (row.sg - row.sf);
            let yVal;
            if (yKey === 'T') {
                yVal = row.T;
            } else if (yKey === 'h') {
                if (!Number.isFinite(row.hf) || !Number.isFinite(row.hg)) {
                    return null;
                }
                yVal = row.hf + q * (row.hg - row.hf);
            } else {
                return null;
            }
            return Number.isFinite(sVal) && Number.isFinite(yVal) ? { x: sVal, y: yVal, row } : null;
        }).filter(Boolean);
        return {
            quality: q,
            points: convertSeries(raw, 's', yKey, units)
        };
    }).filter((curve) => curve.points.length >= 2);
}

function renderQualityCurves(curves, scaleX, scaleY) {
    return curves.map((curve) => `
        <g class="chart-quality-curve" data-chart-id="quality-curve-${curve.quality}" data-chart-title="x = ${curve.quality}" data-chart-detail-text="${escapeHtml(`Constant-quality curve at x = ${curve.quality}`)}" aria-label="${escapeHtml(`Constant-quality curve at x = ${curve.quality}`)}">
            <path d="${pathFromDisplayPoints(curve.points, scaleX, scaleY)}"></path>
            ${renderQualityLabel(curve, scaleX, scaleY)}
        </g>
    `).join('');
}

function renderQualityLabel(curve, scaleX, scaleY) {
    // Anchor each label at the LOWEST point of its curve. Quality curves all
    // converge near the critical point at the top of the dome; labelling
    // there piles every label on top of CP. The bottom of each curve (low T)
    // is where they're maximally spread out and there's open space.
    const bottom = curve.points.reduce((best, point) => (!best || point.dy < best.dy ? point : best), null);
    if (!bottom) {
        return '';
    }
    const x = scaleX(bottom.dx);
    const y = scaleY(bottom.dy);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return '';
    }
    return `<text class="chart-quality-label" x="${round(x + 4)}" y="${round(y + 10)}">x=${curve.quality}</text>`;
}

// Region tint colors: one place to change if we ever rebrand the palette.
// Keep alphas low (≤ 0.12) so the dome line, isobars, curves, and markers
// remain the visually dominant elements.
// Region tint colors. The "saturated" entry intentionally matches the
// existing .chart-dome-fill rule (rgba(34,197,94,0.08)): we don't paint
// our own dome polygon, we let chart-dome-fill provide the tint and the
// key swatch reflects the same color.
const PHASE_COLORS = {
    // Deep blue, well-separated from both the cyan saturated-liquid dome
    // stroke and the green dome interior tint.
    compressedLiquid: 'rgba(59, 130, 246, 0.12)',
    saturated: 'rgba(34, 197, 94, 0.08)',
    superheatedVapor: 'rgba(245, 158, 11, 0.10)',
    supercritical: 'rgba(244, 63, 94, 0.10)',
    liquid: 'rgba(59, 130, 246, 0.12)',
    vapor: 'rgba(245, 158, 11, 0.10)',
    // Marker for the conceptual solid region on P-T. The IAPWS-IF97 tables
    // we load are liquid-vapor only, so this is purely a "where solid would
    // live" indicator; the engine cannot evaluate states here. Slightly
    // higher alpha than the data-backed regions so it doesn't disappear in
    // the narrow strip below T_TP, but still subdued.
    solidNoData: 'rgba(148, 163, 184, 0.20)'
};

function renderPhaseRegions(chartType, satRows, scaleX, scaleY, margin, height, cp, units, boundary = null) {
    if (!cp) {
        return '';
    }
    const x0 = margin.left;
    const x1 = WIDTH - margin.right;
    const y0 = margin.top;
    const y1 = height - margin.bottom;
    const clampX = (value) => Math.min(Math.max(value, x0), x1);
    const clampY = (value) => Math.min(Math.max(value, y0), y1);
    // Boundary curve in clamped pixel coords, sorted top-of-plot last.
    const boundaryPx = (boundary || [])
        .map((point) => ({ px: clampX(scaleX(point.dx)), py: clampY(scaleY(point.dy)) }))
        .filter((point) => Number.isFinite(point.px) && Number.isFinite(point.py))
        .sort((a, b) => b.py - a.py);
    const boundaryLineTo = (points) => points.map((point) => `L ${round(point.px)} ${round(point.py)}`).join(' ');

    if (chartType === 'ts' || chartType === 'hs' || chartType === 'pv') {
        const xKey = chartType === 'pv' ? 'v' : 's';
        const yKey = chartType === 'ts' ? 'T' : (chartType === 'hs' ? 'h' : 'P');
        const liquid = convertSeries(satRows.map((row) => ({
            x: chartType === 'pv' ? row.vf : row.sf,
            y: chartType === 'ts' ? row.T : (chartType === 'hs' ? row.hf : row.P)
        })), xKey, yKey, units);
        const vapor = convertSeries(satRows.map((row) => ({
            x: chartType === 'pv' ? row.vg : row.sg,
            y: chartType === 'ts' ? row.T : (chartType === 'hs' ? row.hg : row.P)
        })), xKey, yKey, units);
        if (!liquid.length || !vapor.length) {
            return '';
        }
        const cpX = scaleX(displayValue(xKey, cp[xKey], units));
        const cpY = scaleY(displayValue(yKey, cp[yKey], units));
        if (!Number.isFinite(cpX) || !Number.isFinite(cpY)) {
            return '';
        }

        // Pixel coords everywhere: y0 = top of plot, y1 = bottom.
        const vaporPath = pathFromDisplayPoints(vapor, scaleX, scaleY);
        const hasBoundary = boundaryPx.length >= 2;
        const boundaryTopY = hasBoundary ? boundaryPx[boundaryPx.length - 1].py : y0;

        let compressedLiquidPath;
        let superheatedPath;
        let supercriticalPath;

        if ((chartType === 'ts' || chartType === 'hs') && hasBoundary) {
            // Supercritical fluid sits LEFT of the P = Pc isobar for T > Tc
            // (higher pressure means lower entropy at fixed temperature).
            // Superheated vapor is right of the sat-vapor curve below CP and
            // right of the Pc isobar above it.
            compressedLiquidPath = `
                M ${x0} ${y1}
                L ${x0} ${round(cpY)}
                L ${round(cpX)} ${round(cpY)}
                ${reversedLineTo(liquid, scaleX, scaleY)}
                Z
            `;
            superheatedPath = `
                ${vaporPath}
                L ${round(cpX)} ${round(cpY)}
                ${boundaryLineTo(boundaryPx)}
                L ${x1} ${round(boundaryTopY)}
                L ${x1} ${y1}
                L ${round(scaleX(vapor[0].dx))} ${y1}
                Z
            `;
            supercriticalPath = `
                M ${round(cpX)} ${round(cpY)}
                ${boundaryLineTo(boundaryPx)}
                L ${x0} ${round(boundaryTopY)}
                L ${x0} ${round(cpY)}
                Z
            `;
        } else if (chartType === 'pv' && hasBoundary) {
            // On P-v the T = Tc isotherm splits the P > Pc band: liquid-like
            // states (T < Tc) sit left of it, supercritical fluid right of it.
            compressedLiquidPath = `
                M ${x0} ${y1}
                L ${x0} ${round(boundaryTopY)}
                ${boundaryLineTo(boundaryPx.slice().reverse())}
                ${reversedLineTo(liquid, scaleX, scaleY)}
                Z
            `;
            superheatedPath = `
                ${vaporPath}
                L ${round(cpX)} ${round(cpY)}
                L ${x1} ${round(cpY)}
                L ${x1} ${y1}
                L ${round(scaleX(vapor[0].dx))} ${y1}
                Z
            `;
            supercriticalPath = `
                M ${round(cpX)} ${round(cpY)}
                ${boundaryLineTo(boundaryPx)}
                L ${x1} ${round(boundaryTopY)}
                L ${x1} ${round(cpY)}
                Z
            `;
        } else {
            // Fallback when no boundary curve is available: approximate the
            // supercritical region as the band above CP.
            compressedLiquidPath = `
                M ${x0} ${y1}
                L ${x0} ${round(cpY)}
                L ${round(cpX)} ${round(cpY)}
                ${reversedLineTo(liquid, scaleX, scaleY)}
                Z
            `;
            superheatedPath = `
                ${vaporPath}
                L ${round(cpX)} ${round(cpY)}
                L ${x1} ${round(cpY)}
                L ${x1} ${y1}
                L ${round(scaleX(vapor[0].dx))} ${y1}
                Z
            `;
            supercriticalPath = `
                M ${x0} ${y0}
                L ${x1} ${y0}
                L ${x1} ${round(cpY)}
                L ${x0} ${round(cpY)}
                Z
            `;
        }

        // No saturated polygon here: the chart-dome-fill rendered right after
        // this group already tints the dome interior with the same color.

        return `
            <g class="chart-phase-regions" pointer-events="none">
                <path d="${compressedLiquidPath.replace(/\s+/g, ' ')}" fill="${PHASE_COLORS.compressedLiquid}"></path>
                <path d="${superheatedPath.replace(/\s+/g, ' ')}" fill="${PHASE_COLORS.superheatedVapor}"></path>
                <path d="${supercriticalPath.replace(/\s+/g, ' ')}" fill="${PHASE_COLORS.supercritical}"></path>
            </g>
        `;
    }

    if (chartType === 'pt') {
        const curve = convertSeries(satRows.map((row) => ({ x: row.T, y: row.P })), 'T', 'P', units);
        if (!curve.length) {
            return '';
        }
        const cpX = scaleX(displayValue('T', cp.T, units));
        const cpY = scaleY(displayValue('P', cp.P, units));
        if (!Number.isFinite(cpX) || !Number.isFinite(cpY)) {
            return '';
        }
        const curvePath = pathFromDisplayPoints(curve, scaleX, scaleY);
        const tpX = scaleX(curve[0].dx);

        // Solid (no data): T < T_TP. Conceptual region only; the dataset
        // doesn't cover solid water, so we paint a faint gray tint without
        // any boundary lines (fusion / sublimation are unmodelled).
        const solidPath = `
            M ${x0} ${y0}
            L ${round(tpX)} ${y0}
            L ${round(tpX)} ${y1}
            L ${x0} ${y1}
            Z
        `.replace(/\s+/g, ' ');

        // Liquid: above the saturation curve, T_TP < T < Tc.
        const liquidPath = `
            M ${round(tpX)} ${y0}
            L ${round(cpX)} ${y0}
            L ${round(cpX)} ${round(cpY)}
            ${reversedLineTo(curve, scaleX, scaleY)}
            L ${round(tpX)} ${y1}
            L ${round(tpX)} ${y0}
            Z
        `.replace(/\s+/g, ' ');

        // Vapor: below the saturation curve for T < Tc, plus the T > Tc band
        // below P = Pc (gas at subcritical pressure, conventionally still
        // shown as vapor rather than supercritical fluid).
        const vaporPath = `
            ${curvePath}
            L ${round(cpX)} ${y1}
            L ${round(tpX)} ${y1}
            L ${round(scaleX(curve[0].dx))} ${y1}
            Z
            M ${round(cpX)} ${round(cpY)}
            L ${x1} ${round(cpY)}
            L ${x1} ${y1}
            L ${round(cpX)} ${y1}
            Z
        `.replace(/\s+/g, ' ');

        // Supercritical fluid: T > Tc AND P > Pc quadrant only.
        const supercriticalPath = `
            M ${round(cpX)} ${y0}
            L ${x1} ${y0}
            L ${x1} ${round(cpY)}
            L ${round(cpX)} ${round(cpY)}
            Z
        `.replace(/\s+/g, ' ');

        return `
            <g class="chart-phase-regions" pointer-events="none">
                <path d="${solidPath}" fill="${PHASE_COLORS.solidNoData}"></path>
                <path d="${liquidPath}" fill="${PHASE_COLORS.liquid}"></path>
                <path d="${vaporPath}" fill="${PHASE_COLORS.vapor}"></path>
                <path d="${supercriticalPath}" fill="${PHASE_COLORS.supercritical}"></path>
            </g>
        `;
    }

    return '';
}

function reversedLineTo(points, scaleX, scaleY) {
    return points.slice().reverse().map((point) => `L ${round(scaleX(point.dx))} ${round(scaleY(point.dy))}`).join(' ');
}

function renderPhaseKey(chartType) {
    // Each chart type uses a slightly different region set; only show keys
    // for regions actually painted on that chart.
    const items = chartType === 'pt'
        ? [
            { key: 'solidNoData', label: 'Solid (no data)' },
            { key: 'liquid', label: 'Liquid' },
            { key: 'vapor', label: 'Vapor' },
            { key: 'supercritical', label: 'Supercritical Fluid' }
          ]
        : [
            { key: 'compressedLiquid', label: 'Compressed Liquid' },
            { key: 'saturated', label: 'Saturated' },
            { key: 'superheatedVapor', label: 'Superheated Vapor' },
            { key: 'supercritical', label: 'Supercritical Fluid' }
          ];
    return `
        <div class="chart-phase-key" aria-label="Phase region color key">
            ${items.map((item) => `
                <span class="chart-phase-key-item">
                    <span class="chart-phase-key-swatch ${escapeHtml(item.key)}"></span>
                    ${escapeHtml(item.label)}
                </span>
            `).join('')}
        </div>
    `;
}

function pickCriticalPoint(satRows, engine) {
    if (!satRows.length) {
        return null;
    }
    const last = satRows[satRows.length - 1];
    const avg = (a, b) => (Number.isFinite(a) && Number.isFinite(b)) ? (a + b) / 2 : (Number.isFinite(a) ? a : b);
    return {
        T: engine.tables.tCrit,
        P: engine.tables.pCrit,
        s: avg(last.sf, last.sg),
        h: avg(last.hf, last.hg),
        v: avg(last.vf, last.vg)
    };
}

function pickTriplePoint(satRows) {
    if (!satRows.length) {
        return null;
    }
    const first = satRows[0];
    return {
        T: first.T,
        P: first.P,
        // For T-s / h-s / P-v projections we anchor at the saturated-liquid
        // branch at the lowest tabulated T; that's the bottom-left corner of
        // the dome on s-T, s-h, and v-P axes.
        s: first.sf,
        h: first.hf,
        v: first.vf
    };
}

function renderCriticalPointGlyph(cp, xKey, yKey, scaleX, scaleY, units, labelOffset = { dx: 10, dy: -4 }) {
    if (!cp) {
        return '';
    }
    const dx = displayValue(xKey, cp[xKey], units);
    const dy = displayValue(yKey, cp[yKey], units);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return '';
    }
    const x = scaleX(dx);
    const y = scaleY(dy);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return '';
    }
    const detail = `Critical point | T=${formatDisplay('T', cp.T, units)}, P=${formatDisplay('P', cp.P, units)}`;
    return `
        <g class="chart-cp-glyph" tabindex="0" role="button" data-chart-id="critical-point-${escapeHtml(xKey)}-${escapeHtml(yKey)}" data-chart-title="Critical point" data-chart-detail-text="${escapeHtml(detail)}" aria-label="${escapeHtml(detail)}">
            <rect class="chart-cp-diamond" x="${round(x - 5)}" y="${round(y - 5)}" width="10" height="10" transform="rotate(45 ${round(x)} ${round(y)})"></rect>
            <text class="chart-cp-label" x="${round(x + labelOffset.dx)}" y="${round(y + labelOffset.dy)}">CP</text>
            <title>${escapeHtml(detail)}</title>
        </g>
    `;
}

function renderTriplePointGlyph(tp, xKey, yKey, scaleX, scaleY, units, labelOffset = { dx: 10, dy: -8 }) {
    if (!tp) {
        return '';
    }
    const dx = displayValue(xKey, tp[xKey], units);
    const dy = displayValue(yKey, tp[yKey], units);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return '';
    }
    const x = scaleX(dx);
    const y = scaleY(dy);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return '';
    }
    const detail = `Triple point | T=${formatDisplay('T', tp.T, units)}, P=${formatDisplay('P', tp.P, units)}`;
    return `
        <g class="chart-tp-glyph" tabindex="0" role="button" data-chart-id="triple-point-${escapeHtml(xKey)}-${escapeHtml(yKey)}" data-chart-title="Triple point" data-chart-detail-text="${escapeHtml(detail)}" aria-label="${escapeHtml(detail)}">
            <circle cx="${round(x)}" cy="${round(y)}" r="5"></circle>
            <text class="chart-tp-label" x="${round(x + labelOffset.dx)}" y="${round(y + labelOffset.dy)}">TP</text>
            <title>${escapeHtml(detail)}</title>
        </g>
    `;
}

function renderOverlayControls(opts) {
    const toggle = (key, label) => `
        <label class="chart-overlay-toggle">
            <input type="checkbox" data-overlay-key="${key}" ${opts[key] ? 'checked' : ''}>
            <span>${escapeHtml(label)}</span>
        </label>
    `;
    const isobarBtn = (n) => `
        <button type="button" class="chart-isobar-count ${opts.isobarCount === n ? 'active' : ''}" data-isobar-count="${n}" aria-pressed="${opts.isobarCount === n}">${n}</button>
    `;
    return `
        <div class="chart-overlay-controls" role="group" aria-label="Chart overlays">
            <div class="chart-overlay-group">
                <span class="chart-overlay-label">Overlays</span>
                ${toggle('dome', 'Saturation dome')}
                ${toggle('isobars', 'Isobars')}
                ${toggle('isotherms', 'Isotherms')}
                ${toggle('qualityLines', 'Quality lines')}
                ${toggle('markers', 'State markers')}
                ${toggle('critPoint', 'Critical point')}
                ${toggle('triplePoint', 'Triple point')}
                ${toggle('phaseLabels', 'Phase regions')}
                ${toggle('grid', 'Grid')}
            </div>
            <div class="chart-overlay-group chart-isobar-count-group" aria-label="Isobar count">
                <span class="chart-overlay-label">Isobars</span>
                ${isobarBtn(2)}
                ${isobarBtn(3)}
                ${isobarBtn(4)}
            </div>
        </div>
    `;
}

function renderTemperatureEntropyChart(satRows, isobars, markers, engine, units, opts, cp, tp) {
    const liquid = convertSeries(satRows.map((row) => ({ x: row.sf, y: row.T, row })), 's', 'T', units);
    const vapor = convertSeries(satRows.map((row) => ({ x: row.sg, y: row.T, row })), 's', 'T', units);
    const isobarSeries = isobars.map((isobar) => ({
        ...isobar,
        id: isobarId(isobar),
        className: `isobar-${isobar.index}`,
        label: `${formatDisplay('P', isobar.P, units)} isobar`,
        points: convertSeries(isobar.rows.map((row) => ({ x: row.s, y: row.T, row })), 's', 'T', units)
    })).filter((series) => series.points.length >= 2);
    const markerPoints = convertMarkerPoints(markersForChart(markers, 's', 'T', {
        xKey: 's',
        yKey: 'T',
        endpoints: { xF: 'sf', yF: 'T', xG: 'sg', yG: 'T' }
    }), units);
    const qualityLines = markers
        .map((marker) => qualityLine(marker.values, engine))
        .filter(Boolean)
        .map((line) => convertLine(line, 's', 'T', units));
    const qualityCurves = opts.qualityLines ? buildQualityCurves(satRows, 'T', units) : [];

    if (!liquid.length || !vapor.length) {
        return '<div class="empty-state">Saturation entropy data is unavailable.</div>';
    }

    const domainX = paddedDomain(domainValues([liquid, vapor, markerPoints, ...isobarSeries.map((series) => series.points)], 'dx'));
    const domainY = paddedDomain(domainValues([liquid, vapor, markerPoints, ...isobarSeries.map((series) => series.points)], 'dy'));
    const scaleX = linearScale(domainX, TS_MARGIN.left, WIDTH - TS_MARGIN.right);
    const scaleY = linearScale(domainY, TS_HEIGHT - TS_MARGIN.bottom, TS_MARGIN.top);

    return `
        <div class="chart-block">
            <div class="chart-header">
                <strong>T-s Context</strong>
            </div>
            <svg class="steam-chart" viewBox="0 0 ${WIDTH} ${TS_HEIGHT}" role="img" aria-labelledby="ts-chart-title ts-chart-desc">
                <title id="ts-chart-title">T-s context chart</title>
                <desc id="ts-chart-desc">Saturation dome, representative combined-table isobars, and current or pinned state markers.</desc>
                ${opts.grid ? renderLinearGrid(domainX, scaleX, domainY, scaleY, TS_MARGIN, TS_HEIGHT) : renderAxesOnly(TS_MARGIN, TS_HEIGHT)}
                ${opts.phaseLabels ? renderPhaseRegions('ts', satRows, scaleX, scaleY, TS_MARGIN, TS_HEIGHT, opts.regionCp || cp, units, convertSeries((opts.critIsobarPoints || []).map((point) => ({ x: point.s, y: point.T })), 's', 'T', units)) : ''}
                ${opts.dome ? `<path class="chart-dome-fill" d="${domeFillPath(liquid, vapor, scaleX, scaleY)}"></path>` : ''}
                ${opts.isobars ? renderIsobarLines(isobarSeries, scaleX, scaleY, units) : ''}
                ${opts.qualityLines ? renderQualityCurves(qualityCurves, scaleX, scaleY) : ''}
                ${opts.qualityLines ? qualityLines.map((line) => renderQualityLine(line, scaleX, scaleY)).join('') : ''}
                ${opts.dome ? `<path class="chart-dome-line liquid" d="${pathFromDisplayPoints(liquid, scaleX, scaleY)}"></path>` : ''}
                ${opts.dome ? `<path class="chart-dome-line vapor" d="${pathFromDisplayPoints(vapor, scaleX, scaleY)}"></path>` : ''}
                ${opts.isobars ? renderSeriesPoints(isobarSeries, scaleX, scaleY, units) : ''}
                ${opts.triplePoint ? renderTriplePointGlyph(tp, 's', 'T', scaleX, scaleY, units, { dx: 10, dy: 14 }) : ''}
                ${opts.critPoint ? renderCriticalPointGlyph(cp, 's', 'T', scaleX, scaleY, units) : ''}
                ${opts.markers ? markerPoints.map((marker) => renderPoint(marker, scaleX, scaleY, units)).join('') : ''}
                ${renderAxisLabels('Entropy', unitLabel('s', units), 'Temperature', unitLabel('T', units), TS_HEIGHT)}
            </svg>
            ${opts.phaseLabels ? renderPhaseKey('ts') : ''}
            ${opts.markers ? renderLegend(markerPoints, units) : ''}
            ${opts.isobars ? renderIsobarLegend(isobarSeries, units) : ''}
            ${renderChartDetail()}
        </div>
    `;
}

function renderMollierChart(satRows, isobars, markers, units, opts, cp, tp) {
    const liquid = convertSeries(satRows.map((row) => ({ x: row.sf, y: row.hf, row })), 's', 'h', units);
    const vapor = convertSeries(satRows.map((row) => ({ x: row.sg, y: row.hg, row })), 's', 'h', units);
    const isobarSeries = isobars.map((isobar) => ({
        ...isobar,
        id: isobarId(isobar),
        className: `isobar-${isobar.index}`,
        label: `${formatDisplay('P', isobar.P, units)} isobar`,
        points: convertSeries(isobar.rows.map((row) => ({ x: row.s, y: row.h, row })), 's', 'h', units)
    })).filter((series) => series.points.length >= 2);
    const markerPoints = convertMarkerPoints(markersForChart(markers, 's', 'h', {
        xKey: 's',
        yKey: 'h',
        endpoints: { xF: 'sf', yF: 'hf', xG: 'sg', yG: 'hg' }
    }), units);
    const qualityCurves = opts.qualityLines ? buildQualityCurves(satRows, 'h', units) : [];

    if (!liquid.length || !vapor.length) {
        return '<div class="empty-state">Mollier data is unavailable.</div>';
    }

    const domainX = paddedDomain(domainValues([liquid, vapor, markerPoints, ...isobarSeries.map((series) => series.points)], 'dx'));
    const domainY = paddedDomain(domainValues([liquid, vapor, markerPoints, ...isobarSeries.map((series) => series.points)], 'dy'));
    const scaleX = linearScale(domainX, HS_MARGIN.left, WIDTH - HS_MARGIN.right);
    const scaleY = linearScale(domainY, HS_HEIGHT - HS_MARGIN.bottom, HS_MARGIN.top);

    return `
        <div class="chart-block">
            <div class="chart-header">
                <strong>Mollier h-s Context</strong>
            </div>
            <svg class="steam-chart" viewBox="0 0 ${WIDTH} ${HS_HEIGHT}" role="img" aria-labelledby="hs-chart-title hs-chart-desc">
                <title id="hs-chart-title">Mollier h-s context chart</title>
                <desc id="hs-chart-desc">Saturation boundary and representative combined-table isobars in enthalpy and entropy coordinates.</desc>
                ${opts.grid ? renderLinearGrid(domainX, scaleX, domainY, scaleY, HS_MARGIN, HS_HEIGHT) : renderAxesOnly(HS_MARGIN, HS_HEIGHT)}
                ${opts.phaseLabels ? renderPhaseRegions('hs', satRows, scaleX, scaleY, HS_MARGIN, HS_HEIGHT, opts.regionCp || cp, units, convertSeries((opts.critIsobarPoints || []).map((point) => ({ x: point.s, y: point.h })), 's', 'h', units)) : ''}
                ${opts.dome ? `<path class="chart-dome-fill" d="${domeFillPath(liquid, vapor, scaleX, scaleY)}"></path>` : ''}
                ${opts.isobars ? renderIsobarLines(isobarSeries, scaleX, scaleY, units) : ''}
                ${opts.qualityLines ? renderQualityCurves(qualityCurves, scaleX, scaleY) : ''}
                ${opts.dome ? `<path class="chart-dome-line liquid" d="${pathFromDisplayPoints(liquid, scaleX, scaleY)}"></path>` : ''}
                ${opts.dome ? `<path class="chart-dome-line vapor" d="${pathFromDisplayPoints(vapor, scaleX, scaleY)}"></path>` : ''}
                ${opts.isobars ? renderSeriesPoints(isobarSeries, scaleX, scaleY, units) : ''}
                ${opts.triplePoint ? renderTriplePointGlyph(tp, 's', 'h', scaleX, scaleY, units, { dx: 10, dy: 14 }) : ''}
                ${opts.critPoint ? renderCriticalPointGlyph(cp, 's', 'h', scaleX, scaleY, units) : ''}
                ${opts.markers ? markerPoints.map((marker) => renderPoint(marker, scaleX, scaleY, units)).join('') : ''}
                ${renderAxisLabels('Entropy', unitLabel('s', units), 'Enthalpy', unitLabel('h', units), HS_HEIGHT)}
            </svg>
            ${opts.phaseLabels ? renderPhaseKey('hs') : ''}
            ${opts.markers ? renderLegend(markerPoints, units) : ''}
            ${opts.isobars ? renderIsobarLegend(isobarSeries, units) : ''}
            ${renderChartDetail()}
        </div>
    `;
}

function renderPressureVolumeChart(satRows, markers, units, opts, cp, tp, engine) {
    const liquid = convertSeries(satRows.map((row) => ({ x: row.vf, y: row.P, row })), 'v', 'P', units);
    const vapor = convertSeries(satRows.map((row) => ({ x: row.vg, y: row.P, row })), 'v', 'P', units);
    const markerPoints = convertMarkerPoints(markersForChart(markers, 'v', 'P', {
        xKey: 'v',
        yKey: 'P',
        endpoints: { xF: 'vf', yF: 'P', xG: 'vg', yG: 'P' }
    }), units);
    const isothermSeries = opts.isotherms
        ? representativeIsotherms(engine?.tables?.blocks || [], engine?.tables?.satT, engine?.tables?.tCrit)
            .map((curve) => ({
                ...curve,
                id: isothermId(curve),
                className: `isotherm-${curve.index} isotherm-${curve.kind}`,
                label: `${formatDisplay('T', curve.T, units)} isotherm`,
                points: convertSeries(curve.points.map((point) => ({ x: point.v, y: point.P })), 'v', 'P', units)
            }))
            .filter((series) => series.points.length >= 2)
        : [];

    if (!liquid.length || !vapor.length) {
        return '<div class="empty-state">P-v saturation data is unavailable.</div>';
    }

    const domainX = paddedLogDomain(domainValues([liquid, vapor, markerPoints, ...isothermSeries.map((s) => s.points)], 'dx'));
    const domainY = paddedLogDomain(domainValues([liquid, vapor, markerPoints, ...isothermSeries.map((s) => s.points)], 'dy'));
    const scaleX = logScale(domainX, PV_MARGIN.left, WIDTH - PV_MARGIN.right);
    const scaleY = logScale(domainY, PV_HEIGHT - PV_MARGIN.bottom, PV_MARGIN.top);

    return `
        <div class="chart-block">
            <div class="chart-header">
                <strong>P-v Saturation Dome</strong>
                <span class="chart-header-note">log-log</span>
            </div>
            <svg class="steam-chart" viewBox="0 0 ${WIDTH} ${PV_HEIGHT}" role="img" aria-labelledby="pv-chart-title pv-chart-desc">
                <title id="pv-chart-title">P-v saturation dome</title>
                <desc id="pv-chart-desc">Saturated liquid and vapor specific-volume boundaries with constant-temperature curves and current or pinned state markers.</desc>
                ${opts.grid ? renderLogGrid(domainX, scaleX, domainY, scaleY, PV_MARGIN, PV_HEIGHT) : renderAxesOnly(PV_MARGIN, PV_HEIGHT)}
                ${opts.phaseLabels ? renderPhaseRegions('pv', satRows, scaleX, scaleY, PV_MARGIN, PV_HEIGHT, opts.regionCp || cp, units, convertSeries((opts.critIsothermPoints || []).map((point) => ({ x: point.v, y: point.P })), 'v', 'P', units)) : ''}
                ${opts.dome ? `<path class="chart-dome-fill" d="${domeFillPath(liquid, vapor, scaleX, scaleY)}"></path>` : ''}
                ${opts.isotherms ? renderIsothermLines(isothermSeries, scaleX, scaleY, units) : ''}
                ${opts.dome ? `<path class="chart-dome-line liquid" d="${pathFromDisplayPoints(liquid, scaleX, scaleY)}"></path>` : ''}
                ${opts.dome ? `<path class="chart-dome-line vapor" d="${pathFromDisplayPoints(vapor, scaleX, scaleY)}"></path>` : ''}
                ${opts.triplePoint ? renderTriplePointGlyph(tp, 'v', 'P', scaleX, scaleY, units, { dx: 10, dy: 14 }) : ''}
                ${opts.critPoint ? renderCriticalPointGlyph(cp, 'v', 'P', scaleX, scaleY, units) : ''}
                ${opts.markers ? markerPoints.map((marker) => renderPoint(marker, scaleX, scaleY, units)).join('') : ''}
                ${renderAxisLabels('Specific Volume', unitLabel('v', units), 'Pressure', unitLabel('P', units), PV_HEIGHT)}
            </svg>
            ${opts.phaseLabels ? renderPhaseKey('pv') : ''}
            ${opts.markers ? renderLegend(markerPoints, units) : ''}
            ${opts.isotherms ? renderIsothermLegend(isothermSeries, units) : ''}
            ${renderChartDetail()}
        </div>
    `;
}

function renderPressureTemperatureChart(satRows, markers, units, opts, cp, tp) {
    const curve = convertSeries(satRows.map((row) => ({ x: row.T, y: row.P, row })), 'T', 'P', units);
    const markerPoints = convertMarkerPoints(markersForChart(markers, 'T', 'P', {
        xKey: 'T',
        yKey: 'P'
    }), units);

    if (!curve.length) {
        return '<div class="empty-state">Saturation pressure data is unavailable.</div>';
    }

    const domainX = paddedDomain(domainValues([curve, markerPoints], 'dx'));
    const domainY = paddedLogDomain(domainValues([curve, markerPoints], 'dy'));
    const scaleX = linearScale(domainX, PT_MARGIN.left, WIDTH - PT_MARGIN.right);
    const scaleY = logScale(domainY, PT_HEIGHT - PT_MARGIN.bottom, PT_MARGIN.top);

    return `
        <div class="chart-block">
            <div class="chart-header">
                <strong>P-T Saturation Curve</strong>
                <span class="chart-header-note">log P</span>
            </div>
            <svg class="steam-chart" viewBox="0 0 ${WIDTH} ${PT_HEIGHT}" role="img" aria-labelledby="pt-chart-title pt-chart-desc">
                <title id="pt-chart-title">P-T saturation curve</title>
                <desc id="pt-chart-desc">Saturation pressure against temperature with current and pinned state markers.</desc>
                ${opts.grid ? renderMixedGrid(domainX, scaleX, domainY, scaleY, PT_MARGIN, PT_HEIGHT) : renderAxesOnly(PT_MARGIN, PT_HEIGHT)}
                ${opts.phaseLabels ? renderPhaseRegions('pt', satRows, scaleX, scaleY, PT_MARGIN, PT_HEIGHT, opts.regionCp || cp, units, null) : ''}
                ${opts.dome ? `<path class="chart-saturation-line" d="${pathFromDisplayPoints(curve, scaleX, scaleY)}"></path>` : ''}
                ${opts.triplePoint ? renderTriplePointGlyph(tp, 'T', 'P', scaleX, scaleY, units, { dx: 10, dy: -8 }) : ''}
                ${opts.critPoint ? renderCriticalPointGlyph(cp, 'T', 'P', scaleX, scaleY, units) : ''}
                ${opts.markers ? markerPoints.map((marker) => renderPoint(marker, scaleX, scaleY, units)).join('') : ''}
                ${renderAxisLabels('Temperature', unitLabel('T', units), 'Pressure', unitLabel('P', units), PT_HEIGHT)}
            </svg>
            ${opts.phaseLabels ? renderPhaseKey('pt') : ''}
            ${opts.markers ? renderLegend(markerPoints, units) : ''}
            ${renderChartDetail()}
        </div>
    `;
}

function collectMarkers(currentResult, pinnedStateA, pinnedStateB) {
    return [
        stateMarker('Current', currentResult, 'current'),
        stateMarker('State A', pinnedStateA?.result, 'state-a'),
        stateMarker('State B', pinnedStateB?.result, 'state-b')
    ].filter(Boolean);
}

function stateMarker(label, result, slotClass) {
    const values = result?.values || {};
    if (!Object.keys(values).length) {
        return null;
    }
    return {
        label,
        slotClass,
        phase: result.phase || 'state',
        phaseLabel: result.phaseLabel || result.phase || 'state',
        values
    };
}

function markersForChart(markers, xKind, yKind, config) {
    const output = [];
    for (const marker of markers) {
        const values = marker.values || {};
        if (Number.isFinite(values[config.xKey]) && Number.isFinite(values[config.yKey])) {
            output.push({ ...marker, x: values[config.xKey], y: values[config.yKey], xKind, yKind });
            continue;
        }
        if (!config.endpoints) {
            continue;
        }
        const first = endpointMarker(marker, values, config.endpoints.xF, config.endpoints.yF, xKind, yKind, 'sat. liquid');
        const second = endpointMarker(marker, values, config.endpoints.xG, config.endpoints.yG, xKind, yKind, 'sat. vapor');
        if (first) {
            output.push(first);
        }
        if (second) {
            output.push(second);
        }
    }
    return output;
}

function endpointMarker(marker, values, xKey, yKey, xKind, yKind, suffix) {
    if (!Number.isFinite(values[xKey]) || !Number.isFinite(values[yKey])) {
        return null;
    }
    const isLiquid = suffix === 'sat. liquid';
    return {
        ...marker,
        label: `${marker.label} (${suffix})`,
        // Override phase so the marker and its swatch pick up the proper
        // saturated-liquid (cyan) / saturated-vapor (purple) styling.
        phase: isLiquid ? 'saturated liquid' : 'saturated vapor',
        phaseLabel: isLiquid ? 'Saturated Liquid' : 'Saturated Vapor',
        phaseBadge: isLiquid ? 'f' : 'g',
        x: values[xKey],
        y: values[yKey],
        xKind,
        yKind
    };
}

function representativeIsobars(blocks) {
    const selected = [];
    const seen = new Set();
    for (const target of REPRESENTATIVE_PRESSURES_MPA) {
        const block = blocks
            .filter((candidate) => candidate?.P > 0)
            .reduce((best, candidate) => {
                const score = Math.abs(Math.log(candidate.P / target));
                return !best || score < best.score ? { block: candidate, score } : best;
            }, null)?.block;
        if (!block || seen.has(block.P)) {
            continue;
        }
        const rows = block.rows
            .filter((row) => !row.incomplete && Number.isFinite(row.T) && Number.isFinite(row.s) && Number.isFinite(row.h))
            .filter((row) => row.T <= CHART_MAX_ISOBAR_T_C)
            .sort((a, b) => a.T - b.T);
        if (rows.length < 2) {
            continue;
        }
        seen.add(block.P);
        selected.push({ index: selected.length, P: block.P, rows });
    }
    return selected;
}

// For a P-v isotherm, walk every constant-P block and interpolate v at the
// target temperature within that block (if T is in the block's range). For
// subcritical T, splice the horizontal dome segment from (vf, Psat) to
// (vg, Psat) so the curve traces the textbook flat-in-dome shape.
function representativeIsotherms(blocks, satT, tCrit) {
    if (!blocks?.length) {
        return [];
    }
    return REPRESENTATIVE_ISOTHERMS_C.map(({ T: targetT, kind }, index) => {
        let psat = null;
        let vf = null;
        let vg = null;
        if (kind === 'sub' && satT?.rows?.length) {
            const sat = interpolateSaturation(satT, targetT);
            if (Number.isFinite(sat.values.P) && Number.isFinite(sat.values.vf) && Number.isFinite(sat.values.vg)) {
                psat = sat.values.P;
                vf = sat.values.vf;
                vg = sat.values.vg;
            }
        }

        const liquidBranch = [];
        const vaporBranch = [];
        const all = [];
        for (const block of blocks) {
            if (block.P > CHART_MAX_ISOTHERM_P_MPA) {
                continue;
            }
            const v = interpolateBlockAtT(block, targetT);
            if (!Number.isFinite(v)) {
                continue;
            }
            const point = { P: block.P, v, T: targetT };
            if (kind === 'sub' && Number.isFinite(psat)) {
                if (block.P > psat * (1 + 1e-6)) {
                    liquidBranch.push(point);
                } else if (block.P < psat * (1 - 1e-6)) {
                    vaporBranch.push(point);
                }
            } else {
                all.push(point);
            }
        }

        let points;
        if (kind === 'sub' && Number.isFinite(psat)) {
            // Liquid branch: high P down to Psat (v stays near vf, slightly increasing).
            // Then horizontal dome segment vf -> vg at P = Psat.
            // Then vapor branch: just below Psat down to low P (v grows large).
            const liq = liquidBranch.sort((a, b) => b.P - a.P);
            const vap = vaporBranch.sort((a, b) => b.P - a.P);
            points = [
                ...liq,
                { P: psat, v: vf, T: targetT },
                { P: psat, v: vg, T: targetT },
                ...vap
            ];
        } else {
            // Supercritical / critical: smooth curve, sort high-P (low v) to low-P (high v).
            points = all.sort((a, b) => b.P - a.P);
        }

        return { index, T: targetT, kind, psat, vf, vg, points, tCrit };
    }).filter((curve) => curve.points.length >= 2);
}

function interpolateBlockAtT(block, targetT, prop = 'v') {
    if (!block || block.completeMinT == null || block.completeMaxT == null) {
        return null;
    }
    if (targetT < block.completeMinT - 1e-9 || targetT > block.completeMaxT + 1e-9) {
        return null;
    }
    const rows = block.rows.filter((row) => !row.incomplete && Number.isFinite(row.T) && Number.isFinite(row[prop]));
    for (let i = 0; i < rows.length - 1; i++) {
        const a = rows[i];
        const b = rows[i + 1];
        if (Math.abs(a.T - b.T) < 1e-9) {
            // Saturated-liquid + saturated-vapor pair at Tsat: skip; target T
            // would only land exactly here by accident, and the dome splice
            // handles that case anyway.
            continue;
        }
        const lo = Math.min(a.T, b.T);
        const hi = Math.max(a.T, b.T);
        if (targetT >= lo - 1e-9 && targetT <= hi + 1e-9) {
            return lerpValue(targetT, a.T, a[prop], b.T, b[prop]);
        }
    }
    return null;
}

// Interpolated P = Pc isobar for T >= Tc from the blocks bracketing the
// critical pressure (log-P blend). This is the physically correct boundary
// between superheated vapor and supercritical fluid on T-s and h-s axes;
// a plain "everything above CP" band would mislabel low-pressure steam.
function criticalIsobarPoints(engine, maxT) {
    const tables = engine?.tables;
    const blocks = (tables?.blocks || []).filter((block) => Number.isFinite(block?.P) && block.P > 0);
    const pCrit = tables?.pCrit;
    const tCrit = tables?.tCrit;
    if (!blocks.length || !Number.isFinite(pCrit) || !Number.isFinite(tCrit)) {
        return [];
    }
    const below = blocks.filter((block) => block.P <= pCrit).sort((a, b) => b.P - a.P)[0];
    const above = blocks.filter((block) => block.P > pCrit).sort((a, b) => a.P - b.P)[0];
    if (!below || !above) {
        return [];
    }
    const frac = Math.abs(Math.log(above.P) - Math.log(below.P)) < 1e-12
        ? 0
        : (Math.log(pCrit) - Math.log(below.P)) / (Math.log(above.P) - Math.log(below.P));
    const grid = Array.from(new Set(
        below.rows
            .filter((row) => !row.incomplete && Number.isFinite(row.T) && row.T >= tCrit && row.T <= maxT)
            .map((row) => row.T)
    )).sort((a, b) => a - b);

    const points = [];
    for (const T of grid) {
        const sLo = interpolateBlockAtT(below, T, 's');
        const sHi = interpolateBlockAtT(above, T, 's');
        const hLo = interpolateBlockAtT(below, T, 'h');
        const hHi = interpolateBlockAtT(above, T, 'h');
        if (![sLo, sHi, hLo, hHi].every(Number.isFinite)) {
            continue;
        }
        points.push({
            T,
            s: sLo + frac * (sHi - sLo),
            h: hLo + frac * (hHi - hLo)
        });
    }
    return points;
}

function lerpValue(x, x1, y1, x2, y2) {
    if (Math.abs(x2 - x1) < 1e-12) {
        return y1;
    }
    return y1 + (y2 - y1) * (x - x1) / (x2 - x1);
}

function renderIsothermLines(series, scaleX, scaleY, units) {
    return series.map((item) => `
        <path class="chart-isotherm-line ${escapeHtml(item.className)}" d="${pathFromDisplayPoints(item.points, scaleX, scaleY)}" tabindex="0" role="button" ${interactiveAttrs(isothermPayload(item, units))}>
            <title>${escapeHtml(isothermPayload(item, units).detail)}</title>
        </path>
    `).join('');
}

function renderIsothermLegend(series, units) {
    if (!series.length) {
        return '';
    }
    return `
        <div class="chart-isotherm-legend">
            <span>Constant-T isotherms</span>
            <div>
                ${series.map((item) => `
                    <button class="chart-isotherm-button isotherm-${item.index} isotherm-${item.kind}" type="button" ${interactiveAttrs(isothermPayload(item, units))}>
                        <span class="chart-isotherm-swatch isotherm-${item.index} isotherm-${item.kind}"></span>
                        <span>${escapeHtml(formatDisplay('T', item.T, units))}${item.kind === 'crit' ? ' (critical)' : ''}</span>
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}

function isothermId(item) {
    return `isotherm-${item.index}`;
}

function isothermPayload(item, units) {
    const temperature = formatDisplay('T', item.T, units);
    let detail;
    if (item.kind === 'crit') {
        detail = `Critical isotherm at ${temperature}: horizontal tangent through CP.`;
    } else if (item.kind === 'super') {
        detail = `Supercritical isotherm at ${temperature}: smooth P-v curve with no phase change.`;
    } else if (Number.isFinite(item.psat)) {
        detail = `Subcritical isotherm at ${temperature}. Horizontal at P=${formatDisplay('P', item.psat, units)} across the dome.`;
    } else {
        detail = `Constant-T curve at ${temperature}.`;
    }
    return {
        id: isothermId(item),
        title: `${temperature} isotherm`,
        detail
    };
}

function qualityLine(values, engine) {
    if (!Number.isFinite(values?.x) || !Number.isFinite(values.T) || values.T > engine.tables.tCrit) {
        return null;
    }
    const sat = interpolateSaturation(engine.tables.satT, values.T);
    if (!Number.isFinite(sat.values.sf) || !Number.isFinite(sat.values.sg)) {
        return null;
    }
    return {
        x1: sat.values.sf,
        y1: values.T,
        x2: sat.values.sg,
        y2: values.T
    };
}

function convertSeries(points, xKind, yKind, units) {
    return points
        .map((point) => ({
            ...point,
            xKind,
            yKind,
            dx: displayValue(xKind, point.x, units),
            dy: displayValue(yKind, point.y, units)
        }))
        .filter((point) => Number.isFinite(point.dx) && Number.isFinite(point.dy) && (!isLogKind(xKind) || point.dx > 0) && (!isLogKind(yKind) || point.dy > 0));
}

function convertMarkerPoints(markers, units) {
    return markers
        .map((marker) => ({
            ...marker,
            dx: displayValue(marker.xKind, marker.x, units),
            dy: displayValue(marker.yKind, marker.y, units)
        }))
        .filter((marker) => Number.isFinite(marker.dx) && Number.isFinite(marker.dy) && (!isLogKind(marker.xKind) || marker.dx > 0) && (!isLogKind(marker.yKind) || marker.dy > 0));
}

function convertLine(line, xKind, yKind, units) {
    return {
        x1: displayValue(xKind, line.x1, units),
        y1: displayValue(yKind, line.y1, units),
        x2: displayValue(xKind, line.x2, units),
        y2: displayValue(yKind, line.y2, units)
    };
}

function renderAxesOnly(margin, height) {
    return `
        <g class="chart-axis">
            <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${WIDTH - margin.right}" y2="${height - margin.bottom}"></line>
            <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
        </g>
    `;
}

function renderLinearGrid(domainX, scaleX, domainY, scaleY, margin, height) {
    return renderGrid(niceTicks(domainX, 6), scaleX, niceTicks(domainY, 6), scaleY, margin, height);
}

function renderLogGrid(domainX, scaleX, domainY, scaleY, margin, height) {
    return renderGrid(logTicksWithKind(domainX), scaleX, logTicksWithKind(domainY), scaleY, margin, height);
}

function renderMixedGrid(domainX, scaleX, domainY, scaleY, margin, height) {
    return renderGrid(niceTicks(domainX, 6), scaleX, logTicksWithKind(domainY), scaleY, margin, height);
}

function renderGrid(x, scaleX, y, scaleY, margin, height) {
    return `
        <g class="chart-grid">
            ${x.values.map((tick) => `<line x1="${round(scaleX(tick))}" y1="${margin.top}" x2="${round(scaleX(tick))}" y2="${height - margin.bottom}"></line>`).join('')}
            ${y.values.map((tick) => `<line x1="${margin.left}" y1="${round(scaleY(tick))}" x2="${WIDTH - margin.right}" y2="${round(scaleY(tick))}"></line>`).join('')}
        </g>
        <g class="chart-axis">
            <line x1="${margin.left}" y1="${height - margin.bottom}" x2="${WIDTH - margin.right}" y2="${height - margin.bottom}"></line>
            <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${height - margin.bottom}"></line>
            ${x.values.map((tick) => `<text x="${round(scaleX(tick))}" y="${height - margin.bottom + 18}" text-anchor="middle">${escapeHtml(formatAxisTick(tick, x))}</text>`).join('')}
            ${y.values.map((tick) => `<text x="${margin.left - 8}" y="${round(scaleY(tick) + 4)}" text-anchor="end">${escapeHtml(formatAxisTick(tick, y))}</text>`).join('')}
        </g>
    `;
}

function renderIsobarLines(series, scaleX, scaleY, units) {
    return series.map((item) => `
        <path class="chart-isobar-line isobar-${item.index}" d="${pathFromDisplayPoints(item.points, scaleX, scaleY)}" tabindex="0" role="button" ${interactiveAttrs(isobarPayload(item, units))}>
            <title>${escapeHtml(isobarPayload(item, units).detail)}</title>
        </path>
    `).join('');
}

function renderQualityLine(line, scaleX, scaleY) {
    return `
        <line class="chart-quality-line" x1="${round(scaleX(line.x1))}" y1="${round(scaleY(line.y1))}" x2="${round(scaleX(line.x2))}" y2="${round(scaleY(line.y2))}"></line>
    `;
}

function renderSeriesPoints(seriesList, scaleX, scaleY, units) {
    return seriesList.map((series) => `
        <g class="chart-point-layer ${escapeHtml(series.className || '')}">
            ${series.points.map((point, index) => renderSeriesPoint(series, point, index, scaleX, scaleY, units)).join('')}
        </g>
    `).join('');
}

function renderSeriesPoint(series, point, index, scaleX, scaleY, units) {
    const x = scaleX(point.dx);
    const y = scaleY(point.dy);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return '';
    }
    const payload = pointPayload(series, point, index, units);
    return `
        <circle class="chart-hover-point ${escapeHtml(series.className || '')}" cx="${round(x)}" cy="${round(y)}" r="4" ${interactiveAttrs(payload)}>
            <title>${escapeHtml(payload.detail)}</title>
        </circle>
    `;
}

function renderPoint(marker, scaleX, scaleY, units) {
    const x = scaleX(marker.dx);
    const y = scaleY(marker.dy);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return '';
    }
    const payload = markerPayload(marker, units);
    return `
        <circle class="chart-marker ${escapeHtml(marker.slotClass)} ${escapeHtml(phaseClass(marker.phase))} ${escapeHtml(phaseClass(marker.phaseLabel))}" cx="${round(x)}" cy="${round(y)}" r="7" tabindex="0" role="button" ${interactiveAttrs(payload)}>
            <title>${escapeHtml(payload.detail)}</title>
        </circle>
    `;
}

function renderAxisLabels(xName, xUnit, yName, yUnit, height) {
    return `
        <g class="chart-axis-labels">
            <text x="${WIDTH / 2}" y="${height - 8}" text-anchor="middle">${escapeHtml(`${xName} (${xUnit})`)}</text>
            <text transform="translate(14 ${height / 2}) rotate(-90)" text-anchor="middle">${escapeHtml(`${yName} (${yUnit})`)}</text>
        </g>
    `;
}

function renderLegend(markers, units) {
    if (!markers.length) {
        return '<div class="chart-legend muted">No plottable current or pinned states for this chart.</div>';
    }

    return `
        <div class="chart-legend">
            ${markers.map((marker) => {
                const phaseCls = escapeHtml(phaseClass(marker.phaseLabel || marker.phase || ''));
                let badgeChar = marker.phaseBadge;
                if (!badgeChar && phaseCls === 'saturated-liquid') {
                    badgeChar = 'f';
                } else if (!badgeChar && phaseCls === 'saturated-vapor') {
                    badgeChar = 'g';
                }
                const badge = badgeChar
                    ? `<span class="chart-legend-phase-tag ${phaseCls}" aria-label="${badgeChar === 'f' ? 'saturated liquid' : 'saturated vapor'}">${escapeHtml(badgeChar)}</span>`
                    : '';
                return `
                    <button class="chart-legend-row chart-legend-button" type="button" ${interactiveAttrs(markerPayload(marker, units))}>
                        <span class="chart-legend-swatch ${escapeHtml(marker.slotClass)} ${phaseCls}"></span>
                        ${badge}
                        <span>${escapeHtml(markerTitle(marker, units))}</span>
                    </button>
                `;
            }).join('')}
        </div>
    `;
}

function renderIsobarLegend(series, units) {
    if (!series.length) {
        return '';
    }
    return `
        <div class="chart-isobar-legend">
            <span>Combined-table isobars</span>
            <div>
                ${series.map((item) => `
                    <button class="chart-isobar-button isobar-${item.index}" type="button" ${interactiveAttrs(isobarPayload(item, units))}>
                        <span class="chart-isobar-swatch isobar-${item.index}"></span>
                        <span>${escapeHtml(formatDisplay('P', item.P, units))}</span>
                    </button>
                `).join('')}
            </div>
        </div>
    `;
}

function renderChartDetail() {
    return '<div class="chart-detail" data-chart-detail></div>';
}

function markerPayload(marker, units) {
    return {
        id: markerId(marker),
        title: marker.label,
        detail: markerTitle(marker, units)
    };
}

function isobarPayload(item, units) {
    const pressure = formatDisplay('P', item.P, units);
    return {
        id: isobarId(item),
        title: `${pressure} isobar`,
        detail: `${pressure} isobar from the combined table, ${item.points.length} plotted rows.`
    };
}

function pointPayload(series, point, index, units) {
    const title = `${series.label} point`;
    const detailParts = [
        `${axisShort(point.xKind)}=${formatDisplay(point.xKind, point.x, units)}`,
        `${axisShort(point.yKind)}=${formatDisplay(point.yKind, point.y, units)}`
    ];
    if (point.row?.P !== undefined && point.xKind !== 'P' && point.yKind !== 'P') {
        detailParts.push(`P=${formatDisplay('P', point.row.P, units)}`);
    }
    if (point.row?.T !== undefined && point.xKind !== 'T' && point.yKind !== 'T') {
        detailParts.push(`T=${formatDisplay('T', point.row.T, units)}`);
    }
    if (point.row?.phase) {
        detailParts.push(point.row.phase);
    }
    return {
        id: `${phaseClass(series.id)}-point-${index}`,
        parentId: series.id,
        kind: 'point',
        title,
        detail: detailParts.join(', ')
    };
}

function markerId(marker) {
    return `marker-${phaseClass(marker.slotClass)}-${phaseClass(marker.label)}-${phaseClass(marker.xKind)}-${phaseClass(marker.yKind)}`;
}

function isobarId(item) {
    return `isobar-${item.index}`;
}

function interactiveAttrs(payload) {
    const attrs = [
        `data-chart-id="${escapeHtml(payload.id)}"`,
        `data-chart-title="${escapeHtml(payload.title)}"`,
        `data-chart-detail-text="${escapeHtml(payload.detail)}"`,
        payload.parentId ? `data-chart-parent-id="${escapeHtml(payload.parentId)}"` : '',
        payload.kind ? `data-chart-kind="${escapeHtml(payload.kind)}"` : '',
        `aria-label="${escapeHtml(payload.detail)}"`
    ].filter(Boolean);
    return attrs.join(' ');
}

function markerTitle(marker, units) {
    const parts = [marker.label];
    if (marker.phaseLabel) {
        parts.push(marker.phaseLabel);
    }
    parts.push(`${axisShort(marker.xKind)}=${formatDisplay(marker.xKind, marker.x, units)}`);
    parts.push(`${axisShort(marker.yKind)}=${formatDisplay(marker.yKind, marker.y, units)}`);
    return parts.join(' | ');
}

function axisShort(kind) {
    return kind === 'rho' ? 'rho' : kind;
}

function formatDisplay(kind, value, units) {
    return `${formatNumber(displayValue(kind, value, units), 7)} ${unitLabel(kind, units)}`;
}

function displayValue(kind, value, units) {
    return propertyFromSI(kind, value, units);
}

function pathFromDisplayPoints(points, scaleX, scaleY) {
    return points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${round(scaleX(point.dx))} ${round(scaleY(point.dy))}`)
        .join(' ');
}

function domeFillPath(liquid, vapor, scaleX, scaleY) {
    return [
        pathFromDisplayPoints(liquid, scaleX, scaleY),
        ...vapor.slice().reverse().map((point) => `L ${round(scaleX(point.dx))} ${round(scaleY(point.dy))}`),
        'Z'
    ].join(' ');
}

function linearScale([min, max], low, high) {
    const span = max - min || 1;
    return (value) => low + ((value - min) / span) * (high - low);
}

function logScale([min, max], low, high) {
    const logMin = Math.log10(min);
    const logMax = Math.log10(max);
    const span = logMax - logMin || 1;
    return (value) => low + ((Math.log10(Math.max(value, min)) - logMin) / span) * (high - low);
}

function domainValues(seriesList, key) {
    return seriesList.flatMap((series) => series.map((point) => point[key])).filter(Number.isFinite);
}

function paddedDomain(values) {
    const finite = values.filter(Number.isFinite);
    if (!finite.length) {
        return [0, 1];
    }
    let min = Math.min(...finite);
    let max = Math.max(...finite);
    if (min === max) {
        const pad = Math.max(1, Math.abs(min) * 0.1);
        return [min - pad, max + pad];
    }
    const pad = (max - min) * 0.08;
    return [min - pad, max + pad];
}

function paddedLogDomain(values) {
    const positive = values.filter((value) => Number.isFinite(value) && value > 0);
    if (!positive.length) {
        return [0.1, 10];
    }
    const min = Math.min(...positive);
    const max = Math.max(...positive);
    return [min / 1.4, max * 1.4];
}

function niceNum(range, round) {
    if (!Number.isFinite(range) || range <= 0) {
        return 1;
    }
    const exponent = Math.floor(Math.log10(range));
    const fraction = range / Math.pow(10, exponent);
    let nf;
    if (round) {
        if (fraction < 1.5) nf = 1;
        else if (fraction < 3) nf = 2;
        else if (fraction < 7) nf = 5;
        else nf = 10;
    } else {
        if (fraction <= 1) nf = 1;
        else if (fraction <= 2) nf = 2;
        else if (fraction <= 5) nf = 5;
        else nf = 10;
    }
    return nf * Math.pow(10, exponent);
}

function niceTicks([min, max], target = 6) {
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        return { kind: 'linear', step: 0, values: [min] };
    }
    const range = niceNum(max - min, false);
    const step = niceNum(range / Math.max(1, target - 1), true);
    if (!Number.isFinite(step) || step <= 0) {
        return { kind: 'linear', step: max - min, values: [min, max] };
    }
    const startTick = Math.ceil(min / step) * step;
    const endTick = Math.floor(max / step) * step;
    const values = [];
    for (let v = startTick; v <= endTick + step * 1e-9; v += step) {
        values.push(Number(v.toFixed(12)));
    }
    if (!values.length) {
        values.push(min, max);
    }
    return { kind: 'linear', step, values };
}

function logTicksWithKind([min, max]) {
    const start = Math.ceil(Math.log10(min));
    const end = Math.floor(Math.log10(max));
    const powers = [];
    for (let power = start; power <= end; power++) {
        powers.push(10 ** power);
    }
    if (powers.length >= 2) {
        // Thin to at most ~6 ticks but always keep the top decade so wide
        // domains stay labeled end to end (the old slice(0, 5) left the
        // upper decades of the P-v chart with no ticks at all).
        const stride = Math.ceil(powers.length / 6);
        const values = powers.filter((_, index) => index % stride === 0);
        if (values[values.length - 1] !== powers[powers.length - 1]) {
            values.push(powers[powers.length - 1]);
        }
        return { kind: 'log', step: null, values };
    }
    return { kind: 'log', step: null, values: [min, Math.sqrt(min * max), max] };
}

function formatAxisTick(value, tickInfo) {
    if (!Number.isFinite(value)) {
        return '';
    }
    if (tickInfo.kind === 'log') {
        return formatLogTickLabel(value);
    }
    const step = tickInfo.step;
    if (!Number.isFinite(step) || step <= 0) {
        return formatNumber(value, 4);
    }
    // Use toFixed semantics (decimal places), not toPrecision; formatNumber
    // would throw on digits === 0 since toPrecision requires digits >= 1.
    const decimals = Math.max(0, Math.min(8, -Math.floor(Math.log10(step))));
    return value.toFixed(decimals);
}

function formatLogTickLabel(value) {
    if (!Number.isFinite(value)) {
        return '';
    }
    if (value >= 1) {
        return value.toFixed(0);
    }
    const decimals = Math.max(0, Math.min(8, -Math.floor(Math.log10(value))));
    return value.toFixed(decimals);
}

function isLogKind(kind) {
    return kind === 'P' || kind === 'v';
}

function round(value) {
    return Number(value).toFixed(2);
}
