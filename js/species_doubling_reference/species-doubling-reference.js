const SPECIES_DATA = [
    {
        id: "s-thermophilus",
        name: "S. thermophilus",
        behaviors: [
            { id: "st-36", label: "36C / pH 5.7 / td 55 min", tdMin: 55, tdLabel: "55 min", tempC: 36, tempLabel: "36C" },
            { id: "st-40", label: "40C / pH 6.5 / td 34 min", tdMin: 34, tdLabel: "34 min", tempC: 40, tempLabel: "40C" },
            { id: "st-44", label: "44C / pH 7.3 / td 38 min", tdMin: 38, tdLabel: "38 min", tempC: 44, tempLabel: "44C" }
        ]
    },
    {
        id: "l-bulgaricus",
        name: "L. bulgaricus",
        behaviors: [
            { id: "lb-42", label: "42C / MPL lactose / td 60 min", tdMin: 60, tdLabel: "60 min", tempC: 42, tempLabel: "42C" },
            { id: "lb-44", label: "44C / pH 5.7 / td 31-41 min (plot midpoint 36)", tdMin: 36, tdLabel: "31-41 min", tempC: 44, tempLabel: "44C" },
            { id: "lb-48", label: "48C / pH 4.9 / td 41 min", tdMin: 41, tdLabel: "41 min", tempC: 48, tempLabel: "48C" }
        ]
    },
    {
        id: "l-acidophilus",
        name: "L. acidophilus",
        behaviors: [
            { id: "la-lab", label: "Controlled culture / td 54 min", tdMin: 54, tdLabel: "54 min", tempC: 37, tempLabel: "37C" },
            { id: "la-dairy", label: "Dairy benchmark / td 60-150 min (plot midpoint 105)", tdMin: 105, tdLabel: "60-150 min", tempC: null, tempLabel: "37-42C range" }
        ]
    },
    {
        id: "l-reuteri",
        name: "L. reuteri",
        behaviors: [
            { id: "lr-mrs", label: "37C / MRS broth / td 130 min", tdMin: 130, tdLabel: "130 min", tempC: 37, tempLabel: "37C" },
            { id: "lr-ssf", label: "37C / SSF flour blend / td 58 min", tdMin: 58, tdLabel: "58 min", tempC: 37, tempLabel: "37C" }
        ]
    },
    {
        id: "l-rhamnosus",
        name: "L. rhamnosus",
        behaviors: [
            { id: "lrh-mrs", label: "37C / MRS broth / td 157 min", tdMin: 157, tdLabel: "157 min", tempC: 37, tempLabel: "37C" },
            { id: "lrh-ssf", label: "37C / SSF flour blend / td 85 min", tdMin: 85, tdLabel: "85 min", tempC: 37, tempLabel: "37C" }
        ]
    },
    {
        id: "l-plantarum",
        name: "L. plantarum",
        behaviors: [
            { id: "lp-mrs", label: "37C / MRS broth / td 124 min", tdMin: 124, tdLabel: "124 min", tempC: 37, tempLabel: "37C" },
            { id: "lp-ssf", label: "37C / SSF flour blend / td 82 min", tdMin: 82, tdLabel: "82 min", tempC: 37, tempLabel: "37C" }
        ]
    },
    {
        id: "l-casei-group",
        name: "L. casei / paracasei",
        behaviors: [
            { id: "lc-mrs", label: "37C / MRS broth / td 99 min", tdMin: 99, tdLabel: "99 min", tempC: 37, tempLabel: "37C" },
            { id: "lc-ssf", label: "37C / SSF flour blend / td 66 min", tdMin: 66, tdLabel: "66 min", tempC: 37, tempLabel: "37C" },
            { id: "lc-whey", label: "37C / whey + lactose / td 139 min (derived from mu max)", tdMin: 139, tdLabel: "~139 min", tempC: 37, tempLabel: "37C" }
        ]
    },
    {
        id: "b-lactis",
        name: "B. animalis subsp. lactis",
        behaviors: [
            { id: "bl-glucose", label: "37C / fortified MRS + glucose / td 104 min", tdMin: 104, tdLabel: "104 min", tempC: 37, tempLabel: "37C" },
            { id: "bl-lactose", label: "37C / fortified MRS + lactose / td 109 min", tdMin: 109, tdLabel: "109 min", tempC: 37, tempLabel: "37C" }
        ]
    },
    {
        id: "e-coli",
        name: "E. coli K-12",
        behaviors: [
            { id: "ec-rich", label: "37C / rich medium / td 20 min", tdMin: 20, tdLabel: "20 min", tempC: 37, tempLabel: "37C" }
        ]
    },
    {
        id: "listeria",
        name: "L. monocytogenes",
        behaviors: [
            { id: "lm-37", label: "37C / BHI / td 45-60 min (plot midpoint 53)", tdMin: 53, tdLabel: "45-60 min", tempC: 37, tempLabel: "37C" },
            { id: "lm-14", label: "14C / diluted BHI / td 12.4-19.9 h (plot midpoint 16.2 h)", tdMin: 969, tdLabel: "12.4-19.9 h", tempC: 14, tempLabel: "14C" }
        ]
    }
];

