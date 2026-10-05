// OCR Text Extractor: two repairs made to a page before it is read, each only
// when a measurement of the page says it is needed, so a clean scan passes
// through untouched. The numeric parts take plain arrays and no DOM.

export const PREPARE = Object.freeze({
    // Share by which paper brightness may vary across the page before it is evened.
    unevenGate: 0.2,
    // The engine straightens a tilt of about 5 degrees itself and gives up
    // well before 12, so anything from here up is turned first.
    turnFromDegrees: 6,
    turnToDegrees: 30,
    // How much better rows of ink must line up at the found angle than level.
    turnStrength: 1.5,
    // A pixel this far from the page's middle brightness is a mark, and a page
    // with this share of them holds something to read. A blank scan has none.
    markDistance: 24,
    markShare: 0.0005,
    // A page whose middle pixel is darker than this is light print on a dark
    // ground, such as a dark-mode screenshot, and its light is left alone.
    darkPage: 100,
    // Print whose lines are shorter than this many pixels, top of the tallest
    // letter to bottom of the lowest, is enlarged before reading.
    smallPrint: 20,
    probeSide: 700
});

export function luminance(rgba, count) {
    const lum = new Uint8ClampedArray(count);
    for (let i = 0; i < count; i++) {
        lum[i] = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8;
    }
    return lum;
}

// The middle value of a page's brightness.
export function medianLuminance(lum) {
    const counts = new Uint32Array(256);
    for (let i = 0; i < lum.length; i++) counts[lum[i]]++;
    let seen = 0;
    for (let value = 0; value < 256; value++) {
        seen += counts[value];
        if (seen * 2 >= lum.length) return value;
    }
    return 255;
}

// The share of pixels that stand out from the page's middle brightness.
export function markedShare(lum, limits = PREPARE) {
    const middle = medianLuminance(lum);
    let marks = 0;
    for (let i = 0; i < lum.length; i++) {
        if (Math.abs(lum[i] - middle) > limits.markDistance) marks++;
    }
    return lum.length ? marks / lum.length : 0;
}

// How tall a line of print is, in pixels: the middle length of the runs of
// rows that hold print. 0 when there is too little to say. Works for dark
// print on light and light print on dark.
export function lineHeight(lum, width, height, limits = PREPARE) {
    let sum = 0;
    for (let i = 0; i < lum.length; i++) sum += lum[i];
    const mean = sum / lum.length;
    const dark = medianLuminance(lum) < limits.darkPage;
    const cut = dark ? mean + (255 - mean) * 0.4 : mean * 0.75;
    const inked = (x, y) => (dark ? lum[y * width + x] > cut : lum[y * width + x] < cut);
    // A column inked most of the way down, or a row most of the way across, is
    // a ruled line and not print. Counting them made a ruled table look like
    // small print, or like one line as tall as the table.
    const upright = new Uint8Array(width);
    for (let x = 0; x < width; x++) {
        let ink = 0;
        for (let y = 0; y < height; y++) if (inked(x, y)) ink++;
        if (ink > height * 0.4) upright[x] = 1;
    }
    const need = Math.max(2, Math.round(width * 0.004));
    const runs = [];
    let run = 0;
    for (let y = 0; y <= height; y++) {
        let ink = 0;
        if (y < height) {
            for (let x = 0; x < width; x++) if (!upright[x] && inked(x, y)) ink++;
        }
        if (ink >= need && ink < width * 0.6) {
            run++;
        } else {
            // A run only a few rows deep is a rule or a speck.
            if (run >= 4) runs.push(run);
            run = 0;
        }
    }
    if (runs.length === 0) return 0;
    runs.sort((a, b) => a - b);
    return runs[Math.floor(runs.length / 2)];
}

// How many times to enlarge print of this line height: twice, or three times
// when it is under half the limit. 1 leaves it alone.
export function enlargeBy(linePixels, limits = PREPARE) {
    if (!(linePixels > 0) || linePixels >= limits.smallPrint) return 1;
    return linePixels * 2 < limits.smallPrint ? 3 : 2;
}

// One pass along x then one along y of a running maximum, minimum or mean.
function sweep(grid, gw, gh, radius, kind) {
    const run = (source, across) => {
        const out = new Float32Array(gw * gh);
        for (let y = 0; y < gh; y++) {
            for (let x = 0; x < gw; x++) {
                let value = kind === 'min' ? Infinity : 0;
                let n = 0;
                for (let k = -radius; k <= radius; k++) {
                    const xx = across ? x + k : x;
                    const yy = across ? y : y + k;
                    if (xx < 0 || xx >= gw || yy < 0 || yy >= gh) continue;
                    const v = source[yy * gw + xx];
                    if (kind === 'max') value = Math.max(value, v);
                    else if (kind === 'min') value = Math.min(value, v);
                    else value += v;
                    n++;
                }
                out[y * gw + x] = kind === 'mean' ? value / n : value;
            }
        }
        return out;
    };
    return run(run(grid, true), false);
}

