#include "retractbeltsphase.h"
#include "commandhandlingphase.h"
RetractBeltsPhase::RetractBeltsPhase(PhaseManager* manager, Movement* movement, Pen* pen) : CommandHandlingPhase(movement) {
    
    this->manager = manager;
    this->movement = movement;
    this->pen = pen;
}

void RetractBeltsPhase::setServo(AsyncWebServerRequest *request) {
    AsyncWebParameter* p = request->getParam(0);
    int angle = p->value().toInt();
    pen->setRawValue(angle);
    request->send(200, "text/plain", "OK");
}

void RetractBeltsPhase::estepsCalibration(AsyncWebServerRequest* request) {
    Serial.println("Extending 100mm");
    movement->extend100mm();
    request->send(200, "text/plain", "OK");
}

void RetractBeltsPhase::doneWithPhase(AsyncWebServerRequest *request) {
    manager->setPhase(PhaseManager::ExtendToHome);
    manager->respondWithState(request);
}

const char* RetractBeltsPhase::getName() {
    return "RetractBelts";
}