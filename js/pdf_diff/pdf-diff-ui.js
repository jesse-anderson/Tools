// ============================================
// PDF Diff Checker - UI & Event Handlers
// ============================================

/**
 * User interface management and event handling
 * Handles file uploads, page navigation, comparison execution, and user feedback
 */

import { state, resetEdgeCaseState } from './pdf-diff-state.js';
import { extractTextFromPDF } from './pdf-diff-extraction.js';
import { computeDiff, getDiffStats, mapDiffsToCoordinates, buildPageDiffMapping } from './pdf-diff-diff.js';
import { renderPage, updatePageIndicator, updateNavigationButtons, init as initRendering } from './pdf-diff-rendering.js';
import { handleExportReport } from './pdf-diff-export.js';
import { getDiffTexts } from './pdf-diff-layout.js';

// ============================================
// DOM Elements
// ============================================

const elements = {
    // Upload
    pdfAInput: null,
    pdfBInput: null,
    pdfAInfo: null,
    pdfBInfo: null,
    compareBtn: null,
    clearBtn: null,

    // Progress
    progressSection: null,
    progressFill: null,
    progressText: null,

    // Comparison
    comparisonSection: null,
    canvasA: null,
    canvasB: null,
    overlayA: null,
    overlayB: null,
    canvasContainerA: null,
    canvasContainerB: null,

    // Page navigation
    prevPageA: null,
    nextPageA: null,
    prevPageB: null,
    nextPageB: null,
    pageIndicatorA: null,
    pageIndicatorB: null,

    // Summary
    summarySection: null,
    insertionCount: null,
    deletionCount: null,
    modificationCount: null,
    exportReportBtn: null,

    // Modal
    licensesModal: null,
    closeLicenses: null,
    viewLicensesBtn: null,
};

// ============================================
// Initialization
// ============================================

/**
 * Initialize the UI module
 * Verifies DOM elements, caches references, and binds event listeners
 */
function init() {
    // Verify required DOM elements exist
    const requiredIds = [
        'pdfAInput', 'pdfBInput', 'pdfAInfo', 'pdfBInfo',
        'compareBtn', 'clearBtn', 'progressSection', 'progressFill', 'progressText',
        'comparisonSection', 'canvasA', 'canvasB', 'overlayA', 'overlayB',
        'canvasContainerA', 'canvasContainerB',
        'prevPageA', 'nextPageA', 'prevPageB', 'nextPageB',
        'pageIndicatorA', 'pageIndicatorB',
        'summarySection', 'insertionCount', 'deletionCount', 'modificationCount',
        'exportReportBtn', 'viewLicensesBtn', 'licensesModal', 'closeLicenses'
    ];

    const missing = requiredIds.filter(id => !document.getElementById(id));
    if (missing.length > 0) {
        console.error(`PDF Diff: Missing required DOM elements: ${missing.join(', ')}`);
        return;
    }

    // Cache DOM elements
    cacheElements();

    // Initialize rendering module with element references
    initRendering({
        canvasA: elements.canvasA,
        canvasB: elements.canvasB,
        overlayA: elements.overlayA,
        overlayB: elements.overlayB,
        canvasContainerA: elements.canvasContainerA,
        canvasContainerB: elements.canvasContainerB,
        prevPageA: elements.prevPageA,
        nextPageA: elements.nextPageA,
        prevPageB: elements.prevPageB,
        nextPageB: elements.nextPageB,
        pageIndicatorA: elements.pageIndicatorA,
        pageIndicatorB: elements.pageIndicatorB,
    });

    // Bind event listeners
    bindUploadHandlers();
    bindActionButtons();
    bindPageNavigation();
    bindScrollSync();
    bindModalHandlers();

    console.log('PDF Diff Checker initialized');
}

/**
 * Cache DOM element references
 */
