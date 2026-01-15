/* ============================================
   REGEX TESTER - Modules
   ============================================ */

import * as constants from './constants.js';

// ============================================
// State Management
// ============================================

let currentEngine = constants.ENGINE.JAVASCRIPT;
let pyodide = null;
let pyodideLoading = false;
let debounceTimer;
let currentMatches = []; // Store current matches for copying

// Regex compilation cache
let cachedJsPattern = null;
let cachedJsFlags = null;
let cachedJsRegex = null;
let cachedPyPattern = null;
let cachedPyFlags = null;
let cachedPyRegexKey = null;

// State getters/setters
export function getCurrentEngine() { return currentEngine; }
export function setCurrentEngine(value) { currentEngine = value; }
export function getPyodide() { return pyodide; }
export function setPyodide(value) { pyodide = value; }
export function getPyodideLoading() { return pyodideLoading; }
export function setPyodideLoading(value) { pyodideLoading = value; }
export function getCurrentMatches() { return currentMatches; }
export function setCurrentMatches(value) { currentMatches = value; }
export function getDebounceTimer() { return debounceTimer; }
export function setDebounceTimer(value) { debounceTimer = value; }

// ============================================
// Engine Management
// ============================================

/**
 * Clears the regex compilation cache for both JavaScript and Python engines.
 * Called when switching engines to ensure fresh compilation.
 */
export function clearRegexCache() {
    cachedJsPattern = null;
    cachedJsFlags = null;
    cachedJsRegex = null;
    cachedPyPattern = null;
    cachedPyFlags = null;
    cachedPyRegexKey = null;
}

/**
 * Loads the Pyodide WebAssembly Python runtime.
 * Downloads ~10MB of data and initializes the Python regex engine.
 * @param {Object} dom - DOM elements object
 * @param {Function} runTest - Function to run after loading
 * @returns {Promise<void>}
 */
export async function loadPyodideEnv(dom, runTest) {
    const { loadingBanner, btnPY } = dom;

    pyodideLoading = true;
    loadingBanner.style.display = constants.DISPLAY.FLEX;
    btnPY.classList.add(constants.CLASS.LOADING);

    try {
        pyodide = await loadPyodide();
        // We don't strictly need micropip for standard 're', it's builtin
        // But let's run a warmup
        await pyodide.runPythonAsync(`
            import re
            print("Python Regex Engine Ready")
        `);

        pyodideLoading = false;
        loadingBanner.style.display = constants.DISPLAY.NONE;
        btnPY.classList.remove(constants.CLASS.LOADING);
        runTest(); // Run immediately after load
    } catch (err) {
        console.error(err);
        pyodideLoading = false;
        loadingBanner.className = 'status-banner banner-error';
        loadingBanner.style.display = constants.DISPLAY.FLEX;
        document.getElementById('loadingText').textContent = constants.ERROR_MSG.PYODIDE_LOAD_FAILED;
    }
}

// ============================================
// Error Parsing
// ============================================

/**
 * Parses Python regex error messages from Pyodide traceback output.
 * Extracts the meaningful error message and formats it for display.
 * @param {string} errorMessage - The full error message/traceback from Pyodide
 * @returns {string} A cleaned, user-friendly error message
 */
export function parsePythonError(errorMessage) {
    // Python traceback format from Pyodide
    // Example:
    // Traceback (most recent call last):
    //   File "/lib/python3.11/site-packages/pyodide/_base.py", line 469, in eval_code
    //     .run()
    //   File "<exec>", line 6, in <module>
    // re.error: missing ), unterminated subpattern at position 15

    const lines = errorMessage.split('\n').filter(l => l.trim());

    // Find the line that contains the actual error (starts with "re.error:", "ValueError:", "TypeError:", etc.)
    const errorLine = lines.find(l =>
        l.includes('re.error:') ||
        l.includes('ValueError:') ||
        l.includes('TypeError:') ||
        l.includes('SyntaxError:') ||
        l.includes('IndexError:')
    );

    if (!errorLine) {
        // Fallback: return last meaningful line
        return lines[lines.length - 1] || errorMessage;
    }

    // Parse the error line
    let parsedMessage = errorLine.trim();

    // Clean up common Python error messages
    parsedMessage = parsedMessage
        // Remove file paths and line numbers from traceback
        .replace(/File ".*?", line \d+, in .*/g, '')
        // Remove "Traceback" line
        .replace(/Traceback \(most recent call last\):/g, '')
        // Clean up extra whitespace
        .replace(/\s+/g, ' ')
        .trim();

    // Improve specific error messages
    if (parsedMessage.includes('re.error:')) {
        parsedMessage = enhancePythonRegexError(parsedMessage);
    }

    // Remove "Python" prefix if present (redundant since we show engine)
    parsedMessage = parsedMessage.replace(/^Python:\s*/, '');

    return parsedMessage;
}

