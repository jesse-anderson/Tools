// Asks the live site for the OCR tool's worker scripts and reports whether
// each comes back with the policy the test server sends. A worker takes its
// policy from its own response, and the host adds that header by rule, so
// nothing in the repo can set it. Exits non-zero when one is missing.
//
// node scripts/check-ocr-worker-headers.mjs [origin]

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { OCR_WORKER_CSP } = require('../tests/smoke/server.cjs');

const domain = readFileSync(new URL('../CNAME', import.meta.url), 'utf8').trim().replace(/\.$/, '');
const origin = process.argv[2] || `https://${domain}`;
const WORKERS = [
    '/js/vendor/ocr_text_extractor/worker.min.js',
    '/js/vendor/ocr_text_extractor/pdf.worker.min.mjs',
    '/js/ocr_text_extractor/ocr-second-worker.js'
];

let missing = 0;
for (const path of WORKERS) {
    const response = await fetch(origin + path);
    const policy = response.headers.get('content-security-policy');
    const ok = policy === OCR_WORKER_CSP;
    if (!ok) missing++;
    console.log(`${ok ? 'ok     ' : 'MISSING'} ${response.status} ${path}${ok ? '' : `\n        got: ${policy || 'no policy header'}`}`);
}
console.log(missing ? `\nWanted on each: ${OCR_WORKER_CSP}` : '\nEvery worker script carries the policy.');
process.exitCode = missing ? 1 : 0;
