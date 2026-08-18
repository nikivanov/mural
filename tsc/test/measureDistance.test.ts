import "./testSetup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { measureDistance } from "../src/measurer";
import { Command } from "../src/types";
import { duplicatePointCommands, simpleValidCommands, twoStrokeCommands } from "./fixtures";

/** Recomputes total/draw distance independently, without reusing measurer.ts. */
function recomputeDistances(commands: Command[]) {
    let totalDistance = 0;
    let drawDistance = 0;
    let penUp = true;
    let last: { x: number; y: number } | null = null;

    for (const command of commands) {
        if (typeof command === "string") {
            if (command === "p0") penUp = true;
            else if (command === "p1") penUp = false;
            continue;
        }
        if (last) {
            const d = Math.hypot(command.x - last.x, command.y - last.y);
            totalDistance += d;
            if (!penUp) drawDistance += d;
        }
        last = command;
    }

    return { totalDistance, drawDistance };
}

test("measureDistance: matches an independent recomputation for a single stroke", () => {
    const expected = recomputeDistances(simpleValidCommands);
    const actual = measureDistance(simpleValidCommands);
    assert.ok(Math.abs(actual.totalDistance - expected.totalDistance) < 1e-9);
    assert.ok(Math.abs(actual.drawDistance - expected.drawDistance) < 1e-9);
});

test("measureDistance: matches an independent recomputation for multiple strokes", () => {
    const expected = recomputeDistances(twoStrokeCommands);
    const actual = measureDistance(twoStrokeCommands);
    assert.ok(Math.abs(actual.totalDistance - expected.totalDistance) < 1e-9);
    assert.ok(Math.abs(actual.drawDistance - expected.drawDistance) < 1e-9);
});

test("measureDistance: drawDistance never exceeds totalDistance", () => {
    for (const commands of [simpleValidCommands, twoStrokeCommands, duplicatePointCommands]) {
        const { totalDistance, drawDistance } = measureDistance(commands);
        assert.ok(drawDistance <= totalDistance + 1e-9, `drawDistance ${drawDistance} > totalDistance ${totalDistance}`);
    }
});

test("measureDistance: an all pen-up travel produces zero draw distance", () => {
    const commands: Command[] = ["p0", { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    const { totalDistance, drawDistance } = measureDistance(commands);
    assert.strictEqual(drawDistance, 0);
    assert.ok(totalDistance > 0);
});

test("measureDistance: known 3-4-5 triangle distance", () => {
    const commands: Command[] = ["p0", { x: 0, y: 0 }, "p1", { x: 3, y: 4 }];
    const { totalDistance, drawDistance } = measureDistance(commands);
    assert.ok(Math.abs(totalDistance - 5) < 1e-9);
    assert.ok(Math.abs(drawDistance - 5) < 1e-9);
});

test("measureDistance: repeated identical points contribute no distance", () => {
    const commands: Command[] = ["p1", { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }];
    const { totalDistance, drawDistance } = measureDistance(commands);
    assert.strictEqual(totalDistance, 0);
    assert.strictEqual(drawDistance, 0);
});

// measureDistance's loop deliberately starts at index 1 (`for (let i = 1; ...)`),
// so element 0 is never inspected -- it's designed to be called with an
// `h<height>` header already unshifted onto the front, as toCommands.ts does.
// Document that behaviour explicitly so a future refactor of the header
// convention doesn't silently change what gets measured.
test("measureDistance: ignores element 0, treating it as a header slot", () => {
    const withRealHeader: Command[] = ["h500", "p1", { x: 0, y: 0 }, { x: 3, y: 4 }];
    const withCoordInSlotZero: Command[] = [{ x: 0, y: 0 }, "p1", { x: 0, y: 0 }, { x: 3, y: 4 }];
    assert.deepStrictEqual(measureDistance(withRealHeader), measureDistance(withCoordInSlotZero));
});
