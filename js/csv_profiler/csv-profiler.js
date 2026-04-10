import { MAX_CELL_PREVIEW_LENGTH, MAX_FILE_SIZE_BYTES, MAX_PROFILE_ROWS, MAX_UNIQUE_TRACKED } from './csv-profiler-config.js';
import { profileCsvFile } from './csv-profiler-profile.js';
import { createBadCsvSampleFile, createGoodCsvSampleFile } from './csv-profiler-samples.js';
import {
    copyText,
    createElement,
    formatBytes,
    formatDuration,
    formatInteger,
    formatPercent,
    truncateText
} from './csv-profiler-utils.js';

const state = {
    file: null,
    profile: null,
    activeTab: 'overview',
    columnSearch: '',
    settings: {
        delimiterMode: 'auto',
        headerMode: 'auto'
    }
};

const dom = {};

document.addEventListener('DOMContentLoaded', init);

function init() {
    cacheDom();
    bindEvents();
    renderEmptyProfile();
}

function cacheDom() {
    dom.fileInput = document.getElementById('fileInput');
    dom.uploadArea = document.getElementById('uploadArea');
    dom.fileInfo = document.getElementById('fileInfo');
    dom.fileName = document.getElementById('fileName');
    dom.fileSize = document.getElementById('fileSize');
    dom.loadGoodSampleButton = document.getElementById('loadGoodSampleButton');
    dom.loadBadSampleButton = document.getElementById('loadBadSampleButton');
    dom.reloadButton = document.getElementById('reloadButton');
    dom.closeFile = document.getElementById('closeFile');
    dom.analysisContent = document.getElementById('analysisContent');
    dom.errorBanner = document.getElementById('errorBanner');
    dom.errorText = document.getElementById('errorText');
    dom.tabs = Array.from(document.querySelectorAll('[data-tab]'));
    dom.columnSearchInput = document.getElementById('columnSearchInput');
    dom.delimiterSelect = document.getElementById('delimiterSelect');
    dom.headerSelect = document.getElementById('headerSelect');

    dom.copySqlButton = document.getElementById('copySqlButton');
    dom.copySqlButtonLabel = dom.copySqlButton.querySelector('span');
    dom.copyJsonButton = document.getElementById('copyJsonButton');
    dom.copyJsonButtonLabel = dom.copyJsonButton.querySelector('span');
    dom.copySqlInlineButton = document.getElementById('copySqlInlineButton');
    dom.copySqlInlineLabel = dom.copySqlInlineButton.querySelector('span');
    dom.copyJsonInlineButton = document.getElementById('copyJsonInlineButton');
    dom.copyJsonInlineLabel = dom.copyJsonInlineButton.querySelector('span');

    dom.rowsProfiledValue = document.getElementById('rowsProfiledValue');
    dom.columnCountValue = document.getElementById('columnCountValue');
    dom.duplicateRowsValue = document.getElementById('duplicateRowsValue');
    dom.inconsistentRowsValue = document.getElementById('inconsistentRowsValue');
    dom.blankRowsValue = document.getElementById('blankRowsValue');
    dom.parseTimeValue = document.getElementById('parseTimeValue');
    dom.qualityNotes = document.getElementById('qualityNotes');
    dom.histogramGrid = document.getElementById('histogramGrid');
    dom.columnToolbarMeta = document.getElementById('columnToolbarMeta');
    dom.columnTableBody = document.getElementById('columnTableBody');
    dom.previewTableContainer = document.getElementById('previewTableContainer');
    dom.sqlSchemaOutput = document.getElementById('sqlSchemaOutput');
    dom.jsonSchemaOutput = document.getElementById('jsonSchemaOutput');

    dom.datasetFileValue = document.getElementById('datasetFileValue');
    dom.datasetSizeValue = document.getElementById('datasetSizeValue');
    dom.datasetDelimiterValue = document.getElementById('datasetDelimiterValue');
    dom.datasetHeaderValue = document.getElementById('datasetHeaderValue');
    dom.datasetRowsValue = document.getElementById('datasetRowsValue');
    dom.datasetColumnsValue = document.getElementById('datasetColumnsValue');

    dom.loadingOverlay = document.getElementById('loadingOverlay');
    dom.loadingText = document.getElementById('loadingText');
    dom.loadingProgressBar = document.getElementById('loadingProgressBar');
}

