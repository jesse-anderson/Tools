export const PRISM_TOKEN_STYLES = {
    comment: { color: "#94a3b8", italics: true },
    prolog: { color: "#94a3b8", italics: true },
    doctype: { color: "#94a3b8", italics: true },
    cdata: { color: "#94a3b8", italics: true },
    punctuation: { color: "#cbd5e1" },
    property: { color: "#fda4af" },
    tag: { color: "#fda4af" },
    constant: { color: "#fda4af" },
    symbol: { color: "#fda4af" },
    deleted: { color: "#fda4af" },
    boolean: { color: "#fdba74" },
    number: { color: "#fdba74" },
    selector: { color: "#86efac" },
    "attr-name": { color: "#86efac" },
    string: { color: "#86efac" },
    char: { color: "#86efac" },
    builtin: { color: "#86efac" },
    inserted: { color: "#86efac" },
    operator: { color: "#7dd3fc" },
    entity: { color: "#7dd3fc" },
    url: { color: "#7dd3fc" },
    atrule: { color: "#c4b5fd" },
    "attr-value": { color: "#c4b5fd" },
    keyword: { color: "#c4b5fd" },
    function: { color: "#f9a8d4" },
    "class-name": { color: "#f9a8d4" },
    regex: { color: "#fcd34d" },
    important: { color: "#fcd34d", bold: true },
    variable: { color: "#fcd34d" }
};

export function getPrismTokenStyle(className) {
    return PRISM_TOKEN_STYLES[className] || null;
}

export function getDocxTokenStyle(className) {
    const style = getPrismTokenStyle(className);
    if (!style) {
        return null;
    }

    return {
        ...style,
        color: style.color ? style.color.replace(/^#/, "").toUpperCase() : undefined
    };
}
