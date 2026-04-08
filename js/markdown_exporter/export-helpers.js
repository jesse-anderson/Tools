import {
    buildDocumentStyleText,
    buildPrintPageStyleText
} from "./document-styles.js";

export async function buildPreparedExport({
    previewDoc,
    fallbackHtml,
    title,
    filename,
    pageSize,
    orientation,
    marginIn
}) {
    const { exportRoot, imageReport } = await buildExportRoot(previewDoc, fallbackHtml);
    const warnings = dedupeWarnings(getImageWarningMessages(imageReport));

    return {
        title,
        filename,
        pageSize,
        orientation,
        marginIn,
        exportRoot,
        imageReport,
        warnings
    };
}

export function buildExportDocumentHtml(prepared, baseHref) {
    const title = escapeHtml(prepared.title);
    const safeBaseHref = escapeHtml(baseHref);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<base href="${safeBaseHref}">
<style>${buildDocumentStyleText(".md-export-root", true)}</style>
<style>${buildPrintPageStyleText(prepared)}</style>
</head>
<body>
${prepared.exportRoot.outerHTML}
</body>
</html>`;
}

export function normalizeExportFilename(raw) {
    return String(raw || "")
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^[.-]+|[.-]+$/g, "")
        .slice(0, 120) || "markdown-export";
}

export function extractTitle(content) {
    const match = String(content || "").match(/^\s*#\s+(.+)$/m);
    return match ? match[1].trim() : "";
}

export function stripExtension(filename) {
    return String(filename || "").replace(/\.[^.]+$/, "");
}

export function clampNumber(raw, min, max, fallback) {
    const value = Number(raw);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

export function getPaperDimensions(pageSize, orientation) {
    const paperSize = pageSize === "a4"
        ? { widthIn: 8.27, heightIn: 11.69 }
        : { widthIn: 8.5, heightIn: 11 };
    if (orientation === "landscape") {
        return { widthIn: paperSize.heightIn, heightIn: paperSize.widthIn };
    }
    return paperSize;
}

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function dedupeWarnings(warnings) {
    return Array.from(new Set((warnings || []).filter(Boolean)));
}

async function buildExportRoot(previewDoc, fallbackHtml) {
    const exportRoot = document.createElement("article");
    exportRoot.className = "md-export-root";
    exportRoot.innerHTML = previewDoc ? previewDoc.innerHTML : fallbackHtml;
    const imageReport = await inlineImagesInContainer(exportRoot);
    return { exportRoot, imageReport };
}

function getImageWarningMessages(report) {
    if (!report || !report.failed.length) {
        return [];
    }
    const count = report.failed.length;
    return [
        `${count} image${count === 1 ? "" : "s"} could not be embedded directly. Browser print may still show them, but direct PDF or DOCX export can omit them.`
    ];
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

async function inlineImagesInContainer(container) {
    const images = Array.from(container.querySelectorAll("img"));
    const report = {
        total: images.length,
        attempted: 0,
        embedded: 0,
        failed: []
    };

    await Promise.all(images.map(async (image) => {
        const src = image.getAttribute("src") || image.currentSrc || "";
        if (!src || src.startsWith("data:")) return;
        report.attempted += 1;
        try {
            const dataUrl = await imageSourceToDataUrl(src);
            if (dataUrl) {
                image.setAttribute("src", dataUrl);
                report.embedded += 1;
                return;
            }
            report.failed.push({ src, reason: "No data URL was returned." });
        } catch (error) {
            report.failed.push({ src, reason: error.message || "Image could not be embedded." });
        }
    }));

    return report;
}

async function imageSourceToDataUrl(src) {
    if (src.startsWith("blob:")) {
        const blobResponse = await fetch(src);
        const blob = await blobResponse.blob();
        return blobToDataUrl(blob);
    }

    const response = await fetch(src, { mode: "cors" });
    if (!response.ok) {
        throw new Error(`Image fetch failed: ${response.status}`);
    }
    const blob = await response.blob();
    return blobToDataUrl(blob);
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
        reader.onerror = () => reject(reader.error || new Error("Could not read blob."));
        reader.readAsDataURL(blob);
    });
}
