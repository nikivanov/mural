let throttlePause;
 
const throttle = (callback, time) => {
  //don't run the function if throttlePause is true
  if (throttlePause) return;
 
  //set throttlePause to true after the if condition. This allows the function to be run once
  throttlePause = true;
   
  //setTimeout runs the callback within the specified time
  setTimeout(() => {
    callback();
     
    //throttlePause is set to false once the function has been called, allowing the throttle function to loop
    throttlePause = false;
  }, time);
};

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
            $.post("/setServo", {angle: 30});
        });
    });

    function normalizeServoValue(value) {
        let normalizedValue;
        if (value < 30) {
            normalizedValue = 30;
        } else if (value > 160) {
            normalizedValue = 160;
        } else {
            normalizedValue = value;
        }
        return normalizedValue;
    }

    $("#servoRange").on('input', $.throttle(250, function (e) {
        const inputValue = normalizeServoValue(parseInt($("#servoRange").val()));
        $.post("/setServo", {angle: inputValue});
    }));

    $("#penMinus").click(function() {
        const newValue = normalizeServoValue(parseInt($("#servoRange").val()) - 10);
        $("#servoRange").val(newValue);
        $("#servoRange").trigger('input');
    });

    $("#penPlus").click(function() {
        const newValue = normalizeServoValue(parseInt($("#servoRange").val()) + 10);
        $("#servoRange").val(newValue);
        $("#servoRange").trigger('input');
    });

    $("#setPenDistance").click(function () {
        const inputValue = normalizeServoValue(parseInt($("#servoRange").val()));
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
        $.post("/setServo", {angle: 170});
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