/**
 * Enhances Python regex error messages with more user-friendly descriptions.
 * Transforms technical error messages into clearer explanations.
 * @param {string} errorMessage - The error message from Python's re module
 * @returns {string} An enhanced, user-friendly error message
 */
function enhancePythonRegexError(errorMessage) {
    // Enhance common Python regex errors with more helpful messages

    // Position-based errors
    const positionMatch = errorMessage.match(/re\.error: (.+?) at position (\d+)/);
    if (positionMatch) {
        const [_, desc, pos] = positionMatch;
        const position = parseInt(pos, 10);

        // Make descriptions more user-friendly
        const friendlyDesc = desc
            .replace('unterminated subpattern', 'Missing closing parenthesis )')
            .replace('unterminated character set', 'Missing closing bracket ]')
            .replace('bad escape', 'Invalid escape sequence')
            .replace('nothing to repeat', 'Cannot repeat nothing (check for *, +, or ? after nothing)')
            .replace('multiple repeat', 'Multiple repeat operators (e.g., ** or ++)');

        return `${friendlyDesc} at position ${position}`;
    }

    // Other common errors
    return errorMessage
        .replace('re.error: missing ), unterminated subpattern', 'Missing closing parenthesis )')
        .replace('re.error: missing ], unterminated character set', 'Missing closing bracket ]')
        .replace('re.error: bad escape (\\w) at end of pattern', 'Invalid escape sequence at end of pattern')
        .replace('re.error: nothing to repeat', 'Cannot repeat nothing (check your *, +, or ?)')
        .replace('re.error: multiple repeat', 'Multiple repeat operators (e.g., ** or ++ not allowed)')
        .replace('re.error: unterminated character set', 'Missing closing bracket ]')
        .replace('re.error: unexpected end of pattern', 'Unexpected end of pattern (incomplete expression)')
        .replace(/^re\.error:\s*/, '');
}

/**
 * Parses JavaScript regex error messages from the RegExp constructor.
 * Removes boilerplate text and enhances error descriptions.
 * @param {string} errorMessage - The error message from JavaScript's RegExp constructor
 * @returns {string} A cleaned, user-friendly error message
 */
export function parseJavaScriptError(errorMessage) {
    // JavaScript regex errors from new RegExp()
    // Examples:
    // "Invalid regular expression: missing )"
    // "Invalid regular expression: /[abc/ : Unterminated character class"

    // Remove the common "Invalid regular expression: " prefix
    let parsed = errorMessage.replace(/^Invalid regular expression:\s*/, '');

    // Enhance common JavaScript regex errors
    parsed = parsed
        .replace('missing )', 'Missing closing parenthesis )')
        .replace('Unterminated character class', 'Missing closing bracket ]')
        .replace('unterminated parenthetical', 'Missing closing parenthesis )')
        .replace('nothing to repeat', 'Cannot repeat nothing (check *, +, or ?)')
        .replace('Invalid group', 'Invalid group syntax')
        .replace('Incomplete regular expression', 'Incomplete expression (unexpected end)')
        .replace('Invalid escape', 'Invalid escape sequence');

    return parsed;
}

// ============================================
// Validation
// ============================================

/**
 * Validates regex flags for the selected engine.
 * Checks for invalid flags and warns about engine-specific flags.
 * @param {string} flags - The flags string to validate
 * @param {string} engine - The current regex engine (constants.ENGINE.JAVASCRIPT or constants.ENGINE.PYTHON)
 * @returns {{warning: string | null}} Object containing warning message if applicable
 */
