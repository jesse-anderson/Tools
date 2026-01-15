/**
 * ============================================
 * DuckDB Playground v2.0.0 - UI Init Module
 * ============================================
 * Initialization, event listeners, and keyboard shortcuts.
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

// Import render functions dynamically to avoid circular deps
let RenderModule = null;

async function getRenderModule() {
    if (!RenderModule) {
        RenderModule = await import('./duckdb-ui-render.js');
    }
    return RenderModule;
}

// Re-export STATE for inline event handlers
export { STATE } from './duckdb-state.js';
export { DuckDBCore };

// Make STATE available globally
window.STATE = DuckDBCore.STATE;

// ============================================
// INITIALIZATION
// ============================================

export async function initPlayground() {
    // Set up UI helpers for core module
    DuckDBCore.setUIHelpers(showModal, closeModal, closeAllDropdowns);

    // Load theme
    const theme = DuckDBCore.loadTheme();
    applyTheme(theme);

    // Load settings
    DuckDBCore.loadSettings();

    // Initialize DuckDB
    await DuckDBCore.initDuckDB(
        updateLoadingText,
        hideLoadingOverlay,
        showToast,
        showInitError,
        loadSavedState,
        refreshSchemaRender,
        renderQueryTabs
    );

    // Set up event listeners
    setupEventListeners();
}

function updateLoadingText(text) {
    document.getElementById('loadingText').textContent = text;
}

function hideLoadingOverlay() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

function showInitError(error) {
    const overlay = document.getElementById('loadingOverlay');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'loading-error';
    errorDiv.innerHTML = `
        <h3>Failed to Initialize DuckDB</h3>
        <p>There was an error starting the database engine. This may be due to browser compatibility issues.</p>
        <details>
            <summary>Technical Details</summary>
            <pre></pre>
        </details>
        <button class="btn btn-primary" onclick="location.reload()">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"/>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                Retry
            </button>
            <p style="margin-top: 16px; font-size: 0.75rem;">
                <a href="https://duckdb.org/docs/api/wasm/overview" target="_blank" style="color: var(--accent-primary);">
                    Check browser compatibility →
                </a>
            </p>
        </div>
    `;
    errorDiv.querySelector('pre').textContent = `${error.message}\n${error.stack || ''}`;
    overlay.innerHTML = '';
    overlay.appendChild(errorDiv);
}

async function loadSavedState() {
    DuckDBCore.loadTabs();
    DuckDBCore.loadHistory();
    const Render = await getRenderModule();
    Render.renderHistory();
    const activeTab = DuckDBCore.STATE.queryTabs.find(t => t.id === DuckDBCore.STATE.activeTabId);
    if (activeTab) {
        const editor = document.getElementById('sqlEditor');
        if (editor) editor.value = activeTab.sql || '';
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Drop zone events
    const dropZone = document.getElementById('fileDropZone');
    if (dropZone) {
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                DuckDBCore.handleFileSelect(e.dataTransfer.files, showToast, refreshSchemaRender);
            }
        });

        dropZone.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                document.getElementById('fileInput').click();
            }
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Tab key in editor
    const sqlEditor = document.getElementById('sqlEditor');
    if (sqlEditor) {
        sqlEditor.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const editor = e.target;
                const start = editor.selectionStart;
                const end = editor.selectionEnd;
                editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
                editor.selectionStart = editor.selectionEnd = start + 2;
            }
        });

        sqlEditor.addEventListener('input', () => {
            DuckDBCore.saveTabs();
        });
    }

    // Close modals on outside click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            closeAllDropdowns();
        }
    });

    // Visibility change - check connection health
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Storage event from other tabs
    window.addEventListener('storage', (e) => {
        if (e.key && e.key.startsWith('duckdb_playground_')) {
            showToast('Session modified in another tab. Refresh to sync.', 'warning');
        }
    });
}

export function handleKeyboardShortcuts(e) {
    // Shift+Enter - Run query
    if (e.shiftKey && e.key === 'Enter') {
        e.preventDefault();
        handleRunQuery();
        return;
    }

    // Escape - Cancel query or close modal
    if (e.key === 'Escape') {
        if (DuckDBCore.STATE.isQueryRunning) {
            handleCancelQuery();
        } else {
            document.querySelectorAll('.modal-overlay.active').forEach(modal => {
                modal.classList.remove('active');
            });
        }
        return;
    }

    // Ctrl+/ - Show shortcuts
    if (e.ctrlKey && e.key === '/') {
        e.preventDefault();
        showModal('shortcutsModal');
        return;
    }

    // Ctrl+S - Save session
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSaveSession();
        return;
    }

    // Ctrl+L - Clear results
    if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        clearResults();
        return;
    }

    // Ctrl+1-8 - Switch tabs
    if (e.ctrlKey && e.key >= '1' && e.key <= '8') {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        const tabs = DuckDBCore.STATE.queryTabs;
        if (tabs[index]) {
            handleSwitchTab(tabs[index].id);
        }
        return;
    }
}

async function handleVisibilityChange() {
    if (document.visibilityState === 'visible' && DuckDBCore.STATE.isInitialized) {
        try {
            const isHealthy = await DuckDBCore.checkConnectionHealth();
            if (isHealthy) {
                await refreshSchemaRender();
            } else {
                DuckDBCore.STATE.tables = [];
                const Render = await getRenderModule();
                Render.renderSchema();
                showToast('Database connection was reset. Please reload your data.', 'warning');
            }
        } catch (e) {
            console.error('Visibility change refresh error:', e);
        }
    }
}

// ============================================
// QUERY EXECUTION UI
// ============================================

export async function handleRunQuery() {
    const Render = await getRenderModule();
    const sql = document.getElementById('sqlEditor').value.trim();
    updateRunButton(true);

    DuckDBCore.runQuery(
        sql,
        showToast,
        Render.addToHistoryUI,
        Render.showMetrics,
        Render.displayResults,
        Render.showError,
        refreshSchemaRender
    ).finally(() => {
        updateRunButton(false);
    });
}

export function handleCancelQuery() {
    showToast('Query cancellation requested', 'warning');
}

function updateRunButton(running) {
    const runBtn = document.getElementById('runQueryBtn');
    const cancelBtn = document.getElementById('cancelQueryBtn');

    if (running) {
        runBtn.disabled = true;
        runBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" class="spin">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 6v6l4 2"/>
            </svg>
            Running...
        `;
        cancelBtn.style.display = 'inline-flex';
    } else {
        runBtn.disabled = false;
        runBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Run Query
        `;
        cancelBtn.style.display = 'none';
    }
}

// ============================================
// THEME
// ============================================

export async function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);

    document.querySelectorAll('.theme-toggle button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });

    // Update chart if visible
    const Render = await getRenderModule();
    if (Render.getChartInstance && Render.getChartInstance()) {
        Render.renderChart();
    }
}

export function handleSetTheme(theme) {
    DuckDBCore.setTheme(theme);
    applyTheme(theme);
}

// ============================================
// EXPERIMENTAL MODE
// ============================================

export function handleToggleExperimentalMode() {
    const enabled = DuckDBCore.toggleExperimentalMode();
    const toggle = document.getElementById('experimentalToggle');
    if (toggle) toggle.checked = enabled;

    if (enabled) {
        showToast('Experimental mode enabled. Large files (up to 500MB) now allowed.', 'warning');
    } else {
        showToast('Experimental mode disabled', 'info');
    }
}

// ============================================
// SESSION SAVE/LOAD UI
// ============================================

export async function handleSaveSession() {
    DuckDBCore.saveSession(showToast);
}

export async function handleLoadSession(files) {
    const Render = await getRenderModule();
    DuckDBCore.loadSession(files, showToast, Render.renderQueryTabs);
}

// ============================================
// SAMPLE DATA UI
// ============================================

export async function handleLoadSampleData(dataset) {
    DuckDBCore.loadSampleData(dataset, showToast, refreshSchemaRender);
}

// ============================================
// EXPORT UI
// ============================================

export function handleExport(format) {
    const sql = document.getElementById('sqlEditor').value;
    DuckDBCore.exportResults(format, sql, showToast);
}

// ============================================
// FORWARDING FUNCTIONS (delegates to render module)
// ============================================

export async function refreshSchemaRender() {
    const Render = await getRenderModule();
    await Render.refreshSchemaRender();
}

export async function renderSchema() {
    const Render = await getRenderModule();
    Render.renderSchema();
}

export async function renderQueryTabs() {
    const Render = await getRenderModule();
    Render.renderQueryTabs();
}

export async function renderHistory() {
    const Render = await getRenderModule();
    Render.renderHistory();
}

export async function addToHistoryUI(entry) {
    const Render = await getRenderModule();
    Render.addToHistoryUI(entry);
}

export async function showMetrics(data) {
    const Render = await getRenderModule();
    Render.showMetrics(data);
}

export async function displayResults(result) {
    const Render = await getRenderModule();
    Render.displayResults(result);
}

export async function showError(error) {
    const Render = await getRenderModule();
    Render.showError(error);
}

export async function clearResults() {
    const Render = await getRenderModule();
    Render.clearResults();
}

export async function handleSwitchTab(tabId) {
    const Render = await getRenderModule();
    Render.handleSwitchTab(tabId);
}

export async function handleAddTab() {
    const Render = await getRenderModule();
    const newId = DuckDBCore.addTab();
    if (newId) {
        Render.handleSwitchTab(newId);
    }
}

export async function handleCloseTab(tabId) {
    const Render = await getRenderModule();
    Render.handleCloseTab(tabId);
}

export async function handleRenameTab(tabId) {
    const Render = await getRenderModule();
    Render.handleRenameTab(tabId);
}

export async function toggleTableExpand(element) {
    const Render = await getRenderModule();
    Render.toggleTableExpand(element);
}

export async function handleTableKeydown(event, element) {
    const Render = await getRenderModule();
    Render.handleTableKeydown(event, element);
}

export async function previewTable(tableName) {
    const Render = await getRenderModule();
    Render.previewTable(tableName);
}

export async function confirmDropTable(tableName) {
    const Render = await getRenderModule();
    Render.confirmDropTable(tableName);
}

export async function handleClearHistory() {
    const Render = await getRenderModule();
    Render.handleClearHistory();
}

export async function handleSwitchView(view) {
    const Render = await getRenderModule();
    Render.handleSwitchView(view);
}

// ============================================
// UTILITIES
// ============================================

export function showToast(message, type = 'info') {
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

export function showModal(modalId) {
    document.getElementById(modalId)?.classList.add('active');
}

export function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
}

export function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu').forEach(menu => {
        menu.classList.remove('active');
    });
}

export function toggleDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (dropdown) {
        const menu = dropdown.querySelector('.dropdown-menu');
        if (menu) {
            menu.classList.toggle('active');
        }
    }
}

export function handleShowShortcutsModal() {
    showModal('shortcutsModal');
}

export function handleShowAboutModal() {
    showModal('aboutModal');
}

export async function handleConfirmAction() {
    closeModal('confirmModal');
    await DuckDBCore.executeConfirmCallback();
}

export async function handleTableCollision(action) {
    const Render = await getRenderModule();
    DuckDBCore.handleTableCollision(action, showToast, Render.refreshSchemaRender);
}

export function handleImportSelectedSheet() {
    DuckDBCore.importSelectedSheet(showToast, refreshSchemaRender);
}
