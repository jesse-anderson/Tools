/* =========================================================
   DBSCAN Visualizer vNext 
   - Speed controls with play/pause/step
   - Epsilon radius visualization
   - K-distance plot
   - Core/border/noise classification
   
   IMPORTANT: This file MUST be loaded as an ES module:
   <script type="module" src="dbscan-visualizer-vnext.js"></script>
   ========================================================= */

const UI_VERSION = "1.6.0";

// ---- DOM Helpers ----
const el = (id) => document.getElementById(id);

// ---- Engine State ----
let wasmApi = null;
let engineMode = "loading";

// ---- Animation State ----
const ANIM_STATE = {
  running: false,
  paused: true,
  events: [],
  currentStep: 0,
  labels: null,
  points2d: null,
  corePoints: new Set(),
  borderPoints: new Set(),
  neighborSet: new Set(),
  currentPoint: -1,
  raf: null,
  speed: 1.0,
  eps: 0.5,
  minPts: 5,
  means: null,
  stds: null,
  usedRowMap: [],
  history: [] // For step-back functionality
};

// ---- Badge Management ----
function setBadge(node, text, clsToAdd) {
  if (!node) return;
  node.textContent = text;
  node.classList.remove("ok", "err", "warn", "coming", "active");
  if (clsToAdd) node.classList.add(clsToAdd);
}

function setEngineBadgeLoading() {
  setBadge(el("engineBadge"), "ENGINE: LOADING", "warn");
}

function setEngineBadgeWasm(versionStr) {
  setBadge(el("engineBadge"), `ENGINE: WASM (${versionStr})`, "ok");
}

function setEngineBadgeFallback(reason = "JS fallback") {
  setBadge(el("engineBadge"), `ENGINE: FALLBACK (${reason})`, "warn");
}

function setUIBadge() {
  setBadge(el("uiBadge"), `UI: ${UI_VERSION}`, null);
}

// ---- Data Validation ----
function validateAndCleanData(data, nRows, nDims, missingPolicy) {
  const errors = [];
  const warnings = [];
  const cleanedData = new Float32Array(data.length);
  const usedMask = new Uint8Array(nRows).fill(1);
  let droppedRows = 0;
  let imputedValues = 0;
  
  // First pass: identify issues
  const columnStats = [];
  for (let d = 0; d < nDims; d++) {
    columnStats.push({
      validCount: 0,
      sum: 0,
      min: Infinity,
      max: -Infinity,
      issues: []
    });
  }
  
  for (let r = 0; r < nRows; r++) {
    for (let d = 0; d < nDims; d++) {
      const idx = r * nDims + d;
      const val = data[idx];
      
      if (isFinite(val)) {
        columnStats[d].validCount++;
        columnStats[d].sum += val;
        columnStats[d].min = Math.min(columnStats[d].min, val);
        columnStats[d].max = Math.max(columnStats[d].max, val);
        cleanedData[idx] = val;
      } else {
        // Record the issue with context
        const issueType = Number.isNaN(val) ? "NaN" : 
                         val === Infinity ? "Infinity" :
                         val === -Infinity ? "-Infinity" :
                         val === null ? "null" :
                         val === undefined ? "undefined" :
                         typeof val === "string" ? `string "${val.substring(0, 20)}"` :
                         `unknown (${typeof val})`;
        
        columnStats[d].issues.push({
          row: r,
          type: issueType,
          originalValue: val
        });
        
        cleanedData[idx] = NaN;
      }
    }
  }
  
  // Check for columns with all missing values
  for (let d = 0; d < nDims; d++) {
    if (columnStats[d].validCount === 0) {
      errors.push(`Column ${d} has no valid numeric values`);
    } else if (columnStats[d].validCount < nRows * 0.5) {
      warnings.push(`Column ${d} has ${((1 - columnStats[d].validCount / nRows) * 100).toFixed(1)}% missing values`);
    }
  }
  
  // Apply missing policy
  if (missingPolicy === 2) { // Fail
    // Collect detailed error information
    const issuesByRow = new Map();
    
    for (let d = 0; d < nDims; d++) {
      for (const issue of columnStats[d].issues) {
        if (!issuesByRow.has(issue.row)) {
          issuesByRow.set(issue.row, []);
        }
        issuesByRow.set(issue.row, [...issuesByRow.get(issue.row), { dim: d, ...issue }]);
      }
    }
    
    if (issuesByRow.size > 0) {
      // Find first few issues to report
      const firstIssues = Array.from(issuesByRow.entries()).slice(0, 5);
      const issueMessages = firstIssues.map(([row, issues]) => {
        const dimList = issues.map(i => `dim ${i.dim} (${i.type})`).join(", ");
        return `  Row ${row}: ${dimList}`;
      });
      
      const additionalCount = issuesByRow.size - firstIssues.length;
      const moreMsg = additionalCount > 0 ? `\n  ... and ${additionalCount} more rows with issues` : "";
      
      throw new Error(
        `Missing/non-numeric values detected under Fail policy:\n${issueMessages.join("\n")}${moreMsg}\n\n` +
        `Suggestions:\n` +
        `  • Switch to "Drop Rows" policy to skip problematic rows\n` +
        `  • Switch to "Impute Mean" policy to fill missing values\n` +
        `  • Check your CSV for formatting issues (extra commas, quotes, etc.)\n` +
        `  • Ensure numeric columns don't contain text or special characters`
      );
    }
  } else if (missingPolicy === 0) { // Drop
    for (let r = 0; r < nRows; r++) {
      let hasIssue = false;
      for (let d = 0; d < nDims; d++) {
        if (!isFinite(cleanedData[r * nDims + d])) {
          hasIssue = true;
          break;
        }
      }
      if (hasIssue) {
        usedMask[r] = 0;
        droppedRows++;
      }
    }
    
    if (droppedRows > nRows * 0.5) {
      warnings.push(`${droppedRows} rows (${(droppedRows / nRows * 100).toFixed(1)}%) dropped due to missing values`);
    }
  } else if (missingPolicy === 1) { // Impute
    // Compute means for imputation
    const means = columnStats.map(cs => cs.validCount > 0 ? cs.sum / cs.validCount : 0);
    
    for (let r = 0; r < nRows; r++) {
      for (let d = 0; d < nDims; d++) {
        const idx = r * nDims + d;
        if (!isFinite(cleanedData[idx])) {
          cleanedData[idx] = means[d];
          imputedValues++;
        }
      }
    }
    
    if (imputedValues > 0) {
      warnings.push(`${imputedValues} values imputed with column means`);
    }
  }
  
  return {
    data: cleanedData,
    usedMask,
    droppedRows,
    imputedValues,
    errors,
    warnings,
    columnStats
  };
}

