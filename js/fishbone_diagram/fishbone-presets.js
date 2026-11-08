// Category presets, kinds of fishbone and worked examples. Each preset names
// the source its list was copied from; lists are never merged or averaged.
// Sources are archived in data/fishbone_diagram/.

export const SIZE_HELP = 'IHI advises deciding on five or six categories. This tool allows up to 12, as a ceiling rather than a target.';

export const PRESETS = Object.freeze([
    {
        id: '6m',
        label: '6M',
        categories: ['Methods', 'Machines', 'People', 'Materials', 'Measurement', 'Environment'],
        source: 'Tague, The Quality Toolbox, 2nd ed. (ASQ Quality Press, 2004)',
        standing: 'Primary, read in an excerpt of the book',
        help: 'Tague gives these as generic headings: "Methods, Machines (equipment), People (manpower), Materials, Measurement, Environment." Older lists say Manpower and Mother nature; this tool uses People and Environment.'
    },
    {
        id: 'classic-five',
        label: 'Classic five',
        categories: ['Materials', 'Methods', 'Equipment', 'Environment', 'People'],
        source: 'Institute for Healthcare Improvement, Patient Safety Essentials Toolkit: Cause and Effect Diagram (2017)',
        standing: 'Primary',
        help: 'IHI: "The standard categories in a classic cause and effect diagram are Materials, Methods, Equipment, Environment, and People." IHI publishes no list made only for health care, and its toolkit uses these five.'
    },
    {
        id: 'primary-care-5ps',
        label: 'Primary care 5 Ps',
        categories: ['Providers and staff', 'Patients and families', 'Procedures and processes', 'Places (or equipment)', 'Policies'],
        source: 'Alberta Medical Association, Cause and Effect (Fishbone) Diagram, quality improvement resources',
        standing: 'Primary',
        help: 'The Alberta guide also frames the head as a question, such as "what causes appointments to start late?". This tool accepts a question or a statement.'
    },
    {
        id: '8m',
        label: '8M',
        categories: ['People', 'Machines', 'Materials', 'Methods', 'Measurement', 'Environment', 'Management', 'Maintenance'],
        source: 'Bradley, Reliability Engineering: A Life Cycle Approach (2016), as cited by Wikipedia',
        standing: 'Secondary: taken from Wikipedia\'s citation, not read in the book',
        help: 'Sources disagree on the last two: Management, Money and Maintenance all appear. This list follows Bradley. Original names include Manpower or Mindpower, and Mother nature.'
    },
    {
        id: '8p',
        label: '8P',
        categories: ['Product (or service)', 'Price', 'Place', 'Promotion', 'People', 'Process', 'Physical evidence', 'Performance'],
        source: 'Bradley, Reliability Engineering: A Life Cycle Approach (2016), as cited by Wikipedia',
        standing: 'Secondary: taken from Wikipedia\'s citation, not read in the book',
        help: 'At least three 8P lists are published. Shared Health Manitoba uses Personnel and "Productivity/quality". Minitab\'s blog uses Procedures, Policies, Place, Product, People, Processes, Price and Promotion. This one is Bradley\'s, the only one tied to a book.'
    },
    {
        id: '4s',
        label: '4S',
        categories: ['Surroundings', 'Suppliers', 'Systems', 'Skills'],
        source: 'Dudbridge, Handbook of Lean Manufacturing in the Food Industry (2011), as cited by Wikipedia',
        standing: 'Secondary: taken from Wikipedia\'s citation, not read in the book',
        help: 'Wikipedia also lists Safety as a fifth S.'
    },
    {
        id: 'software',
        label: 'Software',
        categories: ['Code', 'Configuration', 'Infrastructure', 'Data', 'Dependencies', 'People', 'Process'],
        source: 'This site\'s list',
        standing: 'Not sourced',
        help: 'Not taken from a published source. Rename or remove any category that does not fit.'
    },
    {
        id: 'none',
        label: 'None',
        categories: [],
        source: '',
        standing: '',
        help: 'Type your own categories.'
    }
]);

export const PRESETS_BY_ID = Object.freeze(Object.fromEntries(PRESETS.map((p) => [p.id, p])));

/** A preset id from typed text: its id or label, ignoring case and spaces. */
export function lookupPreset(text) {
    const key = String(text || '').toLowerCase().replace(/\s+/g, '');
    const found = PRESETS.find((p) => p.id.replace(/-/g, '') === key.replace(/-/g, '') || p.label.toLowerCase().replace(/\s+/g, '') === key);
    return found ? found.id : null;
}

export const KIND_INFO = Object.freeze({
    standard: {
        label: 'Standard',
        help: 'Causes sorted into categories on bones. Described by Tague and by IHI.'
    },
    enumeration: {
        label: 'Cause enumeration',
        help: 'List ideas first, in the Unsorted bin, then group them onto bones. The grouping steps follow the CMS QAPI affinity-grouping tool: sort without discussion, aim for fewer than ten groups, then name each group. The name is Tague\'s; his steps were not reached.'
    },
    process: {
        label: 'Process',
        help: 'The bones are the steps of a process, left to right in order. IHI: a process-type diagram "shows causes of problems at each step".'
    }
});

