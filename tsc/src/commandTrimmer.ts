import { Command } from "./types";

export function trimCommands<T extends Command>(commands: T[], precision = 1): Command[] {
    return commands.map(cmd => {
        if (typeof cmd === 'string') {
            return cmd;
        } else {
            return {
                x: +cmd.x.toFixed(precision),
                y: +cmd.y.toFixed(precision),
            }
        }
    });
}