// =====================================================
// Cluster Quality Metrics - UI Module (v1.2)
// Supports selective metric computation and N/A display
// =====================================================

// Metric flags (must match Rust constants!!!)
const METRIC_FLAGS = {
  SILHOUETTE: 1,
  DAVIES_BOULDIN: 2,
  CALINSKI_HARABASZ: 4,
  DBCV: 8,
  NOISE_RATIO: 16,
  SIZE_CV: 32,
  PER_CLUSTER: 64,
  ALL: 127
};

// Metric configuration with thresholds and display info
const METRIC_CONFIG = {
  silhouette: {
    name: "Silhouette Score",
    flag: METRIC_FLAGS.SILHOUETTE,
    description: "How well points fit their cluster vs. neighboring clusters",
    range: [-1, 1],
    thresholds: [
      { max: -0.25, label: "Poor", class: "poor" },
      { max: 0.25, label: "Weak", class: "weak" },
      { max: 0.5, label: "Fair", class: "fair" },
      { max: 0.7, label: "Good", class: "good" },
      { max: 1.01, label: "Strong", class: "strong" }
    ],
    perfect: 1.0,
    format: v => v.toFixed(3),
    higherIsBetter: true,
    defaultEnabled: true
  },
  davies_bouldin: {
    name: "Davies-Bouldin",
    flag: METRIC_FLAGS.DAVIES_BOULDIN,
    description: "Ratio of within-cluster scatter to between-cluster separation",
    range: [0, 3],
    thresholds: [
      { max: 0.4, label: "Excellent", class: "strong" },
      { max: 0.7, label: "Good", class: "good" },
      { max: 1.0, label: "Fair", class: "fair" },
      { max: 1.5, label: "Weak", class: "weak" },
      { max: Infinity, label: "Poor", class: "poor" }
    ],
    perfect: 0.0,
    format: v => v.toFixed(3),
    higherIsBetter: false,
    defaultEnabled: true
  },
  calinski_harabasz: {
    name: "Calinski-Harabasz",
    flag: METRIC_FLAGS.CALINSKI_HARABASZ,
    description: "Ratio of between-cluster to within-cluster variance",
    range: [0, null],
    thresholds: null,
    perfect: Infinity,
    format: v => v >= 10000 ? v.toExponential(2) : v.toFixed(1),
    higherIsBetter: true,
    relativeNote: "Compare across different parameters",
    defaultEnabled: true
  },
  dbcv: {
    name: "DBCV",
    flag: METRIC_FLAGS.DBCV,
    description: "Density-based clustering validation (designed for DBSCAN)",
    range: [-1, 1],
    thresholds: [
      { max: -0.25, label: "Poor", class: "poor" },
      { max: 0.0, label: "Weak", class: "weak" },
      { max: 0.25, label: "Fair", class: "fair" },
      { max: 0.5, label: "Good", class: "good" },
      { max: 1.01, label: "Strong", class: "strong" }
    ],
    perfect: 1.0,
    format: v => v.toFixed(3),
    higherIsBetter: true,
    defaultEnabled: true
  },
  noise_ratio: {
    name: "Noise Ratio",
    flag: METRIC_FLAGS.NOISE_RATIO,
    description: "Fraction of points classified as noise",
    range: [0, 1],
    thresholds: [
      { max: 0.01, label: "Very Low", class: "weak" },
      { max: 0.05, label: "Low", class: "good" },
      { max: 0.15, label: "Normal", class: "fair" },
      { max: 0.30, label: "High", class: "weak" },
      { max: 1.01, label: "Very High", class: "poor" }
    ],
    perfect: null,
    format: v => (v * 100).toFixed(1) + "%",
    higherIsBetter: null,
    defaultEnabled: true
  },
  size_cv: {
    name: "Size CV",
    flag: METRIC_FLAGS.SIZE_CV,
    description: "Coefficient of variation in cluster sizes",
    range: [0, 2],
    thresholds: [
      { max: 0.3, label: "Balanced", class: "strong" },
      { max: 0.6, label: "Moderate", class: "good" },
      { max: 1.0, label: "Varied", class: "fair" },
      { max: 1.5, label: "Imbalanced", class: "weak" },
      { max: Infinity, label: "Highly Imbalanced", class: "poor" }
    ],
    perfect: 0.0,
    format: v => v.toFixed(3),
    higherIsBetter: false,
    defaultEnabled: true
  }
};

