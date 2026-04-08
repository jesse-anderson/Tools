const LIBRARIES = {
    pdfMake: {
        loader: "scriptBundle",
        global: "pdfMake",
        bundles: [
            [
                { src: "../vendor/markdown_exporter/pdfmake.min.js" },
                { src: "../vendor/markdown_exporter/vfs_fonts.js" }
            ],
            [
                { src: "https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/pdfmake.min.js" },
                { src: "https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/vfs_fonts.js" }
            ]
        ]
    },
    docx: {
        loader: "module",
        sources: [
            { src: "../vendor/markdown_exporter/docx.mjs" },
            { src: "https://cdn.jsdelivr.net/npm/docx@9.6.1/+esm" }
        ]
    },
    htmlDocx: {
        loader: "script",
        global: "htmlDocx",
        sources: [
            { src: "../vendor/markdown_exporter/html-docx.js" },
            { src: "https://cdn.jsdelivr.net/npm/html-docx-js@0.3.1/dist/html-docx.js" }
        ]
    }
};

export const PDFMAKE_FONTS = {
    SourceSerifPro: {
        normal: "https://cdn.jsdelivr.net/npm/source-serif-pro@3.1.0/TTF/SourceSerifPro-Regular.ttf",
        bold: "https://cdn.jsdelivr.net/npm/source-serif-pro@3.1.0/TTF/SourceSerifPro-Semibold.ttf",
        italics: "https://cdn.jsdelivr.net/npm/source-serif-pro@3.1.0/TTF/SourceSerifPro-It.ttf",
        bolditalics: "https://cdn.jsdelivr.net/npm/source-serif-pro@3.1.0/TTF/SourceSerifPro-SemiboldIt.ttf"
    },
    SourceCodePro: {
        normal: "https://cdn.jsdelivr.net/npm/source-code-pro@2.42.0/TTF/SourceCodePro-Regular.ttf",
        bold: "https://cdn.jsdelivr.net/npm/source-code-pro@2.42.0/TTF/SourceCodePro-Semibold.ttf",
        italics: "https://cdn.jsdelivr.net/npm/source-code-pro@2.42.0/TTF/SourceCodePro-It.ttf",
        bolditalics: "https://cdn.jsdelivr.net/npm/source-code-pro@2.42.0/TTF/SourceCodePro-SemiboldIt.ttf"
    }
};

const loaderCache = Object.create(null);

export function ensureLibrary(key) {
    if (loaderCache[key]) return loaderCache[key];
    const config = LIBRARIES[key];
    if (!config) return Promise.reject(new Error(`Unknown library key: ${key}`));

    if (config.loader === "script" && config.global && window[config.global]) {
        return Promise.resolve(window[config.global]);
    }
    if (config.loader === "scriptBundle" && config.global && window[config.global]) {
        return Promise.resolve(window[config.global]);
    }

    loaderCache[key] = (config.loader === "module"
        ? loadModuleCandidates(config.sources)
        : config.loader === "scriptBundle"
            ? loadScriptBundles(config.bundles, config.global).then(() => resolveScriptGlobal(config))
            : loadScriptCandidates(config.sources).then(() => resolveScriptGlobal(config)))
        .catch((error) => {
            delete loaderCache[key];
            throw new Error(`${key} load failed. ${error.message}`);
        });

    return loaderCache[key];
}

function resolveScriptGlobal(config) {
    if (!config.global) return null;
    if (window[config.global]) return window[config.global];

    const label = config.loader === "scriptBundle" ? "Scripts loaded" : "Script loaded";
    throw new Error(`${label} but window.${config.global} is unavailable.`);
}

async function loadModuleCandidates(candidates) {
    const errors = [];
    for (const candidate of candidates) {
        try {
            return await import(candidate.src);
        } catch (error) {
            errors.push(`${candidate.src}: ${error.message}`);
        }
    }
    throw new Error(`Tried ${errors.join(" | ")}`);
}

async function loadScriptCandidates(candidates) {
    const errors = [];
    for (const candidate of candidates) {
        const result = await loadScript(candidate);
        if (result.ok) return true;
        errors.push(result.message);
    }
    throw new Error(`Tried ${errors.join(" | ")}`);
}

async function loadScriptBundles(bundles, globalName) {
    const errors = [];
    for (const bundle of bundles) {
        let ok = true;
        const bundleErrors = [];
        const loadedScripts = [];
        for (const script of bundle) {
            const result = await loadScript(script);
            ok = result.ok;
            if (result.ok && result.script) {
                loadedScripts.push(result.script);
            }
            if (!ok) {
                bundleErrors.push(result.message);
                cleanupFailedBundle(loadedScripts, globalName);
                break;
            }
        }
        if (ok) return true;
        errors.push(bundleErrors.join(" -> "));
    }
    throw new Error(`Tried ${errors.join(" | ")}`);
}

function loadScript({ src, integrity }) {
    return new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        if (integrity) {
            script.integrity = integrity;
            script.crossOrigin = "anonymous";
            script.referrerPolicy = "no-referrer";
        }
        script.onload = () => resolve({ ok: true, src, script });
        script.onerror = () => {
            script.remove();
            resolve({ ok: false, message: `${src}: script load error` });
        };
        document.head.appendChild(script);
    });
}

function cleanupFailedBundle(loadedScripts, globalName) {
    loadedScripts.forEach((script) => script.remove());
    if (globalName && Object.prototype.hasOwnProperty.call(window, globalName)) {
        try {
            delete window[globalName];
        } catch (error) {
            window[globalName] = undefined;
        }
    }
}
