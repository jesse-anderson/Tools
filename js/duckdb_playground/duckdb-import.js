/**
 * ============================================
 * DuckDB Playground v2.0.0 - Import Module
 * ============================================
 * File import (CSV, JSON, Parquet, Excel) and schema management.
 *
 * Project: Tools Hub by Jesse Anderson
 * Repository: https://github.com/jesse-anderson/Tools
 * License: GPL-3.0
 *
 * Last Updated: January 2025
 * ============================================
 */

import { STATE, FILE_SIZE_LIMIT, EXPERIMENTAL_SIZE_LIMIT, showModal, closeModal } from './duckdb-state.js';
import { ensureConnection } from './duckdb-init.js';

// Re-export for convenience
export { STATE } from './duckdb-state.js';

// ============================================
// UTILITY FUNCTIONS
// ============================================

function escapeSQLIdentifier(identifier) {
    const escaped = identifier.replace(/"/g, '""');
    return `"${escaped}"`;
}

function isValidIdentifier(str) {
    return /^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(str);
}

function sanitizeTableName(filename) {
    let name = filename
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/^[0-9]/, '_')
        .replace(/_+/g, '_')
        .toLowerCase()
        .substring(0, 63);

    if (!name || !isValidIdentifier(name)) {
        name = 'table';
    }

    return name;
}

function ensureUniqueName(baseName) {
    let name = baseName;
    let counter = 2;
    while (STATE.tables.find(t => t.name === name)) {
        name = `${baseName}_${counter}`;
        counter++;
    }
    return name;
}

// ============================================
// FILE IMPORT
// ============================================

export async function handleFileSelect(files, showToast, refreshSchema) {
    if (!files || files.length === 0) return;
    const file = files[0];
    await importFile(file, showToast, refreshSchema);

    const fileInput = document.getElementById('fileInput');
    if (fileInput) fileInput.value = '';
}

async function importFile(file, showToast, refreshSchema) {
    const maxSize = STATE.experimentalMode ? EXPERIMENTAL_SIZE_LIMIT : FILE_SIZE_LIMIT;

    if (file.size > maxSize) {
        const limitMB = Math.round(maxSize / 1024 / 1024);
        showToast(`File exceeds ${limitMB}MB limit. ${STATE.experimentalMode ? 'Consider using desktop DuckDB.' : 'Enable experimental mode for larger files.'}`, 'error');
        return;
    }

    if (file.size > FILE_SIZE_LIMIT && STATE.experimentalMode) {
        showToast('Large file detected. This may affect browser performance.', 'warning');
    }

    const extension = file.name.split('.').pop().toLowerCase();

    try {
        if (extension === 'xlsx' || extension === 'xls') {
            await handleExcelFile(file, showToast, refreshSchema);
            return;
        }

        const tableName = sanitizeTableName(file.name);

        if (STATE.tables.find(t => t.name === tableName)) {
            STATE.pendingFile = { file, tableName, extension };
            document.getElementById('existingTableName').textContent = tableName;
            showModal('tableNameModal');
            return;
        }

        await doImport(file, tableName, extension, showToast, refreshSchema);

    } catch (error) {
        console.error('Import error:', error);
        showToast(`Failed to import: ${error.message}`, 'error');
    }
}

async function doImport(file, tableName, extension, showToast, refreshSchema) {
    showToast(`Importing ${file.name}...`, 'info');

    const fileBuffer = await file.arrayBuffer();
    await STATE.db.registerFileBuffer(file.name, new Uint8Array(fileBuffer));

    let readFunction;
    switch (extension) {
        case 'csv':
            readFunction = `read_csv_auto('${file.name}')`;
            break;
        case 'json':
        case 'jsonl':
        case 'ndjson':
            readFunction = `read_json_auto('${file.name}')`;
            break;
        case 'parquet':
            readFunction = `read_parquet('${file.name}')`;
            break;
        default:
            throw new Error(`Unsupported format: ${extension}`);
    }

    const safeTableName = escapeSQLIdentifier(tableName);
    await STATE.conn.query(`
        CREATE TABLE ${safeTableName} AS
        SELECT * FROM ${readFunction}
    `);

    await STATE.db.dropFile(file.name);

    await refreshSchema();
    showToast(`Imported '${tableName}' successfully`, 'success');
}

