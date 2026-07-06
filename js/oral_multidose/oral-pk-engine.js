// Pure pharmacokinetic engine for the Oral Multi-Dose Simulator.
//
// One-compartment extravascular model with first-order absorption and
// elimination. propagate() is the exact analytic solution over a time step
// (including the ka==ke L Hopital limit), applied piecewise between dose
// events. Nothing here touches the DOM so it can be tested directly via
// window.OralMultiDose (see tests/smoke/oral-multidose.spec.cjs).

// Deterministic PRNG (mulberry32) so Monte Carlo bands are reproducible/testable.
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function kaFromBucket(X) {
    // ka = -ln(1 - 0.90) / X = ln(10) / X ≈ 2.303 / X
    return 2.302585093 / X;
}

/**
 * Solve for ka given ke and Tmax using bisection
 * Tmax = ln(ka/ke) / (ka - ke), requires ka > ke
 */
function solveKaFromTmax(ke, tmax, kaMax = 200) {
    const eps = 1e-6;
    let lo = ke * (1 + eps);
    let hi = kaMax;
    
    // Check if solution exists in bracket
    const fLo = Math.log(lo / ke) / (lo - ke) - tmax;
    const fHi = Math.log(hi / ke) / (hi - ke) - tmax;
    
    if (fLo * fHi > 0) {
        // No solution in bracket
        return null;
    }
    
    // Bisection
    for (let i = 0; i < 100; i++) {
        const mid = (lo + hi) / 2;
        const fMid = Math.log(mid / ke) / (mid - ke) - tmax;
        
        if (Math.abs(fMid) < 1e-10 || (hi - lo) < 1e-10) {
            return mid;
        }
        
        if (fMid * fLo < 0) {
            hi = mid;
        } else {
            lo = mid;
        }
    }
    
    return (lo + hi) / 2;
}

/**
 * Analytic propagation of 1-compartment model over time delta
 * Returns [Ag_new, Ac_new]
 */
function propagate(Ag, Ac, ka, ke, F, dt) {
    if (dt <= 0) return [Ag, Ac];
    
    const threshold = 1e-8;
    
    if (Math.abs(ka - ke) < threshold) {
        // Edge case: ka ≈ ke
        const k = (ka + ke) / 2;
        const expK = Math.exp(-k * dt);
        const Ag_new = Ag * expK;
        const Ac_new = expK * (Ac + F * k * Ag * dt);
        return [Ag_new, Ac_new];
    }
    
    const expKa = Math.exp(-ka * dt);
    const expKe = Math.exp(-ke * dt);

    const Ag_new = Ag * expKa;
    const Ac_new = Ac * expKe + (F * ka * Ag / (ke - ka)) * (expKa - expKe);

    return [Ag_new, Ac_new];
}

/**
 * Numerical propagation for saturable (nonlinear) elimination over a time step.
 * Absorption stays first-order (dAg/dt = -ka*Ag); central-compartment
 * elimination follows Michaelis-Menten:
 *   dAc/dt = F*ka*Ag - Vmax*Ac/(Km + Ac)
 * Amounts are in mg, Vmax in mg/h, Km in mg (amount). Zero-order elimination is
 * the Km -> 0 limit: the rate is a constant Vmax while Ac > 0, then floors at 0.
 * There is no closed form, so this integrates with RK4 over internal substeps.
 * Returns [Ag_new, Ac_new].
 */
