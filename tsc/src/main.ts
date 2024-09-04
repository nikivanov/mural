import { renderCommandsToSvg } from "./toSvgJson";
import { renderRasterToCommands } from "./toCommands";
import { InfillDensities, RequestTypes } from "./types";

self.onmessage = async (e: MessageEvent<any>) => {
    if (!isToCommandsRequestArr(e.data)) {
        throw new Error("Bad render request");
    }

    const updateStatusFn = (status: string) => {
        self.postMessage({
            type: "status",
            payload: status,
        });
    };

    const renderResult = await renderRasterToCommands(e.data.raster, e.data.renderScale, e.data.homeX, e.data.homeY, e.data.infillDensity, updateStatusFn);
    const resultSvg = renderCommandsToSvg(renderResult.commands, renderResult.width, renderResult.height, updateStatusFn);
    self.postMessage({
        type: "result",
        payload: {
            commands: renderResult.commands,
            svg: resultSvg,
            width: renderResult.width,
            height: renderResult.height,
            distance: renderResult.distance,
            drawDistance: renderResult.drawDistance,
        }
    })
};


function isToCommandsRequestArr(obj: any): obj is RequestTypes.RasterToCommandsRequest {
    if (!('raster' in obj) || typeof obj.raster !== 'object') {
        return false;
    }

    if (!('renderScale' in obj) || typeof obj.renderScale !== 'number' || obj.renderScale <= 0) {
        return false;
    }

    if (!('homeX' in obj) || typeof obj.homeX !== 'number') {
        return false;
    }

    if (!('homeY' in obj) || typeof obj.homeY !== 'number') {
        return false;
    }

    if (!('infillDensity' in obj) || typeof obj.infillDensity !== 'number' || !InfillDensities.includes(obj.infillDensity)) {
        return false;
    }

    return true;
}

