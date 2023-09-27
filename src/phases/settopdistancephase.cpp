#include "settopdistancephase.h"
SetTopDistancePhase::SetTopDistancePhase(PhaseManager* manager, Movement* movement) {
    this->manager = manager;
    this->movement = movement;
}

void SetTopDistancePhase::setTopDistance(AsyncWebServerRequest *request) {
    AsyncWebParameter* p = request->getParam(0);
    int distance = p->value().toInt();
    Serial.println("Setting distance");
    movement->setTopDistance(distance); 
    manager->setPhase(PhaseManager::ExtendToHome);
    manager->respondWithState(request);
}

const char* SetTopDistancePhase::getName() {
    return "SetTopDistance";
}