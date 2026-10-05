// OCR Text Extractor: page controller.

import * as plan from './ocr-plan.js';
import { openPdf } from './ocr-pdf-in.js';
import { createEngine, hasWasmSimd } from './ocr-engine.js';
import { cropWord, renderReview } from './ocr-review.js';
import { prepare, upsideDown } from './ocr-prepare.js';
import * as secondPlan from './ocr-second-plan.js';
import { createSecondEngine } from './ocr-second.js';
import { renderCompare, resetCompare } from './ocr-compare.js';

const { OcrError, LIMITS } = plan;
const { SECOND } = secondPlan;

const state = {
    file: null,
    kind: null,
    pages: [],
    total: 0,
    running: false,
    runId: 0,
    stop: null,
    pdf: null,
    saving: false,
    // 'auto' gives a badly read page to the second engine, 'off' never does,
    // 'both' reads every page with both.
    mode: 'auto',
    secondBroken: false
};

let els = {};
let engineProgress = () => {};
const engine = createEngine((stage, fraction, key) => engineProgress(stage, fraction, key));
let secondProgress = () => {};
const second = createSecondEngine((stage, fraction, key) => secondProgress(stage, fraction, key));

document.addEventListener('DOMContentLoaded', init);

function init() {
    const byId = (id) => document.getElementById(id);
    els = {
        dropZone: byId('dropZone'),
        chooseFile: byId('chooseFile'),
        takePhoto: byId('takePhoto'),
        fileInput: byId('fileInput'),
        cameraInput: byId('cameraInput'),
        forceOcr: byId('forceOcr'),
        engineMode: byId('engineMode'),
        compareConfirm: byId('compareConfirm'),
        compareYes: byId('compareYes'),
        compareNo: byId('compareNo'),
        compareCard: byId('compareCard'),
        compareList: byId('compareList'),
        compareNote: byId('compareNote'),
        runBox: byId('runBox'),
        runProgress: byId('runProgress'),
        busyNote: byId('busyNote'),
        stopRun: byId('stopRun'),
        runStatus: byId('runStatus'),
        textSummary: byId('textSummary'),
        textOutput: byId('textOutput'),
        copyText: byId('copyText'),
        downloadText: byId('downloadText'),
        downloadPdf: byId('downloadPdf'),
        pdfNote: byId('pdfNote'),
        reviewCard: byId('reviewCard'),
        reviewBody: document.querySelector('#reviewTable tbody'),
        reviewNote: byId('reviewNote'),
        pageSeparators: byId('pageSeparators'),
        copyStatus: byId('copyStatus'),
        pagesBody: document.querySelector('#pagesTable tbody'),
        pageNotes: byId('pageNotes'),
        viewLicenses: byId('viewLicenses'),
        licenses: byId('attributionsModal'),
        closeLicenses: byId('closeAttributions')
    };

    els.chooseFile.addEventListener('click', () => els.fileInput.click());
    els.takePhoto.addEventListener('click', () => els.cameraInput.click());
    for (const input of [els.fileInput, els.cameraInput]) {
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            // Cleared so picking the same file again still fires a change.
            input.value = '';
            if (file) run(file);
        });
    }

    els.dropZone.addEventListener('dragover', (event) => {
        event.preventDefault();
        els.dropZone.classList.add('dragging');
    });
    els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('dragging'));
    els.dropZone.addEventListener('drop', (event) => {
        event.preventDefault();
        els.dropZone.classList.remove('dragging');
        const file = event.dataTransfer && event.dataTransfer.files[0];
        if (file) run(file);
    });
    document.addEventListener('paste', (event) => {
        const file = event.clipboardData && event.clipboardData.files[0];
        if (file) {
            event.preventDefault();
            run(file);
        }
    });

    els.stopRun.addEventListener('click', stopRun);
    els.forceOcr.addEventListener('change', () => {
        if (state.kind === 'pdf' && !state.running) run(state.file);
    });
    els.engineMode.addEventListener('change', () => {
        // Reading every page twice is asked about first.
        if (els.engineMode.value === 'both') els.compareConfirm.showModal();
        else setMode(els.engineMode.value);
    });
    els.compareYes.addEventListener('click', () => els.compareConfirm.close('yes'));
    els.compareNo.addEventListener('click', () => els.compareConfirm.close('no'));
    // Escape closes it too, with no answer, which is a no.
    els.compareConfirm.addEventListener('close', () => {
        if (els.compareConfirm.returnValue === 'yes') setMode('both');
        else els.engineMode.value = state.mode;
        els.compareConfirm.returnValue = '';
    });
    els.pageSeparators.addEventListener('change', renderText);
    els.copyText.addEventListener('click', copyText);
    els.downloadText.addEventListener('click', downloadText);
    els.downloadPdf.addEventListener('click', downloadPdf);

    els.viewLicenses.addEventListener('click', () => els.licenses.showModal());
    els.closeLicenses.addEventListener('click', () => els.licenses.close());
    els.licenses.addEventListener('click', (event) => {
        if (event.target === els.licenses) els.licenses.close();
    });
}

