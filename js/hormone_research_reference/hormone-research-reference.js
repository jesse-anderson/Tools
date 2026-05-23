const DISCLAIMER_COMPACT = [
    "Experimental research reference only. Not medical advice.",
    "Filter selections reflect source-table slices only; this page does not interpret personal lab values.",
    "Source papers, method documents, lab reports, and qualified clinical care are the ground truth.",
    "No warranty. No liability. No suitability claim. You assume all risk."
].join(" ");

const DATA_FILES = {
    serumRows: "../data/hormone_research_reference/serum_reference_phase_table.csv",
    cycleRows: "../data/hormone_research_reference/serum_cycle_profile.csv",
    productionFemaleRows: "../data/hormone_research_reference/production_rates_female_cycle.csv",
    productionMaleRows: "../data/hormone_research_reference/production_rates_male.csv",
    sourceRegistry: "../data/hormone_research_reference/source_registry.json"
};

const FREE_TESTOSTERONE_WARNINGS = [
    {
        text: "Equilibrium dialysis with LC-MS/MS quantitation of dialysate is the measured-method anchor in the current reviewed rows. Calculated free testosterone, analog free testosterone, and free androgen index are separate method categories.",
        sourceIds: [
            "endotext_lab_testicular_function",
            "jcem_2026_walravens_measured_free_testosterone"
        ]
    },
    {
        text: "Calculated free testosterone depends on SHBG accuracy and binding constants. It must stay method-labeled and separate from measured equilibrium-dialysis rows.",
        sourceIds: ["jcem_1999_vermeulen_free_testosterone_estimation"]
    },
    {
        text: "Analog direct free testosterone assays can drift with SHBG and protein binding; treat them as a different measurement category, not a substitute.",
        sourceIds: ["endotext_lab_testicular_function"]
    }
];

const REVIEW_GATES = [
    "Only reviewed display rows are shown.",
    "Every numerical row includes a citation, method, specimen, units, and caveat text.",
    "CDC/NHANES harmonization rows are kept out of the display tables.",
    "Cycle profiles label source-reported population spread, not personal prediction.",
    "Production-rate rows render in their own table and stay visually separate from serum/plasma concentrations.",
    "Rendered source IDs link to DOI, PubMed Central, NCBI Bookshelf, or comparable source registry URLs when available.",
    "Copied summaries carry the compact disclaimer."
];

const AUDIT_ROWS = [
    {
        area: "Ground truth hierarchy",
        status: "Required",
        source: "Published papers, method documents, lab reports, and qualified clinical care override this page."
    },
    {
        area: "Serum/plasma reference rows",
        status: "Active",
        source: "Serum/plasma tables show only rows selected for display after source review."
    },
    {
        area: "Cycle profile rows",
        status: "Active",
        source: "Frederiksen supplement cycle-day buckets load as population percentile rows, not predictions.",
        sourceIds: ["jcem_2020_frederiksen_estrogen_lcms_supplement"]
    },
    {
        area: "Daily production",
        status: "Active",
        source: "Production-rate tables show only selected rows and remain separate from blood concentration.",
        sourceIds: [
            "endotext_androgen_physiology",
            "jci_1966_little_tait_progesterone_mcr_males"
        ]
    },
    {
        area: "Free testosterone",
        status: "Method-labeled",
        source: "Measured equilibrium-dialysis rows stay separate from calculated and analog free testosterone.",
        sourceIds: [
            "jcem_2026_walravens_measured_free_testosterone",
            "jcem_1999_vermeulen_free_testosterone_estimation",
            "endotext_lab_testicular_function"
        ]
    },
    {
        area: "Advanced metabolites",
        status: "Source-specific",
        source: "3-alpha-diol-G, androsterone, and backdoor-pathway rows remain advanced source-specific context.",
        sourceIds: [
            "steroids_2019_fabregat_3alpha_diol_g_lcms",
            "cca_2026_liu_backdoor_pathway_steroids_lcms",
            "ejendo_2024_adriaansen_pediatric_11oxygenated_androgens"
        ]
    }
];

const CYCLE_PHASE_ORDER = [
    "cycle_days_1_to_7",
    "cycle_days_8_to_14",
    "cycle_days_15_plus_all",
    "cycle_days_15_plus_ovulation_confirmed"
];

const DEFAULT_FORM = {
    analyteSelect: "testosterone_total",
    sourceContext: "all",
    cyclePhase: "all",
    assayMethod: "all",
    referenceView: "phase"
};

const elements = {};
const state = {
    serumRows: [],
    cycleRows: [],
    productionRows: [],
    registry: [],
    registryById: new Map(),
    activeView: "phase",
    loaded: false
};

