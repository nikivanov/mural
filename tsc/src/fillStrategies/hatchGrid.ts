// Shared line-grid builder for every hatch-based fill strategy added after
// crossHatch45 (singleDirectionHatch, crossHatchAngled, jitteredHatch).
//
// crossHatch45.ts deliberately keeps its own inline copy of this logic
// (hardcoded to 45 degrees) rather than calling in here - it has a
// byte-identical-output regression test for density levels 1-4, and its
// existing formula (xOffset = height * tan(angle), stepping along x) is
// numerically stable only near 45 degrees. Angles assigned to multi-color
// layers (see generator.ts's assignHatchAnglesPerColorGroup) are spread
// across the full 0-180 degree range and can land arbitrarily close to 90
// degrees, where that formula's tan() blows up - so this generalized
// builder uses a direction/normal-vector construction instead, which has no
// singularity at any angle.
import { loadPaper } from '../paperLoader';

const paper = loadPaper();

// crossHatch45's own default (Math.PI / 4 radians). Strategies here use
// this whenever a path carries no PathDensityData.hatchAngleDegrees
// override, so they visually match crossHatch45 at the default angle.
export const defaultHatchAngleDegrees = 45;

export type HatchMode = 'cross' | 'single';

// Builds a hatch line grid covering `view` at `spacingMm` perpendicular
// spacing, oriented at `angleDegrees` (measured from the x-axis, same
// convention as standard math angle). `mode`:
//   - 'single': one direction only (angleDegrees) - half the line count of
//     'cross' at the same spacing, hence roughly half the ink coverage.
//   - 'cross': angleDegrees and angleDegrees + 90 (i.e. two directions 90
//     degrees apart) - the same relationship crossHatch45's own two
//     diagonals (45 and -45/135) have to each other.
//
// Each line is constructed by walking outward from the view's center along
// the hatch normal in steps of `spacingMm`, and extending far enough past
// the view's diagonal that clipping against the target path/bounds (see
// hatchClip.ts) never misses coverage regardless of angle - this avoids the
// tan()-based construction's singularity near 90 degrees.
export function buildHatchLines(
    view: paper.View,
    angleDegrees: number,
    spacingMm: number,
    mode: HatchMode,
): paper.Path.Line[] {
    const lines: paper.Path.Line[] = [];
    if (spacingMm <= 0) {
        return lines;
    }

    const width = view.size.width;
    const height = view.size.height;
    const diagonal = Math.sqrt(width * width + height * height);
    const center = new paper.Point(width / 2, height / 2);

    const directionAngles = mode === 'cross' ? [angleDegrees, angleDegrees + 90] : [angleDegrees];

    for (const degrees of directionAngles) {
        const radians = degrees * Math.PI / 180;
        const direction = new paper.Point(Math.cos(radians), Math.sin(radians));
        const normal = new paper.Point(-Math.sin(radians), Math.cos(radians));

        // Enough steps in each direction along the normal to sweep well
        // past the view's diagonal, so the grid fully covers the view
        // regardless of angleDegrees.
        const steps = Math.ceil(diagonal / spacingMm) + 1;
        for (let step = -steps; step <= steps; step++) {
            const lineCenter = center.add(normal.multiply(step * spacingMm));
            const start = lineCenter.subtract(direction.multiply(diagonal));
            const end = lineCenter.add(direction.multiply(diagonal));
            lines.push(new paper.Path.Line(start, end));
        }
    }

    return lines;
}
