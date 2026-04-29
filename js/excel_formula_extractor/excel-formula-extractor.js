/* Excel Formula Extractor - Workbook analysis tool */

const ALL_SHEETS = '__all__';
const OUTPUT_BATCH_SIZE = 10;
const MAX_WORKBOOK_BYTES = 50 * 1024 * 1024;
const SHOW_ALL_WARN_THRESHOLD = 5000;
const SUPPORTED_EXTENSIONS = new Set(['xlsx', 'xlsm', 'xlsb', 'xls']);
const SHEET_VISIBILITY_LABELS = {
    0: 'Visible',
    1: 'Hidden',
    2: 'Very Hidden'
};
// SheetJS encodes formula errors as numeric codes in cell.v when cell.t === 'e'.
// Map them back so cached values are interpretable in the UI and exports.
const FORMULA_ERROR_CODES = {
    0: '#NULL!',
    7: '#DIV/0!',
    15: '#VALUE!',
    23: '#REF!',
    29: '#NAME?',
    36: '#NUM!',
    42: '#N/A',
    43: '#GETTING_DATA'
};
const DEFAULT_VISIBLE_COUNTS = Object.freeze({
    sheets: OUTPUT_BATCH_SIZE,
    formulas: OUTPUT_BATCH_SIZE,
    definedNames: OUTPUT_BATCH_SIZE,
    externalLinks: OUTPUT_BATCH_SIZE,
    dumpLines: OUTPUT_BATCH_SIZE
});

const DOM = {
    fileInput: document.getElementById('fileInput'),
    browseWorkbookBtn: document.getElementById('browseWorkbookBtn'),
    loadDemoWorkbookBtn: document.getElementById('loadDemoWorkbookBtn'),
    clearWorkbookBtn: document.getElementById('clearWorkbookBtn'),
    uploadArea: document.getElementById('uploadArea'),
    statusBanner: document.getElementById('statusBanner'),
    fileNameValue: document.getElementById('fileNameValue'),
    sourceValue: document.getElementById('sourceValue'),
    fileSizeValue: document.getElementById('fileSizeValue'),
    generatedValue: document.getElementById('generatedValue'),
    sheetFilter: document.getElementById('sheetFilter'),
    searchInput: document.getElementById('searchInput'),
    externalOnlyToggle: document.getElementById('externalOnlyToggle'),
    sheetCountValue: document.getElementById('sheetCountValue'),
    formulaCellsValue: document.getElementById('formulaCellsValue'),
    definedNamesValue: document.getElementById('definedNamesValue'),
    hiddenSheetsValue: document.getElementById('hiddenSheetsValue'),
    externalLinksValue: document.getElementById('externalLinksValue'),
    emptyState: document.getElementById('emptyState'),
    resultsContent: document.getElementById('resultsContent'),
    sheetsTableBody: document.querySelector('#sheetsTable tbody'),
    sheetsMeta: document.getElementById('sheetsMeta'),
    showMoreSheetsBtn: document.getElementById('showMoreSheetsBtn'),
    showAllSheetsBtn: document.getElementById('showAllSheetsBtn'),
    formulasTableBody: document.querySelector('#formulasTable tbody'),
    showMoreFormulasBtn: document.getElementById('showMoreFormulasBtn'),
    showAllFormulasBtn: document.getElementById('showAllFormulasBtn'),
    definedNamesTableBody: document.querySelector('#definedNamesTable tbody'),
    showMoreDefinedNamesBtn: document.getElementById('showMoreDefinedNamesBtn'),
    showAllDefinedNamesBtn: document.getElementById('showAllDefinedNamesBtn'),
    formulaRowsMeta: document.getElementById('formulaRowsMeta'),
    definedNamesMeta: document.getElementById('definedNamesMeta'),
    formulaDumpMeta: document.getElementById('formulaDumpMeta'),
    formulaDump: document.getElementById('formulaDump'),
    externalRefsList: document.getElementById('externalRefsList'),
    externalRefsMeta: document.getElementById('externalRefsMeta'),
    showMoreExternalRefsBtn: document.getElementById('showMoreExternalRefsBtn'),
    showAllExternalRefsBtn: document.getElementById('showAllExternalRefsBtn'),
    showMoreDumpBtn: document.getElementById('showMoreDumpBtn'),
    showAllDumpBtn: document.getElementById('showAllDumpBtn'),
    copyDumpBtn: document.getElementById('copyDumpBtn'),
    downloadJsonBtn: document.getElementById('downloadJsonBtn'),
    downloadFormulasCsvBtn: document.getElementById('downloadFormulasCsvBtn'),
    downloadNamesCsvBtn: document.getElementById('downloadNamesCsvBtn'),
    downloadDumpBtn: document.getElementById('downloadDumpBtn')
};

// Validate required DOM elements exist
if (!DOM.fileInput || !DOM.statusBanner) {
    console.error('Required DOM elements not found');
}

const STATE = {
    analysis: null,
    visibleCounts: createDefaultVisibleCounts(),
    isParsing: false
};

function createDefaultVisibleCounts() {
    return { ...DEFAULT_VISIBLE_COUNTS };
}

function resetVisibleCounts(keys = Object.keys(DEFAULT_VISIBLE_COUNTS)) {
    keys.forEach((key) => {
        STATE.visibleCounts[key] = DEFAULT_VISIBLE_COUNTS[key];
    });
}

