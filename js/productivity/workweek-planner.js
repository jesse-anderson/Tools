const DAY_DEFS = [
    { id: 'mon', label: 'Monday', short: 'Mon', jsDay: 1 },
    { id: 'tue', label: 'Tuesday', short: 'Tue', jsDay: 2 },
    { id: 'wed', label: 'Wednesday', short: 'Wed', jsDay: 3 },
    { id: 'thu', label: 'Thursday', short: 'Thu', jsDay: 4 },
    { id: 'fri', label: 'Friday', short: 'Fri', jsDay: 5 },
    { id: 'sat', label: 'Saturday', short: 'Sat', jsDay: 6 },
    { id: 'sun', label: 'Sunday', short: 'Sun', jsDay: 0 }
];

const PRESETS = {
    workweek: ['mon', 'tue', 'wed', 'thu', 'fri'],
    fullweek: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    monwed: ['mon', 'tue', 'wed'],
    thusat: ['thu', 'fri', 'sat'],
    monthu: ['mon', 'tue', 'wed', 'thu'],
    frisun: ['fri', 'sat', 'sun'],
    single: ['mon']
};

const STORAGE_KEYS = {
    current: 'workweekPlannerCurrent',
    saved: 'workweekPlannerSaved'
};

const MAX_SAVED_PLANS = 10;
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
});

const MONTH_FORMAT = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: 'numeric'
});

const DEFAULT_STATE = {
    title: '',
    selectionPreset: 'workweek',
    selectedDays: PRESETS.workweek.slice(),
    dateMode: 'generic',
    rangeStart: '',
    rangeEnd: '',
    month: getCurrentMonthValue(),
    durationPreset: '9h',
    startTime: '08:00',
    endTime: '17:00',
    interval: 15,
    zoom: 0.75,
    grouping: 'individual',
    daysPerSheet: 4,
    copies: 1,
    orientation: 'portrait',
    paperSize: 'letter',
    saveName: '',
    footerText: '',
    signatureLines: 0,
    minimalSheet: true,
    showGridLines: false,
    linesPerBlock: 4
};

const state = loadCurrentState();

const dom = {
    titleInput: document.getElementById('titleInput'),
    selectionPreset: document.getElementById('selectionPreset'),
    dateMode: document.getElementById('dateMode'),
    dayGrid: document.getElementById('dayGrid'),
    genericDateHelp: document.getElementById('genericDateHelp'),
    rangeFields: document.getElementById('rangeFields'),
    monthFields: document.getElementById('monthFields'),
    rangeStartInput: document.getElementById('rangeStartInput'),
    rangeEndInput: document.getElementById('rangeEndInput'),
    monthInput: document.getElementById('monthInput'),
    durationPreset: document.getElementById('durationPreset'),
    intervalSelect: document.getElementById('intervalSelect'),
    zoomSelect: document.getElementById('zoomSelect'),
    advancedDetails: document.getElementById('advancedDetails'),
    startTimeInput: document.getElementById('startTimeInput'),
    endTimeInput: document.getElementById('endTimeInput'),
    groupingSelect: document.getElementById('groupingSelect'),
    daysPerSheetSelect: document.getElementById('daysPerSheetSelect'),
    copiesInput: document.getElementById('copiesInput'),
    orientationSelect: document.getElementById('orientationSelect'),
    paperSizeSelect: document.getElementById('paperSizeSelect'),
    saveNameInput: document.getElementById('saveNameInput'),
    footerTextInput: document.getElementById('footerTextInput'),
    signatureLinesSelect: document.getElementById('signatureLinesSelect'),
    minimalSheetCheckbox: document.getElementById('minimalSheetCheckbox'),
    showGridLinesCheckbox: document.getElementById('showGridLinesCheckbox'),
    linesPerBlockSelect: document.getElementById('linesPerBlockSelect'),
    savePlanBtn: document.getElementById('savePlanBtn'),
    exportPdfBtn: document.getElementById('exportPdfBtn'),
    exportJsonBtn: document.getElementById('exportJsonBtn'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    importPlanInput: document.getElementById('importPlanInput'),
    resetConfigBtn: document.getElementById('resetConfigBtn'),
    fitZoomBtn: document.getElementById('fitZoomBtn'),
    previewPdfBtn: document.getElementById('previewPdfBtn'),
    printBtn: document.getElementById('printBtn'),
    previewShell: document.getElementById('previewShell'),
    previewStage: document.getElementById('previewStage'),
    statusBanner: document.getElementById('statusBanner'),
    statsGrid: document.getElementById('statsGrid'),
    savedPlansList: document.getElementById('savedPlansList'),
    dynamicPrintStyle: document.getElementById('dynamicPrintStyle'),
    presetButtons: Array.from(document.querySelectorAll('[data-preset]'))
};

init();

function init() {
    applyStateToControls();
    bindEvents();
    render();
}

function bindEvents() {
    dom.titleInput.addEventListener('input', handleFormChange);
    dom.selectionPreset.addEventListener('change', () => {
        applyPreset(dom.selectionPreset.value, true);
    });
    dom.dateMode.addEventListener('change', handleFormChange);
    dom.rangeStartInput.addEventListener('change', handleFormChange);
    dom.rangeEndInput.addEventListener('change', handleFormChange);
    dom.monthInput.addEventListener('change', handleFormChange);
    dom.durationPreset.addEventListener('change', handleDurationPresetChange);
    dom.intervalSelect.addEventListener('change', handleFormChange);
    dom.zoomSelect.addEventListener('change', handleFormChange);
    dom.startTimeInput.addEventListener('change', handleExactTimeChange);
    dom.endTimeInput.addEventListener('change', handleExactTimeChange);
    dom.groupingSelect.addEventListener('change', handleFormChange);
    dom.daysPerSheetSelect.addEventListener('change', handleFormChange);
    dom.copiesInput.addEventListener('input', handleFormChange);
    dom.orientationSelect.addEventListener('change', handleFormChange);
    dom.paperSizeSelect.addEventListener('change', handleFormChange);
    dom.saveNameInput.addEventListener('input', handleFormChange);
    dom.footerTextInput.addEventListener('input', handleFormChange);
    dom.signatureLinesSelect.addEventListener('change', handleFormChange);
    dom.minimalSheetCheckbox.addEventListener('change', handleFormChange);
    dom.showGridLinesCheckbox.addEventListener('change', handleFormChange);
    dom.linesPerBlockSelect.addEventListener('change', handleFormChange);
    dom.advancedDetails.addEventListener('toggle', persistCurrentState);

    dom.dayGrid.addEventListener('change', () => {
        dom.selectionPreset.value = 'custom';
        state.selectionPreset = 'custom';
        applyFormState();
    });

    dom.presetButtons.forEach((button) => {
        button.addEventListener('click', () => applyPreset(button.dataset.preset, true));
    });

    dom.resetConfigBtn.addEventListener('click', resetState);
    dom.fitZoomBtn.addEventListener('click', () => {
        dom.zoomSelect.value = '0.75';
        handleFormChange();
    });
    dom.printBtn.addEventListener('click', printPlanner);

    dom.savePlanBtn.addEventListener('click', savePlan);
    dom.exportPdfBtn.addEventListener('click', exportPdf);
    dom.previewPdfBtn.addEventListener('click', exportPdf);
    dom.exportJsonBtn.addEventListener('click', exportJson);
    dom.exportCsvBtn.addEventListener('click', exportCsv);
    dom.importPlanInput.addEventListener('change', importPlan);

    dom.savedPlansList.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const id = button.getAttribute('data-plan-id');
        if (!id) return;
        if (button.dataset.action === 'load') {
            loadSavedPlan(id);
        } else if (button.dataset.action === 'delete') {
            deleteSavedPlan(id);
        }
    });

    window.addEventListener('beforeprint', updateDynamicPrintStyle);
}

