
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

export type InfillDensity = 0 | 1 | 2 | 3 | 4;
export const InfillDensities: InfillDensity[] = [0, 1, 2, 3, 4];

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
    }
}