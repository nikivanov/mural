#include "resumeorstartoverphase.h"
#include "distancestate.h"

ResumeOrStartOverPhase::ResumeOrStartOverPhase(PhaseManager* manager, Movement* movement) {
    this->manager = manager;
    this->movement = movement;
}

void ResumeOrStartOverPhase::resumeTopDistance(AsyncWebServerRequest *request) {
    movement->resumeTopDistance(DistanceState::readStoredDistance());
    manager->setPhase(PhaseManager::PenCalibration);
    manager->respondWithState(request);
}

void ResumeOrStartOverPhase::doneWithPhase(AsyncWebServerRequest *request) {
    DistanceState::deleteStoredDistance();
    manager->setPhase(PhaseManager::RetractBelts);
    manager->respondWithState(request);
}

const char* ResumeOrStartOverPhase::getName() {
    return "ResumeOrStartOver";
}