function handleFormChange() {
    applyFormState();
}

function handleDurationPresetChange() {
    const preset = dom.durationPreset.value;
    if (preset !== 'custom') {
        const hours = parseInt(preset, 10);
        if (!Number.isNaN(hours)) {
            const nextEnd = minutesToTimeLabel(timeToMinutes(dom.startTimeInput.value) + (hours * 60));
            dom.endTimeInput.value = nextEnd;
        }
    }
    applyFormState();
}

function handleExactTimeChange() {
    dom.durationPreset.value = inferDurationPreset(dom.startTimeInput.value, dom.endTimeInput.value);
    applyFormState();
}

function applyPreset(presetKey, syncSelect) {
    const selected = PRESETS[presetKey] ? PRESETS[presetKey].slice() : [];
    if (selected.length) {
        setSelectedDays(selected);
    }
    state.selectionPreset = PRESETS[presetKey] ? presetKey : 'custom';
    if (syncSelect) {
        dom.selectionPreset.value = state.selectionPreset;
    }
    applyFormState();
}

function setSelectedDays(dayIds) {
    const selected = new Set(dayIds);
    dom.dayGrid.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.checked = selected.has(input.value);
    });
}

function applyStateToControls() {
    dom.titleInput.value = state.title;
    dom.selectionPreset.value = state.selectionPreset;
    dom.dateMode.value = state.dateMode;
    setSelectedDays(state.selectedDays);
    dom.rangeStartInput.value = state.rangeStart;
    dom.rangeEndInput.value = state.rangeEnd;
    dom.monthInput.value = state.month;
    dom.durationPreset.value = state.durationPreset;
    dom.intervalSelect.value = String(state.interval);
    dom.zoomSelect.value = String(state.zoom);
    dom.startTimeInput.value = state.startTime;
    dom.endTimeInput.value = state.endTime;
    dom.groupingSelect.value = state.grouping;
    dom.daysPerSheetSelect.value = String(state.daysPerSheet);
    dom.copiesInput.value = String(state.copies);
    dom.orientationSelect.value = state.orientation;
    dom.paperSizeSelect.value = state.paperSize;
    dom.saveNameInput.value = state.saveName || '';
    dom.footerTextInput.value = state.footerText || '';
    dom.signatureLinesSelect.value = String(state.signatureLines);
    dom.minimalSheetCheckbox.checked = state.minimalSheet;
    dom.showGridLinesCheckbox.checked = state.showGridLines;
    dom.linesPerBlockSelect.value = String(state.linesPerBlock);
    dom.advancedDetails.open = false;
    syncConditionalControls();
}

