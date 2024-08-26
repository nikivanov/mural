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
import { rasterize } from './rasterizer';
import { CreatePathsFromColorMatrix } from './vectorizer';
import { Canvas, createCanvas, loadImage } from 'canvas';

import { JSDOM } from 'jsdom';

const paper = loadPaper();

export async function renderSvgToCommands(svgString: string, scale: number, x: number, y: number, homeX: number, homeY: number, width: number, infillDensity: InfillDensity, updateStatusFn: updateStatusFn) {
    updateStatusFn("Rendering");

    const renderingScale = 2;
    const [canvas, scaledWidth, scaledHeight] = await renderSVGToCanvas(svgString, width, renderingScale);
    const height = scaledHeight / renderingScale;
    
    updateStatusFn("Rasterizing");
    const colorMatrix = rasterize(canvas);

    updateStatusFn("Vectorizing");
    const processedSvgString = CreatePathsFromColorMatrix(colorMatrix);

    const paperCanvas = createCanvas(width, height);
    paper.setup(paperCanvas);

    updateStatusFn("Importing");
    const svg = paper.project.importSVG(processedSvgString);
    svg.fitBounds({x: 0, y: 0, width, height});

    svg.matrix = new paper.Matrix(scale, 0, 0, scale, x, y);

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
    dedupedCommands.unshift(`h${height}`);
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

async function renderSVGToCanvas(svg: string, width: number, scaleFactor: number): Promise<[Canvas, number, number]> {
    const svgBuffer = Buffer.from(svg);
    const img = await loadImage(`data:image/svg+xml;base64,${svgBuffer.toString('base64')}`);

    const svgWidth = img.width;
    const svgHeight = img.height;

    const scale = Math.min(width / svgWidth) * scaleFactor;
    const scaledHeight = svgHeight * scale;
    const scaledWidth = svgWidth * scale;


    const dom = new JSDOM();
    const parser = new dom.window.DOMParser();
    const serializer = new dom.window.XMLSerializer();

    const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;
    svgElement.setAttribute('width', scaledWidth.toString());
    svgElement.setAttribute('height', scaledHeight.toString());

    const scaledSvgString = serializer.serializeToString(svgElement);

    const scaledSvgBuffer = Buffer.from(scaledSvgString);
    const scaledImg = await loadImage(`data:image/svg+xml;base64,${scaledSvgBuffer.toString('base64')}`);

    const canvas = createCanvas(scaledWidth, scaledHeight);
    const ctx = canvas.getContext('2d')!;

    ctx.drawImage(scaledImg, 0, 0, scaledWidth, scaledHeight);
    return [canvas, scaledWidth, scaledHeight];
}
