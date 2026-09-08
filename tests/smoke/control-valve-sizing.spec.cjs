// Control valve sizing engine and page.
//
// Driven through the browser on window.ControlValve, which is the repo
// convention and buys more than a Node import would: it also proves the ES
// modules resolve over HTTP and that the strict CSP does not block them.
//
// Note on polling: this page runs script-src 'self' with no unsafe-eval, so
// page.waitForFunction is CSP-blocked. expect.poll is used instead.

const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const PAGE = '/tools/control-valve-sizing.html';

// Exact unit conversions, so the conversion contributes no error of its own.
const GPM = 0.2271247, PSI = 6.894757293168361, IN = 25.4, LBH = 0.45359237;
const LBFT3 = 16.018463373960143;

const rel = (got, want) => Math.abs(got - want) / Math.abs(want);

/** Call a pure engine function inside the page and bring the result back. */
const call = (page, method, ...args) => page.evaluate(
    ([m, a]) => window.ControlValve[m](...a),
    [method, args],
);

const surface = (page, key) => page.evaluate((k) => window.ControlValve[k], key);

test.beforeEach(async ({ page }) => {
    await page.goto(PAGE);
    await expect.poll(() => page.evaluate(() => typeof window.ControlValve)).toBe('object');
});

test.describe('equation constants', () => {
    // Transcribed from the Fisher handbook section 5.7 table. Pinning them as
    // literals makes a change a deliberate edit to a test and never a silent
    // drift, which matters more here than anywhere else in the tool: a wrong N
    // is a clean order-of-magnitude error wearing an entirely plausible face.
    test('are the handbook values, pinned', async ({ page }) => {
        const N = await surface(page, 'N');
        expect(N.N1).toBe(0.0865);
        expect(N.N2).toBe(0.00214);
        expect(N.N5).toBe(0.00241);
        expect(N.N6).toBe(2.73);
        expect(N.N8).toBe(0.948);
        expect(N.N9).toBe(22.5);
    });

    test('N4 is absent, and absent on purpose', async ({ page }) => {
        // The handbook does not cover the non-turbulent lane, so N4 is not in
        // its table. A null where a plausible guess would fit is the point: a guessed
        // Reynolds constant would be the beam tool's 1/185 error with less
        // excuse. The advisory says the check did not run.
        const N = await surface(page, 'N');
        expect(N.N4).toBeNull();
    });

    // The metric and US rows of the same table must agree under the unit
    // conversion between them. This checks the transcription against itself
    // instead of restating it, and it is the only independent handle available
    // on the N table. Tolerance is 0.5%: the printed metric values are rounded
    // to three figures, and N5 is the loosest at 0.3%.
    test('metric rows agree with the US rows under conversion', async ({ page }) => {
        const N = await surface(page, 'N');
        expect(rel(GPM / Math.sqrt(PSI), N.N1)).toBeLessThan(0.005);
        expect(rel(890 / IN ** 4, N.N2)).toBeLessThan(0.005);
        expect(rel(1000 / IN ** 4, N.N5)).toBeLessThan(0.005);
        expect(rel(63.3 * LBH / Math.sqrt(PSI * LBFT3), N.N6)).toBeLessThan(0.005);
    });

    test('the standard reference state is pinned, because N9 depends on it', async ({ page }) => {
        // The handbook prints 21.2 on the 0 C basis and 22.5 on the 15 C basis
        // on adjacent lines of the same table. A 6.1% error is available to
        // anything that leaves the basis implicit, and no unit label anywhere on
        // the screen would reveal it.
        const sc = await surface(page, 'STANDARD_CONDITIONS');
        expect(sc.T_K).toBe(288.15);
        expect(sc.P_kPa).toBe(101.325);
        expect(rel(22.5, 21.2)).toBeGreaterThan(0.06);
    });
});

test.describe('goldens from the handbook', () => {
    // Fisher Control Valve Handbook 5th ed., section 5.8.4, printed p102.
    // Liquid propane, Class 300 globe valve with an equal-percentage cage.
    const liquidExample = {
        service: 'liquid',
        q: 800 * GPM,
        P1: 314.7 * PSI,
        P2: 289.7 * PSI,
        Pv: 124.3 * PSI,
        Pc: 616.3 * PSI,
        relativeDensity: 0.50,
        d: 3 * IN, D1: 8 * IN, D2: 8 * IN,
        FL: 0.89,
    };

    test('the liquid worked example, and the rounding in its printed answer', async ({ page }) => {
        const k = await call(page, 'fittingCoefficients', liquidExample.d, liquidExample.D1, liquidExample.D2);
        const Fp = await call(page, 'pipingGeometryFactor', 121, liquidExample.d, k);
        const N = await surface(page, 'N');
        const dP = liquidExample.P1 - liquidExample.P2;
        const singlePass = liquidExample.q / (N.N1 * Fp) * Math.sqrt(liquidExample.relativeDensity / dP);

        // The handbook prints 125.7 and the engine is right at 125.21.
        // The gap is entirely the handbook rounding Fp to 0.90 for display:
        // feeding that rounded value back reproduces 125.70 to four figures.
        // Both are pinned so neither can drift unnoticed, and so that nobody
        // later "fixes" the engine to match the printed figure.
        expect(singlePass).toBeCloseTo(125.21, 1);
        const withRoundedFp = liquidExample.q / (N.N1 * 0.90) * Math.sqrt(liquidExample.relativeDensity / dP);
        expect(withRoundedFp).toBeCloseTo(125.7, 1);
        expect(Fp).toBeCloseTo(0.9036, 3);
    });

    test('the liquid example is not choked, as the handbook states', async ({ page }) => {
        const r = await call(page, 'size', liquidExample);
        expect(r.ok).toBe(true);
        expect(r.choked).toBe(false);
        expect(r.dPUsed).toBeCloseTo(r.dPSupplied, 9);
        expect(r.dPChoked).toBeGreaterThan(r.dPSupplied);
        expect(r.FF).toBeCloseTo(0.8343, 3);
    });

    test('the compressible worked example is not choked at rated xT', async ({ page }) => {
        // Section 5.9.5, superheated steam, Class 300 Fisher ED, linear cage.
        // The handbook's final 169 comes from iterating xT against the product
        // catalog at partial travel, ending at xT 0.754, which is valve
        // selection and not sizing arithmetic. So this asserts only what the
        // handbook states outright: the service is not choked at rated xT. The
        // converged Cv is deliberately NOT pinned against 169, because landing
        // near it by a different route would be a coincidence dressed up as
        // agreement.
        const r = await call(page, 'size', {
            service: 'gas',
            w: 125000 * LBH,
            P1: 514.7 * PSI,
            P2: 264.7 * PSI,
            rho1: 1.042 * LBFT3,
            gamma: 1.33,
            d: 4 * IN, D1: 6.1 * IN, D2: 6.1 * IN,
            FL: 0.82, xT: 0.690,
        });
        expect(r.ok).toBe(true);
        expect(r.choked).toBe(false);
        expect(r.x).toBeLessThan(r.xChoked);
        expect(r.Fgamma).toBeCloseTo(1.33 / 1.40, 12);
    });
});

test.describe('internal consistency', () => {
    test('the familiar one-liner falls out when nothing is corrected', async ({ page }) => {
        // Cv = Q sqrt(SG / dP) is the form most users will recognise, and it is
        // correct only for turbulent, non-choked liquid with no fittings. Here
        // it is a test case and not an assumption.
        const r = await call(page, 'rate', {
            service: 'liquid', P1: 1000, P2: 900, relativeDensity: 1.0,
            C: 100, FL: 0.9, d: 100, D1: 100, D2: 100,
        });
        expect(r.ok).toBe(true);
        expect(r.Fp).toBe(1);
        expect(r.q).toBeCloseTo(86.5, 12);
    });

    test('FF is bounded and reaches 0.96 as vapour pressure vanishes', async ({ page }) => {
        expect(await call(page, 'liquidCriticalPressureRatio', 0, 22064)).toBeCloseTo(0.96, 12);
        expect(await call(page, 'liquidCriticalPressureRatio', 22064, 22064)).toBeCloseTo(0.68, 12);
        for (const Pv of [1, 100, 1000, 10000, 22064]) {
            const FF = await call(page, 'liquidCriticalPressureRatio', Pv, 22064);
            // The bounds are approached, so they are asserted with one ulp of
            // slack: 0.96 - 0.28 evaluates to 0.6799999999999999 in binary
            // floating point, and demanding exactly 0.68 would fail a correct
            // engine on a representation artefact.
            expect(FF).toBeGreaterThanOrEqual(0.68 - 1e-12);
            expect(FF).toBeLessThanOrEqual(0.96 + 1e-12);
        }
    });

    test('geometry collapses to the identity when no fittings are attached', async ({ page }) => {
        const r = await call(page, 'rate', {
            service: 'gas', P1: 1000, P2: 900, rho1: 5, gamma: 1.4,
            C: 50, FL: 0.9, xT: 0.7, d: 100, D1: 100, D2: 100,
        });
        expect(r.Fp).toBe(1);
        expect(r.xTP).toBe(0.7);
    });

    test('the inlet group is not the full loss sum', async ({ page }) => {
        // Substituting sum_K for Ki in FLP and xTP is a plausible misreading
        // that returns a wrong but entirely reasonable-looking number, so assert
        // the two are genuinely different quantities.
        const k = await call(page, 'fittingCoefficients', 3 * IN, 8 * IN, 8 * IN);
        expect(Math.abs(k.Ki - k.sumK)).toBeGreaterThan(0.1);
        expect(k.Ki).toBeCloseTo(k.K1 + k.KB1, 12);
        expect(k.sumK).toBeCloseTo(k.K1 + k.K2 + k.KB1 - k.KB2, 12);
    });
});