// Paper brightness over the page, on a coarse grid. Paper is the brightest
// thing near any print, so each block takes its maximum; a widening then a
// narrowing (a closing) fills in the print without letting bright paper spread
// into a dark surround, and a mean smooths the result.
export function paperMap(lum, width, height) {
    const block = Math.max(4, Math.round(Math.max(width, height) / 200));
    const gw = Math.ceil(width / block);
    const gh = Math.ceil(height / block);
    let grid = new Float32Array(gw * gh);
    for (let y = 0; y < height; y++) {
        const row = Math.floor(y / block) * gw;
        for (let x = 0; x < width; x++) {
            const k = row + Math.floor(x / block);
            const v = lum[y * width + x];
            if (v > grid[k]) grid[k] = v;
        }
    }
    const radius = 4;
    grid = sweep(grid, gw, gh, radius, 'max');
    grid = sweep(grid, gw, gh, radius, 'min');
    grid = sweep(grid, gw, gh, radius, 'mean');
    const sorted = Float32Array.from(grid).sort();
    const low = sorted[Math.floor(sorted.length * 0.05)];
    const high = sorted[Math.floor(sorted.length * 0.95)];
    return { grid, gw, gh, block, uneven: 1 - low / Math.max(high, 1) };
}

// Divides every pixel by the paper brightness under it, in place, leaving gray.
export function flattenLight(rgba, lum, width, height, map) {
    const { grid, gw, gh, block } = map;
    for (let y = 0; y < height; y++) {
        const fy = Math.min(gh - 1, Math.max(0, y / block - 0.5));
        const y0 = Math.floor(fy);
        const y1 = Math.min(gh - 1, y0 + 1);
        const ty = fy - y0;
        for (let x = 0; x < width; x++) {
            const fx = Math.min(gw - 1, Math.max(0, x / block - 0.5));
            const x0 = Math.floor(fx);
            const x1 = Math.min(gw - 1, x0 + 1);
            const tx = fx - x0;
            const paper = (grid[y0 * gw + x0] * (1 - tx) + grid[y0 * gw + x1] * tx) * (1 - ty) +
                (grid[y1 * gw + x0] * (1 - tx) + grid[y1 * gw + x1] * tx) * ty;
            // The floor keeps deep shadow from being amplified into speckle.
            const value = Math.min(255, lum[y * width + x] * 255 / Math.max(paper, 64));
            const i = (y * width + x) * 4;
            rgba[i] = rgba[i + 1] = rgba[i + 2] = value;
            rgba[i + 3] = 255;
        }
    }
}

// The tilt of the print, by projection profile: the angle at which the ink
// falls into the fewest, fullest rows. `degrees` is how far the print is
// turned clockwise, and `strength` how much fuller the rows are than level.
export function estimateSkew(lum, width, height, limits = PREPARE) {
    let sum = 0;
    for (let i = 0; i < lum.length; i++) sum += lum[i];
    const cut = sum / lum.length * 0.75;
    const xs = [];
    const ys = [];
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (lum[y * width + x] < cut) {
                xs.push(x - width / 2);
                ys.push(y - height / 2);
            }
        }
    }
    // Too little ink to judge, or so much that it is not print on paper.
    if (xs.length < 200 || xs.length > lum.length * 0.4) return { degrees: 0, strength: 0 };

    const size = Math.ceil(Math.hypot(width, height)) + 2;
    const bins = new Float64Array(size);
    const score = (degrees) => {
        const angle = degrees * Math.PI / 180;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        bins.fill(0);
        for (let i = 0; i < xs.length; i++) bins[Math.floor(ys[i] * cos - xs[i] * sin + size / 2)]++;
        let total = 0;
        for (let i = 0; i < size; i++) total += bins[i] * bins[i];
        return total;
    };
    const level = score(0);
    let best = 0;
    let bestScore = level;
    for (let degrees = -limits.turnToDegrees; degrees <= limits.turnToDegrees; degrees++) {
        const value = score(degrees);
        if (value > bestScore) { bestScore = value; best = degrees; }
    }
    const coarse = best;
    for (let step = -9; step <= 9; step++) {
        const degrees = coarse + step / 10;
        const value = score(degrees);
        if (value > bestScore) { bestScore = value; best = degrees; }
    }
    return { degrees: Math.round(best * 10) / 10, strength: bestScore / level };
}

