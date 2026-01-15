/**
 * Base Converter Tool
 *
 * Converts numbers between different bases (binary, octal, decimal, hexadecimal)
 * with support for endianness and word size simulation.
 *
 * Project: Tools Hub by Jesse Anderson
 * Repository: https://github.com/jesse-anderson/Tools
 * License: GPL-3.0
 */

// ============================================
// Constants
// ============================================

/** @type {string} Value for auto word size mode */
const WORD_SIZE_AUTO = 'auto';

/** @type {number} 16-bit word size */
const WORD_SIZE_16 = 16;

/** @type {number} 32-bit word size (default) */
const WORD_SIZE_32 = 32;

/** @type {number} 64-bit word size */
const WORD_SIZE_64 = 64;

/** @type {string} Big Endian byte order */
const ENDIAN_BE = 'BE';

/** @type {string} Little Endian byte order */
const ENDIAN_LE = 'LE';

/** @type {number} Number of bits per byte */
const BITS_PER_BYTE = 8;

/** @type {number} Number of hex characters per byte */
const HEX_CHARS_PER_BYTE = 2;

/** @type {number} Number of bits in a nibble (half byte) */
const BITS_PER_NIBBLE = 4;

/** @type {number} Bit grid size (8 bits for one byte) */
const BIT_GRID_SIZE = 8;

/** @type {number} Highest bit index in the visualizer */
const MAX_BIT_INDEX = 7;

/** @type {number} Lowest bit index */
const MIN_BIT_INDEX = 0;

/** @type {number} Maximum textarea height in pixels (6em) */
const TEXTAREA_MAX_HEIGHT = 144;

/** @type {number} Copy button visual feedback duration in milliseconds */
const COPY_FEEDBACK_DURATION = 200;

/** @type {bigint} BigInt zero */
const BIGINT_ZERO = 0n;

/** @type {bigint} BigInt one */
const BIGINT_ONE = 1n;

/** @type {bigint} Mask for lowest 8 bits (one byte) */
const LOW_BYTE_MASK = 0xFFn;

/** @type {number} Numeric mask for lowest 8 bits */
const LOW_BYTE_MASK_NUM = 0xFF;

/** @type {string} Octal prefix for BigInt parsing */
const OCTAL_PREFIX = '0o';

/** @type {string} Hexadecimal prefix */
const HEX_PREFIX = '0x';

/** @type {string} Binary prefix */
const BINARY_PREFIX = '0b';

/** @type {string} Hex radix display prefix */
const HEX_DISPLAY_PREFIX = '0x';

/** @type {string} Octal display prefix */
const OCTAL_DISPLAY_PREFIX = '0o';

/** @type {string} Binary display prefix */
const BINARY_DISPLAY_PREFIX = '0b';

/** @type {Object} Input type identifiers */
const INPUT_TYPES = {
    DECIMAL: 'dec',
    HEXADECIMAL: 'hex',
    OCTAL: 'oct',
    BINARY: 'bin'
};

/** @type {RegExp} Regex to match invalid characters in decimal input (allows minus sign for two's complement) */
const REGEX_DECIMAL_INVALID = /[^0-9-]/g;

/** @type {RegExp} Regex to match invalid characters in hexadecimal input */
const REGEX_HEX_INVALID = /[^0-9A-Fa-f\s]/g;

/** @type {RegExp} Regex to match invalid characters in octal input */
const REGEX_OCTAL_INVALID = /[^0-7]/g;

/** @type {RegExp} Regex to match invalid characters in binary input */
const REGEX_BINARY_INVALID = /[^0-1\s]/g;

// ============================================
// State Management
// ============================================

/**
 * Global state for the base converter
 * @type {Object}
 * @property {number|string} width - Word size in bits: 'auto', 16, 32, or 64
 * @property {string} endian - Endianness: 'BE' (Big Endian) or 'LE' (Little Endian)
 */
const state = {
    width: WORD_SIZE_32,
    endian: ENDIAN_BE
};

// ============================================
// DOM Element References
// ============================================

/**
 * References to all input fields
 * @type {Object.<string, HTMLInputElement|HTMLTextAreaElement>}
 */
