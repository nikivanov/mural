import * as svgControl from './svgControl.js';
import * as client from './client.js';

let currentState = null;

let currentWorker = null;

window.onload = function () {
    init();
};

let uploadConvertedCommands = null;

async function checkIfExtendedToHome() {
    const waitPeriod = 2000;
    await new Promise(r => setTimeout(r, waitPeriod));
    let done = false;
    while (!done) {
        try {
            const state = await $.get("/getState");
            if (state.phase !== 'ExtendToHome') {
                adaptToState(state);
                done = true;
            } else {
                await new Promise(r => setTimeout(r, waitPeriod));
            }
        } catch (err) {
            alert("Failed to get current phase: " + err);
            location.reload();
        }
    }
}

function init() {
    function doneWithPhase(custom) {
        $(".muralSlide").hide();
        $("#loadingSlide").show();
        if (!custom) {
            custom = {
                url: "/doneWithPhase",
                data: {},
                commandName: "Done With Phase",
            };
        }

        $.post(custom.url, custom.data || {}, function(state) {
            adaptToState(state);
        }).fail(function() {
            alert(`${commandName} command failed`);
            location.reload();
        });
    }

    $("#beltsRetracted").click(async function() { 
        await client.leftRetractUp();
        await client.rightRetractUp();
        doneWithPhase();
    });

    $("#setDistance").click(function() {
        const inputValue = parseInt($("#distanceInput").val());
        if (isNaN(inputValue)) {
            throw new Error("input value is not a number");
        }
        doneWithPhase({
            url: "/setTopDistance",
            data: {distance: inputValue},
            commandName: "Set Top Distance",
        });
    });

    $("#leftMotorToggle").change(function() {
        if (this.checked) {
            client.leftRetractDown(); 
        } else {
            client.leftRetractUp();
        }
    });

    $("#rightMotorToggle").change(function() {
        if (this.checked) {
            client.rightRetractDown(); 
        } else {
            client.rightRetractUp();
        }
    });

    $("#extendToHome").click(function() {
        $(this).prop( "disabled", true);
        $("#extendingSpinner").css('visibility', 'visible');
        $.post("/extendToHome", {})
        .always(async function() {
            await checkIfExtendedToHome();
        });
    });
    
    function getServoValueFromInputValue() {
        const inputValue = parseInt($("#servoRange").val());
        const value = 90 - inputValue;
        let normalizedValue;
        if (value < 0) {
            normalizedValue = 0;
        } else if (value > 90) {
            normalizedValue = 90;
        } else {
            normalizedValue = value;
        }

        return normalizedValue;
    }

    $("#servoRange").on('input', $.throttle(250, function (e) {
        const servoValue = getServoValueFromInputValue();
        $.post("/setServo", {angle: servoValue});
    }));

    const stepVaule = 5;
    $("#penMinus").click(function() {
        $("#servoRange")[0].stepDown(stepVaule);
        $("#servoRange").trigger('input');
    });

    $("#penPlus").click(function() {
        $("#servoRange")[0].stepUp(stepVaule);
        $("#servoRange").trigger('input');
    });

    $("#setPenDistance").click(function () {
        const inputValue = getServoValueFromInputValue();
        
        doneWithPhase({
            url: "/setPenDistance",
            data: {angle: inputValue},
            commandName: "Set Pen Distance",
        });
    });

    async function getUploadedSvgString() {
        const [file] = $("#uploadSvg")[0].files;
        if (file) {
            return await file.text();
        } else {
            return null;
        }
    }

    $("#uploadSvg").change(async function() {
        const svgString = await getUploadedSvgString();
        if (svgString) {
            svgControl.setSvgString(svgString, currentState);

            $(".svg-control").show();
            $("#preview").removeAttr("disabled");
            updateTransformText();
        } else {
            $("#preview").attr("disabled", "disabled");
            $(".svg-control").hide();
            $("#infillDensity").val(0);
        }
    });

    async function renderPreview() {
        if (currentWorker) {
            console.log("Terminating previous worker");
            currentWorker.terminate();
        }

        const svgString = await getUploadedSvgString();

        if (!svgString) {
            throw new Error('No SVG string');
        }

        const svgJson = svgControl.getSvgJson(svgString);
        
        const transform = svgControl.getTransform();
        const infillDensity = getInfillDensity();

        const requestObj = {
            json: svgJson,
            scale: transform.zoom,
            x: transform.xOffset,
            y: transform.yOffset,
            width: currentState.safeWidth,
            infillDensity,
            homeX: currentState.homeX,
            homeY: currentState.homeY,
        };
        
        console.log("Starting worker");

        currentWorker = new Worker('./worker/worker.js');

        currentWorker.onmessage = (e) => {
            if (e.data.type === 'status') {
                $("#progressBar").text(e.data.payload);
            } else if (e.data.type === 'result') {
                console.log("Worker finished!");

                uploadConvertedCommands = e.data.payload.commands.join('\n');
                const convertedSvgJson = e.data.payload.json;
                const dataURL = svgControl.convertJsonToDataURL(convertedSvgJson, e.data.payload.width, e.data.payload.height);

                const totalDistanceM = +(e.data.payload.distance / 1000).toFixed(1);
                const drawDistanceM = +(e.data.payload.drawDistance / 1000).toFixed(1);
                
                deactivateProgressBar();
                $("#previewSvg").attr("src", dataURL);
                $("#distances").text(`Total: ${totalDistanceM}m / Draw: ${drawDistanceM}m`);
                $(".svg-preview").show();
                $("#beginDrawing").removeAttr("disabled");
            }
        };

        currentWorker.postMessage(requestObj);
    }

    $("#testPattern").click(function() {
        const commands = [
            "d100",
            "h100",
            "p0",
            "0 0",
            "p1",
            "1036 0",
            "1036 1000",
            "0 1000",
            "0 0",
            "1036 0",
            "1036 1000",
            "0 1000",
            "0 0",
            "1036 0",
            "1036 1000",
            "0 1000",
            "0 0",
            "p0",
        ];
        
        uploadConvertedCommands = commands.join('\n');
        $("#beginDrawing").click();
    });

    function activateProgressBar() {
        const bar = $("#progressBar");
        bar.addClass("progress-bar-striped");
        bar.addClass("progress-bar-animated");
        bar.removeClass("bg-success");
        bar.text("");
    }

    function deactivateProgressBar() {
        const bar = $("#progressBar");
        bar.removeClass("progress-bar-striped");
        bar.removeClass("progress-bar-animated");
        bar.addClass("bg-success");
        bar.text("Success");
    }

    function updateTransformText() {
        const transform = svgControl.getTransform();
        function normalizeNumber(num) {
            return +num.toFixed(2);
        }
        $("#transformText").text(`(${normalizeNumber(transform.xOffset)}, ${normalizeNumber(transform.yOffset)}) ${normalizeNumber(transform.zoom)}x`);
    }

    $("#infillDensity").on('input', async function() {
        activateProgressBar();
        $("#beginDrawing").attr("disabled", "disabled");
        renderPreview();
    });

    $("#preview").click(async function() {
        $("#svgUploadSlide").hide();
        $("#drawingPreviewSlide").show();
        renderPreview();
    });

    $("#backToSvgSelect").click(function() {
        uploadConvertedCommands = null;

        $(".loading").show();
        activateProgressBar();
        $("#previewSvg").removeAttr("src");
        $(".svg-preview").hide();
        $("#beginDrawing").attr("disabled", "disabled");

        $("#svgUploadSlide").show();
        $("#drawingPreviewSlide").hide();
    });
    
    $("#beginDrawing").click(function() {
        if (!uploadConvertedCommands) {
            throw new Error('Commands are empty');
        }
        $("#beginDrawing").attr("disabled", "disabled");

        const commandsBlob = new Blob([uploadConvertedCommands], {
            type: "text/plain"
        });

        const formData = new FormData();
        formData.append("commands", commandsBlob);

        $.ajax({
            data: formData,
            processData: false,
            contentType: false,
            type: 'POST',
            success: function() {
                $("#drawingPreviewSlide").hide();
                $("#drawingBegan").show();
                $.post("/run", {});
            },
            error: function(err) {
                alert('Upload to Mural failed! ' + err);
            }
        });
    });

    $("#leftMotorTool").on('input', function() {
        const leftMotorDir = parseInt($("#leftMotorTool").val());
        if (leftMotorDir <= -1) {
            client.leftRetractDown(); 
        } else if (leftMotorDir >= 1) {
            client.leftExtendDown();
        } else {
            client.leftRetractUp();
        }
    });

    $("#rightMotorTool").on('input', function() {
        const rightMotorDir = parseInt($("#rightMotorTool").val());
        if (rightMotorDir <= -1) {
            client.rightRetractDown(); 
        } else if (rightMotorDir >= 1) {
            client.rightExtendDown();
        } else {
            client.rightRetractUp();
        }
    });

    $("#parkServoTool").click(function() {
        $.post("/setServo", {angle: 0});
    });

    $("#estepsTool").click(function() {
        $.post("/estepsCalibration", {});
    });

    const toolsModal = $("#toolsModal")[0];

    toolsModal.addEventListener('hidden.bs.modal', function (event) {
        client.rightRetractUp();
        client.leftRetractUp();
    });

    $("#startOver").click(function() {
        doneWithPhase();
    });

    $("#resume").click(function() {
        doneWithPhase({
            url: "/resume",
            commandName: "Resume",
        }); 
    });

    svgControl.initSvgControl(updateTransformText);

    $("#loadingSlide").show();

    $.get("/getState", function(data) {
        adaptToState(data);
    }).fail(function() {
        alert("Failed to retrieve state");
    });
}

function adaptToState(state) {
    $(".muralSlide").hide();
    currentState = state;
    switch(state.phase) {
        case "ResumeOrStartOver":
            $(".resumeDistance").text(state.resumeDistance);
            $("#resumeOrStartSlide").show();
            break;
        case "RetractBelts":
            $("#retractBeltsSlide").show();
            break;
        case "SetTopDistance":
            $("#distanceBetweenAnchorsSlide").show();
            break;
        case "ExtendToHome":
            $("#extendToHomeSlide").show();
            if (state.moving || state.startedHoming) {
                $("#extendToHome").prop( "disabled", true);
                $("#extendingSpinner").css('visibility', 'visible');
                checkIfExtendedToHome();
            }
            break;
        case "PenCalibration":
            $.post("/setServo", {angle: 90});
            $("#penCalibrationSlide").show();
            break;
        case "SvgSelect":
            $("#svgUploadSlide").show();
            break;
        default:
            alert("Unrecognized phase");
    }
}

function getInfillDensity() {
    const density = parseInt($("#infillDensity").val());
    if ([0, 1, 2, 3, 4].includes(density)) {
        return density;
    } else {
        throw new Error('Invalid density');
    }
}