// ============================================
// Linear Thermal Expansion Calculator
// ============================================

const elements = {
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
    vizBarBase: document.getElementById('vizBarBase'),
    vizExpansion: document.getElementById('vizExpansion'),
    vizLabel: document.getElementById('vizLabel'),
    cteTableBody: document.getElementById('cteTableBody')
};

const materialsDB = [
    // Plastics - many have significant ranges depending on grade/orientation
    { id: 'abs-generic', cat: 'Plastics', name: "ABS (Generic)", val: 75.0, max: 95.0 },
    { id: 'acetal-pom', cat: 'Plastics', name: "Acetal (POM)", val: 80.0, max: 85.0 },
    { id: 'acrylic-pmma', cat: 'Plastics', name: "Acrylic (PMMA)", val: 70.0, max: 75.0 },
    { id: 'cpvc', cat: 'Plastics', name: "CPVC", val: 69.5, max: 80.0 },
    { id: 'hdpe', cat: 'Plastics', name: "HDPE", val: 100.0, max: 200.0, useMax: 162 },
    { id: 'ldpe', cat: 'Plastics', name: "LDPE", val: 100.0, max: 240.0, useMax: 200 },
    { id: 'nylon-6', cat: 'Plastics', name: "Nylon 6", val: 70.0, max: 85.0 },
    { id: 'nylon-66', cat: 'Plastics', name: "Nylon 6/6", val: 70.0, max: 85.0 },
    // PEEK range from MatWeb: 47-108 depending on grade/reinforcement
    { id: 'peek', cat: 'Plastics', name: "PEEK", val: 47.0, max: 108.0, useMax: 47 },
    { id: 'polybutylene', cat: 'Plastics', name: "Polybutylene (PB)", val: 120.0, max: 140.0 },
    { id: 'polycarbonate', cat: 'Plastics', name: "Polycarbonate (PC)", val: 65.0, max: 70.0 },
    // PP range varies significantly: 100-150 (unfilled)
    { id: 'polypropylene', cat: 'Plastics', name: "Polypropylene (PP)", val: 100.0, max: 150.0, useMax: 150 },
    { id: 'polystyrene', cat: 'Plastics', name: "Polystyrene (PS)", val: 65.0, max: 75.0 },
    { id: 'pet', cat: 'Plastics', name: "PET (Polyester)", val: 65.0, max: 75.0 },
    // PTFE range from MatWeb: 100-165
    { id: 'ptfe', cat: 'Plastics', name: "PTFE (Teflon)", val: 100.0, max: 165.0, useMax: 126 },
    { id: 'pva', cat: 'Plastics', name: "PVA", val: 80.0, max: 90.0 },
    // PVC varies: rigid ~80, flexible higher
    { id: 'pvc-rigid', cat: 'Plastics', name: "PVC (Rigid)", val: 75.0, max: 85.0 },
    // PVDF range: 100-200 depending on grade
    { id: 'pvdf', cat: 'Plastics', name: "PVDF", val: 100.0, max: 200.0, useMax: 200 },
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
    { id: 'fir-perp', cat: 'Wood', name: "Fir (Perp.)", val: 28.0, max: 38.0, useMax: 32 },
    { id: 'oak-parallel', cat: 'Wood', name: "Oak (Parallel)", val: 4.5, max: 5.5 },
    { id: 'oak-perp', cat: 'Wood', name: "Oak (Perp.)", val: 45.0, max: 65.0, useMax: 54 },
    { id: 'pine-parallel', cat: 'Wood', name: "Pine (Parallel)", val: 4.5, max: 5.5 },
    { id: 'pine-perp', cat: 'Wood', name: "Pine (Perp.)", val: 30.0, max: 40.0, useMax: 34 },
    // Others - ceramics, glasses, composites
    { id: 'alumina', cat: 'Others', name: "Alumina (99%)", val: 7.5, max: 8.7 },
    { id: 'concrete', cat: 'Others', name: "Concrete", val: 10.0, max: 14.0, useMax: 12 },
    // Borosilicate is very consistent
    { id: 'glass-borosilicate', cat: 'Others', name: "Glass, Borosilicate", val: 3.25, max: 3.3 },
    { id: 'glass-soda-lime', cat: 'Others', name: "Glass, Soda Lime", val: 8.5, max: 9.5 },
    // Fused quartz is extremely consistent
    { id: 'quartz-fused', cat: 'Others', name: "Quartz, Fused", val: 0.55, max: 0.59 }
];

/**
 * Get the display value for a material (uses useMax if specified, otherwise avg)
 * @param {Object} material - Material object from materialsDB
 * @returns {number} The CTE value to use for calculation
 */
