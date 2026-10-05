// OCR Text Extractor: the words the engine doubted, each beside its pixels.

const PAD = 8;
const MAX_HEIGHT = 56;
const MAX_WIDTH = 420;

// A small canvas holding the part of the page a word was read from. The
// engine's boxes are in the frame of the image after it turned it by `skew`,
// so the page is drawn turned the same way.
export function cropWord(canvas, bbox, skew = 0) {
    const width = Math.max(1, bbox.x1 - bbox.x0) + 2 * PAD;
    const height = Math.max(1, bbox.y1 - bbox.y0) + 2 * PAD;
    const scale = Math.min(1, MAX_HEIGHT / height, MAX_WIDTH / width);
    const crop = document.createElement('canvas');
    crop.width = Math.max(1, Math.round(width * scale));
    crop.height = Math.max(1, Math.round(height * scale));
    const context = crop.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, crop.width, crop.height);
    context.scale(scale, scale);
    context.translate(PAD - bbox.x0, PAD - bbox.y0);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(skew);
    context.translate(-canvas.width / 2, -canvas.height / 2);
    context.drawImage(canvas, 0, 0);
    return crop;
}

function cell(content, className) {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.append(content);
    return td;
}

// entries: [{ page, text, confidence, crop }]. hidden: how many were left out.
export function renderReview(els, entries, hidden, limits) {
    els.card.hidden = entries.length === 0;
    els.body.replaceChildren(...entries.map((entry) => {
        const tr = document.createElement('tr');
        tr.appendChild(cell(String(entry.page), 'num'));
        entry.crop.setAttribute('role', 'img');
        entry.crop.setAttribute('aria-label', `The pixels read as ${entry.text}`);
        tr.appendChild(cell(entry.crop, 'crop'));
        tr.appendChild(cell(entry.text, 'reading'));
        tr.appendChild(cell(String(Math.floor(entry.confidence)), 'num'));
        return tr;
    }));
    const count = `${entries.length} ${entries.length === 1 ? 'word' : 'words'}`;
    // The second engine doubts on a scale of its own.
    const which = entries.some((entry) => entry.engine === 'second')
        ? `an engine doubted (the first under ${limits.lowConfidence}, the second under ${limits.secondLowWord} on its own scale)`
        : `the engine scored under ${limits.lowConfidence}`;
    const shown = `${count} ${which}, in page order, each beside the pixels it was read from.`;
    const more = hidden > 0 ? ` ${hidden.toLocaleString('en-US')} more are not shown: the list stops at ${limits.maxReviewWords}.` : '';
    const note = `${shown}${more} A word that is not here was not doubted, which is not the same as right.`;
    if (els.note.textContent !== note) els.note.textContent = note;
}
