#include "shiftregister.h"

#ifdef STEPPERS_VIA_SHIFT_REGISTER

namespace {
    // Current state of the 8 outputs. Enable is active low, so start with the motors disabled.
    uint8_t outputs = 1 << MOTOR_ENABLE_BIT;

    void write() {
        // MSB first: bit 0 goes in last and ends up on QA (I2SO.0), matching what FluidNC's
        // I2S stream produces.
        for (int bit = 7; bit >= 0; bit--) {
            digitalWrite(SHIFT_REG_DATA_PIN, (outputs >> bit) & 1);
            digitalWrite(SHIFT_REG_CLOCK_PIN, HIGH);
            digitalWrite(SHIFT_REG_CLOCK_PIN, LOW);
        }
        digitalWrite(SHIFT_REG_LATCH_PIN, HIGH);
        digitalWrite(SHIFT_REG_LATCH_PIN, LOW);
    }
}

void ShiftRegister::begin() {
    pinMode(SHIFT_REG_DATA_PIN, OUTPUT);
    pinMode(SHIFT_REG_CLOCK_PIN, OUTPUT);
    pinMode(SHIFT_REG_LATCH_PIN, OUTPUT);
    digitalWrite(SHIFT_REG_CLOCK_PIN, LOW);
    digitalWrite(SHIFT_REG_LATCH_PIN, LOW);
    write();
}

void ShiftRegister::setBit(int bit, bool value) {
    const uint8_t updated = value ? (outputs | (1 << bit)) : (outputs & ~(1 << bit));
    if (updated == outputs) {
        return;
    }
    outputs = updated;
    write();
}

// enable = false: there are no GPIOs for AccelStepper to configure.
ShiftRegisterStepper::ShiftRegisterStepper(int stepBit, int dirBit, bool invertDirection)
    : AccelStepper(AccelStepper::DRIVER, 0, 0, 0, 0, false) {
    this->stepBit = stepBit;
    this->dirBit = dirBit;
    this->invertDirection = invertDirection;
    setOutputPins(0);
}

void ShiftRegisterStepper::setOutputPins(uint8_t mask) {
    // Direction first, so it is stable before the step edge.
    ShiftRegister::setBit(dirBit, bool(mask & 0b10) != invertDirection);
    ShiftRegister::setBit(stepBit, mask & 0b01);
}

void ShiftRegisterStepper::disableOutputs() {
    setOutputPins(0);
}

void ShiftRegisterStepper::enableOutputs() {
}

#endif
