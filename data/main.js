const __state = {
    resumeDistance: "%RESUME_DISTANCE%",
    phase: "%PHASE%",
};

const STATE = {
    get resumeDistance() {
        const parsed = parseInt(__state.resumeDistance);
        if (isNaN(parsed) || parsed <= 0) {
            return -1;
        } else {
            return parsed;
        }
    },

    get phase() {
        return __state.phase;
    },

    set phase(val) {
        __state.phase = val;
    }
}

window.onload = function () {
    init();
};
function init() {
    $("#beltsRetracted").click(function() { 
        leftRetractUp();
        rightRetractUp();
        $("#retractBeltsSlide").hide();
        $("#distanceBetweenAnchorsSlide").show();
    });

    $("#setDistance").click(function() {
        const inputValue = parseInt($("#distanceInput").val());
        $.post("/setTopDistance", {angle: inputValue});
        
        $("#distanceBetweenAnchorsSlide").hide();
        $("#extendToHomeSlide").show();
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
        $.post("/extendToHome", {})
        .always(async function() {
            await new Promise(r => setTimeout(r, 1000));
            while (true) {
                try{
                    const moving = (await $.get("/isMoving")) == 'true';
                    if (!moving) {
                        break;
                    }
                } catch (e) {
                    console.log(e);
                }

                await new Promise(r => setTimeout(r, 1000));
            }

            $("#extendToHomeSlide").hide();
            $("#penCalibrationSlide").show();
            $.post("/setServo", {angle: 90});
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
        $.post("/setPenDistance", {angle: inputValue});

        $("#penCalibrationSlide").hide();
        $("#svgUploadSlide").show();
    });

    $("#uploadSvg").change(function() {
        const [file] = this.files;
        if (file) {
            const localURL = URL.createObjectURL(file);
            $("#sourceSvg").attr("src", localURL);
            $("#preview").removeAttr("disabled");
        } else {
            $("#preview").attr( "disabled", "disabled" );
        }
    });

    $("#preview").click(function() {
        $("#svgUploadSlide").hide();
        $("#drawingPreviewSlide").show();
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

    $("#run").click(function() {
        $.post("/run", {});
    });

    $("#startOver").click(function() {
        $("#resumeOrStartSlide").hide();
        $("#retractBeltsSlide").show();
    });

    $("#resume").click(function() {
        $.post("/resume", {});
        $("#resumeOrStartSlide").hide();
        $("#penCalibrationSlide").show();
        $.post("/setServo", {angle: 90});
    });

    if (STATE.resumeDistance !== -1) {
        $(".resumeDistance").text(STATE.resumeDistance);
        $("#resumeOrStartSlide").show();
    } else {
        //$("#retractBeltsSlide").show();
    }
}