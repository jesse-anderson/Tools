import init, { ols_regression, test, get_t_critical, get_normal_inverse, parse_csv } from './linear_regression_wasm.js';

// Security Check
const ALLOWED_DOMAINS = [
    'jesse-anderson.net',
    'tools.jesse-anderson.net',
    'linear-regression.jesse-anderson.net'
];

if (!ALLOWED_DOMAINS.includes(window.location.hostname)) {
    document.body.innerHTML = `
        <div style="display:flex;height:100vh;align-items:center;justify-content:center;flex-direction:column;color:#fafafa;background:#09090b;font-family:'Segoe UI', sans-serif;text-align:center;padding:20px;">
            <div style="max-width:600px;background:#18181b;padding:40px;border-radius:12px;border:1px solid #27272a;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5);">
                <h1 style="color:#ef4444;margin-bottom:1.5rem;font-size:2rem;">Access Denied</h1>
                <p style="color:#e4e4e7;font-size:1.1rem;line-height:1.6;margin-bottom:1.5rem;">
                    This application is proprietary software restricted to authorized domains.
                </p>
                <p style="color:#a1a1aa;font-size:0.95rem;line-height:1.6;margin-bottom:2rem;">
                    The developer has implemented domain-locking security protocols. 
                    Execution of this tool outside of <strong>jesse-anderson.net</strong> and authorized subdomains is strictly prohibited and functionally disabled.
                </p>
                <div style="font-family:monospace;background:#000;padding:12px;border-radius:6px;color:#ef4444;font-size:0.85rem;">
                    Error: DOMAIN_VALIDATION_FAILURE<br>
                    Origin: ${window.location.hostname}
                </div>
            </div>
        </div>
    `;
    throw new Error(`Unauthorized domain: ${window.location.hostname}`);
}

// Initialize WASM and expose to global scope
let wasmReady = false;
let wasmError = null;

async function initWasm() {
    try {
        await init();
        wasmReady = true;
        console.log(test()); // Should print "Rust WASM is working!"
    } catch (e) {
        wasmError = e;
        console.error('Failed to load WASM:', e);
    }
}

initWasm().then(() => {
    // Trigger regression if button was clicked before WASM was ready
    if (window.pendingRegression) {
        window.runRegressionWithWasm(window.pendingRegression.yVar, window.pendingRegression.xVars);
        window.pendingRegression = null;
    }
});

// Expose to window for use in inline script
window.WasmRegression = {
    isReady: () => wasmReady,
    getError: () => wasmError,
    ols: (y, xVars, names) => {
        const yJson = JSON.stringify(y);
        const xJson = JSON.stringify(xVars);
        const namesJson = JSON.stringify(names);
        return ols_regression(yJson, xJson, namesJson);
    },
    parseCsv: (content) => parse_csv(content)
};

// ============================================ 
// STATE MANAGEMENT
// ============================================ 
const STATE = {
    rawData: [],           // Array of row objects
    headers: [],           // Column names
    numericColumns: [],    // Names of numeric columns
    yVariable: null,       // Selected Y variable
    xVariables: [],        // Selected X variables (array)
    regressionResults: null,
    charts: {
        main: null,
        residuals: null,
        qq: null
    },
    pendingWorkbook: null  // For sheet selector modal
};

// ============================================

// STATISTICAL FUNCTIONS

// ============================================

