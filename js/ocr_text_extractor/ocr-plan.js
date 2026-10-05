// OCR Text Extractor: limits, sizing and text assembly. Pure, no imports, no DOM.

export const LIMITS = Object.freeze({
    maxPages: 25,
    maxBytes: 50 * 1024 * 1024,
    targetDpi: 300,
    // iOS Safari refuses a canvas near 16.7 megapixels.
    maxPixels: 12_000_000,
    maxImageSide: 4000,
    textPageMinChars: 20,
    lowConfidence: 60,
    weakPage: 70,
    // A page read with less confidence than this is read again upside down,
    // and that reading is kept when it is better by the margin.
    flipBelow: 50,
    flipMargin: 15,
    // and is itself a fair reading, so that nonsense is not said to be turned.
    flipKeepAt: 60,
    // Doubted words shown with their pixels, across the whole run.
    maxReviewWords: 200,
    // An image carries no physical size, so its PDF page assumes this.
    imagePageDpi: 300
});

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);

export class OcrError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'OcrError';
        this.code = code;
    }
}

export function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Returns 'pdf' or 'image', or throws an OcrError naming the limit.
export function checkFile(file, limits = LIMITS) {
    const name = String(file.name || '');
    const type = String(file.type || '').toLowerCase();
    const dot = name.lastIndexOf('.');
    const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
    if (!(file.size > 0)) {
        throw new OcrError('EMPTY_FILE', 'That file is empty.');
    }
    if (file.size > limits.maxBytes) {
        throw new OcrError('FILE_TOO_LARGE',
            `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(limits.maxBytes)}.`);
    }
    if (type === 'application/pdf' || (!type && ext === 'pdf')) return 'pdf';
    if (IMAGE_TYPES.has(type) || (!type && IMAGE_EXTENSIONS.has(ext))) return 'image';
    throw new OcrError('UNSUPPORTED_TYPE',
        'That file is not a PDF, PNG, JPEG or WebP image.');
}

export function checkPageCount(count, limits = LIMITS) {
    if (!(count >= 1)) {
        throw new OcrError('NO_PAGES', 'That PDF has no pages.');
    }
    if (count > limits.maxPages) {
        throw new OcrError('TOO_MANY_PAGES',
            `That PDF has ${count} pages. The limit is ${limits.maxPages}, and no part of it was read.`);
    }
    return count;
}

// Scale from PDF points to canvas pixels: the target DPI, lowered until the
// canvas fits under the pixel cap.
export function renderScale(widthPt, heightPt, limits = LIMITS) {
    if (!(widthPt > 0) || !(heightPt > 0)) {
        throw new OcrError('BAD_PAGE_SIZE', 'A page in that PDF has no size.');
    }
    const wanted = limits.targetDpi / 72;
    const capped = Math.sqrt(limits.maxPixels / (widthPt * heightPt));
    const scale = Math.min(wanted, capped);
    return { scale, dpi: scale * 72, reduced: capped < wanted };
}

// Scale for an image whose longest side is over the limit. Never above 1.
export function fitImage(width, height, limits = LIMITS) {
    if (!(width > 0) || !(height > 0)) {
        throw new OcrError('BAD_IMAGE_SIZE', 'That image has no size.');
    }
    const scale = Math.min(1, limits.maxImageSide / Math.max(width, height));
    return {
        scale,
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
        reduced: scale < 1
    };
}

export function countVisibleChars(text) {
    return String(text || '').replace(/\s/g, '').length;
}

// A PDF page with this much text of its own is read from the file, not OCR'd.
export function isTextPage(text, limits = LIMITS) {
    return countVisibleChars(text) >= limits.textPageMinChars;
}

export function countWords(text) {
    const words = String(text || '').trim().split(/\s+/);
    return words[0] === '' ? 0 : words.length;
}

export function lowConfidenceWords(words, limits = LIMITS) {
    return (words || []).filter((word) => word.confidence < limits.lowConfidence);
}

// A page that read as nonsense may be upside down. Three words, so that a
// blank page or a stray mark is not read twice.
export function shouldRetryFlipped(reading, limits = LIMITS) {
    return reading.confidence < limits.flipBelow && reading.words.length >= 3;
}

