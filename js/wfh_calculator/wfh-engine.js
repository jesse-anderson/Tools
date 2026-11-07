// Work From Home Calculator engine. Pure: takes a plain scenario object,
// returns numbers. No DOM, no storage, no network.

export const ENGINE_VERSION = 1;

// Monthly cap on pre-tax transit and on pre-tax parking, 2026 (Rev. Proc. 2025-32).
export const COMMUTER_BENEFIT_MONTHLY_CAP = 340;

// US DOT values local personal travel time at 50% of the wage (2016 guidance).
export const DOT_TIME_SHARE = 0.5;

export const CATEGORIES = [
    { key: 'commute', label: 'Getting there' },
    { key: 'food', label: 'Food' },
    { key: 'care', label: 'Care and office extras' },
    { key: 'home', label: 'Home side' },
    { key: 'fixed', label: 'Car and fixed costs' },
    { key: 'time', label: 'Time value' },
];

export const LEG_MODES = {
    car_fuel: 'Car, fuel only',
    car_wear: 'Car, fuel and wear',
    car_rate: 'Car, all-in rate',
    ev: 'Electric car',
    transit: 'Transit',
    rideshare: 'Rideshare or taxi',
    active: 'Bike, scooter or walk',
};

export const HOURS_CATEGORIES = [
    { key: 'family', label: 'Family, partner and pets' },
    { key: 'sleep', label: 'Sleep' },
    { key: 'exercise', label: 'Exercise' },
    { key: 'chores', label: 'Chores and errands' },
    { key: 'work', label: 'More work' },
];

const num = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : 0;
};
const has = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(typeof v === 'number' ? v : parseFloat(v));

// Fuel or energy cost of one leg, before splitting with carpool riders.
export function legCost(leg, units = 'us') {
    const d = num(leg.distance);
    const metric = units === 'metric';
    let cost = 0;
    switch (leg.mode) {
        case 'car_fuel':
        case 'car_wear': {
            const eff = num(leg.efficiency);
            // US: miles / mpg * price per gallon. Metric: km * L/100 km / 100 * price per liter.
            if (eff > 0) cost = metric ? d * eff / 100 * num(leg.fuelPrice) : d / eff * num(leg.fuelPrice);
            if (leg.mode === 'car_wear') cost += d * num(leg.wearRate);
            break;
        }
        case 'car_rate':
            cost = d * num(leg.ratePerDistance);
            break;
        case 'ev': {
            const eff = num(leg.efficiency);
            // US: miles / (mi per kWh) * price. Metric: km * kWh/100 km / 100 * price.
            if (eff > 0) cost = metric ? d * eff / 100 * num(leg.energyPrice) : d / eff * num(leg.energyPrice);
            cost += d * num(leg.wearRate);
            break;
        }
        case 'transit':
            cost = num(leg.fare);
            break;
        case 'rideshare':
            cost = num(leg.fare) * (1 + num(leg.surgePct) / 100) * (1 + num(leg.tipPct) / 100);
            break;
        case 'active':
            cost = num(leg.costPerTrip);
            break;
        default:
            cost = 0;
    }
    const riders = Math.max(1, Math.floor(num(leg.riders) || 1));
    const isCar = leg.mode === 'car_fuel' || leg.mode === 'car_wear' || leg.mode === 'car_rate' || leg.mode === 'ev';
    return isCar ? cost / riders : cost;
}

// One trip (in or home): legs plus door to door minutes.
export function tripSummary(trip, units) {
    const legs = (trip && trip.legs) || [];
    let transit = 0;
    let other = 0;
    let distance = 0;
    for (const leg of legs) {
        const c = legCost(leg, units);
        if (leg.mode === 'transit') transit += c; else other += c;
        distance += num(leg.distance);
    }
    return { transit, other, distance, minutes: num(trip && trip.minutes) };
}

