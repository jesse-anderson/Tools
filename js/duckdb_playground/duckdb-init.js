/**
 * ============================================
 * DuckDB Playground v2.0.0 - Init Module
 * ============================================
 * DuckDB WASM initialization and connection management.
 *
 * Project: Tools Hub by Jesse Anderson
 * Repository: https://github.com/jesse-anderson/Tools
 * License: GPL-3.0
 *
 * Last Updated: January 2025
 * ============================================
 */

import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/+esm';
import { STATE } from './duckdb-state.js';
import { showModal, closeModal, closeAllDropdowns, setUIHelpers } from './duckdb-state.js';

// Re-export for UI layer convenience
export { STATE } from './duckdb-state.js';
export { showModal, closeModal, closeAllDropdowns, setUIHelpers } from './duckdb-state.js';

// ============================================
// DUCKDB INITIALIZATION
// ============================================

async function createWorkerFromURL(url) {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobURL = URL.createObjectURL(blob);
    return new Worker(blobURL);
}

export async function initDuckDB(updateLoadingText, hideLoadingOverlay, showToast, showInitError, loadSavedState, refreshSchema, renderQueryTabs) {
    try {
        updateLoadingText('Loading DuckDB bundles...');

        const JSDELIVR_BUNDLES = duckdb.getJsDelivrBundles();

        updateLoadingText('Selecting optimal bundle...');
        const bundle = await duckdb.selectBundle(JSDELIVR_BUNDLES);

        updateLoadingText('Creating worker...');
        const worker = await createWorkerFromURL(bundle.mainWorker);
        const logger = new duckdb.ConsoleLogger();

        updateLoadingText('Instantiating DuckDB...');
        STATE.db = new duckdb.AsyncDuckDB(logger, worker);
        await STATE.db.instantiate(bundle.mainModule, bundle.pthreadWorker);

        updateLoadingText('Creating connection...');
        STATE.conn = await STATE.db.connect();

        STATE.isInitialized = true;
        hideLoadingOverlay();

        showToast('DuckDB initialized successfully', 'success');

        STATE.tables = [];
        await refreshSchema();

        loadSavedState();
        renderQueryTabs();

        await refreshSchema();

    } catch (error) {
        console.error('DuckDB init error:', error);
        STATE.initError = error;
        showInitError(error);
    }
}

export async function checkConnectionHealth() {
    if (!STATE.conn || !STATE.isInitialized) {
        return false;
    }
    try {
        await STATE.conn.query('SELECT 1');
        return true;
    } catch (e) {
        console.error('Connection health check failed:', e);
        return false;
    }
}

export async function ensureConnection(showToast, refreshSchema) {
    const isHealthy = await checkConnectionHealth();
    if (!isHealthy) {
        showToast('Reconnecting to database...', 'warning');
        try {
            if (STATE.conn) {
                try { await STATE.conn.close(); } catch (e) {}
            }
            STATE.conn = await STATE.db.connect();
            STATE.tables = [];
            await refreshSchema();
            showToast('Reconnected successfully', 'success');
            return true;
        } catch (e) {
            showToast('Failed to reconnect. Please refresh the page.', 'error');
            return false;
        }
    }
    return true;
}
