// OCR Text Extractor: when the second engine is used, what its answer becomes,
// and how two readings of one page are compared. Pure, no imports, no DOM.

export const SECOND = Object.freeze({
    // A page the first engine read under this, or found nothing on, is given
    // to the second. The same line as a page marked "low".
    tryBelow: 70,
    // The second reading is kept only when it scores this or better. Good
    // readings measured 97 to 99, and one a fifth wrong measured 87,
    keepAt: 90,
    // and holds at least this share of the characters the first one found.
    keepShare: 0.5,
    // A word whose least certain character scored under this is listed for
    // checking. Misread words measured 51 to 81, and most right ones over 85.
    lowWord: 85,
    // and no more than this share of the lines it found came back as nothing.
    maxLost: 0.25,
    // Lines sloping more than this are read after the page is turned level:
    // from 45 degrees the engine loses most of them and still scores itself 99.
    turnFromDegrees: 30,
    // How many of the longest lines are read both ways up to tell which is right.
    wayUpSample: 5,
    // What the second engine fetches the first time, for the messages.
    megabytes: 27,
    // Two readings longer than this many word pairs are not compared word by word.
    maxDiffCells: 6_000_000
});

const visible = (text) => String(text || '').replace(/\s/g, '').length;

// `marked` is whether the page holds anything that stands out from its
// paper, so that a blank page is not sent to a second engine.
export function needsSecond(first, marked, limits = SECOND) {
    if (visible(first.text) === 0) return Boolean(marked);
    return first.confidence < limits.tryBelow;
}

// The two engines score themselves on different scales, so the scores are
// never compared with each other, only each against its own line.
export function secondWins(first, second, limits = SECOND) {
    const found = visible(second.text);
    if (found === 0 || second.confidence < limits.keepAt) return false;
    if ((second.lost || 0) > (second.found || 0) * limits.maxLost) return false;
    return found >= visible(first.text) * limits.keepShare;
}

// Which lines each of `parts` workers reads: dealt out in turn, so that long
// and short lines fall to each about evenly.
export function shareOut(count, parts) {
    const shares = Array.from({ length: Math.max(1, parts) }, () => []);
    for (let index = 0; index < count; index++) shares[index % shares.length].push(index);
    return shares;
}

export function doubtedBySecond(words, limits = SECOND) {
    return (words || []).filter((word) => word.confidence < limits.lowWord);
}

// What a page's row says about which engine its text came from.
export function describeEngine(page) {
    if (!page.readings) return '';
    if (page.picked) return `, ${page.engine} engine reading, picked by hand`;
    if (page.engine === 'second') {
        const first = page.readings.first;
        const why = visible(first.text) === 0 ? 'found nothing' : `scored ${Math.floor(first.confidence)}`;
        return `, read by the second engine (the first ${why})`;
    }
    if (page.secondFailed) return ', second engine failed';
    if (page.readings.second && !page.compared) return ', second engine tried and not kept';
    return '';
}

const edge = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// The slope of the lines on a page, in radians from level, clockwise as the
// image is seen, in (-90, 90] degrees. Each box votes with its long side and
// by its length. A slope has no direction, so the angles are doubled before
// they are averaged, which is what lets 89 and -89 agree.
export function lineAngle(boxes) {
    let x = 0;
    let y = 0;
    for (const box of boxes || []) {
        const across = edge(box[0], box[1]);
        const down = edge(box[0], box[3]);
        // Nearly square boxes say nothing about which way the print runs.
        if (Math.max(across, down) < Math.min(across, down) * 2) continue;
        const [from, to] = across >= down ? [box[0], box[1]] : [box[0], box[3]];
        const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
        const weight = Math.max(across, down);
        x += Math.cos(2 * angle) * weight;
        y += Math.sin(2 * angle) * weight;
    }
    return x === 0 && y === 0 ? 0 : Math.atan2(y, x) / 2;
}

export function isSteep(angle, limits = SECOND) {
    return Math.abs(angle) > limits.turnFromDegrees * Math.PI / 180;
}

// The numbers of the `count` longest boxes.
export function longestLines(boxes, count) {
    return boxes.map((box, index) => ({ index, length: Math.max(edge(box[0], box[1]), edge(box[0], box[3])) }))
        .sort((a, b) => b.length - a.length || a.index - b.index).slice(0, count).map((entry) => entry.index);
}

// A box on an image that turned out to be upside down, as it lies once the
// image is turned half way round: its corners again from the top left.
export function turnedOver(box, width, height) {
    const over = (point) => [width - point[0], height - point[1]];
    return [over(box[2]), over(box[3]), over(box[0]), over(box[1])];
}