const Stats = {

    // Critical t-value for confidence interval (using Rust WASM)

    tCritical: (alpha, df) => {

        if (typeof get_t_critical !== 'function') {

            console.warn("WASM get_t_critical not ready");

            return 1.96; // Fallback

        }

        return get_t_critical(alpha, df);

    },



    // Inverse normal CDF (using Rust WASM)

    normalInverse: (p) => {

        if (typeof get_normal_inverse !== 'function') {

            console.warn("WASM get_normal_inverse not ready");

            return 0; // Fallback

        }

        return get_normal_inverse(p);

    },



    // Mean

    mean: (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,



    // Variance

    variance: (arr, ddof = 1) => {

        const mu = Stats.mean(arr);

        return arr.reduce((sum, x) => sum + (x - mu) ** 2, 0) / (arr.length - ddof);

    },



    // Standard deviation

    std: (arr, ddof = 1) => Math.sqrt(Stats.variance(arr, ddof))

};

// ============================================ 
// REGRESSION CALCULATIONS (Using Rust WASM for R-accurate results)
// ============================================ 
async function calculateRegression(yVar, xVars) {
    const n = STATE.rawData.length;
    const k = xVars.length;

    // Validate minimum sample size
    if (n <= k + 1) {
        throw new Error(`Need at least ${k + 2} data points for ${k} predictor(s). You have ${n}.`);
    }

    // Validate that all variables exist in the data
    const allVariables = [yVar, ...xVars];
    for (const v of allVariables) {
        if (typeof v !== 'string') {
            throw new Error(`Invalid variable name: ${v}`);
        }
        // Check if variable exists in first row (if data exists)
        if (STATE.rawData.length > 0 && !(v in STATE.rawData[0])) {
            throw new Error(`Variable "${v}" not found in data. Available columns: ${Object.keys(STATE.rawData[0]).join(', ')}`);
        }
    }

    // Check if WASM is ready
    if (!window.WasmRegression || !window.WasmRegression.isReady()) {
        throw new Error('WASM module is not ready yet. Please wait a moment and try again.');
    }

    // Prepare data for WASM
    const yData = STATE.rawData.map(row => row[yVar]);
    const xData = xVars.map(v => STATE.rawData.map(row => row[v]));
    const names = ['Intercept', ...xVars];

    // Call WASM OLS regression
    const resultJson = window.WasmRegression.ols(yData, xData, names);
    console.log('Raw WASM result:', resultJson); // Debug log
    const result = JSON.parse(resultJson);

    // Check for error
    if (result.error) {
        throw new Error(result.error);
    }

    // Validate required arrays exist
    if (!result.coefficients || !result.std_errors || !result.conf_int_lower || !result.conf_int_upper) {
        console.error('WASM result:', result);
        throw new Error('Invalid WASM response: missing required fields');
    }

    // Check for NaN values in results (indicates calculation error)
    if (result.conf_int_lower.some(v => v === null || v === undefined || isNaN(v))) {
        console.error('WASM conf_int_lower contains NaN:', result.conf_int_lower);
        throw new Error('WASM calculation error: confidence intervals contain NaN values');
    }

    // Transform WASM output to match expected format
    return {
        coefficients: result.coefficients,
        stdErrors: result.std_errors,
        tStats: result.t_stats,
        pValues: result.p_values,
        rSquared: result.r_squared,
        adjRSquared: result.adj_r_squared,
        mse: result.mse,
        stdError: result.std_error,
        fStat: result.f_statistic,
        fPValue: result.f_p_value,
        predictions: result.predictions,
        residuals: result.residuals,
        standardizedResiduals: result.standardized_residuals,
        confidenceIntervals: result.conf_int_lower.map((lower, i) => [lower, result.conf_int_upper[i]]),
        vif: result.vif,
        n: result.n,
        k: result.k,
        df: result.df,
        variableNames: result.variable_names
    };
}

// ============================================ 
// EXAMPLE DATASETS
// ============================================ 
const EXAMPLES = {
    simple: {
        description: 'Basic simple linear regression with a clear linear relationship between study hours and test scores.',
        csv: `Study_Hours,Test_Score
1,52
2,58
3,62
4,68
5,75
6,79
7,85
8,88
9,92
10,95
2.5,60
4.5,72
6.5,82
1.5,55
7.5,86
3.5,66
5.5,77
8.5,90
9.5,94
0.5,48`,
        yVar: 'Test_Score',
        xVars: ['Study_Hours'],
        toast: 'Simple X,Y loaded (20 samples)'
    },
    housing: {
        description: 'Demonstrates multiple regression with real-world relationships between price, square footage, bedrooms, and age.',
        csv: `Price,Square_Feet,Bedrooms,Age,Distance_to_City
245.5,1200,3,15,8.2
312.8,1800,4,10,5.5
198.4,950,2,25,12.3
425.6,2400,4,5,3.2
278.9,1450,3,8,6.8
356.2,2000,4,12,4.5
189.5,1100,2,20,15.0
512.3,2800,5,2,1.8
234.7,1350,3,18,9.5
298.1,1650,3,7,5.2
445.8,2200,4,3,2.5
167.9,900,2,30,18.5
367.4,1950,4,6,4.0
289.6,1500,3,14,7.8
198.2,1050,2,22,11.5
478.5,2600,5,1,2.0
256.3,1300,3,16,8.5
334.7,1850,4,9,5.8
178.5,1000,2,28,14.2
398.9,2100,4,4,3.5
223.4,1250,3,19,10.5
312.5,1700,3,11,6.2
156.8,850,2,35,20.0
423.7,2350,4,3,2.8
267.9,1400,3,13,7.2`,
        yVar: 'Price',
        xVars: ['Square_Feet', 'Bedrooms', 'Age'],
        toast: 'Housing Prices loaded (25 samples, 5 variables)'
    },
    singular: {
        description: 'This dataset contains perfect multicollinearity (X3 = X1 + X2 exactly). The matrix cannot be inverted, demonstrating a fundamental limitation of OLS.',
        csv: `Y,X1,X2,X3
10,1,2,3
15,2,3,5
20,3,4,7
25,4,5,9
30,5,6,11
35,6,7,13
40,7,8,15
45,8,9,17
50,9,10,19
55,10,11,21`,
        yVar: 'Y',
        xVars: ['X1', 'X2', 'X3'],
        toast: 'Singular matrix example loaded (will fail regression)'
    },
    messy: {
        description: 'Sales data from 3 different store tiers (Budget, Mid-range, Luxury). The confounding variable (Store_Tier) creates 3 distinct clusters. A single regression line will have poor fit—the data should be analyzed separately by tier.',
        csv: `Store_Tier,Marketing_Spend,Sales
Budget,1000,15000
Budget,1200,16500
Budget,800,14000
Budget,1500,18000
Budget,900,15500
Budget,1100,16200
Budget,1300,17000
Budget,700,13500
Budget,1400,17500
Budget,850,14800
Mid_range,3000,35000
Mid_range,3500,38000
Mid_range,2800,33000
Mid_range,4000,42000
Mid_range,3200,36000
Mid_range,3800,40000
Mid_range,2500,31000
Mid_range,4200,43500
Mid_range,2900,34000
Mid_range,3600,39000
Luxury,8000,55000
Luxury,9000,58000
Luxury,7500,53000
Luxury,10000,62000
Luxury,8500,56000
Luxury,9500,60000
Luxury,7000,51000
Luxury,10500,64000
Luxury,7800,54000
Luxury,9200,59000`,
        yVar: 'Sales',
        xVars: ['Marketing_Spend'],
        toast: 'Messy data loaded (30 samples with hidden clustering)'
    }
};

function loadExampleDataset() {
    const selectedExample = document.getElementById('exampleSelect').value;
    const example = EXAMPLES[selectedExample];

    parseCSVData(example.csv);
    showToast(example.toast, 'success');

    // Set up the regression configuration for this example
    STATE.yVariable = example.yVar;
    STATE.xVariables = [...example.xVars];
    updateColumnSelectors();
}

function updateExampleDescription() {
    const selectedExample = document.getElementById('exampleSelect').value;
    const description = EXAMPLES[selectedExample].description;
    document.getElementById('exampleDescription').textContent = description;
}

// ============================================ 
// FILE HANDLING
// ============================================ 
async function handleFileSelect(files) {
    if (!files || files.length === 0) return;

    const file = files[0];
    const maxSize = 50 * 1024 * 1024; // 50MB

    if (file.size > maxSize) {
        showToast('File exceeds 50MB limit', 'error');
        return;
    }

    const extension = file.name.split('.').pop().toLowerCase();

    try {
        if (extension === 'xlsx' || extension === 'xls') {
            await handleExcelFile(file);
        } else if (extension === 'csv') {
            await handleCSVFile(file);
        } else {
            showToast('Unsupported file type. Please use CSV, XLSX, or XLS.', 'error');
        }
    } catch (error) {
        console.error('File import error:', error);
        showToast(`Import failed: ${error.message}`, 'error');
    }

    document.getElementById('fileInput').value = '';
}

async function handleExcelFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer);

    if (workbook.SheetNames.length > 1) {
        // Show sheet selector modal
        STATE.pendingWorkbook = workbook;
        showSheetSelector(workbook.SheetNames);
    } else {
        // Single sheet - import directly
        await importExcelSheet(workbook, workbook.SheetNames[0]);
    }
}