// ---- Enhanced WASM API Wrapper ----
function enhanceWasmApi(mod) {
  const api = { ...mod };

  if (typeof api.wasm_version !== "function") {
    api.wasm_version = () => {
      if (typeof api.version === "function") {
        const s = String(api.version());
        const parts = s.split("/");
        return parts[1] || s;
      }
      return "unknown";
    };
  }

  // Enhanced dbscan_trace with better error handling
  if (typeof api.dbscan_trace !== "function") {
    api.dbscan_trace = function dbscan_trace(
      flat,
      nPoints,
      nDims,
      eps,
      minPts,
      standardize,
      maxPoints,
      maxNeighbors,
      slow
    ) {
      if (typeof api.dbscan_fit !== "function") {
        throw new Error("WASM export dbscan_fit is missing");
      }

      // Ensure Float32Array
      if (!(flat instanceof Float32Array)) {
        flat = new Float32Array(flat);
      }

      // Downsample if needed
      if (Number.isFinite(maxPoints) && nPoints > maxPoints) {
        const stride = Math.ceil(nPoints / maxPoints);
        const n2 = Math.ceil(nPoints / stride);
        const out = new Float32Array(n2 * nDims);

        for (let i = 0, r = 0; i < n2; i++, r += stride) {
          const src0 = r * nDims;
          out.set(flat.subarray(src0, src0 + nDims), i * nDims);
        }

        flat = out;
        nPoints = n2;
      }

      const params = window.__DBSCAN_TOOL__?.getParams?.() || {};
      let missingPolicy = params.missingPolicy;

      // For trace, force FAIL -> to avoid index mismatches
      if (missingPolicy === 0) missingPolicy = 2;
      if (missingPolicy == null) missingPolicy = 2;

      const dims = params.dims;
      const dx = Array.isArray(dims) && dims.length > 0 ? dims[0] : 0;
      const dy = Array.isArray(dims) && dims.length > 1 ? dims[1] : 1;

      const traceMaxEvents = slow
        ? Math.max(2000, Math.min(200000, nPoints * 8))
        : Math.max(1200, Math.min(200000, nPoints * 4));

      const res = api.dbscan_fit(
        flat,
        nPoints,
        nDims,
        eps,
        minPts,
        missingPolicy,
        standardize,
        true,
        traceMaxEvents,
        maxNeighbors
      );

      const means = res.means;
      const stds = res.stds;

      const x = new Array(nPoints);
      const y = new Array(nPoints);

      for (let i = 0; i < nPoints; i++) {
        let vx = flat[i * nDims + dx];
        let vy = (dy < nDims) ? flat[i * nDims + dy] : 0;

        if (standardize && means && stds && means.length >= nDims && stds.length >= nDims) {
          vx = (vx - means[dx]) / stds[dx];
          if (dy < nDims) vy = (vy - means[dy]) / stds[dy];
        }

        x[i] = vx;
        y[i] = vy;
      }

      const labels = new Array(nPoints).fill(-1);
      const events = [];

      const kind = res.trace_kind;
      const p = res.trace_p;
      const cluster = res.trace_cluster;
      const offsets = res.trace_neighbor_offsets;
      const neighbors = res.trace_neighbors;

      const evCount = kind ? kind.length : 0;

      for (let e = 0; e < evCount; e++) {
        const i = p[e];
        const start = offsets[e];
        const end = offsets[e + 1];
        const neighArr = Array.from(neighbors.subarray(start, end));
        const is_core = neighArr.length >= minPts;

        events.push({
          kind: "visit",
          i,
          neighbors: neighArr,
          is_core,
          cluster: cluster[e]
        });

        const lbl = cluster[e];
        if (typeof lbl === "number" && lbl >= 0) {
          events.push({
            kind: "assign",
            i,
            label: lbl
          });
        }
      }

      return {
        points2d: { x, y },
        labels,
        events,
        meta: { n: nPoints, eps, minPts, dims: [dx, dy] },
        means,
        stds
      };
    };
  }

  return api;
}

