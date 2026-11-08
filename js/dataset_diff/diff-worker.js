// Two roles. A side worker parses one source once and hands out tables on
// request. The compare worker holds a run: it compares pairs, keeps their
// tables and builds the preview and the full report. A classic worker,
// because SheetJS is a plain script; the ES modules come in through import().
// Tables travel as one JSON string per row.

// SheetJS loads on first need, so the compare worker never pays for it. The
// page warms the side workers at load, which also lets them run offline.
let sheetjs = false;
function needSheetJS() {
    if (!sheetjs) { importScripts('../vendor/dataset_diff/xlsx.full.min.js'); sheetjs = true; }
}

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
    if (m.type === 'warm') {
        if (m.sheetjs) needSheetJS();
        return true;
    }
    if (m.type === 'open-workbook') {
        needSheetJS();
        source = null;
        const audit = W.auditContainer(m.bytes);
        if (!audit.ok) throw new Refusal(audit.error);
        // An ArrayBuffer, never a view: see unreadSheets.
        const bytes = m.bytes instanceof ArrayBuffer ? m.bytes
            : m.bytes.buffer.slice(m.bytes.byteOffset, m.bytes.byteOffset + m.bytes.byteLength);
        let format = audit.format;
        if (audit.container === 'ole') {
            // Encrypted XLSX keeps an EncryptedPackage stream; an XLS keeps Workbook or Book.
            let streams;
            try {
                streams = XLSX.CFB.read(new Uint8Array(bytes), { type: 'array' }).FullPaths
                    .map((p) => p.split('/').filter(Boolean).pop());
            } catch (e) {
                throw new Refusal({ kind: 'not-a-workbook' });
            }
            if (streams.includes('EncryptedPackage') || streams.includes('EncryptionInfo')) throw new Refusal({ kind: 'encrypted' });
            if (!streams.includes('Workbook') && !streams.includes('Book')) throw new Refusal({ kind: 'not-a-workbook' });
            format = 'xls';
        }
        if (format === 'xlsx' && /\.xlsm$/i.test(m.name || '')) format = 'xlsm';
        let wb;
        try {
            wb = XLSX.read(bytes, W.READ_OPTIONS);
        } catch (e) {
            const message = String((e && e.message) || e);
            // A password-protected XLS fails inside its encryption header.
            if (/password|encrypt/i.test(message)) throw new Refusal({ kind: 'encrypted' });
            throw new Refusal({ kind: 'unreadable', format, message });
        }
        const unread = W.unreadSheets(wb);
        if (unread.length) throw new Refusal({ kind: 'sheet-not-read', sheets: unread });
        source = { kind: 'workbook', wb };
        return {
            kind: 'workbook', audit, format,
            limitations: W.FORMAT_LIMITATIONS[format] || [],
            ...W.inventory(wb),
        };
    }
    if (m.type === 'open-text') {
        source = null;
        let text = m.text;
        let encoding = 'pasted text';
        if (text === undefined) {
            const decoded = C.decodeBytes(m.bytes, { encoding: m.encoding || 'auto' });
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
        if (!m.kind || m.kind === 'txt') {
            const { chunks, totalCodePoints } = session.exportChunks();
            return { blob: new Blob(chunks, { type: 'text/plain;charset=utf-8' }), totalCodePoints };
        }
        const { chunks } = session.exportOther(m.kind);
        const type = m.kind === 'json' ? 'application/json' : 'text/csv;charset=utf-8';
        // A byte order mark so spreadsheet software reads the CSV as UTF-8.
        return { blob: new Blob(m.kind === 'json' ? chunks : [String.fromCharCode(0xFEFF), ...chunks], { type }) };
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
