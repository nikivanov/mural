#include "pen.h"

Pen::Pen()
{
    servo = new Servo();
    servo->attach(2);
}

void Pen::setRawValue(int rawValue) {
    servo->write(rawValue);
}

void Pen::setPenDistance(int value) {
    Serial.printf("Pen distance angle set to %i\n", value);
    penDistance = value;
}

void Pen::up() {
    Serial.println("Up called! Pen distance is "+ penDistance);
    delay(10);
    if (penDistance == -1) {
        throw std::invalid_argument("not ready");
    }

    servo->write(penDistance + RETRACT_DISTANCE);
    delay(200);
}

void Pen::down() {
    Serial.println("Down called! Pen distance is "+ penDistance);
    delay(10);
    if (penDistance == -1) {
        throw std::invalid_argument("not ready");
    }

    servo->write(penDistance);
    delay(200);
}