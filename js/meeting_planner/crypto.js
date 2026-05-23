// Tiny SubtleCrypto wrapper for SHA-256 in hex.

const ENCODER = new TextEncoder();

/** SHA-256(input) to lowercase hex string. */
export async function sha256Hex(input) {
    const bytes = ENCODER.encode(input);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const arr = new Uint8Array(digest);
    let out = "";
    for (let i = 0; i < arr.length; i++) {
        out += arr[i].toString(16).padStart(2, "0");
    }
    return out;
}

/**
 * Compute the participant password hash as the Worker expects:
 *   SHA-256(eventId + ":" + password)
 * Returns null for an empty password (the row is then unprotected).
 */
export async function participantPwHash(eventId, password) {
    if (!password) return null;
    return sha256Hex(`${eventId}:${password}`);
}