test.describe('the expansion factor', () => {
    const gas = (page, P2) => call(page, 'rate', {
        service: 'gas', P1: 1000, P2, rho1: 5, gamma: 1.4,
        C: 100, FL: 0.9, xT: 0.7, d: 100, D1: 100, D2: 100,
    });

    test('Y is 1 at zero drop and exactly 2/3 at the choke boundary', async ({ page }) => {
        expect((await gas(page, 999.9999999)).Y).toBeCloseTo(1, 6);
        // Exactly, not approximately. Any other value here is an arithmetic
        // error and it is visible to the digit.
        expect((await gas(page, 1)).Y).toBe(2 / 3);
    });

    test('Y decreases monotonically and then holds', async ({ page }) => {
        const ys = await page.evaluate(() => {
            const out = [];
            for (let P2 = 990; P2 >= 10; P2 -= 10) {
                out.push(window.ControlValve.rate({
                    service: 'gas', P1: 1000, P2, rho1: 5, gamma: 1.4,
                    C: 100, FL: 0.9, xT: 0.7, d: 100, D1: 100, D2: 100,
                }).Y);
            }
            return out;
        });
        let prev = Infinity;
        for (const Y of ys) {
            expect(Y).toBeLessThanOrEqual(prev + 1e-15);
            expect(Y).toBeGreaterThanOrEqual(2 / 3 - 1e-15);
            prev = Y;
        }
    });
});

test.describe('the defining behavioural test', () => {
    // Past the choke point, more pressure drop produces no more flow. This is
    // the one test that would catch the defect the tool exists to prevent.
    // Flat means BITWISE equal, not equal within a tolerance: dP is capped
    // before it enters the equation, so every point past the boundary is the
    // same arithmetic on the same inputs. A tolerance would let a slow leak past
    // the cap through, which is what is being tested for.
    test('liquid flow goes flat past the choke point', async ({ page }) => {
        const flows = await page.evaluate(() => [300, 280, 260, 240, 220, 210, 205, 201].map((P2) =>
            window.ControlValve.rate({
                service: 'liquid', P1: 1000, P2, Pv: 200, Pc: 22064,
                relativeDensity: 1.0, C: 100, FL: 0.9, d: 100, D1: 100, D2: 100,
            })));
        for (const r of flows) expect(r.choked).toBe(true);
        for (const r of flows) expect(r.q).toBe(flows[0].q);
    });

    test('gas flow goes flat past the choke point', async ({ page }) => {
        const flows = await page.evaluate(() => [300, 250, 200, 150, 100, 50, 10].map((P2) =>
            window.ControlValve.rate({
                service: 'gas', P1: 1000, P2, rho1: 5, gamma: 1.4,
                C: 100, FL: 0.9, xT: 0.7, d: 100, D1: 100, D2: 100,
            })));
        for (const r of flows) expect(r.choked).toBe(true);
        for (const r of flows) expect(r.w).toBe(flows[0].w);
    });
});

test.describe('sizing and rating are mutual inverses', () => {
    test('liquid round trip across the turbulent region', async ({ page }) => {
        const results = await page.evaluate(() => [950, 900, 800, 700, 600].map((P2) => {
            const input = {
                service: 'liquid', P1: 1000, P2, Pv: 50, Pc: 22064,
                relativeDensity: 0.85, q: 120,
                d: 76.2, D1: 152.4, D2: 152.4, FL: 0.85,
            };
            const sized = window.ControlValve.size(input);
            const rated = window.ControlValve.rate({ ...input, C: sized.C });
            return { qIn: input.q, qOut: rated.q, ok: sized.ok && rated.ok };
        }));
        for (const r of results) {
            expect(r.ok).toBe(true);
            expect(rel(r.qOut, r.qIn)).toBeLessThan(1e-9);
        }
    });

    test('gas round trip across the turbulent region', async ({ page }) => {
        const results = await page.evaluate(() => [950, 900, 850, 800].map((P2) => {
            const input = {
                service: 'gas', P1: 1000, P2, rho1: 6.2, gamma: 1.31, w: 4000,
                d: 76.2, D1: 152.4, D2: 152.4, FL: 0.85, xT: 0.7,
            };
            const sized = window.ControlValve.size(input);
            const rated = window.ControlValve.rate({ ...input, C: sized.C });
            return { wIn: input.w, wOut: rated.w, ok: sized.ok && rated.ok };
        }));
        for (const r of results) {
            expect(r.ok).toBe(true);
            expect(rel(r.wOut, r.wIn)).toBeLessThan(1e-9);
        }
    });

    test('past the choke point the round trip is deliberately not an inverse', async ({ page }) => {
        // Sizing at any dP beyond the choke point returns the same C as sizing
        // at the choke point, because the extra differential buys nothing. The
        // asymmetry is asserted instead of ignored.
        const base = {
            service: 'liquid', P1: 1000, Pv: 200, Pc: 22064, relativeDensity: 1,
            q: 150, d: 100, D1: 100, D2: 100, FL: 0.9,
        };
        const a = await call(page, 'size', { ...base, P2: 300 });
        const b = await call(page, 'size', { ...base, P2: 210 });
        expect(a.choked).toBe(true);
        expect(b.choked).toBe(true);
        expect(a.C).toBe(b.C);
    });
});

test.describe('the iteration', () => {
    const withFittings = {
        service: 'liquid', P1: 2000, P2: 1800, Pv: 100, Pc: 22064,
        relativeDensity: 0.9, q: 200,
        d: 3 * IN, D1: 8 * IN, D2: 8 * IN, FL: 0.89,
    };

    test('converges inside the stated budget', async ({ page }) => {
        const r = await call(page, 'size', withFittings);
        const it = await surface(page, 'ITERATION');
        expect(r.ok).toBe(true);
        expect(r.converged).toBe(true);
        expect(r.iterations).toBeLessThanOrEqual(it.MAX_ITERATIONS);
        // Both numbers are pinned so the engine and the test cannot drift apart.
        expect(it.MAX_ITERATIONS).toBe(200);
        expect(it.REL_TOLERANCE).toBe(1e-10);
    });

    test('the budget covers the convergence rate the geometry implies', async ({ page }) => {
        // The contraction factor of the sizing fixed point is exactly 1 - Fp^2,
        // so the passes needed are ln(tol)/ln(1 - Fp^2). This pins the budget
        // against that relationship and not against a number somebody liked:
        // an Fp of 0.79 needs 23 passes, and that is why a budget of 20 declared a
        // perfectly ordinary reducer installation non-convergent.
        const r = await call(page, 'size', withFittings);
        const it = await surface(page, 'ITERATION');
        const predicted = Math.log(it.REL_TOLERANCE) / Math.log(1 - r.Fp ** 2);
        expect(r.iterations).toBeGreaterThan(predicted * 0.5);
        expect(r.iterations).toBeLessThan(predicted * 2 + 5);
        expect(it.MAX_ITERATIONS).toBeGreaterThan(predicted);
    });

    test('the converged answer differs from a single pass', async ({ page }) => {
        // Fp depends on C, which is the unknown, so sizing with fittings is
        // iterative in earnest. Dropping the iteration shifts the answer a few
        // percent with no visible symptom, so a refactor that drops it has to
        // fail loudly here instead of quietly in service.
        const r = await call(page, 'size', withFittings);
        const N = await surface(page, 'N');
        const singlePass = withFittings.q / (N.N1 * 1)
            * Math.sqrt(withFittings.relativeDensity / (withFittings.P1 - withFittings.P2));
        expect(rel(r.C, singlePass)).toBeGreaterThan(0.01);
    });

    test('fittings reduce capacity, so they raise the required coefficient', async ({ page }) => {
        const without = await call(page, 'size', { ...withFittings, D1: withFittings.d, D2: withFittings.d });
        const with_ = await call(page, 'size', withFittings);
        expect(with_.C).toBeGreaterThan(without.C);
        expect(with_.Fp).toBeLessThan(1);
        expect(without.Fp).toBe(1);
    });
});

test.describe('refusals', () => {
    const base = {
        service: 'liquid', P1: 1000, P2: 900, Pv: 100, Pc: 22064,
        relativeDensity: 1, q: 50, d: 100, D1: 100, D2: 100, FL: 0.9,
    };

    // Every out-of-domain input returns a named code, never a number, never NaN
    // and never Infinity. This is the direct analogue of the beam tool's
    // negative-load defect, where an upward load produced a negative deflection
    // that then passed its own limit check. Same failure shape, same test shape.
    const cases = [
        ['P2 equal to P1', { P2: 1000 }, 'REVERSE_DIFFERENTIAL'],
        ['P2 above P1', { P2: 1100 }, 'REVERSE_DIFFERENTIAL'],
        ['non-positive P1', { P1: 0, P2: -10 }, 'NON_POSITIVE_INLET'],
        ['vapour pressure above inlet', { Pv: 1500 }, 'VAPOUR_ABOVE_INLET'],
        ['non-positive vapour pressure', { Pv: -1 }, 'NON_POSITIVE_PROPERTY'],
        ['non-positive critical pressure', { Pc: 0 }, 'NON_POSITIVE_PROPERTY'],
        ['flashing service', { P2: 50 }, 'FLASHING'],
        ['valve wider than the pipe', { d: 200 }, 'BAD_GEOMETRY'],
    ];

    for (const [label, patch, code] of cases) {
        test(`${label} is refused by name`, async ({ page }) => {
            const r = await call(page, 'size', { ...base, ...patch });
            expect(r.ok).toBe(false);
            expect(r.code).toBe(code);
            expect(typeof r.error).toBe('string');
            expect(r.error.length).toBeGreaterThan(20);
            expect(r.C).toBeUndefined();
        });
    }

    test('a flashing refusal still carries its regime', async ({ page }) => {
        // The badge must read on a refusal too. An error message with no regime
        // beside it tells the user the tool broke, when the truth is that their
        // service is two-phase and cannot be sized by these equations.
        const r = await call(page, 'size', { ...base, P2: 50 });
        expect(r.ok).toBe(false);
        expect(r.regime).toBe('flashing');
    });

    test('the boundary is a clean transition, not a gradual one', async ({ page }) => {
        // Sweep across P2 = P1 and assert the answer goes from a number to a
        // named refusal with nothing in between: no NaN, no Infinity, no zero.
        for (const P2 of [999.9, 999.99, 1000, 1000.01]) {
            const r = await call(page, 'size', { ...base, P2 });
            if (P2 < 1000) {
                expect(r.ok).toBe(true);
                expect(Number.isFinite(r.C)).toBe(true);
                expect(r.C).toBeGreaterThan(0);
            } else {
                expect(r.ok).toBe(false);
                expect(r.code).toBe('REVERSE_DIFFERENTIAL');
            }
        }
    });
});

