// Spiral fill: a single Archimedean spiral (r = b * theta) clipped to the
// target path, instead of a grid of many short disconnected hatch segments.
// Because the un-clipped spiral is one continuous curve, a mostly-convex
// region collapses to (or very close to) one continuous ink run - one
// pen-down, one pen-up - which is the whole point on this plotter, where
// each pen-lift costs ~2s (servo ramp + settle, see src/pen.cpp/pen.h).
//
// Unlike crossHatch45's straight grid lines, the spiral is a curve, so it
// isn't clipped via paper.js boolean path ops (those operate on *areas*, i.e.
// closed/filled paths - the spiral has no interior). Instead this reuses
// crossHatch45's own clipping idiom: walk the spiral point-by-point and use
// `path.contains(midpoint)` to decide whether each micro-segment lies inside
// the target shape, splitting into a new run wherever it doesn't. That keeps
// clipping correct for non-convex shapes (a run breaks and a new one starts
// each time the spiral crosses back inside) without relying on paper.js
// intersection/offset semantics for arbitrary curves.
import { loadPaper } from '../paperLoader';
import { FillContext, FillParams, FillStrategy } from './types';

const paper = loadPaper();

// Angular resolution: sample points per full revolution of the spiral, held
// constant regardless of shape size. Total point count is then
// `loops * POINTS_PER_REVOLUTION`, where `loops` is derived from the path's
// own extent relative to spacingMm (see generateFill below) - so sampling
// density stays proportionate for both a tiny region (few loops, few points)
// and a page-sized one (many loops, more points, but still linear), rather
// than under-sampling large shapes or over-sampling tiny ones the way a
// hardcoded iteration cap would.
const POINTS_PER_REVOLUTION = 64;
const ANGLE_STEP = (2 * Math.PI) / POINTS_PER_REVOLUTION;

// Maximum arc length (mm) between consecutive spiral samples. Bounds the
// boundary overshoot of the midpoint-based clipping below to half this
// value, regardless of how far the sample is from the spiral's centre.
// Chosen to match the firmware's own 1mm interpolation increment
// (src/tasks/interpolatingmovementtask.h) - finer would add points the
// machine cannot act on anyway.
const MAX_SEGMENT_MM = 1;

function getMidPoint(a: paper.Point, b: paper.Point): paper.Point {
    return new paper.Point(
        a.x + (b.x - a.x) / 2,
        a.y + (b.y - a.y) / 2,
    );
}

export const spiralFill: FillStrategy = {
    name: 'spiral',

    generateFill(path: paper.PathItem, params: FillParams, _ctx: FillContext): paper.Path[] {
        const { spacingMm, minInfillLength } = params;

        if (spacingMm === 0) {
            return [];
        }

        const bounds = path.bounds;
        // Bounding-box centroid: simpler than a true area centroid and, for
        // an Archimedean spiral whose whole point is even, ring-like
        // coverage, a perfectly adequate stand-in - true area centroid would
        // only matter for wildly lopsided shapes, where per-shape spiral
        // fill is already a rough-and-ready choice over hatch.
        const center = bounds.center;

        // Farthest any point inside the bounding box can be from its
        // center is the distance to a corner; the path is contained in its
        // own bounds, so a spiral reaching this radius is guaranteed to
        // cover the whole shape without generating geometry far beyond what
        // the shape needs.
        const maxRadius = Math.sqrt(
            Math.pow(bounds.width / 2, 2) + Math.pow(bounds.height / 2, 2),
        );

        if (maxRadius <= 0) {
            return [];
        }

        // r = b * theta, chosen so the radial gain per full turn (theta ->
        // theta + 2*pi) equals spacingMm: consecutive loops are spacingMm
        // apart, giving spiral fill the same spacing-controls-tone lever the
        // hatch strategies use.
        const b = spacingMm / (2 * Math.PI);
        const maxTheta = maxRadius / b;

        // Step by constant ARC LENGTH, not constant angle.
        //
        // A fixed angular step makes the chord between samples grow linearly
        // with radius: at 64 steps/revolution that is 0.5mm near the centre
        // but ~20mm at r=200mm. Since clipping below tests only each
        // segment's MIDPOINT, a long chord can have its midpoint inside the
        // shape while both ends sit well outside it - so the spiral visibly
        // overshot the region's boundary on its outer loops, by up to half a
        // segment (~10mm on a large shape).
        //
        // Sampling at a fixed arc length instead bounds that overshoot to
        // half of MAX_SEGMENT_MM everywhere, independent of shape size. dTheta
        // = arcLength / r for a curve whose local step is r*dTheta; near the
        // centre r -> 0 would explode it, so it is also clamped to the old
        // angular step, which is plenty fine at small radii.
        const points: paper.Point[] = [];
        for (let theta = 0; theta <= maxTheta; ) {
            const r = b * theta;
            points.push(new paper.Point(
                center.x + r * Math.cos(theta),
                center.y + r * Math.sin(theta),
            ));
            const arcStep = r > 0 ? MAX_SEGMENT_MM / r : ANGLE_STEP;
            theta += Math.min(ANGLE_STEP, arcStep);
        }
        // Guarantee the final sample reaches maxTheta so the outermost loop
        // isn't truncated short of the shape's corner.
        const rEnd = b * maxTheta;
        points.push(new paper.Point(
            center.x + rEnd * Math.cos(maxTheta),
            center.y + rEnd * Math.sin(maxTheta),
        ));

        const infillPaths: paper.Path[] = [];
        let currentRun: paper.Point[] = [];

        function flushRun() {
            if (currentRun.length > 1) {
                const runPath = new paper.Path(currentRun);
                if (runPath.length > minInfillLength) {
                    infillPaths.push(runPath);
                } else {
                    runPath.remove();
                }
            }
            currentRun = [];
        }

        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const midPoint = getMidPoint(p1, p2);

            if (path.contains(midPoint)) {
                if (currentRun.length === 0) {
                    currentRun.push(p1);
                }
                currentRun.push(p2);
            } else {
                flushRun();
            }
        }
        flushRun();

        return infillPaths;
    },
};
