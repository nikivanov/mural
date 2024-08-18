import { loadPaper } from './paperLoader';
import * as fs from 'fs';
import path from 'path';
import {PNG} from 'pngjs';

const paper = loadPaper();

const WHITE_COLOR = new paper.Color("white");
type Point = {
    x: number,
    y: number,
    visited: boolean,
}

const BLACK_COLOR = new paper.Color("black");

export async function CreatePathsFromColorMatrix(colorMatrix: paper.Color[][]): Promise<paper.PathItem[]> {
    const width = colorMatrix[0].length;
    const height = colorMatrix.length;

    dumpPNG(width, height, (buffer) => {
        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                const currentColor = colorMatrix[row][col];
                const address = (width * row + col) * 4;
                buffer[address] = Math.floor(currentColor.red * 255);
                buffer[address + 1] = Math.floor(currentColor.green * 255);
                buffer[address + 2] = Math.floor(currentColor.blue * 255);
                buffer[address + 3] = Math.floor(currentColor.alpha * 255);
            }
        }
    });

    const pointIndex = new Map<number, Map<number, Point>>();
    const points = new Set<Point>();
    for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
            const currentColor = colorMatrix[row][column];
            if (currentColor.equals(BLACK_COLOR)) {
                if (!pointIndex.has(row)) {
                    pointIndex.set(row, new Map<number, Point>());
                }

                const point  = {x: column, y: row, visited: false};
                
                pointIndex.get(row)!.set(column, point);
                points.add(point);
            }
            // if (currentColor.alpha > 0) {
            //     // filter by color here, for now treat everything not white (with tolerance) as drawable
            //     if (colorDistance(currentColor, WHITE_COLOR) > 0.1) {
                    
            //     }
            // }
        }
    }

    const pointBlobs: Point[][] = [];
    let currentBlob: Point[] = [];
    while (points.size > 0) {
        let point = points.values().next().value as Point;

        const pointQueue: Point[] = [point];

        while (pointQueue.length > 0) {
            point = pointQueue.pop()!;
            const neighbors = findNeightbors(point, pointIndex);

            const candidates = [point, ...neighbors];
            const unvisitedCandidates = candidates.filter(p => !p.visited);
            currentBlob.push(...unvisitedCandidates);
            
            pointQueue.push(...unvisitedCandidates);
            unvisitedCandidates.forEach(p => {
                p.visited = true;
                points.delete(p);

            });
        }

        pointBlobs.push(currentBlob);
        currentBlob = [];
    }

    dumpPNG(width, height, (buffer) => {
        for (const blob of pointBlobs) {
            for (const point of blob) {
                var idx = (width * point.y + point.x) * 4;
                buffer[idx] = 0;
                buffer[idx + 1] = 0;
                buffer[idx + 2] = 0;
                buffer[idx + 3] = 255;
            }
        }
    });

    return [];
}

function dumpPNG(width: number, height: number, dumpData: (data: Buffer) => void) {
    const png = new PNG({
        width,
        height,
    })
    dumpData(png.data);

    const fullPath = path.join(__dirname, '../svgs/out.png');
    let buff = PNG.sync.write(png);
    // Write a PNG file
    fs.writeFileSync(fullPath, buff);
}

function colorDistance(color1: paper.Color, color2: paper.Color) {
    return (color2.red - color1.red) ** 2 + (color2.green - color1.green) ** 2 + (color2.blue - color1.blue) ** 2;
}

function areTwoPointsAdjacent(p1: Point, p2: Point, tolerance: number = 1) {
    if (Math.abs(p1.x - p2.x) <= tolerance && Math.abs(p1.y - p2.y) <= tolerance) {
        return true;
    }

    return false;
}

function findNeightbors(point: Point, pointIndex: Map<number, Map<number, Point>>): Point[] {
    const neighbors: (Point | undefined)[] = [
        pointIndex.get(point.y - 1)?.get(point.x - 1), // top left
        pointIndex.get(point.y - 1)?.get(point.x), // top middle
        pointIndex.get(point.y - 1)?.get(point.x + 1), // top right

        pointIndex.get(point.y)?.get(point.x - 1), // middle left
        // skip middle middle - that's the point itself
        pointIndex.get(point.y)?.get(point.x + 1), // middle right

        pointIndex.get(point.y + 1)?.get(point.x - 1), // bottom left
        pointIndex.get(point.y + 1)?.get(point.x), // bottom middle
        pointIndex.get(point.y + 1)?.get(point.x + 1), // bottom right
    ];

    return neighbors.filter((p): p is Point => !!p && !p.visited);
}