function applyFormState() {
    state.title = dom.titleInput.value.trim().slice(0, 80);
    state.selectionPreset = dom.selectionPreset.value;
    state.selectedDays = getSelectedDays();
    state.dateMode = dom.dateMode.value;
    state.rangeStart = dom.rangeStartInput.value;
    state.rangeEnd = dom.rangeEndInput.value;
    state.month = dom.monthInput.value || getCurrentMonthValue();
    state.durationPreset = dom.durationPreset.value;
    state.startTime = dom.startTimeInput.value || '08:00';
    state.endTime = dom.endTimeInput.value || '17:00';
    state.interval = clampNumber(parseInt(dom.intervalSelect.value, 10), 15, 60, 15);
    state.zoom = clampFloat(parseFloat(dom.zoomSelect.value), 0.5, 1, 0.75);
    state.grouping = dom.groupingSelect.value;
    state.daysPerSheet = clampNumber(parseInt(dom.daysPerSheetSelect.value, 10), 2, 7, 4);
    state.copies = clampNumber(parseInt(dom.copiesInput.value, 10), 1, 10, 1);
    state.orientation = dom.orientationSelect.value;
    state.paperSize = dom.paperSizeSelect.value;
    state.saveName = dom.saveNameInput.value.trim();
    state.footerText = dom.footerTextInput.value.trim();
    state.signatureLines = clampNumber(parseInt(dom.signatureLinesSelect.value, 10), 0, 5, 0);
    state.minimalSheet = dom.minimalSheetCheckbox.checked;
    state.showGridLines = dom.showGridLinesCheckbox.checked;
    state.linesPerBlock = clampNumber(parseInt(dom.linesPerBlockSelect.value, 10), 2, 8, 4);

    dom.copiesInput.value = String(state.copies);
    dom.intervalSelect.value = String(state.interval);
    dom.zoomSelect.value = String(state.zoom);
    dom.linesPerBlockSelect.value = String(state.linesPerBlock);
    dom.signatureLinesSelect.value = String(state.signatureLines);

    syncConditionalControls();
    persistCurrentState();
    render();
}

function syncConditionalControls() {
    dom.genericDateHelp.classList.toggle('is-active', state.dateMode === 'generic');
    dom.rangeFields.classList.toggle('is-active', state.dateMode === 'range');
    dom.monthFields.classList.toggle('is-active', state.dateMode === 'month');
    dom.daysPerSheetSelect.disabled = state.grouping !== 'combined';
}

function render() {
    const model = buildPlannerModel();
    updateDynamicPrintStyle();
    renderStatus(model);
    renderStats(model);
    renderSavedPlans();
    renderPreview(model);
}

function buildPlannerModel() {
    const warnings = [];
    const errors = [];
    const selectedDayDefs = DAY_DEFS.filter((day) => state.selectedDays.includes(day.id));

    if (!selectedDayDefs.length) {
        errors.push('Select at least one day to generate planner sheets.');
    }

    const timeInfo = buildTimeInfo(state.startTime, state.endTime, state.interval) || {
        blocks: [],
        totalMinutes: 0,
        overnight: false,
        warnings: ['Planner time block generation failed.']
    };
    warnings.push(...(Array.isArray(timeInfo.warnings) ? timeInfo.warnings : []));
    if (!timeInfo.blocks.length) {
        errors.push('The selected time range did not produce any planner rows.');
    }

    const generated = buildDayInstances(selectedDayDefs);
    warnings.push(...generated.warnings);
    errors.push(...generated.errors);

    const uniqueDays = generated.days;
    const sheets = buildSheets(uniqueDays);
    const totalMinutesPerDay = timeInfo.totalMinutes;
    const totalMinutes = totalMinutesPerDay * uniqueDays.length;
    const totalPrintedMinutes = totalMinutes * state.copies;
    const totalLineSlots = uniqueDays.length * timeInfo.blocks.length * state.linesPerBlock * state.copies;

    return {
        errors,
        warnings,
        selectedDayDefs,
        uniqueDays,
        sheets,
        blocks: timeInfo.blocks,
        totalMinutesPerDay,
        totalMinutes,
        totalPrintedMinutes,
        totalLineSlots,
        totalPages: sheets.length,
        dateSummary: generated.summary,
        overnight: timeInfo.overnight
    };
}

function buildTimeInfo(startTime, endTime, interval) {
    const warnings = [];
    let startMinutes = timeToMinutes(startTime);
    let endMinutes = timeToMinutes(endTime);

    if (endMinutes <= startMinutes) {
        endMinutes += 24 * 60;
        warnings.push('End time is earlier than or equal to start time. Planner is being treated as an overnight shift.');
    }

    const totalMinutes = Math.max(0, endMinutes - startMinutes);
    const blocks = [];

    for (let cursor = startMinutes; cursor < endMinutes; cursor += interval) {
        const compactLabel = formatCompactTimeLabel(cursor);
        blocks.push({
            rawMinutes: cursor,
            label: minutesToTimeLabel(cursor),
            displayLabel: compactLabel.text,
            isHourLabel: compactLabel.isHour
        });
    }

    if (totalMinutes < interval) {
        warnings.push('Time span is shorter than the selected interval, so only a very small planner will print.');
    }

    return {
        blocks,
        totalMinutes,
        overnight: endMinutes > (24 * 60),
        warnings
    };
}