const COMPARE_LIMITS = {
    minRows: 2,
    maxRows: 6
};

const DEFAULT_COMPARE_ROWS = [
    { speciesId: "s-thermophilus", behaviorId: "st-40" },
    { speciesId: "l-bulgaricus", behaviorId: "lb-42" }
];

const DURATION_UNITS = {
    minutes: { label: "minutes", short: "min", multiplier: 1 },
    hours: { label: "hours", short: "h", multiplier: 60 },
    days: { label: "days", short: "d", multiplier: 1440 }
};

const DEFAULT_DURATION = Object.freeze({
    value: 12,
    unitKey: "hours"
});

const MIN_DURATION_VALUE = 0.1;
const LOG10_2 = Math.log10(2);

document.addEventListener("DOMContentLoaded", () => {
    initSearchAndFilter();
    initComparison();
});

function initSearchAndFilter() {
    const searchInput = document.querySelector("[data-species-search]");
    const searchWrapper = document.querySelector("[data-search-wrapper]");
    const clearButton = document.querySelector("[data-search-clear]");
    const resultCount = document.querySelector("[data-results-count]");
    const emptyState = document.querySelector("[data-empty-state]");
    const filterButtons = Array.from(document.querySelectorAll("[data-filter-button]"));
    const sections = Array.from(document.querySelectorAll("[data-species-section]"));
    const cards = Array.from(document.querySelectorAll("[data-species-card]"));

    if (!searchInput || !resultCount || cards.length === 0) {
        return;
    }

    let activeFilter = "all";

    const updateResults = () => {
        const query = searchInput.value.trim().toLowerCase();
        let visibleCards = 0;

        cards.forEach((card) => {
            const category = card.dataset.category || "";
            const matchesFilter = activeFilter === "all" || category === activeFilter;
            const haystack = card.textContent.toLowerCase();
            const matchesQuery = query === "" || haystack.includes(query);
            const isVisible = matchesFilter && matchesQuery;

            card.hidden = !isVisible;

            if (isVisible) {
                visibleCards += 1;
            }
        });

        sections.forEach((section) => {
            const sectionCards = section.querySelectorAll("[data-species-card]");
            const sectionVisible = Array.from(sectionCards).some((card) => !card.hidden);
            section.hidden = !sectionVisible;
        });

        if (searchWrapper) {
            searchWrapper.classList.toggle("has-value", query.length > 0);
        }

        resultCount.textContent = `Showing ${visibleCards} of ${cards.length} species`;
        emptyState.hidden = visibleCards !== 0;
    };

    filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
            activeFilter = button.dataset.filter || "all";

            filterButtons.forEach((candidate) => {
                const isActive = candidate === button;
                candidate.classList.toggle("active", isActive);
                candidate.setAttribute("aria-pressed", String(isActive));
            });

            updateResults();
        });
    });

    searchInput.addEventListener("input", updateResults);

    clearButton?.addEventListener("click", () => {
        searchInput.value = "";
        searchInput.focus();
        updateResults();
    });

    document.addEventListener("keydown", (event) => {
        const isTypingTarget =
            document.activeElement instanceof HTMLInputElement ||
            document.activeElement instanceof HTMLTextAreaElement ||
            document.activeElement?.isContentEditable;

        if (event.key === "/" && !isTypingTarget) {
            event.preventDefault();
            searchInput.focus();
        }
    });

    updateResults();
}

