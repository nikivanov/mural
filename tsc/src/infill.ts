import { loadPaper } from './paperLoader';
import { InfillDensity, InfilledPath, PathDensityData } from './types';
import { applyWhiteKnockout } from './flattener';

const paper = loadPaper();

// Spacing (mm) between adjacent cross-hatch lines at each density level.
// 1-4 are the original levels and MUST keep these exact values - existing
// snapshots/tests depend on byte-identical output at those densities.
//
// 5-7 are the extended ladder added for hue-grouped shading (huePalette.ts):
// a single pen can render several shades of its hue by hatching the same
// ink at different spacings and letting paper show through the sparser
// ones, so the ladder needs enough range to plausibly span "barely tinted"
// to "essentially solid" for one pen's darkest color.
//
// Ink laid per unit area scales roughly as 1/spacing (see buildInfillLines:
// halving the spacing roughly doubles the number of hatch lines crossing a
// given region), so level 7 (2.5mm) uses about 20/2.5 = 8x the ink length
// of level 1 (20mm) for the same area.
//
// Approximate cross-hatch coverage (~2 * nibWidth / spacing, nibWidth ~=
// 1.2mm - two hatch directions, each nib-width wide, per spacing period):
//   1 (20mm)  -> ~12%    5 (5mm)   -> ~48%
//   2 (15mm)  -> ~16%    6 (3.5mm) -> ~69%
//   3 (10mm)  -> ~24%    7 (2.5mm) -> ~96% (near solid)
//   4 (7mm)   -> ~34%
const infillDensityToSpacingMap = new Map<Exclude<InfillDensity, 0>, number>([
    [1, 20],
    [2, 15],
    [3, 10],
    [4, 7],
    [5, 5],
    [6, 3.5],
    [7, 2.5],
]);

const infillAngle = Math.PI / 4;

// Builds the diagonal infill line grid for a given density. Kept as its own
// function (rather than the single shared `lines` array the pre-grayscale
// code computed once) so paths tagged with a per-path density override (see
// generator.ts) can each get their own grid, while paths without an override
// keep sharing a single grid for the request's default density, matching the
// original behavior exactly.
function buildInfillLines(view: paper.View, xOffset: number, density: InfillDensity): paper.Path.Line[] {
    const lines: paper.Path.Line[] = [];
    if (density != 0) {
        const infillSpacing = infillDensityToSpacingMap.get(density)!;
        const infillXSpacing = infillSpacing * Math.sqrt(2);
        for (let currentX = -xOffset; currentX < view.size.width; currentX = currentX + infillXSpacing) {
            lines.push(new paper.Path.Line({x: currentX, y: 0}, {x: currentX + xOffset, y: view.size.height}));
            lines.push(new paper.Path.Line({x: currentX, y: view.size.height}, {x: currentX + xOffset, y: 0}));
        }
    }

    return lines;
}

export function generateInfills(pathsToInfill: paper.PathItem[], infillDensity: InfillDensity): InfilledPath[] {
    const view = paper.project.view;
    const xOffset = view.size.height * Math.tan(infillAngle);

    const linesByDensity = new Map<InfillDensity, paper.Path.Line[]>();
    function getLines(density: InfillDensity): paper.Path.Line[] {
        let lines = linesByDensity.get(density);
        if (!lines) {
            lines = buildInfillLines(view, xOffset, density);
            linesByDensity.set(density, lines);
        }
        return lines;
    }

    const boundsPath = new paper.Path.Rectangle(view.bounds);

    // White-as-knockout (see flattener.ts's applyWhiteKnockout): a pure
    // white fill with no stroke of its own is dropped entirely (matching
    // the pre-existing "nothing to draw" treatment below for any leftover
    // white fill), but first subtracts its geometry from whatever paint
    // order puts beneath it, so a white shape drawn over a colored one
    // leaves unmarked paper instead of that color's infill hatching showing
    // straight through it.
    const knockedOutPaths = applyWhiteKnockout(pathsToInfill);

    const infilledPaths = knockedOutPaths.map(path => {
        const pathData = path.data as PathDensityData | undefined;
        const density = pathData?.density !== undefined ? pathData.density : infillDensity;
        const includeOutline = pathData?.outline !== undefined ? pathData.outline : true;
        const minInfillLength = density === 0 ? 1000 : Math.floor(infillDensityToSpacingMap.get(density)!);
        const lines = getLines(density);

        if (!(path instanceof paper.Path) && !(path instanceof paper.CompoundPath)) {
            throw new Error("Path item is neither a Path or CompoundPath");
        }

        const outlinePaths: paper.Path[] = [];

        if (includeOutline) {
            if (path instanceof paper.Path) {
                if (path.firstSegment && path.lastSegment) {
                    outlinePaths.push(path);
                }

            } else {
                const unwoundPaths = unwrapCompoundPath(path).filter(p => p.firstSegment && p.lastSegment);
                outlinePaths.push(...unwoundPaths);
            }
        }

        const infillPaths: paper.Path[] = [];

        if (!path.fillColor || path.fillColor.toCSS(true) !== '#ffffff') {
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
        }

        const infilledPath: InfilledPath = {
            originalPath: path,
            infillPaths,
            outlinePaths,
        };

        return infilledPath;
    });

    return infilledPaths;
}

function getMidPoint(point1: paper.Point, point2: paper.Point): paper.Point {
    return new paper.Point(
        point1.x + (point2.x - point1.x) / 2,
        point1.y + (point2.y - point1.y) / 2,
    );
}

function unwrapCompoundPath(path: paper.CompoundPath) {
    const paths: paper.Path[] = [];
    for (const child of path.children) {
        if (child instanceof paper.Path) {
            paths.push(child);
        } else if (child instanceof paper.CompoundPath) {
            paths.push(...unwrapCompoundPath(child));
        }
    }

    return paths;
}