function buildDayInstances(selectedDayDefs) {
    const warnings = [];
    const errors = [];

    if (!selectedDayDefs.length) {
        return {
            days: [],
            warnings,
            errors,
            summary: 'No days selected'
        };
    }

    if (state.dateMode === 'generic') {
        return {
            days: selectedDayDefs.map((day, index) => ({
                key: `generic-${day.id}`,
                title: day.label,
                dateLabel: '',
                order: index
            })),
            warnings,
            errors,
            summary: `Generic weekdays: ${selectedDayDefs.map((day) => day.short).join(', ')}`
        };
    }

    if (state.dateMode === 'range') {
        if (!state.rangeStart || !state.rangeEnd) {
            errors.push('Set both start and end dates for range mode.');
            return { days: [], warnings, errors, summary: 'Date range incomplete' };
        }

        const start = parseDateInput(state.rangeStart);
        const end = parseDateInput(state.rangeEnd);
        if (!start || !end || start > end) {
            errors.push('Date range is invalid. Ensure the end date is on or after the start date.');
            return { days: [], warnings, errors, summary: 'Invalid date range' };
        }

        const days = [];
        let cursor = new Date(start);
        const totalDays = getInclusiveDateSpan(start, end);
        for (let offset = 0; offset < totalDays; offset += 1) {
            const match = selectedDayDefs.find((day) => day.jsDay === cursor.getDay());
            if (match) {
                days.push({
                    key: buildDateKey(cursor),
                    title: match.label,
                    dateLabel: DATE_FORMAT.format(cursor),
                    order: cursor.getTime()
                });
            }
            cursor.setDate(cursor.getDate() + 1);
        }

        if (!days.length) {
            warnings.push('No matching dates were found inside the selected range for the chosen weekday set.');
        }

        return {
            days,
            warnings,
            errors,
            summary: `${DATE_FORMAT.format(start)} - ${DATE_FORMAT.format(end)}`
        };
    }

    if (state.dateMode === 'month') {
        if (!state.month) {
            errors.push('Choose a month to generate all selected weekdays in that month.');
            return { days: [], warnings, errors, summary: 'Month not set' };
        }

        const [yearValue, monthValue] = state.month.split('-').map((value) => parseInt(value, 10));
        if (!yearValue || !monthValue) {
            errors.push('Month selection is invalid.');
            return { days: [], warnings, errors, summary: 'Invalid month' };
        }

        const first = new Date(yearValue, monthValue - 1, 1);
        const last = new Date(yearValue, monthValue, 0);
        const days = [];
        let cursor = new Date(first);
        const totalDays = getInclusiveDateSpan(first, last);
        for (let offset = 0; offset < totalDays; offset += 1) {
            const match = selectedDayDefs.find((day) => day.jsDay === cursor.getDay());
            if (match) {
                days.push({
                    key: buildDateKey(cursor),
                    title: match.label,
                    dateLabel: DATE_FORMAT.format(cursor),
                    order: cursor.getTime()
                });
            }
            cursor.setDate(cursor.getDate() + 1);
        }

        if (!days.length) {
            warnings.push('No matching dates were found in the selected month for the chosen weekday set.');
        }

        return {
            days,
            warnings,
            errors,
            summary: `${MONTH_FORMAT.format(first)} (${selectedDayDefs.map((day) => day.short).join(', ')})`
        };
    }

    return {
        days: [],
        warnings,
        errors: ['Unsupported date mode selected.'],
        summary: 'Unsupported date mode'
    };
}

function buildSheets(uniqueDays) {
    const sheets = [];
    const chunkSize = state.grouping === 'combined' ? state.daysPerSheet : 1;
    const chunks = chunkDays(uniqueDays, chunkSize);

    for (let copyIndex = 0; copyIndex < state.copies; copyIndex += 1) {
        chunks.forEach((days, chunkIndex) => {
            sheets.push({
                copyNumber: copyIndex + 1,
                pageNumber: sheets.length + 1,
                days
            });
        });
    }

    return sheets;
}

function chunkDays(days, chunkSize) {
    if (!days.length) return [];
    const size = Math.max(1, chunkSize);
    const chunks = [];
    for (let index = 0; index < days.length; index += size) {
        chunks.push(days.slice(index, index + size));
    }
    return chunks;
}

function renderStatus(model) {
    const messages = [];
    let statusClass = 'is-info';

    if (model.errors.length) {
        statusClass = 'is-error';
        messages.push(...model.errors);
    } else {
        messages.push(`${model.uniqueDays.length} planner day${model.uniqueDays.length === 1 ? '' : 's'} generated across ${model.totalPages} printable page${model.totalPages === 1 ? '' : 's'}.`);
        messages.push(`Date summary: ${model.dateSummary}.`);
        if (state.grouping === 'combined') {
            messages.push(`Combined view places up to ${state.daysPerSheet} day${state.daysPerSheet === 1 ? '' : 's'} on each sheet with orientation-aware wrapping.`);
        } else {
            messages.push('Individual mode prints one day per sheet.');
        }
    }

    if (model.warnings.length) {
        statusClass = model.errors.length ? 'is-error' : 'is-warning';
        messages.push(...model.warnings);
    }

    dom.statusBanner.className = `status-banner ${statusClass}`;
    dom.statusBanner.innerHTML = messages.map((message) => `<div>${escapeHtml(message)}</div>`).join('');
}

