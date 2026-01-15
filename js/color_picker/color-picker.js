// ============================================
// Color Picker & Converter
// ============================================

const state = {
    r: 59,
    g: 130,
    b: 246,
    a: 100,  // Alpha as percentage (0-100), displayed to user, stored as 0-100 for UI
    contrastBg: { r: 255, g: 255, b: 255 }  // Background for contrast calculations (default: white)
};

// ============================================
// Utilities
// ============================================

/**
 * Creates a throttled function that only invokes func once every wait milliseconds.
 * Unlike debounce, throttled functions are called at most once per wait period.
 * @param {Function} func - The function to throttle
 * @param {number} wait - Milliseconds to wait between calls
 * @returns {Function} Throttled function
 */
function throttle(func, wait) {
    let lastTime = 0;
    return function(...args) {
        const now = Date.now();
        if (now - lastTime >= wait) {
            lastTime = now;
            return func.apply(this, args);
        }
    };
}

// DOM Elements
const nativePicker = document.getElementById('nativePicker');
const mainSwatch = document.getElementById('mainSwatch');
const hexInput = document.getElementById('hexInput');
const hexAlphaIndicator = document.getElementById('hexAlphaIndicator');
const hexAlphaValue = document.getElementById('hexAlphaValue');
const hexAlphaHint = document.getElementById('hexAlphaHint');
const sliders = {
    r: document.getElementById('rSlider'),
    g: document.getElementById('gSlider'),
    b: document.getElementById('bSlider'),
    a: document.getElementById('aSlider')
};
const inputs = {
    r: document.getElementById('rInput'),
    g: document.getElementById('gInput'),
    b: document.getElementById('bInput'),
    a: document.getElementById('aInput')
};
const outputs = {
    rgb: document.getElementById('rgbString'),
    hex3: document.getElementById('hex3String'),
    rgba: document.getElementById('rgbaString'),
    hex8: document.getElementById('hex8String'),
    hsl: document.getElementById('hslString'),
    hsla: document.getElementById('hslaString'),
    cmyk: document.getElementById('cmykString'),
    css: document.getElementById('cssString')
};

// ============================================
// Initialization
// ============================================

function init() {
    // Verify required DOM elements exist before binding
    const requiredIds = [
        'nativePicker', 'mainSwatch', 'hexInput',
        'hexAlphaIndicator', 'hexAlphaValue', 'hexAlphaHint',
        'rSlider', 'gSlider', 'bSlider', 'aSlider',
        'rInput', 'gInput', 'bInput', 'aInput',
        'rgbString', 'hex3String', 'rgbaString', 'hex8String',
        'hslString', 'hslaString', 'cmykString', 'cssString',
        'copyAnnouncer', 'customBgPicker', 'customBgSwatch', 'customBgPickerWrapper', 'customBgHex'
    ];

    const missing = requiredIds.filter(id => !document.getElementById(id));
    if (missing.length > 0) {
        console.error(`Color Picker: Missing required DOM elements: ${missing.join(', ')}`);
        return;
    }

    bindNativePicker();
    bindHexInput();
    bindSlidersAndInputs();
    bindCopyButtons();
    bindContrastBackgroundControls();

    // Initial draw
    updateUIFromState();
}

function bindNativePicker() {
    nativePicker.addEventListener('input', (e) => {
        const hex = e.target.value;
        // When user uses the native picker, we DO want to update the HEX input
        updateFromHex(hex, { skipHexUpdate: false });
    });

    // Keyboard support: activate native picker when swatch is focused
    mainSwatch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            nativePicker.click();
        }
    });
}

