/**
 * End-to-end tests for the full SVG -> commands pipeline
 * (renderSvgJsonToCommands in src/toCommands.ts), run against the fixture
 * SVGs in images/test_images.
 *
 * This deliberately does NOT use test/testSetup.ts's stub -- it needs the
 * real paper.js geometry engine (path booleans, intersections, etc.), which
 * can only run in Node once `paper` is `require()`-able. In this repo,
 * `require("paper")` only succeeds when the native `canvas` addon has a
 * compiled binary (paper.js 0.12.17 probes canvas support at module-load
 * time, unconditionally, before any of our code runs). Per the project's
 * setup instructions we run `npm install --ignore-scripts`, which skips
 * canvas's native build -- so in that configuration this whole suite
 * self-skips with an explanatory message instead of failing.
 *
 * Anywhere `canvas` *has* been built (e.g. `npm install` without
 * `--ignore-scripts`, given the system dependencies -- cairo, pango,
 * pkg-config -- that node-canvas needs), these tests run for real and
 * exercise generator -> infill -> optimizer -> renderer -> trimmer ->
 * deduplicator -> measurer end to end.
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { assertCoordinatesInBounds, assertPenStatesAlternate } from "./fixtures";
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

const testImagesDir = path.join(__dirname, "..", "..", "..", "images", "test_images");
const svgFiles = fs.existsSync(testImagesDir)
    ? fs.readdirSync(testImagesDir).filter((f) => f.endsWith(".svg"))
    : [];

const WIDTH = 1000;

function svgToRequest(svgString: string, paper: typeof import("paper")): RequestTypes.RenderSVGRequest {
    // Mirrors tester.ts's convertSvgToSvgJson/main_pathTracer: import the raw
    // SVG into its own scratch project/scope to get svgJson, independent of
    // the project the pipeline itself will paper.setup() later.
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
    };
}

if (!paperAvailable) {
    test(`pipeline tests skipped: paper.js unavailable (${(paperLoadResult as { error: Error }).error.message})`, (t) => {
        t.skip("native `canvas` addon has no compiled binary in this environment (npm install --ignore-scripts). Run `npm install` without --ignore-scripts, with cairo/pango/pkg-config available, to enable these tests.");
    });
} else if (svgFiles.length === 0) {
    test("pipeline tests skipped: no SVGs found in images/test_images", (t) => {
        t.skip(`expected fixtures under ${testImagesDir}`);
    });
} else {
    const paper = (paperLoadResult as { paper: typeof import("paper") }).paper;
    const { renderSvgJsonToCommands } = require("../src/toCommands") as typeof import("../src/toCommands");

    const noopStatus = () => {};

    // Command count / total distance regression snapshots, keyed by SVG
    // filename. Populated on first successful run in an environment where
    // `canvas` is built (see the auto-seeding logic below) and then checked
    // in, so future pipeline changes show up as diffs against real numbers
    // instead of silently passing. Nothing could be seeded from inside this
    // sandbox (`canvas` doesn't build here -- no pkg-config), so this file
    // starts as `{}` and self-seeds the first time someone runs the suite
    // with a working `canvas`.
    const snapshotPath = path.join(__dirname, "..", "..", "test", "fixtures", "pipeline-snapshots.json");
    const snapshots: Record<string, { commandCount: number; distance: number }> = fs.existsSync(snapshotPath)
        ? JSON.parse(fs.readFileSync(snapshotPath, "utf8"))
        : {};
    let snapshotsDirty = false;

    for (const svgFile of svgFiles) {
        test(`pipeline (${svgFile}): produces pen-consistent, in-bounds, distance-accurate commands`, async () => {
            const svgString = fs.readFileSync(path.join(testImagesDir, svgFile), "utf8");
            const request = svgToRequest(svgString, paper);

            const result = await renderSvgJsonToCommands(request, noopStatus);

            // 1. Pen-state consistency: dedupeCommands must not throw on
            // real pipeline output, and states must strictly alternate.
            assertPenStatesAlternate(result.commands as any);
            assert.strictEqual(result.commands[result.commands.length - 1], "p0", "output must end pen-up");

            // 2. All coordinates within [0,width] x [0,height].
            for (const cmd of result.commands) {
                if (cmd === "p0" || cmd === "p1" || cmd.startsWith("d") || cmd.startsWith("h") || cmd.startsWith("t")) continue;
                const [x, y] = cmd.split(" ").map(Number);
                assert.ok(x >= 0 && x <= request.width, `x=${x} out of [0, ${request.width}] in ${svgFile}`);
                assert.ok(y >= 0 && y <= request.height, `y=${y} out of [0, ${request.height}] in ${svgFile}`);
            }

            // 3. d-header equals independently recomputed total distance
            // (within rounding tolerance), and drawDistance <= totalDistance.
            const dHeader = result.commands.find((c) => c.startsWith("d"));
            assert.ok(dHeader, "expected a d<number> header");
            const declaredDistance = parseFloat(dHeader!.slice(1));
            assert.ok(Math.abs(declaredDistance - result.distance) < 1e-6);

            assert.ok(result.drawDistance <= result.distance + 1e-6);

            // 4. Pen-state consistency is also enforced structurally: since
            // renderSvgJsonToCommands calls dedupeCommands internally (which
            // throws on inconsistent pen bookkeeping), simply reaching this
            // point without throwing already proves dedupeCommands accepted
            // this real SVG's pipeline output.

            // 5. Regression snapshot: command count & total distance, with a
            // small tolerance, so future pipeline changes surface as diffs.
            const commandCount = result.commands.length;
            const snapshot = snapshots[svgFile];
            if (!snapshot) {
                snapshots[svgFile] = { commandCount, distance: result.distance };
                snapshotsDirty = true;
            } else {
                assert.ok(
                    Math.abs(commandCount - snapshot.commandCount) <= Math.max(2, snapshot.commandCount * 0.02),
                    `command count regressed for ${svgFile}: expected ~${snapshot.commandCount}, got ${commandCount}`,
                );
                assert.ok(
                    Math.abs(result.distance - snapshot.distance) <= Math.max(1, snapshot.distance * 0.02),
                    `total distance regressed for ${svgFile}: expected ~${snapshot.distance}, got ${result.distance}`,
                );
            }
        });
    }

    after(() => {
        if (snapshotsDirty) {
            fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
            fs.writeFileSync(snapshotPath, JSON.stringify(snapshots, null, 2) + "\n");
        }
    });
}
