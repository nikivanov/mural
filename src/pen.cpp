#include "pen.h"

bool shouldStop(int currentDegree, int targetDegree, bool positive) {
    if (positive) {
        return currentDegree > targetDegree;
    } else {
        return currentDegree < targetDegree;
    }
}

void doSlowMove(Pen* pen, int startDegree, int targetDegree, int speedDegPerSec) {
    if (startDegree == targetDegree) {
        return;
    }

    auto startTime = millis();

    bool positive;
    if (targetDegree > startDegree) {
        positive = true;
    } else {
        positive = false;
    }

    auto currentDegree = startDegree;

    while (!(shouldStop(currentDegree, targetDegree, positive))) {
        pen->setRawValue(currentDegree);
        delay(10);

        auto currentTime = millis();
        auto deltaTime = currentTime - startTime;
        auto progressDegrees = int(double(deltaTime) / 1000 * speedDegPerSec);

        if (!positive) {
            progressDegrees = progressDegrees * -1;
        }

        currentDegree = startDegree + progressDegrees;
    }
    pen->setRawValue(targetDegree);
    delay(200);
}


Pen::Pen()
{
    servo = new Servo();
    servo->attach(2);
    servo->write(90);
    currentPosition = 90;
}

void Pen::setRawValue(int rawValue) {
    this->servo->write(rawValue);
    currentPosition = rawValue;
}

void Pen::setPenDistance(int value) {
    Serial.println("Pen distance angle set to " + String(value));
    this->penDistance = value;
}

void Pen::slowUp() {
    if (penDistance == -1) {
        throw std::invalid_argument("not ready");
    }

    doSlowMove(this, currentPosition, 90, slowSpeedDegPerSec);
    currentPosition = 90;
}

void Pen::slowDown() {
    if (penDistance == -1) {
        throw std::invalid_argument("not ready");
    }

    doSlowMove(this, currentPosition, penDistance, slowSpeedDegPerSec);
    currentPosition = penDistance;
}

bool Pen::isDown() {
    return currentPosition == penDistance;
}