// A box found on a page turned by `turn` radians about its center onto a
// canvas of size `turned`, put back on the page as it came, of size `page`.
export function turnBack(box, turn, turned, page) {
    const cos = Math.cos(-turn);
    const sin = Math.sin(-turn);
    return box.map(([x, y]) => {
        const dx = x - turned.width / 2;
        const dy = y - turned.height / 2;
        return [page.width / 2 + dx * cos - dy * sin, page.height / 2 + dx * sin + dy * cos];
    });
}

const along = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// The upright box around the part of a line between two fractions of its
// length. `box` is the line's four corners from the top left, clockwise.
export function partOfLine(box, from, to) {
    const corners = [along(box[0], box[1], from), along(box[0], box[1], to), along(box[3], box[2], from), along(box[3], box[2], to)];
    const xs = corners.map((point) => point[0]);
    const ys = corners.map((point) => point[1]);
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

// lines: [{ box, chars: [{ t, mean }] }] as found. order: paragraphs of line
// numbers in reading order. A word scores as its least certain character, and
// its box is its share of the line's length, which is near enough to show the
// pixels and no better.
export function readingFromLines(lines, order) {
    const words = [];
    const kept = [];
    const paragraphs = [];
    const found = (lines || []).length;
    for (const paragraph of order || []) {
        const rows = [];
        for (const index of paragraph) {
            const line = lines[index];
            if (!line) continue;
            const chars = line.chars || [];
            const text = chars.map((char) => char.t).join('');
            if (text.trim() === '') continue;
            let start = -1;
            for (let i = 0; i <= chars.length; i++) {
                const gap = i === chars.length || /\s/.test(chars[i].t);
                if (!gap && start < 0) start = i;
                if (gap && start >= 0) {
                    const part = chars.slice(start, i);
                    words.push({
                        text: part.map((char) => char.t).join(''),
                        confidence: Math.min(...part.map((char) => char.mean)) * 100,
                        bbox: partOfLine(line.box, start / chars.length, i / chars.length)
                    });
                    start = -1;
                }
            }
            const row = text.trim().replace(/\s+/g, ' ');
            rows.push(row);
            kept.push({ text: row, box: line.box });
        }
        if (rows.length) paragraphs.push(rows.join('\n'));
    }
    const confidence = words.length ? words.reduce((sum, word) => sum + word.confidence, 0) / words.length : 0;
    // `lost` is how many of the lines found came back holding nothing.
    return { text: paragraphs.join('\n\n'), confidence, words, lines: kept, found, lost: found - kept.length };
}

// Where one line of hidden text goes on a PDF page as tall as the image it
// was read from, in points equal to pixels. `unitWidth` is the width of the
// text in the font at size 1. The text is stretched to the line's length and
// laid along its slope.
export function textLinePlacement(box, pageHeight, unitWidth) {
    const [topLeft, topRight, bottomRight, bottomLeft] = box;
    const length = Math.hypot(bottomRight[0] - bottomLeft[0], bottomRight[1] - bottomLeft[1]);
    const height = (Math.hypot(bottomLeft[0] - topLeft[0], bottomLeft[1] - topLeft[1]) +
        Math.hypot(bottomRight[0] - topRight[0], bottomRight[1] - topRight[1])) / 2;
    if (!(length > 0) || !(height > 0) || !(unitWidth > 0)) return null;
    // Image rows run down the page and PDF rows run up it.
    const angle = Math.atan2(-(bottomRight[1] - bottomLeft[1]), bottomRight[0] - bottomLeft[0]);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const stretch = length / (unitWidth * height);
    // The baseline sits a fifth of the way up the box, above the descenders.
    const lift = height * 0.2;
    const x = bottomLeft[0] - sin * lift;
    const y = pageHeight - bottomLeft[1] + cos * lift;
    return { size: height, matrix: [stretch * cos, stretch * sin, -sin, cos, x, y] };
}

// Word by word, which words of each reading the other also has, in order.
// Agreement is the share of all words that are matched. Null when the two are
// too long to line up.
export function diffWords(leftText, rightText, limits = SECOND) {
    const split = (text) => {
        const words = String(text || '').trim().split(/\s+/);
        return words[0] === '' ? [] : words;
    };
    const left = split(leftText);
    const right = split(rightText);
    const n = left.length;
    const m = right.length;
    if (n + m === 0) return { left: [], right: [], agreement: 1 };
    if (n * m > limits.maxDiffCells) return null;
    // Longest common run of words, by the usual table.
    const width = m + 1;
    const table = new Uint32Array((n + 1) * width);
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            table[i * width + j] = left[i] === right[j]
                ? table[(i + 1) * width + j + 1] + 1
                : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
        }
    }
    const leftOut = left.map((text) => ({ text, same: false }));
    const rightOut = right.map((text) => ({ text, same: false }));
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
        if (left[i] === right[j]) {
            leftOut[i++].same = true;
            rightOut[j++].same = true;
        } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
            i++;
        } else {
            j++;
        }
    }
    return { left: leftOut, right: rightOut, agreement: (2 * table[0]) / (n + m) };
}
