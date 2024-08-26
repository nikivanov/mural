import { Canvas } from 'canvas';
import {loadPaper} from './paperLoader';

const paper = loadPaper();

export function rasterize(canvas: Canvas | HTMLCanvasElement): paper.Color[][] {
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const imageData = ctx.getImageData(0,0, canvas.width, canvas.height);
    
    const colorMatrix: paper.Color[][] = []

    for (let row = 0; row < Math.floor(canvas.height); row++) {
        for (let column = 0; column < Math.floor(canvas.width); column++) {
            if (!colorMatrix[row]) {
                colorMatrix[row] = [];
            }
            const address = (row * Math.floor(canvas.width) + column) * 4;
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
