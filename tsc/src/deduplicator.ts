import { Command } from "./types";
import { getLastPoint, distanceBetweenPoints } from "./utils";

const MIN_DISTANCE = 1;
const MIN_DISTANCE_SQUARED = MIN_DISTANCE * MIN_DISTANCE;

export function dedupeCommands(commands: Command[]): Command[] {
    const dedupedCommands: Command[] = [];
    let skippedCount = 0;
    for (const command of commands) {
        if (typeof command === 'string') {
            if (dedupedCommands.length === 0 || dedupedCommands[dedupedCommands.length - 1] !== command) {
                dedupedCommands.push(command);
            }
        } else {
            const lastCommand = getLastPoint(dedupedCommands);
            if (lastCommand) {
                const distanceSquared = distanceBetweenPoints(lastCommand, command);
                if (distanceSquared >= MIN_DISTANCE_SQUARED) {
                    dedupedCommands.push(command);
                } else {
                    skippedCount++;
                }
            } else {
                dedupedCommands.push(command);
            }
        }
    }

    const filteredCommands: Command[] = [];
    for (let i = 0; i < dedupedCommands.length; i++) {
        if (i == 0) {
            filteredCommands.push(dedupedCommands[0]);
        } else {
            const currentCommand = dedupedCommands[i];
            const previousCommand = filteredCommands[filteredCommands.length - 1];
            if (previousCommand === 'p0' && currentCommand === 'p1') {
                //verify that we were p1 before that last p0
                for (let i = filteredCommands.length - 2; i >= 0; i--) {
                    const command = filteredCommands[i];
                    if (typeof command === 'string' && command.charAt(0) === 'p') {
                        if (command.charAt(1) === '1') {
                            // all is well
                            break;
                        } else {
                            throw new Error('Inconsistent pen movement');
                        }
                    }
                }
                filteredCommands.pop();
            } else {
                filteredCommands.push(currentCommand);
            }
        }
    }

    console.log(`Deduplicated commands, skipped ${skippedCount} commands`);
    return filteredCommands;
}