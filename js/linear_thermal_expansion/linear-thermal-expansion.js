// ============================================
// Linear Thermal Expansion Calculator
// ============================================

(function() {
'use strict';

let elements = null;

// Lowest physically possible temperature per unit, used to validate inputs.
const ABSOLUTE_ZERO = { C: -273.15, F: -459.67, K: 0 };

const materialsDB = [
    // Plastics - many have significant ranges depending on grade/orientation.
    // `use` overrides the mid-range average when a specific value is more
    // representative than the midpoint (e.g. PEEK's unfilled grade sits at
    // the bottom of its published range).
    { id: 'abs-generic', cat: 'Plastics', name: "ABS (Generic)", val: 75.0, max: 95.0 },
    { id: 'acetal-pom', cat: 'Plastics', name: "Acetal (POM)", val: 80.0, max: 85.0 },
    { id: 'acrylic-pmma', cat: 'Plastics', name: "Acrylic (PMMA)", val: 70.0, max: 75.0 },
    { id: 'cpvc', cat: 'Plastics', name: "CPVC", val: 69.5, max: 80.0 },
    { id: 'hdpe', cat: 'Plastics', name: "HDPE", val: 100.0, max: 200.0, use: 162 },
    { id: 'ldpe', cat: 'Plastics', name: "LDPE", val: 100.0, max: 240.0, use: 200 },
    { id: 'nylon-6', cat: 'Plastics', name: "Nylon 6", val: 70.0, max: 85.0 },
    { id: 'nylon-66', cat: 'Plastics', name: "Nylon 6/6", val: 70.0, max: 85.0 },
    // PEEK range from MatWeb: 47-108 depending on grade/reinforcement
    { id: 'peek', cat: 'Plastics', name: "PEEK", val: 47.0, max: 108.0, use: 47 },
    { id: 'polybutylene', cat: 'Plastics', name: "Polybutylene (PB)", val: 120.0, max: 140.0 },
    { id: 'polycarbonate', cat: 'Plastics', name: "Polycarbonate (PC)", val: 65.0, max: 70.0 },
    // PP range varies significantly: 100-150 (unfilled)
    { id: 'polypropylene', cat: 'Plastics', name: "Polypropylene (PP)", val: 100.0, max: 150.0, use: 150 },
    { id: 'polystyrene', cat: 'Plastics', name: "Polystyrene (PS)", val: 65.0, max: 75.0 },
    { id: 'pet', cat: 'Plastics', name: "PET (Polyester)", val: 65.0, max: 75.0 },
    // PTFE range from MatWeb: 100-165
    { id: 'ptfe', cat: 'Plastics', name: "PTFE (Teflon)", val: 100.0, max: 165.0, use: 126 },
    { id: 'pva', cat: 'Plastics', name: "PVA", val: 80.0, max: 90.0 },
    // PVC varies: rigid ~80, flexible higher
    { id: 'pvc-rigid', cat: 'Plastics', name: "PVC (Rigid)", val: 75.0, max: 85.0 },
    // PVDF range: 100-200 depending on grade
    { id: 'pvdf', cat: 'Plastics', name: "PVDF", val: 100.0, max: 200.0, use: 200 },
    // Metals - generally more consistent, smaller ranges
    { id: 'aluminum-3003', cat: 'Metals', name: "Aluminum 3003", val: 22.5, max: 23.6 },
    { id: 'aluminum-6061', cat: 'Metals', name: "Aluminum 6061", val: 23.2, max: 23.6 },
    { id: 'brass-yellow', cat: 'Metals', name: "Brass (Yellow)", val: 19.0, max: 20.5 },
    { id: 'brass-red', cat: 'Metals', name: "Brass (Red)", val: 18.0, max: 19.5 },
    { id: 'bronze-comm', cat: 'Metals', name: "Bronze (Comm.)", val: 17.5, max: 18.5 },
    { id: 'cast-iron-gray', cat: 'Metals', name: "Cast Iron, Gray", val: 10.5, max: 11.2 },
    { id: 'cast-iron-ductile', cat: 'Metals', name: "Cast Iron, Ductile", val: 11.0, max: 12.0 },
    // Copper alloys vary by composition
    { id: 'copper', cat: 'Metals', name: "Copper", val: 16.5, max: 17.2 },
    { id: 'gold', cat: 'Metals', name: "Gold", val: 14.0, max: 14.3 },
    { id: 'lead', cat: 'Metals', name: "Lead", val: 28.0, max: 30.0 },
    { id: 'magnesium', cat: 'Metals', name: "Magnesium", val: 25.0, max: 26.5 },
    { id: 'nickel', cat: 'Metals', name: "Nickel", val: 12.5, max: 13.5 },
    { id: 'platinum', cat: 'Metals', name: "Platinum", val: 8.8, max: 9.2 },
    { id: 'silver', cat: 'Metals', name: "Silver", val: 18.5, max: 19.7 },
    // Carbon steel varies by alloy content
    { id: 'steel-1020', cat: 'Metals', name: "Steel, Carbon (1020)", val: 11.5, max: 12.0 },
    { id: 'steel-4140', cat: 'Metals', name: "Steel, Carbon (4140)", val: 11.5, max: 13.0 },
    // Stainless varies by grade; 304/316 are well-defined
    { id: 'steel-304', cat: 'Metals', name: "Steel, SS 304", val: 17.2, max: 17.3 },
    { id: 'steel-316', cat: 'Metals', name: "Steel, SS 316", val: 15.5, max: 16.5 },
    { id: 'steel-a2', cat: 'Metals', name: "Steel, Tool A2", val: 11.3, max: 12.0 },
    { id: 'steel-d2', cat: 'Metals', name: "Steel, Tool D2", val: 10.2, max: 10.8 },
    { id: 'titanium-gr2', cat: 'Metals', name: "Titanium Gr2", val: 8.4, max: 8.8 },
    { id: 'zinc', cat: 'Metals', name: "Zinc", val: 29.0, max: 31.0 },
    // Wood - highly anisotropic and species-dependent
    { id: 'fir-parallel', cat: 'Wood', name: "Fir (Parallel)", val: 3.5, max: 4.2 },
    { id: 'fir-perp', cat: 'Wood', name: "Fir (Perp.)", val: 28.0, max: 38.0, use: 32 },
    { id: 'oak-parallel', cat: 'Wood', name: "Oak (Parallel)", val: 4.5, max: 5.5 },
    { id: 'oak-perp', cat: 'Wood', name: "Oak (Perp.)", val: 45.0, max: 65.0, use: 54 },
    { id: 'pine-parallel', cat: 'Wood', name: "Pine (Parallel)", val: 4.5, max: 5.5 },
    { id: 'pine-perp', cat: 'Wood', name: "Pine (Perp.)", val: 30.0, max: 40.0, use: 34 },
    // Others - ceramics, glasses, composites
    { id: 'alumina', cat: 'Others', name: "Alumina (99%)", val: 7.5, max: 8.7 },
    { id: 'concrete', cat: 'Others', name: "Concrete", val: 10.0, max: 14.0, use: 12 },
    // Borosilicate is very consistent
    { id: 'glass-borosilicate', cat: 'Others', name: "Glass, Borosilicate", val: 3.25, max: 3.3 },
    { id: 'glass-soda-lime', cat: 'Others', name: "Glass, Soda Lime", val: 8.5, max: 9.5 },
    // Fused quartz is extremely consistent
    { id: 'quartz-fused', cat: 'Others', name: "Quartz, Fused", val: 0.55, max: 0.59 }
];

/**
 * Get the CTE value to use for a material (the `use` override if specified,
 * otherwise the mid-range average)
 * @param {Object} material - Material object from materialsDB
 * @returns {number} The CTE value in µm/m·°C
 */
function getDisplayValue(material) {
    if (material.use !== undefined) return material.use;
    if (material.max !== undefined) return (material.val + material.max) / 2;
    return material.val;
}

/**
 * Format a material's CTE for display (range when applicable)
 * @param {Object} material - Material object from materialsDB
 * @returns {string} e.g. "11.5-12" or "0.55"
 */
function formatCTE(material) {
    if (material.max !== undefined && material.max !== material.val) {
        return `${material.val}-${material.max}`;
    }
    return `${material.val}`;
}

// ============================================
// Calculation Core
// ============================================

/**
 * Pure linear expansion computation: ΔL = α · L₀ · ΔT
 * @param {number} alphaMicro - CTE in µm/m·°C (i.e. 1e-6 per °C)
 * @param {number} L0 - Initial length (any unit; results share it)
 * @param {number} T1 - Initial temperature in tempUnit
 * @param {number} T2 - Final temperature in tempUnit
 * @param {string} tempUnit - 'C', 'F', or 'K'
 * @returns {Object} deltaTUser, deltaTC, deltaL, finalL, percentChange
 */
function computeExpansion(alphaMicro, L0, T1, T2, tempUnit) {
    const deltaTUser = T2 - T1;
    // A Fahrenheit degree is 5/9 the size of the Celsius degree alpha is
    // defined per; Kelvin and Celsius intervals are identical.
    const deltaTC = tempUnit === 'F' ? deltaTUser / 1.8 : deltaTUser;
    const deltaL = alphaMicro * 1e-6 * L0 * deltaTC;
    return {
        deltaTUser,
        deltaTC,
        deltaL,
        finalL: L0 + deltaL,
        percentChange: L0 !== 0 ? (deltaL / L0) * 100 : 0
    };
}

/**
 * Parse an input's text into a number, or null when empty/invalid.
 * (parseFloat(x) || 0 would silently compute against a fabricated zero.)
 * @param {string} str - Raw input value
 * @returns {number|null}
 */
function parseNum(str) {
    const v = parseFloat(str);
    return isNaN(v) ? null : v;
}

/**
 * Format a numeric value for the results panel.
 * toPrecision keeps 7 significant figures everywhere; the old toFixed(4)
 * squashed the [1e-4, 1e-2) decades down to 1-2 significant figures
 * (1.175e-4 displayed as "0.0001").
 * @param {number} num - Number to format
 * @returns {string}
 */
function formatNumber(num) {
    if (num === 0) return '0';
    if (!isFinite(num)) return '—';
    const abs = Math.abs(num);
    if (abs < 1e-4 || abs >= 1e9) return num.toExponential(3);
    return String(parseFloat(num.toPrecision(7)));
}

// ============================================
// Initialization
// ============================================

function init() {
    // Looked up at init rather than at script parse time so the tool does
    // not depend on where the script tag sits relative to the markup.
    elements = {
        materialSelect: document.getElementById('materialSelect'),
        cteInput: document.getElementById('cteInput'),
        cteRangeInfo: document.getElementById('cteRangeInfo'),
        lengthInput: document.getElementById('lengthInput'),
        lengthUnit: document.getElementById('lengthUnit'),
        tempInitial: document.getElementById('tempInitial'),
        tempFinal: document.getElementById('tempFinal'),
        tempUnit: document.getElementById('tempUnit'),
        resDeltaT: document.getElementById('resDeltaT'),
        resDeltaL: document.getElementById('resDeltaL'),
        resDeltaLUnit: document.getElementById('resDeltaLUnit'),
        resFinalL: document.getElementById('resFinalL'),
        resPercent: document.getElementById('resPercent'),
        vizExpansion: document.getElementById('vizExpansion'),
        vizLabel: document.getElementById('vizLabel'),
        cteTableBody: document.getElementById('cteTableBody')
    };

    populateTable();
    populateDropdown();

    const inputs = [
        elements.cteInput, elements.lengthInput,
        elements.tempInitial, elements.tempFinal
    ];

    inputs.forEach(el => el.addEventListener('input', calculate));
    [elements.lengthUnit, elements.tempUnit].forEach(el => el.addEventListener('change', calculate));

    elements.materialSelect.addEventListener('change', (e) => {
        const materialId = e.target.value;
        if (materialId !== 'custom') {
            const material = materialsDB.find(m => m.id === materialId);
            if (material) {
                setCteLocked(material);
            }
        } else {
            setCteCustom();
            elements.cteInput.focus();
        }
        calculate();
    });

    // Select default material (Steel, Carbon 1020 with CTE ~11.75)
    selectMaterial('steel-1020');

    // Table rows load a material on click or Enter/Space
    elements.cteTableBody.addEventListener('click', handleRowActivate);
    elements.cteTableBody.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleRowActivate(e);
        }
    });

    bindCollapsible('referencesHeader', 'referencesContent', 'referencesChevron');
    bindCollapsible('disclaimerHeader', 'disclaimerContent', 'disclaimerChevron');

    calculate();
}

