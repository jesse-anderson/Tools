// Independent numerical check of every closed form in beam-engine.js.
//
// This is the strongest correctness argument available and it is cheap. The
// solver below assembles Hermitian beam elements and solves K u = F. It shares
// no derivation path with the closed forms: no coefficient, no location, no
// integration constant from that file appears here. A mistyped coefficient
// survives a golden test written from the same mistyped source; it does not
// survive an independent solve.
//
// This is not hypothetical. Running exactly this comparison before any tool code
// existed is what caught the wrong propped-cantilever fixed-end moment in the
// specification, at load positions away from midspan where the specification's
// own spot check could not see it.
//
// The solver is written by the same author in the same repo, so its
// independence is structural, not sourced. A shared conceptual
// assumption stays invisible to it: both this and the closed forms assume
// Euler-Bernoulli, so neither will ever flag the neglect of shear deformation.
// The spec adds a third anchor by pinning values to published tables.
//
// A finite-difference solve of EI y'''' = q needs ghost nodes to express the
// free-end shear and moment conditions. That is the fiddliest part to get right
// and the easiest place to introduce the very error the check exists to catch.
// The Hermitian element is banded by construction, needs no ghost nodes, and is
// exact at the nodes for these load cases, so it is used instead.
//
// A dense Gaussian elimination is too slow to sit behind a button click: a naive N = 1200 dense solve took over two minutes during the audit of
// this tool. The beam stiffness matrix is banded with half-bandwidth 3, so the
// solver below stores and factors only the band, and N is capped at 200, which
// reproduces every closed form to better than the tolerance stated below.

import { solve, closedForm } from './beam-engine.js';

export const MAX_ELEMENTS = 200;
export const DEFAULT_ELEMENTS = 200;

// Half-bandwidth: element e couples DOFs 2e through 2e+3, so no entry sits more
// than 3 columns from the diagonal.
const BW = 3;
const STRIDE = 2 * BW + 1;

// Band storage helpers. Entry (i, j) lives at i * STRIDE + (j - i + BW), and
// anything outside the band is structurally zero.
const bandGet = (A, i, j) => (Math.abs(i - j) > BW ? 0 : A[i * STRIDE + (j - i + BW)]);
const bandSet = (A, i, j, v) => { if (Math.abs(i - j) <= BW) A[i * STRIDE + (j - i + BW)] = v; };
const bandAdd = (A, i, j, v) => { if (Math.abs(i - j) <= BW) A[i * STRIDE + (j - i + BW)] += v; };

// Node positions, always including the beam ends plus any breakpoint the load
// introduces: the position of a point load, and both edges of a partial
// distributed band. A load edge falling inside an element would smear it and
// turn an exact comparison into an approximate one.
function meshNodes(L, breaks, elements) {
    const n = Math.max(4, Math.min(elements, MAX_ELEMENTS));
    const stops = [0, L];
    for (const b of breaks || []) {
        if (Number.isFinite(b) && b > 1e-12 && b < L - 1e-12) stops.push(b);
    }
    const unique = [...new Set(stops.map((x) => Number(x.toPrecision(12))))]
        .sort((p, q) => p - q);
    if (unique.length === 2) {
        return Array.from({ length: n + 1 }, (_, i) => (L * i) / n);
    }

    // Split the element budget across the segments in proportion to length, with
    // a floor of two elements per segment so a short band is still resolved.
    const spans = unique.slice(1).map((x, i) => x - unique[i]);
    const total = spans.reduce((acc, x) => acc + x, 0);
    const counts = spans.map((len) => Math.max(2, Math.round((n * len) / total)));
    const nodes = [unique[0]];
    for (let i = 0; i < spans.length; i += 1) {
        for (let j = 1; j <= counts[i]; j += 1) {
            nodes.push(unique[i] + (spans[i] * j) / counts[i]);
        }
    }
    // Rounding through the segment loop can leave the last node a few ulps short.
    nodes[nodes.length - 1] = L;
    return nodes;
}

/**
 * Solves one beam numerically. Strict SI, same as the engine.
 *
 * A distributed load covers the whole span unless `c` is given, in which case it
 * runs from `a` to `a + c`.
 *
 * @returns {object} { vAt, dMax, xMax, dMid, reactions, elements }
 */
