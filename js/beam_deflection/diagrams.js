// Inline SVG schematics for the beam deflection tool.
//
// Hand-authored, no library, no external image files, so the strict CSP on the
// page holds. Colours come from currentColor and the shared CSS variables via
// classes, so both themes work with no JavaScript involved.
//
// The deflected shape is not drawn by eye: it is sampled from the engine itself
// at nominal unit values and normalized to a fixed pixel amplitude. That keeps
// the qualitative shape honest, in particular the zero slope at a built-in end,
// which is the whole visual argument for why a fixed end is stiffer.

import { solve, sampleCurve } from './beam-engine.js';

const VIEW_W = 280;
const VIEW_H = 150;
const X0 = 34;          // left end of the beam
const X1 = 246;         // right end of the beam
const Y_BEAM = 62;      // undeflected beam line
const AMPLITUDE = 20;   // pixels at maximum deflection, fixed exaggeration

const SUPPORT_TITLES = {
    'cantilever': 'Cantilever: built in at the left end, free at the right end',
    'simple': 'Simply supported: pinned at the left end, roller at the right end',
    'fixed-fixed': 'Fixed-fixed: built in at both ends',
    'propped': 'Propped cantilever: built in at the left end, propped on a pin at the right end',
};

export const SUPPORT_LABELS = {
    'cantilever': 'Cantilever',
    'simple': 'Simply supported',
    'fixed-fixed': 'Fixed-fixed',
    'propped': 'Propped cantilever',
};

export const SUPPORT_SUBLABELS = {
    'cantilever': 'Fixed one end, free the other',
    'simple': 'Pin and roller, both ends supported',
    'fixed-fixed': 'Built in both ends, both ends supported',
    'propped': 'Fixed one end, pinned the other',
};

const n = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);

function hatching(x, yTop, yBottom, count = 6) {
    const parts = [];
    const step = (yBottom - yTop) / (count - 1);
    for (let i = 0; i < count; i += 1) {
        const y = yTop + i * step;
        parts.push(`M ${n(x)} ${n(y)} l -7 7`);
    }
    return `<path class="bd-hatch" d="${parts.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.2"/>`;
}

function fixedEnd(x) {
    return [
        `<line class="bd-support" x1="${n(x)}" y1="${Y_BEAM - 24}" x2="${n(x)}" y2="${Y_BEAM + 24}" stroke="currentColor" stroke-width="2.5"/>`,
        hatching(x, Y_BEAM - 24, Y_BEAM + 24),
    ].join('');
}

function pinSupport(x) {
    return [
        `<path class="bd-support" d="M ${n(x)} ${Y_BEAM + 1} L ${n(x - 10)} ${Y_BEAM + 18} L ${n(x + 10)} ${Y_BEAM + 18} Z" fill="currentColor"/>`,
        `<line class="bd-support" x1="${n(x - 15)}" y1="${Y_BEAM + 18}" x2="${n(x + 15)}" y2="${Y_BEAM + 18}" stroke="currentColor" stroke-width="2"/>`,
        hatching(x + 13, Y_BEAM + 18, Y_BEAM + 28, 4),
    ].join('');
}

function rollerSupport(x) {
    return [
        `<path class="bd-support" d="M ${n(x)} ${Y_BEAM + 1} L ${n(x - 10)} ${Y_BEAM + 14} L ${n(x + 10)} ${Y_BEAM + 14} Z" fill="currentColor"/>`,
        `<circle class="bd-support" cx="${n(x - 5)}" cy="${Y_BEAM + 18}" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
        `<circle class="bd-support" cx="${n(x + 5)}" cy="${Y_BEAM + 18}" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
        `<line class="bd-support" x1="${n(x - 15)}" y1="${Y_BEAM + 23}" x2="${n(x + 15)}" y2="${Y_BEAM + 23}" stroke="currentColor" stroke-width="2"/>`,
        hatching(x + 13, Y_BEAM + 23, Y_BEAM + 32, 4),
    ].join('');
}

function supports(support) {
    switch (support) {
        case 'cantilever': return fixedEnd(X0);
        case 'simple': return pinSupport(X0) + rollerSupport(X1);
        case 'fixed-fixed': return fixedEnd(X0) + fixedEnd(X1);
        case 'propped': return fixedEnd(X0) + pinSupport(X1);
        default: return '';
    }
}

function arrow(x, yFrom, yTo) {
    return [
        `<line x1="${n(x)}" y1="${n(yFrom)}" x2="${n(x)}" y2="${n(yTo)}" stroke="currentColor" stroke-width="1.6"/>`,
        `<path d="M ${n(x)} ${n(yTo)} l -3.5 -6 l 7 0 Z" fill="currentColor"/>`,
    ].join('');
}

// A distributed load is drawn as a rail with arrows hanging off it, spanning
// only the loaded part. The arrow count follows the band width so a short band
// does not end up more densely arrowed than a long one.
function distributedGlyph(startFrac, endFrac) {
    const xa = X0 + (X1 - X0) * startFrac;
    const xb = X0 + (X1 - X0) * endFrac;
    const count = Math.max(3, Math.round(9 * (endFrac - startFrac)));
    const parts = [`<line x1="${n(xa)}" y1="${Y_BEAM - 32}" x2="${n(xb)}" y2="${Y_BEAM - 32}" stroke="currentColor" stroke-width="2"/>`];
    for (let i = 0; i < count; i += 1) {
        const x = count === 1 ? (xa + xb) / 2 : xa + ((xb - xa) * i) / (count - 1);
        parts.push(arrow(x, Y_BEAM - 32, Y_BEAM - 5));
    }
    return `<g class="bd-load">${parts.join('')}</g>`;
}

