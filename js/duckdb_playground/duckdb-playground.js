/**
 * ============================================
 * DuckDB Playground v2.0.0 - UI Module
 * ============================================
 * User interface layer: rendering, events,
 * theme management, and UI utilities.
 *
 * This is the main entry point that imports and coordinates
 * all UI sub-modules.
 *
 * Project: Tools Hub by Jesse Anderson
 * Repository: https://github.com/jesse-anderson/Tools
 * License: GPL-3.0
 *
 * Last Updated: January 2025
 * ============================================
 */

// Import all UI functionality from split modules
import * as DuckDBCore from './duckdb-init.js';

// Import UI modules
import * as UIInit from './duckdb-ui-init.js';
import * as UIRender from './duckdb-ui-render.js';
import * as UIUtils from './duckdb-ui-utils.js';

// Re-export core functionality
export * from './duckdb-import.js';
export * from './duckdb-operations.js';

// Re-export STATE for inline event handlers
export { DuckDBCore as STATE };

// Make STATE available globally
window.STATE = DuckDBCore.STATE;

// ============================================
// INITIALIZE
// ============================================

UIInit.initPlayground();
