import "./testSetup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceBetweenPoints, distanceBetweenPointsSquared, getLastPoint } from "../src/utils";
import { Command } from "../src/types";

test("getLastPoint: finds the most recent coordinate, skipping string commands", () => {
    const commands: Command[] = ["p0", { x: 1, y: 1 }, "p1", { x: 2, y: 2 }, "p0"];
    assert.deepStrictEqual(getLastPoint(commands), { x: 2, y: 2 });
});

test("getLastPoint: returns undefined when there are no coordinates", () => {
    const commands: Command[] = ["p0", "p1", "p0"];
    assert.strictEqual(getLastPoint(commands), undefined);
});

test("getLastPoint: returns undefined for an empty list", () => {
    assert.strictEqual(getLastPoint([]), undefined);
});

test("distanceBetweenPoints: computes Euclidean distance", () => {
    assert.strictEqual(distanceBetweenPoints({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test("distanceBetweenPoints: is symmetric", () => {
    const a = { x: 1, y: 7 };
    const b = { x: -4, y: 2 };
    assert.strictEqual(distanceBetweenPoints(a, b), distanceBetweenPoints(b, a));
});

test("distanceBetweenPoints: zero for identical points", () => {
    const p = { x: 5, y: 5 };
    assert.strictEqual(distanceBetweenPoints(p, p), 0);
});

test("distanceBetweenPointsSquared: is the square of distanceBetweenPoints", () => {
    const a = { x: 0, y: 0 };
    const b = { x: 3, y: 4 };
    assert.strictEqual(distanceBetweenPointsSquared(a, b), Math.pow(distanceBetweenPoints(a, b), 2));
});