function cacheElements() {
    elements.pdfAInput = document.getElementById('pdfAInput');
    elements.pdfBInput = document.getElementById('pdfBInput');
    elements.pdfAInfo = document.getElementById('pdfAInfo');
    elements.pdfBInfo = document.getElementById('pdfBInfo');
    elements.compareBtn = document.getElementById('compareBtn');
    elements.clearBtn = document.getElementById('clearBtn');
    elements.progressSection = document.getElementById('progressSection');
    elements.progressFill = document.getElementById('progressFill');
    elements.progressText = document.getElementById('progressText');
    elements.comparisonSection = document.getElementById('comparisonSection');
    elements.canvasA = document.getElementById('canvasA');
    elements.canvasB = document.getElementById('canvasB');
    elements.overlayA = document.getElementById('overlayA');
    elements.overlayB = document.getElementById('overlayB');
    elements.canvasContainerA = document.getElementById('canvasContainerA');
    elements.canvasContainerB = document.getElementById('canvasContainerB');
    elements.prevPageA = document.getElementById('prevPageA');
    elements.nextPageA = document.getElementById('nextPageA');
    elements.prevPageB = document.getElementById('prevPageB');
    elements.nextPageB = document.getElementById('nextPageB');
    elements.pageIndicatorA = document.getElementById('pageIndicatorA');
    elements.pageIndicatorB = document.getElementById('pageIndicatorB');
    elements.summarySection = document.getElementById('summarySection');
    elements.insertionCount = document.getElementById('insertionCount');
    elements.deletionCount = document.getElementById('deletionCount');
    elements.modificationCount = document.getElementById('modificationCount');
    elements.exportReportBtn = document.getElementById('exportReportBtn');
    elements.viewLicensesBtn = document.getElementById('viewLicensesBtn');
    elements.licensesModal = document.getElementById('licensesModal');
    elements.closeLicenses = document.getElementById('closeLicenses');
}

// ============================================
// Event Binding
// ============================================

function bindUploadHandlers() {
    elements.pdfAInput.addEventListener('change', (e) => handleFileSelect(e, 'A'));
    elements.pdfBInput.addEventListener('change', (e) => handleFileSelect(e, 'B'));
}

function bindActionButtons() {
    elements.compareBtn.addEventListener('click', handleCompare);
    elements.clearBtn.addEventListener('click', handleClear);
    elements.exportReportBtn.addEventListener('click', () => handleExportReport(showError));
}

function bindPageNavigation() {
    elements.prevPageA.addEventListener('click', () => navigatePage('A', -1));
    elements.nextPageA.addEventListener('click', () => navigatePage('A', 1));
    elements.prevPageB.addEventListener('click', () => navigatePage('B', -1));
    elements.nextPageB.addEventListener('click', () => navigatePage('B', 1));
}

function bindScrollSync() {
    let syncTimeout = null;

    const syncScroll = (source, target) => {
        // Clear any pending sync
        if (syncTimeout) {
            clearTimeout(syncTimeout);
            syncTimeout = null;
        }

        // Use a flag to prevent sync loops
        if (source.dataset.syncing === 'true') {
            return;
        }

        // Mark target as syncing
        target.dataset.syncing = 'true';

        // Calculate scroll percentage (0-1)
        const sourceScrollTop = source.scrollTop;
        const sourceScrollHeight = source.scrollHeight - source.clientHeight;
        const scrollPercentage = sourceScrollHeight > 0
            ? sourceScrollTop / sourceScrollHeight
            : 0;

        // Apply same scroll percentage to target
        const targetScrollHeight = target.scrollHeight - target.clientHeight;
        target.scrollTop = scrollPercentage * targetScrollHeight;

        // Also sync horizontal scroll
        const sourceScrollLeft = source.scrollLeft;
        const sourceScrollWidth = source.scrollWidth - source.clientWidth;
        const scrollLeftPercentage = sourceScrollWidth > 0
            ? sourceScrollLeft / sourceScrollWidth
            : 0;

        const targetScrollWidth = target.scrollWidth - target.clientWidth;
        target.scrollLeft = scrollLeftPercentage * targetScrollWidth;

        // Clear the syncing flag after a brief delay
        syncTimeout = setTimeout(() => {
            target.dataset.syncing = 'false';
        }, 10);
    };

    // Sync A -> B
    elements.canvasContainerA.addEventListener('scroll', () => {
        syncScroll(elements.canvasContainerA, elements.canvasContainerB);
    });

    // Sync B -> A
    elements.canvasContainerB.addEventListener('scroll', () => {
        syncScroll(elements.canvasContainerB, elements.canvasContainerA);
    });
}

