import { loadPaper } from "./paperLoader";
import { InfilledPath } from "./types";

const paper = loadPaper();

// Time/iteration caps for the 2-opt pass below, so a large drawing can't hang
// the worker (it runs on a phone).
const TWO_OPT_TIME_BUDGET_MS = 2000;
const TWO_OPT_MAX_ITERATIONS = 2_000_000;
const TWO_OPT_TIME_CHECK_INTERVAL = 2000;

type PathCandidate = {
    path: paper.Path,
    cost: number,
    index: number,
    reverse: boolean,
};

export function optimizePaths(infilledPaths: InfilledPath[], start_x: number, start_y: number): paper.Path[] {
    const paths: paper.Path[] = [];

    function getLastPoint() {
        if (paths.length === 0) {
            throw new Error('no points found');
        }

        const lastPath = paths[paths.length - 1];
        return lastPath.closed ? lastPath.firstSegment.point : lastPath.lastSegment.point;
    }

    // Same as getLastPoint(), but falls back to the job's home position
    // before anything has been drawn yet, instead of throwing - needed
    // below wherever a path might be reached before any outline has been
    // pushed (e.g. an infilled path with no outline of its own; see
    // groupPathsByLiteralColor's fill/stroke split in generator.ts, where
    // the fill layer's boundary belongs to a different color's stroke
    // layer, so its outlinePaths is empty and it goes straight to infill).
    function currentPoint() {
        return paths.length > 0 ? getLastPoint() : new paper.Point(start_x, start_y);
    }

    // An infilled path with neither an outline nor any infill lines has
    // nothing to draw - drop it up front so the loop below always finds a
    // real anchor point for every remaining candidate (and so it can't get
    // stuck never selecting an empty entry).
    const infilledPathsCopy = infilledPaths.filter(ip => ip.outlinePaths.length > 0 || ip.infillPaths.length > 0);

    while (infilledPathsCopy.length > 0) {

        const infilledPathToProcess = getClosestInfilledPath(infilledPathsCopy, currentPoint());
        const infilledPathIndex = infilledPathToProcess.infilledPathIndex;
        let outlinePathIndex = infilledPathToProcess.index;
        let outlineReverse = infilledPathToProcess.reverse;

        const infilledPath = infilledPathsCopy[infilledPathIndex];
        const outlinePathsCopy = [...infilledPath.outlinePaths];

        while (outlinePathsCopy.length > 0)
        {
            const currentOutlinePath = outlinePathsCopy[outlinePathIndex];

            if (outlineReverse) {
                currentOutlinePath.reverse();
            }

            paths.push(currentOutlinePath);

            outlinePathsCopy.splice(outlinePathIndex, 1);

            const nextPath = getClosestPath(outlinePathsCopy, getLastPoint(), false);
            if (nextPath) {
                outlinePathIndex = nextPath.index;
                outlineReverse = nextPath.reverse;
            }
        }

        const infillsCopy = [...infilledPath.infillPaths];
        while (infillsCopy.length > 0) {
            const nextInfill = getClosestPath(infillsCopy, currentPoint(), true)!;

            if (nextInfill.reverse) {
                nextInfill.path.reverse();
            }

            paths.push(nextInfill.path);

            infillsCopy.splice(nextInfill.index, 1);
        }

        infilledPathsCopy.splice(infilledPathIndex, 1);
    }

    return twoOptOptimize(paths);
}

function getClosestInfilledPath(infilledPaths: InfilledPath[], lastPoint: paper.Point) {
    return infilledPaths.reduce<(PathCandidate & { infilledPath: InfilledPath, infilledPathIndex: number }) | undefined>((best, ip, index) => {
        // Some infilled paths carry no outline of their own (see
        // generator.ts's fill/stroke split: a fill layer's boundary
        // belongs to a different color's stroke layer, so outlinePaths is
        // empty) - anchor on the closest infill line's closest endpoint
        // instead. infilledPathsCopy is pre-filtered (see optimizePaths)
        // so every entry has at least one of outlinePaths/infillPaths.
        const closestPath = ip.outlinePaths.length > 0
            ? getClosestPath(ip.outlinePaths, lastPoint, false)!
            : getClosestPath(ip.infillPaths, lastPoint, true)!;

        const candidate = {
            infilledPath: ip,
            infilledPathIndex: index,
            ...closestPath,
        };

        return !best || candidate.cost < best.cost ? candidate : best;
    }, undefined)!;
}