function init() {
    bindUploadEvents();
    bindFilterEvents();
    bindOutputLimitEvents();
    bindExportEvents();
    clearAnalysis();
}

function bindUploadEvents() {
    DOM.browseWorkbookBtn.addEventListener('click', () => DOM.fileInput.click());
    DOM.loadDemoWorkbookBtn.addEventListener('click', () => {
        loadWorkbookAnalysis(createDemoWorkbook(), {
            name: 'demo-formulas.xlsx',
            source: 'Demo Workbook'
        });
    });
    DOM.clearWorkbookBtn.addEventListener('click', clearAnalysis);
    DOM.fileInput.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) {
            return;
        }
        await handleWorkbookFile(file);
        DOM.fileInput.value = '';
    });

    DOM.uploadArea.addEventListener('click', () => DOM.fileInput.click());
    DOM.uploadArea.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            DOM.fileInput.click();
        }
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
        DOM.uploadArea.addEventListener(eventName, (event) => {
            event.preventDefault();
            DOM.uploadArea.classList.add('dragover');
        });
    });

    ['dragleave', 'dragend', 'drop'].forEach((eventName) => {
        DOM.uploadArea.addEventListener(eventName, (event) => {
            event.preventDefault();
            DOM.uploadArea.classList.remove('dragover');
        });
    });

    DOM.uploadArea.addEventListener('drop', async (event) => {
        const file = event.dataTransfer?.files?.[0];
        if (!file) {
            return;
        }
        await handleWorkbookFile(file);
    });
}

function bindFilterEvents() {
    let searchDebounceTimer;
    DOM.sheetFilter.addEventListener('change', () => {
        resetVisibleCounts(['formulas', 'definedNames', 'externalLinks', 'dumpLines']);
        renderResults();
    });
    DOM.searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            resetVisibleCounts(['formulas', 'definedNames', 'externalLinks', 'dumpLines']);
            renderResults();
        }, 50); // 50ms debounce prevents excessive renders on rapid typing
    });
    DOM.externalOnlyToggle.addEventListener('change', () => {
        resetVisibleCounts(['formulas', 'definedNames', 'dumpLines']);
        renderResults();
    });
}

function bindOutputLimitEvents() {
    bindVisibleCountButtons('sheets', DOM.showMoreSheetsBtn, DOM.showAllSheetsBtn,
        () => STATE.analysis ? STATE.analysis.sheets.length : 0);
    bindVisibleCountButtons('formulas', DOM.showMoreFormulasBtn, DOM.showAllFormulasBtn,
        () => STATE.analysis ? getFilteredFormulas().length : 0);
    bindVisibleCountButtons('definedNames', DOM.showMoreDefinedNamesBtn, DOM.showAllDefinedNamesBtn,
        () => STATE.analysis ? getFilteredDefinedNames().length : 0);
    bindVisibleCountButtons('externalLinks', DOM.showMoreExternalRefsBtn, DOM.showAllExternalRefsBtn,
        () => STATE.analysis ? getFilteredExternalLinks().length : 0);
    bindVisibleCountButtons('dumpLines', DOM.showMoreDumpBtn, DOM.showAllDumpBtn,
        () => STATE.analysis ? getFilteredFormulas().length : 0);
}

function bindVisibleCountButtons(key, showMoreButton, showAllButton, getTotal) {
    showMoreButton.addEventListener('click', () => {
        STATE.visibleCounts[key] += OUTPUT_BATCH_SIZE;
        renderResults();
    });

    showAllButton.addEventListener('click', () => {
        const total = typeof getTotal === 'function' ? getTotal() : 0;
        if (total > SHOW_ALL_WARN_THRESHOLD) {
            setStatus(`Rendering all ${total} rows — UI may slow briefly.`, 'warning');
        }
        STATE.visibleCounts[key] = Number.MAX_SAFE_INTEGER;
        renderResults();
    });
}

function bindExportEvents() {
    DOM.copyDumpBtn.addEventListener('click', async () => {
        if (!STATE.analysis) {
            return;
        }

        const copier = window.ToolsHub?.Clipboard;
        const content = DOM.formulaDump.value;
        if (!content) {
            return;
        }

        if (copier) {
            await copier.copy(content, DOM.copyDumpBtn);
            return;
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(content);
        }
    });

    DOM.downloadJsonBtn.addEventListener('click', () => {
        if (!STATE.analysis) {
            return;
        }
        downloadFile(
            toExportBaseName(STATE.analysis.fileName, 'formula-analysis.json'),
            JSON.stringify(STATE.analysis, null, 2),
            'application/json'
        );
    });

    DOM.downloadFormulasCsvBtn.addEventListener('click', () => {
        if (!STATE.analysis) {
            return;
        }
        downloadFile(
            toExportBaseName(STATE.analysis.fileName, 'formulas.csv'),
            buildCsv(STATE.analysis.formulas, [
                ['sheet', (row) => row.sheet],
                ['cell', (row) => row.address],
                ['sheet_visibility', (row) => row.sheetVisibility],
                ['formula', (row) => row.formulaText],
                ['cached_value', (row) => row.cachedValue],
                ['formatted_value', (row) => row.formattedValue],
                ['cell_type', (row) => row.cellType],
                ['array_range', (row) => row.arrayRange],
                ['dynamic_array', (row) => row.isDynamicArray],
                ['external_workbooks', (row) => row.externalWorkbooks.join('; ')]
            ]),
            'text/csv;charset=utf-8'
        );
    });

    DOM.downloadNamesCsvBtn.addEventListener('click', () => {
        if (!STATE.analysis) {
            return;
        }
        downloadFile(
            toExportBaseName(STATE.analysis.fileName, 'defined-names.csv'),
            buildCsv(STATE.analysis.definedNames, [
                ['name', (row) => row.name],
                ['scope_type', (row) => row.scopeType],
                ['scope_sheet', (row) => row.scopeSheetName],
                ['scope_visibility', (row) => row.scopeVisibility],
                ['ref', (row) => row.ref],
                ['comment', (row) => row.comment],
                ['external_workbooks', (row) => row.externalWorkbooks.join('; ')]
            ]),
            'text/csv;charset=utf-8'
        );
    });

    DOM.downloadDumpBtn.addEventListener('click', () => {
        if (!STATE.analysis) {
            return;
        }
        downloadFile(
            toExportBaseName(STATE.analysis.fileName, 'formula-dump.txt'),
            STATE.analysis.formulaDump,
            'text/plain;charset=utf-8'
        );
    });
}

