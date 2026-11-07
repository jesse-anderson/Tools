// Published figures the page offers as fill-in buttons, the blank scenario,
// and the illustrative examples. Every borrowed number names its source.

export const SOURCES = {
    irsJan2026: {
        value: 0.725,
        label: 'IRS business rate, Jan 1 to Jun 30, 2026',
        cite: 'IRS news release IR-2025-128 (Dec 29, 2025): 72.5 cents per mile.',
        url: 'https://www.irs.gov/newsroom/irs-sets-2026-business-standard-mileage-rate-at-725-cents-per-mile-up-25-cents',
    },
    irsJul2026: {
        value: 0.76,
        label: 'IRS business rate, from Jul 1, 2026',
        cite: 'IRS Announcement 2026-11, Internal Revenue Bulletin 2026-29: 76 cents per mile from July 1, 2026 (as reported by KPMG and the Journal of Accountancy).',
        url: 'https://www.journalofaccountancy.com/news/2026/jul/irs-raises-standard-mileage-rates-for-remainder-of-2026/',
    },
    aaaAllIn15k: {
        value: 0.77,
        label: 'AAA all-in, new car, 15,000 mi a year',
        cite: 'AAA, Your Driving Costs 2025 fact sheet: 77 cents per mile at 15,000 miles a year, including depreciation, finance, insurance and fees.',
        url: 'https://newsroom.aaa.com/wp-content/uploads/2025/09/UPDATE-AAA-Fact-Sheet-Your-Driving-Cost-9.2025-1.pdf',
    },
    aaaWear: {
        value: 0.1104,
        label: 'AAA maintenance, repair and tires',
        cite: 'AAA, Your Driving Costs 2025 fact sheet: 11.04 cents per mile, averaged over five years and 75,000 miles of a new car.',
        url: 'https://newsroom.aaa.com/wp-content/uploads/2025/09/UPDATE-AAA-Fact-Sheet-Your-Driving-Cost-9.2025-1.pdf',
    },
    aaaGas: {
        value: 3.151,
        label: 'AAA average regular gas, year to May 2025',
        cite: 'AAA, Your Driving Costs 2025 fact sheet: regular gas averaged $3.151 a gallon over the 12 months ending May 2025.',
        url: 'https://newsroom.aaa.com/wp-content/uploads/2025/09/UPDATE-AAA-Fact-Sheet-Your-Driving-Cost-9.2025-1.pdf',
    },
    aaaKwh: {
        value: 0.167,
        label: 'AAA EV charging rate',
        cite: 'AAA, Your Driving Costs 2025 fact sheet: electric vehicle charging at 16.7 cents per kWh.',
        url: 'https://newsroom.aaa.com/wp-content/uploads/2025/09/UPDATE-AAA-Fact-Sheet-Your-Driving-Cost-9.2025-1.pdf',
    },
    censusCommute: {
        value: 26.4,
        label: 'US average one-way commute, 2022',
        cite: 'US Census Bureau, 2022 American Community Survey: average one-way commute of 26.4 minutes among people who traveled to a workplace.',
        url: 'https://census.gov/newsroom/press-releases/2024/travel-to-work-since-pandemic.html',
    },
};

// The figures quoted on the page as context, never used in the totals.
export const CONTEXT = {
    valuation: 'Surveys put what workers say working from home two or three days a week is worth at about 8% of pay in the US (Barrero et al., 2021) and about 5% across 27 countries (Aksoy et al., 2022). Both as summarized in Buckman, Barrero, Bloom and Davis, "Measuring Work from Home" (2025).',
    grooming: 'Davis (Boston Fed, 2022) puts the average time saved on a home day at 65 minutes, counting commuting and less time getting ready.',
    tax: 'IRS Publication 463 (2025): travel between home and your main or regular place of work is a personal commuting expense. Publication 587 (2025), Figure A: using part of your home as an employee leads to no deduction.',
    benefit: 'Rev. Proc. 2025-32: for 2026, up to $340 a month for transit and vanpool, and separately up to $340 a month for parking, can be paid from pre-tax pay through an employer plan.',
};

export function blankLeg(mode = 'car_fuel') {
    return {
        mode, distance: '', efficiency: '', fuelPrice: '', wearRate: '', ratePerDistance: '',
        energyPrice: '', riders: '', fare: '', tipPct: '', surgePct: '', costPerTrip: '',
    };
}

export function blankJob(name) {
    return {
        name,
        payMode: 'salary', salary: '', hourly: '', hoursPerWeek: '', paidWeeks: '',
        marginalRatePct: '', otherPayNet: '',
        policyMode: 'week', officeDaysPerWeek: '', officeDaysPerMonth: '',
        tripIn: { minutes: '', legs: [blankLeg()] },
        sameTripHome: true,
        tripHome: { minutes: '', legs: [blankLeg()] },
        tollsPerDay: '', parkingPerDay: '', parkingPermitMonthly: '', parkingPretax: false,
        transitPassMonthly: '', transitPretax: false,
        officeLunch: '', officeCoffee: '', extrasPerOfficeDay: '',
        stipendPerMonth: '', stipendMaxOfficeDays: '',
    };
}

