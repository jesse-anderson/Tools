const DOCUMENT_STYLE_BODY = `
  body {
    margin: 0;
    background: #ffffff;
    color: #111827;
    font: 400 11.5pt/1.72 Cambria, Georgia, "Times New Roman", serif;
  }
`;

export function buildDocumentStyleText(rootSelector, includeBody = false) {
    const bodyStyle = includeBody ? DOCUMENT_STYLE_BODY : "";
    return `${bodyStyle}
${rootSelector} {
  max-width: none;
  margin: 0;
  padding: 0;
  color: #111827;
  font: 400 11.5pt/1.72 Cambria, Georgia, "Times New Roman", serif;
}
${rootSelector} > :first-child { margin-top: 0; }
${rootSelector} > :last-child { margin-bottom: 0; }
${rootSelector} h1,
${rootSelector} h2,
${rootSelector} h3,
${rootSelector} h4,
${rootSelector} h5,
${rootSelector} h6 {
  margin: 1.55em 0 0.5em;
  line-height: 1.18;
  color: #0f172a;
  font-family: "Aptos Display", "Segoe UI", Arial, sans-serif;
  font-weight: 700;
  page-break-after: avoid;
  break-after: avoid;
}
${rootSelector} h1 {
  margin-top: 0;
  margin-bottom: 0.38em;
  padding-bottom: 0.28em;
  border-bottom: 2px solid #dbe3ef;
  font-size: 22pt;
  letter-spacing: -0.03em;
}
${rootSelector} h2 {
  padding-bottom: 0.18em;
  border-bottom: 1px solid #e5e7eb;
  font-size: 17pt;
  letter-spacing: -0.025em;
}
${rootSelector} h3 {
  font-size: 13.5pt;
  color: #1e3a8a;
}
${rootSelector} h4 { font-size: 12pt; }
${rootSelector} h5,
${rootSelector} h6 {
  font-size: 11pt;
  color: #334155;
}
${rootSelector} h1 + p {
  font-size: 12.5pt;
  line-height: 1.68;
  color: #475467;
}
${rootSelector} p,
${rootSelector} ul,
${rootSelector} ol,
${rootSelector} blockquote,
${rootSelector} table,
${rootSelector} pre {
  margin: 0 0 1.12em;
}
${rootSelector} p,
${rootSelector} li {
  orphans: 3;
  widows: 3;
}
${rootSelector} ul,
${rootSelector} ol {
  padding-left: 1.45em;
}
${rootSelector} li {
  margin: 0.28em 0;
}
${rootSelector} blockquote {
  border-left: 4px solid #3b82f6;
  margin-left: 0;
  padding: 0.7em 1em;
  color: #334155;
  background: #f8fafc;
  border-radius: 0 10px 10px 0;
}
${rootSelector} code {
  font: 400 0.88em "JetBrains Mono", Consolas, monospace;
  background: #f1f5f9;
  border-radius: 6px;
  border: 1px solid #dbe3ef;
  padding: 0.12em 0.34em;
}
${rootSelector} pre {
  overflow: auto;
  padding: 1rem 1.15rem;
  border-radius: 14px;
  background: #0b1220;
  border: 1px solid #1e293b;
  color: #e5eefb;
  white-space: pre-wrap;
  word-break: break-word;
  page-break-inside: avoid;
  break-inside: avoid;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
}
${rootSelector} pre code {
  background: transparent;
  border: 0;
  color: inherit;
  padding: 0;
}
${rootSelector} table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 10.5pt;
  border: 1px solid #cbd5e1;
  border-radius: 12px;
  overflow: hidden;
  page-break-inside: avoid;
  break-inside: avoid;
}
${rootSelector} th,
${rootSelector} td {
  border-right: 1px solid #cbd5e1;
  border-bottom: 1px solid #cbd5e1;
  padding: 0.62rem 0.74rem;
  text-align: left;
  vertical-align: top;
}
${rootSelector} tr > *:last-child {
  border-right: 0;
}
${rootSelector} tbody tr:last-child > * {
  border-bottom: 0;
}
${rootSelector} th {
  background: #eef4ff;
  color: #0f172a;
  font-family: "Aptos", "Segoe UI", Arial, sans-serif;
  font-size: 9pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
${rootSelector} tbody tr:nth-child(even) td {
  background: #f8fafc;
}
${rootSelector} img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.2rem auto;
  border: 1px solid #dbe3ef;
  border-radius: 12px;
  page-break-inside: avoid;
  break-inside: avoid;
}
${rootSelector} hr {
  border: 0;
  border-top: 1px solid #cbd5e1;
  margin: 2.2rem auto;
  width: 42%;
}
${rootSelector} a {
  color: #1d4ed8;
  text-decoration-thickness: 1px;
  text-underline-offset: 0.14em;
}
${rootSelector} strong {
  color: #0f172a;
}
${rootSelector} del,
${rootSelector} s {
  color: #64748b;
}
${rootSelector} input[type="checkbox"] {
  transform: scale(1.05);
  margin-right: 0.45em;
  vertical-align: middle;
}
${rootSelector} .token.comment,
${rootSelector} .token.prolog,
${rootSelector} .token.doctype,
${rootSelector} .token.cdata {
  color: #94a3b8;
}
${rootSelector} .token.punctuation {
  color: #cbd5e1;
}
${rootSelector} .token.property,
${rootSelector} .token.tag,
${rootSelector} .token.constant,
${rootSelector} .token.symbol,
${rootSelector} .token.deleted {
  color: #fda4af;
}
${rootSelector} .token.boolean,
${rootSelector} .token.number {
  color: #fdba74;
}
${rootSelector} .token.selector,
${rootSelector} .token.attr-name,
${rootSelector} .token.string,
${rootSelector} .token.char,
${rootSelector} .token.builtin,
${rootSelector} .token.inserted {
  color: #86efac;
}
${rootSelector} .token.operator,
${rootSelector} .token.entity,
${rootSelector} .token.url,
${rootSelector} .language-css .token.string,
${rootSelector} .style .token.string {
  color: #7dd3fc;
}
${rootSelector} .token.atrule,
${rootSelector} .token.attr-value,
${rootSelector} .token.keyword {
  color: #c4b5fd;
}
${rootSelector} .token.function,
${rootSelector} .token.class-name {
  color: #f9a8d4;
}
${rootSelector} .token.regex,
${rootSelector} .token.important,
${rootSelector} .token.variable {
  color: #fcd34d;
}`;
}

export function buildPrintPageStyleText({ pageSize, orientation, marginIn }) {
    const pageSizeName = pageSize === "a4" ? "A4" : "Letter";
    const pageOrientation = orientation === "landscape" ? "landscape" : "portrait";
    const margin = Number.isFinite(marginIn) ? marginIn.toFixed(2) : "0.50";
    return `@page { size: ${pageSizeName} ${pageOrientation}; margin: ${margin}in; }`;
}

export function applyPreviewDocumentStyles() {
    const styleId = "markdown-exporter-preview-styles";
    let styleTag = document.getElementById(styleId);
    if (!styleTag) {
        styleTag = document.createElement("style");
        styleTag.id = styleId;
        document.head.appendChild(styleTag);
    }
    styleTag.textContent = buildDocumentStyleText(".preview-doc");
}
