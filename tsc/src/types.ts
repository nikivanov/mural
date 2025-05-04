
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
}