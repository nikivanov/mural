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

let originalSvg;
let transformedSvg;
let currentWidth;
let currentHeight;
export function setSvgString(svgString, currentState) {
    resetTransform();

    originalSvg = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    currentWidth = currentState.safeWidth;
    normalizeSvg();
    applyTransform();
}

const transformGroupID = "muralTransformGroup";
function normalizeSvg() {
    const svgElement = originalSvg.documentElement;
    let width, height;

    if (svgElement.hasAttribute("width") && svgElement.hasAttribute("height")) {
        width = convertUnitsToPx(svgElement.getAttribute("width"));
        height = convertUnitsToPx(svgElement.getAttribute("height"));
    }
    
    if (svgElement.hasAttribute("viewBox")) {
        if (!width || !height) {
            const viewBox = svgElement.getAttribute("viewBox").split(/[\s,]/).filter(s => s != "");;
            width = parseFloat(viewBox[2]);
            height = parseFloat(viewBox[3]);
        }
    } else {
        svgElement.setAttribute("viewBox", `0, 0, ${width}, ${height}`);
    }
    
    if (!width || !height) {
        throw new Error("Invalid SVG");
    }

    currentHeight = currentWidth / width * height;

    svgElement.setAttribute("width", currentWidth);
    svgElement.setAttribute("height", currentHeight);

    const transformGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    transformGroup.id = transformGroupID;
    while (svgElement.firstChild) {
        transformGroup.appendChild(svgElement.firstChild);
    }
    svgElement.appendChild(transformGroup);
}

function convertUnitsToPx(dimension) {
    const unitConversionFactors = {
        pt: 1.3333,    // Points to pixels
        pc: 16,        // Picas to pixels
        in: 96,        // Inches to pixels
        cm: 37.795,    // Centimeters to pixels
        mm: 3.7795,    // Millimeters to pixels
        px: 1,         // Pixels to pixels
    };

    const match = dimension.match(/([\d.]+)([a-z%]*)/i);
    if (!match) {
        alert("Invalid SVG");
        throw new Error(`Invalid dimension: "${dimension}"`);
    }
    const value = parseFloat(match[1]);
    const unit = match[2] || "px"; // Default to pixels if no unit is provided
    const conversionFactor = unitConversionFactors[unit] || 1;
    return value * conversionFactor; // Convert to pixels
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

export function getRenderSvg() {
    return makeTransformedSvgWithHeight()[0];
}

function applyTransform() {
    updateTransformText();

    const [clonedSvg, newHeight] = makeTransformedSvgWithHeight();
    currentHeight = newHeight;
    
    const svgString = new XMLSerializer().serializeToString(clonedSvg);
    const svgDataURL = `data:image/svg+xml;base64,${btoa(svgString)}`;
    $("#sourceSvg")[0].src = svgDataURL;

    transformedSvg = clonedSvg;
}

function makeTransformedSvgWithHeight() {
    const clonedSvg = originalSvg.cloneNode(true);
    const svgElement = clonedSvg.documentElement;

    const viewBox = svgElement.getAttribute("viewBox").split(/[\s,]/).filter(s => s != "");
    const vbWidth = parseFloat(viewBox[2]);
    const vbHeight = parseFloat(viewBox[3]);

    const scaledAffine = [...affineTransform];
    scaledAffine[4] = scaledAffine[4] * vbWidth;

    let newHeight = parseFloat(svgElement.getAttribute("height"));
    if (scaledAffine[5] > 0) {
        // when shifting down increase height
        const heightOffset = scaledAffine[5] * newHeight;
        newHeight = newHeight + heightOffset;
        svgElement.setAttribute("height", newHeight);

        scaledAffine[5] = scaledAffine[5] * vbHeight;
        viewBox[3] = vbHeight + scaledAffine[5];
        svgElement.setAttribute("viewBox", viewBox.join(", "));
    } else {
        scaledAffine[5] = scaledAffine[5] * vbHeight;
    }

    const transfromGroup = clonedSvg.getElementById(transformGroupID);
    transfromGroup.setAttribute("transform", `matrix(${scaledAffine.join(", ")})`);

    return [clonedSvg, newHeight];
}

function updateTransformText() {
    function normalizeNumber(num) {
        return +num.toFixed(2);
    }
    $("#transformText").text(`(${normalizeNumber(affineTransform[4] * 100)}, ${normalizeNumber(affineTransform[5] * 100)}) ${normalizeNumber(affineTransform[0])}x`);
}

export async function getCurrentSvgImageData() {
    const scaledHeight = currentHeight * renderScale;
    const scaledWidth = currentWidth * renderScale;
    
    const svgString = new XMLSerializer().serializeToString(transformedSvg);

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



