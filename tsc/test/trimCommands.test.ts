import "./testSetup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { trimCommands } from "../src/trimmer";
import { unroundedCommands } from "./fixtures";

test("trimCommands: rounds coordinates to the default precision (1 decimal)", () => {
    const result = trimCommands(unroundedCommands);
    assert.deepStrictEqual(result, [
        "p0",
        { x: 1.2, y: 2.3 },
        "p1",
        { x: -0.0, y: 10.1 },
        "p0",
    ]);
});

test("trimCommands: rounds coordinates to a custom precision", () => {
    const result = trimCommands(unroundedCommands, 3);
    assert.deepStrictEqual(result, [
        "p0",
        { x: 1.235, y: 2.346 },
        "p1",
        { x: -0.049, y: 10.05 },
        "p0",
    ]);
});

test("trimCommands: rounding to 0 decimals yields integers", () => {
    const result = trimCommands([{ x: 4.6, y: 4.4 }], 0);
    assert.deepStrictEqual(result, [{ x: 5, y: 4 }]);
});

test("trimCommands: leaves string pen/height/distance commands untouched", () => {
    const result = trimCommands(["p0", "p1", "d123.456", "h50"]);
    assert.deepStrictEqual(result, ["p0", "p1", "d123.456", "h50"]);
});

test("trimCommands: does not mutate its input array", () => {
    const input = [...unroundedCommands];
    const copy = JSON.parse(JSON.stringify(input));
    trimCommands(input);
    assert.deepStrictEqual(input, copy);
});
