// ============================================
// PDF Diff Checker - Rendering
// ============================================

/**
 * PDF page rendering and diff highlight visualization
 * Handles canvas rendering, coordinate conversion, and SVG overlay management
 */

import { state } from './pdf-diff-state.js';
import { bboxPdfToCanvas } from './pdf-diff-coordinates.js';

// ============================================
// DOM Elements (will be initialized by calling module)
// ============================================

let elements = {
    canvasA: null,
    canvasB: null,
    overlayA: null,
    overlayB: null,
    canvasContainerA: null,
    canvasContainerB: null,
    prevPageA: null,
    nextPageA: null,
    prevPageB: null,
    nextPageB: null,
    pageIndicatorA: null,
    pageIndicatorB: null,
};

/**
 * Initialize rendering module with DOM element references
 * @param {Object} domElements - Object containing DOM element references
 */
function init(domElements) {
    elements = { ...elements, ...domElements };
}

// ============================================
// Highlight Rendering
// ============================================

/**
 * Render diff highlights on the SVG overlay
 * @param {string} pdfKey - 'A' or 'B'
 * @param {number} pageIndex - Page number to render highlights for
 */
function renderHighlights(pdfKey, pageIndex) {
    const overlay = pdfKey === 'A' ? elements.overlayA : elements.overlayB;
    const pageDiffs = pdfKey === 'A' ? state.pageDiffsA : state.pageDiffsB;

    // Clear existing highlights
    overlay.innerHTML = '';

    // Get diffs for this page
    const diffs = pageDiffs[pageIndex] || [];
    if (diffs.length === 0) return;

    // Create SVG namespace
    const svgNS = 'http://www.w3.org/2000/svg';

    // Render each diff as a rectangle
    for (const diff of diffs) {
        const rect = document.createElementNS(svgNS, 'rect');
        const bbox = diff.boundingBox;

        // Convert PDF coordinates to canvas coordinates with proper Y-flip
        const canvasCoords = bboxPdfToCanvas(bbox, pdfKey);

        // Debug: Log highlight coordinates
        // console.log(`[Highlight ${pdfKey}]`, {
        //     text: diff.text,
        //     type: diff.type,
        //     pdfCoords: { x: bbox.x, y: bbox.y, w: bbox.width, h: bbox.height },
        //     canvasCoords: { x: canvasCoords.x.toFixed(2), y: canvasCoords.y.toFixed(2), w: canvasCoords.width.toFixed(2), h: canvasCoords.height.toFixed(2) }
        // });

        // Ensure valid dimensions
        const width = Math.max(1, canvasCoords.width);
        const height = Math.max(1, canvasCoords.height);

        // Set rectangle attributes
        rect.setAttribute('x', canvasCoords.x.toFixed(2));
        rect.setAttribute('y', canvasCoords.y.toFixed(2));
        rect.setAttribute('width', width.toFixed(2));
        rect.setAttribute('height', height.toFixed(2));
        rect.setAttribute('class', `highlight-rect ${diff.type}`);
        rect.setAttribute('rx', '2'); // Rounded corners

        // Add title for tooltip
        const title = document.createElementNS(svgNS, 'title');
        const displayText = diff.text.length > 50
            ? diff.text.substring(0, 50) + '...'
            : diff.text;

        if (diff.type === 'modified') {
            const originalText = diff.originalText || '';
            const modifiedText = diff.modifiedText || '';
            const originalDisplay = originalText.length > 30 ? originalText.substring(0, 30) + '...' : originalText;
            const modifiedDisplay = modifiedText.length > 30 ? modifiedText.substring(0, 30) + '...' : modifiedText;
            title.textContent = `MODIFIED:\nFrom: "${originalDisplay}"\nTo: "${modifiedDisplay}"`;
        } else {
            title.textContent = `${diff.type.toUpperCase()}: "${displayText}"`;
        }
        rect.appendChild(title);

        overlay.appendChild(rect);
    }
}

/**
 * Clear all highlights from an overlay
 * @param {string} pdfKey - 'A' or 'B'
 */
function clearHighlights(pdfKey) {
    const overlay = pdfKey === 'A' ? elements.overlayA : elements.overlayB;
    overlay.innerHTML = '';
}

// ============================================
// Page Rendering
// ============================================

/**
 * Render a PDF page to canvas with highlights
 * @param {string} pdfKey - 'A' or 'B'
 * @returns {Promise<void>}
 */
