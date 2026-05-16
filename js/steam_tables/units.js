const FACTORS = {
    // NIST: 1 MPa = 145.03773773020923 psi.
    MPA_TO_PSIA: 145.03773773020923,
    // Exact pressure relation: 1 MPa = 10 bar.
    MPA_TO_BAR: 10,
    // Exact pressure relation: 1 atm = 0.101325 MPa.
    MPA_PER_ATM: 0.101325,
    // Exact: 1 m^3/kg = 16.01846337396014 ft^3/lbm.
    M3_PER_KG_TO_FT3_PER_LBM: 16.01846337396014,
    // ISO IT calorie basis via Btu_IT: 1 kJ/kg = 0.4299226139294927 Btu/lbm.
    KJ_PER_KG_TO_BTU_PER_LBM: 0.4299226139294927,
    // Same energy/mass factor with Rankine temperature interval.
    KJ_PER_KG_K_TO_BTU_PER_LBM_R: 0.23884589662749594,
    // Exact enough for engineering display: 1 kg/m^3 = 0.0624279605761 lbm/ft^3.
    KG_PER_M3_TO_LBM_PER_FT3: 0.0624279605761
};

const PRESSURE_UNITS = {
    kPa: {
        label: 'kPa',
        fromMPa: (value) => value * 1000,
        toMPa: (value) => value / 1000
    },
    MPa: {
        label: 'MPa',
        fromMPa: (value) => value,
        toMPa: (value) => value
    },
    bar: {
        label: 'bar',
        fromMPa: (value) => value * FACTORS.MPA_TO_BAR,
        toMPa: (value) => value / FACTORS.MPA_TO_BAR
    },
    atm: {
        label: 'atm',
        fromMPa: (value) => value / FACTORS.MPA_PER_ATM,
        toMPa: (value) => value * FACTORS.MPA_PER_ATM
    },
    psia: {
        label: 'psia',
        fromMPa: (value) => value * FACTORS.MPA_TO_PSIA,
        toMPa: (value) => value / FACTORS.MPA_TO_PSIA
    }
};

export const PRESSURE_UNIT_OPTIONS = {
    si: [
        { value: 'kPa', label: 'kPa' },
        { value: 'MPa', label: 'MPa' },
        { value: 'bar', label: 'bar' },
        { value: 'atm', label: 'atm' }
    ],
    us: [
        { value: 'psia', label: 'psia' },
        { value: 'atm', label: 'atm' }
    ]
};

export function normalizeUnitSettings(units) {
    if (typeof units === 'string') {
        return {
            system: units === 'us' ? 'us' : 'si',
            pressure: units === 'us' ? 'psia' : 'kPa'
        };
    }

    const system = units?.system === 'us' ? 'us' : 'si';
    const fallbackPressure = system === 'us' ? 'psia' : 'kPa';
    let pressure = units?.pressure || fallbackPressure;
    const allowedPressureUnits = PRESSURE_UNIT_OPTIONS[system] || PRESSURE_UNIT_OPTIONS.si;

    if (!allowedPressureUnits.some((option) => option.value === pressure)) {
        pressure = fallbackPressure;
    }

    return { system, pressure };
}

export function temperatureToC(value, units) {
    return normalizeUnitSettings(units).system === 'us' ? (value - 32) * 5 / 9 : value;
}

export function temperatureFromC(value, units) {
    return normalizeUnitSettings(units).system === 'us' ? value * 9 / 5 + 32 : value;
}

export function pressureToMPa(value, units) {
    const settings = normalizeUnitSettings(units);
    return PRESSURE_UNITS[settings.pressure].toMPa(value);
}

export function pressureFromMPa(value, units) {
    const settings = normalizeUnitSettings(units);
    return PRESSURE_UNITS[settings.pressure].fromMPa(value);
}

export function propertyToSI(kind, value, units) {
    if (kind === 'T') {
        return temperatureToC(value, units);
    }
    if (kind === 'P') {
        return pressureToMPa(value, units);
    }
    if (normalizeUnitSettings(units).system !== 'us') {
        return value;
    }

    switch (kind) {
        case 'v':
            return value / FACTORS.M3_PER_KG_TO_FT3_PER_LBM;
        case 'rho':
            return value / FACTORS.KG_PER_M3_TO_LBM_PER_FT3;
        case 'h':
        case 'u':
            return value / FACTORS.KJ_PER_KG_TO_BTU_PER_LBM;
        case 's':
            return value / FACTORS.KJ_PER_KG_K_TO_BTU_PER_LBM_R;
        default:
            return value;
    }
}

export function propertyFromSI(kind, value, units) {
    if (kind === 'T') {
        return temperatureFromC(value, units);
    }
    if (kind === 'P') {
        return pressureFromMPa(value, units);
    }
    if (normalizeUnitSettings(units).system !== 'us') {
        return value;
    }

    switch (kind) {
        case 'v':
            return value * FACTORS.M3_PER_KG_TO_FT3_PER_LBM;
        case 'rho':
            return value * FACTORS.KG_PER_M3_TO_LBM_PER_FT3;
        case 'h':
        case 'u':
            return value * FACTORS.KJ_PER_KG_TO_BTU_PER_LBM;
        case 's':
            return value * FACTORS.KJ_PER_KG_K_TO_BTU_PER_LBM_R;
        default:
            return value;
    }
}

