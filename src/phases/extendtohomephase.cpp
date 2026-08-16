#include "extendtohomephase.h"
void ExtendToHomePhase::extendToHome(AsyncWebServerRequest *request) {
    int moveTime;
    if (!movement->extendToHome(moveTime)) {
        request->send(400, "text/plain", "Not ready");
        return;
    }
    moveTime = moveTime + 1; // extra second of waiting for good measure
    request->send(200, "text/plain", String(moveTime));
}

ExtendToHomePhase::ExtendToHomePhase(PhaseManager* manager, Movement* movement) {
    this->manager = manager;
    this->movement = movement;
}

const char* ExtendToHomePhase::getName() {
    return "ExtendToHome";
}

void ExtendToHomePhase::loopPhase() {
    if (movement->hasStartedHoming() && !movement->isMoving()) {
        manager->setPhase(PhaseManager::PenCalibration);
    }
}