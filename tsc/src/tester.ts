import { renderCommandsToSvgJson } from "./toSvgJson";
import { renderSvgToCommands } from "./toCommands";
import path from 'path';
import * as fs from 'fs';
import paper from 'paper'

const width = 1000;

function updater(status: string) {
    console.log(status);
}

async function main() {
    const fullPath = path.join(__dirname, '../svgs/albert-einstein.svg');
    const file = fs.readFileSync(fullPath);
    const svgString = file.toString();
    
    const result = await renderSvgToCommands(svgString, 1, 0,0,0,0,width, 4, true, updater);
    // const resultJson = renderCommandsToSvgJson(result.commands, width, result.height, updater);
    // const resultSvgString = getSvgFromSvgJson(resultJson, width, result.height);
    // const fullResultPath = path.join(__dirname, '../svgs/albert-einstein-processed.svg');
    // fs.writeFileSync(fullResultPath, resultSvgString);
    // console.log("hi")
};

main();

