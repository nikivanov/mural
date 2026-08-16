import { loadPaper } from './paperLoader';
import {Potrace} from './tracer';
import { buildGrayscaleBitmap, computeGrayscaleThreshold } from './grayscale';
import { PaletteEntry } from './types';


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

function isBackgroundPixel(color: paper.Color): boolean {
    return color.alpha === 0 || color.equals(WHITE_COLOR);
}

// Nearest-palette-color quantization: every non-background pixel is assigned
// the index of the closest palette entry by colorDistance().
function quantizeToPalette(imageData: ImageData, palette: paper.Color[]): Int16Array {
    const pixelCount = imageData.width * imageData.height;
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

        let bestIndex = 0;
        let bestDistance = Infinity;
        for (let k = 0; k < palette.length; k++) {
            const distance = colorDistance(color, palette[k]);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = k;
            }
        }
        indices[i] = bestIndex;
    }
    return indices;
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

    for (let s = 0; s < samples.length; s++) {
        indices[samples[s].pixelIndex] = assignment[s];
    }

    const palette = centroids.map(c => new paper.Color(c.r, c.g, c.b));
    return { indices, palette };
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
        .sort((a, b) => luminance(a.color) - luminance(b.color));

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