// State
let metricsCollapsed = true;
let perClusterCollapsed = true;
let metricsSettingsCollapsed = true;
let lastMetrics = null;
let enabledMetrics = {};

// Initialize enabled metrics from config
function initEnabledMetrics() {
  for (const [key, config] of Object.entries(METRIC_CONFIG)) {
    enabledMetrics[key] = config.defaultEnabled;
  }
  enabledMetrics.per_cluster = true;
}
initEnabledMetrics();

// ---- Helper: Get enabled metric flags ----

function getMetricFlags() {
  let flags = 0;
  for (const [key, config] of Object.entries(METRIC_CONFIG)) {
    if (enabledMetrics[key]) {
      flags |= config.flag;
    }
  }
  if (enabledMetrics.per_cluster) {
    flags |= METRIC_FLAGS.PER_CLUSTER;
  }
  return flags;
}

// ---- Rendering Functions ----

function getMetricClass(metricKey, value) {
  const config = METRIC_CONFIG[metricKey];
  if (!config || !config.thresholds || !isFinite(value)) {
    return "";
  }
  
  for (const threshold of config.thresholds) {
    if (value <= threshold.max) {
      return threshold.class;
    }
  }
  return "";
}

function getMetricLabel(metricKey, value) {
  const config = METRIC_CONFIG[metricKey];
  if (!config || !config.thresholds || !isFinite(value)) {
    return "";
  }
  
  for (const threshold of config.thresholds) {
    if (value <= threshold.max) {
      return threshold.label;
    }
  }
  return "";
}

function renderMetricBar(metricKey, value, computed) {
  if (!computed) {
    return '<div class="metric-bar"><div class="metric-bar-fill disabled" style="width: 0%"></div></div>';
  }
  
  const config = METRIC_CONFIG[metricKey];
  if (!config || !isFinite(value)) {
    return '<div class="metric-bar"><div class="metric-bar-fill" style="width: 0%"></div></div>';
  }
  
  const [min, max] = config.range;
  const effectiveMax = max ?? value * 1.5;
  
  let percent;
  if (config.higherIsBetter === false) {
    percent = Math.max(0, Math.min(100, (1 - (value - min) / (effectiveMax - min)) * 100));
  } else {
    percent = Math.max(0, Math.min(100, ((value - min) / (effectiveMax - min)) * 100));
  }
  
  const qualityClass = getMetricClass(metricKey, value);
  
  return `
    <div class="metric-bar">
      <div class="metric-bar-fill ${qualityClass}" style="width: ${percent}%"></div>
    </div>
  `;
}

function renderMetricRow(metricKey, value, computed, showTiming = false, timingMs = null) {
  const config = METRIC_CONFIG[metricKey];
  if (!config) return '';
  
  // Display value or N/A
  let displayValue;
  let qualityClass = '';
  let label = '';
  
  if (!computed) {
    displayValue = '<span class="metric-na">N/A</span>';
  } else if (!isFinite(value)) {
    displayValue = '—';
  } else {
    displayValue = config.format(value);
    qualityClass = getMetricClass(metricKey, value);
    label = getMetricLabel(metricKey, value);
  }
  
  const timingHtml = showTiming && timingMs !== null && computed
    ? `<span class="metric-timing">${timingMs.toFixed(1)}ms</span>` 
    : '';
  
  const labelHtml = label 
    ? `<span class="metric-quality ${qualityClass}">${label}</span>` 
    : '';
  
  const perfectHtml = config.perfect !== null && config.perfect !== Infinity && computed
    ? `<span class="metric-perfect" title="Perfect score">⟨${config.format(config.perfect)}⟩</span>`
    : '';
  
  const enabledClass = computed ? '' : 'disabled';
  
  return `
    <div class="metric-row ${enabledClass}" data-metric="${metricKey}">
      <div class="metric-header">
        <span class="metric-name">${config.name}</span>
        ${timingHtml}
      </div>
      <div class="metric-value-row">
        <span class="metric-value ${qualityClass}">${displayValue}</span>
        ${labelHtml}
        ${perfectHtml}
      </div>
      ${renderMetricBar(metricKey, value, computed)}
    </div>
  `;
}