const inputs = {
    dec: document.getElementById('input-dec'),
    hex: document.getElementById('input-hex'),
    oct: document.getElementById('input-oct'),
    bin: document.getElementById('input-bin')
};

/**
 * References to all input card containers
 * @type {Object.<string, HTMLElement>}
 */
const cards = {
    dec: document.getElementById('card-dec'),
    hex: document.getElementById('card-hex'),
    oct: document.getElementById('card-oct'),
    bin: document.getElementById('card-bin')
};

const bitGrid = document.getElementById('bit-grid');
const errorBanner = document.getElementById('error-banner');
const errorMessage = document.getElementById('error-message');
const warningBanner = document.getElementById('warning-banner');
const warningMessage = document.getElementById('warning-message');

// ============================================
// Error Handling Functions
// ============================================

/**
 * Displays an error message banner and highlights the invalid input field
 * @param {string} inputType - The type of input that caused the error ('dec', 'hex', 'oct', 'bin')
 * @param {string} message - The error message to display
 */
function showError(inputType, message) {
    // Show error banner
    errorMessage.textContent = message;
    errorBanner.classList.add('active');

    // Add error class to the specific input card and input
    cards[inputType].classList.add('error');
    inputs[inputType].classList.add('error-input');
    inputs[inputType].setAttribute('aria-invalid', 'true');
}

/**
 * Clears all error states including the error banner and input highlighting
 */
function clearError() {
    // Hide error banner
    errorBanner.classList.remove('active');
    errorMessage.textContent = '';

    // Remove error classes from all cards and inputs
    Object.values(cards).forEach(card => card.classList.remove('error'));
    Object.values(inputs).forEach(input => {
        input.classList.remove('error-input');
        input.removeAttribute('aria-invalid');
    });

    // Also clear warnings
    clearWarning();
}

// ============================================
// Warning Handling Functions
// ============================================

/**
 * Displays a warning banner when a value exceeds the current word size limit
 * @param {bigint} originalValue - The original value that exceeded the limit
 * @param {bigint} truncatedValue - The value after truncation
 * @param {number} bitWidth - The bit width that was exceeded (16, 32, or 64)
 */
function showWarning(originalValue, truncatedValue, bitWidth) {
    const maxValue = (1n << BigInt(bitWidth)) - 1n;
    warningMessage.textContent = `Value ${originalValue} exceeds ${bitWidth}-bit limit (max: ${maxValue}). Displayed as ${truncatedValue}.`;
    warningBanner.classList.add('active');
}

/**
 * Hides the warning banner and clears its message
 */
function clearWarning() {
    warningBanner.classList.remove('active');
    warningMessage.textContent = '';
}

// ============================================
// Word Size Masking Utility
// ============================================

/**
 * Applies word size masking to a BigInt value based on current state
 * @param {bigint} value - The value to mask
 * @returns {Object} Result object with properties:
 *   - value {bigint}: The masked value
 *   - truncated {boolean}: Whether truncation occurred
 *   - original {bigint}: The original value before masking
 */
function applyWidthMask(value) {
    if (state.width === WORD_SIZE_AUTO) {
        return { value, truncated: false, original: value };
    }

    const mask = (BIGINT_ONE << BigInt(state.width)) - BIGINT_ONE;
    const masked = value & mask;
    const truncated = value > masked;

    return { value: masked, truncated, original: value };
}

// ============================================
// Initialization
// ============================================

/**
 * Initializes the base converter tool by setting up the bit grid,
 * binding input event listeners, and setting the initial UI state
 */