function handleRowActivate(e) {
    const row = e.target.closest('tr');
    if (row && row.dataset.materialId) {
        selectMaterial(row.dataset.materialId);
        calculate();
    }
}

/**
 * Wire a collapsible section header for click and keyboard toggling
 * @param {string} headerId - Header element (role="button") ID
 * @param {string} contentId - Collapsible content ID
 * @param {string} chevronId - Chevron icon ID
 */
function bindCollapsible(headerId, contentId, chevronId) {
    const header = document.getElementById(headerId);
    const content = document.getElementById(contentId);
    const chevron = document.getElementById(chevronId);
    if (!header || !content || !chevron) return;

    const toggle = () => {
        const collapsed = content.classList.toggle('collapsed');
        chevron.classList.toggle('collapsed', collapsed);
        header.setAttribute('aria-expanded', String(!collapsed));
    };

    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
        }
    });
}

function populateDropdown() {
    const groups = {};
    materialsDB.forEach(m => {
        if (!groups[m.cat]) groups[m.cat] = [];
        groups[m.cat].push(m);
    });

    let html = '<option value="custom">Custom CTE...</option>';
    const order = ['Metals', 'Plastics', 'Wood', 'Others'];

    order.forEach(cat => {
        if (groups[cat]) {
            html += `<optgroup label="${cat}">`;
            groups[cat].sort((a, b) => a.name.localeCompare(b.name));
            groups[cat].forEach(m => {
                const displayVal = getDisplayValue(m);
                const cteStr = formatCTE(m);
                const rangeStr = (m.max !== undefined && m.max !== m.val) ? ` (${cteStr})` : ` (${displayVal})`;
                html += `<option value="${m.id}" data-cte="${displayVal}">${m.name}${rangeStr}</option>`;
            });
            html += `</optgroup>`;
        }
    });

    elements.materialSelect.innerHTML = html;
}

