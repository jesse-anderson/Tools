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

    anchors.push({
        id: 'rezende_4wk', sourceIds: ['rezende2020'], claimIds: ['response_sd'],
        title: '6.4 g/day for 4 weeks, pooled individual data',
        measured: 14.0, measuredText: '+14.0 mmol/kg dm (95% CrI 10.1 to 18.1)',
        model: at(ref, 28), unit: 'mmol/kg dm', expected: 'inside'
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

    // The same loss rate on Baguet 2009's own loaded excess, about 2 mM (wet, MRS).
    anchors.push({
        id: 'baguet_excess_loss', sourceIds: ['baguet2009'], claimIds: ['washout_rate_baguet'],
        title: 'Loss of the loaded excess after stopping, about 2 mM above baseline',
        measured: claims.washout_rate_baguet.value, measuredText: `${claims.washout_rate_baguet.value} mM/day`,
        model: spread(kds.map((kd) => kd * 2)), unit: 'mM/day; the four washout half-lives', expected: 'inside', digits: 3
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

    for (const a of anchors) {
        a.verdict = verdict(a.measured, a.model);
        a.medianGap = a.model.p50 / a.measured - 1;
    }
    return anchors;
}
