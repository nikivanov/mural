/**
 * Class-level coverage for a recurring bug shape (see the three fixed
 * instances below): "internal machinery auto-stamps per-path metadata and
 * silently clobbers a user's request-level setting." The per-path override
 * mechanism itself (PathDensityData in src/types.ts: density, spacingMm,
 * outline, colorIndex, fillMethod, hatchAngleDegrees) is intentional and
 * correct - per-path always wins over the request-level default. The bug is
 * internal code WRITING that per-path metadata for ITS OWN purposes and, in
 * doing so, silently discarding what the user explicitly asked for at the
 * request level. Output stays valid (nothing throws), so this class of bug
 * is invisible to every test that only checks "did it crash" / "is the
 * output well-formed".
 *
 * Three real instances, all fixed before this file was written:
 *   1. assignHatchAnglesPerColorGroup (generator.ts) used to stamp
 *      fillMethod:'crossHatchAngled' onto every path in a multi-color
 *      render unconditionally, discarding any request-level fillMethod
 *      (spiral/contour/gradientHatch all silently became crossHatchAngled).
 *   2. Hue-grouped shading (huePalette.ts) used to assign spacingMm by RANK
 *      across a fixed ladder instead of from measured tone.
 *   3. Per-layer enable/disable used to filter disabled color groups BEFORE
 *      assignHatchAnglesPerColorGroup ran, so toggling one layer changed the
 *      hatch angles of the OTHER, still-enabled layers (toCommands.ts).
 *
 * This file does not re-litigate those three fixes in detail (multicolor.
 * test.ts and hueGroupingPipeline.test.ts already do, with tight regression
 * tests). Instead it covers the CLASS, driven from a declared table of
 * request options, so an option added later that forgets this rule fails
 * here even if nobody thought to write a bespoke regression test for it.
 *
 * Structure:
 *   PART A - every user-controllable option actually takes effect, in both
 *            single-color and multi-color RenderSVGRequest mode.
 *   PART B - an explicitly-requested value is never silently replaced;
 *            observed directly on path metadata (not just via output
 *            diffing), by calling the internal stamping functions
 *            (assignHatchAnglesPerColorGroup, generateInfills) directly.
 *   PART C - cross-option independence: one option's value must not depend
 *            on what some unrelated option is set to.
 *   PART D - VectorizeRequest-level options (turdSize, grayscaleLevels,
 *            colorCount, hueGrouping, nibWidthMm, inkMultiplier) live on a
 *            different request type that produces the SVG a RenderSVGRequest
 *            later consumes, so they're exercised directly against
 *            vectorizer.ts/huePalette.ts (same pattern hueGroupingPipeline.
 *            test.ts already uses) rather than through renderSvgJsonToCommands.
 *
 * FOR FUTURE CONTRIBUTORS ADDING A REQUEST OPTION: add one row to the
 * relevant OPTION_TABLE below (RENDER_SVG_OPTION_TABLE for RenderSVGRequest
 * fields, or a new PART D-style direct test for a VectorizeRequest field).
 * That's the only required step - the runner loops over the table. If the
 * option genuinely has no effect in one of the two RenderSVGRequest modes,
 * set expectChange:false and fill in `reason` explaining why; don't just
 * omit the row.
 *
 * Uses the same paper.js availability probe/self-skip pattern as
 * multicolor.test.ts/pipeline.test.ts (native `canvas` addon needs a
 * compiled binary - `npm install` without --ignore-scripts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
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

if (!paperAvailable) {
    test(`requestOptionIntegrity tests skipped: paper.js unavailable (${(paperLoadResult as { error: Error }).error.message})`, (t) => {
        t.skip("native `canvas` addon has no compiled binary in this environment. Run `npm install` without --ignore-scripts, with cairo/pango/pkg-config available, to enable these tests.");
    });
} else {
    const paper = (paperLoadResult as { paper: typeof import("paper") }).paper;
    const { renderSvgJsonToCommands } = require("../src/toCommands") as typeof import("../src/toCommands");
    const { assignHatchAnglesPerColorGroup } = require("../src/generator") as typeof import("../src/generator");
    const { generateInfills } = require("../src/infill") as typeof import("../src/infill");
    const {
        vectorizeImageData,
        vectorizeImageDataColor,
        vectorizeImageDataGrayscale,
    } = require("../src/vectorizer") as typeof import("../src/vectorizer");
    const { applyHueGrouping, computeToneSpacingMm } = require("../src/huePalette") as typeof import("../src/huePalette");

    const noopStatus = () => {};

    // ------------------------------------------------------------------
    // Shared SVG -> RenderSVGRequest helper, matching multicolor.test.ts's
    // svgToRequest exactly (same probe-size import, same default fields) so
    // fixtures/results are directly comparable with that file's.
    // ------------------------------------------------------------------
    function svgToRequest(
        svgString: string,
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

    async function renderCommands(svg: string, overrides: Partial<RequestTypes.RenderSVGRequest>): Promise<string[]> {
        const request = svgToRequest(svg, overrides);
        const result = await renderSvgJsonToCommands(request, noopStatus);
        return result.commands as string[];
    }

    // ------------------------------------------------------------------
    // Fixtures
    // ------------------------------------------------------------------

    // Single literal color, one shape - the plain single-color path.
    const singleColorSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="120" height="60" fill="#000000"/>
    </svg>`;

    // Two overlapping same-color shapes, so flattenPaths' intra-layer
    // knockout (draw-order-dependent subtraction) has something to do.
    const overlappingSingleColorSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="60" height="60" fill="#000000"/>
        <rect x="40" y="30" width="60" height="60" fill="#000000"/>
    </svg>`;

    // Two well-separated literal colors (yellow lighter than blue), same
    // shape multicolor.test.ts uses - light-to-dark order is deterministic.
    const twoColorSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="5" width="60" height="60" fill="#ffff00"/>
        <rect x="120" y="5" width="60" height="60" fill="#0000ff"/>
    </svg>`;

    // Same two colors, but the yellow layer is made of two OVERLAPPING
    // yellow rects, so flattenPaths has intra-layer geometry to knock out
    // within a single multi-color layer (as opposed to across layers).
    const overlappingTwoColorSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="5" width="40" height="40" fill="#ffff00"/>
        <rect x="25" y="25" width="40" height="40" fill="#ffff00"/>
        <rect x="150" y="5" width="40" height="40" fill="#0000ff"/>
    </svg>`;

    // Two colors sharing an edge (adjoining, not separated) - the case
    // where colorOverprint/knockoutGapMm actually have geometry to act on.
    const adjoiningColorsSvg = `<svg width="${WIDTH}" height="20" xmlns="http://www.w3.org/2000/svg">
        <rect x="0" y="0" width="30" height="20" fill="#ffff00"/>
        <rect x="30" y="0" width="30" height="20" fill="#0000ff"/>
    </svg>`;
    const adjoiningFrameOverrides = { svgWidth: WIDTH, svgHeight: 20, height: 20 };

    // Three well-separated colors in strict light-to-dark order, for
    // disabledColorIndexes (needs >= 3 layers so disabling one still leaves
    // a genuine multi-color render behind, matching multicolor.test.ts's
    // fixture shape).
    const threeColorSvg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
        <rect x="5" y="5" width="20" height="20" fill="#ffff00"/>
        <rect x="90" y="5" width="20" height="20" fill="#00ff00"/>
        <rect x="175" y="5" width="20" height="20" fill="#0000ff"/>
    </svg>`;

    // ==================================================================
    // PART A - every user-controllable option actually takes effect.
    // ==================================================================
    //
    // Table-driven so a future option only needs a new row. Each row
    // renders the SAME svg fixture twice (default vs. varied overrides,
    // layered on top of any `base` overrides needed to reach the code path
    // being tested at all - e.g. colorSeparation:true to reach the
    // multi-color renderer) and asserts the command output either changes
    // (expectChange:true) or is byte-identical, with an explicit documented
    // `reason` (expectChange:false) - never a silent skip.
    type OptionCase = {
        name: string;
        svg: string;
        base?: Partial<RequestTypes.RenderSVGRequest>;
        defaultOverrides: Partial<RequestTypes.RenderSVGRequest>;
        variedOverrides: Partial<RequestTypes.RenderSVGRequest>;
        expectChange: boolean;
        reason: string;
    };

    // --- Single-color mode: colorSeparation is off (or the SVG never
    // produces >= 2 surviving layers), so renderSvgJsonToCommands takes the
    // plain single-color path in toCommands.ts, not renderMultiColor. ---
    const SINGLE_COLOR_OPTION_TABLE: OptionCase[] = [
        {
            name: "fillMethod",
            svg: singleColorSvg,
            defaultOverrides: {},
            variedOverrides: { fillMethod: "spiral" },
            expectChange: true,
            reason: "infill.ts's generateInfills reads the request-level fillMethod for any path without its own override",
        },
        {
            name: "infillDensity",
            svg: singleColorSvg,
            defaultOverrides: { infillDensity: 2 },
            variedOverrides: { infillDensity: 4 },
            expectChange: true,
            reason: "denser hatching produces more/longer infill lines",
        },
        {
            name: "flattenPaths",
            svg: overlappingSingleColorSvg,
            defaultOverrides: { flattenPaths: false },
            variedOverrides: { flattenPaths: true },
            expectChange: true,
            reason: "with two overlapping same-color shapes, intra-layer knockout changes which geometry is actually hatched",
        },
        {
            name: "colorOverprint",
            svg: singleColorSvg,
            defaultOverrides: { colorOverprint: false },
            variedOverrides: { colorOverprint: true },
            expectChange: false,
            reason: "colorOverprint only affects the multi-color cross-layer knockout branch (toCommands.ts's renderMultiColor); a single-color request never reaches it",
        },
        {
            name: "knockoutGapMm",
            svg: singleColorSvg,
            defaultOverrides: { knockoutGapMm: 0 },
            variedOverrides: { knockoutGapMm: 5 },
            expectChange: false,
            reason: "knockoutGapMm only matters to the multi-color cross-layer trapping pass; a single-color request never reaches it",
        },
        {
            name: "disabledColorIndexes",
            svg: singleColorSvg,
            defaultOverrides: {},
            variedOverrides: { disabledColorIndexes: [0] },
            expectChange: false,
            reason: "types.ts: \"Ignored for single-color requests (no detected/requested color separation)\"",
        },
    ];

    // --- Multi-color mode: colorSeparation:true on a fixture with >= 2
    // surviving layers, so renderSvgJsonToCommands takes renderMultiColor -
    // the exact branch every one of the three known bugs lived in. ---
    const MULTI_COLOR_OPTION_TABLE: OptionCase[] = [
        {
            name: "fillMethod",
            svg: twoColorSvg,
            base: { colorSeparation: true },
            defaultOverrides: {},
            variedOverrides: { fillMethod: "spiral" },
            expectChange: true,
            reason: "regression coverage for bug #1: assignHatchAnglesPerColorGroup must not stamp over an explicit request-level strategy",
        },
        {
            name: "infillDensity",
            svg: twoColorSvg,
            base: { colorSeparation: true },
            defaultOverrides: { infillDensity: 2 },
            variedOverrides: { infillDensity: 4 },
            expectChange: true,
            reason: "denser hatching per layer produces more/longer infill lines",
        },
        {
            name: "flattenPaths",
            svg: overlappingTwoColorSvg,
            base: { colorSeparation: true },
            defaultOverrides: { flattenPaths: false },
            variedOverrides: { flattenPaths: true },
            expectChange: true,
            reason: "the yellow layer's two overlapping rects give intra-layer knockout geometry to act on",
        },
        {
            name: "colorOverprint",
            svg: adjoiningColorsSvg,
            base: { colorSeparation: true, ...adjoiningFrameOverrides },
            defaultOverrides: { colorOverprint: false },
            variedOverrides: { colorOverprint: true },
            expectChange: true,
            reason: "toggles whether the darker layer knocks out the lighter layer's overlapping geometry at all",
        },
        {
            name: "knockoutGapMm",
            svg: adjoiningColorsSvg,
            base: { colorSeparation: true, ...adjoiningFrameOverrides },
            defaultOverrides: { knockoutGapMm: 0 },
            variedOverrides: { knockoutGapMm: 3 },
            expectChange: true,
            reason: "a nonzero gap retreats the lighter layer's boundary from the shared edge",
        },
        {
            name: "disabledColorIndexes",
            svg: threeColorSvg,
            base: { colorSeparation: true, colorOverprint: true },
            defaultOverrides: {},
            variedOverrides: { disabledColorIndexes: [1] },
            expectChange: true,
            reason: "drops a whole layer's geometry and its pen-swap boundary",
        },
    ];

    function registerOptionCases(modeLabel: string, cases: OptionCase[]) {
        for (const c of cases) {
            test(`option integrity (${modeLabel}): ${c.name} ${c.expectChange ? "changes" : "has no effect (documented)"} rendered output`, async () => {
                const base = c.base || {};
                const defaultCmds = await renderCommands(c.svg, { ...base, ...c.defaultOverrides });
                const variedCmds = await renderCommands(c.svg, { ...base, ...c.variedOverrides });
                if (c.expectChange) {
                    assert.notDeepStrictEqual(
                        variedCmds,
                        defaultCmds,
                        `expected ${c.name} to change output in ${modeLabel} mode - ${c.reason}`,
                    );
                } else {
                    assert.deepStrictEqual(
                        variedCmds,
                        defaultCmds,
                        `expected ${c.name} to have NO effect in ${modeLabel} mode - ${c.reason} (if this now fails, either the documented reason is stale or a bug just made this option do something in a mode it shouldn't)`,
                    );
                }
            });
        }
    }

    registerOptionCases("single-color", SINGLE_COLOR_OPTION_TABLE);
    registerOptionCases("multi-color", MULTI_COLOR_OPTION_TABLE);

    // colorSeparation itself: flips which of the two tables' code paths
    // runs at all, so it's tested standalone rather than folded into either
    // table above (varying it necessarily changes "mode").
    test("option integrity: colorSeparation itself changes output on a multi-literal-color SVG", async () => {
        const off = await renderCommands(twoColorSvg, { colorSeparation: false });
        const on = await renderCommands(twoColorSvg, { colorSeparation: true });
        assert.notDeepStrictEqual(on, off, "colorSeparation should turn on literal-color layer grouping");
        // And the layers field itself is the clearest signal.
        const onRequest = svgToRequest(twoColorSvg, { colorSeparation: true });
        const onResult = await renderSvgJsonToCommands(onRequest, noopStatus);
        assert.ok(Array.isArray((onResult as any).layers) && (onResult as any).layers.length === 2);
    });

    // ==================================================================
    // PART B - an explicitly-requested value must never be silently
    // replaced. Observed directly on path/group metadata (the actual
    // mechanism the three known bugs broke), not just by diffing rendered
    // output - a metadata-level assertion pinpoints exactly which stage
    // would be responsible for a future regression.
    // ==================================================================

    test("PART B / fillMethod & hatchAngleDegrees: assignHatchAnglesPerColorGroup never overwrites an already-set per-path override, regardless of the request-level default", () => {
        paper.setup(new paper.Size(50, 50));
        const pathWithOverride = new paper.Path.Rectangle(new paper.Point(0, 0), new paper.Size(10, 10));
        (pathWithOverride as any).data = { fillMethod: "gradientHatch", hatchAngleDegrees: 12 };
        const pathWithoutOverride = new paper.Path.Rectangle(new paper.Point(20, 0), new paper.Size(10, 10));

        const colorGroups = [
            { colorIndex: 0, color: new paper.Color("#ffff00"), paths: [pathWithOverride] },
            { colorIndex: 1, color: new paper.Color("#0000ff"), paths: [pathWithoutOverride] },
        ];

        // Called with the request-level default undefined (which normally
        // substitutes crossHatchAngled onto un-overridden paths) - the
        // already-set override must survive untouched either way.
        assignHatchAnglesPerColorGroup(colorGroups as any, undefined);

        assert.strictEqual((pathWithOverride as any).data.fillMethod, "gradientHatch", "explicit per-path fillMethod must survive angle assignment");
        assert.strictEqual((pathWithOverride as any).data.hatchAngleDegrees, 12, "explicit per-path angle must survive angle assignment");

        // Sanity: the function actually ran and did substitute for the
        // un-overridden path, so the assertions above are proving something
        // (not passing vacuously because nothing happened at all).
        assert.strictEqual((pathWithoutOverride as any).data.fillMethod, "crossHatchAngled");
        assert.notStrictEqual((pathWithoutOverride as any).data.hatchAngleDegrees, undefined);
    });

    test("PART B / fillMethod: assignHatchAnglesPerColorGroup leaves fillMethod unset (letting the request-level strategy flow through) whenever the request specified a non-default strategy", () => {
        paper.setup(new paper.Size(50, 50));
        const plainPathA = new paper.Path.Rectangle(new paper.Point(0, 0), new paper.Size(10, 10));
        const plainPathB = new paper.Path.Rectangle(new paper.Point(20, 0), new paper.Size(10, 10));

        const colorGroups = [
            { colorIndex: 0, color: new paper.Color("#ffff00"), paths: [plainPathA] },
            { colorIndex: 1, color: new paper.Color("#0000ff"), paths: [plainPathB] },
        ];

        assignHatchAnglesPerColorGroup(colorGroups as any, "spiral");

        assert.strictEqual((plainPathA as any).data.fillMethod, undefined, "an explicit request-level fillMethod must not be clobbered by a stamped crossHatchAngled (this is exactly bug #1)");
        assert.strictEqual((plainPathB as any).data.fillMethod, undefined);
        // Angle assignment itself is independent of the fillMethod decision
        // - it still runs (harmlessly ignored by strategies, like spiral,
        // that don't read it).
        assert.notStrictEqual((plainPathA as any).data.hatchAngleDegrees, undefined);
    });

    test("PART B / density & spacingMm: generateInfills honours an explicit per-path override over the request-level infillDensity, and falls back to the request-level value for paths without one", () => {
        paper.setup(new paper.Size(100, 100));

        const overridden = new paper.Path.Rectangle(new paper.Point(10, 10), new paper.Size(60, 60));
        overridden.fillColor = new paper.Color("#000000");
        (overridden as any).data = { density: 7 }; // 2.5mm spacing - much denser than request-level 1 (20mm)

        const plain = new paper.Path.Rectangle(new paper.Point(10, 10), new paper.Size(60, 60));
        plain.fillColor = new paper.Color("#000000");
        // no per-path override: must fall through to the request-level infillDensity (1, sparse)

        const [infilledOverridden] = generateInfills([overridden], 1);
        const [infilledPlain] = generateInfills([plain], 1);

        const totalLength = (infilled: { infillPaths: paper.Path[] }) =>
            infilled.infillPaths.reduce((sum, p) => sum + p.length, 0);

        assert.ok(totalLength(infilledOverridden) > totalLength(infilledPlain),
            "the per-path density:7 override should lay far more ink than the request-level infillDensity:1 default it overrides");
    });

    test("PART B / outline: generateInfills honours an explicit per-path outline:false, and defaults to including the outline when unset", () => {
        paper.setup(new paper.Size(100, 100));

        const suppressed = new paper.Path.Rectangle(new paper.Point(10, 10), new paper.Size(30, 30));
        suppressed.fillColor = new paper.Color("#000000");
        (suppressed as any).data = { outline: false };

        const plain = new paper.Path.Rectangle(new paper.Point(10, 10), new paper.Size(30, 30));
        plain.fillColor = new paper.Color("#000000");

        const [infilledSuppressed] = generateInfills([suppressed], 2);
        const [infilledPlain] = generateInfills([plain], 2);

        assert.strictEqual(infilledSuppressed.outlinePaths.length, 0, "outline:false must suppress the outline pass");
        assert.ok(infilledPlain.outlinePaths.length > 0, "outline unset must default to including the outline (pre-existing behavior)");
    });

    // ==================================================================
    // PART C - cross-option independence: changing one option must not
    // perturb another option's effect.
    // ==================================================================

    test("PART C: an explicit per-path fillMethod override baked into the source SVG is unaffected by changing the request-level fillMethod", async () => {
        const svgWithBakedOverride = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="10" width="120" height="60" fill="#000000" data-paper-data='{"fillMethod":"contour"}'/>
        </svg>`;

        const withDefaultRequestFillMethod = await renderCommands(svgWithBakedOverride, {});
        const withSpiralRequestFillMethod = await renderCommands(svgWithBakedOverride, { fillMethod: "spiral" });

        assert.deepStrictEqual(
            withSpiralRequestFillMethod,
            withDefaultRequestFillMethod,
            "the only path in this render already carries its own fillMethod override, so the request-level fillMethod must be completely irrelevant to its output",
        );
    });

    test("PART C: disabling a color layer does not perturb the surviving layers' geometry even when an explicit angle-aware request-level fillMethod is set", async () => {
        // Combines two options at once (disabledColorIndexes + an explicit
        // fillMethod that is itself angle-aware, so assignHatchAnglesPerColorGroup
        // does NOT substitute a fillMethod but still assigns per-layer
        // angles) - the exact combination bug #3 lived in, generalized to a
        // case not covered by multicolor.test.ts's own (fillMethod-unset)
        // version of this test.
        const base: Partial<RequestTypes.RenderSVGRequest> = {
            colorSeparation: true,
            colorOverprint: true,
            fillMethod: "crossHatchAngled",
        };
        const fullRequest = svgToRequest(threeColorSvg, base);
        const disabledRequest = svgToRequest(threeColorSvg, { ...base, disabledColorIndexes: [1] });

        const fullResult = await renderSvgJsonToCommands(fullRequest, noopStatus);
        const disabledResult = await renderSvgJsonToCommands(disabledRequest, noopStatus);

        function layerBlock(commands: string[], name: string): string[] {
            const nIndex = commands.findIndex((c) => c.startsWith("n") && c.endsWith(` ${name}`));
            assert.ok(nIndex >= 0, `expected an n<index> header for ${name}`);
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

        const fullYellow = layerBlock(fullResult.commands as string[], "Color 1");
        const disabledYellow = layerBlock(disabledResult.commands as string[], "Color 1");
        assert.deepStrictEqual(disabledYellow, fullYellow, "yellow layer's geometry/angle must be unaffected by disabling green, even with an explicit angle-aware fillMethod");

        const fullBlue = layerBlock(fullResult.commands as string[], "Color 3");
        const disabledBlue = layerBlock(disabledResult.commands as string[], "Color 2");
        assert.deepStrictEqual(disabledBlue, fullBlue, "blue layer's geometry/angle must be unaffected by disabling green, even with an explicit angle-aware fillMethod");
    });

    // ==================================================================
    // PART D - VectorizeRequest-level options. These live on a different
    // request type (they run BEFORE a RenderSVGRequest exists at all - see
    // main.ts's `vectorize()`, a worker message handler not easily called
    // directly from a test) so they're exercised against the underlying
    // vectorizer.ts/huePalette.ts functions main.ts calls, matching the
    // pattern hueGroupingPipeline.test.ts already established.
    //
    // "Single-color vs multi-color mode" doesn't map cleanly onto this
    // group: grayscaleLevels is inherently a single-color tonal mode
    // (mutually exclusive with colorCount in main.ts's vectorize()), while
    // colorCount/hueGrouping/nibWidthMm/inkMultiplier are inherently
    // multi-color-only (hueGrouping/nibWidthMm/inkMultiplier are explicitly
    // documented in types.ts as "Ignored unless hueGrouping is also set",
    // and hueGrouping/colorCount only exist to collapse or produce multiple
    // color layers in the first place). turdSize is the one option that
    // genuinely applies to both the single-mask and color-mask tracers, so
    // it's tested in both.
    // ==================================================================

    function buildRasterWithIsolatedSpeck(width: number, height: number, speckSize: number): ImageData {
        const data = new Uint8ClampedArray(width * height * 4);
        const setPixel = (x: number, y: number) => {
            const i = (y * width + x) * 4;
            data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
        };
        // A solid main square, well clear of the speck.
        for (let y = 2; y < height - 2; y++) {
            for (let x = 2; x < Math.floor(width / 2) - 2; x++) {
                setPixel(x, y);
            }
        }
        // A tiny isolated speck in the opposite corner, small enough to be
        // dropped once turdSize exceeds its area.
        for (let y = 0; y < speckSize; y++) {
            for (let x = 0; x < speckSize; x++) {
                setPixel(width - 1 - x, height - 1 - y);
            }
        }
        return { data, width, height, colorSpace: "srgb" } as unknown as ImageData;
    }

    function subpathCount(svg: string): number {
        const pathMatch = svg.match(/<path[^>]*\/>/);
        assert.ok(pathMatch, "expected a traced <path> element");
        const dMatch = pathMatch![0].match(/ d="([^"]*)"/);
        assert.ok(dMatch, "expected a d attribute on the traced path");
        return (dMatch![1].match(/M/g) || []).length;
    }

    test("PART D / turdSize (single-mask): a large turdSize despeckles a small isolated region that a turdSize of 0 keeps", () => {
        const raster = buildRasterWithIsolatedSpeck(40, 40, 2); // 2x2 speck, area 4
        const kept = vectorizeImageData(raster, 0);
        const despeckled = vectorizeImageData(raster, 10); // area 4 <= turdSize 10

        assert.notStrictEqual(despeckled, kept, "turdSize should change the traced SVG");
        assert.ok(subpathCount(despeckled) < subpathCount(kept), "the despeckled trace should have fewer subpaths (the speck's own subpath dropped)");
    });

    test("PART D / turdSize (color-mask): a large turdSize despeckles a small isolated region within one color mask", () => {
        const raster = buildRasterWithIsolatedSpeck(40, 40, 2);
        const paletteArg = [{ name: "Ink", color: "#000000" }];
        const kept = vectorizeImageDataColor(raster, 0, 1, paletteArg);
        const despeckled = vectorizeImageDataColor(raster, 10, 1, paletteArg);

        assert.notStrictEqual(despeckled.svg, kept.svg, "turdSize should change the traced color-mask SVG");
        assert.ok(subpathCount(despeckled.svg) < subpathCount(kept.svg), "the despeckled color-mask trace should have fewer subpaths");
    });

    test("PART D / grayscaleLevels: the number of traced tonal levels matches the requested level count", () => {
        const width = 20, height = 20;
        const data = new Uint8ClampedArray(width * height * 4);
        // A simple vertical gradient (dark at top, light at bottom) so every
        // threshold level has genuinely different content to trace.
        for (let y = 0; y < height; y++) {
            const gray = Math.floor((y / (height - 1)) * 255);
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                data[i] = gray; data[i + 1] = gray; data[i + 2] = gray; data[i + 3] = 255;
            }
        }
        const raster = { data, width, height, colorSpace: "srgb" } as unknown as ImageData;

        const threeLevels = vectorizeImageDataGrayscale(raster, 0, 3);
        const fourLevels = vectorizeImageDataGrayscale(raster, 0, 4);

        assert.strictEqual(threeLevels.length, 3);
        assert.strictEqual(fourLevels.length, 4, "grayscaleLevels must control how many tonal bands are actually traced");
    });

    test("PART D / colorCount: k-means clustering produces (up to) the requested number of palette entries", () => {
        const width = 30, height = 10;
        const data = new Uint8ClampedArray(width * height * 4);
        const colors = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const [r, g, b] = colors[Math.floor((x / width) * 3)];
                data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
            }
        }
        const raster = { data, width, height, colorSpace: "srgb" } as unknown as ImageData;

        const twoColors = vectorizeImageDataColor(raster, 0, 2);
        const threeColors = vectorizeImageDataColor(raster, 0, 3);

        assert.strictEqual(twoColors.palette.length, 2, "colorCount:2 should cluster down to 2 palette entries");
        assert.strictEqual(threeColors.palette.length, 3, "colorCount:3 should keep 3 distinct palette entries given 3 well-separated source colors");
    });

    test("PART D / hueGrouping: turns on hue-proximity collapsing that plain colorCount/palette separation never does", () => {
        const width = 30, height = 10;
        const data = new Uint8ClampedArray(width * height * 4);
        const darkBlue = [0x11, 0x33, 0xaa];
        const lightBlue = [0x77, 0xaa, 0xee];
        const orange = [0xff, 0x99, 0x33];
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = (y * width + x) * 4;
                const [r, g, b] = x < width / 3 ? darkBlue : x < (2 * width) / 3 ? lightBlue : orange;
                data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
            }
        }
        const raster = { data, width, height, colorSpace: "srgb" } as unknown as ImageData;

        const raw = vectorizeImageDataColor(raster, 0, 3, [
            { name: "Dark Blue", color: "#1133aa" },
            { name: "Light Blue", color: "#77aaee" },
            { name: "Orange", color: "#ff9933" },
        ]);
        assert.strictEqual(raw.palette.length, 3, "sanity check: hueGrouping off keeps all 3 detected colors as separate pens");

        const grouped = applyHueGrouping(raw);
        assert.strictEqual(grouped.palette.length, 2, "hueGrouping:true should collapse the two blues onto one pen");
    });

    test("PART D / nibWidthMm: changes the tone-derived hatch spacing for hue-grouped shading", () => {
        // Fixed target/pen luminance pair (not hue-grouping-specific
        // plumbing) isolates nibWidthMm's own effect on the spacing formula
        // from any of applyHueGrouping's clustering logic.
        const narrowNib = computeToneSpacingMm(0.5, 0.1, { nibWidthMm: 0.8 });
        const wideNib = computeToneSpacingMm(0.5, 0.1, { nibWidthMm: 2.4 });
        assert.notStrictEqual(narrowNib, wideNib, "nibWidthMm should change computed hatch spacing");
        assert.ok(wideNib > narrowNib, "a wider nib should require wider spacing for the same coverage");
    });

    test("PART D / inkMultiplier: changes the tone-derived hatch spacing for hue-grouped shading", () => {
        const neutral = computeToneSpacingMm(0.5, 0.1, { inkMultiplier: 1.0 });
        const heavier = computeToneSpacingMm(0.5, 0.1, { inkMultiplier: 2.0 });
        assert.notStrictEqual(neutral, heavier, "inkMultiplier should change computed hatch spacing");
        assert.ok(heavier < neutral, "a higher ink multiplier implies more coverage per pass, so spacing should tighten");
    });
}
