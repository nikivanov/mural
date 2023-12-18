#include "extendtohomephase.h"
#include "distancestate.h"
void ExtendToHomePhase::extendToHome(AsyncWebServerRequest *request) {
    movement->extendToHome();
    request->send(200, "text/plain", "OK");
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
        DistanceState::storeDistance(movement->getTopDistance());
        manager->setPhase(PhaseManager::PenCalibration);
    }
}