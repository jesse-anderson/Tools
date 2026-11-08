// Canvas text measure shared by the diagram tools.

export const FONT = "'Space Grotesk', system-ui, 'Segoe UI', Arial, sans-serif";

/**
 * A measure(text, size, weight) function. Text is measured on a canvas where
 * there is one, and estimated at 0.6 em a character where there is not.
 */
export function createTextMeasure(doc, font = FONT) {
    let ruler = null;
    try { ruler = doc.createElement('canvas').getContext('2d'); } catch (e) { ruler = null; }
    return function measure(text, size, weight = 400) {
        if (!ruler) return text.length * size * 0.6;
        ruler.font = `${weight} ${size}px ${font}`;
        return ruler.measureText(text).width;
    };
}
