import {
    BURSTINESS_PRESETS,
    LANE_KEYS,
    LANE_LABELS,
    MAX_SHARED_SAMPLE_LENGTH,
    MAX_STORED_SAMPLE_LENGTH,
    PREVIEW_TOKEN_LIMIT,
    SAMPLE_PRESETS,
    SCENARIO_PRESETS,
    SHARE_QUERY_PARAM,
    STORAGE_DEBOUNCE_MS,
    STORAGE_KEY,
    createScenarioSettings
} from './ttv-config.js';
import { buildModel, findVisibleTokens } from './ttv-model.js';
import {
    clamp,
    decodeBase64UrlJson,
    encodeBase64UrlJson,
    formatInputNumber,
    formatInteger,
    formatNumber,
    formatSeconds,
    normalizeSampleText,
    sanitizeFloat,
    sanitizeInteger
} from './ttv-utils.js';

const state = {
    settings: createScenarioSettings('fast-vs-slow'),
    model: null,
    race: {
        mode: 'idle',
        rafId: 0,
        startTimestamp: 0,
        elapsedBeforePause: 0,
        lastRendered: createLastRenderedState()
    },
    persistence: {
        timerId: 0,
        failed: false
    }
};

const dom = {
    lanes: {}
};

document.addEventListener('DOMContentLoaded', init);

function init() {
    cacheDom();
    restoreSettings();
    applySettingsToDom();
    bindEvents();
    recompute({ shouldResetRace: true });
}

function cacheDom() {
    dom.outputTokensInput = document.getElementById('outputTokensInput');
    dom.sampleOutputInput = document.getElementById('sampleOutputInput');
    dom.samplePresetStatus = document.getElementById('samplePresetStatus');
    dom.samplePresetButtons = Array.from(document.querySelectorAll('[data-sample-preset]'));
    dom.burstinessButtons = Array.from(document.querySelectorAll('[data-burstiness]'));
    dom.scenarioPresetButtons = Array.from(document.querySelectorAll('[data-scenario-preset]'));
    dom.resetSampleButton = document.getElementById('resetSampleButton');
    dom.copyReportButton = document.getElementById('copyReportButton');
    dom.copyReportLabel = dom.copyReportButton.querySelector('span');
    dom.copyLinkButton = document.getElementById('copyLinkButton');
    dom.copyLinkLabel = dom.copyLinkButton.querySelector('span');

    dom.winnerValue = document.getElementById('winnerValue');
    dom.finishDeltaValue = document.getElementById('finishDeltaValue');
    dom.laneATotalTimeValue = document.getElementById('laneATotalTimeValue');
    dom.laneBTotalTimeValue = document.getElementById('laneBTotalTimeValue');
    dom.laneAOutputRateValue = document.getElementById('laneAOutputRateValue');
    dom.laneBOutputRateValue = document.getElementById('laneBOutputRateValue');

    dom.raceStatusText = document.getElementById('raceStatusText');
    dom.racePhasePill = document.getElementById('racePhasePill');
    dom.previewCoverageNote = document.getElementById('previewCoverageNote');
    dom.startRaceButton = document.getElementById('startRaceButton');
    dom.pauseRaceButton = document.getElementById('pauseRaceButton');
    dom.resetRaceButton = document.getElementById('resetRaceButton');
    dom.reportSummaryOutput = document.getElementById('reportSummaryOutput');

    dom.winnerDetailValue = document.getElementById('winnerDetailValue');
    dom.firstTokenWinnerValue = document.getElementById('firstTokenWinnerValue');
    dom.activeScenarioValue = document.getElementById('activeScenarioValue');
    dom.activeSampleValue = document.getElementById('activeSampleValue');
    dom.sharedOutputValue = document.getElementById('sharedOutputValue');
    dom.milestoneTable = document.getElementById('milestoneTable');

    for (const laneKey of LANE_KEYS) {
        const prefix = laneKey === 'a' ? 'laneA' : 'laneB';
        dom.lanes[laneKey] = {
            tokensPerSecondInput: document.getElementById(`${prefix}TokensPerSecondInput`),
            startupDelayInput: document.getElementById(`${prefix}StartupDelayInput`),
            charsPerTokenInput: document.getElementById(`${prefix}CharsPerTokenInput`),
            configSummary: document.getElementById(`${prefix}ConfigSummary`),
            tagline: document.getElementById(`${prefix}Tagline`),
            resultPill: document.getElementById(`${prefix}ResultPill`),
            progressBar: document.getElementById(`${prefix}ProgressBar`),
            elapsedValue: document.getElementById(`${prefix}ElapsedValue`),
            visibleTokensValue: document.getElementById(`${prefix}VisibleTokensValue`),
            visibleCharsValue: document.getElementById(`${prefix}VisibleCharsValue`),
            streamOutput: document.getElementById(`${prefix}StreamOutput`)
        };
    }
}