function initComparison() {
    const rowsContainer = document.querySelector("[data-compare-rows]");
    const addSpeciesButton = document.querySelector("[data-add-species]");
    const exportButton = document.querySelector("[data-export-plot]");
    const durationValueInput = document.querySelector("[data-compare-duration-value]");
    const durationUnitSelect = document.querySelector("[data-compare-duration-unit]");
    const statusLine = document.querySelector("[data-compare-status]");
    const tempWarning = document.querySelector("[data-temp-warning]");
    const tempWarningText = document.querySelector("[data-temp-warning-text]");
    const summaryCount = document.querySelector("[data-summary-count]");
    const summaryFastest = document.querySelector("[data-summary-fastest]");
    const summaryDominant = document.querySelector("[data-summary-dominant]");
    const summaryDeltaTemp = document.querySelector("[data-summary-delta-temp]");
    const legend = document.querySelector("[data-compare-legend]");
    const chart = document.querySelector("[data-compare-chart]");
    const compositionList = document.querySelector("[data-composition-list]");

    if (
        !rowsContainer ||
        !addSpeciesButton ||
        !exportButton ||
        !durationValueInput ||
        !durationUnitSelect ||
        !statusLine ||
        !tempWarning ||
        !tempWarningText ||
        !summaryCount ||
        !summaryFastest ||
        !summaryDominant ||
        !summaryDeltaTemp ||
        !legend ||
        !chart ||
        !compositionList
    ) {
        return;
    }

    let nextRowId = 0;

    function createCompareRow(speciesId, behaviorId = null) {
        const species = SPECIES_DATA.find((entry) => entry.id === speciesId) || SPECIES_DATA[0];
        const resolvedBehaviorId =
            behaviorId && species.behaviors.some((entry) => entry.id === behaviorId)
                ? behaviorId
                : species.behaviors[0].id;

        return {
            rowId: `compare-row-${nextRowId += 1}`,
            speciesId: species.id,
            behaviorId: resolvedBehaviorId
        };
    }

    const state = {
        rows: DEFAULT_COMPARE_ROWS.map((row) => createCompareRow(row.speciesId, row.behaviorId)),
        lastRendered: null
    };

    function syncRow(row) {
        const species = SPECIES_DATA.find((entry) => entry.id === row.speciesId) || SPECIES_DATA[0];
        row.speciesId = species.id;

        if (!species.behaviors.some((entry) => entry.id === row.behaviorId)) {
            row.behaviorId = species.behaviors[0].id;
        }
    }

    function buildSpeciesOptions(selectedSpeciesId) {
        return SPECIES_DATA.map((species) => {
            const selected = species.id === selectedSpeciesId ? " selected" : "";
            return `<option value="${species.id}"${selected}>${species.name}</option>`;
        }).join("");
    }

    function buildBehaviorOptions(speciesId, selectedBehaviorId) {
        const species = SPECIES_DATA.find((entry) => entry.id === speciesId) || SPECIES_DATA[0];
        return species.behaviors
            .map((behavior) => {
                const selected = behavior.id === selectedBehaviorId ? " selected" : "";
                return `<option value="${behavior.id}"${selected}>${behavior.label}</option>`;
            })
            .join("");
    }

    function renderRows() {
        rowsContainer.innerHTML = state.rows
            .map((row, index) => {
                syncRow(row);
                const removeDisabled = state.rows.length <= COMPARE_LIMITS.minRows ? " disabled" : "";

                return `
                    <div class="compare-row" data-row-id="${row.rowId}">
                        <label class="compare-field">
                            <span>Species ${index + 1}</span>
                            <select data-row-species="${row.rowId}">
                                ${buildSpeciesOptions(row.speciesId)}
                            </select>
                        </label>
                        <label class="compare-field">
                            <span>t_d behavior</span>
                            <select data-row-behavior="${row.rowId}">
                                ${buildBehaviorOptions(row.speciesId, row.behaviorId)}
                            </select>
                        </label>
                        <button type="button" class="compare-remove-button" data-row-remove="${row.rowId}"${removeDisabled}>Remove</button>
                    </div>
                `;
            })
            .join("");

        rowsContainer.querySelectorAll("[data-row-species]").forEach((element) => {
            element.addEventListener("change", (event) => {
                const row = state.rows.find((entry) => entry.rowId === event.currentTarget.dataset.rowSpecies);
                if (!row) {
                    return;
                }

                row.speciesId = event.currentTarget.value;
                syncRow(row);
                renderRows();
                renderComparison();
            });
        });

        rowsContainer.querySelectorAll("[data-row-behavior]").forEach((element) => {
            element.addEventListener("change", (event) => {
                const row = state.rows.find((entry) => entry.rowId === event.currentTarget.dataset.rowBehavior);
                if (!row) {
                    return;
                }

                row.behaviorId = event.currentTarget.value;
                renderComparison();
            });
        });

        rowsContainer.querySelectorAll("[data-row-remove]").forEach((element) => {
            element.addEventListener("click", (event) => {
                if (state.rows.length <= COMPARE_LIMITS.minRows) {
                    return;
                }

                const rowId = event.currentTarget.dataset.rowRemove;
                state.rows = state.rows.filter((entry) => entry.rowId !== rowId);
                renderRows();
                renderComparison();
            });
        });

        addSpeciesButton.disabled = state.rows.length >= COMPARE_LIMITS.maxRows;
    }

    function addSpeciesRow() {
        if (state.rows.length >= COMPARE_LIMITS.maxRows) {
            return;
        }

        const existingIds = new Set(state.rows.map((row) => row.speciesId));
        const fallbackSpecies = SPECIES_DATA.find((entry) => !existingIds.has(entry.id)) || SPECIES_DATA[0];
        state.rows.push(createCompareRow(fallbackSpecies.id));
        renderRows();
        renderComparison();
    }

    function getSelections() {
        return state.rows
            .map((row, index) => {
                syncRow(row);
                const selection = getSelection(row.speciesId, row.behaviorId);

                if (!selection) {
                    return null;
                }

                return {
                    rowId: row.rowId,
                    index,
                    species: selection.species,
                    behavior: selection.behavior
                };
            })
            .filter(Boolean);
    }

    function buildDuration(value, unitKey) {
        const resolvedUnitKey = DURATION_UNITS[unitKey] ? unitKey : DEFAULT_DURATION.unitKey;
        const unit = DURATION_UNITS[resolvedUnitKey];

        return {
            value,
            unitKey: resolvedUnitKey,
            unitLabel: unit.label,
            unitShort: unit.short,
            totalMinutes: value * unit.multiplier
        };
    }

    function getDurationState() {
        const unitKey = DURATION_UNITS[durationUnitSelect.value] ? durationUnitSelect.value : DEFAULT_DURATION.unitKey;
        const rawValue = durationValueInput.value.trim();
        const unit = DURATION_UNITS[unitKey];

        if (rawValue === "") {
            return {
                valid: false,
                message: `Enter a plot duration of at least ${formatNumber(MIN_DURATION_VALUE, 1)} ${unit.label}.`
            };
        }

        const value = Number.parseFloat(rawValue);

        if (!Number.isFinite(value) || value < MIN_DURATION_VALUE) {
            return {
                valid: false,
                message: `Enter a plot duration of at least ${formatNumber(MIN_DURATION_VALUE, 1)} ${unit.label}.`
            };
        }

        return {
            valid: true,
            duration: buildDuration(value, unitKey)
        };
    }

    function setStatusMessage(message, isWarning = false) {
        statusLine.textContent = message;
        statusLine.classList.toggle("is-warning", isWarning);
    }

    function clearTempWarning() {
        tempWarning.hidden = true;
        tempWarningText.textContent = "";
    }

    function renderComparison() {
        const durationState = getDurationState();
        const selections = getSelections();

        if (!durationState.valid) {
            const lastDuration = state.lastRendered?.duration || buildDuration(DEFAULT_DURATION.value, DEFAULT_DURATION.unitKey);
            durationValueInput.setAttribute("aria-invalid", "true");
            exportButton.disabled = true;
            clearTempWarning();
            setStatusMessage(
                `${durationState.message} Export is disabled until the duration is valid. Plot remains at the last valid duration (${formatDurationLabel(lastDuration)}).`,
                true
            );
            return;
        }

        durationValueInput.setAttribute("aria-invalid", "false");
        exportButton.disabled = false;

        const duration = durationState.duration;
        const palette = getSeriesPalette();
        const results = selections.map((entry, index) => {
            const doublings = duration.totalMinutes / entry.behavior.tdMin;

            return {
                ...entry,
                color: palette[index % palette.length],
                doublings
            };
        });

        const maxDoublings = results.length > 0 ? Math.max(...results.map((entry) => entry.doublings)) : 0;
        const totalRelativeWeight = results.reduce((sum, entry) => {
            const endpointWeight = 2 ** (entry.doublings - maxDoublings);
            entry.endpointWeight = endpointWeight;
            return sum + endpointWeight;
        }, 0);

        results.forEach((entry) => {
            entry.normalizedSharePercent = totalRelativeWeight > 0 ? (entry.endpointWeight / totalRelativeWeight) * 100 : 0;
        });

        const fastest = results.reduce((best, entry) => {
            if (!best || entry.behavior.tdMin < best.behavior.tdMin) {
                return entry;
            }

            return best;
        }, null);

        const dominant = results.reduce((best, entry) => {
            if (!best || entry.normalizedSharePercent > best.normalizedSharePercent) {
                return entry;
            }

            return best;
        }, null);

        const numericTemps = results.filter((entry) => typeof entry.behavior.tempC === "number").map((entry) => entry.behavior.tempC);
        const tempSpread = numericTemps.length >= 2 ? Math.max(...numericTemps) - Math.min(...numericTemps) : null;
        const unknownTempCount = results.length - numericTemps.length;

        summaryCount.textContent = String(results.length);
        summaryFastest.textContent = fastest ? `${fastest.species.name} (${fastest.behavior.tdLabel})` : "n/a";
        summaryDominant.textContent = dominant ? `${dominant.species.name} ${formatNumber(dominant.normalizedSharePercent, 1)}%` : "n/a";
        summaryDeltaTemp.textContent = tempSpread == null ? "n/a" : `${formatNumber(tempSpread, 1)}C`;

        let statusMessage = `Plotting ${results.length} species over ${formatDurationLabel(duration)} from the same normalized starting abundance using mono-culture t_d references only. Normalized endpoint share below rescales each row's independent fold change and does not model cofermentation, protocooperation, or symbiotic acceleration.`;

        if (unknownTempCount > 0) {
            statusMessage += ` Temperature spread uses ${numericTemps.length} of ${results.length} selections because ${unknownTempCount} behavior${unknownTempCount === 1 ? " uses" : " use"} a range or non-standardized temperature span.`;
        }

        if (state.rows.length >= COMPARE_LIMITS.maxRows) {
            statusMessage += " Maximum comparison size reached.";
        }

        setStatusMessage(statusMessage);

        if (tempSpread != null && tempSpread > 2) {
            const minTemp = Math.min(...numericTemps);
            const maxTemp = Math.max(...numericTemps);
            tempWarning.hidden = false;
            tempWarningText.textContent = `Numeric test conditions span ${formatNumber(minTemp, 1)}C to ${formatNumber(maxTemp, 1)}C, for a spread of ${formatNumber(tempSpread, 1)}C across the selected species.`;
        } else {
            clearTempWarning();
        }

        renderLegend(legend, results);
        renderChart(chart, results, duration);
        renderComposition(compositionList, results);
        state.lastRendered = {
            duration,
            results,
            tempSpread,
            unknownTempCount,
            fastest,
            dominant
        };
    }

    addSpeciesButton.addEventListener("click", addSpeciesRow);
    exportButton.addEventListener("click", () => {
        exportPlot(chart, state.lastRendered);
    });
    durationValueInput.addEventListener("input", renderComparison);
    durationValueInput.addEventListener("change", renderComparison);
    durationUnitSelect.addEventListener("change", renderComparison);

    const themeObserver = new MutationObserver(() => {
        renderComparison();
    });

    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"]
    });

    renderRows();
    renderComparison();
}

