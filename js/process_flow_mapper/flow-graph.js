// Graph, shares, rework detection and findings for the process flow mapper.
// Pure, no DOM. Times leave here in hours.

export const CALENDAR_DEFAULTS = Object.freeze({ hoursPerDay: 8, daysPerWeek: 5 });
export const CALENDAR_LIMITS = Object.freeze({ hoursPerDay: [1, 24], daysPerWeek: [1, 7] });

const SHARE_EPS = 1e-9;

function numberOr(value, fallback) {
    const n = Number(value);
    return value === null || value === undefined || value === '' || !Number.isFinite(n) ? fallback : n;
}

const clamp = (value, [lo, hi]) => Math.min(hi, Math.max(lo, value));

/** The working calendar, clamped. A day and a week mean these many hours. */
export function resolveCalendar(settings = {}) {
    return {
        hoursPerDay: clamp(numberOr(settings.hoursPerDay, CALENDAR_DEFAULTS.hoursPerDay), CALENDAR_LIMITS.hoursPerDay),
        daysPerWeek: clamp(numberOr(settings.daysPerWeek, CALENDAR_DEFAULTS.daysPerWeek), CALENDAR_LIMITS.daysPerWeek)
    };
}

/** Hours in a parsed time, on the working calendar. Null stays zero. */
export function toHours(time, calendar) {
    if (!time) return 0;
    const perUnit = {
        s: 1 / 3600,
        min: 1 / 60,
        h: 1,
        d: calendar.hoursPerDay,
        wk: calendar.hoursPerDay * calendar.daysPerWeek
    };
    return time.value * perUnit[time.unit];
}

const percent = (share) => `${Math.round(share * 1000) / 10}%`;

/**
 * Build the graph from a parsed flow.
 *
 * An exit is rework when it leads back: to an earlier phase, or to a step that
 * already reaches its source along the forward exits typed so far. So typing
 * order decides which exit of a loop is the return, as in the Sankey builder.
 *
 * Returns { nodes, links, lanes, phases, starts, ends, counts, warnings }.
 */