function bindEvents() {
    dom.outputTokensInput.addEventListener('input', handleFieldInput);
    dom.sampleOutputInput.addEventListener('input', handleFieldInput);

    dom.resetSampleButton.addEventListener('click', () => {
        applySamplePreset(state.settings.samplePreset);
    });

    dom.samplePresetButtons.forEach((button) => {
        button.addEventListener('click', () => {
            applySamplePreset(button.dataset.samplePreset);
        });
    });

    dom.scenarioPresetButtons.forEach((button) => {
        button.addEventListener('click', () => {
            applyScenarioPreset(button.dataset.scenarioPreset);
        });
    });

    dom.burstinessButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const laneKey = button.dataset.lane;
            state.settings.lanes[laneKey].burstiness = button.dataset.burstiness;
            markScenarioCustom();
            recompute({ shouldResetRace: true });
        });
    });

    for (const laneKey of LANE_KEYS) {
        const laneDom = dom.lanes[laneKey];
        laneDom.tokensPerSecondInput.addEventListener('input', handleFieldInput);
        laneDom.startupDelayInput.addEventListener('input', handleFieldInput);
        laneDom.charsPerTokenInput.addEventListener('input', handleFieldInput);
    }

    dom.copyReportButton.addEventListener('click', () => {
        copyText(dom.reportSummaryOutput.value, dom.copyReportLabel);
    });

    dom.copyLinkButton.addEventListener('click', () => {
        copyText(buildPermalink(), dom.copyLinkLabel);
    });

    dom.startRaceButton.addEventListener('click', startRace);
    dom.pauseRaceButton.addEventListener('click', togglePause);
    dom.resetRaceButton.addEventListener('click', resetRace);
}

function handleFieldInput() {
    markScenarioCustom();
    recompute({ shouldResetRace: true });
}

function restoreSettings() {
    const fromUrl = loadSettingsFromUrl();
    if (fromUrl) {
        state.settings = fromUrl;
        return;
    }

    const fromStorage = loadSettingsFromStorage();
    if (fromStorage) {
        state.settings = fromStorage;
    }
}

function loadSettingsFromUrl() {
    try {
        const url = new URL(window.location.href);
        const encoded = url.searchParams.get(SHARE_QUERY_PARAM);
        if (!encoded) {
            return null;
        }

        return sanitizeSettings(decodeBase64UrlJson(encoded));
    } catch (error) {
        console.warn('Unable to restore token throughput settings from URL.', error);
        return null;
    }
}

function loadSettingsFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return null;
        }

        return sanitizeSettings(JSON.parse(raw));
    } catch (error) {
        console.warn('Unable to restore token throughput settings from storage.', error);
        return null;
    }
}

function createLastRenderedState() {
    return {
        a: createLaneRenderState(),
        b: createLaneRenderState()
    };
}

function createLaneRenderState() {
    return {
        previewTokens: -1,
        outputText: '',
        waiting: false,
        done: false
    };
}

