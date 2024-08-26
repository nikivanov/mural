import { renderCommandsToSvgJson } from "./toSvgJson";
import { renderSvgToCommands } from "./toCommands";
import path from 'path';
import * as fs from 'fs';
import paper from 'paper'

const width = 1000;

function updater(status: string) {
    console.log(status);
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

async function main() {
    const inDir = fs.opendirSync(path.join(__dirname, '../svgs/in/'));

    const outDirPath = path.join(__dirname, '../svgs/out/');
    

    let dirEntry = inDir.readSync();
    while (dirEntry) {
        if (dirEntry.isFile() && dirEntry.name.endsWith(".svg")) {
            if (dirEntry.name == "albert-einstein.svg") {
                console.log(`processing ${dirEntry.name}`);

                const file = fs.readFileSync(dirEntry.path);
                const svgString = file.toString();
                
                const result = await renderSvgToCommands(svgString, 1, 0,0,0,0,width, 4, updater);
                const resultJson = renderCommandsToSvgJson(result.commands, width, result.height, updater);
                const resultSvgString = getSvgFromSvgJson(resultJson, width, result.height);
                const fullResultPath = path.join(outDirPath, dirEntry.name);
                fs.writeFileSync(fullResultPath, resultSvgString);
            }
            
        }
        dirEntry = inDir.readSync();
    }
};

main();

