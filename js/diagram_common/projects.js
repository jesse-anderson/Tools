// Project store shared by the diagram tools. Pure: storage is passed in.
//
// A project holds two copies of its state. draft is written on every edit, so
// a reload loses nothing. saved moves only when the user saves, and is what
// Revert returns to.

const MAX_TEXT = 100000;
const MAX_NAME = 60;
const MAX_FIELDS = 60;
const MAX_FIELD_VALUE = 200;

/** The text and fields state used by the Sankey and process flow tools. */
export function cleanTextState(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const fields = {};
    const entries = source.fields && typeof source.fields === 'object' ? Object.entries(source.fields) : [];
    for (const [key, value] of entries.slice(0, MAX_FIELDS)) {
        if (typeof value === 'boolean') fields[key] = value;
        else if (typeof value === 'string') fields[key] = value.slice(0, MAX_FIELD_VALUE);
    }
    return { text: typeof source.text === 'string' ? source.text.slice(0, MAX_TEXT) : '', fields };
}

const hasText = (state) => Boolean(state) && typeof state === 'object' && typeof state.text === 'string';

export function cleanName(raw, fallback = 'Untitled') {
    const name = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    return name || fallback;
}

/**
 * Build a store for one tool. cleanState coerces anything into a valid state;
 * hasContent says whether a file's raw state is worth reading at all.
 */
export function createProjectStore({
    storageKey,
    fileFormat,
    label,
    maxProjects = 10,
    maxFileBytes = 400000,
    cleanState = cleanTextState,
    hasContent = hasText,
    noContentMessage = 'That project file has nothing in it to open'
}) {
    const sameState = (a, b) => JSON.stringify(cleanState(a)) === JSON.stringify(cleanState(b));

    function emptyStore() {
        return { version: 1, activeId: null, projects: [] };
    }

    /** Rebuild a store from parsed JSON. Returns null when it is not a store at all. */
    function sanitizeStore(raw) {
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.projects)) return null;
        const store = emptyStore();
        const seen = new Set();
        for (const p of raw.projects) {
            if (store.projects.length >= maxProjects) break;
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
     * Read the store. problem is null, 'unavailable' (storage throws, as in
     * some private windows) or 'corrupt' (the saved value was not a store).
     */
    function loadStore(storage) {
        let text;
        try {
            text = storage.getItem(storageKey);
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
    function persistStore(storage, store) {
        try {
            storage.setItem(storageKey, JSON.stringify(store));
            return true;
        } catch (e) {
            return false;
        }
    }

    const getProject = (store, id) => store.projects.find((p) => p.id === id) || null;
    const activeProject = (store) => getProject(store, store.activeId);
    const isFull = (store) => store.projects.length >= maxProjects;
    const isDirty = (project) => !sameState(project.draft, project.saved);

    /** "Project 3", skipping names already in use. */
    function nextName(store, base = 'Project') {
        const names = new Set(store.projects.map((p) => p.name));
        for (let n = 1; n <= maxProjects + 1; n++) {
            if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
        }
        return base;
    }

    /** Add a project and make it active. Returns null when the store is full. */
    function addProject(store, name, state, now = 0) {
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

    /** Remove a project. The active one moves to a neighbor, or to null if none are left. */
    function removeProject(store, id) {
        const at = store.projects.findIndex((p) => p.id === id);
        if (at < 0) return false;
        store.projects.splice(at, 1);
        if (store.activeId === id) {
            const next = store.projects[Math.min(at, store.projects.length - 1)];
            store.activeId = next ? next.id : null;
        }
        return true;
    }

    function setDraft(project, state, now = 0) {
        const clean = cleanState(state);
        if (sameState(clean, project.draft)) return false;
        project.draft = clean;
        project.updatedAt = now;
        return true;
    }

    /** Make the current draft the point Revert returns to. */
    function commitProject(project, now = 0) {
        project.saved = cleanState(project.draft);
        project.savedAt = now;
    }

    /** One project as the text of a file: the state as it stands, with its name. */
    function projectToFile(project) {
        return JSON.stringify({ format: fileFormat, version: 1, name: project.name, state: cleanState(project.draft) }, null, 2);
    }

    /**
     * Read a project file. Returns { ok, name, state } or { ok: false, message }.
     * The contents are cleaned like anything from storage, never trusted.
     */
    function projectFromFile(text) {
        let raw;
        try {
            raw = JSON.parse(text);
        } catch (e) {
            return { ok: false, message: `That file is not a ${label} project: it is not JSON` };
        }
        if (!raw || typeof raw !== 'object' || raw.format !== fileFormat) {
            return { ok: false, message: `That file is not a ${label} project exported from this tool` };
        }
        if (raw.version !== 1) {
            return { ok: false, message: 'That project file is from a newer version of this tool and cannot be read' };
        }
        if (!hasContent(raw.state)) return { ok: false, message: noContentMessage };
        return { ok: true, name: cleanName(raw.name), state: cleanState(raw.state) };
    }

    /** A name not already in use: "Budget", then "Budget (2)". */
    function uniqueName(store, name) {
        const names = new Set(store.projects.map((p) => p.name));
        if (!names.has(name)) return name;
        for (let n = 2; n <= maxProjects + 1; n++) {
            const candidate = cleanName(`${name.slice(0, MAX_NAME - 5)} (${n})`);
            if (!names.has(candidate)) return candidate;
        }
        return name;
    }

    /** Throw the draft away and go back to the last save. */
    function revertProject(project, now = 0) {
        project.draft = cleanState(project.saved);
        project.updatedAt = now;
    }

    return Object.freeze({
        STORAGE_KEY: storageKey,
        FILE_FORMAT: fileFormat,
        MAX_PROJECTS: maxProjects,
        MAX_FILE_BYTES: maxFileBytes,
        cleanState, cleanName, emptyStore, sanitizeStore, loadStore, persistStore,
        getProject, activeProject, isFull, isDirty, nextName, addProject, removeProject,
        setDraft, commitProject, projectToFile, projectFromFile, uniqueName, revertProject
    });
}
