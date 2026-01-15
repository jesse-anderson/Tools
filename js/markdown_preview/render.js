// ============================================
// RENDER MODULE - Markdown Parsing & Display
// ============================================

import {
    MODE_LABELS,
    VIRTUAL_SCROLL_THRESHOLD,
    PRISM_LANGUAGE_MAP,
    loadedPrismLanguages,
    embeddedStylesCache,
    SANITIZER_CONFIG
} from './state.js';
import { mapLocalImages } from './images.js';

// DOM element references (set by init())
let preview = null;
let renderTimeDisplay = null;

// Track if marked is loaded
let markedAvailable = false;

/**
 * Initialize the render module with DOM element references
 * @param {Object} elements - DOM element references
 * @param {HTMLElement} elements.preview - The preview container element
 * @param {HTMLElement} elements.renderTimeDisplay - Element to show render time
 */
export function initRender(elements) {
    preview = elements.preview;
    renderTimeDisplay = elements.renderTimeDisplay;

    // Check if marked is available
    markedAvailable = typeof window.marked !== 'undefined';
}

/**
 * Configure marked.js options based on current mode
 */
function configureMarkedMode(mode) {
    if (!markedAvailable) return;

    const baseOptions = {
        langPrefix: 'language-'  // Required for Prism
    };

    const modeOptions = {
        original: { gfm: false, breaks: false, pedantic: true },
        commonmark: { gfm: false, breaks: false, pedantic: false },
        gfm: { gfm: true, breaks: true, pedantic: false }
    };

    window.marked.setOptions({ ...baseOptions, ...modeOptions[mode] || modeOptions.commonmark });
}

/**
 * Show placeholder when editor is empty
 */
function showEmptyPreview() {
    preview.innerHTML = `
        <div class="preview-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
            <p>Your rendered Markdown will appear here</p>
        </div>
    `;
}

/**
 * Parse markdown to HTML
 */
function parseMarkdown(markdown) {
    if (!markedAvailable) {
        throw new Error("Marked is not available");
    }
    return window.marked.parse(markdown);
}

/**
 * Sanitize HTML using DOMPurify
 */
function sanitizeHtml(html) {
    if (typeof DOMPurify === 'undefined') {
        console.warn('DOMPurify not loaded - skipping sanitization');
        return html;
    }
    return DOMPurify.sanitize(html, SANITIZER_CONFIG);
}

/**
 * Render to preview with virtual scrolling for large documents
 */
function renderToPreview(html, markdownLength) {
    if (markdownLength > VIRTUAL_SCROLL_THRESHOLD) {
        renderWithVirtualScrolling(html);
    } else {
        preview.innerHTML = html;
    }
}

/**
 * Virtual scrolling for large documents
 */
function renderWithVirtualScrolling(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    const sections = [];
    let currentSection = document.createElement('div');
    currentSection.className = 'preview-section';

    Array.from(temp.childNodes).forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && /^H[1-3]$/.test(node.tagName)) {
            if (currentSection.childNodes.length > 0) {
                sections.push(currentSection);
                currentSection = document.createElement('div');
                currentSection.className = 'preview-section';
            }
        }
        currentSection.appendChild(node.cloneNode(true));
    });

    if (currentSection.childNodes.length > 0) {
        sections.push(currentSection);
    }

    preview.innerHTML = '';
    sections.forEach(section => preview.appendChild(section));

    setupVirtualScrollObserver();
}

/**
 * Set up intersection observer for lazy syntax highlighting
 */
function setupVirtualScrollObserver() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const section = entry.target;
                section.querySelectorAll('pre code[class*="language-"]:not(.prism-highlighted)').forEach(block => {
                    highlightCodeBlock(block);
                    block.classList.add('prism-highlighted');
                });
            }
        });
    }, {
        rootMargin: '100px',
        threshold: 0.1
    });

    preview.querySelectorAll('.preview-section').forEach(section => {
        observer.observe(section);
    });
}

/**
 * Apply syntax highlighting to all code blocks
 */
function applySyntaxHighlighting() {
    if (typeof Prism === 'undefined') {
        console.warn('Prism is not loaded - syntax highlighting disabled');
        return;
    }

    const codeBlocks = preview.querySelectorAll('pre code[class*="language-"]');

    const languagesNeeded = new Set();
    codeBlocks.forEach(block => {
        const langClass = Array.from(block.classList).find(c => c.startsWith('language-'));
        if (langClass) {
            const lang = langClass.replace('language-', '');
            const normalizedLang = PRISM_LANGUAGE_MAP[lang] || lang;
            if (!loadedPrismLanguages.has(normalizedLang) && !Prism.languages[normalizedLang]) {
                languagesNeeded.add(normalizedLang);
            }
        }
    });

    if (languagesNeeded.size > 0) {
        loadPrismLanguages([...languagesNeeded]).then(() => {
            highlightAllCodeBlocks();
        });
    } else {
        highlightAllCodeBlocks();
    }

    // Handle code blocks without language class
    preview.querySelectorAll('pre code:not([class*="language-"])').forEach(block => {
        block.classList.add('language-plaintext');
    });
}

/**
 * Load Prism language files dynamically
 */
async function loadPrismLanguages(languages) {
    const basePath = '../js/vendor/markdown_preview/';

    for (const lang of languages) {
        if (loadedPrismLanguages.has(lang) || Prism.languages[lang]) {
            continue;
        }

        try {
            await loadScript(`${basePath}prism-${lang}.min.js`);
            loadedPrismLanguages.add(lang);
        } catch (err) {
            console.warn(`Could not load Prism language: ${lang}`);
            loadedPrismLanguages.add(lang);
        }
    }
}

