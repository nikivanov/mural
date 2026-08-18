import { loadPaper } from './paperLoader';
import {Potrace} from './tracer';
import { buildGrayscaleBitmap, computeGrayscaleThreshold } from './grayscale';
import { PaletteEntry } from './types';
import { chooseSampleSpacingPx, computeGradientField, serializeGradientField } from './imageGradient';


const paper = loadPaper();

const WHITE_COLOR = new paper.Color("#FFFFFF");

export function vectorizeImageData(imageData: ImageData, turdSize: number): string {
    const colorMatrix: paper.Color[][] = []

    for (let row = 0; row < imageData.height; row++) {
        for (let column = 0; column < imageData.width; column++) {
            if (!colorMatrix[row]) {
                colorMatrix[row] = [];
            }
            const address = (row * imageData.width + column) * 4;
            const r = imageData.data[address];
            const g = imageData.data[address + 1];
            const b = imageData.data[address + 2];
            const a = imageData.data[address + 3];
            const color = new paper.Color(r / 255, g / 255, b / 255, a / 255);
            colorMatrix[row][column] = color;
        }
    }

    return createPathsFromColorMatrix(colorMatrix, turdSize);
}


function createPathsFromColorMatrix(colorMatrix: paper.Color[][], turdSize: number): string {
    const width = colorMatrix[0].length;
    const height = colorMatrix.length;

    const data: (1|0)[] = [];
    for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
            let bmColor: (1|0) = 0;
            const currentColor = colorMatrix[row][column];
            
            if (currentColor.alpha > 0 && !currentColor.equals(WHITE_COLOR)) {
                bmColor = 1;
            }

            data.push(bmColor);
        }
    }

    const tracer = Potrace();
    tracer.setParameter({"turdsize": turdSize});
    tracer.setBitmap(width, height, data);

    const svgString: string = tracer.getSVG(1);

    return svgString;
}

// Squared distance in R/G/B, [0,1]-normalized channels (paper.Color's native
// range). Used both by the nearest-palette-color raster quantizer below and,
// per docs/multi-color.md section 1, is exactly the distance function such a
// quantizer needs - kept exported (it used to be a dead leftover helper) so
// it isn't duplicated elsewhere.
export function colorDistance(color1: paper.Color, color2: paper.Color) {
    return (color2.red - color1.red) ** 2 + (color2.green - color1.green) ** 2 + (color2.blue - color1.blue) ** 2;
}

function luminance(color: paper.Color): number {
    return 0.299 * color.red + 0.587 * color.green + 0.114 * color.blue;
}

function colorToHex(color: paper.Color): string {
    return color.toCSS(true);
}

// -1 is the "background" sentinel: fully transparent or pure-white pixels,
// same convention as createPathsFromColorMatrix's single-mask bmColor test
// above - never assigned to any palette entry, so they never appear in any
// mask.
const BACKGROUND_INDEX = -1;

// Shared confident-pixel/confident-cluster threshold: derived from how far
// apart a set of reference colors actually are, not a fixed RGB constant,
// so it adapts to both high-contrast (e.g. black/amber) and low-contrast
// palettes. If any two reference colors were closer together than 2x the
// confident radius, their confident regions could overlap; using 1/8 of the
// minimum pairwise squared distance keeps the confident radius
// (sqrt(threshold)) well under half of the minimum pairwise distance (the
// mathematical limit, at 1/4, for zero overlap), leaving a margin for
// anti-aliasing blends that land close to, but not exactly on, the segment
// between two colors. This fraction was checked against the measured
// prototype threshold that fully cleared the W3C SVG logo fixture's halo.
//
// Used both to resolve anti-aliased edge fringe per-pixel
// (classifyWithFringeResolution, where `colors` is the palette plus
// WHITE_COLOR standing in for background) and, with the same formula, to
// decide whether a k-means cluster is actually describing the paper
// background rather than real ink (kMeansQuantize below) - there is no
// safe fixed-color test for "is this pixel background" that works for both
// a gradient backdrop and JPEG compression noise without also catching
// genuinely pale ink colors, so background is treated as just another
// distance-based candidate everywhere, exactly like a palette entry.
function computeConfidentThreshold(colors: paper.Color[]): number {
    let minPairwiseDistSq = Infinity;
    for (let i = 0; i < colors.length; i++) {
        for (let j = i + 1; j < colors.length; j++) {
            const d = colorDistance(colors[i], colors[j]);
            if (d < minPairwiseDistSq) minPairwiseDistSq = d;
        }
    }
    return isFinite(minPairwiseDistSq) ? minPairwiseDistSq / 8 : 0;
}