export function propertyDeltaFromSI(kind, value, units) {
    if (kind === 'T') {
        return normalizeUnitSettings(units).system === 'us' ? value * 9 / 5 : value;
    }
    if (kind === 'P') {
        return pressureFromMPa(value, units);
    }
    if (normalizeUnitSettings(units).system !== 'us') {
        return value;
    }

    switch (kind) {
        case 'v':
            return value * FACTORS.M3_PER_KG_TO_FT3_PER_LBM;
        case 'rho':
            return value * FACTORS.KG_PER_M3_TO_LBM_PER_FT3;
        case 'h':
        case 'u':
            return value * FACTORS.KJ_PER_KG_TO_BTU_PER_LBM;
        case 's':
            return value * FACTORS.KJ_PER_KG_K_TO_BTU_PER_LBM_R;
        default:
            return value;
    }
}

export function unitLabel(kind, units) {
    const settings = normalizeUnitSettings(units);
    const si = {
        T: 'deg C',
        P: PRESSURE_UNITS[settings.pressure].label,
        P_MPa: 'MPa',
        v: 'm^3/kg',
        rho: 'kg/m^3',
        h: 'kJ/kg',
        u: 'kJ/kg',
        s: 'kJ/(kg K)',
        x: 'quality'
    };

    const us = {
        T: 'deg F',
        P: PRESSURE_UNITS[settings.pressure].label,
        P_MPa: 'psia',
        v: 'ft^3/lbm',
        rho: 'lbm/ft^3',
        h: 'Btu/lbm',
        u: 'Btu/lbm',
        s: 'Btu/(lbm R)',
        x: 'quality'
    };

    return (settings.system === 'us' ? us : si)[kind] || '';
}

export function inputUnitLabel(kind, units) {
    return kind === 'x' ? '' : unitLabel(kind, units);
}

export function formatNumber(value, digits = 7) {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return '--';
    }
    if (!Number.isFinite(value)) {
        return value > 0 ? 'Infinity' : '-Infinity';
    }
    if (value === 0) {
        return '0';
    }
    const abs = Math.abs(value);
    if (abs >= 1000000 || abs < 0.0001) {
        return value.toExponential(5);
    }
    return Number(value.toPrecision(digits)).toString();
}

export function formatProperty(kind, value, units, digits = 7) {
    const display = propertyFromSI(kind, value, units);
    return `${formatNumber(display, digits)} ${unitLabel(kind, units)}`;
}

export function runUnitRoundTripTests() {
    const tests = [
        {
            name: 'SI pressure property display converts MPa to kPa',
            pass: Math.abs(propertyFromSI('P', 0.101325, 'si') - 101.325) <= 1e-10,
            expected: 101.325,
            actual: propertyFromSI('P', 0.101325, 'si')
        },
        {
            name: 'SI pressure property display converts MPa to MPa',
            pass: Math.abs(propertyFromSI('P', 0.101325, { system: 'si', pressure: 'MPa' }) - 0.101325) <= 1e-10,
            expected: 0.101325,
            actual: propertyFromSI('P', 0.101325, { system: 'si', pressure: 'MPa' })
        },
        {
            name: 'SI pressure property display converts MPa to bar',
            pass: Math.abs(propertyFromSI('P', 0.101325, { system: 'si', pressure: 'bar' }) - 1.01325) <= 1e-10,
            expected: 1.01325,
            actual: propertyFromSI('P', 0.101325, { system: 'si', pressure: 'bar' })
        },
        {
            name: 'SI pressure property display converts MPa to atm',
            pass: Math.abs(propertyFromSI('P', 0.101325, { system: 'si', pressure: 'atm' }) - 1) <= 1e-10,
            expected: 1,
            actual: propertyFromSI('P', 0.101325, { system: 'si', pressure: 'atm' })
        }
    ];
    const samples = [
        ['T', 0.01],
        ['T', 373.946],
        ['P', 0.101325],
        ['P', 22.064],
        ['v', 0.001],
        ['v', 2.5],
        ['rho', 997.1],
        ['h', 2675.5],
        ['u', 2500.9],
        ['s', 7.354]
    ];

    tests.push(...samples.map(([kind, value]) => {
        const usValue = propertyFromSI(kind, value, 'us');
        const back = propertyToSI(kind, usValue, 'us');
        const tolerance = Math.max(1e-10, Math.abs(value) * 1e-10);
        return {
            name: `unit round trip ${kind}=${value}`,
            pass: Math.abs(back - value) <= tolerance,
            expected: value,
            actual: back,
            tolerance
        };
    }));
    return tests;
}
