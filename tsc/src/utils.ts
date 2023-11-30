import { Command, CoordinateCommand, PathLike } from "./types";

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

export function isPathWhiteOnly(path: PathLike): boolean {
    return !!(path.fillColor && path.fillColor.toCSS(true) === '#ffffff' && !path.strokeColor);
}