function init() {
    // Generate Bits
    for (let i = MAX_BIT_INDEX; i >= MIN_BIT_INDEX; i--) {
        const bit = document.createElement('div');
        bit.className = 'bit-box';
        bit.dataset.index = i;
        bit.textContent = '0';
        bit.setAttribute('role', 'button');
        bit.setAttribute('aria-label', `Bit ${i}`);
        bit.setAttribute('aria-pressed', 'false');
        bit.setAttribute('tabindex', '0');
        bit.addEventListener('click', () => toggleBit(i));
        // Keyboard support: Enter or Space to toggle
        bit.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleBit(i);
            }
        });
        bitGrid.appendChild(bit);
    }

    // Bind Inputs with validation regex
    bindInput(INPUT_TYPES.DECIMAL, REGEX_DECIMAL_INVALID);
    bindInput(INPUT_TYPES.HEXADECIMAL, REGEX_HEX_INVALID);
    bindInput(INPUT_TYPES.OCTAL, REGEX_OCTAL_INVALID);
    bindInput(INPUT_TYPES.BINARY, REGEX_BINARY_INVALID);

    // Auto-resize binary textarea on input
    inputs.bin.addEventListener('input', () => autoResizeTextarea(inputs.bin));

    // Bind mode toggle buttons (width and endian)
    document.querySelectorAll('[data-mode-type]').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.modeType;
            const value = btn.dataset.modeValue;
            // Convert numeric string values to numbers
            const parsedValue = (value === 'auto' || value === 'BE' || value === 'LE')
                ? value
                : parseInt(value, 10);
            setMode(type, parsedValue);
        });
    });

    // Bind clear button
    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => clearAll());
    }

    // Bind copy buttons
    document.querySelectorAll('[data-copy-target]').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.copyTarget;
            copyValue(targetId);
        });
    });

    // Bind quick value buttons
    document.querySelectorAll('[data-quick-value]').forEach(btn => {
        btn.addEventListener('click', () => {
            const value = btn.dataset.quickValue;
            const useBigInt = btn.dataset.quickBigint === 'true';
            setDecimal(useBigInt ? BigInt(value) : value);
        });
    });

    updateModeUI();
}

// ============================================
// Mode Management
// ============================================

/**
 * Sets a mode option (width or endianness) and re-evaluates the current value
 * @param {string} type - The mode type to set: 'width' or 'endian'
 * @param {number|string} val - The value to set: for width ('auto', 16, 32, 64), for endian ('BE', 'LE')
 */
function setMode(type, val) {
    state[type] = val;
    updateModeUI();

    // Re-evaluate current decimal value in new mode
    let currentDec = inputs.dec.value.replace(/[^0-9]/g, '');
    if (currentDec) {
        try {
            let bigVal = BigInt(currentDec);
            const result = applyWidthMask(bigVal);

            if (result.truncated) {
                showWarning(result.original, result.value, state.width);
            } else {
                clearWarning();
            }
            updateAll(result.value, null);
        } catch(e) {
            // Log unexpected errors - input should already be validated by bindInput
            console.error('setMode: Error parsing decimal value:', e);
        }
    } else {
        clearWarning();
    }
}

/**
 * Updates the UI to reflect the current mode settings (width and endianness)
 * Handles button active states, ARIA attributes, and disables Little Endian when in Auto mode
 */
function updateModeUI() {
    // Update width buttons
    const widthToggles = document.getElementById('width-toggles');
    Array.from(widthToggles.children).forEach(btn => {
        const txt = btn.textContent.toLowerCase();
        const isActive = (
            (state.width === WORD_SIZE_AUTO && txt.includes('auto')) ||
            (state.width === WORD_SIZE_16 && txt.includes('16')) ||
            (state.width === WORD_SIZE_32 && txt.includes('32')) ||
            (state.width === WORD_SIZE_64 && txt.includes('64'))
        );
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-checked', isActive.toString());
    });

    // Update endian buttons
    const endianToggles = document.getElementById('endian-toggles');
    const beBtn = endianToggles.children[0];
    const leBtn = endianToggles.children[1];

    // Disable LE if Auto is selected (doesn't make sense)
    if (state.width === WORD_SIZE_AUTO) {
        state.endian = ENDIAN_BE;
        beBtn.classList.add('active');
        beBtn.setAttribute('aria-checked', 'true');
        leBtn.classList.remove('active');
        leBtn.setAttribute('aria-checked', 'false');
        leBtn.disabled = true;
        leBtn.style.opacity = '0.5';
        leBtn.style.cursor = 'not-allowed';
    } else {
        leBtn.disabled = false;
        leBtn.style.opacity = '1';
        leBtn.style.cursor = 'pointer';
        const beActive = state.endian === ENDIAN_BE;
        beBtn.classList.toggle('active', beActive);
        beBtn.setAttribute('aria-checked', beActive.toString());
        leBtn.classList.toggle('active', !beActive);
        leBtn.setAttribute('aria-checked', (!beActive).toString());
    }
}

