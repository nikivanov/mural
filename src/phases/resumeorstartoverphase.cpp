#include "resumeorstartoverphase.h"
#include "distancestate.h"

ResumeOrStartOverPhase::ResumeOrStartOverPhase(PhaseManager* manager, Movement* movement) {
    this->movement = movement;
}

void ResumeOrStartOverPhase::resumeTopDistance(AsyncWebServerRequest *request) {
    movement->resumeTopDistance(DistanceState::readStoredDistance());
    manager->setPhase(PhaseManager::PenCalibration);
    request->send(200, "text/plain", "OK");
}

void ResumeOrStartOverPhase::doneWithPhase(AsyncWebServerRequest *request) {
    DistanceState::deleteStoredDistance();
    manager->setPhase(PhaseManager::RetractBelts);
    request->send(200, "text/plain", "OK");
}

const char* ResumeOrStartOverPhase::getName() {
    return "ResumeOrStartOver";
}