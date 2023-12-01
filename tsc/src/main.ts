import { renderCommandsToSvgJson } from "./toSvgJson";
import { renderSvgToCommands } from "./toCommands";
import { InfillDensities, RequestTypes } from "./types";

self.onmessage = (e: MessageEvent<any>) => {
    if (!isToCommandsRequestArr(e.data)) {
        throw new Error("Bad render request");
    }

    const updateStatusFn = (status: string) => {
        self.postMessage({
            type: "status",
            payload: status,
        });
    };

    const renderResult = renderSvgToCommands(e.data.json, e.data.scale, e.data.x, e.data.y, e.data.width, e.data.infillDensity, self, updateStatusFn);
    const resultSvgJson = renderCommandsToSvgJson(renderResult.commands, e.data.width, renderResult.height, updateStatusFn);
    self.postMessage({
        type: "result",
        payload: {
            commands: renderResult.commands,
            json: resultSvgJson,
            width: e.data.width,
            height: renderResult.height,
            distance: renderResult.distance
        }
    })
};


function isToCommandsRequestArr(obj: any): obj is RequestTypes.SvgToCommandsRequest {
    if (!('json' in obj) || typeof obj.json !== 'string' || obj.json.length === 0) {
        return false;
    }

    if (!('width' in obj) || typeof obj.width !== 'number' || obj.width <= 0) {
        return false;
    }

    if (!('scale' in obj) || typeof obj.scale !== 'number') {
        return false;
    }

    if (!('x' in obj) || typeof obj.x !== 'number') {
        return false;
    }

    if (!('y' in obj) || typeof obj.y !== 'number') {
        return false;
    }

    if (!('infillDensity' in obj) || typeof obj.infillDensity !== 'number' || !InfillDensities.includes(obj.infillDensity)) {
        return false;
    }

    return true;
}

