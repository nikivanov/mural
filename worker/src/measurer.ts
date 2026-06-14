import { Command, CoordinateCommand } from "./types";
import { distanceBetweenPoints } from "./utils";

export function measureDistance(dedupedCommands: Command[]) {
    let totalDistance = 0;
    let drawDistance = 0;
    let penUp = true;
    let lastPoint: CoordinateCommand | undefined;

    for (const command of dedupedCommands) {
        if (typeof command !== 'string') {
            if (lastPoint && (command.x !== lastPoint.x || command.y !== lastPoint.y)) {
                const distance = distanceBetweenPoints(lastPoint, command);
                totalDistance += distance;
                if (!penUp) drawDistance += distance;
            }
            lastPoint = command;
        } else {
            if (command === 'p0') penUp = true;
            else if (command === 'p1') penUp = false;
        }
    }

    return { totalDistance, drawDistance };
}