// ============================================
// Input Handling
// ============================================

/**
 * Binds an input event listener to a base input field with character validation
 * @param {string} type - The input type identifier ('dec', 'hex', 'oct', 'bin')
 * @param {RegExp} invalidRegex - Regular expression matching invalid characters for this base
 */
function bindInput(type, invalidRegex) {
    inputs[type].addEventListener('input', (e) => {
        const originalValue = e.target.value;
        let val = originalValue;

        // Store cursor position before modifying value
        const cursorStart = e.target.selectionStart;
        const cursorEnd = e.target.selectionEnd;

        // Remove invalid chars (always replace; don't use .test() with /g regex)
        val = val.replace(invalidRegex, '');

        // Calculate how many characters were removed
        const charsRemoved = originalValue.length - val.length;

        if (val !== originalValue) {
            e.target.value = val;

            // Restore cursor position, accounting for removed characters
            // Clamp to valid range in case cursor was after removed chars
            const newStart = Math.max(0, cursorStart - charsRemoved);
            const newEnd = Math.max(0, cursorEnd - charsRemoved);
            e.target.setSelectionRange(newStart, newEnd);

            // Visual feedback: flash the input border to indicate invalid chars were removed
            const inputCard = cards[type];
            inputCard.classList.add('invalid-chars-flash');
            setTimeout(() => {
                inputCard.classList.remove('invalid-chars-flash');
            }, 300);
        }

        const cleanVal = val.replace(/\s/g, ''); // Remove spaces for parsing
        if (cleanVal === '') {
            clearAll(type);
            return;
        }

        // Validate minus sign placement (only at beginning, only one)
        if (type === INPUT_TYPES.DECIMAL) {
            const minusCount = (cleanVal.match(/-/g) || []).length;
            if (minusCount > 1 || (minusCount === 1 && !cleanVal.startsWith('-'))) {
                showError(type, 'Minus sign (-) must only appear at the beginning of the number.');
                return;
            }
            if (cleanVal === '-') {
                clearAll(type);
                return;
            }
        }

        try {
            let bigIntVal;

            if (type === INPUT_TYPES.DECIMAL) {
                // Handle negative numbers (two's complement)
                if (cleanVal.startsWith('-')) {
                    if (state.width === WORD_SIZE_AUTO) {
                        showError(type, 'Negative numbers require a fixed word size (16-bit, 32-bit, or 64-bit) for two\'s complement conversion.');
                        return;
                    }
                    // Parse as positive first, then convert to two's complement
                    const magnitude = BigInt(cleanVal.slice(1));
                    const bitWidth = BigInt(state.width);
                    const maxUnsigned = (BIGINT_ONE << bitWidth);
                    // Two's complement: unsigned_value = 2^bits - magnitude
                    bigIntVal = maxUnsigned - magnitude;
                } else {
                    bigIntVal = BigInt(cleanVal);
                }
            } else if (type === INPUT_TYPES.OCTAL) {
                // Octal is always the abstract value (not byte-swapped)
                bigIntVal = BigInt(OCTAL_PREFIX + cleanVal);
            } else if (type === INPUT_TYPES.HEXADECIMAL) {
                // Hex represents BYTES. If LE, we must swap them to get Value.
                bigIntVal = parseHexWithEndian(cleanVal);
            } else if (type === INPUT_TYPES.BINARY) {
                // Binary represents BYTES (like hex). If LE, swap bytes.
                bigIntVal = parseBinWithEndian(cleanVal);
            }

            // Apply word size mask and check for truncation
            const maskResult = applyWidthMask(bigIntVal);
            if (maskResult.truncated) {
                showWarning(maskResult.original, maskResult.value, state.width);
            } else {
                clearWarning();
            }

            // Clear any existing errors and update all fields
            clearError();
            updateAll(maskResult.value, type);
        } catch (err) {
            // Show user-facing error instead of console-only
            const typeNames = {
                [INPUT_TYPES.DECIMAL]: 'Decimal',
                [INPUT_TYPES.HEXADECIMAL]: 'Hexadecimal',
                [INPUT_TYPES.OCTAL]: 'Octal',
                [INPUT_TYPES.BINARY]: 'Binary'
            };
            showError(type, `Invalid ${typeNames[type]} value: "${cleanVal}"`);
        }
    });
}

