import {
    DELIMITER_CANDIDATES,
    HISTOGRAM_BIN_COUNT,
    MAX_COLUMN_COUNT,
    MAX_HISTOGRAM_COLUMNS,
    MAX_NUMERIC_SAMPLES,
    MAX_PREVIEW_ROWS,
    MAX_ROW_CHAR_LENGTH,
    MAX_SAMPLE_VALUES,
    MAX_UNIQUE_TRACKED
} from './csv-profiler-config.js';
import { collectSampleRows, detectDelimiter, getDelimiterOption, parseCsvText } from './csv-profiler-parser.js';
import {
    buildUniqueNames,
    classifyScalar,
    escapeSqlIdentifier,
    getPercent,
    isBlankRow
} from './csv-profiler-utils.js';

export async function profileCsvFile(options) {
    const delimiterOption = options.delimiterMode === 'auto'
        ? detectDelimiter(options.text)
        : getDelimiterOption(options.delimiterMode);
    const sampleRows = collectSampleRows(options.text, delimiterOption.character);
    const headerPresent = resolveHeaderPresence(sampleRows, options.headerMode);
    const parseStartedAt = performance.now();

    let headerRow = null;
    let rowsProfiled = 0;
    let blankRows = 0;
    let inconsistentRows = 0;
    let duplicateRows = 0;
    let columnCount = 0;
    let baselineWidth = null;
    let totalNullCells = 0;
    let stoppedAtRowLimit = false;
    let duplicateTrackingOverflow = false;
    const alternateDelimiterEvidence = createAlternateDelimiterEvidence(delimiterOption.character);
    const previewRows = [];
    const profiles = [];
    const seenRows = new Set();

    const parseResult = await parseCsvText(options.text, delimiterOption.character, {
        maxRowLength: MAX_ROW_CHAR_LENGTH,
        onProgress(progress) {
            options.onProgress?.(progress);
        },
        onRow(row, rawRowIndex) {
            if (isBlankRow(row)) {
                blankRows += 1;
                return true;
            }

            if (row.length > MAX_COLUMN_COUNT) {
                throw new Error(`This file has a row with ${row.length.toLocaleString('en-US')} columns. CSV Profiler is capped at ${MAX_COLUMN_COUNT.toLocaleString('en-US')} columns per file.`);
            }

            if (headerPresent && rawRowIndex === 0) {
                headerRow = row.slice();
                baselineWidth = row.length;
                columnCount = Math.max(columnCount, row.length);
                ensureProfiles(profiles, columnCount, 0);
                return true;
            }

            if (rowsProfiled >= options.maxRows) {
                stoppedAtRowLimit = true;
                return false;
            }

            rowsProfiled += 1;
            updateAlternateDelimiterEvidence(alternateDelimiterEvidence, row);
            baselineWidth = baselineWidth === null ? row.length : baselineWidth;

            if (row.length !== baselineWidth) {
                inconsistentRows += 1;
            }

            if (row.length > columnCount) {
                const previousColumnCount = columnCount;
                columnCount = row.length;
                ensureProfiles(profiles, columnCount, rowsProfiled - 1);
                totalNullCells += (rowsProfiled - 1) * (columnCount - previousColumnCount);
            }

            for (let index = 0; index < columnCount; index += 1) {
                const value = index < row.length ? row[index] : '';
                if (value.trim() === '') {
                    totalNullCells += 1;
                }

                updateProfile(profiles[index], value);
            }

            if (!duplicateTrackingOverflow) {
                const rowSignature = fingerprintRow(row);
                if (seenRows.has(rowSignature)) {
                    duplicateRows += 1;
                } else {
                    seenRows.add(rowSignature);
                }

                if (seenRows.size > options.maxRows) {
                    duplicateTrackingOverflow = true;
                    seenRows.clear();
                }
            }

            if (previewRows.length < MAX_PREVIEW_ROWS) {
                previewRows.push(row.slice());
            }

            return true;
        }
    });

    if (headerPresent && !headerRow && sampleRows.length > 0) {
        headerRow = sampleRows[0].slice();
        columnCount = Math.max(columnCount, headerRow.length);
        ensureProfiles(profiles, columnCount, 0);
    }

    const displayNames = buildDisplayNames(headerPresent, headerRow, columnCount);
    const sqlNames = buildUniqueNames(displayNames, 'column');
    const finalizedColumns = finalizeProfiles({
        profiles,
        displayNames,
        sqlNames,
        rowsProfiled
    });
    const histogramColumns = buildHistogramColumns(finalizedColumns);
    const qualityNotes = buildQualityNotes({
        rowsProfiled,
        blankRows,
        inconsistentRows,
        duplicateRows,
        stoppedAtRowLimit,
        columns: finalizedColumns,
        delimiter: delimiterOption,
        alternateDelimiterEvidence,
        endedInsideQuotes: parseResult.endedInsideQuotes
    });

    return {
        fileName: options.fileName,
        delimiter: delimiterOption,
        headerPresent,
        parseMs: performance.now() - parseStartedAt,
        rowsProfiled,
        blankRows,
        columnCount,
        duplicateRows,
        inconsistentRows,
        totalNullCells,
        stoppedAtRowLimit,
        duplicateTrackingOverflow,
        alternateDelimiterEvidence,
        endedInsideQuotes: parseResult.endedInsideQuotes,
        columns: finalizedColumns,
        previewRows,
        histogramColumns,
        qualityNotes,
        sqlSchema: buildSqlSchema(sqlNames, finalizedColumns),
        jsonSchema: buildJsonSchema({
            fileName: options.fileName,
            delimiter: delimiterOption,
            headerPresent,
            rowsProfiled,
            blankRows,
            columnCount,
            duplicateRows,
            inconsistentRows,
            totalNullCells,
            stoppedAtRowLimit,
            alternateDelimiterEvidence,
            endedInsideQuotes: parseResult.endedInsideQuotes,
            columns: finalizedColumns
        })
    };
}

