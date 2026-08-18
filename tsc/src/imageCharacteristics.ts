// Cheap, paper.js-free statistics over a source ImageData, used by
// smartDefaults.ts to distinguish "flat/vector-ish art" (a handful of
// solid regions, sharp boundaries - e.g. a logo, a cartoon, clip art) from
// "continuous-tone/photographic" content (smoothly varying tone and color
// everywhere, few if any truly flat regions), and to feed
// processingEstimator.ts's `complexity` input.
//
// Deliberately independent of vectorizer.ts/paper.js (same reasoning as
// imageGradient.ts - see that file's header): this only ever touches raw
// ImageData and plain numbers/typed arrays, so it runs anywhere, including
// in this repo's Node test environment without a compiled `canvas` addon.
export type ImageCharacteristics = {
    widthPx: number;
    heightPx: number;
    // Fraction of pixels that are non-transparent.
    opaqueFraction: number;
    // 0..1. Higher means color content is concentrated in a small number of
    // dominant colors (few, saturated buckets hold most pixels) - the
    // signature of flat/vector-ish art, which by construction has a small
    // number of distinct fill colors. Lower means color is spread broadly
    // across many buckets - continuous tone/photographic content.
    colorConcentration: number;
    // Rough count of "dominant" colors - histogram buckets each holding at
    // least DOMINANT_BUCKET_MIN_SHARE of opaque pixels. A reasonable proxy
    // for "how many pens would a human pick for this image".
    estimatedDistinctColors: number;
    // Fraction of sampled cells with ~zero local luminance gradient - large
    // uniform regions. High for flat art (broad solid fills), low for
    // photos (continuous tone rarely sits perfectly flat).
    flatFraction: number;
    // Fraction of sampled cells with a strong local luminance gradient -
    // hard edges. Both flat art (crisp boundaries) and photos (real edges)
    // have some of this, so this alone doesn't separate them - see
    // midToneFraction below, which is the more telling signal.
    edgeFraction: number;
    // Fraction of sampled cells that are neither flat nor a hard edge -
    // i.e. genuinely gradual shading. This is the strongest single signal
    // for continuous-tone content: flat art has almost none of it (a
    // region is either a solid fill or a boundary between two solid
    // fills), photos are dominated by it (soft shading, gradients,
    // texture).
    midToneFraction: number;
    // 0 (flat/vector-ish) .. 1 (continuous-tone/photographic) - the single
    // blended score smartDefaults.ts branches its recommendations on. See
    // computeContinuousToneScore's own comment for the exact formula/why.
    continuousToneScore: number;
    classification: 'flat' | 'continuous-tone';
};

// Same ITU-R BT.601 luminance weights used throughout this codebase
// (vectorizer.ts's luminance(), imageGradient.ts's LUM_R/G/B) - kept as a
// separate literal (rather than imported) so this module has zero
// dependency on paper.js/paper.Color, same reasoning as imageGradient.ts.
const LUM_R = 0.299;
const LUM_G = 0.587;
const LUM_B = 0.114;

// Quantization levels per RGB channel for the color-concentration
// histogram. 5 levels/channel (125 buckets) is coarse enough that
// anti-aliasing/JPEG noise around a flat region's edges still lands in the
// same bucket as the region's dominant color, fine enough to tell visually
// distinct colors apart.
const HISTOGRAM_LEVELS_PER_CHANNEL = 5;

// A histogram bucket counts as "dominant" once it holds at least this
// fraction of all opaque pixels - small enough that a legitimate minor
// palette color (e.g. a small logo accent) still counts, large enough that
// anti-aliasing-fringe noise scattered across many near-empty buckets
// doesn't inflate estimatedDistinctColors.
const DOMINANT_BUCKET_MIN_SHARE = 0.02;

// Targets roughly this many sample cells along the longer image axis for
// the flat/edge/midtone gradient scan - same order of magnitude as
// imageGradient.ts's own TARGET_SAMPLES_ALONG_LONG_AXIS, since this needs
// the same "coarse but representative" resolution, not per-pixel precision.
const TARGET_GRADIENT_SAMPLES_ALONG_LONG_AXIS = 100;

// Thresholds on a normalized-luminance ([0,1]) local gradient magnitude
// (the larger of the horizontal/vertical neighbor difference - a cheap
// stand-in for a full Sobel pass, adequate at this sampling coarseness).
// Calibrated so a smooth 0..255 ramp over a few hundred pixels (typical
// photographic tonal gradation) lands in the "midtone" band, while a sharp
// black/white boundary (typical vector-art edge) lands in "edge".
const FLAT_GRADIENT_THRESHOLD = 0.015;
const EDGE_GRADIENT_THRESHOLD = 0.12;

function buildLuminanceBuffer(imageData: ImageData): { luminance: Float32Array; opaqueFraction: number } {
    const { width, height, data } = imageData;
    const luminance = new Float32Array(width * height);
    let opaqueCount = 0;

    for (let i = 0, p = 0; i < luminance.length; i++, p += 4) {
        const a = data[p + 3];
        if (a === 0) {
            luminance[i] = 1; // transparent reads as paper-white, matching vectorizer.ts's convention
            continue;
        }
        opaqueCount++;
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        luminance[i] = (LUM_R * r + LUM_G * g + LUM_B * b) / 255;
    }

    return { luminance, opaqueFraction: width * height > 0 ? opaqueCount / (width * height) : 0 };
}