// ============================================
// Parsing Functions (Endian Aware)
// ============================================

/**
 * Parses a hexadecimal string to a BigInt, respecting endianness and word size
 *
 * ENDIANNESS EXPLANATION:
 * - Big Endian (BE): Most significant byte first (normal human reading order)
 *   Example: Value 0x12345678 is stored/displayed as "12 34 56 78"
 *
 * - Little Endian (LE): Least significant byte first (common in x86/ARM)
 *   Example: Value 0x12345678 is stored in memory as "78 56 34 12"
 *   But DISPLAYED as "78 56 34 12" to show the memory representation
 *
 * This function displays the MEMORY representation when LE is active.
 * When the user types "78 56 34 12" in LE mode, they are describing
 * memory layout, and this function converts it to the abstract value 0x12345678.
 *
 * @param {string} hexStr - Hexadecimal string without spaces or prefix
 * @returns {bigint} The parsed value as a BigInt (abstract numeric value)
 */
function parseHexWithEndian(hexStr) {
    // hexStr comes in with no spaces (caller does .replace(/\s/g,''))
    if (hexStr.length === 0) return BIGINT_ZERO;

    // Normalize to whole bytes (pad with leading zero if odd length)
    if (hexStr.length % HEX_CHARS_PER_BYTE !== 0) hexStr = '0' + hexStr;

    // Split into bytes in the order the user typed (display order)
    // For BE: this is already big-endian byte order
    // For LE: this is memory order (LSB first)
    let bytes = [];
    for (let i = 0; i < hexStr.length; i += HEX_CHARS_PER_BYTE) {
        bytes.push(hexStr.slice(i, i + HEX_CHARS_PER_BYTE));
    }

    // If fixed width: pad/truncate as BYTES in the input's byte order
    if (state.width !== WORD_SIZE_AUTO) {
        const byteCount = state.width / BITS_PER_BYTE;

        if (bytes.length > byteCount) {
            // Truncation keeps the least significant bytes:
            // - BE display order: least-significant bytes are at the END => keep last N bytes
            // - LE memory order: least-significant bytes are at the START => keep first N bytes
            bytes = (state.endian === ENDIAN_LE)
                ? bytes.slice(0, byteCount)  // LE: keep from start (LSB side)
                : bytes.slice(-byteCount);   // BE: keep from end (LSB side)
        } else if (bytes.length < byteCount) {
            const pad = new Array(byteCount - bytes.length).fill('00');

            // Padding adds most-significant bytes (zeros):
            // - BE display order: MSB at the FRONT => pad at beginning
            // - LE memory order: MSB at the END => pad at end
            bytes = (state.endian === ENDIAN_LE)
                ? bytes.concat(pad)   // LE: append high bytes
                : pad.concat(bytes);  // BE: prepend high bytes
        }

        // CRITICAL: Convert from memory order to abstract big-endian byte order
        // In LE mode, the user input is in memory order (LSB first).
        // We must reverse it to get the abstract big-endian value.
        // Example: LE input "78 56 34 12" becomes "12 34 56 78" for BigInt parsing
        if (state.endian === ENDIAN_LE) {
            bytes = bytes.slice().reverse();
        }
    }

    // Parse the big-endian byte string as a BigInt (abstract value)
    return BigInt(HEX_PREFIX + bytes.join(''));
}

/**
 * Parses a binary string to a BigInt, respecting endianness and word size
 *
 * ENDIANNESS EXPLANATION:
 * Binary works identically to hexadecimal - see parseHexWithEndian for details.
 *
 * @param {string} binStr - Binary string without spaces or prefix
 * @returns {bigint} The parsed value as a BigInt (abstract numeric value)
 */
