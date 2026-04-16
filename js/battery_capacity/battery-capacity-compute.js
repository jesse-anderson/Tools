// Battery Capacity Calculator - Physics/model computation

import { CHEMISTRY_PRESETS } from './battery-capacity-presets.js';
import {
    convertCapacityToAh,
    convertCurrentToAmps,
    convertOptionalCurrentToAmps,
    convertPowerToWatts,
    convertDurationToSeconds,
    formatCapacity,
    formatCurrent,
    formatDurationFromSeconds,
    formatEnergy,
    formatPercent,
    formatPower,
    formatVoltage
} from './battery-capacity-format.js';

export function validateInputs(inputs) {
    if (inputs.batteryModelMode === 'directPack') {
        if (!Number.isFinite(inputs.capacityValue) || inputs.capacityValue <= 0) {
            return { field: 'capacity', message: 'Pack capacity must be a positive number.' };
        }
        if (!Number.isFinite(inputs.batteryVoltage) || inputs.batteryVoltage <= 0) {
            return { field: 'batteryVoltage', message: 'Pack nominal voltage must be a positive number.' };
        }
    } else {
        if (!Number.isFinite(inputs.cellCapacityValue) || inputs.cellCapacityValue <= 0) {
            return { field: 'cellCapacity', message: 'Cell capacity must be a positive number.' };
        }
        if (!Number.isFinite(inputs.cellNominalVoltage) || inputs.cellNominalVoltage <= 0) {
            return { field: 'cellNominalVoltage', message: 'Cell nominal voltage must be a positive number.' };
        }
        if (!Number.isInteger(inputs.seriesCells) || inputs.seriesCells < 1) {
            return { field: 'seriesCells', message: 'Cells in series must be a whole number of at least 1.' };
        }
        if (!Number.isInteger(inputs.parallelCells) || inputs.parallelCells < 1) {
            return { field: 'parallelCells', message: 'Cells in parallel must be a whole number of at least 1.' };
        }
    }

    if (!Number.isFinite(inputs.usableFraction) || inputs.usableFraction <= 0 || inputs.usableFraction > 100) {
        return { field: 'usableFraction', message: 'Usable battery fraction must be between 0 and 100%.' };
    }

    if (inputs.loadVoltageRaw !== '' && (!Number.isFinite(inputs.loadVoltage) || inputs.loadVoltage <= 0)) {
        return { field: 'loadVoltage', message: 'Load/system voltage must be a positive number when provided.' };
    }

    if (inputs.regulatorType === 'fixed' && (!Number.isFinite(inputs.regulatorEfficiency) || inputs.regulatorEfficiency <= 0 || inputs.regulatorEfficiency > 100)) {
        return { field: 'regulatorEfficiency', message: 'Regulator efficiency must be between 0 and 100%.' };
    }

    if (inputs.regulatorType === 'fixed' && inputs.regulatorPeakEfficiency !== null && (!Number.isFinite(inputs.regulatorPeakEfficiency) || inputs.regulatorPeakEfficiency <= 0 || inputs.regulatorPeakEfficiency > 100)) {
        return { field: 'regulatorPeakEfficiency', message: 'Peak regulator efficiency must be between 0 and 100% when provided.' };
    }

    if (inputs.regulatorType !== 'direct' && (!Number.isFinite(inputs.regulatorQuiescent) || inputs.regulatorQuiescent < 0)) {
        return { field: 'regulatorQuiescent', message: 'Regulator quiescent current cannot be negative.' };
    }

    if (inputs.peakLoadCurrent !== null && (!Number.isFinite(inputs.peakLoadCurrent) || inputs.peakLoadCurrent <= 0)) {
        return { field: 'peakLoadCurrent', message: 'Peak load current must be positive when provided.' };
    }

    if (inputs.regulatorCurrentLimit !== null && (!Number.isFinite(inputs.regulatorCurrentLimit) || inputs.regulatorCurrentLimit <= 0)) {
        return { field: 'regulatorCurrentLimit', message: 'Regulator output current limit must be positive when provided.' };
    }

    if (inputs.batteryCurrentLimit !== null && (!Number.isFinite(inputs.batteryCurrentLimit) || inputs.batteryCurrentLimit <= 0)) {
        return { field: 'batteryCurrentLimit', message: 'Battery current limit must be positive when provided.' };
    }

    const packModel = resolvePackModel(inputs);
    const loadVoltage = inputs.loadVoltage ?? packModel.batteryVoltage;

    if (inputs.regulatorType === 'direct' && inputs.loadVoltage !== null && Math.abs(loadVoltage - packModel.batteryVoltage) > Math.max(0.05, packModel.batteryVoltage * 0.02)) {
        return { field: 'loadVoltage', message: 'Direct battery feed assumes the load voltage matches pack voltage. Leave it blank or match the pack voltage.' };
    }

    if (inputs.regulatorType === 'ldo' && loadVoltage > packModel.batteryVoltage) {
        return { field: 'loadVoltage', message: 'LDO output voltage cannot exceed battery voltage.' };
    }

    if (inputs.mode === 'constantCurrent' && (!Number.isFinite(inputs.constantCurrentValue) || inputs.constantCurrentValue <= 0)) {
        return { field: 'constantCurrent', message: 'Average load current must be a positive number.' };
    }

    if (inputs.mode === 'power' && (!Number.isFinite(inputs.averagePowerValue) || inputs.averagePowerValue <= 0)) {
        return { field: 'averagePower', message: 'Average load power must be a positive number.' };
    }

    if (inputs.mode === 'stateProfile') {
        if (inputs.profileRows.length === 0) {
            return { elementId: 'addStateBtn', message: 'Add at least one load state for the profile mode.' };
        }

        let totalDuration = 0;
        let anyPositiveCurrent = false;
        for (const row of inputs.profileRows) {
            if (!row.name) {
                return { element: row.nameInput, message: `State ${row.index + 1} needs a name.` };
            }
            if (!Number.isFinite(row.currentValue) || row.currentValue < 0) {
                return { element: row.currentInput, message: `State "${row.name}" current cannot be negative.` };
            }
            if (!Number.isFinite(row.durationValue) || row.durationValue <= 0) {
                return { element: row.durationInput, message: `State "${row.name}" duration must be positive.` };
            }

            totalDuration += convertDurationToSeconds(row.durationValue, row.durationUnit);
            anyPositiveCurrent = anyPositiveCurrent || row.currentValue > 0;
        }

        if (!anyPositiveCurrent) {
            return { element: inputs.profileRows[0].currentInput, message: 'At least one state must draw non-zero current.' };
        }

        if (totalDuration <= 0) {
            return { element: inputs.profileRows[0].durationInput, message: 'Total cycle duration must be positive.' };
        }
    }

    return null;
}

