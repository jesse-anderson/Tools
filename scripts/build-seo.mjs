// Search and link-preview tags, sitemap.xml and robots.txt.
//
//   node scripts/build-seo.mjs           rewrite whatever is stale
//   node scripts/build-seo.mjs --check   change nothing, exit non-zero if stale
//
// A page author writes two things by hand: <title> and
// <meta name="description">. The canonical link and the Open Graph and Twitter
// tags are derived from those two and rewritten here, directly under the
// description, so they cannot drift from it. sitemap.xml lists the hub and
// every tool in the tools.html catalog, on the domain named in CNAME.
//
// tests/smoke/tool-surface-conformance.spec.cjs runs this with --check --json,
// so a new tool without a description, or a title edited without rerunning
// this, fails the suite.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');
const asJson = process.argv.includes('--json');

const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(root, rel));

const ORIGIN = `https://${read('CNAME').trim()}`;
const SITE_NAME = 'Tools Hub';
const HUB = 'tools.html';

// Served and reachable from inside another tool, but not in the catalog.
// They get tags like any page and stay out of the sitemap.
const SUBPAGES = ['tools/figure-rectifier.html', 'tools/meeting-planner-privacy.html'];

// Search results cut a description near 160 characters. Under 70 it says too
// little to be chosen over text scraped from the page.
const DESCRIPTION_MIN = 70;
const DESCRIPTION_MAX = 160;

const DESCRIPTION_LINE = /^([ \t]*)<meta\s+name="description"\s+content="([^"]*)"\s*\/?>[ \t]*(\r*\n)/m;
const DERIVED_LINE = /^[ \t]*<(?:link\s+rel="canonical"|meta\s+property="og:[^"]*"|meta\s+name="twitter:[^"]*")[^>]*>[ \t]*\r*\n/gm;

function catalogPages() {
    const pages = [];
    for (const tag of read(HUB).match(/<a\b[^>]*>/gi) || []) {
        const href = /\bhref\s*=\s*"([^"]+)"/i.exec(tag);
        const cls = /\bclass\s*=\s*"([^"]+)"/i.exec(tag);
        if (!href || !cls || !cls[1].split(/\s+/).includes('tool-card')) continue;
        if (!href[1].startsWith('tools/') || !href[1].endsWith('.html')) continue;
        if (!pages.includes(href[1])) pages.push(href[1]);
    }
    return pages;
}

function derivedBlock(indent, eol, url, title, description) {
    const ogTitle = title.replace(/\s*\|\s*Tools Hub$/, '');
    return [
        `<link rel="canonical" href="${url}">`,
        '<meta property="og:type" content="website">',
        `<meta property="og:site_name" content="${SITE_NAME}">`,
        `<meta property="og:title" content="${ogTitle}">`,
        `<meta property="og:description" content="${description}">`,
        `<meta property="og:url" content="${url}">`,
        '<meta name="twitter:card" content="summary">',
    ].map((line) => indent + line + eol).join('');
}

const catalog = catalogPages();
const pages = [HUB, ...catalog, ...SUBPAGES];
const problems = [];
const written = [];
const seenTitles = new Map();
const seenDescriptions = new Map();

for (const rel of pages) {
    if (!exists(rel)) {
        problems.push({ kind: 'missing-page', page: rel, detail: 'listed but not on disk' });
        continue;
    }
    const html = read(rel);

    const titleMatch = /<title>([^<]*)<\/title>/.exec(html);
    const title = titleMatch ? titleMatch[1].trim() : '';
    if (!title || title.includes('"')) {
        problems.push({ kind: 'title', page: rel, detail: 'needs a <title> with no double quote in it' });
        continue;
    }
    if (seenTitles.has(title)) {
        problems.push({ kind: 'title', page: rel, detail: `same <title> as ${seenTitles.get(title)}` });
    }
    seenTitles.set(title, rel);

    const descMatch = DESCRIPTION_LINE.exec(html);
    if (!descMatch) {
        problems.push({
            kind: 'description',
            page: rel,
            detail: 'needs <meta name="description" content="..."> on its own line in <head>',
        });
        continue;
    }
    const [descLine, indent, description, eol] = descMatch;
    if (description.length < DESCRIPTION_MIN || description.length > DESCRIPTION_MAX) {
        problems.push({
            kind: 'description',
            page: rel,
            detail: `description is ${description.length} characters, wanted ${DESCRIPTION_MIN} to ${DESCRIPTION_MAX}`,
        });
    }
    if (seenDescriptions.has(description)) {
        problems.push({ kind: 'description', page: rel, detail: `same description as ${seenDescriptions.get(description)}` });
    }
    seenDescriptions.set(description, rel);

    const url = `${ORIGIN}/${rel}`;
    const stripped = html.replace(DERIVED_LINE, '');
    // A function, so a "$" in a description is not read as a replacement pattern.
    const rebuilt = stripped.replace(descLine, () => descLine + derivedBlock(indent, eol, url, title, description));
    if (rebuilt !== html) {
        if (checkOnly) {
            problems.push({ kind: 'stale-tags', page: rel, detail: 'canonical or social tags do not match the title and description' });
        } else {
            fs.writeFileSync(path.join(root, rel), rebuilt);
            written.push(rel);
        }
    }
}

const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...[HUB, ...catalog].map((rel) => `  <url><loc>${ORIGIN}/${rel}</loc></url>`),
    '</urlset>',
    '',
].join('\n');

const robots = ['User-agent: *', 'Allow: /', '', `Sitemap: ${ORIGIN}/sitemap.xml`, ''].join('\n');

// Git may check these out with CRLF, which is not a difference worth reporting.
for (const [rel, wanted] of [['sitemap.xml', sitemap], ['robots.txt', robots]]) {
    const current = exists(rel) ? read(rel).replace(/\r\n/g, '\n') : null;
    if (current === wanted) continue;
    if (checkOnly) {
        problems.push({ kind: 'stale-site-file', page: rel, detail: 'does not match the tools.html catalog' });
    } else {
        fs.writeFileSync(path.join(root, rel), wanted);
        written.push(rel);
    }
}

if (asJson) {
    console.log(JSON.stringify({ pages, problems, written }));
} else {
    for (const rel of written) console.log(`wrote ${rel}`);
    for (const p of problems) console.error(`${p.page}: ${p.detail}`);
    if (!problems.length) console.log(`${pages.length} pages, ${catalog.length + 1} sitemap URLs, all current`);
    else if (checkOnly) console.error('\nFix the pages above, then run: node scripts/build-seo.mjs');
}
process.exit(problems.length ? 1 : 0);
