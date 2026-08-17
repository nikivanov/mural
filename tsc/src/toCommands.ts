import { Command, PaletteEntry, PathDensityData, RequestTypes, updateStatusFn } from './types';
import { assignHatchAnglesPerColorGroup, ColorGroup, collectExistingColorGroups, generatePaths, groupPathsByLiteralColor } from './generator';
import { generateInfills } from './infill';
import { optimizePaths } from './optimizer';
import { renderPathsToCommands } from './renderer';
import { trimCommands } from './trimmer';
import { dedupeCommands } from './deduplicator';
import { measureDistance } from './measurer';
import { loadPaper } from './paperLoader';
import { flattenPaths, flattenPathsAcrossLayers } from './flattener';
import { simplifyPaths } from './simplifier';
import { DEFAULT_NIB_WIDTH_MM } from './huePalette';
import { estimatePlottingSecondsFromCommands, PlottingTimeEstimate } from './plottingEstimator';

const RDP_TOLERANCE_MM = 0.1;

const paper = loadPaper();

export type LayerSummary = {
    colorIndex: number;
    name: string;
    color: string;
    distance: number;
    drawDistance: number;
}

export async function renderSvgJsonToCommands(
    request: RequestTypes.RenderSVGRequest,
    updateStatusFn: updateStatusFn,
) {
    paper.setup({width: request.width, height: request.height});

    updateStatusFn("Importing");
    const svg = paper.project.importJSON(request.svgJson);

    // scale the document so its coordinates match the world 1:1, in mm
    const projectToViewRatio = request.width / request.svgWidth;

    console.log(`Scaling by ${projectToViewRatio}`);
    svg.scale(projectToViewRatio, {x: 0, y: 0});
    svg.applyMatrix = true;

    updateStatusFn("Generating paths");
    const paths = generatePaths(svg);

    paths.forEach(p => p.flatten(0.5));

    updateStatusFn("Reducing path detail");
    simplifyPaths(paths, RDP_TOLERANCE_MM);

    // Multi-color separation (docs/multi-color.md). Raster color mode
    // (vectorizeImageDataColor) already tagged every path with a
    // `colorIndex` before this function ever ran, via the same
    // data-paper-data mechanism grayscale uses, so those groups just need
    // collecting. Vector/path-tracing-origin SVGs carry no such tag and are
    // only grouped by literal fill/stroke color when explicitly requested -
    // so a plain single-color SVG import (colorSeparation unset/false) never
    // takes this branch, which is what keeps N=1 output byte-identical.
    let colorGroups = collectExistingColorGroups(paths);
    if (!colorGroups && request.colorSeparation) {
        colorGroups = groupPathsByLiteralColor(paths);
    }

    // Per-layer enable/disable (types.ts's disabledColorIndexes): computed
    // here only to decide which branch to take (multi-color vs. single-
    // color-or-empty) - the actual filtering happens inside renderMultiColor,
    // AFTER assignHatchAnglesPerColorGroup runs on the full original set.
    // Filtering before angle assignment would shift a surviving layer's
    // index in the (now-shorter) array and, with it, its per-layer hatch
    // angle/fillMethod (generator.ts's golden-angle spread is purely
    // positional) - so a layer's own rendering would visibly change
    // depending on which *other* layers the user toggled off, which is
    // both surprising and breaks the "leaving other layers untouched"
    // guarantee this feature is meant to have.
    const disabledColorIndexSet = new Set(request.disabledColorIndexes || []);
    const survivingGroupCount = colorGroups
        ? colorGroups.filter(g => !disabledColorIndexSet.has(g.colorIndex)).length
        : 0;

    if (colorGroups && survivingGroupCount > 1) {
        return renderMultiColor(colorGroups, request, updateStatusFn);
    }

    // Fewer than 2 layers survive (0 or 1, whether because the source was
    // always single-color or because disabling brought a multi-color job
    // down to this) - draw whatever's left on the plain single-color path
    // below rather than forcing a >=2-layer command-file shape. When
    // colorGroups is null/undefined this is exactly the pre-existing
    // behavior (pathsToRender === paths).
    let pathsToRender = paths;
    if (colorGroups) {
        const survivors = colorGroups.filter(g => !disabledColorIndexSet.has(g.colorIndex));
        pathsToRender = survivors.length === 1 ? survivors[0].paths : [];
    }

    // Single-color path: unchanged from before multi-color existed.
    if (request.flattenPaths) {
        flattenPaths(pathsToRender, updateStatusFn);
    }

    updateStatusFn("Generating infill");
    const pathsWithInfills = generateInfills(pathsToRender, request.infillDensity, request.fillMethod);

    updateStatusFn("Optimizing paths");
    const optimizedPaths = optimizePaths(pathsWithInfills, request.homeX, request.homeY);

    updateStatusFn("Generating commands");
    const commands = renderPathsToCommands(optimizedPaths, request.width, request.height);
    commands.push('p0');

    const trimmedCommands = trimCommands(commands);

    updateStatusFn("Simplifying commands");

    const dedupedCommands = dedupeCommands(trimmedCommands);

    updateStatusFn("Measuring total distance");
    dedupedCommands.unshift(`h${request.height}`);
    const distances = measureDistance(dedupedCommands);
    const totalDistance = +distances.totalDistance.toFixed(1);
    dedupedCommands.unshift(`d${totalDistance}`);
    // Inserted after the d/h headers (index 2) so runner.cpp's
    // initTaskProvider(), which already reads d then h positionally, can
    // keep doing that and simply peek for an optional third header line.
    dedupedCommands.splice(2, 0, `t${Math.round(request.topDistance)}`);

    // Post-render plotting estimate (plottingEstimator.ts), computed from
    // the exact command list about to be shipped (not a pre-render
    // projection) - draw/travel/pen-lift breakdown for the UI to show
    // before the user commits to actually drawing this. Header lines
    // ('d'/'h'/'t') are plain strings that match neither the pen-transition
    // nor pen-swap regexes, so including them here is harmless.
    const plotting = estimatePlottingSecondsFromCommands(dedupedCommands);

    const commandStrings = dedupedCommands.map(stringifyCommand);
    return {
        commands: commandStrings,
        distance: totalDistance,
        drawDistance: +distances.drawDistance.toFixed(1),
        plotting,
    };
}