function renderStats(model) {
    const uniqueHours = formatHours(model.totalMinutes);
    const printedHours = formatHours(model.totalPrintedMinutes);
    const blocksPerDay = model.blocks.length;

    const cards = [
        { label: 'Planner days', value: String(model.uniqueDays.length) },
        { label: 'Printable pages', value: String(model.totalPages) },
        { label: 'Hours per day', value: formatHours(model.totalMinutesPerDay) },
        { label: 'Unique planned hours', value: uniqueHours },
        { label: 'Printed planned hours', value: printedHours },
        { label: 'Blocks per day', value: String(blocksPerDay) },
        { label: 'Guides per block', value: String(state.linesPerBlock) },
        { label: 'Line slots', value: model.totalLineSlots.toLocaleString() },
        { label: 'Copies', value: String(state.copies) }
    ];

    dom.statsGrid.innerHTML = cards.map((card) => `
        <div class="stat-card">
            <span class="label">${escapeHtml(card.label)}</span>
            <span class="value">${escapeHtml(card.value)}</span>
        </div>
    `).join('');
}

function renderPreview(model) {
    const paper = getPaperMetrics(state.paperSize, state.orientation);
    dom.previewStage.style.setProperty('--preview-scale', String(state.zoom));
    dom.previewStage.style.setProperty('--sheet-width', paper.width);
    dom.previewStage.style.setProperty('--sheet-height', paper.height);

    if (model.errors.length || !model.uniqueDays.length || !model.blocks.length) {
        dom.previewStage.innerHTML = `
            <div class="preview-empty">
                <h3>Preview waiting on valid input</h3>
                <p>Pick at least one weekday, ensure the time range produces rows, and complete any required date settings for the current date mode.</p>
            </div>
        `;
        return;
    }

    const compact = state.grouping === 'combined' || model.blocks.length > 24;
    const html = model.sheets.map((sheet) => renderSheet(sheet, model, compact)).join('');
    dom.previewStage.innerHTML = `<div class="preview-pages">${html}</div>`;
}

function renderSheet(sheet, model, compact) {
    const columns = getColumnCount(sheet.days.length);
    const dayRows = getGridRowCount(sheet.days.length, columns);
    const dayGridClass = columns > 1 ? 'joined' : 'single';
    const showSheetHeader = !state.minimalSheet && Boolean(state.title);
    const showSheetFooter = !state.minimalSheet && (Boolean(state.footerText) || state.signatureLines > 0);
    const rowHeight = computeRowHeight({
        blockCount: model.blocks.length,
        dayCount: sheet.days.length,
        columns,
        showSheetHeader,
        showSheetFooter,
        showDayDates: !state.minimalSheet && sheet.days.some((day) => Boolean(day.dateLabel))
    });
    const dayGridStyle = `grid-template-columns: repeat(${columns}, minmax(0, 1fr)); grid-template-rows: repeat(${dayRows}, minmax(0, 1fr)); --row-height:${rowHeight}in;`;
    const compactClass = compact ? 'compact' : '';
    const sheetClasses = [
        'planner-sheet',
        compactClass,
        state.minimalSheet ? 'is-writing-only' : '',
        !showSheetHeader ? 'no-header' : '',
        !showSheetFooter ? 'no-footer' : ''
    ].filter(Boolean).join(' ');
    const headerMarkup = showSheetHeader
        ? `
            <header class="planner-sheet__header">
                <div>
                    <h3 class="planner-sheet__title">${escapeHtml(state.title)}</h3>
                </div>
            </header>
        `
        : '';
    const footerMarkup = showSheetFooter
        ? `
            <footer class="planner-sheet__footer">
                <div class="planner-sheet__footer-left">${escapeHtml(state.footerText)}</div>
                <div class="planner-sheet__footer-right">
                    ${Array.from({ length: state.signatureLines }, () => '<div class="planner-sheet__footer-line"></div>').join('')}
                </div>
            </footer>
        `
        : '';

    return `
        <article class="${sheetClasses}">
            ${headerMarkup}
            <section class="planner-day-grid ${dayGridClass}" style="${dayGridStyle}">
                ${sheet.days.map((day) => renderDay(day, model.blocks)).join('')}
            </section>
            ${footerMarkup}
        </article>
    `;
}

function renderDay(day, blocks) {
    const dateMarkup = !state.minimalSheet && day.dateLabel
        ? `<div class="planner-day__date">${escapeHtml(day.dateLabel)}</div>`
        : '';

    const rows = blocks.map((block) => {
        const guideRows = Array.from({ length: state.linesPerBlock }, (_, index) => `
            <span class="planner-guide-line${state.showGridLines ? ' is-visible' : ''}${index === state.linesPerBlock - 1 ? ' is-last' : ''}"></span>
        `).join('');

        return `
            <div class="planner-row">
                <div class="planner-time ${block.isHourLabel ? 'is-hour' : 'is-minute'}" title="${escapeHtml(block.label)}">${escapeHtml(block.displayLabel)}</div>
                <div class="planner-write" style="grid-template-rows: repeat(${state.linesPerBlock}, minmax(0, 1fr));">
                    ${guideRows}
                </div>
            </div>
        `;
    }).join('');

    return `
        <section class="planner-day">
            <header class="planner-day__header">
                <h4 class="planner-day__title">${escapeHtml(day.title)}</h4>
                ${dateMarkup}
            </header>
            <div class="planner-rows">${rows}</div>
        </section>
    `;
}