document.addEventListener("DOMContentLoaded", () => {
    bindElements();
    initializeDisclaimerSplash();
    renderReviewGates();
    renderSourceAudit();
    bindEvents();
    renderLoadingState();
    loadReferenceData();
});

function bindElements() {
    [
        "referenceFilterForm",
        "resetBtn",
        "copySummaryBtn",
        "statusLine",
        "analyteSelect",
        "sourceContext",
        "cyclePhase",
        "assayMethod",
        "referenceView",
        "serumReferenceStatus",
        "productionStatus",
        "cycleStatus",
        "phaseTableBody",
        "cycleProfileTableBody",
        "productionTableBody",
        "reviewGateList",
        "sourceAuditBody",
        "cycleProfileChart",
        "disclaimerSplash",
        "disclaimerAcknowledge",
        "disclaimerContinueBtn",
        "analyteWarningBlock",
        "viewSourcesBtn",
        "sourcesModal",
        "sourcesModalBody",
        "closeSourcesBtn",
        "resultIntro"
    ].forEach((id) => {
        elements[id] = document.getElementById(id);
    });
}

function initializeDisclaimerSplash() {
    if (!elements.disclaimerSplash) return;

    document.body.classList.add("splash-active");
    elements.disclaimerAcknowledge?.addEventListener("change", () => {
        elements.disclaimerContinueBtn.disabled = !elements.disclaimerAcknowledge.checked;
    });
    elements.disclaimerContinueBtn?.addEventListener("click", dismissDisclaimerSplash);

    elements.disclaimerSplash.addEventListener("keydown", handleSplashKeydown);
    document.addEventListener("focusin", enforceSplashFocus);
    window.requestAnimationFrame(() => {
        elements.disclaimerAcknowledge?.focus();
    });
}

function handleSplashKeydown(event) {
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return;
    }
    if (event.key !== "Tab") return;

    const focusables = getSplashFocusables();
    if (focusables.length === 0) {
        event.preventDefault();
        return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
    }
}

function enforceSplashFocus(event) {
    const splash = elements.disclaimerSplash;
    if (!splash || splash.hidden) return;
    if (splash.contains(event.target)) return;
    event.stopPropagation();
    const focusables = getSplashFocusables();
    (focusables[0] || splash).focus();
}

function getSplashFocusables() {
    const splash = elements.disclaimerSplash;
    if (!splash) return [];
    const nodes = splash.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    return Array.from(nodes).filter((node) => node.offsetParent !== null || node === document.activeElement);
}

function dismissDisclaimerSplash() {
    if (!elements.disclaimerAcknowledge?.checked) return;

    elements.disclaimerSplash.hidden = true;
    document.body.classList.remove("splash-active");
    document.removeEventListener("focusin", enforceSplashFocus);
    elements.disclaimerSplash.removeEventListener("keydown", handleSplashKeydown);

    const appRoot = document.getElementById("appRoot");
    if (appRoot) {
        appRoot.removeAttribute("inert");
        appRoot.removeAttribute("aria-hidden");
    }
    elements.referenceFilterForm?.querySelector("select, button, input")?.focus();
}

function bindEvents() {
    elements.referenceFilterForm?.addEventListener("change", () => {
        if (elements.referenceView?.value !== state.activeView) {
            setActiveView(elements.referenceView.value);
        }
        renderActiveData();
    });
    elements.analyteSelect?.addEventListener("change", updateAnalyteWarning);
    elements.resetBtn?.addEventListener("click", resetForm);
    elements.copySummaryBtn?.addEventListener("click", copySummary);

    document.querySelectorAll("[data-view]").forEach((button) => {
        button.addEventListener("click", () => {
            setActiveView(button.dataset.view);
            renderActiveData();
        });
    });

    elements.viewSourcesBtn?.addEventListener("click", openSourcesModal);
    elements.closeSourcesBtn?.addEventListener("click", closeSourcesModal);
    elements.sourcesModal?.addEventListener("click", (event) => {
        if (event.target === elements.sourcesModal) closeSourcesModal();
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && elements.sourcesModal && !elements.sourcesModal.hidden) {
            closeSourcesModal();
        }
    });
}

function renderLoadingState() {
    elements.statusLine.textContent = "Loading reviewed reference rows from local data files...";
    elements.serumReferenceStatus.textContent = "Loading";
    elements.cycleStatus.textContent = "Loading";
    elements.productionStatus.textContent = "Loading";
    renderMessageRow(elements.phaseTableBody, 7, "Loading reviewed serum/plasma rows...");
    renderMessageRow(elements.productionTableBody, 6, "Loading daily production rows...");
    renderCyclePlaceholder("Loading reviewed cycle profile rows...");
}

