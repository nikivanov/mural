import "./testSetup";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    estimatePlottingSeconds,
    estimatePlottingSecondsFromCommands,
    computePenTransitionSeconds,
    stepsPerSecondToMmPerSecond,
    CURRENT_FIRMWARE_SPEEDS,
    POST_PEN_UP_SPEED_CHANGE_FIRMWARE_SPEEDS,
    PRINT_SPEED_STEPS_PER_S,
    MOVE_SPEED_STEPS_PER_S,
} from "../src/plottingEstimator";
import { Command } from "../src/types";

test("estimatePlottingSeconds: more pen transitions costs more time, dominated by lift cost for many-short-segment jobs", () => {
    const fewLifts = estimatePlottingSeconds({ drawDistanceMm: 1000, travelDistanceMm: 200, penTransitionCount: 4 });
    const manyLifts = estimatePlottingSeconds({ drawDistanceMm: 1000, travelDistanceMm: 200, penTransitionCount: 400 });

    assert.ok(manyLifts.totalSeconds > fewLifts.totalSeconds);
    // With identical draw/travel distance, essentially the entire
    // difference should be attributable to pen-lift time - this is the
    // "stippling-like output is pathological" case the task calls out.
    const deltaSeconds = manyLifts.totalSeconds - fewLifts.totalSeconds;
    const deltaLiftSeconds = manyLifts.penLiftSeconds - fewLifts.penLiftSeconds;
    assert.ok(Math.abs(deltaSeconds - deltaLiftSeconds) < 1e-9);
});

test("estimatePlottingSeconds: a job with many short disconnected segments costs far more than a few long ones covering the same ink length", () => {
    // Same total ink (draw distance), same total travel - only the number
    // of separate segments (and therefore pen lifts) differs.
    const fewLongSegments = estimatePlottingSeconds({ drawDistanceMm: 5000, travelDistanceMm: 1000, penTransitionCount: 10 });
    const manyShortSegments = estimatePlottingSeconds({ drawDistanceMm: 5000, travelDistanceMm: 1000, penTransitionCount: 2000 });

    assert.ok(manyShortSegments.totalSeconds > fewLongSegments.totalSeconds * 5, "pen-lift cost should dominate a many-short-segment job");
});

test("estimatePlottingSeconds: draw and travel distance both scale time up", () => {
    const base = estimatePlottingSeconds({ drawDistanceMm: 1000, travelDistanceMm: 500, penTransitionCount: 10 });
    const moreDraw = estimatePlottingSeconds({ drawDistanceMm: 5000, travelDistanceMm: 500, penTransitionCount: 10 });
    const moreTravel = estimatePlottingSeconds({ drawDistanceMm: 1000, travelDistanceMm: 5000, penTransitionCount: 10 });

    assert.ok(moreDraw.drawSeconds > base.drawSeconds);
    assert.ok(moreTravel.travelSeconds > base.travelSeconds);
});

test("estimatePlottingSeconds: pen swap pauses are reported separately from automated machine time", () => {
    const noSwaps = estimatePlottingSeconds({ drawDistanceMm: 1000, travelDistanceMm: 500, penTransitionCount: 10, penSwapCount: 0 });
    const withSwaps = estimatePlottingSeconds({ drawDistanceMm: 1000, travelDistanceMm: 500, penTransitionCount: 10, penSwapCount: 3 });

    assert.equal(noSwaps.automatedSeconds, withSwaps.automatedSeconds, "pen swap pauses must not be folded into automated (unattended machine) time");
    assert.ok(withSwaps.estimatedPenSwapPauseSeconds > 0);
    assert.ok(withSwaps.totalSeconds > withSwaps.automatedSeconds);
});

test("computePenTransitionSeconds: default lift+lower (two transitions) lands close to the ~2s figure documented in spiralFill.ts", () => {
    const liftPlusLower = 2 * computePenTransitionSeconds();
    assert.ok(Math.abs(liftPlusLower - 2.0) < 0.3, `expected close to 2s, got ${liftPlusLower}s`);
});

test("stepsPerSecondToMmPerSecond: the current firmware's move speed is 3x its print speed, matching movement.h's constants", () => {
    assert.equal(MOVE_SPEED_STEPS_PER_S / PRINT_SPEED_STEPS_PER_S, 3);
    const printMmPerS = stepsPerSecondToMmPerSecond(PRINT_SPEED_STEPS_PER_S);
    const moveMmPerS = stepsPerSecondToMmPerSecond(MOVE_SPEED_STEPS_PER_S);
    assert.ok(Math.abs(moveMmPerS / printMmPerS - 3) < 1e-9);
});

test("CURRENT_FIRMWARE_SPEEDS: draw and travel speed are identical today (pen-up moves aren't yet sped up)", () => {
    assert.equal(CURRENT_FIRMWARE_SPEEDS.drawSpeedMmPerS, CURRENT_FIRMWARE_SPEEDS.travelSpeedMmPerS);
});

test("POST_PEN_UP_SPEED_CHANGE_FIRMWARE_SPEEDS: travel is faster than draw once the pending sibling-branch change lands", () => {
    assert.ok(POST_PEN_UP_SPEED_CHANGE_FIRMWARE_SPEEDS.travelSpeedMmPerS > POST_PEN_UP_SPEED_CHANGE_FIRMWARE_SPEEDS.drawSpeedMmPerS);
    assert.equal(POST_PEN_UP_SPEED_CHANGE_FIRMWARE_SPEEDS.drawSpeedMmPerS, CURRENT_FIRMWARE_SPEEDS.drawSpeedMmPerS, "draw speed itself is unaffected by that change");
});

test("estimatePlottingSecondsFromCommands: counts pen transitions and pen swaps from a real command list", () => {
    const commands: Command[] = [
        'h100' as Command,
        { x: 0, y: 0 },
        'p0', { x: 0, y: 0 }, 'p1', { x: 10, y: 0 }, 'p0',
        { x: 20, y: 0 }, 'p1', { x: 30, y: 0 }, 'p0',
        'c2',
        { x: 30, y: 0 }, 'p1', { x: 40, y: 0 }, 'p0',
    ];

    const expectedTransitions = commands.filter(c => c === 'p0' || c === 'p1').length;
    const result = estimatePlottingSecondsFromCommands(commands);
    assert.equal(result.penTransitionCount, expectedTransitions);
    assert.equal(result.penSwapCount, 1);
    assert.ok(result.drawDistanceMm > 0);
    assert.ok(result.travelDistanceMm >= 0);
});

test("estimatePlottingSecondsFromCommands: an empty/no-op command list produces a zeroed, non-throwing estimate", () => {
    const result = estimatePlottingSecondsFromCommands(['h0' as Command]);
    assert.equal(result.drawDistanceMm, 0);
    assert.equal(result.penTransitionCount, 0);
    assert.equal(result.totalSeconds, 0);
});
