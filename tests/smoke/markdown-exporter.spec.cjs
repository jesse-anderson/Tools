// Engine tests for the Markdown Exporter via window.MarkdownExporter: the
// export string/number helpers and the pure Markdown -> sanitized DOM -> pdfmake
// document-definition pipeline (headings, inline formatting, lists, tables,
// code blocks, and the horizontal-rule width guard). The DOM-walking structure
// here is shared with the DOCX path, so covering it locks the bulk of the
// conversion logic. This tool previously had no automated coverage.
const { test, expect } = require('@playwright/test');
const { startServer } = require('./server.cjs');

const TOOL_PATH = '/tools/markdown-exporter.html';
let smokeServer;

test.beforeAll(async () => {
  smokeServer = await startServer({
    port: Number(process.env.PORT || 4173),
    reuseExisting: !process.env.CI
  });
});

test.afterAll(async () => {
  if (smokeServer) {
    await smokeServer.close();
    smokeServer = null;
  }
});

async function openTool(page) {
  await page.goto(TOOL_PATH);
  await page.waitForFunction(() => window.MarkdownExporter
    && typeof window.MarkdownExporter.renderToPdfDefinition === 'function');
}

test.describe('export helpers', () => {
  test('normalizeExportFilename sanitizes and falls back', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { normalizeExportFilename: n } = window.MarkdownExporter;
      return {
        spaces: n('  my report  '),
        invalid: n('a/b:c*d?e'),
        collapse: n('a---b   c'),
        trims: n('..-hello-.-'),
        empty: n('///'),
        blank: n('')
      };
    });
    expect(out.spaces).toBe('my-report');
    expect(out.invalid).toBe('abcde');
    expect(out.collapse).toBe('a-b-c');
    expect(out.trims).toBe('hello');
    expect(out.empty).toBe('markdown-export');
    expect(out.blank).toBe('markdown-export');
  });

  test('extractTitle finds the first H1 but skips fenced code blocks', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { extractTitle: t } = window.MarkdownExporter;
      return {
        normal: t('intro\n\n# Real Title\nbody'),
        firstOnly: t('# First\n# Second'),
        backtickFence: t('```\n# not a title\n```\n\n# Actual'),
        tildeFence: t('~~~\n# nope\n~~~'),
        h2NotMatched: t('## Second level only'),
        none: t('just text')
      };
    });
    expect(out.normal).toBe('Real Title');
    expect(out.firstOnly).toBe('First');
    expect(out.backtickFence).toBe('Actual');
    expect(out.tildeFence).toBe('');
    expect(out.h2NotMatched).toBe('');
    expect(out.none).toBe('');
  });

  test('clampNumber, stripExtension, dedupeWarnings, getPaperDimensions', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { clampNumber, stripExtension, dedupeWarnings, getPaperDimensions } = window.MarkdownExporter;
      return {
        inRange: clampNumber('1.25', 0.25, 2, 0.5),
        belowMin: clampNumber('0.1', 0.25, 2, 0.5),
        aboveMax: clampNumber('9', 0.25, 2, 0.5),
        nonFinite: clampNumber('abc', 0.25, 2, 0.5),
        strip: stripExtension('notes.final.md'),
        dedupe: dedupeWarnings(['a', 'a', '', null, 'b']),
        letterPortrait: getPaperDimensions('letter', 'portrait'),
        letterLandscape: getPaperDimensions('letter', 'landscape'),
        a4Portrait: getPaperDimensions('a4', 'portrait')
      };
    });
    expect(out.inRange).toBeCloseTo(1.25, 10);
    expect(out.belowMin).toBeCloseTo(0.25, 10);
    expect(out.aboveMax).toBeCloseTo(2, 10);
    expect(out.nonFinite).toBeCloseTo(0.5, 10);
    expect(out.strip).toBe('notes.final');
    expect(out.dedupe).toEqual(['a', 'b']);
    expect(out.letterPortrait).toEqual({ widthIn: 8.5, heightIn: 11 });
    expect(out.letterLandscape).toEqual({ widthIn: 11, heightIn: 8.5 });
    expect(out.a4Portrait).toEqual({ widthIn: 8.27, heightIn: 11.69 });
  });
});