async function importExcelSheet(workbook, sheetName) {
    const worksheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    await parseCSVData(csv);
    showToast(`Imported sheet: ${sheetName}`, 'success');
}

async function handleCSVFile(file) {
    const text = await file.text();
    await parseCSVData(text);
    showToast('CSV file imported successfully', 'success');
}

function parseCSVData(csvText) {
    if (!csvText || !csvText.trim()) {
        showToast('Empty data', 'error');
        return;
    }

    // Ensure WASM is ready
    if (!window.WasmRegression || !window.WasmRegression.isReady()) {
        showToast('WASM engine loading... please try again in a moment', 'warning');
        return;
    }

    try {
        // Use Rust WASM for robust CSV parsing
        const resultJson = window.WasmRegression.parseCsv(csvText);
        const result = JSON.parse(resultJson);

        if (result.error) {
            showToast(`Parse error: ${result.error}`, 'error');
            return;
        }

        if (result.data.length === 0) {
            showToast('No data rows found', 'error');
            return;
        }

        STATE.headers = result.headers;
        STATE.rawData = result.data;
        STATE.numericColumns = result.numeric_columns;

        if (STATE.numericColumns.length < 2) {
            showToast('Need at least 2 numeric columns for regression', 'error');
            return;
        }

        // Update UI
        updateDataPreview();
        updateColumnSelectors();
        document.getElementById('dataPreview').style.display = 'block';
        document.getElementById('resultsSection').style.display = 'block';

        showToast(`Loaded ${STATE.rawData.length} rows with ${STATE.headers.length} columns (Rust parser)`, 'success');

    } catch (e) {
        console.error('CSV Parse Error:', e);
        showToast(`Error parsing CSV: ${e.message}`, 'error');
    }
}

function handlePaste(text) {
    if (!text.trim()) return;

    try {
        // Check if it's tab-separated (Excel paste) or CSV
        if (text.includes('\t')) {
            // Convert tabs to commas for CSV parsing
            const csv = text.replace(/\t/g, ',');
            parseCSVData(csv);
            showToast('Data pasted successfully', 'success');
        } else if (text.includes(',') || text.includes('\n')) {
            parseCSVData(text);
            showToast('Data pasted successfully', 'success');
        }
    } catch (error) {
        showToast(`Parse error: ${error.message}`, 'error');
    }
}

