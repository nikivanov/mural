#ifndef ShiftRegister_h
#define ShiftRegister_h

#include "board.h"

#if defined(MURAL_BOARD_MKS_DLC32)

// Drives the MKS DLC32's 74HC595 (STEP/DIR/EN for all drivers) by bit-banging its
// SER/SRCLK/RCLK lines. Every change is latched immediately.
namespace ShiftRegister {
    // Latches a safe state (drivers disabled, all STEP/DIR low). Call as early as possible
    // in setup(): until the first latch the 595 outputs are random. Safe to call again.
    void begin();
    void writeBit(int bit, bool value);
    void setMotorsEnabled(bool enabled);
}

// AccelStepper FUNCTION-interface callbacks: each emits one step pulse in a fixed direction.
// AccelStepper picks forward/backward from the sign of its speed, so callers must pass
// signed speeds (see moveAtSpeed in movement.cpp).
namespace ShiftRegisterSteps {
    void leftForward();
    void leftBackward();
    void rightForward();
    void rightBackward();
}

#endif

#endif