function bindEvents() {
    dom.uploadArea.addEventListener('click', () => {
        dom.fileInput.click();
    });

    dom.fileInput.addEventListener('change', () => {
        const [file] = dom.fileInput.files || [];
        if (file) {
            handleSelectedFile(file);
        }
    });

    dom.loadBadSampleButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        applyBadSampleParsingControls();
        await handleSelectedFile(createBadCsvSampleFile());
    });

    dom.loadGoodSampleButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        applyGoodSampleParsingControls();
        await handleSelectedFile(createGoodCsvSampleFile());
    });

    dom.uploadArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        dom.uploadArea.classList.add('dragover');
    });

    dom.uploadArea.addEventListener('dragleave', () => {
        dom.uploadArea.classList.remove('dragover');
    });

    dom.uploadArea.addEventListener('drop', (event) => {
        event.preventDefault();
        dom.uploadArea.classList.remove('dragover');
        const [file] = Array.from(event.dataTransfer?.files || []);
        if (file) {
            handleSelectedFile(file);
        }
    });

    dom.reloadButton.addEventListener('click', () => {
        if (state.file) {
            runProfile(state.file);
        }
    });

    dom.closeFile.addEventListener('click', resetTool);

    dom.delimiterSelect.addEventListener('change', () => {
        state.settings.delimiterMode = dom.delimiterSelect.value;
        if (state.file) {
            runProfile(state.file);
        }
    });

    dom.headerSelect.addEventListener('change', () => {
        state.settings.headerMode = dom.headerSelect.value;
        if (state.file) {
            runProfile(state.file);
        }
    });

    dom.tabs.forEach((tabButton) => {
        tabButton.addEventListener('click', () => {
            setActiveTab(tabButton.dataset.tab);
        });
    });

    dom.columnSearchInput.addEventListener('input', () => {
        state.columnSearch = dom.columnSearchInput.value.trim().toLowerCase();
        renderColumnTable();
    });

    dom.copySqlButton.addEventListener('click', () => {
        handleCopy(dom.sqlSchemaOutput.value, dom.copySqlButtonLabel);
    });

    dom.copyJsonButton.addEventListener('click', () => {
        handleCopy(dom.jsonSchemaOutput.value, dom.copyJsonButtonLabel);
    });

    dom.copySqlInlineButton.addEventListener('click', () => {
        handleCopy(dom.sqlSchemaOutput.value, dom.copySqlInlineLabel);
    });

    dom.copyJsonInlineButton.addEventListener('click', () => {
        handleCopy(dom.jsonSchemaOutput.value, dom.copyJsonInlineLabel);
    });
}

async function handleSelectedFile(file) {
    hideError();

    if (file.size > MAX_FILE_SIZE_BYTES) {
        showError(`This file is ${formatBytes(file.size)}. CSV Profiler blocks anything above ${formatBytes(MAX_FILE_SIZE_BYTES)} to reduce the chance of browser instability.`);
        return;
    }

    state.file = file;
    state.profile = null;
    renderFileShell(file);
    await runProfile(file);
}

