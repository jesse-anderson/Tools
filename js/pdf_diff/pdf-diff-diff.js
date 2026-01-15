// ============================================
// PDF Diff Checker - Diff Engine
// ============================================

/**
 * Diff computation and coordinate mapping using diff-match-patch library
 * Handles text diffing, statistics, and mapping diffs back to PDF coordinates
 *
 * Note: diff-match-patch is loaded globally via the HTML script tag
 * before this module is imported.
 */

import { state } from './pdf-diff-state.js';

// ============================================
// Diff Integration (diff-match-patch)
// ============================================

/**
 * Initialize and configure the diff-match-patch library
 * @returns {Object} Configured diff-match-patch instance
 */
function initDiffEngine() {
    // Check that the library was loaded by the HTML script tag
    if (typeof diff_match_patch === 'undefined') {
        throw new Error('diff-match-patch library not loaded. Please ensure the CDN is accessible.');
    }

    const dmp = new diff_match_patch();

    // Configure for text diffing
    // Timeout: 0 = no timeout (run until complete)
    dmp.Diff_Timeout = 0;

    // Edit cost: higher values = more likely to show edits than replacements
    dmp.Diff_EditCost = 4;

    // Match threshold: 0.0 = exact match only, 1.0 = match anything
    dmp.Match_Threshold = 0.5;

    // Match distance: how far to search for a match
    dmp.Match_Distance = 1000;

    // Patch delete threshold: 0 = exact match, 1 = match anything
    dmp.Patch_DeleteThreshold = 0.5;

    return dmp;
}

/**
 * Get the diff-match-patch instance (lazy initialization)
 * @returns {Object} diff-match-patch instance
 */
function getDiffEngine() {
    if (!state.diffEngine) {
        state.diffEngine = initDiffEngine();
    }
    return state.diffEngine;
}

/**
 * Compute diff between two text strings
 * @param {string} text1 - Original text
 * @param {string} text2 - Modified text
 * @returns {Array} Array of diff objects from diff-match-patch
 *                   Each diff: [type, text] where type is -1 (delete), 0 (equal), or 1 (insert)
 */
function computeDiff(text1, text2) {
    const dmp = getDiffEngine();

    // Compute the diff
    // The second parameter (0) is the timeout in seconds
    // The third parameter (false) means don't check for line-by-line diff
    const diffs = dmp.diff_main(text1, text2);

    // Clean up the diff for human readability
    // This merges adjacent diffs of the same type and eliminates trivial equalities
    dmp.diff_cleanupSemantic(diffs);

    // Optional: further cleanup to eliminate very short equalities
    dmp.diff_cleanupEfficiency(diffs);

    return diffs;
}

/**
 * Get diff statistics (counts of insertions, deletions, modifications)
 * @param {Array} diffs - Diff array from computeDiff
 * @returns {Object} { insertions, deletions, modifications, unchanged }
 */
function getDiffStats(diffs) {
    let insertions = 0;
    let deletions = 0;
    let modifications = 0;
    let unchanged = 0;

    // Track if we're in a delete followed by insert (modification pattern)
    let i = 0;
    while (i < diffs.length) {
        const [type, text] = diffs[i];

        if (type === 0) {
            // Equal/unchanged
            unchanged += text.length;
        } else if (type === -1) {
            // Delete
            if (i + 1 < diffs.length && diffs[i + 1][0] === 1) {
                // Delete followed by insert = modification
                modifications += Math.max(text.length, diffs[i + 1][1].length);
                i++; // Skip the insert we just counted
            } else {
                deletions += text.length;
            }
        } else if (type === 1) {
            // Insert (not preceded by delete)
            insertions += text.length;
        }

        i++;
    }

    return {
        insertions,
        deletions,
        modifications,
        unchanged
    };
}

// ============================================
// Diff Coordinate Mapping
// ============================================

/**
 * Map diff results back to source text items with coordinates
 * This creates annotated diffs that can be highlighted on the PDF pages
 *
 * Diff Types:
 * - deletion: Text removed from PDF A (red highlight on PDF A)
 * - insertion: Text added to PDF B (green highlight on PDF B)
 * - modified: Text changed (yellow highlight on both PDFs - delete+insert pair)
 *
 * Word-level highlighting: Each token/word gets its own highlight rectangle
 *
 * @param {Array} diffs - Diff array from computeDiff
 * @param {Array} sequenceA - Document sequence for PDF A
 * @param {Array} sequenceB - Document sequence for PDF B
 * @returns {Object} { diffsA, diffsB } - Arrays of diffs with coordinate info
 */