export function validateFlags(flags, engine) {
    const result = { warning: null };

    // Check for invalid characters
    const invalidChars = flags.split('').filter(f => {
        if (engine === constants.ENGINE.JAVASCRIPT) {
            return !constants.FLAGS.JS_VALID.includes(f);
        } else {
            return !constants.FLAGS.PY_VALID.includes(f);
        }
    });

    if (invalidChars.length > 0) {
        result.warning = `Invalid flag(s): ${invalidChars.join(', ')}`;
        return result;
    }

    // Check for engine-specific flags
    if (engine === constants.ENGINE.JAVASCRIPT) {
        const pyOnlyFlags = flags.split('').filter(f => constants.FLAGS.PY_ONLY.includes(f));
        if (pyOnlyFlags.length > 0) {
            result.warning = `Flags ${pyOnlyFlags.join(', ')} are Python-only and will be ignored in JS mode`;
        }
    } else if (engine === constants.ENGINE.PYTHON) {
        const jsOnlyFlags = flags.split('').filter(f => constants.FLAGS.JS_ONLY.includes(f));
        if (jsOnlyFlags.length > 0) {
            result.warning = `Flags ${jsOnlyFlags.join(', ')} are JavaScript-only and will be ignored in Python mode`;
        }
    }

    return result;
}

// ============================================
// Regex Execution
// ============================================

/**
 * Executes regex matching using JavaScript's native RegExp engine.
 * Supports caching of compiled regex for performance.
 * @param {string} pattern - The regex pattern
 * @param {string} flags - The regex flags
 * @param {string} text - The text to search
 * @returns {Array<{index: number, length: number, text: string, groups: Array<string|null>>}} Array of match objects
 */
export function runJsRegex(pattern, flags, text) {
    // Filter out Python-only flags
    const jsFlags = flags.split('').filter(f => !constants.FLAGS.PY_ONLY.includes(f)).join('');

    // Check cache - recompile only if pattern or flags changed
    if (cachedJsPattern !== pattern || cachedJsFlags !== jsFlags) {
        cachedJsPattern = pattern;
        cachedJsFlags = jsFlags;
        try {
            cachedJsRegex = new RegExp(pattern, jsFlags);
        } catch (e) {
            // Clear cache on error so next attempt tries again
            cachedJsPattern = null;
            cachedJsFlags = null;
            cachedJsRegex = null;
            throw e;
        }
    }

    const regex = cachedJsRegex;
    let matches = [];

    if (jsFlags.includes(constants.FLAGS.GLOBAL)) {
        // Global mode: find all matches
        matches = [...text.matchAll(regex)].map(m => ({
            index: m.index,
            length: m[0].length,
            text: m[0],
            groups: Array.from(m).slice(1) // Capture groups: m[1], m[2], etc.
        }));
    } else {
        // Non-global mode: find only first match
        const m = regex.exec(text);
        if (m) matches = [{
            index: m.index,
            length: m[0].length,
            text: m[0],
            groups: Array.from(m).slice(1)
        }];
    }
    return matches;
}

/**
 * Executes regex matching using Python's re module via Pyodide.
 * Runs Python code in WebAssembly to perform regex operations.
 *
 * Security: User input is JSON-encoded before passing to Python, then decoded
 * using Python's json.loads() which properly handles all special characters,
 * quotes, and escape sequences. This prevents potential injection issues.
 *
 * @param {string} pattern - The regex pattern
 * @param {string} flags - The regex flags
 * @param {string} text - The text to search
 * @returns {Promise<Array<{index: number, length: number, text: string, groups: Array<string|null>>}>> Array of match objects
 */
