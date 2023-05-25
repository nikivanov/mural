#include "runner.h"
#include "movementtask.h"
#include "interpolatingmovementtask.h"
#include "pentask.h"
#include "pen.h"
#include "display.h"
#include "SPIFFS.h"

Runner::Runner(Movement *movement, Pen *pen, Display *display) {
    stopped = true;
    this->movement = movement;
    this->pen = pen;
    this->display = display;
}

void Runner::initTaskProvider() {
    openedFile = SPIFFS.open("/output.txt");
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

    Serial.println("Total distance to travel: " + String(totalDistance));

    distanceSoFar = 0;
    progress = -1; // so 0% appears right away
    sentBackToHome = false;
    startPosition = movement->getCoordinates();
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
        if (sentBackToHome) {
            return NULL;
        } else {
            auto homeCoordinates = movement->getHomeCoordinates();
            sentBackToHome = true;
            return new InterpolatingMovementTask(movement, homeCoordinates);
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