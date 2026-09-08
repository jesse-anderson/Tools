// Regime classification and the advisory set.
//
// Pure, synchronous, no DOM. Split from valve-engine.js because classification
// answers a different question from sizing: sizing asks how big, this asks
// whether the number means anything. The regime badge is the tool's most
// important output, so it lives somewhere it can be read and tested on its own.
//
// Classification runs on the service conditions and not on the sizing result, so
// that a refusal still carries a regime. A flashing service is refused a
// coefficient and must still show "flashing" on the badge: an error message with
// no regime beside it tells the user the tool broke, when the truth is that their
// service is two-phase.

export const REGIMES = Object.freeze({
    TURBULENT: 'turbulent',
    CHOKED: 'choked',
    CAVITATING: 'cavitating',
    FLASHING: 'flashing',
    NON_TURBULENT: 'non-turbulent',
    OUTSIDE_SCOPE: 'outside scope',
});

export const SEVERITY = Object.freeze({ ERROR: 'error', WARN: 'warn', INFO: 'info' });

// Severity ranking, so the UI can pick a tint and an icon shape without
// re-deriving the order. WCAG 1.4.1 is the formal reason the icon differs in
// shape as well as colour; the practical one is that this is the output that
// matters most and roughly one man in twelve cannot separate the red tint from
// the amber one.
export const REGIME_SEVERITY = Object.freeze({
    [REGIMES.TURBULENT]: SEVERITY.INFO,
    [REGIMES.NON_TURBULENT]: SEVERITY.WARN,
    [REGIMES.CHOKED]: SEVERITY.WARN,
    [REGIMES.CAVITATING]: SEVERITY.WARN,
    [REGIMES.FLASHING]: SEVERITY.ERROR,
    [REGIMES.OUTSIDE_SCOPE]: SEVERITY.WARN,
});

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Vena contracta pressure, approximate.
 *
 * The pressure minimum inside the valve, which is what decides whether bubbles
 * form at all. P2 is the recovered pressure and is always higher, and that is why
 * a service can cavitate while every pressure the user can measure stays well
 * above the vapour pressure.
 */
export function venaContractaPressure(P1, P2, FL) {
    if (!isNum(FL) || FL <= 0) return null;
    return P1 - (P1 - P2) / (FL * FL);
}

/**
 * Service cavitation index, in the ISA-RP75.23 form.
 *
 *   sigma = (P1 - Pv) / (P1 - P2)
 *
 * Lower is more severe under this definition. Several incompatible definitions
 * are in circulation, some inverted, so the tool states which it uses on the
 * page and reports the raw pressures beside it. A user comparing against a
 * manufacturer limit written under a different convention will otherwise draw
 * exactly the wrong conclusion, and confidently.
 */
export function cavitationIndex(P1, P2, Pv) {
    if (!isNum(Pv)) return null;
    const dP = P1 - P2;
    if (!(dP > 0)) return null;
    return (P1 - Pv) / dP;
}

/**
 * Classify the service.
 *
 * Precedence is flashing, then choked, then cavitating, then non-turbulent,
 * then turbulent. Flashing outranks choking because it is a different physical
 * condition with a different fix, not a more severe version of the same one.
 * Choking outranks incipient cavitation because a choked liquid is already in
 * fully developed cavitation, so reporting "cavitating" there would understate.
 */
export function classify({ service, P1, P2, Pv, FL, choked, Rev }) {
    if (service === 'gas') {
        if (choked) return REGIMES.CHOKED;
        return REGIMES.TURBULENT;
    }
    if (isNum(Pv) && P2 < Pv) return REGIMES.FLASHING;
    if (choked) return REGIMES.CHOKED;
    if (isNum(Pv)) {
        const Pvc = venaContractaPressure(P1, P2, FL);
        if (Pvc !== null && Pvc < Pv) return REGIMES.CAVITATING;
    }
    if (isNum(Rev) && Rev <= 10000) return REGIMES.NON_TURBULENT;
    return REGIMES.TURBULENT;
}

const w = (code, severity, message) => ({ code, severity, message });

/**
 * The advisories.
 *
 * Section 9 of the SOW is a table, and this is that table as code. The refusals
 * protect against a wrong number; these are the entire mechanism by which a
 * right answer gets properly disbelieved, so they are tested behaviour and not
 * interface decoration.
 */
