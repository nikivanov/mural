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
    return {
        xOffset: currentSvg.matrix.tx,
        yOffset: currentSvg.matrix.ty,
        zoom: currentSvg.matrix.a,
        height: currentSvg.view.viewSize.height,
    };
}

const nudgeBy = 5;
const zoomBy = 0.05;
function requestChangeInTransform(direction) {
    switch (direction) {
        case "up":
            currentSvg.translate({x: 0, y: -nudgeBy});
            adjustCanvasHeight();
            break;
        case "down":
            currentSvg.translate({x: 0, y: nudgeBy});
            adjustCanvasHeight();
            break;
        case "left":
            currentSvg.translate({x: -nudgeBy, y: 0});
            break;
        case "right":
            currentSvg.translate({x: nudgeBy, y: 0});
            break;
        case "in":
            {
                const currentScaling = currentSvg.scaling.x;
                const targetScaling = currentScaling + zoomBy;
                currentSvg.scale(targetScaling / currentScaling);
            }
            adjustCanvasHeight();
            break;
        case "out":
            {
                const currentScaling = currentSvg.scaling.x;
                const targetScaling = currentScaling - zoomBy;
                currentSvg.scale(targetScaling / currentScaling);
            }
            adjustCanvasHeight();
            break;
        case "reset":
            currentSvg.matrix = new paper.Matrix(1, 0, 0, 1, 0, 0);
            adjustCanvasHeight();
            break;
        default:
            console.log("Unrecognized transform direction");
            return;
    }

    setCurrentSvg();
}

function adjustCanvasHeight() {
    const heightNeeded = currentSvg.bounds.y + currentSvg.bounds.height;
    if (heightNeeded > currentSvgHeight) {
        currentSvg.view.viewSize.height = heightNeeded;
    } else {
        currentSvg.view.viewSize.height = currentSvgHeight;
    }
}

let currentSvg;
let currentSvgHeight;
export function setSvgString(svgString, currentState) {
    const fullWidth = currentState.topDistance;
    const width = currentState.safeWidth;

    currentSvgHeight = getHeight(svgString, width);
    $("#hiddencanvas").remove();
    $(document.body).append(`<canvas id="hiddencanvas" width="${width}" height="${currentSvgHeight}" style="display: none;"></canvas>`);
    
    paper.setup($("#hiddencanvas")[0]);
    
    currentSvg = paper.project.importSVG(svgString, {
        expandShapes: true,
        applyMatrix: true,
    });

    currentSvg.fitBounds({
        x: 0,
        y: 0,
        width,
        height: currentSvgHeight,
    });

    toggleApplyMatrix(currentSvg, false);

    setCurrentSvg();
}

function toggleApplyMatrix(item, on) {
    item.applyMatrix = on;
    if (Array.isArray(item.children)) {
        for (const child of item.children) {
            toggleApplyMatrix(child, on);
        }
    }
}

function setCurrentSvg() {
    paper.view.draw();
    $("#sourceSvg")[0].src = $("#hiddencanvas")[0].toDataURL();
}

function getHeight(svgString, width) {
    const sizeBeforeFitting = new paper.Size(width, Number.MAX_SAFE_INTEGER);
    paper.setup(sizeBeforeFitting);
    const svgBeforeFitting = paper.project.importSVG(svgString, {
        expandShapes: true,
        applyMatrix: true,
    });
    svgBeforeFitting.fitBounds({
        x: 0,
        y: 0,
        width: sizeBeforeFitting.width,
        height: sizeBeforeFitting.height,
    });
    const height = Math.floor(svgBeforeFitting.bounds.height);
    paper.project.remove();

    return height;
}