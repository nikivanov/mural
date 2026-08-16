#include "runner.h"
#include <stdexcept>
#include <cstring>
#include "tasks/interpolatingmovementtask.h"
#include "tasks/pentask.h"
#include "tasks/penswaptask.h"
#include "pen.h"
#include "display.h"
#include "LittleFS.h"
#include "prefskeys.h"
#include <Preferences.h>
#include "ArduinoJson.h"
using namespace std;

#ifdef MURAL_SMOOTH_MOTION
// UNTESTED ON HARDWARE: motion smoothing. Angle threshold below which two
// consecutive drawing segments are treated as collinear enough to fold into
// a single InterpolatingMovementTask, so the belts keep moving through the
// join instead of the Runner stopping and starting a fresh task at every
// waypoint from the input file. Re-tune once this has been validated on
// real hardware.
constexpr double smoothAngleThresholdRad = 3.0 * PI / 180.0;

// Angle in radians between segment (a->b) and segment (b->c). A
// zero-length segment is treated as a hard corner (never smoothed).
double angleBetweenSegments(Movement::Point a, Movement::Point b, Movement::Point c) {
    double v1x = b.x - a.x, v1y = b.y - a.y;
    double v2x = c.x - b.x, v2y = c.y - b.y;
    double len1 = sqrt(v1x * v1x + v1y * v1y);
    double len2 = sqrt(v2x * v2x + v2y * v2y);
    if (len1 < 1e-6 || len2 < 1e-6) {
        return PI;
    }
    double dot = (v1x * v2x + v1y * v2y) / (len1 * len2);
    if (dot > 1.0) dot = 1.0;
    if (dot < -1.0) dot = -1.0;
    return acos(dot);
}
#endif

Runner::Runner(Movement *movement, Pen *pen, Display *display) {
    stopped = true;
    this->movement = movement;
    this->pen = pen;
    this->display = display;
    lastError = "";
}

String Runner::getLastError() {
    return lastError;
}

// Reads the mandatory d/h header, the optional t<mm> pin-distance header, and the
// optional multi-color `n<index> <name>` palette headers from an open command file,
// leaving the file positioned at the first command line. Shared by initTaskProvider()
// and beginResume() so the two don't duplicate header parsing (and so a fix like the
// t-header support here automatically benefits both, rather than needing to be
// re-applied to whichever one gets updated). Static/pen-and-movement-independent so
// countTotalCommandLines() can use it too, from a File it opened itself, without
// needing a Runner instance.
bool Runner::parseCommandFileHeader(File& file, double& totalDistanceOut, bool& hasTopDistanceOut, double& topDistanceOut, String* paletteNamesOut, int& paletteCountOut) {
    paletteCountOut = 0;

    auto line = file.readStringUntil('\n');
    if (line.charAt(0) != 'd') {
        Serial.println("Bad file - no distance");
        return false;
    }
    totalDistanceOut = line.substring(1, line.length() - 1).toDouble();

    auto heightLine = file.readStringUntil('\n');
    if (heightLine.charAt(0) != 'h') {
        Serial.println("Bad file - no height");
        return false;
    }

    // Optional `t<mm>` pin-distance header (added after the d/h headers by
    // toCommands.ts). Older command files won't have it, so peek at the next
    // line and seek back if it's not there instead of consuming it.
    hasTopDistanceOut = false;
    auto beforeTopDistanceLine = file.position();
    auto topDistanceLine = file.readStringUntil('\n');
    if (topDistanceLine.charAt(0) == 't') {
        String topDistanceValue = topDistanceLine.substring(1);
        topDistanceValue.trim();
        topDistanceOut = topDistanceValue.toDouble();
        hasTopDistanceOut = true;
    } else {
        file.seek(beforeTopDistanceLine);
    }

    // Optional multi-color palette headers, `n<index> <name>` (see
    // docs/multi-color.md section 2), one per palette color, immediately
    // after d/h/t and before the first command line. Consumed in a loop
    // since there can be more than one; stops (seeking back) as soon as a
    // line doesn't start with 'n'.
    while (true) {
        auto beforePaletteLine = file.position();
        auto paletteLine = file.readStringUntil('\n');
        if (paletteLine.charAt(0) != 'n') {
            file.seek(beforePaletteLine);
            break;
        }

        auto spaceIx = paletteLine.indexOf(' ');
        if (spaceIx < 0) {
            file.seek(beforePaletteLine);
            break;
        }

        int index = paletteLine.substring(1, spaceIx).toInt();
        String name = paletteLine.substring(spaceIx + 1);
        name.trim();

        if (paletteNamesOut != nullptr && index >= 1 && index <= Runner::maxPaletteColors) {
            paletteNamesOut[index - 1] = name;
        }
        paletteCountOut++;
    }

    return true;
}