export function advisories(result, input) {
    const out = [];
    const { service, C, choked, regime, sigma, Pvc } = result;
    const { Pv, sigmaIncipient, coefficientsReviewed } = input;

    if (choked) {
        out.push(w('CHOKED', SEVERITY.WARN, service === 'liquid'
            ? 'Choked. Sized at the choke point, not at the differential you supplied: past this point more pressure drop produces no more flow.'
            : 'Choked. Sized at the terminal pressure drop ratio; the expansion factor is held at its limiting value of 2/3.'));
    }

    if (regime === REGIMES.CAVITATING) {
        out.push(w('CAVITATING', SEVERITY.WARN,
            'Cavitating. The pressure inside the valve falls below the vapour pressure and recovers above it, so bubbles form and collapse in the trim. Expect noise, vibration and localised trim damage.'));
    }

    // The vena contracta criterion is a LATE indicator and the tool must not let
    // its silence read as a clean bill of health. The arithmetic is exact: at the
    // choke point dP = FL^2 (P1 - FF Pv), so Pvc = P1 - dP/FL^2 = FF Pv. The
    // window in which Pvc < Pv but the service is not yet choked therefore spans
    // only Pv (1 - FF), around 7% of Pv for a typical FF near 0.93. Incipient
    // cavitation begins far earlier than that, and detecting it needs a published
    // sigma limit for the specific trim, which the available source does not
    // carry for any style. So the tool reports what it can prove and says plainly
    // what it cannot see.
    if (result.service === 'liquid' && isNum(Pv) && regime !== REGIMES.FLASHING) {
        out.push(w('CAVITATION_DETECTION_LIMIT', SEVERITY.INFO,
            'No cavitation flag does not mean no cavitation. This check compares the estimated vena contracta pressure against the vapour pressure, which only becomes true close to the choke point. Incipient cavitation starts well before that and can only be detected against a published sigma limit for the specific trim.'));
    }

    if (isNum(sigma)) {
        if (isNum(sigmaIncipient)) {
            out.push(sigma < sigmaIncipient
                ? w('SIGMA_BELOW_LIMIT', SEVERITY.WARN, `Service sigma ${sigma.toFixed(2)} is below the published incipient limit ${sigmaIncipient.toFixed(2)} for this style.`)
                : w('SIGMA_ABOVE_LIMIT', SEVERITY.INFO, `Service sigma ${sigma.toFixed(2)} is above the published incipient limit ${sigmaIncipient.toFixed(2)} for this style.`));
        } else {
            out.push(w('SIGMA_NO_LIMIT', SEVERITY.INFO,
                `Service sigma is ${sigma.toFixed(2)} under the ISA-RP75.23 definition, where lower is more severe. No published limit is available for this valve style, so there is nothing to compare it against. A rule of thumb is not substituted.`));
        }
    }

    // The turbulence precondition cannot be checked at all while FR is
    // unavailable, and saying only that "FR was not applied" would understate
    // it. Turbulent flow is a PRECONDITION of every equation in the tool, not an
    // optional correction, so the honest advisory is that the check did not run.
    if (service === 'liquid') {
        out.push(w('NO_REYNOLDS_CHECK', SEVERITY.INFO,
            'Turbulence was not verified. The Reynolds number factor needs constants published only in IEC 60534-2-1, which was not obtained, so the tool cannot confirm this service is in the turbulent regime the equations assume. In small bores, viscous fluids or very low flows, treat the result as unverified.'));
    } else {
        out.push(w('NO_COMPRESSIBLE_REYNOLDS', SEVERITY.INFO,
            'The standard develops the non-turbulent correction for liquid service only. Gas at low Reynolds number is outside its validated scope and no correction is applied here.'));
    }

    // The choke check needs both pressures, and only the vapour one used to be
    // reported. Supplying Pv and leaving Pc blank sized 9% smaller on a measured
    // case, said nothing, and labelled the empty choke row "no vapour pressure"
    // when the vapour pressure was the input that had been supplied.
    if (service === 'liquid') {
        if (!isNum(Pv)) {
            out.push(w('NO_VAPOUR_PRESSURE', SEVERITY.INFO,
                'Vapour pressure was not supplied, so the choking, cavitation and flashing checks were not run. They are not assumed to pass.'));
        } else if (!isNum(input.Pc)) {
            out.push(w('NO_CRITICAL_PRESSURE', SEVERITY.WARN,
                'Critical pressure was not supplied, so the liquid critical pressure ratio FF could not be formed and the CHOKE check did not run. Cavitation and flashing were still checked. A choked service sized this way comes out undersized, because it is sized at the full differential rather than at the differential the valve can actually use.'));
        }
    }

    if (isNum(C) && C < 0.1) {
        out.push(w('VERY_LOW_CV', SEVERITY.INFO,
            'Required Cv is below 0.1. A control valve is often the wrong device at this capacity; a thermal mass flow controller is the usual answer, which is the common case for sparging gas into a bioreactor.'));
    }

    if (coefficientsReviewed === false) {
        out.push(w('COEFFICIENTS_UNREVIEWED', SEVERITY.INFO,
            'The FL, xT and Fd values for this style have not been signed off against their cited source yet.'));
    }

    return out;
}

/**
 * Everything the regime layer contributes to a result, in one call.
 *
 * Returns the fields instead of mutating, so the engine stays the only place
 * that assembles a result object.
 */
export function assess(result, input) {
    const Pvc = result.service === 'liquid'
        ? venaContractaPressure(input.P1, input.P2, input.FL)
        : null;
    const sigma = result.service === 'liquid'
        ? cavitationIndex(input.P1, input.P2, input.Pv)
        : null;
    const regime = classify({
        service: result.service,
        P1: input.P1,
        P2: input.P2,
        Pv: input.Pv,
        FL: input.FL,
        choked: result.choked,
        Rev: result.Rev,
    });
    const enriched = { ...result, regime, sigma, Pvc };
    return { ...enriched, warnings: advisories(enriched, input) };
}