export function buildGraph(parsed, settings = {}) {
    const calendar = resolveCalendar(settings);
    const warnings = [];
    const warn = (code, message, line = null) => warnings.push({ line, code, message });

    const index = new Map(parsed.steps.map((s, i) => [s.name, i]));
    const nodes = parsed.steps.map((s, i) => ({
        index: i,
        name: s.name,
        kind: s.kind,
        lane: s.lane,
        phase: Math.max(0, s.phase),
        touch: toHours(s.touch, calendar),
        wait: toHours(s.wait, calendar),
        timed: Boolean(s.touch || s.wait),
        line: s.line,
        inLinks: [],
        outLinks: []
    }));

    // An end belongs to the latest phase that leads to it. Otherwise an end
    // typed under an early phase and reached from a later one would read as
    // work being sent back.
    const leaves = new Set(parsed.exits.map((e) => e.source));
    for (const exit of parsed.exits) {
        const target = nodes[index.get(exit.target)];
        if (!leaves.has(target.name)) target.phase = Math.max(target.phase, nodes[index.get(exit.source)].phase);
    }

    // Repeated exits between the same pair are one exit, shares added.
    const links = [];
    const byPair = new Map();
    for (const exit of parsed.exits) {
        const source = index.get(exit.source);
        const target = index.get(exit.target);
        const key = `${source}>${target}`;
        if (byPair.has(key)) {
            const link = links[byPair.get(key)];
            if (exit.share !== null) link.given = (link.given === null ? 0 : link.given) + exit.share;
            warn('DUPLICATE_EXIT', `"${exit.source}" to "${exit.target}" is entered more than once, and the lines are treated as one exit`, exit.line);
            continue;
        }
        byPair.set(key, links.length);
        links.push({ index: links.length, source, target, label: exit.label, given: exit.share, share: 0, rework: false, line: exit.line });
    }

    const forward = nodes.map(() => []);
    const reaches = (from, to) => {
        const seen = new Set([from]);
        const stack = [from];
        while (stack.length) {
            const n = stack.pop();
            if (n === to) return true;
            for (const next of forward[n]) {
                if (!seen.has(next)) { seen.add(next); stack.push(next); }
            }
        }
        return false;
    };
    for (const link of links) {
        const backPhase = nodes[link.target].phase < nodes[link.source].phase;
        link.rework = backPhase || reaches(link.target, link.source);
        if (!link.rework) forward[link.source].push(link.target);
        nodes[link.source].outLinks.push(link.index);
        nodes[link.target].inLinks.push(link.index);
    }

    // Shares. Exits of one step are "one of these happens", so they sum to 1.
    for (const node of nodes) {
        const out = node.outLinks.map((li) => links[li]);
        if (!out.length) continue;
        const given = out.filter((l) => l.given !== null);
        const blank = out.filter((l) => l.given === null);
        const sum = given.reduce((s, l) => s + l.given, 0);
        const left = Math.max(0, 1 - sum);
        for (const l of given) l.share = l.given;
        for (const l of blank) l.share = blank.length ? left / blank.length : 0;

        const reading = () => out.map((l) => `${nodes[l.target].name} ${percent(l.share)}`).join(', ');
        if (blank.length && out.length > 1) {
            if (given.length === 0) {
                warn('SHARE_ASSUMED', `"${node.name}" has ${out.length} exits and no percentages, so the work is split evenly: ${reading()}. If these happen in parallel, the times here are understated`, node.line);
            } else if (left > SHARE_EPS) {
                warn('SHARE_ASSUMED', `"${node.name}" has exits with no percentage, which share the remaining ${percent(left)}: ${reading()}`, node.line);
            }
        }
        const total = out.reduce((s, l) => s + l.share, 0);
        if (total <= SHARE_EPS) {
            for (const l of out) l.share = 1 / out.length;
            warn('SHARE_SCALED', `the exits of "${node.name}" add up to 0%, so the work is split evenly: ${reading()}`, node.line);
        } else if (Math.abs(total - 1) > 1e-6) {
            for (const l of out) l.share /= total;
            warn('SHARE_SCALED', `the exits of "${node.name}" add up to ${percent(total)}, not 100%, and were scaled: ${reading()}`, node.line);
        }
    }

    const starts = nodes.filter((n) => n.inLinks.length === 0).map((n) => n.index);
    const ends = nodes.filter((n) => n.outLinks.length === 0).map((n) => n.index);

    // Reachable from any start, along every exit.
    const reached = new Set(starts);
    const queue = [...starts];
    while (queue.length) {
        const n = queue.pop();
        for (const li of nodes[n].outLinks) {
            const t = links[li].target;
            if (!reached.has(t)) { reached.add(t); queue.push(t); }
        }
    }
    for (const node of nodes) node.reachable = reached.has(node.index);

    if (!starts.length) warn('NO_START', 'Every step has something leading into it, so there is nowhere for work to begin');
    if (!ends.length) warn('NO_END', 'Every step leads somewhere else, so the work never finishes');
    for (const node of nodes) {
        const out = node.outLinks.map((li) => links[li]);
        if (!node.reachable && starts.length) warn('UNREACHABLE', `Nothing that starts the process leads to "${node.name}"`, node.line);
        if (!out.length && node.kind !== 'terminator') {
            warn('DEAD_END', `"${node.name}" leads nowhere and is not written as an end. Write an end as "(${node.name})", or say what happens next`, node.line);
        }
        if (node.kind === 'decision' && out.length === 1) {
            warn('DECISION_ONE_EXIT', `"${node.name}" is a decision with one way out`, node.line);
        }
        const labels = out.map((l) => l.label.toLowerCase()).filter(Boolean);
        if (new Set(labels).size < labels.length) {
            warn('DUPLICATE_LABEL', `two exits of "${node.name}" carry the same label`, node.line);
        }
    }

    const rework = links.filter((l) => l.rework);
    if (rework.length) {
        const names = rework.slice(0, 4).map((l) => `${nodes[l.source].name} to ${nodes[l.target].name}`);
        const more = rework.length > 4 ? ` and ${rework.length - 4} more` : '';
        warn('REWORK', `${rework.length} exit${rework.length === 1 ? ' sends' : 's send'} work back and ${rework.length === 1 ? 'is' : 'are'} counted as rework: ${names.join('; ')}${more}`);
    }

    // A blank time is more often forgotten than instant, so it is listed once any time is given.
    if (nodes.some((n) => n.timed)) {
        const untimed = nodes.filter((n) => !n.timed && n.kind !== 'terminator');
        if (untimed.length) {
            const names = untimed.slice(0, 5).map((n) => `"${n.name}"`).join(', ');
            const more = untimed.length > 5 ? ` and ${untimed.length - 5} more` : '';
            warn('TIME_MISSING', `${untimed.length} step${untimed.length === 1 ? ' has' : 's have'} no time and count${untimed.length === 1 ? 's' : ''} as zero: ${names}${more}`);
        }
    }

    const lanes = parsed.lanes.map((name, i) => ({ index: i, name, steps: nodes.filter((n) => n.lane === i).length, handoffsIn: 0, handoffsOut: 0 }));
    for (const lane of lanes) {
        if (!lane.steps) warn('EMPTY_LANE', `Lane "${lane.name}" owns no step`);
    }

    // A handoff is work crossing from one lane to another.
    const matrix = lanes.map(() => lanes.map(() => 0));
    let handoffs = 0;
    for (const link of links) {
        const from = nodes[link.source].lane;
        const to = nodes[link.target].lane;
        link.handoff = from !== to;
        if (!link.handoff) continue;
        handoffs += 1;
        matrix[from][to] += 1;
        lanes[from].handoffsOut += 1;
        lanes[to].handoffsIn += 1;
    }

    const phases = (parsed.phases.length ? parsed.phases : [{ name: '', line: null }])
        .map((p, i) => ({ index: i, name: p.name, steps: nodes.filter((n) => n.phase === i).length }));

    return {
        calendar,
        nodes,
        links,
        lanes,
        phases,
        starts,
        ends,
        counts: {
            steps: nodes.length,
            decisions: nodes.filter((n) => n.kind === 'decision').length,
            exits: links.length,
            rework: rework.length,
            handoffs,
            handoffMatrix: matrix
        },
        warnings
    };
}
