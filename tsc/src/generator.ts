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
                child.data.colorIndex = effective.colorIndex;
            }
            paths.push(child);
        }
    }

    return paths;
}

function getOwnDensityData(item: paper.Item): PathDensityData | undefined {
    const data = item.data as PathDensityData | undefined;
    if (data && (data.density !== undefined || data.outline !== undefined || data.colorIndex !== undefined)) {
        return data;
    }

    return undefined;
}

export type ColorGroup = {
    // 0-based, light-to-dark order (see docs/multi-color.md section 5).
    colorIndex: number;
    color: paper.Color;
    paths: paper.PathItem[];
}

// Multi-color path-tracing mode (docs/multi-color.md section 1): groups
// already-generated paths by their own literal fill/stroke color, instead of
// by a `colorIndex` tag (which raster color mode assigns via
// data-paper-data, before generatePaths() ever runs - see
// vectorizeImageDataColor). Pure white (the wall's own color, same
// convention as generateInfills()/vectorizeImageData()) is never a group -
// paths that are pure white with no stroke are dropped entirely, matching
// generateInfills()'s existing "nothing to draw" treatment of white fills.
// Mutates each path's `.data.colorIndex` in place and returns the groups
// ordered light -> dark.
export function groupPathsByLiteralColor(paths: paper.PathItem[]): ColorGroup[] {
    const buckets = new Map<string, { color: paper.Color, paths: paper.PathItem[] }>();

    for (const path of paths) {
        const fill = path.fillColor;
        const stroke = path.strokeColor;
        const color = (fill && fill.alpha > 0) ? fill : (stroke && stroke.alpha > 0 ? stroke : null);

        if (!color) {
            continue;
        }
        if (color.toCSS(true) === '#ffffff') {
            continue;
        }

        const key = color.toCSS(true);
        let bucket = buckets.get(key);
        if (!bucket) {
            bucket = { color, paths: [] };
            buckets.set(key, bucket);
        }
        bucket.paths.push(path);
    }

    const ordered = [...buckets.values()].sort((a, b) => luminanceOf(a.color) - luminanceOf(b.color));

    return ordered.map((bucket, colorIndex) => {
        for (const path of bucket.paths) {
            path.data.colorIndex = colorIndex;
        }
        return { colorIndex, color: bucket.color, paths: bucket.paths };
    });
}

function luminanceOf(color: paper.Color): number {
    return 0.299 * color.red + 0.587 * color.green + 0.114 * color.blue;
}

// Recovers the color groups a set of already-generatePaths()'d paths were
// tagged into (via `.data.colorIndex`, either from raster color mode's
// data-paper-data tags or from groupPathsByLiteralColor above), ordered
// ascending by colorIndex (which is already light-to-dark - see both
// producers). Returns null if no path carries a colorIndex tag, so callers
// can fall back to the original single-color pipeline untouched.
export function collectExistingColorGroups(paths: paper.PathItem[]): ColorGroup[] | null {
    const buckets = new Map<number, paper.PathItem[]>();
    let anyTagged = false;

    for (const path of paths) {
        const data = path.data as PathDensityData | undefined;
        if (data && data.colorIndex !== undefined) {
            anyTagged = true;
            const bucket = buckets.get(data.colorIndex) || [];
            bucket.push(path);
            buckets.set(data.colorIndex, bucket);
        }
    }

    if (!anyTagged) {
        return null;
    }

    return [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([colorIndex, groupPaths]) => ({
            colorIndex,
            color: (groupPaths[0].fillColor && groupPaths[0].fillColor.alpha > 0) ? groupPaths[0].fillColor : new paper.Color('#000000'),
            paths: groupPaths,
        }));
}

