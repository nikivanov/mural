// Shared polygon-offset primitive, built on clipper-lib.
//
// fillStrategies/contour.ts established the pattern this module generalizes
// (see its header comment for the full rationale): paper.js has no robust
// general polygon-offsetting primitive, and hand-rolling one is a well-known
// hard geometry problem (miter/bevel joins, self-intersections, holes) that
// produces garbage on concave/multiply-connected input if done naively.
// clipper-lib (already a `package.json` dependency, vendored for contour
// fill) does this robustly: flatten curves to polylines, scale into
// Clipper's integer space, resolve to its canonical simple-polygon-with-holes
// form via SimplifyPolygons, offset with ClipperOffset, then convert back.
//
// contour.ts only ever needs individual *rings* back (it draws each offset
// depth as an open/closed stroke, never booleans the result against other
// geometry), so its own local conversion helpers stop at "one ring at a
// time". flattener.ts's trapping-gap use (growing a darker layer's shape
// before subtracting it from a lighter one, see docs/multi-color.md section
// 5) instead needs the *whole* offset result back as a single paper.js
// PathItem suitable for `.subtract()`/`.unite()`, correctly reassembling
// outer contours and holes - that's what offsetPathItem here provides.
import { loadPaper } from '../paperLoader';
import * as ClipperLib from 'clipper-lib';

const paper = loadPaper();

// Clipper operates on integer coordinates; paper-space coordinates in this
// pipeline are already in mm, so scale up for sub-micron precision on the
// integer grid and back down when converting back to paper paths. Matches
// contour.ts's CLIPPER_SCALE exactly so results from both are comparable.
export const CLIPPER_SCALE = 1000;

// Flattening tolerance (mm) for approximating curves as polylines before
// handing them to Clipper. Matches contour.ts's FLATTEN_TOLERANCE_MM.
export const FLATTEN_TOLERANCE_MM = 0.15;

function pathItemToClipperPaths(path: paper.PathItem): ClipperLib.Paths {
    const clone = path.clone({insert: false}) as paper.PathItem;
    clone.flatten(FLATTEN_TOLERANCE_MM);

    const subpaths: paper.Path[] = clone instanceof paper.CompoundPath
        ? clone.children.filter((child): child is paper.Path => child instanceof paper.Path)
        : [clone as paper.Path];

    const clipperPaths: ClipperLib.Paths = [];
    for (const subpath of subpaths) {
        if (subpath.segments.length < 3) {
            continue;
        }
        const clipperPath: ClipperLib.Path = subpath.segments.map(segment => ({
            X: Math.round(segment.point.x * CLIPPER_SCALE),
            Y: Math.round(segment.point.y * CLIPPER_SCALE),
        }));
        clipperPaths.push(clipperPath);
    }

    clone.remove();
    return clipperPaths;
}

function clipperPathToPaperPath(clipperPath: ClipperLib.Path): paper.Path {
    const points = clipperPath.map(point => new paper.Point(point.X / CLIPPER_SCALE, point.Y / CLIPPER_SCALE));
    const ring = new paper.Path(points);
    ring.closed = true;
    return ring;
}

// Reassembles a Clipper solution (a flat list of outer-contour and hole
// rings) into a single paper.js PathItem.
//
// Clipper's solution is already in its canonical form: non-self-
// intersecting, non-overlapping rings whose orientation encodes outer vs.
// hole (ClipperLib.Clipper.Orientation), nested to whatever depth the shape
// needs. That is exactly what a paper.js CompoundPath expresses natively
// under its nonzero fill rule - so the rings can be handed over as children
// directly, with holes wound opposite to outers, rather than being rebuilt
// with boolean ops.
//
// This used to unite() every outer ring and then subtract() every hole from
// that union, one paper.js boolean op per ring. That was both slow and
// wrong:
//
//   - Slow: each op runs against an ever-growing accumulator, so a solution
//     of N rings costs O(N) booleans over O(N)-sized geometry. MEASURED
//     2026-08-18 on Bluey_Hero.png (500px, 4 colors, tsc/probe): 1.7-4.4
//     SECONDS per offsetPathItem call for 33-83-ring solutions, against
//     ~40ms for Clipper's own convert+simplify+offset work. Building the
//     CompoundPath directly does the same job in 2-6ms - the whole reason
//     cross-layer knockout (flattener.ts, the only caller) cost 3-14s on
//     detailed multi-color raster art.
//   - Wrong: "unite all outers, then subtract all holes" erases any outer
//     ring nested INSIDE a hole (an island in a lake - Clipper nest depth
//     3), because the hole is subtracted from the whole union including
//     that island. Real traced art hits this: 2 of the 4 Bluey layers had
//     depth-3 nesting, and the reassembled shape lost up to ~2.9% of its
//     area there. Winding-encoded nesting has no such failure mode - a
//     depth-3 ring is wound with the outers and fills normally.
//
// A solution with a single outer ring and no holes is returned as a plain
// paper.Path (not a one-child CompoundPath), matching what the boolean
// version returned in that case so the simple-shape path is unchanged.
function clipperSolutionToPathItem(solution: ClipperLib.Paths): paper.PathItem | null {
    if (solution.length === 0) {
        return null;
    }

    const rings: paper.Path[] = [];
    let outerCount = 0;
    for (const ring of solution) {
        if (ring.length < 3) {
            continue;
        }
        const isOuter = ClipperLib.Clipper.Orientation(ring);
        const paperRing = clipperPathToPaperPath(ring);
        // paper.js reads a CompoundPath's holes off winding direction under
        // its nonzero fill rule, so force outers and holes to opposite
        // orientations. Which of the two is "clockwise" is arbitrary as long
        // as it is consistent; outers are normalized to clockwise here.
        if (isOuter) {
            outerCount++;
            if (!paperRing.clockwise) {
                paperRing.reverse();
            }
        } else if (paperRing.clockwise) {
            paperRing.reverse();
        }
        rings.push(paperRing);
    }

    if (outerCount === 0) {
        rings.forEach(r => r.remove());
        return null;
    }

    if (rings.length === 1) {
        return rings[0];
    }

    return new paper.CompoundPath({children: rings, insert: false});
}

// Offsets `path` by `deltaMm`: positive grows the shape outward, negative
// insets it. Returns null if the input has no usable geometry (degenerate
// polygons, e.g. fewer than 3 points on every subpath) or the offset
// operation fully consumes the shape (large negative delta on a small
// shape). Uses round joins, matching contour.ts's own choice for the same
// reason (no sharp miter spikes on acute corners).
export function offsetPathItem(path: paper.PathItem, deltaMm: number): paper.PathItem | null {
    const rawPaths = pathItemToClipperPaths(path);
    if (rawPaths.length === 0) {
        return null;
    }

    const simplified = ClipperLib.Clipper.SimplifyPolygons(rawPaths, ClipperLib.PolyFillType.pftNonZero);
    if (simplified.length === 0) {
        return null;
    }

    const offset = new ClipperLib.ClipperOffset();
    offset.AddPaths(simplified, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);

    const solution: ClipperLib.Paths = [];
    offset.Execute(solution, deltaMm * CLIPPER_SCALE);

    return clipperSolutionToPathItem(solution);
}
