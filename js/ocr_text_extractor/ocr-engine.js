// OCR Text Extractor: the Tesseract.js worker. Everything is loaded from
// js/vendor/ocr_text_extractor/ on first use, never from another origin.

import { OcrError } from './ocr-plan.js';

const VENDOR = '../vendor/ocr_text_extractor/';
const at = (file) => new URL(VENDOR + file, import.meta.url).href;

// The smallest module that uses a SIMD instruction, from wasm-feature-detect.
const SIMD_PROBE = new Uint8Array([
    0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
    10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11
]);

// False only when the browser says no. A refused probe counts as unknown.
export function hasWasmSimd() {
    try {
        return typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_PROBE);
    } catch (error) {
        return true;
    }
}

let libraryPromise = null;

function loadLibrary() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!libraryPromise) {
        libraryPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = at('tesseract.min.js');
            script.onload = () => resolve(window.Tesseract);
            script.onerror = () => reject(new Error('tesseract.min.js did not load'));
            document.head.appendChild(script);
        });
        libraryPromise.catch(() => { libraryPromise = null; });
    }
    return libraryPromise;
}

function flattenWords(blocks) {
    const words = [];
    for (const block of blocks || []) {
        for (const paragraph of block.paragraphs || []) {
            for (const line of paragraph.lines || []) {
                for (const word of line.words || []) {
                    words.push({ text: word.text, confidence: word.confidence, bbox: word.bbox });
                }
            }
        }
    }
    return words;
}

// onProgress gets (stage, fraction, key): stage is 'loading' or 'reading', and
// key is whatever was passed to recognize() for the page being read.
// Up to `size` workers run side by side; each is made when first needed.
export function createEngine(onProgress = () => {}) {
    let size = 1;
    let slots = [];
    let waiting = [];
    // Bumped by terminate(), so a worker still loading knows it is not wanted.
    let generation = 0;

    async function makeWorker(slot) {
        if (!hasWasmSimd()) {
            throw new OcrError('NO_SIMD',
                'This browser lacks WebAssembly SIMD, which the reading engine needs. A current Chrome, Edge, Firefox or Safari has it.');
        }
        try {
            const Tesseract = await loadLibrary();
            // The library never settles its promise when the language file fails
            // to load, and throws on the page instead. The handler turns that
            // into a rejection here.
            const worker = await new Promise((resolve, reject) => Tesseract.createWorker('eng', Tesseract.OEM.LSTM_ONLY, {
                errorHandler: reject,
                workerPath: at('worker.min.js'),
                corePath: at('tesseract-core-simd-lstm.wasm.js'),
                langPath: at('').replace(/\/$/, ''),
                // A blob worker would need blob: in the CSP.
                workerBlobURL: false,
                gzip: true,
                // Nothing is written to IndexedDB; the HTTP cache holds the files.
                cacheMethod: 'none',
                logger: (message) => {
                    const reading = message.status === 'recognizing text';
                    onProgress(reading ? 'reading' : 'loading', message.progress || 0, slot.key);
                }
            }).then(resolve, reject));
            // The library's own default is one block of text, which reads two
            // columns straight across and finds nothing in a ruled table.
            await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.AUTO });
            return worker;
        } catch (error) {
            throw new OcrError('ENGINE_FAILED', 'The reading engine could not start. Reload the page and try again.');
        }
    }

    // Resolves with a slot that is the caller's until release().
    function acquire() {
        const idle = slots.find((slot) => !slot.busy);
        if (idle) {
            idle.busy = true;
            return Promise.resolve(idle);
        }
        if (slots.length < size) {
            const slot = { busy: true, key: null, worker: null, ready: null };
            slots.push(slot);
            return Promise.resolve(slot);
        }
        return new Promise((resolve) => waiting.push(resolve));
    }

    function release(slot) {
        slot.key = null;
        const next = waiting.shift();
        if (next) next(slot);
        else slot.busy = false;
    }

    async function workerOf(slot) {
        if (!slot.ready) {
            const born = generation;
            slot.ready = makeWorker(slot).then((worker) => {
                if (born !== generation) {
                    worker.terminate();
                    throw new OcrError('STOPPED', 'Stopped.');
                }
                slot.worker = worker;
                return worker;
            });
            // A worker that failed to start is tried again on the next page.
            slot.ready.catch(() => { slot.ready = null; });
        }
        return slot.ready;
    }

    return {
        // How many pages may be read at once from here on.
        setSize(count) {
            size = Math.max(1, Math.floor(count) || 1);
        },

        async recognize(canvas, key = null) {
            const born = generation;
            const slot = await acquire();
            slot.key = key;
            try {
                const worker = await workerOf(slot);
                // The text-only PDF is a few kilobytes, so it is made on every read.
                const result = await worker.recognize(canvas,
                    { rotateAuto: true, pdfTextOnly: true },
                    { text: true, blocks: true, pdf: true });
                return {
                    text: result.data.text || '',
                    confidence: result.data.confidence || 0,
                    words: flattenWords(result.data.blocks),
                    textPdf: result.data.pdf ? new Uint8Array(result.data.pdf) : null,
                    // The angle the engine turned the image by before reading it.
                    skew: result.data.rotateRadians || 0
                };
            } finally {
                if (born === generation) release(slot);
            }
        },

        workerCount: () => slots.length,

        // Lets go of idle workers beyond `keep`. Each holds the engine and the
        // language model in memory for as long as it lives.
        trim(keep) {
            const idle = slots.filter((slot) => !slot.busy && slot.worker);
            for (const slot of idle) {
                if (slots.length <= keep) break;
                slots.splice(slots.indexOf(slot), 1);
                slot.worker.terminate();
            }
        },

        // Stops every worker, including any still loading. A terminated worker
        // never settles the job it was on, so callers must not wait for one.
        async terminate() {
            generation++;
            const old = slots;
            slots = [];
            waiting = [];
            await Promise.all(old.map((slot) => (slot.worker ? slot.worker.terminate() : null)));
        }
    };
}
