// Header alignment for Dataset Diff. Pure, no DOM.
//
// Headers are matched by exact string. The left table's order is canonical;
// the right table is read through `order`, where order[c] is the right column
// holding the left table's column c.

function headerProblems(side, headers) {
    const problems = [];
    if (headers.length === 0) problems.push({ side, kind: 'no-columns' });
    const seen = new Map();
    headers.forEach((h, i) => {
        if (h === '') {
            problems.push({ side, kind: 'blank-header', column: i });
        } else if (seen.has(h)) {
            problems.push({ side, kind: 'duplicate-header', header: h, columns: [seen.get(h), i] });
        } else {
            seen.set(h, i);
        }
    });
    return problems;
}

const loose = (h) => h.trim().toLowerCase();

// status 'same' (with order and columnOrderChanged), 'different' (missing or
// extra headers, plus near matches that differ only in case or outer spaces),
// or 'ambiguous' (blank, duplicate or no headers, which need labels first).
export function alignHeaders(left, right) {
    const problems = [...headerProblems('left', left), ...headerProblems('right', right)];
    if (problems.length) return { status: 'ambiguous', problems };

    const rightIndex = new Map(right.map((h, i) => [h, i]));
    const leftSet = new Set(left);
    const missingRight = left.filter((h) => !rightIndex.has(h));
    const extraRight = right.filter((h) => !leftSet.has(h));
    if (missingRight.length || extraRight.length) {
        const nearMatches = [];
        for (const m of missingRight) {
            for (const x of extraRight) {
                if (loose(m) === loose(x)) nearMatches.push({ left: m, right: x });
            }
        }
        return { status: 'different', missingRight, extraRight, nearMatches };
    }

    const order = left.map((h) => rightIndex.get(h));
    return { status: 'same', order, columnOrderChanged: order.some((j, i) => j !== i) };
}