function mapDiffsToCoordinates(diffs, sequenceA, sequenceB) {
    const diffsA = []; // Diffs to highlight on PDF A (deletions, modifications)
    const diffsB = []; // Diffs to highlight on PDF B (insertions, modifications)

    let charIndexA = 0; // Current character position in text A
    let charIndexB = 0; // Current character position in text B

    let i = 0;
    while (i < diffs.length) {
        const [type, text] = diffs[i];
        const textLength = text.length;

        if (type === 0) {
            // Equal - skip, nothing to highlight
            charIndexA += textLength;
            charIndexB += textLength;
            i++;
        } else if (type === -1) {
            // Check if this deletion is followed by an insertion (modification pattern)
            if (i + 1 < diffs.length && diffs[i + 1][0] === 1) {
                // This is a modification (delete + insert)
                const [_, deletedText] = diffs[i];
                const [__, insertedText] = diffs[i + 1];

                // Determine if this qualifies as a modification (similar lengths)
                // Allow some flexibility since word counts can differ
                const lenRatio = Math.min(deletedText.length, insertedText.length) /
                                Math.max(deletedText.length, insertedText.length);
                const isModification = lenRatio > 0.3 || // At least 30% size match
                                     (deletedText.length <= 50 && insertedText.length <= 50); // Or both are short

                if (isModification) {
                    // Get tokens for the deleted part (from PDF A)
                    const charStartA = charIndexA;
                    const charEndA = charIndexA + deletedText.length;
                    const tokensA = getTokensInRange(sequenceA, charStartA, charEndA);

                    // Get tokens for the inserted part (from PDF B)
                    const charStartB = charIndexB;
                    const charEndB = charIndexB + insertedText.length;
                    const tokensB = getTokensInRange(sequenceB, charStartB, charEndB);

                    // Create modification entries for both PDFs - ONE PER TOKEN (word-level)
                    // For PDF A, show what was deleted (in yellow)
                    for (const token of tokensA) {
                        const bbox = {
                            x: token.x,
                            y: token.y,
                            width: token.width,
                            height: token.height,
                            rotation: token.rotation || 0
                        };

                        // Debug: Check for undefined before pushing
                        // if (bbox.x === undefined || bbox.y === undefined || bbox.width === undefined || bbox.height === undefined) {
                        //     console.error('[mapDiffsToCoordinates] Modification A undefined coords:', {
                        //         text: token.text,
                        //         bbox,
                        //         tokenKeys: Object.keys(token)
                        //     });
                        // }

                        diffsA.push({
                            type: 'modified',
                            text: token.text,
                            pageIndex: token.pageIndex,
                            boundingBox: bbox,
                            modifiedText: insertedText // Show what it became
                        });
                    }

                    // For PDF B, show what was inserted (in yellow)
                    for (const token of tokensB) {
                        const bbox = {
                            x: token.x,
                            y: token.y,
                            width: token.width,
                            height: token.height,
                            rotation: token.rotation || 0
                        };

                        // Debug: Check for undefined before pushing
                        // if (bbox.x === undefined || bbox.y === undefined || bbox.width === undefined || bbox.height === undefined) {
                        //     console.error('[mapDiffsToCoordinates] Modification B undefined coords:', {
                        //         text: token.text,
                        //         bbox,
                        //         tokenKeys: Object.keys(token)
                        //     });
                        // }

                        diffsB.push({
                            type: 'modified',
                            text: token.text,
                            pageIndex: token.pageIndex,
                            boundingBox: bbox,
                            originalText: deletedText // Show what it was before
                        });
                    }

                    charIndexA += deletedText.length;
                    charIndexB += insertedText.length;
                    i += 2; // Skip both delete and insert
                    continue;
                }
            }

            // Regular deletion - highlight on PDF A (one highlight per token/word)
            const charStart = charIndexA;
            const charEnd = charIndexA + textLength;

            // Find all tokens that overlap this range
            const tokens = getTokensInRange(sequenceA, charStart, charEnd);

            // Create one diff entry per TOKEN for word-level highlighting
            for (const token of tokens) {
                const bbox = {
                    x: token.x,
                    y: token.y,
                    width: token.width,
                    height: token.height,
                    rotation: token.rotation || 0
                };

                // Debug: Check for undefined before pushing
                // if (bbox.x === undefined || bbox.y === undefined || bbox.width === undefined || bbox.height === undefined) {
                //     console.error('[mapDiffsToCoordinates] Creating diff with undefined coords:', {
                //         type: 'deletion',
                //         text: token.text,
                //         bbox,
                //         tokenKeys: Object.keys(token),
                //         fullToken: token
                //     });
                // }

                diffsA.push({
                    type: 'deletion',
                    text: token.text,
                    pageIndex: token.pageIndex,
                    boundingBox: bbox
                });
            }

            charIndexA += textLength;
            i++;
        } else if (type === 1) {
            // Regular insertion (not preceded by deletion) - highlight on PDF B (one highlight per token/word)
            const charStart = charIndexB;
            const charEnd = charIndexB + textLength;

            // Find all tokens that overlap this range
            const tokens = getTokensInRange(sequenceB, charStart, charEnd);

            // Create one diff entry per TOKEN for word-level highlighting
            for (const token of tokens) {
                const bbox = {
                    x: token.x,
                    y: token.y,
                    width: token.width,
                    height: token.height,
                    rotation: token.rotation || 0
                };

                // Debug: Check for undefined before pushing
                // if (bbox.x === undefined || bbox.y === undefined || bbox.width === undefined || bbox.height === undefined) {
                //     console.error('[mapDiffsToCoordinates] Creating diff with undefined coords:', {
                //         type: 'insertion',
                //         text: token.text,
                //         bbox,
                //         tokenKeys: Object.keys(token),
                //         fullToken: token
                //     });
                // }

                diffsB.push({
                    type: 'insertion',
                    text: token.text,
                    pageIndex: token.pageIndex,
                    boundingBox: bbox
                });
            }

            charIndexB += textLength;
            i++;
        } else {
            i++;
        }
    }

    return { diffsA, diffsB };
}

