// One comparison run: pair results, the combined verdict, the preview and the
// full report. Runs in the compare worker, which keeps the tables so the page
// never has to; also importable directly for tests.

import { compareTables } from './diff-engine.js';
import { aggregate, incompletePair } from './diff-plan.js';
import { reportLines, preview, headline, codePointLength } from './diff-report.js';
import { decodeRows } from './diff-values.js';

function decodeTable(t) {
    const { keys, ...rest } = t;
    return { ...rest, rows: decodeRows(keys) };
}

// What the page shows for a pair; the report has the rest.
export function summarize(result) {
    const s = result.schema || null;
    const p = result.sameOrder;
    const q = result.sorted;
    return {
        sameOrder: p.verdict,
        sorted: q.verdict,
        headline: headline(result),
        leftRows: result.leftRows ?? null,
        rightRows: result.rightRows ?? null,
        changedCells: p.changedCells ?? null,
        matchedRows: q.matchedRows ?? null,
        leftOnlyRows: q.leftOnlyRows ?? null,
        rightOnlyRows: q.rightOnlyRows ?? null,
        schema: s && {
            status: s.status, columnOrderChanged: !!s.columnOrderChanged,
            missingRight: s.missingRight || [], extraRight: s.extraRight || [],
            nearMatches: s.nearMatches || [], problems: s.problems || [],
        },
        incomplete: result.incomplete ? { reason: result.incomplete.reason } : null,
    };
}

export function createSession() {
    let pairs = [];
    let run = null;

    return {
        start() { pairs = []; run = null; },

        // pair: { label, notes, left, right } with encoded tables, or
        // { label, notes, incomplete: { reason, ... } } when no tables exist.
        addPair(pair) {
            let result;
            let left = null;
            let right = null;
            if (pair.incomplete) {
                const { reason, ...detail } = pair.incomplete;
                result = incompletePair(reason, detail);
            } else {
                left = decodeTable(pair.left);
                right = decodeTable(pair.right);
                result = compareTables(left, right);
            }
            pairs.push({ label: pair.label, notes: pair.notes || [], left, right, result });
            return summarize(result);
        },

        finish(meta, cap) {
            if (!pairs.length) throw new Error('no pairs were compared');
            const agg = aggregate(pairs.map((p) => p.result));
            run = {
                toolVersion: meta.toolVersion,
                left: { label: meta.leftLabel },
                right: { label: meta.rightLabel },
                excluded: meta.excluded || { left: [], right: [] },
                unfinished: meta.unfinished || [],
                aggregate: agg,
                pairs,
            };
            return { aggregate: agg, preview: preview(reportLines(run), cap) };
        },

        // The full report as text chunks of about a megabyte each, built from
        // the result records, never from the preview.
        exportChunks() {
            if (!run) throw new Error('nothing to export');
            const chunks = [];
            let buf = [];
            let size = 0;
            let total = 0;
            for (const line of reportLines(run)) {
                buf.push(line, '\n');
                size += line.length + 1;
                total += codePointLength(line) + 1;
                if (size >= 1 << 20) { chunks.push(buf.join('')); buf = []; size = 0; }
            }
            if (buf.length) chunks.push(buf.join(''));
            return { chunks, totalCodePoints: total };
        },
    };
}
