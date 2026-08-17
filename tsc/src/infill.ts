import { loadPaper } from './paperLoader';
import { InfillDensity, InfilledPath, PathDensityData } from './types';
import { applyWhiteKnockout } from './flattener';
import { FillContext } from './fillStrategies/types';
import { defaultFillStrategyName, fillStrategies } from './fillStrategies/registry';

const paper = loadPaper();

// Spacing (mm) between adjacent cross-hatch lines at each density level.
// 1-4 are the original levels and MUST keep these exact values - existing
// snapshots/tests depend on byte-identical output at those densities.
//
// 5-7 are the extended ladder added for hue-grouped shading (huePalette.ts):
// a single pen can render several shades of its hue by hatching the same
// ink at different spacings and letting paper show through the sparser
// ones, so the ladder needs enough range to plausibly span "barely tinted"
// to "essentially solid" for one pen's darkest color.
//
// Ink laid per unit area scales roughly as 1/spacing (see buildInfillLines:
// halving the spacing roughly doubles the number of hatch lines crossing a
// given region), so level 7 (2.5mm) uses about 20/2.5 = 8x the ink length
// of level 1 (20mm) for the same area.
//
// Approximate cross-hatch coverage (~2 * nibWidth / spacing, nibWidth ~=
// 1.2mm - two hatch directions, each nib-width wide, per spacing period):
//   1 (20mm)  -> ~12%    5 (5mm)   -> ~48%
//   2 (15mm)  -> ~16%    6 (3.5mm) -> ~69%
//   3 (10mm)  -> ~24%    7 (2.5mm) -> ~96% (near solid)
//   4 (7mm)   -> ~34%
const infillDensityToSpacingMap = new Map<Exclude<InfillDensity, 0>, number>([
    [1, 20],
    [2, 15],
    [3, 10],
    [4, 7],
    [5, 5],
    [6, 3.5],
    [7, 2.5],
]);

export function generateInfills(pathsToInfill: paper.PathItem[], infillDensity: InfillDensity): InfilledPath[] {
    const view = paper.project.view;
    const boundsPath = new paper.Path.Rectangle(view.bounds);

    // Shared across every path filled in this call. Strategies may use
    // `cache` to memoize expensive per-spacing precomputation (e.g. a line
    // grid) across paths; it's fresh per generateInfills() call, matching
    // the original code's per-call `linesBySpacing` map.
    const ctx: FillContext = {view, boundsPath, cache: new Map()};

    // White-as-knockout (see flattener.ts's applyWhiteKnockout): a pure
    // white fill with no stroke of its own is dropped entirely (matching
    // the pre-existing "nothing to draw" treatment below for any leftover
    // white fill), but first subtracts its geometry from whatever paint
    // order puts beneath it, so a white shape drawn over a colored one
    // leaves unmarked paper instead of that color's infill hatching showing
    // straight through it.
    const knockedOutPaths = applyWhiteKnockout(pathsToInfill);

    const infilledPaths = knockedOutPaths.map(path => {
        const pathData = path.data as PathDensityData | undefined;
        const density = pathData?.density !== undefined ? pathData.density : infillDensity;
        const includeOutline = pathData?.outline !== undefined ? pathData.outline : true;
        // Tone-derived hue-grouped shading (huePalette.ts) carries a
        // continuous spacingMm instead of snapping to one of the 7 `density`
        // ladder steps; when present it takes priority over `density` so
        // that finer tonal control isn't lost to quantization. Paths
        // without it (the overwhelming majority - everything that isn't
        // hue-grouped shading) fall through to the density-derived spacing
        // exactly as before.
        const spacingMm = pathData?.spacingMm !== undefined
            ? pathData.spacingMm
            : (density === 0 ? 0 : infillDensityToSpacingMap.get(density)!);
        const minInfillLength = spacingMm === 0 ? 1000 : Math.floor(spacingMm);

        if (!(path instanceof paper.Path) && !(path instanceof paper.CompoundPath)) {
            throw new Error("Path item is neither a Path or CompoundPath");
        }

        const outlinePaths: paper.Path[] = [];

        if (includeOutline) {
            if (path instanceof paper.Path) {
                if (path.firstSegment && path.lastSegment) {
                    outlinePaths.push(path);
                }

            } else {
                const unwoundPaths = unwrapCompoundPath(path).filter(p => p.firstSegment && p.lastSegment);
                outlinePaths.push(...unwoundPaths);
            }
        }

        let infillPaths: paper.Path[] = [];

        if (!path.fillColor || path.fillColor.toCSS(true) !== '#ffffff') {
            // `fillMethod` is an optional per-path strategy selector (not yet
            // wired to any UI/generator input) that follow-up branches can
            // set to pick a non-default fill strategy; unset paths keep
            // using crossHatch45 exactly as before.
            const strategyName = pathData?.fillMethod !== undefined ? pathData.fillMethod : defaultFillStrategyName;
            const strategy = fillStrategies[strategyName] !== undefined ? fillStrategies[strategyName] : fillStrategies[defaultFillStrategyName];
            infillPaths = strategy.generateFill(path, {spacingMm, minInfillLength}, ctx);
        }

        const infilledPath: InfilledPath = {
            originalPath: path,
            infillPaths,
            outlinePaths,
        };

        return infilledPath;
    });

    return infilledPaths;
}

function unwrapCompoundPath(path: paper.CompoundPath) {
    const paths: paper.Path[] = [];
    for (const child of path.children) {
        if (child instanceof paper.Path) {
            paths.push(child);
        } else if (child instanceof paper.CompoundPath) {
            paths.push(...unwrapCompoundPath(child));
        }
    }

    return paths;
}