test.describe('PDF definition: page setup', () => {
  test('maps page size, orientation, and margins', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { buildPdfDefinition } = window.MarkdownExporter;
      const root = document.createElement('article');
      root.innerHTML = '<p>hello</p>';
      const def = buildPdfDefinition(root, { pageSize: 'a4', orientation: 'landscape', marginIn: 1, title: 'T' });
      return {
        pageSize: def.pageSize,
        orientation: def.pageOrientation,
        margins: def.pageMargins,
        font: def.defaultStyle.font,
        infoTitle: def.info.title
      };
    });
    expect(out.pageSize).toBe('A4');
    expect(out.orientation).toBe('landscape');
    expect(out.margins).toEqual([72, 72, 72, 72]); // 1in = 72pt each side
    expect(out.font).toBe('SourceSerifPro');
    expect(out.infoTitle).toBe('T');
  });
});

test.describe('PDF definition: block conversion', () => {
  test('headings map to styles and the lead paragraph is tagged', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { renderToPdfDefinition } = window.MarkdownExporter;
      const def = renderToPdfDefinition('# Title\n\nLead text.\n\n## Sub\n\nBody text.');
      return def.content.map((n) => (n && n.style) || (n && n.text ? 'text' : 'other'));
    });
    expect(out[0]).toBe('h1');
    expect(out[1]).toEqual(['paragraph', 'lead']); // first paragraph after H1
    expect(out[2]).toBe('h2');
    expect(out[3]).toBe('paragraph');
  });

  test('inline formatting produces styled text fragments', async ({ page }) => {
    await openTool(page);
    const frags = await page.evaluate(() => {
      const { renderToPdfDefinition } = window.MarkdownExporter;
      const def = renderToPdfDefinition('Plain **bold** *italic* ~~strike~~ `code` [link](https://example.com).');
      const para = def.content.find((n) => Array.isArray(n.text));
      return para.text;
    });
    // Guard on object type: plain strings carry legacy String.prototype.bold /
    // .italics / .strike / .link methods that would falsely satisfy `f.bold`.
    const objs = frags.filter((f) => typeof f === 'object' && f !== null);
    const bold = objs.find((f) => f.bold);
    const italic = objs.find((f) => f.italics);
    const strike = objs.find((f) => f.decoration === 'lineThrough');
    const code = objs.find((f) => f.style === 'inlineCode');
    const link = objs.find((f) => f.link);
    expect(bold).toMatchObject({ text: 'bold', bold: true });
    expect(italic).toMatchObject({ text: 'italic', italics: true });
    expect(strike).toMatchObject({ text: 'strike', decoration: 'lineThrough' });
    expect(code).toMatchObject({ text: 'code', style: 'inlineCode' });
    expect(link).toMatchObject({ text: 'link', link: 'https://example.com', decoration: 'underline' });
  });

  test('lists become ul/ol nodes', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { renderToPdfDefinition } = window.MarkdownExporter;
      const ul = renderToPdfDefinition('- one\n- two');
      const ol = renderToPdfDefinition('1. one\n2. two');
      return {
        ulNode: !!ul.content.find((n) => Array.isArray(n.ul)),
        ulCount: (ul.content.find((n) => Array.isArray(n.ul)) || {}).ul?.length,
        olNode: !!ol.content.find((n) => Array.isArray(n.ol)),
        olCount: (ol.content.find((n) => Array.isArray(n.ol)) || {}).ol?.length
      };
    });
    expect(out.ulNode).toBe(true);
    expect(out.ulCount).toBe(2);
    expect(out.olNode).toBe(true);
    expect(out.olCount).toBe(2);
  });

  test('table header cells get the tableHeader style', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { renderToPdfDefinition } = window.MarkdownExporter;
      const def = renderToPdfDefinition('| A | B |\n| --- | --- |\n| 1 | 2 |');
      const tableNode = def.content.find((n) => n.table && n.table.body && n.table.body.length > 1);
      const header = tableNode.table.body[0];
      return {
        headerRows: tableNode.table.headerRows,
        firstCellStyle: header[0].style,
        firstCellText: header[0].text,
        bodyText: tableNode.table.body[1][0].text
      };
    });
    expect(out.headerRows).toBe(1);
    expect(out.firstCellStyle).toContain('tableHeader');
    expect(out.firstCellText).toBe('A');
    expect(out.bodyText).toBe('1');
  });

  test('fenced code block becomes a styled code table', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { renderToPdfDefinition } = window.MarkdownExporter;
      const def = renderToPdfDefinition('```js\nconst x = 1;\n```');
      // The code block is a single-cell table styled codeBlockText (not the
      // multi-row markdown table).
      const codeNode = def.content.find((n) => n.table
        && n.table.body.length === 1
        && n.table.body[0][0].style === 'codeBlockText');
      return {
        found: !!codeNode,
        text: codeNode && codeNode.table.body[0][0].text,
        preserveSpaces: codeNode && codeNode.table.body[0][0].preserveLeadingSpaces
      };
    });
    expect(out.found).toBe(true);
    expect(out.text).toContain('const x = 1;');
    expect(out.preserveSpaces).toBe(true);
  });

  test('horizontal rule width is capped to the content width', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { renderToPdfDefinition } = window.MarkdownExporter;
      const wide = renderToPdfDefinition('a\n\n---\n\nb', { pageSize: 'letter', orientation: 'portrait', marginIn: 0.5 });
      const narrow = renderToPdfDefinition('a\n\n---\n\nb', { pageSize: 'letter', orientation: 'portrait', marginIn: 2 });
      const x2 = (def) => def.content.find((n) => n.canvas).canvas[0].x2;
      return { wide: x2(wide), narrow: x2(narrow) };
    });
    // 0.5in margins -> content width 540pt, so the default 480 rule fits as-is.
    expect(out.wide).toBe(480);
    // 2in margins -> content width (8.5 - 4) * 72 = 324pt, so the rule is capped.
    expect(out.narrow).toBeCloseTo(324, 5);
  });

  test('GFM table column alignment carries into PDF cells', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() => {
      const { renderToPdfDefinition } = window.MarkdownExporter;
      const def = renderToPdfDefinition('| L | C | R |\n| :--- | :---: | ---: |\n| a | b | 1 |');
      const tableNode = def.content.find((n) => n.table && n.table.body.length > 1);
      return {
        header: tableNode.table.body[0].map((c) => c.alignment || null),
        body: tableNode.table.body[1].map((c) => c.alignment || null)
      };
    });
    expect(out.header).toEqual(['left', 'center', 'right']);
    expect(out.body).toEqual(['left', 'center', 'right']);
  });
});