async function handleWorkbookFile(file) {
    if (STATE.isParsing) {
        // Prevent overlapping parses: a slow parse finishing after a fast one would
        // overwrite STATE.analysis with stale data and confuse the status banner.
        setStatus('Already parsing a workbook — please wait for it to finish.', 'warning');
        return;
    }

    const extension = getFileExtension(file.name);
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
        failWorkbookLoad(`Unsupported workbook type: .${extension || 'unknown'}. Use XLSX, XLSM, XLSB, or XLS.`);
        return;
    }

    if (typeof XLSX === 'undefined') {
        failWorkbookLoad('SheetJS did not load, so workbook parsing is unavailable right now.');
        return;
    }

    if (file.size > MAX_WORKBOOK_BYTES) {
        failWorkbookLoad(`Workbook is too large (${formatBytes(file.size)}). Limit is ${formatBytes(MAX_WORKBOOK_BYTES)}.`);
        return;
    }

    STATE.isParsing = true;
    try {
        setStatus(`Reading ${file.name}...`, 'info');
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, {
            type: 'array',
            cellFormula: true,
            cellHTML: false,
            cellNF: false,
            cellStyles: false,
            cellText: true,
            cellDates: true,
            bookVBA: true
        });

        loadWorkbookAnalysis(workbook, {
            name: file.name,
            size: file.size,
            source: 'Uploaded Workbook'
        });
    } catch (error) {
        console.error('Failed to parse workbook', error);
        failWorkbookLoad(`Failed to parse workbook: ${error.message}`);
    } finally {
        STATE.isParsing = false;
    }
}

function failWorkbookLoad(message) {
    clearAnalysis();
    setStatus(message, 'error');
}

function loadWorkbookAnalysis(workbook, fileMeta) {
    const analysis = analyzeWorkbook(workbook, fileMeta);
    STATE.analysis = analysis;
    resetVisibleCounts();
    syncFilterOptions(analysis.sheets);
    renderResults();

    const linkedLabel = analysis.summary.externalWorkbookCount === 1 ? 'linked workbook' : 'linked workbooks';
    const statusTone = analysis.summary.formulaCount || analysis.summary.nameCount ? 'success' : 'warning';
    setStatus(
        `Extracted ${analysis.summary.formulaCount} formula cells, ${analysis.summary.nameCount} defined names, and ${analysis.summary.externalWorkbookCount} ${linkedLabel}.`,
        statusTone
    );
}

function analyzeWorkbook(workbook, fileMeta = {}) {
    const sheets = extractSheetMetadata(workbook);
    const formulas = extractFormulaRows(workbook, sheets);
    const definedNames = extractDefinedNames(workbook, sheets);
    const externalLinks = collectExternalLinks(formulas, definedNames);
    const summary = {
        sheetCount: sheets.length,
        formulaCount: formulas.length,
        nameCount: definedNames.length,
        hiddenSheetCount: sheets.filter((sheet) => sheet.visibilityCode !== 0).length,
        externalWorkbookCount: externalLinks.length
    };

    return {
        fileName: fileMeta.name || 'Workbook',
        fileSize: Number.isFinite(fileMeta.size) ? fileMeta.size : null,
        source: fileMeta.source || 'Workbook',
        generatedAt: new Date().toISOString(),
        sheets,
        formulas,
        definedNames,
        externalLinks,
        formulaDump: buildFormulaDump(formulas),
        summary
    };
}

function extractSheetMetadata(workbook) {
    const workbookSheetMeta = workbook?.Workbook?.Sheets || [];
    const sheetNames = workbook?.SheetNames || [];

    // !ref is a SheetJS internal property that contains the range definition for the worksheet.
    // It's stable and well-documented in SheetJS source code.
    return sheetNames.map((sheetName, index) => {
        const meta = workbookSheetMeta[index] || {};
        const visibilityCode = normalizeSheetVisibility(meta.Hidden);
        const worksheet = workbook?.Sheets?.[sheetName] || {};

        return {
            index,
            name: sheetName,
            range: worksheet['!ref'] || '',
            visibilityCode,
            visibilityLabel: SHEET_VISIBILITY_LABELS[visibilityCode] || SHEET_VISIBILITY_LABELS[0]
        };
    });
}

