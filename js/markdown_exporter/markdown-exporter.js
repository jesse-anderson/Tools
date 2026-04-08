import { marked } from "../vendor/markdown_preview/marked.esm.min.js";
import { applyPreviewDocumentStyles } from "./document-styles.js";
import { buildDocxBlob } from "./docx-export.js";
import { buildPdfDefinition } from "./pdf-export.js";
import { ensureLibrary, PDFMAKE_FONTS } from "./library-loader.js";
import {
    buildPreparedExport,
    buildExportDocumentHtml,
    clampNumber,
    dedupeWarnings,
    downloadBlob,
    extractTitle,
    getPaperDimensions,
    normalizeExportFilename,
    stripExtension
} from "./export-helpers.js";

const SAMPLE_MARKDOWN = `# Markdown Exporter Sample

This sample covers the main Markdown features the tool is designed to render and export well.

## Text Formatting

Use **bold**, *italic*, ***bold italic***, ~~strikethrough~~, and \`inline code\` for emphasis.

You can also add [links to external references](https://www.markdownguide.org/) inside ordinary paragraphs.

---

## Lists

- Unordered items
- Nested bullets
  - Child item one
  - Child item two with **inline formatting**
- Task-style items
  - [x] Draft written
  - [ ] Review pending

1. Ordered items
2. Another ordered item
   1. Nested ordered item
   2. Nested ordered item with \`code\`
3. Final ordered item

- A list item with a full paragraph after the bullet marker.

  This second paragraph is useful for testing DOCX export structure.

- A list item with a code block:

  \`\`\`bash
  npm run build
  npm run export
  \`\`\`

## Blockquotes

> Simple quoted text works as expected.
>
> This second paragraph stays inside the same quote block.
>
> - Quoted bullet one
> - Quoted bullet two

## Tables

| Metric | Value | Notes |
| --- | ---: | --- |
| Protein | 42 | Daily target |
| Carbs | 18 | Includes **fiber** |
| Fat | 7 | Adjust as needed |

## Code Blocks

\`\`\`javascript
function exportMarkdown(filename) {
  return \`\${filename}.pdf\`;
}
\`\`\`

\`\`\`python
def normalize_filename(value: str) -> str:
    return value.strip().replace(" ", "-").lower()
\`\`\`

\`\`\`json
{
  "title": "Markdown Exporter",
  "formats": ["pdf", "docx"],
  "structuredDocx": true
}
\`\`\`

## Mixed Content

This paragraph includes a line break  
to confirm line-break behavior in preview and export.

### Final Notes

If the preview looks right, the export should be close. For the cleanest PDF, use **Export PDF**. Use **Download PDF** when you want a direct downloadable file.
`;

const state = {
    lastHtml: "",
    renderTimeMs: 0
};

const dom = {
    fileInput: document.getElementById("fileInput"),
    loadSampleBtn: document.getElementById("loadSampleBtn"),
    clearBtn: document.getElementById("clearBtn"),
    filenameInput: document.getElementById("filenameInput"),
    pageSizeSelect: document.getElementById("pageSizeSelect"),
    orientationSelect: document.getElementById("orientationSelect"),
    marginInput: document.getElementById("marginInput"),
    exportPdfBtn: document.getElementById("exportPdfBtn"),
    printPdfBtn: document.getElementById("printPdfBtn"),
    exportDocxBtn: document.getElementById("exportDocxBtn"),
    statusLine: document.getElementById("statusLine"),
    editor: document.getElementById("editor"),
    preview: document.getElementById("preview"),
    editorMeta: document.getElementById("editorMeta"),
    renderMeta: document.getElementById("renderMeta"),
    statChars: document.getElementById("statChars"),
    statWords: document.getElementById("statWords"),
    statLines: document.getElementById("statLines"),
    statTitle: document.getElementById("statTitle")
};

marked.setOptions({
    gfm: true,
    breaks: false,
    headerIds: false,
    mangle: false
});

document.addEventListener("DOMContentLoaded", () => {
    applyPreviewDocumentStyles();
    bindEvents();
    updatePreviewPaperLayout();
    renderMarkdown();
});

function bindEvents() {
    dom.editor.addEventListener("input", renderMarkdown);
    dom.fileInput.addEventListener("change", handleFileSelect);
    dom.loadSampleBtn.addEventListener("click", () => {
        dom.editor.value = SAMPLE_MARKDOWN;
        if (!dom.filenameInput.value.trim()) {
            dom.filenameInput.value = "markdown-export";
        }
        renderMarkdown();
        setStatus("Sample Markdown loaded.");
    });
    dom.clearBtn.addEventListener("click", () => {
        dom.editor.value = "";
        renderMarkdown();
        setStatus("Editor cleared.");
    });
    [dom.pageSizeSelect, dom.orientationSelect].forEach((control) => {
        control.addEventListener("change", updatePreviewPaperLayout);
    });
    dom.marginInput.addEventListener("input", updatePreviewPaperLayout);
    dom.exportPdfBtn.addEventListener("click", exportPdf);
    dom.printPdfBtn.addEventListener("click", downloadPdf);
    dom.exportDocxBtn.addEventListener("click", exportDocx);
}

