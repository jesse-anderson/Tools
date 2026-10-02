// Worked examples for the process flow mapper. Each one is here to show one
// thing, named in `lesson`, with figures small enough to check by hand.

const lines = (...rows) => `${rows.join('\n')}\n`;

export const PRESETS = Object.freeze([
    {
        id: 'purchase',
        label: 'Purchase request',
        title: 'Purchase request',
        lesson: 'Look at Efficiency. The work is about an hour and the request takes four days, nearly all of it waiting for the manager and for finance.',
        text: lines(
            'lanes: Requester, Manager, Purchasing, Finance',
            'arrivals: 30 / wk',
            '',
            '== Request ==',
            'Requester: (Need identified) -> Fill in request',
            'Requester: Fill in request {15 min} -> Approve?',
            'Manager: Approve? {5 min, wait 2 d} -> yes 80%: Raise order, no 5%: (Rejected), fix 15%: Fill in request',
            'Manager: (Rejected)',
            '',
            '== Order ==',
            'Purchasing: Raise order {20 min, wait 4 h} -> Budget check',
            'Finance: Budget check {10 min, wait 1 d} -> pass 90%: Send to supplier, fail 10%: Raise order',
            'Purchasing: Send to supplier {5 min} -> (Order placed)',
            'Purchasing: (Order placed)'
        )
    },
    {
        id: 'lab',
        label: 'Lab sample with a retest loop',
        title: 'Lab sample, receipt to report',
        lesson: 'One sample in five is retested, so every step inside the loop is passed 1.25 times (1 / 0.8). The badges show it, and the rework figure says what it costs.',
        text: lines(
            'lanes: Reception, Analyst, Reviewer',
            '',
            'Reception: (Sample received) -> Log sample',
            'Reception: Log sample {5 min} -> Prepare sample',
            'Analyst: Prepare sample {20 min, wait 4 h} -> Run analysis',
            'Analyst: Run analysis {30 min, wait 1 h} -> Result valid?',
            'Reviewer: Result valid? {10 min, wait 2 h} -> yes 80%: Write report, retest 20%: Prepare sample',
            'Analyst: Write report {15 min} -> (Report issued)',
            'Reception: (Report issued)'
        )
    },
    {
        id: 'change',
        label: 'Engineering change order',
        title: 'Engineering change order',
        lesson: 'A rejected approval sends the change back to drafting, which has its own checking loop. The loops multiply: drafting is passed 1.9 times, not 1.3 or 1.4.',
        text: lines(
            'lanes: Engineer, Checker, Approver, Document control',
            '',
            '== Draft ==',
            'Engineer: (Change requested) -> Draft change',
            'Engineer: Draft change {2 h} -> Check drawing',
            'Checker: Check drawing {30 min, wait 1 d} -> Drawing OK?',
            'Checker: Drawing OK? {5 min} -> yes 75%: Review change, no 25%: Draft change',
            '',
            '== Approve ==',
            'Approver: Review change {20 min, wait 3 d} -> Approved?',
            'Approver: Approved? {10 min} -> yes 70%: Release change, no 30%: Draft change',
            '',
            '== Release ==',
            'Document control: Release change {15 min, wait 4 h} -> (Change released)',
            'Document control: (Change released)'
        )
    },
    {
        id: 'jobs',
        label: 'Job application pipeline',
        title: 'Job application pipeline',
        lesson: 'Look at "Where work ends up". With no rework the question is not how long, but what share of applications reaches each end.',
        text: lines(
            'lanes: Applicant, Recruiter, Hiring team',
            '',
            'Applicant: (Application sent) -> Reply?',
            'Recruiter: Reply? {wait 2 wk} -> none 99%: (Ghosted), call 1%: Phone screen',
            'Recruiter: Phone screen {30 min, wait 3 d} -> advance 20%: Technical interview, drop 60%: (Ghosted), scam 20%: (Scam)',
            'Hiring team: Technical interview {1 h, wait 1 wk} -> advance 50%: Panel interview, fail 50%: (Rejected)',
            'Hiring team: Panel interview {3 h, wait 1 wk} -> offer 25%: (Offer), no 75%: (Rejected)',
            'Recruiter: (Ghosted)',
            'Recruiter: (Scam)',
            'Hiring team: (Rejected)',
            'Hiring team: (Offer)'
        )
    },
    {
        id: 'order',
        label: 'Order, pick to ship',
        title: 'Customer order, pick to ship',
        lesson: 'Picking is the longest job at 25 minutes. The darkest step is booking the carrier, a 4 minute job that waits a day. Set "Shade steps by" to Touch time to see the difference.',
        text: lines(
            'lanes: Sales, Warehouse, Shipping',
            'arrivals: 120 / d',
            '',
            'Sales: (Order received) -> Enter order',
            'Sales: Enter order {6 min, wait 30 min} -> Pick items',
            'Warehouse: Pick items {25 min, wait 1 h} -> Pack order',
            'Warehouse: Pack order {10 min, wait 20 min} -> Book carrier',
            'Shipping: Book carrier {4 min, wait 1 d} -> Load truck',
            'Shipping: Load truck {8 min, wait 2 h} -> (Order shipped)',
            'Shipping: (Order shipped)'
        )
    },
    {
        id: 'incident',
        label: 'Incident response',
        title: 'Incident response',
        lesson: 'Look at "Check these". Escalating to the vendor leads nowhere, so 5.6% of incidents stop there and never close. The map draws it and says so.',
        text: lines(
            'lanes: Reporter, Service desk, Engineer',
            '',
            'Reporter: (Incident reported) -> Log ticket',
            'Service desk: Log ticket {5 min} -> Known issue?',
            'Service desk: Known issue? {5 min, wait 15 min} -> yes 40%: Apply known fix, no 60%: Investigate',
            'Service desk: Apply known fix {15 min} -> Fixed?',
            'Engineer: Investigate {1 h, wait 2 h} -> Fixed?',
            'Engineer: Fixed? {10 min} -> yes 85%: Confirm with reporter, no 10%: Investigate, vendor 5%: Escalate to vendor',
            'Engineer: Escalate to vendor {20 min}',
            'Reporter: Confirm with reporter {5 min, wait 4 h} -> (Incident closed)',
            'Reporter: (Incident closed)'
        )
    }
]);

export const PRESETS_BY_ID = Object.freeze(Object.fromEntries(PRESETS.map((p) => [p.id, p])));
