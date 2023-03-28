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
            $.post("/setServo", {angle: 0});
        });
    });
    
    function getServoValueFromInputValue() {
        const inputValue = parseInt($("#servoRange").val());
        const value = 90 - 20 - inputValue;
        let normalizedValue;
        if (value < 20) {
            normalizedValue = 20;
        } else if (value > 70) {
            normalizedValue = 70;
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
        $("#runSlide").show();
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

    $("#retractBeltsSlide").show();
}