// Background tolerance used only to pre-filter which pixels feed
// kMeansQuantize's centroid fitting (see below) - at that point no real
// palette exists yet (that's what's being computed), so
// computeConfidentThreshold has nothing to work from.
//
// This is deliberately NOT derived as a fraction of palette separation
// (e.g. of colorDistance(WHITE, BLACK)): palette separation measures how
// far apart two *colors* are, which has nothing to do with how far a pixel
// can drift from white and still plausibly be paper. White-to-black is the
// maximum possible separation between any two colors, so even a small
// fraction of it (1/8, tried first) is a huge absolute distance - a radius
// of ~156 RGB units around white, 61% of the way across the whole color
// space. Measured against a real multi-color cartoon fixture, that
// swallowed real ink as background: a cream character fill (#fcf8d7, dist
// 0.0255), a pale blue (#d6ebf5, dist 0.0335), even a solid mid-tone blue
// (#89b6d6, dist 0.3219) all fell under that threshold and were dropped
// from the k-means sample set entirely - so clustering fit its centroids
// on only the dark saturated remnant, and the returned palette came back
// muddy with the pale regions left as bare paper.
//
// What "background" actually needs is a small, fixed neighborhood around
// paper white: JPEG compression noise and a gradient backdrop, nothing
// more. Measured against the same fixture, the true backdrop (#f7fbfc)
// sits at distance 0.0014, while the closest real ink color (the cream
// fill) sits at 0.0255 - a ~20x gap. 0.003 sits in between with margin on
// both sides (>2x above the backdrop, >8x below the nearest ink), so it
// isn't a delicate choice, and comfortably covers antialiasing/compression
// noise (a handful of RGB units of drift) without reaching real content.
const BACKGROUND_TOLERANCE = 0.003;

function isBackgroundPixel(color: paper.Color): boolean {
    return color.alpha === 0 || colorDistance(color, WHITE_COLOR) < BACKGROUND_TOLERANCE;
}

export type FringeClassification = {
    indices: Int16Array,
    // Fraction of opaque pixels that weren't confidently close to any
    // palette/background entry on the first pass. Exposed for diagnostics
    // and tests, not consumed by callers.
    fringeFraction: number,
    // True when the fringe-growth pass was skipped entirely because too
    // much of the raster was ambiguous on the first pass (see
    // MAX_FRINGE_FRACTION) - in that case every non-confident pixel simply
    // keeps its plain-nearest-color label, identical to pre-fix behavior.
    bypassed: boolean,
};

// Growth is capped at this many passes. A real anti-aliased edge is 1-2px
// wide (measured up to ~4px at 2x render scale on the W3C SVG logo
// fixture), so a handful of passes clears it completely. A pixel still
// unresolved after this many passes is not part of a thin edge fringe (more
// likely deep inside a large ambiguous region on a continuous-tone/photo
// image) and is left on its plain-nearest-color fallback rather than
// spreading a label across an unbounded amount of raster.
const MAX_GROWTH_ITERATIONS = 8;

// If more than this fraction of opaque pixels are ambiguous on the first
// pass, growth is skipped entirely and every pixel falls back to plain
// nearest-color classification (the pre-fix behavior). Measured real-world
// anti-aliased flat artwork (the W3C SVG logo fixture, 2 colors) left ~10%
// of the raster ambiguous; this cutoff gives a wide margin above that
// while still catching continuous-tone/photographic input. There, a sparse
// palette leaves a large fraction of pixels far from every entry as a
// matter of course (smooth tonal variation, not edge artefacts) - growing
// labels across that much of the image would be slow (an unbounded queue
// each pass) and would give a spatially arbitrary result (whichever
// confident island the flood reaches first) rather than a nearest-color
// one.
const MAX_FRINGE_FRACTION = 0.35;

