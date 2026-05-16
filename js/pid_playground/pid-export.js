export function exportJson(result) {
    const payload = {
        exported_at: new Date().toISOString(),
        tool: "pid-playground",
        version: "0.1.0",
        config: result.config,
        metrics: result.metrics,
        series: result.series
    };
    downloadText(`pid-playground-results-${timestamp()}.json`, JSON.stringify(payload, null, 2), "application/json");
}

export function exportCsv(result) {
    const header = [
        "time",
        "setpoint",
        "pv",
        "measurement",
        "error",
        "output",
        "output_raw",
        "output_delayed",
        "p_term",
        "i_term",
        "d_term",
        "disturbance",
        "saturated"
    ];
    const rows = result.series.map((point) => header.map((key) => formatCsvValue(point[key])).join(","));
    downloadText(`pid-playground-series-${timestamp()}.csv`, [header.join(","), ...rows].join("\n"), "text/csv");
}

function downloadText(filename, text, type) {
    const blob = new Blob([text], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatCsvValue(value) {
    if (typeof value === "boolean") {
        return value ? "true" : "false";
    }
    if (typeof value === "number") {
        return Number.isFinite(value) ? String(value) : "";
    }
    if (value === null || value === undefined) {
        return "";
    }
    const text = String(value);
    if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function timestamp() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
        "-",
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join("");
}