function sanitizeSettings(rawSettings) {
    const scenarioPreset = SCENARIO_PRESETS[rawSettings?.scenarioPreset] ? rawSettings.scenarioPreset : 'custom';
    const samplePreset = SAMPLE_PRESETS[rawSettings?.samplePreset] ? rawSettings.samplePreset : 'chat';
    const preset = SAMPLE_PRESETS[samplePreset];
    const storedCustomSample = Boolean(rawSettings?.sampleIsCustom);
    const rawSampleText = storedCustomSample ? normalizeSampleText(rawSettings?.sampleText) : '';
    const sampleText = rawSampleText || preset.sample;
    const sampleIsCustom = storedCustomSample && sampleText !== preset.sample;
    const baseScenario = scenarioPreset !== 'custom'
        ? createScenarioSettings(scenarioPreset)
        : createScenarioSettings('fast-vs-slow');

    return {
        scenarioPreset,
        samplePreset,
        sampleIsCustom,
        outputTokens: sanitizeInteger(rawSettings?.outputTokens, baseScenario.outputTokens, 1, 20000),
        sampleText,
        lanes: {
            a: sanitizeLaneSettings(rawSettings?.lanes?.a, baseScenario.lanes.a),
            b: sanitizeLaneSettings(rawSettings?.lanes?.b, baseScenario.lanes.b)
        }
    };
}

function sanitizeLaneSettings(rawLane, fallbackLane) {
    return {
        tokensPerSecond: sanitizeFloat(rawLane?.tokensPerSecond, fallbackLane.tokensPerSecond, 1, 500),
        startupDelay: sanitizeFloat(rawLane?.startupDelay, fallbackLane.startupDelay, 0, 30),
        charsPerToken: sanitizeFloat(rawLane?.charsPerToken, fallbackLane.charsPerToken, 1, 12),
        burstiness: BURSTINESS_PRESETS[rawLane?.burstiness] ? rawLane.burstiness : fallbackLane.burstiness
    };
}

function applySettingsToDom() {
    dom.outputTokensInput.value = String(state.settings.outputTokens);
    dom.sampleOutputInput.value = state.settings.sampleText;

    for (const laneKey of LANE_KEYS) {
        const laneSettings = state.settings.lanes[laneKey];
        const laneDom = dom.lanes[laneKey];
        laneDom.tokensPerSecondInput.value = formatInputNumber(laneSettings.tokensPerSecond, 1);
        laneDom.startupDelayInput.value = formatInputNumber(laneSettings.startupDelay, 1);
        laneDom.charsPerTokenInput.value = formatInputNumber(laneSettings.charsPerToken, 1);
    }

    updatePresetButtons();
}