function bindModalHandlers() {
    elements.viewLicensesBtn.addEventListener('click', () => {
        elements.licensesModal.classList.add('active');
    });

    elements.closeLicenses.addEventListener('click', () => {
        elements.licensesModal.classList.remove('active');
    });

    elements.licensesModal.addEventListener('click', (e) => {
        if (e.target === elements.licensesModal) {
            elements.licensesModal.classList.remove('active');
        }
    });
}

// ============================================
// File Handling
// ============================================

/**
 * Handle PDF file selection and loading
 * @param {Event} event - File input change event
 * @param {string} pdfKey - 'A' or 'B'
 */
async function handleFileSelect(event, pdfKey) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate PDF type
    if (file.type !== 'application/pdf') {
        showError(`Please select a valid PDF file for PDF ${pdfKey}`);
        event.target.value = '';
        return;
    }

    // Validate file size (warn if > 50MB)
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > 50) {
        showWarning(`PDF ${pdfKey} is large (${fileSizeMB.toFixed(1)}MB). Processing may take longer.`);
    }

    try {
        // Show loading state
        const infoEl = pdfKey === 'A' ? elements.pdfAInfo : elements.pdfBInfo;
        const originalText = infoEl.textContent;
        infoEl.textContent = 'Loading...';

        // Read file as ArrayBuffer
        const arrayBuffer = await readFileAsArrayBuffer(file);

        // Load PDF using pdf.js
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDocument = await loadingTask.promise;

        // Update state
        if (pdfKey === 'A') {
            state.pdfA = pdfDocument;
            state.fileAName = file.name;
            state.currentPageA = 0;
            elements.pdfAInfo.textContent = `${file.name} (${pdfDocument.numPages} pages)`;
            elements.pdfAInfo.parentElement.querySelector('.upload-label').classList.add('has-file');
        } else {
            state.pdfB = pdfDocument;
            state.fileBName = file.name;
            state.currentPageB = 0;
            elements.pdfBInfo.textContent = `${file.name} (${pdfDocument.numPages} pages)`;
            elements.pdfBInfo.parentElement.querySelector('.upload-label').classList.add('has-file');
        }

        // Render first page and show comparison section
        renderPage(pdfKey);

        // Show comparison section if at least one PDF is loaded
        if (state.pdfA || state.pdfB) {
            elements.comparisonSection.style.display = 'block';
        }

        // Enable compare button if both files loaded
        updateCompareButton();

        console.log(`PDF ${pdfKey} loaded successfully: ${pdfDocument.numPages} pages`);

    } catch (error) {
        console.error(`Error loading PDF ${pdfKey}:`, error);

        // Handle specific error types
        let errorMessage = `Failed to load PDF ${pdfKey}`;
        if (error.name === 'PasswordException') {
            errorMessage = `PDF ${pdfKey} is password-protected and cannot be opened.`;
        } else if (error.name === 'InvalidPDFException') {
            errorMessage = `PDF ${pdfKey} appears to be corrupted or invalid.`;
        } else if (error.message) {
            errorMessage = `PDF ${pdfKey}: ${error.message}`;
        }

        showError(errorMessage);

        // Reset input
        event.target.value = '';
        if (pdfKey === 'A') {
            state.pdfA = null;
            state.fileAName = null;
            elements.pdfAInfo.textContent = 'No file selected';
            elements.pdfAInfo.parentElement.querySelector('.upload-label')?.classList.remove('has-file');
        } else {
            state.pdfB = null;
            state.fileBName = null;
            elements.pdfBInfo.textContent = 'No file selected';
            elements.pdfBInfo.parentElement.querySelector('.upload-label')?.classList.remove('has-file');
        }

        updateCompareButton();
    }
}