async function loadReferenceData() {
    try {
        const [serumText, cycleText, productionFemaleText, productionMaleText, registry] = await Promise.all([
            fetchText(DATA_FILES.serumRows),
            fetchText(DATA_FILES.cycleRows),
            fetchText(DATA_FILES.productionFemaleRows),
            fetchText(DATA_FILES.productionMaleRows),
            fetchJson(DATA_FILES.sourceRegistry)
        ]);

        state.serumRows = parseCsv(serumText).filter((row) => row.display_allowed === "true");
        state.cycleRows = parseCsv(cycleText).filter((row) => row.display_allowed === "true");
        state.productionRows = [
            ...parseCsv(productionFemaleText),
            ...parseCsv(productionMaleText)
        ].filter((row) => row.display_allowed === "true");
        state.registry = registry;
        state.registryById = new Map(registry.map((source) => [source.source_id, source]));
        state.loaded = true;

        renderSourceAudit();
        populateFilters();
        setActiveView("phase");
        renderActiveData();
        updateAnalyteWarning();
    } catch (error) {
        renderLoadError(error);
    }
}

async function fetchText(path) {
    const response = await fetch(new URL(path, window.location.href));
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
    return response.text();
}

async function fetchJson(path) {
    const response = await fetch(new URL(path, window.location.href));
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
    return response.json();
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === "," && !inQuotes) {
            row.push(cell);
            cell = "";
            continue;
        }

        if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && next === "\n") index += 1;
            row.push(cell);
            if (row.some((value) => value !== "")) rows.push(row);
            row = [];
            cell = "";
            continue;
        }

        cell += char;
    }

    row.push(cell);
    if (row.some((value) => value !== "")) rows.push(row);
    if (rows.length === 0) return [];

    const headers = rows[0].map((header) => header.trim());
    return rows.slice(1).map((values) => Object.fromEntries(
        headers.map((header, index) => [header, values[index] ?? ""])
    ));
}

function populateFilters() {
    populateSelect(elements.analyteSelect, buildAnalyteOptions(), DEFAULT_FORM.analyteSelect);
    populateSelect(elements.sourceContext, [
        { value: "all", label: "All contexts" },
        ...distinctOptions([...state.serumRows, ...state.productionRows], "sex_context")
    ], DEFAULT_FORM.sourceContext);
    populateSelect(elements.cyclePhase, [
        { value: "all", label: "All phases/timing" },
        ...buildTimingOptions()
    ], DEFAULT_FORM.cyclePhase);
    populateSelect(elements.assayMethod, [
        { value: "all", label: "All methods" },
        ...distinctOptions([...state.serumRows, ...state.productionRows], "assay_method")
    ], DEFAULT_FORM.assayMethod);
    populateSelect(elements.referenceView, [
        { value: "phase", label: "Serum/plasma reference rows" },
        { value: "chart", label: "Cycle profile rows" },
        { value: "production", label: "Production-rate context" }
    ], DEFAULT_FORM.referenceView);
}

function buildAnalyteOptions() {
    const byId = new Map();
    [...state.serumRows, ...state.cycleRows, ...state.productionRows].forEach((row) => {
        if (!row.analyte_id || byId.has(row.analyte_id)) return;
        byId.set(row.analyte_id, {
            value: row.analyte_id,
            label: row.display_name || formatToken(row.analyte_id)
        });
    });
    return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function buildTimingOptions() {
    const values = new Set();
    [...state.serumRows, ...state.cycleRows, ...state.productionRows].forEach((row) => {
        const timing = getTimingContext(row);
        if (timing) values.add(timing);
    });
    return Array.from(values)
        .sort((a, b) => formatToken(a).localeCompare(formatToken(b)))
        .map((value) => ({ value, label: formatToken(value) }));
}

function distinctOptions(rows, field) {
    return Array.from(new Set(rows.map((row) => row[field]).filter(Boolean)))
        .sort((a, b) => formatToken(a).localeCompare(formatToken(b)))
        .map((value) => ({ value, label: formatToken(value) }));
}

function populateSelect(select, options, preferredValue) {
    if (!select) return;
    const previous = select.value || preferredValue;
    select.replaceChildren();
    options.forEach((option) => {
        const node = document.createElement("option");
        node.value = option.value;
        node.textContent = option.label;
        select.appendChild(node);
    });

    if (options.some((option) => option.value === previous)) {
        select.value = previous;
    } else if (options.some((option) => option.value === preferredValue)) {
        select.value = preferredValue;
    } else if (options.length) {
        select.value = options[0].value;
    }
}

function resetForm() {
    Object.entries(DEFAULT_FORM).forEach(([id, value]) => {
        if (elements[id]) elements[id].value = value;
    });
    setActiveView(DEFAULT_FORM.referenceView);
    renderActiveData();
    updateAnalyteWarning();
}

function setActiveView(view) {
    state.activeView = view || "phase";
    if (elements.referenceView) elements.referenceView.value = state.activeView;

    document.querySelectorAll("[data-view]").forEach((button) => {
        const active = button.dataset.view === state.activeView;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });

    document.querySelectorAll("[data-view-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.viewPanel !== state.activeView;
    });
}

