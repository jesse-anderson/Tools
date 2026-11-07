// Per-source limits (SOW section 10). A source over any of them is refused
// with the limit named, never compared in part.

export const LIMITS = Object.freeze({
    fileBytes: 40 * 1024 * 1024,
    dataRows: 200000,
    columns: 256,
    cells: 2000000,
    textCellChars: 1048576,
});
