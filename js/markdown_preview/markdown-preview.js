// ============================================
// MARKDOWN PREVIEW - MAIN ORCHESTRATOR
// ============================================
// This file coordinates all modules for the markdown preview tool.
// Individual functionality is split into:
// - state.js - Constants and state management
// - render.js - Markdown parsing and display
// - editor.js - Input handling and editor features
// - images.js - Image upload and session management
// - ui.js - UI components, modals, toasts, stats

import { state, STORAGE_KEYS, MODE_LABELS } from './state.js';
import { initRender, renderPreview } from './render.js';
import {
    initEditor,
    onEditorInput,
    handleKeyboardShortcuts,
    setupFindReplace,
    copyMarkdown,
    insertFormatting,
    updateLivePreviewUI,
    getEditorValue,
    setEditorValue,
    saveSnapshot,
    undo,
    redo
} from './editor.js';
import {
    initImages,
    handleImageUpload,
    handleImageListClick,
    getMissingImageNames
} from './images.js';
import {
    initUI,
    updateStats,
    showWarning,
    hideWarning,
    showToast,
    closeModal,
    closeAllModals,
    showClearModal,
    showDownloadModal,
    confirmDownload,
    toggleInsertDropdown,
    handleDropdownKeyboard,
    closeDropdowns,
    updateAutosaveStatus,
    clearDraft,
    saveDraft,
    restoreDraft,
    saveSettings,
    restoreSettings,
    setupSplitResizer,
    printPreview,
    copyHtml,
    loadSampleContent
} from './ui.js';

// ============================================
// DOM ELEMENT REFERENCES
// ============================================

const elements = {
    editor: document.getElementById('editor'),
    preview: document.getElementById('preview'),
    renderTimeDisplay: document.getElementById('renderTimeDisplay'),
    livePreviewToggle: document.getElementById('livePreviewToggle'),
    livePreviewLabel: document.getElementById('livePreviewLabel'),
    experimentalToggle: document.getElementById('experimentalToggle'),
    updatePreviewBtn: document.getElementById('updatePreviewBtn'),
    statChars: document.getElementById('statChars'),
    statWords: document.getElementById('statWords'),
    statLines: document.getElementById('statLines'),
    statMode: document.getElementById('statMode'),
    statRender: document.getElementById('statRender'),
    statLive: document.getElementById('statLive'),
    statReadTime: document.getElementById('statReadTime'),
    warningBanner: document.getElementById('warningBanner'),
    warningText: document.getElementById('warningText'),
    imageList: document.getElementById('imageList'),
    storageInfo: document.getElementById('storageInfo'),
    insertDropdown: document.getElementById('insertDropdown'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    statusTime: document.getElementById('statusTime')
};

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    initRender(elements);
    initEditor(elements, getEditorCallbacks());
    initImages(elements);
    initUI(elements);

    const { mode, livePreview, experimental, splitRatio } = restoreSettings();
    state.currentMode = mode;
    state.livePreviewEnabled = livePreview;
    state.experimentalMode = experimental;
    state.splitRatio = splitRatio;

    elements.livePreviewToggle.checked = livePreview;
    elements.experimentalToggle.checked = experimental;

    const { content: draftContent, missingImages } = restoreDraft();
    if (draftContent) {
        setEditorValue(draftContent);
        state.lastSavedContent = draftContent;
        if (missingImages.length > 0) {
            showWarning(`Missing images from previous session: ${missingImages.join(', ')}. Re-upload to restore.`);
        }
    }

    updateStats(elements.editor.value, state.currentMode, state.livePreviewEnabled);
    renderPreview(elements.editor.value, state.currentMode);

    setupEventListeners();
    setupFindReplace();
    setupSplitResizer();
});

