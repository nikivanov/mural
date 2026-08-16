#include "retractbeltsphase.h"
#include "commandhandlingphase.h"
RetractBeltsPhase::RetractBeltsPhase(PhaseManager* manager, Movement* movement) : CommandHandlingPhase(movement) {
    this->manager = manager;
    this->movement = movement;
}

void RetractBeltsPhase::doneWithPhase(AsyncWebServerRequest *request) {
    manager->setPhase(PhaseManager::ExtendToHome);
    manager->respondWithState(request);
}

const char* RetractBeltsPhase::getName() {
    return "RetractBelts";
}

#ifdef MURAL_TMC_UART
// UNTESTED ON HARDWARE: sensorless StallGuard homing for the belt retract
// phase. Replaces the manual "jog with l-ret/r-ret and watch for a stall,
// then press done" workflow with an automatic retract-until-stall using the
// same StallGuard detection Movement::runSteppers() already implements. The
// manual jog commands (handled by CommandHandlingPhase) and the manual
// doneWithPhase() above still work if the user prefers/needs them, e.g. if
// StallGuard isn't tuned correctly on a given machine yet - see
// docs/tmc-uart.md for how to safely validate this before relying on it.
void RetractBeltsPhase::loopPhase() {
    if (!startedAutoRetract) {
        movement->leftStepper(-1);
        movement->rightStepper(-1);
        startedAutoRetract = true;
        return;
    }

    if (!movement->isMoving()) {
        // Motion stopped on its own, which in UART mode only happens via the
        // StallGuard detection in Movement::runSteppers() - treat that as
        // "both belts are retracted" and move on automatically.
        movement->clearStall();
        manager->setPhase(PhaseManager::ExtendToHome);
    }
}
#endif