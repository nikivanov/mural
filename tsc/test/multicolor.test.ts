/**
 * End-to-end tests for multi-color separation (docs/multi-color.md) through
 * the full SVG -> commands pipeline (renderSvgJsonToCommands in
 * src/toCommands.ts).
 *
 * Like pipeline.test.ts, these need the real paper.js geometry engine (path
 * booleans for the knockout pass, color parsing from SVG fill attributes,
 * etc.), which only works once the native `canvas` addon has a compiled
 * binary. See pipeline.test.ts's file header for the full explanation - the
 * same self-skip applies here whenever `canvas` hasn't been built
 * (`npm install --ignore-scripts`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPenStatesAlternate } from "./fixtures";
import type { Command, RequestTypes } from "../src/types";

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

const WIDTH = 200;
const HEIGHT = 100;

function svgToRequest(
    svgString: string,
    paper: typeof import("paper"),
    overrides: Partial<RequestTypes.RenderSVGRequest> = {},
): RequestTypes.RenderSVGRequest {
    const probeSize = new paper.Size(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    paper.setup(probeSize);
    const svg = paper.project.importSVG(svgString, {
        expandShapes: true,
        applyMatrix: true,
    });
    const svgJson = svg.exportJSON() as string;
    const svgWidth = svg.bounds.width || 1;
    const svgHeight = svg.bounds.height || 1;
    paper.project.remove();

    const height = Math.max(1, Math.round(svgHeight * (WIDTH / svgWidth)));

    return {
        type: "renderSvg",
        svgJson,
        width: WIDTH,
        height,
        svgWidth,
        svgHeight,
        homeX: 0,
        homeY: 0,
        infillDensity: 2,
        flattenPaths: false,
        topDistance: Math.round(WIDTH / 0.6),
        ...overrides,
    };
}

const singleColorSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="10" width="60" height="30" fill="#000000"/>
</svg>`;

// Yellow is much lighter than blue by luminance, so light-to-dark order
// should put the yellow rect's layer first.
const twoColorSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="5" width="30" height="30" fill="#ffff00"/>
    <rect x="140" y="5" width="30" height="30" fill="#0000ff"/>
</svg>`;

if (!paperAvailable) {
    test(`multicolor tests skipped: paper.js unavailable (${(paperLoadResult as { error: Error }).error.message})`, (t) => {
        t.skip("native `canvas` addon has no compiled binary in this environment. Run `npm install` without --ignore-scripts, with cairo/pango/pkg-config available, to enable these tests.");
    });
} else {
    const paper = (paperLoadResult as { paper: typeof import("paper") }).paper;
    const { renderSvgJsonToCommands } = require("../src/toCommands") as typeof import("../src/toCommands");

    const noopStatus = () => {};

    test("multicolor: colorSeparation on a single-literal-color SVG is byte-identical to colorSeparation off (N=1)", async () => {
        const requestWithout = svgToRequest(singleColorSvg, paper);
        const requestWith = svgToRequest(singleColorSvg, paper, { colorSeparation: true });

        const resultWithout = await renderSvgJsonToCommands(requestWithout, noopStatus);
        const resultWith = await renderSvgJsonToCommands(requestWith, noopStatus);

        assert.deepStrictEqual(resultWith.commands, resultWithout.commands);
        assert.strictEqual(resultWith.distance, resultWithout.distance);
        assert.strictEqual((resultWith as any).layers, undefined);
    });

    test("multicolor: colorSeparation defaulting off leaves a multi-color SVG on the untouched single-color path", async () => {
        // No colorSeparation flag at all: even though the SVG has two
        // literal colors, the request never opts in, so this must produce a
        // single merged layer with no c<index>/n<index> commands - this is
        // the "no behavior change with the feature unused" guarantee.
        const request = svgToRequest(twoColorSvg, paper);
        const result = await renderSvgJsonToCommands(request, noopStatus);

        assert.ok(!result.commands.some((c) => /^c\d+$/.test(c)), "unexpected c<index> command with colorSeparation unset");
        assert.ok(!result.commands.some((c) => /^n\d+ /.test(c)), "unexpected n<index> command with colorSeparation unset");
        assert.strictEqual((result as any).layers, undefined);
    });

    test("multicolor: two literal colors produce palette headers, a c2 boundary, and light-to-dark order", async () => {
        const request = svgToRequest(twoColorSvg, paper, { colorSeparation: true });
        const result = await renderSvgJsonToCommands(request, noopStatus);

        // Header order: d, h, t, n1, n2, then layer 1's commands, c2, layer 2's commands.
        assert.match(result.commands[0], /^d[\d.]+$/);
        assert.match(result.commands[1], /^h\d+$/);
        assert.match(result.commands[2], /^t\d+$/);
        assert.strictEqual(result.commands[3], "n1 Color 1");
        assert.strictEqual(result.commands[4], "n2 Color 2");

        const c2Index = result.commands.indexOf("c2");
        assert.ok(c2Index > 4, "expected a c2 boundary marker after the headers");
        // Only one boundary marker for 2 colors (N-1).
        assert.strictEqual(result.commands.filter((c) => /^c\d+$/.test(c)).length, 1);

        // All commands between the headers and c2 belong to layer 1; verify
        // they form a well-formed, pen-alternating stroke sequence, and
        // likewise for everything after c2.
        const layer1Commands = result.commands.slice(5, c2Index) as Command[];
        const layer2Commands = result.commands.slice(c2Index + 1) as Command[];
        assertPenStatesAlternate(layer1Commands);
        assertPenStatesAlternate(layer2Commands);
        assert.ok(layer1Commands.length > 0);
        assert.ok(layer2Commands.length > 0);

        // Per-layer breakdown, light (yellow, layer 1) before dark (blue, layer 2).
        const layers = (result as any).layers;
        assert.ok(Array.isArray(layers) && layers.length === 2);
        assert.strictEqual(layers[0].name, "Color 1");
        assert.strictEqual(layers[1].name, "Color 2");
        assert.ok(layers[0].distance > 0);
        assert.ok(layers[1].distance > 0);
        assert.ok(Math.abs((layers[0].distance + layers[1].distance) - result.distance) < 1e-6);

        // Geometry check, not just name check: layer 1's commands (drawn
        // first) must actually be the yellow rect's geometry, and layer 2's
        // the blue rect's - names are assigned by index regardless of
        // ordering, so asserting on them alone (as this test used to) can't
        // catch a reversed sort. Coordinates in the command file are in mm,
        // scaled from SVG-space by request.width/request.svgWidth (see
        // toCommands.ts) - derive expected ranges from that ratio instead of
        // hardcoding mm values, so this stays correct if WIDTH/the fixture
        // rects ever change.
        const ratio = request.width / request.svgWidth;
        const coordRe = /^(-?[\d.]+) (-?[\d.]+)$/;
        const xsOf = (cmds: Command[]) => (cmds as unknown as string[])
            .map((c) => coordRe.exec(c))
            .filter((m): m is RegExpExecArray => m !== null)
            .map((m) => parseFloat(m[1]));

        const layer1Xs = xsOf(layer1Commands);
        const layer2Xs = xsOf(layer2Commands);
        assert.ok(layer1Xs.length > 0 && layer2Xs.length > 0, "expected coordinate commands in both layers");

        // Yellow rect: SVG x in [5, 35]. Blue rect: SVG x in [140, 170]. Give
        // a small tolerance for RDP simplification/infill; the viewport
        // (request.width) clips anything past the drawing area's edge.
        const tolerance = 3;
        const yellowMin = 5 * ratio - tolerance;
        const yellowMax = 35 * ratio + tolerance;
        const blueMin = 140 * ratio - tolerance;
        const blueMax = Math.min(170 * ratio, request.width) + tolerance;

        for (const x of layer1Xs) {
            assert.ok(x >= yellowMin && x <= yellowMax, `layer 1 (yellow) x=${x} outside [${yellowMin}, ${yellowMax}]`);
        }
        for (const x of layer2Xs) {
            assert.ok(x >= blueMin && x <= blueMax, `layer 2 (blue) x=${x} outside [${blueMin}, ${blueMax}]`);
        }
        // Belt-and-braces spatial separation check, independent of the
        // absolute ranges above: the two rects don't overlap in x, so
        // layer 1 must be entirely to the left of layer 2.
        assert.ok(Math.max(...layer1Xs) < Math.min(...layer2Xs), "expected layer 1 (yellow) to be entirely left of layer 2 (blue)");
    });

    test("multicolor: a supplied palette (index-aligned to the light-to-dark colorIndex order) names the layers", async () => {
        const request = svgToRequest(twoColorSvg, paper, {
            colorSeparation: true,
            palette: [
                { name: "Sunshine", color: "#ffff00" },
                { name: "Ocean", color: "#0000ff" },
            ],
        });
        const result = await renderSvgJsonToCommands(request, noopStatus);

        assert.strictEqual(result.commands[3], "n1 Sunshine");
        assert.strictEqual(result.commands[4], "n2 Ocean");
    });

    test("multicolor raster: vectorizeImageDataColor orders masks/palette light-to-dark, matching the yellow/blue geometry", () => {
        const { vectorizeImageDataColor } = require("../src/vectorizer") as typeof import("../src/vectorizer");

        // Synthetic 20x10 bitmap, solid colors (no anti-aliasing to confuse
        // the quantizer/tracer): left half yellow, right half blue - same
        // light/dark relationship as twoColorSvg above.
        const rasterWidth = 20;
        const rasterHeight = 10;
        const data = new Uint8ClampedArray(rasterWidth * rasterHeight * 4);
        for (let y = 0; y < rasterHeight; y++) {
            for (let x = 0; x < rasterWidth; x++) {
                const i = (y * rasterWidth + x) * 4;
                const isLeft = x < rasterWidth / 2;
                data[i] = isLeft ? 255 : 0;       // R
                data[i + 1] = isLeft ? 255 : 0;   // G
                data[i + 2] = isLeft ? 0 : 255;   // B
                data[i + 3] = 255;                // A
            }
        }
        const imageData = { data, width: rasterWidth, height: rasterHeight, colorSpace: "srgb" } as unknown as ImageData;

        const result = vectorizeImageDataColor(imageData, 0, 2, [
            { name: "Sunshine", color: "#ffff00" },
            { name: "Ocean", color: "#0000ff" },
        ]);

        // Palette must come back light-to-dark: yellow (colorIndex 0) before
        // blue (colorIndex 1).
        assert.strictEqual(result.palette[0].name, "Sunshine");
        assert.strictEqual(result.palette[1].name, "Ocean");

        // And the geometry each `colorIndex`-tagged group carries must
        // actually match: group 0 traces the left (yellow) half, group 1
        // the right (blue) half - not just the palette label.
        const probeSize = new paper.Size(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
        paper.setup(probeSize);
        const svg = paper.project.importSVG(result.svg, { expandShapes: true });

        const groupsByColorIndex = new Map<number, paper.Item>();
        for (const child of svg.children) {
            const colorIndex = (child.data as { colorIndex?: number } | undefined)?.colorIndex;
            if (colorIndex !== undefined) {
                groupsByColorIndex.set(colorIndex, child);
            }
        }
        paper.project.remove();

        assert.strictEqual(groupsByColorIndex.size, 2, "expected two colorIndex-tagged groups");
        const group0Bounds = groupsByColorIndex.get(0)!.bounds;
        const group1Bounds = groupsByColorIndex.get(1)!.bounds;

        assert.ok(group0Bounds.width > 0, "colorIndex 0 group has no traced geometry");
        assert.ok(group1Bounds.width > 0, "colorIndex 1 group has no traced geometry");
        // colorIndex 0 (yellow) must sit in the left half, colorIndex 1
        // (blue) in the right half.
        assert.ok(group0Bounds.right <= rasterWidth / 2, `colorIndex 0 (yellow) bounds ${JSON.stringify(group0Bounds)} not confined to the left half`);
        assert.ok(group1Bounds.left >= rasterWidth / 2, `colorIndex 1 (blue) bounds ${JSON.stringify(group1Bounds)} not confined to the right half`);
    });
}
