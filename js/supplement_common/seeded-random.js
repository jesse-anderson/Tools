// Shared by the Creatine Lab and the Beta-Alanine Lab. The Seed Storage Lab
// holds a copy, and its spec checks the copy against this file.

/** xorshift32 (Marsaglia 2003). Deterministic for a seed; for visual bands, not inference. */
export function createSeededRandom(seed) {
    let state = Math.abs(Math.floor(seed)) >>> 0;
    if (state === 0) state = 2463534242;
    return () => {
        state ^= state << 13;
        state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;
        state >>>= 0;
        return state / 4294967296;
    };
}
