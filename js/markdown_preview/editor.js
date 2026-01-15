// ============================================
// EDITOR MODULE - Input, Undo/Redo, Keyboard, Find/Replace
// ============================================

import {
    RENDER_DEBOUNCE,
    AUTOSAVE_DEBOUNCE,
    LARGE_DOC_THRESHOLD,
    MAX_UNDO_STACK,
    SCROLL_SYNC_DEBOUNCE,
    state
} from './state.js';
import { renderPreview } from './render.js';
import { showToast } from './ui.js';

// DOM element references (set by init())
let editor = null;
let preview = null;
let livePreviewToggle = null;
let experimentalToggle = null;
let updatePreviewBtn = null;
let warningBanner = null;
let warningText = null;
let livePreviewLabel = null;
let statLive = null;

// Callbacks for external actions
let callbacks = {
    onUpdateStats: null,
    onAutosave: null,
    onDisableLivePreview: null,
    onHideWarning: null,
    onShowWarning: null,
    onInsertFormatting: null,
    onCloseDropdowns: null
};

// Debounce timers
let renderTimer = null;
let autosaveTimer = null;
let scrollSyncTimer = null;
let isComposing = false; // Track IME composition state

// Find/Replace state
let findMatches = [];
let currentMatchIndex = -1;

/**
 * Initialize the editor module with DOM elements and callbacks
 * @param {Object} elements - DOM element references
 * @param {HTMLElement} elements.editor - The editor textarea
 * @param {HTMLElement} elements.preview - The preview container
 * @param {HTMLInputElement} elements.livePreviewToggle - Live preview checkbox
 * @param {HTMLInputElement} elements.experimentalToggle - Experimental mode checkbox
 * @param {HTMLElement} elements.updatePreviewBtn - Manual update button
 * @param {HTMLElement} elements.warningBanner - Warning banner element
 * @param {HTMLElement} elements.warningText - Warning text element
 * @param {HTMLElement} elements.livePreviewLabel - Live preview label
 * @param {HTMLElement} elements.statLive - Live preview stat display
 * @param {Object} externalCallbacks - Callback functions for editor actions
 * @param {Function} externalCallbacks.onUpdateStats - Called to update document stats
 * @param {Function} externalCallbacks.onAutosave - Called to trigger autosave
 * @param {Function} externalCallbacks.onDisableLivePreview - Called to disable live preview
 * @param {Function} externalCallbacks.onHideWarning - Called to hide warning banner
 * @param {Function} externalCallbacks.onShowWarning - Called to show warning message
 * @param {Function} externalCallbacks.onCloseDropdowns - Called to close dropdowns
 */
export function initEditor(elements, externalCallbacks) {
    editor = elements.editor;
    preview = elements.preview;
    livePreviewToggle = elements.livePreviewToggle;
    experimentalToggle = elements.experimentalToggle;
    updatePreviewBtn = elements.updatePreviewBtn;
    warningBanner = elements.warningBanner;
    warningText = elements.warningText;
    livePreviewLabel = elements.livePreviewLabel;
    statLive = elements.statLive;

    callbacks = externalCallbacks;

    setupScrollSync();
    setupCompositionHandlers();
}

/**
 * Set up IME composition event handlers
 * Tracks composition state for languages with input method editors (Chinese, Japanese, etc.)
 */
function setupCompositionHandlers() {
    // Save snapshot when composition starts (before IME input)
    editor.addEventListener('compositionstart', () => {
        isComposing = true;
        _saveSnapshotInternal();
    });

    // Save snapshot when composition ends (after IME input committed)
    editor.addEventListener('compositionend', () => {
        isComposing = false;
        // Snapshot will be saved on next input event
        // The compositionend is followed by an insertText input event
    });
}

// ============================================
// UNDO/REDO SYSTEM
// ============================================

const undoStack = [];
const redoStack = [];
let lastSnapshot = '';
let lastSnapshotLength = 0;
let snapshotDebounceTimer = null;

