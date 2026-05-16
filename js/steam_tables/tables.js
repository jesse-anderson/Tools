import { bracketRows, lerp, uniqueSorted } from './interpolate.js';

const DATA_DIR = '../data/steam_tables';

const SAT_COLUMNS = {
    T: 'T',
    P: 'P',
    vf: 'v_f',
    vg: 'v_g',
    uf: 'u_f',
    ug: 'u_g',
    ufg: 'u_fg',
    hf: 'h_f',
    hg: 'h_g',
    hfg: 'h_fg',
    sf: 's_f',
    sg: 's_g',
    sfg: 's_fg'
};

const COMBINED_COLUMNS = {
    P: 'P',
    T: 'T',
    v: 'v',
    rho: 'rho',
    u: 'u',
    h: 'h',
    s: 's',
    phase: 'phase'
};

const CSV_FILES = {
    satT: `${DATA_DIR}/saturated_by_T.csv`,
    satP: `${DATA_DIR}/saturated_by_P.csv`,
    combined: `${DATA_DIR}/compressed_and_superheated.csv`
};

const CRITICAL_PRESSURE_MPA = 22.064;
const CRITICAL_TEMPERATURE_C = 373.946;

let cachedTables = null;

export async function loadSteamTables() {
    if (cachedTables) {
        return cachedTables;
    }

    const [satTText, satPText, combinedText] = await Promise.all([
        fetchText(CSV_FILES.satT),
        fetchText(CSV_FILES.satP),
        fetchText(CSV_FILES.combined)
    ]);

    const satT = parseSaturationTable(satTText, 'T');
    const satP = parseSaturationTable(satPText, 'P');
    const combinedRows = parseCombinedTable(combinedText);
    const blocks = buildBlocks(combinedRows);
    const incompleteRows = combinedRows.filter((row) => row.incomplete);
    const saturationIncompleteRows = [
        ...satT.rows.filter((row) => row.incomplete).map((row) => ({ table: 'saturated_by_T', ...row })),
        ...satP.rows.filter((row) => row.incomplete).map((row) => ({ table: 'saturated_by_P', ...row }))
    ];

    if (incompleteRows.length) {
        console.warn('Steam table incomplete rows excluded from interpolation:', incompleteRows.map((row) => ({
            rowNumber: row.rowNumber,
            P: row.P,
            T: row.T,
            phase: row.phase,
            missing: row.missingFields
        })));
    }

    if (saturationIncompleteRows.length) {
        console.warn('Steam saturation table incomplete rows:', saturationIncompleteRows.map((row) => ({
            table: row.table,
            rowNumber: row.rowNumber,
            missing: row.missingFields
        })));
    }

    const completeCombinedRows = combinedRows.filter((row) => !row.incomplete);
    cachedTables = {
        satT,
        satP,
        combinedRows,
        blocks,
        pressures: blocks.map((block) => block.P),
        pCrit: CRITICAL_PRESSURE_MPA,
        tCrit: CRITICAL_TEMPERATURE_C,
        criticalChecks: buildCriticalChecks(satT, satP),
        globalMinT: Math.min(...completeCombinedRows.map((row) => row.T)),
        globalMaxT: Math.max(...completeCombinedRows.map((row) => row.T)),
        incompleteRows,
        saturationIncompleteRows
    };

    return cachedTables;
}

async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
    }
    return response.text();
}

