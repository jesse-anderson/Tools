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

// Reference figures shown in the info popovers beside a field. Never filled in
// or used in the totals; each popover names its sources.
const BLS_DAYS = {
    label: 'BLS, average sick and vacation days by length of service, private industry, March 2026',
    url: 'https://www.bls.gov/charts/employee-benefits/paid-leave-sick-vacation-days-by-service-requirement.htm',
};
const BLS_HOLIDAYS = {
    label: 'BLS, The Economics Daily (2026): 8 paid holidays on average in 2025, private industry',
    url: 'https://www.bls.gov/opub/ted/2026/paid-sick-leave-was-available-to-80-percent-of-private-industry-workers-in-2025.htm',
};
const BLS_ACCESS = {
    label: 'BLS, Employee Benefits in the United States, March 2026 (released Sep 25, 2026)',
    url: 'https://www.bls.gov/news.release/ebs2.nr0.htm',
};

export const REFERENCE = {
    daysOff: {
        title: 'US paid leave, for comparison',
        blocks: [
            { p: 'Private-industry averages, counted among workers who get each kind of leave:' },
            {
                head: ['Leave', 'Days a year'],
                rows: [
                    ['Paid holidays', '8'],
                    ['Vacation, after 1 year', '11'],
                    ['Vacation, after 5 years', '16'],
                    ['Vacation, after 10 years', '18'],
                    ['Vacation, after 20 years', '20'],
                    ['Sick leave, any length of service', '7'],
                ],
            },
            { p: 'Federal employees get 11 legal public holidays. About 1 in 5 private-industry workers gets no paid vacation, and about 1 in 5 no paid sick leave.' },
            { p: 'Count the sick days you expect to take, not the days offered. For example, 8 holidays + 11 vacation days + 3 sick days = 22.' },
        ],
        sources: [
            BLS_DAYS,
            BLS_HOLIDAYS,
            BLS_ACCESS,
            { label: '5 U.S.C. 6103, legal public holidays', url: 'https://www.law.cornell.edu/uscode/text/5/6103' },
        ],
    },
    marginalRate: {
        title: '2026 US federal income tax brackets',
        blocks: [
            { p: 'With 2026 US brackets chosen, the tool works this out from these figures. A bracket applies to taxable income: pay after pre-tax deductions and the standard deduction of $16,100 (single), $24,150 (head of household) or $32,200 (married filing jointly). Each rate applies to taxable income above the amount shown.' },
            {
                head: ['Rate', 'Single', 'Married, joint'],
                rows: [
                    ['10%', '$0', '$0'],
                    ['12%', '$12,400', '$24,800'],
                    ['22%', '$50,400', '$100,800'],
                    ['24%', '$105,700', '$211,400'],
                    ['32%', '$201,775', '$403,550'],
                    ['35%', '$256,225', '$512,450'],
                    ['37%', '$640,600', '$768,700'],
                ],
            },
            { p: 'Payroll tax adds 6.2% Social Security on wages up to $184,500, 1.45% Medicare, and another 0.9% Medicare on wages over $200,000 ($250,000 married filing jointly). Then add your state and local income tax rate, if you have one.' },
            { p: 'For example, single on a $72,000 salary with no pre-tax deductions: $55,900 of taxable income is in the 22% bracket, plus 7.65% payroll tax, makes 29.65% before state tax.' },
        ],
        sources: [
            { label: 'IRS Rev. Proc. 2025-32, sections 4.01 and 4.14 (2026 brackets and standard deduction)', url: 'https://www.irs.gov/pub/irs-drop/rp-25-32.pdf' },
            { label: 'IRS Topic 751, Social Security and Medicare withholding rates', url: 'https://www.irs.gov/taxtopics/tc751' },
            { label: 'IRS, Questions and answers for the Additional Medicare Tax', url: 'https://www.irs.gov/businesses/small-businesses-self-employed/questions-and-answers-for-the-additional-medicare-tax' },
        ],
    },
    paidWeeks: {
        title: 'Paid weeks per year',
        blocks: [
            { p: 'Paid weeks turn a salary into an hourly rate. Paid vacation, holidays and sick days are still paid weeks, so with paid leave the answer is 52.' },
            { p: 'Subtract only time off that is not paid. With no paid leave, taking the private-industry averages of 8 holidays and 11 vacation days unpaid is 19 days, about 4 weeks at 5 days a week, so 48.' },
            { p: 'There is no published US average for paid weeks. In March 2026, 80% of private-industry workers had paid vacation and 81% had paid holidays.' },
        ],
        sources: [BLS_ACCESS, BLS_HOLIDAYS, BLS_DAYS],
    },
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
        taxMode: 'brackets', stateRatePct: '', pretaxDeductions: '', marginalRatePct: '',
        otherPayNet: '', placeFips: '',
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
        version: 2,
        units: 'us',
        currency: '$',
        compare: false,
        person: {
            workDaysPerWeek: 5, daysOff: '',
            filingStatus: 'single', otherIncome: '',
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

// 2026 brackets, single, with a made-up 5% state rate.
function basePay(j, salary) {
    Object.assign(j, { salary, hoursPerWeek: 40, paidWeeks: 52, taxMode: 'brackets', stateRatePct: 5 });
}

// Salaries, fares and food prices here are made up. Commute time, gas price
// and wear come from the sources above and say so on the page.
export const EXAMPLES = [
    {
        id: 'driver',
        title: 'Driver, suburb to office',
        note: 'Made-up pay and food prices. 26.4 minutes each way is the 2022 Census average; gas and wear are AAA 2025 figures. State tax is a made-up 5%.',
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
        title: 'Transit with a monthly pass',
        note: 'Made-up pay, fares and pass price. Shows where the pass stops paying off. State tax is a made-up 5%.',
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
        note: 'Made-up pay and fares. The trip home differs from the trip in. State tax is a made-up 5%.',
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
        note: 'Made-up pay and care prices. Care is needed only on office days. State tax is a made-up 5%.',
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
        title: 'Two offers: remote or hybrid',
        note: 'Made-up salaries, prices and 5% state tax. Job B pays more but needs three office days in Chicago; the remote offer is worked from Indianapolis.',
        build: () => scenario((s) => {
            basePerson(s.person);
            s.compare = true;
            const [a, b] = s.jobs;
            basePay(a, 95000);
            Object.assign(a, { name: 'Remote offer', officeDaysPerWeek: 0, stipendPerMonth: 50, stipendMaxOfficeDays: 0, placeFips: '26900' });
            basePay(b, 105000);
            Object.assign(b, { name: 'Hybrid offer', officeDaysPerWeek: 3, officeLunch: 15, officeCoffee: 5, parkingPerDay: 15, placeFips: '16980' });
            b.tripIn = { minutes: 40, legs: [driverLeg(22)] };
        }),
    },
];
