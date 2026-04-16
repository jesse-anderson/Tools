// Battery Capacity Calculator - Presets and default state

export const SAVED_SCENARIOS_STORAGE_KEY = 'batteryCapacitySavedScenarios';

export const DEFAULT_PROFILE_ROWS = [
    { name: 'Wake + radio', current: 180, currentUnit: 'mA', duration: 2, durationUnit: 's' },
    { name: 'Deep sleep', current: 180, currentUnit: 'uA', duration: 58, durationUnit: 's' }
];

export const DEFAULT_STATE = {
    batteryModelMode: 'directPack',
    chemistryPreset: 'liIon',
    capacity: 2000,
    capacityUnit: 'mAh',
    batteryVoltage: 3.7,
    cellCapacity: 2000,
    cellCapacityUnit: 'mAh',
    cellNominalVoltage: 3.7,
    seriesCells: 1,
    parallelCells: 1,
    usableFraction: 90,
    loadVoltage: '',
    regulatorType: 'fixed',
    regulatorEfficiency: 90,
    regulatorPeakEfficiency: '',
    regulatorQuiescent: 0,
    regulatorQuiescentUnit: 'uA',
    peakLoadCurrent: '',
    peakLoadCurrentUnit: 'mA',
    regulatorCurrentLimit: '',
    regulatorCurrentLimitUnit: 'mA',
    batteryCurrentLimit: '',
    batteryCurrentLimitUnit: 'mA',
    embeddedPreset: 'manual',
    modeSelect: 'constantCurrent',
    constantCurrent: 100,
    constantCurrentUnit: 'mA',
    averagePower: 330,
    averagePowerUnit: 'mW'
};

export const CHEMISTRY_PRESETS = {
    custom: {
        label: 'Custom / manual',
        cellVoltage: null,
        usableFraction: null,
        note: 'Custom mode leaves pack voltage and usable fraction under manual control.'
    },
    liIon: {
        label: 'Li-ion / LiPo',
        cellVoltage: 3.7,
        usableFraction: 90,
        note: 'Typical nominal cell voltage is about 3.6-3.7 V. Keep reserve above real cutoff and burst sag limits.'
    },
    lifepo4: {
        label: 'LiFePO4',
        cellVoltage: 3.2,
        usableFraction: 92,
        note: 'LiFePO4 has a flatter discharge curve and lower nominal voltage than standard Li-ion.'
    },
    nimh: {
        label: 'NiMH',
        cellVoltage: 1.2,
        usableFraction: 85,
        note: 'NiMH packs often tolerate deep use, but voltage sag and temperature can still reduce practical runtime.'
    },
    alkaline: {
        label: 'Alkaline',
        cellVoltage: 1.5,
        usableFraction: 75,
        note: 'Alkaline runtime is highly load-dependent. Heavy pulses can collapse usable energy well before full nominal capacity.'
    },
    leadAcid: {
        label: 'Lead-acid',
        cellVoltage: 2.0,
        usableFraction: 60,
        note: 'Lead-acid usable energy depends strongly on discharge rate, temperature, and allowed depth of discharge.'
    }
};

export const REGULATOR_NOTES = {
    direct: 'Direct battery feed assumes no converter stage. Efficiency and regulator quiescent current are ignored in this mode.',
    fixed: 'Fixed regulator mode uses the entered efficiency and quiescent current to convert load power into battery-side current.',
    ldo: 'LDO mode treats battery current as approximately load current plus quiescent current. Load voltage should not exceed battery voltage.'
};

export const EMBEDDED_PRESETS = {
    manual: {
        label: 'Manual / no preset',
        note: 'Preset mode seeds a realistic starting point for embedded workloads without locking the fields.'
    },
    esp32Wifi: {
        label: 'ESP32 Wi-Fi burst node',
        note: 'Uses a repeating wake, sample, transmit, and deep-sleep pattern with conservative Li-ion and converter assumptions.',
        config: {
            chemistryPreset: 'liIon',
            loadVoltage: '3.3',
            regulatorType: 'fixed',
            regulatorEfficiency: 90,
            regulatorQuiescent: 25,
            regulatorQuiescentUnit: 'uA',
            peakLoadCurrent: 320,
            peakLoadCurrentUnit: 'mA',
            modeSelect: 'stateProfile',
            profileRows: [
                { name: 'Wake + sample', current: 55, currentUnit: 'mA', duration: 1.5, durationUnit: 's' },
                { name: 'Wi-Fi transmit', current: 240, currentUnit: 'mA', duration: 1.8, durationUnit: 's' },
                { name: 'Modem idle', current: 18, currentUnit: 'mA', duration: 2.7, durationUnit: 's' },
                { name: 'Deep sleep', current: 180, currentUnit: 'uA', duration: 54, durationUnit: 's' }
            ]
        }
    },
    esp32Ble: {
        label: 'ESP32 BLE beacon',
        note: 'Seeds a lighter-duty BLE advertising workload with low sleep current and moderate burst behavior.',
        config: {
            chemistryPreset: 'liIon',
            loadVoltage: '3.3',
            regulatorType: 'fixed',
            regulatorEfficiency: 92,
            regulatorQuiescent: 20,
            regulatorQuiescentUnit: 'uA',
            peakLoadCurrent: 140,
            peakLoadCurrentUnit: 'mA',
            modeSelect: 'stateProfile',
            profileRows: [
                { name: 'Wake + advertise', current: 42, currentUnit: 'mA', duration: 0.25, durationUnit: 's' },
                { name: 'Idle settle', current: 8, currentUnit: 'mA', duration: 0.75, durationUnit: 's' },
                { name: 'Deep sleep', current: 35, currentUnit: 'uA', duration: 59, durationUnit: 's' }
            ]
        }
    },
    loraSensor: {
        label: 'LoRa sensor node',
        note: 'Seeds a long-sleep telemetry workload where radio bursts dominate peak current but not average current.',
        config: {
            chemistryPreset: 'liIon',
            loadVoltage: '3.3',
            regulatorType: 'fixed',
            regulatorEfficiency: 92,
            regulatorQuiescent: 15,
            regulatorQuiescentUnit: 'uA',
            peakLoadCurrent: 140,
            peakLoadCurrentUnit: 'mA',
            modeSelect: 'stateProfile',
            profileRows: [
                { name: 'Sensor sample', current: 12, currentUnit: 'mA', duration: 1.2, durationUnit: 's' },
                { name: 'LoRa transmit', current: 118, currentUnit: 'mA', duration: 1.8, durationUnit: 's' },
                { name: 'Sleep', current: 15, currentUnit: 'uA', duration: 297, durationUnit: 's' }
            ]
        }
    },
    alwaysOnMcu: {
        label: 'Always-on MCU + sensor',
        note: 'Seeds a simple always-on embedded load where average current is already close to the steady-state draw.',
        config: {
            chemistryPreset: 'liIon',
            loadVoltage: '3.3',
            regulatorType: 'fixed',
            regulatorEfficiency: 90,
            regulatorQuiescent: 25,
            regulatorQuiescentUnit: 'uA',
            peakLoadCurrent: '',
            peakLoadCurrentUnit: 'mA',
            modeSelect: 'constantCurrent',
            constantCurrent: 22,
            constantCurrentUnit: 'mA'
        }
    }
};
