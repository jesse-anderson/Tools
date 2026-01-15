// ============================================
// PDF Diff Checker - Coordinate Conversion
// ============================================

/**
 * PDF to Canvas coordinate system conversion
 *
 * PDF Coordinate System: Origin at bottom-left, Y increases upward
 * Canvas Coordinate System: Origin at top-left, Y increases downward
 *
 * This module handles conversion between the two coordinate systems,
 * including proper handling for rotated text.
 */

import { state } from './pdf-diff-state.js';

// ============================================
// Single Coordinate Conversion
// ============================================

/**
 * Convert a single coordinate value from PDF to canvas
 * @param {number} pdfCoord - Coordinate in PDF space
 * @param {string} pdfKey - 'A' or 'B'
 * @param {boolean} isY - Whether this is a Y-coordinate (needs flip)
 * @returns {number} Coordinate in canvas space
 */
function pdfCoordToCanvas(pdfCoord, pdfKey, isY = false) {
    const scale = pdfKey === 'A' ? state.canvasScaleA : state.canvasScaleB;

    if (isY) {
        const pdfHeight = pdfKey === 'A' ? state.pdfHeightA : state.pdfHeightB;
        // Y needs to be flipped
        return (pdfHeight - pdfCoord) * scale;
    }

    return pdfCoord * scale;
}

/**
 * Convert canvas coordinates back to PDF coordinates (for reverse lookups)
 * @param {number} canvasCoord - Coordinate in canvas space
 * @param {string} pdfKey - 'A' or 'B'
 * @param {boolean} isY - Whether this is a Y-coordinate (needs flip)
 * @returns {number} Coordinate in PDF space
 */
function canvasToPdfCoord(canvasCoord, pdfKey, isY = false) {
    const scale = pdfKey === 'A' ? state.canvasScaleA : state.canvasScaleB;

    if (isY) {
        const pdfHeight = pdfKey === 'A' ? state.pdfHeightA : state.pdfHeightB;
        // Y needs to be flipped back
        return pdfHeight - (canvasCoord / scale);
    }

    return canvasCoord / scale;
}

// ============================================
// Text Item Conversion
// ============================================

/**
 * Convert PDF coordinates to canvas coordinates for rendering highlights
 *
 * @param {Object} textItem - Text item with PDF coordinates
 * @param {string} pdfKey - 'A' or 'B'
 * @returns {Object} Bounding box in canvas coordinates {x, y, width, height}
 */
function pdfToCanvasCoords(textItem, pdfKey) {
    const scale = pdfKey === 'A' ? state.canvasScaleA : state.canvasScaleB;
    const pdfHeight = pdfKey === 'A' ? state.pdfHeightA : state.pdfHeightB;

    // PDF coordinates are in points (1/72 inch), origin at bottom-left
    // Canvas coordinates need origin at top-left (Y-flipped)

    // X coordinate: direct scaling
    const canvasX = textItem.x * scale;

    // Y coordinate: flip from bottom-left to top-left
    // In PDF: (0,0) is bottom-left, (0, pdfHeight) is top-left
    // In Canvas: (0,0) is top-left, (0, canvasHeight) is bottom-left
    // But we also need to account for the text item's height
    const canvasY = (pdfHeight - textItem.y - textItem.height) * scale;

    return {
        x: canvasX,
        y: canvasY,
        width: textItem.width * scale,
        height: textItem.height * scale
    };
}

/**
 * Get the bounding box for a text item in canvas coordinates
 * @param {Object} textItem - Text item with PDF coordinates
 * @param {string} pdfKey - 'A' or 'B'
 * @returns {Object} Bounding box {x, y, width, height, x2, y2}
 */
function getCanvasBoundingBox(textItem, pdfKey) {
    const coords = pdfToCanvasCoords(textItem, pdfKey);
    return {
        x: coords.x,
        y: coords.y,
        width: coords.width,
        height: coords.height,
        // Add calculated properties for SVG rect
        x2: coords.x + coords.width,
        y2: coords.y + coords.height
    };
}

// ============================================
// Bounding Box Conversion (with rotation support)
// ============================================

/**
 * Convert a bounding box from PDF space to canvas space
 * Used for pre-computed diff bounding boxes
 *
 * Handles rotated text by adjusting the bounding box dimensions
 *
 * @param {Object} bbox - Bounding box in PDF space {x, y, width, height, rotation}
 * @param {string} pdfKey - 'A' or 'B'
 * @returns {Object} Bounding box in canvas space {x, y, width, height}
 */
function bboxPdfToCanvas(bbox, pdfKey) {
    const scale = pdfKey === 'A' ? state.canvasScaleA : state.canvasScaleB;
    const pdfHeight = pdfKey === 'A' ? state.pdfHeightA : state.pdfHeightB;

    // Debug: Check for NaN sources
    // if (!scale || !pdfHeight || !bbox) {
    //     console.error('[bboxPdfToCanvas] Missing values:', {
    //         pdfKey,
    //         scale,
    //         pdfHeight,
    //         bbox
    //     });
    //     return { x: 0, y: 0, width: 0, height: 0 };
    // }
    if (!scale || !pdfHeight || !bbox) {
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    const rotation = bbox.rotation || 0;

    // For rotated text, width and height swap
    let pdfWidth = bbox.width;
    let pdfHeight_val = bbox.height;
    let pdfX = bbox.x;
    let pdfY = bbox.y;

    if (rotation === 90 || rotation === 270) {
        // Swap width and height for 90°/270° rotations
        [pdfWidth, pdfHeight_val] = [pdfHeight_val, pdfWidth];

        // Adjust origin for 90° rotation
        if (rotation === 90) {
            pdfY = bbox.y - bbox.height;
        }
        // Adjust origin for 270° rotation
        if (rotation === 270) {
            pdfX = bbox.x - bbox.width;
        }
    } else if (rotation === 180) {
        // Flip both dimensions for 180° rotation
        pdfX = bbox.x - bbox.width;
        pdfY = bbox.y - bbox.height;
    }

    // PDF to Canvas coordinate conversion:
    // PDF: origin at bottom-left, Y increases upward, text positioned by baseline
    // Canvas: origin at top-left, Y increases downward
    //
    // For text at baseline Y with height H:
    // - Bottom of text in PDF: pdfY
    // - Top of text in PDF: pdfY + pdfHeight_val
    // - Top of text in canvas (flipped): pdfHeight - (pdfY + pdfHeight_val)

    const canvasY = pdfHeight - pdfY - pdfHeight_val;

    const result = {
        x: pdfX * scale,
        y: canvasY * scale,
        width: pdfWidth * scale,
        height: pdfHeight_val * scale
    };

    // Debug: Check for NaN in result
    // if (isNaN(result.x) || isNaN(result.y) || isNaN(result.width) || isNaN(result.height)) {
    //     console.error('[bboxPdfToCanvas] NaN produced:', {
    //         pdfKey,
    //         scale,
    //         pdfHeight,
    //         bbox,
    //         pdfX,
    //         pdfY,
    //         pdfWidth,
    //         pdfHeight_val,
    //         canvasY,
    //         result
    //     });
    // }

    return result;
}

// ============================================
// Exports
// ============================================

export {
    pdfCoordToCanvas,
    canvasToPdfCoord,
    pdfToCanvasCoords,
    getCanvasBoundingBox,
    bboxPdfToCanvas
};
