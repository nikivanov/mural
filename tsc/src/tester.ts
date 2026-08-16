import { renderCommandsToSvgJson } from "./toSvgJson";
import { vectorizeImageData } from './vectorizer';
import { renderSvgJsonToCommands } from "./toCommands";
import path from 'path';
import * as fs from 'fs';
import { loadPaper } from './paperLoader';
import { RequestTypes } from "./types";

const paper = loadPaper();

const width = 1000;
const renderScaleFactor = 2;

function updater(status: string) {
    console.log(status);
}

async function main_vectorRasterVector() {
    const dirPath = path.join(__dirname, '../svgs');
    const inDir = fs.opendirSync(dirPath);

    const outDirPath = path.join(__dirname, '../svgs/out/');
    

    let dirEntry = inDir.readSync();
    while (dirEntry) {
        if (dirEntry.isFile() && dirEntry.name.endsWith(".svg")) {
            if (dirEntry.name == "finitecurve.svg") {
                console.log(`processing ${dirEntry.name}`);

                const file = fs.readFileSync(path.join(dirEntry.path, dirEntry.name));
                const svgString = file.toString();
                const [imageData, svgWidth, svgHeight] = await getImageData(svgString, renderScaleFactor);

                const vectorizedSvg = vectorizeImageData(imageData, 2);
                const vectorizedJson = convertSvgToSvgJson(vectorizedSvg);

                const height = Math.floor(svgHeight * (width / svgWidth));
                
                const request: RequestTypes.RenderSVGRequest = {
                    svgJson: vectorizedJson,
                    height,
                    width,
                    svgWidth: width * renderScaleFactor,
                    svgHeight: height * renderScaleFactor,
                    homeX: 0,
                    homeY: 0,
                    infillDensity: 4,
                    type: 'renderSvg',
                    flattenPaths: false,
                };
                const result = await renderSvgJsonToCommands(request, updater);
                const resultSvgJsonString = renderCommandsToSvgJson(result.commands, width, height, updater);
                const resultSvg = convertSvgJsonToSvg(resultSvgJsonString, width, height);
                const fullResultPath = path.join(outDirPath, dirEntry.name);
                fs.writeFileSync(fullResultPath, resultSvg);
            }
            
        }
        dirEntry = inDir.readSync();
    }
};

async function getImageData(svgString: string, renderScaleFactor: number): Promise<[ImageData, number, number]> {
    // required lazily: it's a native module that isn't always built in every
    // environment (e.g. `npm install --ignore-scripts`), and most tester
    // entry points don't need it.
    const {loadImage, createCanvas} = require('canvas');

    const jsdom = require("jsdom");
    const window = new jsdom.JSDOM().window;
    const parser = new window.DOMParser();
    const serializer = new window.XMLSerializer();

    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;
    const svgWidth = parseFloat(svgElement.getAttribute('width')!);
    const svgHeight = parseFloat(svgElement.getAttribute('height')!);
    
    const scale = Math.min(width / svgWidth) * renderScaleFactor;
    const scaledHeight = svgHeight * scale;
    const scaledWidth = svgWidth * scale;

    svgElement.setAttribute('width', scaledWidth.toString());
    svgElement.setAttribute('height', scaledHeight.toString());

    const scaledSvgString = serializer.serializeToString(svgElement);

    const image = await loadImage(`data:image/svg+xml;base64,${btoa(scaledSvgString)}`);
    
    const canvas = createCanvas(scaledWidth, scaledHeight);
    const ctx = canvas.getContext('2d');
    
    // Draw the image onto the canvas
    ctx.drawImage(image, 0, 0, scaledWidth, scaledHeight);
    
    // Get the ImageData from the canvas
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const dataMap = new Map();
    for (const val of imageData.data) {
        if (!dataMap.has(val)) {
            dataMap.set(val, 1);
        } else {
            dataMap.set(val, dataMap.get(val) + 1);
        }
    }
    const kvps = Array.from(dataMap);
    kvps.sort((a, b) => b[1] - a[1]);
    const fullImageData: ImageData = { ...imageData, colorSpace: "srgb", height: canvas.height, width: canvas.width};

    return [fullImageData, svgWidth, svgHeight];
}

