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

        // Order the crossings ALONG THE LINE, by projecting each onto the
        // line's own direction, rather than by x.
        //
        // Sorting by x is only valid while the line has meaningful horizontal
        // extent. crossHatch45's original hardcoded 45-degree lines always
        // did, so it went unnoticed - but these strategies take an arbitrary
        // hatchAngleDegrees (multi-color assigns per-layer angles by golden
        // angle, which lands near 90 degrees for some layers). For a
        // near-vertical line every crossing shares almost the same x, so the
        // comparator becomes meaningless, interior and exterior runs get
        // paired wrongly, and segments are emitted OUTSIDE the shape -
        // visible as hatch lines bleeding out past the region's edge.
        const lineStart = line.firstSegment.point;
        const lineDirection = line.lastSegment.point.subtract(lineStart);
        intersections.sort((a, b) =>
            a.point.subtract(lineStart).dot(lineDirection) -
            b.point.subtract(lineStart).dot(lineDirection));

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
