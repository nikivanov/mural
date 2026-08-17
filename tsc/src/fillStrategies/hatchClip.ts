// Shared clip/split-on-gaps machinery, extracted from crossHatch45's
// generateFill so every hatch-line-based strategy added after it
// (singleDirectionHatch, crossHatchAngled, jitteredHatch) reuses one
// implementation instead of copy-pasting it three times.
//
// crossHatch45.ts keeps its own inline copy of this exact logic rather than
// importing from here - see that file's header comment for why (its
// byte-identical density 1-4 regression test means it must not change in
// any way, including "purely mechanical" refactors that could shift
// floating-point results at the margins). This module is for every strategy
// that came after it.
import { loadPaper } from '../paperLoader';

const paper = loadPaper();

function getMidPoint(point1: paper.Point, point2: paper.Point): paper.Point {
    return new paper.Point(
        point1.x + (point2.x - point1.x) / 2,
        point1.y + (point2.y - point1.y) / 2,
    );
}

// Intersects each of `lines` against `path` and `boundsPath`, keeps only
// interior-of-view intersection points, sorts them along the line, splits
// into runs wherever the midpoint between two consecutive intersections
// falls outside `path` (a gap), and drops runs whose resulting segment
// length doesn't exceed `minInfillLength`. Mirrors crossHatch45's original
// per-line loop exactly, generalized to take an arbitrary `lines` array
// instead of building one internally.
export function clipHatchLinesToPath(
    path: paper.PathItem,
    lines: paper.Path.Line[],
    boundsPath: paper.Path,
    minInfillLength: number,
): paper.Path[] {
    const infillPaths: paper.Path[] = [];

    for (const line of lines) {
        const intersections = [...path.getIntersections(line), ...boundsPath.getIntersections(line)].filter(i => i.point.isInside(boundsPath.bounds));

        intersections.sort((a, b) => a.point.x - b.point.x);

        let currentLineGroup: paper.Point[] = [];
        function saveCurrentLineAsPath() {
            if (currentLineGroup.length > 1) {
                const infillLine = new paper.Path.Line(currentLineGroup[0], currentLineGroup[currentLineGroup.length - 1]);
                if (infillLine.length > minInfillLength) {
                    infillPaths.push(infillLine);
                }
            }
        }

        for (const intersection of intersections) {
            if (currentLineGroup.length === 0) {
                currentLineGroup.push(intersection.point);
            } else {
                const previousPoint = currentLineGroup[currentLineGroup.length - 1];
                const thisPoint = intersection.point;
                const midPoint = getMidPoint(previousPoint, thisPoint);
                if (path.contains(midPoint)) {
                    currentLineGroup.push(thisPoint);
                } else {
                    saveCurrentLineAsPath();
                    currentLineGroup = [thisPoint];
                }
            }
        }
        saveCurrentLineAsPath();
    }

    return infillPaths;
}
