
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

export type PathLike = paper.Path | paper.CompoundPath;

export type InfilledPath = {
    outlinePaths: paper.Path[],
    infillPaths: paper.Path[],
    originalPath: PathLike,
}

export type InfillDensity = 0 | 1 | 2 | 3 | 4;
export const InfillDensities: InfillDensity[] = [0, 1, 2, 3, 4];

export namespace RequestTypes {
    export type SvgToCommandsRequest = {
        svg: string,
        width: number,
        scale: number,
        x: number,
        y: number,
        infillDensity: InfillDensity,
    };

    export type CommandsToSvgRequest = {
        commands: string,
        width: number,
        height: number,
    };
}