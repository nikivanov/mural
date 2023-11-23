import * as svgControl from './svgControl.js';
import * as client from './client.js';

let currentState = null;

window.onload = function () {
    init();
};

let previewId = null;
let uploadConvertedCommands = null;
let convertedSvgURL = null;

async function checkIfExtendedToHome() {
    await new Promise(r => setTimeout(r, 1000));
    let done = false;
    while (!done) {
        await $.post("/doneWithPhase", {}, function (state, status, xhr) {
            if (xhr.status === 200) {
                //movement ended, proceed
                adaptToState(state);
                done = true;
            } else if (xhr.status === 202) {
                // still moving, retry
            }
        }).fail(function () {
            alert("Done With Phase command failed");
            location.reload();
        });

        await new Promise(r => setTimeout(r, 1000));
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
        } else {
            $("#preview").attr("disabled", "disabled");
            $(".svg-control").hide();
            $("#infillDensity").val(0);
        }
    });

    async function renderPreview() {
        const thisPreviewId = previewId;
        const svgString = await getUploadedSvgString();

        if (!svgString) {
            throw new Error('No SVG string');
        }
        
        const transform = svgControl.getTransform();
        const infillDensity = getInfillDensity();

        const requestObj = {
            svg: svgString,
            scale: transform.zoom,
            x: transform.xOffset,
            y: transform.yOffset,
            width: currentState.safeWidth,
            infillDensity,
        };
        
        console.log("Posting to lambda");
        const resp = await $.post({
            url: "https://xbo80tmrf1.execute-api.us-east-1.amazonaws.com/svg-to-commands",
            data: JSON.stringify(requestObj),
            dataType: "json",
            contentType: "application/json"
        });
                   
        if (thisPreviewId !== previewId) {
            return;
        }
            
        uploadConvertedCommands = resp.commands;
        const splitCommands = uploadConvertedCommands.split('\n');

        const distanceCommand = splitCommands[0];
        const distanceMatches = distanceCommand.match(/d[0-9]+/);

        const heightCommand = splitCommands[1];
        const heightMatches = heightCommand.match(/h[0-9]+/);

        
        if (distanceMatches[0] && heightMatches[0]) {
            const height = parseInt(heightMatches[0].slice(1));
            const distance = parseInt(distanceMatches[0].slice(1));
            if (height && distance) {
                const requestObj = {
                    commands: uploadConvertedCommands,
                    width: currentState.safeWidth,
                    height,
                };
                const previewResp = await $.post({
                    url: "https://xbo80tmrf1.execute-api.us-east-1.amazonaws.com/commands-to-svg",
                    data: JSON.stringify(requestObj),
                    dataType: "json",
                    contentType: "application/json"
                });
                if (thisPreviewId !== previewId) {
                    return;
                }
                const convertedSvg = previewResp.svg;
                const svgBlob = new Blob([convertedSvg], {
                    type: "image/svg+xml"
                });
                convertedSvgURL = URL.createObjectURL(svgBlob);
                $(".loading").hide();
                $("#previewSpinner").css('visibility', 'hidden');
                $("#previewSvg").attr("src", convertedSvgURL);
                $("#totalDistance").text(distance);
                $(".svg-preview").show();
                $("#beginDrawing").removeAttr("disabled");
            } else {
                alert("Invalid file returned by lambda");
            }
        } else {
            alert("Invalid file returned by lambda");
        }
        
    }

    const debouncedRenderPreview = $.debounce(3000, function(e) {
        renderPreview();
    });

    $("#infillDensity").on('input', async function() {
        $("#previewSpinner").css('visibility', 'visible');
        $("#beginDrawing").attr("disabled", "disabled");
        previewId = Date.now();
        debouncedRenderPreview();  
    });

    $("#preview").click(async function() {
        $("#svgUploadSlide").hide();
        $("#drawingPreviewSlide").show();
        previewId = Date.now();
        debouncedRenderPreview();
    });

    $("#backToSvgSelect").click(function() {
        if (convertedSvgURL) {
            URL.revokeObjectURL(convertedSvgURL);
        }
        convertedSvgURL = null;
        previewId = null;
        uploadConvertedCommands = null;

        $(".loading").show();
        $("#previewSpinner").css('visibility', 'visible');
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

    svgControl.initSvgControl();

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
            if (state.moving) {
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