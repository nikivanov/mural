import { Command } from "./types";
import { distanceBetweenPoints, getLastPoint } from "./utils";

export function measureDistance(dedupedCommands: Command[]) {
    let totalDistance = 0;
    let drawDistance = 0;
    let penUp = true;

    for (let i = 1; i < dedupedCommands.length; i++) {
        const command = dedupedCommands[i];

        if (typeof command !== 'string') {
            const lastCommand = getLastPoint(dedupedCommands.slice(0, i));
            if (lastCommand) {
                if (command.x !== lastCommand.x || command.y !== lastCommand.y) {
                    const distance = distanceBetweenPoints(lastCommand, command);
                    totalDistance += distance;

                    if (!penUp) {
                        drawDistance += distance;
                    }
                }
            }
        } else {
            if (command === 'p0') {
                penUp = true;
            } else if (command === 'p1') {
                penUp = false;
            }
        }
    }

    return {
        totalDistance,
        drawDistance,
    };
}