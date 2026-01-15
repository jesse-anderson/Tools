// ============================================
// UI MODULE - Stats, Modals, Toasts, Warnings, Dropdowns
// ============================================

import {
    MODE_LABELS,
    WORDS_PER_MINUTE,
    TOAST_DURATION,
    TOAST_FADE_DURATION,
    CLEAR_MODAL_THRESHOLD,
    STORAGE_KEYS,
    MAX_DRAFT_BYTES,
    MAX_DRAFT_CHARS
} from './state.js';
import { getPreviewHtml, extractTitle, getEmbeddedStyles } from './render.js';
import { MD10_SAMPLE, COMMONMARK_SAMPLE, GFM_SAMPLE } from './samples/index.js';

// DOM element references (set by init())
let statChars = null;
let statWords = null;
let statLines = null;
let statMode = null;
let statRender = null;
let statLive = null;
let statReadTime = null;
let warningBanner = null;
let warningText = null;
let insertDropdown = null;
let statusDot = null;
let statusText = null;
let statusTime = null;

// Download state
let pendingDownloadType = null;

/**
 * Initialize the UI module with DOM element references
 * @param {Object} elements - DOM element references
 */
export function initUI(elements) {
    statChars = elements.statChars;
    statWords = elements.statWords;
    statLines = elements.statLines;
    statMode = elements.statMode;
    statRender = elements.statRender;
    statLive = elements.statLive;
    statReadTime = elements.statReadTime;
    warningBanner = elements.warningBanner;
    warningText = elements.warningText;
    insertDropdown = elements.insertDropdown;
    statusDot = elements.statusDot;
    statusText = elements.statusText;
    statusTime = elements.statusTime;
}

// ============================================
// STATS
// ============================================

/**
 * Update document statistics in the sidebar
 * @param {string} content - The editor content
 * @param {string} currentMode - Current markdown mode
 * @param {boolean} livePreviewEnabled - Whether live preview is enabled
 */
export function updateStats(content, currentMode, livePreviewEnabled) {
    const chars = content.length;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const lines = content ? content.split('\n').length : 0;

    const readingTimeMinutes = Math.ceil(words / WORDS_PER_MINUTE);
    const readingTimeText = readingTimeMinutes === 0 ? '< 1 min'
        : readingTimeMinutes === 1 ? '1 min'
        : `${readingTimeMinutes} min`;

    statChars.textContent = chars.toLocaleString();
    statWords.textContent = words.toLocaleString();
    statLines.textContent = lines.toLocaleString();
    statReadTime.textContent = readingTimeText;
    statLive.textContent = livePreviewEnabled ? 'ON' : 'OFF';
    statMode.textContent = MODE_LABELS[currentMode] || currentMode;
}

// ============================================
// WARNING BANNER
// ============================================

/**
 * Show a warning message in the banner
 * @param {string} message - The warning message to display
 */
export function showWarning(message) {
    warningText.textContent = message;
    warningBanner.classList.remove('hidden');
}

/**
 * Hide the warning banner
 */
export function hideWarning() {
    warningBanner.classList.add('hidden');
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================

/**
 * SVG path data for toast icons (constant, no user input)
 */
const TOAST_ICON_PATHS = {
    success: [
        ['path', 'd', 'M22 11.08V12a10 10 0 1 1-5.93-9.14'],
        ['polyline', 'points', '22 4 12 14.01 9 11.01']
    ],
    error: [
        ['circle', 'cx', '12', 'cy', '12', 'r', '10'],
        ['line', 'x1', '15', 'y1', '9', 'x2', '9', 'y2', '15'],
        ['line', 'x1', '9', 'y1', '9', 'x2', '15', 'y2', '15']
    ],
    warning: [
        ['path', 'd', 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z'],
        ['line', 'x1', '12', 'y1', '9', 'x2', '12', 'y2', '13'],
        ['line', 'x1', '12', 'y1', '17', 'x2', '12.01', 'y2', '17']
    ]
};

/**
 * Create toast icon SVG using DOM methods (no innerHTML)
 * @param {string} type - The toast type
 * @returns {SVGSVGElement} The SVG element
 */
function createToastIcon(type) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');

    const paths = TOAST_ICON_PATHS[type] || TOAST_ICON_PATHS.success;
    for (const [tagName, ...attrs] of paths) {
        const element = document.createElementNS('http://www.w3.org/2000/svg', tagName);
        for (let i = 0; i < attrs.length; i += 2) {
            element.setAttribute(attrs[i], attrs[i + 1]);
        }
        svg.appendChild(element);
    }
    return svg;
}

/**
 * Show a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The toast type ('success' | 'error' | 'warning')
 */
export function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const svg = createToastIcon(type);
    const textNode = document.createTextNode(message);

    toast.appendChild(svg);
    toast.appendChild(textNode);
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), TOAST_FADE_DURATION);
    }, TOAST_DURATION);
}