function populateTable() {
    const sorted = [...materialsDB].sort((a, b) => a.name.localeCompare(b.name));
    elements.cteTableBody.innerHTML = sorted.map(m => {
        const valC = formatCTE(m);
        // For imperial, convert the range endpoints (per °F is 5/9 of per °C)
        const valFC = (m.val * 5 / 9).toFixed(3);
        const valFMax = m.max !== undefined ? (m.max * 5 / 9).toFixed(3) : valFC;
        const valF = (m.max !== undefined && m.max !== m.val) ? `${valFC}-${valFMax}` : valFC;
        return `
            <tr data-material-id="${m.id}" role="button" tabindex="0" aria-label="Load ${m.name}">
                <td>${m.name}</td>
                <td>${valC}</td>
                <td>${valF}</td>
            </tr>
        `;
    }).join('');
}

// ============================================
// Material Selection
// ============================================

/** Lock the CTE input to a material's value */
function setCteLocked(material) {
    elements.cteInput.value = getDisplayValue(material);
    elements.cteInput.readOnly = true;
    elements.cteInput.classList.remove('custom-cte');
    updateRangeInfo(material);
}

/** Unlock the CTE input for custom entry */
function setCteCustom() {
    elements.cteInput.readOnly = false;
    elements.cteInput.classList.add('custom-cte');
    hideRangeInfo();
}