function bindHexInput() {
    // Track whether we have valid hex input to show appropriate error feedback
    let hasValidInput = true;

    // Clear error state when user starts typing
    hexInput.addEventListener('input', (e) => {
        const el = e.target;
        const raw = el.value;

        // Clear error state on any input
        el.classList.remove('input-error');
        el.setAttribute('aria-invalid', 'false');
        hasValidInput = true;

        // Keep only hex digits and cap at 8 (for HEX8 support)
        let hex = raw.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
        if (hex.length > 8) hex = hex.slice(0, 8);

        // Write back only if changed
        if (hex !== raw) {
            const pos = el.selectionStart;
            el.value = hex;
            if (typeof pos === 'number') el.setSelectionRange(pos, pos);
        }

        // Update when 6-digit hex is entered (ignore alpha for now)
        if (hex.length === 6) {
            updateFromHex('#' + hex, { skipHexUpdate: true });
            hasValidInput = true;
        }
        // Update when 8-digit hex is entered (includes alpha)
        if (hex.length === 8) {
            // Extract alpha from last 2 characters
            const alphaHex = hex.substring(6, 8);
            const alphaValue = parseInt(alphaHex, 16);
            const alphaPercent = Math.round((alphaValue / 255) * 100);
            state.a = alphaPercent;
            // Update RGB from first 6 characters
            updateFromHex('#' + hex.substring(0, 6), { skipHexUpdate: true });
            hasValidInput = true;
        }
    });

    // On blur, validate and show error feedback if invalid
    hexInput.addEventListener('blur', () => {
        const currentHex = rgbToHex(state.r, state.g, state.b);
        const inputValue = hexInput.value.trim();
        const alphaDecimal = state.a / 100;

        // Check for invalid input conditions
        const isEmpty = inputValue.length === 0;
        const isTooShort = inputValue.length < 6 && inputValue.length !== 8;
        const isInvalidLength = inputValue.length > 0 && inputValue.length !== 6 && inputValue.length !== 8;

        // If input is invalid, show error feedback
        if (isEmpty || isTooShort || isInvalidLength) {
            hasValidInput = false;

            // Show error state with shake animation
            hexInput.classList.add('input-error');
            hexInput.setAttribute('aria-invalid', 'true');
            hexInput.setAttribute('aria-describedby', 'hexErrorHint');

            // Create or update error hint if it doesn't exist
            let errorHint = document.getElementById('hexErrorHint');
            if (!errorHint) {
                errorHint = document.createElement('span');
                errorHint.id = 'hexErrorHint';
                errorHint.className = 'hex-hint-text hex-error-text';
                hexInput.parentElement.appendChild(errorHint);
            }

            // Set appropriate error message
            if (isEmpty) {
                errorHint.textContent = 'Please enter a HEX color (e.g., 3B82F6)';
            } else if (isTooShort) {
                errorHint.textContent = 'Incomplete HEX - use 6 digits (e.g., 3B82F6)';
            } else {
                errorHint.textContent = 'Invalid HEX length - use 6 or 8 digits';
            }

            // Reset to current valid color after animation
            setTimeout(() => {
                hexInput.classList.remove('input-error');
                if (state.a < 100) {
                    hexInput.value = rgbToHex8(state.r, state.g, state.b, alphaDecimal).substring(1).toUpperCase();
                } else {
                    hexInput.value = currentHex.substring(1).toUpperCase();
                }
                // Clear error hint after reset
                setTimeout(() => {
                    errorHint.textContent = '';
                    hexInput.removeAttribute('aria-describedby');
                }, 500);
            }, 350);
            return;
        }

        // Valid input - just normalize to uppercase
        hexInput.classList.remove('input-error');
        hexInput.setAttribute('aria-invalid', 'false');
        if (state.a < 100) {
            // Show HEX8 with alpha channel
            hexInput.value = rgbToHex8(state.r, state.g, state.b, alphaDecimal).substring(1).toUpperCase();
        } else {
            // Show 6-digit HEX
            hexInput.value = currentHex.substring(1).toUpperCase();
        }
    });

    // Clear error state on focus
    hexInput.addEventListener('focus', () => {
        hexInput.classList.remove('input-error');
        hexInput.removeAttribute('aria-invalid');
        const errorHint = document.getElementById('hexErrorHint');
        if (errorHint) errorHint.textContent = '';
    });

    hexInput.addEventListener('paste', (e) => {
        const pasted = (e.clipboardData || window.clipboardData).getData('text') || '';
        // Support 3-digit, 6-digit, and 8-digit hex codes
        const m = pasted.match(/#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})/);
        if (!m) {
            // Invalid paste - show error
            e.preventDefault();
            hexInput.classList.add('input-error');
            hexInput.setAttribute('aria-invalid', 'true');
            let errorHint = document.getElementById('hexErrorHint');
            if (!errorHint) {
                errorHint = document.createElement('span');
                errorHint.id = 'hexErrorHint';
                errorHint.className = 'hex-hint-text hex-error-text';
                hexInput.parentElement.appendChild(errorHint);
            }
            errorHint.textContent = 'Invalid HEX format - paste valid HEX (e.g., #3B82F6)';
            setTimeout(() => hexInput.classList.remove('input-error'), 350);
            return;
        }

        e.preventDefault();

        let hex = m[1];
        let alphaPercent = 100; // Default alpha

        if (hex.length === 3) {
            // Expand RGB -> RRGGBB
            hex = hex.split('').map(ch => ch + ch).join('');
        } else if (hex.length === 8) {
            // Extract alpha channel from HEX8
            const alphaHex = hex.substring(6, 8);
            const alphaValue = parseInt(alphaHex, 16);
            alphaPercent = Math.round((alphaValue / 255) * 100);
            hex = hex.substring(0, 6); // Use only RGB part
        }

        // Clear any error state on successful paste
        hexInput.classList.remove('input-error');
        hexInput.setAttribute('aria-invalid', 'false');
        const errorHint = document.getElementById('hexErrorHint');
        if (errorHint) errorHint.textContent = '';

        hex = hex.toUpperCase();
        hexInput.value = hex;
        state.a = alphaPercent; // Update alpha state
        updateFromHex('#' + hex, { skipHexUpdate: true });
    });
}

function bindSlidersAndInputs() {
    // Create throttled version of UI update for slider performance
    // 16ms = ~60fps, balances smoothness with performance
    const throttledUIUpdate = throttle(updateUIFromState, 16);

    // RGB channels (0-255)
    ['r', 'g', 'b'].forEach((key) => {
        sliders[key].addEventListener('input', (e) => {
            state[key] = parseInt(e.target.value, 10);
            throttledUIUpdate();
        });

        inputs[key].addEventListener('input', (e) => {
            // Handle empty string / NaN safely
            if (e.target.value === '') return; // don't poison state while user is clearing/typing

            let val = Number(e.target.value);
            if (!Number.isFinite(val)) return;

            val = Math.round(val);
            if (val < 0) val = 0;
            if (val > 255) val = 255;

            state[key] = val;
            updateUIFromState(); // No throttle for direct input (less frequent)
        });

        // On blur, if empty, snap to current state value
        inputs[key].addEventListener('blur', (e) => {
            if (e.target.value === '') {
                e.target.value = state[key];
            }
        });
    });

    // Alpha channel (0-100 percentage)
    sliders.a.addEventListener('input', (e) => {
        state.a = parseInt(e.target.value, 10);
        throttledUIUpdate();
    });

    inputs.a.addEventListener('input', (e) => {
        // Handle empty string / NaN safely
        if (e.target.value === '') return;

        let val = Number(e.target.value);
        if (!Number.isFinite(val)) return;

        val = Math.round(val);
        if (val < 0) val = 0;
        if (val > 100) val = 100;

        state.a = val;
        updateUIFromState(); // No throttle for direct input (less frequent)
    });

    // On blur, if empty, snap to current state value
    inputs.a.addEventListener('blur', (e) => {
        if (e.target.value === '') {
            e.target.value = state.a;
        }
    });

    // Ensure final UI update when sliders are released (handles edge cases)
    ['r', 'g', 'b', 'a'].forEach((key) => {
        sliders[key].addEventListener('change', () => {
            updateUIFromState(); // Immediate update on release
        });
    });
}

function bindCopyButtons() {
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            // Get target element ID from data attribute
            const targetId = btn.getAttribute('data-copy-target');
            if (targetId) {
                handleCopy(targetId, btn);
            }
        });
    });
}

