// Inputs for the OCR Text Extractor specs, all built in the test so the right
// answer is known. Not a spec: required by the ocr-text-extractor-*.spec.cjs files.

const { expect } = require('@playwright/test');

const WIDTH = 1275;
const HEIGHT = 1650;
const FONT = '44px serif';

// Where drawImage puts line i, in pixels of the upright image.
const LINE_X = 90;
const lineBaseline = (i) => 180 + i * 100;

// Black text on white as image bytes. `skewDeg` turns the text about the
// center, as a crooked scan would. `turn` stores the finished image rotated
// counterclockwise by that many degrees, which is what a PDF page with
// /Rotate of the same value needs in order to display upright. `red` lists
// the words to draw in red. `shadow` lays uneven light over the page, and
// `ink` and `paper` set the two colors.
async function drawImage(page, lines, options = {}) {
  const settings = { type: 'image/png', width: 1275, height: 1650, font: '44px serif', skewDeg: 0, turn: 0, red: null, shadow: false, ink: '#000000', paper: '#ffffff', ...options };
  const base64 = await page.evaluate(([rows, o, x0, y0, step]) => {
    const upright = document.createElement('canvas');
    upright.width = o.width;
    upright.height = o.height;
    const g = upright.getContext('2d');
    g.fillStyle = o.paper;
    g.fillRect(0, 0, o.width, o.height);
    g.save();
    g.translate(o.width / 2, o.height / 2);
    g.rotate(o.skewDeg * Math.PI / 180);
    g.translate(-o.width / 2, -o.height / 2);
    g.font = o.font;
    rows.forEach((row, i) => {
      let x = x0;
      for (const word of row.split(' ')) {
        g.fillStyle = o.red && o.red.includes(word) ? '#ff0000' : o.ink;
        g.fillText(word, x, y0 + i * step);
        x += g.measureText(`${word} `).width;
      }
    });
    g.restore();
    if (o.shadow) {
      // Light falling off across the page, and a soft shadow over part of it.
      g.globalCompositeOperation = 'multiply';
      const fall = g.createLinearGradient(0, 0, o.width, o.height);
      fall.addColorStop(0, '#ffffff');
      fall.addColorStop(1, '#4a4a4a');
      g.fillStyle = fall;
      g.fillRect(0, 0, o.width, o.height);
      const blob = g.createRadialGradient(o.width * 0.3, o.height * 0.2, 30, o.width * 0.3, o.height * 0.2, o.width * 0.4);
      blob.addColorStop(0, '#5a5a5a');
      blob.addColorStop(1, '#ffffff');
      g.fillStyle = blob;
      g.fillRect(0, 0, o.width, o.height);
      g.globalCompositeOperation = 'source-over';
    }

    let out = upright;
    if (o.turn) {
      out = document.createElement('canvas');
      const sideways = o.turn === 90 || o.turn === 270;
      out.width = sideways ? o.height : o.width;
      out.height = sideways ? o.width : o.height;
      const t = out.getContext('2d');
      if (o.turn === 90) { t.translate(0, o.width); t.rotate(-Math.PI / 2); }
      if (o.turn === 180) { t.translate(o.width, o.height); t.rotate(Math.PI); }
      if (o.turn === 270) { t.translate(o.height, 0); t.rotate(Math.PI / 2); }
      t.drawImage(upright, 0, 0);
    }
    return out.toDataURL(o.type, 0.92).split(',')[1];
  }, [lines, settings, LINE_X, lineBaseline(0), lineBaseline(1) - lineBaseline(0)]);
  return Buffer.from(base64, 'base64');
}

// A PDF with Letter pages. A page is { text: [lines] } for typed text the file
// holds, or { jpeg, width, height } for a scan, which may also carry
// `rotate` (the page's /Rotate), `origin` ([x, y] of the media box corner) and
// `unbalanced` (the page's drawing leaves its coordinate change in force).
function buildPdf(pages) {
  const objects = [];
  const add = (body) => { objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body)); return objects.length; };
  const stream = (dict, data) => Buffer.concat([
    Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`), data, Buffer.from('\nendstream')
  ]);

  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = [];
  for (const page of pages) {
    if (page.jpeg) {
      const [ox, oy] = page.origin || [0, 0];
      const landscape = page.width > page.height;
      const pw = landscape ? 792 : 612;
      const ph = landscape ? 612 : 792;
      const image = add(stream(
        `/Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
        page.jpeg
      ));
      const draw = `${pw} 0 0 ${ph} ${ox} ${oy} cm /Im0 Do`;
      const content = add(stream('', Buffer.from(page.unbalanced ? draw : `q ${draw} Q`)));
      const rotate = page.rotate ? ` /Rotate ${page.rotate}` : '';
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [${ox} ${oy} ${ox + pw} ${oy + ph}]${rotate} /Resources << /XObject << /Im0 ${image} 0 R >> >> /Contents ${content} 0 R >>`));
    } else {
      const ops = page.text.map((line, i) => `BT /F1 12 Tf 72 ${720 - i * 20} Td (${line}) Tj ET`).join('\n');
      const content = add(stream('', Buffer.from(ops)));
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
    }
  }
  objects[1] = Buffer.from(`<< /Type /Pages /Kids [${kids.map((n) => `${n} 0 R`).join(' ')}] /Count ${kids.length} >>`);

  const chunks = [Buffer.from('%PDF-1.4\n')];
  let offset = chunks[0].length;
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(offset);
    const wrapped = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from('\nendobj\n')]);
    chunks.push(wrapped);
    offset += wrapped.length;
  });
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) xref += `${String(at).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  chunks.push(Buffer.from(xref));
  return Buffer.concat(chunks);
}

