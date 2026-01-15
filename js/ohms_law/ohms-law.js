// ============================================
// Ohm's Law Calculator
// ============================================

// Special values for edge cases
const INFINITY = Symbol('Infinity');
const INVALID = Symbol('Invalid');

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

// Debounce timer for input handling
let debounceTimer = null;
const DEBOUNCE_DELAY = 300; // ms

const elements = {
    voltage: document.getElementById('voltage'),
    current: document.getElementById('current'),
    resistance: document.getElementById('resistance'),
    power: document.getElementById('power'),
    voltageUnit: document.getElementById('voltageUnit'),
    currentUnit: document.getElementById('currentUnit'),
    resistanceUnit: document.getElementById('resistanceUnit'),
    powerUnit: document.getElementById('powerUnit')
};

// ============================================
// State Management
// ============================================

/**
 * Get a value from state (single source of truth)
 * @param {string} param - Parameter name ('voltage', 'current', etc.)
 * @returns {number|null} Value in base units
 */
function getStateValue(param) {
    return state[param];
}

/**
 * Update state and sync UI for a parameter
 * @param {string} param - Parameter name
 * @param {number|null} value - Value in base units
 * @param {Object} options - Sync options
 * @param {boolean} options.isUserEntered - True if value was entered by user
 */
function setStateValue(param, value, options = {}) {
    state[param] = value;
    if (options.isUserEntered) {
        userEntered.add(param);
    }
    syncUI(param, { isUserEntered: userEntered.has(param) });
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
        card.setAttribute('data-error', '∞');
        return;
    }
    if (value === INVALID) {
        input.value = '';
        input.placeholder = 'Invalid';
        card.classList.add('error');
        card.setAttribute('data-error', 'Invalid');
        return;
    }

    // Clear error state for normal values
    input.placeholder = '';
    card.classList.remove('error');
    card.removeAttribute('data-error');

    if (value === null || !isFinite(value)) {
        elements[param].value = '';
        return;
    }

    // Auto-scale: Find the best unit for this value
    const unitSelect = elements[param + 'Unit'];
    const currentScale = parseFloat(unitSelect.value);
    const unitOptions = Array.from(unitSelect.options);
    unitOptions.sort((a, b) => parseFloat(a.value) - parseFloat(b.value));

    const absValue = Math.abs(value);
    let bestOption = unitOptions.find(o => o.value === "1") || unitOptions[0];

    if (absValue > 0) {
        // Smart auto-scaling logic
        if (isUserEntered) {
            // For user-entered values: be conservative
            // Only change unit if value is >= 1000x current unit or <= 0.001x current unit
            const valueInCurrentUnit = value / currentScale;

            if (valueInCurrentUnit >= 1000) {
                // Find next larger unit (e.g., V -> kV)
                for (let opt of unitOptions) {
                    const optVal = parseFloat(opt.value);
                    if (optVal > currentScale && absValue >= optVal * 100) {
                        bestOption = opt;
                    }
                }
            } else if (valueInCurrentUnit <= 0.001 && valueInCurrentUnit !== 0) {
                // Find smaller unit (e.g., V -> mV) if very small
                for (let i = unitOptions.length - 1; i >= 0; i--) {
                    const optVal = parseFloat(unitOptions[i].value);
                    if (optVal < currentScale && absValue >= optVal) {
                        bestOption = unitOptions[i];
                    }
                }
            } else {
                // Keep current unit - user knows what they want
                bestOption = unitOptions.find(o => parseFloat(o.value) === currentScale) || bestOption;
            }
        } else {
            // For calculated values: auto-scale more aggressively for readability
            // Use the largest unit where value >= 1
            for (let opt of unitOptions) {
                const optVal = parseFloat(opt.value);
                if (absValue >= optVal) {
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

/**
 * Sync all UI elements from state
 */
function syncAllUI() {
    ['voltage', 'current', 'resistance', 'power'].forEach(param => {
        syncUI(param, { isUserEntered: userEntered.has(param) });
    });
}

// ============================================
// Calculations
// ============================================

/**
 * Calculate remaining values from two known parameters
 * Handles division by zero with appropriate infinite/invalid states
 */
function calculateFromTwo(param1, val1, param2, val2) {
    const result = { voltage: null, current: null, resistance: null, power: null };
    result[param1] = val1;
    result[param2] = val2;

    const pair = [param1, param2].sort().join('-');

    switch (pair) {
        case 'current-voltage':
            const V_vi = param1 === 'voltage' ? val1 : val2;
            const I_vi = param1 === 'current' ? val1 : val2;
            // R = V / I: Infinite resistance if current is 0 (open circuit)
            result.resistance = I_vi === 0 ? INFINITY : V_vi / I_vi;
            result.power = V_vi * I_vi;
            break;

        case 'resistance-voltage':
            const V_vr = param1 === 'voltage' ? val1 : val2;
            const R_vr = param1 === 'resistance' ? val1 : val2;
            // I = V / R: Infinite current if resistance is 0 (short circuit)
            result.current = R_vr === 0 ? INFINITY : V_vr / R_vr;
            // P = V² / R: Infinite power if resistance is 0
            result.power = R_vr === 0 ? INFINITY : (V_vr * V_vr) / R_vr;
            break;

        case 'power-voltage':
            const V_vp = param1 === 'voltage' ? val1 : val2;
            const P_vp = param1 === 'power' ? val1 : val2;
            // I = P / V: Invalid if V = 0 (can't have power without voltage)
            result.current = V_vp === 0 ? INVALID : P_vp / V_vp;
            // R = V² / P: Infinite if P = 0 (open circuit)
            result.resistance = P_vp === 0 ? INFINITY : (V_vp * V_vp) / P_vp;
            break;

        case 'current-resistance':
            const I_ir = param1 === 'current' ? val1 : val2;
            const R_ir = param1 === 'resistance' ? val1 : val2;
            result.voltage = I_ir * R_ir;
            result.power = I_ir * I_ir * R_ir;
            break;

        case 'current-power':
            const I_ip = param1 === 'current' ? val1 : val2;
            const P_ip = param1 === 'power' ? val1 : val2;
            // V = P / I: Invalid if I = 0
            result.voltage = I_ip === 0 ? INVALID : P_ip / I_ip;
            // R = P / I²: Infinite if I = 0
            result.resistance = I_ip === 0 ? INFINITY : P_ip / (I_ip * I_ip);
            break;

        case 'power-resistance':
            const R_rp = param1 === 'resistance' ? val1 : val2;
            const P_rp = param1 === 'power' ? val1 : val2;
            // V = √(P × R)
            result.voltage = Math.sqrt(P_rp * R_rp);
            // I = √(P / R): Infinite if R = 0
            result.current = R_rp === 0 ? INFINITY : Math.sqrt(P_rp / R_rp);
            break;
    }

    return result;
}

function updateFormulaDisplay() {
    const V = getStateValue('voltage');
    const I = getStateValue('current');
    const R = getStateValue('resistance');
    const P = getStateValue('power');

    // V = I × R
    if (I !== null && I !== INVALID && R !== null && R !== INVALID) {
        const result = (I === INFINITY || R === INFINITY) ? INFINITY : I * R;
        document.getElementById('result-vir').textContent = formatResult(result) + ' V';
        document.getElementById('formula-vir').classList.add('active');
    } else {
        document.getElementById('result-vir').textContent = '—';
        document.getElementById('formula-vir').classList.remove('active');
    }

    // P = I × V
    if (I !== null && I !== INVALID && V !== null && V !== INVALID) {
        const result = (I === INFINITY || V === INFINITY) ? INFINITY : I * V;
        document.getElementById('result-piv').textContent = formatResult(result) + ' W';
        document.getElementById('formula-piv').classList.add('active');
    } else {
        document.getElementById('result-piv').textContent = '—';
        document.getElementById('formula-piv').classList.remove('active');
    }

    // P = I² × R
    if (I !== null && I !== INVALID && R !== null && R !== INVALID) {
        const result = (I === INFINITY || R === INFINITY) ? INFINITY : I * I * R;
        document.getElementById('result-pi2r').textContent = formatResult(result) + ' W';
        document.getElementById('formula-pi2r').classList.add('active');
    } else {
        document.getElementById('result-pi2r').textContent = '—';
        document.getElementById('result-pi2r').classList.remove('active');
    }

    // P = V² / R
    if (V !== null && V !== INVALID && R !== null && R !== INVALID) {
        const result = (R === 0) ? INFINITY : (V === INFINITY || R === INFINITY) ? INFINITY : (V * V) / R;
        document.getElementById('result-pv2r').textContent = formatResult(result) + ' W';
        document.getElementById('formula-pv2r').classList.add('active');
    } else {
        document.getElementById('result-pv2r').textContent = '—';
        document.getElementById('formula-pv2r').classList.remove('active');
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

function handleInput(editedParam) {
    // Mark as user-entered
    userEntered.add(editedParam);

    // Clear existing debounce timer
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }

    // Debounce the calculation
    debounceTimer = setTimeout(() => {
        performCalculation(editedParam);
    }, DEBOUNCE_DELAY);
}

/**
 * Perform the actual calculation and UI update
 * @param {string} editedParam - Parameter that was edited
 */
function performCalculation(editedParam) {
    // Update state from DOM
    const value = readDOMValue(editedParam);
    setStateValue(editedParam, value, { isUserEntered: true });

    // Track edit history (unless locked)
    if (!state.locked.has(editedParam)) {
        state.lastEdited = state.lastEdited.filter(p => p !== editedParam);
        state.lastEdited.unshift(editedParam);
        if (state.lastEdited.length > 2) {
            state.lastEdited.pop();
        }
    }

    // Get current state values
    const known = {
        voltage: getStateValue('voltage'),
        current: getStateValue('current'),
        resistance: getStateValue('resistance'),
        power: getStateValue('power')
    };

    const knownParams = Object.entries(known).filter(([k, v]) =>
        v !== null && v !== INVALID
    );

    // Clear calculated styling
    document.querySelectorAll('.input-card').forEach(card => {
        card.classList.remove('calculated');
    });

    if (knownParams.length >= 2) {
        // Determine which two to use as inputs
        let inputParams;
        if (state.locked.size >= 2) {
            inputParams = Array.from(state.locked).slice(0, 2);
        } else if (state.locked.size === 1) {
            const lockedParam = Array.from(state.locked)[0];
            const otherKnown = knownParams.filter(([k]) => k !== lockedParam);
            inputParams = [lockedParam, otherKnown[0][0]];
        } else {
            // Use last two edited
            inputParams = state.lastEdited.slice(0, 2);
        }

        const [param1, param2] = inputParams;
        const val1 = known[param1];
        const val2 = known[param2];

        // Calculate the other two values
        const calculated = calculateFromTwo(param1, val1, param2, val2);

        // Update state with calculated values
        Object.entries(calculated).forEach(([param, value]) => {
            if (!inputParams.includes(param)) {
                // Mark as not user-entered (calculated values can be auto-scaled)
                userEntered.delete(param);
                state[param] = value;
                syncUI(param, { isUserEntered: false });
                document.querySelector(`[data-param="${param}"]`).classList.add('calculated');
            }
        });
    }

    updateFormulaDisplay();
}

function toggleLock(param) {
    const btn = document.querySelector(`[data-lock="${param}"]`);

    if (state.locked.has(param)) {
        state.locked.delete(param);
        btn.classList.remove('locked');
        btn.querySelector('.unlocked').style.display = '';
        btn.querySelector('.locked').style.display = 'none';
    } else {
        // Can only lock if there's a value (zero is valid)
        const value = getStateValue(param);
        if (value !== null) {
            state.locked.add(param);
            btn.classList.add('locked');
            btn.querySelector('.unlocked').style.display = 'none';
            btn.querySelector('.locked').style.display = '';
        }
    }
}

// ============================================
// Initialization
// ============================================

function init() {
    bindInputEvents();
    bindLockButtons();
    bindWheelSegments();
    bindQuickValues();
    bindCopyButtons();
}

function bindInputEvents() {
    ['voltage', 'current', 'resistance', 'power'].forEach(param => {
        elements[param].addEventListener('input', () => {
            handleInput(param);
        });
        elements[param + 'Unit'].addEventListener('change', () => {
            // Unit change: immediate update, mark as user preference
            userEntered.add(param);
            if (debounceTimer) {
                clearTimeout(debounceTimer);
            }
            debounceTimer = setTimeout(() => {
                performCalculation(param);
            }, DEBOUNCE_DELAY);
        });
    });
}

function bindLockButtons() {
    document.querySelectorAll('.lock-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const param = btn.dataset.lock;
            toggleLock(param);
        });
    });
}

function bindWheelSegments() {
    document.querySelectorAll('.wheel-segment').forEach(segment => {
        segment.addEventListener('click', () => {
            const param = segment.dataset.select;
            elements[param].focus();
            document.querySelectorAll('.wheel-segment').forEach(s => s.classList.remove('active'));
            segment.classList.add('active');
        });
    });
}

function bindQuickValues() {
    document.querySelectorAll('.quick-value').forEach(qv => {
        qv.addEventListener('click', () => {
            if (qv.dataset.voltage) {
                elements.voltage.value = qv.dataset.voltage;
                elements.voltageUnit.value = '1';
                userEntered.add('voltage');
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }
                debounceTimer = setTimeout(() => {
                    performCalculation('voltage');
                }, DEBOUNCE_DELAY);
            }
        });
    });
}

function bindCopyButtons() {
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            const param = btn.dataset.copy;

            // Get the current value and unit
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
                // Get the selected unit text
                const unitText = unitSelect.options[unitSelect.selectedIndex].text;
                copyText = `${input.value} ${unitText}`;
            }

            if (!copyText) return;

            // Don't use shared Clipboard utility - it sets textContent which breaks SVG
            // Use our own implementation with proper fallback
            const success = await copyToClipboardWithFeedback(copyText, btn);

            if (!success) {
                console.warn('Copy failed');
            }
        });
    });
}