export async function runPyRegex(pattern, flags, text) {
    // Create a cache key from pattern and flags
    const cacheKey = `${pattern}|${flags}`;

    // JSON-encode user input for safe transmission to Python.
    // Python's json.loads() handles all special characters, quotes, and escape sequences.
    // This prevents potential issues with patterns containing characters that could
    // interfere with Python string parsing.
    const patternJson = JSON.stringify(pattern);
    const flagsJson = JSON.stringify(flags);
    const textJson = JSON.stringify(text);

    // Check cache - recompile only if pattern or flags changed
    if (cachedPyPattern !== pattern || cachedPyFlags !== flags) {
        cachedPyPattern = pattern;
        cachedPyFlags = flags;
        cachedPyRegexKey = cacheKey;

        // Update pattern and flags in Python (JSON-encoded)
        pyodide.globals.set("js_pattern_json", patternJson);
        pyodide.globals.set("js_flags_json", flagsJson);
    }

    // Text always changes, so update it each time
    pyodide.globals.set("js_text_json", textJson);

    // Python Script to execute
    const pyScript = `
import json
import re

# Safely decode JSON-encoded strings (handles all special characters, quotes, escape sequences)
js_pattern = json.loads(js_pattern_json)
js_flags = json.loads(js_flags_json)
js_text = json.loads(js_text_json)

# Map JS flags to Python flags
flag_int = 0
if '${constants.FLAGS.IGNORECASE}' in js_flags: flag_int |= re.IGNORECASE
if '${constants.FLAGS.MULTILINE}' in js_flags: flag_int |= re.MULTILINE
if '${constants.FLAGS.DOTALL}' in js_flags: flag_int |= re.DOTALL
if '${constants.FLAGS.VERBOSE}' in js_flags: flag_int |= re.VERBOSE
if '${constants.FLAGS.ASCII}' in js_flags: flag_int |= re.ASCII

results = []
try:
    # Compile the regex (Python caches internally, but this is explicit)
    compiled = re.compile(js_pattern, flag_int)

    if '${constants.FLAGS.GLOBAL}' in js_flags:
        # Global mode: find all matches (like JavaScript with 'g' flag)
        for match in compiled.finditer(js_text):
            # Capture all groups including undefined ones as None
            groups = []
            for i in range(1, len(match.groups()) + 1):
                try:
                    groups.append(match.group(i))
                except:
                    groups.append(None)
            results.append({
                "index": match.start(),
                "length": match.end() - match.start(),
                "text": match.group(0),
                "groups": groups
            })
    else:
        # Non-global mode: find only first match (like JavaScript without 'g' flag)
        match = compiled.search(js_text)
        if match:
            groups = []
            for i in range(1, len(match.groups()) + 1):
                try:
                    groups.append(match.group(i))
                except:
                    groups.append(None)
            results.append({
                "index": match.start(),
                "length": match.end() - match.start(),
                "text": match.group(0),
                "groups": groups
            })
except Exception as e:
    raise e

results
    `;

    const pyResult = await pyodide.runPythonAsync(pyScript);
    // Convert PyProxy to JS Array
    const jsResult = pyResult.toJs();

    // Properly clean up PyProxy to prevent memory leaks
    pyResult.destroy();

    // Map Map objects to plain objects if necessary (Pyodide returns Maps for dicts)
    // Also clean up each map's PyProxy after extracting data
    const result = jsResult.map(m => {
        const groupsProxy = m.get("groups");
        const groupsArray = groupsProxy ? groupsProxy.toJs() : [];
        if (groupsProxy) groupsProxy.destroy();

        return {
            index: m.get("index"),
            length: m.get("length"),
            text: m.get("text"),
            groups: groupsArray
        };
    });

    return result;
}

// ============================================
// Rendering
// ============================================

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * @param {*} str - The value to escape. Non-string values are converted to strings.
 * @returns {string} The HTML-escaped string, or empty string for null/undefined.
 */
