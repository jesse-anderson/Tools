// 2-bit packed bitfield codec + base64 helpers.
//
// Slot states:
//   0 = unavailable
//   1 = available
//   2 = preferred
//   3 = reserved
//
// Layout: slot i lives in byte floor(i*2/8) at bit offset (i*2) mod 8 (LSB first).

export const SLOT_UNAVAILABLE = 0;
export const SLOT_AVAILABLE = 1;
export const SLOT_PREFERRED = 2;

/** Bytes required to hold `totalSlots` 2-bit values. */
export function packedByteLength(totalSlots) {
    return Math.ceil((totalSlots * 2) / 8);
}

/** Create a zero-initialized packed bitfield large enough for `totalSlots`. */
export function newPackedSlots(totalSlots) {
    return new Uint8Array(packedByteLength(totalSlots));
}

/** Read the 2-bit value at slot index `i` from `bytes`. */
export function getSlot(bytes, i) {
    const byteIdx = (i * 2) >>> 3;
    const bitOff = (i * 2) & 7;
    return (bytes[byteIdx] >>> bitOff) & 0b11;
}

/** Write the 2-bit value `v` at slot index `i` in `bytes`. Mutates. */
export function setSlot(bytes, i, v) {
    const byteIdx = (i * 2) >>> 3;
    const bitOff = (i * 2) & 7;
    bytes[byteIdx] = (bytes[byteIdx] & ~(0b11 << bitOff)) | ((v & 0b11) << bitOff);
}

/** Uint8Array to base64. */
export function bytesToBase64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}

/** base64 to Uint8Array. */
export function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