function setMode(mode) {
    if (mode === state.mode) return;
    state.mode = mode;
    if (state.file && !state.running) run(state.file);
}

// Written only when it changes, so a screen reader hears each line once.
function setStatus(text, isError = false) {
    if (els.runStatus.textContent !== text) els.runStatus.textContent = text;
    els.runStatus.classList.toggle('error', isError);
}

function setProgress(fraction) {
    els.runProgress.value = Math.max(0, Math.min(1, fraction));
}

function setRunning(running) {
    state.running = running;
    els.runBox.hidden = !running;
    els.chooseFile.disabled = running;
    els.takePhoto.disabled = running;
    els.forceOcr.disabled = running;
    els.engineMode.disabled = running;
    renderPdfButton();
}

async function run(file) {
    if (state.running) {
        els.busyNote.textContent = `${file.name || 'That file'} was not read: another file is still being read. Wait for it, or press Stop, then choose it again.`;
        return;
    }
    els.busyNote.textContent = '';
    state.kind = null;
    const runId = ++state.runId;
    state.file = file;
    state.pages = [];
    state.total = 0;
    state.secondBroken = false;
    resetCompare();
    renderAll();
    setProgress(0);
    setRunning(true);
    setStatus(`Opening ${file.name || 'the image'}.`);

    const stopped = new Promise((resolve, reject) => {
        state.stop = () => reject(new OcrError('STOPPED', 'Stopped.'));
    });
    stopped.catch(() => {});

    try {
        const kind = plan.checkFile(file);
        state.kind = kind;
        const work = kind === 'pdf' ? readPdf(file, runId) : readImage(file, runId);
        // After a stop the abandoned work may fail late; that is not an error.
        work.catch(() => {});
        await Promise.race([work, stopped]);
        finish(false);
        engine.trim(1);
        // The second engine holds its models in memory, so it is let go.
        second.terminate();
    } catch (error) {
        if (error.code === 'STOPPED') {
            // A terminated worker never settles its job, so the PDF is closed here.
            closePdf();
            second.terminate();
            await engine.terminate();
            finish(true);
        } else {
            // Other pages may still be in hand; nothing more from them is wanted.
            state.runId++;
            closePdf();
            second.terminate();
            await engine.terminate();
            setStatus(error instanceof OcrError ? error.message : 'That file could not be read.', true);
            if (!(error instanceof OcrError)) console.error(error);
        }
    } finally {
        state.stop = null;
        setRunning(false);
    }
}

function closePdf() {
    const pdf = state.pdf;
    state.pdf = null;
    if (pdf) pdf.destroy();
}

function stopRun() {
    if (!state.running || !state.stop) return;
    // Bumping the id makes the abandoned run's late results fall on the floor.
    state.runId++;
    state.stop();
}

function finish(stopped) {
    const done = state.pages.length;
    const words = plan.totalWords(state.pages);
    const pagesText = `${done} ${done === 1 ? 'page' : 'pages'}`;
    if (stopped) {
        setStatus(done
            ? `Stopped after ${done} of ${state.total} pages. The text below is partial.`
            : 'Stopped before any page was read.');
    } else {
        setStatus(`Done: ${pagesText}, ${words.toLocaleString('en-US')} words.`);
    }
    setProgress(stopped ? els.runProgress.value : 1);
}

// Progress across pages that may be read side by side. `reading` holds how
// far each page in hand has got, by page index.
const progress = { reading: new Map(), shown: 0, lanes: 1, loaded: false, note: '' };

function resetProgress(lanes) {
    progress.reading.clear();
    progress.shown = 0;
    progress.lanes = lanes;
    progress.loaded = false;
    progress.note = '';
}

