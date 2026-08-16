#include "drawingphase.h"

DrawingPhase::DrawingPhase(PhaseManager* manager, Runner* runner) {
    this->manager = manager;
    this->runner = runner;
}

void DrawingPhase::pauseDrawing(AsyncWebServerRequest *request) {
    if (runner->isPaused()) {
        request->send(400, "text/plain", "Already paused");
        return;
    }
    runner->pause();
    request->send(200, "text/plain", "OK");
}

void DrawingPhase::resumeDrawing(AsyncWebServerRequest *request) {
    if (!runner->isPaused()) {
        request->send(400, "text/plain", "Not paused");
        return;
    }
    runner->resumeRun();
    request->send(200, "text/plain", "OK");
}

const char* DrawingPhase::getName() {
    return "Drawing";
}
