import { loadPaper } from './paperLoader';

const paper = loadPaper();

// Ramer-Douglas-Peucker polyline simplification, run after flatten() turns
// curves into straight-segment polylines. Reduces command counts without
// changing what gets drawn beyond `tolerance` (in the same units as the
// path's coordinates, i.e. mm). Endpoints of every path are always preserved
// exactly.
export function simplifyPaths(paths: paper.PathItem[], tolerance: number) {
    for (const path of paths) {
        simplifyPathItem(path, tolerance);
    }
}

function simplifyPathItem(path: paper.PathItem, tolerance: number) {
    if (path instanceof paper.Path) {
        simplifyPath(path, tolerance);
    } else if (path instanceof paper.CompoundPath) {
        for (const child of path.children) {
            simplifyPathItem(child as paper.PathItem, tolerance);
        }
    }
}

function simplifyPath(path: paper.Path, tolerance: number) {
    if (path.segments.length < 3) {
        return;
    }

    const points = path.segments.map(s => s.point);

    let simplifiedPoints: paper.Point[];
    if (path.closed) {
        // there's no distinguished start/end on a closed loop; anchor the
        // simplification on the first point by treating it as both ends of
        // an open polyline, then drop the duplicate.
        const loopPoints = [...points, points[0]];
        simplifiedPoints = rdp(loopPoints, tolerance);
        simplifiedPoints.pop();
    } else {
        simplifiedPoints = rdp(points, tolerance);
    }

    if (simplifiedPoints.length < 2 || simplifiedPoints.length >= points.length) {
        return;
    }

    path.removeSegments();
    path.addSegments(simplifiedPoints.map(p => new paper.Segment(p)));
}

// Iterative (non-recursive, to avoid stack depth issues on very long
// polylines) Douglas-Peucker simplification. Always keeps points[0] and
// points[points.length - 1].
function rdp(points: paper.Point[], epsilon: number): paper.Point[] {
    const n = points.length;
    if (n < 3) {
        return points.slice();
    }

    const keep = new Array<boolean>(n).fill(false);
    keep[0] = true;
    keep[n - 1] = true;

    const stack: [number, number][] = [[0, n - 1]];

    while (stack.length > 0) {
        const [startIndex, endIndex] = stack.pop()!;
        if (endIndex <= startIndex + 1) {
            continue;
        }

        const start = points[startIndex];
        const end = points[endIndex];

        let maxDist = 0;
        let maxIndex = startIndex;

        for (let i = startIndex + 1; i < endIndex; i++) {
            const dist = perpendicularDistance(points[i], start, end);
            if (dist > maxDist) {
                maxDist = dist;
                maxIndex = i;
            }
        }

        if (maxDist > epsilon) {
            keep[maxIndex] = true;
            stack.push([startIndex, maxIndex]);
            stack.push([maxIndex, endIndex]);
        }
    }

    const result: paper.Point[] = [];
    for (let i = 0; i < n; i++) {
        if (keep[i]) {
            result.push(points[i]);
        }
    }
    return result;
}

function perpendicularDistance(point: paper.Point, lineStart: paper.Point, lineEnd: paper.Point): number {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lineLength = Math.sqrt(dx * dx + dy * dy);

    if (lineLength === 0) {
        return point.getDistance(lineStart);
    }

    return Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / lineLength;
}