async function runProfile(file) {
    hideError();
    setLoadingState(true, 'Reading file...', 0);

    try {
        const fileText = await readFileAsText(file, (progress) => {
            setLoadingState(true, 'Reading file...', progress * 0.2);
        });

        setLoadingState(true, 'Profiling rows...', 0.25);

        const profile = await profileCsvFile({
            fileName: file.name,
            text: fileText,
            delimiterMode: state.settings.delimiterMode,
            headerMode: state.settings.headerMode,
            maxRows: MAX_PROFILE_ROWS,
            onProgress(progress) {
                setLoadingState(true, 'Profiling rows...', 0.25 + (progress * 0.75));
            }
        });

        state.profile = profile;
        renderProfile(file, profile);
        setLoadingState(false);
    } catch (error) {
        console.error(error);
        state.profile = null;
        renderEmptyProfile();
        setLoadingState(false);
        showError(error instanceof Error ? error.message : 'Unable to parse this file.');
    }
}

function renderFileShell(file) {
    dom.fileInfo.classList.add('active');
    dom.fileName.textContent = file.name;
    dom.fileSize.textContent = formatBytes(file.size);
    dom.datasetFileValue.textContent = file.name;
    dom.datasetSizeValue.textContent = formatBytes(file.size);
}

function renderProfile(file, profile) {
    renderFileShell(file);
    dom.analysisContent.classList.add('active');

    dom.copySqlButton.disabled = false;
    dom.copyJsonButton.disabled = false;
    dom.copySqlInlineButton.disabled = false;
    dom.copyJsonInlineButton.disabled = false;

    dom.rowsProfiledValue.textContent = formatInteger(profile.rowsProfiled);
    dom.columnCountValue.textContent = formatInteger(profile.columnCount);
    dom.duplicateRowsValue.textContent = formatInteger(profile.duplicateRows);
    dom.inconsistentRowsValue.textContent = formatInteger(profile.inconsistentRows);
    dom.blankRowsValue.textContent = formatInteger(profile.blankRows);
    dom.parseTimeValue.textContent = formatDuration(profile.parseMs);

    dom.datasetDelimiterValue.textContent = profile.delimiter.label;
    dom.datasetHeaderValue.textContent = profile.headerPresent ? 'Present' : 'Absent';
    dom.datasetRowsValue.textContent = formatInteger(profile.rowsProfiled);
    dom.datasetColumnsValue.textContent = formatInteger(profile.columnCount);

    dom.sqlSchemaOutput.value = profile.sqlSchema;
    dom.jsonSchemaOutput.value = profile.jsonSchema;

    renderQualityNotes();
    renderHistograms();
    renderColumnTable();
    renderPreviewTable();
    setActiveTab(state.activeTab);
}

function renderQualityNotes() {
    dom.qualityNotes.replaceChildren();

    for (const note of state.profile.qualityNotes) {
        const card = createElement('article', `quality-note ${note.level}`);
        const icon = createIcon(note.level);
        const copy = createElement('div');
        const title = createElement('strong', null, note.title);
        const detail = createElement('p', null, note.detail);
        copy.append(title, detail);
        card.append(icon, copy);
        dom.qualityNotes.append(card);
    }
}

function renderHistograms() {
    dom.histogramGrid.replaceChildren();

    if (state.profile.histogramColumns.length === 0) {
        dom.histogramGrid.append(createEmptyState('No numeric columns in the profiled slice.'));
        return;
    }

    for (const histogram of state.profile.histogramColumns) {
        const card = createElement('article', 'histogram-card');
        const title = createElement('h4', null, histogram.name);
        const subtitle = createElement('p', null, `Range ${formatCompactNumber(histogram.min)} to ${formatCompactNumber(histogram.max)}`);
        const bins = createElement('div', 'histogram-bins');
        const maxCount = Math.max(...histogram.bins.map((bin) => bin.count), 1);

        histogram.bins.forEach((bin) => {
            const row = createElement('div', 'histogram-row');
            const label = createElement('span', 'histogram-label', `${formatCompactNumber(bin.start)} to ${formatCompactNumber(bin.end)}`);
            const bar = createElement('div', 'histogram-bar');
            const fill = createElement('div', 'histogram-fill');
            fill.style.width = `${(bin.count / maxCount) * 100}%`;
            bar.append(fill);
            const count = createElement('span', 'histogram-count', formatInteger(bin.count));
            row.append(label, bar, count);
            bins.append(row);
        });

        card.append(title, subtitle, bins);
        dom.histogramGrid.append(card);
    }
}

