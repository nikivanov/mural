import { loadPaper } from './paperLoader';
import { PathDensityData } from './types';
import { applyWhiteKnockout } from './flattener';

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
// vectorizeImageDataColor).
//
// Pure white (the wall's own color, same convention as
// generateInfills()/vectorizeImageData()) is never a group of its own - see
// applyWhiteKnockout in flattener.ts, which both drops those paths and
// subtracts their geometry from whatever paint order puts beneath them,
// fixing the fidelity bug where a white shape used to simply vanish while
// still leaving whatever was under it hatched solid.
//
// A path with both a visible fill AND a visible stroke in a genuinely
// different color contributes to BOTH layers (another fidelity fix): its
// interior/infill to the fill color's layer (with `.data.outline = false`,
// since the boundary belongs to the stroke color, not the fill color), and
// a second, outline-only copy (`.data.outline = true`, `.data.density = 0`)
// to the stroke color's layer. A path whose stroke is the same color as its
// fill (or has no visible stroke at all) is unaffected and produces exactly
// one group entry, as before - this is what keeps single-color/no-distinct-
// stroke output byte-identical. Stroke *width* is not modeled: a thick
// stroke still becomes a single-nib outline in the stroke layer.
//
// Mutates each contributed path's `.data.colorIndex` in place and returns
// the groups ordered light -> dark.
export function groupPathsByLiteralColor(paths: paper.PathItem[]): ColorGroup[] {
    const buckets = new Map<string, { color: paper.Color, paths: paper.PathItem[] }>();

    const knockedOutPaths = applyWhiteKnockout(paths);

    for (const path of knockedOutPaths) {
        const fill = path.fillColor;
        const stroke = path.strokeColor;
        const fillVisible = !!(fill && fill.alpha > 0);
        const strokeVisible = !!(stroke && stroke.alpha > 0);
        const fillIsWhite = fillVisible && fill!.toCSS(true) === '#ffffff';
        const strokeIsDistinct = strokeVisible && (!fillVisible || fill!.toCSS(true) !== stroke!.toCSS(true));

        if (fillVisible && !fillIsWhite) {
            // Only need a separate clone when the stroke also contributes
            // its own layer below - otherwise this path can be reused as-is,
            // exactly like the original single-bucket behavior.
            const fillPath = strokeIsDistinct ? path.clone({ insert: false }) : path;
            if (strokeIsDistinct) {
                fillPath.data.outline = false;
            }
            addToBucket(buckets, fill!, fillPath);
        }

        if (strokeIsDistinct) {
            const strokePath = fillVisible ? path.clone({ insert: false }) : path;
            if (fillVisible) {
                strokePath.data.outline = true;
                strokePath.data.density = 0;
            }
            addToBucket(buckets, stroke!, strokePath);
        }
    }

    const ordered = [...buckets.values()].sort((a, b) => luminanceOf(b.color) - luminanceOf(a.color));

    return ordered.map((bucket, colorIndex) => {
        for (const path of bucket.paths) {
            path.data.colorIndex = colorIndex;
        }
        return { colorIndex, color: bucket.color, paths: bucket.paths };
    });
}

function addToBucket(
    buckets: Map<string, { color: paper.Color, paths: paper.PathItem[] }>,
    color: paper.Color,
    path: paper.PathItem,
) {
    const key = color.toCSS(true);
    let bucket = buckets.get(key);
    if (!bucket) {
        bucket = { color, paths: [] };
        buckets.set(key, bucket);
    }
    bucket.paths.push(path);
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