/**
 * Select a material by ID in the dropdown
 * @param {string} materialId - The material ID to select
 * @returns {boolean} True if material was found, false if fell back to custom
 */
function selectMaterial(materialId) {
    const material = materialsDB.find(m => m.id === materialId);

    if (material) {
        elements.materialSelect.value = materialId;
        setCteLocked(material);
        return true;
    }

    elements.materialSelect.value = 'custom';
    setCteCustom();
    return false;
}

// ============================================
// Range Info Display
// ============================================

/**
 * Update the CTE range info display based on selected material
 * @param {Object} material - The material object from materialsDB
 */
function updateRangeInfo(material) {
    const rangeInfo = elements.cteRangeInfo;
    if (!rangeInfo || !material) return;

    if (material.max !== undefined && material.max !== material.val) {
        const avgVal = (material.val + material.max) / 2;
        const variation = ((material.max - material.val) / avgVal * 100).toFixed(0);

        rangeInfo.innerHTML = `Range: <strong>${material.val} - ${material.max}</strong> µm/m·°C (~${variation}% variation)`;
        rangeInfo.style.display = 'flex';
    } else {
        rangeInfo.style.display = 'none';
    }
}

function hideRangeInfo() {
    if (elements.cteRangeInfo) {
        elements.cteRangeInfo.style.display = 'none';
    }
}

