#include "movementtask.h"
MovementTask::MovementTask(int x, int y, Movement *movement) {
    this->x = x;
    this->y = y;
    this->movement = movement;
}

void MovementTask::startRunning() {
    movement->beginLinearTravel(x, y, printSpeedSteps);
}

bool MovementTask::isDone() {
    return !(movement->isMoving());
}