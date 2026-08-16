
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

export type Command = CoordinateCommand | PenUpCommand | PenDownCommand | DistanceCommand | HeightCommand | TopDistanceCommand;

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
export type PathDensityData = {
    density?: InfillDensity;
    outline?: boolean;
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
    }
}