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
// rings) into a single paper.js PathItem, using paper's own boolean
// unite()/subtract() to combine them - this sidesteps having to trust any
// particular winding-direction convention lining up with paper.js's own
// nonzero fill rule, since paper's boolean ops determine containment
// geometrically rather than by winding sign. ClipperLib.Clipper.Orientation
// still tells us which rings are outer vs. holes so we route each to
// unite() vs. subtract() appropriately.
function clipperSolutionToPathItem(solution: ClipperLib.Paths): paper.PathItem | null {
    if (solution.length === 0) {
        return null;
    }

    const outers: paper.Path[] = [];
    const holes: paper.Path[] = [];
    for (const ring of solution) {
        if (ring.length < 3) {
            continue;
        }
        const paperRing = clipperPathToPaperPath(ring);
        if (ClipperLib.Clipper.Orientation(ring)) {
            outers.push(paperRing);
        } else {
            holes.push(paperRing);
        }
    }

    if (outers.length === 0) {
        holes.forEach(h => h.remove());
        return null;
    }

    let result: paper.PathItem = outers[0];
    for (let i = 1; i < outers.length; i++) {
        const united = result.unite(outers[i], {insert: false});
        result.remove();
        outers[i].remove();
        result = united;
    }
    for (const hole of holes) {
        const subtracted = result.subtract(hole, {insert: false});
        result.remove();
        hole.remove();
        result = subtracted;
    }

    return result;
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
