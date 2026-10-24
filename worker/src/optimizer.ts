import paper from "paper";
import { InfilledPath } from "./types";

type GridEntry = {
    infilledPath: InfilledPath;
    x: number;
    y: number;
};

class SpatialGrid {
    private cells = new Map<string, Set<GridEntry>>();
    private reverseMap = new Map<InfilledPath, GridEntry[]>();
    private totalEntries = 0;
    private cellSize: number;
    private minX: number;
    private minY: number;

    constructor(infilledPaths: InfilledPath[], cellSize: number, minX: number, minY: number) {
        this.cellSize = cellSize;
        this.minX = minX;
        this.minY = minY;

        for (const ip of infilledPaths) {
            const entries: GridEntry[] = [];
            for (const path of ip.outlinePaths) {
                for (const pt of [path.firstSegment.point, path.lastSegment.point]) {
                    const entry: GridEntry = { infilledPath: ip, x: pt.x, y: pt.y };
                    const key = this.cellKey(entry.x, entry.y);
                    let cell = this.cells.get(key);
                    if (!cell) {
                        cell = new Set();
                        this.cells.set(key, cell);
                    }
                    cell.add(entry);
                    entries.push(entry);
                    this.totalEntries++;
                }
            }
            this.reverseMap.set(ip, entries);
        }
    }

    private cellKey(x: number, y: number): string {
        return `${Math.floor((x - this.minX) / this.cellSize)},${Math.floor((y - this.minY) / this.cellSize)}`;
    }

    private cellCoords(x: number, y: number): [number, number] {
        return [
            Math.floor((x - this.minX) / this.cellSize),
            Math.floor((y - this.minY) / this.cellSize),
        ];
    }

    remove(ip: InfilledPath): void {
        const entries = this.reverseMap.get(ip);
        if (!entries) return;
        for (const entry of entries) {
            this.cells.get(this.cellKey(entry.x, entry.y))?.delete(entry);
        }
        this.totalEntries -= entries.length;
        this.reverseMap.delete(ip);
    }

    // Ring-expansion nearest-neighbor search.
    // Stops expanding once the nearest possible point in the next ring cannot beat bestCost.
    findNearest(point: paper.Point): InfilledPath | null {
        if (this.totalEntries === 0) return null;

        const [qCol, qRow] = this.cellCoords(point.x, point.y);
        let bestCost = Infinity;
        let bestIp: InfilledPath | null = null;

        for (let ring = 0; ; ring++) {
            // Before scanning ring r, check if any point outside the (r-1) bounding box
            // can improve on bestCost. The minimum Euclidean distance from `point` to
            // any cell in ring r+ is the distance from `point` to the nearest face of
            // the (r-1) bounding box (clamped to 0 if point is already outside it).
            if (ring > 0 && bestCost < Infinity) {
                const rPrev = ring - 1;
                const boxLeft  = (qCol - rPrev) * this.cellSize + this.minX;
                const boxRight = (qCol + rPrev + 1) * this.cellSize + this.minX;
                const boxTop   = (qRow - rPrev) * this.cellSize + this.minY;
                const boxBottom = (qRow + rPrev + 1) * this.cellSize + this.minY;
                const minDist = Math.max(0, Math.min(
                    point.x - boxLeft,
                    boxRight - point.x,
                    point.y - boxTop,
                    boxBottom - point.y,
                ));
                if (minDist * minDist > bestCost) break;
            }

            for (let dc = -ring; dc <= ring; dc++) {
                for (let dr = -ring; dr <= ring; dr++) {
                    if (Math.max(Math.abs(dc), Math.abs(dr)) !== ring) continue;
                    const cell = this.cells.get(`${qCol + dc},${qRow + dr}`);
                    if (!cell) continue;
                    for (const entry of cell) {
                        const dx = entry.x - point.x;
                        const dy = entry.y - point.y;
                        const cost = dx * dx + dy * dy;
                        if (cost < bestCost) {
                            bestCost = cost;
                            bestIp = entry.infilledPath;
                        }
                    }
                }
            }
        }

        return bestIp;
    }
}

export function optimizePaths(infilledPaths: InfilledPath[], start_x: number, start_y: number): paper.Path[] {
    const paths: paper.Path[] = [];

    function getLastPoint() {
        if (paths.length === 0) throw new Error('no points found');
        const lastPath = paths[paths.length - 1];
        return lastPath.closed ? lastPath.firstSegment.point : lastPath.lastSegment.point;
    }

    if (infilledPaths.length === 0) return paths;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const ip of infilledPaths) {
        for (const p of ip.outlinePaths) {
            const b = p.bounds;
            if (b.x < minX) minX = b.x;
            if (b.y < minY) minY = b.y;
            if (b.x + b.width > maxX) maxX = b.x + b.width;
            if (b.y + b.height > maxY) maxY = b.y + b.height;
        }
    }

    const n = infilledPaths.length;
    const canvasSize = Math.max(maxX - minX, maxY - minY, 1);
    const cellSize = Math.max(canvasSize / Math.sqrt(n), 1);

    const grid = new SpatialGrid(infilledPaths, cellSize, minX, minY);
    const infilledPathsCopy = [...infilledPaths];

    while (infilledPathsCopy.length > 0) {
        const currentPoint = paths.length > 0 ? getLastPoint() : new paper.Point(start_x, start_y);

        // findNearest returns null when all remaining paths have empty outlinePaths;
        // fall back to picking the first remaining path so the outer loop can drain.
        const nearestIp = grid.findNearest(currentPoint) ?? infilledPathsCopy[0];
        const infilledPathIndex = infilledPathsCopy.indexOf(nearestIp);
        const exactEntry = nearestIp.outlinePaths.length > 0
            ? getClosestPath(nearestIp.outlinePaths, currentPoint, true)
            : undefined;
        let outlinePathIndex = exactEntry?.index ?? 0;

        const infilledPath = infilledPathsCopy[infilledPathIndex];
        const outlinePathsCopy = [...infilledPath.outlinePaths];

        if (exactEntry?.reverse && outlinePathsCopy.length > 0) {
            outlinePathsCopy[outlinePathIndex].reverse();
        }

        while (outlinePathsCopy.length > 0) {
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

        grid.remove(infilledPath);
        infilledPathsCopy.splice(infilledPathIndex, 1);
    }

    return paths;
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
                return { path: p, cost: startPointCost, index, reverse: false };
            } else {
                return { path: p, cost: endPointCost, index, reverse: true };
            }
        } else {
            return { path: p, cost: startPointCost, index, reverse: false };
        }
    });

    return pathCosts.sort((a, b) => a.cost - b.cost)[0];
}