function extractFormulaRows(workbook, sheets) {
    const sheetMetaByName = new Map(sheets.map((sheet) => [sheet.name, sheet]));
    const rows = [];

    for (const sheetName of workbook?.SheetNames || []) {
        const worksheet = workbook?.Sheets?.[sheetName];
        if (!worksheet) {
            continue;
        }

        const sheetMeta = sheetMetaByName.get(sheetName);
        const formulaAddresses = Object.keys(worksheet)
            .filter((address) => !address.startsWith('!') && typeof worksheet[address]?.f === 'string');

        for (const address of formulaAddresses) {
            const cell = worksheet[address];
            const decodedCell = safeDecodeCell(address);
            const externalWorkbooks = extractExternalWorkbooks(cell.f);
            const cachedValue = cell.t === 'e'
                ? (FORMULA_ERROR_CODES[cell.v] ?? `#ERR${cell.v}`)
                : formatValue(cell.v);

            const row = {
                sheet: sheetName,
                sheetIndex: sheetMeta?.index ?? Number.MAX_SAFE_INTEGER,
                address,
                sheetVisibility: sheetMeta?.visibilityLabel || 'Visible',
                formula: cell.f,
                formulaText: `=${cell.f}`,
                cachedValue,
                formattedValue: formatCellDisplay(cell),
                cellType: cell.t || '',
                arrayRange: cell.F ?? '',
                isDynamicArray: Boolean(cell.D),
                externalWorkbooks,
                isExternal: externalWorkbooks.length > 0,
                rowIndex: decodedCell.r,
                columnIndex: decodedCell.c
            };
            attachHaystack(row, [
                row.sheet,
                row.address,
                row.sheetVisibility,
                row.formulaText,
                row.cachedValue,
                row.formattedValue,
                row.externalWorkbooks.join(' ')
            ]);
            rows.push(row);
        }
    }

    const countsBySheet = new Map();
    rows.forEach((row) => {
        countsBySheet.set(row.sheet, (countsBySheet.get(row.sheet) || 0) + 1);
    });

    sheets.forEach((sheet) => {
        sheet.formulaCount = countsBySheet.get(sheet.name) || 0;
    });

    return rows.sort((left, right) => {
        if (left.sheetIndex === right.sheetIndex) {
            if (left.rowIndex === right.rowIndex) {
                return left.columnIndex - right.columnIndex;
            }
            return left.rowIndex - right.rowIndex;
        }
        return left.sheetIndex - right.sheetIndex;
    });
}

function extractDefinedNames(workbook, sheets) {
    const names = workbook?.Workbook?.Names || [];
    return names
        .map((entry) => {
            // Some workbook formats surface entry.Sheet as a numeric string ("0", "2"),
            // which Number.isInteger rejects, silently mislabeling sheet-scoped names as
            // Workbook-scope. Coerce strings before the isInteger gate.
            const rawSheet = typeof entry.Sheet === 'string' ? Number(entry.Sheet) : entry.Sheet;
            const scopeIndex = Number.isInteger(rawSheet) && rawSheet >= 0 ? rawSheet : null;
            const scopeSheet = scopeIndex !== null ? sheets[scopeIndex] : null;
            const externalWorkbooks = extractExternalWorkbooks(entry.Ref || '');

            const row = {
                name: entry.Name || '',
                scopeType: scopeSheet ? 'Sheet' : 'Workbook',
                scopeSheetName: scopeSheet ? scopeSheet.name : '',
                scopeVisibility: scopeSheet ? scopeSheet.visibilityLabel : 'Visible',
                ref: entry.Ref || '',
                comment: entry.Comment || '',
                externalWorkbooks,
                isExternal: externalWorkbooks.length > 0
            };
            attachHaystack(row, [
                row.name,
                row.scopeSheetName,
                row.scopeType,
                row.scopeVisibility,
                row.ref,
                row.comment,
                row.externalWorkbooks.join(' ')
            ]);
            return row;
        })
        .sort((left, right) => left.name.localeCompare(right.name));
}

function collectExternalLinks(formulas, definedNames) {
    const links = new Map();

    const addReference = (workbookName, source) => {
        if (!workbookName) {
            return;
        }

        if (!links.has(workbookName)) {
            links.set(workbookName, {
                workbook: workbookName,
                sources: []
            });
        }

        const entry = links.get(workbookName);
        if (!entry.sources.includes(source)) {
            entry.sources.push(source);
        }
    };

    formulas.forEach((row) => {
        row.externalWorkbooks.forEach((workbookName) => {
            addReference(workbookName, `${row.sheet}!${row.address}`);
        });
    });

    definedNames.forEach((row) => {
        row.externalWorkbooks.forEach((workbookName) => {
            addReference(workbookName, `Name:${row.name}`);
        });
    });

    return Array.from(links.values())
        .map((entry) => ({
            workbook: entry.workbook,
            referenceCount: entry.sources.length,
            sources: entry.sources
        }))
        .sort((left, right) => {
            if (left.referenceCount === right.referenceCount) {
                return left.workbook.localeCompare(right.workbook);
            }
            return right.referenceCount - left.referenceCount;
        });
}

function buildFormulaDump(formulas) {
    return formulas
        .map((row) => `${formatSheetReference(row.sheet)}!${row.address}\t${row.formulaText}`)
        .join('\n');
}