function parseSaturationTable(text, indexKey) {
    const records = parseCsv(text);
    const headerIndex = findHeaderRow(records, ['T', 'P', 'Specific Volume Liquid'], 'saturation table');
    const header = records[headerIndex].map((value) => value.trim());
    const rows = [];

    for (let i = headerIndex + 1; i < records.length; i++) {
        if (!records[i].some((value) => value.trim() !== '')) {
            continue;
        }
        const raw = rowToObject(header, records[i]);
        const row = {
            rowNumber: i + 1,
            T: numberFrom(raw, 'T'),
            P: numberFrom(raw, 'P'),
            vf: numberFrom(raw, 'Specific Volume Liquid'),
            vg: numberFrom(raw, 'Specific Volume Vapor'),
            uf: numberFrom(raw, 'Internal Energy Liquid'),
            ug: numberFrom(raw, 'Internal Energy Vapor'),
            ufg: numberFrom(raw, 'Internal Energy of Vaporization'),
            hf: numberFrom(raw, 'Enthalpy Liquid'),
            hg: numberFrom(raw, 'Enthalpy Vapor'),
            hfg: numberFrom(raw, 'Enthalpy of Vaporization'),
            sf: numberFrom(raw, 'Entropy Liquid'),
            sg: numberFrom(raw, 'Entropy Vapor'),
            sfg: numberFrom(raw, 'Entropy of Vaporization')
        };
        const missingFields = Object.keys(SAT_COLUMNS).filter((key) => row[key] === null);
        row.missingFields = missingFields;
        row.incomplete = missingFields.length > 0;
        rows.push(row);
    }

    rows.sort((a, b) => a[indexKey] - b[indexKey]);
    return {
        indexKey,
        rows,
        indexValues: rows.map((row) => row[indexKey]),
        columns: SAT_COLUMNS
    };
}

function parseCombinedTable(text) {
    const records = parseCsv(text);
    const headerIndex = findHeaderRow(records, ['Pressure', 'Temperature', 'Specific Volume', 'Phase'], 'combined table');
    const header = records[headerIndex].map((value) => value.trim());
    const rows = [];

    for (let i = headerIndex + 1; i < records.length; i++) {
        if (!records[i].some((value) => value.trim() !== '')) {
            continue;
        }
        const raw = rowToObject(header, records[i]);
        const row = {
            rowNumber: i + 1,
            P: numberFrom(raw, 'Pressure'),
            T: numberFrom(raw, 'Temperature'),
            v: numberFrom(raw, 'Specific Volume'),
            rho: numberFrom(raw, 'Density'),
            u: numberFrom(raw, 'Specific Internal Energy'),
            h: numberFrom(raw, 'Specific Enthalpy'),
            s: numberFrom(raw, 'Specific Entropy'),
            phase: stringFrom(raw, 'Phase').replace(/^"|"$/g, '').trim()
        };
        const missingFields = ['P', 'T', 'v', 'rho', 'u', 'h', 's'].filter((key) => row[key] === null);
        row.missingFields = missingFields;
        row.incomplete = missingFields.length > 0;
        rows.push(row);
    }

    return rows;
}

function buildBlocks(rows) {
    const grouped = new Map();
    for (const row of rows) {
        if (!grouped.has(row.P)) {
            grouped.set(row.P, []);
        }
        grouped.get(row.P).push(row);
    }

    return Array.from(grouped.entries())
        .map(([P, blockRows]) => {
            const rows = blockRows.sort((a, b) => a.T - b.T || phaseOrder(a.phase) - phaseOrder(b.phase));
            const completeRows = rows.filter((row) => !row.incomplete);
            return {
                P,
                rows,
                temperatures: uniqueSorted(rows.map((row) => row.T)),
                completeMinT: completeRows.length ? Math.min(...completeRows.map((row) => row.T)) : null,
                completeMaxT: completeRows.length ? Math.max(...completeRows.map((row) => row.T)) : null
            };
        })
        .sort((a, b) => a.P - b.P);
}

function phaseOrder(phase) {
    const order = {
        liquid: 0,
        'saturated liquid': 1,
        'saturated vapor': 2,
        vapor: 3,
        'supercritical fluid': 4
    };
    return order[phase] ?? 99;
}

