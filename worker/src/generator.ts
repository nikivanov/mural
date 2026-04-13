import { loadPaper } from './paperLoader';

const paper = loadPaper();

export function generatePaths(svg: paper.Item): paper.PathItem[] {
    return generatePathsRecursive(svg);
}

function generatePathsRecursive(item: paper.Item): paper.PathItem[] {
    const paths: paper.PathItem[] = [];
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

