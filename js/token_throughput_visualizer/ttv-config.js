export const STORAGE_KEY = 'tokenThroughputVisualizer.settings.v2';
export const SHARE_QUERY_PARAM = 'ttv';
export const PREVIEW_TOKEN_LIMIT = 2048;
export const MAX_SAMPLE_LENGTH = 40000;
export const MAX_STORED_SAMPLE_LENGTH = 16000;
export const MAX_SHARED_SAMPLE_LENGTH = 1200;
export const MAX_REPORT_SAMPLE_LENGTH = 1200;
export const STORAGE_DEBOUNCE_MS = 150;
export const TIE_THRESHOLD_SECONDS = 0.05;
export const MILESTONE_LENGTHS = [1, 100, 250, 500, 1000];
export const TOKEN_CHUNK_PATTERN = [0.58, 0.88, 1.12, 0.76, 1.28, 0.94, 1.18, 0.82];
export const LANE_KEYS = ['a', 'b'];
export const LANE_LABELS = {
    a: 'Lane A',
    b: 'Lane B'
};

export const SAMPLE_PRESETS = {
    chat: {
        label: 'Chat',
        charsPerToken: 3.8,
        fallbackCharsPerWord: 4.9,
        sample: [
            'Based on your constraints, I would not start with a full rebuild. I would stabilize the current service, isolate the slowest paths, and move one bounded workflow before touching the rest of the stack. That keeps the migration small enough to measure while still producing a visible improvement for the team.',
            'A reasonable sequence would look like this.',
            '1. Instrument the current system.\nAdd request timing around the slowest endpoints, log query counts, and capture payload sizes for the routes people complain about most often. That tells you whether the delay comes from database work, repeated downstream calls, or heavy response formatting.',
            '2. Pick a narrow first migration.\nChoose a workflow with clear inputs and outputs, such as nightly exports, invoice generation, or a read only reporting endpoint. Avoid shared write paths until the surrounding observability and rollback process are in place.',
            '3. Put parity checks in front of the rollout.\nFor a short period, run the old path and the new path side by side, compare record counts and important totals, and store mismatches in a review table. That is usually faster than trying to reason about every edge case in advance.',
            '4. Decide what success means before release.\nIf the new path is only ten percent faster but removes timeouts and reduces operational noise, that may already be enough. Tie the decision to error rate, support volume, and completion time instead of using architecture alone as the goal.',
            'I would also set expectations with the team. The first migration should prove that the delivery process works, not that every performance problem disappears immediately. Once you can ship one path safely, the second and third migrations become much easier because the measurement, deployment, and rollback habits already exist.',
            'If you want, I can turn this into a one week implementation plan with owners, checkpoints, and a minimal dashboard for tracking the rollout.'
        ].join('\n\n')
    },
    prose: {
        label: 'Prose',
        charsPerToken: 4.4,
        fallbackCharsPerWord: 5.4,
        sample: [
            'The market opened before the sun cleared the eastern buildings. Vendors worked by habit more than by sight, unfolding tables, lifting crates, and setting handwritten signs against jars of olives and baskets of citrus. The square held a low murmur at first, the kind of sound that seems less like conversation than like preparation. A truck door shut, someone laughed at a private remark, and the fountain at the center of the plaza went on speaking to itself with the same thin persistence it had kept through the night.',
            'By seven the light had changed enough to sharpen the edges of everything. Tomatoes that had looked nearly black under the awnings turned a heavy red. Fish laid on chipped ice reflected the sky in bright, narrow bands. A baker at the corner stall brushed flour from a wooden board with the side of his hand, and the gesture sent a pale cloud into the air that lingered just long enough to catch the morning sun. People slowed as they entered the square, not because there was any spectacle to inspect, but because the whole scene rewarded attention in small increments.',
            'Nothing in the market suggested urgency, yet the place was full of exact timing. Coffee was strongest in the first hour, before the queue deepened. Herbs looked freshest before the heat found them. Late buyers received better prices on fruit but worse choices on bread. Even the regulars adjusted their routes by instinct, taking fish first on one day, greens first on another, depending on weather, season, or the position of a single delivery van at the curb. The order seemed casual only to people who had not learned how much thought can hide inside repetition.',
            'When the church bell struck eight, a brief hush passed through the crowd. It lasted no longer than a held breath. Then bargaining resumed, scooters moved along the side street, and a child began reading product names aloud from a stack of labels while his mother corrected his pronunciation without looking up from the register. The square did not become busier all at once. It thickened. Detail gathered on detail until the morning felt complete, not because anything dramatic had happened, but because enough ordinary things had arrived in the right sequence.'
        ].join('\n\n')
    },
    code: {
        label: 'Code',
        charsPerToken: 3.1,
        fallbackCharsPerWord: 6.2,
        sample: [
            'const CACHE_TTL_MS = 5 * 60 * 1000;',
            'const snapshotCache = new Map();',
            '',
            'function getCacheKey(warehouseId, category) {',
            '    return `${warehouseId}:${category}`;',
            '}',
            '',
            'async function fetchInventory(api, warehouseId, category) {',
            '    const response = await api.get("/inventory", {',
            '        params: { warehouseId, category }',
            '    });',
            '',
            '    return response.data.items;',
            '}',
            '',
            'function summarizeItems(items) {',
            '    return items.reduce((summary, item) => {',
            '        const quantity = Number(item.quantity || 0);',
            '        const reserved = Number(item.reserved || 0);',
            '        const available = Math.max(0, quantity - reserved);',
            '',
            '        summary.totalQuantity += quantity;',
            '        summary.totalReserved += reserved;',
            '        summary.totalAvailable += available;',
            '',
            '        if (available <= item.reorderPoint) {',
            '            summary.restockSoon.push({',
            '                sku: item.sku,',
            '                available,',
            '                reorderPoint: item.reorderPoint',
            '            });',
            '        }',
            '',
            '        return summary;',
            '    }, {',
            '        totalQuantity: 0,',
            '        totalReserved: 0,',
            '        totalAvailable: 0,',
            '        restockSoon: []',
            '    });',
            '}',
            '',
            'export async function getInventorySnapshot(api, warehouseId, category) {',
            '    const cacheKey = getCacheKey(warehouseId, category);',
            '    const cached = snapshotCache.get(cacheKey);',
            '',
            '    if (cached && (Date.now() - cached.createdAt) < CACHE_TTL_MS) {',
            '        return cached.value;',
            '    }',
            '',
            '    const items = await fetchInventory(api, warehouseId, category);',
            '    const summary = summarizeItems(items);',
            '',
            '    summary.restockSoon.sort((left, right) => {',
            '        if (left.available !== right.available) {',
            '            return left.available - right.available;',
            '        }',
            '',
            '        return left.sku.localeCompare(right.sku);',
            '    });',
            '',
            '    const snapshot = {',
            '        warehouseId,',
            '        category,',
            '        createdAt: new Date().toISOString(),',
            '        itemCount: items.length,',
            '        totals: {',
            '            quantity: summary.totalQuantity,',
            '            reserved: summary.totalReserved,',
            '            available: summary.totalAvailable',
            '        },',
            '        restockSoon: summary.restockSoon.slice(0, 20)',
            '    };',
            '',
            '    snapshotCache.set(cacheKey, {',
            '        createdAt: Date.now(),',
            '        value: snapshot',
            '    });',
            '',
            '    return snapshot;',
            '}',
            '',
            'export function clearInventorySnapshot(warehouseId, category) {',
            '    snapshotCache.delete(getCacheKey(warehouseId, category));',
            '}'
        ].join('\n')
    }
};