export function computeEstimate(inputs) {
    const packModel = resolvePackModel(inputs);
    const usableFractionRatio = inputs.usableFraction / 100;
    const loadVoltage = inputs.loadVoltage ?? packModel.batteryVoltage;
    const usableEnergyWh = packModel.capacityAh * packModel.batteryVoltage * usableFractionRatio;
    const usableCapacityAh = packModel.capacityAh * usableFractionRatio;
    const quiescentA = inputs.regulatorType === 'direct'
        ? 0
        : convertCurrentToAmps(inputs.regulatorQuiescent, inputs.regulatorQuiescentUnit);

    const loadModel = resolveLoadModel(inputs, loadVoltage);
    const regulatorEfficiencyRatio = inputs.regulatorEfficiency / 100;
    const peakEfficiencyRatio = inputs.regulatorPeakEfficiency !== null
        ? inputs.regulatorPeakEfficiency / 100
        : regulatorEfficiencyRatio;

    const regulatorModel = resolveRegulatorModel({
        regulatorType: inputs.regulatorType,
        regulatorEfficiency: regulatorEfficiencyRatio,
        peakEfficiency: peakEfficiencyRatio,
        peakEfficiencyProvided: inputs.regulatorPeakEfficiency !== null,
        quiescentA,
        avgLoadCurrentA: loadModel.avgLoadCurrentA,
        avgLoadPowerW: loadModel.avgLoadPowerW,
        peakLoadCurrentA: loadModel.peakLoadCurrentA,
        loadVoltage,
        batteryVoltage: packModel.batteryVoltage
    });

    const runtimeHours = regulatorModel.avgBatteryPowerW > 0 ? usableEnergyWh / regulatorModel.avgBatteryPowerW : Infinity;
    const feasibility = evaluateFeasibility({
        regulatorCurrentLimitA: convertOptionalCurrentToAmps(inputs.regulatorCurrentLimit, inputs.regulatorCurrentLimitUnit),
        batteryCurrentLimitA: convertOptionalCurrentToAmps(inputs.batteryCurrentLimit, inputs.batteryCurrentLimitUnit),
        peakLoadCurrentA: loadModel.peakLoadCurrentA,
        peakBatteryCurrentA: regulatorModel.peakBatteryCurrentA,
        explicitPeakProvided: inputs.peakLoadCurrent !== null,
        mode: inputs.mode
    });
    const contributions = buildContributionItems({
        loadContributions: loadModel.contributions,
        regulatorType: inputs.regulatorType,
        loadVoltage,
        batteryVoltage: packModel.batteryVoltage,
        regulatorEfficiency: regulatorEfficiencyRatio,
        quiescentA,
        avgBatteryPowerW: regulatorModel.avgBatteryPowerW
    });

    const chemistry = CHEMISTRY_PRESETS[inputs.chemistryPreset];
    return {
        runtimeHours,
        usableEnergyWh,
        usableCapacityAh,
        avgLoadCurrentA: loadModel.avgLoadCurrentA,
        avgLoadPowerW: loadModel.avgLoadPowerW,
        avgBatteryCurrentA: regulatorModel.avgBatteryCurrentA,
        peakBatteryCurrentA: regulatorModel.peakBatteryCurrentA,
        peakMeta: loadModel.peakMeta,
        feasibility,
        contributions,
        batteryModelSummary: packModel.modeLabel,
        batteryModelMeta: `${packModel.summary}. ${chemistry ? chemistry.label : 'Custom'} chemistry assumption with ${formatPercent(inputs.usableFraction)} usable fraction. ${regulatorModel.note}`,
        formulaSummary: `Usable energy = ${formatCapacity(packModel.capacityAh)} x ${formatVoltage(packModel.batteryVoltage)} x ${formatPercent(inputs.usableFraction)} = ${formatEnergy(usableEnergyWh)}. Runtime = usable energy / average battery-side power.`,
        assumptionSummary: `${loadModel.assumptionText} ${regulatorModel.assumptionText} This remains a nominal-voltage estimate and does not model detailed discharge curves, temperature, aging, or transient voltage sag.`,
        modeMeta: loadModel.modeMeta
    };
}

