import { Command } from './types';
import { loadPaper } from './paperLoader';

const paper = loadPaper();

export function renderPathsToCommands(paths: paper.Path[], width: number, height: number): Command[] {
    const viewRectangle = new paper.Rectangle(0, 0, width, height);
    return paths.flatMap(p => {
        if (p.segments.length < 2) {
            return [];
        }

        const commands: Command[] = ['p0'];
        let started = false;
        let firstSegment: paper.Segment | null = null;
        for (const segment of p.segments) {
            if (viewRectangle.contains(segment.point)) {
                commands.push({
                    x: segment.point.x,
                    y: segment.point.y,
                }); 
                if (!started) {
                    firstSegment = segment;
                    commands.push('p1');
                    started = true;
                }
            }
            
        }
        
        if (firstSegment && p.closed) {
            commands.push({
                x: firstSegment.point.x,
                y: firstSegment.point.y,
            }); 
        }

        return commands;
    });
}

