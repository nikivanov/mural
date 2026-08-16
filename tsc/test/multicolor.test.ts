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
}