function updatePresetButtons() {
    dom.samplePresetButtons.forEach((button) => {
        const isActive = button.dataset.samplePreset === state.settings.samplePreset;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    dom.scenarioPresetButtons.forEach((button) => {
        const isActive = button.dataset.scenarioPreset === state.settings.scenarioPreset;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    dom.burstinessButtons.forEach((button) => {
        const laneKey = button.dataset.lane;
        const isActive = state.settings.lanes[laneKey].burstiness === button.dataset.burstiness;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function applySamplePreset(samplePreset) {
    const preset = SAMPLE_PRESETS[samplePreset];
    state.settings.samplePreset = samplePreset;
    state.settings.sampleIsCustom = false;
    state.settings.sampleText = preset.sample;
    state.settings.lanes.a.charsPerToken = preset.charsPerToken;
    state.settings.lanes.b.charsPerToken = preset.charsPerToken;
    markScenarioCustom();
    applySettingsToDom();
    recompute({ shouldResetRace: true });
}

function applyScenarioPreset(scenarioPreset) {
    state.settings = createScenarioSettings(scenarioPreset);
    applySettingsToDom();
    recompute({ shouldResetRace: true });
}

function markScenarioCustom() {
    if (state.settings.scenarioPreset !== 'custom') {
        state.settings.scenarioPreset = 'custom';
    }
}

function collectSettingsFromDom() {
    const presetSample = SAMPLE_PRESETS[state.settings.samplePreset].sample;
    const sampleText = normalizeSampleText(dom.sampleOutputInput.value) || presetSample;

    return {
        scenarioPreset: state.settings.scenarioPreset,
        samplePreset: state.settings.samplePreset,
        sampleIsCustom: sampleText !== presetSample,
        outputTokens: sanitizeInteger(dom.outputTokensInput.value, state.settings.outputTokens, 1, 20000),
        sampleText,
        lanes: {
            a: {
                tokensPerSecond: sanitizeFloat(dom.lanes.a.tokensPerSecondInput.value, state.settings.lanes.a.tokensPerSecond, 1, 500),
                startupDelay: sanitizeFloat(dom.lanes.a.startupDelayInput.value, state.settings.lanes.a.startupDelay, 0, 30),
                charsPerToken: sanitizeFloat(dom.lanes.a.charsPerTokenInput.value, state.settings.lanes.a.charsPerToken, 1, 12),
                burstiness: state.settings.lanes.a.burstiness
            },
            b: {
                tokensPerSecond: sanitizeFloat(dom.lanes.b.tokensPerSecondInput.value, state.settings.lanes.b.tokensPerSecond, 1, 500),
                startupDelay: sanitizeFloat(dom.lanes.b.startupDelayInput.value, state.settings.lanes.b.startupDelay, 0, 30),
                charsPerToken: sanitizeFloat(dom.lanes.b.charsPerTokenInput.value, state.settings.lanes.b.charsPerToken, 1, 12),
                burstiness: state.settings.lanes.b.burstiness
            }
        }
    };
}

function recompute({ shouldResetRace }) {
    state.settings = collectSettingsFromDom();
    state.model = buildModel(state.settings);

    syncSanitizedValuesToDom();
    renderStaticSummary();
    schedulePersistSettings();

    if (shouldResetRace) {
        resetRaceState();
        renderIdleRace();
    }
}

function syncSanitizedValuesToDom() {
    dom.outputTokensInput.value = String(state.settings.outputTokens);
    dom.sampleOutputInput.value = state.settings.sampleText;

    for (const laneKey of LANE_KEYS) {
        const laneSettings = state.settings.lanes[laneKey];
        const laneDom = dom.lanes[laneKey];
        laneDom.tokensPerSecondInput.value = formatInputNumber(laneSettings.tokensPerSecond, 1);
        laneDom.startupDelayInput.value = formatInputNumber(laneSettings.startupDelay, 1);
        laneDom.charsPerTokenInput.value = formatInputNumber(laneSettings.charsPerToken, 1);
    }

    updatePresetButtons();
}

function renderStaticSummary() {
    const { settings, lanes, winner, firstTokenWinner, finishDelta, milestoneRows, reportSummary, previewIsTruncated } = state.model;
    const scenarioLabel = settings.scenarioPreset === 'custom'
        ? 'Custom'
        : SCENARIO_PRESETS[settings.scenarioPreset].label;
    const sampleLabel = settings.sampleIsCustom
        ? `${SAMPLE_PRESETS[settings.samplePreset].label} (edited)`
        : SAMPLE_PRESETS[settings.samplePreset].label;

    dom.samplePresetStatus.textContent = settings.sampleIsCustom
        ? `${SAMPLE_PRESETS[settings.samplePreset].label} sample, edited`
        : `${SAMPLE_PRESETS[settings.samplePreset].label} sample`;

    dom.winnerValue.textContent = winner.label;
    dom.finishDeltaValue.textContent = formatSeconds(finishDelta);
    dom.laneATotalTimeValue.textContent = formatSeconds(lanes.a.totalTime);
    dom.laneBTotalTimeValue.textContent = formatSeconds(lanes.b.totalTime);
    dom.laneAOutputRateValue.textContent = `${formatNumber(lanes.a.charsPerSecond, 0)} chars/s`;
    dom.laneBOutputRateValue.textContent = `${formatNumber(lanes.b.charsPerSecond, 0)} chars/s`;

    dom.winnerDetailValue.textContent = winner.label;
    dom.firstTokenWinnerValue.textContent = firstTokenWinner.label;
    dom.activeScenarioValue.textContent = scenarioLabel;
    dom.activeSampleValue.textContent = sampleLabel;
    dom.sharedOutputValue.textContent = formatInteger(settings.outputTokens);
    dom.reportSummaryOutput.value = reportSummary;

    dom.previewCoverageNote.textContent = previewIsTruncated
        ? `Preview animates the first ${formatInteger(PREVIEW_TOKEN_LIMIT)} tokens of each lane. Timing metrics still use the full configured run.`
        : 'Preview animates the full configured output for both lanes.';

    for (const laneKey of LANE_KEYS) {
        const lane = lanes[laneKey];
        dom.lanes[laneKey].configSummary.textContent = `${formatNumber(lane.tokensPerSecond, 1)} tok/s, TTFT ${formatSeconds(lane.firstTokenTime)}, ${BURSTINESS_PRESETS[lane.burstiness].label.toLowerCase()} cadence`;
        dom.lanes[laneKey].tagline.textContent = `${formatNumber(lane.tokensPerSecond, 1)} tok/s, TTFT ${formatSeconds(lane.firstTokenTime)}, ${formatNumber(lane.charsPerToken, 1)} chars/tok, ${BURSTINESS_PRESETS[lane.burstiness].label.toLowerCase()}`;
    }

    dom.milestoneTable.innerHTML = buildMilestoneTableHtml(milestoneRows);
}

function buildMilestoneTableHtml(rows) {
    let html = `
        <div class="milestone-cell header">Milestone</div>
        <div class="milestone-cell header value">${LANE_LABELS.a}</div>
        <div class="milestone-cell header value">${LANE_LABELS.b}</div>
    `;

    for (const row of rows) {
        html += `
            <div class="milestone-cell label">${row.label}</div>
            <div class="milestone-cell value">${row.a}</div>
            <div class="milestone-cell value">${row.b}</div>
        `;
    }

    return html;
}

function startRace() {
    resetRaceState();
    state.race.mode = 'running';
    updateRaceControls('running');
    state.race.rafId = requestAnimationFrame(runRaceFrame);
}

function togglePause() {
    if (state.race.mode === 'running') {
        pauseRace();
    } else if (state.race.mode === 'paused') {
        resumeRace();
    }
}

function pauseRace() {
    cancelAnimationFrame(state.race.rafId);
    state.race.mode = 'paused';
    updateRaceControls('paused');
    renderRace(state.race.elapsedBeforePause);
}

function resumeRace() {
    state.race.mode = 'running';
    state.race.startTimestamp = 0;
    updateRaceControls('running');
    state.race.rafId = requestAnimationFrame(runRaceFrame);
}

function resetRace() {
    resetRaceState();
    renderIdleRace();
}

function resetRaceState() {
    cancelAnimationFrame(state.race.rafId);
    state.race.mode = 'idle';
    state.race.rafId = 0;
    state.race.startTimestamp = 0;
    state.race.elapsedBeforePause = 0;
    state.race.lastRendered = createLastRenderedState();
    updateRaceControls('idle');
}

function runRaceFrame(timestamp) {
    if (state.race.startTimestamp === 0) {
        state.race.startTimestamp = timestamp - (state.race.elapsedBeforePause * 1000);
    }

    const elapsedSeconds = Math.max(0, (timestamp - state.race.startTimestamp) / 1000);
    state.race.elapsedBeforePause = elapsedSeconds;
    renderRace(elapsedSeconds);

    const maxFinishTime = Math.max(state.model.lanes.a.totalTime, state.model.lanes.b.totalTime);
    if (elapsedSeconds >= maxFinishTime) {
        finishRace();
        return;
    }

    state.race.rafId = requestAnimationFrame(runRaceFrame);
}

function renderRace(elapsedSeconds) {
    const laneSnapshots = {
        a: buildLaneSnapshot('a', elapsedSeconds),
        b: buildLaneSnapshot('b', elapsedSeconds)
    };

    renderLaneSnapshot('a', laneSnapshots.a);
    renderLaneSnapshot('b', laneSnapshots.b);
    renderRaceStatus(elapsedSeconds, laneSnapshots);
}

function buildLaneSnapshot(laneKey, elapsedSeconds) {
    const lane = state.model.lanes[laneKey];
    const visibleTokens = findVisibleTokens(lane, elapsedSeconds);
    const visiblePreviewTokens = Math.min(visibleTokens, lane.previewTokenCount);
    const visiblePreviewCharacters = lane.previewCumulativeChars[visiblePreviewTokens] || 0;
    const extraTokens = Math.max(0, visibleTokens - lane.previewTokenCount);
    const visibleCharacters = Math.min(
        lane.outputCharacters,
        visiblePreviewCharacters + Math.round(extraTokens * lane.charsPerToken)
    );
    const waiting = visibleTokens === 0 && elapsedSeconds < lane.firstTokenTime;
    const done = elapsedSeconds >= lane.totalTime;

    return {
        elapsedSeconds,
        visibleTokens,
        visiblePreviewTokens,
        visibleCharacters,
        waiting,
        done,
        progress: clamp(elapsedSeconds / lane.totalTime, 0, 1),
        outputText: waiting
            ? `Waiting for visible output. First token appears at ${formatSeconds(lane.firstTokenTime)}.`
            : lane.previewText.slice(0, visiblePreviewCharacters)
    };
}

function renderLaneSnapshot(laneKey, snapshot) {
    const lane = state.model.lanes[laneKey];
    const laneDom = dom.lanes[laneKey];
    const lastRendered = state.race.lastRendered[laneKey];

    laneDom.progressBar.style.width = `${snapshot.progress * 100}%`;
    laneDom.elapsedValue.textContent = formatSeconds(snapshot.elapsedSeconds);
    laneDom.visibleTokensValue.textContent = `${formatInteger(snapshot.visibleTokens)} / ${formatInteger(lane.outputTokens)} tok`;
    laneDom.visibleCharsValue.textContent = `${formatInteger(snapshot.visibleCharacters)} / ${formatInteger(lane.outputCharacters)} chars`;

    const textChanged = snapshot.visiblePreviewTokens !== lastRendered.previewTokens
        || snapshot.waiting !== lastRendered.waiting
        || snapshot.done !== lastRendered.done
        || snapshot.outputText !== lastRendered.outputText;

    if (!textChanged) {
        return;
    }

    laneDom.streamOutput.dataset.empty = snapshot.outputText ? 'false' : 'true';
    laneDom.streamOutput.textContent = snapshot.outputText || 'No visible output yet.';
    lastRendered.previewTokens = snapshot.visiblePreviewTokens;
    lastRendered.outputText = snapshot.outputText;
    lastRendered.waiting = snapshot.waiting;
    lastRendered.done = snapshot.done;
}

function renderRaceStatus(elapsedSeconds, laneSnapshots) {
    const { winner, finishDelta } = state.model;
    const allWaiting = laneSnapshots.a.waiting && laneSnapshots.b.waiting;
    const allDone = laneSnapshots.a.done && laneSnapshots.b.done;
    const oneDone = laneSnapshots.a.done !== laneSnapshots.b.done;
    let phase = 'running';
    let statusText = 'Comparison in progress.';

    if (state.race.mode === 'paused') {
        phase = 'paused';
        statusText = 'Comparison paused.';
    } else if (allDone) {
        phase = 'done';
        statusText = winner.key === 'tie'
            ? `Complete. Both lanes finish together within ${formatSeconds(finishDelta)}.`
            : `Complete. ${winner.label} finishes ${formatSeconds(finishDelta)} sooner.`;
    } else if (allWaiting) {
        phase = 'waiting';
        statusText = 'Both lanes are still waiting for visible output.';
    } else if (oneDone) {
        const finishedLaneKey = laneSnapshots.a.done ? 'a' : 'b';
        const activeLaneKey = finishedLaneKey === 'a' ? 'b' : 'a';
        statusText = `${LANE_LABELS[finishedLaneKey]} has finished. ${LANE_LABELS[activeLaneKey]} is still streaming.`;
    } else {
        const tokenGap = Math.abs(laneSnapshots.a.visibleTokens - laneSnapshots.b.visibleTokens);
        if (tokenGap === 0) {
            statusText = `Both lanes are even at ${formatSeconds(elapsedSeconds)}.`;
        } else {
            const leaderKey = laneSnapshots.a.visibleTokens > laneSnapshots.b.visibleTokens ? 'a' : 'b';
            statusText = `${LANE_LABELS[leaderKey]} leads by ${formatInteger(tokenGap)} tokens at ${formatSeconds(elapsedSeconds)}.`;
        }
    }

    setRacePhase(phase);
    dom.raceStatusText.textContent = statusText;
    setLaneResultPills(laneSnapshots);
}

function setLaneResultPills(laneSnapshots) {
    if (state.race.mode === 'idle') {
        setLanePill('a', 'ready', 'Ready');
        setLanePill('b', 'ready', 'Ready');
        return;
    }

    if (state.race.mode === 'paused') {
        setLanePill('a', 'paused', 'Paused');
        setLanePill('b', 'paused', 'Paused');
        return;
    }

    if (laneSnapshots.a.done && laneSnapshots.b.done) {
        if (state.model.winner.key === 'tie') {
            setLanePill('a', 'tie', 'Tie');
            setLanePill('b', 'tie', 'Tie');
        } else {
            const winnerKey = state.model.winner.key;
            const runnerUpKey = winnerKey === 'a' ? 'b' : 'a';
            setLanePill(winnerKey, 'winner', 'Winner');
            setLanePill(runnerUpKey, 'runner-up', 'Runner-up');
        }
        return;
    }

    if (laneSnapshots.a.done || laneSnapshots.b.done) {
        const finishedLaneKey = laneSnapshots.a.done ? 'a' : 'b';
        const activeLaneKey = finishedLaneKey === 'a' ? 'b' : 'a';
        setLanePill(finishedLaneKey, 'finished', 'Finished');
        setLanePill(activeLaneKey, 'chasing', 'Streaming');
        return;
    }

    if (laneSnapshots.a.waiting || laneSnapshots.b.waiting) {
        if (laneSnapshots.a.waiting && laneSnapshots.b.waiting) {
            setLanePill('a', 'waiting', 'Waiting');
            setLanePill('b', 'waiting', 'Waiting');
            return;
        }

        const waitingLaneKey = laneSnapshots.a.waiting ? 'a' : 'b';
        const activeLaneKey = waitingLaneKey === 'a' ? 'b' : 'a';
        setLanePill(waitingLaneKey, 'waiting', 'Waiting');
        setLanePill(activeLaneKey, 'leading', 'Streaming');
        return;
    }

    if (laneSnapshots.a.visibleTokens === laneSnapshots.b.visibleTokens) {
        setLanePill('a', 'leading', 'Even');
        setLanePill('b', 'leading', 'Even');
        return;
    }

    const leaderKey = laneSnapshots.a.visibleTokens > laneSnapshots.b.visibleTokens ? 'a' : 'b';
    const chasingKey = leaderKey === 'a' ? 'b' : 'a';
    setLanePill(leaderKey, 'leading', 'Leading');
    setLanePill(chasingKey, 'chasing', 'Chasing');
}

function setLanePill(laneKey, statusClass, label) {
    const pill = dom.lanes[laneKey].resultPill;
    pill.className = 'lane-result-pill';
    if (statusClass) {
        pill.classList.add(statusClass);
    }
    pill.textContent = label;
}

function setRacePhase(phase) {
    dom.racePhasePill.className = 'status-pill';

    if (phase === 'idle') {
        dom.racePhasePill.textContent = 'Idle';
        return;
    }

    dom.racePhasePill.classList.add(phase);

    if (phase === 'waiting') {
        dom.racePhasePill.textContent = 'Waiting';
    } else if (phase === 'running') {
        dom.racePhasePill.textContent = 'Running';
    } else if (phase === 'paused') {
        dom.racePhasePill.textContent = 'Paused';
    } else if (phase === 'done') {
        dom.racePhasePill.textContent = 'Done';
    }
}

function finishRace() {
    cancelAnimationFrame(state.race.rafId);
    state.race.mode = 'done';
    state.race.elapsedBeforePause = Math.max(state.model.lanes.a.totalTime, state.model.lanes.b.totalTime);
    updateRaceControls('done');
    renderRace(state.race.elapsedBeforePause);
}

function renderIdleRace() {
    setRacePhase('idle');
    dom.raceStatusText.textContent = 'Ready to compare the configured lanes.';

    for (const laneKey of LANE_KEYS) {
        const lane = state.model.lanes[laneKey];
        const laneDom = dom.lanes[laneKey];
        laneDom.progressBar.style.width = '0%';
        laneDom.elapsedValue.textContent = '0.0 s';
        laneDom.visibleTokensValue.textContent = `0 / ${formatInteger(lane.outputTokens)} tok`;
        laneDom.visibleCharsValue.textContent = `0 / ${formatInteger(lane.outputCharacters)} chars`;
        laneDom.streamOutput.dataset.empty = 'true';
        laneDom.streamOutput.textContent = `Press Start to simulate a ${formatInteger(lane.outputTokens)} token response.`;
        setLanePill(laneKey, 'ready', 'Ready');
    }
}

function updateRaceControls(mode) {
    if (mode === 'running') {
        dom.startRaceButton.textContent = 'Restart';
        dom.pauseRaceButton.disabled = false;
        dom.pauseRaceButton.textContent = 'Pause';
        dom.resetRaceButton.disabled = false;
        return;
    }

    if (mode === 'paused') {
        dom.startRaceButton.textContent = 'Restart';
        dom.pauseRaceButton.disabled = false;
        dom.pauseRaceButton.textContent = 'Resume';
        dom.resetRaceButton.disabled = false;
        return;
    }

    if (mode === 'done') {
        dom.startRaceButton.textContent = 'Replay';
        dom.pauseRaceButton.disabled = true;
        dom.pauseRaceButton.textContent = 'Pause';
        dom.resetRaceButton.disabled = false;
        return;
    }

    dom.startRaceButton.textContent = 'Start';
    dom.pauseRaceButton.disabled = true;
    dom.pauseRaceButton.textContent = 'Pause';
    dom.resetRaceButton.disabled = true;
}

function schedulePersistSettings() {
    window.clearTimeout(state.persistence.timerId);
    state.persistence.timerId = window.setTimeout(() => {
        persistSettings();
    }, STORAGE_DEBOUNCE_MS);
}

function persistSettings() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildStoredState()));
        state.persistence.failed = false;
    } catch (error) {
        if (!state.persistence.failed) {
            console.warn('Unable to persist token throughput settings.', error);
            state.persistence.failed = true;
        }
    }
}

function buildStoredState() {
    const storedState = {
        scenarioPreset: state.settings.scenarioPreset,
        samplePreset: state.settings.samplePreset,
        sampleIsCustom: state.settings.sampleIsCustom,
        outputTokens: state.settings.outputTokens,
        lanes: state.settings.lanes
    };

    if (state.settings.sampleIsCustom) {
        storedState.sampleText = state.settings.sampleText.slice(0, MAX_STORED_SAMPLE_LENGTH);
    }

    return storedState;
}

function buildPermalink() {
    const url = new URL(window.location.href);
    url.search = '';
    url.searchParams.set(SHARE_QUERY_PARAM, encodeBase64UrlJson(buildShareState()));
    return url.toString();
}

function buildShareState() {
    const shareState = {
        scenarioPreset: state.settings.scenarioPreset,
        samplePreset: state.settings.samplePreset,
        sampleIsCustom: state.settings.sampleIsCustom,
        outputTokens: state.settings.outputTokens,
        lanes: state.settings.lanes
    };

    if (state.settings.sampleIsCustom) {
        shareState.sampleText = state.settings.sampleText.slice(0, MAX_SHARED_SAMPLE_LENGTH);
    }

    return shareState;
}

async function copyText(text, labelElement) {
    const clipboard = window.ToolsHub && window.ToolsHub.Clipboard;

    if (clipboard && typeof clipboard.copy === 'function') {
        await clipboard.copy(text, labelElement);
        return;
    }

    try {
        await navigator.clipboard.writeText(text);
        flashLabel(labelElement, 'Copied!');
    } catch (error) {
        console.warn('Clipboard copy failed.', error);
    }
}

function flashLabel(element, temporaryLabel) {
    const originalLabel = element.textContent;
    element.textContent = temporaryLabel;
    window.setTimeout(() => {
        element.textContent = originalLabel;
    }, 1500);
}
