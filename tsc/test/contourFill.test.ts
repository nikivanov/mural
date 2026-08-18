/**
 * Geometric sanity tests for the "contour" fill strategy
 * (src/fillStrategies/contour.ts): repeated inward offsetting of a region's
 * own outline via the `clipper-lib` polygon-offsetting library.
 *
 * This deliberately does NOT use test/testSetup.ts's shim -- it needs the
 * real paper.js geometry engine (bounds, contains, curve flattening), which
 * can only run in Node once `paper` is `require()`-able. In this repo,
 * `require("paper")` only succeeds when the native `canvas` addon has a
 * compiled binary (paper.js 0.12.17 probes canvas support at module-load
 * time). Per the project's setup instructions we may run
 * `npm install --ignore-scripts`, which skips canvas's native build -- so in
 * that configuration this whole suite self-skips with an explanatory
 * message instead of failing, mirroring pipeline.test.ts.
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

if (!paperAvailable) {
    test(`contour fill tests skipped: paper.js unavailable (${(paperLoadResult as { error: Error }).error.message})`, (t) => {
        t.skip("canvas native binary not built; run `npm install` (not --ignore-scripts) to enable");
    });
} else {
    const paper = (paperLoadResult as { paper: typeof import("paper") }).paper;
    // Import after paper is confirmed loadable, and after process.env.server
    // is set, so paperLoader.ts's `loadPaper()` takes the real-paper branch.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { contour } = require("../src/fillStrategies/contour") as typeof import("../src/fillStrategies/contour");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { fillStrategies, defaultFillStrategyName } = require("../src/fillStrategies/registry") as typeof import("../src/fillStrategies/registry");

    function makeContext(size = 500): import("../src/fillStrategies/types").FillContext {
        paper.setup(new paper.Size(size, size));
        const view = paper.project.view;
        const boundsPath = new paper.Path.Rectangle(view.bounds);
        return { view, boundsPath, cache: new Map() };
    }

    // A ring is "sane" if every point on it lies within `maxDist` of the
    // origin shape's own contains()/bounds -- i.e. it didn't escape the
    // region it's supposed to be inset from.
    function assertRingInsideBounds(ring: paper.Path, bounds: paper.Rectangle, label: string) {
        // Allow a small epsilon for flatten/offset round-off.
        const epsilon = 0.5;
        const expanded = bounds.expand(epsilon * 2);
        for (const segment of ring.segments) {
            assert.ok(
                expanded.contains(segment.point),
                `${label}: ring point ${segment.point.toString()} escaped original bounds ${bounds.toString()}`,
            );
        }
    }

    test("registry: contour is registered under 'contour' and is not the default", () => {
        assert.equal(fillStrategies["contour"], contour);
        assert.equal(contour.name, "contour");
        assert.notEqual(defaultFillStrategyName, "contour");
    });

    test("contour fill: spacingMm <= 0 produces no rings (mirrors crossHatch45's density-0 behavior)", () => {
        const ctx = makeContext();
        const circle = new paper.Path.Circle(new paper.Point(100, 100), 50);
        const rings = contour.generateFill(circle, { spacingMm: 0, minInfillLength: 1 }, ctx);
        assert.equal(rings.length, 0);
    });

    test("contour fill: circle produces clean concentric-ish shrinking rings", () => {
        const ctx = makeContext();
        const center = new paper.Point(150, 150);
        const radius = 60;
        const circle = new paper.Path.Circle(center, radius);
        const spacingMm = 8;
        const rings = contour.generateFill(circle, { spacingMm, minInfillLength: 1 }, ctx);

        assert.ok(rings.length > 0, "expected at least one ring");
        // Roughly radius / spacing rings before the circle is consumed.
        assert.ok(rings.length <= Math.ceil(radius / spacingMm) + 2, `too many rings: ${rings.length}`);

        for (const ring of rings) {
            assert.ok(ring.closed, "ring should be a closed path");
            assert.ok(ring.segments.length >= 3, "ring should be a real polygon, not degenerate");
            assertRingInsideBounds(ring, circle.bounds, "circle ring");

            // Concentric-ish: every vertex should be roughly `radius`-ish
            // distance from the center, well inside the original circle,
            // and not collapsed to a point.
            for (const segment of ring.segments) {
                const dist = segment.point.getDistance(center);
                assert.ok(dist < radius + 1, `ring point ${dist} outside original radius ${radius}`);
                assert.ok(dist > 0.5, "ring collapsed to (near-)zero size");
            }
        }

        // Successive rings should shrink (monotonic max-distance-from-center).
        const maxDistances = rings.map(ring =>
            Math.max(...ring.segments.map(s => s.point.getDistance(center))),
        );
        for (let i = 1; i < maxDistances.length; i++) {
            assert.ok(
                maxDistances[i] <= maxDistances[i - 1] + 1,
                `ring ${i} (${maxDistances[i]}) is not smaller than ring ${i - 1} (${maxDistances[i - 1]})`,
            );
        }
    });

    test("contour fill: simple convex polygon (square) produces nested rings inside the square", () => {
        const ctx = makeContext();
        const square = new paper.Path.Rectangle(new paper.Rectangle(50, 50, 100, 100));
        const spacingMm = 10;
        const rings = contour.generateFill(square, { spacingMm, minInfillLength: 1 }, ctx);

        assert.ok(rings.length > 0, "expected at least one ring");
        for (const ring of rings) {
            assert.ok(ring.closed);
            assertRingInsideBounds(ring, square.bounds, "square ring");
        }
    });

    test("contour fill: L-shape (concave, tricky) produces sane non-degenerate rings that respect the notch", () => {
        const ctx = makeContext();
        // An L-shape: a 100x100 square with a 50x50 notch cut out of the
        // top-right corner.
        const lShape = new paper.Path({
            segments: [
                [0, 0], [100, 0], [100, 50], [50, 50], [50, 100], [0, 100],
            ],
            closed: true,
        });
        const spacingMm = 8;
        const rings = contour.generateFill(lShape, { spacingMm, minInfillLength: 1 }, ctx);

        assert.ok(rings.length > 0, "expected at least one ring for the L-shape");
        for (const ring of rings) {
            assert.ok(ring.closed);
            assert.ok(ring.segments.length >= 3, "ring should be non-degenerate");
            assertRingInsideBounds(ring, lShape.bounds, "L-shape ring");

            // The notch corner (50,50)-(100,50)-(100,100)-(50,100) is
            // outside the L; no ring vertex should have strayed into it,
            // which is exactly the kind of garbage a naive offset would
            // produce on a concave shape.
            for (const segment of ring.segments) {
                const p = segment.point;
                const inNotch = p.x > 51 && p.y > 51 && p.x < 99 && p.y < 99;
                assert.ok(!inNotch, `ring point ${p.toString()} strayed into the L-shape's notch`);
            }
        }
    });

    test("contour fill: shape with a hole produces rings that avoid the hole", () => {
        const ctx = makeContext();
        const outer = new paper.Path.Rectangle(new paper.Rectangle(0, 0, 120, 120));
        const hole = new paper.Path.Rectangle(new paper.Rectangle(40, 40, 40, 40));
        hole.reverse(); // opposite winding so the compound path treats it as a hole
        const withHole = new paper.CompoundPath({ children: [outer, hole] });

        const spacingMm = 8;
        const rings = contour.generateFill(withHole, { spacingMm, minInfillLength: 1 }, ctx);

        assert.ok(rings.length > 0, "expected at least one ring for the shape with a hole");
        for (const ring of rings) {
            assert.ok(ring.closed);
            for (const segment of ring.segments) {
                const p = segment.point;
                // Hole interior (with a little margin) should stay empty.
                const inHole = p.x > 42 && p.y > 42 && p.x < 78 && p.y < 78;
                assert.ok(!inHole, `ring point ${p.toString()} strayed into the hole`);
            }
        }
    });

    test("contour fill: ring count is bounded (does not run away) for spacing much smaller than the shape", () => {
        const ctx = makeContext();
        const circle = new paper.Path.Circle(new paper.Point(100, 100), 40);
        // A very fine spacing relative to the shape; should still terminate
        // quickly once the region is consumed, not hit the hard MAX_RINGS
        // safety cap.
        const rings = contour.generateFill(circle, { spacingMm: 0.5, minInfillLength: 0.01 }, ctx);
        assert.ok(rings.length > 0);
        assert.ok(rings.length < 2000, `ring count ${rings.length} suspiciously close to/over the hard cap`);
    });

    test("contour fill: respects minInfillLength by dropping trivially small trailing rings", () => {
        const ctx = makeContext();
        const circle = new paper.Path.Circle(new paper.Point(100, 100), 30);
        const withoutFilter = contour.generateFill(circle, { spacingMm: 5, minInfillLength: 0.01 }, ctx);
        const withFilter = contour.generateFill(circle, { spacingMm: 5, minInfillLength: 1000 }, ctx);
        assert.ok(withFilter.length <= withoutFilter.length);
        assert.equal(withFilter.length, 0, "an unreasonably large minInfillLength should drop every ring");
    });
}
