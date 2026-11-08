// Work From Home Calculator engine. Pure: takes a plain scenario object,
// returns numbers. No DOM, no storage, no network.

import { RPP_PLACES } from './wfh-rpp-data.js';

export const ENGINE_VERSION = 2;

// 2026 federal income tax brackets (start of each bracket, in taxable income)
// and standard deductions, Rev. Proc. 2025-32 sections 4.01 and 4.14.
// Payroll tax from IRS Topic 751; Additional Medicare thresholds from the IRS
// Additional Medicare Tax questions and answers.
export const TAX_2026 = {
    brackets: {
        single: [[0, 0.10], [12400, 0.12], [50400, 0.22], [105700, 0.24], [201775, 0.32], [256225, 0.35], [640600, 0.37]],
        joint: [[0, 0.10], [24800, 0.12], [100800, 0.22], [211400, 0.24], [403550, 0.32], [512450, 0.35], [768700, 0.37]],
        head: [[0, 0.10], [17700, 0.12], [67450, 0.22], [105700, 0.24], [201750, 0.32], [256200, 0.35], [640600, 0.37]],
    },
    standardDeduction: { single: 16100, joint: 32200, head: 24150 },
    socialSecurityRate: 0.062,
    socialSecurityWageBase: 184500,
    medicareRate: 0.0145,
    additionalMedicareRate: 0.009,
    additionalMedicareThreshold: { single: 200000, joint: 250000, head: 200000 },
};

const STATE_CODES = new Set(RPP_PLACES.filter((r) => r[2] === 'state').map((r) => r[5][0]));

export const FILING_STATUSES = { single: 'Single', joint: 'Married filing jointly', head: 'Head of household' };

export const RPP_BY_FIPS = new Map(RPP_PLACES.map(([fips, name, kind, all, housing, states]) => [fips, { fips, name, kind, all, housing, states }]));

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

export function federalIncomeTax(taxable, status = 'single') {
    const table = TAX_2026.brackets[status] || TAX_2026.brackets.single;
    let tax = 0;
    for (let i = 0; i < table.length; i += 1) {
        const [start, rate] = table[i];
        const end = i + 1 < table.length ? table[i + 1][0] : Infinity;
        if (taxable > start) tax += (Math.min(taxable, end) - start) * rate;
    }
    return tax;
}

function filingStatus(person) {
    return TAX_2026.brackets[person && person.filingStatus] ? person.filingStatus : 'single';
}

// Tax on all income in the return, split by kind. Payroll tax is on wages
// before pre-tax deductions (true of 401(k) deferrals, not of health premiums).
export function taxParts(person, job, wages) {
    const status = filingStatus(person);
    const pretax = Math.max(0, num(job.pretaxDeductions));
    const other = Math.max(0, num(person && person.otherIncome));
    const w = Math.max(0, wages);
    const taxable = Math.max(0, w - pretax + other - TAX_2026.standardDeduction[status]);
    const federal = federalIncomeTax(taxable, status);
    const payroll = TAX_2026.socialSecurityRate * Math.min(w, TAX_2026.socialSecurityWageBase)
        + TAX_2026.medicareRate * w
        + TAX_2026.additionalMedicareRate * Math.max(0, w - TAX_2026.additionalMedicareThreshold[status]);
    const state = num(job.stateRatePct) / 100 * Math.max(0, w - pretax);
    return { federal, payroll, state };
}

// How a job's pay is taxed. In bracket mode tax(w) is the tax this job's wages
// add to the return, so differences between salaries are exact across every
// threshold. In flat mode it is the typed marginal rate times the change.
export function taxModel(person, job) {
    if (job.taxMode !== 'brackets') {
        const m = num(job.marginalRatePct) / 100;
        return { exact: false, tax: (w) => m * w, marginal: () => m, parts: null };
    }
    const sum = (p) => p.federal + p.payroll + p.state;
    const base = sum(taxParts(person, job, 0));
    const tax = (w) => sum(taxParts(person, job, w)) - base;
    const parts = (w) => {
        const a = taxParts(person, job, w);
        const b = taxParts(person, job, w + 1);
        return { federal: b.federal - a.federal, payroll: b.payroll - a.payroll, state: b.state - a.state };
    };
    return { exact: true, tax, marginal: (w) => tax(w + 1) - tax(w), parts };
}