function renderColumnTable() {
    dom.columnTableBody.replaceChildren();

    if (!state.profile) {
        dom.columnToolbarMeta.textContent = '0 columns shown';
        return;
    }

    if (state.profile.columns.length === 0) {
        dom.columnToolbarMeta.textContent = '0 columns shown';
        const emptyRow = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.append(createEmptyState('No columns were profiled from this file.'));
        emptyRow.append(cell);
        dom.columnTableBody.append(emptyRow);
        return;
    }

    const search = state.columnSearch;
    const filteredColumns = state.profile.columns.filter((column) => {
        if (!search) {
            return true;
        }

        const profileText = buildColumnProfileText(column).toLowerCase();
        const sampleText = column.sampleValues.join(' ').toLowerCase();
        const haystack = `${column.name} ${column.inferredType} ${profileText} ${sampleText}`.toLowerCase();
        return haystack.includes(search);
    });

    dom.columnToolbarMeta.textContent = `${formatInteger(filteredColumns.length)} of ${formatInteger(state.profile.columns.length)} columns shown`;

    if (filteredColumns.length === 0) {
        const emptyRow = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.append(createEmptyState('No columns match the current filter.'));
        emptyRow.append(cell);
        dom.columnTableBody.append(emptyRow);
        return;
    }

    for (const column of filteredColumns) {
        const row = document.createElement('tr');
        row.append(
            renderColumnNameCell(column),
            renderTypeCell(column),
            renderNullCell(column),
            renderDistinctCell(column),
            renderProfileCell(column),
            renderSampleCell(column)
        );
        dom.columnTableBody.append(row);
    }
}

function renderPreviewTable() {
    dom.previewTableContainer.replaceChildren();

    if (!state.profile || state.profile.columns.length === 0) {
        dom.previewTableContainer.append(createEmptyState('No preview available.'));
        return;
    }

    const table = createElement('table', 'preview-table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    for (const column of state.profile.columns) {
        const th = document.createElement('th');
        th.textContent = column.name;
        headerRow.append(th);
    }

    thead.append(headerRow);
    table.append(thead);

    const tbody = document.createElement('tbody');

    if (state.profile.previewRows.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = state.profile.columns.length;
        cell.append(createEmptyState('The file contains no profiled data rows after the header.'));
        row.append(cell);
        tbody.append(row);
    } else {
        for (const previewRow of state.profile.previewRows) {
            const row = document.createElement('tr');
            for (let index = 0; index < state.profile.columns.length; index += 1) {
                const cell = document.createElement('td');
                const value = previewRow[index] || '';
                cell.textContent = value === '' ? 'blank' : truncateText(value, MAX_CELL_PREVIEW_LENGTH);
                row.append(cell);
            }
            tbody.append(row);
        }
    }

    table.append(tbody);
    dom.previewTableContainer.append(table);
}

function renderEmptyProfile() {
    dom.analysisContent.classList.remove('active');
    dom.fileInfo.classList.remove('active');
    dom.copySqlButton.disabled = true;
    dom.copyJsonButton.disabled = true;
    dom.copySqlInlineButton.disabled = true;
    dom.copyJsonInlineButton.disabled = true;

    dom.rowsProfiledValue.textContent = '0';
    dom.columnCountValue.textContent = '0';
    dom.duplicateRowsValue.textContent = '0';
    dom.inconsistentRowsValue.textContent = '0';
    dom.blankRowsValue.textContent = '0';
    dom.parseTimeValue.textContent = '0 ms';

    dom.datasetFileValue.textContent = state.file ? state.file.name : 'No file';
    dom.datasetSizeValue.textContent = state.file ? formatBytes(state.file.size) : '-';
    dom.datasetDelimiterValue.textContent = '-';
    dom.datasetHeaderValue.textContent = '-';
    dom.datasetRowsValue.textContent = '0';
    dom.datasetColumnsValue.textContent = '0';

    dom.qualityNotes.replaceChildren();
    dom.histogramGrid.replaceChildren();
    dom.columnTableBody.replaceChildren();
    dom.previewTableContainer.replaceChildren();
    dom.sqlSchemaOutput.value = '';
    dom.jsonSchemaOutput.value = '';
}

