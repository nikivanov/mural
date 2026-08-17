/**
 * Tests for src/fillStrategies/streamline.ts's pure streamline-walking
 * helper. No paper.js dependency, plain (x, y) callbacks throughout.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { traceStreamline, streamlineLength } from "../src/fillStrategies/streamline";

const insideBigBox = (x: number, y: number) => x >= -1000 && x <= 1000 && y >= -1000 && y <= 1000;

test("traceStreamline: a constant direction field produces a straight segment of ~maxTotalLength", () => {
    const points = traceStreamline(0, 0, 0, {
        stepSize: 1,
        maxTotalLength: 10,
        maxTurnPerStep: 0.5,
        isInside: insideBigBox,
        directionAt: () => 0, // always pointing along +x
    });

    assert.ok(points.length > 1, "expected multiple points");
    const length = streamlineLength(points);
    assert.ok(Math.abs(length - 10) < 1.5, `expected length near 10, got ${length}`);

    // Every point should lie on y=0 (a perfectly straight horizontal line).
    for (const p of points) {
        assert.ok(Math.abs(p.y) < 1e-6, `expected y=0, got ${p.y}`);
    }
    // Should span roughly symmetric +/-5 around the seed (grown both ways).
    const xs = points.map(p => p.x);
    assert.ok(Math.min(...xs) < -3, "expected growth in the negative direction too");
    assert.ok(Math.max(...xs) > 3, "expected growth in the positive direction");
});

test("traceStreamline: growth stops immediately outside the shape", () => {
    const points = traceStreamline(0, 0, 0, {
        stepSize: 1,
        maxTotalLength: 10,
        maxTurnPerStep: 0.5,
        isInside: (x) => x >= -0.5 && x <= 0.5, // a thin vertical strip
        directionAt: () => 0,
    });

    // Only the seed point itself can be inside; every step in either
    // direction leaves the strip immediately.
    assert.deepStrictEqual(points, [{ x: 0, y: 0 }]);
});

test("traceStreamline: a seed point outside the shape produces no points at all", () => {
    const points = traceStreamline(5, 5, 0, {
        stepSize: 1,
        maxTotalLength: 10,
        maxTurnPerStep: 0.5,
        isInside: (x, y) => x >= -1 && x <= 1 && y >= -1 && y <= 1,
        directionAt: () => 0,
    });
    assert.deepStrictEqual(points, []);
});

test("traceStreamline: undefined directionAt stops growth in that direction without throwing", () => {
    const points = traceStreamline(0, 0, 0, {
        stepSize: 1,
        maxTotalLength: 20,
        maxTurnPerStep: 0.5,
        isInside: insideBigBox,
        directionAt: (x) => (x > 3 ? undefined : 0), // field "runs out" past x=3
    });

    const xs = points.map(p => p.x);
    assert.ok(Math.max(...xs) <= 4, `expected forward growth to stop once past x=3, got max x=${Math.max(...xs)}`);
    assert.ok(Math.min(...xs) < -3, "expected the backward direction to keep growing normally");
});

test("traceStreamline: line-direction ambiguity (theta vs theta+PI) doesn't flip-flop into a zig-zag", () => {
    // The field always reports a direction that's PI/2 away from
    // "straight ahead" in the raw sense, but since a line direction is
    // undirected (theta === theta+PI physically), resolveLineDirection
    // should pick whichever candidate keeps the heading continuous -
    // producing a still-straight line, not an oscillation.
    const points = traceStreamline(0, 0, 0, {
        stepSize: 1,
        maxTotalLength: 10,
        maxTurnPerStep: 0.01, // a near-zero turn budget would expose any flip-flop as truncated growth
        isInside: insideBigBox,
        directionAt: () => Math.PI, // same physical line as angle 0, opposite raw sign
    });

    assert.ok(streamlineLength(points) > 8, `expected the ambiguity-resolved walk to grow nearly the full length despite a tight turn cap, got length ${streamlineLength(points)}`);
});

test("traceStreamline: a smoothly curving field produces a bending (non-collinear) polyline", () => {
    // Direction field is a function of x alone, curving from 0 toward
    // PI/6 as x increases - simulates following a gently curving isophote.
    const points = traceStreamline(0, 0, 0, {
        stepSize: 0.5,
        maxTotalLength: 12,
        maxTurnPerStep: 0.2,
        isInside: insideBigBox,
        directionAt: (x) => Math.min(Math.PI / 6, Math.max(0, x) * 0.05),
    });

    // Forward-grown points (positive x side) should show y increasing
    // (curving away from the initial straight-ahead direction) once x
    // grows enough for the field to bend.
    const farForward = points.filter(p => p.x > 3);
    assert.ok(farForward.length > 0, "expected some far-forward points");
    assert.ok(farForward.some(p => p.y > 0.1), `expected the line to curve upward as it progresses, points: ${JSON.stringify(farForward)}`);
});

test("streamlineLength: sums Euclidean segment lengths", () => {
    const length = streamlineLength([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 4 }]);
    assert.strictEqual(length, 7);
});

test("streamlineLength: a single point (or empty) has zero length", () => {
    assert.strictEqual(streamlineLength([]), 0);
    assert.strictEqual(streamlineLength([{ x: 1, y: 1 }]), 0);
});