export function payFigures(job) {
    const hoursPerWeek = num(job.hoursPerWeek);
    const paidWeeks = num(job.paidWeeks);
    const hoursPerYear = hoursPerWeek * paidWeeks;
    let annual;
    let hourly;
    if (job.payMode === 'hourly') {
        hourly = num(job.hourly);
        annual = hourly * hoursPerYear;
    } else {
        annual = num(job.salary);
        hourly = hoursPerYear > 0 ? annual / hoursPerYear : 0;
    }
    const m = num(job.marginalRatePct) / 100;
    return { annual, hourly, hourlyNet: hourly * (1 - m), hoursPerYear, marginalRate: m };
}

// Dollars per hour of commute time, and how that rate scales with pay
// (needed to solve the break-even salary, which moves the rate with it).
export function timeRate(person, pay) {
    const mode = person.timeValueMode || 'net';
    switch (mode) {
        case 'net': return { rate: pay.hourlyNet, payFactor: 1 - pay.marginalRate, constant: 0 };
        case 'dot': return { rate: pay.hourly * DOT_TIME_SHARE, payFactor: DOT_TIME_SHARE, constant: 0 };
        case 'gross': return { rate: pay.hourly, payFactor: 1, constant: 0 };
        case 'custom': return { rate: num(person.customTimeRate), payFactor: 0, constant: num(person.customTimeRate) };
        default: return { rate: 0, payFactor: 0, constant: 0 };
    }
}

export function calendar(person) {
    const perWeek = num(person.workDaysPerWeek) || 5;
    const days = Math.max(0, 52 * perWeek - num(person.daysOff));
    return { workDaysPerWeek: perWeek, workingDays: days, workingWeeks: days / perWeek };
}

// Office days per week for a job's policy, from either a weekly or a monthly figure.
export function policyDaysPerWeek(job, cal) {
    if (job.policyMode === 'month') {
        return cal.workingWeeks > 0 ? num(job.officeDaysPerMonth) * 12 / cal.workingWeeks : 0;
    }
    return num(job.officeDaysPerWeek);
}

// Daily figures for a job that do not depend on the pattern.
export function dailyFigures(scenario, job) {
    const units = scenario.units || 'us';
    const person = scenario.person;
    const tin = tripSummary(job.tripIn, units);
    const tout = job.sameTripHome ? tin : tripSummary(job.tripHome, units);
    const transitPerDay = tin.transit + tout.transit;
    const otherTravelPerDay = tin.other + tout.other + num(job.tollsPerDay);
    const minutesPerDay = tin.minutes + tout.minutes + num(person.prepMinutes);
    const officeFood = num(job.officeLunch) + num(job.officeCoffee);
    const homeFood = num(person.homeLunch) + num(person.homeCoffee);
    const careLines = (person.careLines || []).reduce((s, l) => s + num(l.perOfficeDay), 0);
    const customOffice = (person.customLines || []).filter((l) => l.per === 'officeDay').reduce((s, l) => s + num(l.amount), 0);
    const customHome = (person.customLines || []).filter((l) => l.per === 'homeDay').reduce((s, l) => s + num(l.amount), 0);
    const customYear = (person.customLines || []).filter((l) => l.per === 'year').reduce((s, l) => s + num(l.amount), 0);
    const careExtrasPerOfficeDay = careLines + num(person.clothingPerOfficeDay) + num(person.socialPerOfficeDay)
        + num(job.extrasPerOfficeDay) + customOffice;
    const homePerHomeDay = num(person.homeEnergyPerDay) + customHome;
    return {
        tripIn: tin, tripHome: tout, transitPerDay, otherTravelPerDay, minutesPerDay,
        officeFood, homeFood, careExtrasPerOfficeDay, homePerHomeDay, customYear,
        distancePerDay: tin.distance + tout.distance,
    };
}

// Cheaper of per-day spending and a monthly pass or permit. Returns the yearly
// cost and which option won.
function passChoice(perDay, officeDays, monthly) {
    const daily = perDay * officeDays;
    if (!(monthly > 0) || officeDays <= 0) return { cost: daily, usesPass: false };
    const pass = monthly * 12;
    return pass < daily ? { cost: pass, usesPass: true } : { cost: daily, usesPass: false };
}

