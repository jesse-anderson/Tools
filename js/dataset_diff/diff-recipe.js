// Saved settings ("recipes"): the pair plan and the text import settings,
// never file names, table contents or results. Pure, no DOM. Loading a recipe
// checks every field; anything unexpected refuses the whole file.

import { parseRange } from './diff-workbook.js';

export const RECIPE_FORMAT = 'dataset-diff-recipe';
export const RECIPE_VERSION = 1;

const TEXT_KEYS = {
    delimiter: (v) => v === null || [',', '\t', ';', '|'].includes(v),
    headerRecord: (v) => Number.isInteger(v) && v >= 0 && v <= 1000000,
    generatedHeaders: (v) => typeof v === 'boolean',
    emptyFields: (v) => v === 'blank' || v === 'empty-string',
    decimal: (v) => v === '.' || v === ',',
    thousands: (v) => ['', ',', '.', ' ', "'"].includes(v),
    types: (v) => Array.isArray(v) && v.length <= 256 && v.every((t) => t === null || ['auto', 'text', 'number', 'boolean', 'date'].includes(t)),
    dateFormat: (v) => v === undefined || ['M/D/YYYY', 'D/M/YYYY', 'YYYY-MM-DD', 'D.M.YYYY'].includes(v),
    dateSystem: (v) => v === undefined || v === '1900' || v === '1904',
};
const ENCODINGS = ['auto', 'windows-1252'];

// A text source's only table is named after its file, so its sheet is saved
// as null and matched to whatever text file is loaded later.
export function buildRecipe({ toolVersion, pairs, kinds, text, encoding }) {
    const place = (side, p) => ({
        sheet: kinds[side] === 'text' ? null : p[side].sheet || null,
        range: kinds[side] === 'text' ? null : p[side].range || null,
    });
    const textOut = {};
    for (const side of ['left', 'right']) {
        const o = text[side];
        textOut[side] = Object.fromEntries(Object.keys(TEXT_KEYS).filter((k) => o[k] !== undefined).map((k) => [k, k === 'types' ? o.types.map((t) => t || 'auto') : o[k]]));
    }
    return {
        format: RECIPE_FORMAT,
        version: RECIPE_VERSION,
        toolVersion,
        pairs: pairs.map((p) => ({ include: !!p.include, left: place('left', p), right: place('right', p) })),
        text: textOut,
        encoding: { left: encoding.left, right: encoding.right },
    };
}

export function parseRecipe(json) {
    const errors = [];
    let r;
    try { r = typeof json === 'string' ? JSON.parse(json) : json; } catch (e) { return { ok: false, errors: ['The file is not JSON.'] }; }
    if (!r || typeof r !== 'object' || r.format !== RECIPE_FORMAT) return { ok: false, errors: ['This is not a Dataset Diff settings file.'] };
    if (r.version !== RECIPE_VERSION) return { ok: false, errors: [`Settings version ${r.version} is not supported; this page reads version ${RECIPE_VERSION}.`] };
    if (!Array.isArray(r.pairs) || r.pairs.length === 0 || r.pairs.length > 100) errors.push('pairs must list between 1 and 100 pairs.');
    const pairs = [];
    (Array.isArray(r.pairs) ? r.pairs : []).forEach((p, i) => {
        const where = `pair ${i + 1}`;
        if (!p || typeof p !== 'object' || typeof p.include !== 'boolean') { errors.push(`${where}: include must be true or false.`); return; }
        for (const side of ['left', 'right']) {
            const s = p[side];
            if (!s || typeof s !== 'object') { errors.push(`${where}: ${side} is missing.`); return; }
            if (s.sheet !== null && (typeof s.sheet !== 'string' || s.sheet.length > 255)) errors.push(`${where}: ${side} sheet must be a name or null.`);
            if (s.range !== null && (typeof s.range !== 'string' || !parseRange(s.range))) errors.push(`${where}: ${side} range "${s.range}" is not like A1:D20.`);
        }
        pairs.push({ include: p.include, left: { sheet: p.left.sheet, range: p.left.range }, right: { sheet: p.right.sheet, range: p.right.range } });
    });
    const text = {};
    const encoding = {};
    for (const side of ['left', 'right']) {
        const o = (r.text || {})[side] || {};
        text[side] = {};
        for (const [k, v] of Object.entries(o)) {
            if (!TEXT_KEYS[k]) { errors.push(`${side} text setting "${k}" is not known.`); continue; }
            if (!TEXT_KEYS[k](v)) { errors.push(`${side} text setting "${k}" has an invalid value.`); continue; }
            text[side][k] = Array.isArray(v) ? v.slice() : v;
        }
        const enc = (r.encoding || {})[side] || 'auto';
        if (!ENCODINGS.includes(enc)) errors.push(`${side} encoding "${enc}" is not known.`);
        encoding[side] = enc;
    }
    return errors.length ? { ok: false, errors } : { ok: true, recipe: { pairs, text, encoding } };
}