function loadGlyph(loadType, xFrac, startFrac, endFrac) {
    if (loadType === 'udl') return distributedGlyph(0, 1);
    if (loadType === 'udl-partial') return distributedGlyph(startFrac, endFrac);
    const x = X0 + (X1 - X0) * xFrac;
    return `<g class="bd-load">${arrow(x, Y_BEAM - 38, Y_BEAM - 5)}</g>`;
}

// Samples the engine at unit values so the drawn shape is the real shape for
// this boundary condition rather than a freehand curve.
function deflectedPath(support, loadType, aFrac, cFrac) {
    const distributed = loadType === 'udl' || loadType === 'udl-partial';
    const input = {
        support,
        loadType,
        L: 1,
        E: 1,
        I: 1,
        P: distributed ? undefined : 1,
        w: distributed ? 1 : undefined,
        a: loadType === 'point-at' || loadType === 'udl-partial' ? aFrac : undefined,
        c: loadType === 'udl-partial' ? cFrac : undefined,
    };
    const result = solve(input);
    if (!result.ok || result.deltaMax <= 0) return { path: '', xMaxFrac: null };
    const pts = sampleCurve(result, 60);
    const scale = AMPLITUDE / result.deltaMax;
    const d = pts
        .map((p, i) => {
            const px = X0 + (X1 - X0) * p.x;
            const py = Y_BEAM + p.y * scale;
            return `${i === 0 ? 'M' : 'L'} ${n(px)} ${n(py)}`;
        })
        .join(' ');
    return { path: d, xMaxFrac: result.xMax / result.L, deltaMaxPx: AMPLITUDE };
}

function dimensionLine(y, xa, xb, label) {
    const mid = (xa + xb) / 2;
    return [
        `<line x1="${n(xa)}" y1="${n(y)}" x2="${n(xb)}" y2="${n(y)}" stroke="currentColor" stroke-width="1"/>`,
        `<line x1="${n(xa)}" y1="${n(y - 4)}" x2="${n(xa)}" y2="${n(y + 4)}" stroke="currentColor" stroke-width="1"/>`,
        `<line x1="${n(xb)}" y1="${n(y - 4)}" x2="${n(xb)}" y2="${n(y + 4)}" stroke="currentColor" stroke-width="1"/>`,
        `<text class="bd-dim-label" x="${n(mid)}" y="${n(y - 5)}" text-anchor="middle">${label}</text>`,
    ].join('');
}

/**
 * Builds one schematic.
 *
 * @param {string} support   one of the four support cases
 * @param {string} loadType  'point-standard' | 'point-at' | 'udl' | 'udl-partial'
 * @param {number} aFrac     start of the load as a fraction of span
 * @param {number} cFrac     loaded length as a fraction of span, for 'udl-partial'
 * @returns {string} SVG markup, safe to insert: every value is a formatted number
 */
export function beamDiagram(support, loadType, aFrac = 0.5, cFrac = 1) {
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const standardFrac = support === 'cantilever' ? 1 : 0.5;
    const frac = loadType === 'point-at' ? clamp(aFrac, 0, 1) : standardFrac;
    const bandStart = loadType === 'udl-partial' ? clamp(aFrac, 0, 1) : 0;
    const bandLen = loadType === 'udl-partial'
        ? clamp(cFrac, 1e-4, 1 - bandStart)
        : 1;
    const bandEnd = bandStart + bandLen;
    // A point load takes its position from frac; a band takes it from bandStart.
    // Passing bandStart for both puts a point load at x = 0, on the support,
    // where the beam does not bend and the drawn curve comes back empty.
    const loadFrac = loadType === 'udl-partial' ? bandStart : frac;
    const { path, xMaxFrac } = deflectedPath(support, loadType, loadFrac, bandLen);
    const xLoad = X0 + (X1 - X0) * frac;

    const marker = xMaxFrac === null ? '' : (() => {
        const mx = X0 + (X1 - X0) * xMaxFrac;
        return [
            `<line class="bd-max-line" x1="${n(mx)}" y1="${Y_BEAM}" x2="${n(mx)}" y2="${n(Y_BEAM + AMPLITUDE)}" stroke="currentColor" stroke-width="1" stroke-dasharray="2 2"/>`,
            `<circle class="bd-max-dot" cx="${n(mx)}" cy="${n(Y_BEAM + AMPLITUDE)}" r="3.2" fill="currentColor"/>`,
        ].join('');
    })();

    let aDim = '';
    if (loadType === 'point-at') {
        aDim = dimensionLine(Y_BEAM + 46, X0, xLoad, 'a');
    } else if (loadType === 'udl-partial') {
        // The loaded band gets its own dimension, offset from the span line so a
        // band covering the whole span does not draw on top of it.
        const xa = X0 + (X1 - X0) * bandStart;
        const xb = X0 + (X1 - X0) * bandEnd;
        aDim = dimensionLine(Y_BEAM + 46, xa, xb, 'c');
    }

    return [
        `<svg class="bd-diagram" viewBox="0 0 ${VIEW_W} ${VIEW_H}" role="img" aria-label="${SUPPORT_TITLES[support]}" preserveAspectRatio="xMidYMid meet">`,
        `<title>${SUPPORT_TITLES[support]}</title>`,
        loadGlyph(loadType, frac, bandStart, bandEnd),
        `<line class="bd-beam" x1="${X0}" y1="${Y_BEAM}" x2="${X1}" y2="${Y_BEAM}" stroke="currentColor" stroke-width="3"/>`,
        `<path class="bd-deflected" d="${path}" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4"/>`,
        marker,
        supports(support),
        `<g class="bd-dim">${aDim}${dimensionLine(Y_BEAM + 66, X0, X1, 'L')}</g>`,
        '</svg>',
    ].join('');
}
