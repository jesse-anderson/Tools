// Representative valve sizing coefficients.
//
// Follows the materials.js convention from the beam tool: one row per style and
// size, every row carrying its source and a reviewed flag, and no row shipping
// as reviewed until it has been checked against the cited document.
//
// What `reviewed: true` means here. It asserts provenance and says nothing about
// accuracy: the value
// in the row is the value the cited page prints. It does NOT mean the value
// describes any particular valve. FL, xT and Fd are flow-test measurements per
// trim, per flow direction, to IEC 60534-2-3, and these are style typicals. A
// real FL can sit 0.05 to 0.10 away from the typical, and it enters the choke
// criterion squared. Every row is user-overridable for precisely this reason.
//
// Source for every row below:
//   Fisher / Emerson, Control Valve Handbook, 5th edition, D101881X012/Sept19.
//   Section 5.10.1, "Representative Sizing Coefficients for Single-Ported,
//   Globe-Style Valve Bodies", printed page 109.
//   Section 5.10.2, "Representative Sizing Coefficients for Rotary Valves",
//   printed page 110.
// Archived with a SHA-256 in data/control_valve_coefficients/download_manifest.csv.
//
// Deliberately absent: the NPS 2 and NPS 6 rotary rows. In the source
// those two blocks interleave the V-notch ball and butterfly values across the
// degrees-of-opening column in a way that cannot be read unambiguously from the
// page. Guessing which coefficient belongs to which style is exactly the
// transposition risk this convention exists to catch, so they are absent rather
// than uncertain. Adding them needs a second read of the printed table.

/** Rated travel or opening a row was measured at, for display alongside it. */
export const SOURCE = Object.freeze({
    globe: 'Fisher Control Valve Handbook 5th ed., section 5.10.1, p109',
    rotary: 'Fisher Control Valve Handbook 5th ed., section 5.10.2, p110',
});

