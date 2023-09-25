#include "retractbeltsphase.h"
RetractBeltsPhase::RetractBeltsPhase(PhaseManager* manager, Movement* movement, Pen* pen) {
    this->manager = manager;
    this->movement = movement;
    this->pen = pen;
}

void RetractBeltsPhase::handleCommand(AsyncWebServerRequest *request) {
    auto command = request->arg("command");
    if (command == "l-ret")
    {
        movement->leftStepper(-1);
    }
    else if (command == "l-ext")
    {
        movement->leftStepper(1);
    }
    else if (command == "l-0")
    {
        movement->leftStepper(0);
    }
    else if (command == "r-ret")
    {
        movement->rightStepper(-1);
    }
    else if (command == "r-ext")
    {
        movement->rightStepper(1);
    }
    else if (command == "r-0")
    {
        movement->rightStepper(0);
    }
    else {
        request->send(400, "text/plain", "Unsupported command");    
        return;
    }

    request->send(200, "text/plain", "OK");
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
    manager->setPhase(PhaseManager::SetTopDistance);
    request->send(200, "text/plain", "OK");
}

const char* RetractBeltsPhase::getName() {
    return "RetractBelts";
}