export function feSolveBeam({ support, L, E, I, P, w, a, c, elements = DEFAULT_ELEMENTS }) {
    const partial = !!w && Number.isFinite(c) && c > 0 && c < L;
    const loadStart = partial ? a : 0;
    const loadEnd = partial ? a + c : L;
    const breaks = [];
    if (P) breaks.push(a);
    if (partial) breaks.push(loadStart, loadEnd);
    const nodes = meshNodes(L, breaks, elements);
    const nEl = nodes.length - 1;
    const nDof = 2 * (nEl + 1);
    const K = new Float64Array(nDof * STRIDE);
    const F = new Float64Array(nDof);

    for (let e = 0; e < nEl; e += 1) {
        const le = nodes[e + 1] - nodes[e];
        const k = (E * I) / le ** 3;
        const ke = [
            [12, 6 * le, -12, 6 * le],
            [6 * le, 4 * le * le, -6 * le, 2 * le * le],
            [-12, -6 * le, 12, -6 * le],
            [6 * le, 2 * le * le, -6 * le, 4 * le * le],
        ];
        const map = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
        for (let i = 0; i < 4; i += 1) {
            for (let j = 0; j < 4; j += 1) bandAdd(K, map[i], map[j], k * ke[i][j]);
        }
        // Every load edge is a node, so an element is either fully covered or
        // fully clear and the consistent load vector stays exact.
        const mid = (nodes[e] + nodes[e + 1]) / 2;
        if (w && mid > loadStart - 1e-12 && mid < loadEnd + 1e-12) {
            // Consistent load vector for a uniform load, downward positive.
            F[map[0]] += (w * le) / 2;
            F[map[1]] += (w * le * le) / 12;
            F[map[2]] += (w * le) / 2;
            F[map[3]] += -(w * le * le) / 12;
        }
    }
    if (P) {
        const node = nodes.findIndex((x) => Math.abs(x - a) < 1e-12);
        F[2 * (node < 0 ? Math.round((a / L) * nEl) : node)] += P;
    }

    const lastV = 2 * nEl;
    const lastT = 2 * nEl + 1;
    const fixed = [];
    if (support === 'cantilever') fixed.push(0, 1);
    if (support === 'simple') fixed.push(0, lastV);
    if (support === 'fixed-fixed') fixed.push(0, 1, lastV, lastT);
    if (support === 'propped') fixed.push(0, 1, lastV);

    // Keep the untouched rows for the constrained DOFs so reactions can be
    // recovered as R = K u - F after the constrained system is solved.
    const savedRows = new Map();
    for (const dof of fixed) {
        const row = new Float64Array(STRIDE);
        for (let s = 0; s < STRIDE; s += 1) row[s] = K[dof * STRIDE + s];
        savedRows.set(dof, row);
    }

    // Apply the zero-displacement conditions by clearing each constrained row
    // and column and putting 1 on the diagonal. Exact for zero prescribed
    // values, and it leaves the matrix banded and positive definite.
    for (const dof of fixed) {
        for (let j = dof - BW; j <= dof + BW; j += 1) {
            if (j < 0 || j >= nDof) continue;
            bandSet(K, dof, j, 0);
            bandSet(K, j, dof, 0);
        }
        bandSet(K, dof, dof, 1);
        F[dof] = 0;
    }

    // Banded Gaussian elimination. The matrix is symmetric positive definite
    // once constrained, so no pivoting is needed and fill-in stays in the band.
    const b = Float64Array.from(F);
    for (let k = 0; k < nDof; k += 1) {
        const pivot = bandGet(K, k, k);
        const iMax = Math.min(k + BW, nDof - 1);
        for (let i = k + 1; i <= iMax; i += 1) {
            const factor = bandGet(K, i, k) / pivot;
            if (factor === 0) continue;
            for (let j = k; j <= Math.min(k + BW, nDof - 1); j += 1) {
                bandAdd(K, i, j, -factor * bandGet(K, k, j));
            }
            b[i] -= factor * b[k];
        }
    }
    const u = new Float64Array(nDof);
    for (let i = nDof - 1; i >= 0; i -= 1) {
        let s = b[i];
        for (let j = i + 1; j <= Math.min(i + BW, nDof - 1); j += 1) s -= bandGet(K, i, j) * u[j];
        u[i] = s / bandGet(K, i, i);
    }

    // Continuous deflection via the cubic Hermite shape functions. Sampling the
    // maximum over nodes alone misses the true peak by O(h^2), which is large
    // enough to masquerade as a formula error, so the curve is interpolated
    // inside the element instead.
    const vAt = (x) => {
        let e = 0;
        while (e < nEl - 1 && nodes[e + 1] < x) e += 1;
        const le = nodes[e + 1] - nodes[e];
        const xi = (x - nodes[e]) / le;
        const N1 = 1 - 3 * xi * xi + 2 * xi ** 3;
        const N2 = le * (xi - 2 * xi * xi + xi ** 3);
        const N3 = 3 * xi * xi - 2 * xi ** 3;
        const N4 = le * (-xi * xi + xi ** 3);
        return N1 * u[2 * e] + N2 * u[2 * e + 1] + N3 * u[2 * e + 2] + N4 * u[2 * e + 3];
    };

    const scan = 20 * nEl;
    let xMax = 0;
    let dMax = 0;
    for (let i = 0; i <= scan; i += 1) {
        const x = (L * i) / scan;
        const v = vAt(x);
        if (Math.abs(v) > Math.abs(dMax)) { dMax = v; xMax = x; }
    }
    // Refine the peak by ternary search, so the comparison is against the real
    // maximum rather than the best sample.
    let lo = Math.max(0, xMax - L / scan);
    let hi = Math.min(L, xMax + L / scan);
    for (let i = 0; i < 120; i += 1) {
        const m1 = lo + (hi - lo) / 3;
        const m2 = hi - (hi - lo) / 3;
        if (Math.abs(vAt(m1)) > Math.abs(vAt(m2))) hi = m2; else lo = m1;
    }
    xMax = (lo + hi) / 2;
    dMax = vAt(xMax);

    const reactions = {};
    for (const dof of fixed) {
        const row = savedRows.get(dof);
        let s = 0;
        for (let j = dof - BW; j <= dof + BW; j += 1) {
            if (j < 0 || j >= nDof) continue;
            s += row[j - dof + BW] * u[j];
        }
        reactions[dof] = s - F[dof];
    }

    return {
        vAt,
        dMax: Math.abs(dMax),
        xMax,
        dMid: Math.abs(vAt(L / 2)),
        momentAtFixedEnd: reactions[1] === undefined ? null : reactions[1],
        elements: nEl,
    };
}

