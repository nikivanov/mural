#include "pencalibrationphase.h"
#include "../prefskeys.h"
#include <Preferences.h>
PenCalibrationPhase::PenCalibrationPhase(PhaseManager* manager, Pen* pen) {
    this->manager = manager;
    this->pen = pen;
    this->runner = runner;
}

void PenCalibrationPhase::setServo(AsyncWebServerRequest *request) {
    const AsyncWebParameter* p = request->getParam(0);
    int angle = p->value().toInt();
    pen->setRawValue(angle);
    request->send(200, "text/plain", "OK"); 
}

void PenCalibrationPhase::setPenDistance(AsyncWebServerRequest *request) {
    const AsyncWebParameter* p = request->getParam(0);
    int angle = p->value().toInt();
    pen->setPenDistance(angle);
    pen->slowUp();

    // Persist so the value survives a firmware restart and can be used to
    // prefill the UI even though the in-memory Pen state resets.
    Preferences prefs;
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putInt(PREFS_PEN_ANGLE_KEY, angle);
    prefs.end();

    manager->setPhase(PhaseManager::BeginDrawing);
    manager->respondWithState(request);
}

const char* PenCalibrationPhase::getName() {
    return "PenCalibration";
}