/**
 * Input types that actually modify content (require snapshot)
 * @see https://w3c.github.io/input-events/#interface-InputEvent-Attributes
 */
const CONTENT_CHANGING_INPUT_TYPES = new Set([
    // Text insertion
    'insertText',
    'insertLineBreak',
    'insertParagraph',
    'insertOrderedList',
    'insertUnorderedList',
    // Deletion
    'deleteContent',
    'deleteComposedCharacter',
    'deleteWord',
    'deleteLine',
    'deleteHardLineBackward',
    'deleteSoftLineBackward',
    'deleteContentBackward',
    'deleteContentForward',
    // Paste/drop
    'insertFromPaste',
    'insertFromDrop',
    'insertFromYank',
    // Format changes that affect structure
    'formatBlock',
    'formatIndent',
    'formatOutdent',
    'formatSetBlockTextDirection'
]);

/**
 * Input types that should be skipped (no snapshot needed)
 */
const SKIP_INPUT_TYPES = new Set([
    'historyUndo',
    'historyRedo',
    // IME composition - wait for compositionend
    'insertCompositionText',
    'deleteCompositionText',
    // Cursor-only changes
    'formatTextColor',
    'formatBackColor',
    'formatBold',
    'formatItalic',
    'formatUnderline',
    'formatStrikeThrough',
    'formatSuperscript',
    'formatSubscript'
]);

/**
 * Check if an input event should trigger a snapshot
 * @param {InputEvent} e - The beforeinput event
 * @returns {boolean} True if snapshot should be saved
 */
function shouldSaveSnapshot(e) {
    const inputType = e.inputType;

    // Don't save during IME composition (will save on compositionend)
    if (isComposing) {
        return false;
    }

    // Skip events that don't change content meaningfully
    if (SKIP_INPUT_TYPES.has(inputType)) {
        return false;
    }

    // Skip if no actual data and not a deletion
    if (!e.data && !inputType.includes('delete') && !inputType.includes('insert')) {
        return false;
    }

    // Always save for known content-changing types
    if (CONTENT_CHANGING_INPUT_TYPES.has(inputType)) {
        return true;
    }

    // For unknown types, be conservative and save
    return !inputType.startsWith('format');
}

/**
 * Save a snapshot for undo/redo before editing
 * Optimized to only save for meaningful content changes
 * @param {InputEvent} e - The beforeinput event
 */
export function saveSnapshot(e) {
    // Filter events: only process actual content-changing inputs
    if (e && shouldSaveSnapshot(e)) {
        _saveSnapshotInternal();
    }
}

/**
 * Internal snapshot saving logic (called after filtering)
 */
function _saveSnapshotInternal() {
    const currentContent = editor.value;
    const currentLength = currentContent.length;

    // Only save if content actually changed
    // Also check length as a fast-path optimization
    if (currentLength !== lastSnapshotLength || currentContent !== lastSnapshot) {
        undoStack.push(lastSnapshot);
        if (undoStack.length > MAX_UNDO_STACK) {
            undoStack.shift();
        }
        redoStack.length = 0;
        lastSnapshot = currentContent;
        lastSnapshotLength = currentLength;
    }
}

/**
 * Force save a snapshot (used by explicit operations like insert formatting)
 */
export function forceSnapshot() {
    _saveSnapshotInternal();
}

/**
 * Undo the last edit operation
 */
export function undo() {
    if (undoStack.length === 0) return;

    redoStack.push(editor.value);
    const previousState = undoStack.pop();
    editor.value = previousState;
    lastSnapshot = previousState;

    if (callbacks.onUpdateStats) callbacks.onUpdateStats();
    debouncedRender();
    showToast('Undo', 'success');
    editor.focus();
}

/**
 * Redo the last undone operation
 */