// Pre-tax payment saves the marginal rate on spending up to the yearly cap.
function pretaxSaving(spend, enabled, m) {
    if (!enabled || spend <= 0) return 0;
    return Math.min(spend, COMMUTER_BENEFIT_MONTHLY_CAP * 12) * m;
}

// Full cost breakdown for one job at one pattern (office days per week).
export function evaluatePattern(scenario, job, daysPerWeek) {
    const person = scenario.person;
    const cal = calendar(person);
    const pay = payFigures(job);
    const d = dailyFigures(scenario, job);
    const officeDays = Math.min(cal.workingDays, Math.max(0, daysPerWeek) * cal.workingWeeks);
    const homeDays = cal.workingDays - officeDays;
    const m = pay.marginalRate;

    const transit = passChoice(d.transitPerDay, officeDays, num(job.transitPassMonthly));
    const parking = passChoice(num(job.parkingPerDay), officeDays, num(job.parkingPermitMonthly));
    const pretax = pretaxSaving(transit.cost, job.transitPretax, m) + pretaxSaving(parking.cost, job.parkingPretax, m);
    const commute = d.otherTravelPerDay * officeDays + transit.cost + parking.cost - pretax;

    const food = d.officeFood * officeDays + d.homeFood * homeDays;
    const care = d.careExtrasPerOfficeDay * officeDays;

    const life = num(person.homeOfficeLifeYears);
    const homeOfficeYearly = homeDays > 0 && life > 0 ? num(person.homeOfficeCost) / life : 0;
    const cowork = Math.min(num(person.coworkDaysPerYear), homeDays) * num(person.coworkCostPerDay);
    const stipendApplies = daysPerWeek <= num(job.stipendMaxOfficeDays);
    const stipend = stipendApplies ? num(job.stipendPerMonth) * 12 : 0;
    const home = d.homePerHomeDay * homeDays + homeOfficeYearly + cowork - stipend;

    // A car dropped, or a low-mileage discount, applies at or below a number of office days.
    const carThreshold = num(person.carDropAtOrBelow);
    const carExtra = has(person.carDropSavingPerYear) && daysPerWeek > carThreshold ? num(person.carDropSavingPerYear) : 0;
    const insThreshold = num(person.insuranceDiscountAtOrBelow);
    const insExtra = has(person.insuranceDiscountPerYear) && daysPerWeek > insThreshold ? num(person.insuranceDiscountPerYear) : 0;
    const fixed = carExtra + insExtra + d.customYear;

    const hours = officeDays * d.minutesPerDay / 60;
    const tr = timeRate(person, pay);
    const time = hours * tr.rate;

    const money = commute + food + care + home + fixed;
    return {
        daysPerWeek, officeDays, homeDays,
        commute, food, care, home, fixed, time,
        money, total: money + time, hours,
        usesTransitPass: transit.usesPass, usesParkingPermit: parking.usesPass,
        pretaxSaving: pretax, stipend,
    };
}

// Days per week at which a monthly pass costs the same as paying per day.
export function breakEvenDays(perDay, monthly, cal) {
    if (!(perDay > 0) || !(monthly > 0) || !(cal.workingWeeks > 0)) return null;
    return monthly * 12 / (perDay * cal.workingWeeks);
}

// Patterns 0..workDaysPerWeek, plus the job's own policy, with deltas and the
// equivalent raise against full office.
export function evaluateJob(scenario, job) {
    const person = scenario.person;
    const cal = calendar(person);
    const pay = payFigures(job);
    const max = Math.round(cal.workDaysPerWeek);
    const patterns = [];
    for (let k = max; k >= 0; k -= 1) patterns.push(evaluatePattern(scenario, job, k));
    const full = patterns[0];
    const remote = patterns[patterns.length - 1];
    const policyDays = policyDaysPerWeek(job, cal);
    const policy = evaluatePattern(scenario, job, policyDays);
    const m = pay.marginalRate;
    const annotate = (p) => {
        const saving = full.total - p.total;
        const savingMoney = full.money - p.money;
        return {
            ...p,
            savingVsFull: saving,
            savingMoneyVsFull: savingMoney,
            equivalentRaise: m < 1 ? saving / (1 - m) : null,
            equivalentRaiseMoney: m < 1 ? savingMoney / (1 - m) : null,
            equivalentRaisePct: pay.annual > 0 && m < 1 ? saving / (1 - m) / pay.annual * 100 : null,
        };
    };
    const d = dailyFigures(scenario, job);
    const officeDayCost = full.officeDays > 0 ? {
        money: (full.money - remote.money) / full.officeDays,
        time: (full.time - remote.time) / full.officeDays,
        total: (full.total - remote.total) / full.officeDays,
    } : { money: 0, time: 0, total: 0 };
    return {
        pay, calendar: cal, daily: d,
        patterns: patterns.map(annotate),
        policy: annotate(policy),
        policyDays,
        officeDayCost,
        transitBreakEven: breakEvenDays(d.transitPerDay, num(job.transitPassMonthly), cal),
        parkingBreakEven: breakEvenDays(num(job.parkingPerDay), num(job.parkingPermitMonthly), cal),
    };
}

