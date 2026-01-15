// ============================================
// PDF Diff Checker - Main Entry Point
// ============================================

/**
 * PDF Diff Checker - Compares two PDFs by extracting text with coordinates
 * and computing document-level diffs with visual highlighting.
 *
 * Project: Tools Hub by Jesse Anderson
 * Repository: https://github.com/jesse-anderson/Tools
 * License: GPL-3.0
 */

// ============================================
// Module Imports
// ============================================

import { state } from './pdf-diff-state.js';
import { getDiffTexts } from './pdf-diff-layout.js';
import { bboxPdfToCanvas } from './pdf-diff-coordinates.js';
import { extractTextFromPDF } from './pdf-diff-extraction.js';
import { computeDiff, getDiffStats, mapDiffsToCoordinates, buildPageDiffMapping } from './pdf-diff-diff.js';
import { renderPage, renderHighlights, clearHighlights } from './pdf-diff-rendering.js';
import { init, handleCompare, handleClear, showError, showWarning, showEdgeCaseWarnings, updateProgress, elements } from './pdf-diff-ui.js';
import { handleExportReport } from './pdf-diff-export.js';

// ============================================
// Global Exports (for debugging)
// ============================================

// Make state and elements available globally for debugging
window.pdfDiffState = state;
window.pdfDiffElements = elements;

// Also make key functions available for debugging
window.pdfDiffRenderPage = renderPage;
window.pdfDiffRenderHighlights = renderHighlights;
window.pdfDiffClearHighlights = clearHighlights;
window.pdfDiffComputeDiff = computeDiff;

// ============================================
// DOM Ready Initialization
// ============================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