// ---- WASM Initialization ----
async function initWasm() {
  // Get base URL - works in both module and non-module contexts
  let baseUrl;
  try {
    baseUrl = new URL(".", import.meta.url).href;
  } catch (e) {
    // Fallback for non-module context
    // Note: document.currentScript is null inside async callbacks
    const scriptEl = document.currentScript || 
                     document.querySelector('script[src*="dbscan-visualizer"]');
    if (scriptEl?.src) {
      baseUrl = new URL(".", scriptEl.src).href;
    } else {
      // Last resort: use document location
      baseUrl = new URL(".", window.location.href).href;
    }
  }
  
  const wrapperUrl = new URL("WASM/dbscan_wasm.js", baseUrl);
  const wasmBinUrl = new URL("WASM/dbscan_wasm_bg.wasm", baseUrl);

  const mod = await import(wrapperUrl.toString());
  const init = mod.default;

  const resp = await fetch(wasmBinUrl.toString(), { cache: "no-store" });
  if (!resp.ok) {
    throw new Error(`Failed to fetch WASM: ${resp.status} ${resp.statusText}`);
  }
  const bytes = await resp.arrayBuffer();
  // Use new wasm-bindgen init API to avoid deprecation warning
  await init({ module_or_path: bytes });

  return enhanceWasmApi(mod);
}

// ---- Speed Control ----
function getSpeedMultiplier() {
  const slider = el("speedSlider");
  if (!slider) return 1.0;
  
  const val = parseFloat(slider.value);
  return Math.pow(10, val);
}

function updateSpeedDisplay() {
  const speed = getSpeedMultiplier();
  const display = el("speedValue");
  if (display) {
    display.textContent = speed < 1 ? `${speed.toFixed(2)}x` : `${speed.toFixed(1)}x`;
  }
  ANIM_STATE.speed = speed;
}

// ---- Animation Controls ----
function togglePlayPause() {
  if (ANIM_STATE.events.length === 0) return;
  
  if (ANIM_STATE.running) {
    pauseAnimation();
  } else {
    playAnimation();
  }
}

function playAnimation() {
  ANIM_STATE.running = true;
  ANIM_STATE.paused = false;
  updatePlayButton();
  runAnimationLoop();
}