function showProgress() {
    if (!state.total) return;
    let inHand = 0;
    for (const fraction of progress.reading.values()) inHand += fraction;
    // Never backwards: a page handed to a new worker reports from zero again.
    progress.shown = Math.max(progress.shown, (state.pages.length + inHand) / state.total);
    setProgress(progress.shown);
    if (progress.note) {
        setStatus(progress.note);
    } else if (state.total === 1) {
        setStatus('Reading the page.');
    } else {
        const lanes = progress.lanes > 1 ? `, ${progress.lanes} at a time` : '';
        setStatus(`Reading ${state.total} pages${lanes}: ${state.pages.length} done.`);
    }
}

engineProgress = (stage, fraction, key) => {
    if (!state.running || key === null) return;
    if (stage === 'reading') {
        progress.loaded = true;
        progress.reading.set(key, fraction);
        showProgress();
    } else if (!progress.loaded) {
        setStatus('Loading the reading engine. The first run fetches about 7 MB from this site.');
    }
};

secondProgress = (stage, fraction, key) => {
    if (!state.running) return;
    if (stage === 'loading') {
        progress.note = `Loading the second reading engine. The first use fetches about ${SECOND.megabytes} MB from this site.`;
    } else {
        progress.note = '';
        if (key !== null && state.mode !== 'both') progress.reading.set(key, fraction);
    }
    showProgress();
};

const timed = (job) => {
    const from = performance.now();
    return job.then((result) => ({ ...result, ms: performance.now() - from }));
};

// One engine's reading of a page. The crops of its doubted words are cut here,
// while the pixels still exist. `turned` is every turn made before the engine.
function makeReading(name, result, canvas, turned, room) {
    const isSecond = name === 'second';
    const doubted = isSecond ? secondPlan.doubtedBySecond(result.words) : plan.lowConfidenceWords(result.words);
    // The first engine's boxes are in the frame it turned the image to.
    const ownSkew = isSecond ? 0 : result.skew;
    return {
        text: result.text,
        confidence: result.confidence,
        words: result.words,
        textPdf: isSecond ? null : result.textPdf,
        lines: isSecond ? result.lines : null,
        lost: isSecond ? result.lost : 0,
        readWidth: canvas.width,
        readHeight: canvas.height,
        skew: turned + ownSkew,
        doubted: doubted.length,
        weak: result.confidence < (isSecond ? SECOND.keepAt : LIMITS.weakPage),
        review: doubted.slice(0, room).map((word) => ({
            text: word.text,
            confidence: word.confidence,
            crop: cropWord(canvas, word.bbox, ownSkew)
        })),
        ms: result.ms
    };
}

// Makes one of a page's readings the one the text, the table and the PDF use.
function useReading(page, name) {
    const { ms, ...reading } = page.readings[name];
    Object.assign(page, reading, { engine: name });
    return page;
}

// How many workers this device can carry, for `pages` pages.
function deviceWorkers(pages) {
    return plan.workerCount({
        cores: navigator.hardwareConcurrency,
        memoryGb: navigator.deviceMemory,
        pages,
        coarsePointer: window.matchMedia('(pointer: coarse)').matches
    });
}

// Reads one page's pixels. The canvas is used up: it is released here.
async function recognizeCanvas(canvas, index, runId) {
    const mode = state.mode;
    const prep = prepare(canvas, undefined, LIMITS.maxPixels);
    if (prep.canvas !== canvas) canvas.width = 0;
    let read = prep.canvas;
    let flipped = false;
    const live = () => runId === state.runId;
    // A second engine that fails leaves the first one's reading standing, and
    // is not asked again in this run.
    const askSecond = (source) => (state.secondBroken ? Promise.resolve(null)
        : timed(second.recognize(source, index)).catch(() => {
            if (live()) state.secondBroken = true;
            return null;
        }));
    try {
        // When comparing, both engines start on the page at once.
        let other = mode === 'both' ? askSecond(read) : null;
        let result = await timed(engine.recognize(read, index));
        if (!live()) return null;
        if (plan.shouldRetryFlipped(result)) {
            const turnedOver = upsideDown(read);
            const again = await timed(engine.recognize(turnedOver, index));
            if (!live() || !plan.betterReading(result, again)) {
                turnedOver.width = 0;
                if (!live()) return null;
            } else {
                read.width = 0;
                read = turnedOver;
                result = again;
                flipped = true;
                if (other) other = askSecond(read);
            }
        }
        const wanted = secondPlan.needsSecond(result, prep.marked);
        if (!other && mode === 'auto' && wanted) other = askSecond(read);
        const otherResult = other ? await other : null;
        if (!live()) return null;

        // Every turn made before an engine saw the page, about one center.
        const turned = prep.turnRadians + (flipped ? Math.PI : 0);
        // Only as many crops as the list could still show.
        const room = plan.reviewRoom(state.pages, index + 1);
        const readings = { first: makeReading('first', result, read, turned, room) };
        if (otherResult) readings.second = makeReading('second', otherResult, read, turned, room);
        const page = {
            readings,
            frame: prep.frame,
            repairs: { evened: prep.evened, turnDegrees: prep.turnDegrees, enlarged: prep.enlarged, flipped },
            compared: mode === 'both',
            secondFailed: other !== null && !otherResult,
            picked: false
        };
        const takeSecond = Boolean(otherResult) && wanted && secondPlan.secondWins(result, otherResult);
        return useReading(page, takeSecond ? 'second' : 'first');
    } finally {
        // Frees the pixel buffer now and not at the next garbage collection.
        read.width = 0;
        progress.reading.delete(index);
    }
}

