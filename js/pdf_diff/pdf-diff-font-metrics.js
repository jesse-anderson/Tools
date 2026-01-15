// ============================================
// PDF Diff Checker - Font Metrics for Character Width Calculation
// ============================================

/**
 * Character width tables for common PDF fonts
 * Widths are relative to font size (multiply by fontSize for actual width)
 */

// Helvetica font metrics (proportional)
const HELVETICA_WIDTHS = {
    ' ': 0.28, '!': 0.28, '"': 0.39, '#': 0.56, '$': 0.56, '%': 0.89, '&': 0.67,
    0x27: 0.17, '(': 0.33, ')': 0.33, '*': 0.39, '+': 0.56, ',': 0.28, '-': 0.33,
    '.': 0.28, '/': 0.28,
    '0': 0.56, '1': 0.56, '2': 0.56, '3': 0.56, '4': 0.56,
    '5': 0.56, '6': 0.56, '7': 0.56, '8': 0.56, '9': 0.56,
    ':': 0.28, ';': 0.28,
    'A': 0.67, 'B': 0.67, 'C': 0.72, 'D': 0.72, 'E': 0.67, 'F': 0.61,
    'G': 0.78, 'H': 0.78, 'I': 0.28, 'J': 0.56, 'K': 0.67, 'L': 0.56,
    'M': 0.89, 'N': 0.78, 'O': 0.78, 'P': 0.67, 'Q': 0.78, 'R': 0.67,
    'S': 0.67, 'T': 0.61, 'U': 0.78, 'V': 0.72, 'W': 1.0, 'X': 0.67,
    'Y': 0.61, 'Z': 0.61,
    'a': 0.56, 'b': 0.61, 'c': 0.56, 'd': 0.61, 'e': 0.56, 'f': 0.33,
    'g': 0.61, 'h': 0.61, 'i': 0.24, 'j': 0.24, 'k': 0.56, 'l': 0.24,
    'm': 0.89, 'n': 0.61, 'o': 0.61, 'p': 0.61, 'q': 0.61, 'r': 0.39,
    's': 0.56, 't': 0.33, 'u': 0.61, 'v': 0.56, 'w': 0.78, 'x': 0.56,
    'y': 0.56, 'z': 0.5,
    0x40: 0.95, '[': 0.28, 0x5C: 0.28, ']': 0.28, '^': 0.46, '_': 0.56,
    0x60: 0.28, '{': 0.33, '|': 0.24, '}': 0.33, '~': 0.46
};

// Times font metrics (proportional, narrower than Helvetica)
const TIMES_WIDTHS = {
    ' ': 0.23, '!': 0.33, '"': 0.44, '#': 0.56, '$': 0.56, '%': 0.89, '&': 0.67,
    0x27: 0.22, '(': 0.33, ')': 0.33, '*': 0.39, '+': 0.58, ',': 0.25, '-': 0.33,
    '.': 0.25, '/': 0.28,
    '0': 0.56, '1': 0.56, '2': 0.56, '3': 0.56, '4': 0.56,
    '5': 0.56, '6': 0.56, '7': 0.56, '8': 0.56, '9': 0.56,
    ':': 0.25, ';': 0.25,
    'A': 0.67, 'B': 0.67, 'C': 0.72, 'D': 0.72, 'E': 0.67, 'F': 0.61,
    'G': 0.78, 'H': 0.78, 'I': 0.33, 'J': 0.56, 'K': 0.67, 'L': 0.56,
    'M': 0.89, 'N': 0.78, 'O': 0.78, 'P': 0.67, 'Q': 0.78, 'R': 0.67,
    'S': 0.67, 'T': 0.61, 'U': 0.78, 'V': 0.72, 'W': 0.94, 'X': 0.67,
    'Y': 0.61, 'Z': 0.61,
    'a': 0.44, 'b': 0.5, 'c': 0.44, 'd': 0.5, 'e': 0.44, 'f': 0.28,
    'g': 0.5, 'h': 0.5, 'i': 0.22, 'j': 0.22, 'k': 0.5, 'l': 0.22,
    'm': 0.78, 'n': 0.5, 'o': 0.5, 'p': 0.5, 'q': 0.5, 'r': 0.33,
    's': 0.44, 't': 0.28, 'u': 0.5, 'v': 0.44, 'w': 0.67, 'x': 0.44,
    'y': 0.44, 'z': 0.39,
    0x40: 0.9, '[': 0.28, 0x5C: 0.28, ']': 0.28, '^': 0.46, '_': 0.5,
    0x60: 0.28, '{': 0.33, '|': 0.22, '}': 0.33, '~': 0.46
};