function renderActiveData() {
    if (!state.loaded) return;

    renderSummaryCards();
    if (state.activeView === "phase") renderSerumRows();
    if (state.activeView === "chart") renderCycleProfile();
    if (state.activeView === "production") renderProductionRows();

    const selectedAnalyte = getSelectedAnalyteLabel();
    const serumCount = getFilteredSerumRows().length;
    const cycleCount = getFilteredCycleRows().length;
    const productionCount = getFilteredProductionRows().length;
    const mode = state.activeView === "phase"
        ? `${serumCount} reviewed serum/plasma row${serumCount === 1 ? "" : "s"}`
        : state.activeView === "chart"
            ? `${cycleCount} cycle profile row${cycleCount === 1 ? "" : "s"}`
            : `${productionCount} production-rate row${productionCount === 1 ? "" : "s"}`;
    elements.statusLine.textContent = `${selectedAnalyte}: ${mode}. Reference only; no personal lab interpretation.`;
    elements.statusLine.classList.add("success");
    if (elements.resultIntro) {
        elements.resultIntro.textContent = "Reference rows are loaded with source links, methods, units, and caveats.";
    }
}

function getFilteredSerumRows() {
    const analyte = elements.analyteSelect?.value || DEFAULT_FORM.analyteSelect;
    const context = elements.sourceContext?.value || "all";
    const phase = elements.cyclePhase?.value || "all";
    const method = elements.assayMethod?.value || "all";

    return state.serumRows.filter((row) => (
        row.analyte_id === analyte
        && (context === "all" || row.sex_context === context)
        && (phase === "all" || row.phase_context === phase)
        && (method === "all" || row.assay_method === method)
    ));
}

function getFilteredCycleRows() {
    const analyte = elements.analyteSelect?.value || DEFAULT_FORM.analyteSelect;
    const phase = elements.cyclePhase?.value || "all";
    return state.cycleRows
        .filter((row) => row.analyte_id === analyte && (phase === "all" || row.phase_context === phase))
        .sort((a, b) => CYCLE_PHASE_ORDER.indexOf(a.phase_context) - CYCLE_PHASE_ORDER.indexOf(b.phase_context));
}

function getFilteredProductionRows() {
    const analyte = elements.analyteSelect?.value || DEFAULT_FORM.analyteSelect;
    const context = elements.sourceContext?.value || "all";
    const timing = elements.cyclePhase?.value || "all";
    const method = elements.assayMethod?.value || "all";

    return state.productionRows.filter((row) => (
        row.analyte_id === analyte
        && (context === "all" || row.sex_context === context)
        && (timing === "all" || getTimingContext(row) === timing)
        && (method === "all" || row.assay_method === method)
    ));
}

function renderSummaryCards() {
    const serumRows = getFilteredSerumRows();
    const cycleRows = getFilteredCycleRows();
    const productionRows = getFilteredProductionRows();
    elements.serumReferenceStatus.textContent = `${serumRows.length} / ${state.serumRows.length}`;
    elements.cycleStatus.textContent = `${cycleRows.length} / ${state.cycleRows.length}`;
    elements.productionStatus.textContent = `${productionRows.length} / ${state.productionRows.length}`;
}

function renderSerumRows() {
    const rows = getFilteredSerumRows();
    if (!elements.phaseTableBody) return;
    elements.phaseTableBody.replaceChildren();

    if (!rows.length) {
        renderMessageRow(elements.phaseTableBody, 7, "No reviewed serum/plasma rows match the current filters.");
        return;
    }

    rows.forEach((row) => {
        const tr = document.createElement("tr");
        appendCell(tr, row.display_name || formatToken(row.analyte_id), "analyte-cell");
        appendCell(tr, buildContextText(row), "context-cell");
        appendCell(tr, buildRangeText(row), "range-value");
        appendCell(tr, `${formatToken(row.specimen)} / ${row.assay_method}`, "method-cell");
        appendSourceCell(tr, row);
        appendCell(tr, formatToken(row.confidence), "confidence-cell");
        appendCell(tr, row.caveat, "caveat-cell");
        elements.phaseTableBody.appendChild(tr);
    });
}