/**
 * Copy text to clipboard with visual feedback
 * @param {string} text - Text to copy
 * @param {HTMLElement} button - Button element for feedback
 * @returns {Promise<boolean>} Success status
 */
async function copyToClipboardWithFeedback(text, button) {
    // Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            showCopyFeedback(button);
            return true;
        } catch (err) {
            // Fall through to fallback
            console.warn('Clipboard API failed, trying fallback:', err);
        }
    }

    // Fallback: document.execCommand('copy')
    return fallbackCopyWithFeedback(text, button);
}

/**
 * Show visual feedback after successful copy
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

/**
 * Fallback copy method with feedback
 * @param {string} text - Text to copy
 * @param {HTMLElement} button - Button element for feedback
 * @returns {boolean} Success status
 */
function fallbackCopyWithFeedback(text, button) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '0';
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);

    // Select text - iOS needs this range selection
    if (navigator.userAgent.match(/ipad|iphone/i)) {
        const range = document.createRange();
        range.selectNodeContents(textarea);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        textarea.setSelectionRange(0, text.length);
    } else {
        textarea.select();
    }

    let success = false;
    try {
        success = document.execCommand('copy');
        if (success) {
            showCopyFeedback(button);
        }
    } catch (err) {
        console.error('Fallback copy failed:', err);
    }

    document.body.removeChild(textarea);
    return success;
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
    }
});

// Start
init();