// Regained hours versus full office, split by the user's percentages.
export function hoursSplit(person, regainedHours) {
    const split = person.hoursSplit || {};
    const out = {};
    let assigned = 0;
    for (const c of HOURS_CATEGORIES) {
        const pct = num(split[c.key]);
        out[c.key] = regainedHours * pct / 100;
        assigned += pct;
    }
    out.unassigned = regainedHours * Math.max(0, 100 - assigned) / 100;
    out.familyValue = out.family * num(person.familyValuePerHour);
    return out;
}

// Two jobs compared as job B minus job A. Only the pay gap is taxed, at the
// marginal rate of the higher-paid job: applying a marginal rate to a whole
// salary overstates tax and skews the gap when the two rates differ.
function gapRate(payA, payB) {
    return payB.annual >= payA.annual ? payB.marginalRate : payA.marginalRate;
}

export function compareJobs(scenario) {
    const [a, b] = scenario.jobs;
    const ea = evaluateJob(scenario, a);
    const eb = evaluateJob(scenario, b);
    const rate = gapRate(ea.pay, eb.pay);
    const payGap = eb.pay.annual - ea.pay.annual;
    const payGapNet = payGap * (1 - rate);
    const otherGap = num(b.otherPayNet) - num(a.otherPayNet);
    const costGap = eb.policy.money - ea.policy.money;
    const timeGap = eb.policy.time - ea.policy.time;
    const differenceMoney = payGapNet + otherGap - costGap;
    return {
        a: ea,
        b: eb,
        gapRate: rate,
        payGap, payGapNet, otherGap, costGap, timeGap,
        differenceMoney,
        difference: differenceMoney - timeGap,
        differenceHours: eb.policy.hours - ea.policy.hours,
        breakEven: breakEvenPay(scenario, a, b, ea, eb, true),
        breakEvenMoney: breakEvenPay(scenario, a, b, ea, eb, false),
    };
}

// Pay for job B that makes the difference zero, holding everything else.
// B's time value moves with B's pay, so the solve is linear in pay:
// (S - Sa)(1 - m) + otherGap - costGap - hours * (S * payFactor / H + c) + timeA = 0.
// The gap rate depends on which job pays more, so solve with B's rate and
// fall back to A's if the answer comes out below A's pay.
export function breakEvenPay(scenario, jobA, jobB, ea, eb, includeTime = true) {
    const H = eb.pay.hoursPerYear;
    if (!(H > 0)) return null;
    const tr = timeRate(scenario.person, eb.pay);
    const hours = includeTime ? eb.policy.hours : 0;
    const timeA = includeTime ? ea.policy.time : 0;
    const otherGap = num(jobB.otherPayNet) - num(jobA.otherPayNet);
    const costGap = eb.policy.money - ea.policy.money;
    const solve = (m) => {
        const slope = (1 - m) - hours * tr.payFactor / H;
        if (!(slope > 0)) return null;
        return (ea.pay.annual * (1 - m) - otherGap + costGap + hours * tr.constant - timeA) / slope;
    };
    let annual = solve(eb.pay.marginalRate);
    if (annual !== null && annual < ea.pay.annual) annual = solve(ea.pay.marginalRate);
    if (annual === null || !Number.isFinite(annual)) return null;
    return { annual, hourly: annual / H };
}

