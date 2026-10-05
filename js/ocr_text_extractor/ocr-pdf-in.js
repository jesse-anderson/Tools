// OCR Text Extractor: PDF input through the vendored pdf.js. Loaded on first use.

import { OcrError, renderScale } from './ocr-plan.js';

const PDFJS_URL = new URL('../vendor/ocr_text_extractor/pdf.min.mjs', import.meta.url).href;
const PDFJS_WORKER_URL = new URL('../vendor/ocr_text_extractor/pdf.worker.min.mjs', import.meta.url).href;

let pdfjsPromise = null;

function loadPdfjs() {
    if (!pdfjsPromise) {
        pdfjsPromise = import(PDFJS_URL).then((pdfjs) => {
            pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
            return pdfjs;
        });
        pdfjsPromise.catch(() => { pdfjsPromise = null; });
    }
    return pdfjsPromise;
}

// pdf.js marks the end of a line on the item that closes it.
function textFromContent(content) {
    return content.items.map((item) => (item.str || '') + (item.hasEOL ? '\n' : '')).join('');
}

export async function openPdf(bytes) {
    const pdfjs = await loadPdfjs();
    let doc;
    try {
        // pdf.js builds functions from font data when this is on, which is how
        // a crafted PDF ran script in versions before 4.2.67. Off, always.
        doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
    } catch (error) {
        if (error && error.name === 'PasswordException') {
            throw new OcrError('ENCRYPTED', 'That PDF is password protected and cannot be opened here.');
        }
        throw new OcrError('BAD_PDF', 'That file could not be opened as a PDF.');
    }

    return {
        pageCount: doc.numPages,

        async pageText(number) {
            const page = await doc.getPage(number);
            return textFromContent(await page.getTextContent());
        },

        // The caller owns the canvas and releases it by zeroing its width.
        async renderPage(number) {
            const page = await doc.getPage(number);
            const base = page.getViewport({ scale: 1 });
            const fit = renderScale(base.width, base.height);
            const viewport = page.getViewport({ scale: fit.scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.floor(viewport.width));
            canvas.height = Math.max(1, Math.floor(viewport.height));
            const context = canvas.getContext('2d');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({ canvasContext: context, viewport }).promise;
            page.cleanup();
            return { canvas, dpi: fit.dpi, reduced: fit.reduced };
        },

        destroy() {
            return doc.destroy();
        }
    };
}
