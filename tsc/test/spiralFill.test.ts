/**
 * Geometric sanity tests for the spiral fill strategy
 * (src/fillStrategies/spiralFill.ts).
 *
 * Like pipeline.test.ts, this needs the real paper.js geometry engine
 * (path.contains, path.bounds, ...), which can only run in Node once `paper`
 * is `require()`-able - that needs the native `canvas` addon's compiled
 * binary. Per the project's `npm install --ignore-scripts` setup
 * instructions that binary may not exist, so this suite self-skips with an
 * explanatory message instead of failing when `paper` can't be loaded,
 * mirroring pipeline.test.ts exactly.
 */
import { test, before } from "node:test";
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

if (!paperAvailable) {
    test("spiralFill (skipped: paper.js native canvas binding unavailable)", () => {
        assert.ok(true);
    });
} else {
    const paper = (paperLoadResult as { paper: typeof import("paper") }).paper;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { spiralFill } = require("../src/fillStrategies/spiralFill") as typeof import("../src/fillStrategies/spiralFill");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fillStrategies } = require("../src/fillStrategies/registry") as typeof import("../src/fillStrategies/registry");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    type FillContextType = import("../src/fillStrategies/types").FillContext;

    before(() => {
        paper.setup(new paper.Size(1000, 1000));
    });

    function makeContext(): FillContextType {
        const view = paper.project.view;
        return {
            view,
            boundsPath: new paper.Path.Rectangle(view.bounds),
            cache: new Map(),
        };
    }

    function totalLength(paths: paper.Path[]): number {
        return paths.reduce((sum, p) => sum + p.length, 0);
    }

    // Every point of every returned run must lie within `radius` of `center`
    // plus a small tolerance for the finite angular sampling step (a run's
    // endpoint is the last sample point whose *midpoint to the next sample*
    // tested inside - the endpoint itself can overshoot the boundary by at
    // most one sample chord).
    function assertWithinCircle(paths: paper.Path[], center: paper.Point, radius: number, toleranceMm: number) {
        for (const p of paths) {
            for (const segment of p.segments) {
                const d = segment.point.getDistance(center);
                assert.ok(
                    d <= radius + toleranceMm,
                    `point ${segment.point.toString()} at distance ${d} exceeds radius ${radius} + tolerance ${toleranceMm}`,
                );
            }
        }
    }

    function assertWithinBounds(paths: paper.Path[], bounds: paper.Rectangle, toleranceMm: number) {
        const expanded = bounds.expand(toleranceMm * 2);
        for (const p of paths) {
            assert.ok(
                expanded.contains(p.bounds),
                `path bounds ${p.bounds.toString()} escape shape bounds ${bounds.toString()} (expanded ${expanded.toString()})`,
            );
        }
    }

    test("spiral: spacingMm 0 produces no fill (matches crossHatch45's density-0 convention)", () => {
        const circle = new paper.Path.Circle(new paper.Point(500, 500), 100);
        const result = spiralFill.generateFill(circle, { spacingMm: 0, minInfillLength: 1 }, makeContext());
        assert.deepEqual(result, []);
    });

    test("spiral: a circle's fill stays within the circle's radius", () => {
        const center = new paper.Point(500, 500);
        const radius = 120;
        const circle = new paper.Path.Circle(center, radius);
        const spacingMm = 8;
        const result = spiralFill.generateFill(circle, { spacingMm, minInfillLength: 1 }, makeContext());

        assert.ok(result.length > 0, "expected some fill for a circle well larger than spacingMm");
        // Tolerance: one angular sample step's worth of radial travel is a
        // generous, size-independent bound on per-segment overshoot.
        assertWithinCircle(result, center, radius, spacingMm);
    });

    test("spiral: a rectangle's fill stays within the rectangle's bounds", () => {
        const rect = new paper.Path.Rectangle(new paper.Rectangle(300, 300, 200, 150));
        const spacingMm = 10;
        const result = spiralFill.generateFill(rect, { spacingMm, minInfillLength: 1 }, makeContext());

        assert.ok(result.length > 0, "expected some fill for a rectangle well larger than spacingMm");
        assertWithinBounds(result, rect.bounds, spacingMm);
    });

    // Non-convex L-shape: a 200x200 square with a 100x100 notch removed from
    // its top-right corner.
    function makeLShape(): paper.Path {
        return new paper.Path({
            segments: [
                [300, 300], [500, 300], [500, 400], [400, 400], [400, 500], [300, 500],
            ],
            closed: true,
        });
    }

    test("spiral: an L-shape's fill stays within the shape's bounds and avoids the notch", () => {
        const lShape = makeLShape();
        const spacingMm = 8;
        const result = spiralFill.generateFill(lShape, { spacingMm, minInfillLength: 1 }, makeContext());

        assert.ok(result.length > 0, "expected some fill for an L-shape well larger than spacingMm");
        assertWithinBounds(result, lShape.bounds, spacingMm);

        // Every kept micro-segment's midpoint must lie inside the L-shape
        // itself (the exact predicate generateFill clips against) - this
        // directly confirms no fill leaks into the removed notch at
        // [400,300]-[500,400], without needing a hand-approximated notch
        // rectangle (whose margin would otherwise have to guess at the
        // algorithm's per-sample boundary tolerance).
        for (const p of result) {
            for (let i = 0; i < p.segments.length - 1; i++) {
                const mid = p.segments[i].point.add(p.segments[i + 1].point).divide(2);
                assert.ok(lShape.contains(mid), `segment midpoint ${mid.toString()} falls outside the L-shape`);
            }
        }
    });

    test("spiral: tighter spacing produces measurably more total ink length (coverage-vs-spacing)", () => {
        const center = new paper.Point(500, 500);
        const radius = 150;

        const looseCircle = new paper.Path.Circle(center, radius);
        const looseResult = spiralFill.generateFill(looseCircle, { spacingMm: 20, minInfillLength: 1 }, makeContext());

        const tightCircle = new paper.Path.Circle(center, radius);
        const tightResult = spiralFill.generateFill(tightCircle, { spacingMm: 4, minInfillLength: 1 }, makeContext());

        const looseLength = totalLength(looseResult);
        const tightLength = totalLength(tightResult);

        assert.ok(looseLength > 0, "loose spacing should still produce some fill");
        // Halving spacing should roughly double coverage length for a fixed
        // area (same reasoning as infill.ts's cross-hatch coverage comment);
        // 20mm -> 4mm is a 5x spacing reduction, so require a healthy,
        // non-trivial increase rather than pinning an exact ratio.
        assert.ok(
            tightLength > looseLength * 3,
            `expected tight spacing (${tightLength}) to noticeably exceed loose spacing (${looseLength})`,
        );
    });

    test("spiral: a convex region (circle) fills as a single continuous stroke - one pen-down, one pen-up", () => {
        const center = new paper.Point(500, 500);
        const circle = new paper.Path.Circle(center, 150);
        const result = spiralFill.generateFill(circle, { spacingMm: 10, minInfillLength: 1 }, makeContext());

        assert.equal(result.length, 1, `expected exactly one continuous run for a convex circle, got ${result.length}`);
    });

    test("spiral: a non-convex region (L-shape) fragments into multiple runs, unlike a convex one", () => {
        const lShape = makeLShape();
        const result = spiralFill.generateFill(lShape, { spacingMm: 8, minInfillLength: 1 }, makeContext());

        assert.ok(
            result.length > 1,
            `expected the notch to split the spiral into multiple runs, got ${result.length}`,
        );
    });

    test("spiral: registered under the name 'spiral' in the strategy registry", () => {
        assert.equal(spiralFill.name, "spiral");
        assert.equal(fillStrategies["spiral"], spiralFill);
    });
}
