#include "pencalibrationphase.h"

PenCalibrationPhase::PenCalibrationPhase(PhaseManager* manager, Pen* pen, Movement* movement, Display* display) {
    this->manager = manager;
    this->pen = pen;
    this->movement = movement;
    this->display = display;
    this->jogInitialized = false;
    this->jogX = 0.0;
    this->jogY = 0.0;
}

// max speed (37.4 mm/s) × update interval (0.1 s) ≈ 3.74 mm
constexpr double JOG_STEP_MM = 3.75;

void PenCalibrationPhase::handleCommand(AsyncWebServerRequest *request) {
    String command = request->arg("command");
    if (command != "jog") {
        request->send(400, "text/plain", "Unsupported command");
        return;
    }

    double vx = request->arg("vx").toDouble();
    double vy = request->arg("vy").toDouble();
    vx = max(-1.0, min(1.0, vx));
    vy = max(-1.0, min(1.0, vy));

    if (!jogInitialized) {
        Movement::Point home = movement->getHomeCoordinates();
        jogX = home.x;
        jogY = home.y;
        jogInitialized = true;
    }

    if (vx == 0.0 && vy == 0.0) {
        request->send(200, "text/plain", "OK");
        return;
    }

    double newX = jogX + vx * JOG_STEP_MM;
    double newY = jogY + vy * JOG_STEP_MM;

    double safeWidth = movement->getWidth();
    newX = max(0.0, min(safeWidth, newX));
    newY = max(0.0, newY);

    jogX = newX;
    jogY = newY;

    double magnitude = sqrt(vx * vx + vy * vy);
    int speed = (int)(min(1.0, magnitude) * moveSpeedSteps);

    try {
        Serial.printf("Jogging to %.1f, %.1f at speed %d\n", jogX, jogY, speed);
        movement->beginLinearTravel(jogX, jogY, speed);
        display->showCalibration(jogX, jogY);
    } catch (...) {
        request->send(500, "text/plain", "Movement error");
        return;
    }

    request->send(200, "text/plain", "OK");
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
