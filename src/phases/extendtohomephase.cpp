#include "extendtohomephase.h"

ExtendToHomePhase::ExtendToHomePhase(PhaseManager* manager, Movement* movement, Runner* runner) {
    this->manager = manager;
    this->movement = movement;
    this->runner = runner;
}

void ExtendToHomePhase::extendToHome(AsyncWebServerRequest *request) {
    int moveTime;
    bool ok;
    if (manager->isResuming()) {
        // Resume-after-power-loss: extend to the checkpointed position instead of
        // the fixed home coordinates (see docs on ResumeDrawingPhase).
        Runner::Checkpoint cp = manager->getPendingCheckpoint();
        ok = movement->extendToPoint(cp.x, cp.y, moveTime);
    } else {
        ok = movement->extendToHome(moveTime);
    }

    if (!ok) {
        request->send(400, "text/plain", "Not ready");
        return;
    }
    moveTime = moveTime + 1; // extra second of waiting for good measure
    request->send(200, "text/plain", String(moveTime));
}

const char* ExtendToHomePhase::getName() {
    return "ExtendToHome";
}

void ExtendToHomePhase::loopPhase() {
    if (movement->hasStartedHoming() && !movement->isMoving()) {
        if (manager->isResuming()) {
            Runner::Checkpoint cp = manager->getPendingCheckpoint();
            if (runner->beginResume(cp)) {
                manager->clearResuming();
                manager->setPhase(PhaseManager::Drawing);
            } else {
                // Corrupt/missing checkpoint or command file - fall back to a normal
                // start rather than getting stuck.
                Runner::clearCheckpoint();
                manager->clearResuming();
                manager->reset();
            }
        } else {
            manager->setPhase(PhaseManager::PenCalibration);
        }
    }
}