export function resolvePackModel(inputs) {
    if (inputs.batteryModelMode === 'cellPack') {
        const capacityAh = convertCapacityToAh(inputs.cellCapacityValue, inputs.cellCapacityUnit) * inputs.parallelCells;
        const batteryVoltage = inputs.cellNominalVoltage * inputs.seriesCells;
        return {
            capacityAh,
            batteryVoltage,
            modeLabel: `${inputs.seriesCells}s${inputs.parallelCells}p`,
            summary: `Derived from ${formatCapacity(convertCapacityToAh(inputs.cellCapacityValue, inputs.cellCapacityUnit))} cells at ${formatVoltage(inputs.cellNominalVoltage)} nominal per cell`
        };
    }

    return {
        capacityAh: convertCapacityToAh(inputs.capacityValue, inputs.capacityUnit),
        batteryVoltage: inputs.batteryVoltage,
        modeLabel: 'Direct pack',
        summary: `Direct pack entry at ${formatCapacity(convertCapacityToAh(inputs.capacityValue, inputs.capacityUnit))} and ${formatVoltage(inputs.batteryVoltage)} nominal`
    };
}

export function resolveLoadModel(inputs, loadVoltage) {
    const explicitPeakLoadCurrentA = convertOptionalCurrentToAmps(inputs.peakLoadCurrent, inputs.peakLoadCurrentUnit);

    if (inputs.mode === 'constantCurrent') {
        const avgLoadCurrentA = convertCurrentToAmps(inputs.constantCurrentValue, inputs.constantCurrentUnit);
        return {
            avgLoadCurrentA,
            avgLoadPowerW: avgLoadCurrentA * loadVoltage,
            peakLoadCurrentA: explicitPeakLoadCurrentA ?? avgLoadCurrentA,
            peakMeta: explicitPeakLoadCurrentA === null ? 'Peak load current not entered; average current was used as the peak estimate.' : `Peak load current entered as ${formatCurrent(explicitPeakLoadCurrentA)}.`,
            modeMeta: `Constant load estimate at ${formatCurrent(avgLoadCurrentA)} and ${formatVoltage(loadVoltage)}.`,
            assumptionText: 'Load behavior is treated as constant over time.',
            contributions: [
                {
                    label: 'Average load',
                    avgLoadCurrentA,
                    avgLoadPowerW: avgLoadCurrentA * loadVoltage
                }
            ]
        };
    }

    if (inputs.mode === 'power') {
        const avgLoadPowerW = convertPowerToWatts(inputs.averagePowerValue, inputs.averagePowerUnit);
        const avgLoadCurrentA = avgLoadPowerW / loadVoltage;
        return {
            avgLoadCurrentA,
            avgLoadPowerW,
            peakLoadCurrentA: explicitPeakLoadCurrentA ?? avgLoadCurrentA,
            peakMeta: explicitPeakLoadCurrentA === null ? 'Peak load current not entered; average current derived from power was used as the peak estimate.' : `Peak load current entered as ${formatCurrent(explicitPeakLoadCurrentA)}.`,
            modeMeta: `Power-based estimate using ${formatPower(avgLoadPowerW)} average load power at ${formatVoltage(loadVoltage)}.`,
            assumptionText: 'Load behavior is reduced to a single average power level.',
            contributions: [
                {
                    label: 'Average power load',
                    avgLoadCurrentA,
                    avgLoadPowerW
                }
            ]
        };
    }

    let weightedCurrentSeconds = 0;
    let cycleSeconds = 0;
    let peakCurrentA = 0;
    const stateContributions = [];
    inputs.profileRows.forEach((row) => {
        const currentA = convertCurrentToAmps(row.currentValue, row.currentUnit);
        const durationS = convertDurationToSeconds(row.durationValue, row.durationUnit);
        weightedCurrentSeconds += currentA * durationS;
        cycleSeconds += durationS;
        peakCurrentA = Math.max(peakCurrentA, currentA);
        stateContributions.push({
            label: row.name,
            weightedCurrentSeconds: currentA * durationS,
            durationS
        });
    });

    const avgLoadCurrentA = weightedCurrentSeconds / cycleSeconds;
    const resolvedPeakA = explicitPeakLoadCurrentA ?? peakCurrentA;
    const stateNames = inputs.profileRows.map((row) => row.name).join(', ');
    return {
        avgLoadCurrentA,
        avgLoadPowerW: avgLoadCurrentA * loadVoltage,
        peakLoadCurrentA: resolvedPeakA,
        peakMeta: explicitPeakLoadCurrentA === null ? `Peak load current derived from the highest entered state (${formatCurrent(peakCurrentA)}).` : `Peak load current entered as ${formatCurrent(explicitPeakLoadCurrentA)}.`,
        modeMeta: `${inputs.profileRows.length} states over a ${formatDurationFromSeconds(cycleSeconds)} cycle: ${stateNames}.`,
        assumptionText: 'Load behavior is averaged from the entered repeating state profile.',
        contributions: stateContributions.map((item) => ({
            label: item.label,
            avgLoadCurrentA: item.weightedCurrentSeconds / cycleSeconds,
            avgLoadPowerW: (item.weightedCurrentSeconds / cycleSeconds) * loadVoltage
        }))
    };
}