function renderSavedPlans() {
    const savedPlans = loadSavedPlans();
    if (!savedPlans.length) {
        dom.savedPlansList.innerHTML = '<div class="saved-plan-empty">No saved planner configurations yet.</div>';
        return;
    }

    dom.savedPlansList.innerHTML = savedPlans.map((plan) => `
        <div class="saved-plan-item">
            <h3>${escapeHtml(plan.name)}</h3>
            <p class="saved-plan-meta">
                Saved ${escapeHtml(formatSavedAt(plan.savedAt))}<br>
                ${escapeHtml(plan.config.dateMode)} | ${escapeHtml(plan.config.startTime)}-${escapeHtml(plan.config.endTime)} | ${escapeHtml(plan.config.selectedDays.join(', ').toUpperCase())}
            </p>
            <div class="saved-plan-actions">
                <button class="tool-btn" type="button" data-action="load" data-plan-id="${escapeHtml(plan.id)}">Load</button>
                <button class="tool-btn danger" type="button" data-action="delete" data-plan-id="${escapeHtml(plan.id)}">Delete</button>
            </div>
        </div>
    `).join('');
}

function savePlan() {
    const savedPlans = loadSavedPlans();
    const name = state.saveName || state.title || 'Workweek Planner';
    const plan = {
        id: `${Date.now()}`,
        name,
        savedAt: new Date().toISOString(),
        config: serializeState()
    };

    const next = [plan, ...savedPlans].slice(0, MAX_SAVED_PLANS);
    if (!saveSavedPlans(next)) {
        return;
    }
    dom.saveNameInput.value = name;
    state.saveName = name;
    persistCurrentState();
    renderSavedPlans();
    setBannerMessage(`Saved "${name}" to local storage.`, 'is-info');
}

function loadSavedPlan(id) {
    const savedPlans = loadSavedPlans();
    const plan = savedPlans.find((entry) => entry.id === id);
    if (!plan) return;

    hydrateState(plan.config);
    applyStateToControls();
    persistCurrentState();
    render();
    setBannerMessage(`Loaded "${plan.name}".`, 'is-info');
}

function deleteSavedPlan(id) {
    const savedPlans = loadSavedPlans();
    const next = savedPlans.filter((entry) => entry.id !== id);
    if (!saveSavedPlans(next)) {
        return;
    }
    renderSavedPlans();
    setBannerMessage('Saved plan removed.', 'is-info');
}

function exportJson() {
    const payload = {
        exportedAt: new Date().toISOString(),
        tool: 'workweek-planner',
        config: serializeState()
    };
    downloadBlob(
        `${buildFilenameStem()}-config.json`,
        new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    );
}

function exportPdf() {
    printPlanner({
        bannerMessage: 'Print dialog opened. Use Save as PDF in the browser dialog.',
        invalidMessage: 'PDF export is unavailable until the planner configuration is valid.',
        documentTitle: `${buildFilenameStem()}.pdf`,
        restoreDocumentTitle: true
    });
}

function exportCsv() {
    const model = buildPlannerModel();
    if (model.errors.length || !model.uniqueDays.length || !model.blocks.length) {
        setBannerMessage('CSV export is unavailable until the planner configuration is valid.', 'is-error');
        return;
    }

    const rows = [['day_title', 'date_label', 'time_label', 'interval_minutes']];
    model.uniqueDays.forEach((day) => {
        model.blocks.forEach((block) => {
            rows.push([
                day.title,
                day.dateLabel || '',
                block.label,
                String(state.interval)
            ]);
        });
    });

    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n');
    downloadBlob(
        `${buildFilenameStem()}-timeline.csv`,
        new Blob([csv], { type: 'text/csv;charset=utf-8' })
    );
}

async function importPlan(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();
        const payload = JSON.parse(text);
        const config = payload?.config || payload;
        hydrateState(config);
        applyStateToControls();
        persistCurrentState();
        render();
        setBannerMessage(`Imported planner settings from ${file.name}.`, 'is-info');
    } catch (error) {
        console.error('Failed to import planner configuration', error);
        setBannerMessage('Import failed. Ensure the file contains a valid planner JSON export.', 'is-error');
    } finally {
        event.target.value = '';
    }
}

function resetState() {
    hydrateState({ ...DEFAULT_STATE, month: getCurrentMonthValue() });
    applyStateToControls();
    persistCurrentState();
    render();
}

function persistCurrentState() {
    try {
        localStorage.setItem(STORAGE_KEYS.current, JSON.stringify(serializeState()));
    } catch (error) {
        console.debug('Failed to persist current workweek planner state', error);
    }
}