export const BURSTINESS_PRESETS = {
    smooth: {
        label: 'Smooth',
        pattern: [1]
    },
    natural: {
        label: 'Natural',
        pattern: [0.82, 1.06, 0.95, 1.1, 0.88, 1.08, 0.98, 1.13]
    },
    bursty: {
        label: 'Bursty',
        pattern: [0.34, 0.42, 0.58, 2.35, 0.46, 0.54, 1.88, 2.03]
    }
};

for (const preset of Object.values(BURSTINESS_PRESETS)) {
    const average = preset.pattern.reduce((sum, value) => sum + value, 0) / preset.pattern.length;
    preset.normalizedPattern = preset.pattern.map((value) => value / average);
}

export const SCENARIO_PRESETS = {
    'fast-vs-slow': {
        label: 'Different Rate',
        description: 'Same TTFT, different throughput.',
        samplePreset: 'chat',
        outputTokens: 300,
        lanes: {
            a: {
                tokensPerSecond: 40,
                startupDelay: 0.8,
                charsPerToken: SAMPLE_PRESETS.chat.charsPerToken,
                burstiness: 'natural'
            },
            b: {
                tokensPerSecond: 20,
                startupDelay: 0.8,
                charsPerToken: SAMPLE_PRESETS.chat.charsPerToken,
                burstiness: 'natural'
            }
        }
    },
    'smooth-vs-bursty': {
        label: 'Different Cadence',
        description: 'Same TTFT and rate, different cadence.',
        samplePreset: 'chat',
        outputTokens: 300,
        lanes: {
            a: {
                tokensPerSecond: 40,
                startupDelay: 0.8,
                charsPerToken: SAMPLE_PRESETS.chat.charsPerToken,
                burstiness: 'smooth'
            },
            b: {
                tokensPerSecond: 40,
                startupDelay: 0.8,
                charsPerToken: SAMPLE_PRESETS.chat.charsPerToken,
                burstiness: 'bursty'
            }
        }
    },
    'latency-duel': {
        label: 'Latency vs Throughput',
        description: 'Earlier first token versus higher steady-state rate.',
        samplePreset: 'prose',
        outputTokens: 600,
        lanes: {
            a: {
                tokensPerSecond: 30,
                startupDelay: 0.3,
                charsPerToken: SAMPLE_PRESETS.prose.charsPerToken,
                burstiness: 'natural'
            },
            b: {
                tokensPerSecond: 46,
                startupDelay: 1.3,
                charsPerToken: SAMPLE_PRESETS.prose.charsPerToken,
                burstiness: 'natural'
            }
        }
    }
};

export function createScenarioSettings(scenarioPreset) {
    const preset = SCENARIO_PRESETS[scenarioPreset];

    return {
        scenarioPreset,
        samplePreset: preset.samplePreset,
        sampleIsCustom: false,
        outputTokens: preset.outputTokens,
        sampleText: SAMPLE_PRESETS[preset.samplePreset].sample,
        lanes: {
            a: { ...preset.lanes.a },
            b: { ...preset.lanes.b }
        }
    };
}