export function betterReading(first, second, limits = LIMITS) {
    return second.confidence >= limits.flipKeepAt && second.confidence >= first.confidence + limits.flipMargin;
}

// What was done to a page before it was read, as it is shown in the page's row.
export function describeRepairs(repairs) {
    let text = '';
    if (repairs.evened) text += ', lighting evened';
    if (repairs.turnDegrees) text += `, turned ${Math.abs(repairs.turnDegrees)} degrees`;
    if (repairs.flipped) text += ', turned the right way up';
    if (repairs.enlarged > 1) text += `, enlarged ${repairs.enlarged}x`;
    return text;
}

// Shown rounded down, so a page under a limit never displays as on it.
export function showConfidence(confidence) {
    return String(Math.floor(confidence));
}

export function totalWords(pages, limits = LIMITS) {
    return pages.reduce((sum, page) => sum + summarizePage(page, limits).words, 0);
}

// Pages read side by side. Each worker holds the engine, the language model
// and a page of pixels, so memory decides as much as cores do, and a phone
// gets one. Eight dense pages took 56 s with one worker and 17 s with four.
export function workerCount({ cores, memoryGb, pages, coarsePointer }) {
    if (coarsePointer) return 1;
    const byCores = Math.floor((cores || 2) / 2);
    // Browsers that do not report memory get the cautious middle.
    const byMemory = memoryGb >= 8 ? 4 : memoryGb >= 4 ? 2 : memoryGb > 0 ? 1 : 2;
    return Math.max(1, Math.min(4, byCores, byMemory, pages || 1));
}

// How many of a page's doubted words still fit in the list, and how many do not.
export function takeReview(listed, doubted, limits = LIMITS) {
    const take = Math.max(0, Math.min(doubted, limits.maxReviewWords - listed));
    return { take, hidden: doubted - take };
}

// How many crops a page may still add: the cap less what earlier pages hold.
export function reviewRoom(pages, number, limits = LIMITS) {
    const listed = pages.reduce((sum, page) => sum + (page.number < number ? (page.review || []).length : 0), 0);
    return Math.max(0, limits.maxReviewWords - listed);
}

// One row per page for the table. `source` is 'image' (OCR) or 'file'.
export function summarizePage(page, limits = LIMITS) {
    const fromImage = page.source === 'image';
    return {
        number: page.number,
        source: page.source,
        words: fromImage ? (page.words || []).length : countWords(page.text),
        confidence: fromImage ? page.confidence : null,
        // A page read by the second engine brings its own counts, on its own scale.
        lowCount: fromImage ? (page.doubted ?? lowConfidenceWords(page.words, limits).length) : 0,
        weak: fromImage && (page.weak ?? page.confidence < limits.weakPage),
        empty: countVisibleChars(page.text) === 0
    };
}

export function assembleText(pages, options = {}) {
    const separators = options.separators !== false && pages.length > 1;
    return pages.map((page) => {
        const body = String(page.text || '').replace(/\s+$/, '');
        return separators ? `--- Page ${page.number} ---\n${body}` : body;
    }).join('\n\n');
}

// The source name without its extension. Only characters a file system
// refuses are replaced, so a name in any script survives.
export function textFileName(sourceName) {
    const base = String(sourceName || '').replace(/\.[^.\\/]+$/, '')
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 120);
    return `${base || 'ocr-text'}.txt`;
}

export function pdfFileName(sourceName) {
    return textFileName(sourceName).replace(/\.txt$/, '-searchable.pdf');
}

export function imagePageSize(widthPx, heightPx, limits = LIMITS) {
    const points = 72 / limits.imagePageDpi;
    return { width: widthPx * points, height: heightPx * points };
}

// PDF matrices are [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f.
// The result applies `first`, then `second`.
function compose(second, first) {
    const [a1, b1, c1, d1, e1, f1] = first;
    const [a2, b2, c2, d2, e2, f2] = second;
    return [
        a2 * a1 + c2 * b1, b2 * a1 + d2 * b1,
        a2 * c1 + c2 * d1, b2 * c1 + d2 * d1,
        a2 * e1 + c2 * f1 + e2, b2 * e1 + d2 * f1 + f2
    ];
}