// Finds the path (by index) whose closest endpoint to lastPoint is cheapest.
// Open paths (paths that aren't closed loops) have two distinct endpoints, so
// both are considered and `reverse` reports whether the path should be
// reversed to start from its cheaper endpoint. `canReverse` additionally
// forces that consideration for paths that report themselves as closed
// (infill lines are always effectively open, so this is mostly belt-and-braces).
function getClosestPath(paths: paper.Path[], lastPoint: paper.Point, canReverse: boolean): PathCandidate | undefined {
    return paths.reduce<PathCandidate | undefined>((best, p, index) => {
        const startPoint = p.firstSegment.point;
        // cheaper to keep it squared
        const startPointCost = startPoint.getDistance(lastPoint, true);

        let candidate: PathCandidate = { path: p, cost: startPointCost, index, reverse: false };

        if (canReverse || !p.closed) {
            const endPoint = p.lastSegment.point;
            const endPointCost = endPoint.getDistance(lastPoint, true);

            if (endPointCost < candidate.cost) {
                candidate = { path: p, cost: endPointCost, index, reverse: true };
            }
        }

        return !best || candidate.cost < best.cost ? candidate : best;
    }, undefined);
}

// A bounded 2-opt pass over the final path ordering that reduces total pen-up
// travel distance. Each path is treated as a directed segment (start -> end);
// a 2-opt move reverses a contiguous block of the ordering and flips the
// direction of every path within it (this leaves total draw distance and the
// interior pen-up edges of the block unchanged, since distance is symmetric,
// and only changes the two boundary edges). Deterministic, first-improvement,
// bounded by both an iteration count and a wall-clock budget so it can't hang
// the worker on large drawings.
//
// Note: there's no edge in front of path 0 - the very first pen-up move (home
// to the first path's start) isn't a cost this pass can affect, since nothing
// precedes it, so path 0's start point is left out of the cost model (i === 0
// is treated the same as "no incoming edge", mirroring how j === n - 1 is
// treated as "no outgoing edge").
function twoOptOptimize(paths: paper.Path[]): paper.Path[] {
    const n = paths.length;
    if (n < 3) {
        return paths;
    }

    const starts = paths.map(p => p.firstSegment.point);
    // A closed path is redrawn back to its firstSegment when rendered (see
    // renderPathsToCommands), so its effective "last drawn point" is its
    // first point, not its lastSegment - mirroring the existing
    // getLastPoint() convention above.
    const ends = paths.map(p => p.closed ? p.firstSegment.point : p.lastSegment.point);

    const startTime = Date.now();
    let iterations = 0;
    let improved = true;

    while (improved) {
        improved = false;

        for (let i = 0; i < n - 1; i++) {
            const prevPoint = i === 0 ? null : ends[i - 1];

            for (let j = i + 1; j < n; j++) {
                iterations++;

                if (iterations > TWO_OPT_MAX_ITERATIONS) {
                    return paths;
                }
                if (iterations % TWO_OPT_TIME_CHECK_INTERVAL === 0 && Date.now() - startTime > TWO_OPT_TIME_BUDGET_MS) {
                    return paths;
                }

                const nextPoint = j === n - 1 ? null : starts[j + 1];

                // NOTE: these must be real (non-squared) distances, since
                // we're comparing *sums* of two distances below - summing
                // squared distances does not preserve the same ordering as
                // summing the real distances.
                const removedCost = (prevPoint ? prevPoint.getDistance(starts[i]) : 0)
                    + (nextPoint ? ends[j].getDistance(nextPoint) : 0);

                const addedCost = (prevPoint ? prevPoint.getDistance(ends[j]) : 0)
                    + (nextPoint ? starts[i].getDistance(nextPoint) : 0);

                if (addedCost < removedCost) {
                    reverseBlock(paths, starts, ends, i, j);
                    improved = true;
                }
            }
        }
    }

    return paths;
}

function reverseBlock(paths: paper.Path[], starts: paper.Point[], ends: paper.Point[], i: number, j: number) {
    const blockPaths = paths.slice(i, j + 1);
    const blockStarts = starts.slice(i, j + 1);
    const blockEnds = ends.slice(i, j + 1);

    for (const p of blockPaths) {
        // closed paths always draw start-to-start (see the `ends` comment
        // above), so reversing them wouldn't change their cost and would
        // just needlessly flip their winding direction.
        if (!p.closed) {
            p.reverse();
        }
    }

    const blockLength = blockPaths.length;
    for (let k = 0; k < blockLength; k++) {
        const srcIndex = blockLength - 1 - k;
        paths[i + k] = blockPaths[srcIndex];
        // the path was reversed above, so its start/end are swapped
        starts[i + k] = blockEnds[srcIndex];
        ends[i + k] = blockStarts[srcIndex];
    }
}
