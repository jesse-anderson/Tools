/* ============================================
   REGEX TESTER - Main Entry Point
   ============================================ */

import * as constants from './constants.js';
import * as modules from './modules.js';

// ============================================
// DOM Elements
// ============================================

const regexInput = document.getElementById('regexInput');
const flagsInput = document.getElementById('flagsInput');
const testString = document.getElementById('testString');
const highlightOutput = document.getElementById('highlightOutput');
const groupsOutput = document.getElementById('groupsOutput');

const errorBanner = document.getElementById('errorBanner');
const errorText = document.getElementById('errorText');
const loadingBanner = document.getElementById('loadingBanner');
const warningBanner = document.getElementById('warningBanner');
const warningText = document.getElementById('warningText');
const matchCount = document.getElementById('matchCount');
const regexGroup = document.getElementById('regexGroup');
const btnJS = document.getElementById('btnJS');
const btnPY = document.getElementById('btnPY');
const copyRegexBtn = document.getElementById('copyRegexBtn');
const copyMatchesBtn = document.getElementById('copyMatchesBtn');

// DOM object for passing to module functions
const dom = {
    regexInput,
    flagsInput,
    testString,
    highlightOutput,
    groupsOutput,
    errorBanner,
    errorText,
    loadingBanner,
    warningBanner,
    warningText,
    matchCount,
    regexGroup,
    btnJS,
    btnPY,
    copyRegexBtn,
    copyMatchesBtn
};

// ============================================
// Initialization
// ============================================

/**
 * Initializes the regex tester tool.
 * Sets up event listeners, loads saved state from localStorage, and runs initial test.
 */
function init() {
    // Load saved state from localStorage
    modules.loadSavedState(dom);

    // Event Listeners
    [regexInput, flagsInput, testString].forEach(el => {
        el.addEventListener('input', runTestDebounced);
    });

    // Engine Switcher Events
    if (btnJS) {
        btnJS.addEventListener('click', () => setEngine(constants.ENGINE.JAVASCRIPT));
    }
    if (btnPY) {
        btnPY.addEventListener('click', () => setEngine(constants.ENGINE.PYTHON));
    }

    // Quick Pattern Buttons
    document.querySelectorAll('.pattern-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pattern = e.currentTarget.dataset.pattern;
            const flags = e.currentTarget.dataset.flags || constants.FLAGS.GLOBAL;
            setPattern(pattern, flags);
        });
    });

    // Token Reference Items
    document.querySelectorAll('.cheat-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const token = e.currentTarget.dataset.token;
            if (token) insertToken(token);
        });
    });

    // Licenses Modal
    const viewLicensesBtn = document.getElementById('viewLicensesBtn');
    const closeLicensesBtn = document.getElementById('closeLicensesBtn');
    const licensesModal = document.getElementById('licensesModal');

    if (viewLicensesBtn && licensesModal) {
        viewLicensesBtn.addEventListener('click', () => {
            licensesModal.classList.add(constants.CLASS.ACTIVE);
            closeLicensesBtn?.focus();
        });
    }

    if (closeLicensesBtn && licensesModal) {
        closeLicensesBtn.addEventListener('click', () => {
            licensesModal.classList.remove(constants.CLASS.ACTIVE);
            viewLicensesBtn?.focus();
        });
    }

    if (licensesModal) {
        licensesModal.addEventListener('click', (e) => {
            if (e.target === licensesModal) {
                licensesModal.classList.remove(constants.CLASS.ACTIVE);
                viewLicensesBtn?.focus();
            }
        });
    }

    // Copy Button Events
    if (copyRegexBtn) {
        const copyDropdownMenu = document.getElementById('copyDropdownMenu');

        // Toggle dropdown on main button click
        copyRegexBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isExpanded = copyRegexBtn.getAttribute(constants.ARIA.EXPANDED) === constants.ARIA.TRUE;
            if (isExpanded) {
                modules.closeCopyDropdown(copyDropdownMenu, copyRegexBtn);
            } else {
                modules.openCopyDropdown(copyDropdownMenu, copyRegexBtn);
            }
        });

        // Handle dropdown item clicks
        copyDropdownMenu?.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const lang = item.dataset.lang;
                modules.copyRegexAsCode(lang, dom);
                modules.closeCopyDropdown(copyDropdownMenu, copyRegexBtn);
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.copy-dropdown')) {
                modules.closeCopyDropdown(copyDropdownMenu, copyRegexBtn);
            }
        });
    }

    if (copyMatchesBtn) {
        copyMatchesBtn.addEventListener('click', () => modules.copyMatches(dom));
    }

    // Consolidated Escape key handler for both modal and dropdown
    // Priority: Close modal first, then dropdown
    document.addEventListener('keydown', (e) => {
        if (e.key === constants.KEY.ESCAPE) {
            const licensesModal = document.getElementById('licensesModal');
            const copyDropdownMenu = document.getElementById('copyDropdownMenu');
            const viewLicensesBtn = document.getElementById('viewLicensesBtn');

            // Close licenses modal if open
            if (licensesModal && licensesModal.classList.contains(constants.CLASS.ACTIVE)) {
                licensesModal.classList.remove(constants.CLASS.ACTIVE);
                viewLicensesBtn?.focus();
                return;
            }

            // Close copy dropdown if open
            const copyRegexBtn = document.getElementById('copyRegexBtn');
            if (copyRegexBtn && copyDropdownMenu) {
                const isExpanded = copyRegexBtn.getAttribute(constants.ARIA.EXPANDED) === constants.ARIA.TRUE;
                if (isExpanded) {
                    modules.closeCopyDropdown(copyDropdownMenu, copyRegexBtn);
                    return;
                }
            }
        }
    });

    // Initial Run
    runTest();
}

