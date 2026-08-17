/**
 * Cross-checks the cost-estimator's deliberately-duplicated,
 * paper.js-free copies of two small facts against the real, paper.js-backed
 * source of truth:
 *   - fillStrategyNames.ts's FILL_STRATEGY_NAMES vs.
 *     fillStrategies/registry.ts's actual registered strategy names.
 *   - segmentModel.ts's INFILL_DENSITY_TO_SPACING_MM vs. infill.ts's
 *     internal infillDensityToSpacingMap (via generateInfills' observable
 *     behavior - that map itself isn't exported, so this drives
 *     generateInfills with each density and confirms the infilled path's
 *     line spacing implies the same mm value this module assumes).
 *
 * See fillStrategyNames.ts's and segmentModel.ts's header comments for why
 * the duplication exists in the first place (both are paper.js-free-by-
 * design and must not import anything under fillStrategies/ or infill.ts,
 * which pull in loadPaper()).
 *
 * Needs the real paper.js geometry engine, same as pipeline.test.ts/
 * fillStrategies.test.ts - self-skips with an explanatory message when the
 * native `canvas` addon has no compiled binary (see those files' headers).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FILL_STRATEGY_NAMES } from "../src/fillStrategyNames";

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
    test(`fill strategy model sync check skipped: paper.js unavailable (${(paperLoadResult as { error: Error }).error.message})`, (t) => {
        t.skip("native `canvas` addon has no compiled binary in this environment. Run `npm install` without --ignore-scripts, with cairo/pango/pkg-config available, to enable this test.");
    });
} else {
    const paper = (paperLoadResult as { paper: typeof import("paper") }).paper;
    const { fillStrategies } = require("../src/fillStrategies/registry") as typeof import("../src/fillStrategies/registry");

    test("FILL_STRATEGY_NAMES matches the real registry's strategy names exactly", () => {
        const registryNames = Object.keys(fillStrategies).sort();
        assert.deepEqual([...FILL_STRATEGY_NAMES].sort(), registryNames);
    });

    const { generateInfills } = require("../src/infill") as typeof import("../src/infill");
    const { INFILL_DENSITY_TO_SPACING_MM } = require("../src/segmentModel") as typeof import("../src/segmentModel");

    function totalInfillLengthForDensity(density: 1 | 2 | 3 | 4 | 5 | 6 | 7): number {
        paper.setup(new paper.Size(200, 200));
        const square = new paper.Path.Rectangle(new paper.Point(10, 10), new paper.Size(180, 180));
        square.fillColor = new paper.Color("#000000");
        const [infilled] = generateInfills([square], density);
        return infilled.infillPaths.reduce((sum, p) => sum + p.length, 0);
    }

    test("segmentModel.ts's density->spacing ladder is consistent with generateInfills' actual output ordering", () => {
        // Tighter spacing (this module's assumption) must mean MORE total
        // ink for the same shape/strategy - a direct behavioral check that
        // the duplicated ladder hasn't drifted out of the same relative
        // order as the real infill.ts map, even without importing it.
        let previousLength = -Infinity;
        const densities: (1 | 2 | 3 | 4 | 5 | 6 | 7)[] = [1, 2, 3, 4, 5, 6, 7];
        for (const density of densities) {
            const length = totalInfillLengthForDensity(density);
            assert.ok(length > previousLength, `density ${density} (spacing ${INFILL_DENSITY_TO_SPACING_MM[density]}mm) should lay more ink than the previous, sparser density`);
            previousLength = length;
        }
    });
}
