#include "interpolatingmovementtask.h"
double distanceBetweenPoints(Movement::Point point1, Movement::Point point2) {
    return sqrt(pow(point2.x - point1.x, 2) + pow(point2.y - point1.y, 2));
}

Movement::Point getNextIncrement(Movement::Point currentPosition, Movement::Point target) {
    if (distanceBetweenPoints(currentPosition, target) <= INCREMENT) {
        return target;
    }
    Serial.println("Distance ok");

    auto slope = (double(target.y - currentPosition.y)) / (target.x - currentPosition.x);
    Serial.println("Slope " + String(slope));
    auto angle = atan(slope);
    Serial.println("Angle " + String(angle));
    auto incrementY = INCREMENT*sin(angle);
    auto incrementX = INCREMENT*cos(angle);
    return Movement::Point(currentPosition.x + incrementX, currentPosition.y + incrementY);
}

bool arePointsEqual(Movement::Point point1, Movement::Point point2) {
    return point1.x == point2.x && point1.y == point2.y;
}

InterpolatingMovementTask::InterpolatingMovementTask(Movement *movement, Movement::Point target) {
    this->target = target;
    this->movement = movement;
}

void InterpolatingMovementTask::startRunning() {
    Serial.println("We're running now!");
    auto currentCoordinates = movement->getCoordinates();
    Serial.printf("Current coordinates (%s, %s)\n", String(currentCoordinates.x), String(currentCoordinates.y));
    auto incrementPoint = getNextIncrement(currentCoordinates, target);
    Serial.printf("Next coordinate (%s, %s)\n", incrementPoint.x, incrementPoint.y);
    Serial.flush();
    movement->beginLinearTravel(incrementPoint.x, incrementPoint.y);
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
    Serial.printf("Next coordinate (%s, %s)\n", incrementPoint.x, incrementPoint.y);
    movement->beginLinearTravel(incrementPoint.x, incrementPoint.y);
    
    return false;
}