function parseBinWithEndian(binStr) {
    // binStr comes in with no spaces (caller does .replace(/\s/g,''))
    if (binStr.length === 0) return BIGINT_ZERO;

    // Normalize to whole bytes (pad with leading zeros if not a multiple of 8)
    const remainder = binStr.length % BITS_PER_BYTE;
    if (remainder !== 0) {
        binStr = '0'.repeat(BITS_PER_BYTE - remainder) + binStr;
    }

    // Split into bytes in the order the user typed (display order)
    // For BE: this is already big-endian byte order
    // For LE: this is memory order (LSB first)
    let bytes = [];
    for (let i = 0; i < binStr.length; i += BITS_PER_BYTE) {
        bytes.push(binStr.slice(i, i + BITS_PER_BYTE));
    }

    // If fixed width: pad/truncate as BYTES in the input's byte order
    if (state.width !== WORD_SIZE_AUTO) {
        const byteCount = state.width / BITS_PER_BYTE;

        if (bytes.length > byteCount) {
            // Truncation keeps the least significant bytes:
            // - BE display order: least-significant bytes are at the END => keep last N bytes
            // - LE memory order: least-significant bytes are at the START => keep first N bytes
            bytes = (state.endian === ENDIAN_LE)
                ? bytes.slice(0, byteCount)  // LE: keep from start (LSB side)
                : bytes.slice(-byteCount);   // BE: keep from end (LSB side)
        } else if (bytes.length < byteCount) {
            const pad = new Array(byteCount - bytes.length).fill('00000000');

            // Padding adds most-significant bytes (zeros):
            // - BE display order: MSB at the FRONT => pad at beginning
            // - LE memory order: MSB at the END => pad at end
            bytes = (state.endian === ENDIAN_LE)
                ? bytes.concat(pad)   // LE: append high bytes
                : pad.concat(bytes);  // BE: prepend high bytes
        }

        // CRITICAL: Convert from memory order to abstract big-endian byte order
        // In LE mode, the user input is in memory order (LSB first).
        // We must reverse it to get the abstract big-endian value.
        // Example: LE input "LSB-byte ... MSB-byte" becomes "MSB-byte ... LSB-byte"
        if (state.endian === ENDIAN_LE) {
            bytes = bytes.slice().reverse();
        }
    }

    // Parse the big-endian byte string as a BigInt (abstract value)
    return BigInt(BINARY_PREFIX + bytes.join(''));
}

// ============================================
// Update Functions
// ============================================

/**
 * Updates all input fields to display the given value in all bases
 * @param {bigint} value - The abstract numeric value to display (Big Endian interpretation)
 * @param {string|null} skipType - The input type to skip updating (to avoid cursor jumps), or null
 */
function updateAll(value, skipType) {
    // Value is the ABSTRACT numeric value (Big Endian interpretation)

    // 1. Update Decimal (Always abstract value)
    if (skipType !== INPUT_TYPES.DECIMAL) {
        inputs.dec.value = value.toString(10);
    }

    // 2. Update Octal (Always abstract value, not byte-swapped)
    if (skipType !== INPUT_TYPES.OCTAL) {
        inputs.oct.value = value.toString(8);
    }

    // 3. Prepare Hex string
    let hexStr = value.toString(16).toUpperCase();
    if (hexStr.length % HEX_CHARS_PER_BYTE !== 0) hexStr = '0' + hexStr;

    // Pad to width if fixed
    if (state.width !== WORD_SIZE_AUTO) {
        const targetHexChars = state.width / BITS_PER_NIBBLE;
        hexStr = hexStr.padStart(targetHexChars, '0');
    }

    // 4. Prepare Binary string
    let binStr = value.toString(2);

    // Pad to width if fixed
    if (state.width !== WORD_SIZE_AUTO) {
        binStr = binStr.padStart(state.width, '0');
    } else {
        // Pad to full bytes in auto mode
        const remainder = binStr.length % BITS_PER_BYTE;
        if (remainder !== 0) {
            binStr = '0'.repeat(BITS_PER_BYTE - remainder) + binStr;
        }
    }

    // 5. Apply endian swap for display if LE
    let displayHex = hexStr;
    let displayBin = binStr;

    if (state.endian === ENDIAN_LE && state.width !== WORD_SIZE_AUTO) {
        displayHex = reverseHexBytes(hexStr, state.width / BITS_PER_BYTE);
        displayBin = reverseBinBytes(binStr, state.width / BITS_PER_BYTE);
    }

    // 6. Update fields with formatted display
    if (skipType !== INPUT_TYPES.HEXADECIMAL) {
        inputs.hex.value = formatHex(displayHex);
    }

    if (skipType !== INPUT_TYPES.BINARY) {
        inputs.bin.value = formatBin(displayBin);
        autoResizeTextarea(inputs.bin);
    }

    updateBits(value);
}

