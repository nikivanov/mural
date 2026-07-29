import { Command, RequestTypes, updateStatusFn } from './types';
import { trimCommands } from './trimmer';
import { dedupeCommands } from './deduplicator';
import { measureDistance } from './measurer';
import { renderCommandsToSvgJson } from './toSvgJson';

export function renderTestPattern(
    request: RequestTypes.RenderTestPatternRequest,
    updateStatus: updateStatusFn,
): { commands: string[]; svgJson: string; distance: number; drawDistance: number } {
    const { homeX, homeY, maxX, rectHeight, squareSize, loops } = request;
    updateStatus('Generating test pattern');

    const half = squareSize / 2;
    const sq = {
        tl: { x: homeX - half, y: homeY - half },
        tr: { x: homeX + half, y: homeY - half },
        br: { x: homeX + half, y: homeY + half },
        bl: { x: homeX - half, y: homeY + half },
    };
    // Drawing-area corners, cyclic order TL, BL, BR, TR
    const corners: { x: number; y: number }[] = [
        { x: 0, y: 0 },
        { x: 0, y: rectHeight },
        { x: maxX, y: rectHeight },
        { x: maxX, y: 0 },
    ];

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

    rawCommands.push('p0');
    drawSquare();

    // Transit (pen up) to the drawing-area corners, ending at TR (index 3).
    rawCommands.push({ x: sq.tl.x, y: 0 });
    rawCommands.push(corners[0]);
    rawCommands.push(corners[1]);
    rawCommands.push(corners[2]);
    rawCommands.push(corners[3]);

    // Stress-test loops, alternating perimeter / diagonal-bounce, always starting
    // and ending at index 3 (TR) so loop shape can be freely alternated.
    const startIdx = 3;
    for (let k = 0; k < loops; k++) {
        updateStatus(`Loop ${k + 1} of ${loops}`);
        const offsets = k % 2 === 0 ? [1, 2, 3, 0] : [2, 3, 1, 0];
        for (const o of offsets) rawCommands.push(corners[(startIdx + o) % 4]);
    }

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
