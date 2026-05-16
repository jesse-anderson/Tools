export const EPS = 1e-10;

export function nearlyEqual(a, b, tolerance = EPS) {
    return Math.abs(a - b) <= tolerance;
}

export function lerp(x, x1, y1, x2, y2) {
    if (nearlyEqual(x1, x2)) {
        return y1;
    }
    return y1 + (y2 - y1) * (x - x1) / (x2 - x1);
}

export function inverseLerp(y, x1, y1, x2, y2) {
    if (nearlyEqual(y1, y2)) {
        return (x1 + x2) / 2;
    }
    return x1 + (x2 - x1) * (y - y1) / (y2 - y1);
}

export function containsValue(target, a, b, tolerance = 1e-9) {
    const low = Math.min(a, b) - tolerance;
    const high = Math.max(a, b) + tolerance;
    return target >= low && target <= high;
}

export function uniqueSorted(values, tolerance = 1e-9) {
    const sorted = values
        .filter((value) => Number.isFinite(value))
        .sort((a, b) => a - b);
    const result = [];

    for (const value of sorted) {
        if (!result.length || Math.abs(value - result[result.length - 1]) > tolerance) {
            result.push(value);
        }
    }

    return result;
}

export function bracketSorted(values, target) {
    if (!values.length) {
        throw new Error('Cannot bracket an empty array.');
    }

    if (target <= values[0]) {
        return {
            lowIndex: 0,
            highIndex: 0,
            low: values[0],
            high: values[0],
            clamped: target < values[0] ? 'low' : null
        };
    }

    const last = values.length - 1;
    if (target >= values[last]) {
        return {
            lowIndex: last,
            highIndex: last,
            low: values[last],
            high: values[last],
            clamped: target > values[last] ? 'high' : null
        };
    }

    let lo = 0;
    let hi = last;
    while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (values[mid] <= target) {
            lo = mid;
        } else {
            hi = mid;
        }
    }

    return {
        lowIndex: lo,
        highIndex: hi,
        low: values[lo],
        high: values[hi],
        clamped: null
    };
}

export function bracketRows(rows, target, key, indexValues = null) {
    const values = indexValues || rows.map((row) => row[key]);
    const bracket = bracketSorted(values, target);
    return {
        ...bracket,
        lowRow: rows[bracket.lowIndex],
        highRow: rows[bracket.highIndex]
    };
}