// Wage levels between lo and hi where the rate on the next dollar changes.
export function taxThresholds(person, job, lo, hi) {
    if (job.taxMode !== 'brackets') return [];
    const status = filingStatus(person);
    const shift = TAX_2026.standardDeduction[status] + Math.max(0, num(job.pretaxDeductions)) - Math.max(0, num(person && person.otherIncome));
    const out = TAX_2026.brackets[status].slice(1).map(([start, rate]) => ({ wage: start + shift, label: `the ${Math.round(rate * 100)}% federal bracket` }));
    out.push({ wage: TAX_2026.socialSecurityWageBase, label: 'the Social Security wage base' });
    out.push({ wage: TAX_2026.additionalMedicareThreshold[status], label: 'the Additional Medicare threshold' });
    return out.filter((t) => t.wage > lo && t.wage < hi).sort((x, y) => x.wage - y.wage);
}

// Pre-tax raise that leaves `target` more after tax. Exact across brackets.
export function grossUp(model, salary, target) {
    if (!model.exact) {
        const m = model.marginal(salary);
        return m < 1 ? target / (1 - m) : null;
    }
    const kept = (r) => r - (model.tax(salary + r) - model.tax(salary));
    if (target === 0) return 0;
    let lo = 0;
    let hi = 0;
    if (target > 0) {
        hi = Math.max(1, target);
        while (kept(hi) < target && hi < 1e10) hi *= 2;
    } else {
        lo = -Math.max(1, -target);
        while (kept(lo) > target && lo > -salary) lo = Math.max(-salary, lo * 2);
        if (kept(lo) > target) return null;
    }
    for (let i = 0; i < 100; i += 1) {
        const mid = (lo + hi) / 2;
        if (kept(mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}

export function payFigures(job, person = {}) {
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
    const model = taxModel(person, job);
    const m = model.marginal(annual);
    const tax = model.exact ? model.tax(annual) : null;
    return {
        annual, hourly, hourlyNet: hourly * (1 - m), hoursPerYear, marginalRate: m,
        exactTax: model.exact, tax, net: tax === null ? null : annual - tax,
        rateParts: model.exact ? model.parts(annual) : null,
    };
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

// Workdays per week are the person's; days off belong to each job.
export function calendar(person, job = {}) {
    const perWeek = num(person.workDaysPerWeek) || 5;
    const days = Math.max(0, 52 * perWeek - num(job.daysOff));
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

// Spending up to the yearly cap comes out of pay before tax.
function pretaxSpend(spend, enabled) {
    if (!enabled || spend <= 0) return 0;
    return Math.min(spend, COMMUTER_BENEFIT_MONTHLY_CAP * 12);
}

// Full cost breakdown for one job at one pattern (office days per week).
export function evaluatePattern(scenario, job, daysPerWeek) {
    const person = scenario.person;
    const cal = calendar(person, job);
    const pay = payFigures(job, person);
    const model = taxModel(person, job);
    const d = dailyFigures(scenario, job);
    const officeDays = Math.min(cal.workingDays, Math.max(0, daysPerWeek) * cal.workingWeeks);
    const homeDays = cal.workingDays - officeDays;

    const transit = passChoice(d.transitPerDay, officeDays, num(job.transitPassMonthly));
    const parking = passChoice(num(job.parkingPerDay), officeDays, num(job.parkingPermitMonthly));
    const sheltered = pretaxSpend(transit.cost, job.transitPretax) + pretaxSpend(parking.cost, job.parkingPretax);
    const pretax = sheltered > 0 ? model.tax(pay.annual) - model.tax(pay.annual - sheltered) : 0;
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
    const cal = calendar(person, job);
    const pay = payFigures(job, person);
    const model = taxModel(person, job);
    const max = Math.round(cal.workDaysPerWeek);
    const patterns = [];
    for (let k = max; k >= 0; k -= 1) patterns.push(evaluatePattern(scenario, job, k));
    const full = patterns[0];
    const remote = patterns[patterns.length - 1];
    const policyDays = policyDaysPerWeek(job, cal);
    const policy = evaluatePattern(scenario, job, policyDays);
    const annotate = (p) => {
        const saving = full.total - p.total;
        const savingMoney = full.money - p.money;
        const raise = grossUp(model, pay.annual, saving);
        return {
            ...p,
            savingVsFull: saving,
            savingMoneyVsFull: savingMoney,
            equivalentRaise: raise,
            equivalentRaiseMoney: grossUp(model, pay.annual, savingMoney),
            equivalentRaisePct: pay.annual > 0 && raise !== null ? raise / pay.annual * 100 : null,
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
        rates: hourlyRates(job, cal, pay, policy),
        patterns: patterns.map(annotate),
        policy: annotate(policy),
        policyDays,
        officeDayCost,
        transitBreakEven: breakEvenDays(d.transitPerDay, num(job.transitPassMonthly), cal),
        parkingBreakEven: breakEvenDays(num(job.parkingPerDay), num(job.parkingPermitMonthly), cal),
    };
}

// Pay per hour actually worked: paid hours a week spread over workdays, times
// working days, so paid time off raises the rate. Counting commute adds the
// policy pattern's commute and prep hours as if they were work hours.
export function hourlyRates(job, cal, pay, policy) {
    const worked = num(job.hoursPerWeek) / cal.workDaysPerWeek * cal.workingDays;
    if (!(worked > 0) || !(pay.annual > 0)) return null;
    const withCommuteHours = worked + policy.hours;
    return {
        workedHours: worked,
        commuteHours: policy.hours,
        pure: pay.annual / worked,
        withCommute: pay.annual / withCommuteHours,
        takeHomeWithCommute: pay.net === null ? null : (pay.net - policy.money) / withCommuteHours,
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

// With both jobs in bracket mode each salary is taxed in full, so the gap
// is exact. Otherwise only the gap is taxed, at the higher-paid job's rate.
export function compareJobs(scenario) {
    const [a, b] = scenario.jobs;
    const ea = evaluateJob(scenario, a);
    const eb = evaluateJob(scenario, b);
    const exact = ea.pay.exactTax && eb.pay.exactTax;
    const payGap = eb.pay.annual - ea.pay.annual;
    const payGapNet = exact ? eb.pay.net - ea.pay.net : payGap * (1 - gapRate(ea.pay, eb.pay));
    const rate = exact ? (Math.abs(payGap) > 0.005 ? 1 - payGapNet / payGap : eb.pay.marginalRate) : gapRate(ea.pay, eb.pay);
    const higher = eb.pay.annual >= ea.pay.annual ? b : a;
    const thresholds = exact ? taxThresholds(scenario.person, higher, Math.min(ea.pay.annual, eb.pay.annual), Math.max(ea.pay.annual, eb.pay.annual)) : [];
    const otherGap = num(b.otherPayNet) - num(a.otherPayNet);
    const costGap = eb.policy.money - ea.policy.money;
    const timeGap = eb.policy.time - ea.policy.time;
    const differenceMoney = payGapNet + otherGap - costGap;
    return {
        a: ea,
        b: eb,
        exactTax: exact,
        gapRate: rate,
        thresholds,
        payGap, payGapNet, otherGap, costGap, timeGap,
        differenceMoney,
        difference: differenceMoney - timeGap,
        differenceHours: eb.policy.hours - ea.policy.hours,
        breakEven: breakEvenPay(scenario, a, b, ea, eb, true),
        breakEvenMoney: breakEvenPay(scenario, a, b, ea, eb, false),
        costOfLiving: costOfLiving(a, b, ea, eb),
    };
}

// Job B's money position restated in Job A's prices with BEA Regional Price
// Parities. Needs take-home pay, so both jobs must be in bracket mode.
export function costOfLiving(a, b, ea, eb) {
    const pa = RPP_BY_FIPS.get(a.placeFips);
    const pb = RPP_BY_FIPS.get(b.placeFips);
    if (!pa && !pb) return null;
    if (!pa || !pb) return { incomplete: true, placeA: pa || null, placeB: pb || null };
    if (!(ea.pay.exactTax && eb.pay.exactTax)) return { placeA: pa, placeB: pb, needsBrackets: true };
    const keptA = ea.pay.net + num(a.otherPayNet) - ea.policy.money;
    const keptB = eb.pay.net + num(b.otherPayNet) - eb.policy.money;
    const ratio = pa.all / pb.all;
    return { placeA: pa, placeB: pb, ratio, keptA, keptB, keptBInA: keptB * ratio, difference: keptB * ratio - keptA };
}

// Pay for job B that makes the difference zero, holding everything else.
// B's time value moves with B's pay, so the solve is linear in pay:
// (S - Sa)(1 - m) + otherGap - costGap - hours * (S * payFactor / H + c) + timeA = 0.
// The gap rate depends on which job pays more, so solve with B's rate and
// fall back to A's if the answer comes out below A's pay.
export function breakEvenPay(scenario, jobA, jobB, ea, eb, includeTime = true) {
    const H = eb.pay.hoursPerYear;
    if (!(H > 0)) return null;
    if (ea.pay.exactTax && eb.pay.exactTax) return breakEvenExact(scenario, jobA, jobB, ea, eb, includeTime);
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

// Bracket mode: the gap is not linear in pay, so bisect on B's salary,
// re-evaluating B's policy pattern each time (pre-tax savings and time value
// move with pay). Taxes only rise with pay, so the gap is increasing.
function breakEvenExact(scenario, jobA, jobB, ea, eb, includeTime) {
    const H = eb.pay.hoursPerYear;
    const otherGap = num(jobB.otherPayNet) - num(jobA.otherPayNet);
    const gap = (salary) => {
        const job = { ...jobB, payMode: 'salary', salary };
        const pb = evaluatePattern(scenario, job, eb.policyDays);
        const pay = payFigures(job, scenario.person);
        let d = pay.net - ea.pay.net + otherGap - (pb.money - ea.policy.money);
        if (includeTime) d -= pb.time - ea.policy.time;
        return d;
    };
    let lo = 0;
    let hi = Math.max(ea.pay.annual, 1000) * 2;
    if (gap(lo) >= 0) return null;
    while (gap(hi) < 0) {
        hi *= 2;
        if (hi > 1e9) return null;
    }
    for (let i = 0; i < 100; i += 1) {
        const mid = (lo + hi) / 2;
        if (gap(mid) < 0) lo = mid; else hi = mid;
    }
    const annual = (lo + hi) / 2;
    return { annual, hourly: annual / H };
}

// Hard errors stop the calculation; warnings are shown beside the inputs.
export function validate(scenario) {
    const errors = [];
    const warnings = [];
    const person = scenario.person || {};
    const week = calendar(person);
    const metric = scenario.units === 'metric';
    if (!(week.workDaysPerWeek >= 1 && week.workDaysPerWeek <= 7) || !Number.isInteger(week.workDaysPerWeek)) errors.push({ field: 'person.workDaysPerWeek', text: 'Workdays per week must be a whole number from 1 to 7.' });
    const pctTotal = HOURS_CATEGORIES.reduce((s, c) => s + num((person.hoursSplit || {})[c.key]), 0);
    if (pctTotal > 100.0001) errors.push({ field: 'person.hoursSplit', text: `The time split adds to ${round(pctTotal, 1)}%, over 100%.` });

    const jobs = scenario.compare ? scenario.jobs.slice(0, 2) : scenario.jobs.slice(0, 1);
    const negatives = findNegatives(scenario, jobs.length);
    if (negatives.length) warnings.push({ field: negatives[0], text: `${negatives.length === 1 ? 'One entry is' : `${negatives.length} entries are`} negative. Costs, distances and counts are expected to be zero or more; a saving belongs in the home side or as a stipend.` });
    jobs.forEach((job, i) => {
        const tag = jobs.length > 1 ? `${job.name || (i === 0 ? 'Job A' : 'Job B')}: ` : '';
        const p = `jobs.${i}.`;
        const cal = calendar(person, job);
        if (num(job.daysOff) < 0 || cal.workingDays <= 0) errors.push({ field: p + 'daysOff', text: `${tag}Days off leave no working days in the year.` });
        const rate = num(job.marginalRatePct);
        const brackets = job.taxMode === 'brackets';
        if (brackets && (num(job.stateRatePct) < 0 || num(job.stateRatePct) > 20)) errors.push({ field: p + 'stateRatePct', text: `${tag}State and local tax must be between 0 and 20%.` });
        if (brackets && num(job.pretaxDeductions) > 0 && num(job.pretaxDeductions) >= payFigures(job, person).annual) warnings.push({ field: p + 'pretaxDeductions', text: `${tag}Pre-tax deductions are as large as the pay. Check that they are yearly.` });
        if (!brackets && (rate < 0 || rate > 60)) errors.push({ field: p + 'marginalRatePct', text: `${tag}Marginal tax rate must be between 0 and 60%.` });
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
        if (paid && !brackets && !has(job.marginalRatePct)) warnings.push({ field: p + 'marginalRatePct', text: `${tag}No marginal tax rate entered, so the raise and the after-tax hourly rate assume no tax at all.` });
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
        // Days off moved from the person to each job in v1.3.0.
        if (raw.daysOff === undefined && input && input.person && has(input.person.daysOff)) j.daysOff = num(input.person.daysOff);
        // Files saved before bracket mode carried only a typed rate: keep it.
        if (raw.taxMode === undefined && has(raw.marginalRatePct)) j.taxMode = 'flat';
        j.taxMode = j.taxMode === 'flat' ? 'flat' : 'brackets';
        // Read raw: the blank template is '', which the cleaner treats as a number.
        j.placeFips = typeof raw.placeFips === 'string' && RPP_BY_FIPS.has(raw.placeFips) ? raw.placeFips : '';
        j.placeState = typeof raw.placeState === 'string' && STATE_CODES.has(raw.placeState) ? raw.placeState : '';
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
    s.person.filingStatus = FILING_STATUSES[s.person.filingStatus] ? s.person.filingStatus : 'single';
    s.person.timeValueMode = ['net', 'dot', 'gross', 'custom', 'none'].includes(s.person.timeValueMode) ? s.person.timeValueMode : 'net';
    s.compare = input && input.compare === true;
    return s;
}