function getDisplayValue(material) {
    if (material.useMax !== undefined) return material.useMax;
    if (material.max !== undefined) return (material.val + material.max) / 2;
    return material.val;
}

/**
 * Format CTE value for display (shows range if applicable)
 * @param {Object} material - Material object from materialsDB
 * @param {boolean} includeUnit - Whether to include unit suffix
 * @returns {string} Formatted CTE string
 */
function formatCTE(material, includeUnit = true) {
    const unit = includeUnit ? '' : '';
    if (material.max !== undefined && material.max !== material.val) {
        if (material.useMax !== undefined) {
            return `${material.val}-${material.max}${unit}`;
        }
        return `${material.val}-${material.max}${unit}`;
    }
    return `${material.val}${unit}`;
}

// ============================================
// Initialization
// ============================================

function init() {
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
        if(materialId !== 'custom') {
            // Find the material and get its CTE value
            const material = materialsDB.find(m => m.id === materialId);
            if (material) {
                const displayVal = getDisplayValue(material);
                elements.cteInput.value = displayVal;
                elements.cteInput.readOnly = true;
                elements.cteInput.style.backgroundColor = 'var(--bg-secondary)';
                // Update range info for selected material
                updateRangeInfo(material);
            }
        } else {
            elements.cteInput.readOnly = false;
            elements.cteInput.style.backgroundColor = 'var(--bg-card)';
            elements.cteInput.focus();
            // Hide range info for custom input
            hideRangeInfo();
        }
        calculate();
    });

    // Select default material (Steel, Carbon 1020 with CTE ~11.75)
    selectMaterial('steel-1020');

    // Add event delegation for table row clicks
    elements.cteTableBody.addEventListener('click', (e) => {
        const row = e.target.closest('tr');
        if (row && row.dataset.materialId) {
            selectMaterial(row.dataset.materialId);
            calculate();
        }
    });

    // Setup references toggle
    const referencesHeader = document.getElementById('referencesHeader');
    if (referencesHeader) {
        referencesHeader.addEventListener('click', toggleReferences);
    }

    // Setup disclaimer toggle
    const disclaimerHeader = document.getElementById('disclaimerHeader');
    if (disclaimerHeader) {
        disclaimerHeader.addEventListener('click', toggleDisclaimer);
    }

    calculate();
}