bool Runner::initTaskProvider() {
    lastError = "";

    openedFile = LittleFS.open("/commands");
    if (!openedFile || !openedFile.available()) {
        Serial.println("Failed to open file");
        return false;
    }

    bool hasTopDistance;
    double fileTopDistance;
    paletteCount = 0;
    currentColorIndex = 1;
    if (!parseCommandFileHeader(openedFile, totalDistance, hasTopDistance, fileTopDistance, palette, paletteCount)) {
        return false;
    }

    if (hasTopDistance) {
        auto currentTopDistance = (double)movement->getTopDistance();
        if (abs(fileTopDistance - currentTopDistance) > 1.0) {
            Serial.println("Command file pin distance mismatch: file=" + String(fileTopDistance) + " current=" + String(currentTopDistance));
            lastError = "Command file was generated for pin distance " + String((int)fileTopDistance) + " mm, current setup is " + String((int)currentTopDistance) + " mm";
            return false;
        }
    }

    Serial.println("Total distance to travel: " + String(totalDistance));

    // Pre-scan the command lines once so progress can be reported as
    // executedLines/totalLines instead of tracking distance travelled.
    auto commandsStart = openedFile.position();
    totalLines = 0;
    while (openedFile.available()) {
        openedFile.readStringUntil('\n');
        totalLines++;
    }
    openedFile.seek(commandsStart);

    executedLines = 0;
    progress = -1; // so 0% appears right away

    Movement::Point startPosition;
    if (!movement->getCoordinates(startPosition)) {
        Serial.println("Not ready to get coordinates");
        return false;
    }

    auto homeCoordinates = movement->getHomeCoordinates();
    finishingSequence[0] = new InterpolatingMovementTask(movement, homeCoordinates);
    return true;
}

bool Runner::start() {
    if (!initTaskProvider()) {
        return false;
    }
    currentTask = getNextTask();
    currentTask->startRunning();
    stopped = false;
    return true;
}

