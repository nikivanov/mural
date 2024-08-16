import {loadPaper} from './paperLoader';

const paper = loadPaper();

export function CreatePathsFromColorMatrix(colorMatrix: paper.Color[][], width: number, height: number): paper.PathItem[] {
    const colorSet = new Set<string>();
    for (let row = 0; row < colorMatrix.length; row++) {
        for (let column = 0; column < colorMatrix[row].length; column++) {
            const currentColor = colorMatrix[row][column];
            if (currentColor != null) {
                colorSet.add(currentColor.toString())
            }
        }
    }

    return [];
}