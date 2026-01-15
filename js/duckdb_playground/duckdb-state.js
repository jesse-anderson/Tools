/**
 * ============================================
 * DuckDB Playground v2.0.0 - State Module
 * ============================================
 * Constants, global state, and utility functions.
 *
 * Project: Tools Hub by Jesse Anderson
 * Repository: https://github.com/jesse-anderson/Tools
 * License: GPL-3.0
 *
 * Last Updated: January 2025
 * ============================================
 */

// ============================================
// CONSTANTS
// ============================================
export const FILE_SIZE_LIMIT = 50 * 1024 * 1024; // 50MB
export const EXPERIMENTAL_SIZE_LIMIT = 500 * 1024 * 1024; // 500MB
export const MAX_DISPLAY_ROWS = 1000;
export const MAX_QUERY_TABS = 8;
export const MAX_HISTORY_ITEMS = 50;

// ============================================
// STATE (exported for UI layer access)
// ============================================
export const STATE = {
    db: null,
    conn: null,
    tables: [],
    queryTabs: [{ id: 'tab-1', name: 'Query 1', sql: '' }],
    activeTabId: 'tab-1',
    isQueryRunning: false,
    currentResult: null,
    queryHistory: [],
    experimentalMode: false,
    theme: 'dark',
    isInitialized: false,
    initError: null,
    pendingFile: null,
    pendingSheet: null,
    confirmCallback: null
};

// Make STATE available globally for inline event handlers
window.STATE = STATE;

// ============================================
// UI HELPERS (needed by core logic)
// ============================================
let showModalFn = null;
let closeModalFn = null;
let closeAllDropdownsFn = null;

export function setUIHelpers(showModal, closeModal, closeAllDropdowns) {
    showModalFn = showModal;
    closeModalFn = closeModal;
    closeAllDropdownsFn = closeAllDropdowns;
}

export function showModal(modalId) {
    if (showModalFn) showModalFn(modalId);
    else document.getElementById(modalId)?.classList.add('active');
}

export function closeModal(modalId) {
    if (closeModalFn) closeModalFn(modalId);
    else document.getElementById(modalId)?.classList.remove('active');
}

export function closeAllDropdowns() {
    if (closeAllDropdownsFn) closeAllDropdownsFn();
    else document.querySelectorAll('.dropdown-menu').forEach(menu => menu.classList.remove('active'));
}

// ============================================
// CONFIRM CALLBACKS
// ============================================
export function setConfirmCallback(callback) {
    STATE.confirmCallback = callback;
}

export async function executeConfirmCallback() {
    if (STATE.confirmCallback) {
        await STATE.confirmCallback();
        STATE.confirmCallback = null;
    }
}
