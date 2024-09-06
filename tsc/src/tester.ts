import { renderCommandsToSvg } from "./toSvgJson";
import { vectorizeImageData } from './vectorizer';
import { renderSvgJsonToCommands } from "./toCommands";
import path from 'path';
import * as fs from 'fs';
import {loadImage, createCanvas} from 'canvas';
import { loadPaper } from './paperLoader';

const paper = loadPaper();

const width = 1000;
const renderScaleFactor = 2;

function updater(status: string) {
    console.log(status);
}

async function main() {
    const dirPath = path.join(__dirname, '../svgs');
    const inDir = fs.opendirSync(dirPath);

    const outDirPath = path.join(__dirname, '../svgs/out/');
    

    let dirEntry = inDir.readSync();
    while (dirEntry) {
        if (dirEntry.isFile() && dirEntry.name.endsWith(".svg")) {
            if (dirEntry.name == "albert-einstein.svg") {
                console.log(`processing ${dirEntry.name}`);

                const file = fs.readFileSync(path.join(dirEntry.parentPath, dirEntry.name));
                const svgString = file.toString();
                const [imageData, svgWidth, svgHeight] = await getImageData(svgString, renderScaleFactor);

                const vectorizedSvg = vectorizeImageData(imageData);
                const vectorizedJson = convertSvgToSvgJson(vectorizedSvg);

                const height = Math.floor(svgHeight * (width / svgWidth));
                
                const result = await renderSvgJsonToCommands(
                    vectorizedJson,
                    [1, 0, 0, 1, 0, 0],
                    width,
                    height,
                    0,
                    0,
                    4,
                    updater
                );
                const resultSvgString = renderCommandsToSvg(result.commands, width, height, updater);
                const fullResultPath = path.join(outDirPath, dirEntry.name);
                fs.writeFileSync(fullResultPath, resultSvgString);
            }
            
        }
        dirEntry = inDir.readSync();
    }
};

async function getImageData(svgString: string, renderScaleFactor: number): Promise<[ImageData, number, number]> {
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
    ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, scaledWidth, scaledHeight);
    
    // Get the ImageData from the canvas
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const fullImageData: ImageData = { ...imageData, colorSpace: "srgb", height: canvas.height, width: canvas.width};

    return [fullImageData, svgWidth, svgHeight];
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

main();

