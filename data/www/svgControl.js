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

export function getTransform() {
    return [...affineTransform];
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

let currentSvg;
let currentScale;
let currentWidth;
let currentHeight;
export function setSvgString(svgString, currentState) {
    currentSvg = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const bbox = currentSvg.getBBox();

    currentWidth = currentState.safeWidth;
    currentScale = bbox.width / currentWidth;
    currentHeight = bbox.height / currentScale;
    applyTransform();
}

function applyTransform() {
    const scaledAffine = affineTransform.map(el => el * currentScale);
    currentSvg.setAttribute("transform", `matrix(${scaledAffine.join(", ")})`);
    updateTransformText();

    const currentSvgString = new XMLSerializer().serializeToString(currentSvg);
    const svgDataURL = `data:image/svg+xml;base64,${btoa(currentSvgString)}`;
    $("#sourceSvg")[0].src = svgDataURL;
}

function updateTransformText() {
    function normalizeNumber(num) {
        return +num.toFixed(2);
    }
    $("#transformText").text(`(${normalizeNumber(affineTransform[4])}, ${affineTransform[5]}) ${affineTransform[0]}x`);
}

export function getCurrentSvgRaster() {
    $("#previewCanvas").remove();
    $(document.body).append(`<canvas id="previewCanvas" width="${currentWidth}" height="${currentHeight}" style="display: none;"></canvas>`);
    const canvas = $("#previewCanvas")[0];
    const canvasContext = canvas.getContext("2d");
}