Task *Runner::getNextTask()
{
    if (openedFile.available())
    {
        // Bookmark the start of this line, before consuming it, so a checkpoint
        // written below points at a line that hasn't executed yet - at-least-once
        // semantics on resume (see Checkpoint's doc comment in runner.h).
        auto bookmark = openedFile.position();
        auto line = openedFile.readStringUntil('\n');
        executedLines++;
        bool isPenLine = line.charAt(0) == 'p';
        bool isColorLine = line.charAt(0) == 'c';

        // Checkpoint every N lines (to limit NVS wear) and additionally on every
        // pen up/down or color swap, since those are the moments a redraw would be
        // most visible.
        if (isPenLine || isColorLine || (executedLines % checkpointIntervalLines == 0)) {
            writeCheckpoint(bookmark);
        }

        if (isPenLine)
        {
            if (line.charAt(1) == '1')
            {
                //Serial.println("Pen down");
                return new PenTask(false, pen);
            }
            else
            {
                //Serial.println("Pen up");
                return new PenTask(true, pen);
            }
        }
        else if (isColorLine)
        {
            // Multi-color pen swap (docs/multi-color.md sections 2-3):
            // `c<index>` (1-based, matching the `n<index> <name>` palette
            // headers parsed into `palette` above).
            int colorIndex = line.substring(1).toInt();
            String name = (colorIndex >= 1 && colorIndex <= paletteCount && colorIndex <= maxPaletteColors)
                ? palette[colorIndex - 1]
                : ("pen " + String(colorIndex));
            Serial.println("Pen swap requested: color " + String(colorIndex) + " (" + name + ")");
            return new PenSwapTask(pen, movement, this, colorIndex, name);
        }
        else
        {
            auto x = line.substring(0, line.indexOf(" ")).toDouble();
            auto y = line.substring(line.indexOf(" ") + 1).toDouble();
            targetPosition = Movement::Point(x, y);

#ifdef MURAL_SMOOTH_MOTION
            // UNTESTED ON HARDWARE: fold in as many further consecutive
            // waypoints as stay nearly collinear with the path so far, so
            // InterpolatingMovementTask's existing 1mm interpolation drives
            // straight through to the merged target without the Runner
            // stopping to switch tasks at every one of them. Any waypoint
            // read here but not merged is put back so it's read again
            // normally on a later call.
            Movement::Point previousPoint;
            bool haveCoordinates = movement->getCoordinates(previousPoint);
            auto mergedTarget = targetPosition;
            while (haveCoordinates && openedFile.available()) {
                auto bookmark = openedFile.position();
                auto peekLine = openedFile.readStringUntil('\n');
                if (peekLine.length() == 0 || peekLine.charAt(0) == 'p' || peekLine.charAt(0) == 'c') {
                    openedFile.seek(bookmark);
                    break;
                }
                auto px = peekLine.substring(0, peekLine.indexOf(" ")).toDouble();
                auto py = peekLine.substring(peekLine.indexOf(" ") + 1).toDouble();
                Movement::Point peekedTarget(px, py);
                if (angleBetweenSegments(previousPoint, mergedTarget, peekedTarget) > smoothAngleThresholdRad) {
                    openedFile.seek(bookmark);
                    break;
                }
                previousPoint = mergedTarget;
                mergedTarget = peekedTarget;
            }
            targetPosition = mergedTarget;
#endif

            return new InterpolatingMovementTask(movement, targetPosition);
        }
    }
    else
    {
        if (sequenceIx < (end(finishingSequence) - begin(finishingSequence))) {
            auto currentIx = sequenceIx;
            sequenceIx = sequenceIx + 1;
            return finishingSequence[currentIx];
        } else {
            // Drawing completed successfully - clear the checkpoint and tell any
            // live SSE clients before the restart drops their connection.
            clearCheckpoint();
            pushProgressEvent(true, "finished");
            delay(200);
            ESP.restart();
            // unreachable
            return NULL;
        }
    }
}

void Runner::run()
{
    if (stopped)
    {
        return;
    }

#ifdef MURAL_TMC_UART
    // UNTESTED ON HARDWARE: stall monitoring during drawing. If either driver
    // reported a stall, Movement::runSteppers() already halted both motors. This
    // routes through the same pause primitive as a manual /pauseDrawing: stop
    // feeding tasks, lift the pen, show a message on the OLED. Unlike a manual
    // pause (which waits for the in-flight task to finish), a stall pauses
    // immediately since the in-flight movement task is stuck and will never
    // report isDone() on its own. See docs/tmc-uart.md for how to recover.
    if (movement->isStalled() && !paused) {
        Serial.println("Stall detected while drawing - pausing.");
        pausedDueToStall = true;
        penWasDownAtPause = pen->isDown();
        pen->slowUp();
        display->displayText("STALL - paused");
        paused = true;
        pushProgressEvent(true);
        return;
    }
#endif

    if (paused)
    {
        return;
    }

    if (currentTask->isDone())
    {
        if (pauseRequested) {
            // The in-flight task just finished - safe to pause here without cutting
            // a movement short. Lift the pen and stop feeding new tasks from the
            // file; resumeRun() picks up from here.
            penWasDownAtPause = pen->isDown();
            pen->slowUp();
            display->displayText("Paused");
            paused = true;
            pauseRequested = false;
            pushProgressEvent(true);
            return;
        }

        delete currentTask;
        currentTask = getNextTask();
        if (currentTask != NULL)
        {
            currentTask->startRunning();

            auto newProgress = totalLines > 0 ? int(executedLines * 100 / totalLines) : 100;
            if (newProgress > 100) {
                newProgress = 100;
            }
            if (progress != newProgress) {
                Serial.println("Progress: " + String(newProgress));
                progress = newProgress;
                display->displayText(String(progress) + "%");
            }
            pushProgressEvent(false);
        }
        else
        {
            stopped = true;
        }
    }
}

void Runner::pause() {
    if (stopped || paused) {
        return;
    }
    pauseRequested = true;
}

