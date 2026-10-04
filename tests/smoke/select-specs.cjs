// Picks the specs a push needs to run, from the files it changed.
//
// Nothing here is a hand-kept table. A tool page names its own stylesheets and
// scripts, and a spec names the pages it opens, so the map is read from the
// files each time. A changed file nobody can place runs everything.
//
//   git diff --name-only A B | node select-specs.cjs      prints specs, or ALL
//   node select-specs.cjs --check                         lists specs no tool file selects

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SMOKE = __dirname;

// Cheap, and they cover every page: run on every push.
const ALWAYS = ['tool-surface-conformance.spec.cjs', 'tool-pages-load.spec.cjs', 'tools-hub.spec.cjs'];

// Shared by every page or by the suite itself.
const EVERYTHING = [
    /^css\/shared\.css$/, /^js\/shared\.js$/, /^js\/footer\.js$/,
    /^tests\/smoke\/(helpers|server|playwright\.config|select-specs)\.cjs$/,
    /^tests\/smoke\/package(-lock)?\.json$/, /^\.github\//, /^scripts\//
];
// Specs that name no page of their own and follow a kind of file instead.
// The contrast spec measures every page, so any stylesheet can move it.
const BY_PATH = { 'disclaimer-contrast.spec.cjs': /^css\// };
// Changes that no test reads.
const NOTHING = [/\.md$/i, /^docs\//, /^\.claude\//, /^LICENSE$/, /^\.gitignore$/, /^CNAME$/];

const read = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch (e) { return ''; } };

function specList() {
    const config = read(path.join(SMOKE, 'playwright.config.cjs'));
    return [...config.matchAll(/'([a-z0-9-]+\.spec\.cjs)'/g)].map((m) => m[1]);
}

/** Tool page slug to the css and js folders it loads. */
function pageFolders() {
    const pages = new Map();
    for (const file of fs.readdirSync(path.join(ROOT, 'tools'))) {
        if (!file.endsWith('.html')) continue;
        const html = read(path.join(ROOT, 'tools', file));
        const folders = new Set();
        for (const m of html.matchAll(/\.\.\/((?:css|js)\/[A-Za-z0-9_\-/]+)\/[^"'/]+\.(?:css|js)/g)) folders.add(m[1]);
        pages.set(file, folders);
    }
    return pages;
}

/** Spec file to the tool pages it opens. */
function specPages(specs) {
    const map = new Map();
    for (const spec of specs) {
        const text = read(path.join(SMOKE, spec));
        map.set(spec, new Set([...text.matchAll(/tools\/([a-z0-9-]+\.html)/g)].map((m) => m[1])));
    }
    return map;
}

function select(changed) {
    const specs = specList();
    const pages = pageFolders();
    const opens = specPages(specs);
    const chosen = new Set(ALWAYS.filter((s) => specs.includes(s)));

    for (const raw of changed) {
        const file = raw.trim().replace(/\\/g, '/');
        if (!file) continue;
        if (NOTHING.some((re) => re.test(file))) continue;
        if (EVERYTHING.some((re) => re.test(file))) return 'ALL';

        const spec = /^tests\/smoke\/([a-z0-9-]+\.spec\.cjs)$/.exec(file);
        if (spec) { if (specs.includes(spec[1])) chosen.add(spec[1]); continue; }
        if (file === 'tools.html' || file === 'index.html' || file === 'sitemap.xml' || file === 'robots.txt') continue;

        for (const [name, re] of Object.entries(BY_PATH)) {
            if (re.test(file) && specs.includes(name)) chosen.add(name);
        }

        // The pages this file belongs to: the page itself, or any page loading its folder.
        const touched = [];
        const page = /^tools\/([a-z0-9-]+\.html)$/.exec(file);
        if (page) touched.push(page[1]);
        for (const [name, folders] of pages) {
            if ([...folders].some((folder) => file.startsWith(`${folder}/`))) touched.push(name);
        }
        if (!touched.length) return 'ALL';

        let covered = false;
        for (const [name, opened] of opens) {
            if (touched.some((t) => opened.has(t))) { chosen.add(name); covered = true; }
        }
        // A page no spec names is still loaded by the page-load spec, which always runs.
        if (!covered && !page) return 'ALL';
    }
    return [...chosen];
}

if (process.argv.includes('--check')) {
    const specs = specList();
    const opens = specPages(specs);
    const loose = specs.filter((s) => !ALWAYS.includes(s) && !BY_PATH[s] && opens.get(s).size === 0);
    process.stdout.write(loose.length ? `No tool page selects: ${loose.join(' ')}\n` : 'Every spec is selected by at least one tool page.\n');
    process.exit(loose.length ? 1 : 0);
}

if (require.main === module) {
    const input = process.argv.length > 2 ? process.argv.slice(2).join('\n') : fs.readFileSync(0, 'utf8');
    const result = select(input.split(/\r?\n/));
    process.stdout.write(result === 'ALL' ? 'ALL\n' : `${result.join(' ')}\n`);
}

module.exports = { select };