// ============================================
// Engine Management
// ============================================

/**
 * Sets the current regex engine (JavaScript or Python).
 * Loads Pyodide WASM if Python engine is selected and not yet loaded.
 * @param {string} engine - The engine to use (constants.ENGINE.JAVASCRIPT or constants.ENGINE.PYTHON)
 * @returns {Promise<void>}
 */
async function setEngine(engine) {
    const currentEngine = modules.getCurrentEngine();
    if (engine === currentEngine) return;

    modules.setCurrentEngine(engine);

    // Update visual states
    btnJS.classList.toggle(constants.CLASS.ACTIVE, engine === constants.ENGINE.JAVASCRIPT);
    btnPY.classList.toggle(constants.CLASS.ACTIVE, engine === constants.ENGINE.PYTHON);

    // Update ARIA states for accessibility
    btnJS.setAttribute('aria-selected', engine === constants.ENGINE.JAVASCRIPT ? constants.ARIA.TRUE : constants.ARIA.FALSE);
    btnPY.setAttribute('aria-selected', engine === constants.ENGINE.PYTHON ? constants.ARIA.TRUE : constants.ARIA.FALSE);

    // Clear cache when switching engines
    modules.clearRegexCache();

    // Save engine preference to localStorage
    modules.saveState(dom);

    if (engine === constants.ENGINE.PYTHON) {
        if (!modules.getPyodide() && !modules.getPyodideLoading()) {
            await modules.loadPyodideEnv(dom, runTest);
        } else if (modules.getPyodideLoading()) {
            // Just wait, UI shows loading
        } else {
            runTest();
        }
    } else {
        loadingBanner.style.display = constants.DISPLAY.NONE;
        runTest();
    }
}

// ============================================
// Regex Testing
// ============================================

/**
 * Debounced wrapper around runTest to prevent excessive execution on rapid input.
 * Delays execution by 200ms after the last input event.
 */
function runTestDebounced() {
    clearTimeout(modules.getDebounceTimer());
    modules.setDebounceTimer(setTimeout(runTest, 200));
}

/**
 * Runs the regex test against the current pattern, flags, and test string.
 * Uses either JavaScript native RegExp or Python re module via Pyodide.
 * Renders matches, capture groups, and handles errors.
 * @returns {Promise<void>}
 */
