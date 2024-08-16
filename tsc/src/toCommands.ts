import { Command, InfillDensity, updateStatusFn } from './types';
import { clipPaths } from './clipper';
import { generatePaths } from './generator';
import { generateInfills } from './infill';
import { optimizePaths } from './optimizer';
import { renderPathsToCommands } from './renderer';
import { trimCommands } from './trimmer';
import { dedupeCommands } from './deduplicator';
import { measureDistance } from './measurer';
import { loadPaper } from './paperLoader';
import { flattenPaths} from './flattener';
import {rasterize} from './rasterizer';
import {CreatePathsFromColorMatrix} from './vectorizer';
import { createCanvas } from 'canvas';

const paper = loadPaper();

export function renderSvgToCommands(svgJson: string, scale: number, x: number, y: number, homeX: number, homeY: number, width: number, infillDensity: InfillDensity, doFlattenPaths: boolean, updateStatusFn: updateStatusFn) {
    const height = getHeight(svgJson, width);

    const canvas = createCanvas(width, height);
    paper.setup(canvas);

    updateStatusFn("Importing");
    const svg = paper.project.importJSON(svgJson);

    svg.fitBounds({
        x: 0,
        y: 0,
        width,
        height,
    });

    updateStatusFn("Clipping");
    clipPaths(svg);
    
    svg.matrix = new paper.Matrix(scale, 0, 0, scale, x, y);

    const heightNeeded = svg.bounds.y + svg.bounds.height;
    if (heightNeeded > height) {
        svg.view.viewSize.height = heightNeeded;
    }

    const heightUsed = svg.view.viewSize.height;

    clipPaths(svg);

    updateStatusFn("Rasterizing");
    const colorMatrix = rasterize(svg, 1);


    updateStatusFn("Generating paths");
    const paths = CreatePathsFromColorMatrix(colorMatrix, width, height);
    //const paths = generatePaths(svg);
    
    paths.forEach(p => p.flatten(0.5));

    if (doFlattenPaths) {
        flattenPaths(paths, updateStatusFn);
    }

    updateStatusFn("Generating infill");
    const pathsWithInfills = generateInfills(paths, infillDensity);

    updateStatusFn("Optimizing paths");
    const optimizedPaths = optimizePaths(pathsWithInfills, homeX, homeY);

    updateStatusFn("Rendering commands");
    const commands = renderPathsToCommands(optimizedPaths);
    commands.push('p0');

    const trimmedCommands = trimCommands(commands);

    const dedupedCommands = dedupeCommands(trimmedCommands);

    updateStatusFn("Measuring total distance");
    dedupedCommands.unshift(`h${heightUsed}`);
    const distances = measureDistance(dedupedCommands);
    const totalDistance = +distances.totalDistance.toFixed(1);
    dedupedCommands.unshift(`d${totalDistance}`);

    const commandStrings = dedupedCommands.map(stringifyCommand);
    return {
        commands: commandStrings,
        height,
        distance: totalDistance,
        drawDistance: +distances.drawDistance.toFixed(1),
    };
}

function stringifyCommand(cmd: Command): string {
    if (typeof cmd === 'string') {
        return cmd;
    } else {
        return `${cmd.x} ${cmd.y}`;
    }
}

function getHeight(svgJson: string, width: number): number {
    const sizeBeforeFitting = new paper.Size(width, Number.MAX_SAFE_INTEGER);
    paper.setup(sizeBeforeFitting);

    const svgBeforeFitting = paper.project.importJSON(svgJson);

    svgBeforeFitting.fitBounds({
        x: 0,
        y: 0,
        width: sizeBeforeFitting.width,
        height: sizeBeforeFitting.height,
    });

    const height = Math.floor(svgBeforeFitting.bounds.height);

    paper.project.remove();

    return height;
}