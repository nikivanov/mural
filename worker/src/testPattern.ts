import { Command, RequestTypes, updateStatusFn } from './types';
import { trimCommands } from './trimmer';
import { dedupeCommands } from './deduplicator';
import { measureDistance } from './measurer';
import { renderCommandsToSvgJson } from './toSvgJson';

const BOUNCE_DISTANCE_MM = 20;
const BOUNCE_COUNT = 10;

export function renderTestPattern(
    request: RequestTypes.RenderTestPatternRequest,
    updateStatus: updateStatusFn,
): { commands: string[]; svgJson: string; distance: number; drawDistance: number } {
    const { homeX, homeY, maxX, rectHeight, squareSize } = request;
    updateStatus('Generating test pattern');

    const half = squareSize / 2;
    const sq = {
        tl: { x: homeX - half, y: homeY - half },
        tr: { x: homeX + half, y: homeY - half },
        br: { x: homeX + half, y: homeY + half },
        bl: { x: homeX - half, y: homeY + half },
    };

    const rawCommands: Command[] = [];

    const drawSquare = () => {
        rawCommands.push({ x: sq.tl.x, y: sq.tl.y });
        rawCommands.push('p1');
        rawCommands.push({ x: sq.tr.x, y: sq.tr.y });
        rawCommands.push({ x: sq.br.x, y: sq.br.y });
        rawCommands.push({ x: sq.bl.x, y: sq.bl.y });
        rawCommands.push({ x: sq.tl.x, y: sq.tl.y });
        rawCommands.push('p0');
    };

    // Moves to x, sitting BOUNCE_DISTANCE_MM below the top edge, then bounces
    // up to the top edge and back down BOUNCE_COUNT times.
    const bounceAt = (x: number, label: string) => {
        updateStatus(label);
        const yNear = homeY + BOUNCE_DISTANCE_MM;
        rawCommands.push({ x, y: yNear });
        for (let i = 0; i < BOUNCE_COUNT; i++) {
            rawCommands.push({ x, y: homeY });
            rawCommands.push({ x, y: yNear });
        }
    };

    rawCommands.push('p0');
    drawSquare();

    const halfWidth = maxX / 2;
    bounceAt(homeX, 'Stress-testing at center');
    bounceAt(homeX - halfWidth, 'Stress-testing at left');
    bounceAt(homeX + halfWidth, 'Stress-testing at right');

    drawSquare();

    const trimmed = trimCommands(rawCommands);
    const deduped = dedupeCommands(trimmed);

    deduped.unshift(`h${rectHeight}`);
    const distances = measureDistance(deduped);
    const totalDistance = +distances.totalDistance.toFixed(1);
    deduped.unshift(`d${totalDistance}`);

    const commandStrings = deduped.map((c) =>
        typeof c === 'string' ? c : `${c.x} ${c.y}`,
    );

    const svgJson = renderCommandsToSvgJson(commandStrings, maxX, rectHeight, updateStatus);

    return {
        commands: commandStrings,
        svgJson,
        distance: totalDistance,
        drawDistance: +distances.drawDistance.toFixed(1),
    };
}
