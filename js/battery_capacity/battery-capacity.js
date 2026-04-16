// Battery Capacity Calculator - DOM orchestration

import {
    CHEMISTRY_PRESETS,
    DEFAULT_PROFILE_ROWS,
    DEFAULT_STATE,
    EMBEDDED_PRESETS,
    REGULATOR_NOTES,
    SAVED_SCENARIOS_STORAGE_KEY
} from './battery-capacity-presets.js';
import {
    convertCapacityToAh,
    convertCurrentToAmps,
    convertDurationToSeconds,
    debounce,
    escapeHtml,
    computePercentDelta,
    formatCapacity,
    formatCurrent,
    formatDurationFromSeconds,
    formatEnergy,
    formatPercent,
    formatPower,
    formatRuntime,
    formatSavedAtShort,
    formatVoltage,
    generateScenarioId,
    parseOptionalFloat,
    trimNumber
} from './battery-capacity-format.js';
import {
    buildScenarioSnapshot,
    computeEstimate,
    validateInputs
} from './battery-capacity-compute.js';

let baselineSnapshot = null;
let lastComputedScenario = null;
let savedScenarios = [];

document.addEventListener('DOMContentLoaded', () => {
    initBatteryCalculator();
});

function initBatteryCalculator() {
    const refs = getRefs();
    bindEvents(refs);
    applyDefaults(refs);
    refreshUi(refs);
    calculateBatteryLife(refs);
}

function getRefs() {
    return {
        batteryModelMode: document.getElementById('batteryModelMode'),
        chemistryPreset: document.getElementById('chemistryPreset'),
        chemistryNote: document.getElementById('chemistryNote'),
        capacity: document.getElementById('capacity'),
        capacityUnit: document.getElementById('capacityUnit'),
        batteryVoltage: document.getElementById('batteryVoltage'),
        cellCapacity: document.getElementById('cellCapacity'),
        cellCapacityUnit: document.getElementById('cellCapacityUnit'),
        cellNominalVoltage: document.getElementById('cellNominalVoltage'),
        seriesCells: document.getElementById('seriesCells'),
        parallelCells: document.getElementById('parallelCells'),
        derivedPackSummary: document.getElementById('derivedPackSummary'),
        usableFraction: document.getElementById('usableFraction'),
        loadVoltage: document.getElementById('loadVoltage'),
        regulatorType: document.getElementById('regulatorType'),
        regulatorEfficiency: document.getElementById('regulatorEfficiency'),
        regulatorPeakEfficiency: document.getElementById('regulatorPeakEfficiency'),
        regulatorQuiescent: document.getElementById('regulatorQuiescent'),
        regulatorQuiescentUnit: document.getElementById('regulatorQuiescentUnit'),
        peakLoadCurrent: document.getElementById('peakLoadCurrent'),
        peakLoadCurrentUnit: document.getElementById('peakLoadCurrentUnit'),
        regulatorCurrentLimit: document.getElementById('regulatorCurrentLimit'),
        regulatorCurrentLimitUnit: document.getElementById('regulatorCurrentLimitUnit'),
        batteryCurrentLimit: document.getElementById('batteryCurrentLimit'),
        batteryCurrentLimitUnit: document.getElementById('batteryCurrentLimitUnit'),
        regulatorNote: document.getElementById('regulatorNote'),
        modeSelect: document.getElementById('modeSelect'),
        constantCurrent: document.getElementById('constantCurrent'),
        constantCurrentUnit: document.getElementById('constantCurrentUnit'),
        averagePower: document.getElementById('averagePower'),
        averagePowerUnit: document.getElementById('averagePowerUnit'),
        embeddedPreset: document.getElementById('embeddedPreset'),
        applyPresetBtn: document.getElementById('applyPresetBtn'),
        presetNote: document.getElementById('presetNote'),
        scenarioName: document.getElementById('scenarioName'),
        savedScenarioSelect: document.getElementById('savedScenarioSelect'),
        saveScenarioBtn: document.getElementById('saveScenarioBtn'),
        loadScenarioBtn: document.getElementById('loadScenarioBtn'),
        useSavedBaselineBtn: document.getElementById('useSavedBaselineBtn'),
        deleteScenarioBtn: document.getElementById('deleteScenarioBtn'),
        scenarioStatus: document.getElementById('scenarioStatus'),
        addStateBtn: document.getElementById('addStateBtn'),
        profileRowsContainer: document.getElementById('profileRowsContainer'),
        profileHelper: document.getElementById('profileHelper'),
        profileRowTemplate: document.getElementById('profileRowTemplate'),
        calculateBtn: document.getElementById('calculateBtn'),
        setBaselineBtn: document.getElementById('setBaselineBtn'),
        clearBaselineBtn: document.getElementById('clearBaselineBtn'),
        resetBtn: document.getElementById('resetBtn'),
        runtimeResult: document.getElementById('runtimeResult'),
        runtimeMeta: document.getElementById('runtimeMeta'),
        usableEnergyResult: document.getElementById('usableEnergyResult'),
        usableEnergyMeta: document.getElementById('usableEnergyMeta'),
        avgLoadCurrentResult: document.getElementById('avgLoadCurrentResult'),
        avgLoadCurrentMeta: document.getElementById('avgLoadCurrentMeta'),
        avgLoadPowerResult: document.getElementById('avgLoadPowerResult'),
        avgLoadPowerMeta: document.getElementById('avgLoadPowerMeta'),
        batteryCurrentResult: document.getElementById('batteryCurrentResult'),
        batteryCurrentMeta: document.getElementById('batteryCurrentMeta'),
        peakBatteryCurrentResult: document.getElementById('peakBatteryCurrentResult'),
        peakBatteryCurrentMeta: document.getElementById('peakBatteryCurrentMeta'),
        feasibilityResult: document.getElementById('feasibilityResult'),
        feasibilityMeta: document.getElementById('feasibilityMeta'),
        batteryModelResult: document.getElementById('batteryModelResult'),
        batteryModelMeta: document.getElementById('batteryModelMeta'),
        compareResult: document.getElementById('compareResult'),
        compareMeta: document.getElementById('compareMeta'),
        contributionSummary: document.getElementById('contributionSummary'),
        contributionList: document.getElementById('contributionList'),
        formulaSummary: document.getElementById('formulaSummary'),
        assumptionSummary: document.getElementById('assumptionSummary'),
        resultContainer: document.getElementById('resultContainer'),
        batteryPanels: document.querySelectorAll('[data-battery-panel]'),
        modePanels: document.querySelectorAll('[data-mode-panel]')
    };
}

