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