function renderPerClusterTable(perCluster, computed) {
  if (!computed) {
    return '<div class="no-data">Per-cluster metrics disabled</div>';
  }
  
  if (!perCluster || perCluster.length === 0) {
    return '<div class="no-data">No cluster data</div>';
  }
  
  const rows = perCluster.map(cluster => {
    const silhouetteClass = getMetricClass('silhouette', cluster.silhouette);
    const silhouetteValue = isFinite(cluster.silhouette) 
      ? cluster.silhouette.toFixed(3) 
      : '—';
    
    return `
      <tr>
        <td><span class="cluster-badge" style="background: ${getClusterColor(cluster.id)}">${cluster.id}</span></td>
        <td class="num">${cluster.size.toLocaleString()}</td>
        <td class="num ${silhouetteClass}">${silhouetteValue}</td>
        <td class="num">${cluster.avg_dist_to_centroid.toFixed(3)}</td>
        <td class="num">${cluster.max_dist_to_centroid.toFixed(3)}</td>
      </tr>
    `;
  }).join('');
  
  return `
    <table class="per-cluster-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Size</th>
          <th>Silhouette</th>
          <th>Avg Dist</th>
          <th>Max Dist</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function renderTimingBreakdown(timing, metrics) {
  if (!timing) return '';
  
  const items = [
    { name: 'Silhouette', ms: timing.silhouette_ms, computed: metrics.silhouette_computed },
    { name: 'Davies-Bouldin', ms: timing.davies_bouldin_ms, computed: metrics.davies_bouldin_computed },
    { name: 'Calinski-Harabasz', ms: timing.calinski_harabasz_ms, computed: metrics.calinski_harabasz_computed },
    { name: 'DBCV', ms: timing.dbcv_ms, computed: metrics.dbcv_computed },
    { name: 'Per-cluster', ms: timing.per_cluster_ms, computed: metrics.per_cluster_computed },
  ].filter(item => item.computed && item.ms > 0.1);
  
  const total = timing.total_ms;
  
  if (items.length === 0) {
    return `
      <div class="timing-breakdown">
        <div class="timing-header">
          <span>Compute Time</span>
          <span class="timing-total">${total.toFixed(1)}ms</span>
        </div>
      </div>
    `;
  }
  
  return `
    <div class="timing-breakdown">
      <div class="timing-header">
        <span>Compute Time</span>
        <span class="timing-total">${total.toFixed(1)}ms</span>
      </div>
      <div class="timing-bar">
        ${items.map((item, idx) => {
          const pct = (item.ms / total) * 100;
          return `<div class="timing-segment timing-${idx}" style="width: ${pct}%" title="${item.name}: ${item.ms.toFixed(1)}ms"></div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function renderMetricToggles() {
  const toggles = Object.entries(METRIC_CONFIG).map(([key, config]) => {
    const checked = enabledMetrics[key] ? 'checked' : '';
    return `
      <label class="metric-toggle">
        <input type="checkbox" data-metric="${key}" ${checked} onchange="CLUSTER_METRICS.toggleMetric('${key}', this.checked)">
        <span>${config.name}</span>
      </label>
    `;
  }).join('');
  
  const perClusterChecked = enabledMetrics.per_cluster ? 'checked' : '';
  
  return `
    <div class="metric-toggles-grid">
      ${toggles}
      <label class="metric-toggle">
        <input type="checkbox" data-metric="per_cluster" ${perClusterChecked} onchange="CLUSTER_METRICS.toggleMetric('per_cluster', this.checked)">
        <span>Per-Cluster Stats</span>
      </label>
    </div>
    <div class="metric-toggle-actions">
      <button class="mini-btn" onclick="CLUSTER_METRICS.enableAllMetrics()">Enable All</button>
      <button class="mini-btn" onclick="CLUSTER_METRICS.disableExpensiveMetrics()">Fast Only</button>
    </div>
  `;
}

function renderMetricsPanel(metrics) {
  lastMetrics = metrics;
  
  const container = el('metricsContent');
  if (!container) return;
  
  const showTiming = el('showMetricTiming')?.checked ?? false;
  
  const html = `
    <!-- Metric Settings -->
    <div class="metrics-settings-section">
      <div class="metrics-settings-header" onclick="CLUSTER_METRICS.toggleMetricsSettings()">
        <span class="collapse-icon" id="metricsSettingsIcon">${metricsSettingsCollapsed ? '▶' : '▼'}</span>
        <span>Metric Settings</span>
      </div>
      <div class="metrics-settings-content" id="metricsSettingsContent" style="display: ${metricsSettingsCollapsed ? 'none' : 'block'}">
        ${renderMetricToggles()}
      </div>
    </div>
    
    <!-- Metrics Grid -->
    <div class="metrics-grid">
      ${renderMetricRow('silhouette', metrics.silhouette, metrics.silhouette_computed, showTiming, metrics.timing?.silhouette_ms)}
      ${renderMetricRow('davies_bouldin', metrics.davies_bouldin, metrics.davies_bouldin_computed, showTiming, metrics.timing?.davies_bouldin_ms)}
      ${renderMetricRow('calinski_harabasz', metrics.calinski_harabasz, metrics.calinski_harabasz_computed, showTiming, metrics.timing?.calinski_harabasz_ms)}
      ${renderMetricRow('dbcv', metrics.dbcv, metrics.dbcv_computed, showTiming, metrics.timing?.dbcv_ms)}
      ${renderMetricRow('noise_ratio', metrics.noise_ratio, metrics.noise_ratio_computed, showTiming, metrics.timing?.noise_ratio_ms)}
      ${renderMetricRow('size_cv', metrics.size_cv, metrics.size_cv_computed, showTiming, metrics.timing?.size_cv_ms)}
    </div>
    
    ${metrics.silhouette_computed && metrics.silhouette_samples ? `
      <div class="metrics-note">
        Silhouette computed on ${metrics.silhouette_samples.toLocaleString()} sampled points
      </div>
    ` : ''}
    
    ${showTiming ? renderTimingBreakdown(metrics.timing, metrics) : ''}
    
    <!-- Per-Cluster Section -->
    <div class="per-cluster-section">
      <div class="per-cluster-header" onclick="CLUSTER_METRICS.togglePerCluster()">
        <span class="collapse-icon">${perClusterCollapsed ? '▶' : '▼'}</span>
        <span>Per-Cluster Breakdown (${metrics.cluster_count} clusters)</span>
      </div>
      <div class="per-cluster-content" style="display: ${perClusterCollapsed ? 'none' : 'block'}">
        ${renderPerClusterTable(metrics.per_cluster, metrics.per_cluster_computed)}
      </div>
    </div>
    
    <button class="mini-btn metrics-help-btn" onclick="CLUSTER_METRICS.showMetricsHelp()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
      What do these mean?
    </button>
  `;
  
  container.innerHTML = html;
}

// ---- Toggle Functions ----

function toggleMetrics() {
  metricsCollapsed = !metricsCollapsed;
  const content = el('metricsContent');
  const icon = el('metricsCollapseIcon');
  
  if (content) {
    content.style.display = metricsCollapsed ? 'none' : 'block';
  }
  if (icon) {
    icon.textContent = metricsCollapsed ? '▶' : '▼';
  }
}

function togglePerCluster() {
  perClusterCollapsed = !perClusterCollapsed;
  
  const content = document.querySelector('.per-cluster-content');
  const icon = document.querySelector('.per-cluster-header .collapse-icon');
  
  if (content) {
    content.style.display = perClusterCollapsed ? 'none' : 'block';
  }
  if (icon) {
    icon.textContent = perClusterCollapsed ? '▶' : '▼';
  }
}

function toggleMetricsSettings() {
  metricsSettingsCollapsed = !metricsSettingsCollapsed;
  
  const content = el('metricsSettingsContent');
  const icon = el('metricsSettingsIcon');
  
  if (content) {
    content.style.display = metricsSettingsCollapsed ? 'none' : 'block';
  }
  if (icon) {
    icon.textContent = metricsSettingsCollapsed ? '▶' : '▼';
  }
}

function toggleMetric(metricKey, enabled) {
  enabledMetrics[metricKey] = enabled;
  // Don't auto-recompute - user can click "Run" again
}

function enableAllMetrics() {
  for (const key of Object.keys(METRIC_CONFIG)) {
    enabledMetrics[key] = true;
  }
  enabledMetrics.per_cluster = true;
  
  // Update checkboxes
  document.querySelectorAll('.metric-toggle input').forEach(cb => {
    cb.checked = true;
  });
}

function disableExpensiveMetrics() {
  // Keep only fast metrics
  enabledMetrics.silhouette = false;  // Most expensive
  enabledMetrics.dbcv = false;        // Second most expensive
  enabledMetrics.davies_bouldin = true;
  enabledMetrics.calinski_harabasz = true;
  enabledMetrics.noise_ratio = true;
  enabledMetrics.size_cv = true;
  enabledMetrics.per_cluster = true;
  
  // Update checkboxes
  document.querySelectorAll('.metric-toggle input').forEach(cb => {
    const key = cb.dataset.metric;
    cb.checked = enabledMetrics[key];
  });
}

function showMetricsHelp() {
  const modal = el('metricsHelpModal');
  if (modal) {
    modal.style.display = 'flex';
  }
}

function hideMetricsHelp() {
  const modal = el('metricsHelpModal');
  if (modal) {
    modal.style.display = 'none';
  }
}

// ---- Cluster color helper (should match main visualization) ----

function getClusterColor(label) {
  if (label < 0) return '#64748b';
  
  const colors = [
    '#22c55e', '#3b82f6', '#f97316', '#a855f7', '#ec4899',
    '#14b8a6', '#eab308', '#ef4444', '#8b5cf6', '#06b6d4',
    '#84cc16', '#f43f5e', '#6366f1', '#10b981', '#f59e0b'
  ];
  
  return colors[label % colors.length];
}

// ---- DOM helper ----

function el(id) {
  return document.getElementById(id);
}

// ---- Integration with DBSCAN ----

async function computeAndDisplayMetrics(wasmApi, data, nRows, nDims, labels, minPts) {
  if (!wasmApi?.compute_cluster_metrics) {
    console.warn('compute_cluster_metrics not available');
    return null;
  }
  
  try {
    const flags = getMetricFlags();
    
    const maxDbcvSamples = 0; // Max samples per cluster for DBCV (match HTML default) //we will have to change this for large datasets to something like 1,000.
    //set to 0 to get matched behavior first.

    const metrics = wasmApi.compute_cluster_metrics(
      data,
      nRows,
      nDims,
      labels,
      minPts,
      3000,           // max silhouette samples
      0.10,           // silhouette sample fraction
      maxDbcvSamples, // max samples per cluster for DBCV
      flags           // metric flags
    );

    
    renderMetricsPanel(metrics);
    
    return metrics;
  } catch (err) {
    console.error('Failed to compute cluster metrics:', err);
    return null;
  }
}


// ---- CSS Styles ----

const METRICS_CSS = `
/* Cluster Quality Metrics Panel */
.metrics-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  margin-top: 16px;
}

.metrics-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid var(--border-color);
  user-select: none;
}

.metrics-header:hover {
  background: rgba(255, 255, 255, 0.02);
}

.metrics-header h3 {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  flex: 1;
}

.collapse-icon {
  font-size: 0.7rem;
  color: var(--text-muted);
  transition: transform 0.2s;
}

#metricsContent {
  padding: 16px;
}

/* Metric Settings Section */
.metrics-settings-section {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.metrics-settings-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 0;
}

.metrics-settings-header:hover {
  color: var(--text-primary);
}

.metrics-settings-content {
  margin-top: 12px;
}

.metric-toggles-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.metric-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-secondary);
  cursor: pointer;
}

