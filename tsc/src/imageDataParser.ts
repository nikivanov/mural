import { Canvas } from 'canvas';
import {loadPaper} from './paperLoader';

const paper = loadPaper();

export function parseImageData(imageData: ImageData): paper.Color[][] {
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

    return colorMatrix;
}