async function main_pathTracer() {
    const dirPath = path.join(__dirname, '../svgs');
    const inDir = fs.opendirSync(dirPath);

    const outDirPath = path.join(__dirname, '../svgs/out/');
    

    let dirEntry = inDir.readSync();
    while (dirEntry) {
        if (dirEntry.isFile() && dirEntry.name.endsWith(".svg")) {
            if (dirEntry.name == "finitecurve.svg") {
                console.log(`processing ${dirEntry.name}`);

                const file = fs.readFileSync(path.join(dirEntry.path, dirEntry.name));
                const svgString = file.toString();

                const jsdom = require("jsdom");
                const window = new jsdom.JSDOM().window;
                const parser = new window.DOMParser();

                const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
                const svgElement = svgDoc.documentElement;
                const svgWidth = parseFloat(svgElement.getAttribute('width')!);
                const svgHeight = parseFloat(svgElement.getAttribute('height')!);

                const height = Math.floor(svgHeight * (width / svgWidth));

                const svgJson = convertSvgToSvgJson(svgString);
                const request: RequestTypes.RenderSVGRequest = {
                    svgJson: svgJson,
                    height,
                    width,
                    svgWidth,
                    svgHeight,
                    homeX: 0,
                    homeY: 0,
                    infillDensity: 0,
                    type: 'renderSvg',
                    flattenPaths: false,
                };
                const result = await renderSvgJsonToCommands(request, updater);
                fs.writeFileSync(path.join(__dirname, '../svgs/out/commands.txt'), result.commands.join('\n'));
                const resultSvgJsonString = renderCommandsToSvgJson(result.commands, width, height, updater);
                const resultSvg = convertSvgJsonToSvg(resultSvgJsonString, width, height);
                const fullResultPath = path.join(outDirPath, dirEntry.name);
                fs.writeFileSync(fullResultPath, resultSvg);
            }
            
        }
        dirEntry = inDir.readSync();
    }
}

// Runs every SVG in images/test_images through the full renderSvgJsonToCommands
// pipeline and prints pen-up travel and command-count totals, so optimizer
// changes can be quantified before/after (e.g. via `git stash`).
async function main_quantify() {
    const dirPath = path.join(__dirname, '../../images/test_images');
    const targetWidthMm = 300;

    const fileNames = fs.readdirSync(dirPath).filter(f => f.endsWith('.svg')).sort();

    for (const fileName of fileNames) {
        const svgString = fs.readFileSync(path.join(dirPath, fileName)).toString();

        const widthMatch = svgString.match(/\swidth="([0-9.]+)(?:px)?"/);
        const heightMatch = svgString.match(/\sheight="([0-9.]+)(?:px)?"/);
        if (!widthMatch || !heightMatch) {
            console.log(`${fileName}: skipped, could not parse width/height`);
            continue;
        }

        const svgWidth = parseFloat(widthMatch[1]);
        const svgHeight = parseFloat(heightMatch[1]);
        const height = Math.round(svgHeight * (targetWidthMm / svgWidth));

        const svgJson = convertSvgToSvgJson(svgString);
        const request: RequestTypes.RenderSVGRequest = {
            svgJson,
            width: targetWidthMm,
            height,
            svgWidth,
            svgHeight,
            homeX: 0,
            homeY: 0,
            infillDensity: 3,
            type: 'renderSvg',
            flattenPaths: false,
        };

        const result = await renderSvgJsonToCommands(request, () => {});
        const penUpDistance = +(result.distance - result.drawDistance).toFixed(1);

        console.log(`${fileName}: commands=${result.commands.length} penUpDistance=${penUpDistance} totalDistance=${result.distance} drawDistance=${result.drawDistance}`);
    }
}

function convertSvgToSvgJson(svgString: string) {
    const size = new paper.Size(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    paper.setup(size);
    const svg = paper.project.importSVG(svgString, {
        expandShapes: true,
        applyMatrix: true,
    });
    const json = svg.exportJSON();
    paper.project.remove();

    return json;
}

function convertSvgJsonToSvg(svgJson: string, width: number, height: number): string {
    const size = new paper.Size(width, height);
    paper.setup(size);
    paper.project.importJSON(svgJson);
    const svg = paper.project.exportSVG({
        asString: true,
    }) as string;
    paper.project.remove();
    return svg;
}

main_quantify();

