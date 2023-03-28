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
}


Pen::Pen()
{
    this->servo = new Servo();
    this->servo->attach(2);
}

void Pen::setRawValue(int rawValue) {
    this->servo->write(rawValue);
}

void Pen::setPenDistance(int value) {
    Serial.println("Pen distance angle set to " + String(value));
    this->penDistance = value;
}

void Pen::up() {
    Serial.println("Up called! Pen distance is "+ String(penDistance));
    if (penDistance == -1) {
        Serial.println("Not ready");
        throw std::invalid_argument("not ready");
    }

    auto servoVal = penDistance + RETRACT_DISTANCE;
    Serial.println("Writing servo value " + String(servoVal));
    this->servo->write(servoVal);
    Serial.println("Wrote to the servo");
    delay(200);
}

void Pen::down() {
    Serial.println("Down called! Pen distance is "+ String(penDistance));
    if (penDistance == -1) {
        Serial.println("Not ready");
        throw std::invalid_argument("not ready");
    }

    servo->write(penDistance);
    delay(200);
}

void Pen::slowUp() {
    doSlowMove(this, currentPosition, 90, slowSpeedDegPerSec);
    currentPosition = 90;
}

void Pen::slowDown() {
    doSlowMove(this, currentPosition, 0, slowSpeedDegPerSec);
    currentPosition = 0;
}

void Pen::home() {
    servo->write(currentPosition);
}


