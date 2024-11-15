document.body.addEventListener("click", function(e) {
	if(e.target && e.target.nodeName == "A" && e.target.parentElement.className == 'd-pad') {
        const validDirection = ["up", "down", "left", "right"];
        if (validDirection.includes(e.target.className)) {
            requestChangeInTransform(e.target.className);
        }
	}
});

export const renderScale = 2;

export function initSvgControl() {
    $("#zoomIn").click(function() {
        requestChangeInTransform("in");
    });
    
    $("#zoomOut").click(function() {
        requestChangeInTransform("out");
    });
    
    $("#resetTransform").click(function() {
        requestChangeInTransform("reset");
    });
}

const affineTransform = [1, 0, 0, 1, 0, 0];
// nudge by this fraction of the viewport's width
const nudgeByFactor = 0.025;
const zoomByFactor = 0.05;
function requestChangeInTransform(direction) {
    switch (direction) {
        case "up":
            affineTransform[5] = affineTransform[5] - nudgeByFactor;
            break;
        case "down":
            affineTransform[5] = affineTransform[5] + nudgeByFactor;
            break;
        case "left":
            affineTransform[4] = affineTransform[4] - nudgeByFactor;
            break;
        case "right":
            affineTransform[4] = affineTransform[4] + nudgeByFactor;
            break;
        case "in":
            affineTransform[0] = affineTransform[0] + zoomByFactor;
            affineTransform[3] = affineTransform[3] + zoomByFactor;
            break;
        case "out":
            affineTransform[0] = affineTransform[0] - zoomByFactor;
            affineTransform[3] = affineTransform[3] - zoomByFactor;
            break;
        case "reset":
            affineTransform[0] = 1;
            affineTransform[3] = 1;
            affineTransform[4] = 0;
            affineTransform[5] = 0;
            break;
        default:
            console.log("Unrecognized transform direction");
            return;
    }
    applyTransform();
}

let currentSvg;
let currentScale;
let currentWidth;
let currentHeight;
let svgWidth, svgHeight;
export function setSvgString(svgString, currentState) {
    currentSvg = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const svgElement = currentSvg.documentElement;
    [svgWidth, svgHeight] = extractWidthAndHeight(svgElement);

    currentWidth = currentState.safeWidth;
    currentScale = svgWidth / currentWidth;
    currentHeight = svgHeight / currentScale;
    applyTransform();
}

export function getTargetWidth() {
    return currentWidth;
}

export function getTargetHeight() {
    return currentHeight;
}

export function getRenderTransform() {
    return [1 / renderScale, 0, 0, 1 / renderScale, 0, 0];
}

function applyTransform() {
    const scaledAffine = [...affineTransform];
    const previewContainerWidth = $("#sourceSvg").width();
    scaledAffine[4] = scaledAffine[4] * previewContainerWidth;
    scaledAffine[5] = scaledAffine[5] * previewContainerWidth;

    currentSvg.documentElement.setAttribute("transform", `matrix(${scaledAffine.join(", ")})`);
    updateTransformText();

    const currentSvgString = new XMLSerializer().serializeToString(currentSvg);
    const svgDataURL = `data:image/svg+xml;base64,${btoa(currentSvgString)}`;
    $("#sourceSvg")[0].src = svgDataURL;
}

function updateTransformText() {
    function normalizeNumber(num) {
        return +num.toFixed(2);
    }
    $("#transformText").text(`(${normalizeNumber(affineTransform[4] * 100)}, ${normalizeNumber(affineTransform[5] * 100)}) ${normalizeNumber(affineTransform[0])}x`);
}

function extractWidthAndHeight(svgElement) {
    let width, height;
    if (svgElement.hasAttribute("viewBox")) {
        const viewBox = svgElement.getAttribute("viewBox").split(" ");
        width = viewBox[2];
        height = viewBox[3];
    }
    else if (svgElement.hasAttribute("width") && svgElement.hasAttribute("height")) {
        width = svgElement.getAttribute("width");
        height = svgElement.getAttribute("height");
    }

    if (!width || !height) {
        throw new Error("Invalid SVG");
    }

    return [parseFloat(width), parseFloat(height)];
}

export async function getCurrentSvgImageData() {
    const scaledHeight = currentHeight * renderScale;
    const scaledWidth = currentWidth * renderScale;

    const svgCopy = currentSvg.cloneNode(true);
    const svgElement = svgCopy.documentElement;
    const affineCopy = [...affineTransform];

    affineCopy[4] = affineCopy[4] * svgWidth;
    affineCopy[5] = affineCopy[5] * svgWidth;

    svgElement.setAttribute("transform", `matrix(${affineCopy.join(", ")})`);
    if (!svgElement.hasAttribute("width")) {
        svgElement.setAttribute("width", `${svgWidth}px`);
    }
    if (!svgElement.hasAttribute("height")) {
        svgElement.setAttribute("height", `${svgHeight}px`);
    }

    const svgString = new XMLSerializer().serializeToString(svgCopy);

    const canvas = new OffscreenCanvas(scaledWidth, scaledHeight);
    const canvasContext = canvas.getContext("2d",);
    const img = await loadImage(`data:image/svg+xml;base64,${btoa(svgString)}`);

    const bitmap = await createImageBitmap(img, {resizeHeight: scaledHeight, resizeWidth: scaledWidth});

    canvasContext.drawImage(bitmap, 0, 0, scaledWidth, scaledHeight);
    
    const imageData = canvasContext.getImageData(0, 0, canvas.width, canvas.height);
    
    return imageData;
}

async function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

export function getSvgJson(svgString) {
    const size = new paper.Size(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    paper.setup(size);
    const svg = paper.project.importSVG(svgString, {
        expandShapes: true,
        applyMatrix: true,
    });
    const json = svg.exportJSON();
    paper.project.remove();

    return json;
}

export function convertJsonToDataURL(json, width, height) {
    $("#previewCanvas").remove();
    $(document.body).append(`<canvas id="previewCanvas" width="${width}" height="${height}" style="display: none;"></canvas>`);
    
    paper.setup($("#previewCanvas")[0]);
    paper.project.importJSON(json);
    paper.view.draw();

    const dataURL = $("#previewCanvas")[0].toDataURL();
    
    paper.project.remove();
    $("#previewCanvas").remove();

    return dataURL;
}



