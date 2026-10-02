// Project store for the process flow mapper. Pure: storage is passed in.
//
// A project holds two copies of the form. draft is written on every edit, so a
// reload loses nothing. saved moves only when the user saves, and is what
// Revert returns to.

export const STORAGE_KEY = 'processFlowMapper.projects.v1';
export const MAX_PROJECTS = 10;

const MAX_TEXT = 100000;
const MAX_NAME = 60;
const MAX_FIELDS = 60;
const MAX_FIELD_VALUE = 200;

/** Coerce anything into a well-formed state, dropping what does not belong. */
export function cleanState(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const fields = {};
    const entries = source.fields && typeof source.fields === 'object' ? Object.entries(source.fields) : [];
    for (const [key, value] of entries.slice(0, MAX_FIELDS)) {
        if (typeof value === 'boolean') fields[key] = value;
        else if (typeof value === 'string') fields[key] = value.slice(0, MAX_FIELD_VALUE);
    }
    return { text: typeof source.text === 'string' ? source.text.slice(0, MAX_TEXT) : '', fields };
}

export function cleanName(raw, fallback = 'Untitled') {
    const name = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    return name || fallback;
}

const sameState = (a, b) => JSON.stringify(cleanState(a)) === JSON.stringify(cleanState(b));

export function emptyStore() {
    return { version: 1, activeId: null, projects: [] };
}

/** Rebuild a store from parsed JSON. Returns null when it is not a store at all. */
export function sanitizeStore(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.projects)) return null;
    const store = emptyStore();
    const seen = new Set();
    for (const p of raw.projects) {
        if (store.projects.length >= MAX_PROJECTS) break;
        if (!p || typeof p !== 'object' || typeof p.id !== 'string' || seen.has(p.id)) continue;
        seen.add(p.id);
        const draft = cleanState(p.draft);
        store.projects.push({
            id: p.id,
            name: cleanName(p.name),
            draft,
            // A project with no saved copy treats its draft as the save point.
            saved: p.saved ? cleanState(p.saved) : draft,
            updatedAt: Number.isFinite(p.updatedAt) ? p.updatedAt : 0,
            savedAt: Number.isFinite(p.savedAt) ? p.savedAt : 0
        });
    }
    store.activeId = seen.has(raw.activeId) && store.projects.some((p) => p.id === raw.activeId)
        ? raw.activeId
        : (store.projects[0] ? store.projects[0].id : null);
    return store;
}

/**
 * Read the store. problem is null, 'unavailable' (storage throws, as in some
 * private windows) or 'corrupt' (the saved value was not a store).
 */
export function loadStore(storage) {
    let text;
    try {
        text = storage.getItem(STORAGE_KEY);
    } catch (e) {
        return { store: emptyStore(), problem: 'unavailable' };
    }
    if (text === null || text === undefined) return { store: emptyStore(), problem: null };
    try {
        const store = sanitizeStore(JSON.parse(text));
        return store ? { store, problem: null } : { store: emptyStore(), problem: 'corrupt' };
    } catch (e) {
        return { store: emptyStore(), problem: 'corrupt' };
    }
}

/** Write the store. Returns false when the browser refuses, for example on quota. */
export function persistStore(storage, store) {
    try {
        storage.setItem(STORAGE_KEY, JSON.stringify(store));
        return true;
    } catch (e) {
        return false;
    }
}

export const getProject = (store, id) => store.projects.find((p) => p.id === id) || null;
export const activeProject = (store) => getProject(store, store.activeId);
export const isFull = (store) => store.projects.length >= MAX_PROJECTS;
export const isDirty = (project) => !sameState(project.draft, project.saved);

/** "Project 3", skipping names already in use. */
export function nextName(store, base = 'Project') {
    const names = new Set(store.projects.map((p) => p.name));
    for (let n = 1; n <= MAX_PROJECTS + 1; n++) {
        if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
    }
    return base;
}

/** Add a project and make it active. Returns null when the store is full. */
export function addProject(store, name, state, now = 0) {
    if (isFull(store)) return null;
    const used = new Set(store.projects.map((p) => p.id));
    let n = store.projects.length + 1;
    while (used.has(`p${n}`)) n++;
    const clean = cleanState(state);
    const project = { id: `p${n}`, name: cleanName(name), draft: clean, saved: clean, updatedAt: now, savedAt: now };
    store.projects.push(project);
    store.activeId = project.id;
    return project;
}

/** Remove a project. The active one moves to a neighbour, or to null if none are left. */
export function removeProject(store, id) {
    const at = store.projects.findIndex((p) => p.id === id);
    if (at < 0) return false;
    store.projects.splice(at, 1);
    if (store.activeId === id) {
        const next = store.projects[Math.min(at, store.projects.length - 1)];
        store.activeId = next ? next.id : null;
    }
    return true;
}

export function setDraft(project, state, now = 0) {
    const clean = cleanState(state);
    if (sameState(clean, project.draft)) return false;
    project.draft = clean;
    project.updatedAt = now;
    return true;
}

/** Make the current draft the point Revert returns to. */
export function commitProject(project, now = 0) {
    project.saved = cleanState(project.draft);
    project.savedAt = now;
}

export const FILE_FORMAT = 'process-flow-project';
export const MAX_FILE_BYTES = 400000;

/** One project as the text of a file: the form as it stands, with its name. */
export function projectToFile(project) {
    return JSON.stringify({ format: FILE_FORMAT, version: 1, name: project.name, state: cleanState(project.draft) }, null, 2);
}

/**
 * Read a project file. Returns { ok, name, state } or { ok: false, message }.
 * The contents are cleaned like anything from storage, never trusted.
 */
export function projectFromFile(text) {
    let raw;
    try {
        raw = JSON.parse(text);
    } catch (e) {
        return { ok: false, message: 'That file is not a process flow project: it is not JSON' };
    }
    if (!raw || typeof raw !== 'object' || raw.format !== FILE_FORMAT) {
        return { ok: false, message: 'That file is not a process flow project exported from this tool' };
    }
    if (raw.version !== 1) {
        return { ok: false, message: 'That project file is from a newer version of this tool and cannot be read' };
    }
    if (!raw.state || typeof raw.state !== 'object' || typeof raw.state.text !== 'string') {
        return { ok: false, message: 'That project file has no flow list in it' };
    }
    return { ok: true, name: cleanName(raw.name), state: cleanState(raw.state) };
}

/** A name not already in use: "Budget", then "Budget (2)". */
export function uniqueName(store, name) {
    const names = new Set(store.projects.map((p) => p.name));
    if (!names.has(name)) return name;
    for (let n = 2; n <= MAX_PROJECTS + 1; n++) {
        const candidate = cleanName(`${name.slice(0, MAX_NAME - 5)} (${n})`);
        if (!names.has(candidate)) return candidate;
    }
    return name;
}

/** Throw the draft away and go back to the last save. */
export function revertProject(project, now = 0) {
    project.draft = cleanState(project.saved);
    project.updatedAt = now;
}
