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

// Multi-color knockout (docs/multi-color.md section 5): generalizes the same
// painter's-order subtraction flattenPaths() does within one color, across
// color layers instead. `layersLightToDark` must already be ordered
// light-to-dark (both vectorizeImageDataColor and groupPathsByLiteralColor
// guarantee this). Every path in a lighter layer is subtracted by every path
// in every darker layer drawn after it, so a region covered by more than one
// color's paths ends up infilled only in the final (darkest) color that
// covers it - unlike flattenPaths(), z-order/isAbove() plays no part here,
// only draw order across layers does. Mutates each layer array's elements in
// place, same convention as flattenPaths(). Intra-layer knockout (if
// request.flattenPaths is set) should be applied per-layer, separately,
// before this - draw order still matters within one color, but darker
// colors always win regardless of z-order.
export function flattenPathsAcrossLayers(layersLightToDark: paper.PathItem[][], updateStatusFn: updateStatusFn) {
    const layerCount = layersLightToDark.length;
    for (let layerIx = 0; layerIx < layerCount - 1; layerIx++) {
        updateStatusFn(`Cross-layer knockout: ${layerIx + 1} / ${layerCount}`);
        const currentLayer = layersLightToDark[layerIx];
        const darkerLayers = layersLightToDark.slice(layerIx + 1);

        for (let pathIx = 0; pathIx < currentLayer.length; pathIx++) {
            let modified = currentLayer[pathIx];
            for (const darkerLayer of darkerLayers) {
                for (const darkerPath of darkerLayer) {
                    modified = modified.subtract(darkerPath, { insert: false });
                }
            }
            currentLayer[pathIx] = modified;
        }
    }
}