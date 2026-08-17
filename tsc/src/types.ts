
export type updateStatusFn = (status: string) => void;

export type CoordinateCommand = {
    x: number;
    y: number;
}

export type PenUpCommand = 'p0';
export type PenDownCommand = 'p1';
export type DistanceCommand = `d${number}`
export type HeightCommand = `h${number}`;
export type TopDistanceCommand = `t${number}`;
// Multi-color: emitted at each color boundary (see docs/multi-color.md
// section 2). `index` is 1-based and matches the palette metadata header
// (PaletteHeaderCommand) below. Only N-1 of these appear for N colors - the
// first layer draws with whatever pen is already mounted.
export type LayerChangeCommand = `c${number}`;
// Multi-color palette metadata header: `n<index> <name>`, one per palette
// color, emitted after d/h/t and before the first layer's commands. Kept as
// a plain string (rather than a template literal type, since it embeds a
// free-form name) and recognized by its 'n' prefix, following the existing
// single-character-prefix convention.
export type PaletteHeaderCommand = string;

export type Command = CoordinateCommand | PenUpCommand | PenDownCommand | DistanceCommand | HeightCommand | TopDistanceCommand | LayerChangeCommand | PaletteHeaderCommand;

export type InfilledPath = {
    outlinePaths: paper.Path[],
    infillPaths: paper.Path[],
    originalPath: paper.PathItem,
}

// 5-7 are the "extended ladder" added for hue-grouped shading (see
// huePalette.ts): densities dense enough that several lightness tiers of a
// single pen's ink can span a believable tonal range within one hue group.
// 1-4 keep their original meaning/spacing exactly (see infill.ts's
// infillDensityToSpacingMap) so pre-existing single-density behavior and
// snapshots are untouched.
export type InfillDensity = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const InfillDensities: InfillDensity[] = [0, 1, 2, 3, 4, 5, 6, 7];

// Per-path/per-group tonal overrides carried on paper.Item#data (via the SVG
// `data-paper-data` attribute) so a single render request can mix densities
// across the nested grayscale levels produced by the vectorizer's grayscale
// mode. Paths without this data fall back to the request's single
// `infillDensity` and default to drawing an outline, matching the pre-existing
// single-density behavior.
//
// `colorIndex` is the analogous tag for multi-color separation (see
// docs/multi-color.md section 1): raster color mode tags each traced mask's
// wrapping <g> with its palette index the same way grayscale tags levels;
// generatePaths() (generator.ts) propagates it down exactly like
// density/outline. 0-based internally; converted to the 1-based `c<index>` /
// `n<index>` command-file convention only at the very end, in toCommands.ts.
export type PathDensityData = {
    density?: InfillDensity;
    outline?: boolean;
    colorIndex?: number;
    // Continuous tone-derived hatch spacing in mm (see huePalette.ts's
    // assignToneSpacings), used by hue-grouped shading instead of `density`
    // so a shade's spacing tracks its actual measured tone rather than
    // snapping to one of the 7 ladder steps in infill.ts. When set,
    // generateInfills (infill.ts) honours this in preference to `density`;
    // paths that never set it keep using `density`/the request's
    // `infillDensity` exactly as before - this is purely additive.
    spacingMm?: number;
    // Optional per-path fill-strategy selector (see fillStrategies/registry.ts).
    // Not yet set by any generator/UI code - reserved for follow-up branches
    // (single-direction hatch, spiral fill, contour fill, ...) that need to
    // pick a non-default strategy per path. Unset paths resolve to the
    // default strategy (crossHatch45), so this is purely additive and does
    // not change behavior until something starts setting it.
    fillMethod?: string;
    // Optional per-path hatch angle in degrees, honored by every hatch-based
    // fill strategy except crossHatch45 itself (which stays hardcoded at 45
    // degrees - see fillStrategies/crossHatch45.ts). singleDirectionHatch,
    // crossHatchAngled, and jitteredHatch (fillStrategies/registry.ts) all
    // default to 45 (matching crossHatch45's own angle) when this is unset.
    // Multi-color rendering (toCommands.ts's renderMultiColor) assigns each
    // color layer's paths a distinct angle via
    // generator.ts's assignHatchAnglesPerColorGroup, so overlapping layers
    // read as distinct hatch textures instead of visual mud - see that
    // function's header and docs/multi-color.md.
    hatchAngleDegrees?: number;
}

