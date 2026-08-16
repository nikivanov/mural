#include "runner.h"
#include <stdexcept>
#include "tasks/interpolatingmovementtask.h"
#include "tasks/pentask.h"
#include "pen.h"
#include "display.h"
#include "LittleFS.h"
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

bool Runner::initTaskProvider() {
    lastError = "";

    openedFile = LittleFS.open("/commands");
    if (!openedFile || !openedFile.available()) {
        Serial.println("Failed to open file");
        return false;
    }

    auto line = openedFile.readStringUntil('\n');
    if (line.charAt(0) == 'd') {
        totalDistance = line.substring(1, line.length() - 1).toDouble();
    } else {
        Serial.println("Bad file - no distance");
        return false;
    }

    auto heightLine = openedFile.readStringUntil('\n');
    if (heightLine.charAt(0) == 'h') {
        auto height = heightLine.substring(1, heightLine.length() - 1).toDouble();
        // we actually dont need it, just validating
    } else {
        Serial.println("Bad file - no height");
        return false;
    }

    // Optional `t<mm>` pin-distance header (added after the d/h headers by
    // toCommands.ts). Older command files won't have it, so peek at the next
    // line and seek back if it's not there instead of consuming it.
    auto beforeTopDistanceLine = openedFile.position();
    auto topDistanceLine = openedFile.readStringUntil('\n');
    if (topDistanceLine.charAt(0) == 't') {
        String topDistanceValue = topDistanceLine.substring(1);
        topDistanceValue.trim();
        auto fileTopDistance = topDistanceValue.toDouble();
        auto currentTopDistance = (double)movement->getTopDistance();
        if (abs(fileTopDistance - currentTopDistance) > 1.0) {
            Serial.println("Command file pin distance mismatch: file=" + String(fileTopDistance) + " current=" + String(currentTopDistance));
            lastError = "Command file was generated for pin distance " + String((int)fileTopDistance) + " mm, current setup is " + String((int)currentTopDistance) + " mm";
            return false;
        }
    } else {
        openedFile.seek(beforeTopDistanceLine);
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
        auto line = openedFile.readStringUntil('\n');
        executedLines++;
        if (line.charAt(0) == 'p')
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
                if (peekLine.length() == 0 || peekLine.charAt(0) == 'p') {
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
    // UNTESTED ON HARDWARE: stall monitoring during drawing. If either
    // driver reported a stall, Movement::runSteppers() already halted both
    // motors; here we stop feeding the runner's tasks, lift the pen, and
    // show a message on the OLED instead of trying to continue or auto-
    // resume the job. See docs/tmc-uart.md for how to recover from this.
    if (movement->isStalled()) {
        if (!pausedForStall) {
            pausedForStall = true;
            Serial.println("Stall detected while drawing - pausing.");
            pen->slowUp();
            display->displayText("STALL - paused");
        }
        return;
    }
#endif

    if (currentTask->isDone())
    {
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
        }
        else
        {
            stopped = true;
        }
    }
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