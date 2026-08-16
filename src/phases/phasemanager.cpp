#include "phasemanager.h"
#include "retractbeltsphase.h"
#include "settopdistancephase.h"
#include "extendtohomephase.h"
#include "pencalibrationphase.h"
#include "svgselectphase.h"
#include "begindrawingphase.h"
#include "drawingphase.h"
#include "resumedrawingphase.h"
#include "AsyncJson.h"
#include "ArduinoJson.h"
#include "../prefskeys.h"
#include <Preferences.h>
#include <LittleFS.h>
#include <stdexcept>

PhaseManager::PhaseManager(Movement* movement, Pen* pen, Runner* runner) {
    retractBeltsPhase = new RetractBeltsPhase(this, movement);
    setTopDistancePhase = new SetTopDistancePhase(this, movement, pen);
    extendToHomePhase = new ExtendToHomePhase(this, movement, runner);
    penCalibrationPhase = new PenCalibrationPhase(this, pen);
    svgSelectPhase = new SvgSelectPhase(this);
    beginDrawingPhase = new BeginDrawingPhase(this, runner);
    drawingPhase = new DrawingPhase(this, runner);
    resumeDrawingPhase = new ResumeDrawingPhase(this, movement, pen);

    this->movement = movement;
    reset();
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
        case PhaseNames::Drawing:
            Serial.println("Drawing");
            currentPhase = drawingPhase;
            break;
        case PhaseNames::ResumeDrawing:
            Serial.println("ResumeDrawing");
            currentPhase = resumeDrawingPhase;
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
    double widthValue;
    auto safeWidth = movement->getWidth(widthValue) ? widthValue : -1;

    // Values persisted in NVS survive firmware restarts even though the
    // in-memory movement/pen state above does not. Exposing them separately
    // lets the UI prefill the distance input and pen slider with the last
    // known-good calibration instead of forcing the user to redo it.
    Preferences prefs;
    prefs.begin(PREFS_NAMESPACE, true);
    int storedTopDistance = prefs.getInt(PREFS_TOP_DISTANCE_KEY, -1);
    int storedPenAngle = prefs.getInt(PREFS_PEN_ANGLE_KEY, -1);
    prefs.end();

    // While a resume-after-power-loss offer is pending/in-progress (see reset()),
    // let the UI show what fraction of the job was already completed.
    int resumePercent = -1;
    if (resuming) {
        int totalLines = Runner::countTotalCommandLines();
        resumePercent = totalLines > 0 ? (pendingCheckpoint.executedLines * 100) / totalLines : 0;
        if (resumePercent > 100) {
            resumePercent = 100;
        }
    }

    AsyncResponseStream *response = request->beginResponseStream("application/json");
    DynamicJsonBuffer jsonBuffer;
    JsonObject &root = jsonBuffer.createObject();

    root["phase"] = currentPhase;
    root["moving"] = moving;
    root["topDistance"] = topDistance;
    root["safeWidth"] = safeWidth;
    root["homeX"] = homePosition.x;
    root["homeY"] = homePosition.y;
    root["storedTopDistance"] = storedTopDistance;
    root["storedPenAngle"] = storedPenAngle;
    root["uploadCrc32"] = svgSelectPhase->getUploadCrc32();
    root["resuming"] = resuming;
    root["resumePercent"] = resumePercent;

    root.printTo(*response);
    request->send(response);
}

void PhaseManager::reset() {
    Runner::Checkpoint cp;
    if (Runner::loadCheckpoint(cp) && LittleFS.exists("/commands")) {
        pendingCheckpoint = cp;
        resuming = true;
        setPhase(PhaseManager::ResumeDrawing);
    } else {
        resuming = false;
        setPhase(PhaseManager::SetTopDistance);
    }
}

bool PhaseManager::isResuming() {
    return resuming;
}

Runner::Checkpoint PhaseManager::getPendingCheckpoint() {
    return pendingCheckpoint;
}

void PhaseManager::clearResuming() {
    resuming = false;
}
