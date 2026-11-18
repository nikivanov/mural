#include "shiftregister.h"

#if defined(MURAL_BOARD_MKS_DLC32)

#include <Arduino.h>

namespace {
    // TMC2209 needs ~100ns; keep generous margin for other StepStick drivers.
    constexpr int STEP_PULSE_US = 2;

    portMUX_TYPE mux = portMUX_INITIALIZER_UNLOCKED;
    uint8_t image = 0;
    bool initialized = false;

    // Shifts the image out MSB first so bit n ends up on Qn, then latches it (RCLK rising edge).
    // Caller must hold the mux.
    void shiftOutLocked(uint8_t value) {
        shiftOut(SR_DATA_PIN, SR_CLOCK_PIN, MSBFIRST, value);
        digitalWrite(SR_LATCH_PIN, HIGH);
        digitalWrite(SR_LATCH_PIN, LOW);
    }
}

void ShiftRegister::begin() {
    if (initialized) {
        return;
    }
    pinMode(SR_DATA_PIN, OUTPUT);
    pinMode(SR_CLOCK_PIN, OUTPUT);
    pinMode(SR_LATCH_PIN, OUTPUT);
    digitalWrite(SR_CLOCK_PIN, LOW);
    digitalWrite(SR_LATCH_PIN, LOW);

    portENTER_CRITICAL(&mux);
    image = 1 << SR_MOTOR_ENABLE_BIT;   // EN is active low: start with drivers disabled
    shiftOutLocked(image);
    portEXIT_CRITICAL(&mux);
    initialized = true;
}

void ShiftRegister::writeBit(int bit, bool value) {
    portENTER_CRITICAL(&mux);
    uint8_t next = value ? (image | (1 << bit)) : (image & ~(1 << bit));
    if (next != image) {
        image = next;
        shiftOutLocked(image);
    }
    portEXIT_CRITICAL(&mux);
}

void ShiftRegister::setMotorsEnabled(bool enabled) {
    writeBit(SR_MOTOR_ENABLE_BIT, !enabled);
}

namespace {
    // DIR is latched on its own first (no-op if unchanged) to meet the driver's
    // DIR-to-STEP setup time.
    void pulse(int stepBit, int dirBit, bool dirLevel) {
        ShiftRegister::writeBit(dirBit, dirLevel);
        ShiftRegister::writeBit(stepBit, true);
        delayMicroseconds(STEP_PULSE_US);
        ShiftRegister::writeBit(stepBit, false);
    }
}

void ShiftRegisterSteps::leftForward()   { pulse(SR_LEFT_STEP_BIT, SR_LEFT_DIR_BIT, !LEFT_DIR_INVERTED); }
void ShiftRegisterSteps::leftBackward()  { pulse(SR_LEFT_STEP_BIT, SR_LEFT_DIR_BIT, LEFT_DIR_INVERTED); }
void ShiftRegisterSteps::rightForward()  { pulse(SR_RIGHT_STEP_BIT, SR_RIGHT_DIR_BIT, !RIGHT_DIR_INVERTED); }
void ShiftRegisterSteps::rightBackward() { pulse(SR_RIGHT_STEP_BIT, SR_RIGHT_DIR_BIT, RIGHT_DIR_INVERTED); }

#endif