function renderResults() {
    renderSummary();
    renderFileMeta();

    if (!STATE.analysis) {
        DOM.emptyState.hidden = false;
        DOM.resultsContent.hidden = true;
        DOM.formulaDump.value = '';
        DOM.externalRefsList.classList.add('empty');
        DOM.externalRefsList.textContent = 'No external workbook references detected yet.';
        DOM.sheetsMeta.textContent = '0 shown of 0';
        DOM.formulaRowsMeta.textContent = '0 shown of 0';
        DOM.definedNamesMeta.textContent = '0 shown of 0';
        DOM.externalRefsMeta.textContent = '0 shown of 0';
        DOM.formulaDumpMeta.textContent = '0 shown of 0 lines';
        updateVisibleControls(DOM.showMoreSheetsBtn, DOM.showAllSheetsBtn, 0, 0);
        updateVisibleControls(DOM.showMoreFormulasBtn, DOM.showAllFormulasBtn, 0, 0);
        updateVisibleControls(DOM.showMoreDefinedNamesBtn, DOM.showAllDefinedNamesBtn, 0, 0);
        updateVisibleControls(DOM.showMoreExternalRefsBtn, DOM.showAllExternalRefsBtn, 0, 0);
        updateVisibleControls(DOM.showMoreDumpBtn, DOM.showAllDumpBtn, 0, 0);
        setExportsEnabled(false);
        return;
    }

    DOM.emptyState.hidden = true;
    DOM.resultsContent.hidden = false;

    const filteredFormulas = getFilteredFormulas();
    const filteredDefinedNames = getFilteredDefinedNames();
    const filteredExternalLinks = getFilteredExternalLinks();
    const visibleDumpRows = limitItems(filteredFormulas, 'dumpLines');

    renderSheetsTable();
    renderFormulaTable(filteredFormulas);
    renderDefinedNamesTable(filteredDefinedNames);
    renderExternalRefsList(filteredExternalLinks);
    renderFormulaDump(filteredFormulas, visibleDumpRows);
    setExportsEnabled(true);
}

function renderSummary() {
    const summary = STATE.analysis?.summary || {
        sheetCount: 0,
        formulaCount: 0,
        nameCount: 0,
        hiddenSheetCount: 0,
        externalWorkbookCount: 0
    };

    DOM.sheetCountValue.textContent = String(summary.sheetCount);
    DOM.formulaCellsValue.textContent = String(summary.formulaCount);
    DOM.definedNamesValue.textContent = String(summary.nameCount);
    DOM.hiddenSheetsValue.textContent = String(summary.hiddenSheetCount);
    DOM.externalLinksValue.textContent = String(summary.externalWorkbookCount);
}

function renderFileMeta() {
    DOM.fileNameValue.textContent = STATE.analysis?.fileName || '--';
    DOM.sourceValue.textContent = STATE.analysis?.source || '--';
    DOM.fileSizeValue.textContent = STATE.analysis
        ? (STATE.analysis.fileSize == null ? 'In-memory' : formatBytes(STATE.analysis.fileSize))
        : '--';
    DOM.generatedValue.textContent = STATE.analysis ? formatIsoTimestamp(STATE.analysis.generatedAt) : '--';
}

function renderSheetsTable() {
    const sheets = STATE.analysis?.sheets || [];
    const visibleSheets = limitItems(sheets, 'sheets');

    DOM.sheetsMeta.textContent = `${visibleSheets.length} shown of ${sheets.length}`;
    updateVisibleControls(DOM.showMoreSheetsBtn, DOM.showAllSheetsBtn, visibleSheets.length, sheets.length);

    clearChildren(DOM.sheetsTableBody);
    if (!visibleSheets.length) {
        appendEmptyTableRow(DOM.sheetsTableBody, 4, 'No sheets found in the workbook.');
        return;
    }
    for (const sheet of visibleSheets) {
        const tr = document.createElement('tr');
        tr.appendChild(createCell(sheet.name, true));
        tr.appendChild(createPillCell(createVisibilityPill(sheet.visibilityLabel)));
        tr.appendChild(createCell(sheet.range || '--', true));
        tr.appendChild(createCell(String(sheet.formulaCount || 0), true));
        DOM.sheetsTableBody.appendChild(tr);
    }
}

function renderFormulaTable(rows) {
    const visibleRows = limitItems(rows, 'formulas');

    DOM.formulaRowsMeta.textContent = `${visibleRows.length} shown of ${rows.length}`;
    updateVisibleControls(DOM.showMoreFormulasBtn, DOM.showAllFormulasBtn, visibleRows.length, rows.length);

    clearChildren(DOM.formulasTableBody);
    if (!visibleRows.length) {
        appendEmptyTableRow(DOM.formulasTableBody, 9, 'No formula cells matched the current filters.');
        return;
    }
    for (const row of visibleRows) {
        const tr = document.createElement('tr');
        tr.appendChild(createCell(row.sheet, true));
        tr.appendChild(createCell(row.address, true));
        tr.appendChild(createPillCell(createVisibilityPill(row.sheetVisibility)));
        tr.appendChild(createCell(row.formulaText, true));
        tr.appendChild(createCell(row.cachedValue || '--', true));
        tr.appendChild(createCell(row.formattedValue || '--', true));
        tr.appendChild(createCell(row.cellType || '--', true));
        tr.appendChild(createCell(row.arrayRange || (row.isDynamicArray ? '(dynamic)' : '--'), true));
        tr.appendChild(createPillCell(createExternalPill(row.externalWorkbooks)));
        DOM.formulasTableBody.appendChild(tr);
    }
}

