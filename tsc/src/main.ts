import { renderCommandsToSvgJson } from "./toSvgJson";
import { renderSvgJsonToCommands } from "./toCommands";
import { GrayscaleLevelResult, vectorizeImageData, vectorizeImageDataColor, vectorizeImageDataGrayscale } from './vectorizer';
import { InfillDensities, InfillDensity, RequestTypes } from "./types";
import { applyHueGrouping, applyHueGroupingWithOverrides } from './huePalette';

const supportedGrayscaleLevels = [3, 4];

const updateStatusFn = (status: string) => {
    self.postMessage({
        type: "status",
        payload: status,
    });
};

self.onmessage = async (e: MessageEvent<any>) => {
    if (isVectorizeRequest(e.data)) {
        vectorize(e.data);
    } else if (isRenderSvgRequest(e.data)) {
        await render(e.data);
    } else {
        throw new Error("Bad request");
    }
};

function vectorize(request: RequestTypes.VectorizeRequest) {
    updateStatusFn("Vectorizing");

    // grayscaleLevels and colorCount are mutually exclusive tonal/color
    // separation modes; grayscale wins if both are somehow set. Either
    // absent (or colorCount < 2) preserves the original single 1-bit-mask
    // behavior exactly.
    if (request.grayscaleLevels) {
        const svgString = vectorizeGrayscale(request.raster, request.turdSize, request.grayscaleLevels);
        self.postMessage({
            type: "vectorizer",
            payload: {
                svg: svgString,
            }
        });
        return;
    }

    if (request.colorCount && request.colorCount >= 2) {
        const rawResult = vectorizeImageDataColor(request.raster, request.turdSize, request.colorCount, request.palette);

        // Hue grouping (huePalette.ts): collapses the detected/matched
        // palette into fewer pens by hue proximity, re-tagging each mask's
        // colorIndex/density accordingly. Omitted/false leaves rawResult
        // untouched, so existing colorCount/palette behavior (and its
        // byte-identical-at-N=1 guarantee) is unaffected.
        if (request.hueGrouping) {
            // Per-image physical controls (huePalette.ts's tone-derived
            // spacing model): omitted/falsy falls back to that module's
            // defaults (DEFAULT_NIB_WIDTH_MM / DEFAULT_INK_MULTIPLIER).
            const toneOptions = { nibWidthMm: request.nibWidthMm, inkMultiplier: request.inkMultiplier };
            const grouped = request.hueOverrides
                ? applyHueGroupingWithOverrides(rawResult, request.hueOverrides, toneOptions)
                : applyHueGrouping(rawResult, toneOptions);

            self.postMessage({
                type: "vectorizer",
                payload: {
                    svg: grouped.svg,
                    palette: grouped.palette,
                    // Per-pen shade breakdown the UI needs to show pen
                    // count/tint ladder and let the user override the
                    // automatic grouping.
                    hueGroups: grouped.groups,
                }
            });
            return;
        }

        self.postMessage({
            type: "vectorizer",
            payload: {
                svg: rawResult.svg,
                palette: rawResult.palette,
            }
        });
        return;
    }

    const svgString = vectorizeImageData(request.raster, request.turdSize);
    self.postMessage({
        type: "vectorizer",
        payload: {
            svg: svgString,
        }
    });
}

function vectorizeGrayscale(raster: ImageData, turdSize: number, requestedLevels: number): string {
    const levels = supportedGrayscaleLevels.includes(requestedLevels) ? requestedLevels : 3;
    const levelResults = vectorizeImageDataGrayscale(raster, turdSize, levels);
    return combineGrayscaleLevels(levelResults, levels);
}

// Darker levels get denser infill; only the darkest (last) level keeps an
// outline stroke, so the lighter levels' boundaries don't get hard drawn
// edges on top of the darker regions they nest inside.
function densityForLevel(level: number, levels: number): InfillDensity {
    const density = Math.max(1, Math.min(4, Math.round((4 * level) / levels)));
    return InfillDensities.includes(density as InfillDensity) ? (density as InfillDensity) : 4;
}

