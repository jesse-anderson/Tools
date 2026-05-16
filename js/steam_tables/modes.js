export const MODES = {
    satT: {
        label: 'Saturated by T',
        fields: [{ id: 'T', label: 'Temperature', kind: 'T', value: 100 }]
    },
    satP: {
        label: 'Saturated by P',
        fields: [{ id: 'P', label: 'Pressure', kind: 'P', value: 0.101325 }]
    },
    mixT: {
        label: 'Two-phase by T + x',
        fields: [
            { id: 'T', label: 'Temperature', kind: 'T', value: 100 },
            { id: 'x', label: 'Quality x', kind: 'x', value: 0.5 }
        ]
    },
    mixP: {
        label: 'Two-phase by P + x',
        fields: [
            { id: 'P', label: 'Pressure', kind: 'P', value: 0.101325 },
            { id: 'x', label: 'Quality x', kind: 'x', value: 0.5 }
        ]
    },
    pt: {
        label: 'Single-phase by P + T',
        fields: [
            { id: 'P', label: 'Pressure', kind: 'P', value: 0.101325 },
            { id: 'T', label: 'Temperature', kind: 'T', value: 200 }
        ]
    },
    revPh: {
        label: 'Reverse (P, h)',
        reverse: ['P', 'h'],
        fields: [
            { id: 'P', label: 'Pressure', kind: 'P', value: 0.101325 },
            { id: 'target', label: 'Enthalpy h', kind: 'h', value: 2676 }
        ]
    },
    revPs: {
        label: 'Reverse (P, s)',
        reverse: ['P', 's'],
        fields: [
            { id: 'P', label: 'Pressure', kind: 'P', value: 0.101325 },
            { id: 'target', label: 'Entropy s', kind: 's', value: 7.36 }
        ]
    },
    revPv: {
        label: 'Reverse (P, v)',
        reverse: ['P', 'v'],
        fields: [
            { id: 'P', label: 'Pressure', kind: 'P', value: 0.101325 },
            { id: 'target', label: 'Specific volume v', kind: 'v', value: 1.7 }
        ]
    },
    revPu: {
        label: 'Reverse (P, u)',
        reverse: ['P', 'u'],
        fields: [
            { id: 'P', label: 'Pressure', kind: 'P', value: 0.101325 },
            { id: 'target', label: 'Internal energy u', kind: 'u', value: 2506 }
        ]
    },
    revTh: {
        label: 'Reverse (T, h)',
        reverse: ['T', 'h'],
        fields: [
            { id: 'T', label: 'Temperature', kind: 'T', value: 200 },
            { id: 'target', label: 'Enthalpy h', kind: 'h', value: 2875 }
        ]
    },
    revTs: {
        label: 'Reverse (T, s)',
        reverse: ['T', 's'],
        fields: [
            { id: 'T', label: 'Temperature', kind: 'T', value: 200 },
            { id: 'target', label: 'Entropy s', kind: 's', value: 7.5 }
        ]
    },
    revTv: {
        label: 'Reverse (T, v)',
        reverse: ['T', 'v'],
        fields: [
            { id: 'T', label: 'Temperature', kind: 'T', value: 200 },
            { id: 'target', label: 'Specific volume v', kind: 'v', value: 2.1 }
        ]
    },
    revTu: {
        label: 'Reverse (T, u)',
        reverse: ['T', 'u'],
        fields: [
            { id: 'T', label: 'Temperature', kind: 'T', value: 200 },
            { id: 'target', label: 'Internal energy u', kind: 'u', value: 2600 }
        ]
    }
};

export const MODE_GROUPS = [
    { label: 'Saturation', modes: ['satT', 'satP'] },
    { label: 'Two-phase mixture', modes: ['mixT', 'mixP'] },
    { label: 'Forward state', modes: ['pt'] },
    { label: 'Reverse at fixed pressure', modes: ['revPh', 'revPs', 'revPv', 'revPu'] },
    { label: 'Reverse at fixed temperature', modes: ['revTh', 'revTs', 'revTv', 'revTu'] }
];

export const EXAMPLES = [
    {
        id: 'sat-100c',
        label: 'Saturated water at 100 deg C',
        mode: 'satT',
        units: { system: 'si', pressure: 'kPa' },
        values: { T: 100 }
    },
    {
        id: 'steam-1atm-200c',
        label: 'Superheated steam, 1 atm / 200 deg C',
        mode: 'pt',
        units: { system: 'si', pressure: 'kPa' },
        values: { P: 0.101325, T: 200 }
    },
    {
        id: 'compressed-1mpa-50c',
        label: 'Compressed liquid, 1 MPa / 50 deg C',
        mode: 'pt',
        units: { system: 'si', pressure: 'MPa' },
        values: { P: 1, T: 50 }
    },
    {
        id: 'supercritical-25mpa-500c',
        label: 'Supercritical water, 25 MPa / 500 deg C',
        mode: 'pt',
        units: { system: 'si', pressure: 'MPa' },
        values: { P: 25, T: 500 }
    },
    {
        id: 'quality-1atm-50',
        label: '50% quality mixture at 1 atm',
        mode: 'mixP',
        units: { system: 'si', pressure: 'kPa' },
        values: { P: 0.101325, x: 0.5 }
    },
    {
        id: 'reverse-ph-low-pressure',
        label: 'Reverse P,h near condenser pressure',
        mode: 'revPh',
        units: { system: 'si', pressure: 'kPa' },
        values: { P: 0.01, target: 2200 }
    },
    {
        id: 'reverse-tu-two-phase',
        label: 'Reverse T,u two-phase example',
        mode: 'revTu',
        units: { system: 'si', pressure: 'kPa' },
        values: { T: 200, target: 2000 }
    }
];

export const RESULT_ROWS = {
    saturation: [
        ['T', 'Temperature', 'T'],
        ['P', 'Pressure', 'P'],
        ['vf', 'Specific volume liquid', 'v'],
        ['vg', 'Specific volume vapor', 'v'],
        ['uf', 'Internal energy liquid', 'u'],
        ['ug', 'Internal energy vapor', 'u'],
        ['ufg', 'Internal energy vaporization', 'u'],
        ['hf', 'Enthalpy liquid', 'h'],
        ['hg', 'Enthalpy vapor', 'h'],
        ['hfg', 'Enthalpy vaporization', 'h'],
        ['sf', 'Entropy liquid', 's'],
        ['sg', 'Entropy vapor', 's'],
        ['sfg', 'Entropy vaporization', 's']
    ],
    state: [
        ['T', 'Temperature', 'T'],
        ['P', 'Pressure', 'P'],
        ['x', 'Quality', 'x'],
        ['v', 'Specific volume', 'v'],
        ['rho', 'Density', 'rho'],
        ['u', 'Internal energy', 'u'],
        ['h', 'Enthalpy', 'h'],
        ['s', 'Entropy', 's']
    ]
};

export const COMPARISON_ROWS = [
    ['T', 'Temperature', 'T'],
    ['P', 'Pressure', 'P'],
    ['x', 'Quality', 'x'],
    ['v', 'Specific volume', 'v'],
    ['rho', 'Density', 'rho'],
    ['u', 'Internal energy', 'u'],
    ['h', 'Enthalpy', 'h'],
    ['s', 'Entropy', 's']
];

export function defaultValuesForMode(mode) {
    return Object.fromEntries(mode.fields.map((field) => [field.id, field.value]));
}
