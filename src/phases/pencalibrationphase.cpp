#include "pencalibrationphase.h"

PenCalibrationPhase::PenCalibrationPhase(PhaseManager* manager, Pen* pen, Movement* movement, Display* display) {
    this->manager = manager;
    this->pen = pen;
    this->movement = movement;
    this->display = display;
}

constexpr double PEN_CAL_STEP_MM = 100.0;

void PenCalibrationPhase::handleCommand(AsyncWebServerRequest *request) {
    String command = request->arg("command");
    if (command != "raise" && command != "lower") {
        request->send(400, "text/plain", "Unsupported command");
        return;
    }

    if (movement->isMoving()) {
        request->send(200, "text/plain", "0");
        return;
    }

    try {
        Movement::Point current = movement->getCoordinates();
        double delta = (command == "raise") ? -PEN_CAL_STEP_MM : PEN_CAL_STEP_MM;
        double newY = current.y + delta;

        if (newY < 0) {
            request->send(200, "text/plain", "0");
            return;
        }

        Serial.printf("Moving pen calibration to %.1f, %.1f\n", current.x, newY);
        auto moveTime = movement->beginLinearTravel(current.x, newY, printSpeedSteps);
        display->showCalibration(current.x, newY);
        request->send(200, "text/plain", String(int(ceil(moveTime)) + 1));
    } catch (...) {
        request->send(500, "text/plain", "Movement error");
    }
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
