#include "movement.h"
#include "interpolatingmovementtask.h"
const char* InterpolatingMovementTask::NAME = "InterpolatingMovementTask";

Movement::Point getNextIncrement(Movement::Point currentPosition, Movement::Point target) {
    auto distanceBetween = Movement::distanceBetweenPoints(currentPosition, target);
    if (distanceBetween <= INCREMENT) {
        return target;
    }

    auto nextX = currentPosition.x + (INCREMENT / distanceBetween) * (target.x - currentPosition.x);
    auto nextY = currentPosition.y + (INCREMENT / distanceBetween) * (target.y - currentPosition.y);

    return Movement::Point(nextX, nextY);
}

bool arePointsEqual(Movement::Point point1, Movement::Point point2) {
    return point1.x == point2.x && point1.y == point2.y;
}

InterpolatingMovementTask::InterpolatingMovementTask(Movement *movement, Movement::Point target) {
    this->target = target;
    this->movement = movement;
}

void InterpolatingMovementTask::startRunning() {
    Serial.printf("Starting the move to %.1f, %.1f\n", target.x, target.y);
    Movement::Point currentCoordinates;
    if (!movement->getCoordinates(currentCoordinates)) {
        Serial.println("Not ready to start move, aborting task");
        failed = true;
        return;
    }
    auto incrementPoint = getNextIncrement(currentCoordinates, target);
    float moveTime;
    if (!movement->beginLinearTravel(incrementPoint.x, incrementPoint.y, printSpeedSteps, moveTime)) {
        Serial.println("Failed to start move, aborting task");
        failed = true;
    }
}

bool InterpolatingMovementTask::isDone() {
    if (failed) {
        return true;
    }

    if (movement->isMoving()) {
        return false;
    }

    Movement::Point currentPosition;
    if (!movement->getCoordinates(currentPosition)) {
        Serial.println("Not ready to get coordinates, aborting task");
        return true;
    }
    if (arePointsEqual(currentPosition, target)) {
        return true;
    }

    auto incrementPoint = getNextIncrement(currentPosition, target);
    float moveTime;
    if (!movement->beginLinearTravel(incrementPoint.x, incrementPoint.y, printSpeedSteps, moveTime)) {
        Serial.println("Failed to start move, aborting task");
        return true;
    }

    return false;
}