function bindEvents(refs) {
    const debouncedRefresh = debounce(() => {
        refreshUi(refs);
        calculateBatteryLife(refs);
    }, 75);

    const inputs = [
        refs.batteryModelMode, refs.chemistryPreset, refs.capacity, refs.capacityUnit, refs.batteryVoltage,
        refs.cellCapacity, refs.cellCapacityUnit, refs.cellNominalVoltage, refs.seriesCells, refs.parallelCells,
        refs.usableFraction, refs.loadVoltage, refs.regulatorType, refs.regulatorEfficiency,
        refs.regulatorPeakEfficiency, refs.regulatorQuiescent, refs.regulatorQuiescentUnit,
        refs.peakLoadCurrent, refs.peakLoadCurrentUnit, refs.regulatorCurrentLimit,
        refs.regulatorCurrentLimitUnit, refs.batteryCurrentLimit, refs.batteryCurrentLimitUnit,
        refs.modeSelect, refs.constantCurrent, refs.constantCurrentUnit,
        refs.averagePower, refs.averagePowerUnit, refs.embeddedPreset
    ];

    inputs.forEach((input) => {
        input.addEventListener('input', debouncedRefresh);
        input.addEventListener('change', debouncedRefresh);
    });

    refs.chemistryPreset.addEventListener('change', () => applyChemistryPreset(refs));
    refs.embeddedPreset.addEventListener('change', () => updatePresetNote(refs));
    refs.applyPresetBtn.addEventListener('click', () => {
        applyEmbeddedPreset(refs);
        refreshUi(refs);
        calculateBatteryLife(refs);
    });
    refs.savedScenarioSelect.addEventListener('change', () => updateScenarioControls(refs));
    refs.saveScenarioBtn.addEventListener('click', () => saveCurrentScenario(refs));
    refs.loadScenarioBtn.addEventListener('click', () => loadSelectedScenario(refs));
    refs.useSavedBaselineBtn.addEventListener('click', () => useSelectedScenarioAsBaseline(refs));
    refs.deleteScenarioBtn.addEventListener('click', () => deleteSelectedScenario(refs));
    refs.addStateBtn.addEventListener('click', () => {
        addProfileRow(refs, {
            name: `State ${refs.profileRowsContainer.children.length + 1}`,
            current: 10,
            currentUnit: 'mA',
            duration: 1,
            durationUnit: 's'
        });
        refreshUi(refs);
        calculateBatteryLife(refs);
    });

    refs.profileRowsContainer.addEventListener('input', debouncedRefresh);
    refs.profileRowsContainer.addEventListener('change', debouncedRefresh);
    refs.profileRowsContainer.addEventListener('click', (event) => {
        const button = event.target.closest('.remove-state-btn');
        if (!button) return;
        const row = button.closest('.profile-row');
        if (row) {
            row.remove();
            refreshUi(refs);
            calculateBatteryLife(refs);
        }
    });

    refs.calculateBtn.addEventListener('click', () => calculateBatteryLife(refs));
    refs.setBaselineBtn.addEventListener('click', () => setBaseline(refs));
    refs.clearBaselineBtn.addEventListener('click', () => clearBaseline(refs));
    refs.resetBtn.addEventListener('click', () => {
        applyDefaults(refs);
        refreshUi(refs);
        calculateBatteryLife(refs);
    });
}