function renderDefinedNamesTable(rows) {
    const visibleRows = limitItems(rows, 'definedNames');

    DOM.definedNamesMeta.textContent = `${visibleRows.length} shown of ${rows.length}`;
    updateVisibleControls(DOM.showMoreDefinedNamesBtn, DOM.showAllDefinedNamesBtn, visibleRows.length, rows.length);

    clearChildren(DOM.definedNamesTableBody);
    if (!visibleRows.length) {
        appendEmptyTableRow(DOM.definedNamesTableBody, 6, 'No defined names matched the current filters.');
        return;
    }
    for (const row of visibleRows) {
        const tr = document.createElement('tr');
        tr.appendChild(createCell(row.name, true));
        tr.appendChild(createCell(row.scopeType === 'Workbook' ? 'Workbook' : row.scopeSheetName, true));
        tr.appendChild(createPillCell(createVisibilityPill(row.scopeVisibility)));
        tr.appendChild(createCell(row.ref || '--', true));
        tr.appendChild(createCell(row.comment || '--', false));
        tr.appendChild(createPillCell(createExternalPill(row.externalWorkbooks)));
        DOM.definedNamesTableBody.appendChild(tr);
    }
}

function renderExternalRefsList(links) {
    const visibleLinks = limitItems(links, 'externalLinks');

    DOM.externalRefsMeta.textContent = `${visibleLinks.length} shown of ${links.length}`;
    updateVisibleControls(DOM.showMoreExternalRefsBtn, DOM.showAllExternalRefsBtn, visibleLinks.length, links.length);

    clearChildren(DOM.externalRefsList);
    if (!visibleLinks.length) {
        DOM.externalRefsList.classList.add('empty');
        DOM.externalRefsList.textContent = DOM.searchInput.value.trim()
            ? 'No external workbook references matched the current search.'
            : 'No external workbook references detected yet.';
        return;
    }

    DOM.externalRefsList.classList.remove('empty');
    for (const entry of visibleLinks) {
        const item = document.createElement('div');
        item.className = 'link-item';

        const header = document.createElement('div');
        header.className = 'link-item-header';
        const title = document.createElement('div');
        title.className = 'link-item-title';
        title.textContent = entry.workbook;
        const count = document.createElement('div');
        count.className = 'link-item-count';
        count.textContent = `${entry.referenceCount} refs`;
        header.appendChild(title);
        header.appendChild(count);
        item.appendChild(header);

        const ul = document.createElement('ul');
        for (const source of entry.sources) {
            const li = document.createElement('li');
            li.className = 'mono-cell';
            li.textContent = source;
            ul.appendChild(li);
        }
        item.appendChild(ul);
        DOM.externalRefsList.appendChild(item);
    }
}

function renderFormulaDump(filteredRows, visibleRows) {
    DOM.formulaDumpMeta.textContent = `${visibleRows.length} shown of ${filteredRows.length} lines`;
    updateVisibleControls(DOM.showMoreDumpBtn, DOM.showAllDumpBtn, visibleRows.length, filteredRows.length);
    DOM.formulaDump.value = buildFormulaDump(visibleRows);
}

function getFilteredFormulas() {
    const formulas = STATE.analysis?.formulas || [];
    const activeSheet = DOM.sheetFilter.value;
    const search = DOM.searchInput.value.trim().toLowerCase();
    const externalOnly = DOM.externalOnlyToggle.checked;

    return formulas.filter((row) => {
        if (activeSheet !== ALL_SHEETS && row.sheet !== activeSheet) {
            return false;
        }
        if (externalOnly && !row.isExternal) {
            return false;
        }
        if (!search) {
            return true;
        }
        return getHaystack(row).includes(search);
    });
}

function getFilteredDefinedNames() {
    const definedNames = STATE.analysis?.definedNames || [];
    const activeSheet = DOM.sheetFilter.value;
    const search = DOM.searchInput.value.trim().toLowerCase();
    const externalOnly = DOM.externalOnlyToggle.checked;

    return definedNames.filter((row) => {
        if (activeSheet !== ALL_SHEETS && row.scopeType === 'Sheet' && row.scopeSheetName !== activeSheet) {
            return false;
        }
        if (externalOnly && !row.isExternal) {
            return false;
        }
        if (!search) {
            return true;
        }
        return getHaystack(row).includes(search);
    });
}

function getFilteredExternalLinks() {
    const links = STATE.analysis?.externalLinks || [];
    const search = DOM.searchInput.value.trim().toLowerCase();

    if (!search) {
        return links;
    }

    return links.filter((entry) => {
        const haystack = [
            entry.workbook,
            entry.sources.join(' ')
        ].join(' ').toLowerCase();

        return haystack.includes(search);
    });
}

function syncFilterOptions(sheets) {
    const previousSelection = DOM.sheetFilter.value;
    DOM.sheetFilter.innerHTML = `<option value="${ALL_SHEETS}">All Sheets</option>`;

    sheets.forEach((sheet) => {
        const option = document.createElement('option');
        option.value = sheet.name;
        option.textContent = sheet.visibilityCode === 0 ? sheet.name : `${sheet.name} (${sheet.visibilityLabel})`;
        DOM.sheetFilter.appendChild(option);
    });

    if (previousSelection && Array.from(DOM.sheetFilter.options).some((option) => option.value === previousSelection)) {
        DOM.sheetFilter.value = previousSelection;
    } else {
        DOM.sheetFilter.value = ALL_SHEETS;
    }
}

