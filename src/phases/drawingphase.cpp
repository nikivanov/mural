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
    if (runner->isAwaitingPenSwap()) {
        request->send(400, "text/plain", "Awaiting pen swap confirmation");
        return;
    }
    runner->pause();
    request->send(200, "text/plain", "OK");
}

void DrawingPhase::resumeDrawing(AsyncWebServerRequest *request) {
    if (runner->isAwaitingPenSwap()) {
        // Distinct flow (docs/multi-color.md sections 2-4) - use
        // /confirmPenSwap, not the generic manual pause/resume pair.
        request->send(400, "text/plain", "Awaiting pen swap confirmation - use /confirmPenSwap");
        return;
    }
    if (!runner->isPaused()) {
        request->send(400, "text/plain", "Not paused");
        return;
    }
    runner->resumeRun();
    request->send(200, "text/plain", "OK");
}

void DrawingPhase::setPenDistance(AsyncWebServerRequest *request) {
    if (!runner->isAwaitingPenSwap()) {
        request->send(400, "text/plain", "Not awaiting a pen swap");
        return;
    }

    const AsyncWebParameter* p = request->getParam(0);
    int angle = p->value().toInt();
    if (!runner->applyPenDistanceDuringSwap(angle)) {
        request->send(400, "text/plain", "Pen not ready");
        return;
    }
    request->send(200, "text/plain", "OK");
}

void DrawingPhase::confirmPenSwap(AsyncWebServerRequest *request) {
    if (!runner->confirmPenSwap()) {
        request->send(400, "text/plain", "No pen swap awaiting confirmation");
        return;
    }
    request->send(200, "text/plain", "OK");
}

const char* DrawingPhase::getName() {
    return "Drawing";
}
