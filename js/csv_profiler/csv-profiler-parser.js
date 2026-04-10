import {
    DELIMITER_CANDIDATES,
    DELIMITER_OPTIONS,
    SAMPLE_CHAR_SCAN_LIMIT,
    SAMPLE_ROW_SCAN_LIMIT,
    YIELD_CHAR_INTERVAL
} from './csv-profiler-config.js';
import { normalizeTextInput, yieldToMainThread } from './csv-profiler-utils.js';

export function getDelimiterOption(key) {
    return DELIMITER_OPTIONS[key] || DELIMITER_OPTIONS.auto;
}

export function detectDelimiter(text) {
    const normalized = normalizeTextInput(text);
    const logicalRows = collectLogicalRows(normalized, SAMPLE_ROW_SCAN_LIMIT, SAMPLE_CHAR_SCAN_LIMIT)
        .filter((row) => row.trim() !== '');

    if (logicalRows.length === 0) {
        return DELIMITER_OPTIONS.comma;
    }

    let bestCandidate = DELIMITER_OPTIONS.comma;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of DELIMITER_CANDIDATES) {
        const fieldCounts = logicalRows.map((row) => parseCsvRecord(row, candidate.character).length);
        const modeCount = findModeCount(fieldCounts);
        const average = fieldCounts.reduce((sum, value) => sum + value, 0) / fieldCounts.length;
        const variance = fieldCounts.reduce((sum, value) => sum + ((value - average) ** 2), 0) / fieldCounts.length;
        const consistency = modeCount / fieldCounts.length;
        const score = (average > 1 ? 100 : 0) + (consistency * 25) + average - variance;

        if (score > bestScore) {
            bestScore = score;
            bestCandidate = candidate;
        }
    }

    return bestCandidate;
}

export function collectSampleRows(text, delimiter, limit = SAMPLE_ROW_SCAN_LIMIT) {
    return collectLogicalRows(normalizeTextInput(text), limit, SAMPLE_CHAR_SCAN_LIMIT)
        .filter((row) => row.trim() !== '')
        .map((row) => parseCsvRecord(row, delimiter));
}

export async function parseCsvText(text, delimiter, callbacks = {}) {
    const normalized = normalizeTextInput(text);
    const totalLength = normalized.length || 1;
    let field = '';
    let row = [];
    let inQuotes = false;
    let rowIndex = 0;
    let lastYieldAt = 0;
    let currentRowLength = 0;

    async function emitRow() {
        row.push(field);
        field = '';

        const shouldContinue = callbacks.onRow ? callbacks.onRow(row, rowIndex) : true;
        rowIndex += 1;
        row = [];
        currentRowLength = 0;

        if (shouldContinue === false) {
            return false;
        }

        return true;
    }

    for (let index = 0; index < normalized.length; index += 1) {
        const character = normalized[index];

        if (inQuotes) {
            if (character === '"') {
                if (normalized[index + 1] === '"') {
                    field += '"';
                    currentRowLength += 1;
                    index += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                field += character;
                currentRowLength += 1;
            }
        } else if (character === '"') {
            if (field === '') {
                inQuotes = true;
            } else {
                field += character;
            }
        } else if (character === delimiter) {
            row.push(field);
            field = '';
            currentRowLength += 1;
        } else if (character === '\n') {
            const shouldContinue = await emitRow();
            if (shouldContinue === false) {
                callbacks.onProgress?.(1);
                return { rowsSeen: rowIndex, endedInsideQuotes: false, stoppedEarly: true };
            }
        } else if (character === '\r') {
            if (normalized[index + 1] === '\n') {
                index += 1;
            }

            const shouldContinue = await emitRow();
            if (shouldContinue === false) {
                callbacks.onProgress?.(1);
                return { rowsSeen: rowIndex, endedInsideQuotes: false, stoppedEarly: true };
            }
        } else {
            field += character;
            currentRowLength += 1;
        }

        if (callbacks.maxRowLength && currentRowLength > callbacks.maxRowLength) {
            throw new Error(`A logical row exceeded the ${callbacks.maxRowLength.toLocaleString('en-US')} character safety limit.`);
        }

        if ((index - lastYieldAt) >= YIELD_CHAR_INTERVAL) {
            callbacks.onProgress?.(Math.min(0.98, index / totalLength));
            await yieldToMainThread();
            lastYieldAt = index;
        }
    }

    if (field !== '' || row.length > 0) {
        const shouldContinue = await emitRow();
        if (shouldContinue === false) {
            callbacks.onProgress?.(1);
            return { rowsSeen: rowIndex, endedInsideQuotes: false, stoppedEarly: true };
        }
    }

    callbacks.onProgress?.(1);
    return {
        rowsSeen: rowIndex,
        endedInsideQuotes: inQuotes,
        stoppedEarly: false
    };
}

function collectLogicalRows(text, limit, charLimit) {
    const rows = [];
    let field = '';
    let inQuotes = false;
    const maxChars = Math.min(text.length, charLimit);

    for (let index = 0; index < maxChars; index += 1) {
        const character = text[index];

        if (inQuotes) {
            if (character === '"') {
                if (text[index + 1] === '"') {
                    field += '"';
                    index += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                field += character;
            }
        } else if (character === '"') {
            if (field === '') {
                inQuotes = true;
            } else {
                field += character;
            }
        } else if (character === '\n' || character === '\r') {
            rows.push(field);
            field = '';

            if (character === '\r' && text[index + 1] === '\n') {
                index += 1;
            }

            if (rows.length >= limit) {
                return rows;
            }
        } else {
            field += character;
        }
    }

    if (field) {
        rows.push(field);
    }

    return rows;
}

function parseCsvRecord(record, delimiter) {
    const row = [];
    let field = '';
    let inQuotes = false;

    for (let index = 0; index < record.length; index += 1) {
        const character = record[index];

        if (inQuotes) {
            if (character === '"') {
                if (record[index + 1] === '"') {
                    field += '"';
                    index += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                field += character;
            }
        } else if (character === '"') {
            if (field === '') {
                inQuotes = true;
            } else {
                field += character;
            }
        } else if (character === delimiter) {
            row.push(field);
            field = '';
        } else {
            field += character;
        }
    }

    row.push(field);
    return row;
}

function findModeCount(values) {
    const counts = new Map();
    let best = 0;

    for (const value of values) {
        const next = (counts.get(value) || 0) + 1;
        counts.set(value, next);
        best = Math.max(best, next);
    }

    return best;
}
