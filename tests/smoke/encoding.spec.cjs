// Encoder/Decoder spec, focused on Base64 decoding via window.EncodingEngine.
//
// Guards the failure modes that a plain decodeURIComponent(escape(atob(...)))
// gets wrong: URL-safe Base64 (- and _, as in JWTs/tokens) used to throw
// "Invalid character", and valid Base64 whose bytes are not UTF-8 used to throw
// "URI malformed" and surface as "Invalid Input". Also covers full-Unicode
// round trips, whitespace/padding tolerance, and a data-URI prefix, plus a DOM
// check that the Decode button wiring works end to end.
const { test, expect } = require('@playwright/test');

const TOOL_PATH = '/tools/encoding.html';

async function openTool(page) {
  await page.goto(TOOL_PATH, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => typeof window.EncodingEngine), { timeout: 10000 })
    .toBe('object');
}

test.describe('Base64 engine', () => {
  test('round-trips ASCII and full Unicode exactly', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const E = window.EncodingEngine;
      const cases = ['Hello, world!', 'café ☕ 😀 — dashes', '世界 / mixed', ''];
      return cases.map(t => E.base64Decode(E.base64Encode(t)) === t);
    });
    expect(r).toEqual([true, true, true, true]);
  });

  test('decodes standard Base64 with and without padding, ignoring whitespace', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const E = window.EncodingEngine;
      return {
        padded: E.base64Decode('SGVsbG8='),
        unpadded: E.base64Decode('SGVsbG8'),
        wrapped: E.base64Decode('SGVsbG8s\nIHdvcmxk\nIQ=='),
      };
    });
    expect(r.padded).toBe('Hello');
    expect(r.unpadded).toBe('Hello');
    expect(r.wrapped).toBe('Hello, world!');
  });

  test('decodes URL-safe Base64 (- and _) instead of throwing', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      const E = window.EncodingEngine;
      // Encode UTF-8 text, convert to base64url (as a JWT/token would carry it),
      // then decode. The old escape/atob path threw "Invalid character" here.
      // This text's standard Base64 (YcO/L8O48J+YgA==) contains both + and /,
      // so its URL-safe form carries both - and _.
      const text = 'aÿ/ø😀';
      const std = E.base64Encode(text);
      const url = std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return { hasDash: url.includes('-'), hasUnderscore: url.includes('_'), decoded: E.base64Decode(url), text };
    });
    expect(r.hasDash).toBe(true);           // token really carries URL-safe chars
    expect(r.hasUnderscore).toBe(true);
    expect(r.decoded).toBe(r.text);         // and it decodes back exactly
  });

  test('strips a data-URI prefix before decoding', async ({ page }) => {
    await openTool(page);
    const out = await page.evaluate(() =>
      window.EncodingEngine.base64Decode('data:text/plain;base64,SGkgdGhlcmU='));
    expect(out).toBe('Hi there');
  });

  test('valid Base64 of non-UTF-8 bytes degrades gracefully, does not throw', async ({ page }) => {
    await openTool(page);
    const r = await page.evaluate(() => {
      try {
        // "/w==" is valid Base64 for the single byte 0xFF (not valid UTF-8).
        const out = window.EncodingEngine.base64Decode('/w==');
        return { threw: false, hasReplacement: out.includes('�') };
      } catch (e) {
        return { threw: true, message: e.message };
      }
    });
    expect(r.threw).toBe(false);            // used to throw "URI malformed"
    expect(r.hasReplacement).toBe(true);    // U+FFFD substitution instead
  });

  test('genuinely invalid Base64 still raises an error', async ({ page }) => {
    await openTool(page);
    const threw = await page.evaluate(() => {
      try { window.EncodingEngine.base64Decode('@@@ not base64 @@@'); return false; }
      catch (e) { return true; }
    });
    expect(threw).toBe(true);
  });
});

test.describe('Base64 DOM decode', () => {
  test('the Decode button turns a URL-safe token in the output box into plaintext', async ({ page }) => {
    await openTool(page);
    // Build a URL-safe token for known Unicode text, place it in the output
    // (encoded) box, and click Decode -> plaintext lands in the input box.
    const text = 'Café ☕ 😀';
    const token = await page.evaluate((t) => {
      const std = window.EncodingEngine.base64Encode(t);
      return std.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }, text);

    await page.fill('#outputArea', token);
    await page.getByRole('button', { name: /decode/i }).click();

    await expect(page.locator('#inputArea')).toHaveValue(text);
    await expect(page.locator('#statusBadge')).toBeHidden();
  });

  test('a bad token surfaces the inline error badge', async ({ page }) => {
    await openTool(page);
    await page.fill('#outputArea', '@@@@ not valid @@@@');
    await page.getByRole('button', { name: /decode/i }).click();
    await expect(page.locator('#statusBadge')).toBeVisible();
    await expect(page.locator('#statusBadge')).toContainText('Invalid Input');
  });
});