// One entry of a color palette: a physical pen's display name plus a
// representative RGB color, used both for nearest-palette raster
// quantization (vectorizer.ts) and for naming/tinting layers in the UI and
// command-file `n<index> <name>` headers.
export type PaletteEntry = {
    name: string;
    color: string; // '#rrggbb'
}

export namespace RequestTypes {
    export type RenderSVGRequest = {
        type: 'renderSvg',
        svgJson: string,
        width: number,
        height: number,
        svgWidth: number,
        svgHeight: number,
        homeX: number,
        homeY: number,
        infillDensity: InfillDensity,
        flattenPaths: boolean,
        // Pin-to-pin distance (mm) the drawable width was derived from when
        // this request was built (drawable width = 0.6 * topDistance, see
        // movement.h's safeXFraction). Recorded into the command file's `t`
        // header so a later replay can warn if the plotter's current pin
        // distance no longer matches.
        topDistance: number,
        // Multi-color (see docs/multi-color.md). Raster-origin SVGs already
        // carry a `colorIndex` tag on each path (from vectorizeImageDataColor
        // via the same data-paper-data mechanism grayscale uses), so no flag
        // is needed for them. Path-tracing/vector-origin SVGs have no such
        // tag and are only grouped by literal fill/stroke color when this is
        // set - so plain single-color SVG imports stay byte-identical.
        colorSeparation?: boolean,
        // Palette names for the `n<index> <name>` header, in the same
        // light-to-dark order layers are emitted in. Optional: when absent,
        // layers are named "Color 1", "Color 2", etc.
        palette?: PaletteEntry[],
        // Skip the cross-layer knockout (see docs/multi-color.md section 5)
        // and let overlapping colors' infill hatching overlap on the wall.
        // Default (false/omitted) applies knockout: each lighter layer is
        // subtracted by every darker layer drawn after it.
        colorOverprint?: boolean,
        // Trapping gap (mm, see docs/multi-color.md section 5's trapping
        // addendum and flattener.ts's flattenPathsAcrossLayers): when
        // cross-layer knockout is active (colorOverprint is not set), the
        // darker layer's geometry is grown by this many mm before being
        // subtracted from the lighter layer, leaving a hairline strip of
        // bare paper between two colors' ink instead of a shared edge two
        // pens both touch. 0 restores the exact prior touching behavior.
        // Omitted defaults to huePalette.ts's DEFAULT_NIB_WIDTH_MM (1.2mm) -
        // roughly one nib width, so the two inked regions genuinely cannot
        // touch given a typical felt-tip/whiteboard-marker nib. Ignored
        // when colorOverprint is set (no cross-layer knockout happens at
        // all in that case, so there's no shared edge to trap).
        knockoutGapMm?: number,
        // Request-level default fill strategy (fillStrategies/registry.ts),
        // applied to every path that doesn't carry its own
        // PathDensityData.fillMethod - per-path selection (already wired
        // through generator.ts/infill.ts) still wins over this. Omitted, or
        // a name that isn't a registered strategy, falls back to the
        // module's own default (crossHatch45) exactly as before - see
        // infill.ts's generateInfills, which already resolves an unknown
        // strategy name defensively - so this is purely additive.
        fillMethod?: string,
        // Multi-color (see docs/multi-color.md): 0-based colorIndex values
        // (matching PathDensityData.colorIndex/ColorGroup.colorIndex) to
        // drop from this render entirely - both the layer's geometry and
        // its `c<index>` pen-swap boundary. Motivating case: a near-white
        // background layer that's invisible on white paper but still costs
        // a full draw pass and pen swap, or simply owning fewer physical
        // pens than the image wants. Ignored for single-color requests
        // (no detected/requested color separation). Disabling every
        // detected layer degrades gracefully to an empty single-color job
        // rather than producing a corrupt/undersized multi-color command
        // file - see toCommands.ts. Omitted/empty preserves existing
        // behavior exactly.
        disabledColorIndexes?: number[],
    };