function bindContrastBackgroundControls() {
    const customBgPicker = document.getElementById('customBgPicker');
    const customBgSwatch = document.getElementById('customBgSwatch');
    const customBgPickerWrapper = document.getElementById('customBgPickerWrapper');
    const customBgHex = document.getElementById('customBgHex');

    // Handle preset buttons (White, Dark, Custom)
    document.querySelectorAll('.bg-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const bgValue = btn.getAttribute('data-bg');

            // Update active state
            document.querySelectorAll('.bg-preset').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (bgValue === 'custom') {
                // Show custom picker
                customBgPickerWrapper.classList.add('active');
                // Use current custom color
                const hex = customBgPicker.value;
                const rgb = hexToRgb(hex);
                if (rgb) {
                    state.contrastBg = rgb;
                    customBgSwatch.style.background = hex;
                    customBgHex.textContent = hex.toUpperCase();
                }
            } else {
                // Parse preset RGB values
                customBgPickerWrapper.classList.remove('active');
                const [r, g, b] = bgValue.split(',').map(Number);
                state.contrastBg = { r, g, b };
            }

            // Recalculate contrast with new background
            updateContrast(state.r, state.g, state.b, state.a / 100);
        });
    });

    // Handle custom color picker input
    customBgPicker.addEventListener('input', (e) => {
        const hex = e.target.value;
        const rgb = hexToRgb(hex);
        if (rgb) {
            state.contrastBg = rgb;
            customBgSwatch.style.background = hex;
            customBgHex.textContent = hex.toUpperCase();
            updateContrast(state.r, state.g, state.b, state.a / 100);
        }
    });
}