// Classifies every pixel of `imageData` against `paletteColors` (plus an
// implicit background/paper entry), resolving anti-aliased edge fringe
// locally instead of by global nearest-color distance.
//
// Rasterizing an SVG (or any vector source) always anti-aliases hard edges,
// leaving a 1-2px fringe of pixels that are a genuine RGB blend of the two
// colors on either side of the edge. Quantizing those blended pixels by
// nearest palette color is unsound: a mid-grey blend of black and white can
// be nearer (by any global color metric) to an unrelated third palette
// color - e.g. a warm amber - than it is to either endpoint of the blend,
// because neither endpoint IS amber. The result is thin ribbons of the
// wrong color traced along every edge in the image.
//
// The fix: label only pixels that are confidently close to a real
// palette/background color, leave everything else explicitly unresolved
// ("fringe"), then grow the confident labels into the fringe by iterated
// 8-neighbor majority vote - each fringe pixel ends up taking the label of
// whichever real region it actually borders, rather than the globally
// nearest (but locally wrong) palette color.
//
// "Confident" is deliberately about *closeness to a real color*, not about
// how much closer the nearest candidate is than the second-nearest: an
// anti-aliased blend pixel can be closer to the wrong color by a wide
// margin (as in the amber example above), so a top-2-ambiguity test
// wouldn't catch it. Anything not genuinely close to some real reference
// color falls back to its plain nearest-color label - which is also what
// keeps continuous-tone/photo input sane and fast (see MAX_FRINGE_FRACTION
// above): those pixels are far from every sparse palette entry as a matter
// of course, not because they're edge artefacts, so they should just take
// their nearest color rather than being queued for growth.
export function classifyWithFringeResolution(imageData: ImageData, paletteColors: paper.Color[]): FringeClassification {
    const width = imageData.width;
    const height = imageData.height;
    const pixelCount = width * height;
    const data = imageData.data;
    const paletteLength = paletteColors.length;

    const indices = new Int16Array(pixelCount);

    if (paletteLength === 0) {
        // No real palette colors (e.g. k-means found zero non-background
        // samples): nothing to be confidently near, so every opaque pixel
        // falls back to background.
        indices.fill(BACKGROUND_INDEX);
        return { indices, fringeFraction: 0, bypassed: true };
    }

    // Reference colors used for the confident/fringe test: every palette
    // entry plus WHITE_COLOR standing in for paper/background. Extended
    // index `paletteLength` (the last entry) means background. See
    // computeConfidentThreshold's doc comment for why background is folded
    // in here as just another candidate rather than tested separately.
    const extended = paletteColors.concat([WHITE_COLOR]);
    const CONFIDENT_THRESHOLD = computeConfidentThreshold(extended);

    // confident[i] === 1 means indices[i] is a trustworthy label (either
    // confidently classified on the first pass, or resolved by growth) that
    // neighboring fringe pixels can vote on. It starts as the first pass's
    // confident/fringe split and gets filled in as growth resolves pixels.
    const confident = new Uint8Array(pixelCount);

    let opaqueCount = 0;
    let fringeCount = 0;
    const fringeQueueInit: number[] = [];

    for (let i = 0; i < pixelCount; i++) {
        const address = i * 4;
        const a = data[address + 3];
        if (a === 0) {
            indices[i] = BACKGROUND_INDEX;
            confident[i] = 1;
            continue;
        }
        opaqueCount++;
        const r = data[address] / 255;
        const g = data[address + 1] / 255;
        const b = data[address + 2] / 255;

        let bestExtIndex = 0;
        let bestDist = Infinity;
        for (let k = 0; k < extended.length; k++) {
            const c = extended[k];
            const dr = r - c.red, dg = g - c.green, db = b - c.blue;
            const dist = dr * dr + dg * dg + db * db;
            if (dist < bestDist) {
                bestDist = dist;
                bestExtIndex = k;
            }
        }
        // Plain-nearest-color label, used unconditionally as the fallback
        // default and overwritten below only if growth resolves this pixel
        // to something else.
        indices[i] = bestExtIndex === paletteLength ? BACKGROUND_INDEX : bestExtIndex;

        if (bestDist < CONFIDENT_THRESHOLD) {
            confident[i] = 1;
        } else {
            fringeQueueInit.push(i);
            fringeCount++;
        }
    }

    const fringeFraction = opaqueCount > 0 ? fringeCount / opaqueCount : 0;

    if (fringeCount === 0 || fringeFraction > MAX_FRINGE_FRACTION) {
        // Either nothing to grow, or too much of the raster is ambiguous to
        // trust spatial growth (continuous-tone/photo input) - every pixel
        // already has its plain-nearest-color label from the pass above.
        return { indices, fringeFraction, bypassed: fringeFraction > MAX_FRINGE_FRACTION };
    }

    // Grow confident/resolved labels into the fringe: each pass, every
    // still-unresolved pixel takes the majority label among its 8
    // already-resolved neighbors (confident on the first pass, or resolved
    // by an earlier pass this loop); ties break toward whichever label is
    // scanned first (background, then palette index 0, 1, 2, ...) -
    // deterministic but otherwise arbitrary. Pixels with no resolved
    // neighbor yet stay queued for the next pass. Using an explicit work
    // queue (rather than rescanning the whole raster each pass) keeps every
    // pass proportional to the remaining fringe, not the image size.
    const counts = new Int32Array(paletteLength + 1); // slot 0 = background, slot k+1 = palette index k
    let queue = Int32Array.from(fringeQueueInit);

    for (let iteration = 0; iteration < MAX_GROWTH_ITERATIONS && queue.length > 0; iteration++) {
        const next: number[] = [];
        for (let qi = 0; qi < queue.length; qi++) {
            const idx = queue[qi];
            const y = (idx / width) | 0;
            const x = idx - y * width;
            counts.fill(0);
            let any = false;
            for (let dy = -1; dy <= 1; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= height) continue;
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    if (nx < 0 || nx >= width) continue;
                    const nIdx = ny * width + nx;
                    if (!confident[nIdx]) continue;
                    const neighborLabel = indices[nIdx];
                    const slot = neighborLabel === BACKGROUND_INDEX ? 0 : neighborLabel + 1;
                    counts[slot]++;
                    any = true;
                }
            }
            if (!any) {
                next.push(idx);
                continue;
            }
            let bestSlot = 0, bestCount = -1;
            for (let s = 0; s < counts.length; s++) {
                if (counts[s] > bestCount) {
                    bestCount = counts[s];
                    bestSlot = s;
                }
            }
            indices[idx] = bestSlot === 0 ? BACKGROUND_INDEX : bestSlot - 1;
            confident[idx] = 1; // resolved: later pixels in this or later passes can vote on it
        }
        queue = Int32Array.from(next);
    }

    // Anything still queued after the iteration cap (deep inside a large
    // ambiguous region rather than a thin edge fringe) simply keeps its
    // plain-nearest-color label already sitting in `indices` from the first
    // pass - nothing more to do.

    return { indices, fringeFraction, bypassed: false };
}