export const EXAMPLES = Object.freeze([
    {
        id: 'short-shots',
        label: 'Short shots on a molded part (6M)',
        teaches: 'The three statuses, with evidence under the verified and ruled out causes.',
        text: `effect: Molded housings have short shots on cavity 3
preset: 6M

Methods
  Injection speed lowered on second shift [suspected, @Process engineer]
    Operators adjusting to stop flash on cavity 1
      No written setup sheet for this mold
  Hold time shortened to raise output [ruled out]
    > Setup log 2026-10-02 to 2026-10-16: hold time unchanged at 4.0 s
Machines
  Hot runner nozzle 3 partly blocked [verified, @Maintenance lead]
    > Flow test 2026-10-14: nozzle 3 at 62% of the others
  Barrel heater zone 2 drifting
People
  New second shift operators not shown the purge routine
Materials
  Resin moisture above 0.02% [ruled out]
    > Karl Fischer on lots 8812 to 8815, all 0.011% or lower
  Regrind above 25% of the blend [suspected]
Measurement
  Short shots counted by eye at the end of the shift
Environment
  Plant air pressure drops when the paint line starts
`
    },
    {
        id: 'late-pizza',
        label: 'Late pizza deliveries (4S)',
        teaches: 'Suppliers is left empty on purpose. The team found nothing there, and the diagram shows the empty bone rather than hiding it.',
        text: `effect: Friday evening pizza deliveries arrive more than 45 minutes after the order
preset: 4S

Surroundings
  Road work on the main route since September
  Parking near the apartment blocks takes minutes to find
Suppliers
Systems
  Orders print in the order received, not by delivery zone
  Online ordering does not cap orders per time slot
    No slot limit was set when the system was installed
Skills
  New drivers do not know the routes through the east side
`
    },
    {
        id: 'nightly-backup',
        label: 'Nightly backup job failing (Software)',
        teaches: 'A chain of five whys under one cause, ending at something specific enough to test a change.',
        text: `effect: The nightly backup job failed on 9 of the last 30 nights
preset: Software

Code
  Job does not retry after a network timeout [suspected]
Configuration
  Backup window overlaps the weekly index rebuild [ruled out]
    > Failures fall on 6 different weekdays; the rebuild runs only on Sundays
Infrastructure
  Backup volume runs out of space [verified]
    > Job log: "No space left on device" on all 9 failed nights
    Old backups are not deleted
      The cleanup step was taken out of the job
        The cleanup step failed after the storage move in August
          The cleanup script still points at the old mount path
Data
  Database grew 40% since spring
Dependencies
  Storage driver updated in August
People
  Only one person knows how the job is set up
Process
  No alert when the job fails, so failures are found days later
`
    },
    {
        id: 'check-in-wait',
        label: 'Patient wait at check-in (Primary care 5 Ps)',
        teaches: 'The first cause under Providers and staff is flagged "ask why again". The one below it shows the chain you get by asking why.',
        text: `effect: Patients wait more than 20 minutes at check-in on Monday mornings
preset: Primary care 5 Ps

Providers and staff
  Human error at the front desk
  Front desk staff retype insurance details by hand
    The card scanner does not read the new insurance cards
      Insurers changed the card layout in July
Patients and families
  Many patients arrive at 8:00 for the first appointments
Procedures and processes
  Insurance is checked at the desk instead of before the visit
Places (or equipment)
  One check-in desk is open until 9:00
Policies
  Consent forms must be signed on paper
`
    },
    {
        id: 'late-invoices',
        label: 'Invoices paid late (Process)',
        teaches: 'The bones are the steps of the process, left to right in the order they happen.',
        text: `effect: 30% of supplier invoices are paid after the due date
kind: process

Invoice received
  Some invoices go to a personal mailbox, not the shared one
Matched to purchase order
  No purchase order for repeat services
  Price on the invoice differs from the order
Approved
  Approver away, with no delegate set
    Setting a delegate is not part of the leave request
Paid
  Payment runs only on the 1st and 15th
`
    },
    {
        id: 'support-brainstorm',
        label: 'Brainstorm, not yet sorted (Cause enumeration)',
        teaches: 'Ideas listed first in the Unsorted bin, ready to be grouped onto bones.',
        text: `effect: Customer support emails take more than 2 days to get a first reply
kind: cause enumeration

Unsorted
  Spam filter holds some customer emails
  No one owns the shared inbox on weekends
  Agents answer phone calls first
  Reply templates are out of date
  Emails in other languages wait for one person
  The ticket tool does not show how old an email is
  Two product launches in one month
`
    }
]);

export const EXAMPLES_BY_ID = Object.freeze(Object.fromEntries(EXAMPLES.map((e) => [e.id, e])));