export function interpolateSaturation(table, x) {
    const key = table.indexKey;
    const bracket = bracketRows(table.rows, x, key, table.indexValues);
    const xUsed = bracket.clamped === 'low' ? bracket.low : bracket.clamped === 'high' ? bracket.high : x;
    const result = {
        rowNumber: null,
        clamped: bracket.clamped,
        requested: x,
        used: xUsed,
        bracketRows: [bracket.lowRow, bracket.highRow],
        values: {}
    };

    for (const prop of Object.keys(SAT_COLUMNS)) {
        if (bracket.lowRow[prop] === null || bracket.highRow[prop] === null) {
            result.values[prop] = null;
            continue;
        }
        result.values[prop] = bracket.lowIndex === bracket.highIndex
            ? bracket.lowRow[prop]
            : lerp(xUsed, bracket.low, bracket.lowRow[prop], bracket.high, bracket.highRow[prop]);
    }

    return result;
}

export function propertyPairForTarget(prop) {
    const mapping = {
        h: ['hf', 'hg', 'hfg'],
        s: ['sf', 'sg', 'sfg'],
        v: ['vf', 'vg', null],
        u: ['uf', 'ug', 'ufg']
    };
    return mapping[prop];
}

function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) {
        text = text.slice(1);
    }

    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const next = text[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                field += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            row.push(field);
            field = '';
            continue;
        }

        if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') {
                i++;
            }
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
            continue;
        }

        field += char;
    }

    if (field.length || row.length) {
        row.push(field);
        rows.push(row);
    }

    return rows;
}

function findHeaderRow(records, requiredPrefixes, tableName) {
    const index = records.findIndex((row) => {
        const cells = row.map((value) => value.trim());
        return requiredPrefixes.every((prefix) => cells.some((cell) => cell.startsWith(prefix)));
    });

    if (index < 0) {
        throw new Error(`Could not locate ${tableName} header row.`);
    }

    return index;
}

function rowToObject(header, row) {
    const result = {};
    header.forEach((name, index) => {
        result[name.trim()] = row[index] === undefined ? '' : row[index].trim();
    });
    return result;
}

function numberFrom(row, prefix) {
    const key = Object.keys(row).find((name) => headerMatchesPrefix(name, prefix));
    if (!key) {
        return null;
    }
    const raw = row[key].trim();
    if (raw === '') {
        return null;
    }
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
}

function stringFrom(row, prefix) {
    const key = Object.keys(row).find((name) => headerMatchesPrefix(name, prefix));
    return key ? row[key] : '';
}

function headerMatchesPrefix(name, prefix) {
    const trimmed = name.trim();
    return trimmed === prefix
        || trimmed.startsWith(`${prefix} `)
        || trimmed.startsWith(`${prefix} (`)
        || trimmed.startsWith(`${prefix} [`);
}

function buildCriticalChecks(satT, satP) {
    const lastByT = satT.rows[satT.rows.length - 1];
    const lastByP = satP.rows[satP.rows.length - 1];
    return {
        pressurePinned: CRITICAL_PRESSURE_MPA,
        temperaturePinned: CRITICAL_TEMPERATURE_C,
        saturatedByTLastRow: {
            rowNumber: lastByT.rowNumber,
            pressureDelta: Math.abs(lastByT.P - CRITICAL_PRESSURE_MPA),
            temperatureDelta: Math.abs(lastByT.T - CRITICAL_TEMPERATURE_C),
            hfg: lastByT.hfg,
            volumeDelta: Math.abs(lastByT.vg - lastByT.vf)
        },
        saturatedByPLastRow: {
            rowNumber: lastByP.rowNumber,
            pressureDelta: Math.abs(lastByP.P - CRITICAL_PRESSURE_MPA),
            temperatureDelta: Math.abs(lastByP.T - CRITICAL_TEMPERATURE_C),
            hfg: lastByP.hfg,
            volumeDelta: Math.abs(lastByP.vg - lastByP.vf)
        }
    };
}

export { COMBINED_COLUMNS, CRITICAL_PRESSURE_MPA, CRITICAL_TEMPERATURE_C, SAT_COLUMNS };
