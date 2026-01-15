// ============================================
// PDF Diff Checker - Export Functions
// ============================================

/**
 * Diff report generation and export functionality
 * Generates text and JSON reports of PDF comparisons
 */

import { state } from './pdf-diff-state.js';
import { getDiffStats } from './pdf-diff-diff.js';

// ============================================
// Report Generation
// ============================================

/**
 * Generate a diff report as text
 * @returns {string} Formatted diff report
 */
function generateDiffReport() {
    const stats = getDiffStats(state.diffResults);
    const timestamp = new Date().toISOString();

    let report = '';
    report += '='.repeat(60) + '\n';
    report += 'PDF DIFF REPORT\n';
    report += '='.repeat(60) + '\n\n';

    // Metadata
    report += 'Generated: ' + new Date().toLocaleString() + '\n';
    report += 'PDF A: ' + (state.fileAName || 'Unknown') + '\n';
    report += 'PDF B: ' + (state.fileBName || 'Unknown') + '\n';
    report += '\n';

    // Summary Statistics
    report += '-'.repeat(60) + '\n';
    report += 'SUMMARY\n';
    report += '-'.repeat(60) + '\n';
    report += 'Insertions:    ' + stats.insertions + '\n';
    report += 'Deletions:     ' + stats.deletions + '\n';
    report += 'Modifications: ' + Math.round(stats.modifications / 2) + '\n';
    report += 'Unchanged:     ' + stats.unchanged + '\n';
    report += '\n';

    // Detailed changes by page
    report += '-'.repeat(60) + '\n';
    report += 'DETAILED CHANGES\n';
    report += '-'.repeat(60) + '\n\n';

    // Group diffs by page and type
    const changesByPage = {};

    // Process PDF A diffs (deletions, modifications)
    for (const [pageIndex, diffs] of Object.entries(state.pageDiffsA)) {
        if (!changesByPage[pageIndex]) {
            changesByPage[pageIndex] = { insertions: [], deletions: [], modifications: [] };
        }
        for (const diff of diffs) {
            if (diff.type === 'deletion') {
                changesByPage[pageIndex].deletions.push(diff);
            } else if (diff.type === 'modified') {
                changesByPage[pageIndex].modifications.push(diff);
            }
        }
    }

    // Process PDF B diffs (insertions, modifications)
    for (const [pageIndex, diffs] of Object.entries(state.pageDiffsB)) {
        if (!changesByPage[pageIndex]) {
            changesByPage[pageIndex] = { insertions: [], deletions: [], modifications: [] };
        }
        for (const diff of diffs) {
            if (diff.type === 'insertion') {
                changesByPage[pageIndex].insertions.push(diff);
            } else if (diff.type === 'modified') {
                // Avoid double-counting modifications (they appear in both PDFs)
                // Only count if not already in this page's modifications
                const alreadyCounted = changesByPage[pageIndex].modifications.some(
                    existingMod => existingMod.text === diff.originalText
                );
                if (!alreadyCounted) {
                    changesByPage[pageIndex].modifications.push(diff);
                }
            }
        }
    }

    // Sort pages and report changes
    const sortedPages = Object.keys(changesByPage).map(Number).sort((a, b) => a - b);

    if (sortedPages.length === 0) {
        report += 'No changes detected.\n';
    } else {
        for (const pageIndex of sortedPages) {
            const pageChanges = changesByPage[pageIndex];
            const pageNum = pageIndex + 1;

            report += 'Page ' + pageNum + ':\n';

            if (pageChanges.deletions.length > 0) {
                report += '  DELETIONS (' + pageChanges.deletions.length + '):\n';
                for (const diff of pageChanges.deletions.slice(0, 10)) {
                    const text = diff.text.replace(/\n/g, '\\n').substring(0, 60);
                    report += '    - "' + text + (diff.text.length > 60 ? '...' : '') + '"\n';
                }
                if (pageChanges.deletions.length > 10) {
                    report += '    ... and ' + (pageChanges.deletions.length - 10) + ' more\n';
                }
            }

            if (pageChanges.insertions.length > 0) {
                report += '  INSERTIONS (' + pageChanges.insertions.length + '):\n';
                for (const diff of pageChanges.insertions.slice(0, 10)) {
                    const text = diff.text.replace(/\n/g, '\\n').substring(0, 60);
                    report += '    + "' + text + (diff.text.length > 60 ? '...' : '') + '"\n';
                }
                if (pageChanges.insertions.length > 10) {
                    report += '    ... and ' + (pageChanges.insertions.length - 10) + ' more\n';
                }
            }

            if (pageChanges.modifications.length > 0) {
                report += '  MODIFICATIONS (' + pageChanges.modifications.length + '):\n';
                for (const diff of pageChanges.modifications.slice(0, 10)) {
                    const oldText = (diff.originalText || diff.text).replace(/\n/g, '\\n').substring(0, 40);
                    const newText = (diff.modifiedText || diff.text).replace(/\n/g, '\\n').substring(0, 40);
                    report += '    ~ "' + oldText + (diff.originalText?.length > 40 || diff.text.length > 40 ? '...' : '') + '"\n';
                    report += '      → "' + newText + (diff.modifiedText?.length > 40 || diff.text.length > 40 ? '...' : '') + '"\n';
                }
                if (pageChanges.modifications.length > 10) {
                    report += '    ... and ' + (pageChanges.modifications.length - 10) + ' more\n';
                }
            }

            report += '\n';
        }
    }

    report += '='.repeat(60) + '\n';
    report += 'END OF REPORT\n';
    report += '='.repeat(60) + '\n';

    return report;
}

