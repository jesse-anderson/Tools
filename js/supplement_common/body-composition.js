// Skeletal muscle mass from body mass and body fat, shared by the Creatine Lab
// and the Beta-Alanine Lab. Direct FFM or SMM, when given, wins over the estimate.

// Skeletal muscle as a fraction of fat-free mass. 0.45 is the general adult
// figure (Cooper 2012, ISSN 2017); the Creatine Lab's athletic preset uses 0.53.
export const FFM_TO_SMM_DEFAULT = 0.45;
export const FFM_TO_SMM_MIN = 0.25;
export const FFM_TO_SMM_MAX = 0.65;
export const BODY_FAT_PERCENT_DEFAULT = 20;

export function estimateSkeletalMuscleMass(params = {}) {
    const bodyMassKg = Math.max(numberOr(params.bodyMassKg, 70), 1e-9);
    const bodyFatPercent = clamp(numberOr(params.bodyFatPercent, BODY_FAT_PERCENT_DEFAULT), 3, 60);
    const directFatFreeMassKg = Math.max(numberOr(params.fatFreeMassKg, 0), 0);
    const directSkeletalMuscleMassKg = Math.max(numberOr(params.skeletalMuscleMassKg, 0), 0);
    const ffmToSmmFraction = clamp(fraction(params.ffmToSmmFraction, FFM_TO_SMM_DEFAULT), FFM_TO_SMM_MIN, FFM_TO_SMM_MAX);

    const estimatedFatFreeMassKg = bodyMassKg * (1 - bodyFatPercent / 100);
    const fatFreeMassKg = directFatFreeMassKg > 0 ? directFatFreeMassKg : estimatedFatFreeMassKg;
    const estimatedSkeletalMuscleMassKg = fatFreeMassKg * ffmToSmmFraction;
    const skeletalMuscleMassKg = directSkeletalMuscleMassKg > 0 ? directSkeletalMuscleMassKg : estimatedSkeletalMuscleMassKg;

    return {
        bodyMassKg,
        bodyFatPercent,
        estimatedFatFreeMassKg,
        fatFreeMassKg,
        fatFreeMassSource: directFatFreeMassKg > 0 ? "direct" : "body-fat estimate",
        estimatedSkeletalMuscleMassKg,
        skeletalMuscleMassKg,
        skeletalMuscleMassSource: directSkeletalMuscleMassKg > 0
            ? "direct"
            : directFatFreeMassKg > 0
                ? "direct FFM estimate"
                : "body-fat/FFM estimate",
        ffmToSmmFraction
    };
}

function numberOr(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

// Accepts 0.45 or 45.
function fraction(value, fallback) {
    const numeric = numberOr(value, fallback);
    return numeric > 1 ? numeric / 100 : numeric;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
