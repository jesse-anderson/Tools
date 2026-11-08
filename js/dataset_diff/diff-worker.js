// Two roles. A side worker parses one source once and hands out tables on
// request. The compare worker holds a run: it compares pairs, keeps their
// tables and builds the preview and the full report. A classic worker,
// because SheetJS is a plain script; the ES modules come in through import().
// Tables travel as one JSON string per row.

importScripts('../vendor/dataset_diff/xlsx.full.min.js');

const modules = Promise.all([
    import('./diff-workbook.js'),
    import('./diff-csv.js'),
    import('./diff-values.js'),
    import('./diff-session.js'),
]);

let source = null;
let session = null;

class Refusal extends Error {
    constructor(detail) { super(detail.kind); this.detail = detail; }
}

async function handle(m) {
    const [W, C, V, S] = await modules;
    if (m.type === 'open-workbook') {
        source = null;
        const audit = W.auditContainer(m.bytes);
        if (!audit.ok) throw new Refusal(audit.error);
        const wb = XLSX.read(m.bytes, W.READ_OPTIONS);
        source = { kind: 'workbook', wb };
        return { kind: 'workbook', audit, ...W.inventory(wb) };
    }
    if (m.type === 'open-text') {
        source = null;
        let text = m.text;
        let encoding = 'pasted text';
        if (text === undefined) {
            const decoded = C.decodeBytes(m.bytes);
            if (!decoded.ok) throw new Refusal(decoded.error);
            text = decoded.text;
            encoding = decoded.encoding;
        }
        const delimiter = m.delimiter || C.suggestDelimiter(text);
        const parsed = C.parseRecords(text, delimiter);
        if (parsed.errors.length) throw new Refusal({ kind: 'syntax', errors: parsed.errors.slice(0, 500) });
        source = { kind: 'text', records: parsed.records };
        return {
            kind: 'text', encoding, delimiter, records: parsed.records.length, dateSystem: null,
            preview: parsed.records.slice(0, 20).map((r) => r.fields.map((f) => f.slice(0, 200))),
            sheets: [{ name: m.name || 'Pasted text', hidden: false }],
        };
    }
    if (m.type === 'table') {
        if (!source) throw new Refusal({ kind: 'no-source' });
        const built = source.kind === 'workbook'
            ? W.sheetTable(source.wb, m.sheet, m.range || null)
            : C.buildTable(source.records, m.options || {});
        if (!built.ok) throw new Refusal({ kind: 'table', errors: built.errors, omittedErrors: built.omittedErrors || 0 });
        const { rows, ...rest } = built.table;
        return {
            table: { ...rest, keys: V.encodeRows(rows) },
            info: built.info || null,
            columns: built.columns || null,
            warnings: built.warnings || (built.info && built.info.warnings) || [],
        };
    }
    if (m.type === 'run-start') {
        session = S.createSession();
        session.start();
        return true;
    }
    if (m.type === 'run-pair') return session.addPair(m.pair);
    if (m.type === 'run-finish') return session.finish(m.meta, m.cap);
    if (m.type === 'run-export') {
        const { chunks, totalCodePoints } = session.exportChunks();
        return { blob: new Blob(chunks, { type: 'text/plain;charset=utf-8' }), totalCodePoints };
    }
    throw new Refusal({ kind: 'unknown-request', type: m.type });
}

self.onmessage = async (event) => {
    const { id } = event.data;
    try {
        postMessage({ id, ok: true, value: await handle(event.data) });
    } catch (err) {
        const error = err instanceof Refusal ? err.detail : { kind: 'exception', message: String((err && err.message) || err) };
        postMessage({ id, ok: false, error });
    }
};