// The reader's own choice between two readings of a page.
function pickReading(number, name) {
    const page = state.pages.find((other) => other.number === number);
    if (!page || !page.readings || !page.readings[name] || page.engine === name) return;
    useReading(page, name);
    page.picked = true;
    renderAll();
}

// Pages can finish out of order, so each goes in at its own place.
function addPage(page) {
    const at = state.pages.findIndex((other) => other.number > page.number);
    if (at < 0) state.pages.push(page);
    else state.pages.splice(at, 0, page);
    renderAll();
    if (state.running) showProgress();
}

async function readImage(file, runId) {
    let bitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch (error) {
        throw new OcrError('BAD_IMAGE', 'That file could not be opened as an image.');
    }
    if (runId !== state.runId) {
        bitmap.close();
        return;
    }
    const fit = plan.fitImage(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = fit.width;
    canvas.height = fit.height;
    const context = canvas.getContext('2d');
    // A transparent image would otherwise be dark text on black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, fit.width, fit.height);
    context.drawImage(bitmap, 0, 0, fit.width, fit.height);
    bitmap.close();

    state.total = 1;
    resetProgress(1);
    engine.setSize(1);
    second.setSize(deviceWorkers(plan.LIMITS.maxPages));
    const result = await recognizeCanvas(canvas, 0, runId);
    if (!result) return;
    const size = fit.reduced ? `scaled down to ${fit.width} by ${fit.height} px` : `${fit.width} by ${fit.height} px`;
    addPage(Object.assign(result, { number: 1, source: 'image', detail: size + plan.describeRepairs(result.repairs) }));
}

async function readPdfPage(pdf, index, force, runId) {
    const number = index + 1;
    const ownText = force ? '' : await pdf.pageText(number);
    if (runId !== state.runId) return;
    if (!force && plan.isTextPage(ownText)) {
        addPage({ number, source: 'file', text: ownText });
        return;
    }
    const rendered = await pdf.renderPage(number);
    if (runId !== state.runId) {
        rendered.canvas.width = 0;
        return;
    }
    const result = await recognizeCanvas(rendered.canvas, index, runId);
    if (!result) return;
    const dpi = `${Math.round(rendered.dpi)} DPI${rendered.reduced ? ', lowered to fit in memory' : ''}`;
    addPage(Object.assign(result, { number, source: 'image', detail: dpi + plan.describeRepairs(result.repairs) }));
}

async function readPdf(file, runId) {
    const pdf = await openPdf(new Uint8Array(await file.arrayBuffer()));
    if (runId !== state.runId) {
        pdf.destroy();
        return;
    }
    state.pdf = pdf;
    try {
        const total = plan.checkPageCount(pdf.pageCount);
        state.total = total;
        const force = els.forceOcr.checked;
        const byDevice = deviceWorkers(total);
        // When comparing, the second engine's workers need cores of their own.
        const lanes = state.mode === 'both' ? Math.min(byDevice, 2) : byDevice;
        second.setSize(deviceWorkers(plan.LIMITS.maxPages));
        engine.setSize(lanes);
        resetProgress(lanes);
        // Each lane takes the next unread page, so no more than `lanes` pages
        // of pixels exist at once.
        let next = 0;
        const lane = async () => {
            while (next < total && runId === state.runId) await readPdfPage(pdf, next++, force, runId);
        };
        await Promise.all(Array.from({ length: lanes }, lane));
    } finally {
        if (state.pdf === pdf) closePdf();
    }
}

// The doubted words of every page, in page order, up to the cap.
function collectReview() {
    const entries = [];
    let hidden = 0;
    for (const page of state.pages) {
        if (page.source !== 'image') continue;
        const room = plan.takeReview(entries.length, page.doubted);
        hidden += room.hidden;
        for (const entry of page.review.slice(0, room.take)) entries.push({ page: page.number, engine: page.engine, ...entry });
    }
    return { entries, hidden };
}

function renderAll() {
    renderText();
    renderRows();
    const review = collectReview();
    renderReview(
        { card: els.reviewCard, body: els.reviewBody, note: els.reviewNote },
        review.entries, review.hidden, { ...LIMITS, secondLowWord: SECOND.lowWord }
    );
    renderCompare({ card: els.compareCard, list: els.compareList, note: els.compareNote }, state.pages, pickReading);
    renderPdfButton();
}

// A PDF is offered only when it would differ from the file that came in.
function renderPdfButton() {
    const layered = state.pages.filter((page) => page.source === 'image' && (page.textPdf || page.lines) && page.words.length).length;
    els.downloadPdf.disabled = state.running || state.saving || layered === 0;
    let note = '';
    if (!state.running && state.pages.length && layered === 0) {
        note = state.pages.some((page) => page.source === 'file')
            ? 'No searchable PDF to save: every page read already holds its own text, so the file would come out unchanged.'
            : 'No searchable PDF to save: no words were found to put in it.';
    }
    if (els.pdfNote.textContent !== note) els.pdfNote.textContent = note;
}

function renderText() {
    const text = plan.assembleText(state.pages, { separators: els.pageSeparators.checked });
    if (els.textOutput.value !== text) {
        // Setting the value throws the selection to the end, which matters to
        // someone selecting text while pages are still arriving. The browser
        // keeps the scroll position by itself.
        const { selectionStart, selectionEnd } = els.textOutput;
        els.textOutput.value = text;
        els.textOutput.setSelectionRange(selectionStart, selectionEnd);
    }
    const has = plan.countVisibleChars(text) > 0;
    els.copyText.disabled = !has;
    els.downloadText.disabled = !has;
    if (els.copyStatus.textContent) els.copyStatus.textContent = '';

    let summary = 'Nothing read yet.';
    if (state.pages.length) {
        const name = state.file && state.file.name ? state.file.name : 'the image';
        summary = has
            ? `From ${name}: ${plan.totalWords(state.pages).toLocaleString('en-US')} words on ${state.pages.length} of ${state.total} pages.`
            : `No text was found in ${name}.`;
    }
    if (els.textSummary.textContent !== summary) els.textSummary.textContent = summary;
}

function cell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
}

