import {loadPaper} from './paperLoader';
import { updateStatusFn } from './types';

const paper = loadPaper();

export function flattenPaths(paths: paper.PathItem[], updateStatusFn: updateStatusFn) {
    updateStatusFn("Sorting paths");
    paths.sort((a, b) => a.isAbove(b) ? -1 : 1);

    const count = paths.length;
    for (let currentPathIx = 0; currentPathIx < paths.length - 1; currentPathIx++) {
        updateStatusFn(`Flattening paths: ${currentPathIx + 1} / ${count}`)
        const currentPath = paths[currentPathIx];
        for (let modifiedPathIx = currentPathIx + 1; modifiedPathIx < paths.length; modifiedPathIx++) {
            const pathToModify = paths[modifiedPathIx];
            const modifiedPath = pathToModify.subtract(currentPath, {
                insert: false,
            });
            paths[modifiedPathIx] = modifiedPath;
        }
    }
}