function resolveHeaderPresence(sampleRows, headerMode) {
    if (headerMode === 'present') {
        return true;
    }

    if (headerMode === 'absent') {
        return false;
    }

    if (sampleRows.length < 2) {
        return false;
    }

    const header = sampleRows[0];
    const body = sampleRows.slice(1, Math.min(sampleRows.length, 6));
    let score = 0;

    if (new Set(header.map((value) => value.trim().toLowerCase())).size === header.length) {
        score += 1;
    }

    for (let index = 0; index < header.length; index += 1) {
        const headerValue = (header[index] || '').trim();
        const bodyValues = body.map((row) => (row[index] || '').trim()).filter(Boolean);

        if (!headerValue) {
            score -= 0.25;
            continue;
        }

        const headerKind = classifyScalar(headerValue).kind;
        const bodyKinds = bodyValues.map((value) => classifyScalar(value).kind);
        const bodyHasTypedValues = bodyKinds.some((kind) => kind !== 'text' && kind !== 'empty');

        if (headerKind === 'text' && bodyHasTypedValues) {
            score += 1.2;
        }

        if (/^[A-Za-z_][A-Za-z0-9 _-]*$/.test(headerValue)) {
            score += 0.35;
        }

        if (bodyValues.length > 0 && !bodyValues.includes(headerValue)) {
            score += 0.2;
        }

        if (headerKind !== 'text' && bodyKinds.every((kind) => kind === headerKind || kind === 'empty')) {
            score -= 0.75;
        }
    }

    return score >= 2;
}

function buildDisplayNames(headerPresent, headerRow, columnCount) {
    const names = [];

    for (let index = 0; index < columnCount; index += 1) {
        const headerValue = headerPresent ? (headerRow?.[index] || '').trim() : '';
        names.push(headerValue || `column_${index + 1}`);
    }

    const seen = new Map();

    return names.map((name) => {
        const normalized = name.trim() || 'column';
        const count = seen.get(normalized) || 0;
        seen.set(normalized, count + 1);
        return count === 0 ? normalized : `${normalized} (${count + 1})`;
    });
}

function ensureProfiles(profiles, count, priorRows) {
    while (profiles.length < count) {
        profiles.push(createProfile(priorRows));
    }
}

function createProfile(priorRows = 0) {
    return {
        totalCount: priorRows,
        nullCount: priorRows,
        nonNullCount: 0,
        integerCount: 0,
        numberCount: 0,
        booleanCount: 0,
        datetimeCount: 0,
        textCount: 0,
        minLength: Number.POSITIVE_INFINITY,
        maxLength: 0,
        totalLength: 0,
        minNumber: Number.POSITIVE_INFINITY,
        maxNumber: Number.NEGATIVE_INFINITY,
        minDate: Number.POSITIVE_INFINITY,
        maxDate: Number.NEGATIVE_INFINITY,
        dateHasTimeCount: 0,
        numericSamples: [],
        uniqueValues: new Set(),
        uniqueOverflow: false,
        sampleValues: [],
        samplesSeen: 0
    };
}