function propagateSaturable(Ag, Ac, ka, F, Vmax, Km, dt, maxSubStep = 0.01) {
    if (dt <= 0) return [Ag, Ac];

    const n = Math.max(1, Math.ceil(dt / maxSubStep));
    const h = dt / n;

    const elim = (ac) => (ac <= 0 ? 0 : (Vmax * ac) / (Km + ac));
    const dAg = (ag) => -ka * ag;
    const dAc = (ag, ac) => F * ka * ag - elim(ac);

    let ag = Ag;
    let ac = Ac;
    for (let i = 0; i < n; i++) {
        const k1g = dAg(ag);
        const k1c = dAc(ag, ac);
        const k2g = dAg(ag + 0.5 * h * k1g);
        const k2c = dAc(ag + 0.5 * h * k1g, ac + 0.5 * h * k1c);
        const k3g = dAg(ag + 0.5 * h * k2g);
        const k3c = dAc(ag + 0.5 * h * k2g, ac + 0.5 * h * k2c);
        const k4g = dAg(ag + h * k3g);
        const k4c = dAc(ag + h * k3g, ac + h * k3c);

        ag += (h / 6) * (k1g + 2 * k2g + 2 * k3g + k4g);
        ac += (h / 6) * (k1c + 2 * k2c + 2 * k3c + k4c);
        if (ag < 0) ag = 0;
        if (ac < 0) ac = 0; // saturable elimination cannot drive the amount negative
    }
    return [ag, ac];
}

/**
 * Build dose event schedule
 */
function buildSchedule(numDoses, tau, events, doseAmount, doseForm, tLag, tRel) {
    const schedule = [];
    
    for (let i = 1; i <= numDoses; i++) {
        const baseTime = (i - 1) * tau;
        let multiplier = 1;
        let timeShift = 0;
        
        // Check for disruptions
        const disruption = events.find(e => e.doseNum === i);
        let customDoseOverride = null;
        if (disruption) {
            switch (disruption.eventType) {
                case 'missed':
                    multiplier = 0;
                    break;
                case 'late':
                    timeShift = disruption.shift;
                    break;
                case 'early':
                    timeShift = -disruption.shift;
                    break;
                case 'double':
                    multiplier = 2;
                    break;
                case 'custom':
                    customDoseOverride = disruption.customDose;
                    break;
            }
        }
        
        if (multiplier === 0) continue;
        
        const ingestionTime = baseTime + timeShift;
        const effectiveLag = (doseForm === 'Delayed') ? tLag : 0;
        
        // Determine the actual dose amount for this administration
        const actualDose = customDoseOverride !== null ? customDoseOverride : (doseAmount * multiplier);
        
        if (doseForm === 'ER') {
            // Extended release: split into micro-doses
            const microDosesPerHour = 60;  // was 15
            const N = Math.min(240, Math.max(60, Math.round(tRel * microDosesPerHour)));
            const dtMicro = tRel / N;
            const microDose = actualDose / N;
            
            for (let j = 0; j < N; j++) {
                schedule.push({
                    time: ingestionTime + effectiveLag + j * dtMicro,
                    amount: microDose,
                    doseNum: i,
                    isMicro: true
                });
            }
        } else {
            // IR or Delayed
            schedule.push({
                time: ingestionTime + effectiveLag,
                amount: actualDose,
                doseNum: i,
                isMicro: false
            });
        }
    }
    
    // Sort by time
    schedule.sort((a, b) => a.time - b.time);
    return schedule;
}

/**
 * Run single simulation
 */
function simulate(params) {
    const {
        ka, ke, F, schedule, duration, samplesPerHour = 60,
        elimMode = 'firstorder', Vmax = 0, Km = 0,
    } = params;

    // First-order uses the exact analytic step; saturable modes integrate
    // numerically. Zero-order is just Michaelis-Menten with Km = 0.
    const step = (Ag, Ac, delta) => (elimMode === 'firstorder')
        ? propagate(Ag, Ac, ka, ke, F, delta)
        : propagateSaturable(Ag, Ac, ka, F, Vmax, Km, delta);

    // Build time points: regular grid + all event times
    const dt = 1 / samplesPerHour;
    let timePoints = new Set();
    
    for (let t = 0; t <= duration; t += dt) {
        timePoints.add(Math.round(t * 10000) / 10000);
    }
    schedule.forEach(e => {
        if (e.time >= 0 && e.time <= duration) {
            timePoints.add(Math.round(e.time * 10000) / 10000);
            // Add point just after for better resolution
            timePoints.add(Math.round((e.time + 0.0001) * 10000) / 10000);
        }
    });
    
    const times = Array.from(timePoints).sort((a, b) => a - b);
    const Ac_values = [];
    
    let Ag = 0;
    let Ac = 0;
    let eventIdx = 0;
    let prevTime = 0;
    
    for (const t of times) {
        // Process any dose events at or before this time
        while (eventIdx < schedule.length && schedule[eventIdx].time <= t) {
            // Propagate to event time
            const dtToEvent = schedule[eventIdx].time - prevTime;
            if (dtToEvent > 0) {
                [Ag, Ac] = step(Ag, Ac, dtToEvent);
                prevTime = schedule[eventIdx].time;
            }
            // Add dose to gut
            Ag += schedule[eventIdx].amount;
            eventIdx++;
        }
        
        // Propagate to current time
        const dtRemaining = t - prevTime;
        if (dtRemaining > 0) {
            [Ag, Ac] = step(Ag, Ac, dtRemaining);
            prevTime = t;
        }
        
        Ac_values.push(Ac);
    }
    
    return { times, Ac_values };
}

