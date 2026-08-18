// Shared helpers for tsc/bench/runBenchmarks.ts - see that file's header for
// how to run the harness and what it's for. Split out purely so
// runBenchmarks.ts (the thing you actually read to understand the matrix)
// isn't buried under plumbing.
//
// IMPORTANT: this file `require`s the real `paper` package (via
// paperLoader.ts's server branch, `process.env.server = '1'` set below),
// which only works when the native `canvas` addon has a compiled binary -
// i.e. after a plain `npm install` (NOT --ignore-scripts). See
// test/pipeline.test.ts's header comment for the same caveat.
process.env.server = '1';

import * as fs from 'fs';
import * as path from 'path';

import { generatePaths } from '../src/generator';
import { simplifyPaths } from '../src/simplifier';
import { flattenPaths, flattenPathsAcrossLayers } from '../src/flattener';
import { generateInfills } from '../src/infill';
import { optimizePaths } from '../src/optimizer';
import { renderPathsToCommands } from '../src/renderer';
import { trimCommands } from '../src/trimmer';
import { dedupeCommands } from '../src/deduplicator';
import { measureDistance } from '../src/measurer';
import { renderSvgJsonToCommands } from '../src/toCommands';
import {
    vectorizeImageData,
    vectorizeImageDataColor,
    vectorizeImageDataGrayscale,
} from '../src/vectorizer';
import { applyHueGrouping } from '../src/huePalette';
import { RequestTypes, InfillDensity, PaletteEntry } from '../src/types';

// huePalette.ts's RawColorResult type isn't exported - it's just
// { svg, palette }, structurally reproduced here rather than exporting it
// from production code purely for a benchmark script's benefit.
type RawColorResult = { svg: string; palette: PaletteEntry[] };

// eslint-disable-next-line @typescript-eslint/no-var-requires
const paper = require('paper') as typeof import('paper');

// --- Timing ---------------------------------------------------------------

// process.hrtime.bigint() gives nanosecond resolution (vs Date.now()'s
// ~1ms), which matters here because several individual stages (e.g. a
// single flattenPaths() call on a handful of shapes) complete in well under
// a millisecond - Date.now() would just report 0 or 1 for those and wreck
// the regression fit.
export function nowMs(): number {
    return Number(process.hrtime.bigint()) / 1e6;
}

export function timeMs<T>(fn: () => T): { result: T; ms: number } {
    const start = nowMs();
    const result = fn();
    const ms = nowMs() - start;
    return { result, ms };
}

export async function timeMsAsync<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
    const start = nowMs();
    const result = await fn();
    const ms = nowMs() - start;
    return { result, ms };
}

// --- Loading real images/SVGs ----------------------------------------------

export function readSvgFile(filePath: string): string {
    return fs.readFileSync(filePath, 'utf8');
}

// Loads a raster file (PNG/JPG) via the `canvas` package and returns plain
// ImageData, optionally downscaled so the widest test cases stay tractable -
// mirrors src/tester.ts's getImageData, minus the SVG-specific parts.
export function loadRasterImageData(filePath: string, maxDimensionPx?: number): ImageData {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadImageSync, createCanvasSync } = requireCanvasSync();
    const image = loadImageSync(filePath);

    let { width, height } = image;
    if (maxDimensionPx && Math.max(width, height) > maxDimensionPx) {
        const scale = maxDimensionPx / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
    }

    const canvas = createCanvasSync(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return { ...imageData, colorSpace: 'srgb', width, height } as ImageData;
}

// `canvas`'s loadImage is async (it's a Promise-based decode); every caller
// in this harness is already inside an async main(), so this small wrapper
// just keeps loadRasterImageData's own signature synchronous-looking at the
// call site isn't worth it - use loadRasterImageDataAsync directly instead.
// Kept only to centralize the lazy require() of `canvas` (a native module
// that isn't always built - see the project's --ignore-scripts install
// note) in one place.
function requireCanvasSync() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const canvasModule = require('canvas');
    return {
        loadImageSync: canvasModule.loadImage,
        createCanvasSync: canvasModule.createCanvas,
    };
}

export async function loadRasterImageDataAsync(filePath: string, maxDimensionPx?: number): Promise<ImageData> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadImage, createCanvas } = require('canvas');
    const image = await loadImage(filePath);

    let width: number = image.width;
    let height: number = image.height;
    if (maxDimensionPx && Math.max(width, height) > maxDimensionPx) {
        const scale = maxDimensionPx / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
    }

    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    return { ...imageData, colorSpace: 'srgb', width, height } as ImageData;
}

