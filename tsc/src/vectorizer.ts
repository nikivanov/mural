import { loadPaper } from './paperLoader';
import {Potrace} from './tracer';


const paper = loadPaper();

const WHITE_COLOR = new paper.Color("#FFFFFF");

export function vectorizeImageData(imageData: ImageData, turdSize: number): string {
    const colorMatrix: paper.Color[][] = []

    for (let row = 0; row < imageData.height; row++) {
        for (let column = 0; column < imageData.width; column++) {
            if (!colorMatrix[row]) {
                colorMatrix[row] = [];
            }
            const address = (row * imageData.width + column) * 4;
            const r = imageData.data[address];
            const g = imageData.data[address + 1];
            const b = imageData.data[address + 2];
            const a = imageData.data[address + 3];
            const color = new paper.Color(r / 255, g / 255, b / 255, a / 255);
            colorMatrix[row][column] = color;
        }
    }

    return createPathsFromColorMatrix(colorMatrix, turdSize);
}


function createPathsFromColorMatrix(colorMatrix: paper.Color[][], turdSize: number): string {
    const width = colorMatrix[0].length;
    const height = colorMatrix.length;

    const data: (1|0)[] = [];
    for (let row = 0; row < height; row++) {
        for (let column = 0; column < width; column++) {
            let bmColor: (1|0) = 0;
            const currentColor = colorMatrix[row][column];
            
            if (currentColor.alpha > 0 && !currentColor.equals(WHITE_COLOR)) {
                bmColor = 1;
            }

            data.push(bmColor);
        }
    }

    const tracer = Potrace();
    tracer.setParameter({"turdsize": turdSize});
    tracer.setBitmap(width, height, data);

    const svgString: string = tracer.getSVG(1);

    return svgString;
}

function colorDistance(color1: paper.Color, color2: paper.Color) {
    return (color2.red - color1.red) ** 2 + (color2.green - color1.green) ** 2 + (color2.blue - color1.blue) ** 2;
}