test.describe('regime classification', () => {
    test('every result carries exactly one regime word', async ({ page }) => {
        const words = Object.values(await surface(page, 'REGIMES'));
        const got = await page.evaluate(() => [950, 800, 600, 400, 300, 250, 210]
            .map((P2) => window.ControlValve.rate({
                service: 'liquid', P1: 1000, P2, Pv: 200, Pc: 22064,
                relativeDensity: 1, C: 100, FL: 0.9, d: 100, D1: 100, D2: 100,
            }))
            .filter((r) => r.ok)
            .map((r) => r.regime));
        expect(got.length).toBeGreaterThan(0);
        for (const regime of got) expect(words).toContain(regime);
    });

    test('a low-recovery valve cavitates at a far lower differential', async ({ page }) => {
        // Physical behaviour, not arithmetic. A butterfly valve recovers
        // more pressure, so its vena contracta drops below the vapour pressure
        // much earlier than a globe valve's does. This is the qualitative claim
        // the style library makes, checked against the engine.
        const onset = (FL) => page.evaluate((fl) => {
            for (let P2 = 995; P2 >= 310; P2 -= 1) {
                const r = window.ControlValve.rate({
                    service: 'liquid', P1: 1000, P2, Pv: 300, Pc: 22064,
                    relativeDensity: 1, C: 100, FL: fl, d: 100, D1: 100, D2: 100,
                });
                if (r.ok && (r.regime === 'cavitating' || r.regime === 'choked')) return 1000 - P2;
            }
            return null;
        }, FL);
        const globe = await onset(0.90);
        const butterfly = await onset(0.55);
        expect(butterfly).toBeLessThan(globe / 2);
    });

    test('sigma is reported and its definition is the documented one', async ({ page }) => {
        const r = await call(page, 'rate', {
            service: 'liquid', P1: 1000, P2: 700, Pv: 100, Pc: 22064,
            relativeDensity: 1, C: 100, FL: 0.9, d: 100, D1: 100, D2: 100,
        });
        expect(r.sigma).toBeCloseTo((1000 - 100) / (1000 - 700), 12);
        expect(r.Pvc).toBeCloseTo(1000 - 300 / 0.81, 9);
    });

    test('missing vapour pressure leaves the checks null, never passed', async ({ page }) => {
        // null means the check did not run. Zero would mean it ran and returned
        // zero. The refusal posture of the whole tool depends on those two never
        // being the same value.
        const r = await call(page, 'rate', {
            service: 'liquid', P1: 1000, P2: 900, relativeDensity: 1,
            C: 100, FL: 0.9, d: 100, D1: 100, D2: 100,
        });
        expect(r.sigma).toBeNull();
        expect(r.dPChoked).toBeNull();
        expect(r.warnings.map((x) => x.code)).toContain('NO_VAPOUR_PRESSURE');
    });
});

test.describe('the advisories', () => {
    const liquid = (page, patch) => call(page, 'rate', {
        service: 'liquid', P1: 1000, P2: 950, Pv: 100, Pc: 22064,
        relativeDensity: 1, C: 100, FL: 0.9, d: 100, D1: 100, D2: 100, ...patch,
    });

    test('a choked result says so', async ({ page }) => {
        const r = await liquid(page, { P2: 250, Pv: 150 });
        expect(r.choked).toBe(true);
        const choked = r.warnings.find((x) => x.code === 'CHOKED');
        expect(choked).toBeTruthy();
        expect(choked.severity).toBe('warn');
    });

    test('a comfortable result does not', async ({ page }) => {
        const r = await liquid(page, {});
        const codes = r.warnings.map((x) => x.code);
        expect(codes).not.toContain('CHOKED');
        expect(codes).not.toContain('CAVITATING');
    });

    test('the tool discloses that it cannot verify turbulence', async ({ page }) => {
        // FR is unavailable, and turbulent flow is a PRECONDITION of every
        // equation here and not an optional correction. Saying only that a
        // correction was not applied would understate it.
        const r = await liquid(page, {});
        expect(r.warnings.map((x) => x.code)).toContain('NO_REYNOLDS_CHECK');
    });

    test('silence on cavitation is not a clean bill of health', async ({ page }) => {
        // The vena contracta criterion only fires close to the choke point: at
        // the choke point Pvc = FF*Pv exactly, so the window where Pvc < Pv but
        // the service is not yet choked spans only Pv(1-FF), about 7% of Pv.
        // The tool says so instead of letting an absent flag read as an absent
        // problem.
        const r = await liquid(page, {});
        expect(r.warnings.map((x) => x.code)).toContain('CAVITATION_DETECTION_LIMIT');
    });

    test('every advisory carries a severity the UI can act on', async ({ page }) => {
        const r = await liquid(page, { P2: 250, Pv: 150 });
        expect(r.warnings.length).toBeGreaterThan(0);
        for (const wrn of r.warnings) {
            expect(['error', 'warn', 'info']).toContain(wrn.severity);
            expect(typeof wrn.code).toBe('string');
            expect(wrn.message.length).toBeGreaterThan(20);
        }
    });
});


test.describe('the vendored water saturation table', () => {
    // Vendoring earns its keep only if the duplication is proved. Read the source CSV here in Node, because
    // the page runs default-src 'none' and cannot fetch it, and compare.
    //
    // Four things decide whether this test proves anything, so they are explicit:
    // the CSV has a UTF-8 BOM, six metadata rows ahead of its header, degrees C
    // where the table has kelvin, and MPa where the table has kPa. Getting any
    // of them wrong yields a test that passes while comparing nothing.
    const readCsv = () => {
        const file = path.resolve(__dirname, '..', '..', 'data', 'steam_tables', 'saturated_by_T.csv');
        let text = fs.readFileSync(file, 'utf8');
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);   // strip the BOM
        const lines = text.split(String.fromCharCode(10))
            .map((l) => (l.endsWith(String.fromCharCode(13)) ? l.slice(0, -1) : l));
        const header = lines.findIndex((l) => l.startsWith('T ('));
        expect(header).toBeGreaterThan(0);   // the metadata rows really are there
        const rows = new Map();
        for (const line of lines.slice(header + 1)) {
            const parts = line.split(',');
            if (parts.length < 2 || !parts[0]) continue;
            const T = Number(parts[0]);
            const P = Number(parts[1]);
            if (!Number.isFinite(T) || !Number.isFinite(P)) continue;
            rows.set(Number(T.toFixed(3)), P * 1000);   // MPa -> kPa
        }
        return rows;
    };

    test('every vendored knot still agrees with the source CSV', async ({ page }) => {
        const csv = readCsv();
        expect(csv.size).toBeGreaterThan(300);
        const table = await surface(page, 'WATER_PSAT_KPA');
        expect(table.length).toBe(41);
        for (const [T_K, P_kPa] of table) {
            const T_C = Number((T_K - 273.15).toFixed(3));
            const fromCsv = csv.get(T_C);
            expect(fromCsv, `no CSV row at ${T_C} C`).toBeDefined();
            // Exact: these knots were copied from those rows, so any drift in
            // either file is a real divergence and not a rounding artefact.
            expect(P_kPa).toBeCloseTo(fromCsv, 9);
        }
    });

    test('log interpolation stays inside its measured error bound', async ({ page }) => {
        // The comment in fluids.js claims 0.17% worst case over 0 to 200 C.
        // A claim in a comment is worth nothing unless something checks it, so
        // this walks every 1 C row of the CSV between the knots and measures.
        const csv = readCsv();
        const samples = [...csv.entries()].filter(([T_C]) => T_C >= 0 && T_C <= 200);
        const worst = await page.evaluate((rows) => {
            let max = 0;
            for (const [T_C, P] of rows) {
                const got = window.ControlValve.waterSaturationPressure(T_C + 273.15);
                if (got === null) continue;
                max = Math.max(max, Math.abs(got - P) / P);
            }
            return max;
        }, samples);
        expect(worst).toBeLessThan(0.0025);
        // And confirm it is genuinely better than interpolating the pressure
        // directly, which is the reason log space was chosen.
        expect(worst).toBeLessThan(0.0138);
    });

    test('outside the tabulated range it returns null, never an extrapolation', async ({ page }) => {
        // Extrapolating a saturation curve is a silent error: it stays smooth
        // and plausible while diverging fast, and the caller cannot tell.
        expect(await call(page, 'waterSaturationPressure', 272)).toBeNull();
        expect(await call(page, 'waterSaturationPressure', 500)).toBeNull();
        expect(await call(page, 'waterSaturationPressure', NaN)).toBeNull();
        expect(await call(page, 'waterSaturationPressure', 373.15)).toBeCloseTo(101.42, 6);
    });
});

test.describe('gas properties', () => {
    test('molecular weight is checked against the formula, not trusted', async ({ page }) => {
        // The one quantity in this tool that admits a first-principles check.
        // Everything else rests on empirical correlations or flow-test
        // measurements; a molecular weight is a sum, so it gets summed.
        const gases = await surface(page, 'GASES');
        let checked = 0;
        for (const g of gases) {
            if (!g.formula) continue;   // air is a mixture, not a compound
            const computed = await call(page, 'molecularWeightFromFormula', g.formula);
            expect(Math.abs(computed - g.MW) / g.MW, `${g.id}`).toBeLessThan(0.001);
            checked += 1;
        }
        expect(checked).toBeGreaterThanOrEqual(9);
    });

    test('every gas row cites its source and none ships unreviewed', async ({ page }) => {
        const gases = await surface(page, 'GASES');
        expect(gases.length).toBeGreaterThanOrEqual(10);
        for (const g of gases) {
            expect(g.reviewed).toBe(true);
            expect(g.source).toMatch(/Fisher Control Valve Handbook/);
            expect(g.gamma).toBeGreaterThan(1);
            expect(g.gamma).toBeLessThan(2);
        }
    });

    test('methane carries its cited value, not the remembered one', async ({ page }) => {
        // The handbook prints 1.26. The figure most often quoted from memory is
        // about 1.32 near ambient. This pins the row to its source so that a
        // later "correction" from recall has to argue with a test instead of
        // slip in, which is the same discipline that caught N6 being 2.73 for
        // kPa and 27.3 for bar.
        const gases = await surface(page, 'GASES');
        const methane = gases.find((g) => g.id === 'methane');
        expect(methane.gamma).toBe(1.26);
    });
});