function getSelection(speciesId, behaviorId) {
    const species = SPECIES_DATA.find((entry) => entry.id === speciesId);
    if (!species) {
        return null;
    }

    const behavior = species.behaviors.find((entry) => entry.id === behaviorId) || species.behaviors[0];
    return { species, behavior };
}

function renderLegend(container, results) {
    container.innerHTML = results
        .map((entry) => {
            return `
                <div class="compare-legend-item">
                    <span class="compare-legend-swatch" style="background:${entry.color}"></span>
                    <span>${entry.species.name}: ${entry.behavior.tdLabel}, ${entry.behavior.tempLabel}</span>
                    <span class="compare-legend-meta">(${formatNumber(entry.doublings, 2)} doublings, ${formatNumber(entry.normalizedSharePercent, 1)}% share)</span>
                </div>
            `;
        })
        .join("");
}

function renderChart(svg, results, duration) {
    const width = 760;
    const height = 360;
    const padding = { top: 22, right: 28, bottom: 48, left: 64 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const maxDoublings = Math.max(...results.map((entry) => entry.doublings), 1);
    const yMax = Math.max(Math.ceil(maxDoublings), 1);
    const yTicks = buildTicks(0, yMax, 6);
    const xTicks = buildTicks(0, duration.value, 6);
    const gridColor = getCssVariable("--border-color");
    const labelColor = getCssVariable("--text-muted");
    const backgroundColor = getCssVariable("--bg-card");

    const buildPath = (tdMin) => {
        const steps = 96;
        const points = [];

        for (let index = 0; index <= steps; index += 1) {
            const ratio = index / steps;
            const elapsedMinutes = duration.totalMinutes * ratio;
            const doublings = elapsedMinutes / tdMin;
            const x = padding.left + ratio * plotWidth;
            const y = padding.top + plotHeight - (doublings / yMax) * plotHeight;
            points.push(`${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`);
        }

        return points.join(" ");
    };

    const endPoint = (doublings) => ({
        x: padding.left + plotWidth,
        y: padding.top + plotHeight - (doublings / yMax) * plotHeight
    });

    const gridLinesX = xTicks
        .map((tick) => {
            const ratio = duration.value === 0 ? 0 : tick / duration.value;
            const x = padding.left + ratio * plotWidth;
            return `<line x1="${x}" y1="${padding.top}" x2="${x}" y2="${padding.top + plotHeight}" stroke="${gridColor}" stroke-width="1" opacity="0.7"></line>`;
        })
        .join("");

    const gridLinesY = yTicks
        .map((tick) => {
            const y = padding.top + plotHeight - (tick / yMax) * plotHeight;
            return `<line x1="${padding.left}" y1="${y}" x2="${padding.left + plotWidth}" y2="${y}" stroke="${gridColor}" stroke-width="1" opacity="0.7"></line>`;
        })
        .join("");

    const xLabels = xTicks
        .map((tick) => {
            const ratio = duration.value === 0 ? 0 : tick / duration.value;
            const x = padding.left + ratio * plotWidth;
            return `<text x="${x}" y="${height - 18}" text-anchor="middle" fill="${labelColor}" font-family="JetBrains Mono, monospace" font-size="11">${formatAxisNumber(tick)}</text>`;
        })
        .join("");

    const yLabels = yTicks
        .map((tick) => {
            const y = padding.top + plotHeight - (tick / yMax) * plotHeight + 4;
            return `<text x="${padding.left - 12}" y="${y}" text-anchor="end" fill="${labelColor}" font-family="JetBrains Mono, monospace" font-size="11">${formatAxisNumber(tick)}</text>`;
        })
        .join("");

    const seriesMarkup = results
        .map((entry) => {
            const endpoint = endPoint(entry.doublings);
            return `
                <path d="${buildPath(entry.behavior.tdMin)}" fill="none" stroke="${entry.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>
                <circle cx="${endpoint.x}" cy="${endpoint.y}" r="5" fill="${entry.color}" stroke="${backgroundColor}" stroke-width="2"></circle>
            `;
        })
        .join("");

    svg.innerHTML = `
        <rect x="0" y="0" width="${width}" height="${height}" fill="${backgroundColor}" rx="14" ry="14"></rect>
        ${gridLinesX}
        ${gridLinesY}
        <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotHeight}" stroke="${gridColor}" stroke-width="1"></line>
        <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${padding.left + plotWidth}" y2="${padding.top + plotHeight}" stroke="${gridColor}" stroke-width="1"></line>
        <text x="${padding.left}" y="14" text-anchor="start" fill="${labelColor}" font-family="JetBrains Mono, monospace" font-size="11">Doublings from baseline</text>
        <text x="${padding.left + plotWidth}" y="${height - 18}" text-anchor="end" fill="${labelColor}" font-family="JetBrains Mono, monospace" font-size="11">Time (${duration.unitShort})</text>
        ${xLabels}
        ${yLabels}
        ${seriesMarkup}
    `;
}

function renderComposition(container, results) {
    container.innerHTML = [...results]
        .sort((left, right) => right.normalizedSharePercent - left.normalizedSharePercent)
        .map((entry) => {
            return `
                <div class="composition-item">
                    <div class="composition-topline">
                        <div class="composition-name">
                            <span class="composition-swatch" style="background:${entry.color}"></span>
                            <span>${entry.species.name}</span>
                        </div>
                        <span class="composition-percent">${formatNumber(entry.normalizedSharePercent, 1)}%</span>
                    </div>
                    <div class="composition-bar">
                        <div class="composition-bar-fill" style="width:${entry.normalizedSharePercent}%; background:${entry.color};"></div>
                    </div>
                    <div class="composition-meta">${entry.behavior.tdLabel}, ${entry.behavior.tempLabel}, ${formatNumber(entry.doublings, 2)} doublings, ${formatFoldFromDoublings(entry.doublings)} fold vs baseline</div>
                </div>
            `;
        })
        .join("");
}

function exportPlot(svg, rendered) {
    if (!svg || !rendered || rendered.results.length === 0) {
        return;
    }

    const clone = svg.cloneNode(true);
    clone.removeAttribute("class");
    clone.removeAttribute("role");
    clone.removeAttribute("aria-labelledby");
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("x", "24");
    clone.setAttribute("y", "74");
    clone.setAttribute("width", "760");
    clone.setAttribute("height", "360");

    const rankedResults = [...rendered.results].sort((left, right) => right.normalizedSharePercent - left.normalizedSharePercent);
    const legendTop = 468;
    const detailLineHeight = 22;
    const footerTop = legendTop + 28 + rankedResults.length * detailLineHeight;
    const footnotes = [
        "Normalized endpoint share is a mono-culture rescale, not mixed-culture composition.",
        rendered.tempSpread != null && rendered.tempSpread > 2
            ? `Delta Temp > 2C warning: numeric conditions span ${formatNumber(Math.min(...rendered.results.filter((entry) => typeof entry.behavior.tempC === "number").map((entry) => entry.behavior.tempC)), 1)}C to ${formatNumber(Math.max(...rendered.results.filter((entry) => typeof entry.behavior.tempC === "number").map((entry) => entry.behavior.tempC)), 1)}C.`
            : null,
        rendered.unknownTempCount > 0
            ? `Numeric temperature spread excludes ${rendered.unknownTempCount} selection${rendered.unknownTempCount === 1 ? "" : "s"} with a range or non-standardized span.`
            : null
    ].filter(Boolean);
    const footerLineHeight = 18;
    const exportHeight = footerTop + 12 + footnotes.length * footerLineHeight + 24;
    const textPrimary = getCssVariable("--text-primary") || "#111827";
    const textMuted = getCssVariable("--text-muted") || "#6b7280";
    const borderColor = getCssVariable("--border-color") || "#d1d5db";
    const cardColor = getCssVariable("--bg-card") || "#ffffff";
    const serializer = new XMLSerializer();
    const chartMarkup = serializer.serializeToString(clone);
    const detailMarkup = rankedResults
        .map((entry, index) => {
            const y = legendTop + index * detailLineHeight;
            return `
                <circle cx="32" cy="${y - 4}" r="5" fill="${entry.color}"></circle>
                <text x="46" y="${y}" fill="${textPrimary}" font-family="JetBrains Mono, monospace" font-size="12">${escapeSvgText(`${entry.species.name} | ${entry.behavior.tdLabel} | ${entry.behavior.tempLabel} | ${formatNumber(entry.normalizedSharePercent, 1)}% | ${formatNumber(entry.doublings, 2)} dbl | ${formatFoldFromDoublings(entry.doublings)}x`)}</text>
            `;
        })
        .join("");
    const footnoteMarkup = footnotes
        .map((line, index) => {
            const y = footerTop + 12 + index * footerLineHeight;
            return `<text x="24" y="${y}" fill="${textMuted}" font-family="JetBrains Mono, monospace" font-size="11">${escapeSvgText(line)}</text>`;
        })
        .join("");
    const tempSpreadLabel = rendered.tempSpread == null ? "n/a" : `${formatNumber(rendered.tempSpread, 1)}C`;
    const dominantLabel = rendered.dominant
        ? `${rendered.dominant.species.name} ${formatNumber(rendered.dominant.normalizedSharePercent, 1)}%`
        : "n/a";
    const fastestLabel = rendered.fastest
        ? `${rendered.fastest.species.name} (${rendered.fastest.behavior.tdLabel})`
        : "n/a";
    const svgMarkup = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="808" height="${exportHeight}" viewBox="0 0 808 ${exportHeight}">
    <rect x="0" y="0" width="808" height="${exportHeight}" fill="${cardColor}" />
    <text x="24" y="30" fill="${textPrimary}" font-family="JetBrains Mono, monospace" font-size="20" font-weight="700">Species Doubling Comparison</text>
    <text x="24" y="50" fill="${textMuted}" font-family="JetBrains Mono, monospace" font-size="11">${escapeSvgText(`${formatDurationLabel(rendered.duration)} | equal starting abundance | mono-culture overlay only`)}</text>
    <text x="24" y="66" fill="${textMuted}" font-family="JetBrains Mono, monospace" font-size="11">${escapeSvgText(`Fastest t_d: ${fastestLabel} | Largest normalized share: ${dominantLabel} | Temperature spread: ${tempSpreadLabel}`)}</text>
    ${chartMarkup}
    <line x1="24" y1="448" x2="784" y2="448" stroke="${borderColor}" stroke-width="1" />
    <text x="24" y="462" fill="${textPrimary}" font-family="JetBrains Mono, monospace" font-size="12" font-weight="700">Legend / normalized endpoint share</text>
    ${detailMarkup}
    ${footnoteMarkup}
</svg>`;
    const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const durationFragment = `${formatNumber(rendered.duration.value, 2)}${rendered.duration.unitShort}`.replace(/[^a-zA-Z0-9.-]/g, "");

    link.href = url;
    link.download = `species-doubling-plot-${durationFragment}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
        URL.revokeObjectURL(url);
    }, 1000);
}

