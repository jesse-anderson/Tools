// ============================================
// STATE & CONFIGURATION MODULE
// ============================================

// Storage keys
export const STORAGE_KEYS = {
    DRAFT: 'mdpreview_draft',
    MODE: 'mdpreview_mode',
    LIVE_PREVIEW: 'mdpreview_livepreview',
    EXPERIMENTAL: 'mdpreview_experimental',
    MISSING_IMAGES: 'mdpreview_missing_images',
    SPLIT_RATIO: 'mdpreview_split_ratio'
};

// Mode labels
export const MODE_LABELS = {
    original: 'MD 1.0',
    commonmark: 'CommonMark',
    gfm: 'GFM'
};

// Constants (magic numbers extracted)
export const MAX_DRAFT_BYTES = 1000000;        // 1 MB
export const MAX_DRAFT_CHARS = 300000;         // 300k chars
export const AUTOSAVE_DEBOUNCE = 1000;         // 1 second
export const RENDER_DEBOUNCE = 100;            // 100ms
export const SLOW_THRESHOLD_MS = 100;
export const RENDER_HISTORY_SIZE = 5;
export const LARGE_DOC_THRESHOLD = 200000;     // 200k chars
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_SESSION_STORAGE = 50 * 1024 * 1024; // 50 MB
export const TOAST_DURATION = 3000;            // 3 seconds
export const TOAST_FADE_DURATION = 300;        // 300ms fade out
export const CLEAR_MODAL_THRESHOLD = 500;      // Show modal if > 500 chars
export const WORDS_PER_MINUTE = 200;           // Average reading speed
export const VIRTUAL_SCROLL_THRESHOLD = 100000; // Enable virtual scroll above this
export const SCROLL_SYNC_DEBOUNCE = 16;        // ~60fps
export const MIN_PANE_WIDTH = 200;             // Minimum width for editor/preview
export const VALID_FILENAME_REGEX = /^[a-zA-Z0-9_\-. ]+$/;

// Prism language mapping
export const PRISM_LANGUAGE_MAP = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'sh': 'bash',
    'shell': 'bash',
    'yml': 'yaml',
    'md': 'markdown'
};

/**
 * DOMPurify sanitizer configuration
 * Allows safe HTML tags and attributes for markdown rendering
 * @type {Object}
 */
export const SANITIZER_CONFIG = {
    ALLOWED_TAGS: [
        'p', 'br', 'hr',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'em', 'strong', 'del', 's',
        'ul', 'ol', 'li',
        'blockquote',
        'pre', 'code',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'a', 'img',
        'span', 'div',
        'input'
    ],
    ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title',
        'class', 'id', 'data-id',
        'align', 'colspan', 'rowspan',
        'type', 'checked', 'disabled'
    ],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|blob):)/i
};

// Application state (exported for access by other modules)
export const state = {
    currentMode: 'commonmark',
    livePreviewEnabled: true,
    experimentalMode: false,
    hasUnsavedChanges: false,
    lastSavedContent: '',
    lastSaveTime: null,
    splitRatio: 0.5,
    renderTimes: [],
    undoStack: [],
    redoStack: [],
    lastSnapshot: '',
    isEditorScrolling: false,
    isPreviewScrolling: false,
    isResizing: false,
    findMatches: [],
    currentMatchIndex: -1,
    dropdownFocusIndex: -1
};

// Undo/Redo constants
export const MAX_UNDO_STACK = 50;

// Lazy-loaded Prism languages set (shared)
export const loadedPrismLanguages = new Set(['plaintext']);

// Embedded styles cache
export const embeddedStylesCache = new Map();