// Hard errors stop the calculation; warnings are shown beside the inputs.
export function validate(scenario) {
    const errors = [];
    const warnings = [];
    const person = scenario.person || {};
    const cal = calendar(person);
    const metric = scenario.units === 'metric';
    if (!(cal.workDaysPerWeek >= 1 && cal.workDaysPerWeek <= 7) || !Number.isInteger(cal.workDaysPerWeek)) errors.push({ field: 'person.workDaysPerWeek', text: 'Workdays per week must be a whole number from 1 to 7.' });
    if (num(person.daysOff) < 0 || cal.workingDays <= 0) errors.push({ field: 'person.daysOff', text: 'Days off leave no working days in the year.' });
    const pctTotal = HOURS_CATEGORIES.reduce((s, c) => s + num((person.hoursSplit || {})[c.key]), 0);
    if (pctTotal > 100.0001) errors.push({ field: 'person.hoursSplit', text: `The time split adds to ${round(pctTotal, 1)}%, over 100%.` });

    const jobs = scenario.compare ? scenario.jobs.slice(0, 2) : scenario.jobs.slice(0, 1);
    const negatives = findNegatives(scenario, jobs.length);
    if (negatives.length) warnings.push({ field: negatives[0], text: `${negatives.length === 1 ? 'One entry is' : `${negatives.length} entries are`} negative. Costs, distances and counts are expected to be zero or more; a saving belongs in the home side or as a stipend.` });
    jobs.forEach((job, i) => {
        const tag = jobs.length > 1 ? `${job.name || (i === 0 ? 'Job A' : 'Job B')}: ` : '';
        const p = `jobs.${i}.`;
        const rate = num(job.marginalRatePct);
        if (rate < 0 || rate > 60) errors.push({ field: p + 'marginalRatePct', text: `${tag}Marginal tax rate must be between 0 and 60%.` });
        if (num(job.paidWeeks) > 52 || num(job.paidWeeks) < 0) errors.push({ field: p + 'paidWeeks', text: `${tag}Paid weeks must be between 0 and 52.` });
        if (num(job.hoursPerWeek) > 100 || num(job.hoursPerWeek) < 0) errors.push({ field: p + 'hoursPerWeek', text: `${tag}Hours per week must be between 0 and 100.` });
        const pd = policyDaysPerWeek(job, cal);
        if (pd < 0 || pd > cal.workDaysPerWeek + 1e-9) errors.push({ field: p + (job.policyMode === 'month' ? 'officeDaysPerMonth' : 'officeDaysPerWeek'), text: `${tag}More office days than working days.` });

        const trips = [['tripIn', 'in'], ...(job.sameTripHome ? [] : [['tripHome', 'home']])];
        for (const [key, word] of trips) {
            const t = tripSummary(job[key], scenario.units);
            if (t.distance > 0 && t.minutes > 0) {
                const speed = t.distance / (t.minutes / 60);
                const lo = metric ? 5 : 3;
                const hi = metric ? 130 : 80;
                const unit = metric ? 'km/h' : 'mph';
                if (speed < lo || speed > hi) warnings.push({ field: `${p}${key}.minutes`, text: `${tag}The trip ${word} averages ${round(speed, 1)} ${unit}. Check the distance and the minutes.` });
            }
        }
        const d = dailyFigures(scenario, job);
        const pass = num(job.transitPassMonthly);
        const legs = [...((job.tripIn && job.tripIn.legs) || []), ...(job.sameTripHome ? [] : ((job.tripHome && job.tripHome.legs) || []))];
        const fares = legs.filter((l) => l.mode === 'transit').map((l) => num(l.fare)).filter((f) => f > 0);
        if (pass > 0 && fares.length && pass < 2 * Math.min(...fares)) warnings.push({ field: p + 'transitPassMonthly', text: `${tag}The monthly pass costs less than two rides. Check that it is a monthly price.` });
        if (pass > 0 && d.transitPerDay <= 0) warnings.push({ field: p + 'transitPassMonthly', text: `${tag}A pass is entered but no transit leg has a fare, so the pass is never used.` });
        const allIn = legs.some((l) => l.mode === 'car_rate');
        if (allIn && num(person.carDropSavingPerYear) > 0) warnings.push({ field: 'person.carDropSavingPerYear', text: `${tag}An all-in rate per mile already includes depreciation and insurance. Counting a dropped car as well counts them twice.` });
        const paid = job.payMode === 'hourly' ? num(job.hourly) > 0 : num(job.salary) > 0;
        if (paid && !has(job.marginalRatePct)) warnings.push({ field: p + 'marginalRatePct', text: `${tag}No marginal tax rate entered, so the raise and the after-tax hourly rate assume no tax at all.` });
        if (job.payMode === 'salary' && num(job.salary) > 0 && !(num(job.hoursPerWeek) > 0 && num(job.paidWeeks) > 0)) warnings.push({ field: p + 'hoursPerWeek', text: `${tag}Hours per week and paid weeks are needed to turn salary into an hourly rate.` });
    });
    return { errors, warnings };
}

