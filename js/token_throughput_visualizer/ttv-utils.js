import {
    MAX_REPORT_SAMPLE_LENGTH,
    MAX_SAMPLE_LENGTH
} from './ttv-config.js';

export function normalizeSampleText(value) {
    return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_SAMPLE_LENGTH);
}

export function estimateCharsPerWord(sampleText, fallbackCharsPerWord) {
    const words = sampleText.match(/[\p{L}\p{N}_'-]+/gu) || [];
    if (words.length === 0) {
        return fallbackCharsPerWord;
    }

    const totalCharacters = words.reduce((sum, word) => sum + word.length, 0);
    return clamp(totalCharacters / words.length, 3, 10);
}

export function sanitizeFloat(value, fallback, min, max) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return clamp(parsed, min, max);
}

export function sanitizeInteger(value, fallback, min, max) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    return clamp(parsed, min, max);
}

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

export function formatSeconds(value) {
    if (value >= 60) {
        const minutes = Math.floor(value / 60);
        const seconds = value - (minutes * 60);
        return `${minutes}m ${formatNumber(seconds, 1)} s`;
    }

    return `${formatNumber(value, 1)} s`;
}

export function formatNumber(value, fractionDigits) {
    return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
    }).format(value);
}

export function formatInputNumber(value, maxFractionDigits) {
    return Number(value).toFixed(maxFractionDigits).replace(/\.?0+$/, '');
}

export function formatInteger(value) {
    return new Intl.NumberFormat().format(value);
}

export function encodeBase64UrlJson(value) {
    const json = JSON.stringify(value);
    const bytes = new TextEncoder().encode(json);
    let binary = '';

    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeBase64UrlJson(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const binary = atob(normalized + padding);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
}

export function formatReportSample(sampleText) {
    const normalized = normalizeSampleText(sampleText);
    if (normalized.length <= MAX_REPORT_SAMPLE_LENGTH) {
        return normalized;
    }

    return `${normalized.slice(0, MAX_REPORT_SAMPLE_LENGTH).trimEnd()}\n[trimmed]`;
}
