import { loadPaper } from './paperLoader';
import { PathLike } from './types';

const paper = loadPaper();

export function generatePaths(svg: paper.Item): PathLike[] {
    return generatePathsRecursive(svg);
}

function generatePathsRecursive(item: paper.Item): PathLike[] {
    const paths: PathLike[] = [];
    for (const child of item.children) {
        if (child instanceof paper.Group) {
            const innerPaths = generatePathsRecursive(child);
            paths.push(...innerPaths);
        } else if (child instanceof paper.Path || child instanceof paper.CompoundPath) {
            
            paths.push(child);
        }
    }

    return paths;
}

