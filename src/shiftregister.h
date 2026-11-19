#ifndef ShiftRegister_h
#define ShiftRegister_h

#include "pins.h"

#ifdef STEPPERS_VIA_SHIFT_REGISTER

#include "AccelStepper.h"
#include "Arduino.h"

// Drives the 74HC595 that sits between the ESP32 and the stepper driver sockets on boards
// like the MKS DLC32. FluidNC streams to it over I2S to reach very high step rates; Mural
// tops out at a few thousand steps per second, so shifting the 8 bits out by hand on every
// change is plenty and keeps AccelStepper in charge of the timing.
//
// Not thread safe: all writes must come from the same task (setup() / loop()).
namespace ShiftRegister {
    // Configures the pins and puts the outputs into a safe state (motors disabled, everything
    // else low). Call as early as possible: the outputs are undefined until the first write.
    void begin();

    // Changes a single output and updates the shift register right away.
    void setBit(int bit, bool value);
}

// An AccelStepper in DRIVER mode whose STEP and DIR signals are shift register outputs.
class ShiftRegisterStepper : public AccelStepper {
    public:
    ShiftRegisterStepper(int stepBit, int dirBit, bool invertDirection = false);

    // The enable line is shared between the motors and owned by Movement, so these leave it
    // alone - same as AccelStepper when it has no enable pin.
    void disableOutputs() override;
    void enableOutputs() override;

    protected:
    // AccelStepper's DRIVER mode passes bit 0 = step, bit 1 = direction.
    void setOutputPins(uint8_t mask) override;

    private:
    int stepBit;
    int dirBit;
    bool invertDirection;
};

#endif
#endif
