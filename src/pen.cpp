#include "pen.h"

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