/**
 * Read a file as an ArrayBuffer
 * @param {File} file - The file to read
 * @returns {Promise<ArrayBuffer>} The file data as ArrayBuffer
 */
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Update the compare button enabled state
 */
function updateCompareButton() {
    const hasPdfA = state.pdfA !== null;
    const hasPdfB = state.pdfB !== null;
    elements.compareBtn.disabled = !(hasPdfA && hasPdfB);
}

// ============================================
// Page Navigation
// ============================================

/**
 * Navigate to a different page
 * @param {string} pdfKey - 'A' or 'B'
 * @param {number} direction - -1 for previous, 1 for next
 */
function navigatePage(pdfKey, direction) {
    const pdfDoc = pdfKey === 'A' ? state.pdfA : state.pdfB;
    const currentPage = pdfKey === 'A' ? state.currentPageA : state.currentPageB;

    const newPage = currentPage + direction;
    if (newPage >= 0 && newPage < pdfDoc?.numPages) {
        if (pdfKey === 'A') {
            state.currentPageA = newPage;
        } else {
            state.currentPageB = newPage;
        }
        renderPage(pdfKey);
    }
}

// ============================================
// Comparison
// ============================================

/**
 * Execute the PDF comparison process
 * Extracts text, computes diffs, and renders highlights
 */
async function handleCompare() {
    if (!state.pdfA || !state.pdfB) {
        showError('Please load both PDFs before comparing');
        return;
    }

    try {
        state.isProcessing = true;

        // Reset edge case tracking for this comparison
        resetEdgeCaseState();

        // Show progress
        elements.progressSection.style.display = 'block';
        updateProgress(0, 'Extracting text from PDF A...');

        // Extract text from both PDFs
        state.textItemsA = await extractTextFromPDF(state.pdfA, 'A', updateProgress);
        updateProgress(25, 'Extracting text from PDF B...');

        state.textItemsB = await extractTextFromPDF(state.pdfB, 'B', updateProgress);

        // Check for scanned PDFs (no text content)
        if (state.textItemsA.length === 0 && state.textItemsB.length === 0) {
            showWarning('No text content found in either PDF. Both PDFs may be scanned images.');
            elements.progressSection.style.display = 'none';
            state.isProcessing = false;
            return;
        } else if (state.textItemsA.length === 0) {
            showWarning('No text content found in PDF A. It may be a scanned image.');
        } else if (state.textItemsB.length === 0) {
            showWarning('No text content found in PDF B. It may be a scanned image.');
        }

        // Log results for debugging
        console.log(`Extracted ${state.textItemsA.length} text items from PDF A`);
        console.log(`Extracted ${state.textItemsB.length} text items from PDF B`);

        // Show edge case warnings if any were detected during extraction
        const edgeCases = {
            hasRotatedText: state.hasRotatedText,
            rotatedTextCount: state.rotatedTextCount,
            rotationAngles: [...state.rotationAngles],
            hasMultiColumnLayout: state.hasMultiColumnLayout,
            multiColumnPages: [...state.multiColumnPages]
        };
        if (edgeCases.hasRotatedText || edgeCases.hasMultiColumnLayout) {
            showEdgeCaseWarnings(edgeCases);
        }

        // Build document text sequences for diffing
        updateProgress(50, 'Building document sequences...');
        const { textA, textB, sequenceA, sequenceB } = getDiffTexts();

        // Store sequences for later use in highlight rendering
        state.sequenceA = sequenceA;
        state.sequenceB = sequenceB;

        // Compute document-level diff
        updateProgress(75, 'Computing differences...');
        const diffs = computeDiff(textA, textB);
        state.diffResults = diffs;

        // Map diff results back to source coordinates
        updateProgress(85, 'Mapping differences to coordinates...');
        const { diffsA, diffsB } = mapDiffsToCoordinates(diffs, sequenceA, sequenceB);

        // Build page-to-diff mappings for efficient rendering
        state.pageDiffsA = buildPageDiffMapping(diffsA);
        state.pageDiffsB = buildPageDiffMapping(diffsB);

        // Calculate and display statistics
        const stats = getDiffStats(diffs);
        updateProgress(100, 'Comparison complete');

        // Update summary section
        elements.insertionCount.textContent = stats.insertions;
        elements.deletionCount.textContent = stats.deletions;
        elements.modificationCount.textContent = Math.round(stats.modifications / 2); // Divide by 2 since we count both delete and insert
        elements.summarySection.style.display = 'block';

        console.log('Diff results:', diffs);
        console.log('Stats:', stats);
        console.log('Page diffs A:', state.pageDiffsA);
        console.log('Page diffs B:', state.pageDiffsB);

        // Re-render current pages with highlights
        await renderPage('A');
        await renderPage('B');

        // Hide progress after a brief delay
        setTimeout(() => {
            elements.progressSection.style.display = 'none';
        }, 1000);

    } catch (error) {
        console.error('Error during comparison:', error);
        showError(`Comparison failed: ${error.message}`);
        elements.progressSection.style.display = 'none';
    } finally {
        state.isProcessing = false;
    }
}

