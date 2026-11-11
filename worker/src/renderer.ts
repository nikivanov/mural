import { Command, CoordinateCommand } from './types';
import paper from 'paper';

const EDGE_EPSILON = 1e-6;

export function renderPathsToCommands(paths: paper.Path[], width: number, height: number): Command[] {
    const commands: Command[] = [];
    for (const p of paths) {
        if (p.segments.length < 2) {
            continue;
        }

        const points = p.segments.map(s => s.point);
        if (p.closed) {
            points.push(p.firstSegment.point);
        }

        let penDownAt: CoordinateCommand | null = null;
        for (let i = 0; i < points.length - 1; i++) {
            const clipped = clipSegment(points[i], points[i + 1], width, height);
            if (!clipped) {
                penDownAt = null;
                continue;
            }

            const [start, end] = clipped;
            if (!penDownAt || penDownAt.x !== start.x || penDownAt.y !== start.y) {
                commands.push('p0', start, 'p1');
            }
            commands.push(end);
            penDownAt = end;
        }
    }

    return commands;
}

/**
 * Liang–Barsky clip of segment a→b against [0, width] × [0, height].
 * Returns the visible portion, or null if none of it is on the canvas.
 */
function clipSegment(
    a: paper.Point,
    b: paper.Point,
    width: number,
    height: number,
): [CoordinateCommand, CoordinateCommand] | null {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    let t0 = 0;
    let t1 = 1;

    const edges: [number, number][] = [
        [-dx, a.x + EDGE_EPSILON],
        [dx, width + EDGE_EPSILON - a.x],
        [-dy, a.y + EDGE_EPSILON],
        [dy, height + EDGE_EPSILON - a.y],
    ];

    for (const [p, q] of edges) {
        if (p === 0) {
            if (q < 0) return null;
        } else {
            const t = q / p;
            if (p < 0) {
                if (t > t1) return null;
                if (t > t0) t0 = t;
            } else {
                if (t < t0) return null;
                if (t < t1) t1 = t;
            }
        }
    }

    const at = (t: number): CoordinateCommand => {
        // use the exact endpoints when unclipped so consecutive segments join without a pen lift
        const pt = t === 0 ? a : t === 1 ? b : { x: a.x + t * dx, y: a.y + t * dy };
        return { x: clamp(pt.x, 0, width), y: clamp(pt.y, 0, height) };
    };

    return [at(t0), at(t1)];
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}
