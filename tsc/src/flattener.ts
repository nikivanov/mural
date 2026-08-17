import {loadPaper} from './paperLoader';
import { updateStatusFn } from './types';
import { offsetPathItem } from './geometry/offset';

const paper = loadPaper();

// Below this area (mm^2) a subtraction result is treated as "annihilated"
// for the thin-feature protection in flattenPathsAcrossLayers (point 3,
// docs/multi-color.md section 5's trapping addendum): a genuinely tiny sliver
// that still has *some* area is left alone (thinned but present), only a
// shape reduced to (numerically) nothing trips the fallback. 1e-6 mm^2 is a
// 1 micron x 1 micron square - far below anything a pen can draw, so it only
// catches true "empty except for float noise" results, not real geometry.
const ANNIHILATION_AREA_MM2 = 1e-6;

function isNegligible(path: paper.PathItem): boolean {
    // `.area` is declared on Path/CompoundPath, not the abstract PathItem
    // base type, even though both concrete classes (the only two PathItem
    // can actually be) implement it - hence the cast.
    const area = (path as unknown as { area: number }).area;
    return path.isEmpty() || Math.abs(area) < ANNIHILATION_AREA_MM2;
}

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

// White-as-knockout-mask (docs/multi-color.md section 5, "white stays don't
// draw", plus the fidelity fix on top of it): a pure white fill has always
// meant "no ink" - the wall's own paper color - but simply skipping the
// white path's own ink isn't enough on its own, because whatever is painted
// *underneath* it (an infill hatch, another color's fill) would still get
// drawn straight through where the invisible white shape should have
// covered it. This subtracts every white-filled path's geometry from
// whatever is beneath it in *paint order* - paper's isAbove()/painter's
// order, the exact mechanism flattenPaths() above already uses, not
// array/layer index - then drops the white paths themselves from the
// returned list. A white shape with nothing beneath it in paint order (the
// common "full-canvas white background rect", typically the first/
// bottommost element in a real SVG) therefore knocks out nothing, which is
// the correct behavior: everything below it in an empty stack is vacuously
// satisfied.
//
// A white-filled path that also carries a visible stroke of its own is
// *not* treated as a pure knockout mask here - it still has ink to draw (its
// stroke), so it isn't "nothing", and callers (generateInfills in
// infill.ts, groupPathsByLiteralColor in generator.ts) handle that
// stroke-bearing case themselves rather than losing it here.
//
// paper's PathItem#subtract() carries over the `.data` (density/outline/
// colorIndex tags) of the item it's called on, so those survive. Returns
// the same array reference, untouched, when no white masks are present -
// this keeps callers byte-identical on inputs that never hit this bug.
export function applyWhiteKnockout(paths: paper.PathItem[]): paper.PathItem[] {
    const isWhiteMask = (path: paper.PathItem) => {
        const fill = path.fillColor;
        const stroke = path.strokeColor;
        const fillIsWhite = !!(fill && fill.alpha > 0 && fill.toCSS(true) === '#ffffff');
        const strokeVisible = !!(stroke && stroke.alpha > 0);
        return fillIsWhite && !strokeVisible;
    };

    if (!paths.some(isWhiteMask)) {
        return paths;
    }

    // Topmost-first, exactly like flattenPaths() above.
    const ordered = [...paths].sort((a, b) => a.isAbove(b) ? -1 : 1);
    const resolved = new Map<paper.PathItem, paper.PathItem>(ordered.map(p => [p, p]));

    for (let i = 0; i < ordered.length; i++) {
        const mask = ordered[i];
        if (!isWhiteMask(mask)) {
            continue;
        }
        for (let j = i + 1; j < ordered.length; j++) {
            const below = ordered[j];
            if (isWhiteMask(below)) {
                continue;
            }
            resolved.set(below, resolved.get(below)!.subtract(mask, { insert: false }));
        }
    }

    return paths.filter(p => !isWhiteMask(p)).map(p => resolved.get(p)!);
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
//
// Trapping (docs/multi-color.md section 5 addendum): plain subtraction
// leaves the lighter layer's remaining geometry sharing its exact boundary
// with the darker layer that knocked it out, so the two colors' pens still
// touch along that line - with felt-tips/whiteboard markers a nib crossing
// another color's wet ink picks up pigment. `gapMm` (0 restores the exact
// prior touching behavior byte-for-byte, since the subtractor is then
// `darkerPath` itself with no offset step at all) grows the darker path by
// that many mm (via geometry/offset.ts's Clipper-backed offset, the same
// primitive fillStrategies/contour.ts uses to inset) before subtracting it,
// so a `gapMm`-wide strip of bare paper is left between the two layers'
// remaining ink instead.
//
// Thin-feature protection: growing the subtractor can, on a lighter shape
// no wider than ~2x the gap, consume the shape entirely where plain
// (ungapped) subtraction would have left a sliver. Detected here per
// darker-path step by comparing the grown-subtraction result against the
// ungapped one: if the grown subtraction annihilates the shape (see
// isNegligible) but the ungapped subtraction would not have, this falls
// back to the ungapped result for that step - the feature survives
// (thinned, and touching along that one edge) rather than vanishing.
export function flattenPathsAcrossLayers(
    layersLightToDark: paper.PathItem[][],
    updateStatusFn: updateStatusFn,
    gapMm: number = 0,
) {
    const layerCount = layersLightToDark.length;
    for (let layerIx = 0; layerIx < layerCount - 1; layerIx++) {
        updateStatusFn(`Cross-layer knockout: ${layerIx + 1} / ${layerCount}`);
        const currentLayer = layersLightToDark[layerIx];
        const darkerLayers = layersLightToDark.slice(layerIx + 1);

        for (let pathIx = 0; pathIx < currentLayer.length; pathIx++) {
            let modified = currentLayer[pathIx];
            for (const darkerLayer of darkerLayers) {
                for (const darkerPath of darkerLayer) {
                    if (gapMm <= 0) {
                        modified = modified.subtract(darkerPath, { insert: false });
                        continue;
                    }

                    const grown = offsetPathItem(darkerPath, gapMm);
                    const candidate = grown
                        ? modified.subtract(grown, { insert: false })
                        : modified.subtract(darkerPath, { insert: false });

                    if (isNegligible(candidate) && !isNegligible(modified)) {
                        const ungapped = modified.subtract(darkerPath, { insert: false });
                        if (!isNegligible(ungapped)) {
                            candidate.remove();
                            grown?.remove();
                            modified = ungapped;
                            continue;
                        }
                        ungapped.remove();
                    }

                    grown?.remove();
                    modified = candidate;
                }
            }
            currentLayer[pathIx] = modified;
        }
    }
}