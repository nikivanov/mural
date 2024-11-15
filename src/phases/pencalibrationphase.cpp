#include "pencalibrationphase.h"
PenCalibrationPhase::PenCalibrationPhase(PhaseManager* manager, Pen* pen, Runner* runner, AsyncWebServer* server) {
    this->manager = manager;
    this->pen = pen;
    this->runner = runner;
    this->server = server;
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
    request->send(200, "text/plain", "OK");
}

const char* PenCalibrationPhase::getName() {
    return "PenCalibration";
}

void PenCalibrationPhase::run(AsyncWebServerRequest *request) {
    runner->start();
    request->send(200, "text/plain", "OK"); 
    server->end();
}