// ============================================ 
// UI UPDATES
// ============================================ 
function updateDataPreview() {
    const table = document.getElementById('previewTable');
    const previewRows = STATE.rawData.slice(0, 10);
    const headers = STATE.headers;

    // Build header row
    let html = '<thead><tr><th>#</th>';
    headers.forEach(h => {
        html += `<th>${escapeHtml(h)}</th>`;
    });
    html += '</tr></thead><tbody>';

    // Build data rows
    previewRows.forEach((row, idx) => {
        html += `<tr><td>${idx + 1}</td>`;
        headers.forEach(h => {
            const val = row[h];
            html += `<td>${typeof val === 'number' ? val.toFixed(4) : escapeHtml(String(val))}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody>';

    table.innerHTML = html;
    document.getElementById('totalRows').textContent = STATE.rawData.length;
}

function updateColumnSelectors() {
    const container = document.getElementById('columnSelectors');
    const numericCols = STATE.numericColumns;

    if (numericCols.length < 2) {
        container.innerHTML = '<p style="color: var(--text-muted);">Need at least 2 numeric columns</p>';
        return;
    }

    // Default selections
    if (!STATE.yVariable) {
        STATE.yVariable = numericCols[numericCols.length - 1]; // Last column as Y
    }
    if (STATE.xVariables.length === 0) {
        STATE.xVariables = [numericCols[numericCols.length - 2]]; // Second to last as X
    }

    let html = '';

    // Y Variable Selector
    html += '<div class="selector-group">';
    html += '<label>Y Variable (Response)</label>';
    html += '<select id="yVarSelect">';
    numericCols.forEach(col => {
        const selected = col === STATE.yVariable ? 'selected' : '';
        html += `<option value="${escapeHtml(col)}" ${selected}>${escapeHtml(col)}</option>`;
    });
    html += '</select>';
    html += '</div>';

    // X Variables (Multi-select)
    html += '<div class="selector-group">';
    html += '<label>X Variables (Predictors)</label>';
    html += '<div class="variable-checkboxes" id="xVarCheckboxes">';

    numericCols.forEach(col => {
        if (col === STATE.yVariable) return; // Skip Y variable
        const checked = STATE.xVariables.includes(col) ? 'checked' : '';
        html += `<label class="variable-checkbox">
            <input type="checkbox" value="${escapeHtml(col)}" ${checked}>
            <span>${escapeHtml(col)}</span>
        </label>`;
    });

    html += '</div>';
    html += '<button class="tool-btn" id="selectAllXBtn" style="margin-top: 8px; padding: 6px 12px; font-size: 0.75rem;">Select All</button>';
    html += '</div>';

    container.innerHTML = html;

    // Show the Run Regression button
    const runBtn = document.getElementById('runRegressionBtn');
    runBtn.style.display = 'block';

    // Add event listeners
    document.getElementById('yVarSelect').addEventListener('change', (e) => {
        STATE.yVariable = e.target.value;
        updateColumnSelectors(); // Rebuild to update X options
    });

    document.getElementById('xVarCheckboxes').addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            updateXVariables();
        }
    });

    document.getElementById('selectAllXBtn').addEventListener('click', () => {
        const checkboxes = document.querySelectorAll('#xVarCheckboxes input[type="checkbox"]');
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        checkboxes.forEach(cb => {
            cb.checked = !allChecked;
        });
        updateXVariables();
    });
}

function updateXVariables() {
    const checkboxes = document.querySelectorAll('#xVarCheckboxes input[type="checkbox"]:checked');
    STATE.xVariables = Array.from(checkboxes).map(cb => cb.value);
}

function updateResultsDisplay(results) {
    // Update statistics cards (handle NaN for edge cases)
    document.getElementById('rSquared').textContent =
        isNaN(results.rSquared) ? 'N/A (no Y variance)' : results.rSquared.toFixed(4);
    document.getElementById('adjRSquared').textContent =
        isNaN(results.adjRSquared) ? 'N/A' : results.adjRSquared.toFixed(4);
    document.getElementById('fStat').textContent = results.fStat.toFixed(4);
    document.getElementById('pValue').textContent = formatPValue(results.fPValue);

    // Update equation
    updateEquation(results);

    // Update VIF display
    updateVIFDisplay(results);

    // Update coefficients table
    updateCoefficientsTable(results);

    // Update residuals table
    updateResidualsTable(results);

    // Update charts
    updateCharts(results);
}

function updateVIFDisplay(results) {
    const vifSection = document.getElementById('vifSection');
    const vifNote = document.getElementById('vifNote');
    const vifBody = document.getElementById('vifBody');

    if (!vifSection || !vifNote || !vifBody) return;

    // Show explanatory note for simple regression, VIF table for multiple regression
    if (results.k <= 1) {
        vifNote.style.display = 'block';
        vifSection.style.display = 'none';
        return;
    }

    vifNote.style.display = 'none';
    vifSection.style.display = 'block';
    vifBody.innerHTML = '';

    results.vif.forEach(vif => {
        const vifValue = vif.vif === Infinity ? '∞' : vif.vif.toFixed(2);
        let colorClass = 'success';
        if (vif.vif > 10) colorClass = 'error';
        else if (vif.vif > 5) colorClass = 'warning';

        vifBody.innerHTML += `
            <tr>
                <td>${escapeHtml(vif.variable)}</td>
                <td class="${colorClass}">${vifValue}</td>
                <td>${vif.rsquared.toFixed(4)}</td>
                <td>${vif.interpretation}</td>
            </tr>
        `;
    });
}

function updateEquation(results) {
    const names = results.variableNames;
    const coeffs = results.coefficients;
    const pValues = results.pValues;
    const isSimple = results.k === 1;

    // Build symbolic form (e.g., y = mx + b)
    let symbolic = '';
    if (isSimple) {
        // Simple: y = mx + b
        const xName = names[1];
        symbolic = `<span style="color: var(--accent-educational);">y</span> = m×${escapeHtml(xName)} + b`;
    } else {
        // Multiple: y = b + m₁x₁ + m₂x₂ + ...
        let parts = ['b'];
        for (let i = 1; i < names.length; i++) {
            parts.push(`m<sub>${i}</sub>×${escapeHtml(names[i])}`);
        }
        symbolic = `<span style="color: var(--accent-educational);">y</span> = ${parts.join(' + ')}`;
    }

    // Build numeric form with actual values
    let numeric = `<span style="color: var(--accent-educational);">ŷ</span> = `;

    coeffs.forEach((coef, i) => {
        const name = escapeHtml(names[i]);
        const sign = coef >= 0 ? (i === 0 ? '' : ' + ') : ' - ';
        const absCoef = Math.abs(coef).toFixed(4);
        const pv = pValues[i];

        // Add significance indicator
        let sig = '';
        if (pv < 0.001) sig = '***';
        else if (pv < 0.01) sig = '**';
        else if (pv < 0.05) sig = '*';

        if (i === 0) {
            // Intercept (b)
            numeric += `<span title="Intercept (b)">${coef.toFixed(4)}${sig}</span>`;
        } else {
            // Slope coefficients (m₁, m₂, ...)
            const label = isSimple ? 'm' : `m<sub>${i}</sub>`;
            numeric += `${sign}<span title="${name} coefficient (${label})">${absCoef}×${name}${sig}</span>`;
        }
    });

    // Build parameter values section
    let params = '<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">';
    params += '<div style="font-size: 0.6875rem; color: var(--text-muted); margin-bottom: 8px;">Parameters:</div>';

    coeffs.forEach((coef, i) => {
        const pv = pValues[i];
        let sig = '';
        if (pv < 0.001) sig = '***';
        else if (pv < 0.01) sig = '**';
        else if (pv < 0.05) sig = '*';

        if (i === 0) {
            params += `<div><span style="color: var(--text-muted);">b</span> (intercept) = <strong>${coef.toFixed(4)}</strong>${sig}</div>`;
        } else {
            const label = isSimple ? 'm' : `m<sub>${i}</sub>`;
            params += `<div><span style="color: var(--text-muted);">${label}</span> (${escapeHtml(names[i])}) = <strong>${coef.toFixed(4)}</strong>${sig}</div>`;
        }
    });
    params += '</div>';

    // Combine all parts
    document.getElementById('equation').innerHTML = `
        <div style="margin-bottom: 8px;">
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Form:</div>
            ${symbolic}
        </div>
        <div style="margin-bottom: 8px;">
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 4px;">Fitted:</div>
            ${numeric}
        </div>
        ${params}
    `;
}

function updateCoefficientsTable(results) {
    const tbody = document.getElementById('coefficientsBody');
    const names = results.variableNames;
    const coeffs = results.coefficients;
    const stdErrs = results.stdErrors;
    const tStats = results.tStats;
    const pValues = results.pValues;
    const ci = results.confidenceIntervals;

    let html = '';
    names.forEach((name, i) => {
        const signClass = coeffs[i] >= 0 ? 'positive' : 'negative';
        html += `<tr>
            <td>${escapeHtml(name)}</td>
            <td class="${signClass}">${coeffs[i].toFixed(4)}</td>
            <td>${stdErrs[i].toFixed(4)}</td>
            <td>${tStats[i].toFixed(4)}</td>
            <td>${formatPValue(pValues[i])}</td>
            <td>${ci[i][0].toFixed(4)}</td>
            <td>${ci[i][1].toFixed(4)}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

function updateResidualsTable(results) {
    const tbody = document.getElementById('residualsBody');
    const { residuals, predictions, standardizedResiduals } = results;
    const yData = STATE.rawData.map(row => row[STATE.yVariable]);

    let html = '';
    yData.forEach((actual, i) => {
        html += `<tr>
            <td>${i + 1}</td>
            <td>${actual.toFixed(4)}</td>
            <td>${predictions[i].toFixed(4)}</td>
            <td class="${residuals[i] >= 0 ? 'positive' : 'negative'}">${residuals[i].toFixed(4)}</td>
            <td>${standardizedResiduals[i].toFixed(4)}</td>
        </tr>`;
    });

    tbody.innerHTML = html;
}

function updateCharts(results) {
    updateMainChart(results);
    updateResidualsChart(results);
    updateQQChart(results);
}

function updateMainChart(results) {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const colors = getChartColors();

    if (STATE.charts.main && typeof STATE.charts.main.destroy === 'function') {
        STATE.charts.main.destroy();
    }

    const yData = STATE.rawData.map(row => row[STATE.yVariable]);

    if (results.k === 1) {
        // Simple regression: scatter with regression line and confidence band
        const xVarName = STATE.xVariables[0];
        const xData = STATE.rawData.map(row => row[xVarName]);

        // Sort for line plotting
        const sorted = xData.map((x, i) => ({ x, y: yData[i] }))
            .sort((a, b) => a.x - b.x);
        const sortedX = sorted.map(p => p.x);

        // Generate regression line
        const xMin = Math.min(...xData);
        const xMax = Math.max(...xData);
        const b0 = results.coefficients[0];
        const b1 = results.coefficients[1];
        const lineData = [
            { x: xMin, y: b0 + b1 * xMin },
            { x: xMax, y: b0 + b1 * xMax }
        ];

        // Generate 95% confidence band (proper formula for mean response)
        const xMean = Stats.mean(xData);
        const ssx = xData.reduce((sum, x) => sum + Math.pow(x - xMean, 2), 0);
        const seFit = (x) => results.stdError * Math.sqrt(1/results.n + Math.pow(x - xMean, 2) / ssx);
        const tCrit = Stats.tCritical(0.05, results.df);

        // Create confidence band points (more points for smooth curve)
        const bandPoints = 50;
        const xRange = xMax - xMin;
        const confidenceBand = [];
        for (let i = 0; i <= bandPoints; i++) {
            const x = xMin + (xRange * i / bandPoints);
            const y = b0 + b1 * x;
            const se = seFit(x);
            const margin = tCrit * se;
            confidenceBand.push({ x: x, y: y + margin }); // Upper
        }
        for (let i = bandPoints; i >= 0; i--) {
            const x = xMin + (xRange * i / bandPoints);
            const y = b0 + b1 * x;
            const se = seFit(x);
            const margin = tCrit * se;
            confidenceBand.push({ x: x, y: y - margin }); // Lower
        }

        document.getElementById('mainChartTitle').textContent = `Scatter Plot: ${escapeHtml(xVarName)} vs ${escapeHtml(STATE.yVariable)} (95% Confidence Band for Mean Response)`;

        STATE.charts.main = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: '95% Confidence Band (Mean Response)',
                        data: confidenceBand,
                        type: 'line',
                        borderColor: 'transparent',
                        backgroundColor: hexToRgba(colors.line, 0.15),
                        fill: true,
                        pointRadius: 0,
                        tension: 0.4
                    },
                    {
                        label: 'Regression Line',
                        data: lineData,
                        type: 'line',
                        borderColor: colors.line,
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false
                    },
                    {
                        label: 'Data Points',
                        data: xData.map((x, i) => ({ x, y: yData[i] })),
                        backgroundColor: colors.accent,
                        pointRadius: 6,
                        pointHoverRadius: 8
                    }
                ]
            },
            options: getChartOptions(`${escapeHtml(xVarName)}`, escapeHtml(STATE.yVariable))
        });
    } else {
        // Multiple regression: actual vs predicted
        document.getElementById('mainChartTitle').textContent = 'Actual vs Predicted Values';

        const scatterData = yData.map((actual, i) => ({
            x: actual,
            y: results.predictions[i]
        }));

        // Perfect fit line
        const minVal = Math.min(...yData, ...results.predictions);
        const maxVal = Math.max(...yData, ...results.predictions);

        STATE.charts.main = new Chart(ctx, {
            type: 'scatter',
            data: {
                datasets: [
                    {
                        label: 'Data Points',
                        data: scatterData,
                        backgroundColor: colors.accent,
                        pointRadius: 6,
                        pointHoverRadius: 8
                    },
                    {
                        label: 'Perfect Fit (y = x)',
                        data: [{ x: minVal, y: minVal }, { x: maxVal, y: maxVal }],
                        type: 'line',
                        borderColor: colors.line,
                        borderWidth: 2,
                        pointRadius: 0,
                        fill: false,
                        borderDash: [5, 5]
                    }
                ]
            },
            options: getChartOptions('Actual', 'Predicted')
        });
    }
}