function getEditorCallbacks() {
    return {
        onUpdateStats: () => updateStats(elements.editor.value, state.currentMode, state.livePreviewEnabled),
        onAutosave: autosaveWrapper,
        onDisableLivePreview: () => {
            state.livePreviewEnabled = false;
            elements.livePreviewToggle.checked = false;
            updateLivePreviewUI(false);
        },
        onHideWarning: hideWarning,
        onShowWarning: showWarning,
        onPrint: () => printPreview(elements.preview),
        onOpenFindReplace: () => {
            document.getElementById('findReplaceBar').classList.add('active');
            const findInput = document.getElementById('findInput');
            const selectedText = elements.editor.value.substring(elements.editor.selectionStart, elements.editor.selectionEnd);
            if (selectedText && selectedText.length < 100 && !selectedText.includes('\n')) {
                findInput.value = selectedText;
            }
            findInput.focus();
            findInput.select();
            if (findInput.value) {
                findInput.dispatchEvent(new Event('input'));
            }
        },
        onCloseDropdowns: closeDropdowns
    };
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    elements.editor.addEventListener('input', (e) => {
        state.hasUnsavedChanges = elements.editor.value !== state.lastSavedContent;
        onEditorInput(e, state.experimentalMode, state.livePreviewEnabled);
    });

    elements.editor.addEventListener('beforeinput', saveSnapshot);
    document.addEventListener('keydown', handleKeyboardShortcuts);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) closeDropdowns();
    });

    elements.insertDropdown.addEventListener('keydown', handleDropdownKeyboard);

    // Image drag and drop
    const dropZone = document.getElementById('dropZone');
    dropZone?.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });
    dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone?.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleImageUpload(e.dataTransfer.files);
    });
    dropZone?.addEventListener('click', () => document.getElementById('imageInput')?.click());
    document.getElementById('imageInput')?.addEventListener('change', (e) => {
        handleImageUpload(e.target.files);
    });

    elements.imageList?.addEventListener('click', handleImageListClick);

    window.addEventListener('beforeunload', (e) => {
        if (state.hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const findBar = document.getElementById('findReplaceBar');
            if (findBar?.classList.contains('active')) {
                findBar.classList.remove('active');
            } else {
                closeAllModals();
            }
        }
    });

    // Toolbar buttons
    document.getElementById('copyMarkdownBtn')?.addEventListener('click', copyMarkdown);
    document.getElementById('copyHtmlBtn')?.addEventListener('click', () => copyHtml(elements.preview));
    document.getElementById('downloadMdBtn')?.addEventListener('click', () => showDownloadModal('md'));
    document.getElementById('downloadHtmlBtn')?.addEventListener('click', () => showDownloadModal('html'));
    document.getElementById('printBtn')?.addEventListener('click', () => printPreview(elements.preview));
    document.getElementById('clearBtn')?.addEventListener('click', () => showClearModal(elements.editor.value, confirmClearFn));
    document.getElementById('updatePreviewBtn')?.addEventListener('click', () => renderPreview(elements.editor.value, state.currentMode));
    document.getElementById('insertDropdownBtn')?.addEventListener('click', toggleInsertDropdown);
    document.getElementById('clearDraftBtn')?.addEventListener('click', clearDraft);

    // Sample buttons
    document.getElementById('sampleCommonmark')?.addEventListener('click', () => loadSampleContentWrapper('commonmark'));
    document.getElementById('sampleGfm')?.addEventListener('click', () => loadSampleContentWrapper('gfm'));
    document.getElementById('sampleOriginal')?.addEventListener('click', () => loadSampleContentWrapper('original'));

    // Mode buttons
    document.getElementById('modeOriginal')?.addEventListener('click', () => setMode('original'));
    document.getElementById('modeCommonmark')?.addEventListener('click', () => setMode('commonmark'));
    document.getElementById('modeGfm')?.addEventListener('click', () => setMode('gfm'));

    // Toggles
    elements.livePreviewToggle.addEventListener('change', toggleLivePreview);
    elements.experimentalToggle.addEventListener('change', toggleExperimental);

    // Dropdown items
    elements.insertDropdown.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', () => {
            const format = item.dataset.format;
            if (format) insertFormatting(format);
        });
    });

    // Modal buttons
    document.getElementById('clearModalCancel')?.addEventListener('click', () => closeModal('clearModal'));
    document.getElementById('clearModalConfirm')?.addEventListener('click', confirmClearFn);
    document.getElementById('downloadModalCancel')?.addEventListener('click', () => closeModal('downloadModal'));
    document.getElementById('downloadModalConfirm')?.addEventListener('click', () => confirmDownload(elements.editor.value, elements.preview));
}

// ============================================
// MODE & TOGGLE HANDLERS
// ============================================

function setMode(mode) {
    const validModes = Object.keys(MODE_LABELS);
    if (!validModes.includes(mode)) mode = 'commonmark';

    state.currentMode = mode;

    document.getElementById('modeOriginal').classList.toggle('active', mode === 'original');
    document.getElementById('modeCommonmark').classList.toggle('active', mode === 'commonmark');
    document.getElementById('modeGfm').classList.toggle('active', mode === 'gfm');

    renderPreview(elements.editor.value, state.currentMode);
    updateStats(elements.editor.value, state.currentMode, state.livePreviewEnabled);
    saveSettings(state.currentMode, state.livePreviewEnabled, state.experimentalMode, state.splitRatio);
}

function toggleLivePreview() {
    state.livePreviewEnabled = elements.livePreviewToggle.checked;
    updateLivePreviewUI(state.livePreviewEnabled);
    updateStats(elements.editor.value, state.currentMode, state.livePreviewEnabled);

    if (state.livePreviewEnabled) {
        hideWarning();
        renderPreview(elements.editor.value, state.currentMode);
    }

    saveSettings(state.currentMode, state.livePreviewEnabled, state.experimentalMode, state.splitRatio);
}

function toggleExperimental() {
    state.experimentalMode = elements.experimentalToggle.checked;
    if (state.experimentalMode) hideWarning();
    saveSettings(state.currentMode, state.livePreviewEnabled, state.experimentalMode, state.splitRatio);
}

// ============================================
// AUTOSAVE
// ============================================

function autosaveWrapper() {
    const missingImages = getMissingImageNames(elements.editor.value);
    saveDraft(elements.editor.value, missingImages);
    state.lastSavedContent = elements.editor.value;
    state.lastSaveTime = new Date();
    state.hasUnsavedChanges = false;
}

// ============================================
// CLEAR CONFIRMATION
// ============================================

function confirmClearFn() {
    setEditorValue('');
    state.lastSavedContent = '';
    state.hasUnsavedChanges = false;
    localStorage.removeItem(STORAGE_KEYS.DRAFT);
    localStorage.removeItem(STORAGE_KEYS.MISSING_IMAGES);

    updateStats('', state.currentMode, state.livePreviewEnabled);
    renderPreview('', state.currentMode);
    closeModal('clearModal');
    hideWarning();
    showToast('Document cleared', 'success');
}

// ============================================
// SAMPLE CONTENT WRAPPER
// ============================================

function loadSampleContentWrapper(mode) {
    loadSampleContent(
        mode,
        state.currentMode,
        setMode,
        elements.editor,
        () => renderPreview(elements.editor.value, state.currentMode),
        hideWarning,
        () => updateStats(elements.editor.value, state.currentMode, state.livePreviewEnabled),
        autosaveWrapper
    );
}
