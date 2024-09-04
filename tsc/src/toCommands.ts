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
import { parseImageData } from './imageDataParser';
import { CreatePathsFromColorMatrix } from './vectorizer';

const paper = loadPaper();

export async function renderRasterToCommands(raster: ImageData, renderScale: number, homeX: number, homeY: number, infillDensity: InfillDensity, updateStatusFn: updateStatusFn) {
    updateStatusFn("Rendering");
    
    const colorMatrix = parseImageData(raster);

    updateStatusFn("Vectorizing");
    const processedSvgString = CreatePathsFromColorMatrix(colorMatrix);

    const scaledWidth = raster.width / renderScale; 
    const scaledHeight = raster.height / renderScale;
    paper.setup({width: scaledWidth, height: scaledHeight});

    updateStatusFn("Importing");
    const svg = paper.project.importSVG(processedSvgString);
    svg.fitBounds({x: 0, y: 0, width: scaledWidth, height: scaledHeight});

    svg.matrix = new paper.Matrix(1 / renderScale, 0, 0, 1 / renderScale, 0, 0);

    updateStatusFn("Clipping");
    clipPaths(svg);

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
    dedupedCommands.unshift(`h${scaledHeight}`);
    const distances = measureDistance(dedupedCommands);
    const totalDistance = +distances.totalDistance.toFixed(1);
    dedupedCommands.unshift(`d${totalDistance}`);

    const commandStrings = dedupedCommands.map(stringifyCommand);
    return {
        commands: commandStrings,
        height: scaledHeight,
        width: scaledWidth,
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