// Helper to convert hex color to rgba
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function updateResidualsChart(results) {
    const canvas = document.getElementById('residualsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const colors = getChartColors();

    if (STATE.charts.residuals && typeof STATE.charts.residuals.destroy === 'function') {
        STATE.charts.residuals.destroy();
    }

    const residualsData = results.predictions.map((pred, i) => ({
        x: pred,
        y: results.residuals[i]
    }));

    const maxResid = Math.max(...results.residuals.map(Math.abs));
    const zeroLine = [
        { x: Math.min(...results.predictions), y: 0 },
        { x: Math.max(...results.predictions), y: 0 }
    ];

    STATE.charts.residuals = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Residuals',
                    data: residualsData,
                    backgroundColor: colors.accent,
                    pointRadius: 5,
                    pointHoverRadius: 7
                },
                {
                    label: 'Zero Line',
                    data: zeroLine,
                    type: 'line',
                    borderColor: colors.error,
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: colors.text }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            return `(${ctx.parsed.x.toFixed(3)}, ${ctx.parsed.y.toFixed(3)})`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Fitted Values',
                        color: colors.textMuted
                    },
                    ticks: { color: colors.textMuted },
                    grid: { color: colors.border }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Residuals',
                        color: colors.textMuted
                    },
                    ticks: { color: colors.textMuted },
                    grid: { color: colors.border }
                }
            }
        }
    });
}