function buildContextText(row) {
    return [
        formatToken(row.sex_context),
        formatToken(row.age_context),
        formatToken(getTimingContext(row)),
        row.alignment && row.alignment !== "not_applicable" ? formatToken(row.alignment) : ""
    ].filter(Boolean).join(" | ");
}

function buildProductionContextText(row) {
    return [
        formatToken(row.sex_context),
        formatToken(getTimingContext(row))
    ].filter(Boolean).join(" | ");
}

function buildRangeText(row) {
    const low = row.value_low;
    const high = row.value_high;
    const median = row.value_median;
    const unit = row.source_unit || row.normalized_unit || "";
    let range = "";

    if (low && high) {
        range = `${low} - ${high} ${unit}`;
    } else if (high) {
        range = `<= ${high} ${unit}`;
    } else if (low) {
        range = `>= ${low} ${unit}`;
    } else if (median) {
        range = `${median} ${unit}`;
    } else {
        range = "Source row without numeric band";
    }

    if (median && (low || high)) {
        range += `; median ${median} ${unit}`;
    }

    return `${range}\n${formatToken(row.band_kind)}`;
}

function appendSourceCell(tr, row) {
    const td = document.createElement("td");
    td.className = "source-cell";
    const sourceRecord = state.registryById.get(row.source_id);

    const source = sourceRecord?.source_url ? document.createElement("a") : document.createElement("div");
    source.className = "source-chip";
    source.textContent = row.source_id;
    if (sourceRecord?.source_url) {
        source.href = sourceRecord.source_url;
        source.target = "_blank";
        source.rel = "noopener noreferrer";
        source.title = sourceRecord.source_url;
    }
    td.appendChild(source);

    const locator = document.createElement("div");
    locator.className = "source-locator-inline";
    locator.textContent = row.source_locator || sourceRecord?.source_locator || "";
    td.appendChild(locator);

    if (sourceRecord?.source_url) {
        const url = document.createElement("a");
        url.className = "source-url-inline";
        url.href = sourceRecord.source_url;
        url.target = "_blank";
        url.rel = "noopener noreferrer";
        url.textContent = sourceRecord.source_url;
        td.appendChild(url);
    }

    tr.appendChild(td);
}

function renderCycleProfile() {
    const rows = getFilteredCycleRows();
    renderCycleChart(rows);
    renderCycleTable(rows);
}

function renderCycleChart(rows) {
    if (!elements.cycleProfileChart) return;

    if (!rows.length) {
        renderCyclePlaceholder("No cycle profile rows match the current filters.");
        elements.cycleProfileChart.dataset.sourceStatus = "empty";
        elements.cycleProfileChart.setAttribute("aria-label", "No cycle profile rows match the current filters");
        return;
    }

    const values = rows.flatMap((row) => [row.value_p025, row.value_median, row.value_p975].map(Number).filter(Number.isFinite));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.08 || 1;
    const yMin = Math.max(0, min - pad);
    const yMax = max + pad;
    const xPositions = rows.map((_, index) => 86 + index * (590 / Math.max(rows.length - 1, 1)));

    const y = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 286;
        return 286 - ((numeric - yMin) / (yMax - yMin || 1)) * 220;
    };

    const bands = rows.map((row, index) => {
        const x = xPositions[index];
        const top = y(row.value_p975);
        const bottom = y(row.value_p025);
        return `<line class="cycle-band" x1="${x}" y1="${top}" x2="${x}" y2="${bottom}"></line>`;
    }).join("");

    const medians = rows.map((row, index) => `${xPositions[index]},${y(row.value_median)}`).join(" ");
    const points = rows.map((row, index) => {
        const x = xPositions[index];
        const label = formatToken(row.phase_context);
        return `
            <circle class="cycle-point" cx="${x}" cy="${y(row.value_median)}" r="5"></circle>
            <text class="chart-label" x="${x}" y="314" text-anchor="middle">${escapeHtml(shortCycleLabel(label))}</text>
        `;
    }).join("");

    const gridLines = [70, 120, 170, 220, 270].map((gridY) => (
        `<line class="chart-grid" x1="58" y1="${gridY}" x2="710" y2="${gridY}"></line>`
    )).join("");

    const unit = rows[0].source_unit || "";
    elements.cycleProfileChart.dataset.sourceStatus = "loaded";
    elements.cycleProfileChart.setAttribute("aria-label", `${getSelectedAnalyteLabel()} cycle profile with source-reported percentile bands`);
    elements.cycleProfileChart.innerHTML = `
        <svg viewBox="0 0 760 340" preserveAspectRatio="none" aria-hidden="true">
            ${gridLines}
            <line class="chart-axis" x1="58" y1="286" x2="710" y2="286"></line>
            <line class="chart-axis" x1="58" y1="55" x2="58" y2="286"></line>
            <polyline class="cycle-line" points="${medians}"></polyline>
            ${bands}
            ${points}
            <text class="chart-title" x="384" y="36" text-anchor="middle">${escapeHtml(getSelectedAnalyteLabel())} cycle-day percentiles</text>
            <text class="chart-label" x="384" y="332" text-anchor="middle">Frederiksen source cycle-day bucket</text>
            <text class="chart-label" x="24" y="178" text-anchor="middle" transform="rotate(-90 24 178)">${escapeHtml(unit)}</text>
        </svg>
    `;
}