// Renders each color group's paths as its own layer, sandwiched between
// `c<index>` boundary markers, per docs/multi-color.md section 2: all of one
// color's commands are emitted before its trailer, only N-1 markers appear
// for N colors, and headers are `d`, `h`, `t`, then one `n<index> <name>`
// line per palette entry.
async function renderMultiColor(
    colorGroups: ColorGroup[],
    request: RequestTypes.RenderSVGRequest,
    updateStatusFn: updateStatusFn,
) {
    // Per-layer hatch angle (docs/multi-color.md; see that function's
    // header comment in generator.ts) - purely additive: it only sets
    // PathDensityData fields that default to the pre-existing behavior
    // (crossHatch45 at 45 degrees) when unset. Deliberately runs on the
    // FULL, still-unfiltered colorGroups (before disabledColorIndexes below)
    // so a layer's assigned angle depends only on its own position among
    // every *detected* color, never on which other layers the user happens
    // to have toggled off - see toCommands.ts's dispatcher above for the
    // full rationale.
    assignHatchAnglesPerColorGroup(colorGroups);

    // Per-layer enable/disable (types.ts's disabledColorIndexes): drop the
    // excluded layers' color groups now that every surviving group has its
    // final, stable hatch angle - so a disabled layer's geometry is never
    // generated and its `c<index>` boundary is never emitted, without
    // perturbing any other layer's rendering.
    if (request.disabledColorIndexes && request.disabledColorIndexes.length > 0) {
        const disabled = new Set(request.disabledColorIndexes);
        colorGroups = colorGroups.filter(g => !disabled.has(g.colorIndex));
    }

    const layerPathArrays = colorGroups.map(g => g.paths);

    // Fidelity fix (generator.ts's fill/stroke split): a path contributed to
    // its stroke color's layer purely to draw a boundary line (tagged
    // `.data.density === 0` and `.data.outline === true` there) still
    // carries its *full* underlying shape as geometry, since stroke width
    // isn't modeled - it's the same closed shape as the fill contribution,
    // just meant to be drawn as an outline instead of hatched. That's fine
    // for rendering (outline drawing ignores the interior), but area-based
    // knockout (both intra- and cross-layer, below) works purely on
    // geometry and would otherwise treat that full shape as solid occupied
    // ink - either wiping out the paired fill layer's identical-shaped
    // interior entirely, or corrupting the outline's own boundary by
    // carving into it. Exclude these line-only contributions from knockout
    // entirely (as both mask and target) and recombine them afterward.
    const isStrokeOnlyContribution = (path: paper.PathItem) => {
        const data = path.data as PathDensityData | undefined;
        return data?.density === 0 && data?.outline === true;
    };

    const areaLayerArrays = layerPathArrays.map(paths => paths.filter(p => !isStrokeOnlyContribution(p)));
    const strokeOnlyLayerArrays = layerPathArrays.map(paths => paths.filter(isStrokeOnlyContribution));

    if (request.flattenPaths) {
        // Intra-layer knockout: draw order still matters within one color.
        for (const layerPaths of areaLayerArrays) {
            flattenPaths(layerPaths, updateStatusFn);
        }
    }

    if (!request.colorOverprint) {
        // Cross-layer knockout (docs/multi-color.md section 5): darker
        // layers always win over lighter ones, regardless of z-order.
        // Trapping gap: default to roughly one nib width (huePalette.ts's
        // DEFAULT_NIB_WIDTH_MM) when the request doesn't specify one, so
        // the two colors' ink genuinely cannot touch given a typical pen;
        // request.knockoutGapMm === 0 restores the exact prior (touching)
        // behavior, which is why this only falls back on `undefined`, not
        // on falsy.
        const knockoutGapMm = request.knockoutGapMm !== undefined ? request.knockoutGapMm : DEFAULT_NIB_WIDTH_MM;
        flattenPathsAcrossLayers(areaLayerArrays, updateStatusFn, Math.max(0, knockoutGapMm));
    }

    for (let i = 0; i < layerPathArrays.length; i++) {
        layerPathArrays[i] = [...areaLayerArrays[i], ...strokeOnlyLayerArrays[i]];
    }

    const paletteEntries = resolvePaletteNames(colorGroups, request.palette);

    const layerCommandLists: Command[][] = [];
    const layerSummaries: LayerSummary[] = [];
    let totalDistance = 0;
    let totalDrawDistance = 0;

    for (let i = 0; i < colorGroups.length; i++) {
        updateStatusFn(`Generating infill: layer ${i + 1}/${colorGroups.length}`);
        const infilled = generateInfills(layerPathArrays[i], request.infillDensity, request.fillMethod);

        updateStatusFn(`Optimizing paths: layer ${i + 1}/${colorGroups.length}`);
        const optimized = optimizePaths(infilled, request.homeX, request.homeY);

        updateStatusFn(`Generating commands: layer ${i + 1}/${colorGroups.length}`);
        const rawCommands = renderPathsToCommands(optimized, request.width, request.height);
        rawCommands.push('p0');

        const trimmed = trimCommands(rawCommands);
        const deduped = dedupeCommands(trimmed);

        // measureDistance skips index 0, expecting it to be a header line -
        // prepend a throwaway non-pen command so a layer's own commands
        // (which start with 'p0') are measured in full.
        const distances = measureDistance(['n' as Command, ...deduped]);
        const layerDistance = +distances.totalDistance.toFixed(1);
        const layerDrawDistance = +distances.drawDistance.toFixed(1);
        totalDistance += layerDistance;
        totalDrawDistance += layerDrawDistance;

        layerCommandLists.push(deduped);
        layerSummaries.push({
            colorIndex: colorGroups[i].colorIndex,
            name: paletteEntries[i].name,
            color: paletteEntries[i].color,
            distance: layerDistance,
            drawDistance: layerDrawDistance,
        });
    }

    updateStatusFn("Assembling command file");
    const assembled: Command[] = [];
    assembled.push(`h${request.height}`);
    assembled.push(`t${Math.round(request.topDistance)}`);
    paletteEntries.forEach((entry, i) => assembled.push(`n${i + 1} ${entry.name}`));

    layerCommandLists.forEach((layerCommands, i) => {
        if (i > 0) {
            assembled.push(`c${i + 1}`);
        }
        assembled.push(...layerCommands);
    });

    const roundedTotalDistance = +totalDistance.toFixed(1);
    assembled.unshift(`d${roundedTotalDistance}`);

    // Post-render plotting estimate (see the single-color path's identical
    // comment above): computed from the fully assembled command list, so
    // penSwapCount here naturally reflects however many layers actually
    // survived disabledColorIndexes filtering (N-1 `c<index>` markers for N
    // remaining layers), not the originally detected color count.
    const plotting = estimatePlottingSecondsFromCommands(assembled);

    const commandStrings = assembled.map(stringifyCommand);
    return {
        commands: commandStrings,
        distance: roundedTotalDistance,
        drawDistance: +totalDrawDistance.toFixed(1),
        layers: layerSummaries,
        plotting,
    };
}

// Resolves the display name/color for each detected color group: the
// caller-supplied palette (matched by colorIndex) when present, otherwise an
// auto-generated "Color N" name using the group's own traced/literal color.
function resolvePaletteNames(colorGroups: ColorGroup[], suppliedPalette?: PaletteEntry[]): PaletteEntry[] {
    return colorGroups.map((group, i) => {
        const supplied = suppliedPalette && suppliedPalette[group.colorIndex];
        if (supplied) {
            return supplied;
        }
        return {
            name: `Color ${i + 1}`,
            color: group.color.toCSS(true),
        };
    });
}

function stringifyCommand(cmd: Command): string {
    if (typeof cmd === 'string') {
        return cmd;
    } else {
        return `${cmd.x} ${cmd.y}`;
    }
}