function loadCurrentState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.current);
        if (!raw) {
            return sanitizeState(DEFAULT_STATE);
        }
        return sanitizeState(JSON.parse(raw));
    } catch (error) {
        console.debug('Failed to restore current workweek planner state', error);
        return sanitizeState(DEFAULT_STATE);
    }
}

function loadSavedPlans() {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.saved);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((entry) => entry && entry.id && entry.config) : [];
    } catch (error) {
        console.debug('Failed to load saved planner configurations', error);
        return [];
    }
}

function saveSavedPlans(plans) {
    try {
        localStorage.setItem(STORAGE_KEYS.saved, JSON.stringify(plans));
        return true;
    } catch (error) {
        console.debug('Failed to save planner configurations', error);
        setBannerMessage('Saving failed. localStorage may be unavailable or full.', 'is-error');
        return false;
    }
}

function serializeState() {
    return {
        title: state.title,
        selectionPreset: state.selectionPreset,
        selectedDays: state.selectedDays.slice(),
        dateMode: state.dateMode,
        rangeStart: state.rangeStart,
        rangeEnd: state.rangeEnd,
        month: state.month,
        durationPreset: state.durationPreset,
        startTime: state.startTime,
        endTime: state.endTime,
        interval: state.interval,
        zoom: state.zoom,
        grouping: state.grouping,
        daysPerSheet: state.daysPerSheet,
        copies: state.copies,
        orientation: state.orientation,
        paperSize: state.paperSize,
        saveName: state.saveName,
        footerText: state.footerText,
        signatureLines: state.signatureLines,
        minimalSheet: state.minimalSheet,
        showGridLines: state.showGridLines,
        linesPerBlock: state.linesPerBlock
    };
}

function hydrateState(nextState) {
    Object.assign(state, sanitizeState(nextState));
}

function sanitizeState(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const next = {
        ...DEFAULT_STATE,
        ...source
    };
    const isLegacySheetConfig = !Object.prototype.hasOwnProperty.call(source, 'minimalSheet');

    next.title = typeof next.title === 'string' ? next.title.slice(0, 80) : DEFAULT_STATE.title;
    if (isLegacySheetConfig && next.title === 'Workweek Planner') {
        next.title = '';
    }
    next.selectionPreset = ['workweek', 'fullweek', 'monwed', 'thusat', 'monthu', 'frisun', 'single', 'custom'].includes(next.selectionPreset)
        ? next.selectionPreset
        : DEFAULT_STATE.selectionPreset;
    next.selectedDays = Array.isArray(next.selectedDays)
        ? next.selectedDays.filter((dayId) => DAY_DEFS.some((day) => day.id === dayId))
        : DEFAULT_STATE.selectedDays.slice();
    if (!next.selectedDays.length) {
        next.selectedDays = DEFAULT_STATE.selectedDays.slice();
    }
    next.dateMode = ['generic', 'range', 'month'].includes(next.dateMode) ? next.dateMode : 'generic';
    next.rangeStart = typeof next.rangeStart === 'string' ? next.rangeStart : '';
    next.rangeEnd = typeof next.rangeEnd === 'string' ? next.rangeEnd : '';
    next.month = typeof next.month === 'string' && next.month ? next.month : getCurrentMonthValue();
    next.durationPreset = typeof next.durationPreset === 'string' ? next.durationPreset : 'custom';
    next.startTime = isValidTimeLabel(next.startTime) ? next.startTime : DEFAULT_STATE.startTime;
    next.endTime = isValidTimeLabel(next.endTime) ? next.endTime : DEFAULT_STATE.endTime;
    next.interval = clampNumber(parseInt(next.interval, 10), 15, 60, 15);
    next.zoom = clampFloat(parseFloat(next.zoom), 0.5, 1, 0.75);
    next.grouping = next.grouping === 'combined' ? 'combined' : 'individual';
    next.daysPerSheet = clampNumber(parseInt(next.daysPerSheet, 10), 2, 7, 4);
    next.copies = clampNumber(parseInt(next.copies, 10), 1, 10, 1);
    next.orientation = next.orientation === 'landscape' ? 'landscape' : 'portrait';
    next.paperSize = next.paperSize === 'a4' ? 'a4' : 'letter';
    next.saveName = typeof next.saveName === 'string' ? next.saveName : '';
    next.footerText = typeof next.footerText === 'string' ? next.footerText : '';
    next.signatureLines = clampNumber(parseInt(next.signatureLines, 10), 0, 5, 0);
    if (isLegacySheetConfig && next.signatureLines === 2) {
        next.signatureLines = 0;
    }
    next.minimalSheet = typeof next.minimalSheet === 'boolean' ? next.minimalSheet : DEFAULT_STATE.minimalSheet;
    next.showGridLines = Boolean(next.showGridLines);
    next.linesPerBlock = clampNumber(parseInt(next.linesPerBlock, 10), 2, 8, 4);
    return next;
}

