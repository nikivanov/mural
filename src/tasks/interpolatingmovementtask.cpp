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
    Serial.printf("Starting the move to %f, %f\n", target.x, target.y);
    auto currentCoordinates = movement->getCoordinates();
    auto incrementPoint = getNextIncrement(currentCoordinates, target);
    if (!movement->beginLinearTravel(incrementPoint.x, incrementPoint.y, false)) {
        throw std::invalid_argument("movement validation failure");
    };
}

bool InterpolatingMovementTask::isDone() {
    if (movement->isMoving()) {
        return false;
    }

    auto currentPosition = movement->getCoordinates();
    if (arePointsEqual(currentPosition, target)) {
        return true;
    }

    auto incrementPoint = getNextIncrement(movement->getCoordinates(), target);
    if (!movement->beginLinearTravel(incrementPoint.x, incrementPoint.y, false)) {
        throw std::invalid_argument("movement validation failure");
    };
    
    return false;
}

bool InterpolatingMovementTask::validate() {
    auto currentCoordinates = movement->getCoordinates();
    auto incrementPoint = getNextIncrement(currentCoordinates, target);
    if (!movement->beginLinearTravel(incrementPoint.x, incrementPoint.y, true)) {
        return false;
    };
}

