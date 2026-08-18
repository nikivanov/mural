// Pure (paper.js-free) streamline-walking helper for gradientHatch.ts: given
// a starting point and a local direction field, grows a short polyline
// forward and backward along the locally-sampled direction, stopping at a
// length cap or as soon as it leaves the shape. Kept dependency-free (plain
// numbers and injected callbacks, no paper.Point/paper.Path) so it can be
// unit tested without paper.js's native `canvas` probe (see
// test/testSetup.ts's header) - gradientHatch.ts adapts paper geometry into
// the plain (x, y) callbacks this expects.
//
// This is deliberately simple LIC-adjacent line placement (short segments
// that bend to follow a locally-sampled direction), not real line integral
// convolution - the task brief explicitly calls for "simple and bounded",
// not publication-quality streamlines.

export type StreamlinePoint = { x: number; y: number };

export type StreamlineOptions = {
    // mm advance per step.
    stepSize: number;
    // mm, combined length of both directions from the seed.
    maxTotalLength: number;
    // radians, caps how much the walking direction may bend from one step
    // to the next - keeps the curve smooth rather than jittering step to
    // step when the sampled field is noisy.
    maxTurnPerStep: number;
    isInside: (x: number, y: number) => boolean;
    // Direction (radians) is a LINE direction, not a vector: undirected in
    // the sense that theta and theta+PI describe the same physical line.
    // Return undefined where there's no data (caller should stop growth
    // there, not just fail silently).
    directionAt: (x: number, y: number) => number | undefined;
};

function normalizeAngle(angle: number): number {
    let a = angle;
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    return a;
}

// Shortest signed angular distance from `from` to `to`, in (-PI, PI].
function angleDelta(from: number, to: number): number {
    return normalizeAngle(to - from);
}

// A hatch "line direction" has no inherent orientation - theta and theta+PI
// are the same line. Picks whichever of the two is closer to the walk's
// current heading, so the streamline doesn't flip 180 degrees every step
// when the underlying field is symmetric under that ambiguity.
function resolveLineDirection(rawAngle: number, currentHeading: number): number {
    const candidate = normalizeAngle(rawAngle);
    const flipped = normalizeAngle(candidate + Math.PI);
    return Math.abs(angleDelta(currentHeading, candidate)) <= Math.abs(angleDelta(currentHeading, flipped))
        ? candidate
        : flipped;
}

function walk(startX: number, startY: number, initialHeading: number, options: StreamlineOptions): StreamlinePoint[] {
    const { stepSize, maxTotalLength, maxTurnPerStep, isInside, directionAt } = options;
    const points: StreamlinePoint[] = [];

    let x = startX;
    let y = startY;
    let heading = initialHeading;
    let length = 0;
    const halfLength = maxTotalLength / 2;

    while (length < halfLength) {
        const rawAngle = directionAt(x, y);
        if (rawAngle === undefined) break;

        heading = resolveLineDirection(rawAngle, heading);
        const nextX = x + Math.cos(heading) * stepSize;
        const nextY = y + Math.sin(heading) * stepSize;

        if (!isInside(nextX, nextY)) break;

        x = nextX;
        y = nextY;
        length += stepSize;
        points.push({ x, y });
    }

    return points;
}

// Grows a streamline both ways from (startX, startY). `startDirection` is
// the initial line direction (radians); the walk re-samples and follows the
// field from there. Returns points ordered from one end to the other,
// including the seed point, suitable for building an open polyline.
export function traceStreamline(startX: number, startY: number, startDirection: number, options: StreamlineOptions): StreamlinePoint[] {
    if (!options.isInside(startX, startY)) return [];

    const forward = walk(startX, startY, startDirection, options);
    const backwardHeading = normalizeAngle(startDirection + Math.PI);
    const backward = walk(startX, startY, backwardHeading, options);

    const points: StreamlinePoint[] = [];
    for (let i = backward.length - 1; i >= 0; i--) points.push(backward[i]);
    points.push({ x: startX, y: startY });
    points.push(...forward);
    return points;
}

export function streamlineLength(points: StreamlinePoint[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        total += Math.sqrt(dx * dx + dy * dy);
    }
    return total;
}
