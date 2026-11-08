// Size limits for a fishbone board. Shared with the worker, so the page and
// the server refuse the same things.

export const LIMITS = Object.freeze({
    categories: 12,
    causes: 300,
    depth: 6,
    causeText: 160,
    evidenceText: 600,
    evidencePerCause: 20,
    effect: 200,
    effectPart: 120,
    title: 120,
    note: 300,
    owner: 60,
    memberName: 80,
    members: 25,
    history: 500,
    fileBytes: 1000000,
    linkChars: 8000
});
