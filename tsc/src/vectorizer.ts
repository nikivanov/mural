import { loadPaper } from './paperLoader';
import * as fs from 'fs';
import path from 'path';
import {PNG} from 'pngjs';
import {Potrace} from './tracer';


const paper = loadPaper();

const WHITE_COLOR = new paper.Color("white");
type Point = {
    x: number,
    y: number,
    visited: boolean,
}

//const BLACK_COLOR = new paper.Color("black");

export function CreatePathsFromColorMatrix(colorMatrix: paper.Color[][]): string {
    const width = colorMatrix[0].length;
    const height = colorMatrix.length;

    const pointIndex = new Map<number, Map<number, Point>>();
    const points = new Set<Point>();
    const data: (1|0)[] = [];
    for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
            let bmColor: (1|0) = 0;
            const currentColor = colorMatrix[row][column];
            
            if (currentColor.alpha > 0) {
                // filter by color here, for now treat everything not white (with tolerance) as drawable
                if (colorDistance(currentColor, WHITE_COLOR) > 0.1) {
                    if (!pointIndex.has(row)) {
                        pointIndex.set(row, new Map<number, Point>());
                    }
                    const point = { x: column, y: row, visited: false };

                    pointIndex.get(row)!.set(column, point);
                    points.add(point);

                    bmColor = 1;
                }
            }

            data.push(bmColor);
        }
    }

    dumpPNG(width, height, "out", (buffer) => {
        for (const point of points.values()) {
            var idx = (width * point.y + point.x) * 4;
            buffer[idx] = 0;
            buffer[idx + 1] = 0;
            buffer[idx + 2] = 0;
            buffer[idx + 3] = 255;
        }
    });

    const tracer = Potrace();
    tracer.setBitmap(width, height, data);
    const svgString: string = tracer.getSVG(1);

    return svgString;
}

function dumpPNG(width: number, height: number, fileName: string, dumpData: (data: Buffer) => void) {
    const png = new PNG({
        width,
        height,
    })
    dumpData(png.data);

    const fullPath = path.join(__dirname, `../svgs/${fileName}.png`);
    let buff = PNG.sync.write(png);
    // Write a PNG file
    fs.writeFileSync(fullPath, buff);
}

function colorDistance(color1: paper.Color, color2: paper.Color) {
    return (color2.red - color1.red) ** 2 + (color2.green - color1.green) ** 2 + (color2.blue - color1.blue) ** 2;
}

// function findNeightbors(point: Point, pointIndex: Map<number, Map<number, Point>>, unvisitedOnly: boolean): Point[] {
//     const neighbors: (Point | undefined)[] = [
//         pointIndex.get(point.y - 1)?.get(point.x - 1), // top left
//         pointIndex.get(point.y - 1)?.get(point.x), // top middle
//         pointIndex.get(point.y - 1)?.get(point.x + 1), // top right

//         pointIndex.get(point.y)?.get(point.x - 1), // middle left
//         // skip middle middle - that's the point itself
//         pointIndex.get(point.y)?.get(point.x + 1), // middle right

//         pointIndex.get(point.y + 1)?.get(point.x - 1), // bottom left
//         pointIndex.get(point.y + 1)?.get(point.x), // bottom middle
//         pointIndex.get(point.y + 1)?.get(point.x + 1), // bottom right
//     ];

//     return neighbors.filter((p): p is Point => !!p && ( unvisitedOnly ? !p.visited: true));
// }

// function generatePointIndex(points: Point[]): Map<number, Map<number, Point>> {
//     const map = new Map<number, Map<number, Point>>();
//     for (const point of points) {
//         if (!map.has(point.y)) {
//             map.set(point.y, new Map());
//         }

//         const rowMap = map.get(point.y)!;
//         rowMap.set(point.x, point);
//     }

//     return map;
// }

