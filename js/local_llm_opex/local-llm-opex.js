// Local LLM TCO Calculator - JS Logic

/**
 * Constants for calculations and UI thresholds
 */
const CONFIG = {
    SECONDS_PER_HOUR: 3600,
    DAYS_PER_MONTH_AVG: 30.437, // 365.25 / 12
    MONTHS_IN_YEAR: 12,
    EXP_THRESHOLD_HIGH: 1e6,
    EXP_THRESHOLD_LOW: 0.01,
    BOUNDS: {
        purchasePrice: { min: 0, max: 1000000 },
        lifespanYears: { min: 0.1, max: 20 },
        dailyUsage: { min: 0, max: 24 },
        dutyCycle: { min: 0, max: 100 },
        activePowerDraw: { min: 0, max: 10000 },
        idlePowerDraw: { min: 0, max: 5000 },
        electricityRate: { min: 0, max: 10 },
        tokensPerSecond: { min: 0.1, max: 100000 },
        customSubscriptionPrice: { min: 0, max: 10000 }
    },
    COLORS: {
        LIGHT: {
            local: '#10b981',
            cloud: '#3b82f6',
            sub: '#f59e0b',
            borderLocal: '#059669',
            borderCloud: '#2563eb',
            borderSub: '#d97706'
        },
        DARK: {
            local: '#34d399',
            cloud: '#60a5fa',
            sub: '#fbbf24',
            borderLocal: '#059669',
            borderCloud: '#2563eb',
            borderSub: '#d97706'
        }
    }
};

const MODEL_NAMES = {
    'claude-sonnet-4-6': 'Claude Sonnet 4.6',
    'gpt-5.4': 'GPT-5.4',
    'gpt-5.4-mini': 'GPT-5.4 mini',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite'
};

const DEFAULTS = {
    purchasePrice: 1000,
    lifespanYears: 3,
    dailyUsage: 8,
    dutyCycle: 10,
    activePowerDraw: 350,
    idlePowerDraw: 50,
    electricityRate: 0.16,
    tokensPerSecond: 50,
    selectedApiModel: 'claude-sonnet-4-6',
    selectedSubscriptionPlan: 'pro',
    customSubscriptionPrice: 20
};

/**
 * State management object for the calculator
 */
const state = {
    ...DEFAULTS,
    apiPrices: {
        // typicalTps: rough public-throughput averages (tokens/sec for streamed output).
        // Real values vary widely by region, load, batch, and tier; treat as ballpark only.
        'claude-sonnet-4-6': { out: 15, typicalTps: 85 },
        'gpt-5.4': { out: 15, typicalTps: 70 },
        'gpt-5.4-mini': { out: 4.5, typicalTps: 155 },
        'gemini-2.5-flash': { out: 2.5, typicalTps: 180 },
        'gemini-2.5-flash-lite': { out: 0.4, typicalTps: 240 }
    },
    subscriptionPlans: {
        'pro': 20,
        'team': 30,
        'enterprise': 100,
        'custom': null // Special case handled in getSelectedSubscriptionCost
    },
    chart: null,
    monthlyChart: null
};

function getThemeColor(key) {
    const isDark = (document.documentElement.getAttribute('data-theme') || 'dark') !== 'light';
    const theme = isDark ? CONFIG.COLORS.DARK : CONFIG.COLORS.LIGHT;
    return theme[key];
}

function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Securely format numbers with validation for display
 */
