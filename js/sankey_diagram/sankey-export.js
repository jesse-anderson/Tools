// SVG and PNG export for the Sankey diagram builder.

// Chromium refuses a canvas past roughly 16384 px a side or 268 MP in area.
// The area cap here is far lower, because a 4x export is already 8 MP.
export const PNG_LIMITS = Object.freeze({ maxSide: 16384, maxArea: 64e6 });

export const PNG_SCALES = Object.freeze([
    { id: 'low', scale: 1, label: 'Low (1x)' },
    { id: 'standard', scale: 2, label: 'Standard (2x)' },
    { id: 'high', scale: 4, label: 'High (4x)' },
    { id: 'print', scale: 8, label: 'Print (8x)' }
]);

/** Pixel size of a PNG at a scale, and whether a browser canvas can hold it. */
export function pngSize(width, height, scale) {
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const ok = w <= PNG_LIMITS.maxSide && h <= PNG_LIMITS.maxSide && w * h <= PNG_LIMITS.maxArea;
    return { width: w, height: h, ok };
}

export function serializeSvg(svg) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svg)}`;
}

/**
 * Rasterize a serialized SVG. The image is loaded from a data: URL, which the
 * page's img-src allows. Web fonts do not load inside an SVG image, so the PNG
 * falls back to the system font named in the font stack.
 */
export function svgToPngBlob(svgText, width, height, scale) {
    const size = pngSize(width, height, scale);
    if (!size.ok) {
        return Promise.reject(new Error(`A ${size.width} x ${size.height} px image is larger than a browser canvas can hold. Pick a lower resolution or a smaller diagram`));
    }
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = size.width;
            canvas.height = size.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, size.width, size.height);
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('The browser could not encode the PNG'));
            }, 'image/png');
        };
        img.onerror = () => reject(new Error('The browser could not rasterize the diagram'));
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
    });
}

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A safe file stem from the diagram title. */
export function fileStem(title) {
    const stem = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return stem || 'sankey-diagram';
}