function renderRows() {
    const rows = state.pages.map((page) => {
        const summary = plan.summarizePage(page);
        const tr = document.createElement('tr');
        if (summary.weak || summary.empty) tr.className = 'weak';
        tr.appendChild(cell(String(summary.number), 'num'));
        tr.appendChild(cell(summary.source === 'file' ? 'The file' : `Pixels, ${page.detail}${secondPlan.describeEngine(page)}`));
        tr.appendChild(cell(summary.empty ? 'none found' : summary.words.toLocaleString('en-US'), 'num'));
        let confidence = 'n/a';
        if (summary.source === 'image' && !summary.empty) {
            confidence = `${plan.showConfidence(summary.confidence)}${summary.weak ? ', low' : ''}`;
        }
        tr.appendChild(cell(confidence, 'num'));
        tr.appendChild(cell(summary.source === 'image' ? String(summary.lowCount) : 'n/a', 'num'));
        return tr;
    });
    els.pagesBody.replaceChildren(...rows);

    const summaries = state.pages.map((page) => plan.summarizePage(page));
    const notes = [];
    if (summaries.some((row) => row.weak && !row.empty)) {
        notes.push(`A page marked "low" averaged under ${LIMITS.weakPage}. The usual causes are low resolution, a photo taken at an angle or in poor light, handwriting, or a layout in columns. Read it in full against the original.`);
    }
    if (summaries.some((row) => row.empty)) {
        notes.push('A page with no words found may be blank, a picture, handwriting, or too faint to read.');
    }
    if (summaries.some((row) => row.lowCount > 0)) {
        notes.push(`"To check" counts words scored under ${LIMITS.lowConfidence}. The other words were not verified, only not doubted.`);
    }
    if (state.pages.some((page) => page.engine === 'second')) {
        notes.push(`"Read by the second engine" means the first engine (Tesseract) scored the page under ${SECOND.tryBelow} or found nothing on it, so the second (PP-OCR) read it and its reading was kept. The second engine scores itself on its own scale, a word as its least certain character, so its figures are not comparable with the first engine's, and the pixels shown for its doubted words are placed by estimate along the line.`);
    }
    if (state.pages.some((page) => page.readings && page.readings.second && page.engine === 'first' && !page.compared)) {
        notes.push(`"Second engine tried and not kept" means the first engine scored the page under ${SECOND.tryBelow}, and the second either scored under ${SECOND.keepAt} on its own scale or found less than half as much text. Neither reading of that page should be trusted.`);
    }
    if (state.pages.some((page) => page.secondFailed)) {
        notes.push('"Second engine failed" means the second engine could not be loaded or stopped on that page, so the reading of the first engine stands.');
    }
    const repaired = (name) => state.pages.some((page) => page.repairs && page.repairs[name] && page.repairs[name] !== 1);
    if (repaired('evened')) {
        notes.push('"Lighting evened" means the paper was brighter in some places than others, as under a shadow or a lamp, so the page was leveled to plain gray before reading. A page read from a level scan is left alone.');
    }
    if (repaired('turnDegrees')) {
        notes.push('"Turned" means the print was tilted further than the engine straightens by itself, so the page was turned by that angle before reading. The saved PDF keeps your page as it was, with the text laid along the tilted print.');
    }
    if (repaired('flipped')) {
        notes.push('"Turned the right way up" means the page read as nonsense, was read again upside down, and that reading was clearly the better one. The saved PDF keeps your page as it was.');
    }
    if (repaired('enlarged')) {
        notes.push('"Enlarged" means the print was small, as on a screenshot, so the picture was made two or three times larger before reading. Small print is read less reliably even so.');
    }
    if (summaries.some((row) => row.source === 'file')) {
        notes.push('A page marked "The file" already held text, which was copied as it is. If that text is wrong, tick "Read every page from pixels".');
    }
    els.pageNotes.replaceChildren(...notes.map((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        return li;
    }));
}