function updateQQChart(results) {
    const canvas = document.getElementById('qqChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const colors = getChartColors();

    if (STATE.charts.qq && typeof STATE.charts.qq.destroy === 'function') {
        STATE.charts.qq.destroy();
    }

    // Calculate Q-Q plot data
    const residuals = results.residuals;
    const n = residuals.length;

    // Sort residuals
    const sortedResiduals = [...residuals].sort((a, b) => a - b);

    // Calculate theoretical quantiles from standard normal distribution
    const theoreticalQuantiles = [];
    for (let i = 0; i < n; i++) {
        // Use (i - 0.5) / n for plotting position (median rank method)
        const p = (i + 0.5) / n;
        const z = Stats.normalInverse(p);
        theoreticalQuantiles.push(z);
    }

    // Standardize residuals to have mean 0 and std 1
    const resMean = Stats.mean(residuals);
    const resStd = Stats.std(residuals, 1);

    // Handle edge case: all residuals are identical (no variation)
    let standardizedSorted;
    if (resStd === 0 || isNaN(resStd)) {
        // If no variation, use z-scores of 0 (all at the mean)
        standardizedSorted = sortedResiduals.map(() => 0);
    } else {
        standardizedSorted = sortedResiduals.map(r => (r - resMean) / resStd);
    }

    // Create scatter data for Q-Q plot
    const qqData = theoreticalQuantiles.map((z, i) => ({
        x: z,
        y: standardizedSorted[i]
    }));

    // Reference line (y = x)
    const minVal = Math.min(...theoreticalQuantiles);
    const maxVal = Math.max(...theoreticalQuantiles);
    const referenceLine = [
        { x: minVal, y: minVal },
        { x: maxVal, y: maxVal }
    ];

    // Calculate correlation coefficient for normality test
    // High correlation suggests normality
    const meanX = Stats.mean(theoreticalQuantiles);
    const meanY = Stats.mean(standardizedSorted);
    let numerator = 0, denomX = 0, denomY = 0;
    for (let i = 0; i < n; i++) {
        numerator += (theoreticalQuantiles[i] - meanX) * (standardizedSorted[i] - meanY);
        denomX += (theoreticalQuantiles[i] - meanX) ** 2;
        denomY += (standardizedSorted[i] - meanY) ** 2;
    }

    // Guard against division by zero in correlation calculation
    let correlation;
    const denomProduct = denomX * denomY;
    if (denomProduct === 0 || isNaN(denomProduct)) {
        correlation = 0; // No correlation if no variation
    } else {
        correlation = numerator / Math.sqrt(denomProduct);
    }

    // Interpret correlation value
    let normalityAssessment = 'Unknown';
    let correlationColor = colors.text;
    if (correlation > 0.98) {
        normalityAssessment = 'Good (residuals appear normal)';
        correlationColor = colors.accent;
    } else if (correlation > 0.95) {
        normalityAssessment = 'Moderate (some deviation from normal)';
        correlationColor = colors.line;
    } else {
        normalityAssessment = 'Poor (residuals deviate from normality)';
        correlationColor = colors.error;
    }

    STATE.charts.qq = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Reference Line (y = x)',
                    data: referenceLine,
                    type: 'line',
                    borderColor: colors.textMuted,
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    borderDash: [6, 6]
                },
                {
                    label: 'Standardized Residuals',
                    data: qqData,
                    backgroundColor: colors.accent,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: colors.text },
                    // Add correlation to legend title
                    title: {
                        display: true,
                        text: `Correlation: ${correlation.toFixed(4)} - ${normalityAssessment}`,
                        color: correlationColor,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            return `(${ctx.parsed.x.toFixed(3)}, ${ctx.parsed.y.toFixed(3)})`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Theoretical Quantiles (Standard Normal)',
                        color: colors.textMuted
                    },
                    ticks: { color: colors.textMuted },
                    grid: { color: colors.border }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Sample Quantiles (Standardized Residuals)',
                        color: colors.textMuted
                    },
                    ticks: { color: colors.textMuted },
                    grid: { color: colors.border }
                }
            }
        }
    });
}

