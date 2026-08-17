// Smart defaults: given a source image's cheaply-computed characteristics
// (imageCharacteristics.ts), recommends sensible render settings so most
// images "just work" without the user needing to understand fill
// strategies, hatch density, or despeckle thresholds.
//
// Every recommendation carries a short, human-readable `rationale` string
// alongside its `value` - the UI branch is expected to surface these
// directly (e.g. as a tooltip/subtitle next to each defaulted control), not
// just apply the bare values silently.
import { InfillDensity } from './types';
import { FillStrategyName } from './fillStrategyNames';
import { ImageCharacteristics } from './imageCharacteristics';

export type Recommendation<T> = {
    value: T;
    rationale: string;
};

export type SmartDefaults = {
    colorCount: Recommendation<number>;
    fillStrategy: Recommendation<FillStrategyName>;
    infillDensity: Recommendation<InfillDensity>;
    turdSize: Recommendation<number>;
    hueGrouping: Recommendation<boolean>;
};

function recommend<T>(value: T, rationale: string): Recommendation<T> {
    return { value, rationale };
}

// --- colorCount -----------------------------------------------------
//
// Flat/vector-ish art: its own estimatedDistinctColors is a direct, honest
// count of how many pens a human would actually reach for - just clamp it
// into a sane pen-budget range. Continuous-tone/photographic content has no
// natural "true" color count (it's a gradient, not discrete regions), so a
// fixed richer range that scales with how continuous-tone the image reads
// gives k-means enough pens to approximate shading via hue-grouped
// hatching (huePalette.ts) without asking for more physical pens than a
// typical user owns.
const MIN_RECOMMENDED_COLORS = 2;
const MAX_RECOMMENDED_COLORS_FLAT = 6;
const MAX_RECOMMENDED_COLORS_PHOTO = 8;

function recommendColorCount(characteristics: ImageCharacteristics): Recommendation<number> {
    if (characteristics.classification === 'flat') {
        const value = Math.min(MAX_RECOMMENDED_COLORS_FLAT, Math.max(MIN_RECOMMENDED_COLORS, characteristics.estimatedDistinctColors));
        return recommend(
            value,
            `This looks like flat/vector-style art with about ${characteristics.estimatedDistinctColors} dominant color(s), so ${value} pen(s) should cover it without wasted colors.`,
        );
    }

    // Continuous-tone: scale from MIN up to MAX_..._PHOTO as
    // continuousToneScore rises from the classification threshold to 1, so
    // a borderline image gets a modest bump and a clearly photographic one
    // gets the full range for smoother tonal gradation.
    const value = Math.round(
        MIN_RECOMMENDED_COLORS + (MAX_RECOMMENDED_COLORS_PHOTO - MIN_RECOMMENDED_COLORS) * characteristics.continuousToneScore,
    );
    return recommend(
        value,
        `This looks like continuous-tone/photographic content, so ${value} pens gives k-means room to approximate the shading rather than flattening it to a couple of hard colors.`,
    );
}

// --- fillStrategy -----------------------------------------------------
//
// Flat art wants a clean, predictable, cheap fill - crossHatch45 is the
// well-tested default and reads well on solid regions. Continuous-tone
// content benefits from gradientHatch's engraving-style directional
// hatching (fillStrategies/gradientHatch.ts), which follows the image's
// own local tonal gradient instead of a fixed angle - but only once the
// image is confidently continuous-tone; a borderline image gets the safer,
// cheaper crossHatch45 rather than paying gradientHatch's much higher
// processing cost for a marginal visual gain (see processingEstimator.ts's
// per-strategy cost table).
const GRADIENT_HATCH_RECOMMENDATION_THRESHOLD = 0.55;

function recommendFillStrategy(characteristics: ImageCharacteristics): Recommendation<FillStrategyName> {
    if (characteristics.continuousToneScore >= GRADIENT_HATCH_RECOMMENDATION_THRESHOLD) {
        return recommend(
            'gradientHatch',
            'This looks strongly continuous-tone/photographic, so directional hatching that follows the image\'s own shading (gradientHatch) will read more naturally than a fixed-angle grid - though it costs more processing time.',
        );
    }

    return recommend(
        'crossHatch45',
        'This looks flat/vector-ish (or only mildly continuous-tone), so the standard cross-hatch fill is the cheapest choice that will look clean.',
    );
}

// --- infillDensity ------------------------------------------------------
//
// Flat art with a small number of solid colors reads fine at a moderate
// density (level 3) - there's no fine tonal gradation to preserve, so
// there's little benefit to a denser hatch. Continuous-tone content needs
// denser hatching (finer spacing) to have enough tonal resolution for
// shading to read smoothly, scaling up with how strongly continuous-tone
// the image is.
function recommendInfillDensity(characteristics: ImageCharacteristics): Recommendation<InfillDensity> {
    if (characteristics.classification === 'flat') {
        return recommend(3, 'A moderate hatch density suits flat art\'s solid fills without adding unnecessary plotting time.');
    }

    const value: InfillDensity = characteristics.continuousToneScore >= GRADIENT_HATCH_RECOMMENDATION_THRESHOLD ? 5 : 4;
    return recommend(
        value,
        'A denser hatch gives continuous-tone content enough tonal steps to render shading smoothly.',
    );
}

// --- turdSize (despeckle) ------------------------------------------------
//
// Potrace's turdSize (vectorizer.ts's createPathsFromColorMatrix) drops
// traced regions below this pixel-area threshold - useful for suppressing
// noise, harmful if it eats real fine detail. Flat art has clean, deliberate
// edges (edgeFraction is a real signal, not noise), so a small threshold is
// safe. Continuous-tone/photographic content - especially with visible
// texture/edge activity - is much more likely to trace a lot of true noise
// (JPEG artifacts, film grain, sensor noise) as tiny spurious regions, so a
// higher threshold scaled by edgeFraction cleans that up.
function recommendTurdSize(characteristics: ImageCharacteristics): Recommendation<number> {
    if (characteristics.classification === 'flat') {
        return recommend(2, 'Flat art has clean, deliberate edges, so a small despeckle threshold is enough to drop stray single-pixel noise without losing real detail.');
    }

    const value = Math.round(2 + characteristics.edgeFraction * 10);
    return recommend(
        value,
        'Continuous-tone/photographic sources often trace a lot of sensor/compression noise as tiny spurious regions, so a higher despeckle threshold cleans that up.',
    );
}

// --- hueGrouping ----------------------------------------------------------
//
// Hue-grouping (huePalette.ts) collapses several detected shades of one hue
// onto a single physical pen, drawn at different hatch densities. That's
// exactly what continuous-tone content needs (many close, related shades)
// and actively unhelpful for flat art, where each detected color is
// usually already meant to be visually distinct (collapsing them would
// merge colors the source image deliberately kept separate).
function recommendHueGrouping(characteristics: ImageCharacteristics): Recommendation<boolean> {
    if (characteristics.classification === 'flat') {
        return recommend(false, 'Flat art\'s colors are usually deliberately distinct, so grouping by hue would merge colors that should stay separate.');
    }

    return recommend(true, 'Continuous-tone content often has many close shades of the same hue - grouping them onto shared pens keeps the physical pen count reasonable while preserving shading.');
}

export function recommendDefaults(characteristics: ImageCharacteristics): SmartDefaults {
    return {
        colorCount: recommendColorCount(characteristics),
        fillStrategy: recommendFillStrategy(characteristics),
        infillDensity: recommendInfillDensity(characteristics),
        turdSize: recommendTurdSize(characteristics),
        hueGrouping: recommendHueGrouping(characteristics),
    };
}