// ============================================
// DROPDOWN
// ============================================

let dropdownFocusIndex = -1;

/**
 * Toggle the insert formatting dropdown
 */
export function toggleInsertDropdown() {
    const isActive = insertDropdown.classList.toggle('active');
    if (isActive) {
        dropdownFocusIndex = -1;
        setTimeout(() => insertDropdown.focus(), 0);
    }
}

/**
 * Handle keyboard navigation in the dropdown
 * @param {KeyboardEvent} e - The keyboard event
 */
export function handleDropdownKeyboard(e) {
    const items = insertDropdown.querySelectorAll('.dropdown-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        dropdownFocusIndex = Math.min(dropdownFocusIndex + 1, items.length - 1);
        updateDropdownFocus(items);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        dropdownFocusIndex = Math.max(dropdownFocusIndex - 1, 0);
        updateDropdownFocus(items);
    } else if (e.key === 'Enter' && dropdownFocusIndex >= 0) {
        e.preventDefault();
        items[dropdownFocusIndex].click();
    } else if (e.key === 'Escape') {
        insertDropdown.classList.remove('active');
        resetDropdownFocus();
    }
}

function updateDropdownFocus(items) {
    items.forEach((item, i) => {
        item.classList.toggle('focused', i === dropdownFocusIndex);
    });
    if (dropdownFocusIndex >= 0) {
        items[dropdownFocusIndex].scrollIntoView({ block: 'nearest' });
    }
}

function resetDropdownFocus() {
    dropdownFocusIndex = -1;
    insertDropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.classList.remove('focused');
    });
}

/**
 * Close all dropdown menus
 */
export function closeDropdowns() {
    insertDropdown.classList.remove('active');
    resetDropdownFocus();
}

// ============================================
// MODALS
// ============================================

/**
 * Close a modal by ID
 * @param {string} modalId - The ID of the modal to close
 */
export function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('active');
}

/**
 * Close all open modals
 */
export function closeAllModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    insertDropdown.classList.remove('active');
}

/**
 * Show the clear document confirmation modal
 * @param {string} editorValue - The current editor content
 * @param {Function} onConfirm - Callback to execute if confirmed
 */
export function showClearModal(editorValue, onConfirm) {
    if (editorValue.length === 0) {
        showToast('Editor is already empty', 'warning');
        return;
    }

    if (editorValue.length < CLEAR_MODAL_THRESHOLD) {
        onConfirm();
        return;
    }

    document.getElementById('clearCharCount').textContent = editorValue.length.toLocaleString() + ' characters';
    document.getElementById('clearModal').classList.add('active');
}

// ============================================
// DOWNLOAD
// ============================================

/**
 * Show the download modal for MD or HTML export
 * @param {string} type - The export type ('md' | 'html')
 */
export function showDownloadModal(type) {
    pendingDownloadType = type;
    const filenameInput = document.getElementById('filenameInput');
    const filenameExt = document.getElementById('filenameExt');

    if (filenameInput) filenameInput.value = 'markdown';
    if (filenameExt) filenameExt.textContent = '.' + type;

    document.getElementById('downloadModal')?.classList.add('active');
    filenameInput?.focus();
    filenameInput?.select();
}

/**
 * Execute the download operation
 * @param {string} editorValue - The editor content
 * @param {HTMLElement} previewElement - The preview element for HTML export
 */
