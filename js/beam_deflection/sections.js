// Cross-section properties for the beam deflection tool.
//
// Strict SI, like the engine: dimensions in metres, areas in m^2, second moments
// in m^4. The controller converts from millimetres at the DOM boundary.
//
// Bending is about the strong (horizontal) axis in every case. Weak-axis bending
// is not offered.
//
// Every geometry guard here rejects rather than returning a number. A section
// that produces a negative I is not a cosmetic problem: it flips the sign of the
// deflection, which reads as an upward deflection instead of as an error.

const err = (message) => ({ ok: false, error: message });

function positive(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return `${label} must be a positive number.`;
    }
    return null;
}

export const SECTIONS = {
    rect: {
        id: 'rect',
        label: 'Solid rectangle',
        // Dimensions the UI collects. `nominal` is the starting value in
        // display-SI units; the controller converts it for the active system.
        fields: [
            { key: 'b', label: 'Width b', quantity: 'sectionDim', nominal: 50 },
            { key: 'h', label: 'Height h', quantity: 'sectionDim', nominal: 100 },
        ],
        compute: ({ b, h }) => {
            const bad = positive(b, 'Width b') || positive(h, 'Height h');
            if (bad) return err(bad);
            return {
                ok: true,
                A: b * h,
                I: (b * h ** 3) / 12,
                c: h / 2,
                depth: h,
            };
        },
    },
    round: {
        id: 'round',
        label: 'Solid round',
        fields: [
            { key: 'd', label: 'Diameter d', quantity: 'sectionDim', nominal: 40 },
        ],
        compute: ({ d }) => {
            const bad = positive(d, 'Diameter d');
            if (bad) return err(bad);
            return {
                ok: true,
                A: (Math.PI * d * d) / 4,
                I: (Math.PI * d ** 4) / 64,
                c: d / 2,
                depth: d,
            };
        },
    },
    tubeRound: {
        id: 'tubeRound',
        label: 'Round tube',
        fields: [
            { key: 'do', label: 'Outside diameter do', quantity: 'sectionDim', nominal: 50 },
            { key: 'di', label: 'Inside diameter di', quantity: 'sectionDim', nominal: 42 },
        ],
        compute: ({ do: dOuter, di }) => {
            const bad = positive(dOuter, 'Outside diameter do');
            if (bad) return err(bad);
            // di = 0 is allowed on purpose: it is the solid-bar limit of a tube,
            // and it must reproduce the solid round result exactly. Only a
            // negative bore is an input error.
            if (typeof di !== 'number' || !Number.isFinite(di) || di < 0) {
                return err('Inside diameter di must be zero or a positive number.');
            }
            // Guard, not a silent negative I: with di >= do the second moment
            // comes out negative, which flips the deflection sign and would read
            // as an upward deflection rather than as the input error it is.
            if (di >= dOuter) return err('Inside diameter must be smaller than the outside diameter.');
            return {
                ok: true,
                A: (Math.PI * (dOuter * dOuter - di * di)) / 4,
                I: (Math.PI * (dOuter ** 4 - di ** 4)) / 64,
                c: dOuter / 2,
                depth: dOuter,
            };
        },
    },
    tubeRect: {
        id: 'tubeRect',
        label: 'Rectangular tube',
        fields: [
            { key: 'b', label: 'Outer width b', quantity: 'sectionDim', nominal: 50 },
            { key: 'h', label: 'Outer height h', quantity: 'sectionDim', nominal: 100 },
            { key: 't', label: 'Wall thickness t', quantity: 'sectionDim', nominal: 4 },
        ],
        compute: ({ b, h, t }) => {
            const bad = positive(b, 'Outer width b')
                || positive(h, 'Outer height h')
                || positive(t, 'Wall thickness t');
            if (bad) return err(bad);
            if (2 * t >= Math.min(b, h)) {
                return err('Wall thickness is at or past half the smaller outer dimension, which leaves no cavity. Use a solid rectangle instead.');
            }
            const bi = b - 2 * t;
            const hi = h - 2 * t;
            return {
                ok: true,
                A: b * h - bi * hi,
                I: (b * h ** 3 - bi * hi ** 3) / 12,
                c: h / 2,
                depth: h,
            };
        },
    },
    ibeam: {
        id: 'ibeam',
        label: 'Symmetric I-beam',
        fields: [
            { key: 'bf', label: 'Flange width bf', quantity: 'sectionDim', nominal: 100 },
            { key: 'd', label: 'Overall depth d', quantity: 'sectionDim', nominal: 200 },
            { key: 'tf', label: 'Flange thickness tf', quantity: 'sectionDim', nominal: 10 },
            { key: 'tw', label: 'Web thickness tw', quantity: 'sectionDim', nominal: 6 },
        ],
        compute: ({ bf, d, tf, tw }) => {
            const bad = positive(bf, 'Flange width bf')
                || positive(d, 'Overall depth d')
                || positive(tf, 'Flange thickness tf')
                || positive(tw, 'Web thickness tw');
            if (bad) return err(bad);
            if (2 * tf >= d) return err('The two flanges are as deep as the whole section, leaving no web.');
            if (tw >= bf) return err('Web thickness is at or past the flange width.');
            const hw = d - 2 * tf;
            return {
                ok: true,
                A: 2 * bf * tf + tw * hw,
                // Full rectangle minus the two side voids.
                I: (bf * d ** 3 - (bf - tw) * hw ** 3) / 12,
                c: d / 2,
                depth: d,
            };
        },
    },
    custom: {
        id: 'custom',
        label: 'Custom (enter I and c)',
        fields: [
            { key: 'I', label: 'Second moment I', quantity: 'secondMoment', nominal: 4166667 },
            { key: 'c', label: 'Distance to extreme fibre c', quantity: 'sectionDim', nominal: 50 },
            { key: 'depth', label: 'Depth (optional)', quantity: 'sectionDim', nominal: 100, optional: true },
        ],
        compute: ({ I, c, depth }) => {
            const bad = positive(I, 'Second moment I') || positive(c, 'Distance to extreme fibre c');
            if (bad) return err(bad);
            // Depth feeds nothing but the span-to-depth guard. Left blank, that
            // guard reports itself as not checked rather than quietly passing.
            const hasDepth = typeof depth === 'number' && Number.isFinite(depth) && depth > 0;
            return {
                ok: true,
                A: null,
                I,
                c,
                depth: hasDepth ? depth : null,
            };
        },
    },
};

/**
 * Section properties from a section type and its dimensions.
 *
 * @param {string} type  key of SECTIONS
 * @param {object} dims  dimensions in SI (metres, or m^4 for a custom I)
 * @returns {object} { ok: true, A, I, c, S, depth } or { ok: false, error }
 */
export function sectionProperties(type, dims) {
    const section = SECTIONS[type];
    if (!section) return err(`Unknown section type: ${type}`);
    const result = section.compute(dims || {});
    if (!result.ok) return result;
    return {
        ...result,
        // Section modulus. Every case that reaches here has a positive c.
        S: result.I / result.c,
        type,
    };
}