// Nearest-palette-color quantization: every non-background pixel is
// assigned the index of the closest palette entry, with anti-aliased edge
// fringe resolved locally instead of by global nearest-color distance - see
// classifyWithFringeResolution.
function quantizeToPalette(imageData: ImageData, palette: paper.Color[]): Int16Array {
    return classifyWithFringeResolution(imageData, palette).indices;
}

const K_MEANS_MAX_ITERATIONS = 10;

// K-means clustering over the image's non-background pixel colors, with no
// fixed palette (docs/multi-color.md section 1's second quantization
// strategy). Centroids are seeded deterministically (evenly spaced through
// the sampled pixel list) rather than randomly, so a given source image
// quantizes the same way every run. Returns the per-pixel cluster
// assignment plus the resulting centroid colors as an auto-named palette.
function kMeansQuantize(imageData: ImageData, k: number): { indices: Int16Array, palette: paper.Color[] } {
    const pixelCount = imageData.width * imageData.height;
    const samples: { r: number, g: number, b: number, pixelIndex: number }[] = [];
    const indices = new Int16Array(pixelCount);

    for (let i = 0; i < pixelCount; i++) {
        const address = i * 4;
        const r = imageData.data[address];
        const g = imageData.data[address + 1];
        const b = imageData.data[address + 2];
        const a = imageData.data[address + 3];
        const color = new paper.Color(r / 255, g / 255, b / 255, a / 255);
        if (isBackgroundPixel(color)) {
            indices[i] = BACKGROUND_INDEX;
            continue;
        }
        samples.push({ r: color.red, g: color.green, b: color.blue, pixelIndex: i });
    }

    if (samples.length === 0) {
        return { indices, palette: [] };
    }

    const clusterCount = Math.max(1, Math.min(k, samples.length));
    const centroids: { r: number, g: number, b: number }[] = [];
    for (let c = 0; c < clusterCount; c++) {
        const sampleIndex = Math.floor((c + 0.5) * samples.length / clusterCount);
        const s = samples[Math.min(sampleIndex, samples.length - 1)];
        centroids.push({ r: s.r, g: s.g, b: s.b });
    }

    const assignment = new Int16Array(samples.length);

    for (let iteration = 0; iteration < K_MEANS_MAX_ITERATIONS; iteration++) {
        let changed = false;

        for (let s = 0; s < samples.length; s++) {
            const sample = samples[s];
            let bestCluster = 0;
            let bestDistance = Infinity;
            for (let c = 0; c < centroids.length; c++) {
                const centroid = centroids[c];
                const dr = sample.r - centroid.r;
                const dg = sample.g - centroid.g;
                const db = sample.b - centroid.b;
                const distance = dr * dr + dg * dg + db * db;
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestCluster = c;
                }
            }
            if (assignment[s] !== bestCluster) {
                assignment[s] = bestCluster;
                changed = true;
            }
        }

        const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
        for (let s = 0; s < samples.length; s++) {
            const sum = sums[assignment[s]];
            sum.r += samples[s].r;
            sum.g += samples[s].g;
            sum.b += samples[s].b;
            sum.count++;
        }
        for (let c = 0; c < centroids.length; c++) {
            if (sums[c].count > 0) {
                centroids[c] = {
                    r: sums[c].r / sums[c].count,
                    g: sums[c].g / sums[c].count,
                    b: sums[c].b / sums[c].count,
                };
            }
        }

        if (!changed) {
            break;
        }
    }

    const palette = centroids.map(c => new paper.Color(c.r, c.g, c.b));

    // `assignment` above was only used to converge the centroids; the final
    // per-pixel labels that actually get traced are produced by
    // classifying every pixel against those centroids with fringe
    // resolution, same as quantizeToPalette - anti-aliased edge pixels
    // between two k-means clusters are exactly as vulnerable to being
    // quantized as a wrong, unrelated centroid as they are against a fixed
    // supplied palette (see classifyWithFringeResolution's doc comment).
    const finalIndices = classifyWithFringeResolution(imageData, palette).indices;

    return { indices: finalIndices, palette };
}

