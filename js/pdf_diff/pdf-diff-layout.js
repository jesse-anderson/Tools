// ============================================
// PDF Diff Checker - Layout & Text Sequencing
// ============================================

/**
 * Text layout analysis for multi-column PDFs
 * Handles column detection, line grouping, and document sequence building
 */

import { state } from './pdf-diff-state.js';

// ============================================
// Column Detection
// ============================================

/**
 * Detect columns in a page's text items
 * @param {Array} textItems - Array of text items with coordinates
 * @returns {Array} Array of column boundaries {xMin, xMax} sorted left to right
 */
function detectColumns(textItems) {
    if (textItems.length === 0) return [];

    // Collect all x positions and find gaps
    const xPositions = textItems.map(item => item.x).sort((a, b) => a - b);

    // Find significant gaps (potential column separators)
    const gaps = [];
    for (let i = 1; i < xPositions.length; i++) {
        const gap = xPositions[i] - xPositions[i - 1];
        if (gap > 20) { // Threshold for column gap (adjustable)
            gaps.push({
                position: (xPositions[i] + xPositions[i - 1]) / 2,
                size: gap
            });
        }
    }

    // If no significant gaps found, treat as single column
    if (gaps.length === 0) {
        return [{ xMin: 0, xMax: Infinity }];
    }

    // Sort gaps by size (largest gaps are most likely column separators)
    gaps.sort((a, b) => b.size - a.size);

    // Use the largest gap(s) to define columns
    // For simplicity, use the single largest gap
    const columnBoundary = gaps[0].position;

    return [
        { xMin: 0, xMax: columnBoundary },
        { xMin: columnBoundary, xMax: Infinity }
    ];
}

/**
 * Assign text items to columns
 * @param {Array} textItems - Array of text items with coordinates
 * @param {Array} columns - Column boundaries from detectColumns
 * @returns {Array} Array of arrays, one per column
 */
function groupByColumns(textItems, columns) {
    const columnGroups = columns.map(() => []);

    for (const item of textItems) {
        // Find which column this item belongs to
        const centerX = item.x + item.width / 2;
        let assignedColumn = 0;

        for (let i = 0; i < columns.length; i++) {
            if (centerX >= columns[i].xMin && centerX < columns[i].xMax) {
                assignedColumn = i;
                break;
            }
        }

        columnGroups[assignedColumn].push(item);
    }

    return columnGroups;
}

// ============================================
// Line Grouping
// ============================================

/**
 * Group text items into lines based on y-position proximity
 * Items on the same line have similar y coordinates (within threshold)
 * @param {Array} textItems - Array of text items with coordinates
 * @param {number} threshold - Maximum y-distance to consider items on same line (default: 5)
 * @returns {Array} Array of lines, each line is an array of text items
 */
function groupTextItemsByLine(textItems, threshold = 5) {
    if (textItems.length === 0) return [];

    // Sort items by y position (top to bottom), then by x position (left to right)
    const sortedItems = [...textItems].sort((a, b) => {
        if (Math.abs(a.y - b.y) < threshold) {
            // Same line - sort by x position
            return a.x - b.x;
        }
        // Different lines - sort by y position
        return a.y - b.y;
    });

    const lines = [];
    let currentLine = [sortedItems[0]];
    let currentY = sortedItems[0].y;

    for (let i = 1; i < sortedItems.length; i++) {
        const item = sortedItems[i];

        // Check if this item is on the same line as current
        if (Math.abs(item.y - currentY) <= threshold) {
            currentLine.push(item);
        } else {
            // Start a new line
            lines.push(currentLine);
            currentLine = [item];
            currentY = item.y;
        }
    }

    // Don't forget the last line
    if (currentLine.length > 0) {
        lines.push(currentLine);
    }

    return lines;
}

/**
 * Group text items by page, then by line within each page
 * Handles multi-column layouts by detecting columns first
 * @param {Array} textItems - Array of text items with coordinates
 * @returns {Map} Map of pageIndex -> Array of lines (each line is array of items)
 */
function groupTextItemsByPageAndLine(textItems) {
    const pageGroups = new Map();

    // First, group by page
    for (const item of textItems) {
        if (!pageGroups.has(item.pageIndex)) {
            pageGroups.set(item.pageIndex, []);
        }
        pageGroups.get(item.pageIndex).push(item);
    }

    // Then, group each page by line (with column detection)
    const pageLines = new Map();
    for (const [pageIndex, items] of pageGroups) {
        // Detect columns on this page
        const columns = detectColumns(items);

        // Group by columns first
        const columnGroups = groupByColumns(items, columns);

        // Group each column by line, then interleave lines from all columns
        const allLines = [];

        for (const columnItems of columnGroups) {
            const lines = groupTextItemsByLine(columnItems);
            allLines.push(...lines);
        }

        // Sort all lines by Y position (this handles column ordering)
        allLines.sort((lineA, lineB) => {
            const avgYA = lineA.reduce((sum, item) => sum + item.y, 0) / lineA.length;
            const avgYB = lineB.reduce((sum, item) => sum + item.y, 0) / lineB.length;
            return avgYA - avgYB;
        });

        pageLines.set(pageIndex, allLines);
    }

    return pageLines;
}

/**
 * Merge text items on the same line into a single string
 * @param {Array} lineItems - Array of text items on the same line (sorted by x)
 * @returns {string} Combined text for the line
 */