bool Runner::isPaused() {
    return paused;
}

void Runner::resumeRun() {
    if (!paused) {
        return;
    }

    bool wasStall = false;
#ifdef MURAL_TMC_UART
    wasStall = pausedDueToStall;
    pausedDueToStall = false;
    movement->clearStall();
#endif

    paused = false;

    if (penWasDownAtPause) {
        pen->slowDown();
    }

    if (wasStall) {
        // The in-flight task never finished (the stall cut it short) - retry it
        // rather than skipping ahead to the next command file line.
        currentTask->startRunning();
    } else {
        // The in-flight task had already finished before we paused - move on to
        // whatever's next, exactly as run() would have.
        delete currentTask;
        currentTask = getNextTask();
        currentTask->startRunning();
    }

    display->displayText(String(progress) + "%");
    pushProgressEvent(true);
}

// Multi-color pen swap (docs/multi-color.md sections 2-3). Called by
// PenSwapTask once it's lifted the pen and arrived at the swap station.
void Runner::notifyPenSwapWaiting(int colorIndex, String name) {
    awaitingSwap = true;
    awaitingSwapColorIndex = colorIndex;
    awaitingSwapName = name;
    display->displayText("Insert pen " + String(colorIndex) + " (" + name + ")");
    pushProgressEvent(true);
}

bool Runner::isAwaitingPenSwap() {
    return awaitingSwap;
}

bool Runner::applyPenDistanceDuringSwap(int angle) {
    if (!awaitingSwap) {
        return false;
    }

    pen->setPenDistance(angle);
    if (!pen->slowUp()) {
        return false;
    }

    // Persist so the value survives a firmware restart, same as
    // PenCalibrationPhase::setPenDistance().
    Preferences prefs;
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putInt(PREFS_PEN_ANGLE_KEY, angle);
    prefs.end();

    return true;
}

bool Runner::confirmPenSwap() {
    if (!awaitingSwap || currentTask == NULL || strcmp(currentTask->name(), "PenSwapTask") != 0) {
        return false;
    }

    static_cast<PenSwapTask*>(currentTask)->confirm();
    // The new pen is only physically mounted from this confirmation onward -
    // see currentColorIndex's doc comment in runner.h.
    currentColorIndex = awaitingSwapColorIndex;
    awaitingSwap = false;
    display->displayText(String(progress) + "%");
    pushProgressEvent(true);
    return true;
}

void Runner::dryRun() {
    if (!initTaskProvider()) {
        Serial.println("Failed to initialize task provider");
        return;
    }
    auto task = getNextTask();
    auto index = 1;
    while (task != NULL) {
        //Serial.println(String(index));
        index = index + 1;
        delete task;
        task = getNextTask();
    }
    Serial.println("All done");
}

void Runner::setEventSource(AsyncEventSource *events) {
    this->events = events;
}

const char* Runner::getStateName() {
    if (stopped) {
        return "finished";
    }
#ifdef MURAL_TMC_UART
    if (pausedDueToStall) {
        return "stalled";
    }
#endif
    if (paused) {
        return "paused";
    }
    if (awaitingSwap) {
        return "penSwap";
    }
    if (executedLines == 0) {
        return "started";
    }
    return "running";
}

void Runner::buildProgressJson(char* buffer, size_t bufferSize, const char* stateOverride) {
    int percent = totalLines > 0 ? int(executedLines * 100 / totalLines) : 100;
    if (percent > 100) {
        percent = 100;
    }
    if (percent < 0) {
        percent = 0;
    }

    DynamicJsonBuffer jsonBuffer;
    JsonObject &root = jsonBuffer.createObject();
    root["state"] = stateOverride ? stateOverride : getStateName();
    root["percent"] = percent;
    root["executedLines"] = executedLines;
    root["totalLines"] = totalLines;
    root["x"] = targetPosition.x;
    root["y"] = targetPosition.y;
    // Multi-color pen swap (docs/multi-color.md sections 2-3): while
    // awaitingSwap is true, tell the UI which pen to prompt for so it can
    // show "Insert pen <penSwapIndex> (<penSwapName>)" alongside the
    // recalibration controls.
    if (awaitingSwap) {
        root["penSwapIndex"] = awaitingSwapColorIndex;
        root["penSwapName"] = awaitingSwapName;
    }
    root.printTo(buffer, bufferSize);
}

