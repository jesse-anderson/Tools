// Literature anchors: published results the model is held against. Each one
// runs the band on the study's protocol and states where the measured value
// falls. `expected` is the verdict this version of the model gives; a change
// to the model that moves a verdict fails the spec until this file says so.

import { runBand, loadingPapers } from './beta-alanine-monte-carlo.js';
import {
    BETA_ALANINE_G_PER_MOL, CARNOSINE_G_PER_MOL, kdFromHalfLife, fitSlope, maintenanceDose, steadyTurnover, percentileSorted
} from './beta-alanine-engine.js';

/** inside the band, or which side of it the model sits. */
export function verdict(measured, band) {
    if (measured < band.p10) return 'model-above';
    if (measured > band.p90) return 'model-below';
    return 'inside';
}

function at(b, day, scale = 1) {
    return { p10: b.p10[day] * scale, p50: b.p50[day] * scale, p90: b.p90[day] * scale };
}

export function literatureAnchors({ observations, washouts, claims }) {
    const common = { observations, washouts, washoutDays: 0 };
    const run = (phases) => runBand({ ...common, phases });
    const ref = run([{ doseGPerDay: 6.4, days: 168 }]);
    const saunders = (day) => observations.find((o) => o.sourceId === 'saunders2017' && o.day === day);
    const anchors = [];

    const rez = claims.rezende_mean_4wk.value;
    anchors.push({
        id: 'rezende_4wk', sourceIds: ['rezende2020'], claimIds: ['rezende_mean_4wk'],
        title: '6.4 g/day for 4 weeks, pooled individual data',
        measured: rez, measuredText: `+${rez.toFixed(1)} mmol/kg dm (95% CrI 10.1 to 18.1)`,
        model: at(ref, 28), unit: 'mmol/kg dm', expected: 'inside'
    });

    // Rezende's individual data, 4 to 24 weeks: gain per week after week 4. Each
    // draw's least-squares slope of rise on week over weekly points 4 to 24.
    const weeks = Array.from({ length: 21 }, (_, i) => i + 4);
    const wMean = weeks.reduce((s, w) => s + w, 0) / weeks.length;
    const wSs = weeks.reduce((s, w) => s + (w - wMean) ** 2, 0);
    const perWeek = new Float64Array(ref.draws);
    for (let i = 0; i < ref.draws; i++) {
        let sxy = 0;
        for (const w of weeks) sxy += (w - wMean) * ref.values[i * (ref.lastDay + 1) + w * 7];
        perWeek[i] = sxy / wSs;
    }
    perWeek.sort();
    anchors.push({
        id: 'rezende_weekly_gain', sourceIds: ['rezende2020'], claimIds: ['rezende_weekly_gain'],
        title: '6.4 g/day, 4 to 24 weeks: gain per week after week 4, individual data',
        measured: claims.rezende_weekly_gain.value, measuredText: `+${claims.rezende_weekly_gain.value} mmol/kg dm a week (95% CrI 0.2 to 0.7)`,
        model: { p10: percentileSorted(perWeek, 0.1), p50: percentileSorted(perWeek, 0.5), p90: percentileSorted(perWeek, 0.9) },
        unit: 'mmol/kg dm a week, least-squares slope over weeks 4 to 24', expected: 'model-above', digits: 2,
        note: 'Known gap, the slowdown again. Not independent: Saunders 2017, a fitted study, is among the individual data.'
    });

    // Week 12 sits just inside the low edge; the middle line is far above it.
    for (const [day, expected] of [[28, 'inside'], [84, 'inside'], [168, 'model-above']]) {
        const o = saunders(day);
        anchors.push({
            id: `saunders_wk${day / 7}`, sourceIds: ['saunders2017'], claimIds: [],
            title: `6.4 g/day sustained release, week ${day / 7}`,
            measured: o.rise, measuredText: `+${o.rise.toFixed(2)} mmol/kg dm`,
            model: at(ref, day), unit: 'mmol/kg dm', expected,
            note: day > 28 ? 'The study slowed after week 4; the model has no slowdown, so its middle line runs high.' : null
        });
    }

    // del Favero 2012: 3.2 g/day for 12 weeks in adults 60 to 80, as a percent of the older-adult baseline.
    const older = Math.round(claims.baseline_default.value * (1 - claims.age_drop.value) * 10) / 10;
    const df = run([{ doseGPerDay: 3.2, days: 84 }]);
    anchors.push({
        id: 'delfavero_older', sourceIds: ['delfavero2012', 'baguet2012'], claimIds: ['elderly_rise', 'age_drop'],
        title: '3.2 g/day sustained release for 12 weeks, ages 60 to 80',
        measured: claims.elderly_rise.value * 100, measuredText: `+${(claims.elderly_rise.value * 100).toFixed(1)}% (gastrocnemius)`,
        model: at(df, 84, 100 / older), unit: `% of the older-adult baseline, ${older.toFixed(1)}`, expected: 'inside'
    });

    // Stegen 2014: 1.2 g/day after loading, 30 to 50% above the group's own baseline.
    const st = run([{ doseGPerDay: 3.2, days: 46 }, { doseGPerDay: 1.2, days: 42 }]);
    anchors.push({
        id: 'stegen_12', sourceIds: ['stegen2014'], claimIds: ['maintenance', 'stegen_baseline_12'],
        title: '3.2 g/day for 46 days, then 1.2 g/day for 6 weeks',
        measured: 40, measuredText: '30 to 50% above baseline (middle 40%)',
        model: at(st, 88, 100 / claims.stegen_baseline_12.value), unit: `% of that group's baseline, ${claims.stegen_baseline_12.value}`, expected: 'inside'
    });

    // Share of the beta-alanine taken that ends up in carnosine, on Yamaguchi's
    // assumption of 40% of a 70 kg body as muscle.
    const dryKg = (70 * 0.4) / claims.wet_to_dry.value;
    const takenMmol = ((6.4 * 28) / BETA_ALANINE_G_PER_MOL) * 1000;
    anchors.push({
        id: 'incorporation', sourceIds: ['blancquaert2016', 'yamaguchi2021'], claimIds: ['fate_incorporation', 'incorporation_yamaguchi'],
        title: 'Share of beta-alanine stored as carnosine, 6.4 g/day for 4 weeks',
        measured: claims.incorporation_yamaguchi.value * 100, measuredText: '3 to 6%; 4.4% +/- 2.0',
        model: at(ref, 28, (dryKg / takenMmol) * 100), unit: '% of the beta-alanine taken, 70 kg with 40% muscle', expected: 'inside'
    });

    // Training (Bex 2015): 6.4 g/day for 23 days, stored share as above. The
    // band should span the inactive and the trained groups.
    const bex = run([{ doseGPerDay: 6.4, days: 23 }]);
    const bexScale = (dryKg / (((6.4 * 23) / BETA_ALANINE_G_PER_MOL) * 1000)) * 100;
    for (const [id, claim, label] of [['bex_inactive', 'training_inactive', 'men who stayed inactive'], ['bex_trained', 'training_trained', 'men who trained, high intensity']]) {
        anchors.push({
            id, sourceIds: ['bex2015'], claimIds: [claim],
            title: `Share stored as carnosine, 6.4 g/day for 23 days, ${label}`,
            measured: claims[claim].value * 100, measuredText: `${(claims[claim].value * 100).toFixed(2)}%`,
            model: at(bex, 23, bexScale), unit: '% of the beta-alanine taken, 70 kg with 40% muscle', expected: 'inside', digits: 2
        });
    }

    // Blancquaert 2018: 0.8 g/day for 3 months (13 weeks) in vegetarian women,
    // as a percent of the group's own MRS baseline (soleus 3.7, gastrocnemius 5.1 mM).
    const veg = ((3.7 + 5.1) / 2) * claims.wet_to_dry.value;
    const low = run([{ doseGPerDay: 0.8, days: 91 }]);
    anchors.push({
        id: 'blancquaert_08', sourceIds: ['blancquaert2018'], claimIds: ['low_dose_08'],
        title: '0.8 g/day sustained release for 3 months, vegetarian women',
        measured: claims.low_dose_08.value * 100, measuredText: `+${(claims.low_dose_08.value * 100).toFixed(0)}% (soleus and gastrocnemius)`,
        model: at(low, 91, 100 / veg), unit: `% of that group's baseline, ${veg.toFixed(1)}`, expected: 'model-below',
        note: 'Known gap, as with Stegen 2014: below the fitted 1.6 g/day the model underrates the rise.'
    });

    // Baseline turnover: at steady state synthesis equals loss, kd x level x dry muscle,
    // one value per washout study (22.9 mmol/kg dm, 70 kg with 40% muscle).
    const kds = washouts.map((w) => kdFromHalfLife(w.central));
    const spread = (vals) => {
        const s = [...vals].sort((a, b) => a - b);
        return { p10: s[0], p50: (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2, p90: s[s.length - 1] };
    };
    const base = claims.baseline_default.value;
    anchors.push({
        id: 'turnover_baseline', sourceIds: ['blancquaert2018'], claimIds: ['turnover_blancquaert'],
        title: 'Carnosine made and lost per day at the study-average baseline',
        measured: claims.turnover_blancquaert.value, measuredText: `about ${claims.turnover_blancquaert.value} g/day`,
        model: spread(kds.map((kd) => (steadyTurnover(base, dryKg, kd) * CARNOSINE_G_PER_MOL) / 1000)),
        unit: 'g carnosine/day; lowest, middle and highest of the four washout half-lives', expected: 'inside', digits: 2
    });

    // Baguet 2009, about 2 mM loaded (wet, MRS): share gone at 3 weeks, then the
    // linear rate over the 9-week washout against the model's mean loss over 63 days.
    anchors.push({
        id: 'baguet_3wk_share', sourceIds: ['baguet2009'], claimIds: ['washout_3wk_baguet'],
        title: 'Share of the loaded excess gone 3 weeks after stopping',
        measured: claims.washout_3wk_baguet.value * 100, measuredText: `${(claims.washout_3wk_baguet.value * 100).toFixed(1)}%`,
        model: spread(kds.map((kd) => (1 - Math.exp(-21 * kd)) * 100)), unit: '%; the four washout half-lives', expected: 'inside', digits: 1
    });
    anchors.push({
        id: 'baguet_excess_loss', sourceIds: ['baguet2009'], claimIds: ['washout_rate_baguet', 'washout_firstorder_baguet'],
        title: 'Mean loss of a 2 mM loaded excess over the 9-week washout',
        measured: claims.washout_rate_baguet.value, measuredText: `${claims.washout_rate_baguet.value} mM/day, linear`,
        model: spread(kds.map((kd) => (2 * (1 - Math.exp(-63 * kd))) / 63)), unit: 'mM/day averaged over 63 days; the four washout half-lives', expected: 'model-below', digits: 3,
        note: `Known gap: Baguet's loss was linear and the excess was gone by week 9. The first-order model still holds a quarter to a half of it then; Baguet notes first-order kinetics would leave ${(claims.washout_firstorder_baguet.value * 100).toFixed(1)}%.`
    });

    // Supply that holds a whole vegetarian baseline of 14 mmol/kg dm, D = kd x 14 / slope
    // over every washout and loading pairing, against Spelnikov's endogenous estimate.
    const pairs = [];
    for (const kd of kds) for (const p of loadingPapers(observations)) pairs.push(maintenanceDose(14, fitSlope(p.points, kd), kd));
    pairs.sort((a, b) => a - b);
    anchors.push({
        id: 'spelnikov_supply', sourceIds: ['spelnikov2019'], claimIds: ['endogenous_spelnikov'],
        title: 'Daily beta-alanine that holds a vegetarian level of 14 mmol/kg dm',
        measured: claims.endogenous_spelnikov.value, measuredText: `${claims.endogenous_spelnikov.value} g/day (their model estimate)`,
        model: { p10: percentileSorted(pairs, 0.1), p50: percentileSorted(pairs, 0.5), p90: percentileSorted(pairs, 0.9) },
        unit: 'g/day as if taken by mouth; 10th, middle and 90th of the pairings', expected: 'inside', digits: 2,
        note: 'Both are model figures. Beta-alanine made in the liver is not broken down on the way in as a swallowed dose is, so this compares the arithmetic, not a measurement.'
    });

    // Blancquaert 2017: gain in days 12 to 23 over gain in days 0 to 12 at a steady dose.
    // The slope cancels, so each washout half-life gives one ratio.
    const ratio = (kd) => (Math.exp(-12 * kd) - Math.exp(-23 * kd)) / (1 - Math.exp(-12 * kd));
    anchors.push({
        id: 'blancquaert17_slowdown', sourceIds: ['blancquaert2017'], claimIds: ['early_slowdown'],
        title: '6 g/day for 23 days: gain in days 12 to 23 as a share of days 0 to 12',
        measured: claims.early_slowdown.value, measuredText: '0.81 against 1.42 mM (0.57)',
        model: spread(kds.map(ratio)), unit: 'ratio; lowest, middle and highest of the four washout half-lives', expected: 'model-above', digits: 2,
        note: 'Known gap: the model slows only through washout, so it keeps more of its early pace than measured, here within weeks as at Saunders week 24.'
    });

    // Stellingwerff 2012 week 8: 3.2 then 1.6 g/day against 1.6 g/day throughout, as a ratio of
    // the two arms' percent rises (TA and GA summed). The slope cancels: with a = e^(-28 kd)
    // the model ratio is (1 + 2a) / (1 + a), one value per washout half-life.
    const pct = (id) => claims[id].value * 100;
    const stepRatio = (pct('stell_wk8_hl_ta') + pct('stell_wk8_hl_ga')) / (pct('stell_wk8_ll_ta') + pct('stell_wk8_ll_ga'));
    anchors.push({
        id: 'stellingwerff_stepdown', sourceIds: ['stellingwerff2012'], claimIds: ['stell_wk8_hl_ta', 'stell_wk8_hl_ga', 'stell_wk8_ll_ta', 'stell_wk8_ll_ga'],
        title: 'Week 8: 3.2 g/day for 4 weeks then 1.6, over 1.6 g/day for 8 weeks',
        measured: stepRatio,
        measuredText: `${stepRatio.toFixed(2)} (TA ${pct('stell_wk8_hl_ta').toFixed(1)} over ${pct('stell_wk8_ll_ta').toFixed(1)}%, GA ${pct('stell_wk8_hl_ga').toFixed(1)} over ${pct('stell_wk8_ll_ga').toFixed(1)}%)`,
        model: spread(kds.map((kd) => { const a = Math.exp(-28 * kd); return (1 + 2 * a) / (1 + a); })),
        unit: 'ratio of the rises; lowest, middle and highest of the four washout half-lives', expected: 'model-above', digits: 2,
        note: 'Weak: the two arms were no longer significantly different at week 8, and a mean of percents is not a ratio of means. Tibialis alone falls inside. The model keeps more of the early high dose after the step down than measured.'
    });

    // Varanoske 2019: 6 g/day for 28 days as sustained or rapid release, VL HPLC wet weight to dry.
    const v28 = run([{ doseGPerDay: 6, days: 28 }]);
    for (const [id, claim, form] of [['varanoske_sr', 'varanoske_sr', 'sustained release'], ['varanoske_rr', 'varanoske_rr', 'rapid release']]) {
        anchors.push({
            id, sourceIds: ['varanoske2019'], claimIds: [claim, 'wet_to_dry'],
            title: `6 g/day for 28 days, ${form} tablets with meals`,
            measured: claims[claim].value * claims.wet_to_dry.value, measuredText: `+${claims[claim].value.toFixed(2)} mmol/kg wet`,
            model: at(v28, 28), unit: 'mmol/kg dm', expected: 'inside',
            note: id === 'varanoske_sr' ? 'The model has no formulation term; its middle line sits between the two forms.' : null
        });
    }

    for (const a of anchors) {
        a.verdict = verdict(a.measured, a.model);
        a.medianGap = a.model.p50 / a.measured - 1;
    }
    return anchors;
}
