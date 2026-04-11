/**
 * Visual Integration Tool - File I/O for Image/PDF
 */

export const IO_LIMITS = Object.freeze({
    maxImageBytes: 25 * 1024 * 1024,
    maxPdfBytes: 50 * 1024 * 1024,
    maxImagePixels: 25_000_000,
    maxPdfRenderPixels: 64_000_000,
    maxPdfScale: 16
});

function formatBytes(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} bytes`;
}

function assertFileSize(file, maxBytes, label) {
    if (file.size > maxBytes) {
        throw new Error(`${label} is too large. Limit: ${formatBytes(maxBytes)}.`);
    }
}

function assertPixelCount(width, height, maxPixels, label) {
    const pixels = width * height;
    if (pixels > maxPixels) {
        throw new Error(`${label} is too large to render safely. Limit: ${maxPixels.toLocaleString()} pixels.`);
    }
}

function readImageDimensions(file) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);

        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve({
                width: image.naturalWidth,
                height: image.naturalHeight
            });
        };

        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Image dimensions could not be read.'));
        };

        image.src = url;
    });
}

export const io = {
    async loadImageFile(file) {
        assertFileSize(file, IO_LIMITS.maxImageBytes, 'Image file');
        const dimensions = await readImageDimensions(file);
        assertPixelCount(dimensions.width, dimensions.height, IO_LIMITS.maxImagePixels, 'Image');

        const bitmap = await createImageBitmap(file);
        try {
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            canvas.getContext('2d').drawImage(bitmap, 0, 0);
            return canvas;
        } finally {
            if (bitmap.close) {
                try { bitmap.close(); } catch (error) {}
            }
        }
    },

    async loadPdfJsIfNeeded() {
        if (window.pdfjsLib && window.pdfjsLib.getDocument) return true;

        const tryLoadModule = async (src) => {
            try {
                const module = await import(src);
                if (module && module.getDocument) {
                    window.pdfjsLib = module;
                    return true;
                }
            } catch (error) {}
            return false;
        };

        const tryLoadClassic = (src) => new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });

        let ok = await tryLoadClassic('../vendor/pdfjs/pdf.min.js');
        if (!ok) ok = await tryLoadModule('../vendor/pdfjs/pdf.min.mjs');
        if (!ok) ok = await tryLoadModule('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');

        if (ok && window.pdfjsLib && window.pdfjsLib.getDocument) {
            try {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
            } catch (error) {}
            return true;
        }
        return false;
    },

    async loadPdfDocument(file) {
        assertFileSize(file, IO_LIMITS.maxPdfBytes, 'PDF file');
        const bytes = await file.arrayBuffer();
        return await window.pdfjsLib.getDocument({ data: bytes }).promise;
    },

    async renderPdfPage(doc, pageNum, scale) {
        const safeScale = Math.max(1, Math.min(IO_LIMITS.maxPdfScale, Number(scale) || 4));
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: safeScale });
        const width = Math.max(1, Math.floor(viewport.width));
        const height = Math.max(1, Math.floor(viewport.height));

        assertPixelCount(width, height, IO_LIMITS.maxPdfRenderPixels, 'Rendered PDF page');

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const renderCtx = canvas.getContext('2d');

        await page.render({ canvasContext: renderCtx, viewport }).promise;
        return canvas;
    }
};