function updateProfile(profile, value) {
    profile.totalCount += 1;
    const trimmed = value.trim();

    if (trimmed === '') {
        profile.nullCount += 1;
        return;
    }

    profile.nonNullCount += 1;
    const length = value.length;
    profile.totalLength += length;
    profile.minLength = Math.min(profile.minLength, length);
    profile.maxLength = Math.max(profile.maxLength, length);

    if (profile.sampleValues.length < MAX_SAMPLE_VALUES && !profile.sampleValues.includes(trimmed)) {
        profile.sampleValues.push(trimmed);
    }

    if (!profile.uniqueOverflow) {
        profile.uniqueValues.add(trimmed);
        if (profile.uniqueValues.size > MAX_UNIQUE_TRACKED) {
            profile.uniqueValues.clear();
            profile.uniqueOverflow = true;
        }
    }

    const classification = classifyScalar(trimmed);

    if (classification.kind === 'integer') {
        profile.integerCount += 1;
        updateNumberStats(profile, classification.parsed);
    } else if (classification.kind === 'number') {
        profile.numberCount += 1;
        updateNumberStats(profile, classification.parsed);
    } else if (classification.kind === 'boolean') {
        profile.booleanCount += 1;
    } else if (classification.kind === 'datetime') {
        profile.datetimeCount += 1;
        profile.minDate = Math.min(profile.minDate, classification.parsed);
        profile.maxDate = Math.max(profile.maxDate, classification.parsed);
        if (classification.hasTime) {
            profile.dateHasTimeCount += 1;
        }
    } else {
        profile.textCount += 1;
    }
}

function updateNumberStats(profile, numericValue) {
    profile.minNumber = Math.min(profile.minNumber, numericValue);
    profile.maxNumber = Math.max(profile.maxNumber, numericValue);
    profile.samplesSeen += 1;

    if (profile.numericSamples.length < MAX_NUMERIC_SAMPLES) {
        profile.numericSamples.push(numericValue);
        return;
    }

    const replacementIndex = Math.floor(Math.random() * profile.samplesSeen);
    if (replacementIndex < MAX_NUMERIC_SAMPLES) {
        profile.numericSamples[replacementIndex] = numericValue;
    }
}

function finalizeProfiles(context) {
    return context.profiles.map((profile, index) => {
        const inferredType = inferType(profile);
        const nullRate = getPercent(profile.nullCount, context.rowsProfiled);
        const averageLength = profile.nonNullCount ? profile.totalLength / profile.nonNullCount : 0;
        const distinctCount = profile.uniqueOverflow ? null : profile.uniqueValues.size;

        return {
            index,
            name: context.displayNames[index],
            sqlName: context.sqlNames[index],
            inferredType,
            nullCount: profile.nullCount,
            nullRate,
            nonNullCount: profile.nonNullCount,
            distinctCount,
            distinctOverflow: profile.uniqueOverflow,
            averageLength,
            minLength: Number.isFinite(profile.minLength) ? profile.minLength : 0,
            maxLength: profile.maxLength,
            minNumber: Number.isFinite(profile.minNumber) ? profile.minNumber : null,
            maxNumber: Number.isFinite(profile.maxNumber) ? profile.maxNumber : null,
            minDate: Number.isFinite(profile.minDate) ? new Date(profile.minDate).toISOString() : null,
            maxDate: Number.isFinite(profile.maxDate) ? new Date(profile.maxDate).toISOString() : null,
            sampleValues: profile.sampleValues.slice(),
            integerCount: profile.integerCount,
            numberCount: profile.numberCount,
            booleanCount: profile.booleanCount,
            datetimeCount: profile.datetimeCount,
            textCount: profile.textCount,
            numericSamples: profile.numericSamples.slice(),
            sqlType: mapSqlType(inferredType, profile)
        };
    });
}

function inferType(profile) {
    if (profile.nonNullCount === 0) {
        return 'empty';
    }

    if (profile.textCount > 0) {
        return profile.textCount === profile.nonNullCount ? 'text' : 'mixed';
    }

    if (profile.datetimeCount > 0) {
        return profile.datetimeCount === profile.nonNullCount
            ? (profile.dateHasTimeCount > 0 ? 'datetime' : 'date')
            : 'mixed';
    }

    if (profile.booleanCount > 0) {
        return profile.booleanCount === profile.nonNullCount ? 'boolean' : 'mixed';
    }

    if (profile.integerCount === profile.nonNullCount) {
        return 'integer';
    }

    if ((profile.integerCount + profile.numberCount) === profile.nonNullCount) {
        return 'number';
    }

    return 'mixed';
}

