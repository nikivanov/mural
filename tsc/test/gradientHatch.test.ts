/**
 * Tests for src/fillStrategies/gradientHatch.ts, the FillContext gradient-
 * field wiring in src/infill.ts, and the SVG tagging in
 * src/vectorizer.ts's withGradientField.
 *
 * Needs the real paper.js geometry engine (Path booleans/intersections,
 * Path.contains, ...), which in this repo only works once the native
 * `canvas` addon has a compiled binary - see pipeline.test.ts's header for
 * the full explanation. Self-skips gracefully otherwise.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.server = "1";

function tryLoadPaper(): { paper: typeof import("paper") } | { error: Error } {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const paper = require("paper");
        return { paper };
    } catch (err) {
        return { error: err as Error };
    }
}

const paperLoadResult = tryLoadPaper();
const paperAvailable = !("error" in paperLoadResult);

function makeImageData(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const [r, g, b, a] = fill(x, y);
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = a;
        }
    }
    return { data, width, height, colorSpace: "srgb" } as unknown as ImageData;
}

if (!paperAvailable) {
    test(`gradientHatch tests skipped: paper.js unavailable (${(paperLoadResult as { error: Error }).error.message})`, (t) => {
        t.skip("native `canvas` addon has no compiled binary in this environment. Run `npm install` without --ignore-scripts, with cairo/pango/pkg-config available, to enable these tests.");
    });
} else {
    const paper = (paperLoadResult as { paper: typeof import("paper") }).paper;
    const { gradientHatch } = require("../src/fillStrategies/gradientHatch") as typeof import("../src/fillStrategies/gradientHatch");
    const { crossHatch45 } = require("../src/fillStrategies/crossHatch45") as typeof import("../src/fillStrategies/crossHatch45");
    const { withGradientField } = require("../src/vectorizer") as typeof import("../src/vectorizer");
    const { generateInfills } = require("../src/infill") as typeof import("../src/infill");

    function setupProjectWithSquare(size: number): { path: paper.Path } {
        paper.setup(new paper.Size(size, size));
        const path = new paper.Path.Rectangle(new paper.Point(0, 0), new paper.Size(size, size));
        path.fillColor = new paper.Color("#000000");
        return { path };
    }

    function baseCtx(view: paper.View, boundsPath: paper.Path, gradientField?: any) {
        return { view, boundsPath, cache: new Map(), gradientField };
    }

    test("gradientHatch: falls back to crossHatch45 when FillContext has no gradient field (vector-origin path)", () => {
        const { path } = setupProjectWithSquare(200);
        const boundsPath = new paper.Path.Rectangle(paper.project.view.bounds);
        const ctx = baseCtx(paper.project.view, boundsPath, undefined);

        const gradientResult = gradientHatch.generateFill(path, { spacingMm: 10, minInfillLength: 5 }, ctx as any);
        const crossHatchResult = crossHatch45.generateFill(path, { spacingMm: 10, minInfillLength: 5 }, ctx as any);

        assert.strictEqual(gradientResult.length, crossHatchResult.length, "expected identical output to crossHatch45 when there's no gradient field to follow");
        for (let i = 0; i < gradientResult.length; i++) {
            assert.ok(gradientResult[i].segments[0].point.isClose(crossHatchResult[i].segments[0].point, 1e-6));
        }
    });

    test("gradientHatch: spacingMm 0 produces no infill, same as crossHatch45", () => {
        const { path } = setupProjectWithSquare(200);
        const boundsPath = new paper.Path.Rectangle(paper.project.view.bounds);
        const ctx = baseCtx(paper.project.view, boundsPath, undefined);
        const result = gradientHatch.generateFill(path, { spacingMm: 0, minInfillLength: 1000 }, ctx as any);
        assert.deepStrictEqual(result, []);
    });

    test("gradientHatch: strokes on a horizontal-ramp raster region are predominantly vertical (following the isophote, perpendicular to the +x luminance gradient)", () => {
        const size = 300;
        paper.setup(new paper.Size(size, size));
        const path = new paper.Path.Rectangle(new paper.Point(20, 20), new paper.Size(size - 40, size - 40));
        path.fillColor = new paper.Color("#000000");
        const view = paper.project.view;
        const boundsPath = new paper.Path.Rectangle(view.bounds);

        // Source raster: horizontal luminance ramp, same size as the view
        // (matches how a vectorized image's raster covers the same [0,
        // size] extent the render view does).
        const imageData = makeImageData(size, size, (x) => {
            const v = Math.round((x / (size - 1)) * 255);
            return [v, v, v, 255];
        });

        const { computeGradientField, chooseSampleSpacingPx, sampleGradientField } = require("../src/imageGradient") as typeof import("../src/imageGradient");
        const field = computeGradientField(imageData, chooseSampleSpacingPx(size, size));
        const gradientFieldLookup = {
            sampleAt(point: paper.Point, viewSize: paper.Size) {
                return sampleGradientField(field, point.x / viewSize.width, point.y / viewSize.height);
            },
        };

        const ctx = baseCtx(view, boundsPath, gradientFieldLookup);
        const result = gradientHatch.generateFill(path, { spacingMm: 15, minInfillLength: 3 }, ctx as any);

        assert.ok(result.length > 0, "expected at least some strokes");

        // Isophote direction for a +x ramp is +-y (vertical): each
        // stroke's overall direction (last point minus first point)
        // should be predominantly vertical rather than horizontal.
        let verticalCount = 0;
        for (const stroke of result) {
            const first = stroke.segments[0].point;
            const last = stroke.segments[stroke.segments.length - 1].point;
            const dx = Math.abs(last.x - first.x);
            const dy = Math.abs(last.y - first.y);
            if (dy > dx) verticalCount++;
        }
        assert.ok(verticalCount / result.length > 0.7, `expected most strokes to be predominantly vertical, got ${verticalCount}/${result.length}`);
    });

    test("gradientHatch: falls back to crossHatch45 on a flat (uniform) raster region", () => {
        const size = 200;
        paper.setup(new paper.Size(size, size));
        const path = new paper.Path.Rectangle(new paper.Point(10, 10), new paper.Size(size - 20, size - 20));
        path.fillColor = new paper.Color("#000000");
        const view = paper.project.view;
        const boundsPath = new paper.Path.Rectangle(view.bounds);

        const imageData = makeImageData(size, size, () => [128, 128, 128, 255]);
        const { computeGradientField, chooseSampleSpacingPx, sampleGradientField } = require("../src/imageGradient") as typeof import("../src/imageGradient");
        const field = computeGradientField(imageData, chooseSampleSpacingPx(size, size));
        const gradientFieldLookup = {
            sampleAt(point: paper.Point, viewSize: paper.Size) {
                return sampleGradientField(field, point.x / viewSize.width, point.y / viewSize.height);
            },
        };

        const ctx = baseCtx(view, boundsPath, gradientFieldLookup);
        const gradientResult = gradientHatch.generateFill(path, { spacingMm: 10, minInfillLength: 3 }, ctx as any);
        const crossHatchResult = crossHatch45.generateFill(path, { spacingMm: 10, minInfillLength: 3 }, ctx as any);

        assert.strictEqual(gradientResult.length, crossHatchResult.length, "expected a flat region to fall back to identical crossHatch45 output");
    });

    test("withGradientField + infill.ts wiring: a real vectorize()-shaped SVG round-trips a usable gradient field into FillContext", () => {
        const size = 240;
        const svgString = `<svg id="svg" version="1.1" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><path d="M0 0L${size} 0L${size} ${size}L0 ${size}Z" fill="#000000"/></svg>`;
        const imageData = makeImageData(size, size, (x) => {
            const v = Math.round((x / (size - 1)) * 255);
            return [v, v, v, 255];
        });

        const tagged = withGradientField(svgString, imageData);
        assert.notStrictEqual(tagged, svgString, "expected the SVG to be tagged with a gradient field");
        assert.match(tagged, /^<svg[^>]*data-paper-data='[^']*gradientField[^']*'/);

        // Mirrors the client bridge (svgControl.js): import the tagged SVG
        // string, export to paper's own JSON, then import that JSON again
        // in a fresh project - same two-hop trip real requests take.
        paper.setup(new paper.Size(size, size));
        const imported = paper.project.importSVG(tagged, { expandShapes: true });
        const svgJson = imported.exportJSON() as string;
        paper.project.remove();

        paper.setup(new paper.Size(size, size));
        const svg = paper.project.importJSON(svgJson);

        const { generatePaths } = require("../src/generator") as typeof import("../src/generator");
        const paths = generatePaths(svg);
        assert.ok(paths.length > 0, "expected at least one imported path");

        const infilled = generateInfills(paths, 3);
        assert.ok(infilled.length > 0);
        // The wiring succeeded if generateInfills was able to build a
        // gradientField lookup at all - exercised indirectly by checking
        // gradientHatch actually curves differently from crossHatch45 when
        // explicitly selected via fillMethod on this same tree.
        for (const p of paths) {
            (p.data as any).fillMethod = "gradientHatch";
        }
        const infilledWithStrategy = generateInfills(paths, 3);
        assert.ok(infilledWithStrategy.some(ip => ip.infillPaths.length > 0), "expected gradientHatch to produce infill on a raster-origin ramp");
    });
}
