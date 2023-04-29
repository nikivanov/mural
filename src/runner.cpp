#include "runner.h"
#include "movementtask.h"
#include "interpolatingmovementtask.h"
#include "pentask.h"
#include "pen.h"
#include "display.h"
Runner::Runner(Movement *movement, Pen *pen, Display *display) {
    stopped = true;
    this->movement = movement;
    this->pen = pen;
    this->display = display;
    currentTask = 0;
}

void Runner::initTasks() {
    auto centerX = movement->getWidth() / 2;
    auto centerY = movement->getHeight() / 2;

    // auto currentSize = 50;
    // auto growBy = 50;
    // auto totalSquares = 5;

    // 975 x 548

    //auto currentSize = 300;
    auto width = 1000;
    auto height = 250;

    tasks[0] = new PenTask(true, pen);
    tasks[1] = new InterpolatingMovementTask(movement, Movement::Point(centerX - width / 2, centerY - height / 2));
    tasks[2] = new PenTask(false, pen);
    tasks[3] = new InterpolatingMovementTask(movement, Movement::Point(centerX + width / 2, centerY - height / 2));
    tasks[4] = new InterpolatingMovementTask(movement, Movement::Point(centerX + width / 2, centerY + height / 2));
    tasks[5] = new InterpolatingMovementTask(movement, Movement::Point(centerX - width / 2, centerY + height / 2));
    tasks[6] = new InterpolatingMovementTask(movement, Movement::Point(centerX - width / 2, centerY - height / 2));
    tasks[7] = new PenTask(true, pen);
}

void Runner::start() {
    initTasks();
    stopped = false;
    currentTask = 0;
    tasks[0]->startRunning();
}

void Runner::run() {
    if (stopped) {
        return;
    }

    auto task = tasks[currentTask];
    if (task->isDone()) {
        Serial.printf("Task %s is done\n", String(currentTask));
        currentTask++;

        if (currentTask == 3 || currentTask == 7) {
            printStatus();
        }

        if (currentTask < 8) {
            task = tasks[currentTask];
            task->startRunning();
        } else {
            stopped = true;
        }
    }
}

void Runner::printStatus() {
    // auto coordinates = movement->getCoordinates();
    // auto lengths = movement->getLengths();
    // display->displayText(String(coordinates.x) + ", " + coordinates.y + "; " + lengths.left + ", " + lengths.right);
}