export function shouldTurn(skew, limits = PREPARE) {
    const size = Math.abs(skew.degrees);
    return size >= limits.turnFromDegrees && size <= limits.turnToDegrees && skew.strength >= limits.turnStrength;
}

function probe(canvas, limits) {
    const k = Math.min(1, limits.probeSide / Math.max(canvas.width, canvas.height));
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(canvas.width * k));
    small.height = Math.max(1, Math.round(canvas.height * k));
    const context = small.getContext('2d', { willReadFrequently: true });
    context.imageSmoothingQuality = 'high';
    context.drawImage(canvas, 0, 0, small.width, small.height);
    const data = context.getImageData(0, 0, small.width, small.height).data;
    return { lum: luminance(data, small.width * small.height), width: small.width, height: small.height };
}

// Returns the canvas to read and what was done to it. With nothing to repair
// it is the same canvas. `turnRadians` is the angle the page was turned by, in
// the sense the engine reports its own, and `frame` how much of the page the
// canvas that is read covers, since a turned page needs room for its corners.
// Enlarging does not change the frame: the same page is covered by more pixels.
// `marked` is whether the page holds anything that stands out from its paper.
export function prepare(canvas, limits = PREPARE, maxPixels = Infinity) {
    const result = { canvas, evened: false, turnDegrees: 0, turnRadians: 0, enlarged: 1, frame: { x: 1, y: 1 }, marked: false };
    // Every canvas made here but the last is released as soon as it is replaced.
    const replace = (next) => {
        if (result.canvas !== canvas) result.canvas.width = 0;
        result.canvas = next;
    };
    let small = probe(canvas, limits);

    const dark = medianLuminance(small.lum) < limits.darkPage;
    if (!dark && paperMap(small.lum, small.width, small.height).uneven >= limits.unevenGate) {
        const out = document.createElement('canvas');
        out.width = canvas.width;
        out.height = canvas.height;
        const context = out.getContext('2d', { willReadFrequently: true });
        context.drawImage(canvas, 0, 0);
        const image = context.getImageData(0, 0, out.width, out.height);
        const lum = luminance(image.data, out.width * out.height);
        flattenLight(image.data, lum, out.width, out.height, paperMap(lum, out.width, out.height));
        context.putImageData(image, 0, 0);
        replace(out);
        result.evened = true;
        small = probe(out, limits);
    }

    const skew = estimateSkew(small.lum, small.width, small.height, limits);
    if (shouldTurn(skew, limits)) {
        const source = result.canvas;
        const angle = -skew.degrees * Math.PI / 180;
        const cos = Math.abs(Math.cos(angle));
        const sin = Math.abs(Math.sin(angle));
        const out = document.createElement('canvas');
        out.width = Math.ceil(source.width * cos + source.height * sin);
        out.height = Math.ceil(source.width * sin + source.height * cos);
        const context = out.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, out.width, out.height);
        context.translate(out.width / 2, out.height / 2);
        context.rotate(angle);
        context.drawImage(source, -source.width / 2, -source.height / 2);
        result.frame = { x: out.width / canvas.width, y: out.height / canvas.height };
        replace(out);
        result.turnDegrees = skew.degrees;
        result.turnRadians = angle;
        small = probe(out, limits);
    }

    // Measured on the probe, so brought back to the pixels of the page.
    const source = result.canvas;
    const shrink = small.width / source.width;
    result.marked = markedShare(small.lum, limits) >= limits.markShare;
    let factor = enlargeBy(lineHeight(small.lum, small.width, small.height, limits) / shrink, limits);
    while (factor > 1 && source.width * source.height * factor * factor > maxPixels) factor--;
    if (factor > 1) {
        const out = document.createElement('canvas');
        out.width = source.width * factor;
        out.height = source.height * factor;
        const context = out.getContext('2d');
        context.imageSmoothingQuality = 'high';
        context.drawImage(source, 0, 0, out.width, out.height);
        replace(out);
        result.enlarged = factor;
    }
    return result;
}

// The same picture turned half way round, for a page that read as nonsense.
export function upsideDown(canvas) {
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height;
    const context = out.getContext('2d');
    context.translate(out.width, out.height);
    context.rotate(Math.PI);
    context.drawImage(canvas, 0, 0);
    return out;
}
