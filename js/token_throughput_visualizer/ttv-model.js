import {
    BURSTINESS_PRESETS,
    LANE_LABELS,
    MILESTONE_LENGTHS,
    PREVIEW_TOKEN_LIMIT,
    SAMPLE_PRESETS,
    SCENARIO_PRESETS,
    TIE_THRESHOLD_SECONDS,
    TOKEN_CHUNK_PATTERN
} from './ttv-config.js';
import {
    estimateCharsPerWord,
    formatInteger,
    formatNumber,
    formatReportSample,
    formatSeconds,
    normalizeSampleText
} from './ttv-utils.js';

export function buildModel(settings) {
    const samplePreset = SAMPLE_PRESETS[settings.samplePreset];
    const charsPerWord = estimateCharsPerWord(settings.sampleText, samplePreset.fallbackCharsPerWord);
    const lanes = {
        a: buildLaneModel(settings.lanes.a, settings.outputTokens, settings.sampleText, charsPerWord),
        b: buildLaneModel(settings.lanes.b, settings.outputTokens, settings.sampleText, charsPerWord)
    };
    const winner = compareTimes(lanes.a.totalTime, lanes.b.totalTime);
    const firstTokenWinner = compareTimes(lanes.a.firstTokenTime, lanes.b.firstTokenTime);

    return {
        settings,
        charsPerWord,
        lanes,
        winner,
        firstTokenWinner,
        finishDelta: Math.abs(lanes.a.totalTime - lanes.b.totalTime),
        milestoneRows: buildMilestoneRows(lanes, settings.outputTokens),
        reportSummary: buildReportSummary(settings, lanes, winner, firstTokenWinner),
        previewIsTruncated: settings.outputTokens > PREVIEW_TOKEN_LIMIT
    };
}

function buildLaneModel(laneSettings, outputTokens, sampleText, charsPerWord) {
    const outputCharacters = Math.max(1, Math.round(outputTokens * laneSettings.charsPerToken));
    const emissionTimes = buildEmissionSchedule(outputTokens, laneSettings.tokensPerSecond, laneSettings.burstiness);
    const preview = buildPreviewModel(sampleText, outputTokens, laneSettings.charsPerToken);
    const charsPerSecond = laneSettings.tokensPerSecond * laneSettings.charsPerToken;
    const wordsPerMinute = (laneSettings.charsPerToken / charsPerWord) * laneSettings.tokensPerSecond * 60;

    return {
        ...laneSettings,
        outputTokens,
        outputCharacters,
        emissionTimes,
        firstTokenTime: laneSettings.startupDelay + emissionTimes[1],
        totalTime: laneSettings.startupDelay + emissionTimes[outputTokens],
        charsPerSecond,
        wordsPerMinute,
        previewTokenCount: preview.tokenCount,
        previewText: preview.text,
        previewCumulativeChars: preview.cumulativeChars
    };
}

function buildEmissionSchedule(outputTokens, tokensPerSecond, burstiness) {
    const pattern = BURSTINESS_PRESETS[burstiness].normalizedPattern;
    const baseDuration = 1 / tokensPerSecond;
    const emissionTimes = [0, 0];
    let cumulative = 0;

    // Time to first token controls when visible output begins.
    // Additional tokens then arrive according to the configured cadence.
    for (let tokenIndex = 1; tokenIndex < outputTokens; tokenIndex += 1) {
        cumulative += baseDuration * pattern[(tokenIndex - 1) % pattern.length];
        emissionTimes.push(cumulative);
    }

    return emissionTimes;
}

function buildPreviewModel(sampleText, outputTokens, charsPerToken) {
    const tokenCount = Math.min(outputTokens, PREVIEW_TOKEN_LIMIT);
    const targetCharacters = Math.max(1, Math.round(tokenCount * charsPerToken));
    const repeatedSample = buildRepeatedSample(sampleText, targetCharacters + 128);
    const preview = buildTokenCadenceText(repeatedSample, tokenCount, charsPerToken);

    return {
        tokenCount,
        text: preview.text,
        cumulativeChars: preview.cumulativeChars
    };
}

function buildRepeatedSample(sampleText, targetCharacters) {
    const normalized = normalizeSampleText(sampleText);
    if (!normalized) {
        return '';
    }

    if (normalized.length >= targetCharacters) {
        return normalized.slice(0, targetCharacters);
    }

    const separator = normalized.includes('\n') ? '\n' : ' ';
    let output = normalized;

    while (output.length < targetCharacters) {
        output += separator + normalized;
    }

    return output.slice(0, targetCharacters);
}

function buildTokenCadenceText(sourceText, tokenCount, charsPerToken) {
    if (!sourceText) {
        return {
            text: '',
            cumulativeChars: [0]
        };
    }

    const segments = [];
    const cumulativeChars = [0];
    let cursor = 0;
    let totalCharacters = 0;

    for (let tokenIndex = 0; tokenIndex < tokenCount; tokenIndex += 1) {
        if (cursor >= sourceText.length) {
            cursor = 0;
        }

        const jitter = TOKEN_CHUNK_PATTERN[tokenIndex % TOKEN_CHUNK_PATTERN.length];
        const idealChunk = Math.max(1, Math.round(charsPerToken * jitter));
        const minChunk = Math.max(1, Math.floor(idealChunk * 0.7));
        const maxChunk = Math.max(minChunk + 1, Math.ceil(idealChunk * 1.7));
        const endIndex = chooseBreakIndex(sourceText, cursor, idealChunk, minChunk, maxChunk);
        const segment = sourceText.slice(cursor, endIndex);

        segments.push(segment);
        totalCharacters += segment.length;
        cumulativeChars.push(totalCharacters);
        cursor = endIndex;
    }

    return {
        text: segments.join(''),
        cumulativeChars
    };
}

