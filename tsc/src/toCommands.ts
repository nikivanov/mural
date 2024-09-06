import { Command, InfillDensity, updateStatusFn } from './types';
import { generatePaths } from './generator';
import { generateInfills } from './infill';
import { optimizePaths } from './optimizer';
import { renderPathsToCommands } from './renderer';
import { trimCommands } from './trimmer';
import { dedupeCommands } from './deduplicator';
import { measureDistance } from './measurer';
import { loadPaper } from './paperLoader';

const paper = loadPaper();

export async function renderSvgJsonToCommands(
    svgJson: string,
    affine: number[],
    width: number,
    height: number,
    homeX: number,
    homeY: number,
    infillDensity: InfillDensity,
    updateStatusFn: updateStatusFn
) {
    paper.setup({width, height});

    updateStatusFn("Importing");
    const svg = paper.project.importJSON(svgJson);
    svg.fitBounds({x: 0, y: 0, width, height});

    svg.matrix = new paper.Matrix(affine[0], affine[1], affine[2], affine[3], affine[4], affine[5]);

    updateStatusFn("Generating paths");
    const paths = generatePaths(svg);

    paths.forEach(p => p.flatten(0.5));

    updateStatusFn("Generating infill");
    const pathsWithInfills = generateInfills(paths, infillDensity);

    updateStatusFn("Optimizing paths");
    const optimizedPaths = optimizePaths(pathsWithInfills, homeX, homeY);

    updateStatusFn("Generating commands");
    const commands = renderPathsToCommands(optimizedPaths);
    commands.push('p0');

    const trimmedCommands = trimCommands(commands);

    const dedupedCommands = dedupeCommands(trimmedCommands);

    updateStatusFn("Measuring total distance");
    dedupedCommands.unshift(`h${height}`);
    const distances = measureDistance(dedupedCommands);
    const totalDistance = +distances.totalDistance.toFixed(1);
    dedupedCommands.unshift(`d${totalDistance}`);

    const commandStrings = dedupedCommands.map(stringifyCommand);
    return {
        commands: commandStrings,
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