    export type VectorizeRequest = {
        type: 'vectorize',
        raster: ImageData,
        turdSize: number,
        // When set to a positive number (3 or 4 are supported), the vectorizer
        // quantizes luminance into that many nested levels and traces each one
        // separately instead of the default 1-bit threshold. Omitted, zero, or
        // any falsy value preserves the existing single-level behavior exactly.
        grayscaleLevels?: number,
        // Multi-color raster separation (see docs/multi-color.md section 1).
        // When set to 2 or more, quantizes the source image into this many
        // non-nested color masks instead of the default single 1-bit mask,
        // and traces each independently. Mutually exclusive with
        // grayscaleLevels (grayscaleLevels wins if both are set). Omitted,
        // zero, or 1 preserves the existing single-mask behavior exactly.
        colorCount?: number,
        // Fixed palette to nearest-match every pixel against (colorDistance()
        // in vectorizer.ts). When omitted, colorCount triggers k-means
        // clustering instead, with the resulting cluster centroids returned
        // as the palette.
        palette?: PaletteEntry[],
        // Hue-grouped shading (see huePalette.ts): when set alongside
        // colorCount/palette, collapses the detected/matched palette entries
        // into fewer pens by hue proximity - each pen is the darkest member
        // of its group, and lighter members are re-tagged to draw with the
        // same pen at a sparser density (PathDensityData.density) from the
        // extended ladder instead of getting a separate colorIndex. Lives on
        // VectorizeRequest (not RenderSVGRequest) because the grouping has
        // to happen before/alongside quantization, where the palette and the
        // per-mask colorIndex tags are produced; RenderSVGRequest never
        // re-quantizes - it just consumes the (possibly already
        // hue-grouped) tags and palette baked into svgJson/`palette` by this
        // step, via the same mechanism a supplied palette already uses.
        // Omitted/false preserves the existing one-pen-per-detected-color
        // behavior exactly.
        hueGrouping?: boolean,
        // Manual override for hueGrouping's automatic clustering (per
        // huePalette.ts's buildHueGroupingResult): maps a detected color's
        // index in the (pre-grouping) palette/quantization result to an
        // arbitrary caller-chosen bucket id. Entries sharing a bucket id end
        // up as one pen; omitted indices fall back to their automatically
        // computed bucket. Ignored unless hueGrouping is also set.
        hueOverrides?: Record<number, number>,
        // Physical nib width (mm) of the pen doing the hatching, dominant
        // term in huePalette.ts's tone-derived spacing model (a fineliner
        // and a chisel marker differ several-fold, and it scales spacing
        // roughly linearly). One global value across all pens/groups
        // (rather than per-pen) for this first cut - see huePalette.ts's
        // DEFAULT_NIB_WIDTH_MM comment. Omitted/falsy uses that default.
        // Ignored unless hueGrouping is also set.
        nibWidthMm?: number,
        // Ink-strength / contrast multiplier scaling the model's computed
        // coverage (huePalette.ts's computeToneCoverage): real pens aren't
        // opaque even at nominal full coverage, and paper absorbency
        // varies, so this is the knob a user turns when a hue-grouped plot
        // comes out too light (>1) or too heavy/inky (<1). Omitted/falsy
        // uses the neutral default (1.0, no adjustment). Ignored unless
        // hueGrouping is also set.
        inkMultiplier?: number,
    }
}