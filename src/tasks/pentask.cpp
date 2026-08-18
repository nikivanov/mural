#include "pentask.h"
PenTask::PenTask(bool up, Pen *pen) {
    this->up = up;
    this->pen = pen;
}

void PenTask::startRunning() {
    Serial.println("Starting pen task " + String(up));
    if (up) {
        Serial.println("Pen is going up");
        if (!pen->slowUp()) {
            Serial.println("Pen not ready, skipping move");
        }
    } else {
        Serial.println("Pen is going down");
        if (!pen->slowDown()) {
            Serial.println("Pen not ready, skipping move");
        }
    }
    Serial.println("Pen task ran");
}

bool PenTask::isDone() {
    Serial.println("Pen task is done");
    return true;
}