async function runTest() {
    // Clear UI
    errorBanner.style.display = constants.DISPLAY.NONE;
    warningBanner.style.display = constants.DISPLAY.NONE;
    regexGroup.style.borderColor = 'var(--border-color)';

    const pattern = regexInput.value;
    const flags = flagsInput.value;
    const text = testString.value;

    // Check text length limit
    if (text.length > constants.MAX_TEXT_LENGTH) {
        warningText.textContent = `Test string exceeds ${constants.MAX_TEXT_LENGTH.toLocaleString()} characters. Only the first ${constants.MAX_TEXT_LENGTH.toLocaleString()} will be processed.`;
        warningBanner.style.display = constants.DISPLAY.FLEX;
    }

    // Validate flags
    const currentEngine = modules.getCurrentEngine();
    const validationResult = modules.validateFlags(flags, currentEngine);
    if (validationResult.warning) {
        warningText.textContent = validationResult.warning;
        warningBanner.style.display = constants.DISPLAY.FLEX;
    }

    if (!pattern) {
        modules.renderNoMatch(text, highlightOutput);
        matchCount.textContent = `0 ${constants.LABEL.MATCHES}`;
        modules.renderGroups([], groupsOutput);
        modules.setCurrentMatches([]);
        return;
    }

    let matches = [];

    try {
        if (currentEngine === constants.ENGINE.JAVASCRIPT) {
            matches = modules.runJsRegex(pattern, flags, text);
        } else {
            const pyodide = modules.getPyodide();
            if (pyodide) {
                matches = await modules.runPyRegex(pattern, flags, text);
            } else {
                return; // waiting for pyodide
            }
        }

        modules.renderMatches(text, matches, highlightOutput);
        const truncated = matches.length > constants.MAX_MATCHES;
        matchCount.textContent = truncated
            ? `${matches.length.toLocaleString()} ${constants.LABEL.MATCHES} (showing ${constants.MAX_MATCHES.toLocaleString()})`
            : `${matches.length} ${constants.LABEL.MATCH}${matches.length !== 1 ? 'es' : ''}`;
        modules.renderGroups(matches.slice(0, constants.MAX_MATCHES), groupsOutput);

        // Store matches for copying
        modules.setCurrentMatches(matches);

        // Save state to localStorage
        modules.saveState(dom);

    } catch (e) {
        // Show Error
        let msg = e.message;
        if (currentEngine === constants.ENGINE.PYTHON) {
            msg = modules.parsePythonError(msg);
        } else {
            // JavaScript error handling
            msg = modules.parseJavaScriptError(msg);
        }

        errorText.textContent = msg;
        errorBanner.style.display = constants.DISPLAY.FLEX;
        regexGroup.style.borderColor = '#ef4444';
        modules.renderNoMatch(text, highlightOutput);
        matchCount.textContent = constants.LABEL.ERROR;
        modules.renderGroups([], groupsOutput);
        modules.setCurrentMatches([]);
    }
}

// ============================================
// Helper Actions
// ============================================

/**
 * Sets a new pattern and flags, then runs the test.
 * Used by quick pattern buttons.
 * @param {string} pat - The regex pattern to set
 * @param {string} flags - The flags to set
 */
function setPattern(pat, flags) {
    regexInput.value = pat;
    flagsInput.value = flags;
    runTest();
}

/**
 * Inserts a regex token at the cursor position in the pattern input.
 * Used by token reference cheat sheet buttons.
 * @param {string} token - The token to insert (e.g., '\d', '\w', '(?:...)')
 */
function insertToken(token) {
    const start = regexInput.selectionStart;
    const end = regexInput.selectionEnd;
    const text = regexInput.value;

    regexInput.value = text.substring(0, start) + token + text.substring(end);
    regexInput.selectionStart = regexInput.selectionEnd = start + token.length;
    regexInput.focus();
    runTest();
}

// ============================================
// Initialize when DOM is ready
// ============================================

document.addEventListener('DOMContentLoaded', init);