function resetTool() {
    state.file = null;
    state.profile = null;
    state.columnSearch = '';
    dom.fileInput.value = '';
    dom.columnSearchInput.value = '';
    hideError();
    renderEmptyProfile();
}

function applyBadSampleParsingControls() {
    state.settings.delimiterMode = 'comma';
    state.settings.headerMode = 'present';
    dom.delimiterSelect.value = 'comma';
    dom.headerSelect.value = 'present';
}

function applyGoodSampleParsingControls() {
    state.settings.delimiterMode = 'comma';
    state.settings.headerMode = 'present';
    dom.delimiterSelect.value = 'comma';
    dom.headerSelect.value = 'present';
}

function setActiveTab(tabName) {
    state.activeTab = tabName;

    dom.tabs.forEach((tabButton) => {
        const isActive = tabButton.dataset.tab === tabName;
        tabButton.classList.toggle('active', isActive);
        tabButton.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    document.querySelectorAll('.tab-content').forEach((section) => {
        section.classList.toggle('active', section.id === `${tabName}Tab`);
    });
}

function showError(message) {
    dom.errorText.textContent = message;
    dom.errorBanner.classList.add('active');
}

function hideError() {
    dom.errorBanner.classList.remove('active');
    dom.errorText.textContent = '';
}

function setLoadingState(isActive, label = '', progress = 0) {
    dom.loadingOverlay.classList.toggle('active', isActive);
    if (!isActive) {
        dom.loadingProgressBar.style.width = '0%';
        return;
    }

    dom.loadingText.textContent = label;
    dom.loadingProgressBar.style.width = `${Math.min(100, Math.max(0, progress * 100))}%`;
}

function readFileAsText(file, onProgress) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onerror = () => {
            reject(new Error('The selected file could not be read.'));
        };

        reader.onprogress = (event) => {
            if (event.lengthComputable) {
                onProgress?.(event.loaded / event.total);
            }
        };

        reader.onload = () => {
            resolve(String(reader.result || ''));
        };

        reader.readAsText(file);
    });
}

async function handleCopy(text, labelNode) {
    if (!text) {
        return;
    }

    const original = labelNode.textContent;

    try {
        await copyText(text);
        labelNode.textContent = 'Copied';
        window.setTimeout(() => {
            labelNode.textContent = original;
        }, 1400);
    } catch (error) {
        console.error(error);
        showError('Clipboard access failed in this browser context.');
        labelNode.textContent = original;
    }
}

function renderColumnNameCell(column) {
    const cell = document.createElement('td');
    cell.className = 'column-name';
    const name = createElement('strong', null, column.name);
    const meta = createElement('span', null, column.sqlName);
    cell.append(name, meta);
    return cell;
}

function renderTypeCell(column) {
    const cell = document.createElement('td');
    const badge = createElement('span', `type-badge ${column.inferredType}`, column.inferredType.toUpperCase());
    cell.append(badge);
    return cell;
}

function renderNullCell(column) {
    const cell = document.createElement('td');
    cell.className = 'null-cell';

    const value = createElement('div', 'null-value', `${formatPercent(column.nullRate)} (${formatInteger(column.nullCount)})`);
    const bar = createElement('div', 'null-bar');
    const fill = createElement('div', 'null-bar-fill');
    fill.style.width = `${Math.min(100, column.nullRate)}%`;
    bar.append(fill);
    cell.append(value, bar);
    return cell;
}