test.describe('the valve style library', () => {
    test('no row ships unreviewed, and every row cites the handbook', async ({ page }) => {
        const styles = await surface(page, 'VALVE_STYLES');
        expect(styles.length).toBeGreaterThan(10);
        for (const row of styles) {
            expect(row.reviewed).toBe(true);
            expect(row.source).toMatch(/Fisher Control Valve Handbook/);
            expect(row.FL).toBeGreaterThan(0);
            expect(row.FL).toBeLessThanOrEqual(1);
            expect(row.xT).toBeGreaterThan(0);
            expect(row.xT).toBeLessThan(1);
        }
    });

    test('no published cavitation limit exists, and that is recorded not hidden', async ({ page }) => {
        // The handbook publishes no incipient cavitation limits for any style,
        // so this column is null everywhere and the sigma comparison never runs.
        // Asserting it keeps the gap visible: if a row ever gains a limit, this
        // fails and somebody has to decide whether it is properly sourced.
        const styles = await surface(page, 'VALVE_STYLES');
        expect(styles.every((s) => s.sigmaIncipient === null)).toBe(true);
    });

    test('the butterfly rows carry the lowest recovery factors', async ({ page }) => {
        // Not decoration. A low FL is why the butterfly cavitates at a
        // differential a globe valve passes without complaint, which the regime
        // test above demonstrates on the engine itself.
        const styles = await surface(page, 'VALVE_STYLES');
        const worstButterfly = Math.min(...styles.filter((s) => s.id.startsWith('butterfly')).map((s) => s.FL));
        const worstGlobe = Math.min(...styles.filter((s) => s.id.startsWith('globe')).map((s) => s.FL));
        expect(worstButterfly).toBeLessThan(worstGlobe);
    });

    test('ids are unique', async ({ page }) => {
        const ids = (await surface(page, 'VALVE_STYLES')).map((s) => s.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
});

test.describe('characteristics and authority', () => {
    // Section 3.8 of the SOW had no test anywhere in the first draft, while the
    // acceptance criteria claimed every equation in section 3 had one. This is
    // that gap closed. It is also the tool's most novel output and the one with
    // the weakest claim on reality: C(h) is an idealisation and real trim is
    // manufactured to a tolerance on it.

    test('the inherent forms hit their defined endpoints', async ({ page }) => {
        for (const kind of ['linear', 'equal-percentage', 'quick-opening']) {
            expect(await call(page, 'inherentCoefficient', kind, 1, 100)).toBeCloseTo(100, 9);
        }
        expect(await call(page, 'inherentCoefficient', 'linear', 0, 100)).toBe(0);
        expect(await call(page, 'inherentCoefficient', 'quick-opening', 0, 100)).toBe(0);
        // Equal percentage lands on Crated / R, which is not a rounding
        // artefact: it is the DEFINITION of rangeability, the ratio of maximum
        // to minimum controllable flow. Trim that reached zero would have
        // infinite rangeability.
        expect(await call(page, 'inherentCoefficient', 'equal-percentage', 0, 100, 50)).toBeCloseTo(2, 12);
    });

    test('equal percentage has constant gain, which is what the name means', async ({ page }) => {
        // (dC/dh)/C is constant and equals ln(R). This is the one property a
        // wrong exponent breaks while still producing a plausible curve.
        const gains = await page.evaluate(() => [0.2, 0.5, 0.8].map((h) => {
            const e = 1e-6;
            const f = (x) => window.ControlValve.inherentCoefficient('equal-percentage', x, 100, 50);
            return ((f(h + e) - f(h - e)) / (2 * e)) / f(h);
        }));
        for (const g of gains) expect(g).toBeCloseTo(Math.log(50), 6);
    });

    test('travel inverts the characteristic exactly', async ({ page }) => {
        for (const kind of ['linear', 'equal-percentage', 'quick-opening']) {
            for (const h of [0.15, 0.5, 0.85]) {
                const C = await call(page, 'inherentCoefficient', kind, h, 100);
                const back = await call(page, 'travelForCoefficient', kind, C, 100);
                expect(back).toBeCloseTo(h, 10);
            }
        }
    });

    test('installed equals inherent when the valve takes the whole drop', async ({ page }) => {
        // The degenerate case, and the honest check on the whole system model.
        // At authority 1 the system resistance is exactly zero and the two
        // curves coincide. Same shape of test as Fp = 1 when d = D1 = D2.
        const r = await call(page, 'installedCharacteristic', {
            characteristic: 'equal-percentage', Crated: 100,
            dPTotal: 1000, dPValveOpen: 1000, relativeDensity: 1, N1: 0.0865,
        });
        expect(r.authority).toBe(1);
        expect(r.Ksys).toBe(0);
        expect(r.maxDistortion).toBeCloseTo(0, 12);
    });

    test('a hand-computed installed point at authority 0.25', async ({ page }) => {
        // Linear trim, Crated 100, dPTotal 1000 kPa, valve taking 250 at full
        // open. By hand: qOpen = N1 * 100 * sqrt(250) = 136.7685,
        // Ksys = 750 / qOpen^2 = 0.0400949, and at half travel C = 50 so
        // q = sqrt(1000 / (1/(N1*50)^2 + Ksys)) = 103.3873.
        //
        // Normalised that is 0.7559 against an inherent 0.5: at HALF travel the
        // valve already passes three quarters of its full flow. That is the
        // distortion this whole section exists to make visible, pinned as a
        // number so it cannot quietly stop happening.
        const r = await call(page, 'installedCharacteristic', {
            characteristic: 'linear', Crated: 100,
            dPTotal: 1000, dPValveOpen: 250, relativeDensity: 1, N1: 0.0865, points: 21,
        });
        expect(r.authority).toBeCloseTo(0.25, 12);
        expect(r.qOpen).toBeCloseTo(136.768509, 5);
        expect(r.Ksys).toBeCloseTo(0.0400948912, 9);
        const half = r.installedNormalised.find(([h]) => Math.abs(h - 0.5) < 1e-9);
        expect(half[1]).toBeCloseTo(0.75592895, 7);
    });

    test('authority falls as system resistance rises, and distortion follows', async ({ page }) => {
        const got = await page.evaluate(() => [1.0, 0.5, 0.25, 0.1].map((a) => {
            const r = window.ControlValve.installedCharacteristic({
                characteristic: 'equal-percentage', Crated: 100,
                dPTotal: 1000, dPValveOpen: 1000 * a, relativeDensity: 1, N1: 0.0865,
            });
            return { authority: r.authority, distortion: r.maxDistortion, Ksys: r.Ksys };
        }));
        for (const g of got) {
            expect(g.authority).toBeGreaterThan(0);
            expect(g.authority).toBeLessThanOrEqual(1);
        }
        // Monotone: less authority, more distortion, more system resistance.
        for (let i = 1; i < got.length; i++) {
            expect(got[i].authority).toBeLessThan(got[i - 1].authority);
            expect(got[i].distortion).toBeGreaterThan(got[i - 1].distortion);
            expect(got[i].Ksys).toBeGreaterThan(got[i - 1].Ksys);
        }
    });

    test('low authority raises its advisory and adequate authority does not', async ({ page }) => {
        // Below about 0.25 an equal-percentage valve flattens toward a
        // linear-then-saturating installed shape, which is the mechanism behind
        // a loop that tunes at low flow and hunts near full open. Invisible in
        // the coefficient, so it has to be said.
        const withSystem = (dPValveOpen) => call(page, 'size', {
            service: 'liquid', P1: 1000, P2: 700, Pv: 2.34, Pc: 22064,
            relativeDensity: 1, q: 50, d: 100, D1: 100, D2: 100, FL: 0.9,
            characteristic: 'equal-percentage', Crated: 100,
            dPTotal: 1500, dPValveOpen,
        });
        const healthy = await withSystem(900);      // authority 0.60
        const poor = await withSystem(300);         // authority 0.20
        expect(healthy.warnings.map((w) => w.code)).not.toContain('LOW_AUTHORITY');
        expect(poor.warnings.map((w) => w.code)).toContain('LOW_AUTHORITY');
        expect(poor.characteristic.authority).toBeCloseTo(0.2, 9);
    });

    test('the characteristic is null when no system was supplied', async ({ page }) => {
        // Not a default system, and not a plausible authority. A number here
        // would describe no installation at all, and the posture of this whole
        // tool is that a check which did not run says so.
        const r = await call(page, 'size', {
            service: 'liquid', P1: 1000, P2: 700, Pv: 2.34, Pc: 22064,
            relativeDensity: 1, q: 50, d: 100, D1: 100, D2: 100, FL: 0.9,
        });
        expect(r.ok).toBe(true);
        expect(r.characteristic).toBeNull();
    });

    test('the plot draws both curves and separates them by more than colour', async ({ page }) => {
        await page.selectOption('#characteristic', 'equal-percentage');
        const chart = page.locator('#characteristicChart');
        await expect(chart.locator('polyline.chart-inherent')).toHaveCount(1);
        await expect(chart.locator('polyline.chart-installed')).toHaveCount(1);
        // Dash pattern, not just stroke colour, so the two are separable
        // without relying on hue. Same reasoning as the regime badge icon.
        const dashed = await chart.locator('polyline.chart-inherent').evaluate(
            (n) => getComputedStyle(n).strokeDasharray);
        const solid = await chart.locator('polyline.chart-installed').evaluate(
            (n) => getComputedStyle(n).strokeDasharray);
        expect(dashed).not.toBe(solid);
        expect(dashed).not.toMatch(/^none$/);
        // The figure carries an accessible name and is not a bare graphic.
        await expect(chart.locator('title')).toHaveCount(1);
    });

    test('the plot clears when the characteristic is switched off', async ({ page }) => {
        await page.selectOption('#characteristic', 'linear');
        await expect(page.locator('#characteristicChart polyline')).toHaveCount(2);
        await page.selectOption('#characteristic', '');
        await expect(page.locator('#characteristicChart polyline')).toHaveCount(0);
        await expect(page.locator('#characteristicDetail')).toContainText('not computed');
    });
});

test.describe('external goldens', () => {
    // Worked examples from documents OTHER than the one the engine was built
    // from. Until these existed the compressible side had no external anchor at
    // all: it rested on internal consistency and the exact Y = 2/3 boundary,
    // which are self-consistency checks and not the same thing as being right.
    //
    // The standard works in Kv and the engine in Cv, so IEC answers are compared
    // after converting back. That conversion is itself a check: the handbook's
    // Kv row for N1 is 0.1 against the Cv row's 0.0865, and 0.0865 / 0.1 is
    // exactly the 0.865 Kv-per-Cv factor.
    const kv = (page, C) => page.evaluate((c) => window.ControlValve.units.cvToKv(c), C);

    test('IEC example 1: liquid, non-choked, no fittings', async ({ page }) => {
        // IS/IEC 60534-2-1:1998 annex D. Water at 363 K, and the standard prints
        // Kv = 165.
        const r = await call(page, 'size', {
            service: 'liquid', P1: 680, P2: 220, Pv: 70.1, Pc: 22120,
            relativeDensity: 0.965, q: 360, d: 150, D1: 150, D2: 150, FL: 0.90,
        });
        expect(r.ok).toBe(true);
        expect(r.choked).toBe(false);
        expect(rel(await kv(page, r.C), 165)).toBeLessThan(0.002);
        // The standard's own FF, printed as 0.944.
        expect(r.FF).toBeCloseTo(0.944, 3);
        // And its choke threshold, printed as 497.2 kPa.
        expect(r.dPChoked).toBeCloseTo(497.2, 0);
    });

    test('IEC example 2: liquid, choked, no fittings', async ({ page }) => {
        // Same service, a segmented ball valve at FL 0.60 instead of a globe at
        // 0.90. The standard prints Kv = 238 and a choke threshold of 221 kPa,
        // against the 460 kPa actually available.
        const r = await call(page, 'size', {
            service: 'liquid', P1: 680, P2: 220, Pv: 70.1, Pc: 22120,
            relativeDensity: 0.965, q: 360, d: 100, D1: 100, D2: 100, FL: 0.60,
        });
        expect(r.choked).toBe(true);
        expect(r.dPChoked).toBeCloseTo(221, 0);
        expect(r.dPUsed).toBeCloseTo(221, 0);
        expect(rel(await kv(page, r.C), 238)).toBeLessThan(0.002);
    });

    test('IEC example 3: the fitting coefficients, to the digit', async ({ page }) => {
        // d 50 in an 80 by 100 mm reducer pair. Every one of these is printed in
        // the standard, and they are the six numbers most easily transposed:
        // K2 carries a coefficient of 1.0 where K1 carries 0.5, and the
        // Bernoulli pair enters sum K with OPPOSITE signs.
        const k = await call(page, 'fittingCoefficients', 50, 80, 100);
        expect(k.K1).toBeCloseTo(0.186, 3);
        expect(k.K2).toBeCloseTo(0.563, 3);
        expect(k.KB1).toBeCloseTo(0.847, 3);
        expect(k.KB2).toBeCloseTo(0.938, 3);
        expect(k.sumK).toBeCloseTo(0.658, 3);
        // The inlet group alone, which drives xTP and FLP. Substituting sum K
        // here is the plausible misreading, and the two differ by 0.375.
        expect(k.Ki).toBeCloseTo(1.033, 3);
        expect(Math.abs(k.Ki - k.sumK)).toBeGreaterThan(0.3);
    });

    test('IEC example 3: compressible, non-choked, before the reducers', async ({ page }) => {
        // Carbon dioxide, quoted at 3800 standard m3/h AT 0 C. The engine's
        // standard state is 15 C at the same pressure base, so the same molar
        // flow is a larger volume by T15 / T0. The standard prints Kv = 62.7 and
        // Y = 0.674 for this first pass with Fp assumed 1.
        const q15 = 3800 * (288.15 / 273.15);
        const r = await call(page, 'size', {
            service: 'gas', P1: 680, P2: 310, q: q15, MW: 44.01, T1: 433, Z: 0.988,
            gamma: 1.30, xT: 0.60, FL: 0.85, d: 80, D1: 80, D2: 80,
        });
        expect(r.choked).toBe(false);
        expect(r.Fgamma).toBeCloseTo(0.929, 3);
        expect(r.x).toBeCloseTo(0.544, 3);
        expect(r.Y).toBeCloseTo(0.674, 3);
        expect(rel(await kv(page, r.C), 62.7)).toBeLessThan(0.005);
    });

    test('IEC example 3 disagrees on Y with fittings, and the standard settles it against itself', async ({ page }) => {
        // The one place a published worked answer and this engine part company.
        //
        // The example computes Y once with xT, before the reducers are applied,
        // then reuses that Y in the final calculation after Fp has changed. This
        // engine recomputes Y with xTP, and the two answers differ by about 2%.
        //
        // The standard's OWN normative equations decide it. Clause 7.1.2.2,
        // equation (17), is the choked-with-fittings form and reads
        // C = Q / (0.667 N9 Fp p1) sqrt(M T1 Z / (Fy xTP)), so at the choke
        // point the standard itself uses Y = 0.667 together with x = Fy xTP.
        // The non-choked branch has to meet that value at the boundary itself,
        // because
        // the flow does not jump when it chokes. Only Y taking xTP does:
        //
        //   Y(x = Fy xTP) with xTP  =  1 - 1/3  =  0.6667 exactly
        //   Y(x = Fy xTP) with xT   =  1 - xTP/(3 xT)
        //
        // which equals 2/3 only when xTP = xT, that is, only with no fittings.
        // Taking xT therefore leaves a step in the flow curve at the choke
        // point, and that is the defect this tool refuses everywhere else.
        const gamma = 1.30, xT = 0.60;
        const Fgamma = gamma / 1.40;
        const xTP = 0.582 / Fgamma;          // the standard prints Fy xTP = 0.582
        const boundary = Fgamma * xTP;

        const withXT = 1 - boundary / (3 * Fgamma * xT);
        const withXTP = 1 - boundary / (3 * Fgamma * xTP);
        expect(withXTP).toBeCloseTo(2 / 3, 12);
        expect(Math.abs(withXT - 2 / 3)).toBeGreaterThan(0.01);

        // And the engine is on the continuous side: sweep across the choke
        // boundary of a valve WITH fittings and the coefficient has no step.
        const across = await page.evaluate(() => {
            const q15 = 3800 * (288.15 / 273.15);
            return [0.98, 0.995, 1.0, 1.005, 1.02].map((f) => {
                const base = { service: 'gas', q: q15, MW: 44.01, T1: 433, Z: 0.988,
                    gamma: 1.30, xT: 0.60, FL: 0.85, d: 50, D1: 80, D2: 100, P1: 680 };
                const probe = window.ControlValve.size({ ...base, P2: 310 });
                const xChoke = probe.xChoked;
                return window.ControlValve.size({ ...base, P2: 680 * (1 - f * xChoke) }).C;
            });
        });
        for (let i = 1; i < across.length; i++) {
            expect(rel(across[i], across[i - 1])).toBeLessThan(0.02);
        }
    });

    test('Fisher 5.9.4: the compressible answer reproduces in the handbook units', async ({ page }) => {
        // Natural gas through a V250 ball valve, printed Cv = 923 at the
        // converged xT of 0.372. Run in the handbook's own US constants this is
        // 922.75, a 0.03% match, which is what anchors the gas equation.
        //
        // Through the engine's metric constants it lands at 917.2 instead. That
        // gap is NOT the equation: N9 is published against three separate
        // reference states and the engine declares the 15 C one, while this
        // example uses the 60 F row. See the N9 test below.
        const got = await page.evaluate(() => {
            const gamma = 1.31, xT = 0.372, N9 = 7320;
            const P1 = 214.7, P2 = 64.7, q = 6.0e6, M = 17.38, T1 = 520, Z = 1;
            const Fgamma = gamma / 1.40;
            const x = (P1 - P2) / P1;
            const xChoked = Fgamma * xT;
            const xUsed = Math.min(x, xChoked);
            const Y = 1 - xUsed / (3 * Fgamma * xT);
            return { Y, choked: x >= xChoked, Cv: q / (N9 * Y * P1) * Math.sqrt((M * T1 * Z) / xUsed) };
        });
        expect(got.choked).toBe(true);
        expect(got.Y).toBeCloseTo(2 / 3, 12);
        expect(rel(got.Cv, 923)).toBeLessThan(0.001);
    });

    test('N9 carries three reference states, and they are not unit conversions of each other', async ({ page }) => {
        // The finding behind the 0.6% in the test above. The handbook prints
        // 21.2 for a 0 C basis, 22.5 for 15 C and 7320 for 60 F, all at a
        // 101.3 kPa pressure base. Converting the 60 F row into metric units
        // gives 22.41, not 22.5, because it is a DIFFERENT reference state plus
        // three-figure rounding. A test that expected them to reconcile by unit
        // conversion alone would be asserting something untrue.
        const N = await surface(page, 'N');
        expect(N.N9).toBe(22.5);
        const converted = 7320 * 0.028316846592 * Math.sqrt(5 / 9) / 6.894757293168361;
        expect(converted).toBeCloseTo(22.41, 2);
        expect(rel(converted, N.N9)).toBeGreaterThan(0.002);
        expect(rel(converted, N.N9)).toBeLessThan(0.01);
        // The pure temperature shift accounts for about half of it.
        const shift = ((60 - 32) * 5 / 9 + 273.15) / 288.15;
        expect(shift).toBeCloseTo(1.0019, 4);
        const state = await surface(page, 'STANDARD_CONDITIONS');
        expect(state.T_K).toBe(288.15);
    });

    test('Fisher 5.9.5: the handbook stops the fittings iteration early, and says so', async ({ page }) => {
        // Superheated steam, mass flow, NPS 4 ED valve in a 6.1 inch line, so
        // reducers. The handbook prints Cv = 169.
        //
        // Its step 3 says to evaluate Fp and xTP at an ESTIMATED Cv, and it uses
        // the assumed valve's rated 236. One pass at that estimate gives 169.16,
        // which is the printed answer. The handbook's own instruction is then to
        // iterate if the result is not close to the estimate, and 236 against
        // 169 is not close, so the engine keeps going and converges at 163.5.
        //
        // Same lesson as the liquid example printing 125.7 where exact
        // arithmetic gives 125.21: a published worked answer carries its
        // author's stopping rule, and pinning one tightly fails a correct engine.
        const PSI = 6.894757293168361, IN = 25.4, LB = 0.45359237, LBFT3 = 16.018463373960143;
        const steam = {
            service: 'gas', P1: 514.7 * PSI, P2: 264.7 * PSI,
            w: 125000 * LB, rho1: 1.042 * LBFT3, gamma: 1.33, xT: 0.754,
            d: 4 * IN, D1: 6.1 * IN, D2: 6.1 * IN,
        };
        const converged = await call(page, 'size', steam);
        expect(converged.choked).toBe(false);
        expect(converged.C).toBeCloseTo(163.55, 1);

        // Reproduce the handbook's single pass at its own estimate of 236.
        const singlePass = await page.evaluate((s) => {
            const CV = window.ControlValve;
            const k = CV.fittingCoefficients(s.d, s.D1, s.D2);
            const Fp = CV.pipingGeometryFactor(236, s.d, k);
            const xTP = CV.correctedTerminalRatio(s.xT, Fp, 236, s.d, k);
            const Fgamma = s.gamma / 1.40;
            const x = (s.P1 - s.P2) / s.P1;
            const xUsed = Math.min(x, Fgamma * xTP);
            const Y = 1 - xUsed / (3 * Fgamma * xTP);
            return s.w / (CV.N.N6 * Fp * Y * Math.sqrt(xUsed * s.P1 * s.rho1));
        }, steam);
        expect(rel(singlePass, 169)).toBeLessThan(0.002);
        // The two differ by enough to matter, which is the whole point.
        expect(rel(singlePass, converged.C)).toBeGreaterThan(0.02);
    });

    test('a second publisher agrees on the constants the engine transcribed', async ({ page }) => {
        // The Masoneilan handbook is an independent transcription of the same
        // ISA/IEC tables by a different manufacturer. It prints the same N1, N2
        // and N6 metric rows the engine carries, which is the only real check
        // available on a transcription short of buying the standard twice.
        const N = await surface(page, 'N');
        expect(N.N1).toBe(0.0865);
        expect(N.N2).toBe(0.00214);
        expect(N.N6).toBe(2.73);
        // It also publishes the constant the engine records as unavailable.
        // N4 = 76000 for m3/h, mm and centistokes. Having it is necessary for
        // the valve Reynolds number but not sufficient for FR, whose curve is
        // still only in the standard, so N4 stays null and the tool keeps
        // saying turbulence was not verified.
        expect(N.N4).toBeNull();
    });
});

test.describe('the audit pass', () => {
    // Every defect in this block was live while all 66 preceding tests passed.
    // That is the finding behind the whole section: the spec proved the
    // equations to four figures and never once handed the engine a number a
    // valve could not have. These are the boundary, not the physics.

    const liquid = {
        service: 'liquid', P1: 1000, P2: 700, Pv: 2.34, Pc: 22064,
        relativeDensity: 1, q: 50, d: 100, D1: 100, D2: 100, FL: 0.9,
    };
    const gas = {
        service: 'gas', P1: 1000, P2: 700, w: 2000, rho1: 5,
        gamma: 1.4, xT: 0.7, d: 100, D1: 100, D2: 100,
    };

    test('a coefficient outside its definition is refused, not sized around', async ({ page }) => {
        // FL and xT are not scale factors, they ARE the choking and cavitation
        // apparatus. Accepting one outside its range does not produce a visibly
        // wrong number, it produces an ordinary one with the checks switched off.
        const cases = [
            ['FL above 1', 'size', { ...liquid, FL: 1.5 }, 'FL_OUT_OF_RANGE'],
            ['FL at zero', 'size', { ...liquid, FL: 0 }, 'FL_OUT_OF_RANGE'],
            ['FL negative', 'size', { ...liquid, FL: -0.9 }, 'FL_OUT_OF_RANGE'],
            ['FL missing', 'size', { ...liquid, FL: undefined }, 'FL_OUT_OF_RANGE'],
            ['FL missing on rate', 'rate', { ...liquid, C: 50, FL: undefined }, 'FL_OUT_OF_RANGE'],
            ['xT at 1', 'size', { ...gas, xT: 1 }, 'XT_OUT_OF_RANGE'],
            ['xT above 1', 'size', { ...gas, xT: 2.5 }, 'XT_OUT_OF_RANGE'],
            ['xT missing', 'size', { ...gas, xT: undefined }, 'XT_OUT_OF_RANGE'],
            ['xT missing on rate', 'rate', { ...gas, C: 50, xT: undefined }, 'XT_OUT_OF_RANGE'],
            ['gamma below 1', 'size', { ...gas, gamma: 0.5 }, 'GAMMA_OUT_OF_RANGE'],
            ['gamma above 2', 'size', { ...gas, gamma: 2.1 }, 'GAMMA_OUT_OF_RANGE'],
            ['gamma missing', 'size', { ...gas, gamma: undefined }, 'GAMMA_OUT_OF_RANGE'],
        ];
        for (const [label, method, input, code] of cases) {
            const r = await call(page, method, input);
            expect(r.ok, label).toBe(false);
            expect(r.code, label).toBe(code);
            expect(r.C, label).toBeUndefined();
        }
    });

    test('a bound only refuses the service that reads the coefficient', async ({ page }) => {
        // Both coefficients sit on the form at once and the style library fills
        // both, so an unscoped bound refused a liquid sizing over a terminal
        // pressure drop ratio that liquid service never reads. Found by sweeping
        // the mode combinations and not by a test, and that is why it is one now.
        expect((await call(page, 'size', { ...liquid, xT: 1.5 })).ok).toBe(true);
        expect((await call(page, 'size', { ...liquid, gamma: 0.5 })).ok).toBe(true);
        expect((await call(page, 'size', { ...gas, FL: 1.5 })).ok).toBe(true);
        // And each still refuses on the service that does read it.
        expect((await call(page, 'size', { ...liquid, FL: 1.5 })).code).toBe('FL_OUT_OF_RANGE');
        expect((await call(page, 'size', { ...gas, xT: 1.5 })).code).toBe('XT_OUT_OF_RANGE');
    });

    test('the physical limits themselves are still accepted', async ({ page }) => {
        // FL = 1 is the no-recovery limit and a real value. xT just under 1 and
        // argon's gamma of 1.67 are real too. A bound that rejects the edge of
        // its own domain is a different defect from the one being fixed.
        expect((await call(page, 'size', { ...liquid, FL: 1 })).ok).toBe(true);
        expect((await call(page, 'size', { ...gas, xT: 0.99 })).ok).toBe(true);
        expect((await call(page, 'size', { ...gas, gamma: 1.67 })).ok).toBe(true);
    });

    test('the exact case that used to hide a cavitating service', async ({ page }) => {
        // Measured during the audit. At P1 1000, P2 700, Pv 640 the service
        // cavitates. Raising FL to 1.5 reported "turbulent" with a clean page
        // and an IDENTICAL coefficient, because Pvc climbed to 866.7 kPa.
        const honest = await call(page, 'size', { ...liquid, Pv: 640 });
        expect(honest.regime).toBe('cavitating');
        const impossible = await call(page, 'size', { ...liquid, Pv: 640, FL: 1.5 });
        expect(impossible.ok).toBe(false);
        expect(impossible.regime).not.toBe('turbulent');
    });

    test('a missing critical pressure stops the choke check and says which input', async ({ page }) => {
        // FF needs both pressures and only the vapour one used to be reported.
        // The same service sized 9% smaller with Pc blank, said nothing, and
        // labelled the empty choke row "no vapour pressure" when the vapour
        // pressure was the input that was present.
        const both = await call(page, 'size', { ...liquid, P2: 200, Pv: 190 });
        expect(both.choked).toBe(true);

        const noPc = await call(page, 'size', { ...liquid, P2: 200, Pv: 190, Pc: null });
        expect(noPc.ok).toBe(true);
        expect(noPc.choked).toBe(false);
        expect(noPc.dPChoked).toBeNull();
        expect(noPc.missingChokeInputs).toEqual(['critical pressure']);
        expect(noPc.warnings.map((x) => x.code)).toContain('NO_CRITICAL_PRESSURE');
        // The undersize is the reason it matters, so it is pinned as a number.
        expect(noPc.C).toBeLessThan(both.C * 0.95);

        const noPv = await call(page, 'size', { ...liquid, Pv: null, Pc: null });
        expect(noPv.missingChokeInputs).toEqual(['vapour pressure', 'critical pressure']);
        expect(noPv.warnings.map((x) => x.code)).toContain('NO_VAPOUR_PRESSURE');
    });

    test('travel off the stroke is its own condition, not a percentage', async ({ page }) => {
        // A required coefficient above the rated one used to render "334%
        // travel, leaving almost no capacity in reserve", which is the opposite
        // of the truth: the valve cannot pass the flow at any opening.
        const undersized = await call(page, 'size', {
            ...liquid, characteristic: 'linear', Crated: 10, dPTotal: 500, dPValveOpen: 300,
        });
        expect(undersized.characteristic.travel).toBeGreaterThan(1);
        const codes = undersized.warnings.map((x) => x.code);
        expect(codes).toContain('TRIM_UNDERSIZED');
        expect(codes).not.toContain('TRAVEL_TOO_HIGH');
        expect(undersized.warnings.find((x) => x.code === 'TRIM_UNDERSIZED').severity).toBe('error');

        // Below Crated / R an equal-percentage trim is shut, not at negative
        // travel. That floor is the definition of rangeability.
        const shut = await call(page, 'size', {
            ...liquid, q: 0.5, characteristic: 'equal-percentage',
            Crated: 1000, dPTotal: 500, dPValveOpen: 300,
        });
        expect(shut.characteristic.travel).toBeLessThan(0);
        const shutCodes = shut.warnings.map((x) => x.code);
        expect(shutCodes).toContain('TRIM_BELOW_RANGEABILITY');
        expect(shutCodes).not.toContain('TRAVEL_TOO_LOW');

        // And a travel that genuinely is near an end still gets the old advice.
        const nearlyOpen = await call(page, 'size', {
            ...liquid, characteristic: 'linear', Crated: 35, dPTotal: 500, dPValveOpen: 300,
        });
        expect(nearlyOpen.warnings.map((x) => x.code)).toContain('TRAVEL_TOO_HIGH');
    });

    test('a contradictory system is named, not silently dropped', async ({ page }) => {
        // Authority cannot exceed 1. This used to return null and render the
        // same panel as a characteristic nobody asked for, whose advice was to
        // enter the figures the user had just entered.
        const r = await call(page, 'size', {
            ...liquid, characteristic: 'linear', Crated: 100, dPTotal: 300, dPValveOpen: 500,
        });
        expect(r.ok).toBe(true);
        expect(r.characteristic).toBeNull();
        const problem = r.warnings.find((x) => x.code === 'SYSTEM_INCONSISTENT');
        expect(problem).toBeTruthy();
        expect(problem.message).toContain('authority');
    });

    test('the sizing case and the system model are cross-checked', async ({ page }) => {
        // Two descriptions of one installation. The valve cannot drop more than
        // the system has, and full open is the smallest differential the valve
        // ever sees because system loss climbs with flow.
        const withSystem = (dPTotal, dPValveOpen) => call(page, 'size', {
            ...liquid, characteristic: 'linear', Crated: 100, dPTotal, dPValveOpen,
        });
        const overspent = await withSystem(200, 150);
        expect(overspent.warnings.map((x) => x.code)).toContain('SYSTEM_MISMATCH');

        const inverted = await withSystem(900, 400);
        expect(inverted.warnings.map((x) => x.code)).toContain('SYSTEM_MISMATCH');

        // 300 kPa across the valve out of 500 available, valve taking 300 at
        // full open. Consistent, and it must stay quiet.
        const fine = await withSystem(500, 300);
        expect(fine.warnings.map((x) => x.code)).not.toContain('SYSTEM_MISMATCH');
        expect(fine.characteristic.authority).toBeCloseTo(0.6, 12);
    });

    test('the standard volumetric gas path reaches an answer', async ({ page }) => {
        // N9 had no route from the page at all, so the constant the reference
        // state was pinned for was engine-only.
        const r = await call(page, 'size', {
            service: 'gas', P1: 1000, P2: 700, q: 1500,
            MW: 28.97, T1: 288.15, Z: 1, gamma: 1.4, xT: 0.7, d: 100, D1: 100, D2: 100,
        });
        expect(r.ok).toBe(true);
        expect(r.C).toBeGreaterThan(0);
        // Sizing and rating are inverses on this path too, which is the only
        // check available on N9 short of a second published source.
        const back = await call(page, 'rate', {
            service: 'gas', P1: 1000, P2: 700, C: r.C,
            MW: 28.97, T1: 288.15, Z: 1, gamma: 1.4, xT: 0.7, d: 100, D1: 100, D2: 100,
        });
        expect(rel(back.q, 1500)).toBeLessThan(1e-9);
    });

    test('temperature converts through its offset, unlike every other quantity', async ({ page }) => {
        const u = (fn, ...args) => page.evaluate(
            ([f, a]) => window.ControlValve.units[f](...a), [fn, args]);
        expect(await u('toInternal', 'temperature', 'si', 20)).toBeCloseTo(293.15, 10);
        expect(await u('toInternal', 'temperature', 'us', 68)).toBeCloseTo(293.15, 10);
        expect(await u('fromInternal', 'temperature', 'us', 273.15)).toBeCloseTo(32, 10);
        // A factor-only conversion would be wrong by 273 here, and that is why
        // temperature needs its own row shape instead of a factor.
        expect(await u('fromInternal', 'temperature', 'si', 293.15)).toBeCloseTo(20, 10);
        expect(await u('unitLabel', 'temperature', 'us')).toBe('F');
    });
});

test.describe('the page, after the audit', () => {
    const value = (page, id) => page.locator(`#${id}`).inputValue();

    test('switching units converts the fields instead of relabelling them', async ({ page }) => {
        // The defect: the default form read Cv 33.37 in SI and Cv 2.89 in US
        // customary with every field showing what it showed before,
        // because 1000 kPa had quietly become 1000 psi.
        const si = await page.locator('#cvValue').textContent();
        expect(await value(page, 'p1')).toBe('1000');

        await page.selectOption('#unitSystem', 'us');
        expect(await page.locator('#cvValue').textContent()).toBe(si);
        expect(Number(await value(page, 'p1'))).toBeCloseTo(1000 / PSI, 3);
        expect(Number(await value(page, 'q'))).toBeCloseTo(50 / GPM, 3);
        expect(Number(await value(page, 'd'))).toBeCloseTo(100 / IN, 4);
        expect(Number(await value(page, 'tLiquid'))).toBeCloseTo(68, 6);
        await expect(page.locator('[data-unit="pressure"]').first()).toHaveText('psi');

        await page.selectOption('#unitSystem', 'si');
        expect(await page.locator('#cvValue').textContent()).toBe(si);
        expect(Number(await value(page, 'p1'))).toBeCloseTo(1000, 3);
        expect(Number(await value(page, 'tLiquid'))).toBeCloseTo(20, 6);
    });

    test('the answer is announced, not only the refusal', async ({ page }) => {
        // #resultStatus is the only thing that used to be live, and it is
        // emptied on success, so a correct answer announced nothing at all.
        const spoken = page.locator('#resultSummary');
        await expect(spoken).toHaveAttribute('role', 'status');
        await expect(spoken).toContainText('Cv');
        await expect(spoken).toContainText('turbulent');

        await page.fill('#p2', '1200');
        await expect(spoken).toContainText('Not sized');
        // The panel itself must NOT be live, or every keystroke re-reads it.
        await expect(page.locator('#advisories')).not.toHaveAttribute('aria-live', /.+/);
    });

    test('an out-of-range coefficient is refused on the page, by name', async ({ page }) => {
        await page.fill('#fl', '1.5');
        await expect(page.locator('#cvValue')).toHaveText('—');
        await expect(page.locator('#resultStatus')).toContainText('at most 1');
        // The input carries the bound too, so the browser objects first.
        await expect(page.locator('#fl')).toHaveAttribute('max', '1');
        await expect(page.locator('#xt')).toHaveAttribute('max', '0.99');
    });

    test('the choke row names the input it is waiting on', async ({ page }) => {
        await page.fill('#pc', '');
        await expect(page.locator('#regimeDetail')).toContainText('no critical pressure');
        await expect(page.locator('#regimeDetail')).not.toContainText('no vapour pressure');
    });

    test('water fills its own vapour pressure from the vendored curve', async ({ page }) => {
        // The 41 verified knots had no route to the page: a water service still
        // needed a hand-entered Pv.
        await page.fill('#tLiquid', '80');
        expect(Number(await value(page, 'pv'))).toBeCloseTo(47.414, 3);
        expect(Number(await value(page, 'pc'))).toBeCloseTo(22064, 0);

        // Outside the table the fields are left alone, never extrapolated
        // or silently blanked, and the note says the lookup did not run.
        await page.fill('#tLiquid', '400');
        expect(Number(await value(page, 'pv'))).toBeCloseTo(47.414, 3);
        await expect(page.locator('#tLiquidNote')).toContainText('Outside the tabulated range');
    });

    test('the gas library fills the properties it was verified for', async ({ page }) => {
        await page.selectOption('#service', 'gas');
        await page.selectOption('#gasFluid', 'methane');
        // The handbook value, not the remembered 1.32. The same number the
        // engine spec pins, now reachable by a user.
        expect(await value(page, 'gamma')).toBe('1.26');
        expect(await value(page, 'mw')).toBe('16.043');
        await expect(page.locator('#gasNote')).toContainText('matches its source');
    });

    test('both solve directions and both gas flow bases are reachable', async ({ page }) => {
        await page.selectOption('#direction', 'rate');
        await page.fill('#cInstalled', '33.3728');
        await expect(page.locator('#cvLabel')).toContainText('Achievable flow');
        // Rating the coefficient the default case sizes to gives back the flow
        // it was sized for.
        expect(Number(await page.locator('#cvValue').textContent())).toBeCloseTo(50, 1);

        await page.selectOption('#service', 'gas');
        await page.selectOption('#gasBasis', 'mass');
        await expect(page.locator('#cvLabel')).toContainText('mass flow');
        await page.selectOption('#gasBasis', 'volumetric');
        await expect(page.locator('#qGasNote')).toContainText('101.325');
        await expect(page.locator('#cvLabel')).not.toContainText('mass flow');
    });

    test('the characteristic explains itself when it cannot be built', async ({ page }) => {
        await page.selectOption('#characteristic', 'linear');
        await page.fill('#dpTotal', '300');
        await page.fill('#dpValveOpen', '500');
        const detail = page.locator('#characteristicDetail');
        await expect(detail).toContainText('authority cannot exceed 1');
        await expect(detail).not.toContainText('Choose a trim characteristic');
    });

    test('travel off the stroke reads as a condition, not a percentage', async ({ page }) => {
        await page.selectOption('#characteristic', 'linear');
        await page.fill('#crated', '10');
        const detail = page.locator('#characteristicDetail');
        await expect(detail).toContainText('too small for this duty');
        await expect(detail).not.toContainText('%');
    });

    test('every fold and the disclaimer meet the touch target guideline', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 800 });
        const heights = await page.evaluate(() => [...document.querySelectorAll('summary')]
            .map((s) => s.getBoundingClientRect().height));
        expect(heights.length).toBeGreaterThan(4);
        for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
    });

    test('a select fires one render, not two', async ({ page }) => {
        // A select fires BOTH input and change. Wiring a dedicated change
        // handler alongside a blanket input handler ran the whole solve twice on
        // every pick, including the unit switch, where the first of the two ran
        // against half-converted fields.
        //
        // announce() sets #resultSummary.textContent once per render, and the
        // textContent setter replaces the child text node even when the string
        // is unchanged, so childList mutations count renders exactly.
        const arm = () => page.evaluate(() => {
            window.__renders = 0;
            window.__obs = new MutationObserver((recs) => { window.__renders += recs.length; });
            window.__obs.observe(document.getElementById('resultSummary'), { childList: true });
        });
        const stop = () => page.evaluate(() => { window.__obs.disconnect(); return window.__renders; });

        for (const [id, value] of [
            ['style', 'globe-cage-linear-3'],
            ['service', 'gas'],
            ['unitSystem', 'us'],
            ['characteristic', 'linear'],
            ['direction', 'rate'],
        ]) {
            await arm();
            await page.selectOption(`#${id}`, value);
            expect(await stop(), id).toBe(1);
        }
    });

    test('the style library fills the rated coefficient, but only where it means full open', async ({ page }) => {
        // The note used to announce a rated Cv and leave the characteristic
        // block holding whatever was there before.
        await page.selectOption('#style', 'globe-cage-linear-3');
        expect(await value(page, 'crated')).toBe('148');
        await expect(page.locator('#styleNote')).toContainText('carried into');

        // A 60 degree rotary Cv is about a third of the same valve at 90, so
        // carrying it into a field labelled "at full open" would understate the
        // trim and distort every curve drawn from it. It is left alone, and the
        // note says why instead of staying silent.
        await page.selectOption('#style', 'ball-vnotch-3-60');
        expect(await value(page, 'crated')).toBe('148');
        await expect(page.locator('#styleNote')).toContainText('not full open');

        await page.selectOption('#style', 'ball-vnotch-3-90');
        expect(await value(page, 'crated')).toBe('321');
    });

    test('the headline coefficient clears AA for normal text in both themes', async ({ page }) => {
        // It measured 3.19:1 on the light card, which passes only because 40px
        // counts as large text. That margin should not depend on a font size
        // surviving a future layout change.
        const measured = await page.evaluate(() => {
            // Both rgb(0-255) and color(srgb 0-1) forms reach here, and reading
            // the second as the first is how a mid amber measures 20:1.
            const rgb = (c) => {
                const n = c.match(/[\d.]+/g).map(Number);
                return c.startsWith('color(') ? n.slice(0, 3) : n.slice(0, 3).map((v) => v / 255);
            };
            const lum = (c) => {
                const [r, g, b] = rgb(c).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
                return 0.2126 * r + 0.7152 * g + 0.0722 * b;
            };
            const ratio = (a, b) => {
                const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
                return (x + 0.05) / (y + 0.05);
            };
            const out = {};
            for (const theme of ['light', 'dark']) {
                document.documentElement.setAttribute('data-theme', theme);
                const node = document.querySelector('.result-lead-value');
                let n = node.parentElement;
                let bg = 'rgb(255,255,255)';
                while (n) {
                    const c = getComputedStyle(n).backgroundColor;
                    if (c && !/, 0\)$/.test(c)) { bg = c; break; }
                    n = n.parentElement;
                }
                out[theme] = ratio(getComputedStyle(node).color, bg);
            }
            return out;
        });
        expect(measured.light).toBeGreaterThanOrEqual(4.5);
        expect(measured.dark).toBeGreaterThanOrEqual(4.5);
    });

    test('no refusal code exists that nothing can return', async ({ page }) => {
        // NO_REYNOLDS_FACTOR was a code with no branch. FR being unavailable is
        // a disclosure on a SUCCESSFUL result, not a refusal, so it belongs in
        // the advisories and a dead refusal code reads as a missing branch.
        const codes = await surface(page, 'CODES');
        expect(codes.NO_REYNOLDS_FACTOR).toBeUndefined();

        const r = await call(page, 'size', {
            service: 'liquid', P1: 1000, P2: 700, Pv: 2.34, Pc: 22064,
            relativeDensity: 1, q: 50, d: 100, D1: 100, D2: 100, FL: 0.9,
        });
        expect(r.warnings.map((x) => x.code)).toContain('NO_REYNOLDS_CHECK');
    });
});