/**
 * Generate a JSON diff report
 * @returns {string} JSON formatted diff report
 */
function generateDiffReportJSON() {
    const stats = getDiffStats(state.diffResults);

    const report = {
        metadata: {
            generated: new Date().toISOString(),
            pdfA: state.fileAName || 'Unknown',
            pdfB: state.fileBName || 'Unknown',
            tool: 'PDF Diff Checker v1.0.0',
            url: 'https://github.com/jesse-anderson/Tools'
        },
        summary: {
            insertions: stats.insertions,
            deletions: stats.deletions,
            modifications: Math.round(stats.modifications / 2),
            unchanged: stats.unchanged
        },
        changes: {
            pdfA: [],
            pdfB: []
        }
    };

    // Add PDF A changes (deletions, modifications)
    for (const [pageIndex, diffs] of Object.entries(state.pageDiffsA)) {
        for (const diff of diffs) {
            const changeEntry = {
                page: parseInt(pageIndex) + 1,
                type: diff.type,
                text: diff.text,
                position: {
                    x: diff.boundingBox.x,
                    y: diff.boundingBox.y,
                    width: diff.boundingBox.width,
                    height: diff.boundingBox.height
                }
            };
            // Add modification context if available
            if (diff.type === 'modified' && diff.modifiedText) {
                changeEntry.modifiedTo = diff.modifiedText;
            }
            report.changes.pdfA.push(changeEntry);
        }
    }

    // Add PDF B changes (insertions, modifications)
    for (const [pageIndex, diffs] of Object.entries(state.pageDiffsB)) {
        for (const diff of diffs) {
            const changeEntry = {
                page: parseInt(pageIndex) + 1,
                type: diff.type,
                text: diff.text,
                position: {
                    x: diff.boundingBox.x,
                    y: diff.boundingBox.y,
                    width: diff.boundingBox.width,
                    height: diff.boundingBox.height
                }
            };
            // Add modification context if available
            if (diff.type === 'modified' && diff.originalText) {
                changeEntry.modifiedFrom = diff.originalText;
            }
            report.changes.pdfB.push(changeEntry);
        }
    }

    return JSON.stringify(report, null, 2);
}

// ============================================
// File Download
// ============================================

/**
 * Download content as a file
 * @param {string} content - File content
 * @param {string} filename - Download filename
 * @param {string} mimeType - MIME type
 */
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ============================================
// Export Handler
// ============================================

/**
 * Handle export button click - shows format selection dialog
 * @param {Function} showErrorFn - Error display function from UI module
 */
function handleExportReport(showErrorFn) {
    if (!state.diffResults || state.diffResults.length === 0) {
        showErrorFn('No diff results to export. Please compare PDFs first.');
        return;
    }

    // Ask user for format preference
    const format = prompt('Select export format:\n1 - Text Report (.txt)\n2 - JSON Report (.json)\n\nEnter 1 or 2:', '1');

    if (format === '1') {
        // Text format
        const report = generateDiffReport();
        const filename = 'diff-report-' + Date.now() + '.txt';
        downloadFile(report, filename, 'text/plain');
    } else if (format === '2') {
        // JSON format
        const report = generateDiffReportJSON();
        const filename = 'diff-report-' + Date.now() + '.json';
        downloadFile(report, filename, 'application/json');
    } else {
        showErrorFn('Invalid format selection.');
    }
}

// ============================================
// Exports
// ============================================

export {
    generateDiffReport,
    generateDiffReportJSON,
    downloadFile,
    handleExportReport
};
