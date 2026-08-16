#include "movementtask.h"
MovementTask::MovementTask(int x, int y, Movement *movement) {
    this->x = x;
    this->y = y;
    this->movement = movement;
}

void MovementTask::startRunning() {
    float moveTime;
    if (!movement->beginLinearTravel(x, y, printSpeedSteps, moveTime)) {
        Serial.println("Failed to start move");
    }
}

bool MovementTask::isDone() {
    return !(movement->isMoving());
}