// ============================================
// Calculation
// ============================================

function calculate() {
    const alphaVal = parseNum(elements.cteInput.value);
    const L0 = parseNum(elements.lengthInput.value);
    const T1 = parseNum(elements.tempInitial.value);
    const T2 = parseNum(elements.tempFinal.value);
    const tempUnit = elements.tempUnit.value;

    validateLengthInput(L0);
    const tempError = validateTemperatureInputs(T1, T2, tempUnit);

    // Any missing input, a temperature below absolute zero, or a
    // nonpositive length blanks the results instead of computing against a
    // fabricated zero.
    if (alphaVal === null || L0 === null || T1 === null || T2 === null ||
        tempError || L0 <= 0) {
        clearResults();
        return;
    }

    const r = computeExpansion(alphaVal, L0, T1, T2, tempUnit);

    elements.resDeltaT.textContent = `${formatNumber(r.deltaTUser)} ${tempUnit === 'K' ? 'K' : '°' + tempUnit}`;

    const lUnit = elements.lengthUnit.value;
    const sign = r.deltaL > 0 ? '+' : '';

    elements.resDeltaL.textContent = sign + formatNumber(r.deltaL);
    elements.resDeltaLUnit.textContent = lUnit;
    elements.resFinalL.textContent = `${formatNumber(r.finalL)} ${lUnit}`;

    const pSign = r.percentChange > 0 ? '+' : '';
    let pText;
    // Use exponential only for extremely small values (< 0.0001%)
    // Otherwise use consistent 4 significant figures
    if (Math.abs(r.percentChange) < 0.0001 && r.percentChange !== 0) {
        pText = pSign + r.percentChange.toExponential(2) + '%';
    } else {
        pText = pSign + r.percentChange.toPrecision(4) + '%';
    }
    elements.resPercent.textContent = pText;

    updateViz(r.deltaL, L0);
}

function clearResults() {
    elements.resDeltaT.textContent = '—';
    elements.resDeltaL.textContent = '—';
    elements.resDeltaLUnit.textContent = elements.lengthUnit.value;
    elements.resFinalL.textContent = '—';
    elements.resPercent.textContent = '—';
    elements.vizExpansion.style.width = '0';
    elements.vizLabel.textContent = '';
}

/**
 * Show or create an inline error message under an input
 * @param {HTMLElement} input - The input element
 * @param {string} errorId - ID for the message element
 * @param {string} message - Error text
 */
function showInputError(input, errorId, message) {
    input.classList.add('input-invalid');

    let errorElement = document.getElementById(errorId);
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = errorId;
        errorElement.className = 'input-error-msg';
        input.parentElement.appendChild(errorElement);
    }
    errorElement.textContent = message;
}

