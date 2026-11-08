// Mermaid ishikawa-beta import and export. Pure.
//
// Pinned to the syntax documented for Mermaid 11.12.3: a header line, then the
// head line and the categories at one indent, with causes indented under
// their category. The type is beta, so this follows the documented example
// exactly and nothing more. Mermaid has no statuses or notes, so the export
// appends status and owner to the cause text.

import { LIMITS } from './fishbone-limits.js';
import { ROOT, BIN_NAME, STATUS_LABELS, liveChildren } from './fishbone-ops.js';

export const MERMAID_HEADER = 'ishikawa-beta';
const HEADER = /^ishikawa(?:-beta)?\s*$/i;

function indentOf(raw) {
    let cols = 0;
    let i = 0;
    for (; i < raw.length; i++) {
        if (raw[i] === ' ') cols += 1;
        else if (raw[i] === '\t') cols += 4;
        else break;
    }
    return { cols, body: raw.slice(i).trim() };
}

/** Mermaid text as one line of plain words: no line breaks, no comment marks. */
export function mermaidText(text) {
    return String(text).replace(/[\r\n\t]+/g, ' ').replace(/%%/g, '%').replace(/\s+/g, ' ').trim();
}

/** The board as Mermaid text. Empty categories are written too. */
export function toMermaid(board) {
    const lines = [MERMAID_HEADER, `    ${mermaidText(board.effect || board.title || 'Problem')}`];
    const walk = (id, depth) => {
        const node = board.nodes[id];
        const extras = [];
        if (node.status) extras.push(STATUS_LABELS[node.status]);
        if (node.owner) extras.push(`owner ${node.owner}`);
        const suffix = extras.length ? ` (${extras.join(', ')})` : '';
        lines.push(`${'    '.repeat(depth + 1)}${mermaidText(node.text) || '(blank)'}${suffix}`);
        for (const kid of liveChildren(board, id)) walk(kid, depth + 1);
    };
    for (const id of liveChildren(board, ROOT)) walk(id, 0);
    return `${lines.join('\n')}\n`;
}

/**
 * Read Mermaid ishikawa text into the same shape parseOutline returns, so one
 * builder makes the board. Front matter, %% comments and blank lines are
 * skipped. Returns { ok: false, message } when there is no ishikawa header.
 */
export function parseMermaid(input) {
    const findings = [];
    const lines = String(input == null ? '' : input).replace(/\r\n?/g, '\n').split('\n');
    let i = 0;
    const skip = () => {
        while (i < lines.length && (!lines[i].trim() || lines[i].trim().startsWith('%%'))) i++;
    };
    skip();
    if (lines[i] && lines[i].trim() === '---') {
        i++;
        while (i < lines.length && lines[i].trim() !== '---') i++;
        i++;
        skip();
    }
    if (i >= lines.length || !HEADER.test(lines[i].trim())) {
        return { ok: false, message: 'That is not Mermaid ishikawa text: the first line should be "ishikawa-beta"' };
    }
    i++;
    const content = [];
    for (; i < lines.length; i++) {
        const { cols, body } = indentOf(lines[i]);
        if (!body || body.startsWith('%%')) continue;
        content.push({ line: i + 1, cols, body });
    }
    const out = { ok: true, effect: null, preset: null, kind: null, categories: [], bin: null, findings };
    if (!content.length) return out;
    const head = content.shift();
    out.effect = head.body.slice(0, LIMITS.effect);
    if (!content.length) return out;
    const top = content[0].cols;
    let stack = [];
    for (const { line, cols, body } of content) {
        const text = body.slice(0, LIMITS.causeText);
        if (cols <= top) {
            if (cols < top) findings.push({ code: 'INDENT_COERCED', line, message: 'This line is indented less than the categories; it was read as a category' });
            const isBin = text.toLowerCase() === BIN_NAME.toLowerCase();
            const item = isBin
                ? (out.bin = out.bin || { text: BIN_NAME, line, children: [], isBin: true })
                : { text, line, children: [] };
            if (!isBin) out.categories.push(item);
            stack = [{ cols, item, depth: 0 }];
            continue;
        }
        while (stack.length > 1 && stack[stack.length - 1].cols >= cols) stack.pop();
        let parent = stack[stack.length - 1];
        if (parent.depth + 1 > LIMITS.depth) parent = stack[LIMITS.depth - 1];
        const item = { text, line, status: '', owner: '', evidence: [], children: [] };
        parent.item.children.push(item);
        stack = stack.slice(0, stack.indexOf(parent) + 1);
        stack.push({ cols, item, depth: parent.depth + 1 });
    }
    return out;
}