export type ColorSeparationResult = {
    svg: string,
    // Resolved palette, in the same light-to-dark order the layers/masks
    // were traced and combined in (see combineColorMasks below).
    palette: { name: string, color: string }[],
}

// Quantizes `imageData` into `colorCount` non-nested masks (fixed-palette
// nearest-match if `suppliedPalette` is given, k-means otherwise - see
// docs/multi-color.md section 1) and traces each independently with Potrace,
// same as the single-mask path above. Unlike grayscale levels, color masks
// partition the image rather than nest, so no containment reconstruction is
// needed: each mask is traced on its own. Masks/palette entries are ordered
// light-to-dark (docs/multi-color.md section 5) so the caller can emit
// layers in that order directly.
export function vectorizeImageDataColor(imageData: ImageData, turdSize: number, colorCount: number, suppliedPalette?: PaletteEntry[]): ColorSeparationResult {
    const width = imageData.width;
    const height = imageData.height;

    let indices: Int16Array;
    let paletteColors: paper.Color[];
    let paletteNames: string[] | undefined;

    if (suppliedPalette && suppliedPalette.length > 0) {
        paletteColors = suppliedPalette.map(p => new paper.Color(p.color));
        paletteNames = suppliedPalette.map(p => p.name);
        indices = quantizeToPalette(imageData, paletteColors);
    } else {
        const result = kMeansQuantize(imageData, colorCount);
        paletteColors = result.palette;
        indices = result.indices;
    }

    // Order light -> dark (docs/multi-color.md section 5), remapping indices
    // to match.
    const order = paletteColors
        .map((color, originalIndex) => ({ color, originalIndex }))
        .sort((a, b) => luminance(b.color) - luminance(a.color));

    const remap = new Map<number, number>();
    order.forEach((entry, newIndex) => remap.set(entry.originalIndex, newIndex));

    const orderedPalette: { name: string, color: string }[] = order.map((entry, newIndex) => ({
        name: paletteNames ? paletteNames[entry.originalIndex] : `Color ${newIndex + 1}`,
        color: colorToHex(entry.color),
    }));

    const groups = orderedPalette.map((paletteEntry, newIndex) => {
        const data: (1 | 0)[] = new Array(width * height);
        for (let i = 0; i < indices.length; i++) {
            const originalIndex = indices[i];
            const mappedIndex = originalIndex === BACKGROUND_INDEX ? BACKGROUND_INDEX : remap.get(originalIndex);
            data[i] = mappedIndex === newIndex ? 1 : 0;
        }

        const svg = traceBitmap(width, height, data as (1 | 0)[], turdSize);
        const pathMatch = svg.match(/<path[^>]*\/>/);
        if (!pathMatch) {
            throw new Error("Unexpected tracer SVG output");
        }
        const tagData = JSON.stringify({ colorIndex: newIndex });
        return `<g data-paper-data='${tagData}'>${pathMatch[0]}</g>`;
    }).join('');

    const svg = `<svg id="svg" version="1.1" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${groups}</svg>`;

    return { svg, palette: orderedPalette };
}

