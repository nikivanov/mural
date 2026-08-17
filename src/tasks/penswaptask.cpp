#include "penswaptask.h"
#include "../runner.h"

PenSwapTask::PenSwapTask(Pen *pen, Movement *movement, Runner *runner, int colorIndex, String penName) {
    this->pen = pen;
    this->runner = runner;
    this->colorIndex = colorIndex;
    this->penName = penName;
    this->travelTask = new InterpolatingMovementTask(movement, pen, movement->getHomeCoordinates());
}

PenSwapTask::~PenSwapTask() {
    delete travelTask;
}

void PenSwapTask::startRunning() {
    Serial.println("Starting pen swap to color " + String(colorIndex) + " (" + penName + ")");
    if (!pen->slowUp()) {
        Serial.println("Pen not ready, skipping lift before swap");
    }
    state = Traveling;
    travelTask->startRunning();
}

bool PenSwapTask::isDone() {
    if (state == Traveling) {
        if (!travelTask->isDone()) {
            return false;
        }
        state = AwaitingConfirmation;
        runner->notifyPenSwapWaiting(colorIndex, penName);
        return false;
    }

    if (state == AwaitingConfirmation) {
        return confirmed;
    }

    return true;
}

void PenSwapTask::confirm() {
    confirmed = true;
    state = Confirmed;
}

bool PenSwapTask::isAwaitingConfirmation() {
    return state == AwaitingConfirmation && !confirmed;
}
