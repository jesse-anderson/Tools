// ============================================
// Ohm's Law Calculator
// ============================================

(function() {
'use strict';

// Sentinels for non-numeric results. Symbols (rather than NaN or strings)
// keep error states impossible to confuse with real values; the flip side is
// that arithmetic on them throws, so isUsableValue must gate every value
// before it reaches a formula.
const INFINITY = Symbol('Infinity');
const INVALID = Symbol('Invalid');

const PARAMS = ['voltage', 'current', 'resistance', 'power'];

const state = {
    voltage: null,
    current: null,
    resistance: null,
    power: null,
    locked: new Set(),
    lastEdited: []
};

// Track which parameters were directly entered by user (vs calculated)
const userEntered = new Set();

// One debounce timer per parameter: a single shared timer let a quick edit
// in a second field cancel the first field's pending commit, leaving its
// on-screen value invisible to the calculation.
const debounceTimers = {};
const DEBOUNCE_DELAY = 300; // ms

let elements = null;

// ============================================
// State Management
// ============================================

/**
 * Get a value from state (single source of truth)
 * @param {string} param - Parameter name ('voltage', 'current', etc.)
 * @returns {number|null|Symbol} Value in base units
 */
function getStateValue(param) {
    return state[param];
}

/**
 * A value can anchor a calculation only if it is a finite number. null
 * (cleared field) and the INFINITY/INVALID sentinels must never reach
 * arithmetic: number-with-Symbol operations throw, and null coerces to 0.
 * @param {*} value - Candidate value
 * @returns {boolean}
 */
function isUsableValue(value) {
    return typeof value === 'number' && isFinite(value);
}

/**
 * Update state and sync UI for a parameter
 * @param {string} param - Parameter name
 * @param {number|null|Symbol} value - Value in base units
 * @param {Object} options - Sync options
 * @param {boolean} options.isUserEntered - True if value was entered by user
 * @param {boolean} options.skipValueRewrite - True to leave the input text untouched
 */
function setStateValue(param, value, options = {}) {
    state[param] = value;
    if (options.isUserEntered) {
        userEntered.add(param);
    }
    syncUI(param, {
        isUserEntered: userEntered.has(param),
        skipValueRewrite: options.skipValueRewrite
    });
}

/**
 * Read raw input value from DOM (in base units)
 * @param {string} param - Parameter name
 * @returns {number|null} Value in base units
 */
function readDOMValue(param) {
    const input = elements[param];
    const unit = elements[param + 'Unit'];
    const rawValue = parseFloat(input.value);
    if (isNaN(rawValue)) return null;
    return rawValue * parseFloat(unit.value);
}

/**
 * Update DOM to reflect state for a parameter
 * @param {string} param - Parameter name
 * @param {Object} options - Sync options
 * @param {boolean} options.isUserEntered - True if value was entered by user (respect unit choice)
 * @param {boolean} options.skipValueRewrite - True to leave the input text untouched
 */
function syncUI(param, options = {}) {
    const value = state[param];
    const card = document.querySelector(`[data-param="${param}"]`);
    const input = elements[param];
    const isUserEntered = options.isUserEntered || false;

    // Handle special values
    if (value === INFINITY) {
        input.value = '';
        input.placeholder = '∞ (infinite)';
        card.classList.add('error');
        return;
    }
    if (value === INVALID) {
        input.value = '';
        input.placeholder = 'Invalid';
        card.classList.add('error');
        return;
    }

    // Clear error state for normal values
    input.placeholder = '0';
    card.classList.remove('error');

    if (value === null || !isFinite(value)) {
        if (!options.skipValueRewrite) {
            input.value = '';
        }
        return;
    }

    // While the user is typing in this field only the state updates;
    // rewriting the input here would round their text mid-edit.
    if (options.skipValueRewrite) {
        return;
    }

    // Auto-scale: Find the best unit for this value
    const unitSelect = elements[param + 'Unit'];
    const currentScale = parseFloat(unitSelect.value);
    const unitOptions = Array.from(unitSelect.options);
    unitOptions.sort((a, b) => parseFloat(a.value) - parseFloat(b.value));

    const absValue = Math.abs(value);
    const currentOption = unitOptions.find(o => parseFloat(o.value) === currentScale);
    let bestOption = unitOptions.find(o => o.value === "1") || unitOptions[0];

    if (absValue > 0) {
        // Smart auto-scaling logic
        if (isUserEntered) {
            // For user-entered values: be conservative. Only change unit if
            // the value is >= 1000x or <= 0.001x the current unit, and when
            // no other unit fits, keep the user's unit (falling back to the
            // base unit here used to turn 1500 μV into "0.0015 V").
            const valueInCurrentUnit = value / currentScale;

            if (valueInCurrentUnit >= 1000) {
                // Find next larger unit (e.g., V -> kV)
                let candidate = null;
                for (const opt of unitOptions) {
                    const optVal = parseFloat(opt.value);
                    if (optVal > currentScale && absValue >= optVal * 100) {
                        candidate = opt;
                    }
                }
                bestOption = candidate || currentOption || bestOption;
            } else if (valueInCurrentUnit <= 0.001 && valueInCurrentUnit !== 0) {
                // Find smaller unit (e.g., V -> mV) if very small
                let candidate = null;
                for (let i = unitOptions.length - 1; i >= 0; i--) {
                    const optVal = parseFloat(unitOptions[i].value);
                    if (optVal < currentScale && absValue >= optVal) {
                        candidate = unitOptions[i];
                    }
                }
                bestOption = candidate || currentOption || bestOption;
            } else {
                // Keep current unit - user knows what they want
                bestOption = currentOption || bestOption;
            }
        } else {
            // For calculated values: auto-scale for readability using the
            // largest unit where the value is >= 1
            for (const opt of unitOptions) {
                if (absValue >= parseFloat(opt.value)) {
                    bestOption = opt;
                }
            }
        }
    }

    unitSelect.value = bestOption.value;
    const scaleFactor = parseFloat(bestOption.value);
    const displayNum = value / scaleFactor;
    elements[param].value = parseFloat(displayNum.toPrecision(6));
}

// ============================================
// Calculations
// ============================================

/**
 * Calculate remaining values from two known parameters.
 * Division edge cases: nonzero/0 diverges (INFINITY, open/short circuit),
 * 0/0 is indeterminate and contradictory inputs (e.g. P != 0 with V = 0)
 * are unsolvable, so both report INVALID.
 * @param {string} param1 - First known parameter name
 * @param {number} val1 - First value in base units
 * @param {string} param2 - Second known parameter name
 * @param {number} val2 - Second value in base units
 * @returns {Object} All four parameters (numbers or sentinels)
 */
function calculateFromTwo(param1, val1, param2, val2) {
    const result = { voltage: null, current: null, resistance: null, power: null };
    result[param1] = val1;
    result[param2] = val2;

    const pair = [param1, param2].sort().join('-');

    switch (pair) {
        case 'current-voltage': {
            const V = param1 === 'voltage' ? val1 : val2;
            const I = param1 === 'current' ? val1 : val2;
            // R = V / I: open circuit if I = 0 with voltage present
            result.resistance = I === 0 ? (V === 0 ? INVALID : INFINITY) : V / I;
            result.power = V * I;
            break;
        }

        case 'resistance-voltage': {
            const V = param1 === 'voltage' ? val1 : val2;
            const R = param1 === 'resistance' ? val1 : val2;
            // I = V / R and P = V² / R: short circuit if R = 0
            result.current = R === 0 ? (V === 0 ? INVALID : INFINITY) : V / R;
            result.power = R === 0 ? (V === 0 ? INVALID : INFINITY) : (V * V) / R;
            break;
        }

        case 'power-voltage': {
            const V = param1 === 'voltage' ? val1 : val2;
            const P = param1 === 'power' ? val1 : val2;
            if (V === 0) {
                // Zero voltage: nonzero power is contradictory, zero power
                // is indeterminate; I and R are unknowable either way.
                result.current = INVALID;
                result.resistance = INVALID;
            } else {
                result.current = P / V;
                // R = V² / P: open circuit if P = 0
                result.resistance = P === 0 ? INFINITY : (V * V) / P;
            }
            break;
        }

        case 'current-resistance': {
            const I = param1 === 'current' ? val1 : val2;
            const R = param1 === 'resistance' ? val1 : val2;
            result.voltage = I * R;
            result.power = I * I * R;
            break;
        }

        case 'current-power': {
            const I = param1 === 'current' ? val1 : val2;
            const P = param1 === 'power' ? val1 : val2;
            if (I === 0) {
                // Zero current: nonzero power is contradictory, zero power
                // is indeterminate.
                result.voltage = INVALID;
                result.resistance = INVALID;
            } else {
                result.voltage = P / I;
                result.resistance = P / (I * I);
            }
            break;
        }

        case 'power-resistance': {
            const R = param1 === 'resistance' ? val1 : val2;
            const P = param1 === 'power' ? val1 : val2;
            if (P < 0 || R < 0) {
                // V = √(P×R) with a negative product has no real solution;
                // flag it instead of letting sqrt produce a silent NaN.
                result.voltage = INVALID;
                result.current = INVALID;
            } else {
                result.voltage = Math.sqrt(P * R);
                // I = √(P / R): diverges if R = 0 with power present
                result.current = R === 0
                    ? (P === 0 ? INVALID : INFINITY)
                    : Math.sqrt(P / R);
            }
            break;
        }
    }

    return result;
}

function updateFormulaDisplay() {
    const V = state.voltage;
    const I = state.current;
    const R = state.resistance;
    const P = state.power;

    const setRow = (rowId, resultId, active, text) => {
        document.getElementById(resultId).textContent = text;
        document.getElementById(rowId).classList.toggle('active', active);
    };

    // V = I × R
    if (I !== null && I !== INVALID && R !== null && R !== INVALID) {
        const result = (I === INFINITY || R === INFINITY) ? INFINITY : I * R;
        setRow('formula-vir', 'result-vir', true, formatResult(result) + ' V');
    } else {
        setRow('formula-vir', 'result-vir', false, '—');
    }

    // P = I × V
    if (I !== null && I !== INVALID && V !== null && V !== INVALID) {
        const result = (I === INFINITY || V === INFINITY) ? INFINITY : I * V;
        setRow('formula-piv', 'result-piv', true, formatResult(result) + ' W');
    } else {
        setRow('formula-piv', 'result-piv', false, '—');
    }

    // P = I² × R
    if (I !== null && I !== INVALID && R !== null && R !== INVALID) {
        const result = (I === INFINITY || R === INFINITY) ? INFINITY : I * I * R;
        setRow('formula-pi2r', 'result-pi2r', true, formatResult(result) + ' W');
    } else {
        setRow('formula-pi2r', 'result-pi2r', false, '—');
    }

    // P = V² / R
    if (V !== null && V !== INVALID && R !== null && R !== INVALID) {
        const result = (V === INFINITY || R === INFINITY) ? INFINITY
            : R === 0 ? (V === 0 ? INVALID : INFINITY)
            : (V * V) / R;
        setRow('formula-pv2r', 'result-pv2r', true, formatResult(result) + ' W');
    } else {
        setRow('formula-pv2r', 'result-pv2r', false, '—');
    }
}

/**
 * Format a result value for display
 * @param {number|Symbol} value - Value to format
 * @returns {string} Formatted value
 */
function formatResult(value) {
    if (value === INFINITY) return '∞';
    if (value === INVALID) return 'Invalid';
    return formatNumber(value);
}

/**
 * Format a numeric value with SI prefixes
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
function formatNumber(num) {
    if (num === null || !isFinite(num)) return '—';
    if (num === 0) return '0';

    const abs = Math.abs(num);
    if (abs >= 1e9) return (num / 1e9).toPrecision(4) + ' G';
    if (abs >= 1e6) return (num / 1e6).toPrecision(4) + ' M';
    if (abs >= 1e3) return (num / 1e3).toPrecision(4) + ' k';
    if (abs >= 1) return num.toPrecision(6);
    if (abs >= 1e-3) return (num * 1e3).toPrecision(4) + ' m';
    if (abs >= 1e-6) return (num * 1e6).toPrecision(4) + ' μ';
    if (abs >= 1e-9) return (num * 1e9).toPrecision(4) + ' n';
    return num.toExponential(3);
}

// ============================================
// Event Handlers
// ============================================

/**
 * Debounce a recalculation for one parameter
 * @param {string} param - Parameter that changed
 * @param {Object} options - Passed through to performCalculation
 */
function scheduleCalculation(param, options = {}) {
    clearTimeout(debounceTimers[param]);
    debounceTimers[param] = setTimeout(() => {
        delete debounceTimers[param];
        performCalculation(param, options);
    }, DEBOUNCE_DELAY);
}

/**
 * Perform the actual calculation and UI update
 * @param {string} editedParam - Parameter that was edited
 * @param {Object} options
 * @param {boolean} options.skipValueRewrite - Leave the edited input's text alone
 */
function performCalculation(editedParam, options = {}) {
    // Update state from DOM
    const value = readDOMValue(editedParam);
    setStateValue(editedParam, value, {
        isUserEntered: true,
        skipValueRewrite: options.skipValueRewrite
    });

    // Track edit history (unless locked)
    if (!state.locked.has(editedParam)) {
        state.lastEdited = state.lastEdited.filter(p => p !== editedParam);
        state.lastEdited.unshift(editedParam);
        if (state.lastEdited.length > 2) {
            state.lastEdited.pop();
        }
    }

    // Evict anything that can no longer anchor a calculation so that nulls
    // and the ∞/Invalid sentinels never reach the arithmetic below.
    PARAMS.forEach(param => {
        if (!isUsableValue(state[param])) {
            if (state.locked.has(param)) {
                setLockState(param, false);
            }
            state.lastEdited = state.lastEdited.filter(p => p !== param);
        }
    });

    // Clear calculated styling
    document.querySelectorAll('.input-card').forEach(card => {
        card.classList.remove('calculated');
    });

    // Choose the two anchor parameters: locked values first, then the most
    // recently edited.
    const usable = PARAMS.filter(p => isUsableValue(state[p]));
    const locked = Array.from(state.locked);
    let inputParams = null;

    if (locked.length >= 2) {
        inputParams = locked.slice(0, 2);
    } else if (locked.length === 1) {
        const other = state.lastEdited.find(p => p !== locked[0]) ||
            usable.find(p => p !== locked[0]);
        if (other) {
            inputParams = [locked[0], other];
        }
    } else if (state.lastEdited.length >= 2) {
        inputParams = state.lastEdited.slice(0, 2);
    }

    if (inputParams) {
        const [param1, param2] = inputParams;
        const calculated = calculateFromTwo(param1, state[param1], param2, state[param2]);

        // Update state with calculated values
        Object.entries(calculated).forEach(([param, calcValue]) => {
            if (!inputParams.includes(param)) {
                // Mark as not user-entered (calculated values can be auto-scaled)
                userEntered.delete(param);
                state[param] = calcValue;
                syncUI(param, { isUserEntered: false });
                document.querySelector(`[data-param="${param}"]`).classList.add('calculated');
            }
        });
    } else {
        // Not enough anchors: drop stale calculated values instead of
        // leaving results derived from a value that no longer exists.
        PARAMS.forEach(param => {
            if (!userEntered.has(param) && state[param] !== null) {
                state[param] = null;
                syncUI(param, { isUserEntered: false });
            }
        });
    }

    updateFormulaDisplay();
}

/**
 * Set a parameter's lock state and its button UI
 * @param {string} param - Parameter name
 * @param {boolean} locked - Desired lock state
 */
function setLockState(param, locked) {
    const btn = document.querySelector(`[data-lock="${param}"]`);
    if (locked) {
        state.locked.add(param);
    } else {
        state.locked.delete(param);
    }
    btn.classList.toggle('locked', locked);
    btn.setAttribute('aria-pressed', String(locked));
}

function toggleLock(param) {
    if (state.locked.has(param)) {
        setLockState(param, false);
    } else if (isUsableValue(getStateValue(param))) {
        // Only a finite number can be held constant; empty fields and the
        // ∞/Invalid states are not lockable.
        setLockState(param, true);
    }
}

// ============================================
// Initialization
// ============================================

function init() {
    // Looked up at init rather than at script parse time so the tool does
    // not depend on where the script tag sits relative to the markup.
    elements = {
        voltage: document.getElementById('voltage'),
        current: document.getElementById('current'),
        resistance: document.getElementById('resistance'),
        power: document.getElementById('power'),
        voltageUnit: document.getElementById('voltageUnit'),
        currentUnit: document.getElementById('currentUnit'),
        resistanceUnit: document.getElementById('resistanceUnit'),
        powerUnit: document.getElementById('powerUnit')
    };

    bindInputEvents();
    bindLockButtons();
    bindWheelSegments();
    bindQuickValues();
    bindCopyButtons();
}

/**
 * Bind click plus Enter/Space activation for non-button interactive elements
 * @param {HTMLElement} element - Element with role="button"
 * @param {Function} handler - Activation handler
 */
function activateOnKeys(element, handler) {
    element.addEventListener('click', handler);
    element.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handler();
        }
    });
}

