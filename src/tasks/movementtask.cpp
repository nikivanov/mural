#include "movementtask.h"
MovementTask::MovementTask(int x, int y, Movement *movement) {
    this->x = x;
    this->y = y;
    this->movement = movement;
}

void MovementTask::startRunning() {
    if (!movement->beginLinearTravel(x, y, false)) {
        throw std::invalid_argument("movement validation failure");
    };
}

bool MovementTask::isDone() {
    return !(movement->isMoving());
}

bool MovementTask::validate() {
    Serial.println("")
    return movement->beginLinearTravel(x, y, true);
}