// The uniform tooling surface: the rules a new tool has to satisfy.
//
// Written September 2026, at the end of the scope-disclaimer rollout, because
// the rollout kept finding the same three defects in tools nobody had touched
// in a year, and every one of them renders a page that looks fine:
//
//   1. A page with no scope notice at all. Fourteen tools were in that state
//      when the rollout started, including Active ones feeding decisions about
//      real hardware.
//   2. A plain `div` wearing `.disclaimer-card`, which is the shared
//      component's class name. Seven tools had one in phase 5 alone, and three
//      of those were not disclaimers at all but reference boxes. Anything
//      auditing this repo by class name scores them as covered.
//   3. A tool stylesheet redefining a shared theme variable in a bare `:root`.
//      That has the same specificity as shared.css's `[data-theme="light"]`
//      block and loads after it, so it silently defeats the light-theme
//      correction. This is the mechanism that produced the original 19 WCAG
//      failures.
//
// These read files from disk rather than loading pages, so the whole file costs
// nothing and can afford to check every tool rather than a sampled list.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { repoRoot, toolPaths } = require('./helpers.cjs');

const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

// Every linked tool page, plus the two pages that are unlinked from the catalog
// but legitimately reached from inside another tool. Those two are served by the
// static host and reachable by direct URL, so "not in the catalog" is not a
// reason to have no notice on them.
const REACHABLE_SUBPAGES = ['tools/figure-rectifier.html', 'tools/meeting-planner-privacy.html'];
const ALL_PAGES = [...toolPaths.map((p) => p.replace(/^\//, '')), ...REACHABLE_SUBPAGES];

// One page predates the shared component and is deliberately left on its own
// shape: hormone-research-reference gates entry behind an acknowledgement splash
// and then shows a .liability-banner plus a .scope-warning-block. It is one of
// the three reference implementations the rollout was modelled on, it is
// content-complete at 5 of 5 legal elements, and its headings are measured by
// disclaimer-contrast.spec.cjs through the .scope-warning-block selector. It is
// listed here rather than matched by a looser regex so that "this page is not on
// the shared component" stays a visible fact rather than an accident.
const LEGACY_NOTICE_SHAPES = new Map([
  ['tools/hormone-research-reference.html', 'scope-warning-block'],
]);

test('every reachable tool page carries a scope notice', () => {
  const missing = ALL_PAGES.filter((rel) => {
    const html = read(rel);
    const legacy = LEGACY_NOTICE_SHAPES.get(rel);
    if (legacy) return !html.includes(`class="${legacy}"`);
    return !/class="disclaimer-card"|class="disclaimer"/.test(html);
  });
  expect(
    missing,
    'These pages are served and reachable by URL with no scope notice. A page gets ' +
      'either the sectioned .disclaimer-card (see css/shared.css) or, for a low-consequence ' +
      'tool, one p.disclaimer paragraph linking to tools.html#siteDisclaimer.'
  ).toEqual([]);
});

test('.disclaimer-card is always the shared component, never a div wearing its name', () => {
  const squatters = [];
  for (const rel of ALL_PAGES) {
    const html = read(rel);
    // The component is <details class="disclaimer-card"> with a <summary>.
    // Anything else carrying the class is borrowing the name.
    const tags = [...html.matchAll(/<(\w+)[^>]*class="[^"]*\bdisclaimer-card\b[^"]*"/g)];
    for (const m of tags) {
      if (m[1] !== 'details') squatters.push(`${rel}: <${m[1]}>`);
    }
    if (tags.length && !/<details[^>]*class="[^"]*\bdisclaimer-card\b[^"]*"[\s\S]{0,400}?<summary/.test(html)) {
      squatters.push(`${rel}: .disclaimer-card with no <summary>`);
    }
  }
  expect(
    squatters,
    'A .disclaimer-card must be <details> with a <summary>. If the box is usage notes, ' +
      'a licence list or anything else, give it its own class (.usage-note, .info-card) ' +
      'so a reader and a selector-based audit can both tell them apart.'
  ).toEqual([]);
});

// A tool stylesheet may legitimately define its own namespaced variables in
// :root (--json-key, --creatine-orange). What it may not do is redefine a
// variable shared.css owns, without also correcting it for light theme.
//
// Two files are listed as known and unfixed. Both re-declare the three accent
// colours and their -dim pairs with exactly the values shared.css already gives
// them in dark theme, which means those pages ship dark accents in light theme
// everywhere they use them. The fix is to delete the duplicated declarations,
// which changes nothing in dark theme. It is held pending the maintainer's
// call, because it changes the appearance of two Active tools in light theme
// and that is a judgement about the tools, not about the test.
//
// Add a file here only with a comment saying why and what removes it.
const KNOWN_UNCORRECTED_ROOT_OVERRIDES = new Map([
  ['css/duckdb_playground/duckdb-base.css', ['--accent-error', '--accent-error-dim', '--accent-success', '--accent-success-dim', '--accent-warning', '--accent-warning-dim']],
  ['css/psychrometric/base-chart.css', ['--accent-error', '--accent-success', '--accent-warning']],
]);

function sharedRootVars() {
  const shared = read('css/shared.css');
  const block = /:root\s*{([\s\S]*?)}/.exec(shared);
  expect(block, 'css/shared.css has no :root block; this guard cannot run').not.toBeNull();
  return new Set([...block[1].matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
}

function toolStylesheets() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'vendor') walk(rel);
      } else if (entry.name.endsWith('.css') && rel !== 'css/shared.css') {
        out.push(rel);
      }
    }
  };
  walk('css');
  return out;
}

