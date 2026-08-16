import { loadPaper } from './paperLoader';
import { PathDensityData } from './types';

const paper = loadPaper();

export function generatePaths(svg: paper.Item): paper.PathItem[] {
    return generatePathsRecursive(svg, getOwnDensityData(svg));
}

// Groups tagged with tonal density data (see vectorizer's grayscale mode,
// carried in via the SVG `data-paper-data` attribute) pass that data down to
// every Path/CompoundPath found within, so generateInfills can apply a
// per-path density/outline override. Untagged trees leave every path's data
// untouched, preserving the existing single-density behavior exactly.
function generatePathsRecursive(item: paper.Item, inherited: PathDensityData | undefined): paper.PathItem[] {
    const paths: paper.PathItem[] = [];
    for (const child of item.children) {
        const effective = getOwnDensityData(child) || inherited;
        if (child instanceof paper.Group) {
            const innerPaths = generatePathsRecursive(child, effective);
            paths.push(...innerPaths);
        } else if (child instanceof paper.Path || child instanceof paper.CompoundPath) {
            if (effective) {
                child.data.density = effective.density;
                child.data.outline = effective.outline;
            }
            paths.push(child);
        }
    }

    return paths;
}

function getOwnDensityData(item: paper.Item): PathDensityData | undefined {
    const data = item.data as PathDensityData | undefined;
    if (data && (data.density !== undefined || data.outline !== undefined)) {
        return data;
    }

    return undefined;
}