async function handleFileSelect(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
        const content = await file.text();
        dom.editor.value = content;
        dom.filenameInput.value = stripExtension(file.name) || "markdown-export";
        renderMarkdown();
        setStatus(`Loaded ${file.name}.`);
    } catch (error) {
        setStatus(`Could not read ${file.name}.`, "error");
    } finally {
        dom.fileInput.value = "";
    }
}

function renderMarkdown() {
    const source = dom.editor.value;
    const startedAt = performance.now();

    if (!source.trim()) {
        state.lastHtml = "";
        state.renderTimeMs = 0;
        dom.preview.innerHTML = `
            <div class="preview-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
                <p>Rendered Markdown will appear here.</p>
            </div>
        `;
        updateStats(source);
        return;
    }

    try {
        const renderedHtml = marked.parse(source);
        if (!window.DOMPurify || typeof window.DOMPurify.sanitize !== "function") {
            throw new Error("DOMPurify is unavailable.");
        }

        state.lastHtml = window.DOMPurify.sanitize(renderedHtml, {
            USE_PROFILES: { html: true }
        });
        state.renderTimeMs = Math.max(0, performance.now() - startedAt);
        dom.preview.innerHTML = `<div class="preview-sheet"><article class="preview-doc">${state.lastHtml}</article></div>`;
        dom.preview.querySelectorAll("a").forEach((anchor) => {
            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
        });
        highlightPreview();
        updateStats(source);
        dom.renderMeta.textContent = `Rendered in ${state.renderTimeMs.toFixed(1)} ms`;
        if (dom.statusLine.classList.contains("error")) {
            setStatus("Ready.");
        }
    } catch (error) {
        state.lastHtml = "";
        state.renderTimeMs = 0;
        dom.preview.innerHTML = `<div class="preview-empty"><p>Markdown could not be rendered: ${escapeHtml(error.message)}</p></div>`;
        dom.renderMeta.textContent = "Render failed";
        updateStats(source);
        setStatus(`Render error: ${error.message}`, "error");
    }
}

function updateStats(content) {
    const chars = content.length;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const lines = content ? content.split(/\r?\n/).length : 0;
    const title = extractTitle(content);

    dom.editorMeta.textContent = `${chars.toLocaleString()} chars`;
    dom.statChars.textContent = chars.toLocaleString();
    dom.statWords.textContent = words.toLocaleString();
    dom.statLines.textContent = lines.toLocaleString();
    dom.statTitle.textContent = title || "Untitled";
    if (!content.trim()) {
        dom.renderMeta.textContent = "Rendered in 0 ms";
    }
}

async function exportPdf() {
    if (!ensureContentReady()) return;
    const filename = `${normalizeFilename()}.pdf`;

    setBusy(dom.exportPdfBtn, true, "Opening PDF...");
    setStatus("Preparing print-quality PDF layout...");
    try {
        const prepared = await prepareCurrentExport();
        const html = buildExportDocumentHtml(prepared, document.baseURI || window.location.href);
        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            throw new Error("Popup blocked. Allow popups for this page and try again.");
        }

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();

        const triggerPrint = () => {
            try {
                printWindow.focus();
                printWindow.print();
            } catch (error) {
                console.warn("Markdown Exporter print trigger failed", error);
            }
        };

        if (printWindow.document.readyState === "complete") {
            setTimeout(triggerPrint, 250);
        } else {
            printWindow.addEventListener("load", () => setTimeout(triggerPrint, 250), { once: true });
        }

        setOutcomeStatus(
            `Print dialog opened for ${filename}. Use Save as PDF in the browser dialog.`,
            prepared.warnings
        );
    } catch (error) {
        setStatus(`PDF export failed: ${error.message}`, "error");
    } finally {
        setBusy(dom.exportPdfBtn, false, "Export PDF");
    }
}

async function downloadPdf() {
    if (!ensureContentReady()) return;
    setBusy(dom.printPdfBtn, true, "Building PDF...");
    setStatus("Generating direct-download PDF...");
    try {
        const pdfMake = await ensureLibrary("pdfMake");
        if (!pdfMake || typeof pdfMake.createPdf !== "function") {
            throw new Error("pdfmake loaded without a usable createPdf() API.");
        }
        const prepared = await prepareCurrentExport();
        const definition = buildPdfDefinition(prepared.exportRoot, prepared);
        await new Promise((resolve, reject) => {
            try {
                pdfMake.createPdf(definition, null, PDFMAKE_FONTS).download(`${prepared.filename}.pdf`, () => resolve());
            } catch (error) {
                reject(error);
            }
        });

        setOutcomeStatus(`Saved ${prepared.filename}.pdf.`, prepared.warnings);
    } catch (error) {
        setStatus(`Download PDF failed: ${error.message}`, "error");
    } finally {
        setBusy(dom.printPdfBtn, false, "Download PDF");
    }
}

