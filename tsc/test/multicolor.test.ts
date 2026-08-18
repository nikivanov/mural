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
import { DEFAULT_NIB_WIDTH_MM } from "../src/huePalette";

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

    // --- Fidelity fixes: white-as-knockout (BUG 1) and fill+stroke dual
    // contribution (BUG 2) - see the doc comments on applyWhiteKnockout
    // (flattener.ts) and groupPathsByLiteralColor (generator.ts). ---

    const blackRectOnlySvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="60" height="30" fill="#000000"/>
    </svg>`;

    // A full-canvas white rect, painted *first* (i.e. bottom of the z-order
    // - the common "white background" SVG pattern). It must knock out
    // nothing, since nothing is drawn beneath it.
    const whiteBackgroundBehindBlackRectSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>
        <rect x="10" y="10" width="60" height="30" fill="#000000"/>
    </svg>`;

    // Force identical scaling for both SVGs above (rather than letting
    // svgToRequest derive svgWidth/svgHeight from each SVG's own bounding
    // box, which would differ once the white background rect is added),
    // so the two pipeline outputs are directly comparable coordinate-for-
    // coordinate.
    const fixedFrameOverrides = { svgWidth: WIDTH, svgHeight: HEIGHT, height: HEIGHT };

    test("multicolor fidelity: a full-canvas white background rect (bottom of z-order) knocks out nothing", async () => {
        const withoutBg = svgToRequest(blackRectOnlySvg, paper, fixedFrameOverrides);
        const withBg = svgToRequest(whiteBackgroundBehindBlackRectSvg, paper, fixedFrameOverrides);

        const resultWithoutBg = await renderSvgJsonToCommands(withoutBg, noopStatus);
        const resultWithBg = await renderSvgJsonToCommands(withBg, noopStatus);

        assert.deepStrictEqual(resultWithBg.commands, resultWithoutBg.commands);
        assert.strictEqual(resultWithBg.distance, resultWithoutBg.distance);
    });

    // A white rect drawn *above* (later in document order than) a filled
    // black rect, entirely inside its bounds - the letters-on-a-panel shape
    // from the W3C logo, minimized to a rectangle.
    const blackRectWithWhiteHoleSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="60" height="30" fill="#000000"/>
        <rect x="30" y="18" width="20" height="10" fill="#ffffff"/>
    </svg>`;

    test("multicolor fidelity: a white shape above a filled shape produces a hole in that shape's hatching", async () => {
        const withoutHole = svgToRequest(blackRectOnlySvg, paper, fixedFrameOverrides);
        const withHole = svgToRequest(blackRectWithWhiteHoleSvg, paper, fixedFrameOverrides);

        const resultWithoutHole = await renderSvgJsonToCommands(withoutHole, noopStatus);
        const resultWithHole = await renderSvgJsonToCommands(withHole, noopStatus);

        // Carving a hole out of the middle of the rect changes what gets
        // drawn (fewer/shorter hatch lines inside the hole, but also a new
        // inner boundary to trace around it, so total draw distance isn't
        // guaranteed to move in one particular direction) - the geometric
        // check below is the real proof the hole exists; this is just a
        // sanity check that something changed at all, i.e. the white shape
        // wasn't silently dropped with no effect on its surroundings (the
        // pre-fix behavior).
        assert.notDeepStrictEqual(resultWithHole.commands, resultWithoutHole.commands);

        // Direct geometric proof: with fixedFrameOverrides (ratio 1), mm
        // coordinates equal SVG coordinates, so no drawn point should land
        // strictly inside the white hole's [30,50] x [18,28] interior (a
        // small margin excludes points that legitimately trace the hole's
        // own boundary edge).
        const margin = 1;
        const coordRe = /^(-?[\d.]+) (-?[\d.]+)$/;
        for (const cmd of resultWithHole.commands) {
            const m = coordRe.exec(cmd);
            if (!m) continue;
            const x = parseFloat(m[1]);
            const y = parseFloat(m[2]);
            const insideHole = x > 30 + margin && x < 50 - margin && y > 18 + margin && y < 28 - margin;
            assert.ok(!insideHole, `coordinate (${x}, ${y}) falls inside the white hole - expected unmarked paper`);
        }
    });

    test("multicolor fidelity: a path with a differently-colored fill and stroke contributes to both layers", async () => {
        const orangeFillBlackStrokeSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="10" width="60" height="30" fill="#ff8800" stroke="#000000" stroke-width="2"/>
        </svg>`;
        // Explicit frame (see fixedFrameOverrides above): a single small
        // shape's own bounding box would otherwise become the scaling
        // reference, which - combined with its x/y offset - can stretch it
        // partly outside the [0,width] x [0,height] view that
        // renderPathsToCommands clips to.
        const request = svgToRequest(orangeFillBlackStrokeSvg, paper, { colorSeparation: true, ...fixedFrameOverrides });
        const result = await renderSvgJsonToCommands(request, noopStatus);

        const layers = (result as any).layers;
        assert.ok(Array.isArray(layers) && layers.length === 2, "expected the fill and stroke to produce two separate layers");

        // Orange is lighter than black, so it must be layer 1 (drawn first).
        assert.strictEqual(layers[0].color, "#ff8800");
        assert.strictEqual(layers[1].color, "#000000");
        assert.ok(layers[0].distance > 0 && layers[1].distance > 0, "both the fill and stroke layers must actually draw something");

        // The fill layer hatches the whole interior (many infill lines);
        // the stroke layer only traces the outline once (data.density = 0)
        // - so the fill layer's draw distance must be materially larger.
        assert.ok(
            layers[0].distance > layers[1].distance,
            `expected fill layer distance (${layers[0].distance}) > stroke layer distance (${layers[1].distance})`,
        );

        assert.ok(result.commands.includes("c2"), "expected a single c2 boundary between the two layers");
    });

    // --- Trapping gap (docs/multi-color.md section 5 addendum;
    // flattener.ts's flattenPathsAcrossLayers `gapMm` parameter): the
    // cross-layer knockout above leaves the lighter layer's remaining
    // geometry sharing its exact boundary with the darker layer that
    // knocked it out - two pens then both touch that shared line. These
    // tests exercise `RequestTypes.RenderSVGRequest.knockoutGapMm`. ---

    // Two literal colors sharing an edge at x=30 (unlike twoColorSvg above,
    // whose rects are far apart) - the case where trapping actually matters.
    // Yellow (lighter) on the left, blue (darker) on the right, so yellow is
    // layer 1 and blue is layer 2, same light-to-dark convention as above.
    const adjoiningColorsSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="30" height="20" fill="#ffff00"/>
        <rect x="30" y="0" width="30" height="20" fill="#0000ff"/>
    </svg>`;
    const adjoiningFrameOverrides = { svgWidth: WIDTH, svgHeight: 20, height: 20, colorSeparation: true };

    // Headers (d, h, t, n1, n2) occupy indices 0-4 for every 2-color render
    // in this file (default palette naming, no supplied `palette` override),
    // matching the "two literal colors..." test above - reused here instead
    // of re-deriving it per test.
    const HEADER_COMMAND_COUNT = 5;

    function splitTwoLayers(commands: Command[]): { layer1: Command[]; layer2: Command[] } {
        const c2Index = commands.indexOf("c2" as unknown as Command);
        assert.ok(c2Index > HEADER_COMMAND_COUNT - 1, "expected a c2 boundary marker after the headers");
        return {
            layer1: commands.slice(HEADER_COMMAND_COUNT, c2Index),
            layer2: commands.slice(c2Index + 1),
        };
    }

    const coordRe = /^(-?[\d.]+) (-?[\d.]+)$/;
    function coordsOf(cmds: Command[]): { x: number; y: number }[] {
        return (cmds as unknown as string[])
            .map((c) => coordRe.exec(c))
            .filter((m): m is RegExpExecArray => m !== null)
            .map((m) => ({ x: parseFloat(m[1]), y: parseFloat(m[2]) }));
    }

    // Minimum Euclidean distance between any point of `a` and any point of
    // `b` - the direct, "no coincident/touching geometry" measurement the
    // task asks for, rather than an axis-aligned proxy, so it holds
    // regardless of which edge/orientation the two layers happen to share.
    function minSeparation(a: { x: number; y: number }[], b: { x: number; y: number }[]): number {
        let min = Infinity;
        for (const p of a) {
            for (const q of b) {
                const d = Math.hypot(p.x - q.x, p.y - q.y);
                if (d < min) min = d;
            }
        }
        return min;
    }

    test("multicolor trapping: knockoutGapMm 0 reproduces today's touching behavior", async () => {
        const request = svgToRequest(adjoiningColorsSvg, paper, { ...adjoiningFrameOverrides, knockoutGapMm: 0 });
        const result = await renderSvgJsonToCommands(request, noopStatus);
        const { layer1, layer2 } = splitTwoLayers(result.commands as Command[]);

        const layer1Points = coordsOf(layer1);
        const layer2Points = coordsOf(layer2);
        assert.ok(layer1Points.length > 0 && layer2Points.length > 0, "expected drawn geometry in both layers");

        // The two layers' geometry must actually meet (share their boundary
        // at x=30, same as before this feature existed) - separation should
        // be ~0, well under a millimeter given RDP/flatten tolerances.
        const separation = minSeparation(layer1Points, layer2Points);
        assert.ok(separation < 0.5, `expected the two layers to touch with gap 0, measured separation ${separation}mm`);
    });

    test("multicolor trapping: a positive knockoutGapMm produces a measurable separation close to the configured gap, with zero coincident/touching geometry", async () => {
        const gapMm = 2;
        const request = svgToRequest(adjoiningColorsSvg, paper, { ...adjoiningFrameOverrides, knockoutGapMm: gapMm });
        const result = await renderSvgJsonToCommands(request, noopStatus);
        const { layer1, layer2 } = splitTwoLayers(result.commands as Command[]);

        const layer1Points = coordsOf(layer1);
        const layer2Points = coordsOf(layer2);
        assert.ok(layer1Points.length > 0 && layer2Points.length > 0, "expected drawn geometry in both layers");

        const separation = minSeparation(layer1Points, layer2Points);
        assert.ok(separation > gapMm - 0.5, `expected separation close to ${gapMm}mm, measured ${separation}mm (too small - layers still touch/overlap)`);
        assert.ok(separation < gapMm + 1, `expected separation close to ${gapMm}mm, measured ${separation}mm (unexpectedly large)`);

        // The darker layer (blue, layer 2) isn't itself grown - only the
        // lighter layer's boundary retreats - so layer 2 should still reach
        // all the way to its own original edge (x=30).
        const layer2MinX = Math.min(...layer2Points.map((p) => p.x));
        assert.ok(layer2MinX < 30 + 0.5, `expected the darker layer to still reach its own edge (x~30), min x was ${layer2MinX}`);

        // And layer 1 (yellow) must have retreated by ~gapMm from that edge.
        const layer1MaxX = Math.max(...layer1Points.map((p) => p.x));
        assert.ok(layer1MaxX < 30 - gapMm + 0.5, `expected the lighter layer to retreat to ~x=${30 - gapMm}, max x was ${layer1MaxX}`);
    });

    test("multicolor trapping: knockoutGapMm omitted defaults to roughly one nib width (huePalette's DEFAULT_NIB_WIDTH_MM)", async () => {
        const requestDefault = svgToRequest(adjoiningColorsSvg, paper, { ...adjoiningFrameOverrides });
        const requestExplicitDefault = svgToRequest(adjoiningColorsSvg, paper, { ...adjoiningFrameOverrides, knockoutGapMm: DEFAULT_NIB_WIDTH_MM });
        const requestZero = svgToRequest(adjoiningColorsSvg, paper, { ...adjoiningFrameOverrides, knockoutGapMm: 0 });

        const resultDefault = await renderSvgJsonToCommands(requestDefault, noopStatus);
        const resultExplicitDefault = await renderSvgJsonToCommands(requestExplicitDefault, noopStatus);
        const resultZero = await renderSvgJsonToCommands(requestZero, noopStatus);

        // Omitting the field must be byte-identical to spelling out the
        // documented default explicitly...
        assert.deepStrictEqual(resultDefault.commands, resultExplicitDefault.commands);
        // ...and must NOT be identical to gap 0 (i.e. the default really
        // does apply a nonzero gap, it's not silently ignored).
        assert.notDeepStrictEqual(resultDefault.commands, resultZero.commands);
    });

    test("multicolor trapping: a thin sliver in the lighter color adjacent to the darker color survives (not annihilated) even though the default gap exceeds its width", async () => {
        // A 1mm-wide light-gray sliver directly touching a black rect's left
        // edge. The default gap (~1.2mm, DEFAULT_NIB_WIDTH_MM) is wider than
        // the sliver, so growing the black rect by the gap and subtracting
        // it would consume the sliver entirely under a naive implementation
        // - the thin-feature protection in flattenPathsAcrossLayers must
        // fall back to the ungapped (touching) subtraction for this pair
        // instead, so the sliver still draws something.
        const sliverSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <rect x="9" y="10" width="1" height="30" fill="#cccccc"/>
            <rect x="10" y="10" width="40" height="30" fill="#000000"/>
        </svg>`;
        const request = svgToRequest(sliverSvg, paper, { svgWidth: WIDTH, svgHeight: HEIGHT, height: HEIGHT, colorSeparation: true });
        const result = await renderSvgJsonToCommands(request, noopStatus);

        const layers = (result as any).layers;
        assert.ok(Array.isArray(layers) && layers.length === 2, "expected two layers (sliver + black rect)");
        assert.strictEqual(layers[0].color, "#cccccc");
        assert.ok(layers[0].distance > 0, "the thin sliver layer must still draw something, not be annihilated by the gap");

        const { layer1 } = splitTwoLayers(result.commands as Command[]);
        assert.ok(coordsOf(layer1).length > 0, "expected drawn coordinates for the surviving sliver");
    });

    // --- Large multi-colour renders must not blow the call stack ---
    //
    // Regression: the final assembly step did `assembled.push(...layerCommands)`.
    // Spread passes every element as a separate call argument, so a layer of
    // ~100k+ commands threw "RangeError: Maximum call stack size exceeded" in
    // V8 - and it failed at the very last step, after all the expensive work
    // was done. Reported from a hue-grouped render whose tone-derived spacing
    // produced over 100 metres of drawing. Two sibling sites used spread on
    // the same unbounded arrays.
    //
    // Guarding the concatenation helpers directly rather than rendering a
    // genuinely enormous image, which would make the suite very slow: the
    // failure is purely a function of array length, not of geometry.
    test("large command lists concatenate without exceeding the call stack", () => {
        const huge = new Array(200_000).fill("p0") as Command[];

        // The pattern that used to be used - documents precisely what broke.
        assert.throws(() => {
            const sink: Command[] = [];
            sink.push(...huge);
        }, RangeError, "expected spread-push of a 200k array to overflow the stack");

        // The patterns now used in toCommands.ts must both survive it.
        const viaLoop: Command[] = [];
        for (const c of huge) {
            viaLoop.push(c);
        }
        assert.strictEqual(viaLoop.length, 200_000);
        assert.strictEqual(([] as Command[]).concat(huge).length, 200_000);
    });

    // --- Request-level fillMethod must survive multi-color rendering ---
    //
    // Regression: assignHatchAnglesPerColorGroup (generator.ts) used to stamp
    // fillMethod:'crossHatchAngled' onto every path in a multi-color render so
    // that its per-layer angles would take effect (crossHatch45 is hardcoded
    // to 45 degrees and ignores them). But a per-path fillMethod always beats
    // the request-level one in infill.ts, so that silently discarded the
    // user's choice: picking spiral/contour/gradientHatch produced byte-
    // identical output to the default on every multi-color image. It now only
    // substitutes when the request didn't specify a strategy.
    test("fillMethod: a request-level strategy actually changes multi-color output instead of being overridden by per-layer angle assignment", async () => {
        const twoColorSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <rect x="5" y="5" width="60" height="60" fill="#ffff00"/>
            <rect x="120" y="5" width="60" height="60" fill="#0000ff"/>
        </svg>`;

        const commandCountFor = async (fillMethod?: string) => {
            const request = svgToRequest(twoColorSvg, paper, fillMethod === undefined
                ? { colorSeparation: true }
                : { colorSeparation: true, fillMethod });
            const result = await renderSvgJsonToCommands(request, noopStatus);
            return result.commands.length;
        };

        const defaultCount = await commandCountFor(undefined);
        const spiralCount = await commandCountFor("spiral");
        const contourCount = await commandCountFor("contour");

        assert.ok(defaultCount > 0 && spiralCount > 0 && contourCount > 0);
        assert.notStrictEqual(spiralCount, defaultCount,
            "spiral should produce different output from the default strategy");
        assert.notStrictEqual(contourCount, defaultCount,
            "contour should produce different output from the default strategy");
        assert.notStrictEqual(spiralCount, contourCount,
            "spiral and contour should differ from each other");
    });

    // --- Per-layer enable/disable (disabledColorIndexes, types.ts) ---
    //
    // Three well-separated rects, one per pen, in strict light-to-dark
    // luminance order (yellow > green > blue) so colorIndex 0/1/2 map
    // predictably to left/middle/right. colorOverprint is set on every
    // request in this block so cross-layer knockout can't make one layer's
    // geometry depend on another's presence - isolating exactly what
    // disabledColorIndexes itself does.
    const threeColorSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="5" width="20" height="20" fill="#ffff00"/>
        <rect x="90" y="5" width="20" height="20" fill="#00ff00"/>
        <rect x="175" y="5" width="20" height="20" fill="#0000ff"/>
    </svg>`;
    const threeColorOverrides = { colorSeparation: true, colorOverprint: true };

    test("disabledColorIndexes: disabling the middle layer drops exactly its geometry and one pen-swap, leaving the other two layers byte-identical", async () => {
        const fullRequest = svgToRequest(threeColorSvg, paper, threeColorOverrides);
        const disabledRequest = svgToRequest(threeColorSvg, paper, { ...threeColorOverrides, disabledColorIndexes: [1] });

        const fullResult = await renderSvgJsonToCommands(fullRequest, noopStatus);
        const disabledResult = await renderSvgJsonToCommands(disabledRequest, noopStatus);

        const fullLayers = (fullResult as any).layers;
        const disabledLayers = (disabledResult as any).layers;
        assert.strictEqual(fullLayers.length, 3);
        assert.strictEqual(disabledLayers.length, 2, "expected the disabled (green) layer to be dropped entirely");
        assert.strictEqual(disabledLayers[0].color, "#ffff00");
        assert.strictEqual(disabledLayers[1].color, "#0000ff");

        // Two pen-swaps (c2, c3) become one (c2) - both the raw command
        // stream and the plotting estimate's penSwapCount must agree.
        assert.strictEqual(fullResult.commands.filter((c) => /^c\d+$/.test(c)).length, 2);
        assert.strictEqual(disabledResult.commands.filter((c) => /^c\d+$/.test(c)).length, 1);
        assert.strictEqual((fullResult as any).plotting.penSwapCount, 2);
        assert.strictEqual((disabledResult as any).plotting.penSwapCount, 1);

        // The surviving yellow/blue layers' own drawn geometry is untouched
        // by the green layer's removal (colorOverprint means no knockout
        // interaction could make it depend on green's presence anyway) -
        // extract each layer's command block by its n<index> header and
        // compare byte-for-byte.
        function layerBlock(commands: string[], name: string): string[] {
            const nIndex = commands.findIndex((c) => c.startsWith(`n`) && c.endsWith(` ${name}`));
            assert.ok(nIndex >= 0, `expected an n<index> header for ${name}`);
            // Layer commands run from just after the last n<index> header to
            // the next c<index>/end-of-array boundary. Since header order is
            // d,h,t,n1,n2,[n3], and this test only cares about content
            // between boundaries, locate this layer's own start/end by its
            // position among all c<index> boundaries instead of re-deriving
            // header count.
            const cIndexes = commands.reduce<number[]>((acc, c, i) => {
                if (/^c\d+$/.test(c)) acc.push(i);
                return acc;
            }, []);
            const nHeaderCount = commands.filter((c) => /^n\d+ /.test(c)).length;
            const layerStartsAt = [commands.findIndex((c) => /^n\d+ /.test(c)) + nHeaderCount, ...cIndexes.map((i) => i + 1)];
            const layerEndsAt = [...cIndexes, commands.length];
            const layerNumber = parseInt(commands[nIndex].match(/^n(\d+) /)![1], 10);
            return commands.slice(layerStartsAt[layerNumber - 1], layerEndsAt[layerNumber - 1]);
        }

        const fullYellow = layerBlock(fullResult.commands, "Color 1");
        const disabledYellow = layerBlock(disabledResult.commands, "Color 1");
        assert.deepStrictEqual(disabledYellow, fullYellow, "yellow layer's geometry must be unaffected by disabling green");

        const fullBlue = layerBlock(fullResult.commands, "Color 3");
        const disabledBlue = layerBlock(disabledResult.commands, "Color 2");
        assert.deepStrictEqual(disabledBlue, fullBlue, "blue layer's geometry must be unaffected by disabling green");
    });

    test("disabledColorIndexes: disabling every detected layer degrades gracefully to an empty, well-formed command file", async () => {
        const request = svgToRequest(threeColorSvg, paper, { ...threeColorOverrides, disabledColorIndexes: [0, 1, 2] });
        const result = await renderSvgJsonToCommands(request, noopStatus);

        // No corrupt multi-color shape (no dangling c<index>/n<index> lines,
        // no crash) - just a valid, empty single-color-shaped job.
        assert.ok(!result.commands.some((c) => /^c\d+$/.test(c)));
        assert.ok(!result.commands.some((c) => /^n\d+ /.test(c)));
        assert.strictEqual((result as any).layers, undefined);
        assert.strictEqual(result.distance, 0);
        assert.strictEqual(result.drawDistance, 0);
        assert.match(result.commands[0], /^d0(\.0)?$/);

        const plotting = (result as any).plotting;
        assert.strictEqual(plotting.penSwapCount, 0);
        assert.strictEqual(plotting.drawDistanceMm, 0);
    });

    test("disabledColorIndexes: disabling down to exactly one surviving layer renders it as a plain single-color job (no palette headers, no swaps)", async () => {
        const request = svgToRequest(threeColorSvg, paper, { ...threeColorOverrides, disabledColorIndexes: [0, 2] });
        const result = await renderSvgJsonToCommands(request, noopStatus);

        assert.ok(!result.commands.some((c) => /^c\d+$/.test(c)), "a single surviving layer needs no pen-swap boundary");
        assert.ok(!result.commands.some((c) => /^n\d+ /.test(c)), "a single surviving layer needs no palette header");
        assert.strictEqual((result as any).layers, undefined);
        assert.ok(result.distance > 0, "expected the surviving (green) layer's geometry to still be drawn");
        assert.strictEqual((result as any).plotting.penSwapCount, 0);
    });
}
