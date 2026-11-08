// Practice checks and the tally line. Pure. Every check is a note to look at,
// never a block, and the word lists are one exported constant.

import { ROOT, BIN_ID, STATUS_LABELS, liveChildren, ancestors, live } from './fishbone-ops.js';

export const WORDS = Object.freeze({
    // A cause starting with one of these reads as a fix (ASQ, facilitation guides).
    fixStarts: Object.freeze(['install', 'add', 'train', 'implement', 'need', 'should']),
    // "Lack of training" proposes training.
    lackOf: 'lack of',
    // Only a label for a person, with nothing under it: ask why again.
    humanError: Object.freeze(['human error', 'operator error', 'carelessness', 'careless', 'forgot', "didn't follow procedure", 'did not follow procedure']),
    // A head starting with one of these states a solution, not a problem.
    effectStarts: Object.freeze(['need', 'lack of', 'should', 'how to'])
});

const norm = (text) => String(text || '').toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const startsWithWord = (text, word) => text === word || text.startsWith(`${word} `) || text.startsWith(`${word},`) || text.startsWith(`${word}:`);
const quote = (text) => `"${String(text || '(blank)').length > 60 ? `${String(text).slice(0, 57)}...` : String(text || '(blank)')}"`;

/** Live causes under a node, all levels. */
function causesUnder(board, id) {
    let n = 0;
    for (const kid of liveChildren(board, id)) n += 1 + causesUnder(board, kid);
    return n;
}

