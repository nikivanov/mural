#include "phasemanager.h"
#include "resumeorstartoverphase.h"
#include "retractbeltsphase.h"
#include "settopdistancephase.h"
#include "extendtohomephase.h"
#include "pencalibrationphase.h"
#include "svgselectphase.h"
#include "distancestate.h"
#include <stdexcept>
PhaseManager::PhaseManager(Movement* movement, Pen* pen, Runner* runner, AsyncWebServer* server) {
    resumeOrStartOverPhase = new ResumeOrStartOverPhase(this, movement);
    retractBeltsPhase = new RetractBeltsPhase(this, movement, pen);
    setTopDistancePhase = new SetTopDistancePhase(this, movement);
    extendToHomePhase = new ExtendToHomePhase(this, movement);
    penCalibrationPhase = new PenCalibrationPhase(this, pen);
    svgSelectPhase = new SvgSelectPhase(this, runner, server);

    this->movement = movement;
    _reset();
}

Phase* PhaseManager::getCurrentPhase() {
    return currentPhase;
}

void PhaseManager::setPhase(PhaseNames name) {
    switch (name) {
        case PhaseNames::ResumeOrStartOver:
            currentPhase = resumeOrStartOverPhase;
            break;
        case PhaseNames::RetractBelts:
            currentPhase = retractBeltsPhase;
            break;
        case PhaseNames::SetTopDistance:
            currentPhase = setTopDistancePhase;
            break;
        case PhaseNames::ExtendToHome:
            currentPhase = extendToHomePhase;
            break;
        case PhaseNames::PenCalibration:
            currentPhase = penCalibrationPhase;
            break;
        case PhaseNames::SvgSelect:
            currentPhase = svgSelectPhase;
            break;
        default:
            throw std::invalid_argument("Invalid Phase");
    }
}

void PhaseManager::respondWithState(AsyncWebServerRequest *request) {
    auto currentPhase = getCurrentPhase()->getName();
    auto resumeDistance = DistanceState::readStoredDistance();
    auto moving = movement->isMoving();
    auto movingBoolStr = moving ? "true" : "false";

    auto responseJsonTemplate = "{\"phase\": \"%s\", \"resumeDistance\": %i, \"moving\": %s}";
    
    char formattedString[1024];
    snprintf(formattedString, sizeof(formattedString), responseJsonTemplate, currentPhase, resumeDistance, movingBoolStr);
    request->send(200, "application/json", formattedString);
}

void PhaseManager::_reset() {
    if (DistanceState::readStoredDistance() == -1) {
        setPhase(PhaseManager::RetractBelts);
        Serial.println("Phase manager reset with Retract Belts as the first phase");
    } else {
        setPhase(PhaseManager::ResumeOrStartOver);
        Serial.println("Phase manager reset with Resume Or Start Over as the first phase");
    }
}

void PhaseManager::reset(AsyncWebServerRequest *request) {
    _reset();
    request->send(200, "text/plain", "OK");
}