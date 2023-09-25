#include "pencalibrationphase.h"
PenCalibrationPhase::PenCalibrationPhase(PhaseManager* manager, Pen* pen) {
    this->manager = manager;
    this->pen = pen;
}

void PenCalibrationPhase::setServo(AsyncWebServerRequest *request) {
    AsyncWebParameter* p = request->getParam(0);
    int angle = p->value().toInt();
    pen->setRawValue(angle);
    request->send(200, "text/plain", "OK"); 
}

void PenCalibrationPhase::setPenDistance(AsyncWebServerRequest *request) {
    AsyncWebParameter* p = request->getParam(0);
    int angle = p->value().toInt();
    pen->setPenDistance(angle);
    pen->slowUp();
    manager->setPhase(PhaseManager::SvgSelect);
    request->send(200, "text/plain", "OK"); 
}

const char* PenCalibrationPhase::getName() {
    return "PenCalibration";
}