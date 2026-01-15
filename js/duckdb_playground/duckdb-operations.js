/**
 * ============================================
 * DuckDB Playground v2.0.0 - Operations Module
 * ============================================
 * Query execution, export, sessions, sample data, and state managers.
 *
 * Project: Tools Hub by Jesse Anderson
 * Repository: https://github.com/jesse-anderson/Tools
 * License: GPL-3.0
 *
 * Last Updated: January 2025
 * ============================================
 */

import { STATE, MAX_HISTORY_ITEMS, MAX_QUERY_TABS, showModal, closeModal, closeAllDropdowns } from './duckdb-state.js';
import { ensureConnection } from './duckdb-init.js';
import { escapeSQLIdentifier } from './duckdb-import.js';

// Re-export for convenience
export { STATE } from './duckdb-state.js';
export { escapeSQLIdentifier } from './duckdb-import.js';

// ============================================
// QUERY EXECUTION
// ============================================

function extractTableNames(sql) {
    const tables = new Set();
    const normalizedSql = sql.replace(/\s+/g, ' ').trim();

    const patterns = [
        /\bFROM\s+(["']?)(\w+)\1/gi,
        /\bJOIN\s+(["']?)(\w+)\1/gi,
        /\bINSERT\s+INTO\s+(["']?)(\w+)\1/gi,
        /\bUPDATE\s+(["']?)(\w+)\1/gi,
        /\bDELETE\s+FROM\s+(["']?)(\w+)\1/gi,
        /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(["']?)(\w+)\1/gi,
        /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(["']?)(\w+)\1/gi
    ];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(normalizedSql)) !== null) {
            tables.add(match[2].toLowerCase());
        }
    }

    return Array.from(tables);
}

export async function runQuery(sql, showToast, addToHistory, showMetrics, displayResults, showError, refreshSchema) {
    if (STATE.isQueryRunning || !STATE.isInitialized) return null;

    if (!sql.trim()) {
        showToast('Please enter a query', 'warning');
        return null;
    }

    const isConnected = await ensureConnection(showToast, refreshSchema);
    if (!isConnected) {
        return null;
    }

    STATE.isQueryRunning = true;

    const startTime = performance.now();
    const tables = extractTableNames(sql);

    try {
        const result = await STATE.conn.query(sql);
        const endTime = performance.now();
        const duration = endTime - startTime;

        STATE.currentResult = result;
        const rowCount = result.numRows;

        addToHistory({
            sql,
            tables,
            timestamp: Date.now(),
            durationMs: duration,
            rowCount
        });

        showMetrics({
            time: duration,
            rows: rowCount,
            status: 'OK'
        });

        displayResults(result);

        if (/^\s*(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE)/i.test(sql)) {
            await refreshSchema();
        }

        return result;

    } catch (error) {
        const endTime = performance.now();
        const duration = endTime - startTime;

        addToHistory({
            sql,
            tables,
            timestamp: Date.now(),
            durationMs: duration,
            error: error.message
        });

        showMetrics({
            time: duration,
            rows: 0,
            status: 'ERROR'
        });

        showError(error);
        return null;

    } finally {
        STATE.isQueryRunning = false;
    }
}

// ============================================
// RESULTS EXPORT
// ============================================

export async function exportResults(format, sql, showToast) {
    if (!STATE.currentResult) {
        showToast('No results to export', 'warning');
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `query_result_${timestamp}.${format}`;

    try {
        let copyFormat;
        let mimeType;

        switch (format) {
            case 'csv':
                copyFormat = 'csv, HEADER true';
                mimeType = 'text/csv';
                break;
            case 'json':
                copyFormat = 'json';
                mimeType = 'application/json';
                break;
            case 'parquet':
                copyFormat = 'parquet';
                mimeType = 'application/octet-stream';
                break;
        }

        await STATE.conn.query(`COPY (${sql}) TO '${filename}' (FORMAT ${copyFormat})`);
        const buffer = await STATE.db.copyFileToBuffer(filename);

        downloadBlob(buffer, filename, mimeType);

        await STATE.db.dropFile(filename);

        showToast(`Exported as ${format.toUpperCase()}`, 'success');

    } catch (error) {
        console.error('Export error:', error);
        showToast(`Export failed: ${error.message}`, 'error');
    }
}

function downloadBlob(data, filename, mimeType) {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================
// SAMPLE DATA GENERATION
// ============================================

export async function loadSampleData(dataset, showToast, refreshSchema) {
    closeAllDropdowns();

    const datasets = {
        employees: generateEmployeesData(),
        sales: generateSalesData(),
        weather: generateWeatherData()
    };

    showToast('Loading sample data...', 'info');

    try {
        if (dataset === 'all') {
            for (const [name, data] of Object.entries(datasets)) {
                await createSampleTable(name, data);
            }
            showToast('Loaded all sample datasets', 'success');
        } else {
            await createSampleTable(dataset, datasets[dataset]);
            showToast(`Loaded '${dataset}' table`, 'success');
        }

        await refreshSchema();

    } catch (error) {
        console.error('Sample data error:', error);
        showToast(`Failed to load: ${error.message}`, 'error');
    }
}

async function createSampleTable(name, data) {
    const safeName = escapeSQLIdentifier(name);
    await STATE.conn.query(`DROP TABLE IF EXISTS ${safeName}`);

    if (name === 'employees') {
        await STATE.conn.query(`
            CREATE TABLE employees (
                id INTEGER PRIMARY KEY,
                name VARCHAR,
                department VARCHAR,
                salary DECIMAL(10,2),
                hire_date DATE
            )
        `);
    } else if (name === 'sales') {
        await STATE.conn.query(`
            CREATE TABLE sales (
                order_id INTEGER PRIMARY KEY,
                product VARCHAR,
                quantity INTEGER,
                price DECIMAL(10,2),
                order_date DATE,
                region VARCHAR
            )
        `);
    } else if (name === 'weather') {
        await STATE.conn.query(`
            CREATE TABLE weather (
                date DATE PRIMARY KEY,
                city VARCHAR,
                temp_high INTEGER,
                temp_low INTEGER,
                precipitation DECIMAL(4,2)
            )
        `);
    }

    for (const row of data) {
        const values = Object.values(row).map(v =>
            typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : v
        ).join(', ');
        await STATE.conn.query(`INSERT INTO ${safeName} VALUES (${values})`);
    }
}

function generateEmployeesData() {
    const departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance'];
    const firstNames = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Henry', 'Ivy', 'Jack'];
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];

    const data = [];
    for (let i = 1; i <= 50; i++) {
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        data.push({
            id: i,
            name: `${firstName} ${lastName}`,
            department: departments[Math.floor(Math.random() * departments.length)],
            salary: (40000 + Math.floor(Math.random() * 80000)).toFixed(2),
            hire_date: `2020-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, '0')}`
        });
    }
    return data;
}

function generateSalesData() {
    const products = ['Widget A', 'Widget B', 'Gadget Pro', 'Gadget Lite', 'Tool X', 'Tool Y', 'Device Alpha', 'Device Beta'];
    const regions = ['North', 'South', 'East', 'West', 'Central'];

    const data = [];
    for (let i = 1; i <= 200; i++) {
        const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
        const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
        data.push({
            order_id: i,
            product: products[Math.floor(Math.random() * products.length)],
            quantity: Math.floor(Math.random() * 20) + 1,
            price: (9.99 + Math.random() * 90).toFixed(2),
            order_date: `2024-${month}-${day}`,
            region: regions[Math.floor(Math.random() * regions.length)]
        });
    }
    return data;
}

function generateWeatherData() {
    const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'];
    const data = [];

    const startTime = Date.UTC(2024, 0, 1);
    const msPerDay = 24 * 60 * 60 * 1000;

    for (let i = 0; i < 365; i++) {
        const date = new Date(startTime + (i * msPerDay));
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        const dayOfYear = i;
        const seasonalTemp = 15 * Math.sin((dayOfYear - 80) * 2 * Math.PI / 365);
        const baseTemp = 60 + seasonalTemp;

        data.push({
            date: dateStr,
            city: cities[Math.floor(Math.random() * cities.length)],
            temp_high: Math.floor(baseTemp + Math.random() * 15),
            temp_low: Math.floor(baseTemp - 10 + Math.random() * 10),
            precipitation: (Math.random() * 2).toFixed(2)
        });
    }
    return data;
}

// ============================================
// SESSION SAVE/LOAD
// ============================================

export async function saveSession(showToast) {
    if (STATE.tables.length === 0) {
        showToast('No tables to save', 'warning');
        return;
    }

    showToast('Saving session...', 'info');

    try {
        const files = {};

        for (const table of STATE.tables) {
            const filename = `${table.name}.parquet`;
            const safeTableName = escapeSQLIdentifier(table.name);
            await STATE.conn.query(`COPY ${safeTableName} TO '${filename}' (FORMAT parquet)`);
            const buffer = await STATE.db.copyFileToBuffer(filename);
            files[`tables/${filename}`] = new Uint8Array(buffer);
            await STATE.db.dropFile(filename);
        }

        const manifest = {
            version: '1.0',
            created: new Date().toISOString(),
            application: 'DuckDB Playground',
            settings: {
                experimentalMode: STATE.experimentalMode,
                theme: STATE.theme
            },
            tables: STATE.tables.map(t => t.name)
        };

        files['manifest.json'] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));

        const currentTab = STATE.queryTabs.find(t => t.id === STATE.activeTabId);
        if (currentTab) {
            const editor = document.getElementById('sqlEditor');
            if (editor) currentTab.sql = editor.value;
        }

        const queriesData = {
            tabs: STATE.queryTabs,
            activeTabId: STATE.activeTabId
        };
        files['queries/tabs.json'] = new TextEncoder().encode(JSON.stringify(queriesData, null, 2));

        const zip = fflate.zipSync(files);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        downloadBlob(zip, `session_${timestamp}.duckdb-session.zip`, 'application/zip');

        showToast('Session saved', 'success');

    } catch (error) {
        console.error('Save session error:', error);
        showToast(`Failed to save: ${error.message}`, 'error');
    }
}

export async function loadSession(files, showToast, renderQueryTabs) {
    if (!files || files.length === 0) return;

    const file = files[0];
    const sessionInput = document.getElementById('sessionInput');
    if (sessionInput) sessionInput.value = '';

    STATE.confirmCallback = async () => {
        showToast('Loading session...', 'info');

        try {
            const arrayBuffer = await file.arrayBuffer();
            const unzipped = fflate.unzipSync(new Uint8Array(arrayBuffer));

            const manifestData = new TextDecoder().decode(unzipped['manifest.json']);
            const manifest = JSON.parse(manifestData);

            for (const table of STATE.tables) {
                const safeTableName = escapeSQLIdentifier(table.name);
                await STATE.conn.query(`DROP TABLE IF EXISTS ${safeTableName}`);
            }

            for (const tableName of manifest.tables) {
                const parquetData = unzipped[`tables/${tableName}.parquet`];
                if (parquetData) {
                    const tempFile = `${tableName}_import.parquet`;
                    await STATE.db.registerFileBuffer(tempFile, parquetData);
                    const safeTableName = escapeSQLIdentifier(tableName);
                    await STATE.conn.query(`CREATE TABLE ${safeTableName} AS SELECT * FROM read_parquet('${tempFile}')`);
                    await STATE.db.dropFile(tempFile);
                }
            }

            const queriesData = new TextDecoder().decode(unzipped['queries/tabs.json']);
            const queries = JSON.parse(queriesData);
            STATE.queryTabs = queries.tabs;
            STATE.activeTabId = queries.activeTabId;

            if (manifest.settings) {
                STATE.experimentalMode = manifest.settings.experimentalMode || false;
                const experimentalToggle = document.getElementById('experimentalToggle');
                if (experimentalToggle) experimentalToggle.checked = STATE.experimentalMode;

                if (manifest.settings.theme) {
                    window.setTheme && window.setTheme(manifest.settings.theme);
                }
            }

            await refreshSchema();
            renderQueryTabs();

            const activeTab = STATE.queryTabs.find(t => t.id === STATE.activeTabId);
            if (activeTab) {
                const editor = document.getElementById('sqlEditor');
                if (editor) editor.value = activeTab.sql;
            }

            showToast('Session loaded', 'success');

        } catch (error) {
            console.error('Load session error:', error);
            showToast(`Failed to load: ${error.message}`, 'error');
        }
    };

    document.getElementById('confirmTitle').textContent = 'Load Session';
    document.getElementById('confirmMessage').textContent = 'This will replace your current session. All unsaved work will be lost. Continue?';
    showModal('confirmModal');
}

// ============================================
// QUERY TABS STATE
// ============================================

export function addTab() {
    if (STATE.queryTabs.length >= MAX_QUERY_TABS) return;

    const newId = `tab-${Date.now()}`;
    STATE.queryTabs.push({
        id: newId,
        name: `Query ${STATE.queryTabs.length + 1}`,
        sql: ''
    });

    return newId;
}

export function closeTab(tabId) {
    if (STATE.queryTabs.length <= 1) return null;

    const index = STATE.queryTabs.findIndex(t => t.id === tabId);
    STATE.queryTabs.splice(index, 1);

    if (STATE.activeTabId === tabId) {
        STATE.activeTabId = STATE.queryTabs[Math.max(0, index - 1)].id;
        return STATE.queryTabs.find(t => t.id === STATE.activeTabId);
    }

    return null;
}

export function switchTab(tabId) {
    const currentTab = STATE.queryTabs.find(t => t.id === STATE.activeTabId);
    if (currentTab) {
        const editor = document.getElementById('sqlEditor');
        if (editor) currentTab.sql = editor.value;
    }

    STATE.activeTabId = tabId;

    const newTab = STATE.queryTabs.find(t => t.id === tabId);
    return newTab ? newTab.sql : null;
}

export function renameTab(tabId, newName) {
    const tab = STATE.queryTabs.find(t => t.id === tabId);
    if (tab && newName && newName.trim()) {
        tab.name = newName.trim().substring(0, 20);
        return true;
    }
    return false;
}

export function getCurrentSQL() {
    const currentTab = STATE.queryTabs.find(t => t.id === STATE.activeTabId);
    if (currentTab) {
        const editor = document.getElementById('sqlEditor');
        if (editor) currentTab.sql = editor.value;
    }
    return currentTab ? currentTab.sql : '';
}

export function saveTabs() {
    const currentSQL = getCurrentSQL();
    localStorage.setItem('duckdb_playground_tabs', JSON.stringify({
        tabs: STATE.queryTabs,
        activeTabId: STATE.activeTabId
    }));
}

export function loadTabs() {
    try {
        const tabsData = localStorage.getItem('duckdb_playground_tabs');
        if (tabsData) {
            const parsed = JSON.parse(tabsData);
            if (parsed.tabs && parsed.tabs.length > 0) {
                STATE.queryTabs = parsed.tabs;
                STATE.activeTabId = parsed.activeTabId || parsed.tabs[0].id;
                return true;
            }
        }
    } catch (e) {
        console.warn('Failed to load tabs:', e);
    }
    return false;
}

export function getTabSQL(tabId) {
    const tab = STATE.queryTabs.find(t => t.id === tabId);
    return tab ? tab.sql : '';
}

// ============================================
// HISTORY STATE
// ============================================

export function addToHistory(entry) {
    STATE.queryHistory.unshift(entry);
    if (STATE.queryHistory.length > MAX_HISTORY_ITEMS) {
        STATE.queryHistory.pop();
    }
}

export function clearHistory() {
    STATE.queryHistory = [];
}

export function getHistory(limit = 20) {
    return STATE.queryHistory.slice(0, limit);
}

export function loadHistory() {
    try {
        const historyData = localStorage.getItem('duckdb_playground_history');
        if (historyData) {
            STATE.queryHistory = JSON.parse(historyData);
        }
    } catch (e) {
        console.warn('Failed to load history:', e);
    }
}

export function saveHistory() {
    localStorage.setItem('duckdb_playground_history', JSON.stringify(STATE.queryHistory));
}

export function getHistorySQL(index) {
    const entry = STATE.queryHistory[index];
    return entry ? entry.sql : null;
}

// ============================================
// SETTINGS STATE
// ============================================

export function loadSettings() {
    try {
        const settings = localStorage.getItem('duckdb_playground_settings');
        if (settings) {
            const parsed = JSON.parse(settings);
            STATE.experimentalMode = parsed.experimentalMode || false;
            const experimentalToggle = document.getElementById('experimentalToggle');
            if (experimentalToggle) experimentalToggle.checked = STATE.experimentalMode;
        }
    } catch (e) {
        console.warn('Failed to load settings:', e);
    }
}

export function saveSettings() {
    localStorage.setItem('duckdb_playground_settings', JSON.stringify({
        experimentalMode: STATE.experimentalMode
    }));
}

export function toggleExperimentalMode() {
    STATE.experimentalMode = !STATE.experimentalMode;
    saveSettings();
    return STATE.experimentalMode;
}

// ============================================
// THEME STATE
// ============================================

export function setTheme(theme) {
    STATE.theme = theme;
    localStorage.setItem('duckdb_playground_theme', theme);
    return theme;
}

export function loadTheme() {
    const saved = localStorage.getItem('duckdb_playground_theme');
    if (saved) {
        return saved;
    } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
    }
    return 'dark';
}
