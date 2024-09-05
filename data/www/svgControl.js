document.body.addEventListener("click", function(e) {
	if(e.target && e.target.nodeName == "A" && e.target.parentElement.className == 'd-pad') {
        const validDirection = ["up", "down", "left", "right"];
        if (validDirection.includes(e.target.className)) {
            requestChangeInTransform(e.target.className);
        }
	}
});

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
    const svgWidth = parseFloat(svgElement.getAttribute('width'));
    const svgHeight = parseFloat(svgElement.getAttribute('height'));

    currentWidth = currentState.safeWidth;
    currentScale = svgWidth / currentWidth;
    currentHeight = svgHeight / currentScale;
    applyTransform();
}

function getScaledAffine() {
    const scaledAffine = [...affineTransform];
    scaledAffine[4] = scaledAffine[4] * currentScale;
    scaledAffine[5] = scaledAffine[5] * currentScale;
    return scaledAffine;
}

function applyTransform() {
    const scaledAffine = getScaledAffine();
    currentSvg.documentElement.setAttribute("transform", `matrix(${affineTransform.join(", ")})`);
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

export async function getCurrentSvgImageData(renderScale) {
    const originalSvg = new DOMParser().parseFromString(originalSvgString, 'image/svg+xml');
    const svgElement = originalSvg.documentElement;

    const svgWidth = parseFloat(svgElement.getAttribute('width'));
    const svgHeight = parseFloat(svgElement.getAttribute('height'));
    const scaledHeight = svgHeight / currentScale * renderScale;
    const scaledWidth = svgWidth / currentScale * renderScale;
    const scaledAffine = getScaledAffine();

    svgElement.setAttribute("transform", `matrix(${scaledAffine.join(", ")})`);
    svgElement.setAttribute('width', scaledWidth.toString());
    svgElement.setAttribute('height', scaledHeight.toString());

    const scaledSvgString = new XMLSerializer().serializeToString(svgElement);

    $("#previewCanvas").remove();
    $(document.body).append(`<canvas id="previewCanvas" width="${scaledWidth}" height="${scaledHeight}" style="display: none;"></canvas>`);
    const canvas = $("#previewCanvas")[0];
    const canvasContext = canvas.getContext("2d");

    const img = await loadImage(`data:image/svg+xml;base64,${btoa(scaledSvgString)}`)

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