function pauseAnimation() {
  ANIM_STATE.running = false;
  ANIM_STATE.paused = true;
  if (ANIM_STATE.raf) {
    clearTimeout(ANIM_STATE.raf); 
    ANIM_STATE.raf = null;
  }
  updatePlayButton();
}

function stepForward(count = 1) {
  if (ANIM_STATE.events.length === 0) return;
  pauseAnimation();
  
  const target = Math.min(ANIM_STATE.events.length, ANIM_STATE.currentStep + count);
  
  while (ANIM_STATE.currentStep < target) {
    applyAnimationEvent(ANIM_STATE.currentStep);
    ANIM_STATE.currentStep++;
  }
  
  updateAnimationState();
  renderAnimationFrame();
}

function stepBackward(count = 1) {
  if (ANIM_STATE.events.length === 0) return;
  pauseAnimation();
  
  const target = Math.max(0, ANIM_STATE.currentStep - count);
  
  // Rebuild state from beginning
  resetAnimationState();
  
  while (ANIM_STATE.currentStep < target) {
    applyAnimationEvent(ANIM_STATE.currentStep);
    ANIM_STATE.currentStep++;
  }
  
  updateAnimationState();
  renderAnimationFrame();
}

function resetAnimation() {
  pauseAnimation();
  resetAnimationState();
  updateAnimationState();
  renderAnimationFrame();
}

function resetAnimationState() {
  ANIM_STATE.currentStep = 0;
  if (ANIM_STATE.labels) {
    ANIM_STATE.labels.fill(-2);
  }
  ANIM_STATE.corePoints.clear();
  ANIM_STATE.borderPoints.clear();
  ANIM_STATE.neighborSet.clear();
  ANIM_STATE.currentPoint = -1;
}

function applyAnimationEvent(idx) {
  const ev = ANIM_STATE.events[idx];
  if (!ev) return;
  
  if (ev.kind === "visit") {
    ANIM_STATE.currentPoint = ev.i;
    ANIM_STATE.neighborSet = new Set(ev.neighbors || []);
    
    if (ev.is_core) {
      ANIM_STATE.corePoints.add(ev.i);
    }
    
    // Only update label if this visit event explicitly marks noise or assigns a cluster.
    // Don't change label if cluster is -2 (unclassified sentinel).
    // This prevents drift when the trace stream isn't perfectly consistent.
    if (ev.cluster === -1) {
      // Explicitly marked as noise
      ANIM_STATE.labels[ev.i] = -1;
      ANIM_STATE.corePoints.delete(ev.i);
      ANIM_STATE.borderPoints.delete(ev.i);
    } else if (ev.cluster >= 0) {
      // Assigned to a cluster
      ANIM_STATE.labels[ev.i] = ev.cluster;
      if (!ev.is_core) {
        ANIM_STATE.borderPoints.add(ev.i);
      }
    }
    // If cluster is -2 (or other sentinel), leave label unchanged
  } else if (ev.kind === "assign") {
    // Explicit assignment event, always apply
    ANIM_STATE.labels[ev.i] = ev.label;
    
    if (!ANIM_STATE.corePoints.has(ev.i) && ev.label >= 0) {
      ANIM_STATE.borderPoints.add(ev.i);
    }
  }
}

function updatePlayButton() {
  const btn = el("btnPlay");
  const icon = el("playIcon");
  if (!btn || !icon) return;
  
  if (ANIM_STATE.running) {
    icon.innerHTML = '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>';
    btn.title = "Pause";
  } else {
    icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/>';
    btn.title = "Play";
  }
}

function updateAnimationState() {
  const total = ANIM_STATE.events.length;
  const current = ANIM_STATE.currentStep;
  const pct = total > 0 ? (current / total * 100) : 0;
  
  const progressFill = el("progressFill");
  const progressText = el("progressText");
  const animStatus = el("animStatus");
  
  if (progressFill) progressFill.style.width = `${pct}%`;
  if (progressText) progressText.textContent = `${current} / ${total} events`;
  if (animStatus) {
    animStatus.textContent = ANIM_STATE.running ? "Playing" : 
                             (ANIM_STATE.paused ? "Paused" : "Ready");
  }
}