export const VALVE_STYLES = Object.freeze([
    // --- globe, cage guided. The reference case for most process service. ---
    { id: 'globe-cage-linear-1', name: 'Globe, cage guided, linear', sizeNPS: 1, opening: 'rated travel', Cv: 20.6, FL: 0.84, xT: 0.64, Fd: 0.34, sigmaIncipient: null, source: SOURCE.globe, reviewed: true },
    { id: 'globe-cage-eqpct-1', name: 'Globe, cage guided, equal percentage', sizeNPS: 1, opening: 'rated travel', Cv: 17.2, FL: 0.88, xT: 0.67, Fd: 0.38, sigmaIncipient: null, source: SOURCE.globe, reviewed: true },
    { id: 'globe-cage-linear-2', name: 'Globe, cage guided, linear', sizeNPS: 2, opening: 'rated travel', Cv: 72.9, FL: 0.77, xT: 0.64, Fd: 0.33, sigmaIncipient: null, source: SOURCE.globe, reviewed: true },
    { id: 'globe-cage-eqpct-2', name: 'Globe, cage guided, equal percentage', sizeNPS: 2, opening: 'rated travel', Cv: 59.7, FL: 0.85, xT: 0.69, Fd: 0.31, sigmaIncipient: null, source: SOURCE.globe, reviewed: true },
    { id: 'globe-cage-linear-3', name: 'Globe, cage guided, linear', sizeNPS: 3, opening: 'rated travel', Cv: 148, FL: 0.82, xT: 0.62, Fd: 0.30, sigmaIncipient: null, source: SOURCE.globe, reviewed: true },
    { id: 'globe-cage-eqpct-3', name: 'Globe, cage guided, equal percentage', sizeNPS: 3, opening: 'rated travel', Cv: 136, FL: 0.82, xT: 0.68, Fd: 0.32, sigmaIncipient: null, source: SOURCE.globe, reviewed: true },
    { id: 'globe-cage-linear-4', name: 'Globe, cage guided, linear', sizeNPS: 4, opening: 'rated travel', Cv: 236, FL: 0.82, xT: 0.69, Fd: 0.28, sigmaIncipient: null, source: SOURCE.globe, reviewed: true },

    // --- globe, post guided. Small trim, and the Fd is markedly higher. ---
    { id: 'globe-post-eqpct-0p5', name: 'Globe, post guided, equal percentage', sizeNPS: 0.5, opening: 'rated travel', Cv: 2.41, FL: 0.90, xT: 0.54, Fd: 0.61, sigmaIncipient: null, source: SOURCE.globe, reviewed: true },
    { id: 'globe-post-eqpct-0p75', name: 'Globe, post guided, equal percentage', sizeNPS: 0.75, opening: 'rated travel', Cv: 5.92, FL: 0.84, xT: 0.61, Fd: 0.61, sigmaIncipient: null, source: SOURCE.globe, reviewed: true },

    // --- V-notch ball. High capacity, and FL falls sharply at 90 degrees. ---
    { id: 'ball-vnotch-1-60', name: 'V-notch ball', sizeNPS: 1, opening: '60 degrees', Cv: 15.6, FL: 0.86, xT: 0.53, Fd: null, sigmaIncipient: null, source: SOURCE.rotary, reviewed: true },
    { id: 'ball-vnotch-1-90', name: 'V-notch ball', sizeNPS: 1, opening: '90 degrees', Cv: 34.0, FL: 0.86, xT: 0.42, Fd: null, sigmaIncipient: null, source: SOURCE.rotary, reviewed: true },
    { id: 'ball-vnotch-3-60', name: 'V-notch ball', sizeNPS: 3, opening: '60 degrees', Cv: 120, FL: 0.80, xT: 0.50, Fd: 0.92, sigmaIncipient: null, source: SOURCE.rotary, reviewed: true },
    { id: 'ball-vnotch-3-90', name: 'V-notch ball', sizeNPS: 3, opening: '90 degrees', Cv: 321, FL: 0.74, xT: 0.30, Fd: 0.99, sigmaIncipient: null, source: SOURCE.rotary, reviewed: true },
    { id: 'ball-vnotch-4-60', name: 'V-notch ball', sizeNPS: 4, opening: '60 degrees', Cv: 195, FL: 0.80, xT: 0.52, Fd: 0.92, sigmaIncipient: null, source: SOURCE.rotary, reviewed: true },
    { id: 'ball-vnotch-4-90', name: 'V-notch ball', sizeNPS: 4, opening: '90 degrees', Cv: 596, FL: 0.62, xT: 0.22, Fd: 0.99, sigmaIncipient: null, source: SOURCE.rotary, reviewed: true },

    // --- high-performance butterfly. The lowest FL in the library, which is
    // why it is the style most likely to cavitate at a differential a globe
    // valve would pass without complaint.
    { id: 'butterfly-hp-3-60', name: 'High-performance butterfly', sizeNPS: 3, opening: '60 degrees', Cv: 115, FL: 0.81, xT: 0.46, Fd: 0.49, sigmaIncipient: null, source: SOURCE.rotary, reviewed: true },
    { id: 'butterfly-hp-3-90', name: 'High-performance butterfly', sizeNPS: 3, opening: '90 degrees', Cv: 237, FL: 0.64, xT: 0.28, Fd: 0.70, sigmaIncipient: null, source: SOURCE.rotary, reviewed: true },
    { id: 'butterfly-hp-4-60', name: 'High-performance butterfly', sizeNPS: 4, opening: '60 degrees', Cv: 270, FL: 0.69, xT: 0.32, Fd: 0.49, sigmaIncipient: null, source: SOURCE.rotary, reviewed: true },
    { id: 'butterfly-hp-4-90', name: 'High-performance butterfly', sizeNPS: 4, opening: '90 degrees', Cv: 499, FL: 0.53, xT: 0.19, Fd: 0.70, sigmaIncipient: null, source: SOURCE.rotary, reviewed: true },
    { id: 'butterfly-hp-8-60', name: 'High-performance butterfly', sizeNPS: 8, opening: '60 degrees', Cv: 1160, FL: 0.66, xT: 0.31, Fd: 0.49, sigmaIncipient: null, source: SOURCE.rotary, reviewed: true },
    { id: 'butterfly-hp-8-90', name: 'High-performance butterfly', sizeNPS: 8, opening: '90 degrees', Cv: 2180, FL: 0.48, xT: 0.19, Fd: 0.70, sigmaIncipient: null, source: SOURCE.rotary, reviewed: true },
]);

export const STYLES_BY_ID = Object.freeze(
    Object.fromEntries(VALVE_STYLES.map((s) => [s.id, s])),
);

export const unreviewedCount = () => VALVE_STYLES.filter((s) => !s.reviewed).length;

/**
 * Whether a row's coefficient is the one at FULL OPEN.
 *
 * Nine globe rows are quoted at rated travel and six rotary rows at 90 degrees,
 * which are both full open. The other six rotary rows are quoted at 60 degrees,
 * which is not, and their Cv is roughly a third of the same valve's 90 degree
 * figure. Carrying a 60 degree Cv into a field labelled "rated Cv at full open"
 * would understate the trim by that factor and silently distort every installed
 * characteristic drawn from it, so the interface fills the field only from the
 * rows where the two genuinely mean the same thing.
 */
export const isRatedAtFullOpen = (style) => style.opening === 'rated travel' || style.opening === '90 degrees';

/**
 * Every row's sigmaIncipient is null. That is a finding in its own right: the
 * Fisher handbook publishes no incipient cavitation limits for any
 * style: obtaining ISA-RP75.23 is the only thing that would populate this
 * column. Until then the cavitation comparison in regimes.js never runs, and the
 * tool says so instead of substituting a rule of thumb.
 */
export const hasPublishedCavitationLimits = () => VALVE_STYLES.some((s) => s.sigmaIncipient !== null);
