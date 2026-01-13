// WebWorker for pixel-intensive blur operations
// Runs in background thread to avoid blocking UI

// Process mosaic blur
function processMosaic(data, width, height, tileSize) {
    const result = new Uint8ClampedArray(data);

    for (let tileY = 0; tileY < height; tileY += tileSize) {
        for (let tileX = 0; tileX < width; tileX += tileSize) {
            const tileW = Math.min(tileSize, width - tileX);
            const tileH = Math.min(tileSize, height - tileY);

            // Get average color for this tile
            let r = 0, g = 0, b = 0, count = 0;

            for (let py = 0; py < tileH; py++) {
                for (let px = 0; px < tileW; px++) {
                    const idx = ((tileY + py) * width + (tileX + px)) * 4;
                    r += data[idx];
                    g += data[idx + 1];
                    b += data[idx + 2];
                    count++;
                }
            }

            r = Math.floor(r / count);
            g = Math.floor(g / count);
            b = Math.floor(b / count);

            // Fill tile with average color
            for (let py = 0; py < tileH; py++) {
                for (let px = 0; px < tileW; px++) {
                    const idx = ((tileY + py) * width + (tileX + px)) * 4;
                    result[idx] = r;
                    result[idx + 1] = g;
                    result[idx + 2] = b;
                }
            }
        }
    }

    return result;
}

// Process skin mask blur
function processSkinMask(data, width, height, blurRadius) {
    // First pass: create skin mask
    const skinMask = new Uint8Array(width * height);

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const pixelIndex = i / 4;

        // Simple skin tone detection
        const isSkin = (
            r > 60 && r < 255 &&
            g > 40 && g < 210 &&
            b > 20 && b < 180 &&
            r > g && g > b &&
            (r - g) > 15 &&
            (r - b) > 30 &&
            (g - b) > 10
        );

        // Also check for darker skin tones
        const isDarkSkin = (
            r > 50 && r < 180 &&
            g > 30 && g < 140 &&
            b > 20 && b < 100 &&
            r > g && g >= b &&
            (r - g) > 10
        );

        skinMask[pixelIndex] = (isSkin || isDarkSkin) ? 1 : 0;
    }

    // Simple box blur for skin pixels
    const result = new Uint8ClampedArray(data);
    const radius = Math.max(1, Math.floor(blurRadius / 2));

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 4;

            if (skinMask[y * width + x] === 1) {
                // Apply blur to this pixel
                let r = 0, g = 0, b = 0, count = 0;

                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const ny = y + dy;
                        const nx = x + dx;

                        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                            const nidx = (ny * width + nx) * 4;
                            r += data[nidx];
                            g += data[nidx + 1];
                            b += data[nidx + 2];
                            count++;
                        }
                    }
                }

                result[idx] = Math.floor(r / count);
                result[idx + 1] = Math.floor(g / count);
                result[idx + 2] = Math.floor(b / count);
            }
        }
    }

    return result;
}

// Message handler
self.onmessage = function(e) {
    const { id, type, data, width, height, param1 } = e.data;
    let resultArray;

    if (type === 'mosaic') {
        resultArray = processMosaic(data, width, height, param1);
    } else if (type === 'skinmask') {
        resultArray = processSkinMask(data, width, height, param1);
    }

    // Transfer the buffer of the result array back to main thread
    self.postMessage({ id, result: resultArray.buffer }, [resultArray.buffer]);
};

// Send ready message
setTimeout(() => self.postMessage({ type: 'ready' }), 0);
