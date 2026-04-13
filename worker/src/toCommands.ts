import { Command, RequestTypes, updateStatusFn } from './types';
import { generatePaths } from './generator';
import { generateInfills } from './infill';
import { optimizePaths } from './optimizer';
import { renderPathsToCommands } from './renderer';
import { trimCommands } from './trimmer';
import { dedupeCommands } from './deduplicator';
import { measureDistance } from './measurer';
import { loadPaper } from './paperLoader';
import { flattenPaths } from './flattener';

const paper = loadPaper();

export async function renderSvgJsonToCommands(
    request: RequestTypes.RenderSVGRequest,
    updateStatusFn: updateStatusFn,
) {
    paper.setup({width: request.width, height: request.height});

    updateStatusFn("Importing");
    const svg = paper.project.importJSON(request.svgJson);

    // scale the document so its coordinates match the world 1:1, in mm
    const projectToViewRatio = request.width / request.svgWidth;

    console.log(`Scaling by ${projectToViewRatio}`);
    svg.scale(projectToViewRatio, {x: 0, y: 0});
    svg.applyMatrix = true;

    updateStatusFn("Generating paths");
    const paths = generatePaths(svg);

    paths.forEach(p => p.flatten(0.5));

    if (request.flattenPaths) {
        flattenPaths(paths, updateStatusFn);
    }

    updateStatusFn("Generating infill");
    const pathsWithInfills = generateInfills(paths, request.infillDensity);

    updateStatusFn("Optimizing paths");
    const optimizedPaths = optimizePaths(pathsWithInfills, request.homeX, request.homeY);

    updateStatusFn("Generating commands");
    const commands = renderPathsToCommands(optimizedPaths, request.width, request.height);
    commands.push('p0');

    const trimmedCommands = trimCommands(commands);

    updateStatusFn("Simplifying commands");

    const dedupedCommands = dedupeCommands(trimmedCommands);

    updateStatusFn("Measuring total distance");
    dedupedCommands.unshift(`h${request.height}`);
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
