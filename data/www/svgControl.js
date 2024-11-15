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
const nudgeBy = 5;
const zoomBy = 0.05;
function requestChangeInTransform(direction) {
    switch (direction) {
        case "up":
            affineTransform[5] = affineTransform[5] - nudgeBy;
            break;
        case "down":
            affineTransform[5] = affineTransform[5] + nudgeBy;
            break;
        case "left":
            affineTransform[4] = affineTransform[4] - nudgeBy;
            break;
        case "right":
            affineTransform[4] = affineTransform[4] + nudgeBy;
            break;
        case "in":
            affineTransform[0] = affineTransform[0] + zoomBy;
            affineTransform[3] = affineTransform[3] + zoomBy;
            break;
        case "out":
            affineTransform[0] = affineTransform[0] - zoomBy;
            affineTransform[3] = affineTransform[3] - zoomBy;
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

let originalSvgString;
let currentSvg;
let currentScale;
let currentWidth;
let currentHeight;
export function setSvgString(svgString, currentState) {
    originalSvgString = svgString;
    currentSvg = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const svgElement = currentSvg.documentElement;
    const [svgWidth, svgHeight] = extractWidthAndHeight(svgElement);

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

function getScaledAffine() {
    const scaledAffine = [...affineTransform];
    scaledAffine[4] = scaledAffine[4] * currentScale;
    scaledAffine[5] = scaledAffine[5] * currentScale;
    return scaledAffine;
}

export function getRenderTransform() {
    const matrix = new paper.Matrix();
    // this should bring us back to currentWidth
    matrix.scale(1 / renderScale);
    matrix.translate(affineTransform[4] * currentScale * renderScale, affineTransform[5] * currentScale * renderScale);
    
    return matrix.values;
}

function applyTransform() {
    const scaledAffine = getScaledAffine();
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
    $("#transformText").text(`(${normalizeNumber(affineTransform[4])}, ${normalizeNumber(affineTransform[5])}) ${normalizeNumber(affineTransform[0])}x`);
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
    const originalSvg = new DOMParser().parseFromString(originalSvgString, 'image/svg+xml');
    const svgElement = originalSvg.documentElement;

    
    const [svgWidth, svgHeight] = extractWidthAndHeight(svgElement);
    const scaledHeight = svgHeight / currentScale * renderScale;
    const scaledWidth = svgWidth / currentScale * renderScale;
    const scaledAffine = getScaledAffine();

    svgElement.setAttribute("transform", `matrix(${scaledAffine.join(", ")})`);

    svgElement.setAttribute('width', scaledWidth.toString());
    svgElement.setAttribute('height', scaledHeight.toString());
    
    if (svgElement.hasAttribute("viewBox")) {
        const viewBox = svgElement.getAttribute("viewBox").split(" ").map(str => parseFloat(str));
        viewBox.forEach(num => num / currentScale * renderScale);
        svgElement.setAttribute("viewBox", viewBox.map(num => num.toString()).join(" "));
    }

    const scaledSvgString = new XMLSerializer().serializeToString(svgElement);

    const canvas = new OffscreenCanvas(scaledWidth, scaledHeight);
    const canvasContext = canvas.getContext("2d");
    const img = await loadImage(`data:image/svg+xml;base64,${btoa(scaledSvgString)}`);
    const bitmap = await createImageBitmap(img);
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



