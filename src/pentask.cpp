#include "pentask.h"
PenTask::PenTask(bool up, Pen *pen) {
    this->up = up;
    this->pen = pen;
}

void PenTask::startRunning() {
    if (up) {
        pen->up();
    } else {
        pen->down();
    }
}

bool PenTask::isDone() {
    return true;
}