export function redo() {
    if (redoStack.length === 0) return;

    undoStack.push(editor.value);
    const nextState = redoStack.pop();
    editor.value = nextState;
    lastSnapshot = nextState;

    if (callbacks.onUpdateStats) callbacks.onUpdateStats();
    debouncedRender();
    showToast('Redo', 'success');
    editor.focus();
}

// ============================================
// SCROLL SYNC
// ============================================

function setupScrollSync() {
    editor.addEventListener('scroll', () => {
        if (preview.getAttribute('data-scrolling') === 'true') return;

        editor.setAttribute('data-scrolling', 'true');
        clearTimeout(scrollSyncTimer);

        const scrollRatio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
        const targetScroll = scrollRatio * (preview.scrollHeight - preview.clientHeight);

        preview.scrollTop = targetScroll;

        scrollSyncTimer = setTimeout(() => {
            editor.removeAttribute('data-scrolling');
        }, SCROLL_SYNC_DEBOUNCE);
    });

    preview.addEventListener('scroll', () => {
        if (editor.getAttribute('data-scrolling') === 'true') return;

        preview.setAttribute('data-scrolling', 'true');
        clearTimeout(scrollSyncTimer);

        const scrollRatio = preview.scrollTop / (preview.scrollHeight - preview.clientHeight || 1);
        const targetScroll = scrollRatio * (editor.scrollHeight - editor.clientHeight);

        editor.scrollTop = targetScroll;

        scrollSyncTimer = setTimeout(() => {
            preview.removeAttribute('data-scrolling');
        }, SCROLL_SYNC_DEBOUNCE);
    });
}

// ============================================
// INPUT HANDLING
// ============================================

/**
 * Handle editor input events with debounced rendering and autosave
 * @param {InputEvent} e - The input event
 * @param {boolean} experimentalMode - Whether experimental mode is enabled
 * @param {boolean} livePreviewEnabled - Whether live preview is enabled
 */
export function onEditorInput(e, experimentalMode, livePreviewEnabled) {
    // Check for large document
    if (e.inputType && e.inputType.startsWith('insert') && e.data && e.data.length < 100) {
        if (editor.value.length > LARGE_DOC_THRESHOLD && !experimentalMode && livePreviewEnabled) {
            if (callbacks.onDisableLivePreview) {
                callbacks.onDisableLivePreview();
            }
            if (callbacks.onShowWarning) {
                callbacks.onShowWarning('Document exceeds 200k characters. Live preview paused. Use manual update or enable Experimental Mode.');
            }
        }
    }

    if (livePreviewEnabled) {
        clearTimeout(renderTimer);
        renderTimer = setTimeout(() => {
            renderPreview(editor.value, state.currentMode);
            if (callbacks.onUpdateStats) callbacks.onUpdateStats();
        }, RENDER_DEBOUNCE);
    }

    // Schedule autosave
    scheduleAutosave();

    if (callbacks.onUpdateStats) callbacks.onUpdateStats();
}

function debouncedRender() {
    clearTimeout(renderTimer);
    renderTimer = setTimeout(() => {
        renderPreview(editor.value, state.currentMode);
    }, RENDER_DEBOUNCE);
}

function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
        if (callbacks.onAutosave) callbacks.onAutosave();
    }, AUTOSAVE_DEBOUNCE);
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

/**
 * Handle global keyboard shortcuts for the editor
 * @param {KeyboardEvent} e - The keyboard event
 */
