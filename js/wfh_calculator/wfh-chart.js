// Stacked bar chart, built as SVG elements with resolved colors so the same
// element exports as a standalone file. Negative parts stack below zero.

import { CATEGORIES } from './wfh-engine.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 640;
const H = 330;
const PAD = { top: 28, right: 12, bottom: 58, left: 64 };

function el(name, attrs = {}, text) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    if (text !== undefined) node.textContent = text;
    return node;
}

function niceStep(range, target = 5) {
    const raw = range / target;
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    const norm = raw / mag;
    const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
    return step * mag;
}

// Reads the chart colors from CSS custom properties on the given element.
export function resolveColors(root) {
    const cs = getComputedStyle(root);
    const get = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
    return {
        series: CATEGORIES.map((c, i) => get(`--wfh-series-${i + 1}`, '#888888')),
        surface: get('--wfh-chart-surface', '#ffffff'),
        text: get('--wfh-chart-text', '#111111'),
        muted: get('--wfh-chart-muted', '#555555'),
        grid: get('--wfh-chart-grid', '#dddddd'),
        highlight: get('--wfh-chart-highlight', '#111111'),
        font: get('--wfh-chart-font', 'sans-serif'),
    };
}

// bars: [{ label, sublabel, parts: {commute, ...}, total, highlight, aria }]
export function buildChart({ bars, colors, format, includeTime, title }) {
    const cats = CATEGORIES.filter((c) => includeTime || c.key !== 'time');
    let maxY = 0;
    let minY = 0;
    for (const b of bars) {
        let pos = 0;
        let neg = 0;
        for (const c of cats) {
            const v = b.parts[c.key] || 0;
            if (v >= 0) pos += v; else neg += v;
        }
        maxY = Math.max(maxY, pos);
        minY = Math.min(minY, neg);
    }
    if (maxY === minY) maxY = minY + 1;
    const step = niceStep(maxY - minY);
    const top = Math.ceil(maxY / step) * step;
    const bottom = Math.floor(minY / step) * step;
    const plotH = H - PAD.top - PAD.bottom;
    const plotW = W - PAD.left - PAD.right;
    const y = (v) => PAD.top + (top - v) / (top - bottom) * plotH;

    const svg = el('svg', {
        xmlns: NS, viewBox: `0 0 ${W} ${H}`, width: W, height: H,
        role: 'group', 'aria-label': title, 'font-family': colors.font,
    });
    svg.appendChild(el('rect', { x: 0, y: 0, width: W, height: H, fill: colors.surface }));

    for (let v = bottom; v <= top + step / 2; v += step) {
        const yy = y(v);
        svg.appendChild(el('line', {
            x1: PAD.left, x2: W - PAD.right, y1: yy, y2: yy,
            stroke: colors.grid, 'stroke-width': Math.abs(v) < step / 1e6 ? 1.5 : 1,
        }));
        svg.appendChild(el('text', {
            x: PAD.left - 8, y: yy + 4, 'text-anchor': 'end', 'font-size': 11, fill: colors.muted,
        }, format(v, true)));
    }

    const band = plotW / bars.length;
    const barW = Math.min(64, band * 0.6);
    const groups = [];
    bars.forEach((b, i) => {
        const cx = PAD.left + band * (i + 0.5);
        const g = el('g', { class: 'bar', tabindex: 0, role: 'img', 'aria-label': b.aria, 'data-index': i });
        // Hit area wider than the bar, for hover.
        g.appendChild(el('rect', { x: cx - band / 2, y: PAD.top, width: band, height: plotH, fill: 'transparent' }));
        let pos = 0;
        let neg = 0;
        cats.forEach((c) => {
            const v = b.parts[c.key] || 0;
            if (Math.abs(v) < 1e-9) return;
            const from = v >= 0 ? pos : neg;
            const to = from + v;
            if (v >= 0) pos = to; else neg = to;
            const y1 = y(Math.max(from, to));
            const y2 = y(Math.min(from, to));
            const h = Math.max(0, y2 - y1);
            g.appendChild(el('rect', {
                x: cx - barW / 2, y: y1, width: barW, height: h,
                fill: colors.series[CATEGORIES.indexOf(c)],
                stroke: colors.surface, 'stroke-width': h > 3 ? 2 : 0, rx: 2,
            }));
        });
        if (b.highlight) {
            g.appendChild(el('rect', {
                x: cx - barW / 2 - 4, y: y(pos) - 4, width: barW + 8, height: Math.max(0, y(neg) - y(pos)) + 8,
                fill: 'none', stroke: colors.highlight, 'stroke-width': 1.5, 'stroke-dasharray': '4 3', rx: 4,
            }));
        }
        g.appendChild(el('text', {
            x: cx, y: y(pos) - 8, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 600, fill: colors.text,
        }, format(b.total, true)));
        g.appendChild(el('text', {
            x: cx, y: H - PAD.bottom + 18, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600, fill: colors.text,
        }, b.label));
        if (b.sublabel) {
            g.appendChild(el('text', {
                x: cx, y: H - PAD.bottom + 34, 'text-anchor': 'middle', 'font-size': 11, fill: colors.muted,
            }, b.sublabel));
        }
        svg.appendChild(g);
        groups.push(g);
    });
    return { svg, groups };
}

export function svgString(svg) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
}

export function svgToPngBlob(svg, scale = 2) {
    return new Promise((resolve, reject) => {
        const data = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = W * scale;
            canvas.height = H * scale;
            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0, W, H);
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png');
        };
        img.onerror = () => reject(new Error('PNG export failed'));
        img.src = data;
    });
}