// ============================================
// Clear
// ============================================

/**
 * Reset the application to initial state
 */
async function handleClear() {
    // Destroy PDF documents to free memory
    if (state.pdfA) {
        try {
            await state.pdfA.destroy();
        } catch (e) {
            console.warn('Error destroying PDF A:', e);
        }
    }
    if (state.pdfB) {
        try {
            await state.pdfB.destroy();
        } catch (e) {
            console.warn('Error destroying PDF B:', e);
        }
    }

    // Reset state
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

    // Reset edge case detection
    state.hasRotatedText = false;
    state.rotatedTextCount = 0;
    state.hasMultiColumnLayout = false;
    state.multiColumnPages = [];
    state.rotationAngles = [];

    // Reset UI
    elements.pdfAInput.value = '';
    elements.pdfBInput.value = '';
    elements.pdfAInfo.textContent = 'No file selected';
    elements.pdfBInfo.textContent = 'No file selected';
    elements.pdfAInfo.parentElement.querySelector('.upload-label')?.classList.remove('has-file');
    elements.pdfBInfo.parentElement.querySelector('.upload-label')?.classList.remove('has-file');
    elements.compareBtn.disabled = true;
    elements.comparisonSection.style.display = 'none';
    elements.summarySection.style.display = 'none';
    elements.progressSection.style.display = 'none';

    // Clear edge case messages
    document.querySelectorAll('.edge-case-message').forEach(el => el.remove());

    // Reset page indicators
    updatePageIndicator('A');
    updatePageIndicator('B');
    elements.pageIndicatorA.textContent = 'Page 1 of 1';
    elements.pageIndicatorB.textContent = 'Page 1 of 1';

    // Clear canvases
    const ctxA = elements.canvasA.getContext('2d');
    const ctxB = elements.canvasB.getContext('2d');
    ctxA.clearRect(0, 0, elements.canvasA.width, elements.canvasA.height);
    ctxB.clearRect(0, 0, elements.canvasB.width, elements.canvasB.height);
    elements.overlayA.innerHTML = '';
    elements.overlayB.innerHTML = '';

    // Reset navigation buttons
    updateNavigationButtons('A');
    updateNavigationButtons('B');
    elements.prevPageA.disabled = true;
    elements.nextPageA.disabled = true;
    elements.prevPageB.disabled = true;
    elements.nextPageB.disabled = true;
}