function getSelectedDays() {
    return Array.from(dom.dayGrid.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
}

function updateDynamicPrintStyle() {
    const pageSize = state.paperSize === 'a4' ? 'A4' : 'Letter';
    const orientation = state.orientation === 'landscape' ? 'landscape' : 'portrait';
    dom.dynamicPrintStyle.textContent = `@page { size: ${pageSize} ${orientation}; margin: 0.22in; }`;
}

function getColumnCount(dayCount) {
    if (dayCount <= 1 || state.grouping === 'individual') return 1;
    if (state.orientation === 'portrait') {
        if (dayCount >= 5) return 3;
        return Math.min(2, dayCount);
    }
    if (dayCount >= 6) return 4;
    if (dayCount >= 4) return 3;
    return Math.min(3, dayCount);
}

function getGridRowCount(dayCount, columns) {
    return Math.max(1, Math.ceil(dayCount / Math.max(1, columns)));
}

function getPaperMetrics(paperSize, orientation) {
    const dimensions = {
        letter: {
            portrait: { width: '8.5in', height: '11in' },
            landscape: { width: '11in', height: '8.5in' }
        },
        a4: {
            portrait: { width: '210mm', height: '297mm' },
            landscape: { width: '297mm', height: '210mm' }
        }
    };
    return dimensions[paperSize]?.[orientation] || dimensions.letter.portrait;
}

function computeRowHeight({ blockCount, dayCount, columns, showSheetHeader, showSheetFooter, showDayDates }) {
    const pageHeight = state.paperSize === 'a4'
        ? (state.orientation === 'landscape' ? 8.27 : 11.69)
        : (state.orientation === 'landscape' ? 8.5 : 11);
    const dayRows = getGridRowCount(dayCount, columns);
    const sheetPadding = state.orientation === 'landscape' ? 0.24 : 0.28;
    const sheetHeaderHeight = showSheetHeader ? 0.48 : 0;
    const sheetFooterHeight = showSheetFooter ? 0.32 : 0;
    const perDayHeaderHeight = showDayDates ? 0.44 : 0.3;
    const dayRowOverhead = dayRows * perDayHeaderHeight;
    const rowBorderAllowance = Math.max(0, blockCount * 0.01);
    const usableHeight = Math.max(2.4, pageHeight - sheetPadding - sheetHeaderHeight - sheetFooterHeight - dayRowOverhead - rowBorderAllowance);
    const baseHeight = usableHeight / Math.max(1, dayRows * Math.max(1, blockCount));
    const minimum = state.grouping === 'combined' ? 0.075 : 0.12;
    const maximum = state.grouping === 'combined' ? 0.28 : 0.22;
    return Math.min(maximum, Math.max(minimum, baseHeight));
}

function buildFilenameStem() {
    const stem = (state.title || 'workweek-planner')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
    return stem || 'workweek-planner';
}

function printPlanner({
    bannerMessage = 'Print dialog opened.',
    invalidMessage = 'Printing is unavailable until the planner configuration is valid.',
    documentTitle = null,
    restoreDocumentTitle = false
} = {}) {
    const model = buildPlannerModel();
    if (model.errors.length || !model.uniqueDays.length || !model.blocks.length) {
        setBannerMessage(invalidMessage, 'is-error');
        return;
    }

    updateDynamicPrintStyle();

    const previousTitle = document.title;
    if (documentTitle) {
        document.title = documentTitle;
    }

    setBannerMessage(bannerMessage, 'is-info');
    window.print();

    if (restoreDocumentTitle && documentTitle) {
        window.setTimeout(() => {
            document.title = previousTitle;
        }, 500);
    }
}

function setBannerMessage(message, statusClass) {
    dom.statusBanner.className = `status-banner ${statusClass || 'is-info'}`;
    dom.statusBanner.innerHTML = `<div>${escapeHtml(message)}</div>`;
}

function formatHours(totalMinutes) {
    const hours = totalMinutes / 60;
    if (!Number.isFinite(hours)) return '0.0h';
    return `${hours.toFixed(hours % 1 === 0 ? 0 : 1)}h`;
}

function timeToMinutes(value) {
    const [hours, minutes] = String(value || '00:00').split(':').map((part) => parseInt(part, 10));
    return (hours * 60) + minutes;
}

function minutesToTimeLabel(value) {
    const normalized = ((value % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatCompactTimeLabel(value) {
    const normalized = ((value % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hours = Math.floor(normalized / 60);
    const minutes = normalized % 60;
    if (minutes === 0) {
        return {
            text: String(hours % 12 || 12),
            isHour: true
        };
    }
    return {
        text: String(minutes).padStart(2, '0'),
        isHour: false
    };
}

function inferDurationPreset(startTime, endTime) {
    let duration = timeToMinutes(endTime) - timeToMinutes(startTime);
    if (duration <= 0) duration += 24 * 60;
    const hours = duration / 60;
    const match = ['4h', '6h', '8h', '9h', '10h', '12h'].find((preset) => parseInt(preset, 10) === hours);
    return match || 'custom';
}

function parseDateInput(value) {
    if (!value) return null;
    const [year, month, day] = value.split('-').map((part) => parseInt(part, 10));
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function getInclusiveDateSpan(start, end) {
    const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    return Math.max(0, Math.floor((endUtc - startUtc) / 86400000) + 1);
}

function buildDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatSavedAt(value) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'recently';
    return `${DATE_FORMAT.format(parsed)} ${parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function csvEscape(value) {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function clampNumber(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

function clampFloat(value, min, max, fallback) {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function isValidTimeLabel(value) {
    return /^\d{2}:\d{2}$/.test(String(value || ''));
}

function getCurrentMonthValue() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
