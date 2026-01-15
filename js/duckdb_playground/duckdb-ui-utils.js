/**
 * ============================================
 * DuckDB Playground v2.0.0 - UI Utils Module
 * ============================================
 * Utilities, toast notifications, modals, and event handler exports.
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
import * as UIInit from './duckdb-ui-init.js';
import * as UIRender from './duckdb-ui-render.js';

export { STATE } from './duckdb-state.js';

// ============================================
// UTILITIES
// ============================================

export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function escapeJsString(str) {
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'");
}

export function formatNumber(num) {
    if (num === null || num === undefined) return '—';
    return num.toLocaleString();
}

export function formatRelativeTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;

    return new Date(timestamp).toLocaleDateString();
}

// ============================================
// TOAST NOTIFICATIONS
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

// ============================================
// MODALS
// ============================================

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

export function handleTableCollision(action) {
    DuckDBCore.handleTableCollision(action, showToast, UIRender.refreshSchemaRender);
}

export function handleImportSelectedSheet() {
    DuckDBCore.importSelectedSheet(showToast, UIRender.refreshSchemaRender);
}

// ============================================
// RESOLVER FUNCTIONS (forward to appropriate modules)
// ============================================

// Schema
export const toggleTableExpand = UIRender.toggleTableExpand;
export const handleTableKeydown = UIRender.handleTableKeydown;
export const previewTable = UIRender.previewTable;
export const confirmDropTable = UIRender.confirmDropTable;

// Query execution
export const handleRunQuery = UIInit.handleRunQuery;
export const handleCancelQuery = UIInit.handleCancelQuery;

// Results
export const clearResults = UIRender.clearResults;

// Tabs
export const handleSwitchTab = UIRender.handleSwitchTab;
export const handleAddTab = UIRender.handleAddTab;
export const handleCloseTab = UIRender.handleCloseTab;
export const handleRenameTab = UIRender.handleRenameTab;

// History
export const handleClearHistory = UIRender.handleClearHistory;

// Charts
export const handleSwitchView = UIRender.handleSwitchView;

// Theme
export const handleSetTheme = UIInit.handleSetTheme;

// Experimental
export const handleToggleExperimentalMode = UIInit.handleToggleExperimentalMode;

// Session
export const handleSaveSession = UIInit.handleSaveSession;
export const handleLoadSession = UIInit.handleLoadSession;

// Sample data
export const handleLoadSampleData = UIInit.handleLoadSampleData;

// Export
export const handleExport = UIInit.handleExport;

// ============================================
// EXPORT FUNCTIONS FOR INLINE EVENT HANDLERS
// ============================================

// Create a global object with all UI functions for inline HTML event handlers
window.duckdbUI = {
    // Tabs
    handleSwitchTab,
    handleAddTab,
    handleCloseTab,
    handleRenameTab,

    // Schema
    toggleTableExpand,
    handleTableKeydown,
    previewTable,
    confirmDropTable,

    // Query
    handleRunQuery,
    handleCancelQuery,

    // History
    handleClearHistory,

    // Export
    handleExport: (format) => handleExport(format),

    // Session
    handleSaveSession,
    handleLoadSession: (files) => handleLoadSession(files),

    // Sample data
    handleLoadSampleData: (dataset) => handleLoadSampleData(dataset),

    // Chart
    handleSwitchView: (view) => handleSwitchView(view),

    // Theme
    handleSetTheme,

    // Experimental
    handleToggleExperimentalMode,

    // Modals
    handleShowShortcutsModal,
    handleShowAboutModal,
    handleConfirmAction,
    handleTableCollision,
    handleImportSelectedSheet,

    // Utilities
    showModal,
    closeModal,
    toggleDropdown,

    // Results
    clearResults
};

// Also export individual functions for backward compatibility
window.handleSwitchTab = handleSwitchTab;
window.addTab = handleAddTab;
window.closeTab = handleCloseTab;
window.renameTab = handleRenameTab;
window.toggleTableExpand = toggleTableExpand;
window.handleTableKeydown = handleTableKeydown;
window.previewTable = previewTable;
window.confirmDropTable = confirmDropTable;
window.runQuery = handleRunQuery;
window.cancelQuery = handleCancelQuery;
window.clearHistory = handleClearHistory;
window.exportResults = handleExport;
window.saveSession = handleSaveSession;
window.loadSession = handleLoadSession;
window.loadSampleData = handleLoadSampleData;
window.switchView = handleSwitchView;
window.setTheme = handleSetTheme;
window.toggleExperimentalMode = handleToggleExperimentalMode;
window.showShortcutsModal = handleShowShortcutsModal;
window.showAboutModal = handleShowAboutModal;
window.confirmAction = handleConfirmAction;
window.handleTableCollision = handleTableCollision;
window.importSelectedSheet = handleImportSelectedSheet;
window.showModal = showModal;
window.closeModal = closeModal;
window.toggleDropdown = toggleDropdown;
window.clearResults = clearResults;
window.showToast = showToast;

// Re-export constants for reference
window.FILE_SIZE_LIMIT = DuckDBCore.FILE_SIZE_LIMIT;
window.EXPERIMENTAL_SIZE_LIMIT = DuckDBCore.EXPERIMENTAL_SIZE_LIMIT;

// Export renderChart globally for theme switching
window.renderChart = UIRender.renderChart;
