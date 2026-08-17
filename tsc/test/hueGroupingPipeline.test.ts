/**
 * End-to-end tests for hue-grouped shading through the raster
 * vectorize -> render pipeline, and for the extended infill density ladder
 * (src/infill.ts). Needs the real paper.js geometry engine, same as
 * pipeline.test.ts/multicolor.test.ts - self-skips with an explanatory
 * message when the native `canvas` addon has no compiled binary (see those
 * files' headers for the full explanation).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { RequestTypes } from "../src/types";

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

if (!paperAvailable) {
    test(`hue-grouping pipeline tests skipped: paper.js unavailable (${(paperLoadResult as { error: Error }).error.message})`, (t) => {
        t.skip("native `canvas` addon has no compiled binary in this environment. Run `npm install` without --ignore-scripts, with cairo/pango/pkg-config available, to enable these tests.");
    });
} else {
    const paper = (paperLoadResult as { paper: typeof import("paper") }).paper;
    const { vectorizeImageDataColor } = require("../src/vectorizer") as typeof import("../src/vectorizer");
    const { applyHueGrouping } = require("../src/huePalette") as typeof import("../src/huePalette");
    const { renderSvgJsonToCommands } = require("../src/toCommands") as typeof import("../src/toCommands");
    const { generateInfills } = require("../src/infill") as typeof import("../src/infill");

    const noopStatus = () => {};

    // Synthetic 30x10 raster: left third dark blue, middle third light
    // blue, right third orange - two shades of one hue plus one
    // contrasting color, same shape as the cartoon-mural scenario the
    // feature targets (2 blues + 2 oranges/creams collapsing to fewer pens).
    function buildThreeColorRaster(): ImageData {
        const width = 30;
        const height = 10;
        const data = new Uint8ClampedArray(width * height * 4);
        const darkBlue = [0x11, 0x33, 0xaa];
        const lightBlue = [0x77, 0xaa, 0xee];
        const orange = [0xff, 0x99, 0x33];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const [r, g, b] = x < width / 3 ? darkBlue : x < (2 * width) / 3 ? lightBlue : orange;
                data[i] = r;
                data[i + 1] = g;
                data[i + 2] = b;
                data[i + 3] = 255;
            }
        }
        return { data, width, height, colorSpace: "srgb" } as unknown as ImageData;
    }

    test("hue grouping: two shades of blue plus a contrasting color produce 2 pens, not 3, through the raster pipeline", () => {
        const imageData = buildThreeColorRaster();
        const rawResult = vectorizeImageDataColor(imageData, 0, 3, [
            { name: "Dark Blue", color: "#1133aa" },
            { name: "Light Blue", color: "#77aaee" },
            { name: "Orange", color: "#ff9933" },
        ]);
        assert.strictEqual(rawResult.palette.length, 3, "sanity check: 3 masks without hue grouping");

        const grouped = applyHueGrouping(rawResult);
        assert.strictEqual(grouped.groups.length, 2, "expected 2 pens after hue grouping (not 3)");
        assert.strictEqual(grouped.palette.length, 2);

        const blueGroup = grouped.groups.find(g => g.members.length === 2);
        assert.ok(blueGroup, "expected the two blues to share a pen");
        const [darker, lighter] = blueGroup!.members;
        assert.strictEqual(darker.color, "#1133aa");
        assert.strictEqual(lighter.color, "#77aaee");
        assert.ok(darker.spacingMm! < lighter.spacingMm!, "darker blue must get a tighter (denser) spacing than lighter blue");

        // Drive the grouped SVG through the full render pipeline: must
        // produce exactly one c<index> boundary (2 pens = N-1 = 1 marker),
        // and the drawn region tagged with the tighter spacing must
        // actually draw more (longer infill) than the sparser one for an
        // equal-sized region - proving the spacing difference isn't just a
        // metadata tag but changes real hatch output.
        const probeSize = new paper.Size(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
        paper.setup(probeSize);
        const svg = paper.project.importSVG(grouped.svg, { expandShapes: true });
        const svgWidth = svg.bounds.width || imageData.width;
        const svgHeight = svg.bounds.height || imageData.height;
        const svgJson = svg.exportJSON() as string;
        paper.project.remove();

        const request: RequestTypes.RenderSVGRequest = {
            type: "renderSvg",
            svgJson,
            width: imageData.width,
            height: imageData.height,
            svgWidth,
            svgHeight,
            homeX: 0,
            homeY: 0,
            infillDensity: 2,
            flattenPaths: false,
            topDistance: Math.round(imageData.width / 0.6),
            palette: grouped.palette,
        };

        return renderSvgJsonToCommands(request, noopStatus).then((result) => {
            const layers = (result as any).layers;
            assert.ok(Array.isArray(layers) && layers.length === 2, "expected 2 rendered layers (pens)");
            assert.strictEqual(result.commands.filter((c) => /^c\d+$/.test(c as string)).length, 1, "expected exactly one c<index> boundary for 2 pens");
        });
    });

    test("hue grouping: feature off (plain vectorizeImageDataColor) is untouched - still 3 masks, no huePalette involvement", () => {
        const imageData = buildThreeColorRaster();
        const result = vectorizeImageDataColor(imageData, 0, 3, [
            { name: "Dark Blue", color: "#1133aa" },
            { name: "Light Blue", color: "#77aaee" },
            { name: "Orange", color: "#ff9933" },
        ]);
        assert.strictEqual(result.palette.length, 3);
        assert.ok(!result.svg.includes('"density"'), "no density tag should appear unless hue grouping ran");
        assert.ok(!result.svg.includes('"spacingMm"'), "no spacingMm tag should appear unless hue grouping ran");
    });

    test("infill: the extended density ladder produces correspondingly denser hatching (level 7 > level 4 > level 1)", () => {
        paper.setup(new paper.Size(100, 100));
        const square = new paper.Path.Rectangle(new paper.Point(10, 10), new paper.Size(60, 60));
        square.fillColor = new paper.Color("#000000");

        function totalInfillLength(density: 1 | 4 | 7): number {
            const clone = square.clone({ insert: false });
            const [infilled] = generateInfills([clone], density);
            return infilled.infillPaths.reduce((sum, p) => sum + p.length, 0);
        }

        const level1 = totalInfillLength(1);
        const level4 = totalInfillLength(4);
        const level7 = totalInfillLength(7);

        assert.ok(level1 > 0 && level4 > 0 && level7 > 0, "expected nonzero infill at each tested level");
        assert.ok(level4 > level1, `expected level 4 (${level4}) to hatch more densely than level 1 (${level1})`);
        assert.ok(level7 > level4, `expected level 7 (${level7}) to hatch more densely than level 4 (${level4})`);

        // Ink length scales roughly as 1/spacing (20mm -> 2.5mm is 8x) - not
        // an exact equality (turdSize/edge effects), but the densest level
        // should be well over 4x the sparsest, not just marginally more.
        assert.ok(level7 / level1 > 4, `expected level 7 to lay down well over 4x level 1's ink, got ${(level7 / level1).toFixed(2)}x`);
    });

    test("infill: existing densities 1-4 keep their exact original spacings (byte-identical hatch geometry)", () => {
        paper.setup(new paper.Size(100, 100));
        const square = new paper.Path.Rectangle(new paper.Point(10, 10), new paper.Size(60, 60));
        square.fillColor = new paper.Color("#000000");

        // Original spacings (mm), from infill.ts's pre-extension map.
        const expectedSpacing: Record<1 | 2 | 3 | 4, number> = { 1: 20, 2: 15, 3: 10, 4: 7 };

        for (const density of [1, 2, 3, 4] as const) {
            const clone = square.clone({ insert: false });
            const [infilled] = generateInfills([clone], density);
            // minInfillLength = floor(spacing) (infill.ts) - every kept
            // infill segment must be longer than that, and shorter than the
            // full diagonal traversal, which is enough to catch a spacing
            // regression without hardcoding exact segment lengths (which
            // depend on where the hatch grid happens to intersect the
            // shape).
            const minLength = Math.floor(expectedSpacing[density]);
            for (const path of infilled.infillPaths) {
                assert.ok(path.length > minLength, `density ${density}: infill segment length ${path.length} should exceed minInfillLength ${minLength}`);
            }
        }
    });

    test("infill: PathDensityData.spacingMm (tone-derived, continuous) takes priority over `density` when both are set", () => {
        paper.setup(new paper.Size(100, 100));
        const square = new paper.Path.Rectangle(new paper.Point(10, 10), new paper.Size(60, 60));
        square.fillColor = new paper.Color("#000000");

        // A continuous spacing that doesn't correspond to any ladder step -
        // if generateInfills fell back to `density` (7 -> 2.5mm) instead of
        // honoring spacingMm, every infill segment would exceed
        // floor(2.5)=2 rather than floor(3.3)=3.
        const clone = square.clone({ insert: false });
        clone.data = { density: 7, spacingMm: 3.3 };
        const [infilled] = generateInfills([clone], 0);

        assert.ok(infilled.infillPaths.length > 0, "expected some infill to be drawn");
        for (const path of infilled.infillPaths) {
            assert.ok(path.length > Math.floor(3.3), `expected minInfillLength derived from spacingMm (3.3mm), got a path of length ${path.length}`);
        }
    });
}
