import { loadPaper } from './paperLoader';
//import {dumpStringAsSvg} from './utils';
import {Potrace} from './tracer';


const paper = loadPaper();

const WHITE_COLOR = new paper.Color("white");

export function CreatePathsFromColorMatrix(colorMatrix: paper.Color[][]): string {
    const width = colorMatrix[0].length;
    const height = colorMatrix.length;

    const data: (1|0)[] = [];
    for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
            let bmColor: (1|0) = 0;
            const currentColor = colorMatrix[row][column];
            
            if (currentColor.alpha > 0 && colorDistance(currentColor, WHITE_COLOR) > 0.1) {
                bmColor = 1;
            }

            data.push(bmColor);
        }
    }

    const tracer = Potrace();
    tracer.setBitmap(width, height, data);
    const svgString: string = tracer.getSVG(1);

    //dumpStringAsSvg(svgString);
    return svgString;
}

function colorDistance(color1: paper.Color, color2: paper.Color) {
    return (color2.red - color1.red) ** 2 + (color2.green - color1.green) ** 2 + (color2.blue - color1.blue) ** 2;
}

