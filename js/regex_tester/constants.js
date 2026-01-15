/* ============================================
   REGEX TESTER - Constants
   ============================================ */

/** Regex Engine Types */
export const ENGINE = {
    JAVASCRIPT: 'js',
    PYTHON: 'py'
};

/** CSS Class Names */
export const CLASS = {
    ACTIVE: 'active',
    LOADING: 'loading',
    COPIED: 'copied'
};

/** ARIA Attribute Values */
export const ARIA = {
    TRUE: 'true',
    FALSE: 'false',
    EXPANDED: 'aria-expanded'
};

/** CSS Display Values */
export const DISPLAY = {
    NONE: 'none',
    FLEX: 'flex'
};

/** Keyboard Keys */
export const KEY = {
    ESCAPE: 'Escape'
};

/** Regex Flags by Engine */
export const FLAGS = {
    JS_VALID: 'gimsudyv',
    PY_VALID: 'gimsxa',
    COMMON: 'gims',
    PY_ONLY: 'xa',
    JS_ONLY: 'udyv',
    GLOBAL: 'g',
    IGNORECASE: 'i',
    MULTILINE: 'm',
    DOTALL: 's',
    VERBOSE: 'x',
    ASCII: 'a',
    UNICODE: 'u',
    STICKY: 'y',
    DOTALL_NEW: 's'
};

/** Copy Format Types */
export const COPY_FORMAT = {
    PATTERN: 'pattern',
    JAVASCRIPT: 'javascript',
    PYTHON: 'python'
};

/** Error Messages */
export const ERROR_MSG = {
    NO_PATTERN: 'No pattern',
    NO_MATCHES: 'No matches',
    PYODIDE_LOAD_FAILED: 'Failed to load Pyodide. Check console.',
    INVALID_REGEX: 'Invalid Regex'
};

/** UI Labels */
export const LABEL = {
    MATCHES: 'matches',
    MATCH: 'match',
    ERROR: 'Error'
};

/** LocalStorage Key */
export const STORAGE_KEY = 'regexTesterState';

/** Rendering limits (prevent browser freeze on large inputs) */
export const MAX_MATCHES = 1000;
export const MAX_TEXT_LENGTH = 100000; // 100KB of text