function mergeLineText(lineItems) {
    return lineItems.map(item => item.text).join('');
}

/**
 * Get the combined text of all lines in a document
 * @param {Array} textItems - Array of text items
 * @returns {Array} Array of line text strings in reading order
 */
function getDocumentLines(textItems) {
    const lines = groupTextItemsByLine(textItems);
    return lines.map(lineItems => mergeLineText(lineItems));
}

// ============================================
// Document Text Sequences
// ============================================

/**
 * Build an ordered text sequence for document-level diffing
 * This creates a flat array of text tokens in reading order
 * Handles multi-column layouts by detecting columns first
 *
 * IMPORTANT: Words that were split from the same original text item
 * are kept together as a group to maintain reading order when text wraps.
 * @param {Array} textItems - Array of text items with coordinates
 * @returns {Array} Ordered sequence of text tokens with metadata
 */
function buildDocumentTextSequence(textItems) {
    // Group by page first to maintain page order
    const pageGroups = new Map();
    for (const item of textItems) {
        if (!pageGroups.has(item.pageIndex)) {
            pageGroups.set(item.pageIndex, []);
        }
        pageGroups.get(item.pageIndex).push(item);
    }

    // Sort pages by index
    const sortedPages = Array.from(pageGroups.entries()).sort((a, b) => a[0] - b[0]);

    // Build the sequence
    const sequence = [];
    let tokenIndex = 0;

    for (const [pageIndex, items] of sortedPages) {
        // Group words that came from the same original text item
        // This maintains reading order when text wraps across lines
        const originalItemGroups = new Map();

        for (const item of items) {
            // Use itemIndex to identify which items came from the same original
            const originalKey = `${pageIndex}-${item.itemIndex}`;

            if (!originalItemGroups.has(originalKey)) {
                originalItemGroups.set(originalKey, {
                    items: [],
                    avgY: item.y,
                    avgX: item.x,
                    pageIndex: item.pageIndex,
                    sourcePdf: item.sourcePdf,
                    itemIndex: item.itemIndex
                });
            }

            originalItemGroups.get(originalKey).items.push(item);
        }

        // Now we have groups of words from the same original text item
        // Sort these groups by reading order (Y, then X within same Y)
        const groupArray = Array.from(originalItemGroups.values());

        // Detect columns for proper reading order
        const columns = detectColumns(items);

        // Assign each group to a column based on its avgX
        groupArray.forEach(group => {
            const centerX = group.avgX;
            let assignedColumn = 0;

            for (let i = 0; i < columns.length; i++) {
                if (centerX >= columns[i].xMin && centerX < columns[i].xMax) {
                    assignedColumn = i;
                    break;
                }
            }

            group.column = assignedColumn;
        });

        // Sort groups by Y first, then by column for multi-column layouts
        groupArray.sort((a, b) => {
            const yDiff = a.avgY - b.avgY;
            if (Math.abs(yDiff) > 10) {
                // Different rows - sort by Y (descending since PDF Y increases upward)
                return b.avgY - a.avgY;
            }
            // Same row - sort by column (left to right)
            return a.column - b.column;
        });

        // Build sequence from sorted groups
        for (const group of groupArray) {
            // Sort items within group by X (left to right)
            group.items.sort((a, b) => a.x - b.x);

            // Add each word in the group to the sequence
            for (const item of group.items) {
                sequence.push({
                    text: item.text,
                    tokenIndex: tokenIndex++,
                    pageIndex: item.pageIndex,
                    x: item.x,
                    y: item.y,
                    width: item.width,
                    height: item.height,
                    rotation: item.rotation || 0,
                    sourcePdf: item.sourcePdf,
                    // Keep reference to original item
                    item: item
                });
            }

            // Add a space between word groups for text continuity
            sequence.push({
                text: ' ',
                tokenIndex: tokenIndex++,
                pageIndex: group.pageIndex,
                isSpace: true,
                sourcePdf: group.sourcePdf
            });
        }

        // Add a page break token
        sequence.push({
            text: '\f', // Form feed character for page break
            tokenIndex: tokenIndex++,
            pageIndex: pageIndex,
            isPageBreak: true,
            sourcePdf: items[0]?.sourcePdf || null
        });
    }

    return sequence;
}

/**
 * Build a plain text string from a document sequence
 * Useful for passing to diff-match-patch
 * @param {Array} sequence - Document text sequence
 * @returns {string} Plain text representation
 */
function sequenceToPlainText(sequence) {
    return sequence.map(token => token.text).join('');
}

/**
 * Get combined plain text from both PDFs for diffing
 * @returns {Object} { textA, textB, sequenceA, sequenceB }
 */
function getDiffTexts() {
    const sequenceA = buildDocumentTextSequence(state.textItemsA);
    const sequenceB = buildDocumentTextSequence(state.textItemsB);

    const textA = sequenceToPlainText(sequenceA);
    const textB = sequenceToPlainText(sequenceB);

    return {
        textA,
        textB,
        sequenceA,
        sequenceB
    };
}

// ============================================
// Exports
// ============================================

export {
    detectColumns,
    groupByColumns,
    groupTextItemsByLine,
    groupTextItemsByPageAndLine,
    mergeLineText,
    getDocumentLines,
    buildDocumentTextSequence,
    sequenceToPlainText,
    getDiffTexts
};