/**
 * Reverses the byte order of a hexadecimal string for display
 *
 * Used when displaying values in Little Endian mode.
 * Converts from abstract big-endian byte order to memory byte order.
 *
 * Example: Abstract value 0x12345678 becomes "78 56 34 12" for display
 *
 * @param {string} hex - Hexadecimal string in big-endian byte order
 * @param {number} byteCount - Number of bytes in the string
 * @returns {string} The hex string with bytes reversed (memory order)
 */
function reverseHexBytes(hex, byteCount) {
    // Ensure full length for swapping (pad with leading zeros, then take last N chars)
    const targetLength = byteCount * HEX_CHARS_PER_BYTE;
    const padded = hex.padStart(targetLength, '0').slice(-targetLength);

    // Split into byte pairs and reverse their order
    const bytes = [];
    for (let i = 0; i < padded.length; i += HEX_CHARS_PER_BYTE) {
        bytes.push(padded.slice(i, i + HEX_CHARS_PER_BYTE));
    }
    return bytes.reverse().join('');
}

/**
 * Reverses the byte order of a binary string for display
 *
 * Used when displaying values in Little Endian mode.
 * Converts from abstract big-endian byte order to memory byte order.
 *
 * Example: Abstract value 0b00010010001101000101011001111000 becomes
 * display in memory order: LSB first, MSB last
 *
 * @param {string} bin - Binary string in big-endian byte order
 * @param {number} byteCount - Number of bytes in the string
 * @returns {string} The binary string with bytes reversed (memory order)
 */
function reverseBinBytes(bin, byteCount) {
    // Ensure full length for swapping (pad with leading zeros, then take last N chars)
    const targetLength = byteCount * BITS_PER_BYTE;
    const padded = bin.padStart(targetLength, '0').slice(-targetLength);

    // Split into 8-bit bytes and reverse their order
    const bytes = [];
    for (let i = 0; i < padded.length; i += BITS_PER_BYTE) {
        bytes.push(padded.slice(i, i + BITS_PER_BYTE));
    }
    return bytes.reverse().join('');
}

/**
 * Formats a hexadecimal string with spaces between bytes
 * @param {string} hex - Hexadecimal string to format
 * @returns {string} Formatted hex string with space between each byte pair
 */
function formatHex(hex) {
    // Add space every 2 chars (byte separation)
    return hex.replace(/(.{2})/g, '$1 ').trim();
}

/**
 * Formats a binary string with spaces between bytes
 * @param {string} bin - Binary string to format
 * @returns {string} Formatted binary string with space between each byte
 */
function formatBin(bin) {
    // Add space every 8 chars (byte separation)
    return bin.replace(/(.{8})/g, '$1 ').trim();
}

/**
 * Auto-resizes a textarea element to fit its content
 * Uses requestAnimationFrame to ensure accurate scrollHeight calculation
 * @param {HTMLTextAreaElement} textarea - The textarea to resize
 */
function autoResizeTextarea(textarea) {
    // Use requestAnimationFrame to ensure the DOM has updated
    requestAnimationFrame(() => {
        // Reset to minimum height to force recalculation
        textarea.style.height = '0px';

        // Calculate new height based on content
        const newHeight = Math.min(textarea.scrollHeight, TEXTAREA_MAX_HEIGHT);
        textarea.style.height = newHeight + 'px';
    });
}

// ============================================
// Bit Visualizer
// ============================================

/**
 * Updates the bit visualizer to display the LSB of the current value
 * @param {bigint} value - The value whose LSB should be visualized
 */
