// OCR Text Extractor: the two engines' readings of a page, side by side.

import { diffWords } from './ocr-second-plan.js';

export const ENGINE_NAMES = { first: 'First engine (Tesseract)', second: 'Second engine (PP-OCR)' };

// Pages whose comparison is open, kept across redraws.
const open = new Set();

export function resetCompare() {
    open.clear();
}

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

// The reading with its line breaks, each word the other reading lacks marked.
// `marks` is the word list from diffWords, in the same order as the text.
function textBlock(text, marks) {
    const block = element('div', 'compare-text');
    let at = 0;
    // Blank lines at the end are not shown.
    for (const line of String(text || '').replace(/\s+$/, '').split('\n')) {
        const row = element('span', 'compare-line');
        for (const word of line.trim().split(/\s+/)) {
            if (word === '') continue;
            const same = marks ? marks[at] && marks[at].same : true;
            at++;
            row.append(same ? word : element('mark', '', word), ' ');
        }
        block.append(row);
    }
    return block;
}

function column(key, reading, marks, inUse, onPick) {
    const box = element('div', 'compare-column');
    box.append(element('h3', '', ENGINE_NAMES[key]));
    const seconds = (reading.ms / 1000).toFixed(1);
    box.append(element('p', 'helper-text',
        `Confidence ${Math.floor(reading.confidence)} on its own scale, ${reading.words.length.toLocaleString('en-US')} words, ${seconds} s.`));
    const pick = element('button', 'tool-btn small', inUse ? 'In use' : 'Use this reading');
    pick.type = 'button';
    pick.setAttribute('aria-pressed', String(inUse));
    pick.dataset.engine = key;
    pick.addEventListener('click', () => onPick(key));
    box.append(pick, textBlock(reading.text, marks));
    return box;
}

// pages: the page records. onPick(number, key) is called to switch a page.
export function renderCompare(els, pages, onPick) {
    const both = pages.filter((page) => page.readings && page.readings.second && page.compared);
    els.card.hidden = both.length === 0;
    let total = 0;
    let matched = 0;
    const rows = both.map((page) => {
        const { first, second } = page.readings;
        const diff = diffWords(first.text, second.text);
        const words = first.words.length + second.words.length;
        if (diff) {
            total += words;
            matched += diff.agreement * words;
        }
        const details = element('details', 'compare-page');
        details.dataset.page = String(page.number);
        details.open = open.has(page.number);
        details.addEventListener('toggle', () => {
            if (details.open) open.add(page.number);
            else open.delete(page.number);
        });
        const agreement = diff
            ? `the two readings share ${Math.floor(diff.agreement * 100)}% of their words`
            : 'too long to compare word by word';
        details.append(element('summary', '',
            `Page ${page.number}: ${agreement}. Using the ${page.engine} engine.`));
        const grid = element('div', 'compare-grid');
        grid.append(
            column('first', first, diff && diff.left, page.engine === 'first', (key) => onPick(page.number, key)),
            column('second', second, diff && diff.right, page.engine === 'second', (key) => onPick(page.number, key))
        );
        details.append(grid);
        return details;
    });
    els.list.replaceChildren(...rows);
    const share = total ? ` Over ${both.length} ${both.length === 1 ? 'page' : 'pages'} they share ${Math.floor((matched / total) * 100)}% of their words.` : '';
    const note = `Each page read by both engines. A marked word is one the other engine did not read the same way, which is where to look first.${share} Where they agree, both can still be wrong.`;
    if (els.note.textContent !== note) els.note.textContent = note;
}