// A scanned page for buildPdf. With `rotate`, the image is stored turned so
// that the page displays upright.
async function scannedPage(page, lines, options = {}) {
  const { rotate = 0, origin, unbalanced, ...draw } = options;
  const jpeg = await drawImage(page, lines, { ...draw, type: 'image/jpeg', turn: rotate });
  const sideways = rotate === 90 || rotate === 270;
  return { jpeg, width: sideways ? 1650 : 1275, height: sideways ? 1275 : 1650, rotate, origin, unbalanced };
}

// Reads a PDF back with the page's own vendored pdf.js. Each text item comes
// with where its baseline starts and which way it runs, in the coordinates of
// the page as displayed: x right and y down from the top left, in points.
function readPdf(page, buffer) {
  return page.evaluate(async (base64) => {
    const pdfjs = await import('/js/vendor/ocr_text_extractor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/js/vendor/ocr_text_extractor/pdf.worker.min.mjs';
    const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const p = await doc.getPage(n);
      const viewport = p.getViewport({ scale: 1 });
      const content = await p.getTextContent();
      const ops = await p.getOperatorList();
      pages.push({
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
        images: ops.fnArray.filter((fn) => fn === pdfjs.OPS.paintImageXObject).length,
        text: content.items.map((item) => item.str + (item.hasEOL ? '\n' : '')).join(''),
        items: content.items.filter((item) => item.str.trim()).map((item) => {
          const [a, b, , , e, f] = item.transform;
          const [x, y] = viewport.convertToViewportPoint(e, f);
          const [x2, y2] = viewport.convertToViewportPoint(e + a, f + b);
          const length = Math.hypot(x2 - x, y2 - y) || 1;
          return { str: item.str, x, y, dx: (x2 - x) / length, dy: (y2 - y) / length, width: item.width };
        })
      });
    }
    await doc.destroy();
    return pages;
  }, buffer.toString('base64'));
}

// Where each word of a line starts, in pixels of the upright image.
function wordStarts(page, line) {
  return page.evaluate(([text, font, x0]) => {
    const g = document.createElement('canvas').getContext('2d');
    g.font = font;
    const starts = [];
    let x = x0;
    for (const word of text.split(' ')) {
      starts.push(x);
      x += g.measureText(`${word} `).width;
    }
    return starts;
  }, [line, FONT, LINE_X]);
}

// Every line's first word and its last hidden-text item must start where the
// test drew them. `scale` is points per image pixel on the displayed page.
async function textOnLines(page, read1, LINES, { scale, skewDeg = 0, tolerance = 3 }) {
  const angle = skewDeg * Math.PI / 180;
  const place = (x, y) => {
    const dx = x - WIDTH / 2;
    const dy = y - HEIGHT / 2;
    return [
      (WIDTH / 2 + dx * Math.cos(angle) - dy * Math.sin(angle)) * scale,
      (HEIGHT / 2 + dx * Math.sin(angle) + dy * Math.cos(angle)) * scale
    ];
  };
  for (let i = 0; i < LINES.length; i++) {
    const words = LINES[i].split(' ');
    const starts = await wordStarts(page, LINES[i]);
    // The items of this line, picked out by where the line is.
    const [, lineY] = place(WIDTH / 2, lineBaseline(i));
    const onLine = read1.items.filter((item) => Math.abs(item.y - (lineY + (item.x - WIDTH / 2 * scale) * Math.tan(angle))) < 12);
    expect(onLine.length, `line ${i + 1} has hidden text`).toBeGreaterThan(0);

    for (const item of [onLine[0], onLine[onLine.length - 1]]) {
      const index = words.indexOf(item.str.split(' ')[0]);
      expect(index, `"${item.str}" starts with a word of line ${i + 1}`).toBeGreaterThanOrEqual(0);
      const [x, y] = place(starts[index], lineBaseline(i));
      expect(Math.abs(item.x - x), `"${item.str}" x ${item.x} against ${x}`).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(item.y - y), `"${item.str}" y ${item.y} against ${y}`).toBeLessThanOrEqual(tolerance);
      expect(item.dx).toBeCloseTo(Math.cos(angle), 2);
      expect(item.dy).toBeCloseTo(Math.sin(angle), 2);
    }
    expect(onLine[0].str.split(' ')[0]).toBe(words[0]);
    // The last item is not the first again, so the far end of the line is held too.
    expect(onLine[onLine.length - 1].x).toBeGreaterThan(onLine[0].x + 100 * scale);
  }
}

module.exports = { textOnLines, LINE_X, lineBaseline, drawImage, buildPdf, scannedPage, readPdf };
