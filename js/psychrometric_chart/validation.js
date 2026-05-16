(function () {
    'use strict';

    // ========================================
    // VALIDATION MODAL
    // ========================================
    const VALIDATION_MODE_LABELS = {
        tdb_rh: 'Tdb + RH',
        tdb_twb: 'Tdb + Twb',
        tdb_tdp: 'Tdb + Tdp',
        tdb_w: 'Tdb + W'
    };
    let lastValidationReport = null;

    function validateCalculator() {
        const results = [];
        let allPassed = true;

        REFERENCE_DATA.forEach((testCase) => {
            const result = solveReferenceCase(testCase);
            const checks = buildValidationChecks(result, testCase);
            const testPassed = Object.values(checks).every(c => c.passed);

            if (!testPassed) allPassed = false;

            results.push({
                name: testCase.name,
                inputText: formatValidationInput(testCase),
                checks,
                passed: testPassed,
                converged: result.Twb_converged !== false,
                warning: result.warning
            });
        });

        lastValidationReport = {
            generatedAt: new Date(),
            allPassed,
            results
        };

        showValidationResults(results, allPassed);
    }

    function solveReferenceCase(testCase) {
        const input = testCase.input;

        switch (testCase.mode) {
            case 'tdb_rh':
                return PSY.solve_Tdb_RH(input.Tdb, input.RH, input.Pa);
            case 'tdb_twb':
                return PSY.solve_Tdb_Twb(input.Tdb, input.Twb, input.Pa);
            case 'tdb_tdp':
                return PSY.solve_Tdb_Tdp(input.Tdb, input.Tdp, input.Pa);
            case 'tdb_w':
                return PSY.solve_Tdb_W(input.Tdb, input.W, input.Pa);
            default:
                throw new Error(`Unsupported validation mode: ${testCase.mode}`);
        }
    }

    function buildValidationChecks(result, testCase) {
        const actualValues = {
            Twb: result.Twb,
            Tdp: result.Tdp,
            RH: result.RH,
            W: result.W * 1000,
            h: result.h,
            v: result.v
        };

        return Object.fromEntries(Object.entries(testCase.expected).map(([key, expected]) => {
            const actual = actualValues[key];
            const tolerance = testCase.tolerance[key];

            return [key, {
                actual,
                expected,
                tolerance,
                passed: Math.abs(actual - expected) <= tolerance
            }];
        }));
    }

    function formatValidationInput(testCase) {
        const input = testCase.input;
        const parts = [
            `Mode = ${VALIDATION_MODE_LABELS[testCase.mode] || testCase.mode}`,
            `Tdb = ${input.Tdb} C`
        ];

        if (testCase.mode === 'tdb_rh') {
            parts.push(`RH = ${input.RH}%`);
        } else if (testCase.mode === 'tdb_twb') {
            parts.push(`Twb = ${input.Twb.toFixed(3)} C`);
        } else if (testCase.mode === 'tdb_tdp') {
            parts.push(`Tdp = ${input.Tdp.toFixed(3)} C`);
        } else if (testCase.mode === 'tdb_w') {
            parts.push(`W = ${(input.W * 1000).toFixed(3)} g/kg`);
        }

        parts.push(`Pa = ${input.Pa} kPa`);
        return parts.join(', ');
    }

    function validationDecimals(key) {
        if (key === 'W') return 3;
        if (key === 'v') return 4;
        if (key === 'RH') return 2;
        return 2;
    }

    function csvCell(value) {
        const text = String(value ?? '');
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function exportValidationReport() {
        if (!lastValidationReport) {
            validateCalculator();
            return;
        }

        const report = lastValidationReport;
        const lines = [
            ['Psychrometric Calculator Validation Report'],
            [`Generated: ${report.generatedAt.toLocaleString()}`],
            ['Reference Source: PsychroLib v2.5.0 implementation of ASHRAE Fundamentals equations'],
            [`Overall Status: ${report.allPassed ? 'PASSED' : 'FAILED'}`],
            [],
            ['Test Case', 'Input', 'Property', 'Calculated', 'Expected', 'Difference', 'Tolerance', 'Status']
        ];

        for (const result of report.results) {
            for (const [key, check] of Object.entries(result.checks)) {
                lines.push([
                    result.name,
                    result.inputText,
                    key,
                    check.actual.toFixed(6),
                    check.expected.toFixed(6),
                    (check.actual - check.expected).toFixed(6),
                    check.tolerance,
                    check.passed ? 'PASS' : 'FAIL'
                ]);
            }
        }

        const csv = lines
            .map(row => Array.isArray(row) ? row.map(csvCell).join(',') : csvCell(row))
            .join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `psychrometric-validation_${report.generatedAt.toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    function showValidationResults(results, allPassed) {
        const existingModal = document.getElementById('validationModal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'validationModal';
        modal.className = 'validation-modal';
        modal.innerHTML = `
            <div class="validation-content">
                <div class="validation-header">
                    <h2>
                        ${allPassed
                            ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg> Validation Passed'
                            : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg> Validation Failed'}
                    </h2>
                    <button class="validation-close" onclick="document.getElementById('validationModal').remove()">&times;</button>
                </div>
                <p class="validation-summary">${allPassed
                    ? 'All input modes passed within specified tolerances.'
                    : 'One or more validation cases failed. Check details below.'}</p>
                <p class="validation-summary">Reference cases are PsychroLib v2.5.0 ASHRAE equation outputs used to verify this page's input-mode wiring and tolerances.</p>
                <div class="validation-results">
                    ${results.map((r) => `
                        <div class="validation-test ${r.passed ? 'passed' : 'failed'}">
                            <div class="validation-test-header">
                                <span class="validation-test-name">${r.name}</span>
                                <span class="validation-test-status">${r.passed ? 'PASSED' : 'FAILED'}</span>
                            </div>
                            <div class="validation-test-inputs">Input: ${r.inputText}</div>
                            <table class="validation-table">
                                <thead>
                                    <tr>
                                        <th>Property</th>
                                        <th>Calculated</th>
                                        <th>Expected</th>
                                        <th>Difference</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${Object.entries(r.checks).map(([key, check]) => {
                                        const diff = check.actual - check.expected;
                                        const diffStr = (diff >= 0 ? '+' : '') + diff.toFixed(4);
                                        const statusClass = check.passed ? 'check-pass' : 'check-fail';
                                        const decimals = validationDecimals(key);

                                        return `
                                            <tr>
                                                <td>${key}</td>
                                                <td>${check.actual.toFixed(decimals)}</td>
                                                <td>${check.expected.toFixed(decimals)}</td>
                                                <td class="${statusClass}">${diffStr}</td>
                                                <td class="${statusClass}">${check.passed ? 'Pass' : 'Fail'}</td>
                                            </tr>
                                        `;
                                    }).join('')}
                                </tbody>
                            </table>
                            ${r.warning ? `<div class="validation-warning">Warning: ${r.warning}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
                <div class="validation-footer">
                    <button class="validation-btn" onclick="exportValidationReport()">Export Report</button>
                    <button class="validation-btn" onclick="document.getElementById('validationModal').remove()">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.classList.add('active');
    }

    // Exports
    window.validateCalculator = validateCalculator;
    // exportValidationReport is referenced by inline onclick= inside the
    // dynamically injected modal HTML, so it must be reachable on window.
    window.exportValidationReport = exportValidationReport;
    const Psy = (window.Psy = window.Psy || {});
    Psy.validateCalculator = validateCalculator;
    Psy.exportValidationReport = exportValidationReport;
})();