export function blankScenario() {
    return {
        version: 1,
        units: 'us',
        currency: '$',
        compare: false,
        person: {
            workDaysPerWeek: 5, daysOff: '',
            timeValueMode: 'net', customTimeRate: '', prepMinutes: '',
            homeLunch: '', homeCoffee: '', homeEnergyPerDay: '',
            coworkDaysPerYear: '', coworkCostPerDay: '',
            homeOfficeCost: '', homeOfficeLifeYears: '',
            clothingPerOfficeDay: '', socialPerOfficeDay: '',
            careLines: [],
            customLines: [],
            carDropSavingPerYear: '', carDropAtOrBelow: '',
            insuranceDiscountPerYear: '', insuranceDiscountAtOrBelow: '',
            hoursSplit: { family: '', sleep: '', exercise: '', chores: '', work: '' },
            familyValuePerHour: '',
        },
        jobs: [blankJob('Job A'), blankJob('Job B')],
    };
}

function scenario(fn) {
    const s = blankScenario();
    fn(s);
    return s;
}

function driverLeg(miles) {
    return { ...blankLeg('car_wear'), distance: miles, efficiency: 28, fuelPrice: SOURCES.aaaGas.value, wearRate: SOURCES.aaaWear.value };
}

function basePerson(p) {
    Object.assign(p, {
        daysOff: 25, prepMinutes: 15,
        homeLunch: 4, homeCoffee: 0.5, homeEnergyPerDay: 1,
        clothingPerOfficeDay: 2, socialPerOfficeDay: 3,
        hoursSplit: { family: 50, sleep: 20, exercise: 15, chores: 15, work: '' },
    });
}

function basePay(j, salary) {
    Object.assign(j, { salary, hoursPerWeek: 40, paidWeeks: 52, marginalRatePct: 30 });
}

// Salaries, fares and food prices here are made up. Commute time, gas price
// and wear come from the sources above and say so on the page.
export const EXAMPLES = [
    {
        id: 'driver',
        title: 'Driver, suburb to office',
        note: 'Made-up pay and food prices. 26.4 minutes each way is the 2022 Census average; gas and wear are AAA 2025 figures.',
        build: () => scenario((s) => {
            basePerson(s.person);
            const j = s.jobs[0];
            basePay(j, 72000);
            Object.assign(j, { officeDaysPerWeek: 3, officeLunch: 14, officeCoffee: 4, parkingPerDay: 0 });
            j.tripIn = { minutes: SOURCES.censusCommute.value, legs: [driverLeg(15)] };
        }),
    },
    {
        id: 'transit',
        title: 'Transit rider with a monthly pass',
        note: 'Made-up pay, fares and pass price. Shows where the pass stops paying off.',
        build: () => scenario((s) => {
            basePerson(s.person);
            const j = s.jobs[0];
            basePay(j, 85000);
            Object.assign(j, { officeDaysPerWeek: 3, officeLunch: 15, officeCoffee: 5, transitPassMonthly: 90, transitPretax: true });
            j.tripIn = { minutes: 45, legs: [{ ...blankLeg('transit'), distance: 9, fare: 2.9 }] };
        }),
    },
    {
        id: 'mixed',
        title: 'Transit in, rideshare home',
        note: 'Made-up pay and fares. The trip home differs from the trip in.',
        build: () => scenario((s) => {
            basePerson(s.person);
            const j = s.jobs[0];
            basePay(j, 78000);
            Object.assign(j, { officeDaysPerWeek: 2, officeLunch: 14, officeCoffee: 4, sameTripHome: false });
            j.tripIn = { minutes: 40, legs: [{ ...blankLeg('transit'), distance: 8, fare: 2.9 }] };
            j.tripHome = { minutes: 25, legs: [{ ...blankLeg('rideshare'), distance: 8, fare: 24, tipPct: 15 }] };
        }),
    },
    {
        id: 'parent',
        title: 'Parent with after-school care',
        note: 'Made-up pay and care prices. Care is needed only on office days.',
        build: () => scenario((s) => {
            basePerson(s.person);
            s.person.careLines = [
                { label: 'After-school care', perOfficeDay: 25 },
                { label: 'Dog walker', perOfficeDay: 20 },
            ];
            const j = s.jobs[0];
            basePay(j, 90000);
            Object.assign(j, { officeDaysPerWeek: 4, officeLunch: 14, officeCoffee: 4, parkingPerDay: 12, parkingPermitMonthly: 180 });
            j.tripIn = { minutes: 35, legs: [driverLeg(18)] };
        }),
    },
    {
        id: 'offers',
        title: 'Two offers: remote against hybrid',
        note: 'Made-up salaries and prices. Job B pays more but needs three office days.',
        build: () => scenario((s) => {
            basePerson(s.person);
            s.compare = true;
            const [a, b] = s.jobs;
            basePay(a, 95000);
            Object.assign(a, { name: 'Remote offer', officeDaysPerWeek: 0, stipendPerMonth: 50, stipendMaxOfficeDays: 0 });
            basePay(b, 105000);
            Object.assign(b, { name: 'Hybrid offer', officeDaysPerWeek: 3, officeLunch: 15, officeCoffee: 5, parkingPerDay: 15 });
            b.tripIn = { minutes: 40, legs: [driverLeg(22)] };
        }),
    },
];