// Pushes at most ~1/sec (force bypasses the throttle for state-change events, per
// docs/multi-color.md's "at most ~1/sec and on state changes").
void Runner::pushProgressEvent(bool force, const char* stateOverride) {
    if (events == nullptr) {
        return;
    }

    unsigned long now = millis();
    if (!force && (now - lastEventMillis) < 1000) {
        return;
    }
    lastEventMillis = now;

    char buffer[192];
    buildProgressJson(buffer, sizeof(buffer), stateOverride);
    events->send(buffer, "progress");
}

// Checkpoints are write-before-execute: called with the file offset of a line that
// is about to run (or that recently ran, for the periodic every-N-lines case), never
// a line that's already known complete. See runner.h's Checkpoint doc comment.
void Runner::writeCheckpoint(uint32_t offset) {
    Movement::Point position;
    if (!movement->getCoordinates(position)) {
        // Mid-move (shouldn't normally happen here, since getNextTask() only runs
        // once the previous task has finished) - skip this checkpoint rather than
        // persist a stale/unknown position.
        return;
    }

    Preferences prefs;
    prefs.begin(PREFS_CKPT_NAMESPACE, false);
    prefs.putBool(PREFS_CKPT_VALID_KEY, true);
    prefs.putUInt(PREFS_CKPT_OFFSET_KEY, offset);
    prefs.putInt(PREFS_CKPT_EXEC_LINES_KEY, executedLines);
    prefs.putDouble(PREFS_CKPT_X_KEY, position.x);
    prefs.putDouble(PREFS_CKPT_Y_KEY, position.y);
    prefs.putInt(PREFS_CKPT_TOP_DIST_KEY, movement->getTopDistance());
    prefs.putInt(PREFS_CKPT_PEN_ANGLE_KEY, pen->getPenDistance());
    // Whether the pen is down right now, at the same instant as the position above -
    // see beginResume()'s hand-off ordering for why this has to be restored before
    // any resumed command line is fed.
    prefs.putBool(PREFS_CKPT_PEN_DOWN_KEY, pen->isDown());
    // Multi-color (docs/multi-color.md): which pen is mounted right now.
    // currentColorIndex defaults to 1 and palette is empty for single-color
    // files, so this writes 1/"" for them - see Checkpoint's doc comment.
    prefs.putInt(PREFS_CKPT_COLOR_INDEX_KEY, currentColorIndex);
    String colorName = (currentColorIndex >= 1 && currentColorIndex <= paletteCount && currentColorIndex <= maxPaletteColors)
        ? palette[currentColorIndex - 1]
        : String("");
    prefs.putString(PREFS_CKPT_COLOR_NAME_KEY, colorName);
    prefs.end();
}

bool Runner::loadCheckpoint(Checkpoint& out) {
    Preferences prefs;
    prefs.begin(PREFS_CKPT_NAMESPACE, true);
    bool valid = prefs.getBool(PREFS_CKPT_VALID_KEY, false);
    if (valid) {
        out.offset = prefs.getUInt(PREFS_CKPT_OFFSET_KEY, 0);
        out.executedLines = prefs.getInt(PREFS_CKPT_EXEC_LINES_KEY, 0);
        out.x = prefs.getDouble(PREFS_CKPT_X_KEY, 0);
        out.y = prefs.getDouble(PREFS_CKPT_Y_KEY, 0);
        out.topDistance = prefs.getInt(PREFS_CKPT_TOP_DIST_KEY, -1);
        out.penAngle = prefs.getInt(PREFS_CKPT_PEN_ANGLE_KEY, -1);
        out.penDown = prefs.getBool(PREFS_CKPT_PEN_DOWN_KEY, false);
        // Defaults (1/"") match writeCheckpoint()'s single-color behavior, so a
        // checkpoint written before this field existed resumes exactly as before.
        out.colorIndex = prefs.getInt(PREFS_CKPT_COLOR_INDEX_KEY, 1);
        out.colorName = prefs.getString(PREFS_CKPT_COLOR_NAME_KEY, "");
    }
    prefs.end();
    return valid;
}