const rel = (got, ref) => (Math.abs(ref) < 1e-15 ? Math.abs(got - ref) : Math.abs((got - ref) / ref));

/** Compares one configuration's closed form against the numerical solve. */
export function verifyCase(input, elements = DEFAULT_ELEMENTS) {
    const closed = solve(input);
    if (!closed.ok) return { label: 'invalid input', pass: false, error: closed.error };
    const fe = feSolveBeam({ ...input, a: input.loadType === 'udl-partial' ? input.a : closed.a, elements });
    const deltaError = rel(closed.deltaMax, fe.dMax);
    const midError = rel(closed.deltaMid, fe.dMid);
    // The location is compared as a fraction of span rather than relatively, so
    // a maximum near an end is not judged on a vanishing denominator.
    const xError = Math.abs(closed.xMax - fe.xMax) / input.L;
    return {
        support: input.support,
        loadType: input.loadType,
        a: closed.a,
        closedDelta: closed.deltaMax,
        numericDelta: fe.dMax,
        closedX: closed.xMax,
        numericX: fe.xMax,
        deltaError,
        midError,
        xError,
        elements: fe.elements,
        pass: deltaError < TOLERANCE.delta && midError < TOLERANCE.delta && xError < TOLERANCE.x,
    };
}

// Agreement actually achieved at 200 elements is around 1e-8 on deflection.
// These thresholds sit above that with room, and far below any error a real
// coefficient mistake would produce, which is a percent or more.
export const TOLERANCE = { delta: 1e-5, x: 1e-4 };

/**
 * Runs the whole comparison: every support case, every load type, and a sweep of
 * load positions across the entire span including below midspan, which is where
 * a dropped off-center normalization hides.
 */
export function verifyAll({ L = 3, E = 200e9, I = 1e-5, P = 10000, w = 5000, elements = DEFAULT_ELEMENTS } = {}) {
    const cases = [];
    const positions = [0.15, 0.25, 0.35, 0.5, 0.65, 0.75, 0.85];
    const bands = [[0, 0.35], [0.2, 0.3], [0.35, 0.3], [0.5, 0.5], [0.65, 0.35], [0.25, 0.5]];
    for (const support of ['cantilever', 'simple', 'fixed-fixed', 'propped']) {
        cases.push(verifyCase({ support, loadType: 'point-standard', L, E, I, P }, elements));
        cases.push(verifyCase({ support, loadType: 'udl', L, E, I, w }, elements));
        for (const frac of positions) {
            cases.push(verifyCase({ support, loadType: 'point-at', a: frac * L, L, E, I, P }, elements));
        }
        // Partial bands, including ones that touch an end and ones that do not,
        // since the end cases are where a Macaulay term can silently drop out.
        for (const [aFrac, cFrac] of bands) {
            cases.push(verifyCase({ support, loadType: 'udl-partial', a: aFrac * L, c: cFrac * L, L, E, I, w }, elements));
        }
    }
    const failed = cases.filter((c) => !c.pass);
    const worst = cases.reduce((m, c) => (c.deltaError > m.deltaError ? c : m), cases[0]);
    return {
        cases,
        failed,
        pass: failed.length === 0,
        total: cases.length,
        worstDeltaError: worst.deltaError,
        worstLabel: `${worst.support} / ${worst.loadType}`,
        elements,
        tolerance: TOLERANCE,
    };
}

/** Closed forms re-exported so a caller can pin them without a second import. */
export { closedForm };