// ============================================
// Error Handling
// ============================================

/**
 * Display an error message to the user
 * @param {string} message - Error message to display
 */
function showError(message) {
    // Create error element if it doesn't exist
    let errorEl = document.querySelector('.error-message');
    if (!errorEl) {
        errorEl = document.createElement('div');
        errorEl.className = 'error-message';
        const uploadSection = document.querySelector('.upload-section');
        if (uploadSection) {
            uploadSection.before(errorEl);
        }
    }
    errorEl.textContent = message;
    errorEl.style.display = 'block';

    // Auto-hide after 5 seconds
    setTimeout(() => {
        errorEl.style.display = 'none';
    }, 5000);
}

/**
 * Display a warning message to the user
 * @param {string} message - Warning message to display
 */
function showWarning(message) {
    // Create warning element if it doesn't exist
    let warningEl = document.querySelector('.warning-message');
    if (!warningEl) {
        warningEl = document.createElement('div');
        warningEl.className = 'warning-message';
        const comparisonSection = document.getElementById('comparisonSection');
        if (comparisonSection) {
            comparisonSection.before(warningEl);
        }
    }
    warningEl.textContent = message;
    warningEl.style.display = 'block';

    // Auto-hide after 5 seconds
    setTimeout(() => {
        warningEl.style.display = 'none';
    }, 5000);
}

/**
 * Show edge case warnings based on detected issues during PDF processing
 * Creates stackable info messages that don't interfere with each other
 * @param {Object} edgeCases - Object containing detected edge cases
 */
function showEdgeCaseWarnings(edgeCases) {
    const warnings = [];

    if (edgeCases.hasRotatedText) {
        const angles = edgeCases.rotationAngles.sort((a, b) => a - b).map(a => `${a}°`).join(', ');
        warnings.push(`Rotated text detected (${angles}). Highlight positions may be less accurate for rotated content.`);
    }

    if (edgeCases.hasMultiColumnLayout) {
        const pageNumbers = edgeCases.multiColumnPages.map(p => p + 1).sort((a, b) => a - b);
        const pageList = pageNumbers.length > 5
            ? `${pageNumbers.slice(0, 5).join(', ')}... and ${pageNumbers.length - 5} more`
            : pageNumbers.join(', ');
        warnings.push(`Multi-column layout detected on page(s): ${pageList}. Reading order is preserved.`);
    }

    // Clear existing edge case messages
    document.querySelectorAll('.edge-case-message').forEach(el => el.remove());

    // Display each warning with a slight delay between them
    const comparisonSection = document.getElementById('comparisonSection');
    if (!comparisonSection) return;

    warnings.forEach((warning, index) => {
        setTimeout(() => {
            const infoEl = document.createElement('div');
            infoEl.className = 'info-message edge-case-message';
            infoEl.textContent = `ℹ️ ${warning}`;

            // Insert before comparison section
            comparisonSection.before(infoEl);

            // Add show class for animation
            requestAnimationFrame(() => {
                infoEl.classList.add('show');
            });

            // Auto-hide after 8 seconds
            setTimeout(() => {
                infoEl.classList.remove('show');
                setTimeout(() => infoEl.remove(), 300);
            }, 8000);
        }, index * 400);
    });
}

// ============================================
// Progress Updates
// ============================================

/**
 * Update the progress bar and message
 * @param {number} percent - Progress percentage (0-100)
 * @param {string} message - Progress message
 */
function updateProgress(percent, message) {
    state.processingProgress = percent;
    elements.progressFill.style.width = `${percent}%`;
    if (message) {
        elements.progressText.textContent = message;
    }
}

// ============================================
// Exports
// ============================================

export {
    elements,
    init,
    handleCompare,
    handleClear,
    showError,
    showWarning,
    showEdgeCaseWarnings,
    updateProgress
};