export function handleKeyboardShortcuts(e) {
    // Tab - Insert tab character
    if (e.key === 'Tab' && document.activeElement === editor) {
        e.preventDefault();
        handleTab(e.shiftKey);
        return;
    }

    // Ctrl+Z - Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (document.activeElement === editor) {
            e.preventDefault();
            undo();
        }
        return;
    }

    // Ctrl+Y / Ctrl+Shift+Z - Redo
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        if (document.activeElement === editor) {
            e.preventDefault();
            redo();
        }
        return;
    }

    // Ctrl+B - Bold
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        if (document.activeElement === editor) {
            e.preventDefault();
            insertFormatting('bold');
        }
        return;
    }

    // Ctrl+I - Italic
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        if (document.activeElement === editor) {
            e.preventDefault();
            insertFormatting('italic');
        }
        return;
    }

    // Ctrl+K - Link
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (document.activeElement === editor) {
            e.preventDefault();
            insertFormatting('link');
        }
        return;
    }

    // Ctrl+Shift+C - Copy Markdown
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        copyMarkdown();
        return;
    }

    // Ctrl+P - Print
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        if (callbacks.onPrint) callbacks.onPrint();
        return;
    }

    // Ctrl+F - Find
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (callbacks.onOpenFindReplace) callbacks.onOpenFindReplace();
        return;
    }

    // Ctrl+H - Replace
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        if (callbacks.onOpenFindReplace) callbacks.onOpenFindReplace();
        setTimeout(() => {
            const replaceInput = document.getElementById('replaceInput');
            if (replaceInput) replaceInput.focus();
        }, 50);
        return;
    }
}

function handleTab(isShift) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;

    forceSnapshot();

    if (isShift) {
        // Shift+Tab: Remove indentation
        const beforeCursor = text.substring(0, start);
        const lineStart = beforeCursor.lastIndexOf('\n') + 1;
        const lineContent = text.substring(lineStart);
        let removeCount = 0;

        if (lineContent.startsWith('\t')) {
            removeCount = 1;
        } else {
            const leadingSpaces = lineContent.match(/^ {1,4}/);
            if (leadingSpaces) {
                removeCount = leadingSpaces[0].length;
            }
        }

        if (removeCount > 0) {
            editor.value = text.substring(0, lineStart) + text.substring(lineStart + removeCount);
            editor.selectionStart = editor.selectionEnd = Math.max(lineStart, start - removeCount);
        }
    } else {
        // Tab: Insert 4 spaces
        const indent = '    ';
        editor.value = text.substring(0, start) + indent + text.substring(end);
        editor.selectionStart = editor.selectionEnd = start + indent.length;
    }

    debouncedRender();
    scheduleAutosave();
    if (callbacks.onUpdateStats) callbacks.onUpdateStats();
}

// ============================================
// INSERT FORMATTING
// ============================================

export function insertFormatting(type) {
    editor.focus();

    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const selectedText = text.substring(start, end);

    forceSnapshot();

    const formats = {
        bold:      { prefix: '**', suffix: '**' },
        italic:    { prefix: '*',  suffix: '*' },
        code:      { prefix: '`',  suffix: '`' },
        codeblock: { prefix: '```\n', suffix: '\n```' },
        link:      { prefix: '[', suffix: '](url)' },
        image:     { prefix: '![', suffix: '](url)' },
        heading:   { prefix: '## ', suffix: '' },
        quote:     { prefix: '> ', suffix: '' },
        task:      { prefix: '- [ ] ', suffix: '' },
        strike:    { prefix: '~~', suffix: '~~' }
    };

    const fmt = formats[type];
    if (!fmt) return;

    let newValue = text;
    let newStart = start;
    let newEnd = end;
    let action = 'applied';

    // Check if already wrapped
    const beforeStart = start - fmt.prefix.length;
    const afterEnd = end + fmt.suffix.length;

    if (beforeStart >= 0 && afterEnd <= text.length && fmt.suffix) {
        const prefixBefore = text.substring(beforeStart, start);
        const suffixAfter = text.substring(end, afterEnd);

        if (prefixBefore === fmt.prefix && suffixAfter === fmt.suffix) {
            newValue = text.substring(0, beforeStart) + selectedText + text.substring(afterEnd);
            newStart = beforeStart;
            newEnd = beforeStart + selectedText.length;
            action = 'removed';
        }
    }

    // Check if selected text contains markers
    if (action === 'applied' && fmt.suffix && selectedText.length >= fmt.prefix.length + fmt.suffix.length) {
        if (selectedText.startsWith(fmt.prefix) && selectedText.endsWith(fmt.suffix)) {
            const unwrapped = selectedText.slice(fmt.prefix.length, -fmt.suffix.length);
            newValue = text.substring(0, start) + unwrapped + text.substring(end);
            newStart = start;
            newEnd = start + unwrapped.length;
            action = 'removed';
        }
    }

    if (action === 'applied') {
        const placeholder = selectedText || 'text';
        const newText = fmt.prefix + placeholder + fmt.suffix;

        newValue = text.substring(0, start) + newText + text.substring(end);

        if (!selectedText) {
            newStart = start + fmt.prefix.length;
            newEnd = start + fmt.prefix.length + placeholder.length;
        } else {
            newStart = start;
            newEnd = start + newText.length;
        }
    }

    editor.value = newValue;
    editor.setSelectionRange(newStart, newEnd);

    showToast(`${action === 'removed' ? 'Removed' : 'Applied'} ${type}`, 'success');

    if (callbacks.onCloseDropdowns) callbacks.onCloseDropdowns();

    debouncedRender();
    scheduleAutosave();
    if (callbacks.onUpdateStats) callbacks.onUpdateStats();
}

