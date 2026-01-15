// ============================================
// PDF Diff Checker - PDF Text Extraction
// ============================================

/**
 * Extract text with coordinates from PDF documents using pdf.js
 * Handles rotation detection and multi-column layout detection
 */

import { state } from './pdf-diff-state.js';
import { detectColumns } from './pdf-diff-layout.js';
import { splitTextItemToChars } from './pdf-diff-font-metrics.js';

// ============================================
// Text Extraction
// ============================================

/**
 * Extract all text items with coordinates from a PDF document
 * @param {PDFDocumentProxy} pdfDoc - The PDF document
 * @param {string} sourcePdf - 'A' or 'B'
 * @param {Function} updateProgressFn - Callback for progress updates (percent, message)
 * @returns {Promise<Array>} Array of text items with coordinates
 */
async function extractTextFromPDF(pdfDoc, sourcePdf, updateProgressFn) {
    const textItems = [];
    const numPages = pdfDoc.numPages;

    // Iterate through all pages
    for (let pageIndex = 0; pageIndex < numPages; pageIndex++) {
        // Update progress for multi-page PDFs
        const progress = sourcePdf === 'A'
            ? (pageIndex / numPages) * 50
            : 50 + (pageIndex / numPages) * 50;

        if (updateProgressFn) {
            updateProgressFn(progress, `Extracting text from page ${pageIndex + 1} of ${numPages} (${sourcePdf})...`);
        }

        try {
            const page = await pdfDoc.getPage(pageIndex + 1);

            // Get text content with layout information
            const textContent = await page.getTextContent();

            // Debug: Check if we get character-level items
            // if (pageIndex === 0) {
            //     console.log(`[PDF ${sourcePdf}] Text content items:`, textContent.items.length);
            //     console.log(`[PDF ${sourcePdf}] First 3 items:`, textContent.items.slice(0, 3).map(item => ({
            //         str: item.str,
            //         width: item.width,
            //         transform: item.transform
            //     })));
            // }

            // Extract each text item with its coordinates
            textContent.items.forEach((item, itemIndex) => {
                // Skip empty items
                if (!item.str || item.str.trim() === '') {
                    return;
                }

                // pdf.js provides transform array [a, b, c, d, e, f]
                // where e is x translation and f is y translation (before applying scale)
                // The item also has width property

                // Get viewport for coordinate conversion (at scale 1.0 for PDF space coordinates)
                const viewport = page.getViewport({ scale: 1.0 });
                const [scaleX, skewY, skewX, scaleY, translateX, translateY] = item.transform;

                // Calculate bounding box in PDF coordinate space
                // pdf.js text coordinates are from bottom-left origin
                // We'll store in PDF space and convert to canvas space during rendering

                // For proper Y-coordinate: PDF coordinates start from bottom-left
                // We store the raw PDF coordinates (bottom-left origin) and convert during render
                const pdfX = translateX;
                const pdfY = translateY; // Bottom-left Y in PDF space (baseline)
                const width = item.width || (item.str.length * scaleX);

                // Height: Use the transform matrix scaleY for accurate font height
                // The transform matrix gives us the actual rendered height
                const height = Math.abs(scaleY); // Font size in PDF units

                // Detect rotation from transform matrix
                // scaleX (a) and scaleY (d) are normally positive for horizontal text
                // Rotation is indicated by skewY (b) and skewX (c) values
                // Common rotations:
                //   0°:   skewX=0, skewY=0
                //   90°:  skewX=-scaleY, skewY=scaleX
                //   180°: scaleX<0, scaleY<0
                //   270°: skewX=scaleY, skewY=-scaleX
                let rotation = 0;
                const rotationThreshold = 0.1;

                if (Math.abs(skewY) < rotationThreshold && Math.abs(skewX) < rotationThreshold) {
                    // Normal or 180° rotation
                    if (scaleX < 0) rotation = 180;
                } else if (Math.abs(skewY + scaleX) < rotationThreshold && Math.abs(skewX + scaleY) < rotationThreshold) {
                    // 90° rotation
                    rotation = 90;
                } else if (Math.abs(skewY - scaleX) < rotationThreshold && Math.abs(skewX - scaleY) < rotationThreshold) {
                    // 270° rotation
                    rotation = 270;
                }

                // Track rotated text for edge case notification
                if (rotation !== 0) {
                    state.hasRotatedText = true;
                    state.rotatedTextCount++;
                    // Track unique rotation angles
                    if (!state.rotationAngles.includes(rotation)) {
                        state.rotationAngles.push(rotation);
                    }
                }

                // Store viewport height for this page (needed for Y-conversion during render)
                const pageViewportHeight = viewport.height;

                // CHARACTER-LEVEL EXTRACTION
                // Split text items into individual characters for precise highlighting
                // This uses font metrics to calculate exact character positions

                // Create a temporary text item object for splitting
                const tempTextItem = {
                    text: item.str,
                    x: pdfX,
                    y: pdfY,
                    width: width,
                    height: height,
                    pageIndex: pageIndex,
                    sourcePdf: sourcePdf,
                    itemIndex: itemIndex,
                    transform: item.transform,
                    pageViewportHeight: pageViewportHeight,
                    rotation: rotation,
                    fontName: item.fontName || 'Helvetica'
                };

                // Split into character-level tokens using font metrics
                const charTokens = splitTextItemToChars(tempTextItem);

                // Add all character tokens to the textItems array
                // Skip spaces - they don't need highlighting
                for (const charToken of charTokens) {
                    if (!/^\s+$/.test(charToken.text)) {
                        textItems.push(charToken);
                    }
                }

                // Debug: Log first few text items per page to understand granularity
                // if (itemIndex < 3) {
                //     console.log(`[PDF ${sourcePdf} Page ${pageIndex + 1}] Item ${itemIndex}:`, {
                //         original: item.str,
                //         splitInto: charTokens.length,
                //         first3Chars: charTokens.slice(0, 3).map(c => ({
                //             char: c.text,
                //             x: c.x.toFixed(2),
                //             width: c.width.toFixed(2)
                //         })),
                //         totalWidth: width.toFixed(2),
                //         calcWidth: charTokens.reduce((sum, c) => sum + c.width, 0).toFixed(2)
                //     });
                // }
            });

        } catch (error) {
            console.warn(`Error extracting text from page ${pageIndex + 1}:`, error);
            // Continue with other pages
        }
    }

    // Detect multi-column layouts for edge case notification
    // Group text items by page and check each page for columns
    const pageGroups = new Map();
    for (const item of textItems) {
        if (!pageGroups.has(item.pageIndex)) {
            pageGroups.set(item.pageIndex, []);
        }
        pageGroups.get(item.pageIndex).push(item);
    }

    // Check each page for multi-column layout
    for (const [pageIndex, items] of pageGroups) {
        if (items.length < 10) continue; // Skip pages with too little text

        const columns = detectColumns(items);
        // If more than one column detected, track it
        if (columns.length > 1) {
            state.hasMultiColumnLayout = true;
            if (!state.multiColumnPages.includes(parseInt(pageIndex))) {
                state.multiColumnPages.push(parseInt(pageIndex));
            }
        }
    }

    return textItems;
}

// ============================================
// Exports
// ============================================

export {
    extractTextFromPDF
};