test.describe('DOCX export (structured)', () => {
  test('builds a valid .docx for a rich document without throwing', async ({ page }) => {
    await openTool(page);
    // Exercises the DOCX changes: numbering levels beyond 3 (5-deep ordered
    // list), table header-row repeat + column alignment, blockquote styling,
    // and code-block line building. A missing numbering level or a malformed
    // element would throw inside the docx build, so a valid PK zip proves the
    // whole structured path holds together. docx.mjs is vendored locally, so
    // this stays hermetic (no CDN).
    const out = await page.evaluate(() => window.MarkdownExporter.inspectDocx([
      '# Heading',
      '',
      'Body with **bold**, *italic*, `code`, and [a link](https://example.com).',
      '',
      '1. one',
      '   1. two',
      '      1. three',
      '         1. four',
      '            1. five',
      '',
      '| Left | Center | Right |',
      '| :--- | :---: | ---: |',
      '| a | b | 1 |',
      '',
      '> a blockquote',
      '',
      '```sql',
      'SELECT id FROM t WHERE id = 1;',
      '```'
    ].join('\n'), { title: 'Docx Test', marginIn: 1 }));
    expect(out.signature).toBe('PK'); // DOCX is a ZIP container
    expect(out.byteLength).toBeGreaterThan(2000);
  });
});

test.describe('standalone HTML export', () => {
  test('emits a full styled document that preserves alignment and formatting', async ({ page }) => {
    await openTool(page);
    const html = await page.evaluate(() => window.MarkdownExporter.renderStandaloneHtml(
      '# Title\n\nBody **bold**.\n\n| L | R |\n| :-- | --: |\n| a | 1 |',
      { title: 'My Title', marginIn: 1 }));
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<title>My Title</title>');
    expect(html).toContain('<style>');
    expect(html).toContain('md-export-root');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('align="right"'); // GFM alignment survives to HTML
    expect(html).toContain('@page'); // print page rules included
  });
});
