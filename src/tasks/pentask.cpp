#include "pentask.h"
PenTask::PenTask(bool up, Pen *pen) {
    this->up = up;
    this->pen = pen;
}

void PenTask::startRunning() {
    Serial.println("Starting pen task " + String(up));
    if (up) {
        Serial.println("Pen is going up");
        pen->slowUp();
    } else {
        Serial.println("Pen is going down");
        pen->slowDown();
    }
    Serial.println("Pen task ran");
}

bool PenTask::isDone() {
    Serial.println("Pen task is done");
    return true;
}

bool PenTask::validate() {
    // this task cant fail
    return true;
}