// Converts a raw SVG string into the svgJson + svgWidth/svgHeight a
// RenderSVGRequest needs, using a throwaway paper.js project scope - mirrors
// test/pipeline.test.ts's svgToRequest and src/tester.ts's convertSvgToSvgJson.
export function svgStringToSvgJson(svgString: string): { svgJson: string; svgWidth: number; svgHeight: number } {
    const probeSize = new paper.Size(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    paper.setup(probeSize);
    const svg = paper.project.importSVG(svgString, { expandShapes: true, applyMatrix: true });
    const svgJson = svg.exportJSON() as string;
    const svgWidth = svg.bounds.width || 1;
    const svgHeight = svg.bounds.height || 1;
    paper.project.remove();
    return { svgJson, svgWidth, svgHeight };
}

export function buildRenderRequest(
    svgJson: string,
    svgWidth: number,
    svgHeight: number,
    widthMm: number,
    overrides: Partial<RequestTypes.RenderSVGRequest> = {},
): RequestTypes.RenderSVGRequest {
    const height = Math.max(1, Math.round(svgHeight * (widthMm / svgWidth)));
    return {
        type: 'renderSvg',
        svgJson,
        width: widthMm,
        height,
        svgWidth,
        svgHeight,
        homeX: 0,
        homeY: 0,
        infillDensity: 3,
        flattenPaths: false,
        topDistance: Math.round(widthMm / 0.6),
        ...overrides,
    };
}

// --- Isolated-stage helpers -------------------------------------------------
//
// Re-does the first few lines of toCommands.ts's renderSvgJsonToCommands
// (paper.setup + importJSON + scale) so the harness can grab the raw traced
// paper.PathItem[] and time generatePaths/simplifyPaths/flattenPaths/
// generateInfills/optimizePaths/renderPathsToCommands individually, instead
// of only ever measuring the whole pipeline as one lump. Intentionally
// duplicates a few lines of toCommands.ts rather than modifying that file to
// expose seams - this is throwaway benchmarking code, not something the
// production pipeline should be reshaped around.
export function tracePathsForRequest(request: RequestTypes.RenderSVGRequest): { paths: paper.PathItem[]; generatePathsMs: number } {
    paper.setup({ width: request.width, height: request.height });
    const svg = paper.project.importJSON(request.svgJson);
    const projectToViewRatio = request.width / request.svgWidth;
    svg.scale(projectToViewRatio, { x: 0, y: 0 });
    svg.applyMatrix = true;

    const start = nowMs();
    const paths = generatePaths(svg);
    paths.forEach(p => p.flatten(0.5));
    const generatePathsMs = nowMs() - start;

    return { paths, generatePathsMs };
}

const noopStatus = () => {};

export type StageTimingsMs = {
    generatePaths: number;
    rdpSimplify: number;
    flatten: number;
    infill: number;
    optimize: number;
    render: number; // renderPathsToCommands + trimCommands
    dedupe: number; // dedupeCommands
    measure: number; // measureDistance
};

// Runs generateInfills -> optimizePaths -> renderPathsToCommands ->
// trimCommands -> dedupeCommands -> measureDistance on an already-traced
// (and already-simplified) path list, exactly mirroring toCommands.ts's
// single-color branch, with a precise timer around each stage. `paths` is
// consumed (flattenPaths/generateInfills mutate paper.js state) - callers
// must re-trace for each run rather than reusing a path list across calls.
export function runSingleColorStages(
    paths: paper.PathItem[],
    infillDensity: InfillDensity,
    fillMethod: string | undefined,
    flattenPathsEnabled: boolean,
    width: number,
    height: number,
): { stages: StageTimingsMs; commandCount: number; shapeCount: number; infillSegmentCount: number; totalDrawSegments: number; distanceMm: number } {
    const stages: Partial<StageTimingsMs> = {};

    let pathsToRender = paths;
    stages.flatten = 0;
    if (flattenPathsEnabled) {
        const t = timeMs(() => flattenPaths(pathsToRender, noopStatus));
        stages.flatten = t.ms;
    }

    const shapeCount = pathsToRender.length;

    const infillResult = timeMs(() => generateInfills(pathsToRender, infillDensity, fillMethod));
    stages.infill = infillResult.ms;
    // Real infill segment count (one per InfilledPath.infillPaths entry) -
    // fitting INFILL_US_PER_SEGMENT_AT_BASE_SPACING against this (rather
    // than against final command count, which also folds in outline draws
    // and render/dedupe overhead) is what the estimator's own formula
    // actually models.
    const infillSegmentCount = infillResult.result.reduce((sum, p) => sum + p.infillPaths.length, 0);

    const optimizeResult = timeMs(() => optimizePaths(infillResult.result, 0, 0));
    stages.optimize = optimizeResult.ms;

    const renderResult = timeMs(() => {
        const commands = renderPathsToCommands(optimizeResult.result, width, height);
        commands.push('p0');
        return trimCommands(commands);
    });
    stages.render = renderResult.ms;

    const dedupeResult = timeMs(() => dedupeCommands(renderResult.result));
    stages.dedupe = dedupeResult.ms;

    const measureResult = timeMs(() => measureDistance(dedupeResult.result));
    stages.measure = measureResult.ms;

    return {
        stages: {
            generatePaths: 0, // filled in by the caller from tracePathsForRequest
            rdpSimplify: 0, // filled in by the caller
            flatten: stages.flatten!,
            infill: stages.infill!,
            optimize: stages.optimize!,
            render: stages.render!,
            dedupe: stages.dedupe!,
            measure: stages.measure!,
        },
        commandCount: dedupeResult.result.length,
        shapeCount,
        infillSegmentCount,
        totalDrawSegments: optimizeResult.result.length,
        distanceMm: measureResult.result.totalDistance,
    };
}

export function timeRdpSimplify(paths: paper.PathItem[], toleranceMm = 0.1): number {
    return timeMs(() => simplifyPaths(paths, toleranceMm)).ms;
}

export function timeFlattenPathsAcrossLayers(
    layersLightToDark: paper.PathItem[][],
    gapMm: number,
): number {
    return timeMs(() => flattenPathsAcrossLayers(layersLightToDark, noopStatus, gapMm)).ms;
}

// --- End-to-end (full production entry point) -------------------------------

export async function timeFullRender(request: RequestTypes.RenderSVGRequest) {
    return timeMsAsync(() => renderSvgJsonToCommands(request, noopStatus));
}

// --- Vectorize-stage helpers -------------------------------------------------

export function timeVectorizeSingle(imageData: ImageData, turdSize = 2): { ms: number; pixels: number } {
    const t = timeMs(() => vectorizeImageData(imageData, turdSize));
    return { ms: t.ms, pixels: imageData.width * imageData.height };
}

export function timeVectorizeGrayscale(imageData: ImageData, levels: number, turdSize = 2): { ms: number; pixels: number } {
    const t = timeMs(() => vectorizeImageDataGrayscale(imageData, turdSize, levels));
    return { ms: t.ms, pixels: imageData.width * imageData.height };
}

export function timeVectorizeColor(imageData: ImageData, colorCount: number, turdSize = 2): { ms: number; pixels: number } {
    const t = timeMs(() => vectorizeImageDataColor(imageData, turdSize, colorCount));
    return { ms: t.ms, pixels: imageData.width * imageData.height };
}

// --- Hue-grouping-stage helper -----------------------------------------------

// Synthesizes a plausible RawColorResult (real palette hex values, a
// minimal-but-representative SVG body with one <g> per color, matching
// vectorizeImageDataColor's own output shape) so applyHueGrouping can be
// timed without needing a real traced image - hue grouping's cost model
// (HUE_GROUPING_US_PER_COLOR) is pure per-color hex/HSL math plus a
// linear scan of the SVG's <g> tags, not real geometry, so a synthetic SVG
// of the right shape is representative.
export function timeHueGrouping(colorCount: number): number {
    const palette = Array.from({ length: colorCount }, (_, i) => {
        const hue = Math.round((360 * i) / colorCount);
        return { name: `Color ${i + 1}`, color: hslToHexForBench(hue, 60, 30 + (i % 5) * 10) };
    });
    const groups = palette
        .map((_, i) => `<g data-paper-data='${JSON.stringify({ colorIndex: i })}'><path d="M0 0L1 1L1 0Z"/></g>`)
        .join('');
    const raw: RawColorResult = {
        svg: `<svg id="svg" version="1.1" width="10" height="10" xmlns="http://www.w3.org/2000/svg">${groups}</svg>`,
        palette,
    };
    return timeMs(() => applyHueGrouping(raw)).ms;
}

function hslToHexForBench(h: number, s: number, l: number): string {
    // Minimal HSL->hex, only used to build plausible-looking synthetic
    // palette colors above - not a shared utility, deliberately kept local.
    const a = (s * Math.min(l, 100 - l)) / 100;
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l / 100 - (a / 100) * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color);
    };
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

export function resolveDownloadPath(filename: string): string {
    return path.join(require('os').homedir(), 'Downloads', filename);
}
