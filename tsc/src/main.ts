import { renderCommandsToSvgJson } from "./toSvgJson";
import { renderSvgJsonToCommands } from "./toCommands";
import { vectorizeImageData } from './vectorizer';
import { InfillDensities, RequestTypes } from "./types";

const updateStatusFn = (status: string) => {
    self.postMessage({
        type: "status",
        payload: status,
    });
};

self.onmessage = async (e: MessageEvent<any>) => {
    if (isVectorizeRequest(e.data)) {
        vectorize(e.data);
    } else if (isRenderSvgRequest(e.data)) {
        await render(e.data);
    } else {
        throw new Error("Bad request");
    }
};

function vectorize(request: RequestTypes.VectorizeRequest) {
    updateStatusFn("Vectorizing");
    const svgString = vectorizeImageData(request.raster, request.turdSize);
    self.postMessage({
        type: "vectorizer",
        payload: {
            svg: svgString,
        }
    });
}

async function render(request: RequestTypes.RenderSVGRequest) {
    const renderResult = await renderSvgJsonToCommands(
        request,
        updateStatusFn,
    )
    const resultSvgJson = renderCommandsToSvgJson(renderResult.commands, request.width, request.height, updateStatusFn);
    self.postMessage({
        type: "renderer",
        payload: {
            commands: renderResult.commands,
            svgJson: resultSvgJson,
            distance: renderResult.distance,
            drawDistance: renderResult.drawDistance,
        }
    });
}

function isVectorizeRequest(obj: any): obj is RequestTypes.VectorizeRequest {
    if (!('type' in obj) || obj.type !== 'vectorize') {
        return false;
    }

    if (!('raster' in obj) || typeof obj.raster !== 'object') {
        return false;
    }

    if (!('turdSize' in obj) || typeof obj.turdSize !== 'number') {
        return false;
    }

    return true;
}


function isRenderSvgRequest(obj: any): obj is RequestTypes.RenderSVGRequest {
    if (!('type' in obj) || obj.type !== 'renderSvg') {
        return false;
    }

    if (!('svgJson' in obj) || typeof obj.svgJson !== 'string') {
        return false;
    }

    if (!('width' in obj) || typeof obj.width !== 'number') {
        return false;
    }

    if (!('height' in obj) || typeof obj.height !== 'number') {
        return false;
    }

    if (!('svgWidth' in obj) || typeof obj.svgWidth !== 'number') {
        return false;
    }

    if (!('svgHeight' in obj) || typeof obj.svgHeight !== 'number') {
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

    if (!('flattenPaths' in obj) || typeof obj.flattenPaths !== 'boolean') {
        return false;
    }

    return true;
}

