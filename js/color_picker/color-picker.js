// ============================================
// Color Picker & Converter
// ============================================

const state = {
    r: 59,
    g: 130,
    b: 246
};

// DOM Elements
const nativePicker = document.getElementById('nativePicker');
const mainSwatch = document.getElementById('mainSwatch');
const hexInput = document.getElementById('hexInput');
const sliders = {
    r: document.getElementById('rSlider'),
    g: document.getElementById('gSlider'),
    b: document.getElementById('bSlider')
};
const inputs = {
    r: document.getElementById('rInput'),
    g: document.getElementById('gInput'),
    b: document.getElementById('bInput')
};
const outputs = {
    rgb: document.getElementById('rgbString'),
    hsl: document.getElementById('hslString'),
    cmyk: document.getElementById('cmykString'),
    css: document.getElementById('cssString')
};

// ============================================
// Initialization
// ============================================

function init() {
    bindNativePicker();
    bindHexInput();
    bindSlidersAndInputs();
    bindCopyButtons();

    // Initial draw
    updateUIFromState();
}

function bindNativePicker() {
    nativePicker.addEventListener('input', (e) => {
        const hex = e.target.value;
        // When user uses the native picker, we DO want to update the HEX input
        updateFromHex(hex, { skipHexUpdate: false });
    });
}

function bindHexInput() {
    hexInput.addEventListener('input', (e) => {
        const el = e.target;
        const raw = el.value;

        // Keep only hex digits and cap at 6
        let hex = raw.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
        if (hex.length > 6) hex = hex.slice(0, 6);

        // Write back only if changed
        if (hex !== raw) {
            const pos = el.selectionStart;
            el.value = hex;
            if (typeof pos === 'number') el.setSelectionRange(pos, pos);
        }

        if (hex.length === 6) {
            updateFromHex('#' + hex, { skipHexUpdate: true });
        }
    });

    // On blur, normalize hex to uppercase to keep it clean
    hexInput.addEventListener('blur', () => {
        const hex = rgbToHex(state.r, state.g, state.b);
        hexInput.value = hex.substring(1).toUpperCase();
    });

    hexInput.addEventListener('paste', (e) => {
        const pasted = (e.clipboardData || window.clipboardData).getData('text') || '';
        const m = pasted.match(/#?([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})/);
        if (!m) return;

        e.preventDefault();

        let hex = m[1];
        if (hex.length === 3) {
            hex = hex.split('').map(ch => ch + ch).join(''); // expand RGB -> RRGGBB
        }

        hex = hex.toUpperCase();
        hexInput.value = hex;
        updateFromHex('#' + hex, { skipHexUpdate: true });
    });
}

function bindSlidersAndInputs() {
    ['r', 'g', 'b'].forEach((key) => {
        sliders[key].addEventListener('input', (e) => {
            state[key] = parseInt(e.target.value, 10);
            updateUIFromState();
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
            updateUIFromState();
        });

        // On blur, if empty, snap to current state value
        inputs[key].addEventListener('blur', (e) => {
            if (e.target.value === '') {
                e.target.value = state[key];
            }
        });
    });
}

function bindCopyButtons() {
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            // Find the format-value span and get its text content
            const formatValue = btn.parentElement.querySelector('.format-value span');
            if (formatValue) {
                copyText(formatValue.id, btn);
            }
        });
    });
}

// ============================================
// State Management & Updates
// ============================================

function updateFromHex(hex, { skipHexUpdate = false } = {}) {
    const rgb = hexToRgb(hex);
    if (!rgb) return;

    state.r = rgb.r;
    state.g = rgb.g;
    state.b = rgb.b;

    // Only skip HEX updates when the SOURCE is the hex input typing case
    updateUIFromState(skipHexUpdate);
}

function updateUIFromState(skipHexUpdate = false) {
    const { r, g, b } = state;
    const hex = rgbToHex(r, g, b);
    const hsl = rgbToHsl(r, g, b);
    const cmyk = rgbToCmyk(r, g, b);

    // Update Swatch + Native Picker
    mainSwatch.style.backgroundColor = `rgb(${r},${g},${b})`;
    nativePicker.value = hex;

    // Update Hex Input
    if (!skipHexUpdate) {
        hexInput.value = hex.substring(1).toUpperCase();
    }

    // Update Sliders/Inputs
    ['r', 'g', 'b'].forEach((key) => {
        sliders[key].value = state[key];
        inputs[key].value = state[key];
    });

    // Update Output Text
    outputs.rgb.textContent = `rgb(${r}, ${g}, ${b})`;
    outputs.hsl.textContent = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
    outputs.cmyk.textContent = `${cmyk.c}, ${cmyk.m}, ${cmyk.y}, ${cmyk.k}`;
    outputs.css.textContent = `--color-primary: ${hex};`;

    // Update Sidebar
    updateContrast(r, g, b);
    updateVariations(r, g, b);
}