// ============================================
// State Management & Updates
// ============================================

/**
 * Formats an alpha decimal value (0-1) for CSS output.
 * Removes trailing zeros after decimal point.
 * @param {number} val - Alpha value between 0 and 1
 * @returns {string} Formatted alpha string
 */
function formatAlpha(val) {
    if (val === 0) return '0';
    if (val === 1) return '1';
    return val.toFixed(2).replace(/\.?0+$/, '');
}

function updateFromHex(hex, { skipHexUpdate = false, preserveAlpha = false } = {}) {
    const rgb = hexToRgb(hex);
    if (!rgb) return;

    // Preserve current alpha if requested (for tint/shade clicks)
    const savedAlpha = preserveAlpha ? state.a : undefined;

    state.r = rgb.r;
    state.g = rgb.g;
    state.b = rgb.b;

    // Restore alpha after updating RGB
    if (savedAlpha !== undefined) {
        state.a = savedAlpha;
    }

    // Only skip HEX updates when the SOURCE is the hex input typing case
    updateUIFromState(skipHexUpdate);
}

function updateUIFromState(skipHexUpdate = false) {
    const { r, g, b, a } = state;
    const alphaDecimal = a / 100; // Convert percentage to 0-1 for CSS
    const hex = rgbToHex(r, g, b);
    const hsl = rgbToHsl(r, g, b);
    const cmyk = rgbToCmyk(r, g, b);

    // Update Swatch + Native Picker (use rgba when alpha < 100)
    if (a < 100) {
        mainSwatch.style.setProperty('--swatch-color', `rgba(${r}, ${g}, ${b}, ${formatAlpha(alphaDecimal)})`);
    } else {
        mainSwatch.style.setProperty('--swatch-color', `rgb(${r}, ${g}, ${b})`);
    }
    mainSwatch.setAttribute('aria-label', `Color preview swatch. Current color: ${hex}, alpha: ${a}%. Press Enter or Space to open RGB color picker.`);
    nativePicker.value = hex;

    // Update Hex Input (show 8 digits if alpha < 100%)
    if (!skipHexUpdate) {
        if (a < 100) {
            hexInput.value = rgbToHex8(r, g, b, alphaDecimal).substring(1).toUpperCase();
        } else {
            hexInput.value = hex.substring(1).toUpperCase();
        }
    }

    // Update Alpha Indicator (show when alpha < 100%)
    if (hexAlphaIndicator && hexAlphaValue && hexAlphaHint) {
        if (a < 100) {
            hexAlphaIndicator.hidden = false;
            hexAlphaValue.textContent = `${a}%`;
            hexAlphaHint.textContent = `Alpha ${a}% - last 2 digits represent transparency`;
        } else {
            hexAlphaIndicator.hidden = true;
            hexAlphaHint.textContent = '';
        }
    }

    // Update RGB Sliders/Inputs
    ['r', 'g', 'b'].forEach((key) => {
        sliders[key].value = state[key];
        inputs[key].value = state[key];
    });

    // Update Alpha Slider/Input
    sliders.a.value = state.a;
    inputs.a.value = state.a;

    // Update Alpha Scale Markers
    updateAlphaScaleMarkers(state.a);

    // Update Output Text
    outputs.rgb.textContent = `rgb(${r}, ${g}, ${b})`;

    // Update 3-digit HEX (only if representable, otherwise show 6-digit)
    const hex3 = rgbToHex3(r, g, b);
    if (hex3) {
        outputs.hex3.textContent = hex3;
        outputs.hex3.style.color = 'var(--text-primary)';
    } else {
        // Show 6-digit as fallback with muted color to indicate it's not shorthand
        outputs.hex3.textContent = hex;
        outputs.hex3.style.color = 'var(--text-muted)';
    }

    outputs.rgba.textContent = `rgba(${r}, ${g}, ${b}, ${formatAlpha(alphaDecimal)})`;
    outputs.hex8.textContent = rgbToHex8(r, g, b, alphaDecimal);
    outputs.hsl.textContent = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    outputs.hsla.textContent = `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${formatAlpha(alphaDecimal)})`;
    outputs.cmyk.textContent = `${cmyk.c}, ${cmyk.m}, ${cmyk.y}, ${cmyk.k}`;
    outputs.css.textContent = a < 100
        ? `--color-primary: ${rgbToHex8(r, g, b, alphaDecimal)};`
        : `--color-primary: ${hex};`;

    // Update Sidebar (pass alpha for variations)
    updateContrast(r, g, b, alphaDecimal);
    updateVariations(r, g, b, alphaDecimal);
}

