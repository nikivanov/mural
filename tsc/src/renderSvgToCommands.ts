import { Command, InfillDensity, updateStatusFn } from './types';
import { clipPaths } from './pathClipper';
import { generatePaths } from './pathGenerator';
import { generateInfills } from './infillGenerator';
import { optimizePaths } from './pathOptimizer';
import { renderPathsToCommands } from './commandRenderer';
import { trimCommands } from './commandTrimmer';
import { dedupeCommands } from './commandDeduplicator';
import { measureDistance } from './distanceMeasurer';

const paper = window.paper as paper.PaperScope;

export function renderSvgToCommands(svgString: string, scale: number, x: number, y: number, width: number, infillDensity: InfillDensity, window: Window, updateStatusFn: updateStatusFn): string[] {
    const height = getHeight(svgString, width);

    paper.install(window);
    const size = new paper.Size(width, height);
    paper.setup(size);

    updateStatusFn("Importing");
    const svg = paper.project.importSVG(svgString, {
        expandShapes: true,
        applyMatrix: true,
    });

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

    updateStatusFn("Generating paths");
    const paths = generatePaths(svg);
    
    paths.forEach(p => p.flatten(0.5));

    updateStatusFn("Generating infill");
    const pathsWithInfills = generateInfills(paths, infillDensity);

    updateStatusFn("Optimizing paths");
    const optimizedPaths = optimizePaths(pathsWithInfills, width / 2, heightUsed / 2);

    updateStatusFn("Rendering commands");
    const commands = renderPathsToCommands(optimizedPaths);
    commands.push('p0');

    const trimmedCommands = trimCommands(commands);

    const dedupedCommands = dedupeCommands(trimmedCommands);

    updateStatusFn("Measuring total distance");
    dedupedCommands.unshift(`h${heightUsed}`);
    const totalDistance = measureDistance(dedupedCommands);
    dedupedCommands.unshift(`d${+totalDistance.toFixed(1)}`);

    const commandStrings = dedupedCommands.map(stringifyCommand);
    return commandStrings;
}

function stringifyCommand(cmd: Command): string {
    if (typeof cmd === 'string') {
        return cmd;
    } else {
        return `${cmd.x} ${cmd.y}`;
    }
}

function getHeight(svgString: string, width: number): number {
    const sizeBeforeFitting = new paper.Size(width, Number.MAX_SAFE_INTEGER);
    paper.setup(sizeBeforeFitting);

    const svgBeforeFitting = paper.project.importSVG(svgString, {
        expandShapes: true,
        applyMatrix: true,
    });

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