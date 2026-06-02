import { Command, CoordinateCommand } from "./types";
import { getLastPoint, distanceBetweenPoints } from "./utils";

export const PEN_LIFT_THRESHOLD_MM = 1.0;

export function dedupeCommands(commands: Command[], penLiftThresholdMm = PEN_LIFT_THRESHOLD_MM): Command[] {
    const dedupedCommands: Command[] = [];
    for (const command of commands) {
        if (typeof command === 'string') {
            if (dedupedCommands.length === 0 || dedupedCommands[dedupedCommands.length - 1] !== command) {
                dedupedCommands.push(command);
            }
        } else {
            const lastCommand = getLastPoint(dedupedCommands);
            if (lastCommand) {
                if (command.x !== lastCommand.x || command.y !== lastCommand.y) {
                    dedupedCommands.push(command);
                }
            } else {
                dedupedCommands.push(command);
            }
        }
    }

    const filteredCommands: Command[] = [];
    let i = 0;
    while (i < dedupedCommands.length) {
        const currentCommand = dedupedCommands[i];

        if (currentCommand === 'p0') {
            // Look ahead to find the next p1 and measure travel distance
            const lastDrawnPoint = getLastPoint(filteredCommands);
            const travelCoords: CoordinateCommand[] = [];
            let j = i + 1;
            let foundP1 = false;

            while (j < dedupedCommands.length) {
                const ahead = dedupedCommands[j];
                if (ahead === 'p1') { foundP1 = true; break; }
                if (ahead === 'p0') break;
                if (typeof ahead !== 'string') travelCoords.push(ahead);
                j++;
            }

            if (foundP1) {
                // Compute travel distance from last drawn point through travel coords
                let travelDist = 0;
                let prev: CoordinateCommand | undefined = lastDrawnPoint;
                for (const pt of travelCoords) {
                    if (prev) travelDist += distanceBetweenPoints(prev, pt);
                    prev = pt;
                }

                if (travelDist <= penLiftThresholdMm) {
                    // Keep pen down: emit travel as draw moves, skip p0 and p1
                    for (const pt of travelCoords) filteredCommands.push(pt);
                    i = j + 1; // skip past the p1
                    continue;
                }
            }

            filteredCommands.push(currentCommand);
        } else {
            filteredCommands.push(currentCommand);
        }

        i++;
    }

    return filteredCommands;
}
