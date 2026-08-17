// The original (and, until follow-up branches land, only) fill strategy:
// a 45-degree diagonal cross-hatch line grid, clipped against the path and
// split into runs at gaps. Extracted from infill.ts unchanged - see that
// file's history for the pre-extraction version.
import { loadPaper } from '../paperLoader';
import { FillContext, FillParams, FillStrategy } from './types';

const paper = loadPaper();

const infillAngle = Math.PI / 4;

// Builds the diagonal infill line grid for a given spacing (mm). Kept as its
// own function (rather than the single shared `lines` array the
// pre-grayscale code computed once) so paths tagged with a per-path density
// or spacingMm override (see generator.ts) can each get their own grid,
// while paths without an override keep sharing a single grid for the
// request's default density, matching the original behavior exactly.
// spacingMm === 0 (the "no infill" density-0 case) produces no lines.
function buildInfillLines(view: paper.View, xOffset: number, spacingMm: number): paper.Path.Line[] {
    const lines: paper.Path.Line[] = [];
    if (spacingMm !== 0) {
        const infillXSpacing = spacingMm * Math.sqrt(2);
        for (let currentX = -xOffset; currentX < view.size.width; currentX = currentX + infillXSpacing) {
            lines.push(new paper.Path.Line({x: currentX, y: 0}, {x: currentX + xOffset, y: view.size.height}));
            lines.push(new paper.Path.Line({x: currentX, y: view.size.height}, {x: currentX + xOffset, y: 0}));
        }
    }

    return lines;
}

function getMidPoint(point1: paper.Point, point2: paper.Point): paper.Point {
    return new paper.Point(
        point1.x + (point2.x - point1.x) / 2,
        point1.y + (point2.y - point1.y) / 2,
    );
}

export const crossHatch45: FillStrategy = {
    name: 'crossHatch45',

    generateFill(path: paper.PathItem, params: FillParams, ctx: FillContext): paper.Path[] {
        const { spacingMm, minInfillLength } = params;
        const { view, boundsPath, cache } = ctx;

        const cacheKey = `crossHatch45:${spacingMm}`;
        let lines = cache.get(cacheKey) as paper.Path.Line[] | undefined;
        if (!lines) {
            const xOffset = view.size.height * Math.tan(infillAngle);
            lines = buildInfillLines(view, xOffset, spacingMm);
            cache.set(cacheKey, lines);
        }

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
    },
};
