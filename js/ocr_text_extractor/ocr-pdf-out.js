// OCR Text Extractor: the searchable PDF. The original page is kept as it is
// and the engine's invisible text is laid over it with the vendored pdf-lib.

import { OcrError, overlayMatrix, imagePageSize, jpegOrientation, fitImage } from './ocr-plan.js';
import { textLinePlacement } from './ocr-second-plan.js';
import { openPdf } from './ocr-pdf-in.js';

const PDFLIB_URL = new URL('../vendor/ocr_text_extractor/pdf-lib.esm.min.js', import.meta.url).href;

let libPromise = null;

function loadPdfLib() {
    if (!libPromise) {
        libPromise = import(PDFLIB_URL);
        libPromise.catch(() => { libPromise = null; });
    }
    return libPromise;
}

function intersect(a, b) {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    const width = Math.min(a.x + a.width, b.x + b.width) - x;
    const height = Math.min(a.y + a.height, b.y + b.height) - y;
    return width > 0 && height > 0 ? { x, y, width, height } : a;
}

// A page of hidden text for a reading that came as lines with boxes, the size
// of the image it was read from. It is placed the same way as the first
// engine's own. A character the font lacks becomes a question mark.
async function linesAsTextPdf(lib, read) {
    const doc = await lib.PDFDocument.create();
    const font = await doc.embedFont(lib.StandardFonts.Helvetica);
    const page = doc.addPage([read.readWidth, read.readHeight]);
    const fontKey = page.node.newFontDictionary('OcrFont', font.ref);
    const known = new Set(font.getCharacterSet());
    const operators = [lib.beginText(), lib.setTextRenderingMode(lib.TextRenderingMode.Invisible)];
    for (const line of read.lines) {
        const text = Array.from(line.text, (char) => (known.has(char.codePointAt(0)) ? char : '?')).join('');
        const placement = textLinePlacement(line.box, read.readHeight, font.widthOfTextAtSize(text, 1));
        if (!placement) continue;
        operators.push(
            lib.setFontAndSize(fontKey, placement.size),
            lib.setTextMatrix(...placement.matrix),
            lib.showText(font.encodeText(text))
        );
    }
    operators.push(lib.endText());
    page.pushOperators(...operators);
    return doc.save();
}

// The hidden text of a page read from pixels, or null when it has none.
async function textPdfOf(lib, read) {
    if (read.source !== 'image' || !read.words.length) return null;
    if (read.textPdf) return read.textPdf;
    return read.lines && read.lines.length ? linesAsTextPdf(lib, read) : null;
}

async function drawTextLayer(lib, doc, page, textPdf, placement) {
    const [embedded] = await doc.embedPdf(textPdf);
    const { matrix } = overlayMatrix({ ...placement, textWidth: embedded.width, textHeight: embedded.height });
    const name = page.node.newXObject('OcrText', embedded.ref);
    page.pushOperators(
        lib.pushGraphicsState(),
        lib.concatTransformationMatrix(...matrix),
        lib.drawObject(name),
        lib.popGraphicsState()
    );
}

// Pages read from pixels get a text layer; every other page is left untouched.
export async function pdfWithText(sourceBytes, pages) {
    const lib = await loadPdfLib();
    let doc;
    try {
        doc = await lib.PDFDocument.load(sourceBytes);
    } catch (error) {
        throw new OcrError('PDF_REWRITE', 'This PDF could not be rewritten with a text layer. The text above is not affected.');
    }
    const docPages = doc.getPages();
    let layered = 0;
    for (const read of pages) {
        const textPdf = await textPdfOf(lib, read);
        const page = docPages[read.number - 1];
        if (!textPdf || !page) continue;
        // A page's own drawing can leave its coordinate change in force. pdf-lib
        // closes it off when it first adds to a loaded page, and a spec holds it to that.
        // pdf.js drew the crop box clipped to the media box, turned by /Rotate.
        const box = intersect(page.getCropBox(), page.getMediaBox());
        await drawTextLayer(lib, doc, page, textPdf, {
            box,
            rotation: page.getRotation().angle,
            skewRadians: read.skew,
            frame: read.frame
        });
        layered++;
    }
    return { bytes: await doc.save(), layered, pageCount: docPages.length };
}

async function uprightJpeg(file) {
    const bitmap = await createImageBitmap(file);
    const fit = fitImage(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = fit.width;
    canvas.height = fit.height;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, fit.width, fit.height);
    context.drawImage(bitmap, 0, 0, fit.width, fit.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    canvas.width = 0;
    if (!blob) throw new OcrError('PDF_IMAGE', 'The image could not be put into a PDF.');
    return new Uint8Array(await blob.arrayBuffer());
}

// One page the size of the image, holding the image and its text layer.
export async function imageAsPdf(file, read) {
    const lib = await loadPdfLib();
    const doc = await lib.PDFDocument.create();
    const original = new Uint8Array(await file.arrayBuffer());
    const type = String(file.type || '').toLowerCase();
    let image = null;
    try {
        // The stored bytes go in untouched when they are already upright.
        if (type === 'image/png') image = await doc.embedPng(original);
        else if (type === 'image/jpeg' && jpegOrientation(original) === 1) image = await doc.embedJpg(original);
    } catch (error) {
        image = null;
    }
    if (!image) image = await doc.embedJpg(await uprightJpeg(file));

    const size = imagePageSize(image.width, image.height);
    const page = doc.addPage([size.width, size.height]);
    page.drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });
    let layered = 0;
    const textPdf = await textPdfOf(lib, read);
    if (textPdf) {
        await drawTextLayer(lib, doc, page, textPdf, {
            box: { x: 0, y: 0, width: size.width, height: size.height },
            rotation: 0,
            skewRadians: read.skew,
            frame: read.frame
        });
        layered = 1;
    }
    return { bytes: await doc.save(), layered, pageCount: 1 };
}

// Reopens the result before it is offered. pdf.js takes the buffer it is
// given, so it gets a copy.
export async function checkPdf(bytes, pageCount) {
    let opened;
    try {
        opened = await openPdf(bytes.slice());
    } catch (error) {
        throw new OcrError('PDF_CHECK', 'The PDF that was built did not open again, so it was not saved.');
    }
    const count = opened.pageCount;
    opened.destroy();
    if (count !== pageCount) {
        throw new OcrError('PDF_CHECK', `The PDF that was built has ${count} pages where ${pageCount} were expected, so it was not saved.`);
    }
}
