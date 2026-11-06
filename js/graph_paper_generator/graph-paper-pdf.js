// Writes a one-page vector PDF from a scene built by graph-paper-engine.js.
// Pure: returns the file as a string, with no DOM access.
import { clamp, measureText } from './graph-paper-engine.js';

const BEZIER_CIRCLE = 0.552284749831;

export function buildPdf(scene) {
    const alphaMap = buildAlphaStateMap(scene.primitives);
    const content = buildPdfContent(scene, alphaMap);
    const extStates = Array.from(alphaMap.values()).sort((a, b) => a.objectNumber - b.objectNumber);
    const extStateResource = extStates.length > 0
        ? ` /ExtGState << ${extStates.map((entry) => `/${entry.name} ${entry.objectNumber} 0 R`).join(' ')} >>`
        : '';
    // WinAnsiEncoding maps printable ASCII to itself; without it Type1 fonts
    // use StandardEncoding and print ' and ` as curly quotes.
    const objects = [
        '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
        '2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n',
        `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatNumber(scene.page.width)} ${formatNumber(scene.page.height)}] /Resources << /Font << /F1 5 0 R /F2 6 0 R >>${extStateResource} >> /Contents 4 0 R >>\nendobj\n`,
        `4 0 obj\n<< /Length ${byteLength(content)} >>\nstream\n${content}endstream\nendobj\n`,
        '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj\n',
        '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n'
    ];

    extStates.forEach((entry) => {
        objects.push(`${entry.objectNumber} 0 obj\n<< /Type /ExtGState /ca ${entry.alpha.toFixed(3)} /CA ${entry.alpha.toFixed(3)} >>\nendobj\n`);
    });

    const header = '%PDF-1.4\n%1234\n';
    const offsets = [];
    let body = '';
    let runningLength = byteLength(header);

    objects.forEach((objectString) => {
        offsets.push(runningLength);
        body += objectString;
        runningLength += byteLength(objectString);
    });

    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((offset) => {
        xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });

    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${runningLength}\n%%EOF\n`;
    return `${header}${body}${xref}${trailer}`;
}

function buildPdfContent(scene, alphaMap) {
    const commands = ['1 J', '1 j'];
    const pageHeight = scene.page.height;
    const toPdfY = (y) => pageHeight - y;

    scene.primitives.forEach((primitive) => {
        commands.push(`/${alphaMap.get(alphaKey(primitive.opacity)).name} gs`);

        if (primitive.type === 'line') {
            commands.push(`${primitive.width.toFixed(3)} w`);
            commands.push(`${pdfColor(primitive.color)} RG`);
            commands.push(`${formatNumber(primitive.x1)} ${formatNumber(toPdfY(primitive.y1))} m`);
            commands.push(`${formatNumber(primitive.x2)} ${formatNumber(toPdfY(primitive.y2))} l`);
            commands.push('S');
            return;
        }

        if (primitive.type === 'rect') {
            commands.push(`${primitive.strokeWidth.toFixed(3)} w`);
            commands.push(`${pdfColor(primitive.color)} RG`);
            commands.push(`${formatNumber(primitive.x)} ${formatNumber(toPdfY(primitive.y + primitive.height))} ${formatNumber(primitive.width)} ${formatNumber(primitive.height)} re`);
            commands.push('S');
            return;
        }

        if (primitive.type === 'fill') {
            commands.push(`${pdfColor(primitive.color)} rg`);
            commands.push(`${formatNumber(primitive.x)} ${formatNumber(toPdfY(primitive.y + primitive.height))} ${formatNumber(primitive.width)} ${formatNumber(primitive.height)} re`);
            commands.push('f');
            return;
        }

        if (primitive.type === 'text') {
            const width = measureText(primitive.text, primitive.size, primitive.font);
            const shift = primitive.anchor === 'middle' ? width / 2 : primitive.anchor === 'end' ? width : 0;
            commands.push('BT');
            commands.push(`${primitive.font === 'bold' ? '/F2' : '/F1'} ${primitive.size.toFixed(2)} Tf`);
            commands.push(`${pdfColor(primitive.color)} rg`);
            commands.push(`1 0 0 1 ${formatNumber(primitive.x - shift)} ${formatNumber(toPdfY(primitive.y))} Tm`);
            commands.push(`(${escapePdfText(primitive.text)}) Tj`);
            commands.push('ET');
            return;
        }

        commands.push(`${pdfColor(primitive.color)} rg`);
        commands.push(circlePath(primitive.cx, toPdfY(primitive.cy), primitive.radius));
        commands.push('f');
    });

    return `${commands.join('\n')}\n`;
}

function alphaKey(opacity) {
    return clamp(opacity == null ? 1 : opacity, 0.05, 1).toFixed(3);
}

function buildAlphaStateMap(primitives) {
    const map = new Map();
    let nextObjectNumber = 7;
    primitives.forEach((primitive) => {
        const key = alphaKey(primitive.opacity);
        if (!map.has(key)) {
            map.set(key, { alpha: Number.parseFloat(key), name: `GS${map.size + 1}`, objectNumber: nextObjectNumber });
            nextObjectNumber += 1;
        }
    });
    return map;
}

function circlePath(cx, cy, radius) {
    const k = BEZIER_CIRCLE * radius;
    const f = formatNumber;
    return [
        `${f(cx)} ${f(cy + radius)} m`,
        `${f(cx + k)} ${f(cy + radius)} ${f(cx + radius)} ${f(cy + k)} ${f(cx + radius)} ${f(cy)} c`,
        `${f(cx + radius)} ${f(cy - k)} ${f(cx + k)} ${f(cy - radius)} ${f(cx)} ${f(cy - radius)} c`,
        `${f(cx - k)} ${f(cy - radius)} ${f(cx - radius)} ${f(cy - k)} ${f(cx - radius)} ${f(cy)} c`,
        `${f(cx - radius)} ${f(cy + k)} ${f(cx - k)} ${f(cy + radius)} ${f(cx)} ${f(cy + radius)} c`
    ].join('\n');
}

function pdfColor(color) {
    return color.map((channel) => channel.toFixed(3)).join(' ');
}

function formatNumber(value) {
    const rounded = Number.parseFloat(value.toFixed(3));
    return (rounded === 0 ? 0 : rounded).toString();
}

function escapePdfText(text) {
    return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function byteLength(text) {
    return new TextEncoder().encode(text).length;
}
