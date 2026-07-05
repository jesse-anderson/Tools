// ============================================
// PDF Diff Checker - pdf.js Bootstrap
// ============================================
// Loads the pinned pdf.js build and exposes it for the other modules.
// Lives in a file (not an inline script) so the page CSP can drop
// 'unsafe-inline' for scripts.

import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
window.pdfjsLib = pdfjsLib;