function computeColorConcentration(imageData: ImageData): { colorConcentration: number; estimatedDistinctColors: number } {
    const { data, width, height } = imageData;
    const bucketsPerAxis = HISTOGRAM_LEVELS_PER_CHANNEL;
    const counts = new Map<number, number>();
    let opaqueCount = 0;

    for (let i = 0, p = 0; i < width * height; i++, p += 4) {
        const a = data[p + 3];
        if (a === 0) continue;
        opaqueCount++;

        const r = Math.min(bucketsPerAxis - 1, Math.floor((data[p] / 256) * bucketsPerAxis));
        const g = Math.min(bucketsPerAxis - 1, Math.floor((data[p + 1] / 256) * bucketsPerAxis));
        const b = Math.min(bucketsPerAxis - 1, Math.floor((data[p + 2] / 256) * bucketsPerAxis));
        const bucket = (r * bucketsPerAxis + g) * bucketsPerAxis + b;

        counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }

    if (opaqueCount === 0) {
        return { colorConcentration: 1, estimatedDistinctColors: 0 };
    }

    const sortedCounts = Array.from(counts.values()).sort((a, b) => b - a);

    // Concentration: share of opaque pixels held by the top 8 buckets (an
    // arbitrary but generous ceiling on "a handful of dominant colors" -
    // flat art with, say, 3-6 fill colors is fully captured by this, while
    // a photo's broad spread across dozens/hundreds of buckets is not).
    const TOP_BUCKET_COUNT = 8;
    const topShare = sortedCounts.slice(0, TOP_BUCKET_COUNT).reduce((sum, c) => sum + c, 0) / opaqueCount;

    const estimatedDistinctColors = sortedCounts.filter(c => c / opaqueCount >= DOMINANT_BUCKET_MIN_SHARE).length;

    return { colorConcentration: topShare, estimatedDistinctColors: Math.max(1, estimatedDistinctColors) };
}

function computeGradientFractions(
    luminance: Float32Array,
    width: number,
    height: number,
): { flatFraction: number; edgeFraction: number; midToneFraction: number } {
    if (width < 2 || height < 2) {
        return { flatFraction: 1, edgeFraction: 0, midToneFraction: 0 };
    }

    const spacing = Math.max(1, Math.round(Math.max(width, height) / TARGET_GRADIENT_SAMPLES_ALONG_LONG_AXIS));

    let flat = 0, edge = 0, mid = 0, total = 0;

    for (let y = 0; y + spacing < height; y += spacing) {
        for (let x = 0; x + spacing < width; x += spacing) {
            const here = luminance[y * width + x];
            const right = luminance[y * width + (x + spacing)];
            const down = luminance[(y + spacing) * width + x];
            const magnitude = Math.max(Math.abs(right - here), Math.abs(down - here));

            total++;
            if (magnitude < FLAT_GRADIENT_THRESHOLD) {
                flat++;
            } else if (magnitude > EDGE_GRADIENT_THRESHOLD) {
                edge++;
            } else {
                mid++;
            }
        }
    }

    if (total === 0) {
        return { flatFraction: 1, edgeFraction: 0, midToneFraction: 0 };
    }

    return { flatFraction: flat / total, edgeFraction: edge / total, midToneFraction: mid / total };
}

// Blends midToneFraction (gradual shading - the strongest single tell for
// continuous tone, see midToneFraction's own doc comment) with
// (1 - colorConcentration) (spread-out color use). Weighted evenly: the two
// signals are complementary (one purely spatial/gradient-based, one purely
// color-histogram-based) and neither alone is fully reliable - e.g. a
// grayscale photo has near-zero color spread (it's all one hue) but very
// high midToneFraction, while a richly-colored but still flat vector
// illustration could have many distinct flat colors but essentially zero
// midtone. Combining both catches either case.
function computeContinuousToneScore(midToneFraction: number, colorConcentration: number): number {
    return 0.5 * midToneFraction + 0.5 * (1 - colorConcentration);
}

// Score below this is classified 'flat'; at/above is 'continuous-tone'.
// 0.35 sits comfortably below a smoothly-graded photo's typical score
// (usually 0.5+, since both signal components lean toward continuous-tone
// for real photographic content) and comfortably above a solid-fill
// vector/cartoon image's (usually well under 0.2, since both components
// lean toward flat) - see smartDefaults.test.ts's synthetic fixtures for
// the numbers this was checked against.
export const CONTINUOUS_TONE_CLASSIFICATION_THRESHOLD = 0.35;

export function analyzeImageCharacteristics(imageData: ImageData): ImageCharacteristics {
    const { width, height } = imageData;
    const { luminance, opaqueFraction } = buildLuminanceBuffer(imageData);
    const { colorConcentration, estimatedDistinctColors } = computeColorConcentration(imageData);
    const { flatFraction, edgeFraction, midToneFraction } = computeGradientFractions(luminance, width, height);

    const continuousToneScore = computeContinuousToneScore(midToneFraction, colorConcentration);
    const classification = continuousToneScore >= CONTINUOUS_TONE_CLASSIFICATION_THRESHOLD ? 'continuous-tone' : 'flat';

    return {
        widthPx: width,
        heightPx: height,
        opaqueFraction,
        colorConcentration,
        estimatedDistinctColors,
        flatFraction,
        edgeFraction,
        midToneFraction,
        continuousToneScore,
        classification,
    };
}
