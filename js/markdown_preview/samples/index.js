/**
 * Sample Content Index
 * Exports all markdown samples for dynamic loading
 */

export { MD10_SAMPLE } from './md10-sample.js';
export { COMMONMARK_SAMPLE } from './commonmark-sample.js';
export { GFM_SAMPLE } from './gfm-sample.js';

// Sample metadata
export const SAMPLE_INFO = {
    original: {
        name: 'MD 1.0',
        title: 'Markdown 1.0 (Gruber)',
        description: 'Original Markdown.pl syntax',
        exportName: 'MD10'
    },
    commonmark: {
        name: 'CommonMark',
        title: 'CommonMark 0.31',
        description: 'Strict, unambiguous specification',
        exportName: 'CommonMark'
    },
    gfm: {
        name: 'GFM',
        title: 'GitHub Flavored Markdown 0.29',
        description: 'Tables, task lists, strikethrough, autolinks',
        exportName: 'GFM'
    }
};