async function renderPage(pdfKey) {
    const pdfDoc = pdfKey === 'A' ? state.pdfA : state.pdfB;
    const pageNumber = pdfKey === 'A' ? state.currentPageA : state.currentPageB;
    const canvas = pdfKey === 'A' ? elements.canvasA : elements.canvasB;
    const canvasContainer = pdfKey === 'A' ? elements.canvasContainerA : elements.canvasContainerB;
    const canvasContent = canvasContainer.querySelector('.canvas-content');
    const overlay = pdfKey === 'A' ? elements.overlayA : elements.overlayB;

    if (!pdfDoc) return;

    try {
        // Add loading state
        canvasContainer.classList.add('loading');

        // Get the page (page numbers are 1-indexed in pdf.js)
        const page = await pdfDoc.getPage(pageNumber + 1);

        // Get the viewport to calculate scale
        const containerWidth = canvasContainer.clientWidth - 32; // Account for padding
        const unscaledViewport = page.getViewport({ scale: 1.0 });

        // Calculate scale to fit container width
        const scale = Math.min(
            containerWidth / unscaledViewport.width,
            2.0 // Max scale for quality
        );

        const viewport = page.getViewport({ scale });

        // Store scale and viewport dimensions for coordinate conversion later
        if (pdfKey === 'A') {
            state.canvasScaleA = scale;
            state.pdfWidthA = unscaledViewport.width;
            state.pdfHeightA = unscaledViewport.height;
            state.viewportWidthA = viewport.width;
            state.viewportHeightA = viewport.height;
        } else {
            state.canvasScaleB = scale;
            state.pdfWidthB = unscaledViewport.width;
            state.pdfHeightB = unscaledViewport.height;
            state.viewportWidthB = viewport.width;
            state.viewportHeightB = viewport.height;
        }

        // Set canvas dimensions
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        // Set canvas-content wrapper dimensions (for scrolling)
        canvasContent.style.width = `${viewport.width}px`;
        canvasContent.style.height = `${viewport.height}px`;

        // Set overlay dimensions to match canvas
        overlay.style.width = `${viewport.width}px`;
        overlay.style.height = `${viewport.height}px`;
        overlay.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);

        // Clear previous content
        context.clearRect(0, 0, canvas.width, canvas.height);
        overlay.innerHTML = '';

        // Render PDF page to canvas
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };

        await page.render(renderContext).promise;

        // Render diff highlights if available
        renderHighlights(pdfKey, pageNumber);

        // Update page indicator
        updatePageIndicator(pdfKey);

        // Update navigation button states
        updateNavigationButtons(pdfKey);

        // Remove loading state
        canvasContainer.classList.remove('loading');

    } catch (error) {
        console.error(`Error rendering page for PDF ${pdfKey}:`, error);
        canvasContainer.classList.remove('loading');
        // Error will be handled by calling module
        throw error;
    }
}

// ============================================
// UI Updates
// ============================================

/**
 * Update the page indicator display
 * @param {string} pdfKey - 'A' or 'B'
 */
function updatePageIndicator(pdfKey) {
    const pdfDoc = pdfKey === 'A' ? state.pdfA : state.pdfB;
    const currentPage = pdfKey === 'A' ? state.currentPageA : state.currentPageB;
    const indicator = pdfKey === 'A' ? elements.pageIndicatorA : elements.pageIndicatorB;

    if (pdfDoc) {
        indicator.textContent = `Page ${currentPage + 1} of ${pdfDoc.numPages}`;
    }
}

/**
 * Update navigation button enabled/disabled states
 * @param {string} pdfKey - 'A' or 'B'
 */
function updateNavigationButtons(pdfKey) {
    const pdfDoc = pdfKey === 'A' ? state.pdfA : state.pdfB;
    const currentPage = pdfKey === 'A' ? state.currentPageA : state.currentPageB;
    const prevBtn = pdfKey === 'A' ? elements.prevPageA : elements.prevPageB;
    const nextBtn = pdfKey === 'A' ? elements.nextPageA : elements.nextPageB;

    if (!pdfDoc) {
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        return;
    }

    prevBtn.disabled = currentPage <= 0;
    nextBtn.disabled = currentPage >= pdfDoc.numPages - 1;
}

// ============================================
// Exports
// ============================================

export {
    init,
    renderHighlights,
    clearHighlights,
    renderPage,
    updatePageIndicator,
    updateNavigationButtons
};
