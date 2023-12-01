import { Command } from "./types";
import { distanceBetweenPoints, getLastPoint } from "./utils";

export function measureDistance(dedupedCommands: Command[]): number {
    let totalDistance = 0;
    for (let i = 1; i < dedupedCommands.length; i++) {
        const command = dedupedCommands[i];

        if (typeof command !== 'string') {
            const lastCommand = getLastPoint(dedupedCommands.slice(0, i));
            if (lastCommand) {
                if (command.x !== lastCommand.x || command.y !== lastCommand.y) {
                    totalDistance += distanceBetweenPoints(lastCommand, command);
                }
            }
        }
    }

    return totalDistance;
}