/**
 * Get all tokens that overlap a character range in the sequence
 * @param {Array} sequence - Document token sequence
 * @param {number} charStart - Start character index
 * @param {number} charEnd - End character index
 * @returns {Array} Array of tokens that overlap the range
 */
function getTokensInRange(sequence, charStart, charEnd) {
    const result = [];
    let currentCharIndex = 0;

    for (const token of sequence) {
        const tokenLength = token.text.length;
        const tokenEnd = currentCharIndex + tokenLength;

        // Skip line breaks, page breaks, and space tokens for highlighting
        if (token.isLineBreak || token.isPageBreak || token.isSpace) {
            currentCharIndex += tokenLength;
            continue;
        }

            // Check for overlap
        if (tokenEnd > charStart && currentCharIndex < charEnd) {
            // Ensure token has required coordinate properties
            // Use != null to catch both undefined and null
            const hasCoords = token.x != null && token.y != null &&
                             token.width != null && token.height != null;

            // Debug: Log tokens without coordinates
            // if (!hasCoords) {
            //     console.warn('[getTokensInRange] Token missing coordinates:', {
            //         text: token.text,
            //         x: token.x,
            //         y: token.y,
            //         width: token.width,
            //         height: token.height,
            //         tokenKeys: Object.keys(token),
            //         fullToken: token
            //     });
            //     continue; // Skip tokens without coordinates
            // }

            if (hasCoords) {
                result.push({
                    ...token,
                    // Explicitly ensure coordinate properties exist
                    x: token.x,
                    y: token.y,
                    width: token.width,
                    height: token.height,
                    rotation: token.rotation || 0,
                    // Calculate how much of this token is in the range
                    overlapStart: Math.max(charStart - currentCharIndex, 0),
                    overlapEnd: Math.min(charEnd - currentCharIndex, tokenLength)
                });
            }
        }

        currentCharIndex += tokenLength;

        // Optimization: stop if we've passed the range
        if (currentCharIndex >= charEnd) {
            break;
        }
    }

    return result;
}

/**
 * Group tokens by their page index
 * @param {Array} tokens - Array of tokens
 * @returns {Map} Map of pageIndex -> array of tokens
 */
function groupTokensByPage(tokens) {
    const byPage = new Map();

    for (const token of tokens) {
        if (!byPage.has(token.pageIndex)) {
            byPage.set(token.pageIndex, []);
        }
        byPage.get(token.pageIndex).push(token);
    }

    return byPage;
}

/**
 * Merge bounding boxes of multiple tokens
 * @param {Array} tokens - Array of tokens with coordinates
 * @returns {Object} Merged bounding box { x, y, width, height, rotation }
 */
function mergeBoundingBoxes(tokens) {
    if (tokens.length === 0) {
        return { x: 0, y: 0, width: 0, height: 0, rotation: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    // Track if tokens have rotation (use majority rotation)
    const rotationCounts = {};
    let maxRotationCount = 0;
    let dominantRotation = 0;

    for (const token of tokens) {
        const tokenX2 = token.x + token.width;
        const tokenY2 = token.y + token.height;

        minX = Math.min(minX, token.x);
        minY = Math.min(minY, token.y);
        maxX = Math.max(maxX, tokenX2);
        maxY = Math.max(maxY, tokenY2);

        // Track rotation
        const rotation = token.rotation || 0;
        rotationCounts[rotation] = (rotationCounts[rotation] || 0) + 1;
        if (rotationCounts[rotation] > maxRotationCount) {
            maxRotationCount = rotationCounts[rotation];
            dominantRotation = rotation;
        }
    }

    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
        rotation: dominantRotation
    };
}

/**
 * Build page-to-diff mapping for efficient rendering
 * @param {Array} diffs - Array of diffs with pageIndex
 * @returns {Object} Map of pageIndex -> array of diffs
 */
function buildPageDiffMapping(diffs) {
    const pageMap = {};

    for (const diff of diffs) {
        if (!pageMap[diff.pageIndex]) {
            pageMap[diff.pageIndex] = [];
        }
        pageMap[diff.pageIndex].push(diff);
    }

    return pageMap;
}

// ============================================
// Exports
// ============================================

export {
    initDiffEngine,
    getDiffEngine,
    computeDiff,
    getDiffStats,
    mapDiffsToCoordinates,
    getTokensInRange,
    groupTokensByPage,
    mergeBoundingBoxes,
    buildPageDiffMapping
};
