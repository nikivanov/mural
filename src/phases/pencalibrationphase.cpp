#include "pencalibrationphase.h"
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
    manager->setPhase(PhaseManager::BeginDrawing);
    manager->respondWithState(request);
}

const char* PenCalibrationPhase::getName() {
    return "PenCalibration";
}