function applyDefaults(refs) {
    Object.entries(DEFAULT_STATE).forEach(([key, value]) => {
        if (refs[key]) refs[key].value = value;
    });

    renderProfileRows(refs, DEFAULT_PROFILE_ROWS);
    loadSavedScenarios();
    refreshSavedScenarioList(refs);
    updateChemistryNote(refs);
    updateRegulatorNote(refs);
    updatePresetNote(refs);
    updateDerivedPackSummary(refs);
    updateProfileHelper(refs);
    updateCompareDisplay(refs);
    clearContributionDisplay(refs);
    setScenarioStatus(refs, 'Saved scenarios stay in local storage on this browser. Use a saved scenario as the baseline to compare a current design against a past case.');
}

function applyChemistryPreset(refs) {
    const preset = CHEMISTRY_PRESETS[refs.chemistryPreset.value];
    if (!preset || refs.chemistryPreset.value === 'custom') {
        updateChemistryNote(refs);
        return;
    }

    refs.usableFraction.value = preset.usableFraction;
    if (refs.batteryModelMode.value === 'cellPack') {
        refs.cellNominalVoltage.value = preset.cellVoltage;
    }
    updateChemistryNote(refs);
    updateDerivedPackSummary(refs);
}

function refreshUi(refs) {
    updateBatteryPanels(refs);
    updateModeVisibility(refs);
    updateChemistryNote(refs);
    updateRegulatorNote(refs);
    updateRegulatorControls(refs);
    updatePresetNote(refs);
    updateDerivedPackSummary(refs);
    updateProfileHelper(refs);
    updateCompareDisplay(refs);
}

function updateBatteryPanels(refs) {
    refs.batteryPanels.forEach((panel) => {
        panel.hidden = panel.dataset.batteryPanel !== refs.batteryModelMode.value;
    });
}

function updateModeVisibility(refs) {
    refs.modePanels.forEach((panel) => {
        panel.hidden = panel.dataset.modePanel !== refs.modeSelect.value;
    });
}

function updateChemistryNote(refs) {
    const preset = CHEMISTRY_PRESETS[refs.chemistryPreset.value];
    if (!preset) {
        refs.chemistryNote.textContent = '';
        return;
    }

    if (refs.chemistryPreset.value === 'custom') {
        refs.chemistryNote.textContent = preset.note;
    } else if (refs.batteryModelMode.value === 'cellPack') {
        refs.chemistryNote.textContent = `${preset.label}: nominal cell voltage ${formatVoltage(preset.cellVoltage)} and default usable fraction ${formatPercent(preset.usableFraction)}. ${preset.note}`;
    } else {
        refs.chemistryNote.textContent = `${preset.label}: default usable fraction ${formatPercent(preset.usableFraction)}. In direct-pack mode, pack voltage remains manual. ${preset.note}`;
    }
}

function updateRegulatorNote(refs) {
    refs.regulatorNote.textContent = REGULATOR_NOTES[refs.regulatorType.value] || '';
}

function updateRegulatorControls(refs) {
    const usesFixedEfficiency = refs.regulatorType.value === 'fixed';
    const usesQuiescent = refs.regulatorType.value !== 'direct';

    refs.regulatorEfficiency.disabled = !usesFixedEfficiency;
    refs.regulatorEfficiency.closest('.input-line')?.classList.toggle('is-disabled', !usesFixedEfficiency);

    refs.regulatorPeakEfficiency.disabled = !usesFixedEfficiency;
    refs.regulatorPeakEfficiency.closest('.input-line')?.classList.toggle('is-disabled', !usesFixedEfficiency);

    refs.regulatorQuiescent.disabled = !usesQuiescent;
    refs.regulatorQuiescentUnit.disabled = !usesQuiescent;
    refs.regulatorQuiescent.closest('.input-line')?.classList.toggle('is-disabled', !usesQuiescent);
}