function mapSqlType(inferredType, profile) {
    switch (inferredType) {
        case 'integer':
            return 'INTEGER';
        case 'number':
            return 'DOUBLE';
        case 'boolean':
            return 'BOOLEAN';
        case 'date':
            return 'DATE';
        case 'datetime':
            return 'TIMESTAMP';
        case 'empty':
            return 'TEXT';
        case 'mixed':
            return profile.maxLength > 1024 ? 'TEXT' : 'VARCHAR';
        case 'text':
        default:
            return profile.maxLength > 255 ? 'TEXT' : 'VARCHAR';
    }
}

function buildHistogramColumns(columns) {
    return columns
        .filter((column) => column.inferredType === 'integer' || column.inferredType === 'number')
        .filter((column) => column.numericSamples.length > 0)
        .slice(0, MAX_HISTOGRAM_COLUMNS)
        .map((column) => ({
            name: column.name,
            min: column.minNumber,
            max: column.maxNumber,
            bins: buildHistogramBins(column.numericSamples, HISTOGRAM_BIN_COUNT)
        }));
}

function buildHistogramBins(values, binCount) {
    if (values.length === 0) {
        return [];
    }

    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const value of values) {
        min = Math.min(min, value);
        max = Math.max(max, value);
    }

    if (min === max) {
        return [{
            start: min,
            end: max,
            count: values.length
        }];
    }

    const bins = Array.from({ length: binCount }, () => ({ count: 0 }));
    const width = (max - min) / binCount;

    for (const value of values) {
        const rawIndex = Math.floor((value - min) / width);
        const index = Math.min(binCount - 1, Math.max(0, rawIndex));
        bins[index].count += 1;
    }

    return bins.map((bin, index) => ({
        start: min + (width * index),
        end: index === binCount - 1 ? max : min + (width * (index + 1)),
        count: bin.count
    }));
}

function createAlternateDelimiterEvidence(selectedDelimiter) {
    return DELIMITER_CANDIDATES
        .filter((candidate) => candidate.character !== selectedDelimiter)
        .map((candidate) => ({
            key: candidate.key,
            label: candidate.label,
            character: candidate.character,
            rows: 0
        }));
}

function updateAlternateDelimiterEvidence(evidence, row) {
    for (const item of evidence) {
        if (row.some((cell) => cell.includes(item.character))) {
            item.rows += 1;
        }
    }
}

function buildQualityNotes(summary) {
    const notes = [];

    if (summary.stoppedAtRowLimit) {
        notes.push({
            level: 'warning',
            title: 'Profile truncated by row cap',
            detail: `Profiling stopped after ${summary.rowsProfiled.toLocaleString('en-US')} data rows to limit browser memory use and parsing time.`
        });
    }

    const mixedDelimiterEvidence = summary.alternateDelimiterEvidence.filter((item) => item.rows > 0);
    if (mixedDelimiterEvidence.length > 0) {
        notes.push({
            level: 'alert',
            title: `Mixed ${formatDelimiterList([summary.delimiter, ...mixedDelimiterEvidence])} delimiters detected`,
            detail: `${summary.delimiter.label} parsing found ${formatDelimiterEvidence(mixedDelimiterEvidence)}. This often means the file combines comma, tab, semicolon, or pipe-delimited rows and should be normalized before import.`
        });
    }

    if (summary.inconsistentRows > 0) {
        notes.push({
            level: 'alert',
            title: 'Inconsistent row widths detected',
            detail: `${summary.inconsistentRows.toLocaleString('en-US')} profiled rows do not match the baseline column count. Check delimiter choice, quoting, or malformed lines.`
        });
    }

    if (summary.duplicateRows > 0) {
        notes.push({
            level: 'warning',
            title: 'Duplicate rows found',
            detail: `${summary.duplicateRows.toLocaleString('en-US')} duplicate rows were detected in the profiled rows.`
        });
    }

    if (summary.blankRows > 0) {
        notes.push({
            level: 'info',
            title: 'Blank rows skipped',
            detail: `${summary.blankRows.toLocaleString('en-US')} empty rows were ignored during profiling.`
        });
    }

    const mixedColumns = summary.columns.filter((column) => column.inferredType === 'mixed');
    if (mixedColumns.length > 0) {
        notes.push({
            level: 'warning',
            title: 'Mixed-type columns present',
            detail: `${mixedColumns.length.toLocaleString('en-US')} columns mix text with other value kinds, which often complicates imports and downstream typing.`
        });
    }

    const sparseColumns = summary.columns.filter((column) => column.nullRate >= 25);
    if (sparseColumns.length > 0) {
        notes.push({
            level: 'info',
            title: 'Sparse columns present',
            detail: `${sparseColumns.length.toLocaleString('en-US')} columns are at least 25% blank in the profiled rows.`
        });
    }

    if (summary.endedInsideQuotes) {
        notes.push({
            level: 'alert',
            title: 'Quoted field did not terminate cleanly',
            detail: 'The parser reached the end of the file while still inside a quoted field. The source file may be truncated or malformed.'
        });
    }

    if (notes.length === 0) {
        notes.push({
            level: 'info',
            title: 'No major structural issues detected',
            detail: 'Delimiter and row shape look consistent in the profiled rows.'
        });
    }

    return notes;
}