function updateBits(value) {
    // Always visualize the LSB of the abstract VALUE
    const lowByte = Number(value & LOW_BYTE_MASK);
    const bits = bitGrid.children;
    for (let i = MIN_BIT_INDEX; i < BIT_GRID_SIZE; i++) {
        const domBit = bits[i];
        const bitIndex = parseInt(domBit.dataset.index);
        const isActive = (lowByte >> bitIndex) & 1;

        if (isActive) {
            domBit.classList.add('active');
            domBit.textContent = '1';
            domBit.setAttribute('aria-pressed', 'true');
        } else {
            domBit.classList.remove('active');
            domBit.textContent = '0';
            domBit.setAttribute('aria-pressed', 'false');
        }
    }
}

/**
 * Toggles a specific bit in the current value
 * @param {number} index - The bit index to toggle (0-7)
 */
function toggleBit(index) {
    let currentVal = inputs.dec.value === '' ? BIGINT_ZERO : BigInt(inputs.dec.value);
    const mask = BIGINT_ONE << BigInt(index);

    if ((currentVal & mask) !== BIGINT_ZERO) {
        currentVal = currentVal & ~mask;
    } else {
        currentVal = currentVal | mask;
    }

    if (state.width !== WORD_SIZE_AUTO) {
        const widthMask = (BIGINT_ONE << BigInt(state.width)) - BIGINT_ONE;
        currentVal = currentVal & widthMask;
    }

    updateAll(currentVal, null);
}

// ============================================
// Quick Value Functions
// ============================================

/**
 * Sets a decimal value and updates all fields, checking for truncation
 * Used by the quick value buttons in the sidebar
 * @param {bigint|number|string} val - The value to set
 */
function setDecimal(val) {
    let bigVal = BigInt(val);

    // Apply word size mask and check for truncation
    const result = applyWidthMask(bigVal);
    if (result.truncated) {
        showWarning(result.original, result.value, state.width);
    } else {
        clearWarning();
    }

    // Clear any existing errors before updating
    clearError();
    updateAll(result.value, null);
}

// ============================================
// Utility Functions
// ============================================

/**
 * Clears all input fields and resets the bit visualizer
 * @param {string|null} [skipType=null] - The input type to skip clearing (useful during input)
 */
function clearAll(skipType = null) {
    if (skipType !== INPUT_TYPES.DECIMAL) inputs.dec.value = '';
    if (skipType !== INPUT_TYPES.HEXADECIMAL) inputs.hex.value = '';
    if (skipType !== INPUT_TYPES.OCTAL) inputs.oct.value = '';
    if (skipType !== INPUT_TYPES.BINARY) {
        inputs.bin.value = '';
        autoResizeTextarea(inputs.bin);
    }

    // Clear any error states
    clearError();

    Array.from(bitGrid.children).forEach(b => {
        b.classList.remove('active');
        b.textContent = '0';
    });
}

/**
 * Copies the value from an input field to the clipboard (without spaces)
 * Uses the shared Clipboard utility with fallback support for older browsers
 * @param {string} id - The ID of the input element to copy from
 */
async function copyValue(id) {
    const input = document.getElementById(id);
    if (!input.value) return;

    // Remove spaces for copy
    const clean = input.value.replace(/\s/g, '');

    // Use shared Clipboard utility with fallback support
    const success = await window.ToolsHub?.Clipboard?.copy(clean);

    // Visual feedback on button
    const btn = input.parentElement.querySelector('.copy-btn');
    const originalColor = btn.style.borderColor;
    const originalTextColor = btn.style.color;

    if (success) {
        // Success: show accent color
        btn.style.borderColor = 'var(--accent-engineering)';
        btn.style.color = 'var(--accent-engineering)';
    } else {
        // Failure: show error color
        btn.style.borderColor = 'var(--accent-error)';
        btn.style.color = 'var(--accent-error)';
    }

    setTimeout(() => {
        btn.style.borderColor = originalColor;
        btn.style.color = originalTextColor;
    }, COPY_FEEDBACK_DURATION);
}

// ============================================
// Initialize on DOM Ready
// ============================================

init();
