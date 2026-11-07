// Per-source limits (SOW section 10). A source over any of them is refused
// with the limit named, never compared in part.

export const LIMITS = Object.freeze({
    fileBytes: 40 * 1024 * 1024,
    dataRows: 200000,
    columns: 256,
    cells: 2000000,
    textCellChars: 1048576,
    // Workbooks: declared size of everything inside the ZIP, and the longest
    // a worker may spend on one request before it is stopped.
    zipUncompressedBytes: 200 * 1024 * 1024,
    requestSeconds: 120,
});
