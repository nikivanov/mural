#include "settopdistancephase.h"
#include "commandhandlingphase.h"
#include "../prefskeys.h"
#include <Preferences.h>
SetTopDistancePhase::SetTopDistancePhase(PhaseManager* manager, Movement* movement, Pen* pen) : CommandHandlingPhase(movement) {
    this->manager = manager;
    this->movement = movement;
    this->pen = pen;
}

void SetTopDistancePhase::setTopDistance(AsyncWebServerRequest *request) {
    const AsyncWebParameter* p = request->getParam(0);
    int distance = p->value().toInt();
    Serial.println("Setting distance");
    movement->setTopDistance(distance);

    // Persist so the value survives a firmware restart and can be used to
    // prefill the UI even though the in-memory Movement state resets.
    Preferences prefs;
    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putInt(PREFS_TOP_DISTANCE_KEY, distance);
    prefs.end();

    manager->setPhase(PhaseManager::SvgSelect);
    manager->respondWithState(request);
}

void SetTopDistancePhase::setServo(AsyncWebServerRequest *request) {
    const AsyncWebParameter* p = request->getParam(0);
    int angle = p->value().toInt();
    pen->setRawValue(angle);
    request->send(200, "text/plain", "OK"); 
}

void SetTopDistancePhase::estepsCalibration(AsyncWebServerRequest* request) {
    Serial.println("Extending 1000mm");
    movement->extend1000mm();
    request->send(200, "text/plain", "OK");
}

const char* SetTopDistancePhase::getName() {
    return "SetTopDistance";
}