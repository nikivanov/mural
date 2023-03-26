#include "runner.h"
#include "movementtask.h"
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

    auto currentSize = 10;
    auto growBy = 10;
    auto totalSquares = 23;

    // 975 x 548

    for (int i = 0; i < totalSquares; i++) {
        tasks[0 + 9 * i] = new PenTask(true, pen);
        tasks[1 + 9 * i] = new MovementTask(centerX - currentSize / 2, centerY - currentSize / 2, movement);
        tasks[2 + 9 * i] = new PenTask(false, pen);
        tasks[3 + 9 * i] = new MovementTask(centerX + currentSize / 2, centerY - currentSize / 2, movement);
        tasks[4 + 9 * i] = new MovementTask(centerX + currentSize / 2, centerY + currentSize / 2, movement);
        tasks[5 + 9 * i] = new MovementTask(centerX - currentSize / 2, centerY + currentSize / 2, movement);
        tasks[6 + 9 * i] = new MovementTask(centerX - currentSize / 2, centerY - currentSize / 2, movement);
        tasks[7 + 9 * i] = new MovementTask(centerX - currentSize / 2, centerY - currentSize / 2, movement);
        tasks[8 + 9 * i] = new PenTask(true, pen);
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
        if (currentTask < 207) {
            task = tasks[currentTask];
            task->startRunning();
        } else {
            stopped = true;
        }
    }
}