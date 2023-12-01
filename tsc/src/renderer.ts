import { Command } from './types';

export function renderPathsToCommands(paths: paper.Path[]): Command[] {
    return paths.flatMap(p => {
        if (p.segments.length < 2) {
            return [];
        }

        const commands: Command[] = ['p0'];
        const firstSegment = p.segments[0];

        commands.push({
            x: firstSegment.point.x,
            y: firstSegment.point.y,
        });

        commands.push('p1');

        for (const segment of p.segments.slice(1)) {
            commands.push({
                x: segment.point.x,
                y: segment.point.y,
            }); 
        }

        if (p.closed) {
            commands.push({
                x: firstSegment.point.x,
                y: firstSegment.point.y,
            }); 
        }

        return commands;
    });
}