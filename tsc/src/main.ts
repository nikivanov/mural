import { renderSvgToCommands } from "./renderSvgToCommands";
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

    const commands = renderSvgToCommands(e.data.svg, e.data.scale, e.data.x, e.data.y, e.data.width, e.data.infillDensity, self, updateStatusFn);
};


function isToCommandsRequestArr(obj: any): obj is RequestTypes.SvgToCommandsRequest {
    if (!('svg' in obj) || typeof obj.svg !== 'string' || obj.svg.length === 0) {
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

