// Test and page handle: window.DatasetDiff.

import * as values from './diff-values.js';
import { alignHeaders } from './diff-schema.js';
import { compareTables } from './diff-engine.js';
import { suggestPairs, validatePlan, incompletePair, aggregate } from './diff-plan.js';
import { decodeBytes, parseRecords, suggestDelimiter, readNumber, buildTable, importDelimited } from './diff-csv.js';
import { LIMITS } from './diff-limits.js';
import { READ_OPTIONS, auditContainer, columnName, formatRange, parseRange, valueRange, inventory, sheetTable } from './diff-workbook.js';
import { Runner } from './diff-runner.js';
import { reportLines, preview, headline, codePointLength, PREVIEW_CAP, TRUNCATION_MARK } from './diff-report.js';

export const DatasetDiff = Object.freeze({
    version: '0.1.0',
    ...values,
    alignHeaders,
    compareTables,
    suggestPairs,
    validatePlan,
    incompletePair,
    aggregate,
    reportLines,
    preview,
    headline,
    codePointLength,
    PREVIEW_CAP,
    TRUNCATION_MARK,
    LIMITS,
    decodeBytes,
    parseRecords,
    suggestDelimiter,
    readNumber,
    buildTable,
    importDelimited,
    READ_OPTIONS,
    auditContainer,
    columnName,
    formatRange,
    parseRange,
    valueRange,
    inventory,
    sheetTable,
    Runner,
});

globalThis.DatasetDiff = DatasetDiff;
