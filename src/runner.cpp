#include "runner.h"
#include "movementtask.h"
#include "interpolatingmovementtask.h"
#include "pentask.h"
#include "pen.h"
Runner::Runner(Movement *movement, Pen *pen) {
    stopped = true;
    this->movement = movement;
    this->pen = pen;
    currentTask = 0;
}

void Runner::initTasks() {
    auto centerX = movement->getWidth() / 2;
    auto centerY = movement->getHeight() / 2;

    auto currentSize = 50;
    auto growBy = 50;
    auto totalSquares = 5;

    // 975 x 548

    for (int i = 0; i < totalSquares; i++) {
        tasks[0 + 8 * i] = new PenTask(true, pen);
        tasks[1 + 8 * i] = new InterpolatingMovementTask(movement, Movement::Point(centerX - currentSize / 2, centerY - currentSize / 2));
        tasks[2 + 8 * i] = new PenTask(false, pen);
        tasks[3 + 8 * i] = new InterpolatingMovementTask(movement, Movement::Point(centerX + currentSize / 2, centerY - currentSize / 2));
        tasks[4 + 8 * i] = new InterpolatingMovementTask(movement, Movement::Point(centerX + currentSize / 2, centerY + currentSize / 2));
        tasks[5 + 8 * i] = new InterpolatingMovementTask(movement, Movement::Point(centerX - currentSize / 2, centerY + currentSize / 2));
        tasks[6 + 8 * i] = new InterpolatingMovementTask(movement, Movement::Point(centerX - currentSize / 2, centerY - currentSize / 2));
        tasks[7 + 8 * i] = new PenTask(true, pen);
        currentSize = currentSize + growBy;
    }
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
        if (currentTask < 40) {
            task = tasks[currentTask];
            task->startRunning();
        } else {
            stopped = true;
        }
    }
}