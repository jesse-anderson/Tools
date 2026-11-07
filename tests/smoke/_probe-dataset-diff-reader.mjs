// Manual check: SheetJS reads every data/dataset_diff workbook to the typed
// cells in fixtures.json, plus number round-trip and ordering on random doubles.
// Run from the repo root: node tests/smoke/_probe-dataset-diff-reader.mjs
// Phase 1 and Phase 3 specs replace it.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const REPO = process.argv[2] || process.cwd();
const require = createRequire(import.meta.url);
const X = require(REPO + '/js/vendor/dataset_diff/xlsx.full.min.js');
const V = await import(pathToFileURL(REPO + '/js/dataset_diff/diff-values.js'));
const M = JSON.parse(readFileSync(REPO + '/data/dataset_diff/fixtures.json', 'utf8'));
let fails = 0, cells = 0;
const fail = (...a) => { fails++; console.log('FAIL', ...a); };
const want = (c) => c === null ? null : c[0] === 'unresolved' ? V.UNRESOLVED : c[0] === 'n' ? V.numberFromDouble(c[1]) : c;
const OPTS = { dense: true, sheetStubs: true, cellStyles: true, cellText: false, cellHTML: false };
const books = {};
for (const [file, wb] of Object.entries(M.workbooks)) {
  const book = books[file] = X.read(readFileSync(REPO + '/data/dataset_diff/' + file), OPTS);
  if (JSON.stringify(book.SheetNames) !== JSON.stringify(Object.keys(wb.sheets))) fail(file, 'sheet names', book.SheetNames);
  if ((book.Workbook.WBProps.date1904 ? '1904' : '1900') !== wb.dateSystem) fail(file, 'date system');
  book.SheetNames.forEach((name, i) => {
    const spec = wb.sheets[name];
    if ((book.Workbook.Sheets[i].Hidden > 0) !== spec.hidden) fail(file, name, 'hidden');
    const data = book.Sheets[name]['!data'] || [];
    const rows = Math.max(data.length, spec.rows.length);
    for (let r = 0; r < rows; r++) {
      const width = Math.max((data[r] || []).length, (spec.rows[r] || []).length);
      for (let c = 0; c < width; c++) {
        const got = V.fromSheetCell(data[r] && data[r][c]);
        const exp = want(spec.rows[r] ? (spec.rows[r][c] ?? null) : null);
        cells++;
        if (got !== exp && JSON.stringify(got) !== JSON.stringify(exp)) fail(`${file}!${name}!R${r + 1}C${c + 1}`, JSON.stringify(got), '!=', JSON.stringify(exp));
      }
    }
  });
}
// Range and layout facts the workbook adapter will need.
function valueRange(data) {
  let maxR = -1, maxC = -1;
  data.forEach((row, r) => row && row.forEach((cell, c) => { if (V.fromSheetCell(cell) !== null || (cell && cell.f)) { maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); } }));
  return maxR < 0 ? null : X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
}
for (const imp of M.imports.filter((i) => i.file.endsWith('.xlsx'))) {
  const ws = books[imp.file].Sheets[imp.sheet];
  if (imp.refRange && ws['!ref'] !== imp.refRange) fail(imp.file, imp.sheet, '!ref', ws['!ref']);
  if (imp.valueRange && valueRange(ws['!data']) !== imp.valueRange) fail(imp.file, imp.sheet, 'value range', valueRange(ws['!data']));
  if (imp.hiddenRows) { const got = (ws['!rows'] || []).flatMap((r, i) => r && r.hidden ? [i + 1] : []); if (JSON.stringify(got) !== JSON.stringify(imp.hiddenRows)) fail(imp.sheet, 'hidden rows', got); }
  if (imp.hiddenColumns) { const got = (ws['!cols'] || []).flatMap((c, i) => c && c.hidden ? [X.utils.encode_col(i)] : []); if (JSON.stringify(got) !== JSON.stringify(imp.hiddenColumns)) fail(imp.sheet, 'hidden cols', got); }
  if (imp.mergedRanges) { const got = (ws['!merges'] || []).map((m) => X.utils.encode_range(m)); if (JSON.stringify(got) !== JSON.stringify(imp.mergedRanges)) fail(imp.sheet, 'merges', got); }
}
// Number contract: canonical forms, round trip, and value order on random doubles.
const eq = [['1', '1.0', '1e0', '10e-1', '0.1e1'], ['0', '-0', '0.000', '0e5'], ['12e2', '1200', '1.2e3']];
for (const g of eq) { const k = new Set(g.map(V.canonicalDecimal)); if (k.size !== 1) fail('equal tokens', g, [...k]); }
if (V.canonicalDecimal('0.30000000000000004') === V.canonicalDecimal('0.3')) fail('adjacent decimals collapsed');
if (V.canonicalDecimal('12345678901234567890') !== '1234567890123456789e1') fail('big integer', V.canonicalDecimal('12345678901234567890'));
let s = 12345; const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
const buf = new DataView(new ArrayBuffer(8)); const doubles = [];
for (let i = 0; i < 20000; i++) { buf.setUint32(0, rnd() * 4294967296 >>> 0); buf.setUint32(4, rnd() * 4294967296 >>> 0); const d = buf.getFloat64(0); if (Number.isFinite(d)) doubles.push(d); }
for (let i = 0; i < 2000; i++) doubles.push((rnd() - 0.5) * 10 ** Math.floor(rnd() * 30 - 10), Math.round(rnd() * 1e6) / 100);
for (const d of doubles) {
  const c = V.numberFromDouble(d)[1];
  if (Number(V.formatDecimal(c)) !== d && !(d === 0)) { fail('round trip', d, c, V.formatDecimal(c)); break; }
}
for (let i = 0; i + 1 < doubles.length; i++) {
  const a = doubles[i], b = doubles[i + 1];
  const want = a < b ? -1 : a > b ? 1 : 0;
  if (V.compareDecimal(V.numberFromDouble(a)[1], V.numberFromDouble(b)[1]) !== want) { fail('order', a, b); break; }
}
for (const [t, k] of [['00123', 'leading-zero'], ['123', 'number'], ['-0.5', 'number'], ['1e5', 'number'], ['.5', null], ['+5', null], ['1,000', null], ['NaN', null], ['0', 'number'], ['0.5', 'number'], ['01.5', 'leading-zero']]) if (V.numericTokenKind(t) !== k) fail('token', t, V.numericTokenKind(t));
if (V.rowKey([['t', 'a","b']]) === V.rowKey([['t', 'a'], ['t', 'b']])) fail('row key collision');
{ const BS = String.fromCharCode(92), NL = String.fromCharCode(10); const got = V.describeCell(['t', 'x' + NL + '[LEFT ONLY]']); if (got !== 'text:"x' + BS + 'n[LEFT ONLY]"') fail('escape', got); }
console.log(`checked ${cells} cells in ${Object.keys(M.workbooks).length} workbooks, ${doubles.length} doubles; ${fails} failures`);
process.exit(fails ? 1 : 0);