export function confirmDownload(editorValue, previewElement) {
    let filename = document.getElementById('filenameInput')?.value.trim() || 'markdown';

    filename = sanitizeFilename(filename);

    if (!filename) {
        showToast('Invalid filename', 'error');
        return;
    }

    closeModal('downloadModal');

    if (pendingDownloadType === 'md') {
        downloadMarkdown(filename, editorValue);
    } else if (pendingDownloadType === 'html') {
        downloadHtml(filename, previewElement);
    }
}

function sanitizeFilename(filename) {
    filename = filename.replace(/\.\./g, '');
    filename = filename.replace(/[\/\\]/g, '');
    filename = filename.replace(/[<>:"|?*\x00-\x1f]/g, '');
    filename = filename.replace(/^[\s.]+|[\s.]+$/g, '');

    if (filename.length > 200) {
        filename = filename.substring(0, 200);
    }

    return filename || 'document';
}

function downloadMarkdown(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, `${filename}.md`);
    showToast('Markdown file downloaded', 'success');
}

function downloadHtml(filename, previewElement) {
    const title = extractTitleFromPreview(previewElement) || 'Markdown Preview';
    const content = previewElement.innerHTML;
    const theme = document.documentElement.getAttribute('data-theme') || 'dark';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
${getEmbeddedStyles(theme)}
</style>
</head>
<body>
<article class="markdown-body">
${content}
</article>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    downloadBlob(blob, `${filename}.html`);
    showToast('HTML file downloaded', 'success');
}

function extractTitleFromPreview(previewElement) {
    const h1 = previewElement.querySelector('h1');
    return h1 ? h1.textContent : null;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================
// AUTOSAVE STATUS
// ============================================

/**
 * Update the autosave status indicator
 * @param {string} status - The status ('saved' | 'warning' | 'error')
 * @param {string} message - Optional status message
 */
export function updateAutosaveStatus(status, message = '') {
    if (status === 'saved') {
        statusDot.className = 'status-dot';
        statusText.textContent = 'Saved';
        statusTime.textContent = 'Last: Just now';
    } else if (status === 'warning') {
        statusDot.className = 'status-dot warning';
        statusText.textContent = 'Paused';
        statusTime.textContent = message;
    } else if (status === 'error') {
        statusDot.className = 'status-dot error';
        statusText.textContent = 'Error';
        statusTime.textContent = message;
    }
}

// ============================================
// PRINT
// ============================================

/**
 * Print using the current page as a fallback when popups are blocked
 * @param {string} title - Document title for print
 */
function printCurrentPage(title) {
    // Add print mode class to body for fallback styling
    document.body.classList.add('printing-fallback');

    // Temporarily set document title for print header
    const originalTitle = document.title;
    document.title = title;

    // Trigger browser print dialog
    window.print();

    // Restore original title after a short delay
    setTimeout(() => {
        document.title = originalTitle;
        document.body.classList.remove('printing-fallback');
    }, 1000);
}

/**
 * Open a print window with the preview content
 * Falls back to printing the current page if popups are blocked
 * @param {HTMLElement} previewElement - The preview element to print
 */
export function printPreview(previewElement) {
    const title = extractTitleFromPreview(previewElement) || 'Markdown Preview';
    const content = previewElement.innerHTML;

    const printWindow = window.open('', '_blank');

    if (!printWindow || printWindow.closed || typeof printWindow.closed === 'undefined') {
        // Popup blocked - use fallback
        showToast('Popup blocked. Printing from current page instead...', 'warning');
        printCurrentPage(title);
        return;
    }

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
<title>${escapeHtml(title)}</title>
<style>
${getEmbeddedStyles('light')}
@media print {
    body { margin: 0; padding: 20px; }
    pre { white-space: pre-wrap; word-break: break-word; }
    img { max-width: 100%; page-break-inside: avoid; }
    h1, h2, h3 { page-break-after: avoid; }
}
</style>
</head>
<body>
<article class="markdown-body">
${content}
</article>
<script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`);
    printWindow.document.close();
}

// ============================================
// COPY HTML
// ============================================

/**
 * Copy the preview HTML to clipboard
 * @param {HTMLElement} previewElement - The preview element
 */
export function copyHtml(previewElement) {
    const html = previewElement.innerHTML;
    if (!html || previewElement.querySelector('.preview-placeholder')) {
        showToast('Nothing to copy', 'warning');
        return;
    }

    navigator.clipboard.writeText(html).then(() => {
        showToast('HTML copied to clipboard', 'success');
    }).catch(() => {
        showToast('Copy failed. Please select and copy manually.', 'error');
    });
}

// ============================================
// LOCAL STORAGE HELPERS
// ============================================

/**
 * Clear the saved draft from localStorage
 */
export function clearDraft() {
    localStorage.removeItem(STORAGE_KEYS.DRAFT);
    localStorage.removeItem(STORAGE_KEYS.MISSING_IMAGES);
    updateAutosaveStatus('saved');
    statusTime.textContent = 'No saved draft';
    showToast('Saved draft cleared', 'success');
}

/**
 * Save the current draft to localStorage
 * @param {string} text - The draft content to save
 * @param {string[]} missingImages - Array of missing image names
 */
export function saveDraft(text, missingImages) {
    const bytes = new Blob([text]).size;

    if (bytes > MAX_DRAFT_BYTES || text.length > MAX_DRAFT_CHARS) {
        updateAutosaveStatus('warning', 'Draft too large to autosave (limit: 1MB)');
        return;
    }

    try {
        localStorage.setItem(STORAGE_KEYS.DRAFT, text);
        localStorage.setItem(STORAGE_KEYS.MISSING_IMAGES, JSON.stringify(missingImages));
        updateAutosaveStatus('saved');
    } catch (e) {
        updateAutosaveStatus('error', 'Storage quota exceeded');
    }
}

/**
 * Restore the saved draft from localStorage
 * @returns {Object} Object with content and missingImages properties
 */
export function restoreDraft() {
    try {
        const draft = localStorage.getItem(STORAGE_KEYS.DRAFT);

        if (draft && typeof draft === 'string') {
            if (draft.length > MAX_DRAFT_CHARS * 1.5) {
                console.warn('Draft exceeds maximum size, clearing corrupted data');
                localStorage.removeItem(STORAGE_KEYS.DRAFT);
                return { content: '', missingImages: [] };
            }

            let missingImages = [];
            try {
                const missingImagesRaw = localStorage.getItem(STORAGE_KEYS.MISSING_IMAGES);
                if (missingImagesRaw) {
                    const parsed = JSON.parse(missingImagesRaw);
                    if (Array.isArray(parsed)) {
                        missingImages = parsed.filter(img => typeof img === 'string');
                    }
                }
            } catch (jsonErr) {
                console.warn('Invalid missing images data, clearing:', jsonErr);
                localStorage.removeItem(STORAGE_KEYS.MISSING_IMAGES);
            }

            return { content: draft, missingImages };
        }
    } catch (err) {
        console.error('Error restoring draft:', err);
    }

    return { content: '', missingImages: [] };
}

/**
 * Save user settings to localStorage
 * @param {string} mode - The markdown mode
 * @param {boolean} livePreview - Whether live preview is enabled
 * @param {boolean} experimental - Whether experimental mode is enabled
 * @param {number} splitRatio - The editor/preview split ratio
 */
export function saveSettings(mode, livePreview, experimental, splitRatio) {
    localStorage.setItem(STORAGE_KEYS.MODE, mode);
    localStorage.setItem(STORAGE_KEYS.LIVE_PREVIEW, livePreview.toString());
    localStorage.setItem(STORAGE_KEYS.EXPERIMENTAL, experimental.toString());
    localStorage.setItem(STORAGE_KEYS.SPLIT_RATIO, splitRatio.toString());
}

/**
 * Restore user settings from localStorage
 * @returns {Object} Object with mode, livePreview, experimental, and splitRatio properties
 */
export function restoreSettings() {
    return {
        mode: localStorage.getItem(STORAGE_KEYS.MODE) || 'commonmark',
        livePreview: localStorage.getItem(STORAGE_KEYS.LIVE_PREVIEW) === 'true',
        experimental: localStorage.getItem(STORAGE_KEYS.EXPERIMENTAL) === 'true',
        splitRatio: parseFloat(localStorage.getItem(STORAGE_KEYS.SPLIT_RATIO) || '0.5')
    };
}

// ============================================
// SPLIT RESIZER
// ============================================

/**
 * Set up the split pane resizer functionality
 * @param {Function} onSplitChange - Optional callback when split ratio changes
 */
export function setupSplitResizer(onSplitChange) {
    const resizer = document.getElementById('splitResizer');
    const workspace = document.querySelector('.workspace');
    const editorPane = document.querySelector('.editor-pane');
    const previewPane = document.querySelector('.preview-pane');

    if (!resizer || !workspace) return;

    let isResizing = false;
    let splitRatio = parseFloat(localStorage.getItem(STORAGE_KEYS.SPLIT_RATIO) || '0.5');

    // Validate and apply saved ratio
    if (isNaN(splitRatio) || splitRatio < 0.2 || splitRatio > 0.8) {
        splitRatio = 0.5;
    }
    applySplitRatio();

    resizer.addEventListener('mousedown', startResize);
    resizer.addEventListener('touchstart', startResize, { passive: false });

    // Keyboard support
    resizer.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 0.1 : 0.02;
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            splitRatio = Math.max(0.2, splitRatio - step);
            applySplitRatio();
            saveSplitRatio();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            splitRatio = Math.min(0.8, splitRatio + step);
            applySplitRatio();
            saveSplitRatio();
        }
    });

    function startResize(e) {
        e.preventDefault();
        isResizing = true;
        resizer.classList.add('dragging');
        workspace.classList.add('resizing');

        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);
        document.addEventListener('touchmove', doResize, { passive: false });
        document.addEventListener('touchend', stopResize);
    }

    function doResize(e) {
        if (!isResizing) return;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const workspaceRect = workspace.getBoundingClientRect();
        const newRatio = (clientX - workspaceRect.left) / workspaceRect.width;

        splitRatio = Math.max(0.2, Math.min(0.8, newRatio));
        applySplitRatio();
    }

    function stopResize() {
        isResizing = false;
        resizer.classList.remove('dragging');
        workspace.classList.remove('resizing');

        document.removeEventListener('mousemove', doResize);
        document.removeEventListener('mouseup', stopResize);
        document.removeEventListener('touchmove', doResize);
        document.removeEventListener('touchend', stopResize);

        saveSplitRatio();
    }

    function applySplitRatio() {
        const gapWidth = 16 + 12;
        editorPane.style.flex = `0 0 calc(${splitRatio * 100}% - ${gapWidth / 2}px)`;
        previewPane.style.flex = `0 0 calc(${(1 - splitRatio) * 100}% - ${gapWidth / 2}px)`;
        if (onSplitChange) onSplitChange(splitRatio);
    }

    function saveSplitRatio() {
        localStorage.setItem(STORAGE_KEYS.SPLIT_RATIO, splitRatio.toString());
        if (onSplitChange) onSplitChange(splitRatio);
    }
}

// ============================================
// SAMPLE CONTENT
// ============================================

const SAMPLE_MARKDOWN = {
    commonmark: COMMONMARK_SAMPLE,
    gfm: GFM_SAMPLE,
    original: MD10_SAMPLE
};

/**
 * Load sample markdown content into the editor
 * @param {string} mode - The sample mode to load
 * @param {string} currentMode - The current mode
 * @param {Function} setModeFn - Function to set the mode
 * @param {HTMLElement} editorElement - The editor textarea
 * @param {Function} renderFn - Function to render the preview
 * @param {Function} hideWarningFn - Function to hide warning
 * @param {Function} updateStatsFn - Function to update stats
 * @param {Function} autosaveFn - Function to autosave
 */
export function loadSampleContent(mode, currentMode, setModeFn, editorElement, renderFn, hideWarningFn, updateStatsFn, autosaveFn) {
    const targetMode = (mode && SAMPLE_MARKDOWN[mode]) ? mode : currentMode;

    if (targetMode !== currentMode) {
        setModeFn(targetMode);
    }

    editorElement.value = SAMPLE_MARKDOWN[targetMode] || SAMPLE_MARKDOWN.commonmark;

    hideWarningFn();
    updateStatsFn();
    renderFn();

    autosaveFn();

    const modeLabel = targetMode === 'original' ? 'MD 1.0'
        : targetMode === 'gfm' ? 'GFM'
        : 'CommonMark';

    showToast(`Loaded ${modeLabel} sample`, 'success');
}