function renderCycleTable(rows) {
    if (!elements.cycleProfileTableBody) return;
    elements.cycleProfileTableBody.replaceChildren();

    if (!rows.length) {
        renderMessageRow(elements.cycleProfileTableBody, 7, "No reviewed cycle rows match the current filters.");
        return;
    }

    rows.forEach((row) => {
        const tr = document.createElement("tr");
        appendCell(tr, formatToken(row.phase_context));
        appendCell(tr, row.value_p025);
        appendCell(tr, row.value_median);
        appendCell(tr, row.value_p975);
        appendCell(tr, row.source_unit);
        appendSourceCell(tr, row);
        appendCell(tr, row.caveat, "caveat-cell");
        elements.cycleProfileTableBody.appendChild(tr);
    });
}

function renderCyclePlaceholder(message) {
    if (!elements.cycleProfileChart) return;
    elements.cycleProfileChart.innerHTML = `
        <svg viewBox="0 0 760 340" preserveAspectRatio="none" aria-hidden="true">
            <line class="chart-axis" x1="58" y1="286" x2="710" y2="286"></line>
            <line class="chart-axis" x1="58" y1="55" x2="58" y2="286"></line>
            <rect class="chart-empty-band" x="130" y="108" width="500" height="118" rx="8"></rect>
            <text class="chart-title" x="380" y="168" text-anchor="middle">${escapeHtml(message)}</text>
            <text class="chart-label" x="380" y="198" text-anchor="middle">Choose an analyte with Frederiksen cycle-profile rows.</text>
        </svg>
    `;
}

function renderProductionRows() {
    const rows = getFilteredProductionRows();
    if (!elements.productionTableBody) return;
    elements.productionTableBody.replaceChildren();

    if (!rows.length) {
        renderMessageRow(elements.productionTableBody, 6, "No reviewed production-rate rows match the current filters.");
        return;
    }

    rows.forEach((row) => {
        const tr = document.createElement("tr");
        appendCell(tr, row.display_name || formatToken(row.analyte_id), "analyte-cell");
        appendCell(tr, buildProductionContextText(row), "context-cell");
        appendCell(tr, buildProductionRangeText(row), "range-value");
        appendSourceCell(tr, row);
        appendCell(tr, formatToken(row.confidence), "confidence-cell");
        appendCell(tr, row.caveat, "caveat-cell");
        elements.productionTableBody.appendChild(tr);
    });
}

function buildProductionRangeText(row) {
    const sourceUnit = row.source_unit || "";
    const normalizedUnit = row.normalized_unit || "";
    let sourceValue = "";
    let normalizedValue = "";

    if (row.value_low && row.value_high) {
        sourceValue = `${row.value_low} - ${row.value_high} ${sourceUnit}`;
    } else if (row.value_mean) {
        sourceValue = `${row.value_mean} ${sourceUnit}`;
    } else if (row.value_high) {
        sourceValue = `<= ${row.value_high} ${sourceUnit}`;
    } else if (row.value_low) {
        sourceValue = `>= ${row.value_low} ${sourceUnit}`;
    }

    if (row.normalized_value_low && row.normalized_value_high) {
        normalizedValue = `${row.normalized_value_low} - ${row.normalized_value_high} ${normalizedUnit}`;
    } else if (row.normalized_value_mean) {
        normalizedValue = `${row.normalized_value_mean} ${normalizedUnit}`;
    } else if (row.normalized_value_high) {
        normalizedValue = `<= ${row.normalized_value_high} ${normalizedUnit}`;
    } else if (row.normalized_value_low) {
        normalizedValue = `>= ${row.normalized_value_low} ${normalizedUnit}`;
    }

    return [sourceValue || "Source row without numeric production estimate", normalizedValue ? `(${normalizedValue})` : ""]
        .filter(Boolean)
        .join("\n");
}