export type GrayscaleLevelResult = {
    // 1-indexed; higher levels are darker and nest inside lighter (lower)
    // levels, i.e. level L's bitmap is a subset of level (L-1)'s bitmap.
    level: number,
    svg: string,
}

// Traces `levels` nested bitmaps of `imageData`, one per luminance band. Level
// 1's bitmap includes every non-transparent pixel at or darker than a light
// threshold; each subsequent level uses a darker threshold, so its bitmap is
// a subset of the previous level's. Used for tonal/grayscale rendering, where
// each level is later given its own infill density. Fully independent of
// vectorizeImageData/createPathsFromColorMatrix above, which remain untouched
// so the default 1-bit path stays byte-identical.
export function vectorizeImageDataGrayscale(imageData: ImageData, turdSize: number, levels: number): GrayscaleLevelResult[] {
    const results: GrayscaleLevelResult[] = [];
    for (let level = 1; level <= levels; level++) {
        const threshold = computeGrayscaleThreshold(level, levels);
        const data = buildGrayscaleBitmap(imageData, threshold);
        const svg = traceBitmap(imageData.width, imageData.height, data, turdSize);
        results.push({ level, svg });
    }

    return results;
}

function traceBitmap(width: number, height: number, data: (1|0)[], turdSize: number): string {
    const tracer = Potrace();
    tracer.setParameter({"turdsize": turdSize});
    tracer.setBitmap(width, height, data);

    return tracer.getSVG(1);
}

// Computes a local-gradient field from `imageData`'s luminance (see
// imageGradient.ts) and tags the root `<svg>` element of `svgString` with it
// via a `data-paper-data` attribute - the same generic mechanism already
// used elsewhere in this file to carry `density`/`outline`/`colorIndex`
// tags on `<g>` elements through paper.js's SVG import (see
// classifyWithFringeResolution's callers and combineGrayscaleLevels in
// main.ts). Any element's `data-paper-data` is parsed into that item's
// `.data` on import - the root `<svg>` tag works exactly the same way a
// `<g>` does.
//
// This makes the field available, once per vectorize() call, to
// generateInfills (infill.ts) later on: the imported root item stays
// mounted in the paper.js project tree across the whole render, so
// infill.ts can find this tag by walking `paper.project` without needing
// the raster (or this SVG's root item) threaded through any function
// signature - `generatePaths` (generator.ts) only ever propagates the
// existing density/outline/colorIndex/spacingMm tags down onto individual
// paths, so putting this on the root instead of on (or under) a path is
// what keeps it intact and keeps it a single copy rather than duplicated
// onto every traced path.
//
// Every raster-origin vectorize() output (single-mask, grayscale, and
// color/k-means) is expected to route through this before being posted
// back to the client - see main.ts. Vector-origin SVGs (path-tracing mode,
// which never calls vectorize() at all) never get this tag, which is
// exactly the "no gradient data available" signal gradientHatch falls back
// on.
export function withGradientField(svgString: string, imageData: ImageData): string {
    const field = computeGradientField(imageData, chooseSampleSpacingPx(imageData.width, imageData.height));
    const serialized = serializeGradientField(field);
    const tagData = JSON.stringify({ gradientField: serialized });
    const tagged = svgString.replace(/^(<svg\b[^>]*)>/, `$1 data-paper-data='${tagData}'>`);
    if (tagged === svgString) {
        // Defensive: if the tracer's output shape ever changes and the
        // regex stops matching, fail soft (return the untagged SVG) rather
        // than throw - a missing gradient field just means gradientHatch
        // falls back to a fixed angle, which is a fully supported path,
        // not a broken render.
        return svgString;
    }
    return tagged;
}