/**
 * Build baseline (no disruptions) schedule for comparison
 */
function buildBaselineSchedule(numDoses, tau, doseAmount, doseForm, tLag, tRel) {
    return buildSchedule(numDoses, tau, [], doseAmount, doseForm, tLag, tRel);
}

/**
 * Compute AUC using trapezoidal rule for a specific interval
 */
function computeIntervalAUC(times, values, tStart, tEnd) {
    let auc = 0;
    for (let i = 0; i < times.length - 1; i++) {
        const t0 = times[i];
        const t1 = times[i + 1];
        
        if (t1 <= tStart || t0 >= tEnd) continue;
        
        const tA = Math.max(t0, tStart);
        const tB = Math.min(t1, tEnd);
        
        // Linear interpolation for values at tA and tB
        const frac0 = (t1 - t0 > 0) ? (tA - t0) / (t1 - t0) : 0;
        const frac1 = (t1 - t0 > 0) ? (tB - t0) / (t1 - t0) : 0;
        const vA = values[i] + frac0 * (values[i + 1] - values[i]);
        const vB = values[i] + frac1 * (values[i + 1] - values[i]);
        
        auc += 0.5 * (vA + vB) * (tB - tA);
    }
    return auc;
}

/**
 * Find max/min in an interval
 */
function findIntervalExtrema(times, values, tStart, tEnd) {
    let max = -Infinity, min = Infinity, tMax = tStart;
    
    for (let i = 0; i < times.length; i++) {
        if (times[i] >= tStart && times[i] <= tEnd) {
            if (values[i] > max) {
                max = values[i];
                tMax = times[i];
            }
            if (values[i] < min) {
                min = values[i];
            }
        }
    }
    
    return { max, min, tMax };
}

/**
 * Compute metrics from simulation
 */