// ============================================
// Color Conversion Functions
// ============================================

/**
 * Converts a HEX color string to RGB object.
 * @param {string} hex - HEX color string (with or without # prefix)
 * @returns {{r: number, g: number, b: number}|null} RGB object or null if invalid
 */
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

/**
 * Converts RGB values to HEX color string.
 * @param {number} r - Red channel (0-255)
 * @param {number} g - Green channel (0-255)
 * @param {number} b - Blue channel (0-255)
 * @returns {string} HEX color string with # prefix, uppercase
 */
function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

/**
 * Converts RGB values with alpha to HEX8 color string (#RRGGBBAA).
 * @param {number} r - Red channel (0-255)
 * @param {number} g - Green channel (0-255)
 * @param {number} b - Blue channel (0-255)
 * @param {number} a - Alpha channel (0-1)
 * @returns {string} HEX8 color string with # prefix, uppercase
 */
function rgbToHex8(r, g, b, a) {
    const alpha = Math.round(a * 255);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase() +
           alpha.toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Converts RGB values to 3-digit HEX color string (#RGB) when possible.
 * Only returns shorthand if each channel pair is identical (e.g., #FF0033 → #F03).
 * Otherwise returns null to indicate 3-digit format is not available.
 * @param {number} r - Red channel (0-255)
 * @param {number} g - Green channel (0-255)
 * @param {number} b - Blue channel (0-255)
 * @returns {string|null} 3-digit HEX string with # prefix, or null if not representable
 */
function rgbToHex3(r, g, b) {
    // Round to nearest multiple of 17 (0x11) for 3-digit compatibility
    // 3-digit hex has 4 bits per channel: 0, 17, 34, 51, ..., 255
    const r3 = Math.round(r / 17) * 17;
    const g3 = Math.round(g / 17) * 17;
    const b3 = Math.round(b / 17) * 17;

    // Check if the rounded values match the original (within tolerance)
    // This ensures we only use 3-digit when it's a true representation
    const rDiff = Math.abs(r - r3);
    const gDiff = Math.abs(g - g3);
    const bDiff = Math.abs(b - b3);

    // If the difference is too much (more than 8), don't use shorthand
    if (rDiff > 8 || gDiff > 8 || bDiff > 8) {
        return null;
    }

    // Convert to 3-digit hex
    const rHex = (r3 / 17).toString(16).toUpperCase();
    const gHex = (g3 / 17).toString(16).toUpperCase();
    const bHex = (b3 / 17).toString(16).toUpperCase();

    return `#${rHex}${gHex}${bHex}`;
}

/**
 * Converts RGB values to HSL object.
 * @param {number} r - Red channel (0-255)
 * @param {number} g - Green channel (0-255)
 * @param {number} b - Blue channel (0-255)
 * @returns {{h: number, s: number, l: number}} HSL object with h in degrees, s/l as percentages
 */
function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0;
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100)
    };
}