// Paths of numeric inputs below zero. Other pay and custom lines may be negative.
function findNegatives(scenario, jobCount) {
    const out = [];
    const walk = (obj, path) => {
        for (const [k, v] of Object.entries(obj || {})) {
            if (k === 'otherPayNet' || k === 'customLines') continue;
            const here = path ? `${path}.${k}` : k;
            if (v && typeof v === 'object') walk(v, here);
            else if (typeof v === 'number' && v < 0) out.push(here);
        }
    };
    walk(scenario.person, 'person');
    for (let i = 0; i < jobCount; i += 1) walk(scenario.jobs[i], `jobs.${i}`);
    return out;
}

export function round(x, dp = 2) {
    const f = 10 ** dp;
    return Math.round(x * f) / f;
}

// Everything the page shows, in one call.
export function calculate(scenario) {
    const check = validate(scenario);
    if (check.errors.length) return { ok: false, ...check };
    const single = evaluateJob(scenario, scenario.jobs[0]);
    const full = single.patterns[0];
    const regained = full.hours - single.policy.hours;
    const result = {
        ok: true,
        ...check,
        single,
        hours: { fullOffice: full.hours, policy: single.policy.hours, regained, split: hoursSplit(scenario.person, regained) },
    };
    if (scenario.compare && scenario.jobs[1]) result.comparison = compareJobs(scenario);
    return result;
}