function computeMetrics(simResult, params, baseline = null, events = []) {
    const { times, Ac_values } = simResult;
    const { tau, numDoses, recoveryThreshold = 5 } = params;
    
    const metrics = {};
    
    // Overall max/min
    let overallMax = 0, overallTmax = 0;
    let lastIntervalMin = Infinity;
    
    for (let i = 0; i < times.length; i++) {
        if (Ac_values[i] > overallMax) {
            overallMax = Ac_values[i];
            overallTmax = times[i];
        }
    }
    
    metrics.Amax = overallMax;
    metrics.Tmax = overallTmax;
    
    // Find last complete interval trough
    const lastIntervalStart = (numDoses - 1) * tau;
    const lastIntervalEnd = numDoses * tau;
    
    if (lastIntervalEnd <= times[times.length - 1]) {
        const extrema = findIntervalExtrema(times, Ac_values, lastIntervalStart, lastIntervalEnd);
        metrics.Amin = extrema.min;
    } else {
        // Use minimum in last available interval
        const extrema = findIntervalExtrema(times, Ac_values, lastIntervalStart, times[times.length - 1]);
        metrics.Amin = extrema.min;
    }
    
    // AUC for first and last intervals
    const auc1 = computeIntervalAUC(times, Ac_values, 0, tau);
    const aucSS = computeIntervalAUC(times, Ac_values, lastIntervalStart, Math.min(lastIntervalEnd, times[times.length - 1]));
    
    metrics.accumRatio = (auc1 > 0) ? (aucSS / auc1) : 1;
    
    // Steady state detection (within 5% of previous interval)
    let reachedSS = false;
    for (let i = 2; i < numDoses; i++) {
        const aucPrev = computeIntervalAUC(times, Ac_values, (i - 2) * tau, (i - 1) * tau);
        const aucCurr = computeIntervalAUC(times, Ac_values, (i - 1) * tau, i * tau);
        if (aucPrev > 0 && Math.abs(aucCurr - aucPrev) / aucPrev < 0.05) {
            reachedSS = true;
            break;
        }
    }
    metrics.steadyState = reachedSS;
    
    // Recovery time (if baseline provided and there are disruptions)
    metrics.recoveryTime = null;
    if (baseline && events.length > 0) {
        // Find first disruption
        const firstDisruption = Math.min(...events.map(e => e.doseNum));
        const disruptionTime = (firstDisruption - 1) * tau;
        
        // Compare interval AUCs to baseline
        for (let i = firstDisruption; i < numDoses; i++) {
            const tStart = (i - 1) * tau;
            const tEnd = i * tau;
            
            if (tEnd > times[times.length - 1]) break;
            
            const aucDisrupted = computeIntervalAUC(times, Ac_values, tStart, tEnd);
            const aucBaseline = computeIntervalAUC(baseline.times, baseline.Ac_values, tStart, tEnd);
            
            if (aucBaseline > 0) {
                const diff = Math.abs(aucDisrupted - aucBaseline) / aucBaseline * 100;
                if (diff <= recoveryThreshold) {
                    metrics.recoveryTime = tEnd - disruptionTime;
                    break;
                }
            }
        }
    }
    
    return metrics;
}

// ============================================
// MONTE CARLO
// ============================================
function runMonteCarlo(baseParams, nSamples, opts = {}) {
    const {
        halfLifeMin, halfLifeMax,
        paramMode = 'A', tmax, tmaxBasis = 'ingestion', doseForm = 'IR', tLag = 0,
        rng = Math.random,
    } = opts;
    const results = [];

    for (let i = 0; i < nSamples; i++) {
        // Sample half-life uniformly across the provided range
        const halfLife = halfLifeMin + rng() * (halfLifeMax - halfLifeMin);
        const ke = Math.LN2 / halfLife;

        // Recompute ka only when it is derived from Tmax (Mode B); else keep base ka
        let ka = baseParams.ka;
        if (paramMode === 'B' && Number.isFinite(tmax)) {
            let tmaxAbs = tmax;
            if (tmaxBasis === 'ingestion' && doseForm === 'Delayed') {
                tmaxAbs = tmax - tLag;
            }
            if (tmaxAbs > 0) {
                const newKa = solveKaFromTmax(ke, tmaxAbs);
                if (newKa) ka = newKa;
            }
        }

        results.push(simulate({ ...baseParams, ka, ke }));
    }

    return results;
}

function computePercentileBands(mcResults, percentiles = [10, 50, 90]) {
    // Assume all results have same time points
    const times = mcResults[0].times;
    const bands = {};
    
    percentiles.forEach(p => {
        bands[p] = [];
    });
    
    for (let i = 0; i < times.length; i++) {
        const values = mcResults.map(r => r.Ac_values[i]).sort((a, b) => a - b);
        
        percentiles.forEach(p => {
            // const idx = Math.floor(p / 100 * values.length);
            // bands[p].push(values[Math.min(idx, values.length - 1)]);
            //sub
            const idx = Math.floor((p / 100) * (values.length - 1));
            bands[p].push(values[idx]);
        });
    }
    
    return { times, bands };
}

export {
    kaFromBucket, solveKaFromTmax, propagate, propagateSaturable, buildSchedule,
    buildBaselineSchedule, simulate, computeIntervalAUC, findIntervalExtrema,
    computeMetrics, computePercentileBands, runMonteCarlo
};