// Courier font metrics (monospace - all chars same width)
const COURIER_WIDTHS = {};
const COURIER_CHAR_WIDTH = 0.6;
for (let i = 32; i < 127; i++) {
    COURIER_WIDTHS[String.fromCharCode(i)] = COURIER_CHAR_WIDTH;
}

// Arial font metrics (similar to Helvetica)
const ARIAL_WIDTHS = { ...HELVETICA_WIDTHS };

// Fallback average widths
const AVERAGE_WIDTHS = {
    uppercase: 0.67,
    lowercase: 0.56,
    digit: 0.56,
    other: 0.4
};

// Map special characters to their widths
const SPECIAL_CHARS = {
    0x27: 0.17, // single quote
    0x40: 0.95, // @
    0x5C: 0.28, // backslash
    0x60: 0.28  // backtick
};

// Add special characters to width tables
Object.assign(HELVETICA_WIDTHS, SPECIAL_CHARS);
Object.assign(TIMES_WIDTHS, SPECIAL_CHARS);

/**
 * Font name mapping
 */
const FONT_MAP = {
    'helvetica': HELVETICA_WIDTHS,
    'helv': HELVETICA_WIDTHS,
    'arial': ARIAL_WIDTHS,
    'times': TIMES_WIDTHS,
    'timesnewroman': TIMES_WIDTHS,
    'times-roman': TIMES_WIDTHS,
    'courier': COURIER_WIDTHS,
    'cour': COURIER_WIDTHS,
    'couriernew': COURIER_WIDTHS,
    'monospace': COURIER_WIDTHS
};

/**
 * Get character width table for a font name
 */
function getFontWidths(fontName) {
    if (!fontName) return HELVETICA_WIDTHS;

    const normalizedName = fontName.toLowerCase().replace(/[-_\s]/g, '');

    if (FONT_MAP[normalizedName]) {
        return FONT_MAP[normalizedName];
    }

    for (const [key, value] of Object.entries(FONT_MAP)) {
        if (normalizedName.includes(key)) {
            return value;
        }
    }

    return HELVETICA_WIDTHS;
}

/**
 * Calculate the width of a character
 */
function getCharWidth(char, fontName, fontSize = 1.0) {
    const widths = getFontWidths(fontName);
    let relativeWidth = widths[char];

    if (relativeWidth === undefined) {
        const code = char.charCodeAt(0);
        relativeWidth = widths[code];

        if (relativeWidth === undefined) {
            if (char >= 'A' && char <= 'Z') {
                relativeWidth = AVERAGE_WIDTHS.uppercase;
            } else if (char >= 'a' && char <= 'z') {
                relativeWidth = AVERAGE_WIDTHS.lowercase;
            } else if (char >= '0' && char <= '9') {
                relativeWidth = AVERAGE_WIDTHS.digit;
            } else {
                relativeWidth = AVERAGE_WIDTHS.other;
            }
        }
    }

    return relativeWidth * fontSize;
}

/**
 * Calculate character positions within a text item
 */
function calculateCharPositions(text, startX, totalWidth, fontName, fontSize) {
    const positions = [];
    let currentX = startX;

    let calculatedTotalWidth = 0;
    for (let i = 0; i < text.length; i++) {
        calculatedTotalWidth += getCharWidth(text[i], fontName, fontSize);
    }

    const calibrationFactor = calculatedTotalWidth > 0 ? totalWidth / calculatedTotalWidth : 1;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const charWidth = getCharWidth(char, fontName, fontSize) * calibrationFactor;

        positions.push({
            char: char,
            index: i,
            x: currentX,
            width: charWidth,
            xEnd: currentX + charWidth
        });

        currentX += charWidth;
    }

    return positions;
}

/**
 * Split a text item into character-level tokens
 */
function splitTextItemToChars(textItem) {
    const chars = [];
    const positions = calculateCharPositions(
        textItem.text,
        textItem.x,
        textItem.width,
        textItem.fontName || 'Helvetica',
        textItem.height
    );

    for (const pos of positions) {
        // Skip spaces
        if (/^\s$/.test(pos.char)) continue;

        chars.push({
            ...textItem,
            text: pos.char,
            x: pos.x,
            width: pos.width,
            charIndex: pos.index
        });
    }

    return chars;
}

export {
    HELVETICA_WIDTHS,
    TIMES_WIDTHS,
    COURIER_WIDTHS,
    getFontWidths,
    getCharWidth,
    calculateCharPositions,
    splitTextItemToChars
};