/** Names joined as "A", "A and B" or "A, B and C". */
export function joinNames(names) {
    if (names.length <= 1) return names.join('');
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The checks for a board. heights, when given, maps a category id to its drawn
 * height, for the tall-category note. Returns [{ code, nodeId, message }].
 */
export function runChecks(board, { heights = null } = {}) {
    const out = [];
    const add = (code, nodeId, message) => out.push({ code, nodeId, message });
    const effect = norm(board.effect);
    if (!effect) add('NO_EFFECT', null, 'There is no problem statement yet. Write the effect in the head before adding causes.');
    else {
        const word = WORDS.effectStarts.find((w) => startsWithWord(effect, w));
        if (word) add('EFFECT_IS_FIX', null, `The problem statement starts with "${word}", so it may describe a solution. State the problem as it is seen: what, where, when and how much.`);
    }

    const categories = liveChildren(board, ROOT).filter((id) => board.nodes[id].kind === 'category');
    const counts = categories.map((id) => causesUnder(board, id));
    const filled = counts.filter((c) => c > 0);
    const average = filled.length ? counts.reduce((a, b) => a + b, 0) / categories.length : 0;
    categories.forEach((id, i) => {
        const name = board.nodes[id].text || '(blank)';
        if (counts[i] === 0) add('EMPTY_CATEGORY', id, `${name} has nothing listed. When ideas dry up, look where the diagram is sparse.`);
        else if (categories.length > 1 && counts[i] < average / 3) add('SPARSE_CATEGORY', id, `${name} has ${counts[i]} cause${counts[i] === 1 ? '' : 's'}, under a third of the average. Worth another look.`);
    });

    if (heights) {
        const sorted = categories.map((id) => ({ id, h: heights[id] || 0 })).sort((a, b) => b.h - a.h);
        if (sorted.length > 1 && sorted[1].h > 0 && sorted[0].h > 2 * sorted[1].h) {
            add('TALL_CATEGORY', sorted[0].id, `${board.nodes[sorted[0].id].text || '(blank)'} is more than twice as tall as any other category, which makes the whole diagram tall. Consider splitting it.`);
        }
    }

    const seenText = new Map();
    const visit = (id) => {
        const node = board.nodes[id];
        const kids = liveChildren(board, id);
        if (node.kind === 'cause') {
            const text = norm(node.text);
            const fix = WORDS.fixStarts.find((w) => startsWithWord(text, w));
            if (fix) add('CAUSE_IS_FIX', id, `${quote(node.text)} starts with "${fix}", so it reads as a fix. Write the condition that causes the problem instead.`);
            else if (startsWithWord(text, WORDS.lackOf)) add('LACK_OF', id, `${quote(node.text)} starts with "lack of", which may be a fix in disguise. What is happening because of it?`);
            const human = WORDS.humanError.find((w) => startsWithWord(text, w));
            if (human && kids.length === 0) add('HUMAN_ERROR', id, `${quote(node.text)} stops at a person. Ask why again: what made the error easy to make?`);
            if (node.status === 'verified' && node.evidence.length === 0) add('VERIFIED_NO_EVIDENCE', id, `${quote(node.text)} is marked verified with no evidence written down.`);
            if (node.status === 'ruledOut' && node.evidence.length === 0) add('RULED_OUT_NO_EVIDENCE', id, `${quote(node.text)} is marked ruled out with no evidence written down.`);
            if (node.status === 'verified' && ancestors(board, id).some((a) => a.status === 'ruledOut')) {
                add('VERIFIED_UNDER_RULED_OUT', id, `${quote(node.text)} is verified, but a cause above it is ruled out.`);
            }
            if (text) {
                if (!seenText.has(text)) seenText.set(text, []);
                seenText.get(text).push(id);
            }
        }
        const siblings = new Map();
        for (const kid of kids) {
            const key = norm(board.nodes[kid].text);
            if (!key) continue;
            if (siblings.has(key)) add('DUPLICATE_SIBLING', kid, `${quote(board.nodes[kid].text)} appears twice under ${quote(node.text)}. Merge the two.`);
            else siblings.set(key, kid);
        }
        for (const kid of kids) visit(kid);
    };
    for (const id of liveChildren(board, ROOT)) visit(id);

    for (const ids of seenText.values()) {
        const cats = new Set(ids.map((id) => topOf(board, id)));
        if (cats.size > 1) {
            const names = [...cats].map((c) => board.nodes[c].text || '(blank)');
            add('SAME_IN_CATEGORIES', ids[0], `${quote(board.nodes[ids[0]].text)} is under ${joinNames(names)}. That is fine: a cause can sit in several places if it relates to several categories.`);
        }
    }
    return out;
}

function topOf(board, id) {
    const chain = ancestors(board, id);
    return chain.length ? chain[chain.length - 1].id : id;
}

/** Counts behind the tally line. */
export function tallyCounts(board) {
    const counts = { causes: 0, categories: 0, unsorted: 0, suspected: 0, verified: 0, ruledOut: 0, notExamined: 0, proposals: 0, deepest: 0, empty: [] };
    const walk = (id, depth) => {
        const node = board.nodes[id];
        if (node.kind === 'cause') {
            counts.causes += 1;
            counts.deepest = Math.max(counts.deepest, depth);
            if (node.status === 'suspected') counts.suspected += 1;
            else if (node.status === 'verified') counts.verified += 1;
            else if (node.status === 'ruledOut') counts.ruledOut += 1;
            else counts.notExamined += 1;
            if (node.proposal) counts.proposals += 1;
        }
        for (const kid of liveChildren(board, id)) walk(kid, depth + 1);
    };
    for (const id of liveChildren(board, ROOT)) {
        const node = board.nodes[id];
        if (node.kind === 'category') {
            counts.categories += 1;
            if (!liveChildren(board, id).length) counts.empty.push(node.text || '(blank)');
        }
        walk(id, 0);
    }
    const bin = live(board, BIN_ID);
    if (bin) counts.unsorted = causesUnder(board, BIN_ID);
    return counts;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * "23 causes in 6 categories, 4 still unsorted: 2 verified, 5 ruled out,
 * 4 suspected, 12 not examined. Deepest chain 4 whys. Measurement has nothing listed."
 */
export function tallyLine(board) {
    const c = tallyCounts(board);
    let line = `${plural(c.causes, 'cause')} in ${plural(c.categories, 'category', 'categories')}`;
    if (c.unsorted) line += `, ${c.unsorted} still unsorted`;
    if (c.causes) {
        const parts = [];
        if (c.verified) parts.push(`${c.verified} ${STATUS_LABELS.verified}`);
        if (c.ruledOut) parts.push(`${c.ruledOut} ${STATUS_LABELS.ruledOut}`);
        if (c.suspected) parts.push(`${c.suspected} ${STATUS_LABELS.suspected}`);
        if (c.notExamined) parts.push(`${c.notExamined} ${STATUS_LABELS['']}`);
        line += `: ${parts.join(', ')}.`;
        line += ` Deepest chain ${plural(c.deepest, 'why', 'whys')}.`;
    } else {
        line += '.';
    }
    if (c.proposals) line += ` ${plural(c.proposals, 'proposal')} waiting.`;
    if (c.empty.length) line += ` ${joinNames(c.empty)} ${c.empty.length === 1 ? 'has' : 'have'} nothing listed.`;
    return line;
}
