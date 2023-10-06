document.body.addEventListener("click", function(e) {
	if(e.target && e.target.nodeName == "A" && e.target.parentElement.className == 'd-pad') {
        const validDirection = ["up", "down", "left", "right"];
        if (validDirection.includes(e.target.className)) {
            requestChangeInTransform(e.target.className);
        }
	}
});

let xOffset = 0, yOffset = 0, zoom = 1;
function getTransform() {
    return {
        xOffset,
        yOffset,
        zoom
    };
}

const nudgeBy = 5;
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
    return true;
}

let currentSvg;
function setSvgString(svgString) {
    const width = 1000;
    const height = 800;

    const canvas = $('<canvas id="myCanvas" width="1000" height="800" style="display:none;">');
    document.appendChild(canvas[0]);
    
    paper.setup(canvas[0]);

    currentSvg = paper.project.importSVG(svgString, {
        expandShapes: true,
        applyMatrix: true,
    });

    currentSvg.fitBounds({
        x: 0,
        y: 0,
        width,
        height,
    });

    currentSvg.applyMatrix = false;

    setCurrentSvg();
}

function setCurrentSvg() {
    currentSvg.matrix = new paper.Matrix(zoom, 0, 0, zoom, xOffset, yOffset);
    var xml = (new XMLSerializer).serializeToString(svg);
    img.src = "data:image/svg+xml;charset=utf-8,"+xml;
}