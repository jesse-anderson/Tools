// ============================================
// LAMPORT / VECTOR CLOCK ENGINE (pure functions)
// ============================================
// No DOM access. The visualizer delegates all clock math here, and the
// Playwright spec (tests/smoke/lamport-timestamps.spec.cjs) drives these
// functions directly through window.LamportEngine.
//
// Clock rules implemented (Lamport 1978 / Fidge-Mattern vector clocks):
// - Local or send event on P: L(P) = L(P) + 1
// - Receive on P of message m:  L(P) = max(L(P), ts(m)) + 1
// - Vector local/send on P_i:   V[i] = V[i] + 1
// - Vector receive on P_i:      V = elementwise max(V, V_msg); V[i] = V[i] + 1

export function createEmptyVector(size) {
    return new Array(Math.max(0, size)).fill(0);
}

// True when every component of left is <= the matching component of right.
export function vectorLeq(left, right) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
    }

    for (let index = 0; index < left.length; index++) {
        if ((left[index] || 0) > (right[index] || 0)) {
            return false;
        }
    }

    return true;
}

// Causal relation between two vector timestamps:
// 'equal', 'before' (a happened before b), 'after', or 'concurrent'.
export function compareVectors(a, b) {
    const aLeqB = vectorLeq(a, b);
    const bLeqA = vectorLeq(b, a);

    if (aLeqB && bLeqA) return 'equal';
    if (aLeqB) return 'before';
    if (bLeqA) return 'after';
    return 'concurrent';
}

// Number of unordered event pairs whose vectors are incomparable.
// Events without vectors are skipped.
export function countConcurrentPairs(events) {
    if (!Array.isArray(events)) return 0;

    let concurrentPairs = 0;

    for (let leftIndex = 0; leftIndex < events.length; leftIndex++) {
        for (let rightIndex = leftIndex + 1; rightIndex < events.length; rightIndex++) {
            const left = events[leftIndex];
            const right = events[rightIndex];
            if (!Array.isArray(left?.vector) || !Array.isArray(right?.vector)) continue;

            if (compareVectors(left.vector, right.vector) === 'concurrent') {
                concurrentPairs++;
            }
        }
    }

    return concurrentPairs;
}

// Replays an event sequence from zeroed clocks and returns fresh copies with
// recomputed timestamps, vectors, send/receive pairing, and in-flight messages.
// Inputs are not mutated.
//
// processIds: array of process ids; vector component i belongs to processIds[i].
// events: ordered array of { type, processId, targetProcessId, receiveFrom,
//         messageId, id, pairedSendEventId, ... } records.
// mode: 'simple' or 'vector'.
export function replaySequence(processIds, events, mode) {
    const vectorMode = mode === 'vector';
    const ids = Array.isArray(processIds) ? processIds : [];
    const indexById = new Map(ids.map((id, index) => [id, index]));
    const states = ids.map((id) => ({
        id,
        timestamp: 0,
        vector: vectorMode ? createEmptyVector(ids.length) : null
    }));
    const stateById = new Map(states.map((state) => [state.id, state]));
    const openMessages = [];

    const replayedEvents = (Array.isArray(events) ? events : []).map((source) => {
        const event = { ...source };
        const state = stateById.get(event.processId);
        if (!state) {
            return event;
        }

        if (event.type === 'local' || event.type === 'send') {
            state.timestamp += 1;

            if (vectorMode && state.vector) {
                state.vector[indexById.get(state.id)] += 1;
                event.vector = [...state.vector];
            }

            event.timestamp = state.timestamp;
        }

        if (event.type === 'send' && event.targetProcessId) {
            openMessages.push({
                id: event.messageId || '',
                from: event.processId,
                to: event.targetProcessId,
                timestamp: event.timestamp,
                vector: Array.isArray(event.vector) ? [...event.vector] : null,
                sendEventId: event.id,
                processed: false
            });
        }

        if (event.type === 'receive') {
            const matchingIndex = openMessages.findIndex((message) =>
                message.from === event.receiveFrom &&
                message.to === event.processId &&
                (!event.messageId || message.id === event.messageId)
            );
            const matchingMessage = matchingIndex >= 0 ? openMessages[matchingIndex] : null;

            state.timestamp = Math.max(state.timestamp, matchingMessage?.timestamp || 0) + 1;

            if (vectorMode && state.vector) {
                if (Array.isArray(matchingMessage?.vector)) {
                    for (let index = 0; index < state.vector.length; index++) {
                        state.vector[index] = Math.max(
                            state.vector[index],
                            matchingMessage.vector[index] || 0
                        );
                    }
                }

                state.vector[indexById.get(state.id)] += 1;
                event.vector = [...state.vector];
            }

            event.timestamp = state.timestamp;
            event.pairedSendEventId = matchingMessage?.sendEventId || event.pairedSendEventId || null;

            if (matchingIndex >= 0) {
                openMessages.splice(matchingIndex, 1);
            }
        }

        if (!vectorMode) {
            event.vector = null;
        }

        return event;
    });

    return {
        processes: states,
        events: replayedEvents,
        pendingMessages: openMessages
    };
}

// Removes a process from an event sequence: drops every event that touches
// the removed process and shifts higher process ids down by one so ids stay
// contiguous. Returns new event copies; vectors are left for replaySequence
// to rebuild. Inputs are not mutated.
export function removeProcessFromEvents(events, removedId) {
    const shift = (id) => (id && id > removedId ? id - 1 : id);

    return (Array.isArray(events) ? events : [])
        .filter((event) =>
            event.processId !== removedId &&
            event.receiveFrom !== removedId &&
            event.targetProcessId !== removedId
        )
        .map((event) => ({
            ...event,
            processId: shift(event.processId),
            receiveFrom: shift(event.receiveFrom),
            targetProcessId: shift(event.targetProcessId)
        }));
}

const LamportEngine = {
    createEmptyVector,
    vectorLeq,
    compareVectors,
    countConcurrentPairs,
    replaySequence,
    removeProcessFromEvents
};

if (typeof window !== 'undefined') {
    window.LamportEngine = LamportEngine;
}

export default LamportEngine;
