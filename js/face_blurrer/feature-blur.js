// Face Blur Tool - Feature Blur
// Eyes-only and feature-based blur (eyebrows, nose, mouth)

import { applyBlackBox } from './blur-algorithms.js';
import { LEFT_EYE_INDICES, RIGHT_EYE_INDICES, LEFT_BROW_INDICES, RIGHT_BROW_INDICES, NOSE_INDICES, MOUTH_INDICES } from './landmarks.js';

// ============================================================================
// EYES-ONLY BLUR
// ============================================================================

// Eyes-only blur - called with mesh directly
export function applyEyesOnlyBlur(ctx, mesh, canvasWidth, canvasHeight, intensity) {
    blurEyeUsingLandmarks(ctx, mesh, canvasWidth, canvasHeight, intensity);
}

// Blur eyes using Face Mesh landmarks
function blurEyeUsingLandmarks(ctx, landmarks, canvasWidth, canvasHeight, intensity) {
    const leftEyePoints = LEFT_EYE_INDICES.map(i => landmarks[i]);
    const rightEyePoints = RIGHT_EYE_INDICES.map(i => landmarks[i]);

    const padding = 0.5;

    // Left eye
    let leftMinX = 1, leftMinY = 1, leftMaxX = 0, leftMaxY = 0;
    for (const pt of leftEyePoints) {
        leftMinX = Math.min(leftMinX, pt.x);
        leftMinY = Math.min(leftMinY, pt.y);
        leftMaxX = Math.max(leftMaxX, pt.x);
        leftMaxY = Math.max(leftMaxY, pt.y);
    }

    const leftEyeX = (leftMinX - padding * (leftMaxX - leftMinX)) * canvasWidth;
    const leftEyeY = (leftMinY - padding * (leftMaxY - leftMinY)) * canvasHeight;
    const leftEyeW = ((leftMaxX - leftMinX) * (1 + 2 * padding)) * canvasWidth;
    const leftEyeH = ((leftMaxY - leftMinY) * (1 + 2 * padding)) * canvasHeight;

    // Right eye
    let rightMinX = 1, rightMinY = 1, rightMaxX = 0, rightMaxY = 0;
    for (const pt of rightEyePoints) {
        rightMinX = Math.min(rightMinX, pt.x);
        rightMinY = Math.min(rightMinY, pt.y);
        rightMaxX = Math.max(rightMaxX, pt.x);
        rightMaxY = Math.max(rightMaxY, pt.y);
    }

    const rightEyeX = (rightMinX - padding * (rightMaxX - rightMinX)) * canvasWidth;
    const rightEyeY = (rightMinY - padding * (rightMaxY - rightMinY)) * canvasHeight;
    const rightEyeW = ((rightMaxX - rightMinX) * (1 + 2 * padding)) * canvasWidth;
    const rightEyeH = ((rightMaxY - rightMinY) * (1 + 2 * padding)) * canvasHeight;

    ctx.fillStyle = '#000000';
    ctx.fillRect(leftEyeX, leftEyeY, leftEyeW, leftEyeH);
    ctx.fillRect(rightEyeX, rightEyeY, rightEyeW, rightEyeH);

    // Eyebrows
    const leftBrowPoints = LEFT_BROW_INDICES.map(i => landmarks[i]);
    const rightBrowPoints = RIGHT_BROW_INDICES.map(i => landmarks[i]);

    const browPadding = 0.2;
    let leftBrowMinX = 1, leftBrowMinY = 1, leftBrowMaxX = 0, leftBrowMaxY = 0;
    for (const pt of leftBrowPoints) {
        leftBrowMinX = Math.min(leftBrowMinX, pt.x);
        leftBrowMinY = Math.min(leftBrowMinY, pt.y);
        leftBrowMaxX = Math.max(leftBrowMaxX, pt.x);
        leftBrowMaxY = Math.max(leftBrowMaxY, pt.y);
    }

    ctx.fillRect(
        (leftBrowMinX - browPadding * (leftBrowMaxX - leftBrowMinX)) * canvasWidth,
        (leftBrowMinY - browPadding * (leftBrowMaxY - leftBrowMinY)) * canvasHeight,
        ((leftBrowMaxX - leftBrowMinX) * (1 + 2 * browPadding)) * canvasWidth,
        ((leftBrowMaxY - leftBrowMinY) * (1 + 2 * browPadding)) * canvasHeight
    );

    let rightBrowMinX = 1, rightBrowMinY = 1, rightBrowMaxX = 0, rightBrowMaxY = 0;
    for (const pt of rightBrowPoints) {
        rightBrowMinX = Math.min(rightBrowMinX, pt.x);
        rightBrowMinY = Math.min(rightBrowMinY, pt.y);
        rightBrowMaxX = Math.max(rightBrowMaxX, pt.x);
        rightBrowMaxY = Math.max(rightBrowMaxY, pt.y);
    }

    ctx.fillRect(
        (rightBrowMinX - browPadding * (rightBrowMaxX - rightBrowMinX)) * canvasWidth,
        (rightBrowMinY - browPadding * (rightBrowMaxY - rightBrowMinY)) * canvasHeight,
        ((rightBrowMaxX - rightBrowMinX) * (1 + 2 * browPadding)) * canvasWidth,
        ((rightBrowMaxY - rightBrowMinY) * (1 + 2 * browPadding)) * canvasHeight
    );
}

