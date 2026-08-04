#include "phasemanager.h"
#include "SD.h"
#include "retractbeltsphase.h"
#include "settopdistancephase.h"
#include "extendtohomephase.h"
#include "pencalibrationphase.h"
#include "svgselectphase.h"
#include "begindrawingphase.h"
#include "AsyncJson.h"
#include "ArduinoJson.h"
#include <stdexcept>

PhaseManager::PhaseManager(Movement* movement, Pen* pen, Runner* runner, AsyncWebServer* server, Display* display) {
    retractBeltsPhase = new RetractBeltsPhase(this, movement);
    setTopDistancePhase = new SetTopDistancePhase(this, movement, pen);
    extendToHomePhase = new ExtendToHomePhase(this, movement);
    penCalibrationPhase = new PenCalibrationPhase(this, pen, movement, display);
    svgSelectPhase = new SvgSelectPhase(this);
    beginDrawingPhase = new BeginDrawingPhase(this, runner, server);

    this->movement = movement;
    this->display = display;
    reset();
    updateFreeKb();
}

void PhaseManager::updateFreeKb() {
    size_t free = SD.totalBytes() - SD.usedBytes();
    if (SD.exists("/commands")) {
        File f = SD.open("/commands");
        if (f) { free += f.size(); f.close(); }
    }
    Serial.printf("Free bytes: %d\n", free);
    cachedFreeKb = (int)(free / 1024);
    Serial.printf("Updated free KB: %d KB\n", cachedFreeKb);
}

Phase* PhaseManager::getCurrentPhase() {
    return currentPhase;
}

void PhaseManager::setPhase(PhaseNames name) {
    Serial.print("Switching current phase to ");
    switch (name) {
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
        case PhaseNames::BeginDrawing:
            Serial.println("BeginDrawing");
            currentPhase = beginDrawingPhase;
            break;
        default:
            throw std::invalid_argument("Invalid Phase");
    }
}

void PhaseManager::respondWithState(AsyncWebServerRequest *request) {
    auto currentPhase = getCurrentPhase()->getName();
    auto moving = movement->isMoving();
    auto startedHoming = movement->hasStartedHoming();
    auto homePosition = movement->getHomeCoordinates();

    auto topDistance = movement->getTopDistance();
    auto safeWidth = topDistance != -1 ? movement->getWidth() : -1;

    AsyncResponseStream *response = request->beginResponseStream("application/json");
    DynamicJsonBuffer jsonBuffer;
    JsonObject &root = jsonBuffer.createObject();

    root["phase"] = currentPhase;
    root["moving"] = moving;
    root["topDistance"] = topDistance;
    root["safeWidth"] = safeWidth;
    root["safeXFraction"] = safeXFraction;
    root["safeYFraction"] = safeYFraction;
    root["homeX"] = homePosition.x;
    root["homeY"] = homePosition.y;
    root["freeKb"] = cachedFreeKb;

    root.printTo(*response);
    request->send(response);
}

void PhaseManager::reset() {
    setPhase(PhaseManager::SetTopDistance);
}