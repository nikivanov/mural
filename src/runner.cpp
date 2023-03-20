#include "runner.h"
#include "movementtask.h"
Runner::Runner(Movement *movement) {
    stopped = true;
    this->movement = movement;
    currentTask = 0;
    initTasks();
}

void Runner::initTasks() {
    auto centerX = movement->getWidth() / 2;
    auto centerY = movement->getHeight() / 2;

    auto currentSize = 10;
    auto growBy = 10;
    auto totalSquares = 50;

    // 975 x 548

    for (int i = 0; i < totalSquares; i++) {
        tasks[0 + 5 * i] = new MovementTask(centerX - currentSize / 2, centerY - currentSize / 2, movement);
        tasks[1 + 5 * i] = new MovementTask(centerX + currentSize / 2, centerY - currentSize / 2, movement);
        tasks[2 + 5 * i] = new MovementTask(centerX + currentSize / 2, centerY + currentSize / 2, movement);
        tasks[3 + 5 * i] = new MovementTask(centerX - currentSize / 2, centerY + currentSize / 2, movement);
        tasks[4 + 5 * i] = new MovementTask(centerX - currentSize / 2, centerY - currentSize / 2, movement);
    }
}

void Runner::start() {
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
        currentTask++;
        if (currentTask < 250) {
            task = tasks[currentTask];
            task->startRunning();
        } else {
            stopped = true;
        }
    }
}