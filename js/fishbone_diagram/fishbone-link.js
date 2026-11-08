// Snapshot links: the project packed into the URL fragment, which browsers
// never send to a server. JSON, deflate-raw, then base64url. Pure apart from
// CompressionStream. Opening a link runs the same cleaner as a file import.

import { LIMITS } from './fishbone-limits.js';
import { ROOT } from './fishbone-ops.js';
import { readBoard } from './fishbone-schema.js';

export const LINK_KEY = 'snap';
const DAMAGED = 'This link is damaged or incomplete. Nothing from it was opened.';
const MAX_JSON = LIMITS.fileBytes;

export const linkSupported = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

function toBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
    if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
    try {
        const binary = atob(b64);
        const out = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
        return out;
    } catch (e) {
        return null;
    }
}

async function deflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Inflate, refusing anything that grows past the cap. */
async function inflate(bytes, cap) {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const parts = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > cap) { await reader.cancel(); return null; }
        parts.push(value);
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
}

/** What a link carries: the live tree, statuses, owners, evidence and settings; no history or deleted items. */
export function linkPayload(board, { name = '', now = 0, dropEvidence = false } = {}) {
    const nodes = {};
    const order = { [ROOT]: [] };
    for (const node of Object.values(board.nodes)) {
        if (node.deleted) continue;
        nodes[node.id] = { ...node, evidence: dropEvidence ? [] : node.evidence };
    }
    for (const [pid, list] of Object.entries(board.order)) {
        if (pid === ROOT || nodes[pid]) order[pid] = list.filter((id) => nodes[id]);
    }
    return {
        v: 1,
        at: now,
        name: String(name).slice(0, LIMITS.title),
        board: { ...board, nodes, order, history: [], historyN: 0, members: {}, voteTotals: {} }
    };
}

/**
 * Pack a board into a link. Returns { ok, url, length } or
 * { ok: false, length, message } when it is over the limit.
 */
export async function packLink(board, { baseUrl, name = '', now = 0, dropEvidence = false }) {
    const json = JSON.stringify(linkPayload(board, { name, now, dropEvidence }));
    const packed = toBase64Url(await deflate(new TextEncoder().encode(json)));
    const url = `${baseUrl.split('#')[0]}#${LINK_KEY}=${packed}`;
    if (url.length > LIMITS.linkChars) {
        return { ok: false, length: url.length, message: `Too large for a link (${url.length.toLocaleString('en-US')} characters, the limit is ${LIMITS.linkChars.toLocaleString('en-US')}). Export a file instead${dropEvidence ? '' : ', or leave out the evidence'}.` };
    }
    return { ok: true, url, length: url.length };
}

/** The packed text from a location hash, or null when the hash is not a snapshot. */
export function linkFromHash(hash) {
    const match = /^#snap=(.*)$/s.exec(String(hash || ''));
    return match ? match[1] : null;
}

/** Open a packed link. Returns { ok, board, at, name } or { ok: false, message }. */
export async function unpackLink(packed) {
    if (typeof packed !== 'string' || !packed || packed.length > LIMITS.linkChars) return { ok: false, message: DAMAGED };
    const bytes = fromBase64Url(packed);
    if (!bytes) return { ok: false, message: DAMAGED };
    let json;
    try {
        const raw = await inflate(bytes, MAX_JSON);
        if (!raw) return { ok: false, message: DAMAGED };
        json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
    } catch (e) {
        return { ok: false, message: DAMAGED };
    }
    if (!json || typeof json !== 'object' || json.v !== 1) return { ok: false, message: DAMAGED };
    const read = readBoard(json.board);
    if (!read.ok) return { ok: false, message: DAMAGED };
    return {
        ok: true,
        board: read.board,
        at: Number.isFinite(json.at) ? json.at : 0,
        name: typeof json.name === 'string' ? json.name.slice(0, LIMITS.title) : ''
    };
}
