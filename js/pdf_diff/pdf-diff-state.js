// ============================================
// PDF Diff Checker - State Management
// ============================================

/**
 * Centralized state management for PDF Diff Checker
 * All state is managed here to avoid global namespace pollution
 * and enable easier debugging/testing.
 */

// ============================================
// State Object
// ============================================

const state = {
    // PDF documents
    pdfA: null,
    pdfB: null,

    // File names for display
    fileAName: null,
    fileBName: null,

    // Current page numbers (0-indexed)
    currentPageA: 0,
    currentPageB: 0,

    // Extracted text items with coordinates
    textItemsA: [],
    textItemsB: [],

    // Document text sequences for diffing
    sequenceA: [],
    sequenceB: [],

    // Computed diff results
    diffResults: [],

    // Page-to-diff mapping for rendering highlights
    pageDiffsA: {}, // pageIndex -> array of diffs
    pageDiffsB: {},

    // Processing state
    isProcessing: false,
    processingProgress: 0,

    // Edge case detection
    hasRotatedText: false,
    rotatedTextCount: 0,
    hasMultiColumnLayout: false,
    multiColumnPages: [], // Page indices with multi-column layout
    rotationAngles: [], // Detected rotation angles in PDFs

    // Canvas scale factors for coordinate conversion
    canvasScaleA: 1,
    canvasScaleB: 1,

    // PDF document dimensions (at scale 1.0)
    pdfWidthA: 0,
    pdfHeightA: 0,
    pdfWidthB: 0,
    pdfHeightB: 0,

    // Viewport dimensions for coordinate conversion
    viewportWidthA: 0,
    viewportHeightA: 0,
    viewportWidthB: 0,
    viewportHeightB: 0,

    // Diff engine (diff-match-patch instance)
    diffEngine: null,
};

// ============================================
// State Accessors
// ============================================

/**
 * Get a value from state
 * @param {string} key - State key to retrieve
 * @returns {*} Current value
 */
function getState(key) {
    return state[key];
}

/**
 * Set a value in state
 * @param {string} key - State key to set
 * @param {*} value - Value to set
 */
function setState(key, value) {
    state[key] = value;
}

/**
 * Get the entire state object (for debugging)
 * @returns {Object} Clone of state
 */
function getAllState() {
    return { ...state };
}

/**
 * Set multiple values in state at once
 * @param {Object} updates - Object with key-value pairs to update
 */
function setMultipleState(updates) {
    Object.assign(state, updates);
}

// ============================================
// State Reset
// ============================================

/**
 * Reset all state to initial values
 * Used when clearing the application
 */
function resetState() {
    // Don't destroy PDF documents here - caller should handle that
    state.pdfA = null;
    state.pdfB = null;
    state.fileAName = null;
    state.fileBName = null;
    state.currentPageA = 0;
    state.currentPageB = 0;
    state.textItemsA = [];
    state.textItemsB = [];
    state.sequenceA = [];
    state.sequenceB = [];
    state.diffResults = [];
    state.pageDiffsA = {};
    state.pageDiffsB = {};
    state.pdfWidthA = 0;
    state.pdfHeightA = 0;
    state.pdfWidthB = 0;
    state.pdfHeightB = 0;
    state.viewportWidthA = 0;
    state.viewportHeightA = 0;
    state.viewportWidthB = 0;
    state.viewportHeightB = 0;
    state.canvasScaleA = 1;
    state.canvasScaleB = 1;
    state.diffEngine = null;
    state.isProcessing = false;
    state.processingProgress = 0;
    state.hasRotatedText = false;
    state.rotatedTextCount = 0;
    state.hasMultiColumnLayout = false;
    state.multiColumnPages = [];
    state.rotationAngles = [];
}

/**
 * Reset edge case detection state only
 * Called at the start of each comparison
 */
function resetEdgeCaseState() {
    state.hasRotatedText = false;
    state.rotatedTextCount = 0;
    state.hasMultiColumnLayout = false;
    state.multiColumnPages = [];
    state.rotationAngles = [];
}

// ============================================
// Exports
// ============================================

export {
    state,
    getState,
    setState,
    getAllState,
    setMultipleState,
    resetState,
    resetEdgeCaseState
};
