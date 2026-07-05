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
 * Get the diff-match-patch instance (lazy initialization).
 * Module-local so the pure diff pipeline does not depend on app state.
 * @returns {Object} diff-match-patch instance
 */
let dmpInstance = null;
function getDiffEngine() {
    if (!dmpInstance) {
        dmpInstance = initDiffEngine();
    }
    return dmpInstance;
}

/**
 * Apply length-preserving text transforms for diff options.
 * Length preservation is what keeps the diff indices aligned with the
 * original token sequences, so only per-character substitutions happen here.
 * @param {string} text - Diff text built from the token sequence
 * @param {Object} options - { ignoreCase, pageBreaksAsSpaces }
 * @returns {string} Transformed text with identical length
 */
function prepareDiffText(text, options = {}) {
    let out = text;
    if (options.pageBreaksAsSpaces) {
        out = out.replace(/\f/g, ' ');
    }
    if (options.ignoreCase) {
        const chars = out.split('');
        for (let i = 0; i < chars.length; i++) {
            const lower = chars[i].toLowerCase();
            // Skip the rare mappings that change length (e.g. Turkish dotted I)
            if (lower.length === 1) {
                chars[i] = lower;
            }
        }
        out = chars.join('');
    }
    return out;
}

/**
 * Encode both texts word-by-word into single characters so diff-match-patch
 * operates on whole words (the standard dmp line-mode recipe applied to
 * words). Each word and each whitespace character becomes one token.
 * @returns {Object|null} { encodedA, encodedB, tokens } or null if the
 *                        vocabulary would spill into surrogate code units
 */
function encodeWordTokens(textA, textB) {
    const tokens = [];
    const tokenIds = new Map();

    const encode = (text) => {
        const parts = text.match(/[^\s]+|\s/g) || [];
        let encoded = '';
        for (const part of parts) {
            let id = tokenIds.get(part);
            if (id === undefined) {
                id = tokens.length;
                if (id >= 0xD7FF) {
                    return null; // vocabulary too large for safe encoding
                }
                tokens.push(part);
                tokenIds.set(part, id);
            }
            encoded += String.fromCharCode(id);
        }
        return encoded;
    };

    const encodedA = encode(textA);
    if (encodedA === null) return null;
    const encodedB = encode(textB);
    if (encodedB === null) return null;
    return { encodedA, encodedB, tokens };
}

/**
 * Rewrite encoded diff texts back to the original word tokens, in place.
 */
function decodeWordTokens(diffs, tokens) {
    for (let i = 0; i < diffs.length; i++) {
        const encoded = diffs[i][1];
        let text = '';
        for (let j = 0; j < encoded.length; j++) {
            text += tokens[encoded.charCodeAt(j)];
        }
        diffs[i][1] = text;
    }
}

/**
 * Compute diff between two text strings.
 * @param {string} text1 - Original text
 * @param {string} text2 - Modified text
 * @param {Object} options - { granularity: 'char'|'word', ignoreCase, pageBreaksAsSpaces }
 * @returns {Array} Array of dmp Diff entries. Each entry supports index
 *                  access: entry[0] is -1 (delete), 0 (equal), or 1 (insert);
 *                  entry[1] is the text. Entries are NOT array-destructurable.
 */
function computeDiff(text1, text2, options = {}) {
    const dmp = getDiffEngine();
    const a = prepareDiffText(text1, options);
    const b = prepareDiffText(text2, options);

    if (options.granularity === 'word') {
        const encoded = encodeWordTokens(a, b);
        if (encoded) {
            const diffs = dmp.diff_main(encoded.encodedA, encoded.encodedB, false);
            decodeWordTokens(diffs, encoded.tokens);
            // Merge adjacent same-op runs after rehydration
            dmp.diff_cleanupMerge(diffs);
            return diffs;
        }
        // Fall through to character mode when encoding is not possible
    }

    const diffs = dmp.diff_main(a, b);

    // Clean up the diff for human readability: merges adjacent diffs of the
    // same type and eliminates trivial equalities
    dmp.diff_cleanupSemantic(diffs);
    dmp.diff_cleanupEfficiency(diffs);

    return diffs;
}