/**
 * Clear an input's inline error state
 * @param {HTMLElement} input - The input element
 * @param {string} errorId - ID of the message element
 */
function clearInputError(input, errorId) {
    input.classList.remove('input-invalid');
    const errorElement = document.getElementById(errorId);
    if (errorElement) {
        errorElement.remove();
    }
}

function validateLengthInput(L0) {
    // An empty field is pending input, not an error
    if (L0 !== null && L0 <= 0) {
        const message = L0 === 0
            ? '⚠ Length must be greater than zero'
            : '⚠ Length cannot be negative';
        showInputError(elements.lengthInput, 'lengthInputError', message);
    } else {
        clearInputError(elements.lengthInput, 'lengthInputError');
    }
}

/**
 * Validate temperature inputs against absolute zero in the selected unit
 * @param {number|null} T1 - Initial temperature
 * @param {number|null} T2 - Final temperature
 * @param {string} unit - Temperature unit (C, F, K)
 * @returns {boolean} True if there's an error
 */
function validateTemperatureInputs(T1, T2, unit) {
    const limit = ABSOLUTE_ZERO[unit];
    const unitLabel = unit === 'K' ? 'K' : `°${unit}`;
    const message = `⚠ Below absolute zero (${limit} ${unitLabel} minimum)`;
    let hasError = false;

    if (T1 !== null && T1 < limit) {
        showInputError(elements.tempInitial, 'tempInitialError', message);
        hasError = true;
    } else {
        clearInputError(elements.tempInitial, 'tempInitialError');
    }

    if (T2 !== null && T2 < limit) {
        showInputError(elements.tempFinal, 'tempFinalError', message);
        hasError = true;
    } else {
        clearInputError(elements.tempFinal, 'tempFinalError');
    }

    return hasError;
}

// ============================================
// Visualization
// ============================================

function updateViz(dL, L0) {
    if (L0 === 0) return;

    const pct = (dL / L0) * 100;
    const isExpansion = dL >= 0;

    // The base bar is 80% of the track width and the expansion/contraction
    // bar is its child, so its % is relative to the base width. Clamp so
    // absurd inputs (strain beyond 25% would pass the track edge) can't
    // bleed outside the card; physical materials never get near the clamp.
    const absPct = Math.min(Math.abs(pct), isExpansion ? 25 : 100);

    if (isExpansion) {
        elements.vizExpansion.style.left = '100%';
        elements.vizExpansion.style.right = 'auto';
        elements.vizExpansion.style.width = absPct + '%';
        elements.vizExpansion.style.backgroundColor = 'var(--accent-engineering)';

        elements.vizLabel.textContent = `+ΔL ${formatNumber(dL)}`;
        elements.vizLabel.style.color = 'var(--accent-engineering)';
        // Position label at the end of the expansion bar (centered);
        // track position = 80% + (absPct% of the 80% base width)
        elements.vizLabel.style.left = `calc(80% + ${absPct * 0.8}%)`;
        elements.vizLabel.style.transform = 'translateX(-50%)';
    } else {
        elements.vizExpansion.style.left = 'auto';
        elements.vizExpansion.style.right = '0';
        elements.vizExpansion.style.width = absPct + '%';
        elements.vizExpansion.style.backgroundColor = 'var(--accent-error)';

        elements.vizLabel.textContent = `-ΔL ${formatNumber(Math.abs(dL))}`;
        elements.vizLabel.style.color = 'var(--accent-error)';
        // The contraction bar extends left from the base bar's right edge
        elements.vizLabel.style.left = `calc(80% - ${absPct * 0.8}%)`;
        elements.vizLabel.style.transform = 'translateX(-50%)';
    }
}

// Pure calculation surface exposed for automated tests
// (tests/smoke/linear-thermal-expansion.spec.cjs).
window.ThermalExpansion = {
    materialsDB,
    getDisplayValue,
    formatCTE,
    computeExpansion,
    formatNumber,
    ABSOLUTE_ZERO
};

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
})();
