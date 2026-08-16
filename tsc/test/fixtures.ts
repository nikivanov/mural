import "./testSetup";
import assert from "node:assert/strict";
import { Command, CoordinateCommand } from "../src/types";

/** A well-formed single stroke: pen up, move, pen down, draw, pen up. */
export const simpleValidCommands: Command[] = [
    "p0",
    { x: 0, y: 0 },
    "p1",
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    "p0",
];

/** Two strokes, separated by a pen-up travel move. */
export const twoStrokeCommands: Command[] = [
    "p0",
    { x: 0, y: 0 },
    "p1",
    { x: 5, y: 0 },
    { x: 5, y: 5 },
    "p0",
    { x: 20, y: 20 },
    "p1",
    { x: 25, y: 20 },
    "p0",
];

/**
 * A redundant pen-down blip: pen is already down, goes up then immediately
 * back down at the same logical point. dedupeCommands should collapse this
 * away entirely without throwing, since the pen state before and after the
 * blip is consistent (down).
 */
export const redundantPenToggleCommands: Command[] = [
    "p1",
    { x: 0, y: 0 },
    "p0",
    "p1",
    { x: 1, y: 1 },
    "p0",
];

/**
 * Physically inconsistent: the pen is told to lift ("p0") twice in a row
 * with no intervening "p1" (pen-down) -- i.e. it was never put down between
 * the two lifts, so raising it a second time is inconsistent bookkeeping.
 * dedupeCommands' internal consistency check must throw on this.
 *
 * Traced against dedupeCommands' logic: the two 'p0' markers survive the
 * consecutive-duplicate pass (a coordinate command sits between them), so
 * when the following 'p1' is scanned, dedupeCommands walks backward looking
 * for the last pen command before it, finds the first 'p0' instead of a
 * 'p1', and throws "Inconsistent pen movement".
 */
export const inconsistentPenCommands: Command[] = [
    "p0",
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    "p0",
    "p1",
];

/** Consecutive duplicate coordinates that should be collapsed to one. */
export const duplicatePointCommands: Command[] = [
    "p1",
    { x: 1, y: 1 },
    { x: 1, y: 1 },
    { x: 1, y: 1 },
    { x: 2, y: 2 },
    "p0",
];

/** Unrounded coordinates for trimCommands precision tests. */
export const unroundedCommands: Command[] = [
    "p0",
    { x: 1.23456, y: 2.34567 },
    "p1",
    { x: -0.049, y: 10.05 },
    "p0",
];

export function coordinatesOf(commands: Command[]): CoordinateCommand[] {
    return commands.filter((c): c is CoordinateCommand => typeof c !== "string");
}

export function assertCoordinatesInBounds(commands: Command[], width: number, height: number) {
    for (const coord of coordinatesOf(commands)) {
        assert.ok(
            coord.x >= 0 && coord.x <= width,
            `x=${coord.x} out of [0, ${width}]`,
        );
        assert.ok(
            coord.y >= 0 && coord.y <= height,
            `y=${coord.y} out of [0, ${height}]`,
        );
    }
}

/** Asserts p0/p1 pen markers strictly alternate, ignoring all other commands. */
export function assertPenStatesAlternate(commands: Command[]) {
    let lastPenState: "p0" | "p1" | null = null;
    for (const command of commands) {
        if (command === "p0" || command === "p1") {
            assert.notStrictEqual(
                command,
                lastPenState,
                `pen state repeated ("${command}" seen twice in a row, ignoring non-pen commands)`,
            );
            lastPenState = command;
        }
    }
}
