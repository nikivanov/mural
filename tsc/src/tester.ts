import { renderCommandsToSvgJson } from "./toSvgJson";
import { renderSvgToCommands } from "./toCommands";
import path from 'path';
import * as fs from 'fs';
import paper from 'paper'

const width = 1000;
function getSvgJson(svgString: string) {
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

function getSvgFromSvgJson(svgJson: string, width: number, height: number) {
    const size = new paper.Size(width, height);
    paper.setup(size);

    paper.project.importJSON(svgJson);
    const svgString = paper.project.exportSVG({
        asString: true,
    }) as string;
    
    paper.project.remove();

    return svgString;
}

function updater(status: string) {
    console.log(status);
}

const fullPath = path.join(__dirname, '../svgs/albert-einstein.svg');
const file = fs.readFileSync(fullPath);
const svgString = file.toString();
const svgJson = getSvgJson(svgString);
const result = renderSvgToCommands(svgJson, 1, 0,0,0,0,width, 4, true, updater);
const resultJson = renderCommandsToSvgJson(result.commands, width, result.height, updater);
const resultSvgString = getSvgFromSvgJson(resultJson, width, result.height);
const fullResultPath = path.join(__dirname, '../svgs/albert-einstein-processed.svg');
fs.writeFileSync(fullResultPath, resultSvgString);
console.log("hi")