function renderReviewGates() {
    if (!elements.reviewGateList) return;
    elements.reviewGateList.replaceChildren();
    REVIEW_GATES.forEach((gate) => {
        const li = document.createElement("li");
        li.textContent = gate;
        elements.reviewGateList.appendChild(li);
    });
}

function renderSourceAudit() {
    if (!elements.sourceAuditBody) return;
    elements.sourceAuditBody.replaceChildren();
    AUDIT_ROWS.forEach((row) => {
        const tr = document.createElement("tr");
        appendCell(tr, row.area);
        appendCell(tr, row.status);
        appendSourcePostureCell(tr, row);
        elements.sourceAuditBody.appendChild(tr);
    });
}

function appendSourcePostureCell(tr, row) {
    const td = document.createElement("td");
    td.textContent = row.source;
    appendWarningSourceLinks(td, row.sourceIds);
    tr.appendChild(td);
}

function updateAnalyteWarning() {
    const block = elements.analyteWarningBlock;
    if (!block) return;

    const selectedAnalyte = elements.analyteSelect?.value;
    const warningAnalytes = new Set([
        "free_testosterone",
        "calculated_free_testosterone",
        "bioavailable_testosterone_calculated"
    ]);

    if (!warningAnalytes.has(selectedAnalyte)) {
        block.hidden = true;
        block.replaceChildren();
        return;
    }

    block.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = "Free and bioavailable testosterone method context";
    block.appendChild(heading);

    const intro = document.createElement("p");
    intro.textContent = "Displayed rows are source-specific method rows. They are not interchangeable across measured, calculated, analog, or index-based methods.";
    intro.className = "warning-intro";
    block.appendChild(intro);

    const list = document.createElement("ul");
    FREE_TESTOSTERONE_WARNINGS.forEach((entry) => {
        const li = document.createElement("li");
        const text = document.createElement("span");
        text.textContent = `${entry.text} `;
        li.appendChild(text);
        appendWarningSourceLinks(li, entry.sourceIds);
        list.appendChild(li);
    });
    block.appendChild(list);

    block.hidden = false;
}

function appendWarningSourceLinks(parent, sourceIds = []) {
    if (sourceIds.length === 0) return;

    const cite = document.createElement("span");
    cite.className = "warning-source";
    cite.appendChild(document.createTextNode(sourceIds.length === 1 ? "Source: " : "Sources: "));

    sourceIds.forEach((sourceId, index) => {
        const sourceRecord = state.registryById.get(sourceId);
        const source = sourceRecord?.source_url ? document.createElement("a") : document.createElement("span");
        source.textContent = sourceId;

        if (sourceRecord?.source_url) {
            source.href = sourceRecord.source_url;
            source.target = "_blank";
            source.rel = "noopener noreferrer";
            source.title = sourceRecord.source_locator || sourceRecord.source_url;
        }

        cite.appendChild(source);
        if (index < sourceIds.length - 1) cite.appendChild(document.createTextNode("; "));
    });

    parent.appendChild(document.createElement("br"));
    parent.appendChild(cite);
}

function renderLoadError(error) {
    elements.statusLine.textContent = `Unable to load local hormone data: ${error.message}. Use a local static server rather than opening the file directly.`;
    elements.statusLine.classList.remove("success");
    elements.serumReferenceStatus.textContent = "Error";
    elements.cycleStatus.textContent = "Error";
    renderMessageRow(elements.phaseTableBody, 7, "Unable to load reviewed rows from data/hormone_research_reference.");
    renderCyclePlaceholder("Unable to load cycle profile rows.");
}

function appendCell(parent, value, className = "") {
    const td = document.createElement("td");
    if (className) td.className = className;
    td.textContent = value || "";
    parent.appendChild(td);
}

function renderMessageRow(tbody, colspan, message) {
    if (!tbody) return;
    tbody.replaceChildren();
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = colspan;
    td.className = "empty-table-message";
    td.textContent = message;
    tr.appendChild(td);
    tbody.appendChild(tr);
}

let sourcesLoaded = false;

