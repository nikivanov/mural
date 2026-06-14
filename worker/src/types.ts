
export type updateStatusFn = (status: string) => void;

export type CoordinateCommand = {
    x: number;
    y: number;
}

export type PenUpCommand = 'p0';
export type PenDownCommand = 'p1';
export type DistanceCommand = `d${number}`
export type HeightCommand = `h${number}`;

export type Command = CoordinateCommand | PenUpCommand | PenDownCommand | DistanceCommand | HeightCommand;

export type InfilledPath = {
    outlinePaths: paper.Path[],
    infillPaths: paper.Path[],
    originalPath: paper.PathItem,
}

export type InfillDensity = 0 | 1 | 2 | 3 | 4;
export const InfillDensities: InfillDensity[] = [0, 1, 2, 3, 4];

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
    };

    export type VectorizeRequest = {
        type: 'vectorize',
        raster: ImageData,
        turdSize: number,
    }

    export type RenderRasterZigZagRequest = {
        type: 'renderRasterZigZag',
        imageData: ImageData,
        widthMm: number,
        heightMm: number,
        homeX: number,
        homeY: number,
        lineSpacing: number,
        amplitude: number,
        brightness: number,
        contrast: number,
        blackPoint: number,
        whitePoint: number,
        angle: number,
        continuousPath: boolean,
        liftOnTransparent: boolean,
        /** Bounding box of the actual image content within the canvas (mm).
         *  Points outside this rectangle are always skipped, regardless of trimWhite. */
        imageLeft: number,
        imageTop: number,
        imageRight: number,
        imageBottom: number,
        /** FM: distance (mm) between consecutive zigzag vertices in the darkest areas. */
        minHalfPeriod: number,
        /** FM: distance (mm) between consecutive zigzag vertices in the lightest areas. */
        maxHalfPeriod: number,
        useAmFm: boolean,
    }
}