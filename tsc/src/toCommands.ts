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
import { Canvas, createCanvas, loadImage } from 'canvas';
import { dumpCanvas, dumpStringAsSvg, dumpSVG } from './utils';
import * as fs from 'fs';
import { JSDOM } from 'jsdom';

const paper = loadPaper();

export async function renderSvgToCommands(svg: string, scale: number, x: number, y: number, homeX: number, homeY: number, width: number, infillDensity: InfillDensity, doFlattenPaths: boolean, updateStatusFn: updateStatusFn) {
    const [canvas, height] = await renderSVGToCanvas(svg, width);
    updateStatusFn("Rasterizing");
    const colorMatrix = rasterize(canvas);
    const paths = await CreatePathsFromColorMatrix(colorMatrix);
    
    const paperCanvas = createCanvas(width, height);
    paper.setup(paperCanvas);

    // updateStatusFn("Importing");
    // const svg = paper.project.importJSON(svgJson);

    

    // svg.fitBounds({
    //     x: 0,
    //     y: 0,
    //     width,
    //     height,
    // });

    // updateStatusFn("Clipping");
    // clipPaths(svg);

    // dumpSVG(svg);
    
    // svg.matrix = new paper.Matrix(scale, 0, 0, scale, x, y);

    // const heightNeeded = svg.bounds.y + svg.bounds.height;
    // if (heightNeeded > height) {
    //     svg.view.viewSize.height = heightNeeded;
    // }

    // const heightUsed = svg.view.viewSize.height;

    // clipPaths(svg);

    // updateStatusFn("Rasterizing");
    // const colorMatrix = rasterize(svg, 1);


    // updateStatusFn("Generating paths");
    // const paths = await CreatePathsFromColorMatrix(colorMatrix);
    // //const paths = generatePaths(svg);
    
    // paths.forEach(p => p.flatten(0.5));

    // if (doFlattenPaths) {
    //     flattenPaths(paths, updateStatusFn);
    // }

    // updateStatusFn("Generating infill");
    // const pathsWithInfills = generateInfills(paths, infillDensity);

    // updateStatusFn("Optimizing paths");
    // const optimizedPaths = optimizePaths(pathsWithInfills, homeX, homeY);

    // updateStatusFn("Rendering commands");
    // const commands = renderPathsToCommands(optimizedPaths);
    // commands.push('p0');

    // const trimmedCommands = trimCommands(commands);

    // const dedupedCommands = dedupeCommands(trimmedCommands);

    // updateStatusFn("Measuring total distance");
    // dedupedCommands.unshift(`h${heightUsed}`);
    // const distances = measureDistance(dedupedCommands);
    // const totalDistance = +distances.totalDistance.toFixed(1);
    // dedupedCommands.unshift(`d${totalDistance}`);

    // const commandStrings = dedupedCommands.map(stringifyCommand);
    // return {
    //     commands: commandStrings,
    //     height,
    //     distance: totalDistance,
    //     drawDistance: +distances.drawDistance.toFixed(1),
    // };
}

function stringifyCommand(cmd: Command): string {
    if (typeof cmd === 'string') {
        return cmd;
    } else {
        return `${cmd.x} ${cmd.y}`;
    }
}

async function renderSVGToCanvas(svg: string, width: number): Promise<[Canvas, number]> {
    const svgBuffer = Buffer.from(svg);
    const img = await loadImage(`data:image/svg+xml;base64,${svgBuffer.toString('base64')}`);

    const svgWidth = img.width;
    const svgHeight = img.height;

    const scale = Math.min(width / svgWidth);
    const height = svgHeight * scale;

    const dom = new JSDOM();
    const parser = new dom.window.DOMParser();
    const serializer = new dom.window.XMLSerializer();

    const svgDoc = parser.parseFromString(svg, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;
    svgElement.setAttribute('width', width.toString());
    svgElement.setAttribute('height', height.toString());

    const scaledSvgString = serializer.serializeToString(svgElement);

    const scaledSvgBuffer = Buffer.from(scaledSvgString);
    const scaledImg = await loadImage(`data:image/svg+xml;base64,${scaledSvgBuffer.toString('base64')}`);
    
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d')!;

    ctx.drawImage(scaledImg, 0,0, width, height);
    return [canvas, height];
  }


function getHeight(svg: string, width: number): number {
    // const fittingCanvas = new OffscreenCanvas(width, Number.MAX_SAFE_INTEGER);
    // const ctx = fittingCanvas.getContext('2d');
    
    // const sizeBeforeFitting = new paper.Size(width, Number.MAX_SAFE_INTEGER);
    // paper.setup(sizeBeforeFitting);

    // const svgBeforeFitting = paper.project.importJSON(svgJson);

    // svgBeforeFitting.fitBounds({
    //     x: 0,
    //     y: 0,
    //     width: sizeBeforeFitting.width,
    //     height: sizeBeforeFitting.height,
    // });

    // const height = Math.floor(svgBeforeFitting.bounds.height);

    // paper.project.remove();

    // return height;
    return 5;
}