function updateDerivedPackSummary(refs) {
    const cellCapacityValue = parseFloat(refs.cellCapacity.value);
    const cellVoltage = parseFloat(refs.cellNominalVoltage.value);
    const series = parseInt(refs.seriesCells.value, 10);
    const parallel = parseInt(refs.parallelCells.value, 10);

    if (!Number.isFinite(cellCapacityValue) || !Number.isFinite(cellVoltage) || !Number.isFinite(series) || !Number.isFinite(parallel) || cellCapacityValue <= 0 || cellVoltage <= 0 || series <= 0 || parallel <= 0) {
        refs.derivedPackSummary.textContent = 'Enter valid cell capacity, nominal voltage, and series/parallel counts to derive the pack model.';
        return;
    }

    const packCapacityAh = convertCapacityToAh(cellCapacityValue, refs.cellCapacityUnit.value) * parallel;
    const packVoltage = cellVoltage * series;
    const packEnergyWh = packCapacityAh * packVoltage;
    refs.derivedPackSummary.textContent = `${series}s${parallel}p pack, ${formatVoltage(packVoltage)} nominal, ${formatCapacity(packCapacityAh)} pack capacity, ${formatEnergy(packEnergyWh)} nominal energy.`;
}

function renderProfileRows(refs, rows) {
    refs.profileRowsContainer.innerHTML = '';
    rows.forEach((row) => addProfileRow(refs, row));
}

function addProfileRow(refs, row) {
    const fragment = refs.profileRowTemplate.content.cloneNode(true);
    fragment.querySelector('.profile-name-input').value = row.name;
    fragment.querySelector('.profile-current-input').value = row.current;
    fragment.querySelector('.profile-current-unit').value = row.currentUnit;
    fragment.querySelector('.profile-duration-input').value = row.duration;
    fragment.querySelector('.profile-duration-unit').value = row.durationUnit;
    refs.profileRowsContainer.appendChild(fragment);
}

