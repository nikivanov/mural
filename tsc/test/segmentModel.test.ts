import "./testSetup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { projectSegmentCounts, spacingMmForDensity, INFILL_DENSITY_TO_SPACING_MM } from "../src/segmentModel";
import { FILL_STRATEGY_NAMES } from "../src/fillStrategyNames";

test("projectSegmentCounts: denser infill (smaller spacing) produces more infill segments", () => {
    const sparse = projectSegmentCounts({ shapeCount: 10, avgShapeSpanMm: 50, fillStrategy: "crossHatch45", infillDensity: 1 });
    const dense = projectSegmentCounts({ shapeCount: 10, avgShapeSpanMm: 50, fillStrategy: "crossHatch45", infillDensity: 7 });
    assert.ok(dense.infillSegmentCount > sparse.infillSegmentCount);
});

test("projectSegmentCounts: density 0 produces zero infill segments regardless of strategy", () => {
    for (const strategy of FILL_STRATEGY_NAMES) {
        const projection = projectSegmentCounts({ shapeCount: 20, avgShapeSpanMm: 80, fillStrategy: strategy, infillDensity: 0 });
        assert.equal(projection.infillSegmentCount, 0, `strategy ${strategy} should produce no infill at density 0`);
        assert.equal(projection.totalDrawSegments, projection.shapeCount);
    }
});

test("projectSegmentCounts: more shapes produces proportionally more segments", () => {
    const few = projectSegmentCounts({ shapeCount: 5, avgShapeSpanMm: 40, fillStrategy: "crossHatch45", infillDensity: 4 });
    const many = projectSegmentCounts({ shapeCount: 50, avgShapeSpanMm: 40, fillStrategy: "crossHatch45", infillDensity: 4 });
    assert.ok(many.totalDrawSegments > few.totalDrawSegments);
});

test("projectSegmentCounts: gradientHatch produces dramatically more, shorter segments than spiral fill at the same density", () => {
    const gradient = projectSegmentCounts({ shapeCount: 5, avgShapeSpanMm: 60, fillStrategy: "gradientHatch", infillDensity: 5 });
    const spiral = projectSegmentCounts({ shapeCount: 5, avgShapeSpanMm: 60, fillStrategy: "spiral", infillDensity: 5 });

    assert.ok(
        gradient.infillSegmentCount > spiral.infillSegmentCount * 5,
        `expected gradientHatch (${gradient.infillSegmentCount}) to produce far more segments than spiral (${spiral.infillSegmentCount})`,
    );
    assert.ok(gradient.avgInfillSegmentLengthMm < spiral.avgInfillSegmentLengthMm);
});

test("projectSegmentCounts: crossHatch45 produces roughly double singleDirectionHatch's line count at the same spacing", () => {
    const cross = projectSegmentCounts({ shapeCount: 8, avgShapeSpanMm: 60, fillStrategy: "crossHatch45", infillDensity: 3 });
    const single = projectSegmentCounts({ shapeCount: 8, avgShapeSpanMm: 60, fillStrategy: "singleDirectionHatch", infillDensity: 3 });
    const ratio = cross.infillSegmentCount / single.infillSegmentCount;
    assert.ok(ratio > 1.5 && ratio < 2.5, `expected ~2x, got ${ratio}`);
});

test("spacingMmForDensity: matches the documented density->spacing ladder and is monotonically decreasing", () => {
    assert.equal(spacingMmForDensity(0), 0);
    const densities: (1 | 2 | 3 | 4 | 5 | 6 | 7)[] = [1, 2, 3, 4, 5, 6, 7];
    for (let i = 1; i < densities.length; i++) {
        assert.ok(spacingMmForDensity(densities[i]) < spacingMmForDensity(densities[i - 1]), "higher density must mean tighter (smaller) spacing");
    }
    assert.equal(Object.keys(INFILL_DENSITY_TO_SPACING_MM).length, 8);
});
