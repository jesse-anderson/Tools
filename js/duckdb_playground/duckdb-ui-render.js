/**
 * ============================================
 * DuckDB Playground v2.0.0 - UI Render Module
 * ============================================
 * Schema rendering, results display, charts, tabs UI, history UI.
 *
 * Project: Tools Hub by Jesse Anderson
 * Repository: https://github.com/jesse-anderson/Tools
 * License: GPL-3.0
 *
 * Last Updated: January 2025
 * ============================================
 */

import * as DuckDBCore from './duckdb-init.js';
import { STATE } from './duckdb-state.js';

// Chart instance shared across modules
let chartInstance = null;
export function getChartInstance() {
    return chartInstance;
}
export function setChartInstance(instance) {
    chartInstance = instance;
}

// ============================================
// UTILITIES (local to avoid circular deps)
// ============================================

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeJsString(str) {
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

function formatNumber(num) {
    if (num === null || num === undefined) return '—';
    return num.toLocaleString();
}

function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;

    return new Date(timestamp).toLocaleDateString();
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');

    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    toast.innerHTML = icons[type] || icons.info;
    const messageSpan = document.createElement('span');
    messageSpan.textContent = message;
    toast.appendChild(messageSpan);
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
}

// Re-export utilities for other modules
export { escapeHtml, escapeJsString, formatNumber, formatRelativeTime, showToast, showModal };

// ============================================
// SCHEMA EXPLORER RENDERING
// ============================================

export async function refreshSchemaRender() {
    await DuckDBCore.refreshSchema();
    renderSchema();
}