export function resolveRegulatorModel(params) {
    if (params.regulatorType === 'direct') {
        const avgBatteryCurrentA = params.avgLoadCurrentA + params.quiescentA;
        const peakBatteryCurrentA = params.peakLoadCurrentA + params.quiescentA;
        return {
            avgBatteryCurrentA,
            avgBatteryPowerW: avgBatteryCurrentA * params.batteryVoltage,
            peakBatteryCurrentA,
            note: 'Direct-feed model',
            assumptionText: 'No converter efficiency penalty was applied because the load is treated as battery-fed.'
        };
    }

    if (params.regulatorType === 'ldo') {
        const avgBatteryCurrentA = params.avgLoadCurrentA + params.quiescentA;
        const peakBatteryCurrentA = params.peakLoadCurrentA + params.quiescentA;
        return {
            avgBatteryCurrentA,
            avgBatteryPowerW: avgBatteryCurrentA * params.batteryVoltage,
            peakBatteryCurrentA,
            note: `LDO model with effective ${formatPercent((params.loadVoltage / params.batteryVoltage) * 100)} voltage ratio before quiescent loss`,
            assumptionText: 'LDO behavior was approximated as battery current about equal to load current plus quiescent current.'
        };
    }

    const avgBatteryPowerW = params.avgLoadPowerW / params.regulatorEfficiency;
    const peakBatteryPowerW = (params.peakLoadCurrentA * params.loadVoltage) / params.peakEfficiency;
    const peakNote = params.peakEfficiencyProvided
        ? `Fixed-efficiency converter model at ${formatPercent(params.regulatorEfficiency * 100)} average and ${formatPercent(params.peakEfficiency * 100)} at peak`
        : `Fixed-efficiency converter model at ${formatPercent(params.regulatorEfficiency * 100)}`;
    const peakAssumption = params.peakEfficiencyProvided
        ? 'Average battery current used the entered average efficiency; peak battery current used the entered peak efficiency.'
        : 'Converter loss was modeled with a fixed efficiency at both average and peak. Real converters often run lower efficiency during burst load; enter a separate peak efficiency if needed.';
    return {
        avgBatteryCurrentA: (avgBatteryPowerW / params.batteryVoltage) + params.quiescentA,
        avgBatteryPowerW: avgBatteryPowerW + (params.quiescentA * params.batteryVoltage),
        peakBatteryCurrentA: (peakBatteryPowerW / params.batteryVoltage) + params.quiescentA,
        note: peakNote,
        assumptionText: peakAssumption
    };
}

