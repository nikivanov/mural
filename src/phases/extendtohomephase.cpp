#include "extendtohomephase.h"
#include "distancestate.h"
void ExtendToHomePhase::extendToHome(AsyncWebServerRequest *request) {
    movement->extendToHome();
    request->send(200, "text/plain", "OK");
}

void ExtendToHomePhase::doneWithPhase(AsyncWebServerRequest *request) {
    if (movement->isMoving()) {
        request->send(202, "text/plain", "movement in progress");
    } else {
        DistanceState::storeDistance(movement->getTopDistance());
        manager->setPhase(PhaseManager::PenCalibration);
        manager->respondWithState(request);
    }
}

ExtendToHomePhase::ExtendToHomePhase(PhaseManager* manager, Movement* movement) {
    this->manager = manager;
    this->movement = movement;
}

const char* ExtendToHomePhase::getName() {
    return "ExtendToHome";
}