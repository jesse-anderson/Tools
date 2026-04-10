export function formatBytes(value) {
    if (!Number.isFinite(value) || value <= 0) {
        return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = value;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    const digits = size >= 10 || unitIndex === 0 ? 0 : 1;
    return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

export function formatInteger(value) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

export function formatPercent(value, digits = 1) {
    return `${value.toFixed(digits)}%`;
}

export function formatDuration(milliseconds) {
    if (milliseconds < 1000) {
        return `${Math.round(milliseconds)} ms`;
    }

    const seconds = milliseconds / 1000;
    return `${seconds.toFixed(seconds >= 10 ? 1 : 2)} s`;
}

export function truncateText(value, maxLength) {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function normalizeTextInput(text) {
    if (!text) {
        return '';
    }

    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function isBlankRow(row) {
    return row.every((cell) => cell.trim() === '');
}

export function yieldToMainThread() {
    return new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

export function escapeSqlIdentifier(value) {
    return `"${String(value).replace(/"/g, '""')}"`;
}

export function sanitizeSqlName(value, fallback) {
    const trimmed = String(value || '').trim().toLowerCase();
    const compact = trimmed
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .replace(/_{2,}/g, '_');

    const safe = compact || fallback;
    return /^[0-9]/.test(safe) ? `_${safe}` : safe;
}

export function buildUniqueNames(values, fallbackPrefix) {
    const seen = new Map();

    return values.map((value, index) => {
        const base = sanitizeSqlName(value, `${fallbackPrefix}_${index + 1}`);
        const nextCount = seen.get(base) || 0;
        seen.set(base, nextCount + 1);
        return nextCount === 0 ? base : `${base}_${nextCount + 1}`;
    });
}

export async function copyText(text) {
    await navigator.clipboard.writeText(text);
}

export function createElement(tagName, className, text) {
    const element = document.createElement(tagName);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

export function getPercent(part, whole) {
    if (!whole) {
        return 0;
    }

    return (part / whole) * 100;
}

export function parseNumeric(value) {
    if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value)) {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export function classifyScalar(value) {
    const trimmed = value.trim();

    if (trimmed === '') {
        return { kind: 'empty', parsed: null, hasTime: false };
    }

    const lowered = trimmed.toLowerCase();
    if (lowered === 'true' || lowered === 'false' || lowered === 'yes' || lowered === 'no') {
        return { kind: 'boolean', parsed: lowered === 'true' || lowered === 'yes', hasTime: false };
    }

    if (/^[-+]?\d+$/.test(trimmed)) {
        const parsed = Number(trimmed);
        if (Number.isSafeInteger(parsed)) {
            return { kind: 'integer', parsed, hasTime: false };
        }
    }

    const numeric = parseNumeric(trimmed);
    if (numeric !== null) {
        return { kind: 'number', parsed: numeric, hasTime: false };
    }

    if (/[\/\-:t]/i.test(trimmed) && trimmed.length >= 6) {
        const parsed = Date.parse(trimmed);
        if (!Number.isNaN(parsed)) {
            const hasTime = /t|\d:\d/.test(trimmed.toLowerCase());
            return { kind: 'datetime', parsed, hasTime };
        }
    }

    return { kind: 'text', parsed: trimmed, hasTime: false };
}
