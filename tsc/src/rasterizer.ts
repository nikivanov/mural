import {loadPaper} from './paperLoader';
import {JSDOM} from 'jsdom';
import {createCanvas} from 'canvas';

const paper = loadPaper();

export function rasterize(svg: paper.Item, resolution: number): paper.Color[][] {
    const scaledWidth = Math.floor(svg.bounds.width / resolution);
    const scaledHeight = Math.floor(svg.bounds.height / resolution);

    const colorMatrix: paper.Color[][] = []

    svg.fitBounds({
        x: 0,
        y: 0,
        width: scaledWidth,
        height: scaledHeight,
    })

    const raster = svg.rasterize({
        insert: false,
    });

    for (let row = 0; row < scaledHeight; row++) {
        for (let column = 0; column < scaledWidth; column++) {
            if (!colorMatrix[row]) {
                colorMatrix[row] = [];
            }
            colorMatrix[row][column] = raster.getAverageColor({x: row, y: column});
        }
    }

    return colorMatrix;
}