test('no tool stylesheet defeats the light theme from a bare :root', () => {
  const shared = sharedRootVars();
  const offenders = [];

  for (const rel of toolStylesheets()) {
    const css = read(rel);

    const overridden = new Set();
    for (const m of css.matchAll(/:root\s*{([\s\S]*?)}/g)) {
      for (const v of m[1].matchAll(/(--[\w-]+)\s*:/g)) {
        if (shared.has(v[1])) overridden.add(v[1]);
      }
    }
    if (!overridden.size) continue;

    // Corrected means the file's own [data-theme="light"] block redefines the
    // same variable. "Has a light block somewhere" is not enough: the point is
    // whether THIS variable gets a light value back.
    const corrected = new Set();
    for (const m of css.matchAll(/\[data-theme="light"\][^{]*{([\s\S]*?)}/g)) {
      for (const v of m[1].matchAll(/(--[\w-]+)\s*:/g)) corrected.add(v[1]);
    }

    const known = new Set(KNOWN_UNCORRECTED_ROOT_OVERRIDES.get(rel) || []);
    const gap = [...overridden].filter((v) => !corrected.has(v) && !known.has(v)).sort();
    if (gap.length) offenders.push(`${rel}: ${gap.join(', ')}`);
  }

  expect(
    offenders,
    'A bare :root in a tool stylesheet has the same specificity as shared.css\'s ' +
      '[data-theme="light"] block and loads after it, so redefining a shared theme ' +
      'variable there wins in BOTH themes and the light correction never lands. Either ' +
      'drop the declaration (usually it duplicates the shared dark value anyway) or ship ' +
      'a [data-theme="light"] block in the same file that gives the variable a light value.'
  ).toEqual([]);
});

test('the known-offender list stays honest', () => {
  // A list of known exceptions rots the moment someone fixes one and leaves the
  // entry behind, at which point the guard is quietly weaker than it reads.
  const shared = sharedRootVars();
  for (const [rel, vars] of KNOWN_UNCORRECTED_ROOT_OVERRIDES) {
    const css = read(rel);
    const overridden = new Set();
    for (const m of css.matchAll(/:root\s*{([\s\S]*?)}/g)) {
      for (const v of m[1].matchAll(/(--[\w-]+)\s*:/g)) {
        if (shared.has(v[1])) overridden.add(v[1]);
      }
    }
    const corrected = new Set();
    for (const m of css.matchAll(/\[data-theme="light"\][^{]*{([\s\S]*?)}/g)) {
      for (const v of m[1].matchAll(/(--[\w-]+)\s*:/g)) corrected.add(v[1]);
    }
    const stillBroken = vars.filter((v) => overridden.has(v) && !corrected.has(v));
    expect(
      stillBroken.sort(),
      `${rel} is listed as a known uncorrected override, but some of the listed ` +
        'variables are now fine. Remove them from KNOWN_UNCORRECTED_ROOT_OVERRIDES.'
    ).toEqual([...vars].sort());
  }
});

test('the shared disclaimer component never paints text in --text-muted', () => {
  // --text-muted measures 2.6:1 in light theme and 3.7:1 in dark, failing WCAG
  // AA in both. The component avoids it by rule, and the only way that stays
  // true is if nobody reintroduces it in a tool override.
  const offenders = [];
  for (const rel of toolStylesheets().concat(['css/shared.css'])) {
    const css = read(rel);
    for (const m of css.matchAll(/([^{}]*\bdisclaimer[^{}]*){([^}]*)}/g)) {
      const selector = m[1].trim().replace(/\s+/g, ' ');
      if (selector.startsWith('/*') || selector.includes('*/')) continue;
      if (/(^|[^-])color\s*:\s*var\(--text-muted\)/.test(m[2])) {
        offenders.push(`${rel}: ${selector}`);
      }
    }
  }
  expect(
    offenders,
    '--text-muted fails WCAG AA in both themes (2.6:1 light, 3.7:1 dark). Use ' +
      '--text-secondary for any disclaimer text that is meant to be read.'
  ).toEqual([]);
});