function formatNumber(num, decimals = 2) {
    if (num === 0) return '0.00';
    if (!isFinite(num) || isNaN(num)) return '0.00';

    let formatted;
    if (num >= CONFIG.EXP_THRESHOLD_HIGH) {
        formatted = num.toExponential(2);
    } else if (num < CONFIG.EXP_THRESHOLD_LOW && num > 0) {
        formatted = num.toFixed(6);
    } else {
        formatted = num.toFixed(decimals);
    }

    return formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Human-friendly formatting for ARIA labels (no scientific notation)
 */
function formatForAria(num) {
    if (!isFinite(num) || isNaN(num) || num === 0) return 'zero dollars';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + ' million dollars';
    if (num < 0.01 && num > 0) return num.toFixed(4) + ' dollars';
    return num.toFixed(2) + ' dollars';
}

/**
 * Calculate the variable electricity cost (Marginal power only)
 */
function calculateVariableCostPerMillion() {
    // Marginal power = Active - Idle baseline
    const marginalPower = Math.max(0, state.activePowerDraw - state.idlePowerDraw);
    const kwhPerActiveHour = marginalPower / 1000;
    const costPerActiveHour = kwhPerActiveHour * state.electricityRate;
    const tokensPerHour = state.tokensPerSecond * CONFIG.SECONDS_PER_HOUR;

    if (tokensPerHour <= 0) return 0;

    const costPerToken = costPerActiveHour / tokensPerHour;
    return costPerToken * 1000000;
}

/**
 * Calculate total monthly electricity cost (Idle + Active time)
 */
function calculateMonthlyElectricityCost() {
    const activeHoursPerDay = state.dailyUsage * (state.dutyCycle / 100);
    const idleHoursPerDay = Math.max(0, state.dailyUsage - activeHoursPerDay);

    const activeKwhPerMonth = (activeHoursPerDay * (state.activePowerDraw / 1000)) * CONFIG.DAYS_PER_MONTH_AVG;
    const idleKwhPerMonth = (idleHoursPerDay * (state.idlePowerDraw / 1000)) * CONFIG.DAYS_PER_MONTH_AVG;

    return (activeKwhPerMonth + idleKwhPerMonth) * state.electricityRate;
}

/**
 * Calculate hardware amortization (Fixed calendar-based cost)
 */
function calculateMonthlyHardwareCost() {
    const totalMonths = state.lifespanYears * CONFIG.MONTHS_IN_YEAR;
    if (totalMonths <= 0) return 0;
    return state.purchasePrice / totalMonths;
}

/**
 * Estimate actual token volume based on duty cycle
 */
function calculateEstimatedMonthlyTokens() {
    const activeHoursPerMonth = state.dailyUsage * CONFIG.DAYS_PER_MONTH_AVG * (state.dutyCycle / 100);
    return activeHoursPerMonth * CONFIG.SECONDS_PER_HOUR * state.tokensPerSecond;
}

/**
 * Fully-loaded local cost per million tokens (electricity + hardware amortization
 * spread over actual generated tokens). This is the apples-to-apples comparison
 * against cloud $/M output prices.
 */
function calculateFullyLoadedCostPerMillion(monthlyTCO, estTokens) {
    if (estTokens <= 0) return Infinity;
    return (monthlyTCO / estTokens) * 1e6;
}

/**
 * Get selected subscription cost handling custom plan
 */
function getSelectedSubscriptionCost() {
    const planCost = state.subscriptionPlans[state.selectedSubscriptionPlan];
    return planCost !== null ? planCost : state.customSubscriptionPrice;
}

function updateUI() {
    try {
        const varCostPerMillion = calculateVariableCostPerMillion();
        const monthlyElectricity = calculateMonthlyElectricityCost();
        const monthlyHardware = calculateMonthlyHardwareCost();
        const monthlyTCO = monthlyElectricity + monthlyHardware;

        const estTokens = calculateEstimatedMonthlyTokens();
        const fullyLoadedPerMillion = calculateFullyLoadedCostPerMillion(monthlyTCO, estTokens);
        const apiEntry = (state.apiPrices && state.apiPrices[state.selectedApiModel]) ? state.apiPrices[state.selectedApiModel] : { out: 15, typicalTps: 80 };
        const apiPriceOut = apiEntry.out;
        const cloudTps = apiEntry.typicalTps;
        const subCost = getSelectedSubscriptionCost();

        // Update Primary Metrics
        document.getElementById('varCostValue').textContent = formatNumber(varCostPerMillion);
        document.getElementById('fullyLoadedValue').textContent = isFinite(fullyLoadedPerMillion) ? formatNumber(fullyLoadedPerMillion) : '∞';
        document.getElementById('monthlyTCOValue').textContent = formatNumber(monthlyTCO);
        document.getElementById('estTokenVolume').textContent = formatNumber(estTokens / 1e6, 1) + "M";

        // Update Breakdown
        document.getElementById('elecBreakdown').textContent = formatNumber(monthlyElectricity);
        document.getElementById('hardBreakdown').textContent = formatNumber(monthlyHardware);

        // API Comparison — apples-to-apples: fully-loaded local vs cloud output price
        const apiModelLabel = document.getElementById('apiModelLabel');
        const cloudCostValue = document.getElementById('cloudCostValue');
        const localCostValue = document.getElementById('localCostValue');
        const savingsText = document.getElementById('savingsText');
        const savingsIndicator = document.getElementById('savingsIndicator');

        if (apiModelLabel) {
            apiModelLabel.textContent = `${MODEL_NAMES[state.selectedApiModel]} (Out):`;
            cloudCostValue.textContent = formatNumber(apiPriceOut);
            localCostValue.textContent = isFinite(fullyLoadedPerMillion) ? formatNumber(fullyLoadedPerMillion) : '∞';

            if (!isFinite(fullyLoadedPerMillion)) {
                savingsText.textContent = 'No tokens generated — raise duty cycle to compare';
                savingsIndicator.className = 'savings-indicator';
            } else if (fullyLoadedPerMillion < apiPriceOut) {
                const denominator = Math.max(apiPriceOut, 0.001);
                const pct = ((apiPriceOut - fullyLoadedPerMillion) / denominator) * 100;
                if (fullyLoadedPerMillion === 0) {
                    savingsText.textContent = 'Local is free per token (100% cheaper)';
                } else {
                    savingsText.textContent = `Local is ${pct.toFixed(0)}% cheaper per token (fully loaded)`;
                }
                savingsIndicator.className = 'savings-indicator savings-positive';
            } else {
                const denominator = Math.max(fullyLoadedPerMillion, 0.001);
                const pct = ((fullyLoadedPerMillion - apiPriceOut) / denominator) * 100;
                savingsText.textContent = `Cloud is ${pct.toFixed(0)}% cheaper per token (fully loaded)`;
                savingsIndicator.className = 'savings-indicator savings-negative';
            }
        }

        // Throughput / time-to-work comparison
        updateThroughputBlock(state.tokensPerSecond, cloudTps);

        // Subscription Comparison
        const subSavingsText = document.getElementById('subSavingsText');
        const subSavingsIndicator = document.getElementById('subSavingsIndicator');
        const localMonthlyValueDisplay = document.getElementById('localMonthlyValueDisplay');
        
        if (localMonthlyValueDisplay) localMonthlyValueDisplay.textContent = formatNumber(monthlyTCO);

        if (subSavingsText) {
            if (monthlyTCO < subCost) {
                const denominator = Math.max(subCost, 0.001);
                const pct = ((subCost - monthlyTCO) / denominator) * 100;
                if (monthlyTCO === 0) {
                    subSavingsText.textContent = 'Hardware is free (100% cheaper than plan)';
                } else {
                    subSavingsText.textContent = `Hardware is ${pct.toFixed(0)}% cheaper than plan`;
                }
                subSavingsIndicator.className = 'savings-indicator savings-positive';
            } else {
                const denominator = Math.max(monthlyTCO, 0.001);
                const pct = ((monthlyTCO - subCost) / denominator) * 100;
                subSavingsText.textContent = `Plan is ${pct.toFixed(0)}% cheaper than ownership`;
                subSavingsIndicator.className = 'savings-indicator savings-negative';
            }
        }

        updateCharts(fullyLoadedPerMillion, apiPriceOut, monthlyTCO, subCost);
        updateAriaLabels(fullyLoadedPerMillion, apiPriceOut, monthlyTCO, subCost);
    } catch (error) {
        console.error('Update UI Error:', error);
    }
}

let ariaUpdatePending = false;
function updateAriaLabels(localPerM, cloudApi, totalLocal, sub) {
    if (ariaUpdatePending) return;

    ariaUpdatePending = true;
    requestAnimationFrame(() => {
        const chart1Aria = document.getElementById('comparisonChartAria');
        const chart2Aria = document.getElementById('monthlyChartAria');
        if (chart1Aria) chart1Aria.textContent = `Chart shows fully-loaded local cost of ${formatForAria(localPerM)} versus cloud cost of ${formatForAria(cloudApi)} per million tokens.`;
        if (chart2Aria) chart2Aria.textContent = `Chart shows monthly ownership cost of ${formatForAria(totalLocal)} versus subscription plan cost of ${formatForAria(sub)}.`;
        ariaUpdatePending = false;
    });
}

/**
 * Format seconds as a compact wall-clock string.
 */
function formatDuration(seconds) {
    if (!isFinite(seconds) || seconds <= 0) return '—';
    if (seconds < 60) return `${seconds.toFixed(1)} s`;
    const minutes = seconds / 60;
    if (minutes < 60) return `${minutes.toFixed(1)} min`;
    const hours = minutes / 60;
    if (hours < 48) return `${hours.toFixed(1)} hr`;
    return `${(hours / 24).toFixed(1)} days`;
}

/**
 * Render the throughput / time-to-work comparison block.
 * Reframes per-token cost in terms of wall-clock time per million tokens —
 * lets the user weigh "cheaper per token" against "slower per token."
 */
function updateThroughputBlock(localTps, cloudTps) {
    const localTpsEl = document.getElementById('localTpsDisplay');
    const cloudTpsEl = document.getElementById('cloudTpsDisplay');
    const localTimeEl = document.getElementById('localTimePerMillion');
    const cloudTimeEl = document.getElementById('cloudTimePerMillion');
    const ratioEl = document.getElementById('throughputRatio');
    if (!localTpsEl) return;

    const localT = Math.max(0, Number(localTps) || 0);
    const cloudT = Math.max(0, Number(cloudTps) || 0);

    localTpsEl.textContent = localT > 0 ? localT.toFixed(0) : '—';
    cloudTpsEl.textContent = cloudT > 0 ? cloudT.toFixed(0) : '—';

    const localSecondsPerM = localT > 0 ? 1e6 / localT : Infinity;
    const cloudSecondsPerM = cloudT > 0 ? 1e6 / cloudT : Infinity;
    localTimeEl.textContent = formatDuration(localSecondsPerM);
    cloudTimeEl.textContent = formatDuration(cloudSecondsPerM);

    if (localT === 0 || cloudT === 0) {
        ratioEl.textContent = 'Throughput data unavailable';
        ratioEl.className = 'savings-indicator';
    } else if (cloudT >= localT) {
        const ratio = cloudT / localT;
        ratioEl.textContent = ratio >= 1.05
            ? `Cloud delivers ${ratio.toFixed(1)}× the throughput per second`
            : 'Local and cloud throughput are comparable';
        ratioEl.className = ratio >= 1.05 ? 'savings-indicator savings-negative' : 'savings-indicator';
    } else {
        const ratio = localT / cloudT;
        ratioEl.textContent = `Local delivers ${ratio.toFixed(1)}× the throughput per second`;
        ratioEl.className = 'savings-indicator savings-positive';
    }
}

function buildChartOptions() {
    const textColor = getCssVar('--text-secondary') || '#a1a1aa';
    const gridColor = getCssVar('--border-color') || '#27272a';
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: { label: ctx => '$' + formatNumber(ctx.parsed.y) }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: { callback: v => '$' + v, color: textColor },
                grid: { color: gridColor }
            },
            x: {
                grid: { display: false },
                ticks: { color: textColor }
            }
        }
    };
}