function getChartOptions(xLabel, yLabel) {
    const colors = getChartColors();
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: colors.text }
            },
            tooltip: {
                callbacks: {
                    label: (ctx) => {
                        return `(${ctx.parsed.x.toFixed(3)}, ${ctx.parsed.y.toFixed(3)})`;
                    }
                }
            }
        },
        scales: {
            x: {
                type: 'linear',
                position: 'bottom',
                title: {
                    display: true,
                    text: xLabel,
                    color: colors.textMuted
                },
                ticks: { color: colors.textMuted },
                grid: { color: colors.border }
            },
            y: {
                title: {
                    display: true,
                    text: yLabel,
                    color: colors.textMuted
                },
                ticks: { color: colors.textMuted },
                grid: { color: colors.border }
            }
        }
    };
}

function getChartColors() {
    const style = getComputedStyle(document.body);
    return {
        accent: style.getPropertyValue('--accent-educational').trim(),
        line: style.getPropertyValue('--accent-engineering').trim(),
        text: style.getPropertyValue('--text-primary').trim(),
        textMuted: style.getPropertyValue('--text-secondary').trim(),
        border: style.getPropertyValue('--border-color').trim(),
        error: style.getPropertyValue('--accent-error').trim()
    };
}

// ============================================ 
// SHEET SELECTOR MODAL
// ============================================ 
function showSheetSelector(sheetNames) {
    const select = document.getElementById('sheetSelect');
    select.innerHTML = sheetNames.map(name =>
        `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`
    ).join('');

    updateSheetPreview(sheetNames[0]);
    select.addEventListener('change', (e) => updateSheetPreview(e.target.value));

    document.getElementById('sheetModal').classList.add('active');
}

function updateSheetPreview(sheetName) {
    if (!STATE.pendingWorkbook) return;

    const worksheet = STATE.pendingWorkbook.Sheets[sheetName];
    const preview = XLSX.utils.sheet_to_json(worksheet, { header: 1 }).slice(0, 5);

    let html = '<strong>First 5 rows:</strong><br>';
    preview.forEach((row, i) => {
        html += row.map(cell => `<span style="display: inline-block; min-width: 80px; padding: 2px 4px;">${escapeHtml(String(cell ?? ''))}</span>`).join('');
        html += '<br>';
    });

    document.getElementById('sheetPreview').innerHTML = html;
}

function closeSheetModal() {
    document.getElementById('sheetModal').classList.remove('active');
    STATE.pendingWorkbook = null;
}

// ============================================ 
// EXPORT FUNCTIONS
// ============================================ 
function exportChartsAsPNG() {
    if (!STATE.charts.main) {
        showToast('No charts to export', 'warning');
        return;
    }

    // Create a canvas to combine all three charts
    const canvas = document.createElement('canvas');
    const mainCanvas = document.getElementById('mainChart');
    const residualsCanvas = document.getElementById('residualsChart');
    const qqCanvas = document.getElementById('qqChart');

    const width = Math.max(mainCanvas.width, residualsCanvas.width, qqCanvas.width);
    const height = mainCanvas.height + residualsCanvas.height + qqCanvas.height + 100;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-card').trim();
    ctx.fillRect(0, 0, width, height);

    // Title
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-primary').trim();
    ctx.font = '16px "Space Grotesk", sans-serif';
    ctx.fillText('Linear Regression Analysis', 20, 25);

    // Draw main chart
    ctx.drawImage(mainCanvas, 0, 40);

    // Draw residuals chart
    ctx.drawImage(residualsCanvas, 0, mainCanvas.height + 50);

    // Draw Q-Q chart
    ctx.drawImage(qqCanvas, 0, mainCanvas.height + residualsCanvas.height + 60);

    // Export
    const link = document.createElement('a');
    link.download = 'linear-regression-charts.png';
    link.href = canvas.toDataURL('image/png');
    link.click();

    showToast('Charts exported as PNG', 'success');
}