export function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    if (typeof str !== 'string') str = String(str);
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Renders matched text with highlighting in the preview panel.
 * Wraps matched portions in span elements with highlighting class.
 * @param {string} text - The original text being searched
 * @param {Array<{index: number, length: number, text: string, groups: Array<string|null>>}> matches - Array of match objects
 * @param {HTMLElement} highlightOutput - The output element
 */
export function renderMatches(text, matches, highlightOutput) {
    if (matches.length === 0) {
        renderNoMatch(text, highlightOutput);
        return;
    }

    // Limit matches for rendering performance
    const renderMatches = matches.slice(0, constants.MAX_MATCHES);
    const hasMore = matches.length > constants.MAX_MATCHES;

    let html = '';
    let lastIndex = 0;

    renderMatches.forEach(match => {
        const start = match.index;
        const end = start + match.length;

        // 1. Append text before match
        html += escapeHtml(text.slice(lastIndex, start));

        // 2. Append Match
        const matchText = text.slice(start, end);
        html += `<span class="match-mark" title="Match: ${escapeHtml(matchText)}">${escapeHtml(matchText)}</span>`;

        lastIndex = end;
    });

    // Add warning if matches were truncated
    if (hasMore) {
        const truncatedCount = matches.length - constants.MAX_MATCHES;
        html += `<span style="background: rgba(245, 158, 11, 0.2); border-bottom: 2px solid #f59e0b; padding: 2px 4px; border-radius: 2px; color: var(--text-secondary); font-size: 0.75rem;">… ${truncatedCount.toLocaleString()} more matches hidden (showing max ${constants.MAX_MATCHES.toLocaleString()})</span>`;
    }

    // 3. Append remaining text
    html += escapeHtml(text.slice(lastIndex));

    highlightOutput.innerHTML = html;
}

/**
 * Renders the original text without any match highlighting.
 * Used when no matches are found or when there's an error.
 * @param {string} text - The text to display
 * @param {HTMLElement} highlightOutput - The output element
 */
export function renderNoMatch(text, highlightOutput) {
    highlightOutput.innerHTML = escapeHtml(text);
}

/**
 * Renders capture groups from matches in the groups panel.
 * Shows each match with its associated capture groups.
 * @param {Array<{index: number, length: number, text: string, groups: Array<string|null>>}> matches - Array of match objects
 * @param {HTMLElement} groupsOutput - The groups output element
 */
export function renderGroups(matches, groupsOutput) {
    if (!groupsOutput) return;

    // Filter matches that have capture groups
    const matchesWithGroups = matches.filter(m => m.groups && m.groups.length > 0);

    if (matchesWithGroups.length === 0) {
        groupsOutput.innerHTML = '<span class="groups-empty">No capture groups in matches</span>';
        return;
    }

    // Find max number of groups across all matches
    const maxGroups = Math.max(...matchesWithGroups.map(m => m.groups.length));

    let html = '<div class="groups-list">';

    matchesWithGroups.forEach((match, matchIdx) => {
        const hasGroups = match.groups.some(g => g !== undefined && g !== null);
        if (!hasGroups) return;

        html += `
            <div class="groups-entry">
                <div class="groups-header">
                    <span class="groups-match-title">Match ${matchIdx + 1}</span>
                    <span class="groups-match-text">${escapeHtml(match.text)}</span>
                </div>
                <div class="groups-items">
        `;

        match.groups.forEach((group, groupIdx) => {
            if (group !== undefined && group !== null) {
                html += `
                    <div class="group-item">
                        <span class="group-number">$${groupIdx + 1}</span>
                        <span class="group-value">${escapeHtml(group)}</span>
                    </div>
                `;
            }
        });

        html += `
                </div>
            </div>
        `;
    });

    html += '</div>';
    groupsOutput.innerHTML = html;
}

// ============================================
// Copy Functions
// ============================================

/**
 * Opens the copy dropdown menu.
 * @param {HTMLElement} copyDropdownMenu - The dropdown menu element
 * @param {HTMLElement} copyRegexBtn - The copy button element
 */
export function openCopyDropdown(copyDropdownMenu, copyRegexBtn) {
    if (copyDropdownMenu && copyRegexBtn) {
        copyDropdownMenu.classList.add(constants.CLASS.ACTIVE);
        copyRegexBtn.setAttribute(constants.ARIA.EXPANDED, constants.ARIA.TRUE);
    }
}

/**
 * Closes the copy dropdown menu.
 * @param {HTMLElement} copyDropdownMenu - The dropdown menu element
 * @param {HTMLElement} copyRegexBtn - The copy button element
 */
export function closeCopyDropdown(copyDropdownMenu, copyRegexBtn) {
    if (copyDropdownMenu && copyRegexBtn) {
        copyDropdownMenu.classList.remove(constants.CLASS.ACTIVE);
        copyRegexBtn.setAttribute(constants.ARIA.EXPANDED, constants.ARIA.FALSE);
    }
}

/**
 * Copies the regex pattern as a code snippet in the specified format.
 * @param {string} lang - The format/language to copy as (constants.COPY_FORMAT.PATTERN, constants.COPY_FORMAT.JAVASCRIPT, constants.COPY_FORMAT.PYTHON)
 * @param {Object} dom - DOM elements object containing regexInput, flagsInput, copyRegexBtn
 * @returns {Promise<void>}
 */
export async function copyRegexAsCode(lang, dom) {
    const { regexInput, flagsInput, copyRegexBtn } = dom;
    const pattern = regexInput.value;
    const flags = flagsInput.value;

    if (!pattern) {
        showCopyFeedback(copyRegexBtn, constants.ERROR_MSG.NO_PATTERN);
        return;
    }

    let codeSnippet = '';

    switch (lang) {
        case constants.COPY_FORMAT.PATTERN:
            // Simple /pattern/flags format
            codeSnippet = `/${pattern}/${flags}`;
            break;
        case constants.COPY_FORMAT.JAVASCRIPT:
            // JavaScript code snippet
            codeSnippet = generateJavaScriptSnippet(pattern, flags);
            break;
        case constants.COPY_FORMAT.PYTHON:
            // Python code snippet
            codeSnippet = generatePythonSnippet(pattern, flags);
            break;
    }

    try {
        await navigator.clipboard.writeText(codeSnippet);
        showCopyFeedback(copyRegexBtn, 'Copied!');
    } catch (err) {
        fallbackCopyToClipboard(codeSnippet, copyRegexBtn);
    }
}

/**
 * Generates a JavaScript code snippet for the regex.
 * @param {string} pattern - The regex pattern
 * @param {string} flags - The regex flags
 * @returns {string} JavaScript code snippet
 */
function generateJavaScriptSnippet(pattern, flags) {
    // Escape backslashes for JavaScript string
    const escapedPattern = pattern.replace(/\\/g, '\\\\');
    const hasFlags = flags.length > 0;

    if (hasFlags) {
        return `const regex = /${pattern}/${flags};

// Test against a string
const text = "your text here";
const matches = text.match(regex);

// Or with matchAll for global regex
if (regex.global) {
    const allMatches = [...text.matchAll(regex)];
    for (const match of allMatches) {
        console.log(match[0]); // Full match
        console.log(match[1]); // First capture group
    }
} else {
    const match = regex.exec(text);
    if (match) {
        console.log(match[0]); // Full match
    }
}`;
    } else {
        return `const regex = /${pattern}/;

// Test against a string
const text = "your text here";
const match = regex.exec(text);
if (match) {
    console.log(match[0]); // Full match
}`;
    }
}

/**
 * Generates a Python code snippet for the regex.
 * @param {string} pattern - The regex pattern
 * @param {string} flags - The regex flags
 * @returns {string} Python code snippet
 */
function generatePythonSnippet(pattern, flags) {
    // Build Python flags string
    const pyFlags = [];
    if (flags.includes(constants.FLAGS.IGNORECASE)) pyFlags.push('re.IGNORECASE');
    if (flags.includes(constants.FLAGS.MULTILINE)) pyFlags.push('re.MULTILINE');
    if (flags.includes(constants.FLAGS.DOTALL)) pyFlags.push('re.DOTALL');
    if (flags.includes(constants.FLAGS.ASCII)) pyFlags.push('re.ASCII');
    if (flags.includes(constants.FLAGS.VERBOSE)) pyFlags.push('re.VERBOSE');

    const flagsParam = pyFlags.length > 0 ? ` | `.join(pyFlags) : '0';
    const hasGlobal = flags.includes(constants.FLAGS.GLOBAL);

    return `import re

pattern = r"${pattern.replace(/"/g, '\\"')}"
regex = re.compile(pattern, ${flagsParam})

text = "your text here"${hasGlobal ? '

# Find all matches
for match in regex.finditer(text):
    print(match.group(0))  # Full match
    if match.groups():
        print(match.groups())  # Capture groups' else : '

# Find first match
match = regex.search(text)
if match:
    print(match.group(0))  # Full match
    if match.groups():
        print(match.groups())  # Capture groups
'}
`;
}

/**
 * Copies all matched text to the clipboard.
 * Each match is joined by a newline character.
 * @param {Object} dom - DOM elements object containing copyMatchesBtn
 * @returns {Promise<void>}
 */
export async function copyMatches(dom) {
    const { copyMatchesBtn } = dom;

    if (!currentMatches || currentMatches.length === 0) {
        showCopyFeedback(copyMatchesBtn, constants.ERROR_MSG.NO_MATCHES);
        return;
    }

    // Join all matched text with newlines
    const matchesText = currentMatches.map(m => m.text).join('\n');

    try {
        await navigator.clipboard.writeText(matchesText);
        showCopyFeedback(copyMatchesBtn, 'Copied!');
    } catch (err) {
        // Fallback for older browsers
        fallbackCopyToClipboard(matchesText, copyMatchesBtn);
    }
}

/**
 * Shows visual feedback on a button after a copy operation.
 * Temporarily changes the button appearance to indicate success/failure.
 * @param {HTMLElement} button - The button element to show feedback on
 * @param {string} message - The message to display
 */
function showCopyFeedback(button, message) {
    if (!button) return;

    const originalHTML = button.innerHTML;

    // Show feedback
    button.classList.add('copied');

    // For link button, show text feedback
    if (button.classList.contains('copy-link-btn')) {
        button.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
            ${message}
        `;
    }

    // Reset after 1.5 seconds
    setTimeout(() => {
        button.classList.remove('copied');
        if (button.classList.contains('copy-link-btn')) {
            button.innerHTML = originalHTML;
        }
    }, 1500);
}

/**
 * Fallback copy method using the deprecated execCommand API.
 * Used when the modern Clipboard API is unavailable.
 * @param {string} text - The text to copy
 * @param {HTMLElement} button - The button element to show feedback on
 */
function fallbackCopyToClipboard(text, button) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();

    try {
        document.execCommand('copy');
        showCopyFeedback(button, 'Copied!');
    } catch (err) {
        console.error('Failed to copy', err);
        showCopyFeedback(button, 'Failed');
    }

    document.body.removeChild(textarea);
}

// ============================================
// LocalStorage Persistence
// ============================================

/**
 * Saves the current tool state to localStorage.
 * Includes pattern, flags, test string, and engine preference.
 * @param {Object} dom - DOM elements object containing regexInput, flagsInput, testString
 */
export function saveState(dom) {
    const { regexInput, flagsInput, testString } = dom;

    const state = {
        pattern: regexInput?.value || '',
        flags: flagsInput?.value || '',
        testString: testString?.value || '',
        engine: currentEngine
    };

    try {
        localStorage.setItem(constants.STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        // Silently fail if localStorage is unavailable (e.g., private browsing)
        console.debug('Could not save state to localStorage:', e);
    }
}

/**
 * Loads the previously saved tool state from localStorage.
 * Restores pattern, flags, test string, and engine preference.
 * @param {Object} dom - DOM elements object containing regexInput, flagsInput, testString, btnJS, btnPY
 */
export function loadSavedState(dom) {
    const { regexInput, flagsInput, testString, btnJS, btnPY } = dom;

    try {
        const saved = localStorage.getItem(constants.STORAGE_KEY);
        if (!saved) return;

        const state = JSON.parse(saved);

        // Restore pattern
        if (state.pattern && regexInput) {
            regexInput.value = state.pattern;
        }

        // Restore flags
        if (state.flags && flagsInput) {
            flagsInput.value = state.flags;
        }

        // Restore test string (only if user hasn't typed anything)
        if (state.testString && testString && !testString.value) {
            testString.value = state.testString;
        }

        // Restore engine preference (default to JS if invalid)
        if (state.engine === constants.ENGINE.JAVASCRIPT || state.engine === constants.ENGINE.PYTHON) {
            // Update state and UI without running test yet
            currentEngine = state.engine;
            btnJS.classList.toggle(constants.CLASS.ACTIVE, state.engine === constants.ENGINE.JAVASCRIPT);
            btnPY.classList.toggle(constants.CLASS.ACTIVE, state.engine === constants.ENGINE.PYTHON);
            btnJS.setAttribute('aria-selected', state.engine === constants.ENGINE.JAVASCRIPT ? constants.ARIA.TRUE : constants.ARIA.FALSE);
            btnPY.setAttribute('aria-selected', state.engine === constants.ENGINE.PYTHON ? constants.ARIA.TRUE : constants.ARIA.FALSE);
        }

    } catch (e) {
        console.debug('Could not load state from localStorage:', e);
    }
}
