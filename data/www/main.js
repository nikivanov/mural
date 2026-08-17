import * as svgControl from './svgControl.js';
import * as client from './client.js';
import { showError } from './alerts.js';
import { crc32OfString } from './crc32.js';
import { estimatePenUsage, loadPenCapacities, resetPenCapacities, savePenCapacities } from './inkCapacity.js';

let currentState = null;

let currentWorker = null;

// Multi-color (docs/multi-color.md). Palette entries the user has
// named/mapped so far, index-aligned to the light-to-dark colorIndex order
// the render pipeline uses (see toCommands.ts's resolvePaletteNames) -
// palette[i] = {name, color}. Populated from the render result the first
// time a multi-color render comes back (auto names/detected colors), then
// edited locally (renaming patches the command file's `n<index>` header
// lines directly, without a full re-render - see patchLayerNameInCommands).
let currentLayers = null;
// layer index -> selected pen-type key into the ink capacity table (or
// undefined for "no estimate").
let layerPenTypeSelections = [];
let penCapacities = loadPenCapacities();
// Raster color-separation's detected/matched palette (light-to-dark,
// index-aligned to colorIndex), returned by the vectorize worker step and
// forwarded into the render request so resolvePaletteNames (toCommands.ts)
// names each layer by it. Reset to null for path-tracing mode and whenever
// a fresh vectorize starts.
let vectorizePalette = null;
// Hue-grouped shading (tsc/src/huePalette.ts): per-pen shade breakdown
// returned alongside vectorizePalette whenever hueGrouping is on, and the
// user's manual reassignments (detected color index -> shared bucket id,
// forwarded as VectorizeRequest.hueOverrides). Both reset in lockstep with
// vectorizePalette, since a fresh vectorize invalidates any previous
// detected-color indices they refer to.
let vectorizeHueGroups = null;
let hueOverrides = {};

window.onload = function () {
    init();
};

let uploadConvertedCommands = null;
// Tracks how uploadConvertedCommands was populated, so a failed upload can be
// retried/recovered into the right slide: either the normal render pipeline
// (drawingPreviewSlide) or a re-uploaded, previously saved command file
// (svgUploadSlide, no render state to go back to).
let uploadSource = 'render';

// Token guarding the RetractBelts status poll loop below: bumping it makes
// any in-flight loop (mid-await) exit on its next check instead of racing a
// freshly started one - simpler than a start/stop boolean once a loop can
// overlap its own restart.
let retractPollToken = 0;

function stopRetractPolling() {
    retractPollToken++;
}

function setRetractStatusUI(side, status) {
    const spinner = $(`#${side}RetractSpinner`);
    const label = $(`#${side}RetractLabel`);
    const name = side === 'left' ? 'Left belt' : 'Right belt';
    if (status === 'retracted') {
        spinner.css('visibility', 'hidden');
        label.text(`${name}: retracted ✓`);
    } else if (status === 'retracting') {
        spinner.css('visibility', 'visible');
        label.text(`${name}: retracting…`);
    } else {
        spinner.css('visibility', 'hidden');
        label.text(`${name}: idle`);
    }
}