async function handleExcelFile(file, showToast, refreshSchema) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);

    if (workbook.SheetNames.length > 1) {
        STATE.pendingFile = { file, workbook };
        const select = document.getElementById('sheetSelect');
        select.innerHTML = '';
        workbook.SheetNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
        showModal('sheetModal');
    } else {
        await importExcelSheet(workbook, workbook.SheetNames[0], file.name, showToast, refreshSchema);
    }
}

export async function importSelectedSheet(showToast, refreshSchema) {
    const sheetName = document.getElementById('sheetSelect').value;
    const { file, workbook } = STATE.pendingFile;
    closeModal('sheetModal');
    await importExcelSheet(workbook, sheetName, file.name, showToast, refreshSchema);
    STATE.pendingFile = null;
}

async function importExcelSheet(workbook, sheetName, filename, showToast, refreshSchema) {
    const worksheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(worksheet);

    const tableName = sanitizeTableName(sheetName || filename);

    if (STATE.tables.find(t => t.name === tableName)) {
        STATE.pendingFile = { csv, tableName };
        document.getElementById('existingTableName').textContent = tableName;
        showModal('tableNameModal');
        return;
    }

    await importCSVString(csv, tableName, showToast, refreshSchema);
}

async function importCSVString(csv, tableName, showToast, refreshSchema) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const tempFilename = `${tableName}_temp.csv`;

    await STATE.db.registerFileBuffer(tempFilename, new Uint8Array(await blob.arrayBuffer()));

    const safeTableName = escapeSQLIdentifier(tableName);
    await STATE.conn.query(`
        CREATE TABLE ${safeTableName} AS
        SELECT * FROM read_csv_auto('${tempFilename}')
    `);

    await STATE.db.dropFile(tempFilename);

    await refreshSchema();
    showToast(`Imported '${tableName}' successfully`, 'success');
}

export async function handleTableCollision(action, showToast, refreshSchema) {
    closeModal('tableNameModal');
    const { file, tableName, extension, csv } = STATE.pendingFile;

    if (action === 'replace') {
        const safeTableName = escapeSQLIdentifier(tableName);
        await STATE.conn.query(`DROP TABLE IF EXISTS ${safeTableName}`);
        if (csv) {
            await importCSVString(csv, tableName, showToast, refreshSchema);
        } else {
            await doImport(file, tableName, extension, showToast, refreshSchema);
        }
    } else {
        const newName = ensureUniqueName(tableName);
        if (csv) {
            await importCSVString(csv, newName, showToast, refreshSchema);
        } else {
            await doImport(file, newName, extension, showToast, refreshSchema);
        }
    }

    STATE.pendingFile = null;
}

// ============================================
// SCHEMA MANAGEMENT
// ============================================

export async function refreshSchema() {
    const result = await STATE.conn.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'main'
    `);

    const tableNames = result.toArray().map(row => row.table_name);

    STATE.tables = [];
    for (const name of tableNames) {
        const safeName = String(name).replace(/'/g, "''");
        const columnsResult = await STATE.conn.query(`
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = '${safeName}' AND table_schema = 'main'
        `);

        const columns = columnsResult.toArray().map(row => ({
            name: row.column_name,
            type: row.data_type
        }));

        STATE.tables.push({
            name,
            columns,
            rowCount: null
        });
    }

    return STATE.tables;
}

export async function getTableRowCount(tableName) {
    const safeTableName = escapeSQLIdentifier(tableName);
    const result = await STATE.conn.query(`SELECT COUNT(*) as cnt FROM ${safeTableName}`);
    return Number(result.toArray()[0].cnt);
}

export async function dropTable(tableName, refreshSchema, showToast) {
    const safeTableName = escapeSQLIdentifier(tableName);
    await STATE.conn.query(`DROP TABLE ${safeTableName}`);
    await refreshSchema();
    showToast(`Dropped table '${tableName}'`, 'success');
}