function formatDelimiterEvidence(evidence) {
    return evidence
        .map((item) => `${item.label.toLowerCase()} delimiter characters in ${item.rows.toLocaleString('en-US')} ${item.rows === 1 ? 'row' : 'rows'}`)
        .join(', ');
}

function formatDelimiterList(delimiters) {
    const labels = delimiters.map((item) => item.label.toLowerCase());

    if (labels.length === 1) {
        return labels[0];
    }

    if (labels.length === 2) {
        return `${labels[0]} and ${labels[1]}`;
    }

    return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function buildSqlSchema(sqlNames, columns) {
    const lines = ['CREATE TABLE imported_csv ('];

    columns.forEach((column, index) => {
        const suffix = index === columns.length - 1 ? '' : ',';
        lines.push(`    ${escapeSqlIdentifier(sqlNames[index])} ${column.sqlType}${suffix}`);
    });

    lines.push(');');
    return lines.join('\n');
}

function buildJsonSchema(summary) {
    return JSON.stringify({
        fileName: summary.fileName,
        delimiter: summary.delimiter.key,
        delimiterLabel: summary.delimiter.label,
        headerPresent: summary.headerPresent,
        rowsProfiled: summary.rowsProfiled,
        blankRows: summary.blankRows,
        columnCount: summary.columnCount,
        duplicateRows: summary.duplicateRows,
        inconsistentRows: summary.inconsistentRows,
        totalNullCells: summary.totalNullCells,
        stoppedAtRowLimit: summary.stoppedAtRowLimit,
        endedInsideQuotes: summary.endedInsideQuotes,
        alternateDelimiterEvidence: summary.alternateDelimiterEvidence.map((item) => ({
            key: item.key,
            label: item.label,
            rows: item.rows
        })),
        columns: summary.columns.map((column) => ({
            name: column.name,
            sqlName: column.sqlName,
            inferredType: column.inferredType,
            sqlType: column.sqlType,
            nullCount: column.nullCount,
            nullRate: Number(column.nullRate.toFixed(2)),
            nonNullCount: column.nonNullCount,
            distinctCount: column.distinctOverflow ? null : column.distinctCount,
            distinctOverflow: column.distinctOverflow,
            averageLength: Number(column.averageLength.toFixed(2)),
            minLength: column.minLength,
            maxLength: column.maxLength,
            minNumber: column.minNumber,
            maxNumber: column.maxNumber,
            minDate: column.minDate,
            maxDate: column.maxDate,
            sampleValues: column.sampleValues
        }))
    }, null, 2);
}

function fingerprintRow(row) {
    let hashA = 2166136261;
    let hashB = 2166136261 ^ 0x9e3779b9;

    for (const cell of row) {
        for (let index = 0; index < cell.length; index += 1) {
            const code = cell.charCodeAt(index);
            hashA ^= code;
            hashA = Math.imul(hashA, 16777619);
            hashB ^= (code + index);
            hashB = Math.imul(hashB, 1099511627);
        }

        hashA ^= 31;
        hashA = Math.imul(hashA, 16777619);
        hashB ^= 17;
        hashB = Math.imul(hashB, 1099511627);
    }

    return `${hashA >>> 0}:${hashB >>> 0}`;
}