function bindInputEvents() {
    PARAMS.forEach(param => {
        elements[param].addEventListener('input', () => {
            userEntered.add(param);
            // Never rewrite the field the user is typing in
            scheduleCalculation(param, { skipValueRewrite: true });
        });
        elements[param + 'Unit'].addEventListener('change', () => {
            // Unit change reinterprets the typed number in the new unit
            userEntered.add(param);
            scheduleCalculation(param);
        });
    });
}

function bindLockButtons() {
    document.querySelectorAll('.lock-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            toggleLock(btn.dataset.lock);
        });
    });
}

function bindWheelSegments() {
    document.querySelectorAll('.wheel-segment').forEach(segment => {
        activateOnKeys(segment, () => {
            elements[segment.dataset.select].focus();
            document.querySelectorAll('.wheel-segment').forEach(s => s.classList.remove('active'));
            segment.classList.add('active');
        });
    });
}

function bindQuickValues() {
    document.querySelectorAll('.quick-value').forEach(qv => {
        activateOnKeys(qv, () => {
            if (!qv.dataset.voltage) return;
            elements.voltage.value = qv.dataset.voltage;
            elements.voltageUnit.value = '1';
            userEntered.add('voltage');
            scheduleCalculation('voltage');
        });
    });
}

function bindCopyButtons() {
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const param = btn.dataset.copy;
            const input = elements[param];
            const unitSelect = elements[param + 'Unit'];
            const value = state[param];

            // Format the value with unit for copying
            let copyText = '';
            if (value === INFINITY) {
                copyText = '∞';
            } else if (value === INVALID) {
                copyText = 'Invalid';
            } else if (value === null || !isFinite(value)) {
                copyText = '';
            } else {
                const unitText = unitSelect.options[unitSelect.selectedIndex].text;
                copyText = `${input.value} ${unitText}`;
            }

            if (!copyText) return;

            // Shared Clipboard handles the copy (including its execCommand
            // fallback); feedback stays local because these buttons hold an
            // SVG icon that the shared textContent-based feedback would
            // destroy.
            const success = await window.ToolsHub?.Clipboard?.copy(copyText, null);
            if (success) {
                showCopyFeedback(btn);
            }
        });
    });
}

/**
 * Swap the copy icon for a checkmark briefly
 * @param {HTMLElement} button - Button element
 */
function showCopyFeedback(button) {
    const originalHTML = button.innerHTML;
    button.classList.add('copy-success');
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
    setTimeout(() => {
        button.classList.remove('copy-success');
        button.innerHTML = originalHTML;
    }, 1500);
}

// Pure calculation surface exposed for automated tests
// (tests/smoke/ohms-law.spec.cjs).
window.OhmsLaw = {
    INFINITY,
    INVALID,
    calculateFromTwo,
    formatNumber,
    isUsableValue
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
})();