// Polls /getState ~1s while the RetractBelts phase is showing, to move the
// per-motor status rows from idle -> retracting -> retracted live (both for
// the optional auto-retract and, more modestly, to keep the rows "alive"
// while a manual jog toggle is held). Stops itself once the phase moves on -
// which happens server-side, either because auto-retract finished both
// belts or because "Belts are retracted" was pressed.
async function pollRetractStatus() {
    const token = ++retractPollToken;
    while (retractPollToken === token) {
        try {
            const state = await $.get("/getState");
            if (retractPollToken !== token) {
                return;
            }
            if (state.phase !== 'RetractBelts') {
                adaptToState(state);
                return;
            }
            setRetractStatusUI('left', state.leftRetract || 'idle');
            setRetractStatusUI('right', state.rightRetract || 'idle');
        } catch (err) {
            // Transient failure - keep polling. The manual "Belts are
            // retracted" fallback button doesn't depend on this loop.
        }
        if (retractPollToken !== token) {
            return;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

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

    $("#autoRetractButton").click(async function() {
        $(this).prop("disabled", true);
        await client.autoRetractStart();
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
            $("#multiColorCheckbox").prop("checked", false).trigger('change');
            $("#colorOverprintCheckbox").prop("checked", false);
            $("#hueGroupingCheckbox").prop("checked", false);
            hueOverrides = {};
            vectorizeHueGroups = null;
            renderHueGroupingSummary(null);
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

    // Command files rendered by this UI carry an optional "t<pin distance
    // mm>" header, written right after the d/h headers (see toCommands.ts
    // and runner.cpp's initTaskProvider), recording the pin distance the
    // file's coordinates were laid out for. Older files (or ones downloaded
    // before this header existed) won't have it.
    function findFileTopDistance(text) {
        const headerLines = text.split('\n', 3);
        for (const line of headerLines) {
            const match = line.trim().match(/^t([\d.]+)$/);
            if (match) {
                return parseFloat(match[1]);
            }
        }
        return null;
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

        if (currentState) {
            const fileTopDistance = findFileTopDistance(text);
            if (fileTopDistance !== null && typeof currentState.topDistance === 'number') {
                if (Math.abs(fileTopDistance - currentState.topDistance) > 1) {
                    const proceed = window.confirm(
                        `This command file was generated for a pin distance of ${fileTopDistance}mm, but the ` +
                        `current setup is ${currentState.topDistance}mm. Coordinates may be shifted or fall ` +
                        `outside the drawable area. Continue anyway?`
                    );
                    if (!proceed) {
                        return;
                    }
                }
            } else if (currentState.safeWidth > 0) {
                // Fallback for files without a t-header: warn if the widest
                // recorded x-coordinate wouldn't fit the current setup.
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
        vectorizePalette = null;
        vectorizeHueGroups = null;

        const vectorizeRequest = {
            type: 'vectorize',
            raster,
            turdSize: getTurdSize(),
            grayscaleLevels: getGrayscaleLevels(),
            // Multi-color raster separation (docs/multi-color.md section 1):
            // colorCount>=2 triggers k-means clustering (no fixed palette -
            // the user maps names to detected clusters afterward, in the
            // post-render layer breakdown, rather than guessing colors
            // in advance).
            colorCount: getColorCount(),
            // Hue-grouped shading (tsc/src/huePalette.ts): collapses the
            // detected colors above into fewer pens by hue proximity, with
            // lighter shades of a hue drawn by the same (darkest) pen at a
            // sparser density instead of getting their own pen. Off by
            // default - see getHueGroupingEnabled().
            hueGrouping: getHueGroupingEnabled(),
            hueOverrides: getHueGroupingEnabled() ? hueOverrides : undefined,
            // Per-image physical controls for huePalette.ts's tone-derived
            // spacing model - see getNibWidthMm/getInkMultiplier. Ignored by
            // the worker unless hueGrouping is also set.
            nibWidthMm: getHueGroupingEnabled() ? getNibWidthMm() : undefined,
            inkMultiplier: getHueGroupingEnabled() ? getInkMultiplier() : undefined,
        };

        if (currentPreviewId == thisPreviewId) {
            currentWorker = new Worker(`./worker/worker.js?v=${Date.now()}`);

            currentWorker.onmessage = (e) => {
                if (e.data.type === 'status') {
                    $("#progressBar").text(e.data.payload);
                } else if (e.data.type === 'vectorizer') {
                    const vectorizedSvg = e.data.payload.svg;
                    // Multi-color: the vectorizer already assigned each mask a
                    // colorIndex via data-paper-data, and returns the
                    // detected/matched palette (light-to-dark, index-aligned
                    // to colorIndex) here - forward it as-is so
                    // resolvePaletteNames (toCommands.ts) can name each layer
                    // by it instead of falling back to "Color N".
                    vectorizePalette = e.data.payload.palette || null;
                    // Hue grouping's per-pen shade breakdown, when on - see
                    // renderHueGroupingSummary.
                    vectorizeHueGroups = e.data.payload.hueGroups || null;
                    renderHueGroupingSummary(vectorizeHueGroups);
                    const scale = svgControl.getRenderScale();
                    renderSvgInWorker(
                        currentWorker,
                        vectorizedSvg,
                        svgControl.getTargetWidth() * scale,
                        svgControl.getTargetHeight() * scale,
                        false,
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

            vectorizePalette = null;
            // Path-tracing has no vectorize step, so hue grouping (which
            // groups vectorizer-detected masks) never applies here.
            vectorizeHueGroups = null;
            hueOverrides = {};
            renderHueGroupingSummary(null);
            const renderSvg = svgControl.getRenderSvg();
            const renderSvgString = new XMLSerializer().serializeToString(renderSvg);
            // Path-tracing mode has no vectorize step to tag colors ahead of
            // time (docs/multi-color.md section 1) - `true` here tells
            // renderSvgInWorker to ask toCommands.ts to group by each path's
            // own literal fill/stroke color instead.
            renderSvgInWorker(currentWorker, renderSvgString, svgControl.getTargetWidth(), svgControl.getTargetHeight(), true);
        }
    }

    function renderSvgInWorker(worker, svg, svgWidth, svgHeight, groupByLiteralColor) {
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
            topDistance: currentState.topDistance,
            // Multi-color (docs/multi-color.md). Vector/path-tracing mode has
            // no vectorize step to tag colors ahead of time, so it needs
            // colorSeparation to opt in to literal-fill/stroke-color
            // grouping; raster mode's masks are already tagged via
            // data-paper-data regardless of this flag. Either way, an
            // unchecked "Multiple colors" box means colorCount() is 0 and
            // this stays false, keeping single-color output byte-identical.
            colorSeparation: !!groupByLiteralColor && getMultiColorEnabled(),
            palette: vectorizePalette || undefined,
            colorOverprint: getColorOverprint(),
            knockoutGapMm: getKnockoutGapMm(),
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

                renderLayerBreakdown(e.data.payload.layers || null);
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


    $("#infillDensity,#turdSize,#flattenPathsCheckbox,#grayscaleCheckbox,#grayscaleLevels,#multiColorCheckbox,#colorCount,#colorOverprintCheckbox,#knockoutGapMm,#hueGroupingCheckbox,#nibWidthMm,#inkMultiplier").on('input change', async function() {
        // Any change to the number/set of detected colors (colorCount) or
        // to whether/how hue grouping applies (multiColorCheckbox,
        // hueGroupingCheckbox) invalidates previously chosen manual
        // reassignments - they refer to detected-color indices from a
        // vectorize run that's about to be superseded.
        if (this.id === 'colorCount' || this.id === 'multiColorCheckbox' || this.id === 'hueGroupingCheckbox') {
            hueOverrides = {};
        }
        activateProgressBar();
        $("#acceptSvg").attr("disabled", "disabled");
        await rendererFn();
    });

    $("#multiColorCheckbox").on('change', function() {
        $("#multiColorOptions").toggle($(this).is(":checked"));
    });

    $("#hueGroupingCheckbox").on('change', function() {
        $("#hueGroupingOptions").toggle($(this).is(":checked"));
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
        renderLayerBreakdown(null);

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

    // Pen ink estimates (docs/multi-color.md section 5) - purely local/
    // cosmetic, persisted in localStorage.
    const inkModal = $("#inkModal")[0];
    inkModal.addEventListener('show.bs.modal', function (event) {
        renderInkCapacityTable();
    });

    $("#resetInkCapacityTable").click(function() {
        penCapacities = resetPenCapacities();
        renderInkCapacityTable();
        renderLayerBreakdown(currentLayers);
    });

    // Multi-color pen swap panel (docs/multi-color.md sections 2-4): reuses
    // the same +/- stepper pattern as the initial pen calibration slide, but
    // hits /setPenDistance directly (DrawingPhase overrides it to only
    // accept this while a swap is pending) instead of doneWithPhase-ing to a
    // new wizard phase - the server stays in Drawing for the whole job.
    $("#penSwapServoRange").on('input', $.throttle(250, function (e) {
        $.post("/setPenDistance", { angle: getPenSwapServoValueFromInputValue() });
    }));

    $("#penSwapMinus").click(function() {
        $("#penSwapServoRange")[0].stepDown(5);
        $("#penSwapServoRange").trigger('input');
    });

    $("#penSwapPlus").click(function() {
        $("#penSwapServoRange")[0].stepUp(5);
        $("#penSwapServoRange").trigger('input');
    });

    $("#confirmPenSwapBtn").click(function() {
        $(this).prop("disabled", true);
        $.post("/confirmPenSwap", {}).fail(function() {
            showError("Failed to confirm pen swap", null);
        }).always(function() {
            $("#confirmPenSwapBtn").prop("disabled", false);
        });
    });

    // Resume-after-power-loss pen recalibration (docs/multi-color.md follow-up):
    // the user may have re-inserted a different-length pen while it was
    // powered off, so let them touch it to the wall here, same slider pattern
    // and /setPenDistance path as pen calibration and the pen-swap panel.
    // ResumeDrawingPhase::setPenDistance() applies it immediately and
    // confirmResume() prefers this over the checkpointed angle once touched.
    $("#resumePenRange").on('input', $.throttle(250, function (e) {
        $.post("/setPenDistance", { angle: getResumePenServoValueFromInputValue() });
    }));

    $("#resumePenMinus").click(function() {
        $("#resumePenRange")[0].stepDown(5);
        $("#resumePenRange").trigger('input');
    });

    $("#resumePenPlus").click(function() {
        $("#resumePenRange")[0].stepUp(5);
        $("#resumePenRange").trigger('input');
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
    stopRetractPolling();
    $(".muralSlide").hide();
    currentState = state;
    switch(state.phase) {
        case "RetractBelts":
            $("#retractBeltsSlide").show();
            // autoRetract reflects the firmware build (MURAL_TMC_UART), not
            // just this phase - only offer the button (and its "manual is
            // the fallback" framing) when the firmware actually supports it.
            // The manual toggles + "Belts are retracted" button always work.
            $("#autoRetractButton").prop("disabled", false)
                .toggle(!!state.autoRetract);
            $("#manualRetractHint").toggle(!!state.autoRetract);
            setRetractStatusUI('left', state.leftRetract || 'idle');
            setRetractStatusUI('right', state.rightRetract || 'idle');
            pollRetractStatus();
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

            // Multi-color (docs/multi-color.md): resumeColorName is "" for a
            // single-color job/checkpoint (see Runner::writeCheckpoint()) -
            // omit the pen-check line and recalibration controls entirely in
            // that case, exactly as before this feature existed.
            if (state.resumeColorName) {
                const percentText = percent !== null ? `Resuming at ${percent}%` : 'Resuming';
                $("#resumeDrawingPenText").text(`${percentText} — pen ${state.resumeColorIndex} (${state.resumeColorName}) must be inserted`);
                $("#resumeDrawingPenLine").show();
                $("#resumeDrawingPenAdjust").show();
                if (state.storedPenAngle && state.storedPenAngle !== -1) {
                    $("#resumePenRange").val(90 - state.storedPenAngle);
                }
            } else {
                $("#resumeDrawingPenLine").hide();
                $("#resumeDrawingPenAdjust").hide();
            }
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
    $("#penSwapPanel").hide();
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
        penSwap: 'Waiting for pen swap',
        finished: 'Finished',
    };
    const stateLabel = stateLabels[data.state] || data.state;

    $("#liveStatsText").html(
        `${stateLabel} &middot; line ${data.executedLines}/${data.totalLines} &middot; ` +
        `(${Math.round(data.x)}, ${Math.round(data.y)})mm${etaText}`
    );

    // Multi-color pen swap (docs/multi-color.md sections 2-4): the swap
    // panel takes over from the ordinary pause/resume buttons while the
    // firmware is blocked on /confirmPenSwap (Runner::awaitingSwap, surfaced
    // here as state "penSwap").
    if (data.state === 'penSwap') {
        $("#pauseDrawingBtn").hide();
        $("#resumeDrawingBtn").hide();
        $("#penSwapPanel").show();
        const penLabel = data.penSwapName ? `${data.penSwapIndex} (${data.penSwapName})` : String(data.penSwapIndex);
        $("#penSwapTitle").text(`Insert pen ${penLabel}`);
    } else {
        $("#penSwapPanel").hide();
        if (data.state === 'paused' || data.state === 'stalled') {
            $("#pauseDrawingBtn").hide();
            $("#resumeDrawingBtn").show().prop('disabled', data.state === 'stalled');
        } else {
            $("#pauseDrawingBtn").show().prop('disabled', false);
            $("#resumeDrawingBtn").hide();
        }
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
    // 5-7 are the extended (denser) levels added for hue-grouped shading -
    // see tsc/src/infill.ts's infillDensityToSpacingMap.
    if ([0, 1, 2, 3, 4, 5, 6, 7].includes(density)) {
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

function getMultiColorEnabled() {
    return $("#multiColorCheckbox").is(":checked");
}

function getColorCount() {
    if (!getMultiColorEnabled()) {
        return 0;
    }
    const count = parseInt($("#colorCount").val());
    return [2, 3, 4, 5, 6].includes(count) ? count : 0;
}

function getColorOverprint() {
    return $("#colorOverprintCheckbox").is(":checked");
}

// Trapping gap (docs/multi-color.md section 5 addendum; RenderSVGRequest's
// knockoutGapMm, consumed by flattener.ts's flattenPathsAcrossLayers): how
// far (mm) a lighter layer's geometry retreats from every darker layer that
// knocks it out, so the two colors' pens can't touch along the knockout
// edge. Unlike getNibWidthMm/getInkMultiplier below, 0 is a valid,
// meaningful value here (restores plain touching knockout), so only
// non-finite/negative slider values fall back to undefined (letting the
// server apply its own nib-width-derived default).
function getKnockoutGapMm() {
    const value = parseFloat($("#knockoutGapMm").val());
    return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function getHueGroupingEnabled() {
    return getMultiColorEnabled() && $("#hueGroupingCheckbox").is(":checked");
}

// Per-image physical controls for the tone-derived spacing model
// (tsc/src/huePalette.ts): dominant nib-width term plus an ink-strength
// multiplier the user turns when a hue-grouped plot comes out too light or
// too heavy. Only meaningful (and only sent) when hue grouping is enabled.
function getNibWidthMm() {
    const value = parseFloat($("#nibWidthMm").val());
    return Number.isFinite(value) && value > 0 ? value : undefined;
}

function getInkMultiplier() {
    const value = parseFloat($("#inkMultiplier").val());
    return Number.isFinite(value) && value > 0 ? value : undefined;
}

// Multi-color per-layer breakdown/palette mapper (docs/multi-color.md
// section 6): shown after a multi-color render, listing each layer's
// (auto-detected or auto-named) color swatch, an editable name field
// (renaming just patches the command file's `n<index> <name>` header line
// locally - see patchLayerNameInCommands - no re-render needed), a pen-type
// picker for the ink estimate, and the layer's distance/ink usage.
function renderLayerBreakdown(layers) {
    currentLayers = (layers && layers.length > 1) ? layers : null;

    const container = $("#layerBreakdown");
    if (!currentLayers) {
        container.hide().empty();
        return;
    }

    layerPenTypeSelections = currentLayers.map((_l, i) => layerPenTypeSelections[i] || "");

    const penTypeOptions = ['<option value="">(no ink estimate)</option>']
        .concat(Object.keys(penCapacities).map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`))
        .join('');

    const rows = currentLayers.map((layer, i) => {
        const distanceM = layer.distance / 1000;
        const selectedType = layerPenTypeSelections[i];
        const usage = selectedType ? estimatePenUsage(distanceM, penCapacities[selectedType]) : null;
        const usageText = usage ? usage.text : `${distanceM.toFixed(1)} m`;
        const warningClass = usage && usage.fraction > 0.7 ? 'text-danger fw-bold' : '';

        return `
            <div class="d-flex align-items-center mb-1 layer-breakdown-row" data-layer-index="${i}">
                <span class="me-2" style="display:inline-block;width:1rem;height:1rem;border:1px solid #999;background:${escapeHtml(layer.color)};"></span>
                <input type="text" class="form-control form-control-sm me-2 layer-name-input" style="max-width:9rem;" value="${escapeHtml(layer.name)}">
                <select class="form-select form-select-sm me-2 layer-pen-type-select" style="max-width:11rem;">${penTypeOptions}</select>
                <small class="${warningClass} layer-usage-text">${usageText}</small>
            </div>
        `;
    }).join('');

    container.html(rows).show();

    container.find('.layer-pen-type-select').each(function(i) {
        $(this).val(layerPenTypeSelections[i] || "");
    });

    container.off('input change', '.layer-name-input').on('input change', '.layer-name-input', function() {
        const row = $(this).closest('.layer-breakdown-row');
        const index = parseInt(row.data('layer-index'));
        const newName = $(this).val().trim() || `Color ${index + 1}`;
        currentLayers[index].name = newName;
        patchLayerNameInCommands(index, newName);
    });

    container.off('change', '.layer-pen-type-select').on('change', '.layer-pen-type-select', function() {
        const row = $(this).closest('.layer-breakdown-row');
        const index = parseInt(row.data('layer-index'));
        layerPenTypeSelections[index] = $(this).val();
        renderLayerBreakdown(currentLayers);
    });
}

// Hue-grouped shading (tsc/src/huePalette.ts) breakdown: shown after a
// raster vectorize with "Group shades by hue" on. Leads with the payoff -
// the reduced pen/swap count vs. one pen per detected color - then lists
// each pen's shade ladder (darkest member first, its tone-derived spacing
// matching what the render actually hatches with), and lets the user
// override which pen a detected color belongs to when the automatic hue
// clustering guesses wrong (docs task: "automatic hue grouping will
// sometimes be wrong").
function renderHueGroupingSummary(groups) {
    const container = $("#hueGroupingSummary");
    if (!groups || groups.length === 0) {
        container.hide().empty();
        return;
    }

    const totalColors = groups.reduce((sum, g) => sum + g.members.length, 0);
    const penCount = groups.length;
    const swapCount = Math.max(0, penCount - 1);
    const originalSwapCount = Math.max(0, totalColors - 1);

    // Computed spacing range across every member that got a tone-derived
    // override (singletons stay undefined - see huePalette.ts's
    // assignToneSpacings), so the effect of the nib width/ink strength
    // sliders is visible before plotting rather than only discoverable on
    // the wall.
    const allSpacings = groups.flatMap(g => g.members.map(m => m.spacingMm)).filter(s => s !== undefined);
    const spacingRangeText = allSpacings.length > 0
        ? `spacing range: ${Math.min(...allSpacings).toFixed(1)}mm - ${Math.max(...allSpacings).toFixed(1)}mm`
        : null;

    const penOptions = groups.map((g) => {
        const anchor = g.members[0].originalIndex;
        return `<option value="${anchor}">${escapeHtml(g.pen.name)}</option>`;
    }).join('');

    const rows = groups.map((group) => {
        const memberRows = group.members.map((member) => {
            const densityText = member.spacingMm !== undefined
                ? `${member.spacingMm.toFixed(1)}mm spacing`
                : (member.originalIndex === group.members[0].originalIndex ? 'pen ink' : 'default density');
            const options = penOptions + `<option value="${member.originalIndex}">New pen (alone)</option>`;

            return `
                <div class="d-flex align-items-center mb-1 hue-member-row" data-original-index="${member.originalIndex}">
                    <span class="me-2" style="display:inline-block;width:0.8rem;height:0.8rem;border:1px solid #999;background:${escapeHtml(member.color)};"></span>
                    <small class="me-2" style="min-width:6rem;">${escapeHtml(member.name)}</small>
                    <small class="text-muted me-2" style="min-width:6rem;">${densityText}</small>
                    <select class="form-select form-select-sm hue-member-pen-select" style="max-width:10rem;"></select>
                </div>
            `;
        }).join('');

        return `
            <div class="mb-2 hue-group-block">
                <div class="d-flex align-items-center mb-1">
                    <span class="me-2" style="display:inline-block;width:1rem;height:1rem;border:2px solid #333;background:${escapeHtml(group.pen.color)};"></span>
                    <strong>${escapeHtml(group.pen.name)}</strong>
                </div>
                <div class="ms-3">${memberRows}</div>
            </div>
        `;
    }).join('');

    container.html(`
        <div class="mb-2">
            <strong>${penCount} pen${penCount === 1 ? '' : 's'}, ${swapCount} swap${swapCount === 1 ? '' : 's'}</strong>
            <small class="text-muted">(was ${totalColors} pen${totalColors === 1 ? '' : 's'}, ${originalSwapCount} swap${originalSwapCount === 1 ? '' : 's'})</small>
            ${spacingRangeText ? `<br><small class="text-muted">${escapeHtml(spacingRangeText)}</small>` : ''}
        </div>
        ${rows}
    `).show();

    // Options are rebuilt from `groups` each render, but selects are empty
    // <select> markup above (avoids escaping/interleaving option HTML
    // twice) - populate and select the current value per row here.
    container.find('.hue-member-row').each(function() {
        const originalIndex = parseInt($(this).data('original-index'));
        const select = $(this).find('.hue-member-pen-select');
        select.html(penOptions + `<option value="${originalIndex}">New pen (alone)</option>`);
        const owningGroup = groups.find(g => g.members.some(m => m.originalIndex === originalIndex));
        const currentAnchor = owningGroup.members[0].originalIndex;
        select.val(hueOverrides[originalIndex] !== undefined ? hueOverrides[originalIndex] : currentAnchor);
    });

    container.off('change', '.hue-member-pen-select').on('change', '.hue-member-pen-select', function() {
        const row = $(this).closest('.hue-member-row');
        const originalIndex = parseInt(row.data('original-index'));
        const target = parseInt($(this).val());

        // First manual reassignment: seed explicit overrides for every
        // currently detected color from the grouping in effect right now
        // (automatic, or a previous override), so changing just this one
        // row doesn't silently reset every other color back to automatic.
        if (Object.keys(hueOverrides).length === 0) {
            for (const group of groups) {
                const anchor = group.members[0].originalIndex;
                for (const member of group.members) {
                    hueOverrides[member.originalIndex] = anchor;
                }
            }
        }
        hueOverrides[originalIndex] = target;

        activateProgressBar();
        $("#acceptSvg").attr("disabled", "disabled");
        rendererFn();
    });
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Renaming a layer only changes display/OLED text, not geometry - so instead
// of a full pipeline re-render, patch the already-rendered command file's
// `n<index> <name>` header line in place (see docs/multi-color.md section 2
// for the header format).
function patchLayerNameInCommands(zeroBasedIndex, newName) {
    if (!uploadConvertedCommands) {
        return;
    }
    const oneBasedIndex = zeroBasedIndex + 1;
    const pattern = new RegExp(`^n${oneBasedIndex} .*$`, 'm');
    uploadConvertedCommands = uploadConvertedCommands.replace(pattern, `n${oneBasedIndex} ${newName}`);
}

function renderInkCapacityTable() {
    const body = $("#inkCapacityTableBody");
    const rows = Object.keys(penCapacities).map(name => `
        <tr>
            <td><input type="text" class="form-control form-control-sm ink-name-input" value="${escapeHtml(name)}"></td>
            <td><input type="number" min="1" class="form-control form-control-sm ink-capacity-input" value="${penCapacities[name]}"></td>
        </tr>
    `).join('');
    body.html(rows);

    body.off('change', 'input').on('change', 'input', function() {
        const updated = {};
        body.find('tr').each(function() {
            const name = $(this).find('.ink-name-input').val().trim();
            const capacity = parseFloat($(this).find('.ink-capacity-input').val());
            if (name && capacity > 0) {
                updated[name] = capacity;
            }
        });
        penCapacities = updated;
        savePenCapacities(penCapacities);
        renderLayerBreakdown(currentLayers);
    });
}

function getPenSwapServoValueFromInputValue() {
    const inputValue = parseInt($("#penSwapServoRange").val());
    const value = 90 - inputValue;
    if (value < 0) {
        return 0;
    } else if (value > 90) {
        return 90;
    }
    return value;
}

function getResumePenServoValueFromInputValue() {
    const inputValue = parseInt($("#resumePenRange").val());
    const value = 90 - inputValue;
    if (value < 0) {
        return 0;
    } else if (value > 90) {
        return 90;
    }
    return value;
}