// Estimated eye blur (fallback)
function blurEyeEstimated(ctx, x, y, width, height, intensity) {
    const eyeRegionY = y + (height * 0.15);
    const eyeRegionHeight = height * 0.25;
    const eyeRegionWidth = width * 0.5;
    const eyeRegionX = x + (width - eyeRegionWidth) / 2;

    const eyeBoxWidth = eyeRegionWidth * 0.4;
    const eyeGap = eyeRegionWidth * 0.2;
    const leftEyeX = eyeRegionX + (eyeRegionWidth - (eyeBoxWidth * 2) - eyeGap) / 2;
    const rightEyeX = leftEyeX + eyeBoxWidth + eyeGap;

    ctx.fillStyle = '#000000';
    ctx.fillRect(leftEyeX, eyeRegionY, eyeBoxWidth, eyeRegionHeight);
    ctx.fillRect(rightEyeX, eyeRegionY, eyeBoxWidth, eyeRegionHeight);

    const foreheadHeight = height * 0.2;
    ctx.fillRect(eyeRegionX, y, eyeRegionWidth, foreheadHeight);
}

// ============================================================================
// FEATURES BLUR (eyebrows, nose, mouth)
// ============================================================================

// Features blur (eyebrows, nose, mouth)
export async function applyFeaturesBlur(ctx, x, y, width, height, detection, outputCanvas, faceLandmarks, featureBlurring) {
    const canvasWidth = outputCanvas.width;
    const canvasHeight = outputCanvas.height;

    let landmarks = null;
    if (faceLandmarks && faceLandmarks.length > 0) {
        for (const mesh of faceLandmarks) {
            let minX = 1, minY = 1, maxX = 0, maxY = 0;
            for (const landmark of mesh) {
                minX = Math.min(minX, landmark.x);
                minY = Math.min(minY, landmark.y);
                maxX = Math.max(maxX, landmark.x);
                maxY = Math.max(maxY, landmark.y);
            }

            const meshCenterX = (minX + maxX) / 2;
            const meshCenterY = (minY + maxY) / 2;
            const box = detection.boundingBox;
            const boxCenterX = box.xCenter;
            const boxCenterY = box.yCenter;

            if (Math.abs(meshCenterX - boxCenterX) < 0.1 && Math.abs(meshCenterY - boxCenterY) < 0.1) {
                landmarks = mesh;
                break;
            }
        }
    }

    if (!landmarks) {
        applyBlackBox(ctx, x, y, width, height);
        return;
    }

    ctx.fillStyle = '#000000';

    if (featureBlurring.eyes.enabled && featureBlurring.eyes.intensity > 0) {
        const leftEyePoints = LEFT_EYE_INDICES.map(i => landmarks[i]);
        const rightEyePoints = RIGHT_EYE_INDICES.map(i => landmarks[i]);
        const padding = 0.5;

        // Left eye
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of leftEyePoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );

        // Right eye
        minX = 1; minY = 1; maxX = 0; maxY = 0;
        for (const pt of rightEyePoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }

    if (featureBlurring.eyebrows.enabled && featureBlurring.eyebrows.intensity > 0) {
        const leftBrowPoints = LEFT_BROW_INDICES.map(i => landmarks[i]);
        const rightBrowPoints = RIGHT_BROW_INDICES.map(i => landmarks[i]);
        const padding = 0.3;

        // Left eyebrow
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of leftBrowPoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );

        // Right eyebrow
        minX = 1; minY = 1; maxX = 0; maxY = 0;
        for (const pt of rightBrowPoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }

    if (featureBlurring.nose.enabled && featureBlurring.nose.intensity > 0) {
        const nosePoints = NOSE_INDICES.map(i => landmarks[i]);
        const padding = 0.2;
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of nosePoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }

    if (featureBlurring.mouth.enabled && featureBlurring.mouth.intensity > 0) {
        const mouthPoints = MOUTH_INDICES.map(i => landmarks[i]);
        const padding = 0.25;
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of mouthPoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }
}

// Features blur with pre-found mesh
export async function applyFeaturesBlurWithMesh(ctx, mesh, canvasWidth, canvasHeight, featureBlurring) {
    const landmarks = mesh;
    ctx.fillStyle = '#000000';

    if (featureBlurring.eyes.enabled && featureBlurring.eyes.intensity > 0) {
        const leftEyePoints = LEFT_EYE_INDICES.map(i => landmarks[i]);
        const rightEyePoints = RIGHT_EYE_INDICES.map(i => landmarks[i]);
        const padding = 0.5;

        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of leftEyePoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );

        minX = 1; minY = 1; maxX = 0; maxY = 0;
        for (const pt of rightEyePoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }

    if (featureBlurring.eyebrows.enabled && featureBlurring.eyebrows.intensity > 0) {
        const leftBrowPoints = LEFT_BROW_INDICES.map(i => landmarks[i]);
        const rightBrowPoints = RIGHT_BROW_INDICES.map(i => landmarks[i]);
        const padding = 0.3;

        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of leftBrowPoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );

        minX = 1; minY = 1; maxX = 0; maxY = 0;
        for (const pt of rightBrowPoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }

    if (featureBlurring.nose.enabled && featureBlurring.nose.intensity > 0) {
        const nosePoints = NOSE_INDICES.map(i => landmarks[i]);
        const padding = 0.2;
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of nosePoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }

    if (featureBlurring.mouth.enabled && featureBlurring.mouth.intensity > 0) {
        const mouthPoints = MOUTH_INDICES.map(i => landmarks[i]);
        const padding = 0.25;
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of mouthPoints) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
        ctx.fillRect(
            (minX - padding * (maxX - minX)) * canvasWidth,
            (minY - padding * (maxY - minY)) * canvasHeight,
            ((maxX - minX) * (1 + 2 * padding)) * canvasWidth,
            ((maxY - minY) * (1 + 2 * padding)) * canvasHeight
        );
    }
}