function chooseBreakIndex(text, startIndex, idealChunk, minChunk, maxChunk) {
    const minIndex = Math.min(text.length, startIndex + minChunk);
    const idealIndex = Math.min(text.length, startIndex + idealChunk);
    const maxIndex = Math.min(text.length, startIndex + maxChunk);
    let bestIndex = maxIndex;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = minIndex; index <= maxIndex; index += 1) {
        const previousCharacter = text[index - 1] || '';
        const nextCharacter = text[index] || '';
        const isBoundary = /\s/.test(previousCharacter)
            || /\s/.test(nextCharacter)
            || /[.,;:!?()[\]{}]/.test(previousCharacter);

        if (!isBoundary) {
            continue;
        }

        const distance = Math.abs(index - idealIndex);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
        }
    }

    if (bestIndex <= startIndex) {
        return Math.min(text.length, startIndex + Math.max(1, idealChunk));
    }

    return bestIndex;
}

function buildMilestoneRows(lanes, outputTokens) {
    const milestoneTokens = new Set([1, outputTokens]);

    for (const milestone of MILESTONE_LENGTHS.slice(1)) {
        if (milestone < outputTokens) {
            milestoneTokens.add(milestone);
        }
    }

    return Array.from(milestoneTokens)
        .sort((first, second) => first - second)
        .map((tokens) => ({
            label: tokens === 1
                ? 'First token'
                : tokens === outputTokens
                    ? 'Complete'
                    : `${formatInteger(tokens)} tok`,
            a: formatSeconds(lanes.a.startupDelay + lanes.a.emissionTimes[tokens]),
            b: formatSeconds(lanes.b.startupDelay + lanes.b.emissionTimes[tokens])
        }));
}

function buildReportSummary(settings, lanes, winner, firstTokenWinner) {
    const sampleLabel = settings.sampleIsCustom
        ? `${SAMPLE_PRESETS[settings.samplePreset].label} (edited)`
        : SAMPLE_PRESETS[settings.samplePreset].label;
    const reportLines = [
        'Token Throughput Visualizer Report',
        `Scenario: ${settings.scenarioPreset === 'custom' ? 'Custom' : SCENARIO_PRESETS[settings.scenarioPreset].label}`,
        `Sample: ${sampleLabel}`,
        `Output length: ${formatInteger(settings.outputTokens)} tokens`,
        ''
    ];

    if (settings.sampleIsCustom) {
        reportLines.push('Sample excerpt:');
        reportLines.push(formatReportSample(settings.sampleText));
        reportLines.push('');
    }

    reportLines.push(
        `${LANE_LABELS.a}:`,
        `Rate: ${formatNumber(lanes.a.tokensPerSecond, 1)} tok/s`,
        `Time to first token: ${formatSeconds(lanes.a.firstTokenTime)}`,
        `Density: ${formatNumber(lanes.a.charsPerToken, 1)} chars/token`,
        `Burstiness: ${BURSTINESS_PRESETS[lanes.a.burstiness].label}`,
        `Total time: ${formatSeconds(lanes.a.totalTime)}`,
        `Display rate: ${formatNumber(lanes.a.charsPerSecond, 0)} chars/s, ${formatNumber(lanes.a.wordsPerMinute, 0)} words/min`,
        '',
        `${LANE_LABELS.b}:`,
        `Rate: ${formatNumber(lanes.b.tokensPerSecond, 1)} tok/s`,
        `Time to first token: ${formatSeconds(lanes.b.firstTokenTime)}`,
        `Density: ${formatNumber(lanes.b.charsPerToken, 1)} chars/token`,
        `Burstiness: ${BURSTINESS_PRESETS[lanes.b.burstiness].label}`,
        `Total time: ${formatSeconds(lanes.b.totalTime)}`,
        `Display rate: ${formatNumber(lanes.b.charsPerSecond, 0)} chars/s, ${formatNumber(lanes.b.wordsPerMinute, 0)} words/min`,
        '',
        `Finish winner: ${winner.label}`,
        `First-token winner: ${firstTokenWinner.label}`,
        `Finish delta: ${formatSeconds(Math.abs(lanes.a.totalTime - lanes.b.totalTime))}`
    );

    return reportLines.join('\n');
}

export function findVisibleTokens(lane, elapsedSeconds) {
    const elapsedSinceFirstToken = elapsedSeconds - lane.firstTokenTime;
    if (elapsedSinceFirstToken < 0) {
        return 0;
    }

    return upperBound(lane.emissionTimes, elapsedSinceFirstToken) - 1;
}

function upperBound(sortedValues, target) {
    let low = 0;
    let high = sortedValues.length;

    while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (sortedValues[middle] <= target) {
            low = middle + 1;
        } else {
            high = middle;
        }
    }

    return low;
}

function compareTimes(first, second) {
    const delta = Math.abs(first - second);
    if (delta < TIE_THRESHOLD_SECONDS) {
        return {
            key: 'tie',
            label: 'Tie'
        };
    }

    return first < second
        ? { key: 'a', label: LANE_LABELS.a }
        : { key: 'b', label: LANE_LABELS.b };
}
