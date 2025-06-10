import { Command, CoordinateCommand } from "./types";
//import path from 'path';
//import * as fs from 'fs';
import {loadPaper} from './paperLoader';

const paper = loadPaper();

export function getLastPoint(commandList: Command[]) : CoordinateCommand | undefined {
    for (let i = commandList.length - 1; i >= 0; i--) {
        const command = commandList[i];
        if (typeof command === 'string') {
            continue;
        } else {
            return command;
        }
    }

    return undefined;
}

export function distanceBetweenPoints(cmd1: CoordinateCommand, cmd2: CoordinateCommand): number {
    return Math.sqrt(Math.pow(cmd2.x - cmd1.x, 2) + Math.pow(cmd2.y - cmd1.y, 2));
}

export function distanceBetweenPointsSquared(cmd1: CoordinateCommand, cmd2: CoordinateCommand): number {
    return Math.pow(cmd2.x - cmd1.x, 2) + Math.pow(cmd2.y - cmd1.y, 2);
}

export function isPathWhiteOnly(path: paper.PathItem): boolean {
    return !!(path.fillColor && path.fillColor.toCSS(true) === '#ffffff' && !path.strokeColor);
}

// export function dumpSVG(svg: paper.Item) {
//     const svgString = svg.exportSVG({
//         asString: true,
//     }) as string;
//     return dumpStringAsSvg(svgString);
// }

// export async function dumpCanvas(canvas: Canvas) {
//     const fullPath = path.join(__dirname, '../svgs/out.png');
//     fs.writeFileSync(fullPath, canvas.toBuffer());
// }

// export async function dumpStringAsSvg(svgString: string) {
//     const fullPath = path.join(__dirname, '../svgs/out.svg');
//     fs.writeFileSync(fullPath, svgString);
// }