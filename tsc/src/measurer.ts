import { Command } from "./types";
import { distanceBetweenPoints } from "./utils";

export function measureDistance(dedupedCommands: Command[]) {
    let totalDistance = 0;
    let drawDistance = 0;
    let penUp = true;

    // Track the most recent coordinate command as we walk forward. Re-deriving
    // it from a sliced prefix on every iteration made this O(n^2), which cost
    // seconds on the ~90k-command renders large dense fills produce.
    const first = dedupedCommands[0];
    let lastCommand = typeof first === 'object' ? first : undefined;

    for (let i = 1; i < dedupedCommands.length; i++) {
        const command = dedupedCommands[i];

        if (typeof command !== 'string') {
            if (lastCommand) {
                if (command.x !== lastCommand.x || command.y !== lastCommand.y) {
                    const distance = distanceBetweenPoints(lastCommand, command);
                    totalDistance += distance;

                    if (!penUp) {
                        drawDistance += distance;
                    }
                }
            }
            lastCommand = command;
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