function clearAnalysis() {
    STATE.analysis = null;
    STATE.visibleCounts = createDefaultVisibleCounts();
    DOM.sheetFilter.innerHTML = `<option value="${ALL_SHEETS}">All Sheets</option>`;
    DOM.sheetFilter.value = ALL_SHEETS;
    DOM.searchInput.value = '';
    DOM.externalOnlyToggle.checked = false;
    setStatus('Waiting for a workbook or demo load.', 'info');
    renderResults();
}

function setStatus(message, tone = 'info') {
    // setStatus is called from multiple places; this is the single point of entry for status updates
    DOM.statusBanner.textContent = message;
    DOM.statusBanner.className = `status-banner ${tone}`;
}

function setExportsEnabled(enabled) {
    DOM.copyDumpBtn.disabled = !enabled;
    DOM.downloadJsonBtn.disabled = !enabled;
    DOM.downloadFormulasCsvBtn.disabled = !enabled;
    DOM.downloadNamesCsvBtn.disabled = !enabled;
    DOM.downloadDumpBtn.disabled = !enabled;
}

// Stash the lowercased searchable text on each row as a non-enumerable property so
// search filtering avoids rebuilding 7-field strings per row per render. Non-enumerable
// keeps it out of JSON.stringify in the export path.
function attachHaystack(row, parts) {
    const haystack = parts.join(' ').toLowerCase();
    Object.defineProperty(row, '__haystack', {
        value: haystack,
        enumerable: false,
        writable: false,
        configurable: false
    });
}

function getHaystack(row) {
    return row.__haystack || '';
}

function clearChildren(node) {
    while (node.firstChild) {
        node.removeChild(node.firstChild);
    }
}

function createCell(text, mono) {
    const td = document.createElement('td');
    if (mono) {
        td.className = 'mono-cell';
    }
    td.textContent = text;
    return td;
}

function createPillCell(pillElement) {
    const td = document.createElement('td');
    td.appendChild(pillElement);
    return td;
}

function createVisibilityPill(label) {
    const className = label === 'Visible'
        ? 'visible'
        : label === 'Hidden'
            ? 'hidden'
            : 'very-hidden';
    const span = document.createElement('span');
    span.className = `pill ${className}`;
    span.setAttribute('role', 'status');
    span.setAttribute('aria-label', `Sheet visibility: ${label}`);
    span.textContent = label;
    return span;
}

function createExternalPill(externalWorkbooks) {
    const span = document.createElement('span');
    if (externalWorkbooks && externalWorkbooks.length) {
        span.className = 'pill external';
        span.textContent = externalWorkbooks.join(', ');
    } else {
        span.className = 'pill';
        span.textContent = 'No';
    }
    return span;
}

function appendEmptyTableRow(tbody, columnCount, message) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = columnCount;
    td.textContent = message;
    tr.appendChild(td);
    tbody.appendChild(tr);
}

function limitItems(items, key) {
    return items.slice(0, STATE.visibleCounts[key]);
}

function updateVisibleControls(showMoreButton, showAllButton, shownCount, totalCount) {
    const hasMore = totalCount > shownCount;
    showMoreButton.hidden = !hasMore;
    showAllButton.hidden = !hasMore;
}

function normalizeSheetVisibility(value) {
    const numericValue = Number(value);
    if (numericValue === 1 || numericValue === 2) {
        return numericValue;
    }

    return 0;
}

function extractExternalWorkbooks(text) {
    const results = [];
    const seen = new Set();

    if (!text) {
        return results;
    }

    const addWorkbook = (workbookName) => {
        const trimmed = workbookName.trim();
        if (trimmed && !seen.has(trimmed)) {
            seen.add(trimmed);
            results.push(trimmed);
        }
    };

    // Quoted refs cover sheet names with spaces and path-qualified links:
    // '[Book.xlsx]Rates Sheet'!A1 and 'C:\Models\[Book.xlsx]Rates Sheet'!A1.
    const quotedPattern = /(^|[^A-Za-z0-9_])'(?:[^']|'')*\[([^\]]+)\](?:[^']|'')*'!/g;
    let match;
    while ((match = quotedPattern.exec(text)) !== null) {
        addWorkbook(match[2]);
    }

    // Unquoted refs are intentionally stricter so structured refs like Table1[Col]
    // do not become false external-workbook matches.
    const unquotedPattern = /(^|[^A-Za-z0-9_])\[([^\]]+)\][A-Za-z0-9_.]+!/g;
    while ((match = unquotedPattern.exec(text)) !== null) {
        addWorkbook(match[2]);
    }

    return results;
}

function formatSheetReference(sheetName) {
    return `'${String(sheetName).replace(/'/g, "''")}'`;
}

function compareCellAddresses(left, right) {
    const leftCell = safeDecodeCell(left);
    const rightCell = safeDecodeCell(right);

    if (leftCell.r === rightCell.r) {
        return leftCell.c - rightCell.c;
    }

    return leftCell.r - rightCell.r;
}

