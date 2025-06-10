import { loadPaper } from './paperLoader';
import { InfillDensity, InfilledPath } from './types';

const paper = loadPaper();

const infillDensityToSpacingMap = new Map<Exclude<InfillDensity, 0>, number>([
    [1, 20],
    [2, 15],
    [3, 10],
    [4, 7],
]);

const infillAngle = Math.PI / 4;

export function generateInfills(pathsToInfill: paper.PathItem[], infillDensity: InfillDensity): InfilledPath[] {
    const view = paper.project.view;
    const xOffset = view.size.height * Math.tan(infillAngle);
    const lines: paper.Path.Line[] = [];

    let minInfillLength = 1000;
    if (infillDensity != 0) {
        const infillSpacing = infillDensityToSpacingMap.get(infillDensity)!;
        minInfillLength = Math.floor(infillSpacing);
        const infillXSpacing = infillSpacing * Math.sqrt(2);
        for (let currentX = -xOffset; currentX < view.size.width; currentX = currentX + infillXSpacing) {
            lines.push(new paper.Path.Line({x: currentX, y: 0}, {x: currentX + xOffset, y: view.size.height}));
            lines.push(new paper.Path.Line({x: currentX, y: view.size.height}, {x: currentX + xOffset, y: 0}));
        }
    }

    const boundsPath = new paper.Path.Rectangle(view.bounds);
    
    const infilledPaths = pathsToInfill.map(path => {
        if (path.fillColor && path.fillColor.toCSS(true) === '#ffffff' && !path.strokeColor) {
            return null;
        }

        const outlinePaths: paper.Path[] = [];
        
        if (path instanceof paper.Path) {
            if (path.firstSegment && path.lastSegment) {
                outlinePaths.push(path);
            }
            
        } else if (path instanceof paper.CompoundPath) {
            const unwoundPaths = unwrapCompoundPath(path).filter(p => p.firstSegment && p.lastSegment);
            outlinePaths.push(...unwoundPaths);
        } else {
            throw new Error("Path item is neither a Path or CompoundPath");
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