export function evaluateFeasibility(params) {
    const checks = [];

    if (params.regulatorCurrentLimitA !== null) {
        const exceeded = params.peakLoadCurrentA > params.regulatorCurrentLimitA;
        checks.push({
            exceeded,
            note: exceeded
                ? `Peak load current ${formatCurrent(params.peakLoadCurrentA)} exceeds regulator output limit ${formatCurrent(params.regulatorCurrentLimitA)}.`
                : `Peak load current ${formatCurrent(params.peakLoadCurrentA)} is within regulator output limit ${formatCurrent(params.regulatorCurrentLimitA)}.`
        });
    }

    if (params.batteryCurrentLimitA !== null) {
        const exceeded = params.peakBatteryCurrentA > params.batteryCurrentLimitA;
        checks.push({
            exceeded,
            note: exceeded
                ? `Peak battery current ${formatCurrent(params.peakBatteryCurrentA)} exceeds battery-side limit ${formatCurrent(params.batteryCurrentLimitA)}.`
                : `Peak battery current ${formatCurrent(params.peakBatteryCurrentA)} is within battery-side limit ${formatCurrent(params.batteryCurrentLimitA)}.`
        });
    }

    const notes = checks.map((c) => c.note);

    if (checks.length === 0) {
        notes.push('No current limits were entered.');
    }

    if (!params.explicitPeakProvided && params.mode !== 'stateProfile') {
        notes.push('Peak current was approximated from the average load because no explicit peak current was entered.');
    }

    let status;
    if (checks.length === 0) {
        status = 'Not evaluated';
    } else if (checks.some((c) => c.exceeded)) {
        status = 'Limit exceeded';
    } else {
        status = 'Within limits';
    }

    return {
        status,
        note: notes.join(' ')
    };
}

export function buildContributionItems(params) {
    const items = [];
    let totalLoadBatteryPowerW = 0;

    params.loadContributions.forEach((item) => {
        const batteryPowerW = params.regulatorType === 'fixed'
            ? item.avgLoadPowerW / params.regulatorEfficiency
            : item.avgLoadCurrentA * params.batteryVoltage;
        totalLoadBatteryPowerW += batteryPowerW;
        items.push({
            label: item.label,
            avgLoadCurrentA: item.avgLoadCurrentA,
            batteryPowerW,
            kind: 'load'
        });
    });

    if (params.regulatorType === 'fixed') {
        const totalDevicePowerW = params.loadContributions.reduce((sum, item) => sum + item.avgLoadPowerW, 0);
        const converterLossW = Math.max(0, totalLoadBatteryPowerW - totalDevicePowerW);
        if (converterLossW > 0) {
            items.push({
                label: 'Converter loss',
                avgLoadCurrentA: 0,
                batteryPowerW: converterLossW,
                kind: 'loss'
            });
        }
    }

    if (params.quiescentA > 0) {
        items.push({
            label: 'Regulator quiescent',
            avgLoadCurrentA: 0,
            batteryPowerW: params.quiescentA * params.batteryVoltage,
            kind: 'quiescent'
        });
    }

    return items
        .map((item) => ({
            ...item,
            sharePercent: params.avgBatteryPowerW > 0 ? (item.batteryPowerW / params.avgBatteryPowerW) * 100 : 0
        }))
        .sort((a, b) => b.batteryPowerW - a.batteryPowerW);
}

export function buildScenarioSnapshot(inputs, results) {
    return {
        mode: inputs.mode,
        runtimeHours: results.runtimeHours,
        avgBatteryCurrentA: results.avgBatteryCurrentA,
        peakBatteryCurrentA: results.peakBatteryCurrentA,
        label: describeScenario(inputs)
    };
}

export function describeScenario(inputs) {
    if (inputs.mode === 'stateProfile') {
        return `${inputs.profileRows.length}-state profile`;
    }
    if (inputs.mode === 'power') {
        return 'Power-based estimate';
    }
    return 'Constant-current estimate';
}