/**
 * Converts RGB values to CMYK object (approximate for screen-to-print).
 * Note: This is a mathematical approximation and does not account for ICC profiles.
 * @param {number} r - Red channel (0-255)
 * @param {number} g - Green channel (0-255)
 * @param {number} b - Blue channel (0-255)
 * @returns {{c: number, m: number, y: number, k: number}} CMYK object with values 0-100
 */
function rgbToCmyk(r, g, b) {
    let c = 1 - (r / 255);
    let m = 1 - (g / 255);
    let y = 1 - (b / 255);
    let k = Math.min(c, Math.min(m, y));

    if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };

    c = (c - k) / (1 - k);
    m = (m - k) / (1 - k);
    y = (y - k) / (1 - k);

    return {
        c: Math.round(c * 100),
        m: Math.round(m * 100),
        y: Math.round(y * 100),
        k: Math.round(k * 100)
    };
}

// ============================================
// Sidebar Features
// ============================================

/**
 * Updates the visual scale markers for the alpha slider.
 * Highlights the marker closest to the current alpha value.
 * @param {number} alpha - Alpha percentage (0-100)
 */
function updateAlphaScaleMarkers(alpha) {
    const scaleMarks = document.querySelectorAll('.alpha-slider-scale .scale-mark');
    if (scaleMarks.length === 0) return;

    // Find the marker values from data attributes
    const markers = Array.from(scaleMarks).map(mark => ({
        element: mark,
        value: parseInt(mark.getAttribute('data-value'), 10)
    }));

    // Find the closest marker to the current alpha value
    let closest = markers[0];
    let minDiff = Math.abs(alpha - closest.value);

    for (const marker of markers) {
        const diff = Math.abs(alpha - marker.value);
        if (diff < minDiff) {
            minDiff = diff;
            closest = marker;
        }
    }

    // Remove active class from all markers
    markers.forEach(m => m.element.classList.remove('active'));

    // Add active class to the closest marker
    if (minDiff <= 12.5) { // Only highlight if reasonably close (within 1/8 of range)
        closest.element.classList.add('active');
    }
}