/**
 * Shared classification for a delete-followed-by-insert pair.
 * Used by both getDiffStats and mapDiffsToCoordinates so the summary
 * numbers always agree with what gets highlighted.
 */
function isModificationPair(deletedText, insertedText) {
    const lenRatio = Math.min(deletedText.length, insertedText.length) /
                     Math.max(deletedText.length, insertedText.length);
    return lenRatio > 0.3 || (deletedText.length <= 50 && insertedText.length <= 50);
}

/**
 * Get diff statistics.
 * Region counts are what the summary UI shows (one modification = one
 * delete+insert pair, counted once, NOT halved afterwards); char counts
 * give magnitude for reports.
 * @param {Array} diffs - Diff array from computeDiff
 * @returns {Object} { insertions, deletions, modifications,
 *                     insertedChars, deletedChars, modifiedChars, unchanged }
 */
function getDiffStats(diffs) {
    let insertions = 0;
    let deletions = 0;
    let modifications = 0;
    let insertedChars = 0;
    let deletedChars = 0;
    let modifiedChars = 0;
    let unchanged = 0;

    // NOTE: diff-match-patch returns Diff objects that support index access
    // ([0] = op, [1] = text) but are NOT iterable, so no array destructuring.
    let i = 0;
    while (i < diffs.length) {
        const type = diffs[i][0];
        const text = diffs[i][1];

        if (type === 0) {
            unchanged += text.length;
        } else if (type === -1) {
            const next = i + 1 < diffs.length ? diffs[i + 1] : null;
            if (next && next[0] === 1 && isModificationPair(text, next[1])) {
                // Delete followed by insert = one modification region
                modifications++;
                modifiedChars += Math.max(text.length, next[1].length);
                i++; // Skip the insert we just counted
            } else if (next && next[0] === 1) {
                // Dissimilar pair: count as separate delete + insert
                deletions++;
                deletedChars += text.length;
                insertions++;
                insertedChars += next[1].length;
                i++;
            } else {
                deletions++;
                deletedChars += text.length;
            }
        } else if (type === 1) {
            insertions++;
            insertedChars += text.length;
        }

        i++;
    }

    return {
        insertions,
        deletions,
        modifications,
        insertedChars,
        deletedChars,
        modifiedChars,
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
 * @returns {Object} { diffsA, diffsB, changes } - Per-PDF highlight entries
 *                   plus an ordered change list for change navigation. Each
 *                   change: { type, pageIndexA, pageIndexB, bboxA, bboxB,
 *                   textA, textB }; highlight entries carry changeIndex.
 */
function mapDiffsToCoordinates(diffs, sequenceA, sequenceB) {
    const diffsA = []; // Diffs to highlight on PDF A (deletions, modifications)
    const diffsB = []; // Diffs to highlight on PDF B (insertions, modifications)
    const changes = []; // Ordered regions for prev/next change navigation

    let charIndexA = 0; // Current character position in text A
    let charIndexB = 0; // Current character position in text B

    const tokenAnchor = (tokens) => tokens.length
        ? {
            pageIndex: tokens[0].pageIndex,
            bbox: {
                x: tokens[0].x,
                y: tokens[0].y,
                width: tokens[0].width,
                height: tokens[0].height,
                rotation: tokens[0].rotation || 0
            }
        }
        : null;

    // Word-granularity diffs emit one delete/insert pair per word with a
    // single-space equal between them. Cluster those into one navigable
    // change region: a change joins the previous one when only a short
    // all-space equal separates them (page breaks never join).
    let joinableGap = false;
    const openChange = (entry) => {
        if (joinableGap && changes.length) {
            const previous = changes[changes.length - 1];
            if (previous.type !== entry.type) {
                previous.type = 'modified';
            }
            previous.textA = [previous.textA, entry.textA].filter(Boolean).join(' ') || null;
            previous.textB = [previous.textB, entry.textB].filter(Boolean).join(' ') || null;
            if (previous.pageIndexA == null) previous.pageIndexA = entry.pageIndexA;
            if (previous.pageIndexB == null) previous.pageIndexB = entry.pageIndexB;
            if (!previous.bboxA) previous.bboxA = entry.bboxA;
            if (!previous.bboxB) previous.bboxB = entry.bboxB;
            return changes.length - 1;
        }
        changes.push(entry);
        return changes.length - 1;
    };

    let i = 0;
    while (i < diffs.length) {
        // Index access, not destructuring: dmp Diff objects are not iterable.
        const type = diffs[i][0];
        const text = diffs[i][1];
        const textLength = text.length;

        if (type === 0) {
            // Equal - skip, nothing to highlight. A short all-space equal
            // marks the next change as joinable with the previous one.
            joinableGap = /^ {1,2}$/.test(text) && changes.length > 0;
            charIndexA += textLength;
            charIndexB += textLength;
            i++;
        } else if (type === -1) {
            // Check if this deletion is followed by an insertion (modification pattern)
            if (i + 1 < diffs.length && diffs[i + 1][0] === 1) {
                // This is a modification (delete + insert)
                const deletedText = diffs[i][1];
                const insertedText = diffs[i + 1][1];

                if (isModificationPair(deletedText, insertedText)) {
                    // Get tokens for the deleted part (from PDF A)
                    const charStartA = charIndexA;
                    const charEndA = charIndexA + deletedText.length;
                    const tokensA = getTokensInRange(sequenceA, charStartA, charEndA);

                    // Get tokens for the inserted part (from PDF B)
                    const charStartB = charIndexB;
                    const charEndB = charIndexB + insertedText.length;
                    const tokensB = getTokensInRange(sequenceB, charStartB, charEndB);

                    // Record one navigable change region for the pair
                    const anchorA = tokenAnchor(tokensA);
                    const anchorB = tokenAnchor(tokensB);
                    let changeIndex = null;
                    if (anchorA || anchorB) {
                        changeIndex = openChange({
                            type: 'modified',
                            pageIndexA: anchorA ? anchorA.pageIndex : null,
                            pageIndexB: anchorB ? anchorB.pageIndex : null,
                            bboxA: anchorA ? anchorA.bbox : null,
                            bboxB: anchorB ? anchorB.bbox : null,
                            textA: deletedText,
                            textB: insertedText
                        });
                    }

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
                            changeIndex,
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
                            changeIndex,
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

            const anchor = tokenAnchor(tokens);
            let changeIndex = null;
            if (anchor) {
                changeIndex = openChange({
                    type: 'deletion',
                    pageIndexA: anchor.pageIndex,
                    pageIndexB: null,
                    bboxA: anchor.bbox,
                    bboxB: null,
                    textA: text,
                    textB: null
                });
            }

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
                    boundingBox: bbox,
                    changeIndex
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

            const anchor = tokenAnchor(tokens);
            let changeIndex = null;
            if (anchor) {
                changeIndex = openChange({
                    type: 'insertion',
                    pageIndexA: null,
                    pageIndexB: anchor.pageIndex,
                    bboxA: null,
                    bboxB: anchor.bbox,
                    textA: null,
                    textB: text
                });
            }

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
                    boundingBox: bbox,
                    changeIndex
                });
            }

            charIndexB += textLength;
            i++;
        } else {
            i++;
        }
    }

    return { diffsA, diffsB, changes };
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
    buildPageDiffMapping,
    prepareDiffText,
    encodeWordTokens,
    decodeWordTokens,
    isModificationPair
};