export function renderSchema() {
    const tableList = document.getElementById('schemaTableList');
    const emptyState = document.getElementById('schemaEmptyState');
    const tableCount = document.getElementById('tableCount');

    if (!tableList) return;

    const tables = DuckDBCore.STATE.tables;

    if (tables.length === 0) {
        emptyState.style.display = 'flex';
        tableList.innerHTML = '';
        tableCount.textContent = '0 tables';
        return;
    }

    emptyState.style.display = 'none';
    tableCount.textContent = `${tables.length} table${tables.length !== 1 ? 's' : ''}`;

    tableList.innerHTML = tables.map(table => {
        const escapedName = escapeHtml(table.name);
        const jsEscapedName = escapeJsString(table.name);
        return `
        <div class="table-item" data-table="${escapedName}" tabindex="0" role="button" aria-expanded="false" onclick="window.duckdbUI?.toggleTableExpand?.(this)" onkeydown="window.duckdbUI?.handleTableKeydown?.(event, this)">
            <div class="table-header">
                <span class="table-name">${escapedName}</span>
                <div class="table-meta">
                    <span class="row-count">${table.rowCount !== null ? formatNumber(table.rowCount) + ' rows' : '? rows'}</span>
                    <div class="table-actions" onclick="event.stopPropagation()">
                        <button class="table-action-btn" onclick="window.duckdbUI?.previewTable?.('${jsEscapedName}')" title="Preview" aria-label="Preview table ${escapedName}">👁</button>
                        <button class="table-action-btn danger" onclick="window.duckdbUI?.confirmDropTable?.('${jsEscapedName}')" title="Drop" aria-label="Drop table ${escapedName}">×</button>
                    </div>
                </div>
            </div>
            <div class="column-list">
                ${table.columns.map(col => `
                    <div class="column-item">
                        <span class="column-name">${escapeHtml(col.name)}</span>
                        <span class="column-type">${escapeHtml(col.type)}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `}).join('');
}

export async function handleTableKeydown(event, element) {
    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleTableExpand(element);
    }
}

export async function toggleTableExpand(element) {
    const wasExpanded = element.classList.contains('expanded');
    element.classList.toggle('expanded');
    element.setAttribute('aria-expanded', !wasExpanded);

    if (!wasExpanded) {
        const tableName = element.dataset.table;
        const table = DuckDBCore.STATE.tables.find(t => t.name === tableName);

        if (table && table.rowCount === null) {
            try {
                const count = await DuckDBCore.getTableRowCount(tableName);
                table.rowCount = count;

                const rowCountEl = element.querySelector('.row-count');
                if (rowCountEl) {
                    rowCountEl.textContent = formatNumber(count) + ' rows';
                }
            } catch (e) {
                console.error('Error counting rows:', e);
            }
        }
    }
}

export function previewTable(tableName) {
    const editor = document.getElementById('sqlEditor');
    if (editor) {
        editor.value = `SELECT * FROM "${tableName}" LIMIT 100;`;
    }
    // Import and call handleRunQuery from ui-init
    import('./duckdb-ui-init.js').then(m => m.handleRunQuery());
}

export function confirmDropTable(tableName) {
    DuckDBCore.setConfirmCallback(async () => {
        await DuckDBCore.dropTable(tableName, refreshSchemaRender, showToast);
    });
    document.getElementById('confirmTitle').textContent = 'Drop Table';
    document.getElementById('confirmMessage').textContent = `Are you sure you want to drop table '${tableName}'? This cannot be undone.`;
    // Import and call showModal from utils
    import('./duckdb-ui-utils.js').then(m => m.showModal('confirmModal'));
}

// ============================================
// RESULTS DISPLAY
// ============================================

export function displayResults(result) {
    const wrapper = document.getElementById('resultsTableWrapper');
    const emptyState = document.getElementById('resultsEmptyState');
    const errorDisplay = document.getElementById('errorDisplay');
    const footer = document.getElementById('resultsFooter');
    const resultsInfo = document.getElementById('resultsInfo');
    const viewToggle = document.getElementById('viewToggle');

    if (!wrapper) return;

    errorDisplay.style.display = 'none';

    const rows = result.toArray();
    const schema = result.schema;
    const columnNames = schema.fields.map(f => f.name);
    const columnTypes = schema.fields.map(f => f.type.toString());

    if (rows.length === 0) {
        wrapper.style.display = 'none';
        emptyState.style.display = 'flex';
        emptyState.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M16 12H8"/>
            </svg>
            <p>Query executed successfully. No rows returned.</p>
        `;
        footer.style.display = 'none';
        viewToggle.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    wrapper.style.display = 'block';
    footer.style.display = 'flex';

    const maxDisplay = DuckDBCore.MAX_DISPLAY_ROWS;
    const displayRows = rows.slice(0, maxDisplay);
    const truncated = rows.length > maxDisplay;

    resultsInfo.textContent = truncated
        ? `Showing ${formatNumber(maxDisplay)} of ${formatNumber(rows.length)} rows`
        : `${formatNumber(rows.length)} row${rows.length !== 1 ? 's' : ''}`;

    // Build table HTML
    let html = '<table class="results-table" role="grid"><thead><tr>';

    for (let i = 0; i < columnNames.length; i++) {
        html += `<th>${escapeHtml(columnNames[i])}<span class="type-badge">${escapeHtml(columnTypes[i])}</span></th>`;
    }

    html += '</tr></thead><tbody>';

    const columnTypeMap = {};
    for (let i = 0; i < columnNames.length; i++) {
        columnTypeMap[columnNames[i]] = columnTypes[i];
    }

    for (const row of displayRows) {
        html += '<tr>';
        for (const col of columnNames) {
            const value = row[col];
            const colType = columnTypeMap[col];
            html += `<td>${formatCellValue(value, colType)}</td>`;
        }
        html += '</tr>';
    }

    html += '</tbody></table>';
    wrapper.innerHTML = html;

    // Check if chartable
    const chartable = isChartable(columnNames, columnTypes, rows.length);
    viewToggle.style.display = chartable ? 'flex' : 'none';
}

function formatCellValue(value, colType = '') {
    if (value === null || value === undefined) {
        return '<span class="cell-null">NULL</span>';
    }

    if (value instanceof Uint8Array) {
        const size = value.length;
        const sizeStr = size < 1024 ? `${size}B` : `${(size/1024).toFixed(1)}KB`;
        return `<span class="cell-blob">[BLOB: ${sizeStr}]</span>`;
    }

    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    const colTypeLower = colType.toLowerCase();

    if (colTypeLower.includes('date') || colTypeLower.includes('timestamp') || colTypeLower.includes('time')) {
        try {
            let dateObj;

            if (value instanceof Date) {
                dateObj = value;
            } else if (typeof value === 'bigint') {
                dateObj = new Date(Number(value));
            } else if (typeof value === 'number') {
                dateObj = new Date(value);
            } else if (typeof value === 'string') {
                return escapeHtml(value);
            } else {
                return escapeHtml(String(value));
            }

            if (colTypeLower.includes('timestamp')) {
                return escapeHtml(dateObj.toISOString().replace('T', ' ').replace('Z', ''));
            } else if (colTypeLower.includes('date')) {
                return escapeHtml(dateObj.toISOString().split('T')[0]);
            } else if (colTypeLower.includes('time') && !colTypeLower.includes('timestamp')) {
                return escapeHtml(dateObj.toISOString().split('T')[1].replace('Z', ''));
            }

            return escapeHtml(dateObj.toISOString());
        } catch (e) {
            console.warn('Date formatting error:', e, value);
        }
    }

    if (typeof value === 'bigint') {
        return formatNumber(Number(value));
    }

    if (typeof value === 'number') {
        return formatNumber(value);
    }

    if (value instanceof Date) {
        return escapeHtml(value.toISOString().split('T')[0]);
    }

    const str = String(value);
    if (str.length > 200) {
        return `<span title="${escapeHtml(str)}">${escapeHtml(str.substring(0, 200))}...</span>`;
    }

    return escapeHtml(str);
}

export function showError(error) {
    const errorDisplay = document.getElementById('errorDisplay');
    const wrapper = document.getElementById('resultsTableWrapper');
    const emptyState = document.getElementById('resultsEmptyState');
    const footer = document.getElementById('resultsFooter');
    const viewToggle = document.getElementById('viewToggle');

    if (!errorDisplay) return;

    wrapper.style.display = 'none';
    emptyState.style.display = 'none';
    footer.style.display = 'none';
    viewToggle.style.display = 'none';

    let errorType = 'Query Error';
    if (error.message.includes('syntax')) errorType = 'Syntax Error';
    if (error.message.includes('does not exist')) errorType = 'Table Not Found';
    if (error.message.includes('column')) errorType = 'Column Error';

    errorDisplay.style.display = 'block';
    errorDisplay.innerHTML = `
        <h4>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            ${errorType}
        </h4>
        <pre>${escapeHtml(error.message)}</pre>
    `;
}

export function clearResults() {
    DuckDBCore.STATE.currentResult = null;

    const wrapper = document.getElementById('resultsTableWrapper');
    const errorDisplay = document.getElementById('errorDisplay');
    const emptyState = document.getElementById('resultsEmptyState');
    const footer = document.getElementById('resultsFooter');
    const metricsPanel = document.getElementById('metricsPanel');
    const viewToggle = document.getElementById('viewToggle');

    if (wrapper) {
        wrapper.style.display = 'none';
        wrapper.innerHTML = '';
    }
    if (errorDisplay) errorDisplay.style.display = 'none';
    if (emptyState) {
        emptyState.style.display = 'flex';
        emptyState.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
            <p>Run a query to see results</p>
        `;
    }
    if (footer) footer.style.display = 'none';
    if (metricsPanel) metricsPanel.style.display = 'none';
    if (viewToggle) viewToggle.style.display = 'none';
}

// ============================================
// METRICS DISPLAY
// ============================================

export function showMetrics(data) {
    const panel = document.getElementById('metricsPanel');
    if (!panel) return;

    panel.style.display = 'block';

    const timeCard = document.getElementById('metricTime');
    const rowsCard = document.getElementById('metricRows');
    const statusCard = document.getElementById('metricStatus');
    const memoryCard = document.getElementById('metricMemory');

    timeCard.querySelector('.metric-value').innerHTML = `${data.time.toFixed(2)}<span class="metric-unit">ms</span>`;
    rowsCard.querySelector('.metric-value').textContent = formatNumber(data.rows);

    statusCard.classList.remove('success', 'error');
    if (data.status === 'OK') {
        statusCard.classList.add('success');
        statusCard.querySelector('.metric-value').innerHTML = '✓ OK';
    } else {
        statusCard.classList.add('error');
        statusCard.querySelector('.metric-value').innerHTML = '✗ Error';
    }

    if (performance.memory) {
        const usedMB = (performance.memory.usedJSHeapSize / 1024 / 1024).toFixed(1);
        memoryCard.querySelector('.metric-value').innerHTML = `${usedMB}<span class="metric-unit">MB</span>`;
    } else {
        memoryCard.querySelector('.metric-value').innerHTML = '—';
    }
}

// ============================================
// QUERY TABS UI
// ============================================

export function renderQueryTabs() {
    const tabsContainer = document.getElementById('queryTabs');
    if (!tabsContainer) return;

    const tabs = DuckDBCore.STATE.queryTabs;
    const activeTabId = DuckDBCore.STATE.activeTabId;

    let html = tabs.map(tab => {
        const jsEscapedId = escapeJsString(tab.id);
        const escapedName = escapeHtml(tab.name);
        return `
        <button class="query-tab ${tab.id === activeTabId ? 'active' : ''}"
                data-tab-id="${escapeHtml(tab.id)}"
                onclick="window.duckdbUI?.handleSwitchTab?.('${jsEscapedId}')"
                ondblclick="window.duckdbUI?.handleRenameTab?.('${jsEscapedId}')">
            <span>${escapedName}</span>
            ${tabs.length > 1 ? `
                <span class="close-tab" onclick="event.stopPropagation(); window.duckdbUI?.handleCloseTab?.('${jsEscapedId}')">×</span>
            ` : ''}
        </button>
    `}).join('');

    html += `
        <button class="add-tab-btn" onclick="window.duckdbUI?.handleAddTab?.()" ${tabs.length >= DuckDBCore.MAX_QUERY_TABS ? 'disabled' : ''} title="Add new tab">
            +
        </button>
    `;

    tabsContainer.innerHTML = html;
}

export function handleSwitchTab(tabId) {
    const sql = DuckDBCore.switchTab(tabId);
    const editor = document.getElementById('sqlEditor');
    if (editor && sql !== null) {
        editor.value = sql;
    }
    renderQueryTabs();
    DuckDBCore.saveTabs();
}

export function handleAddTab() {
    const newId = DuckDBCore.addTab();
    if (newId) {
        handleSwitchTab(newId);
    }
}

export function handleCloseTab(tabId) {
    const newActiveTab = DuckDBCore.closeTab(tabId);
    if (newActiveTab) {
        const editor = document.getElementById('sqlEditor');
        if (editor) editor.value = newActiveTab.sql || '';
    }
    renderQueryTabs();
    DuckDBCore.saveTabs();
}

export function handleRenameTab(tabId) {
    const tab = DuckDBCore.STATE.queryTabs.find(t => t.id === tabId);
    if (!tab) return;

    const newName = prompt('Enter new tab name:', tab.name);
    if (DuckDBCore.renameTab(tabId, newName)) {
        renderQueryTabs();
        DuckDBCore.saveTabs();
    }
}

// ============================================
// HISTORY UI
// ============================================

export function addToHistoryUI(entry) {
    DuckDBCore.addToHistory(entry);
    renderHistory();
    DuckDBCore.saveHistory();
}

export function renderHistory() {
    const list = document.getElementById('historyList');
    if (!list) return;

    const history = DuckDBCore.getHistory(20);

    if (history.length === 0) {
        list.innerHTML = `
            <div class="empty-state" style="padding: 16px; min-height: auto;">
                <p style="font-size: 0.75rem;">No queries yet.</p>
            </div>
        `;
        return;
    }

    list.innerHTML = history.map((entry, index) => {
        const tableDisplay = entry.tables && entry.tables.length > 0
            ? `<div class="history-tables-row"><span class="history-tables-label">Tables:</span> <span class="history-tables">${entry.tables.map(t => escapeHtml(t)).join(', ')}</span></div>`
            : '';

        const resultInfo = entry.error
            ? `<span class="history-error-badge">Error</span>`
            : `<span>${entry.durationMs.toFixed(0)}ms</span><span>${formatNumber(entry.rowCount || 0)} rows</span>`;

        return `
            <div class="history-item ${entry.error ? 'error' : ''}" data-history-index="${index}" role="button" tabindex="0">
                <div class="history-sql">${escapeHtml(entry.sql.substring(0, 80))}${entry.sql.length > 80 ? '...' : ''}</div>
                ${tableDisplay}
                <div class="history-meta">
                    <span>${formatRelativeTime(entry.timestamp)}</span>
                    <span class="history-results">${resultInfo}</span>
                </div>
            </div>
        `;
    }).join('');

    // Add event listeners
    list.querySelectorAll('.history-item[data-history-index]').forEach(item => {
        const handler = () => {
            const index = parseInt(item.dataset.historyIndex);
            const sql = DuckDBCore.getHistorySQL(index);
            if (sql) {
                const editor = document.getElementById('sqlEditor');
                if (editor) editor.value = sql;
            }
        };
        item.addEventListener('click', handler);
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handler();
            }
        });
    });
}

export function handleClearHistory() {
    DuckDBCore.clearHistory();
    renderHistory();
    DuckDBCore.saveHistory();
    showToast('History cleared', 'success');
}

// ============================================
// CHARTING
// ============================================

function isChartable(columnNames, columnTypes, rowCount) {
    if (rowCount > 1000 || rowCount === 0) return false;

    const numericCount = columnTypes.filter(t =>
        t.includes('INT') || t.includes('DECIMAL') || t.includes('FLOAT') || t.includes('DOUBLE')
    ).length;

    const hasTextOrDate = columnTypes.some(t =>
        t.includes('VARCHAR') || t.includes('DATE') || t.includes('TIME')
    );

    return numericCount >= 1 && numericCount <= 3 && hasTextOrDate;
}

export function handleSwitchView(view) {
    document.querySelectorAll('#viewToggle button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });

    const tableWrapper = document.getElementById('resultsTableWrapper');
    const chartContainer = document.getElementById('chartContainer');

    if (view === 'table') {
        tableWrapper.style.display = 'block';
        chartContainer.classList.remove('active');
    } else {
        tableWrapper.style.display = 'none';
        chartContainer.classList.add('active');
        renderChart();
    }
}

export function renderChart() {
    if (!DuckDBCore.STATE.currentResult || !window.Chart) return;

    const rows = DuckDBCore.STATE.currentResult.toArray();
    const schema = DuckDBCore.STATE.currentResult.schema;
    const columnNames = schema.fields.map(f => f.name);
    const columnTypes = schema.fields.map(f => f.type.toString());

    let labelCol = null;
    const valueCols = [];

    for (let i = 0; i < columnNames.length; i++) {
        const type = columnTypes[i];
        if (!labelCol && (type.includes('VARCHAR') || type.includes('DATE'))) {
            labelCol = columnNames[i];
        } else if (type.includes('INT') || type.includes('DECIMAL') || type.includes('FLOAT') || type.includes('DOUBLE')) {
            valueCols.push(columnNames[i]);
        }
    }

    if (!labelCol || valueCols.length === 0) return;

    const labels = rows.map(r => String(r[labelCol]));
    const datasets = valueCols.slice(0, 3).map((col, i) => ({
        label: col,
        data: rows.map(r => Number(r[col]) || 0),
        backgroundColor: [
            'rgba(6, 182, 212, 0.7)',
            'rgba(34, 197, 94, 0.7)',
            'rgba(234, 179, 8, 0.7)'
        ][i],
        borderColor: [
            'rgb(6, 182, 212)',
            'rgb(34, 197, 94)',
            'rgb(234, 179, 8)'
        ][i],
        borderWidth: 1
    }));

    const isDateColumn = columnTypes[columnNames.indexOf(labelCol)]?.includes('DATE');
    const chartType = isDateColumn ? 'line' : 'bar';

    if (chartInstance) {
        chartInstance.destroy();
    }

    const ctx = document.getElementById('resultsChart').getContext('2d');
    const newChartInstance = new Chart(ctx, {
        type: chartType,
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: getComputedStyle(document.body).getPropertyValue('--text-primary')
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') },
                    grid: { color: getComputedStyle(document.body).getPropertyValue('--border-color') }
                },
                y: {
                    ticks: { color: getComputedStyle(document.body).getPropertyValue('--text-secondary') },
                    grid: { color: getComputedStyle(document.body).getPropertyValue('--border-color') }
                }
            }
        }
    });
    setChartInstance(newChartInstance);
}
