import { loadPaper } from "./paperLoader";
import { InfilledPath } from "./types";

const paper = loadPaper();

export function optimizePaths(infilledPaths: InfilledPath[], start_x: number, start_y: number): paper.Path[] {
    const paths: paper.Path[] = [];

    function getLastPoint() {
        if (paths.length === 0) {
            throw new Error('no points found');
        }

        const lastPath = paths[paths.length - 1];
        return lastPath.closed ? lastPath.firstSegment.point : lastPath.lastSegment.point;
    }
    
    const infilledPathsCopy = [...infilledPaths];

    while (infilledPathsCopy.length > 0) {
        
        const infilledPathToProcess = getClosestInfilledPath(infilledPathsCopy, paths.length > 0 ? getLastPoint() : new paper.Point(start_x, start_y));
        const infilledPathIndex = infilledPathToProcess.infilledPathIndex;
        let outlinePathIndex = infilledPathToProcess.index;

        const infilledPath = infilledPathsCopy[infilledPathIndex];
        const outlinePathsCopy = [...infilledPath.outlinePaths];

        while (outlinePathsCopy.length > 0)
        {
            const currentOutlinePath = outlinePathsCopy[outlinePathIndex];
            paths.push(currentOutlinePath);

            outlinePathsCopy.splice(outlinePathIndex, 1);

            const nextPath = getClosestPath(outlinePathsCopy, getLastPoint(), false);
            if (nextPath) {
                outlinePathIndex = nextPath.index;
            }
        }

        const infillsCopy = [...infilledPath.infillPaths];
        while (infillsCopy.length > 0) {
            const nextInfill = getClosestPath(infillsCopy, getLastPoint(), true);
            
            if (nextInfill.reverse) {
                nextInfill.path.reverse();
            } 

            paths.push(nextInfill.path);

            infillsCopy.splice(nextInfill.index, 1);
        }

        infilledPathsCopy.splice(infilledPathIndex, 1);
    }
    return paths;
}

function getClosestInfilledPath(infilledPaths: InfilledPath[], lastPoint: paper.Point) {
    const infilledPathsCost = infilledPaths.map((ip, index) => {
        // this could be optimized by considering all segments (and potentially drawing segments in reverse)
        // at the expense of compute
        
        const closestOutlinePath = getClosestPath(ip.outlinePaths, lastPoint, false);
        return {
            infilledPath: ip,
            infilledPathIndex: index,
            ...closestOutlinePath,
        }
    });

    return infilledPathsCost.sort((a, b) => a.cost - b.cost)[0];
}

function getClosestPath(paths: paper.Path[], lastPoint: paper.Point, canReverse: boolean) {
    const pathCosts = paths.map((p, index) => {
        const startPoint = p.firstSegment.point;
        // cheaper to keep it squared
        const startPointCost = startPoint.getDistance(lastPoint, true);

        if (canReverse) {
            const endPoint = p.lastSegment.point;
            const endPointCost = endPoint.getDistance(lastPoint, true);

            if (endPointCost >= startPointCost) {
                return {path: p, cost: startPointCost, index, reverse: false};
            } else {
                return {path: p, cost: endPointCost, index, reverse: true};
            }
        } else {
            return {path: p, cost: startPointCost, index, reverse: false};
        }
    });

    return pathCosts.sort((a, b) => a.cost - b.cost)[0];
}