test.describe('the page', () => {
    test('loads with no console or page errors and no CSP violations', async ({ page }) => {
        const problems = [];
        page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
        page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
        await page.addInitScript(() => {
            window.__cspViolations = 0;
            document.addEventListener('securitypolicyviolation', () => { window.__cspViolations += 1; });
        });
        await page.goto(PAGE);
        await expect.poll(() => page.evaluate(() => typeof window.ControlValve)).toBe('object');
        await page.selectOption('#service', 'gas');
        await page.selectOption('#unitSystem', 'us');
        await page.fill('#p1', '200');
        expect(await page.evaluate(() => window.__cspViolations)).toBe(0);
        expect(problems).toEqual([]);
    });

    test('the regime is displayed with every result, always', async ({ page }) => {
        // A coefficient without its regime is the thing this tool exists to stop
        // shipping, so the badge is never empty, including on a refusal.
        const badge = page.locator('#regimeWord');
        await expect(badge).not.toHaveText('—');
        await page.fill('#p2', '2000');   // reverse differential, a refusal
        await expect(page.locator('#resultStatus')).toHaveAttribute('data-state', 'error');
    });

    test('severity is carried by shape as well as tint', async ({ page }) => {
        // WCAG 1.4.1, and the practical reason: roughly one man in twelve cannot
        // reliably separate the red tint from the amber one, and this badge is
        // the tool's most important output.
        await page.fill('#pv', '2.34');
        await page.fill('#p2', '700');
        const calm = await page.locator('#regimeIcon').textContent();
        await page.fill('#p2', '10');
        const severe = await page.locator('#regimeIcon').textContent();
        expect(calm).not.toBe(severe);
    });

    test('the scope disclaimer is present with nothing to dismiss', async ({ page }) => {
        const card = page.locator('.disclaimer-card');
        await expect(card).toBeVisible();
        // The headline reads without opening anything, and it says what the tool
        // is not before it says anything about what it does.
        await expect(page.locator('.disclaimer-title')).toContainText('Not a valve selection or process safety tool');
        await expect(page.locator('.disclaimer-lead')).toContainText('not engineering advice');
        await expect(card.locator('.disclaimer-body')).toBeHidden();
        await card.locator('summary').click();
        await expect(card.locator('.disclaimer-body')).toBeVisible();
        // Nothing to dismiss and nothing blocking the page.
        await expect(page.locator('.modal-overlay')).toHaveCount(0);
    });

    test('the disclaimer names specific omissions and carries the legal clauses', async ({ page }) => {
        // The beam tool set the bar here: a disclaimer that waves at risk is
        // worth nothing, so this one enumerates what is not checked and what the
        // tool must never be used for. These assertions exist so a future edit
        // cannot quietly thin it back down to a sentence.
        await page.locator('.disclaimer-card summary').click();
        const body = page.locator('.disclaimer-body');

        for (const omission of [
            'acoustically induced vibration',   // fails piping by fatigue
            'thrust or torque',                 // the actuator
            'seat leakage class',
            'sour service',
            'body outlet velocity',
            'cavitation damage rate',
            'Reynolds number factor is not computed',
            'stiction',
            'B16.34',
        ]) {
            await expect(body, omission).toContainText(omission);
        }

        // The sentence the whole section exists to land.
        await expect(body).toContainText('still be the wrong valve for the service');

        // The uses that would be dangerous, named individually.
        for (const forbidden of ['API 520', 'IEC 61511', 'PE stamp', 'rupture disc']) {
            await expect(body, forbidden).toContainText(forbidden);
        }

        // Warranty, liability, and whose word beats this page.
        const footer = page.locator('.disclaimer-footer');
        await expect(footer).toContainText('without warranty of any kind');
        await expect(footer).toContainText('no liability');
        await expect(footer).toContainText('this page is wrong');
    });

    test('every line of the disclaimer clears AA in both themes', async ({ page }) => {
        // The card is tinted and translucent, so the effective background is the
        // tint composited over the page. Reading backgroundColor off the nearest
        // painted ancestor gets this wrong and reports a mid amber as 20:1.
        //
        // shared.css also transitions background-color, so a computed read taken
        // immediately after switching themes returns the mid-animation value.
        await page.locator('.disclaimer-card summary').click();
        const SELS = ['.disclaimer-title', '.disclaimer-lead', '.disclaimer-note',
            '.disclaimer-footer p', '.disclaimer-body li', 'p.disclaimer', '.disclaimer-section h3'];
        for (const theme of ['dark', 'light']) {
            await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
            await page.waitForTimeout(700);
            const measured = await page.evaluate((sels) => {
                const parse = (c) => {
                    const v = c.match(/[\d.]+/g).map(Number);
                    return c.startsWith('color(')
                        ? [v[0], v[1], v[2], v.length > 3 ? v[3] : 1]
                        : [v[0] / 255, v[1] / 255, v[2] / 255, v.length > 3 ? v[3] : 1];
                };
                const effBg = (el) => {
                    const stack = [];
                    for (let n = el; n; n = n.parentElement) stack.push(parse(getComputedStyle(n).backgroundColor));
                    let out = [1, 1, 1];
                    for (let i = stack.length - 1; i >= 0; i--) {
                        const [r, g, b, a] = stack[i];
                        if (!a) continue;
                        out = [r * a + out[0] * (1 - a), g * a + out[1] * (1 - a), b * a + out[2] * (1 - a)];
                    }
                    return out;
                };
                const lum = ([r, g, b]) => {
                    const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
                    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
                };
                const out = {};
                for (const sel of sels) {
                    const el = document.querySelector(sel);
                    const [x, y] = [lum(parse(getComputedStyle(el).color)), lum(effBg(el))].sort((p, q) => q - p);
                    out[sel] = (x + 0.05) / (y + 0.05);
                }
                return out;
            }, SELS);
            for (const [sel, ratio] of Object.entries(measured)) {
                expect(ratio, `${sel} in ${theme}`).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    test('the scope limit is also readable beside the answer', async ({ page }) => {
        // A reader who never opens the card still has to meet it. Same second
        // touchpoint the beam tool puts next to its results.
        const note = page.locator('p.disclaimer');
        await expect(note).toBeVisible();
        await expect(note).toContainText('not a valve specification');
        await expect(note).toContainText('safety function');
        await expect(note).toContainText("manufacturer's sizing");
    });

    test('no horizontal overflow at four widths', async ({ page }) => {
        for (const width of [1280, 900, 768, 375]) {
            await page.setViewportSize({ width, height: 900 });
            const overflow = await page.evaluate(() =>
                document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
            expect(overflow, `overflow at ${width}px`).toBe(false);
        }
    });
});
