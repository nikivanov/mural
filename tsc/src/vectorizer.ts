import { loadPaper } from './paperLoader';
import {Potrace} from './tracer';
import { buildGrayscaleBitmap, computeGrayscaleThreshold } from './grayscale';


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

export type GrayscaleLevelResult = {
    // 1-indexed; higher levels are darker and nest inside lighter (lower)
    // levels, i.e. level L's bitmap is a subset of level (L-1)'s bitmap.
    level: number,
    svg: string,
}

// Traces `levels` nested bitmaps of `imageData`, one per luminance band. Level
// 1's bitmap includes every non-transparent pixel at or darker than a light
// threshold; each subsequent level uses a darker threshold, so its bitmap is
// a subset of the previous level's. Used for tonal/grayscale rendering, where
// each level is later given its own infill density. Fully independent of
// vectorizeImageData/createPathsFromColorMatrix above, which remain untouched
// so the default 1-bit path stays byte-identical.
export function vectorizeImageDataGrayscale(imageData: ImageData, turdSize: number, levels: number): GrayscaleLevelResult[] {
    const results: GrayscaleLevelResult[] = [];
    for (let level = 1; level <= levels; level++) {
        const threshold = computeGrayscaleThreshold(level, levels);
        const data = buildGrayscaleBitmap(imageData, threshold);
        const svg = traceBitmap(imageData.width, imageData.height, data, turdSize);
        results.push({ level, svg });
    }

    return results;
}

function traceBitmap(width: number, height: number, data: (1|0)[], turdSize: number): string {
    const tracer = Potrace();
    tracer.setParameter({"turdsize": turdSize});
    tracer.setBitmap(width, height, data);

    return tracer.getSVG(1);
}

