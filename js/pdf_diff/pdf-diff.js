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
import { getDiffTexts, buildDocumentTextSequence, sequenceToPlainText, detectColumns } from './pdf-diff-layout.js';
import { bboxPdfToCanvas, bboxToCanvasSpace } from './pdf-diff-coordinates.js';
import { extractTextFromPDF } from './pdf-diff-extraction.js';
import {
    computeDiff,
    getDiffStats,
    mapDiffsToCoordinates,
    buildPageDiffMapping,
    getTokensInRange,
    mergeBoundingBoxes,
    prepareDiffText,
    encodeWordTokens,
    decodeWordTokens,
    isModificationPair
} from './pdf-diff-diff.js';
import { calculateCharPositions, getCharWidth, splitTextItemToChars } from './pdf-diff-font-metrics.js';
import { computePixelDiff } from './pdf-diff-visual.js';
import { renderPage, renderHighlights, clearHighlights } from './pdf-diff-rendering.js';
import { init, handleCompare, handleClear, showError, showWarning, showEdgeCaseWarnings, updateProgress, elements } from './pdf-diff-ui.js';
import { handleExportReport } from './pdf-diff-export.js';

// ============================================
// Global Exports
// ============================================

// Pure engine surface for the Playwright spec (and console experiments).
// Everything here is DOM-free except computeDiff's dependence on the
// diff-match-patch global loaded by the vendored script tag.
window.PdfDiffEngine = {
    computeDiff,
    getDiffStats,
    mapDiffsToCoordinates,
    buildPageDiffMapping,
    getTokensInRange,
    mergeBoundingBoxes,
    prepareDiffText,
    encodeWordTokens,
    decodeWordTokens,
    isModificationPair,
    buildDocumentTextSequence,
    sequenceToPlainText,
    detectColumns,
    bboxToCanvasSpace,
    calculateCharPositions,
    getCharWidth,
    splitTextItemToChars,
    computePixelDiff
};

// State and elements for debugging and integration tests
window.pdfDiffState = state;
window.pdfDiffElements = elements;

// Key stateful functions for debugging
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
