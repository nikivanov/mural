import { loadPaper } from './paperLoader';
import { InfillDensity, InfilledPath, PathDensityData } from './types';

const paper = loadPaper();

const infillDensityToSpacingMap = new Map<Exclude<InfillDensity, 0>, number>([
    [1, 20],
    [2, 15],
    [3, 10],
    [4, 7],
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

    const infilledPaths = pathsToInfill.map(path => {
        if (path.fillColor && path.fillColor.toCSS(true) === '#ffffff' && !path.strokeColor) {
            return null;
        }

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
    }).filter((ip) => !!ip) as InfilledPath[];

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
