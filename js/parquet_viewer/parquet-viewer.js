/* ============================================
   PARQUET VIEWER / INSPECTOR
   ============================================
   Client-side Apache Parquet inspector. Reads file metadata, per-column
   storage/compression stats, schema, and a paginated data preview entirely
   in the browser (no upload).

   Third-party libraries (loaded lazily from jsDelivr, pinned, MIT):
     - hyparquet 1.26.2              (parser: metadata, schema, row reads)
     - hyparquet-compressors 1.1.1   (gzip/zstd/brotli/lz4 codecs)
   Snappy + uncompressed are built into hyparquet; the compressors bundle is
   imported on demand only when the data preview needs another codec.
   ============================================ */

const HYPARQUET_URL = 'https://cdn.jsdelivr.net/npm/hyparquet@1.26.2/+esm';
const COMPRESSORS_URL = 'https://cdn.jsdelivr.net/npm/hyparquet-compressors@1.1.1/+esm';
const SAMPLE_BASE = 'https://cdn.jsdelivr.net/gh/hyparam/hyparquet@1.26.2/test/files/';

const SAMPLES = [
    { label: 'Multi row-group', file: 'rowgroups.parquet' },
    { label: 'Nested structs', file: 'nested_structs.rust.parquet' },
    { label: 'Strings + dict', file: 'strings.parquet' },
    { label: 'ZSTD codec', file: 'byte_stream_split.zstd.parquet' },
];

const PAGE_SIZE = 50;

// ---- lazy library loaders (cached) ------------------------------------------
let _hp = null;
let _compressors = null;
async function getHyparquet() {
    if (!_hp) _hp = await import(HYPARQUET_URL);
    return _hp;
}
async function getCompressors() {
    if (!_compressors) {
        const mod = await import(COMPRESSORS_URL);
        _compressors = mod.compressors;
    }
    return _compressors;
}

// ---- state ------------------------------------------------------------------
const state = {
    metadata: null,
    schemaTree: null,
    asyncBuffer: null,
    columns: [],       // aggregated leaf-column info
    headers: [],       // top-level column names for preview
    totalRows: 0,
    fileName: '',
    fileSize: 0,
    page: 0,
    previewLoaded: false,
    columnSort: { key: 'compressed', dir: -1 },
};

let els = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
    els = {
        dropZone: document.getElementById('dropZone'),
        fileInput: document.getElementById('fileInput'),
        urlInput: document.getElementById('urlInput'),
        urlLoad: document.getElementById('urlLoad'),
        samples: document.getElementById('samples'),
        loaderError: document.getElementById('loaderError'),
        loaderStatus: document.getElementById('loaderStatus'),
        results: document.getElementById('results'),
        summaryBar: document.getElementById('summaryBar'),
        tabs: document.getElementById('tabs'),
        panels: {
            overview: document.getElementById('panel-overview'),
            schema: document.getElementById('panel-schema'),
            rowgroups: document.getElementById('panel-rowgroups'),
            columns: document.getElementById('panel-columns'),
            preview: document.getElementById('panel-preview'),
            raw: document.getElementById('panel-raw'),
        },
        viewLicenses: document.getElementById('viewLicenses'),
        attributionsModal: document.getElementById('attributionsModal'),
        closeAttributions: document.getElementById('closeAttributions'),
    };

    // sample buttons
    SAMPLES.forEach((s) => {
        const btn = document.createElement('button');
        btn.className = 'tool-btn sample-btn';
        btn.type = 'button';
        btn.textContent = s.label;
        btn.addEventListener('click', () => loadFromUrl(SAMPLE_BASE + s.file, s.file));
        els.samples.appendChild(btn);
    });

    // file input + drop zone
    els.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) loadFromFile(e.target.files[0]);
    });
    els.dropZone.addEventListener('click', () => els.fileInput.click());
    els.dropZone.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.fileInput.click(); }
    });
    ['dragenter', 'dragover'].forEach((ev) => els.dropZone.addEventListener(ev, (e) => {
        e.preventDefault(); els.dropZone.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach((ev) => els.dropZone.addEventListener(ev, (e) => {
        e.preventDefault(); els.dropZone.classList.remove('dragover');
    }));
    els.dropZone.addEventListener('drop', (e) => {
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) loadFromFile(f);
    });

    // url load
    els.urlLoad.addEventListener('click', () => {
        const url = els.urlInput.value.trim();
        if (url) loadFromUrl(url, url.split('/').pop() || 'remote.parquet');
    });
    els.urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.urlLoad.click(); });

    // tab switching
    els.tabs.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (btn) switchTab(btn.dataset.tab);
    });

    // license modal
    els.viewLicenses.addEventListener('click', () => els.attributionsModal.classList.add('active'));
    els.closeAttributions.addEventListener('click', () => els.attributionsModal.classList.remove('active'));
    els.attributionsModal.addEventListener('click', (e) => {
        if (e.target === els.attributionsModal) els.attributionsModal.classList.remove('active');
    });
}