// CSV of the pattern table. Text cells are guarded against spreadsheet formulas.
export function patternsCsv(evaluated, currency = '$') {
    const head = ['Office days per week', 'Office days per year', 'Home days per year',
        ...CATEGORIES.map((c) => `${c.label} (${currency})`), `Money total (${currency})`, `Total with time (${currency})`,
        'Commute hours per year', `Saving vs full office (${currency})`, `Equivalent pre-tax raise (${currency})`];
    const rows = evaluated.patterns.map((p) => [p.daysPerWeek, round(p.officeDays, 1), round(p.homeDays, 1),
        ...CATEGORIES.map((c) => round(p[c.key])), round(p.money), round(p.total), round(p.hours, 1),
        round(p.savingVsFull), p.equivalentRaise === null ? '' : round(p.equivalentRaise)]);
    return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function csvCell(v) {
    if (typeof v === 'number') return String(v);
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Unit switch. Converts every distance, efficiency and per-distance price so
// a scenario means the same trip in either system.
export const MILE_KM = 1.609344;
export const GALLON_L = 3.785411784;

export function convertLeg(leg, to) {
    const out = { ...leg };
    const toMetric = to === 'metric';
    const n = (v) => (v === '' || v === null || v === undefined || !Number.isFinite(parseFloat(v)) ? null : parseFloat(v));
    const set = (key, fn) => { const v = n(leg[key]); if (v !== null) out[key] = round(fn(v), 6); };
    set('distance', (v) => (toMetric ? v * MILE_KM : v / MILE_KM));
    set('wearRate', (v) => (toMetric ? v / MILE_KM : v * MILE_KM));
    set('ratePerDistance', (v) => (toMetric ? v / MILE_KM : v * MILE_KM));
    if (leg.mode === 'car_fuel' || leg.mode === 'car_wear') {
        // mpg and L/100 km convert through the same reciprocal both ways.
        set('efficiency', (v) => (v > 0 ? 100 * GALLON_L / (v * MILE_KM) : v));
        set('fuelPrice', (v) => (toMetric ? v / GALLON_L : v * GALLON_L));
    }
    if (leg.mode === 'ev') {
        // mi per kWh and kWh per 100 km, also reciprocal both ways.
        set('efficiency', (v) => (v > 0 ? 100 / (v * MILE_KM) : v));
    }
    return out;
}

export function convertScenarioUnits(scenario, to) {
    if ((scenario.units || 'us') === to) return scenario;
    const s = structuredClone(scenario);
    s.units = to;
    for (const job of s.jobs) {
        for (const key of ['tripIn', 'tripHome']) {
            if (job[key] && Array.isArray(job[key].legs)) job[key].legs = job[key].legs.map((l) => convertLeg(l, to));
        }
    }
    return s;
}

// Imported files are untrusted: keep only known keys of known types.
export function sanitizeScenario(input, blank) {
    const clean = (template, value) => {
        if (Array.isArray(template)) return value;
        if (template && typeof template === 'object') {
            const out = {};
            for (const k of Object.keys(template)) {
                const v = value && typeof value === 'object' ? value[k] : undefined;
                out[k] = v === undefined ? template[k] : clean(template[k], v);
            }
            return out;
        }
        if (typeof template === 'boolean') return value === true;
        if (typeof template === 'number' || template === '') {
            if (value === '' || value === null) return '';
            const x = typeof value === 'number' ? value : parseFloat(value);
            return Number.isFinite(x) ? x : template;
        }
        return typeof value === 'string' ? value.slice(0, 80) : template;
    };
    const s = clean(blank, input || {});
    s.units = s.units === 'metric' ? 'metric' : 'us';
    s.currency = String(s.currency || '$').slice(0, 4);
    const legTemplate = blank.jobs[0].tripIn.legs[0];
    const cleanLegs = (legs) => {
        const arr = (Array.isArray(legs) ? legs : []).slice(0, 6).map((l) => {
            const c = clean(legTemplate, l);
            c.mode = LEG_MODES[l && l.mode] ? l.mode : 'car_fuel';
            return c;
        });
        return arr.length ? arr : [{ ...legTemplate }];
    };
    s.jobs = [0, 1].map((i) => {
        const raw = (input && Array.isArray(input.jobs) && input.jobs[i]) || {};
        const j = clean(blank.jobs[i], raw);
        j.tripIn.legs = cleanLegs(raw.tripIn && raw.tripIn.legs);
        j.tripHome.legs = cleanLegs(raw.tripHome && raw.tripHome.legs);
        j.payMode = j.payMode === 'hourly' ? 'hourly' : 'salary';
        j.policyMode = j.policyMode === 'month' ? 'month' : 'week';
        return j;
    });
    const p = (input && input.person) || {};
    const lines = (arr, keys) => (Array.isArray(arr) ? arr : []).slice(0, 20).map((l) => {
        const o = {};
        for (const [k, kind] of keys) {
            const v = l && l[k];
            o[k] = kind === 'text' ? String(v ?? '').slice(0, 60) : (Number.isFinite(parseFloat(v)) ? parseFloat(v) : '');
        }
        return o;
    });
    s.person.careLines = lines(p.careLines, [['label', 'text'], ['perOfficeDay', 'num']]);
    s.person.customLines = lines(p.customLines, [['label', 'text'], ['amount', 'num']]).map((l, i) => ({
        ...l, per: ['officeDay', 'homeDay', 'year'].includes(p.customLines[i] && p.customLines[i].per) ? p.customLines[i].per : 'officeDay',
    }));
    s.person.timeValueMode = ['net', 'dot', 'gross', 'custom', 'none'].includes(s.person.timeValueMode) ? s.person.timeValueMode : 'net';
    s.compare = input && input.compare === true;
    return s;
}
