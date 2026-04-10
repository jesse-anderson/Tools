export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const MAX_PROFILE_ROWS = 200000;
export const MAX_COLUMN_COUNT = 512;
export const MAX_ROW_CHAR_LENGTH = 250000;
export const MAX_PREVIEW_ROWS = 25;
export const MAX_UNIQUE_TRACKED = 20000;
export const MAX_NUMERIC_SAMPLES = 4096;
export const MAX_HISTOGRAM_COLUMNS = 4;
export const HISTOGRAM_BIN_COUNT = 8;
export const MAX_SAMPLE_VALUES = 3;
export const MAX_CELL_PREVIEW_LENGTH = 96;
export const YIELD_CHAR_INTERVAL = 250000;
export const SAMPLE_ROW_SCAN_LIMIT = 16;
export const SAMPLE_CHAR_SCAN_LIMIT = 120000;

export const DELIMITER_OPTIONS = {
    auto: {
        key: 'auto',
        label: 'Auto detect',
        character: null
    },
    comma: {
        key: 'comma',
        label: 'Comma',
        character: ','
    },
    tab: {
        key: 'tab',
        label: 'Tab',
        character: '\t'
    },
    semicolon: {
        key: 'semicolon',
        label: 'Semicolon',
        character: ';'
    },
    pipe: {
        key: 'pipe',
        label: 'Pipe',
        character: '|'
    }
};

export const DELIMITER_CANDIDATES = [
    DELIMITER_OPTIONS.comma,
    DELIMITER_OPTIONS.tab,
    DELIMITER_OPTIONS.semicolon,
    DELIMITER_OPTIONS.pipe
];
