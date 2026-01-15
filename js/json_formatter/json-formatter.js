/* ============================================
   JSON FORMATTER TOOL - LOGIC MODULE
   ============================================ */

/**
 * JSON Formatter Tool
 * Handles JSON validation, formatting, minification, and syntax highlighting.
 * Includes precision loss detection for large integers.
 */

// Import Clipboard utility from shared module
import { Clipboard } from '../shared.js';

// File size thresholds (in bytes) - module level constants
const LARGE_FILE_THRESHOLD = 5 * 1024 * 1024;  // 5MB
const HUGE_FILE_THRESHOLD = 10 * 1024 * 1024;   // 10MB
const MAX_FILE_THRESHOLD = 50 * 1024 * 1024;    // 50MB (hard limit)

// Syntax highlighting token limit - prevents DOM memory issues on large files
const SYNTAX_HIGHLIGHT_MAX_TOKENS = 50000;      // ~50k tokens (roughly 1-2MB of JSON)
// Stats parsing threshold - skip expensive JSON traversal for large files
const STATS_PARSE_THRESHOLD = 1024 * 1024;      // 1MB - above this, only show file size

// Pre-compiled regex patterns for performance
// Used to remove JSON string literals to avoid false positives when scanning for numbers/keys
// Fixed: ReDoS vulnerability - removed nested quantifier by using single character class
// The pattern below matches: " + any of (unicode escape OR simple escape OR any char except ") + "
// Using greedy repetition on a single alternation group prevents catastrophic backtracking
const JSON_STRING_PATTERN = /"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^"\\])*"/g;
// Matches integers with 16+ digits (may exceed MAX_SAFE_INTEGER)
// Note: MAX_SAFE_INTEGER is 9007199254740991 (16 digits), so we catch 16+ digits
// and filter precisely with the Number.MAX_SAFE_INTEGER check below
// Fixed: Original [:\\[,\s] had unintended range :-[ (ASCII 58-91).
// Fix: Hyphen at start of char class ensures it's literal, not a range.
// Class [,:\\s\\[] matches: comma, colon, whitespace, or open bracket.
const UNSAFE_INTEGER_PATTERN = /(?:^|[,:\\s\\[])(-?\d{16,})(?=[,\]\}\s]|$)/g;
// Common JSON syntax error patterns
const TRAILING_COMMA_PATTERN = /,\s*[\]}]/;
const SINGLE_QUOTE_KEY_PATTERN = /'[^']*'\s*:/;
const SINGLE_QUOTE_VALUE_PATTERN = /:\s*'[^']*'/;
const UNQUOTED_KEY_PATTERN = /(?:^|[{,])\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/;
const COMMENT_PATTERN = /\/\/|\/\*/;
const NAN_INFINITY_PATTERN = /\b(NaN|Infinity|-Infinity)\b/;
const UNDEFINED_PATTERN = /\bundefined\b/;
// Syntax highlighting pattern - matches strings, booleans, null, and numbers
const SYNTAX_HIGHLIGHT_PATTERN = /("(?:\\u[a-zA-Z0-9]{4}|\\[\\"\/bnrt]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g;

/**
 * Initialize the JSON Formatter tool
 */
function initTool() {
    'use strict';

    // DOM Elements - with null checks for safety
    const inputArea = document.getElementById('inputArea');
    const outputArea = document.getElementById('outputArea');

    // Verify required elements exist
    if (!inputArea || !outputArea) {
        console.error('JSON Formatter: Required DOM elements not found');
        return;
    }

    // Store the last formatted JSON for copy functionality
    let lastFormattedJSON = '';

    // Track file size warning state
    let currentFileSizeWarning = null;  // 'large', 'huge', or null
    let hasAcknowledgedFileSize = false;

    // Banners
    const errorBanner = document.getElementById('errorBanner');
    const errorText = document.getElementById('errorText');
    const warningBanner = document.getElementById('warningBanner');
    const warningText = document.getElementById('warningText');
    const successBanner = document.getElementById('successBanner');
    const successText = successBanner?.querySelector('span');

    const editBtn = document.getElementById('editBtn');

    // Stats Elements - with null checks
    const statSizeEl = document.getElementById('statSize');
    const statKeysEl = document.getElementById('statKeys');
    const statArraysEl = document.getElementById('statArrays');
    const statDepthEl = document.getElementById('statDepth');

    const stats = {
        size: statSizeEl,
        keys: statKeysEl,
        arrays: statArraysEl,
        depth: statDepthEl
    };

    // Debounce timeout for input handler
    let timeout;

    // Helper functions for banner visibility with ARIA attributes
    function showBanner(banner) {
        if (!banner) return;
        banner.style.display = 'flex';
        banner.setAttribute('aria-hidden', 'false');
    }

    function hideBanner(banner) {
        if (!banner) return;
        banner.style.display = 'none';
        banner.setAttribute('aria-hidden', 'true');
    }

    function hideAllBanners() {
        hideBanner(errorBanner);
        hideBanner(warningBanner);
        hideBanner(successBanner);
    }

    // Initialize ARIA attributes on page load
    function initAriaAttributes() {
        // All banners start hidden
        if (errorBanner) errorBanner.setAttribute('aria-hidden', 'true');
        if (warningBanner) warningBanner.setAttribute('aria-hidden', 'true');
        if (successBanner) successBanner.setAttribute('aria-hidden', 'true');
    }

    /**
     * Check file size and show appropriate warnings
     * @param {string} content - JSON content to check
     * @returns {boolean} - True if file size is acceptable, false if it exceeds hard limit
     */
    function checkFileSize(content) {
        const size = new Blob([content]).size;

        // Reset acknowledgment if size changed significantly
        if (currentFileSizeWarning === null && size < LARGE_FILE_THRESHOLD) {
            hasAcknowledgedFileSize = false;
        }

        // Hard limit - refuse to process
        if (size > MAX_FILE_THRESHOLD) {
            showBanner(warningBanner);
            if (warningText) {
                warningText.textContent = `File too large (${formatBytes(size)}). Maximum size is ${formatBytes(MAX_FILE_THRESHOLD)}. Processing would likely crash your browser.`;
            }
            currentFileSizeWarning = 'max';
            return false;
        }

        // Huge file warning (10MB+) - show persistent warning
        if (size > HUGE_FILE_THRESHOLD) {
            if (!hasAcknowledgedFileSize) {
                showBanner(warningBanner);
                if (warningText) {
                    warningText.textContent = `Large file detected (${formatBytes(size)}). Processing may take several seconds and temporarily freeze your browser. Consider using a smaller sample.`;
                }
                currentFileSizeWarning = 'huge';
            }
            return true;
        }

        // Large file warning (5MB+) - show warning
        if (size > LARGE_FILE_THRESHOLD) {
            if (!hasAcknowledgedFileSize) {
                showBanner(warningBanner);
                if (warningText) {
                    warningText.textContent = `Large file detected (${formatBytes(size)}). Processing may be slow. Consider using a smaller sample if possible.`;
                }
                currentFileSizeWarning = 'large';
            }
            return true;
        }

        // File is within acceptable size - clear warning
        if (currentFileSizeWarning) {
            hideBanner(warningBanner);
            currentFileSizeWarning = null;
            hasAcknowledgedFileSize = false;
        }

        return true;
    }

    /**
     * Format JSON with pretty-printing
     */
    function formatJSON() {
        processJSON(true);
    }

    /**
     * Minify JSON by removing whitespace
     */
    function minifyJSON() {
        processJSON(false);
    }

    /**
     * Process JSON - parse, validate, and format/minify
     * @param {boolean} pretty - Whether to pretty-print (true) or minify (false)
     */
    function processJSON(pretty) {
        try {
            const raw = inputArea.value;
            if (!raw.trim()) {
                showError(new Error("Input is empty"));
                return;
            }

            // 0. Check file size before processing
            if (!checkFileSize(raw)) {
                // File exceeds hard limit - abort processing
                return;
            }

            // Mark as acknowledged so warning doesn't reappear during processing
            hasAcknowledgedFileSize = true;

            // 1. Check for Precision Loss BEFORE parsing
            // This is critical because JSON.parse is destructive
            checkPrecisionLoss(raw);

            // 2. Parse & Transform
            const obj = JSON.parse(raw);
            const originalSize = new Blob([raw]).size;
            const formatted = pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
            const newSize = new Blob([formatted]).size;

            // 3. Update UI
            if (pretty) {
                // Store formatted JSON for accurate copying
                lastFormattedJSON = formatted;
                inputArea.style.display = 'none';
                // Clear previous content and safely append highlighted fragment
                outputArea.textContent = '';
                outputArea.appendChild(syntaxHighlight(formatted));
                outputArea.classList.add('active');
            } else {
                // Store minified JSON for consistent copy behavior
                lastFormattedJSON = formatted;
                outputArea.classList.remove('active');
                inputArea.style.display = 'block';
                inputArea.value = formatted;
                // Flash effect to indicate minify completed
                flashInputArea();
            }

            if (editBtn) editBtn.style.display = pretty ? 'flex' : 'none';
            hideBanner(errorBanner);

            // Show success banner with appropriate message
            if (!pretty && originalSize > newSize) {
                // Show size reduction for minify
                const savedBytes = originalSize - newSize;
                const percentSaved = Math.round((savedBytes / originalSize) * 100);
                if (successText) {
                    successText.textContent = `Minified! Saved ${formatBytes(savedBytes)} (${percentSaved}% reduction)`;
                }
            } else if (!pretty) {
                // Minified but no size change (already minified)
                if (successText) {
                    successText.textContent = 'Minified! JSON was already compact.';
                }
            } else {
                // Format mode - reset to default message
                if (successText) {
                    successText.textContent = 'Valid JSON ✓';
                }
            }
            showBanner(successBanner);
            setTimeout(() => {
                hideBanner(successBanner);
                // Reset success text to default after hiding
                if (successText) {
                    successText.textContent = 'Valid JSON ✓';
                }
            }, 3000);

            // Update stats synchronously (no delay)
            updateStats(formatted);

        } catch (e) {
            showError(e);
        }
    }

    /**
     * Check for precision loss due to JavaScript's MAX_SAFE_INTEGER limit
     * JavaScript uses IEEE 754 doubles which can't safely represent integers above 2^53-1
     * @param {string} raw - Raw JSON string to check
     */
    function checkPrecisionLoss(raw) {
        // We need to find large integers BEFORE JSON.parse destroys them
        // Strategy: Remove all string literals first to avoid false positives,
        // then search for large integers in the remaining content.

        // First, replace all JSON string literals with placeholders
        // This prevents matching numbers that are inside strings
        const stringsRemoved = raw.replace(
            JSON_STRING_PATTERN,
            match => '"'.repeat(match.length)  // Replace with same number of quotes
        );

        // Apply the unsafe integer pattern to the string-stripped version

        let match;
        let hasIssue = false;
        const problematicNumbers = [];

        while ((match = UNSAFE_INTEGER_PATTERN.exec(stringsRemoved)) !== null) {
            const numStr = match[1];

            // JavaScript's Number can safely represent integers up to 2^53 - 1
            // That's 9007199254740991 (16 digits)
            // Anything larger will lose precision

            try {
                const asNumber = Number(numStr);

                // Primary check: explicitly verify against MAX_SAFE_INTEGER
                // This catches 9007199254740992 and above
                if (Math.abs(asNumber) > Number.MAX_SAFE_INTEGER) {
                    hasIssue = true;
                    problematicNumbers.push(numStr);
                    continue;
                }

                // Secondary check: round-trip test for edge cases
                // This catches cases where string conversion differs
                const backToString = asNumber.toString();
                if (backToString !== numStr) {
                    hasIssue = true;
                    problematicNumbers.push(numStr);
                }

            } catch (e) {
                // If we can't parse it, let the main JSON.parse handle the error
                continue;
            }
        }

        if (hasIssue) {
            showBanner(warningBanner);

            // More detailed warning message - show full problematic numbers
            if (warningText) {
                if (problematicNumbers.length === 1) {
                    warningText.textContent = `Warning: Large integer detected (${problematicNumbers[0]}). JavaScript has rounded this value.`;
                } else if (problematicNumbers.length === 2) {
                    warningText.textContent = `Warning: Large integers detected (${problematicNumbers[0]} and ${problematicNumbers[1]}). JavaScript has rounded these values.`;
                } else if (problematicNumbers.length === 3) {
                    warningText.textContent = `Warning: Large integers detected (${problematicNumbers[0]}, ${problematicNumbers[1]}, ${problematicNumbers[2]}). JavaScript has rounded these values.`;
                } else {
                    warningText.textContent = `Warning: ${problematicNumbers.length} large integers detected. JavaScript has rounded these values.`;
                }
            }
        } else {
            hideBanner(warningBanner);
        }
    }

    /**
     * Switch back to edit mode from formatted view
     */
    function editMode() {
        outputArea.classList.remove('active');
        inputArea.style.display = 'block';
        if (editBtn) editBtn.style.display = 'none';
        lastFormattedJSON = '';
        // Return focus to input area for accessibility
        inputArea.focus();
    }

    /**
     * Flash the input area to provide visual feedback after minify
     */
    function flashInputArea() {
        inputArea.classList.add('minify-flash');
        setTimeout(() => {
            inputArea.classList.remove('minify-flash');
        }, 600);
    }

    /**
     * Clear the editor and reset all state
     */
    function clearEditor() {
        inputArea.value = '';
        outputArea.innerHTML = '';
        outputArea.classList.remove('active');
        inputArea.style.display = 'block';
        hideAllBanners();
        if (editBtn) editBtn.style.display = 'none';
        lastFormattedJSON = '';
        // Reset file size warning state
        currentFileSizeWarning = null;
        hasAcknowledgedFileSize = false;
        updateStats('');
    }

    /**
     * Load sample JSON data for demonstration
     * Includes a large integer that exceeds MAX_SAFE_INTEGER
     */
    function loadSample() {
        // Use raw string literal to avoid JavaScript number parsing
        // This preserves the exact integer value as it would appear in JSON
        const sampleStr = `{
        "project": "Tools Hub",
        "version": "1.0.0",
        "active": true,
        "config": {
            "maxRetries": 3,
            "timeout": 5000
        },
        "users": [
            {
            "id": 101,
            "name": "Alice",
            "role": "admin"
            },
            {
            "id": 9223372036854775807,
            "name": "BigInt_User",
            "role": "tester",
            "note": "This ID exceeds JavaScript's MAX_SAFE_INTEGER (2^53-1)"
            }
        ],
        "statistics": {
            "totalUsers": 2,
            "activeToday": 1
        }
        }`;

        inputArea.value = sampleStr;
        editMode();
        // Reset file size warning state for new content
        currentFileSizeWarning = null;
        hasAcknowledgedFileSize = false;
        updateStats(inputArea.value);
    }

    /**
     * Show a temporary banner message with auto-hide
     * @param {HTMLElement} banner - The banner element to show
     * @param {string} message - The message to display
     * @param {number} duration - How long to show the banner (ms)
     */
    function showTemporaryBanner(banner, message, duration = 3000) {
        // Set message if the banner has a text span
        const textSpan = banner.querySelector('span');
        if (textSpan) {
            textSpan.textContent = message;
        }

        showBanner(banner);

        // Auto-hide after duration
        setTimeout(() => {
            hideBanner(banner);
        }, duration);
    }

    /**
     * Copy the current result to clipboard
     * Uses the shared ToolsHub.Clipboard utility
     */
    function copyResult() {
        // Prefer lastFormattedJSON if available (contains result of last format/minify operation)
        // Otherwise fall back to current input area content
        const text = lastFormattedJSON || inputArea.value;

        // Check if there's any text to copy
        if (!text || !text.trim()) {
            showTemporaryBanner(warningBanner, 'Nothing to copy! Please enter some JSON first.');
            return;
        }

        // Helper to show success animation on the copy button
        const showSuccess = () => {
            const copyBtn = document.getElementById('copyBtn');
            if (!copyBtn) return;

            const originalHtml = copyBtn.innerHTML;

            copyBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"/>
                </svg>
                Copied!
            `;
            copyBtn.classList.add('copy-success');

            setTimeout(() => {
                copyBtn.innerHTML = originalHtml;
                copyBtn.classList.remove('copy-success');
            }, 2000);
        };

        // Use the imported Clipboard utility from shared.js
        // It has built-in fallback for older browsers
        Clipboard.copy(text).then(success => {
            if (success) {
                showSuccess();
            } else {
                showTemporaryBanner(errorBanner, 'Failed to copy to clipboard. Please try selecting and copying manually.');
            }
        }).catch(err => {
            console.error('Clipboard copy failed:', err);
            showTemporaryBanner(errorBanner, 'Failed to copy to clipboard. Please try selecting and copying manually.');
        });
    }

    /**
     * Display error message with helpful hints
     * @param {Error} e - The error object
     */
    function showError(e) {
        let msg = e.message;
        const hint = detectCommonErrors(inputArea.value);
        if (hint) msg += ` — ${hint}`;

        if (errorText) errorText.textContent = msg;

        // Make sure we're in edit mode first
        editMode();

        // Ensure error banner is visible (force show after edit mode)
        showBanner(errorBanner);
        // Hide warning and success if we have an error (error is more important)
        hideBanner(warningBanner);
        hideBanner(successBanner);

        // Scroll error into view if needed
        if (errorBanner) errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /**
     * Detect common JSON syntax errors and provide helpful hints
     * @param {string} raw - Raw JSON string to analyze
     * @returns {string|null} Error hint or null if no common errors found
     */
    function detectCommonErrors(raw) {
        // Trailing comma
        if (TRAILING_COMMA_PATTERN.test(raw)) {
            return "Trailing comma detected (not allowed in JSON)";
        }

        // Single quotes instead of double quotes
        if (SINGLE_QUOTE_KEY_PATTERN.test(raw) || SINGLE_QUOTE_VALUE_PATTERN.test(raw)) {
            return "Single quotes detected (JSON requires double quotes)";
        }

        // Unquoted keys - first remove string literals to avoid false positives
        const stringsRemoved = raw.replace(
            JSON_STRING_PATTERN,
            match => '"'.repeat(match.length)
        );
        if (UNQUOTED_KEY_PATTERN.test(stringsRemoved)) {
            return "Unquoted key detected (all keys must be quoted)";
        }

        // Comments (not allowed in JSON)
        if (COMMENT_PATTERN.test(raw)) {
            return "Comments detected (not allowed in standard JSON)";
        }

        // NaN or Infinity (not valid JSON)
        if (NAN_INFINITY_PATTERN.test(raw)) {
            return "NaN/Infinity detected (not valid JSON values)";
        }

        // Undefined
        if (UNDEFINED_PATTERN.test(raw)) {
            return "undefined detected (use null instead)";
        }

        return null;
    }

    /**
     * Update statistics display for the current JSON
     * Skips expensive JSON.parse() traversal for files above STATS_PARSE_THRESHOLD
     * @param {string} jsonStr - JSON string to analyze
     */
    function updateStats(jsonStr) {
        if (!jsonStr) {
            resetStats();
            return;
        }
        const size = new Blob([jsonStr]).size;
        if (stats.size) stats.size.textContent = formatBytes(size);

        // Skip expensive parsing for large files to prevent UI lag on keystroke
        if (size > STATS_PARSE_THRESHOLD) {
            if (stats.keys) stats.keys.textContent = '—';
            if (stats.arrays) stats.arrays.textContent = '—';
            if (stats.depth) stats.depth.textContent = '—';
            return;
        }

        try {
            const obj = JSON.parse(jsonStr);
            const metrics = analyzeJSON(obj);
            if (stats.keys) stats.keys.textContent = metrics.keys;
            if (stats.arrays) stats.arrays.textContent = metrics.arrays;
            if (stats.depth) stats.depth.textContent = metrics.depth;
        } catch (e) {
            // Show visual indicator for invalid JSON
            if (stats.keys) stats.keys.textContent = '—';
            if (stats.arrays) stats.arrays.textContent = '—';
            if (stats.depth) stats.depth.textContent = '—';
        }
    }

    /**
     * Analyze JSON structure and count keys, arrays, and depth
     * @param {*} obj - Parsed JSON object
     * @returns {{keys: number, arrays: number, depth: number}}
     */
    function analyzeJSON(obj) {
        let keys = 0;
        let arrays = 0;
        let maxDepth = 0;

        function traverse(o, depth) {
            if (depth > maxDepth) maxDepth = depth;
            if (Array.isArray(o)) {
                arrays++;
                o.forEach(item => traverse(item, depth + 1));
            } else if (typeof o === 'object' && o !== null) {
                keys += Object.keys(o).length;
                Object.values(o).forEach(val => traverse(val, depth + 1));
            }
        }

        // Start at depth 0 (root level), so depth measures nesting levels
        // e.g., flat JSON = depth 0, {"a":{"b":1}} = depth 1
        traverse(obj, 0);
        return { keys, arrays, depth: maxDepth };
    }

    /**
     * Format byte count to human-readable string
     * @param {number} bytes - Number of bytes
     * @returns {string} Formatted string (e.g., "1.5 KB")
     */
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Reset statistics display to zeros
     */
    function resetStats() {
        if (stats.size) stats.size.textContent = '0 B';
        if (stats.keys) stats.keys.textContent = '0';
        if (stats.arrays) stats.arrays.textContent = '0';
        if (stats.depth) stats.depth.textContent = '0';
    }

    /**
     * Apply syntax highlighting to JSON string using safe DOM manipulation
     * Creates span elements for each token instead of innerHTML to prevent XSS.
     * Falls back to plain text if token count exceeds SYNTAX_HIGHLIGHT_MAX_TOKENS
     * to prevent memory issues on large files.
     * @param {string} json - Valid JSON string
     * @returns {DocumentFragment|Text} Document fragment with syntax highlighting,
     *                                     or plain Text node if token limit exceeded
     */
    function syntaxHighlight(json) {
        const fragment = document.createDocumentFragment();
        let lastIndex = 0;
        let match;
        let tokenCount = 0;

        // Reset regex for new search
        SYNTAX_HIGHLIGHT_PATTERN.lastIndex = 0;

        // Process tokens using safe DOM methods
        while ((match = SYNTAX_HIGHLIGHT_PATTERN.exec(json)) !== null) {
            tokenCount++;

            // Abort highlighting if token limit exceeded - return plain text instead
            if (tokenCount > SYNTAX_HIGHLIGHT_MAX_TOKENS) {
                return document.createTextNode(json);
            }

            // Add any text before the match as plain text node
            if (match.index > lastIndex) {
                const textBefore = json.substring(lastIndex, match.index);
                fragment.appendChild(document.createTextNode(textBefore));
            }

            // Determine token class and create span element safely
            const token = match[0];
            const span = document.createElement('span');
            let cls = 'number';

            if (/^"/.test(token)) {
                cls = /:$/.test(token) ? 'key' : 'string';
            } else if (/true|false/.test(token)) {
                cls = 'boolean';
            } else if (/null/.test(token)) {
                cls = 'null';
            }

            span.className = cls;
            span.textContent = token;
            fragment.appendChild(span);

            lastIndex = SYNTAX_HIGHLIGHT_PATTERN.lastIndex;
        }

        // Add any remaining text after the last match
        if (lastIndex < json.length) {
            fragment.appendChild(document.createTextNode(json.substring(lastIndex)));
        }

        return fragment;
    }

    // Run initialization
    initAriaAttributes();

    // Real-time stat update with debounce
    inputArea.addEventListener('input', () => {
        clearTimeout(timeout);
        // Clear stored result when user types, to avoid copying stale data
        lastFormattedJSON = '';
        timeout = setTimeout(() => {
            const content = inputArea.value;
            // Check file size and show warnings (preserves warning if active)
            checkFileSize(content);
            updateStats(content);
        }, 250);
    });

    // Set up event listeners with null checks
    const formatBtn = document.getElementById('formatBtn');
    const minifyBtn = document.getElementById('minifyBtn');
    const copyBtn = document.getElementById('copyBtn');
    const clearBtn = document.getElementById('clearBtn');
    const loadSampleBtn = document.getElementById('loadSampleBtn');

    if (formatBtn) formatBtn.addEventListener('click', formatJSON);
    if (minifyBtn) minifyBtn.addEventListener('click', minifyJSON);
    if (copyBtn) copyBtn.addEventListener('click', copyResult);
    if (clearBtn) clearBtn.addEventListener('click', clearEditor);
    if (loadSampleBtn) loadSampleBtn.addEventListener('click', loadSample);
    if (editBtn) editBtn.addEventListener('click', editMode);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTool);
} else {
    // DOM is already ready
    initTool();
}
