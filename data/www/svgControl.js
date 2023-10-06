document.body.addEventListener("click", function(e) {
	if(e.target && e.target.nodeName == "A" && e.target.parentElement.className == 'd-pad') {
        const validDirection = ["up", "down", "left", "right"];
        if (validDirection.includes(e.target.className)) {
            requestChangeInTransform(e.target.className);
        }
	}
});

function initSvgControl() {
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

function resetTransform() {
    xOffset = 0;
    yOffset = 0;
    zoom = 1;
}

let xOffset = 0, yOffset = 0, zoom = 1;
function getTransform() {
    return {
        xOffset,
        yOffset,
        zoom
    };
}

const nudgeBy = 5;
const zoomBy = 0.05;
function requestChangeInTransform(direction) {
    let proposedTransform;
    switch (direction) {
        case "up":
            proposedTransform = {
                xOffset,
                yOffset: yOffset - nudgeBy,
                zoom,
            }
            break;
        case "down":
            proposedTransform = {
                xOffset,
                yOffset: yOffset + nudgeBy,
                zoom,
            }
            break;
        case "left":
            proposedTransform = {
                xOffset: xOffset - nudgeBy,
                yOffset,
                zoom,
            }
            break;
        case "right":
            proposedTransform = {
                xOffset: xOffset + nudgeBy,
                yOffset,
                zoom,
            }
            break;
        case "in":
            proposedTransform = {
                xOffset,
                yOffset,
                zoom: zoom + zoomBy,
            }
            break;
        case "out":
            proposedTransform = {
                xOffset,
                yOffset,
                zoom: zoom - zoomBy,
            }
            break;
        case "reset":
            proposedTransform = {
                xOffset: 0,
                yOffset: 0,
                zoom: 1,
            }
            break;
        default:
            console.log("Unrecognized transform direction");
            return;
    }
    if (isValidTransform(proposedTransform)) {
        xOffset = proposedTransform.xOffset;
        yOffset = proposedTransform.yOffset;
        zoom = proposedTransform.zoom;

        setCurrentSvg();
    }
}

function isValidTransform(proposedTransform) {
    // TODO
    return true;
}

let currentSvg;
function setSvgString(svgString) {
    const width = 1000;
    const height = 800;

    const size = new paper.Size(width, height);
    paper.setup(size);
    
    const newSvg = paper.project.importSVG(svgString, {
        expandShapes: true,
        applyMatrix: true,
    });

    newSvg.fitBounds({
        x: 0,
        y: 0,
        width,
        height,
    });

    const transformedSvgString = paper.project.exportSVG({
        asString: true,
    });

    currentSvg = $(transformedSvgString);
    setCurrentSvg();
}

function setCurrentSvg() {
    currentSvg.attr("transform", `translate(${xOffset} ${yOffset}) scale(${zoom} ${zoom})`);
    var xml = (new XMLSerializer()).serializeToString(currentSvg[0]);
    $("#sourceSvg")[0].src = "data:image/svg+xml;base64," + btoa(xml);
}