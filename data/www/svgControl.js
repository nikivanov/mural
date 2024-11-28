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
// nudge by this fraction of the viewport's width and height
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
            resetTransform();
            break;
        default:
            console.log("Unrecognized transform direction");
            return;
    }
    applyTransform();
}

function resetTransform() {
    affineTransform[0] = 1;
    affineTransform[3] = 1;
    affineTransform[4] = 0;
    affineTransform[5] = 0;
}

let svgInfo;
export function setSvgString(svgString, currentState) {
    resetTransform();

    const svg = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    svgInfo = normalizeSvg(svg, currentState.safeWidth);
    applyTransform();
}

function normalizeSvg(svg, currentWidth) {
    const info  = {};
    info.svg = svg;
    info.currentWidth = currentWidth;
    
    const svgElement = svg.documentElement;
    let width, height;

    if (svgElement.hasAttribute("width") && svgElement.hasAttribute("height")) {
        width = parseFloat(svgElement.getAttribute("width"));
        height = parseFloat(svgElement.getAttribute("height"));
    }
    
    if (svgElement.hasAttribute("viewBox")) {
        const viewBox = svgElement.getAttribute("viewBox").split(/[\s,]/);
        info.viewboxWidth = parseFloat(viewBox[2]);
        info.viewboxHeight = parseFloat(viewBox[3]);

        if (!width && !height) {
            width = info.viewboxWidth;
            height = info.viewboxHeight;
        }
    } else {
        info.viewboxWidth = width;
        info.viewboxHeight = height;
    }
    
    if (!width || !height) {
        throw new Error("Invalid SVG");
    }

    const newWidth = info.currentWidth;
    const newHeight = info.currentWidth / width * height;
    info.currentHeight = newHeight;

    svgElement.setAttribute("width", newWidth);
    svgElement.setAttribute("height", newHeight);

    const transformGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    while (svgElement.firstChild) {
        transformGroup.appendChild(svgElement.firstChild);
    }
    svgElement.appendChild(transformGroup);
    info.transformGroup = transformGroup;

    return info;
}

export function getTargetWidth() {
    return svgInfo.currentWidth;
}

export function getTargetHeight() {
    return svgInfo.currentHeight;
}

export function getRenderTransform() {
    return [1 / renderScale, 0, 0, 1 / renderScale, 0, 0];
}

export function getScaledAffine() {
    const scaledAffine = [...affineTransform];
    scaledAffine[4] = scaledAffine[4] * svgInfo.viewboxWidth;
    scaledAffine[5] = scaledAffine[5] * svgInfo.viewboxHeight;
    return scaledAffine
}

function applyTransform() {
    updateTransformText();
    
    const scaledAffine = getScaledAffine();
    svgInfo.transformGroup.setAttribute("transform", `matrix(${scaledAffine.join(", ")})`);
    
    const svgString = new XMLSerializer().serializeToString(svgInfo.svg);
    const svgDataURL = `data:image/svg+xml;base64,${btoa(svgString)}`;
    $("#sourceSvg")[0].src = svgDataURL;
}

function updateTransformText() {
    function normalizeNumber(num) {
        return +num.toFixed(2);
    }
    $("#transformText").text(`(${normalizeNumber(affineTransform[4] * 100)}, ${normalizeNumber(affineTransform[5] * 100)}) ${normalizeNumber(affineTransform[0])}x`);
}

export async function getCurrentSvgImageData() {
    const scaledHeight = svgInfo.currentHeight * renderScale;
    const scaledWidth = svgInfo.currentWidth * renderScale;
    
    const svgString = new XMLSerializer().serializeToString(svgInfo.svg);

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



