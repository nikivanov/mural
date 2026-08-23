
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
        gamma: number,
        angle: number,
        continuousPath: boolean,
        liftOnTransparent: boolean,
        /** Bounding box of the actual image content within the canvas (mm).
         *  Points outside this rectangle are always skipped, regardless of trimWhite. */
        imageLeft: number,
        imageTop: number,
        imageRight: number,
        imageBottom: number,
    }

    export type RenderFiniteCurveRequest = {
        type: 'renderFiniteCurve',
        imageData: ImageData,
        widthMm: number,
        heightMm: number,
        homeX: number,
        homeY: number,
        /** Working resolution; internal engine px size = round(resolution*150) */
        resolution: number,
        contrast: number,
        /** 0..255, matches the engine's internal raw scale */
        whiteCutoff: number,
        invert: boolean,
    }

    export type RenderTestPatternRequest = {
        type: 'renderTestPattern',
        homeX: number,
        homeY: number,
        maxX: number,
        rectHeight: number,
        squareSize: number,
        loops: number,
    }
}