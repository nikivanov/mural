/**
 * Regression tests for src/geometry/offset.ts's offsetPathItem, the
 * Clipper-backed polygon-offset primitive that flattener.ts's cross-layer
 * knockout uses to grow a darker layer's shape before subtracting it (the
 * trapping gap, docs/multi-color.md section 5 addendum).
 *
 * The specific failure these pin down: offsetPathItem used to reassemble
 * Clipper's solution rings with paper.js boolean ops -- unite() every outer
 * ring, then subtract() every hole from that union. That erases any outer
 * ring nested INSIDE a hole (an island in a lake, Clipper nest depth 3),
 * because the hole gets subtracted from the whole union, island included.
 * Real traced multi-color art hits this: 2 of 4 layers traced from
 * Bluey_Hero.png produced depth-3 solutions, losing up to ~2.9% of their
 * area. The reassembly now hands the rings to a paper.js CompoundPath with
 * holes wound opposite to outers, which expresses arbitrary nesting depth
 * natively under paper's nonzero fill rule.
 *
 * Like contourFill.test.ts (see its header for the full rationale), this
 * needs the REAL paper.js geometry engine rather than testSetup.ts's shim,
 * so it self-skips when the native `canvas` addon has not been built.
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

if ("error" in paperLoadResult) {
    test(`offsetPathItem tests skipped: paper.js unavailable (${paperLoadResult.error.message})`, (t) => {
        t.skip("canvas native binary not built; run `npm install` (not --ignore-scripts) to enable");
    });
} else {
    const paper = paperLoadResult.paper;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { offsetPathItem } = require("../src/geometry/offset") as typeof import("../src/geometry/offset");

    const setupProject = () => {
        paper.setup(new paper.Size(1000, 1000));
    };

    // paper.js encodes a CompoundPath's holes as children wound opposite to
    // its outer contours (nonzero fill rule), and does NOT reorient them for
    // you - so these fixtures set winding explicitly. Without it every ring
    // would wind the same way and the "hole" would just be more solid area,
    // which is a property of the test input, not of offsetPathItem.
    const ring = (x: number, y: number, w: number, h: number, clockwise: boolean) => {
        const r = new paper.Path.Rectangle(new paper.Rectangle(x, y, w, h));
        r.clockwise = clockwise;
        return r;
    };
    const outerRing = (x: number, y: number, w: number, h: number) => ring(x, y, w, h, true);
    const holeRing = (x: number, y: number, w: number, h: number) => ring(x, y, w, h, false);

    test("offsetPathItem keeps an island nested inside a hole (Clipper nest depth 3)", () => {
        setupProject();

        // A 100x100 ring with a 60x60 hole, and a 20x20 island floating in
        // the middle of that hole. Growing by 3mm keeps all three rings
        // well separated (the hole shrinks to 54x54, the island grows to
        // 26x26), so the offset solution is genuinely three levels deep.
        const outer = outerRing(0, 0, 100, 100);
        const hole = holeRing(20, 20, 60, 60);
        const island = outerRing(40, 40, 20, 20);
        const shape = new paper.CompoundPath({ children: [outer, hole, island], insert: false });

        const grown = offsetPathItem(shape, 3);
        assert.ok(grown, "offset of a three-level shape should not be null");

        // The island's own centre is the point the old unite/subtract
        // reassembly lost: it is inside the hole, so subtracting the hole
        // from the union of outers removed it.
        assert.equal(
            grown!.contains(new paper.Point(50, 50)),
            true,
            "the island inside the hole must survive the offset",
        );
        // Sanity: the surrounding lake is still empty, and the grown ring is
        // still solid - i.e. the island did not simply flood the hole.
        assert.equal(grown!.contains(new paper.Point(30, 50)), false, "the hole around the island must stay empty");
        assert.equal(grown!.contains(new paper.Point(10, 50)), true, "the outer ring must stay solid");
    });

    test("offsetPathItem grows a simple ring-with-hole by the requested amount", () => {
        setupProject();

        const shape = new paper.CompoundPath({
            children: [outerRing(0, 0, 100, 100), holeRing(30, 30, 40, 40)],
            insert: false,
        });

        const grown = offsetPathItem(shape, 5);
        assert.ok(grown);

        // Outward offset: the outer boundary moves out by 5mm on every side
        // and the hole closes in by 5mm on every side.
        assert.equal(grown!.contains(new paper.Point(-2, 50)), true, "outer boundary should have grown outward");
        assert.equal(grown!.contains(new paper.Point(-8, 50)), false, "outer boundary should not have grown past the delta");
        assert.equal(grown!.contains(new paper.Point(32, 50)), true, "hole should have shrunk inward");
        assert.equal(grown!.contains(new paper.Point(50, 50)), false, "hole centre should still be empty");
    });

    test("offsetPathItem returns null when a negative offset consumes the shape", () => {
        setupProject();
        assert.equal(offsetPathItem(outerRing(0, 0, 10, 10), -20), null);
    });
}