function runAnimationLoop() {
  if (!ANIM_STATE.running) return;
  
  const speed = ANIM_STATE.speed;
  const eventsPerFrame = Math.max(1, Math.round(speed * 3));
  
  for (let i = 0; i < eventsPerFrame && ANIM_STATE.currentStep < ANIM_STATE.events.length; i++) {
    applyAnimationEvent(ANIM_STATE.currentStep);
    ANIM_STATE.currentStep++;
  }
  
  updateAnimationState();
  renderAnimationFrame();
  
  if (ANIM_STATE.currentStep >= ANIM_STATE.events.length) {
    pauseAnimation();
    if (el("animStatus")) el("animStatus").textContent = "Complete";
    return;
  }
  
  // Schedule next frame based on speed
  const delay = Math.max(16, Math.round(80 / speed));
  ANIM_STATE.raf = setTimeout(() => {
    if (ANIM_STATE.running) runAnimationLoop();
  }, delay);
}

// ---- Rendering ----
function renderAnimationFrame() {
  const canvas = el("traceCanvas") || el("plotCanvas");
  if (!canvas || !ANIM_STATE.points2d) return;
  
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  
  const dpr = window.devicePixelRatio || 1;
  
  // Clear
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-card') || '#181f2a';
  ctx.fillRect(0, 0, w, h);
  
  const pts = ANIM_STATE.points2d;
  const labels = ANIM_STATE.labels;
  const n = pts.x.length;
  
  // Compute bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    if (!isFinite(pts.x[i]) || !isFinite(pts.y[i])) continue;
    minX = Math.min(minX, pts.x[i]);
    maxX = Math.max(maxX, pts.x[i]);
    minY = Math.min(minY, pts.y[i]);
    maxY = Math.max(maxY, pts.y[i]);
  }
  
  const pad = 40;
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min((w - 2 * pad) / rangeX, (h - 2 * pad) / rangeY);
  
  const offsetX = pad + (w - 2 * pad - rangeX * scale) / 2;
  const offsetY = pad + (h - 2 * pad - rangeY * scale) / 2;
  
  function toScreen(x, y) {
    return {
      sx: offsetX + (x - minX) * scale,
      sy: h - offsetY - (y - minY) * scale
    };
  }
  
  const pointSize = 3;
  const showRadius = el("showRadius")?.checked ?? true;
  
  // Draw epsilon radius
  if (showRadius && ANIM_STATE.currentPoint >= 0) {
    const cp = ANIM_STATE.currentPoint;
    const { sx, sy } = toScreen(pts.x[cp], pts.y[cp]);
    const epsPixels = ANIM_STATE.eps * scale;
    
    ctx.beginPath();
    ctx.arc(sx, sy, epsPixels, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(34, 211, 238, 0.08)';
    ctx.fill();
  }
  
  // Draw neighbor lines
  if (ANIM_STATE.currentPoint >= 0 && ANIM_STATE.neighborSet.size > 0) {
    const cp = ANIM_STATE.currentPoint;
    const { sx: cx, sy: cy } = toScreen(pts.x[cp], pts.y[cp]);
    
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.5)';
    ctx.lineWidth = 1;
    
    for (const ni of ANIM_STATE.neighborSet) {
      if (ni >= n) continue;
      const { sx, sy } = toScreen(pts.x[ni], pts.y[ni]);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(sx, sy);
      ctx.stroke();
    }
  }
  
  // Draw points
  for (let i = 0; i < n; i++) {
    if (!isFinite(pts.x[i]) || !isFinite(pts.y[i])) continue;
    
    const { sx, sy } = toScreen(pts.x[i], pts.y[i]);
    const label = labels[i];
    
    let color;
    if (label === -2) {
      color = 'rgba(100, 116, 139, 0.4)';
    } else if (label === -1) {
      color = '#64748b';
    } else {
      color = getClusterColor(label);
    }
    
    ctx.beginPath();
    ctx.arc(sx, sy, pointSize, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    
    // Core/border indicators
    if (ANIM_STATE.corePoints.has(i)) {
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (ANIM_STATE.borderPoints.has(i)) {
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  
  // Highlight current point
  if (ANIM_STATE.currentPoint >= 0) {
    const cp = ANIM_STATE.currentPoint;
    const { sx, sy } = toScreen(pts.x[cp], pts.y[cp]);
    
    ctx.beginPath();
    ctx.arc(sx, sy, pointSize + 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  
  // Highlight neighbors
  // for (const ni of ANIM_STATE.neighborSet) {
  //   if (ni === ANIM_STATE.currentPoint || ni >= n) continue;
  //   const { sx, sy } = toScreen(pts.x[ni], pts.y[ni]);
    
  //   ctx.beginPath();
  //   ctx.arc(sx, sy, pointSize + 2, 0, Math.PI * 2);
  //   ctx.strokeStyle = 'rgba(249, 115, 22, 0.8)';
  //   ctx.lineWidth = 1.5;
  //   ctx.stroke();
  // }

  // Highlight neighbors
  for (const ni of ANIM_STATE.neighborSet) {
    if (ni === ANIM_STATE.currentPoint || ni < 0 || ni >= n) continue;
    if (!isFinite(pts.x[ni]) || !isFinite(pts.y[ni])) continue;
    const { sx, sy } = toScreen(pts.x[ni], pts.y[ni]);
    
    ctx.beginPath();
    ctx.arc(sx, sy, pointSize + 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.8)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function getClusterColor(label) {
  if (label < 0) return '#64748b';
  
  const colors = [
    '#22c55e', '#3b82f6', '#f97316', '#a855f7', '#ec4899',
    '#14b8a6', '#eab308', '#ef4444', '#8b5cf6', '#06b6d4'
  ];
  
  return colors[label % colors.length];
}

// ---- K-Distance Plot ----
function drawKDistancePlot(canvas, distances, currentEps) {
  if (!canvas) return;
  
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary') || '#12171f';
  ctx.fillRect(0, 0, w, h);
  
  if (distances.length < 2) return;
  
  const sorted = [...distances].sort((a, b) => a - b);
  // const maxDist = sorted[sorted.length - 1] * 1.1;

  //potential maxDist = 0
  // const maxDist = Math.max(sorted[sorted.length - 1] * 1.1, 1e-10);
  
  const rawMax = sorted[sorted.length - 1];
  // Protect against zero, NaN, and undefined
  const maxDist = (isFinite(rawMax) && rawMax > 0) ? rawMax * 1.1 : 1;

  const pad = 20;
  
  // Draw curve
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  
  const len = sorted.length;
  for (let i = 0; i < len; i++) {
    const xRatio = len > 1 ? (i / (len - 1)) : 0.5;
    const x = pad + xRatio * (w - 2 * pad);
    const yRatio = maxDist > 0 ? (sorted[i] / maxDist) : 0;
    const y = h - pad - yRatio * (h - 2 * pad);
    
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  
  ctx.stroke();
  
  // Draw epsilon line
  if (isFinite(currentEps) && currentEps <= maxDist) {
    const epsY = h - pad - (currentEps / maxDist) * (h - 2 * pad);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(pad, epsY);
    ctx.lineTo(w - pad, epsY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.fillStyle = '#ef4444';
    ctx.font = '10px monospace';
    ctx.fillText(`ε = ${currentEps}`, w - pad - 50, epsY - 4);
  }
}

// ---- Public API ----
async function runTraceSample() {
  if (!wasmApi) {
    setEngineBadgeFallback("No WASM");
    return;
  }

  const dataset = window.__DBSCAN_TOOL__?.getCurrentDataset?.();
  if (!dataset) {
    alert("Trace: dataset not available. Wire window.__DBSCAN_TOOL__.getCurrentDataset()");
    return;
  }

  const eps = window.__DBSCAN_TOOL__?.getParams?.()?.eps ?? 0.5;
  const minPts = window.__DBSCAN_TOOL__?.getParams?.()?.minPts ?? 5;
  const standardize = window.__DBSCAN_TOOL__?.getParams?.()?.standardize ?? false;

  const maxPoints = Math.max(200, Math.min(5000, parseInt(el("traceMaxPoints")?.value ?? "1200", 10)));
  const maxNeighbors = Math.max(10, Math.min(200, parseInt(el("traceMaxNeighbors")?.value ?? "60", 10)));
  const slow = !!el("traceSlowToggle")?.checked;

  setBadge(el("traceStatus"), "Trace: running…", null);
  el("runTraceBtn")?.setAttribute("disabled", "disabled");

  try {
    const trace = wasmApi.dbscan_trace(
      dataset.flat,
      dataset.nPoints,
      dataset.nDims,
      eps,
      minPts,
      standardize,
      maxPoints,
      maxNeighbors,
      slow
    );

    // Setup animation state
    ANIM_STATE.events = trace.events;
    ANIM_STATE.points2d = trace.points2d;
    ANIM_STATE.labels = new Int32Array(trace.points2d.x.length).fill(-2);
    ANIM_STATE.eps = eps;
    ANIM_STATE.minPts = minPts;
    ANIM_STATE.means = trace.means;
    ANIM_STATE.stds = trace.stds;
    ANIM_STATE.currentStep = 0;
    ANIM_STATE.corePoints.clear();
    ANIM_STATE.borderPoints.clear();
    ANIM_STATE.neighborSet.clear();
    ANIM_STATE.currentPoint = -1;
    
    // Enable controls
    el("btnPlay")?.removeAttribute("disabled");
    el("btnStep")?.removeAttribute("disabled");
    el("btnStepBack")?.removeAttribute("disabled");
    el("btnSkip10")?.removeAttribute("disabled");
    el("btnSkip100")?.removeAttribute("disabled");
    el("btnReset")?.removeAttribute("disabled");
    
    updateAnimationState();
    renderAnimationFrame();
    
    setBadge(el("traceStatus"), "Trace: ready", null);
  } catch (e) {
    console.error(e);
    setBadge(el("traceStatus"), "Trace: error", null);
    alert(`Trace failed: ${e?.message ?? e}`);
  } finally {
    el("runTraceBtn")?.removeAttribute("disabled");
  }
}

// ---- Event Wiring ----
document.addEventListener("DOMContentLoaded", async () => {
  setUIBadge();
  setEngineBadgeLoading();

  try {
    wasmApi = await initWasm();
    engineMode = "wasm";
    const v = typeof wasmApi.wasm_version === "function" ? wasmApi.wasm_version() : "unknown";
    setEngineBadgeWasm(v);
  } catch (err) {
    console.warn("WASM init failed; staying in fallback mode:", err);
    wasmApi = null;
    engineMode = "fallback";
    setEngineBadgeFallback(err?.message ?? "init failed");
  }

  // Wire UI events
  el("runTraceBtn")?.addEventListener("click", runTraceSample);
  el("speedSlider")?.addEventListener("input", updateSpeedDisplay);
  el("btnPlay")?.addEventListener("click", togglePlayPause);
  el("btnStep")?.addEventListener("click", () => stepForward(1));
  el("btnStepBack")?.addEventListener("click", () => stepBackward(1));
  el("btnSkip10")?.addEventListener("click", () => stepForward(10));
  el("btnSkip100")?.addEventListener("click", () => stepForward(100));
  el("btnReset")?.addEventListener("click", resetAnimation);
  
  updateSpeedDisplay();
  
  if (window.__DBSCAN_TOOL__?.setOnCompleted) {
    window.__DBSCAN_TOOL__.setOnCompleted(onDbscanCompleted);
  }
});

function onDbscanCompleted({ nPoints, elapsedMs, progressSamples }) {
  const sec = Math.max(1e-6, elapsedMs / 1000);
  const totalPps = nPoints / sec;
  
  if (el("ppsTotal")) el("ppsTotal").textContent = formatPps(totalPps);
  
  const rolling10s = computePpsFromProgress(progressSamples, 10_000);
  const rolling1s = computePpsFromProgress(progressSamples, 1_000);
  const chosen = rolling10s ?? rolling1s;
  
  if (el("ppsRolling")) el("ppsRolling").textContent = formatPps(chosen);
  if (el("ppsSamples")) el("ppsSamples").textContent = progressSamples?.length ? `${progressSamples.length}` : "--";
}

function computePpsFromProgress(samples, windowMs = 10_000) {
  if (!samples || samples.length < 2) return null;

  const last = samples[samples.length - 1];
  const tEnd = last.t_ms;
  const tStartTarget = Math.max(0, tEnd - windowMs);
  
  let start = samples[0];
  for (let i = samples.length - 1; i >= 0; i--) {
    if (samples[i].t_ms <= tStartTarget) {
      start = samples[i];
      break;
    }
  }

  const dt = (last.t_ms - start.t_ms) / 1000;
  const dp = last.processed - start.processed;
  if (dt <= 0) return null;
  return dp / dt;
}

function formatPps(x) {
  if (x == null || !isFinite(x)) return "--";
  if (x >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(2)}k`;
  return `${x.toFixed(1)}`;
}

// Export for external use
window.DBSCAN_VNEXT = {
  validateAndCleanData,
  drawKDistancePlot,
  togglePlayPause,
  stepForward,
  stepBackward,
  resetAnimation,
  getSpeedMultiplier,
  ANIM_STATE
};