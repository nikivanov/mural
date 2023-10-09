#include "runner.h"
#include "tasks/movementtask.h"
#include "tasks/interpolatingmovementtask.h"
#include "tasks/pentask.h"
#include "pen.h"
#include "display.h"
#include "SPIFFS.h"
using namespace std;

Runner::Runner(Movement *movement, Pen *pen, Display *display) {
    stopped = true;
    this->movement = movement;
    this->pen = pen;
    this->display = display;
}

void Runner::initTaskProvider() {
    openedFile = SPIFFS.open("/commands");
    if (!openedFile || !openedFile.available()) {
        Serial.println("Failed to open file");
        throw std::invalid_argument("No File");
    }

    auto line = openedFile.readStringUntil('\n');
    if (line.charAt(0) == 'd') {
        totalDistance = line.substring(1, line.length() - 1).toDouble();
    } else {
        Serial.println("Bad file - no distance");
        throw std::invalid_argument("bad file");
    }

    auto heightLine = openedFile.readStringUntil('\n');
    if (heightLine.charAt(0) == 'h') {
        auto height = heightLine.substring(1, heightLine.length() - 1).toDouble();
        // we actually dont need it, just validating
    } else {
        Serial.println("Bad file - no height");
        throw std::invalid_argument("bad file");
    }

    Serial.println("Total distance to travel: " + String(totalDistance));

    distanceSoFar = 0;
    progress = -1; // so 0% appears right away
    startPosition = movement->getCoordinates();

    auto homeCoordinates = movement->getHomeCoordinates();

    finishingSequence[0] = new InterpolatingMovementTask(movement, homeCoordinates);
    finishingSequence[1] = new PenTask(false, pen);
    finishingSequence[2] = new PenTask(true, pen);
}

void Runner::start() {
    initTaskProvider();
    stopped = false;
    currentTask = getNextTask();
    currentTask->startRunning();
}

Task *Runner::getNextTask()
{
    if (openedFile.available())
    {
        auto line = openedFile.readStringUntil('\n');
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

    if (currentTask->isDone())
    {
        if (currentTask->name() == InterpolatingMovementTask::NAME) {
            auto distanceCovered = Movement::distanceBetweenPoints(startPosition, targetPosition);
            distanceSoFar += distanceCovered;
            startPosition = targetPosition;
            auto newProgress = int(floor(distanceSoFar / totalDistance * 100));
            if (newProgress > 100) {
                newProgress = 100;
            }
            if (progress != newProgress) {
                Serial.println("Progress: " + String(newProgress));
                progress = newProgress;
                display->displayText(String(progress) + "%");
            }

        }
        delete currentTask;
        currentTask = getNextTask();
        if (currentTask != NULL)
        {
            currentTask->startRunning();
        }
        else
        {
            stopped = true;
        }
    }
}

void Runner::dryRun() {
    initTaskProvider();
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