async function exportDocx() {
    if (!ensureContentReady()) return;
    const filename = `${normalizeFilename()}.docx`;

    setBusy(dom.exportDocxBtn, true, "Exporting DOCX...");
    setStatus("Generating DOCX...");

    try {
        const prepared = await prepareCurrentExport();
        const warnings = [...prepared.warnings];
        const docxOptions = {
            filename: prepared.filename,
            title: prepared.title,
            pageSize: prepared.pageSize,
            orientation: prepared.orientation,
            marginIn: prepared.marginIn
        };

        let blob = null;
        let structuredDocxLoadError = null;
        let docxLib = null;
        try {
            docxLib = await ensureLibrary("docx");
        } catch (error) {
            structuredDocxLoadError = error;
            warnings.push(`Structured DOCX library unavailable: ${error.message}`);
        }

        if (docxLib && typeof docxLib.Document === "function" && docxLib.Packer) {
            try {
                const docxResult = await buildDocxBlob(docxLib, prepared.exportRoot, docxOptions);
                blob = docxResult.blob;
                warnings.push(...(docxResult.warnings || []));
            } catch (error) {
                warnings.push(`Structured DOCX export fell back to Word altchunk mode: ${error.message}`);
            }
        }

        if (!blob) {
            let htmlDocx = null;
            try {
                htmlDocx = await ensureLibrary("htmlDocx");
            } catch (error) {
                if (structuredDocxLoadError) {
                    throw new Error(`Structured DOCX failed (${structuredDocxLoadError.message}) and fallback DOCX failed (${error.message}).`);
                }
                throw error;
            }
            if (!htmlDocx || typeof htmlDocx.asBlob !== "function") {
                throw new Error("Neither the structured DOCX exporter nor the fallback DOCX library could be loaded.");
            }

            const marginTwips = Math.round(prepared.marginIn * 1440);
            blob = htmlDocx.asBlob(buildExportDocumentHtml(prepared, document.baseURI || window.location.href), {
                orientation: prepared.orientation,
                margins: {
                    top: marginTwips,
                    right: marginTwips,
                    bottom: marginTwips,
                    left: marginTwips
                }
            });
            warnings.push("Fallback DOCX mode is best opened in Microsoft Word.");
        }

        downloadBlob(blob, filename);
        setOutcomeStatus(`Saved ${filename}.`, warnings);
    } catch (error) {
        setStatus(`DOCX export failed: ${error.message}`, "error");
    } finally {
        setBusy(dom.exportDocxBtn, false, "Export DOCX");
    }
}

function ensureContentReady() {
    if (state.lastHtml.trim()) return true;
    setStatus("Write or load some Markdown before exporting.", "error");
    return false;
}

async function prepareCurrentExport() {
    const title = extractTitle(dom.editor.value) || normalizeFilename();
    const filename = normalizeFilename();
    const pageSize = dom.pageSizeSelect.value === "a4" ? "a4" : "letter";
    const orientation = dom.orientationSelect.value === "landscape" ? "landscape" : "portrait";
    const marginIn = clampNumber(dom.marginInput.value, 0.25, 2, 0.5);
    return buildPreparedExport({
        previewDoc: dom.preview.querySelector(".preview-doc"),
        fallbackHtml: state.lastHtml,
        title,
        filename,
        pageSize,
        orientation,
        marginIn
    });
}

function updatePreviewPaperLayout() {
    const paperSize = getPaperDimensions(
        dom.pageSizeSelect.value === "a4" ? "a4" : "letter",
        dom.orientationSelect.value === "landscape" ? "landscape" : "portrait"
    );
    const margin = clampNumber(dom.marginInput.value, 0.25, 2, 0.5);
    dom.preview.style.setProperty("--page-width-px", `${paperSize.widthIn * 96}px`);
    dom.preview.style.setProperty("--page-padding-px", `${margin * 96}px`);
}

function normalizeFilename() {
    const raw = dom.filenameInput.value.trim() || extractTitle(dom.editor.value) || "markdown-export";
    return normalizeExportFilename(raw);
}

function setBusy(button, isBusy, label) {
    button.disabled = isBusy;
    button.textContent = label;
}

function setStatus(message, type = "") {
    dom.statusLine.textContent = message;
    dom.statusLine.className = "status-line";
    if (type) {
        dom.statusLine.classList.add(type);
    }
}

function setOutcomeStatus(successMessage, warnings) {
    const dedupedWarnings = dedupeWarnings(warnings);
    if (!dedupedWarnings.length) {
        setStatus(successMessage, "success");
        return;
    }

    setStatus(`${successMessage} ${dedupedWarnings.join(" ")}`, "warning");
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function highlightPreview() {
    const previewDoc = dom.preview.querySelector(".preview-doc");
    if (!previewDoc || !window.Prism || typeof window.Prism.highlightElement !== "function") return;
    previewDoc.querySelectorAll("pre code").forEach((codeElement) => {
        try {
            window.Prism.highlightElement(codeElement);
        } catch (error) {
            console.warn("Markdown Exporter syntax highlighting failed", error);
        }
    });
}
