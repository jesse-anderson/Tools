// Battery Capacity Calculator - Formatting and unit conversion helpers

export function parseOptionalFloat(value) {
    const trimmed = String(value ?? '').trim();
    if (trimmed === '') {
        return null;
    }

    const parsed = parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

export function convertCapacityToAh(value, unit) {
    return unit === 'mAh' ? value / 1000 : value;
}

export function convertCurrentToAmps(value, unit) {
    if (unit === 'uA') return value / 1_000_000;
    if (unit === 'mA') return value / 1000;
    return value;
}

export function convertOptionalCurrentToAmps(value, unit) {
    return value === null ? null : convertCurrentToAmps(value, unit);
}

export function convertPowerToWatts(value, unit) {
    return unit === 'mW' ? value / 1000 : value;
}

export function convertDurationToSeconds(value, unit) {
    if (unit === 'ms') return value / 1000;
    if (unit === 'min') return value * 60;
    if (unit === 'hr') return value * 3600;
    return value;
}

export function formatRuntime(hours) {
    if (!Number.isFinite(hours)) {
        return 'Infinite';
    }

    const totalSeconds = Math.max(0, Math.round(hours * 3600));
    if (totalSeconds < 60) {
        return `${totalSeconds} s`;
    }

    const days = Math.floor(totalSeconds / 86400);
    const hoursPart = Math.floor((totalSeconds % 86400) / 3600);
    const minutesPart = Math.floor((totalSeconds % 3600) / 60);

    if (days > 0) {
        return minutesPart > 0 ? `${days} d ${hoursPart} hr ${minutesPart} min` : `${days} d ${hoursPart} hr`;
    }

    if (hoursPart > 0) {
        return minutesPart > 0 ? `${hoursPart} hr ${minutesPart} min` : `${hoursPart} hr`;
    }

    return `${minutesPart} min`;
}

export function formatDurationFromSeconds(seconds) {
    if (seconds < 1) return `${trimNumber(seconds * 1000, 1)} ms`;
    if (seconds < 60) return `${trimNumber(seconds, 2)} s`;
    if (seconds < 3600) return `${trimNumber(seconds / 60, 2)} min`;
    return `${trimNumber(seconds / 3600, 2)} hr`;
}

export function formatCurrent(amps) {
    if (amps < 0.001) return `${trimNumber(amps * 1_000_000, 1)} uA`;
    if (amps < 1) return `${trimNumber(amps * 1000, 2)} mA`;
    return `${trimNumber(amps, 3)} A`;
}

export function formatPower(watts) {
    if (watts < 0.001) return `${trimNumber(watts * 1_000_000, 1)} uW`;
    if (watts < 1) return `${trimNumber(watts * 1000, 2)} mW`;
    return `${trimNumber(watts, 3)} W`;
}

export function formatEnergy(wh) {
    if (wh < 1) return `${trimNumber(wh * 1000, 2)} mWh`;
    return `${trimNumber(wh, 3)} Wh`;
}

export function formatCapacity(ah) {
    if (ah < 1) return `${trimNumber(ah * 1000, 2)} mAh`;
    return `${trimNumber(ah, 3)} Ah`;
}

export function formatVoltage(volts) {
    return `${trimNumber(volts, 2)} V`;
}

export function formatPercent(percent) {
    return `${trimNumber(percent, 2)}%`;
}

export function formatSavedAtShort(savedAt) {
    const date = new Date(savedAt);
    if (Number.isNaN(date.getTime())) {
        return 'saved';
    }

    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    const hours = `${date.getHours()}`.padStart(2, '0');
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function generateScenarioId() {
    return `scenario-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

export function computePercentDelta(current, baseline) {
    if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) {
        return 0;
    }
    return ((current - baseline) / baseline) * 100;
}

export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function trimNumber(value, decimals) {
    return Number(value.toFixed(decimals)).toString();
}

export function debounce(func, wait) {
    let timeout;
    return function debounced(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}
