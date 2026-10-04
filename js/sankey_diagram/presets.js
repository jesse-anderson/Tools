// Worked examples. Each one is here to show a single thing.

export const PRESETS = Object.freeze([
    {
        id: 'evaporator',
        label: 'Evaporator train (balance closes)',
        title: 'Two-effect evaporator, mass basis',
        unit: 'kg/h',
        // Every unit passes on exactly what it receives.
        text: [
            '// Source [amount] Target',
            'Dilute feed [1000] Effect 1',
            'Effect 1 [380] Vapor 1',
            'Effect 1 [620] Effect 2',
            'Effect 2 [370] Vapor 2',
            'Effect 2 [250] Concentrate',
            'Vapor 1 [380] Condensate',
            'Vapor 2 [370] Condensate',
            '',
            '@ Concentrate: 40% solids'
        ].join('\n')
    },
    {
        id: 'dryer',
        label: 'Spray dryer (a stream is missing)',
        title: 'Spray dryer, as measured',
        unit: 'kg/h',
        // 1300 enters the dryer and 1240 is accounted for leaving it.
        text: [
            'Slurry [500] Dryer',
            'Hot air [800] Dryer',
            'Dryer [210] Powder',
            'Dryer [1030] Exhaust',
            'Exhaust [1018] Stack',
            'Exhaust [12] Cyclone fines',
            '',
            '@ Dryer: wall build-up was not weighed'
        ].join('\n')
    },
    {
        id: 'energy',
        label: 'Boiler house energy (one tiny flow)',
        title: 'Boiler house energy, one shift',
        unit: 'GJ',
        // Blowdown flash is 0.05% of the input and cannot be drawn to scale.
        text: [
            'Natural gas [840] Boiler',
            'Boiler [690] Steam',
            'Boiler [118] Flue gas',
            'Boiler [32] Blowdown',
            'Steam [410] Process heat',
            'Steam [205] Turbine',
            'Steam [75] Distribution loss',
            'Turbine [62] Electricity',
            'Turbine [143] Exhaust steam',
            'Blowdown [0.4] Flash recovery',
            'Blowdown [31.6] Drain'
        ].join('\n')
    },
    {
        id: 'recycle',
        label: 'Reactor loop (a recycle stream)',
        title: 'Reactor loop with recycle',
        unit: 'kg/h',
        // The last line closes the loop, so it is the one drawn as the return.
        text: [
            'Fresh feed [100] Mixer',
            'Mixer [130] Reactor',
            'Reactor [130] Separator',
            'Separator [95] Product',
            'Separator [5] Purge',
            'Separator [30] Mixer',
            '',
            '@ Purge: stops inerts building up'
        ].join('\n')
    },
    {
        id: 'budget',
        label: 'Household budget (pasted as CSV)',
        title: 'Monthly budget',
        unit: 'USD',
        text: [
            'source,target,amount',
            'Salary,Income,5200',
            'Side work,Income,600',
            'Income,Housing,1900',
            'Income,Food,750',
            'Income,Transport,420',
            'Income,Tax,1450',
            'Income,Savings,1280'
        ].join('\n')
    },
    {
        id: 'jobsearch',
        label: 'Job search (inputs traced to outcomes)',
        title: 'Job search, by where each application came from',
        unit: '',
        // Three sources meet at one node, so the flows past it say whose they are.
        text: [
            '// The first flows out of each source need nothing extra.',
            'Web apply [40] No reply',
            'Web apply [20] Phone screen',
            'Referral [2] No reply',
            'Referral [10] Phone screen',
            'Recruiter [8] Phone screen',
            '',
            '// Phone screen is fed by all three, so each flow out says whose it is.',
            '// Recruiter is left unwritten: it takes what the other two leave.',
            'Phone screen [10 from Web apply] Ghosted',
            'Phone screen [2 from Referral] Ghosted',
            'Phone screen [2] Ghosted',
            'Phone screen [7 from Web apply] Rejected',
            'Phone screen [3 from Referral] Rejected',
            'Phone screen [2] Rejected',
            'Phone screen [3 from Web apply] Interview',
            'Phone screen [5 from Referral] Interview',
            'Phone screen [4] Interview',
            '',
            'Interview [1 from Web apply] Offer',
            'Interview [2 from Referral] Offer',
            'Interview [1] Offer',
            'Interview [2 from Web apply] Rejected',
            'Interview [3 from Referral] Rejected',
            'Interview [3] Rejected',
            '',
            '// A star traces a node. Take the "from" parts out to see where a trace stops.',
            '* Web apply',
            '* Referral',
            '* Recruiter'
        ].join('\n')
    }
]);

export const PRESETS_BY_ID = Object.freeze(Object.fromEntries(PRESETS.map((p) => [p.id, p])));
