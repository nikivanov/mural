#include "phasemanager.h"
#include "resumeorstartoverphase.h"
#include "retractbeltsphase.h"
#include "settopdistancephase.h"
#include "extendtohomephase.h"
#include "pencalibrationphase.h"
#include "svgselectphase.h"
#include "distancestate.h"
#include "AsyncJson.h"
#include "ArduinoJson.h"
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
    Serial.print("Switching current phase to ");
    switch (name) {
        case PhaseNames::ResumeOrStartOver:
            Serial.println("ResumeOrStartOver");
            currentPhase = resumeOrStartOverPhase;
            break;
        case PhaseNames::RetractBelts:
            Serial.println("RetractBelts");
            currentPhase = retractBeltsPhase;
            break;
        case PhaseNames::SetTopDistance:
            Serial.println("SetTopDistance");
            currentPhase = setTopDistancePhase;
            break;
        case PhaseNames::ExtendToHome:
            Serial.println("ExtendToHome");
            currentPhase = extendToHomePhase;
            break;
        case PhaseNames::PenCalibration:
            Serial.println("PenCalibration");
            currentPhase = penCalibrationPhase;
            break;
        case PhaseNames::SvgSelect:
            Serial.println("SvgSelect");
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
    auto homePosition = movement->getHomeCoordinates();

    auto topDistance = movement->getTopDistance();
    auto safeWidth = topDistance != -1 ? movement->getWidth() : -1;

    AsyncResponseStream *response = request->beginResponseStream("application/json");
    DynamicJsonBuffer jsonBuffer;
    JsonObject &root = jsonBuffer.createObject();

    root["phase"] = currentPhase;
    root["resumeDistance"] = resumeDistance;
    root["moving"] = moving;
    root["topDistance"] = topDistance;
    root["safeWidth"] = safeWidth;
    root["homeX"] = homePosition.x;
    root["homeY"] = homePosition.y;

    root.printTo(*response);
    request->send(response);
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