// ============================================
// Color Conversion Functions
// ============================================

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

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

function updateContrast(r, g, b) {
    // Luminance formula (WCAG 2.0)
    const lum = (c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const L = 0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b);

    // White text (L=1)
    const ratioWhite = (1 + 0.05) / (L + 0.05);
    // Black text (L=0)
    const ratioBlack = (L + 0.05) / (0 + 0.05);

    const badgeWhite = document.getElementById('badgeWhite');
    const demoWhite = document.getElementById('contrastWhite');
    const badgeBlack = document.getElementById('badgeBlack');
    const demoBlack = document.getElementById('contrastBlack');

    demoWhite.style.backgroundColor = `rgb(${r},${g},${b})`;
    demoBlack.style.backgroundColor = `rgb(${r},${g},${b})`;

    // WCAG AA threshold is 4.5:1
    if (ratioWhite >= 4.5) {
        badgeWhite.textContent = 'PASS ' + ratioWhite.toFixed(1);
        badgeWhite.className = 'contrast-badge pass';
    } else {
        badgeWhite.textContent = 'FAIL ' + ratioWhite.toFixed(1);
        badgeWhite.className = 'contrast-badge fail';
    }

    if (ratioBlack >= 4.5) {
        badgeBlack.textContent = 'PASS ' + ratioBlack.toFixed(1);
        badgeBlack.className = 'contrast-badge pass';
    } else {
        badgeBlack.textContent = 'FAIL ' + ratioBlack.toFixed(1);
        badgeBlack.className = 'contrast-badge fail';
    }
}

function updateVariations(r, g, b) {
    const tints = document.getElementById('tintsContainer');
    const shades = document.getElementById('shadesContainer');
    tints.innerHTML = '';
    shades.innerHTML = '';

    // Generate 5 steps
    for (let i = 1; i <= 5; i++) {
        // Tint: Mix with white
        const factor = i * 0.15;
        const tr = Math.round(r + (255 - r) * factor);
        const tg = Math.round(g + (255 - g) * factor);
        const tb = Math.round(b + (255 - b) * factor);
        const tDiv = document.createElement('div');
        tDiv.className = 'palette-block';
        tDiv.style.backgroundColor = `rgb(${tr},${tg},${tb})`;
        tDiv.title = rgbToHex(tr, tg, tb);
        tDiv.onclick = () => updateFromHex(rgbToHex(tr, tg, tb));
        tints.appendChild(tDiv);

        // Shade: Mix with black
        const sr = Math.round(r * (1 - factor));
        const sg = Math.round(g * (1 - factor));
        const sb = Math.round(b * (1 - factor));
        const sDiv = document.createElement('div');
        sDiv.className = 'palette-block';
        sDiv.style.backgroundColor = `rgb(${sr},${sg},${sb})`;
        sDiv.title = rgbToHex(sr, sg, sb);
        sDiv.onclick = () => updateFromHex(rgbToHex(sr, sg, sb));
        shades.appendChild(sDiv);
    }
}

// ============================================
// Copy to Clipboard
// ============================================

function copyText(id, button) {
    const text = document.getElementById(id).textContent;

    const flashCheck = () => {
        const original = button.innerHTML;
        button.innerHTML =
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
        setTimeout(() => (button.innerHTML = original), 1000);
    };

    // Prefer modern clipboard API
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard
            .writeText(text)
            .then(flashCheck)
            .catch(() => {
                // Fallback for unexpected permission blocks
                fallbackCopy(text, flashCheck);
            });
    } else {
        // Fallback for file:// or non-HTTPS
        fallbackCopy(text, flashCheck);
    }
}

function fallbackCopy(text, onSuccess) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
        if (document.execCommand('copy')) {
            onSuccess();
        }
    } catch (e) {
        console.warn('Copy failed');
    } finally {
        document.body.removeChild(ta);
    }
}

// Start
init();