// ============================================
// COPY FUNCTIONS
// ============================================

/**
 * Copy the current markdown content to the clipboard
 */
export function copyMarkdown() {
    const text = editor.value;
    if (!text) {
        showToast('Nothing to copy', 'warning');
        return;
    }

    navigator.clipboard.writeText(text).then(() => {
        showToast('Markdown copied to clipboard', 'success');
    }).catch(() => {
        showToast('Copy failed. Please select and copy manually.', 'error');
    });
}

// ============================================
// FIND/REPLACE
// ============================================

/**
 * Set up find/replace functionality with event listeners
 */
export function setupFindReplace() {
    const findInput = document.getElementById('findInput');
    const replaceInput = document.getElementById('replaceInput');

    if (!findInput) return;

    findInput.addEventListener('input', debounce(performFind, 150));
    findInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                findPrevious();
            } else {
                findNext();
            }
        }
    });

    replaceInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            replaceCurrent();
        }
    });

    document.getElementById('findPrevBtn')?.addEventListener('click', findPrevious);
    document.getElementById('findNextBtn')?.addEventListener('click', findNext);
    document.getElementById('replaceBtn')?.addEventListener('click', replaceCurrent);
    document.getElementById('replaceAllBtn')?.addEventListener('click', replaceAll);
    document.getElementById('closeFindBtn')?.addEventListener('click', closeFindReplace);
}

export function openFindReplace() {
    const findBar = document.getElementById('findReplaceBar');
    if (!findBar) return;

    findBar.classList.add('active');

    const findInput = document.getElementById('findInput');

    const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    if (selectedText && selectedText.length < 100 && !selectedText.includes('\n')) {
        findInput.value = selectedText;
    }

    findInput.focus();
    findInput.select();

    if (findInput.value) {
        performFind();
    }
}

function closeFindReplace() {
    const findBar = document.getElementById('findReplaceBar');
    if (findBar) findBar.classList.remove('active');

    findMatches = [];
    currentMatchIndex = -1;
    updateFindInfo();
    editor.focus();
}

function performFind() {
    const findInput = document.getElementById('findInput');
    const searchText = findInput?.value || '';
    findMatches = [];
    currentMatchIndex = -1;

    if (!searchText) {
        updateFindInfo();
        return;
    }

    const content = editor.value;
    const searchLower = searchText.toLowerCase();
    const contentLower = content.toLowerCase();

    let pos = 0;
    while ((pos = contentLower.indexOf(searchLower, pos)) !== -1) {
        findMatches.push({
            start: pos,
            end: pos + searchText.length
        });
        pos += 1;
    }

    if (findMatches.length > 0) {
        const cursorPos = editor.selectionStart;
        currentMatchIndex = findMatches.findIndex(m => m.start >= cursorPos);
        if (currentMatchIndex === -1) currentMatchIndex = 0;
    }

    updateFindInfo();
}