async function copyText() {
    const ok = await Clipboard.copy(els.textOutput.value);
    els.copyStatus.textContent = ok ? 'Copied.' : 'The browser refused the copy. Select the text and copy it by hand.';
}

function save(content, type, name) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadText() {
    save(els.textOutput.value, 'text/plain;charset=utf-8', plan.textFileName(state.file && state.file.name));
}

async function buildPdf() {
    const out = await import('./ocr-pdf-out.js');
    const isPdf = plan.checkFile(state.file) === 'pdf';
    const built = isPdf
        ? await out.pdfWithText(new Uint8Array(await state.file.arrayBuffer()), state.pages)
        : await out.imageAsPdf(state.file, state.pages[0]);
    await out.checkPdf(built.bytes, built.pageCount);
    return built;
}

async function downloadPdf() {
    if (state.saving || state.running) return;
    state.saving = true;
    renderPdfButton();
    els.copyStatus.textContent = 'Building the PDF.';
    try {
        const built = await buildPdf();
        const name = plan.pdfFileName(state.file.name);
        save(built.bytes, 'application/pdf', name);
        const untouched = built.pageCount - built.layered;
        els.copyStatus.textContent = `Saved ${name}: ${built.layered} of ${built.pageCount} pages given a text layer` +
            (untouched ? `, ${untouched} left as they were.` : '.') +
            ' The hidden text is the reading above, mistakes included.';
    } catch (error) {
        els.copyStatus.textContent = error instanceof OcrError ? error.message : 'The PDF could not be built.';
        if (!(error instanceof OcrError)) console.error(error);
    } finally {
        state.saving = false;
        renderPdfButton();
    }
}

window.OcrTool = {
    ...plan,
    hasWasmSimd,
    ...secondPlan,
    // Reads a canvas with the second engine and leaves the canvas intact.
    readCanvasSecond: (canvas) => second.recognize(canvas),
    pickReading,
    secondWorkers: () => second.workerCount(),
    setSecondWorkers: (count) => second.setSize(count),
    mode: () => state.mode,
    // Reads a canvas with the page's own engine and leaves the canvas intact.
    async readCanvas(canvas) {
        return engine.recognize(canvas);
    },
    workers: () => engine.workerCount(),
    pages: () => state.pages.map((page) => ({ ...page })),
    review: () => collectReview().entries,
    buildPdf,
    isRunning: () => state.running
};