// The bundled Potrace tracer (tracer.js#getSVG) always emits a single, fixed
// shape: `<svg id="svg" version="1.1" width="W" height="H" xmlns="...">` +
// one `<path ... />` + `</svg>`. Rather than pull in a DOM parser inside the
// worker, we rely on that fixed shape to merge each level's traced path into
// one SVG, wrapping each in a `<g data-paper-data='...'>` so paper.js's
// importSVG (used client-side) tags the resulting Group's `.data` with the
// per-level density/outline override that generator.ts/infill.ts read.
function combineGrayscaleLevels(levelResults: GrayscaleLevelResult[], levels: number): string {
    const dimsMatch = levelResults[0].svg.match(/width="([^"]+)" height="([^"]+)"/);
    if (!dimsMatch) {
        throw new Error("Unexpected tracer SVG output");
    }
    const [, width, height] = dimsMatch;

    const groups = levelResults.map(({ level, svg }) => {
        const pathMatch = svg.match(/<path[^>]*\/>/);
        if (!pathMatch) {
            throw new Error("Unexpected tracer SVG output");
        }

        const density = densityForLevel(level, levels);
        const outline = level === levels;
        const data = JSON.stringify({ density, outline });

        return `<g data-paper-data='${data}'>${pathMatch[0]}</g>`;
    }).join('');

    return `<svg id="svg" version="1.1" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${groups}</svg>`;
}

async function render(request: RequestTypes.RenderSVGRequest) {
    const renderResult = await renderSvgJsonToCommands(
        request,
        updateStatusFn,
    ) as Awaited<ReturnType<typeof renderSvgJsonToCommands>> & { layers?: { color: string }[] };

    // Multi-color tinted preview (docs/multi-color.md section 6): tint each
    // layer's reconstructed paths with its own resolved color, rather than
    // one flat stroke color, whenever this render produced more than one
    // layer.
    const layerColors = renderResult.layers && renderResult.layers.length > 1
        ? renderResult.layers.map(l => l.color)
        : undefined;

    const resultSvgJson = renderCommandsToSvgJson(renderResult.commands, request.width, request.height, updateStatusFn, layerColors);
    self.postMessage({
        type: "renderer",
        payload: {
            commands: renderResult.commands,
            svgJson: resultSvgJson,
            distance: renderResult.distance,
            drawDistance: renderResult.drawDistance,
            layers: renderResult.layers,
        }
    });
}

function isVectorizeRequest(obj: any): obj is RequestTypes.VectorizeRequest {
    if (!('type' in obj) || obj.type !== 'vectorize') {
        return false;
    }

    if (!('raster' in obj) || typeof obj.raster !== 'object') {
        return false;
    }

    if (!('turdSize' in obj) || typeof obj.turdSize !== 'number') {
        return false;
    }

    if ('grayscaleLevels' in obj && obj.grayscaleLevels !== undefined && typeof obj.grayscaleLevels !== 'number') {
        return false;
    }

    if ('hueGrouping' in obj && obj.hueGrouping !== undefined && typeof obj.hueGrouping !== 'boolean') {
        return false;
    }

    if ('nibWidthMm' in obj && obj.nibWidthMm !== undefined && typeof obj.nibWidthMm !== 'number') {
        return false;
    }

    if ('inkMultiplier' in obj && obj.inkMultiplier !== undefined && typeof obj.inkMultiplier !== 'number') {
        return false;
    }

    return true;
}


function isRenderSvgRequest(obj: any): obj is RequestTypes.RenderSVGRequest {
    if (!('type' in obj) || obj.type !== 'renderSvg') {
        return false;
    }

    if (!('svgJson' in obj) || typeof obj.svgJson !== 'string') {
        return false;
    }

    if (!('width' in obj) || typeof obj.width !== 'number') {
        return false;
    }

    if (!('height' in obj) || typeof obj.height !== 'number') {
        return false;
    }

    if (!('svgWidth' in obj) || typeof obj.svgWidth !== 'number') {
        return false;
    }

    if (!('svgHeight' in obj) || typeof obj.svgHeight !== 'number') {
        return false;
    }

    if (!('homeX' in obj) || typeof obj.homeX !== 'number') {
        return false;
    }

    if (!('homeY' in obj) || typeof obj.homeY !== 'number') {
        return false;
    }

    if (!('infillDensity' in obj) || typeof obj.infillDensity !== 'number' || !InfillDensities.includes(obj.infillDensity)) {
        return false;
    }

    if (!('flattenPaths' in obj) || typeof obj.flattenPaths !== 'boolean') {
        return false;
    }

    if (!('topDistance' in obj) || typeof obj.topDistance !== 'number') {
        return false;
    }

    return true;
}

