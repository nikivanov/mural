// Plotting-time estimator: how long the plotter will physically take to
// draw a job, in two flavours -
//   - estimatePlottingSecondsFromCommands: exact, from an already-rendered
//     Command[] (post toCommands.ts) - reuses the existing, already-tested
//     measurer.ts for distance, and just applies the timing model below.
//   - estimatePlottingSeconds: the same timing model applied to a
//     *projected* draw/travel distance and segment count (segmentModel.ts),
//     for estimating cost before a render has happened at all.
//
// Physical constants below are mirrored from src/movement.h and
// src/pen.h/pen.cpp (the firmware) - see each constant's comment for its
// exact source line. They can't be imported directly (this is TS, that's
// C++), so keeping the mirrored value name close to the firmware's own
// constant name, and citing the file, is what keeps the two from drifting
// silently apart.
import { Command } from './types';
import { measureDistance } from './measurer';

// --- Motor speeds (src/movement.h) -----------------------------------
//
// The belt/pulley drive is a diff-belt ("polargraph"/winch) mechanism:
// instantaneous Cartesian pen speed actually varies with position (see
// movement.h's kinematics constants - d_t, d_p, d_m, the belt-angle
// geometry), not a simple constant mm/s. Modeling that properly is a
// motion-planning problem, not a cost-estimation one; converting
// steps/second directly to mm/second via belt circumference is a
// deliberate first-order approximation (treating belt-extension rate as a
// stand-in for draw speed), adequate for an order-of-magnitude time
// estimate but NOT for actual motion control.
export const STEPS_PER_ROTATION = 200 * 8; // movement.h's stepsPerRotation (1/8 microstepping)
export const DEFAULT_PULLEY_DIAMETER_MM = 12.69; // movement.h's default_diameter
export const PRINT_SPEED_STEPS_PER_S = 500; // movement.h's printSpeedSteps - the pen-down draw speed
export const MOVE_SPEED_STEPS_PER_S = 1500; // movement.h's moveSpeedSteps - the faster repositioning speed

export function stepsPerSecondToMmPerSecond(
    stepsPerSecond: number,
    diameterMm: number = DEFAULT_PULLEY_DIAMETER_MM,
    stepsPerRotation: number = STEPS_PER_ROTATION,
): number {
    const circumferenceMm = diameterMm * Math.PI;
    return stepsPerSecond * (circumferenceMm / stepsPerRotation);
}

export type PlotterSpeedProfile = {
    drawSpeedMmPerS: number; // pen-down speed
    travelSpeedMmPerS: number; // pen-up speed
};

// IMPORTANT - pen-up travel speed is a live dependency, not a fixed fact:
// today (src/tasks/interpolatingmovementtask.cpp's startRunning()/isDone(),
// the only caller that drives ordinary drawing/travel moves) EVERY move -
// whether the pen is up or down - is issued at printSpeedSteps. There is no
// per-command speed selection yet. A sibling branch is changing pen-up
// travel specifically to use moveSpeedSteps instead (faster repositioning
// while the pen isn't touching the wall), which is why every function below
// takes drawSpeedMmPerS/travelSpeedMmPerS as plain parameters rather than
// ever hardcoding a speed inside a formula - once that branch lands, the
// caller (the UI branch) should switch its default from
// CURRENT_FIRMWARE_SPEEDS to POST_PEN_UP_SPEED_CHANGE_FIRMWARE_SPEEDS below
// (or, better, read the two speeds from wherever that branch ends up
// surfacing them) without needing any change in this file.
export const CURRENT_FIRMWARE_SPEEDS: PlotterSpeedProfile = {
    drawSpeedMmPerS: stepsPerSecondToMmPerSecond(PRINT_SPEED_STEPS_PER_S),
    travelSpeedMmPerS: stepsPerSecondToMmPerSecond(PRINT_SPEED_STEPS_PER_S),
};

export const POST_PEN_UP_SPEED_CHANGE_FIRMWARE_SPEEDS: PlotterSpeedProfile = {
    drawSpeedMmPerS: stepsPerSecondToMmPerSecond(PRINT_SPEED_STEPS_PER_S),
    travelSpeedMmPerS: stepsPerSecondToMmPerSecond(MOVE_SPEED_STEPS_PER_S),
};

// --- Pen lift/lower (src/pen.h, src/pen.cpp) --------------------------
//
// Pen::slowUp()/slowDown() both call doSlowMove(), which ramps the servo at
// slowSpeedDegPerSec degrees/second from its current angle to the target
// angle, then delay(200)s to let it physically settle (pen.cpp). Both a
// lift and a lower pay this cost independently - there is no fast path.
export const PEN_SERVO_SPEED_DEG_PER_S = 90; // pen.h's slowSpeedDegPerSec
export const PEN_SETTLE_SECONDS = 0.2; // pen.cpp's doSlowMove: delay(200) after reaching target

// The servo's actual calibrated travel angle (pen.h's `penDistance`) is set
// per-machine at runtime (Pen::setPenDistance, during physical setup) and
// isn't knowable before a job runs. DEFAULT_PEN_SWING_DEGREES is a
// representative stand-in chosen so this model's default lift+lower cost
// (2 * computePenTransitionSeconds()) lands on the ~2s figure already
// called out in fillStrategies/spiralFill.ts's header comment - "each
// pen-lift costs ~2s (servo ramp + settle, see src/pen.cpp/pen.h)" - which
// was itself eyeballed from this same servo/settle model, so this keeps the
// two consistent rather than inventing a second, disagreeing number.
export const DEFAULT_PEN_SWING_DEGREES = 72;