function safeDecodeCell(address) {
    if (typeof XLSX !== 'undefined' && XLSX.utils?.decode_cell) {
        return XLSX.utils.decode_cell(address);
    }

    const match = /^\$?([A-Z]+)\$?(\d+)$/i.exec(address);
    if (!match) {
        return { r: Number.MAX_SAFE_INTEGER, c: Number.MAX_SAFE_INTEGER };
    }

    const [, columnLabel, rowText] = match;
    let column = 0;
    for (let index = 0; index < columnLabel.length; index += 1) {
        column = (column * 26) + (columnLabel.toUpperCase().charCodeAt(index) - 64);
    }

    return {
        r: Math.max(0, Number(rowText) - 1),
        c: Math.max(0, column - 1)
    };
}

function formatCellDisplay(cell) {
    if (!cell) {
        return '';
    }

    if (typeof cell.w === 'string' && cell.w) {
        return cell.w;
    }

    return formatValue(cell.v);
}

function formatValue(value) {
    if (value === null || value === undefined) {
        return '';
    }

    if (value instanceof Date) {
        return value.toISOString();
    }

    if (typeof value === 'boolean') {
        return value ? 'TRUE' : 'FALSE';
    }

    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch (error) {
            return String(value);
        }
    }

    return String(value);
}

function buildCsv(rows, columns) {
    const header = columns.map(([label]) => csvEscape(label)).join(',');
    const body = rows.map((row) => columns.map(([, getter]) => csvEscape(getter(row))).join(','));
    return [header, ...body].join('\r\n');
}

function csvEscape(value) {
    // Defend against CSV formula injection (CWE-1236): when a downstream tool re-opens
    // this CSV in Excel/Sheets, a leading =/+/-/@ or leading control/whitespace before
    // one of those operators can be interpreted as a live formula.
    // Prefix with an apostrophe so the value renders as text. Analysts re-importing the
    // CSV elsewhere can strip the leading apostrophe if needed.
    let text = value === null || value === undefined ? '' : String(value);
    if (text.length > 0 && (/^[\t\r\n]/.test(text) || /^[\s]*[=+\-@]/.test(text))) {
        text = `'${text}`;
    }
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // 1s delay allows download to start before revoking the URL
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function toExportBaseName(fileName, suffix) {
    const stem = fileName.replace(/\.[^.]+$/, '') || 'workbook';
    return `${stem}-${suffix}`;
}

function getFileExtension(fileName) {
    const match = /\.([^.]+)$/.exec(fileName || '');
    return match ? match[1].toLowerCase() : '';
}

function formatBytes(bytes) {
    if (!bytes) {
        return bytes === 0 ? '0 B' : '--';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    const decimals = size >= 100 || unitIndex === 0 ? 0 : 1;
    return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}

function formatIsoTimestamp(isoString) {
    if (!isoString) {
        return '--';
    }

    const date = new Date(isoString);
    return Number.isNaN(date.getTime()) ? isoString : date.toLocaleString();
}

function createDemoWorkbook() {
    return {
        SheetNames: ['Inputs', 'Calc', 'Archive'],
        Sheets: {
            Inputs: {
                '!ref': 'A1:C4',
                A1: { t: 's', v: 'Dose' },
                A2: { t: 'n', v: 1, w: '1' },
                A3: { t: 'n', v: 2, w: '2' },
                A4: { t: 'n', v: 3, w: '3' },
                B1: { t: 's', v: 'Rate' },
                B2: { t: 'n', v: 10, w: '10' },
                B3: { t: 'n', v: 20, w: '20' },
                B4: { t: 'n', v: 30, w: '30' },
                C2: { t: 'n', f: 'SUM(A2:B2)', v: 11, w: '11' },
                C3: { t: 'n', f: 'SUM(A3:B3)', v: 22, w: '22' },
                C4: { t: 'n', f: 'SUM(A4:B4)', v: 33, w: '33' }
            },
            Calc: {
                '!ref': 'A1:F3',
                A1: { t: 's', v: 'Output' },
                B2: { t: 'n', f: 'SUM(Inputs!C2:C4)', v: 66, w: '66' },
                C2: { t: 'n', f: '\'[Pricing.xlsx]Rates\'!$B$2', v: 1.5, w: '1.5' },
                D2: { t: 'n', f: 'FILTER(Inputs!A2:B4,Inputs!B2:B4>0)', F: 'D2:E4', D: true, v: 1, w: 'spills' }
            },
            Archive: {
                '!ref': 'A1:B2',
                A1: { t: 'n', f: 'Calc!B2*2', v: 132, w: '132' }
            }
        },
        Workbook: {
            Sheets: [
                { name: 'Inputs', Hidden: 0 },
                { name: 'Calc', Hidden: 0 },
                { name: 'Archive', Hidden: 2 }
            ],
            Names: [
                { Name: 'ArchiveMetric', Ref: 'Archive!$A$1', Sheet: 2, Comment: 'Very hidden sheet scope' },
                { Name: 'QuotedRate', Ref: '\'[Pricing.xlsx]Rates\'!$B$2', Comment: 'External workbook reference' },
                { Name: 'RateTable', Ref: 'Inputs!$B$2:$B$4', Comment: 'Workbook-scoped range' }
            ]
        }
    };
}

init();

window.ExcelFormulaExtractor = {
    analyzeWorkbook,
    extractExternalWorkbooks,
    loadWorkbookForTest(workbook, fileMeta = {}) {
        loadWorkbookAnalysis(workbook, {
            name: fileMeta.name || 'test.xlsx',
            size: fileMeta.size || 0,
            source: fileMeta.source || 'Test Workbook'
        });
    },
    getCurrentAnalysis() {
        return STATE.analysis;
    }
};
