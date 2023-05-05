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
    if (!openedFile) {
        Serial.println("Failed to open file");
        throw std::invalid_argument("No File");
    }
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
                Serial.println("Pen down");
                return new PenTask(false, pen);
            }
            else
            {
                Serial.println("Pen up");
                return new PenTask(true, pen);
            }
        }
        else
        {
            auto x = line.substring(0, line.indexOf(" ")).toDouble();
            auto y = line.substring(line.indexOf(" ") + 1).toDouble();
            return new InterpolatingMovementTask(movement, Movement::Point(x, y));
        }
    }
    else
    {
        return NULL;
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
        Serial.println(String(index));
        index = index + 1;
        delete task;
        task = getNextTask();
    }
    Serial.println("All done");
}