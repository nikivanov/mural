import * as svgControl from './svgControl.js';
import * as client from './client.js';
import { showError } from './alerts.js';
import { crc32OfString } from './crc32.js';

let currentState = null;

let currentWorker = null;

window.onload = function () {
    init();
};

let uploadConvertedCommands = null;
// Tracks how uploadConvertedCommands was populated, so a failed upload can be
// retried/recovered into the right slide: either the normal render pipeline
// (drawingPreviewSlide) or a re-uploaded, previously saved command file
// (svgUploadSlide, no render state to go back to).
let uploadSource = 'render';

async function checkIfExtendedToHome(extendToHomeTime) {
    await new Promise(r => setTimeout(r, (extendToHomeTime || 0) * 1000));

    const waitPeriod = 2000;
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
            showError("Failed to get current phase: " + err, () => checkIfExtendedToHome(0));
            done = true;
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
            // Restore whatever slide we were on before retrying, instead of
            // reloading the page and losing wizard state.
            if (currentState) {
                adaptToState(currentState);
            }
            showError(`${custom.commandName} command failed`, () => doneWithPhase(custom));
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
        .always(async function(res) {
            const extendToHomeTime = parseInt(res);
            await checkIfExtendedToHome(extendToHomeTime);
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
            $("#turdSize").val(2);
            $("#grayscaleCheckbox").prop("checked", false);
            $("#grayscaleLevels").val(3);
        }
    });

    // A previously downloaded command file (see #downloadCommands) starts
    // with a "d<total distance>" line.
    function isCommandFile(text) {
        const firstLine = (text.split('\n', 1)[0] || '').trim();
        return /^d[\d.]+$/.test(firstLine);
    }

    // Movement coordinate lines look like "x y" (see runner.cpp's
    // getNextTask, which parses everything that isn't a "p0"/"p1" pen
    // command this way). The firmware only bounds x against the drawable
    // width (movement.cpp beginLinearTravel: x < 0 || (x - 1) > width; y is
    // only checked to be >= 0), so that's the dimension worth warning about
    // when re-uploading a file that may have been generated for a different
    // pin distance.
    function findMaxCommandFileX(text) {
        let maxX = null;
        for (const line of text.split('\n')) {
            const match = line.match(/^([\d.]+) ([\d.]+)$/);
            if (match) {
                const x = parseFloat(match[1]);
                if (maxX === null || x > maxX) {
                    maxX = x;
                }
            }
        }
        return maxX;
    }

    $("#uploadCommandsFile").change(async function() {
        const [file] = $("#uploadCommandsFile")[0].files;
        if (!file) {
            return;
        }

        const text = await file.text();
        $("#uploadCommandsFile").val("");

        if (!isCommandFile(text)) {
            showError("Selected file doesn't look like a Mural command file", null);
            return;
        }

        if (currentState && currentState.safeWidth > 0) {
            const maxX = findMaxCommandFileX(text);
            if (maxX !== null && maxX > currentState.safeWidth) {
                const proceed = window.confirm(
                    `This command file was drawn up to ${maxX.toFixed(1)}mm wide, but the current setup only ` +
                    `allows ${currentState.safeWidth}mm. Coordinates outside the drawable area will be ` +
                    `rejected by Mural. Continue anyway?`
                );
                if (!proceed) {
                    return;
                }
            }
        }

        // Skip the render pipeline entirely and upload the saved file as-is,
        // following the same path as clicking Accept on a freshly rendered SVG.
        uploadConvertedCommands = text;
        uploadSource = 'commandFile';
        doUploadCommands();
    });


    let currentPreviewId = 0;
    let rendererFn = null;

    async function render_VectorRasterVector() {
        if (currentWorker) {
            console.log("Terminating previous worker");
            currentWorker.terminate();
        }
        currentPreviewId++;
        const thisPreviewId = currentPreviewId;

        const svgString = await getUploadedSvgString();
        if (!svgString) {
            throw new Error('No SVG string');
        }

        $("#progressBar").text("Rasterizing");
        const raster = await svgControl.getCurrentSvgImageData();

        const vectorizeRequest = {
            type: 'vectorize',
            raster,
            turdSize: getTurdSize(),
            grayscaleLevels: getGrayscaleLevels(),
        };

        if (currentPreviewId == thisPreviewId) {
            currentWorker = new Worker(`./worker/worker.js?v=${Date.now()}`);

            currentWorker.onmessage = (e) => {
                if (e.data.type === 'status') {
                    $("#progressBar").text(e.data.payload);
                } else if (e.data.type === 'vectorizer') {
                    const vectorizedSvg = e.data.payload.svg;
                    const scale = svgControl.getRenderScale();
                    renderSvgInWorker(
                        currentWorker,
                        vectorizedSvg,
                        svgControl.getTargetWidth() * scale,
                        svgControl.getTargetHeight() * scale,
                    );
                }
                else if (e.data.type === 'log') {
                    console.log(`Worker: ${e.data.payload}`);
                }
            }

            currentWorker.postMessage(vectorizeRequest);
        }
    }

    async function render_PathTracing() {
        if (currentWorker) {
            console.log("Terminating previous worker");
            currentWorker.terminate();
        }
        currentPreviewId++;
        const thisPreviewId = currentPreviewId;

        const svgString = await getUploadedSvgString();
        if (!svgString) {
            throw new Error('No SVG string');
        }

        if (currentPreviewId == thisPreviewId) {
            currentWorker = new Worker(`./worker/worker.js?v=${Date.now()}`);
            currentWorker.onmessage = (e) => {
                if (e.data.type === 'status') {
                    $("#progressBar").text(e.data.payload);
                }
                else if (e.data.type === 'log') {
                    console.log(`Worker: ${e.data.payload}`);
                }
            }

            const renderSvg = svgControl.getRenderSvg();
            const renderSvgString = new XMLSerializer().serializeToString(renderSvg);
            renderSvgInWorker(currentWorker, renderSvgString, svgControl.getTargetWidth(), svgControl.getTargetHeight());
        }
    }

    function renderSvgInWorker(worker, svg, svgWidth, svgHeight) {
        const svgJson = svgControl.getSvgJson(svg);
       
        const renderRequest = {
            type: "renderSvg",
            svgJson,
            width: svgControl.getTargetWidth(),
            height: svgControl.getTargetHeight(),
            svgWidth,
            svgHeight,
            homeX: currentState.homeX,
            homeY: currentState.homeY,
            infillDensity: getInfillDensity(),
            flattenPaths: getFlattenPaths(),
        }

        worker.onmessage = (e) => {
            if (e.data.type === 'status') {
                $("#progressBar").text(e.data.payload);
            } else if (e.data.type === 'renderer') {
                console.log("Worker finished!");

                uploadConvertedCommands = e.data.payload.commands.join('\n');
                const resultSvgJson = e.data.payload.svgJson;
                const resultDataUrl = svgControl.convertJsonToDataURL(resultSvgJson, svgControl.getTargetWidth(), svgControl.getTargetHeight());

                const totalDistanceM = +(e.data.payload.distance / 1000).toFixed(1);
                const drawDistanceM = +(e.data.payload.drawDistance / 1000).toFixed(1);
                
                deactivateProgressBar();
                $("#previewSvg").attr("src", resultDataUrl);
                $("#distances").text(`Total: ${totalDistanceM}m / Draw: ${drawDistanceM}m`);
                $(".svg-preview").show();
                $("#acceptSvg").removeAttr("disabled");
            }
        };

        worker.postMessage(renderRequest);
    }

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


    $("#infillDensity,#turdSize,#flattenPathsCheckbox,#grayscaleCheckbox,#grayscaleLevels").on('input change', async function() {
        activateProgressBar();
        $("#acceptSvg").attr("disabled", "disabled");
        await rendererFn();
    });

    $("#preview").click(async function() {
        $("#svgUploadSlide").hide();
        $("#chooseRendererSlide").show();
    });

    $("#pathTracing").click(async function() {
        $("label[for='turdSize'],#turdSize").hide();
        $("label[for='grayscaleCheckbox'],#grayscaleCheckbox").hide();
        $("label[for='grayscaleLevels'],#grayscaleLevels").hide();
        $("label[for='flattenPathsCheckbox'],#flattenPathsCheckbox").show();

        $("#chooseRendererSlide").hide();
        $("#drawingPreviewSlide").show();
        rendererFn = render_PathTracing;
        await rendererFn();
    });

    $("#vectorRasterVector").click(async function() {
        $("#flattenPathsCheckbox").prop("checked", false);
        $("#grayscaleCheckbox").prop("checked", false);
        $("#grayscaleLevels").val(3);
        $("label[for='turdSize'],#turdSize").show();
        $("label[for='grayscaleCheckbox'],#grayscaleCheckbox").show();
        $("label[for='grayscaleLevels'],#grayscaleLevels").show();
        $("label[for='flattenPathsCheckbox'],#flattenPathsCheckbox").hide();

        $("#chooseRendererSlide").hide();
        $("#drawingPreviewSlide").show();
        rendererFn = render_VectorRasterVector;
        await rendererFn();
    });

    $(".backToSvgSelect").click(function() {
        uploadConvertedCommands = null;

        $(".loading").show();
        activateProgressBar();
        $("#previewSvg").removeAttr("src");
        $(".svg-preview").hide();
        $("#acceptSvg").attr("disabled", "disabled");

        $("#svgUploadSlide").show();
        $("#drawingPreviewSlide").hide();
        $("#chooseRendererSlide").hide();
    });
    
    $("#acceptSvg").click(function() {
        if (!uploadConvertedCommands) {
            throw new Error('Commands are empty');
        }
        $("#acceptSvg").attr("disabled", "disabled");
        uploadSource = 'render';
        doUploadCommands();
    });

    $("#downloadCommands").click(async function() {
        try {
            const response = await fetch("/downloadCommands");
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const text = await response.text();
            const blob = new Blob([text], {type: "text/plain"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "mural-commands.txt";
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            showError("Failed to download commands: " + err, () => $("#downloadCommands").trigger('click'));
        }
    });



    $("#beginDrawing").click(function() {
        $(".muralSlide").hide();
        $("#loadingSlide").show();
        $.post("/run", {}, function(state) {
            adaptToState(state);
        }).fail(function() {
            showError("Failed to start drawing", () => $("#beginDrawing").trigger('click'));
            if (currentState) {
                adaptToState(currentState);
            }
        });
    });

    $("#pauseDrawingBtn").click(function() {
        $(this).prop("disabled", true);
        $.post("/pauseDrawing", {}).fail(function() {
            $("#pauseDrawingBtn").prop("disabled", false);
            showError("Failed to pause drawing", null);
        });
    });

    $("#resumeDrawingBtn").click(function() {
        $(this).prop("disabled", true);
        $.post("/resumeDrawing", {}).fail(function() {
            $("#resumeDrawingBtn").prop("disabled", false);
            showError("Failed to resume drawing", null);
        });
    });

    $("#resumeDrawingConfirmBtn").click(function() {
        $(".muralSlide").hide();
        $("#loadingSlide").show();
        $.post("/confirmResume", {}, function(state) {
            adaptToState(state);
        }).fail(function() {
            showError("Failed to resume drawing", () => $("#resumeDrawingConfirmBtn").trigger('click'));
            if (currentState) {
                adaptToState(currentState);
            }
        });
    });

    $("#discardResumeDrawingBtn").click(function() {
        doneWithPhase();
    });

    $("#reset").click(function() {
        doneWithPhase();
        location.reload();
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

    $("#estepsApplyTool").click(function() {
        const measuredDistanceMM = parseFloat($("#estepsMeasuredInput").val());
        if (isNaN(measuredDistanceMM)) {
            alert("Enter the measured travel distance in mm first");
            return;
        }
        $.post("/estepsCalibrationApply", {measuredDistanceMM}, function(data) {
            populatePhysicsConstants(data);
        }).fail(function() {
            alert("E-steps calibration failed. Did you extend 1000mm first?");
        });
    });

    function populatePhysicsConstants(data) {
        $("#massBotInput").val(data.massBot);
        $("#beltElongationInput").val(data.beltElongationCoefficient);
        $("#diameterInput").val(data.effectiveDiameter);
        $("#homedStepOffsetInput").val(data.homedStepOffsetMM);
    }

    $("#savePhysicsConstantsTool").click(function() {
        $.post("/setPhysicsConstants", {
            massBot: $("#massBotInput").val(),
            beltElongationCoefficient: $("#beltElongationInput").val(),
            effectiveDiameter: $("#diameterInput").val(),
            homedStepOffsetMM: $("#homedStepOffsetInput").val(),
        }, function(data) {
            populatePhysicsConstants(data);
        }).fail(function() {
            alert("Failed to save physics constants");
        });
    });

    $("#installTestPatternButton").click(function() {
        $(".muralSlide").hide();
        $("#loadingSlide").show();
        $.post("/installTestPattern", {}, function(state) {
            adaptToState(state);
        }).fail(function() {
            alert("Failed to install calibration test pattern");
            location.reload();
        });
    });

    const toolsModal = $("#toolsModal")[0];

    toolsModal.addEventListener('show.bs.modal', function (event) {
        $.get("/getPhysicsConstants", function(data) {
            populatePhysicsConstants(data);
        });
    });

    toolsModal.addEventListener('hidden.bs.modal', function (event) {
        client.rightRetractUp();
        client.leftRetractUp();
    });

    svgControl.initSvgControl();

    $("#loadingSlide").show();

    // adaptToState({
    //     phase: "BeginDrawing",
    //     topDistance: 1727,
    //     safeWidth: 1000,
    //     homeX: 0,
    //     homeY: 0,
    // });

    loadInitialState();
}

function loadInitialState() {
    $.get("/getState", function(data) {
        adaptToState(data);
    }).fail(function() {
        showError("Failed to retrieve state", loadInitialState);
    });
}

// Restores the UI to a retryable state after a failed upload, without
// discarding uploadConvertedCommands (so Retry can resubmit it as-is).
function restoreAfterUploadFailure() {
    $(".muralSlide").hide();
    if (uploadSource === 'commandFile') {
        $("#svgUploadSlide").show();
    } else {
        $("#drawingPreviewSlide").show();
        $("#acceptSvg").removeAttr("disabled");
    }
}

function doUploadCommands() {
    if (!uploadConvertedCommands) {
        throw new Error('Commands are empty');
    }

    const commandsBlob = new Blob([uploadConvertedCommands], {
        type: "text/plain"
    });

    $(".muralSlide").hide();
    $("#uploadProgress").show();
    $("#uploadProgress > .progress-bar").attr("style", "width: 0%");
    $("#verificationProgress > .progress-bar").attr("style", "width: 0%");

    const formData = new FormData();
    formData.append("commands", commandsBlob);

    $.ajax({
        url: "/uploadCommands",
        data: formData,
        processData: false,
        contentType: false,
        type: 'POST',
        success: function(data) {
            verifyUpload(data);
        },
        error: function(err) {
            restoreAfterUploadFailure();
            showError('Upload to Mural failed: ' + (err.statusText || err), doUploadCommands);
        },
        xhr: function () {
            var xhr = new window.XMLHttpRequest();

            xhr.upload.addEventListener("progress", function (evt) {
                if (evt.lengthComputable) {
                    var percentComplete = evt.loaded / evt.total;
                    percentComplete = parseInt(percentComplete * 100);
                    $("#uploadProgress").attr("aria-valuemax", evt.total.toString());
                    $("#uploadProgress").attr("aria-valuenow", evt.loaded.toString());
                    $("#uploadProgress > .progress-bar").attr("style", `width: ${percentComplete}%`);
                }
            }, false);

            return xhr;
        },
    });
}

// Verifies the upload by comparing a locally computed CRC32 of the uploaded
// blob against the CRC32 the firmware computed while streaming it to
// LittleFS, instead of re-downloading and diffing the whole file.
function verifyUpload(state) {
    const localCrc32 = crc32OfString(uploadConvertedCommands);
    $("#verificationProgress > .progress-bar").attr("style", "width: 100%");

    if (state.uploadCrc32 === localCrc32) {
        setTimeout(function() {
            adaptToState(state);
        }, 500);
    } else {
        restoreAfterUploadFailure();
        showError("Upload verification failed (checksum mismatch)", doUploadCommands);
    }
}

function adaptToState(state) {
    $(".muralSlide").hide();
    currentState = state;
    switch(state.phase) {
        case "RetractBelts":
            $("#retractBeltsSlide").show();
            break;
        case "SetTopDistance":
            $("#distanceBetweenAnchorsSlide").show();
            // Prefill with the last calibrated distance, persisted in NVS, so a
            // firmware restart doesn't force re-measuring from scratch.
            if (state.storedTopDistance && state.storedTopDistance !== -1) {
                $("#distanceInput").val(state.storedTopDistance);
            }
            break;
        case "ExtendToHome":
            $("#extendToHomeSlide").show();
            if (state.resuming) {
                $("#extendToHomeTitle").text("Extend to resume position");
                $("#extendToHomeText").text(
                    "The belts will extend back to where the interrupted drawing left off. Make sure the " +
                    "belts are unobstructed and the motors do not skip, or the drawing accuracy may be affected"
                );
            } else {
                $("#extendToHomeTitle").text("Extend belts");
                $("#extendToHomeText").text(
                    "The belts will extend to their home position. Make sure the belts are unobstructed and " +
                    "the motors do not skip, or the drawing accuracy may be affected"
                );
            }
            if (state.moving || state.startedHoming) {
                $("#extendToHome").prop( "disabled", true);
                $("#extendingSpinner").css('visibility', 'visible');
                checkIfExtendedToHome();
            }
            break;
        case "PenCalibration":
            $.post("/setServo", {angle: 90});
            $("#penCalibrationSlide").show();
            // Prefill with the last calibrated pen angle, persisted in NVS.
            if (state.storedPenAngle && state.storedPenAngle !== -1) {
                $("#servoRange").val(90 - state.storedPenAngle).trigger('input');
            }
            break;
        case "SvgSelect":
            $("#svgUploadSlide").show();
            break;
        case "BeginDrawing":
            $("#beginDrawingSlide").show();
            break;
        case "Drawing":
            $("#drawingLiveSlide").show();
            startLiveDrawingView();
            break;
        case "ResumeDrawing":
            $("#resumeDrawingSlide").show();
            const percent = (typeof state.resumePercent === 'number' && state.resumePercent >= 0) ? state.resumePercent : null;
            $("#resumeDrawingText").text(
                percent !== null
                    ? `A previous drawing was interrupted (likely by a power loss) at ${percent}% complete. ` +
                      `The belts may have moved since then, so you'll need to re-retract them before resuming.`
                    : "A previous drawing was interrupted, likely by a power loss. The belts may have moved " +
                      "since then, so you'll need to re-retract them before resuming."
            );
            break;
        default:
            showError("Unrecognized phase: " + state.phase, null);
    }
}

// Live drawing view (see DrawingPhase / Runner's /events SSE stream).
let liveEventSource = null;
let liveProgressHistory = [];

function closeLiveEventSource() {
    if (liveEventSource) {
        liveEventSource.close();
        liveEventSource = null;
    }
}

function startLiveDrawingView() {
    closeLiveEventSource();
    liveProgressHistory = [];
    $("#pauseDrawingBtn").show().prop('disabled', false).text('Pause');
    $("#resumeDrawingBtn").hide().prop('disabled', false);
    $("#liveConnectionNotice").hide();
    $("#liveProgressBar").css('width', '0%').text('0%');
    $("#liveStatsText").text('');

    liveEventSource = new EventSource('/events');

    liveEventSource.addEventListener('progress', function(e) {
        $("#liveConnectionNotice").hide();
        let data;
        try {
            data = JSON.parse(e.data);
        } catch (err) {
            return;
        }
        updateLiveProgress(data);
    });

    // EventSource retries automatically on its own (native reconnect) - we just
    // surface an inline notice while it's down, per docs/multi-color.md's plan,
    // reusing alerts.js's visual style rather than its dismissible/retry mechanics
    // (which are built for one-off request failures, not a connection that's
    // expected to come back on its own).
    liveEventSource.onerror = function() {
        $("#liveConnectionNotice").show();
    };
    liveEventSource.onopen = function() {
        $("#liveConnectionNotice").hide();
    };
}

function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.round(totalSeconds));
    if (seconds < 60) {
        return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
        return `${minutes}m ${remainingSeconds}s`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
}

function updateLiveProgress(data) {
    const percent = Math.max(0, Math.min(100, data.percent || 0));
    $("#liveProgressBar").css('width', percent + '%').text(percent + '%');

    const now = Date.now();
    liveProgressHistory.push({t: now, lines: data.executedLines});
    while (liveProgressHistory.length > 20) {
        liveProgressHistory.shift();
    }

    let etaText = '';
    if (data.state === 'running' && liveProgressHistory.length >= 2 && data.totalLines > data.executedLines) {
        const first = liveProgressHistory[0];
        const deltaLines = data.executedLines - first.lines;
        const deltaSeconds = (now - first.t) / 1000;
        if (deltaLines > 0 && deltaSeconds > 0) {
            const linesPerSecond = deltaLines / deltaSeconds;
            const remainingLines = data.totalLines - data.executedLines;
            etaText = ` &mdash; ETA ~${formatDuration(remainingLines / linesPerSecond)}`;
        }
    }

    const stateLabels = {
        started: 'Starting',
        running: 'Drawing',
        paused: 'Paused',
        stalled: 'Stalled (motor stall detected)',
        finished: 'Finished',
    };
    const stateLabel = stateLabels[data.state] || data.state;

    $("#liveStatsText").html(
        `${stateLabel} &middot; line ${data.executedLines}/${data.totalLines} &middot; ` +
        `(${Math.round(data.x)}, ${Math.round(data.y)})mm${etaText}`
    );

    if (data.state === 'paused' || data.state === 'stalled') {
        $("#pauseDrawingBtn").hide();
        $("#resumeDrawingBtn").show().prop('disabled', data.state === 'stalled');
    } else {
        $("#pauseDrawingBtn").show().prop('disabled', false);
        $("#resumeDrawingBtn").hide();
    }

    if (data.state === 'finished') {
        // The firmware restarts shortly after sending this event (see
        // Runner::getNextTask()) - a full reload naturally picks the app back up
        // once it's back on the network instead of leaving stale wizard state.
        closeLiveEventSource();
        setTimeout(() => location.reload(), 2000);
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

function getTurdSize() {
    return parseInt($("#turdSize").val());
}

function getGrayscaleLevels() {
    if (!$("#grayscaleCheckbox").is(":checked")) {
        return 0;
    }

    const levels = parseInt($("#grayscaleLevels").val());
    if (![3, 4].includes(levels)) {
        throw new Error('Invalid grayscale levels');
    }

    return levels;
}

function getFlattenPaths() {
    return $("#flattenPathsCheckbox").is(":checked");
}