export function computePenTransitionSeconds(
    swingDegrees: number = DEFAULT_PEN_SWING_DEGREES,
    servoSpeedDegPerS: number = PEN_SERVO_SPEED_DEG_PER_S,
    settleSeconds: number = PEN_SETTLE_SECONDS,
): number {
    return swingDegrees / servoSpeedDegPerS + settleSeconds;
}

// --- Pen swaps (multi-color) -------------------------------------------
//
// A `c<index>` layer-change command (docs/multi-color.md section 2; see
// runner.cpp's awaitingSwapColorIndex/penSwapName handling) pauses the job
// and waits for a human to physically swap the mounted pen - there is no
// firmware-timed duration for this, unlike the deterministic servo lift
// above. DEFAULT_PEN_SWAP_PAUSE_SECONDS is a rough, clearly-labeled UX
// guess (not derived from any firmware constant), reported as a separate
// figure from the machine's own automated time so a caller can substitute
// something the user actually measures without touching the rest of the
// model.
export const DEFAULT_PEN_SWAP_PAUSE_SECONDS = 30;

export type PlottingTimeEstimate = {
    drawDistanceMm: number;
    travelDistanceMm: number;
    drawSeconds: number;
    travelSeconds: number;
    penTransitionCount: number;
    penLiftSeconds: number;
    penSwapCount: number;
    // What the machine itself takes, unattended: draw + travel + pen-lift
    // time. Excludes pen-swap pauses, which are human-paced, not machine
    // time (see DEFAULT_PEN_SWAP_PAUSE_SECONDS above).
    automatedSeconds: number;
    // automatedSeconds's rough human-paced counterpart: penSwapCount *
    // penSwapPauseSeconds. Reported separately so a caller can choose
    // whether/how to fold it into a headline number.
    estimatedPenSwapPauseSeconds: number;
    // automatedSeconds + estimatedPenSwapPauseSeconds - "how long until
    // this is fully done", including the guessed human pauses.
    totalSeconds: number;
};

export type PlottingTimeOptions = {
    speeds?: PlotterSpeedProfile;
    penTransitionSeconds?: number;
    penSwapPauseSeconds?: number;
};

function buildEstimate(
    drawDistanceMm: number,
    travelDistanceMm: number,
    penTransitionCount: number,
    penSwapCount: number,
    options: PlottingTimeOptions,
): PlottingTimeEstimate {
    const speeds = options.speeds ?? CURRENT_FIRMWARE_SPEEDS;
    const penTransitionSeconds = options.penTransitionSeconds ?? computePenTransitionSeconds();
    const penSwapPauseSeconds = options.penSwapPauseSeconds ?? DEFAULT_PEN_SWAP_PAUSE_SECONDS;

    const drawSeconds = speeds.drawSpeedMmPerS > 0 ? drawDistanceMm / speeds.drawSpeedMmPerS : 0;
    const travelSeconds = speeds.travelSpeedMmPerS > 0 ? travelDistanceMm / speeds.travelSpeedMmPerS : 0;
    const penLiftSeconds = penTransitionCount * penTransitionSeconds;
    const estimatedPenSwapPauseSeconds = penSwapCount * penSwapPauseSeconds;
    const automatedSeconds = drawSeconds + travelSeconds + penLiftSeconds;

    return {
        drawDistanceMm,
        travelDistanceMm,
        drawSeconds,
        travelSeconds,
        penTransitionCount,
        penLiftSeconds,
        penSwapCount,
        automatedSeconds,
        estimatedPenSwapPauseSeconds,
        totalSeconds: automatedSeconds + estimatedPenSwapPauseSeconds,
    };
}

export type PlottingTimeInputs = {
    drawDistanceMm: number;
    travelDistanceMm: number;
    // Count of pen-up/pen-down transitions - i.e. the total number of 'p0'
    // plus 'p1' commands. Every drawn path contributes exactly two (one of
    // each) - see renderPathsToCommands (renderer.ts): each path in the
    // optimized list is wrapped in its own leading 'p0' ... 'p1'.
    penTransitionCount: number;
    penSwapCount?: number;
};

// Projects plotting time from a pre-render estimate (segmentModel.ts's
// SegmentProjection plus a physical draw distance), for estimating cost
// before any actual path/command exists.
export function estimatePlottingSeconds(inputs: PlottingTimeInputs, options: PlottingTimeOptions = {}): PlottingTimeEstimate {
    return buildEstimate(
        Math.max(0, inputs.drawDistanceMm),
        Math.max(0, inputs.travelDistanceMm),
        Math.max(0, inputs.penTransitionCount),
        Math.max(0, inputs.penSwapCount ?? 0),
        options,
    );
}

function countPenTransitions(commands: readonly Command[]): number {
    let count = 0;
    for (const command of commands) {
        if (command === 'p0' || command === 'p1') {
            count++;
        }
    }
    return count;
}

function countPenSwaps(commands: readonly Command[]): number {
    let count = 0;
    for (const command of commands) {
        if (typeof command === 'string' && /^c\d+$/.test(command)) {
            count++;
        }
    }
    return count;
}

// Computes plotting time from an already-rendered command list (the output
// of toCommands.ts). Distances come from measurer.ts's measureDistance -
// the same, already-tested function the render pipeline itself uses to
// populate the 'd'/draw-distance header - so this stays consistent with
// what the machine will actually be told to do, rather than re-deriving
// distance from scratch.
export function estimatePlottingSecondsFromCommands(
    commands: Command[],
    options: PlottingTimeOptions = {},
): PlottingTimeEstimate {
    const distances = measureDistance(commands);
    const travelDistanceMm = Math.max(0, distances.totalDistance - distances.drawDistance);
    const penTransitionCount = countPenTransitions(commands);
    const penSwapCount = countPenSwaps(commands);

    return buildEstimate(distances.drawDistance, travelDistanceMm, penTransitionCount, penSwapCount, options);
}