.metric-toggle input {
  width: 14px;
  height: 14px;
  accent-color: var(--accent-it);
}

.metric-toggle-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

/* Metrics Grid */
.metrics-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.metric-row {
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
}

.metric-row:last-child {
  border-bottom: none;
}

.metric-row.disabled {
  opacity: 0.5;
}

.metric-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.metric-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.metric-timing {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  color: var(--text-muted);
  opacity: 0.7;
}

.metric-value-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.metric-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.metric-na {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.9rem;
  color: var(--text-muted);
  font-style: italic;
}

.metric-quality {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
}

.metric-quality.strong { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
.metric-quality.good { background: rgba(34, 211, 238, 0.2); color: #22d3ee; }
.metric-quality.fair { background: rgba(234, 179, 8, 0.2); color: #eab308; }
.metric-quality.weak { background: rgba(249, 115, 22, 0.2); color: #f97316; }
.metric-quality.poor { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

.metric-value.strong { color: #22c55e; }
.metric-value.good { color: #22d3ee; }
.metric-value.fair { color: #eab308; }
.metric-value.weak { color: #f97316; }
.metric-value.poor { color: #ef4444; }

.metric-perfect {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  color: var(--text-muted);
  opacity: 0.5;
}

.metric-bar {
  height: 4px;
  background: var(--bg-input);
  border-radius: 2px;
  overflow: hidden;
}

.metric-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
  background: var(--text-muted);
}

.metric-bar-fill.disabled {
  background: var(--bg-input);
}

.metric-bar-fill.strong { background: linear-gradient(90deg, #22c55e, #16a34a); }
.metric-bar-fill.good { background: linear-gradient(90deg, #22d3ee, #0891b2); }
.metric-bar-fill.fair { background: linear-gradient(90deg, #eab308, #ca8a04); }
.metric-bar-fill.weak { background: linear-gradient(90deg, #f97316, #ea580c); }
.metric-bar-fill.poor { background: linear-gradient(90deg, #ef4444, #dc2626); }

.metrics-note {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: var(--text-muted);
  padding: 8px 0;
  border-top: 1px solid var(--border-color);
  margin-top: 8px;
}

/* Timing Breakdown */
.timing-breakdown {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.timing-header {
  display: flex;
  justify-content: space-between;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.timing-total {
  color: var(--accent-it);
}

.timing-bar {
  display: flex;
  height: 6px;
  background: var(--bg-input);
  border-radius: 3px;
  overflow: hidden;
  gap: 1px;
}

.timing-segment {
  opacity: 0.8;
}

.timing-0 { background: var(--accent-it); }
.timing-1 { background: var(--accent-purple); }
.timing-2 { background: var(--accent-success); }
.timing-3 { background: var(--accent-warning); }
.timing-4 { background: var(--accent-orange); }

/* Per-Cluster Section */
.per-cluster-section {
  margin-top: 16px;
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
}

.per-cluster-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 0;
}

.per-cluster-header:hover {
  color: var(--text-primary);
}

.per-cluster-content {
  margin-top: 12px;
}

.per-cluster-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
}

.per-cluster-table th {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-muted);
  font-weight: 500;
  text-transform: uppercase;
  font-size: 0.65rem;
}

.per-cluster-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.per-cluster-table td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.cluster-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  color: #000;
  font-weight: 600;
  font-size: 0.7rem;
}

.no-data {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-muted);
  font-style: italic;
  padding: 8px 0;
}

.metrics-help-btn {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Help Modal */
#metricsHelpModal {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.metrics-help-content {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 24px;
}

.metrics-help-content h2 {
  margin: 0 0 20px 0;
  font-size: 1.25rem;
  color: var(--text-primary);
}

.help-metric {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.help-metric:last-of-type {
  border-bottom: none;
  margin-bottom: 0;
}

.help-metric h3 {
  margin: 0 0 8px 0;
  font-size: 0.9rem;
  color: var(--accent-it);
}

.help-metric p {
  margin: 0 0 8px 0;
  font-size: 0.85rem;
  color: var(--text-secondary);
  line-height: 1.5;
}

.help-metric .help-range {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-muted);
}

.help-close-btn {
  margin-top: 16px;
  width: 100%;
}
`;

// ---- HTML Template ----

const METRICS_HTML = `
<!-- Cluster Quality Metrics Card -->
<div class="metrics-card" id="metricsCard">
  <div class="metrics-header" onclick="CLUSTER_METRICS.toggleMetrics()">
    <span class="collapse-icon" id="metricsCollapseIcon">▶</span>
    <h3>Cluster Quality Metrics</h3>
    <label class="inline-check" onclick="event.stopPropagation()">
      <input type="checkbox" id="showMetricTiming" onchange="if(CLUSTER_METRICS.lastMetrics) CLUSTER_METRICS.renderMetricsPanel(CLUSTER_METRICS.lastMetrics)">
      <span style="font-size: 0.7rem">Timing</span>
    </label>
  </div>
  <div id="metricsContent" style="display: none;">
    <div class="no-data">Run DBSCAN to see metrics</div>
  </div>
</div>

<!-- Metrics Help Modal -->
<div id="metricsHelpModal" onclick="if(event.target === this) CLUSTER_METRICS.hideMetricsHelp()">
  <div class="metrics-help-content">
    <h2>Understanding Cluster Quality Metrics</h2>
    
    <div class="help-metric">
      <h3>Silhouette Score</h3>
      <p>Measures how similar each point is to its own cluster compared to other clusters. A point's silhouette value ranges from -1 to +1, where +1 means it's well-matched to its cluster and far from neighbors.</p>
      <div class="help-range">Range: -1 to +1 • Perfect: +1 • Higher is better</div>
    </div>
    
    <div class="help-metric">
      <h3>Davies-Bouldin Index</h3>
      <p>Measures the average "similarity" between each cluster and its most similar one. Similarity here is the ratio of within-cluster distances to between-cluster distances. Lower values indicate better separation.</p>
      <div class="help-range">Range: 0 to ∞ • Perfect: 0 • Lower is better</div>
    </div>
    
    <div class="help-metric">
      <h3>Calinski-Harabasz Index</h3>
      <p>Also called the Variance Ratio Criterion. Measures the ratio of between-cluster dispersion to within-cluster dispersion. Higher values suggest dense, well-separated clusters. Best used for comparing different parameter choices.</p>
      <div class="help-range">Range: 0 to ∞ • Higher is better • Compare relatively</div>
    </div>
    
    <div class="help-metric">
      <h3>DBCV (Density-Based Clustering Validation)</h3>
      <p>Specifically designed for density-based clustering like DBSCAN. Considers the density structure of clusters rather than just distances. Uses mutual reachability distances to assess cluster quality.</p>
      <div class="help-range">Range: -1 to +1 • Perfect: +1 • Higher is better</div>
    </div>
    
    <div class="help-metric">
      <h3>Noise Ratio</h3>
      <p>The fraction of points classified as noise. Some noise is normal for real-world data (1-10%). Very low noise might mean ε is too large; very high noise might mean ε is too small or min_pts too high.</p>
      <div class="help-range">Range: 0% to 100% • Ideal: 1-10% for most data</div>
    </div>
    
    <div class="help-metric">
      <h3>Size CV (Coefficient of Variation)</h3>
      <p>Measures how balanced your cluster sizes are. Low values mean clusters are similarly sized. High values indicate one dominant cluster or many tiny fragments, which might warrant parameter adjustment.</p>
      <div class="help-range">Range: 0 to ∞ • Perfect: 0 • Lower is better</div>
    </div>
    
    <p style="margin-top: 20px; padding: 12px; background: var(--bg-secondary); border-radius: 8px; font-size: 0.8rem; color: var(--text-muted);">
       <strong>Tip:</strong> No single metric tells the whole story. Use these together with visual inspection. Different metrics may disagree! That's normal and reflects different aspects of clustering quality.
    </p>
    
    <button class="tool-btn primary help-close-btn" onclick="CLUSTER_METRICS.hideMetricsHelp()">Got it</button>
  </div>
</div>
`;

// ---- Export ----

window.CLUSTER_METRICS = {
  // Core functions
  computeAndDisplayMetrics,
  renderMetricsPanel,
  
  // Toggle functions
  toggleMetrics,
  togglePerCluster,
  toggleMetricsSettings,
  toggleMetric,
  enableAllMetrics,
  disableExpensiveMetrics,
  
  // Help
  showMetricsHelp,
  hideMetricsHelp,

  
  // Configuration
  METRIC_FLAGS,
  METRIC_CONFIG,
  enabledMetrics,
  lastMetrics,
  
  // HTML/CSS templates
  CSS: METRICS_CSS,
  HTML: METRICS_HTML
};