function populateDropdown() {
    const groups = {};
    materialsDB.forEach(m => {
        if(!groups[m.cat]) groups[m.cat] = [];
        groups[m.cat].push(m);
    });

    let html = '<option value="custom">Custom CTE...</option>';
    const order = ['Metals', 'Plastics', 'Wood', 'Others'];

    order.forEach(cat => {
        if(groups[cat]) {
            html += `<optgroup label="${cat}">`;
            groups[cat].sort((a,b) => a.name.localeCompare(b.name));
            groups[cat].forEach(m => {
                const displayVal = getDisplayValue(m);
                const cteStr = formatCTE(m, false);
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
        const displayVal = getDisplayValue(m);
        const valC = formatCTE(m, false);
        // For imperial, convert the range endpoints
        const valFC = (m.val * 5 / 9).toFixed(3);
        const valFMax = m.max !== undefined ? (m.max * 5 / 9).toFixed(3) : valFC;
        const valF = (m.max !== undefined && m.max !== m.val) ? `${valFC}-${valFMax}` : valFC;
        return `
            <tr data-material-id="${m.id}">
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

/**
 * Select a material by ID in the dropdown
 * @param {string} materialId - The material ID to select
 * @returns {boolean} True if material was found, false if fell back to custom
 */
function selectMaterial(materialId) {
    let found = false;
    let material = null;

    // Search through materialsDB to find matching ID
    material = materialsDB.find(m => m.id === materialId);

    if (material) {
        // Set dropdown to this material
        elements.materialSelect.value = materialId;
        found = true;

        // Update CTE input field with the material's display value
        const displayVal = getDisplayValue(material);
        elements.cteInput.value = displayVal;

        elements.cteInput.readOnly = true;
        elements.cteInput.style.backgroundColor = 'var(--bg-secondary)';
        // Update range info display
        updateRangeInfo(material);
    } else {
        // Fall back to custom if not found
        elements.materialSelect.value = 'custom';
        elements.cteInput.readOnly = false;
        elements.cteInput.style.backgroundColor = 'var(--bg-card)';
        // Hide range info for custom
        hideRangeInfo();
    }

    return found;
}

// ============================================
// Range Info Display
// ============================================

/**
 * Update the CTE range info display based on selected material
 * @param {Object} material - The material object from materialsDB
 */
function updateRangeInfo(material) {
    const rangeInfo = document.getElementById('cteRangeInfo');
    if (!rangeInfo || !material) return;

    if (material.max !== undefined && material.max !== material.val) {
        // Calculate percent variation
        const avgVal = (material.val + material.max) / 2;
        const variation = ((material.max - material.val) / avgVal * 100).toFixed(0);

        rangeInfo.innerHTML = `Range: <strong>${material.val} - ${material.max}</strong> µm/m·°C (~${variation}% variation)`;
        rangeInfo.style.display = 'flex';
    } else {
        rangeInfo.style.display = 'none';
    }
}

/**
 * Hide the CTE range info display
 */
function hideRangeInfo() {
    const rangeInfo = document.getElementById('cteRangeInfo');
    if (rangeInfo) {
        rangeInfo.style.display = 'none';
    }
}

// ============================================
// Calculation
// ============================================

function calculate() {
    const alphaVal = parseFloat(elements.cteInput.value) || 0;
    const L0 = parseFloat(elements.lengthInput.value) || 0;
    const T1 = parseFloat(elements.tempInitial.value) || 0;
    const T2 = parseFloat(elements.tempFinal.value) || 0;
    const tempUnit = elements.tempUnit.value;

    // Validation: Length must be positive
    validateLengthInput(L0);

    // Validation: Kelvin temperatures must be > 0 (absolute zero)
    const tempError = validateTemperatureInputs(T1, T2, tempUnit);
    if (tempError) {
        // Temperature error - show error and return
        elements.resDeltaT.textContent = `—`;
        elements.resDeltaL.textContent = '—';
        elements.resDeltaLUnit.textContent = elements.lengthUnit.value;
        elements.resFinalL.textContent = `—`;
        elements.resPercent.textContent = '—';
        elements.vizExpansion.style.width = '0';
        elements.vizLabel.textContent = '';
        return;
    }

    // If length is invalid, show zeros and return
    if (L0 <= 0) {
        elements.resDeltaT.textContent = `—`;
        elements.resDeltaL.textContent = '—';
        elements.resDeltaLUnit.textContent = elements.lengthUnit.value;
        elements.resFinalL.textContent = `—`;
        elements.resPercent.textContent = '—';
        elements.vizExpansion.style.width = '0';
        elements.vizLabel.textContent = '';
        return;
    }

    let deltaT_User = T2 - T1;
    let deltaT_C = (tempUnit === 'F') ? deltaT_User / 1.8 : deltaT_User;

    const alphaRaw = alphaVal * 1e-6;
    const deltaL = alphaRaw * L0 * deltaT_C;
    const finalL = L0 + deltaL;

    let percentChange = 0;
    if (L0 !== 0) percentChange = (deltaL / L0) * 100;

    elements.resDeltaT.textContent = `${formatNumber(deltaT_User)} ${tempUnit === 'K' ? 'K' : '°' + tempUnit}`;

    const lUnit = elements.lengthUnit.value;
    const sign = deltaL > 0 ? '+' : '';

    elements.resDeltaL.textContent = sign + formatNumber(deltaL);
    elements.resDeltaLUnit.textContent = lUnit;
    elements.resFinalL.textContent = `${formatNumber(finalL)} ${lUnit}`;

    const pSign = percentChange > 0 ? '+' : '';
    let pText;
    // Use exponential only for extremely small values (< 0.0001%)
    // Otherwise use consistent 4 significant figures
    if (Math.abs(percentChange) < 0.0001 && percentChange !== 0) {
         pText = pSign + percentChange.toExponential(2) + '%';
    } else {
         pText = pSign + percentChange.toPrecision(4) + '%';
    }
    elements.resPercent.textContent = pText;

    updateViz(deltaL, L0);
}

function validateLengthInput(L0) {
    let errorElement = document.getElementById('lengthInputError');

    if (L0 <= 0) {
        // Show error state
        elements.lengthInput.style.borderColor = 'var(--accent-error)';

        // Create error message if it doesn't exist
        if (!errorElement) {
            errorElement = document.createElement('div');
            errorElement.id = 'lengthInputError';
            errorElement.style.cssText = 'color: var(--accent-error); font-size: 0.75rem; margin-top: 4px; font-family: JetBrains Mono, monospace;';
            elements.lengthInput.parentElement.appendChild(errorElement);
        }

        // Set appropriate error message
        if (L0 === 0) {
            errorElement.textContent = '⚠ Length must be greater than zero';
        } else {
            errorElement.textContent = '⚠ Length cannot be negative';
        }
    } else {
        // Clear error state
        elements.lengthInput.style.borderColor = '';
        if (errorElement) {
            errorElement.remove();
        }
    }
}

/**
 * Validate temperature inputs
 * @param {number} T1 - Initial temperature
 * @param {number} T2 - Final temperature
 * @param {string} unit - Temperature unit (C, F, K)
 * @returns {boolean} True if there's an error, false otherwise
 */
function validateTemperatureInputs(T1, T2, unit) {
    let hasError = false;

    // Clear previous temperature errors
    clearTemperatureErrors();

    // Kelvin validation: must be >= 0 (absolute zero is 0K)
    if (unit === 'K') {
        if (T1 < 0) {
            showTemperatureError('tempInitial', '⚠ Kelvin cannot be negative (below absolute zero)');
            hasError = true;
        }
        if (T2 < 0) {
            showTemperatureError('tempFinal', '⚠ Kelvin cannot be negative (below absolute zero)');
            hasError = true;
        }
    }

    return hasError;
}

/**
 * Show temperature error for a specific input
 * @param {string} inputId - The ID of the input element
 * @param {string} message - Error message to display
 */
function showTemperatureError(inputId, message) {
    const input = document.getElementById(inputId);
    if (!input) return;

    input.style.borderColor = 'var(--accent-error)';

    let errorElement = document.getElementById(inputId + 'Error');
    if (!errorElement) {
        errorElement = document.createElement('div');
        errorElement.id = inputId + 'Error';
        errorElement.style.cssText = 'color: var(--accent-error); font-size: 0.75rem; margin-top: 4px; font-family: JetBrains Mono, monospace;';
        input.parentElement.appendChild(errorElement);
    }
    errorElement.textContent = message;
}

/**
 * Clear all temperature-related error states
 */
function clearTemperatureErrors() {
    ['tempInitial', 'tempFinal'].forEach(id => {
        const input = document.getElementById(id);
        const errorElement = document.getElementById(id + 'Error');

        if (input) {
            input.style.borderColor = '';
        }
        if (errorElement) {
            errorElement.remove();
        }
    });
}

// ============================================
// Visualization
// ============================================

function updateViz(dL, L0) {
    if (L0 === 0) return;

    const pct = (dL / L0) * 100;
    const isExpansion = dL >= 0;
    const absPct = Math.abs(pct);

    // The base bar is 80% of the track width.
    // The expansion/contraction bar is a child of the base bar,
    // so its % is relative to the 80% base width, not the full track.
    // Therefore, actual track position = 80% + (absPct% of 80%) = 80% + absPct * 0.8

    if (isExpansion) {
        elements.vizExpansion.style.left = '100%';
        elements.vizExpansion.style.right = 'auto';
        elements.vizExpansion.style.width = absPct + '%';
        elements.vizExpansion.style.backgroundColor = 'var(--accent-engineering)';

        elements.vizLabel.textContent = `+ΔL ${formatNumber(dL)}`;
        elements.vizLabel.style.color = 'var(--accent-engineering)';
        // Position label at the end of the expansion bar (centered)
        elements.vizLabel.style.left = `calc(80% + ${absPct * 0.8}%)`;
        elements.vizLabel.style.transform = 'translateX(-50%)';
    } else {
        elements.vizExpansion.style.left = 'auto';
        elements.vizExpansion.style.right = '0';
        elements.vizExpansion.style.width = absPct + '%';
        elements.vizExpansion.style.backgroundColor = 'var(--accent-error)';

        elements.vizLabel.textContent = `-ΔL ${formatNumber(dL)}`;
        elements.vizLabel.style.color = 'var(--accent-error)';
        // Position label at the end of the contraction bar (to the left of base bar end)
        // For contraction, the bar extends left from the base bar's right edge
        elements.vizLabel.style.left = `calc(80% - ${absPct * 0.8}%)`;
        elements.vizLabel.style.transform = 'translateX(-50%)';
    }
}

// ============================================
// Utilities
// ============================================

function formatNumber(num) {
    if (num === 0) return "0";
    if (Math.abs(num) < 0.0001) return num.toExponential(3);
    if (Math.abs(num % 1) < 1e-5) return num.toFixed(0);
    return parseFloat(num.toFixed(4));
}

// ============================================
// References Toggle
// ============================================

function toggleReferences() {
    const content = document.getElementById('referencesContent');
    const chevron = document.getElementById('referencesChevron');

    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        chevron.classList.remove('collapsed');
    } else {
        content.classList.add('collapsed');
        chevron.classList.add('collapsed');
    }
}

function toggleDisclaimer() {
    const content = document.getElementById('disclaimerContent');
    const chevron = document.getElementById('disclaimerChevron');

    if (content.classList.contains('collapsed')) {
        content.classList.remove('collapsed');
        chevron.classList.remove('collapsed');
    } else {
        content.classList.add('collapsed');
        chevron.classList.add('collapsed');
    }
}

// Start
init();