function findNext() {
    if (findMatches.length === 0) {
        performFind();
        if (findMatches.length === 0) return;
    }

    currentMatchIndex = (currentMatchIndex + 1) % findMatches.length;
    highlightCurrentMatch();
    updateFindInfo();
}

function findPrevious() {
    if (findMatches.length === 0) {
        performFind();
        if (findMatches.length === 0) return;
    }

    currentMatchIndex = (currentMatchIndex - 1 + findMatches.length) % findMatches.length;
    highlightCurrentMatch();
    updateFindInfo();
}

function highlightCurrentMatch() {
    if (currentMatchIndex < 0 || currentMatchIndex >= findMatches.length) return;

    const match = findMatches[currentMatchIndex];
    editor.focus();
    editor.setSelectionRange(match.start, match.end);

    const lineHeight = parseInt(getComputedStyle(editor).lineHeight) || 24;
    const linesAbove = editor.value.substring(0, match.start).split('\n').length - 1;
    const scrollTarget = linesAbove * lineHeight - editor.clientHeight / 2;
    editor.scrollTop = Math.max(0, scrollTarget);
}

function replaceCurrent() {
    if (findMatches.length === 0 || currentMatchIndex < 0) return;

    const replaceText = document.getElementById('replaceInput')?.value || '';
    const match = findMatches[currentMatchIndex];

    forceSnapshot();

    const before = editor.value.substring(0, match.start);
    const after = editor.value.substring(match.end);
    editor.value = before + replaceText + after;

    onEditorInput({ inputType: 'insertText', data: '' });
    performFind();
    showToast('Replaced 1 occurrence', 'success');
}

function replaceAll() {
    const searchText = document.getElementById('findInput')?.value || '';
    const replaceText = document.getElementById('replaceInput')?.value || '';

    if (!searchText || findMatches.length === 0) {
        showToast('Nothing to replace', 'warning');
        return;
    }

    forceSnapshot();

    const count = findMatches.length;
    const regex = new RegExp(escapeRegex(searchText), 'gi');
    editor.value = editor.value.replace(regex, replaceText);

    onEditorInput({ inputType: 'insertText', data: '' });

    findMatches = [];
    currentMatchIndex = -1;
    updateFindInfo();

    showToast(`Replaced ${count} occurrence${count !== 1 ? 's' : ''}`, 'success');
}

function updateFindInfo() {
    const info = document.getElementById('findInfo');
    if (!info) return;

    if (findMatches.length === 0) {
        info.textContent = '0 / 0';
    } else {
        info.textContent = `${currentMatchIndex + 1} / ${findMatches.length}`;
    }

    const hasMatches = findMatches.length > 0;
    document.getElementById('findPrevBtn').disabled = !hasMatches;
    document.getElementById('findNextBtn').disabled = !hasMatches;
    document.getElementById('replaceBtn').disabled = !hasMatches;
    document.getElementById('replaceAllBtn').disabled = !hasMatches;
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================
// LIVE PREVIEW TOGGLE
// ============================================

/**
 * Update UI to reflect live preview state
 * @param {boolean} livePreviewEnabled - Whether live preview is enabled
 */
export function updateLivePreviewUI(livePreviewEnabled) {
    livePreviewLabel.textContent = livePreviewEnabled ? 'Live Preview' : 'Live Preview (paused)';
    statLive.textContent = livePreviewEnabled ? 'ON' : 'OFF';
    updatePreviewBtn.style.display = livePreviewEnabled ? 'none' : 'flex';
}

/**
 * Get the current editor content
 * @returns {string} The editor's current value
 */
export function getEditorValue() {
    return editor.value;
}

/**
 * Set the editor content
 * @param {string} value - The new content for the editor
 */
export function setEditorValue(value) {
    editor.value = value;
}

/**
 * Focus the editor textarea
 */
export function focusEditor() {
    editor.focus();
}
