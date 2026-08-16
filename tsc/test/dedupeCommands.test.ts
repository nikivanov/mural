import "./testSetup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeCommands } from "../src/deduplicator";
import {
    assertPenStatesAlternate,
    duplicatePointCommands,
    inconsistentPenCommands,
    redundantPenToggleCommands,
    simpleValidCommands,
    twoStrokeCommands,
} from "./fixtures";

test("dedupeCommands: does not throw on a well-formed single stroke", () => {
    const result = dedupeCommands(simpleValidCommands);
    assertPenStatesAlternate(result);
});

test("dedupeCommands: does not throw on multiple well-formed strokes", () => {
    const result = dedupeCommands(twoStrokeCommands);
    assertPenStatesAlternate(result);
});

test("dedupeCommands: throws on a crafted pen-state inconsistency", () => {
    assert.throws(
        () => dedupeCommands(inconsistentPenCommands),
        /Inconsistent pen movement/,
    );
});

test("dedupeCommands: collapses a redundant pen-up/pen-down blip without throwing", () => {
    const result = dedupeCommands(redundantPenToggleCommands);
    assertPenStatesAlternate(result);
    // the blip carried no net pen-state change, so no 'p0'/'p1' markers
    // should remain for it at all -- only the trailing 'p0' does.
    const penMarkers = result.filter((c) => c === "p0" || c === "p1");
    assert.deepStrictEqual(penMarkers, ["p1", "p0"]);
});

test("dedupeCommands: removes consecutive duplicate coordinates", () => {
    const result = dedupeCommands(duplicatePointCommands);
    const coordCount = result.filter((c) => typeof c !== "string").length;
    // {1,1} x3 -> collapses to a single point, plus the distinct {2,2}
    assert.strictEqual(coordCount, 2);
    assert.deepStrictEqual(result, ["p1", { x: 1, y: 1 }, { x: 2, y: 2 }, "p0"]);
});

test("dedupeCommands: leaves an already-clean command list unchanged", () => {
    const input = ["p0", { x: 0, y: 0 }, "p1", { x: 3, y: 4 }, "p0"] as const;
    const result = dedupeCommands([...input]);
    assert.deepStrictEqual(result, [...input]);
});

test("dedupeCommands: does not mutate its input array", () => {
    const input = [...duplicatePointCommands];
    const copy = JSON.parse(JSON.stringify(input));
    dedupeCommands(input);
    assert.deepStrictEqual(input, copy);
});