async function loadSourcesIntoModal() {
    if (sourcesLoaded) return;
    const body = elements.sourcesModalBody;
    if (!body) return;

    try {
        if (!state.registry.length) {
            state.registry = await fetchJson(DATA_FILES.sourceRegistry);
            state.registryById = new Map(state.registry.map((source) => [source.source_id, source]));
        }
        renderSourcesList(state.registry);
        sourcesLoaded = true;
    } catch (error) {
        body.replaceChildren();
        const err = document.createElement("div");
        err.className = "sources-error";
        err.textContent = `Unable to load source registry (${error.message}). Refer to data/hormone_research_reference/source_registry.json in the repository.`;
        body.appendChild(err);
    }
}

function renderSourcesList(registry) {
    const body = elements.sourcesModalBody;
    if (!body) return;
    body.replaceChildren();

    registry.forEach((source) => {
        const entry = document.createElement("article");
        entry.className = "source-entry";

        if (source.source_role) {
            const pill = document.createElement("span");
            pill.className = "source-role-pill";
            pill.textContent = source.source_role.replace(/_/g, " ");
            entry.appendChild(pill);
        }

        if (source.use) {
            const use = document.createElement("div");
            use.className = "source-use";
            use.textContent = source.use;
            entry.appendChild(use);
        }

        if (source.source_locator) {
            const locator = document.createElement("div");
            locator.className = "source-locator";
            locator.textContent = source.source_locator;
            entry.appendChild(locator);
        }

        if (source.source_url) {
            const link = document.createElement("a");
            link.href = source.source_url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = source.source_url;
            entry.appendChild(link);
        }

        body.appendChild(entry);
    });
}

function openSourcesModal() {
    if (!elements.sourcesModal) return;
    elements.sourcesModal.hidden = false;
    loadSourcesIntoModal();
    elements.closeSourcesBtn?.focus();
}

function closeSourcesModal() {
    if (!elements.sourcesModal) return;
    elements.sourcesModal.hidden = true;
    elements.viewSourcesBtn?.focus();
}

async function copySummary() {
    const serumRows = getFilteredSerumRows();
    const cycleRows = getFilteredCycleRows();
    const productionRows = getFilteredProductionRows();
    const analyte = getSelectedAnalyteLabel();
    const activeRows = state.activeView === "phase"
        ? serumRows
        : state.activeView === "chart"
            ? cycleRows
            : productionRows;
    const sourceLines = buildSourceSummaryLines(activeRows).slice(0, 8);
    const summary = [
        "Hormone Research Reference source summary",
        `Analyte: ${analyte}`,
        `View: ${formatToken(state.activeView)}`,
        `Displayed serum/plasma rows: ${serumRows.length}`,
        `Displayed cycle-profile rows: ${cycleRows.length}`,
        `Displayed production-rate rows: ${productionRows.length}`,
        `Sources: ${sourceLines.length ? sourceLines.join("; ") : "No rows in current filter"}`,
        DISCLAIMER_COMPACT
    ].join("\n");

    try {
        await navigator.clipboard.writeText(summary);
        elements.statusLine.textContent = "Source summary copied with compact disclaimer.";
        elements.statusLine.classList.add("success");
    } catch {
        elements.statusLine.textContent = "Clipboard copy unavailable. Compact disclaimer remains required on all copied summaries.";
        elements.statusLine.classList.remove("success");
    }
}

function getSelectedAnalyteLabel() {
    return elements.analyteSelect?.selectedOptions[0]?.textContent || "Selected analyte";
}

function getTimingContext(row) {
    return row.phase_context || row.cycle_context || "";
}

function buildSourceSummaryLines(rows) {
    const byId = new Map();
    rows.forEach((row) => {
        if (!row.source_id || byId.has(row.source_id)) return;
        const record = state.registryById.get(row.source_id);
        byId.set(row.source_id, record?.source_url ? `${row.source_id}: ${record.source_url}` : row.source_id);
    });
    return Array.from(byId.values());
}

function formatToken(value) {
    return String(value || "")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase())
        .replace(/\bLcms\b/g, "LCMS")
        .replace(/\bDhea\b/g, "DHEA")
        .replace(/\bDheas\b/g, "DHEA-S")
        .replace(/\bDht\b/g, "DHT")
        .replace(/\bShbg\b/g, "SHBG")
        .replace(/\bOcp\b/g, "OCP")
        .replace(/\bLh\b/g, "LH");
}

function shortCycleLabel(label) {
    return label
        .replace("Cycle Days ", "Days ")
        .replace(" Plus Ovulation Confirmed", "+ Ovulation")
        .replace(" Plus All", "+ All");
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