function renderDistinctCell(column) {
    const cell = document.createElement('td');
    const value = column.distinctOverflow ? `${formatInteger(MAX_UNIQUE_TRACKED)}+` : formatInteger(column.distinctCount || 0);
    cell.textContent = value;
    return cell;
}

function renderProfileCell(column) {
    const cell = document.createElement('td');
    const wrapper = createElement('div', 'profile-metric');
    for (const line of buildColumnProfileLines(column)) {
        wrapper.append(createElement('span', null, line));
    }
    cell.append(wrapper);
    return cell;
}

function renderSampleCell(column) {
    const cell = document.createElement('td');
    const wrapper = createElement('div', 'sample-values');

    if (column.sampleValues.length === 0) {
        wrapper.append(createElement('span', 'profile-muted', 'No non-blank values'));
    } else {
        column.sampleValues.forEach((value) => {
            wrapper.append(createElement('span', null, truncateText(value, MAX_CELL_PREVIEW_LENGTH)));
        });
    }

    cell.append(wrapper);
    return cell;
}

function buildColumnProfileText(column) {
    return buildColumnProfileLines(column).join(' ');
}

function buildColumnProfileLines(column) {
    const lines = [];

    if (column.inferredType === 'integer' || column.inferredType === 'number') {
        lines.push(`Range ${formatCompactNumber(column.minNumber)} to ${formatCompactNumber(column.maxNumber)}`);
    } else if (column.inferredType === 'date' || column.inferredType === 'datetime') {
        lines.push(`Earliest ${column.minDate || 'blank'}`);
        lines.push(`Latest ${column.maxDate || 'blank'}`);
    } else {
        lines.push(`Avg length ${column.averageLength.toFixed(1)}`);
        lines.push(`Max length ${formatInteger(column.maxLength)}`);
    }

    if (column.inferredType === 'mixed') {
        lines.push('Multiple value kinds detected');
    }

    return lines;
}

function createEmptyState(message) {
    const wrapper = createElement('div', 'empty-state');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '3');
    rect.setAttribute('y', '4');
    rect.setAttribute('width', '18');
    rect.setAttribute('height', '16');
    rect.setAttribute('rx', '2');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '7');
    line.setAttribute('y1', '9');
    line.setAttribute('x2', '17');
    line.setAttribute('y2', '9');
    const lineTwo = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    lineTwo.setAttribute('x1', '7');
    lineTwo.setAttribute('y1', '13');
    lineTwo.setAttribute('x2', '17');
    lineTwo.setAttribute('y2', '13');
    icon.append(rect, line, lineTwo);
    const text = createElement('p', null, message);
    wrapper.append(icon, text);
    return wrapper;
}

function createIcon(level) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');

    if (level === 'alert' || level === 'warning') {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z');
        const lineA = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        lineA.setAttribute('x1', '12');
        lineA.setAttribute('y1', '9');
        lineA.setAttribute('x2', '12');
        lineA.setAttribute('y2', '13');
        const lineB = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        lineB.setAttribute('x1', '12');
        lineB.setAttribute('y1', '17');
        lineB.setAttribute('x2', '12.01');
        lineB.setAttribute('y2', '17');
        icon.append(path, lineA, lineB);
    } else {
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '12');
        circle.setAttribute('cy', '12');
        circle.setAttribute('r', '10');
        const lineA = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        lineA.setAttribute('x1', '12');
        lineA.setAttribute('y1', '16');
        lineA.setAttribute('x2', '12');
        lineA.setAttribute('y2', '12');
        const lineB = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        lineB.setAttribute('x1', '12');
        lineB.setAttribute('y1', '8');
        lineB.setAttribute('x2', '12.01');
        lineB.setAttribute('y2', '8');
        icon.append(circle, lineA, lineB);
    }

    return icon;
}

function formatCompactNumber(value) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return 'blank';
    }

    if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.01)) {
        return value.toExponential(2);
    }

    return value.toLocaleString('en-US', {
        maximumFractionDigits: 3
    });
}