void Runner::clearCheckpoint() {
    Preferences prefs;
    prefs.begin(PREFS_CKPT_NAMESPACE, false);
    prefs.clear();
    prefs.end();
}

int Runner::countTotalCommandLines() {
    File f = LittleFS.open("/commands");
    if (!f || !f.available()) {
        return 0;
    }

    double totalDistanceUnused;
    bool hasTopDistanceUnused;
    double topDistanceUnused;
    int paletteCountUnused;
    if (!parseCommandFileHeader(f, totalDistanceUnused, hasTopDistanceUnused, topDistanceUnused, nullptr, paletteCountUnused)) {
        f.close();
        return 0;
    }

    int count = 0;
    while (f.available()) {
        f.readStringUntil('\n');
        count++;
    }
    f.close();
    return count;
}

// Reopens /commands, seeks to the checkpointed offset, and restores executedLines/
// totalLines so progress reporting (display + SSE) is correct from the first tick.
// Movement must already be homed to (cp.x, cp.y) before calling this - see
// ExtendToHomePhase, which calls Movement::extendToPoint() for the resume flow
// instead of Movement::extendToHome().
bool Runner::beginResume(const Checkpoint& cp) {
    openedFile = LittleFS.open("/commands");
    if (!openedFile || !openedFile.available()) {
        Serial.println("Resume failed: could not open /commands");
        return false;
    }

    bool hasTopDistance;
    double fileTopDistance;
    paletteCount = 0;
    if (!parseCommandFileHeader(openedFile, totalDistance, hasTopDistance, fileTopDistance, palette, paletteCount)) {
        Serial.println("Resume failed: bad command file header");
        return false;
    }
    // Multi-color (docs/multi-color.md): restore which pen was active at the
    // checkpoint, rather than resetting to 1 (which initTaskProvider() does
    // for a *fresh* /run) - we're continuing a job that may already be
    // several colors in.
    currentColorIndex = cp.colorIndex;

    if (hasTopDistance) {
        // ResumeDrawingPhase::confirmResume() already restored movement's
        // topDistance from cp.topDistance before this runs, so this doubles as
        // sanity-checking the checkpoint's own topDistance against the file it
        // was checkpointed against - same guard initTaskProvider() applies to a
        // fresh /run.
        auto currentTopDistance = (double)movement->getTopDistance();
        if (abs(fileTopDistance - currentTopDistance) > 1.0) {
            Serial.println("Resume failed: command file pin distance mismatch: file=" + String(fileTopDistance) + " current=" + String(currentTopDistance));
            return false;
        }
    }

    auto commandsStart = openedFile.position();
    totalLines = 0;
    while (openedFile.available()) {
        openedFile.readStringUntil('\n');
        totalLines++;
    }

    if (cp.offset < commandsStart || cp.offset > openedFile.size()) {
        Serial.println("Resume failed: checkpoint offset out of range");
        return false;
    }
    openedFile.seek(cp.offset);

    executedLines = cp.executedLines;
    progress = -1;
    targetPosition = Movement::Point(cp.x, cp.y);

    auto homeCoordinates = movement->getHomeCoordinates();
    finishingSequence[0] = new InterpolatingMovementTask(movement, homeCoordinates);
    sequenceIx = 0;

    // Safety-critical ordering: the belt-extend travel back to (cp.x, cp.y) that the
    // caller just finished (see ExtendToHomePhase::loopPhase(), which only calls
    // beginResume() once movement has stopped moving) always happens with the pen
    // up - Pen() boots up, and nothing here or upstream lowers it before this point.
    // Only now, with that travel complete, do we lower the pen back down (if it was
    // down when the checkpoint was taken) - and only before the first resumed
    // command is fed, never while still travelling to get there. This must not move
    // into a Task (e.g. prepended to the file's first task) because a Task can be
    // paused/retried/reordered by the pause primitive; this call site is guaranteed
    // to run exactly once, exactly here.
    if (cp.penDown) {
        pen->slowDown();
    }

    currentTask = getNextTask();
    currentTask->startRunning();
    stopped = false;
    paused = false;
    pauseRequested = false;
#ifdef MURAL_TMC_UART
    pausedDueToStall = false;
#endif

    pushProgressEvent(true);
    return true;
}