function updateContrast(r, g, b, alpha = 1) {
    const badgeWhite = document.getElementById('badgeWhite');
    const demoWhite = document.getElementById('contrastWhite');
    const badgeBlack = document.getElementById('badgeBlack');
    const demoBlack = document.getElementById('contrastBlack');

    // Guard: Skip if sidebar elements don't exist
    if (!badgeWhite || !demoWhite || !badgeBlack || !demoBlack) return;

    // Luminance formula (WCAG 2.0)
    const lum = (c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };

    // Get configured background color
    const bgR = state.contrastBg.r;
    const bgG = state.contrastBg.g;
    const bgB = state.contrastBg.b;

    // If alpha < 1, blend foreground color with configured background
    let finalR, finalG, finalB;
    if (alpha < 1) {
        finalR = Math.round(r * alpha + bgR * (1 - alpha));
        finalG = Math.round(g * alpha + bgG * (1 - alpha));
        finalB = Math.round(b * alpha + bgB * (1 - alpha));
    } else {
        finalR = r;
        finalG = g;
        finalB = b;
    }

    // Calculate luminance for foreground and background
    const Lfg = 0.2126 * lum(finalR) + 0.7152 * lum(finalG) + 0.0722 * lum(finalB);
    const Lbg = 0.2126 * lum(bgR) + 0.7152 * lum(bgG) + 0.0722 * lum(bgB);

    // Contrast ratio formula: (Lmax + 0.05) / (Lmin + 0.05)
    const lighter = Math.max(Lfg, Lbg);
    const darker = Math.min(Lfg, Lbg);
    const contrastRatio = (lighter + 0.05) / (darker + 0.05);

    // Set demo backgrounds to show the selected background color with foreground color overlay
    demoWhite.style.backgroundColor = `rgb(${bgR}, ${bgG}, ${bgB})`;
    demoBlack.style.backgroundColor = `rgb(${bgR}, ${bgG}, ${bgB})`;

    // Set text color for demos
    demoWhite.style.color = alpha < 1 ? `rgba(${r},${g},${b},${formatAlpha(alpha)})` : `rgb(${r},${g},${b})`;
    demoBlack.style.color = alpha < 1 ? `rgba(${r},${g},${b},${formatAlpha(alpha)})` : `rgb(${r},${g},${b})`;

    // Update badge text with background indicator
    const bgLabel = (bgR === 255 && bgG === 255 && bgB === 255) ? '' :
                    (bgR === 18 && bgG === 18 && bgB === 18) ? ' (dark)' :
                    ' (custom)';

    // WCAG AAA (7:1) is the highest standard, AA (4.5:1) is standard
    if (contrastRatio >= 7.0) {
        badgeWhite.textContent = `AAA ${contrastRatio.toFixed(1)}${bgLabel}`;
        badgeWhite.className = 'contrast-badge aaa';
    } else if (contrastRatio >= 4.5) {
        badgeWhite.textContent = `AA ${contrastRatio.toFixed(1)}${bgLabel}`;
        badgeWhite.className = 'contrast-badge pass';
    } else {
        badgeWhite.textContent = `FAIL ${contrastRatio.toFixed(1)}${bgLabel}`;
        badgeWhite.className = 'contrast-badge fail';
    }

    // Both badges show the same contrast ratio (just with different labels)
    badgeBlack.textContent = badgeWhite.textContent;
    badgeBlack.className = badgeWhite.className;
}