function buildTicks(min, max, targetCount) {
    if (max <= min) {
        return [min];
    }

    const step = (max - min) / Math.max(targetCount, 1);
    const ticks = [];

    for (let index = 0; index <= targetCount; index += 1) {
        ticks.push(min + step * index);
    }

    return ticks;
}

function getSeriesPalette() {
    return [
        getCssVariable("--accent-it"),
        getCssVariable("--accent-biochemical"),
        getCssVariable("--accent-success"),
        getCssVariable("--accent-warning"),
        getCssVariable("--accent-general"),
        "#ef4444"
    ];
}

function getCssVariable(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function formatAxisNumber(value) {
    if (!Number.isFinite(value)) {
        return "0";
    }

    if (Math.abs(value) >= 10) {
        return formatNumber(value, 0);
    }

    if (Math.abs(value) >= 1) {
        return formatNumber(value, 1);
    }

    return formatNumber(value, 2);
}

function formatNumber(value, decimals) {
    return Number(value).toFixed(decimals).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function formatDurationLabel(duration) {
    return `${formatNumber(duration.value, 2)} ${duration.unitLabel}`;
}

function formatFoldFromDoublings(doublings) {
    if (!Number.isFinite(doublings) || doublings < 0) {
        return "n/a";
    }

    const log10Fold = doublings * LOG10_2;

    if (log10Fold >= 5) {
        return `~10^${formatNumber(log10Fold, 2)}`;
    }

    return formatNumber(2 ** doublings, 2);
}

function escapeSvgText(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