// ---- async buffer helpers ---------------------------------------------------
function fileAsyncBuffer(file) {
    return {
        byteLength: file.size,
        slice: (start, end) => file.slice(start, end).arrayBuffer(),
    };
}
function arrayBufferAsync(ab) {
    return {
        byteLength: ab.byteLength,
        slice: (start, end) => ab.slice(start, end === undefined ? ab.byteLength : end),
    };
}

// ---- loaders ----------------------------------------------------------------
async function loadFromFile(file) {
    setStatus(`Reading ${file.name}...`);
    try {
        await parseAndRender(fileAsyncBuffer(file), file.name, file.size);
    } catch (err) {
        showError(err);
    }
}

async function loadFromUrl(url, name) {
    setStatus(`Fetching ${name}...`);
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} fetching file`);
        const ab = await resp.arrayBuffer();
        await parseAndRender(arrayBufferAsync(ab), name, ab.byteLength);
    } catch (err) {
        if (String(err).includes('Failed to fetch')) {
            showError(new Error('Could not fetch that URL (likely blocked by CORS). Download the file and drop it in instead.'));
        } else {
            showError(err);
        }
    }
}

async function parseAndRender(asyncBuffer, name, size) {
    const hp = await getHyparquet();
    const metadata = await hp.parquetMetadataAsync(asyncBuffer);
    const schemaTree = hp.parquetSchema(metadata);

    state.metadata = metadata;
    state.schemaTree = schemaTree;
    state.asyncBuffer = asyncBuffer;
    state.fileName = name;
    state.fileSize = size;
    state.totalRows = Number(metadata.num_rows);
    state.columns = aggregateColumns(metadata);
    state.headers = schemaTree.children.map((c) => c.element.name);
    state.page = 0;
    state.previewLoaded = false;

    els.loaderError.textContent = '';
    els.loaderStatus.textContent = '';
    els.results.hidden = false;

    renderSummary();
    renderOverview();
    renderSchema();
    renderRowGroups();
    renderColumns();
    renderRawMetadata();
    switchTab('overview');
    els.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setStatus(msg) {
    els.loaderError.textContent = '';
    els.loaderStatus.textContent = msg;
}
function showError(err) {
    console.error(err);
    els.loaderStatus.textContent = '';
    els.loaderError.textContent = 'Error: ' + (err && err.message ? err.message : String(err));
}

// ---- column aggregation across row groups -----------------------------------
function aggregateColumns(metadata) {
    const map = new Map();
    metadata.row_groups.forEach((rg) => {
        rg.columns.forEach((col) => {
            const md = col.meta_data;
            if (!md) return;
            const key = md.path_in_schema.join('.');
            let entry = map.get(key);
            if (!entry) {
                entry = {
                    name: key,
                    type: md.type,
                    codecs: new Set(),
                    encodings: new Set(),
                    compressed: 0,
                    uncompressed: 0,
                    numValues: 0,
                    nulls: 0,
                    chunkCount: 0,   // column chunks seen (one per row group)
                    nullChunks: 0,   // chunks that reported a null_count
                    hasNullStat: false,
                    min: undefined,
                    max: undefined,
                };
                map.set(key, entry);
            }
            entry.chunkCount += 1;
            entry.codecs.add(md.codec);
            (md.encodings || []).forEach((e) => entry.encodings.add(e));
            entry.compressed += Number(md.total_compressed_size || 0);
            entry.uncompressed += Number(md.total_uncompressed_size || 0);
            entry.numValues += Number(md.num_values || 0);
            const st = md.statistics;
            if (st) {
                if (st.null_count !== undefined && st.null_count !== null) {
                    entry.nulls += Number(st.null_count);
                    entry.nullChunks += 1;
                }
                const mn = st.min_value !== undefined ? st.min_value : st.min;
                const mx = st.max_value !== undefined ? st.max_value : st.max;
                entry.min = reduceExtreme(entry.min, mn, -1);
                entry.max = reduceExtreme(entry.max, mx, 1);
            }
        });
    });
    // The null total is only exact when every chunk of the column reported a
    // null_count. A partial set would undercount, so it is shown as unknown
    // rather than a confident wrong number.
    const columns = [...map.values()];
    columns.forEach((entry) => {
        entry.hasNullStat = entry.chunkCount > 0 && entry.nullChunks === entry.chunkCount;
    });
    return columns;
}

// combine group-level extremes when the values are safely comparable
function reduceExtreme(current, candidate, dir) {
    if (candidate === undefined || candidate === null) return current;
    if (current === undefined) return candidate;
    const t = typeof candidate;
    if (t !== typeof current || (t !== 'number' && t !== 'bigint' && t !== 'string')) {
        return current; // not safely comparable; keep first seen
    }
    if (dir < 0) return candidate < current ? candidate : current;
    return candidate > current ? candidate : current;
}

// ---- rendering: summary + overview ------------------------------------------
function renderSummary() {
    const m = state.metadata;
    const codecs = [...new Set(state.columns.flatMap((c) => [...c.codecs]))];
    const compressedTotal = state.columns.reduce((s, c) => s + c.compressed, 0);
    const uncompressedTotal = state.columns.reduce((s, c) => s + c.uncompressed, 0);
    const ratio = compressedTotal > 0 ? uncompressedTotal / compressedTotal : 0;

    els.summaryBar.innerHTML = `
        <div class="summary-file">
            <span class="summary-name mono">${escapeHtml(state.fileName)}</span>
            <span class="summary-tags">
                <span class="chip">${fmtInt(state.totalRows)} rows</span>
                <span class="chip">${state.columns.length} cols</span>
                <span class="chip">${m.row_groups.length} row group${m.row_groups.length === 1 ? '' : 's'}</span>
                <span class="chip">${escapeHtml(codecs.join(', ') || 'UNCOMPRESSED')}</span>
                <span class="chip">Parquet v${m.version ?? '?'}</span>
                ${ratio ? `<span class="chip accent">${ratio.toFixed(1)}x compression</span>` : ''}
            </span>
        </div>
        <div class="summary-writer">${m.created_by ? 'written by ' + escapeHtml(m.created_by) : ''}</div>`;
}

function renderOverview() {
    const m = state.metadata;
    const compressedTotal = state.columns.reduce((s, c) => s + c.compressed, 0);
    const uncompressedTotal = state.columns.reduce((s, c) => s + c.uncompressed, 0);
    const totalNulls = state.columns.reduce((s, c) => s + c.nulls, 0);
    const cells = state.totalRows * state.columns.length;
    // totalNulls only counts chunks that carried a null_count. When any column's
    // stats are incomplete it is a lower bound, so avoid a confident count/percent.
    const nullsComplete = state.columns.length > 0 && state.columns.every((c) => c.hasNullStat);
    let nullCellsLabel;
    if (!nullsComplete) {
        nullCellsLabel = `≥ ${fmtInt(totalNulls)} (partial stats)`;
    } else if (cells) {
        nullCellsLabel = `${fmtInt(totalNulls)} (${(100 * totalNulls / cells).toFixed(1)}%)`;
    } else {
        nullCellsLabel = fmtInt(totalNulls);
    }

    const cards = [
        ['Rows', fmtInt(state.totalRows)],
        ['Columns', String(state.columns.length)],
        ['Row groups', String(m.row_groups.length)],
        ['File size', fmtBytes(state.fileSize)],
        ['Data (compressed)', fmtBytes(compressedTotal)],
        ['Data (uncompressed)', fmtBytes(uncompressedTotal)],
        ['Compression', compressedTotal ? (uncompressedTotal / compressedTotal).toFixed(2) + 'x' : 'n/a'],
        ['Null cells', nullCellsLabel],
    ].map(([label, value]) => `
        <div class="stat-card">
            <div class="stat-label">${label}</div>
            <div class="stat-value mono">${value}</div>
        </div>`).join('');

    // key-value metadata (pandas / arrow / geo often embedded here)
    let kvHtml = '';
    const kv = m.key_value_metadata || [];
    if (kv.length) {
        const rows = kv.map((entry) => {
            const val = entry.value || '';
            const pretty = tryPrettyJson(val);
            const short = val.length > 240 && !pretty;
            return `
            <details class="kv-entry">
                <summary><span class="mono kv-key">${escapeHtml(entry.key)}</span>
                    <span class="kv-size">${fmtBytes(val.length)}</span></summary>
                <pre class="kv-value mono">${escapeHtml(pretty || (short ? val.slice(0, 240) + '...' : val))}</pre>
            </details>`;
        }).join('');
        kvHtml = `<h3 class="section-h">File metadata (key / value)</h3>
            <div class="detected-badges">${detectBadges(kv)}</div>
            <div class="kv-list">${rows}</div>`;
    }

    els.panels.overview.innerHTML = `
        <div class="stat-grid">${cards}</div>
        <h3 class="section-h">Writer</h3>
        <p class="muted mono">${m.created_by ? escapeHtml(m.created_by) : 'not recorded'}</p>
        ${kvHtml}`;
}

function detectBadges(kv) {
    const keys = kv.map((e) => e.key.toLowerCase());
    const badges = [];
    if (keys.includes('pandas')) badges.push('pandas');
    if (keys.some((k) => k.startsWith('arrow'))) badges.push('Arrow');
    if (keys.includes('geo')) badges.push('GeoParquet');
    if (keys.includes('org.apache.spark.version') || keys.some((k) => k.includes('spark'))) badges.push('Spark');
    return badges.map((b) => `<span class="chip accent">${escapeHtml(b)}</span>`).join('');
}

// ---- rendering: schema tree -------------------------------------------------
function renderSchema() {
    const root = state.schemaTree;
    const rows = [];
    (root.children || []).forEach((child) => walkSchema(child, 0, rows));
    els.panels.schema.innerHTML = `
        <p class="muted">Physical type, logical/converted type, and repetition for every field. Nested groups are indented.</p>
        <div class="schema-list">${rows.join('')}</div>`;
}
function walkSchema(node, depth, rows) {
    const el = node.element;
    const isLeaf = !node.children || node.children.length === 0;
    const type = el.type || 'group';
    const logical = logicalTypeLabel(el);
    const rep = el.repetition_type || '';
    rows.push(`
        <div class="schema-row" style="padding-left:${depth * 20}px">
            <span class="schema-name mono">${isLeaf ? '' : '<span class="tree-mark">▾</span> '}${escapeHtml(el.name)}</span>
            <span class="type-badge ${isLeaf ? 'leaf' : 'group'}">${escapeHtml(type)}</span>
            ${logical ? `<span class="logical-badge">${escapeHtml(logical)}</span>` : ''}
            ${rep ? `<span class="rep-badge rep-${rep.toLowerCase()}">${escapeHtml(rep.toLowerCase())}</span>` : ''}
        </div>`);
    (node.children || []).forEach((c) => walkSchema(c, depth + 1, rows));
}
function logicalTypeLabel(el) {
    if (el.logical_type && typeof el.logical_type === 'object') {
        const t = el.logical_type.type || Object.keys(el.logical_type)[0];
        if (t) return String(t).replace(/Type$/, '').toUpperCase();
    }
    if (el.converted_type) return String(el.converted_type);
    if (el.type === 'FIXED_LEN_BYTE_ARRAY' && el.type_length) return `FLBA(${el.type_length})`;
    return '';
}

// ---- rendering: row groups (with size bars) ---------------------------------
function renderRowGroups() {
    const m = state.metadata;
    const maxBytes = Math.max(...m.row_groups.map((rg) => Number(rg.total_byte_size || 0)), 1);
    const rows = m.row_groups.map((rg, i) => {
        const bytes = Number(rg.total_byte_size || 0);
        const comp = rg.total_compressed_size !== undefined
            ? Number(rg.total_compressed_size)
            : rg.columns.reduce((s, c) => s + Number(c.meta_data?.total_compressed_size || 0), 0);
        const uncomp = rg.columns.reduce((s, c) => s + Number(c.meta_data?.total_uncompressed_size || 0), 0);
        const ratio = comp > 0 ? (uncomp / comp).toFixed(2) + 'x' : 'n/a';
        return `
            <tr>
                <td class="mono">#${rg.ordinal ?? i}</td>
                <td class="num mono">${fmtInt(Number(rg.num_rows))}</td>
                <td class="num mono">${fmtBytes(comp)}</td>
                <td class="num mono">${fmtBytes(uncomp)}</td>
                <td class="num mono">${ratio}</td>
                <td class="bar-cell"><div class="bar-wrap"><span class="bar" style="width:${(bytes / maxBytes * 100).toFixed(1)}%"></span></div></td>
            </tr>`;
    }).join('');
    els.panels.rowgroups.innerHTML = `
        <p class="muted">Each row group is an independently readable horizontal slice. Bar shows relative uncompressed byte size.</p>
        <div class="table-scroll">
        <table class="data-table">
            <thead><tr><th>Group</th><th class="num">Rows</th><th class="num">Compressed</th><th class="num">Uncompressed</th><th class="num">Ratio</th><th>Size</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        </div>`;
}

// ---- rendering: columns (storage + null bars, sortable) ---------------------
function renderColumns() {
    const cols = [...state.columns];
    const { key, dir } = state.columnSort;
    const getVal = (c) => ({
        name: c.name, compressed: c.compressed, uncompressed: c.uncompressed,
        ratio: c.compressed ? c.uncompressed / c.compressed : 0,
        nulls: c.nulls, values: c.numValues,
    }[key]);
    cols.sort((a, b) => {
        const va = getVal(a), vb = getVal(b);
        if (typeof va === 'string') return dir * va.localeCompare(vb);
        return dir * (va - vb);
    });

    const maxComp = Math.max(...cols.map((c) => c.compressed), 1);
    const rows = cols.map((c) => {
        const ratio = c.compressed ? (c.uncompressed / c.compressed).toFixed(2) + 'x' : 'n/a';
        const nullFrac = state.totalRows ? c.nulls / state.totalRows : 0;
        return `
            <tr>
                <td class="mono col-name">${escapeHtml(c.name)}</td>
                <td><span class="type-badge leaf">${escapeHtml(c.type || '?')}</span></td>
                <td>${[...c.codecs].map((x) => `<span class="codec-chip">${escapeHtml(x)}</span>`).join(' ')}</td>
                <td class="enc-cell">${[...c.encodings].map((x) => `<span class="enc-chip">${escapeHtml(x)}</span>`).join(' ')}</td>
                <td class="num mono">${fmtBytes(c.compressed)}
                    <div class="bar-wrap sm"><span class="bar" style="width:${(c.compressed / maxComp * 100).toFixed(1)}%"></span></div></td>
                <td class="num mono">${ratio}</td>
                <td class="num mono">${c.hasNullStat ? fmtInt(c.nulls) : '?'}
                    <div class="bar-wrap sm"><span class="bar null" style="width:${(nullFrac * 100).toFixed(1)}%"></span></div></td>
                <td class="mono stat-cell">${c.min !== undefined ? escapeHtml(shortVal(c.min)) : ''}</td>
                <td class="mono stat-cell">${c.max !== undefined ? escapeHtml(shortVal(c.max)) : ''}</td>
            </tr>`;
    }).join('');

    const sortArrow = (k) => state.columnSort.key === k ? (state.columnSort.dir < 0 ? ' ▾' : ' ▴') : '';
    els.panels.columns.innerHTML = `
        <p class="muted">Per-column storage across all row groups. Click a header to sort; bars are relative to the largest column.</p>
        <div class="table-scroll">
        <table class="data-table columns-table">
            <thead><tr>
                <th data-sort="name" class="sortable">Column${sortArrow('name')}</th>
                <th>Type</th><th>Codec</th><th>Encodings</th>
                <th data-sort="compressed" class="sortable num">Compressed${sortArrow('compressed')}</th>
                <th data-sort="ratio" class="sortable num">Ratio${sortArrow('ratio')}</th>
                <th data-sort="nulls" class="sortable num">Nulls${sortArrow('nulls')}</th>
                <th>Min</th><th>Max</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        </div>`;

    els.panels.columns.querySelectorAll('th.sortable').forEach((th) => {
        th.addEventListener('click', () => {
            const k = th.dataset.sort;
            if (state.columnSort.key === k) state.columnSort.dir *= -1;
            else state.columnSort = { key: k, dir: k === 'name' ? 1 : -1 };
            renderColumns();
        });
    });
}

// ---- rendering: data preview (lazy, paginated) ------------------------------
async function renderPreview() {
    const panel = els.panels.preview;
    panel.innerHTML = `<p class="muted">Loading rows ${fmtInt(state.page * PAGE_SIZE + 1)} to ${fmtInt(Math.min((state.page + 1) * PAGE_SIZE, state.totalRows))}...</p>`;
    try {
        const hp = await getHyparquet();
        const needsCompressors = state.columns.some((c) =>
            [...c.codecs].some((x) => x !== 'UNCOMPRESSED' && x !== 'SNAPPY'));
        const compressors = needsCompressors ? await getCompressors() : undefined;

        const rowStart = state.page * PAGE_SIZE;
        const rowEnd = Math.min(rowStart + PAGE_SIZE, state.totalRows);
        const rows = await hp.parquetReadObjects({
            file: state.asyncBuffer,
            metadata: state.metadata,
            rowStart, rowEnd,
            rowFormat: 'object',
            compressors,
            utf8: true,
        });

        const headers = state.headers.length ? state.headers : (rows[0] ? Object.keys(rows[0]) : []);
        const body = rows.map((row, ri) => `
            <tr><td class="row-idx mono">${fmtInt(rowStart + ri)}</td>${headers.map((h) => {
                const f = formatCell(row[h]);
                return `<td class="cell-${f.cls} mono" title="${escapeHtml(f.title)}">${escapeHtml(f.text)}</td>`;
            }).join('')}</tr>`).join('');

        const totalPages = Math.max(1, Math.ceil(state.totalRows / PAGE_SIZE));
        panel.innerHTML = `
            <div class="preview-toolbar">
                <div class="pager">
                    <button class="tool-btn" id="prevPage" ${state.page === 0 ? 'disabled' : ''}>Prev</button>
                    <span class="pager-label mono">rows ${fmtInt(rowStart + 1)}-${fmtInt(rowEnd)} of ${fmtInt(state.totalRows)}</span>
                    <button class="tool-btn" id="nextPage" ${state.page >= totalPages - 1 ? 'disabled' : ''}>Next</button>
                </div>
                <div class="export-actions">
                    <button class="tool-btn" id="exportCsv">Export page CSV</button>
                    <button class="tool-btn" id="exportJson">Export page JSON</button>
                </div>
            </div>
            <div class="table-scroll">
            <table class="data-table preview-table">
                <thead><tr><th class="row-idx">#</th>${headers.map((h) => `<th class="mono">${escapeHtml(h)}</th>`).join('')}</tr></thead>
                <tbody>${body}</tbody>
            </table>
            </div>`;

        panel.querySelector('#prevPage').addEventListener('click', () => { if (state.page > 0) { state.page--; renderPreview(); } });
        panel.querySelector('#nextPage').addEventListener('click', () => { if (state.page < totalPages - 1) { state.page++; renderPreview(); } });
        panel.querySelector('#exportCsv').addEventListener('click', () => exportRows(rows, headers, 'csv'));
        panel.querySelector('#exportJson').addEventListener('click', () => exportRows(rows, headers, 'json'));
        state.previewLoaded = true;
    } catch (err) {
        console.error(err);
        panel.innerHTML = `<p class="error-text">Could not read rows: ${escapeHtml(err.message || String(err))}</p>`;
    }
}

// ---- rendering: raw metadata JSON -------------------------------------------
function renderRawMetadata() {
    els.panels.raw.innerHTML = `
        <div class="preview-toolbar">
            <p class="muted">Full file footer metadata as parsed. BigInt values are shown as strings.</p>
            <button class="tool-btn" id="copyRaw">Copy JSON</button>
        </div>
        <pre class="raw-json mono">${escapeHtml(safeJson(state.metadata, 2))}</pre>`;
    els.panels.raw.querySelector('#copyRaw').addEventListener('click', (e) => {
        const text = safeJson(state.metadata, 2);
        if (window.ToolsHub && window.ToolsHub.Clipboard) window.ToolsHub.Clipboard.copy(text, e.target);
        else if (navigator.clipboard) navigator.clipboard.writeText(text);
    });
}

// ---- tabs -------------------------------------------------------------------
function switchTab(name) {
    els.tabs.querySelectorAll('.tab-btn').forEach((b) =>
        b.classList.toggle('active', b.dataset.tab === name));
    Object.entries(els.panels).forEach(([k, panel]) => { panel.hidden = k !== name; });
    if (name === 'preview' && !state.previewLoaded) renderPreview();
}

// ---- export -----------------------------------------------------------------
// Serialize rows to CSV. Uses the raw value, not formatCell (which truncates
// strings to 80 chars and renders byte arrays as a short hex preview). Header
// names and cells are quoted whenever they contain a comma, quote, CR, or LF.
function rowsToCsv(rows, headers) {
    const esc = (v) => {
        const f = csvValue(v);
        return /[",\r\n]/.test(f) ? '"' + f.replace(/"/g, '""') + '"' : f;
    };
    return [headers.map(esc).join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}

function exportRows(rows, headers, format) {
    let text, mime, ext;
    if (format === 'json') {
        text = safeJson(rows, 2); mime = 'application/json'; ext = 'json';
    } else {
        text = rowsToCsv(rows, headers);
        mime = 'text/csv'; ext = 'csv';
    }
    const base = state.fileName.replace(/\.parquet$/i, '') || 'parquet';
    const blob = new Blob([text], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${base}_page${state.page + 1}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ---- value / number formatting ----------------------------------------------
function formatCell(v) {
    if (v === null || v === undefined) return { text: 'null', cls: 'null', title: 'null' };
    if (typeof v === 'bigint') return { text: v.toString(), cls: 'num', title: v.toString() };
    if (typeof v === 'number') return { text: String(v), cls: 'num', title: String(v) };
    if (typeof v === 'boolean') return { text: String(v), cls: 'bool', title: String(v) };
    if (typeof v === 'string') {
        const t = v.length > 80 ? v.slice(0, 80) + '...' : v;
        return { text: t, cls: 'str', title: v };
    }
    if (v instanceof Uint8Array) {
        const hex = [...v.slice(0, 12)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
        return { text: `0x ${hex}${v.length > 12 ? '...' : ''} (${v.length} B)`, cls: 'bytes', title: `${v.length} bytes` };
    }
    if (v instanceof Date) return { text: v.toISOString(), cls: 'date', title: v.toISOString() };
    const j = safeJson(v);
    return { text: j.length > 80 ? j.slice(0, 80) + '...' : j, cls: 'obj', title: j };
}
function shortVal(v) {
    const f = formatCell(v);
    return f.text.length > 40 ? f.text.slice(0, 40) + '...' : f.text;
}
// Faithful, untruncated serialization of a raw cell value for data export.
function csvValue(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (v instanceof Uint8Array) return [...v].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (v instanceof Date) return v.toISOString();
    return safeJson(v);
}
function safeJson(obj, indent) {
    return JSON.stringify(obj, (k, val) => {
        if (typeof val === 'bigint') return val.toString();
        if (val instanceof Uint8Array) return `<${val.length} bytes>`;
        return val;
    }, indent);
}
function tryPrettyJson(str) {
    if (typeof str !== 'string') return null;
    const s = str.trim();
    if (!s.startsWith('{') && !s.startsWith('[')) return null;
    try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return null; }
}
function fmtInt(n) {
    if (!isFinite(n)) return String(n);
    return Math.round(n).toLocaleString('en-US');
}
function fmtBytes(n) {
    n = Number(n);
    if (!isFinite(n) || n < 0) return '?';
    if (n < 1024) return `${n} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
    return `${n.toFixed(n < 10 ? 2 : 1)} ${units[i]}`;
}
function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

// Exposed for automated tests (tests/smoke/parquet-viewer.spec.cjs).
window.ParquetViewer = { csvValue, rowsToCsv, formatCell, fmtBytes, fmtInt, safeJson, aggregateColumns, reduceExtreme };