function updateVariations(r, g, b, alpha = 1) {
    const tints = document.getElementById('tintsContainer');
    const shades = document.getElementById('shadesContainer');

    // Guard: Skip if palette containers don't exist
    if (!tints || !shades) return;

    tints.innerHTML = '';
    shades.innerHTML = '';

    const useRgba = alpha < 1;
    const alphaStr = formatAlpha(alpha);

    // Generate 5 steps
    for (let i = 1; i <= 5; i++) {
        // Tint: Mix with white
        const factor = i * 0.15;
        const tr = Math.round(r + (255 - r) * factor);
        const tg = Math.round(g + (255 - g) * factor);
        const tb = Math.round(b + (255 - b) * factor);
        const tDiv = document.createElement('div');
        tDiv.className = 'palette-block';
        if (useRgba) {
            tDiv.style.backgroundColor = `rgba(${tr},${tg},${tb},${alphaStr})`;
        } else {
            tDiv.style.backgroundColor = `rgb(${tr},${tg},${tb})`;
        }
        tDiv.title = rgbToHex(tr, tg, tb);
        tDiv.setAttribute('tabindex', '0');
        tDiv.setAttribute('role', 'button');
        tDiv.setAttribute('aria-label', `Tint: ${rgbToHex(tr, tg, tb)}`);
        tDiv.onclick = () => updateFromHex(rgbToHex(tr, tg, tb), { preserveAlpha: true });
        tDiv.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                updateFromHex(rgbToHex(tr, tg, tb), { preserveAlpha: true });
            }
        };
        tints.appendChild(tDiv);

        // Shade: Mix with black
        const sr = Math.round(r * (1 - factor));
        const sg = Math.round(g * (1 - factor));
        const sb = Math.round(b * (1 - factor));
        const sDiv = document.createElement('div');
        sDiv.className = 'palette-block';
        if (useRgba) {
            sDiv.style.backgroundColor = `rgba(${sr},${sg},${sb},${alphaStr})`;
        } else {
            sDiv.style.backgroundColor = `rgb(${sr},${sg},${sb})`;
        }
        sDiv.title = rgbToHex(sr, sg, sb);
        sDiv.setAttribute('tabindex', '0');
        sDiv.setAttribute('role', 'button');
        sDiv.setAttribute('aria-label', `Shade: ${rgbToHex(sr, sg, sb)}`);
        sDiv.onclick = () => updateFromHex(rgbToHex(sr, sg, sb), { preserveAlpha: true });
        sDiv.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                updateFromHex(rgbToHex(sr, sg, sb), { preserveAlpha: true });
            }
        };
        shades.appendChild(sDiv);
    }
}

// ============================================
// Copy to Clipboard
// ============================================

/**
 * Handles copy to clipboard using shared Clipboard utility.
 * Provides enhanced accessibility feedback (aria-label, screen reader announcements).
 * @param {string} id - ID of element containing text to copy
 * @param {HTMLElement} button - Copy button element for feedback
 */
async function handleCopy(id, button) {
    const textElement = document.getElementById(id);
    if (!textElement) {
        console.warn(`handleCopy: Element with id "${id}" not found`);
        return;
    }
    const text = textElement.textContent;

    // Use shared Clipboard utility for actual copy operation
    const success = await window.ToolsHub?.Clipboard?.copy(text);
    if (success) {
        showCopyFeedback(button);
    }
}

/**
 * Shows visual and accessibility feedback after successful copy.
 * Preserves original button state after 1 second.
 * @param {HTMLElement} button - Copy button element to update
 */
function showCopyFeedback(button) {
    const original = button.innerHTML;
    const originalLabel = button.getAttribute('aria-label');
    const announcer = document.getElementById('copyAnnouncer');

    // Change to checkmark icon
    button.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';

    // Announce to screen readers via aria-label (immediate)
    button.setAttribute('aria-label', 'Copied!');

    // Also announce via live region (clears previous, then announces)
    if (announcer) {
        announcer.textContent = '';
        setTimeout(() => {
            announcer.textContent = 'Copied to clipboard';
        }, 50);
    }

    // Restore original state after 1 second
    setTimeout(() => {
        button.innerHTML = original;
        button.setAttribute('aria-label', originalLabel);
        if (announcer) announcer.textContent = '';
    }, 1000);
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