/**
 * Load a script dynamically
 */
function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * Highlight all code blocks
 */
function highlightAllCodeBlocks() {
    preview.querySelectorAll('pre code[class*="language-"]').forEach(block => {
        highlightCodeBlock(block);
    });
}

/**
 * Highlight a single code block
 */
function highlightCodeBlock(block) {
    if (typeof Prism !== 'undefined') {
        try {
            Prism.highlightElement(block);
        } catch (err) {
            console.warn('Prism highlight error:', err);
        }
    }
}

/**
 * Harden links (add target="_blank" and rel attributes)
 */
function hardenLinks(container) {
    container.querySelectorAll('a').forEach(link => {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
    });
}

/**
 * Harden images (remove invalid sources, enable lazy loading)
 */
function hardenImages(container) {
    container.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || '';
        if (!src.match(/^(https?:|blob:)/i)) {
            img.removeAttribute('src');
            img.alt = '[Invalid image source]';
        } else {
            // Enable lazy loading for valid images
            img.loading = 'lazy';
        }
    });
}

/**
 * Main render function - converts markdown to HTML and displays in preview
 * @param {string} editorValue - The markdown content to render
 * @param {string} currentMode - The parsing mode ('original' | 'commonmark' | 'gfm')
 * @returns {number} Render time in milliseconds
 */
export function renderPreview(editorValue, currentMode) {
    const start = performance.now();

    if (!editorValue.trim()) {
        showEmptyPreview();
        return 0;
    }

    try {
        // Configure marked.js for current mode
        configureMarkedMode(currentMode);

        // Parse markdown to HTML
        const html = parseMarkdown(editorValue);

        // Sanitize and map local images
        const sanitized = sanitizeHtml(html);
        const processedHtml = mapLocalImages(sanitized);

        // Render to preview
        renderToPreview(processedHtml, editorValue.length);

        // Post-render processing
        hardenLinks(preview);
        hardenImages(preview);
        applySyntaxHighlighting();

    } catch (err) {
        console.error('Markdown parsing error:', err);
    }

    const elapsed = performance.now() - start;
    updateRenderStats(elapsed);
    return elapsed;
}

/**
 * Update render time stats
 */
function updateRenderStats(elapsed) {
    const ms = Math.round(elapsed);
    if (renderTimeDisplay) {
        renderTimeDisplay.textContent = `${ms}ms`;
    }
}

/**
 * Get embedded CSS styles for HTML export
 * @param {string} theme - The theme name ('dark' | 'light')
 * @returns {string} CSS styles as a string
 */
export function getEmbeddedStyles(theme) {
    if (embeddedStylesCache.has(theme)) {
        return embeddedStylesCache.get(theme);
    }

    const isDark = theme === 'dark';
    const styles = `
        :root {
            --bg-primary: ${isDark ? '#0a0a0b' : '#f8f9fa'};
            --bg-secondary: ${isDark ? '#111113' : '#ffffff'};
            --text-primary: ${isDark ? '#fafafa' : '#0f172a'};
            --text-secondary: ${isDark ? '#a1a1aa' : '#475569'};
            --border-color: ${isDark ? '#27272a' : '#e2e8f0'};
            --accent-color: ${isDark ? '#06b6d4' : '#0891b2'};
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            line-height: 1.7;
            margin: 0;
            padding: 40px;
        }
        .markdown-body {
            max-width: 800px;
            margin: 0 auto;
        }
        h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; font-weight: 600; }
        h1 { font-size: 2rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
        h2 { font-size: 1.5rem; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
        p { margin: 0 0 1em 0; }
        a { color: var(--accent-color); text-decoration: none; }
        a:hover { text-decoration: underline; }
        code { font-family: monospace; background: var(--bg-secondary); padding: 0.2em 0.4em; border-radius: 4px; }
        pre { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; overflow-x: auto; }
        pre code { background: none; padding: 0; }
        blockquote { margin: 1em 0; padding: 0.5em 1em; border-left: 4px solid var(--accent-color); background: var(--bg-secondary); }
        ul, ol { margin: 1em 0; padding-left: 2em; }
        table { width: 100%; border-collapse: collapse; margin: 1em 0; }
        th, td { border: 1px solid var(--border-color); padding: 8px 12px; text-align: left; }
        th { background: var(--bg-secondary); font-weight: 600; }
        img { max-width: 100%; height: auto; }
        hr { border: none; border-top: 1px solid var(--border-color); margin: 2em 0; }
        @media print {
            body { padding: 0; }
            pre { white-space: pre-wrap; }
        }
    `;

    embeddedStylesCache.set(theme, styles);
    return styles;
}

/**
 * Extract the document title from the preview (first h1 element)
 * @returns {string|null} The title text or null if no h1 found
 */
export function extractTitle() {
    const h1 = preview.querySelector('h1');
    return h1 ? h1.textContent : null;
}

/**
 * Get the current preview HTML content for export
 * @returns {string} The innerHTML of the preview container
 */
export function getPreviewHtml() {
    return preview.innerHTML;
}

/**
 * Check if the preview currently shows the placeholder (empty state)
 * @returns {boolean} True if preview is showing placeholder
 */
export function isPreviewEmpty() {
    return preview.querySelector('.preview-placeholder') !== null;
}