function exportResultsAsCSV() {
    if (!STATE.regressionResults) {
        showToast('No results to export', 'warning');
        return;
    }

    const results = STATE.regressionResults;

    let csv = 'Linear Regression Results\n\n';

    // Model summary
    csv += 'Model Summary\n';
    csv += `R-Squared,${results.rSquared}
`;
    csv += `Adjusted R-Squared,${results.adjRSquared}
`;
    csv += `F-Statistic,${results.fStat}
`;
    csv += `p-value,${results.fPValue}
`;
    csv += `MSE,${results.mse}
`;
    csv += `Standard Error,${results.stdError}
`;
    csv += `Observations,${results.n}
`;
    csv += `Predictors,${results.k}\n\n`;

    // Coefficients
    csv += 'Coefficients\n';
    csv += 'Variable,Coefficient,Std Error,t-stat,p-value,95% CI Lower,95% CI Upper\n';
    results.variableNames.forEach((name, i) => {
        csv += `"${escapeHtml(name)}",${results.coefficients[i]},${results.stdErrors[i]},${results.tStats[i]},${results.pValues[i]},${results.confidenceIntervals[i][0]},${results.confidenceIntervals[i][1]}\n`;
    });
    csv += '\n';

    // Residuals
    csv += 'Residuals\n';
    csv += '#,Actual,Predicted,Residual,Standardized Residual\n';
    const yData = STATE.rawData.map(row => row[STATE.yVariable]);
    yData.forEach((actual, i) => {
        csv += `${i+1},${actual},${results.predictions[i]},${results.residuals[i]},${results.standardizedResiduals[i]}\n`;
    });

    // Download
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.download = 'regression-results.csv';
    link.href = URL.createObjectURL(blob);
    link.click();

    showToast('Results exported as CSV', 'success');
}

// ============================================ 
// UTILITY FUNCTIONS
// ============================================ 
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatPValue(p) {
    if (p < 0.0001) return '< 0.0001 ***';
    if (p < 0.001) return `< ${p.toExponential(1)} **`;
    if (p < 0.01) return `< ${p.toExponential(1)} *`;
    return p.toFixed(4);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
        info: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    toast.innerHTML = `${icons[type] || icons.info}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============================================ 
// EVENT LISTENERS
// ============================================ 
document.addEventListener('DOMContentLoaded', () => {
    // File drop zone
    const dropZone = document.getElementById('fileDropZone');
    const fileInput = document.getElementById('fileInput');

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFileSelect(e.target.files));

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFileSelect(e.dataTransfer.files);
    });

    // Paste area
    const pasteArea = document.getElementById('pasteArea');
    let pasteTimeout;
    pasteArea.addEventListener('input', () => {
        clearTimeout(pasteTimeout);
        pasteTimeout = setTimeout(() => {
            handlePaste(pasteArea.value);
        }, 500);
    });

    document.getElementById('clearPasteBtn').addEventListener('click', () => {
        pasteArea.value = '';
    });

    // Load example dataset button
    document.getElementById('loadExampleBtn').addEventListener('click', loadExampleDataset);

    // Example dropdown change - update description
    document.getElementById('exampleSelect').addEventListener('change', updateExampleDescription);

    // Run regression button
    document.getElementById('runRegressionBtn').addEventListener('click', async () => {
        if (STATE.xVariables.length === 0) {
            showToast('Please select at least one X variable', 'warning');
            return;
        }

        // Check if WASM is ready
        if (!window.WasmRegression || !window.WasmRegression.isReady()) {
            showToast('WASM module loading... Please wait a moment and try again.', 'warning');
            // Store pending regression to run after WASM loads
            window.pendingRegression = {
                yVar: STATE.yVariable,
                xVars: STATE.xVariables
            };
            return;
        }

        const btn = document.getElementById('runRegressionBtn');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<span class="loading-spinner"></span> Running (WASM)...';

        try {
            STATE.regressionResults = await calculateRegression(STATE.yVariable, STATE.xVariables);
            updateResultsDisplay(STATE.regressionResults);
            showToast('Regression analysis complete (Rust WASM engine)', 'success');
        } catch (error) {
            showToast(`Regression error: ${error.message}`, 'error');
            console.error(error);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });

    // Sheet modal
    document.getElementById('closeSheetModal').addEventListener('click', closeSheetModal);
    document.getElementById('cancelSheetBtn').addEventListener('click', closeSheetModal);
    document.getElementById('confirmSheetBtn').addEventListener('click', () => {
        const sheetName = document.getElementById('sheetSelect').value;
        if (STATE.pendingWorkbook) {
            importExcelSheet(STATE.pendingWorkbook, sheetName);
        }
        closeSheetModal();
    });

    // Residuals table toggle
    document.getElementById('residualsToggle').addEventListener('click', function() {
        this.classList.toggle('collapsed');
        document.getElementById('residualsContent').classList.toggle('collapsed');
        this.setAttribute('aria-expanded', this.classList.contains('collapsed') ? 'false' : 'true');
    });

    // Help section toggle
    document.getElementById('helpToggle').addEventListener('click', function() {
        this.classList.toggle('collapsed');
        document.getElementById('helpContent').classList.toggle('collapsed');
        this.setAttribute('aria-expanded', this.classList.contains('collapsed') ? 'false' : 'true');
    });

    // Disclaimer toggle
    document.getElementById('disclaimerToggle').addEventListener('click', function() {
        this.classList.toggle('collapsed');
        document.getElementById('disclaimerContent').classList.toggle('collapsed');
        this.setAttribute('aria-expanded', this.classList.contains('collapsed') ? 'false' : 'true');
    });

    // Export buttons
    document.getElementById('exportPngBtn').addEventListener('click', exportChartsAsPNG);
    document.getElementById('exportCsvBtn').addEventListener('click', exportResultsAsCSV);

    // Theme change listener for chart updates
    const observer = new MutationObserver(() => {
        if (STATE.regressionResults) {
            updateCharts(STATE.regressionResults);
        }
    });
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });
});
