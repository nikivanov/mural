let currentState = null;

window.onload = function () {
    init();
};

let uploadId = null;
let uploadLocalURL = null;
let uploadConvertedCommands = null;
let convertedSvgURL = null;
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
        await leftRetractUp();
        await rightRetractUp();
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
            leftRetractDown(); 
        } else {
            leftRetractUp();
        }
    });

    $("#rightMotorToggle").change(function() {
        if (this.checked) {
            rightRetractDown(); 
        } else {
            rightRetractUp();
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

    $("#uploadSvg").change(function() {
        const [file] = this.files;
        if (file) {
            if (uploadLocalURL) {
                URL.revokeObjectURL(uploadLocalURL);
            }
            uploadLocalURL = URL.createObjectURL(file);
            uploadId = Date.now();
            $("#sourceSvg").attr("src", uploadLocalURL);
            $("#preview").removeAttr("disabled");
        } else {
            $("#preview").attr("disabled", "disabled");
        }
    });

    $("#preview").click(function() {
        $("#svgUploadSlide").hide();
        $("#drawingPreviewSlide").show();
        const thisUploadId = uploadId;
        $.get(uploadLocalURL, function(data) {
            const svgString = data.rootElement.outerHTML;
            const requestObj = {
                svg: svgString,
                width: 1000,
                height: 800,
                start_x: 518,
                start_y: 250,
            };
            const dataString = JSON.stringify(requestObj);
            $.post("https://5ckjame5j3y4oxfrjtemod76t40khfcq.lambda-url.us-east-1.on.aws/", dataString, function(resp) {
                if (thisUploadId === uploadId) {
                    uploadConvertedCommands = resp.commands;
                    const requestObj = {
                        commands: uploadConvertedCommands,
                        width: 1000,
                        height: 800,
                    };
                    const dataString = JSON.stringify(requestObj);
                    $.post("https://k6cpd6wdxwtvvlz3d7gbb4trne0qsoap.lambda-url.us-east-1.on.aws/", dataString, function(resp) {
                        if (thisUploadId === uploadId) {
                            const convertedSvg = resp.svg;
                            const svgBlob = new Blob([convertedSvg], {
                                type: "image/svg+xml"
                            });
                            convertedSvgURL = URL.createObjectURL(svgBlob);
                            $(".loading").hide();
                            $("#previewSvg").attr("src", convertedSvgURL);
                            $("#previewSvg").show();
                            $("#beginDrawing").removeAttr("disabled");
                        }
                    }).fail(function (err) {
                        alert("Failed to render commands back to svg: " + err.responseText)
                    });
                }
            }, ).fail(function(err) {
                alert("Render function failed: " + err.responseText);
            });
        }).fail(function(err) {
            alert("Failed to acquire upload content, somehow: " + err.responseText);
        });
    });

    $("#backToSvgSelect").click(function() {
        if (uploadLocalURL) {
            URL.revokeObjectURL(uploadLocalURL);
        }
        if (convertedSvgURL) {
            URL.revokeObjectURL(convertedSvgURL);
        }
        uploadLocalURL = null;
        convertedSvgURL = null;
        uploadId = null;
        uploadConvertedCommands = null;

        $(".loading").show();
        $("#previewSvg").removeAttr("src");
        $("#previewSvg").hide();
        $("#beginDrawing").attr("disabled", "disabled");

        $("#uploadSvg").val('');
        $("#sourceSvg").removeAttr("src");
        $("#preview").attr("disabled", "disabled");

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
            leftRetractDown(); 
        } else if (leftMotorDir >= 1) {
            leftExtendDown();
        } else {
            leftRetractUp();
        }
    });

    $("#rightMotorTool").on('input', function() {
        const rightMotorDir = parseInt($("#rightMotorTool").val());
        if (rightMotorDir <= -1) {
            rightRetractDown(); 
        } else if (rightMotorDir >= 1) {
            rightExtendDown();
        } else {
            rightRetractUp();
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
        rightRetractUp();
        leftRetractUp();
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

    $("#loadingSlide").show();

    $.get("/getState", function(data) {
        adaptToState(data);
    }).fail(function() {
        alert("Failed to retrieve state");
    });
}

function adaptToState(state) {
    $(".muralSlide").hide();
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