function loadSavedScenarios() {
    try {
        const raw = localStorage.getItem(SAVED_SCENARIOS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        savedScenarios = Array.isArray(parsed)
            ? parsed.filter((item) => item && typeof item.id === 'string' && item.formState && item.snapshot)
            : [];
    } catch (error) {
        console.warn('Failed to load saved battery scenarios:', error);
        savedScenarios = [];
    }
}

function persistSavedScenarios() {
    try {
        localStorage.setItem(SAVED_SCENARIOS_STORAGE_KEY, JSON.stringify(savedScenarios));
        return { ok: true };
    } catch (error) {
        console.warn('Failed to persist saved scenarios:', error);
        const isQuota = error && (error.name === 'QuotaExceededError' || error.code === 22);
        return {
            ok: false,
            message: isQuota
                ? 'Could not save: browser storage is full. Delete older scenarios and try again.'
                : 'Could not save to local storage. The scenario is kept only in memory for this session.'
        };
    }
}

function refreshSavedScenarioList(refs, preferredId = null) {
    const selectedId = preferredId ?? refs.savedScenarioSelect.value;
    refs.savedScenarioSelect.innerHTML = '';

    if (savedScenarios.length === 0) {
        refs.savedScenarioSelect.innerHTML = '<option value="">No saved scenarios</option>';
        refs.savedScenarioSelect.value = '';
        updateScenarioControls(refs);
        return;
    }

    savedScenarios
        .slice()
        .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
        .forEach((scenario) => {
            const option = document.createElement('option');
            option.value = scenario.id;
            option.textContent = `${scenario.name} (${formatSavedAtShort(scenario.savedAt)})`;
            refs.savedScenarioSelect.appendChild(option);
        });

    const match = savedScenarios.some((scenario) => scenario.id === selectedId);
    refs.savedScenarioSelect.value = match ? selectedId : savedScenarios[0].id;
    updateScenarioControls(refs);
}

function updateScenarioControls(refs) {
    const hasSelection = Boolean(refs.savedScenarioSelect.value) && savedScenarios.length > 0;
    refs.loadScenarioBtn.disabled = !hasSelection;
    refs.useSavedBaselineBtn.disabled = !hasSelection;
    refs.deleteScenarioBtn.disabled = !hasSelection;
}

function setScenarioStatus(refs, message) {
    refs.scenarioStatus.textContent = message;
}

function captureFormState(refs) {
    return {
        batteryModelMode: refs.batteryModelMode.value,
        chemistryPreset: refs.chemistryPreset.value,
        capacity: refs.capacity.value,
        capacityUnit: refs.capacityUnit.value,
        batteryVoltage: refs.batteryVoltage.value,
        cellCapacity: refs.cellCapacity.value,
        cellCapacityUnit: refs.cellCapacityUnit.value,
        cellNominalVoltage: refs.cellNominalVoltage.value,
        seriesCells: refs.seriesCells.value,
        parallelCells: refs.parallelCells.value,
        usableFraction: refs.usableFraction.value,
        loadVoltage: refs.loadVoltage.value,
        regulatorType: refs.regulatorType.value,
        regulatorEfficiency: refs.regulatorEfficiency.value,
        regulatorPeakEfficiency: refs.regulatorPeakEfficiency.value,
        regulatorQuiescent: refs.regulatorQuiescent.value,
        regulatorQuiescentUnit: refs.regulatorQuiescentUnit.value,
        peakLoadCurrent: refs.peakLoadCurrent.value,
        peakLoadCurrentUnit: refs.peakLoadCurrentUnit.value,
        regulatorCurrentLimit: refs.regulatorCurrentLimit.value,
        regulatorCurrentLimitUnit: refs.regulatorCurrentLimitUnit.value,
        batteryCurrentLimit: refs.batteryCurrentLimit.value,
        batteryCurrentLimitUnit: refs.batteryCurrentLimitUnit.value,
        embeddedPreset: refs.embeddedPreset.value,
        modeSelect: refs.modeSelect.value,
        constantCurrent: refs.constantCurrent.value,
        constantCurrentUnit: refs.constantCurrentUnit.value,
        averagePower: refs.averagePower.value,
        averagePowerUnit: refs.averagePowerUnit.value,
        profileRows: Array.from(refs.profileRowsContainer.querySelectorAll('.profile-row')).map((row) => ({
            name: row.querySelector('.profile-name-input').value,
            current: row.querySelector('.profile-current-input').value,
            currentUnit: row.querySelector('.profile-current-unit').value,
            duration: row.querySelector('.profile-duration-input').value,
            durationUnit: row.querySelector('.profile-duration-unit').value
        }))
    };
}

function applyFormState(refs, formState) {
    const merged = { ...DEFAULT_STATE, ...formState };
    Object.entries(merged).forEach(([key, value]) => {
        if (key === 'profileRows') {
            const rows = Array.isArray(value) && value.length > 0
                ? value.map((row) => ({
                    name: row.name,
                    current: parseFloat(row.current),
                    currentUnit: row.currentUnit,
                    duration: parseFloat(row.duration),
                    durationUnit: row.durationUnit
                }))
                : DEFAULT_PROFILE_ROWS;
            renderProfileRows(refs, rows);
            return;
        }

        if (refs[key]) {
            refs[key].value = value;
        }
    });
}

function getSelectedScenario(refs) {
    return savedScenarios.find((scenario) => scenario.id === refs.savedScenarioSelect.value) || null;
}

function updatePresetNote(refs) {
    const preset = EMBEDDED_PRESETS[refs.embeddedPreset.value] || EMBEDDED_PRESETS.manual;
    refs.presetNote.textContent = preset.note;
}

function applyEmbeddedPreset(refs) {
    const preset = EMBEDDED_PRESETS[refs.embeddedPreset.value];
    if (!preset || !preset.config) {
        updatePresetNote(refs);
        return;
    }

    Object.entries(preset.config).forEach(([key, value]) => {
        if (key === 'profileRows') {
            renderProfileRows(refs, value);
            return;
        }

        if (refs[key]) {
            refs[key].value = value;
        }
    });
}

function saveCurrentScenario(refs) {
    const inputs = readInputs(refs);
    const validation = validateInputs(inputs);
    if (validation) {
        showError(refs, validation, validation.message);
        return;
    }

    clearErrors();
    const results = computeEstimate(inputs);
    lastComputedScenario = buildScenarioSnapshot(inputs, results);
    updateResultsDisplay(refs, results);

    const trimmedName = refs.scenarioName.value.trim();
    const scenario = {
        id: generateScenarioId(),
        name: trimmedName || generateScenarioName(inputs),
        savedAt: new Date().toISOString(),
        formState: captureFormState(refs),
        snapshot: buildScenarioSnapshot(inputs, results)
    };

    savedScenarios.push(scenario);
    const persistResult = persistSavedScenarios();
    if (!persistResult.ok) {
        savedScenarios = savedScenarios.filter((item) => item.id !== scenario.id);
        refreshSavedScenarioList(refs);
        setScenarioStatus(refs, persistResult.message);
        return;
    }

    refreshSavedScenarioList(refs, scenario.id);
    refs.scenarioName.value = scenario.name;
    setScenarioStatus(refs, `Saved "${scenario.name}" to local storage.`);
}

function loadSelectedScenario(refs) {
    const scenario = getSelectedScenario(refs);
    if (!scenario) {
        setScenarioStatus(refs, 'Choose a saved scenario to load.');
        return;
    }

    applyFormState(refs, scenario.formState);
    refs.scenarioName.value = scenario.name;
    refreshUi(refs);
    calculateBatteryLife(refs);
    setScenarioStatus(refs, `Loaded "${scenario.name}".`);
}

function useSelectedScenarioAsBaseline(refs) {
    const scenario = getSelectedScenario(refs);
    if (!scenario) {
        setScenarioStatus(refs, 'Choose a saved scenario to use as the baseline.');
        return;
    }

    baselineSnapshot = {
        ...scenario.snapshot,
        label: scenario.name
    };
    updateCompareDisplay(refs);
    setScenarioStatus(refs, `Using "${scenario.name}" as the compare baseline.`);
}

function deleteSelectedScenario(refs) {
    const scenario = getSelectedScenario(refs);
    if (!scenario) {
        setScenarioStatus(refs, 'Choose a saved scenario to delete.');
        return;
    }

    const previous = savedScenarios.slice();
    savedScenarios = savedScenarios.filter((item) => item.id !== scenario.id);
    const persistResult = persistSavedScenarios();
    if (!persistResult.ok) {
        savedScenarios = previous;
        setScenarioStatus(refs, persistResult.message);
        return;
    }
    refreshSavedScenarioList(refs);
    setScenarioStatus(refs, `Deleted "${scenario.name}" from local storage.`);
}

function setBaseline(refs) {
    const inputs = readInputs(refs);
    const validation = validateInputs(inputs);
    if (validation) {
        showError(refs, validation, validation.message);
        return;
    }

    clearErrors();
    const results = computeEstimate(inputs);
    baselineSnapshot = buildScenarioSnapshot(inputs, results);
    lastComputedScenario = null;
    updateResultsDisplay(refs, results);
    setScenarioStatus(refs, 'Captured the current design as the active baseline.');
}

function clearBaseline(refs) {
    baselineSnapshot = null;
    updateCompareDisplay(refs);
    setScenarioStatus(refs, 'Cleared the active compare baseline.');
}

function calculateBatteryLife(refs) {
    try {
        const inputs = readInputs(refs);
        const validation = validateInputs(inputs);
        if (validation) {
            lastComputedScenario = null;
            showError(refs, validation, validation.message);
            return;
        }

        clearErrors();
        const results = computeEstimate(inputs);
        lastComputedScenario = buildScenarioSnapshot(inputs, results);
        updateResultsDisplay(refs, results);
    } catch (error) {
        console.error('Error calculating battery life:', error);
        lastComputedScenario = null;
        showError(refs, {}, 'An unexpected calculation error occurred.');
    }
}

function readInputs(refs) {
    return {
        batteryModelMode: refs.batteryModelMode.value,
        chemistryPreset: refs.chemistryPreset.value,
        capacityValue: parseFloat(refs.capacity.value),
        capacityUnit: refs.capacityUnit.value,
        batteryVoltage: parseFloat(refs.batteryVoltage.value),
        cellCapacityValue: parseFloat(refs.cellCapacity.value),
        cellCapacityUnit: refs.cellCapacityUnit.value,
        cellNominalVoltage: parseFloat(refs.cellNominalVoltage.value),
        seriesCells: parseInt(refs.seriesCells.value, 10),
        parallelCells: parseInt(refs.parallelCells.value, 10),
        usableFraction: parseFloat(refs.usableFraction.value),
        loadVoltageRaw: refs.loadVoltage.value.trim(),
        loadVoltage: parseOptionalFloat(refs.loadVoltage.value),
        regulatorType: refs.regulatorType.value,
        regulatorEfficiency: parseFloat(refs.regulatorEfficiency.value),
        regulatorPeakEfficiency: parseOptionalFloat(refs.regulatorPeakEfficiency.value),
        regulatorQuiescent: parseFloat(refs.regulatorQuiescent.value),
        regulatorQuiescentUnit: refs.regulatorQuiescentUnit.value,
        peakLoadCurrent: parseOptionalFloat(refs.peakLoadCurrent.value),
        peakLoadCurrentUnit: refs.peakLoadCurrentUnit.value,
        regulatorCurrentLimit: parseOptionalFloat(refs.regulatorCurrentLimit.value),
        regulatorCurrentLimitUnit: refs.regulatorCurrentLimitUnit.value,
        batteryCurrentLimit: parseOptionalFloat(refs.batteryCurrentLimit.value),
        batteryCurrentLimitUnit: refs.batteryCurrentLimitUnit.value,
        mode: refs.modeSelect.value,
        constantCurrentValue: parseFloat(refs.constantCurrent.value),
        constantCurrentUnit: refs.constantCurrentUnit.value,
        averagePowerValue: parseFloat(refs.averagePower.value),
        averagePowerUnit: refs.averagePowerUnit.value,
        profileRows: Array.from(refs.profileRowsContainer.querySelectorAll('.profile-row')).map((row, index) => ({
            index,
            name: row.querySelector('.profile-name-input').value.trim(),
            currentValue: parseFloat(row.querySelector('.profile-current-input').value),
            currentUnit: row.querySelector('.profile-current-unit').value,
            durationValue: parseFloat(row.querySelector('.profile-duration-input').value),
            durationUnit: row.querySelector('.profile-duration-unit').value,
            nameInput: row.querySelector('.profile-name-input'),
            currentInput: row.querySelector('.profile-current-input'),
            durationInput: row.querySelector('.profile-duration-input')
        }))
    };
}

function updateResultsDisplay(refs, results) {
    refs.runtimeResult.textContent = formatRuntime(results.runtimeHours);
    refs.runtimeMeta.textContent = `${trimNumber(results.runtimeHours, 2)} hr estimated runtime.`;

    refs.usableEnergyResult.textContent = formatEnergy(results.usableEnergyWh);
    refs.usableEnergyMeta.textContent = `${formatCapacity(results.usableCapacityAh)} usable equivalent capacity after reserve.`;

    refs.avgLoadCurrentResult.textContent = formatCurrent(results.avgLoadCurrentA);
    refs.avgLoadCurrentMeta.textContent = results.modeMeta;

    refs.avgLoadPowerResult.textContent = formatPower(results.avgLoadPowerW);
    refs.avgLoadPowerMeta.textContent = 'Average device-side power used for runtime conversion.';

    refs.batteryCurrentResult.textContent = formatCurrent(results.avgBatteryCurrentA);
    refs.batteryCurrentMeta.textContent = 'Average battery-side current including regulator behavior and quiescent draw.';

    refs.peakBatteryCurrentResult.textContent = formatCurrent(results.peakBatteryCurrentA);
    refs.peakBatteryCurrentMeta.textContent = results.peakMeta;

    refs.feasibilityResult.textContent = results.feasibility.status;
    refs.feasibilityMeta.textContent = results.feasibility.note;

    refs.batteryModelResult.textContent = results.batteryModelSummary;
    refs.batteryModelMeta.textContent = results.batteryModelMeta;

    refs.formulaSummary.textContent = results.formulaSummary;
    refs.assumptionSummary.textContent = results.assumptionSummary;
    updateCompareDisplay(refs);
    updateContributionDisplay(refs, results.contributions);
}

function showError(refs, target, message) {
    clearErrors();
    clearResultsDisplay(refs);

    let element = null;
    if (target.element instanceof HTMLElement) {
        element = target.element;
    } else if (target.elementId) {
        element = document.getElementById(target.elementId);
    } else if (target.field && refs[target.field]) {
        element = refs[target.field];
    }
    if (element instanceof HTMLElement) {
        element.classList.add('error-input');
    }

    const errorDiv = document.createElement('div');
    errorDiv.id = 'calculation-error';
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    refs.resultContainer.insertBefore(errorDiv, refs.resultContainer.firstChild);
}

function clearResultsDisplay(refs) {
    refs.runtimeResult.textContent = '--';
    refs.runtimeMeta.textContent = 'Runtime appears here after calculation.';
    refs.usableEnergyResult.textContent = '--';
    refs.usableEnergyMeta.textContent = 'Derived from pack voltage, capacity, and usable fraction.';
    refs.avgLoadCurrentResult.textContent = '--';
    refs.avgLoadCurrentMeta.textContent = 'Device-side average current at the load voltage.';
    refs.avgLoadPowerResult.textContent = '--';
    refs.avgLoadPowerMeta.textContent = 'Average device-side power used for runtime conversion.';
    refs.batteryCurrentResult.textContent = '--';
    refs.batteryCurrentMeta.textContent = 'Equivalent battery current after conversion losses and quiescent draw.';
    refs.peakBatteryCurrentResult.textContent = '--';
    refs.peakBatteryCurrentMeta.textContent = 'Peak battery-side current used for feasibility checks.';
    refs.feasibilityResult.textContent = '--';
    refs.feasibilityMeta.textContent = 'Burst-current warnings and entered limits appear here.';
    refs.batteryModelResult.textContent = '--';
    refs.batteryModelMeta.textContent = 'Pack model and regulator assumptions appear here.';
    refs.compareResult.textContent = baselineSnapshot ? 'Baseline saved' : 'No baseline';
    refs.compareMeta.textContent = baselineSnapshot
        ? 'Current estimate is invalid, so comparison is temporarily unavailable.'
        : 'Capture a baseline, then change the design to compare runtime and peak-current impact.';
    refs.formulaSummary.textContent = 'Usable battery energy = pack capacity x nominal voltage x usable fraction. Runtime = usable battery energy / battery-side average power.';
    refs.assumptionSummary.textContent = 'This estimate assumes nominal voltage and average load behavior. It does not model detailed discharge curves, transient voltage sag, temperature effects, or aging.';
    clearContributionDisplay(refs);
}

function clearErrors() {
    document.querySelectorAll('.error-input').forEach((element) => {
        element.classList.remove('error-input');
    });

    const existingError = document.getElementById('calculation-error');
    if (existingError) {
        existingError.remove();
    }
}

function updateProfileHelper(refs) {
    const rows = Array.from(refs.profileRowsContainer.querySelectorAll('.profile-row'));
    if (rows.length === 0) {
        refs.profileHelper.textContent = 'Use one row per repeated state in a cycle. Add at least one state to derive a profile average.';
        return;
    }

    let totalSeconds = 0;
    let peakCurrentA = 0;
    rows.forEach((row) => {
        const current = parseFloat(row.querySelector('.profile-current-input').value);
        const currentUnit = row.querySelector('.profile-current-unit').value;
        const duration = parseFloat(row.querySelector('.profile-duration-input').value);
        const durationUnit = row.querySelector('.profile-duration-unit').value;

        if (Number.isFinite(current) && current >= 0) {
            peakCurrentA = Math.max(peakCurrentA, convertCurrentToAmps(current, currentUnit));
        }
        if (Number.isFinite(duration) && duration > 0) {
            totalSeconds += convertDurationToSeconds(duration, durationUnit);
        }
    });

    refs.profileHelper.textContent = `${rows.length} states entered. Current cycle length: ${formatDurationFromSeconds(totalSeconds || 0)}. Highest listed state current: ${formatCurrent(peakCurrentA)}.`;
}

function updateCompareDisplay(refs) {
    refs.clearBaselineBtn.disabled = baselineSnapshot === null;

    if (!baselineSnapshot) {
        refs.compareResult.textContent = 'No baseline';
        refs.compareMeta.textContent = 'Capture a baseline, then change the design to compare runtime and peak-current impact.';
        return;
    }

    if (!lastComputedScenario) {
        refs.compareResult.textContent = 'Baseline saved';
        refs.compareMeta.textContent = `Baseline: ${baselineSnapshot.label}, ${formatRuntime(baselineSnapshot.runtimeHours)}, peak ${formatCurrent(baselineSnapshot.peakBatteryCurrentA)}.`;
        return;
    }

    const runtimeDeltaPct = computePercentDelta(lastComputedScenario.runtimeHours, baselineSnapshot.runtimeHours);
    const peakDeltaPct = computePercentDelta(lastComputedScenario.peakBatteryCurrentA, baselineSnapshot.peakBatteryCurrentA);
    const direction = runtimeDeltaPct >= 0 ? '+' : '';
    const peakDirection = peakDeltaPct >= 0 ? '+' : '';

    refs.compareResult.textContent = `${formatRuntime(baselineSnapshot.runtimeHours)} -> ${formatRuntime(lastComputedScenario.runtimeHours)}`;
    refs.compareMeta.textContent = `Runtime ${direction}${trimNumber(runtimeDeltaPct, 1)}% vs baseline. Peak battery current ${peakDirection}${trimNumber(peakDeltaPct, 1)}%. Baseline: ${baselineSnapshot.label}.`;
}

function updateContributionDisplay(refs, contributions) {
    if (!contributions || contributions.length === 0) {
        clearContributionDisplay(refs);
        return;
    }

    const largest = contributions[0];
    refs.contributionSummary.textContent = `Largest battery-side runtime driver: ${largest.label} at ${trimNumber(largest.sharePercent, 1)}% of average battery power.`;
    refs.contributionList.innerHTML = contributions.map((item) => {
        const detail = item.kind === 'load' && item.avgLoadCurrentA > 0
            ? formatCurrent(item.avgLoadCurrentA)
            : formatPower(item.batteryPowerW);
        return `
        <div class="contribution-row">
            <span class="contribution-name">${escapeHtml(item.label)}</span>
            <span class="contribution-share">${trimNumber(item.sharePercent, 1)}%</span>
            <span class="contribution-value">${detail}</span>
        </div>
    `;
    }).join('');
}

function clearContributionDisplay(refs) {
    refs.contributionSummary.textContent = 'Contribution breakdown appears here after calculation.';
    refs.contributionList.innerHTML = '';
}

function generateScenarioName(inputs) {
    const modeLabel = inputs.mode === 'stateProfile'
        ? `${inputs.profileRows.length}state`
        : inputs.mode === 'power'
            ? 'power'
            : 'current';
    return `Scenario ${modeLabel} ${formatSavedAtShort(new Date().toISOString())}`;
}
