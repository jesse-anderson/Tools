// Protocol and baseline presets. Each study preset carries the schedule as the
// paper reported it; an interval the paper did not report says so.

export const PROTOCOL_PRESETS = Object.freeze([
    {
        id: 'reference',
        label: '6.4 g/day for 4 weeks, then 16 weeks off',
        phases: [{ doseGPerDay: 6.4, servings: 5, form: 'plain', days: 28 }],
        washoutDays: 112,
        sourceIds: ['rezende2020'],
        reported: null,
        note: 'The 179.2 g protocol most of the 26 studies in Rezende 2020 used. Five servings of 1.28 g is an example, not a study schedule: it keeps each serving under 20 mg/kg at 70 kg.'
    },
    {
        id: 'harris2006',
        label: 'Harris 2006: 3.2 g/day for 4 weeks',
        phases: [{ doseGPerDay: 3.2, servings: 4, form: 'plain', days: 28 }],
        washoutDays: 112,
        sourceIds: ['harris2006'],
        reported: { servings: '4 a day', perServing: '800 mg', interval: 'About 3 h (9, 12, 15 and 18 h)', form: 'Plain', meals: 'Not reported' }
    },
    {
        id: 'hill2007',
        label: 'Hill 2007: 4.0 rising to 6.4 g/day over 10 weeks',
        phases: [
            { doseGPerDay: 4.0, servings: 8, form: 'plain', days: 7 },
            { doseGPerDay: 4.8, servings: 8, form: 'plain', days: 7 },
            { doseGPerDay: 5.6, servings: 8, form: 'plain', days: 7 },
            { doseGPerDay: 6.4, servings: 8, form: 'plain', days: 49 }
        ],
        washoutDays: 112,
        sourceIds: ['hill2007'],
        reported: { servings: '8 a day', perServing: '400 or 800 mg, all 800 mg from week 4', interval: '1 h (9, 10, 11 and 12 am; 3, 4, 5 and 6 pm)', form: 'Plain', meals: 'Not reported' }
    },
    {
        id: 'stellingwerff-low',
        label: 'Stellingwerff 2012: 1.6 g/day for 8 weeks, then 8 weeks off',
        phases: [{ doseGPerDay: 1.6, servings: 2, form: 'sustained', days: 56 }],
        washoutDays: 56,
        sourceIds: ['stellingwerff2012'],
        reported: { servings: '2 a day', perServing: '800 mg (one active and one placebo tablet)', interval: 'Not reported', form: 'Sustained release', meals: 'With meals' }
    },
    {
        id: 'stellingwerff-high',
        label: 'Stellingwerff 2012: 3.2 g/day for 4 weeks, 1.6 g/day for 4, then 8 off',
        phases: [
            { doseGPerDay: 3.2, servings: 2, form: 'sustained', days: 28 },
            { doseGPerDay: 1.6, servings: 2, form: 'sustained', days: 28 }
        ],
        washoutDays: 56,
        sourceIds: ['stellingwerff2012'],
        reported: { servings: '2 a day', perServing: '2 tablets of 800 mg (1.6 g), then one active and one placebo', interval: 'Not reported', form: 'Sustained release', meals: 'With meals' }
    },
    {
        id: 'yamaguchi2021',
        label: 'Yamaguchi 2021: 6.4 g/day for 8 weeks, then 16 weeks off',
        phases: [{ doseGPerDay: 6.4, servings: 4, form: 'sustained', days: 56 }],
        washoutDays: 112,
        sourceIds: ['yamaguchi2021'],
        reported: { servings: '4 a day', perServing: '2 tablets of 800 mg (1.6 g)', interval: 'With breakfast, lunch and dinner, and before sleep', form: 'Sustained release', meals: 'With main meals' }
    },
    {
        id: 'saunders2017',
        label: 'Saunders 2017: 6.4 g/day for 24 weeks',
        phases: [{ doseGPerDay: 6.4, servings: 4, form: 'sustained', days: 168 }],
        washoutDays: 112,
        sourceIds: ['saunders2017'],
        reported: { servings: '4 a day', perServing: '2 tablets of 800 mg (1.6 g)', interval: '3 to 4 h', form: 'Sustained release', meals: 'Not reported' }
    },
    {
        id: 'stegen2014',
        label: 'Low dose: 3.2 g/day for 46 days, then 1.2 g/day for 6 weeks (Stegen 2014)',
        phases: [
            { doseGPerDay: 3.2, servings: 4, form: 'plain', days: 46 },
            { doseGPerDay: 1.2, servings: 3, form: 'plain', days: 42 }
        ],
        washoutDays: 112,
        sourceIds: ['stegen2014'],
        reported: { servings: '4 a day while loading, then 3', perServing: '800 mg, then 400 mg capsules', interval: 'Not reported; the 1.2 g/day capsules were spread through the day', form: 'Loading varied by group in form and meal timing; maintenance was plain powder in capsules', meals: 'Maintenance capsules before meals' },
        note: 'The 1.2 g/day maintenance dose kept carnosine 30 to 50% above baseline. It is below the lowest fitted dose, so the curve there is an extrapolation.'
    },
    {
        id: 'church2017',
        label: 'High dose: 12 g/day for 14 days (Church 2017)',
        phases: [{ doseGPerDay: 12, servings: 3, form: 'sustained', days: 14 }],
        washoutDays: 112,
        sourceIds: ['church2017'],
        reported: { servings: '3 a day', perServing: '4 tablets of 1 g (4 g)', interval: 'Not reported', form: 'Sustained release', meals: 'Not reported' },
        note: 'Above the fitted 6.4 g/day. Church measured 12.1 mmol/kg dry muscle at day 14; that point is a check on the model, not a fit.'
    }
]);

// Baselines in mmol/kg dry muscle. A preset moves the percent view and grams,
// never the absolute rise (Rezende 2020 found baseline does not change it).
export const BASELINE_PRESETS = Object.freeze([
    { id: 'pooled', label: 'Study average, mostly young men', value: 22.9, claimId: 'baseline_default',
        note: 'Individual data from 6.4 g/day studies; 486 of 575 participants in Rezende 2020 were men.' },
    { id: 'women', label: 'Women', value: 17.5, claimId: 'women_vl',
        note: 'Vastus lateralis, Mannion 1992 as cited by Harris 2006. Everaert 2011 found men higher by 28 to 82% in calf muscles.' },
    { id: 'vegetarian', label: 'Vegetarian', value: Math.round(22.9 * (1 - 0.26) * 10) / 10, claimId: 'vegetarian',
        note: 'The study average lowered by 26%, the gastrocnemius difference Everaert 2011 measured, applied here to the thigh figure.' },
    { id: 'older', label: 'Adult over 30', value: Math.round(22.9 * (1 - 0.15) * 10) / 10, claimId: 'age_drop',
        note: 'The study average lowered by 15%, the drop in men from age 21 to 30 to age 31 to 50 that Baguet 2012 measured in the calf, applied here to the thigh figure. Women dropped 16 to 26%. People aged 60 to 83 were no lower than those aged 31 to 50.' }
]);
