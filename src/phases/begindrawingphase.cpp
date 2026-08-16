#include "begindrawingphase.h"
BeginDrawingPhase::BeginDrawingPhase(PhaseManager* manager, Runner* runner, AsyncWebServer* server) {
    this->manager = manager;
    this->runner = runner;
    this->server = server;
}

void BeginDrawingPhase::run(AsyncWebServerRequest *request) {
    if (!runner->start()) {
        request->send(400, "text/plain", "Not ready");
        return;
    }
    request->send(200, "text/plain", "OK");
    server->end();
}

void BeginDrawingPhase::doneWithPhase(AsyncWebServerRequest *request) {
    manager->reset();
    manager->respondWithState(request);
}

const char* BeginDrawingPhase::getName() {
    return "BeginDrawing";
}