// Where the engine's text-only page goes on the page it was read from.
// `box` is the visible page box in user space and `rotation` the page's own
// /Rotate, which the viewer applies clockwise after this is drawn. The text
// page is stretched to the box, never placed at its own size: the engine
// assumes 70 DPI for an image carrying none. `skewRadians` is the angle the
// engine turned the image by before reading it, undone here about the center.
// `frame` is how much larger than the page the image that was read is, when
// the page was turned on a larger canvas first; the two share a center.
export function overlayMatrix({ box, rotation = 0, textWidth, textHeight, skewRadians = 0, frame = { x: 1, y: 1 } }) {
    if (!(textWidth > 0) || !(textHeight > 0) || !(box.width > 0) || !(box.height > 0)) {
        throw new OcrError('BAD_OVERLAY', 'A page has no size to place its text on.');
    }
    const turn = ((Math.round(rotation / 90) * 90) % 360 + 360) % 360;
    const x1 = box.x + box.width;
    const y1 = box.y + box.height;
    // From the unit square of the page as displayed into user space.
    const place = {
        0: [box.width, 0, 0, box.height, box.x, box.y],
        90: [0, box.height, -box.width, 0, x1, box.y],
        180: [-box.width, 0, 0, -box.height, x1, y1],
        270: [0, -box.height, box.width, 0, box.x, y1]
    }[turn];
    const sideways = turn === 90 || turn === 270;
    const unit = [frame.x / textWidth, 0, 0, frame.y / textHeight, (1 - frame.x) / 2, (1 - frame.y) / 2];
    const cos = Math.cos(skewRadians);
    const sin = Math.sin(skewRadians);
    const cx = textWidth / 2;
    const cy = textHeight / 2;
    const unskew = [cos, sin, -sin, cos, cx - cos * cx + sin * cy, cy - sin * cx - cos * cy];
    return { matrix: compose(place, compose(unit, unskew)), turn, sideways };
}

// EXIF orientation of a JPEG, 1 to 8, or 1 when it has none. pdf-lib embeds
// the stored pixels as they are, so anything but 1 has to be redrawn upright.
export function jpegOrientation(bytes) {
    if (!bytes || bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return 1;
    let at = 2;
    while (at + 4 <= bytes.length && bytes[at] === 0xFF) {
        const marker = bytes[at + 1];
        const length = (bytes[at + 2] << 8) | bytes[at + 3];
        // Start of scan: no metadata comes after it.
        if (marker === 0xDA || length < 2) return 1;
        if (marker === 0xE1 && length >= 16 &&
            String.fromCharCode(...bytes.subarray(at + 4, at + 10)) === 'Exif  ') {
            const tiff = at + 10;
            const end = Math.min(bytes.length, at + 2 + length);
            const little = bytes[tiff] === 0x49;
            const u16 = (i) => (little ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1]);
            const u32 = (i) => (little
                ? bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)
                : (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
            const ifd = tiff + u32(tiff + 4);
            if (ifd + 2 > end) return 1;
            const count = u16(ifd);
            for (let i = 0; i < count; i++) {
                const entry = ifd + 2 + i * 12;
                if (entry + 12 > end) return 1;
                if (u16(entry) === 0x0112) {
                    const value = u16(entry + 8);
                    return value >= 1 && value <= 8 ? value : 1;
                }
            }
            return 1;
        }
        at += 2 + length;
    }
    return 1;
}

// Edit distance over the reference length, with runs of whitespace as one space.
export function characterErrorRate(reference, hypothesis) {
    const squash = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const ref = squash(reference);
    const hyp = squash(hypothesis);
    if (ref.length === 0) return hyp.length === 0 ? 0 : 1;
    let previous = Array.from({ length: hyp.length + 1 }, (_, i) => i);
    for (let i = 1; i <= ref.length; i++) {
        const current = [i];
        for (let j = 1; j <= hyp.length; j++) {
            const substitution = previous[j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1);
            current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
        }
        previous = current;
    }
    return previous[hyp.length] / ref.length;
}
