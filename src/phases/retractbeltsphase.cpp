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

void RetractBeltsPhase::handleCommand(AsyncWebServerRequest *request) {
#ifdef MURAL_TMC_UART
    // UNTESTED ON HARDWARE: kicks off the StallGuard auto-retract handled in
    // loopPhase() below. Requires an explicit command (rather than starting
    // the moment this phase is entered) so the manual jog commands handled
    // by CommandHandlingPhase::handleCommand() below remain the default,
    // always-available fallback.
    auto command = request->arg("command");
    if (command == "auto-retract") {
        autoRetractRequested = true;
        request->send(200, "text/plain", "OK");
        return;
    }
#endif
    CommandHandlingPhase::handleCommand(request);
}

const char* RetractBeltsPhase::getLeftStatus() {
#ifdef MURAL_TMC_UART
    if (autoRetractRequested) {
        return leftRetracted ? "retracted" : "retracting";
    }
#endif
    // Manual mode (also the fallback in a MURAL_TMC_UART build, before
    // auto-retract has been started): only report what the firmware can
    // actually observe - the jog is currently held - never claim
    // "retracted" on its own. The "Belts are retracted" button is the only
    // thing that advances the phase in this mode.
    return movement->isLeftRetracting() ? "retracting" : "idle";
}

const char* RetractBeltsPhase::getRightStatus() {
#ifdef MURAL_TMC_UART
    if (autoRetractRequested) {
        return rightRetracted ? "retracted" : "retracting";
    }
#endif
    return movement->isRightRetracting() ? "retracting" : "idle";
}

#ifdef MURAL_TMC_UART
// UNTESTED ON HARDWARE: sensorless StallGuard homing for the belt retract
// phase. Started by the "auto-retract" command (see handleCommand() above)
// instead of the moment this phase is entered, so the manual "jog with
// l-ret/r-ret and watch for a stall, then press done" workflow (handled by
// CommandHandlingPhase, still fully functional) remains available as a
// fallback, e.g. if StallGuard isn't tuned correctly on a given machine yet
// - see docs/tmc-uart.md for how to safely validate this before relying on
// it.
void RetractBeltsPhase::loopPhase() {
    if (!autoRetractRequested) {
        return;
    }

    if (!startedAutoRetract) {
        movement->leftStepper(-1);
        movement->rightStepper(-1);
        startedAutoRetract = true;
        return;
    }

    // Movement::runSteppers() latches a stall independently per motor (each
    // DIAG pin is read separately), so each belt's retract is tracked and
    // stopped on its own here rather than treating the first stall as both
    // being done.
    if (movement->isLeftStalled()) {
        leftRetracted = true;
    }
    if (movement->isRightStalled()) {
        rightRetracted = true;
    }

    if (leftRetracted && rightRetracted) {
        movement->clearStall();
        manager->setPhase(PhaseManager::ExtendToHome);
    }
}
#endif