function initCharts() {
    state.chart = new Chart(document.getElementById('comparisonChart'), {
        type: 'bar',
        data: {
            labels: ['Local (Loaded)', 'Cloud API'],
            datasets: [{
                data: [0, 0],
                backgroundColor: [getThemeColor('local'), getThemeColor('cloud')],
                borderColor: [getThemeColor('borderLocal'), getThemeColor('borderCloud')],
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: buildChartOptions()
    });

    state.monthlyChart = new Chart(document.getElementById('monthlyComparisonChart'), {
        type: 'bar',
        data: {
            labels: ['Local TCO', 'Subscription'],
            datasets: [{
                data: [0, 0],
                backgroundColor: [getThemeColor('local'), getThemeColor('sub')],
                borderColor: [getThemeColor('borderLocal'), getThemeColor('borderSub')],
                borderWidth: 1,
                borderRadius: 6
            }]
        },
        options: buildChartOptions()
    });
}

function updateCharts(localPerM, cloudApi, totalLocal, sub) {
    const opts = buildChartOptions();
    if (state.chart) {
        state.chart.data.datasets[0].data = [isFinite(localPerM) ? localPerM : 0, cloudApi];
        state.chart.data.datasets[0].backgroundColor = [getThemeColor('local'), getThemeColor('cloud')];
        state.chart.data.datasets[0].borderColor = [getThemeColor('borderLocal'), getThemeColor('borderCloud')];
        state.chart.options = opts;
        state.chart.update();
    }
    if (state.monthlyChart) {
        state.monthlyChart.data.datasets[0].data = [isFinite(totalLocal) ? totalLocal : 0, sub];
        state.monthlyChart.data.datasets[0].backgroundColor = [getThemeColor('local'), getThemeColor('sub')];
        state.monthlyChart.data.datasets[0].borderColor = [getThemeColor('borderLocal'), getThemeColor('borderSub')];
        state.monthlyChart.options = opts;
        state.monthlyChart.update();
    }
}

function resetToDefaults() {
    // Cleanup
    state.chart?.destroy();
    state.monthlyChart?.destroy();
    
    // Reset state values
    Object.keys(DEFAULTS).forEach(key => {
        state[key] = DEFAULTS[key];
        const elId = key === 'selectedApiModel' ? 'apiModel' : (key === 'selectedSubscriptionPlan' ? 'subscriptionPlan' : key);
        const el = document.getElementById(elId);
        if (el) el.value = DEFAULTS[key];
    });
    
    document.getElementById('customSubscriptionPriceGroup')?.classList.add('hidden');

    initCharts();
    updateUI();
}

function setupEventListeners() {
    Object.keys(CONFIG.BOUNDS).forEach(key => {
        const el = document.getElementById(key);
        if (el) {
            el.addEventListener('input', (e) => {
                const originalVal = parseFloat(e.target.value);
                let val = isNaN(originalVal) ? 0 : originalVal;
                const bound = CONFIG.BOUNDS[key];
                
                // Clamping with visual feedback
                let clamped = false;
                if (val < bound.min) { val = bound.min; clamped = true; }
                if (val > bound.max) { val = bound.max; clamped = true; }
                
                if (clamped) {
                    el.value = String(val);
                    el.classList.add('input-clamped');
                    setTimeout(() => el.classList.remove('input-clamped'), 400);
                }
                
                state[key] = val;
                updateUI();
            });
        }
    });

    document.getElementById('apiModel')?.addEventListener('change', (e) => {
        state.selectedApiModel = e.target.value;
        updateUI();
    });

    document.getElementById('subscriptionPlan')?.addEventListener('change', (e) => {
        state.selectedSubscriptionPlan = e.target.value;
        document.getElementById('customSubscriptionPriceGroup')?.classList.toggle('hidden', e.target.value !== 'custom');
        updateUI();
    });

    document.getElementById('resetBtn')?.addEventListener('click', resetToDefaults);

    // Watch for theme changes — shared.js sets data-theme on documentElement
    const observer = new MutationObserver(() => updateUI());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

document.addEventListener('DOMContentLoaded', () => {
    initCharts();
    setupEventListeners();
    updateUI();
});
